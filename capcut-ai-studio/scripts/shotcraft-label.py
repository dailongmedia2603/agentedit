#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""KHO SHOT: GEMINI XEM video xem truoc (sidecar/references/shot_previews/<id>.mp4) -> viet lai mo ta tung mau vao
<Component>.meta.json "vi" (ten / mo_ta / hop_khi = DUNG KHI-PHU HOP / mo_rong = huong dung khac khi tuy bien /
nang_luong / chu_de). Prompt: sidecar/shot_lib.py _GEMINI_SHOT_PROMPT. Khong ghi "tranh_khi" (user 2026-10-18).

Goi Gemini qua Antigravity CLI `agy` (tai khoan Google da dang nhap tren may nay), khong can app dang chay.

  ../CapCutAPI/.venv/bin/python scripts/shotcraft-label.py              (mau chua co "mo_rong")
  ../CapCutAPI/.venv/bin/python scripts/shotcraft-label.py --all        (viet lai het)
  ../CapCutAPI/.venv/bin/python scripts/shotcraft-label.py --only id1,id2 [--jobs 3] [--model gemini-3.8-flash-high]

Xong: chay `node scripts/shotcraft-sync.mjs` (sinh lai danh muc cho R4). Bao cao chat luong / loi hien thi Gemini thay:
remotion-src/shotcraft/.preview/label-report.json (khong len git).
"""
import json
import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import cli_providers    # noqa: E402
import providers        # noqa: E402
import shot_lib         # noqa: E402

SHOTS = os.path.join(ROOT, "remotion-src", "shotcraft", "shots")
REPORT = os.path.join(ROOT, "remotion-src", "shotcraft", ".preview", "label-report.json")
VI_KEYS = ("ten", "mo_ta", "hop_khi", "mo_rong", "nang_luong", "chu_de")


def opt(k, d=None):
    a = sys.argv[1:]
    return a[a.index(k) + 1] if k in a and a.index(k) + 1 < len(a) else d


def meta_files():
    out = {}
    for d, _sub, files in os.walk(SHOTS):
        for f in files:
            if f.endswith(".meta.json"):
                p = os.path.join(d, f)
                with open(p, encoding="utf-8") as fh:
                    out[json.load(fh)["id"]] = p
    return out


def write_vi(path, vi):
    """Thay KHOI "vi" (khoa cuoi file) — giu nguyen cach trinh bay cac khoa khac (diff gon)."""
    with open(path, encoding="utf-8") as f:
        text = f.read()
    old = json.loads(text)
    i = text.rfind('\n "vi": {')
    if i < 0 or list(old.keys())[-1] != "vi":
        old["vi"] = vi
        new = json.dumps(old, ensure_ascii=False, indent=1) + "\n"
    else:
        body = ",\n".join("  %s: %s" % (json.dumps(k), json.dumps(vi[k], ensure_ascii=False)) for k in VI_KEYS)
        new = text[:i] + '\n "vi": {\n' + body + "\n }\n}\n"
    chk = json.loads(new)
    assert {k: v for k, v in chk.items() if k != "vi"} == {k: v for k, v in old.items() if k != "vi"}, path
    with open(path, "w", encoding="utf-8") as f:
        f.write(new)


def main():
    model = opt("--model", cli_providers.SPEC["gemini"]["default_model"])
    if not cli_providers.agy_logged_in():
        sys.exit("Antigravity CLI (agy) chua dang nhap tai khoan Google — mo app > Cai dat API > Gemini.")
    files = meta_files()
    if opt("--only"):
        ids = [i for i in opt("--only").split(",") if i in files]
    elif "--all" in sys.argv:
        ids = sorted(files)
    else:
        ids = sorted(i for i in files if not (json.load(open(files[i], encoding="utf-8")).get("vi") or {}).get("mo_rong"))
    nopv = [i for i in ids if not shot_lib.preview_path(i)]
    ids = [i for i in ids if i not in nopv]
    if nopv:
        print("[label] bo qua %d mau chua co video xem truoc: %s" % (len(nopv), ", ".join(nopv)))
    if not ids:
        print("[label] khong co mau nao can viet")
        return
    batches = [ids[k:k + shot_lib.LABEL_BATCH] for k in range(0, len(ids), shot_lib.LABEL_BATCH)]
    print("[label] %d mau / %d luot Gemini (%s)" % (len(ids), len(batches), model))

    def call(items, prompt):
        order = "\n".join("%d. %s" % (n + 1, it["label"]) for n, it in enumerate(items))
        text = cli_providers.gemini_video(model, prompt + "\n\nCAC FILE DINH KEM (dung thu tu):\n" + order,
                                          [it["path"] for it in items], step_label="Gemini-shot")
        return providers._safe_json(text)

    lock = threading.Lock()
    try:
        with open(REPORT, encoding="utf-8") as f:
            report = json.load(f)
    except (OSError, ValueError):
        report = {}
    done, errors = [], {}

    def run(batch):
        res = shot_lib.label(batch, call=call)
        if res["errors"]:  # thu lai 1 lan cho mau bi sot / loi
            res2 = shot_lib.label(list(res["errors"]), call=call)
            res["labels"].update(res2["labels"])
            res["errors"] = res2["errors"]
        with lock:
            for sid, lb in res["labels"].items():
                write_vi(files[sid], {k: lb[k] for k in VI_KEYS})
                report[sid] = {"chat_luong": lb["chat_luong"], "loi_hien_thi": lb["loi_hien_thi"]}
                done.append(sid)
            errors.update(res["errors"])
            os.makedirs(os.path.dirname(REPORT), exist_ok=True)
            with open(REPORT, "w", encoding="utf-8") as f:
                json.dump(report, f, ensure_ascii=False, indent=1, sort_keys=True)
            print("[label] %d/%d xong%s" % (len(done), len(ids), (" — loi: %s" % ", ".join(res["errors"])) if res["errors"] else ""),
                  flush=True)

    with ThreadPoolExecutor(max_workers=max(1, int(opt("--jobs", 3)))) as ex:
        list(ex.map(run, batches))
    print("[label] XONG %d/%d mau. Chay tiep: node scripts/shotcraft-sync.mjs" % (len(done), len(ids)))
    if errors:
        print("LOI:\n" + "\n".join("  %s: %s" % kv for kv in sorted(errors.items())))
        sys.exit(1)


if __name__ == "__main__":
    main()
