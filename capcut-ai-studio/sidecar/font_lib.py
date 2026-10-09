#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""KHO FONT TAI LEN (user 2026-10-09): font thuong hieu (font mua...) -> AI lap plan + dung video DUNG font do.

Hai noi tai len:
  - Tai nguyen > Font, o MAY CHU (co ~/.capcut-studio/r2-publish.json): scope "shared" -> day len R2 (fonts/<id>/<file>
    + fonts-manifest.json) -> may khac nhan qua dong bo kho (library_sync -> merge_shared). May khac khong co token
    -> trang nay tai len "local".
  - Tao video > Brand Guideline > Typography: scope "local" — CHI may nay, KHONG BAO GIO len R2.
Ca hai luu thanh BO FONT (1 ho chu = 1 muc, nhieu file: Regular / Bold / Italic...) de cac video sau chon lai.

Dung font: Brand Guideline luu `fonts` = [id] (font dau = tieu de / chu nhan, font cuoi = noi dung / phu de)
-> brand_guide ep moi chu dung font do; build_spec ghi spec["fonts"] (duong dan file) -> Remotion nap bang FontFace
qua may chu media cuc bo (ca Player lan render). Font ngoai danh muc 13 font dong goi -> id "uf_<bam>", ho CSS
"UF <id>" (khong dung ten that: may co the da cai font cung ten khac phien ban).

Doc font khong can fontTools (Python nhung khong co): tu doc bang sfnt (TTF / OTF / WOFF): ten ho, do dam, nghieng,
du dau tieng Viet khong (cmap), be rong trung binh (hmtx) de code uoc luong ngat dong nhu font co san.
"""
import hashlib
import json
import os
import re
import shutil
import struct
import threading
import time
import unicodedata
import zlib

HOME = os.path.expanduser("~")
ENGINE_HOME = os.path.join(HOME, ".capcut-studio")
FONT_DIR = os.path.join(ENGINE_HOME, "fonts")
FONT_LIB = os.path.join(ENGINE_HOME, "font_library.json")
R2_CREDS = os.path.join(ENGINE_HOME, "r2-publish.json")
R2_MANIFEST = "fonts-manifest.json"

EXTS = (".ttf", ".otf", ".woff")
MAX_FILE = 30 * 1024 * 1024
MAX_FILES_PER_FONT = 24
SCOPES = ("local", "shared")

_lock = threading.RLock()


class FontError(ValueError):
    pass


# ---------------------------------------------------------------------------
# Doc file font (sfnt)
# ---------------------------------------------------------------------------
def _u16(b, o):
    return struct.unpack_from(">H", b, o)[0]


def _i16(b, o):
    return struct.unpack_from(">h", b, o)[0]


def _u32(b, o):
    return struct.unpack_from(">I", b, o)[0]


def _tables(data):
    """bytes file -> {tag: bytes bang}. TTF / OTF / WOFF; TTC / WOFF2 -> FontError (noi ro cach doi)."""
    sig = data[:4]
    if sig == b"wOF2":
        raise FontError("File .woff2 chưa hỗ trợ — dùng bản .ttf hoặc .otf của font.")
    if sig == b"ttcf":
        raise FontError("File .ttc (gộp nhiều font) chưa hỗ trợ — dùng từng file .ttf / .otf.")
    out = {}
    try:
        if sig == b"wOFF":
            n = _u16(data, 12)
            for i in range(n):
                o = 44 + 20 * i
                tag = data[o:o + 4].decode("latin-1")
                off, clen, olen = _u32(data, o + 4), _u32(data, o + 8), _u32(data, o + 12)
                raw = data[off:off + clen]
                out[tag] = zlib.decompress(raw) if clen < olen else raw
        elif sig in (b"\x00\x01\x00\x00", b"OTTO", b"true"):
            n = _u16(data, 4)
            for i in range(n):
                o = 12 + 16 * i
                tag = data[o:o + 4].decode("latin-1")
                off, ln = _u32(data, o + 8), _u32(data, o + 12)
                out[tag] = data[off:off + ln]
        else:
            raise FontError("Không phải file font hợp lệ (cần .ttf / .otf / .woff).")
    except (struct.error, zlib.error) as e:
        raise FontError("File font bị hỏng (%s)." % str(e)[:80])
    for need in ("cmap", "head", "hhea", "hmtx", "name"):
        if need not in out:
            raise FontError("File font thiếu bảng %s — không dùng được." % need)
    return out


def _names(t):
    """bang name -> {nameID: chuoi} (uu tien Windows tieng Anh, roi Windows bat ky, roi Mac Roman)."""
    b = t["name"]
    count, soff = _u16(b, 2), _u16(b, 4)
    best = {}
    for i in range(count):
        o = 6 + 12 * i
        pid, eid, lid, nid, ln, off = struct.unpack_from(">HHHHHH", b, o)
        raw = b[soff + off:soff + off + ln]
        if pid == 3 or pid == 0:
            try:
                s = raw.decode("utf-16-be")
            except UnicodeDecodeError:
                continue
            rank = 0 if (pid == 3 and lid == 0x409) else 1
        elif pid == 1 and eid == 0:
            s = raw.decode("mac_roman", "replace")
            rank = 2
        else:
            continue
        s = s.strip().strip("\x00")
        if s and (nid not in best or rank < best[nid][0]):
            best[nid] = (rank, s)
    return {k: v[1] for k, v in best.items()}


def _cmap_lookup(t):
    """bang cmap -> ham ma ky tu -> chi so glyph (0 = khong co)."""
    b = t["cmap"]
    n = _u16(b, 2)
    subs = {}
    for i in range(n):
        pid, eid, off = struct.unpack_from(">HHI", b, 4 + 8 * i)
        fmt = _u16(b, off)
        subs[(pid, eid, fmt)] = off
    pick = None
    for key in ((3, 10, 12), (0, 4, 12), (0, 6, 12), (3, 1, 4), (0, 3, 4), (0, 4, 4), (0, 1, 4), (0, 0, 4)):
        if key in subs:
            pick = key
            break
    if pick is None:
        raise FontError("Font không có bảng mã Unicode (cmap) — không dùng được.")
    off = subs[pick]
    if pick[2] == 12:
        ng = _u32(b, off + 12)
        groups = [struct.unpack_from(">III", b, off + 16 + 12 * i) for i in range(ng)]

        def look(c):
            for s, e, g in groups:
                if s <= c <= e:
                    return g + (c - s)
            return 0
        return look
    seg = _u16(b, off + 6) // 2
    ends = off + 14
    starts = ends + 2 * seg + 2
    deltas = starts + 2 * seg
    ranges = deltas + 2 * seg

    def look4(c):
        if c > 0xFFFF:
            return 0
        for i in range(seg):
            if c <= _u16(b, ends + 2 * i):
                s = _u16(b, starts + 2 * i)
                if c < s:
                    return 0
                d, ro = _i16(b, deltas + 2 * i), _u16(b, ranges + 2 * i)
                if ro == 0:
                    return (c + d) & 0xFFFF
                g = _u16(b, ranges + 2 * i + ro + 2 * (c - s))
                return (g + d) & 0xFFFF if g else 0
        return 0
    return look4


def _vi_chars():
    """Moi chu cai tieng Viet (thuong + hoa, du 5 dau thanh) — dang dung san (NFC)."""
    out = ["đ", "Đ"]
    for base in "aăâeêioôơuưy":
        for m in ("", "̀", "́", "̉", "̃", "̣"):
            ch = unicodedata.normalize("NFC", base + m)
            out += [ch, ch.upper()]
    return sorted(set(out))


VI_CHARS = _vi_chars()
# Cau mau do be rong (chu thuong + hoa + so + khoang trang nhu phu de that). He so WIDTH_K khop be rong khai trong
# remotion-src/fonts.ts cua font dong goi (do o tests/test_font_lib.py) -> uoc luong ngat dong cung thang do.
WIDTH_SAMPLE = "Tiếng Việt rất đẹp khi dùng đúng phông chữ GIẢM GIÁ 50% hôm nay"
WIDTH_K = 1.13          # do 2026-10-09: 12 font dong goi, ti le khai / do = 1.07-1.28, trung vi 1.12


_STYLE_WORDS = re.compile(
    r"(?:[\s_-]+(?:thin|hairline|extra[\s-]?light|ultra[\s-]?light|light|book|regular|normal|medium|semi[\s-]?bold|"
    r"demi[\s-]?bold|bold|extra[\s-]?bold|ultra[\s-]?bold|black|heavy|extra[\s-]?black|ultra[\s-]?black|italic|oblique))+$",
    re.I)


def _strip_style(name):
    """Ten ho cu (nameID 1, khong co nameID 16) hay kem do dam ("Roboto Black", "Brand Sans Bold Italic") -> bo phan do dam
    de cac file cung bo gop 1 muc. Bo het thanh rong -> giu nguyen."""
    if not name:
        return name
    out = _STYLE_WORDS.sub("", name).strip()
    return out or name


def inspect(path):
    """File font -> thong tin (ten ho, kieu, do dam, nghieng, thieu dau tieng Viet, be rong). Loi -> FontError."""
    ext = os.path.splitext(path)[1].lower()
    if ext not in EXTS and ext != ".woff2" and ext != ".ttc":
        raise FontError("Chỉ nhận file font .ttf / .otf / .woff.")
    try:
        size = os.path.getsize(path)
    except OSError:
        raise FontError("Không đọc được file.")
    if size > MAX_FILE:
        raise FontError("File font quá lớn (> %d MB)." % (MAX_FILE // (1024 * 1024)))
    with open(path, "rb") as f:
        data = f.read()
    t = _tables(data)
    names = _names(t)
    family = names.get(16) or _strip_style(names.get(1)) or os.path.splitext(os.path.basename(path))[0]
    sub = names.get(17) or names.get(2) or "Regular"
    head = t["head"]
    upem = _u16(head, 18) or 1000
    mac_style = _u16(head, 44)
    weight, italic = None, bool(mac_style & 2)
    os2 = t.get("OS/2")
    if os2 and len(os2) >= 64:
        weight = _u16(os2, 4)
        italic = italic or bool(_u16(os2, 62) & 1)
    if not weight or not (1 <= weight <= 1000):
        weight = 700 if mac_style & 1 else 400
    if re.search(r"italic|oblique|nghiêng", sub, re.I):
        italic = True
    weight = int(min(900, max(100, round(weight / 100.0) * 100)))
    look = _cmap_lookup(t)
    missing = [c for c in VI_CHARS if not look(ord(c))]
    nhm = _u16(t["hhea"], 34)
    hmtx = t["hmtx"]

    def adv(c):
        g = look(ord(c))
        if not g and c != " ":
            g = look(ord(unicodedata.normalize("NFD", c)[0]))   # chu co dau thieu -> do theo chu goc
        i = min(g, nhm - 1) if nhm else 0
        return _u16(hmtx, 4 * i) if 4 * i + 2 <= len(hmtx) else upem * 0.5
    width = sum(adv(c) for c in WIDTH_SAMPLE) / float(len(WIDTH_SAMPLE)) / upem
    return {"family": " ".join(family.split())[:80], "style": " ".join(sub.split())[:60], "weight": weight,
            "italic": italic, "width": round(width * WIDTH_K, 3), "vi_missing": "".join(missing),
            "full_name": (names.get(4) or "")[:120], "size": size}


# ---------------------------------------------------------------------------
# Kho (font_library.json)
# ---------------------------------------------------------------------------
def load_lib():
    try:
        with open(FONT_LIB, encoding="utf-8") as f:
            d = json.load(f)
        if isinstance(d, dict) and isinstance(d.get("fonts"), list):
            return d
    except (OSError, ValueError):
        pass
    return {"version": 1, "fonts": []}


def save_lib(d):
    os.makedirs(ENGINE_HOME, exist_ok=True)
    tmp = FONT_LIB + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
    os.replace(tmp, FONT_LIB)


def lib_mtime():
    try:
        return os.path.getmtime(FONT_LIB)
    except OSError:
        return None


def font_id(scope, family):
    key = "%s:%s" % (scope, " ".join(family.lower().split()))
    return "uf_" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:10]


def css_family(fid):
    return "UF %s" % fid


def _safe_name(name):
    base = os.path.basename(name or "font")
    stem, ext = os.path.splitext(base)
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", unicodedata.normalize("NFKD", stem).encode("ascii", "ignore").decode())
    return (stem.strip("-.") or "font")[:60] + ext.lower()


def _weights(files):
    return sorted({f["weight"] for f in files})


def _summary(e):
    """Muc kho -> ban gui UI (khong lo duong dan trong may ra ngoai ngoai file de xem truoc)."""
    files = e.get("files") or []
    ws = _weights(files) if files else []
    return {"id": e["id"], "family": e.get("family"), "label": e.get("label") or e.get("family"), "scope": e.get("scope"),
            "css": css_family(e["id"]), "weights": ws, "italic": any(f.get("italic") for f in files),
            "vi_missing": e.get("vi_missing") or "", "width": e.get("width"), "created": e.get("created"),
            "files": [{"path": f["file"], "weight": f["weight"], "italic": bool(f.get("italic")), "style": f.get("style")}
                      for f in files]}


def list_fonts():
    with _lock:
        return [_summary(e) for e in load_lib()["fonts"] if e.get("id")]


def get(fid):
    for e in load_lib()["fonts"]:
        if e.get("id") == fid:
            return e
    return None


def _role_weights(ws):
    """Do dam theo vai (khop fonts.ts): hero = dam nhat, support ~700, micro ~500."""
    near = lambda w: min(ws, key=lambda x: (abs(x - w), -x))
    return {"hero": max(ws), "support": near(700), "micro": near(500)}


def catalog_fonts():
    """Font trong kho -> muc danh muc Remotion (remotion_plan.load_catalog gop vao, danh dau custom)."""
    out = []
    for e in load_lib()["fonts"]:
        files = e.get("files") or []
        if not e.get("id") or not files:
            continue
        out.append({"id": e["id"], "family": e.get("family"), "label": e.get("label") or e.get("family"),
                    "look": "font thuong hieu tai len (%s)" % ", ".join(str(w) for w in _weights(files)),
                    "roles": ["hero", "support", "micro"], "custom": True, "width": e.get("width") or 0.58})
    return out


def spec_fonts(ids):
    """Font tai len dung trong 1 ban dung -> spec["fonts"] cho Remotion (FontFace tung file, do dam that)."""
    out = []
    for fid in ids or []:
        e = get(fid)
        if not e:
            continue
        files = [f for f in e.get("files") or [] if os.path.isfile(f.get("file") or "")]
        if not files:
            continue
        ws = _weights(files)
        out.append({"id": fid, "family": css_family(fid), "label": e.get("label") or e.get("family"),
                    "width": e.get("width") or 0.58, "weights": _role_weights(ws), "available": ws,
                    "italic": any(f.get("italic") for f in files),
                    "files": [{"path": f["file"], "weight": f["weight"], "italic": bool(f.get("italic"))} for f in files]})
    return out


def import_files(paths, scope="local", publish=None):
    """File font -> gop theo HO CHU vao kho. Tra {fonts: [muc moi / cap nhat], failed: [{path, error}]}.
    publish(entry) (chi scope shared o may chu): day len R2 — loi -> bo muc vua them (khong de kho lech R2)."""
    if scope not in SCOPES:
        raise ValueError("scope")
    parsed, failed = [], []
    for p in paths or []:
        p = str(p or "")
        try:
            if not os.path.isfile(p):
                raise FontError("Không thấy file.")
            parsed.append((p, inspect(p)))
        except FontError as e:
            failed.append({"path": p, "error": str(e)})
        except Exception as e:
            failed.append({"path": p, "error": "Không đọc được font (%s)." % str(e)[:100]})
    groups = {}
    for p, info in parsed:
        groups.setdefault(" ".join(info["family"].lower().split()), []).append((p, info))
    touched = []
    with _lock:
        lib = load_lib()
        by_id = {e.get("id"): e for e in lib["fonts"]}
        for _k, items in groups.items():
            family = items[0][1]["family"]
            fid = font_id(scope, family)
            old = by_id.get(fid)
            entry = json.loads(json.dumps(old)) if old else {"id": fid, "family": family, "label": family, "scope": scope,
                                                              "created": time.strftime("%Y-%m-%d %H:%M"), "files": []}
            d = os.path.join(FONT_DIR, scope, fid)
            os.makedirs(d, exist_ok=True)
            files = {(f["weight"], bool(f.get("italic"))): f for f in entry.get("files") or []}
            for p, info in items:
                name = _safe_name(p)
                dest = os.path.join(d, name)
                if os.path.abspath(p) != os.path.abspath(dest):
                    shutil.copyfile(p, dest)
                key = (info["weight"], info["italic"])
                prev = files.get(key)
                if prev and prev.get("file") != dest and os.path.isfile(prev.get("file") or ""):
                    try:
                        os.remove(prev["file"])          # cung do dam + kieu -> file moi thay file cu
                    except OSError:
                        pass
                files[key] = {"file": dest, "name": name, "weight": info["weight"], "italic": info["italic"],
                              "style": info["style"], "sha256": _sha256(dest), "vi_missing": info["vi_missing"],
                              "width": info["width"]}
            fl = sorted(files.values(), key=lambda f: (f["weight"], f["italic"]))[:MAX_FILES_PER_FONT]
            entry["files"] = fl
            # thieu dau: hop cac file (file nao thieu thi chu do o do dam do hien bang font du phong)
            entry["vi_missing"] = "".join(sorted({c for f in fl for c in (f.get("vi_missing") or "")}))
            upright = [f for f in fl if not f["italic"]] or fl
            entry["width"] = round(sum(f["width"] for f in upright) / len(upright), 3)
            entry["updated"] = time.strftime("%Y-%m-%d %H:%M")
            if publish is not None:
                try:
                    publish(entry)
                except Exception as e:
                    for f in fl:
                        if not old or f["file"] not in {x.get("file") for x in old.get("files") or []}:
                            try:
                                os.remove(f["file"])
                            except OSError:
                                pass
                    for p, _i in items:
                        failed.append({"path": p, "error": "Tải lên kho chung thất bại: %s" % str(e)[:160]})
                    continue
            by_id[fid] = entry
            touched.append(fid)
        lib["fonts"] = [e for e in lib["fonts"] if e.get("id") not in touched] + [by_id[i] for i in touched]
        save_lib(lib)
        return {"fonts": [_summary(by_id[i]) for i in touched], "failed": failed}


def remove(fid, unpublish=None):
    """Xoa 1 bo font khoi kho may nay (+ khoi R2 neu shared o may chu). Du an cu dung font nay -> ve font du phong."""
    with _lock:
        lib = load_lib()
        e = next((x for x in lib["fonts"] if x.get("id") == fid), None)
        if not e:
            return False
        if e.get("scope") == "shared" and unpublish is not None:
            unpublish(e)
        lib["fonts"] = [x for x in lib["fonts"] if x.get("id") != fid]
        save_lib(lib)
        shutil.rmtree(os.path.join(FONT_DIR, e.get("scope") or "local", fid), ignore_errors=True)
        return True


def rename(fid, label):
    with _lock:
        lib = load_lib()
        for e in lib["fonts"]:
            if e.get("id") == fid:
                e["label"] = " ".join(str(label or "").split())[:80] or e.get("family")
                save_lib(lib)
                return _summary(e)
    return None


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------------------
# Kho chung (R2) — may chu day len; may khac nhan qua library_sync
# ---------------------------------------------------------------------------
def _manifest_entry(e):
    return {"id": e["id"], "family": e.get("family"), "label": e.get("label") or e.get("family"),
            "vi_missing": e.get("vi_missing") or "", "width": e.get("width"), "created": e.get("created"),
            "updated": e.get("updated"),
            "files": [{"path": f["name"], "sha256": f.get("sha256") or _sha256(f["file"]), "size": os.path.getsize(f["file"]),
                       "weight": f["weight"], "italic": bool(f.get("italic")), "style": f.get("style"),
                       "width": f.get("width"), "vi_missing": f.get("vi_missing") or ""}
                      for f in e.get("files") or []]}


def merge_shared(entries, download, log=None):
    """Gop font kho chung tu manifest (moi file kem `url` tai tam). Muc shared KHONG con tren manifest -> go khoi may nay
    (chu may xoa o kho chung). Tai loi 1 file -> giu ban cu cua muc do (khong them muc thieu file)."""
    if not isinstance(entries, list):
        return None
    added = updated = removed = 0
    errors = []
    with _lock:
        lib = load_lib()
        by_id = {e.get("id"): e for e in lib["fonts"]}
        keep = set()
        for m in entries:
            fid = str(m.get("id") or "")
            files = m.get("files") or []
            if not re.fullmatch(r"uf_[0-9a-f]{10}", fid) or not isinstance(files, list) or not files:
                continue
            keep.add(fid)
            d = os.path.join(FONT_DIR, "shared", fid)
            rows, ok = [], True
            for f in files:
                name = os.path.basename(str(f.get("path") or ""))
                if not name or os.path.splitext(name)[1].lower() not in EXTS or not f.get("url"):
                    ok = False
                    errors.append("%s: file khong hop le" % fid)
                    break
                dest = os.path.join(d, name)
                try:
                    if not os.path.isfile(dest) or _sha256(dest) != f.get("sha256"):
                        download(f["url"], dest, f.get("sha256"))
                        if log:
                            log("  tai font %s/%s" % (fid, name))
                except Exception as ex:
                    ok = False
                    errors.append("%s/%s: %s" % (fid, name, str(ex)[:120]))
                    break
                rows.append({"file": dest, "name": name, "weight": int(f.get("weight") or 400),
                             "italic": bool(f.get("italic")), "style": f.get("style"), "sha256": f.get("sha256"),
                             "width": f.get("width"), "vi_missing": f.get("vi_missing") or ""})
            if not ok:
                continue
            old = by_id.get(fid)
            entry = {"id": fid, "family": m.get("family"), "label": m.get("label") or m.get("family"), "scope": "shared",
                     "vi_missing": m.get("vi_missing") or "", "width": m.get("width") or 0.58,
                     "created": m.get("created"), "updated": m.get("updated"), "files": rows}
            if old is None:
                added += 1
            elif json.dumps(old, sort_keys=True) != json.dumps(entry, sort_keys=True):
                updated += 1
            by_id[fid] = entry
            # file cu khong con trong muc (chu may thay bo font) -> xoa
            names = {r["name"] for r in rows}
            if os.path.isdir(d):
                for fn in os.listdir(d):
                    if fn not in names and not fn.endswith(".part"):
                        try:
                            os.remove(os.path.join(d, fn))
                        except OSError:
                            pass
        # May chu (co token R2) la nguon cua kho chung -> KHONG go theo manifest (luot dong bo bat dau truoc khi vua tai
        # font len mang manifest cu -> se xoa nham font vua tai)
        owner = can_publish()
        for fid, e in list(by_id.items()):
            if not owner and e.get("scope") == "shared" and fid not in keep:
                by_id.pop(fid)
                shutil.rmtree(os.path.join(FONT_DIR, "shared", fid), ignore_errors=True)
                removed += 1
        lib["fonts"] = list(by_id.values())
        save_lib(lib)
    return {"added": added, "updated": updated, "removed": removed, "total": sum(1 for e in lib["fonts"]
                                                                               if e.get("scope") == "shared"),
            "errors": errors}


def r2_creds():
    """Token R2 cua may chu (scripts/publish-library.mjs dung chung). Khong co / thieu truong -> None."""
    try:
        with open(R2_CREDS, encoding="utf-8") as f:
            c = json.load(f)
    except (OSError, ValueError):
        return None
    keys = ("account_id", "access_key_id", "secret_access_key", "bucket")
    if not isinstance(c, dict) or not all(isinstance(c.get(k), str) and c.get(k) for k in keys):
        return None
    return {k: c[k] for k in keys}


def can_publish():
    return r2_creds() is not None


def _r2(method, key, body=b"", ctype="application/octet-stream", creds=None):
    """1 yeu cau S3 (SigV4) toi R2. Tra (status, bytes)."""
    import datetime
    import hmac
    import urllib.parse
    import requests
    c = creds or r2_creds()
    if not c:
        raise RuntimeError("Máy này không có token kho chung (r2-publish.json).")
    host = "%s.r2.cloudflarestorage.com" % c["account_id"]
    path = "/%s/%s" % (c["bucket"], "/".join(urllib.parse.quote(p, safe="") for p in key.split("/")))
    now = datetime.datetime.now(datetime.timezone.utc)
    amz, day = now.strftime("%Y%m%dT%H%M%SZ"), now.strftime("%Y%m%d")
    ph = hashlib.sha256(body).hexdigest()
    hdr = {"host": host, "x-amz-content-sha256": ph, "x-amz-date": amz}
    if method == "PUT":
        hdr["content-type"] = ctype
    signed = ";".join(sorted(hdr))
    canon = "\n".join([method, path, "", "".join("%s:%s\n" % (k, hdr[k]) for k in sorted(hdr)), signed, ph])
    scope = "%s/auto/s3/aws4_request" % day
    sts = "\n".join(["AWS4-HMAC-SHA256", amz, scope, hashlib.sha256(canon.encode()).hexdigest()])

    def hm(k, m):
        return hmac.new(k, m.encode(), hashlib.sha256).digest()
    k = hm(hm(hm(hm(("AWS4" + c["secret_access_key"]).encode(), day), "auto"), "s3"), "aws4_request")
    sig = hmac.new(k, sts.encode(), hashlib.sha256).hexdigest()
    hdr["authorization"] = "AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s" % (
        c["access_key_id"], scope, signed, sig)
    r = requests.request(method, "https://%s%s" % (host, path), data=body or None,
                         headers={k2: v for k2, v in hdr.items() if k2 != "host"}, timeout=120)
    return r.status_code, r.content


def _read_manifest(creds):
    st, body = _r2("GET", R2_MANIFEST, creds=creds)
    if st == 404:
        return {"fonts": []}
    if st != 200:
        raise RuntimeError("Đọc fonts-manifest.json lỗi (HTTP %d)." % st)
    d = json.loads(body.decode("utf-8"))
    if not isinstance(d, dict) or not isinstance(d.get("fonts"), list):
        raise RuntimeError("fonts-manifest.json hỏng — không ghi đè.")
    return d


def _write_manifest(creds, d):
    d["updated"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    st, body = _r2("PUT", R2_MANIFEST, json.dumps(d, ensure_ascii=False, indent=1).encode("utf-8"),
                   "application/json", creds=creds)
    if st >= 300:
        raise RuntimeError("Ghi fonts-manifest.json lỗi (HTTP %d): %s" % (st, body[:200]))


_CT = {".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff"}


def publish(entry):
    """Day 1 bo font len R2 (file moi / doi) + cap nhat fonts-manifest.json (doc lai ngay truoc khi ghi)."""
    creds = r2_creds()
    if not creds:
        raise RuntimeError("Máy này không có token kho chung (r2-publish.json).")
    man = _read_manifest(creds)
    old = next((m for m in man["fonts"] if m.get("id") == entry["id"]), None)
    have = {f.get("path"): f.get("sha256") for f in (old or {}).get("files") or []}
    me = _manifest_entry(entry)
    for f, src in zip(me["files"], entry["files"]):
        if have.get(f["path"]) == f["sha256"]:
            continue
        with open(src["file"], "rb") as fh:
            data = fh.read()
        st, body = _r2("PUT", "fonts/%s/%s" % (entry["id"], f["path"]), data,
                       _CT.get(os.path.splitext(f["path"])[1].lower(), "application/octet-stream"), creds=creds)
        if st >= 300:
            raise RuntimeError("Tải %s lên R2 lỗi (HTTP %d)." % (f["path"], st))
    man["fonts"] = [m for m in man["fonts"] if m.get("id") != entry["id"]] + [me]
    _write_manifest(creds, man)
    # file cu khong con trong bo (vd thay ban Bold) -> xoa tren R2 cho gon
    for name in set(have) - {f["path"] for f in me["files"]}:
        try:
            _r2("DELETE", "fonts/%s/%s" % (entry["id"], name), creds=creds)
        except Exception:
            pass


def unpublish(entry):
    """Go 1 bo font khoi kho chung: bo khoi manifest (may khac tu go o lan dong bo sau) + xoa file tren R2."""
    creds = r2_creds()
    if not creds:
        raise RuntimeError("Máy này không có token kho chung (r2-publish.json).")
    man = _read_manifest(creds)
    old = next((m for m in man["fonts"] if m.get("id") == entry["id"]), None)
    man["fonts"] = [m for m in man["fonts"] if m.get("id") != entry["id"]]
    _write_manifest(creds, man)
    for f in (old or {}).get("files") or []:
        try:
            _r2("DELETE", "fonts/%s/%s" % (entry["id"], f.get("path")), creds=creds)
        except Exception:
            pass
