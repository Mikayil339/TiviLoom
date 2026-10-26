@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "TIVILOOM_NODE=%ProgramFiles%\nodejs\node.exe"
if exist "%TIVILOOM_NODE%" goto run
where /q node
if not errorlevel 1 (
  set "TIVILOOM_NODE=node"
  goto run
)
echo Node.js tapilmadi. Node.js 22 ve ya daha yeni versiyani npm ile qurasdirin:
echo https://nodejs.org/
pause
exit /b 1
:run
if not exist "tools\install-tv.mjs" (
  echo Paket natamamdir. ZIP faylini tam cixarin, sonra bu fayli acin.
  pause
  exit /b 1
)
"%TIVILOOM_NODE%" tools\install-tv.mjs
pause
