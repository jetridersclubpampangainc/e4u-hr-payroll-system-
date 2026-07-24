E4U HR & Payroll System v2.2

Added in v2.2:
- Automatic SSS employee share deduction
- Automatic PhilHealth employee share deduction
- Automatic Pag-IBIG employee share deduction
- Payslip now displays SSS, PhilHealth, and Pag-IBIG separately
- Payroll run view now shows SSS, PhilHealth, and Pag-IBIG columns
- Service worker updated to avoid old config.js cache problems

Included from v2.1:
- Certificate of Employment (COE) generator with printable COE template

Files:
- index.html              Main app
- styles.css              UI design
- app.js                  Application logic
- config.js               Supabase URL and anon key
- supabase-schema.sql     Database tables, functions, RLS policies
- SUPABASE_SETUP_GUIDE.txt Step-by-step setup
- manifest.json           PWA metadata
- service-worker.js       PWA service worker
- assets/icon.svg         App icon

GitHub update instruction:
Upload/replace these files only:
- index.html
- app.js
- styles.css
- service-worker.js
- README.txt

Do not replace config.js if your live Supabase login is already working.

Deduction notes:
- SSS employee share is computed from monthly salary basis using 5% of estimated MSC, capped at 35,000 MSC and minimum 5,000 MSC for positive salaries.
- PhilHealth employee share is computed as 2.5% of monthly basic salary basis, with 10,000 floor and 100,000 ceiling.
- Pag-IBIG employee share is computed as 2% of salary, capped by the setting value. Default cap is 200.
- Withholding tax and cash advance remain zero in this patch and can be added in the next patch.

Security note:
The app uses Supabase anon public key with Row Level Security.
Never paste service_role key into config.js.
