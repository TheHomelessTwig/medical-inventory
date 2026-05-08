import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { query } from '../db';
import { getToken, authGet, authPost, authPut, dbRow, clearTransactionalData } from './helpers';

let adminToken: string;
let doctorToken: string;
let itemId: string;

const today = new Date().toISOString().split('T')[0];

beforeAll(async () => {
  [adminToken, doctorToken] = await Promise.all([
    getToken('admin@test.local', 'Admin123!'),
    getToken('doctor@test.local', 'Doctor123!'),
  ]);
});

beforeEach(async () => {
  await clearTransactionalData();

  const res = await authPost(adminToken)('/api/inventory', {
    name: 'Invoice Test Item',
    unit: 'vial',
    supplier_cost: 25.00,
  });
  itemId = res.body.id;
});

const baseInvoice = () => ({
  invoice_number: `INV-${Date.now()}`,
  supplier_name: 'Test Pharma Co',
  received_date: today,
  items: [{
    inventory_item_id: itemId,
    item_name: 'Invoice Test Item',
    quantity: 10,
    unit_cost: 25.00,
    gst_applicable: true,
  }],
});

describe('Invoices — Create', () => {
  it('admin can create an invoice', async () => {
    const res = await authPost(adminToken)('/api/invoices', baseInvoice());
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('received');
    expect(Number(res.body.subtotal)).toBeCloseTo(250);
    expect(Number(res.body.gst_amount)).toBeCloseTo(25);
    expect(Number(res.body.total_value)).toBeCloseTo(275);
  });

  it('calculates subtotal, GST, and total correctly', async () => {
    const inv = {
      ...baseInvoice(),
      items: [
        { inventory_item_id: itemId, item_name: 'Item A', quantity: 5, unit_cost: 10.00, gst_applicable: true },
        { inventory_item_id: itemId, item_name: 'Item B', quantity: 2, unit_cost: 20.00, gst_applicable: false },
      ],
    };
    const res = await authPost(adminToken)('/api/invoices', inv);
    expect(res.status).toBe(201);
    // Subtotal = 50 + 40 = 90; GST = 5 (10% on item A only); Total = 95
    expect(Number(res.body.subtotal)).toBeCloseTo(90);
    expect(Number(res.body.gst_amount)).toBeCloseTo(5);
    expect(Number(res.body.total_value)).toBeCloseTo(95);
  });

  it('rejects duplicate invoice numbers', async () => {
    const inv = baseInvoice();
    await authPost(adminToken)('/api/invoices', inv);
    const res = await authPost(adminToken)('/api/invoices', inv);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('doctor cannot create an invoice', async () => {
    const res = await authPost(doctorToken)('/api/invoices', baseInvoice());
    expect(res.status).toBe(403);
  });

  it('returns 400 with no items', async () => {
    const res = await authPost(adminToken)('/api/invoices', {
      invoice_number: 'INV-EMPTY',
      supplier_name: 'Test',
      received_date: today,
      items: [],
    });
    expect(res.status).toBe(400);
  });
});

describe('Invoices — Post (stock update)', () => {
  it('posting invoice updates stock quantity', async () => {
    const inv = await authPost(adminToken)('/api/invoices', baseInvoice());
    const invoiceId = inv.body.id;

    await authPost(adminToken)(`/api/invoices/${invoiceId}/post`);

    const stock = await dbRow('inventory_items', itemId);
    expect(Number(stock.quantity_on_hand)).toBe(10);
  });

  it('posting invoice updates supplier cost', async () => {
    const inv = baseInvoice();
    inv.items[0].unit_cost = 30.00; // different from original 25
    const invoiceRes = await authPost(adminToken)('/api/invoices', inv);

    await authPost(adminToken)(`/api/invoices/${invoiceRes.body.id}/post`);

    const item = await dbRow('inventory_items', itemId);
    expect(Number(item.supplier_cost)).toBeCloseTo(30.00);
  });

  it('posting creates a stock adjustment record', async () => {
    const inv = await authPost(adminToken)('/api/invoices', baseInvoice());
    await authPost(adminToken)(`/api/invoices/${inv.body.id}/post`);

    const adj = await query(
      `SELECT * FROM stock_adjustments WHERE inventory_item_id = $1 AND adjustment_type = 'increase'`,
      [itemId]
    );
    expect(adj.rowCount).toBeGreaterThan(0);
    expect(Number(adj.rows[adj.rowCount! - 1].quantity_change)).toBe(10);
  });

  it('posting creates a batch record when batch_number provided', async () => {
    const inv = {
      ...baseInvoice(),
      items: [{
        inventory_item_id: itemId,
        item_name: 'Invoice Test Item',
        quantity: 5,
        unit_cost: 25.00,
        gst_applicable: false,
        batch_number: 'BATCH-XYZ',
        expiry_date: '2027-01-01',
      }],
    };
    const invoiceRes = await authPost(adminToken)('/api/invoices', inv);
    await authPost(adminToken)(`/api/invoices/${invoiceRes.body.id}/post`);

    const batches = await query(
      `SELECT * FROM inventory_batches WHERE inventory_item_id = $1 AND batch_number = 'BATCH-XYZ'`,
      [itemId]
    );
    expect(batches.rowCount).toBe(1);
    expect(Number(batches.rows[0].quantity)).toBe(5);
  });

  it('marks invoice status as posted', async () => {
    const inv = await authPost(adminToken)('/api/invoices', baseInvoice());
    await authPost(adminToken)(`/api/invoices/${inv.body.id}/post`);

    const row = await dbRow('invoices', inv.body.id);
    expect(row.status).toBe('posted');
    expect(row.posted_at).not.toBeNull();
  });

  it('cannot post an already-posted invoice', async () => {
    const inv = await authPost(adminToken)('/api/invoices', baseInvoice());
    await authPost(adminToken)(`/api/invoices/${inv.body.id}/post`);

    const secondPost = await authPost(adminToken)(`/api/invoices/${inv.body.id}/post`);
    expect(secondPost.status).toBe(404);
  });
});

describe('Invoices — List and detail', () => {
  it('lists invoices with pagination', async () => {
    await authPost(adminToken)('/api/invoices', { ...baseInvoice(), invoice_number: `INV-A-${Date.now()}` });
    await authPost(adminToken)('/api/invoices', { ...baseInvoice(), invoice_number: `INV-B-${Date.now()}` });

    const res = await authGet(adminToken)('/api/invoices');
    expect(res.status).toBe(200);
    expect(res.body.invoices.length).toBeGreaterThanOrEqual(2);
  });

  it('returns invoice detail with line items', async () => {
    const inv = await authPost(adminToken)('/api/invoices', baseInvoice());
    const res = await authGet(adminToken)(`/api/invoices/${inv.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].item_name).toBe('Invoice Test Item');
  });
});
