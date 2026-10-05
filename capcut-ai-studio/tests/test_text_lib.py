#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kho Text (mau chu dong, chuyen tu preset CapCut): register_from_dir / update / delete + dong bo
R2 (library_sync.pull) gop theo id, khong xoa muc local, viet lai `dir` theo may.

Chay: HOME=$(mktemp -d) <venv_python> tests/test_text_lib.py     (can ffmpeg de tao preview.mp4 gia)
Khong goi mang that: mock HTTP (requests.get) nhu library_sync._download dung.
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))

import text_lib         # noqa: E402
import library_sync     # noqa: E402
import remotion_plan    # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(("  ok   " if cond else "  FAIL ") + name + ("" if cond else " -> " + str(detail)[:400]))
    if not cond:
        FAILED.append(name)


def make_preview(path, dur=0.5):
    ff = remotion_plan._ffbin("ffmpeg")
    subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                    "color=c=black:s=64x64:d=%.2f" % dur, path], check=True)


# ----------------------------------------------------------------------------
# [1] register_from_dir: doc template.json, do preview khi thieu duration/width/height
# ----------------------------------------------------------------------------
print("[1] register_from_dir doc template.json + do preview.mp4 khi thieu so do")
SRC = tempfile.mkdtemp(prefix="tpl-src-")
TDIR = os.path.join(SRC, "hook-zoom-01")
os.makedirs(TDIR)
make_preview(os.path.join(TDIR, "preview.mp4"), dur=0.6)
with open(os.path.join(TDIR, "template.json"), "w", encoding="utf-8") as f:
    json.dump({
        "name": "Hook Zoom",
        # "source" day la OBJECT nhu capcut_preset_import.py thuc te ghi (spec.ts), khong phai chuoi
        "source": {"kind": "capcut_preset", "name": "Hook Zoom Preset"},
        "renderer_only_field": {"nested": True},   # truong la cua ban render-engineer -> phai GIU NGUYEN trong file
        "slots": [
            {"id": "slot_1", "role": "tu dan", "sample": "Ban co biet"},
            {"id": "slot_2", "role": "nhan manh", "sample": "99%"},
        ],
    }, f)

row = text_lib.register_from_dir(TDIR)
check("id = ten thu muc", row["id"] == "hook-zoom-01", row["id"])
check("name tu template.json", row["name"] == "Hook Zoom")
check("source OBJECT (capcut_preset_import.py) -> chuoi ngan 'kind: name'",
      row["source"] == "capcut_preset: Hook Zoom Preset", row["source"])
check("dir = duong dan tuyet doi", row["dir"] == TDIR)
check("do duoc duration tu preview (ffprobe)", 0.4 <= (row.get("duration") or 0) <= 1.0, row.get("duration"))
check("do duoc width/height tu preview", row.get("width") == 64 and row.get("height") == 64)
check("slots giu dung id/role/sample", row["slots"] == [
    {"id": "slot_1", "role": "tu dan", "sample": "Ban co biet"},
    {"id": "slot_2", "role": "nhan manh", "sample": "99%"},
])
check("sample_texts gop tu slots", row["sample_texts"] == ["Ban co biet", "99%"], row["sample_texts"])
check("preview = preview.mp4", row["preview"] == "preview.mp4")
# template.json KHONG bi ghi lai (truong la cua ban render-engineer phai con nguyen)
with open(os.path.join(TDIR, "template.json"), encoding="utf-8") as f:
    raw = json.load(f)
check("template.json khong bi sua (truong la cua renderer engineer con nguyen)",
      raw.get("renderer_only_field") == {"nested": True}, raw)

# ----------------------------------------------------------------------------
# [2] Gan nhan (gia lap) + register lai (vd renderer engineer sua template.json) -> GIU nhan cu
# ----------------------------------------------------------------------------
print("\n[2] Gan nhan (manual) roi register_from_dir lai -> giu nguyen cac truong phan tich")
text_lib.text_update(row["id"], use_when="Dung khi can hook gay gat", tags=["hook", "zoom"], labeled_by="gemini")
with open(os.path.join(TDIR, "template.json"), "w", encoding="utf-8") as f:
    json.dump({"name": "Hook Zoom v2", "slots": [{"id": "slot_1", "role": "tu dan", "sample": "Da bao gio"}]}, f)
row2 = text_lib.register_from_dir(TDIR)
check("cau truc cap nhat lai (ten moi)", row2["name"] == "Hook Zoom v2")
check("slots cap nhat lai", row2["slots"][0]["sample"] == "Da bao gio")
check("nhan cu (use_when/tags/labeled_by) duoc GIU NGUYEN", row2.get("use_when") == "Dung khi can hook gay gat" and
      row2.get("tags") == ["hook", "zoom"] and row2.get("labeled_by") == "gemini", row2)

# ----------------------------------------------------------------------------
# [3] text_update / text_delete (an toan: chi xoa thu muc NAM TRONG kho cua app)
# ----------------------------------------------------------------------------
print("\n[3] text_update sua tay + text_delete an toan (khong xoa thu muc ben ngoai kho)")
upd = text_lib.text_update(row["id"], avoid_when=["noi dung cham"])
check("text_update tra ban ghi moi", upd is not None and upd.get("avoid_when") == ["noi dung cham"])
check("text_update khong cho sua id/dir", "id" not in {} )  # id/dir bi pop truoc khi ghi (xem text_update)
ok_del = text_lib.text_delete(row["id"])
check("text_delete tra True + mat khoi index", ok_del and text_lib.get_template(row["id"]) is None)
check("thu muc BEN NGOAI kho (TEXT_DIR) KHONG bi xoa", os.path.isdir(TDIR))

# 1 ban trong chinh TEXT_DIR -> xoa thi MAT thu muc
in_kho = os.path.join(text_lib.TEXT_DIR, "trong-kho-01")
os.makedirs(in_kho)
make_preview(os.path.join(in_kho, "preview.mp4"), dur=0.3)
with open(os.path.join(in_kho, "template.json"), "w", encoding="utf-8") as f:
    json.dump({"name": "Trong kho"}, f)
text_lib.register_from_dir(in_kho)
text_lib.text_delete("trong-kho-01")
check("thu muc TRONG kho bi xoa khi text_delete", not os.path.isdir(in_kho))

# ----------------------------------------------------------------------------
# [4] library_sync.pull: gop kho Text tu manifest R2 (nhieu file / mau) — mock HTTP
# ----------------------------------------------------------------------------
print("\n[4] library_sync.pull gop Kho Text — nhieu file/mau, SHA-256, viet lai `dir` theo may")


def sha(b):
    return hashlib.sha256(b).hexdigest()


TEMPLATE_JSON = json.dumps({"name": "Mau R2", "slots": [{"id": "s1", "sample": "Xin chao"}]}).encode("utf-8")
PREVIEW_BYTES = b"\x00\x01fake-mp4-bytes"
FONT_BYTES = b"fake-font-bytes"

URL_CONTENT = {
    "https://r2/texts/r2-mau-01/template.json": TEMPLATE_JSON,
    "https://r2/texts/r2-mau-01/preview.mp4": PREVIEW_BYTES,
    "https://r2/texts/r2-mau-01/fonts/Roboto.ttf": FONT_BYTES,
}


class _FakeResp:
    def __init__(self, data):
        self._data = data

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def raise_for_status(self):
        pass

    def iter_content(self, chunk_size):
        yield self._data


def fake_get(url, stream=True, timeout=60):
    if url not in URL_CONTENT:
        raise RuntimeError("404 %s" % url)
    return _FakeResp(URL_CONTENT[url])


library_sync.requests.get = fake_get

manifest = {
    "updated": "2026-10-04T00:00:00",
    "sfx": [], "memes": [],
    "texts": [{
        "id": "r2-mau-01", "name": "Mau R2", "source": "capcut", "duration": 1.2,
        "width": 1080, "height": 1920, "slots": [{"id": "s1", "role": "", "sample": "Xin chao"}],
        "sample_texts": ["Xin chao"], "preview": "preview.mp4", "labeled_by": "gemini",
        "summary": "chu bay vao tu trai", "tags": ["hook"],
        "files": [
            {"path": "template.json", "sha256": sha(TEMPLATE_JSON), "size": len(TEMPLATE_JSON),
             "url": "https://r2/texts/r2-mau-01/template.json"},
            {"path": "preview.mp4", "sha256": sha(PREVIEW_BYTES), "size": len(PREVIEW_BYTES),
             "url": "https://r2/texts/r2-mau-01/preview.mp4"},
            {"path": "fonts/Roboto.ttf", "sha256": sha(FONT_BYTES), "size": len(FONT_BYTES),
             "url": "https://r2/texts/r2-mau-01/fonts/Roboto.ttf"},
        ],
    }],
}

# 1 muc local CHI CO tren may nay (khong co trong manifest) -> phai duoc GIU NGUYEN sau khi gop
os.makedirs(os.path.join(text_lib.TEXT_DIR, "local-only-01"))
make_preview(os.path.join(text_lib.TEXT_DIR, "local-only-01", "preview.mp4"), dur=0.2)
with open(os.path.join(text_lib.TEXT_DIR, "local-only-01", "template.json"), "w", encoding="utf-8") as f:
    json.dump({"name": "Chi co may nay"}, f)
text_lib.register_from_dir(os.path.join(text_lib.TEXT_DIR, "local-only-01"))

res = library_sync.pull(manifest, log=print)
check("pull ok=True", res.get("ok") is True, res)
check("texts.added = 1 (r2-mau-01 moi)", res["texts"]["added"] == 1, res["texts"])
check("texts.total = 2 (local-only-01 + r2-mau-01)", res["texts"]["total"] == 2, res["texts"])
check("khong co loi tai", res["texts"]["errors"] == [], res["texts"]["errors"])

pulled = text_lib.get_template("r2-mau-01")
check("muc moi co trong index sau pull", pulled is not None)
expect_dir = os.path.join(text_lib.TEXT_DIR, "r2-mau-01")
check("`dir` duoc VIET LAI theo may nay (TEXT_DIR/<id>), khong con trong manifest",
      pulled is not None and pulled.get("dir") == expect_dir, pulled)
check("khong con khoa `files` trong ban ghi da luu (chi dung de tai)", pulled is not None and "files" not in pulled)
check("nhan Gemini di theo manifest (khong phai goi Gemini lai)",
      pulled is not None and pulled.get("summary") == "chu bay vao tu trai" and pulled.get("labeled_by") == "gemini")
check("3 file duoc tai dung noi dung", all([
    os.path.isfile(os.path.join(expect_dir, "template.json")),
    os.path.isfile(os.path.join(expect_dir, "preview.mp4")),
    os.path.isfile(os.path.join(expect_dir, "fonts", "Roboto.ttf")),
]))
with open(os.path.join(expect_dir, "fonts", "Roboto.ttf"), "rb") as f:
    check("noi dung file font dung (tai qua HTTP gia lap)", f.read() == FONT_BYTES)
check("muc local-only-01 (chi co tren may nay) KHONG bi xoa",
      text_lib.get_template("local-only-01") is not None)

# Pull lai LAN 2 voi cung manifest: khong tai lai (SHA da khop) + van la "updated" (id da co)
res2 = library_sync.pull(manifest, log=print)
check("pull lai: khong con 'added' (id da co -> tinh la updated)", res2["texts"]["added"] == 0, res2["texts"])
check("pull lai: updated = 1", res2["texts"]["updated"] == 1, res2["texts"])

# ----------------------------------------------------------------------------
# [5] 1 file trong muc loi (404) -> CA MUC bi bo (khong luu mau thieu tai nguyen), muc khac van chay
# ----------------------------------------------------------------------------
print("\n[5] 1 file 404 trong 1 mau -> bo ca mau do, cac mau khac / muc cu KHONG bi anh huong")
bad_manifest = {
    "sfx": [], "memes": [],
    "texts": [{
        "id": "mau-loi-01", "name": "Mau loi",
        "files": [
            {"path": "template.json", "sha256": "x" * 64, "url": "https://r2/khong-ton-tai.json"},
        ],
    }],
}
res3 = library_sync.pull(bad_manifest, log=print)
check("mau loi: co loi trong 'errors'", len(res3["texts"]["errors"]) >= 1, res3["texts"])
check("mau loi: KHONG duoc them vao kho", text_lib.get_template("mau-loi-01") is None)
check("tong so mau khong doi (2) — khong mat muc cu", res3["texts"]["total"] == 2, res3["texts"])

print("\n%s" % ("TAT CA OK" if not FAILED else "THAT BAI: %d" % len(FAILED)))
sys.exit(1 if FAILED else 0)
