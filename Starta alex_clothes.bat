@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installerar...
  call npm install
)
call npm start
