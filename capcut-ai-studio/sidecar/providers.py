#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cac provider AI: Gemini (doc-hieu video, gan nhan meme), GPT hoac Claude (lap ke hoach Remotion —
nguoi dung chon trong Cai dat API, xem config.plan_provider()). Chi dung `requests` (co san trong venv).

Tu dong nhan dien kieu API theo base_url:
  - base chua 'generativelanguage' -> Gemini NATIVE (Files API)
  - base chua 'anthropic.com'      -> Claude NATIVE (/messages)
  - con lai                        -> OpenAI-compatible (/chat/completions, Bearer)  [vd vilao.ai, key4u.shop]
"""
import os
import re
import json
import time
import base64
import hashlib
import mimetypes
from concurrent.futures import ThreadPoolExecutor

import requests

import config
from config import provider
from debug_log import log_step_call, log_step_response, log_step_note
import cli_providers
import gemini_media
import creative
import prompt_store
import run_log
import step_cache


def _mo_ta_that_bai(r, content, cut):
    """1 dong mo ta vi sao lan goi nay khong dung duoc (cho nhat ky xu ly)."""
    if isinstance(r, tuple):
        return "Lỗi mạng: %s" % str(r[1])[:300]
    code = getattr(r, "status_code", None)
    if code and code != 200:
        return "HTTP %s: %s" % (code, (getattr(r, "text", "") or "")[:500])
    if cut:
        return "Model bị cắt giữa chừng vì hết max_tokens (finish_reason=length)%s" % (
            " — đã có %d ký tự" % len(content) if content else "")
    return "Model trả về rỗng hoặc bị chặn nội dung: %s" % ((content or "")[:300])


def _p(name):
    """Prompt dang co hieu luc: ban nguoi dung sua trong menu "Prompt & quy tac"
    (neu co) hoac hang so goc ben duoi. Doc lai moi lan goi -> sua la ap dung ngay."""
    return prompt_store.get_prompt(name, globals()[name])

TIMEOUT = 600


def _is_native_gemini(base):
    return "generativelanguage" in base or "googleapis.com" in base


def _is_native_claude(base):
    return "anthropic.com" in base


# Header nhan dien client — nhieu proxy (vilao/key4u/openrouter...) yeu cau de mo khoa model
_CLIENT_HEADERS = {
    "HTTP-Referer": "https://autocapcut.app",
    "X-Title": "Auto CapCut",
}

# Model "Claude Code / OAuth" tren cac proxy (vd vilao occ/...) bi khoa theo client.
# -> gia lap header cua Claude Code CLI de duoc cap quyen.
_CLAUDE_CODE_HEADERS = {
    "User-Agent": "claude-cli/1.0.65 (external, cli)",
    "x-app": "cli",
    "anthropic-beta": "oauth-2025-04-20,claude-code-20250219,fine-grained-tool-streaming-2025-05-14",
}


def _is_cc_model(model):
    """Model thuoc nhanh Claude Code / OAuth (vilao 'occ/', hoac co 'claude-code')."""
    m = (model or "").lower()
    return m.startswith("occ/") or m.startswith("cc/") or "claude-code" in m


def _openai_headers(key, model=None):
    h = {"Authorization": "Bearer %s" % key, "Content-Type": "application/json"}
    h.update(_CLIENT_HEADERS)
    if _is_cc_model(model):
        h.update(_CLAUDE_CODE_HEADERS)
    else:
        h["User-Agent"] = "AutoCapCut/1.0.0 (Macintosh; Apple Silicon) Desktop"
    return h


def _anthropic_headers(key):
    h = {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
        "User-Agent": "AutoCapCut/1.0.0 (Macintosh; Apple Silicon) Desktop",
    }
    h.update(_CLIENT_HEADERS)
    return h


# ----------------------------------------------------------------------------
# Test connection (theo dung kieu API cua tung base_url)
# ----------------------------------------------------------------------------
def test_connection(name):
    cfg = provider(name)
    if config.uses_subscription(name):
        return _test_subscription(name, cfg.get("sub_model") or "")
    key = cfg.get("api_key", "")
    base = (cfg.get("base_url", "") or "").rstrip("/")
    model = cfg.get("model", "")
    if not key:
        return {"ok": False, "error": "Chua nhap API key"}
    try:
        if name == "gemini" and _is_native_gemini(base):
            r = requests.get("%s/v1beta/models?key=%s" % (base, key), timeout=30)
            return _tc_result(r, "Gemini (native) OK")
        if name == "claude" and _is_native_claude(base):
            r = requests.post("%s/messages" % base, headers=_anthropic_headers(key), timeout=40, json={
                "model": model, "max_tokens": 8,
                "messages": [{"role": "user", "content": "ping"}],
            })
            return _tc_result(r, "Claude (native) OK")
        # OpenAI-compatible (GPT, hoac Gemini/Claude qua proxy)
        r = requests.post("%s/chat/completions" % base, headers=_openai_headers(key, model), timeout=40, json={
            "model": model,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 5,
        })
        return _tc_result(r, "%s OK" % name.upper())
    except requests.exceptions.RequestException as e:
        return {"ok": False, "error": "Loi ket noi: %s" % str(e)[:200]}


def _test_subscription(name, model):
    """Kiem tra duong goi-subscription: CLI da cai chua, da dang nhap chua, goi thu 1 luot."""
    st = cli_providers.cli_status(name)
    if not st.get("installed"):
        return {"ok": False, "error": st.get("detail") or "Chua cai CLI"}
    if not st.get("logged_in"):
        return {"ok": False, "error": st.get("detail") or "Chua dang nhap CLI"}
    model = model or st.get("default_model") or ""
    if name == "gemini":
        model = cli_providers.agy_model(model)
    if name == "gpt":
        effort = cli_providers.effort_for(model, config.sub_effort(name))
    elif name == "claude":
        effort = cli_providers.claude_effort(config.sub_effort(name))
    else:
        effort = ""
    try:
        text = cli_providers.cli_chat(
            name, model,
            [{"role": "system", "content": "Tra ve DUY NHAT JSON {\"ping\": \"ok\"}."},
             {"role": "user", "content": "ping"}],
            json_mode=True, req_timeout=180, step_label="test-%s-sub" % name, effort=effort)
    except cli_providers.CliError as e:
        return {"ok": False, "error": str(e)[:600]}
    except Exception as e:
        return {"ok": False, "error": "Loi khi goi %s: %s" % (st.get("label"), str(e)[:300])}
    if "ok" not in (text or "").lower():
        return {"ok": False, "error": "%s tra ve khong nhu mong doi: %s"
                                      % (st.get("label"), (text or "")[:200])}
    who = st.get("account") or ""
    plan = st.get("plan") or ""
    detail = "%s OK qua %s" % (name.upper(), st.get("plan_label"))
    if name == "gemini":
        detail += " (%s)" % st.get("label")
    if plan:
        detail += " (goi %s)" % plan
    if who:
        detail += " — %s" % who
    detail += " · model %s" % model
    if name == "gpt":
        default = (cli_providers.model_catalog().get(model) or {}).get("default")
        detail += " · suy nghĩ %s" % (effort or ("mặc định (%s)" % default if default else "mặc định"))
    elif name == "claude":
        detail += " · suy nghĩ %s" % (effort or "mặc định")
    return {"ok": True, "detail": detail}


def _tc_result(r, ok_msg):
    if r.status_code == 200:
        return {"ok": True, "detail": ok_msg}
    return {"ok": False, "error": "HTTP %d: %s" % (r.status_code, r.text[:250])}


# ----------------------------------------------------------------------------
# Helper goi chat/completions (OpenAI-compatible)
# ----------------------------------------------------------------------------
def debug_raw(name, json_mode=False):
    """Goi 1 chat ngan va tra ve cau truc raw de soi (co reasoning/thinking khong)."""
    cfg = provider(name)
    key = cfg["api_key"]
    base = (cfg["base_url"] or "").rstrip("/")
    model = cfg["model"]
    body = {"model": model, "messages": [{"role": "user", "content": "Tra loi: 2+2 bang may?"}], "max_tokens": 200}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    r = requests.post("%s/chat/completions" % base, headers=_openai_headers(key, model), timeout=60, json=body)
    out = {"status": r.status_code, "model": model}
    try:
        data = r.json()
    except ValueError:
        return {"status": r.status_code, "raw_text": r.text[:1000]}
    out["top_keys"] = list(data.keys())
    out["usage"] = data.get("usage")
    ch = (data.get("choices") or [{}])[0]
    out["finish_reason"] = ch.get("finish_reason")
    msg = ch.get("message") or {}
    out["message_keys"] = list(msg.keys())
    c = msg.get("content")
    out["content_type"] = type(c).__name__
    out["content_len"] = len(c) if isinstance(c, str) else None
    out["content_sample"] = (c[:120] if isinstance(c, str) else str(c)[:120])
    out["has_reasoning_content"] = bool(msg.get("reasoning_content"))
    out["reasoning_len"] = len(msg.get("reasoning_content") or "") if msg.get("reasoning_content") else 0
    # usage co reasoning_tokens khong?
    ct = (data.get("usage") or {}).get("completion_tokens_details")
    out["reasoning_tokens"] = (ct or {}).get("reasoning_tokens") if isinstance(ct, dict) else None
    return out


def _extract_content(data):
    """Trich text tu nhieu dang response (string / list parts / reasoning)."""
    try:
        choice = data["choices"][0]
    except (KeyError, IndexError, TypeError):
        return ""
    msg = choice.get("message") or {}
    content = msg.get("content")
    if isinstance(content, list):
        # content dang [{type:text, text:...}, ...]
        parts = []
        for p in content:
            if isinstance(p, dict):
                parts.append(p.get("text") or p.get("content") or "")
            elif isinstance(p, str):
                parts.append(p)
        content = "".join(parts)
    if not content:
        # mot so model reasoning de o cho khac
        content = msg.get("reasoning_content") or choice.get("text") or ""
    return content or ""


# Tran ngan sach token dau ra. Model suy luan co the ngon vai nghin token chi de "nghi",
# nen phai de rong tay hon nhieu so voi do dai JSON thuc te can viet.
MAX_OUTPUT_BUDGET = 32000

# Loi mang la loi TAM THOI — cho lau hon va nhieu lan hon loi "model tra ve rac".
# Tong cong cho toi ~37s truoc khi bo cuoc.
NET_RETRY_DELAYS = [2, 5, 10, 20]


def _net_reason(msg):
    """Doi thong bao ky thuat cua requests thanh cau nguoi doc hieu."""
    m = (msg or "").lower()
    if "nameresolution" in m or "failed to resolve" in m or "name or service not known" in m:
        return "May khong phan giai duoc ten mien cua may chu API (loi DNS)"
    if "timed out" in m or "timeout" in m:
        return "May chu API khong phan hoi kip (timeout)"
    if "connection refused" in m:
        return "May chu API tu choi ket noi"
    if "ssl" in m or "certificate" in m:
        return "Loi chung chi SSL khi ket noi may chu API"
    if "connection aborted" in m or "connection reset" in m:
        return "Ket noi toi may chu API bi ngat giua chung"
    return "Khong ket noi duoc toi may chu API"


# Timeout cho duong CLI: khong nhan max_tokens/temperature nen chi con thoi gian.
# CLI cong them khoang khoi dong ~3-8s so voi HTTP thuan, va model suy luan chay lau hon,
# nen cho rong tay gap doi (toi thieu 180s).
def _cli_timeout(req_timeout):
    return max(180, int((req_timeout or 60) * 2))


def plan_chat(messages, **kw):
    """Goi AI cho 1 buoc LAP KE HOACH (B1..B7, R4, R5): GPT hoac Claude tuy lua chon trong
    Cai dat API (config.plan_provider()). Buoc moi cua khau ke hoach thi goi ham nay."""
    return _chat(config.plan_provider(), messages, **kw)


def plan_ai_name():
    """Ten hien thi cua AI lap ke hoach (cho dong nhat ky)."""
    return "Claude" if config.plan_provider() == "claude" else "GPT"


def _chat(name, messages, json_mode=False, max_tokens=4096, temperature=0.6,
          req_timeout=60, max_attempts=4, step_label="openai"):
    """Diem vao DUY NHAT cho GPT/Claude — tu chon duong di theo auth_mode.

    - auth_mode="subscription" -> chay CLI chinh chu da dang nhap (goi Max / ChatGPT Plus)
    - auth_mode="api_key"      -> goi HTTP /chat/completions nhu truoc
                                  (Claude voi base api.anthropic.com -> /messages goc)

    Giu nguyen chu ky cua _openai_chat de cac buoc goi khong phai doi gi.
    max_tokens/temperature khong ap dung cho duong CLI (CLI tu quyet).
    """
    cfg = provider(name)
    if config.uses_subscription(name):
        return cli_providers.cli_chat(
            name,
            cfg.get("sub_model") or "",
            messages,
            json_mode=json_mode,
            req_timeout=_cli_timeout(req_timeout),
            step_label=step_label,
            effort=config.sub_effort(name),
        )
    base = (cfg.get("base_url") or "").rstrip("/")
    if name == "claude" and _is_native_claude(base):
        return _anthropic_chat(
            base, cfg.get("api_key") or "", cfg.get("model") or "", messages, json_mode=json_mode,
            max_tokens=max_tokens, temperature=temperature, req_timeout=req_timeout,
            max_attempts=max_attempts, step_label=step_label)
    return _openai_chat(
        base, cfg.get("api_key") or "", cfg.get("model") or "",
        messages, json_mode=json_mode, max_tokens=max_tokens, temperature=temperature,
        req_timeout=req_timeout, max_attempts=max_attempts, step_label=step_label)


def _anthropic_chat(base, key, model, messages, json_mode=False, max_tokens=4096, temperature=0.6,
                    req_timeout=60, max_attempts=4, step_label="anthropic"):
    """Claude bang API key goc (api.anthropic.com/v1/messages).

    Khac OpenAI: system nam rieng, bat buoc max_tokens, khong co response_format (json_mode ->
    dan them vao system). stop_reason="max_tokens" = bi cat giua chung -> tang ngan sach nhu
    _openai_chat. Loi mang dem rieng theo NET_RETRY_DELAYS."""
    if not key:
        raise RuntimeError("Chua nhap API key cho Claude (Cai dat API → Claude → API Key).\n\nBuoc: %s"
                           % step_label)
    url = "%s/messages" % base.rstrip("/")
    system, user = cli_providers._split_messages(messages)
    if json_mode:
        system = (system + cli_providers._JSON_NUDGE) if system else cli_providers._JSON_NUDGE.strip()
    budget = max(int(max_tokens or 0), 4096)
    use_temp = True
    net_tries = tries = 0
    last = None
    while tries < max_attempts:
        body = {"model": model, "max_tokens": budget, "system": system,
                "messages": [{"role": "user", "content": user}]}
        if use_temp and temperature is not None:
            body["temperature"] = temperature
        log_step_call(step_label, "anthropic", model, system, user,
                      params={"json_mode": json_mode, "temperature": body.get("temperature"),
                              "max_tokens": budget, "timeout_s": req_timeout})
        try:
            r = requests.post(url, headers=_anthropic_headers(key), timeout=req_timeout, json=body)
        except requests.exceptions.RequestException as ex:
            last = ("EXC", str(ex))
            if net_tries < len(NET_RETRY_DELAYS):
                delay = NET_RETRY_DELAYS[net_tries]
                net_tries += 1
                log_step_note(step_label, "Loi mang (%s) — cho %ds roi thu lai (lan %d/%d)"
                              % (_net_reason(str(ex)), delay, net_tries, len(NET_RETRY_DELAYS)))
                time.sleep(delay)
                continue
            raise RuntimeError("%s\n\nBuoc: %s | may chu: %s\nChi tiet: %s"
                               % (_net_reason(str(ex)), step_label, url.split("//")[-1].split("/")[0],
                                  str(ex)[:200]))
        last = r
        if r.status_code in (401, 403):
            raise RuntimeError("Key API Claude bi tu choi (%d). Kiem tra lai key trong Cai dat API.\n\n"
                               "Buoc: %s | model: %s\nAnthropic tra ve: %s"
                               % (r.status_code, step_label, model, (r.text or "")[:400]))
        # Model moi co the khong nhan temperature -> bo di roi goi lai (khong tinh 1 lan thu)
        if r.status_code == 400 and use_temp and "temperature" in (r.text or "").lower():
            use_temp = False
            continue
        text, cut = "", False
        if r.status_code == 200:
            try:
                data = r.json()
            except ValueError:
                data = {}
            text = "".join(b.get("text", "") for b in data.get("content") or []
                           if isinstance(b, dict) and b.get("type") == "text")
            cut = data.get("stop_reason") == "max_tokens"
            if text.strip() and not cut:
                log_step_response(step_label, "anthropic", text)
                return text
        run_log.ai_fail(step_label, _mo_ta_that_bai(r, text, cut))
        tries += 1
        if cut and budget < MAX_OUTPUT_BUDGET:
            budget = min(budget * 3, MAX_OUTPUT_BUDGET)
            continue
        if cut and text.strip():
            log_step_response(step_label, "anthropic", text)
            return text  # het duong tang ngan sach -> de lop parse JSON o tren tu sua
        if tries < max_attempts:
            time.sleep(min(2 * tries, 5))
    code = getattr(last, "status_code", "?")
    if code == 429:
        hint = "Bi gioi han toc do hoac het han muc (429) — doi vai phut roi thu lai."
    elif isinstance(code, int) and code >= 500:
        hint = "Anthropic dang loi (%d) — thu lai sau." % code
    else:
        hint = "Claude khong tra ve noi dung dung dinh dang (HTTP %s)." % code
    raise RuntimeError("%s\n\nBuoc: %s | model: %s | da thu %d lan\nAnthropic tra ve: %r"
                       % (hint, step_label, model, tries, (getattr(last, "text", "") or "")[:300]))


def _openai_chat(base, key, model, messages, json_mode=False, max_tokens=4096, temperature=0.6,
                 req_timeout=60, max_attempts=4, step_label="openai"):
    """Goi chat/completions co retry GIOI HAN (tranh treo lau).
    - req_timeout: timeout moi lan goi (giay). plan/review ~60s; understand (video) lon hon.
    - max_attempts: tong so lan thu (xoay vong cau hinh json/temperature).
    - step_label: ten buoc de debug log."""
    base = base.rstrip("/")
    url = "%s/chat/completions" % base

    # Build compact user message for debug log (khong log video base64)
    user_debug = []
    for m in messages:
        c = m.get("content", "")
        if isinstance(c, list):
            parts = []
            for p in c:
                if isinstance(p, dict):
                    t = p.get("text") or p.get("content") or ""
                    parts.append(t[:200] + ("..." if len(t) > 200 else ""))
                elif isinstance(p, str):
                    parts.append(p[:200])
            user_debug.append(" ".join(parts))
        else:
            user_debug.append(c[:6000] if len(str(c)) > 6000 else str(c))

    def call(use_json, use_temp, budget):
        body = {"model": model, "messages": messages}
        if use_temp:
            body["temperature"] = temperature
        if budget:
            body["max_tokens"] = budget
        if use_json:
            body["response_format"] = {"type": "json_object"}
        # Log call
        sys = next((m["content"] for m in messages if m["role"] == "system"), "")
        usr = next((m["content"] for m in messages if m["role"] == "user"), "")
        log_step_call(step_label, "openai-compat", model, sys, usr,
                      params={"json_mode": use_json, "temperature": temperature if use_temp else None,
                              "max_tokens": budget, "timeout_s": req_timeout})
        return requests.post(url, headers=_openai_headers(key, model), timeout=req_timeout, json=body)

    def is_blocked(c):
        low = (c or "").lower()
        return ("access denied" in low or "restricted to authorized" in low
                or "rate limit" in low or "too many request" in low)

    def auth_problem(r):
        """401/403 = key sai, bi khoa, hoac het han muc tren proxy.
        Thu lai 4 lan KHONG bao gio cuu duoc, chi lam user doi them va ton quota."""
        if getattr(r, "status_code", None) not in (401, 403):
            return None
        body = (getattr(r, "text", "") or "")[:400]
        low = body.lower()
        if "token status is unavailable" in low or "quota" in low or "insufficient" in low:
            ly_do = ("Token API tren proxy dang KHONG DUNG DUOC (bi khoa, het han, "
                     "hoac het han muc). Vao trang quan ly proxy kiem tra token.")
        elif "expired" in low:
            ly_do = "Key API da HET HAN. Cap key moi roi dan lai vao Cai dat API."
        else:
            ly_do = ("Key API bi tu choi (%d). Kiem tra lai key va base_url trong Cai dat API."
                     % r.status_code)
        return RuntimeError("%s\n\nBuoc: %s | model: %s\nProxy tra ve: %s"
                            % (ly_do, step_label, model, body))

    def out_of_budget(data):
        """finish_reason='length' = model bi CAT GIUA CHUNG vi het max_tokens.

        Voi model co suy luan noi bo (gpt-5.x, o-series...), token suy luan cung TRU vao
        max_tokens. Model co the dot sach ngan sach cho phan suy luan roi tra ve content
        RONG — dung truong hop da gap 2026-09-23 o buoc B4-captions:
          content="" | finish_reason="length" | completion_tokens=4096 (= dung max_tokens)
        Xoay json/temperature khong cuu duoc; chi co TANG NGAN SACH moi cuu duoc.
        """
        try:
            ch = (data.get("choices") or [{}])[0]
            return ch.get("finish_reason") == "length"
        except Exception:
            return False

    def attempt(use_json, use_temp, budget):
        """Tra (content, resp, thieu_ngan_sach)."""
        try:
            r = call(use_json, use_temp, budget)
        except requests.exceptions.RequestException as ex:
            return None, ("EXC", str(ex)), False
        if r.status_code != 200:
            err = auth_problem(r)
            if err:
                raise err
            return None, r, False
        try:
            data = r.json()
        except ValueError:
            return None, r, False
        c = _extract_content(data)
        cut = out_of_budget(data)
        if not c.strip() or is_blocked(c):
            return None, r, cut
        # co chu nhung van bi cat -> JSON chac chan thieu dau ngoac, cung phai tang ngan sach
        return c, r, cut

    # xoay vong cau hinh: co json -> bo json -> bo ca temperature -> lap lai
    variants = [(json_mode, True), (False, True), (False, False)]
    last = None
    budget = max_tokens or MAX_OUTPUT_BUDGET
    bumped = []          # lich su tang ngan sach, de bao loi cho ro
    last_cut = False     # lan goi cuoi co bi cat vi het token khong
    net_tries = 0        # dem RIENG cho loi mang (xem NET_RETRY_DELAYS)
    i = v = 0
    while i < max_attempts + len(bumped):
        uj, ut = variants[v % len(variants)]
        content, r, cut = attempt(uj, ut, budget)
        last, last_cut = r, cut

        # --- Loi MANG (DNS hong, mat ket noi, timeout) ---------------------
        # Day la loi TAM THOI, khac han loi "model tra ve rac". Mot cu chop DNS
        # vai giay tung lam hong ca lan chay va vut sach cong cua B1-B3 da tra tien.
        # Nen no duoc dem rieng, cho nhieu co hoi hon va cho lau hon.
        if isinstance(r, tuple) and r[0] == "EXC":
            if net_tries < len(NET_RETRY_DELAYS):
                delay = NET_RETRY_DELAYS[net_tries]
                net_tries += 1
                log_step_note(step_label, "Loi mang (%s) — cho %ds roi thu lai (lan %d/%d)"
                              % (_net_reason(r[1]), delay, net_tries, len(NET_RETRY_DELAYS)))
                time.sleep(delay)
                continue  # KHONG tinh vao max_attempts, KHONG doi variant
            break  # het co hoi -> bao loi mang o duoi

        if content and not cut:
            log_step_response(step_label, "openai-compat", content)
            return content
        run_log.ai_fail(step_label, _mo_ta_that_bai(r, content, cut))
        if cut and budget < MAX_OUTPUT_BUDGET:
            # KHONG doi variant — doi variant vo ich khi van de la ngan sach token.
            new_budget = min(budget * 3, MAX_OUTPUT_BUDGET)
            bumped.append((budget, new_budget))
            budget = new_budget
            i += 1
            time.sleep(1)
            continue
        if content:
            # het duong tang ngan sach nhung du sao cung co chu -> tra ve, de lop
            # parse JSON o tren tu xu ly/sua
            log_step_response(step_label, "openai-compat", content)
            return content
        i += 1
        v += 1
        if i < max_attempts:
            time.sleep(min(2 * i, 5))  # backoff nhe, toi da 5s

    if isinstance(last, tuple) and last[0] == "EXC":
        host = base.split("//")[-1].split("/")[0]
        raise RuntimeError(
            "%s\n\nBuoc: %s | may chu: %s | da thu lai %d lan trong %ds\n"
            "Day la loi MANG phia may ban, khong phai loi API key hay model.\n"
            "Kiem tra: wifi/mang con khong, co dang bat VPN/proxy khac khong, "
            "thu mo https://%s tren trinh duyet.\nChi tiet: %s"
            % (_net_reason(last[1]), step_label, host, net_tries,
               sum(NET_RETRY_DELAYS[:net_tries]), host, last[1][:200]))
    code = getattr(last, "status_code", "?")
    body = getattr(last, "text", "")[:300]
    if code == 429:
        hint = "Bi gioi han toc do hoac het han muc (429) — doi vai phut roi thu lai."
    elif isinstance(code, int) and code >= 500:
        hint = "Proxy/model dang loi (%d) — thu lai sau." % code
    elif last_cut:
        da_nang = (" Da tu dong nang ngan sach %s ma van khong du."
                   % " -> ".join(str(b) for _, b in bumped)) if bumped else \
                  (" Ngan sach da o muc toi da %d." % budget)
        hint = ("Model %r dot het ngan sach token cho phan SUY LUAN ma chua kip viet cau tra loi "
                "(finish_reason=length).%s\n"
                "Cach sua: chon model khong-suy-luan cho buoc nay trong Cai dat API "
                "(vd gpt-4o / claude-sonnet), hoac dung model suy luan o muc 'low'."
                % (model, da_nang))
    elif code == 200:
        hint = ("Model tra ve RONG hoac bi chan noi dung. Thu doi model khac trong Cai dat API.")
    else:
        hint = "Model khong tra ve noi dung dung dinh dang (HTTP %s)." % code
    raise RuntimeError("%s\n\nBuoc: %s | model: %s | da thu %d lan\nProxy tra ve: %r"
                       % (hint, step_label, model, max_attempts, body))


# ----------------------------------------------------------------------------
# GEMINI: doc-hieu video
# ----------------------------------------------------------------------------
def _gemini_upload_file(base, key, path, log=None):
    mime = mimetypes.guess_type(path)[0] or "video/mp4"
    size = os.path.getsize(path)
    display = os.path.basename(path)
    start_url = "%s/upload/v1beta/files?key=%s" % (base, key)
    r = requests.post(start_url, timeout=60, headers={
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": str(size),
        "X-Goog-Upload-Header-Content-Type": mime,
        "Content-Type": "application/json",
    }, data=json.dumps({"file": {"display_name": display}}))
    r.raise_for_status()
    upload_url = r.headers.get("X-Goog-Upload-URL") or r.headers.get("x-goog-upload-url")
    if not upload_url:
        raise RuntimeError("Gemini khong tra upload URL: %s" % r.text[:200])
    if log:
        log("Dang tai video len Gemini (%.1f MB)..." % (size / 1e6))
    with open(path, "rb") as f:
        data = f.read()
    r2 = requests.post(upload_url, timeout=TIMEOUT, headers={
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
        "Content-Length": str(size),
    }, data=data)
    r2.raise_for_status()
    finfo = r2.json().get("file", {})
    name, uri, state = finfo.get("name"), finfo.get("uri"), finfo.get("state")
    poll_url = "%s/v1beta/%s?key=%s" % (base, name, key)
    waited = 0
    while state == "PROCESSING" and waited < 300:
        time.sleep(3)
        waited += 3
        if log:
            log("Gemini dang xu ly video... (%ds)" % waited)
        rp = requests.get(poll_url, timeout=30)
        rp.raise_for_status()
        state = rp.json().get("state")
    if state != "ACTIVE":
        raise RuntimeError("Gemini file state=%s (khong ACTIVE)" % state)
    return {"file_uri": uri, "mime_type": mime, "name": name}


def _normalize_video_specs(videos):
    out = []
    for i, item in enumerate(videos or []):
        path = item.get("path") if isinstance(item, dict) else str(item)
        if not path or not os.path.isfile(path):
            raise RuntimeError("Khong tim thay video: %s" % path)
        out.append({
            "id": (item.get("id") if isinstance(item, dict) else None) or "source_%d" % (i + 1),
            "path": path,
            "name": (item.get("name") if isinstance(item, dict) else None) or os.path.basename(path),
            "duration": (item.get("duration") if isinstance(item, dict) else None),
        })
    if not out:
        raise RuntimeError("Can it nhat 1 video")
    return out


def _gemini_analyze_videos_openai(base, key, model, videos, prompt, source_label, log=None,
                                  step_label="Gemini-sources"):
    content = [{"type": "text", "text": prompt}]
    total_size = 0
    for video in videos:
        mime = mimetypes.guess_type(video["path"])[0] or "video/mp4"
        size = os.path.getsize(video["path"])
        total_size += size
        with open(video["path"], "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        content.append({
            "type": "text",
            "text": "%s id=%s, file=%s, duration=%s giay" % (
                source_label, video["id"], video["name"], video.get("duration")
            ),
        })
        content.append({
            "type": "image_url",
            "image_url": {"url": "data:%s;base64,%s" % (mime, b64)},
        })
    if log:
        log("Gui %d video (%.1f MB) toi %s..." % (len(videos), total_size / 1e6, model))
    text = _openai_chat(
        base, key, model,
        [{"role": "user", "content": content}],
        json_mode=True, max_tokens=20000, temperature=0.3,
        req_timeout=360, max_attempts=2, step_label=step_label,
    )
    res = _safe_json(text)
    log_step_response(step_label, "gemini", text, parsed_result=res)
    return res


def _gemini_analyze_videos_native(base, key, model, videos, prompt, source_label, log=None,
                                  step_label="Gemini-sources"):
    parts = [{"text": prompt}]
    for i, video in enumerate(videos):
        if log:
            log("Tai video %d/%d len Gemini: %s" % (i + 1, len(videos), video["name"]))
        uploaded = _gemini_upload_file(base, key, video["path"], log=log)
        parts.append({
            "text": "%s id=%s, file=%s, duration=%s giay" % (
                source_label, video["id"], video["name"], video.get("duration")
            ),
        })
        parts.append({
            "file_data": {
                "mime_type": uploaded["mime_type"],
                "file_uri": uploaded["file_uri"],
            },
        })
    return _gemini_native_generate(base, key, model, parts, step_label,
                                   params={"temperature": 0.3, "json_mode": True, "videos": [v["name"] for v in videos]})


def _gemini_native_generate(base, key, model, parts, step_label, params):
    """generateContent (API Gemini goc) voi `parts` da dung san (text / file_data / inline_data). Tra dict JSON."""
    url = "%s/v1beta/models/%s:generateContent?key=%s" % (base, model, key)
    log_step_call(step_label, "gemini-native", model, "",
                  "\n".join(p.get("text") or ("[file: %s]" % p["file_data"]["file_uri"] if "file_data" in p
                                               else "[anh %s]" % p["inline_data"]["mime_type"]) for p in parts),
                  params=params)
    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "response_mime_type": "application/json",
            "temperature": 0.3,
        },
    }
    r = requests.post(
        url, timeout=TIMEOUT,
        headers={"Content-Type": "application/json"},
        data=json.dumps(body),
    )
    if r.status_code != 200:
        log_step_response(step_label, "gemini-native", r.text, error="HTTP %d" % r.status_code)
        raise RuntimeError("Gemini generateContent HTTP %d: %s" % (r.status_code, r.text[:400]))
    data = r.json()
    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        log_step_response(step_label, "gemini-native", json.dumps(data)[:4000], error="phan hoi rong")
        raise RuntimeError("Gemini tra ve rong/loi: %s" % json.dumps(data)[:400])
    res = _safe_json(text)
    log_step_response(step_label, "gemini-native", text, parsed_result=res)
    return res


def _gemini_analyze_videos(videos, prompt, source_label, log=None, step_label="Gemini-sources"):
    """Gui prompt + video cho Gemini theo cach ket noi dang chon: API goc (Files API), proxy
    OpenAI-compatible (base64 inline), hoac Antigravity CLI `agy` (tai khoan Google).
    `videos[].path` la file SE GUI (thuong la ban da nen/cat cua gemini_media)."""
    cfg = provider("gemini")
    specs = _normalize_video_specs(videos)
    if config.uses_subscription("gemini"):
        model = (cfg.get("sub_model") or cli_providers.SPEC["gemini"]["default_model"]).strip()
        order = "\n".join("%d. %s id=%s, file=%s, duration=%s giay"
                          % (i + 1, source_label, v["id"], v["name"], v.get("duration"))
                          for i, v in enumerate(specs))
        full = prompt + "\n\nCAC FILE VIDEO DINH KEM (dung thu tu):\n" + order
        try:
            text = cli_providers.gemini_video(model, full, [v["path"] for v in specs], step_label=step_label)
        except cli_providers.CliError as e:
            log_step_response(step_label, "cli:gemini", "", error=str(e))
            raise
        result = _safe_json(text)
        log_step_response(step_label, "cli:gemini", text, parsed_result=result)
        result["_source"] = "agy:%s" % cli_providers.agy_model(model)
        return result
    key = cfg["api_key"]
    base = (cfg["base_url"] or "").rstrip("/")
    model = cfg["model"]
    if _is_native_gemini(base):
        result = _gemini_analyze_videos_native(
            base, key, model, specs, prompt, source_label, log=log, step_label=step_label
        )
        result["_source"] = "gemini-native:%s" % model
    else:
        result = _gemini_analyze_videos_openai(
            base, key, model, specs, prompt, source_label, log=log, step_label=step_label
        )
        result["_source"] = "gemini-openai:%s" % model
    return result


def gemini_files(items, prompt, step_label, log=None):
    """Gui prompt + FILE (video / anh) cho Gemini theo cach ket noi dang chon: API goc, proxy
    OpenAI-compatible, hoac Antigravity CLI `agy`. items = [{"path", "label"}] theo DUNG thu tu (label
    mo ta file cho model). Anh gui thang (inline), video API goc qua Files API. Tra dict JSON + "_source"."""
    cfg = provider("gemini")
    for it in items:
        if not it.get("path") or not os.path.isfile(it["path"]):
            raise RuntimeError("Khong tim thay file gui Gemini: %s" % it.get("path"))
    order = "\n".join("%d. %s" % (i + 1, it.get("label") or os.path.basename(it["path"])) for i, it in enumerate(items))
    if config.uses_subscription("gemini"):
        model = (cfg.get("sub_model") or cli_providers.SPEC["gemini"]["default_model"]).strip()
        full = prompt + "\n\nCAC FILE DINH KEM (dung thu tu):\n" + order
        try:
            text = cli_providers.gemini_video(model, full, [it["path"] for it in items], step_label=step_label)
        except cli_providers.CliError as e:
            log_step_response(step_label, "cli:gemini", "", error=str(e))
            raise
        result = _safe_json(text)
        log_step_response(step_label, "cli:gemini", text, parsed_result=result)
        result["_source"] = "agy:%s" % cli_providers.agy_model(model)
        return result
    key = cfg["api_key"]
    base = (cfg["base_url"] or "").rstrip("/")
    model = cfg["model"]
    mimes = [mimetypes.guess_type(it["path"])[0] or "video/mp4" for it in items]
    if _is_native_gemini(base):
        parts = [{"text": prompt}]
        for it, mime in zip(items, mimes):
            parts.append({"text": it.get("label") or os.path.basename(it["path"])})
            if mime.startswith("image/"):
                with open(it["path"], "rb") as f:
                    parts.append({"inline_data": {"mime_type": mime, "data": base64.b64encode(f.read()).decode("ascii")}})
            else:
                up = _gemini_upload_file(base, key, it["path"], log=log)
                parts.append({"file_data": {"mime_type": up["mime_type"], "file_uri": up["file_uri"]}})
        result = _gemini_native_generate(base, key, model, parts, step_label,
                                         params={"temperature": 0.3, "json_mode": True,
                                                 "files": [os.path.basename(it["path"]) for it in items]})
        result["_source"] = "gemini-native:%s" % model
        return result
    content = [{"type": "text", "text": prompt}]
    for it, mime in zip(items, mimes):
        with open(it["path"], "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        content.append({"type": "text", "text": it.get("label") or os.path.basename(it["path"])})
        content.append({"type": "image_url", "image_url": {"url": "data:%s;base64,%s" % (mime, b64)}})
    if log:
        log("Gui %d file (%.1f MB) toi %s..." % (len(items), sum(os.path.getsize(it["path"]) for it in items) / 1e6, model))
    text = _openai_chat(base, key, model, [{"role": "user", "content": content}], json_mode=True, max_tokens=20000,
                        temperature=0.3, req_timeout=600, max_attempts=2, step_label=step_label)
    result = _safe_json(text)
    log_step_response(step_label, "gemini", text, parsed_result=result)
    result["_source"] = "gemini-openai:%s" % model
    return result


def _gemini_text(system, user, step_label, req_timeout=300):
    """1 luot hoi-dap CHI CHU voi Gemini (khong video), tra JSON dang chuoi. Dung cho buoc ghep."""
    cfg = provider("gemini")
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    if config.uses_subscription("gemini"):
        model = (cfg.get("sub_model") or cli_providers.SPEC["gemini"]["default_model"]).strip()
        return cli_providers.cli_chat("gemini", model, messages, json_mode=True,
                                      req_timeout=max(req_timeout, 300), step_label=step_label)
    key = cfg["api_key"]
    base = (cfg["base_url"] or "").rstrip("/")
    model = cfg["model"]
    if _is_native_gemini(base):
        log_step_call(step_label, "gemini-native", model, system, user, params={"json_mode": True})
        body = {"systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": user}]}],
                "generationConfig": {"response_mime_type": "application/json", "temperature": 0.3}}
        r = requests.post("%s/v1beta/models/%s:generateContent?key=%s" % (base, model, key),
                          timeout=req_timeout, headers={"Content-Type": "application/json"},
                          data=json.dumps(body))
        if r.status_code != 200:
            log_step_response(step_label, "gemini-native", r.text, error="HTTP %d" % r.status_code)
            raise RuntimeError("Gemini generateContent HTTP %d: %s" % (r.status_code, r.text[:300]))
        try:
            parts = r.json()["candidates"][0]["content"]["parts"]
            text = "".join(x.get("text") or "" for x in parts)
        except (KeyError, IndexError, ValueError, TypeError):
            log_step_response(step_label, "gemini-native", r.text[:4000], error="phan hoi rong")
            raise RuntimeError("Gemini tra ve rong/loi: %s" % r.text[:300])
        log_step_response(step_label, "gemini-native", text)
        return text
    return _openai_chat(base, key, model, messages, json_mode=True, max_tokens=16000,
                        temperature=0.3, req_timeout=req_timeout, max_attempts=2, step_label=step_label)


# ----------------------------------------------------------------------------
# HIEU VIDEO NGUON: nen 720p -> (van > 20 MB) cat theo DUNG LUONG -> goi Gemini -> ghep
# ----------------------------------------------------------------------------
GEMINI_PARALLEL = 3          # so lan goi Gemini chay cung luc qua API
# Antigravity CLI (tai khoan ca nhan): Google canh bao chay dong thoi nhieu tien trinh de cham gioi han
# RPM/TPM va bi he thong chong lam dung de y -> it hon.
GEMINI_PARALLEL_AGY = 2
_KM_TYPES = ("hook", "climax", "twist", "reveal", "emotional_peak", "silence", "other")

_PART_NOTE = """# LUU Y: DAY LA 1 PHAN CUA VIDEO DAI
Video id={id} ("{name}") dai {total} giay, qua dung luong nen he thong da cat thanh {count} phan
THEO DUNG LUONG. File dinh kem la PHAN {index}/{count}, ung voi giay {start}-{end} cua video goc
(phan nay dai {length} giay).
- Chi phan tich noi dung TRONG phan nay. Dau/cuoi phan co the bi cat giua cau hoac giua hanh dong:
  van ghi binh thuong nhung gi nghe/thay duoc.
- Moc gio start/end tinh tu 0 cua PHAN NAY (he thong tu cong them {start} giay).
- Tra ve DUNG 1 phan tu trong `sources` voi id="{id}", "duration" = {length}.
- `summary` cua source = noi dung cua rieng phan nay. key_moments danh dau nhu binh thuong —
  he thong se xep hang lai tren toan video sau khi ghep cac phan."""


def _gnote(msg, level="info", log=None):
    run_log.note("Gemini-video", msg, level=level)
    if log:
        log(msg)


def _note_prep(v, prep, log=None):
    comp = prep.get("compressed")
    if prep.get("sdr_from_hdr"):
        _gnote("%s là video HDR — đã chuyển sang bản SDR (màu như trên iPhone) trước khi nén gửi Gemini."
               % v["name"], "info", log)
    if prep.get("error"):
        _gnote("Không nén được %s (%s) — gửi file gốc %.1f MB."
               % (v["name"], prep["error"][:200], prep["src_bytes"] / 1e6), "warn", log)
    elif comp:
        _gnote("Nén %s cho Gemini: %.1f MB → %.1f MB (720p)%s"
               % (v["name"], comp["src_bytes"] / 1e6, comp["bytes"] / 1e6,
                  " · dùng bản nén đã lưu" if comp.get("cached") else " · %ss" % comp.get("seconds")),
               "info", log)
    pieces = prep.get("pieces") or []
    if len(pieces) > 1:
        _gnote("%s sau nén vẫn > %.0f MB → cắt %d phần theo dung lượng: %s"
               % (v["name"], gemini_media.PIECE_LIMIT_BYTES / 1e6, len(pieces),
                  ", ".join("%s–%s (%.1f MB)" % (gemini_media.fmt_time(p["start"]), gemini_media.fmt_time(p["end"]),
                                                p["bytes"] / 1e6) for p in pieces)),
               "info", log)


def _plan_gemini_requests(items, limit=None):
    """Chia viec thanh cac lan goi: video bi cat -> moi phan 1 lan; video nguyen -> gom chung
    mot lan goi mien tong dung luong <= limit (giu cach lam cu: nhieu video nho = 1 lan goi)."""
    limit = limit or gemini_media.PIECE_LIMIT_BYTES
    reqs, group, used = [], [], 0
    for it in items:
        pieces = it["prep"]["pieces"]
        if len(pieces) > 1:
            if group:
                reqs.append({"kind": "group", "items": group})
                group, used = [], 0
            for pc in pieces:
                reqs.append({"kind": "part", "items": [it], "piece": pc})
            continue
        b = pieces[0]["bytes"]
        if group and used + b > limit:
            reqs.append({"kind": "group", "items": group})
            group, used = [], 0
        group.append(it)
        used += b
    if group:
        reqs.append({"kind": "group", "items": group})
    return reqs


def _source_prompt(meta):
    # danh gia giong noi (voice_boost) noi bang code — prompt "Hieu video nguon" user da sua van phai co
    import voice_boost
    return (_p("_GEMINI_SOURCES_PROMPT") + voice_boost.GEMINI_NOTE
            + "\n\nDANH SACH VIDEO NGUON:\n" + json.dumps(meta, ensure_ascii=False))


def _gemini_final_error(msg):
    low = (msg or "").lower()
    return any(k in low for k in ("đăng nhập", "hết hạn mức", "chỉ nhận file", "chỉ xem được file",
                                  "chưa cài", "không có model"))


def _run_gemini_request(req, idx, total, fresh):
    if req["kind"] == "part":
        it, pc = req["items"][0], req["piece"]
        v = it["spec"]
        length = round(float(pc["end"]) - float(pc["start"]), 3)
        meta = [{"id": v["id"], "name": v["name"], "duration": length,
                 "part": "%d/%d" % (pc["index"], pc["count"]),
                 "range_in_original": [pc["start"], pc["end"]]}]
        prompt = _source_prompt(meta) + "\n\n" + _PART_NOTE.format(
            id=v["id"], name=v["name"], total=round(it["duration"] or 0, 1), count=pc["count"],
            index=pc["index"], start=pc["start"], end=pc["end"], length=length)
        send = [{"id": v["id"], "path": pc["path"], "duration": length,
                 "name": "%s (phan %d/%d)" % (v["name"], pc["index"], pc["count"])}]
        label = "Gemini-sources %s phần %d/%d" % (v["id"], pc["index"], pc["count"])
    else:
        meta, send = [], []
        for it in req["items"]:
            v = it["spec"]
            meta.append({"id": v["id"], "name": v["name"], "duration": it["duration"]})
            send.append({"id": v["id"], "path": it["prep"]["pieces"][0]["path"], "name": v["name"],
                         "duration": it["duration"]})
        prompt = _source_prompt(meta)
        label = "Gemini-sources" if total == 1 else "Gemini-sources nhóm %d/%d" % (idx, total)

    files = []
    for x in send:
        st = os.stat(x["path"])
        if os.path.normcase(os.path.abspath(x["path"])).startswith(os.path.normcase(os.path.abspath(gemini_media.CACHE_DIR)) + os.sep):
            # Ban nen / phan cat: ten file da ma hoa (duong dan + kich thuoc + mtime) cua file GOC.
            # Khong dung mtime cua chinh no — moi lan dung lai cache duoc "cham" (utime) de khoi bi don.
            files.append([os.path.basename(x["path"]), st.st_size])
        else:
            files.append([os.path.abspath(x["path"]), st.st_size, st.st_mtime_ns])
    payload = {"v": 1, "files": files, "provider": config.provider_fingerprint("gemini"),
               "prompt": hashlib.sha256(prompt.encode("utf-8")).hexdigest()}
    if not fresh:
        hit = step_cache.get("gemini_sources", payload)
        if isinstance(hit, dict):
            _gnote("%s: dùng kết quả Gemini đã lưu (chưa quá 48 giờ) — không gửi lại." % label, "ok")
            return hit

    def call():
        return _gemini_analyze_videos(send, prompt, "VIDEO NGUON", step_label=label)

    try:
        res = call()
    except Exception as e:
        # CLI: thu lai 1 lan (API/proxy da tu thu lai ben trong _openai_chat)
        if not config.uses_subscription("gemini") or _gemini_final_error(str(e)):
            raise
        _gnote("%s lỗi, thử lại 1 lần: %s" % (label, str(e)[:200]), "warn")
        res = call()
    if not isinstance(res, dict):
        raise RuntimeError("%s: Gemini trả về không phải JSON object" % label)
    step_cache.put("gemini_sources", payload, res)
    return res


def _run_gemini_requests(reqs, fresh):
    if len(reqs) == 1:
        return [_run_gemini_request(reqs[0], 1, 1, fresh)]
    run = run_log.current()
    par = GEMINI_PARALLEL_AGY if config.uses_subscription("gemini") else GEMINI_PARALLEL
    _gnote("Gửi Gemini %d lượt (tối đa %d lượt cùng lúc)." % (len(reqs), par))

    def work(i):
        run_log.set_run(run)   # nhat ky theo luong -> luong phu phai gan lai run hien hanh
        return _run_gemini_request(reqs[i], i + 1, len(reqs), fresh)

    results, errors = [None] * len(reqs), []
    with ThreadPoolExecutor(max_workers=min(par, len(reqs))) as ex:
        futs = [ex.submit(work, i) for i in range(len(reqs))]
        for i, f in enumerate(futs):
            try:
                results[i] = f.result()
            except Exception as e:
                errors.append((i, e))
    if errors:
        detail = "\n".join("- lượt %d/%d: %s" % (i + 1, len(reqs), str(e)[:400]) for i, e in errors)
        raise RuntimeError("Gemini lỗi ở %d/%d lượt phân tích:\n%s\n\nCác lượt đã xong được lưu tạm 48 giờ — "
                           "chạy lại chỉ gửi lại lượt bị lỗi." % (len(errors), len(reqs), detail))
    return results


def _gemini_merge_pass(result, reqs, results, items):
    """Buoc GHEP bang AI (chi chu): viet lai tom tat lien mach + xep hang lai key_moments tren
    toan video. KHONG doi moc gio. Loi -> giu ban ghep co hoc (va ghi canh bao)."""
    part_info = {}
    for req, res in zip(reqs, results):
        if req["kind"] == "part":
            v, pc = req["items"][0]["spec"], req["piece"]
            ent = next((x for x in res.get("sources") or [] if isinstance(x, dict)), {})
            part_info.setdefault(v["id"], []).append({
                "range": "%s-%s" % (gemini_media.fmt_time(pc["start"]), gemini_media.fmt_time(pc["end"])),
                "summary": ent.get("summary") or res.get("summary") or "", "tone": res.get("tone")})
    videos = []
    for src in result["sources"]:
        kms = src.get("key_moments") or []
        videos.append({
            "id": src["id"], "name": src.get("name"), "duration": src.get("duration"),
            "parts": part_info.get(src["id"]) or [{"range": "toan bo", "summary": src.get("summary") or ""}],
            "key_moments": [{"i": i, "start": k.get("start"), "end": k.get("end"), "type": k.get("type"),
                             "description": k.get("description")} for i, k in enumerate(kms)],
        })
    groups = [{"videos": [it["spec"]["id"] for it in req["items"]], "summary": res.get("summary"),
               "tone": res.get("tone")} for req, res in zip(reqs, results) if req["kind"] == "group"]
    user = json.dumps({"videos": videos, "groups": groups}, ensure_ascii=False)
    try:
        text = _gemini_text(_p("_GEMINI_MERGE_PROMPT"), user, "Gemini-merge")
        out = _safe_json(text)
        if not isinstance(out, dict):
            raise ValueError("khong phai JSON object")
    except Exception as e:
        _gnote("Bước ghép bằng AI lỗi (%s) — giữ bản ghép từng phần, tóm tắt là nối các phần." % str(e)[:200],
               "warn")
        return False
    if isinstance(out.get("summary"), str) and out["summary"].strip():
        result["summary"] = out["summary"].strip()
    if isinstance(out.get("tone"), str) and out["tone"].strip():
        result["tone"] = out["tone"].strip()
    by_id = {x.get("id"): x for x in out.get("sources") or [] if isinstance(x, dict)}
    for src in result["sources"]:
        o = by_id.get(src["id"])
        if not o:
            continue
        if isinstance(o.get("summary"), str) and o["summary"].strip():
            src["summary"] = o["summary"].strip()
        kms, drop = list(src.get("key_moments") or []), set()
        for m in o.get("key_moments") or []:
            if not isinstance(m, dict):
                continue
            try:
                i = int(m.get("i"))
            except (TypeError, ValueError):
                continue
            if not 0 <= i < len(kms):
                continue
            if m.get("drop") is True:
                drop.add(i)
                continue
            k = dict(kms[i])
            if m.get("type") in _KM_TYPES:
                k["type"] = m["type"]
            if isinstance(m.get("description"), str) and m["description"].strip():
                k["description"] = m["description"].strip()
            kms[i] = k
        src["key_moments"] = [k for i, k in enumerate(kms) if i not in drop]
    return True


def gemini_understand_sources(videos, log=None, fresh=False):
    """Hieu video nguon.

    1. Nen moi video ve 720p (cache) — gui nhe, Gemini van thay net mat / cu chi, nghe giong.
    2. Ban nen van > 20 MB -> cat thanh nhieu phan THEO DUNG LUONG (gemini_media.split).
    3. Goi Gemini: video nguyen gom chung 1 lan (<= 20 MB/lan), moi phan cat 1 lan; chay song song,
       ket qua tung lan luu 48 gio (loi 1 lan -> chay lai chi gui lan loi). fresh=True -> goi lai het.
    4. Ghep: cong gio phan vao moc gio, bo trung o doan chong lan, roi 1 luot AI (chi chu) viet lai
       tom tat + xep hang khoanh khac tren toan video.
    Tat ca vua 1 lan goi -> ket qua y nhu truoc day (khong ghep, khong goi them AI).
    """
    specs = _normalize_video_specs(videos)
    items = []
    for v in specs:
        prep = gemini_media.prepare(v["path"], log=log)
        _note_prep(v, prep, log)
        items.append({"spec": v, "prep": prep, "duration": _f(v.get("duration"), 0.0) or prep.get("duration")})
    reqs = _plan_gemini_requests(items)
    results = _run_gemini_requests(reqs, fresh)
    info = [{"id": it["spec"]["id"], "original_mb": round(it["prep"]["src_bytes"] / 1e6, 1),
             "sent_mb": round(sum(p["bytes"] for p in it["prep"]["pieces"]) / 1e6, 1),
             "compressed": bool(it["prep"].get("compressed")),
             "parts": [[p["start"], p["end"]] for p in it["prep"]["pieces"]] if len(it["prep"]["pieces"]) > 1 else None}
            for it in items]
    if len(reqs) == 1:
        result = results[0]
        result["_gemini_input"] = info
        return result

    parts_by_id, whole = {}, {}
    for req, res in zip(reqs, results):
        srcs = [x for x in (res.get("sources") or []) if isinstance(x, dict)]
        if req["kind"] == "part":
            v = req["items"][0]["spec"]
            ent = next((x for x in srcs if x.get("id") == v["id"]), srcs[0] if srcs else {})
            parts_by_id.setdefault(v["id"], []).append((req["piece"], ent))
            continue
        for it in req["items"]:
            v = it["spec"]
            ent = next((x for x in srcs if x.get("id") == v["id"]), None)
            if ent is None and len(req["items"]) == 1 and srcs:
                ent = srcs[0]
            if ent is not None:
                ent = dict(ent)
                ent["id"] = v["id"]
                whole[v["id"]] = ent
    sources = []
    for it in items:
        v = it["spec"]
        if v["id"] in parts_by_id:
            merged, _ = gemini_media.merge_parts(v["id"], v["name"], it["duration"], parts_by_id[v["id"]])
            sources.append(merged)
        elif v["id"] in whole:
            sources.append(whole[v["id"]])
        else:
            _gnote("Gemini không trả phân tích cho %s." % v["name"], "warn", log)
    result = gemini_media.merge_top(results, sources, [it["duration"] for it in items])
    _gnote("Ghép %d lượt phân tích Gemini (đã cộng giờ từng phần, bỏ trùng ở đoạn chồng lấn)." % len(reqs), "ok")
    _gemini_merge_pass(result, reqs, results, items)
    result["_source"] = "%s · %d lượt" % (results[0].get("_source") or "gemini", len(reqs))
    result["_gemini_input"] = info
    return result


_GEMINI_MEME_PROMPT = """Ban la EDITOR video short-form dang PHAN LOAI 1 CLIP MEME de dua vao kho tai su dung.

Clip nay se duoc chen de len video chinh (A-roll) trong 1-2 giay, dung de minh hoa hoac
gay cuoi dung luc nguoi noi nhac toi mot y nao do. AI lap ke hoach sau nay SE KHONG XEM
duoc clip — no chi doc mo ta cua ban. Vi vay mo ta phai du de quyet dinh "chen vao cho nao".

# TRA VE CHI JSON

{
  "name": "ten ngan goi nho bang TIENG VIET (3-5 tu), vd: 'Trum meo ngac nhien'",
  "summary": "trong clip co gi (1 cau)",
  "emotion": "punch|positive|negative|nostalgic|soft|neutral",
  "use_when": "KHI NAO nen chen clip nay — mo ta TINH HUONG trong loi noi, khong mo ta hinh anh.
               Vd: 'Khi nguoi noi tiet lo mot con so gay soc' hay 'Sau cau noi phi ly, the hien su khong tin'",
  "tags": ["3-6 tu khoa TIENG VIET de tim kiem, vd: ngac nhien, tron mat, hai"],
  "best_start": <giay bat dau doan DAT nhat de cat ra>,
  "best_end": <giay ket thuc, nen cach best_start 1.0-2.5s>,
  "has_speech": true/false,
  "keep_audio": true/false,
  "notes": "luu y khi dung (neu co)"
}

# ⚠️ CHON "emotion" — DUNG mac dinh chon "punch" cho moi clip
Day la 6 nhan CO DINH cua he thong, moi nhan co nghia rieng:
- "punch"     = cu dam / noi thang / cao trao / pattern-interrupt gay gat (no, het, dap ban)
- "positive"  = vui / thanh cong / tram tro / tan thuong / tien bac
- "negative"  = that bai / tieu cuc / nghi ngo / khong tin / toang / xui xeo
- "nostalgic" = hoai niem / chuyen cu / retro
- "soft"      = lang dong / buon / tam su / toi nghiep
- "neutral"   = trung tinh / suy nghi / cho doi
Vi du: clip nguoi khoc -> "soft" (neu buon) hoac "negative" (neu xui xeo), KHONG phai "punch".
Clip vo tay tan thuong -> "positive". Clip no tung -> "punch". Clip "ao that day" -> "negative".
Chon nhan SAT NGHIA nhat, khong chon "punch" chi vi clip hai.

# LUU Y
- `best_start`/`best_end`: clip co the dai nhung chi 1-2 giay la "dat". Chi ra DUNG doan do.
  Neu ca clip deu dung duoc thi lay tu dau: best_start=0.
- `keep_audio`: true neu tieng cua clip LA phan hay (tieng cuoi, tieng no, cau thoai meme);
  false neu chi la nhac nen vo nghia — luc do engine se tat tieng de khong dam vao giong noi.
- `use_when` viet theo goc do NGUOI DUNG NOI GI, khong phai clip co hinh gi. Day la cho quan trong nhat.

⚠️ TRA VE CHI JSON GOC. Khong ```json```. Ky tu dau la {, ky tu cuoi la }."""


def gemini_label_meme(path, name=None, duration=None, log=None):
    """Cho Gemini XEM 1 clip meme roi tu viet nhan (emotion/use_when/tags/doan dat nhat).

    Vi sao can: AI lap ke hoach khong xem duoc clip, no chon hoan toan bang chu.
    Nhan doan tu ten file thi chung chung ('Cuoi / che gieu') va khong biet trong clip
    dai 47s thi doan nao moi dat.
    """
    # Nen 720p (cache) nhu video nguon — clip meme khong cat, phai vua 1 lan gui
    prep = gemini_media.prepare(path, allow_split=False, log=log)
    spec = _normalize_video_specs([{
        "id": "meme", "path": prep["pieces"][0]["path"], "name": name or os.path.basename(path),
        "duration": duration,
    }])
    prompt = _p("_GEMINI_MEME_PROMPT")
    if duration:
        prompt += "\n\nClip dai %.1f giay." % float(duration)
    return _gemini_analyze_videos(spec, prompt, "CLIP MEME", log=log, step_label="Gemini-meme")


_GEMINI_SFX_PROMPT = """Ban la SOUND DESIGNER dang PHAN LOAI cac file HIEU UNG AM THANH (SFX) trong kho tai su dung.

Cac file dinh kem la file AM THANH (khong co hinh). NGHE TUNG FILE. AI lap ke hoach sau nay SE KHONG
NGHE duoc file — no chi doc mo ta cua ban de quyet dinh dat SFX nao vao DIEM NHAN nao cua video
noi chuyen (talking-head). Ten file thuong vo nghia ("FAHHHH", "role reveal") — mo ta theo cai ban NGHE.

# TRA VE CHI JSON — MOT muc cho MOI file, dung "id" da cho, dung thu tu

{
  "sfx": [
    {
      "id": "<id cua file>",
      "summary": "nghe thay gi (1 cau, tieng Viet), vd: 'tieng trong bass trau dap manh roi ngan vang'",
      "sound_type": "impact|whoosh|ding|riser|glitch|pop|cash|fail|laugh|scream|voice_meme|music_sting|ambience|other",
      "has_speech": true/false,
      "speech_text": "chep CHINH XAC loi noi/hat trong file (neu co), khong co thi rong",
      "emotion": "punch|positive|negative|nostalgic|soft|neutral",
      "intensity": "nhe|vua|manh",
      "use_when": "KHI NAO nen dat — mo ta TINH HUONG trong loi nguoi noi / tren man hinh, vd: 'Ngay sau cau chot gay soc' / 'Khi con so tien lon hien len' / 'Chuyen canh nhanh giua 2 y'",
      "avoid_when": ["khi nao KHONG nen dung, vd: 'noi dung nghiem tuc, buon'", "..."],
      "tags": ["3-6 tu khoa TIENG VIET"]
    }
  ]
}

# ⚠️ CHON "emotion" — DUNG mac dinh "punch"
- "punch"     = cu dam / cao trao / pattern-interrupt gay gat (boom, dap ban, no)
- "positive"  = vui / thanh cong / dung / tien bac (ding, tinh tien, vo tay)
- "negative"  = that bai / sai / toang / xui xeo (buzzer, womp womp)
- "nostalgic" = hoai niem / retro
- "soft"      = nhe nhang / buon / tam su
- "neutral"   = chuyen canh / trung tinh (whoosh, pop nho)

# LUU Y
- has_speech = true khi file co GIONG NGUOI noi/hat thanh chu (meme giong noi). Loai nay dat de len luc
  nguoi trong video DANG NOI se nuot mat cau -> ghi vao avoid_when "dat trong khoang lang, khong de len loi noi".
- use_when viet theo goc NGUOI XEM DANG THAY/NGHE GI, khong phai file co tieng gi. Day la cho quan trong nhat.
- Khong nghe duoc file nao thi van tra muc do voi summary "khong nghe duoc" — KHONG doan theo ten.

⚠️ TRA VE CHI JSON GOC. Khong ```json```. Ky tu dau la {, ky tu cuoi la }."""


def gemini_label_sfx(items, log=None):
    """Cho Gemini NGHE mot nhom SFX (items: [{id, name, path, duration}]) roi viet nhan.
    Di dung cach ket noi Gemini dang chon trong app (tai khoan Google qua Antigravity CLI / API key);
    file am thanh gui thang (agy view_file nghe duoc mp3; Files API nhan audio/*).
    Tra {id: nhan}. Muc Gemini bo sot -> khong co trong ket qua."""
    specs = [{"id": it["id"], "path": it["path"], "name": it.get("name") or os.path.basename(it["path"]),
              "duration": it.get("duration")} for it in items]
    prompt = _p("_GEMINI_SFX_PROMPT") + "\n\nDANH SACH FILE (dung thu tu dinh kem):\n" + "\n".join(
        "%d. id=%s | ten trong kho: %s | dai %.2fs" % (i + 1, s["id"], s["name"], float(s.get("duration") or 0))
        for i, s in enumerate(specs))
    res = _gemini_analyze_videos(specs, prompt, "FILE AM THANH SFX", log=log, step_label="Gemini-sfx")
    rows = res.get("sfx") if isinstance(res, dict) else None
    if not isinstance(rows, list) and isinstance(res, dict) and res.get("id"):
        rows = [res]          # nhom 1 file, model tra thang 1 object
    ids = {s["id"] for s in specs}
    out = {}
    for i, r in enumerate(rows or []):
        if not isinstance(r, dict):
            continue
        rid = r.get("id")
        if rid not in ids and i < len(specs):
            rid = specs[i]["id"]          # model chep sai id -> khop theo thu tu
        if rid in ids and rid not in out:
            out[rid] = r
    return out


# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------
def _strip_fence(t):
    """Remove markdown code fences from ANY position in text.
    Returns the largest JSON-containing block inside ```...```, or stripped text."""
    t = (t or "").strip()
    if "```" not in t:
        return t
    parts = t.split("```")
    cand = []
    for i, part in enumerate(parts):
        if i % 2 == 1:  # inside ```...```
            stripped = part.strip()
            if stripped.lower().startswith("json"):
                stripped = stripped[4:].strip()
            if "{" in stripped:
                cand.append(stripped)
    if cand:
        return max(cand, key=len)
    for part in reversed(parts):
        if part.strip():
            return part.strip()
    return t


def _repair_json(t):
    # cac loi LLM hay gap
    t = re.sub(r",\s*([}\]])", r"\1", t)            # trailing comma
    t = re.sub(r"//[^\n]*", "", t)                   # comment //
    t = t.replace("“", '"').replace("”", '"')  # smart quotes
    t = t.replace("‘", "'").replace("’", "'")
    return t


def _extract_json_brace(text):
    """Find the outermost balanced { ... } pair using a brace counter.
    Finds ALL balanced pairs and returns the largest one (start, end) indices.
    This correctly handles markdown like **{hook, body, cta}** before real JSON."""
    best_start, best_end = -1, -1
    best_len = 0
    i = 0
    n = len(text)
    while i < n:
        if text[i] == '{':
            depth = 1
            j = i + 1
            while j < n and depth > 0:
                if text[j] == '{':
                    depth += 1
                elif text[j] == '}':
                    depth -= 1
                    if depth == 0:
                        if (j - i) > best_len:
                            best_len = j - i
                            best_start, best_end = i, j
                        break
                j += 1
        i += 1
    return (best_start, best_end)


def _safe_json(text):
    """Parse JSON from AI response text with multiple fallback strategies."""
    raw = (text or "").strip()
    if not raw:
        raise RuntimeError("AI tra ve text rong")

    # Strip fences first
    t0 = _strip_fence(raw)

    # Extract outermost JSON using brace counter (handles markdown braces)
    a, b = _extract_json_brace(t0)
    if a != -1 and b != -1 and b > a:
        t = t0[a:b + 1]
    else:
        t = t0

    last_err = None

    # 1) Parse straight
    try:
        return json.loads(t)
    except json.JSONDecodeError as e:
        last_err = e

    # 2) Repair then parse
    try:
        return json.loads(_repair_json(t))
    except json.JSONDecodeError as e:
        last_err = e

    # 3) json5 (missing commas, single quotes, comments)
    try:
        import json5
        return json5.loads(_repair_json(t))
    except Exception as e:
        last_err = e

    # 4) Strip control chars then repair+parse
    try:
        cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", t)
        return json.loads(_repair_json(cleaned))
    except json.JSONDecodeError as e:
        last_err = e

    # 5) Last-resort on RAW text (before strip_fence): largest balanced { } pair
    la, lb, best_len = -1, -1, 0
    i = 0
    while i < len(raw):
        if raw[i] == '{':
            depth = 1
            j = i + 1
            while j < len(raw) and depth > 0:
                if raw[j] == '{':
                    depth += 1
                elif raw[j] == '}':
                    depth -= 1
                    if depth == 0:
                        if (j - i) > best_len:
                            best_len = j - i
                            la, lb = i, j
                        break
                j += 1
        i += 1

    if la != -1 and lb != -1 and lb > la:
        t2 = raw[la:lb + 1]
        try:
            return json.loads(_repair_json(t2))
        except json.JSONDecodeError as e:
            last_err = e
        try:
            import json5
            return json5.loads(_repair_json(t2))
        except Exception as e:
            last_err = e

    ctx = t[max(0, getattr(last_err, 'pos', 0) - 80):getattr(last_err, 'pos', 0) + 80] if hasattr(last_err, 'pos') else t[:160]
    raise RuntimeError("Khong parse duoc JSON tu AI (%s). Doan loi: ...%s..." % (str(last_err), ctx))


# ----------------------------------------------------------------------------
# PROMPTS (ban goc — nguoi dung co the ghi de trong menu "Prompt & quy tac",
# xem prompt_store.py; LUON lay qua _p()/prompt_store.render(), khong dung truc tiep)
# ----------------------------------------------------------------------------
_GEMINI_SOURCES_PROMPT = """Ban la CHUYEN GIA DOC HIEU VIDEO. Nhiem vu DUY NHAT cua ban la XEM va GHI NHAN CHINH XAC nhung gi THUC SU co trong video. Ban KHONG PHAI editor, KHONG duoc de xuat chinh sua.

# NGUYEN TAC COT LOI
1. CHI GHI NHAN SU THAT. Neu khong chac chan -> ghi "khong ro". Tuyet doi KHONG bia them su kien, nhan vat, loi noi, boi canh, thong diep.
2. Transcript PHAI CHINH XAC TU NGU. Loi noi trong video the nao ghi y chang, khong tu y them bot, khong sua chinh ta, khong dien giai.
3. CAM XUC PHAI THEO TUNG GIAY. Khong chi danh gia cam xuc chung, phai chia thanh cac khoang thoi gian cu the, kem bang chung (giong noi, net mat, hanh dong, ngu dieu).

# SCHEMA DAU RA (CHI JSON)

Tra ve 1 JSON object dung schema:

{
  "summary": "tom tat 2-3 cau nhung gi THAT SU thay/nghe trong BO source",
  "language": "vi|en|...",
  "tone": "cam xuc CHI PHOI toan bo bo source (neu co nhieu source mau thuan -> ghi 'mixed')",
  "total_source_duration": <tong giay>,
  "sources": [
    {
      "id": "source_1",
      "name": "ten file.mp4",
      "duration": <giay>,
      "summary": "noi dung THAT SU cua rieng file nay",
      "role": "talking_head|broll|screen_recording|product|mixed|other",
      "quality": {"visual": "good|usable|poor", "audio": "good|usable|poor", "notes": "cu the ve anh sang, net/mo, rung, tieng on..."},

      "transcript": [
        {"start": 0.0, "end": 1.3, "text": "nguyen van CUM TU ngan", "emphasis": ["tu nhan manh"], "is_punchline": false},
        {"start": 1.3, "end": 2.4, "text": "cum tiep theo", "emphasis": [], "is_punchline": true},
        {"start": 2.4, "end": 5.0, "text": "", "note": "khoang im lang, khong noi gi"}
      ],

      "emotion_map": [
        {"start": 0.0, "end": 3.0, "emotion": "punch|positive|negative|nostalgic|soft|neutral|angry|sad|excited|nervous|confident|uncertain|calm|urgent",
         "evidence": "bang chung cu the: giong noi cao/gam/run?, mat cau gian/cuoi/ngac nhien?, cu chi dap ban/chi tay/khoanh tay?...",
         "intensity": "low|medium|high"},
        {"start": 3.0, "end": 7.0, "emotion": "...", "evidence": "...", "intensity": "..."}
      ],

      "key_moments": [
        {"start": 0.0, "end": 3.0, "type": "hook|climax|twist|reveal|emotional_peak|silence|other",
         "description": "chuyen gi xay ra THAT SU, tai sao day la khoanh khac quan trong"}
      ],

      "on_screen_text": ["chu co san tren man hinh (neu co)"],
      "faces_region": "vung mat nguoi (vd: giua-tren, trai, phai) de tranh caption che mat (neu co nguoi)",
      "warnings": ["van de chat luong: rung, toi, am thanh kem, mat net..."]
    }
  ],
  "warnings": ["rui ro chung cua bo source"]
}

# HUONG DAN CHI TIET

## Transcript — ⚠️ CHIA THEO CUM TU, KHONG PHAI THEO CAU
- Moi muc transcript = 1 CUM TU NGAN: **3-8 tu, toi da ~2 giay**. TUYET DOI khong gop ca cau dai
  5-6 giay vao 1 muc. Cau dai phai tach thanh nhieu muc lien tiep.
  Vi du DUNG:  {"start":12.5,"end":13.6,"text":"Thi ban noi la"}
               {"start":13.6,"end":15.0,"text":"lay cai gi cam ket","is_punchline":true}
  Vi du SAI:   {"start":12.5,"end":15.0,"text":"Thi ban noi la... lay cai gi cam ket"}
  LY DO: cum tu nay duoc dung de dat caption va SFX vao DUNG GIAY. Chia tho 1 khoi 5s thi
  caption va tieng dong se lech 1-3 giay so voi loi noi — loi de thay nhat khi xem video.
- Chen DUNG GIAY, sai so <=0.3s.
- Ghi NGUYEN VAN loi noi. Khong chinh lai ngu phap. Khong rut gon.
- Neu nguoi noi lap tu, noi ngap ngung, sai chinh ta -> giu nguyen.
- "is_punchline": true cho cum tu la CAU CHOT / cu dam / tiet lo (cho dang le phai co tieng dong
  nhan NGAY SAU khi noi xong). Mac dinh false.
- GHI RO KHOANG IM LANG: text="", note="im lang" hoac "nhac nen" hoac "tieng on".
- Neu video KHONG CO loi noi -> transcript=[].

## Emotion Map
- Moi khoang TOI THIEU 2-5s. Khong gop ca video vao 1 emotion.
- evidence BAT BUOC: trich dan giong noi (cao/thap/run/nhanh/cham), net mat (cuoi/ngac nhien/cau gian), cu chi (vay tay/go ban/khom nguoi), ngu dieu (mia mai/chan thanh/buc xuc).
- Neu trong khoang do chi co nhac/khong loi -> ghi emotion la "neutral" va evidence la "khong loi noi, chi nhac nen".
- intensity: low = thoat qua, medium = ro rang, high = rat manh (khoc, het to, dap ban...)

## Key Moments
- CHI danh dau nhung khoanh khac THAT SU bat thuong (cam xuc dot bien, tiet lo bat ngo, im lang dang chu y, nguoi noi khoa tay...)
- KHONG de xuat dung lam gi voi khoanh khac do. Chi ghi nhan no LA GI.

## Nhieu video
- Phan tich DU tung video. Dung dung `id` da cap.
- Timestamp LUON la thoi gian cuc bo cua chinh file do, bat dau tu 0.

## CANH BAO
⚠️ TRA VE CHI JSON GOC. Khong ```json```. Khong giai thich. Ky tu dau tien la {, ky tu cuoi cung la }."""

_GEMINI_MERGE_PROMPT = """Ban la BIEN TAP VIEN GHEP PHAN TICH VIDEO. Video dai da duoc he thong CAT THANH NHIEU PHAN theo dung luong va Gemini da phan tich TUNG PHAN RIENG LE — phan sau khong biet phan truoc noi gi. Nhiem vu cua ban: doc ket qua cac phan (ban KHONG xem video) va viet lai phan tong quan cho LIEN MACH tren toan video.

# DAU VAO (JSON)
- videos[]: id, name, duration (giay),
  parts[]: range (mm:ss-mm:ss tren video goc) + summary + tone cua TUNG phan,
  key_moments[]: i (so thu tu), start/end (giay tren video goc), type, description.
- groups[]: tom tat / tone cua cac lan phan tich chung nhieu video nguyen (neu co).

# VIEC CAN LAM
1. `summary` cua TUNG video: 2-4 cau ke lien mach tu dau den cuoi video (KHONG liet ke theo phan, khong nhac chu "phan 1/2").
2. `summary` + `tone` chung cho CA BO video.
3. key_moments — xep hang lai tren TOAN video:
   - Moi phan co the tu danh dau "climax"/"hook" cho rieng no. Chi giu type do cho nhung khoanh khac THAT SU noi bat nhat tren toan video; cai con lai doi sang type dung hon ("emotional_peak", "other"...).
   - Khoanh khac chi co y nghia khi biet phan truoc (nhac lai, lat nguoc, tra loi cau hoi da dat ra) -> doi type thanh "twist"/"reveal" va ghi ro moi lien he trong description.
   - Hai muc trung nhau o cho giap 2 phan -> danh "drop": true cho muc thua.
   - KHONG doi start/end. KHONG them khoanh khac moi. Chi dung chi so i da cho.
4. CHI dua tren du lieu duoc cho. Khong bia them su kien, nhan vat, loi noi.

# TRA VE CHI JSON
{
  "summary": "tom tat ca bo video",
  "tone": "cam xuc chi phoi ca bo video",
  "sources": [
    {"id": "source_1", "summary": "tom tat lien mach cua video nay",
     "key_moments": [{"i": 0, "type": "hook|climax|twist|reveal|emotional_peak|silence|other", "description": "...", "drop": false}]}
  ]
}

⚠️ TRA VE CHI JSON GOC. Khong ```json```. Ky tu dau la {, ky tu cuoi la }."""

# ============================================================================
# PIPELINE LAP KE HOACH — PROMPT CAC BUOC CHUNG (B1 B2 B3 B6 B7)
# ============================================================================

_SELECT_SYSTEM = """Ban la EDITOR VIDEO chuyen chon chat lieu cho video noi chuyen (talking-head). Nhiem vu: GIU NGUYEN
KICH BAN NOI DUNG cua nguoi noi — chi LAM SACH (bo cho im lang, tieng dem, cau lap) — va ghi lai CAU CHUYEN do.

Ket qua cua ban (story_arc, tone, beat tung doan) duoc truyen cho TAT CA cac buoc sau:
dung timeline, chon hook, hieu ung, caption, meme, SFX. Viet cu the — cac buoc sau chi biet
cau chuyen qua nhung gi ban ghi o day.

# DU LIEU DAU VAO
- source_analysis.sources[]: summary, emotion_map, key_moments, va `transcript` = loi thoai
  theo giay (start/end/text; emphasis = tu duoc nhan; is_punchline = cau chot).
- reference_analysis (neu co): phong cach video mau — chi de hieu giong/nhip, KHONG dung de sap xep lai noi dung.
- edit_request: muc dich, phong cach, khan gia, do dai mong muon cua nguoi dung.

# ⛔ LUAT CUNG — KHONG DUOC VI PHAM
1. KHONG DAO THU TU. Trong MOT video, cac doan PHAI theo DUNG thu tu thoi gian: start tang dan,
   doan sau bat dau SAU khi doan truoc ket thuc. Nhieu video: het video dung truoc roi moi toi video
   sau, theo "thu_tu_video" (xem muc NHIEU VIDEO).
2. KHONG BO NOI DUNG. Moi cau mang y cua nguoi noi deu phai nam trong mot doan chon — ke ca cau mo
   dau, cau chuyen tiep, cau cta. Khong "chon doan hay nhat", khong rut gon kich ban.
3. CHI DUOC BO:
   - khoang im lang / ngap ngung giua cac cau;
   - cau/cum chi toan tieng dem, am u: "ờ", "à", "ơ", "ừm", "ừ", "thì...", "là...", "kiểu là..."
     dung mot minh khong mang y (tu "thì", "là" NAM TRONG cau co nghia thi giu nguyen);
   - cau NOI LAP (noi vap roi noi lai, noi hai lan cung mot y): giu LAN NOI TRON VEN NHAT (thuong la
     lan sau), bo lan hong;
   - DOAN NOI LAI sau cho quen thoai / ngap ngung ("ờ...", im lau, "từ từ", "tức là..."): nguoi noi
     liet ke / giai thich LAI cung y vua noi (vd lan 1 "đăng bài trên fanpage, đăng bài lên nhóm...",
     ngap ngung, lan 2 "đăng bài trên fanpage, trên nhóm, trên X") -> day la NOI LAP, chi giu MOT
     lan. Lan sau them / bot mot vai muc KHONG phai ly do giu ca hai: giu lan day du, troi chay hon
     (thuong la lan sau), bo phan lap cua lan kia tu dau cau lap; muc chi lan truoc co (vd
     "Facebook") ma nam o cau KHONG lap thi giu cau do. Tuyet doi khong de nguoi xem nghe cung mot
     danh sach / mot y hai lan lien nhau;
   - doan khong co loi (dang chinh may, noi ngoai le voi nguoi quay).
   Khi bo, tach thanh 2 doan o hai ben cho bi bo (doan truoc ket thuc o cuoi cau truoc, doan sau bat
   dau o dau cau sau).
4. edit_request.duration chi de THAM KHAO. Neu giu du noi dung ma van dai hon thi van giu — ghi
   do dai thuc te vao "notes". Tuyet doi khong bo cau noi dung de cho vua do dai.
5. HOOK KHONG PHAI VIEC CUA BUOC NAY. Buoc sau (B3) se SAO CHEP 3-5s dat nhat len dau video; ban
   than video van chay day du tu dau. Vi vay KHONG keo cau hay len dau, KHONG cat cau do khoi vi tri goc.

# NHIEU VIDEO (source_analysis.sources co tu 2 video)
Nguoi dung co the them video LON XON — source_1 chua chac la phan dau. Doc transcript + summary
cua TUNG video de biet chung la cac khuc NOI TIEP nhau cua cung mot bai noi:
- "thu_tu_video": sap cac video theo MACH NOI DUNG: video nao mo bai (chao, gioi thieu van de),
  video nao noi tiep y dang do cua video kia, video nao ket (tong ket, cta). Dau hieu: cau cuoi
  video A duoc noi tiep / noi lai o dau video B -> B di sau A. Khong ro rang thi giu thu tu dau vao.
  Ghi ly do vao "ly_do_thu_tu_video".
- TRUNG LAP GIUA 2 VIDEO: nguoi noi hay quay lai va NOI LAI phan cuoi cua video truoc o dau video
  sau (hoac noi lai ca mot y). Doan trung chi duoc giu MOT lan: giu lan noi TRON VEN, TROI CHAY hon
  (neu ngang nhau thi giu ban o video SAU vi do la lan quay lai), bo lan kia — cat o ranh gioi cau.
  Ghi vao "removed" voi ly_do "trung voi <source_id> <giay>".
- Trong moi video van giu dung thu tu thoi gian; chi THU TU GIUA CAC VIDEO la do ban quyet.
- Video chi la b-roll / quay man hinh khong co loi thi van dat theo cho no minh hoa.

# ⚠️ CAT THEO CAU, KHONG CAT THEO GIAY
- start = transcript[].start cua CAU DAU, end = transcript[].end cua CAU CUOI trong doan.
  Khong bao gio cat giua mot cau.
- Doc transcript de chac doan do NOI DUNG dieu ban ghi trong "purpose".
- Cau lien mach khong co cho bo thi GOP thanh mot doan dai (buoc sau tu chia jump-cut).

# NHIP TRUYEN ("beat") — gan cho MOI doan, mo ta vai tro cua doan do TRONG KICH BAN GOC:
  hook | setup | body | proof | twist | payoff | cta
  (beat chi la NHAN; thu tu van la thu tu goc. Doan mo dau cua nguoi noi gan "hook" hoac "setup".)
- story_arc: tom tat mach truyen CUA CHINH NGUOI NOI theo dung thu tu ho noi.
- Dung emotion_map / key_moments / is_punchline de ghi purpose + emotion_contrast cho dung (cac buoc
  sau dung de dat chu to, hieu ung, SFX) — KHONG dung de chon/bo doan.

# SCHEMA DAU RA (CHI JSON)

{
  "thu_tu_video": ["source_2", "source_1"],
  "ly_do_thu_tu_video": "source_2 mo bai chao hoi; cau cuoi source_2 duoc noi lai o dau source_1",
  "story_arc": "mach truyen cua nguoi noi (1-2 cau, tieng Viet): mo bang gi -> dan dat -> cao trao -> chot",
  "tone": "giong dieu tong the, vd: hai huoc tu trao / nghiem tuc chia se / hao hung khoe thanh qua",
  "total_selected_duration": <tong giay>,
  "selections": [
    {
      "source_id": "source_1",
      "start": 3.0, "end": 8.5,
      "beat": "setup",
      "purpose": "gioi thieu van de: dung tool tren trinh duyet de bi khoa nick",
      "emotion_contrast": "binh thuong → lo ngai"
    }
  ],
  "removed": [
    {"source_id": "source_1", "start": 8.5, "end": 9.4, "ly_do": "im lang | tieng dem | noi lap | ngoai le | trung voi source_2 41.0"}
  ],
  "notes": "ghi chu (vd: do dai thuc te so voi duration mong muon)"
}

⚠️ TRA VE CHI JSON GOC. Khong ```json```. Khong giai thich truoc/sau. Ky tu dau la {, ky tu cuoi la }."""

_TIMELINE_SYSTEM = """Ban la EDITOR chuyen dung timeline video. Tu danh sach doan da chon + source_videos, noi thanh timeline lien tuc.

# DU LIEU DAU VAO
- cau_chuyen: story_arc, tone, nhip_truyen (beat + purpose tung doan) do buoc B1 quyet.
- selections[]: doan da chon, DA THEO DUNG THU TU (trong moi video theo gio; giua cac video theo
  cau_chuyen.thu_tu_video do B1 xep theo noi dung) + `loi_thoai` = cac cau NAM TRONG
  doan do, co start/end theo gio NGUON.
- phong_cach_mau (neu co): nhip cat cua video mau (pacing.average_shot_seconds, cut_density,
  pause_handling, shot_system...) — hoc NGUYEN TAC nhip, khong chep noi dung.
- duration_target: do dai mong muon — CHI THAM KHAO.

# ⛔ LUAT CUNG
- KHONG DAO THU TU. Segments di theo DUNG thu tu selections: trong moi video start tang dan (khong
  quay lui), het video nay moi toi video sau theo thu_tu_video. Khong co ngoai le.
- KHONG BO CAU NOI DUNG. Moi cau trong loi_thoai phai con tren timeline. Chi duoc bo: khoang lang,
  cau/cum chi toan tieng dem ("ờ", "à", "ơ", "ừm", "thì...", "là..." dung mot minh), cau noi lap (giu lan tron ven)
  — ke ca DOAN NOI LAI sau cho ngap ngung (liet ke / giai thich lai cung y): chi giu mot lan.
  Dau / cuoi segment khong duoc chua khoang lang dai hay tieng "ờ" keo dai: bat dau ngay truoc chu dau, het ngay sau chu cuoi.
  Ghi moi cau da bo vao "note".
- Khong lap tieng: hai segment khong duoc chong gio nguon len nhau.
- KHONG tu dat hook len dau — hook la BAN SAO do engine chen o buoc sau; timeline nay la THAN video day du.

# QUY TAC
- target_start lien tuc, KHONG chong cheo, KHONG de khoang trong vo ly.
- Diem cat (start/end moi segment) PHAI trung RANH GIOI CAU trong loi_thoai: start = start cua
  mot cau, end = end cua mot cau. Khong cat giua cau/giua tu.
- Talking-head: chia doan dai thanh cac segment ~3-5s tai ranh gioi cau/cum tu (jump-cut).
  "scale" (1.0-1.3) = muc zoom khung cua doan; engine CHUYEN DONG MUOT tu muc doan truoc sang muc doan nay
  (zoom in / zoom out ease in-out), khong nhay khung o diem cat -> chi doi scale khi muon zoom nhan / nhip moi,
  khong xen ke may moc moi lan cat. Neu phong_cach_mau co average_shot_seconds thi bam theo do.
- Khoang lang dai giua hai cau trong cung doan: cat bo bang cach tach thanh 2 segment
  (tru khi phong_cach_mau.pacing.pause_handling noi mau GIU khoang nghi).
- B-roll/screen-recording: giu nguyen scale 1.0.
- Dat transition it ma DUNG (chi o diem chuyen canh quan trong). Mac dinh la null.
- start/end la timestamp CUC BO trong source. target_start la tren timeline.
- duration la tong thoi gian timeline ket qua.
- MOI segment ghi lai "selection_index", "beat", "purpose" cua doan chon ma no cat ra
  (cac buoc sau dung beat de biet segment nao la hook/payoff/cta).

# SCHEMA DAU RA (CHI JSON)

{
  "segments": [
    {"source_id": "s1", "start": 3.0, "end": 8.5, "target_start": 0.0,
     "scale": 1.05, "transition": null,
     "selection_index": 0, "beat": "setup", "purpose": "gioi thieu van de"}
  ],
  "duration": 58.0,
  "note": "cac cho da bo (im lang / tieng dem / noi lap) neu co"
}

⚠️ TRA VE CHI JSON GOC."""

_AUDIO_SYSTEM = """Ban la SOUND DESIGNER chuyen chon SFX cho video short-form. Chon SFX va dat vao DUNG GIAY.

Ban la buoc CUOI: hinh, chu, meme, hook da duoc dat xong. SFX la DAU CHAM CAU cho chung —
phai an khop voi nhung gi DA CO, khong duoc tu dat mot nhip rieng.

# NGU CANH TU CAC BUOC TRUOC
- cau_chuyen: story_arc + tone. Tone nghiem tuc -> it SFX, tieng nhe; tone hai -> manh tay hon.
- timeline_map[].beat / purpose: SFX manh nhat danh cho beat hook / twist / payoff.
- da_co_tren_timeline.transitions: diem chuyen canh (gio timeline) -> hop cho whoosh ("start" = timeline_tu).
- da_co_tren_timeline.chu_hero: MOI chu hero (chu noi bat, khong phai phu de) PHAI co 1 SFX dat DUNG luc chu
  hien (src_time = src_start, "purpose": "reveal"), tru muc ghi "DA CO SFX ... tu dong". Chon tieng theo noi
  dung + cam xuc cua chu do (con so -> ding / cash; tu soc -> boom / impact; hai -> tieng hai; cam dong -> tieng nhe).
- da_co_tren_timeline.meme: meme CAT vao tai src_time, dai duration, co tieng rieng.
  KHONG dat SFX nam trong khoang meme; toi da 1 whoosh ngay diem cat.
- hook (neu co): ban sao o DAU video. Mot tieng impact luc mo dau hook rat hieu qua:
  {"sfx_id": "...", "source_id": hook.source_id, "src_time": hook.src_start, "anchor": "hook", "purpose": "punch"}.
- phong_cach_mau.audio (neu co): mat do va loai SFX cua video mau (sfx_pattern) — bam theo tan suat do.

# ⚠️ DAT DUNG GIAY — day la cho hay sai nhat
1. SFX nhan CAU CHOT phai roi vao luc cau do NOI XONG, KHONG phai luc bat dau.
   Dung:  "...lay cai gi cam ket" [BOOM]
   Sai:   [BOOM] "lay cai gi cam ket"   <- spoil cu dam, khan gia nghe hieu ung truoc khi hieu
   => lay transcript[].end_cuc_bo cua cau do (hoac key_moment.end), KHONG lay .start
2. Co HAI he quy chieu thoi gian. transcript/key_moments dung gio TRONG FILE NGUON;
   timeline ket qua da cat bo khoang lang/tieng dem (va co hook sao chep o dau) nen gio KHAC HAN.
   => Neo theo loi noi thi khai gio NGUON, engine tu quy doi:
      {"sfx_id": "...", "source_id": "source_1", "src_time": 15.0, "volume": 0.8}
   => Chi SFX chuyen canh (whoosh) moi dung "start" = segments[].target_start cua diem cat.

# QUY TAC
- CHI dung SFX co trong sfx_catalog ben duoi. Dung DUNG sfx_id.
- Moi chu hien ra deu co tieng (xem chu_hero). Ngoai tieng cho chu: dat them SFX o DIEM NHAN that su (hook,
  climax, twist, reveal, diem cat quan trong) — khong rai deu cho co.
- SFX reveal roi vao luc vat the/con so XUAT HIEN, thuong la cuoi cau gioi thieu no.
- DOI CHIEU emotion: emotion cua key_moment ~ emotion cua SFX. Doc "use_when" de dat dung cho.
- KHONG chong 2 SFX sat nhau (<0.4s). KHONG rai SFX khap noi (roi tai).
- KHONG dat "file". Chi dat "sfx_id".
- ⚠️ KHONG TU DAT "volume". Ban khong nghe duoc file. Engine da DO do to that cua tung file
  (momentary LUFS) va tu can: tieng dam duoc to hon tieng "ding"; roi dung luc dang noi thi lui
  xuong ~25% de khong dam vao giong; hai tieng sat nhau thi cai sau nho hon; cung mot tieng lap
  lai thi nho dan. Viec cua ban la chon DUNG TIENG va DUNG GIAY.
- Thay vi volume, hay khai "purpose" de engine biet no dong vai gi:
    punch (dam/chot ha) | transition (chuyen canh) | reveal (lo ra con so/vat the)
    comedy (gay cuoi) | ambience (nen/khong khi) | ui (ding/pop/thong bao)
- Neu sfx_catalog RONG -> tra ve audio=[].

# SCHEMA DAU RA (CHI JSON)

{
  "audio": [
    {"sfx_id": "whoosh_01", "start": 6.3, "purpose": "transition",
     "why": "diem cat sang canh moi (gio timeline)"},
    {"sfx_id": "vine_boom", "source_id": "source_1", "src_time": 15.0, "purpose": "punch",
     "why": "ngay sau khi noi xong 'lay cai gi cam ket' (gio nguon)"}
  ]
}

⚠️ TRA VE CHI JSON GOC."""

_INSERT_SYSTEM = """Ban la EDITOR chuyen chen MEME (b-roll) vao video short-form.

Meme chen dung cho lam video "co duyen"; chen sai cho lam video re tien. No la GIA VI.

# NGU CANH TU CAC BUOC TRUOC
- cau_chuyen.tone: tone nghiem tuc / cam dong -> it hoac KHONG chen meme hai. Meme phai hop giong video.
- timeline_map[].beat / purpose: meme hop nhat o beat twist / proof / payoff (phan ung sau cau chot);
  tranh chen o setup dang dan dat va o cta.
- transcript / emotion_map / key_moments chi con nhung cau CO TREN timeline — chi neo vao cau o day.
- hook (neu co): KHONG cat meme ngay trong khoang hook (src_start..src_end) — do la cau dat nhat.
- chu_hero: chu chinh dang hien (gio nguon). Meme CAT ngang video chinh -> chu dang hien bi mat.
  Dat meme SAU khi hero het (src_time >= src_end cua hero do), khong dat giua.
- phong_cach_mau (neu co): video mau dung b-roll nhieu/it the nao (shot_system.broll_usage) — bam tan suat do.

# ⚠️ CACH CHEN: MAC DINH LA CAT, KHONG PHAI DE LEN
- "cutaway" (mac dinh): engine CAT doi video chinh tai giay ban chon, cho meme chay het,
  roi NOI TIEP video chinh tu dung cho vua cat. Khong mat chu nao cua loi noi.
- "overlay": meme de len tren, video chinh van chay ben duoi. CHI dung khi cho do IM LANG
  (khoang nghi giua hai cau, doan chi co hinh). De len dung luc dang noi = nuot mat cau noi,
  nguoi xem vua khong nghe duoc vua khong kip hieu meme. Day la loi that da gap.
- Khong chac -> de "cutaway".

# ⚠️ CACH CHON MEME
- Doc "use_when" cua tung meme: no mo ta TINH HUONG TRONG LOI NOI, KHONG mo ta hinh anh.
  Vi du use_when="Khi nguoi noi tiet lo mot con so gay soc" -> tim trong transcript cau nao
  dang tiet lo con so, chen vao do.
- Doi chieu ca "emotion" cua meme voi emotion cua doan do. Meme "wow" cam vao doan ke chuyen
  buon la phan tac dung.
- Meme gan nhan chi tiet con co them (khong phai meme nao cung co):
  "reaction" = phan ung nguoi xem se hieu khi thay meme; "semantic_triggers" = cac y nghia
  de khop voi transcript; "role"/"intensity" = chuc nang va do manh; "insert_timing" = nen
  chen truoc/trong/sau y nao. "avoid_when" = tinh huong DE NHAM: cau noi roi vao do thi
  KHONG chen meme nay du use_when co ve hop.
- Neu KHONG co meme nao that su hop -> tra ve inserts=[]. THA KHONG CHEN con hon chen sai.

# ⚠️ CACH DAT (day la cho hay sai nhat)
- Dat NGAY SAU cum tu lien quan noi xong, khong dat truoc (chen truoc = spoil, giong SFX).
- Diem cat phai o CHO NGAT CAU: lay transcript[].end cua cau do lam src_time. Cat giua chung
  mot tu thi nguoi xem tuong video bi loi.
- Neo theo gio NGUON, engine tu quy doi sang timeline:
  {"meme_id": "...", "source_id": "source_1", "src_time": <giay trong FILE GOC>}
- duration 1.0-2.5s. 2 meme cach nhau >= 1.5s. Toi da 3 meme.
- KHONG dat "mode"/"scale"/"volume": engine tu tinh theo ti le clip (clip doc -> full man hinh
  doc; clip ngang -> full be ngang, phan thua lap bang nen mo) va tu mo tieng cho doan cat.
- "why" BAT BUOC: mot cau noi ro meme minh hoa dieu gi trong loi noi o dung giay do.

# SCHEMA DAU RA (CHI JSON)

{
  "inserts": [
    {"meme_id": "wow-49dc5e", "source_id": "source_1", "src_time": 21.5,
     "placement": "cutaway", "duration": 1.6,
     "why": "ngay sau cau 'tui su dung hai chai roi' — khoanh khac tiet lo bang chung"}
  ]
}

⚠️ TRA VE CHI JSON GOC."""


_HOOK_SYSTEM = """Ban la EDITOR short-form. Nhiem vu DUY NHAT: chon MOT doan 3-5 giay DAT NHAT
trong ca video de dat len DAU video lam HOOK.

Nguoi xem quyet dinh o lai hay luot trong ~3 giay. Neu cau hay nhat nam o giay 40 thi khong ai
song toi do de nghe. Engine se: dat doan nay len dau -> transition -> roi cho video chay tu dau
nhu binh thuong (doan hook se duoc xem lai lan nua o dung mach cua no — do la binh thuong va
dung y do).
Hook la BAN SAO: doan do VAN NAM NGUYEN o vi tri goc trong than video, than video khong bi cat
hay dao thu tu vi hook.

# DU LIEU DAU VAO
- cau_chuyen: story_arc + tone + nhip_truyen. Hook phai HE LO LOI HUA cua dung cau chuyen nay
  (khong phai mot cau hay nhung lac de). Doan co beat "hook" la ung vien dau tien, nhung
  khong bat buoc.
- timeline_map + transcript/emotion_map/key_moments: CHI gom nhung gi CON tren timeline.
  Hook phai nam trong mot segment cua timeline_map (cung source_id, trong nguon_tu..nguon_den).
- phong_cach_mau (neu co): video mau mo dau the nao (structure: doan role=hook, attention_system).
  Hoc cach mo, khong chep noi dung.
- Ket qua cua ban duoc cac buoc sau dung: hieu ung, caption, meme, SFX deu biet dau video la gi.

# TIEU CHI CHON (theo thu tu uu tien)
1. DUNG MOT MINH VAN HIEU. Nguoi xem chua biet gi ca. Cau dang giua mach giai thich, cau co
   "no", "cai do", "nhu vay" ma khong ro chi gi -> VUT.
2. Gay TO MO hoac SOC: con so bat ngo, tuyen bo nguoc dong ("ban dang lam sai het"), xung dot,
   cau hoi trung tim, twist, pattern-interrupt ("khoan da...").
3. Co GIONG NOI + cam xuc manh (emotion intensity=high, is_punchline, key_moment hook/climax/twist).
4. TRON VEN mot cau: bat dau o dau cau, ket thuc khi noi het y. Khong cat giua tu.
5. Do dai 3-5s (toi da 6). Dai hon la het "moi" truoc khi vao video.
6. Neu doan hay nhat CHINH LA dau video (trong ~3s dau cua segment dau tien) -> tra ve
   hook=null. Chieu hai lan lien tiep cung mot cau la vo duyen.
7. Neu gia tri video nam o cu lat CUOI: lay doan DAN TOI cu lat, dung lay cau tra loi.
   Spoil dap an = mat ly do xem tiep.

# TRANSITION HOOK -> THAN VIDEO
Neu co `transition_goi_y`: dat "transition" = id cua mot muc trong do (hop cam giac mo dau). Khong co
danh sach thi bo trong "transition" — engine tu dung White_Flash. KHONG tu bia ten transition.

# CAPTION CHO HOOK
Kem MOT caption "hero" ngan (<= 15 ky tu/dong) tom y cau hook. Day la chu dau tien nguoi xem
doc — no phai dung mot minh duoc.

# SCHEMA DAU RA (CHI JSON)

{
  "hook": {
    "source_id": "source_1", "src_start": 41.2, "src_end": 44.6,
    "transition": "White_Flash",
    "reason": "cau soc nhat ca video: 'toi mat 3 ty trong mot dem' — dung mot minh van hieu",
    "caption": "MẤT 3 TỶ"
  }
}

Khong tim duoc doan nao du tieu chuan -> {"hook": null, "reason": "..."}.
⚠️ TRA VE CHI JSON GOC."""


def gpt_hook(segments, transcript_data, emotion_map_data, key_moments_data, story=None,
             reference_analysis=None, log=None, transition_goi_y=None):
    """B3: Chon doan hook 3-5s dat len dau video. Tra {"hook": {...}} hoac {"hook": None}.

    Chay NGAY SAU timeline (truoc cac buoc trang tri) vi hook la quyet dinh CAU TRUC: hieu
    ung, caption, meme, SFX deu can biet dau video la gi. Chi cho chon trong nhung gi CON
    tren timeline (hook la ban sao cua mot doan co that trong video)."""
    payload = {
        "cau_chuyen": story or {},
        "timeline_map": _ban_do_timeline(segments),
        "transcript": _loc_theo_timeline(transcript_data, segments),
        "emotion_map": _loc_theo_timeline(emotion_map_data, segments),
        "key_moments": _loc_theo_timeline(key_moments_data, segments),
    }
    ref = phong_cach_cho_buoc(reference_analysis, "hook")
    if ref:
        payload["phong_cach_mau"] = ref
    # Danh sach chuyen canh hop hook trong danh muc Remotion (remotion_plan.transition_goi_y_hook)
    if transition_goi_y:
        payload["transition_goi_y"] = transition_goi_y
    user = json.dumps(payload, ensure_ascii=False)
    if log:
        log("B3/7: %s chon doan hook 3-5s dat len dau..." % plan_ai_name())
    import hook_rule
    text = plan_chat([
        {"role": "system", "content": _p("_HOOK_SYSTEM") + hook_rule.luat("B3") + creative.luat("B3")},
        {"role": "user", "content": user},
    ], json_mode=True, max_tokens=2000, temperature=0.5, req_timeout=90,
        max_attempts=2, step_label="B3-hook")
    return _safe_json(text)


def gpt_inserts(segments, transcript_data, emotion_map_data, key_moments_data,
                meme_catalog, story=None, reference_analysis=None, hook=None, captions=None, log=None):
    """B6: Chon meme chen. Tra {"inserts": [...]}.

    Nhan ca timeline_map lan transcript vi meme phai bam vao LOI NOI — giong SFX,
    day la cho cuc de sai neu chi dua gio nguon ma khong dua anh xa timeline.
    Them: cau chuyen + tone (meme hop giong video), hook (B3) va chu hero (B5) — meme CAT
    ngang video chinh nen cat trung luc chu hero dang hien la lam mat thong tin chinh.
    """
    if not meme_catalog:
        if log:
            log("B6/7: Kho meme rong -> bo qua.")
        return {"inserts": []}
    sys_prompt = _p("_INSERT_SYSTEM") + creative.luat("B6") + """

# KHO MEME (chi dung meme_id trong nay):
""" + json.dumps(meme_catalog, ensure_ascii=False)
    payload = {
        "cau_chuyen": story or {},
        "hook": hook,
        "timeline_map": _ban_do_timeline(segments),
        "transcript": _loc_theo_timeline(transcript_data, segments),
        "emotion_map": _loc_theo_timeline(emotion_map_data, segments),
        "key_moments": _loc_theo_timeline(key_moments_data, segments),
    }
    heroes = [{k: c.get(k) for k in ("text", "source_id", "src_start", "src_end") if c.get(k) is not None}
              for c in captions or [] if isinstance(c, dict) and c.get("role") == "hero"]
    if heroes:
        payload["chu_hero"] = heroes
    ref = phong_cach_cho_buoc(reference_analysis, "inserts")
    if ref:
        payload["phong_cach_mau"] = ref
    user = json.dumps(payload, ensure_ascii=False)
    if log:
        log("B6/7: %s chon meme chen tu %d clip..." % (plan_ai_name(), len(meme_catalog)))
    text = plan_chat([
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user},
    ], json_mode=True, max_tokens=6000, temperature=0.5, req_timeout=90,
        max_attempts=2, step_label="B6-inserts")
    return _safe_json(text)


# ============================================================================
# PIPELINE LAP KE HOACH — NGU CANH DUNG CHUNG GIUA CAC BUOC
# ============================================================================
# Thu tu chay (xem server.remotion_autoplan_route): B1 chon chat lieu -> B2 timeline ->
# B3 hook -> R4 thiet ke (motion_design) -> R5 phu de (remotion_plan) -> B6 meme -> B7 SFX.
#   - B1 quyet dinh CAU CHUYEN (story_arc + nhip tung doan). Moi buoc sau deu nhan lai no,
#     neu khong moi buoc tu doan mot cau chuyen rieng -> caption/SFX/meme lech y nhau.
#   - B2 dung timeline = "xuong song" cho cac buoc sau (gio timeline + gio nguon).
#   - B3 hook la quyet dinh CAU TRUC (ban sao dat len dau) nen chay truoc cac buoc trang tri.
#   - B7 SFX chay CUOI vi SFX la "dau cham cau" cho moi thu da co: chuyen canh + lop do hoa (R4),
#     chu hero (R5), meme (B6), hook (B3).
# Moi buoc chi nhan phan du lieu NO CAN (khong dua ca transcript cua doan bi cat bo:
# vua ton token vua du model neo vao cau khong con tren timeline).

def _f(v, dflt=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return dflt


def _overlap(a_st, a_en, b_st, b_en):
    return a_st < b_en and a_en > b_st


def _gon_loi_thoai(items, st=None, en=None):
    """Transcript gon: start/end/text (+ emphasis/is_punchline neu co). Loc theo [st,en]."""
    out = []
    for t in items or []:
        if not isinstance(t, dict) or not (t.get("text") or "").strip():
            continue
        a, b = _f(t.get("start"), None), _f(t.get("end"), None)
        if a is None or b is None:
            continue
        if st is not None and not _overlap(a, b, st, en):
            continue
        row = {"start": round(a, 2), "end": round(b, 2), "text": t.get("text", "")}
        if t.get("emphasis"):
            row["emphasis"] = t["emphasis"]
        if t.get("is_punchline"):
            row["is_punchline"] = True
        out.append(row)
    return out


def _loc_theo_timeline(data_by_source, segments):
    """{source_id: [muc co start/end]} -> chi giu muc NAM TRONG mot segment cua timeline."""
    ranges = {}
    for s in segments or []:
        ranges.setdefault(s.get("source_id", ""), []).append((_f(s.get("start")), _f(s.get("end"))))
    out = {}
    for sid, items in (data_by_source or {}).items():
        keep = [it for it in items or [] if isinstance(it, dict) and any(
            _overlap(_f(it.get("start")), _f(it.get("end")), a, b) for a, b in ranges.get(sid, []))]
        if keep:
            out[sid] = keep
    return out


def ngu_canh_cau_chuyen(selection, edit_request=None):
    """Nhung gi B1 da quyet ve CAU CHUYEN — truyen xuong B2..B7."""
    sel = selection if isinstance(selection, dict) else {}
    nhip = []
    for i, s in enumerate(sel.get("selections") or []):
        if not isinstance(s, dict):
            continue
        row = {"selection_index": i}
        row.update({k: s.get(k) for k in ("source_id", "start", "end", "beat", "purpose", "emotion_contrast")
                    if s.get(k) not in (None, "")})
        nhip.append(row)
    ctx = {
        "story_arc": sel.get("story_arc", ""),
        "tone": sel.get("tone", ""),
        "thu_tu_video": sel.get("thu_tu_video") if len(sel.get("thu_tu_video") or []) > 1 else None,
        "notes": sel.get("notes", ""),
        "nhip_truyen": nhip,
        "edit_request": edit_request or {},
    }
    return {k: v for k, v in ctx.items() if v not in ("", [], {}, None)}


# Phan nao cua phan tich VIDEO MAU co ich cho buoc nao. Truong khong co (ban prompt cu) thi bo qua.
_REF_CHO_BUOC = {
    "timeline": ("summary", "format", "style_fingerprint", "pacing", "structure", "shot_system",
                 "transfer_rules", "style_patterns"),
    "hook": ("format", "style_fingerprint", "structure", "attention_system"),
    "effects": ("style_fingerprint", "pacing", "editing_language", "motion_graphics", "visual_identity",
                "attention_system", "transfer_rules", "style_patterns"),
    "captions": ("style_fingerprint", "captions"),
    "inserts": ("style_fingerprint", "pacing", "shot_system", "attention_system"),
    "audio": ("style_fingerprint", "pacing", "audio", "attention_system", "style_patterns"),
}


def phong_cach_cho_buoc(reference_analysis, buoc):
    """Rut phan video mau lien quan toi 1 buoc. None neu khong co video mau."""
    if not isinstance(reference_analysis, dict) or not reference_analysis:
        return None
    out = {k: reference_analysis[k] for k in _REF_CHO_BUOC.get(buoc, ())
           if reference_analysis.get(k) not in (None, "", [], {})}
    return out or None


def thong_tin_hook(hook_res):
    """Ket qua B3 (hook) -> mo ta gon cho cac buoc sau. None neu khong dung hook."""
    h = (hook_res or {}).get("hook") if isinstance(hook_res, dict) else None
    if not isinstance(h, dict) or h.get("src_start") is None:
        return None
    st, en = _f(h.get("src_start")), _f(h.get("src_end"), _f(h.get("src_start")) + 4.0)
    return {
        "source_id": h.get("source_id"), "src_start": round(st, 2), "src_end": round(en, 2),
        "do_dai": round(max(0.0, en - st), 2), "caption": h.get("caption"),
        "transition": h.get("transition"), "reason": h.get("reason"),
        **({"y_tuong_gay_chu_y": h["attention"]} if isinstance(h.get("attention"), dict) else {}),
        "cach_engine_dat": (
            "Engine dat BAN SAO doan nay len DAU video (timeline 0 -> do_dai), transition, roi moi toi "
            "than video. Gio timeline trong timeline_map/segments la gio THAN VIDEO (chua tinh hook) — "
            "engine tu dich. Hook da co caption hero rieng (truong caption). Muon dat caption/SFX/effect "
            "vao BAN SAO o dau video thi khai source_id + src_* nam trong khoang hook va \"anchor\": \"hook\"."),
    }


def _nhip_cua_segment(seg):
    return {k: seg[k] for k in ("beat", "purpose") if seg.get(k)}


def _ban_do_timeline(segments, emotion_map_data=None, key_moments_data=None, transcript_data=None):
    """Bang anh xa gio NGUON <-> gio TIMELINE cho tung segment, kem nhip truyen (beat/purpose)
    va (tuy chon) cam xuc / khoanh khac / loi thoai NAM TRONG segment do."""
    rows = []
    for i, seg in enumerate(segments or []):
        sid = seg.get("source_id", "")
        st, en = _f(seg.get("start")), _f(seg.get("end"))
        ts = _f(seg.get("target_start"))
        sp = _f(seg.get("speed"), 1.0) or 1.0
        row = {"segment_index": i, "source_id": sid, "nguon_tu": st, "nguon_den": en,
               "timeline_tu": ts, "timeline_den": round(ts + (en - st) / sp, 3)}
        row.update(_nhip_cua_segment(seg))
        if emotion_map_data is not None:
            row["emotions"] = [{"emotion": e.get("emotion"), "intensity": e.get("intensity"),
                                "evidence": e.get("evidence", "")}
                               for e in emotion_map_data.get(sid, []) or []
                               if _overlap(_f(e.get("start")), _f(e.get("end")), st, en)]
        if key_moments_data is not None:
            row["key_moments"] = [k for k in key_moments_data.get(sid, []) or []
                                  if _overlap(_f(k.get("start")), _f(k.get("end")), st, en)]
        if transcript_data is not None:
            row["loi_thoai"] = _gon_loi_thoai(transcript_data.get(sid), st, en)
        rows.append(row)
    return rows


def gan_nhip_segment(segments, selections):
    """Moi segment cua B2 mang theo beat/purpose cua doan B1 ma no cat ra.
    B2 duoc dan tu ghi; thieu thi code tu gan theo doan chon trung nhieu nhat (deterministic)."""
    sels = [s for s in selections or [] if isinstance(s, dict)]
    for seg in segments or []:
        if seg.get("beat") and seg.get("purpose"):
            continue
        st, en = _f(seg.get("start")), _f(seg.get("end"))
        best, best_ov = None, 0.0
        for s in sels:
            if s.get("source_id") and s.get("source_id") != seg.get("source_id"):
                continue
            ov = min(en, _f(s.get("end"))) - max(st, _f(s.get("start")))
            if ov > best_ov:
                best, best_ov = s, ov
        if best:
            for k in ("beat", "purpose"):
                if not seg.get(k) and best.get(k):
                    seg[k] = best[k]
    return segments


def giu_thu_tu_nguon(items, source_ids=None, changes=None, noi_lien=False, min_len=0.3):
    """LUAT CUNG (user 2026-09-27): noi dung video KHONG duoc dao thu tu — chi duoc cat bo.

    Xep lai `items` (selections B1 / segments B2, co source_id/start/end) theo dung thu tu nguon:
    source theo `source_ids`, trong moi source theo start. Doan chong gio nguon voi doan truoc
    (noi lai cung mot cau) -> cat phan chong, trung han thi bo. noi_lien=True: dat lai
    target_start lien tuc theo thu tu moi. Hook KHONG nam o day (ban sao, engine chen sau)."""
    thu_tu = {sid: i for i, sid in enumerate(source_ids or [])}
    rows = [it for it in items or [] if isinstance(it, dict)]
    goc = [(it.get("source_id"), _f(it.get("start"))) for it in rows]
    rows.sort(key=lambda it: (thu_tu.get(it.get("source_id"), len(thu_tu)), _f(it.get("start")), _f(it.get("end"))))
    if changes is not None and [(it.get("source_id"), _f(it.get("start"))) for it in rows] != goc:
        changes.append("thu tu: AI xep lech thu tu goc -> xep lai theo gio nguon")
    out = []
    for it in rows:
        truoc = out[-1] if out else None
        st, en = _f(it.get("start")), _f(it.get("end"))
        if truoc is not None and truoc.get("source_id") == it.get("source_id") and st < _f(truoc.get("end")) - 0.01:
            if en - _f(truoc.get("end")) < min_len:
                if changes is not None:
                    changes.append("thu tu: bo doan %s %.2f-%.2f (lap lai noi dung doan truoc)"
                                   % (it.get("source_id"), st, en))
                continue
            if changes is not None:
                changes.append("thu tu: doan %s %.2f-%.2f chong doan truoc -> bat dau tu %.2f"
                               % (it.get("source_id"), st, en, _f(truoc.get("end"))))
            it["start"] = truoc.get("end")
        out.append(it)
    if noi_lien:
        cursor = 0.0
        for it in out:
            it["target_start"] = round(cursor, 3)
            sp = _f(it.get("speed"), 1.0) or 1.0
            cursor += (_f(it.get("end")) - _f(it.get("start"))) / sp
    return out


def cau_bi_bo(transcript_data, items):
    """Cau loi thoai KHONG nam trong doan nao (de ghi vao nhat ky cho user soat: chi nen la
    tieng dem / cau lap). Cau chi chom mep < 50% van tinh la con."""
    ranges = {}
    for it in items or []:
        if isinstance(it, dict):
            ranges.setdefault(it.get("source_id"), []).append((_f(it.get("start")), _f(it.get("end"))))
    out = []
    for sid, rows in (transcript_data or {}).items():
        for t in _gon_loi_thoai(rows):
            dai = max(0.01, t["end"] - t["start"])
            phu = sum(max(0.0, min(t["end"], b) - max(t["start"], a)) for a, b in ranges.get(sid, []))
            if phu / dai < 0.5:
                out.append({"source_id": sid, "start": t["start"], "end": t["end"], "text": t["text"]})
    return out


def thu_tu_video(selection, source_ids, changes=None):
    """Thu tu GIUA cac video: B1 xep theo NOI DUNG (user hay them video lon xon). Chi nhan khi la
    hoan vi hop le cua cac source that; video B1 quen ghi thi noi vao sau theo thu tu dau vao."""
    goc = [sid for sid in source_ids or [] if sid]
    ai = (selection or {}).get("thu_tu_video") if isinstance(selection, dict) else None
    if len(goc) < 2 or not isinstance(ai, list):
        return goc
    out = []
    for sid in ai:
        if sid in goc and sid not in out:
            out.append(sid)
    if not out:
        return goc
    out += [sid for sid in goc if sid not in out]
    if out != goc and changes is not None:
        changes.append("thu tu video theo noi dung: %s (dau vao: %s)%s" % (
            " -> ".join(out), " -> ".join(goc),
            " — " + str(selection.get("ly_do_thu_tu_video"))[:200] if selection.get("ly_do_thu_tu_video") else ""))
    return out


def _chu_cau(text):
    import unicodedata
    t = unicodedata.normalize("NFC", (text or "").lower())
    return re.findall(r"\w+", t)


def bo_trung_giua_video(selections, transcript_data, order, changes=None,
                        so_cau=6, nguong=0.75, it_tu=4, tong_tu=8):
    """Luoi an toan cho NHIEU VIDEO: cuoi video A va dau video B (B ngay sau A theo `order`) noi
    CUNG mot doan (nguoi noi quay lai, noi lai) ma B1 van giu ca hai -> bo ban o CUOI A, giu ban
    o dau B (lan quay lai). So bang loi thoai: cau >= it_tu tu, giong >= nguong, tong >= tong_tu tu
    (tranh bat nham cau xa giao ngan). Chi cat o ranh gioi cau. Tra selections moi."""
    import difflib
    sels = [s for s in selections or [] if isinstance(s, dict)]

    def giu(sid):
        # cau CON tren timeline cua video sid (phu >= 50%), theo gio
        rng = [(_f(s.get("start")), _f(s.get("end"))) for s in sels if s.get("source_id") == sid]
        out = []
        for t in _gon_loi_thoai((transcript_data or {}).get(sid)):
            dai = max(0.01, t["end"] - t["start"])
            if sum(max(0.0, min(t["end"], b) - max(t["start"], a)) for a, b in rng) / dai >= 0.5:
                out.append(t)
        return out

    for a_id, b_id in zip(order or [], (order or [])[1:]):
        a_cau, b_cau = giu(a_id)[-so_cau:], giu(b_id)[:so_cau]
        khop, tu = [], 0
        for ta in a_cau:
            wa = _chu_cau(ta["text"])
            if len(wa) < it_tu:
                continue
            for tb in b_cau:
                wb = _chu_cau(tb["text"])
                if len(wb) >= it_tu and difflib.SequenceMatcher(None, wa, wb).ratio() >= nguong:
                    khop.append(ta)
                    tu += len(wa)
                    break
        if not khop or tu < tong_tu:
            continue
        cat = min(t["start"] for t in khop)
        het_truoc = max([t["end"] for t in giu(a_id) if t["end"] <= cat + 0.01] or [None], key=lambda x: x or 0)
        moi = []
        for s in sels:
            if s.get("source_id") != a_id or _f(s.get("end")) <= cat:
                moi.append(s)
            elif _f(s.get("start")) < cat and het_truoc is not None and het_truoc - _f(s.get("start")) >= 0.3:
                s["end"] = round(het_truoc, 3)
                moi.append(s)
        sels = moi
        if changes is not None:
            changes.append("trung giua video: cuoi %s tu %.2fs noi lai o dau %s (%s) -> bo ban o %s" % (
                a_id, cat, b_id, " | ".join('"%s"' % t["text"][:50] for t in khop), a_id))
    return sels


_DEM_DAU = {"ờ", "ơ", "à", "ừ", "ừm", "ưm", "um", "ừa", "ạ"}


def _tu_noi_dung(text):
    """Chu MANG Y cua cau (bo dau, bo chu phu / tieng dem) de so hai lan noi."""
    import speech_cut
    return [t for t in speech_cut._norm(text) if t not in speech_cut._FILL]


def _cau_giu(transcript_data, sels, sid):
    """[(chi so trong transcript, cau)] cua cac cau CON (phu >= 50% boi selections), theo gio."""
    rng = [(_f(s.get("start")), _f(s.get("end"))) for s in sels if s.get("source_id") == sid]
    rows = _gon_loi_thoai((transcript_data or {}).get(sid))
    out = []
    for k, t in enumerate(rows):
        dai = max(0.01, t["end"] - t["start"])
        if sum(max(0.0, min(t["end"], b) - max(t["start"], a)) for a, b in rng) / dai >= 0.5:
            out.append((k, t))
    return rows, out


def _cap_lap(A, B):
    """Ghep cac cau lan truoc (A) voi cau lan sau (B) theo DUNG thu tu (quy hoach dong), moi cap
    >= 2 chu mang y chung, giong >= 60% cau ngan hon, va co >= 1 chu RIENG (chu xuat hien <= 2 cau
    trong A+B — 'đăng bài' co o moi muc liet ke thi khong tinh). Tra [(i, j, so_chu_chung)]."""
    import speech_cut
    ta = [_tu_noi_dung(t["text"]) for t in A]
    tb = [_tu_noi_dung(t["text"]) for t in B]
    dem = {}
    for toks in ta + tb:
        for w in set(toks):
            dem[w] = dem.get(w, 0) + 1

    def chung(x, y):
        used, hit = set(), []
        for w in x:
            j = next((k for k, v in enumerate(y) if k not in used and speech_cut._tok_eq(w, v)), None)
            if j is not None:
                used.add(j)
                hit.append(w)
        return hit

    diem = [[0] * len(B) for _ in A]
    for i, x in enumerate(ta):
        for j, y in enumerate(tb):
            if not x or not y:
                continue
            h = chung(x, y)
            if len(h) >= 2 and len(h) / float(min(len(x), len(y))) >= 0.6 and any(dem.get(w, 0) <= 2 for w in h):
                diem[i][j] = len(h)
    # quy hoach dong: tong chu chung lon nhat voi cap (i, j) tang dan ca hai phia
    best = [[(0, [])] * (len(B) + 1) for _ in range(len(A) + 1)]
    for i in range(len(A) - 1, -1, -1):
        for j in range(len(B) - 1, -1, -1):
            cand = [best[i + 1][j], best[i][j + 1]]
            if diem[i][j]:
                s, pairs = best[i + 1][j + 1]
                cand.append((s + diem[i][j], [(i, j, diem[i][j])] + pairs))
            best[i][j] = max(cand, key=lambda c: (c[0], -len(c[1])))
    return best[0][0][1] if A and B else []


def bo_lap_trong_video(selections, transcript_data, changes=None, removed=None, cua_so=8, gio_cua_so=25.0):
    """Luoi an toan cho NOI LAI TRONG MOT VIDEO: nguoi noi dang noi thi vap / quen thoai (ngap
    ngung, im lau, "ờ", cau bo lung "..."), roi NOI LAI cung y (vd liet ke lai "đăng bài trên fanpage,
    trên nhóm...") ma B1 van giu ca hai lan -> bo lan TRUOC tu cau dau cua phan lap toi cho vap, giu
    lan sau (lan noi lai). Chi xet quanh CHO VAP (khong vap = nhan manh co chu y, khong dung toi);
    can >= 2 cau khop theo thu tu, >= 5 chu mang y chung. Tra selections moi; `removed` (list)
    nhan cac khoang da bo (de cat an toan theo tieng noi khong lui lai vao do)."""
    sels = [dict(s) for s in selections or [] if isinstance(s, dict)]
    for sid in list(dict.fromkeys(s.get("source_id") for s in sels)):
        da_xet = set()
        for _ in range(12):                      # moi lan bo xong tinh lai cac cau con
            rows, giu = _cau_giu(transcript_data, sels, sid)
            hit = None
            for n in range(len(giu) - 1):
                (k1, c1), (k2, c2) = giu[n], giu[n + 1]
                if (sid, c1["end"]) in da_xet:
                    continue
                txt1 = (c1["text"] or "").strip()
                dau2 = (_chu_cau(c2["text"]) or [""])[0]
                vap = (k2 - k1 > 1 or c2["start"] - c1["end"] >= 0.8 or txt1.endswith(("...", "…"))
                       or dau2 in _DEM_DAU)
                if not vap:
                    continue
                da_xet.add((sid, c1["end"]))
                A = [c for _, c in giu[max(0, n + 1 - cua_so):n + 1] if c["start"] >= c1["end"] - gio_cua_so]
                B = [c for _, c in giu[n + 1:n + 1 + cua_so] if c["end"] <= c2["start"] + gio_cua_so]
                pairs = _cap_lap(A, B)
                tong = sum(p[2] for p in pairs)
                if len(pairs) < 2 or tong < 5:
                    continue
                i0, i_last, j0 = pairs[0][0], pairs[-1][0], pairs[0][1]
                if i_last < len(A) - 3 or j0 > 2:
                    continue                     # phan lap khong nam sat cho vap -> khong phai noi lai
                bo = A[i0:]
                lan_sau = B[j0:pairs[-1][1] + 2]
                if any((c["text"] or "").strip().endswith(("...", "…")) for c in lan_sau[:3]):
                    continue                     # lan sau cung bo lung -> khong chac lan nao tron ven
                if sum(len(_tu_noi_dung(c["text"])) for c in lan_sau) < 0.6 * sum(len(_tu_noi_dung(c["text"])) for c in bo):
                    continue                     # lan sau ngan han -> co the lan truoc moi la lan tron ven
                hit = (bo[0]["start"], c1["end"], bo, [B[p[1]] for p in pairs])
                break
            if hit is None:
                break
            cat_a, cat_b, bo, khop = hit
            moi = []
            for s in sels:
                a, b = _f(s.get("start")), _f(s.get("end"))
                if s.get("source_id") != sid or b <= cat_a + 0.01 or a >= cat_b - 0.01:
                    moi.append(s)
                    continue
                if a < cat_a - 0.3:
                    moi.append(dict(s, end=round(cat_a, 3)))
                if b > cat_b + 0.3:
                    moi.append(dict(s, start=round(cat_b, 3)))
            sels = moi
            if removed is not None:
                removed.append({"source_id": sid, "start": round(cat_a, 3), "end": round(cat_b, 3),
                                "ly_do": "noi lap (code): noi lai o %.2fs" % khop[0]["start"]})
            if changes is not None:
                changes.append("noi lai trong %s: %.2f-%.2f (%s) duoc noi lai o %.2fs (%s) -> bo lan truoc" % (
                    sid, cat_a, cat_b, " | ".join('"%s"' % c["text"][:40] for c in bo[:4]),
                    khop[0]["start"], " | ".join('"%s"' % c["text"][:40] for c in khop[:3])))
    return sels


def ton_trong_da_bo(segs, removed, changes=None, min_phu=0.5, min_len=0.3):
    """B2 KHONG duoc dua lai phan B1 / code da bo (noi lap, tieng dem): segment de len mot khoang
    da bo >= min_phu giay -> cat phan do ra (bo, cat dau / cuoi, hoac tach doi). Chi cham vao dung
    cac khoang da ghi trong `removed`. Tra segments moi (target_start chua xep lai)."""
    rm = [(r.get("source_id"), _f(r.get("start")), _f(r.get("end"))) for r in removed or []
          if isinstance(r, dict) and _f(r.get("end")) - _f(r.get("start")) >= min_phu]
    out = []
    for s in segs or []:
        if not isinstance(s, dict) or s.get("kind") in ("insert", "hook") or not rm:
            out.append(s)
            continue
        parts = [s]
        for r_sid, a, b in rm:
            if r_sid not in (s.get("source_id"), None):
                continue
            nxt = []
            for p in parts:
                st, en = _f(p.get("start")), _f(p.get("end"))
                if min(en, b) - max(st, a) < min_phu:
                    nxt.append(p)
                    continue
                if a - st >= min_len:
                    nxt.append(dict(p, end=round(a, 3)))
                if en - b >= min_len:
                    nxt.append(dict(p, start=round(b, 3)))
                if changes is not None:
                    changes.append("segment %.2f-%.2f de len doan da bo %.2f-%.2f -> cat phan do" % (st, en, a, b))
            parts = nxt
        out.extend(parts)
    return out


def gioi_han_cat(segs, removed, changes=None, sat=0.3, lui=0.25):
    """Segment bat dau / ket thuc NGAY o mep khoang da bo (B1 'removed' + noi lap code bo) -> ghi
    hard_lo / hard_hi: cat an toan theo tieng noi (speech_cut) khong duoc lui dau doan / noi duoi
    doan vao phan da bo qua `lui` giay (truoc day lui ve 'dau cau' theo Whisper keo lai 'Ví dụ như
    là' B1 da bo). Luu tren segment -> build_spec chay lai ra cung ket qua."""
    rm = [(r.get("source_id"), _f(r.get("start")), _f(r.get("end"))) for r in removed or []
          if isinstance(r, dict) and _f(r.get("end")) - _f(r.get("start")) >= 0.3]
    for i, s in enumerate(segs or []):
        if not isinstance(s, dict) or s.get("kind") in ("insert", "hook"):
            continue
        sid, st, en = s.get("source_id"), _f(s.get("start")), _f(s.get("end"))
        lo = max([b - lui for r_sid, a, b in rm if r_sid in (sid, None) and abs(b - st) <= sat and a < st], default=None)
        hi = min([a + lui for r_sid, a, b in rm if r_sid in (sid, None) and abs(a - en) <= sat and b > en], default=None)
        if lo is not None and lo < st:
            s["hard_lo"] = round(lo, 3)
        if hi is not None and hi > en:
            s["hard_hi"] = round(hi, 3)
        if changes is not None and (lo is not None or hi is not None):
            changes.append("seg%d: mep ke doan da bo -> khong lui/noi vao phan da bo (%s)" % (
                i, ", ".join(x for x in ("dau >= %.2f" % lo if lo is not None else "", "cuoi <= %.2f" % hi if hi is not None else "") if x)))
    return segs


# ============================================================================
# PIPELINE LAP KE HOACH — CAC LAN GOI AI LAP KE HOACH (GPT / Claude): B1 B2 B3 B6 B7
# ============================================================================

def gpt_select(brief, reference_analysis=None, edit_request=None, log=None):
    """B1: Chon chat lieu (doan tot nhat tu moi source)."""
    sys_prompt = _p("_SELECT_SYSTEM")
    # Cắt gọn source_analysis: chỉ gửi summary + sources[].id/name/duration/summary/role/emotion_map/key_moments
    brief_slim = {
        "summary": brief.get("summary", ""),
        "language": brief.get("language", "vi"),
        "tone": brief.get("tone", ""),
        "total_source_duration": brief.get("total_source_duration", 0),
    }
    brief_slim["sources"] = []
    for src in brief.get("sources", []):
        brief_slim["sources"].append({
            "id": src.get("id", ""),
            "name": src.get("name", ""),
            "duration": src.get("duration", 0),
            "summary": src.get("summary", ""),
            "role": src.get("role", "talking_head"),
            "emotion_map": src.get("emotion_map", []),
            "key_moments": src.get("key_moments", []),
            "faces_region": src.get("faces_region", ""),
            "quality": src.get("quality", {}),
            # Loi thoai gon theo giay: de chon doan TRON CAU (start = dau cau, end = het cau)
            # va biet doan do NOI GI. Truoc day B1 chi thay tom tat -> cat giua cau.
            "transcript": _gon_loi_thoai(src.get("transcript")),
        })
    if not brief.get("sources") and brief.get("transcript"):
        # brief doi cu (1 video, transcript o goc)
        brief_slim["transcript"] = _gon_loi_thoai(brief.get("transcript"))
    # Slice reference_analysis if exists
    ref_slim = None
    if reference_analysis:
        ref_slim = {
            "summary": reference_analysis.get("summary", ""),
            "format": reference_analysis.get("format", ""),
            "pacing": reference_analysis.get("pacing", {}),
            "editing_language": reference_analysis.get("editing_language", {}),
            "captions": reference_analysis.get("captions", {}),
            "audio": reference_analysis.get("audio", {}),
            "visual_identity": reference_analysis.get("visual_identity", {}),
            "transfer_rules": reference_analysis.get("transfer_rules", []),
        }
        # Truong cua prompt video mau doi moi — ban cu khong co thi bo qua.
        # timeline_style_events co y khong dua vao: dai, chi la bang chung cho style_patterns.
        for k in ("style_fingerprint", "structure", "shot_system", "attention_system", "style_patterns"):
            if reference_analysis.get(k):
                ref_slim[k] = reference_analysis[k]
    user = json.dumps({
        "source_analysis": brief_slim,
        "reference_analysis": ref_slim,
        "edit_request": edit_request or {},
    }, ensure_ascii=False)
    if log:
        log("B1/7: %s chon chat lieu tu source..." % plan_ai_name())
    text = plan_chat([
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user},
    ], json_mode=True, max_tokens=8000, temperature=0.6, req_timeout=150, max_attempts=2, step_label="B1-select")
    return _safe_json(text)


def gpt_timeline(selections, source_videos, duration_target=None, transcript_data=None,
                 story=None, reference_analysis=None, log=None):
    """B2: Dung timeline tu cac doan da chon.

    Truoc day chi nhan selections + source_videos: khong biet doan do NOI GI, cau bat
    dau/ket thuc o dau -> cat giua cau, va khong biet mach truyen -> xep thu tu tuy y.
    Nay moi selection kem loi thoai BEN TRONG no + cau chuyen cua B1 + nhip cat cua video mau."""
    sys_prompt = _p("_TIMELINE_SYSTEM")
    sel_rows = []
    for i, s in enumerate(selections or []):
        if not isinstance(s, dict):
            continue
        row = dict(s)
        row["selection_index"] = i
        st, en = _f(s.get("start")), _f(s.get("end"))
        row["loi_thoai"] = _gon_loi_thoai((transcript_data or {}).get(s.get("source_id", "")), st, en)
        sel_rows.append(row)
    payload = {
        "cau_chuyen": story or {},
        "selections": sel_rows,
        "source_videos": source_videos or [],
        "duration_target": duration_target,
    }
    ref = phong_cach_cho_buoc(reference_analysis, "timeline")
    if ref:
        payload["phong_cach_mau"] = ref
    user = json.dumps(payload, ensure_ascii=False)
    if log:
        log("B2/7: %s sap sep timeline..." % plan_ai_name())
    text = plan_chat([
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user},
    ], json_mode=True, max_tokens=8000, temperature=0.4, req_timeout=90, max_attempts=2, step_label="B2-timeline")
    return _safe_json(text)


def gpt_audio(key_moments_data, emotion_map_data, sfx_catalog, segments=None,
              transcript_data=None, story=None, reference_analysis=None, hook=None,
              transitions=None, captions=None, inserts=None, log=None, hook_visuals=None):
    """B7: Chon SFX — chay CUOI vi SFX la dau cham cau cho nhung gi da co:
    chuyen canh (R4), chu hero (R5 + lop chu do hoa), meme (B6), hook (B3). Khong biet nhung thu do thi SFX
    de dat trung cho meme, bo lo cho chuyen canh, hoac danh nhau voi chu hero.
    key_moments_data: dict {source_id: [key_moment items]}
    emotion_map_data: dict {source_id: [emotion_map items]}
    segments: timeline da dung (B2) — BAT BUOC de biet doan nao roi vao giay nao.
    transcript_data: dict {source_id: [transcript items]} — de neo vao cuoi cau chot.

    LICH SU: ham nay tung CHI nhan key_moments + emotion_map (deu la gio TRONG FILE NGUON)
    trong khi output lai duoc ghi thang vao audio[].start (gio TREN TIMELINE). Timeline co
    cat/dao thu tu -> SFX lech cho. Nay truyen them segments de model biet anh xa, va lop
    plan_guard quy doi "src_time" -> timeline mot cach xac dinh.
    """
    if not sfx_catalog:
        if log:
            log("B7/7: Khong co SFX catalog -> bo qua.")
        return {"audio": []}
    import hook_rule
    sys_prompt = _p("_AUDIO_SYSTEM") + hook_rule.luat("B7") + creative.luat("B7") + """

# SFX CATALOG:
Muc co "summary" la Gemini da NGHE file: summary = nghe thay gi, sound_type = loai tieng,
has_speech = file co GIONG NGUOI noi (speech_text = loi) -> chi dat vao KHOANG LANG, khong de len
loi nguoi noi; avoid_when = khi nao khong dung; duration = do dai file (giay); peak_time = CU DAM
nam o giay thu may trong file (do bang am thanh that, chi co o SFX khong co giong noi).
src_time/start la luc SFX BAT DAU phat: muon cu dam roi dung luc X thi dat = X - peak_time.
Muc khong co summary: nhan doan tu ten file.
""" + json.dumps(sfx_catalog, ensure_ascii=False)
    # Ban do gio NGUON -> gio TIMELINE (kem nhip truyen) cho model doi chieu
    seg_rows = _ban_do_timeline(segments)
    # Nhung gi cac buoc truoc da dat — SFX phai an khop voi chung
    da_co = {}
    tr_rows = []
    for t in transitions or []:
        idx = t.get("segment_index") if isinstance(t, dict) else None
        if isinstance(idx, int) and 0 <= idx < len(seg_rows):
            tr_rows.append({"segment_index": idx, "type": t.get("type"),
                            "timeline_tu": seg_rows[idx]["timeline_tu"]})
    if tr_rows:
        da_co["transitions"] = tr_rows
    heroes = [{k: c.get(k) for k in ("text", "source_id", "src_start", "src_end", "start", "end", "anchor")
               if c.get(k) is not None}
              for c in captions or [] if isinstance(c, dict) and c.get("role") == "hero"]
    if heroes:
        da_co["chu_hero"] = heroes
    memes = [{k: m.get(k) for k in ("meme_id", "source_id", "src_time", "placement", "duration", "why")
              if m.get(k) is not None}
             for m in inserts or [] if isinstance(m, dict)]
    if memes:
        da_co["meme"] = memes
    if hook_visuals:
        da_co["hieu_ung_hook"] = hook_visuals
    payload = {
        "cau_chuyen": story or {},
        "hook": hook,
        "timeline_map": seg_rows,
        "da_co_tren_timeline": da_co,
        "transcript": _loc_theo_timeline(transcript_data, segments),
        "key_moments": _loc_theo_timeline(key_moments_data, segments),
        "emotion_map": _loc_theo_timeline(emotion_map_data, segments),
    }
    ref = phong_cach_cho_buoc(reference_analysis, "audio")
    if ref:
        payload["phong_cach_mau"] = ref
    user = json.dumps(payload, ensure_ascii=False)
    if log:
        log("B7/7: %s chon SFX tu %d muc..." % (plan_ai_name(), len(sfx_catalog)))
    text = plan_chat([
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user},
    ], json_mode=True, max_tokens=6000, temperature=0.4, req_timeout=90, max_attempts=2, step_label="B7-audio")
    return _safe_json(text)

