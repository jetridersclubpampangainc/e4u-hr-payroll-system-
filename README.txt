E4U HR & Payroll Cloud System v2.5
Full payroll compliance demo package.

IMPORTANT: Do not overwrite config.js on GitHub if your live Supabase login is already working.
Upload/replace only: index.html, app.js, styles.css, service-worker.js, README.txt.

v2.5 additions:
- Payroll mode: Attendance-Based, Daily Rate, Monthly Fixed.
- DTR statuses: Present, Absent, Half Day, Rest Day, Holiday, Leave With Pay, Leave Without Pay, Incomplete.
- Absent deduction logic for monthly/daily payroll.
- Local payroll adjustments per employee: allowances, cash advance, SSS loan, Pag-IBIG loan, company loan, other deduction.
- Estimated withholding tax toggle using annualized graduated compensation table. Verify against BIR before filing.
- Payslip improvements: allowances, withholding tax, cash advance/loans, SSS, PhilHealth, Pag-IBIG.
- Payroll run detail improvements: gross, government deductions, tax, loan/cash, net pay.
- Reports retained: payroll summary, government contributions, 13th month estimate, backups, CSV exports.
- COE templates retained.

Notes:
- This is a browser/Supabase prototype. Some adjustment fields are saved in browser localStorage, not Supabase.
- For production, add dedicated database tables for loans, allowances, audit logs, and payroll adjustment approvals.
