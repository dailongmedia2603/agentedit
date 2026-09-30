#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test ban lam viec SDR cho video HDR (media_sdr.py) + moc lop tach nguoi dung khung (media_vision).
Chay (HOME tam de khong dung du lieu that):
    HOME=$(mktemp -d) ../CapCutAPI/.venv/bin/python tests/test_media_sdr.py

Can ffmpeg. Video HDR thu = H.264 gan nhan HLG/BT.2020 (ffprobe doc nhan, du 8-bit).
Cac dieu can dam bao (su co that 2026-09-26: video iPhone HDR -> nguoi bac mau / chay sang, lop tach
nguoi cham 1 khung):
  1. Nhan dien HDR theo transfer (HLG / PQ); video thuong KHONG bi dung toi (tra nguyen duong dan).
  2. HDR -> ban SDR BT.709, giu do dai + tieng; lan 2 dung cache; dua ban SDR vao lai van ra chinh no;
     dung lai KHONG doi gio sua ban SDR (khoa cache tach nguoi dua vao do); don cache theo lan dung cuoi.
  3. Khong co avconvert -> ffmpeg du phong van ra SDR; ca hai hong -> tra file goc, khong nem loi.
  4. working_sources: path = ban SDR, orig_path = file goc; ban SDR bi xoa -> tao lai tu orig_path.
  5. sdr_vf: bo loc chuyen HDR cho anh 1 khung; "" voi video thuong.
  6. Moc bat dau lop tach nguoi = khung nguon tai/ngay truoc giay yeu cau.
  7. build_spec: clip dung ban SDR, spec danh dau media=2, plan truyen vao khong bi sua.
"""
import os
import sys
import json
import time
import subprocess
import tempfile

SIDE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sidecar")
sys.path.insert(0, SIDE)

import media_sdr  # noqa: E402
import media_vision  # noqa: E402
import remotion_plan  # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)))
    if not cond:
        FAILED.append(name)


def section(t):
    print("\n" + t)


FF = remotion_plan._ffbin("ffmpeg")
WORK = tempfile.mkdtemp(prefix="sdr-test-")


def make(name, hdr, dur=3):
    out = os.path.join(WORK, name)
    argv = [FF, "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=30:duration=%s" % dur,
            "-f", "lavfi", "-i", "sine=frequency=440:duration=%s" % dur,
            "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"]
    if hdr:
        argv += ["-color_primaries", "bt2020", "-color_trc", "arib-std-b67", "-colorspace", "bt2020nc"]
    subprocess.run(argv + [out], check=True)
    return out


def transfer(p):
    r = subprocess.run([remotion_plan._ffbin("ffprobe"), "-v", "error", "-select_streams", "v:0",
                        "-show_entries", "stream=color_transfer", "-of", "csv=p=0", p], capture_output=True, text=True)
    return (r.stdout or "").strip()


# ---------------------------------------------------------------------------
section("[1] Nhan dien HDR")
sdr = make("sdr.mp4", False)
hdr = make("hdr.mp4", True)
check("video thuong khong phai HDR", media_sdr.is_hdr(sdr) is False, media_sdr.color_info(sdr))
check("HLG la HDR", media_sdr.is_hdr(hdr) is True, media_sdr.color_info(hdr))
check("video thuong -> tra nguyen duong dan", media_sdr.working_path(sdr) == sdr)
check("file khong ton tai -> tra nguyen", media_sdr.working_path("/khong/co.mp4") == "/khong/co.mp4")

# ---------------------------------------------------------------------------
section("[2] HDR -> ban lam viec SDR")
logs = []
t0 = time.time()
wp = media_sdr.working_path(hdr, log=logs.append)
check("tao ban SDR (file khac, trong cache)", wp != hdr and media_sdr.is_working_copy(wp) and os.path.isfile(wp), wp)
check("ban SDR la BT.709", transfer(wp) == "bt709", transfer(wp))
pi, pw = remotion_plan.probe(hdr), remotion_plan.probe(wp)
check("giu do dai", abs((pi["duration"] or 0) - (pw["duration"] or 0)) <= 0.5, (pi["duration"], pw["duration"]))
check("giu tieng", pw.get("has_audio") is True)
check("giu kich thuoc doc 720x1280", (pw.get("width"), pw.get("height")) == (720, 1280), (pw.get("width"), pw.get("height")))
check("co ghi nhat ky", any("SDR" in m for m in logs), logs)
t1 = time.time()
check("lan 2 dung cache (nhanh, cung file)", media_sdr.working_path(hdr) == wp and time.time() - t1 < 2)
check("dua ban SDR vao lai van ra chinh no", media_sdr.working_path(wp) == wp)
print("    (tao ban SDR mat %.1fs)" % (t1 - t0))
# Gio sua cua ban SDR KHONG duoc doi khi dung lai: tach nguoi / nhan mat / ban nen Gemini lay khoa cache
# theo gio sua -> doi la tao lai tu dau moi lan dung spec (su co that: ~100s moi lan)
old = time.time() - 3 * 86400
os.utime(wp, (old, old))
media_sdr.working_path(hdr)
check("dung lai khong doi gio sua ban SDR", abs(os.path.getmtime(wp) - old) < 1, os.path.getmtime(wp) - old)
check("co danh dau con dung", os.path.isfile(wp + media_sdr.USED_SUFFIX))
media_sdr._prune()
check("don cache giu ban con dung", os.path.isfile(wp))
very_old = time.time() - (media_sdr.KEEP_DAYS + 1) * 86400
os.utime(wp + media_sdr.USED_SUFFIX, (very_old, very_old))
os.utime(wp, (very_old, very_old))
media_sdr._prune()
check("don cache xoa ban lau khong dung (ca file danh dau)",
      not os.path.exists(wp) and not os.path.exists(wp + media_sdr.USED_SUFFIX))
wp = media_sdr.working_path(hdr)

# ---------------------------------------------------------------------------
section("[3] Du phong: khong co avconvert -> ffmpeg; hong het -> file goc")
hdr2 = make("hdr2.mp4", True)
orig_av = media_sdr.AVCONVERT
media_sdr.AVCONVERT = "/khong/co/avconvert"
wp2 = media_sdr.working_path(hdr2)
check("ffmpeg du phong ra SDR", wp2 != hdr2 and transfer(wp2) == "bt709", (wp2, transfer(wp2)))
hdr3 = make("hdr3.mp4", True)
orig_ff = media_sdr._via_ffmpeg
media_sdr._via_ffmpeg = lambda src, tmp, timeout: "ffmpeg loi gia"
logs = []
check("hong het -> tra file goc, khong nem loi", media_sdr.working_path(hdr3, log=logs.append) == hdr3)
check("bao ro dung file goc", any("file gốc" in m for m in logs), logs)
check("khong de lai file tam", not [n for n in os.listdir(media_sdr.CACHE_DIR) if ".part" in n], os.listdir(media_sdr.CACHE_DIR))
media_sdr.AVCONVERT, media_sdr._via_ffmpeg = orig_av, orig_ff

# ---------------------------------------------------------------------------
section("[4] working_sources")
svs = [{"id": "source_1", "path": hdr, "name": "hdr.mp4"}, {"id": "source_2", "path": sdr, "name": "sdr.mp4"}]
ws = media_sdr.working_sources(svs)
check("HDR: path = ban SDR, orig_path = goc", ws[0]["path"] == wp and ws[0]["orig_path"] == hdr, ws[0])
check("video thuong giu nguyen, khong them orig_path", ws[1] == svs[1], ws[1])
check("khong sua danh sach truyen vao", svs[0]["path"] == hdr and "orig_path" not in svs[0])
os.remove(wp)
ws2 = media_sdr.working_sources(ws)
check("ban SDR bi xoa -> tao lai tu orig_path", os.path.isfile(ws2[0]["path"]) and ws2[0]["orig_path"] == hdr, ws2[0])

# ---------------------------------------------------------------------------
section("[5] sdr_vf cho anh 1 khung")
check("video thuong -> ''", media_sdr.sdr_vf(sdr) == "")
check("HDR -> bo loc tonemap", media_sdr.sdr_vf(hdr).startswith("zscale=") and media_sdr.sdr_vf(hdr).endswith(","))
thumb = os.path.join(WORK, "t.jpg")
r = subprocess.run([FF, "-v", "error", "-y", "-i", hdr, "-frames:v", "1", "-vf", media_sdr.sdr_vf(hdr) + "scale=180:-2", thumb])
check("ffmpeg chay duoc voi bo loc", r.returncode == 0 and os.path.isfile(thumb))

# ---------------------------------------------------------------------------
section("[6] Moc bat dau lop tach nguoi dung khung")
g = media_vision.matte_grid_start
check("85.61s @30 -> khung 2568 (85.600)", abs(g(85.61, 30) - 2568 / 30.0) < 1e-9, g(85.61, 30))
check("dung khung giu nguyen", abs(g(2568 / 30.0, 30) - 2568 / 30.0) < 1e-9, g(2568 / 30.0, 30))
check("18.35s @30 -> khung 550", abs(g(18.35, 30) * 30 - 550) < 1e-6, g(18.35, 30) * 30)
check("@25 fps", abs(g(10.05, 25) * 25 - 251) < 1e-6, g(10.05, 25) * 25)
check("khong am", g(0.01, 30) == 0.0)

# ---------------------------------------------------------------------------
section("[7] build_spec dung ban SDR")
plan = {"engine": "remotion", "fps": 30,
        "source_videos": [{"id": "source_1", "path": hdr, "name": "hdr.mp4", "duration": 3}],
        "segments": [{"source_id": "source_1", "start": 0.0, "end": 2.5, "target_start": 0.0}],
        "captions": [], "audio": []}
spec, rep = remotion_plan.build_spec(plan)
paths = [c["path"] for c in (spec or {}).get("clips") or []]
check("spec dung duoc", bool(spec) and rep.get("ok"), rep)
check("clip dung ban SDR", paths and all(media_sdr.is_working_copy(p) for p in paths), paths)
check("spec danh dau media >= 2", (spec or {}).get("media") == remotion_plan.SPEC_MEDIA_VERSION >= 2, (spec or {}).get("media"))
check("plan truyen vao khong bi sua", plan["source_videos"][0]["path"] == hdr and "orig_path" not in plan["source_videos"][0])

# ---------------------------------------------------------------------------
print("\n" + "=" * 60)
if FAILED:
    print("CO %d TEST FAIL:" % len(FAILED))
    for f in FAILED:
        print("  - " + f)
    sys.exit(1)
print("TAT CA PASS")
