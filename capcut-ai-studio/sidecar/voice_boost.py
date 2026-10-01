#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GIONG NOI QUA NHO -> NANG LEN CHO NGHE RO (user 2026-10-01).

Video quay mic xa / dien thoai thu nho: giong nguoi noi nho (do that du an 'hoc sinh': -34 LUFS, chuan talking-head
~ -15) -> nguoi xem phai tang het am luong ma van nghe khong ro; SFX can theo giong thi cung nho theo. Giong DA chuan
-> khong dong vao.

  1 danh gia: do that (LUFS momentary, phan vi 90 cac khung CO TIENG — cung thuoc voi speech_cut.voice_level) tren
              cac cau noi cua tung video + y kien Gemini khi xem video nguon (source["giong_noi"]: muc_to / nghe_ro).
              Thieu >= QUIET_GAP dB so voi muc tieu -> nang; thieu SOFT_GAP..QUIET_GAP dB -> chi nang khi Gemini cung
              nghe thay nho / khong ro; con lai -> giu nguyen.
  2 muc nang: = muc thieu, toi da MAX_GAIN, va KHONG de dinh tieng (cuoi to, phu am bat) bi ep qua LIMIT_PUSH dB
              -> khong meo, khong choi; bo chan dinh (alimiter, -1 dBFS, khong tu tang muc) giu an toan.
  3 ap dung : ban lam viec "giong da nang" (hinh COPY nguyen, chi tieng ma hoa lai) thay cho video o MOI khau phat
              tieng (xem truoc + render). Do dac de CAT (speech_cut) van dung file goc (orig_path) -> diem cat khong
              doi; speech_cut.voice_level cong them muc nang -> SFX / meme can theo giong SAU khi nang.
Quyet dinh nam trong plan["voice_boost"] = {source_id: {...}}; build_spec ap dung moi lan dung (idempotent).
"""
import hashlib
import os
import shutil
import subprocess
import threading

CACHE_DIR = os.path.join(os.path.expanduser("~"), ".capcut-studio", "cache", "voice-boost")
VERSION = 1
TARGET_LUFS = -15.0    # muc giong muc tieu (LUFS momentary, phan vi 90 khung co tieng) — ro, khong to qua
QUIET_GAP = 6.0        # thieu >= 6 dB -> qua nho, chac chan nang
SOFT_GAP = 3.0         # thieu 3..6 dB -> chi nang khi Gemini cung nghe thay nho / khong ro
MAX_GAIN = 20.0        # nang toi da 20 dB (hon nua la khuech dai ca tieng on nen)
MIN_GAIN = 1.5         # nang it hon 1.5 dB khong ai nghe ra -> khong lam
PEAK_CEIL = -1.0       # dinh sau khi nang (dBFS) — bo chan dinh giu o day
LIMIT_PUSH = 6.0       # 1% khung to nhat chi duoc bi bo chan dinh ep toi da 6 dB (ep hon -> nghe meo / choi)
_GEMINI_QUIET = ("qua_nho", "hoi_nho", "nho")

_locks = {}
_guard = threading.Lock()


def _lock(key):
    with _guard:
        return _locks.setdefault(key, threading.Lock())


def _ff():
    import remotion_plan
    return remotion_plan._ffbin("ffmpeg")


# ---------------------------------------------------------------------------
# 1. DO + DANH GIA
# ---------------------------------------------------------------------------
def speech_ranges(rows):
    """Transcript (gio nguon) -> [(start, end)] cac cum CO LOI."""
    out = []
    for r in rows or []:
        if not isinstance(r, dict) or not str(r.get("text") or "").strip():
            continue
        try:
            a, b = float(r.get("start")), float(r.get("end"))
        except (TypeError, ValueError):
            continue
        if b > a:
            out.append((a, b))
    return out


def measure_level(path, ranges):
    """Muc to giong (LUFS M, phan vi 90 khung co tieng) trong cac cau noi — cung cach speech_cut.voice_level."""
    import numpy as np
    import speech_cut
    arr = speech_cut.loudness_series(path)
    if arr is None or not ranges:
        return None
    hop = speech_cut.LOUD_HOP
    vals = [arr[int((a + 0.3) / hop):int(b / hop) + 1] for a, b in ranges]
    vals = [v for v in vals if v.size]
    if not vals:
        return None
    x = np.concatenate(vals)
    x = x[x > -60]
    if x.size < 10:
        return None
    x = x[x >= float(np.percentile(x, 95)) - 20.0]
    return round(float(np.percentile(x, 90)), 1)


def peak_p99(path, ranges, block=0.1):
    """Dinh mau (dBFS, ca 2 kenh, 48 kHz) cua tung khoi 100ms trong cac cau noi -> phan vi 99. None neu loi."""
    import numpy as np
    if not path or not os.path.isfile(path) or not ranges:
        return None
    sr = 48000
    try:
        p = subprocess.Popen([_ff(), "-v", "error", "-i", path, "-vn", "-ac", "2", "-ar", str(sr), "-f", "f32le", "-"],
                             stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    except OSError:
        return None
    n = int(sr * block) * 2 * 4
    peaks, rest = [], b""
    while True:
        chunk = p.stdout.read(1 << 20)
        if not chunk:
            break
        buf = rest + chunk
        k = len(buf) // n * n
        if k:
            a = np.abs(np.frombuffer(buf[:k], dtype=np.float32)).reshape(-1, n // 4)
            peaks.append(a.max(axis=1))
        rest = buf[k:]
    p.wait()
    if not peaks:
        return None
    pk = np.concatenate(peaks)
    sel = np.zeros(pk.size, dtype=bool)
    for a, b in ranges:
        sel[max(0, int(a / block)):min(pk.size, int(b / block) + 1)] = True
    v = pk[sel]
    v = v[v > 1e-5]
    if v.size < 10:
        return None
    return round(float(20 * np.log10(np.percentile(v, 99))), 1)


def gemini_view(src):
    """Y kien Gemini ve giong noi (source['giong_noi']) -> {muc_to, nghe_ro, van_de} chuan hoa, hoac None."""
    g = (src or {}).get("giong_noi") if isinstance(src, dict) else None
    if not isinstance(g, dict):
        return None
    import unicodedata
    muc = unicodedata.normalize("NFD", str(g.get("muc_to") or "").strip().lower())
    muc = "".join(c for c in muc if unicodedata.category(c) != "Mn").replace("đ", "d").replace(" ", "_")
    nr = g.get("nghe_ro")
    if isinstance(nr, str):
        nr = nr.strip().lower() not in ("false", "khong", "không", "no", "0")
    out = {"muc_to": muc or None, "nghe_ro": nr if isinstance(nr, bool) else None,
           "van_de": str(g.get("van_de") or g.get("bang_chung") or "")[:200]}
    return out if (out["muc_to"] or out["nghe_ro"] is not None) else None


def decide_one(level, peak, gem):
    """(gain_db, ly_do). gain 0 = giu nguyen."""
    quiet_by_ear = bool(gem and (gem.get("muc_to") in _GEMINI_QUIET or gem.get("nghe_ro") is False))
    if level is None:
        if gem and gem.get("muc_to") in ("qua_nho",):
            return 6.0, "không đo được mức to; Gemini nghe giọng quá nhỏ -> nâng nhẹ 6 dB"
        return 0.0, "không đo được mức to giọng nói -> giữ nguyên"
    gap = TARGET_LUFS - level
    if gap < SOFT_GAP or (gap < QUIET_GAP and not quiet_by_ear):
        why = "giọng %.1f LUFS, đạt chuẩn (mục tiêu %.0f)" % (level, TARGET_LUFS)
        if gap >= SOFT_GAP:
            why += "; hơi nhỏ %.1f dB nhưng Gemini nghe vẫn rõ" % gap
        return 0.0, why + " -> giữ nguyên"
    gain = min(gap, MAX_GAIN)
    cap = None
    if peak is not None:
        cap = PEAK_CEIL + LIMIT_PUSH - peak
        gain = min(gain, cap)
    if gain < MIN_GAIN:
        return 0.0, ("giọng %.1f LUFS nhỏ nhưng đỉnh tiếng đã cao (%.1f dBFS) — nâng nữa sẽ méo -> giữ nguyên"
                     % (level, peak if peak is not None else 0))
    why = "giọng %.1f LUFS, nhỏ hơn chuẩn %.1f dB%s -> nâng %.1f dB" % (
        level, gap, " (Gemini: %s)" % (gem.get("van_de") or gem.get("muc_to")) if quiet_by_ear and gem else "", gain)
    if cap is not None and gain < min(gap, MAX_GAIN) - 0.05:
        why += " (giới hạn để đỉnh tiếng không bị ép quá %.0f dB)" % LIMIT_PUSH
    return round(gain, 1), why


def assess(sources, source_videos, transcript_data, log=None):
    """{source_id: {do_lufs, dinh_dbfs, gemini, gain_db, ly_do}} cho moi video nguon (do tren file GOC)."""
    by_src = {s.get("id"): s for s in sources or [] if isinstance(s, dict)}
    out = {}
    for sv in source_videos or []:
        if not isinstance(sv, dict) or not sv.get("id"):
            continue
        sid = sv["id"]
        path = sv.get("orig_path") or sv.get("path")
        rng = speech_ranges((transcript_data or {}).get(sid))
        try:
            level = measure_level(path, rng)
            peak = peak_p99(path, rng) if level is not None and TARGET_LUFS - level >= SOFT_GAP else None
        except Exception as ex:          # do loi khong duoc lam hong ke hoach
            level, peak = None, None
            if log:
                log("Đo giọng nói %s lỗi: %s" % (sid, str(ex)[:120]))
        gem = gemini_view(by_src.get(sid))
        gain, why = decide_one(level, peak, gem)
        out[sid] = {"do_lufs": level, "dinh_dbfs": peak, "gemini": gem, "gain_db": gain, "ly_do": why,
                    "muc_tieu": TARGET_LUFS}
    return out


def gain_of(plan, sid):
    vb = plan.get("voice_boost") if isinstance(plan.get("voice_boost"), dict) else {}
    try:
        return float((vb.get(sid) or {}).get("gain_db") or 0.0)
    except (TypeError, ValueError):
        return 0.0


# ---------------------------------------------------------------------------
# 2. BAN LAM VIEC "GIONG DA NANG"
# ---------------------------------------------------------------------------
def _key(path, gain):
    st = os.stat(path)
    raw = "%s|%d|%d|%.1f|v%d" % (os.path.abspath(path), st.st_size, st.st_mtime_ns, gain, VERSION)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:20]


def boosted_path(path, gain, log=None, timeout=900):
    """Ban sao: hinh COPY nguyen, tieng = nang `gain` dB + chan dinh -1 dBFS (khong tu tang muc, bu tre). Loi -> None."""
    if not path or not os.path.isfile(path) or gain < MIN_GAIN:
        return None
    os.makedirs(CACHE_DIR, exist_ok=True)
    ext = os.path.splitext(path)[1].lower() if os.path.splitext(path)[1].lower() in (".mp4", ".mov", ".m4v") else ".mp4"
    out = os.path.join(CACHE_DIR, _key(path, gain) + ext)
    if os.path.isfile(out):
        return out
    with _lock(out):
        if os.path.isfile(out):
            return out
        tmp = out + ".tmp" + ext
        limit = 10 ** (PEAK_CEIL / 20.0)
        filters = ("volume=%.2fdB,alimiter=limit=%.4f:level=false:latency=true:attack=5:release=80" % (gain, limit),
                   # ffmpeg khong co alimiter / latency: chi nang (muc nang da chan theo dinh o decide_one)
                   "volume=%.2fdB" % gain)
        err = None
        for af in filters:
            if log:
                log("Nâng giọng nói +%.1f dB: %s" % (gain, os.path.basename(path)))
            r = subprocess.run([_ff(), "-v", "error", "-y", "-i", path, "-map", "0:v:0", "-map", "0:a:0",
                                "-c:v", "copy", "-af", af, "-c:a", "aac", "-b:a", "256k",
                                "-movflags", "+faststart", tmp], capture_output=True, text=True, timeout=timeout)
            if r.returncode == 0 and os.path.isfile(tmp) and os.path.getsize(tmp) > 0:
                shutil.move(tmp, out)
                return out
            err = (r.stderr or "").strip()[-300:]
            try:
                os.remove(tmp)
            except OSError:
                pass
        if log:
            log("Không tạo được bản nâng giọng (%s) — giữ tiếng gốc" % err)
        return None


def apply(plan, changes=None, log=None):
    """plan['source_videos'] (DA qua media_sdr.working_sources) -> path = ban giong da nang khi plan quyet dinh nang.
    Idempotent: ghi orig_path (file goc) de lan dung sau media_sdr / speech_cut van ve file goc."""
    import media_sdr
    out = []
    for sv in plan.get("source_videos") or []:
        if not isinstance(sv, dict) or not sv.get("id"):
            out.append(sv)
            continue
        g = gain_of(plan, sv["id"])
        sv = dict(sv)
        sv.pop("voice_gain_db", None)
        if g >= MIN_GAIN:
            orig = sv.get("orig_path") or sv.get("path")
            base = media_sdr.working_path(orig, log=log) if orig and os.path.isfile(orig) else sv.get("path")
            bp = boosted_path(base, g, log=log)
            if bp:
                sv["orig_path"] = orig
                sv["path"] = bp
                sv["voice_gain_db"] = g
                if changes is not None:
                    changes.append("%s: giọng nói nhỏ -> nâng %.1f dB (bản làm việc, hình giữ nguyên)" % (sv["id"], g))
            elif changes is not None:
                changes.append("%s: không tạo được bản nâng giọng -> giữ tiếng gốc" % sv["id"])
        out.append(sv)
    plan["source_videos"] = out
    if out and isinstance(out[0], dict) and out[0].get("path"):
        plan["source_video"] = out[0]["path"]
    return plan


# ---------------------------------------------------------------------------
# 3. GEMINI — luat noi vao prompt "Hieu video nguon" (ke ca khi user da sua prompt)
# ---------------------------------------------------------------------------
GEMINI_NOTE = """

# BO SUNG BAT BUOC (he thong): DANH GIA GIONG NOI cua TUNG video
Them vao MOI muc trong "sources" truong:
"giong_noi": {"muc_to": "qua_nho|hoi_nho|vua|qua_to", "nghe_ro": true/false,
              "van_de": "cu the: mic xa / bi tieng on lan / lui dan cuoi cau / ro rang...",
              "bang_chung": "doan nao (giay) nghe thay van de"}
Danh gia theo cam nhan nguoi xem dien thoai o am luong binh thuong: phai tang to moi nghe duoc = qua_nho;
nghe duoc nhung phai chu y = hoi_nho; ro, thoai mai = vua. Video khong co loi noi -> "giong_noi": null.
"""
