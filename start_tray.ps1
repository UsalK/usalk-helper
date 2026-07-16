# start_tray.ps1
# Etsy Bulk Listing Tool sunucularını arka planda çalıştırıp sistem tepsisine (Tray) gizler.

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$projectDir = "C:\Users\usalk\Desktop\PROJECTS\helper"
$backendDir = "$projectDir\backend"
$frontendDir = "$projectDir\frontend"

$backendProc = $null
$frontendProc = $null

# Win32 API ile SHELL32.dll'den sarı yıldız simgesini yükleme
$signature = @'
[DllImport("shell32.dll", CharSet = CharSet.Auto)]
public static extern IntPtr ExtractIcon(IntPtr hInst, string lpszExeFileName, int nIconIndex);
'@
$type = Add-Type -MemberDefinition $signature -Name "Win32IconExtractor" -Namespace "Win32" -PassThru
$hIcon = $type::ExtractIcon([IntPtr]::Zero, "$env:SystemRoot\System32\shell32.dll", 43)

function Start-Servers {
    global $backendProc, $frontendProc
    Stop-Servers
    
    # Backend Sunucusunu (Port 3001) Gizli Başlat
    $backendProc = Start-Process "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory $backendDir -WindowStyle Hidden -PassThru
    
    # Frontend Sunucusunu (Port 5173) Gizli Başlat
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
    
    # Portları kullanan olası yetim (orphan) node süreçlerini temizleyelim
    # (Backend Port: 3001, Frontend Port: 5173)
    Get-NetTCPConnection -LocalPort 3001, 5173 -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.OwningProcess -gt 0) {
            try {
                taskkill /f /pid $_.OwningProcess 2>$null
            } catch {}
        }
    }
}

# Sistem Tepsisi Simgesi Yapılandırması (Sarı Yıldız Simgesi ile)
$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
if ($hIcon -ne [IntPtr]::Zero) {
    $notifyIcon.Icon = [System.Drawing.Icon]::FromHandle($hIcon)
} else {
    $notifyIcon.Icon = [System.Drawing.SystemIcons]::Application
}
$notifyIcon.Text = "Etsy Bulk Listing Tool"
$notifyIcon.Visible = $true

# Sağ Tık Menüsü (Karakter kodlama hatasını önlemek için tamamen standart karakterler kullanıldı)
$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip
$openItem = $contextMenu.Items.Add("Uygulamayi Ac (Tarayici)")
$restartItem = $contextMenu.Items.Add("Yeniden Baslat")
$contextMenu.Items.Add("-") | Out-Null
$exitItem = $contextMenu.Items.Add("Cikis (Kapat)")

$notifyIcon.ContextMenuStrip = $contextMenu

# Tıklama Olayları
$openItem.Add_Click({
    Start-Process "http://localhost:5173"
})

$restartItem.Add_Click({
    $notifyIcon.ShowBalloonTip(1500, "Etsy Bulk Tool", "Sunucular yeniden baslatiliyor...", [System.Windows.Forms.ToolTipIcon]::Info)
    Start-Servers
})

$exitItem.Add_Click({
    Stop-Servers
    $notifyIcon.Visible = $false
    $notifyIcon.Dispose()
    [System.Windows.Forms.Application]::Exit()
    Exit
})

# Simgeye çift tıklandığında uygulamayı aç
$notifyIcon.Add_DoubleClick({
    Start-Process "http://localhost:5173"
})

# Başlangıçta sunucuları çalıştır, tarayıcıyı aç ve bildirim göster
Start-Servers
Start-Process "http://localhost:5173"
$notifyIcon.ShowBalloonTip(3000, "Etsy Bulk Tool", "Sunucular arka planda baslatildi! Sistem tepsisinde calisiyor.", [System.Windows.Forms.ToolTipIcon]::Info)

# Uygulama döngüsünü başlat (simgenin tepsiden silinmemesi için)
[System.Windows.Forms.Application]::Run()
