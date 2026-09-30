#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Debug log module — ghi toàn bộ prompt + response của từng lần gọi AI.
Log JSONL vao ~/.capcut-studio/debug/<session_id>/ de xem lai.
"""

import json
import os
import time
import threading
from datetime import datetime, timezone

import run_log  # nhat ky theo tung lan tao video (UI realtime)

DEBUG_ENABLED = True  # toggle to disable all logging
MAX_ITEM_LEN = 8000   # truncate long fields to keep logs readable
SESSION_ID = None
LOG_DIR = None
_lock = threading.Lock()


def _ensure_dir():
    # Tao thu muc XONG moi gan LOG_DIR: gan truoc thi luong khac (tao anh song song) thay
    # LOG_DIR da co, ghi vao thu muc chua ton tai -> nem loi giua chung buoc dang chay.
    global LOG_DIR, SESSION_ID
    if LOG_DIR is None:
        with _lock:
            if LOG_DIR is None:
                base = os.path.expanduser("~/.capcut-studio/debug")
                sid = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
                d = os.path.join(base, sid)
                os.makedirs(d, exist_ok=True)
                SESSION_ID, LOG_DIR = sid, d
    return LOG_DIR


def _truncate(s, max_len=MAX_ITEM_LEN):
    if not isinstance(s, str):
        s = json.dumps(s, ensure_ascii=False, indent=2)
    if len(s) > max_len:
        return s[:max_len] + f"\n... [TRUNCATED {len(s) - max_len} chars]"
    return s


def _write(filename, data):
    if not DEBUG_ENABLED:
        return
    d = _ensure_dir()
    path = os.path.join(d, filename)
    with _lock:
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(data, ensure_ascii=False) + "\n")


def log_step_call(step, provider_name, model, system_prompt, user_message, params=None):
    """Ghi BEFORE gọi AI."""
    run_log.ai_call(step, provider_name, model, system_prompt, user_message, params=params)
    _write("calls.jsonl", {
        "ts": time.time(),
        "iso": datetime.now(timezone.utc).isoformat(),
        "type": "call",
        "step": step,
        "provider": provider_name,
        "model": model,
        "system_prompt": _truncate(system_prompt, 6000),
        "user_message": _truncate(user_message, 15000),
    })


def log_step_response(step, provider_name, raw_text, parsed_result=None, error=None):
    """Ghi AFTER nhận response."""
    run_log.ai_response(step, provider_name, raw_text, parsed=parsed_result, error=error)
    entry = {
        "ts": time.time(),
        "iso": datetime.now(timezone.utc).isoformat(),
        "type": "response",
        "step": step,
        "provider": provider_name,
        "raw_text": _truncate(raw_text, 20000) if raw_text else None,
        "parsed": parsed_result if parsed_result else None,
        "error": str(error)[:500] if error else None,
    }
    _write("calls.jsonl", entry)


def log_step_note(step, message):
    """Ghi 1 ghi chu giua chung (vd: dang cho thu lai vi loi mang)."""
    run_log.note(step, message)
    _write("calls.jsonl", {
        "ts": time.time(),
        "iso": datetime.now(timezone.utc).isoformat(),
        "type": "note",
        "step": step,
        "message": str(message)[:500],
    })


def log_summary():
    """Ghi 1 file summary.md readable."""
    if not DEBUG_ENABLED:
        return
    d = _ensure_dir()
    with _lock:
        # build summary from calls.jsonl
        calls_path = os.path.join(d, "calls.jsonl")
        if not os.path.exists(calls_path):
            return
        lines = []
        with open(calls_path, encoding="utf-8") as f:
            for line in f:
                try:
                    entry = json.loads(line)
                    lines.append(entry)
                except json.JSONDecodeError:
                    pass

        md = ["# Debug Log Session: %s\n" % SESSION_ID]
        md.append(f"Total AI calls: {len(lines)}\n")
        for e in lines:
            md.append(f"\n## {e.get('step', '?')} — {e.get('type', '?')} @ {e.get('iso', '?')}")
            md.append(f"\n- **Provider:** {e.get('provider', '?')} / {e.get('model', '?')}")
            if e.get("type") == "call":
                md.append(f"\n- **System prompt:** ({len(e.get('system_prompt', ''))} chars)")
                md.append(f"\n\n```\n{e.get('system_prompt', '')}\n```")
                md.append(f"\n- **User message:** ({len(e.get('user_message', ''))} chars)")
                md.append(f"\n\n```json\n{e.get('user_message', '')}\n```")
            elif e.get("type") == "response":
                if e.get("error"):
                    md.append(f"\n- **ERROR:** {e['error']}")
                md.append(f"\n- **Raw response:** ({len(e.get('raw_text', '') or '')} chars)")
                md.append(f"\n\n```\n{e.get('raw_text', '') or '(empty)'}\n```")
                if e.get("parsed"):
                    md.append(f"\n- **Parsed result:**")
                    md.append(f"\n\n```json\n{json.dumps(e['parsed'], ensure_ascii=False, indent=2)[:10000]}\n```")
        with open(os.path.join(d, "summary.md"), "w", encoding="utf-8") as f:
            f.write("".join(md))
        return os.path.join(d, "summary.md")


def latest_log_dir():
    """Trả về đường dẫn session mới nhất."""
    base = os.path.expanduser("~/.capcut-studio/debug")
    if not os.path.isdir(base):
        return None
    dirs = sorted([d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d))], reverse=True)
    return os.path.join(base, dirs[0]) if dirs else None


def latest_summary():
    """Trả về nội dung summary.md của session gần nhất."""
    d = latest_log_dir()
    if not d:
        return ""
    p = os.path.join(d, "summary.md")
    if os.path.isfile(p):
        with open(p, encoding="utf-8") as f:
            return f.read()
    return ""


def latest_jsonl():
    """Trả về nội dung calls.jsonl của session gần nhất."""
    d = latest_log_dir()
    if not d:
        return ""
    p = os.path.join(d, "calls.jsonl")
    if os.path.isfile(p):
        with open(p, encoding="utf-8") as f:
            return f.read()
    return ""


def latest_dir():
    """Trả về tên session gần nhất."""
    d = latest_log_dir()
    return os.path.basename(d) if d else ""
