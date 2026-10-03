param(
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path
Set-Location $Root

function Require-Command([string]$Name, [string]$Help) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name tidak ditemukan. $Help"
  }
}

Require-Command "node" "Install Node.js 22 LTS atau lebih baru."
$nodeMajor = [int]((& node -p "process.versions.node.split('.')[0]").Trim())
if ($nodeMajor -lt 22) {
  throw "DIZA membutuhkan Node.js 22+. Versi saat ini: $(& node --version)"
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Require-Command "corepack" "Install Node.js resmi yang menyertakan Corepack."
  & corepack enable
  & corepack prepare pnpm@10 --activate
}
Require-Command "pnpm" "Aktifkan pnpm 10 melalui Corepack."

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
  Write-Host "[DIZA] Codex CLI belum ada. Menginstal @openai/codex..."
  & npm install -g @openai/codex
}
Require-Command "codex" "Instal dengan: npm install -g @openai/codex"

if (-not $SkipBuild) {
  Write-Host "[DIZA] Menyiapkan dependency..."
  & pnpm install --frozen-lockfile
  Write-Host "[DIZA] Build web + server..."
  & pnpm build
  & pnpm build:server
}

if (-not (Test-Path (Join-Path $Root "dist\index.html"))) {
  throw "Build web belum ada. Jalankan tanpa -SkipBuild."
}
if (-not (Test-Path (Join-Path $Root "dist-server\index.js"))) {
  throw "Build server belum ada. Jalankan tanpa -SkipBuild."
}

$StateDir = Join-Path $HOME ".diza"
$PasswordFile = Join-Path $StateDir "server-password.txt"
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

if (-not (Test-Path $PasswordFile)) {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $password = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+","-").Replace("/","_")
  [IO.File]::WriteAllText($PasswordFile, $password)
} else {
  $password = [IO.File]::ReadAllText($PasswordFile).Trim()
}
if ($password.Length -lt 16) {
  throw "Password DIZA lokal rusak/terlalu pendek: $PasswordFile"
}

$env:DIZA_WEB_MODE = "1"
$env:DIZA_WEB_PASSWORD = $password
$env:BLOKS_STATIC_DIR = (Join-Path $Root "dist")
$env:BLOKS_PORT = "8799"
$env:BLOKS_LOOPBACK_ONLY = "1"

$OutLog = Join-Path $StateDir "server-out.log"
$ErrLog = Join-Path $StateDir "server-error.log"
Remove-Item $OutLog,$ErrLog -Force -ErrorAction SilentlyContinue

Write-Host "[DIZA] Menyalakan server di localhost:8799..."
$server = Start-Process -FilePath "node" -ArgumentList @("dist-server/index.js") -WorkingDirectory $Root -PassThru -NoNewWindow -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog

try {
  $ready = $false
  for ($i=0; $i -lt 60; $i++) {
    if ($server.HasExited) {
      throw "Server DIZA berhenti saat startup. Cek $ErrLog"
    }
    try {
      $session = Invoke-RestMethod -Uri "http://127.0.0.1:8799/api/diza/session" -TimeoutSec 2
      if ($session.enabled -eq $true) { $ready = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "Server DIZA tidak ready dalam 30 detik. Cek $ErrLog" }

  Write-Host ""
  Write-Host "============================================================"
  Write-Host " DIZA AI PERSONAL ASSISTANT"
  Write-Host " Local server : http://127.0.0.1:8799"
  Write-Host " Password file: $PasswordFile"
  Write-Host " Data DIZA    : $HOME\.bloks"
  Write-Host " Login Codex  : $HOME\.codex"
  Write-Host "============================================================"
  Write-Host ""
  Write-Host "[DIZA] Membuka tunnel HTTPS HostC. Jangan tutup jendela ini."
  Write-Host "[DIZA] Salin URL https://...hostc.app ke aplikasi Android DIZA."
  Write-Host ""

  & npx.cmd --yes hostc@latest 8799 --qr
}
finally {
  if ($server -and -not $server.HasExited) {
    Write-Host "[DIZA] Mematikan server..."
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  }
}
