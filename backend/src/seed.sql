-- Seed data for Medical Inventory Management System
-- Default admin password: Admin123! (MUST be changed after first login)

-- Admin user (password: Admin123!)
INSERT INTO users (email, name, password_hash, role, must_change_password)
VALUES (
  'admin@clinic.local',
  'System Administrator',
  '$2a$12$DCwjO1raQiiapPldzGpNWeT6BdeCDpQbzqUVVkHk/KcDm.COMiHzO',
  'admin',
  true
) ON CONFLICT (email) DO NOTHING;

-- Demo doctor (password: Doctor123!)
INSERT INTO users (email, name, password_hash, role)
VALUES (
  'doctor@clinic.local',
  'Dr. Sarah Mitchell',
  '$2a$12$XqDfXwV9QTQSJ8fbtVUA.ubELRX/Y7DUQ4bmFCqSOl2YbU8kJajqy',
  'doctor'
) ON CONFLICT (email) DO NOTHING;

-- Demo nurse (password: Nurse123!)
INSERT INTO users (email, name, password_hash, role)
VALUES (
  'nurse@clinic.local',
  'Nurse Jessica Park',
  '$2a$12$VaMMcB6M.543xYFRODK28OPsGDi91o0i9yVPCBAAYb.EFd41L4A6i',
  'nurse'
) ON CONFLICT (email) DO NOTHING;

-- Categories
INSERT INTO categories (name, description, color) VALUES
  ('Vaccines', 'All vaccine products including flu, COVID, travel vaccines', '#10b981'),
  ('Consumables', 'Single-use clinical consumables and PPE', '#6366f1'),
  ('Medications', 'Prescription and over-the-counter medications', '#f59e0b'),
  ('Equipment', 'Reusable clinical equipment and devices', '#3b82f6'),
  ('Cold Chain', 'Items requiring refrigeration or cold storage', '#06b6d4'),
  ('Wound Care', 'Dressings, sutures, and wound management products', '#ef4444'),
  ('Pathology', 'Pathology collection supplies and containers', '#8b5cf6'),
  ('Office Supplies', 'Administrative and stationery supplies', '#64748b')
ON CONFLICT (name) DO NOTHING;

-- Suppliers
INSERT INTO suppliers (name, contact_name, email, phone) VALUES
  ('MedSupply Australia', 'John Davies', 'orders@medsupply.com.au', '1800 123 456'),
  ('Pfizer Australia', 'Sales Team', 'au.orders@pfizer.com', '1800 733 437'),
  ('Seqirus', 'Customer Service', 'customer.service@seqirus.com', '1800 642 865'),
  ('Henry Schein', 'Account Manager', 'info@henryschein.com.au', '1300 558 585'),
  ('Symbion', 'Orders', 'orders@symbion.com.au', '132 690')
ON CONFLICT DO NOTHING;

-- Sample inventory items
INSERT INTO inventory_items (name, description, category_id, sku, unit, quantity_on_hand, reorder_threshold, internal_price, supplier_cost, gst_applicable, requires_batch_tracking, storage_location, supplier_id)
SELECT
  'Influenza Vaccine (Quadrivalent)',
  'Seasonal flu vaccine, 0.5mL pre-filled syringe',
  (SELECT id FROM categories WHERE name = 'Vaccines'),
  'VAC-FLU-001',
  'dose',
  45,
  20,
  42.00,
  28.50,
  false,
  true,
  'Vaccine Fridge A',
  (SELECT id FROM suppliers WHERE name = 'Seqirus')
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'VAC-FLU-001');

INSERT INTO inventory_items (name, description, category_id, sku, unit, quantity_on_hand, reorder_threshold, internal_price, supplier_cost, gst_applicable, requires_batch_tracking, storage_location, supplier_id)
SELECT
  'COVID-19 Vaccine (mRNA)',
  'COVID-19 mRNA vaccine, 0.3mL dose',
  (SELECT id FROM categories WHERE name = 'Vaccines'),
  'VAC-COV-001',
  'dose',
  30,
  15,
  0.00,
  0.00,
  false,
  true,
  'Vaccine Fridge B',
  (SELECT id FROM suppliers WHERE name = 'Pfizer Australia')
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'VAC-COV-001');

INSERT INTO inventory_items (name, description, category_id, sku, unit, quantity_on_hand, reorder_threshold, internal_price, supplier_cost, gst_applicable, requires_batch_tracking, storage_location)
SELECT
  'Hepatitis B Vaccine',
  'Hep B vaccine adult formulation 1mL',
  (SELECT id FROM categories WHERE name = 'Vaccines'),
  'VAC-HEPB-001',
  'dose',
  18,
  10,
  68.00,
  41.00,
  false,
  true,
  'Vaccine Fridge A'
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'VAC-HEPB-001');

INSERT INTO inventory_items (name, description, category_id, sku, unit, quantity_on_hand, reorder_threshold, internal_price, supplier_cost, gst_applicable, requires_batch_tracking, storage_location)
SELECT
  'Shingrix (Shingles Vaccine)',
  'Recombinant zoster vaccine, 2-dose series',
  (SELECT id FROM categories WHERE name = 'Vaccines'),
  'VAC-SHG-001',
  'dose',
  6,
  10,
  385.00,
  270.00,
  false,
  true,
  'Vaccine Fridge A'
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'VAC-SHG-001');

INSERT INTO inventory_items (name, description, category_id, sku, unit, quantity_on_hand, reorder_threshold, internal_price, supplier_cost, gst_applicable)
SELECT
  '1mL Syringe with Needle (23G)',
  '1mL luer lock syringe with 23G x 25mm needle',
  (SELECT id FROM categories WHERE name = 'Consumables'),
  'CON-SYR-1ML',
  'unit',
  500,
  100,
  1.20,
  0.55,
  true
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'CON-SYR-1ML');

INSERT INTO inventory_items (name, description, category_id, sku, unit, quantity_on_hand, reorder_threshold, internal_price, supplier_cost, gst_applicable)
SELECT
  'Alcohol Wipes (70% IPA)',
  'Individually wrapped 70% isopropyl alcohol wipes',
  (SELECT id FROM categories WHERE name = 'Consumables'),
  'CON-ALC-001',
  'pack of 100',
  25,
  5,
  8.50,
  4.20,
  true
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'CON-ALC-001');

INSERT INTO inventory_items (name, description, category_id, sku, unit, quantity_on_hand, reorder_threshold, internal_price, supplier_cost, gst_applicable)
SELECT
  'Nitrile Gloves (Medium)',
  'Powder-free nitrile examination gloves, medium',
  (SELECT id FROM categories WHERE name = 'Consumables'),
  'CON-GLV-M',
  'box of 100',
  15,
  5,
  18.00,
  11.50,
  true
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'CON-GLV-M');

INSERT INTO inventory_items (name, description, category_id, sku, unit, quantity_on_hand, reorder_threshold, internal_price, supplier_cost, gst_applicable)
SELECT
  'Blood Collection Tubes (EDTA)',
  'Purple top EDTA blood collection tubes 4mL',
  (SELECT id FROM categories WHERE name = 'Pathology'),
  'PATH-BCT-EDTa',
  'pack of 50',
  20,
  5,
  22.00,
  14.00,
  true
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'PATH-BCT-EDTa');

INSERT INTO inventory_items (name, description, category_id, sku, unit, quantity_on_hand, reorder_threshold, internal_price, supplier_cost, gst_applicable)
SELECT
  'Steristrips 6mm x 75mm',
  'Skin closure strips, package of 5 strips',
  (SELECT id FROM categories WHERE name = 'Wound Care'),
  'WND-STR-001',
  'pack of 5',
  40,
  10,
  4.50,
  2.20,
  true
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'WND-STR-001');

INSERT INTO inventory_items (name, description, category_id, sku, unit, quantity_on_hand, reorder_threshold, internal_price, supplier_cost, gst_applicable, requires_batch_tracking)
SELECT
  'Methotrexate 10mg/2mL Injection',
  'Methotrexate sodium injection 10mg/2mL vial',
  (SELECT id FROM categories WHERE name = 'Medications'),
  'MED-MTX-001',
  'vial',
  8,
  5,
  38.00,
  22.50,
  false,
  true
WHERE NOT EXISTS (SELECT 1 FROM inventory_items WHERE sku = 'MED-MTX-001');
