#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""KHO TEXT (mau chu dong, chuyen tu preset CapCut) — ~/.capcut-studio/text_templates/<id>/ +
text_library.json.

Cung khuon voi kho SFX (engine.py) / kho meme (meme_lib.py): AI lap plan KHONG xem duoc hoat
canh chu, nen chon mau hoan toan dua tren nhan (summary/use_when/tags/...) do Gemini XEM
preview.mp4 roi tu viet. Khac meme/SFX: moi mau la 1 THU MUC (template.json = render spec cua
ban render-engineer + preview.mp4 + fonts/ + audio/ + assets/), khong phai 1 file don.

⚠️ LUAT CUNG: chu trong template.json CHI LA CHU MAU ("chu mau") de minh hoa bo cuc/animation —
khong bao gio dung nguyen trong video thuc. Khi dung mau, cac o chu (slots) duoc dien LOI THOAI
THAT cua video. Vi vay use_when/avoid_when PHAI danh gia theo PHONG CACH HINH / NHIP / CACH DUNG,
khong duoc suy theo NGHIA cua chu mau.

register_from_dir(dir) doc template.json (schema day du: remotion-src/textTemplate/spec.ts
`TextTemplateSpec`, sinh boi sidecar/capcut_preset_import.py — coi cac truong KHAC la trong suot,
chi doc cac truong duoi day, giu nguyen phan con lai trong template.json, KHONG ghi lai file do):
  - name (str, tuy chon)            - duration/width/height (so, tuy chon — thieu thi do preview.mp4)
  - slots (list, tuy chon): [{id, role, sample}, ...] — "sample" la CHU MAU hien trong preview
  - sample_texts (list[str], tuy chon): chu mau phang (ngoai slots, neu co)
  - preview (str, tuy chon): ten file preview trong thu muc, mac dinh "preview.mp4"
  - source (str HOAC object {"kind","name",...} — capcut_preset_import.py ghi object, chuan hoa
    ve 1 chuoi ngan de hien trong kho), mac dinh "capcut"
"""
import os
import re
import json
import shutil
import subprocess

from meme_lib import as_text, as_list  # ham thuan, dung lai khoi phai viet lai

HOME = os.path.expanduser("~")
ENGINE_HOME = os.path.join(HOME, ".capcut-studio")
TEXT_DIR = os.path.join(ENGINE_HOME, "text_templates")
TEXT_LIB = os.path.join(ENGINE_HOME, "text_library.json")

DEFAULT_PREVIEW = "preview.mp4"

# Nhan Gemini (phan tich) — GIU NGUYEN khi register_from_dir cap nhat lai phan cau truc.
ANALYSIS_FIELDS = (
    "summary", "style", "mood", "energy", "motion", "best_for", "use_when",
    "avoid_when", "slot_roles", "tags", "sound_notes", "labeled_by", "labeled_at",
)

ENERGIES = ("nhe", "vua", "manh")

# Muc renderer Kho Text cua ban app nay. Mau co "minApp" lon hon -> app nay KHONG ve dung (node / hieu ung moi) -> bo qua
# khi dong bo va khi lap plan. 1.2.0: hinh vector, canvas clip ghep, chinh mau, glow moi, hoat anh chu lay mau, bo dem so...
TEXT_RENDERER_VERSION = "1.2.0"


def _ver(v):
    return tuple(int(x) for x in re.findall(r"\d+", str(v or "0"))[:3]) or (0,)


def supported(row_or_spec):
    """Mau ve duoc o ban app nay? (minApp <= TEXT_RENDERER_VERSION; thieu minApp = mau cu)."""
    return _ver((row_or_spec or {}).get("minApp")) <= _ver(TEXT_RENDERER_VERSION)


def _pretty(tid):
    s = re.sub(r"[-_]+", " ", tid or "").strip()
    return s[:1].upper() + s[1:] if s else (tid or "mau chu")


def load_lib():
    if os.path.isfile(TEXT_LIB):
        try:
            with open(TEXT_LIB, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {"templates": []}
    return {"templates": []}


def save_lib(lib):
    os.makedirs(ENGINE_HOME, exist_ok=True)
    tmp = TEXT_LIB + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(lib, f, ensure_ascii=False, indent=2)
    os.replace(tmp, TEXT_LIB)


def text_list():
    return load_lib().get("templates", [])


def get_template(tid):
    return next((t for t in text_list() if t.get("id") == tid), None)


def _probe_video(path):
    """ffprobe nhanh: (duration, width, height). Thieu ffprobe / loi -> {} (khong chan dang ky)."""
    import winsupport
    out = {}
    for ff in (winsupport.ffbin("ffprobe"), os.path.expanduser("~/.local/bin/ffprobe"), "ffprobe"):
        if not ff:
            continue
        try:
            r = subprocess.run(
                [ff, "-v", "error", "-select_streams", "v:0",
                 "-show_entries", "stream=width,height:format=duration",
                 "-of", "json", path],
                capture_output=True, text=True, timeout=30,
            )
            j = json.loads(r.stdout or "{}")
            st = (j.get("streams") or [{}])[0]
            dur = (j.get("format") or {}).get("duration")
            out = {
                "duration": round(float(dur), 2) if dur else None,
                "width": st.get("width"),
                "height": st.get("height"),
            }
            if out.get("duration") or out.get("width"):
                break
        except Exception:
            continue
    return out


def _normalize_slots(raw):
    """slots cua template.json -> [{id, role, sample}, ...] (id luon co, sinh "slot_N" neu thieu)."""
    out = []
    if isinstance(raw, list):
        for i, s in enumerate(raw):
            if isinstance(s, dict):
                out.append({
                    "id": as_text(s.get("id")) or "slot_%d" % (i + 1),
                    "role": as_text(s.get("role")),
                    "sample": as_text(s.get("sample") or s.get("text") or s.get("value")),
                })
            else:
                out.append({"id": "slot_%d" % (i + 1), "role": "", "sample": as_text(s)})
    return out


def _source_text(spec):
    """`source` cua template.json: capcut_preset_import.py ghi OBJECT {"kind","name",...} (xem
    sidecar/capcut_preset_import.py + remotion-src/textTemplate/spec.ts); mau tu viet co the ghi chuoi.
    Chuyen ve 1 chuoi NGAN de hien trong kho (UI chi can nhan dang nguon, khong can giu nguyen object)."""
    s = spec.get("source")
    if isinstance(s, dict):
        kind = as_text(s.get("kind")) or "capcut"
        nm = as_text(s.get("name"))
        return "%s: %s" % (kind, nm) if nm else kind
    return as_text(s) or "capcut"


def _sample_texts(spec, slots):
    seen, out = set(), []
    for s in slots:
        t = s.get("sample")
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    for t in as_list(spec.get("sample_texts")):
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out


def register_from_dir(dir_path):
    """Doc template.json trong `dir_path` (ten thu muc = id) roi upsert vao text_library.json,
    GIU NGUYEN cac truong phan tich (ANALYSIS_FIELDS) cua ban ghi cu neu da co. Tra ve ban ghi."""
    dir_path = os.path.abspath(dir_path)
    tid = os.path.basename(dir_path.rstrip(os.sep))
    if not tid:
        raise RuntimeError("Duong dan thu muc khong hop le: %s" % dir_path)
    spec_path = os.path.join(dir_path, "template.json")
    if not os.path.isfile(spec_path):
        raise RuntimeError("Khong co template.json trong %s" % dir_path)
    with open(spec_path, encoding="utf-8") as f:
        spec = json.load(f)
    if not isinstance(spec, dict):
        raise RuntimeError("template.json phai la 1 object JSON")

    slots = _normalize_slots(spec.get("slots"))
    preview_name = as_text(spec.get("preview")) or DEFAULT_PREVIEW
    preview_path = os.path.join(dir_path, preview_name)

    duration, width, height = spec.get("duration"), spec.get("width"), spec.get("height")
    if (not duration or not width or not height) and os.path.isfile(preview_path):
        probed = _probe_video(preview_path)
        duration = duration or probed.get("duration")
        width = width or probed.get("width")
        height = height or probed.get("height")

    row = {
        "id": tid,
        "name": as_text(spec.get("name")) or _pretty(tid),
        "source": _source_text(spec),
        "dir": dir_path,
        "duration": duration or 0,
        "width": width,
        "height": height,
        "slots": slots,
        "sample_texts": _sample_texts(spec, slots),
        "preview": preview_name if os.path.isfile(preview_path) else None,
    }
    if spec.get("minApp"):
        row["minApp"] = as_text(spec.get("minApp"))
    lib = load_lib()
    rows = lib.get("templates", [])
    old = next((t for t in rows if t.get("id") == tid), None)
    if old:
        for k in ANALYSIS_FIELDS:
            if k in old:
                row[k] = old[k]
    lib["templates"] = [t for t in rows if t.get("id") != tid] + [row]
    save_lib(lib)
    return row


def text_update(tid, **fields):
    fields.pop("id", None)
    fields.pop("dir", None)  # tuyet doi theo may, khong cho sua tay
    lib = load_lib()
    for t in lib.get("templates", []):
        if t.get("id") == tid:
            for k, v in fields.items():
                if v is not None:
                    t[k] = v
            save_lib(lib)
            return t
    return None


def text_delete(tid):
    lib = load_lib()
    row = next((t for t in lib.get("templates", []) if t.get("id") == tid), None)
    if not row:
        return False
    # chi xoa thu muc neu no nam trong kho cua app (khong dung thu muc user tro toi)
    try:
        d = row.get("dir") or ""
        if d.startswith(TEXT_DIR) and os.path.isdir(d):
            shutil.rmtree(d, ignore_errors=True)
    except Exception:
        pass
    lib["templates"] = [t for t in lib.get("templates", []) if t.get("id") != tid]
    save_lib(lib)
    return True


def find_text(search=None, limit=200):
    rows = text_list()

    def keep(t):
        if search:
            q = search.lower()
            blob = " ".join(as_text(t.get(k), " ") for k in
                            ("name", "tags", "use_when", "summary", "best_for")).lower()
            if q not in blob:
                return False
        return True

    return [t for t in rows if keep(t)][:limit]


def text_catalog_for_plan(limit=60):
    """Danh muc GON (khong gui chu mau). Buoc TXT-lib dung ban day du hon: text_tpl.catalog (them thu tu doc / co tung o).
    KHONG gui duong dan file, KHONG gui chu mau (tranh AI nham chu mau la chu thuc)."""
    rows = text_list()
    out = []
    for t in rows[:limit]:
        out.append({
            "id": t["id"], "name": t["name"],
            "summary": as_text(t.get("summary")),
            "style": as_text(t.get("style")), "mood": as_text(t.get("mood")),
            "energy": as_text(t.get("energy")), "best_for": as_list(t.get("best_for")),
            "use_when": as_text(t.get("use_when")), "avoid_when": as_list(t.get("avoid_when")),
            "tags": as_list(t.get("tags")), "duration": t.get("duration", 0),
            "n_slots": len(t.get("slots") or []),
        })
    return out
