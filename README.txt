E4U HR & Payroll Cloud System v2.3

Added in v2.3:
- Version label updated to v2.3 Cloud.
- Payroll v2.3 rules screen.
- SSS, PhilHealth, and Pag-IBIG employee deductions retained from v2.2.
- Employer share estimates for SSS, EC, PhilHealth, and Pag-IBIG in payroll run detail.
- Reports: Payroll Summary CSV, Government Contributions CSV, 13th Month Estimate CSV.
- COE templates: without compensation, with compensation, loan/bank, visa/travel, employment requirement.

Upload to GitHub Pages:
1. Upload/replace index.html, app.js, styles.css, service-worker.js, README.txt.
2. Do NOT replace config.js on the live repo if your Supabase login is already working.
3. Commit changes.
4. Open the live site and press Ctrl + Shift + R.
5. Create a NEW payroll run to apply current deduction computations. Old payroll runs remain unchanged.

Notes:
- The employer share and 13th month reports are estimates based on loaded employee/payroll data.
- This patch does not require new Supabase SQL columns.
