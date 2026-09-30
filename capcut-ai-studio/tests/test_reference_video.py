#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""VIDEO MAU bang GEMINI (2026-09-28; truoc do GPT qua Codex CLI xem anh luoi).

Chay: HOME=$(mktemp -d) <venv_python> tests/test_reference_video.py      (can ffmpeg + Pillow)

Kiem:
  [1] providers.gemini_files gui DUNG file + thu tu qua ca 3 cach ket noi: tai khoan Google (agy),
      API goc (anh inline, video qua Files API), proxy OpenAI-compatible (data URI).
  [2] reference_video.analyze_reference: luot 1 gui CHINH video mau (ban nen) + so do ffmpeg; luot 2 gui dai
      khung day (anh); ket qua giu so do may, nhan "gemini-ref:" (thu vien xep vao ref_video), bo font la.
"""
import os
import sys
import json
import shutil
import tempfile
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import config          # noqa: E402
import providers       # noqa: E402
import cli_providers   # noqa: E402
import remotion_plan   # noqa: E402
import reference_video  # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:400]))
    if not cond:
        FAILED.append(name)


TMP = tempfile.mkdtemp(prefix="ref-video-")
VID = os.path.join(TMP, "mau.mp4")
# 3 canh doi mau (2 cho cat) + tieng -> co moc cat + duong do to that
subprocess.run([remotion_plan._ffbin("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "color=c=red:s=360x640:r=30:d=4",
                "-f", "lavfi", "-i", "color=c=blue:s=360x640:r=30:d=4",
                "-f", "lavfi", "-i", "color=c=green:s=360x640:r=30:d=4",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=12",
                "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]", "-map", "[v]", "-map", "3:a",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", VID], check=True)
IMG = os.path.join(TMP, "a.jpg")
subprocess.run([remotion_plan._ffbin("ffmpeg"), "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=64x64",
                "-frames:v", "1", IMG], check=True)

try:
    print("\n[1] gemini_files: 3 cach ket noi")
    # providers co `import gemini_media` (nen / cat cho Hieu nguon) -> ham moi KHONG duoc trung ten module
    check("providers.gemini_media van la module nen video (khong bi ham de ten)", hasattr(providers.gemini_media, "prepare"))
    items = [{"path": VID, "label": "VIDEO MAU: mau.mp4"}, {"path": IMG, "label": "anh_so=1"}]

    # (a) tai khoan Google qua agy
    seen = {}
    orig_gv = cli_providers.gemini_video

    def fake_gv(model, prompt, files, req_timeout=900, step_label=""):
        seen.update(model=model, prompt=prompt, files=files, step=step_label)
        return '{"summary": "agy ok"}'
    cli_providers.gemini_video = fake_gv
    config.set_providers({"gemini": {"auth_mode": "subscription", "sub_model": "gemini-3.1-pro-high"}})
    r = providers.gemini_files(items, "PROMPT", step_label="T-agy")
    check("agy: gui dung file theo thu tu", seen.get("files") == [VID, IMG], seen.get("files"))
    check("agy: prompt liet ke file + nhan", "CAC FILE DINH KEM" in seen.get("prompt", "")
          and "1. VIDEO MAU: mau.mp4" in seen["prompt"] and "2. anh_so=1" in seen["prompt"], seen.get("prompt"))
    check("agy: ket qua + _source", r.get("summary") == "agy ok" and r.get("_source", "").startswith("agy:"), r)
    cli_providers.gemini_video = orig_gv

    # (b) API goc: anh inline, video qua Files API
    config.set_providers({"gemini": {"auth_mode": "api_key", "api_key": "k", "model": "gemini-x",
                                     "base_url": "https://generativelanguage.googleapis.com"}})
    uploads, bodies = [], []
    orig_up, orig_post = providers._gemini_upload_file, providers.requests.post
    providers._gemini_upload_file = lambda base, key, path, log=None: (
        uploads.append(path), {"file_uri": "files/abc", "mime_type": "video/mp4", "name": "files/abc"})[1]

    class R:
        status_code = 200

        def json(self):
            return {"candidates": [{"content": {"parts": [{"text": '{"summary": "native ok"}'}]}}]}
    providers.requests.post = lambda url, timeout=None, headers=None, data=None: (bodies.append(json.loads(data)), R())[1]
    r = providers.gemini_files(items, "PROMPT", step_label="T-native")
    parts = bodies[0]["contents"][0]["parts"] if bodies else []
    check("native: chi video di qua Files API", uploads == [VID], uploads)
    check("native: video = file_data, anh = inline_data jpeg",
          any("file_data" in p for p in parts) and any((p.get("inline_data") or {}).get("mime_type") == "image/jpeg" for p in parts),
          [list(p.keys()) for p in parts])
    check("native: ket qua + _source", r.get("summary") == "native ok" and r.get("_source") == "gemini-native:gemini-x", r)
    providers._gemini_upload_file, providers.requests.post = orig_up, orig_post

    # (c) proxy OpenAI-compatible: data URI
    config.set_providers({"gemini": {"base_url": "http://fake/v1"}})
    msgs = []
    orig_oc = providers._openai_chat
    providers._openai_chat = lambda base, key, model, messages, **k: (msgs.append(messages), '{"summary": "proxy ok"}')[1]
    r = providers.gemini_files(items, "PROMPT", step_label="T-proxy")
    urls = [c["image_url"]["url"][:16] for c in msgs[0][0]["content"] if c.get("type") == "image_url"] if msgs else []
    check("proxy: video + anh gui dang data URI dung loai", urls == ["data:video/mp4;b", "data:image/jpeg;"], urls)
    check("proxy: ket qua + _source", r.get("summary") == "proxy ok" and r.get("_source") == "gemini-openai:gemini-x", r)
    providers._openai_chat = orig_oc
    try:
        providers.gemini_files([{"path": "/khong/co.mp4"}], "P", step_label="x")
        check("file khong co -> bao loi", False)
    except RuntimeError as e:
        check("file khong co -> bao loi", "Khong tim thay" in str(e), e)

    print("\n[2] analyze_reference: luot 1 = video, luot 2 = dai khung")
    calls = []

    def fake_media(items, prompt, step_label, log=None):
        calls.append({"step": step_label, "items": items, "prompt": prompt})
        if step_label == "RM-reference":
            return {"summary": "phong cach nhanh", "format": "montage", "pacing": {"average_shot_seconds": 99},
                    "_source": "agy:gemini-test"}
        return {"name": "kit", "palette": {"primary": "#FF0000"},
                "fonts": {"impact": "anton", "body": "font-khong-co-that"},
                "recipes": [{"name": "r1", "layers": [{"type": "text"}]}, {"name": "rong"}], "_source": "agy:x"}
    providers.gemini_files = fake_media
    res = reference_video.analyze_reference({"path": VID, "name": "mau.mp4"}, log=lambda m: None)
    p1 = next((c for c in calls if c["step"] == "RM-reference"), {})
    p2 = next((c for c in calls if c["step"] == "RM-style-kit"), {})
    check("luot 1: gui 1 file video (ban nen mp4 ton tai)", len(p1.get("items") or []) == 1
          and p1["items"][0]["path"].endswith(".mp4") and os.path.isfile(p1["items"][0]["path"]), p1.get("items"))
    check("luot 1: prompt co so do may (moc cat canh) + danh muc Remotion",
          '"moc_cat_canh"' in p1.get("prompt", "") and "DANH MUC REMOTION" in p1.get("prompt", ""))
    check("luot 1: prompt khong con noi ve anh luoi / GPT", "ANH LUOI" not in p1.get("prompt", "")
          and "NGHE tieng" in p1.get("prompt", ""))
    meas = res.get("_measured") or {}
    check("do duoc 2 cho cat canh", meas.get("so_lan_cat_canh") == 2, meas.get("moc_cat_canh"))
    check("giay/shot lay tu MAY do (khong tin so model)", res["pacing"]["average_shot_seconds"] == meas.get("giay_moi_shot_tb")
          and res["pacing"]["average_shot_seconds"] != 99, res.get("pacing"))
    check("nhan nguon gemini-ref: (thu vien -> ref_video)", res.get("_source") == "gemini-ref:agy:gemini-test", res.get("_source"))
    imgs = [it["path"] for it in p2.get("items") or []]
    check("luot 2: gui cac dai khung (anh jpg) co nhan anh_so", imgs and all(x.endswith(".jpg") for x in imgs)
          and p2["items"][0]["label"].startswith("anh_so=1"), p2.get("items"))
    check("luot 2: prompt co phan tich luot 1 + tai lieu ngon ngu dung", "phong cach nhanh" in p2.get("prompt", "")
          and "TAI LIEU NGON NGU DUNG" in p2.get("prompt", ""))
    kit = res.get("style_kit") or {}
    check("style_kit: bo font khong co trong danh muc, giu font that", kit.get("fonts") == {"impact": "anton"}, kit.get("fonts"))
    check("style_kit: bo recipe khong co lop + khong giu _source", [x["name"] for x in kit.get("recipes") or []] == ["r1"]
          and "_source" not in kit, kit)
    check("_media ghi dung so dai khung", (res.get("_media") or {}).get("strips") == len(imgs) and len(imgs) >= 2, res.get("_media"))
finally:
    shutil.rmtree(TMP, ignore_errors=True)

print("\n" + ("TAT CA OK" if not FAILED else "THAT BAI: %d" % len(FAILED)))
sys.exit(1 if FAILED else 0)
