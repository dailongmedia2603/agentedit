#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DONG BO KHO SFX + MEME + TEXT + NHAC NEN + HIEU UNG tu Cloudflare R2 — CHI qua may chu ban quyen (bucket KHONG con cong khai).

Tac gia (may co token) dung `scripts/publish-library.mjs` day kho + nhan (Gemini) len R2.
May khach: Electron main xin manifest tu may chu ban quyen (ky bang khoa thiet bi, key phai dang kich hoat
dung may nay) -> moi muc co `url` tai tam (token het han sau 2 gio, key bi khoa -> 403 ngay) -> `pull(manifest)`
tai file THIEU / SAI SHA-256 -> GOP vao kho local theo `id`
(muc tren R2 ghi de muc cung id; muc nguoi dung tu them GIU NGUYEN). Nhan (emotion/use_when/tags/
summary) di theo manifest -> may khac KHONG phai goi Gemini lai.

SFX + Meme: 1 muc = 1 file (`file` = ten co ban + `url` tai tam cho chinh file do).
Kho Text: 1 muc = 1 THU MUC nhieu file (`files` = [{path tuong doi, sha256, url}, ...] — template.json,
preview.mp4, fonts/*, audio/*, assets/*) vi 1 mau chu gom nhieu tai nguyen.
Kho hieu ung (fx, 2026-10-05): muc DA DUYET o kho chung (code.js + preview.mp4) — gop bang fx_lib.merge_shared.

An toan du lieu: sao luu library.json truoc khi ghi; tai xong kiem SHA-256 moi nhan; manifest
loi / rong -> KHONG dong nao bi xoa (chi them/cap nhat). `file`/`dir` trong kho luu duong dan TUYET
DOI theo tung may -> pull viet lai theo thu muc local (manifest chi giu ten/duong dan tuong doi).
"""
import os
import time
import shutil
import hashlib

import requests

import engine       # kho SFX: SFX_DIR, SFX_LIB, _load_lib, _save_lib
import meme_lib     # kho meme: MEME_DIR, MEME_LIB, load_lib, save_lib
import text_lib     # kho text: TEXT_DIR, TEXT_LIB, load_lib, save_lib



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


def _merge_kind(entries, media_dir, cur, log):
    """Gop 1 loai (sfx/meme). `cur` = list muc local. Tra ve (list moi, added, updated, errors)."""
    by_id = {e.get("id"): dict(e) for e in cur if e.get("id")}
    added = updated = 0
    errors = []
    for m in entries:
        mid = m.get("id")
        fname = m.get("file")            # manifest luu TEN file (basename)
        url = m.get("url")               # link tai tam do may chu ban quyen cap
        if not mid or not fname or not url:
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
                _download(url, dest, sha)
                if log:
                    log("  tai %s" % fname)
        except Exception as e:
            errors.append("%s: %s" % (fname, str(e)[:120]))
            continue                     # loi tai -> KHONG them muc hong
        row = dict(m)
        row["file"] = dest               # viet lai duong dan tuyet doi theo may nay
        row.pop("sha256", None)          # sha chi dung de kiem, khong luu vao kho
        row.pop("url", None)             # link tai tam, het han -> khong luu
        if mid in by_id:
            updated += 1
        else:
            added += 1
        by_id[mid] = row
    return list(by_id.values()), added, updated, errors


def _safe_relpath(rel):
    """Chuan hoa 1 duong dan TUONG DOI trong manifest text (vd "fonts/Roboto.ttf") -> os.path an toan,
    tu choi duong dan tuyet doi / ".." (tranh ghi ra ngoai thu muc mau khi manifest bi can thiep)."""
    rel = (rel or "").replace("\\", "/")
    parts = [p for p in rel.split("/") if p not in ("", ".")]
    if not parts or any(p == ".." for p in parts) or os.path.isabs(rel):
        return None
    return os.path.join(*parts)


def _merge_texts(entries, texts_dir, cur, log):
    """Gop kho Text: khac sfx/meme, 1 muc la 1 THU MUC NHIEU FILE (`files` = [{path, sha256, url}]).
    1 file trong muc tai loi -> BO CA MUC do (giu ban local cu neu co) de khong luu mau thieu tai nguyen."""
    by_id = {t.get("id"): dict(t) for t in cur if t.get("id")}
    added = updated = 0
    errors = []
    for t in entries:
        tid = t.get("id")
        files = t.get("files") or []
        if not tid or not isinstance(files, list) or not files:
            continue
        if not text_lib.supported(t):
            continue  # mau can ban app moi hon (minApp) — may chu da loc, day la lop chan thu 2
        dest_dir = os.path.join(texts_dir, tid)
        ok = True
        for f in files:
            rel = _safe_relpath(f.get("path"))
            url = f.get("url")
            if rel is None or not url:
                errors.append("%s: file khong hop le (%s)" % (tid, f.get("path")))
                ok = False
                continue
            dest = os.path.join(dest_dir, rel)
            sha = f.get("sha256")
            try:
                if _need_download(dest, sha):
                    _download(url, dest, sha)
                    if log:
                        log("  tai %s/%s" % (tid, rel))
            except Exception as e:
                errors.append("%s/%s: %s" % (tid, f.get("path"), str(e)[:120]))
                ok = False
        if not ok:
            continue             # loi tai 1 file -> KHONG them muc thieu tai nguyen
        row = dict(t)
        row.pop("files", None)   # danh sach file trong manifest, khong luu vao kho
        row["dir"] = dest_dir    # viet lai duong dan tuyet doi theo may nay
        if tid in by_id:
            updated += 1
        else:
            added += 1
        by_id[tid] = row
    return list(by_id.values()), added, updated, errors


def pull(manifest, log=None):
    """Gop kho SFX + Meme + Text tu manifest (da kem link tai) do may chu ban quyen cap. Khong bao gio xoa muc local."""
    if not isinstance(manifest, dict):
        return {"ok": False, "error": "Thieu manifest kho (may chu ban quyen)."}

    if log:
        log("Manifest R2: %d SFX, %d meme, %d mau chu, %d nhac nen" % (
            len(manifest.get("sfx") or []), len(manifest.get("memes") or []), len(manifest.get("texts") or []),
            len(manifest.get("music") or [])))

    # SFX
    sfx_lib = engine._load_lib()
    sfx_new, sfx_add, sfx_upd, sfx_err = _merge_kind(
        manifest.get("sfx") or [], engine.SFX_DIR, sfx_lib.get("sfx", []), log)
    _backup(engine.SFX_LIB)
    sfx_lib["sfx"] = sfx_new
    engine._save_lib(sfx_lib)

    # Meme
    meme_lib_data = meme_lib.load_lib()
    meme_new, meme_add, meme_upd, meme_err = _merge_kind(
        manifest.get("memes") or [], meme_lib.MEME_DIR, meme_lib_data.get("memes", []), log)
    _backup(meme_lib.MEME_LIB)
    meme_lib_data["memes"] = meme_new
    meme_lib.save_lib(meme_lib_data)

    # Text (mau chu dong)
    text_lib_data = text_lib.load_lib()
    text_new, text_add, text_upd, text_err = _merge_texts(
        manifest.get("texts") or [], text_lib.TEXT_DIR, text_lib_data.get("templates", []), log)
    _backup(text_lib.TEXT_LIB)
    text_lib_data["templates"] = text_new
    text_lib.save_lib(text_lib_data)

    # Nhac nen (chi nhac CC0 — duoc phat lai tu do; 1 muc = 1 file nhu SFX). May chu cu khong co khoa "music" -> 0
    import music_lib
    with music_lib._lock:
        music_data = music_lib.load_lib()
        music_new, music_add, music_upd, music_err = _merge_kind(
            manifest.get("music") or [], music_lib.MUSIC_DIR, music_data.get("tracks", []), log)
        if manifest.get("music"):
            # giu chinh rieng cua nguoi dung o may nay (tat bai) khi R2 cap nhat nhan
            cu = {t.get("id"): t for t in music_data.get("tracks", [])}
            for row in music_new:
                old = cu.get(row.get("id"))
                if old is not None and old is not row:
                    for k in ("disabled",):
                        if k in old:
                            row[k] = old[k]
            _backup(music_lib.MUSIC_LIB)
            music_data["tracks"] = music_new
            music_lib.save_lib(music_data)

    # Kho hieu ung chung (muc da duyet; may chu cu khong co khoa "fx" -> khong dong gi toi kho hieu ung)
    fx_res = None
    if isinstance(manifest.get("fx"), list):
        import fx_lib
        _backup(fx_lib.FX_LIB)
        fx_res = fx_lib.merge_shared(manifest["fx"], _download, log=log)

    return {
        "ok": True,
        "sfx": {"added": sfx_add, "updated": sfx_upd, "total": len(sfx_new), "errors": sfx_err},
        "memes": {"added": meme_add, "updated": meme_upd, "total": len(meme_new), "errors": meme_err},
        "texts": {"added": text_add, "updated": text_upd, "total": len(text_new), "errors": text_err},
        "music": {"added": music_add, "updated": music_upd, "total": len(music_new), "errors": music_err},
        "fx": fx_res,
        "manifest_updated": manifest.get("updated"),
    }
