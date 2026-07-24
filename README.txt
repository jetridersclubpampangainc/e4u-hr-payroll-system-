E4U HR & Payroll Cloud System v2.6 — Production Payroll + Approval Patch

UPLOAD TO GITHUB
1. Upload/replace these files only:
   - index.html
   - app.js
   - styles.css
   - service-worker.js
   - README.txt
2. Do NOT replace config.js if your live Supabase login is already working.
3. After GitHub commit, open the live site and press Ctrl + Shift + R.

WHAT IS NEW IN v2.6
- v2.6 Cloud label.
- Payroll approval workflow: Draft, For Review, Approved, Released, Voided.
- Payroll recompute helper: creates a new recomputation run using the same period.
- Payroll adjustments can be Supabase-backed when v2.6 SQL add-on is installed.
- Browser-safe fallback remains available if the add-on SQL is not installed yet.
- Audit trail export for payroll actions and workflow changes.
- Payroll approval register export.
- Payroll adjustments export.
- Loan balance starter export.
- v2.5 payroll compliance retained: payroll modes, DTR statuses, allowances, loans, SSS, PhilHealth, Pag-IBIG, tax estimate, COE, reports.

OPTIONAL PRODUCTION DATABASE UPGRADE
For database-backed workflow/adjustments/audit logs, run this file in Supabase SQL Editor:
- supabase-v2.6-addon.sql

The app will not break if you have not run the add-on SQL yet. It will use local browser fallback for the new v2.6 features until the tables exist.

IMPORTANT
Old payroll runs remain as they were computed. To use updated logic, create a new payroll run.
