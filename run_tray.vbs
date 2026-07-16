Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -File C:\Users\usalk\Desktop\PROJECTS\helper\start_tray.ps1", 0, False
