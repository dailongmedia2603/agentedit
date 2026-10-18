#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BO TAO AM THANH bang earshot (2026-10-18). User: "dung am thanh trong kho chua thong minh / phu hop — dung repo
earshot de TAO am thanh: chu hien len... toan bo am thanh, TRU tieng co giong noi trong thu vien; luc lam plan goi voi
ngu canh + muc tieu de tao am thanh phu hop".

earshot (github.com/Leonxlnx/earshot, MIT, commit 925ebe5) — `vendor/earshot` chi giu phan NGAN HANG AM THANH (forge bank):
201 tieng LUU DUOI DANG CODE (cong thuc tong hop vat ly + tham so, khong co file ghi am), render theo id bang DSP thuan
numpy / scipy (numba tang toc ~25x neu co) — khong model, khong mang, khong ban quyen. Moi lan render chinh duoc:
  dur   do dai file dung giay (sua tham so cong thuc, khong keo gian)
  apex  giay cua diem to nhat (ho whoosh) — dinh tieng luot roi dung luc can
  pitch not nhac (tieng co cao do: chuong, kalimba, pop, click...)
  take  ban thu khac cung chat (seed) — tieng lap lai khong y het nhau
Moi lan render chay audit cua earshot (click, cat duoi, me, rit len kieu "synth whip"...) — hong thi doi seed (nhu kit).

Luong Edit Video:
- B7 nhan `catalog()` (tieng sach + nhan Gemini NGHE that `references/earshot_labels.json` neu co) + ngu canh video, tra
  `bo_am_thanh` (bo tieng cua CA video theo ho: whoosh / swoosh / pop / click / boom / riser / ding / typing) + tung SFX
  `"gen": {sound, dur, apex, pitch, take}` dung su kien. Kho SFX chi con cap tieng CO GIONG NOI (meme) — `speech_only`.
- `normalize_palette` / `clean_gen` (code) kiem id + nut chinh; thieu ho -> bo mac dinh theo tone (`default_palette`).
- build_spec: `use(plan["am_thanh"])` -> moi tieng tu gan (chu hien, lop do hoa, canh shot, hieu ung tu viet, luat hook)
  lay tieng cua bo nay (`auto_item`, take theo su kien). Plan cu (khong co "am_thanh") giu bo tieng kit-* nhu truoc.
- `resolve(item)`: render (cache ~/.capcut-studio/cache/earshot/<khoa>.wav, tat dinh) + `_sync` = giay tu dau file toi
  DIEM DONG BO (onset / dinh whoosh / cuoi riser) -> build_spec dat diem do DUNG gio su kien AI khai.
"""
import contextlib
import contextvars
import hashlib
import json
import os
import sys
import threading
import zlib

GEN_VERSION = 1
HERE = os.path.dirname(os.path.abspath(__file__))
VENDOR = os.path.join(HERE, "vendor", "earshot")
LABELS_FILE = os.path.join(HERE, "references", "earshot_labels.json")
SR = 48000
DUR_MIN, DUR_MAX = 0.05, 6.0
LONG_CAP = 3.5          # tieng dai hon (impact 5-6s duoi vang) -> dur 3.5s (fade dung cach) — spec chi phat 4s dau
AUTO_TAKES = 4          # tieng tu gan: moi su kien 1 trong 4 take (khong lap y het, van cung chat)

# Tieng audit cua earshot bao loi o chinh seed cua no (docs/SFX.md "185 of 201 clean") — khong dua cho AI
UNCLEAN = {"pro_zip/up", "pro_zip/up_hi", "pro_zip/arc", "logo_sting/zip_ping", "pro_logo_sting/sweep_hit", "pop/2",
           "pro_pop/bloop", "typing_key/light", "typing_key/laptop", "pro_hover_tick/air", "pro_hover_tick/glass",
           "hover_tick/detent", "pro_typing_key/soft", "glitch/dropout", "logo_sting/reverse_bloom", "pro_shimmer/m3"}

# Loai trong ngan hang -> mo ta tieng Viet + ho (cua app) phu hop + loai muc to (plan_guard.SFX_MIX)
CAT_VI = {
    "click": ("Click bấm có thân nhỏ (chuột / nút)", "click", "ui"),
    "pro_click": ("Tick UI sáng, gọn kiểu thiết kế", "click", "ui"),
    "hover_tick": ("Tick rất nhỏ: rê chuột, hàng lướt qua", "click", "ui"),
    "pro_hover_tick": ("Tick số trong như không khí: con trỏ nháy, bộ đếm", "click", "ui"),
    "tap": ("Chạm / gõ nhẹ lên mặt bàn, kính, đốt ngón tay", "click", "ui"),
    "pro_tap": ("Tiếng thụp trầm mềm của một cú chạm", "pop", "ui"),
    "toggle": ("Công tắc gạt / khoá lại (bấm + chốt)", "click", "ui"),
    "pop": ("Bong bóng / nút chai bật (cao độ hơi vút lên)", "pop", "ui"),
    "pro_pop": ("Pop có cao độ cho chữ / huy hiệu hiện ra", "pop", "ui"),
    "pro_pop_in": ("Phần tử bật vào: tiếng thụp tròn trầm", "pop", "ui"),
    "notify": ("Chuông gõ ngân (A4-E6): thành công, tin nhắn, chốt hạ êm", "ding", "ui"),
    "pro_notify": ("Ding ngắn sạch (cách nhau nửa cung)", "ding", "ui"),
    "shimmer": ("Chuông lấp lánh ngân dài (kết, lộ thành quả)", "ding", "ui"),
    "pro_shimmer": ("Lấp lánh dạng hạt", "ding", "ui"),
    "whoosh_fast": ("Lướt gió nhanh: lia máy, bay vào, phần tử di chuyển", "whoosh", "whoosh"),
    "whoosh_big": ("Gió lớn chuyển cảnh, vật lớn lướt qua", "whoosh", "whoosh"),
    "pro_whoosh_big": ("Sub trầm phồng lên trước điểm cắt (thiết kế)", "whoosh", "whoosh"),
    "swish": ("Vụt mảnh nhanh: chữ trượt, thao tác UI nhỏ", "swoosh", "whoosh"),
    "swipe": ("Quẹt thẻ / bảng / lật trang (vải, giấy)", "swoosh", "whoosh"),
    "riser": ("Dồn lên trước tiết lộ, dừng đúng ở chỗ to nhất", "riser", "riser"),
    "pro_riser": ("Riser ngắn kiểu giật vào điểm cắt", "riser", "riser"),
    "downlifter": ("Năng lượng rơi xuống sau cú đập, rời cảnh", "boom", "riser"),
    "pro_zip": ("Quét có cao độ qua điểm cắt", "riser", "riser"),
    "impact": ("Cú đập điện ảnh: lộ diện, tựa đề đập vào (đuôi vang dài)", "boom", "impact"),
    "pro_impact": ("Impact sub có gate, gọn (thiết kế)", "boom", "impact"),
    "sub_drop": ("Độ nặng dưới cú đập, drop nhạc", "boom", "impact"),
    "pro_sub_drop": ("Sub drop nở ra sau điểm cắt (thiết kế)", "boom", "impact"),
    "logo_sting": ("Tổ hợp lộ logo (dẫn + đập + chuông)", "ding", "impact"),
    "pro_logo_sting": ("Cử chỉ ra mắt sản phẩm kết vào một nốt", "ding", "impact"),
    "glitch": ("Glitch chuyển cảnh, trạng thái lỗi", "whoosh", "whoosh"),
    "pro_glitch": ("Stutter số kết đúng điểm cắt (thiết kế)", "whoosh", "whoosh"),
    "typing_key": ("Phím cơ thật, mỗi ký tự một tiếng", "typing", "ui"),
    "pro_typing_key": ("Tick phím đã lọc cao cho chữ động", "typing", "ui"),
    "pro_typing_run": ("Cả một chuỗi gõ phím trong một file (chỉnh dur = thời gian chữ gõ)", "typing", "ui"),
    "pluck": ("Thanh kalimba có cao độ: nốt giai điệu, chuông, chốt êm", "ding", "ui"),
    "fit": ("Tiếng ghi âm thật (CC0) đã chuyển thành code", None, None),
}
# ho cua tieng "fit/<vai>/<ten>" theo vai
_FIT_ROLE = {"click": ("click", "ui"), "tick": ("click", "ui"), "pop": ("pop", "ui"), "snap": ("click", "ui"),
             "land.light": ("pop", "ui"), "key": ("typing", "ui"), "key.space": ("typing", "ui"),
             "whoosh.short": ("whoosh", "whoosh"), "bell": ("ding", "ui"), "hit": ("click", "ui")}

# HO TIENG cua app (goi y "sfx" cua lop / hieu ung / mau shot, chu tu gan) — bo tieng cua video chon 1 tieng / ho
FAMILIES = {
    "whoosh": "Chữ / hình / ảnh BAY VÀO, đổi bố cục, chuyển cảnh",
    "swoosh": "Chữ trượt vào nhanh, lật thẻ, đổi ý nhỏ",
    "pop": "Icon / huy hiệu / sticker / chữ nhỏ BẬT RA",
    "click": "Bấm, đánh dấu, hiện từng mục danh sách, chữ nhỏ",
    "boom": "Chữ nhấn LỚN đập vào, câu chốt, con số sốc",
    "riser": "Dồn căng trước tiết lộ / cao trào",
    "ding": "Tiết lộ con số / đáp án / điểm tích cực, bộ đếm số",
    "typing": "Chữ hiện kiểu gõ phím / thẻ prompt sáng dần",
}
ALIASES = {"impact": "boom", "punch": "boom", "hit": "boom", "bell": "ding", "chime": "ding", "type": "typing",
           "key": "typing", "transition": "whoosh", "swish": "swoosh", "swipe": "swoosh", "tick": "click"}
_MIX_OF_FAM = {"whoosh": "whoosh", "swoosh": "whoosh", "pop": "ui", "click": "ui", "ding": "ui", "typing": "ui",
               "boom": "impact", "riser": "riser"}
_TAGS = {"whoosh": ["whoosh", "transition"], "swoosh": ["swoosh", "transition"], "pop": ["pop", "ui"],
         "click": ["click", "ui"], "boom": ["boom", "impact"], "riser": ["riser", "build"], "ding": ["ding", "bell"],
         "typing": ["typing", "type"]}
_PEAK_CATS = {"whoosh_fast", "whoosh_big", "pro_whoosh_big", "swish", "swipe"}
_END_CATS = {"riser", "pro_riser"}

# BO TIENG MAC DINH theo TONE (khi AI khong chon / chon sai) — dung theo 3 preset cua earshot (calm / crisp / minimal,
# tung vai da do 'earshot match' + realness) + 2 bo them cho tone manh / vui.
TONES = {
    "nhe": ("Nhẹ, ấm, mộc — kể chuyện, tâm sự, chữa lành", {
        "whoosh": "fit/whoosh.short/bamboo_swish", "swoosh": "swish/soft", "pop": "fit/pop/mouth_plop",
        "click": "fit/click/floss_lid", "boom": "pro_impact/air", "riser": "riser/swell", "ding": "pluck/kalimba",
        "typing": "pro_typing_run/soft"}),
    "gon": ("Gọn, sáng, năng động — công nghệ, sản phẩm, hướng dẫn", {
        "whoosh": "whoosh_fast/tight", "swoosh": "swish/blade", "pop": "pro_pop_in/round", "click": "fit/click/floss_lid",
        "boom": "pro_impact/short", "riser": "pro_riser/roll", "ding": "pro_notify/ding_2045",
        "typing": "pro_typing_run/standard"}),
    "toi_gian": ("Tối giản, tinh — chuyên gia, tài chính, cao cấp", {
        "whoosh": "whoosh_fast/heavy", "swoosh": "swipe/flick", "pop": "pro_pop_in/round", "click": "pro_click/soft",
        "boom": "pro_impact/air", "riser": "pro_riser/air_gate", "ding": "pro_notify/ding_1822",
        "typing": "pro_typing_run/tick"}),
    "manh": ("Mạnh, điện ảnh — kịch tính, truyền cảm hứng, tiết lộ lớn", {
        "whoosh": "whoosh_big/jet", "swoosh": "whoosh_fast/crisp", "pop": "pro_pop_in/double", "click": "toggle/on",
        "boom": "impact/punch", "riser": "riser/rush", "ding": "notify/m5", "typing": "pro_typing_run/blip"}),
    "vui": ("Vui, nảy — hài, bắt trend, trẻ em", {
        "whoosh": "swish/zing", "swoosh": "swipe/flick", "pop": "pop/1", "click": "tap/finger",
        "boom": "pro_impact/short", "riser": "pro_riser/nblips", "ding": "pluck/kalimba_ring",
        "typing": "pro_typing_run/blip"}),
}
_TONE_WORDS = [  # tone cua cau chuyen (B1, tieng Viet khong dau) -> bo mac dinh
    ("vui", ("hai", "vui", "troll", "funny", "trend", "tre em", "nhi nhanh", "giai tri", "comedy")),
    ("manh", ("kich tinh", "hao hung", "truyen cam hung", "manh", "soc", "dien anh", "cang", "gay can", "epic")),
    ("toi_gian", ("chuyen gia", "tai chinh", "cao cap", "sang trong", "nghiem tuc", "y te", "phap ly", "toi gian")),
    ("nhe", ("tam su", "nhe nhang", "cam dong", "am ap", "chua lanh", "buon", "ke chuyen", "suy ngam", "gia dinh")),
]

_lock = threading.Lock()
_key_locks = {}
_bank = None
_load_err = None
_sounds = None
_labels = None
_CTX = contextvars.ContextVar("sfx_gen_palette", default=None)


# ---------------------------------------------------------------------------
# Nap earshot (vendor) — 1 lan, an toan khi thieu thu vien (scipy / soundfile)
# ---------------------------------------------------------------------------
def _cache_dir(*sub):
    d = os.path.join(os.path.expanduser("~"), ".capcut-studio", "cache", *sub)
    os.makedirs(d, exist_ok=True)
    return d


def _load():
    global _bank, _load_err
    if _bank is not None or _load_err is not None:
        return _bank
    with _lock:
        if _bank is not None or _load_err is not None:
            return _bank
        try:
            # numba ghi cache JIT canh file nguon (trong app chi doc / da ky) -> ghi vao thu muc cache cua app
            os.environ.setdefault("NUMBA_CACHE_DIR", _cache_dir("numba"))
            if VENDOR not in sys.path:
                sys.path.insert(0, VENDOR)
            old = sys.dont_write_bytecode
            sys.dont_write_bytecode = True      # khong ghi __pycache__ vao trong .app (lam hong chu ky ban cai)
            try:
                import importlib
                import pkgutil
                import earshot
                from earshot.forge import bank as B
                # earshot nap cong thuc (recipes / fit) LUOI luc render dau -> nap san het o day, duoi co tren
                for m in pkgutil.walk_packages(earshot.__path__, "earshot."):
                    importlib.import_module(m.name)
            finally:
                sys.dont_write_bytecode = old
            _bank = B
        except Exception as ex:     # thieu scipy / soundfile / vendor -> luong cu (kho SFX + kit-*)
            _load_err = "%s: %s" % (type(ex).__name__, str(ex)[:200])
    return _bank


def available():
    return _load() is not None


def load_error():
    _load()
    return _load_err


def bank_version():
    B = _load()
    return B.VERSION if B else None


def _norm_txt(s):
    import unicodedata
    s = unicodedata.normalize("NFD", str(s or "").lower().replace("đ", "d"))
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


# ---------------------------------------------------------------------------
# Danh muc
# ---------------------------------------------------------------------------
def labels():
    """Nhan Gemini NGHE that tung tieng (scripts/earshot-label.py) — {id: {nghe, hop, cam_xuc, manh}}."""
    global _labels
    if _labels is None:
        try:
            with open(LABELS_FILE, encoding="utf-8") as f:
                _labels = (json.load(f) or {}).get("sounds") or {}
        except Exception:
            _labels = {}
    return _labels


def sounds():
    """Moi tieng SACH cua ngan hang (dict id -> thong tin earshot: dur_s, peak_s, end_s, centroid_hz, knobs...)."""
    global _sounds
    if _sounds is None:
        B = _load()
        if not B:
            return {}
        _sounds = {s["id"]: s for s in B.list_sounds() if s["id"] not in UNCLEAN}
    return _sounds


def category(sound_id):
    return str(sound_id or "").split("/")[0]


def family_of(sound_id):
    """Ho cua app (whoosh / swoosh / pop / click / boom / riser / ding / typing) cua 1 tieng trong ngan hang."""
    sid = str(sound_id or "")
    cat = category(sid)
    if cat == "fit":
        return _FIT_ROLE.get(sid.split("/")[1] if sid.count("/") >= 2 else "", ("click", "ui"))[0]
    return (CAT_VI.get(cat) or (None, "click", "ui"))[1] or "click"


def mix_family(sound_id):
    """Loai muc to cho plan_guard.mix_sfx (impact / whoosh / ui / riser)."""
    sid = str(sound_id or "")
    cat = category(sid)
    if cat == "fit":
        return _FIT_ROLE.get(sid.split("/")[1] if sid.count("/") >= 2 else "", ("click", "ui"))[1]
    return (CAT_VI.get(cat) or (None, None, "ui"))[2] or "ui"


def align_of(sound_id):
    cat = category(sound_id)
    if cat in _PEAK_CATS or sound_id == "fit/whoosh.short/bamboo_swish":
        return "peak"
    if cat in _END_CATS:
        return "end"
    return "onset"


def _tone_word(hz):
    hz = float(hz or 0)
    return "rất trầm" if hz < 200 else "trầm" if hz < 600 else "ấm" if hz < 1800 else "sáng" if hz < 5000 else "rất sáng"


def catalog():
    """Danh muc GON cho AI lap ke hoach: nhom theo loai (mo ta tieng Viet + ho phu hop + nut chinh duoc), moi tieng:
    nhan Gemini da nghe (neu co), do dai, giay dinh (cu dam), do sang."""
    snd = sounds()
    if not snd:
        return []
    lab = labels()
    groups = {}
    for sid, s in snd.items():
        cat = category(sid)
        if cat == "fit":
            role = sid.split("/")[1] if sid.count("/") >= 2 else ""
            key = "fit:" + (_FIT_ROLE.get(role, ("click",))[0])
        else:
            key = cat
        g = groups.setdefault(key, {"loai": cat if cat != "fit" else "fit (%s)" % key[4:],
                                    "mo_ta": (CAT_VI.get(cat) or ("",))[0], "ho": family_of(sid),
                                    "chinh_duoc": [], "tieng": []})
        k = s.get("knobs") or {}
        for kn in ("dur", "apex", "pitch"):
            if k.get(kn) and kn not in g["chinh_duoc"]:
                g["chinh_duoc"].append(kn)
        row = {"id": sid, "dai": round(float(s.get("dur_s") or 0), 2), "dinh": round(float(s.get("peak_s") or 0), 3),
               "am_sac": _tone_word(s.get("centroid_hz"))}
        if isinstance(k.get("pitch"), dict) and k["pitch"].get("note"):
            row["not_goc"] = str(k["pitch"]["note"]).split(" ")[0]
        L = lab.get(sid) or {}
        if L.get("nghe"):
            row.pop("am_sac", None)         # Gemini da nghe -> mo ta day du hon do sang tinh bang so
            row["nghe"] = L["nghe"]
        if L.get("hop"):
            row["hop"] = L["hop"]
        if L.get("manh"):
            row["manh"] = L["manh"]
        g["tieng"].append(row)
    out = sorted(groups.values(), key=lambda g: (list(FAMILIES).index(g["ho"]) if g["ho"] in FAMILIES else 99, g["loai"]))
    for g in out:
        g["tieng"].sort(key=lambda r: r["id"])
    return out


def fingerprint():
    """Van tay bo tao (khoa cache buoc B7): doi ngan hang / nhan / quy tac -> B7 chay lai."""
    if not available():
        return None
    h = hashlib.sha1(json.dumps([GEN_VERSION, bank_version(), sorted(labels().items()), rules_text()], ensure_ascii=False,
                                sort_keys=True, default=str).encode("utf-8")).hexdigest()
    return h[:12]


# ---------------------------------------------------------------------------
# Bo tieng cua video (palette) + kiem "gen"
# ---------------------------------------------------------------------------
def tone_key(tone_text):
    t = _norm_txt(tone_text)
    if t in TONES:
        return t
    for key, words in _TONE_WORDS:
        if any(w in t for w in words):
            return key
    return "gon"


def default_palette(tone_text=None):
    key = tone_key(tone_text)
    name, bo = TONES[key]
    return {"tong": key, "chat": name, "bo": {f: {"sound": s} for f, s in bo.items()}, "nguon": "mac_dinh"}


def _clean_pitch(v):
    if v in (None, "", False):
        return None
    if isinstance(v, (int, float)):
        return float(v) if 20 <= float(v) <= 12000 else None
    s = str(v).strip().replace("♯", "#").replace("♭", "b")
    import re
    if re.match(r"^[A-Ga-g](#|b|s)?-?\d$", s) or re.match(r"^\d+(\.\d+)?\s*hz$", s.lower()):
        return s[0].upper() + s[1:]
    return None


def clean_gen(g):
    """Kiem 1 yeu cau tao tieng {sound, dur, apex, pitch, take} -> dict sach | None (id sai). Nut khong hop tieng nay
    (pitch cho tieng gio, apex cho tieng khong phai whoosh...) bi bo, khong lam hong ca muc."""
    if isinstance(g, str):
        g = {"sound": g}
    if not isinstance(g, dict):
        return None
    sid = str(g.get("sound") or g.get("id") or "").strip()
    snd = sounds()
    if sid not in snd:
        return None
    k = snd[sid].get("knobs") or {}
    out = {"sound": sid}
    try:
        dur = float(g["dur"]) if g.get("dur") not in (None, "") else None
    except (TypeError, ValueError):
        dur = None
    if dur is not None and k.get("dur"):
        out["dur"] = round(min(DUR_MAX, max(DUR_MIN, dur)), 3)
    try:
        apex = float(g["apex"]) if g.get("apex") not in (None, "") else None
    except (TypeError, ValueError):
        apex = None
    if apex is not None and k.get("apex") and apex > 0.02:
        lim = (out.get("dur") or float(snd[sid].get("dur_s") or 1.0)) - 0.03
        if apex < lim:
            out["apex"] = round(apex, 3)
    p = _clean_pitch(g.get("pitch"))
    if p is not None and k.get("pitch"):
        out["pitch"] = p
    try:
        take = int(g.get("take") or 1)
    except (TypeError, ValueError):
        take = 1
    if take > 1:
        out["take"] = min(take, 64)
    return out


def normalize_palette(raw, tone_text=None):
    """bo_am_thanh cua B7 -> {tong, chat, bo: {ho: {sound, pitch?, level_db?}}, nguon}. Ho thieu / id sai -> bo mac
    dinh theo tone (ghi ro ho nao AI chon, ho nao mac dinh)."""
    base = default_palette((raw or {}).get("tong") if isinstance(raw, dict) and (raw or {}).get("tong") in TONES
                           else tone_text)
    if not isinstance(raw, dict):
        return base
    src = raw.get("bo") if isinstance(raw.get("bo"), dict) else raw
    bo, tu_ai = {}, []
    for fam in FAMILIES:
        v = src.get(fam)
        g = clean_gen(v) if v else None
        if g:
            e = {"sound": g["sound"]}
            if g.get("pitch"):
                e["pitch"] = g["pitch"]
            if g.get("dur") and fam in ("typing", "riser"):
                e["dur"] = g["dur"]
            try:
                lv = float((v or {}).get("level_db")) if isinstance(v, dict) and v.get("level_db") is not None else None
            except (TypeError, ValueError):
                lv = None
            if lv is not None:
                e["level_db"] = round(max(-8.0, min(3.0, lv)), 1)
            bo[fam] = e
            tu_ai.append(fam)
        else:
            bo[fam] = dict(base["bo"][fam])
    out = {"tong": base["tong"], "chat": str(raw.get("chat") or base["chat"])[:300], "bo": bo,
           "nguon": "ai" if len(tu_ai) == len(FAMILIES) else ("ai+mac_dinh" if tu_ai else "mac_dinh")}
    if tu_ai and len(tu_ai) < len(FAMILIES):
        out["ho_mac_dinh"] = [f for f in FAMILIES if f not in tu_ai]
    return out


def speech_only(sfx_catalog):
    """Danh muc kho SFX cho AI khi bo tao chay: CHI tieng co giong noi (meme) — moi tieng khac do earshot tao."""
    if not available():
        return sfx_catalog
    return [x for x in sfx_catalog or [] if isinstance(x, dict) and x.get("has_speech")]


def clean_audio(items, speech_ids):
    """Muc audio cua B7: giu muc "gen" hop le (id + nut), muc sfx_id CHI khi la tieng co giong noi trong kho, nhac
    nen (role bgm) giu nguyen. Tra (muc giu, ghi chu bo)."""
    keep, dropped = [], []
    for a in items or []:
        if not isinstance(a, dict):
            continue
        if a.get("role") == "bgm":
            keep.append(a)
            continue
        sid = str(a.get("sfx_id") or "")
        if a.get("gen") is None and sid not in speech_ids and clean_gen(sid[3:] if sid.startswith("es:") else sid):
            a = dict(a, gen={"sound": sid[3:] if sid.startswith("es:") else sid})   # AI ghi id earshot vao sfx_id
        if a.get("gen") is not None:
            g = clean_gen(a["gen"])
            if not g:
                dropped.append("gen sai id %r" % (a.get("gen") if isinstance(a.get("gen"), str)
                                                  else (a.get("gen") or {}).get("sound")))
                continue
            b = {k: v for k, v in a.items() if k not in ("sfx_id", "file", "volume")}
            b["gen"] = g
            b["sfx_id"] = "es:" + g["sound"]
            keep.append(b)
        elif a.get("sfx_id") in speech_ids:
            keep.append(a)
        else:
            dropped.append("sfx_id %r khong phai tieng co giong noi" % a.get("sfx_id"))
    return keep, dropped


# ---------------------------------------------------------------------------
# Render (cache tat dinh)
# ---------------------------------------------------------------------------
def _seed_for(g):
    take = int(g.get("take") or 1)
    return None if take <= 1 else 7919 * take


def _key(g):
    blob = json.dumps({"s": g["sound"], "d": g.get("dur"), "a": g.get("apex"), "p": g.get("pitch"),
                       "t": int(g.get("take") or 1), "b": bank_version(), "v": GEN_VERSION}, sort_keys=True)
    return hashlib.sha1(blob.encode("utf-8")).hexdigest()[:20]


def render(g):
    """Tao file cho 1 yeu cau (da clean_gen). Tra {file, onset_s, peak_s, end_s, dur_s, lufs_m, sync_*, checks, sound}
    | None. Cache theo khoa (id + nut + ban ngan hang): render 1 lan, lan sau doc dia."""
    B = _load()
    g = clean_gen(g)
    if not B or not g:
        return None
    key = _key(g)
    d = _cache_dir("earshot")
    wav, meta_p = os.path.join(d, key + ".wav"), os.path.join(d, key + ".json")
    if os.path.isfile(wav) and os.path.isfile(meta_p):
        try:
            with open(meta_p, encoding="utf-8") as f:
                return dict(json.load(f), file=wav)
        except Exception:
            pass
    with _lock:
        kl = _key_locks.setdefault(key, threading.Lock())
    with kl:
        if os.path.isfile(wav) and os.path.isfile(meta_p):
            with open(meta_p, encoding="utf-8") as f:
                return dict(json.load(f), file=wav)
        import soundfile as sf
        info = sounds().get(g["sound"]) or {}
        dur = g.get("dur")
        if dur is None and float(info.get("dur_s") or 0) > LONG_CAP and (info.get("knobs") or {}).get("dur"):
            dur = LONG_CAP
        kw = {"dur": dur, "apex": g.get("apex"), "pitch": g.get("pitch")}
        seed0 = _seed_for(g)
        y = meta = None
        for j in range(4):          # audit hong (click, cat duoi, rit len...) -> take khac (nhu earshot kit)
            seed = seed0 if j == 0 else (seed0 or 0) + 1000 * j
            try:
                y, meta = B.render(g["sound"], seed=seed, **kw)
            except Exception as ex:
                if j == 0 and (kw.get("pitch") or kw.get("apex")) and "Knob" in type(ex).__name__:
                    kw.update(pitch=None, apex=None)        # nut khong hop -> bo nut, giu tieng
                    y, meta = B.render(g["sound"], seed=seed, **kw)
                else:
                    raise
            if (meta.get("checks") or {}).get("ok", True):
                break
        tmp = wav + ".tmp.wav"
        sf.write(tmp, y, int(meta.get("sr") or SR), subtype="PCM_16")
        os.replace(tmp, wav)
        out = {"sound": g["sound"], "seed": meta.get("seed"), "dur_s": meta.get("dur_s"),
               "onset_s": meta.get("onset_s"), "peak_s": meta.get("peak_s"), "end_s": meta.get("end_s"),
               "lufs_m": meta.get("lufs_m_max"), "align": align_of(g["sound"]),
               "checks": (meta.get("checks") or {}).get("summary"),
               "edits": {k: v for k, v in (meta.get("edits") or {}).items() if isinstance(v, dict)}}
        out["sync_s"] = round(float(out.get({"peak": "peak_s", "end": "end_s"}.get(out["align"], "onset_s")) or 0), 4)
        with open(meta_p, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, default=str)
        return dict(out, file=wav)


def label_of(sound_id):
    L = labels().get(sound_id) or {}
    return L.get("nghe") or (CAT_VI.get(category(sound_id)) or ("",))[0] or sound_id


def resolve(a, fam=None):
    """Muc audio co "gen" -> them file (render / cache), ten, nhan loai, do to, `_sync` (giay tu dau file toi diem dong
    bo). Tra a (da sua tai cho) | None (khong tao duoc)."""
    g = clean_gen(a.get("gen"))
    if not g:
        return None
    try:
        r = render(g)
    except Exception:
        r = None
    if not r:
        return None
    fam = fam or family_of(g["sound"])
    a["gen"] = g
    a["sfx_id"] = a.get("sfx_id") or "es:" + g["sound"]
    a["file"] = r["file"]
    a["_name"] = "Tạo: %s" % g["sound"]
    a["_es"] = mix_family(g["sound"])
    a["tags"] = list(_TAGS.get(fam) or [])
    a["_lufs"] = r.get("lufs_m")
    a["_sync"] = float(r.get("sync_s") or 0)
    a["_align"] = r.get("align")
    return a


# ---------------------------------------------------------------------------
# Tieng tu gan theo bo tieng cua video (build_spec)
# ---------------------------------------------------------------------------
@contextlib.contextmanager
def use(palette):
    """Trong khoi nay, tieng tu gan (sfx_kit.auto_item) lay tu bo tieng `palette` cua video (None = luong cu kit-*)."""
    tok = _CTX.set(palette if isinstance(palette, dict) and isinstance(palette.get("bo"), dict) and available()
                   else None)
    try:
        yield
    finally:
        _CTX.reset(tok)


def active():
    return _CTX.get()


def fam_key(name):
    f = str(name or "").strip().lower()
    f = ALIASES.get(f, f)
    return f if f in FAMILIES else None


def auto_item(fam, ref, dur=None):
    """Tieng cua ho `fam` theo bo tieng dang dung (use) cho su kien `ref` (id lop / chu...). Take chon theo ref ->
    cung ho, moi su kien mot take. Tra muc audio (chua co start) | None (khong co bo tieng / khong tao duoc)."""
    pal = active()
    f = fam_key(fam)
    if not pal or not f:
        return None
    e = (pal.get("bo") or {}).get(f) or default_palette(pal.get("tong"))["bo"].get(f)
    if not e:
        return None
    take = 1 + zlib.crc32(str(ref).encode("utf-8")) % AUTO_TAKES
    g = {"sound": e["sound"], "pitch": e.get("pitch"), "take": take, "dur": e.get("dur")}
    if dur is not None and f == "typing":
        g["dur"] = round(min(2.5, max(0.4, float(dur))), 2)
    a = resolve({"gen": g}, fam=f)
    if a and e.get("level_db") is not None:
        a["_gen_db"] = float(e["level_db"])
    return a


def place(a, t):
    """Gio BAT DAU cho tieng tu gan tai su kien `t`: onset roi dung t; whoosh -> dinh roi ~0.12s sau t (phan tu dang
    bay vao), khong bat dau som hon 0.25s; riser -> ket thuc dung t."""
    sync = float(a.get("_sync") or 0)
    if a.get("_align") == "peak":
        st = min(t, max(t - 0.25, t + 0.12 - sync))
    elif a.get("_align") == "end":
        st = t - sync
    else:
        st = t - min(sync, 0.02)
    return round(max(0.0, st), 3)


# ---------------------------------------------------------------------------
# Luat noi vao prompt (B7 / Hook-SFX)
# ---------------------------------------------------------------------------
_EARSHOT_RULE = """

# BO TAO AM THANH (earshot) — UU TIEN HON moi quy tac ve sfx_catalog o tren
Moi tieng KHONG CO GIONG NOI deu do bo tao am thanh TAO RA cho dung video nay (cong thuc tong hop luu bang code, render
theo id — sach, khong ban quyen). sfx_catalog o tren CHI con tieng CO GIONG NGUOI (meme) — dung "sfx_id" cho loai do.

1. "bo_am_thanh": BO TIENG cua ca video — moi ho 1 tieng trong gen_catalog, chon theo CHAT cua video (tone, chu de,
   doi tuong xem, nhip) chu khong theo thoi quen. Code dung bo nay cho MOI tieng tu gan (chu hien, lop do hoa, canh
   shot, hieu ung tu viet, hook) -> ca video cung mot "chat" am. Ho: whoosh (bay vao / chuyen canh), swoosh (truot
   nhanh), pop (bat ra), click (chu nho / tung muc), boom (cu dam / chu nhan lon), riser (don truoc tiet lo), ding
   (tiet lo con so / dap an), typing (chu go phim — nen chon pro_typing_run).
   Tone goi y: "nhe" (am, moc: fit/*, kalimba, swish/soft), "gon" (sang, nhanh: whoosh_fast/tight, pro_pop_in,
   pro_notify), "toi_gian" (rat khe: pro_click, pro_hover_tick, pro_impact/air), "manh" (day, dien anh: whoosh_big,
   impact/*, riser/*), "vui" (nay: pop/*, swish/zing, pro_riser/nblips, kalimba). Cac ho phai hop nhau (cung chat).
2. SFX tung su kien (hook, cu chot, chuyen canh, chu hero...): {"gen": {"sound": "<id trong gen_catalog>", ...}} thay
   cho "sfx_id". Chon tieng theo CAM XUC + Y NGHIA khoanh khac va theo "nghe"/"hop" cua tieng (neu co). Nut chinh (chi
   khi tieng do co trong "chinh_duoc"):
     "dur": do dai (giay) — whoosh dai bang chuyen dong; typing_run = thoi gian chu go; impact keo dai <= 3.5
     "apex": giay cua diem to nhat trong file (ho whoosh) — vd chuyen canh 0.6s: dur 0.8, apex 0.5
     "pitch": not ("C5", "E5", "G5"...) — cac ding / pop lien tiep di len theo bac (C5 -> E5 -> G5) tao cam giac tang
       dan; cu chot ket ve not goc; tieng gio / phim khong co pitch
     "take": 2..8 = ban thu khac cung chat (cung tieng lap lai trong video -> doi take)
3. GIO: voi muc "gen", src_time / start = THOI DIEM SU KIEN (luc cu dam phai roi / luc chu hien / diem cat). Code tu
   canh: tieng thuong bat dau dung luc do; ho whoosh -> DINH (apex) roi dung luc do; riser -> KET THUC dung luc do.
   KHONG tru peak_time cho muc gen.
4. Van giu: KHONG dat "volume"; khai "purpose"; tiet che theo duong cong cam xuc; khoang lang co chu dich.

SCHEMA THEM:
{"bo_am_thanh": {"tong": "nhe|gon|toi_gian|manh|vui", "chat": "<1 cau: vi sao bo nay hop video>",
                 "bo": {"whoosh": {"sound": "..."}, "swoosh": {"sound": "..."}, "pop": {"sound": "..."},
                        "click": {"sound": "..."}, "boom": {"sound": "..."}, "riser": {"sound": "..."},
                        "ding": {"sound": "...", "pitch": "C5"}, "typing": {"sound": "..."}}},
 "audio": [{"gen": {"sound": "whoosh_fast/tight", "dur": 0.7, "apex": 0.45}, "start": 6.3, "purpose": "transition",
            "why": "..."},
           {"gen": {"sound": "pro_impact/short"}, "source_id": "source_1", "src_time": 15.0, "purpose": "punch",
            "why": "..."}]}

# gen_catalog (nhom theo loai: mo_ta, ho phu hop, chinh_duoc; moi tieng: id, dai (giay), dinh (giay cu dam / to nhat),
# am_sac, not_goc, nghe = Gemini da nghe that, hop = hop khi nao, manh = cuong do)
"""

_HOOK_RULES = """

# BO TAO AM THANH (earshot) — uu tien hon sfx_catalog
sfx_catalog chi con tieng co giong noi (khong dung cho hook). Chon 1 (toi da 2) tieng trong gen_catalog, khai
{"gen": {"sound": "<id>", "dur"?: s, "apex"?: s, "pitch"?: "C5"}} thay cho sfx_id. src_time = THOI DIEM tieng phai
"vao" (code tu canh: whoosh -> dinh roi dung luc do; riser -> ket thuc dung luc do). bo_am_thanh = bo tieng cua video
(nen chon cung chat). Muc "nhe": whoosh mem / chuong / riser nhe; "vua": whoosh ro, pop_in, impact gon; "manh": impact.
"""


def rules_text():
    import prompt_store
    return prompt_store.get_prompt("_EARSHOT_RULE", _EARSHOT_RULE)


def hook_rules_text():
    return _HOOK_RULES


def hook_catalog():
    """Danh muc gon cho Hook-SFX: chi loai hop hook (whoosh, impact, riser, chuong, pop_in, glitch)."""
    want = {"whoosh_fast", "whoosh_big", "pro_whoosh_big", "swish", "impact", "pro_impact", "sub_drop", "pro_sub_drop",
            "riser", "pro_riser", "notify", "pro_notify", "pro_pop_in", "glitch", "pro_glitch", "shimmer", "pluck",
            "pro_logo_sting"}
    return [g for g in catalog() if g["loai"] in want]
