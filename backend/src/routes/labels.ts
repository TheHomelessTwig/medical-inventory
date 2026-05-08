/**
 * Dispensing label PDF generation.
 *
 * GET /api/labels/fulfillment/:fulfillmentId   — PDF sheet for one fulfilment
 * GET /api/labels/request/:requestId           — PDF sheet for all fulfilments on a request
 */

import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../db';
import { authenticate } from '../middleware/auth';
import { buildLabelsPDF, LabelData } from '../utils/pdfLabels';

const router = Router();
router.use(authenticate);

async function getPracticeName(): Promise<string> {
  try {
    const r = await query(`SELECT practice_name FROM system_config WHERE id = 1`);
    return r.rows[0]?.practice_name ?? 'S.H.I.T.';
  } catch { return 'S.H.I.T.'; }
}

async function buildLabelsForFulfillment(fulfillmentId: string): Promise<LabelData[]> {
  const practice_name = await getPracticeName();

  const result = await query(`
    SELECT
      sfi.quantity_used, sfi.batch_number, sfi.expiry_date,
      i.name AS item_name, i.unit,
      sr.patient_name, sr.patient_ref,
      d.name  AS doctor_name,
      n.name  AS nurse_name,
      sf.completed_at
    FROM stock_fulfillment_items sfi
    JOIN stock_fulfillments sf   ON sfi.fulfillment_id = sf.id
    JOIN stock_requests sr       ON sf.request_id = sr.id
    JOIN inventory_items i       ON sfi.inventory_item_id = i.id
    JOIN users d                 ON sr.doctor_id = d.id
    JOIN users n                 ON sf.nurse_id  = n.id
    WHERE sfi.fulfillment_id = $1
    ORDER BY i.name
  `, [fulfillmentId]);

  return result.rows.map((r: {
    item_name: string; unit: string; quantity_used: number;
    batch_number: string; expiry_date: string;
    patient_name: string; patient_ref: string;
    doctor_name: string; nurse_name: string; completed_at: string;
  }) => ({
    practice_name,
    patient_name:  r.patient_name  || undefined,
    patient_ref:   r.patient_ref   || undefined,
    item_name:     r.item_name,
    unit:          r.unit,
    quantity:      parseFloat(String(r.quantity_used)),
    batch_number:  r.batch_number  || undefined,
    expiry_date:   r.expiry_date   ? String(r.expiry_date).slice(0, 10) : undefined,
    dispensed_by:  r.nurse_name,
    doctor_name:   r.doctor_name,
    dispensed_at:  String(r.completed_at),
  }));
}

// GET /api/labels/fulfillment/:id
router.get('/fulfillment/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const labels = await buildLabelsForFulfillment(req.params.id);
    if (labels.length === 0) { res.status(404).json({ error: 'Fulfilment not found or has no items' }); return; }
    const pdf = await buildLabelsPDF(labels);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="labels_${req.params.id.slice(0, 8)}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
});

// GET /api/labels/request/:id — all fulfilments for a request
router.get('/request/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const fulfilments = await query(
      `SELECT id FROM stock_fulfillments WHERE request_id = $1 ORDER BY completed_at`,
      [req.params.id]
    );
    if (fulfilments.rows.length === 0) { res.status(404).json({ error: 'No fulfilments found for this request' }); return; }

    const allLabels: LabelData[] = [];
    for (const f of fulfilments.rows) {
      allLabels.push(...await buildLabelsForFulfillment(f.id));
    }
    if (allLabels.length === 0) { res.status(404).json({ error: 'No dispensed items found' }); return; }

    const pdf = await buildLabelsPDF(allLabels);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="labels_request_${req.params.id.slice(0, 8)}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
});

export default router;
