import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { query } from '../db';
import { getToken, authGet, authPost, authPut, dbRow, clearTransactionalData } from './helpers';

let adminToken: string;
let doctorToken: string;
let nurseToken: string;
let testItemId: string;

beforeAll(async () => {
  [adminToken, doctorToken, nurseToken] = await Promise.all([
    getToken('admin@test.local', 'Admin123!'),
    getToken('doctor@test.local', 'Doctor123!'),
    getToken('nurse@test.local', 'Nurse123!'),
  ]);
});

beforeEach(async () => {
  await clearTransactionalData();

  // Create a fresh item with stock for each test
  const itemRes = await authPost(adminToken)('/api/inventory', {
    name: 'Test Flu Vaccine',
    unit: 'dose',
    internal_price: 42.00,
    reorder_threshold: 5,
    requires_batch_tracking: false,
  });
  testItemId = itemRes.body.id;

  // Give it some stock
  await authPost(adminToken)(`/api/inventory/${testItemId}/adjust`, {
    quantity_change: 100,
    adjustment_type: 'increase',
    reason: 'Test setup',
  });
});

// ── Create request ───────────────────────────────────────────────────────────
describe('POST /api/requests — Create', () => {
  it('doctor can create a stock request', async () => {
    const res = await authPost(doctorToken)('/api/requests', {
      patient_name: 'Jane Smith',
      priority: 'normal',
      items: [{ inventory_item_id: testItemId, quantity_requested: 2 }],
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.request_number).toMatch(/^REQ-/);
  });

  it('creates request and reserves stock', async () => {
    await authPost(doctorToken)('/api/requests', {
      items: [{ inventory_item_id: testItemId, quantity_requested: 10 }],
    });

    const row = await dbRow('inventory_items', testItemId);
    expect(Number(row.quantity_reserved)).toBe(10);
  });

  it('nurse cannot create a request', async () => {
    const res = await authPost(nurseToken)('/api/requests', {
      items: [{ inventory_item_id: testItemId, quantity_requested: 1 }],
    });
    expect(res.status).toBe(403);
  });

  it('rejects a request with no items', async () => {
    const res = await authPost(doctorToken)('/api/requests', {
      items: [],
    });
    expect(res.status).toBe(400);
  });

  it('assigns a unique request number per request', async () => {
    const [r1, r2] = await Promise.all([
      authPost(doctorToken)('/api/requests', {
        items: [{ inventory_item_id: testItemId, quantity_requested: 1 }],
      }),
      authPost(doctorToken)('/api/requests', {
        items: [{ inventory_item_id: testItemId, quantity_requested: 1 }],
      }),
    ]);
    expect(r1.body.request_number).not.toBe(r2.body.request_number);
  });
});

// ── Accept request ───────────────────────────────────────────────────────────
describe('PUT /api/requests/:id/accept — Accept', () => {
  it('nurse can accept a pending request', async () => {
    const createRes = await authPost(doctorToken)('/api/requests', {
      items: [{ inventory_item_id: testItemId, quantity_requested: 1 }],
    });
    const requestId = createRes.body.id;

    const res = await authPut(nurseToken)(`/api/requests/${requestId}/accept`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('accepted');
  });

  it('doctor cannot accept their own request', async () => {
    const createRes = await authPost(doctorToken)('/api/requests', {
      items: [{ inventory_item_id: testItemId, quantity_requested: 1 }],
    });
    const res = await authPut(doctorToken)(`/api/requests/${createRes.body.id}/accept`);
    expect(res.status).toBe(403);
  });

  it('cannot accept a request that is already accepted', async () => {
    const createRes = await authPost(doctorToken)('/api/requests', {
      items: [{ inventory_item_id: testItemId, quantity_requested: 1 }],
    });
    const id = createRes.body.id;

    await authPut(nurseToken)(`/api/requests/${id}/accept`);
    const second = await authPut(nurseToken)(`/api/requests/${id}/accept`);
    // Already accepted so status filter won't match
    expect(second.status).toBe(404);
  });
});

// ── Fulfil request (core workflow) ───────────────────────────────────────────
describe('POST /api/requests/:id/fulfill — Fulfil', () => {
  async function createAndAcceptRequest(qty = 3) {
    const createRes = await authPost(doctorToken)('/api/requests', {
      patient_name: 'Test Patient',
      items: [{ inventory_item_id: testItemId, quantity_requested: qty }],
    });
    const id = createRes.body.id;
    await authPut(nurseToken)(`/api/requests/${id}/accept`);
    return id;
  }

  it('nurse fulfils a request and stock is deducted', async () => {
    const requestId = await createAndAcceptRequest(3);

    const items = await query(`
      SELECT * FROM stock_request_items WHERE request_id = $1
    `, [requestId]);

    const res = await authPost(nurseToken)(`/api/requests/${requestId}/fulfill`, {
      items: [{
        request_item_id: items.rows[0].id,
        inventory_item_id: testItemId,
        quantity_used: 3,
        batch_number: 'LOT-001',
        expiry_date: '2026-06-01',
        internal_price: 42.00,
      }],
      notes: 'Administered without issues',
    });

    expect(res.status).toBe(201);
    expect(res.body.fulfillment_number).toMatch(/^FUL-/);
    expect(Number(res.body.total_charge)).toBeCloseTo(126.00);

    // Stock should be deducted: 100 - 3 = 97
    const stock = await dbRow('inventory_items', testItemId);
    expect(Number(stock.quantity_on_hand)).toBe(97);
  });

  it('marks request as fulfilled', async () => {
    const requestId = await createAndAcceptRequest(1);
    const items = await query(
      `SELECT * FROM stock_request_items WHERE request_id = $1`, [requestId]
    );

    await authPost(nurseToken)(`/api/requests/${requestId}/fulfill`, {
      items: [{
        request_item_id: items.rows[0].id,
        inventory_item_id: testItemId,
        quantity_used: 1,
        internal_price: 42.00,
      }],
    });

    const req = await dbRow('stock_requests', requestId);
    expect(req.status).toBe('fulfilled');
  });

  it('creates a stock_adjustment record on fulfilment', async () => {
    const requestId = await createAndAcceptRequest(2);
    const items = await query(
      `SELECT * FROM stock_request_items WHERE request_id = $1`, [requestId]
    );

    await authPost(nurseToken)(`/api/requests/${requestId}/fulfill`, {
      items: [{
        request_item_id: items.rows[0].id,
        inventory_item_id: testItemId,
        quantity_used: 2,
        internal_price: 42,
      }],
    });

    const adj = await query(
      `SELECT * FROM stock_adjustments WHERE inventory_item_id = $1`, [testItemId]
    );
    // setup increase + fulfilment decrease = 2 rows
    expect(adj.rowCount).toBe(2);
    const fulfillAdj = adj.rows.find((r: { adjustment_type: string }) => r.adjustment_type === 'decrease');
    expect(Number(fulfillAdj.quantity_change)).toBe(-2);
  });

  it('doctor cannot fulfil a request', async () => {
    const requestId = await createAndAcceptRequest(1);
    const items = await query(
      `SELECT * FROM stock_request_items WHERE request_id = $1`, [requestId]
    );
    const res = await authPost(doctorToken)(`/api/requests/${requestId}/fulfill`, {
      items: [{
        request_item_id: items.rows[0].id,
        inventory_item_id: testItemId,
        quantity_used: 1,
      }],
    });
    expect(res.status).toBe(403);
  });
});

// ── Cancel request ───────────────────────────────────────────────────────────
describe('PUT /api/requests/:id/cancel — Cancel', () => {
  it('doctor can cancel their own pending request', async () => {
    const createRes = await authPost(doctorToken)('/api/requests', {
      items: [{ inventory_item_id: testItemId, quantity_requested: 5 }],
    });
    const id = createRes.body.id;

    const res = await authPut(doctorToken)(`/api/requests/${id}/cancel`, {
      reason: 'Patient rescheduled',
    });
    expect(res.status).toBe(200);

    const req = await dbRow('stock_requests', id);
    expect(req.status).toBe('cancelled');
    // Reserved stock should be released
    const stock = await dbRow('inventory_items', testItemId);
    expect(Number(stock.quantity_reserved)).toBe(0);
  });

  it('nurse cannot cancel a request', async () => {
    const createRes = await authPost(doctorToken)('/api/requests', {
      items: [{ inventory_item_id: testItemId, quantity_requested: 1 }],
    });
    const res = await authPut(nurseToken)(
      `/api/requests/${createRes.body.id}/cancel`,
      { reason: 'nurse trying to cancel' }
    );
    expect(res.status).toBe(403);
  });
});

// ── Doctor sees only their own requests ──────────────────────────────────────
describe('GET /api/requests — Role visibility', () => {
  it('doctor only sees their own requests', async () => {
    // Create one request as doctor
    await authPost(doctorToken)('/api/requests', {
      items: [{ inventory_item_id: testItemId, quantity_requested: 1 }],
    });
    // Create another as admin (different doctor_id)
    await authPost(adminToken)('/api/requests', {
      items: [{ inventory_item_id: testItemId, quantity_requested: 1 }],
    });

    const res = await authGet(doctorToken)('/api/requests');
    expect(res.status).toBe(200);
    // Doctor should only see their own
    expect(res.body.requests.every((r: { doctor_name: string }) =>
      r.doctor_name === 'Test Doctor'
    )).toBe(true);
  });

  it('nurse can see all requests', async () => {
    await authPost(doctorToken)('/api/requests', {
      items: [{ inventory_item_id: testItemId, quantity_requested: 1 }],
    });
    const res = await authGet(nurseToken)('/api/requests');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });
});
