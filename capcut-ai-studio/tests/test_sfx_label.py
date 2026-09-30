#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kho SFX: Gemini NGHE file roi gan nhan (2026-09-27) + catalog day du cho AI lap plan.

Chay: HOME=$(mktemp -d) <venv_python> tests/test_sfx_label.py      (can ffmpeg + numpy)
Khong goi AI that: gia lap o tang providers._gemini_analyze_videos.
"""
import os
import sys
import json
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import engine          # noqa: E402
import providers       # noqa: E402
import prompt_store    # noqa: E402
import remotion_plan   # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:400]))
    if not cond:
        FAILED.append(name)


# 3 file: im 0.4s roi tieng 'bup' to o ~0.5s; file thu 2 binh thuong; file thu 3 mat
os.makedirs(engine.SFX_DIR, exist_ok=True)
ff = remotion_plan._ffbin("ffmpeg")
A = os.path.join(engine.SFX_DIR, "a.mp3")
subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                "sine=frequency=120:duration=0.3", "-af", "adelay=450|450,apad=pad_dur=0.8,volume=4",
                A], check=True)
B = os.path.join(engine.SFX_DIR, "b.mp3")
subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                "sine=frequency=900:duration=1.5", B], check=True)
lib = {"sfx": [
    {"id": "boom-1", "name": "FAHHH", "file": A, "source": "local", "emotion": "neutral",
     "use_when": "Diem nhan chung (dung tiet che)", "tags": []},
    {"id": "voice-2", "name": "10 diem", "file": B, "source": "local", "emotion": "neutral",
     "use_when": "Diem nhan chung (dung tiet che)", "tags": []},
    {"id": "mat-3", "name": "mat file", "file": "/khong/co.mp3", "source": "local", "emotion": "neutral",
     "use_when": "x", "tags": []},
] + [{"id": "x%d" % i, "name": "x%d" % i, "file": B, "source": "local", "emotion": "neutral",
      "use_when": "x", "tags": []} for i in range(30)]}
engine._save_lib(lib)

print("[1] Catalog gui DU kho cho AI lap plan (truoc cat o 24)")
check("33 muc", len(engine.sfx_catalog_for_plan()) == 33, len(engine.sfx_catalog_for_plan()))

print("\n[2] Gemini nghe theo nhom 5, model tra sai id o muc 2 -> khop theo thu tu")
GOI = []


def fake_analyze(videos, prompt, label, log=None, step_label=""):
    GOI.append({"files": [v["path"] for v in videos], "prompt": prompt, "step": step_label})
    return {"sfx": [
        {"id": videos[0]["id"], "summary": "tieng bass dap manh", "sound_type": "impact", "has_speech": False,
         "emotion": "punch", "intensity": "manh", "use_when": ["Ngay sau cau chot"], "avoid_when": "noi dung buon",
         "tags": ["boom", "dap"]},
        {"id": "sai-id", "summary": "giong nam hô 'muoi diem'", "sound_type": "voice_meme", "has_speech": True,
         "speech_text": "Muoi diem", "emotion": "khong-hop-le", "use_when": "Khi khen", "tags": []},
    ]}


providers._gemini_analyze_videos = fake_analyze
r = engine.sfx_label_with_ai(["boom-1", "voice-2", "mat-3", "khong-co"])
check("goi Gemini 1 luot cho 2 file con file", len(GOI) == 1 and GOI[0]["files"] == [A, B], GOI)
check("step_label Gemini-sfx (qua debug_log)", GOI and GOI[0]["step"] == "Gemini-sfx")
check("prompt co danh sach id + do dai", GOI and "id=boom-1" in GOI[0]["prompt"] and "dai " in GOI[0]["prompt"])
check("2 muc cap nhat", [e["id"] for e in r["updated"]] == ["boom-1", "voice-2"], r)
check("mat file + khong co -> failed", {f["id"] for f in r["failed"]} == {"mat-3", "khong-co"}, r["failed"])
by = {e["id"]: e for e in engine.sfx_list()}
a, b = by["boom-1"], by["voice-2"]
check("danh dau labeled_by gemini", a.get("labeled_by") == "gemini" and b.get("labeled_by") == "gemini")
check("ten user dat giu nguyen", a["name"] == "FAHHH" and b["name"] == "10 diem")
check("use_when mang -> chuoi", a["use_when"] == "Ngay sau cau chot", a["use_when"])
check("avoid_when chuoi -> mang", a["avoid_when"] == ["noi dung buon"], a.get("avoid_when"))
check("emotion sai -> giu cu", b["emotion"] == "neutral" and a["emotion"] == "punch")
check("has_speech + speech_text", b["has_speech"] is True and b["speech_text"] == "Muoi diem")
check("do dai do bang am thanh that (0.45 lang + 0.3 tieng + 0.8 dem = 1.55s)", abs((a.get("duration") or 0) - 1.55) < 0.1, a.get("duration"))
check("cu dam do bang am thanh that (~0.45-0.75s)", 0.4 <= (a.get("peak_time") or 0) <= 0.8, a.get("peak_time"))
check("do luon do to (lufs_m)", a.get("lufs_m") is not None)

print("\n[3] Catalog mang nhan Gemini; SFX co giong noi khong gui peak_time")
cat = {c["id"]: c for c in engine.sfx_catalog_for_plan()}
check("catalog co summary/sound_type/peak_time", cat["boom-1"].get("summary") and "peak_time" in cat["boom-1"], cat["boom-1"])
check("catalog co has_speech=false", cat["boom-1"].get("has_speech") is False)
check("giong noi: co speech_text, khong peak_time", cat["voice-2"].get("speech_text") and "peak_time" not in cat["voice-2"],
      cat["voice-2"])
check("catalog khong lo duong dan file", not any("file" in c for c in cat.values()))
check("limit uu tien muc Gemini da nghe", [c["id"] for c in engine.sfx_catalog_for_plan(limit=2)] == ["boom-1", "voice-2"])

print("\n[4] B7 giai thich truong nhan moi (ke ca khi user sua prompt _AUDIO_SYSTEM)")
SEEN = {}
providers.plan_chat = lambda messages, **k: (SEEN.setdefault("sys", messages[0]["content"]), json.dumps({"audio": []}))[1]
providers.gpt_audio({}, {}, engine.sfx_catalog_for_plan())
check("sys prompt B7 co giai thich peak_time + has_speech", "X - peak_time" in SEEN.get("sys", "") and
      "has_speech" in SEEN.get("sys", ""))

print("\n[5] Gemini loi o 1 nhom -> ca nhom vao failed, nhom sau van chay")
providers._gemini_analyze_videos = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("agy het han\nchi tiet"))
r = engine.sfx_label_with_ai(["boom-1"])
check("loi -> failed kem ly do dong dau", r["failed"] == [{"id": "boom-1", "error": "agy het han"}], r)

print("\n[6] Prompt dang ky trong menu Prompt & quy tac")
check("_GEMINI_SFX_PROMPT dang ky", "_GEMINI_SFX_PROMPT" in {p["id"] for p in prompt_store.PROMPTS})
check("_p lay duoc prompt", "SFX" in providers._p("_GEMINI_SFX_PROMPT"))

print("\n%s" % ("TAT CA OK" if not FAILED else "THAT BAI: %d" % len(FAILED)))
sys.exit(1 if FAILED else 0)
