import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { query } from '../db';
import { getToken, authGet, authPost, authPut, dbRow, clearTransactionalData } from './helpers';

let adminToken: string;
let nurseToken: string;
let doctorToken: string;
let itemId: string;

beforeAll(async () => {
  [adminToken, nurseToken, doctorToken] = await Promise.all([
    getToken('admin@test.local', 'Admin123!'),
    getToken('nurse@test.local', 'Nurse123!'),
    getToken('doctor@test.local', 'Doctor123!'),
  ]);
});

beforeEach(async () => {
  await clearTransactionalData();

  const res = await authPost(adminToken)('/api/inventory', {
    name: 'Stocktake Test Item',
    unit: 'unit',
    reorder_threshold: 5,
  });
  itemId = res.body.id;
  // Set stock to 20
  await authPost(adminToken)(`/api/inventory/${itemId}/adjust`, {
    quantity_change: 20, adjustment_type: 'increase', reason: 'setup',
  });
});

describe('Stocktakes — CRUD', () => {
  it('admin can create a full stocktake', async () => {
    const res = await authPost(adminToken)('/api/stocktakes', {
      name: 'Monthly Full Stocktake',
      type: 'full',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('in_progress');
    expect(res.body.type).toBe('full');
    expect(Number(res.body.total_items)).toBeGreaterThan(0);
  });

  it('nurse can create a stocktake', async () => {
    const res = await authPost(nurseToken)('/api/stocktakes', {
      name: 'Nurse stocktake',
      type: 'cycle',
    });
    expect(res.status).toBe(201);
  });

  it('doctor cannot create a stocktake', async () => {
    const res = await authPost(doctorToken)('/api/stocktakes', {
      name: 'Doctor stocktake',
      type: 'full',
    });
    expect(res.status).toBe(403);
  });

  it('GET returns items with expected quantities', async () => {
    const createRes = await authPost(adminToken)('/api/stocktakes', {
      name: 'Test', type: 'full',
    });
    const id = createRes.body.id;

    const res = await authGet(adminToken)(`/api/stocktakes/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
    const ourItem = res.body.items.find((i: { inventory_item_id: string }) => i.inventory_item_id === itemId);
    expect(ourItem).toBeDefined();
    expect(Number(ourItem.expected_quantity)).toBe(20);
  });
});

describe('Stocktakes — Counting', () => {
  async function createStocktake() {
    const res = await authPost(adminToken)('/api/stocktakes', {
      name: 'Count Test', type: 'full',
    });
    return res.body.id as string;
  }

  it('can record a count for an item', async () => {
    const stId = await createStocktake();
    const detail = await authGet(adminToken)(`/api/stocktakes/${stId}`);
    const item = detail.body.items.find((i: { inventory_item_id: string }) => i.inventory_item_id === itemId);

    const res = await authPut(adminToken)(
      `/api/stocktakes/${stId}/items/${item.id}`,
      { counted_quantity: 18 }
    );
    expect(res.status).toBe(200);
    expect(Number(res.body.counted_quantity)).toBe(18);
  });

  it('calculates variance correctly (counted - expected)', async () => {
    const stId = await createStocktake();
    const detail = await authGet(adminToken)(`/api/stocktakes/${stId}`);
    const item = detail.body.items.find((i: { inventory_item_id: string }) => i.inventory_item_id === itemId);

    await authPut(adminToken)(`/api/stocktakes/${stId}/items/${item.id}`, {
      counted_quantity: 15, // expected 20, so variance = -5
    });

    const updated = await authGet(adminToken)(`/api/stocktakes/${stId}`);
    const updatedItem = updated.body.items.find((i: { id: string }) => i.id === item.id);
    expect(Number(updatedItem.variance)).toBe(-5);
  });

  it('cannot count on a completed stocktake', async () => {
    const stId = await createStocktake();
    const detail = await authGet(adminToken)(`/api/stocktakes/${stId}`);
    const item = detail.body.items[0];

    await authPost(adminToken)(`/api/stocktakes/${stId}/complete`, {
      apply_adjustments: false,
    });

    const res = await authPut(adminToken)(
      `/api/stocktakes/${stId}/items/${item.id}`,
      { counted_quantity: 5 }
    );
    expect(res.status).toBe(400);
  });
});

describe('Stocktakes — Complete with adjustments', () => {
  it('applies stock adjustments on complete', async () => {
    const stId = (await authPost(adminToken)('/api/stocktakes', {
      name: 'Adjust Test', type: 'full',
    })).body.id;

    const detail = await authGet(adminToken)(`/api/stocktakes/${stId}`);
    const item = detail.body.items.find((i: { inventory_item_id: string }) => i.inventory_item_id === itemId);

    // Count 15 (expected 20 → variance -5)
    await authPut(adminToken)(`/api/stocktakes/${stId}/items/${item.id}`, {
      counted_quantity: 15,
    });

    await authPost(adminToken)(`/api/stocktakes/${stId}/complete`, {
      apply_adjustments: true,
    });

    // Stock should now be 15
    const stock = await dbRow('inventory_items', itemId);
    expect(Number(stock.quantity_on_hand)).toBe(15);

    // Adjustment record should exist
    const adj = await query(
      `SELECT * FROM stock_adjustments WHERE inventory_item_id = $1 AND adjustment_type = 'stocktake'`,
      [itemId]
    );
    expect(adj.rowCount).toBe(1);
    expect(Number(adj.rows[0].quantity_change)).toBe(-5);
  });

  it('does NOT change stock when apply_adjustments=false', async () => {
    const stId = (await authPost(adminToken)('/api/stocktakes', {
      name: 'No Adjust', type: 'full',
    })).body.id;

    const detail = await authGet(adminToken)(`/api/stocktakes/${stId}`);
    const item = detail.body.items.find((i: { inventory_item_id: string }) => i.inventory_item_id === itemId);

    await authPut(adminToken)(`/api/stocktakes/${stId}/items/${item.id}`, {
      counted_quantity: 1,
    });

    await authPost(adminToken)(`/api/stocktakes/${stId}/complete`, {
      apply_adjustments: false,
    });

    // Stock should remain at 20
    const stock = await dbRow('inventory_items', itemId);
    expect(Number(stock.quantity_on_hand)).toBe(20);
  });

  it('marks completed stocktake with status=completed', async () => {
    const stId = (await authPost(adminToken)('/api/stocktakes', {
      name: 'Complete Test', type: 'full',
    })).body.id;

    await authPost(adminToken)(`/api/stocktakes/${stId}/complete`, {
      apply_adjustments: false,
    });

    const row = await dbRow('stocktakes', stId);
    expect(row.status).toBe('completed');
    expect(row.completed_at).not.toBeNull();
  });
});

describe('Stocktakes — Cancel', () => {
  it('can cancel an in-progress stocktake', async () => {
    const stId = (await authPost(adminToken)('/api/stocktakes', {
      name: 'Cancel Test', type: 'full',
    })).body.id;

    const res = await authPost(adminToken)(`/api/stocktakes/${stId}/cancel`);
    expect(res.status).toBe(200);

    const row = await dbRow('stocktakes', stId);
    expect(row.status).toBe('cancelled');
  });

  it('cannot cancel a completed stocktake', async () => {
    const stId = (await authPost(adminToken)('/api/stocktakes', {
      name: 'Done', type: 'full',
    })).body.id;
    await authPost(adminToken)(`/api/stocktakes/${stId}/complete`, { apply_adjustments: false });

    const res = await authPost(adminToken)(`/api/stocktakes/${stId}/cancel`);
    expect(res.status).toBe(404);
  });
});
