#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tai clip meme tu YouTube (hoac URL truc tiep) ve kho ~/.capcut-studio/memes/.

  <venv_python> meme_fetch.py <file_chua_url> [--cookies-from-browser chrome]
  <venv_python> meme_fetch.py --urls "https://youtu.be/xxx" "https://youtu.be/yyy"

In ra JSON tung dong: {"ok":true,"id":...,"name":...,"file":...} hoac {"ok":false,"url":...,"error":...}
Clip bi gioi han do tuoi can --cookies-from-browser.

Chay bang venv cua engine (co yt-dlp). ffprobe lay tu ffmpeg tren may.
"""
import os
import sys
import json
import subprocess

SIDECAR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SIDECAR)

from meme_lib import MEME_DIR, register_meme, meme_id_for  # noqa: E402

MAX_SECONDS = 60  # clip dai hon thi gan nhu chac chan khong phai meme chen


def _probe(path):
    """Tra (duration, width, height) bang ffprobe; None neu khong doc duoc."""
    ff = None
    for c in (os.path.expanduser("~/.local/bin/ffprobe"), "ffprobe", "/usr/local/bin/ffprobe"):
        try:
            subprocess.run([c, "-version"], capture_output=True, timeout=10)
            ff = c
            break
        except Exception:
            continue
    if not ff:
        return None, None, None
    try:
        p = subprocess.run([ff, "-v", "error", "-select_streams", "v:0",
                            "-show_entries", "stream=width,height:format=duration",
                            "-of", "json", path], capture_output=True, text=True, timeout=30)
        j = json.loads(p.stdout or "{}")
        st = (j.get("streams") or [{}])[0]
        dur = float((j.get("format") or {}).get("duration") or 0)
        return round(dur, 2), st.get("width"), st.get("height")
    except Exception:
        return None, None, None


def fetch(url, cookies_from=None):
    os.makedirs(MEME_DIR, exist_ok=True)
    try:
        from yt_dlp import YoutubeDL
    except ImportError:
        return {"ok": False, "url": url, "error": "Thieu yt-dlp trong venv engine"}

    opts = {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        # uu tien mp4 de trinh phat / Remotion doc thang, khong can remux
        "format": "bv*[ext=mp4][height<=1080]+ba[ext=m4a]/b[ext=mp4]/b",
        "merge_output_format": "mp4",
        "outtmpl": os.path.join(MEME_DIR, "%(id)s.%(ext)s"),
        "restrictfilenames": True,
    }
    if cookies_from:
        opts["cookiesfrombrowser"] = (cookies_from,)
    try:
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            dur = info.get("duration") or 0
            if dur and dur > MAX_SECONDS:
                return {"ok": False, "url": url, "error":
                        "Clip dai %ss (>%ss) — khong giong meme chen, bo qua" % (dur, MAX_SECONDS)}
            info = ydl.extract_info(url, download=True)
            path = ydl.prepare_filename(info)
            if not os.path.isfile(path):
                base = os.path.splitext(path)[0]
                for ext in (".mp4", ".mkv", ".webm"):
                    if os.path.isfile(base + ext):
                        path = base + ext
                        break
    except Exception as e:
        msg = str(e)
        if "Sign in to confirm your age" in msg:
            msg = "Clip gioi han do tuoi — can --cookies-from-browser chrome"
        return {"ok": False, "url": url, "error": msg[:220]}

    d, w, h = _probe(path)
    row = register_meme(
        name=info.get("title") or os.path.basename(path),
        file=path,
        duration=d or (info.get("duration") or 0),
        width=w, height=h,
        source="youtube:%s" % info.get("id", ""),
    )
    return {"ok": True, **row}


def main():
    args = sys.argv[1:]
    cookies = None
    if "--cookies-from-browser" in args:
        i = args.index("--cookies-from-browser")
        cookies = args[i + 1]
        del args[i:i + 2]
    urls = []
    if args and args[0] == "--urls":
        urls = args[1:]
    elif args:
        with open(args[0], encoding="utf-8") as f:
            urls = [l.strip() for l in f if l.strip() and not l.startswith("#")]
    if not urls:
        print(__doc__)
        return 1
    seen, ok, fail = set(), 0, 0
    for u in urls:
        key = meme_id_for(u)
        if key in seen:
            continue
        seen.add(key)
        r = fetch(u, cookies)
        print(json.dumps(r, ensure_ascii=False), flush=True)
        ok, fail = (ok + 1, fail) if r.get("ok") else (ok, fail + 1)
    print("DONE ok=%d fail=%d" % (ok, fail))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
