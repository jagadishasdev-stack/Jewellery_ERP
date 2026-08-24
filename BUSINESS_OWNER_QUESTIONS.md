# Questions for Dhanalakshmi Jewellers — before relying on the imported data

These can only be answered by someone who used the old software day-to-day. Everything else on the pre-launch checklist can proceed without these answers, but **don't trust stock-availability or attendance reports until #1 and #2 are resolved** — a wrong guess here means real financial/payroll error, not a cosmetic issue.

## 1. What does `status` mean on a stock item?
In the old system, each item had a `status` field. Real values found: mostly blank, some marked **`S`**, a few `NULL`.
- I initially guessed `S` = Sold, but checked it against actual sales history — items marked `S` show up in a completed sale only about 2% of the time, so that guess is wrong.
- **Question**: What did `S` mean in the old system? (On hold? Sample/display piece? Sent for repair? Something else?) Is there any other status code I should know about that I haven't seen in the sample?

## 2. What does the attendance status code mean?
Each attendance punch had a numeric `statusid` (1 through 7 observed, with 1 and 7 being by far the most common). There's no legend anywhere in the old system's data for what these numbers meant.
- **Question**: What did codes 1–7 correspond to? (Present / Half-day / Late / Leave / Holiday / etc.) Once I know, I'll correct the attendance history — right now every imported record is marked "Present" as a placeholder, which is very likely wrong for a meaningful chunk of them.

## 3. Are the ~17,000 customers who shared one phone number actually different people?
About 17,000 imported customer records had the exact same phone number as another customer already in the list — almost certainly a "walk-in/cash customer" placeholder number reused by staff over the years, not real duplicate contact info.
- **Question**: Should these be treated as one generic "walk-in customer" record going forward, or are some of them real repeat customers whose actual phone number was just never collected? If the latter, it may be worth a phone campaign to collect real numbers for your VIP/repeat buyers among this group.

## 4. Is there a "member"/loyalty club separate from the gold savings scheme?
The old database had a `members`/`member` table with ~3,000 records, separate from the scheme enrollment records already imported.
- **Question**: Was this a separate loyalty club (e.g. a discount card program), or an older/duplicate version of the gold-scheme member list? If it's a real separate program, it hasn't been imported yet.

## 5. Does the business currently file GST e-invoices?
This determines whether the e-Invoice module needs a real government (GSP) connection before go-live, or can stay as-is for now.
- **Question**: Is your annual turnover above the e-invoicing mandate threshold? If yes, which GSP (GST Suvidha Provider) do you use or plan to use?

## 6. Do you use Tally alongside this system?
- **Question**: If yes — what's the plan for keeping the two in sync (this system exports a queue of vouchers/ledger entries ready to push to Tally, but nothing on the Tally side is connected yet)? If no — the Tally Bridge module can be ignored entirely.
