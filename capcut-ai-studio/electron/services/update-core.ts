// LOI TU CAP NHAT (khong import 'electron' -> test bang Node: tests/test_updater.mts).
//
// Phieu phien ban (manifest) do scripts/publish-update.mjs tao + KY bang khoa Ed25519 rieng (~/.capcut-studio/
// update-signing.json / GitHub Secret UPDATE_SIGNING_KEY). May chu ban quyen chi chuyen tiep phieu + them link tai tam;
// app TU kiem chu ky bang UPDATE_PUB nhung san -> R2 / Worker bi chiem cung khong day duoc ban gia.
//   offer = { m: "<JSON phieu, giu NGUYEN chuoi da ky>", sig: "<base64 chu ky tren m>", url: "<link tai tam>" }
//   m = { v:1, channel, platform:'darwin'|'win32', arch:'arm64'|'x64', version, build, file, size, sha512, notes, released_at }
import { createHash, createPublicKey, verify } from 'crypto'
import { createReadStream } from 'fs'

/** Khoa cong khai ky ban cap nhat (khoa bi mat: ~/.capcut-studio/update-signing.json). Doi = phai cai tay 1 lan. */
export const UPDATE_PUB = 'VxEmHMIvhCHTz9eEgqPdFHPm9aVdtQneFjN03yw1z18='

export interface UpdateManifest {
  v: 1
  channel: string
  platform: 'darwin' | 'win32'
  arch: 'arm64' | 'x64'
  version: string
  build: string
  file: string
  size: number
  sha512: string
  notes: string
  released_at: number
}
export interface UpdateOffer {
  m: string
  sig: string
  url: string
}

// ---------------------------------------------------------------------------
// So phien ban: version (1.2.3) truoc, bang nhau thi so ma build (20261009-1530, ngay-gio -> so chuoi duoc)
// ---------------------------------------------------------------------------
const BUILD_RE = /^\d{8}-\d{4}$/
export function parseVersion(v: string): number[] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v || '').trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}
/** >0: (aV,aB) moi hon (bV,bB); 0: bang; <0: cu hon. Ma build sai dang (ban dev / -full) coi nhu cu nhat. */
export function compareRelease(aV: string, aB: string, bV: string, bB: string): number {
  const a = parseVersion(aV) || [0, 0, 0]
  const b = parseVersion(bV) || [0, 0, 0]
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]
  const ab = BUILD_RE.test(aB || '') ? aB : ''
  const bb = BUILD_RE.test(bB || '') ? bB : ''
  return ab === bb ? 0 : ab > bb ? 1 : -1
}

/** Ten file tai ve an toan (khong thu muc / ky tu la) — ghep vao duong dan tren may. */
export const safeFileName = (f: string): boolean => /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/.test(f) && !f.includes('..')

// ---------------------------------------------------------------------------
// Kiem phieu
// ---------------------------------------------------------------------------
export interface VerifyCtx {
  platform: string
  arch: string
  version: string
  build: string
  /** Chi tu kiem (--update-selftest): cho phep ban KHONG moi hon (cai lai chinh no) — chu ky van bat buoc. */
  force?: boolean
  pub?: string
}
export type VerifyResult = { ok: true; manifest: UpdateManifest } | { ok: false; error: string; notNewer?: boolean }

export function verifyOffer(offer: unknown, ctx: VerifyCtx): VerifyResult {
  const o = offer as Partial<UpdateOffer> | null
  if (!o || typeof o.m !== 'string' || typeof o.sig !== 'string' || typeof o.url !== 'string') return { ok: false, error: 'Phiếu cập nhật thiếu dữ liệu.' }
  if (o.m.length > 20000) return { ok: false, error: 'Phiếu cập nhật quá lớn.' }
  try {
    const pub = createPublicKey({
      key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(ctx.pub || UPDATE_PUB, 'base64')]),
      format: 'der',
      type: 'spki'
    })
    if (!verify(null, Buffer.from(o.m, 'utf-8'), pub, Buffer.from(o.sig, 'base64'))) return { ok: false, error: 'Chữ ký bản cập nhật không hợp lệ.' }
  } catch {
    return { ok: false, error: 'Chữ ký bản cập nhật không hợp lệ.' }
  }
  let m: UpdateManifest
  try {
    m = JSON.parse(o.m)
  } catch {
    return { ok: false, error: 'Phiếu cập nhật hỏng.' }
  }
  if (!m || m.v !== 1) return { ok: false, error: 'Phiếu cập nhật không đúng định dạng.' }
  if (m.platform !== ctx.platform || m.arch !== ctx.arch) return { ok: false, error: `Bản cập nhật dành cho ${m.platform}-${m.arch}, không phải máy này.` }
  if (!parseVersion(m.version) || !BUILD_RE.test(m.build || '')) return { ok: false, error: 'Phiên bản trong phiếu không hợp lệ.' }
  if (!safeFileName(m.file)) return { ok: false, error: 'Tên file cập nhật không hợp lệ.' }
  if (!Number.isFinite(m.size) || m.size < 1024 * 1024 || m.size > 4 * 1024 ** 3) return { ok: false, error: 'Dung lượng bản cập nhật không hợp lệ.' }
  if (!/^[A-Za-z0-9+/]{86}==$/.test(m.sha512 || '')) return { ok: false, error: 'Mã kiểm tra bản cập nhật không hợp lệ.' }
  if (!/^https?:\/\//.test(o.url)) return { ok: false, error: 'Link tải bản cập nhật không hợp lệ.' }
  if (!ctx.force && compareRelease(m.version, m.build, ctx.version, ctx.build) <= 0) {
    return { ok: false, error: 'Không có bản mới hơn.', notNewer: true }
  }
  return { ok: true, manifest: m }
}

/** SHA-512 (base64) cua file — doc dong, khong nap ca file vao RAM. */
export function sha512File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha512')
    createReadStream(path)
      .on('data', (d) => h.update(d))
      .on('error', reject)
      .on('end', () => resolve(h.digest('base64')))
  })
}

/** Tham so mo lai app sau cap nhat: giu tham so cu (vd --user-data-dir), bo -psn_ (macOS cu) + co cap nhat cu. */
export function relaunchArgs(argv: string[]): string[] {
  return argv.filter((a) => !/^-psn_/.test(a) && !a.startsWith('--agent-edit-updated=') && !a.startsWith('--agent-edit-update-failed='))
}

// ---------------------------------------------------------------------------
// SCRIPT THAY APP (chay TACH khoi app: app thoat roi script moi thay file)
// ---------------------------------------------------------------------------

/**
 * macOS — bash. Tham so: PID APP NEW BACKUP LOG MARKER FROMVER TOVER PROMPT [tham so mo lai app...]
 *  1. Cho app cu thoat (60s, qua han thi TERM roi KILL) + dung tien trinh con con chay tu trong goi app (sidecar...).
 *  2. Doi cho: APP -> BACKUP, NEW -> APP (loi giua chung -> tra APP cu ve). Thu muc khong ghi duoc (tai khoan thuong,
 *     app do quan tri vien cai) -> lam qua osascript "with administrator privileges" (hoi mat khau may 1 lan).
 *  3. Mo ban moi (`open -n`, kem co --agent-edit-updated=FROMVER), cho no ghi MARKER (main.ts ghi ngay khi khoi dong).
 *  4. 120s khong thay MARKER -> ban moi khong mo duoc -> TRA BAN CU ve + mo ban cu voi --agent-edit-update-failed=TOVER.
 * Chi ky tu ASCII trong script (chu tieng Viet di qua tham so PROMPT).
 */
export const MAC_APPLY_SH = `#!/bin/bash
PID="$1"; APP="$2"; NEW="$3"; BACKUP="$4"; LOG="$5"; MARKER="$6"; FROM="$7"; TO="$8"; PROMPT="$9"; shift 9
log() { echo "$(date '+%Y-%m-%dT%H:%M:%S') $*" >> "$LOG"; }
# so lan cho (moi lan 0.5s) — chi test dat bien moi truong de chay nhanh
EXIT_TRIES="\${AE_UPD_EXIT_TRIES:-120}"; MARKER_TRIES="\${AE_UPD_MARKER_TRIES:-240}"
log "bat dau: pid=$PID app=$APP new=$NEW from=$FROM to=$TO"

kill_bundle() {
  # moi tien trinh chay tu trong goi app (python sidecar, helper Electron, compositor...)
  local pre="$1/Contents/" pid cmd
  /bin/ps -axo pid=,command= | while read -r pid cmd; do
    case "$cmd" in "$pre"*) [ "$pid" != "$$" ] && echo "$pid";; esac
  done
}
stop_bundle() {
  local pids; pids=$(kill_bundle "$1")
  [ -z "$pids" ] && return 0
  log "dung tien trinh con: $(echo $pids)"
  kill -TERM $pids 2>/dev/null; sleep 2
  pids=$(kill_bundle "$1"); [ -n "$pids" ] && kill -KILL $pids 2>/dev/null
  return 0
}

i=0
while kill -0 "$PID" 2>/dev/null; do
  i=$((i+1)); [ $i -ge "$EXIT_TRIES" ] && break; sleep 0.5
done
if kill -0 "$PID" 2>/dev/null; then
  log "app cu chua thoat -> buoc dung"
  kill -TERM "$PID" 2>/dev/null; sleep 5; kill -KILL "$PID" 2>/dev/null; sleep 1
fi
stop_bundle "$APP"

ADMIN=0
can_write() { [ -w "$(dirname "$1")" ] && { [ ! -e "$1" ] || [ -w "$1" ]; }; }
can_write "$APP" || ADMIN=1

# move A->B, roi C->A; C->A loi thi B->A (khong bao gio de mat app)
swap() {
  local a="$1" b="$2" c="$3"
  if [ $ADMIN -eq 0 ]; then
    /bin/mv "$a" "$b" || return 1
    if ! /bin/mv "$c" "$a"; then /bin/mv "$b" "$a"; return 1; fi
    return 0
  fi
  /usr/bin/osascript - "$a" "$b" "$c" "$PROMPT" >> "$LOG" 2>&1 <<'OSA'
on run argv
  set a to quoted form of item 1 of argv
  set b to quoted form of item 2 of argv
  set c to quoted form of item 3 of argv
  do shell script "/bin/mv " & a & " " & b & " && { /bin/mv " & c & " " & a & " || { /bin/mv " & b & " " & a & "; exit 1; }; }" with prompt (item 4 of argv) with administrator privileges
end run
OSA
}

if [ ! -d "$NEW" ]; then
  log "LOI: khong thay ban moi $NEW -> mo lai ban cu"
  /usr/bin/open -n "$APP" --args "$@" "--agent-edit-update-failed=$TO"
  exit 1
fi
rm -rf "$BACKUP"
if ! swap "$APP" "$BACKUP" "$NEW"; then
  log "LOI: khong thay duoc app (admin=$ADMIN) -> mo lai ban cu"
  [ -d "$APP" ] && /usr/bin/open -n "$APP" --args "$@" "--agent-edit-update-failed=$TO"
  exit 1
fi
log "da thay app (admin=$ADMIN)"
/usr/bin/xattr -dr com.apple.quarantine "$APP" 2>/dev/null
# dang ky lai voi LaunchServices (Finder / Dock / open thay ngay phien ban moi)
LSREG=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
[ -x "$LSREG" ] && "$LSREG" -f "$APP" >/dev/null 2>&1

rm -f "$MARKER"
/usr/bin/open -n "$APP" --args "$@" "--agent-edit-updated=$FROM" >> "$LOG" 2>&1 || log "open ban moi bao loi $?"
i=0
while [ ! -f "$MARKER" ]; do
  i=$((i+1)); [ $i -ge "$MARKER_TRIES" ] && break; sleep 0.5
done
if [ -f "$MARKER" ]; then
  log "OK: ban moi da mo"
  rm -rf "$BACKUP" 2>/dev/null || log "khong xoa duoc ban cu $BACKUP"
  exit 0
fi

log "LOI: ban moi khong mo (khong thay dau khoi dong) -> quay lai ban cu"
stop_bundle "$APP"
FAILED="$BACKUP.failed"
rm -rf "$FAILED"
if swap "$APP" "$FAILED" "$BACKUP"; then
  log "da tra ban cu"
  rm -rf "$FAILED" 2>/dev/null
else
  log "LOI: khong tra duoc ban cu"
fi
/usr/bin/open -n "$APP" --args "$@" "--agent-edit-update-failed=$TO"
exit 1
`

/**
 * Windows — PowerShell 5.1 (luu UTF-8 CO BOM). Tham so ten: -AppPid -Setup -InstDir -Exe -Log -Marker -FromVer -ToVer
 * -ArgsB64 (JSON mang tham so mo lai, base64 UTF-8) -MsgB64 (cau bao loi tieng Viet, base64 UTF-8).
 *  1. Cho app cu thoat (60s, qua han buoc dung) + dung moi tien trinh chay tu thu muc cai (python sidecar, compositor).
 *  2. Chay bo cai NSIS im lang `/S --updated /D=<thu muc dang cai>` (cai cho rieng user, khong UAC), loi thi thu lai 1 lan.
 *  3. Mo app (co --agent-edit-updated=FROMVER, hoac --agent-edit-update-failed=TOVER neu bo cai bao loi), cho MARKER.
 *  4. Khong con app sau khi cai -> hop thoai bao loi + mo thu muc chua bo cai de cai tay.
 */
export const WIN_APPLY_PS1 = `param([int]$AppPid, [string]$Setup, [string]$InstDir, [string]$Exe, [string]$Log, [string]$Marker,
  [string]$FromVer, [string]$ToVer, [string]$ArgsB64, [string]$MsgB64)
$ErrorActionPreference = 'Continue'
function L([string]$m) { try { Add-Content -LiteralPath $Log -Value ((Get-Date -Format s) + ' ' + $m) -Encoding UTF8 } catch {} }
function Q([string]$a) { if ($a -match '[\\s"]') { '"' + ($a -replace '"', '\\"') + '"' } else { $a } }
L "bat dau: pid=$AppPid setup=$Setup dir=$InstDir from=$FromVer to=$ToVer"

$p = Get-Process -Id $AppPid -ErrorAction SilentlyContinue
if ($p) {
  if (-not $p.WaitForExit(60000)) {
    L 'app cu chua thoat sau 60s -> buoc dung'
    Stop-Process -Id $AppPid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }
}
$pre = $InstDir.TrimEnd('\\') + '\\'
function StopLeftovers {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($pre, [StringComparison]::OrdinalIgnoreCase) } |
    ForEach-Object { L ('dung tien trinh con ' + $_.Name + ' ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
StopLeftovers
Start-Sleep -Seconds 1

$code = -1
for ($i = 1; $i -le 2; $i++) {
  try {
    $proc = Start-Process -FilePath $Setup -ArgumentList ('/S --updated /D=' + $InstDir) -PassThru
    $null = $proc.Handle
    if (-not $proc.WaitForExit(900000)) { L 'bo cai chay qua 15 phut'; $code = -2 } else { $code = $proc.ExitCode }
  } catch { L ('khong chay duoc bo cai: ' + $_.Exception.Message); $code = -3 }
  L "bo cai lan $i -> ma $code"
  if ($code -eq 0) { break }
  StopLeftovers
  Start-Sleep -Seconds 5
}

# PS 5.1: ConvertFrom-Json tra CA mang thanh 1 doi tuong -> gan bien roi foreach (khong @() / ong dan)
$rel = $null
try { $rel = ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ArgsB64))) } catch {}
$parts = @()
foreach ($a in $rel) { $parts += (Q ([string]$a)) }
if (-not (Test-Path -LiteralPath $Exe)) {
  L 'LOI: khong thay app sau khi cai'
  try {
    Add-Type -AssemblyName PresentationFramework
    $msg = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($MsgB64))
    [System.Windows.MessageBox]::Show($msg, 'Agent Edit') | Out-Null
  } catch {}
  Start-Process -FilePath 'explorer.exe' -ArgumentList ('/select,' + (Q $Setup))
  exit 1
}
Remove-Item -LiteralPath $Marker -ErrorAction SilentlyContinue
$flag = if ($code -eq 0) { '--agent-edit-updated=' + $FromVer } else { '--agent-edit-update-failed=' + $ToVer }
$parts += $flag
$argLine = $parts -join ' '
Start-Process -FilePath $Exe -ArgumentList $argLine
for ($i = 0; $i -lt 240; $i++) { if (Test-Path -LiteralPath $Marker) { break }; Start-Sleep -Milliseconds 500 }
if (Test-Path -LiteralPath $Marker) {
  L 'OK: app da mo'
  if ($code -eq 0) { Remove-Item -LiteralPath $Setup -Force -ErrorAction SilentlyContinue }
  exit 0
}
L 'LOI: app khong mo sau 120s'
exit 1
`
