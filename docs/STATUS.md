# Where things stand

Last updated: 28 September 2026

## The seven revisions

All done, all checked in a browser.

| # | Asked for | Where it lives |
|---|---|---|
| 1 | No self registration | `POST /api/auth/register` removed |
| 2 | Not for public consumption | landing kept, its buttons say Sign In |
| 3 | Remove user registration | `/register` and `/admin/register` are 404 |
| 4 | Super admin → admin → user | `backend/utils/roles.js`, `docs/ROLES.md` |
| 5 | Remove the Computers page | gone from all three roles |
| 6 | Booking → Reservation | table, enum, routes, file names |
| 7 | Auto refresh after approve | `backend/services/reservationEvents.js` |

Accounts are created by an administrator in **Users**, and administrator
accounts by a super admin in **Administrators**. Nobody signs themselves up.

## Sign in

Every role uses one of two doors: `/admin/login` for both administrator
roles, `/login` for faculty and students. The API refuses the wrong door.

| Role | Email | Password |
|---|---|---|
| Super Admin | superadmin@smartlab.edu | SuperAdmin@1234 |
| Admin | admin@smartlab.edu | Admin@1234 |
| Faculty | faculty@smartlab.edu | Faculty@1234 |
| Student | student@smartlab.edu | Student@1234 |

These come from `backend/db/seed.js` and are in the repository, so change
them before the system holds anything real.

## Git

```
GitHub    main                d3ac868   (pre-revision, nothing deployed)
          feat/reservations   87c8a94   (everything, backed up)

Laptop    main                87c8a94   (merged, 6 commits ahead)
```

Six commits, oldest first:

```
fa3b9d0  Read the real watts off a meter, where one is fitted
04f5d08  Put a super administrator above the administrators
feef778  Take away the computer screens and the sign-up
0082ea0  Call them reservations, all the way down
f483ef3  Push a decision to the screen waiting for it
87c8a94  Rename the constraints along with the table
```

## Deploying, when you decide to

**The deployed backend is broken until this happens.** There is one
Supabase, it has been migrated to `reservations`, and the code on Render
still asks for `bookings`. Localhost is fine; the hosted site is not.

1. `git push` — this puts `main` on GitHub and starts the auto-deploy
2. Wait for Render and the front-end host to finish
3. **Reload the kiosk device.** It asks for `/api/bookings`, which is gone.
   Restarting it is not enough; the page has to be reloaded.

## Migrations

Already run on this database:

- `001_super_admin.sql` — two steps, run separately
- `009_rename_bookings_to_reservations.sql` — one paste

Still to run:

- `010_drop_mac_address.sql` — one statement, **not reversible**

Both are safe to run again. A fresh database needs neither: `schema.sql`
already has the super_admin role and the reservations table.

## Demoing across two laptops

The API address is not hard-coded. It is taken from whatever address the
page was opened on, so the second laptop must open the app by IP, not by
`localhost`.

1. This laptop's Wi-Fi address: check `ipconfig`, the **Wireless LAN
   adapter Wi-Fi** entry. It was `192.168.1.6`, and DHCP can change it.
2. On the other laptop, open `https://<ip>:5000/api/health` **first** and
   accept the certificate warning. The certificate is self-signed, and
   until it is accepted every API call from that machine is refused even
   though the page itself loads.
3. Then open `https://<ip>:5173` and accept the warning again. Different
   port, separate acceptance.

Two things that bite:

- **Do not set `VITE_API_URL`.** Pointing it at localhost makes the second
  laptop look for a backend on itself.
- **The firewall rule must cover the Public profile.** The Wi-Fi here is
  classified Public, and a rule scoped to Private silently drops the
  connection - which looks like the page loading forever, not like an
  error.

If the two machines cannot ping each other at all, the Wi-Fi has client
isolation. No setting fixes that; use a phone hotspot.

## Things deliberately left as they are

- **No UI for managing computers.** The pages were removed on request, so
  adding a machine or putting one into MAINTENANCE is a database job. The
  API routes are still there, admin-guarded, so restoring the screen later
  is a routing change rather than a rewrite.
- **Historical migrations were not rewritten.** They record what already
  ran. Only `schema.sql` was updated, because that is the fresh-install
  path.
- **No Wake-on-LAN.** The MAC address was kept for one purpose, the
  "Power on" button that woke a switched-off machine, and both are gone. A
  MAC identifies a physical device, so once the reason to hold one
  disappeared, holding it was not defensible. Shut down, restart, freeze,
  unfreeze, message and screenshot are unaffected - they are queued and
  collected by a running agent, which never needed a MAC.
- **`/admin/laboratories` is open to both administrator roles** but its
  only screen was the Settings tab, which is now super-admin only. An
  ordinary admin can no longer create a laboratory from the UI.

## Not verified

- The energy sensor has never spoken to real hardware. The Modbus framing,
  the parser and the maths are tested against synthetic frames; the PZEM
  itself is not.
- The live feed has not been tried across two machines, only in one
  browser.
