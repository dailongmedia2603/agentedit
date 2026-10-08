#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test ban lam viec NET (media_sharp.py): video nho hon khung -> ban lanczos + lam net, giu tieng + moc khung.

Chay:  HOME=$(mktemp -d) <venv_python> tests/test_media_sharp.py
"""
import os
import sys
import shutil
import tempfile
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "sidecar"))

import remotion_plan as RP  # noqa: E402
import media_sdr  # noqa: E402
import media_sharp as MS  # noqa: E402

FAILS = []


def check(name, cond, detail=""):
    print(("  OK   " if cond else "  FAIL ") + name + ("" if cond else "  -> %s" % (detail,)))
    if not cond:
        FAILS.append(name)


def ff(*args):
    subprocess.run([RP._ffbin("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def audio_md5(p):
    r = subprocess.run([RP._ffbin("ffmpeg"), "-v", "error", "-i", p, "-map", "0:a:0", "-c", "copy", "-f", "md5", "-"],
                       capture_output=True, text=True)
    return r.stdout.strip()


def main():
    print("[1] kich thuoc ban net")
    check("480x854 trong khung doc -> phong lanczos + du phong zoom", MS.target_size(480, 854, 1080, 1920) == (1242, 2210),
          MS.target_size(480, 854, 1080, 1920))
    check("1080x1920 (du lon) -> khong tao ban", MS.target_size(1080, 1920, 1080, 1920) is None)
    check("4K doc -> khong tao ban", MS.target_size(2160, 3840, 1080, 1920) is None)
    check("video ngang trong khung doc (thu nho, nen mo) -> khong tao ban", MS.target_size(1920, 1080, 1080, 1920) is None)
    check("1040x1850 (phong < 5%) -> khong tao ban", MS.target_size(1040, 1850, 1080, 1920) is None)
    t = MS.target_size(320, 568, 1080, 1920)
    check("320x568 -> canh chan, phu khung", t and t[0] % 2 == 0 and t[1] % 2 == 0 and t[0] >= 1080 and t[1] >= 1920, t)
    t = MS.target_size(1280, 720, 1920, 1080)
    check("khung ngang: 720p ngang -> phong", t and t[0] >= 1920 and t[1] >= 1080, t)
    check("tran canh dai", max(MS.target_size(200, 356, 2160, 3840)) <= MS.MAX_SIDE, MS.target_size(200, 356, 2160, 3840))

    tmp = tempfile.mkdtemp(prefix="sharp-test-")
    try:
        print("[2] tao ban net that")
        src = os.path.join(tmp, "nho.mp4")
        ff("-f", "lavfi", "-i", "testsrc=size=360x640:rate=30:duration=4", "-f", "lavfi",
           "-i", "sine=frequency=440:duration=4", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p",
           "-c:a", "aac", src)
        logs = []
        out = MS.sharp_path(src, 1080, 1920, log=logs.append)
        info, si = RP.probe(out), RP.probe(src)
        check("tao ban net trong cache ban lam viec", out != src and media_sdr.is_working_copy(out), out)
        check("ban net phu khung", info.get("width") >= 1080 and info.get("height") >= 1920, info)
        check("giu do dai", abs((info.get("duration") or 0) - si["duration"]) <= 0.1, (info, si))
        check("giu nguyen tieng (bit-cho-bit)", audio_md5(out) == audio_md5(src) and audio_md5(src))
        check("bao cho nguoi dung", any("bản làm việc nét" in x for x in logs), logs)
        mt = os.path.getmtime(out)
        check("lan sau dung lai, khong tao lai", MS.sharp_path(src, 1080, 1920) == out and os.path.getmtime(out) == mt)
        check("dua ban net vao lai -> tra chinh no", MS.sharp_path(out, 1080, 1920) == out)
        check("media_sdr coi ban net la ban lam viec", media_sdr.working_path(out) == out)

        big = os.path.join(tmp, "lon.mp4")
        ff("-f", "lavfi", "-i", "testsrc=size=1080x1920:rate=30:duration=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", big)
        check("video du lon -> nguyen ban", MS.sharp_path(big, 1080, 1920) == big)

        print("[3] ap vao plan (idempotent)")
        plan = {"source_videos": [{"id": "source_1", "path": src}, {"id": "source_2", "path": big}]}
        ch = []
        MS.apply(plan, 1080, 1920, ch)
        s1, s2 = plan["source_videos"]
        check("nguon nho -> path ban net, orig_path file goc", s1["path"] == out and s1["orig_path"] == src, s1)
        check("nguon lon giu nguyen, khong them orig_path", s2 == {"id": "source_2", "path": big}, s2)
        check("ghi vao nhat ky sua", len(ch) == 1 and "lanczos" in ch[0], ch)
        again = media_sdr.working_sources(plan["source_videos"])
        check("lan dung sau media_sdr ve lai file goc", again[0]["path"] == src, again[0])
        MS.apply(plan, 1080, 1920, [])
        check("ap lai van ra cung ban net", plan["source_videos"][0]["path"] == out)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print("\n%s (%d loi)" % ("PASS" if not FAILS else "FAIL", len(FAILS)))
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
