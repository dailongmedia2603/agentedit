#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Goi GPT / Claude / Gemini qua TAI KHOAN da dang nhap tren may thay vi API key.

Cach lam: chay CLI CHINH CHU da dang nhap san tren may o che do headless
(khong giao dien), roi doc ket qua ra:

  - Claude  -> `claude -p`    (Claude Code CLI, goi Pro/Max)
  - GPT     -> `codex exec`   (Codex CLI, goi ChatGPT Plus/Pro)
  - Gemini  -> `gemini -p`    (Gemini CLI, tai khoan Google — xem khoi GEMINI CLI ben duoi)

Day la duong CHINH THUC duoc ho tro: token cua goi subscription nam trong
CLI cua chinh nha cung cap, app khong dong vao, khong gia mao client nao.
Doi lai: may phai cai san CLI do va da dang nhap.

Module CHI dung thu vien chuan (subprocess/json/os) — khong them dependency.
"""
import os
import re
import json
import time
import uuid
import shutil
import tempfile
import threading
import subprocess

import winsupport
from debug_log import log_step_call, log_step_response, log_step_note

IS_WIN = winsupport.IS_WIN
_HOME = os.path.expanduser("~")

# Thu muc co the chua binary khi app chay tu Finder / Start menu (GUI khong ke thua PATH shell)
if IS_WIN:
    _LAD = os.environ.get("LOCALAPPDATA") or os.path.join(_HOME, "AppData", "Local")
    _RAD = os.environ.get("APPDATA") or os.path.join(_HOME, "AppData", "Roaming")
    _EXTRA_DIRS = [
        os.path.join(_HOME, ".capcut-studio", "tools", "bin"),
        os.path.join(_HOME, ".capcut-studio", "tools", "codex", "bin"),   # goi Codex chinh chu (Doctor cai)
        os.path.join(_HOME, ".local", "bin"),                             # Claude Code (trinh cai chinh chu)
        os.path.join(_LAD, "agy", "bin"),                                 # Antigravity CLI (install.ps1)
        os.path.join(_RAD, "npm"),
        os.path.join(_HOME, ".bun", "bin"),
        os.path.join(_LAD, "Volta", "bin"),
        os.path.join(_HOME, ".cargo", "bin"),
    ]
else:
    _EXTRA_DIRS = [
        os.path.expanduser("~/.capcut-studio/tools/bin"),   # Doctor tu cai dung ban ghim (codex)
        os.path.expanduser("~/.local/bin"),
        os.path.expanduser("~/.local/node/bin"),
        os.path.expanduser("~/.bun/bin"),
        os.path.expanduser("~/.volta/bin"),
        os.path.expanduser("~/.cargo/bin"),
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
    ]


def _t(msg):
    """Loi nhan cho nguoi dung: Windows khong co 'Terminal' -> PowerShell."""
    return msg.replace("Terminal", "PowerShell") if IS_WIN else msg

# Model goi y cho tung CLI (UI do danh sach nay vao dropdown).
# Khong "chot cung": user van go tay duoc ten model khac ngoai danh sach.
#
# Danh sach da doi chieu THAT tren may 2026-09-23 (goi thu tung model, khong doan ten).
# Luu y: alias "opus" cua Claude Code tro ve claude-opus-4-8 (ban CU), nen o day
# ghi thang ten day du de lay dung ban moi nhat.
SPEC = {
    "claude": {
        "bin": "claude",
        "label": "Claude Code CLI",
        "plan_label": "Claude Pro / Max / Team",
        "install_cmd": "curl -fsSL https://claude.ai/install.sh | bash",
        "npm_package": "@anthropic-ai/claude-code",
        "login_cmd": "claude auth login",
        "update_cmd": "claude update",
        # Lap ke hoach goi 7-9 luot lien tiep -> mac dinh la ban manh da chay that tren may user.
        # Da goi thu tung id 2026-09-27 voi Claude Code 2.1.186: opus-5 / sonnet-5 / fable-5 /
        # haiku-4-5 chay; opus-5-5 va fable-5-1 bi API tu choi "Claude Code 2.1.186 does not
        # support this model; version 2.1.280 / 2.1.251" -> `min_cli` (UI goi y cap nhat CLI).
        "default_model": "claude-opus-5",
        "models": [
            {"id": "claude-opus-5-5", "label": "Opus 5.5", "note": "Mạnh nhất", "min_cli": "2.1.280"},
            {"id": "claude-fable-5-1", "label": "Fable 5.1", "note": "Mạnh, bản mới", "min_cli": "2.1.251"},
            {"id": "claude-opus-5", "label": "Opus 5", "note": "Mạnh — nên dùng lập kế hoạch"},
            {"id": "claude-fable-5", "label": "Fable 5", "note": "Mạnh"},
            {"id": "claude-sonnet-5", "label": "Sonnet 5", "note": "Cân bằng tốc độ / chất lượng"},
            {"id": "claude-haiku-4-5", "label": "Haiku 4.5", "note": "Nhanh & nhẹ nhất"},
        ],
    },
    "gpt": {
        "bin": "codex",
        "label": "Codex CLI",
        "plan_label": "ChatGPT Plus / Pro",
        # lenh cai TAY (can Node.js); app / Doctor cai ban chinh chu tren GitHub, khong can Node (toolchain.ts)
        "install_cmd": "npm i -g @openai/codex",
        "npm_package": "@openai/codex",
        "login_cmd": "codex login",
        # Buoc lap ke hoach chay 6 luot LIEN TIEP (B1..B6), nen toc do moi luot bi nhan 6.
        # So giay duoi day do THAT tren buoc B2-timeline ngay 2026-09-23, khong phai uoc luong.
        # gpt-6-sol tuy manh hon nhung 66s x6 = ~7 phut cho rieng khau ke hoach -> khong lam mac dinh.
        "default_model": "gpt-6-luna",
        "models": [
            {"id": "gpt-6-luna", "label": "GPT-6-Luna", "note": "Nhanh nhat (~7s/buoc)"},
            {"id": "gpt-5.6-sol", "label": "GPT-5.6-Sol", "note": "Ban cu (~30s/buoc)"},
            {"id": "gpt-6-sol", "label": "GPT-6-Sol", "note": "Ky hon nhung cham (~66s/buoc)"},
            {"id": "gpt-6-astra", "label": "GPT-6-Astra", "note": "Manh nhat, cham nhat"},
        ],
    },
    # Gemini qua ANTIGRAVITY CLI (`agy`) — tai khoan Google ca nhan (ke ca Google AI Pro / Ultra).
    # Gemini CLI (`gemini`) KHONG con dung duoc cho tai khoan ca nhan tu 18/06/2026 (Google tra
    # IneligibleTierError "This client is no longer supported..."), da do that tren may user.
    # Danh sach model that lay tu `agy models` (agy_models); list duoi day chi la du phong.
    "gemini": {
        "bin": "agy",
        "label": "Antigravity CLI",
        "plan_label": "Tài khoản Google",
        "install_cmd": "curl -fsSL https://antigravity.google/cli/install.sh | bash",
        "npm_package": None,
        "login_cmd": "agy",
        "default_model": "gemini-3.1-pro-high",
        "models": [
            {"id": "gemini-3.1-pro-high", "label": "Gemini 3.1 Pro (High)", "note": "Hiểu video kỹ nhất (chậm hơn)"},
            {"id": "gemini-3.1-pro-low", "label": "Gemini 3.1 Pro (Low)", "note": "Nhanh hơn Pro High"},
            {"id": "gemini-3.8-flash-high", "label": "Gemini 3.8 Flash (High)", "note": "Nhanh, nhẹ hạn mức"},
        ],
    },
}

if IS_WIN:
    # Lenh cai TAY tren Windows (app / Doctor tu cai bang chinh cac trinh cai nay — toolchain.ts)
    SPEC["claude"]["install_cmd"] = "irm https://claude.ai/install.ps1 | iex"
    SPEC["gpt"]["install_cmd"] = "npm i -g @openai/codex"
    SPEC["gemini"]["install_cmd"] = "irm https://antigravity.google/cli/install.ps1 | iex"

SUPPORTED = tuple(SPEC.keys())

# Muc suy nghi (reasoning effort) cua Codex. Moi model chi ho tro mot phan — danh sach that lay
# tu `codex debug models` (model_catalog). Muc cao -> ky hon nhung cham + ton han muc hon, nen
# thoi gian cho duoc nhan theo he so nay (khong thi buoc dai de bi cat giua chung).
EFFORT_TIMEOUT_FACTOR = {"minimal": 1.0, "low": 1.0, "medium": 1.5, "high": 2.0,
                         "xhigh": 3.0, "max": 4.0, "ultra": 5.0}
# Tran thoi gian 1 luot goi: Electron cho sidecar toi da 2 gio cho ca buoc lap plan.
MAX_CLI_TIMEOUT = 3600
# Muc `--effort` Claude Code nhan (theo `claude --help`); da goi thu that voi opus-5 / sonnet-5 /
# fable-5 / haiku-4-5, model nao cung nhan.
CLAUDE_EFFORTS = ("low", "medium", "high", "xhigh", "max")


class CliError(RuntimeError):
    """Loi thuoc tang CLI (chua cai / chua dang nhap / het han muc / timeout)."""

    def __init__(self, msg="", *args):
        super().__init__(_t(msg) if isinstance(msg, str) else msg, *args)


# ----------------------------------------------------------------------------
# Tim binary + doc trang thai dang nhap
# ----------------------------------------------------------------------------
def _augmented_env():
    env = dict(os.environ)
    parts = [d for d in _EXTRA_DIRS if os.path.isdir(d)]
    parts += [p for p in (env.get("PATH") or "").split(os.pathsep) if p]
    seen, merged = set(), []
    for p in parts:
        if p not in seen:
            seen.add(p)
            merged.append(p)
    env["PATH"] = os.pathsep.join(merged)
    # CLI chay trong app -> tat mau ANSI cho de parse
    env["NO_COLOR"] = "1"
    env.pop("ELECTRON_RUN_AS_NODE", None)
    return env


# Bien moi truong lam Claude Code dung API key / router (vd 9Router: ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL) THAY
# cho goi subscription: co bien la `claude auth status` bao authMethod "oauth_token" / -p tinh tien API key. Che do goi
# subscription cua app BO cac bien nay cho rieng tien trinh claude (khong dung toi cau hinh khac cua may).
CLAUDE_KEY_ENV = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "ANTHROPIC_CUSTOM_HEADERS",
                  "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY")


def _claude_env():
    env = _augmented_env()
    for k in list(env):
        if k.upper() in CLAUDE_KEY_ENV:
            env.pop(k, None)
    return env


def _claude_oauth_saved():
    """Co phien dang nhap Claude.ai luu trong file (Windows / Linux: <config>/.credentials.json -> claudeAiOauth).
    macOS luu trong Keychain -> tra False (khong can: o macOS auth status da dung)."""
    cfg = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(_HOME, ".claude")
    try:
        with open(os.path.join(cfg, ".credentials.json"), encoding="utf-8") as f:
            d = json.load(f)
        o = d.get("claudeAiOauth") if isinstance(d, dict) else None
        return bool(isinstance(o, dict) and (o.get("refreshToken") or o.get("accessToken")))
    except (OSError, ValueError):
        return False


def find_bin(name):
    """Tra duong dan tuyet doi toi binary CLI, hoac None."""
    spec = SPEC.get(name)
    if not spec:
        return None
    exe = spec["bin"]
    found = shutil.which(exe, path=_augmented_env()["PATH"])
    if found:
        return found
    for d in _EXTRA_DIRS:
        for ext in ((".exe", ".cmd", "") if IS_WIN else ("",)):
            p = os.path.join(d, exe + ext)
            if os.path.isfile(p) and os.access(p, os.X_OK):
                return p
    return None


def _run(argv, stdin_text=None, timeout=60, cwd=None, env=None):
    """Chay lenh, tra (returncode, stdout, stderr). Khong nem exception."""
    if IS_WIN:
        # Windows: het gio phai giet CA CAY (chau con giu ong dan -> subprocess.run treo sau khi giet con)
        try:
            return winsupport.run(argv, input=(stdin_text or ""), timeout=timeout, env=env or _augmented_env(), cwd=cwd)
        except subprocess.TimeoutExpired:
            return -9, "", "TIMEOUT sau %ds" % timeout
        except OSError as e:
            return -1, "", str(e)
    try:
        p = subprocess.run(
            argv,
            input=(stdin_text or ""),
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env or _augmented_env(),
            cwd=cwd,
        )
        return p.returncode, p.stdout or "", p.stderr or ""
    except subprocess.TimeoutExpired:
        return -9, "", "TIMEOUT sau %ds" % timeout
    except OSError as e:
        return -1, "", str(e)


def _version_tuple(text):
    """"2.1.186 (Claude Code)" -> (2, 1, 186). () neu khong doc duoc."""
    m = re.search(r"(\d+)\.(\d+)\.(\d+)", text or "")
    return tuple(int(x) for x in m.groups()) if m else ()


def cli_status(name):
    """Trang thai CLI cua 1 provider — de UI hien va de Doctor kiem tra.

    Tra: {supported, installed, path, version, logged_in, account, plan,
          detail, install_cmd, login_cmd, models, default_model}
    """
    spec = SPEC.get(name)
    if not spec:
        return {"supported": False, "installed": False, "logged_in": False,
                "detail": "Provider %r khong ho tro goi subscription." % name}

    out = {
        "supported": True,
        "label": spec["label"],
        "plan_label": spec["plan_label"],
        "install_cmd": spec["install_cmd"],
        "npm_package": spec.get("npm_package"),
        "login_cmd": spec["login_cmd"],
        "models": list(spec["models"]),
        "default_model": spec["default_model"],
        "installed": False,
        "path": None,
        "version": None,
        "logged_in": False,
        "account": None,
        "plan": None,
        "detail": "",
    }

    path = find_bin(name)
    if not path:
        out["detail"] = _t("Chưa cài %s trên máy — mở Doctor để app tự cài đúng bản, hoặc chạy trong Terminal:\n  %s"
                           % (spec["label"], spec["install_cmd"]))
        return out
    out["installed"] = True
    out["path"] = path

    rc, so, se = _run([path, "--version"], timeout=25)
    if rc == 0:
        out["version"] = (so or se).strip().splitlines()[0][:60] if (so or se).strip() else None

    if name == "gemini":
        out["logged_in"] = agy_logged_in()
        out["workdir"] = agy_workdir()
        if out["logged_in"]:
            out["detail"] = "Đã đăng nhập tài khoản Google qua Antigravity CLI."
            models = agy_models()
            if models:
                out["models"] = models
        else:
            out["detail"] = "Đã cài %s nhưng CHƯA đăng nhập tài khoản Google." % spec["label"]
        return out

    if name == "claude":
        out["update_cmd"] = spec.get("update_cmd")
        # Model can ban CLI moi hon ban dang cai -> van hien trong danh sach, kem ghi chu cap nhat
        ver = _version_tuple(out["version"])
        models, outdated = [], []
        for m in spec["models"]:
            m = dict(m)
            need = m.pop("min_cli", None)
            if need and ver and ver < _version_tuple(need):
                m["needs_update"] = need
                m["note"] = "cần cập nhật Claude Code ≥ %s" % need
                outdated.append(m["id"])
            models.append(m)
        out["models"] = models
        out["outdated_models"] = outdated
        # Cung khuon voi Codex de UI dung chung o "Muc suy nghi" ("" = mac dinh cua Claude Code)
        out["reasoning"] = {m["id"]: {"default": "", "levels": list(CLAUDE_EFFORTS)} for m in models}
        rc, so, se = _run([path, "auth", "status"], timeout=30, env=_claude_env())
        data = _first_json(so)
        if isinstance(data, dict) and data.get("loggedIn"):
            out["logged_in"] = True
            out["account"] = data.get("email")
            out["plan"] = data.get("subscriptionType")
            if (data.get("authMethod") or "") != "claude.ai" and _claude_oauth_saved():
                # router / API key dat trong ~/.claude/settings.json (env) -> auth status bao khac; app goi claude voi
                # --setting-sources "" + bo bien key -> van dung PHIEN Claude.ai da luu
                out["detail"] = ("Đã đăng nhập tài khoản Claude.ai (app bỏ qua cấu hình API key / router của Claude Code "
                                 "trên máy khi gọi).")
            elif (data.get("authMethod") or "") != "claude.ai":
                out["detail"] = _t("Claude Code đang dùng API key chứ không phải gói subscription. "
                                   "Bấm “Đăng nhập Claude” bên dưới (hoặc chạy `claude auth login` "
                                   "trong Terminal) và chọn đăng nhập bằng tài khoản Claude.ai.")
                out["logged_in"] = False
            else:
                out["detail"] = "Đã đăng nhập%s%s" % (
                    (" — %s" % out["account"]) if out["account"] else "",
                    (" (gói %s)" % out["plan"]) if out["plan"] else "")
        else:
            out["detail"] = "Đã cài %s nhưng CHƯA đăng nhập tài khoản Claude." % spec["label"]
        return out

    # gpt / codex
    rc, so, se = _run([path, "login", "status"], timeout=30)
    text = (so + se).strip()
    low = text.lower()
    if rc == 0 and "logged in" in low:
        out["logged_in"] = True
        out["detail"] = text.splitlines()[0][:120] if text else "Da dang nhap"
        if "api key" in low:
            out["logged_in"] = False
            out["detail"] = ("Codex dang dung API key chu khong phai goi ChatGPT. "
                             "Chay `codex logout` roi `codex login` va chon "
                             "\"Sign in with ChatGPT\".")
    else:
        out["detail"] = "Đã cài %s nhưng CHƯA đăng nhập tài khoản ChatGPT." % spec["label"]
    # Muc suy nghi tung model ho tro (UI dung de dung dropdown "Muc suy nghi")
    out["reasoning"] = {k: {"default": v["default"], "levels": v["levels"]}
                        for k, v in model_catalog().items()}
    return out


def all_status():
    return {n: cli_status(n) for n in SUPPORTED}


_CATALOG = {"at": 0.0, "data": None}
_CATALOG_LOCK = threading.Lock()
_CATALOG_TTL = 600


def model_catalog(refresh=False):
    """{slug: {"default": muc_mac_dinh, "levels": [...], "label": ten}} cua Codex CLI.

    Doc tu `codex debug models` (danh muc kem theo CLI, doc duoc ca khi chua dang nhap, ~1s).
    Cache 10 phut. Loi / chua cai CLI -> {} (UI lui ve danh sach muc chung).
    """
    with _CATALOG_LOCK:
        if not refresh and _CATALOG["data"] is not None and time.time() - _CATALOG["at"] < _CATALOG_TTL:
            return _CATALOG["data"]
    path = find_bin("gpt")
    out = {}
    if path:
        rc, so, _se = _run([path, "debug", "models"], timeout=30)
        data = _first_json(so) if rc == 0 else None
        for m in (data or {}).get("models") or []:
            if not isinstance(m, dict) or not m.get("slug"):
                continue
            levels = []
            for x in m.get("supported_reasoning_levels") or []:
                eff = x.get("effort") if isinstance(x, dict) else x
                if isinstance(eff, str) and eff:
                    levels.append(eff)
            out[m["slug"]] = {"default": m.get("default_reasoning_level") or "",
                              "levels": levels, "label": m.get("display_name") or m["slug"],
                              "visible": m.get("visibility") == "list"}
    with _CATALOG_LOCK:
        _CATALOG["at"], _CATALOG["data"] = time.time(), out
    return out


def claude_effort(effort):
    """Muc `--effort` se gui cho Claude Code ("" = mac dinh cua Claude Code)."""
    effort = (effort or "").strip().lower()
    return effort if effort in CLAUDE_EFFORTS else ""


def effort_for(model, effort):
    """Muc suy nghi se THUC SU gui cho `model`: "" neu de mac dinh, hoac muc model khong ho tro
    (gui muc la -> Codex bao loi, hong ca buoc)."""
    effort = (effort or "").strip().lower()
    if not effort or effort not in EFFORT_TIMEOUT_FACTOR:
        return ""
    info = model_catalog().get(model)
    if info and info.get("levels") and effort not in info["levels"]:
        return ""
    return effort


# ----------------------------------------------------------------------------
# Goi chat
# ----------------------------------------------------------------------------
def _first_json(text):
    """Lay JSON object dau tien trong stdout (CLI co the in them dong rac)."""
    t = (text or "").strip()
    if not t:
        return None
    try:
        return json.loads(t)
    except ValueError:
        pass
    start = t.find("{")
    while start != -1:
        depth, instr, esc = 0, False, False
        for i in range(start, len(t)):
            c = t[i]
            if esc:
                esc = False
                continue
            if c == "\\":
                esc = True
                continue
            if c == '"':
                instr = not instr
                continue
            if instr:
                continue
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(t[start:i + 1])
                    except ValueError:
                        break
        start = t.find("{", start + 1)
    return None


def _split_messages(messages):
    """Gop messages kieu OpenAI thanh (system, user).

    CLI headless chi nhan 1 luot, nen cac luot assistant/user sau (vong tu sua
    JSON o gpt_plan) duoc goi lai thanh 1 khoi hoi thoai co nhan.
    """
    sys_parts, convo = [], []
    for m in messages or []:
        role = m.get("role")
        c = m.get("content", "")
        if isinstance(c, list):
            c = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in c)
        c = c if isinstance(c, str) else json.dumps(c, ensure_ascii=False)
        if role == "system":
            sys_parts.append(c)
        elif role == "assistant":
            convo.append("[Cau tra loi truoc cua ban]\n" + c)
        else:
            convo.append(c)
    return "\n\n".join(sys_parts).strip(), "\n\n".join(convo).strip()


_JSON_NUDGE = ("\n\nQUAN TRONG: tra ve DUY NHAT mot JSON object hop le. "
               "Khong bao ```json```, khong loi dan, khong giai thich, "
               "khong goi bat ky cong cu nao.")


def cli_chat(name, model, messages, json_mode=False, req_timeout=300, step_label="cli", images=None,
             effort=None):
    """Goi 1 luot chat qua CLI chinh chu. Tra ve text (chuoi).

    `images`: danh sach file anh dinh kem (chi Codex CLI ho tro — `codex exec -i`).
    `effort`: muc suy nghi cho Codex ("" / None = mac dinh cua model). Muc model khong ho tro
    bi bo qua (ghi chu vao nhat ky), thoi gian cho nhan theo EFFORT_TIMEOUT_FACTOR.
    Nem CliError kem thong bao tieng Viet doc duoc neu that bai.
    """
    spec = SPEC.get(name)
    if not spec:
        raise CliError("Provider %r khong ho tro goi subscription." % name)

    path = find_bin(name)
    if not path:
        raise CliError(
            "Chua cai %s nen khong dung duoc goi subscription cho %s.\n"
            "Mo Terminal va chay:\n  %s\nRoi dang nhap:\n  %s\n"
            "Hoac doi ve che do API Key trong Cai dat API."
            % (spec["label"], name.upper(), spec["install_cmd"], spec["login_cmd"]))

    model = (model or spec["default_model"]).strip()
    if name == "gemini":
        model = agy_model(model)
    system, user = _split_messages(messages)
    if json_mode:
        system = (system + _JSON_NUDGE) if system else _JSON_NUDGE.strip()

    images = [p for p in (images or []) if p and os.path.isfile(p)]
    if images and name != "gpt":
        raise CliError("%s khong nhan anh dinh kem o che do headless." % spec["label"])
    if name == "gpt":
        eff = effort_for(model, effort)
    elif name == "claude":
        eff = claude_effort(effort)
    else:
        eff = ""
    if name in ("gpt", "claude") and (effort or "").strip() and not eff:
        log_step_note(step_label, "%s: model %s khong ho tro muc suy nghi '%s' -> dung mac dinh cua model"
                      % (spec["bin"], model, effort))
    if eff:
        req_timeout = min(MAX_CLI_TIMEOUT, int(req_timeout * EFFORT_TIMEOUT_FACTOR.get(eff, 1.0)))
    params = {}
    if images:
        params["images"] = [os.path.basename(p) for p in images]
    if name in ("gpt", "claude"):
        params["reasoning_effort"] = eff or "mac dinh cua model"
    log_step_call(step_label, "cli:%s" % spec["bin"], model, system, user, params=params or None)

    if name == "claude":
        text = _claude_chat(path, model, system, user, req_timeout, step_label, effort=eff)
    elif name == "gemini":
        prompt = ("%s\n\n---\n\n%s" % (system, user)) if system else user
        text = _agy_call(path, agy_model(model), prompt, [], req_timeout, step_label)
    else:
        text = _codex_chat(path, model, system, user, req_timeout, step_label, images=images, effort=eff)

    if not (text or "").strip():
        raise CliError(
            "%s chay xong nhung khong tra ve noi dung nao.\n\nBuoc: %s | model: %s\n"
            "Thu doi model khac trong Cai dat API, hoac doi ve che do API Key."
            % (spec["label"], step_label, model))
    log_step_response(step_label, "cli:%s" % spec["bin"], text)
    return text


def _quota_hint(name, blob):
    """Nhan dien het han muc goi subscription (khac han loi key sai)."""
    low = (blob or "").lower()
    keys = ("usage limit", "rate limit", "limit reached", "quota", "too many requests",
            "resets at", "upgrade to", "429")
    if name == "gemini":
        keys += ("resource_exhausted", "exhausted your", "capacity")
    if not any(k in low for k in keys):
        return None
    if name == "gemini":
        return ("Tài khoản Google đã HẾT HẠN MỨC (Antigravity CLI) hoặc model đang quá tải — đây không "
                "phải lỗi cấu hình.\nCách xử lý: đợi một lúc rồi chạy lại, chọn model nhẹ hơn (Flash), hoặc "
                "tạm chuyển Gemini về chế độ API Key trong Cài đặt API.\n\nCLI báo: %s" % (blob or "").strip()[:300])
    plan = SPEC[name]["plan_label"]
    return ("Goi %s da HET HAN MUC trong khung gio nay — day khong phai loi cau hinh.\n"
            "Cach xu ly: doi toi khi han muc reset, hoac tam doi provider nay ve "
            "che do API Key trong Cai dat API.\n\nCLI bao: %s" % (plan, (blob or "").strip()[:300]))


def _auth_hint(name, blob):
    low = (blob or "").lower()
    if not any(k in low for k in ("not logged in", "unauthorized", "authentication",
                                  "please run", "login", "401", "invalid_api_key")):
        return None
    if name == "gemini":
        return ("Antigravity CLI chưa đăng nhập tài khoản Google (hoặc phiên đăng nhập đã hết hạn).\n"
                "Vào Cài đặt API → Gemini → bấm “Đăng nhập Google (mở Terminal)”.\n\nCLI báo: %s"
                % (blob or "").strip()[:300])
    spec = SPEC[name]
    return ("%s chua dang nhap (hoac phien dang nhap da het han).\n"
            "Mo Terminal va chay:\n  %s\n\nCLI bao: %s"
            % (spec["label"], spec["login_cmd"], (blob or "").strip()[:300]))


def _outdated_hint(name, blob):
    """Claude Code cu hon ban model can: API tra 400 'does not support this model; version X'."""
    m = re.search(r"does not support this model;?\s*version\s*([\d.]+)", blob or "", re.I)
    if name != "claude" or not m:
        return None
    return ("Claude Code trên máy quá cũ cho model này (cần bản %s trở lên).\n"
            "Vào Cài đặt API → Claude → bấm “Cập nhật Claude Code”, hoặc chạy trong Terminal:\n  %s\n"
            "Hoặc chọn model khác (Opus 5 / Sonnet 5)." % (m.group(1), SPEC["claude"]["update_cmd"]))


def _raise_cli(name, step_label, model, rc, so, se):
    blob = ((se or "") + "\n" + (so or "")).strip()
    hint = _outdated_hint(name, blob)
    if hint:
        raise CliError("%s\n\nBuoc: %s | model: %s" % (hint, step_label, model))
    for hint in (_auth_hint(name, blob), _quota_hint(name, blob)):
        if hint:
            raise CliError("%s\n\nBuoc: %s | model: %s" % (hint, step_label, model))
    if rc == -9:
        raise CliError(
            "%s khong tra loi kip (qua %s).\n\nBuoc: %s | model: %s\n"
            "Model suy luan sau co the chay rat lau — thu model nhe hon, "
            "hoac doi ve che do API Key."
            % (SPEC[name]["label"], se or "timeout", step_label, model))
    raise CliError(
        "%s bao loi (ma thoat %s).\n\nBuoc: %s | model: %s\nChi tiet: %s"
        % (SPEC[name]["label"], rc, step_label, model, blob[:600] or "(khong co thong bao)"))


def _claude_chat(path, model, system, user, req_timeout, step_label, effort=""):
    argv = [
        path, "-p",
        "--output-format", "json",
        "--model", model,
        "--max-turns", "1",
        # Chay nhu 1 lan goi LLM thuan: khong nap CLAUDE.md, khong MCP, khong skill, khong cong cu
        # (co cong cu thi model co the goi Read/Bash roi het luot ma chua tra JSON).
        "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
        "--setting-sources", "",
        "--disable-slash-commands",
        "--tools", "",
        # Khong ghi phien vao ~/.claude/projects -> lich su Claude Code cua user khong bi lan
        "--no-session-persistence",
    ]
    if effort:
        argv += ["--effort", effort]
    workdir = tempfile.mkdtemp(prefix="autocapcut-cli-")
    if system:
        if IS_WIN:
            # Windows: ca dong lenh <= 32767 ky tu; system R4 ~30K -> qua file (WinError 206 neu de tham so)
            spf = os.path.join(workdir, "system-prompt.md")
            with open(spf, "w", encoding="utf-8") as f:
                f.write(system)
            argv += ["--system-prompt-file", spf]
        else:
            argv += ["--system-prompt", system]

    rc, so, se = _run(argv, stdin_text=user, timeout=req_timeout, cwd=workdir, env=_claude_env())
    data = _first_json(so)

    if isinstance(data, dict) and data.get("type") == "result":
        if data.get("is_error"):
            _raise_cli("claude", step_label, model, rc,
                       str(data.get("result") or ""), se)
        usage = data.get("usage") or {}
        log_step_note(step_label, "claude-cli: %sms, out %s token"
                      % (data.get("duration_ms"), usage.get("output_tokens")))
        return data.get("result") or ""

    if rc != 0:
        _raise_cli("claude", step_label, model, rc, so, se)
    # rc=0 nhung khong parse duoc JSON -> tra raw de lop _safe_json o tren tu sua
    return so


def _codex_chat(path, model, system, user, req_timeout, step_label, images=None, effort=""):
    # Codex exec khong co o system prompt rieng -> ghep vao dau prompt.
    prompt = ("%s\n\n---\n\n%s" % (system, user)) if system else user

    workdir = tempfile.mkdtemp(prefix="autocapcut-cli-")
    outfile = os.path.join(workdir, "last_message.txt")
    argv = [
        path, "exec",
        "--skip-git-repo-check",   # workdir tam khong phai git repo
        "--ephemeral",             # khong ghi session ra disk
        "--ignore-user-config",    # bo qua ~/.codex/config.toml + AGENTS.md cua user
        "--sandbox", "read-only",  # khong cho sua file
        "--color", "never",
        "-C", workdir,
        "-m", model,
    ]
    if effort:
        # Ghi de muc suy nghi CHO LAN GOI NAY (khong dung toi ~/.codex/config.toml cua user)
        argv += ["-c", 'model_reasoning_effort="%s"' % effort]
    argv += [
        "-o", outfile,
        "-",                       # doc prompt tu stdin
    ]
    # Anh dinh kem dat SAU "-": `-i` nhan nhieu gia tri lien tiep, dat truoc thi "-"
    # bi hieu nham la ten mot file anh.
    for img in images or []:
        argv += ["-i", img]
    rc, so, se = _run(argv, stdin_text=prompt, timeout=req_timeout, cwd=workdir)

    text = ""
    if os.path.isfile(outfile):
        try:
            with open(outfile, encoding="utf-8") as f:
                text = f.read().strip()
        except OSError:
            text = ""

    if not text and rc != 0:
        _raise_cli("gpt", step_label, model, rc, so, se)
    if not text:
        # Fallback: lay khoi nam sau nhan "codex" cuoi cung trong stdout,
        # cat bo phan thong ke "tokens used" o duoi.
        tail = (so or "").rsplit("\ncodex\n", 1)
        text = tail[1] if len(tail) == 2 else ""
        if "tokens used" in text:
            text = text.rsplit("tokens used", 1)[0]
        text = text.strip()
    return text


# ----------------------------------------------------------------------------
# ANTIGRAVITY CLI (`agy`) — Gemini doc hieu VIDEO bang tai khoan Google (ke ca AI Pro / Ultra)
# ----------------------------------------------------------------------------
# Da chay that `agy` 1.2.11 (2026-09-26) bang tai khoan Pro cua user + may chu Gemini gia:
#   - `agy -p <prompt> --output-format json --model <m> --print-timeout <n>s` chay 1 luot roi thoat;
#     JSON: {conversation_id, status (SUCCESS|ERROR|...), response, error, usage}.
#   - agy la AGENT: video den model qua cong cu `view_file` (ho tro image/pdf/video/audio, <= 100 MB)
#     -> gui inlineData video/mp4 (ca hinh + tieng). Prompt phai bao no view_file tung duong dan tuyet
#     doi. File trong thu muc lam viec duoc doc khong can xin phep; cong cu khac bi tu choi o headless.
#   - Moi luot luu HAI ban sao video: conversations/<id>.db va brain/<id>/.tempmediaStorage/*.mp4
#     -> sau moi luot xoa theo conversation_id. So file trong .tempmediaStorage = so video model DA XEM
#     -> dung de kiem tra model co that xem video khong (khong thi ket qua la bia).
#   - Dang nhap: giao dien toan man hinh (TUI) trong Terminal that, luu phien o
#     ~/.gemini/antigravity-cli/antigravity-oauth-token (app chi kiem tra CO file, khong doc).
#     Bien SSH_CONNECTION/SSH_TTY -> agy in link + nhan ma (khong tu mo trinh duyet mac dinh) -> user
#     dan link vao dung trinh duyet co tai khoan Pro. App mo Terminal bang file .command (Electron).
#   - Google (dien dan chinh thuc): goi binary agy chinh chu headless tu app khac tren tai khoan AI Pro
#     ca nhan la duoc phep neu khong lay token; chay dong thoi / lien tuc de cham gioi han RPM/TPM.
AGY_HOME = os.path.join(os.path.expanduser("~"), ".gemini", "antigravity-cli")
AGY_WORKDIR = os.path.join(os.path.expanduser("~"), ".capcut-studio", "agy-work")
AGY_FILE_LIMIT = 100 * 1024 * 1024          # view_file tu choi file lon hon
_AGY_MODELS = {"at": 0.0, "data": None}
_agy_tl = threading.local()


# Ten model cua Gemini CLI cu (da luu trong Cai dat truoc 2026-09-26) -> ten tuong ung trong agy
AGY_LEGACY_MODELS = {
    "gemini-3.1-pro-preview": "gemini-3.1-pro-high",
    "gemini-3-pro-preview": "gemini-3.1-pro-high",
    "gemini-2.5-pro": "gemini-3.1-pro-high",
    "gemini-3-flash-preview": "gemini-3.8-flash-high",
    "gemini-2.5-flash": "gemini-3.8-flash-medium",
}


def agy_model(model):
    """Ten model se truyen cho agy (doi ten cu cua Gemini CLI; rong -> mac dinh)."""
    m = (model or "").strip()
    return AGY_LEGACY_MODELS.get(m, m) or SPEC["gemini"]["default_model"]


def agy_workdir():
    os.makedirs(os.path.join(AGY_WORKDIR, "jobs"), exist_ok=True)
    return AGY_WORKDIR


_CMDKEY = {"at": 0.0, "hit": False}


def _windows_cred_has_agy():
    """Windows: agy (go-keyring) luu phien trong Credential Manager — `cmdkey /list` chi liet ke TEN muc."""
    if time.time() - _CMDKEY["at"] < 2:
        return _CMDKEY["hit"]
    hit = False
    try:
        r = subprocess.run([os.path.join(os.environ.get("SystemRoot", "C:\\Windows"), "System32", "cmdkey.exe"), "/list"],
                           capture_output=True, text=True, timeout=8)
        hit = bool(re.search(r"antigravity|jetski", r.stdout or "", re.I))
    except (OSError, subprocess.TimeoutExpired):
        hit = False
    _CMDKEY.update(at=time.time(), hit=hit)
    return hit


def agy_logged_in():
    """agy da co phien dang nhap chua (khong doc noi dung). agy luu phien qua go-keyring: macOS thuong ra FILE
    antigravity-oauth-token (Keychain cham -> roi ve file); Windows luu trong CREDENTIAL MANAGER, KHONG co file (su co
    that 2026-10-01: dang nhap xong app van bao chua) -> them file danh dau keyring-marker-* + `cmdkey /list`."""
    if os.path.isfile(os.path.join(AGY_HOME, "antigravity-oauth-token")):
        return True
    try:
        if os.path.isdir(AGY_HOME) and any(n.lower().startswith("keyring-marker") or ("oauth" in n.lower() and "token" in n.lower())
                                           for n in os.listdir(AGY_HOME)):
            return True
    except OSError:
        pass
    return _windows_cred_has_agy() if IS_WIN else False


def _agy_model_note(mid):
    if mid == "gemini-3.1-pro-high":
        return "Hiểu video kỹ nhất (chậm hơn)"
    if mid.startswith("gemini-") and "-pro" in mid:
        return "Nhanh hơn Pro High"
    return "Nhanh, nhẹ hạn mức"


def agy_models(refresh=False):
    """[{id,label,note}] cac model GEMINI tu `agy models` (cache 10 phut), Pro dung dau.
    Model khac (Claude, GPT-OSS...) bi bo: buoc nay can XEM video, chi Gemini lam duoc.
    Loi -> [] (UI dung danh sach du phong)."""
    if not refresh and _AGY_MODELS["data"] is not None and time.time() - _AGY_MODELS["at"] < 600:
        return _AGY_MODELS["data"]
    path = find_bin("gemini")
    out = []
    if path:
        rc, so, _se = _run([path, "models"], timeout=60, cwd=agy_workdir())
        for line in (so or "").splitlines() if rc == 0 else []:
            parts = line.split("\t")
            if len(parts) >= 2 and parts[0].strip().startswith("gemini-") and " " not in parts[0].strip():
                mid, label = parts[0].strip(), parts[1].strip()
                out.append({"id": mid, "label": label, "note": _agy_model_note(mid)})
        # Pro truoc (hieu video tot hon), giu thu tu agy trong tung nhom
        out.sort(key=lambda m: 0 if "-pro" in m["id"] else 1)
    _AGY_MODELS["at"], _AGY_MODELS["data"] = time.time(), out
    return out


def gemini_last_meta():
    """Thong tin lan goi agy gan nhat CUA LUONG NAY: {"models": [...], "viewed": n, "conversation_id"}."""
    return getattr(_agy_tl, "meta", None) or {}


def _agy_cleanup(job_dir, conv_id):
    """Xoa thu muc job + hoi thoai cua lan goi (2 ban sao video). Tra so video model da xem."""
    shutil.rmtree(job_dir, ignore_errors=True)
    if not conv_id or any(c in conv_id for c in "/\\:") or conv_id.startswith("."):
        return 0
    brain = os.path.join(AGY_HOME, "brain", conv_id)
    media = os.path.join(brain, ".tempmediaStorage")
    try:
        viewed = len([n for n in os.listdir(media) if not n.startswith(".")])
    except OSError:
        viewed = 0
    shutil.rmtree(brain, ignore_errors=True)
    for ext in ("", "-wal", "-shm", "-journal"):
        try:
            os.remove(os.path.join(AGY_HOME, "conversations", conv_id + ".db" + ext))
        except OSError:
            pass
    return viewed


# Windows: CA dong lenh <= 32767 ky tu, prompt Gemini (kem schema / phan tich) co the dai hon -> dua prompt qua
# STDIN bang che do stream-json cua agy (`-p=` rong + `--input-format stream-json`; 1 dong
# {"event":"user","message":{"content": ...}}; ket qua = dong {"event":"result","result":{...}} cung dang JSON
# cua `--output-format json`). Da goi that 2026-10-01 (agy 1.2.14). macOS giu `-p <prompt>` nhu cu.
AGY_ARG_LIMIT = 24000


def _agy_use_stdin(full):
    return IS_WIN or os.environ.get("STUDIO_AGY_STDIN") == "1" or len(full) > 100000


def _agy_argv(path, full, model, req_timeout):
    """(argv, stdin_text) cho 1 luot agy headless."""
    common = ["--disable-slash-commands", "--print-timeout", "%ds" % int(req_timeout)]
    if model:
        common += ["--model", model]
    if _agy_use_stdin(full):
        msg = json.dumps({"event": "user", "message": {"content": full}}, ensure_ascii=False)
        return [path, "--input-format", "stream-json", "--output-format", "stream-json"] + common + ["-p="], msg + "\n"
    return [path, "-p", full, "--output-format", "json"] + common, ""


def _agy_result(so):
    """JSON ket qua cua agy: dang `json` (1 object) hoac `stream-json` (dong event "result")."""
    for line in reversed((so or "").splitlines()):
        line = line.strip()
        if line.startswith("{") and '"event"' in line:
            try:
                ev = json.loads(line)
            except ValueError:
                continue
            if ev.get("event") == "result" and isinstance(ev.get("result"), dict):
                return ev["result"]
    return _first_json(so)


def _agy_call(path, model, prompt, files, req_timeout, step_label):
    """Chay `agy -p` trong thu muc lam viec rieng. files = video dinh kem (theo thu tu).
    Tra text tra loi; nem CliError. Co video ma model khong mo xem -> CliError (tranh ket qua bia)."""
    work = agy_workdir()
    job_dir = os.path.join(work, "jobs", uuid.uuid4().hex[:12])
    os.makedirs(job_dir, exist_ok=True)
    paths = []
    try:
        for i, f in enumerate(files or []):
            size = os.path.getsize(f)
            if size > AGY_FILE_LIMIT:
                raise CliError("File %s nặng %.1f MB — Antigravity CLI chỉ xem được file ≤ 100 MB."
                               % (os.path.basename(f), size / 1e6))
            dst = os.path.join(job_dir, "video_%d%s" % (i + 1, os.path.splitext(f)[1].lower() or ".mp4"))
            try:
                os.link(f, dst)          # cung o dia -> khong ton cho
            except OSError:
                shutil.copyfile(f, dst)
            paths.append(dst)
        full = prompt
        if paths:
            full += ("\n\n# CACH XEM VIDEO\nDung cong cu view_file mo TUNG file duoi day (dung thu tu, xem ca "
                     "HINH va nghe TIENG) roi moi tra loi. KHONG chay lenh, KHONG ghi file, KHONG tim tren web.\n"
                     + "\n".join("%d. %s" % (i + 1, p) for i, p in enumerate(paths)))
        argv, stdin_text = _agy_argv(path, full, model, req_timeout)
        _agy_tl.meta = {"models": [model] if model else [], "viewed": 0}
        rc, so, se = _run(argv, stdin_text=stdin_text, timeout=int(req_timeout) + 60, cwd=work)
        data = _agy_result(so)
    except BaseException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    conv = data.get("conversation_id") if isinstance(data, dict) else None
    viewed = _agy_cleanup(job_dir, conv)
    _agy_tl.meta = {"models": [model] if model else [], "viewed": viewed, "conversation_id": conv}

    def unknown_model(blob):
        # "Headless mode exits non-zero if an unknown model is specified" — co the chi in ra stderr
        if "unknown model" in blob.lower() or "model not found" in blob.lower():
            raise CliError("Antigravity CLI không có model %r cho tài khoản này — chọn model khác trong "
                           "Cài đặt API.\n\nBước: %s\nCLI báo: %s" % (model, step_label, blob.strip()[:300]))

    if not isinstance(data, dict):
        if rc != 0:
            unknown_model("%s\n%s" % (so or "", se or ""))
            _raise_cli("gemini", step_label, model, rc, so, se)
        return so
    status = str(data.get("status") or "")
    if status != "SUCCESS":
        err = data.get("error")
        msg = err.get("message") if isinstance(err, dict) else str(err or "")
        blob = "%s %s\n%s" % (status, msg, se or "")
        unknown_model(blob)
        _raise_cli("gemini", step_label, model, rc if rc else 1, blob, "")
    if paths and viewed < len(paths):
        raise CliError("Antigravity CLI trả lời nhưng model chỉ mở xem %d/%d video — kết quả có thể là "
                       "đoán, không dùng.\n\nBước: %s | model: %s" % (viewed, len(paths), step_label, model))
    usage = data.get("usage") or {}
    log_step_note(step_label, "agy: %s giây, vào %s / ra %s token, đã xem %d video"
                  % (data.get("duration_seconds"), usage.get("input_tokens"), usage.get("output_tokens"), viewed))
    return data.get("response") or ""


def gemini_video(model, prompt, files, req_timeout=900, step_label="Gemini-sources"):
    """Gui prompt + video (da nen) cho Gemini qua Antigravity CLI (tai khoan Google). Tra text."""
    spec = SPEC["gemini"]
    path = find_bin("gemini")
    if not path:
        raise CliError("Chưa cài Antigravity CLI nên không dùng được chế độ tài khoản Google cho Gemini.\n"
                       "Vào Cài đặt API → Gemini → bấm “Cài Antigravity CLI tự động”, hoặc chạy trong Terminal:\n"
                       "  %s\nHoặc đổi Gemini về chế độ API Key." % spec["install_cmd"])
    model = agy_model(model)
    log_step_call(step_label, "cli:agy", model, "", prompt,
                  params={"videos": ["%s (%.1f MB)" % (os.path.basename(f), os.path.getsize(f) / 1e6)
                                     for f in files]})
    text = _agy_call(path, model, prompt, files, req_timeout, step_label)
    if not (text or "").strip():
        raise CliError("Antigravity CLI chạy xong nhưng không trả về nội dung nào.\n\nBước: %s | model: %s"
                       % (step_label, model))
    return text
