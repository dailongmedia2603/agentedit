#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CAN LAI GIO LOI NOI cua transcript Gemini bang Whisper (giu CHU cua Gemini, lay GIO that).

Vi sao: Gemini doc video rat tot ve NOI DUNG nhung mo GIO. Do that 2026-09-25 tren
"test 1.mp4" (37.7s): 31/32 cau cua Gemini TRE hon loi noi 0.5-2.5s (trung vi 1.5s) va
troi dan ve cuoi — cac moc cach deu ~1.25s cho thay Gemini gan nhu "rai deu" cau theo
thoi luong. He qua: caption hien cham hon loi, diem cat jump-cut roi giua tu, hook /
SFX / meme dat lech.

Cach sua: Whisper (faster-whisper, chay tren may, khong ton luot AI) cho moc gio TUNG
CHU. Ghep chu Gemini voi chu Whisper theo thu tu (difflib, bo dau tieng Viet), cau nao
khop thi lay gio that, chu khong khop thi noi suy tu hai chu khop gan nhat. Cac truong
khac cua Gemini (emotion_map, key_moments...) duoc co gian bang cung ham quy doi
"gio Gemini -> gio that". Whisper khong co / khop qua it -> giu nguyen gio Gemini va ghi
ro trong `timing` de UI bao.
"""
import os
import re
import json
import bisect
import hashlib
import unicodedata
import statistics
import difflib
import threading

CACHE_DIR = os.path.join(os.path.expanduser("~"), ".capcut-studio", "cache", "asr")
ASR_MODEL = os.environ.get("AUTOCAPCUT_ASR_MODEL", "small")
ASR_VERSION = 1
MIN_MATCH_RATIO = 0.35     # khop it hon -> Whisper nghe sai / video toan nhac -> khong sua
AVG_WORD_SEC = 0.22
MIN_ITEM_SEC = 0.15

_lock = threading.Lock()
_model = {"name": None, "obj": None}


class AsrUnavailable(RuntimeError):
    """May chua co faster-whisper hoac model — khong can duoc gio, KHONG phai loi pipeline."""


# ---------------------------------------------------------------------------
# CHU: chuan hoa de so khop (bo dau, dong nghia hay gap khi Whisper nghe)
# ---------------------------------------------------------------------------
_SYN = {"tui": "toi", "hong": "khong", "ko": "khong", "k": "khong", "dc": "duoc", "oke": "ok",
        "okay": "ok", "zo": "vo", "z": "vay", "j": "gi"}


def _base(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.replace("đ", "d")


def norm_tokens(text):
    out = []
    for t in re.sub(r"[^a-z0-9 ]", " ", _base(text)).split():
        out.append(_SYN.get(t, t))
    return out


# ---------------------------------------------------------------------------
# WHISPER (co cache theo file)
# ---------------------------------------------------------------------------
def _cache_path(path):
    st = os.stat(path)
    key = "%s|%d|%d|%s|%d" % (os.path.abspath(path), st.st_size, int(st.st_mtime), ASR_MODEL, ASR_VERSION)
    return os.path.join(CACHE_DIR, hashlib.sha1(key.encode("utf-8")).hexdigest() + ".json")


def _load_model(log=None):
    try:
        from faster_whisper import WhisperModel
    except Exception as e:  # noqa: BLE001
        raise AsrUnavailable("Chua cai faster-whisper trong venv engine (%s)" % str(e)[:120])
    with _lock:
        if _model["obj"] is not None and _model["name"] == ASR_MODEL:
            return _model["obj"]
        # CHI dung model da co tren may (~/.cache/huggingface). Khong tu tai: model ~480MB,
        # tai am tham giua luc "Hieu nguon" thi app treo vai phut ma nguoi dung khong biet vi sao.
        try:
            m = WhisperModel(ASR_MODEL, device="cpu", compute_type="int8", local_files_only=True)
        except Exception as e:  # noqa: BLE001
            raise AsrUnavailable(
                "Chua co model Whisper '%s' tren may (%s). Tai 1 lan bang lenh: <venv engine>/bin/python -c "
                "\"from faster_whisper import WhisperModel; WhisperModel('%s')\"" % (ASR_MODEL, str(e)[:80], ASR_MODEL))
        _model.update(name=ASR_MODEL, obj=m)
        return m


def asr_words(path, language=None, log=None):
    """[{w, s, e}] moc gio tung chu trong file. Cache theo (duong dan, kich thuoc, mtime, model)."""
    if not path or not os.path.isfile(path):
        raise AsrUnavailable("Khong thay file: %s" % path)
    cp = _cache_path(path)
    if os.path.isfile(cp):
        try:
            with open(cp, encoding="utf-8") as f:
                return json.load(f)["words"]
        except (OSError, ValueError, KeyError):
            pass
    model = _load_model(log)
    if log:
        log("Whisper nghe lai loi noi de lay moc gio tung chu: %s" % os.path.basename(path))
    lang = (language or "").strip().lower()[:2] or None
    segs, _info = model.transcribe(path, language=lang, word_timestamps=True, vad_filter=True,
                                   beam_size=5, condition_on_previous_text=False)
    words = []
    for s in segs:
        for w in s.words or []:
            txt = (w.word or "").strip()
            if txt:
                words.append({"w": txt, "s": round(float(w.start), 3), "e": round(float(w.end), 3)})
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(cp, "w", encoding="utf-8") as f:
        json.dump({"path": path, "model": ASR_MODEL, "words": words}, f, ensure_ascii=False)
    return words


# ---------------------------------------------------------------------------
# GHEP CHU + NOI SUY
# ---------------------------------------------------------------------------
def _word_tokens(words):
    """Moi chu Whisper -> 1 token (chu dau sau chuan hoa)."""
    return [(norm_tokens(w["w"]) or [""])[0] for w in words]


def token_times(tokens, words, wtoks=None, lo=0.0, hi=None):
    """Gio (s, e) cho TUNG token cua mot doan chu, theo chu Whisper. Tra (times, so_khop)."""
    wtoks = wtoks if wtoks is not None else _word_tokens(words)
    n = len(tokens)
    times = [None] * n
    sm = difflib.SequenceMatcher(a=tokens, b=wtoks, autojunk=False)
    matched = 0
    for a, b, k in sm.get_matching_blocks():
        for j in range(k):
            times[a + j] = (words[b + j]["s"], words[b + j]["e"])
            matched += 1
    if not matched:
        return times, 0
    hi = hi if hi is not None else max(w["e"] for w in words)
    known = [i for i in range(n) if times[i]]
    for i in range(n):
        if times[i]:
            continue
        p = max((k for k in known if k < i), default=None)
        q = min((k for k in known if k > i), default=None)
        if p is not None and q is not None:
            # chia deu khoang trong giua 2 chu khop cho cac chu khong khop nam giua
            slot = max(0.0, times[q][0] - times[p][1]) / max(1, q - p - 1)
            s = times[p][1] + slot * (i - p - 1)
            e = s + max(0.05, min(slot, AVG_WORD_SEC * 2))
        elif q is not None:
            s = times[q][0] - (q - i) * AVG_WORD_SEC
            e = s + AVG_WORD_SEC
        else:
            s = times[p][1] + (i - p - 1) * AVG_WORD_SEC
            e = s + AVG_WORD_SEC
        s = max(lo, min(hi, s))
        times[i] = (round(s, 3), round(max(s, min(hi, e)), 3))
    return times, matched


def _warp_fn(anchors):
    """Ham quy doi don dieu gio Gemini -> gio that tu cac cap (g, t). Ngoai khoang: dich deu."""
    anchors = sorted(anchors)
    mono = []
    for g, t in anchors:
        if mono and (t < mono[-1][1] or g <= mono[-1][0] + 1e-6):
            continue
        mono.append((g, t))
    if not mono:
        return lambda x: x
    gs = [a[0] for a in mono]

    def f(x):
        x = float(x)
        if x <= gs[0]:
            return max(0.0, x + (mono[0][1] - mono[0][0]))
        if x >= gs[-1]:
            return x + (mono[-1][1] - mono[-1][0])
        i = bisect.bisect_right(gs, x) - 1
        (g0, t0), (g1, t1) = mono[i], mono[i + 1]
        return t0 + (t1 - t0) * (x - g0) / (g1 - g0)
    return f


def retime_source(src, words, duration=None):
    """Sua gio transcript (+ emotion_map, key_moments, on_screen_text) cua 1 source TAI CHO.
    Tra thong ke `timing`."""
    items = [t for t in (src.get("transcript") or []) if isinstance(t, dict)]
    duration = float(duration or src.get("duration") or 0) or (max((w["e"] for w in words), default=0) + 1)
    tokens, owner, pos = [], [], []
    for i, it in enumerate(items):
        toks = norm_tokens(it.get("text"))
        for k, tk in enumerate(toks):
            tokens.append(tk)
            owner.append(i)
            pos.append((k, len(toks)))
    if not tokens or not words:
        return {"method": "gemini", "ly_do": "Khong co loi thoai de can gio"}
    times, matched = token_times(tokens, words, hi=duration)
    ratio = matched / float(len(tokens))
    if matched < 3 or ratio < MIN_MATCH_RATIO:
        return {"method": "gemini", "matched": round(ratio, 2),
                "ly_do": "Whisper chi khop %d%% chu voi Gemini — giu nguyen gio Gemini" % round(ratio * 100)}

    # moc Gemini -> moc that (lay tu CHU khop) de co gian cac truong khac
    anchors = []
    for j, tk in enumerate(tokens):
        it = items[owner[j]]
        g0, g1 = float(it.get("start") or 0), float(it.get("end") or 0)
        k, n = pos[j]
        anchors.append((g0 + (g1 - g0) * (k + 0.5) / max(1, n), (times[j][0] + times[j][1]) / 2))
    warp = _warp_fn(anchors)

    shifts = []
    first_tok = {}
    last_tok = {}
    for j, i in enumerate(owner):
        first_tok.setdefault(i, j)
        last_tok[i] = j
    for i, it in enumerate(items):
        g0, g1 = float(it.get("start") or 0), float(it.get("end") or 0)
        it.setdefault("start_gemini", g0)
        it.setdefault("end_gemini", g1)
        if i in first_tok:
            s, e = times[first_tok[i]][0], times[last_tok[i]][1]
        else:  # muc im lang / ghi chu -> co gian theo ham quy doi
            s, e = warp(g0), warp(g1)
        it["start"], it["end"] = round(max(0.0, s), 3), round(min(duration, max(e, s + MIN_ITEM_SEC)), 3)
        shifts.append(g0 - it["start"])
    # khong chong nhau, khong lui thu tu
    for a, b in zip(items, items[1:]):
        if b["start"] < a["start"]:
            b["start"] = a["start"]
        if a["end"] > b["start"]:
            a["end"] = round(max(a["start"] + MIN_ITEM_SEC, b["start"]), 3)
        if b["end"] < b["start"] + MIN_ITEM_SEC:
            b["end"] = round(min(duration, b["start"] + MIN_ITEM_SEC), 3)

    for key in ("emotion_map", "key_moments", "on_screen_text"):
        for m in src.get(key) or []:
            if not isinstance(m, dict) or m.get("start") is None:
                continue
            try:
                g0 = float(m["start"])
                g1 = float(m.get("end", g0))
            except (TypeError, ValueError):
                continue
            m.setdefault("start_gemini", g0)
            m["start"] = round(max(0.0, warp(g0)), 3)
            if m.get("end") is not None:
                m.setdefault("end_gemini", g1)
                m["end"] = round(min(duration, max(m["start"] + 0.1, warp(g1))), 3)

    # chu Whisper gon (dung de canh karaoke tung chu cho caption Remotion)
    src["asr_words"] = [[w["w"], w["s"], w["e"]] for w in words]
    return {
        "method": "asr-align", "model": "faster-whisper-%s" % ASR_MODEL,
        "matched": round(ratio, 2),
        "median_shift": round(statistics.median(shifts), 2) if shifts else 0.0,
        "max_shift": round(max(shifts, key=abs), 2) if shifts else 0.0,
    }


def needs_retime(brief):
    srcs = (brief or {}).get("sources") or []
    return any(isinstance(s, dict) and (s.get("timing") or {}).get("method") != "asr-align"
               and s.get("transcript") for s in srcs)


def retime_brief(brief, log=None, force=False):
    """Can gio moi source trong brief (TAI CHO). Tra danh sach ghi chu cho nhat ky/UI.
    Khong bao gio nem loi: can gio hong thi van dung duoc gio Gemini."""
    notes = []
    if not isinstance(brief, dict):
        return notes
    paths = {r.get("id"): r for r in brief.get("source_videos") or [] if isinstance(r, dict)}
    for src in brief.get("sources") or []:
        if not isinstance(src, dict) or not src.get("transcript"):
            continue
        if not force and (src.get("timing") or {}).get("method") == "asr-align":
            continue
        row = paths.get(src.get("id")) or {}
        path = row.get("path") or (brief.get("source_video") if len(paths) <= 1 else None)
        try:
            words = asr_words(path, language=src.get("language") or brief.get("language"), log=log)
            src["timing"] = retime_source(src, words, row.get("duration") or src.get("duration"))
        except AsrUnavailable as e:
            src["timing"] = {"method": "gemini", "ly_do": str(e)}
        except Exception as e:  # noqa: BLE001
            src["timing"] = {"method": "gemini", "ly_do": "Loi khi can gio: %s" % str(e)[:200]}
        tm = src["timing"]
        if tm.get("method") == "asr-align":
            notes.append("%s: can gio loi noi bang Whisper — khop %d%% chu, lech trung vi %+.2fs (lon nhat %+.2fs)"
                         % (src.get("id"), round(tm["matched"] * 100), tm["median_shift"], tm["max_shift"]))
        else:
            notes.append("%s: GIU GIO GEMINI (co the lech 1-2s) — %s" % (src.get("id"), tm.get("ly_do")))
    return notes


def caption_word_times(text, asr_rows, a, b, pad=1.2):
    """Moc (s, e) gio NGUON cho tung chu cua 1 caption, dua tren chu Whisper quanh [a-pad, b+pad].
    None neu khop qua it (caption viet lai qua xa loi noi)."""
    toks_raw = (text or "").split()
    toks = [(norm_tokens(t) or [""])[0] for t in toks_raw]
    if not toks or not asr_rows:
        return None
    win = [{"w": r[0], "s": float(r[1]), "e": float(r[2])} for r in asr_rows
           if float(r[2]) >= a - pad and float(r[1]) <= b + pad]
    if not win:
        return None
    times, matched = token_times(toks, win, lo=max(0.0, a - pad), hi=b + pad)
    if matched < max(1, round(len(toks) * 0.5)):
        return None
    return [(toks_raw[i], times[i][0], times[i][1]) for i in range(len(toks))]
