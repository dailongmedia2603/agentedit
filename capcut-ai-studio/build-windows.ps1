# =====================================================================================================
#  BUILD BẢN CÀI WINDOWS CHO AGENT EDIT  (chạy TRÊN máy Windows 10/11 64-bit)
#
#  Mở PowerShell trong thư mục capcut-ai-studio rồi chạy:
#      powershell -ExecutionPolicy Bypass -File .\build-windows.ps1
#  Tuỳ chọn:
#      -InstallPrereqs   tự cài Node.js 22 LTS + Visual Studio 2022 Build Tools (C++) bằng winget nếu thiếu
#      -Dir              chỉ đóng gói thư mục (release\win-unpacked), không tạo file Setup .exe
#      -SkipSelfTest     bỏ bước tự kiểm bản đóng gói (không khuyến khích)
#
#  Kết quả: release\Agent Edit-Setup-<phiên bản>-x64.exe  (+ release\win-unpacked\ để chạy thử không cần cài)
#  Chi tiết: BUILD-WINDOWS.md
# =====================================================================================================
param(
    [switch]$InstallPrereqs,
    [switch]$Dir,
    [switch]$SkipSelfTest
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location -LiteralPath $PSScriptRoot
# Terminal của VS Code / IDE đặt biến này -> Electron chạy như Node rồi thoát (build bytecode + tự kiểm hỏng)
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$t0 = Get-Date

function Step($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Ok($t) { Write-Host "  [OK] $t" -ForegroundColor Green }
function Warn($t) { Write-Host "  [!]  $t" -ForegroundColor Yellow }
function Fail($t) { Write-Host ""; Write-Host "  [LỖI] $t" -ForegroundColor Red; exit 1 }
function RefreshPath {
    $m = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $u = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$m;$u"
}
function HasWinget { return [bool](Get-Command winget -ErrorAction SilentlyContinue) }

# -----------------------------------------------------------------------------------------------------
Step '1/6  Kiểm tra máy build'
if (-not [Environment]::Is64BitOperatingSystem) { Fail 'Cần Windows 64-bit.' }
$build = [Environment]::OSVersion.Version.Build
if ($build -lt 17763) { Fail "Cần Windows 10 bản 1809 (build 17763) trở lên — máy đang là build $build." }
Ok "Windows build $build, 64-bit"

$here = (Get-Location).Path
if ($here.Length -gt 60) {
    Warn "Đường dẫn dự án dài ($($here.Length) ký tự): $here"
    Warn 'Nên đặt mã nguồn ở thư mục ngắn (vd C:\ae) để tránh giới hạn 260 ký tự đường dẫn của Windows.'
}
if ($here -match '[^\x00-\x7F]') { Warn 'Đường dẫn dự án có ký tự có dấu / Unicode — nên dùng đường dẫn chỉ gồm chữ không dấu (vd C:\ae).' }
$lp = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -ErrorAction SilentlyContinue).LongPathsEnabled
if ($lp -ne 1) { Warn 'Windows chưa bật "Long paths" (không bắt buộc nếu thư mục dự án ngắn). Xem BUILD-WINDOWS.md mục Long paths.' }

# Node.js >= 22 (x64)
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node -and $InstallPrereqs -and (HasWinget)) {
    Write-Host '  Cài Node.js LTS bằng winget...'
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
    RefreshPath
    $node = Get-Command node -ErrorAction SilentlyContinue
}
if (-not $node) { Fail 'Chưa có Node.js 22+. Cài tại https://nodejs.org (bản LTS 64-bit) hoặc chạy lại với -InstallPrereqs.' }
$nodeVer = (& node -p "process.versions.node").Trim()
if ([int]($nodeVer.Split('.')[0]) -lt 22 -and $InstallPrereqs -and (HasWinget)) {
    # Node cu (vd 20) -> nang len ban LTS moi (install; da cai bang winget thi upgrade)
    Write-Host "  Node.js $nodeVer quá cũ — nâng lên bản LTS mới bằng winget..."
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
    winget upgrade -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
    RefreshPath
    $nodeVer = (& node -p "process.versions.node").Trim()
}
$nodeArch = (& node -p "process.arch").Trim()
if ([int]($nodeVer.Split('.')[0]) -lt 22) {
    Fail ("Node.js $nodeVer quá cũ — cần 22 trở lên. Cài bản LTS 64-bit tại https://nodejs.org (cài đè bản cũ), " +
          'ĐÓNG hẳn PowerShell, mở lại rồi chạy lại script.')
}
if ($nodeArch -ne 'x64') { Fail "Node.js đang là bản $nodeArch — cần bản x64 (bytecode .jsc biên dịch theo kiến trúc)." }
Ok "Node.js $nodeVer ($nodeArch)"

# Visual Studio Build Tools có C++ (Cython biên dịch sidecar -> .pyd; thư viện chạy Visual C++ kèm Python nhúng)
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
function FindVC {
    if (-not (Test-Path $vswhere)) { return $null }
    $p = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($p) { return $p.Trim() } else { return $null }
}
$vc = FindVC
if (-not $vc -and $InstallPrereqs -and (HasWinget)) {
    Write-Host '  Cài Visual Studio 2022 Build Tools (C++) bằng winget — mất 5-15 phút...'
    winget install -e --id Microsoft.VisualStudio.2022.BuildTools --accept-package-agreements --accept-source-agreements `
        --override '--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended'
    $vc = FindVC
}
if (-not $vc) {
    Fail ('Chưa có Visual Studio 2022 Build Tools với "Desktop development with C++". Tải tại ' +
          'https://visualstudio.microsoft.com/visual-cpp-build-tools/ (chọn workload "Desktop development with C++"), ' +
          'hoặc chạy lại với -InstallPrereqs.')
}
Ok "Visual C++ Build Tools: $vc"

# -----------------------------------------------------------------------------------------------------
Step '2/6  Cài thư viện Node (npm ci — đúng phiên bản trong package-lock.json)'
if (Test-Path 'node_modules\electron\dist\electron.exe') {
    Ok 'node_modules đã có bản Windows — vẫn chạy npm ci để khớp lockfile.'
}
& npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Fail 'npm ci lỗi (xem dòng phía trên). Kiểm mạng / proxy rồi chạy lại.' }
if (-not (Test-Path 'node_modules\@remotion\compositor-win32-x64-msvc')) { Fail 'Thiếu @remotion/compositor-win32-x64-msvc sau npm ci (không render được MP4).' }
if (-not (Test-Path 'node_modules\electron\dist\electron.exe')) { Fail 'Thiếu Electron bản Windows sau npm ci.' }
Ok 'Đủ thư viện (Electron Windows, Remotion compositor Windows)'

# -----------------------------------------------------------------------------------------------------
Step '3/6  Chuẩn bị công cụ gắn icon cho file .exe (winCodeSign)'
# electron-builder tải winCodeSign-2.6.0.7z để dùng rcedit (gắn icon / tên / phiên bản vào .exe). Gói có symlink macOS
# -> giải nén lỗi "Cannot create symbolic link" khi Windows chưa bật Developer Mode. Giải nén trước, BỎ phần macOS/Linux.
$wcs = Join-Path $env:LOCALAPPDATA 'electron-builder\Cache\winCodeSign\winCodeSign-2.6.0'
if (-not (Test-Path (Join-Path $wcs 'rcedit-x64.exe'))) {
    $tmp7z = Join-Path $env:TEMP 'winCodeSign-2.6.0.7z'
    Invoke-WebRequest -Uri 'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z' -OutFile $tmp7z
    $sha = (Get-FileHash $tmp7z -Algorithm SHA256).Hash.ToLower()
    if ($sha -ne 'cdaec7154dda7cc31f88d886e2489379a0625a737d610b5ae7f62a12f16743a4') { Fail "winCodeSign tải về sai mã SHA-256 ($sha)." }
    New-Item -ItemType Directory -Force -Path $wcs | Out-Null
    & (Join-Path $PSScriptRoot 'node_modules\7zip-bin\win\x64\7za.exe') x -y "-o$wcs" $tmp7z '-x!darwin' '-x!linux' | Out-Null
    Remove-Item $tmp7z -Force
    if (-not (Test-Path (Join-Path $wcs 'rcedit-x64.exe'))) { Fail 'Giải nén winCodeSign không thành công.' }
}
Ok "winCodeSign sẵn sàng ($wcs)"

# -----------------------------------------------------------------------------------------------------
Step '4/6  Build + bảo vệ mã + đóng gói (10-25 phút)'
Write-Host '  electron-vite build -> Remotion bundle -> ffmpeg nhúng -> model ONNX -> Python nhúng (pip) ->'
Write-Host '  Cython .pyd -> obfuscate + bytenode .jsc -> electron-builder (NSIS)'
$script = if ($Dir) { 'dist:win:dir' } else { 'dist:win' }
& npm run $script
if ($LASTEXITCODE -ne 0) { Fail "npm run $script lỗi (xem dòng phía trên)." }
if (-not (Test-Path 'release\win-unpacked\Agent Edit.exe')) { Fail 'Không thấy release\win-unpacked\Agent Edit.exe sau khi build.' }
Ok 'Đã đóng gói release\win-unpacked'

# -----------------------------------------------------------------------------------------------------
Step '5/6  Tự kiểm bản đóng gói (HOME tạm — không đụng dữ liệu thật)'
if ($SkipSelfTest) {
    Warn 'Bỏ qua tự kiểm (-SkipSelfTest).'
} else {
    & node scripts\selftest-packaged.mjs
    if ($LASTEXITCODE -ne 0) { Fail 'Tự kiểm có mục LỖI (xem danh sách phía trên). Gửi toàn bộ nội dung cửa sổ này để xử lý.' }
    Ok 'Tự kiểm đạt'
}

# -----------------------------------------------------------------------------------------------------
Step '6/6  Kết quả'
$mins = [math]::Round(((Get-Date) - $t0).TotalMinutes, 1)
if (-not $Dir) {
    $setup = Get-ChildItem 'release\*-Setup-*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $setup) { Fail 'Không thấy file Setup .exe trong release\.' }
    $h = (Get-FileHash $setup.FullName -Algorithm SHA256).Hash.ToLower()
    Write-Host ''
    Write-Host "  Bộ cài:  $($setup.FullName)" -ForegroundColor Green
    Write-Host ("  Dung lượng: {0:N0} MB    SHA-256: {1}" -f ($setup.Length / 1MB), $h)
}
Write-Host "  Chạy thử không cần cài: release\win-unpacked\Agent Edit.exe"
Write-Host "  Tổng thời gian: $mins phút"
Write-Host ''
Write-Host '  Lần đầu mở app, Windows SmartScreen có thể báo "Windows protected your PC" (app chưa ký số):'
Write-Host '  bấm "More info" -> "Run anyway". Xem BUILD-WINDOWS.md.'
