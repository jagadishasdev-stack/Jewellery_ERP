# New Modules — How to Use

Reference doc for the 12 modules added on top of the existing ERP (Pawnbroking, Insurance/AMC, HR/Payroll, CRM, Bank/Cheque, Rate Booking/Agent Commission, Compliance, Manufacturing/BOM, Inventory Ops, Tally Bridge, Permission Overrides). Each one is also reachable **inside the app itself** from **Help → 🆕 New Modules**, where clicking "Start" opens the real screen and plays an interactive walkthrough — this document is the same information for anyone reading outside the app.

Every screen below also has a floating **"?"** button (bottom-right corner) that replays its own walkthrough at any time.

---

## Pawnbroking / Gold Loans — `/pawnbroking`
1. **New Loan** — search/select the customer, enter loan amount, interest rate %/month, tenure, and list every pledged item (description, weight, purity, estimated value).
2. The loan list shows **outstanding principal** and **due date** at a glance; filter by Active/Redeemed/Overdue/Auctioned.
3. Click **Manage** on a loan to see pledged items, transaction history, and the **interest currently owed** (calculated live from elapsed time × rate).
4. Record a transaction: **Interest Receipt**, **Part Payment**, or **Full Redemption** — the outstanding balance and interest-paid-upto date update automatically; a full redemption marks the loan Redeemed and every pledged item Returned.

## Insurance & AMC — `/insurance-amc`
1. Set up **Insurance Policies** (insurer, premium rate %) and **AMC Plans** (duration, price, free services included) first.
2. **Customer Insurance**: enroll a customer against a policy — premium is computed from the policy's rate automatically if you don't enter one.
3. **AMC Enrollments**: enroll a customer in a plan; click **Log Service Visit** each time they come in for a free cleaning/polish — tracks usage against the plan.

## HR, Attendance & Payroll — `/hr-payroll`
1. **Attendance**: pick a date, set each staff member's status (Present/Absent/Half Day/Leave/Holiday).
2. **Salary Structure**: per staff member — Basic/HRA/Conveyance/Other Allowance, PF %, ESI %, effective date.
3. **Incentive Slabs**: sale-amount ranges → incentive % (used when a sale's incentive is calculated).
4. **Payroll**: pick month/year, click **Generate Payroll** — computes, per staff member: days present → pro-rated gross salary, PF/ESI deductions from their structure, any pending sales incentives pulled in, and net salary. Review the full breakdown, then **Finalize**.

## CRM — Leads & Feedback — `/crm`
1. **Leads**: capture a walk-in/enquiry (name, mobile, source). Click **Convert to Customer** once they're ready to buy — creates the real customer record in one step.
2. **Follow-ups**: log every call/WhatsApp/visit against a lead or existing customer, with an optional next-follow-up date.
3. **Feedback**: log ratings/complaints, mark **Resolved** once handled.

## Bank Accounts & Cheque Register — `/bank-cheque`
1. Register your shop's own **bank accounts** first (opening balance becomes the starting running balance).
2. **Log a cheque** — Received or Issued, with party, cheque number, date, amount.
3. Move a Received cheque: **Deposit** → **Clear** (credits your bank account balance automatically) or **Bounce** (with a bounce charge).

## Rate Booking & Agent Commission — `/rate-agent`
1. Register **Agents** with their default commission %.
2. **Rate Booking**: lock today's metal rate for a customer's future purchase, with a "Valid Until" date; mark **Utilized** once they actually buy.
3. **Agent Commissions**: calculate commission owed on a sale or scheme referral from the agent's rate; mark **Paid** once settled.

## Compliance: HSN, e-Invoice & Loyalty — `/compliance`
1. **HSN Codes**: a shared master of HSN codes and GST % — edit once, used everywhere instead of free-text per item type.
2. **e-Invoice Log**: enter a Sale ID, click Generate. **No live GSP/government connection exists in this environment** — it logs the attempt and states that plainly rather than fabricating a fake IRN. This is the real integration point for whoever wires up an actual GSP account later.
3. **Loyalty Slabs**: define points-per-₹ by amount range (optionally by metal type); use the calculator on the page to test any sale amount.

## Manufacturing Efficiency / BOM — `/manufacturing`
1. **Departments**: your workshop's stages (Casting, Filing, Polishing, Setting...) in routing order.
2. **BOM**: a Bill of Materials per design — standard gold weight, expected wastage %, labour, with a stage-by-department breakdown.
3. **Production**: open a transaction with input weight; when the piece returns, click **Complete** and enter the actual output weight — wastage % is derived automatically.
4. **Melting/Refining**: log a batch's weight in/out — loss % computed. **Moulds**: track rubber mould stock for casting.

## Certification, Reorder & RFID — `/inventory-ops`
1. **Gem Certificates**: log a GIA/IGI/HRD certificate against an ornament (kept separate from HUID, which is the gold hallmark — a different scheme).
2. **Reorder Requests**: click **Auto-Scan Low Stock** — checks every item type/design combination against its minimum stock level and raises a request for anything running low, automatically skipping combos that already have an open request.
3. **RFID Scans**: log a scan by tag (Stock Check/Sale/Transfer/Audit/Gate) — matches against your stock automatically if that tag belongs to a real item.
4. **Card Charges**: set the surcharge % your shop applies per card network.

## Tally Accounting Bridge — `/tally`
1. **Configuration**: enter your Tally server's LAN IP/port, switch on **Sync Enabled**.
2. **Sync Log**: every voucher/ledger/stock-item queued for Tally shows here. **There is no live Tally connection in this environment** — entries stay Pending until an actual Tally-side integration is built to pick them up. This bridge is the real, working handoff point for that future work, not a finished integration.

## Permission Overrides — `/permissions`
1. **Module Overrides**: select a staff member, grant them extra View/Add/Edit/Delete/Approve access on a specific module beyond their normal role. Only Super Admin / Client Admin accounts can do this.
2. **Bin/Tray Access**: restrict which physical trays/hidden locations a staff member can access. *(Honest gap: there's no picker yet for choosing a specific tray/location by name — the Tray/Hidden Location master screens that would feed it don't exist yet.)*

---

## What's intentionally NOT pretended to work
- **e-Invoice generation** and **Tally sync** do not connect to any real external system — no GSTN/GSP credentials and no reachable Tally server exist in this environment. Both log real data and state clearly why they can't complete, rather than faking success.
- **Bin/Tray access picker** — flagged in the UI itself, not hidden.
- None of this replaces the still-outstanding items from earlier: the actual sync engine (local↔cloud) has no running service yet, and two data-quality questions from the DLJ import (`stock.status`, `attendance.statusid` meanings) still need the business owner's input.
