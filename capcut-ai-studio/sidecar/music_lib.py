#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""KHO NHAC NEN (2026-10-05) — ~/.capcut-studio/music/ + music_library.json.

User: video du da co SFX van nen co "chut nhac nen nho nho" de khong qua im; nhac phai KHONG dinh ban quyen
khi dang TikTok / YouTube / Reels, KHONG duoc to lan giong nguoi noi, va KHONG ap cho phan hook.

- Kho: moi bai = 1 file am thanh + nhan Gemini (NGHE file: the loai, cam xuc, nang luong, nhip, nhac cu, co loi
  hat khong, hop lam nen duoi giong noi khong, dung khi / tranh khi, giay bat dau dep) + so do cua may (do dai,
  do to). Nguon + giay phep ghi tren tung bai (`source`, `license`, `source_url`).
- Lap ke hoach: B7 (cung luot AI chon SFX, khong them luot AI) nhan them danh muc nhac + luat `_MUSIC_RULE`
  (own_key) -> AI chon 1 bai (hoac khong dung, phai co ly do). AI khong tra / id sai -> code tu chon theo nhan.
  Kho trong / tat "tu them nhac nen" -> B7 y het truoc (prompt, payload, khoa cache).
- Dung (build_spec -> `to_spec`): nhac BAT DAU SAU HOOK (fade in), het video thi fade out; DO TO = QUY TAC cua buoc
  lap ke hoach (user 10-06): nhac nen = `plan_guard.MUSIC_VOICE_PCT` (20%) tieng nguoi cua CHINH video — 20% bien do
  = giong - 14 dB (sua o Prompt & quy tac, KHONG chinh o kho); meme cat vao (co tieng rieng) thi ha sau. Bai ngan hon
  video -> noi lai (cross-fade) tu `best_start`.
"""
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import threading
import time

import prompt_store

HOME = os.path.expanduser("~")
ENGINE_HOME = os.path.join(HOME, ".capcut-studio")
MUSIC_DIR = os.path.join(ENGINE_HOME, "music")
MUSIC_LIB = os.path.join(ENGINE_HOME, "music_library.json")
GEMINI_CACHE = os.path.join(ENGINE_HOME, "cache", "music-gemini")

MUSIC_VERSION = 1
AUDIO_EXT = (".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac")

# --- tron nhac: do to nhac (nang luong TB LUFS M) so voi GIONG NOI cua video (p90 momentary LUFS khung co tieng) ---
# 10-06 user: KHONG chinh do to o kho; QUY TAC buoc lap ke hoach: nhac nen = 20% tieng nguoi (plan_guard.MUSIC_VOICE_PCT,
# sua o Prompt & quy tac). Truoc do: thanh truot -20 / -15 dB + muc AI + chinh tung bai — da bo.
DEFAULT_SETTINGS = {"auto": True}
ABS_VOICE = -16.0               # khong do duoc giong -> coi giong o muc thuong gap (LUFS M p90)
INSERT_DUCK_DB = -12.0          # meme CAT vao (co tieng rieng): nhac lui sau
OVERLAY_DUCK_DB = -6.0          # meme DE LEN co tieng
FADE_IN = 1.2
FADE_OUT = 2.0
XFADE = 2.0                     # noi bai (bai ngan hon video)
MIN_MUSIC_SEC = 4.0             # phan sau hook ngan hon -> khong dat nhac
MIN_TRACK_SEC = 20.0            # bai qua ngan khong vao danh muc (loop lien tuc nghe lap)
ENV_STEP = 0.05                 # luoi tinh duong am luong (giay)
ENV_TOL = 0.06                  # sai so TUONG DOI khi rut gon diem duong am luong (~0.5 dB; nhac nen nho ~0.05 nen
                                # sai so tuyet doi 0.008 da lech ~1.5 dB — do tren render that)
LABEL_BATCH = 3                 # so bai / luot Gemini (bai 2-3 phut, ban nen mono 48 kbps)
MIX_DIR = os.path.join(ENGINE_HOME, "cache", "music-mix")
MIX_SR = 48000
MIX_VERSION = 1

_lock = threading.RLock()


def _p(name):
    return prompt_store.get_prompt(name, globals()[name])


# ---------------------------------------------------------------------------
# PROMPT
# ---------------------------------------------------------------------------
_GEMINI_MUSIC_PROMPT = """Ban la MUSIC SUPERVISOR dang PHAN LOAI cac bai NHAC NEN (khong loi / it loi) trong kho tai su dung cho
video short-form (TikTok / Reels / Shorts), chu yeu la video NGUOI NOI CHUYEN (talking-head): nhac chi la LOP NEN
NHO duoi giong noi, khong phai nhan vat chinh.

Cac file dinh kem la file AM THANH (khong co hinh). NGHE TUNG BAI (ca bai, khong chi doan dau). AI lap ke hoach sau
nay KHONG NGHE duoc file — no chi doc nhan cua ban de chon bai hop voi noi dung + cam xuc cua tung video.

# TRA VE CHI JSON — MOT muc cho MOI file, dung "id" da cho, dung thu tu
{
  "tracks": [
    {
      "id": "<id cua file>",
      "summary": "1-2 cau tieng Viet: nghe thay gi, cam giac chung (vd: 'piano nhe + beat lofi cham, am ap, thu thai')",
      "genre": "lofi|acoustic|piano|corporate|pop|hiphop|edm|electronic|cinematic|orchestral|ambient|jazz|funk|rock|chill|other",
      "moods": ["2-5 cam xuc tieng Viet: vui tuoi, truyen cam hung, thu gian, sang trong, hai huoc, cang thang, buon, hoai niem, tu tin, nang dong..."],
      "energy": "thap|vua|cao",
      "tempo": "cham|vua|nhanh",
      "bpm": <so nguyen uoc luong>,
      "instruments": ["nhac cu chinh"],
      "has_vocals": true/false,
      "vocals_note": "neu co giong hat / tieng hô / sample loi: o dau, nhieu khong",
      "speech_friendly": "tot|vua|kem",
      "speech_note": "vi sao: giai dieu thua / day, dai tan giong noi (trung am) nhieu hay it, co doan bung to dot ngot",
      "use_when": "loai video / noi dung / cam xuc nao HOP (vd: 'chia se kinh nghiem nhe nhang, tam su, review san pham doi thuong')",
      "avoid_when": ["khi nao KHONG nen dung"],
      "best_start": <giay bat dau dep de vao nhac ngay (bo intro qua dai / im) — 0 neu dau bai da hay>,
      "structure": "mo ta ngan cac doan theo giay (intro / dien bien / cao trao / ket)",
      "tags": ["4-8 tu khoa tieng Viet"]
    }
  ]
}

# LUU Y
- speech_friendly: "tot" = nen thua, deu, it giai dieu chen vao dai tan giong noi -> dat duoi loi noi khong roi;
  "vua" = dung duoc khi ha nho; "kem" = giai dieu / loi hat / trong dap noi bat se tranh giong noi.
- has_vocals = true neu co GIONG NGUOI hat / noi thanh chu (ke ca sample ngan). "ooh/aah" nen nhe -> ghi vocals_note.
- energy/tempo theo CAM NHAN nguoi nghe, khong theo ten file. Ten file thuong khong noi len gi.
- Khong nghe duoc file nao thi van tra muc do voi summary "khong nghe duoc" — KHONG doan theo ten.

⚠️ TRA VE CHI JSON GOC. Khong ```json```. Ky tu dau la {, ky tu cuoi la }."""

_MUSIC_RULE = """

# NHAC NEN (bat buoc tra them khoa "music" trong CUNG object JSON, canh "audio")
Ngoai SFX, chon 1 bai NHAC NEN trong music_catalog ben duoi cho TOAN video. Nhac chi la LOP NEN NHO duoi giong noi
de video khong bi kho / qua im giua cac cau — he thong TU dat muc to theo quy tac, TU giam khi meme
cat vao, TU bat dau SAU HOOK (hook khong co nhac) va fade o cuoi. Viec cua ban: CHON DUNG BAI theo noi dung.
- MAC DINH NEN CO nhac nen (ke ca khi da co nhieu SFX). Chi bo khi: nguoi dung yeu cau khong nhac (cau_chuyen /
  yeu cau edit), video goc DA CO nhac nen ro (nhac_nen_video_goc.co = true), hoac noi dung can im lang that su
  (tin buon nghiem trong, chia buon) — khi do tra {"track_id": null, "ly_do": "..."}.
- Chon theo tone + story_arc + nhip_truyen: tam su / huong dan nhe -> energy thap-vua, speech_friendly "tot";
  hai huoc / nang dong / ban hang -> vua-cao nhung van speech_friendly "tot" hoac "vua". Doc use_when / avoid_when.
- TRANH bai has_vocals = true hoac speech_friendly = "kem" (de len giong noi) tru khi khong con bai nao hop.
- DO TO la QUY TAC CO DINH cua he thong: nhac nen = {pct}% tieng nguoi noi. KHONG khai volume / dB / muc to.
- Chi dung track_id co trong music_catalog.

Dang:
"music": {"track_id": "<id>", "ly_do": "vi sao bai nay hop noi dung + cam xuc video"}

# MUSIC CATALOG:
"""


def prompt_fp():
    return hashlib.sha1((_p("_MUSIC_RULE") + "\n" + str(MUSIC_VERSION)).encode("utf-8")).hexdigest()[:12]


# ---------------------------------------------------------------------------
# KHO
# ---------------------------------------------------------------------------
def load_lib():
    with _lock:
        if os.path.isfile(MUSIC_LIB):
            try:
                with open(MUSIC_LIB, encoding="utf-8") as f:
                    d = json.load(f)
                if isinstance(d, dict):
                    d.setdefault("tracks", [])
                    return d
            except (OSError, ValueError):
                pass
        return {"tracks": []}


def save_lib(lib):
    with _lock:
        os.makedirs(ENGINE_HOME, exist_ok=True)
        tmp = MUSIC_LIB + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(lib, f, ensure_ascii=False, indent=2)
        os.replace(tmp, MUSIC_LIB)


def list_tracks():
    return [t for t in load_lib().get("tracks", []) if isinstance(t, dict) and t.get("id")]


def get(tid):
    for t in list_tracks():
        if t["id"] == tid:
            return t
    return None


def settings():
    s = dict(DEFAULT_SETTINGS)
    raw = load_lib().get("settings")
    if isinstance(raw, dict) and isinstance(raw.get("auto"), bool):
        s["auto"] = raw["auto"]
    return s


def voice_pct():
    """Quy tac buoc lap ke hoach: nhac nen = bao nhieu % tieng nguoi (Prompt & quy tac, mac dinh 20)."""
    import plan_guard
    plan_guard.apply_overrides()
    return float(plan_guard.MUSIC_VOICE_PCT)


def rel_db():
    """% tieng nguoi -> dB so voi giong (bien do: 20% = -14 dB)."""
    return 20 * math.log10(max(1.0, voice_pct()) / 100.0)


def set_settings(auto=None):
    with _lock:
        lib = load_lib()
        s = settings()
        if auto is not None:
            s["auto"] = bool(auto)
        lib["settings"] = s
        save_lib(lib)
        return s


def _update(tid, fn):
    with _lock:
        lib = load_lib()
        row = None
        for t in lib.get("tracks", []):
            if t.get("id") == tid:
                fn(t)
                row = t
        if row is not None:
            save_lib(lib)
        return row


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _slug(name):
    s = re.sub(r"[^\w\-]+", "-", (name or "nhac").lower(), flags=re.UNICODE).strip("-")
    s = re.sub(r"[^a-z0-9\-]", "", s)[:32].strip("-")
    return s or "nhac"


def _file_sha1(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def measure(path):
    """So do bang AM THANH THAT: do dai (giay) + do to tich phan (LUFS I). {} neu khong do duoc."""
    import winsupport
    if not path or not os.path.isfile(path):
        return {}
    try:
        r = subprocess.run([winsupport.ffbin("ffmpeg"), "-nostats", "-hide_banner", "-i", path, "-vn",
                            "-filter_complex", "ebur128", "-f", "null", "-"],
                           capture_output=True, text=True, timeout=300)
    except Exception:
        return {}
    err = r.stderr or ""
    out = {}
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", err)
    if m:
        out["duration"] = round(int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)), 2)
    vals = [float(x) for x in re.findall(r"I:\s*(-?\d+\.?\d*)\s*LUFS", err)]
    vals = [v for v in vals if v > -70]
    if vals:
        out["lufs_i"] = round(vals[-1], 1)
    return out


def import_local(path, name=None, meta=None):
    """Chep 1 file nhac vao kho (id theo NOI DUNG file -> nhap trung khong tao 2 muc). meta: artist / source /
    license / source_url... (bo nhac co giay phep do tac gia nap). Tra muc kho."""
    if not path or not os.path.isfile(path):
        raise RuntimeError("Khong thay file: %s" % path)
    ext = os.path.splitext(path)[1].lower()
    if ext not in AUDIO_EXT:
        raise RuntimeError("Khong phai file am thanh ho tro (%s)" % ", ".join(AUDIO_EXT))
    nm = (name or os.path.splitext(os.path.basename(path))[0].replace("_", " ").replace("-", " ")).strip()
    tid = "m-%s-%s" % (_slug(nm), _file_sha1(path)[:6])
    os.makedirs(MUSIC_DIR, exist_ok=True)
    dest = os.path.join(MUSIC_DIR, tid + ext)
    if os.path.abspath(path) != os.path.abspath(dest):
        shutil.copyfile(path, dest)
    facts = measure(dest)
    with _lock:
        lib = load_lib()
        old = next((t for t in lib["tracks"] if t.get("id") == tid), None)
        row = dict(old or {})
        row.update({"id": tid, "name": (old or {}).get("name") or nm, "file": dest})
        row.setdefault("source", "local")
        row.setdefault("license", "Nhạc của bạn — bạn tự đảm bảo quyền sử dụng")
        for k, v in (meta or {}).items():
            if v not in (None, ""):
                row[k] = v
        row.update({k: v for k, v in facts.items() if v is not None})
        row.setdefault("added_at", time.strftime("%Y-%m-%dT%H:%M:%S"))
        lib["tracks"] = [t for t in lib["tracks"] if t.get("id") != tid] + [row]
        save_lib(lib)
    return row


def update(tid, name=None, use_when=None, disabled=None):
    def fn(t):
        if name and str(name).strip():
            t["name"] = str(name).strip()
        if use_when is not None and str(use_when).strip():
            t["use_when"] = str(use_when).strip()
        if disabled is not None:
            t["disabled"] = bool(disabled)
    return _update(tid, fn)


def delete(tid):
    with _lock:
        lib = load_lib()
        for t in lib.get("tracks", []):
            if t.get("id") == tid and os.path.isfile(t.get("file") or ""):
                try:
                    os.remove(t["file"])
                except OSError:
                    pass
        n = len(lib["tracks"])
        lib["tracks"] = [t for t in lib["tracks"] if t.get("id") != tid]
        save_lib(lib)
        return len(lib["tracks"]) < n


# ---------------------------------------------------------------------------
# GEMINI NGHE + GAN NHAN
# ---------------------------------------------------------------------------
def _gemini_copy(t):
    """Ban NEN (mono 48 kbps mp3) de gui Gemini: bai 3 phut ~1 MB thay vi 5-8 MB. Loi -> file goc."""
    src = t["file"]
    try:
        os.makedirs(GEMINI_CACHE, exist_ok=True)
        st = os.stat(src)
        key = hashlib.sha1(("%s|%s|%s" % (src, st.st_size, int(st.st_mtime))).encode()).hexdigest()[:16]
        out = os.path.join(GEMINI_CACHE, key + ".mp3")
        if not os.path.isfile(out):
            import winsupport
            tmp = out + ".part.mp3"
            r = subprocess.run([winsupport.ffbin("ffmpeg"), "-y", "-v", "error", "-i", src, "-vn", "-ac", "1",
                                "-ar", "22050", "-b:a", "48k", tmp], capture_output=True, text=True, timeout=300)
            if r.returncode != 0 or not os.path.isfile(tmp):
                return src
            os.replace(tmp, out)
        return out
    except Exception:
        return src


def _as_text(v):
    import meme_lib
    return meme_lib.as_text(v)


def _as_list(v):
    import meme_lib
    return meme_lib.as_list(v)


def _norm_label(r, dur):
    """Nhan Gemini -> truong chuan cua kho (chon gia tri trong tap cho phep, so trong khoang hop le)."""
    out = {}
    for k in ("summary", "vocals_note", "speech_note", "use_when", "structure"):
        v = _as_text(r.get(k))
        if v:
            out[k] = v
    g = _as_text(r.get("genre")).lower()
    out["genre"] = g or "other"
    for k, ok in (("energy", ("thap", "vua", "cao")), ("tempo", ("cham", "vua", "nhanh")),
                  ("speech_friendly", ("tot", "vua", "kem"))):
        v = _as_text(r.get(k)).lower()
        v = {"thấp": "thap", "vừa": "vua", "chậm": "cham", "tốt": "tot", "kém": "kem"}.get(v, v)
        if v in ok:
            out[k] = v
    for k in ("moods", "instruments", "avoid_when", "tags"):
        out[k] = _as_list(r.get(k))
    out["has_vocals"] = bool(r.get("has_vocals"))
    try:
        bpm = int(round(float(r.get("bpm"))))
        if 40 <= bpm <= 220:
            out["bpm"] = bpm
    except (TypeError, ValueError):
        pass
    try:
        bs = float(r.get("best_start") or 0)
    except (TypeError, ValueError):
        bs = 0.0
    lim = max(0.0, (dur or 0) - 30.0)
    out["best_start"] = round(_clamp(bs, 0.0, lim), 1) if dur else 0.0
    return out


def label_with_ai(ids, log=None):
    """Cho Gemini NGHE cac bai (nhom LABEL_BATCH) roi ghi nhan. Tra {"updated": [muc], "failed": [{id, error}]}.
    Ten bai user dat giu nguyen."""
    import providers
    rows = {t["id"]: t for t in list_tracks()}
    todo, failed = [], []
    for tid in ids or []:
        t = rows.get(tid)
        if not t:
            failed.append({"id": tid, "error": "khong co trong kho"})
        elif not os.path.isfile(t.get("file") or ""):
            failed.append({"id": tid, "error": "mat file: %s" % t.get("file")})
        else:
            todo.append(t)
    labels, facts = {}, {}
    for i in range(0, len(todo), LABEL_BATCH):
        nhom = todo[i:i + LABEL_BATCH]
        for t in nhom:
            f = measure(t["file"])
            facts[t["id"]] = f
        specs = [{"id": t["id"], "path": _gemini_copy(t), "name": t.get("name") or t["id"],
                  "duration": facts[t["id"]].get("duration") or t.get("duration")} for t in nhom]
        prompt = _p("_GEMINI_MUSIC_PROMPT") + "\n\nDANH SACH FILE (dung thu tu dinh kem):\n" + "\n".join(
            "%d. id=%s | ten trong kho: %s | dai %.1fs" % (k + 1, s["id"], s["name"], float(s.get("duration") or 0))
            for k, s in enumerate(specs))
        try:
            res = providers._gemini_analyze_videos(specs, prompt, "FILE NHAC NEN", log=log, step_label="Gemini-music")
        except Exception as ex:
            msg = str(ex).split("\n")[0][:300]
            failed += [{"id": t["id"], "error": msg} for t in nhom]
            continue
        got = res.get("tracks") if isinstance(res, dict) else None
        if not isinstance(got, list) and isinstance(res, dict) and res.get("id"):
            got = [res]
        ids_n = [s["id"] for s in specs]
        seen = set()
        for k, r in enumerate(got or []):
            if not isinstance(r, dict):
                continue
            rid = r.get("id")
            if rid not in ids_n and k < len(ids_n):
                rid = ids_n[k]          # model chep sai id -> khop theo thu tu
            if rid in ids_n and rid not in seen:
                seen.add(rid)
                labels[rid] = r
        failed += [{"id": t["id"], "error": "Gemini khong tra nhan cho bai nay"} for t in nhom if t["id"] not in seen]
    updated = []
    with _lock:
        lib = load_lib()             # doc lai: user co the vua sua / xoa trong luc Gemini nghe
        for t in lib.get("tracks", []):
            r = labels.get(t["id"])
            if not r:
                continue
            f = facts.get(t["id"]) or {}
            t.update({k: v for k, v in f.items() if v is not None})
            for k in ("summary", "vocals_note", "speech_note", "use_when", "structure", "bpm"):
                t.pop(k, None)
            t.update(_norm_label(r, t.get("duration")))
            t["labeled_by"] = "gemini"
            t["labeled_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            updated.append(t)
        save_lib(lib)
    return {"updated": updated, "failed": failed}


# ---------------------------------------------------------------------------
# DANH MUC CHO AI LAP KE HOACH + CHON BAI
# ---------------------------------------------------------------------------
# GON (user 10-05: ~30 bai, khong lam nang B7): bo nhac cu / bpm / do dai — khong giup chon bai theo noi dung
_PLAN_KEYS = ("summary", "genre", "moods", "energy", "tempo", "has_vocals", "speech_friendly", "use_when", "avoid_when")


def usable():
    """Bai dung duoc khi lap ke hoach: co file, khong tat, da co nhan (Gemini nghe hoac user viet 'dung khi'),
    du dai."""
    out = []
    for t in list_tracks():
        if t.get("disabled") or not os.path.isfile(t.get("file") or ""):
            continue
        if t.get("labeled_by") != "gemini" and not t.get("use_when"):
            continue
        if (t.get("duration") or 0) < MIN_TRACK_SEC:
            continue
        out.append(t)
    return out


def catalog_for_plan(rows=None):
    """Danh muc GON (khong duong dan) cho B7. Rong khi tat 'tu them nhac nen' hoac kho chua co bai dung duoc."""
    if not settings().get("auto"):
        return []
    rows = usable() if rows is None else rows
    cat = []
    for t in rows:
        row = {"id": t["id"], "name": t.get("name")}
        for k in _PLAN_KEYS:
            v = t.get(k)
            if v not in (None, "", []) or (k == "has_vocals" and v is False):
                row[k] = v
        cat.append(row)
    return cat


def catalog_fp(cat):
    return hashlib.sha1(json.dumps(cat, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:12]


def rule_text(cat):
    return _p("_MUSIC_RULE").replace("{pct}", "%g" % voice_pct()) + json.dumps(cat, ensure_ascii=False)


def source_music(brief):
    """Y kien Gemini (Hieu nguon) ve nhac nen CO SAN trong video goc: [{source_id, co, muc, mo_ta}] (rong neu ban
    phan tich cu chua co truong nay)."""
    out = []
    for src in (brief or {}).get("sources") or []:
        m = src.get("nhac_nen") if isinstance(src, dict) else None
        if isinstance(m, dict) and "co" in m:
            out.append({"source_id": src.get("id"), "co": bool(m.get("co")), "muc": m.get("muc"),
                        "mo_ta": m.get("mo_ta")})
    return out


GEMINI_NOTE = """

# BO SUNG (he thong): NHAC NEN CO SAN trong TUNG video
Them vao MOI muc trong "sources" truong:
"nhac_nen": {"co": true/false, "muc": "nho|vua|to", "mo_ta": "the loai / doan nao co nhac (giay)"}
"co" = true khi video goc DA CO nhac nen chay duoi / xen giua loi noi (khong tinh tieng on moi truong)."""


_WORD = re.compile(r"\w+", re.UNICODE)


def _toks(s):
    import unicodedata
    s = unicodedata.normalize("NFD", str(s or "").lower().replace("đ", "d"))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return set(w for w in _WORD.findall(s) if len(w) > 1)


def _score(t, ctx_toks, want_energy):
    blob = " ".join([_as_text(t.get("summary")), _as_text(t.get("use_when")), " ".join(t.get("moods") or []),
                     " ".join(t.get("tags") or []), _as_text(t.get("genre"))])
    sc = len(_toks(blob) & ctx_toks) * 1.0
    av = _toks(" ".join(t.get("avoid_when") or []))
    sc -= 0.5 * len(av & ctx_toks)
    sc += {"tot": 3.0, "vua": 1.0, "kem": -3.0}.get(t.get("speech_friendly"), 0.0)
    if t.get("has_vocals"):
        sc -= 4.0
    if want_energy and t.get("energy") == want_energy:
        sc += 2.0
    return sc


def _want_energy(story):
    blob = _toks(json.dumps(story or {}, ensure_ascii=False))
    if blob & {"hai", "vui", "nang", "dong", "soi", "nhanh", "ban", "sale", "khuyen", "hype"}:
        return "vua" if not blob & {"nhanh", "hype", "soi"} else "cao"
    if blob & {"tam", "su", "buon", "nhe", "nhang", "chia", "sau", "lang"}:
        return "thap"
    return "vua"


def code_choice(story, cat_rows):
    """AI khong tra / tra id sai -> code chon bai hop nhat theo nhan (khop tu voi cau chuyen + tone, uu tien nen
    hop giong noi, khong loi hat, dung muc nang luong). Tra track (muc kho) hoac None."""
    if not cat_rows:
        return None
    ctx = _toks(json.dumps(story or {}, ensure_ascii=False))
    want = _want_energy(story)
    best = max(cat_rows, key=lambda t: (_score(t, ctx, want), t["id"]))
    return best


def choose(ai_music, cat_rows, story=None, emit=None):
    """Ket qua khoa "music" cua B7 -> plan["music"] = {track_id, name, ly_do, by} | {track_id: None, ly_do, by}
    | None (kho trong / tat). AI bo qua khoa / id sai -> code chon."""
    if not cat_rows:
        return None
    by_id = {t["id"]: t for t in cat_rows}
    m = ai_music if isinstance(ai_music, dict) else None
    if m is not None and "track_id" in m and not m.get("track_id"):
        ly = _as_text(m.get("ly_do")) or "AI không dùng nhạc nền"
        if emit:
            emit("Nhạc nền: AI chọn KHÔNG dùng — %s" % ly, "warn")
        return {"track_id": None, "ly_do": ly, "by": "ai"}
    t = by_id.get((m or {}).get("track_id"))
    if t is not None:
        res = {"track_id": t["id"], "name": t.get("name"), "ly_do": _as_text(m.get("ly_do")), "by": "ai"}
    else:
        t = code_choice(story, cat_rows)
        why = "AI không chọn bài" if m is None else "AI chọn id không có trong kho (%s)" % (m or {}).get("track_id")
        res = {"track_id": t["id"], "name": t.get("name"), "by": "code",
               "ly_do": "%s -> hệ thống chọn bài hợp nhãn nhất với câu chuyện / tone" % why}
    if emit:
        emit("Nhạc nền: '%s' — %s" % (res["name"], res["ly_do"]),
             "ok" if res["by"] == "ai" else "warn")
    return res


# ---------------------------------------------------------------------------
# DUNG: plan["music"] -> spec audio (role bgm) + duong am luong
# ---------------------------------------------------------------------------
def _ranges_union(rows):
    rows = sorted((a, b) for a, b in rows if b > a)
    out = []
    for a, b in rows:
        if out and a <= out[-1][1] + 1e-6:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


def _in(rows, t):
    for a, b in rows:
        if a <= t < b:
            return True
    return False


def _simplify(pts, tol=ENV_TOL):
    """Rut gon chuoi diem (t, v): bo diem nam tren duong thang noi 2 diem giu lai (sai so <= tol x gia tri, ~0.5 dB)."""
    if len(pts) <= 2:
        return pts
    keep = [pts[0]]
    i = 0
    n = len(pts)
    while i < n - 1:
        j = i + 1
        while j + 1 < n:
            (ta, va), (tb, vb) = pts[i], pts[j + 1]
            ok = True
            for k in range(i + 1, j + 1):
                tk, vk = pts[k]
                lin = va + (vb - va) * (tk - ta) / max(1e-9, tb - ta)
                if abs(lin - vk) > max(1e-4, tol * vk):
                    ok = False
                    break
            if not ok:
                break
            j += 1
        keep.append(pts[j])
        i = j
    return keep


def _envelope(t0, t1, base_db, inserts, overlays, fade_in, fade_out):
    """Duong am luong (dB tuong doi base) tren [t0, t1], gio TIMELINE -> [(t tuong doi, gain tuyen tinh)]. Muc nen giu
    DUNG quy tac (% tieng nguoi) suot video; chi ha khi meme co tieng rieng + fade 2 dau."""
    n = max(2, int(math.ceil((t1 - t0) / ENV_STEP)) + 1)
    ts = [min(t1, t0 + i * ENV_STEP) for i in range(n)]
    tgt = []
    for t in ts:
        d = 0.0
        if _in(inserts, t):
            d = INSERT_DUCK_DB
        elif _in(overlays, t):
            d = OVERLAY_DUCK_DB
        tgt.append(d)
    # lam muot: xuong nhanh (0.12s), len cham (0.5s)
    sm, cur = [], tgt[0]
    for d in tgt:
        tau = 0.12 if d < cur else 0.5
        a = 1.0 - math.exp(-ENV_STEP / tau)
        cur = cur + (d - cur) * a
        sm.append(cur)
    pts = []
    for t, d in zip(ts, sm):
        g = 10 ** ((base_db + d) / 20.0)
        rel = t - t0
        if fade_in > 0 and rel < fade_in:
            g *= max(0.0, rel / fade_in)
        if fade_out > 0 and t1 - t < fade_out:
            g *= max(0.0, (t1 - t) / fade_out)
        pts.append((round(rel, 3), round(min(1.0, max(0.0, g)), 4)))
    return [list(x) for x in _simplify(pts)]


def _track_level(path, s0, s1, fallback):
    """Do to bai trong doan dung = NANG LUONG TRUNG BINH cua LUFS momentary (~ LUFS I): nhac nen la lop LIEN TUC, nguoi
    nghe cam theo muc trung binh. (Truoc 10-06 lay p90 = cho to nhat -> bai beat thua nhip bi dat qua nho.)"""
    try:
        import numpy as np
        import speech_cut
        arr = speech_cut.loudness_series(path)
        if arr is not None:
            v = arr[int(s0 / speech_cut.LOUD_HOP):int(s1 / speech_cut.LOUD_HOP) + 1]
            v = v[v > -70]
            if v.size:
                return round(float(10 * np.log10(np.mean(10 ** (v / 10.0)))), 1)
    except Exception:
        pass
    return fallback


def plan_rows(p, spec, changes):
    """plan["music"] -> cac DOAN nhac tren timeline [{start, srcStart, srcEnd, env, rel...}] (bai ngan -> nhieu doan
    cross-fade). env = duong am luong [giay tinh tu start, gain]. Khong co / bai mat -> []."""
    m = p.get("music") if isinstance(p.get("music"), dict) else None
    if not m or not m.get("track_id"):
        return []
    t = get(m["track_id"])
    if t is None or not os.path.isfile(t.get("file") or ""):
        path = m.get("file") if os.path.isfile(m.get("file") or "") else None
        if not path:
            changes.append("nhac nen '%s': bai khong con trong kho -> bo nhac" % (m.get("name") or m["track_id"]))
            return []
        t = {"id": m["track_id"], "name": m.get("name"), "file": path}
    if t.get("disabled"):
        changes.append("nhac nen '%s': bai da tat trong kho -> bo nhac" % t.get("name"))
        return []
    dur = float(spec.get("duration") or 0)
    clips = spec.get("clips") or []
    # LUAT (user 2026-10-05): KHONG co nhac o HOOK -> bat dau khi hook ket thuc
    t0 = max([float(c.get("end") or 0) for c in clips if c.get("kind") == "hook"] or [0.0])
    if dur - t0 < MIN_MUSIC_SEC:
        changes.append("nhac nen: phan sau hook chi %.1fs -> khong dat nhac" % (dur - t0))
        return []
    tlen = float(t.get("duration") or 0) or None
    if tlen is None:
        tlen = measure(t["file"]).get("duration")
    if not tlen or tlen < 3:
        changes.append("nhac nen '%s': khong doc duoc do dai bai -> bo nhac" % t.get("name"))
        return []
    loop_from = _clamp(float(t.get("best_start") or 0.0), 0.0, max(0.0, tlen - 10.0))
    # QUY TAC (user 10-06): nhac nen = MUSIC_VOICE_PCT % tieng nguoi cua chinh video
    voice = p.get("_voice_lufs")
    pct = voice_pct()
    target = (float(voice) if voice is not None else ABS_VOICE) + rel_db()
    # timeline: meme cat vao / meme de len co tieng
    inserts = [(float(c["start"]), float(c["end"])) for c in clips if c.get("kind") == "insert"]
    overlays = [(float(o["start"]), float(o["end"])) for o in spec.get("overlays") or []
                if float(o.get("volume") or 0) > 0.05]
    rows, cur, src, k = [], t0, loop_from, 0
    while cur < dur - 0.5 and k < 12:
        avail = tlen - src
        need = dur - cur
        if avail >= need:
            seg_end, last = src + need, True
        else:
            seg_end, last = tlen, False
        span = seg_end - src
        lvl = _track_level(t["file"], src, seg_end, t.get("lufs_i"))
        base_db = (target - float(lvl)) if lvl is not None else (target - ABS_VOICE)
        fi = FADE_IN if k == 0 else XFADE
        fo = FADE_OUT if last else XFADE
        env = _envelope(cur, cur + span, base_db, inserts, overlays, fi, fo)
        row = {"id": "bgm%d" % k, "path": t["file"], "start": round(cur, 3),
               "volume": round(max(v for _, v in env), 4), "srcStart": round(src, 3), "srcEnd": round(seg_end, 3),
               "role": "bgm", "name": t.get("name") or t["id"], "env": env}
        if voice is not None and lvl is not None:
            row["rel"] = round(float(lvl) + 20 * math.log10(max(1e-4, min(1.0, 10 ** (base_db / 20.0)))) - voice, 1)
        rows.append(row)
        if last:
            break
        cur = cur + span - XFADE
        src = loop_from
        k += 1
    if rows:
        changes.append("nhac nen '%s': %.1fs -> %.1fs (sau hook), = %g%% tieng nguoi (%s)%s" % (
            t.get("name"), t0, dur, pct, ("%.1f dB so voi giong" % rows[0]["rel"]) if rows[0].get("rel") is not None
            else "khong do duoc giong -> coi giong %.0f LUFS" % ABS_VOICE,
            ", noi bai %d lan" % (len(rows) - 1) if len(rows) > 1 else ""))
    return rows


def _decode(path, s0, s1):
    """Doan [s0, s1] cua file -> mang float32 (n, 2) o MIX_SR."""
    import numpy as np
    import winsupport
    r = subprocess.run([winsupport.ffbin("ffmpeg"), "-v", "error", "-ss", "%.3f" % s0, "-t", "%.3f" % max(0.0, s1 - s0),
                        "-i", path, "-vn", "-ac", "2", "-ar", str(MIX_SR), "-f", "f32le", "-"],
                       capture_output=True, timeout=300)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or b"").decode("utf-8", "replace")[-200:] or "ffmpeg loi")
    return np.frombuffer(r.stdout, dtype=np.float32).reshape(-1, 2)


def premix(rows):
    """TRON SAN cac doan nhac (cat, duong am luong, cross-fade) thanh 1 file WAV (cache theo noi dung) -> (path, do dai).

    Vi sao: Remotion LAM TRON volume toi 0.01 khi render — nhac nen nho (~0.05) moi bac lech ~2 dB (do tren render
    that: sau khoang lang nhac nho hon truoc 2 dB du duong am luong phang). Tron san thi Remotion phat volume 1.0."""
    import wave
    import numpy as np
    t0 = rows[0]["start"]
    end = max(r["start"] + r["srcEnd"] - r["srcStart"] for r in rows)
    parts = []
    for r in rows:
        stt = os.stat(r["path"])
        parts.append([r["path"], stt.st_size, int(stt.st_mtime), r["start"], r["srcStart"], r["srcEnd"], r["env"]])
    key = hashlib.sha1(json.dumps([MIX_VERSION, MIX_SR, parts]).encode("utf-8")).hexdigest()[:16]
    out = os.path.join(MIX_DIR, "bgm-%s.wav" % key)
    if os.path.isfile(out):
        return out, round(end - t0, 3)
    n = int(round((end - t0) * MIX_SR))
    buf = np.zeros((n, 2), dtype=np.float32)
    for r in rows:
        a = _decode(r["path"], r["srcStart"], r["srcEnd"])
        off = int(round((r["start"] - t0) * MIX_SR))
        m = max(0, min(len(a), n - off))
        if not m:
            continue
        g = np.interp(np.arange(m) / MIX_SR, [e[0] for e in r["env"]], [e[1] for e in r["env"]]).astype(np.float32)
        buf[off:off + m] += a[:m] * g[:, None]
    pcm = (np.clip(buf, -1.0, 1.0) * 32767.0).round().astype("<i2")
    os.makedirs(MIX_DIR, exist_ok=True)
    tmp = out + ".part"
    with wave.open(tmp, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(MIX_SR)
        w.writeframes(pcm.tobytes())
    os.replace(tmp, out)
    return out, round(end - t0, 3)


def to_spec(p, spec, changes):
    """plan["music"] -> 1 dong spec audio role "bgm" = file nhac DA TRON SAN (volume 1.0). Tron loi -> cac doan goc kem
    `env` (renderer tu noi suy, chinh xac kem hon vi Remotion lam tron volume). Khong co nhac -> []."""
    rows = plan_rows(p, spec, changes)
    if not rows:
        return []
    try:
        path, length = premix(rows)
    except Exception as ex:
        changes.append("nhac nen: khong tron san duoc (%s) -> phat tung doan theo duong am luong" % str(ex)[:120])
        return rows
    row = {"id": "bgm0", "path": path, "start": rows[0]["start"], "volume": 1.0, "srcStart": 0.0, "srcEnd": length,
           "role": "bgm", "name": rows[0]["name"]}
    if rows[0].get("rel") is not None:
        row["rel"] = rows[0]["rel"]
    return [row]


def mix_preview(tid, voice_lufs=-16.0):
    """Nghe thu o UI: volume (0..1) phat bai o dung quy tac (% tieng nguoi) so voi mot giong noi mau (voice_lufs)."""
    t = get(tid)
    if not t:
        return None
    lvl = t.get("lufs_i")
    if lvl is None:
        lvl = measure(t.get("file")).get("lufs_i")
    if lvl is None:
        return None
    target = voice_lufs + rel_db()
    return round(min(1.0, 10 ** ((target - float(lvl)) / 20.0)), 4)
