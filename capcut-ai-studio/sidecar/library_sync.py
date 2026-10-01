#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DONG BO KHO SFX + MEME tu Cloudflare R2 (cong khai, chi TAI ve).

Tac gia (may co token) dung `scripts/publish-library.mjs` day kho + nhan (Gemini) len R2.
May khac: `pull()` tai manifest -> tai file THIEU / SAI SHA-256 -> GOP vao kho local theo `id`
(muc tren R2 ghi de muc cung id; muc nguoi dung tu them GIU NGUYEN). Nhan (emotion/use_when/tags/
summary) di theo manifest -> may khac KHONG phai goi Gemini lai.

An toan du lieu: sao luu library.json truoc khi ghi; tai xong kiem SHA-256 moi nhan; manifest
loi / rong -> KHONG dong nao bi xoa (chi them/cap nhat). `file` trong kho luu duong dan TUYET DOI
theo tung may -> pull viet lai theo thu muc local (manifest chi giu ten file).
"""
import os
import json
import time
import shutil
import hashlib

import requests

import engine       # kho SFX: SFX_DIR, SFX_LIB, _load_lib, _save_lib
import meme_lib     # kho meme: MEME_DIR, MEME_LIB, load_lib, save_lib

HERE = os.path.dirname(os.path.abspath(__file__))


def _cfg():
    """base_url + ten manifest. Uu tien bien moi truong STUDIO_LIBRARY_URL (test)."""
    cfg = {}
    try:
        with open(os.path.join(HERE, "assets", "library_sync.json"), encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception:
        cfg = {}
    base = (os.environ.get("STUDIO_LIBRARY_URL") or cfg.get("base_url") or "").rstrip("/")
    return base, cfg.get("manifest", "library-manifest.json")


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _need_download(dest, sha):
    if not os.path.isfile(dest):
        return True
    if sha and _sha256(dest) != sha:
        return True
    return False


def _download(url, dest, sha=None, tries=3):
    """Tai stream -> .part -> kiem SHA-256 -> doi ten. Sai ma/loi -> nem sau `tries` lan."""
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    last = ""
    for i in range(tries):
        tmp = dest + ".part"
        try:
            with requests.get(url, stream=True, timeout=60) as r:
                r.raise_for_status()
                with open(tmp, "wb") as f:
                    for chunk in r.iter_content(1 << 16):
                        if chunk:
                            f.write(chunk)
            if sha and _sha256(tmp) != sha:
                last = "SHA-256 khong khop"
                os.remove(tmp)
                time.sleep(0.5 * (i + 1))
                continue
            os.replace(tmp, dest)
            return
        except Exception as e:
            last = str(e)[:160]
            try:
                os.path.isfile(tmp) and os.remove(tmp)
            except OSError:
                pass
            time.sleep(0.5 * (i + 1))
    raise RuntimeError("Tai that bai (%s): %s" % (os.path.basename(dest), last))


def _backup(path):
    if os.path.isfile(path):
        try:
            shutil.copy2(path, path + ".bak")
        except OSError:
            pass


def _merge_kind(entries, media_dir, url_prefix, id_key, cur, log):
    """Gop 1 loai (sfx/meme). `cur` = list muc local. Tra ve (list moi, added, updated, errors)."""
    by_id = {e.get("id"): dict(e) for e in cur if e.get("id")}
    added = updated = 0
    errors = []
    for m in entries:
        mid = m.get("id")
        fname = m.get("file")            # manifest luu TEN file (basename)
        if not mid or not fname:
            continue
        fname = os.path.basename(fname)
        local = fname
        if os.name == "nt":
            # ten tao tren macOS co the chua ky tu Windows cam (<>:"|?*) / ket thuc bang dau cham, khoang trang
            local = "".join("_" if c in '<>:"|?*' or ord(c) < 32 else c for c in fname).rstrip(" .") or "file"
        dest = os.path.join(media_dir, local)
        sha = m.get("sha256")
        try:
            if _need_download(dest, sha):
                _download(url_prefix + "/" + requests.utils.quote(fname), dest, sha)
                if log:
                    log("  tai %s" % fname)
        except Exception as e:
            errors.append("%s: %s" % (fname, str(e)[:120]))
            continue                     # loi tai -> KHONG them muc hong
        row = dict(m)
        row["file"] = dest               # viet lai duong dan tuyet doi theo may nay
        row.pop("sha256", None)          # sha chi dung de kiem, khong luu vao kho
        if mid in by_id:
            updated += 1
        else:
            added += 1
        by_id[mid] = row
    return list(by_id.values()), added, updated, errors


def pull(log=None):
    """Tai manifest R2 -> gop kho SFX + Meme. Tra ve summary. Khong bao gio xoa muc local."""
    base, manifest_name = _cfg()
    if not base:
        return {"ok": False, "error": "Chua cau hinh base_url (assets/library_sync.json)."}
    try:
        r = requests.get(base + "/" + manifest_name, timeout=30)
        r.raise_for_status()
        manifest = r.json()
    except Exception as e:
        return {"ok": False, "error": "Khong tai duoc manifest: %s" % (str(e)[:160])}

    if log:
        log("Manifest R2: %d SFX, %d meme" % (len(manifest.get("sfx") or []), len(manifest.get("memes") or [])))

    # SFX
    sfx_lib = engine._load_lib()
    sfx_new, sfx_add, sfx_upd, sfx_err = _merge_kind(
        manifest.get("sfx") or [], engine.SFX_DIR, base + "/sfx", "id", sfx_lib.get("sfx", []), log)
    _backup(engine.SFX_LIB)
    sfx_lib["sfx"] = sfx_new
    engine._save_lib(sfx_lib)

    # Meme
    meme_lib_data = meme_lib.load_lib()
    meme_new, meme_add, meme_upd, meme_err = _merge_kind(
        manifest.get("memes") or [], meme_lib.MEME_DIR, base + "/memes", "id", meme_lib_data.get("memes", []), log)
    _backup(meme_lib.MEME_LIB)
    meme_lib_data["memes"] = meme_new
    meme_lib.save_lib(meme_lib_data)

    return {
        "ok": True,
        "sfx": {"added": sfx_add, "updated": sfx_upd, "total": len(sfx_new), "errors": sfx_err},
        "memes": {"added": meme_add, "updated": meme_upd, "total": len(meme_new), "errors": meme_err},
        "manifest_updated": manifest.get("updated"),
    }
