import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { query } from '../db';
import { getToken, authGet, authPost, authPut, authDelete, dbRow, clearTransactionalData } from './helpers';

let adminToken: string;
let nurseToken: string;
let doctorToken: string;
let categoryId: string;

beforeAll(async () => {
  [adminToken, nurseToken, doctorToken] = await Promise.all([
    getToken('admin@test.local', 'Admin123!'),
    getToken('nurse@test.local', 'Nurse123!'),
    getToken('doctor@test.local', 'Doctor123!'),
  ]);
  const cat = await query(`SELECT id FROM categories WHERE name = 'Vaccines' LIMIT 1`);
  categoryId = cat.rows[0]?.id;
});

beforeEach(() => clearTransactionalData());

// ── Helper: create a stock item ────────────────────────────────────────────
interface InventoryItem {
  id: string;
  name: string;
  quantity_on_hand: number;
  internal_price?: number;
  is_active?: boolean;
  [key: string]: unknown;
}

async function createItem(overrides: Record<string, unknown> = {}): Promise<InventoryItem> {
  const res = await authPost(adminToken)('/api/inventory', {
    name: 'Test Vaccine',
    unit: 'dose',
    reorder_threshold: 10,
    internal_price: 45.00,
    supplier_cost: 28.50,
    gst_applicable: false,
    requires_batch_tracking: false,
    ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body as InventoryItem;
}

describe('Inventory — CRUD', () => {
  it('admin can create an inventory item', async () => {
    const item = await createItem({ name: 'Flu Vaccine', category_id: categoryId });
    expect(item.name).toBe('Flu Vaccine');
    expect(Number(item.quantity_on_hand)).toBe(0);
  });

  it('doctor cannot create an inventory item', async () => {
    const res = await authPost(doctorToken)('/api/inventory', { name: 'X', unit: 'unit' });
    expect(res.status).toBe(403);
  });

  it('admin can update an item', async () => {
    const item = await createItem();
    const res = await authPut(adminToken)(`/api/inventory/${item.id}`, {
      name: 'Updated Vaccine',
      internal_price: 50.00,
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Vaccine');
    expect(Number(res.body.internal_price)).toBe(50);
  });

  it('returns 404 for unknown item', async () => {
    const res = await authGet(adminToken)('/api/inventory/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('archive (DELETE) sets is_active=false', async () => {
    const item = await createItem();
    const del = await authDelete(adminToken)(`/api/inventory/${item.id}`);
    expect(del.status).toBe(200);

    const row = await dbRow('inventory_items', item.id);
    expect(row.is_active).toBe(false);
  });

  it('lists items with pagination', async () => {
    await Promise.all([createItem({ name: 'A Vaccine' }), createItem({ name: 'B Vaccine' })]);
    const res = await authGet(adminToken)('/api/inventory?limit=1&page=1');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(2);
    expect(res.body.pages).toBe(2);
  });

  it('filters by low stock', async () => {
    // quantity_on_hand=0, threshold=10 → low stock
    await createItem({ name: 'Low Vaccine', reorder_threshold: 10 });
    // threshold=0 → not low stock
    await createItem({ name: 'OK Vaccine', reorder_threshold: 0 });

    const res = await authGet(adminToken)('/api/inventory?low_stock=true');
    expect(res.status).toBe(200);
    expect(res.body.items.every((i: { is_low_stock: boolean }) => i.is_low_stock)).toBe(true);
    expect(res.body.items.some((i: { name: string }) => i.name === 'Low Vaccine')).toBe(true);
    expect(res.body.items.some((i: { name: string }) => i.name === 'OK Vaccine')).toBe(false);
  });
});

describe('Inventory — Stock Adjustments', () => {
  it('admin can increase stock', async () => {
    const item = await createItem();

    const res = await authPost(adminToken)(`/api/inventory/${item.id}/adjust`, {
      quantity_change: 50,
      adjustment_type: 'increase',
      reason: 'Initial stock intake',
    });

    expect(res.status).toBe(200);
    expect(Number(res.body.item.quantity_on_hand)).toBe(50);
  });

  it('nurse can adjust stock', async () => {
    const item = await createItem();
    // First bring stock up
    await authPost(adminToken)(`/api/inventory/${item.id}/adjust`, {
      quantity_change: 20, adjustment_type: 'increase', reason: 'setup',
    });

    const res = await authPost(nurseToken)(`/api/inventory/${item.id}/adjust`, {
      quantity_change: -5,
      adjustment_type: 'damage',
      reason: 'Vial dropped and broken',
    });
    expect(res.status).toBe(200);
    expect(Number(res.body.item.quantity_on_hand)).toBe(15);
  });

  it('doctor cannot adjust stock', async () => {
    const item = await createItem();
    const res = await authPost(doctorToken)(`/api/inventory/${item.id}/adjust`, {
      quantity_change: 5, adjustment_type: 'increase', reason: 'test',
    });
    expect(res.status).toBe(403);
  });

  it('prevents negative stock without override', async () => {
    const item = await createItem();
    // quantity_on_hand = 0 → deducting 5 should fail
    const res = await authPost(adminToken)(`/api/inventory/${item.id}/adjust`, {
      quantity_change: -5,
      adjustment_type: 'decrease',
      reason: 'test',
      override_negative: false,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/negative/i);
  });

  it('allows negative stock with override and logs it', async () => {
    const item = await createItem();
    const res = await authPost(adminToken)(`/api/inventory/${item.id}/adjust`, {
      quantity_change: -3,
      adjustment_type: 'decrease',
      reason: 'Authorised override',
      override_negative: true,
    });
    expect(res.status).toBe(200);
    expect(Number(res.body.item.quantity_on_hand)).toBe(-3);

    // Adjustment should be in audit log
    const adj = await query(
      `SELECT * FROM stock_adjustments WHERE inventory_item_id = $1`, [item.id]
    );
    expect(adj.rows[0].override_negative).toBe(true);
  });

  it('records adjustment in stock_adjustments table', async () => {
    const item = await createItem();
    await authPost(adminToken)(`/api/inventory/${item.id}/adjust`, {
      quantity_change: 10,
      adjustment_type: 'correction',
      reason: 'Stocktake correction',
    });

    const rows = await query(
      `SELECT * FROM stock_adjustments WHERE inventory_item_id = $1`, [item.id]
    );
    expect(rows.rowCount).toBe(1);
    expect(Number(rows.rows[0].quantity_change)).toBe(10);
    expect(rows.rows[0].reason).toBe('Stocktake correction');
  });
});

describe('Inventory — Batch tracking', () => {
  it('can add a batch to an item', async () => {
    const item = await createItem({ requires_batch_tracking: true });
    const res = await authPost(adminToken)(`/api/inventory/${item.id}/batches`, {
      batch_number: 'LOT-001',
      lot_number: 'L001',
      expiry_date: '2026-12-31',
      quantity: 20,
      supplier_cost: 28.50,
    });
    expect(res.status).toBe(201);
    expect(res.body.batch_number).toBe('LOT-001');
    expect(Number(res.body.quantity)).toBe(20);
  });

  it('lists batches for an item', async () => {
    const item = await createItem({ requires_batch_tracking: true });
    await authPost(adminToken)(`/api/inventory/${item.id}/batches`, {
      batch_number: 'A', quantity: 5, expiry_date: '2026-01-01',
    });
    await authPost(adminToken)(`/api/inventory/${item.id}/batches`, {
      batch_number: 'B', quantity: 10, expiry_date: '2026-06-01',
    });

    const res = await authGet(adminToken)(`/api/inventory/${item.id}/batches`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    // Should be sorted by expiry ASC
    expect(res.body[0].batch_number).toBe('A');
  });
});

describe('Inventory — Role access to list', () => {
  it('all roles can list inventory', async () => {
    for (const token of [adminToken, doctorToken, nurseToken]) {
      const res = await authGet(token)('/api/inventory');
      expect(res.status).toBe(200);
    }
  });

  it('unauthenticated request is rejected', async () => {
    const { api } = await import('./helpers');
    const res = await api.get('/api/inventory');
    expect(res.status).toBe(401);
  });
});
