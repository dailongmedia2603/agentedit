# -*- coding: utf-8 -*-
"""HINH MINH HOA CO MUC DICH CHO THAN VIDEO (THU NGHIEM, CHUA NOI VAO APP).

Lich su:
- 2026-10-20 (1): user "ap dung co che hinh minh hoa cua hook (hop dong xe) cho cac phan noi bat ca video".
- 2026-10-20 (2): user che ban dau "hieu ung lam cho co, khong muc dich, khong phu hop. Moi hieu ung phai co MUC DICH va Y
  NGHIA, phu hop boi canh + chu de video, dam bao ngay khi lap plan". Do that ban dau: chi tieu "1 diem / 8-12s" ep AI rai
  hinh; dien CHU khong dien NGHIA ("rao can" -> thanh barie, "met moi" -> ly ca phe — vat ngoai the gioi cau chuyen);
  dong tac sai sac thai ("bung ra" cho "AI thay nguoi"); code tu doi thiet ke (bo dau "24/24" ma giu anh ghe trong vo
  nghia); lap lai chinh hook (hop dong xe 2 lan).

LUAT (hook_fx.LUAT_Y_NGHIA, dung chung voi hook):
1. KHONG chi tieu so luong — so diem do CAU CHUYEN quyet dinh, tha it ma dung.
2. Moi diem khai MUC DICH (1 trong 4 loai) + "nguoi xem hieu them gi" + "bo di thi mat gi"; khong mat gi -> bo.
3. Vat / hinh thuoc THE GIOI CAU CHUYEN (AI tom tat truoc: nhan vat, do vat, boi canh); an du ngoai the gioi chi khi chinh
   nguoi noi dung an du do.
4. Dien NGHIA cua cau trong mach chuyen, khong dien 1 tu khoa.
5. Dong tac khop SAC THAI (tich cuc / tieu cuc / trung tinh) — code kiem.
6. KIEM DUYET luot 2 (AI khac vai): cham 5 tieu chi, chi giu diem dat.
7. Code KHONG doi thiet ke: diem nao khong dat -> bo han. Khong lap hook, khong lap chu dang hien, khong trung y.
"""
import json
import os

import hook_fx
import hook_visual
import providers

GAP_MIN = 5.0                 # 2 diem minh hoa cach nhau toi thieu (giay timeline) — chong don, khong phai chi tieu
MAX_ITEMS = 10                # tran an toan, KHONG phai muc tieu
MAX_NEW_IMAGES = 6
MUC_DICH = {
    "lam_ro_thong_tin": "lam ro thong tin kho hinh dung bang loi (con so, quy trinh, so sanh truoc / sau, ai lam gi)",
    "nhan_buoc_ngoat": "nhan BUOC NGOAT cua cau chuyen (cu lat, hau qua, ket qua) de nguoi xem khong bo lo",
    "khuech_dai_cam_xuc": "khuech dai cam xuc o DINH cam xuc that cua nguoi noi (dung luc, dung chieu cam xuc)",
    "minh_hoa_hanh_dong": "minh hoa mot HANH DONG / SU VIEC cu the dang duoc ke (ky, gui, huy, thay the...)",
}
# dong tac hop sac thai (tich cuc / tieu cuc / trung tinh)
# bay_vao (vat vao dung canh) + dong_dau la TRUNG TINH ve dong tac -> hop moi sac thai (mau / tieng / chu mang sac thai);
# do that 10-20: bang cu cam bay_vao cho y tieu cuc -> bo nham "dien thoai chat khach doi tien" (diem dat nhat)
SAC_THAI = {"tich_cuc": {"bung_ra", "tang_vot", "bay_vao", "dong_dau"},
            "tieu_cuc": {"roi", "xe_doi", "vo_vun", "bay_mat", "bay_vao", "dong_dau"},
            "trung_tinh": {"bay_vao", "dong_dau"}}
MAU_DAU = {"tich_cuc": "#22C55E", "tieu_cuc": "#E53935", "trung_tinh": "#FFC400"}
DIEM_DAT = 4                  # moi tieu chi kiem duyet >= 4/5

_PROMPT = """Ban la DAO DIEN HINH ANH cho video short. Nhiem vu: tim nhung cho trong THAN video ma MOT hinh minh hoa dong
(VAT + DONG TAC + TIENG) giup nguoi xem HIEU / CAM nhieu hon dieu nguoi noi dang noi — va CHI nhung cho do.
""" + hook_fx.LUAT_Y_NGHIA + """
# BUOC 1 — THE GIOI CAU CHUYEN (ghi vao "the_gioi")
Tom tat: chu de video; nhan vat (ai); do vat / cong cu / san pham CO THAT trong cau chuyen; boi canh; cac AN DU nguoi noi tu
dung (neu co). Hinh minh hoa chi lay tu the gioi nay.

# BUOC 2 — CHON DIEM (khoanh_khac[]: loi noi gio NGUON, cam xuc, su kien, bo cuc, chu_dang_hien)
- Doc ca mach truyen (story_arc). Chi chon cho co dieu NGUOI XEM CAN THAY ma loi noi chua du (dung 1 trong muc_dich).
- KHONG co so luong muc tieu. Video nay co the chi can 2-5 diem. Khong co diem nao xung dang -> "diem": [].
- Chi khoanh khac "bo_cuc" = ["full"]; KHONG chon doan trung hook (hook_doan), KHONG trung y voi diem khac / chu_dang_hien
  (y da co chu to tren man hinh thi chi chon khi hinh them duoc dieu ma chu khong noi duoc).
- Cac diem cach nhau >= 5s.

# BUOC 3 — MOI DIEM
- "y_cau": cau do co NGHIA gi trong mach chuyen (khong phai tu khoa).
- "muc_dich": 1 id trong muc_dich_hop_le; "nguoi_xem_hieu_them": dieu cu the nguoi xem hieu / cam them nho hinh;
  "bo_di_thi_mat": mat gi neu bo hinh nay (tra loi that; "khong mat gi" = khong chon diem nay).
- "chu_the": vat / nhan vat TRONG the_gioi dien dung y_cau; "an_du_cua_nguoi_noi": "" hoac an du chinh nguoi noi dung.
- "sac_thai": "tich_cuc" | "tieu_cuc" | "trung_tinh" cua y_cau; "dong_tac" phai hop sac thai va dien dung bien co
  (danh_sach_dong_tac); "ly_do_dong_tac".
- "hinh": "moi" (tao anh that cua vat — vat_prompt tieng Anh, MOT vat, nen don gian, khong chu, khong tay / nguoi) |
  "dung_lai" (anh_da_co DUNG la vat nay, ghi anh_id) | "khong" (chi dau chu: CHI khi y nam o mot con so / tu ngan ma
  chu_dang_hien CHUA co; dong_tac = "dong_dau").
- "dau_chu": chu IN HOA ngan (<= 3 tu) chi khi lam ro them va KHONG trung chu_dang_hien; "" neu khong can.
- "noi_dung": 0-2 dong CHU THAT ngan (<= 8 tu / dong, tieng Viet tu nhien, dung y cau) hien TREN vat — BAT BUOC khi y nam o
  noi dung cua vat (man hinh chat, tin nhan, giay to, bang so): vd dien thoai + ["Khách: Sao trả lời sai vậy?",
  "Khách: Hoàn tiền cho tôi!"]. "kieu_noi_dung": "bong_chat" (tin nhan) | "nhan" (nhan / con so). Anh AI KHONG co chu doc
  duoc -> vat ma y nam o noi dung, khong co noi_dung = man hinh trong = VO NGHIA -> khong chon.
- TU HOI: nguoi xem nhin hinh 1 GIAY tren dien thoai (khong nghe) co hieu "nguoi_xem_hieu_them" khong? Khong -> bo diem.
- Gio: "xuat_hien" (luc noi ten vat / bat dau y), "hanh_dong" (tu nhan cua bien co, >= 0.6s sau xuat_hien), gio NGUON.
- Tieng (gen_catalog): "tieng_vao" + "tieng_bien_co" = tieng CUA chinh hanh dong tren hinh.

# SCHEMA (CHI JSON, muc PHANG)
{"the_gioi": {"chu_de": "...", "nhan_vat": ["..."], "do_vat": ["..."], "boi_canh": "...", "an_du_nguoi_noi": ["..."]},
 "diem": [{"moment": "<id>", "y_cau": "...", "muc_dich": "<id>", "nguoi_xem_hieu_them": "...", "bo_di_thi_mat": "...",
   "chu_the": "...", "an_du_cua_nguoi_noi": "", "sac_thai": "tieu_cuc", "dong_tac": "<id>", "ly_do_dong_tac": "...",
   "hinh": "moi|dung_lai|khong", "anh_id": "", "vat_ten": "...", "vat_prompt": "", "dau_chu": "",
   "noi_dung": [], "kieu_noi_dung": "bong_chat",
   "xuat_hien": 12.3, "hanh_dong": 13.1, "ben": "phai", "tieng_vao": "<gen id>", "tieng_bien_co": ["<gen id>"]}]}
⚠️ TRA VE CHI JSON GOC."""

_REVIEW = """Ban la BIEN TAP VIEN KHO TINH kiem duyet hinh minh hoa truoc khi dua vao video. Ban KHONG thiet ke, chi PHAN BIEN.
""" + hook_fx.LUAT_Y_NGHIA + """
Voi MOI de_xuat (kem loi noi xung quanh, mach truyen, the_gioi), cham 1-5 tung tieu chi (5 = hoan toan dat):
- "muc_dich": hinh nay phuc vu muc dich khai THAT SU; nguoi xem hieu / cam them ro rang; bo di THI MAT dieu do.
- "dung_nghia": hinh dien NGHIA cua cau trong mach chuyen (khong phai choi chu 1 tu khoa).
- "thuoc_the_gioi": vat thuoc the gioi cau chuyen (hoac la an du chinh nguoi noi dung); khong lac de / ky cuc.
- "dong_tac_khop": dong tac dung sac thai + bien co (vd "bung ra" khong dung cho dieu tieu cuc).
- "khong_thua": khong trung hook / chu dang hien / diem khac; khong chen vao cau dem / chuyen y nho.
- "doc_duoc_1_giay": nhin hinh (vat + dong tac + noi_dung chu that neu co) 1 giay, KHONG nghe, nguoi xem hieu y. Vat ma y
  nam o noi dung (man hinh, giay to) ma khong co noi_dung -> 1 diem.
"giu": true CHI KHI moi tieu chi >= 4. Nghiem khac: nghi ngo thi bo. "ly_do" ngan, cu the.
SCHEMA (CHI JSON): {"danh_gia": [{"moment": "<id>", "diem": {"muc_dich": 1, "dung_nghia": 1, "thuoc_the_gioi": 1,
"dong_tac_khop": 1, "khong_thua": 1, "doc_duoc_1_giay": 1}, "giu": false, "ly_do": "..."}]}
⚠️ TRA VE CHI JSON GOC."""


def _km(moments, hook_range=None):
    out = []
    for m in moments:
        if m.get("anchor") == "hook":
            continue
        r = {k: m.get(k) for k in ("id", "src_start", "src_end", "timeline_start", "beat", "purpose", "loi_noi", "cam_xuc",
                                   "su_kien", "bo_cuc") if m.get(k) is not None}
        chu = [c.get("text") for c in m.get("chu_tren_man_hinh") or [] if isinstance(c, dict) and c.get("text")]
        if chu:
            r["chu_dang_hien"] = chu[:4]
        if hook_range and m.get("src_start") is not None and providers._overlap(
                float(m["src_start"]), float(m["src_end"]), hook_range[0], hook_range[1]):
            r["trung_hook"] = True
        out.append(r)
    return out


def design(moments, story=None, style=None, assets=None, log=None, hook_range=None):
    """Luot 1: AI tom tat the gioi cau chuyen + chon diem CO MUC DICH (khong chi tieu)."""
    payload = {"cau_chuyen": story or {}, "phong_cach": style or {}, "khoanh_khac": _km(moments, hook_range),
               "hook_doan": list(hook_range) if hook_range else None, "muc_dich_hop_le": MUC_DICH,
               "danh_sach_dong_tac": hook_visual.DONG_TAC, "gen_catalog": hook_visual.gen_catalog(),
               "anh_da_co": [{"anh_id": a["id"], "mo_ta": (a.get("illustrates") or a.get("prompt") or "")[:200]}
                             for a in assets or [] if a.get("kind") == "ai_image" and a.get("path")]}
    if log:
        log("Body-visual: %s doc the gioi cau chuyen + chon diem co muc dich..." % providers.plan_ai_name())
    text = providers.plan_chat([{"role": "system", "content": _PROMPT},
                                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
                               json_mode=True, max_tokens=12000, temperature=0.4, req_timeout=400, max_attempts=2,
                               step_label="Body-visual")
    return providers._safe_json(text) or {}


def review(res, moments, story=None, log=None):
    """Luot 2: bien tap vien phan bien tung de xuat (5 tieu chi). Tra {moment: danh_gia}."""
    by = {m["id"]: m for m in moments}
    order = sorted([m for m in moments if m.get("anchor") != "hook"], key=lambda m: m.get("timeline_start", 0))
    idx = {m["id"]: i for i, m in enumerate(order)}
    rows = []
    for d in (res or {}).get("diem") or []:
        m = by.get(d.get("moment")) if isinstance(d, dict) else None
        if not m:
            continue
        i = idx.get(m["id"], 0)
        xq = [{"text": " ".join(x.get("text", "") for x in (order[j].get("loi_noi") or []))}
              for j in range(max(0, i - 2), min(len(order), i + 3))]
        rows.append({"de_xuat": d, "loi_noi_xung_quanh": xq,
                     "chu_dang_hien": [c.get("text") for c in m.get("chu_tren_man_hinh") or [] if isinstance(c, dict)]})
    if not rows:
        return {}
    if log:
        log("Body-visual: bien tap vien kiem duyet %d de xuat..." % len(rows))
    text = providers.plan_chat([{"role": "system", "content": _REVIEW},
                                {"role": "user", "content": json.dumps(
                                    {"cau_chuyen": story or {}, "the_gioi": (res or {}).get("the_gioi"), "de_xuat": rows},
                                    ensure_ascii=False)}],
                               json_mode=True, max_tokens=6000, temperature=0.2, req_timeout=300, max_attempts=2,
                               step_label="Body-visual-review")
    out = {}
    for r in (providers._safe_json(text) or {}).get("danh_gia") or []:
        if isinstance(r, dict) and r.get("moment"):
            out[r["moment"]] = r
    return out


_REVISE = """Ban la DAO DIEN HINH ANH. Bien tap vien da BAC mot so de xuat cua ban (kem ly do + diem tung tieu chi). Voi
MOI de xuat bi bac: neu SUA duoc de dat MOI tieu chi (vd them "noi_dung" chu that cho vat co man hinh / giay to, doi dong
tac cho dung sac thai, doi cho / doi vat thuoc the gioi cau chuyen, bo dau trung chu) thi tra ban SUA (cung schema diem
cu, giu "moment"); KHONG sua duoc ma van giu muc dich that -> BO (khong tra lai). Khong them diem moi, khong chon lai
diem trung chu dang hien.
""" + hook_fx.LUAT_Y_NGHIA + """
SCHEMA (CHI JSON): {"diem": [<diem da sua, cung schema>]}
⚠️ TRA VE CHI JSON GOC."""


def revise(res, reviews, moments, story=None, log=None):
    """1 luot DAO DIEN SUA theo nhan xet bien tap (khong phai code tu doi): tra {"diem": [diem da sua]}."""
    bad = [d for d in (res or {}).get("diem") or [] if isinstance(d, dict)
           and not ((reviews or {}).get(d.get("moment")) or {}).get("giu")]
    if not bad:
        return {"diem": []}
    rows = [{"de_xuat": d, "nhan_xet": (reviews or {}).get(d.get("moment"))} for d in bad]
    if log:
        log("Body-visual: dao dien sua %d de xuat theo nhan xet bien tap..." % len(rows))
    text = providers.plan_chat([{"role": "system", "content": _REVISE},
                                {"role": "user", "content": json.dumps(
                                    {"cau_chuyen": story or {}, "the_gioi": (res or {}).get("the_gioi"), "bi_bac": rows,
                                     "khoanh_khac": [m for m in _km(moments) if m["id"] in {d.get("moment") for d in bad}],
                                     "danh_sach_dong_tac": hook_visual.DONG_TAC, "gen_catalog": hook_visual.gen_catalog()},
                                    ensure_ascii=False)}],
                               json_mode=True, max_tokens=6000, temperature=0.4, req_timeout=300, max_attempts=2,
                               step_label="Body-visual-revise")
    return providers._safe_json(text) or {"diem": []}


def _norm(t):
    import unicodedata
    t = unicodedata.normalize("NFD", str(t or "").lower().replace("đ", "d"))
    return "".join(c for c in t if c.isalnum())


def _dup_text(chu, texts):
    """dau chu trung chu do hoa dang hien (bo dau, bo khoang trang; chua nhau)."""
    a = _norm(chu)
    return bool(a) and any(a in _norm(x) or (_norm(x) and _norm(x) in a and len(_norm(x)) >= 3) for x in texts)


def clean(res, moments, assets, reviews=None, hook_range=None, log=None):
    """Kiem tung diem — KHONG DOI thiet ke, khong dat thi BO (ghi ly do). Tra [spec]."""
    import sfx_gen
    say = log or (lambda m: None)
    by = {m["id"]: m for m in moments}
    order = sorted([m for m in moments if m.get("anchor") != "hook"], key=lambda m: m.get("timeline_start", 0))
    nxt = {a["id"]: b for a, b in zip(order, order[1:])}
    ids = {a["id"]: a for a in assets or [] if a.get("path")}
    out, last_tl, n_new = [], -99.0, 0
    f = providers._f
    for d in sorted([x for x in (res or {}).get("diem") or [] if isinstance(x, dict)],
                    key=lambda x: f((by.get(x.get("moment")) or {}).get("timeline_start"), 0)):
        mid = d.get("moment")
        m = by.get(mid)

        def bo(ly_do):
            say("BO %s: %s" % (mid, ly_do))
        if not m or m.get("anchor") == "hook" or "full" not in (m.get("bo_cuc") or []):
            bo("khoanh khac khong ton tai / khong phai bo cuc full")
            continue
        if hook_range and providers._overlap(float(m["src_start"]), float(m["src_end"]), hook_range[0], hook_range[1]):
            bo("trung doan hook (lap lai hook)")
            continue
        rv = (reviews or {}).get(mid) if reviews is not None else {"giu": True, "diem": {}}
        if reviews is not None:
            sc = (rv or {}).get("diem") or {}
            low = [k for k in ("muc_dich", "dung_nghia", "thuoc_the_gioi", "dong_tac_khop", "khong_thua",
                               "doc_duoc_1_giay") if f(sc.get(k), 0) < DIEM_DAT]
            if not rv or not rv.get("giu") or low:
                bo("kiem duyet KHONG dat (%s): %s" % (", ".join(low) or "giu=false", str((rv or {}).get("ly_do"))[:160]))
                continue
        if d.get("muc_dich") not in MUC_DICH or len(str(d.get("nguoi_xem_hieu_them") or "")) < 15:
            bo("khong co muc dich hop le / khong noi duoc nguoi xem hieu them gi")
            continue
        mat = _norm(d.get("bo_di_thi_mat"))
        if len(mat) < 10 or "khongmatgi" in mat:
            bo("bo di khong mat gi")
            continue
        st = d.get("sac_thai") if d.get("sac_thai") in SAC_THAI else None
        if not st or d.get("dong_tac") not in SAC_THAI[st] or d.get("dong_tac") not in hook_visual.DONG_TAC:
            bo("dong tac '%s' khong hop sac thai '%s'" % (d.get("dong_tac"), d.get("sac_thai")))
            continue
        hinh = d.get("hinh") if d.get("hinh") in ("moi", "dung_lai", "khong") else None
        shown = [c.get("text") for x in (m, nxt.get(mid) or {}) for c in x.get("chu_tren_man_hinh") or []
                 if isinstance(c, dict) and c.get("text")]
        dau_chu = str(d.get("dau_chu") or "").strip()
        if dau_chu and _dup_text(dau_chu, shown):
            bo("dau '%s' trung chu dang hien" % dau_chu)
            continue
        if hinh == "khong" and (not dau_chu or d.get("dong_tac") != "dong_dau"):
            bo("chi dau chu nhung khong co dau / sai dong tac")
            continue
        if d.get("dong_tac") == "dong_dau" and not dau_chu:
            bo("dong dau ma khong co chu")
            continue
        if hinh == "dung_lai" and d.get("anh_id") not in ids:
            bo("anh dung lai '%s' khong co" % d.get("anh_id"))
            continue
        if hinh == "moi" and (len(str(d.get("vat_prompt") or "")) < 12 or n_new >= MAX_NEW_IMAGES):
            bo("thieu mo ta anh / qua so anh moi")
            continue
        if not hinh:
            bo("thieu loai hinh")
            continue
        n2 = nxt.get(mid)
        a = float(m["src_start"])
        b = float(n2["src_end"]) if n2 and n2.get("source_id") == m.get("source_id") and abs(
            float(n2["src_start"]) - float(m["src_end"])) < 0.6 else float(m["src_end"])
        if b - a < 1.4:
            bo("khoanh khac qua ngan")
            continue
        xa = min(max(f(d.get("xuat_hien"), a), a), b - 1.2)
        hd = min(max(f(d.get("hanh_dong"), xa + 0.8), xa + 0.6), b - 0.5)
        tl = float(m.get("timeline_start") or 0) + (xa - a)
        if tl - last_tl < GAP_MIN:
            bo("sat diem truoc (< %.0fs)" % GAP_MIN)
            continue
        g_in = sfx_gen.clean_gen(d.get("tieng_vao")) if d.get("tieng_vao") else None
        tb = d.get("tieng_bien_co")
        acts = [x for x in (sfx_gen.clean_gen(y) for y in ([tb] if isinstance(tb, str) else tb or [])[:2] if y) if x]
        spec = {"moment": mid, "chu_the": str(d.get("chu_the") or "")[:60], "bien_co": str(d.get("y_cau") or "")[:120],
                "y_tuong": str(d.get("nguoi_xem_hieu_them") or "")[:240], "dong_tac": d["dong_tac"], "hinh": hinh,
                "muc_dich": d["muc_dich"], "sac_thai": st, "bo_di_thi_mat": str(d.get("bo_di_thi_mat"))[:200],
                "anh_id": d.get("anh_id") if hinh == "dung_lai" else None,
                "vat": {"ten": str(d.get("vat_ten") or "")[:60], "prompt": str(d.get("vat_prompt") or "")[:900]},
                "dau": {"chu": dau_chu.upper()[:14], "mau": MAU_DAU[st]} if dau_chu else None,
                "xuat_hien": round(xa, 3), "hanh_dong": round(hd, 3), "ben": "trai" if d.get("ben") == "trai" else "phai",
                "tieng_vao": (g_in or {}).get("sound") or hook_visual.TIENG_MAC_DINH[d["dong_tac"]][0],
                "tieng_bien_co": [x["sound"] for x in acts] or hook_visual.TIENG_MAC_DINH[d["dong_tac"]][1],
                "vi_sao": str(d.get("ly_do_dong_tac") or "")[:300], "kiem_duyet": (rv or {}).get("ly_do"),
                "noi_dung": [str(x).strip()[:60] for x in (d.get("noi_dung") or []) if str(x).strip()][:2],
                "kieu_noi_dung": "nhan" if d.get("kieu_noi_dung") == "nhan" else "bong_chat",
                "_window": (a, b), "_source": m.get("source_id"), "_timeline": round(tl, 2),
                "_avoid": [tuple(c["vung"]) for x in (m, nxt.get(mid) or {}) for c in x.get("chu_tren_man_hinh") or []
                           if isinstance(c, dict) and isinstance(c.get("vung"), list) and len(c["vung"]) == 4]}
        out.append(spec)
        last_tl = tl
        n_new += 1 if hinh == "moi" else 0
        if len(out) >= MAX_ITEMS:
            break
    return out


# ---------------------------------------------------------------------------
# DAT HINH VAO CHO TRONG THAT (phan mang y khong bi nguoi noi che) — do that 2026-10-20: khung "ghe trong" sau dau bi che het
# ---------------------------------------------------------------------------
VIS_MIN = 0.85                # >= 85% vat phai nam ngoai vung nguoi noi
W_MIN = 0.4                   # vat nho hon -> khong du ro tren dien thoai -> khong chen (do that 10-20: vat 0.27-0.3 o goc
                              # tren dau -> AI xem anh that "qua nho, khong doc kip")
UI_BOTTOM = 0.82


def person_boxes(face):
    """Vung nguoi noi che (dau + than) uoc tu plan['faces'] (cx, cy, w, h; phan so khung)."""
    cx, cy = float(face.get("cx", 0.5)), float(face.get("cy", 0.45))
    fw, fh = float(face.get("w") or face.get("h", 0.3) * 1.2), float(face.get("h", 0.3))
    head = (cx - 0.48 * fw, cy - 0.8 * fh, cx + 0.48 * fw, cy + 0.68 * fh)
    torso = (max(0.0, cx - 0.62), head[3] - 0.06, min(1.0, cx + 0.62), 1.0)
    return [head, torso]


def _ov(a, b):
    return max(0.0, min(a[2], b[2]) - max(a[0], b[0])) * max(0.0, min(a[3], b[3]) - max(a[1], b[1]))


def place_visible(face, ratio, canvas=(1080, 1920), side="phai", avoid=None):
    """(x, y, w) cho vat ti le cao/rong `ratio` sao cho >= VIS_MIN dien tich NGOAI nguoi noi, to nhat co the. None neu
    khong co cho (khi do KHONG chen)."""
    Wc, Hc = canvas
    boxes = person_boxes(face or {})
    best = None
    for w in (0.56, 0.5, 0.45, W_MIN):
        h = w * Wc * ratio / Hc
        if h > UI_BOTTOM - 0.04:
            continue
        xs = [round(w / 2 + 0.02 + i * 0.02, 3) for i in range(int((1 - w - 0.04) / 0.02) + 1)]
        ys = [round(h / 2 + 0.03 + j * 0.02, 3) for j in range(max(1, int((UI_BOTTOM - h - 0.03) / 0.02) + 1))]
        for x in xs:
            for y in ys:
                b = (x - w / 2, y - h / 2, x + w / 2, y + h / 2)
                area = w * h
                vis = 1 - min(1.0, sum(_ov(b, p) for p in boxes) / area)
                if vis < VIS_MIN or sum(_ov(b, q) for q in avoid or []) > 0.03 * area:
                    continue                     # bi nguoi che / de len chu do hoa dang hien
                score = area * vis + (0.002 if (x > 0.5) == (side == "phai") else 0)
                if not best or score > best[0]:
                    best = (score, x, y, w)
        if best:
            break
    return None if not best else (best[1], best[2], best[3])


def label_layers(spec, P, sid, x, y, w, h, st, en):
    """Chu THAT tren vat (bong chat / nhan): y nam o noi dung -> app ve chu, khong trong vao anh AI."""
    out = []
    lines = spec.get("noi_dung") or []
    for j, t in enumerate(lines):
        chat = spec.get("kieu_noi_dung") != "nhan"
        out.append({"id": "%snd%d" % (P, j), "type": "text", "source_id": sid, "src_start": round(st + 0.12 * j, 3),
                    "src_end": round(en, 3), "x": round(x, 4), "y": round(y - h * 0.18 + j * (h * 0.36), 4),
                    "maxWidth": round(min(0.6, max(0.3, w * 1.05)), 3), "track": 66, "hook_visual": True,
                    "spans": [{"text": t, "size": 46, "color": "#0B1220" if chat else "#FFFFFF"}],
                    "box": {"color": "#FFFFFF" if chat else "#E53935", "radius": 0.035, "padX": 0.03, "padY": 0.014},
                    "shadow": [{"x": 0, "y": 8, "blur": 18, "color": "rgba(0,0,0,.45)"}],
                    "enter": {"preset": "pop", "duration": 0.3}, "exit": {"preset": "fade", "duration": 0.15}})
    return out


VISUAL_QA = """Ban la nguoi xem kho tinh luot TikTok. Moi hinh minh hoa co 2 anh CHUP THAT tu video da dung (luc vat vao,
luc bien co). Nhin ANH (khong doc mo ta truoc), tra loi that:
- "nhin_thay": ban THAY gi tren anh (vat gi, o dau, co chu gi doc duoc).
- "phan_mang_y_bi_che": phan mang y (vat / chi tiet / chu) co bi nguoi noi che, qua nho, mo, cat khung khong.
- "hieu_trong_1_giay": doc "y_muon_truyen" roi nhin lai anh: nguoi xem luot qua 1 giay (khong nghe) co hieu y do khong.
- "giu": true CHI KHI thay ro + khong bi che + hieu trong 1 giay. Nghi ngo -> false.
SCHEMA (CHI JSON): {"danh_gia": [{"id": "bv0", "nhin_thay": "...", "phan_mang_y_bi_che": false, "hieu_trong_1_giay": true,
"giu": true, "ly_do": "..."}]}
⚠️ TRA VE CHI JSON GOC."""


def visual_qa(items, log=None):
    """items: [{id, y_muon_truyen, frames: [path]}] -> {id: danh_gia}. AI XEM ANH THAT cua video da dung."""
    imgs, rows = [], []
    for it in items:
        rows.append({"id": it["id"], "y_muon_truyen": it["y_muon_truyen"]})
        for k, fp in enumerate(it["frames"]):
            imgs.append({"path": fp, "label": "%s — %s" % (it["id"], "luc vat vao" if k == 0 else "luc bien co")})
    if not rows:
        return {}
    if log:
        log("Kiem duyet bang mat: %s xem %d anh that cua %d hinh minh hoa..." % (providers.plan_ai_name(), len(imgs),
                                                                               len(rows)))
    text = providers.plan_chat([{"role": "system", "content": VISUAL_QA},
                                {"role": "user", "content": json.dumps({"hinh_minh_hoa": rows}, ensure_ascii=False)}],
                               json_mode=True, max_tokens=3000, temperature=0.2, req_timeout=300, max_attempts=2,
                               step_label="Body-visual-QA", images=imgs)
    return {r["id"]: r for r in (providers._safe_json(text) or {}).get("danh_gia") or [] if isinstance(r, dict) and r.get("id")}


def make_images(specs, style="", log=None):
    """Tao song song anh 'moi' (Codex, tach nen) -> spec['_img']."""
    import asset_gen
    reqs = [{"id": "bv%d" % i, "prompt": s["vat"]["prompt"], "aspect": "1:1", "cutout": True,
             "context": {"vai_tro": "vat minh hoa dong trong video (tach nen)", "cau_noi": s["bien_co"]}}
            for i, s in enumerate(specs) if s["hinh"] == "moi"]
    res = asset_gen.gen_many(reqs, style=style or "", log=log) if reqs else {}
    for i, s in enumerate(specs):
        r = res.get("bv%d" % i) or {}
        p = r.get("cutout") or r.get("path")
        if p and os.path.isfile(p):
            s["_img"] = hook_visual._trim(p)
    return specs


def _stamp_only(spec, P, sid, a, b, behind):
    st = spec["hanh_dong"]
    d = spec["dau"]
    side = 1 if spec["ben"] == "phai" else -1
    L = {"id": P + "dau", "type": "text", "source_id": sid, "src_start": round(st - 0.05, 3),
         "src_end": round(min(b, st + 1.6), 3), "x": round(0.5 + side * 0.22, 4), "y": 0.3, "rotation": -10 * side,
         "track": 64, "hook_visual": True, "uppercase": True,
         "spans": [{"text": d["chu"], "size": hook_visual.stamp_size(d["chu"]), "color": d["mau"], "stroke": {"color": "#FFFFFF", "width": 7}}],
         "box": {"color": "rgba(255,255,255,0.0)", "radius": 0.02, "padX": 0.025, "padY": 0.008,
                 "border": "12px solid %s" % d["mau"]},
         "keyframes": [{"t": 0, "scale": 2.8, "opacity": 0}, {"t": 0.12, "scale": 1.0, "opacity": 1, "easing": "ease_in"},
                       {"t": 0.2, "scale": 1.1, "easing": "ease_out"}, {"t": 0.3, "scale": 1.0, "easing": "back_out"},
                       {"t": 1.3, "scale": 1.0, "opacity": 1}, {"t": 1.55, "scale": 0.6, "opacity": 0, "easing": "ease_in"}]}
    return [L]                                  # dau o than video: TRUOC nguoi noi (luat che mat tu ne)


def apply(plan, specs, canvas=(1080, 1920)):
    """Dat cac diem vao plan: assets + layers (prefix bv<n>) + camera rung nhe + tieng cua hanh dong. Tra so diem dat."""
    import engine
    faces = plan.get("faces") or {}
    assets_by = {a["id"]: a for a in plan.get("assets") or [] if a.get("id")}
    trs = [(float(e.get("src_start", 0)), float(e.get("src_end", 0))) for e in plan.get("fx") or []
           if e.get("kind") == "transform" and e.get("anchor") != "hook"]
    new_layers, new_assets, new_fx, new_audio, n = [], [], [], [], 0
    for i, s in enumerate(specs):
        P = "bv%d" % i
        sid = s["_source"]
        a, b = s["_window"]
        face = faces.get(sid)
        behind = float((face or {}).get("w") or 0) >= hook_visual.CLOSEUP_FACE_W
        if s["hinh"] == "khong":
            layers = _stamp_only(s, P + "_", sid, a, b, behind)
            assets = []
        else:
            img = s.get("_img")
            if s["hinh"] == "dung_lai":
                img = (assets_by.get(s["anh_id"]) or {}).get("path")
            if not img or not os.path.isfile(img):
                continue
            # than video: vat chi o lai toi ~1.4s sau bien co (khong de lai suot ca doan)
            mom = {"source_id": sid, "src_start": a, "src_end": min(b, s["hanh_dong"] + 1.4)}
            from PIL import Image
            iw, ih = Image.open(img).size
            pl = place_visible(face or {}, ih / float(iw), canvas, s["ben"], avoid=s.get("_avoid"))
            if not pl:
                s["_bo"] = "khong co cho trong du lon de thay ro vat (nguoi noi chiem het khung)"
                continue
            assets, layers, _hits = hook_visual.build_layers(s, img, mom, canvas, face=face, prefix=P, anchor=None,
                                                             place=pl)
            hh = pl[2] * canvas[0] * ih / float(iw) / canvas[1]
            layers += label_layers(s, P + "_", sid, pl[0], pl[1], pl[2], hh, s["xuat_hien"] + 0.3, s["hanh_dong"])
            for L in layers:
                if L["id"].endswith("_dau"):            # dau: TRUOC nguoi noi, phia tren canh dau (khong bi dau che)
                    L.pop("behind", None)
                    L["x"], L["y"] = (0.5 + (0.24 if s["ben"] == "phai" else -0.24), 0.24)
            if s["hinh"] == "dung_lai":
                for L in layers:
                    if L["type"] == "image":
                        L["mask"] = "round"
                        L["border"] = "8px solid #FFFFFF"
                for x in assets:
                    x.pop("alpha", None)
        new_layers += layers
        new_assets += assets
        # camera: rung nhe + chop nho dung luc bien co (khong chong transform da co)
        c0, c1 = s["xuat_hien"], min(b, s["hanh_dong"] + 0.6)
        # CHI rung khi bien co la CU VA that (xe / vo / dap dau) — rung mac dinh moi diem = "lam cho co" (kiem duyet 10-20)
        if s["dong_tac"] in ("xe_doi", "vo_vun", "dong_dau") and not any(x < c1 and y > c0 for x, y in trs):
            new_fx.append({"id": P + "cam", "kind": "transform", "layer": "front", "source_id": sid,
                           "src_start": round(c0, 3), "src_end": round(c1, 3), "code": hook_fx.SHAKE_FLASH.strip(),
                           "params": {"colors": [], "intensity": 0.6,
                                      "hits": [0.16 if s["hinh"] != "khong" else round(s["hanh_dong"] - c0, 3),
                                               round(s["hanh_dong"] - c0, 3)]},
                           "context": "nhip minh hoa than video", "goal": "dap nhip", "why_fit": s["vi_sao"][:120],
                           "visual": "rung nhe + chop nho trung luc vat vao / bien co", "y_nghia": s["y_tuong"][:120]})
            trs.append((c0, c1))
        mom = {"source_id": sid, "src_start": a, "src_end": b}
        new_audio += hook_visual.build_audio(s, mom, layers)
        n += 1
    plan["assets"] = [x for x in plan.get("assets") or [] if not str(x.get("id") or "").startswith("bv")] + new_assets
    plan["layers"] = [L for L in plan.get("layers") or [] if not str(L.get("id") or "").startswith("bv")] + new_layers
    plan["fx"] = [e for e in plan.get("fx") or [] if not str(e.get("id") or "").startswith("bv")] + new_fx
    ts = [(x["source_id"], x["src_time"]) for x in new_audio]
    plan["audio"] = new_audio + [x for x in plan.get("audio") or [] if x.get("anchor") == "hook" or x.get("_hook_rule")
                                 or not any(x.get("source_id") == s_ and abs(providers._f(x.get("src_time"), -9) - t) < 0.35
                                            for s_, t in ts)]
    engine.resolve_plan_sfx(plan)
    return n
