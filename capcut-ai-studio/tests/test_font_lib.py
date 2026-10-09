#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""KHO FONT TAI LEN (2026-10-09): doc file font (ten / do dam / dau tieng Viet / be rong), gop theo ho chu, danh muc,
kho chung R2 (may chu day len — R2 GIA trong bo nho), may khac nhan qua dong bo kho, route sidecar.

Chay: HOME=$(mktemp -d) <venv_python> tests/test_font_lib.py
"""
import glob
import json
import os
import shutil
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import font_lib as F       # noqa: E402
os.environ["STUDIO_LICENSE_OFF"] = "1"
import server              # noqa: E402
import remotion_plan as RP  # noqa: E402
import motion_design as MD  # noqa: E402
import library_sync        # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else "  -> %s" % (str(detail)[:400],)))
    if not cond:
        FAILED.append(name)


if not os.path.expanduser("~").startswith(("/var/folders", "/tmp", "/private")):
    print("Chay voi HOME tam: HOME=$(mktemp -d) ...")
    sys.exit(2)

GIL = sorted(glob.glob(os.path.join(ROOT, "src", "assets", "fonts", "SVN-Gilroy-*.otf")))
NM = os.path.join(ROOT, "node_modules", "@fontsource")
LATIN = os.path.join(NM, "montserrat", "files", "montserrat-latin-800-normal.woff")
WOFF2 = os.path.join(NM, "montserrat", "files", "montserrat-latin-800-normal.woff2")
TMP = tempfile.mkdtemp(prefix="fontlib-")

print("[1] Doc file font")
i = F.inspect(os.path.join(ROOT, "src", "assets", "fonts", "SVN-Gilroy-Bold.otf"))
check("OTF: ten ho / kieu / do dam / du dau", i["family"] == "SVN-Gilroy" and i["weight"] == 700 and not i["italic"]
      and i["vi_missing"] == "", i)
check("be rong cung thang fonts.ts (Gilroy khai 0.58)", abs(i["width"] - 0.58) < 0.04, i["width"])
w = F.inspect(LATIN)
check("WOFF (zlib): doc duoc + thieu chu tieng Viet bi phat hien", w["family"] == "Montserrat" and w["weight"] == 800
      and len(w["vi_missing"]) > 50 and "ệ" in w["vi_missing"], (w["family"], w["weight"], len(w["vi_missing"])))
for bad, why in ((WOFF2, "woff2"), (__file__, "khong phai font")):
    try:
        F.inspect(bad)
        check("tu choi %s" % why, False)
    except F.FontError as e:
        check("tu choi %s: '%s'" % (why, e), True)
junk = os.path.join(TMP, "hong.ttf")
with open(junk, "wb") as f:
    f.write(b"\x00\x01\x00\x00" + b"\x00" * 40)
try:
    F.inspect(junk)
    check("file hong -> FontError", False)
except F.FontError:
    check("file hong -> FontError (khong vo sidecar)", True)
check("ten ho cu kem do dam -> bo do dam (gop dung bo)", F._strip_style("Roboto Black") == "Roboto"
      and F._strip_style("Brand Sans Extra Bold Italic") == "Brand Sans" and F._strip_style("Bold") == "Bold"
      and F._strip_style("SVN-Gilroy") == "SVN-Gilroy")
check("146 chu cai tieng Viet (thuong + hoa, 5 dau)", len(F.VI_CHARS) == 146 and "Ỵ" in F.VI_CHARS and "đ" in F.VI_CHARS)

print("\n[2] Nhap, gop theo ho chu, danh muc")
r = F.import_files(GIL + [junk], scope="local")
g = r["fonts"][0] if r["fonts"] else {}
check("5 file Gilroy -> 1 bo font 5 do dam; file hong bao loi rieng", len(r["fonts"]) == 1 and g.get("weights") == [300, 400, 500, 600, 700]
      and len(r["failed"]) == 1 and r["failed"][0]["path"] == junk, r)
check("file chep vao kho (khong tro file goc)", all(x["path"].startswith(F.FONT_DIR) and os.path.isfile(x["path"]) for x in g["files"]))
r2 = F.import_files(GIL[:2], scope="local")
check("nhap lai cung file -> cap nhat, khong trung", len(F.list_fonts()) == 1 and len(r2["fonts"][0]["files"]) == 5)
check("cung ho chu: local / shared la 2 id; khoang trang / hoa thuong khong doi id",
      F.font_id("local", "SVN-Gilroy") != F.font_id("shared", "SVN-Gilroy")
      and F.font_id("local", "SVN-Gilroy") == F.font_id("local", " svn-gilroy "))
fid = g["id"]
cat = RP.load_catalog()
check("danh muc Remotion co font tai len (custom)", any(x["id"] == fid and x.get("custom") for x in cat["fonts"]))
check("danh muc GUI AI khong co font tai len", fid not in json.dumps(RP.catalog_for_prompt("fonts")))
check("font dong goi van du", {"anton", "montserrat", "gilroy"} <= {x["id"] for x in cat["fonts"]})
check("uoc luong be ngang chu dung be rong do tu file", abs(MD._font_k(fid) - g["width"]) < 1e-6 and MD._font_k("anton") == 0.46)
sp = F.spec_fonts([fid, "uf_khongco0000"])
check("spec_fonts: vai -> do dam that (hero dam nhat, support ~700, micro ~500)", len(sp) == 1
      and sp[0]["weights"] == {"hero": 700, "support": 700, "micro": 500} and sp[0]["family"] == "UF " + fid, sp)
spec = {"captions": [{"font": fid}, {"font": "anton"}], "layers": [{"font": "lexend", "spans": [{"font": fid}]}]}
RP.attach_fonts(spec)
check("attach_fonts: chi font tai len dang dung", [f["id"] for f in spec.get("fonts") or []] == [fid])
spec2 = {"captions": [{"font": "anton"}], "layers": [], "fonts": [{"id": "x"}]}
RP.attach_fonts(spec2)
check("attach_fonts: khong dung font tai len -> bo khoa fonts", "fonts" not in spec2)

print("\n[3] Kho chung: may chu day len R2 (R2 GIA)")
STORE = {}


def fake_r2(method, key, body=b"", ctype="application/octet-stream", creds=None):
    if method == "GET":
        return (200, STORE[key]) if key in STORE else (404, b"NoSuchKey")
    if method == "PUT":
        STORE[key] = body
        return 200, b""
    if method == "DELETE":
        STORE.pop(key, None)
        return 204, b""
    raise AssertionError(method)


check("chua co token -> khong phai may chu", not F.can_publish())
with server.app.test_client() as c:
    rr = c.post("/fonts/import", json={"paths": GIL[:1], "scope": "shared"})
check("route: may khong token tai 'shared' -> 400 (khong lam gi)", rr.status_code == 400 and len(F.list_fonts()) == 1, rr.get_json())
os.makedirs(F.ENGINE_HOME, exist_ok=True)
with open(F.R2_CREDS, "w") as f:
    json.dump({"account_id": "a", "access_key_id": "k", "secret_access_key": "s", "bucket": "b"}, f)
F._r2 = fake_r2
check("co token -> may chu", F.can_publish())
with server.app.test_client() as c:
    rr = c.post("/fonts/import", json={"paths": GIL[3:5], "scope": "shared"})
    js = rr.get_json()
sid = (js.get("fonts") or [{}])[0].get("id")
man = json.loads(STORE.get("fonts-manifest.json", b"{}"))
check("route: shared -> muc shared + file len R2 + manifest", rr.status_code == 200 and sid and sid != fid
      and set(k for k in STORE if k.startswith("fonts/%s/" % sid)) == {"fonts/%s/%s" % (sid, os.path.basename(p)) for p in GIL[3:5]}
      and [m["id"] for m in man.get("fonts") or []] == [sid], (js, list(STORE)))
mf = man["fonts"][0]["files"]
check("manifest: ten file (khong duong dan may), sha256, do dam", all("/" not in x["path"] and len(x["sha256"]) == 64 and x["weight"] for x in mf)
      and "file" not in json.dumps(man).replace('"files"', ""), mf)
n_put = len(STORE)
F.import_files(GIL[3:5], scope="shared", publish=F.publish)
check("day lai cung file -> khong tai lai file (chi ghi manifest)", len(STORE) == n_put)


def boom(_e):
    raise RuntimeError("mat mang")


before = json.dumps(F.load_lib(), sort_keys=True)
res = F.import_files([LATIN], scope="shared", publish=boom)
MDIR = os.path.join(F.FONT_DIR, "shared", F.font_id("shared", "Montserrat"))
check("R2 loi -> KHONG them muc (kho may chu khop R2) + bao loi, khong de file rac", not res["fonts"] and res["failed"]
      and json.dumps(F.load_lib(), sort_keys=True) == before and not (os.listdir(MDIR) if os.path.isdir(MDIR) else []),
      res)

print("\n[4] May khac nhan qua dong bo kho")
pub = {k: v for k, v in STORE.items()}
os.remove(F.R2_CREDS)                                    # gia lap may khach: khong token
saved_lib = F.load_lib()
F.save_lib({"version": 1, "fonts": [e for e in saved_lib["fonts"] if e["scope"] == "local"]})
shutil.rmtree(os.path.join(F.FONT_DIR, "shared"), ignore_errors=True)
DL = []


def fake_download(url, dest, sha=None, tries=3):
    key = url.split("r2://", 1)[1]
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "wb") as f:
        f.write(pub[key])
    DL.append(key)


def manifest_for_client():
    m = json.loads(pub["fonts-manifest.json"])
    for e in m["fonts"]:
        for x in e["files"]:
            x["url"] = "r2://fonts/%s/%s" % (e["id"], x["path"])
    return m["fonts"]


library_sync._download = fake_download
res = library_sync.pull({"sfx": [], "memes": [], "texts": [], "music": [], "fonts": manifest_for_client()})
lf = {e["id"]: e for e in F.list_fonts()}
check("pull: font kho chung ve may + file dung", res["ok"] and res["fonts"]["added"] == 1 and sid in lf and lf[sid]["scope"] == "shared"
      and all(os.path.isfile(x["path"]) for x in lf[sid]["files"]) and len(DL) == 2, (res.get("fonts"), DL))
check("pull: font local cua may nay giu nguyen", fid in lf and lf[fid]["scope"] == "local")
DL.clear()
library_sync.pull({"sfx": [], "memes": [], "texts": [], "music": [], "fonts": manifest_for_client()})
check("pull lan 2: file da co dung sha -> khong tai lai", DL == [])
library_sync.pull({"sfx": [], "memes": [], "texts": [], "music": []})
check("manifest khong co khoa fonts (may chu cu) -> khong go gi", sid in {e["id"] for e in F.list_fonts()})
library_sync.pull({"sfx": [], "memes": [], "texts": [], "music": [], "fonts": [
    {"id": "../../evil", "files": [{"path": "a.ttf", "url": "r2://x"}]},
    {"id": "uf_0000000000", "files": [{"path": "../x.ttf", "url": "r2://x"}]}]})
lf = {e["id"]: e for e in F.list_fonts()}
check("may chu go font khoi kho chung -> may khach go theo; muc doc hai bi bo; font local giu",
      sid not in lf and "uf_0000000000" not in lf and fid in lf and not os.path.isdir(os.path.join(F.FONT_DIR, "shared", sid)), lf)
# may chu: KHONG go font cua minh theo manifest cu (luot dong bo bat dau truoc khi vua tai len)
with open(F.R2_CREDS, "w") as f:
    json.dump({"account_id": "a", "access_key_id": "k", "secret_access_key": "s", "bucket": "b"}, f)
library_sync.pull({"sfx": [], "memes": [], "texts": [], "music": [], "fonts": manifest_for_client()})
F.import_files([LATIN], scope="shared", publish=F.publish)
mid = F.font_id("shared", "Montserrat")
library_sync.pull({"sfx": [], "memes": [], "texts": [], "music": [], "fonts": manifest_for_client()})  # manifest CU (chua co mid)
check("may chu: dong bo voi manifest cu khong xoa font vua tai len", mid in {e["id"] for e in F.list_fonts()})

print("\n[5] Go font (route)")
with server.app.test_client() as c:
    rr = c.post("/fonts/delete", json={"id": mid})
check("may chu go font kho chung -> bo khoi manifest + xoa file R2", rr.get_json().get("ok")
      and mid not in json.dumps(json.loads(STORE["fonts-manifest.json"])) and not any(k.startswith("fonts/%s/" % mid) for k in STORE))
os.remove(F.R2_CREDS)
with server.app.test_client() as c:
    shared_ids = [e["id"] for e in F.list_fonts() if e["scope"] == "shared"]
    if shared_ids:
        rr = c.post("/fonts/delete", json={"id": shared_ids[0]})
        check("may khach khong go duoc font kho chung", rr.status_code == 400)
    rr = c.post("/fonts/delete", json={"id": fid})
    lst = c.get("/fonts/list").get_json()
check("go font local", rr.get_json().get("ok") and fid not in {e["id"] for e in lst["fonts"]} and lst["can_publish"] is False)
check("danh muc cap nhat sau khi go (khong con id)", fid not in {x["id"] for x in RP.load_catalog()["fonts"]})

print("\n%s" % ("TAT CA OK" if not FAILED else "THAT BAI: %d" % len(FAILED)))
sys.exit(1 if FAILED else 0)
