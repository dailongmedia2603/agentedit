# -*- coding: utf-8 -*-
"""NOI DUNG THAT CHO CANH CHIA DOI (buoc "Split-visual" — user 2026-10-20).

Lich su:
- Video quay can mat: hinh minh hoa nho dat goc tren dau + chu de len anh -> AI xem anh that bac ca 4 ("nho, chu che anh,
  khong doc kip"). User chon "chia doi man hinh" (nua tren minh hoa, nua duoi nguoi noi).
- Plan goc DA CO canh chia doi (anh AI nua tren) dung y nhung anh TINH: man hinh dien thoai / giay to khong co chu doc duoc.
- Ban thu 1 dan bong chu + nhan do len anh -> user: "xau qua" (chu troi tren anh laptop, nhan do de len man hinh). Luat
  THAM MY: noi dung dang tin nhan / man hinh -> KHUNG CHAT duoc thiet ke (lop "chat", app ve theo bang mau video), moi
  canh 1 khoi noi dung + toi da 1 diem nhan (nam trong dong trang thai cua khung), xep vao khoang TRONG cua panel.

Co che: AI xem canh chia doi DANG CO + loi noi tung luc -> NANG CAP canh nao y nam o NOI DUNG (tin nhan, trang thai) bang
khung chat, tin hien DUNG LUC nguoi noi nhac toi. Moi de xuat khai muc dich (hook_fx.LUAT_Y_NGHIA) -> bien tap vien phan
bien (biet chu do hoa dang hien cua canh) -> code xep vao cho trong, khong dat thi bo.
"""
import json

import hook_fx
import providers

PANEL_TOP, PANEL_BOT = 0.06, 0.47        # vung ve trong panel nua tren (split panel_ratio 0.5)
MAX_MSG = 4
VAI = ("khach", "agent", "minh")

_PROMPT = """Ban la DAO DIEN HINH ANH. Video quay CAN mat nen noi dung minh hoa dat trong CANH CHIA DOI: nua tren la PANEL
(anh nen dung chu de), nua duoi la nguoi noi. Nhiem vu: lam canh chia doi TRUYEN DUOC Y bang NOI DUNG THAT doc duoc, hien
dung luc nguoi noi nhac toi — va dep, nhu mot thiet ke, khong phai chu dan len anh.
""" + hook_fx.LUAT_Y_NGHIA + """
# DU LIEU
- canh_chia_doi_dang_co[]: canh chia doi plan da co (gio NGUON, anh nen + mo ta, ly do, chu_dang_hien = chu do hoa dang co).
  Anh AI KHONG co chu doc duoc.
- khoanh_khac[]: loi noi gio NGUON. the_gioi: the gioi cau chuyen (co the rong).
# VIEC
1. Voi MOI canh dang co: NANG CAP chi khi Y cua canh nam o NOI DUNG ma anh khong the hien duoc (tin nhan qua lai, trang
   thai). Y da ro bang anh / chu_dang_hien -> KHONG nang cap.
2. HINH THUC (luat tham my): noi dung la tin nhan / hoi dap -> "tin_nhan" (app ve thanh KHUNG CHAT that theo mau video:
   ten khung, tin trai = khach, tin phai = agent / minh). MOT khung chat / canh, 2-4 tin, moi tin <= 9 tu, tieng Viet tu
   nhien DUNG y loi noi luc do (dien dat lai cho ro, KHONG bia so lieu). "luc" = gio NGUON nguoi noi nhac toi y tin do.
   Diem nhan (vd "TRẢ LỜI 24/24", "CHƯA AI TRẢ LỜI") -> "trang_thai" cua khung chat (khong lam nhan rieng de len anh).
3. KHONG lap tu / Y cua chu_dang_hien; khong lap hook (hook_doan).
4. Moi canh khai "muc_dich", "nguoi_xem_hieu_them", "bo_di_thi_mat" (luat y nghia).
# SCHEMA (CHI JSON)
{"nang_cap": [{"canh": <so thu tu trong canh_chia_doi_dang_co>, "muc_dich": "...", "nguoi_xem_hieu_them": "...",
   "bo_di_thi_mat": "...", "ten_khung": "Khách hàng", "trang_thai": "",
   "tin_nhan": [{"vai": "khach", "chu": "...", "luc": 125.4}]}]}
⚠️ TRA VE CHI JSON GOC."""

_REVIEW = """Ban la BIEN TAP VIEN KHO TINH. Duyet tung de xuat KHUNG CHAT dat trong nua tren canh chia doi (anh nen + khung chat
that theo mau video, tin hien theo loi noi). Chi phan bien, khong thiet ke.
""" + hook_fx.LUAT_Y_NGHIA + """
Cham 1-5: "muc_dich", "dung_nghia" (tin khop loi noi luc do, khong bia), "phu_hop_chu_de", "khong_thua" (khong lap
chu_dang_hien_canh / hook / canh khac; lap tu / Y -> <= 2), "doc_duoc_1_giay" (tin ngan, ro, nguoi luot hieu ngay).
"giu": true CHI KHI moi tieu chi >= 4.
SCHEMA (CHI JSON): {"danh_gia": [{"id": "<id de xuat>", "diem": {...}, "giu": true, "ly_do": "..."}]}
⚠️ TRA VE CHI JSON GOC."""


def _texts_in(plan, sid, a, b):
    """Lop chu do hoa (khong phai minh hoa) dang hien trong [a, b] gio nguon: [(chu, y, cao)]."""
    out = []
    for L in plan.get("layers") or []:
        if not isinstance(L, dict) or L.get("type") != "text" or L.get("hook_visual") or L.get("anchor") == "hook":
            continue
        if L.get("source_id") not in (None, sid) or not providers._overlap(
                providers._f(L.get("src_start")), providers._f(L.get("src_end")), a, b):
            continue
        sp = [x for x in L.get("spans") or [] if isinstance(x, dict)]
        txt = " ".join(str(x.get("text") or "") for x in sp).strip()
        size = max([providers._f(x.get("size"), 80) for x in sp] or [80])
        lines = 1 + sum(1 for x in sp if x.get("newline"))
        out.append((txt, providers._f(L.get("y"), 0.5), size * 1.3 * lines / 1920.0))
    return out


def existing_splits(plan, assets):
    a_by = {a["id"]: a for a in assets or [] if a.get("id")}
    out = []
    for i, sc in enumerate(plan.get("scenes") or []):
        if isinstance(sc, dict) and sc.get("layout") == "split":
            asset = (sc.get("panel") or {}).get("asset")
            out.append({"canh": i, "src_start": sc.get("src_start"), "src_end": sc.get("src_end"),
                        "anh_nen": asset, "mo_ta_anh": ((a_by.get(asset) or {}).get("prompt") or "")[:220],
                        "ly_do": sc.get("why"),
                        "chu_dang_hien": [t for t, _y, _h in _texts_in(plan, sc.get("source_id"),
                                                                     providers._f(sc.get("src_start")),
                                                                     providers._f(sc.get("src_end"))) if t]})
    return out


def design(plan, moments, story, the_gioi, hook_range, log=None):
    import body_visual
    splits = existing_splits(plan, plan.get("assets"))
    if not splits:
        return {}
    payload = {"cau_chuyen": story or {}, "the_gioi": the_gioi, "hook_doan": list(hook_range or []),
               "canh_chia_doi_dang_co": splits, "khoanh_khac": body_visual._km(moments, hook_range),
               "muc_dich_hop_le": body_visual.MUC_DICH}
    if log:
        log("Split-visual: %s thiet ke khung chat that cho canh chia doi..." % providers.plan_ai_name())
    text = providers.plan_chat([{"role": "system", "content": _PROMPT},
                                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
                               json_mode=True, max_tokens=6000, temperature=0.4, req_timeout=400, max_attempts=2,
                               step_label="Split-visual")
    return providers._safe_json(text) or {}


def proposals(res, plan=None):
    """De xuat nang cap co id (u<canh>) + chu do hoa dang hien cua canh (cho bien tap vien thay trung lap)."""
    shown = {x["canh"]: x["chu_dang_hien"] for x in existing_splits(plan, plan.get("assets"))} if plan else {}
    out = []
    for d in (res or {}).get("nang_cap") or []:
        if isinstance(d, dict) and d.get("canh") is not None:
            out.append(dict(d, _id="u%s" % d["canh"], _kind="nang_cap", chu_dang_hien_canh=shown.get(d["canh"], [])))
    return out


def review(props, story, the_gioi, log=None):
    if not props:
        return {}
    rows = [{"id": p["_id"], "de_xuat": {k: v for k, v in p.items() if not k.startswith("_")}} for p in props]
    if log:
        log("Split-visual: bien tap vien duyet %d de xuat..." % len(rows))
    text = providers.plan_chat([{"role": "system", "content": _REVIEW},
                                {"role": "user", "content": json.dumps({"cau_chuyen": story, "the_gioi": the_gioi,
                                                                        "de_xuat": rows}, ensure_ascii=False)}],
                               json_mode=True, max_tokens=4000, temperature=0.2, req_timeout=300, max_attempts=2,
                               step_label="Split-visual-review")
    return {r["id"]: r for r in (providers._safe_json(text) or {}).get("danh_gia") or [] if isinstance(r, dict) and r.get("id")}


def _card_h(n):
    return 0.12 + 0.082 * n                    # = motion_design chat h uoc


def _free_band(occ, need):
    """Dai trong lien tuc (y0) trong panel cao >= need, ne cac khoang occ. None neu khong co."""
    y = PANEL_TOP
    while y + need <= PANEL_BOT + 1e-6:
        hit = [hi for lo, hi in occ if lo < y + need and hi > y]
        if not hit:
            return y
        y = max(hit) + 0.005
    return None


def apply(plan, props, reviews, moments, hook_range, log=None):
    """Dat de xuat DAT: lop "chat" trong panel (khoang trong) + tieng tung tin. Tra so de xuat dat."""
    import sfx_gen
    say = log or (lambda m: None)
    scenes = plan.get("scenes") or []
    f = providers._f
    bo = ((plan.get("am_thanh") or {}).get("bo") or {}) if isinstance(plan.get("am_thanh"), dict) else {}
    n = 0
    for p in props:
        r = (reviews or {}).get(p["_id"]) or {}
        sc = r.get("diem") or {}
        low = [k for k in ("muc_dich", "dung_nghia", "phu_hop_chu_de", "khong_thua", "doc_duoc_1_giay") if f(sc.get(k), 0) < 4]
        if not r.get("giu") or low:
            say("BO %s: kiem duyet khong dat (%s) %s" % (p["_id"], ", ".join(low), str(r.get("ly_do"))[:160]))
            continue
        i = int(p["canh"])
        if i >= len(scenes) or (scenes[i] or {}).get("layout") != "split":
            say("BO %s: canh khong ton tai" % p["_id"])
            continue
        S = scenes[i]
        a, b, sid = f(S.get("src_start")), f(S.get("src_end")), S.get("source_id")
        if hook_range and providers._overlap(a, b, hook_range[0], hook_range[1]):
            say("BO %s: canh nam trong doan hook -> nang cap = lap lai hook" % p["_id"])
            continue
        msgs = []
        for m in p.get("tin_nhan") or []:
            if isinstance(m, dict) and str(m.get("chu") or "").strip() and m.get("vai") in VAI:
                t = min(max(f(m.get("luc"), a + 0.5), a + 0.7), b - 0.4)
                msgs.append({"side": "left" if m["vai"] == "khach" else "right", "text": str(m["chu"]).strip()[:80],
                             "src_time": round(t, 3)})
        msgs = sorted(msgs, key=lambda m: m["src_time"])[:MAX_MSG]
        if not msgs:
            say("BO %s: khong co tin nhan hop le" % p["_id"])
            continue
        occ = [(y - h / 2 - 0.012, y + h / 2 + 0.012) for _t, y, h in _texts_in(plan, sid, a, b)]
        y0 = None
        while msgs:
            y0 = _free_band(occ, _card_h(len(msgs)))
            if y0 is not None:
                break
            msgs = msgs[:-1]
        if y0 is None:
            say("BO %s: panel khong con cho trong cho khung chat (chu do hoa da co)" % p["_id"])
            continue
        P = "sv_%s_" % p["_id"]
        chat = {"messages": msgs}
        if str(p.get("ten_khung") or "").strip():
            chat["title"] = str(p["ten_khung"]).strip()[:32]
        if str(p.get("trang_thai") or "").strip():
            chat["status"] = str(p["trang_thai"]).strip()[:32]
        L = {"id": P + "chat", "type": "chat", "source_id": sid, "src_start": round(a + 0.25, 3), "src_end": round(b, 3),
             "x": 0.5, "y": round(y0, 4), "w": 0.84, "track": 70, "chat": chat, "hook_visual": True, "split_visual": True,
             "enter": {"preset": "rise", "duration": 0.35}, "exit": {"preset": "fade", "duration": 0.2},
             "why": str(p.get("nguoi_xem_hieu_them") or "")[:200]}
        plan["layers"] = [x for x in plan.get("layers") or [] if not str(x.get("id") or "").startswith(P)] + [L]
        # tieng tung tin: tin DEN (khach) -> ding, tin DI -> pop — theo bo tieng cua video
        plan["audio"] = [x for x in plan.get("audio") or [] if not str(x.get("_split") or "").startswith(P)]
        for k, m in enumerate(msgs):
            fam = "ding" if m["side"] == "left" else "pop"
            g = sfx_gen.clean_gen(bo.get(fam)) if bo.get(fam) else None
            if g:
                plan["audio"].append({"sfx_id": "es:" + g["sound"], "gen": g, "source_id": sid, "src_time": m["src_time"],
                                      "purpose": "ui", "why": "tin nhan hien trong khung chat", "_split": P + str(k)})
        say("DAT %s: khung chat '%s' %s | %s" % (p["_id"], chat.get("title", ""), " / ".join(
            ("<" if m["side"] == "left" else ">") + m["text"] for m in msgs), p.get("nguoi_xem_hieu_them")))
        n += 1
    return n
