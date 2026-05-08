# MedInventory — User Guide

Step-by-step instructions for every role. No technical knowledge required.

---

## Table of Contents

- [Logging In](#logging-in)
- [Guide for Admins](#guide-for-admins)
- [Guide for Doctors](#guide-for-doctors)
- [Guide for Nurses](#guide-for-nurses)
- [Common Tasks (All Roles)](#common-tasks-all-roles)

---

## Logging In

1. Open a web browser on any device connected to the clinic network
2. Navigate to `http://<server-address>:3000` (your admin will give you this address)
3. Enter your email and password
4. If you have never logged in before, you may be prompted to set a new password

**Forgot password?** Ask your admin to reset it for you — they can set a temporary password from the Users page.

**Account locked?** After 5 incorrect login attempts your account locks for 15 minutes. Wait and try again, or ask an admin to unlock it.

**Idle timeout:** The system logs you out automatically after 30 minutes of inactivity. A warning appears 2 minutes before logout with the option to stay logged in.

---

## Guide for Admins

Admins have access to everything. The sections below cover tasks that are admin-only.

### Managing Users

**To create a new user:**
1. Go to **Users** in the left sidebar
2. Click **Add User**
3. Enter their name, email address, and select a role (Admin / Doctor / Nurse)
4. Set a temporary password — the user will be required to change it on first login
5. Click **Create**

**To deactivate a user** (e.g. staff member has left):
1. Go to **Users** → find the user → click the **Edit** (pencil) icon
2. Toggle **Active** to off
3. Save — the user can no longer log in, but their history is preserved

**To reset a forgotten password:**
1. Go to **Users** → find the user → click **Reset Password**
2. Enter and confirm a temporary password
3. The user will be forced to change it on their next login

### Managing Categories

Categories group inventory items and display with a colour badge.

1. Go to **Settings** → **Categories** section
2. Click **Add** to create a new category
3. Enter a name, optional description, and choose a colour
4. Save

To delete a category, first move all its items to another category — deletion is blocked while any items belong to it.

### Managing Suppliers

1. Go to **Settings** → **Suppliers** section
2. Click **Add** to create a new supplier
3. Enter company name, contact person, phone, email, and address
4. Save

Suppliers can be deactivated (archived) rather than deleted — their history remains linked to existing invoices.

### Adding Inventory Items

1. Go to **Inventory** → **Add Item**
2. Fill in the required fields:
   - **Name**: What the item is called (e.g. "Amoxicillin 500mg Capsule")
   - **Unit**: How it's measured (e.g. `capsule`, `mL`, `box`, `unit`)
   - **Category**: Optional — helps with filtering and reports
   - **SKU**: Optional stock-keeping code for scanning
3. Fill in pricing (optional but recommended for billing):
   - **Internal Price**: What you charge per unit
   - **Supplier Cost**: What you pay per unit
4. Set practical fields:
   - **Reorder Threshold**: Alert when stock falls below this number
   - **Dispense Step**: How the +/− buttons increment in the ordering screens (e.g. `5` for items sold in packs of 5, `0.5` for items measured in half-units)
   - **Storage Location**: Where the item is physically kept (e.g. "Fridge 2", "Cabinet A")
5. Enable **Requires Batch/Lot Tracking** if expiry dates and batch numbers must be recorded for each dispensing (e.g. vaccines, controlled substances)
6. Click **Save**

### Manually Adjusting Stock

Use this when stock changes outside the normal workflows (e.g. items damaged, expired, returned to supplier, or correction after stocktake).

1. Go to **Inventory** → find the item → click **Adjust**
2. Choose adjustment type:
   - **Increase**: Adding stock (e.g. you found extra units)
   - **Decrease**: Removing stock (e.g. items damaged or disposed of)
   - **Correction**: Overriding the count to an exact value
   - **Damage / Expiry / Return**: Self-explanatory types for reporting
3. Enter the quantity change (or new total for Correction)
4. Enter a reason — this is recorded in the audit log
5. Click **Apply**

### Recording Supplier Invoices

1. Go to **Invoices** → **New Invoice**
2. Enter the invoice number, select the supplier, and set the invoice date
3. Add line items:
   - Click **Add Line**
   - Search for and select the inventory item this line refers to
   - Enter the batch number and expiry date if applicable
   - Enter quantity received and unit cost
   - GST is calculated automatically based on the item's GST rate
4. Once all lines are entered, review the subtotal, GST, and total
5. Click **Save** to save a draft, or **Post** to confirm and update stock levels

> **Important:** Once an invoice is posted, stock levels update immediately for all linked items. Posted invoices cannot be edited.

### Running Reports

1. Go to **Reports** in the sidebar
2. Use the tabs to switch between report types:
   - **Usage**: Most-used items over the selected date range
   - **By Nurse**: Which nurses handled which requests and totals
   - **Revenue**: Billing totals and trend charts
   - **Invoices**: All invoice line items for the period
3. Set the date range using the **From** and **To** date pickers
4. Use the **Group By** and **Period** options to change how data is summarised
5. Click **Export CSV** to download the data for use in Excel or accounting software

### Viewing the Audit Log

The audit log records every significant action in the system.

1. Go to **Audit Log** in the sidebar
2. Use the search box to filter by user name, action type, or entity name
3. Use the date range picker to narrow results
4. Click on any log entry to see the full before/after values

### Running a Stocktake

See the [Stocktake workflow](#stocktake-workflow) section under Common Tasks.

---

## Guide for Doctors

### Placing a Stock Order

1. Go to **New Order** in the left sidebar
2. Browse or search for items using the search bar at the top
   - Type any part of the item name, SKU, or category
   - Use the category filter pills below the search bar to narrow the list
3. Tap an item card to add it to your order (right-hand panel)
   - Tap again to increase the quantity by the item's dispense step
   - Use the − and + buttons in the basket to adjust precisely
4. Set the **Priority**:
   - **Low / Normal / High / Urgent** — Urgent and High orders appear at the top of the nurse queue
5. Enter **Patient Name** and **Reference** (optional) for record-keeping
6. Add any notes for the nurses in the **Notes** field
7. Click **Send to Nurses**

After submitting you'll see a confirmation with the request number (e.g. `REQ-001042`). You can track the status in **Requests**.

### Tracking Your Requests

1. Go to **Requests** in the sidebar
2. Your requests are listed newest first with their status:
   - **Pending** — waiting for a nurse to accept
   - **Accepted** — a nurse has taken it and is working on it
   - **Fulfilled** — stock dispensed; click to see the full receipt
   - **Cancelled** — cancelled with a reason
3. Click any request to open the detail page
4. The detail page shows: all requested items, which nurse fulfilled it, exact quantities dispensed, batch/lot numbers, and the total charge

### Understanding Quick-Charge Receipts

Nurses can also charge stock directly to you without a prior request (for example, when they administer something during an appointment). These appear in your Requests list with a `QC-` prefix rather than `REQ-`.

Click any `QC-` receipt to see exactly what was dispensed.

### Reports

Doctors can view reports on their own stock usage:

1. Go to **Reports** in the sidebar
2. Set a date range and click **Apply**
3. See usage totals for items dispensed against your requests

---

## Guide for Nurses

### Viewing and Accepting Requests

1. Go to **Requests** in the sidebar
2. Pending requests from doctors appear at the top, sorted by priority (Urgent first)
3. Click a request to open it
4. Review the items and quantities requested
5. Click **Accept** to claim the request (moves it to `Accepted` so other nurses know it's being handled)

### Fulfilling a Request

After accepting:

1. Open the request → click **Fulfil**
2. A panel shows each requested item:
   - **Qty Used**: Defaults to the requested quantity — change if you're dispensing less
   - **Price per unit**: Pre-filled from the item's internal price — adjust if needed
   - **Batch**: Click **Load batches** to see tracked batches for this item; or type a batch number manually
   - **Lot Number / Expiry Date**: Fill in if known
3. If you used a different item than requested, tick **This is a substitution** and enter the reason
4. Add any notes in the **Nurse Notes** field at the bottom
5. Click **Complete Fulfilment** — stock is deducted, the doctor is updated, and the receipt is generated

**After fulfilling**, the request detail page shows a green panel labelled **"Copy to clinical notes"**. Click **Copy** to copy a pre-formatted note to your clipboard:

```
Stock used
3x Amoxicillin 500mg
1x Gauze Roll 10cm
```

Paste this directly into your clinical notes system.

### Quick Charge (Charging Without a Prior Request)

Use this when you need to charge stock against a patient without a doctor having raised a request first (e.g. administering during a consultation).

1. Go to **Quick Charge** in the sidebar
2. Browse or search for items — tap to add to the basket
3. Select the **Doctor** to associate the charge with
4. Enter patient name and reference if needed
5. Click **Send Receipt to Doctor** — stock is deducted immediately and the doctor receives a `QC-` receipt

### Running a Stocktake

See the [Stocktake workflow](#stocktake-workflow) below.

---

## Common Tasks (All Roles)

### Stocktake Workflow

#### Step 1 — Create the session

1. Go to **Stocktakes** → **New Stocktake**
2. Choose a name (defaults to today's date)
3. Select the type:
   - **Full**: Counts every active item in inventory
   - **Cycle**: Used for rotating subset counts (same items as Full, but intended for partial runs)
   - **Partial**: Counts only items in a specific category or storage location
4. Click **Create & Start**

#### Step 2 — Print the count sheet

1. From the stocktake list, click the **printer icon** next to your session
   - Or open the session and click **Count Sheet**
2. A new tab opens with an A4-formatted table showing:
   - Item name, SKU, category, storage location
   - Expected quantity (system's current count)
   - Blank "Counted" column for staff to write in
3. Click the **Print** button in the top-right corner

#### Step 3 — Physically count stock

Walk the clinic with the printed count sheet. Write the actual physical count next to each item.

#### Step 4 — Enter counts into the system

1. Open the stocktake session from the **Stocktakes** list
2. For each item, type the counted quantity into the **Counted** field
3. The **Variance** column updates automatically (positive = more than expected, negative = less)
4. Use **Filter uncounted** to focus on items not yet entered
5. Use the search bar to find specific items quickly

#### Step 5 — Complete the stocktake

1. Click **Complete** when all items are counted
2. Choose whether to **Apply all variances as stock adjustments**:
   - **Yes**: The system updates `quantity_on_hand` for every item that had a variance. Each adjustment is recorded in the audit log.
   - **No**: Results are recorded for reference but stock levels remain unchanged (useful if you plan to investigate discrepancies first)
3. Click **Complete Stocktake**

#### Step 6 — Export results (optional)

Click **Export CSV** on the completed session to download a spreadsheet with all items, expected/counted quantities, and variances.

### Changing Your Password

1. Click your name at the bottom-left of the sidebar
2. Or go to any page and add `/change-password` to the URL
3. Enter your current password, then your new password twice
4. Click **Change Password**

Password requirements: at least 8 characters. Admins can enforce stronger policies by setting a temporary password and enabling `must_change_password`.

### Searching for Items

The inventory search bar (on the Inventory page, the New Order screen, and the Quick Charge screen) uses **fuzzy search**:

- Searches across item name, SKU, barcode, and description
- Separate words act as AND filters — `amox 500` matches "Amoxicillin 500mg" but not "Amoxicillin 250mg"
- Case-insensitive

Results are ranked by relevance — items where the query matches the start of the name appear first.
