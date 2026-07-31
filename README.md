# HR Candidate Management Dashboard

This is a Vite + React + TypeScript project scaffold for a HR Candidate Management Dashboard with Supabase integration.

Start:

```
npm install
npm run dev
```

Set environment variables in a `.env` file:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=public-anon-key
```

Authentication

Authentication uses Supabase. Configure the following environment variables in `.env`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=public-anon-key
```

Features included in scaffold:
- Supabase client
- Auth provider
- Excel parser utility using SheetJS + Zod
- Basic Upload page with preview
- Candidate service with CRUD stubs
- Layout components (Navbar, Sidebar)
- SQL schema for Supabase

Supabase setup
---------------

1. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. Apply the database migration at `supabase/migrations/001_create_schema.sql` to your Supabase Postgres instance. Example using `psql`:

```bash
# from project root
psql "$SUPABASE_DB_URL" -f supabase/migrations/001_create_schema.sql
```

Or use the Supabase CLI:

```bash
supabase db reset --project-ref your-project-ref --file supabase/migrations/001_create_schema.sql
```
