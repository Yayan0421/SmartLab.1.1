@echo off
REM ====================================================================
REM  SMARTLAB workstation agent
REM
REM  Edit the values below, then double-click this file on each
REM  laboratory PC. Node.js 18 or newer must be installed.
REM ====================================================================

REM  The server's address on your network.
REM  Use the scheme the server printed when it started - https when the
REM  certs folder exists, http when it does not. Getting this wrong is
REM  the usual reason the agent never appears.
set SMARTLAB_API=https://192.168.1.6:5000/api

REM  AGENT_API_KEY from the server's backend\.env
set SMARTLAB_AGENT_KEY=PASTE_THE_AGENT_KEY_HERE

REM  Must match a computer's name in SMARTLAB exactly (PC-01, PC-02, ...).
REM  A name the server does not know is refused: it will not create one.
set SMARTLAB_COMPUTER=PC-02

REM  --------------------------------------------------------------
REM  Only needed while the server uses a self-signed certificate.
REM
REM  A browser lets you click through the warning once; Node does not
REM  ask, it just refuses, and the agent fails with "fetch failed"
REM  before it ever reaches the API. This turns that check off for
REM  this one process.
REM
REM  Delete these two lines if the server has a real certificate, or
REM  if it is running over plain http.
REM  --------------------------------------------------------------
set NODE_TLS_REJECT_UNAUTHORIZED=0

REM  --------------------------------------------------------------
REM  Optional: an energy meter fitted to this machine.
REM  SMARTLAB_CT_TURNS is how many times the live wire passes through
REM  the current coil. Leave both unset where there is no meter - the
REM  agent then reports an estimate, as it always did.
REM  --------------------------------------------------------------
REM  set SMARTLAB_PZEM_PORT=COM3
REM  set SMARTLAB_CT_TURNS=8

title SMARTLAB agent - %SMARTLAB_COMPUTER%
node "%~dp0agent.js"
pause
