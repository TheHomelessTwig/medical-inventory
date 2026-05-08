import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth';
import inventoryRoutes from './routes/inventory';
import requestRoutes from './routes/requests';
import stocktakeRoutes from './routes/stocktakes';
import invoiceRoutes from './routes/invoices';
import reportRoutes from './routes/reports';
import userRoutes from './routes/users';
import auditRoutes from './routes/audit';
import categoryRoutes from './routes/categories';
import supplierRoutes from './routes/suppliers';
import systemRoutes from './routes/system';
import templateRoutes      from './routes/templates';
import returnRoutes         from './routes/returns';
import budgetRoutes         from './routes/budgets';
import purchaseOrderRoutes      from './routes/purchaseOrders';
import attachmentRoutes          from './routes/attachments';
import siteRoutes                from './routes/sites';
import retentionRoutes           from './routes/retention';
import adminSettingsRoutes       from './routes/adminSettings';
import transferRoutes            from './routes/transfers';
import recallRoutes              from './routes/recalls';
import webhookRoutes             from './routes/webhooks';
import labelRoutes               from './routes/labels';
import stocktakeScheduleRoutes   from './routes/stocktakeSchedules';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.set('trust proxy', 1);

// Looser rate limits in test so we don't hit them mid-suite
const isTest = process.env.NODE_ENV === 'test';

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 10_000 : 500,
  standardHeaders: true,
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 10_000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/stocktakes', stocktakeRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/system',    systemRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/returns',          returnRoutes);
app.use('/api/budgets',          budgetRoutes);
app.use('/api/purchase-orders',  purchaseOrderRoutes);
app.use('/api/attachments',      attachmentRoutes);
app.use('/api/sites',            siteRoutes);
app.use('/api/retention',          retentionRoutes);
app.use('/api/transfers',          transferRoutes);
app.use('/api/recalls',            recallRoutes);
app.use('/api/webhooks',           webhookRoutes);
app.use('/api/labels',             labelRoutes);
app.use('/api/stocktake-schedules', stocktakeScheduleRoutes);
app.use('/api/admin-settings',      adminSettingsRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
app.use(errorHandler);

export default app;
