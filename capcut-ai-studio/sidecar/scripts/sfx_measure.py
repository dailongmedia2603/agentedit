#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Do do to (momentary max LUFS) cua toan bo kho SFX va luu vao sfx_library.json.

  python3 sfx_measure.py [--lai]

Khong co so do to thi plan_guard phai doan cuong do theo LOAI tieng; co roi thi
no can duoc cho moi tieng nghe deu nhau. Chay mot lan sau khi them SFX moi
(hoac cu de trong — engine tu do lan dau dung toi tung file).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import engine  # noqa: E402
import plan_guard as guard  # noqa: E402

lam_lai = "--lai" in sys.argv
rows = engine.sfx_list()
print("Kho SFX: %d file" % len(rows))
for e in rows:
    if lam_lai:
        e.pop("lufs_m", None)
    cu = e.get("lufs_m")
    val = engine.sfx_loudness(e)
    fam = guard.sfx_family({"_name": e.get("name"), "_emotion": e.get("emotion"),
                            "use_when": e.get("use_when"), "tags": e.get("tags")})
    if val is None:
        print("  ?  %-34s khong do duoc (thieu ffmpeg?)" % e.get("name", "")[:33])
        continue
    print("  %s %-34s %-7s M=%6.1f -> volume %.2f"
          % ("." if cu is not None else "+", e.get("name", "")[:33], fam, val,
             guard.sfx_base_volume(fam, val)))
print("Xong. (+ = moi do, . = da co san)")
