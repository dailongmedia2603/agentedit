#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test che do chay bang GOI SUBSCRIPTION (CLI chinh chu) thay vi API key.
Chay: python3 tests/test_subscription_mode.py

KHONG goi mang / KHONG goi CLI that — subprocess bi thay bang ban gia lap,
nen test chay duoc ca khi may chua cai claude/codex.

Cac dieu can dam bao:
  1. auth_mode="subscription" -> di duong CLI, KHONG cham HTTP
  2. auth_mode="api_key"      -> van di duong HTTP nhu cu (khong hoi quy)
  3. Chi provider co CLI chinh chu (gpt/claude/gemini) bat duoc che do CLI; provider la bi ep ve api_key
  4. Loi CLI (chua cai / chua dang nhap / het han muc) ra thong bao doc duoc,
     KHONG nuot thanh loi chung chung
  5. Claude o che do subscription KHONG di nhanh native /messages
"""
import os
import json
import sys
import types

SIDE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sidecar")
sys.path.insert(0, SIDE)

# requests co the chua cai trong python he thong -> gia lap du dung cho test
try:
    import requests  # noqa: F401
except ImportError:
    fake = types.ModuleType("requests")

    class _Exc(Exception):
        pass

    fake.exceptions = types.SimpleNamespace(RequestException=_Exc, Timeout=_Exc)
    fake.post = lambda *a, **k: None
    fake.get = lambda *a, **k: None
    sys.modules["requests"] = fake

import requests  # noqa: E402
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


def reset_providers():
    config.set_providers({
        "gemini": {"auth_mode": "api_key", "api_key": "g-key",
                   "base_url": "https://generativelanguage.googleapis.com", "model": "gemini-2.5-flash"},
        "gpt": {"auth_mode": "api_key", "api_key": "sk-x",
                "base_url": "https://api.openai.com/v1", "model": "gpt-4o", "sub_model": "gpt-5.5"},
        "claude": {"auth_mode": "api_key", "api_key": "sk-ant",
                   "base_url": "https://api.anthropic.com/v1", "model": "claude-sonnet-4-6",
                   "sub_model": "sonnet"},
    })


class FakeProc:
    def __init__(self, rc=0, stdout="", stderr=""):
        self.returncode = rc
        self.stdout = stdout
        self.stderr = stderr


def patch_run(fn):
    """Thay cli_providers._run. fn(argv, stdin, timeout, cwd) -> (rc, out, err)."""
    calls = []

    def fake_run(argv, stdin_text=None, timeout=60, cwd=None, env=None):
        calls.append({"argv": argv, "stdin": stdin_text, "timeout": timeout, "env": env})
        return fn(argv, stdin_text, timeout, cwd)

    cli_providers._run = fake_run
    return calls


ORIG_RUN = cli_providers._run
ORIG_FIND = cli_providers.find_bin
ORIG_POST = requests.post


def restore():
    cli_providers._run = ORIG_RUN
    cli_providers.find_bin = ORIG_FIND
    requests.post = ORIG_POST


# ---------------------------------------------------------------------------
section("[1] auth_mode=subscription -> di duong CLI, KHONG cham HTTP")
reset_providers()
config.set_providers({"gpt": {"auth_mode": "subscription", "sub_model": "gpt-5.5"}})

http_hits = {"n": 0}


def boom_post(*a, **k):
    http_hits["n"] += 1
    raise AssertionError("KHONG duoc goi HTTP o che do subscription")


requests.post = boom_post
cli_providers.find_bin = lambda name: "/fake/bin/" + cli_providers.SPEC[name]["bin"]


def codex_ok(argv, stdin, timeout, cwd):
    # ghi ket qua ra file -o nhu codex that
    if "exec" in argv:
        out = argv[argv.index("-o") + 1]
        with open(out, "w", encoding="utf-8") as f:
            f.write('{"segments": [{"start": 0, "end": 5}]}')
        return 0, "", ""
    return 0, "codex-cli 0.156.1", ""


calls = patch_run(codex_ok)
text = providers._chat("gpt", [{"role": "system", "content": "S"}, {"role": "user", "content": "U"}],
                       json_mode=True, step_label="t1")
check("tra ve noi dung tu CLI", '"segments"' in text, text)
check("khong he goi HTTP", http_hits["n"] == 0)
exec_call = next((c for c in calls if "exec" in c["argv"]), None)
check("goi dung binary codex", exec_call and exec_call["argv"][0].endswith("codex"))
check("co --skip-git-repo-check", exec_call and "--skip-git-repo-check" in exec_call["argv"])
check("co --sandbox read-only (khong cho CLI sua file)",
      exec_call and "--sandbox" in exec_call["argv"]
      and exec_call["argv"][exec_call["argv"].index("--sandbox") + 1] == "read-only")
check("dung sub_model chu khong phai model API",
      exec_call and "gpt-5.5" in exec_call["argv"] and "gpt-4o" not in exec_call["argv"])
check("prompt di qua stdin", exec_call and "U" in (exec_call["stdin"] or ""))
restore()

# ---------------------------------------------------------------------------
section("[2] auth_mode=api_key -> van di duong HTTP nhu cu (khong hoi quy)")
reset_providers()
cli_providers.find_bin = lambda name: (_ for _ in ()).throw(
    AssertionError("KHONG duoc dung CLI o che do api_key"))

posted = {"n": 0, "url": None, "body": None}


class Resp:
    status_code = 200
    text = '{"choices":[{"message":{"content":"{\\"ok\\":1}"}}]}'

    def json(self):
        import json as _j
        return _j.loads(self.text)


def fake_post(url, **k):
    posted["n"] += 1
    posted["url"] = url
    posted["body"] = k.get("json")
    return Resp()


requests.post = fake_post
text = providers._chat("gpt", [{"role": "user", "content": "U"}], step_label="t2")
check("goi HTTP dung 1 lan", posted["n"] == 1, posted["n"])
check("goi /chat/completions", (posted["url"] or "").endswith("/chat/completions"), posted["url"])
check("dung model API (gpt-4o)", (posted["body"] or {}).get("model") == "gpt-4o", posted["body"])
check("tra ve noi dung", "ok" in text, text)
restore()

# ---------------------------------------------------------------------------
section("[3] Chi provider co CLI chinh chu moi bat duoc che do CLI (gemini: Gemini CLI tu 2026-09-26)")
reset_providers()
config.set_providers({"gemini": {"auth_mode": "subscription"}})
check("uses_subscription(gemini) = True", config.uses_subscription("gemini") is True)
check("gemini sub: van tay khac che do key",
      config.provider_fingerprint("gemini").startswith("gemini|sub|"), config.provider_fingerprint("gemini"))
config.set_providers({"foo": {"auth_mode": "subscription"}})
check("provider la bi ep ve api_key",
      config.provider("foo").get("auth_mode") == "api_key", config.provider("foo").get("auth_mode"))
check("uses_subscription(foo) = False", config.uses_subscription("foo") is False)
check("gpt/claude/gemini duoc phep", set(config.SUBSCRIPTION_CAPABLE) == {"gpt", "claude", "gemini"})
check("SPEC khop SUBSCRIPTION_CAPABLE", set(cli_providers.SUPPORTED) == set(config.SUBSCRIPTION_CAPABLE),
      cli_providers.SUPPORTED)
reset_providers()

# ---------------------------------------------------------------------------
section("[4] Loi CLI phai ra thong bao doc duoc, khong nuot")
reset_providers()
config.set_providers({"claude": {"auth_mode": "subscription", "sub_model": "sonnet"}})

# 4a. chua cai CLI
cli_providers.find_bin = lambda name: None
try:
    providers._chat("claude", [{"role": "user", "content": "U"}], step_label="t4a")
    check("chua cai -> nem loi", False, "khong nem")
except cli_providers.CliError as e:
    msg = str(e)
    check("chua cai -> noi ro chua cai", "Chua cai" in msg, msg[:80])
    # lenh cai tay = trinh cai chinh chu cua Anthropic (khong can Node / npm) — tu 2026-09-28
    check("chua cai -> co lenh cai kem theo", cli_providers.SPEC["claude"]["install_cmd"] in msg
          and "claude.ai/install.sh" in msg, msg[:160])
    check("chua cai -> goi y doi ve API Key", "API Key" in msg, msg[:160])

# 4b. chua dang nhap
cli_providers.find_bin = lambda name: "/fake/bin/claude"
patch_run(lambda argv, stdin, timeout, cwd: (1, "", "Not logged in. Please run `claude auth login`"))
try:
    providers._chat("claude", [{"role": "user", "content": "U"}], step_label="t4b")
    check("chua dang nhap -> nem loi", False, "khong nem")
except cli_providers.CliError as e:
    msg = str(e)
    check("chua dang nhap -> noi dung ban chat", "chua dang nhap" in msg.lower(), msg[:100])
    check("chua dang nhap -> co lenh login", "auth login" in msg, msg[:140])

# 4c. het han muc goi subscription (KHAC loi key sai)
patch_run(lambda argv, stdin, timeout, cwd:
          (1, "", "You've hit your usage limit. Resets at 3pm."))
try:
    providers._chat("claude", [{"role": "user", "content": "U"}], step_label="t4c")
    check("het han muc -> nem loi", False, "khong nem")
except cli_providers.CliError as e:
    msg = str(e)
    check("het han muc -> goi dung ten van de", "HET HAN MUC" in msg, msg[:100])
    check("het han muc -> khong do cho cau hinh",
          "khong phai loi cau hinh" in msg, msg[:160])
    check("het han muc -> goi y tam doi sang API Key", "API Key" in msg, msg[:200])

# 4d. timeout
patch_run(lambda argv, stdin, timeout, cwd: (-9, "", "TIMEOUT sau %ds" % timeout))
try:
    providers._chat("claude", [{"role": "user", "content": "U"}], step_label="t4d", req_timeout=90)
    check("timeout -> nem loi", False, "khong nem")
except cli_providers.CliError as e:
    check("timeout -> noi ro khong tra loi kip", "khong tra loi kip" in str(e), str(e)[:100])

# 4e. CLI chay xong nhung rong
patch_run(lambda argv, stdin, timeout, cwd:
          (0, '{"type":"result","is_error":false,"result":""}', ""))
try:
    providers._chat("claude", [{"role": "user", "content": "U"}], step_label="t4e")
    check("ket qua rong -> nem loi", False, "khong nem")
except cli_providers.CliError as e:
    check("ket qua rong -> noi ro rong", "khong tra ve noi dung" in str(e), str(e)[:100])
restore()

# ---------------------------------------------------------------------------
section("[5] Claude o che do subscription KHONG di nhanh native /messages")
reset_providers()
config.set_providers({"claude": {"auth_mode": "subscription", "sub_model": "sonnet",
                                 "base_url": "https://api.anthropic.com/v1"}})
requests.post = boom_post   # bat ky HTTP nao cung la loi
cli_providers.find_bin = lambda name: "/fake/bin/claude"
patch_run(lambda argv, stdin, timeout, cwd: (
    0, '{"type":"result","is_error":false,"result":"{\\"verdict\\":\\"APPROVED\\"}",'
       '"usage":{"output_tokens":5},"duration_ms":100}', ""))
http_hits["n"] = 0
rv = providers._safe_json(providers._chat("claude", [
    {"role": "system", "content": "tra ve JSON"},
    {"role": "user", "content": "x"}], json_mode=True, step_label="t5"))
check("goi Claude chay qua CLI", rv.get("verdict") == "APPROVED", rv)
check("base_url anthropic.com KHONG keo ve duong native", http_hits["n"] == 0)
restore()

# ---------------------------------------------------------------------------
section("[6] Parse output cua tung CLI")
# 6a. claude tra JSON bao boc -> lay field result
cli_providers.find_bin = lambda name: "/fake/bin/claude"
patch_run(lambda argv, stdin, timeout, cwd: (
    0, 'Vai dong rac\n{"type":"result","is_error":false,"result":"NOI DUNG",'
       '"usage":{"output_tokens":3},"duration_ms":10}\n', ""))
out = cli_providers.cli_chat("claude", "sonnet", [{"role": "user", "content": "U"}], step_label="t6a")
check("claude: boc duoc result giua dong rac", out == "NOI DUNG", out)

# 6b. claude bao is_error -> phai nem, khong tra text loi ve cho pipeline
patch_run(lambda argv, stdin, timeout, cwd: (
    0, '{"type":"result","is_error":true,"result":"Credit balance too low"}', ""))
try:
    cli_providers.cli_chat("claude", "sonnet", [{"role": "user", "content": "U"}], step_label="t6b")
    check("claude is_error -> nem loi", False, "khong nem")
except cli_providers.CliError as e:
    check("claude is_error -> nem loi", True)
    check("claude is_error -> giu nguyen van CLI bao", "Credit balance" in str(e), str(e)[:120])

# 6c. codex khong ghi file -o -> boc tu stdout, cat bo "tokens used"
cli_providers.find_bin = lambda name: "/fake/bin/codex"


def codex_stdout_only(argv, stdin, timeout, cwd):
    return 0, "OpenAI Codex\n--------\nuser\nhoi\ncodex\n{\"a\":1}\ntokens used\n8,408\n", ""


patch_run(codex_stdout_only)
out = cli_providers.cli_chat("gpt", "gpt-5.5", [{"role": "user", "content": "U"}], step_label="t6c")
check("codex: boc dung khoi tra loi tu stdout", out == '{"a":1}', repr(out))

# 6d. gop nhieu luot (hoi thoai nhieu luot, vd vong tu sua JSON) thanh 1 prompt
sysmsg, usermsg = cli_providers._split_messages([
    {"role": "system", "content": "LUAT"},
    {"role": "user", "content": "lan 1"},
    {"role": "assistant", "content": "ban nhap sai"},
    {"role": "user", "content": "sua lai di"},
])
check("gop: system tach rieng", sysmsg == "LUAT", sysmsg)
check("gop: giu du 3 luot hoi thoai",
      all(x in usermsg for x in ("lan 1", "ban nhap sai", "sua lai di")), usermsg)
check("gop: danh dau ro luot cua assistant",
      "[Cau tra loi truoc cua ban]" in usermsg, usermsg)
restore()

# ---------------------------------------------------------------------------
section("[7] cli_status doc dung trang thai dang nhap")
cli_providers.find_bin = lambda name: "/fake/bin/" + cli_providers.SPEC[name]["bin"]


def claude_status(argv, stdin, timeout, cwd):
    if "--version" in argv:
        return 0, "2.1.186 (Claude Code)", ""
    return 0, ('{"loggedIn":true,"authMethod":"claude.ai","email":"a@b.com",'
               '"subscriptionType":"max"}'), ""


patch_run(claude_status)
st = cli_providers.cli_status("claude")
check("claude: nhan ra da dang nhap", st["logged_in"] is True, st)
check("claude: doc duoc goi", st["plan"] == "max", st)
check("claude: doc duoc tai khoan", st["account"] == "a@b.com", st)

# dung API key thay vi goi subscription -> phai coi la CHUA san sang
patch_run(lambda argv, stdin, timeout, cwd: (0, "2.1", "") if "--version" in argv else
          (0, '{"loggedIn":true,"authMethod":"apiKey"}', ""))
st = cli_providers.cli_status("claude")
check("claude: dang dung API key thi khong tinh la subscription",
      st["logged_in"] is False, st)
check("claude: giai thich ro phai login lai", "claude auth login" in st["detail"], st["detail"][:120])

# chua cai
cli_providers.find_bin = lambda name: None
st = cli_providers.cli_status("gpt")
check("gpt: nhan ra chua cai", st["installed"] is False and st["logged_in"] is False)
check("gpt: kem lenh cai", "npm i -g @openai/codex" in st["detail"], st["detail"][:120])
restore()

# ---------------------------------------------------------------------------
section("[8] Doi model / doi cach ket noi -> cache buoc KHONG duoc dung lai")
# Su co that 2026-09-23: khoa cache chi bam theo du lieu vao, nen sau khi doi GPT
# tu API key sang goi subscription, bam "Tiep tuc" van tra ve y nguyen ket qua cu
# cua model truoc — nhin tuong da chay bang goi moi, thuc te khong goi model nao.
import step_cache  # noqa: E402

reset_providers()
config.set_providers({"gpt": {"auth_mode": "api_key", "model": "gpt-4o"}})
fp_key = config.provider_fingerprint("gpt")
config.set_providers({"gpt": {"auth_mode": "subscription", "sub_model": "gpt-6-luna"}})
fp_luna = config.provider_fingerprint("gpt")
config.set_providers({"gpt": {"sub_model": "gpt-6-sol"}})
fp_sol = config.provider_fingerprint("gpt")

check("api_key vs subscription -> van tay khac", fp_key != fp_luna, (fp_key, fp_luna))
check("doi model trong cung che do -> van tay khac", fp_luna != fp_sol, (fp_luna, fp_sol))

payload = {"brief": {"x": 1}}
k_key = step_cache._key("B1-select", dict(payload, _ai=fp_key))
k_luna = step_cache._key("B1-select", dict(payload, _ai=fp_luna))
k_sol = step_cache._key("B1-select", dict(payload, _ai=fp_sol))
check("cung dau vao + khac provider -> khoa cache khac",
      len({k_key, k_luna, k_sol}) == 3, (k_key, k_luna, k_sol))
check("cung dau vao + cung provider -> khoa cache GIU NGUYEN (van tiet kiem duoc)",
      k_luna == step_cache._key("B1-select", dict(payload, _ai=fp_luna)))

# ---------------------------------------------------------------------------
section("[9] Muc suy nghi (reasoning effort) cua Codex")
restore()
reset_providers()
CATALOG_JSON = json.dumps({"models": [
    {"slug": "gpt-6-sol", "display_name": "GPT-6-Sol", "visibility": "list", "default_reasoning_level": "low",
     "supported_reasoning_levels": [{"effort": e} for e in ("low", "medium", "high", "xhigh", "max", "ultra")]},
    {"slug": "gpt-6-luna", "display_name": "GPT-6-Luna", "visibility": "list", "default_reasoning_level": "medium",
     "supported_reasoning_levels": [{"effort": e} for e in ("low", "medium", "high", "xhigh", "max")]},
]})


def fake_codex(argv, stdin, timeout, cwd):
    if argv[1:3] == ["debug", "models"]:
        return 0, "WARN dong rac\n" + CATALOG_JSON, ""
    if "-o" in argv:
        with open(argv[argv.index("-o") + 1], "w", encoding="utf-8") as f:
            f.write('{"ok": 1}')
    return 0, "", ""


cli_providers.find_bin = lambda name: "/fake/bin/codex"
cli_providers._CATALOG["data"] = None
calls = patch_run(fake_codex)
cat = cli_providers.model_catalog(refresh=True)
check("doc danh muc: gpt-6-sol mac dinh low", cat.get("gpt-6-sol", {}).get("default") == "low", cat)
check("doc danh muc: luna khong co ultra", "ultra" not in cat.get("gpt-6-luna", {}).get("levels", []), cat)


def codex_calls():
    return [c for c in calls if "exec" in c["argv"]]


def effort_arg(argv):
    return argv[argv.index("-c") + 1] if "-c" in argv else None


config.set_providers({"gpt": {"auth_mode": "subscription", "sub_model": "gpt-6-sol", "sub_effort": ""}})
fp_default = config.provider_fingerprint("gpt")
providers._chat("gpt", [{"role": "user", "content": "x"}], json_mode=True, req_timeout=90, step_label="t9a")
a = codex_calls()[-1]
check("de trong -> KHONG gui -c (model tu dung mac dinh)", effort_arg(a["argv"]) is None, a["argv"])
check("de trong -> van tay giu nguyen dang cu (cache khong mat)", fp_default == "gpt|sub|gpt-6-sol", fp_default)

config.set_providers({"gpt": {"sub_effort": "high"}})
providers._chat("gpt", [{"role": "user", "content": "x"}], json_mode=True, req_timeout=90, step_label="t9b")
b = codex_calls()[-1]
check("high -> gui -c model_reasoning_effort=\"high\"", effort_arg(b["argv"]) == 'model_reasoning_effort="high"', b["argv"])
check("co -c truoc dau '-' (doc prompt tu stdin)", b["argv"].index("-c") < b["argv"].index("-"), b["argv"])
check("high -> thoi gian cho x2", b["timeout"] == 2 * a["timeout"], (a["timeout"], b["timeout"]))
fp_high = config.provider_fingerprint("gpt")
check("doi muc suy nghi -> van tay khac (buoc chay lai that)", fp_high != fp_default and fp_high.endswith("|effort=high"), fp_high)

config.set_providers({"gpt": {"sub_model": "gpt-6-luna", "sub_effort": "ultra"}})
providers._chat("gpt", [{"role": "user", "content": "x"}], json_mode=True, req_timeout=90, step_label="t9c")
c = codex_calls()[-1]
check("muc model khong ho tro (luna + ultra) -> bo, dung mac dinh", effort_arg(c["argv"]) is None, c["argv"])

config.set_providers({"gpt": {"sub_model": "gpt-6-sol", "sub_effort": 'high"; x="y'}})
check("chuoi la trong sub_effort -> bi bo qua", config.sub_effort("gpt") == "", config.sub_effort("gpt"))
providers._chat("gpt", [{"role": "user", "content": "x"}], json_mode=True, req_timeout=90, step_label="t9d")
check("chuoi la -> khong gui -c", effort_arg(codex_calls()[-1]["argv"]) is None, codex_calls()[-1]["argv"])

config.set_providers({"gpt": {"sub_effort": "max"}})
cli_providers.cli_chat("gpt", "gpt-6-sol", [{"role": "user", "content": "x"}], req_timeout=1000,
                       step_label="t9e", effort="max")
check("thoi gian cho bi chan tran MAX_CLI_TIMEOUT", codex_calls()[-1]["timeout"] == cli_providers.MAX_CLI_TIMEOUT,
      codex_calls()[-1]["timeout"])
restore()
cli_providers._CATALOG["data"] = None
reset_providers()

# ---------------------------------------------------------------------------
print("\n" + "=" * 60)
if FAILED:
    print("CO %d TEST FAIL:" % len(FAILED))
    for f in FAILED:
        print("  - " + f)
    sys.exit(1)
print("TAT CA PASS")
