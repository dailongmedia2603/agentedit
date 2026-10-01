#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test NHAT KY XU LY theo tung lan tao video (panel "Nhat ky xu ly").

Chay: HOME=<thu muc tam> <venv_python> tests/test_run_log.py

Gia lap proxy OpenAI bang cach thay requests.post trong providers — nhu vay
duong goi AI THAT (_chat -> _openai_chat -> debug_log -> run_log) chay tron,
chi co mang la gia. Kiem:
  - request co "_run" -> ghi vao runs/<id>/events.jsonl: bat dau/ket thuc buoc,
    tung lan goi AI kem system prompt + du lieu gui + phan hoi, lan thu loi, guard
  - request KHONG co "_run" -> khong ghi gi (vd Kho meme, Doctor)
  - base64 video khong bao gio lot vao log
"""
import os
import sys
import json
import shutil
import tempfile
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import server        # noqa: E402
import providers     # noqa: E402
import engine        # noqa: E402
import meme_lib      # noqa: E402
import config        # noqa: E402
import run_log       # noqa: E402
import media_vision  # noqa: E402
import remotion_plan  # noqa: E402
import text_art      # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:300]))
    if not cond:
        FAILED.append(name)


if not run_log.RUNS_DIR.startswith(tempfile.gettempdir()) and "/scratchpad/" not in run_log.RUNS_DIR \
        and "/tmp" not in run_log.RUNS_DIR:
    print("Hay chay voi HOME=<thu muc tam> de khong ghi vao ~/.capcut-studio that")
    sys.exit(2)

VID_DIR = tempfile.mkdtemp(prefix="runlog-vid-")
SRC = os.path.join(VID_DIR, "a.mp4")
subprocess.run([remotion_plan._ffbin("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "testsrc=size=360x640:rate=30:duration=30",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=30", "-shortest",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", SRC], check=True)

BRIEF = {
    "source_videos": [{"id": "source_1", "path": SRC, "name": "a.mp4", "duration": 30.0}],
    "sources": [{
        "id": "source_1",
        "transcript": [{"start": 0.0, "end": 2.0, "text": "xin chao moi nguoi"}],
        "emotion_map": [{"start": 0, "end": 3, "emotion": "punch", "intensity": "high"}],
        "key_moments": [], "faces_region": "giua-tren",
    }],
    "style": "fast",
}
SEGS = [{"source_id": "source_1", "start": 0.0, "end": 3.0, "target_start": 0.0},
        {"source_id": "source_1", "start": 5.0, "end": 8.0, "target_start": 3.0}]

# Nhan dien buoc theo CAU MO DAU cua system prompt (tu khoa rieng le de trung giua cac prompt).
TRA_LOI = [
    ("Ban la EDITOR VIDEO chuyen chon chat lieu",
     {"selections": [{"source_id": "source_1", "start": 0, "end": 8}], "story_arc": "x"}),
    ("Ban la EDITOR chuyen dung timeline", {"segments": SEGS, "duration": 6.0}),
    ("Ban la EDITOR short-form. Nhiem vu DUY NHAT", {"hook": None}),
    ("Ban la MOTION DESIGNER", {"scenes": [], "assets": [], "transitions": [], "effects": [],
                                "layers": [{"id": "t1", "type": "text", "source_id": "source_1",
                                            "src_start": 5.5, "src_end": 7.0,
                                            "spans": [{"text": "CHAO", "size": 70}]}]}),
    ("Ban la COPYWRITER", {"captions": [{"text": "Xin chao", "source_id": "source_1",
                                         "src_start": 0.0, "src_end": 2.0, "role": "hero"}]}),
]
dem = {"B1": 0, "calls": 0}


class FakeResp:
    def __init__(self, code, content):
        self.status_code = code
        self._content = content
        self.text = content if code != 200 else json.dumps({"choices": [{"message": {"content": content}}]})

    def json(self):
        return {"choices": [{"message": {"content": self._content}, "finish_reason": "stop"}]}


def fake_post(url, headers=None, timeout=None, json=None, **k):
    dem["calls"] += 1
    sys_p = next((m["content"] for m in json["messages"] if m["role"] == "system"), "")
    if sys_p.startswith(TRA_LOI[0][0]) and dem["B1"] == 0:
        dem["B1"] += 1
        return FakeResp(500, "proxy loi tam thoi")
    for key, ans in TRA_LOI:
        if sys_p.startswith(key):
            import json as _j
            return FakeResp(200, _j.dumps(ans, ensure_ascii=False))
    return FakeResp(200, '{"ok": true}')


providers.requests.post = fake_post
providers.time.sleep = lambda s: None
server._can_gio_loi_noi = lambda brief: brief   # can gio Whisper co test rieng
media_vision.face_box = lambda *a, **k: None    # Vision co test rieng
text_art.gen_sheet = lambda *a, **k: None       # chu anh AI (Codex) co test rieng — khong goi CLI that
engine.sfx_catalog_for_plan = lambda *a, **k: []
meme_lib.meme_catalog_for_plan = lambda *a, **k: []
config.set_providers({
    "gpt": {"base_url": "http://fake/v1", "api_key": "k", "model": "gpt-fake", "auth_mode": "api_key"},
    "gemini": {"base_url": "http://fake/v1", "api_key": "k", "model": "gem-fake", "auth_mode": "api_key"},
})
# Test di duong HTTP API gia cua GPT -> chon RO (tu 2026-10-01 mac dinh la Claude qua CLI subscription)
os.environ["STUDIO_PLANNER_TEST"] = "gpt"   # app that luon dung Claude; test mo duong GPT bang bien moi truong

RID = "p_test_runlog"
with server.app.test_client() as c:
    r = c.post("/remotion/autoplan", json={"brief": BRIEF, "fresh": True,
                                           "_run": {"id": RID, "label": "test"}})
    check("remotion/autoplan chay xong", r.status_code == 200 and r.get_json().get("ok"),
          r.get_data(as_text=True)[:400])
    # request khong co _run -> khong ghi
    c.post("/remotion/autoplan", json={"brief": BRIEF, "fresh": True})

evs = run_log.read(RID)["events"]
kinds = [e["kind"] for e in evs]
print("  (%d su kien: %s)" % (len(evs), ", ".join(sorted(set(kinds)))))
check("co stage_start + stage_end", kinds[0] == "stage_start" and "stage_end" in kinds, kinds[:3])
end = [e for e in evs if e["kind"] == "stage_end"][-1]
check("stage_end ok + co tom tat plan", end["level"] == "ok" and end["result"]["clip"] >= 2
      and len(end["result"]["plan_cuoi"]["segments"]) == 2, end)
calls = [e for e in evs if e["kind"] == "ai_call"]
check("ghi du system prompt", any("chon chat lieu" in (e.get("system_prompt") or "") for e in calls))
check("ghi du lieu gui di (in dep)", any('"source_analysis"' in (e.get("user_message") or "") for e in calls))
resps = [e for e in evs if e["kind"] == "ai_response"]
check("moi phan hoi gan dung call_id", all(x.get("call_id") in {c["id"] for c in calls} for x in resps))
check("phan hoi co thoi luong + noi dung", all(x.get("duration") is not None and x.get("raw_text") for x in resps))
fails = [e for e in evs if e["kind"] == "ai_error" and e["level"] == "warn"]
check("lan thu loi (HTTP 500) duoc ghi", any("HTTP 500" in (f.get("error") or "") for f in fails), fails)
b1 = [e for e in calls if e["step"] == "B1-select"]
check("lan thu 2 danh so attempt=2", [e.get("attempt") for e in b1] == [1, 2], [e.get("attempt") for e in b1])
check("co su kien guard", "guard" in kinds)
check("co ket qua buoc thiet ke R4", any(e["kind"] == "result" and e["step"] == "R4-design" for e in evs))
check("co ket qua tung buoc B1..", any(e["kind"] == "result" and e["step"] == "B2-timeline" for e in evs))
check("hieu ung tu viet chay mac dinh (khong gui edit_flow) va co ghi nhat ky",
      any(e["kind"] == "result" and e["step"] == "FX-code" for e in evs))
n_files = len(os.listdir(run_log.RUNS_DIR))
check("request khong co _run khong tao log", n_files == 1, os.listdir(run_log.RUNS_DIR))

# base64 video khong lot vao log
run_log.set_run({"id": RID})
run_log.ai_call("Gemini-sources", "gemini", "g", "", [
    {"type": "text", "text": "xem video"},
    {"type": "image_url", "image_url": {"url": "data:video/mp4;base64," + "A" * 5000}}])
run_log.set_run(None)
last = run_log.read(RID)["events"][-1]
check("khong ghi base64 video", "AAAA" not in json.dumps(last), last.get("user_message", "")[:200])

shutil.rmtree(VID_DIR, ignore_errors=True)

print("\n" + "=" * 60)
if FAILED:
    print("FAIL %d: %s" % (len(FAILED), ", ".join(FAILED)))
    raise SystemExit(1)
print("TAT CA PASS")
