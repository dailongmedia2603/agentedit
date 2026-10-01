#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Test chon AI LAP KE HOACH (GPT / Claude) + duong goi Claude.
Chay (HOME tam de khong dung state.json that):
  HOME=$(mktemp -d) ../CapCutAPI/.venv/bin/python tests/test_claude_planner.py

KHONG goi mang / KHONG goi CLI that — subprocess va requests bi thay bang ban gia lap.

Cac dieu can dam bao:
  1. config.plan_provider() doc state.json; gia tri la / thieu -> "claude" (mac dinh tu 2026-10-01)
  2. Cac buoc ke hoach (B1..B7, R4, R5) di qua plan_chat -> dung provider da chon
  3. Claude CLI: --effort, tat cong cu, khong luu phien, dung sub_model
  4. Van tay cache: GPT giu nguyen dang cu; Claude khac GPT va doi theo model/effort
  5. Claude API key goc (api.anthropic.com) -> /messages, KHONG /chat/completions;
     het max_tokens -> tang ngan sach; 400 vi temperature -> goi lai khong temperature; 401 -> bao ro
  6. cli_status(claude): model can ban CLI moi hon -> needs_update + outdated_models; co "reasoning"
  7. Loi "does not support this model; version X" -> thong bao cap nhat Claude Code
"""
import os
import sys
import json
import types
import tempfile

SIDE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sidecar")
sys.path.insert(0, SIDE)

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


TMP = tempfile.mkdtemp(prefix="plan-provider-")
config.STATE_PATH = os.path.join(TMP, "state.json")
config.ENGINE_HOME = TMP


def set_planner(v):
    """Tu 2026-10-01 app LUON lap ke hoach bang Claude (bo lua chon trong Cai dat); duong GPT chi mo cho test qua
    bien moi truong STUDIO_PLANNER_TEST."""
    if v is None:
        os.environ.pop("STUDIO_PLANNER_TEST", None)
    else:
        os.environ["STUDIO_PLANNER_TEST"] = v


def reset_providers():
    config.set_providers({
        "gpt": {"auth_mode": "subscription", "sub_model": "gpt-6-luna", "sub_effort": "",
                "api_key": "sk-x", "base_url": "https://api.openai.com/v1", "model": "gpt-4o"},
        "claude": {"auth_mode": "subscription", "sub_model": "claude-opus-5", "sub_effort": "high",
                   "api_key": "sk-ant", "base_url": "https://api.anthropic.com/v1", "model": "claude-sonnet-4-6"},
    })


ORIG_RUN, ORIG_FIND, ORIG_POST, ORIG_SLEEP = cli_providers._run, cli_providers.find_bin, requests.post, \
    providers.time.sleep


def restore():
    cli_providers._run, cli_providers.find_bin, requests.post = ORIG_RUN, ORIG_FIND, ORIG_POST
    providers.time.sleep = ORIG_SLEEP


def fake_cli():
    """Gia lap ca claude lan codex; tra ve danh sach lenh da chay."""
    calls = []

    def run(argv, stdin_text=None, timeout=60, cwd=None, env=None):
        calls.append({"argv": list(argv), "stdin": stdin_text, "timeout": timeout})
        if os.path.basename(argv[0]) == "claude":
            return 0, json.dumps({"type": "result", "is_error": False, "result": '{"hook": null}',
                                  "usage": {"output_tokens": 5}}), ""
        if "exec" in argv:
            with open(argv[argv.index("-o") + 1], "w", encoding="utf-8") as f:
                f.write('{"hook": null}')
            return 0, "", ""
        return 0, "codex-cli 0.156.1", ""

    cli_providers._run = run
    cli_providers.find_bin = lambda name: "/fake/bin/" + cli_providers.SPEC[name]["bin"]
    requests.post = lambda *a, **k: (_ for _ in ()).throw(AssertionError("khong duoc goi HTTP"))
    return calls


MSGS = [{"role": "system", "content": "S"}, {"role": "user", "content": "U"}]

# ---------------------------------------------------------------------------
section("[1] plan_provider: LUON Claude (state.json cu ghi gpt bi bo qua); GPT chi mo cho test")
set_planner(None)
check("chua chon -> claude", config.plan_provider() == "claude", config.plan_provider())
config.save_state({**config.load_state(), "plan_provider": "gpt"})
check("state.json cu con ghi 'gpt' -> van claude (khong con lua chon)", config.plan_provider() == "claude",
      config.plan_provider())
set_planner("claude")
check("chon claude -> claude", config.plan_provider() == "claude")
set_planner("gpt")
check("chon gpt -> gpt", config.plan_provider() == "gpt")
set_planner("Claude ")
check("khong phan biet hoa/thuong, bo khoang trang", config.plan_provider() == "claude")
set_planner("gemini")
check("gia tri la -> claude", config.plan_provider() == "claude")
check("PLAN_PROVIDERS = gpt, claude", set(config.PLAN_PROVIDERS) == {"gpt", "claude"})

# ---------------------------------------------------------------------------
section("[2] plan_chat di dung provider da chon")
reset_providers()
calls = fake_cli()
set_planner("claude")
providers.plan_chat(MSGS, json_mode=True, step_label="t2a")
c = calls[-1]["argv"]
check("claude -> goi binary claude", os.path.basename(c[0]) == "claude", c)
check("dung sub_model claude-opus-5", c[c.index("--model") + 1] == "claude-opus-5", c)
check("co --effort high", "--effort" in c and c[c.index("--effort") + 1] == "high", c)
check("tat cong cu (--tools \"\")", "--tools" in c and c[c.index("--tools") + 1] == "", c)
check("khong luu phien", "--no-session-persistence" in c, c)
check("system prompt co loi dan JSON", "JSON" in c[c.index("--system-prompt") + 1], c)
check("prompt nguoi dung qua stdin", calls[-1]["stdin"] == "U", calls[-1]["stdin"])
check("effort high -> thoi gian cho nhan doi", calls[-1]["timeout"] >= 2 * providers._cli_timeout(60),
      calls[-1]["timeout"])
check("nhan nhat ky = Claude", providers.plan_ai_name() == "Claude")

set_planner("gpt")
providers.plan_chat(MSGS, json_mode=True, step_label="t2b")
c = calls[-1]["argv"]
check("gpt -> goi codex exec", os.path.basename(c[0]) == "codex" and "exec" in c, c)
check("nhan nhat ky = GPT", providers.plan_ai_name() == "GPT")

set_planner("claude")
before = len(calls)
res = providers.gpt_hook(segments=[{"source_id": "source_1", "start": 0, "end": 10, "target_start": 0}],
                         transcript_data={}, emotion_map_data={}, key_moments_data={})
check("B3 (gpt_hook) goi Claude khi chon Claude",
      len(calls) > before and os.path.basename(calls[-1]["argv"][0]) == "claude", calls[-1]["argv"][:2])
check("B3 tra JSON cua Claude", res == {"hook": None}, res)

config.set_providers({"claude": {"sub_effort": "turbo"}})
providers.plan_chat(MSGS, step_label="t2c")
check("muc suy nghi la -> khong gui --effort", "--effort" not in calls[-1]["argv"], calls[-1]["argv"])
restore()

# ---------------------------------------------------------------------------
section("[3] Van tay cache theo AI lap ke hoach")
reset_providers()
check("GPT giu dang cu (cache cu con dung)", config.provider_fingerprint("gpt") == "gpt|sub|gpt-6-luna",
      config.provider_fingerprint("gpt"))
fp_c = config.provider_fingerprint("claude")
check("Claude khac GPT", fp_c.startswith("claude|sub|claude-opus-5"), fp_c)
check("Claude co muc suy nghi trong van tay", fp_c.endswith("|effort=high"), fp_c)
config.set_providers({"claude": {"sub_model": "claude-sonnet-5"}})
check("doi model Claude -> van tay doi", config.provider_fingerprint("claude") != fp_c)

# ---------------------------------------------------------------------------
section("[4] Claude API key goc -> /messages")
reset_providers()
config.set_providers({"claude": {"auth_mode": "api_key"}})
cli_providers.find_bin = lambda name: (_ for _ in ()).throw(AssertionError("khong duoc dung CLI"))
providers.time.sleep = lambda s: None


class R:
    def __init__(self, code, body):
        self.status_code = code
        self.text = json.dumps(body) if not isinstance(body, str) else body
        self._b = body

    def json(self):
        return self._b


posts = []
queue = []


def fake_post(url, **k):
    posts.append({"url": url, "json": k.get("json"), "headers": k.get("headers")})
    return queue.pop(0)


requests.post = fake_post
queue[:] = [R(200, {"content": [{"type": "text", "text": '{"ok": 1}'}], "stop_reason": "end_turn"})]
out = providers._chat("claude", MSGS, json_mode=True, max_tokens=2000, step_label="t4a")
p0 = posts[-1]
check("goi /messages", p0["url"] == "https://api.anthropic.com/v1/messages", p0["url"])
check("header x-api-key", (p0["headers"] or {}).get("x-api-key") == "sk-ant", p0["headers"])
check("dung model API (khong phai sub_model)", p0["json"]["model"] == "claude-sonnet-4-6", p0["json"]["model"])
check("system rieng + co loi dan JSON", p0["json"]["system"].startswith("S") and "JSON" in p0["json"]["system"])
check("messages chi 1 luot user", p0["json"]["messages"] == [{"role": "user", "content": "U"}],
      p0["json"]["messages"])
check("max_tokens toi thieu 4096", p0["json"]["max_tokens"] >= 4096, p0["json"]["max_tokens"])
check("tra ve text", out == '{"ok": 1}', out)

posts.clear()
queue[:] = [R(200, {"content": [{"type": "text", "text": '{"a":'}], "stop_reason": "max_tokens"}),
            R(200, {"content": [{"type": "text", "text": '{"a": 1}'}], "stop_reason": "end_turn"})]
out = providers._chat("claude", MSGS, max_tokens=8000, step_label="t4b")
check("bi cat -> goi lai voi ngan sach lon hon",
      len(posts) == 2 and posts[1]["json"]["max_tokens"] > posts[0]["json"]["max_tokens"],
      [p["json"]["max_tokens"] for p in posts])
check("lay ban day du", out == '{"a": 1}', out)

posts.clear()
queue[:] = [R(400, {"error": {"message": "temperature is not supported for this model"}}),
            R(200, {"content": [{"type": "text", "text": "ok"}], "stop_reason": "end_turn"})]
out = providers._chat("claude", MSGS, step_label="t4c")
check("400 vi temperature -> goi lai khong temperature",
      len(posts) == 2 and "temperature" in posts[0]["json"] and "temperature" not in posts[1]["json"],
      [list(p["json"].keys()) for p in posts])

posts.clear()
queue[:] = [R(401, {"error": "invalid x-api-key"})]
try:
    providers._chat("claude", MSGS, step_label="t4d")
    check("401 -> nem loi", False, "khong nem")
except RuntimeError as e:
    check("401 -> bao key bi tu choi, khong thu lai", "tu choi" in str(e) and len(posts) == 1, str(e)[:120])

config.set_providers({"claude": {"base_url": "https://proxy.example/v1"}})
posts.clear()
queue[:] = [R(200, {"choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}]})]
providers._chat("claude", MSGS, step_label="t4e")
check("Claude qua proxy -> van /chat/completions", posts[-1]["url"].endswith("/chat/completions"), posts[-1]["url"])
restore()

# ---------------------------------------------------------------------------
section("[5] cli_status(claude): model can CLI moi hon")


def status_run(version):
    def run(argv, stdin_text=None, timeout=60, cwd=None, env=None):
        if "--version" in argv:
            return 0, "%s (Claude Code)\n" % version, ""
        if argv[1:3] == ["auth", "status"]:
            return 0, json.dumps({"loggedIn": True, "authMethod": "claude.ai", "email": "a@b.c",
                                  "subscriptionType": "max"}), ""
        return 1, "", "?"
    return run


cli_providers.find_bin = lambda name: "/fake/bin/claude"
cli_providers._run = status_run("2.1.186")
st = cli_providers.cli_status("claude")
check("da dang nhap", st["logged_in"] and st["plan"] == "max", st.get("detail"))
check("opus-5-5 + fable-5-1 can cap nhat", set(st["outdated_models"]) == {"claude-opus-5-5", "claude-fable-5-1"},
      st["outdated_models"])
m55 = next(m for m in st["models"] if m["id"] == "claude-opus-5-5")
check("model can cap nhat ghi phien ban", m55.get("needs_update") == "2.1.280", m55)
check("khong lo khoa min_cli ra UI", all("min_cli" not in m for m in st["models"]))
check("co danh sach muc suy nghi", st["reasoning"]["claude-opus-5"]["levels"] == list(cli_providers.CLAUDE_EFFORTS))
check("co lenh cap nhat", st.get("update_cmd") == "claude update")
check("SPEC goc khong bi sua", all("needs_update" not in m for m in cli_providers.SPEC["claude"]["models"]))
cli_providers._run = status_run("2.1.300")
st = cli_providers.cli_status("claude")
check("CLI moi -> khong model nao can cap nhat", st["outdated_models"] == [], st["outdated_models"])
restore()

# ---------------------------------------------------------------------------
section("[6] Loi CLI qua cu cho model -> goi y cap nhat")
reset_providers()
cli_providers.find_bin = lambda name: "/fake/bin/claude"
cli_providers._run = lambda argv, stdin_text=None, timeout=60, cwd=None, env=None: (1, json.dumps({
    "type": "result", "is_error": True,
    "result": "API Error: 400 Claude Code 2.1.186 does not support this model; version 2.1.280 or later is "
              "required"}), "")
try:
    cli_providers.cli_chat("claude", "claude-opus-5-5", MSGS, step_label="t6")
    check("nem CliError", False, "khong nem")
except cli_providers.CliError as e:
    check("thong bao cap nhat Claude Code + phien ban can", "Cập nhật Claude Code" in str(e) and "2.1.280" in str(e),
          str(e)[:200])
restore()

print("\n%s" % ("TAT CA OK" if not FAILED else "%d FAIL: %s" % (len(FAILED), ", ".join(FAILED))))
sys.exit(1 if FAILED else 0)
