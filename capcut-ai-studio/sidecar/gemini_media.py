#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CHUAN BI VIDEO CHO GEMINI: nen 720p (co cache) + cat theo DUNG LUONG khi van qua gioi han,
va GHEP ket qua phan tich cac phan lai (phan co hoc, khong dung AI).

Vi sao nen:
  Gui nguyen file goc (vd IMG_3839.MOV 138 MB HEVC 1080p) = 1 request base64 ~184 MB -> proxy
  timeout / 502; Gemini CLI tu choi moi file > 20 MiB. Gemini chi lay ~1 khung hinh/giay va tu
  thu nho khung, nen 720p gan nhu khong mat thong tin (da so: net mat, cu chi van ro). Giu tieng
  (AAC mono 64k) de Gemini van nghe duoc giong dieu. Do that: 138 MB -> 10 MB, nen ~15-20s.

Vi sao cat THEO DUNG LUONG (yeu cau cua user 2026-09-26, khong cat theo thoi gian):
  Gioi han la so byte gui di, con so byte moi giay thay doi theo noi dung (canh tinh vs canh
  dong). Diem cat tinh tu tong byte cac goi tin (ffprobe), roi LUI ve khoang im lang gan nhat de
  khong cat giua cau. Phan sau bat dau tu keyframe truoc diem cat ~OVERLAP_SEC giay (chong lan),
  cat bang stream copy -> khong nen lai, moc gio chinh xac tuyet doi.

Ghep (merge_*): cong gio bat dau cua phan vao moi moc gio; o doan chong lan, lay muc cua phan
nao co moc nam o NUA cua no (ranh = giua doan chong lan) -> khong trung, khong sot.
"""
import os
import re
import json
import time
import hashlib
import threading
import subprocess

import remotion_plan  # _ffbin: tim ffmpeg/ffprobe nhu cac module khac

CACHE_DIR = os.path.join(os.path.expanduser("~"), ".capcut-studio", "cache", "gemini-media")
PREP_VERSION = 1
# "20 MB" nhu Finder hien thi (he thap phan). Gemini CLI chan file > 20 MiB (= 20.97 MB),
# nen moc nay con du ~1 MB an toan. Ap dung cho MOI cach ket noi Gemini (API / proxy / CLI).
PIECE_LIMIT_BYTES = 20 * 1000 * 1000
# Muc tieu byte goi tin moi phan: chua cho header/moov cua file mp4 (~vai tram KB)
PACKET_TARGET_RATIO = 0.95
OVERLAP_SEC = 5.0
# Tim khoang im lang trong cua so cuoi phan: toi da 20s, khong qua 25% do dai phan
SILENCE_WINDOW_MAX = 20.0
SILENCE_WINDOW_RATIO = 0.25
MAX_SHORT_SIDE = 720
MAX_FPS = 30.0
CACHE_KEEP_DAYS = 7

_locks = {}
_locks_guard = threading.Lock()


def _lock_for(key):
    with _locks_guard:
        if key not in _locks:
            _locks[key] = threading.Lock()
        return _locks[key]


def _run(argv, timeout):
    return subprocess.run(argv, capture_output=True, text=True, timeout=timeout)


# ----------------------------------------------------------------------------
# Do video
# ----------------------------------------------------------------------------
def probe(path):
    """{duration, fps, has_video, has_audio, bytes}."""
    out = {"duration": None, "fps": None, "has_video": False, "has_audio": False,
           "bytes": os.path.getsize(path)}
    try:
        r = _run([remotion_plan._ffbin("ffprobe"), "-v", "error", "-show_entries",
                  "format=duration:stream=codec_type,avg_frame_rate,r_frame_rate", "-of", "json", path],
                 timeout=60)
        j = json.loads(r.stdout or "{}")
    except Exception:
        return out
    try:
        out["duration"] = float((j.get("format") or {}).get("duration") or 0) or None
    except (TypeError, ValueError):
        pass
    for s in j.get("streams") or []:
        if s.get("codec_type") == "audio":
            out["has_audio"] = True
        elif s.get("codec_type") == "video" and not out["has_video"]:
            out["has_video"] = True
            for k in ("avg_frame_rate", "r_frame_rate"):
                fr = s.get(k) or ""
                try:
                    num, den = fr.split("/") if "/" in fr else (fr, "1")
                    v = float(num) / float(den)
                    if v > 0:
                        out["fps"] = v
                        break
                except (ValueError, ZeroDivisionError):
                    continue
    return out


def _mb(n):
    return "%.1f MB" % (n / 1e6)


def fmt_time(sec):
    sec = max(0, int(round(sec or 0)))
    return "%d:%02d" % (sec // 60, sec % 60)


# ----------------------------------------------------------------------------
# Nen 720p (cache)
# ----------------------------------------------------------------------------
def _source_key(path):
    st = os.stat(path)
    raw = "%s|%d|%d|v%d" % (os.path.abspath(path), st.st_size, st.st_mtime_ns, PREP_VERSION)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:20]


def _prune_cache():
    """Xoa ban nen/phan cat khong dung toi qua CACHE_KEEP_DAYS ngay (dung lai thi duoc 'cham' moi)."""
    cutoff = time.time() - CACHE_KEEP_DAYS * 86400
    try:
        for name in os.listdir(CACHE_DIR):
            p = os.path.join(CACHE_DIR, name)
            if os.path.isfile(p) and os.path.getmtime(p) < cutoff:
                os.remove(p)
    except OSError:
        pass


def _touch(p):
    try:
        os.utime(p, None)
    except OSError:
        pass


def compress(path, log=None):
    """Nen video ve 720p (canh ngan), H.264 CRF 28, AAC mono 64k. Cache theo file goc.

    Tra {"path", "bytes", "src_bytes", "duration", "cached", "seconds"}. Nem RuntimeError neu
    ffmpeg hong (noi goi quyet dinh co gui file goc thay the hay khong).
    """
    os.makedirs(CACHE_DIR, exist_ok=True)
    key = _source_key(path)
    out = os.path.join(CACHE_DIR, key + ".mp4")
    src_bytes = os.path.getsize(path)
    with _lock_for(key):
        if os.path.isfile(out) and os.path.getsize(out) > 0:
            _touch(out)
            info = probe(out)
            return {"path": out, "bytes": os.path.getsize(out), "src_bytes": src_bytes,
                    "duration": info["duration"], "cached": True, "seconds": 0.0}
        _prune_cache()
        src = probe(path)
        # Chi THU NHO (khong phong to): canh ngan <= 720, giu ti le, kich thuoc chan cho yuv420p.
        # Dat trong nhay don vi dau phay trong bieu thuc la cu phap cua ffmpeg (khong phai shell).
        vf = ("scale='if(gt(iw,ih),-2,trunc(min(%d,iw)/2)*2)':'if(gt(iw,ih),trunc(min(%d,ih)/2)*2,-2)'"
              % (MAX_SHORT_SIDE, MAX_SHORT_SIDE))
        if (src.get("fps") or 0) > MAX_FPS + 0.5:
            vf += ",fps=%d" % int(MAX_FPS)
        tmp = out + ".part.mp4"
        argv = [remotion_plan._ffbin("ffmpeg"), "-v", "error", "-y", "-i", path,
                "-map", "0:v:0?", "-map", "0:a:0?",
                "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "64k", "-ac", "1",
                "-map_metadata", "-1", "-movflags", "+faststart", tmp]
        if log:
            log("Nén video cho Gemini (720p): %s…" % os.path.basename(path))
        t0 = time.time()
        timeout = max(600, int((src.get("duration") or 300) * 3))
        try:
            r = _run(argv, timeout=timeout)
        except subprocess.TimeoutExpired:
            _rm(tmp)
            raise RuntimeError("Nén video quá %ds: %s" % (timeout, os.path.basename(path)))
        except OSError as e:
            raise RuntimeError("Không chạy được ffmpeg để nén video: %s" % e)
        if r.returncode != 0 or not os.path.isfile(tmp) or os.path.getsize(tmp) == 0:
            _rm(tmp)
            raise RuntimeError("ffmpeg nén video lỗi (%s): %s"
                               % (os.path.basename(path), (r.stderr or "").strip()[-400:]))
        os.replace(tmp, out)
        info = probe(out)
        return {"path": out, "bytes": os.path.getsize(out), "src_bytes": src_bytes,
                "duration": info["duration"] or src.get("duration"), "cached": False,
                "seconds": round(time.time() - t0, 1)}


def _rm(p):
    try:
        os.remove(p)
    except OSError:
        pass


# ----------------------------------------------------------------------------
# Cat theo dung luong
# ----------------------------------------------------------------------------
def packets(path):
    """Goi tin cua file: ([(t, bytes)] sap theo t, [keyframe_t...], duration)."""
    r = _run([remotion_plan._ffbin("ffprobe"), "-v", "error",
              "-show_entries", "stream=index,codec_type:packet=stream_index,pts_time,dts_time,size,flags",
              "-of", "json", path], timeout=300)
    j = json.loads(r.stdout or "{}")
    kinds = {s.get("index"): s.get("codec_type") for s in j.get("streams") or []}
    pk, keys = [], []
    for p in j.get("packets") or []:
        t = p.get("pts_time")
        if t in (None, "N/A"):
            t = p.get("dts_time")
        try:
            t = float(t)
            size = int(p.get("size") or 0)
        except (TypeError, ValueError):
            continue
        pk.append((t, size))
        if kinds.get(p.get("stream_index")) == "video" and "K" in (p.get("flags") or ""):
            keys.append(t)
    pk.sort()
    keys = sorted(set(k for k in keys if k >= 0))
    dur = probe(path).get("duration") or (pk[-1][0] if pk else 0.0)
    return pk, keys, dur


def silences(path, noise_db=-35, min_sec=0.35):
    """Cac khoang im lang [(start, end)] (ffmpeg silencedetect). Loi -> []."""
    try:
        r = _run([remotion_plan._ffbin("ffmpeg"), "-v", "info", "-nostats", "-i", path, "-vn",
                  "-af", "silencedetect=noise=%ddB:d=%s" % (noise_db, min_sec), "-f", "null", "-"],
                 timeout=600)
    except Exception:
        return []
    out, cur = [], None
    for line in (r.stderr or "").splitlines():
        m = re.search(r"silence_start:\s*(-?[\d.]+)", line)
        if m:
            cur = max(0.0, float(m.group(1)))
            continue
        m = re.search(r"silence_end:\s*([\d.]+)", line)
        if m and cur is not None:
            out.append((cur, float(m.group(1))))
            cur = None
    return out


def plan_cuts(pk, keys, duration, sil, target_bytes, overlap=OVERLAP_SEC):
    """Chia [0, duration] thanh cac phan sao cho tong byte goi tin moi phan <= target_bytes.

    Ham THUAN (khong cham file) de test duoc. pk = [(t, bytes)] da sap; keys = moc keyframe;
    sil = khoang im lang. Tra [(start, end)]. start luon la 1 keyframe (cat stream copy duoc).
    """
    if not pk:
        return [(0.0, duration)]
    times = [t for t, _ in pk]
    cum, acc = [], 0
    for _, b in pk:
        acc += b
        cum.append(acc)

    def bytes_before(t):
        # tong byte cac goi co moc < t
        lo, hi = 0, len(times)
        while lo < hi:
            mid = (lo + hi) // 2
            if times[mid] < t:
                lo = mid + 1
            else:
                hi = mid
        return cum[lo - 1] if lo > 0 else 0

    def time_at_bytes(limit_abs):
        # moc t lon nhat ma bytes_before(t) <= limit_abs  (= moc cua goi dau tien lam vuot)
        lo, hi = 0, len(cum)
        while lo < hi:
            mid = (lo + hi) // 2
            if cum[mid] <= limit_abs:
                lo = mid + 1
            else:
                hi = mid
        return times[lo] if lo < len(times) else duration

    def key_at_or_before(t, floor):
        best = None
        for k in keys:
            if k <= t + 1e-6:
                if k > floor + 1e-6:
                    best = k
            else:
                break
        return best

    cuts, start = [], 0.0
    guard = 0
    while start < duration - 1e-3 and guard < 10000:
        guard += 1
        end = time_at_bytes(bytes_before(start) + target_bytes)
        if end >= duration - 1e-3:
            cuts.append((start, duration))
            break
        length = end - start
        window = min(SILENCE_WINDOW_MAX, SILENCE_WINDOW_RATIO * length)
        # khoang im lang co diem giua nam trong cua so cuoi phan -> cat o giua khoang lang muon nhat
        cands = [(a + b) / 2.0 for a, b in sil if end - window <= (a + b) / 2.0 <= end]
        if cands:
            end = max(cands)
        if end <= start + 1e-3:
            end = min(duration, start + max(1.0, length))
        cuts.append((start, end))
        nxt = key_at_or_before(end - overlap, start)
        if nxt is None:
            # khong co keyframe trong doan chong lan -> bat dau tu keyframe gan nhat truoc diem cat
            nxt = key_at_or_before(end, start)
        if nxt is None:
            # video khong co keyframe nao sau start (hiem) -> dung luon diem cat
            nxt = end
        start = nxt
    return cuts


def _cut_encode(src, start, end, out):
    """Cat CHINH XAC bang cach nen lai doan do (cham hon stream copy). Chi dung khi diem bat dau
    khong phai keyframe (GOP dai hon ca 1 phan — hiem, vd gioi han rat nho)."""
    tmp = out + ".part.mp4"
    argv = [remotion_plan._ffbin("ffmpeg"), "-v", "error", "-y", "-ss", "%.3f" % start, "-i", src,
            "-t", "%.3f" % max(0.1, end - start), "-map", "0:v:0?", "-map", "0:a:0?",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "64k", "-ac", "1", "-movflags", "+faststart", tmp]
    r = _run(argv, timeout=1200)
    if r.returncode != 0 or not os.path.isfile(tmp) or os.path.getsize(tmp) == 0:
        _rm(tmp)
        raise RuntimeError("Cắt video lỗi (%.1f–%.1fs): %s" % (start, end, (r.stderr or "").strip()[-300:]))
    os.replace(tmp, out)
    return os.path.getsize(out)


def _cut_copy(src, start, end, out):
    tmp = out + ".part.mp4"
    # start la moc 1 keyframe; +2ms de lam tron "%.3f" khong roi XUONG duoi keyframe (ffmpeg se
    # lui ve keyframe truoc do -> lech gio ca phan)
    argv = [remotion_plan._ffbin("ffmpeg"), "-v", "error", "-y", "-ss", "%.3f" % (start + 0.002), "-i", src,
            "-t", "%.3f" % max(0.1, end - start), "-map", "0", "-c", "copy",
            "-avoid_negative_ts", "make_zero", "-movflags", "+faststart", tmp]
    r = _run(argv, timeout=600)
    if r.returncode != 0 or not os.path.isfile(tmp) or os.path.getsize(tmp) == 0:
        _rm(tmp)
        raise RuntimeError("Cắt video lỗi (%.1f–%.1fs): %s" % (start, end, (r.stderr or "").strip()[-300:]))
    os.replace(tmp, out)
    return os.path.getsize(out)


def split(compressed, limit=None, log=None):
    """Cat file DA NEN thanh cac phan <= limit byte (mac dinh PIECE_LIMIT_BYTES).
    Tra [{path,start,end,bytes,index,count}]."""
    limit = int(limit or PIECE_LIMIT_BYTES)
    base = os.path.splitext(os.path.basename(compressed))[0]
    tag = hashlib.sha1(("%s|%d|%d|%s|v%d" % (base, os.path.getsize(compressed), limit, OVERLAP_SEC,
                                             PREP_VERSION)).encode()).hexdigest()[:8]
    manifest = os.path.join(CACHE_DIR, "%s_split_%s.json" % (base, tag))
    with _lock_for(manifest):
        if os.path.isfile(manifest):
            try:
                with open(manifest, encoding="utf-8") as f:
                    pieces = json.load(f)
                if pieces and all(os.path.isfile(p["path"]) for p in pieces):
                    for p in pieces:
                        _touch(p["path"])
                    _touch(manifest)
                    return pieces
            except (OSError, ValueError, KeyError, TypeError):
                pass
        pk, keys, dur = packets(compressed)
        sil = silences(compressed)
        target = int(limit * PACKET_TARGET_RATIO)
        pieces = []
        for attempt in range(4):
            cuts = plan_cuts(pk, keys, dur, sil, target)
            pieces, over = [], False
            keyset = set(round(k, 6) for k in keys)
            for i, (st, en) in enumerate(cuts):
                out = os.path.join(CACHE_DIR, "%s_%s_p%02d.mp4" % (base, tag, i + 1))
                if st <= 0 or round(st, 6) in keyset:
                    size = _cut_copy(compressed, st, en, out)
                else:
                    # stream copy tu diem khong phai keyframe se lui ve keyframe truoc -> lech gio
                    size = _cut_encode(compressed, st, en, out)
                pieces.append({"path": out, "start": round(st, 3), "end": round(en, 3), "bytes": size,
                               "index": i + 1, "count": len(cuts)})
                over = over or size > limit
            if not over:
                break
            # Phan nao lo vuot (header mp4 lon hon du kien) -> ha muc tieu roi chia lai
            target = int(target * 0.9)
        if any(p["bytes"] > limit for p in pieces):
            raise RuntimeError("Không cắt được video thành các phần ≤ %s" % _mb(limit))
        with open(manifest, "w", encoding="utf-8") as f:
            json.dump(pieces, f, ensure_ascii=False)
        return pieces


def prepare(path, limit=None, allow_split=True, log=None):
    """Nen (cache) roi cat neu can. Tra
    {"src_bytes", "compressed": {...} | None, "error": str|None, "pieces": [{path,start,end,bytes,index,count}]}.

    Nen hong -> gui file goc (hanh vi cu) va ghi ro loi; allow_split=False -> luon 1 phan.
    """
    limit = int(limit or PIECE_LIMIT_BYTES)
    out = {"src_bytes": os.path.getsize(path), "compressed": None, "error": None, "sdr_from_hdr": False}
    import media_sdr
    work = media_sdr.working_path(path, log=log)   # HDR -> nen tu ban SDR (Gemini thay dung mau)
    out["sdr_from_hdr"] = work != path
    try:
        comp = compress(work, log=log)
        out["compressed"] = comp
        send, send_bytes, dur = comp["path"], comp["bytes"], comp.get("duration")
    except Exception as e:
        out["error"] = str(e)
        send, send_bytes = work, os.path.getsize(work)
        dur = probe(work).get("duration")
    if allow_split and send_bytes > limit and out["compressed"]:
        out["pieces"] = split(send, limit=limit, log=log)
    else:
        out["pieces"] = [{"path": send, "start": 0.0, "end": round(dur or 0.0, 3), "bytes": send_bytes,
                          "index": 1, "count": 1}]
    out["duration"] = dur
    return out


# ----------------------------------------------------------------------------
# Ghep ket qua phan tich cac phan (khong AI)
# ----------------------------------------------------------------------------
TIMED_LISTS = ("transcript", "emotion_map", "key_moments")
_QUALITY_RANK = {"good": 0, "usable": 1, "poor": 2}


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _shift_items(items, offset, lo, hi, duration):
    """Cong offset vao start/end; chi giu muc co start trong [lo, hi)."""
    out = []
    for it in items or []:
        if not isinstance(it, dict):
            continue
        st, en = _num(it.get("start")), _num(it.get("end"))
        if st is None:
            continue
        st = st + offset
        en = (en + offset) if en is not None else st
        if not (lo - 1e-6 <= st < hi):
            continue
        if duration:
            st, en = min(st, duration), min(max(en, st), duration)
        it = dict(it)
        it["start"], it["end"] = round(st, 3), round(en, 3)
        out.append(it)
    return out


def _majority(values, weights=None):
    score = {}
    for i, v in enumerate(values):
        if v in (None, "", []):
            continue
        key = json.dumps(v, ensure_ascii=False, sort_keys=True) if not isinstance(v, str) else v
        score.setdefault(key, [0.0, v])
        score[key][0] += (weights[i] if weights else 1.0)
    if not score:
        return None
    return max(score.values(), key=lambda x: x[0])[1]


def _union(lists):
    seen, out = set(), []
    for lst in lists:
        for x in lst or []:
            key = json.dumps(x, ensure_ascii=False, sort_keys=True) if not isinstance(x, str) else x
            if key not in seen:
                seen.add(key)
                out.append(x)
    return out


def merge_parts(source_id, name, duration, parts):
    """Ghep phan tich cac PHAN cua 1 video.

    parts = [(piece, src_entry)] theo thu tu; piece = {start, end, index, count};
    src_entry = 1 phan tu `sources[]` Gemini tra cho phan do (moc gio tinh tu 0 cua phan).
    Tra (source_dict, part_summaries).
    """
    parts = [(p, s if isinstance(s, dict) else {}) for p, s in parts]
    bounds = []
    for k in range(len(parts) - 1):
        a, b = parts[k][0], parts[k + 1][0]
        bounds.append((float(b["start"]) + float(a["end"])) / 2.0)
    merged = {"id": source_id, "name": name, "duration": duration}
    for key in TIMED_LISTS:
        items = []
        for k, (piece, s) in enumerate(parts):
            lo = bounds[k - 1] if k > 0 else float("-inf")
            hi = bounds[k] if k < len(bounds) else float("inf")
            items += _shift_items(s.get(key), float(piece["start"]), lo, hi, duration)
        items.sort(key=lambda x: (x["start"], x["end"]))
        merged[key] = items
    lens = [max(0.1, float(p["end"]) - float(p["start"])) for p, _ in parts]
    merged["role"] = _majority([s.get("role") for _, s in parts], lens) or "other"
    q = {}
    for field in ("visual", "audio"):
        vals = [((s.get("quality") or {}).get(field)) for _, s in parts]
        vals = [v for v in vals if v in _QUALITY_RANK]
        if vals:
            q[field] = max(vals, key=lambda v: _QUALITY_RANK[v])
    notes = _union([[(s.get("quality") or {}).get("notes")] for _, s in parts])
    if notes:
        q["notes"] = " | ".join(n for n in notes if n)
    if q:
        merged["quality"] = q
    merged["on_screen_text"] = _union([s.get("on_screen_text") for _, s in parts])
    fr = _majority([s.get("faces_region") for _, s in parts], lens)
    if fr:
        merged["faces_region"] = fr
    merged["warnings"] = _union([s.get("warnings") for _, s in parts])
    # giong noi (voice_boost): muc to chiem nhieu thoi luong nhat; mot phan nghe khong ro -> ca video khong ro
    gn = [(s.get("giong_noi"), ln) for (_, s), ln in zip(parts, lens) if isinstance(s.get("giong_noi"), dict)]
    if gn:
        muc = _majority([g.get("muc_to") for g, _ in gn], [ln for _, ln in gn])
        merged["giong_noi"] = {"muc_to": muc, "nghe_ro": not any(g.get("nghe_ro") is False for g, _ in gn),
                               "van_de": " | ".join(str(g.get("van_de")) for g, _ in gn if g.get("van_de"))[:300]}
    summaries = [{"range": "%s–%s" % (fmt_time(p["start"]), fmt_time(p["end"])),
                  "start": p["start"], "end": p["end"], "summary": s.get("summary") or ""}
                 for p, s in parts]
    # Tam thoi: noi tom tat tung phan (buoc ghep bang AI se viet lai cho lien mach)
    merged["summary"] = " ".join("[%s] %s" % (x["range"], x["summary"]) for x in summaries if x["summary"])
    return merged, summaries


def merge_top(results, sources, durations):
    """Gop phan chung cua nhieu lan goi (summary/tone/language/warnings) — ban tam, chua qua AI."""
    langs = [r.get("language") for r in results if isinstance(r, dict)]
    tones = [r.get("tone") for r in results if isinstance(r, dict)]
    summ = [r.get("summary") for r in results if isinstance(r, dict) and r.get("summary")]
    return {
        "summary": " ".join(summ),
        "language": _majority(langs) or "vi",
        "tone": _majority(tones) or "mixed",
        "total_source_duration": round(sum(d or 0 for d in durations), 3),
        "sources": sources,
        "warnings": _union([r.get("warnings") for r in results if isinstance(r, dict)]),
    }
