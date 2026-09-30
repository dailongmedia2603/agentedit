# -*- coding: utf-8 -*-
"""Render video hoàn chỉnh bằng FFmpeg: video gốc (1080x1920) + overlay card/pill có fade.
Tự động 100%, không cần CapCut.
  PREVIEW=24 -> chỉ render 24s đầu (kiểm tra nhanh).
"""
import os, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "tiktok_video.mp4")
CARDS = os.path.join(ROOT, "work", "cards")
OUT = os.path.join(ROOT, "tiktok_video_EDITED.mp4")
PREVIEW = float(os.environ.get("PREVIEW", "0"))  # 0 = full

# (file, start, end, y_pixel)
OV = [
    ("card0_hook.png",        0.3,   4.8, 150),
    ("card1_income_high.png", 5.2,   9.6, 150),
    ("card2_income_drop.png", 10.4, 15.4, 150),
    ("card3_choices.png",     16.2, 23.8, 150),
    ("kw1_noithang.png",      39.2, 44.0, 210),
    ("card4_truth.png",       52.6, 59.2, 150),
    ("card5_ai.png",          59.6, 65.6, 150),
    ("kw2_giatri.png",        94.0, 99.0, 210),
    ("card6_case.png",       110.5,119.5, 150),
    ("kw3_doimoi.png",       144.2,150.0, 210),
    ("kw4_kiendinh.png",     175.2,180.6, 210),
    ("card7_lose.png",       205.6,213.8, 150),
    ("card8_ending.png",     218.4,225.1, 150),
]

if PREVIEW > 0:
    OV = [o for o in OV if o[1] < PREVIEW]
    OUT = os.path.join(ROOT, "work", "preview.mp4")

FADE = 0.35
inputs = ["-i", SRC]
for f, s, e, y in OV:
    d = e - s
    inputs += ["-loop", "1", "-t", f"{d:.3f}", "-i", os.path.join(CARDS, f)]

# filter graph
fc = ["[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[base]"]
prev = "base"
for i, (f, s, e, y) in enumerate(OV, start=1):
    d = e - s
    fo = max(0.0, d - FADE)
    fc.append(
        f"[{i}:v]format=rgba,fade=t=in:st=0:d={FADE}:alpha=1,"
        f"fade=t=out:st={fo:.3f}:d={FADE}:alpha=1,"
        f"setpts=PTS-STARTPTS+{s}/TB[c{i}]"
    )
    out = f"v{i}"
    fc.append(f"[{prev}][c{i}]overlay=x=(W-w)/2:y={y}:eof_action=pass[{out}]")
    prev = out

filter_complex = ";".join(fc)
cmd = ["ffmpeg", "-y", *inputs,
       "-filter_complex", filter_complex,
       "-map", f"[{prev}]", "-map", "0:a",
       "-c:v", "libx264", "-preset", "medium", "-crf", "20",
       "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart"]
if PREVIEW > 0:
    cmd += ["-t", str(PREVIEW)]
cmd += [OUT]

print("Render ->", OUT, "| overlays:", len(OV), "| preview:", PREVIEW or "FULL")
r = subprocess.run(cmd, capture_output=True, text=True)
if r.returncode != 0:
    print("FFMPEG ERROR:\n", r.stderr[-2500:])
    sys.exit(1)
print("DONE:", OUT, os.path.getsize(OUT), "bytes")
