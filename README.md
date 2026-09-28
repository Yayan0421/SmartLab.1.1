# SMARTLAB — Smart Computer Management System

One React frontend (`:5173`) + one Node/Express API (`:5000`) + one Supabase PostgreSQL database.

Roles: `super_admin`, `admin`, `faculty`, `student` — all served by the same app via routes `/admin`, `/faculty`, `/student`. Super admins share the `/admin` area and see three extra pages.

## Quick start

```bash
# 1. Database — run backend/db/schema.sql in the Supabase SQL editor
# 2. Backend
cd backend
cp .env.example .env      # fill in Supabase URL + service role key + JWT_SECRET
npm install
npm run seed              # creates demo users, lab, 30 computers, sample data
npm run dev               # http://localhost:5000

# 3. Frontend (second terminal)
cd frontend
cp .env.example .env
npm install
npm run dev               # http://localhost:5173
```

## Demo accounts (created by `npm run seed`)

| Role        | Email                     | Password         |
|-------------|---------------------------|------------------|
| Super Admin | superadmin@smartlab.edu   | SuperAdmin@1234  |
| Admin       | admin@smartlab.edu        | Admin@1234       |
| Faculty     | faculty@smartlab.edu      | Faculty@1234     |
| Student     | student@smartlab.edu      | Student@1234     |

Roles run `super_admin` → `admin` → `faculty` / `student`. A super admin owns
administrator accounts, system settings and the audit log; an admin runs the
laboratory day to day. See `backend/db/migrations/001_super_admin.sql` when
upgrading a database that was created before the role existed.

## Layout

```
backend/    Express API, JWT auth, RBAC, validators, Supabase data layer
frontend/   React + Vite SPA, role layouts, protected routes
```

See `docs/TESTING.md` for per-phase verification steps.
