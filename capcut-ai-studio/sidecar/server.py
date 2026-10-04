#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Auto CapCut (luong Video Remotion) - Python sidecar (Flask).
Chay bang venv cua sidecar (state.json -> venv_python): flask, requests (+ numpy, Pillow...).
Khoi dong: <venv_python> server.py --port <PORT> [--token <SECRET>]

Endpoints chinh:
  GET  /health
  POST /license/ticket    { ticket }             (ve ban quyen ky Ed25519 — thieu ve thi moi route khac tra 403)
  POST /config            { providers: {...} }   (Electron day key tu Keychain - giu trong RAM)
  GET  /providers
  POST /cli_status        { name? }              (CLI chinh chu cho che do goi subscription)
  POST /test_connection   { name }
  POST /understand_sources { videos: [...] }     -> source brief (Gemini + can gio Whisper)
  POST /library/list|lookup|delete               (thu vien phan tich video)
  POST /prompts/list|save|reset                  (menu "Prompt & quy tac")
  GET  /sfx/list, POST /sfx/*, /find_sfx         (kho am thanh; /sfx/label = Gemini nghe & gan nhan)
  GET  /meme/list, POST /meme/*                  (kho meme)
  POST /remotion/understand_reference { video }  -> phan tich video mau (Gemini xem + nghe video)
  POST /remotion/autoplan { brief, ... }         -> {plan, spec, guard, summary}
  POST /remotion/spec     { plan }               -> dung lai RenderSpec tu plan da luu
  GET  /remotion/catalog                         -> danh muc Remotion

Debug log endpoints:
  GET  /debug/status      -> debug enabled? session_id? log_dir?
  GET  /debug/session     -> latest session_id
  GET  /debug/summary     -> latest summary.md (full markdown)
  GET  /debug/jsonl       -> latest calls.jsonl (raw trace)
"""
import os
import sys
import json
import argparse
import copy
import functools
import logging

import time

from flask import Flask, request, jsonify, g

import winsupport
winsupport.install()          # Windows: tien trinh con khong bat console, UTF-8, HEIC (macOS: khong lam gi)

import config
import providers
import analysis_library
import cli_providers
import engine
import plan_guard
import step_cache
import prompt_store
import run_log
import speech_align

app = Flask(__name__)

logging.basicConfig(level=logging.INFO, format="[sidecar] %(levelname)s %(message)s")
logger = logging.getLogger("sidecar")


class _RunLogHandler(logging.Handler):
    """Chuyen moi dong log cua sidecar sang nhat ky cua lan tao video dang chay
    (chi khi request hien tai co "_run"). Dong GUARD da co su kien rieng -> bo qua."""

    def emit(self, record):
        try:
            if not run_log.current():
                return
            msg = record.getMessage()
            if msg.startswith("GUARD"):
                return
            lvl = "error" if record.levelno >= logging.ERROR else \
                  "warn" if record.levelno >= logging.WARNING else "info"
            run_log.note(None, msg, level=lvl)
        except Exception:
            pass


logger.addHandler(_RunLogHandler())

# Buoc nao cua pipeline -> ten hien trong nhat ky
_RUN_STAGES = {
    "/understand_sources": "Hiểu video nguồn",
    "/remotion/understand_reference": "Phân tích video mẫu (Gemini)",
    "/remotion/autoplan": "Lập kế hoạch Remotion",
    "/remotion/spec": "Dựng lại bản Remotion từ plan",
}


def _tom_tat_ket_qua(path, body, res):
    """Vai con so chinh cua ket qua de nhin nhat ky la biet buoc do ra gi."""
    if not isinstance(res, dict):
        return None
    if path == "/understand_sources":
        br = res.get("brief") or {}
        srcs = br.get("sources") or [br]
        return {"so_nguon": len(srcs),
                "dung_lai_thu_vien": res.get("reused") or None,
                "tom_tat": br.get("summary"),
                "cum_transcript": sum(len(x.get("transcript") or []) for x in srcs if isinstance(x, dict)),
                "khoanh_khac": sum(len(x.get("key_moments") or []) for x in srcs if isinstance(x, dict))}
    if path == "/remotion/understand_reference":
        an = res.get("analysis") or {}
        return {"dinh_dang": an.get("format"), "tom_tat": an.get("summary"),
                "dung_lai_thu_vien": (an.get("_library") or {}).get("at"),
                "nguon": an.get("_source"), "do_bang_may": an.get("_measured"),
                "goi_y_remotion": an.get("remotion_hints")}
    if path in ("/remotion/autoplan", "/remotion/spec"):
        out = dict(res.get("summary") or {})
        out.update({"canh_bao": res.get("warnings"), "dung_lai_buoc": res.get("reused_steps")})
        out["plan_cuoi"] = res.get("plan")
        return out
    return None


@app.before_request
def _run_log_begin():
    run_log.set_run(None)
    if request.path not in _RUN_STAGES or request.method != "POST":
        return
    body = request.get_json(force=True, silent=True) or {}
    run = body.get("_run") if isinstance(body, dict) else None
    if not run:
        return
    run_log.set_run(run)
    g.run_t0 = time.time()
    title = _RUN_STAGES[request.path]
    g.run_title = title
    extra = {}
    if request.path == "/understand_sources":
        extra = {"videos": body.get("videos"), "phan_tich_lai": bool(body.get("fresh"))}
    run_log.emit("stage_start", title, step=request.path.strip("/"), input=extra or None)


@app.after_request
def _run_log_end(resp):
    try:
        if run_log.current() and getattr(g, "run_title", None):
            data = resp.get_json(silent=True) if resp.is_json else None
            ok = resp.status_code < 400 and (not isinstance(data, dict) or data.get("ok", True))
            body = request.get_json(force=True, silent=True) or {}
            run_log.emit(
                "stage_end", g.run_title, step=request.path.strip("/"),
                level="ok" if ok else "error",
                duration=round(time.time() - getattr(g, "run_t0", time.time()), 2),
                error=(data or {}).get("error") if not ok and isinstance(data, dict) else None,
                result=_tom_tat_ket_qua(request.path, body, data) if ok else None)
    except Exception:
        pass
    return resp


@app.teardown_request
def _run_log_clear(_exc):
    run_log.set_run(None)


AUTH_TOKEN = None  # set tu CLI; neu None thi khong yeu cau


def require_token(fn):
    @functools.wraps(fn)
    def wrapper(*a, **kw):
        if AUTH_TOKEN:
            tok = request.headers.get("X-Studio-Token")
            if tok != AUTH_TOKEN:
                return jsonify({"error": "unauthorized"}), 401
        return fn(*a, **kw)
    return wrapper


def err(e, code=500):
    return jsonify({"ok": False, "error": str(e)}), code


# ----------------------------------------------------------------------------
# BAN QUYEN — "ve" do may chu ban quyen ky (Ed25519), Electron main day sang qua /license/ticket.
# Moi viec AI / kho deu can ve hop le: dung khoa cong khai, chua het han, DUNG MAY (ma phan cung khop).
# Code de NGAY TRONG server.py (dong goi = server.so): tach ra module rieng thi chi can thay 1 file .py gia.
# ----------------------------------------------------------------------------
import base64 as _b64
import hashlib as _hashlib
import hmac as _hmac
import re as _re
import subprocess as _subprocess

_LICENSE_PUB = "qsPtITJCcT/BcJQIVP0p4ILdenDc34yJ+8sA8txQeTA="
_LIC = {"payload": None, "fp": None}
# Duoc goi khi chua co ve: khoi dong, cau hinh AI, kiem dang nhap CLI (trang Cai dat + tu kiem dong goi)
_LIC_OPEN = {"/health", "/config", "/license/ticket", "/cli_status", "/test_connection", "/providers"}
_LIC_GRACE_MS = 86400000  # gio may lech toi 1 ngay van nhan ve


def _lic_from_source():
    """Chi ban dev (chay server.py nguon) moi doc bien moi truong cua ban quyen; ban dong goi la server.so."""
    return __file__.endswith(".py")


def _lic_pub():
    if _lic_from_source() and os.environ.get("STUDIO_LICENSE_PUB"):
        return os.environ["STUDIO_LICENSE_PUB"]
    return _LICENSE_PUB


# --- Ed25519 (RFC 8032) chi phan KIEM chu ky, thuan Python (khong them thu vien vao python nhung) ---
_EP = 2 ** 255 - 19
_EL = 2 ** 252 + 27742317777372353535851937790883648493
_ED = -121665 * pow(121666, _EP - 2, _EP) % _EP
_EI = pow(2, (_EP - 1) // 4, _EP)


def _ed_x(y, sign):
    if y >= _EP:
        return None
    x2 = (y * y - 1) * pow(_ED * y * y + 1, _EP - 2, _EP) % _EP
    if x2 == 0:
        return None if sign else 0
    x = pow(x2, (_EP + 3) // 8, _EP)
    if (x * x - x2) % _EP:
        x = x * _EI % _EP
    if (x * x - x2) % _EP:
        return None
    if (x & 1) != sign:
        x = _EP - x
    return x


def _ed_add(P, Q):
    a = (P[1] - P[0]) * (Q[1] - Q[0]) % _EP
    b = (P[1] + P[0]) * (Q[1] + Q[0]) % _EP
    c = 2 * P[3] * Q[3] * _ED % _EP
    d = 2 * P[2] * Q[2] % _EP
    e, f, g_, h = b - a, d - c, d + c, b + a
    return (e * f % _EP, g_ * h % _EP, f * g_ % _EP, e * h % _EP)


def _ed_mul(k, P):
    Q = (0, 1, 1, 0)
    while k > 0:
        if k & 1:
            Q = _ed_add(Q, P)
        P = _ed_add(P, P)
        k >>= 1
    return Q


def _ed_point(raw):
    if len(raw) != 32:
        return None
    y = int.from_bytes(raw, "little")
    sign = y >> 255
    y &= (1 << 255) - 1
    x = _ed_x(y, sign)
    return None if x is None else (x, y, 1, x * y % _EP)


_EGY = 4 * pow(5, _EP - 2, _EP) % _EP
_EG = (_ed_x(_EGY, 0), _EGY, 1, _ed_x(_EGY, 0) * _EGY % _EP)


def _ed_verify(pub, msg, sig):
    if len(pub) != 32 or len(sig) != 64:
        return False
    A = _ed_point(pub)
    R = _ed_point(sig[:32])
    if not A or not R:
        return False
    k = int.from_bytes(sig[32:], "little")
    if k >= _EL:
        return False
    h = int.from_bytes(_hashlib.sha512(sig[:32] + pub + msg).digest(), "little") % _EL
    left = _ed_mul(k, _EG)
    right = _ed_add(R, _ed_mul(h, A))
    return (left[0] * right[2] - right[0] * left[2]) % _EP == 0 and (left[1] * right[2] - right[1] * left[2]) % _EP == 0


def _b64url(s):
    return _b64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


# --- Ma may: GIONG HET electron/services/license.ts (cung lenh, cung chuan hoa, cung HMAC) ---
_FP_SALT = b"agent-edit/fp/v1"
_FP_JUNK = {
    "TO BE FILLED BY O.E.M.", "DEFAULT STRING", "NONE", "SYSTEM SERIAL NUMBER", "BASE BOARD SERIAL NUMBER",
    "CHASSIS SERIAL NUMBER", "SERIAL NUMBER", "N/A", "NA", "NOT APPLICABLE", "NOT SPECIFIED", "NOT AVAILABLE",
    "INVALID", "UNKNOWN", "DEFAULT", "123456789", "0123456789", "1234567890", "03000200-0400-0500-0006-000700080009",
}
_WIN_PS = (
    "$ErrorActionPreference='SilentlyContinue';"
    "$p=Get-CimInstance -ClassName Win32_ComputerSystemProduct | Select-Object -First 1;"
    "$b=Get-CimInstance -ClassName Win32_BaseBoard | Select-Object -First 1;"
    "$g=(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography' -Name MachineGuid).MachineGuid;"
    "[pscustomobject]@{uuid=[string]$p.UUID;board=[string]$b.SerialNumber;guid=[string]$g} | ConvertTo-Json -Compress"
)


def _fp_clean(v):
    s = str(v or "").strip().upper()
    if len(s) < 4 or s in _FP_JUNK or _re.fullmatch(r"[0F\-\s]+", s) or "O.E.M" in s:
        return None
    return s


def _lic_fp():
    if _LIC["fp"] is not None:
        return _LIC["fp"]
    raw = {}
    try:
        if sys.platform == "darwin":
            out = _subprocess.run(["/usr/sbin/ioreg", "-rd1", "-c", "IOPlatformExpertDevice"],
                                  capture_output=True, text=True, timeout=20).stdout
            for k, pat in (("mac.uuid", r'"IOPlatformUUID" = "([^"]+)"'), ("mac.serial", r'"IOPlatformSerialNumber" = "([^"]+)"')):
                m = _re.search(pat, out)
                raw[k] = m.group(1) if m else None
        elif winsupport.IS_WIN:
            ps = os.path.join(os.environ.get("SystemRoot") or "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
            out = _subprocess.run([ps, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", _WIN_PS],
                                  capture_output=True, text=True, timeout=20).stdout
            j = json.loads((out or "").strip() or "{}")
            raw = {"win.uuid": j.get("uuid"), "win.board": j.get("board"), "win.guid": j.get("guid")}
    except Exception as e:
        logger.warning("license: khong doc duoc ma may: %s", e)
    c = {}
    for k, v in raw.items():
        val = _fp_clean(v)
        if val:
            c[k] = _hmac.new(_FP_SALT, ("%s=%s" % (k, val)).encode("utf-8"), _hashlib.sha256).hexdigest()[:32]
    _LIC["fp"] = {"platform": "win32" if winsupport.IS_WIN else "darwin", "c": c}
    return _LIC["fp"]


def _lic_fp_match(bound):
    own = _lic_fp()
    if not isinstance(bound, dict) or bound.get("platform") != own["platform"]:
        return False
    keys = list((bound.get("c") or {}).keys())
    if not keys:
        return True
    hit = sum(1 for k in keys if own["c"].get(k) == bound["c"][k])
    return hit >= min(2, len(keys))


def _lic_parse(ticket):
    """Ve hop le -> payload; khong -> (None, ly do)."""
    parts = str(ticket or "").split(".")
    if len(parts) != 3 or parts[0] != "v1":
        return None, "ve sai dinh dang"
    try:
        pub = _b64.b64decode(_lic_pub())
        if not _ed_verify(pub, ("v1." + parts[1]).encode("ascii"), _b64url(parts[2])):
            return None, "chu ky sai"
        p = json.loads(_b64url(parts[1]).decode("utf-8"))
    except Exception as e:
        return None, "ve hong: %s" % e
    now = time.time() * 1000
    if not isinstance(p, dict) or p.get("v") != 1:
        return None, "ve sai phien ban"
    if (p.get("until") or 0) + _LIC_GRACE_MS < now:
        return None, "ve het han"
    if p.get("exp") and p["exp"] + _LIC_GRACE_MS < now:
        return None, "key het han"
    if not _lic_fp_match(p.get("fp")):
        return None, "ve cua may khac"
    return p, None


def _license_gate():
    if request.path in _LIC_OPEN:
        return None
    if _lic_from_source() and os.environ.get("STUDIO_LICENSE_OFF") == "1":
        return None
    p = _LIC["payload"]
    now = time.time() * 1000
    if not p or (p.get("until") or 0) + _LIC_GRACE_MS < now or (p.get("exp") and p["exp"] + _LIC_GRACE_MS < now):
        return jsonify({"ok": False, "code": "license",
                        "error": "Bản quyền chưa được xác nhận — mở lại app hoặc kiểm tra key."}), 403
    return None


# Chay TRUOC moi before_request khac (nhat ky xu ly...) -> bi chan thi khong ghi gi
app.before_request_funcs.setdefault(None, []).insert(0, _license_gate)


@app.route("/license/ticket", methods=["POST"])
@require_token
def license_ticket():
    b = request.get_json(force=True, silent=True) or {}
    t = b.get("ticket") or ""
    if not t:
        _LIC["payload"] = None
        return jsonify({"ok": True, "cleared": True})
    p, why = _lic_parse(t)
    _LIC["payload"] = p
    if not p:
        logger.warning("license: tu choi ve (%s)", why)
        return jsonify({"ok": False, "error": why}), 400
    return jsonify({"ok": True, "plan": p.get("plan"), "until": p.get("until")})


def _source_rows(brief):
    rows = brief.get("source_videos") or []
    if rows:
        return rows
    path = brief.get("source_video")
    if path:
        return [{
            "id": "source_1",
            "path": path,
            "name": os.path.basename(path),
            "duration": brief.get("duration"),
        }]
    return []


def _normalize_source_brief(brief):
    """Gan metadata tin cay vao ket qua AI va chuyen brief cu sang schema moi."""
    normalized = dict(brief or {})
    rows = _source_rows(normalized)
    if not rows:
        return normalized

    ai_sources = normalized.get("sources") or []
    by_id = {
        item.get("id"): item
        for item in ai_sources
        if isinstance(item, dict) and item.get("id")
    }
    sources = []
    for row in rows:
        item = dict(by_id.get(row["id"]) or {})
        if not item and len(rows) == 1:
            for key in (
                "summary", "tone", "language", "transcript", "beats",
                "on_screen_text", "faces_region", "warnings",
            ):
                if key in normalized:
                    item[key] = normalized[key]
        item["id"] = row["id"]
        item["name"] = row.get("name") or os.path.basename(row["path"])
        if row.get("duration") is not None:
            item["duration"] = row["duration"]
        sources.append(item)

    normalized["sources"] = sources
    normalized["source_videos"] = rows
    normalized["source_video"] = rows[0]["path"]
    total_duration = sum((row.get("duration") or 0) for row in rows)
    if total_duration:
        normalized["total_source_duration"] = total_duration
        normalized.setdefault("duration", total_duration)
    return normalized


def _log_guard(guard, tag=""):
    """In bao cao cua lop bao ve vat ly ra log sidecar."""
    for c in guard.get("fixed", []):
        logger.info("GUARD%s sua: %s", tag, c)
    for i in guard.get("issues", []):
        logger.warning("GUARD%s con loi: [%s] %s", tag, i["severity"], i["problem"])
    run_log.emit("guard", "Lớp bảo vệ plan%s: tự sửa %d chỗ · còn %d vấn đề" % (
        tag, len(guard.get("fixed", [])), len(guard.get("issues", []))),
        step="guard", level="warn" if guard.get("issues") else "ok",
        fixed=guard.get("fixed"), issues=guard.get("issues"),
        issues_before=guard.get("issues_before"))
    n_high = len([i for i in guard.get("issues_before", []) if i["severity"] == "high"])
    if n_high:
        logger.info("GUARD%s: AI mac %d loi high, da tu sua %d cho",
                    tag, n_high, len(guard.get("fixed", [])))
    return guard


def _khoang_loi_noi(transcript_data):
    """[{source_id,start,end}] cac CUM TU co tieng, theo gio NGUON.

    plan_guard can biet luc nao dang co tieng nguoi de: (1) khong de meme len
    dung luc dang noi — phai CAT ra; (2) cat o cho ngat cau chu khong giua tu;
    (3) ha cuong do SFX roi trung giong noi. Khong co du lieu nay thi guard van
    chay, nhung phai chon phuong an an toan nhat (coi nhu luc nao cung dang noi).
    """
    rows = []
    for sid, muc in (transcript_data or {}).items():
        for t in muc or []:
            if not isinstance(t, dict):
                continue
            if not (t.get("text") or "").strip():
                continue        # muc im lang (Gemini ghi text="" + note)
            try:
                st, en = float(t.get("start")), float(t.get("end"))
            except (TypeError, ValueError):
                continue
            if en > st:
                rows.append({"source_id": sid, "start": round(st, 3), "end": round(en, 3)})
    rows.sort(key=lambda r: (r["source_id"] or "", r["start"]))
    return rows


def _can_gio_loi_noi(brief):
    """Gemini ghi gio cau TRE 0.5-2.5s (do that 2026-09-25) -> can lai bang Whisper truoc
    moi buoc dung gio (cat, hook, caption, SFX, meme). Hong thi van chay bang gio Gemini."""
    if not speech_align.needs_retime(brief):
        return brief
    try:
        for n in speech_align.retime_brief(brief, log=logger.info):
            logger.info("Can gio: %s", n)
    except Exception as e:  # can gio khong bao gio duoc lam hong pipeline
        logger.warning("Can gio loi noi that bai: %s", e)
    return brief


def _attach_plan_sources(plan, brief):
    rows = _source_rows(brief)
    if rows:
        plan["source_videos"] = rows
        plan["source_video"] = rows[0]["path"]
        if len(rows) == 1:
            for segment in plan.get("segments") or []:
                segment.setdefault("source_id", rows[0]["id"])
    return plan


# ----------------------------------------------------------------------------
@app.route("/health")
def health():
    return jsonify({"ok": True, "service": "capcut-ai-studio-sidecar", "pid": os.getpid()})


# ----------------------------------------------------------------------------
# PROMPT & QUY TAC (menu cung ten) — xem prompt_store.py
# ----------------------------------------------------------------------------
@app.route("/prompts/list", methods=["GET", "POST"])
@require_token
def prompts_list():
    try:
        return jsonify(dict(prompt_store.listing(), ok=True))
    except Exception as e:
        logger.error("prompts/list: %s", e, exc_info=True)
        return err(e)


@app.route("/prompts/save", methods=["POST"])
@require_token
def prompts_save():
    b = request.get_json(force=True, silent=True) or {}
    try:
        if b.get("kind") == "rules":
            prompt_store.save_rules(b.get("values") or {})
        else:
            prompt_store.save(b.get("kind"), b.get("id"), b.get("value"))
        return jsonify(dict(prompt_store.listing(), ok=True))
    except ValueError as e:
        return err(e, 400)
    except Exception as e:
        logger.error("prompts/save: %s", e, exc_info=True)
        return err(e)


@app.route("/prompts/reset", methods=["POST"])
@require_token
def prompts_reset():
    b = request.get_json(force=True, silent=True) or {}
    try:
        prompt_store.reset(b.get("kind"), b.get("id"))
        return jsonify(dict(prompt_store.listing(), ok=True))
    except ValueError as e:
        return err(e, 400)
    except Exception as e:
        logger.error("prompts/reset: %s", e, exc_info=True)
        return err(e)


@app.route("/config", methods=["POST"])
@require_token
def set_config():
    body = request.get_json(force=True, silent=True) or {}
    masked = config.set_providers(body.get("providers", {}))
    return jsonify({"ok": True, "providers": masked})


@app.route("/providers")
@require_token
def get_providers():
    return jsonify({"ok": True, "providers": config.get_providers(masked=True)})


@app.route("/cli_status", methods=["GET", "POST"])
@require_token
def cli_status_route():
    """Trang thai CLI chinh chu (Claude Code / Codex) cho che do goi subscription."""
    body = request.get_json(force=True, silent=True) or {}
    name = body.get("name")
    if name:
        return jsonify({"ok": True, "status": {name: cli_providers.cli_status(name)}})
    return jsonify({"ok": True, "status": cli_providers.all_status()})


@app.route("/test_connection", methods=["POST"])
@require_token
def test_conn():
    body = request.get_json(force=True, silent=True) or {}
    name = body.get("name")
    # cho phep gui kem config tam thoi de test trc khi luu
    if body.get("providers"):
        config.set_providers(body["providers"])
    if not name:
        return err("Thieu 'name'", 400)
    return jsonify(providers.test_connection(name))


@app.route("/debug_raw", methods=["POST"])
@require_token
def debug_raw_route():
    b = request.get_json(force=True, silent=True) or {}
    try:
        return jsonify(providers.debug_raw(b.get("name", "gpt"), json_mode=b.get("json_mode", False)))
    except Exception as e:
        return err(e)


@app.route("/find_sfx", methods=["POST"])
@require_token
def find_sfx_route():
    b = request.get_json(force=True, silent=True) or {}
    try:
        if b.get("online"):
            res = engine.myinstants_search(b.get("search", ""), limit=b.get("limit", 10))
            return jsonify({"ok": True, "results": res, "source": "myinstants"})
        res = engine.find_sfx(emotion=b.get("emotion"), search=b.get("search"),
                              limit=b.get("limit", 20))
        return jsonify({"ok": True, "results": res})
    except Exception as e:
        return err(e)


@app.route("/sfx/list")
@require_token
def sfx_list_route():
    return jsonify({"ok": True, "sfx": engine.sfx_list()})


@app.route("/sfx/search_online", methods=["POST"])
@require_token
def sfx_search_online_route():
    b = request.get_json(force=True, silent=True) or {}
    res = engine.myinstants_search(b.get("query", ""), limit=b.get("limit", 12))
    if isinstance(res, dict) and res.get("error"):
        return err(res["error"])
    return jsonify({"ok": True, "results": res})


@app.route("/sfx/add_online", methods=["POST"])
@require_token
def sfx_add_online_route():
    b = request.get_json(force=True, silent=True) or {}
    try:
        e = engine.sfx_add_online(b.get("name"), b.get("mp3"), slug=b.get("slug"),
                                  emotion=b.get("emotion"), use_when=b.get("use_when"))
        return jsonify({"ok": True, "entry": e})
    except Exception as ex:
        return err(ex)


@app.route("/sfx/import_local", methods=["POST"])
@require_token
def sfx_import_local_route():
    b = request.get_json(force=True, silent=True) or {}
    try:
        e = engine.sfx_import_local(b.get("path"), name=b.get("name"),
                                    emotion=b.get("emotion"), use_when=b.get("use_when"))
        return jsonify({"ok": True, "entry": e})
    except Exception as ex:
        return err(ex)


@app.route("/sfx/update", methods=["POST"])
@require_token
def sfx_update_route():
    b = request.get_json(force=True, silent=True) or {}
    engine.sfx_update(b.get("id"), emotion=b.get("emotion"), name=b.get("name"), use_when=b.get("use_when"))
    return jsonify({"ok": True})


@app.route("/sfx/label", methods=["POST"])
@require_token
def sfx_label_route():
    """Gemini NGHE cac SFX (ids) roi viet nhan — di dung cach ket noi Gemini dang chon."""
    b = request.get_json(force=True, silent=True) or {}
    ids = [i for i in (b.get("ids") or []) if isinstance(i, str)]
    if not ids:
        return err("Thieu ids", 400)
    try:
        return jsonify({"ok": True, **engine.sfx_label_with_ai(ids, log=logger.info)})
    except Exception as e:
        return err(e)


@app.route("/sfx/delete", methods=["POST"])
@require_token
def sfx_delete_route():
    b = request.get_json(force=True, silent=True) or {}
    engine.sfx_delete(b.get("id"))
    return jsonify({"ok": True})


@app.route("/understand_sources", methods=["POST"])
@require_token
def understand_sources_route():
    b = request.get_json(force=True, silent=True) or {}
    videos = b.get("videos") or []
    if not videos:
        return err("Thieu danh sach videos", 400)
    normalized = []
    for i, video in enumerate(videos):
        path = video.get("path") if isinstance(video, dict) else None
        if not path or not os.path.isfile(path):
            return err("Khong tim thay file video: %s" % path, 400)
        normalized.append({
            "id": video.get("id") or "source_%d" % (i + 1),
            "path": path,
            "name": video.get("name") or os.path.basename(path),
            "duration": video.get("duration"),
        })
    try:
        # THU VIEN: video da phan tich truoc day (cung NOI DUNG file) -> dung lai, chi gui Gemini phan con lai
        saved = {}
        if not b.get("fresh") and b.get("reuse", True):
            for v in normalized:
                sv = analysis_library.get_source(v["path"])
                if sv:
                    saved[v["id"]] = sv
        todo = [v for v in normalized if v["id"] not in saved]
        new_brief = None
        if todo:
            new_brief = providers.gemini_understand_sources(todo, fresh=bool(b.get("fresh")))
            new_brief["source_videos"] = todo
            new_brief["source_video"] = todo[0]["path"]
            new_brief = _can_gio_loi_noi(_normalize_source_brief(new_brief))
            by_id = {x.get("id"): x for x in new_brief.get("sources") or [] if isinstance(x, dict)}
            for v in todo:
                if by_id.get(v["id"]):
                    try:
                        analysis_library.save_source(v["path"], by_id[v["id"]], new_brief, name=v["name"],
                                                     duration=v.get("duration"))
                    except Exception as ex:  # luu thu vien hong khong duoc lam hong buoc chinh
                        logger.warning("Luu thu vien phan tich loi: %s", ex)
        if not saved:
            brief = new_brief
            brief["source_videos"] = normalized
            brief["source_video"] = normalized[0]["path"]  # backward compatibility
        else:
            brief = analysis_library.compose_brief(normalized, saved, new_brief)
            run_log.emit("note", "Dùng lại phân tích đã lưu cho %d/%d video (không gọi lại Gemini)"
                         % (len(saved), len(normalized)), step="understand_sources", level="ok",
                         reused={k: v.get("at") for k, v in saved.items()})
        brief = _can_gio_loi_noi(_normalize_source_brief(brief))
        return jsonify({"ok": True, "brief": brief,
                        "reused": {k: v.get("at") for k, v in saved.items()}})
    except Exception as e:
        return err(e)


# ----------------------------------------------------------------------------
# THU VIEN PHAN TICH (analysis_library.py): video nguon / video mau da phan tich
# ----------------------------------------------------------------------------
@app.route("/library/list", methods=["GET", "POST"])
@require_token
def library_list_route():
    try:
        return jsonify({"ok": True, "items": analysis_library.list_items()})
    except Exception as e:
        return err(e)


@app.route("/library/lookup", methods=["POST"])
@require_token
def library_lookup_route():
    b = request.get_json(force=True, silent=True) or {}
    try:
        return jsonify({"ok": True, "found": analysis_library.lookup(b.get("paths") or [])})
    except Exception as e:
        return err(e)


@app.route("/library/delete", methods=["POST"])
@require_token
def library_delete_route():
    b = request.get_json(force=True, silent=True) or {}
    if not b.get("fp"):
        return err("Thieu fp", 400)
    try:
        return jsonify({"ok": analysis_library.delete(b["fp"], b.get("part"))})
    except Exception as e:
        return err(e)


# ----------------------------------------------------------------------------
# KHO MEME (b-roll chen)
# ----------------------------------------------------------------------------
@app.route("/meme/list")
@require_token
def meme_list_route():
    import meme_lib
    b = request.args
    return jsonify({"ok": True, "memes": meme_lib.find_meme(
        emotion=b.get("emotion"), search=b.get("search"), limit=int(b.get("limit", 200)))})


@app.route("/library/sync", methods=["POST"])
@require_token
def library_sync_route():
    """Dong bo kho SFX + Meme: manifest (kem link tai tam) do Electron xin tu may chu ban quyen. Gop theo id."""
    import library_sync
    b = request.get_json(force=True, silent=True) or {}
    lines = []
    try:
        res = library_sync.pull(b.get("manifest"), log=lambda s: lines.append(s))
        res["log"] = lines
        return jsonify(res)
    except Exception as e:
        logger.exception("library sync failed")
        return err("Dong bo kho loi: %s" % (str(e)[:200]), 500)


@app.route("/meme/fetch", methods=["POST"])
@require_token
def meme_fetch_route():
    b = request.get_json(force=True, silent=True) or {}
    urls = b.get("urls") or []
    if not urls:
        return err("Thieu urls", 400)
    try:
        return jsonify({"ok": True, **engine.meme_fetch(urls, b.get("cookies_from"))})
    except Exception as e:
        return err(e)


@app.route("/meme/import", methods=["POST"])
@require_token
def meme_import_route():
    b = request.get_json(force=True, silent=True) or {}
    try:
        return jsonify({"ok": True, **engine.meme_import_local(b.get("paths") or [])})
    except Exception as e:
        return err(e)


@app.route("/meme/label", methods=["POST"])
@require_token
def meme_label_route():
    b = request.get_json(force=True, silent=True) or {}
    mid = b.get("id")
    if not mid:
        return err("Thieu id", 400)
    try:
        return jsonify({"ok": True, "meme": engine.meme_label_with_ai(mid, log=logger.info)})
    except Exception as e:
        return err(e)


@app.route("/meme/update", methods=["POST"])
@require_token
def meme_update_route():
    import meme_lib
    b = request.get_json(force=True, silent=True) or {}
    mid = b.pop("id", None)
    if not mid:
        return err("Thieu id", 400)
    row = meme_lib.meme_update(mid, **b)
    return jsonify({"ok": bool(row), "meme": row})


@app.route("/meme/delete", methods=["POST"])
@require_token
def meme_delete_route():
    import meme_lib
    b = request.get_json(force=True, silent=True) or {}
    return jsonify({"ok": meme_lib.meme_delete(b.get("id"))})


# ----------------------------------------------------------------------------
# VIDEO REMOTION (menu rieng): hieu nguon dung chung /understand_sources (Gemini)
#   -> video mau: Gemini xem + nghe video mau, dai khung day boc bo phong cach (reference_video.py)
#   -> plan: B1/B2/B3/B6/B7 (providers.py) + R4 (hinh, motion_design) / R5 (chu, remotion_plan)
#   -> RenderSpec: Electron render MP4 bang Remotion
# ----------------------------------------------------------------------------
def _du_lieu_nguon(brief):
    """source_videos + cac bang tra cuu theo source_id (transcript, cam xuc, vung mat, khoanh khac)."""
    source_videos = brief.get("source_videos") or []
    if not source_videos and brief.get("source_video"):
        sv = brief["source_video"]
        source_videos = [{"id": "source_1", "path": sv, "name": os.path.basename(sv),
                          "duration": brief.get("duration", 0)}]
    transcript_data, emotion_map_data, faces_regions, key_moments_data = {}, {}, {}, {}
    for src in brief.get("sources") or []:
        sid = src.get("id", "")
        transcript_data[sid] = src.get("transcript", [])
        emotion_map_data[sid] = src.get("emotion_map", [])
        faces_regions[sid] = src.get("faces_region", "giua-tren")
        key_moments_data[sid] = src.get("key_moments", [])
    if not brief.get("sources"):
        transcript_data["source_1"] = brief.get("transcript", [])
        emotion_map_data["source_1"] = brief.get("emotion_map", [])
        key_moments_data["source_1"] = brief.get("key_moments", [])
        faces_regions["source_1"] = brief.get("faces_region", "giua-tren")
    return source_videos, transcript_data, emotion_map_data, faces_regions, key_moments_data


@app.route("/remotion/catalog", methods=["GET", "POST"])
@require_token
def remotion_catalog_route():
    import remotion_plan
    return jsonify({"ok": True, "catalog": remotion_plan.load_catalog()})


@app.route("/remotion/understand_reference", methods=["POST"])
@require_token
def remotion_reference_route():
    """Video mau cho luong Remotion: Gemini (2026-09-28; truoc do GPT qua Codex CLI). Da co ban luu trong thu
    vien -> dung lai: ban Gemini (ref_video) truoc, khong co thi ban GPT cu (ref_gpt, cung schema)."""
    import reference_video
    b = request.get_json(force=True, silent=True) or {}
    video = b.get("video") or {}
    path = video.get("path") if isinstance(video, dict) else None
    if not path or not os.path.isfile(path):
        return err("Khong tim thay video mau: %s" % path, 400)
    normalized = {"path": path, "name": video.get("name") or os.path.basename(path),
                  "duration": video.get("duration")}
    try:
        analysis = None if b.get("fresh") or not b.get("reuse", True) else \
            (analysis_library.get_reference(path, "ref_video") or analysis_library.get_reference(path, "ref_gpt"))
        if analysis:
            run_log.emit("note", "Dùng lại phân tích video mẫu đã lưu (%s%s) — không gọi lại AI" % (
                analysis["_library"].get("at"), ", bản GPT cũ" if analysis["_library"].get("kind") == "ref_gpt" else ""),
                step="remotion/understand_reference", level="ok")
        else:
            analysis = reference_video.analyze_reference(normalized, log=logger.info)
            try:
                analysis_library.save_reference(path, "ref_video", analysis, name=normalized["name"],
                                                duration=normalized.get("duration"))
            except Exception as ex:
                logger.warning("Luu thu vien phan tich loi: %s", ex)
        analysis["reference_video"] = normalized
        return jsonify({"ok": True, "analysis": analysis})
    except Exception as e:
        return err(e)


@app.route("/remotion/understand_media", methods=["POST"])
@require_token
def remotion_media_route():
    """TU LIEU CUA NGUOI DUNG (anh / video chen LEN video): Gemini xem tung tu lieu + may do kich thuoc / do dai.
    items = [{id, kind, path, name}] (file trong thu muc du an). Luu theo noi dung file; fresh = xem lai."""
    import user_media
    b = request.get_json(force=True, silent=True) or {}
    items, missing = user_media.normalize(b.get("items"))
    if not items:
        return err("Khong co tu lieu hop le%s" % (": khong tim thay %s" % ", ".join(missing) if missing else ""), 400)
    try:
        return jsonify({"ok": True, "results": user_media.analyze_many(items, fresh=bool(b.get("fresh")), log=logger.info),
                        "missing": missing})
    except Exception as e:
        return err(e)


@app.route("/remotion/autoplan", methods=["POST"])
@require_token
def remotion_autoplan_route():
    import hashlib
    import hook_rule
    import meme_lib
    import media_vision
    import motion_design
    import remotion_plan
    import user_media
    b = request.get_json(force=True, silent=True) or {}
    brief = _normalize_source_brief(b.get("brief"))
    if not brief:
        return err("Thieu brief", 400)
    brief = _can_gio_loi_noi(brief)
    reference_analysis = b.get("reference_analysis")
    edit_request = b.get("edit_request")
    # BRAND GUIDELINE (khong bat buoc): font / mau / do hoa / anh / chuyen dong -> dung buoc AI (brand_guide.py)
    import brand_guide
    brand = brand_guide.normalize(b.get("brand_guide"))
    use_cache = not b.get("fresh")
    reused, warnings = [], []
    # TU LIEU CUA NGUOI DUNG (anh / video hien LEN video): muc dich + phan tich Gemini + so do -> R4
    um_items, um_missing = user_media.normalize(b.get("user_media"))
    for m in um_missing:
        warnings.append("Tư liệu '%s' không còn file trong thư mục dự án — đã bỏ qua (thêm lại nếu cần)." % m)
    for src in brief.get("sources") or []:
        tm = src.get("timing") or {}
        if tm.get("method") != "asr-align" and src.get("transcript"):
            warnings.append("%s: chưa căn được giờ lời nói bằng Whisper (%s) — caption có thể lệch 1-2s."
                            % (src.get("id"), tm.get("ly_do") or "không rõ"))
    # Van tay cua AI lap ke hoach (GPT / Claude, model, cach ket noi) nam trong khoa cache moi buoc:
    # doi sang Claude thi cac buoc chay lai that. GPT giu nguyen van tay cu -> cache cu van dung.
    plan_ai = config.plan_provider()
    ai_fp = config.provider_fingerprint(plan_ai)
    logger.info("Lap ke hoach bang %s (%s)", plan_ai, ai_fp)
    rm_fp = remotion_plan.fingerprint()

    def _step(name, payload, fn, optional=False):
        """Chay 1 buoc co cache theo van tay dau vao (step_cache). optional=True: buoc trang
        tri hong thi bo qua + canh bao, khong vut ca ke hoach."""
        keyed = dict(payload)
        keyed["_ai"] = ai_fp
        keyed["_prompts"] = prompt_store.fingerprint()
        run_log.emit("note", "Bắt đầu %s" % name, step=name)
        try:
            res, hit = step_cache.run(name, keyed, fn, use_cache=use_cache, log=logger.info)
        except Exception as ex:
            if not optional:
                raise
            msg = str(ex).split("\n")[0][:200]
            logger.warning("%s that bai: %s — bo qua buoc nay", name, msg)
            warnings.append("%s không chạy được (%s) — đã bỏ qua bước này." % (name, msg))
            run_log.emit("result", "%s lỗi — bỏ qua" % name, step=name, level="warn", error=msg)
            return None
        if hit:
            reused.append(name)
        run_log.emit("result", "%s xong%s" % (name, " (dùng lại kết quả đã lưu, không gọi AI)" if hit else ""),
                     step=name, level="ok", cached=hit, output=res)
        return res

    _nen = None      # viec Codex chay nen (tao anh AI, chu anh AI) — tao sau R4
    try:
        source_videos, transcript_data, emotion_map_data, faces_regions, key_moments_data = _du_lieu_nguon(brief)
        sfx_catalog = engine.sfx_catalog_for_plan()
        if um_items:
            user_media.ensure_analyzed(um_items, log=logger.info, warnings=warnings)
            run_log.emit("note", "Tư liệu của bạn: %d mục — %s" % (len(um_items), " | ".join(
                "%s (%s, %s): %s" % (it["name"], user_media.USE_LABEL[it["use"]], user_media.PLACE_LABEL[it["placement"]],
                                     (it.get("note") or (it.get("analysis") or {}).get("chu_the") or "")[:80])
                for it in um_items)), step="R4-design", output=user_media.planner_view(um_items))

        # B1 + B2: chon chat lieu + dung timeline (prompt chung trong providers.py)
        selection = _step("B1-select", {
            "brief": brief, "ref": reference_analysis, "req": edit_request,
        }, lambda: providers.gpt_select(brief=brief, reference_analysis=reference_analysis,
                                        edit_request=edit_request, log=logger.info))
        # LUAT CUNG: noi dung giu dung thu tu goc, chi duoc cat bo (hook la ban sao, chen o B3).
        # Ep bang code — prompt B1 co the bi user sua / AI khong nghe loi.
        # Nhieu video: thu tu GIUA cac video do B1 xep theo noi dung (kiem hop le), trong moi video
        # theo gio; doan cuoi video truoc bi noi lai o dau video sau -> bo ban trung.
        _thu_tu = []
        selection = dict(selection or {})
        src_ids = providers.thu_tu_video(selection, [sv.get("id") for sv in source_videos], _thu_tu)
        if len(src_ids) > 1:
            selection["thu_tu_video"] = src_ids
        selection["selections"] = providers.giu_thu_tu_nguon(selection.get("selections"), src_ids, _thu_tu)
        selection["selections"] = providers.bo_trung_giua_video(
            selection["selections"], transcript_data, src_ids, _thu_tu)
        # noi vap roi NOI LAI cung y trong mot video ma B1 van giu ca hai -> bo lan truoc
        _bo_code = []
        selection["selections"] = providers.bo_lap_trong_video(
            selection["selections"], transcript_data, _thu_tu, removed=_bo_code)
        if _bo_code:
            selection["removed"] = list(selection.get("removed") or []) + _bo_code
        for _c in _thu_tu:
            logger.info("B1 thu tu: %s", _c)
            run_log.emit("note", "B1: %s" % _c, step="B1-select", level="warn")
        _bo = providers.cau_bi_bo(transcript_data, selection["selections"])
        if _bo:
            run_log.emit("note", "B1 bỏ %d câu (chỉ nên là tiếng đệm / câu nói lặp): %s" % (
                len(_bo), " | ".join("%.1fs \"%s\"" % (c["start"], c["text"][:60]) for c in _bo[:20])),
                step="B1-select", level="warn", output=_bo)
        story = providers.ngu_canh_cau_chuyen(selection, edit_request)
        duration_target = None
        try:
            duration_target = float((edit_request or {}).get("duration", 0)) or None
        except (ValueError, TypeError):
            pass
        timeline = _step("B2-timeline", {
            "sel": selection.get("selections", []), "srcs": source_videos,
            "dur": duration_target or 60, "tr": transcript_data, "story": story,
            "ref": providers.phong_cach_cho_buoc(reference_analysis, "timeline"),
        }, lambda: providers.gpt_timeline(
            selections=selection.get("selections", []), source_videos=source_videos,
            duration_target=duration_target or 60, transcript_data=transcript_data,
            story=story, reference_analysis=reference_analysis, log=logger.info))
        _segs = providers.gan_nhip_segment(timeline.get("segments", []) or [], selection.get("selections", []))
        _doi = []
        # B2 khong duoc dua lai phan B1 / code da bo (noi lap, tieng dem)
        _segs = providers.ton_trong_da_bo(_segs, selection.get("removed"), _doi)
        _segs = providers.giu_thu_tu_nguon(_segs, src_ids, _doi, noi_lien=True)
        plan_guard.snap_segments_to_speech(
            _segs, plan_guard.plan_speech({"speech": _khoang_loi_noi(transcript_data)}, gop=0), _doi)
        # Cat an toan theo chu Whisper + do to that (speech_cut.py) ngay sau B2 -> B3..B7 thay DUNG
        # timeline se dung (build_spec chay lai cung ham, ket qua khong doi)
        import speech_cut
        _bak = copy.deepcopy(_segs)
        try:
            _asr_plan = {
                "asr_words": {src.get("id"): src["asr_words"] for src in brief.get("sources") or []
                              if isinstance(src, dict) and src.get("asr_words")},
                "source_videos": source_videos}
            # mep doan ke phan da bo: khong lui / noi vao do (luu hard_lo/hard_hi tren segment)
            providers.gioi_han_cat(_segs, selection.get("removed"), _doi)
            # dau / cuoi doan la khoang lang dai / "ờ" keo dai (loi Gemini xac nhan) -> cat sat chu
            speech_cut.trim_filler_edges(_asr_plan, _segs, transcript_data, _doi)
            # LUAT CUNG khoang lang (2026-10-01): moi khoang lang that nguoi xem nghe thay > gioi han deu bi cat
            # (nhanh 0.22s / thuong 0.28s / nhe 0.40s), mep cat giu tron duoi am; noi vap lap lai -> bo lan dau
            _lim = speech_cut.pause_limit(story)
            _segs = speech_cut.tighten_pauses(_asr_plan, _segs, _lim, _doi)
            _segs = speech_cut.cut_restarts(_asr_plan, _segs, _doi)
            speech_cut.fix_segment_cuts(_asr_plan, _segs, _doi)
            # cat an toan co the noi lai khoang lang (noi cho het cau / noi lien) -> siet lai lan cuoi + KIEM LAI
            _segs, _ = plan_guard.chuan_hoa_segments(_segs, _doi)
            _segs = speech_cut.tighten_pauses(_asr_plan, _segs, _lim, _doi)
            _segs, _ = plan_guard.chuan_hoa_segments(_segs, _doi)
            _kiem = speech_cut.audit_cuts(_asr_plan, _segs, _lim, _doi)
            _con = len(_kiem["im_lang"]) + len(_kiem["cat_vao_tieng"])
            run_log.emit("note", "Kiểm tra cắt (giới hạn lặng %.2fs): %s" % (
                _lim, "đạt — không còn khoảng lặng dài, không điểm cắt nào rơi vào tiếng"
                + (" (đã tự sửa %d mép cắt)" % _kiem["da_sua"] if _kiem["da_sua"] else "") if not _con else
                "còn %d chỗ: %s" % (_con, "; ".join((_kiem["im_lang"] + _kiem["cat_vao_tieng"])[:8]))),
                step="B2-timeline", level="warn" if _con else "info", output=_kiem)
        except Exception as ex:  # loi do am thanh khong duoc lam hong ca ke hoach
            _segs = _bak
            logger.warning("Cat an toan theo tieng noi loi: %s — giu diem cat cu", ex)
        _segs, _dai = plan_guard.chuan_hoa_segments(_segs, _doi)
        timeline["segments"] = _segs
        if _segs:
            timeline["duration"] = round(_dai, 3)
        for _c in _doi:
            logger.info("B2 chuan hoa: %s", _c)
        segs_b2 = timeline.get("segments", [])
        if not segs_b2:
            return err("B2 khong dung duoc timeline nao tu chat lieu da chon")

        # GIONG NOI (user 2026-10-01): do muc to giong that + y kien Gemini (source.giong_noi) -> giong qua nho thi
        # NANG len vua nghe ro (build_spec dung ban lam viec giong da nang); giong da chuan -> giu nguyen
        import voice_boost
        try:
            voice = voice_boost.assess(brief.get("sources"), source_videos, transcript_data, log=logger.info)
        except Exception as ex:          # do am thanh loi khong duoc lam hong ke hoach
            voice = {}
            logger.warning("Danh gia giong noi loi: %s — giu tieng goc", ex)
        for _sid, _v in voice.items():
            run_log.emit("note", "Giọng nói %s: %s" % (_sid, _v["ly_do"]), step="voice",
                         level="warn" if _v["gain_db"] else "info", output=_v)

        # B3: hook (goi y chuyen canh lay tu danh muc Remotion)
        goi_y = remotion_plan.transition_goi_y_hook()
        hook = _step("B3-hook", {
            "segs": segs_b2, "tr": transcript_data, "emo": emotion_map_data, "km": key_moments_data,
            "story": story, "ref": providers.phong_cach_cho_buoc(reference_analysis, "hook"),
            "tr_goi_y": goi_y, "hr": hook_rule.HOOK_RULE_VERSION,
        }, lambda: providers.gpt_hook(
            segments=segs_b2, transcript_data=transcript_data, emotion_map_data=emotion_map_data,
            key_moments_data=key_moments_data, story=story, reference_analysis=reference_analysis,
            log=logger.info, transition_goi_y=goi_y), optional=True)
        hook_info = providers.thong_tin_hook(hook)
        hints = (reference_analysis or {}).get("remotion_hints") if isinstance(reference_analysis, dict) else None

        # Tu day tro di dung BAN LAM VIEC: video HDR (iPhone) -> ban SDR (media_sdr.py) cho mat nguoi,
        # anh chup tu nguon, plan -> xem truoc / render / tach nguoi cung mau. B1-B3 o tren giu duong
        # dan goc trong du lieu vao -> ket qua AI da luu van dung lai duoc.
        import media_sdr
        source_videos = media_sdr.working_sources(source_videos, log=logger.info)

        # Vi tri mat nguoi noi (Vision, khong goi AI) + BO PHONG CACH: CHI tu video mau cua phien nay
        # (khong video mau -> None: R4 tu thiet ke theo noi dung, khong co phong cach mac dinh / luu chung)
        faces = {}
        for sv in source_videos:
            fb = media_vision.face_box(sv.get("path"), duration=sv.get("duration"))
            if fb:
                faces[sv.get("id")] = fb
        kit = motion_design.style_kit_for(reference_analysis)
        run_log.emit("note", "Phong cách: %s · mặt người: %s" % (
            "bóc từ video mẫu của phiên này" if kit else "không có video mẫu — AI tự thiết kế theo nội dung video này",
            ", ".join("%s (%.2f, %.2f)" % (k, v["cx"], v["cy"]) for k, v in faces.items()) or "không thấy"),
            step="R4-design")

        # R4: THIET KE — bo cuc A-roll/B-roll + tai nguyen anh + lop do hoa + camera + chuyen canh + mau
        r4_key = {
            "segs": segs_b2, "emo": emotion_map_data, "tr": transcript_data, "km": key_moments_data,
            "story": story, "hook": hook_info, "faces": faces, "kit": kit, "cat": rm_fp,
            "ver": motion_design.DESIGN_VERSION,
            "src_desc": [(sv.get("summary"), sv.get("on_screen_text")) for sv in brief.get("sources") or []
                         if isinstance(sv, dict)],
            "docs": hashlib.sha1((motion_design.dsl_doc() + motion_design.glossary_doc()).encode("utf-8")).hexdigest(),
            "ref": providers.phong_cach_cho_buoc(reference_analysis, "effects"),
            # "flow" giu trong khoa cache: ket qua R4 da luu khi con nut "Luong Edit moi" van dung lai duoc
            "flow": "v2",
        }
        if um_items:
            # chi them khi CO tu lieu -> du an khong tu lieu giu nguyen khoa cache cu
            r4_key["um"] = user_media.key_view(um_items)
        if brand:
            # chi them khi CO Brand Guideline -> du an khong co giu nguyen khoa cache cu
            r4_key["brand"] = brand_guide.view(brand, "plan")
            run_log.emit("note", brand_guide.report(brand), step="R4-design", output=brand)
        design = _step("R4-design", r4_key, lambda: motion_design.gpt_rm_design(
            segments=segs_b2, transcript_data=transcript_data, emotion_map_data=emotion_map_data,
            key_moments_data=key_moments_data, story=story, reference_analysis=reference_analysis,
            hook=hook_info, faces=faces, log=logger.info,
            sources=[{"id": sv.get("id"), "summary": sv.get("summary"), "on_screen_text": sv.get("on_screen_text")}
                     for sv in brief.get("sources") or [] if isinstance(sv, dict)],
            user_media=um_items or None, brand=brand), optional=True) or {}
        # phong cach cua PHIEN: video mau -> bo cua video mau; khong -> "style" R4 tu dat cho rieng video nay
        style_phien = kit or motion_design.session_style(design)
        if brand:
            # Brand Guideline uu tien hon: palette ve he mau thuong hieu, font theo vai = font thuong hieu
            style_phien = brand_guide.apply_kit(style_phien, brand)
        if not kit and style_phien:
            run_log.emit("note", "R4 tự đặt phong cách cho video này: %s" % (style_phien.get("mood") or "")[:160],
                         step="R4-design", output=style_phien)
        if design.get("_audit"):
            warnings.append("Thiết kế R4 sau 1 vòng tự sửa vẫn còn thiếu: %s" % "; ".join(design["_audit"])[:400])
        if design.get("scenes") or design.get("layers"):
            visual = design
        else:
            # R4 thiet ke hong -> ban cu (chi chuyen canh / hieu ung / mau, khong lop do hoa)
            rv_key = {
                "segs": segs_b2, "emo": emotion_map_data, "tr": transcript_data, "km": key_moments_data,
                "story": story, "hook": hook_info, "hints": hints, "cat": rm_fp,
                "ref": providers.phong_cach_cho_buoc(reference_analysis, "effects"),
            }
            if brand:
                rv_key["brand"] = brand_guide.view(brand, "plan")
            visual = _step("R4-visual", rv_key, lambda: remotion_plan.gpt_rm_visual(
                segments=segs_b2, emotion_map_data=emotion_map_data, transcript_data=transcript_data,
                key_moments_data=key_moments_data, story=story, reference_analysis=reference_analysis,
                hook=hook_info, log=logger.info, brand=brand), optional=True) or {}

        um_notes = []
        if um_items:
            # tu lieu: sua loai lop / bo tu lieu "chi lam mau" bi dem ra hien / R4 van chua dung -> dat du phong
            # theo cau loi noi khop (ham thuan theo dau vao -> ket qua R4 lay tu cache van ra dung nhu vay)
            um_notes, um_warn = user_media.finalize_design(design, um_items, segs_b2, transcript_data)
            warnings.extend(um_warn)
            for c in um_notes:
                run_log.emit("note", "Tư liệu: %s" % c, step="R4-design", level="warn" if "du phong" in c else "info")

        # VIEC CHAY NEN (2026-09-30): chi viec CODEX (tao anh AI, chu anh AI) chay song song voi cac buoc Claude;
        # cho ket qua ngay truoc khi GHEP PLAN. Moi viec giu nhat ky cua lan chay nay (run_log.carry).
        # KHONG goi Claude CLI dong thoi: do that 09-30, 3 luot `claude -p` cung luc -> 2 luot bi chan dung ~900s
        # roi moi chay (104 luot tuan tu truoc do: 0 lan) -> moi buoc Claude van chay lan luot o luong chinh.
        from concurrent.futures import ThreadPoolExecutor
        _nen = ThreadPoolExecutor(max_workers=3, thread_name_prefix="autoplan-nen")
        _nen_nhan = lambda fn: _nen.submit(run_log.carry(fn))  # noqa: E731

        # Tai nguyen hinh: anh AI (Codex, song song) + khung cat tu video nguon (+ tach nen) + tu lieu nguoi dung.
        # Chay NEN: R5 / chu anh / FX / B6 / B7 khong dung file anh -> khong phai cho Codex (~1-4 phut).
        assets = motion_design.normalize_assets(design.get("assets"), source_videos,
                                                user_assets=user_media.as_assets(um_items))
        if um_items:
            user_media.prepare_cutouts(assets, design, log=logger.info)
        assets_job = None
        if [a for a in assets if not a.get("user_media")]:
            n_ai = sum(1 for a in assets if a["kind"] == "ai_image")
            n_ref = sum(1 for a in assets if a["kind"] == "ai_image" and a.get("ref_media"))
            run_log.emit("note", "Tạo %d tài nguyên hình (%d ảnh AI qua Codex%s — mỗi ảnh ~1-3 phút, chạy song song)"
                         % (len([a for a in assets if not a.get("user_media")]), n_ai,
                            ", %d ảnh có ảnh mẫu của bạn" % n_ref if n_ref else ""), step="assets")
            # Moi anh AI kem BOI CANH (cau dang noi, vi tri tren man hinh, chu hien cung luc, chu de video)
            ctxs = motion_design.asset_contexts(
                design, transcript_data=transcript_data, story=story,
                sources=[{"summary": sv.get("summary")} for sv in brief.get("sources") or [] if isinstance(sv, dict)],
                user_media=um_items, brand=brand)
            assets_job = _nen_nhan(lambda: motion_design.resolve_assets(
                assets, source_videos, style=(style_phien or {}).get("broll_style") or "",
                log=logger.info, contexts=ctxs))
            _cho_canh_bao_anh = len(warnings)   # canh bao anh loi giu dung cho cu (truoc canh bao R5..B7)

        # R5: phu de (theo bo phong cach) — biet truoc cac lop chu do hoa de khong viet trung
        layer_texts = motion_design.layer_texts(design.get("layers"))
        r5_key = {
            "segs": segs_b2, "tr": transcript_data, "emo": emotion_map_data, "faces": faces_regions,
            "km": key_moments_data, "story": story, "hook": hook_info, "hints": hints, "cat": rm_fp,
            "ref": providers.phong_cach_cho_buoc(reference_analysis, "captions"),
            "layers": layer_texts, "sub": (kit or {}).get("subtitle"),
        }
        if brand_guide.view(brand, "captions"):
            r5_key["brand"] = brand_guide.view(brand, "captions")
        captions = _step("R5-captions", r5_key, lambda: remotion_plan.gpt_rm_captions(
            segments=segs_b2, transcript_data=transcript_data, emotion_map_data=emotion_map_data,
            faces_regions=faces_regions, key_moments_data=key_moments_data,
            reference_analysis=reference_analysis, story=story, hook=hook_info,
            layers=layer_texts, subtitle_style=(kit or {}).get("subtitle") if layer_texts else None,
            log=logger.info, brand=brand), optional=True) or {}

        # HIEU UNG TU VIET: AI tu de xuat theo BOI CANH tung khoanh khac + tu viet code (kiem trong hop cach ly)
        art_future, art_res = None, None
        # CHU ANH AI (chay nen, song song voi FX / B6 / B7: mot ben Codex tao anh, mot ben Claude viet code)
        import text_art
        lockups = text_art.lockups_from(design.get("layers"), captions.get("captions", []),
                                        (hook_info or {}).get("caption"))
        if lockups:
            run_log.emit("note", "Chữ ảnh AI: %d cụm chữ nổi bật (không gồm phụ đề karaoke) -> tạo ảnh chữ theo "
                         "phong cách video, cắt từng tầng + vị trí từng từ" % len(lockups), step="TXT-art",
                         output=[{"key": lk["key"], "tang": [(t["role"], t["text"]) for t in lk["tiers"]]} for lk in lockups])
            art_key = {"lk": lockups, "style": style_phien, "story": story, "v": text_art.ART_VERSION}
            if brand_guide.view(brand, "text_art"):
                art_key["brand"] = brand_guide.view(brand, "text_art")
            art_future = _nen_nhan(lambda: _step(
                "TXT-art", art_key,
                lambda: text_art.make_text_art(lockups, style=style_phien, story=story, log=logger.info,
                                               emit=lambda m: run_log.emit("note", m, step="TXT-art"), brand=brand),
                True))
        # DO HOA CO CHU BANG ANH AI (huy hieu...): AI tao CA phan tu (hinh + trang tri + icon + chu), khong chi chu —
        # chay nen song song (Codex) nhu chu anh AI
        import graphic_art
        gfx_future, gfx_res = None, None
        gfx_items = graphic_art.items_from(design.get("layers"), transcript_data)
        if gfx_items:
            run_log.emit("note", "Đồ hoạ ảnh AI: %d phần tử có chữ (huy hiệu…) -> AI tạo cả phần tử (hình, trang trí, "
                         "icon, chữ) theo phong cách video" % len(gfx_items), step="GFX-art",
                         output=[{k: it[k] for k in ("kind", "label", "value", "group")} for it in gfx_items])
            gfx_key = {"it": gfx_items, "style": style_phien, "story": story, "v": graphic_art.ART_VERSION,
                       "p": graphic_art.prompt_fp()}
            if brand_guide.view(brand, "text_art"):
                gfx_key["brand"] = brand_guide.view(brand, "text_art")
            gfx_future = _nen_nhan(lambda: _step(
                "GFX-art", gfx_key,
                lambda: graphic_art.make_graphic_art(gfx_items, style=style_phien, story=story, log=logger.info,
                                                     emit=lambda m: run_log.emit("note", m, step="GFX-art"), brand=brand),
                True))
        import fx_flow
        if visual is not design:
            visual["effects"] = []          # R4 du phong (kho mau) -> khong dung hieu ung mau
        run_log.emit("note", "AI tự đề xuất hiệu ứng theo bối cảnh từng khoảnh khắc rồi tự viết code", step="FX-plan")
        moments = fx_flow.fx_moments(segs_b2, transcript_data, emotion_map_data, key_moments_data, design=design,
                                     captions=captions.get("captions", []), faces=faces, hook=hook_info,
                                     user_media=um_items or None)
        src_desc = [{"id": sv.get("id"), "summary": sv.get("summary"), "on_screen_text": sv.get("on_screen_text")}
                    for sv in brief.get("sources") or [] if isinstance(sv, dict)]
        fxp_key = {"m": moments, "story": story, "style": style_phien, "src": src_desc,
                   "lop": layer_texts, "v": fx_flow.FX_VERSION}
        if brand_guide.view(brand, "fx"):
            fxp_key["brand"] = brand_guide.view(brand, "fx")
        fx_plan = _step("FX-plan", fxp_key,
                        lambda: fx_flow.gpt_fx_plan(moments, story=story, style=style_phien, sources=src_desc,
                                                    existing={"lop_chu": layer_texts[:40]}, log=logger.info,
                                                    hook=hook_info, brand=brand),
                        optional=True) or {}
        for x in (fx_plan.get("bo_qua") or [])[:20]:
            if isinstance(x, dict):
                run_log.emit("note", "Không đặt hiệu ứng ở %s: %s" % (x.get("moment"), str(x.get("ly_do") or "")[:200]),
                             step="FX-plan")
        fx_changes = []
        fx_list = fx_flow.build_effects(
            fx_plan, moments, faces, (style_phien or {}).get("palette"),
            step=lambda n, pl, fn: _step(n, pl, fn, optional=True), changes=fx_changes, log=logger.info,
            emit=lambda m, lvl, out: run_log.emit("note", m, step="FX-code", level=lvl, output=out), brand=brand)
        for c in fx_changes:
            logger.info("FX: %s", c)
            run_log.emit("note", "FX: %s" % c, step="FX-code", level="warn")
        run_log.emit("result", "%d hiệu ứng tự viết đạt kiểm tra" % len(fx_list), step="FX-code",
                     level="ok" if fx_list else "warn",
                     output=[{k: e.get(k) for k in ("id", "kind", "layer", "src_start", "src_end", "context", "goal",
                                                    "why_fit", "visual", "fit_reason")} for e in fx_list])

        # B6: meme (kho meme la file ngoai). Khong cho chu anh AI (khong can) -> B6 / B7 chay trong luc Codex tao chu.
        _emos = {e.get("emotion") for maps in emotion_map_data.values() for e in maps if e.get("emotion")}
        meme_catalog = meme_lib.meme_catalog_for_plan(emotions=_emos)
        inserts = _step("B6-inserts", {
            "segs": segs_b2, "tr": transcript_data, "emo": emotion_map_data, "km": key_moments_data,
            "memes": meme_catalog, "story": story, "hook": hook_info,
            "caps": captions.get("captions", []),
            "ref": providers.phong_cach_cho_buoc(reference_analysis, "inserts"),
        }, lambda: providers.gpt_inserts(
            segments=segs_b2, transcript_data=transcript_data, emotion_map_data=emotion_map_data,
            key_moments_data=key_moments_data, meme_catalog=meme_catalog, story=story,
            reference_analysis=reference_analysis, hook=hook_info,
            captions=captions.get("captions", []), log=logger.info), optional=True) or {}
        if um_items:
            # meme cat / de vao dung luc tu lieu cua nguoi dung dang hien -> bo meme (tu lieu uu tien)
            for c in user_media.drop_conflicting_inserts(inserts, design, um_items):
                run_log.emit("note", "Tư liệu: %s" % c, step="B6-inserts", level="warn")

        # B7: SFX chay cuoi (kho SFX la file ngoai) — biet hieu ung hinh da dat cho hook de dat tieng trung nhip
        _hook_hinh = hook_rule.hook_visuals({"fx": fx_list, "scene_effects": visual.get("effects", [])})
        audio = _step("B7-audio", {
            "km": key_moments_data, "emo": emotion_map_data, "sfx": sfx_catalog, "segs": segs_b2,
            "tr": transcript_data, "story": story, "hook": hook_info,
            "trans": visual.get("transitions", []), "caps": captions.get("captions", []),
            "ins": inserts.get("inserts", []), "layers": layer_texts,
            "ref": providers.phong_cach_cho_buoc(reference_analysis, "audio"),
            "hr": hook_rule.HOOK_RULE_VERSION, "hv": _hook_hinh,
        }, lambda: providers.gpt_audio(
            key_moments_data=key_moments_data, emotion_map_data=emotion_map_data,
            sfx_catalog=sfx_catalog, segments=segs_b2, transcript_data=transcript_data, story=story,
            reference_analysis=reference_analysis, hook=hook_info,
            transitions=visual.get("transitions", []),
            captions=captions.get("captions", []) + motion_design.layers_as_heroes(design.get("layers")),
            inserts=inserts.get("inserts", []), log=logger.info, hook_visuals=_hook_hinh), optional=True) or {}

        # ----- CHO VIEC CHAY NEN (chu anh AI + anh AI) roi moi ghep plan -----
        if art_future is not None:
            try:
                art_res = art_future.result() or {}
            except Exception as ex:
                art_res = {}
                warnings.append("Chữ ảnh AI lỗi (%s) — dùng chữ vẽ bằng code." % str(ex)[:160])
            n_ok = len(art_res.get("items") or {})
            for f in art_res.get("failed") or []:
                run_log.emit("note", "Chữ ảnh AI bỏ cụm '%s': %s — dùng chữ vẽ bằng code" % (f.get("text"), f.get("ly_do")),
                             step="TXT-art", level="warn")
            run_log.emit("result", "Chữ ảnh AI: %d cụm đạt, %d cụm dùng chữ code" % (n_ok, len(art_res.get("failed") or [])),
                         step="TXT-art", level="ok" if n_ok else "warn",
                         output={k: [t.get("file") for t in v.get("tiers") or []] for k, v in (art_res.get("items") or {}).items()})
        if gfx_future is not None:
            try:
                gfx_res = gfx_future.result() or {}
            except Exception as ex:
                gfx_res = {}
                warnings.append("Đồ hoạ ảnh AI lỗi (%s) — dùng huy hiệu vẽ bằng code." % str(ex)[:160])
            for f in gfx_res.get("failed") or []:
                run_log.emit("note", "Đồ hoạ ảnh AI bỏ '%s': %s — dùng huy hiệu vẽ bằng code (màu theo video)"
                             % (f.get("text"), f.get("ly_do")), step="GFX-art", level="warn")
            n_ok = len(gfx_res.get("items") or {})
            run_log.emit("result", "Đồ hoạ ảnh AI: %d phần tử đạt, %d phần tử vẽ bằng code" % (
                n_ok, len(gfx_res.get("failed") or [])), step="GFX-art", level="ok" if n_ok else "warn",
                output={k: v.get("file") for k, v in (gfx_res.get("items") or {}).items()})
        if assets_job is not None:
            assets_job.result()             # loi ngoai du kien -> vut len nhu khi chay tuan tu (tra loi ke hoach)
            bad = [a for a in assets if a.get("error")]
            warnings[_cho_canh_bao_anh:_cho_canh_bao_anh] = [
                "Ảnh '%s' không tạo được (%s) — bỏ các lớp dùng ảnh này." % (a["id"], a["error"][:120]) for a in bad]
            run_log.emit("result", "Tài nguyên hình: %d/%d xong" % (len(assets) - len(bad), len(assets)),
                         step="assets", level="warn" if bad else "ok",
                         output=[{k: a.get(k) for k in ("id", "kind", "path", "cutout_path", "error")} for a in assets])

        # ----- GHEP PLAN (ban THO: gio than video; cau truc hook/meme do build_spec dung) -----
        segs = json.loads(json.dumps(segs_b2))
        n_tr = remotion_plan.apply_visual(segs, visual)
        hook_obj = (hook or {}).get("hook") if isinstance(hook, dict) else None
        if isinstance(hook_obj, dict) and isinstance(visual.get("hook_transition"), dict):
            hook_obj["rm_transition"] = visual["hook_transition"]
        plan = {
            "engine": "remotion",
            "title": b.get("title") or "",
            "source_videos": source_videos,
            "source_video": source_videos[0]["path"] if source_videos else "",
            "canvas": dict(remotion_plan.CANVAS), "fps": remotion_plan.FPS,
            "duration": timeline.get("duration", 0),
            "segments": segs,
            "captions": captions.get("captions", []),
            "caption_theme": captions.get("caption_theme", {}),
            "scene_effects": visual.get("effects", []),
            "grade": visual.get("grade") or {"preset": "none", "intensity": 0},
            # thiet ke chuyen dong (R4-design): bo cuc + lop do hoa + tai nguyen + bo phong cach
            "concept": design.get("concept") or "",
            "assets": [a for a in assets if a.get("path")],
            "scenes": design.get("scenes", []),
            "layers": design.get("layers", []),
            "faces": faces,
            "style_kit": style_phien,
            "hook": hook_obj if isinstance(hook_obj, dict) else None,
            "inserts": inserts.get("inserts", []),
            "audio": audio.get("audio", []),
            "speech": _khoang_loi_noi(transcript_data),
            # giong noi nho -> muc nang (dB) theo tung video nguon (voice_boost); 0 = giong da chuan, giu nguyen
            "voice_boost": voice,
            # khoang lang dai nhat duoc giu (luat cung 2026-10-01) — build_spec siet + kiem lai theo dung muc nay
            "pause_limit": speech_cut.pause_limit(story),
            # Brand Guideline cua du an (build_spec ep font + ma mau thuong hieu, ke ca khi AI quen)
            "brand_guide": brand,
            # hieu ung tu viet (code da kiem + boi canh / muc tieu / ly do) — chi nam trong plan nay
            "fx": fx_list,
            # chu noi bat ve bang anh AI (anh tung tang, vi tri tu) — build_spec dat vao lop chu
            "text_art": {"items": (art_res or {}).get("items") or {}} if art_res else None,
            # do hoa co chu (huy hieu...) ve bang anh AI ca phan tu — build_spec dat vao lop badge
            "graphic_art": {"items": (gfx_res or {}).get("items") or {}} if gfx_res else None,
            # gio TUNG CHU (Whisper) -> build_spec bam caption + karaoke dung chu dang noi
            "asr_words": {src.get("id"): src["asr_words"] for src in brief.get("sources") or []
                          if isinstance(src, dict) and src.get("asr_words")},
            # tu lieu cua nguoi dung (anh / video hien len video) — tai nguyen nam trong "assets"
            "user_media": user_media.plan_view(um_items) if um_items else None,
            "_pipeline": {
                "story_arc": selection.get("story_arc", ""), "tone": selection.get("tone", ""),
                "notes": selection.get("notes", ""),
                "thu_tu_video": selection.get("thu_tu_video"),
                "thu_tu": ["B1-select", "B2-timeline", "B3-hook",
                           "R4-design" if visual is design else "R4-visual", "assets", "R5-captions",
                           "TXT-art", "GFX-art", "FX-plan", "FX-code", "B6-inserts", "B7-audio"],
                # "v1" = du an lap ke hoach khi con luong cu (da go 2026-09-28)
                "luong": "v2",
                "transition_da_gan": n_tr,
                "ai": ai_fp,
            },
        }
        remotion_plan.hook_caption(plan)
        plan = _attach_plan_sources(plan, brief)
        plan = engine.resolve_plan_sfx(plan)
        plan = engine.resolve_plan_inserts(plan)
        spec, report = remotion_plan.build_spec(plan, log=lambda m: run_log.emit("note", m, step="build"))
        if spec:
            # LUAT HOOK (moi video): hook phai co hieu ung hinh + am thanh gay chu y
            plan, spec, _rep_hook, _hook_notes = hook_rule.ensure(
                plan, spec,
                build=lambda pl: remotion_plan.build_spec(pl, log=lambda m: run_log.emit("note", m, step="build")),
                step=lambda n, pl, fn: _step(n, pl, fn, optional=True),
                sfx_catalog=sfx_catalog, transcript_data=transcript_data, story=story,
                fx_ctx={"moments": moments, "faces": faces, "palette": (style_phien or {}).get("palette"),
                        "style": style_phien, "sources": src_desc, "hook": hook_info, "brand": brand},
                emit=lambda m, lvl: run_log.emit("note", m, step="Hook-check", level=lvl), log=logger.info)
            if _rep_hook is not None:
                report = _rep_hook
            plan["_pipeline"]["luat_hook"] = _hook_notes or ["hook da du hieu ung hinh + am thanh"]
        if spec and um_items:
            # tu lieu nao hien o dau (gio timeline cua ban dung that) + ly do -> UI
            plan["_pipeline"]["tu_lieu"] = user_media.usage_report(spec, um_items, design, plan.get("assets"))
            for r in plan["_pipeline"]["tu_lieu"]:
                if r["use"] in ("show", "both") and not r["dung"]:
                    msg = "Tư liệu '%s' không còn chỗ hiện sau khi dựng (bị bỏ khi kiểm tra kỹ thuật) — xem mục Kiểm tra kỹ thuật." % r["name"]
                    if msg not in warnings and not any(r["name"] in w for w in warnings):
                        warnings.append(msg)
            run_log.emit("result", "Tư liệu của bạn: %d/%d đã hiện trong video" % (
                sum(1 for r in plan["_pipeline"]["tu_lieu"] if r["dung"]), len(um_items)), step="build",
                output=plan["_pipeline"]["tu_lieu"])
        _log_guard(report, " (Remotion)")
        if not spec:
            return err("Khong dung duoc ban dung video: %s" % "; ".join(
                i["problem"] for i in report.get("issues", [])))
        if reused:
            logger.info("Dung lai %d buoc da chay truoc: %s", len(reused), ", ".join(reused))
        return jsonify({"ok": True, "plan": plan, "spec": spec, "guard": report, "warnings": warnings,
                        "reused_steps": reused, "summary": remotion_plan.summarize(plan, spec),
                        "brief": brief})
    except Exception as e:
        logger.error("Remotion autoplan that bai: %s", str(e), exc_info=True)
        return err(e)
    finally:
        if _nen is not None:
            # thanh cong: moi viec nen da xong. Loi giua chung: khong bat nguoi dung cho viec nen chay not.
            _nen.shutdown(wait=False)


@app.route("/remotion/spec", methods=["POST"])
@require_token
def remotion_spec_route():
    """Dung lai RenderSpec tu plan da luu (vd project cu, hoac sau khi doi danh muc)."""
    import remotion_plan
    b = request.get_json(force=True, silent=True) or {}
    plan = b.get("plan")
    if not isinstance(plan, dict):
        return err("Thieu plan", 400)
    try:
        spec, report = remotion_plan.build_spec(plan)
        if not spec:
            return err("; ".join(i["problem"] for i in report.get("issues", [])) or "Plan rong")
        return jsonify({"ok": True, "spec": spec, "guard": report,
                        "summary": remotion_plan.summarize(plan, spec)})
    except Exception as e:
        return err(e)


# ----------------------------------------------------------------------------
# Debug log endpoints
# ----------------------------------------------------------------------------

@app.route("/debug/status", methods=["GET"])
@require_token
def debug_status():
    from debug_log import DEBUG_ENABLED, SESSION_ID, LOG_DIR
    return jsonify({
        "enabled": DEBUG_ENABLED,
        "session_id": SESSION_ID,
        "log_dir": LOG_DIR,
    })


@app.route("/debug/session", methods=["GET"])
@require_token
def debug_session():
    from debug_log import latest_dir
    return jsonify({"session_id": latest_dir()})


@app.route("/debug/summary", methods=["GET"])
@require_token
def debug_summary():
    from debug_log import latest_summary, log_summary
    # Force build summary from latest calls.jsonl
    md_path = log_summary()
    content = latest_summary()
    return jsonify({"ok": True, "path": md_path, "content": content})


@app.route("/debug/jsonl", methods=["GET"])
@require_token
def debug_jsonl():
    from debug_log import latest_jsonl
    return jsonify({"ok": True, "content": latest_jsonl()})


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------

def _theo_doi_app_me():
    """App (tien trinh me) tat / crash / bi ep tat ma khong kip gui SIGTERM -> sidecar tu thoat, khong
    chay ngam mai (do that 2026-09-26: 21 sidecar mo coi). Chi khi co tien trinh me that (khong phai
    launchd) va duoc app khoi dong (co token)."""
    import threading
    ppid = os.getppid()
    if ppid <= 1 or not AUTH_TOKEN:
        return

    def _canh():
        while True:
            time.sleep(3)
            # Windows khong doi ppid khi me chet -> hoi he dieu hanh me con song khong
            if (winsupport.IS_WIN and not winsupport.parent_alive(ppid)) or (not winsupport.IS_WIN and os.getppid() != ppid):
                logger.info("App me (pid %d) da tat -> sidecar thoat", ppid)
                os._exit(0)

    threading.Thread(target=_canh, name="parent-watch", daemon=True).start()


def main():
    global AUTH_TOKEN
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--token", default=os.environ.get("STUDIO_TOKEN"))
    a = ap.parse_args()
    AUTH_TOKEN = a.token
    _theo_doi_app_me()
    print("SIDECAR_LISTENING=%s:%d" % (a.host, a.port), flush=True)
    app.run(host=a.host, port=a.port, threaded=True, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
