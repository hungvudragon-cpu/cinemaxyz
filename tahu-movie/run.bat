@echo off
cd /d "%~dp0"
title TaHu Cinema Local Server
echo ===================================================
echo     DANG KHOI CHAY SERVER CHO TAHU CINEMA...
echo ===================================================
start http://localhost:3000
node server.js
pause
