# Usalk Helper — hazirlanmis guncellemeyi uygular.
#
# Normalde uygulama "Simdi kur" dendiginde bu betigi kendisi baslatir. Takilirsa
# "Guncellemeyi Kur.bat" ile elle de calistirilabilir. Calisan uygulama kendi
# dosyalarinin uzerine yazamadigi icin islem ayri bir surecte yapilir.
#
# Kisisel dosyalara (veritabani, .env, storage, loglar) dokunulmaz. Kopyalama
# sirasinda hata olursa degisen dosyalar yedekten geri alinir ve uygulama her
# durumda yeniden baslatilir; sonuc .update-staging\last-result.json'a yazilir.

param(
    [Parameter(Mandatory = $true)][string]$ProjectRoot,
    [int]$ParentPid = 0,
    [switch]$Restart,
    [switch]$OpenBrowser
)

$ErrorActionPreference = 'Stop'

$staging    = Join-Path $ProjectRoot '.update-staging'
$ready      = Join-Path $staging 'ready'
$logFile    = Join-Path $staging 'apply.log'
$resultFile = Join-Path $staging 'last-result.json'

New-Item -ItemType Directory -Force -Path $staging | Out-Null

function Write-Log($message) {
    $line = "{0}  {1}" -f (Get-Date -Format 'HH:mm:ss'), $message
    try { Write-Host $line } catch { }
    try { Add-Content -Path $logFile -Value $line -Encoding utf8 } catch { }
}

function Read-Version([string]$root) {
    try { return (Get-Content -Raw -LiteralPath (Join-Path $root 'package.json') | ConvertFrom-Json).version } catch { return $null }
}

function Write-Result([bool]$ok, [string]$version, [string]$from, [string]$errorText) {
    $result = [ordered]@{
        ok      = $ok
        version = $version
        from    = $from
        error   = $errorText
        at      = (Get-Date).ToString('o')
        log     = $logFile
    }
    try { $result | ConvertTo-Json | Set-Content -LiteralPath $resultFile -Encoding utf8 } catch { }
}

# Backend bu satirin yazilmasini bekler: betigin gercekten basladiginin kaniti.
Write-Log 'Kurulum betigi basladi.'

# Guncellemenin asla ellemeyecegi yollar (proje koküne gore).
$protected = @(
    'backend\.env',
    'backend\db',
    'storage',
    'backups',
    'logs',
    'backend\scratch',
    'node_modules',
    'backend\node_modules',
    'frontend\node_modules',
    '.update-staging',
    '.git'
)

# backend\db tamamen korunuyor ama bu ikisi uygulama kodu, guncellenmeli.
$dbCodeFiles = @('backend\db\db.js', 'backend\db\schema.sql')

function Is-Protected([string]$relative) {
    foreach ($p in $protected) {
        if ($relative -eq $p -or $relative.StartsWith($p + '\')) {
            foreach ($allow in $dbCodeFiles) {
                if ($relative -eq $allow) { return $false }
            }
            return $true
        }
    }
    return $false
}

function Invoke-NpmCi([string]$component) {
    Write-Log "$component icin npm ci calistiriliyor."
    Push-Location (Join-Path $ProjectRoot $component)
    try {
        & npm.cmd ci --no-audit --no-fund 2>&1 | ForEach-Object { Add-Content -Path $logFile -Value "    $_" -Encoding utf8 }
        if ($LASTEXITCODE -ne 0) { throw "$component bagimlilik kurulumu basarisiz (npm ci cikis kodu $LASTEXITCODE)." }
    } finally { Pop-Location }
}

$fromVersion = Read-Version $ProjectRoot
$toVersion   = Read-Version $ready
$changes     = New-Object System.Collections.ArrayList   # @{ Target; Backup } (Backup $null = yeni dosya)
$npmTouched  = New-Object System.Collections.ArrayList
$backupDir   = $null

try {
    if (-not (Test-Path $ready)) { throw "Hazirlanmis guncelleme bulunamadi: $ready" }
    Write-Log "Guncelleme uygulaniyor: $fromVersion -> $toVersion"

    # 1) Uygulamayi durdur. Once cagiran sunucunun kendini kapatmasini bekle.
    if ($ParentPid -gt 0) {
        Write-Log "Sunucunun kapanmasi bekleniyor (pid $ParentPid)."
        for ($i = 0; $i -lt 30; $i++) {
            if (-not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { break }
            Start-Sleep -Milliseconds 500
        }
        try { Stop-Process -Id $ParentPid -Force -ErrorAction SilentlyContinue } catch { }
    }

    $stopScript = Join-Path $ProjectRoot 'stop_hidden.ps1'
    if (Test-Path $stopScript) {
        Write-Log 'stop_hidden.ps1 calistiriliyor.'
        try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $stopScript | Out-Null } catch {
            Write-Log "Durdurma betigi uyarisi: $($_.Exception.Message)"
        }
    }
    Start-Sleep -Seconds 1

    # 2) Yeni dosyalari uzerine kopyala; degisecek her dosyanin yedegini al.
    #
    # Goreli yol -Name ile dogrudan alinir. Tam yoldan Substring ile kesmek
    # guvenli degil: ProjectRoot 8.3 kisa bicimde (USALKP~1) gelip
    # Get-ChildItem uzun bicimde donerse kesme kayar, hicbir korumali yol
    # eslesmez ve kisisel dosyalar sessizce ezilir.
    $backupDir = Join-Path $staging ('backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

    $relatives = @(Get-ChildItem -LiteralPath $ready -Recurse -File -Name)
    if ($relatives.Count -eq 0) { throw 'Guncelleme paketi bos gorunuyor.' }

    $skipped = 0
    foreach ($relative in $relatives) {
        if (Is-Protected $relative) {
            $skipped++
            continue
        }

        $source = Join-Path $ready $relative
        $target = Join-Path $ProjectRoot $relative
        $targetDir = Split-Path $target -Parent
        if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Force -Path $targetDir | Out-Null }

        $backupTarget = $null
        if (Test-Path -LiteralPath $target) {
            $backupTarget = Join-Path $backupDir $relative
            $backupTargetDir = Split-Path $backupTarget -Parent
            if (-not (Test-Path $backupTargetDir)) { New-Item -ItemType Directory -Force -Path $backupTargetDir | Out-Null }
            Copy-Item -LiteralPath $target -Destination $backupTarget -Force
        }

        # Once kaydet, sonra kopyala: yarim kalan kopya da geri alinsin.
        [void]$changes.Add(@{ Target = $target; Backup = $backupTarget })
        Copy-Item -LiteralPath $source -Destination $target -Force
    }
    Write-Log "$($changes.Count) dosya guncellendi, $skipped kisisel dosya atlandi."
    Write-Log "Yedek: $backupDir"

    # 3) Bagimlilik kilidi degistiyse npm ci calistir.
    foreach ($component in @('backend', 'frontend')) {
        $lockNew = Join-Path $ready "$component\package-lock.json"
        $lockOld = Join-Path $backupDir "$component\package-lock.json"
        if ((Test-Path $lockNew) -and (Test-Path $lockOld)) {
            if ((Get-FileHash $lockNew -Algorithm SHA256).Hash -eq (Get-FileHash $lockOld -Algorithm SHA256).Hash) {
                Write-Log "$component bagimliliklari degismedi."
                continue
            }
        }
        [void]$npmTouched.Add($component)
        Invoke-NpmCi $component
    }

    # 4) Temizlik.
    Remove-Item -LiteralPath $ready -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath (Join-Path $staging 'staged.json') -Force -ErrorAction SilentlyContinue
    Write-Log 'Guncelleme tamamlandi.'
    Write-Result $true $toVersion $fromVersion $null
    $exitCode = 0
} catch {
    $message = $_.Exception.Message
    Write-Log "HATA: $message"

    if ($changes.Count -gt 0) {
        Write-Log "Degisen $($changes.Count) dosya geri aliniyor."
        for ($k = $changes.Count - 1; $k -ge 0; $k--) {
            $c = $changes[$k]
            try {
                if ($c.Backup) { Copy-Item -LiteralPath $c.Backup -Destination $c.Target -Force }
                elseif (Test-Path -LiteralPath $c.Target) { Remove-Item -LiteralPath $c.Target -Force }
            } catch {
                Write-Log "Geri alinamadi: $($c.Target) ($($_.Exception.Message))"
            }
        }
        foreach ($component in $npmTouched) {
            try { Invoke-NpmCi $component } catch { Write-Log "Eski bagimliliklar kurulamadi: $($_.Exception.Message). install.bat calistirin." }
        }
        Write-Log 'Eski surume donuldu.'
    }
    Write-Result $false $toVersion $fromVersion $message
    $exitCode = 1
}

# 5) Uygulamayi her durumda yeniden baslat; kullanici kapali bir uygulamayla kalmasin.
if ($Restart) {
    $startScript = Join-Path $ProjectRoot 'start_hidden.ps1'
    if (Test-Path $startScript) {
        Write-Log 'Uygulama yeniden baslatiliyor.'
        $startArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$startScript`"")
        if (-not $OpenBrowser) { $startArgs += '-NoBrowser' }
        Start-Process -FilePath 'powershell.exe' -ArgumentList $startArgs -WorkingDirectory $ProjectRoot -WindowStyle Hidden
    } else {
        Write-Log 'start_hidden.ps1 bulunamadi; uygulamayi elle baslatin.'
    }
}
exit $exitCode
