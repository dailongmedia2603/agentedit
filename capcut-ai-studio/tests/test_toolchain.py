#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BO CONG CU (Doctor, 2026-09-28): manifest sidecar/assets/toolchain.json + requirements.lock + scripts/toolchain.py.

Chay: HOME=$(mktemp -d) <venv_python> tests/test_toolchain.py

Kiem:
  [1] manifest nhat quan: Chrome ghim = ban @remotion/renderer dang dung (TESTED_VERSION); lock co du goi chinh,
      moi dong 'ten==ban'; ma SHA-256 dung dinh dang; nguon tai la https
  [2] toolchain.py probe: tra du muc; goi sai / thieu phien ban bi bat
  [3] model Whisper: thieu file / sai kich thuoc / refs/main tro sai ban -> chua dat; du + dung -> dat
  [4] sidecar tim ffmpeg + CLI trong ~/.capcut-studio/tools/bin TRUOC (ban ghim cua app)
"""
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIDE = os.path.join(ROOT, "sidecar")
sys.path.insert(0, SIDE)
sys.path.insert(0, os.path.join(SIDE, "scripts"))

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:400]))
    if not cond:
        FAILED.append(name)


HOME = os.path.expanduser("~")
if "tmp" not in HOME and "/T/" not in HOME and not HOME.startswith("/var/folders"):
    print("Chay voi HOME tam: HOME=$(mktemp -d) <venv_python> tests/test_toolchain.py")
    sys.exit(2)

M = json.load(open(os.path.join(SIDE, "assets", "toolchain.json"), encoding="utf-8"))
HEX64 = re.compile(r"^[0-9a-f]{64}$")

print("\n[1] manifest")
renderer = os.path.join(ROOT, "node_modules", "@remotion", "renderer", "dist", "browser", "get-chrome-download-url.d.ts")
if os.path.isfile(renderer):
    m = re.search(r'TESTED_VERSION = "([^"]+)"', open(renderer, encoding="utf-8").read())
    check("Chrome ghim = ban @remotion/renderer dang dung", m and m.group(1) == M["chrome"]["version"],
          (m and m.group(1), M["chrome"]["version"]))
else:
    print("  (bo qua: chua co node_modules)")
lock = {}
for line in open(os.path.join(SIDE, M["python_packages"]["lock"]), encoding="utf-8"):
    line = line.split("#")[0].strip()
    if line:
        check("lock: dong '%s' dung dang ten==ban" % line, re.match(r"^[a-z0-9][a-z0-9._-]*==[0-9][^\s]*$", line), line)
        name, ver = line.split("==")
        lock[name] = ver
missing_top = [p for p in M["python_packages"]["top"] if p not in lock]
check("lock co du %d goi chinh" % len(M["python_packages"]["top"]), not missing_top, missing_top)
check("lock co faster-whisper + onnxruntime (VAD)", "faster-whisper" in lock and "onnxruntime" in lock)
check("ffmpeg: ma SHA-256 zip + tung file dung dinh dang",
      HEX64.match(M["ffmpeg"]["zip_sha256"]) and all(HEX64.match(f["sha256"]) and f["size"] > 1e6 for f in M["ffmpeg"]["files"].values()))
check("ffmpeg: nguon tai ghim theo MA COMMIT (khong phai nhanh main)",
      re.search(r"/raw/[0-9a-f]{40}/", M["ffmpeg"]["url"]), M["ffmpeg"]["url"])
check("whisper: revision 40 ky tu + ma tung file", re.match(r"^[0-9a-f]{40}$", M["whisper"]["revision"])
      and all(HEX64.match(f["sha256"]) for f in M["whisper"]["files"].values()))
check("codex: ban ghim co SHA-256 + tai tu github.com/openai/codex",
      HEX64.match(M["cli"]["codex"]["sha256"]) and M["cli"]["codex"]["url"].startswith("https://github.com/openai/codex/releases/download/rust-v%s/" % M["cli"]["codex"]["install_version"]))
check("moi nguon tai la https", all(u.startswith("https://") for u in (
    M["ffmpeg"]["url"], M["uv"]["installer"], M["cli"]["codex"]["url"], M["cli"]["claude"]["installer"], M["cli"]["agy"]["installer"])))
check("uv cai dung ban ghim", M["uv"]["install_version"] in M["uv"]["installer"])

import toolchain as TC  # noqa: E402

print("\n[2] probe (Python hien tai)")
r = subprocess.run([sys.executable, os.path.join(SIDE, "scripts", "toolchain.py"), "probe"], capture_output=True, text=True, timeout=120)
line = next((x for x in r.stdout.splitlines() if x.startswith("RESULT=")), "")
res = json.loads(line[7:]) if line else {}
check("probe tra du muc", all(k in res for k in ("python", "python_ok", "packages", "vision", "whisper")), r.stdout[-300:] + r.stderr[-300:])
check("probe dem du goi trong lock", (res.get("packages") or {}).get("total") == len(lock), res.get("packages"))
lock_tmp = os.path.join(tempfile.mkdtemp(), "lock.txt")
with open(lock_tmp, "w") as f:
    f.write("# thu\nrequests==0.0.1\ngoi-khong-co-that==1.0\n")
TC.MANIFEST["python_packages"]["lock"] = lock_tmp          # duong dan tuyet doi -> os.path.join giu nguyen
pk = TC.probe_packages()
check("bat goi SAI phien ban", any(w["name"] == "requests" and w["want"] == "0.0.1" for w in pk["wrong"]), pk)
check("bat goi THIEU", pk["missing"] == ["goi-khong-co-that"], pk)

print("\n[3] model Whisper")
hub = tempfile.mkdtemp(prefix="hf-hub-")
TC._hub_cache = lambda: hub
w = M["whisper"]
st = TC.probe_whisper()
check("chua tai -> chua dat, liet ke file thieu", not st["ok"] and set(st["missing"]) == set(w["files"]), st)
snap = os.path.join(TC._model_dir(), "snapshots", w["revision"])
os.makedirs(snap)
for name, meta in w["files"].items():
    with open(os.path.join(snap, name), "wb") as f:
        f.truncate(meta["size"])                           # file thua (sparse) dung kich thuoc
st = TC.probe_whisper()
check("du file nhung CHUA co refs/main -> chua dat (faster-whisper se khong nap duoc)", not st["ok"] and "refs/main" in st["detail"], st)
os.makedirs(os.path.join(TC._model_dir(), "refs"))
with open(os.path.join(TC._model_dir(), "refs", "main"), "w") as f:
    f.write("0" * 40)
check("refs/main tro ban khac -> chua dat", not TC.probe_whisper()["ok"])
with open(os.path.join(TC._model_dir(), "refs", "main"), "w") as f:
    f.write(w["revision"])
check("du file + dung ban -> dat", TC.probe_whisper()["ok"], TC.probe_whisper())
check("kiem day du (SHA-256) bat file gia", not TC.probe_whisper(full_hash=True)["ok"])
with open(os.path.join(snap, "model.bin"), "ab") as f:
    f.write(b"x")
check("sai kich thuoc -> chua dat", "model.bin" in TC.probe_whisper()["bad"])

print("\n[4] sidecar tim ban ghim cua app truoc")
tools = os.path.join(HOME, ".capcut-studio", "tools", "bin")
os.makedirs(tools, exist_ok=True)
fake = os.path.join(tools, "ffmpeg")
with open(fake, "w") as f:
    f.write("#!/bin/sh\n")
os.chmod(fake, 0o755)
import remotion_plan  # noqa: E402
import cli_providers  # noqa: E402
check("remotion_plan._ffbin -> ~/.capcut-studio/tools/bin/ffmpeg", remotion_plan._ffbin("ffmpeg") == fake, remotion_plan._ffbin("ffmpeg"))
check("cli_providers tim CLI o tools/bin truoc tien", cli_providers._EXTRA_DIRS[0] == tools, cli_providers._EXTRA_DIRS[:2])

print("\n" + ("TAT CA OK" if not FAILED else "THAT BAI: %d" % len(FAILED)))
sys.exit(1 if FAILED else 0)
