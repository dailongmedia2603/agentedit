# -*- coding: utf-8 -*-
"""Dựng draft CapCut hoàn chỉnh cho tiktok_video.mp4:
   video gốc + zoom punch + chữ callout + card minh hoạ. Lưu kèm draft_folder để bundle."""
import os, sys, json
ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "CapCutAPI"))
os.chdir(os.path.join(ROOT, "CapCutAPI"))

from create_draft import get_or_create_draft
from add_video_track import add_video_track
from add_image_impl import add_image_impl
from add_text_impl import add_text_impl
from add_video_keyframe_impl import add_video_keyframe_impl
from save_draft_impl import save_draft_impl

CAPCUT = os.path.expanduser("~/Movies/CapCut/User Data/Projects/com.lveditor.draft")
SRC = os.path.join(ROOT, "tiktok_video.mp4")
CARDS = os.path.join(ROOT, "work", "cards")
DUR = 225.18
W, H = 1080, 1920

ok, fail = [], []
def step(label, fn):
    try:
        fn(); ok.append(label)
    except Exception as e:
        fail.append(f"{label}: {e}")
        print(f"  [SKIP] {label} -> {e}")

# 1) Draft
draft_id, script = get_or_create_draft(width=W, height=H)
print("draft_id =", draft_id)

# 2) Video gốc full màn hình
add_video_track(video_url=SRC, draft_id=draft_id, width=W, height=H,
                start=0, end=DUR, duration=DUR, scale_x=1, scale_y=1, track_name="main")
print("video added")

# 3) Zoom punch (keyframe uniform_scale) tại các cao trào
def punch(t_in, t_peak, t_out, peak="1.08", base="1.0"):
    def _():
        add_video_keyframe_impl(draft_id=draft_id, track_name="main",
            property_types=["uniform_scale","uniform_scale","uniform_scale"],
            times=[t_in, t_peak, t_out], values=[base, peak, base])
    return _
step("punch hook",   punch(0.0, 0.0, 0.6, peak="1.10"))   # mở đầu zoom-out
step("punch truth",  punch(51.6, 52.2, 53.2))
step("punch lose",   punch(205.0, 205.6, 206.6, peak="1.10"))
step("punch ending", punch(220.8, 221.4, 222.4))

# 4) Card minh hoạ (overlay phía trên, vùng trên khung)
CARD_Y = -0.5
CARD_SCALE = 0.85
def add_card(name, start, end, y=CARD_Y, scale=CARD_SCALE, intro="Fade_In", outro="Fade_Out"):
    path = os.path.join(CARDS, name)
    def _():
        try:
            add_image_impl(image_url=path, draft_id=draft_id, width=W, height=H,
                start=start, end=end, transform_y=y, scale_x=scale, scale_y=scale,
                track_name="overlay", intro_animation=intro, outro_animation=outro)
        except Exception:
            add_image_impl(image_url=path, draft_id=draft_id, width=W, height=H,
                start=start, end=end, transform_y=y, scale_x=scale, scale_y=scale,
                track_name="overlay")
    return _

cards = [
    ("card0_hook.png",        0.3,   4.8),
    ("card1_income_high.png", 5.2,   9.6),
    ("card2_income_drop.png", 10.4, 15.4),
    ("card3_choices.png",     16.2, 23.8),
    ("card4_truth.png",       52.6, 59.2),
    ("card5_ai.png",          59.6, 65.6),
    ("card6_case.png",       110.5,119.5),
    ("card7_lose.png",       205.6,213.8),
    ("card8_ending.png",     218.4,225.1),
]
for nm, s, e in cards:
    step(f"card {nm}", add_card(nm, s, e))

# 5) Chữ callout ngắn (vùng trên), nơi không có card
def add_kw(text, start, end, color="#FFFFFF", y=-0.56, size=18):
    def _():
        add_text_impl(text=text, start=start, end=end, draft_id=draft_id,
            transform_y=y, font_size=size, font_color=color,
            border_color="#000000", border_width=18.0, track_name="text_main")
    return _
step("kw noithang", add_kw("NÓI THẲNG, KHÔNG NÉ TRÁNH", 39.2, 44.0, "#FF4848", size=20))
step("kw giatri",   add_kw("TẠO GIÁ TRỊ = KHÔNG BỊ BÓP VIEW", 94.0, 99.0, "#22D17B"))
step("kw doimoi",   add_kw("KHÔNG ĐỔI MỚI = BỊ THAY THẾ", 144.2, 150.0, "#FFD600"))
step("kw kiendinh", add_kw("KIÊN ĐỊNH = KHÔNG THỂ THAY THẾ", 175.2, 180.6, "#40B4FF"))

# 6) Save (bundle assets + path vào CapCut)
res = save_draft_impl(draft_id, draft_folder=CAPCUT)
print("save success:", res.get("success"))

# 7) Tổng kết + soi cấu trúc
dfd = os.path.join(os.getcwd(), draft_id)
info = json.load(open(os.path.join(dfd, "draft_info.json")))
print("\n=== KẾT QUẢ ===")
print("OK :", len(ok), "phần tử")
print("FAIL:", len(fail))
for f in fail: print("   -", f)
print("\nTracks:")
for t in info.get("tracks", []):
    print(f"  {t.get('type'):8} '{t.get('name','')}' segments={len(t.get('segments',[]))}")
ass = os.path.join(dfd, "assets")
n_assets = sum(len(files) for _,_,files in os.walk(ass)) if os.path.isdir(ass) else 0
print("Assets bundled:", n_assets)
print("DRAFT_ID:", draft_id)
print("DFD:", dfd)
