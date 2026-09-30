#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Phan Python cua Doctor (chay bang Python cua venv sidecar; Electron goi va doc 1 dong JSON cuoi).

  toolchain.py probe            -> kiem Python 3.12, TUNG goi trong requirements.lock (dung phien ban),
                                   thi giac may macOS (Vision: tach nguoi, OCR tieng Viet), model Whisper
  toolchain.py whisper-install  -> tai model Whisper DUNG ban ghim (revision + SHA-256), roi kiem lai

Moc phien ban doc tu ../assets/toolchain.json (cung file Electron doc) — khong ghi so o day.
"""
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SIDECAR = os.path.dirname(HERE)
MANIFEST = json.load(open(os.path.join(SIDECAR, "assets", "toolchain.json"), encoding="utf-8"))


def _lock():
    out = {}
    with open(os.path.join(SIDECAR, MANIFEST["python_packages"]["lock"]), encoding="utf-8") as f:
        for line in f:
            line = line.split("#")[0].strip()
            if "==" in line:
                name, ver = line.split("==", 1)
                out[name.strip()] = ver.strip()
    return out


def probe_packages():
    import importlib.metadata as md
    missing, wrong = [], []
    lock = _lock()
    for name, want in sorted(lock.items()):
        try:
            have = md.version(name)
        except md.PackageNotFoundError:
            missing.append(name)
            continue
        if have != want:
            wrong.append({"name": name, "want": want, "have": have})
    return {"total": len(lock), "missing": missing, "wrong": wrong}


def probe_vision():
    out = {"ok": False, "foreground_mask": False, "person_seg": False, "ocr_vi": False, "error": None}
    try:
        import Vision
        import Quartz  # noqa: F401  (anh tu video, ve khung SVG do hook)
        import AppKit  # noqa: F401  (NSImage)
        out["foreground_mask"] = hasattr(Vision, "VNGenerateForegroundInstanceMaskRequest")
        out["person_seg"] = hasattr(Vision, "VNGeneratePersonSegmentationRequest")
        req = Vision.VNRecognizeTextRequest.alloc().init()
        req.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
        langs, _err = req.supportedRecognitionLanguagesAndReturnError_(None)
        out["ocr_vi"] = "vi-VT" in list(langs or [])
        out["ok"] = out["person_seg"] and out["foreground_mask"] and out["ocr_vi"]
    except Exception as e:  # noqa: BLE001
        out["error"] = str(e).split("\n")[0][:200]
    return out


def _hub_cache():
    try:
        import huggingface_hub.constants as C
        return C.HF_HUB_CACHE
    except Exception:  # noqa: BLE001
        return os.path.join(os.path.expanduser("~"), ".cache", "huggingface", "hub")


def _model_dir():
    return os.path.join(_hub_cache(), "models--" + MANIFEST["whisper"]["repo"].replace("/", "--"))


def probe_whisper(full_hash=False):
    w = MANIFEST["whisper"]
    mdir = _model_dir()
    out = {"ok": False, "cache": mdir, "revision": None, "missing": [], "bad": [], "detail": ""}
    try:
        with open(os.path.join(mdir, "refs", "main")) as f:
            out["revision"] = f.read().strip()
    except OSError:
        pass
    snap = os.path.join(mdir, "snapshots", w["revision"])
    for name, meta in w["files"].items():
        p = os.path.join(snap, name)
        if not os.path.isfile(p):
            out["missing"].append(name)
        elif os.path.getsize(p) != meta["size"]:
            out["bad"].append(name)
        elif full_hash and _sha256(p) != meta["sha256"]:
            out["bad"].append(name)
    if out["missing"] or out["bad"]:
        out["detail"] = "thieu: %s; hong: %s" % (", ".join(out["missing"]) or "-", ", ".join(out["bad"]) or "-")
    elif out["revision"] != w["revision"]:
        # faster-whisper nap model theo refs/main (local_files_only) -> phai tro dung ban ghim
        out["detail"] = "refs/main tro %s, can %s" % (out["revision"], w["revision"][:12])
    else:
        out["ok"] = True
    return out


def _sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def whisper_install():
    w = MANIFEST["whisper"]
    from faster_whisper.utils import download_model
    print("Tai model Whisper '%s' (%s @ %s, ~%d MB)..." % (w["model"], w["repo"], w["revision"][:12],
          sum(m["size"] for m in w["files"].values()) // 1000000), flush=True)
    path = download_model(w["model"], revision=w["revision"])
    # tai theo ma commit thi huggingface_hub KHONG ghi refs/main; faster-whisper (local_files_only) lai doc
    # refs/main -> ghi tay de tro dung ban ghim
    refs = os.path.join(_model_dir(), "refs")
    os.makedirs(refs, exist_ok=True)
    with open(os.path.join(refs, "main"), "w") as f:
        f.write(w["revision"])
    res = probe_whisper(full_hash=True)
    res["path"] = path
    return res


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "probe"
    if cmd == "probe":
        res = {"python": "%d.%d.%d" % sys.version_info[:3],
               "python_ok": "%d.%d" % sys.version_info[:2] == MANIFEST["python"]["series"],
               "executable": sys.executable,
               "packages": probe_packages(), "vision": probe_vision(), "whisper": probe_whisper()}
    elif cmd == "whisper-install":
        res = whisper_install()
    else:
        res = {"error": "lenh khong biet: %s" % cmd}
    print("RESULT=" + json.dumps(res, ensure_ascii=False), flush=True)
    return 0 if res.get("ok", True) and not res.get("error") else 1


if __name__ == "__main__":
    sys.exit(main())
