@echo off
rem Uygulama icinden indirilen guncellemeyi elle kurar (uygulama "Kuruluyor"da
rem takilirsa). Uygulamayi kapatir, dosyalari gunceller ve yeniden acar.
if not exist "%~dp0.update-staging\ready\package.json" (
  echo Kurulmayi bekleyen bir guncelleme yok. Once uygulamadan surumu indirin.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0apply-update.ps1" -ProjectRoot "%~dp0." -Restart -OpenBrowser
if errorlevel 1 (
  echo Guncelleme kurulamadi; eski surum geri yuklendi. Ayrinti: .update-staging\apply.log
  pause
  exit /b 1
)
echo Guncelleme kuruldu, uygulama aciliyor.
timeout /t 5 >nul
