#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sinh media qua Plenxai API (GPT-image-2 cho ANH + chu, Veo/Seedance cho VIDEO).
Submit -> poll /status -> tai result_url ve file. Chay bang VENV (co requests).

API key doc tu: env PLENXAI_API_KEY  HOAC  ~/.capcut-studio/secrets.json {"plenxai_api_key": "..."}

ANH:
  <venv> plenxai_gen.py image --prompt "..." --out path.png [--model gpt-image-2] [--aspect 9:16] [--res high] [--ref URL ...] [--neg "..."]
VIDEO (b-roll):
  <venv> plenxai_gen.py video --prompt "..." --out path.mp4 [--model veo-3-fast] [--aspect 9:16] [--duration 4] [--quality 720p] [--img START_URL]

LUU Y: chu tieng Viet -> gpt-image-2 render kha tot; van nen kiem tra. Anh ton credits.
"""
import os, json, time, argparse

BASE = "https://plenxai.com/api/v1/developer"

def api_key():
    k = os.environ.get("PLENXAI_API_KEY")
    if k: return k
    p = os.path.expanduser("~/.capcut-studio/secrets.json")
    if os.path.isfile(p):
        try: return json.load(open(p)).get("plenxai_api_key")
        except Exception: pass
    raise SystemExit("Thieu API key: set PLENXAI_API_KEY hoac ~/.capcut-studio/secrets.json")

def _req(method, url, key, body=None):
    import requests
    h = {"X-API-Key": key, "Content-Type": "application/json"}
    r = requests.post(url, headers=h, json=body, timeout=60) if method == "POST" else requests.get(url, headers=h, timeout=60)
    try: data = r.json()
    except Exception: raise SystemExit("Loi API (%s): %s" % (r.status_code, r.text[:300]))
    return r.status_code, data

def submit(kind, key, body):
    ep = "/generate/image" if kind == "image" else "/generate/video"
    sc, d = _req("POST", BASE + ep, key, body)
    if not d.get("success"):
        raise SystemExit("Submit fail: " + json.dumps(d, ensure_ascii=False))
    return d["task_id"]

def poll(task_id, key, kind):
    interval = 4 if kind == "image" else 10
    waited, limit = 0, (240 if kind == "image" else 600)
    while waited < limit:
        sc, d = _req("GET", BASE + "/status/" + task_id, key)
        st = d.get("status")
        print("  status=%s (%ds)" % (st, waited), flush=True)
        if st in ("succeeded", "completed", "success"):
            return d.get("result_url") or d.get("output_url")
        if st in ("failed", "error"):
            raise SystemExit("Task failed: " + json.dumps(d, ensure_ascii=False))
        time.sleep(interval); waited += interval
    raise SystemExit("Timeout cho task " + task_id)

def download(url, out):
    import requests
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    # CDN (Cloudflare) chan UA mac dinh cua urllib -> dung UA trinh duyet
    h = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"}
    r = requests.get(url, headers=h, timeout=120)
    r.raise_for_status()
    with open(out, "wb") as f:
        f.write(r.content)
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kind", choices=["image", "video"])
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model")
    ap.add_argument("--aspect", default="9:16")
    ap.add_argument("--res", default="high")          # image: low/medium/high
    ap.add_argument("--neg")
    ap.add_argument("--ref", nargs="*")
    ap.add_argument("--duration", type=int, default=4)  # video
    ap.add_argument("--quality", default="720p")        # video
    ap.add_argument("--img")                            # video i2v start image url
    a = ap.parse_args()
    key = api_key()

    if a.kind == "image":
        body = {"prompt": a.prompt, "model": a.model or "gpt-image-2",
                "resolution": a.res, "aspect_ratio": a.aspect}
        if a.neg: body["negative_prompt"] = a.neg
        if a.ref: body["references_urls"] = a.ref
    else:
        body = {"prompt": a.prompt, "model": a.model or "veo-3-fast",
                "mode": "i2v" if a.img else "t2v", "aspect_ratio": a.aspect,
                "duration": a.duration, "quality": a.quality}
        if a.img: body["start_image_url"] = a.img

    print("Submit %s: %s" % (a.kind, body.get("model")), flush=True)
    tid = submit(a.kind, key, body)
    print("task_id=" + tid, flush=True)
    url = poll(tid, key, a.kind)
    out = download(url, a.out)
    print("RESULT_URL=" + url)
    print("SAVED=" + os.path.abspath(out) + " (%d bytes)" % os.path.getsize(out))

if __name__ == "__main__":
    main()
