#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""KHUNG VIDEO: DOC 9:16 (1080x1920, mac dinh) hoac NGANG 16:9 (1920x1080) — user 2026-10-04 chon khi tao video.

- Don vi px cua thiet ke (co chu, vien, kich thuoc anh chu) = px tren khung CANH NGAN 1080 -> ca hai khung deu la px
  that (Remotion: min(W, H) / 1080 = 1). Phan so khung: be ngang = px / W, chieu cao = px / H.
- `use(W, H)` dat khung cho LUONG hien tai (build_spec / autoplan): cac ham do khoi chu / ne mat / bo cuc trong
  motion_design, user_media, fx_flow doc khung qua `size()` thay vi so co dinh 1080 / 1920. Khong dat = khung doc
  (y nhu truoc khi co lua chon). Viec chay nen (run_log.carry) mang theo khung cua luong goi.
- Video DOC: khong them gi vao prompt / khoa cache -> ket qua AI da luu truoc day van dung lai. Video NGANG: moi buoc
  AI ve hinh nhan them ghi chu khung ngang (`note`) + khoa cache co `tag()`.
"""
import contextlib
import threading

PORTRAIT, LANDSCAPE = "portrait", "landscape"
SIZES = {PORTRAIT: (1080, 1920), LANDSCAPE: (1920, 1080)}

_tl = threading.local()


def normalize(orientation):
    """'landscape' / 'ngang' / '16:9' -> LANDSCAPE; con lai (ke ca thieu) -> PORTRAIT."""
    v = str(orientation or "").strip().lower()
    return LANDSCAPE if v in (LANDSCAPE, "ngang", "16:9", "horizontal") else PORTRAIT


def dims(orientation):
    return SIZES[normalize(orientation)]


def of_plan(plan):
    """(W, H) ghi trong plan (plan cu khong co -> khung doc)."""
    c = (plan or {}).get("canvas") if isinstance(plan, dict) else None
    c = c if isinstance(c, dict) else {}
    try:
        W, H = int(c.get("w") or 0), int(c.get("h") or 0)
    except (TypeError, ValueError):
        W, H = 0, 0
    return (W, H) if W > 0 and H > 0 else SIZES[PORTRAIT]


def orientation_of(W, H):
    return LANDSCAPE if W > H else PORTRAIT


def size():
    """(W, H) khung cua luong hien tai."""
    return getattr(_tl, "size", None) or SIZES[PORTRAIT]


def landscape():
    W, H = size()
    return W > H


@contextlib.contextmanager
def use(W, H):
    prev = getattr(_tl, "size", None)
    _tl.size = (int(W), int(H))
    try:
        yield
    finally:
        _tl.size = prev


def fw(px):
    """px (thiet ke) -> phan be ngang khung."""
    return float(px) / size()[0]


def fh(px):
    """px (thiet ke) -> phan chieu cao khung."""
    return float(px) / size()[1]


def wh():
    """ti le W / H — phan be ngang x wh() = cung do dai tinh theo phan chieu cao."""
    W, H = size()
    return W / float(H)


def caption_frac():
    """Be ngang toi da cua khoi phu de / chu caption (KHOP remotion-src/Captions.tsx): doc 86%, ngang 70% (dong
    chu dai 1650px tren khung ngang kho doc)."""
    return 0.70 if landscape() else 0.86


def tag():
    """Them vao khoa cache cac buoc ve hinh: None voi khung doc (khoa cu giu nguyen)."""
    return LANDSCAPE if landscape() else None


def keyed(payload):
    """payload khoa cache + khung (chi khi ngang)."""
    t = tag()
    if t:
        payload = dict(payload)
        payload["khung"] = t
    return payload


def aspect_default():
    """Ti le anh AI mac dinh theo khung."""
    return "16:9" if landscape() else "9:16"


def story_view():
    """Ghi vao `cau_chuyen` (story) cho MOI buoc AI sau B1 — chi khi ngang."""
    if not landscape():
        return None
    W, H = size()
    return "NGANG 16:9 (%dx%d) — video ngang (YouTube / Facebook / man hinh ngang), KHONG phai video doc TikTok" % (W, H)


_NOTE_COMMON = """

# KHUNG VIDEO: NGANG 16:9 (1920x1080) — UU TIEN HON moi chi dan "doc 9:16 / 1080x1920 / TikTok / Reels" o tren
Video nay XUAT NGANG 1920x1080 (YouTube, Facebook, man hinh ngang). Moi cho o tren noi khung doc 9:16, 1080x1920,
"khung rong 1080", giao dien TikTok / Reels thi hieu theo khung NGANG nay:
- Toa do x, y van la 0..1 theo be NGANG / be CAO, nhung be ngang (1920px) DAI GAP 1.78 lan chieu cao (1080px):
  w = 0.5 la 960px, h = 0.5 chi 540px. Hinh vuong / tron w thi cao w x 1.78 (phan chieu cao).
- Co chu ("size"), vien, bong = px THAT tren khung 1920x1080 (canh ngan 1080 — cung thang do voi khung doc).
  Chieu cao chi 1080px: chu nhan to nhat ~90-180px, to hop nhieu tang thap gon (toi da 2 tang to); tan dung BE
  NGANG: dat chu / hinh BEN CANH nguoi noi (ben trai / ben phai khoang trong), khong chong cao.
- Nguoi noi thuong o GIUA khung ngang -> khoang trong hai ben trai / phai la cho dat chu nhan, anh, so lieu.
- Vung an toan: y 0.07..0.80 (duoi do danh cho phu de), x 0.04..0.96.
- Phu de loi noi chay ngang phia duoi khung (rong toi da ~70% be ngang)."""

_NOTE = {
    "design": _NOTE_COMMON + """
- BO CUC tren khung ngang: `split` = B-roll mot BEN (trai, "panel_side": "left" | "right") + A-roll ben kia,
  "panel_ratio" 0.35-0.6 = phan be NGANG cua panel. `card` = the A-roll ben PHAI ("card_x" = mep trai the,
  0.4-0.65; panel / chu ben trai). `circle` = khung tron ("circle_x" 0.2-0.8, "circle_y" 0.3-0.7, "circle_d"
  0.22-0.5 phan be ngang). KHONG dung "popout" (khung ngang khong du cho troi dau).
- Anh AI ("aspect"): panel / nen / broll dung "16:9" (hoac "4:3"); panel split ~ "3:4" / "1:1"; sticker tach nen
  tuy vat the.""",
    "captions": _NOTE_COMMON + """
- Hero (chu nhan) dat "upper" hoac lech ben canh nguoi noi; phu de "lower" / "bottom". Moi cum phu de co the dai hon
  mot chut (4-9 tu) vi dong ngang rong hon.""",
    "visual": _NOTE_COMMON,
    "fx": _NOTE_COMMON + """
- Code hieu ung: ctx.W = 1920, ctx.H = 1080 (KHONG phai 1080 x 1920). Tinh vi tri / kich thuoc theo ctx.W / ctx.H,
  khong co dinh so.""",
    "image": """

# KHUNG VIDEO: NGANG 16:9 (1920x1080)
Video nay la video NGANG (YouTube / Facebook), KHONG phai video doc 9:16 — moi cho noi "video ngan doc 9:16" o tren
hieu la khung ngang 16:9. Bo cuc anh theo TI LE KHUNG da cho; anh nen / panel can chua cho cho nguoi noi va chu.""",
    "text_art": """

# KHUNG VIDEO: NGANG 16:9 (1920x1080)
Chu se dat len video NGANG (YouTube / Facebook), KHONG phai video doc 9:16 — moi cho noi "video ngan doc 9:16" o tren
hieu la khung ngang. Hang chu co the dai, thap gon (khung chi cao 1080px).""",
}


def note_for(story, step):
    """Nhu note() nhung theo `story` (cau_chuyen co "khung_hinh" = khung ngang) — cho viec chay o luong phu tu tao
    (ThreadPoolExecutor rieng cua text_art / graphic_art) khong mang khung cua luong goi."""
    st = story if isinstance(story, dict) else {}
    return _NOTE.get(step, _NOTE_COMMON) if st.get("khung_hinh") else ""


def note(step):
    """Ghi chu khung ngang noi vao cuoi prompt cua buoc `step` ('design' | 'captions' | 'visual' | 'fx' | 'image' |
    'text_art'). Khung doc -> '' (prompt y nhu truoc)."""
    return _NOTE.get(step, _NOTE_COMMON) if landscape() else ""
