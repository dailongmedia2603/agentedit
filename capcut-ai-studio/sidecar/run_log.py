#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""NHAT KY XU LY THEO TUNG LAN TAO VIDEO (panel "Nhat ky xu ly" tren UI).

Moi project (1 lan tao video) co 1 file:
    ~/.capcut-studio/runs/<project_id>/events.jsonl
Moi dong la 1 su kien: bat dau/ket thuc buoc, lan goi AI (system prompt + user
message day du), phan hoi cua AI, ghi chu (thu lai, dung cache...), ket qua guard,
render...

Ai ghi:
  - sidecar (file nay): moi request pipeline mang theo "_run": {"id": ...} trong
    body -> server.py goi set_run() cho luong xu ly request do. debug_log.py chuyen
    tiep moi lan goi AI sang day.
  - Electron main: su kien phia UI (bam nut, loi hien cho nguoi dung) — ghi thang
    vao cung file (xem electron/services/runlog.ts).
UI doc file theo byte offset moi ~1s -> hien realtime.

Khong co run hien hanh (vd goi tu Kho meme, Doctor) -> khong ghi gi o day; log
debug tong theo phien (debug_log.py) van ghi nhu cu.
"""
import json
import os
import re
import threading
import time
import uuid

RUNS_DIR = os.path.join(os.path.expanduser("~"), ".capcut-studio", "runs")
MAX_FIELD = 400000          # 1 truong chu dai hon muc nay bi cat (giu UI muot)

_tl = threading.local()
_lock = threading.Lock()
_RE_DATA_URI = re.compile(r"data:([\w/+.-]+);base64,[A-Za-z0-9+/=\s]{200,}")


def safe_id(s):
    return re.sub(r"[^A-Za-z0-9_.-]", "_", str(s or ""))[:80]


def run_dir(run_id):
    return os.path.join(RUNS_DIR, safe_id(run_id))


def events_path(run_id):
    return os.path.join(run_dir(run_id), "events.jsonl")


# ---------------------------------------------------------------------------
# Run hien hanh (theo luong xu ly request)
# ---------------------------------------------------------------------------
def set_run(run):
    """run: {"id": "...", "label": "..."} hoac None."""
    if isinstance(run, str):
        run = {"id": run}
    if isinstance(run, dict) and safe_id(run.get("id")):
        _tl.run = {"id": safe_id(run["id"]), "label": run.get("label") or ""}
    else:
        _tl.run = None
    _tl.calls = {}


def current():
    return getattr(_tl, "run", None)


def carry(fn):
    """Boc fn de chay o LUONG PHU (ThreadPoolExecutor) van ghi vao run hien hanh cua luong goi.
    Nhat ky theo luong -> khong boc thi moi su kien / lan goi AI trong luong phu bi mat. Khung video (doc / ngang,
    canvas.use) cua luong goi cung di theo."""
    import canvas
    run = current()
    khung = canvas.size()

    def w(*a, **k):
        set_run(run)
        try:
            with canvas.use(*khung):
                return fn(*a, **k)
        finally:
            set_run(None)
    return w


# ---------------------------------------------------------------------------
# Ghi
# ---------------------------------------------------------------------------
def _clean(v):
    """Bo base64 video/anh (hang chuc MB), cat chuoi qua dai, bien moi thu thanh JSON duoc."""
    if isinstance(v, str):
        v = _RE_DATA_URI.sub(lambda m: "[%s base64 ~%.1f MB — đã lược bỏ khỏi log]"
                             % (m.group(1), len(m.group(0)) * 0.75 / 1e6), v)
        if len(v) > MAX_FIELD:
            v = v[:MAX_FIELD] + "\n… [đã cắt %d ký tự]" % (len(v) - MAX_FIELD)
        return v
    if isinstance(v, dict):
        return {str(k): _clean(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_clean(x) for x in v]
    if v is None or isinstance(v, (bool, int, float)):
        return v
    return _clean(str(v))


def emit(kind, title, step=None, level="info", run=None, **data):
    """Ghi 1 su kien. kind: stage_start|stage_end|ai_call|ai_response|ai_error|note|
    guard|review|result|ui. level: info|ok|warn|error. Tra ve id su kien (hoac None)."""
    run = run or current()
    if not run:
        return None
    ev = {"id": uuid.uuid4().hex[:12], "ts": time.time(), "kind": kind,
          "title": title, "step": step, "level": level}
    for k, v in data.items():
        if v is not None:
            ev[k] = _clean(v)
    try:
        line = json.dumps(ev, ensure_ascii=False, default=str) + "\n"
        path = events_path(run["id"])
        with _lock:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "a", encoding="utf-8") as f:
                f.write(line)
    except Exception:
        return None   # log khong bao gio duoc lam hong pipeline
    return ev["id"]


def _msg_text(m):
    """Noi dung 1 message (co the la list part: text + video) -> chu doc duoc."""
    if isinstance(m, str):
        return m
    if isinstance(m, list):
        out = []
        for p in m:
            if isinstance(p, dict):
                if p.get("type") == "text" or "text" in p:
                    out.append(p.get("text") or "")
                elif p.get("type") == "image_url":
                    out.append("[đính kèm file video/ảnh]")
                elif "file_data" in p:
                    out.append("[đính kèm file đã upload: %s]" % (p["file_data"].get("file_uri") or ""))
                else:
                    out.append(json.dumps(p, ensure_ascii=False)[:500])
            else:
                out.append(str(p))
        return "\n".join(out)
    if isinstance(m, dict):
        return json.dumps(m, ensure_ascii=False, indent=2)
    return str(m or "")


def _pretty(s):
    """User message thuong la 1 chuoi JSON dai 1 dong -> in dep cho de doc."""
    if isinstance(s, str) and s[:1] in "{[":
        try:
            return json.dumps(json.loads(s), ensure_ascii=False, indent=2)
        except ValueError:
            pass
    return s


# ---------------------------------------------------------------------------
# Goi AI (debug_log.py chuyen sang)
# ---------------------------------------------------------------------------
def ai_call(step, provider, model, system_prompt, user_message, params=None):
    if not current():
        return None
    calls = getattr(_tl, "calls", None)
    if calls is None:
        calls = _tl.calls = {}
    prev = calls.get(step)
    attempt = (prev["attempt"] + 1) if prev and not prev.get("done") else 1
    cid = emit("ai_call", "Gọi AI · %s" % step, step=step, provider=provider, model=model,
               attempt=attempt, params=params,
               system_prompt=_msg_text(system_prompt),
               user_message=_pretty(_msg_text(user_message)))
    calls[step] = {"id": cid, "t0": time.time(), "attempt": attempt, "done": False}
    return cid


def _open_call(step):
    c = (getattr(_tl, "calls", None) or {}).get(step)
    return c or {}


def ai_response(step, provider, raw_text, parsed=None, error=None):
    if not current():
        return None
    c = _open_call(step)
    if c.get("done") and not error:
        # Mot so buoc ghi phan hoi 2 lan (lop HTTP + lop parse) -> chi giu lan dau
        return None
    dur = round(time.time() - c["t0"], 2) if c.get("t0") else None
    if c:
        c["done"] = True
    return emit("ai_error" if error else "ai_response",
                ("AI lỗi · %s" if error else "AI trả về · %s") % step,
                step=step, level="error" if error else "ok", provider=provider,
                call_id=c.get("id"), duration=dur, raw_text=raw_text,
                parsed=parsed, error=str(error) if error else None,
                chars=len(raw_text or ""))


def ai_fail(step, reason):
    """Mot lan thu that bai nhung CON thu lai — khong dong cuoc goi."""
    if not current():
        return None
    c = _open_call(step)
    dur = round(time.time() - c["t0"], 2) if c.get("t0") else None
    return emit("ai_error", "Lần thử %s thất bại · %s" % (c.get("attempt", "?"), step),
                step=step, level="warn", call_id=c.get("id"), duration=dur, error=reason)


def note(step, message, level="info"):
    return emit("note", str(message), step=step, level=level)


# ---------------------------------------------------------------------------
# Doc (cho sidecar /runlog/* — Electron doc thang file, cai nay chi de du phong)
# ---------------------------------------------------------------------------
def read(run_id, offset=0):
    path = events_path(run_id)
    if not os.path.isfile(path):
        return {"events": [], "offset": 0}
    with open(path, "rb") as f:
        f.seek(offset)
        blob = f.read()
    end = blob.rfind(b"\n")
    if end < 0:
        return {"events": [], "offset": offset}
    events = []
    for line in blob[:end].splitlines():
        try:
            events.append(json.loads(line.decode("utf-8")))
        except Exception:
            pass
    return {"events": events, "offset": offset + end + 1}
