#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tao TAI NGUYEN HINH cho luong Video Remotion: anh B-roll, nhan vat / sticker tach nen,
khung tinh tu video nguon.

Anh AI: tao qua Codex CLI (goi ChatGPT, cong cu image_generation co san trong CLI) — khong
can API key rieng. Moi anh ~60-90s, chay SONG SONG vai anh mot luc, co bo nho dem theo noi
dung yeu cau (cung mo ta -> dung lai file, khong tao lai).

Plenxai (plenxai_gen.py) da bi khoa API (can goi Pro) tu 2026-09-26 nen khong dung nua.
"""
import os
import time
import glob
import shutil
import hashlib
import tempfile
import threading
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed

import cli_providers
import media_vision
import remotion_plan
from debug_log import log_step_call as _lsc, log_step_response as _lsr, log_step_note as _lsn


def _safe(fn):
    def w(*a, **k):
        try:
            fn(*a, **k)
        except Exception:
            pass  # ghi nhat ky khong bao gio duoc lam hong viec tao anh
    return w


log_step_call, log_step_response, log_step_note = _safe(_lsc), _safe(_lsr), _safe(_lsn)

GEN_DIR = os.path.join(os.path.expanduser("~"), ".capcut-studio", "assets", "gen")
CODEX_IMAGES = os.path.join(os.path.expanduser("~"), ".codex", "generated_images")
VERSION = 2          # 2 = khung prompt chuan + boi canh loi noi (2026-09-27)
MAX_PARALLEL = 3
_lock = threading.Lock()

_ASSET_IMAGE_PROMPT = """Dung CONG CU TAO ANH (image generation) de tao dung MOT anh. Khong hoi lai, khong giai thich.

# ANH NAY DUNG DE LAM GI
Anh minh hoa trong mot video ngan doc 9:16 (TikTok / Reels). Nguoi xem chi nhin anh 2-4 giay, TRONG LUC
nguoi noi dang noi cau o duoi — nhin anh phai hieu ngay no minh hoa dieu gi.
{context}

# MO TA ANH (cua nguoi thiet ke — tieng Anh)
{prompt}

# YEU CAU BAT BUOC
1. DUNG NOI DUNG: anh the hien DUNG vat the / hanh dong / boi canh ma cau noi nhac toi, cu the va de nhan ra
   (vd noi "dang bai len Facebook, fanpage, nhom" -> man hinh laptop/dien thoai dang dang bai len mang xa hoi,
   khong phai mot robot chung chung). Khong ve y lac de, khong an du kho hieu.
2. DUNG THUC TE: boi canh, thiet bi, trang phuc, do vat hop voi nguoi Viet / doi song that; ti le, phoi canh,
   anh sang tu nhien, hop ly. San pham / nhan vat co that trong video thi ve dung hinh dang, mau sac da mo ta.
3. BO CUC: MOT chu the chinh ro rang, bo cuc gon, tuong phan tot giua chu the va nen. {vung_trong}
4. PHONG CACH CHUNG CUA VIDEO: {style}. Mau sac hai hoa voi video.
5. KHONG co chu / so / ky tu doc duoc, KHONG logo thuong hieu that, KHONG watermark, KHONG giao dien gia co
   chu li ti. Man hinh thiet bi (neu co) chi la khoi giao dien mo phong dang hinh khoi, khong chu.
6. CHAT LUONG: net, chi tiet, sach; khong tay/ngon bi meo, khong mat bi bien dang, khong vat the nhan doi,
   khong dinh vao nhau, khong nhoe loang.
TI LE KHUNG: {aspect}
{bg}

Tao xong: SAO CHEP file anh vao DUNG duong dan: {out}
Chi tra loi dung duong dan do."""

# Vai tro cua anh tren man hinh -> vung can chua trong cho chu / cach dat chu the
_VAI_TRO = {
    "split": ("anh nua TREN man hinh (ben duoi la nguoi noi)",
              "Chu the dat giua-hoi thap, chua KHOANG TRONG sach o 1/4 phia tren anh cho chu."),
    "broll": ("anh B-roll TOAN man hinh, tieng nguoi noi van chay",
              "Chu the chiem 1/3 giua khung, chua khoang trong sach o 1/3 phia duoi cho chu va phu de."),
    "card": ("anh trong khung the bo goc o nua tren, ben duoi la the video nguoi noi",
             "Chu the o giua, ro net, nen don gian."),
    "circle": ("anh nen phia sau khung tron chua nguoi noi",
               "Nen don gian, khong chi tiet ruom ra o giua khung."),
    "bg": ("anh NEN phia sau cac lop chu / do hoa",
           "Nen don gian, it chi tiet, do tuong phan vua phai de chu dat len van doc ro."),
    "layer_cutout": ("vat the / nhan vat TACH NEN dat de len video (nhu mot sticker cao cap)",
                     "Chu the TRON VEN, khong bi cat mep, dang ro rang nhin tu xa van nhan ra."),
    "layer": ("anh nho dat de len video (khung anh bo goc)",
              "Chu the o giua, ro net, nen gon."),
}

# KHUNG NGANG 16:9 (canvas.py): panel / the nam BEN CANH nguoi noi thay vi tren / duoi
_VAI_TRO_NGANG = {
    "split": ("anh mot BEN man hinh ngang (ben kia la nguoi noi)",
              "Chu the o giua anh, bo cuc vua khung panel dung, chua mot vung trong gon cho chu."),
    "card": ("anh ben TRAI man hinh ngang, ben phai la the video nguoi noi",
             "Chu the o giua, ro net, nen don gian."),
    "broll": ("anh B-roll TOAN man hinh ngang 16:9, tieng nguoi noi van chay",
              "Chu the chiem 1/3 giua khung, chua khoang trong sach o 1/4 phia duoi cho phu de."),
}

_BG_PLAIN = ""

_BG_CUTOUT = ("NEN: chu the dat giua, TRON VEN, khong bi cat mep, tren NEN TRON MOT MAU sang (xam nhat), "
              "khong bong do lan ra nen — anh se duoc tach nen de dat len video.")


def _key(prompt, aspect, style, cutout, context=None, refs=None):
    raw = "%s|%s|%s|%s|%d|%s|%s" % (prompt.strip(), aspect, (style or "").strip(), bool(cutout), VERSION,
                                    _context_text(context), _template())
    if refs:
        # anh mau cua nguoi dung: doi anh (noi dung file) -> tao lai
        raw += "|refs:" + ",".join(_file_hash(r) for r in refs)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:20]


def _file_hash(path):
    try:
        with open(path, "rb") as f:
            return hashlib.sha1(f.read()).hexdigest()[:12]
    except OSError:
        return "?"


def _template():
    import prompt_store
    return prompt_store.get_prompt("_ASSET_IMAGE_PROMPT", _ASSET_IMAGE_PROMPT)


def _context_text(ctx):
    """Boi canh cua anh (motion_design.asset_contexts) -> doan mo ta cho AI tao anh."""
    if not isinstance(ctx, dict) or not ctx:
        return "(khong co boi canh loi noi)"
    rows = []
    if ctx.get("anh_mau"):
        # tu lieu cua nguoi dung (user_media.py) gui kem qua -i: anh AI phai co DUNG san pham / chu the that
        rows.append("- ANH MAU DINH KEM = anh THAT cua nguoi dung (%s). Ve DUNG chu the trong anh mau (hinh dang, mau "
                    "sac, nhan mac, bao bi, ti le), dat vao boi canh cua MO TA ANH; khong ve san pham khac, khong chep "
                    "nguyen anh mau, khong them chu / logo moi." % ctx["anh_mau"])
    if ctx.get("khung_video"):
        rows.append("- KHUNG VIDEO: %s — moi cho noi video doc 9:16 / TikTok o tren hieu la khung nay." % ctx["khung_video"])
    if ctx.get("vai_tro"):
        rows.append("- Vi tri tren man hinh: %s." % ctx["vai_tro"])
    if ctx.get("loi_noi"):
        rows.append('- Nguoi noi DANG NOI luc anh hien: "%s"' % ctx["loi_noi"])
    if ctx.get("minh_hoa"):
        rows.append("- Nguoi thiet ke muon anh minh hoa: %s" % ctx["minh_hoa"])
    if ctx.get("chu_de"):
        rows.append("- Chu de ca video: %s" % ctx["chu_de"])
    if ctx.get("chu_tren_anh"):
        rows.append('- Chu se hien CUNG LUC tren / canh anh (KHONG ve chu nay vao anh): "%s"' % ctx["chu_tren_anh"])
    if ctx.get("boi_canh_nguon"):
        rows.append("- Boi canh / san pham that trong video nguon: %s" % ctx["boi_canh_nguon"])
    if ctx.get("tone"):
        rows.append("- Giong video: %s" % ctx["tone"])
    bv = ctx.get("thuong_hieu")
    if isinstance(bv, dict) and bv:
        # Brand Guideline cua khach hang (motion_design.asset_contexts) — BAT BUOC theo, uu tien hon phong cach chung
        import brand_guide
        rows.append("- BRAND GUIDELINE (BAT BUOC theo, uu tien hon 'phong cach chung' ben duoi):")
        for k in brand_guide.STEP_FIELDS["image"]:
            if bv.get(k):
                rows.append("    * %s: %s" % (brand_guide.LABELS[k], bv[k]))
        if bv.get("ma_mau"):
            rows.append("    * Ma mau thuong hieu: %s — mau nhan / chu the noi bat dung cac mau nay" % ", ".join(bv["ma_mau"]))
    return "\n".join(rows) or "(khong co boi canh loi noi)"


_claimed = set()          # anh Codex da nhan (chay song song khong lay nham anh cua nhau)


def _newest_codex_image(since, session=None):
    root = os.path.join(CODEX_IMAGES, session) if session else CODEX_IMAGES
    files = [f for f in glob.glob(os.path.join(root, "**", "*.png"), recursive=True)
             if os.path.getmtime(f) >= since - 1 and f not in _claimed]
    return max(files, key=os.path.getmtime) if files else None


def _run_codex(argv, text, work, target, timeout):
    """Chay `codex exec`, THEO DOI thay vi cho: nhan anh ngay khi file xuat hien (Codex doi khi
    treo sau khi tao anh xong), hen gio theo DONG HO THAT (may ngu -> thuc day la het gio ngay),
    het gio / xong viec thi giet CA NHOM tien trinh (node + codex + code-mode-host).
    Tra (duong_dan_anh | None, ma_thoat, log_cuoi)."""
    import re
    import winsupport
    t0 = time.time()
    p = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                         env=cli_providers._augmented_env(), cwd=work, start_new_session=True)
    lines = []

    def _doc():
        for ln in p.stdout:
            lines.append(ln)
    th = threading.Thread(target=_doc, daemon=True)
    th.start()
    try:
        p.stdin.write(text)
        p.stdin.close()
    except OSError:
        pass
    session, found, seen_at, last_size = None, None, None, -1
    while True:
        if session is None:
            m = re.search(r"session id:\s*([0-9a-fA-F-]{36})", "".join(lines[:60]))
            session = m.group(1) if m else None
        cand = target if os.path.isfile(target) else (_newest_codex_image(t0, session) if session else None)
        if cand:
            sz = os.path.getsize(cand)
            if sz > 0 and sz == last_size:
                found = found or cand
                seen_at = seen_at or time.time()
            last_size = sz
        if p.poll() is not None:
            break
        # co anh roi: cho Codex tu chep xong toi da 20s, khong thi thoi
        if found and time.time() - seen_at > (3 if found == target else 20):
            break
        if time.time() - t0 > timeout:
            break
        time.sleep(1)
    rc = p.poll()
    if rc is None:
        # giet CA NHOM (macOS: killpg session rieng; Windows: taskkill /T — os.killpg khong co tren Windows)
        winsupport.kill_tree(p)
        rc = -9
    th.join(timeout=2)
    if not found:
        found = target if os.path.isfile(target) else _newest_codex_image(t0, session)
    return found, rc, "".join(lines)[-2000:]


def build_prompt(prompt, aspect, style, cutout, context, out):
    """Prompt day du gui AI tao anh: khung chuan (_ASSET_IMAGE_PROMPT, sua duoc trong menu Prompt &
    quy tac) + mo ta cua R4 + BOI CANH (cau dang noi, vai tro tren man hinh, chu dat len anh...)."""
    import prompt_store
    ctx = context if isinstance(context, dict) else {}
    vung = ctx.get("vung_trong") or ("Chu the TRON VEN o giua khung." if cutout else "Chua mot vung trong gon cho chu.")
    return prompt_store.render("_ASSET_IMAGE_PROMPT", prompt=prompt.strip(), context=_context_text(ctx),
                               style=style or "(khong co)", aspect=aspect, vung_trong=vung,
                               bg=_BG_CUTOUT if cutout else _BG_PLAIN, out=out)


def gen_image(prompt, aspect="9:16", style="", cutout=False, model=None, log=None, timeout=420, context=None, refs=None):
    """Tao 1 anh. Tra {"path", "cutout", "cached", "seconds"} hoac nem RuntimeError.
    context: boi canh cua anh (motion_design.asset_contexts) — nam trong khoa bo nho dem.
    refs: anh MAU cua nguoi dung (san pham that) — gui kem Codex qua -i, nam trong khoa bo nho dem."""
    os.makedirs(GEN_DIR, exist_ok=True)
    refs = [r for r in refs or [] if r and os.path.isfile(r)][:3]
    if refs:
        context = dict(context or {})
        context.setdefault("anh_mau", "anh san pham / chu the that cua nguoi dung")
    k = _key(prompt, aspect, style, cutout, context, refs)
    out = os.path.join(GEN_DIR, k + ".png")
    cut = os.path.join(GEN_DIR, k + "_cut.png")
    if os.path.isfile(out):
        res = {"path": out, "cached": True, "seconds": 0}
        if cutout:
            # lift_subject tu dung ban tach da co neu con moi + dung phien ban lam sach (cutout_refine.VERSION)
            res["cutout"] = media_vision.lift_subject(out, cut)
        return res
    path = cli_providers.find_bin("gpt")
    if not path:
        raise RuntimeError("Chua cai Codex CLI nen khong tao duoc anh — mo Doctor de app tu cai, roi dang nhap ChatGPT o Cai dat API")
    model = (model or cli_providers.SPEC["gpt"]["default_model"]).strip()
    work = tempfile.mkdtemp(prefix="gen-")
    target = os.path.join(work, "anh.png")
    text = build_prompt(prompt, aspect, style, cutout, context, target)
    argv = [path, "exec", "--skip-git-repo-check", "--ignore-user-config", "--enable", "image_generation",
            "--sandbox", "workspace-write", "--color", "never", "-C", work, "-m", model, "-"]
    for r in refs:
        argv += ["-i", r]        # anh mau dat SAU "-" (-i nhan nhieu gia tri lien tiep — xem cli_providers._codex_chat)
    t0 = time.time()
    log_step_call("asset-image", "cli:codex", model, "", text, params={"aspect": aspect, "cutout": cutout,
                                                                        "anh_mau": [os.path.basename(r) for r in refs]})
    if log:
        log("Tao anh AI (Codex): %s" % prompt[:80])
    src, rc, tail = _run_codex(argv, text, work, target, timeout)
    if not src:
        log_step_response("asset-image", "cli:codex", tail, error="khong co file anh")
        shutil.rmtree(work, ignore_errors=True)
        # Het han muc goi ChatGPT -> noi ro (khung nao, mo lai luc nao) thay vi loi chung chung
        hint = cli_providers._quota_hint("gpt", tail)
        if hint:
            raise RuntimeError("Không tạo được ảnh AI: " + hint.split("\n")[0])
        raise RuntimeError("Codex khong tao duoc anh (ma %s): %s" % (rc, tail[-300:]))
    with _lock:
        _claimed.add(src)
        shutil.copy2(src, out)
    shutil.rmtree(work, ignore_errors=True)
    secs = round(time.time() - t0, 1)
    log_step_response("asset-image", "cli:codex", "anh: %s (%ss)" % (out, secs))
    res = {"path": out, "cached": False, "seconds": secs}
    if cutout:
        res["cutout"] = media_vision.lift_subject(out, cut)
    return res


def gen_many(requests, style="", model=None, log=None, workers=MAX_PARALLEL):
    """requests: [{"id", "prompt", "aspect"?, "cutout"?, "context"?, "refs"?}] -> {id: ket_qua | {"error": ...}}"""
    out = {}
    reqs = [r for r in requests or [] if isinstance(r, dict) and r.get("id") and (r.get("prompt") or "").strip()]
    if not reqs:
        return out
    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        futs = {ex.submit(gen_image, r["prompt"], r.get("aspect") or "9:16", style, bool(r.get("cutout")),
                          model, log, 420, r.get("context"), r.get("refs")): r["id"] for r in reqs}
        for f in as_completed(futs):
            rid = futs[f]
            try:
                out[rid] = f.result()
            except Exception as e:  # anh hong -> bo anh do, video van dung duoc
                out[rid] = {"error": str(e)[:300]}
    try:
        log_step_note("asset-image", "Tao %d anh: %d thanh cong" % (
            len(reqs), sum(1 for v in out.values() if v.get("path"))))
    except Exception:
        pass
    return out


def source_still(video_path, t, cutout=False):
    """Khung tinh tu video nguon tai giay t (va tach nen neu can)."""
    import media_sdr
    video_path = media_sdr.working_path(video_path)   # HDR -> ban SDR (mau dung, khong chay sang)
    os.makedirs(GEN_DIR, exist_ok=True)
    k = hashlib.sha1(("%s|%.2f|%d" % (os.path.abspath(video_path), float(t), VERSION)).encode()).hexdigest()[:20]
    out = os.path.join(GEN_DIR, "src_" + k + ".jpg")
    if not os.path.isfile(out):
        subprocess.run([remotion_plan._ffbin("ffmpeg"), "-v", "error", "-y", "-ss", "%.3f" % float(t), "-i",
                        video_path, "-frames:v", "1", "-q:v", "2", out], capture_output=True, timeout=60)
    if not os.path.isfile(out):
        return None
    res = {"path": out}
    if cutout:
        res["cutout"] = media_vision.lift_subject(out, os.path.join(GEN_DIR, "src_" + k + "_cut.png"))
    return res
