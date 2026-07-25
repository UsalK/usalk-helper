# start_tray.ps1
# Etsy Bulk Listing Tool sunucularÄ±nÄ± arka planda Ã§alÄ±ÅŸtÄ±rÄ±p sistem tepsisine (Tray) gizler.

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$projectDir = "C:\Users\usalk\Desktop\PROJECTS\helper"
$backendDir = "$projectDir\backend"
$frontendDir = "$projectDir\frontend"

$backendProc = $null
$frontendProc = $null

# Win32 API ile SHELL32.dll'den sarÄ± yÄ±ldÄ±z simgesini (index 43) yÃ¼kleme
$signature = @'
[DllImport("shell32.dll", CharSet = CharSet.Auto)]
public static extern IntPtr ExtractIcon(IntPtr hInst, string lpszExeFileName, int nIconIndex);
'@
$type = Add-Type -MemberDefinition $signature -Name "Win32IconExtractor" -Namespace "Win32" -PassThru
$hIcon = $type::ExtractIcon([IntPtr]::Zero, "$env:SystemRoot\System32\shell32.dll", 43)

function Start-Servers {
    global $backendProc, $frontendProc
    Stop-Servers
    
    # Backend Sunucusunu (Port 3001) Gizli BaÅŸlat
    $backendProc = Start-Process "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory $backendDir -WindowStyle Hidden -PassThru
    
    # Frontend Sunucusunu (Port 5173) Gizli BaÅŸlat
    $frontendProc = Start-Process "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory $frontendDir -WindowStyle Hidden -PassThru
}

function Stop-Servers {
    global $backendProc, $frontendProc
    if ($backendProc -ne $null) {
        try {
            taskkill /f /t /pid $backendProc.Id 2>$null
        } catch {}
        $backendProc = $null
    }
    if ($frontendProc -ne $null) {
        try {
            taskkill /f /t /pid $frontendProc.Id 2>$null
        } catch {}
        $frontendProc = $null
    }
    
    # PortlarÄ± kullanan olasÄ± yetim (orphan) node sÃ¼reÃ§lerini temizleyelim
    # (Backend Port: 3001, Frontend Port: 5173)
    Get-NetTCPConnection -LocalPort 3001, 5173 -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.OwningProcess -gt 0) {
            try {
                taskkill /f /pid $_.OwningProcess 2>$null
            } catch {}
        }
    }
}

# Sistem Tepsisi Simgesi YapÄ±landÄ±rmasÄ± (SarÄ± YÄ±ldÄ±z Simgesi ile)
$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
if ($hIcon -ne [IntPtr]::Zero) {
    $notifyIcon.Icon = [System.Drawing.Icon]::FromHandle($hIcon)
} else {
    $notifyIcon.Icon = [System.Drawing.SystemIcons]::Application
}
$notifyIcon.Text = "Etsy Bulk Listing Tool"
$notifyIcon.Visible = $true

# SaÄŸ TÄ±k MenÃ¼sÃ¼ (BOM desteÄŸi sayesinde TÃ¼rkÃ§e karakterler pÃ¼rÃ¼zsÃ¼z gÃ¶rÃ¼ntÃ¼lenecektir)
$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip
$openItem = $contextMenu.Items.Add("UygulamayÄ± AÃ§ (TarayÄ±cÄ±)")
$restartItem = $contextMenu.Items.Add("SunucularÄ± Yeniden BaÅŸlat")
$contextMenu.Items.Add("-") | Out-Null
$exitItem = $contextMenu.Items.Add("Ã‡Ä±kÄ±ÅŸ (Kapat)")

$notifyIcon.ContextMenuStrip = $contextMenu

# TÄ±klama OlaylarÄ±
$openItem.Add_Click({
    Start-Process "http://localhost:5173"
})

$restartItem.Add_Click({
    $notifyIcon.ShowBalloonTip(1500, "Etsy Bulk Tool", "Sunucular yeniden baÅŸlatÄ±lÄ±yor...", [System.Windows.Forms.ToolTipIcon]::Info)
    Start-Servers
})

$exitItem.Add_Click({
    Stop-Servers
    $notifyIcon.Visible = $false
    $notifyIcon.Dispose()
    [System.Windows.Forms.Application]::Exit()
    Exit
})

# Simgeye Ã§ift tÄ±klandÄ±ÄŸÄ±nda uygulamayÄ± aÃ§
$notifyIcon.Add_DoubleClick({
    Start-Process "http://localhost:5173"
})

# BaÅŸlangÄ±Ã§ta sunucularÄ± Ã§alÄ±ÅŸtÄ±r, tarayÄ±cÄ±yÄ± aÃ§ ve bildirim gÃ¶ster
Start-Servers
Start-Process "http://localhost:5173"
$notifyIcon.ShowBalloonTip(3000, "Etsy Bulk Tool", "Sunucular arka planda baÅŸlatÄ±ldÄ±! Sistem tepsisinde Ã§alÄ±ÅŸÄ±yor.", [System.Windows.Forms.ToolTipIcon]::Info)

# Uygulama dÃ¶ngÃ¼sÃ¼nÃ¼ baÅŸlat (simgenin tepsiden silinmemesi iÃ§in)
[System.Windows.Forms.Application]::Run()

