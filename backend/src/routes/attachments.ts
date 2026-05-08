/**
 * File attachments for invoices, supplier returns, and purchase orders.
 *
 * POST   /api/attachments/:entityType/:entityId  — upload (multipart/form-data, field "file")
 * GET    /api/attachments/:entityType/:entityId  — list attachments for an entity
 * GET    /api/attachments/file/:id               — stream / download file
 * DELETE /api/attachments/:id                    — delete (admin/manager)
 */

import path from 'path';
import fs from 'fs';
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db';
import { authenticate, requireAdminOrManager } from '../middleware/auth';
import { logAudit, getClientInfo } from '../utils/audit';

const router = Router();
router.use(authenticate);

// Upload directory — resolved from UPLOAD_DIR env (defaults to /uploads in container)
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/uploads';
if (!fs.existsSync(UPLOAD_DIR)) {
  try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch { /* container may not have it yet */ }
}

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, _file, cb) => cb(null, `${uuidv4()}${path.extname(_file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`File type ${file.mimetype} is not allowed`));
  },
});

const ALLOWED_ENTITY_TYPES = ['invoice', 'return', 'purchase_order'];

// POST /api/attachments/:entityType/:entityId
router.post('/:entityType/:entityId', upload.single('file'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { entityType, entityId } = req.params;
    if (!ALLOWED_ENTITY_TYPES.includes(entityType)) {
      res.status(400).json({ error: 'Invalid entity type' }); return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' }); return;
    }

    const result = await query(`
      INSERT INTO attachments (entity_type, entity_id, filename, stored_name, mime_type, size_bytes, uploaded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [entityType, entityId, req.file.originalname, req.file.filename,
        req.file.mimetype, req.file.size, req.user!.id]);

    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({
      user: req.user, action: 'ATTACHMENT_UPLOADED',
      entityType, entityId,
      entityName: req.file.originalname,
      ipAddress, userAgent,
    });

    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

// GET /api/attachments/:entityType/:entityId
router.get('/:entityType/:entityId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { entityType, entityId } = req.params;
    if (!ALLOWED_ENTITY_TYPES.includes(entityType)) {
      res.status(400).json({ error: 'Invalid entity type' }); return;
    }
    const result = await query(
      `SELECT id, filename, mime_type, size_bytes, created_at, u.name AS uploaded_by_name
       FROM attachments a
       JOIN users u ON a.uploaded_by = u.id
       WHERE entity_type = $1 AND entity_id = $2
       ORDER BY created_at`,
      [entityType, entityId]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/attachments/file/:id — stream download
router.get('/file/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query('SELECT * FROM attachments WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Attachment not found' }); return; }
    const att = result.rows[0];
    const filePath = path.join(UPLOAD_DIR, att.stored_name);
    if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'File not found on disk' }); return; }
    res.setHeader('Content-Type', att.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${att.filename}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) { next(err); }
});

// DELETE /api/attachments/:id
router.delete('/:id', requireAdminOrManager, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await query('DELETE FROM attachments WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Attachment not found' }); return; }
    const att = result.rows[0];
    // Best-effort file deletion — don't fail if already missing
    try { fs.unlinkSync(path.join(UPLOAD_DIR, att.stored_name)); } catch { /* ignore */ }
    const { ipAddress, userAgent } = getClientInfo(req);
    await logAudit({ user: req.user, action: 'ATTACHMENT_DELETED', entityType: att.entity_type, entityId: att.entity_id, entityName: att.filename, ipAddress, userAgent });
    res.json({ message: 'Attachment deleted' });
  } catch (err) { next(err); }
});

export default router;
