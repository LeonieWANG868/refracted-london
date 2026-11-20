@echo off
setlocal
title Refracted London
cd /d "%~dp0"
set "RENDER_NODE=%ProgramFiles%\nodejs\node.exe"
if exist "%RENDER_NODE%" goto run
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js 20 or newer is required for the local preview.
  pause
  exit /b 1
)
set "RENDER_NODE=node.exe"
:run
if exist "dist\index.html" goto serve
"%RENDER_NODE%" scripts\build.mjs
if errorlevel 1 (
  pause
  exit /b 1
)
:serve
echo Open http://127.0.0.1:8784/ in a browser. Keep this window open while viewing.
"%RENDER_NODE%" scripts\preview.mjs
if errorlevel 1 pause
