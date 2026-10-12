# AGENT EDIT CLI cho WINDOWS — loi vao cho ky nang GetTime (va moi AI agent / PowerShell). Ban macOS: scripts/agent-edit (bash).
#   powershell -NoProfile -ExecutionPolicy Bypass -File agent-edit.ps1 <lenh> [tham so]
#
# 1. Tim "Agent Edit.exe" (AGENT_EDIT_APP, muc go cai dat trong registry, %LOCALAPPDATA%\Programs\Agent Edit) — lay ban MOI nhat.
#    Chua co / cu hon MIN_VERSION -> `setup --key <KEY>` / `install --key <KEY>` tai bo cai Windows x64 MOI NHAT qua may chu ban
#    quyen (key hop le moi tai duoc), kiem SHA-512, cai IM LANG cho rieng nguoi dung (/S — khong can quyen admin, khong UAC).
# 2. Chay app o CHE DO CLI: "Agent Edit.exe" --agent-edit-cli <lenh> ... App Windows la app giao dien -> chi in ra khi stdout la
#    ONG DAN: script nay hung ket qua roi in lai (UTF-8), tra dung ma thoat cua lenh.
#
# Bien moi truong (tuy chon): AGENT_EDIT_APP (duong dan Agent Edit.exe), AGENT_EDIT_CHANNEL (stable|test). Chi de tu kiem:
#   AGENT_EDIT_API, AGENT_EDIT_MIN_VERSION, AGENT_EDIT_USER_DATA_DIR, AGENT_EDIT_TEST_ANY_OS.
# Chi dung Windows PowerShell 5.1 + curl.exe co san (Windows 10 1803+) — khong can Node / Python.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$MinVersion = '1.5.1'
if ($env:AGENT_EDIT_MIN_VERSION) { $MinVersion = $env:AGENT_EDIT_MIN_VERSION }
$Api = 'https://agent-edit-license.agent-edit-license-server.workers.dev'
if ($env:AGENT_EDIT_API) { $Api = $env:AGENT_EDIT_API }
$Channel = 'stable'
if ($env:AGENT_EDIT_CHANNEL) { $Channel = $env:AGENT_EDIT_CHANNEL }
$UserHome = $env:USERPROFILE
if (-not $UserHome) { $UserHome = $HOME }
$Work = Join-Path $UserHome '.capcut-studio\cli\download'

try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)

# thong bao ra stderr -> stdout cua lenh `--json` van la JSON sach
function Say([string]$m) { [Console]::Error.WriteLine($m) }
function Die([string]$m) {
  [Console]::Error.WriteLine("Lỗi: $m")
  exit 2
}

$OnWindows = [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT
if (-not $OnWindows -and -not $env:AGENT_EDIT_TEST_ANY_OS) { Die 'agent-edit.ps1 chỉ chạy trên Windows (macOS dùng: bash agent-edit).' }

function Num([string]$s) {
  $m = [regex]::Match("$s", '^\d+')
  if ($m.Success) { return [int]$m.Value }
  return 0
}
# $a >= $b (x.y.z)
function VerGe([string]$a, [string]$b) {
  $x = "$a".Split('.')
  $y = "$b".Split('.')
  for ($i = 0; $i -lt 3; $i++) {
    $p = 0; $q = 0
    if ($i -lt $x.Count) { $p = Num $x[$i] }
    if ($i -lt $y.Count) { $q = Num $y[$i] }
    if ($p -gt $q) { return $true }
    if ($p -lt $q) { return $false }
  }
  return $true
}

function AppVersion([string]$exe) {
  try { return [string](Get-Item -LiteralPath $exe).VersionInfo.ProductVersion } catch { return '0' }
}

# Agent Edit.exe MOI nhat tren may (muc go cai dat HKCU / HKLM + noi cai mac dinh cho rieng nguoi dung)
function FindApp {
  if ($env:AGENT_EDIT_APP) {
    if (Test-Path -LiteralPath $env:AGENT_EDIT_APP) { return $env:AGENT_EDIT_APP }
  }
  $cands = @()
  if ($OnWindows) {
    foreach ($root in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*')) {
      Get-ItemProperty $root -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -like 'Agent Edit*' -and $_.InstallLocation } |
        ForEach-Object { $cands += (Join-Path $_.InstallLocation 'Agent Edit.exe') }
    }
    if ($env:LOCALAPPDATA) { $cands += (Join-Path $env:LOCALAPPDATA 'Programs\Agent Edit\Agent Edit.exe') }
  }
  $best = $null
  $bestv = '0'
  foreach ($c in $cands) {
    if (-not (Test-Path -LiteralPath $c)) { continue }
    $v = AppVersion $c
    if (-not $best -or -not (VerGe $bestv $v)) { $best = $c; $bestv = $v }
  }
  return $best
}

function CurlExe {
  if ($OnWindows) {
    $c = Join-Path $env:SystemRoot 'System32\curl.exe'
    if (Test-Path -LiteralPath $c) { return $c }
    Die 'Không thấy curl.exe của Windows (cần Windows 10 bản 1803 trở lên).'
  }
  return '/usr/bin/curl'
}

# SHA-512 cua file dang base64 (giong phieu phat hanh)
function Sha512B64([string]$file) {
  $hex = (Get-FileHash -LiteralPath $file -Algorithm SHA512).Hash
  $bytes = New-Object byte[] ($hex.Length / 2)
  for ($i = 0; $i -lt $hex.Length; $i += 2) { $bytes[$i / 2] = [Convert]::ToByte($hex.Substring($i, 2), 16) }
  return [Convert]::ToBase64String($bytes)
}

# Hoi may chu ban quyen: key hop le -> phieu ban moi nhat + link tai tam
function GetOffer([string]$key) {
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
  $body = @{ key = $key; platform = 'win32'; arch = 'x64'; channel = $Channel } | ConvertTo-Json -Compress
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$Api/v1/download" -ContentType 'application/json; charset=utf-8' `
      -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 60
    $text = [Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray())
  } catch {
    $r = $_.Exception.Response
    if ($r) {
      try {
        $sr = New-Object IO.StreamReader($r.GetResponseStream(), [Text.Encoding]::UTF8)
        $text = $sr.ReadToEnd()
      } catch { Die 'Máy chủ Agent Edit trả lỗi — thử lại sau.' }
    } else { Die 'Không kết nối được máy chủ Agent Edit — kiểm tra mạng rồi chạy lại.' }
  }
  try { return ($text | ConvertFrom-Json) } catch { Die 'Máy chủ Agent Edit trả dữ liệu không hợp lệ.' }
}

# InstallApp <KEY> [exe dang co] -> duong dan Agent Edit.exe sau khi cai
function InstallApp([string]$key, [string]$existing) {
  if ($OnWindows) {
    $build = [Environment]::OSVersion.Version.Build
    if ($build -lt 17763) { Die "Agent Edit cần Windows 10 (bản 1809) trở lên hoặc Windows 11 — máy đang chạy bản build $build." }
    if (-not [Environment]::Is64BitOperatingSystem) { Die 'Agent Edit cần Windows 64-bit.' }
  }
  New-Item -ItemType Directory -Force -Path $Work | Out-Null
  Say 'Lấy bản Agent Edit mới nhất cho Windows...'
  $o = GetOffer $key
  if (-not $o.ok) {
    if ($o.message) { Die ([string]$o.message) }
    Die 'Máy chủ từ chối yêu cầu.'
  }
  $file = [string]$o.file
  if ($file -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*\.exe$') { Die "Máy chủ trả gói không hợp lệ ($file)." }
  $size = [int64]$o.size
  if ($existing -and (VerGe (AppVersion $existing) ([string]$o.version))) {
    Say "Agent Edit trên máy ($(AppVersion $existing)) đã là bản mới nhất ($($o.version)) — không cần tải."
    return $existing
  }
  $setup = Join-Path $Work $file
  Say "Tải Agent Edit $($o.version) (build $($o.build)) — $([math]::Floor($size / 1048576)) MB (mạng rớt thì chạy lại, tải tiếp chỗ dở)..."
  $curl = CurlExe
  for ($n = 1; ; $n++) {
    if ((Test-Path -LiteralPath $setup) -and ((Get-Item -LiteralPath $setup).Length -eq $size)) { break }
    if ($n -gt 6) { Die 'Tải chưa trọn sau 6 lần — kiểm tra mạng rồi chạy lại (tải tiếp chỗ dở).' }
    if ((Test-Path -LiteralPath $setup) -and ((Get-Item -LiteralPath $setup).Length -gt $size)) { Remove-Item -LiteralPath $setup -Force }
    & $curl -fL -sS -C - --retry 3 --retry-delay 3 -o $setup ([string]$o.url) 2>$null
    if ($LASTEXITCODE -ne 0) { Start-Sleep -Seconds 3 }
  }
  if ((Sha512B64 $setup) -ne [string]$o.sha512) {
    Remove-Item -LiteralPath $setup -Force
    Die 'File tải về sai mã SHA-512 — đã xoá, chạy lại để tải lại.'
  }
  if (-not $OnWindows) {
    # tu kiem tren may khong phai Windows: dung o day (khong chay duoc bo cai .exe)
    Say "Đã tải + kiểm SHA-512: $setup"
    return $null
  }
  # App dang chay (giao dien / viec CLI) -> bo cai khong ghi de duoc file
  if (Get-Process -Name 'Agent Edit' -ErrorAction SilentlyContinue) {
    Die 'Agent Edit đang chạy — đóng app / đợi việc đang chạy xong rồi chạy lại.'
  }
  Say 'Cài Agent Edit (im lặng, cho riêng tài khoản này)...'
  # bo cai NSIS cua electron-builder: /S = im lang, cai vao thu muc cu (registry) hoac %LOCALAPPDATA%\Programs\Agent Edit
  $p = Start-Process -FilePath $setup -ArgumentList '/S' -PassThru -Wait
  $exe = $null
  for ($i = 0; $i -lt 120; $i++) {
    $exe = FindApp
    if ($exe -and (VerGe (AppVersion $exe) ([string]$o.version))) { break }
    Start-Sleep -Seconds 1
  }
  if (-not $exe -or -not (VerGe (AppVersion $exe) ([string]$o.version))) {
    Die "Bộ cài chạy xong (mã $($p.ExitCode)) nhưng chưa thấy Agent Edit $($o.version) — chạy lại hoặc cài tay bằng file: $setup"
  }
  Remove-Item -LiteralPath $setup -Force -ErrorAction SilentlyContinue
  Say "Đã cài Agent Edit $(AppVersion $exe) tại: $exe"
  return $exe
}

# ---- tham so --key (setup / install) ----
$cmd = 'help'
if ($args.Count -gt 0) { $cmd = [string]$args[0] }
$key = ''
for ($i = 0; $i -lt $args.Count; $i++) {
  $a = [string]$args[$i]
  if ($a -eq '--key' -and ($i + 1) -lt $args.Count) { $key = [string]$args[$i + 1] }
  elseif ($a.StartsWith('--key=')) { $key = $a.Substring(6) }
}
$key = ($key -replace '[^A-Za-z0-9-]', '')

$app = FindApp
$appv = '0'
if ($app) { $appv = AppVersion $app }

if ($cmd -eq 'install') {
  if (-not $key) { Die 'Cần key bản quyền: agent-edit.ps1 install --key <KEY>' }
  $null = InstallApp $key $app
  exit 0
}

if (-not $app -or -not (VerGe $appv $MinVersion)) {
  if ($key) {
    $app = InstallApp $key $app
    if (-not $app) { exit 0 }
  } elseif (-not $app) {
    Die 'Máy chưa cài Agent Edit. Chạy: agent-edit.ps1 setup --key <KEY>  (tự tải + cài app, rồi cài công cụ).'
  } else {
    Die "Agent Edit trên máy là bản $appv, cần bản $MinVersion trở lên để chạy dòng lệnh. Mở app Agent Edit để nó tự cập nhật, hoặc chạy: agent-edit.ps1 setup --key <KEY>"
  }
}

# ---- chay app o che do CLI, hung stdout (app giao dien Windows chi in ra ong dan) roi in lai ----
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$exeArgs = @('--agent-edit-cli') + @($args)
if ($env:AGENT_EDIT_USER_DATA_DIR) { $exeArgs = @("--user-data-dir=$($env:AGENT_EDIT_USER_DATA_DIR)") + $exeArgs }
$ErrorActionPreference = 'Continue'
& $app @exeArgs | ForEach-Object { [Console]::Out.WriteLine($_) }
exit $LASTEXITCODE
