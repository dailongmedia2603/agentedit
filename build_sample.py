# -*- coding: utf-8 -*-
"""MẪU v2 0-22s: jump-cut zoom + TRANSITION + SCENE/CHARACTER EFFECT (kho CapCut)
   + kinetic caption (bounce, fix tràn) + sparkle."""
import os, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "CapCutAPI")); os.chdir(os.path.join(ROOT, "CapCutAPI"))
from create_draft import get_or_create_draft
from add_video_track import add_video_track
from add_text_impl import add_text_impl
from add_image_impl import add_image_impl
from add_effect_impl import add_effect_impl
from save_draft_impl import save_draft_impl

CAPCUT = os.path.expanduser("~/Movies/CapCut/User Data/Projects/com.lveditor.draft")
SRC = os.path.join(ROOT, "tiktok_video.mp4")
WORK = os.path.join(ROOT, "work")
W,H = 1080,1920
ok,fail=[],[]
def step(l,fn):
    try: fn(); ok.append(l)
    except Exception as e: fail.append(f"{l}: {e}"); print("[SKIP]",l,"->",e)

did,script = get_or_create_draft(width=W,height=H)
print("draft_id =", did)

# 1) JUMP-CUT ZOOM + TRANSITION giữa các cut
b      = [0, 3.2, 5.6, 7.7, 10.1, 13.5, 15.7, 17.6, 19.0, 22.2]
scales = [1.0, 1.18, 1.08, 1.22, 1.05, 1.18, 1.0, 1.22, 1.12]
trans  = {1:"White_Flash", 3:"Twinkle_Zoom", 5:"Color_Glitch", 7:"Pull_in", 8:"White_Flash"}
for i in range(len(scales)):
    s,e,sc = b[i], b[i+1], scales[i]
    tr = trans.get(i)
    step(f"seg{i} z{sc} {tr or ''}", (lambda s=s,e=e,sc=sc,tr=tr: add_video_track(
        video_url=SRC, draft_id=did, width=W, height=H, start=s, end=e, target_start=s,
        duration=e-s, scale_x=sc, scale_y=sc, track_name="main",
        transition=tr, transition_duration=0.3)))

# 2) SCENE EFFECT (kho CapCut) — full frame, track 'fx_scene'
scene_fx = [
    ("Star_Rain",    1.8, 3.3),   # hook lấp lánh
    ("Zoom_Lens",    5.5, 7.6),   # vài trăm triệu
    ("Color_Glitch", 9.0, 10.3),  # view tụt (trục trặc)
    ("Shake",       11.9, 13.6),  # dưới 20 triệu
]
for fx,s,e in scene_fx:
    step(f"scenefx {fx}", (lambda fx=fx,s=s,e=e: add_effect_impl(
        effect_type=fx, effect_category="scene", start=s, end=e, draft_id=did,
        track_name="fx_scene", params=[], width=W, height=H)))

# 3) CHARACTER EFFECT (bám người) — Lightning lúc 'view tụt'
step("charfx Lightning", (lambda: add_effect_impl(
    effect_type="Lightning", effect_category="character", start=9.0, end=10.2,
    draft_id=did, track_name="fx_char", params=[], width=W, height=H)))

# 4) KINETIC CAPTIONS (fix tràn: font nhỏ + fixed_width), bounce, vùng ngực
CAP_Y = 0.30
def cap(text, s, e, color="#FFFFFF", size=13):
    def _():
        add_text_impl(text=text, start=s, end=e, draft_id=did, transform_y=CAP_Y,
            font_size=size, font_color=color, border_color="#000000", border_width=22.0,
            shadow_enabled=True, shadow_alpha=0.9, shadow_distance=6.0, fixed_width=0.86,
            intro_animation="Bounce_In", intro_duration=0.4,
            outro_animation="Bounce_Out", outro_duration=0.3, track_name="cap")
    return _
captions = [
    ("100.000 FOLLOW", 2.0, 3.2,  "#FFD600", 15),
    ("KIẾM TIỀN TỐT",  3.9, 4.9,  "#FFFFFF", 14),
    ("VÀI TRĂM TRIỆU", 5.6, 7.6,  "#22D17B", 16),
    ("VIEW TỤT",       9.2, 10.1, "#FF4848", 18),
    ("DƯỚI 20 TRIỆU",  12.1,13.5, "#FF4848", 16),
    ("KHÔNG ĐỦ TRẢ LƯƠNG", 13.8,15.6, "#FFFFFF", 12),
    ("2 LỰA CHỌN",     16.3,17.6, "#FFD600", 18),
    ("XÓA KÊNH?",      17.6,19.0, "#FF4848", 17),
    ("GIỮ & CÀY TIẾP?",19.2,22.0, "#22D17B", 14),
]
for t,s,e,c,sz in captions:
    step(f"cap {t}", cap(t,s,e,c,sz))

# 5) Sparkle hook
spk = os.path.join(WORK,"sparkle.png")
if os.path.exists(spk):
    step("sparkle", (lambda: add_image_impl(image_url=spk, draft_id=did, width=W, height=H,
        start=2.0, end=3.3, transform_y=0.12, scale_x=0.5, scale_y=0.5,
        track_name="deco", intro_animation="Fade_In")))

res = save_draft_impl(did, draft_folder=CAPCUT)
print("save:",res.get("success"),"| OK:",len(ok),"FAIL:",len(fail))
for f in fail: print("  -",f)
print("DRAFT_ID:",did)
