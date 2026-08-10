E4U HR & Payroll Cloud System v2.6.8 Clean Rebuild
Generated: 2026-08-10

WHAT THIS FIXES
- Removes old service worker/cache that caused Failed to fetch after updates.
- Keeps v2.6.4 direct salary payroll guard.
- Monthly Fixed mode computes Basic Salary even without DTR.
- Adds reset.html for browser cache cleanup.
- Does not include config.js to avoid breaking the existing Supabase connection.

UPLOAD TO GITHUB
Upload/replace these files/folders only:
- index.html
- app.js
- styles.css
- service-worker.js
- reset.html
- README.txt
- manifest.json
- assets/

IMPORTANT
DO NOT upload/replace config.js in Jojo's existing repo. The current config.js already contains the Supabase URL and anon public key.

AFTER UPLOAD
1. Wait 1-3 minutes.
2. Open: https://jetridersclubpampangainc.github.io/e4u-hr-payroll-system-/reset.html
3. Wait for Reset complete.
4. Click Open E4U HR Payroll.
5. Login with the existing account. Do not use Create Account if the account already exists.

PAYROLL TEST
1. Go to Payroll.
2. Set Payroll Mode to Monthly Fixed - use Basic Salary.
3. Click Preview Salary.
4. If preview has Gross/Net amounts, click Compute & Save Payroll with a new Period Label.

NOTES
If Failed to fetch still appears during Login/Create Account, the browser/network cannot reach Supabase. Test by opening the Supabase project URL or try another internet connection/hotspot.


V2.6.8 UPDATE:
- Added Forgot Password / Send Reset Link to login screen.
- Added Update Password flow when user opens Supabase reset email link.
- Keep config.js unchanged.
- In Supabase Authentication URL settings, add this redirect URL if password reset link does not return to the app:
  https://jetridersclubpampangainc.github.io/e4u-hr-payroll-system-/
