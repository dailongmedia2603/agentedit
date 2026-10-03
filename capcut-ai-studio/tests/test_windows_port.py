#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test phan PORT WINDOWS cua sidecar (2026-10-01). Chay duoc tren macOS (gia lap nhanh Windows) va Windows:
  HOME=$(mktemp -d) ../CapCutAPI/.venv/bin/python tests/test_windows_port.py
  (Windows: $env:USERPROFILE = thu muc tam; dung python nhung resources\\python\\python.exe)
Phan [6] (model ONNX that) chi chay khi co model: STUDIO_MODELS_DIR=<thu muc model> (scripts/bundle-models.mjs +
BiRefNet), khong co -> bo qua.

Can dam bao:
  1. Claude CLI tren Windows: system prompt qua FILE (--system-prompt-file) — dong lenh Windows <= 32767 ky tu
     (system R4 ~30K); macOS giu --system-prompt nhu cu
  2. agy tren Windows: prompt qua STDIN (stream-json, `-p=` rong); doc ket qua dong {"event":"result"}; macOS giu -p
  3. winsupport: ffbin -> ffmpeg.exe trong tools/bin; node_env them SYSTEMROOT/TEMP tren Windows; macOS env y cu
  4. media_vision._mask_name chi doi TEN file (duong dan co 'f_' khong bi ghi nham thu muc)
  5. requirements.lock theo nen tang: _marker_ok
  6. vision_onnx (neu co model): mat / tach nguoi / tach nen / OCR / SVG dung dang ket qua
"""
import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIDE = os.path.join(ROOT, "sidecar")
sys.path.insert(0, SIDE)
sys.path.insert(0, os.path.join(SIDE, "scripts"))

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:500]))
    if not cond:
        FAILED.append(name)


HOME = os.path.expanduser("~")
_h = HOME.replace("\\", "/").lower()
if "tmp" not in _h and "/t/" not in _h and "/temp/" not in _h and not _h.startswith("/var/folders"):
    print("Chay voi HOME tam: HOME=$(mktemp -d) <python> tests/test_windows_port.py")
    sys.exit(2)

import cli_providers as C  # noqa: E402
import winsupport  # noqa: E402
import media_vision  # noqa: E402
import toolchain as TC  # noqa: E402

# ---------------------------------------------------------------------------
print("[1] Claude CLI: system prompt qua file tren Windows")
calls = []


def fake_run(argv, stdin_text=None, timeout=60, cwd=None, env=None):
    sp = None
    if "--system-prompt-file" in argv:
        with open(argv[argv.index("--system-prompt-file") + 1], encoding="utf-8") as f:
            sp = f.read()
    calls.append({"argv": list(argv), "stdin": stdin_text, "sp_file": sp})
    return 0, json.dumps({"type": "result", "is_error": False, "result": "{\"ok\": 1}", "usage": {}}), ""


ORIG_RUN, ORIG_WIN, ORIG_FIND_BIN = C._run, C.IS_WIN, C.find_bin
C._run = fake_run
BIG = "QUY TẮC R4 — chữ tiếng Việt có dấu. " * 1200          # ~43K ky tu > gioi han dong lenh Windows
try:
    C.IS_WIN = True
    out = C._claude_chat("/fake/claude.exe", "claude-opus-5", BIG, "USER", 60, "R4")
    a = calls[-1]["argv"]
    check("Windows: dung --system-prompt-file, KHONG con --system-prompt", "--system-prompt-file" in a and "--system-prompt" not in a, a)
    check("Windows: file system prompt dung NGUYEN noi dung (UTF-8)", calls[-1]["sp_file"] == BIG)
    check("Windows: dong lenh ngan (< 2000 ky tu)", sum(len(x) + 1 for x in a) < 2000, sum(len(x) for x in a))
    check("Windows: user prompt van qua stdin", calls[-1]["stdin"] == "USER")
    check("ket qua tra ve dung", out == "{\"ok\": 1}", out)
    C.IS_WIN = False
    C._claude_chat("/fake/claude", "claude-opus-5", "SYS", "USER", 60, "R4")
    a = calls[-1]["argv"]
    check("macOS: giu --system-prompt <chuoi> nhu cu", "--system-prompt" in a and a[a.index("--system-prompt") + 1] == "SYS"
          and "--system-prompt-file" not in a, a)
finally:
    C._run, C.IS_WIN = ORIG_RUN, ORIG_WIN

# ---------------------------------------------------------------------------
print("[2] agy: prompt qua stdin (stream-json) tren Windows")
try:
    C.IS_WIN = True
    argv, stdin = C._agy_argv("C:\\agy\\agy.exe", BIG, "gemini-3.1-pro-high", 900)
    check("Windows: argv KHONG chua prompt", BIG not in " ".join(argv) and "-p=" in argv and "--input-format" in argv
          and argv[argv.index("--input-format") + 1] == "stream-json", argv)
    msg = json.loads(stdin)
    check("Windows: stdin = 1 dong {event:user, message:{content}} dung nguyen prompt",
          msg == {"event": "user", "message": {"content": BIG}} and stdin.endswith("\n"))
    check("Windows: van co --model + --print-timeout", "--model" in argv and "--print-timeout" in argv)
    C.IS_WIN = False
    argv2, stdin2 = C._agy_argv("/x/agy", "ngan", "m", 60)
    check("macOS: giu -p <prompt> --output-format json", argv2[1:3] == ["-p", "ngan"] and "json" in argv2 and stdin2 == "", argv2)
finally:
    C.IS_WIN = ORIG_WIN
stream = "\n".join([
    json.dumps({"event": "init", "conversation_id": "c1"}),
    json.dumps({"event": "step_update", "step_update": {"text_delta": "SO"}}),
    json.dumps({"event": "result", "result": {"conversation_id": "c1", "status": "SUCCESS", "response": "SO=47\n"}}),
])
r = C._agy_result(stream)
check("doc ket qua stream-json (dong event=result)", isinstance(r, dict) and r.get("response") == "SO=47\n", r)
r2 = C._agy_result(json.dumps({"conversation_id": "c2", "status": "SUCCESS", "response": "ok"}))
check("doc ket qua json thuong (macOS) nhu cu", r2.get("response") == "ok", r2)
check("conv_id co \\ / : -> khong xoa gi (chan leo thu muc)", C._agy_cleanup(tempfile.mkdtemp(), "..\\x") == 0
      and C._agy_cleanup(tempfile.mkdtemp(), "C:x") == 0)

# ---------------------------------------------------------------------------
print("[2b] Claude: bo bien API key / router khi chay o che do goi subscription")
os.environ.update({"ANTHROPIC_AUTH_TOKEN": "sk-router", "ANTHROPIC_BASE_URL": "http://127.0.0.1:20128", "ANTHROPIC_API_KEY": "sk-x"})
ce = C._claude_env()
check("_claude_env bo ANTHROPIC_AUTH_TOKEN / BASE_URL / API_KEY", not any(k in ce for k in C.CLAUDE_KEY_ENV), [k for k in ce if k.startswith("ANTHROPIC")])
seen = {}


def fake_status(argv, stdin_text=None, timeout=60, cwd=None, env=None):
    seen["env"] = env
    if argv[1:] == ["--version"]:
        return 0, "2.1.286 (Claude Code)", ""
    return 0, json.dumps({"loggedIn": True, "authMethod": "oauth_token"}), ""


C._run, C.find_bin = fake_status, lambda n: "/fake/claude"
try:
    st = C.cli_status("claude")
    check("auth status chay KHONG kem bien router", seen["env"] is not None and "ANTHROPIC_AUTH_TOKEN" not in seen["env"])
    check("authMethod khac claude.ai + CHUA co phien Claude.ai -> chua dang nhap", not st["logged_in"], st.get("detail"))
    cfg = tempfile.mkdtemp()
    with open(os.path.join(cfg, ".credentials.json"), "w", encoding="utf-8") as f:
        json.dump({"claudeAiOauth": {"accessToken": "a", "refreshToken": "r"}}, f)
    os.environ["CLAUDE_CONFIG_DIR"] = cfg
    st = C.cli_status("claude")
    check("router trong settings.json nhung CO phien Claude.ai -> da dang nhap", st["logged_in"], st.get("detail"))
finally:
    C._run, C.find_bin = ORIG_RUN, ORIG_FIND_BIN
    for k in ("ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_API_KEY", "CLAUDE_CONFIG_DIR"):
        os.environ.pop(k, None)

# ---------------------------------------------------------------------------
print("[2c] agy: nhan biet phien dang nhap (Windows luu trong Credential Manager, khong co file)")
import shutil  # noqa: E402
shutil.rmtree(C.AGY_HOME, ignore_errors=True)
check("chua co gi -> chua dang nhap", not C.agy_logged_in())
os.makedirs(C.AGY_HOME, exist_ok=True)
open(os.path.join(C.AGY_HOME, "keyring-marker-jetski"), "w").close()
check("co file danh dau keyring-marker-* -> da dang nhap", C.agy_logged_in())
os.remove(os.path.join(C.AGY_HOME, "keyring-marker-jetski"))
saved_win, saved_cred = C.IS_WIN, C._windows_cred_has_agy
try:
    C.IS_WIN = True
    C._windows_cred_has_agy = lambda: True
    check("Windows: muc antigravity trong Credential Manager -> da dang nhap", C.agy_logged_in())
    C._windows_cred_has_agy = lambda: False
    check("Windows: khong file, khong muc Credential Manager -> chua", not C.agy_logged_in())
finally:
    C.IS_WIN, C._windows_cred_has_agy = saved_win, saved_cred
# macOS: agy 1.2.14 luu phien trong Keychain (service "gemini", account "antigravity"), khong co file (Mac moi 2026-10-02)
saved_kc = C._mac_keychain_has_agy
try:
    C._mac_keychain_has_agy = lambda: True
    check("macOS: muc Keychain gemini/antigravity -> da dang nhap", C.agy_logged_in() == (sys.platform == "darwin"))
    C._mac_keychain_has_agy = lambda: False
    check("macOS: khong file, khong muc Keychain -> chua", not C.agy_logged_in())
finally:
    C._mac_keychain_has_agy = saved_kc
if sys.platform == "darwin":
    # HOME tam -> security khong thay login keychain that -> ma 44 (test khong dung Keychain that)
    C._KEYCHAIN["at"] = 0.0
    check("macOS: lenh security that, HOME tam -> khong co muc", not C._mac_keychain_has_agy())

# ---------------------------------------------------------------------------
print("[3] winsupport")
tools = os.path.join(HOME, ".capcut-studio", "tools", "bin")
os.makedirs(tools, exist_ok=True)
saved = winsupport.IS_WIN
try:
    winsupport.IS_WIN = True
    check("exe(): ffmpeg -> ffmpeg.exe", winsupport.exe("ffmpeg") == "ffmpeg.exe" and winsupport.exe("a.cmd") == "a.cmd")
    open(os.path.join(tools, "ffmpeg.exe"), "w").close()
    check("ffbin -> tools/bin/ffmpeg.exe", winsupport.ffbin("ffmpeg") == os.path.join(tools, "ffmpeg.exe"), winsupport.ffbin("ffmpeg"))
    check("ffbin chua cai -> ten tran .exe (PATH)", winsupport.ffbin("ffprobe") == "ffprobe.exe")
    os.environ.setdefault("SYSTEMROOT", "C:\\Windows")
    env = winsupport.node_env("P")
    check("node_env Windows co SYSTEMROOT (Node khoi dong can)", env.get("SYSTEMROOT") and env["PATH"] == "P", env)
finally:
    winsupport.IS_WIN = saved
if not winsupport.IS_WIN:
    env = winsupport.node_env()
    check("node_env macOS chi PATH + HOME (y cu)", set(env) == {"PATH", "HOME"}, env)
    check("parent_alive(pid hien tai)", winsupport.parent_alive(os.getpid()) and not winsupport.parent_alive(999999))

# ---------------------------------------------------------------------------
print("[4] media_vision._mask_name")
p = os.path.join("C:\\Users\\Jeff_x" if os.name == "nt" else "/tmp/Jeff_f_x", "matte-f_1", "f_00012.jpg")
m = media_vision._mask_name(p)
check("chi doi ten file, giu thu muc", os.path.dirname(m) == os.path.dirname(p) and os.path.basename(m) == "m_00012.png", m)

# ---------------------------------------------------------------------------
print("[5] requirements.lock theo nen tang")
check("_marker_ok: dung / sai / rong", TC._marker_ok('sys_platform == "%s"' % sys.platform)
      and not TC._marker_ok('sys_platform == "win32"' if sys.platform != "win32" else 'sys_platform == "darwin"')
      and TC._marker_ok(""))
lk = TC._lock()
if sys.platform == "win32":
    check("Windows: khong co pyobjc, co resvg-py / pillow-heif / colorama",
          not any(k.startswith("pyobjc") for k in lk) and all(k in lk for k in ("resvg-py", "pillow-heif", "colorama")), sorted(lk))
else:
    check("macOS: co pyobjc, khong co goi chi-Windows", any(k.startswith("pyobjc") for k in lk)
          and not any(k in lk for k in ("resvg-py", "pillow-heif", "colorama")), sorted(lk))

# ---------------------------------------------------------------------------
print("[6] vision_onnx (model that)")
import vision_onnx as V  # noqa: E402
if not (V.has(V.YUNET) and V.has(V.RVM) and V.ocr_ready()):
    print("  (bo qua: chua co model — STUDIO_MODELS_DIR=<thu muc model>)")
else:
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont
    d = tempfile.mkdtemp()
    # khung "nguoi" gia: hinh elip sang tren nen toi (RVM van phai ra mat na hop le, dung kich thuoc)
    frames = []
    for i in range(6):
        im = Image.new("RGB", (360, 640), (20, 30, 40))
        ImageDraw.Draw(im).ellipse((100 + i * 4, 120, 260 + i * 4, 600), fill=(200, 170, 150))
        fp = os.path.join(d, "f_%05d.jpg" % (i + 1))
        im.save(fp)
        frames.append(fp)
    ok = V.person_masks(frames)
    masks = [os.path.join(d, "m_%05d.png" % (i + 1)) for i in range(6)]
    check("RVM: du mat na m_*.png, dung kich thuoc khung", ok and all(os.path.isfile(x) and Image.open(x).size == (360, 640)
                                                                    for x in masks))
    fs = V.faces(frames[0])
    check("YuNet: tra danh sach {x,y,w,h,conf} so thuc", isinstance(fs, list) and all(
        set(f) == {"x", "y", "w", "h", "conf"} and all(isinstance(v, float) for v in f.values()) for f in fs), fs)
    json.dumps(fs)  # phai ghi duoc JSON (truoc day float32 lam face_box hong)
    im = Image.new("RGBA", (1100, 170), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((10, 10), "GIAM GIA HOM NAY", font=ImageFont.load_default(size=110), fill=(255, 220, 0, 255),
                            stroke_width=5, stroke_fill=(0, 0, 0, 255))
    txt, words = V.ocr(np.asarray(im.crop(im.getbbox())), want_words=True)
    import text_art
    check("OCR: doc dung (so khop bo dau >= 0.72) + 4 khung tu tang dan", txt and text_art._sim(txt, "GIAM GIA HOM NAY") >= 0.72
          and len(words) == 4 and all(words[i][1] <= words[i + 1][0] + 0.02 for i in range(3)), (txt, words))
    r = V.raster_svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920"><rect width="540" height="1920" fill="#000"/></svg>')
    check("resvg: phu nua khung = 0.5", r is not None and abs(float(r[..., 3].mean()) - 0.5) < 0.01)
    if V.has(V.CUT):
        src = os.path.join(d, "sp.png")
        im = Image.new("RGB", (800, 800), (235, 235, 235))
        ImageDraw.Draw(im).ellipse((250, 200, 550, 650), fill=(200, 40, 40))
        im.save(src)
        out = V.cutout(src, os.path.join(d, "sp_cut.png"))
        cut = Image.open(out) if out else None
        check("BiRefNet: PNG RGBA cat SAT chu the (nho hon anh goc)", cut is not None and cut.mode == "RGBA"
              and cut.size[0] < 800 and cut.size[1] < 800, cut and cut.size)
    else:
        print("  (bo qua BiRefNet: chua tai model tach nen)")

print("\n" + ("TAT CA OK" if not FAILED else "THAT BAI: %d" % len(FAILED)))
sys.exit(1 if FAILED else 0)
