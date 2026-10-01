#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cau hinh & trang thai cho sidecar (luong Video Remotion).

- Doc/ghi ~/.capcut-studio/state.json (venv_python cua sidecar, tuy chon Remotion...).
- Giu API keys + provider config TRONG BO NHO (khong ghi plaintext ra disk).
  Keys do Electron (Keychain) day xuong qua POST /config luc khoi dong.
"""
import os
import json
import threading

HOME = os.path.expanduser("~")
ENGINE_HOME = os.path.join(HOME, ".capcut-studio")
STATE_PATH = os.path.join(ENGINE_HOME, "state.json")

# Cau hinh provider mac dinh (OpenAI-compatible cho phep override base_url + model)
#
# auth_mode:
#   "api_key"      -> goi thang HTTP API bang khoa da nhap
#   "subscription" -> (MAC DINH tu 2026-10-01) goi qua CLI chinh chu da dang nhap san (Claude Code / Codex / Antigravity CLI),
#                     dung han muc cua goi Max / ChatGPT Plus / tai khoan Google thay vi tra tien API.
#                     Khi do dung `sub_model` chu khong dung `model`, va base_url/api_key
#                     bi bo qua hoan toan. Xem SUBSCRIPTION_CAPABLE.
# sub_effort: muc suy nghi (reasoning effort) khi goi Codex CLI. "" = de model tu dung muc
#             mac dinh cua no (vd gpt-6-sol = low). Xem cli_providers.EFFORT_LEVELS.
DEFAULT_PROVIDERS = {
    "gemini": {
        "base_url": "https://generativelanguage.googleapis.com",
        "model": "gemini-2.5-flash",
        "api_key": "",
        "auth_mode": "subscription",
        "sub_model": "gemini-3.1-pro-high",
        "sub_effort": "",
    },
    "gpt": {
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4o",
        "api_key": "",
        "auth_mode": "subscription",
        "sub_model": "gpt-6-luna",
        "sub_effort": "",
    },
    "claude": {
        "base_url": "https://api.anthropic.com/v1",
        "model": "claude-sonnet-4-6",
        "api_key": "",
        "auth_mode": "subscription",
        "sub_model": "claude-opus-5",
        "sub_effort": "",
    },
}

# Provider dung duoc goi subscription (khop voi cli_providers.SUPPORTED)
SUBSCRIPTION_CAPABLE = ("gpt", "claude", "gemini")

# Provider chay cac buoc LAP KE HOACH (B1..B7, R4, R5). Nguoi dung chon trong Cai dat API,
# Electron ghi vao state.json -> "plan_provider". Phan tich video mau la Gemini (tu 2026-09-28); tao anh AI
# + chu anh AI van la GPT qua Codex CLI (image_generation).
PLAN_PROVIDERS = ("gpt", "claude")
DEFAULT_PLAN_PROVIDER = "claude"

_lock = threading.Lock()
# Cau hinh runtime trong RAM (khong persist key)
_runtime = {
    "providers": json.loads(json.dumps(DEFAULT_PROVIDERS)),
}


def load_state():
    """Doc state.json. Tra dict rong neu chua co."""
    if os.path.isfile(STATE_PATH):
        try:
            with open(STATE_PATH, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_state(state):
    os.makedirs(ENGINE_HOME, exist_ok=True)
    with open(STATE_PATH, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
    return state


def venv_python():
    """Python cua venv chay sidecar (state.json -> venv_python, do Doctor ghi). None neu chua co."""
    return load_state().get("venv_python")


def plan_provider():
    """Provider lap ke hoach: LUON "claude" (2026-10-01 user: bo lua chon GPT / Claude, an muc "AI lap ke hoach" —
    state.json cu con ghi "gpt" cung bi bo qua). Duong GPT van giu trong code, chi mo cho TEST bang bien moi truong
    STUDIO_PLANNER_TEST=gpt (test dung API GPT gia qua HTTP, khong goi CLI that)."""
    v = str(os.environ.get("STUDIO_PLANNER_TEST") or "").strip().lower()
    return v if v in PLAN_PROVIDERS else DEFAULT_PLAN_PROVIDER


def set_providers(providers):
    """Cap nhat config provider trong RAM. providers = {gemini:{base_url,model,api_key}, ...}."""
    with _lock:
        for name, cfg in (providers or {}).items():
            if name not in _runtime["providers"]:
                _runtime["providers"][name] = {}
            base = _runtime["providers"][name]
            for k in ("base_url", "model", "api_key", "auth_mode", "sub_model", "sub_effort"):
                if k in cfg and cfg[k] is not None:
                    base[k] = cfg[k]
            # Chi provider co CLI chinh chu moi duoc bat che do subscription
            if base.get("auth_mode") == "subscription" and name not in SUBSCRIPTION_CAPABLE:
                base["auth_mode"] = "api_key"
    return get_providers(masked=True)


def get_providers(masked=False):
    with _lock:
        out = json.loads(json.dumps(_runtime["providers"]))
    if masked:
        for name in out:
            k = out[name].get("api_key") or ""
            out[name]["api_key"] = ("***" + k[-4:]) if len(k) >= 4 else ("set" if k else "")
            out[name]["has_key"] = bool(k)
    return out


def uses_subscription(name):
    """True neu provider dang duoc cau hinh chay bang goi subscription (qua CLI)."""
    with _lock:
        cfg = _runtime["providers"].get(name) or {}
        return cfg.get("auth_mode") == "subscription" and name in SUBSCRIPTION_CAPABLE


def active_model(name):
    """Ten model dang thuc su duoc dung, tuy theo auth_mode."""
    cfg = provider(name)
    if uses_subscription(name):
        return cfg.get("sub_model") or ""
    return cfg.get("model") or ""


def provider_fingerprint(name):
    """Van tay dinh danh 'ai da tra loi' cho 1 provider.

    Dung lam MOT PHAN cua khoa cache buoc: doi model hay doi cach ket noi
    (API key <-> goi subscription) thi ket qua cu KHONG duoc dung lai nua.
    Khong co van tay nay thi user doi model xong bam chay lai van nhan y nguyen
    ket qua cu, tuong la model moi lam — sai ma khong he bao loi.
    """
    cfg = provider(name)
    if uses_subscription(name):
        fp = "%s|sub|%s" % (name, cfg.get("sub_model") or "")
        # Chi them khi co dat muc suy nghi -> nguoi chua dat gi giu nguyen van tay cu (cache con dung)
        effort = sub_effort(name)
        return fp + ("|effort=%s" % effort if effort else "")
    return "%s|key|%s@%s" % (name, cfg.get("model") or "", cfg.get("base_url") or "")


# Muc suy nghi hop le (Codex: theo danh muc `codex debug models`; Claude Code: `--effort`
# low..max; model nao ho tro muc nao do cli_providers kiem lai luc goi). Chuoi la -> bo qua,
# dung mac dinh cua model.
EFFORT_LEVELS = ("minimal", "low", "medium", "high", "xhigh", "max", "ultra")


def sub_effort(name):
    """Muc suy nghi da chon cho CLI cua provider ("" = mac dinh cua model)."""
    v = str(provider(name).get("sub_effort") or "").strip().lower()
    return v if v in EFFORT_LEVELS else ""


def provider(name):
    with _lock:
        return json.loads(json.dumps(_runtime["providers"].get(name, {})))
