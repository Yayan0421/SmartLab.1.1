# Opening the kiosk from another device

The kiosk is a normal page in the app, so any device on the same Wi-Fi can
open it — a tablet on the laboratory counter, a phone, a second PC. Nothing
needs to be deployed; the two dev servers already listen on every network
interface.

## 1. Start both servers on the host PC

```bash
cd backend   && npm run dev     # API on :5000
cd frontend  && npm run dev     # app on :5173
```

The API now prints the addresses to use, e.g.

```
  On this network:
    API   : https://192.168.1.11:5000/api/health
    Kiosk : https://192.168.1.11:5173/kiosk
```

Vite prints its own `Network:` line for the same address.

## 2. HTTPS, because of the camera

Browsers only grant camera access on a secure origin, and `192.168.x.x` is
not one — over plain http the QR scanner never starts. A certificate for
this machine's addresses is already in `certs/`; if the PC's IP changes,
regenerate it:

```bash
cd backend && npm run cert
```

Both servers pick `certs/` up on their own and switch to https. Delete the
folder to go back to http.

## 3. On the kiosk device, once

1. Open `https://<PC-IP>:5000/api/health` and accept the certificate warning.
   Do this **first** — the certificate signs itself, and until it is accepted
   the tablet silently refuses every API call the page makes, which looks
   like the kiosk being broken rather than untrusted.
2. Open `https://<PC-IP>:5173/kiosk?key=<VITE_KIOSK_KEY>` and accept the
   warning there too. The key is taken out of the address bar and stored on
   the device, so afterwards the shortcut is just `/kiosk`.
3. Add any print setting the terminal needs on that first visit, e.g.
   `?key=…&print=bt&bt=<printer name>`. See `KIOSK-PRINTING.md`.

## If it does not load

- **Windows Firewall** blocks inbound 5000 and 5173 by default. Allow Node.js
  on *private* networks when the prompt appears, or add the rule by hand:
  ```powershell
  New-NetFirewallRule -DisplayName "SMARTLAB dev" -Direction Inbound -Protocol TCP -LocalPort 5000,5173 -Profile Private -Action Allow
  ```
- **Different subnet.** A guest or an isolated Wi-Fi network cannot reach the
  PC even with the right address. Both devices have to be on the same one,
  with client isolation off.
- **The IP moved.** DHCP hands out a new address after a reboot. Either
  re-run `npm run cert` and reopen the new address, or reserve a fixed IP for
  the PC on the router — worth doing for a permanent kiosk.
- **CORS refused.** The API accepts any private-LAN origin in development.
  In production it accepts only `CORS_ORIGIN`, so a LAN address has to be
  listed there.

## A permanent kiosk

For something that survives a reboot, build the app once and let the API
serve it — one origin, one port, no Vite:

```bash
cd frontend && npm run build     # writes frontend/dist
cd backend  && npm start         # serves the app and the API on :5000
```

The kiosk is then `https://<PC-IP>:5000/kiosk`.
