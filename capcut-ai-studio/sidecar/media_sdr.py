#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BAN LAM VIEC SDR cho video HDR (iPhone quay HDR: HEVC 10-bit, BT.2020, HLG + Dolby Vision).

Vi sao (do that 2026-09-26 tren IMG_3839.MOV):
  - Moi cho doc video bang ffmpeg ma KHONG chuyen HDR -> SDR (tach nguoi, anh chup tu nguon, anh thu
    nho, ban nen gui Gemini) ra khung hinh SANG hon ban chuan cua Apple ~27 muc (0-255) va nhat mau
    -> nguoi trong lop tach nen trong bac/chay sang, lech mau voi video nen.
  - Trinh xem truoc (Chrome) phat thang HLG va ap CSS filter (grade) len video HDR -> chay sang;
    render (Remotion toneMapped) lai ra mau khac -> xem truoc != ban xuat.
Cach sua: video HDR duoc chuyen 1 LAN sang ban SDR BT.709 (cache), MOI khau dung chung ban nay.

Chuyen bang `avconvert` (AVFoundation — dung cach Apple chuyen trong Anh/QuickTime, co ca Dolby
Vision; phan cung, IMG_3839 2 phut = 20s, H.264 ~10 Mbps, giu tieng, giu do dai). Khong co / loi ->
ffmpeg zscale + tonemap hable (npl=203): gan Apple nhat trong cac phuong an ffmpeg da thu (chenh
sang +6 so voi +27 khi khong chuyen).

Video SDR (da so) -> tra nguyen duong dan, khong ton gi. Ham idempotent: dua ban lam viec vao lai
van ra chinh no.
"""
import hashlib
import json
import os
import shutil
import subprocess
import threading
import time

import remotion_plan  # _ffbin

CACHE_DIR = os.path.join(os.path.expanduser("~"), ".capcut-studio", "cache", "media-sdr")
VERSION = 1
KEEP_DAYS = 60                     # ban lam viec khong dung toi qua 60 ngay -> xoa (dung lai thi tao lai)
HDR_TRANSFERS = ("arib-std-b67", "smpte2084")   # HLG, PQ
AVCONVERT = "/usr/bin/avconvert"
AVCONVERT_PRESET = "Preset1920x1080"            # H.264 SDR BT.709, khung toi da 1920x1080 (doc: 1080x1920)
FFMPEG_TONEMAP = ("zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable,"
                  "zscale=t=bt709:m=bt709:r=tv,format=yuv420p")

_locks = {}
_guard = threading.Lock()
_probe_cache = {}


def _lock(key):
    with _guard:
        return _locks.setdefault(key, threading.Lock())


def _src_key(path):
    st = os.stat(path)
    raw = "%s|%d|%d|v%d" % (os.path.abspath(path), st.st_size, st.st_mtime_ns, VERSION)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:20]


def color_info(path):
    """{transfer, primaries, pix_fmt, codec} cua luong hinh dau (cache theo file)."""
    try:
        st = os.stat(path)
    except OSError:
        return {}
    ck = (os.path.abspath(path), st.st_size, st.st_mtime_ns)
    if ck in _probe_cache:
        return _probe_cache[ck]
    out = {}
    try:
        r = subprocess.run([remotion_plan._ffbin("ffprobe"), "-v", "error", "-select_streams", "v:0",
                            "-show_entries", "stream=codec_name,pix_fmt,color_transfer,color_primaries",
                            "-of", "json", path], capture_output=True, text=True, timeout=60)
        s = (json.loads(r.stdout or "{}").get("streams") or [{}])[0]
        out = {"transfer": s.get("color_transfer") or "", "primaries": s.get("color_primaries") or "",
               "pix_fmt": s.get("pix_fmt") or "", "codec": s.get("codec_name") or ""}
    except Exception:
        out = {}
    _probe_cache[ck] = out
    return out


def is_hdr(path):
    return (color_info(path).get("transfer") or "") in HDR_TRANSFERS


def is_working_copy(path):
    try:
        nc = os.path.normcase       # Windows: khong phan biet hoa thuong, / va \\
        return nc(os.path.abspath(path)).startswith(nc(os.path.abspath(CACHE_DIR)) + os.sep)
    except (TypeError, ValueError):
        return False


USED_SUFFIX = ".used"     # file danh dau "con dung" (gio sua = lan dung cuoi)


def _last_used(p):
    t = os.path.getmtime(p)
    try:
        t = max(t, os.path.getmtime(p + USED_SUFFIX))
    except OSError:
        pass
    return t


def _prune():
    cutoff = time.time() - KEEP_DAYS * 86400
    try:
        for n in os.listdir(CACHE_DIR):
            p = os.path.join(CACHE_DIR, n)
            if n.endswith(USED_SUFFIX):
                if not os.path.exists(p[:-len(USED_SUFFIX)]):
                    _rm(p)
                continue
            try:
                if os.path.isfile(p) and _last_used(p) < cutoff:
                    os.remove(p)              # Windows: file dang mo (xem truoc / render) -> bo qua file do
                    _rm(p + USED_SUFFIX)
            except OSError:
                continue
    except OSError:
        pass


def _mark_used(out):
    """Danh dau ban lam viec con dung (khong bi don) bang file rieng. KHONG cham gio sua cua chinh
    video: tach nguoi / nhan mat / ban nen Gemini lay khoa cache theo gio sua file -> cham vao la moi
    lan dung lai tao lai tu dau (do that: dung lai spec mat ~100s vi tach nguoi lai)."""
    try:
        with open(out + USED_SUFFIX, "a"):
            pass
        os.utime(out + USED_SUFFIX, None)
    except OSError:
        pass


def _rm(p):
    try:
        os.remove(p)
    except OSError:
        pass


def _valid(p, src_dur):
    """File ra co hinh, do dai khop nguon (lech <= 0.5s) va THAT SU la SDR moi dung.
    (Do that: avconvert gap H.264 8-bit gan nhan HLG thi 'thanh cong' nhung giu nguyen HLG.)"""
    if not os.path.isfile(p) or os.path.getsize(p) < 1000:
        return False
    info = remotion_plan.probe(p)
    d = info.get("duration") or 0
    return bool(info.get("width")) and (not src_dur or abs(d - src_dur) <= 0.5) and not is_hdr(p)


def _via_avconvert(src, tmp, timeout):
    if not os.path.isfile(AVCONVERT):
        return "khong co avconvert"
    r = subprocess.run([AVCONVERT, "--source", src, "--output", tmp, "--preset", AVCONVERT_PRESET, "--replace"],
                       capture_output=True, text=True, timeout=timeout)
    return None if r.returncode == 0 else ("avconvert loi: %s" % (r.stderr or r.stdout or "").strip()[-300:])


def _via_ffmpeg(src, tmp, timeout):
    r = subprocess.run([remotion_plan._ffbin("ffmpeg"), "-v", "error", "-y", "-i", src,
                        "-map", "0:v:0", "-map", "0:a:0?", "-vf", FFMPEG_TONEMAP,
                        "-c:v", "libx264", "-preset", "fast", "-crf", "17", "-pix_fmt", "yuv420p",
                        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
                        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", tmp],
                       capture_output=True, text=True, timeout=timeout)
    return None if r.returncode == 0 else ("ffmpeg loi: %s" % (r.stderr or "").strip()[-300:])


def working_path(path, log=None):
    """Duong dan video de DUNG trong app: video HDR -> ban SDR (tao 1 lan, cache); con lai -> nguyen ban.
    Loi chuyen doi -> tra lai file goc (hanh vi cu) va ghi log, khong lam hong luong chinh."""
    if not path or not os.path.isfile(path) or is_working_copy(path) or not is_hdr(path):
        return path
    os.makedirs(CACHE_DIR, exist_ok=True)
    key = _src_key(path)
    # khong co avconvert (Windows) -> chi ffmpeg ra MP4: dat dung duoi .mp4 (trinh duyet nhan dung loai video)
    out = os.path.join(CACHE_DIR, key + (".mov" if os.path.isfile(AVCONVERT) else ".mp4"))
    with _lock(key):
        if os.path.isfile(out) and os.path.getsize(out) > 1000:
            _mark_used(out)               # con dung -> khong bi don
            return out
        _prune()
        src_dur = remotion_plan.probe(path).get("duration") or 0
        timeout = max(600, int(src_dur * 4))
        if log:
            log("Video HDR (%s) -> tạo bản làm việc SDR để màu đúng như trên iPhone…" % os.path.basename(path))
        t0 = time.time()
        errs = []
        for name, fn, ext in (("avconvert", _via_avconvert, ".mov"), ("ffmpeg", _via_ffmpeg, ".mp4")):
            tmp = out + ".part" + ext
            _rm(tmp)
            try:
                e = fn(path, tmp, timeout)
            except (OSError, subprocess.TimeoutExpired) as ex:
                e = "%s: %s" % (name, ex)
            if e is None and _valid(tmp, src_dur):
                os.replace(tmp, out)
                _mark_used(out)
                if log:
                    log("Bản làm việc SDR xong bằng %s (%.0fs)" % (name, time.time() - t0))
                return out
            _rm(tmp)
            errs.append(e or "%s: file ra khong hop le" % name)
        if log:
            log("Không tạo được bản SDR (%s) — dùng file gốc." % "; ".join(errs)[:300])
        return path


def sdr_vf(path):
    """Bo loc ffmpeg chuyen HDR->SDR de dat TRUOC cac bo loc khac khi chi can 1-2 khung (anh thu nho):
    "" voi video SDR. (Khung nhieu / video -> dung working_path.)"""
    return (FFMPEG_TONEMAP + ",") if is_hdr(path) else ""


def working_sources(source_videos, log=None):
    """Ban sao danh sach source_videos voi `path` = ban lam viec, `orig_path` = file goc.
    Idempotent: da co orig_path thi tinh lai tu file goc (ban lam viec bi don -> tao lai)."""
    out = []
    for sv in source_videos or []:
        if not isinstance(sv, dict):
            out.append(sv)
            continue
        sv = dict(sv)
        orig = sv.get("orig_path") or sv.get("path")
        if orig and os.path.isfile(orig):
            wp = working_path(orig, log=log)
            if wp != orig:
                sv["orig_path"] = orig
                sv["path"] = wp
            else:
                # video SDR: ve LAI file goc — ban lam viec cu (ban net theo khung cu, ban nang giong) khong duoc dinh lai;
                # cac khau sau (voice_boost, media_sharp) tu tinh lai tu day
                sv["path"] = orig
                sv.pop("orig_path", None)
        out.append(sv)
    return out


def clear():
    shutil.rmtree(CACHE_DIR, ignore_errors=True)
