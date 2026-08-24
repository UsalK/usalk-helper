# start_tray.ps1
# Usalk Helper backend (3001) ve frontend (5173) sunucularını arka planda
# çalıştırıp sistem tepsisine yerleşir.
#
# ÖNEMLİ: Bu dosya UTF-8 *BOM ile* kaydedilmelidir. BOM olmadan Windows
# PowerShell dosyayı ANSI sanar ve Türkçe karakterler bozulur.

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Bir olay isleyicisinde yakalanmamis bir istisna varsayilan olarak tum
# WinForms surecini sessizce sonlandirir (arkasindaki backend/frontend'i de
# beraberinde alir, ekranda ise cevap vermeyen bir "hayalet" simge kalir).
# CatchException modu bunun yerine ThreadException olayina yonlendirir.
[System.Windows.Forms.Application]::SetUnhandledExceptionMode([System.Windows.Forms.UnhandledExceptionMode]::CatchException)

# --- Yollar (script nerede duruyorsa ona göre; sabit yol yok) ---
$projectDir  = $PSScriptRoot
$backendDir  = Join-Path $projectDir 'backend'
$frontendDir = Join-Path $projectDir 'frontend'
$logDir      = Join-Path $projectDir 'logs'
$iconPath    = Join-Path $projectDir 'usalkhelper.ico'

$BACKEND_PORT  = 3001
$FRONTEND_PORT = 5173
$APP_URL       = "http://localhost:$FRONTEND_PORT"

if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

$trayLogPath = Join-Path $logDir 'tray.log'

function Write-TrayLog([string]$Message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    try { Add-Content -Path $trayLogPath -Value $line -Encoding utf8 } catch {}
}

# Bir olay isleyicisindeki hatanin butun gizli sureci sessizce
# dusurmesini engeller: eskiden tek bir istisna tum tepsi uygulamasini
# (ve arkasindaki sunuculari) log birakmadan oldurup ekranda sadece
# "hayalet" bir simge birakiyordu. Simdi hatalar burada yakalanip loglanir.
function Invoke-Safe([scriptblock]$Action, [string]$Context) {
    try {
        & $Action
    } catch {
        Write-TrayLog "HATA [$Context]: $($_.Exception.Message)`r`n$($_.ScriptStackTrace)"
    }
}

# --- Tek örnek kilidi: iki tepsi simgesi oluşmasın ---
$mutex = New-Object System.Threading.Mutex($false, 'Global\UsalkHelperTray')
if (-not $mutex.WaitOne(0, $false)) {
    [System.Windows.Forms.MessageBox]::Show(
        'Usalk Helper zaten çalışıyor. Sistem tepsisindeki simgeye bakın.',
        'Usalk Helper',
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
    exit
}

$script:backendProc  = $null
$script:frontendProc = $null

# --- Yardımcılar ---

function Test-Port([int]$Port, [int]$TimeoutMs = 250) {
    # BeginConnect + WaitOne ile sinirli sure: bazi antivirus/guvenlik
    # yazilimlari her yeni soket acilisini izleyip .Connect()'i saniyelerce
    # geciktirebiliyor. Bu, menu donmasinin asil sebebiydi.
    $c = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $c.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) { return $false }
        try { $c.EndConnect($iar); return $true } catch { return $false }
    } catch {
        return $false
    } finally {
        $c.Close()
    }
}

function Wait-Port([int]$Port, [int]$TimeoutSec = 60) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-Port $Port) { return $true }
        Start-Sleep -Milliseconds 400
    }
    return $false
}

function Kill-Port([int]$Port) {
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.OwningProcess -gt 0) {
            try { taskkill /f /t /pid $_.OwningProcess 2>$null | Out-Null } catch {}
        }
    }
}

function Start-Servers {
    Stop-Servers

    $script:backendProc = Start-Process 'cmd.exe' `
        -ArgumentList '/c npm start' `
        -WorkingDirectory $backendDir `
        -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logDir 'backend.out.log') `
        -RedirectStandardError  (Join-Path $logDir 'backend.err.log')

    $script:frontendProc = Start-Process 'cmd.exe' `
        -ArgumentList '/c npm run dev' `
        -WorkingDirectory $frontendDir `
        -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logDir 'frontend.out.log') `
        -RedirectStandardError  (Join-Path $logDir 'frontend.err.log')
}

function Stop-Servers {
    foreach ($p in @($script:backendProc, $script:frontendProc)) {
        if ($p -ne $null) {
            try { taskkill /f /t /pid $p.Id 2>$null | Out-Null } catch {}
        }
    }
    $script:backendProc  = $null
    $script:frontendProc = $null

    # Önceki oturumdan kalmış olabilecek yetim node süreçlerini de temizle
    Kill-Port $BACKEND_PORT
    Kill-Port $FRONTEND_PORT
}

# Onbellek: gercek ag sorgusu (Test-Port) sadece burada, zamanlayicidan cagrilir.
$script:backendUp  = $false
$script:frontendUp = $false

function Refresh-Status {
    $script:backendUp  = Test-Port $BACKEND_PORT
    $script:frontendUp = Test-Port $FRONTEND_PORT
}

# Menu acilirken / tikta cagrilan taraf: sadece onbellekten yazi olusturur,
# ag sorgusu yapmaz -> anlik acilir.
function Render-Status {
    $bTxt = if ($script:backendUp)  { 'çalışıyor' } else { 'kapalı' }
    $fTxt = if ($script:frontendUp) { 'çalışıyor' } else { 'kapalı' }
    # NotifyIcon.Text 63 karakterle sınırlı
    $notifyIcon.Text = "Usalk Helper — Backend: $bTxt / Frontend: $fTxt"
    $statusItem.Text = "Backend $BACKEND_PORT : $bTxt   |   Frontend $FRONTEND_PORT : $fTxt"
}

# --- Tepsi simgesi ---
$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
if (Test-Path $iconPath) {
    $notifyIcon.Icon = New-Object System.Drawing.Icon($iconPath)
} else {
    $notifyIcon.Icon = [System.Drawing.SystemIcons]::Application
}
$notifyIcon.Text = 'Usalk Helper'
$notifyIcon.Visible = $true

# --- Sağ tık menüsü ---
$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip

$openItem = $contextMenu.Items.Add('Uygulamayı Aç')
$openItem.Font = New-Object System.Drawing.Font($contextMenu.Font, [System.Drawing.FontStyle]::Bold)

$statusItem = $contextMenu.Items.Add('Durum kontrol ediliyor...')
$statusItem.Enabled = $false

$contextMenu.Items.Add('-') | Out-Null
$restartItem = $contextMenu.Items.Add('Sunucuları Yeniden Başlat')
$logsItem    = $contextMenu.Items.Add('Logları Aç')
$contextMenu.Items.Add('-') | Out-Null
$exitItem    = $contextMenu.Items.Add('Çıkış (Sunucuları Kapat)')

$notifyIcon.ContextMenuStrip = $contextMenu

# Menü her açıldığında son bilinen durumu göster (ag sorgusu yok -> anlik)
$contextMenu.Add_Opening({ Invoke-Safe { Render-Status } 'menu-opening' })

$openItem.Add_Click({ Invoke-Safe { Start-Process $APP_URL } 'open-click' })
$notifyIcon.Add_DoubleClick({ Invoke-Safe { Start-Process $APP_URL } 'double-click' })

$restartItem.Add_Click({
    Invoke-Safe {
        $notifyIcon.ShowBalloonTip(2000, 'Usalk Helper', 'Sunucular yeniden başlatılıyor...', [System.Windows.Forms.ToolTipIcon]::Info)
        Start-Servers
        $script:frontendUp = Wait-Port $FRONTEND_PORT 60
        $script:backendUp  = Test-Port $BACKEND_PORT
        if ($script:frontendUp) {
            $notifyIcon.ShowBalloonTip(2000, 'Usalk Helper', 'Sunucular hazır.', [System.Windows.Forms.ToolTipIcon]::Info)
        } else {
            $notifyIcon.ShowBalloonTip(4000, 'Usalk Helper', 'Sunucular başlatılamadı. Logları kontrol edin.', [System.Windows.Forms.ToolTipIcon]::Error)
        }
        Render-Status
    } 'restart-click'
})

$logsItem.Add_Click({ Invoke-Safe { Start-Process explorer.exe $logDir } 'logs-click' })

$exitItem.Add_Click({
    Invoke-Safe {
        Stop-Servers
        $notifyIcon.Visible = $false
        $notifyIcon.Dispose()
        [System.Windows.Forms.Application]::Exit()
    } 'exit-click'
})

# --- Durumu periyodik tazele (tooltip için). Gercek ag sorgusu sadece
# burada yapilir; en fazla 2 x 250ms surer, kullaniciyi etkilemez. ---
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.Add_Tick({ Invoke-Safe { Refresh-Status; Render-Status } 'timer-tick' })
$timer.Start()

# Kod burada yakalanamayan bir istisna firlatirsa bile (Timer/Click
# isleyicileri artik Invoke-Safe ile korunuyor, ama baslangic kodu
# korunmuyordu) finally bloğu calisip simgeyi kaldirir ve arkadaki
# sunuculari kapatir -> hayalet simge + yetim sureç kalmaz.
try {
    # WinForms olay isleyicisi disindaki (UI thread) yakalanmamis
    # istisnalari da tray.log'a yazar, sureci sessizce dusurmez.
    [System.Windows.Forms.Application]::add_ThreadException({
        param($sender, $e)
        Write-TrayLog "YAKALANMAMIS HATA (ThreadException): $($e.Exception.Message)`r`n$($e.Exception.ScriptStackTrace)"
    })

    Write-TrayLog '--- Usalk Helper tepsi uygulamasi baslatiliyor ---'

    # --- Başlat ---
    Start-Servers

    $script:backendUp  = Wait-Port $BACKEND_PORT 90
    $script:frontendUp = Wait-Port $FRONTEND_PORT 90

    if ($script:backendUp -and $script:frontendUp) {
        Start-Process $APP_URL
        $notifyIcon.ShowBalloonTip(3000, 'Usalk Helper', 'Sunucular çalışıyor. Uygulama tarayıcıda açılıyor.', [System.Windows.Forms.ToolTipIcon]::Info)
    } else {
        $hata = @()
        if (-not $script:backendUp)  { $hata += "Backend ($BACKEND_PORT)" }
        if (-not $script:frontendUp) { $hata += "Frontend ($FRONTEND_PORT)" }
        Write-TrayLog "Baslangicta ayaga kalkmadi: $($hata -join ', ')"
        $notifyIcon.ShowBalloonTip(5000, 'Usalk Helper', ($hata -join ' ve ') + ' başlatılamadı. Sağ tık > Logları Aç', [System.Windows.Forms.ToolTipIcon]::Error)
    }
    Render-Status

    # Tepsi simgesinin kaybolmaması için mesaj döngüsü
    [System.Windows.Forms.Application]::Run()
} catch {
    Write-TrayLog "OLUMCUL HATA: $($_.Exception.Message)`r`n$($_.ScriptStackTrace)"
} finally {
    Write-TrayLog '--- Usalk Helper tepsi uygulamasi kapaniyor (temizlik) ---'
    Stop-Servers
    $notifyIcon.Visible = $false
    $notifyIcon.Dispose()
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
