# SMARTLAB — setup and verification

Written for whoever runs this project next: a developer setting it up locally,
or an instructor checking that each part works.

---

## 1. Set up the database

1. Create a Supabase project (free tier is fine).
2. Open **SQL Editor** and run the whole of [`backend/db/schema.sql`](../backend/db/schema.sql).
3. Go to **Project Settings → API** and copy:
   - the **Project URL**
   - the **`service_role`** key (not the `anon` key)

The schema is safe to re-run — every object is created `IF NOT EXISTS`.

> **Why `service_role`?** Every table has Row Level Security enabled with no
> permissive policies, so the browser's `anon` key can read nothing directly.
> All access goes through the Express API, which enforces roles itself. The
> `service_role` key stays on the server and must never appear in React code.

---

## 2. Start the backend

```bash
cd backend
cp .env.example .env
```

Fill in `.env`:

```ini
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
JWT_SECRET=<paste a long random string>
AGENT_API_KEY=<any long random string>
```

Generate the secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Then:

```bash
npm install
npm run seed     # 1 lab, 30 computers, 43 users, bookings, 24h of energy data
npm run dev      # http://localhost:5000
```

You should see `[SMARTLAB] Supabase connection OK`. If the connection fails,
the server exits with the reason rather than starting in a broken state.

---

## 3. Start the frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev      # http://localhost:5173
```

---

## 4. Demo accounts

| Role    | Email                | Password     |
|---------|----------------------|--------------|
| Admin   | admin@smartlab.edu   | Admin@1234   |
| Faculty | faculty@smartlab.edu | Faculty@1234 |
| Student | student@smartlab.edu | Student@1234 |

The login screen lists these and fills the form when you click one.

Seeded bulk accounts all use `Smartlab@123`.

---

## 5. Live monitoring data (optional)

The dashboards show seeded telemetry immediately. To watch them update live,
run the agent simulator in a third terminal:

```bash
cd backend
npm run simulate
```

It posts a heartbeat for every computer every 15 seconds — exactly the request
a real monitoring agent on each lab PC would send. Watch **Admin → Monitoring**
and **Admin → Energy** change while it runs.

---

## 6. What to test, phase by phase

### Authentication
- Sign in with each demo account; confirm you land on `/admin`, `/faculty` or
  `/student` respectively.
- Enter a wrong password → *"Invalid email or password."*
- Register a new student at `/register` → you are signed in automatically.
- Sign out, then visit `/admin/dashboard` directly → redirected to `/login`.

### Role-based access control
This is the part worth testing properly, because the UI hiding a button proves
nothing.

- Sign in as the **student**, open DevTools → Application → Local Storage, copy
  `smartlab_token`, then:

  ```bash
  curl -i http://localhost:5000/api/users -H "Authorization: Bearer <student token>"
  ```

  Expect **403** with *"You do not have permission to perform this action."*

- Same token against `/api/monitoring`, `/api/energy/summary` and
  `/api/admin/audit-logs` → all **403**.
- No token at all → **401**.
- Edit the token by one character → **401**.
- Type `/admin/dashboard` in the address bar while signed in as a student →
  bounced back to `/student/dashboard`.

A suite covering all of the above ran clean during development: 28 checks,
including credential handling, token forgery, RBAC on every admin route, agent
authentication, and confirmation that errors never leak stack traces.

### Computer management (admin)
- **Admin → Computers**: switch between grid and table views.
- Add a computer; try a number already used in that lab → conflict message.
- Set one to `MAINTENANCE`; confirm students can no longer book it.
- Delete one that has active bookings → refused, with an explanation.

### Booking system
- As a **student**, book an available computer.
- Book the *same computer, same slot* again → *"This computer is already booked
  during the selected time."*
- Try a date in the past → refused.
- Try booking more than 3 active slots → limit message (configurable in
  **Admin → Settings → Booking rules**).
- As **admin**, go to **Bookings**, approve one and reject another with a note.
- Sign back in as the student → notification bell shows the outcome.

By default faculty bookings auto-approve and student bookings need approval.
Both are switches in **Admin → Settings**.

### Monitoring
- Run `npm run simulate`, open **Admin → Monitoring**, and watch CPU, RAM and
  temperature move.
- Stop the simulator, wait ~2 minutes → machines flip to `OFFLINE` on their own.
- Click any tile for the drilldown with power and temperature history.

### Energy
- **Admin → Energy**: switch between Today / This week / This month / Custom.
- Check the cost figures respond when you change the kWh rate in
  **Admin → Settings → Energy**.

### Reports
- **Admin → Reports**: change the date range, then **Export CSV**.

### Responsiveness
- Narrow the window below ~900px → the sidebar collapses to a drawer.
- Check a phone width (~400px) on the student dashboard and booking form.

---

## 7. Performance notes

The system is built for 1,000+ users and thousands of bookings:

- **Every list endpoint is paginated** and caps `limit` at 100 server-side, so
  no client can request the whole table.
- **Dashboard counters use `head: true` COUNT queries** — the rows are never
  transferred.
- **Indexes** cover every filtered column: `users.email`, `users.role`,
  `bookings.user_id`, `bookings.computer_id`, `bookings.booking_date`,
  `bookings.status`, a composite `(computer_id, booking_date, status)` for
  conflict detection, and `(computer_id, recorded_at)` for energy.
- **Monitoring is push-based.** Agents post heartbeats; the browser reads one
  aggregated snapshot every 15s and **stops entirely when the tab is hidden**.
- **Charts are code-split** into a separate bundle that only admin pages load.

---

## 8. Production build

```bash
cd frontend && npm run build     # outputs dist/
cd backend  && NODE_ENV=production npm start
```

Before deploying, set `CORS_ORIGIN` to the real frontend domain and use fresh
values for `JWT_SECRET` and `AGENT_API_KEY`.
