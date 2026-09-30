#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kho SFX + kho meme (file ngoai) cho luong Video Remotion: nhap / tim / gan nhan,
catalog gon cho GPT, va doi sfx_id / meme_id trong plan thanh file that."""
import os
import re
import json
import subprocess

from config import venv_python, ENGINE_HOME

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, "scripts")
ASSETS = os.path.join(HERE, "assets")
SFX_INDEX = os.path.join(ASSETS, "sfx_index.json")


def _run(cmd, cwd=None, timeout=1800):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout or "", p.stderr or ""


# ----------------------------------------------------------------------------
# KHO SFX (local library) — luu o ~/.capcut-studio/sfx/ + sfx_library.json
# Chong roi: moi SFX co `use_when` (khi nao dung) + emotion; catalog cho GPT nho gon.
# ----------------------------------------------------------------------------
SFX_DIR = os.path.join(ENGINE_HOME, "sfx")
SFX_LIB = os.path.join(ENGINE_HOME, "sfx_library.json")

# Tu doan emotion + use_when tu ten file (giup GPT biet KHI NAO dung)
_SFX_RULES = [
    (["boom", "vine", "bass", "explos", "bruh", "dun dun", "drama", "impact", "gun", "punch", "slap"],
     "punch", "Cau chot manh / cu twist / nhan punchline / cao trao"),
    (["whoosh", "swoosh", "swipe", "transition", "woosh"],
     "neutral", "Chuyen canh / cat nhanh giua 2 doan"),
    (["ding", "ting", "bell", "coin", "cash", "money", "success", "correct", "level", "win", "tada", "sparkle", "magic", "yay"],
     "positive", "Reveal so lieu / diem tich cuc / thanh cong / tien"),
    (["fail", "wrong", "buzzer", "error", "womp", "sad", "aww", "no ", "oof"],
     "negative", "That bai / sai / tut / tinh huong xau"),
    (["retro", "vhs", "old", "vintage", "8bit", "8-bit"],
     "nostalgic", "Hoai niem / ke chuyen cu"),
    (["laugh", "cricket", "fart", "meme", "wow", "huh", "what"],
     "punch", "Khoanh khac hai / pattern-interrupt"),
]


def _guess_sfx_meta(name):
    n = (name or "").lower()
    for keys, emo, use in _SFX_RULES:
        if any(k in n for k in keys):
            return emo, use
    return "neutral", "Diem nhan chung (dung tiet che)"


def _load_lib():
    if os.path.isfile(SFX_LIB):
        try:
            with open(SFX_LIB, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {"sfx": []}
    return {"sfx": []}


def _save_lib(lib):
    os.makedirs(ENGINE_HOME, exist_ok=True)
    with open(SFX_LIB, "w", encoding="utf-8") as f:
        json.dump(lib, f, ensure_ascii=False, indent=2)


def _sfx_id(name):
    base = re.sub(r"[^\w\-]+", "-", (name or "sfx").lower()).strip("-")[:32] or "sfx"
    import hashlib
    h = hashlib.md5((name or "").encode()).hexdigest()[:6]
    return "%s-%s" % (base, h)


def sfx_list():
    return _load_lib().get("sfx", [])


def find_sfx(emotion=None, search=None, limit=50):
    rows = sfx_list()

    def keep(e):
        if emotion and e.get("emotion") != emotion:
            return False
        if search:
            q = search.lower()
            blob = (e.get("name", "") + " " + " ".join(e.get("tags", [])) + " " + e.get("use_when", "")).lower()
            if q not in blob:
                return False
        return True

    return [e for e in rows if keep(e)][:limit]


# ----------------------------------------------------------------------------
# DO TO NHO CUA FILE SFX (de chuan hoa cuong do)
# ----------------------------------------------------------------------------
# Ly do: AI khong NGHE duoc file. Hai file SFX trong kho co the lech nhau 10-15 dB
# (do duoc 2026-09-24: 10-diem = -12.4 LUFS, among-us = -20.7 LUFS). Cung dat
# volume 0.8 thi mot cai dinh tai, mot cai nghe khong thay. Do mot lan roi luu
# vao kho -> plan_guard tu tinh he so cho moi tieng nghe deu nhau.
def measure_loudness(path):
    """Do to cua mot file SFX: MUC TO NHAT trong cua so 400ms (momentary max, LUFS).

    Khong dung "integrated" (I): SFX la tieng NGAN, phan con lai cua file thuong
    la im lang nen I bi keo tut xuong va khong noi len duoc cu dam nghe to the nao.
    Do duoc 2026-09-24: Anime Wow I=-15.3 nhung M=-11.6; Fart thi I=-70 (bi gating
    loai het) trong khi peak chi -1.4 dBFS. Momentary max phan anh dung "no danh
    manh the nao" — dung cai do de can cuong do.
    Thu tu lui: momentary max -> integrated -> mean_volume -> peak.
    """
    import subprocess
    if not path or not os.path.isfile(path):
        return None
    for ff in (os.path.expanduser("~/.local/bin/ffmpeg"), "ffmpeg"):
        try:
            r = subprocess.run([ff, "-nostats", "-hide_banner", "-i", path,
                                "-filter_complex", "ebur128=peak=true", "-f", "null", "-"],
                               capture_output=True, text=True, timeout=120)
        except Exception:
            continue
        err = r.stderr or ""
        ms = [float(x) for x in re.findall(r"M:\s*(-?\d+\.?\d*)", err)]
        ms = [x for x in ms if x > -70]
        if ms:
            return round(max(ms), 1)
        for pat in (r"I:\s*(-?\d+\.?\d*)\s*LUFS", r"mean_volume:\s*(-?\d+\.?\d*) dB"):
            m = [float(x) for x in re.findall(pat, err)]
            m = [x for x in m if x > -70]
            if m:
                return round(m[-1], 1)
        m = [float(x) for x in re.findall(r"Peak:\s*(-?\d+\.?\d*)\s*dBFS", err)]
        if m:
            # Chi con peak: tru bot ~8 dB de xap xi muc "nghe thay" cua mot tieng ngan
            return round(max(m) - 8.0, 1)
    return None


def sfx_loudness(entry, do_thu=True):
    """Do to (momentary max, LUFS) cua mot muc trong kho SFX. Do va luu lai neu chua co."""
    if entry.get("lufs_m") is not None:
        return entry["lufs_m"]
    if not do_thu:
        return None
    val = measure_loudness(entry.get("file"))
    if val is None:
        return None
    lib = _load_lib()
    for e in lib.get("sfx", []):
        if e.get("id") == entry.get("id"):
            e["lufs_m"] = val
            e.pop("lufs", None)     # gia tri cu do bang "integrated" — khong dung nua
    _save_lib(lib)
    entry["lufs_m"] = val
    return val


# Truong nhan (Gemini nghe file + code do am thanh) dua vao catalog cho AI lap plan, theo thu tu nay
_SFX_PLAN_KEYS = ("summary", "sound_type", "has_speech", "speech_text", "intensity", "avoid_when",
                  "duration", "peak_time")


def sfx_catalog_for_plan(limit=None):
    """Catalog GON cho AI lap plan (KHONG path): id + name + emotion + use_when + nhan Gemini da nghe.

    Truoc 2026-09-27 cat o 24 muc dau -> kho 51 muc thi 27 muc AI khong bao gio thay. Muc
    gon (~60-120 token) nen gui ca kho; `limit` chi de phong kho rat lon."""
    rows = sfx_list()
    if limit:
        # uu tien muc AI da nghe (nhan chuan) khi phai cat
        rows = sorted(rows, key=lambda e: e.get("labeled_by") != "gemini")[:limit]
    out = []
    for e in rows:
        row = {"id": e["id"], "name": e["name"], "emotion": e.get("emotion", "neutral"),
               "use_when": e.get("use_when", "")}
        for k in _SFX_PLAN_KEYS:
            if k == "peak_time" and e.get("has_speech"):
                continue      # giong noi: luc to nhat khong phai "cu dam" de canh (vd tieng thet o cuoi cau)
            if e.get(k) not in (None, "", [], False) or (k == "has_speech" and e.get(k) is False):
                row[k] = e[k]
        out.append(row)
    return out


def sfx_audio_facts(path):
    """Do bang AM THANH THAT (khong hoi AI): do dai file, luc bat dau co tieng, luc to nhat.
    peak_time = giua cua so 50ms to nhat — de dat SFX sao cho CU DAM roi dung cho can nhan."""
    try:
        import numpy as np
        import speech_cut
        db = speech_cut.energy(path)
    except Exception:
        db = None
    if db is None or not len(db):
        return {}
    hop = speech_cut.HOP
    win = 5
    sm = np.convolve(db, np.ones(win) / win, mode="same") if len(db) >= win else db
    k = int(np.argmax(sm))
    loud = float(sm[k])
    on = np.nonzero(db > loud - 30)[0]
    return {"duration": round(len(db) * hop, 2), "peak_time": round(k * hop, 2),
            "onset": round(float(on[0]) * hop, 2) if on.size else 0.0}


SFX_LABEL_BATCH = 5      # so file gui Gemini 1 luot (do that: 5 file ~55s qua agy, nhan dung tung id)


def sfx_label_with_ai(ids, log=None):
    """Cho Gemini NGHE cac SFX (theo nhom SFX_LABEL_BATCH) roi ghi nhan vao kho.
    Tra {"updated": [muc], "failed": [{id, error}]}. Ten user dat trong kho giu nguyen."""
    import time
    import providers
    lib = _load_lib()
    rows = {e["id"]: e for e in lib.get("sfx", [])}
    todo, failed = [], []
    for sid in ids or []:
        e = rows.get(sid)
        if not e:
            failed.append({"id": sid, "error": "khong co trong kho"})
        elif not os.path.isfile(e.get("file", "")):
            failed.append({"id": sid, "error": "mat file: %s" % e.get("file")})
        else:
            todo.append(e)
    labels, facts = {}, {}
    for i in range(0, len(todo), SFX_LABEL_BATCH):
        nhom = todo[i:i + SFX_LABEL_BATCH]
        for e in nhom:
            facts[e["id"]] = sfx_audio_facts(e["file"])
        try:
            got = providers.gemini_label_sfx(
                [{"id": e["id"], "name": e.get("name"), "path": e["file"],
                  "duration": facts[e["id"]].get("duration")} for e in nhom], log=log)
        except Exception as ex:
            msg = str(ex).split("\n")[0][:300]
            failed += [{"id": e["id"], "error": msg} for e in nhom]
            continue
        labels.update(got)
        failed += [{"id": e["id"], "error": "Gemini khong tra nhan cho file nay"} for e in nhom if e["id"] not in got]
    # Doc lai kho TRUOC khi ghi (nguoi dung co the vua sua/xoa trong luc Gemini dang nghe)
    lib = _load_lib()
    updated = []
    for e in lib.get("sfx", []):
        r = labels.get(e["id"])
        if not r:
            continue
        emo = r.get("emotion")
        e["emotion"] = emo if emo in meme_lib.EMOTIONS else e.get("emotion", "neutral")
        e["use_when"] = meme_lib.as_text(r.get("use_when")) or e.get("use_when", "")
        for k in ("summary", "sound_type", "speech_text", "intensity"):
            v = meme_lib.as_text(r.get(k))
            if v:
                e[k] = v
            else:
                e.pop(k, None)
        e["has_speech"] = bool(r.get("has_speech"))
        e["avoid_when"] = meme_lib.as_list(r.get("avoid_when"))
        e["tags"] = meme_lib.as_list(r.get("tags")) or e.get("tags", [])
        for k in ("duration", "peak_time", "onset"):
            if facts.get(e["id"], {}).get(k) is not None:
                e[k] = facts[e["id"]][k]
        e["labeled_by"] = "gemini"
        e["labeled_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        updated.append(e)
    _save_lib(lib)
    for e in updated:
        sfx_loudness(e)       # do to luon neu chua co (can cuong do SFX)
    return {"updated": updated, "failed": failed}


def myinstants_search(query, limit=12):
    """Tim SFX tren Myinstants. Tra [{name, mp3, slug, emotion, use_when, license}]."""
    import requests
    try:
        r = requests.get("https://www.myinstants.com/api/v1/instants/",
                         params={"name": query}, headers={"User-Agent": "Mozilla/5.0"}, timeout=20)
        r.raise_for_status()
        out = []
        for it in r.json().get("results", [])[:limit]:
            name = it.get("name") or ""
            emo, use = _guess_sfx_meta(name)
            out.append({
                "name": name, "mp3": it.get("sound"), "slug": it.get("slug"),
                "emotion": emo, "use_when": use,
                "license": "Co the co ban quyen — chi dung noi dung ca nhan/meme",
            })
        return out
    except Exception as e:
        return {"error": str(e)[:200]}


def sfx_add_online(name, mp3_url, slug=None, emotion=None, use_when=None):
    """Tai 1 SFX tu URL ve kho + ghi index."""
    import requests
    os.makedirs(SFX_DIR, exist_ok=True)
    sid = _sfx_id(slug or name)
    dest = os.path.join(SFX_DIR, sid + ".mp3")
    r = requests.get(mp3_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=60)
    r.raise_for_status()
    with open(dest, "wb") as f:
        f.write(r.content)
    emo, use = _guess_sfx_meta(name)
    entry = {"id": sid, "name": name, "file": dest, "source": "myinstants",
             "emotion": emotion or emo, "use_when": use_when or use, "tags": []}
    lib = _load_lib()
    lib["sfx"] = [e for e in lib.get("sfx", []) if e["id"] != sid] + [entry]
    _save_lib(lib)
    return entry


def sfx_import_local(path, name=None, emotion=None, use_when=None):
    import shutil
    if not os.path.isfile(path):
        raise RuntimeError("Khong thay file: %s" % path)
    os.makedirs(SFX_DIR, exist_ok=True)
    nm = name or os.path.splitext(os.path.basename(path))[0]
    sid = _sfx_id(nm)
    ext = os.path.splitext(path)[1] or ".mp3"
    dest = os.path.join(SFX_DIR, sid + ext)
    shutil.copyfile(path, dest)
    emo, use = _guess_sfx_meta(nm)
    entry = {"id": sid, "name": nm, "file": dest, "source": "local",
             "emotion": emotion or emo, "use_when": use_when or use, "tags": []}
    lib = _load_lib()
    lib["sfx"] = [e for e in lib.get("sfx", []) if e["id"] != sid] + [entry]
    _save_lib(lib)
    return entry


def sfx_update(sid, emotion=None, name=None, use_when=None):
    lib = _load_lib()
    for e in lib.get("sfx", []):
        if e["id"] == sid:
            if emotion:
                e["emotion"] = emotion
            if name:
                e["name"] = name
            if use_when:
                e["use_when"] = use_when
    _save_lib(lib)
    return True


def sfx_delete(sid):
    lib = _load_lib()
    for e in lib.get("sfx", []):
        if e["id"] == sid and os.path.isfile(e.get("file", "")):
            try:
                os.remove(e["file"])
            except OSError:
                pass
    lib["sfx"] = [e for e in lib.get("sfx", []) if e["id"] != sid]
    _save_lib(lib)
    return True


def resolve_plan_sfx(plan, max_sfx=None, min_gap=None):
    """Doi sfx_id -> file path that trong plan.audio[]. Bo id sai, cap so luong.

    LUU Y: KHONG loc theo gian cach o day. Luc nay `start` co the chua duoc tinh
    (AI neo bang `src_time` = gio trong FILE GOC, plan_guard moi quy doi sang timeline).
    Loc gian cach o day se thay moi SFX deu o giay 0 va vut het tru cai dau.
    Viec gian cach do plan_guard lam, sau khi da co gio timeline that.
    """
    audio = plan.get("audio") or []
    if not audio:
        return plan
    if max_sfx is None:
        # cung tran voi plan_guard (nguoi dung chinh duoc trong "Prompt & quy tac")
        import plan_guard
        plan_guard.apply_overrides()
        max_sfx = plan_guard.MAX_SFX
    lib = {e["id"]: e for e in sfx_list()}
    resolved = []
    for a in audio:
        sid = a.get("sfx_id")
        if sid:
            e = lib.get(sid)
            if not e:
                continue  # id sai -> bo (khong lam vo build)
            a = dict(a)
            a["file"] = e["file"]
            # Nhan de plan_guard xep loai tieng (dam / whoosh / UI...) va do to
            # da do duoc -> tu tinh cuong do. Khong co ffmpeg thi _lufs = None
            # va guard lui ve bang cuong do theo loai.
            a["_name"] = e.get("name")
            a["_emotion"] = e.get("emotion")
            a["tags"] = a.get("tags") or e.get("tags") or []
            a["_use_when"] = e.get("use_when")
            try:
                a["_lufs"] = sfx_loudness(e)
            except Exception:
                a["_lufs"] = None
        if not a.get("file"):
            continue
        resolved.append(a)
        if len(resolved) >= max_sfx:
            break
    plan["audio"] = resolved
    return plan


# ----------------------------------------------------------------------------
# KHO MEME (b-roll chen) — bao quanh meme_lib.py
# ----------------------------------------------------------------------------
import meme_lib


def meme_fetch(urls, cookies_from=None):
    """Tai clip tu YouTube/URL ve kho. Chay bang venv cua sidecar (co yt-dlp)."""
    venv = venv_python()
    if not venv or not os.path.isfile(venv):
        raise RuntimeError("Chua cau hinh venv_python (chay Doctor truoc)")
    script = os.path.join(SCRIPTS, "meme_fetch.py")
    cmd = [venv, script, "--urls"] + list(urls)
    if cookies_from:
        cmd += ["--cookies-from-browser", cookies_from]
    os.makedirs(meme_lib.MEME_DIR, exist_ok=True)
    rc, out, err = _run(cmd, cwd=meme_lib.MEME_DIR, timeout=1800)
    added, failed = [], []
    for line in (out or "").splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            row = json.loads(line)
        except Exception:
            continue
        (added if row.get("ok") else failed).append(row)
    if rc != 0 and not added:
        raise RuntimeError((err or out or "meme_fetch loi")[-400:])
    return {"added": added, "failed": failed}


def meme_import_local(paths):
    """Them file video co san tren may vao kho (khong copy, tro thang toi file)."""
    import subprocess
    out = []
    for p in paths or []:
        if not os.path.isfile(p):
            out.append({"ok": False, "file": p, "error": "Khong thay file"})
            continue
        d = w = h = None
        for ff in (os.path.expanduser("~/.local/bin/ffprobe"), "ffprobe"):
            try:
                r = subprocess.run([ff, "-v", "error", "-select_streams", "v:0",
                                    "-show_entries", "stream=width,height:format=duration",
                                    "-of", "json", p], capture_output=True, text=True, timeout=30)
                j = json.loads(r.stdout or "{}")
                st = (j.get("streams") or [{}])[0]
                d = round(float((j.get("format") or {}).get("duration") or 0), 2)
                w, h = st.get("width"), st.get("height")
                break
            except Exception:
                continue
        row = meme_lib.register_meme(
            name=os.path.splitext(os.path.basename(p))[0], file=p,
            duration=d, width=w, height=h, source="local")
        out.append({"ok": True, **row})
    return {"added": [r for r in out if r.get("ok")],
            "failed": [r for r in out if not r.get("ok")]}


def meme_label_with_ai(mid, log=None):
    """Cho Gemini xem clip roi ghi de nhan. Tra ve ban ghi da cap nhat."""
    import providers
    row = next((m for m in meme_lib.meme_list() if m["id"] == mid), None)
    if not row:
        raise RuntimeError("Khong co meme id=%s" % mid)
    if not os.path.isfile(row.get("file", "")):
        raise RuntimeError("Mat file: %s" % row.get("file"))
    res = providers.gemini_label_meme(row["file"], row.get("name"), row.get("duration"), log=log)
    dur = float(row.get("duration") or 0)
    bs = res.get("best_start")
    be = res.get("best_end")
    try:
        bs = max(0.0, float(bs))
        be = float(be)
        if not (bs < be <= max(dur, be)):
            bs, be = 0.0, min(dur or 2.0, 2.0)
        if dur:
            be = min(be, dur)
        if be - bs > meme_lib.MAX_INSERT_SEC:
            be = bs + meme_lib.MAX_INSERT_SEC
    except (TypeError, ValueError):
        bs, be = 0.0, min(dur or 2.0, 2.0)
    # Prompt nhan meme sua duoc trong menu "Prompt & quy tac": ban moi tra use_when la MANG,
    # them reaction/role/avoid_when... Luu use_when ve CHUOI de moi cho doc cu (tim kiem,
    # o sua tay, catalog) van chay; cac truong moi luu kem neu co.
    emotion = res.get("emotion")
    if emotion not in meme_lib.EMOTIONS:
        emotion = row.get("emotion")
    updated = meme_lib.meme_update(
        mid,
        name=meme_lib.as_text(res.get("name")) or row.get("name"),
        emotion=emotion,
        use_when=meme_lib.as_text(res.get("use_when")) or row.get("use_when"),
        tags=meme_lib.as_list(res.get("tags")) or row.get("tags"),
        summary=meme_lib.as_text(res.get("summary")) or None,
        reaction=meme_lib.as_text(res.get("reaction")) or None,
        intensity=meme_lib.as_text(res.get("intensity")) or None,
        role=meme_lib.as_text(res.get("role")) or None,
        avoid_when=meme_lib.as_list(res.get("avoid_when")) if "avoid_when" in res else None,
        semantic_triggers=meme_lib.as_list(res.get("semantic_triggers")) or None,
        insert_timing=meme_lib.as_text(res.get("insert_timing")) or None,
        best_start=round(bs, 2), best_end=round(be, 2),
        keep_audio=bool(res.get("keep_audio")),
        has_speech=bool(res.get("has_speech")),
        speech_content=meme_lib.as_text(res.get("speech_content")) or None,
        has_onscreen_text=bool(res.get("has_onscreen_text")) if "has_onscreen_text" in res else None,
        onscreen_text=meme_lib.as_text(res.get("onscreen_text")) or None,
        audio_reason=meme_lib.as_text(res.get("audio_reason")) or None,
        notes=meme_lib.as_text(res.get("notes")),
        labeled_by="gemini",
    )
    return updated


def resolve_plan_inserts(plan, max_inserts=None, min_gap=None):
    """Doi meme_id -> file that trong plan.inserts[]. Bo id sai, cap so luong.
    Gian cach do plan_guard lam (xem ghi chu o resolve_plan_sfx)."""
    inserts = plan.get("inserts") or []
    if not inserts:
        return plan
    if max_inserts is None:
        import plan_guard
        plan_guard.apply_overrides()
        max_inserts = plan_guard.MAX_INSERTS
    lib = {m["id"]: m for m in meme_lib.meme_list()}
    resolved = []
    for it in inserts:
        mid = it.get("meme_id")
        m = lib.get(mid) if mid else None
        if mid and not m:
            continue  # id bia -> bo, khong lam vo build
        if m:
            it = dict(it)
            it["file"] = m["file"]
            it["_name"] = m.get("name")
            it["_src_duration"] = m.get("duration")
            it["_w"], it["_h"] = m.get("width"), m.get("height")
            it["_keep_audio"] = m.get("keep_audio")
            it["_emotion"] = m.get("emotion")
            # mac dinh cat dung doan Gemini cho la dat nhat
            if it.get("src_start") is None and m.get("best_start") is not None:
                it["src_start"] = m["best_start"]
                it.setdefault("src_end", m.get("best_end"))
            # volume de plan_guard quyet dinh: no biet meme nay CAT vao hay DE LEN
            # (cat ra ma im lang thi video hut hoi, de len ma to thi nuot loi noi).
        if not it.get("file"):
            continue
        resolved.append(it)
        if len(resolved) >= max_inserts:
            break
    plan["inserts"] = resolved
    return plan
