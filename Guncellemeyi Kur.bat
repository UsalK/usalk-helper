@echo off
rem Uygulama icinden indirilen guncellemeyi elle kurar (uygulama "Kuruluyor"da
rem takilirsa). Uygulamayi kapatir, dosyalari gunceller ve yeniden acar.
rem Bu dosya uygulama klasorunde (run_hidden.vbs ile ayni yerde) olmalidir.
if not exist "%~dp0apply-update.ps1" (
  echo Bu dosyayi Usalk Helper klasorune, run_hidden.vbs dosyasinin yanina
  echo kopyalayip oradan calistirin.
  pause
  exit /b 1
)
if not exist "%~dp0.update-staging\ready\package.json" (
  echo Kurulmayi bekleyen bir guncelleme yok.
  echo Once uygulamada surum rozetine tiklayip yeni surumu indirin.
  pause
  exit /b 1
)
rem Eski surumlerin apply-update.ps1 dosyasi -OpenBrowser parametresini tanimaz.
set "EXTRA="
findstr /c:"OpenBrowser" "%~dp0apply-update.ps1" >nul && set "EXTRA=-OpenBrowser"
echo Guncelleme kuruluyor, uygulama kapanip yeniden acilacak...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0apply-update.ps1" -ProjectRoot "%~dp0." -Restart %EXTRA%
if errorlevel 1 (
  echo.
  echo Guncelleme kurulamadi. Ayrinti: .update-staging\apply.log
  pause
  exit /b 1
)
echo.
echo Guncelleme kuruldu, uygulama aciliyor. Bu pencere kendiliginden kapanacak.
ping -n 6 127.0.0.1 >nul
