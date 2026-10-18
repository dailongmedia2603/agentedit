#!/usr/bin/env python3
"""illustrate.py - generate an ILLUSTRATED CAST for a mixed-asset film: one consistent character in several poses, props and
background plates, with the Codex CLI's image_gen tool, then cut the characters / props off their plain background.
(Agent Edit addition, 2026-10-19 - not part of upstream motionmaxxing. Unlike imagegen.py it allows illustrated characters:
stylised 3D / cartoon people that carry a story, never a real or named person.)

Usage:
  python3 illustrate.py cast.json --out assets/img [--jobs 3] [--force] [--only id1,id2] [--model M] [--timeout 600]
  python3 illustrate.py cast.json --dry-run        (prints the waves and exact prompts; spends nothing)
  python3 illustrate.py --cut-only <in.png> <out.png> [--split]
        cut one existing plain-background image (e.g. the user's own picture in inputs/); --split also saves each separate
        subject of a sheet (character turnaround, a row of props) as <out>-1.png, <out>-2.png ... in reading order

cast.json:
  {
    "aspect": "9:16",                      # film frame; plates are generated at this aspect
    "size": [1080, 1920],                  # optional: every plate also gets a cover-cropped <id>@WxH.png
    "style": "one shared line: 3D animated-feature look, soft studio key light, warm saturated palette, clean shapes",
    "items": [
      {"id": "hero",       "kind": "character", "prompt": "young man, round glasses, mustard hoodie, full body, standing, neutral"},
      {"id": "hero-tired", "kind": "character", "prompt": "the same man slumped at a desk, eyes half closed", "refs": ["hero"]},
      {"id": "alarm",      "kind": "prop",      "prompt": "a red twin-bell alarm clock"},
      {"id": "room-night", "kind": "plate",     "prompt": "small bedroom at night, desk by the window, cold blue moonlight"}
    ]
  }
  kind: character | prop  -> full subject centred on a flat pure-white background, then cut out to <out>/cut/<id>.png (RGBA,
                             trimmed). The raw image stays at <out>/<id>.png.
        plate             -> full-bleed background at the film aspect (no characters unless the prompt asks), <out>/<id>.png.
  refs: ids of EARLIER items (the generated image is attached) or image file paths (e.g. inputs/logo.png). An item waits for
        the items it references, so generate one anchor character first and give every pose "refs": ["<anchor id>"] - that is
        what keeps the face, hair and clothes identical across shots.

Output: <out>/<id>.png, <out>/cut/<id>.png for cut-outs, <out>/illustrate.json (records) and <out>/cast-sheet.jpg (every result
on a checkerboard - LOOK at it before building: identity drift, cropped limbs, white fringes, a missing hole between arm and body).
Exit: 0 every requested item exists, 1 an item failed, 2 bad usage / no codex.
Only numpy + Pillow + ffmpeg/ffprobe are needed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

NO_TEXT = ("No text, letters, numbers, words, captions, logos, watermarks, signatures or user-interface elements anywhere in the "
           "image (typography is added later in code).")
WHITE_BG = ("Background: one perfectly flat, uniform pure white #FFFFFF background filling the whole canvas - no floor, no "
            "horizon, no cast shadow, no vignette, no gradient. The subject is complete (no cropped head, hands or feet), centred, "
            "with a clear margin on every side, and does not touch the edges.")
REAL_PERSON = re.compile(r"\b(photo(graph)?\s+of\s+(a\s+)?real|real person|celebrity|famous|lookalike|look-alike|portrait of [A-Z][a-z]+ [A-Z])", re.I)


def die(msg: str, code: int = 2):
    print("illustrate.py: " + msg, file=sys.stderr)
    sys.exit(code)


def md5(p: Path) -> str:
    h = hashlib.md5()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ------------------------------------------------------------------------------------------------------------- prompts
def build_prompt(it: dict, cfg: dict, dest: Path, has_refs: bool) -> str:
    kind = it.get("kind", "prop")
    aspect = it.get("aspect") or ("2:3" if kind == "character" else "1:1" if kind == "prop" else cfg.get("aspect", "9:16"))
    spec = ["Primary request: %s" % it["prompt"].strip()]
    if cfg.get("style"):
        spec.append("Shared look (match exactly across the whole set): %s" % cfg["style"].strip())
    if kind == "character":
        spec.append("Asset: one illustrated character (stylised, not a photo of a real person) for a motion-graphics film; it "
                    "will be cut out and composited over a separate background.")
        spec.append(WHITE_BG)
    elif kind == "prop":
        spec.append("Asset: one object for a motion-graphics film; it will be cut out and composited.")
        spec.append(WHITE_BG)
    else:
        spec.append("Asset: a full-bleed background plate for a %s motion-graphics film. Leave calm space where a character "
                    "and captions will be placed; nothing important at the very edges." % aspect)
    spec.append("Aspect ratio: %s." % aspect)
    spec.append("Constraints: " + NO_TEXT)
    if it.get("avoid"):
        spec.append("Avoid: %s" % it["avoid"])
    refs = ""
    if has_refs:
        refs = (" The attached image(s) are references: keep the SAME character identity (face, hair, glasses, body shape, "
                "clothes, colours) and the same rendering style; change only what the request asks (pose, expression, action).")
    return ("Use your built-in image_gen tool to generate exactly ONE image from the spec below.%s Then copy the generated PNG "
            "to %s (absolute path; overwrite if present) and print that path. Do not write any other files.\n\n%s"
            % (refs, dest, "\n".join(spec)))


# ------------------------------------------------------------------------------------------------------------- codex
CODEX_IMAGES = Path.home() / ".codex" / "generated_images"


def newest_codex_image(since: float, session: str | None):
    if not session:
        return None
    root = CODEX_IMAGES / session
    if not root.is_dir():
        return None
    files = [f for f in root.rglob("*.png") if f.stat().st_mtime >= since - 1]
    return max(files, key=lambda f: f.stat().st_mtime) if files else None


def run_codex(prompt: str, refs: list, wd: Path, target: Path, model: str | None, timeout: int):
    """codex exec with the prompt on stdin (refs after '-'); watch for the image instead of waiting for exit (codex sometimes
    lingers after saving). Returns (png or None, exit code, log tail)."""
    exe = shutil.which("codex")
    argv = [exe, "exec", "--skip-git-repo-check", "--enable", "image_generation", "--sandbox", "workspace-write",
            "--color", "never", "-C", str(wd)]
    if model:
        argv += ["-m", model]
    argv.append("-")
    for r in refs:
        argv += ["-i", r]
    t0 = time.time()
    p = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                         cwd=str(wd), start_new_session=(os.name != "nt"))
    lines: list = []
    th = threading.Thread(target=lambda: [lines.append(ln) for ln in p.stdout], daemon=True)
    th.start()
    try:
        p.stdin.write(prompt)
        p.stdin.close()
    except OSError:
        pass
    session, found, seen_at, last = None, None, None, -1
    while True:
        if session is None:
            m = re.search(r"session id:\s*([0-9a-fA-F-]{36})", "".join(lines[:60]))
            session = m.group(1) if m else None
        cand = target if target.is_file() else newest_codex_image(t0, session)
        if cand:
            sz = cand.stat().st_size
            if sz > 0 and sz == last:
                found = found or cand
                seen_at = seen_at or time.time()
            last = sz
        if p.poll() is not None:
            break
        if found and time.time() - seen_at > (3 if found == target else 20):
            break
        if time.time() - t0 > timeout:
            break
        time.sleep(1)
    rc = p.poll()
    if rc is None:
        try:
            if os.name != "nt":
                os.killpg(p.pid, 9)
            else:
                subprocess.run(["taskkill", "/T", "/F", "/PID", str(p.pid)], capture_output=True)
        except OSError:
            p.kill()
        rc = -9
    th.join(timeout=2)
    if not found:
        found = target if target.is_file() else newest_codex_image(t0, session)
    return found, rc, "".join(lines)[-1500:]


# ------------------------------------------------------------------------------------------------------------- cut-out
def cut_out(src: Path, dst: Path, tol: int = 14) -> dict:
    """Plain light background -> alpha. Flood fill from the border over near-background pixels (exact connected region, Pillow's
    C flood fill), then large flat enclosed background pockets (between an arm and the body), then a soft 1-2 px edge from how
    close each edge pixel is to the background colour. A PNG that already has real transparency is only trimmed."""
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter

    im = Image.open(src)
    if im.mode in ("RGBA", "LA") or "transparency" in im.info:
        rgba = im.convert("RGBA")
        a = np.asarray(rgba)[:, :, 3]
        if (a < 16).mean() > 0.05:
            return _trim_save(rgba, dst, "alpha")
    rgb = np.asarray(im.convert("RGB")).astype(np.int16)
    h, w = rgb.shape[:2]
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bgc = np.median(border, axis=0)                              # the background colour actually used (white / light grey)
    dist = np.abs(rgb - bgc).max(axis=2)                          # Chebyshev distance to the background colour
    near = (dist <= tol).astype(np.uint8) * 255
    lab = Image.fromarray(near, "L").copy()   # copy: fromarray shares the read-only numpy buffer
    draw_seeds = [(x, 0) for x in range(0, w, 7)] + [(x, h - 1) for x in range(0, w, 7)] + \
                 [(0, y) for y in range(0, h, 7)] + [(w - 1, y) for y in range(0, h, 7)]
    for (x, y) in draw_seeds:
        if lab.getpixel((x, y)) == 255:
            ImageDraw.floodfill(lab, (x, y), 128, thresh=0)
    arr = np.asarray(lab).copy()
    bg = arr == 128
    # enclosed pockets: flat, very close to the background colour, not tiny
    min_area = max(250, int(h * w * 0.0006))
    tries = 0
    while tries < 600:
        ys, xs = np.nonzero(arr == 255)
        if not len(ys):
            break
        tries += 1
        y, x = int(ys[0]), int(xs[0])
        lab2 = Image.fromarray(arr, "L").copy()
        ImageDraw.floodfill(lab2, (x, y), 64, thresh=0)
        a2 = np.asarray(lab2)
        reg = a2 == 64
        area = int(reg.sum())
        flat = area >= min_area and float(dist[reg].mean()) <= tol * 0.45 and float(rgb[reg].std()) < 4.0
        arr = a2.copy()
        arr[reg] = 128 if flat else 32
        if flat:
            bg |= reg
    alpha = np.where(bg, 0.0, 1.0)
    # soft edge: object pixels touching the background get alpha by their distance to the background colour
    bgimg = Image.fromarray((bg * 255).astype(np.uint8), "L").filter(ImageFilter.MaxFilter(3))
    edge = (np.asarray(bgimg) > 0) & ~bg
    soft = np.clip((dist - tol) / 60.0, 0.0, 1.0)
    alpha[edge] = np.minimum(alpha[edge], np.maximum(soft[edge], 0.15))
    a8 = Image.fromarray((alpha * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.6))
    # de-fringe: pull edge colours away from the background colour
    out = rgb.astype(np.float32)
    af = np.asarray(a8).astype(np.float32)[:, :, None] / 255.0
    m = (af > 0.02) & (af < 0.98)
    unmixed = (out - (1 - af) * bgc) / np.maximum(af, 0.02)
    out = np.where(m, np.clip(unmixed, 0, 255), out)
    rgba = Image.fromarray(out.astype(np.uint8), "RGB").convert("RGBA")
    rgba.putalpha(a8)
    return _trim_save(rgba, dst, "flood-fill bg %s" % ",".join(str(int(v)) for v in bgc))


def _trim_save(rgba, dst: Path, how: str) -> dict:
    bbox = rgba.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox:
        pad = 8
        x0, y0, x1, y1 = bbox
        rgba = rgba.crop((max(0, x0 - pad), max(0, y0 - pad), min(rgba.width, x1 + pad), min(rgba.height, y1 + pad)))
    dst.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(dst)
    import numpy as np
    a = np.asarray(rgba.getchannel("A"))
    rec = {"cut": str(dst), "cut_size": [rgba.width, rgba.height], "how": how, "opaque_share": round(float((a > 250).mean()), 3)}
    if rec["opaque_share"] < 0.05:
        rec["warning"] = "cut-out is almost empty - background colour too close to the subject? check by eye"
    return rec


def split_parts(cut: Path, max_parts: int = 24) -> list:
    """A sheet with several subjects (a character turnaround, a row of props) -> one trimmed PNG per subject:
    <stem>-1.png, <stem>-2.png ... in reading order (top-to-bottom rows, then left-to-right). Parts smaller than 1.5 % of the
    opaque area (stray specks, steam wisps) stay with nothing."""
    import numpy as np
    from PIL import Image, ImageDraw
    rgba = Image.open(cut).convert("RGBA")
    a = np.asarray(rgba.getchannel("A"))
    mask = ((a > 8) * 255).astype(np.uint8)
    # close small gaps (steam above a cup, a sparkle next to the moon) so one object stays one part
    from PIL import ImageFilter
    lab = Image.fromarray(mask, "L").filter(ImageFilter.MaxFilter(9)).copy()
    arr = np.asarray(lab).copy()
    total = max(1, int((mask > 0).sum()))
    parts = []
    for _ in range(400):
        ys, xs = np.nonzero(arr == 255)
        if not len(ys):
            break
        im2 = Image.fromarray(arr, "L").copy()
        ImageDraw.floodfill(im2, (int(xs[0]), int(ys[0])), 100, thresh=0)
        a2 = np.asarray(im2)
        reg = a2 == 100
        arr = a2.copy()
        arr[reg] = 50
        area = int((reg & (mask > 0)).sum())
        if area >= total * 0.015:
            yy, xx = np.nonzero(reg)
            parts.append((reg, (int(xx.min()), int(yy.min()), int(xx.max()) + 1, int(yy.max()) + 1)))
    if len(parts) > max_parts:
        parts = sorted(parts, key=lambda p: -(p[1][2] - p[1][0]) * (p[1][3] - p[1][1]))[:max_parts]
    # reading order: group by rows (centre y within half the median height)
    if parts:
        hs = sorted(p[1][3] - p[1][1] for p in parts)
        row_h = max(1, hs[len(hs) // 2] // 2)
        parts.sort(key=lambda p: (((p[1][1] + p[1][3]) // 2) // row_h, p[1][0]))
    out = []
    src = np.asarray(rgba)
    for i, (reg, (x0, y0, x1, y1)) in enumerate(parts, 1):
        piece = src.copy()
        piece[~reg, 3] = 0
        img = Image.fromarray(piece, "RGBA").crop((x0, y0, x1, y1))
        dst = cut.with_name("%s-%d.png" % (cut.stem, i))
        out.append(_trim_save(img, dst, "part %d of %s" % (i, cut.name)))
    return out


def cover_crop(src: Path, dst: Path, w: int, h: int) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf",
                    "scale=%d:%d:force_original_aspect_ratio=increase:flags=lanczos,crop=%d:%d" % (w, h, w, h), str(dst)], check=True)


def contact_sheet(recs: list, out: Path, dest: Path) -> None:
    from PIL import Image, ImageDraw
    tiles = []
    for r in recs:
        p = Path(r.get("cut") or out / ("%s.png" % r["id"]))
        if p.is_file():
            tiles.append((r["id"], p))
    if not tiles:
        return
    T, cols = 300, min(4, len(tiles))
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * T, rows * (T + 24)), (255, 255, 255))
    chk = Image.new("RGB", (T, T), (235, 235, 235))
    d = ImageDraw.Draw(chk)
    for y in range(0, T, 20):
        for x in range(0, T, 20):
            if (x // 20 + y // 20) % 2:
                d.rectangle([x, y, x + 19, y + 19], fill=(200, 200, 200))
    dd = ImageDraw.Draw(sheet)
    for i, (name, p) in enumerate(tiles):
        im = Image.open(p).convert("RGBA")
        im.thumbnail((T - 10, T - 10))
        tile = chk.copy()
        tile.paste(im, ((T - im.width) // 2, (T - im.height) // 2), im)
        x, y = (i % cols) * T, (i // cols) * (T + 24)
        sheet.paste(tile, (x, y))
        dd.text((x + 6, y + T + 5), name, fill=(20, 20, 20))
    sheet.save(dest, quality=85)


# ------------------------------------------------------------------------------------------------------------- main
def waves(items: list) -> list:
    ids = {it["id"] for it in items}
    done: set = set()
    left = list(items)
    out = []
    while left:
        ready = [it for it in left if all((r not in ids) or (r in done) for r in it.get("refs", []))]
        if not ready:
            die("refs form a cycle: " + ", ".join(it["id"] for it in left))
        out.append(ready)
        done |= {it["id"] for it in ready}
        left = [it for it in left if it not in ready]
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cast", nargs="?")
    ap.add_argument("--out", default="assets/img")
    ap.add_argument("--jobs", type=int, default=3)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default="")
    ap.add_argument("--model", default=os.environ.get("AE_IMAGE_MODEL") or None)
    ap.add_argument("--timeout", type=int, default=600)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--cut-only", nargs=2, metavar=("IN", "OUT"))
    ap.add_argument("--split", action="store_true", help="with --cut-only: also save every separate subject as OUT-<n>.png")
    args = ap.parse_args()

    if args.cut_only:
        rec = cut_out(Path(args.cut_only[0]), Path(args.cut_only[1]))
        if args.split:
            rec["parts"] = split_parts(Path(args.cut_only[1]))
        print(json.dumps(rec, ensure_ascii=False, indent=1))
        return 0
    if not args.cast:
        die("missing cast.json (see --help)")
    cfg = json.loads(Path(args.cast).read_text(encoding="utf-8"))
    items = cfg.get("items") or []
    if not items:
        die("cast.json has no items")
    seen_ids = set()
    for it in items:
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,60}", str(it.get("id", ""))) or not str(it.get("prompt", "")).strip():
            die("every item needs an id ([A-Za-z0-9_.-]) and a prompt: %r" % it)
        if it["id"] in seen_ids:
            die("duplicate id " + it["id"])
        seen_ids.add(it["id"])
        if it.get("kind", "prop") not in ("character", "prop", "plate"):
            die("kind must be character | prop | plate: " + it["id"])
        if REAL_PERSON.search(it["prompt"]):
            die("item %s asks for a real / famous person - describe an invented character instead" % it["id"])
    out = Path(args.out).resolve()
    only = {s for s in args.only.split(",") if s}
    plan = waves(items)
    if args.dry_run:
        for n, wave in enumerate(plan, 1):
            print("=== wave %d: %s" % (n, ", ".join(it["id"] for it in wave)))
            for it in wave:
                print("\n--- %s (%s) refs=%s\n%s" % (it["id"], it.get("kind", "prop"), it.get("refs", []),
                                                    build_prompt(it, cfg, out / ("%s.png" % it["id"]), bool(it.get("refs")))))
        return 0
    if not shutil.which("codex"):
        die("codex not on PATH: no image provider (use the user's images in inputs/ with --cut-only, or a code-drawn plan)")
    out.mkdir(parents=True, exist_ok=True)
    work_root = Path(tempfile.mkdtemp(prefix="illustrate-"))
    lock = threading.Lock()
    hashes: dict = {}
    recs: dict = {}

    def ref_paths(it: dict) -> list:
        res = []
        for r in it.get("refs", []):
            p = out / ("%s.png" % r) if r in seen_ids else Path(r)
            if p.is_file():
                res.append(str(p.resolve()))
            else:
                print("warn: %s: ref %s not found, skipped" % (it["id"], r), file=sys.stderr)
        return res[:4]

    def make(it: dict) -> dict:
        dest = out / ("%s.png" % it["id"])
        rec = {"id": it["id"], "kind": it.get("kind", "prop"), "prompt": it["prompt"], "refs": it.get("refs", [])}
        t0 = time.time()
        if dest.is_file() and not args.force and (not only or it["id"] not in only):
            rec["status"] = "cached"
        else:
            refs = ref_paths(it)
            wd = Path(tempfile.mkdtemp(prefix=it["id"] + "-", dir=str(work_root)))
            target = wd / "result.png"
            res, code, log = None, 0, ""
            for attempt in range(2):
                res, code, log = run_codex(build_prompt(it, cfg, target, bool(refs)), refs, wd, target, args.model, args.timeout)
                if res:
                    break
            rec.update(seconds=round(time.time() - t0), exit=code)
            if not res:
                rec.update(status="failed", log=log[-600:])
                return rec
            digest = md5(Path(res))
            with lock:
                clash = hashes.get(digest)
                if clash and clash != it["id"]:
                    rec.update(status="failed", log="COLLISION: identical bytes to %s; re-run with --force --only %s" % (clash, it["id"]))
                    return rec
                hashes[digest] = it["id"]
            shutil.copy2(str(res), str(dest))
            rec["status"] = "generated"
        if rec["kind"] in ("character", "prop"):
            try:
                rec.update(cut_out(dest, out / "cut" / ("%s.png" % it["id"])))
            except Exception as e:  # noqa: BLE001 - one bad cut must not lose the other images
                rec["warning"] = "cut-out failed: %s" % e
        elif cfg.get("size"):
            w, h = cfg["size"]
            framed = out / ("%s@%dx%d.png" % (it["id"], w, h))
            cover_crop(dest, framed, w, h)
            rec["framed"] = framed.name
        return rec

    try:
        for wave in plan:
            todo = [it for it in wave if not only or it["id"] in only or not (out / ("%s.png" % it["id"])).is_file()]
            skip = [it for it in wave if it not in todo]
            for it in skip:
                recs[it["id"]] = make(it)
            with ThreadPoolExecutor(max_workers=max(1, min(args.jobs, 4))) as ex:
                for r in ex.map(make, todo):
                    recs[r["id"]] = r
                    print("%-22s %-9s %-10s %s" % (r["id"], r["kind"], r.get("status"), r.get("cut") or r.get("framed") or r.get("log", "")[-160:]))
    finally:
        shutil.rmtree(work_root, ignore_errors=True)
    ordered = [recs[it["id"]] for it in items if it["id"] in recs]
    (out / "illustrate.json").write_text(json.dumps(ordered, ensure_ascii=False, indent=1), encoding="utf-8")
    try:
        contact_sheet(ordered, out, out / "cast-sheet.jpg")
        print("contact sheet: %s" % (out / "cast-sheet.jpg"))
    except Exception as e:  # noqa: BLE001
        print("warn: contact sheet failed: %s" % e, file=sys.stderr)
    failed = [r["id"] for r in ordered if r.get("status") == "failed"]
    if failed:
        print("FAILED: " + ", ".join(failed), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
