@echo off
REM ====================================================================
REM  SMARTLAB workstation agent
REM
REM  Edit the three values below, then double-click this file on each
REM  laboratory PC. Node.js must be installed.
REM ====================================================================

REM  The server's address on your network
set SMARTLAB_API=http://192.168.1.11:5000/api

REM  AGENT_API_KEY from the server's backend\.env
set SMARTLAB_AGENT_KEY=PASTE_THE_AGENT_KEY_HERE

REM  Must match the computer's name in SMARTLAB (PC-01, PC-02, ...)
set SMARTLAB_COMPUTER=PC-01

title SMARTLAB agent - %SMARTLAB_COMPUTER%
node "%~dp0agent.js"
pause
