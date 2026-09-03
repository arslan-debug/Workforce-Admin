# Sprint Command Centre — Admin Panel

A workforce rotation dashboard with a real database behind it: add, edit, and
delete employees and daily attendance, with a login screen so only your
client can access it. This replaces the earlier file-upload version — data
now lives in Supabase (a hosted Postgres database), not in the browser.

This is a real project now, not a single chat artifact — set it up once,
then your client just opens a URL and logs in.

---

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up (free, no credit card).
2. Click **New Project**. Pick any name/region, set a database password (save
   it somewhere — you likely won't need it day-to-day, but keep it safe).
3. Wait ~2 minutes for the project to finish provisioning.

## 2. Create the database tables

1. In your Supabase project, open **SQL Editor** in the left sidebar.
2. Click **New query**, paste in the entire contents of `schema.sql` (in this
   folder), and click **Run**.
3. You should see `employees` and `attendance` appear under **Table Editor**.

## 3. Get your API keys

1. In Supabase, go to **Settings > API**.
2. Copy the **Project URL** and the **anon / public** key (not the
   `service_role` key — that one must never go in frontend code).
3. In this project folder, copy `.env.example` to a new file called
   `.env.local`, and paste your values in:
   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

## 4. Create your client's login

The app requires a login. You (not the client) create their account:

1. In Supabase, go to **Authentication > Users > Add user**.
2. Enter your client's email and set a password. Uncheck "Auto Confirm" only
   if you want them to verify by email first — for a fast start, leave it
   checked so the account is ready immediately.
3. Give them the email + password directly (not through this repo).

Add more users the same way if more than one person needs access.

## 5. Run it locally to test

```bash
npm install
npm run dev
```

Open the printed `localhost` address, log in with the account from step 4,
and confirm you can see the dashboard.

## 6. Bring in your existing data

Log in, click **Import Excel** in the top bar, and select a workbook shaped
like the original roster (an "Employee Name"/"Name" column, a "Rotation"/
"Rotation Cycle" column, etc., plus one column per day). It reads and saves
straight to the database — safe to re-run if you need to re-import.

From here on, day-to-day changes go through the admin panel itself (Add
Employee, the Edit/Delete buttons on an employee's detail panel, and the
attendance dropdowns) — Import Excel is just for bulk-loading history.

## 7. Deploy it so your client can just open a URL

The simplest path is [Vercel](https://vercel.com) (free for this size of
project):

1. Push this project to a GitHub repository.
2. On [vercel.com](https://vercel.com), click **Add New > Project**, and
   import that repository. Vercel detects Vite automatically — no config
   needed.
3. Before deploying, open **Environment Variables** and add the same two
   values from your `.env.local`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**. You'll get a URL like `your-project.vercel.app` —
   that's what you give your client.

Any other static host (Netlify, Cloudflare Pages, your own server) works the
same way: `npm run build` produces a `dist` folder, and the same two
environment variables need to be set wherever it's hosted.

## Notes

- **Free tier limits:** Supabase's free database pauses after 7 days with no
  activity (a one-click "resume" in the dashboard fixes it, but it means a
  brief downtime if nobody opens the app for a week). Daily use, as
  described, keeps it awake and this won't come up. The 500MB storage limit
  is far more than this dataset will need for years.
- **Adding more admins:** repeat step 4 for anyone else who needs a login.
  There's currently no in-app way to manage users — that's done from the
  Supabase dashboard.
- **Backups:** the free tier doesn't include automatic backups. If that
  matters, Supabase's Pro plan ($25/mo) adds daily backups — worth it once
  this becomes the system of record.
