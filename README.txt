E4U HR & Payroll System v2.1

Added: Certificate of Employment (COE) generator with printable COE template.

E4U HR & Payroll Management System v2
Cloud Prototype with Login + Supabase Database

Files:
- index.html              Main app
- styles.css              UI design
- app.js                  Application logic
- config.js               Supabase URL and anon key
- supabase-schema.sql     Database tables, functions, RLS policies
- SUPABASE_SETUP_GUIDE.txt Step-by-step setup
- manifest.json           PWA metadata
- service-worker.js       Basic PWA service worker
- assets/icon.svg         App icon

How to start:
1. Create Supabase project.
2. Run supabase-schema.sql in Supabase SQL Editor.
3. Paste your Project URL and anon key in config.js.
4. Open index.html in Chrome.
5. Create first account.
6. Create company profile.

Build type:
- Static browser web app
- Uses Supabase JS CDN
- No Node install required
- Can be deployed to Netlify, Vercel static hosting, GitHub Pages, or run locally

Security note:
The app uses Supabase anon public key with Row Level Security.
Never paste service_role key into config.js.
