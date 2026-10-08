#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BAN LAM VIEC NET cho video nguon NHO hon khung xuat (user 2026-10-08: "video edit xong mo hon video goc").

Do that 2026-10-08 (480x854 -> khung 1080x1920, cung 1 khung hinh, nang luong canh sau loc FIND_EDGES):
  - Render + nen KHONG lam mo: clip full khung, khong zoom -> VMAF 99.9 so voi goc (6 cau hinh nen deu ~99.9).
  - Mo la do PHONG TO trong Chrome (noi suy kieu song tuyen): goc phong lanczos 3.88 -> render 3.28 (-15%);
    them zoom 1.25 (zoom o diem cat / hieu ung, 42-69% thoi luong video) -> 2.53 (-35%).
  - Phong san bang ffmpeg lanczos + lam net nhe roi moi render: 4.88 (zoom 1.0) / 3.13 (zoom 1.25).
Cach lam: video nguon can phong to > NGUONG de phu khung -> tao 1 LAN ban lanczos (+ du phong zoom ZOOM_ROOM de
Chrome thu nho thay vi phong to khi zoom) + unsharp nhe, x264 chat luong cao, GIU NGUYEN tieng + moc khung
(-fps_mode passthrough). Video du lon / video ngang trong khung doc (giu tron khung, thu nho) -> dung nguyen ban.

Ban nay nam chung thu muc cache voi ban SDR (media_sdr.CACHE_DIR): cung co che don (60 ngay khong dung), cung duoc
UI coi la ban lam viec (khoi phuc video nguon mat), media_sdr.working_path(ban_net) tra lai chinh no.
"""
import hashlib
import os
import subprocess
import time

import media_sdr
import remotion_plan

VERSION = 1
MIN_UPSCALE = 1.05          # phong < 5% -> Chrome phong cung khong mo thay duoc, khong ton cong tao ban
ZOOM_ROOM = 1.15            # du phong cho zoom o diem cat / hieu ung (zoom <= 1.15 thanh thu nho thay vi phong to)
MAX_SIDE = 2560             # tran canh dai (giai ma + chup khung luc render ton theo so diem anh)
SHARPEN = 0.35              # unsharp luma (0.6 do that la qua tay: net hon ca goc, vien chu bi gat)
SHARP_SUFFIX = "_sharp.mp4"


def _fit_scale(w, h, W, H):
    """He so phong de clip PHU khung (cover) hoac nam tron khung (blur) — dung luat _fit_for cua remotion_plan."""
    if remotion_plan._fit_for(w, h, W, H) == "cover":
        return max(W / float(w), H / float(h))
    return min(W / float(w), H / float(h))


def target_size(w, h, W, H):
    """(rong, cao) cua ban net, hoac None neu khong can (video du lon / chi bi thu nho)."""
    if not w or not h:
        return None
    k = _fit_scale(w, h, W, H)
    if k <= MIN_UPSCALE:
        return None
    f = min(k * ZOOM_ROOM, MAX_SIDE / float(max(w, h)))
    if f <= MIN_UPSCALE:
        return None
    return int(round(w * f / 2)) * 2, int(round(h * f / 2)) * 2


def _key(path, tw, th):
    st = os.stat(path)
    raw = "%s|%d|%d|%dx%d|%.2f|v%d" % (os.path.abspath(path), st.st_size, st.st_mtime_ns, tw, th, SHARPEN, VERSION)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:20]


def _valid(p, src_dur, tw, th):
    if not os.path.isfile(p) or os.path.getsize(p) < 1000:
        return False
    info = remotion_plan.probe(p)
    d = info.get("duration") or 0
    return info.get("width") == tw and info.get("height") == th and (not src_dur or abs(d - src_dur) <= 0.15)


def sharp_path(path, W, H, log=None):
    """Duong dan video de RENDER: nho hon khung -> ban lanczos + lam net (tao 1 lan, cache); con lai -> nguyen ban.
    Loi -> tra file vao (hanh vi cu) + ghi log, khong lam hong luong chinh."""
    if not path or not os.path.isfile(path) or path.endswith(SHARP_SUFFIX):
        return path
    info = remotion_plan.probe(path)
    size = target_size(info.get("width"), info.get("height"), W, H)
    if not size:
        return path
    tw, th = size
    os.makedirs(media_sdr.CACHE_DIR, exist_ok=True)
    key = _key(path, tw, th)
    out = os.path.join(media_sdr.CACHE_DIR, key + SHARP_SUFFIX)
    with media_sdr._lock("sharp|" + key):
        if os.path.isfile(out) and os.path.getsize(out) > 1000:
            media_sdr._mark_used(out)
            return out
        src_dur = info.get("duration") or 0
        if log:
            log("Video nhỏ hơn khung (%dx%d) -> tạo bản làm việc nét %dx%d để video xuất không bị mờ (chỉ làm 1 lần)…"
                % (info["width"], info["height"], tw, th))
        t0 = time.time()
        tmp = out + ".part.mp4"
        media_sdr._rm(tmp)
        err = None
        try:
            r = subprocess.run([remotion_plan._ffbin("ffmpeg"), "-v", "error", "-y", "-i", path,
                                "-map", "0:v:0", "-map", "0:a:0?",
                                "-vf", "scale=%d:%d:flags=lanczos+accurate_rnd+full_chroma_int,unsharp=5:5:%.2f:5:5:0"
                                % (tw, th, SHARPEN),
                                "-fps_mode", "passthrough",
                                "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-g", "60",
                                "-pix_fmt", "yuv420p",
                                "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
                                "-c:a", "copy", "-movflags", "+faststart", tmp],
                               capture_output=True, text=True, timeout=max(600, int(src_dur * 6)))
            if r.returncode != 0:
                err = (r.stderr or "").strip()[-300:]
        except (OSError, subprocess.TimeoutExpired) as ex:
            err = str(ex)
        if err is None and _valid(tmp, src_dur, tw, th):
            os.replace(tmp, out)
            media_sdr._mark_used(out)
            if log:
                log("Bản làm việc nét xong (%.0fs)" % (time.time() - t0))
            return out
        media_sdr._rm(tmp)
        if log:
            log("Không tạo được bản làm việc nét (%s) — render từ file gốc." % (err or "file ra không hợp lệ")[:300])
        return path


def apply(plan, W, H, changes=None, log=None):
    """plan['source_videos'] (DA qua media_sdr + voice_boost) -> path = ban net khi video nho hon khung.
    Giu orig_path (file goc) de lan dung sau media_sdr / do dac van ve file goc -> idempotent."""
    out = []
    for sv in plan.get("source_videos") or []:
        if not isinstance(sv, dict) or not sv.get("path"):
            out.append(sv)
            continue
        sv = dict(sv)
        cur = sv["path"]
        sp = sharp_path(cur, W, H, log=log)
        if sp != cur:
            sv.setdefault("orig_path", cur)
            sv["path"] = sp
            if changes is not None:
                info = remotion_plan.probe(cur)
                changes.append("%s: video %sx%s nhỏ hơn khung %dx%d -> render từ bản phóng lanczos + làm nét (đỡ mờ)"
                               % (sv.get("id"), info.get("width"), info.get("height"), W, H))
        out.append(sv)
    plan["source_videos"] = out
    if out and isinstance(out[0], dict) and out[0].get("path"):
        plan["source_video"] = out[0]["path"]
