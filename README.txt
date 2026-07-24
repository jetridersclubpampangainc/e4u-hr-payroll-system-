E4U HR Payroll System v2.4 - Payroll Logic Fix

Fixes included:
- Version label updated to v2.4 Cloud.
- SSS, PhilHealth, and Pag-IBIG deductions compute only when the employee has DTR/gross pay in the selected payroll period.
- No DTR / zero gross pay = zero government deductions.
- Payroll run view marks employees with "No DTR in period" for easy checking.
- COE, v2.3 reports, employer shares, and government contribution reports are retained.

Upload/replace these files in GitHub:
- index.html
- app.js
- styles.css
- service-worker.js
- README.txt

Do NOT replace config.js if your live Supabase login is already working.
