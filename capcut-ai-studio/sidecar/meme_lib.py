#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""KHO MEME (b-roll chen) — ~/.capcut-studio/memes/ + meme_library.json.

Cung khuon voi kho SFX trong engine.py, nhung cho VIDEO chen de len A-roll.

⚠️ Bai hoc tu kho SFX: AI KHONG xem duoc clip, no chon hoan toan dua tren `use_when`
va `tags`. Nhan sai thi meme vao sai cho. Vi vay:
  - `_TITLE_RULES` doan nhan tu ten clip (mien phi, tuc thi, chat luong trung binh)
  - `gemini_label_meme` (providers.py) cho AI XEM clip roi tu viet nhan (chuan hon)

Tach rieng khoi engine.py de `meme_fetch.py` chay duoc trong venv engine ma khong
phai keo theo ca engine.py (von can config/subprocess).
"""
import os
import re
import json
import hashlib

HOME = os.path.expanduser("~")
ENGINE_HOME = os.path.join(HOME, ".capcut-studio")
MEME_DIR = os.path.join(ENGINE_HOME, "memes")
MEME_LIB = os.path.join(ENGINE_HOME, "meme_library.json")

# Do dai mac dinh khi chen (giay). Meme dai qua se lam dut mach video chinh.
DEFAULT_INSERT_SEC = 1.6
MAX_INSERT_SEC = 4.0

# 6 nhan cam xuc CO DINH (trung voi o chon tren trang Kho meme).
EMOTIONS = ("punch", "positive", "negative", "nostalgic", "soft", "neutral")


def as_text(v, sep="; "):
    """Nhan AI co the la chuoi hoac mang (prompt sua duoc) -> luon ve chuoi."""
    if v is None:
        return ""
    if isinstance(v, (list, tuple)):
        # bo dau cham cuoi tung y de khong ra "kho tin.; Khi..."
        return sep.join(s for s in (as_text(x).rstrip(" .;") for x in v) if s)
    return str(v).strip()


def as_list(v):
    """Chuoi hoac mang -> mang chuoi khong rong."""
    if v is None:
        return []
    if isinstance(v, (list, tuple)):
        return [s for s in (as_text(x) for x in v) if s]
    s = str(v).strip()
    return [s] if s else []

# ---------------------------------------------------------------------------
# Doan cam xuc + tinh huong tu TEN clip.
# Tu khoa gom ca tieng Viet lan tieng Anh vi ten clip meme thuong tron ca hai.
# ---------------------------------------------------------------------------
_TITLE_RULES = [
    (["wow", "oh my god", "omg", "amazing", "tram tro", "trầm trồ"],
     "positive", "Trầm trồ / ngạc nhiên tích cực — khi tiết lộ điều ấn tượng, con số đẹp, kết quả tốt"),
    (["what", "ua ", "ủa", "hả", "ha?", "confus", "khong hieu", "không hiểu"],
     "negative", "Khó hiểu / vô lý — phản ứng với điều kỳ quặc, câu hỏi ngớ ngẩn"),
    (["ao that day", "ảo thật", "deo tin", "đéo tin", "khong tin", "không tin", "doubt", "sus"],
     "negative", "Nghi ngờ / không tin nổi — khi nghe điều quá phi lý hoặc lời quảng cáo quá đà"),
    (["cry", "crying", "khoc", "khóc", "sad", "buon", "buồn", "tears"],
     "soft", "Buồn / tội nghiệp / thất vọng — sau câu kể chuyện không may"),
    (["laugh", "cuoi", "cười", "teriak", "funny", "hai", "lol"],
     "positive", "Cười / chế giễu — khoảnh khắc hài, sau câu đùa hoặc tình huống buồn cười"),
    (["explosion", "explod", "pew", "bum", "boom", "no tung", "nổ"],
     "punch", "Cú đấm / bùng nổ — chốt hạ gắt, kết thúc tranh luận"),
    (["clap", "clapping", "vo tay", "vỗ tay", "applau"],
     "positive", "Tán thưởng / công nhận — sau câu nói chí lý hoặc thành tựu"),
    (["coffin", "quan tai", "dance", "toang", "rip", "chet", "chết"],
     "negative", "Toang / thất bại thảm — khi nhắc tới hậu quả xấu, mất trắng"),
    (["think", "thinking", "suy nghi", "suy nghĩ", "hmm"],
     "neutral", "Đang cân nhắc / đặt câu hỏi — trước khi đưa ra câu trả lời"),
    (["cool", "ngau", "ngầu", "flex", "swag", "chad"],
     "positive", "Ngầu / tự tin / flex — khi khoe kết quả hoặc khẳng định bản thân"),
    (["angry", "tuc", "tức", "gian", "giận", "rage", "mad"],
     "punch", "Tức giận / bức xúc — khi kể chuyện bị đối xử tệ"),
    (["scare", "so ", "sợ", "shock", "soc", "sốc"],
     "punch", "Giật mình / sốc — pattern interrupt, tiết lộ bất ngờ"),
]


def guess_meta(name):
    """(emotion, use_when) doan tu ten clip."""
    n = (name or "").lower()
    for keys, emo, use in _TITLE_RULES:
        if any(k in n for k in keys):
            return emo, use
    return "neutral", "Điểm nhấn chung — dùng tiết chế, chỉ khi thật sự hợp ngữ cảnh"


def _clean_name(name):
    """Bo rac trong ten clip YouTube: '720p', 'me me video', 'y2mate com', ma id..."""
    n = name or ""
    n = re.sub(r"(?i)\b(y2mate|com|mp4|hd|full|official|music)\b", " ", n)
    # '720p' hay dinh lien voi tu truoc ('guy720p') nen khong dung \b o dau
    n = re.sub(r"(?i)\d{3,4}p\b", " ", n)
    n = re.sub(r"(?i)\b(me\s?me|meme)\b", " ", n)
    n = re.sub(r"(?i)\bvideo\b", " ", n)
    n = re.sub(r"[#_]+", " ", n)
    n = re.sub(r"\b[A-Za-z0-9_-]{11}\b(?=\s|$)", " ", n)  # id youtube lot vao ten
    n = re.sub(r"\s+\d{1,2}\s*$", " ", n)                    # so thu tu thua o cuoi
    n = re.sub(r"\s+", " ", n).strip(" -–—")
    return n or (name or "meme")


def meme_id_for(seed):
    base = re.sub(r"[^\w\-]+", "-", (seed or "meme").lower()).strip("-")[:28] or "meme"
    h = hashlib.md5((seed or "").encode()).hexdigest()[:6]
    return "%s-%s" % (base, h)


def load_lib():
    if os.path.isfile(MEME_LIB):
        try:
            with open(MEME_LIB, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {"memes": []}
    return {"memes": []}


def save_lib(lib):
    os.makedirs(ENGINE_HOME, exist_ok=True)
    with open(MEME_LIB, "w", encoding="utf-8") as f:
        json.dump(lib, f, ensure_ascii=False, indent=2)


def meme_list():
    return load_lib().get("memes", [])


def register_meme(name, file, duration=None, width=None, height=None, source="",
                  emotion=None, use_when=None, tags=None):
    """Them/cap nhat 1 clip trong kho. Tra ve ban ghi."""
    pretty = _clean_name(name)
    emo, use = guess_meta(name)
    row = {
        "id": meme_id_for(pretty),
        "name": pretty,
        "raw_name": name,
        "file": file,
        "duration": duration or 0,
        "width": width,
        "height": height,
        "emotion": emotion or emo,
        "use_when": use_when or use,
        "tags": tags or [],
        "source": source,
        "labeled_by": "gemini" if use_when else "title",
    }
    lib = load_lib()
    lib["memes"] = [m for m in lib.get("memes", []) if m["id"] != row["id"]] + [row]
    save_lib(lib)
    return row


def meme_update(mid, **fields):
    lib = load_lib()
    for m in lib.get("memes", []):
        if m["id"] == mid:
            for k, v in fields.items():
                if v is not None:
                    m[k] = v
            save_lib(lib)
            return m
    return None


def meme_delete(mid):
    lib = load_lib()
    row = next((m for m in lib.get("memes", []) if m["id"] == mid), None)
    if not row:
        return False
    # chi xoa file neu no nam trong kho cua app (khong dung file user tro toi)
    try:
        if row.get("file", "").startswith(MEME_DIR) and os.path.isfile(row["file"]):
            os.remove(row["file"])
    except Exception:
        pass
    lib["memes"] = [m for m in lib.get("memes", []) if m["id"] != mid]
    save_lib(lib)
    return True


def find_meme(emotion=None, search=None, limit=50):
    rows = meme_list()

    def keep(m):
        if emotion and m.get("emotion") != emotion:
            return False
        if search:
            q = search.lower()
            blob = " ".join(as_text(m.get(k), " ") for k in
                            ("name", "tags", "use_when", "reaction", "semantic_triggers")).lower()
            if q not in blob:
                return False
        return True

    return [m for m in rows if keep(m)][:limit]


def meme_catalog_for_plan(limit=40, emotions=None):
    """Danh muc GON cho AI: id + name + emotion + use_when + tags + duration.
    KHONG gui path. Loc theo cac cam xuc co trong video neu kho qua lon."""
    rows = meme_list()
    if emotions and len(rows) > limit:
        pri = [m for m in rows if m.get("emotion") in emotions]
        rest = [m for m in rows if m.get("emotion") not in emotions]
        rows = (pri + rest)
    out = []
    for m in rows[:limit]:
        item = {
            "id": m["id"], "name": m["name"], "emotion": m.get("emotion", "neutral"),
            "use_when": as_text(m.get("use_when")), "tags": as_list(m.get("tags")),
            "duration": m.get("duration", 0),
            "aspect": ("doc" if (m.get("height") or 0) > (m.get("width") or 1) else "ngang"),
        }
        # Nhan chi tiet (chi co khi gan nhan bang prompt doi moi) — chi gui truong co gia tri
        # de catalog 40 clip khong phinh vo ich.
        for k in ("reaction", "role", "intensity", "insert_timing"):
            if as_text(m.get(k)):
                item[k] = as_text(m.get(k))
        for k in ("avoid_when", "semantic_triggers"):
            if as_list(m.get(k)):
                item[k] = as_list(m.get(k))
        out.append(item)
    return out
