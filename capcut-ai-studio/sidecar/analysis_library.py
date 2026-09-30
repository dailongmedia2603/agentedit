#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""THU VIEN PHAN TICH VIDEO — luu ket qua "Hieu nguon" va "Video mau" de lan sau dung lai,
khong phai goi lai Gemini / GPT (ton thoi gian + luot).

- Nhan dien video theo NOI DUNG file (kich thuoc + 3 doan 1MB dau/giua/cuoi), khong theo duong
  dan: doi ten / chuyen thu muc van nhan ra.
- Moi video 1 file JSON trong ~/.capcut-studio/library/items/<fp>.json:
    source        : phan tich NGUON (1 muc trong brief.sources, da can gio Whisper) + tom tat
    ref_gemini    : phan tich VIDEO MAU bang Gemini (luong CapCut cu — chi con doc/xoa, khong tao moi)
    ref_gpt       : phan tich VIDEO MAU bang GPT qua Codex (Video Remotion toi 2026-09-27 — van dung lai, khong tao moi)
    ref_video     : phan tich VIDEO MAU bang Gemini (Video Remotion tu 2026-09-28, co style_kit)
- Moi lan phan tich thanh cong -> tu luu. Lan sau cung video -> server tra ban da luu
  (tru khi nguoi dung bam "Phan tich lai" = fresh).
- Lan dau mo thu vien: nhap cac phan tich co san trong projects.json (du an cu).
"""
import os
import json
import time
import base64
import hashlib
import threading
import subprocess

HOME = os.path.join(os.path.expanduser("~"), ".capcut-studio")
LIB_DIR = os.path.join(HOME, "library")
ITEMS_DIR = os.path.join(LIB_DIR, "items")
THUMBS_DIR = os.path.join(LIB_DIR, "thumbs")
META_PATH = os.path.join(LIB_DIR, "meta.json")
PROJECTS_PATH = os.path.join(HOME, "projects.json")

REF_KINDS = ("ref_gemini", "ref_gpt", "ref_video")
PARTS = ("source",) + REF_KINDS
_CHUNK = 1 << 20
_lock = threading.RLock()
_fp_cache = {}


def _now():
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def fingerprint(path):
    """Van tay NOI DUNG file (nhanh: doc toi da 3MB). None neu khong doc duoc."""
    try:
        st = os.stat(path)
    except OSError:
        return None
    key = (os.path.abspath(path), st.st_size, int(st.st_mtime))
    if key in _fp_cache:
        return _fp_cache[key]
    h = hashlib.sha1(str(st.st_size).encode())
    try:
        with open(path, "rb") as f:
            for off in (0, max(0, st.st_size // 2 - _CHUNK // 2), max(0, st.st_size - _CHUNK)):
                f.seek(off)
                h.update(f.read(_CHUNK))
    except OSError:
        return None
    fp = h.hexdigest()[:24]
    _fp_cache[key] = fp
    return fp


def _item_path(fp):
    return os.path.join(ITEMS_DIR, fp + ".json")


def _read(fp):
    p = _item_path(fp)
    if not os.path.isfile(p):
        return None
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _write(item):
    os.makedirs(ITEMS_DIR, exist_ok=True)
    p = _item_path(item["fp"])
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(item, f, ensure_ascii=False)
    os.replace(tmp, p)


def _thumb_file(fp):
    # _v2: anh cu lam tu video HDR khong chuyen HDR->SDR -> bac mau; tao lai 1 lan
    return os.path.join(THUMBS_DIR, fp + "_v2.jpg")


def _thumb(path, fp):
    """Anh nho (jpg) cua video, tao 1 lan bang ffmpeg."""
    out = _thumb_file(fp)
    if os.path.isfile(out):
        return out
    try:
        import remotion_plan
        import media_sdr
        os.makedirs(THUMBS_DIR, exist_ok=True)
        subprocess.run([remotion_plan._ffbin("ffmpeg"), "-v", "error", "-y", "-ss", "1", "-i", path,
                        "-frames:v", "1", "-vf", media_sdr.sdr_vf(path) + "scale=180:-2", "-q:v", "4", out],
                       capture_output=True, timeout=60)
    except Exception:
        return None
    return out if os.path.isfile(out) else None


def _base_item(path, name=None, duration=None):
    fp = fingerprint(path)
    if not fp:
        return None, None
    item = _read(fp) or {"fp": fp, "created": _now()}
    item["path"] = os.path.abspath(path)
    item["name"] = name or item.get("name") or os.path.basename(path)
    if duration:
        item["duration"] = round(float(duration), 3)
    try:
        item["size"] = os.path.getsize(path)
    except OSError:
        pass
    item["updated"] = _now()
    return fp, item


# ---------------------------------------------------------------------------
# LUU
# ---------------------------------------------------------------------------
_SOURCE_DROP = ("id",)


def save_source(path, entry, brief=None, name=None, duration=None, at=None):
    """Luu phan tich NGUON cua 1 video (1 muc brief.sources, da can gio)."""
    if not path or not os.path.isfile(path) or not isinstance(entry, dict):
        return None
    with _lock:
        fp, item = _base_item(path, name or entry.get("name"), duration or entry.get("duration"))
        if not fp:
            return None
        e = {k: v for k, v in entry.items() if k not in _SOURCE_DROP}
        brief = brief if isinstance(brief, dict) else {}
        n_src = len(brief.get("sources") or []) or 1
        item["source"] = {
            "at": at or _now(),
            "entry": e,
            # tom tat cap brief chi dung khi brief chi co 1 video (khong thi la tom tat chung nhieu video)
            "brief_summary": brief.get("summary") if n_src == 1 else None,
            "tone": brief.get("tone"),
            "language": brief.get("language"),
            "model": brief.get("_source") or brief.get("_model"),
        }
        _write(item)
        _thumb(path, fp)
        return fp


def save_reference(path, kind, analysis, name=None, duration=None, at=None):
    """Luu phan tich VIDEO MAU. kind: 'ref_video' (Video Remotion) | 'ref_gpt' / 'ref_gemini' (du lieu cu)."""
    if kind not in REF_KINDS or not path or not os.path.isfile(path) or not isinstance(analysis, dict):
        return None
    with _lock:
        fp, item = _base_item(path, name, duration or analysis.get("duration"))
        if not fp:
            return None
        a = {k: v for k, v in analysis.items() if k not in ("_library", "reference_video")}
        item[kind] = {"at": at or _now(), "analysis": a}
        _write(item)
        _thumb(path, fp)
        return fp


# ---------------------------------------------------------------------------
# DOC / DUNG LAI
# ---------------------------------------------------------------------------
def _refresh_path(item, path):
    """File thu vien dang tro toi da bi chuyen / xoa, gap lai CUNG noi dung o `path` (vd ban chep trong
    thu muc du an) -> tro sang `path` de thu vien van mo / chon lai duoc."""
    if not item or not path or not os.path.isfile(path):
        return
    cur = item.get("path")
    if cur and os.path.isfile(cur):
        return
    with _lock:
        item["path"] = os.path.abspath(path)
        try:
            _write(item)
        except OSError:
            pass


def get_source(path):
    """-> {"fp", "at", "entry", ...} da luu cho video nay, hoac None."""
    fp = fingerprint(path) if path and os.path.isfile(path) else None
    item = _read(fp) if fp else None
    _refresh_path(item, path)
    if not item or not isinstance(item.get("source"), dict) or not item["source"].get("entry"):
        return None
    out = dict(item["source"])
    out["fp"] = fp
    return out


def get_reference(path, kind):
    fp = fingerprint(path) if path and os.path.isfile(path) else None
    item = _read(fp) if fp else None
    _refresh_path(item, path)
    part = (item or {}).get(kind)
    if not isinstance(part, dict) or not isinstance(part.get("analysis"), dict):
        return None
    a = dict(part["analysis"])
    a["_library"] = {"fp": fp, "at": part.get("at"), "from_library": True, "kind": kind}
    return a


def compose_brief(rows, parts, new_brief=None):
    """Ghep brief tu cac phan tich NGUON da luu (+ phan moi vua phan tich).
    rows: [{id, path, name, duration}] theo dung thu tu nguoi dung chon.
    parts: {id: ban luu (get_source)}; new_brief: brief Gemini cho cac video con lai."""
    new_by_id = {s.get("id"): s for s in (new_brief or {}).get("sources") or [] if isinstance(s, dict)}
    sources, summaries, tones, langs, warns = [], [], [], [], []
    for r in rows:
        if r["id"] in parts:
            sv = parts[r["id"]]
            e = dict(sv["entry"])
            e["id"], e["name"] = r["id"], r.get("name") or e.get("name")
            if r.get("duration"):
                e["duration"] = r["duration"]
            sources.append(e)
            summaries.append(sv.get("brief_summary") or e.get("summary"))
            tones.append(sv.get("tone"))
            langs.append(sv.get("language"))
        elif r["id"] in new_by_id:
            sources.append(new_by_id[r["id"]])
    if new_brief:
        summaries.insert(0, new_brief.get("summary"))
        tones.insert(0, new_brief.get("tone"))
        langs.insert(0, new_brief.get("language"))
        warns += list(new_brief.get("warnings") or [])
    brief = dict(new_brief or {})
    brief.update({
        "sources": sources,
        "source_videos": rows,
        "source_video": rows[0]["path"] if rows else "",
        "summary": " | ".join(s for s in summaries if s) if len(rows) > 1 else next((s for s in summaries if s), ""),
        "tone": next((t for t in tones if t), brief.get("tone")),
        "language": next((x for x in langs if x), brief.get("language") or "vi"),
        "warnings": warns,
        "_library": {"reused": [r["id"] for r in rows if r["id"] in parts],
                     "at": {rid: parts[rid].get("at") for rid in parts}},
    })
    return brief


def lookup(paths):
    """{path: {fp, source_at, ref_gemini_at, ref_gpt_at, ref_video_at, exists}} — UI danh dau video da co phan tich."""
    out = {}
    for p in paths or []:
        if not p or not os.path.isfile(p):
            out[p] = {"exists": False}
            continue
        fp = fingerprint(p)
        item = _read(fp) if fp else None
        _refresh_path(item, p)
        row = {"exists": True, "fp": fp}
        for part in PARTS:
            if isinstance((item or {}).get(part), dict):
                row[part + "_at"] = item[part].get("at")
        out[p] = row
    return out


def _thumb_data(fp, path=None):
    p = _thumb_file(fp)
    if not os.path.isfile(p) and path and os.path.isfile(path):
        _thumb(path, fp)          # muc cu: tao lai anh nho (dung mau) tu file video con tren may
    if not os.path.isfile(p):
        p = os.path.join(THUMBS_DIR, fp + ".jpg")   # file video da mat -> dung anh cu
    if not os.path.isfile(p):
        return None
    try:
        with open(p, "rb") as f:
            return "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()
    except OSError:
        return None


def list_items():
    import_projects_once()
    rows = []
    if not os.path.isdir(ITEMS_DIR):
        return rows
    for fn in os.listdir(ITEMS_DIR):
        if not fn.endswith(".json"):
            continue
        item = _read(fn[:-5])
        if not item:
            continue
        src = item.get("source") or {}
        e = src.get("entry") or {}
        row = {
            "fp": item["fp"], "name": item.get("name"), "path": item.get("path"),
            "exists": bool(item.get("path")) and os.path.isfile(item["path"]),
            "duration": item.get("duration") or e.get("duration"), "size": item.get("size"),
            "created": item.get("created"), "updated": item.get("updated"),
            "thumb": _thumb_data(item["fp"], item.get("path")),
        }
        if src:
            row["source"] = {"at": src.get("at"), "summary": src.get("brief_summary") or e.get("summary"),
                             "tone": src.get("tone"), "n_transcript": len(e.get("transcript") or []),
                             "timing": (e.get("timing") or {}).get("method")}
        for kind in REF_KINDS:
            part = item.get(kind)
            if isinstance(part, dict):
                a = part.get("analysis") or {}
                row[kind] = {"at": part.get("at"), "summary": a.get("summary"), "format": a.get("format"),
                             "style_kit": bool(a.get("style_kit"))}
        rows.append(row)
    rows.sort(key=lambda r: r.get("updated") or "", reverse=True)
    return rows


def delete(fp, part=None):
    """Xoa ca muc (part None) hoac 1 phan ('source' | 'ref_gemini' | 'ref_gpt' | 'ref_video')."""
    with _lock:
        item = _read(fp)
        if not item:
            return False
        if part in PARTS:
            item.pop(part, None)
            if any(k in item for k in PARTS):
                item["updated"] = _now()
                _write(item)
                return True
        for p in (_item_path(fp), _thumb_file(fp), os.path.join(THUMBS_DIR, fp + ".jpg")):
            try:
                os.remove(p)
            except OSError:
                pass
        return True


# ---------------------------------------------------------------------------
# NHAP TU DU AN CU (projects.json)
# ---------------------------------------------------------------------------
def _meta():
    try:
        with open(META_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _save_meta(m):
    os.makedirs(LIB_DIR, exist_ok=True)
    with open(META_PATH, "w", encoding="utf-8") as f:
        json.dump(m, f)


def import_projects_once():
    """Du an cu da co brief / phan tich video mau -> dua vao thu vien (moi du an 1 lan)."""
    try:
        with open(PROJECTS_PATH, encoding="utf-8") as f:
            items = (json.load(f) or {}).get("items") or {}
    except (OSError, ValueError):
        return 0
    with _lock:
        meta = _meta()
        done = meta.get("imported") or {}
        n = 0
        for pid, p in items.items():
            if not isinstance(p, dict) or done.get(pid) == p.get("updatedAt"):
                continue
            at = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime((p.get("updatedAt") or 0) / 1000.0)) \
                if p.get("updatedAt") else None
            brief = p.get("sourceBrief") if isinstance(p.get("sourceBrief"), dict) else None
            if brief:
                rows = {r.get("id"): r for r in brief.get("source_videos") or [] if isinstance(r, dict)}
                for s in brief.get("sources") or []:
                    r = rows.get(s.get("id")) if isinstance(s, dict) else None
                    if r and r.get("path") and os.path.isfile(r["path"]) and not get_source(r["path"]):
                        if save_source(r["path"], s, brief, name=r.get("name"), duration=r.get("duration"), at=at):
                            n += 1
            ref, rv = p.get("referenceAnalysis"), p.get("referenceVideo")
            if isinstance(ref, dict) and isinstance(rv, dict) and rv.get("path") and os.path.isfile(rv["path"]):
                src = str(ref.get("_source") or "")
                kind = "ref_video" if src.startswith("gemini-ref") else "ref_gpt" if src.startswith("gpt-cli") else "ref_gemini"
                if not get_reference(rv["path"], kind):
                    if save_reference(rv["path"], kind, ref, name=rv.get("name"), duration=rv.get("duration"), at=at):
                        n += 1
            done[pid] = p.get("updatedAt")
        meta["imported"] = done
        _save_meta(meta)
        return n
