# -*- coding: utf-8 -*-
"""Bảng thử hiệu ứng: mỗi scene-effect 2s trên cùng 1 cảnh, có dán tên để bạn chọn."""
import os, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "CapCutAPI")); os.chdir(os.path.join(ROOT, "CapCutAPI"))
from create_draft import get_or_create_draft
from add_video_track import add_video_track
from add_text_impl import add_text_impl
from add_effect_impl import add_effect_impl
from save_draft_impl import save_draft_impl

CAPCUT = os.path.expanduser("~/Movies/CapCut/User Data/Projects/com.lveditor.draft")
SRC = os.path.join(ROOT, "tiktok_video.mp4")
W,H = 1080,1920
ok,fail=[],[]
def step(l,fn):
    try: fn(); ok.append(l)
    except Exception as e: fail.append(f"{l}: {e}"); print("[SKIP]",l,"->",e)

# 18 hiệu ứng ứng viên (scene) hợp cho video advice
FX = ["White_Flash","Flash","Color_Glitch","RGB_Border","Glitch","Shake","Camera_Shake",
      "Zoom_Lens","Mini_Zoom","Diamond_Zoom","Star_Rain","Mini_Stars","Heartbeat",
      "Light_leak","Lightning","Motion_Blur","Retro_Film","Noise"]

did,script = get_or_create_draft(width=W,height=H)
print("draft_id =", did)
SEG = 2.0           # mỗi hiệu ứng 2s
SRC_S, SRC_E = 8.2, 10.2   # cùng 1 cảnh biểu cảm
for i,fx in enumerate(FX):
    ts = i*SEG
    # cùng 1 đoạn nguồn lặp lại
    step(f"clip{i}", (lambda ts=ts: add_video_track(video_url=SRC, draft_id=did, width=W,
        height=H, start=SRC_S, end=SRC_E, target_start=ts, duration=SEG,
        scale_x=1.1, scale_y=1.1, track_name="main")))
    step(f"fx {fx}", (lambda fx=fx,ts=ts: add_effect_impl(effect_type=fx, effect_category="scene",
        start=ts, end=ts+SEG, draft_id=did, track_name="fx", params=[], width=W, height=H)))
    step(f"lbl {fx}", (lambda fx=fx,ts=ts: add_text_impl(text=f"{i+1}. {fx}", start=ts, end=ts+SEG,
        draft_id=did, transform_y=-0.78, font_size=10, font_color="#FFFFFF",
        border_color="#000000", border_width=30.0, track_name="label")))

res = save_draft_impl(did, draft_folder=CAPCUT)
print("save:",res.get("success"),"| OK:",len(ok),"FAIL:",len(fail))
for f in fail: print("  -",f)
print("DRAFT_ID:",did)
