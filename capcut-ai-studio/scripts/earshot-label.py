#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BO TAO AM THANH earshot: GEMINI NGHE THAT tung tieng sach cua ngan hang (render o chinh seed cua tieng) -> nhan tieng
Viet cho AI lap ke hoach (B7 khong nghe duoc file, chi doc nhan) -> sidecar/references/earshot_labels.json
{"bank": <ban ngan hang>, "sounds": {id: {nghe, hop, cam_xuc, manh}}}. File nay DI KEM ban cai (thu muc references).

Goi Gemini theo cach ket noi dang chon trong app (tai khoan Google qua `agy` / API key), khong can app dang chay.

  ../CapCutAPI/.venv/bin/python scripts/earshot-label.py               (tieng chua co nhan)
  ../CapCutAPI/.venv/bin/python scripts/earshot-label.py --all         (viet lai het)
  ../CapCutAPI/.venv/bin/python scripts/earshot-label.py --only whoosh_fast/tight,pop/1 [--jobs 3]
"""
import json
import os
import subprocess
import sys
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import providers        # noqa: E402
import remotion_plan    # noqa: E402
import sfx_gen          # noqa: E402

BATCH = 5               # nhu engine.SFX_LABEL_BATCH (do that: 5 file / luot qua agy, nhan dung tung id)

PROMPT = """Ban la SOUND DESIGNER dang GAN NHAN cho bo tieng hieu ung (SFX) dung trong video ngan (talking-head, TikTok /
Reels): tieng khi chu / hinh hien ra, chuyen canh, cu chot, con so lo ra...

Cac file dinh kem la file AM THANH (khong hinh). NGHE TUNG FILE. AI lap ke hoach sau nay KHONG nghe duoc — no chi doc
nhan cua ban de chon tieng cho tung khoanh khac va chon BO TIENG cho ca video theo tone (nhe / gon / toi gian / manh /
vui). Ten loai trong danh sach chi de tham khao — mo ta theo cai ban NGHE THAY.

# TRA VE CHI JSON — MOT muc cho MOI file, dung "id" da cho, dung thu tu
{"sfx": [{
  "id": "<id cua file>",
  "nghe": "nghe thay gi (1 cau tieng Viet co dau, cu the: chat lieu, do day, do dai, sang / tram, co vang khong), vd: 'Tieng vut gio ngan, sac, kem chut kim loai, tat nhanh'",
  "hop": "HOP KHI NAO trong video (goc nguoi xem dang thay gi, 1 cau tieng Viet co dau), vd: 'Chu nho truot vao, chuyen y nhanh trong video cong nghe'",
  "cam_xuc": "nhe nhang|am ap|trong sang|hao hung|hoi hop|soc|hai huoc|sang trong|trung tinh",
  "manh": "nhe|vua|manh"
}]}

⚠️ TRA VE CHI JSON GOC. Khong ```json```. Ky tu dau la {, ky tu cuoi la }."""


def opt(k, d=None):
    a = sys.argv[1:]
    return a[a.index(k) + 1] if k in a and a.index(k) + 1 < len(a) else d


def load():
    try:
        with open(sfx_gen.LABELS_FILE, encoding="utf-8") as f:
            return json.load(f) or {}
    except (OSError, ValueError):
        return {}


def to_mp3(wav, out):
    subprocess.run([remotion_plan._ffbin("ffmpeg"), "-y", "-v", "error", "-i", wav, "-ac", "2", "-b:a", "192k", out],
                   check=True)
    return out


def main():
    if not sfx_gen.available():
        sys.exit("Khong nap duoc earshot: %s" % sfx_gen.load_error())
    data = load()
    data.setdefault("sounds", {})
    snd = sfx_gen.sounds()
    if opt("--only"):
        ids = [i for i in opt("--only").split(",") if i in snd]
    elif "--all" in sys.argv:
        ids = sorted(snd)
    else:
        ids = sorted(i for i in snd if not (data["sounds"].get(i) or {}).get("nghe"))
    if not ids:
        print("[earshot-label] khong co tieng nao can gan nhan")
        return
    tmp = tempfile.mkdtemp(prefix="earshot-label-")
    batches = [ids[k:k + BATCH] for k in range(0, len(ids), BATCH)]
    print("[earshot-label] %d tieng / %d luot Gemini" % (len(ids), len(batches)), flush=True)
    lock = threading.Lock()
    done, errors = [], {}

    def run(batch):
        specs = []
        for sid in batch:
            r = sfx_gen.render({"sound": sid})
            mp3 = to_mp3(r["file"], os.path.join(tmp, sid.replace("/", "__") + ".mp3"))
            specs.append({"id": sid, "name": "%s (loai %s)" % (sid, sfx_gen.category(sid)), "path": mp3,
                          "duration": r.get("dur_s")})
        got = {}
        for _ in range(2):          # thu lai 1 lan cho tieng bi sot
            todo = [s for s in specs if s["id"] not in got]
            if not todo:
                break
            order = "\n".join("%d. id=%s | %s | dai %.2fs" % (n + 1, s["id"], s["name"], float(s["duration"] or 0))
                              for n, s in enumerate(todo))
            try:
                res = providers._gemini_analyze_videos(todo, PROMPT + "\n\nDANH SACH FILE (dung thu tu dinh kem):\n"
                                                       + order, "FILE AM THANH SFX", step_label="Gemini-earshot")
            except Exception as ex:
                for s in todo:
                    errors[s["id"]] = str(ex).split("\n")[0][:200]
                continue
            rows = res.get("sfx") if isinstance(res, dict) else None
            for n, row in enumerate(rows or []):
                if not isinstance(row, dict):
                    continue
                rid = row.get("id") if row.get("id") in {s["id"] for s in todo} else (todo[n]["id"] if n < len(todo) else None)
                if rid and str(row.get("nghe") or "").strip():
                    got[rid] = {k: str(row.get(k) or "").strip()[:220] for k in ("nghe", "hop", "cam_xuc", "manh")}
                    errors.pop(rid, None)
        with lock:
            for sid, lb in got.items():
                data["sounds"][sid] = {k: v for k, v in lb.items() if v}
                done.append(sid)
            for s in specs:
                if s["id"] not in got:
                    errors.setdefault(s["id"], "Gemini khong tra nhan")
            data["bank"] = sfx_gen.bank_version()
            tmp_out = sfx_gen.LABELS_FILE + ".tmp"
            with open(tmp_out, "w", encoding="utf-8") as f:
                json.dump({"bank": data["bank"], "sounds": dict(sorted(data["sounds"].items()))}, f,
                          ensure_ascii=False, indent=1)
                f.write("\n")
            os.replace(tmp_out, sfx_gen.LABELS_FILE)
            print("[earshot-label] %d/%d xong" % (len(done), len(ids)), flush=True)

    with ThreadPoolExecutor(max_workers=max(1, int(opt("--jobs", 3)))) as ex:
        list(ex.map(run, batches))
    print("[earshot-label] XONG %d/%d tieng -> %s" % (len(done), len(ids), sfx_gen.LABELS_FILE))
    if errors:
        print("LOI:\n" + "\n".join("  %s: %s" % kv for kv in sorted(errors.items())))
        sys.exit(1)


if __name__ == "__main__":
    main()
