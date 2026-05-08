export type Role = 'admin' | 'doctor' | 'nurse';

export interface RequestTemplate {
  id: string;
  name: string;
  doctor_id: string;
  items: Array<{ inventory_item_id: string; item_name: string; quantity_requested: number; unit: string }>;
  created_at: string;
  updated_at: string;
}

export interface StockReturn {
  id: string;
  return_number: string;
  supplier_id?: string;
  supplier_name: string;
  status: 'draft' | 'confirmed' | 'cancelled';
  notes?: string;
  created_by: string;
  created_by_name: string;
  confirmed_by?: string;
  confirmed_by_name?: string;
  confirmed_at?: string;
  created_at: string;
  item_count?: number;
  items?: StockReturnItem[];
}

export interface StockReturnItem {
  id: string;
  return_id: string;
  inventory_item_id: string;
  item_name: string;
  batch_id?: string;
  batch_number?: string;
  quantity: number;
  unit?: string;
  unit_cost?: number;
  reason?: string;
}

export interface CategoryBudget {
  category_id: string;
  category_name: string;
  category_color?: string;
  budget_amount: number;
  actual_spend: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  is_active: boolean;
  last_login?: string;
  must_change_password?: boolean;
  totp_enabled?: boolean;
  created_at: string;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
  item_count?: number;
}

export interface Supplier {
  id: string;
  name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  is_active: boolean;
}

export interface InventoryBatch {
  id: string;
  inventory_item_id: string;
  batch_number: string;
  lot_number?: string;
  expiry_date?: string;
  quantity: number;
  supplier_cost?: number;
  received_date?: string;
  notes?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  description?: string;
  category_id?: string;
  category_name?: string;
  category_color?: string;
  sku?: string;
  barcode?: string;
  supplier_id?: string;
  supplier_name?: string;
  unit: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  reorder_threshold: number;
  internal_price?: number;
  supplier_cost?: number;
  gst_applicable: boolean;
  gst_rate: number;
  storage_location?: string;
  requires_batch_tracking: boolean;
  dispense_unit: number;
  notes?: string;
  is_active: boolean;
  is_low_stock?: boolean;
  nearest_expiry?: string;
  batches?: InventoryBatch[];
  created_at: string;
  updated_at: string;
}

export type RequestStatus = 'pending' | 'accepted' | 'in_progress' | 'fulfilled' | 'partially_fulfilled' | 'cancelled';
export type RequestPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface RequestItem {
  id: string;
  request_id: string;
  inventory_item_id: string;
  item_name: string;
  unit: string;
  internal_price?: number;
  quantity_on_hand: number;
  quantity_requested: number;
  category_name?: string;
  notes?: string;
}

export interface FulfillmentItem {
  id: string;
  fulfillment_id: string;
  inventory_item_id: string;
  item_name: string;
  unit: string;
  quantity_used: number;
  batch_number?: string;
  lot_number?: string;
  expiry_date?: string;
  internal_price?: number;
  total_charge?: number;
  is_substitution: boolean;
  substitution_reason?: string;
}

export interface Fulfillment {
  id: string;
  request_id: string;
  nurse_id: string;
  nurse_name: string;
  fulfillment_number: string;
  total_charge: number;
  notes?: string;
  completed_at: string;
  items?: FulfillmentItem[];
}

export interface StockRequest {
  id: string;
  request_number: string;
  doctor_id: string;
  doctor_name: string;
  doctor_email?: string;
  patient_name?: string;
  patient_ref?: string;
  status: RequestStatus;
  priority: RequestPriority;
  notes?: string;
  accepted_by?: string;
  accepted_by_name?: string;
  accepted_at?: string;
  is_quick_charge?: boolean;
  initiated_by?: string;
  initiated_by_name?: string;
  item_count?: number;
  fulfillment_count?: number;
  items?: RequestItem[];
  fulfillments?: Fulfillment[];
  created_at: string;
  updated_at: string;
}

export type StocktakeType = 'full' | 'cycle' | 'partial';
export type StocktakeStatus = 'in_progress' | 'completed' | 'cancelled';

export interface StocktakeItem {
  id: string;
  stocktake_id: string;
  inventory_item_id: string;
  item_name: string;
  sku?: string;
  unit: string;
  storage_location?: string;
  category_name?: string;
  expected_quantity?: number;
  counted_quantity?: number;
  variance?: number;
  adjustment_applied: boolean;
  notes?: string;
  counted_at?: string;
  counted_by?: string;
  counted_by_name?: string;
}

export interface Stocktake {
  id: string;
  name: string;
  type: StocktakeType;
  scope_description?: string;
  scope_category_id?: string;
  scope_location?: string;
  status: StocktakeStatus;
  created_by: string;
  created_by_name: string;
  completed_by?: string;
  completed_by_name?: string;
  started_at: string;
  completed_at?: string;
  notes?: string;
  total_items: number;
  total_variance?: number;
  items?: StocktakeItem[];
  progress?: { counted: number; total: number; percentage: number };
}

export type InvoiceStatus = 'received' | 'verified' | 'posted' | 'cancelled';

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  inventory_item_id?: string;
  item_name: string;
  batch_number?: string;
  lot_number?: string;
  expiry_date?: string;
  quantity: number;
  unit_cost: number;
  gst_applicable: boolean;
  gst_amount?: number;
  total_cost?: number;
  stock_updated: boolean;
  notes?: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  supplier_id?: string;
  supplier_name: string;
  invoice_date?: string;
  received_date: string;
  due_date?: string;
  subtotal: number;
  gst_amount: number;
  total_value: number;
  status: InvoiceStatus;
  entered_by: string;
  entered_by_name: string;
  posted_by?: string;
  posted_by_name?: string;
  posted_at?: string;
  notes?: string;
  line_count?: number;
  items?: InvoiceItem[];
  created_at: string;
}

export interface PaginatedResponse<T> {
  items?: T[];
  requests?: T[];
  stocktakes?: T[];
  invoices?: T[];
  logs?: T[];
  total: number;
  page: number;
  limit?: number;
  pages?: number;
}

export interface DashboardData {
  stock: {
    total_items: number;
    active_items: number;
    total_value: number;
    total_cost_value: number;
    low_stock_count: number;
  };
  requests_today: {
    pending: number;
    accepted: number;
    fulfilled_today: number;
  };
  low_stock: Array<{
    id: string;
    name: string;
    sku?: string;
    quantity_on_hand: number;
    reorder_threshold: number;
    unit: string;
    category_name?: string;
  }>;
  expiring_soon: Array<{
    id: string;
    name: string;
    batch_number: string;
    expiry_date: string;
    quantity: number;
    unit: string;
  }>;
  recent_activity: Array<{
    action: string;
    entity_name?: string;
    user_name?: string;
    created_at: string;
  }>;
  top_used: Array<{
    name: string;
    unit: string;
    total_used: number;
  }>;
  daily_usage: Array<{
    date: string;
    qty_used: number;
    revenue: number;
  }>;
}

export interface AuditLog {
  id: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  entity_name?: string;
  user_name?: string;
  user_role?: string;
  ip_address?: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  created_at: string;
}
