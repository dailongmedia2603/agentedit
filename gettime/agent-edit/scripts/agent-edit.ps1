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
#   AGENT_EDIT_API, AGENT_EDIT_MIN_VERSION, AGENT_EDIT_USER_DATA_DIR, AGENT_EDIT_TEST_ANY_OS, AGENT_EDIT_DL_BUDGET (giay).
# --background (1.7.0, AI agent): moi lan goi chi tai bo cai toi da AGENT_EDIT_DL_BUDGET giay (mac dinh 150) -> chua xong thi in
#   JSON {"status":"running","step":"download","progress":...} + ma thoat 3; goi lai dung lenh do tai tiep (curl -C -).
# CHE DO CONG CU GETTIME (`tool <viec>`, 2026-10-20 — tool.json canh SKILL.md): giong ban macOS — moi lenh tra 1 khoi JSON trong
#   <= 25 giay, key qua bien AGENT_EDIT_KEY, viec dai tra ma viec ngay (r_/s_/l_ cua app, i_ tai + cai app, u_ cap nhat), GetTime
#   tu hoi `tool job <ma>`. Viec nen cua script chay bang Start-Process (ShellExecute — khong ke thua ong stdout cua GetTime).
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
# GetTime: moi thu tai ve nam o thu muc du lieu rieng cua cong cu (ngoai thu muc ky nang)
if ($env:GETTIME_TOOL_DATA) { $Work = Join-Path $env:GETTIME_TOOL_DATA 'download' }
# viec nen cua che do cong cu (i_ / u_) dang chay — Say / Die ghi vao do
$script:BootDir = $null
$DlBudget = 150
if ($env:AGENT_EDIT_DL_BUDGET) { $DlBudget = [int]$env:AGENT_EDIT_DL_BUDGET }
$Background = @($args | Where-Object { [string]$_ -eq '--background' }).Count -gt 0

try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)

# thong bao ra stderr -> stdout cua lenh `--json` van la JSON sach
function Say([string]$m) {
  [Console]::Error.WriteLine($m)
  if ($script:BootDir) { try { [IO.File]::AppendAllText((Join-Path $script:BootDir 'log.txt'), "$m`r`n", (New-Object System.Text.UTF8Encoding($false))) } catch { } }
}
function Die([string]$m) {
  Say "Lỗi: $m"
  if ($script:BootDir) { BootState 'error' '' $null $m }
  exit 2
}

# BootState <status> <step> <progress 0..1 | $null> <message> [app_job] — trang thai viec nen i_ / u_ (ghi nguyen tu)
function BootState([string]$st, [string]$step, $prog, [string]$msg, [string]$appJob = '') {
  if (-not $script:BootDir) { return }
  $o = [ordered]@{ id = (Split-Path -Leaf $script:BootDir); status = $st }
  if ($step) { $o.step = $step }
  if ($null -ne $prog) { $o.progress = $prog }
  $o.message = $msg
  if ($st -eq 'error') { $o.error = [ordered]@{ message = $msg } }
  if ($appJob) { $o.app_job = $appJob }
  $f = Join-Path $script:BootDir 'state.json'
  [IO.File]::WriteAllText("$f.tmp", ($o | ConvertTo-Json -Compress -Depth 4), (New-Object System.Text.UTF8Encoding($false)))
  Move-Item -LiteralPath "$f.tmp" -Destination $f -Force
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
  # ProductVersion cua bo cai electron-builder dang 1.5.1.0 -> lay 3 so dau
  try { return ((([string](Get-Item -LiteralPath $exe).VersionInfo.ProductVersion).Split('.') | Select-Object -First 3) -join '.') } catch { return '0' }
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

# SHA-512 cua file dang base64 (giong phieu phat hanh) — dung .NET truc tiep, KHONG dung Get-FileHash: Windows PowerShell 5.1
# goi tu tien trinh co PSModulePath cua PowerShell 7 (vd Node / Git Bash / AI agent) khong nap duoc cmdlet do (do that CI 2026-10-12)
function Sha512B64([string]$file) {
  $fs = [IO.File]::OpenRead($file)
  try {
    $sha = [Security.Cryptography.SHA512]::Create()
    return [Convert]::ToBase64String($sha.ComputeHash($fs))
  } finally { $fs.Dispose() }
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
    if ($Background) {
      # AI agent: tai toi da $DlBudget giay roi bao tien do (lenh khong bi cat o gioi han 10 phut, nguoi truc thay %)
      & $curl -fL -sS -C - --retry 2 --retry-delay 3 --max-time $DlBudget -o $setup ([string]$o.url) 2>$null
      $got = 0
      if (Test-Path -LiteralPath $setup) { $got = (Get-Item -LiteralPath $setup).Length }
      if ($got -ne $size) {
        $pct = [math]::Floor($got * 100 / $size)
        $mb = "$([math]::Floor($got / 1048576))/$([math]::Floor($size / 1048576)) MB"
        $j = [ordered]@{ ok = $true; status = 'running'; step = 'download'; progress = [math]::Round($got / $size, 2)
          message = "Đang tải Agent Edit $($o.version) — $pct% ($mb)"; next = 'Chạy lại đúng lệnh này để tải tiếp' }
        [Console]::Out.WriteLine(($j | ConvertTo-Json -Compress))
        exit 3
      }
      break
    }
    if ($script:BootDir) {
      # viec nen cua GetTime: tai mot mach, cu 2 giay ghi % vao state.json (GetTime hien tren the tien do)
      $cargs = "-fL -sS -C - --retry 3 --retry-delay 3 -o `"$setup`" `"$([string]$o.url)`""
      if ($OnWindows) { $cp = Start-Process -FilePath $curl -ArgumentList $cargs -PassThru -WindowStyle Hidden }
      else { $cp = Start-Process -FilePath $curl -ArgumentList $cargs -PassThru }
      while (-not $cp.HasExited) {
        $got = 0
        if (Test-Path -LiteralPath $setup) { $got = (Get-Item -LiteralPath $setup).Length }
        $pct = [math]::Min(99, [math]::Floor($got * 100 / $size))
        BootState 'running' 'download' ([math]::Round($pct / 100, 2)) "Đang tải Agent Edit $($o.version) — $pct% ($([math]::Floor($got / 1048576))/$([math]::Floor($size / 1048576)) MB)"
        Start-Sleep -Seconds 2
      }
      continue
    }
    & $curl -fL -sS -C - --retry 3 --retry-delay 3 -o $setup ([string]$o.url) 2>$null
    if ($LASTEXITCODE -ne 0) { Start-Sleep -Seconds 3 }
  }
  BootState 'running' 'install' 0.99 "Đã tải xong, đang kiểm tra và cài Agent Edit $($o.version)…"
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

# dong lenh Windows: moi doi so 1 phan tu (quy tac CommandLineToArgvW)
function QuoteArg([string]$a) {
  if ($a -ne '' -and $a -notmatch '[\s"]') { return $a }
  $sb = New-Object Text.StringBuilder
  [void]$sb.Append('"')
  $bs = 0
  foreach ($ch in $a.ToCharArray()) {
    if ($ch -eq [char]92) { $bs++; continue }
    if ($ch -eq [char]34) { [void]$sb.Append(('\' * ($bs * 2 + 1)) + '"'); $bs = 0; continue }
    if ($bs) { [void]$sb.Append('\' * $bs); $bs = 0 }
    [void]$sb.Append($ch)
  }
  [void]$sb.Append(('\' * ($bs * 2)) + '"')
  return $sb.ToString()
}

# =====================================================================================================================
# CHE DO CONG CU GETTIME: `agent-edit.ps1 tool <viec> [tham so]` (tool.json). Moi lenh in DUNG 1 khoi JSON ra stdout.
# Ma thoat: 0 = tra loi duoc (ke ca "dang chay") · 1 = loi that (GetTime danh dau loi cho AI). Giong het ban macOS.
# =====================================================================================================================
$ToolMin = '1.7.0' # can `setup --background` + `login --start`
if ($env:AGENT_EDIT_TOOL_MIN_VERSION) { $ToolMin = $env:AGENT_EDIT_TOOL_MIN_VERSION }
$KeyEnvVersion = '1.20.0' # `setup --key-env` (key qua bien moi truong)
$ToolData = Join-Path $UserHome '.capcut-studio\cli'
if ($env:GETTIME_TOOL_DATA) { $ToolData = $env:GETTIME_TOOL_DATA }
$TJ = Join-Path $ToolData 'tool-jobs'
$AppJobs = Join-Path $UserHome '.capcut-studio\cli\jobs'
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$script:KeepKey = $false
$script:RunOut = ''
$script:RunRc = 0

function ToolOutText([string]$text) {
  [Console]::Out.WriteLine($text)
  exit 0
}
function ToolOut($obj) { ToolOutText ($obj | ConvertTo-Json -Compress -Depth 6) }
function ToolFail([string]$msg, [string]$hint = '') {
  $e = [ordered]@{ message = $msg }
  if ($hint) { $e.hint = $hint }
  [Console]::Out.WriteLine(([ordered]@{ ok = $false; error = $e } | ConvertTo-Json -Compress -Depth 4))
  exit 1
}
function ReadJsonText([string]$text) {
  if (-not $text) { return $null }
  try { return ($text | ConvertFrom-Json) } catch { return $null }
}
function ReadJsonFile([string]$f) {
  try { return ReadJsonText ([IO.File]::ReadAllText($f, [Text.Encoding]::UTF8)) } catch { return $null }
}
function PidAlive($p) {
  if (-not $p) { return $false }
  return [bool](Get-Process -Id ([int]$p) -ErrorAction SilentlyContinue)
}
# ma viec: r_/s_/l_ (app) · i_/u_ (script) · mv-YYYYMMDD-HHMMSS-xxxx (Tao video) · post_... (dang Phone Agent)
function ValidId([string]$id) { return $id -cmatch '^([irslu]_[a-z0-9]{6,24}|mv-[0-9]{8}-[0-9]{6}-[a-z0-9]{2,8}|post_[a-z0-9]{6,30})$' }

# dich vu nen cua app (Tao video / Automation / dang bai) dang song? (file svc-*.json do app ghi, pid con chay)
function SvcAlive {
  $d = Join-Path $UserHome '.capcut-studio\cli\svc'
  if (-not (Test-Path -LiteralPath $d)) { return $false }
  foreach ($f in @(Get-ChildItem -LiteralPath $d -Filter 'svc-*.json' -ErrorAction SilentlyContinue)) {
    $i = ReadJsonFile $f.FullName
    if ($i -and (PidAlive $i.pid)) { return $true }
  }
  return $false
}

# viec Tao video / bai dang: dich vu ghi file trang thai moi khi doi buoc -> doc thang; dich vu da tat giua chung -> hoi app
function ToolSvcJob([string]$id) {
  if ($id.StartsWith('mv-')) { $f = Join-Path $UserHome ".capcut-studio\cli\motion\$id.json" }
  else { $f = Join-Path $UserHome ".capcut-studio\cli\posts\$id.json" }
  if (Test-Path -LiteralPath $f) {
    $text = ''
    try { $text = [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8).Trim() } catch { }
    $j = ReadJsonText $text
    if ($j) {
      if (@('done', 'error', 'cancelled') -contains [string]$j.status) { ToolOutText $text }
      if (SvcAlive) { ToolOutText $text }
    }
  }
  ToolNeedApp
  if ($id.StartsWith('mv-')) { AppRun 20 @('motion', 'status', $id, '--json') } else { AppRun 20 @('post', 'status', $id, '--json') }
  if ($script:RunRc -eq 124) { ToolOut ([ordered]@{ ok = $true; status = 'running'; message = 'Đang chạy.' }) }
  ToolRelay -Soft
}
function NewId([string]$prefix) { return $prefix + '_' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + (Get-Random -Minimum 100 -Maximum 999) }

# AppRun <giay> <tham so...>: chay CLI cua app toi da <giay> (GetTime cat moi lenh o 25 giay) -> RunOut, RunRc (124 = het gio).
# ShellExecute (khong ke thua handle) + ket qua qua FILE nhu luong CLI ben duoi. Key ban quyen CHI di theo khi kich hoat.
function AppRun([int]$limit, [string[]]$cliArgs) {
  $outFile = [IO.Path]::GetTempFileName()
  $errFile = [IO.Path]::GetTempFileName()
  $exeArgs = @('--agent-edit-cli') + $cliArgs
  if ($env:AGENT_EDIT_USER_DATA_DIR) { $exeArgs = @("--user-data-dir=$($env:AGENT_EDIT_USER_DATA_DIR)") + $exeArgs }
  $argLine = (@($exeArgs | ForEach-Object { QuoteArg ([string]$_) }) -join ' ')
  $savedKey = $env:AGENT_EDIT_KEY
  $env:AGENT_EDIT_OUT_FILE = $outFile
  $env:AGENT_EDIT_ERR_FILE = $errFile
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  if (-not $script:KeepKey) { Remove-Item Env:AGENT_EDIT_KEY -ErrorAction SilentlyContinue }
  $p = $null
  try {
    if ($OnWindows) { $p = Start-Process -FilePath $app -ArgumentList $argLine -PassThru -WindowStyle Hidden }
    else { $p = Start-Process -FilePath $app -ArgumentList $argLine -PassThru }
    $null = $p.Handle
  } catch {
    $p = $null
  } finally {
    Remove-Item Env:AGENT_EDIT_OUT_FILE, Env:AGENT_EDIT_ERR_FILE -ErrorAction SilentlyContinue
    if ($savedKey) { $env:AGENT_EDIT_KEY = $savedKey }
  }
  $script:RunRc = 1
  if ($p) {
    if ($p.WaitForExit($limit * 1000)) {
      $p.WaitForExit()
      $script:RunRc = $p.ExitCode
      if ($null -eq $script:RunRc) { $script:RunRc = 1 }
    } else {
      try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch { }
      $script:RunRc = 124
    }
  }
  $script:RunOut = ''
  try { $script:RunOut = [IO.File]::ReadAllText($outFile, [Text.Encoding]::UTF8).Trim() } catch { }
  Remove-Item -LiteralPath $outFile, $errFile -Force -ErrorAction SilentlyContinue
}

# in ket qua AppRun. soft = moi cau tra loi JSON deu la "tra loi duoc" (vd login-check: chua dang nhap khong phai loi)
function ToolRelay([switch]$Soft) {
  if (-not $script:RunOut) { ToolFail "Agent Edit không trả lời (mã $($script:RunRc))." 'Gọi lại; vẫn lỗi thì mở app Agent Edit xem có thông báo gì không.' }
  [Console]::Out.WriteLine($script:RunOut)
  if ($Soft) { exit 0 }
  if ($script:RunRc -eq 0 -or $script:RunRc -eq 3) { exit 0 }
  if ($script:RunOut -match '"ok":\s*true') { exit 0 }
  exit 1
}

function ToolNeedApp {
  if (-not $app) { ToolFail 'Máy chưa cài Agent Edit.' 'Gọi hành động setup (cần key bản quyền).' }
  if (-not (VerGe $appv $ToolMin)) { ToolFail "Agent Edit trên máy là bản $appv — quá cũ." 'Gọi hành động setup để cập nhật (hoặc mở app Agent Edit cho nó tự cập nhật).' }
}

# viec nen i_ (tai + cai app) con dang chay -> ma viec
function BootRunning {
  if (-not (Test-Path -LiteralPath $TJ)) { return $null }
  foreach ($d in @(Get-ChildItem -LiteralPath $TJ -Directory -Filter 'i_*' -ErrorAction SilentlyContinue)) {
    $st = ReadJsonFile (Join-Path $d.FullName 'state.json')
    if (-not $st -or $st.status -ne 'running') { continue }
    $p = $null
    try { $p = ([IO.File]::ReadAllText((Join-Path $d.FullName 'pid'))).Trim() } catch { }
    if (PidAlive $p) { return $d.Name }
  }
  return $null
}

# chay chinh script nay nen (ShellExecute, cua so an) cho viec i_ / u_
function StartBg([string]$sub, [string]$id) {
  $ps = (Get-Process -Id $PID).Path
  $line = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File $(QuoteArg $PSCommandPath) $sub $id"
  if ($OnWindows) { $bp = Start-Process -FilePath $ps -ArgumentList $line -PassThru -WindowStyle Hidden }
  else { $bp = Start-Process -FilePath $ps -ArgumentList $line -PassThru }
  [IO.File]::WriteAllText((Join-Path (Join-Path $TJ $id) 'pid'), [string]$bp.Id)
}

# ---- tool status: dieu `check` cua GetTime doc (ready) — ban gon ----
function ToolStatus {
  $boot = BootRunning
  if (-not $app -or -not (VerGe $appv $ToolMin)) {
    $o = [ordered]@{ ok = $true; ready = $false; installed = [bool]$app; version = $appv; message = 'Máy chưa cài Agent Edit.'; next = @('setup') }
    if ($app) { $o.message = "Agent Edit trên máy là bản $appv — quá cũ, cần cập nhật." }
    if ($boot) { $o.message = "Đang tải và cài Agent Edit (việc $boot)."; $o.installing = $boot }
    ToolOut $o
  }
  AppRun 22 @('status', '--json')
  if ($script:RunRc -eq 124) { ToolOut ([ordered]@{ ok = $true; ready = $false; installed = $true; message = 'Agent Edit chưa trả lời kịp (máy đang bận?) — kiểm tra lại sau ít giây.' }) }
  $s = ReadJsonText $script:RunOut
  if (-not $s -or $null -eq $s.ready) { ToolRelay }
  $missing = @()
  foreach ($c in @($s.checks)) { if ($c -and $c.status -eq 'fail') { $missing += "$($c.label) — $($c.detail)" } }
  $next = @()
  foreach ($n in @($s.next)) {
    $t = [string]$n
    if (-not $t) { continue }
    if ($t -like '*activate*') { $next += 'setup (kích hoạt key bản quyền)' }
    elseif ($t -like '*login gemini*') { $next += 'login gemini' }
    elseif ($t -like '*login claude*') { $next += 'login claude' }
    elseif ($t -like '*login codex*') { $next += 'login codex (tuỳ chọn: ảnh AI)' }
    elseif ($t -like '*gemini-key*') { $next += 'API key Gemini: nhập trong app Agent Edit › Cài đặt API (hoặc đổi sang đăng nhập)' }
    elseif ($t -like '*claude-key*') { $next += 'API key Claude: nhập trong app Agent Edit › Cài đặt API (hoặc đổi sang đăng nhập)' }
    elseif ($t -like '*setup*') { $next += 'setup' }
    else { $next += $t }
  }
  $o = [ordered]@{ ok = $true; ready = [bool]$s.ready; installed = $true; version = [string]$s.version
    license = [ordered]@{ status = [string]$s.license.status; message = [string]$s.license.message }; missing = $missing; next = $next }
  if ($boot) { $o.installing = $boot }
  ToolOut $o
}

# `setup --background` cua app (kich hoat key truoc neu ban quyen chua OK) -> RunOut / RunRc
function AppSetupBg {
  $a = @('setup', '--background', '--json')
  if ($Key) {
    AppRun 8 @('license', '--json')
    $l = ReadJsonText $script:RunOut
    if (-not $l -or $l.status -ne 'ok') {
      if (VerGe $appv $KeyEnvVersion) { $script:KeepKey = $true; $a += '--key-env' }
      else { $a += @('--key', $Key) }
    }
  }
  AppRun 15 $a
  $script:KeepKey = $false
}

# ---- tool setup: cai app (neu chua co / qua cu) + kich hoat key + cai cong cu + dong bo kho — viec dai ----
function ToolSetup {
  $cur = BootRunning
  if ($cur) { ToolOut ([ordered]@{ ok = $true; id = $cur; status = 'running'; message = 'Đang có lượt tải và cài Agent Edit chạy.' }) }
  if (-not $app -or -not (VerGe $appv $ToolMin)) {
    if (-not $Key) { ToolFail 'Cần key bản quyền Agent Edit để tải và cài app.' 'Gọi gettime_ask_field cho trường license-key, người trực lưu xong thì gọi lại setup.' }
    $id = NewId 'i'
    $dir = Join-Path $TJ $id
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $script:BootDir = $dir
    BootState 'running' 'download' 0 'Đang lấy bản Agent Edit mới nhất…'
    $script:BootDir = $null
    StartBg '__tool-boot' $id
    ToolOut ([ordered]@{ ok = $true; id = $id; status = 'running'; message = 'Bắt đầu tải và cài Agent Edit (thường 5–20 phút).' })
  }
  AppSetupBg
  if ($script:RunRc -eq 124) { ToolFail 'Agent Edit chưa trả lời kịp.' 'Gọi lại setup sau ít giây.' }
  ToolRelay
}

# viec nen i_: tai + cai app -> `setup --background` cua app (ma s_ ghi vao state.json -> `tool job i_` doc tiep)
function ToolBootRun([string]$id) {
  $script:BootDir = Join-Path $TJ $id
  if (-not (Test-Path -LiteralPath $script:BootDir)) { exit 2 }
  $new = InstallApp $Key $app
  if (-not $new) { Die 'Không cài được Agent Edit.' }
  $script:app = [string]$new
  $script:appv = AppVersion $script:app
  BootState 'running' 'license' 0.99 "Đã cài Agent Edit $($script:appv), đang kích hoạt key và bắt đầu cài công cụ…"
  AppSetupBg
  $r = ReadJsonText $script:RunOut
  if (-not $r -or -not $r.id) {
    $m = 'Kích hoạt / cài công cụ không thành công.'
    if ($r -and $r.error) { if ($r.error.message) { $m = [string]$r.error.message } else { $m = [string]$r.error } }
    Die $m
  }
  BootState 'running' 'tools' 0 'Đã cài app, đang cài công cụ (5–20 phút)…' ([string]$r.id)
  exit 0
}

# viec nen u_: cap nhat app (lenh `update` cua app chay mot mach, co the lau)
function ToolUpdateRun([string]$id) {
  $script:BootDir = Join-Path $TJ $id
  if (-not (Test-Path -LiteralPath $script:BootDir)) { exit 2 }
  AppRun 3600 @('update', '--json')
  $r = ReadJsonText $script:RunOut
  if ($r -and $r.ok) {
    if ($r.updated) { BootState 'done' '' 1 "Đã tải bản $($r.to) — Agent Edit tự thay app trong khoảng 30 giây." }
    else { BootState 'done' '' 1 "Agent Edit đang ở bản mới nhất ($($r.version))." }
  } else {
    $m = 'Cập nhật không thành công.'
    if ($r -and $r.error) { $m = [string]$r.error }
    BootState 'error' '' $null $m
  }
  exit 0
}

# trang thai 1 viec cua app: doc thang job.json (khong mo app moi 3 giay); tien trinh viec da chet -> hoi app (app danh dau loi)
function ToolAppJob([string]$id) {
  $f = Join-Path $AppJobs "$id\job.json"
  if (Test-Path -LiteralPath $f) {
    $text = ''
    try { $text = [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8) } catch { }
    $j = ReadJsonText $text
    if ($j) {
      if (@('done', 'error', 'cancelled') -contains [string]$j.status) { ToolOutText $text }
      if ($j.pid -and (PidAlive $j.pid)) { ToolOutText $text }
      if ($j.status -eq 'queued' -and -not $j.pid) { ToolOutText $text }
    }
  }
  ToolNeedApp
  AppRun 15 @('job', $id, '--json')
  if ($script:RunRc -eq 124) { ToolOut ([ordered]@{ ok = $true; status = 'running'; message = 'Đang chạy.' }) }
  ToolRelay -Soft
}

function ToolJob([string]$id) {
  if (-not (ValidId $id)) { ToolFail "Mã việc không hợp lệ: $id" }
  if ($id -match '^[iu]_') {
    $dir = Join-Path $TJ $id
    $f = Join-Path $dir 'state.json'
    $st = ReadJsonFile $f
    if (-not $st) { ToolFail "Không có việc $id." }
    if ($st.app_job -and (ValidId ([string]$st.app_job))) { ToolAppJob ([string]$st.app_job) }
    $p = $null
    try { $p = ([IO.File]::ReadAllText((Join-Path $dir 'pid'))).Trim() } catch { }
    if ($st.status -eq 'running' -and -not (PidAlive $p)) {
      $script:BootDir = $dir
      if ($id.StartsWith('i')) { BootState 'error' '' $null "Tiến trình tải và cài đã dừng bất thường — gọi lại setup. Nhật ký: $dir\log.txt" }
      else { BootState 'error' '' $null "Tiến trình cập nhật đã dừng bất thường — gọi lại update. Nhật ký: $dir\log.txt" }
      $script:BootDir = $null
    }
    ToolOutText ([IO.File]::ReadAllText($f, [Text.Encoding]::UTF8).Trim())
  }
  if ($id -match '^(mv-|post_)') { ToolSvcJob $id }
  ToolAppJob $id
}

function ToolCancel([string]$id) {
  if (-not (ValidId $id)) { ToolFail "Mã việc không hợp lệ: $id" }
  if ($id -match '^[iu]_') {
    $dir = Join-Path $TJ $id
    $st = ReadJsonFile (Join-Path $dir 'state.json')
    if (-not $st) { ToolFail "Không có việc $id." }
    if ($st.app_job -and (ValidId ([string]$st.app_job))) {
      ToolNeedApp
      AppRun 18 @('cancel', [string]$st.app_job, '--json')
    }
    $p = $null
    try { $p = ([IO.File]::ReadAllText((Join-Path $dir 'pid'))).Trim() } catch { }
    if (PidAlive $p) {
      if ($OnWindows) { & taskkill.exe /PID $p /T /F 2>$null | Out-Null }
      else { Stop-Process -Id ([int]$p) -Force -ErrorAction SilentlyContinue }
    }
    $script:BootDir = $dir
    BootState 'cancelled' '' $null 'Đã dừng.'
    $script:BootDir = $null
    ToolOut ([ordered]@{ ok = $true; status = 'cancelled' })
  }
  ToolNeedApp
  if ($id.StartsWith('mv-')) { AppRun 18 @('motion', 'cancel', $id, '--json') }
  elseif ($id.StartsWith('post_')) { AppRun 18 @('post', 'cancel', $id, '--json') }
  else { AppRun 18 @('cancel', $id, '--json') }
  if ($script:RunRc -eq 124) { ToolOut ([ordered]@{ ok = $true; status = 'cancelling'; message = 'Đã gửi lệnh dừng.' }) }
  ToolRelay
}

function ToolUpdate {
  ToolNeedApp
  $id = NewId 'u'
  $dir = Join-Path $TJ $id
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $script:BootDir = $dir
  BootState 'running' 'update' $null 'Đang kiểm tra và tải bản Agent Edit mới…'
  $script:BootDir = $null
  StartBg '__tool-update' $id
  ToolOut ([ordered]@{ ok = $true; id = $id; status = 'running'; message = 'Đang cập nhật Agent Edit.' })
}

# tool login <tai khoan> [--device] / login-code <tai khoan> <ma> / login-check <tai khoan>
function ToolLogin([string]$sub, [string[]]$rest) {
  $acc = ''
  if ($rest.Count -gt 0) { $acc = [string]$rest[0] }
  if (@('gemini', 'claude', 'codex') -notcontains $acc) { ToolFail 'Tài khoản phải là gemini, claude hoặc codex.' }
  ToolNeedApp
  if ($sub -eq 'login') {
    $a = @('login', $acc, '--start')
    if ($rest -contains '--device') { $a += '--device' }
    AppRun 20 ($a + '--json')
    if ($script:RunRc -eq 124) { ToolOut ([ordered]@{ ok = $true; status = 'running'; account = $acc; message = 'Đang mở trang đăng nhập — gọi login-check sau vài giây để lấy link.' }) }
    ToolRelay -Soft
  }
  if ($sub -eq 'login-code') {
    if ($rest.Count -lt 2 -or -not [string]$rest[1]) { ToolFail 'Thiếu mã đăng nhập.' }
    AppRun 20 @('login', $acc, '--code', [string]$rest[1], '--json')
    if ($script:RunRc -eq 124) { ToolOut ([ordered]@{ ok = $true; status = 'running'; account = $acc; message = 'Đã gửi mã, đang chờ xác nhận — gọi login-check sau vài giây.' }) }
    ToolRelay
  }
  AppRun 20 @('login', $acc, '--check', '--json')
  if ($script:RunRc -eq 124) { ToolOut ([ordered]@{ ok = $true; status = 'running'; account = $acc; message = 'Chưa có kết quả — gọi lại login-check sau vài giây.' }) }
  ToolRelay -Soft
}

# tool make <tham so cua make>. Tu lieu chen: --insert-notes / --insert-uses / --insert-placements "<dong 1>`n<dong 2>" — DONG i
# la cua tu lieu thu i (dong trong = mac dinh: khong ghi chu / show / auto). --brand-font-file can app >= $FontFileVersion.
$FontFileVersion = '1.21.0'
if ($env:AGENT_EDIT_FEATURE_MIN_VERSION) { $FontFileVersion = $env:AGENT_EDIT_FEATURE_MIN_VERSION }
function ToolMake([string[]]$rest) {
  ToolNeedApp
  $a = @('make')
  $hasFont = $false
  $perLine = @{ '--insert-notes' = @('--insert-note', ''); '--insert-uses' = @('--insert-use', 'show'); '--insert-placements' = @('--insert-placement', 'auto') }
  for ($i = 0; $i -lt $rest.Count; $i++) {
    $arg = [string]$rest[$i]
    if ($perLine.ContainsKey($arg) -and ($i + 1) -lt $rest.Count) {
      $flag = $perLine[$arg][0]
      $dflt = $perLine[$arg][1]
      $lines = @(([string]$rest[$i + 1]) -split "`r?`n" | ForEach-Object { $_.Trim() })
      $n = $lines.Count
      while ($n -gt 0 -and -not $lines[$n - 1]) { $n-- }
      for ($k = 0; $k -lt $n; $k++) {
        $v = $lines[$k]
        if (-not $v) { $v = $dflt }
        $a += @($flag, $v)
      }
      $i++
      continue
    }
    if (@('--brand-font-file', '--from', '--no-inserts', '--no-reference') -contains $arg) { $hasFont = $true }
    $a += $arg
  }
  if ($hasFont -and -not (VerGe $appv $FontFileVersion)) {
    ToolFail "Agent Edit trên máy (bản $appv) chưa hỗ trợ file font gửi qua chat / làm lại video đã tạo (from)." 'Gọi hành động update (cập nhật Agent Edit) rồi gọi lại make.'
  }
  AppRun 22 ($a + '--json')
  if ($script:RunRc -eq 124) { ToolFail 'Agent Edit chưa nhận việc kịp.' 'Gọi hành động jobs xem việc đã được tạo chưa trước khi gọi lại make.' }
  ToolRelay
}

# tool cli <lenh cua app...>: chay 1 lenh CLI cua app (Tao video, Automation, dang bai, Video da tao, cai dat...) va tra JSON.
# O nhieu dong cua GetTime -> lap lai tham so: --vars / --post-vars / --sources (moi dong 1 --var / --post-var / --source).
$CliSvcMinVersion = '1.21.0'
if ($env:AGENT_EDIT_FEATURE_MIN_VERSION) { $CliSvcMinVersion = $env:AGENT_EDIT_FEATURE_MIN_VERSION }
# Bot Telegram (lenh `telegram`, token qua `tool keys`) co tu app 1.22.0
$TelegramMinVersion = '1.22.0'
if ($env:AGENT_EDIT_FEATURE_MIN_VERSION) { $TelegramMinVersion = $env:AGENT_EDIT_FEATURE_MIN_VERSION }
function ToolCli([string[]]$rest) {
  ToolNeedApp
  if (-not (VerGe $appv $CliSvcMinVersion)) { ToolFail "Agent Edit trên máy (bản $appv) chưa có chức năng này qua chat." 'Gọi hành động update để cập nhật Agent Edit rồi thử lại.' }
  if ($rest.Count -gt 0 -and [string]$rest[0] -eq 'telegram' -and -not (VerGe $appv $TelegramMinVersion)) {
    ToolFail "Agent Edit trên máy (bản $appv) chưa có Bot Telegram." 'Gọi hành động update để cập nhật Agent Edit rồi thử lại.'
  }
  $map = @{ '--vars' = '--var'; '--post-vars' = '--post-var'; '--sources' = '--source' }
  $a = @()
  for ($i = 0; $i -lt $rest.Count; $i++) {
    $arg = [string]$rest[$i]
    if ($map.ContainsKey($arg) -and ($i + 1) -lt $rest.Count) {
      foreach ($line in ([string]$rest[$i + 1] -split "`r?`n")) {
        $t = $line.Trim()
        if ($t) { $a += @($map[$arg], $t) }
      }
      $i++
      continue
    }
    $a += $arg
  }
  AppRun 22 ($a + '--json')
  if ($script:RunRc -eq 124) { ToolFail 'Agent Edit chưa trả lời kịp (lần đầu bật chạy nền có thể lâu hơn).' 'Gọi lại sau vài giây.' }
  ToolRelay
}

# tool keys: dua key SaydiVoice / token Phone Agent nguoi truc nhap trong GetTime vao app (luu ma hoa nhu o Cai dat API).
# Chi gui muc da nhap — khong xoa key dang co cua app.
function ToolKeys {
  ToolNeedApp
  if (-not (VerGe $appv $CliSvcMinVersion)) { ToolFail "Agent Edit trên máy (bản $appv) chưa nhận key qua chat." 'Gọi hành động update rồi thử lại.' }
  $o = [ordered]@{ ok = $true }
  if ($env:AGENT_EDIT_SAYDI_KEY) {
    AppRun 20 @('settings', 'saydi-key', '--json')
    $o.saydi = ReadJsonText $script:RunOut
    if ($script:RunRc -ne 0) { $o.ok = $false }
  }
  if ($env:AGENT_EDIT_PA_TOKEN) {
    AppRun 20 @('settings', 'phoneagent-token', '--json')
    $o.phoneAgent = ReadJsonText $script:RunOut
    if ($script:RunRc -ne 0) { $o.ok = $false }
  }
  if ($env:AGENT_EDIT_TG_TOKEN) {
    if (VerGe $appv $TelegramMinVersion) {
      AppRun 20 @('telegram', 'token', '--json')
      $o.telegram = ReadJsonText $script:RunOut
      if ($script:RunRc -ne 0) { $o.ok = $false }
    } else {
      $o.telegram = [ordered]@{ ok = $false; error = "Agent Edit bản $appv chưa có Bot Telegram — gọi update rồi gọi lại keys." }
      $o.ok = $false
    }
  }
  if ($o.Count -eq 1) { ToolFail 'Chưa có key nào được nhập trong GetTime.' 'Gọi gettime_ask_field cho trường saydi-key, phoneagent-token hoặc telegram-bot-token trước.' }
  [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 6))
  if ($o.ok) { exit 0 }
  exit 1
}

# tool jobs — danh sach gon 8 viec gan nhat
function ToolJobs {
  ToolNeedApp
  AppRun 20 @('jobs', '--json')
  if ($script:RunRc -eq 124) { ToolFail 'Agent Edit chưa trả lời kịp.' 'Gọi lại sau ít giây.' }
  $r = ReadJsonText $script:RunOut
  if (-not $r) { ToolRelay }
  $rows = @()
  foreach ($j in @($r.jobs | Select-Object -First 8)) {
    if (-not $j) { continue }
    $o = [ordered]@{ id = [string]$j.id; kind = [string]$j.kind; status = [string]$j.status; createdAt = [string]$j.createdAt; message = [string]$j.message }
    $file = ''
    if ($j.result) { $file = [string]$j.result.copy; if (-not $file) { $file = [string]$j.result.output } }
    if ($file) { $o.file = $file }
    if ($j.error -and $j.error.message) { $o.error = [string]$j.error.message }
    $rows += New-Object PSObject -Property $o
  }
  ToolOut ([ordered]@{ ok = $true; jobs = $rows })
}

if ($cmd -eq 'tool' -or $cmd -eq '__tool-boot' -or $cmd -eq '__tool-update') {
  # key ban quyen: CHI tu bien moi truong (GetTime cat trong Keychain / DPAPI) — khong bao gio tren dong lenh
  $Key = ([string]$env:AGENT_EDIT_KEY -replace '[^A-Za-z0-9-]', '')
  New-Item -ItemType Directory -Force -Path $TJ | Out-Null
  if ($cmd -eq '__tool-boot') { ToolBootRun ([string]$args[1]) }
  if ($cmd -eq '__tool-update') { ToolUpdateRun ([string]$args[1]) }
  $sub = ''
  if ($args.Count -gt 1) { $sub = [string]$args[1] }
  $rest = @($args | Select-Object -Skip 2 | ForEach-Object { [string]$_ })
  switch ($sub) {
    'status' { ToolStatus }
    'setup' { ToolSetup }
    'job' { ToolJob ([string]($rest | Select-Object -First 1)) }
    'cancel' { ToolCancel ([string]($rest | Select-Object -First 1)) }
    { @('login', 'login-code', 'login-check') -contains $_ } { ToolLogin $sub $rest }
    'make' { ToolMake $rest }
    'jobs' { ToolJobs }
    'update' { ToolUpdate }
    'cli' { ToolCli $rest }
    'keys' { ToolKeys }
  }
  ToolFail "Không có việc `"$sub`" (status | setup | job | cancel | login | login-code | login-check | make | jobs | update | cli | keys)."
}

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

# ---- chay app o che do CLI ----
# App Windows la app GIAO DIEN (chi in ra ong dan). KHONG chay qua ong dan: viec nen cua `make` co the KE THUA ong stdout ->
# lenh goi (AI agent) treo toi khi video xong. Chay bang ShellExecute (Start-Process -WindowStyle Hidden: khong ke thua handle
# nao), app ghi ket qua vao FILE (AGENT_EDIT_OUT_FILE / AGENT_EDIT_ERR_FILE) -> script doc dan va in lai (UTF-8).

$outFile = [IO.Path]::GetTempFileName()
$errFile = [IO.Path]::GetTempFileName()
$env:AGENT_EDIT_OUT_FILE = $outFile
$env:AGENT_EDIT_ERR_FILE = $errFile
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$exeArgs = @('--agent-edit-cli') + @($args)
if ($env:AGENT_EDIT_USER_DATA_DIR) { $exeArgs = @("--user-data-dir=$($env:AGENT_EDIT_USER_DATA_DIR)") + $exeArgs }
$argLine = (@($exeArgs | ForEach-Object { QuoteArg ([string]$_) }) -join ' ')

# in phan moi cua file ket qua (doc ca file — nho, khong cat giua ky tu UTF-8)
$shown = @{ out = 0; err = 0 }
function Relay([string]$file, [string]$k, [IO.TextWriter]$w) {
  try { $t = [IO.File]::ReadAllText($file, [Text.Encoding]::UTF8) } catch { return }
  if ($t.Length -gt $shown[$k]) {
    $w.Write($t.Substring($shown[$k]))
    $w.Flush()
    $shown[$k] = $t.Length
  }
}

$ErrorActionPreference = 'Continue'
try {
  if ($OnWindows) { $p = Start-Process -FilePath $app -ArgumentList $argLine -PassThru -WindowStyle Hidden }
  else { $p = Start-Process -FilePath $app -ArgumentList $argLine -PassThru }
  $null = $p.Handle # Windows PowerShell 5.1: giu handle -> doc duoc ExitCode sau khi thoat
  while (-not $p.HasExited) {
    Relay $outFile 'out' ([Console]::Out)
    Relay $errFile 'err' ([Console]::Error)
    Start-Sleep -Milliseconds 300
  }
  $p.WaitForExit()
  Relay $outFile 'out' ([Console]::Out)
  Relay $errFile 'err' ([Console]::Error)
  $code = $p.ExitCode
} finally {
  Remove-Item Env:AGENT_EDIT_OUT_FILE, Env:AGENT_EDIT_ERR_FILE -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $outFile, $errFile -Force -ErrorAction SilentlyContinue
}
if ($null -eq $code) { $code = 1 }
exit $code
