#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tach nen 1 anh -> PNG TRONG SUOT (de overlay phan tu len video, khong che het).
Chay bang VENV.  2 che do:
  - chroma (mac dinh): anh sinh tren NEN XANH/MAGENTA dong nhat -> ffmpeg colorkey. Nhanh, sach cho chu/graphic.
  - rembg: tach nen bang AI (cho object/anh phuc tap). Can: uv pip install rembg onnxruntime.

  <venv> cutout.py <in.png> <out.png> [--color 0x00FF00] [--sim 0.30] [--blend 0.12]
  <venv> cutout.py <in.png> <out.png> --rembg
"""
import os, sys, argparse, subprocess
import static_ffmpeg; static_ffmpeg.add_paths()

def chroma(inp, out, color, sim, blend):
    vf = "colorkey=%s:%s:%s,despill=type=green,format=rgba" % (color, sim, blend)
    # despill chi dung cho green; neu khong phai green thi bo
    if "00ff00" not in color.lower() and "0x00ff00" not in color.lower():
        vf = "colorkey=%s:%s:%s,format=rgba" % (color, sim, blend)
    r = subprocess.run(["ffmpeg", "-y", "-i", inp, "-vf", vf, out],
                       capture_output=True, text=True)
    if r.returncode != 0:
        # fallback khong despill
        r = subprocess.run(["ffmpeg", "-y", "-i", inp, "-vf",
                            "colorkey=%s:%s:%s,format=rgba" % (color, sim, blend), out],
                           capture_output=True, text=True)
        if r.returncode != 0:
            raise SystemExit("ffmpeg loi:\n" + r.stderr[-1500:])

def rembg_cut(inp, out):
    try:
        from rembg import remove
        from PIL import Image
    except ImportError:
        raise SystemExit("Thieu rembg. Cai: uv pip install --python <venv> rembg onnxruntime")
    img = Image.open(inp)
    remove(img).save(out)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inp"); ap.add_argument("out")
    ap.add_argument("--color", default="0x00FF00")
    ap.add_argument("--sim", default="0.30")
    ap.add_argument("--blend", default="0.12")
    ap.add_argument("--rembg", action="store_true")
    a = ap.parse_args()
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    if a.rembg:
        rembg_cut(a.inp, a.out)
    else:
        chroma(a.inp, a.out, a.color, a.sim, a.blend)
    print("CUTOUT_OK=" + os.path.abspath(a.out))

if __name__ == "__main__":
    main()
