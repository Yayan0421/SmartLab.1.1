# SMARTLAB workstation agent

Runs on each laboratory PC. A web page cannot read a computer's CPU, capture
its screen or shut it down — this agent is what makes those possible.

It only ever **asks the server** for work, so no inbound port needs opening
on the workstation and no firewall rule is required here.

## What it does

| | |
|---|---|
| Heartbeat | CPU, RAM, disk, temperature and uptime every 15s |
| Screen | A small JPEG of the desktop every 10s |
| Commands | Polls every 3s for: shut down, restart, lock, warning message |
| State | Reports who is signed in, and the MAC address used for Wake-on-LAN |

## Requirements

- Windows (screen capture and the commands use built-in Windows tooling)
- Node.js 18 or newer — <https://nodejs.org>
- Nothing else: there is no `npm install` step

## Setup on a workstation

1. Copy this `agent` folder to the PC (a USB stick is fine)
2. Open `start-agent.bat` in Notepad and set three values:
   - `SMARTLAB_API` — the server's address, e.g. `http://192.168.1.11:5000/api`
   - `SMARTLAB_AGENT_KEY` — `AGENT_API_KEY` from the server's `backend/.env`
   - `SMARTLAB_COMPUTER` — the name of this machine in SMARTLAB, e.g. `PC-01`
3. Double-click `start-agent.bat`

The machine appears under **Admin → Monitoring** within a few seconds.

## Running it automatically at startup

Press `Win + R`, type `shell:startup`, and put a shortcut to
`start-agent.bat` in the folder that opens.

## Wake-on-LAN

Powering a machine on is the one thing the agent cannot do — it is not
running. The server sends a wake packet instead, which needs:

- **Wake-on-LAN enabled in the BIOS** and in the network adapter's
  properties (Device Manager → adapter → Power Management)
- The server on the **same subnet**, since a broadcast does not cross routers
- The MAC address recorded, which the agent reports on its first run

## Notes

- **Freeze** locks the Windows session. Nothing the student was doing is
  lost, and they unlock it by signing in as normal.
- **Shut down** and **restart** give a 5 second warning on screen.
- Captures are thumbnails, not a recording: each machine overwrites its own
  single image, and nothing is kept as history.
- Every command is written to the audit log with the administrator's name.
