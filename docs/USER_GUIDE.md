# S.H.I.T. — User Guide

Step-by-step instructions for every role. No technical knowledge required.

---

## Table of Contents

- [Logging In](#logging-in)
- [My Account (All Roles)](#my-account-all-roles)
- [Guide for Admins](#guide-for-admins)
- [Guide for Doctors](#guide-for-doctors)
- [Guide for Nurses](#guide-for-nurses)
- [Common Tasks (All Roles)](#common-tasks-all-roles)

---

## Logging In

1. Open a browser on any device connected to the clinic network
2. Go to `http://<server-address>:3000` (your admin will provide this)
3. Enter your email and password
4. If 2FA is enabled on your account, enter the 6-digit code from your authenticator app after your password

**Locked out?** Accounts lock for 15 minutes after 5 incorrect attempts. Wait, or ask an admin.  
**Forgotten password?** Ask your admin to set a temporary password.  
**Idle timeout:** The system logs you out after 30 minutes of inactivity, with a 2-minute warning.

---

## My Account (All Roles)

Click your name in the bottom-left of the sidebar to open **My Account**.

### Profile
- Change your **display name** and **email address**
- Click **Save changes** — takes effect immediately

### Appearance
- **Dark mode** toggle — switches the entire interface to a dark theme
- **Accent colour** — choose from 8 presets or pick any custom colour; changes buttons, active navigation, and highlights throughout the app

### Notifications
- **Notification sound** — toggle the chime that plays when a new request or receipt arrives

### Security — Two-Factor Authentication (2FA)
1. Click **Enable 2FA**
2. Open Google Authenticator, Authy, or any TOTP app on your phone
3. Scan the QR code (or type the secret key manually if you can't scan)
4. Enter the 6-digit code to confirm setup
5. All future logins will require your password **plus** a code from the app

To disable 2FA: click **Disable**, enter a current authenticator code to confirm.

### Security — Change Password
Click **Change password** to go to the password change screen.

---

## Guide for Admins

Admins have access to everything. This section covers admin-only tasks.

### Managing Users

**Create a new user:**
1. Go to **Users → Add User**
2. Enter name, email, role (Admin / Doctor / Nurse)
3. Set a temporary password — the user must change it on first login
4. Click **Create**

**Deactivate a user** (staff member left):
1. Users → Edit (pencil) → toggle **Active** off → Save
2. The user can no longer log in; all history is preserved

**Reset a forgotten password:**
Users → find user → **Reset Password** → set a temporary password → the user must change it on next login

### Setting Up Email Notifications

Add SMTP credentials to the `.env` file (see the [Email Notifications Setup](../README.md#email-notifications-setup) section in the README). Once configured, the system automatically sends:
- New request notifications to nurses
- Fulfilment receipts to doctors
- Account lockout and after-hours login alerts to admins
- Weekly usage + low stock reports every Monday 8am

### Managing Categories and Suppliers

Go to **Settings** and use the **Categories** and **Suppliers** sections. Categories have a colour used throughout the app for visual grouping. Suppliers can be deactivated (archived) rather than deleted.

### Adding Inventory Items

1. **Inventory → Add Item**
2. Key fields:
   - **Unit** — how the item is measured (tablet, mL, unit, box)
   - **Internal Price** — what you charge per unit (used in billing totals)
   - **Reorder Threshold** — triggers the low-stock alert on the dashboard
   - **Dispense Step** — controls the +/− increment on the POS ordering screens (e.g., `5` for items sold in packs of 5)
   - **Storage Location** — free text (e.g., "Fridge 2", "Cabinet A-3")
   - **Requires Batch/Lot Tracking** — if enabled, nurses must specify a batch when fulfilling
3. Save

### Adjusting Stock Manually

Inventory → find item → **Adjust** (bar chart icon):
- **Types:** Increase, Decrease, Correction, Damage, Expiry, Return, Wastage, Other
- Enter quantity and a required reason — recorded permanently in the audit log

### Recording Wastage

For stock lost without being used on a patient:

1. Inventory → find item → click the **bin icon**
2. Enter quantity wasted
3. Select reason: Dropped / Contaminated / Opened but unused / Incorrect dose drawn / Expired after opening / Other
4. Click **Record Wastage**

View wastage history and costs at **Reports → Wastage**.

### Returns to Supplier

1. **Returns → New Return**
2. Select or type the supplier name
3. Add line items — search for the item, enter batch number, quantity, and reason
4. Click **Create Draft**
5. When ready: click **Confirm** on the return row → stock levels are restored automatically

### Setting Monthly Budgets

The dashboard shows a budget vs actual spend widget. To configure budgets:
- Use the API: `PUT /api/budgets` with `{ category_id, period_month: "YYYY-MM", budget_amount }`
- Or use the budget management UI (if set up in Settings)

### Recording Supplier Invoices

1. **Invoices → New Invoice**
2. Enter invoice number, supplier, and date
3. Add line items — link each to an existing inventory item, enter batch info, quantity, unit cost
4. GST calculated automatically
5. **Post** the invoice → stock levels update for all linked items
6. Posted invoices cannot be edited

**Xero export:** `GET /api/invoices/xero-export?from=YYYY-MM-DD&to=YYYY-MM-DD` returns a Xero bank transactions CSV.

### Running Reports

**Reports** page tabs:
- **Overview** — dashboard-style summary
- **Usage** — items dispensed over a date range; group by item/doctor/nurse/category; weekly/monthly trend charts
- **Wastage** — all wastage adjustments with cost estimates and reason breakdown
- **Patient Ledger** — search by patient name or reference, see all charges
- **Expiring** — batches expiring within a configurable number of days
- **Low Stock** — items at or below reorder threshold
- **Valuation** — total stock value at internal and cost prices
- **Movements** — full adjustment history
- **Invoices** — invoice line items CSV export

All tabs support date ranges and CSV export.

### Viewing the Audit Log

**Audit Log** records every significant action — who, what, when, before/after values. Use the search and date filter to investigate specific events. The log is append-only; no user can delete records.

### Purchase Orders

**Raise a purchase order:**
1. Go to **Purchase Orders → New Order**
2. Enter the supplier name (matches existing suppliers), expected date, and notes
3. Add line items — item name, quantity, and unit cost
4. Click **Create Order** (status: Draft)
5. When ready to send: open the order → **Mark as Sent**
   - If the supplier has an email address on file, the PO is emailed to them automatically

**Receiving stock against a PO:**
1. Open the PO → **Record Receipt**
2. Enter quantity received, batch number, and expiry date for each line
3. Click **Record Receipt** — stock levels are updated and adjustment records are created
4. Partially received orders show status **Partial**; further receipts accumulate

**Attachments:** Drag and drop PDF/image/CSV files onto any PO, invoice, or return to attach them for record-keeping.

### Session Management

**My Account → Sessions:** Shows all your active login sessions (device, IP, last seen).
- Click **Revoke** next to any session to force a sign-out from that device
- Click **Sign out everywhere** to revoke all sessions at once

**Admin — revoking a user's sessions:**
Users → find user → **Revoke All Sessions** — immediately invalidates all their tokens.

### Managing Sites (Multi-location)

**Settings → Sites:**
- Add clinic locations (name, address, phone, email)
- Assign staff and inventory items to a site for per-location filtering and reporting
- The default "Main Clinic" cannot be deleted

### Data Retention

**Settings → Data Retention:**
| Setting | Default | Notes |
|---|---|---|
| Audit log retain | 7 years | Records older than this move to archive nightly |
| Patient data retain | 7 years | How long patient names/refs are kept |
| Anonymise patient refs | Off | When on: automatically replaces names with [Anonymised] |

Click **Run Now** to trigger the retention job immediately (useful after first configuration).

The **Database Size** tab shows current table sizes to help plan for future growth.

### Controlled Drug Register

For clinics using Schedule 8 (or S4) drugs:
- Mark items as **Controlled** when adding/editing them; set the schedule (S4, S8, etc.)
- When a nurse fulfils a controlled drug, they must enter a **witness name and role**
- Go to **Reports → Controlled Drug Register** to view or export the full dispensing history (CSV) for regulatory compliance

### Running a Stocktake

See [Stocktake Workflow](#stocktake-workflow) below.

---

## Guide for Doctors

### Placing a Stock Order (New Order screen)

1. Go to **New Order** in the sidebar
2. Browse or search items — type any part of the name, SKU, or category
3. Use **category filter pills** to narrow the grid
4. Tap an item to add it to the order; tap again to increase by the dispense step
5. Use **− / +** in the right panel to fine-tune quantities
6. Set the **Priority** (Low / Normal / High / Urgent) — Urgent sorts to the top of the nurse queue
7. Enter patient name and reference if needed
8. Add any notes for nurses
9. Click **Send to Nurses**

All active nurses are notified (in-browser notification + email if configured).

### Using Templates

Save time on recurring orders:

**Save a template:**
1. Build your basket as usual
2. Type a name in the template box at the bottom of the checkout panel
3. Click the **save icon**

**Load a template:**
1. Click **Load Template**
2. Select from your saved templates — the basket is replaced with the template contents
3. Adjust quantities if needed, then send

Templates are private to your account.

### Barcode Scanning

Connect a USB or Bluetooth barcode scanner. While on the New Order screen, scan any item — it is added to the basket automatically without needing to search.

### Tracking Your Requests

Go to **Requests** to see all your orders:
- **Pending** — waiting for a nurse
- **Accepted** — a nurse has claimed it
- **Fulfilled** — dispensed; click to see the full receipt with batch numbers and charges

### Understanding Quick-Charge Receipts

Nurses can charge stock directly to you without a prior request (e.g., during a consultation). These appear in your Requests list with a `QC-` prefix. Click any receipt to see what was dispensed.

### Reports

**Reports** shows usage data for requests you've raised. Use the date range and group-by options to see patterns.

---

## Guide for Nurses

### Viewing Requests

Go to **Requests** — new requests from doctors appear at the top, sorted by priority (Urgent first).

### Accepting and Fulfilling a Request

1. Click a pending request to open it
2. Click **Accept** — other nurses see it's being handled (moves to `Accepted`)
3. Click **Fulfil** when you have the items:
   - Confirm quantities (adjust if short)
   - Click **Load batches** for batch-tracked items — the system auto-selects the earliest expiring batch (FEFO)
   - Tick **This is a substitution** if you used a different item, and enter a reason
4. Click **Complete Fulfilment**

After fulfilling, a green **"Copy to clinical notes"** panel appears:
```
Stock used
3x Amoxicillin 500mg
1x Gauze Roll 10cm
```
Click **Copy** to copy it to your clipboard for pasting into your clinical notes system.

### Quick Charge (POS screen)

For administering stock during a consultation without a prior doctor request:

1. Go to **Quick Charge** in the sidebar
2. Use the search bar or category pills to find items; tap to add
3. **Barcode scanner** — scan any item to add it instantly
4. Select the **Doctor** from the dropdown
5. Enter patient name/reference if needed
6. Click **Send Receipt to Doctor** — stock deducted, doctor receives notification

### Using Charge Templates

Save common charge baskets as templates so you don't have to search for the same items every time:

**Save a template:**
1. Build your basket (e.g., wound dressing items)
2. Type a name in the template name box at the bottom of the checkout panel
3. Click the **save icon** — the template is saved to your account

**Load a template:**
1. Click **Load Template**
2. Pick from your saved templates — the basket is populated instantly
3. Adjust quantities if needed, then send

Useful templates:
- "Flu clinic" — vaccines + syringes + swabs
- "Wound dressing" — gauze, tape, antiseptic
- "IV line setup" — cannula, saline, giving set

### Recording Wastage

When stock is lost without being used on a patient:

1. Go to **Inventory**
2. Find the item → click the **bin icon** (Record Wastage)
3. Enter the quantity wasted
4. Select the reason
5. Optionally select the batch
6. Click **Record Wastage**

This is important for accurate stock management and compliance records.

### Running a Stocktake

See [Stocktake Workflow](#stocktake-workflow) below.

---

## Common Tasks (All Roles)

### Stocktake Workflow

#### 1. Create the session

**Stocktakes → New Stocktake:**
- **Full** — counts every active item
- **Cycle** — rotating subset (same as Full but for partial runs)
- **Partial** — filter by category or storage location

#### 2. Print the count sheet

- From the stocktake list: click the **printer icon** on any session row
- Or inside the session: click **Count Sheet**

A new browser tab opens with an A4-formatted table showing expected quantities and blank "Counted" columns. Click the **Print** button.

#### 3. Count physically

Walk the clinic with the printed sheet. Write actual counts next to each item.

#### 4. Enter counts

Open the session from the Stocktakes list. Type the counted quantity for each item. The **Variance** column updates automatically (positive = more than expected, negative = less).

Use **Filter uncounted** to focus on remaining items. Use the search bar to find specific items.

#### 5. Complete

Click **Complete**. Choose whether to apply variances as stock adjustments:
- **Yes** — updates `quantity_on_hand` for all items with variance; each creates an audit record
- **No** — saves results for reference without changing stock levels

#### 6. Export (optional)

Click **Export CSV** on the completed session for compliance records.

### Searching for Items

The fuzzy search on the Inventory page, New Order screen, and Quick Charge screen:
- Searches name, SKU, barcode, category, and unit
- Space-separated words all must match — `amox 500` finds "Amoxicillin 500mg" but not "Amoxicillin 250mg"
- Case-insensitive; partial matches work
- Results ranked — name-starts-with matches appear first

### Barcode Scanner (POS & Inventory)

Connect a USB or Bluetooth scanner. While on the New Order or Quick Charge screen (with focus outside a text box), scan any barcode. The app detects the rapid keystroke pattern and:
- Adds the item directly to the basket if found by barcode or SKU
- Falls back to the search box if not found

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Focus the search bar |
| `N` | Open new item / order / request |
| `Esc` | Close any open modal |
| `?` | Show keyboard shortcut help |

Shortcuts do nothing when you're typing inside a form field.

### Installing the App on a Phone or Tablet

Visit the app in your mobile browser:
- **Android (Chrome):** tap the menu → "Add to Home screen"
- **iPhone (Safari):** tap the share button → "Add to Home Screen"
- **Desktop (Chrome/Edge):** click the install icon in the address bar

The app then runs full-screen without browser chrome, with home screen shortcuts to Quick Charge and New Order.

### Changing Your Password

Sidebar → your name (bottom-left) → **My Account** → **Change password**.

Or navigate directly to `/change-password`.

Password requirements: minimum 8 characters with at least one uppercase letter, one lowercase letter, and one number.
