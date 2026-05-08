import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { logAudit, getClientInfo } from '../utils/audit';
import { createError } from '../middleware/errorHandler';
import { emailNewRequest, emailRequestFulfilled, emailQuickCharge } from '../utils/email';

const router = Router();
router.use(authenticate);

const createRequestSchema = z.object({
  patient_name: z.string().max(255).optional().nullable(),
  patient_ref: z.string().max(100).optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  notes: z.string().optional().nullable(),
  items: z.array(z.object({
    inventory_item_id: z.string().uuid(),
    quantity_requested: z.number().positive(),
    notes: z.string().optional().nullable(),
  })).min(1),
});

const fulfillSchema = z.object({
  notes: z.string().optional().nullable(),
  items: z.array(z.object({
    request_item_id: z.string().uuid().optional().nullable(),
    inventory_item_id: z.string().uuid(),
    batch_id: z.string().uuid().optional().nullable(),
    quantity_used: z.number().positive(),
    batch_number: z.string().optional().nullable(),
    lot_number: z.string().optional().nullable(),
    expiry_date: z.string().optional().nullable(),
    internal_price: z.number().min(0).optional().nullable(),
    is_substitution: z.boolean().default(false),
    substitution_reason: z.string().optional().nullable(),
  })).min(1),
});

// GET /api/requests
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, page = '1', limit = '50', since } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    // Doctors only see their own requests
    if (req.user!.role === 'doctor') {
      conditions.push(`sr.doctor_id = $${p++}`);
      params.push(req.user!.id);
    }

    if (status) {
      conditions.push(`sr.status = $${p++}`);
      params.push(status);
    }

    // Notification polling: only return rows newer than this timestamp
    if (since) {
      conditions.push(`sr.created_at > $${p++}`);
      params.push(since);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(`SELECT COUNT(*) FROM stock_requests sr ${where}`, params);

    const result = await query(`
      SELECT
        sr.*,
        u.name as doctor_name,
        a.name as accepted_by_name,
        COUNT(sri.id) as item_count,
        (SELECT COUNT(*) FROM stock_fulfillments sf WHERE sf.request_id = sr.id) as fulfillment_count
      FROM stock_requests sr
      JOIN users u ON sr.doctor_id = u.id
      LEFT JOIN users a ON sr.accepted_by = a.id
      LEFT JOIN stock_request_items sri ON sri.request_id = sr.id
      ${where}
      GROUP BY sr.id, u.name, a.name
      ORDER BY
        CASE sr.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
        sr.created_at DESC
      LIMIT $${p} OFFSET $${p + 1}
    `, [...params, limitNum, offset]);

    res.json({
      requests: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(parseInt(countResult.rows[0].count) / limitNum),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/requests/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(`
      SELECT
        sr.*,
        u.name as doctor_name, u.email as doctor_email,
        a.name as accepted_by_name
      FROM stock_requests sr
      JOIN users u ON sr.doctor_id = u.id
      LEFT JOIN users a ON sr.accepted_by = a.id
      WHERE sr.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    const request = result.rows[0];

    // Doctors can only view their own requests
    if (req.user!.role === 'doctor' && request.doctor_id !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const items = await query(`
      SELECT sri.*, i.name as item_name, i.unit, i.internal_price, i.quantity_on_hand,
             c.name as category_name
      FROM stock_request_items sri
      JOIN inventory_items i ON sri.inventory_item_id = i.id
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE sri.request_id = $1
    `, [req.params.id]);

    const fulfillments = await query(`
      SELECT sf.*, u.name as nurse_name
      FROM stock_fulfillments sf
      JOIN users u ON sf.nurse_id = u.id
      WHERE sf.request_id = $1
      ORDER BY sf.completed_at DESC
    `, [req.params.id]);

    for (const f of fulfillments.rows) {
      const fItems = await query(`
        SELECT sfi.*, i.name as item_name, i.unit
        FROM stock_fulfillment_items sfi
        JOIN inventory_items i ON sfi.inventory_item_id = i.id
        WHERE sfi.fulfillment_id = $1
      `, [f.id]);
      f.items = fItems.rows;
    }

    res.json({ ...request, items: items.rows, fulfillments: fulfillments.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/requests
router.post('/', requireRole('doctor', 'admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = createRequestSchema.parse(req.body);

    const requestNumber = await withTransaction(async (client) => {
      const seqResult = await client.query(`SELECT nextval('request_number_seq') as seq`);
      const requestNum = `REQ-${String(seqResult.rows[0].seq).padStart(6, '0')}`;

      const requestResult = await client.query(`
        INSERT INTO stock_requests
          (request_number, doctor_id, patient_name, patient_ref, priority, notes)
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING id
      `, [
        requestNum,
        req.user!.id,
        body.patient_name,
        body.patient_ref,
        body.priority,
        body.notes,
      ]);

      const requestId = requestResult.rows[0].id;

      for (const item of body.items) {
        await client.query(`
          INSERT INTO stock_request_items (request_id, inventory_item_id, quantity_requested, notes)
          VALUES ($1,$2,$3,$4)
        `, [requestId, item.inventory_item_id, item.quantity_requested, item.notes]);

        // Reserve stock
        await client.query(`
          UPDATE inventory_items
          SET quantity_reserved = quantity_reserved + $1
          WHERE id = $2
        `, [item.quantity_requested, item.inventory_item_id]);
      }

      const { ipAddress, userAgent } = getClientInfo(req);
      await logAudit({
        user: req.user,
        action: 'REQUEST_CREATED',
        entityType: 'stock_request',
        entityId: requestId,
        entityName: requestNum,
        newValues: body,
        ipAddress,
        userAgent,
      }, client);

      return requestNum;
    });

    const newRequest = await query(
      'SELECT * FROM stock_requests WHERE request_number = $1', [requestNumber]
    );

    // Email all active nurses
    const nurses = await query(`SELECT email FROM users WHERE role='nurse' AND is_active=true`);
    const nurseEmails = nurses.rows.map((r: { email: string }) => r.email);
    if (nurseEmails.length > 0) {
      emailNewRequest({
        nurseEmails,
        requestNumber,
        doctorName: req.user!.name,
        patientName: body.patient_name ?? undefined,
        priority: body.priority,
        itemCount: body.items.length,
      });
    }

    res.status(201).json(newRequest.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    next(err);
  }
});

// PUT /api/requests/:id/accept
router.put('/:id/accept', requireRole('nurse', 'admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query(
      `UPDATE stock_requests
       SET status = 'accepted', accepted_by = $1, accepted_at = NOW()
       WHERE id = $2 AND status = 'pending'
       RETURNING *`,
      [req.user!.id, req.params.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Request not found or not in pending state' });
      return;
    }

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({
      user: req.user,
      action: 'REQUEST_ACCEPTED',
      entityType: 'stock_request',
      entityId: req.params.id,
      entityName: result.rows[0].request_number,
      ipAddress,
      userAgent,
    });

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/requests/:id/fulfill
router.post('/:id/fulfill', requireRole('nurse', 'admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = fulfillSchema.parse(req.body);

    const fulfillmentData = await withTransaction(async (client) => {
      const reqResult = await client.query(
        `SELECT * FROM stock_requests WHERE id = $1 AND status IN ('pending', 'accepted', 'in_progress') FOR UPDATE`,
        [req.params.id]
      );
      if (reqResult.rows.length === 0) {
        throw createError('Request not found or already fulfilled/cancelled', 404);
      }

      const seqResult = await client.query(`SELECT nextval('fulfillment_number_seq') as seq`);
      const fulfillmentNum = `FUL-${String(seqResult.rows[0].seq).padStart(6, '0')}`;

      let totalCharge = 0;
      const fulfillmentItems = [];

      for (const item of body.items) {
        // Lock and check stock
        const stockResult = await client.query(
          `SELECT quantity_on_hand, name, internal_price FROM inventory_items WHERE id = $1 FOR UPDATE`,
          [item.inventory_item_id]
        );
        if (stockResult.rows.length === 0) throw createError(`Item not found: ${item.inventory_item_id}`, 404);

        const stock = stockResult.rows[0];
        const price = item.internal_price ?? parseFloat(stock.internal_price ?? '0');
        const lineCharge = price * item.quantity_used;
        totalCharge += lineCharge;

        // Deduct stock
        await client.query(
          `UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - $1 WHERE id = $2`,
          [item.quantity_used, item.inventory_item_id]
        );

        // Update batch if specified
        if (item.batch_id) {
          await client.query(
            `UPDATE inventory_batches SET quantity = quantity - $1 WHERE id = $2 AND quantity >= $1`,
            [item.quantity_used, item.batch_id]
          );
        }

        // Release reserved quantity (for request items that were reserved)
        if (item.request_item_id) {
          const reqItem = await client.query(
            'SELECT quantity_requested FROM stock_request_items WHERE id = $1',
            [item.request_item_id]
          );
          if (reqItem.rows.length > 0) {
            await client.query(
              `UPDATE inventory_items SET quantity_reserved = GREATEST(0, quantity_reserved - $1) WHERE id = $2`,
              [reqItem.rows[0].quantity_requested, item.inventory_item_id]
            );
          }
        }

        fulfillmentItems.push({ ...item, price, lineCharge });

        // Stock adjustment record
        await client.query(`
          INSERT INTO stock_adjustments
            (inventory_item_id, batch_id, adjusted_by, adjustment_type,
             quantity_change, reason, reference_type)
          VALUES ($1,$2,$3,'decrease',$4,$5,'fulfillment')
        `, [
          item.inventory_item_id, item.batch_id, req.user!.id,
          -item.quantity_used, `Fulfilled request ${reqResult.rows[0].request_number}`,
        ]);
      }

      // Create fulfillment record
      const fulfillResult = await client.query(`
        INSERT INTO stock_fulfillments (request_id, nurse_id, fulfillment_number, total_charge, notes)
        VALUES ($1,$2,$3,$4,$5)
        RETURNING id
      `, [req.params.id, req.user!.id, fulfillmentNum, totalCharge, body.notes]);

      const fulfillmentId = fulfillResult.rows[0].id;

      for (const item of fulfillmentItems) {
        await client.query(`
          INSERT INTO stock_fulfillment_items
            (fulfillment_id, request_item_id, inventory_item_id, batch_id,
             quantity_used, batch_number, lot_number, expiry_date,
             internal_price, total_charge, is_substitution, substitution_reason)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `, [
          fulfillmentId, item.request_item_id, item.inventory_item_id, item.batch_id,
          item.quantity_used, item.batch_number, item.lot_number, item.expiry_date,
          item.price, item.lineCharge, item.is_substitution, item.substitution_reason,
        ]);
      }

      // Update request status
      await client.query(
        `UPDATE stock_requests SET status = 'fulfilled' WHERE id = $1`,
        [req.params.id]
      );

      const { ipAddress, userAgent } = getClientInfo(req);
      await logAudit({
        user: req.user,
        action: 'REQUEST_FULFILLED',
        entityType: 'stock_request',
        entityId: req.params.id,
        entityName: reqResult.rows[0].request_number,
        newValues: { fulfillment_number: fulfillmentNum, total_charge: totalCharge },
        ipAddress,
        userAgent,
      }, client);

      return fulfillmentNum;
    });

    const fulfillment = await query(
      `SELECT sf.*, u.name as nurse_name,
              sr.doctor_id, du.email as doctor_email,
              (SELECT json_agg(json_build_object('item_name',i.name,'quantity_used',sfi.quantity_used,'unit',i.unit))
               FROM stock_fulfillment_items sfi JOIN inventory_items i ON sfi.inventory_item_id=i.id
               WHERE sfi.fulfillment_id = sf.id) as items
       FROM stock_fulfillments sf
       JOIN users u ON sf.nurse_id = u.id
       JOIN stock_requests sr ON sf.request_id = sr.id
       JOIN users du ON sr.doctor_id = du.id
       WHERE sf.fulfillment_number = $1`,
      [fulfillmentData]
    );

    if (fulfillment.rows[0]?.doctor_email) {
      emailRequestFulfilled({
        doctorEmail: fulfillment.rows[0].doctor_email,
        requestNumber: req.params.id,
        nurseName: fulfillment.rows[0].nurse_name,
        totalCharge: parseFloat(fulfillment.rows[0].total_charge || '0'),
        items: fulfillment.rows[0].items || [],
      });
    }

    res.status(201).json(fulfillment.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    next(err);
  }
});

// PUT /api/requests/:id/cancel
router.put('/:id/cancel', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { reason } = req.body;

    await withTransaction(async (client) => {
      const reqResult = await client.query(
        `SELECT * FROM stock_requests WHERE id = $1 AND status IN ('pending', 'accepted') FOR UPDATE`,
        [req.params.id]
      );
      if (reqResult.rows.length === 0) throw createError('Request not found or cannot be cancelled', 404);

      // Only doctor who created it or admin can cancel
      const req_data = reqResult.rows[0];
      if (req.user!.role === 'nurse') {
        throw createError('Nurses cannot cancel requests', 403);
      }
      if (req.user!.role === 'doctor' && req_data.doctor_id !== req.user!.id) {
        throw createError('Can only cancel your own requests', 403);
      }

      await client.query(
        `UPDATE stock_requests
         SET status = 'cancelled', cancelled_by = $1, cancelled_at = NOW(), cancellation_reason = $2
         WHERE id = $3`,
        [req.user!.id, reason, req.params.id]
      );

      // Release reserved stock
      const items = await client.query(
        'SELECT * FROM stock_request_items WHERE request_id = $1',
        [req.params.id]
      );
      for (const item of items.rows) {
        await client.query(
          `UPDATE inventory_items SET quantity_reserved = GREATEST(0, quantity_reserved - $1) WHERE id = $2`,
          [item.quantity_requested, item.inventory_item_id]
        );
      }

      const { ipAddress, userAgent } = getClientInfo(req);
      await logAudit({
        user: req.user,
        action: 'REQUEST_CANCELLED',
        entityType: 'stock_request',
        entityId: req.params.id,
        entityName: req_data.request_number,
        newValues: { reason },
        ipAddress,
        userAgent,
      }, client);
    });

    res.json({ message: 'Request cancelled' });
  } catch (err) {
    next(err);
  }
});

// POST /api/requests/quick-charge
// Nurse-initiated: creates a fulfilled request + fulfillment in one step
const quickChargeSchema = z.object({
  doctor_id: z.string().uuid(),
  patient_name: z.string().max(255).optional().nullable(),
  patient_ref: z.string().max(100).optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(z.object({
    inventory_item_id: z.string().uuid(),
    quantity_used: z.number().positive(),
  })).min(1),
});

router.post('/quick-charge', requireRole('nurse', 'admin'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = quickChargeSchema.parse(req.body);

    // Verify doctor exists
    const doctorResult = await query(`SELECT id, name FROM users WHERE id = $1 AND role = 'doctor' AND is_active = true`, [body.doctor_id]);
    if (doctorResult.rows.length === 0) {
      res.status(400).json({ error: 'Doctor not found' });
      return;
    }

    const result = await withTransaction(async (client) => {
      // Create request number
      const seqReq = await client.query(`SELECT nextval('request_number_seq') as seq`);
      const requestNum = `QC-${String(seqReq.rows[0].seq).padStart(6, '0')}`;

      // Create fulfilled request
      const requestResult = await client.query(`
        INSERT INTO stock_requests
          (request_number, doctor_id, patient_name, patient_ref, status,
           is_quick_charge, initiated_by, notes)
        VALUES ($1,$2,$3,$4,'fulfilled',true,$5,$6)
        RETURNING id, request_number
      `, [requestNum, body.doctor_id, body.patient_name, body.patient_ref, req.user!.id, body.notes]);

      const requestId = requestResult.rows[0].id;

      // Create fulfillment number
      const seqFul = await client.query(`SELECT nextval('fulfillment_number_seq') as seq`);
      const fulfillNum = `FUL-${String(seqFul.rows[0].seq).padStart(6, '0')}`;

      let totalCharge = 0;
      const lineItems: Array<{ inventory_item_id: string; quantity_used: number; price: number; lineCharge: number }> = [];

      for (const item of body.items) {
        // Lock item row
        const stockResult = await client.query(
          `SELECT id, name, quantity_on_hand, internal_price FROM inventory_items WHERE id = $1 AND is_active = true FOR UPDATE`,
          [item.inventory_item_id]
        );
        if (stockResult.rows.length === 0) throw createError(`Item not found: ${item.inventory_item_id}`, 404);

        const stock = stockResult.rows[0];
        const price = parseFloat(stock.internal_price ?? '0');
        const lineCharge = price * item.quantity_used;
        totalCharge += lineCharge;

        // Insert request item
        await client.query(
          `INSERT INTO stock_request_items (request_id, inventory_item_id, quantity_requested) VALUES ($1,$2,$3)`,
          [requestId, item.inventory_item_id, item.quantity_used]
        );

        // Deduct stock
        await client.query(
          `UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - $1 WHERE id = $2`,
          [item.quantity_used, item.inventory_item_id]
        );

        // Adjustment record
        await client.query(`
          INSERT INTO stock_adjustments
            (inventory_item_id, adjusted_by, adjustment_type, quantity_change, reason, reference_type)
          VALUES ($1,$2,'decrease',$3,$4,'quick_charge')
        `, [item.inventory_item_id, req.user!.id, -item.quantity_used, `Quick charge ${requestNum}`]);

        lineItems.push({ inventory_item_id: item.inventory_item_id, quantity_used: item.quantity_used, price, lineCharge });
      }

      // Create fulfillment
      const fulfillResult = await client.query(`
        INSERT INTO stock_fulfillments (request_id, nurse_id, fulfillment_number, total_charge, notes)
        VALUES ($1,$2,$3,$4,$5)
        RETURNING id
      `, [requestId, req.user!.id, fulfillNum, totalCharge, body.notes]);

      const fulfillmentId = fulfillResult.rows[0].id;

      // Create fulfillment items
      for (const li of lineItems) {
        await client.query(`
          INSERT INTO stock_fulfillment_items
            (fulfillment_id, inventory_item_id, quantity_used, internal_price, total_charge)
          VALUES ($1,$2,$3,$4,$5)
        `, [fulfillmentId, li.inventory_item_id, li.quantity_used, li.price, li.lineCharge]);
      }

      const { ipAddress, userAgent } = getClientInfo(req);
      await logAudit({
        user: req.user,
        action: 'QUICK_CHARGE_CREATED',
        entityType: 'stock_request',
        entityId: requestId,
        entityName: requestNum,
        newValues: { doctor_id: body.doctor_id, total_charge: totalCharge, item_count: body.items.length },
        ipAddress,
        userAgent,
      }, client);

      return { requestId, requestNum, fulfillNum, totalCharge };
    });

    // Email the doctor
    const doc = await query(`SELECT email FROM users WHERE id=$1`, [body.doctor_id]);
    if (doc.rows[0]?.email) {
      emailQuickCharge({
        doctorEmail: doc.rows[0].email,
        requestNum: result.requestNum,
        nurseName: req.user!.name,
        patientName: body.patient_name ?? undefined,
        totalCharge: result.totalCharge,
      });
    }

    res.status(201).json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    next(err);
  }
});

// GET /api/requests/patient-ledger?patient_ref=X — all charges for a patient
router.get('/patient-ledger', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const ref = (req.query.patient_ref as string || '').trim();
    if (ref.length < 2) { res.status(400).json({ error: 'patient_ref must be at least 2 characters' }); return; }

    const result = await query(`
      SELECT
        sr.id, sr.request_number, sr.patient_name, sr.patient_ref,
        sr.status, sr.created_at, sr.is_quick_charge,
        u.name as doctor_name,
        COALESCE(SUM(sf.total_charge), 0) as total_charge,
        COUNT(DISTINCT sf.id) as fulfillment_count,
        json_agg(DISTINCT jsonb_build_object(
          'fulfillment_number', sf.fulfillment_number,
          'nurse_name', nu.name,
          'total_charge', sf.total_charge,
          'completed_at', sf.completed_at
        )) FILTER (WHERE sf.id IS NOT NULL) as fulfillments
      FROM stock_requests sr
      JOIN users u ON sr.doctor_id = u.id
      LEFT JOIN stock_fulfillments sf ON sf.request_id = sr.id
      LEFT JOIN users nu ON sf.nurse_id = nu.id
      WHERE sr.patient_ref ILIKE $1 AND sr.patient_ref IS NOT NULL
      GROUP BY sr.id, sr.request_number, sr.patient_name, sr.patient_ref, sr.status, sr.created_at, sr.is_quick_charge, u.name
      ORDER BY sr.created_at DESC
    `, [`%${ref}%`]);

    const totals = result.rows.reduce((acc: { charges: number; requests: number }, r: { total_charge: string }) => ({
      charges: acc.charges + parseFloat(r.total_charge || '0'),
      requests: acc.requests + 1,
    }), { charges: 0, requests: 0 });

    res.json({ requests: result.rows, totals });
  } catch (err) { next(err); }
});

// GET /api/requests/:id/receipt
router.get('/:id/receipt', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const request = await query(`
      SELECT sr.*, u.name as doctor_name, u.email as doctor_email
      FROM stock_requests sr
      JOIN users u ON sr.doctor_id = u.id
      WHERE sr.id = $1
    `, [req.params.id]);

    if (request.rows.length === 0) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    if (req.user!.role === 'doctor' && request.rows[0].doctor_id !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const fulfillments = await query(`
      SELECT sf.*, u.name as nurse_name
      FROM stock_fulfillments sf
      JOIN users u ON sf.nurse_id = u.id
      WHERE sf.request_id = $1
    `, [req.params.id]);

    for (const f of fulfillments.rows) {
      const items = await query(`
        SELECT sfi.*, i.name as item_name, i.unit, i.sku
        FROM stock_fulfillment_items sfi
        JOIN inventory_items i ON sfi.inventory_item_id = i.id
        WHERE sfi.fulfillment_id = $1
      `, [f.id]);
      f.items = items.rows;
    }

    res.json({
      request: request.rows[0],
      fulfillments: fulfillments.rows,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
