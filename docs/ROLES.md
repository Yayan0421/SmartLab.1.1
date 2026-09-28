# Roles and permissions

SMARTLAB has four roles in one hierarchy:

```
super_admin  ->  admin  ->  faculty / student
```

## In plain language

Think of the laboratory as a building.

- **Super Administrator** owns the building. They hold the keys to the key
  cabinet: they decide who becomes an administrator, they change the house
  rules, and they can read the logbook of everything anyone has done. There
  is always at least one of them, and the system refuses to let the last one
  be removed, demoted or switched off — otherwise nobody could ever appoint
  another.
- **Administrator** runs the building day to day. Computers, bookings,
  monitoring, energy, reports, and the student and faculty accounts are all
  theirs. What they cannot do is hand out keys to the key cabinet: they
  cannot create, edit or even see administrator accounts, and they cannot
  promote anybody — including themselves — to administrator.
- **Faculty** and **Student** are the people who use the laboratory. They
  book computers and manage their own profile.

The separation exists so that the person who *runs* the laboratory is not
automatically the person who *controls who runs it*. An administrator who
makes a mistake, or whose account is taken over, cannot quietly create a
second administrator account for themselves — and whatever they do try is
written to the audit log either way, including the attempts that were
refused.

Super admins do not have their own section of the site. They sign in at the
same administrator portal and see the same screens, plus three more.

## Permission matrix

| Capability | Super Admin | Admin | Faculty | Student |
|---|:---:|:---:|:---:|:---:|
| Sign in at `/admin/login` | ✅ | ✅ | ❌ | ❌ |
| Sign in at `/login` | ❌ | ❌ | ✅ | ✅ |
| Dashboard | ✅ | ✅ | own | own |
| Monitoring | ✅ | ✅ | ❌ | ❌ |
| Computers (manage) | ✅ | ✅ | view | view |
| Bookings — all | ✅ | ✅ | ❌ | ❌ |
| Bookings — own | ✅ | ✅ | ✅ | ✅ |
| Bookings auto-approved | ✅ | ✅ | ❌ | ❌ |
| Energy | ✅ | ✅ | ❌ | ❌ |
| Reports | ✅ | ✅ | ❌ | ❌ |
| Users — faculty & students | ✅ | ✅ | ❌ | ❌ |
| Users — view administrators | ✅ | ❌ | ❌ | ❌ |
| Users — create/edit administrators | ✅ | ❌ | ❌ | ❌ |
| Users — promote anyone to admin | ✅ | ❌ | ❌ | ❌ |
| **Administrators** page | ✅ | ❌ | ❌ | ❌ |
| **Audit Logs** page | ✅ | ❌ | ❌ | ❌ |
| **Settings** page | ✅ | ❌ | ❌ | ❌ |
| Own profile | ✅ | ✅ | ✅ | ✅ |
| Laboratory QR card | ❌ | ❌ | ✅ | ✅ |
| Receives "new booking" notifications | ✅ | ✅ | ❌ | ❌ |

"own" means the person's own records only.

### API routes

| Route | Guard |
|---|---|
| `GET /api/admin/audit-logs` | `requireSuperAdmin` |
| `GET /api/admin/settings` | `requireSuperAdmin` |
| `PATCH /api/admin/settings/:key` | `requireSuperAdmin` |
| `GET /api/admin/laboratories` | `requireAdmin` (both roles) |
| `POST /api/admin/laboratories` | `requireAdmin` (both roles) |
| `GET /api/admin/reports` | `requireAdmin` (both roles) |
| `/api/users/*` | `requireAdmin`, then per-target checks in the controller |

The per-target checks are what stop a plain admin from touching an
administrator account even though the route itself lets them in:
`assertCanActOn`, `assertCanAssignRole` and `assertAdminSurvives` in
`backend/controllers/userController.js`.

## Running the migration

An existing database needs `backend/db/migrations/001_super_admin.sql`. A
fresh install does not — `schema.sql` already includes the role.

**The two steps must be run separately.** PostgreSQL will not let a
transaction use an enum value that the same transaction added, and the
Supabase SQL editor wraps whatever you run in one transaction.

1. Open the Supabase SQL editor.
2. Paste **step 1** only, and press Run:
   ```sql
   alter type user_role add value if not exists 'super_admin';
   ```
   Wait for it to report success.
3. Clear the editor, paste **step 2** (the `insert into roles …` block), and
   press Run.
4. Create your first super admin, either by running `npm run seed` in
   `backend/`, or by promoting an existing account:
   ```sql
   update users set role = 'super_admin' where email = 'you@example.edu';
   ```

Both steps are safe to run more than once.

## Audit actions

Actions on administrator accounts are recorded under their own names so
they can be found without reading through ordinary user activity:

| Action | When |
|---|---|
| `admin.create` | An administrator account was created |
| `admin.update` | An administrator account was edited |
| `admin.role_change` | An administrator's role changed (with `from` and `to`) |
| `admin.reset_password` | An administrator's password was reset |
| `admin.deactivate` | An administrator account was deactivated |
| `admin.permission_denied` | Somebody tried to reach an administrator account and was refused |

`admin.permission_denied` is written **before** the request is rejected, so
a refused attempt still leaves a trace. The equivalent `user.*` actions
cover faculty and student accounts.

## Test checklist

### Sign-in and menus

- [ ] `superadmin@smartlab.edu` / `SuperAdmin@1234` signs in at `/admin/login`
      and lands on `/admin/dashboard`.
- [ ] The sidebar shows a **Super Admin** group: Administrators, Audit Logs,
      Settings. The role reads "Super Administrator".
- [ ] `admin@smartlab.edu` / `Admin@1234` signs in and sees **no** Super Admin
      group, and no Settings link. The role reads "Administrator".
- [ ] Faculty and student accounts are refused at `/admin/login` and work at
      `/login`.
- [ ] Neither administrator account can sign in at `/login`.
- [ ] The avatar in the top bar opens `/admin/profile` for a super admin
      (not `/super_admin/profile`).
- [ ] Neither administrator sees a "My laboratory card" section on their
      profile.

### Direct URLs

- [ ] Signed in as a plain admin, typing `/admin/settings`,
      `/admin/administrators` or `/admin/audit-logs` redirects to the
      dashboard.

### API, bypassing the UI (Postman or curl, with an admin token)

- [ ] `GET /api/admin/audit-logs` → **403**
- [ ] `GET /api/admin/settings` → **403**
- [ ] `PATCH /api/admin/settings/booking` → **403**
- [ ] `GET /api/admin/reports` → **200** (still allowed)
- [ ] `GET /api/users?role=admin` → **403**
- [ ] `GET /api/users` → **200**, and the results contain no administrators
- [ ] `POST /api/users` with `"role": "admin"` → **403**
- [ ] `PATCH /api/users/{a-student-id}` with `"role": "admin"` → **403**
- [ ] `PATCH /api/users/{the-admin-id}` (any change) → **403**
- [ ] `DELETE /api/users/{the-admin-id}` → **403**
- [ ] Each 403 above leaves an `admin.permission_denied` row in the audit log.

### The last super admin

With exactly one active super admin:

- [ ] Deactivate on their row in **Administrators** is disabled, and the
      tooltip explains why.
- [ ] `DELETE /api/users/{super-admin-id}` as that super admin → **403**
      ("You cannot deactivate your own account").
- [ ] Create a second super admin, then delete the first → **succeeds**.
- [ ] Reduce back to one, then `PATCH` that account to `"role": "admin"`
      → **409**.
- [ ] `PATCH` it to `"status": "inactive"` → **409**.

### Nothing else broke

- [ ] Kiosk check-in and check-out still work.
- [ ] A student books a computer; it arrives as **PENDING**.
- [ ] A super admin books a computer; it is auto-approved, like an admin's.
- [ ] Both the admin and the super admin receive the new-booking notification.
- [ ] Monitoring, Energy, Computers and Reports all load for both roles.
- [ ] QR cards and avatars still work for faculty and students.
