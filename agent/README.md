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
| State | Reports who is signed in and whether the session is locked |

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

### The name has to exist already

The agent does not create a computer. It looks for one whose name matches
`SMARTLAB_COMPUTER` and is refused if there is none, so the machine has to
be in the `computers` table first. The seed creates `PC-01` to `PC-30`.

### While the server uses a self-signed certificate

`start-agent.bat` sets `NODE_TLS_REJECT_UNAUTHORIZED=0`. A browser offers
to let you through the warning once; Node does not ask, it refuses, and the
agent fails with `fetch failed` before reaching the API at all. Remove that
line once the server has a real certificate.

## Running it automatically at startup

Press `Win + R`, type `shell:startup`, and put a shortcut to
`start-agent.bat` in the folder that opens.

## Notes

- **Freeze** locks the Windows session. Nothing the student was doing is
  lost, and they unlock it by signing in as normal.
- **Shut down** and **restart** give a 5 second warning on screen.
- Captures are thumbnails, not a recording: each machine overwrites its own
  single image, and nothing is kept as history.
- Every command is written to the audit log with the administrator's name.
