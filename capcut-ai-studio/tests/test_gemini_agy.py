#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test Gemini qua ANTIGRAVITY CLI (`agy`, tai khoan Google) — dung 1 chuong trinh `agy` GIA.
Chay (HOME tam — BAT BUOC, test ghi ~/.gemini/antigravity-cli gia):
    HOME=$(mktemp -d) ../CapCutAPI/.venv/bin/python tests/test_gemini_agy.py

KHONG goi mang, KHONG can tai khoan. `agy` gia (dat o $HOME/.local/bin) mo phong dung hanh vi da
do tren agy 1.2.11 that (2026-09-26):
  - `agy -p ... --output-format json` -> {"conversation_id","status","response","usage"} / status ERROR
  - model xem video qua view_file -> agy luu conversations/<id>.db + brain/<id>/.tempmediaStorage/*.mp4
  - `agy models` -> "slug<TAB>Ten"

Cac dieu can dam bao:
  1. cli_status: tim thay agy, dang nhap = CO file antigravity-oauth-token, danh sach model tu `agy models`.
  2. Goi video: prompt qua -p kem duong dan TUYET DOI tung video (file ton tai luc goi), --output-format
     json --disable-slash-commands --print-timeout --model; chay trong thu muc lam viec rieng; xong thi
     xoa job + hoi thoai (2 ban sao video) cua DUNG lan goi, khong dung hoi thoai khac.
  3. Model KHONG mo xem video -> loi (khong dung ket qua doan).
  4. Loi dang nhap / het han muc / sai model -> thong bao tieng Viet doc duoc.
  5. File > 100 MB bi chan truoc khi chay.
  6. Ten model cu cua Gemini CLI (da luu) duoc doi sang ten cua agy.
  7. providers: che do subscription cua gemini di duong agy (video lan chi chu), test_connection.
"""
import os
import sys
import json
import stat
import tempfile

SIDE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sidecar")
sys.path.insert(0, SIDE)

HOME = os.path.expanduser("~")
if not HOME.startswith(tempfile.gettempdir()) and "/var/folders/" not in HOME and not HOME.startswith("/tmp"):
    print("Chay voi HOME tam: HOME=$(mktemp -d) python tests/test_gemini_agy.py")
    sys.exit(2)

import config  # noqa: E402
import cli_providers  # noqa: E402
import providers  # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)))
    if not cond:
        FAILED.append(name)


def section(t):
    print("\n" + t)


LOG = os.path.join(HOME, "fake_agy.jsonl")
BIN_DIR = os.path.join(HOME, ".local", "bin")
os.makedirs(BIN_DIR, exist_ok=True)
FAKE = os.path.join(BIN_DIR, "agy")
AGY_HOME = os.path.join(HOME, ".gemini", "antigravity-cli")
with open(FAKE, "w") as f:
    f.write(r'''#!/usr/bin/env python3
import os, sys, json, re, shutil, uuid
args = sys.argv[1:]
if "--version" in args:
    print("1.2.11"); sys.exit(0)
if args[:1] == ["models"]:
    print("Fetching available models...")
    print("gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)")
    print("gemini-3.1-pro-high\tGemini 3.1 Pro (High)")
    print("claude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)")
    sys.exit(0)
prompt = args[args.index("-p") + 1] if "-p" in args else ""
model = args[args.index("--model") + 1] if "--model" in args else ""
paths = re.findall(r"^\d+\. (/\S+)$", prompt, re.M)
home = os.path.expanduser("~/.gemini/antigravity-cli")
conv = str(uuid.uuid4())
rec = {"argv": args, "cwd": os.getcwd(), "prompt": prompt, "paths": paths,
       "exists": [os.path.isfile(p) for p in paths], "sizes": [os.path.getsize(p) if os.path.isfile(p) else None for p in paths],
       "conv": conv}
with open(os.environ["FAKE_AGY_LOG"], "a") as f:
    f.write(json.dumps(rec, ensure_ascii=False) + "\n")
mode = os.environ.get("FAKE_AGY_MODE", "ok")
if mode == "badmodel":
    sys.stderr.write("Error: unknown model %r\n" % model); sys.exit(1)
os.makedirs(os.path.join(home, "conversations"), exist_ok=True)
open(os.path.join(home, "conversations", conv + ".db"), "w").write("x" * 3000)
media = os.path.join(home, "brain", conv, ".tempmediaStorage")
os.makedirs(media, exist_ok=True)
if mode not in ("noview",):
    for i, p in enumerate(paths):
        if os.path.isfile(p):
            shutil.copyfile(p, os.path.join(media, "media_%d.mp4" % i))
out = {"conversation_id": conv, "status": "SUCCESS", "response": os.environ.get("FAKE_AGY_REPLY", '{"ping": "ok"}'),
       "duration_seconds": 1.5, "num_turns": 1, "usage": {"input_tokens": 100, "output_tokens": 10}}
if mode == "auth":
    out = {"conversation_id": conv, "status": "ERROR", "error": "authentication required: please sign in"}
if mode == "quota":
    out = {"conversation_id": conv, "status": "ERROR", "error": "429 RESOURCE_EXHAUSTED: quota exceeded"}
print(json.dumps(out))
sys.exit(0 if out["status"] == "SUCCESS" else 1)
''')
os.chmod(FAKE, os.stat(FAKE).st_mode | stat.S_IEXEC)
os.environ["FAKE_AGY_LOG"] = LOG


def last_rec():
    with open(LOG, encoding="utf-8") as f:
        return json.loads(f.read().strip().splitlines()[-1])


def n_recs():
    return len(open(LOG, encoding="utf-8").read().strip().splitlines()) if os.path.isfile(LOG) else 0


def convs():
    d = os.path.join(AGY_HOME, "conversations")
    return sorted(os.listdir(d)) if os.path.isdir(d) else []


def brains():
    d = os.path.join(AGY_HOME, "brain")
    return sorted(os.listdir(d)) if os.path.isdir(d) else []


# ---------------------------------------------------------------------------
section("[1] cli_status('gemini') = Antigravity CLI")
st = cli_providers.cli_status("gemini")
check("tim thay agy", st["installed"] and st["path"] == FAKE, st)
check("phien ban", st["version"] == "1.2.11", st["version"])
check("chua co phien -> chua dang nhap", st["logged_in"] is False and "CHƯA đăng nhập" in st["detail"], st["detail"])
check("nhan Antigravity CLI", st["label"] == "Antigravity CLI", st["label"])
check("cai bang trinh cai chinh chu (khong npm)", st.get("npm_package") is None
      and "antigravity.google/cli/install.sh" in st["install_cmd"], st["install_cmd"])
check("thu muc lam viec rieng", st["workdir"] == os.path.join(HOME, ".capcut-studio", "agy-work"), st.get("workdir"))
os.makedirs(AGY_HOME, exist_ok=True)
open(os.path.join(AGY_HOME, "antigravity-oauth-token"), "w").write("BI MAT")
cli_providers._AGY_MODELS["data"] = None
st = cli_providers.cli_status("gemini")
check("co file phien -> da dang nhap", st["logged_in"] is True, st)
check("khong lo token", "BI MAT" not in json.dumps(st, ensure_ascii=False))
ids = [m["id"] for m in st["models"]]
check("model lay tu `agy models`, chi Gemini (xem duoc video), Pro dung dau",
      ids == ["gemini-3.1-pro-high", "gemini-3.8-flash-medium"], ids)
check("moi model co ghi chu", all(m["note"] for m in st["models"]), st["models"])
check("mac dinh gemini-3.1-pro-high", st["default_model"] == "gemini-3.1-pro-high")

# ---------------------------------------------------------------------------
section("[2] Goi video qua agy")
vid_dir = tempfile.mkdtemp()
v1 = os.path.join(vid_dir, "a.mp4")
v2 = os.path.join(vid_dir, "b.mov")
open(v1, "wb").write(b"\0" * 12345)
open(v2, "wb").write(b"\1" * 999)
# hoi thoai KHAC cua nguoi dung (khong duoc dung vao)
os.makedirs(os.path.join(AGY_HOME, "conversations"), exist_ok=True)
open(os.path.join(AGY_HOME, "conversations", "user-own.db"), "w").write("cua nguoi dung")
os.makedirs(os.path.join(AGY_HOME, "brain", "user-own"), exist_ok=True)

os.environ["FAKE_AGY_REPLY"] = '```json\n{"sources": []}\n```'
text = cli_providers.gemini_video("gemini-3.1-pro-preview", "PROMPT HIEU NGUON", [v1, v2], step_label="t2")
rec = last_rec()
argv = rec["argv"]
check("tra ve response", '{"sources": []}' in text, text)
check("--output-format json + --disable-slash-commands + --print-timeout",
      argv[argv.index("--output-format") + 1] == "json" and "--disable-slash-commands" in argv
      and argv[argv.index("--print-timeout") + 1].endswith("s"), argv)
check("ten model cu Gemini CLI -> gemini-3.1-pro-high", argv[argv.index("--model") + 1] == "gemini-3.1-pro-high", argv)
check("prompt goc + huong dan view_file", rec["prompt"].startswith("PROMPT HIEU NGUON") and "view_file" in rec["prompt"])
check("2 duong dan TUYET DOI dung thu tu, file ton tai luc goi",
      [os.path.basename(p) for p in rec["paths"]] == ["video_1.mp4", "video_2.mov"]
      and all(os.path.isabs(p) for p in rec["paths"]) and all(rec["exists"]), rec["paths"])
check("dung kich thuoc (hard link / copy)", rec["sizes"] == [12345, 999], rec["sizes"])
check("chay trong thu muc lam viec rieng", os.path.realpath(rec["cwd"]) == os.path.realpath(st["workdir"]), rec["cwd"])
check("xoa thu muc job", os.listdir(os.path.join(st["workdir"], "jobs")) == [])
check("xoa hoi thoai cua lan goi (db)", convs() == ["user-own.db"], convs())
check("xoa brain cua lan goi (ban sao video)", brains() == ["user-own"], brains())
check("dem dung so video model da xem", cli_providers.gemini_last_meta().get("viewed") == 2, cli_providers.gemini_last_meta())
check("file video goc con nguyen", os.path.getsize(v1) == 12345 and os.path.getsize(v2) == 999)

# ---------------------------------------------------------------------------
section("[3] Model khong mo xem video -> loi (khong dung ket qua doan)")
os.environ["FAKE_AGY_MODE"] = "noview"
try:
    cli_providers.gemini_video("gemini-3.1-pro-high", "P", [v1], step_label="t3")
    check("khong xem -> nem loi", False, "khong nem")
except cli_providers.CliError as e:
    check("khong xem -> CliError noi ro 0/1", "0/1" in str(e), e)
check("van don hoi thoai", convs() == ["user-own.db"] and brains() == ["user-own"], (convs(), brains()))
os.environ["FAKE_AGY_MODE"] = "ok"

# ---------------------------------------------------------------------------
section("[4] Loi dang nhap / het han muc / sai model")
for mode, want, label in [("auth", "Đăng nhập Google (mở Terminal)", "chua dang nhap"),
                          ("quota", "HẾT HẠN MỨC", "het han muc"),
                          ("badmodel", "không có model", "sai model")]:
    os.environ["FAKE_AGY_MODE"] = mode
    try:
        cli_providers.gemini_video("gemini-3.1-pro-high", "P", [v1], step_label="t4")
        check(label + " -> nem loi", False, "khong nem")
    except cli_providers.CliError as e:
        check(label + " -> thong bao ro", want in str(e), str(e)[:300])
os.environ["FAKE_AGY_MODE"] = "ok"
check("loi van don hoi thoai", convs() == ["user-own.db"] and brains() == ["user-own"], (convs(), brains()))

# ---------------------------------------------------------------------------
section("[5] File > 100 MB bi chan truoc khi chay")
big = os.path.join(vid_dir, "big.mp4")
with open(big, "wb") as f:
    f.truncate(101 * 1024 * 1024)
before = n_recs()
try:
    cli_providers.gemini_video("gemini-3.1-pro-high", "P", [big], step_label="t5")
    check("file lon -> nem loi", False, "khong nem")
except cli_providers.CliError as e:
    check("file lon -> noi ro 100 MB", "100 MB" in str(e), e)
check("khong chay agy", n_recs() == before)
check("don job", os.listdir(os.path.join(st["workdir"], "jobs")) == [])

# ---------------------------------------------------------------------------
section("[6] providers: gemini che do tai khoan Google (agy)")
config.set_providers({"gemini": {"auth_mode": "subscription", "sub_model": "gemini-3.1-pro-preview"}})
os.environ["FAKE_AGY_REPLY"] = json.dumps({"summary": "S", "sources": [{"id": "source_1", "summary": "x"}]})
res = providers._gemini_analyze_videos([{"id": "source_1", "path": v1, "name": "a.mp4", "duration": 3}],
                                       "PROMPT HIEU NGUON", "VIDEO NGUON", step_label="t6")
rec = last_rec()
check("di duong agy", res.get("_source") == "agy:gemini-3.1-pro-high", res.get("_source"))
check("prompt kem danh sach video", "1. VIDEO NGUON id=source_1, file=a.mp4" in rec["prompt"], rec["prompt"][-300:])
check("parse JSON", res.get("summary") == "S")
os.environ["FAKE_AGY_REPLY"] = '{"summary": "GHEP"}'
txt = providers._gemini_text("SYS", "USER", "t6b")
rec = last_rec()
check("buoc ghep chi chu, khong dinh kem video", txt == '{"summary": "GHEP"}' and rec["paths"] == [], rec["paths"])
check("buoc ghep: system + user trong prompt", "SYS" in rec["prompt"] and "USER" in rec["prompt"])
os.environ["FAKE_AGY_REPLY"] = '{"ping": "ok"}'
tc = providers.test_connection("gemini")
check("test_connection OK qua tai khoan Google", tc.get("ok") and "Antigravity CLI" in tc.get("detail", ""), tc)
check("test_connection dung ten model agy", "gemini-3.1-pro-high" in tc.get("detail", ""), tc)
config.set_providers({"gemini": {"auth_mode": "api_key"}})
check("doi ve API key -> khong con dung CLI", config.uses_subscription("gemini") is False)

# ---------------------------------------------------------------------------
print("\n" + "=" * 60)
if FAILED:
    print("CO %d TEST FAIL:" % len(FAILED))
    for f in FAILED:
        print("  - " + f)
    sys.exit(1)
print("TAT CA PASS")
