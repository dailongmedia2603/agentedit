# -*- coding: utf-8 -*-
"""HINH MINH HOA DONG CHO HOOK — DI TU NOI DUNG CAU HOOK (user 2026-10-20: "hieu ung set khong phu hop chu de 'rot hop
dong'. Phai xay quy tac roi DUA VAO NOI DUNG hook de tao hieu ung phu hop, ket hop am thanh phu hop").

Do that truoc do: luat cu chon hieu ung theo CAM XUC ("soc -> set / kinh vo") -> hook "bi rot hop dong" ra vet nut trong nhu
set, khong lien quan hop dong. Luat moi:
1. AI (buoc "Hook-visual") doc cau hook -> CHU THE cu the (hop dong, tien, khach hang...) + BIEN CO xay ra voi no (rot, huy,
   mat, tang...) -> chon DONG TAC trong bo dong tac code dung san (roi / xe doi / dong dau / vo vun / bay mat / bung ra /
   tang vot / bay vao) + TIENG cua chinh hanh dong do + (tuy chon) con DAU chu ngan.
2. Code tao ANH THAT cua vat (Codex, tach nen), dung lop anh + keyframe theo dong tac (cat manh: xe doi rang cua, vo 3x3),
   dat "anchor": "hook" (len ban sao hook), tieng earshot dung luc vat vao / bien co.
3. Luat hook (hook_rule.check) tinh hinh minh hoa nay la hieu ung DAC BIET cua hook; FX-plan chi lo camera (dap / rung
   TRUNG nhip vat vao + bien co) va khong ve gi che vat.
"""
import json
import os

import providers

VERSION = 1
GEN_DIR = os.path.join(os.path.expanduser("~"), ".capcut-studio", "cache", "hook_visual")

DONG_TAC = {
    "roi": "RƠI: vật đập vào khung rồi nghiêng, tuột và rơi khỏi màn hình (rớt, tuột mất, trượt khỏi tay, mất)",
    "xe_doi": "XÉ ĐÔI: vật xuất hiện rồi bị xé làm hai nửa (mép xé răng cưa) bay ra hai bên và rơi (huỷ, chấm dứt, "
              "đổ vỡ, mất hợp đồng / thoả thuận)",
    "dong_dau": "ĐÓNG DẤU: vật xuất hiện, con dấu chữ ngắn đập mạnh lên nó (bị từ chối, huỷ, sai, cấm; hoặc ĐÃ DUYỆT, "
                "ĐÃ CHỐT với màu tốt)",
    "vo_vun": "VỠ VỤN: vật xuất hiện rồi vỡ thành nhiều mảnh văng ra (sụp đổ, phá sản, thất bại nặng)",
    "bay_mat": "BAY MẤT: vật bị hút / vụt bay khỏi khung, xoay và nhỏ dần (mất tiền, khách bỏ đi, biến mất, đốt tiền)",
    "bung_ra": "BUNG RA: vật bật vào thật to, nảy (thành công, đạt được, kết quả lớn, quà, chốt được)",
    "tang_vot": "TĂNG VỌT: vật phóng vụt lên trên (tăng trưởng, x2, doanh thu / follow tăng)",
    "bay_vao": "BAY VÀO: vật lượn vào đứng cạnh người nói (giới thiệu, đây là, công cụ, sản phẩm)",
}
# tieng mac dinh cua tung dong tac (earshot) neu AI chon tieng khong hop le: (tieng vat vao, [tieng bien co])
TIENG_MAC_DINH = {
    "roi": ("whoosh_fast/heavy", ["pro_zip/down", "impact/punch"]),
    "xe_doi": ("whoosh_fast/heavy", ["swipe/glide", "impact/punch"]),
    "dong_dau": ("whoosh_fast/heavy", ["impact/punch"]),
    "vo_vun": ("whoosh_fast/heavy", ["impact/blast"]),
    "bay_mat": ("pro_pop_in/deep", ["whoosh_big/swell"]),
    "bung_ra": ("impact/deep", ["pro_shimmer/m2"]),
    "tang_vot": ("pro_pop_in/deep", ["riser/rush"]),
    "bay_vao": ("whoosh_big/swell", ["pro_pop_in/round"]),
}

_PROMPT = """Ban la DAO DIEN HINH ANH cho HOOK (3-5s dau) cua video short. Nhiem vu: tu NOI DUNG cau hook, nghi ra MOT hinh minh
hoa dong — VAT THAT + DONG TAC + TIENG — de nguoi xem THAY NGAY dieu nguoi noi dang noi, ke ca khi tat tieng.

# QUY TAC (theo thu tu)
1. DOC cau hook (hook.loi_noi + hook.caption + cau_chuyen). Tim CHU THE: danh tu CU THE ve duoc (hop dong, tien, khach
   hang, dien thoai, don hang, nhan vien, website, quang cao, san pham...). Y tru tuong -> chon vat AN DU ai cung hieu
   (vd "mat niem tin" -> cai bat tay; "chi phi" -> xap tien; "nhan su nghi viec" -> the nhan vien).
2. Tim BIEN CO / HANH DONG xay ra voi chu the trong CHINH cau do (rot, mat, huy, bi tu choi, tang, ra mat, gioi thieu...).
3. Chon "dong_tac" trong danh_sach_dong_tac dien DUNG bien co. Vat + dong tac phai lam nguoi xem hieu cau hook KHONG can
   nghe (vd "bi rot hop dong" -> to hop dong bi XE DOI / RƠI khoi khung, khong phai set danh hay kinh vo).
4. KHONG dung hieu ung khong lien quan noi dung (set, mua, kinh vo, glitch, tia sang, phao hoa...) tru khi chinh cau noi ve
   chung. Cam xuc cau hook chi quyet dinh DO MANH / nhip, KHONG quyet dinh hinh.
5. NHIP (gio NGUON, nam trong [hook.src_start, hook.src_end]): "xuat_hien" = luc vat vao — trong ~0.3s dau hook (cu mo) hoac
   dung luc noi ten vat; "hanh_dong" = dung TU NHAN cua bien co, va SAU "xuat_hien" >= 0.6s (nguoi xem kip nhin ro vat).
   Neu tu bien co noi truoc ten vat (vd "bi ROT hop dong"), dat bien co o tu nhan / cau chot ke tiep phu hop.
6. "vat.prompt" (TIENG ANH, de tao anh): MOT vat duy nhat, hinh dang ro, anh that chat luong cao (hoac 3D render) hop
   phong cach video (phong_cach.image_style / mau), nen trong don gian de tach nen, KHONG chu doc duoc (giay to: dong chu
   mo, chu ky nguech ngoac), KHONG tay / nguoi, goc nhin chinh dien hoi nghieng, vat chiem gan het khung anh.
7. "dau" (tuy chon): 1-2 tu tieng Viet IN HOA khop bien co (HỦY, TỪ CHỐI, MẤT, X2, ĐÃ CHỐT...) chi khi lam ro them;
   "mau": do #E53935 = xau, xanh #22C55E = tot. Dong tac "dong_dau" BAT BUOC co dau.
8. AM THANH (gen_catalog, chi dung id co trong do): "xuat_hien" = tieng vat VAO (whoosh / dap); "hanh_dong" = 1-2 tieng
   cua CHINH bien co: xe giay -> swipe/*; roi / tuot -> pro_zip/down, downlifter/*; dau -> impact/punch; vo -> impact/blast;
   bay mat -> whoosh_big/*; bung / thanh cong -> impact + shimmer; tang -> riser/*. Tieng phai la tieng CUA hanh dong do.
9. "ben": "trai" | "phai" — phia vat dat canh nguoi noi (it vuong mat / chu hook hon).

# SCHEMA DAU RA (CHI JSON PHANG, DU 14 truong, khong long object)
{"chu_the": "...", "bien_co": "...", "y_tuong": "<1 cau: nguoi xem thay gi>", "dong_tac": "<id trong danh_sach_dong_tac>",
 "vat_ten": "...", "vat_prompt": "<english, KHONG dung dau nhay kep ben trong>", "dau_chu": "" , "dau_mau": "#E53935",
 "xuat_hien": 91.95, "hanh_dong": 93.1, "ben": "phai", "tieng_vao": "<gen id>", "tieng_bien_co": ["<gen id>"],
 "vi_sao": "<vi sao vat + dong tac + tieng nay dien dung cau hook>"}
("dau_chu" rong = khong co dau.)
⚠️ TRA VE CHI JSON GOC."""


def _p():
    import hook_fx
    import prompt_store
    return prompt_store.get_prompt("_HOOK_VISUAL_PROMPT", _PROMPT) + hook_fx.LUAT_Y_NGHIA     # luat y nghia LUON noi vao


def gen_catalog():
    import sfx_gen
    if not sfx_gen.available():
        return []
    want = {"whoosh_fast", "whoosh_big", "pro_whoosh_big", "swish", "swipe", "impact", "pro_impact", "sub_drop",
            "pro_sub_drop", "riser", "pro_riser", "downlifter", "pro_zip", "pro_pop_in", "pro_tap", "tap", "glitch",
            "pro_glitch", "shimmer", "pro_shimmer", "pro_logo_sting", "notify"}
    return [g for g in sfx_gen.catalog() if g.get("loai") in want]


def design(moment, story=None, style=None, face=None, log=None):
    """Buoc AI "Hook-visual": thiet ke hinh minh hoa dong tu noi dung cau hook. Tra dict (chua kiem)."""
    payload = {"hook": moment, "cau_chuyen": story or {}, "phong_cach": style or {}, "mat_nguoi": face or {},
               "danh_sach_dong_tac": DONG_TAC, "gen_catalog": gen_catalog()}
    if log:
        log("Hook-visual: %s thiet ke hinh minh hoa tu noi dung cau hook..." % providers.plan_ai_name())
    msgs = [{"role": "system", "content": _p()}, {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}]
    res = {}
    for _ in range(2):                      # thieu truong bat buoc (JSON lech) -> hoi lai 1 lan
        try:
            res = providers._safe_json(providers.plan_chat(msgs, json_mode=True, max_tokens=3000, temperature=0.5,
                                                           req_timeout=180, max_attempts=2, step_label="Hook-visual")) or {}
        except Exception:
            res = {}
        res = _flat(res)
        thieu = [k for k in ("dong_tac", "vat_prompt", "xuat_hien", "hanh_dong") if not res.get(k)]
        if not thieu:
            break
        msgs = msgs + [{"role": "user", "content": "JSON vua roi THIEU truong %s. Tra lai DU 14 truong theo SCHEMA (JSON "
                                                   "phang, chi JSON)." % ", ".join(thieu)}]
    return res


def _flat(d):
    """Chap nhan ca schema long cu (vat {ten, prompt}, dau {chu, mau}, am_thanh {...}) -> phang."""
    d = dict(d) if isinstance(d, dict) else {}
    v = d.get("vat") if isinstance(d.get("vat"), dict) else {}
    d.setdefault("vat_ten", v.get("ten"))
    d.setdefault("vat_prompt", v.get("prompt"))
    if not d.get("vat_prompt") and d.get("prompt"):
        d["vat_prompt"] = d["prompt"]
    dau = d.get("dau") if isinstance(d.get("dau"), dict) else {}
    d.setdefault("dau_chu", dau.get("chu"))
    d.setdefault("dau_mau", dau.get("mau"))
    am = d.get("am_thanh") if isinstance(d.get("am_thanh"), dict) else {}
    d.setdefault("tieng_vao", am.get("xuat_hien"))
    d.setdefault("tieng_bien_co", am.get("hanh_dong"))
    return d


def clean(d, moment):
    """Kiem thiet ke: dong tac hop le, gio trong hook, tieng hop le. Tra dict sach | None."""
    import sfx_gen
    d = _flat(d)
    if d.get("dong_tac") not in DONG_TAC or len(str(d.get("vat_prompt") or "")) < 12:
        return None
    f = providers._f
    h0, h1 = float(moment["src_start"]), float(moment["src_end"])
    xa = min(max(f(d.get("xuat_hien"), h0), h0), h1 - 1.0)
    hd = min(max(f(d.get("hanh_dong"), xa + 0.9), xa + 0.6), h1 - 0.35)
    dau = {"chu": d["dau_chu"], "mau": d.get("dau_mau")} if str(d.get("dau_chu") or "").strip() else None
    if d["dong_tac"] == "dong_dau" and not dau:
        dau = {"chu": "HỦY", "mau": "#E53935"}
    if dau:
        mau = str(dau.get("mau") or "#E53935")
        dau = {"chu": str(dau["chu"]).strip().upper()[:14], "mau": mau if mau.startswith("#") and len(mau) in (4, 7) else "#E53935"}
    snd_in, snd_act = TIENG_MAC_DINH[d["dong_tac"]]
    g_in = sfx_gen.clean_gen(d.get("tieng_vao")) if d.get("tieng_vao") else None
    tb = d.get("tieng_bien_co")
    acts = [sfx_gen.clean_gen(x) for x in ([tb] if isinstance(tb, str) else tb or [])[:2] if x]
    acts = [x for x in acts if x]
    return {"chu_the": str(d.get("chu_the") or "")[:60], "bien_co": str(d.get("bien_co") or "")[:80],
            "y_tuong": str(d.get("y_tuong") or "")[:240], "dong_tac": d["dong_tac"],
            "vat": {"ten": str(d.get("vat_ten") or "")[:60], "prompt": str(d["vat_prompt"])[:900]}, "dau": dau,
            "xuat_hien": round(xa, 3), "hanh_dong": round(hd, 3), "ben": "trai" if d.get("ben") == "trai" else "phai",
            "tieng_vao": (g_in or {}).get("sound") or snd_in,
            "tieng_bien_co": [x["sound"] for x in acts] or snd_act, "vi_sao": str(d.get("vi_sao") or "")[:300]}


# ---------------------------------------------------------------------------
# ANH: tao + tach nen + cat manh
# ---------------------------------------------------------------------------
def make_image(spec, style="", log=None):
    """Anh that cua vat (Codex + tach nen), cat sat vien. Tra duong dan PNG trong suot | None."""
    import asset_gen
    try:
        r = asset_gen.gen_image(spec["vat"]["prompt"], aspect="1:1", style=style or "", cutout=True, log=log,
                                context={"vai_tro": "vat minh hoa dong trong hook (tach nen, dat canh nguoi noi)",
                                         "cau_noi": spec.get("bien_co")})
    except Exception as ex:      # khong co Codex / het han muc -> hook dung hieu ung du phong
        if log:
            log("Hook-visual: khong tao duoc anh (%s)" % str(ex)[:160])
        return None
    path = r.get("cutout") or r.get("path")
    return _trim(path) if path and os.path.isfile(path) else None


def _trim(path):
    from PIL import Image
    os.makedirs(GEN_DIR, exist_ok=True)
    im = Image.open(path).convert("RGBA")
    bb = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    if bb:
        im = im.crop(bb)
    out = os.path.join(GEN_DIR, os.path.splitext(os.path.basename(path))[0] + "_trim.png")
    im.save(out)
    return out


def _pieces(path, kind):
    """Cat anh trong suot thanh manh: 'xe_doi' -> 2 nua mep rang cua; 'vo_vun' -> luoi 3x3 mep gay. Tra
    [(duong_dan, cx, cy)] — tam manh theo phan so anh (0..1)."""
    import random as _r
    from PIL import Image, ImageDraw
    im = Image.open(path).convert("RGBA")
    W, H = im.size
    rnd = _r.Random(os.path.basename(path) + kind)
    out = []
    base = os.path.splitext(path)[0]
    if kind == "xe_doi":
        pts, y = [], 0
        while y < H:
            pts.append((W * 0.5 + rnd.uniform(-0.06, 0.06) * W, y))
            y += max(8, H / 14)
        pts.append((W * 0.5, H))
        for side, poly in (("l", [(0, 0)] + pts + [(0, H)]), ("r", [(W, 0)] + pts + [(W, H)])):
            m = Image.new("L", (W, H), 0)
            ImageDraw.Draw(m).polygon(poly, fill=255)
            p = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            p.paste(im, (0, 0), Image.composite(im.getchannel("A"), Image.new("L", (W, H), 0), m))
            bb = p.getchannel("A").getbbox() or (0, 0, W, H)
            p = p.crop(bb)
            f = "%s_%s.png" % (base, side)
            p.save(f)
            out.append((f, (bb[0] + bb[2]) / 2.0 / W, (bb[1] + bb[3]) / 2.0 / H, (bb[2] - bb[0]) / float(W)))
    else:
        n = 3
        xs = [0] + [W * (i / n) + rnd.uniform(-0.05, 0.05) * W for i in range(1, n)] + [W]
        ys = [0] + [H * (i / n) + rnd.uniform(-0.05, 0.05) * H for i in range(1, n)] + [H]
        for i in range(n):
            for j in range(n):
                box = (int(xs[i]), int(ys[j]), int(xs[i + 1]), int(ys[j + 1]))
                p = im.crop(box)
                if not p.getchannel("A").getbbox():
                    continue
                f = "%s_v%d%d.png" % (base, i, j)
                p.save(f)
                out.append((f, (box[0] + box[2]) / 2.0 / W, (box[1] + box[3]) / 2.0 / H, (box[2] - box[0]) / float(W)))
    return out


# ---------------------------------------------------------------------------
# DONG TAC -> lop anh + keyframe (gio NGUON, "anchor": "hook")
# ---------------------------------------------------------------------------
CLOSEUP_FACE_W = 0.4        # mat rong >= 40% khung (quay can) -> hinh minh hoa dat SAU nguoi, to (khong con cho canh mat)


def stamp_size(chu, max_size=160, width=0.6):
    """Co chu con dau vua khung: chu dai (RỚT HỢP ĐỒNG) tu nho lai, khong tran (~0.6 rong khung, chu in hoa ~0.62 em)."""
    n = max(1, len(str(chu or "")))
    return int(max(70, min(max_size, 1080 * width / (n * 0.62))))


def build_layers(spec, img, moment, canvas=(1080, 1920), face=None, prefix="hv", anchor="hook", place=None):
    """Tra (assets, layers, transform_hits_rel). keyframes t = giay tinh tu luc lop bat dau; x / y = phan so khung.
    face (plan['faces'][sid]: cx, cy, w, h): quay CAN (mat rong) -> vat dat SAU nguoi noi, to gan het khung, nguoi noi noi
    len truoc (lop "behind", tach nguoi) — do that 2026-10-20: hook can mat, to hop dong dat canh mat bi luat che mat doi
    len tran + thu con 52%. Quay rong -> dat canh nguoi."""
    from PIL import Image
    Wc, Hc = canvas
    iw, ih = Image.open(img).size
    h0, h1 = float(moment["src_start"]), float(moment["src_end"])
    xa, hd = spec["xuat_hien"], spec["hanh_dong"]
    B = round(hd - xa, 3)
    kind = spec["dong_tac"]
    side = 1 if spec["ben"] == "phai" else -1
    behind = float((face or {}).get("w") or 0) >= CLOSEUP_FACE_W
    if behind and iw < ih * 0.55:
        w = 0.4                                        # vat cao, hep (the deo, chai...): sau VAI canh dau, khong bi dau che
        x, y, rest_rot = 0.5 + side * 0.3, 0.46, -6 * side
    elif behind:
        w = 0.82 if iw < ih else 0.92                  # sau nguoi: to, lo ra quanh dau / vai
        x, y, rest_rot = 0.5, 0.4, -4 * side
    else:
        w = 0.46 if iw >= ih else 0.36                 # be ngang (giay to nam ngang) to hon
        x, y, rest_rot = 0.5 + side * 0.24, 0.64, -7 * side
    if place:                                          # vi tri da chon theo CHO TRONG that (body_visual.place_visible)
        x, y, w = place
        rest_rot = -5 * side
    hfrac = w * Wc * ih / float(iw) / Hc               # chieu cao vat theo phan so khung
    spread = 0.3 if behind else 0.06                   # manh / nua xe bay ra xa hon khi o sau nguoi (lo khoi dau)
    sid = moment["source_id"]
    shadow = [{"x": 0, "y": 22, "blur": 36, "color": "rgba(0,0,0,.55)"}]
    P = prefix + "_"
    assets = [{"id": P + "obj", "kind": "ai_image", "path": img, "alpha": True, "prompt": spec["vat"]["prompt"][:200]}] if img else []

    def layer(lid, asset, st, en, kfs, ww, x0, y0, track=62):
        L = {"id": lid, "type": "image", "asset": asset, "source_id": sid,
             "src_start": round(st, 3), "src_end": round(min(en, h1), 3), "x": round(x0, 4), "y": round(y0, 4),
             "w": round(ww, 4), "track": track, "shadow": shadow, "keyframes": kfs, "hook_visual": True}
        if anchor:
            L["anchor"] = anchor
        if behind:
            L["behind"] = True
        return L

    # VAO: dap tu tren xuong, nghieng, nhoe -> dung (squash nhe) -> giu, troi nhe
    enter = [{"t": 0, "x": x, "y": y - 0.55, "rotation": rest_rot - 28 * side, "scale": 1.2, "blur": 10},
             {"t": 0.16, "x": x, "y": y, "rotation": rest_rot, "scale": 1.0, "blur": 0, "easing": "ease_in"},
             {"t": 0.24, "scale": 1.07, "easing": "ease_out"},
             {"t": 0.34, "scale": 1.0, "easing": "back_out"}]
    hold = [{"t": max(0.4, B - 0.02), "x": x, "y": y - 0.008, "rotation": rest_rot + 2 * side, "easing": "ease_in_out"}]
    hits = [round(xa - h0 + 0.16, 3), round(B + xa - h0, 3)]
    layers = []
    if kind == "bay_vao":
        k = [{"t": 0, "x": x + side * 0.7, "y": y - 0.1, "rotation": 40 * side, "scale": 0.7, "blur": 8},
             {"t": 0.3, "x": x, "y": y, "rotation": rest_rot, "scale": 1.0, "blur": 0, "easing": "back_out"}] + hold
        layers.append(layer(P + "obj", P + "obj", xa, h1, k, w, x, y))
        hits = [round(xa - h0 + 0.3, 3)]
    elif kind in ("roi", "bay_mat", "tang_vot", "bung_ra", "dong_dau"):
        if kind == "bung_ra":
            k = [{"t": 0, "x": x, "y": y, "rotation": rest_rot, "scale": 0.05, "blur": 0},
                 {"t": 0.22, "scale": 1.3, "easing": "expo_out"}, {"t": 0.36, "scale": 1.0, "easing": "back_out"}]
            k += [{"t": B, "scale": 1.0}, {"t": B + 0.12, "scale": 1.22, "easing": "expo_out"},
                  {"t": B + 0.3, "scale": 1.0, "easing": "back_out"}]
            end = h1
        else:
            k = list(enter) + hold
            end = h1
            if kind == "roi":
                k += [{"t": B + 0.1, "y": y - 0.03, "rotation": rest_rot - 8 * side, "easing": "ease_out"},
                      {"t": B + 0.62, "y": 1.35, "rotation": rest_rot + 55 * side, "blur": 6, "easing": "ease_in"}]
                end = hd + 0.65
            elif kind == "bay_mat":
                k += [{"t": B + 0.08, "scale": 1.12, "easing": "ease_out"},
                      {"t": B + 0.5, "x": 0.5 + side * 0.75, "y": -0.25, "scale": 0.25, "rotation": rest_rot + 380 * side,
                       "blur": 8, "easing": "ease_in"}]
                end = hd + 0.55
            elif kind == "tang_vot":
                k += [{"t": B + 0.1, "y": y + 0.03, "scale": 0.95, "easing": "ease_out"},
                      {"t": B + 0.45, "y": -0.35, "scale": 1.1, "blur": 8, "easing": "ease_in"}]
                end = hd + 0.5
        layers.append(layer(P + "obj", P + "obj", xa, end, k, w, x, y))
    else:                                       # xe_doi / vo_vun: vat nguyen -> manh tai luc bien co
        layers.append(layer(P + "obj", P + "obj", xa, hd + 0.02, list(enter) + hold, w, x, y))
        for i, (f, cx, cy, fw) in enumerate(_pieces(img, kind)):
            aid = P + "p%d" % i
            assets.append({"id": aid, "kind": "ai_image", "path": f, "alpha": True, "prompt": "manh %d" % i})
            px = x + (cx - 0.5) * w
            py = y + (cy - 0.5) * hfrac
            dx, dy = (cx - 0.5), (cy - 0.5)
            if kind == "xe_doi":
                s = -1 if cx < 0.5 else 1
                k = [{"t": 0, "x": px, "y": py, "rotation": rest_rot},
                     {"t": 0.16, "x": px + s * spread, "y": py - 0.02, "rotation": rest_rot + s * 16, "easing": "expo_out"},
                     {"t": 0.8, "x": px + s * (spread + 0.14), "y": 1.35, "rotation": rest_rot + s * 70, "blur": 4,
                      "easing": "ease_in"}]
            else:
                k = [{"t": 0, "x": px, "y": py, "rotation": rest_rot},
                     {"t": 0.12, "x": px + dx * (0.35 + spread * 2), "y": py + dy * 0.25 - 0.03,
                      "rotation": rest_rot + dx * 80, "easing": "expo_out"},
                     {"t": 0.7, "x": px + dx * 0.7, "y": 1.35, "rotation": rest_rot + dx * 260, "blur": 3, "easing": "ease_in"}]
            layers.append(layer(P + "p%d" % i, aid, hd, hd + 0.8, k, w * fw, px, py, track=63))
    if spec.get("dau"):
        d = spec["dau"]
        st = hd + (0.12 if kind in ("xe_doi", "vo_vun", "roi") else 0.0)
        sx, sy = (0.5 + side * 0.3, 0.3) if behind else (x, min(0.78, y))
        layers.append({"id": P + "dau", "type": "text", "source_id": sid, "src_start": round(st, 3),
                       "src_end": round(h1, 3), "x": round(sx, 4), "y": round(sy, 4), "rotation": -14 * side,
                       "track": 64, "hook_visual": True, "uppercase": True,
                       "spans": [{"text": d["chu"], "size": stamp_size(d["chu"]), "color": d["mau"], "stroke": {"color": "#FFFFFF", "width": 6}}],
                       "box": {"color": "rgba(255,255,255,0.0)", "radius": 0.02, "padX": 0.025, "padY": 0.008,
                               "border": "12px solid %s" % d["mau"]},
                       "keyframes": [{"t": 0, "scale": 2.6, "opacity": 0}, {"t": 0.12, "scale": 1.0, "opacity": 1, "easing": "ease_in"},
                                     {"t": 0.2, "scale": 1.08, "easing": "ease_out"}, {"t": 0.3, "scale": 1.0, "easing": "back_out"}]})
        if anchor:
            layers[-1]["anchor"] = anchor
        if behind:
            layers[-1]["behind"] = True                 # dau nam sau nguoi cung tang voi vat
        if kind in ("xe_doi", "vo_vun", "roi"):
            hits.append(round(st - h0 + 0.12, 3))
    return assets, layers, sorted(set(h for h in hits if 0 <= h < h1 - h0))


def build_audio(spec, moment, layers):
    """Tieng earshot cua tung hanh dong: vat VAO (luc dap xuong) + BIEN CO (xe / roi / dau...). anchor hook."""
    import sfx_gen
    sid = moment["source_id"]
    xa, hd = spec["xuat_hien"], spec["hanh_dong"]
    t_in = xa + (0.3 if spec["dong_tac"] == "bay_vao" else 0.16)
    rows = [(spec["tieng_vao"], t_in, "punch")]
    for i, s in enumerate(spec["tieng_bien_co"][:2]):
        rows.append((s, hd + 0.04 * i, "punch"))
    if spec.get("dau") and not any(r[0].startswith("impact/") for r in rows[1:]):
        st = min(L["src_start"] for L in layers if L["id"].endswith("_dau"))
        rows.append(("impact/punch", st + 0.12, "punch"))
    out = []
    for snd, t, purpose in rows:
        g = sfx_gen.clean_gen({"sound": snd})
        if not g:
            continue
        it = {"sfx_id": "es:" + g["sound"], "gen": g, "source_id": sid, "src_time": round(t, 3),
              "purpose": purpose, "why": "hinh minh hoa: %s" % spec["y_tuong"][:120], "_hook_visual": True}
        if moment.get("anchor") == "hook":
            it["anchor"] = "hook"
        out.append(it)
    return out


def apply(plan, spec, img, moment, canvas=(1080, 1920)):
    """Dat hinh minh hoa vao plan (thay ban cu): assets + layers + plan['hook']['minh_hoa'] (FX-plan dong bo camera)."""
    face = (plan.get("faces") or {}).get(moment.get("source_id"))
    assets, layers, hits = build_layers(spec, img, moment, canvas, face=face)
    keep_a = [a for a in plan.get("assets") or [] if not str(a.get("id") or "").startswith("hv_")]
    plan["assets"] = keep_a + assets
    plan["layers"] = [L for L in plan.get("layers") or [] if not L.get("hook_visual")] + layers
    h0 = float(moment["src_start"])
    plan.setdefault("hook", {})["minh_hoa"] = {
        "chu_the": spec["chu_the"], "bien_co": spec["bien_co"], "dong_tac": spec["dong_tac"], "y_tuong": spec["y_tuong"],
        "dau": (spec.get("dau") or {}).get("chu"), "ben": "sau nguoi noi" if any(L.get("behind") for L in layers)
        else spec["ben"],
        "nhip_giay_tu_dau_hook": hits, "vat_vao_luc": round(spec["xuat_hien"] - h0, 2),
        "bien_co_luc": round(spec["hanh_dong"] - h0, 2), "_v": VERSION}
    return layers


def apply_audio(plan, spec, moment):
    """Tieng cua hinh minh hoa vao DAU plan['audio'] (khong bi cat khi qua so SFX); bo tieng hook khac trung luc."""
    import engine
    layers = [L for L in plan.get("layers") or [] if L.get("hook_visual")]
    got = build_audio(spec, moment, layers)
    ts = [a["src_time"] for a in got]
    plan["audio"] = [a for a in plan.get("audio") or [] if not a.get("_hook_visual") and not (
        (a.get("anchor") == "hook" or a.get("_hook_rule")) and any(abs(providers._f(a.get("src_time"), -9) - t) < 0.3
                                                                    for t in ts))]
    plan["audio"] = got + plan["audio"]
    engine.resolve_plan_sfx(plan)
    return got


FX_NOTE = """
HOOK DA CO HINH MINH HOA THEO NOI DUNG (hook.minh_hoa: vat + dong tac + nhip): hieu ung cua ban cho hook CHI lo CAMERA
(1 transform: dap / rung / chop sang TRUNG dung hook.minh_hoa.nhip_giay_tu_dau_hook) + toi da 1 lop phu NHE ho tro (vd toi
vien, tia tap trung mo) — KHONG ve them hieu ung dac biet khac (set, kinh vo, glitch...), KHONG ve gi de len vat minh hoa
(phia hook.minh_hoa.ben)."""
