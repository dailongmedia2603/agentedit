#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DAO DIEN (user 2026-10-15): "ke hoach edit phai co DAO DIEN that su — dua vao chu de that cua TUNG video (phan
Gemini da phan tich) de sang tao, khong phai chuyen dong / cach edit AI rap khuon cho moi video".

Do that 8 ke hoach gan nhat tren may user (ban dich vu edit, gia dinh chay bo, be trai o truong, khach tri seo,
feedback lop hoc): chu de khac nhau hoan toan nhung video nao cung punch-in 1.00->1.12-1.18 vao mat o hook, dai sang
cheo quet ngang, 4 goc khung ngam chu L, thanh tien trinh mong y~0.9, giam bao hoa luc "noi dau" roi am len luc "giai
phap", light leak, vignette; font barlow_condensed + dancing_script; SFX kit-whoosh / kit-boom. Nguyen nhan: moi buoc
(B3 hook, R4 thiet ke, R5 chu, FX, B6 meme, B7 SFX) TU doc lai cau chuyen va tu quyet cao trao -> khong ai giu Y TUONG
CHUNG, va moi buoc roi ve lua chon "an toan" quen tay.

3 lop:
1. DD-chi-dao (sau B2, truoc B3): MOT luot AI doc toan bo noi dung da chot + phan tich Gemini (cam xuc, khoanh khac,
   bang chung) + video mau + yeu cau edit + SO TAY cac video gan day -> BAN CHI DAO: chu de that, dieu dong lai, y
   tuong lon (bam chi tiet that cua video), the gioi hinh, mo tip, cuong do 1-5, duong cong cam xuc theo TUNG NHIP
   (segment), khoanh khac dau an, khoang lang co chu dich, the gioi am thanh, hook, danh sach CAM. Ban chi dao di vao
   cau_chuyen["chi_dao"] -> MOI buoc sau nhan (va khoa cache cua chung doi theo).
2. Luat (luat(buoc)) noi bang code vao system prompt B3 / R4 / R5 / FX / B6 / B7 (ke ca prompt user sua) + code ep:
   muc do hook (hook_rule.muc_do), the gioi am thanh (sfx_kit) cho tieng chu / tieng lop, khoang lang (bo tieng chu tu
   gan trong khoang do).
3. DD-duyet (sau B7): dao dien XEM LAI ban ke hoach da rap theo tung nhip + so lieu LAP do code dem (trong video + so
   voi cac video gan day) -> bo / doi nhung gi rap khuon, sai cam xuc, chen vao khoang lang. Code chi cho BO / DOI trong
   danh muc, khong dung vao phan cua hook / tu lieu nguoi dung, tran so bo moi loai.

SO TAY (~/.capcut-studio/director_memory.json): moi lan lap ke hoach xong ghi lai y tuong + cac "chieu" da dung (gan
nhan bang code tu mo ta hieu ung / kieu vao chu / chuyen canh / tieng / font) -> video sau tranh lap lai.
"""
import json
import os
import re
import threading
import time
import unicodedata

import ngon_ngu
import prompt_store
import providers

DIRECTOR_VERSION = 5      # 2: tham my + danh gia hinh nguon; 3: uu tien video mau + anh tham chieu (2026-10-15)
                          # 4: PHAN TICH NOI DUNG bat buoc + toan bo loi noi goc + luat Y NGHIA moi phan tu (2026-10-16)
                          # 5: BANG QUYET DINH THEO TUNG DOAN (y do + neo + khung + nen + giao viec tung bo phan), hook
                          #    da chon truoc (B3), ho so nhip, 4 dinh luat dao dien (2026-10-17)
MEMORY_PATH = os.path.join(os.path.expanduser("~"), ".capcut-studio", "director_memory.json")
MEMORY_MAX = 24          # so video nho
MEMORY_RECENT = 6        # so video gan nhat dua cho dao dien
REVIEW_MAX_DROP = 0.45   # buoc duyet bo toi da 45% moi loai (fx / lop / tieng / meme / caption nhan)
_LOCK = threading.Lock()

# The gioi am thanh (sfx_kit.WORLDS): dao dien chon 1 cho ca video -> tieng chu / lop / du phong hook theo bo nay
SOUND_WORLDS = {
    "am_ap": "Ấm, mộc, mềm: tiếng gỗ, tiếng bong bóng tròn, chuông marimba — kể chuyện, gia đình, chữa lành, cảm ơn.",
    "cong_nghe": "Sạch, sáng, kính / kỹ thuật số: blip, click giao diện, chuông thuỷ tinh, quét điện tử — công nghệ, "
                 "SaaS, dịch vụ số, số liệu.",
    "dien_anh": "Dày, sâu, có không gian: impact trầm có đuôi vang, whoosh nặng, riser dài, chuông trầm — kịch tính, "
                "truyền cảm hứng, tiết lộ lớn, sang trọng.",
    "vui_nhon": "Nảy, hoạt hình: bloop, tiếng gõ đồ chơi, xylophone, bonk lò xo, còi trượt — hài, trẻ em, bắt trend.",
    "toi_gian": "Rất khẽ, tinh: tick nhỏ, chạm nhẹ, hơi gió — chuyên gia, tài chính, y tế, cao cấp, tâm sự sâu.",
}
WORLD_IDS = tuple(SOUND_WORLDS)
LEVEL_OF_INTENSITY = {1: "nhe", 2: "nhe", 3: "vua", 4: "manh", 5: "manh"}
ROLES = ("hook", "mo", "dan", "day_len", "cao_trao", "lang", "xoay", "chot", "cta")
ENTER_PRESETS = ("fade", "pop", "scale_in", "zoom_out", "blur_in", "slide_left", "slide_right", "slide_up",
                 "slide_down", "rise", "drop", "expand_y", "stretch_x", "wipe", "write_on", "spin_in", "flip", "draw",
                 "glitch_in", "letters_blur", "words_blur", "typewriter", "words_pop", "letters_drop", "words_rise",
                 "letters_fade")

# ---------------------------------------------------------------------------
# TU VUNG Y DO (2026-10-17, tai lieu Dao-dien-ai): dao dien ra lenh bang CHUC NANG (y do) cho tung doan, KHONG bang cong
# thuc hinh — hinh cu the van do y_tuong_lon / the_gioi_hinh cua chinh video quyet (tranh quay lai "AI rap khuon").
# bo_phan = bo phan thuong phai lam; tai = trong so tai nhan thuc (code can bang mat do, 0 = khong them gi).
# ---------------------------------------------------------------------------
Y_DO = {
    "MO_DINH_DANH": {"ten": "mở bằng định danh", "tai": 3, "bo_phan": ("R4", "B7"),
                     "khi": "mo bang dinh danh nguoi / nghe / gan nhan nguoi xem ('day la ban, mot ...')",
                     "cach": "bien nguoi that thanh 'poster' ~1s: dong bang hinh (khung dong_bang) + vien quanh nguoi, "
                             "bang ten / nhan, nen lam toi"},
    "MO_BE_LAI": {"ten": "bẻ lái / phủ định", "tai": 3, "bo_phan": ("R4", "FX", "B7"),
                  "khi": "noi mot nhan dinh roi lat nguoc / phu dinh ngay ('... hoac KHONG')",
                  "cach": "doi khung dot ngot dung tu phu dinh (khung can), chu phu dinh lon, tieng chat / tat nhac"},
    "MO_KET_QUA": {"ten": "khoe kết quả trước", "tai": 3, "bo_phan": ("R4",),
                   "khi": "ket qua / con so / san pham hoan thien gay to mo 'lam sao duoc vay'",
                   "cach": "hinh ket qua (split / anh / so chay) ngay giay dau, vet sang quet qua ket qua"},
    "MO_CAU_HOI": {"ten": "câu hỏi treo", "tai": 2, "bo_phan": ("R4", "B7"),
                   "khi": "cau hoi / tinh huong bo lung gay to mo",
                   "cach": "chu cau hoi ro, khung day cham, tieng cang (riser) — chua tra loi"},
    "NHAN_TU_KHOA": {"ten": "nhấn từ khoá", "tai": 2, "bo_phan": ("R4", "B7"),
                     "khi": "dong tu manh / khai niem cot loi / tu nguoi xem phai nho",
                     "cach": "tu khoa to ~2 lan phu de, mau nhan, hien DUNG luc noi tu do + tieng nhan nhe"},
    "TIENG_LONG": {"ten": "tiếng lòng", "tai": 2, "bo_phan": ("R4",),
                   "khi": "cau nhai suy nghi trong dau / tu nhu / cam than chu quan",
                   "cach": "chu trong ngoac kep, kieu chu khac (viet tay / nghieng), nen lam toi nhe de tach khoi loi ke"},
    "CHOT_TIEU_CUC": {"ten": "chốt nỗi đau / sai lầm", "tai": 3, "bo_phan": ("R4", "FX", "B7"),
                      "khi": "diem chot cua sai lam / he qua / be tac / su bat binh",
                      "cach": "nen lam mo / toi, nhan / dau canh bao dap vao, tieng nang"},
    "BUNG_NO": {"ten": "bùng nổ cảm xúc", "tai": 3, "bo_phan": ("FX", "R4", "B7"),
                "khi": "cao trao / punchline / khoanh khac vo oa",
                "cach": "chuyen dong khung manh nhat video + chu lon nhat + tieng nang co do vang"},
    "MINH_HOA_Y": {"ten": "minh hoạ ý", "tai": 2, "bo_phan": ("R4",),
                   "khi": "nhac vat / khai niem / vi du cu the ve thanh hinh duoc",
                   "cach": "anh AI / B-roll (split, broll) / vat the cat nen quanh nguoi noi / hinh bay quanh dau"},
    "DAN_MAT": {"ten": "dẫn mắt", "tai": 2, "bo_phan": ("R4",),
                "khi": "can chi vao mot chi tiet (tu, vat, dong chu, cu chi)",
                "cach": "vong / mui ten / gach chan DUNG tu (target_text) hoac khoanh vung vat; phan con lai diu xuong"},
    "TRUOC_SAU": {"ten": "trước / sau", "tai": 3, "bo_phan": ("R4",),
                  "khi": "so sanh truoc-sau, dung-sai, that-gia",
                  "cach": "lop so sanh 2 hinh (compare: wipe / chia doi) hoac bo cuc chia doi"},
    "SO_LIEU": {"ten": "số liệu / bằng chứng", "tai": 2, "bo_phan": ("R4", "B7"),
                "khi": "con so, gia, ket qua, bang chung, nguon goc",
                "cach": "so chay (counter) / huy hieu / the thong tin, tieng ding"},
    "PHAN_UNG_HAI": {"ten": "phản ứng hài", "tai": 3, "bo_phan": ("B6", "B7"),
                     "khi": "cho buon cuoi / phong dai / mia mai — chi khi tone hop",
                     "cach": "meme cat vao / de len, tieng hai, doi khung bat ngo"},
    "DOI_KHONG_KHI": {"ten": "đổi không khí", "tai": 2, "bo_phan": ("R4", "B7"),
                      "khi": "chuyen tu van de sang giai phap / sang phan moi",
                      "cach": "doi bo cuc / nen, chuyen canh co y nghia, nhac doi (tat / mo), nhip cham lai"},
    "CTA_KHEP": {"ten": "kêu gọi + khép vòng", "tai": 2, "bo_phan": ("R4", "B7"),
                 "khi": "cau ket keu goi hanh dong",
                 "cach": "khep vong voi mo tip mo dau + nhan hanh dong nhip nhay o vung ngon cai"},
    "NHIP_NEN": {"ten": "nhịp nền", "tai": 1, "bo_phan": (),
                 "khi": "cau dan / noi y binh thuong (60-70% thoi luong)",
                 "cach": "khong phan tu lon: chi doi co khung (code tu lam theo 'khung') + phu de; toi da 1 chu nho"},
    "KHOANG_LANG": {"ten": "khoảng lặng", "tai": 0, "bo_phan": (),
                    "khi": "de tron co chu dich (truoc cu chot, sau cau xuc dong)",
                    "cach": "khong them gi moi — khong SFX, khong chu bat ra, khung giu"},
}
NHE_Y_DO = ("NHIP_NEN", "KHOANG_LANG")          # khong phai diem nhan -> khong tinh lap / khong doi giao viec
BO_PHAN = ("R4", "R5", "FX", "B6", "B7")
KHUNG = ("rong", "trung", "can", "day_cham", "giu", "nha", "dong_bang")
NEN = ("giu", "lam_toi", "lam_mo", "giam_mau")
TIEU_DIEM = ("mat", "chu", "hinh", "vat", "toan_canh")
MUC_DICH = ("lam_ro", "khuech_dai", "giu_nhip", "lang")

# HO SO NHIP theo cuong do (tai lieu: "Style Pack" — CHI lay phan nhip + vat ly, KHONG font / mau: phong cach chi tu video
# mau / Brand Guideline / phien nay, PROJECT_OVERVIEW 11j). Code dung: dung_im_toi_da (giam sat), zoom_max + day_cham (dung
# khung), tai_toi_da (so phan tu chuyen dong moi cung luc ngoai phu de), tieng_vi_mo_db (tieng chu o nhip thap).
HO_SO_NHIP = {
    1: {"ten": "tiết chế", "cat_toi_thieu": 3.5, "dung_im_toi_da": 6.0, "zoom_max": 1.08, "day_cham": 0.04,
        "chuyen_dong": "mem, cham (ease-in-out dai)", "rung_loe": False, "mat_do_sfx": "thua", "tai_toi_da": 1,
        "tieng_vi_mo_db": -14.0},
    2: {"ten": "điềm đạm", "cat_toi_thieu": 3.0, "dung_im_toi_da": 5.0, "zoom_max": 1.12, "day_cham": 0.05,
        "chuyen_dong": "muot (cubic-bezier .22,1,.36,1)", "rung_loe": False, "mat_do_sfx": "thua", "tai_toi_da": 2,
        "tieng_vi_mo_db": -12.0},
    3: {"ten": "rõ ràng", "cat_toi_thieu": 2.2, "dung_im_toi_da": 4.0, "zoom_max": 1.15, "day_cham": 0.06,
        "chuyen_dong": "dut khoat ma muot (ease-out / back-out nhe)", "rung_loe": False, "mat_do_sfx": "vua",
        "tai_toi_da": 2, "tieng_vi_mo_db": -10.0},
    4: {"ten": "năng động", "cat_toi_thieu": 1.6, "dung_im_toi_da": 3.0, "zoom_max": 1.18, "day_cham": 0.07,
        "chuyen_dong": "bat nay (back-out)", "rung_loe": True, "mat_do_sfx": "vua", "tai_toi_da": 3,
        "tieng_vi_mo_db": -8.0},
    5: {"ten": "bùng nổ", "cat_toi_thieu": 1.2, "dung_im_toi_da": 2.5, "zoom_max": 1.22, "day_cham": 0.08,
        "chuyen_dong": "nay manh / dan hoi (elastic, back-out)", "rung_loe": True, "mat_do_sfx": "day", "tai_toi_da": 3,
        "tieng_vi_mo_db": -6.0},
}
_LOAI_NGHIEM = ("chuyen gia", "tai chinh", "y te", "bac si", "luat", "giao duc", "b2b", "doanh nghiep", "bat dong san",
                "nghiem tuc", "kien thuc", "phap ly", "ngan hang", "bao hiem")
_LOAI_KE = ("ke chuyen", "tam su", "chua lanh", "cam dong", "hoai niem", "tri an", "cam on", "storytelling")
_LOAI_BAN = ("ban hang", "review", "affiliate", "san pham", "khuyen mai", "unbox", "my pham", "deal")
_LOAI_HAI = ("hai", "giai tri", "trend", "meme", "troll", "vui nhon", "drama", "the thao", "ghi ban")


def profile_for(cd):
    """Ho so nhip cua video: theo cuong do + the loai (dieu chinh nhe). Khong co ban chi dao -> muc 3."""
    cd = cd if isinstance(cd, dict) else {}
    lv = _int(cd.get("cuong_do"), 1, 5, 3)
    p = dict(HO_SO_NHIP[lv], cuong_do=lv)
    loai = _plain(" ".join(str(cd.get(k) or "") for k in ("the_loai", "ly_do_cuong_do")))
    if any(k in loai for k in _LOAI_NGHIEM):
        p.update(rung_loe=False, chuyen_dong="muot, dieu do (cubic-bezier .22,1,.36,1)")
        p["dieu_chinh"] = "noi dung can niem tin: khong rung / loe"
    elif any(k in loai for k in _LOAI_KE):
        p.update(dung_im_toi_da=p["dung_im_toi_da"] + 1.5, zoom_max=round(max(1.05, p["zoom_max"] - 0.03), 3),
                 chuyen_dong="cham, mem (ease-in-out dai)")
        p["dieu_chinh"] = "ke chuyen: cho khung tho lau hon, zoom nhe hon"
    elif any(k in loai for k in _LOAI_BAN):
        p["dung_im_toi_da"] = round(max(2.0, p["dung_im_toi_da"] - 0.5), 2)
        p["dieu_chinh"] = "ban hang / review: giu chan gat hon"
    elif any(k in loai for k in _LOAI_HAI) and lv >= 3:
        p["rung_loe"] = True
        p["dieu_chinh"] = "giai tri: duoc rung / loe dung nhip"
    return p


# ---------------------------------------------------------------------------
# NHAN "CHIEU" (device) — gan bang code tu mo ta hieu ung / kieu vao / chuyen canh. Dung cho so tay + buoc duyet.
# ---------------------------------------------------------------------------
DEVICE_LABEL = {
    "punch_zoom": "punch-in zoom dập vào mặt", "push_in": "push-in chậm", "light_sweep": "dải / vệt sáng quét chéo",
    "light_leak": "light leak", "viewfinder": "4 góc khung ngắm chữ L", "progress_bar": "thanh tiến trình mảnh",
    "grade_shift": "đổi tông màu / bão hoà theo cảm xúc", "vignette": "vignette tối viền", "sparkle": "tia lấp lánh",
    "rays": "tia sáng nan quạt sau đầu", "rings": "vòng tròn / gợn sóng lan", "speed_lines": "vệt tốc độ / vệt gió",
    "shake": "rung khung", "glitch": "glitch / tách màu RGB", "flash": "loé sáng", "particles": "hạt / bong bóng / confetti",
    "underline": "nét gạch chân", "frame_border": "viền sáng chạy quanh khung", "comet": "vệt sao chổi", "blur": "nhoè khung",
}
_DEVICE_RE = [
    ("punch_zoom", r"punch|snap zoom|dap (vao|camera|zoom)|zoom (nhip|dap)|scale 1\.0+ ?(->|→|len) ?1\.[0-2]"),
    ("push_in", r"push[- ]?in (tuyen tinh|cham|rat cham)|push[- ]?in cham|day vao cham|zoom cham"),
    ("light_sweep", r"dai (anh )?sang|vet (quet )?sang|quet sang|light ?sweep|dai sang cheo|vet quet"),
    ("light_leak", r"light[- ]?leak"),
    ("viewfinder", r"khung ngam|chu l\b|dang chu l|bracket|viewfinder|goc ngoac"),
    ("progress_bar", r"progress|thanh tien trinh|thanh (mong|ngang mong|ngang manh)"),
    ("grade_shift", r"bao hoa|nhiet (do )?mau|exposure|desatur|tong (mau|khung) (am|lanh)|am dan len|lanh di"),
    ("vignette", r"vignette|toi vien|vien (khung )?toi"),
    ("sparkle", r"lap lanh|sparkle|sao 4 canh|ngoi sao"),
    ("rays", r"tia sang|nan quat|\brays?\b|tia ngan"),
    ("rings", r"vong (tron|song)|ripple|gon song|\brings?\b"),
    ("speed_lines", r"speed[- ]?lines?|vet (gio|toc do)|vet nuoc"),
    ("shake", r"\brung\b|shake|giat (cuc|khung)|stutter"),
    ("glitch", r"glitch|rgb|tach mau|slice"),
    ("flash", r"loe|flash|chop sang|nhip sang"),
    ("particles", r"\bhat\b|particle|confetti|bong bong|bubble"),
    ("underline", r"gach chan|gach nhan|underline"),
    ("frame_border", r"vien (sang|khung)|duong vien chu nhat|inset|chay quanh khung|bam sat ngoai vien"),
    ("comet", r"comet|sao choi"),
    ("blur", r"\bnhoe\b|\bblur\b"),
]


def _plain(s):
    """Bo dau tieng Viet + thuong hoa (so khop tu khoa tren mo ta co dau / khong dau)."""
    s = unicodedata.normalize("NFD", str(s or "")).replace("đ", "d").replace("Đ", "D")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


# Cum PHU DINH ("khong phai punch-in", "khong rung", "thay vi dai sang") khong tinh la dung chieu do
_NEG_RE = re.compile(r"(chu khong phai|khong phai|khong co|khong|thay vi|tranh|chu khong|not|no|without|instead of)"
                     r"\s+[^.,;:()\n]{0,40}")


def tag_text(text):
    """Cac nhan chieu (device) trong 1 mo ta hieu ung (bo cum phu dinh)."""
    t = _NEG_RE.sub(" ", _plain(text))
    return [k for k, rx in _DEVICE_RE if re.search(rx, t)]


def _fx_text(e):
    return " ".join(str(e.get(k) or "") for k in ("visual", "goal", "kind"))


def plan_devices(plan):
    """{"fx": Counter-dict nhan chieu, "enter": {...}, "transitions": {...}, "sfx": {...}, "fonts": [...]} cua 1 plan."""
    fx = {}
    for e in plan.get("fx") or []:
        for t in tag_text(_fx_text(e)):
            fx[t] = fx.get(t, 0) + 1
    for e in plan.get("scene_effects") or []:
        typ = str(e.get("type") or "")
        t = {"zoom_punch": "punch_zoom", "light_leak": "light_leak", "vignette": "vignette", "shake": "shake",
             "flash": "flash", "rgb_split": "glitch", "focus": "vignette", "blur_focus": "blur"}.get(typ)
        if t:
            fx[t] = fx.get(t, 0) + 1
    enter = {}
    for L in plan.get("layers") or []:
        p = (L.get("enter") or {}).get("preset") if isinstance(L.get("enter"), dict) else None
        if p:
            enter[p] = enter.get(p, 0) + 1
    trans = {}
    for s in plan.get("segments") or []:
        t = s.get("rm_transition") if isinstance(s.get("rm_transition"), dict) else None
        typ = (t or {}).get("type") if t else s.get("transition")
        if typ and typ != "cut":
            trans[typ] = trans.get(typ, 0) + 1
    sfx = {}
    for a in plan.get("audio") or []:
        k = str(a.get("sfx_id") or os.path.basename(str(a.get("file") or "")) or "")
        if k:
            sfx[k] = sfx.get(k, 0) + 1
    fonts = []
    sk = plan.get("style_kit") if isinstance(plan.get("style_kit"), dict) else {}
    for v in ((sk.get("fonts") or {}) if isinstance(sk.get("fonts"), dict) else {}).values():
        if isinstance(v, str) and v not in fonts:
            fonts.append(v)
    return {"fx": fx, "enter": enter, "transitions": trans, "sfx": sfx, "fonts": fonts}


# ---------------------------------------------------------------------------
# SO TAY DAO DIEN (cac video gan day)
# ---------------------------------------------------------------------------
def _load_memory():
    if not os.path.isfile(MEMORY_PATH):
        _bootstrap()
    try:
        with open(MEMORY_PATH, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) and isinstance(d.get("videos"), list) else {"videos": []}
    except Exception:
        return {"videos": []}


PROJECTS_PATH = os.path.join(os.path.expanduser("~"), ".capcut-studio", "projects.json")


def _bootstrap():
    """Lan dau (chua co so tay): gieo so tay tu cac du an Edit Video DA LAP KE HOACH tren may (projects.json, chi doc)
    -> ngay video dau tien sau khi cap nhat, dao dien da biet nhung chieu cac video truoc lap lai."""
    rows = []
    try:
        with open(PROJECTS_PATH, encoding="utf-8") as f:
            items = (json.load(f) or {}).get("items") or {}
        projs = sorted([p for p in (items.values() if isinstance(items, dict) else items)
                        if isinstance(p, dict) and isinstance(p.get("rmPlan"), dict) and p["rmPlan"].get("layers")],
                       key=lambda p: float(p.get("updatedAt") or p.get("createdAt") or 0))[-MEMORY_MAX:]
        for p in projs:
            row = _row(p["rmPlan"], p.get("id"))
            if row:
                row["at"] = float(p.get("updatedAt") or 0) / 1000.0
                row["ngay"] = time.strftime("%Y-%m-%d", time.localtime(row["at"])) if row["at"] else ""
                rows.append(row)
    except Exception:
        rows = []
    try:
        with _LOCK:
            if os.path.isfile(MEMORY_PATH):
                return
            os.makedirs(os.path.dirname(MEMORY_PATH), exist_ok=True)
            tmp = MEMORY_PATH + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump({"videos": rows, "bootstrap": len(rows)}, f, ensure_ascii=False, indent=1)
            os.replace(tmp, MEMORY_PATH)
    except Exception:
        pass


def recent(project=None, n=MEMORY_RECENT):
    """Cac video GAN NHAT (khac du an dang lam) — gon cho prompt."""
    rows = [v for v in reversed(_load_memory()["videos"]) if not project or v.get("project") != project]
    out = []
    for v in rows[:n]:
        out.append({k: v.get(k) for k in ("ngay", "chu_de", "y_tuong_lon", "mo_tip", "the_gioi_am_thanh", "hook",
                                          "y_do_hook", "y_do", "chieu_da_dung", "font", "chuyen_canh") if v.get(k)})
    return out


def overused(project=None, n=MEMORY_RECENT, min_videos=2):
    """Chieu xuat hien o >= min_videos trong n video gan nhat -> {nhan: so video}."""
    cnt = {}
    for v in [x for x in reversed(_load_memory()["videos"]) if not project or x.get("project") != project][:n]:
        for t in set(v.get("_tags") or []):
            cnt[t] = cnt.get(t, 0) + 1
    return {k: c for k, c in sorted(cnt.items(), key=lambda kv: -kv[1]) if c >= min_videos}


def _row(plan, project):
    cd = plan.get("chi_dao") if isinstance(plan.get("chi_dao"), dict) else {}
    dv = plan_devices(plan)
    tags = sorted(dv["fx"], key=lambda k: -dv["fx"][k])
    hook_tags = []
    for e in plan.get("fx") or []:
        if e.get("anchor") == "hook":
            hook_tags += [t for t in tag_text(_fx_text(e)) if t not in hook_tags]
    return {
        "project": project or plan.get("title") or "",
        "at": time.time(),
        "ngay": time.strftime("%Y-%m-%d"),
        "chu_de": str(cd.get("chu_de_that") or (plan.get("_pipeline") or {}).get("story_arc") or "")[:200],
        "y_tuong_lon": str(cd.get("y_tuong_lon") or plan.get("concept") or "")[:240],
        "mo_tip": [str(m.get("ten") or "")[:60] for m in cd.get("mo_tip") or [] if isinstance(m, dict)][:3],
        "the_gioi_am_thanh": (cd.get("am_thanh") or {}).get("the_gioi") if isinstance(cd.get("am_thanh"), dict) else None,
        "hook": ", ".join(DEVICE_LABEL.get(t, t) for t in hook_tags[:4]) or None,
        "chieu_da_dung": [DEVICE_LABEL.get(t, t) for t in tags[:10]],
        "font": dv["fonts"][:4],
        "chuyen_canh": sorted(dv["transitions"], key=lambda k: -dv["transitions"][k])[:5],
        # y do cua hook + cac diem nhan (bang quyet dinh v5) -> video sau doi cach mo / cach nhan
        "y_do_hook": ((cd.get("hook_qd") or {}).get("y_do")) if isinstance(cd.get("hook_qd"), dict) else None,
        "y_do": _y_do_counts(cd),
        "_tags": tags,
    }


def _y_do_counts(cd):
    out = {}
    for q in (cd.get("quyet_dinh") or []) if isinstance(cd, dict) else []:
        y = q.get("y_do") if isinstance(q, dict) else None
        if y and y not in NHE_Y_DO:
            out[y] = out.get(y, 0) + 1
    return out


def remember(plan, project=None):
    """Ghi 1 video vao so tay sau khi lap ke hoach xong. Loi -> bo qua (khong lam hong ke hoach)."""
    try:
        row = _row(plan, project)
        _load_memory()                 # lan dau: gieo tu cac du an cu truoc khi ghi
        with _LOCK:
            d = _load_memory()
            d["videos"] = [v for v in d["videos"] if not row["project"] or v.get("project") != row["project"]]
            d["videos"].append(row)
            d["videos"] = d["videos"][-MEMORY_MAX:]
            os.makedirs(os.path.dirname(MEMORY_PATH), exist_ok=True)
            tmp = MEMORY_PATH + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(d, f, ensure_ascii=False, indent=1)
            os.replace(tmp, MEMORY_PATH)
        return row
    except Exception:
        return None


# ---------------------------------------------------------------------------
# PROMPT 1 — BAN CHI DAO
# ---------------------------------------------------------------------------
_DIRECTOR_SYSTEM = """Ban la DAO DIEN cua mot video short-form (TikTok / Reels / Shorts) — nguoi chiu trach nhiem CAM XUC
va Y TUONG cua ca video. Noi dung (cau nao giu, thu tu) va doan HOOK DA CHOT o buoc truoc; ban KHONG doi noi dung. Viec cua
ban: quyet dinh video nay se DUOC KE nhu the nao bang hinh, chu, am thanh va nhip — de nguoi xem bi KEO VAO, NHO, va CAM
THAY mot dieu cu the — roi ra LENH CU THE cho tung doan. Ban chi dao la quyet dinh CHUNG ma moi bo phan sau (thiet ke
hinh R4, chu R5, hieu ung FX, meme B6, am thanh B7) phai THUC HIEN; he thong DO lai ban dung xem moi lenh co duoc lam khong.

# DU LIEU DAU VAO
- tong_quan: tom tat + tone + ngon ngu CA BO video (Gemini da XEM + NGHE video that).
- toan_bo_loi_noi: NGUYEN VAN toan bo loi noi cua video goc (ca phan da cat) kem moc gio — doc HET de hieu nguoi noi
  dang lap luan / ke chuyen gi, tu dau den cuoi; noi dung giu lai trong timeline la phan da chot.
- video: tom tat Gemini tung video, nguoi / boi canh / san pham / chu tren man hinh, giong noi.
- cau_chuyen: story_arc, tone, nhip_truyen, edit_request (muc dich, phong cach, khan gia, do dai) — yeu cau cua
  nguoi dung la uu tien so 1.
- timeline[]: TUNG doan da chot theo thu tu: segment_index, gio timeline, loi noi (cau + emphasis / punchline),
  cam xuc Gemini thay (kem bang chung: net mat, giong), khoanh khac (hook / climax / twist / silence... + mo ta).
- hook (neu co): BAN SAO cua mot doan (src_start..src_end gio nguon, caption) se dat len DAU video truoc than video — la 3-5s
  nguoi xem quyet dinh o lai hay luot. Cau do xuat hien HAI lan: ban sao o dau + cho goc trong than video.
- rang_buoc: rang buoc cung cua he thong — hook_muc_do (nhe / vua / manh, tu yeu cau edit; co thi BAT BUOC theo),
  ho_so_nhip_theo_cuong_do (nhip cat, dung im toi da, zoom toi da, rung / loe, mat do tieng theo cuong do 1-5 ban chon).
- tu_vung_y_do: danh sach Y DO (chuc nang dao dien) — id, khi nao dung, cach the hien CO THE (khong phai cong thuc),
  bo phan thuong lam. Ban CHI dung id trong danh sach nay cho "y_do".
- video_mau (neu co): phong cach video mau nguoi dung muon theo — giu TINH THAN + nhip cua no nhung ap vao NOI DUNG nay.
- thuong_hieu (neu co): font / mau bat buoc.
- so_tay_gan_day: cac video ban da chi dao gan day cho CUNG nguoi dung nay (y tuong, mo tip, chieu da dung, y do hook).
  chieu_lap_nhieu: chieu da xuat hien o nhieu video gan day. Khan gia cua ho xem moi ngay -> lap lai = nham chan.
- the_gioi_am_thanh: cac bo tieng co san (id + mo ta).
- kha_nang_bo_dung: NHUNG GI BO DUNG LAM DUOC (font co san, bo cuc, loai lop, kieu vao chu, chuyen canh, hieu ung tu viet,
  anh AI, am thanh, nhac, khung / dong bang, nen lam toi / mo). Moi y tuong PHAI thuc hien duoc bang nhung thu nay: goi
  font bang id trong danh sach, khong doi diem cat / thu tu doan (da chot), khong tao nhac moi.

# 4 DINH LUAT DAO DIEN (bat buoc — he thong do lai tren ban dung)
1. LY DO TON TAI: moi phan tu (chu, hinh, hieu ung, tieng, doi khung) chi xuat hien khi lam it nhat 1 trong 3 viec:
   LAM RO (y phuc tap / truu tuong hieu nhanh hon), KHUECH DAI (cam xuc / noi dau / su hai huoc THAT o diem roi), GIU NHIP
   (pha su dung im khi khung goc dung yen qua lau — bang phuong tien NHE: doi co khung, day cham, chu nho, doi bo cuc).
   Khong phuc vu viec nao -> KHONG dat.
2. DON TIEU DIEM: mat nguoi chi nhin MOT diem moi luc. Uu tien bieu cam khuon mat -> chi chu nho / khong chu de len mat.
   Uu tien doc chu LON hoac xem lop phu / B-roll -> nen phia sau phai diu xuong ("nen": lam_toi / lam_mo / giam_mau)
   hoac nguoi noi thu vao the.
3. NGAN SACH NHAN THUC: moi giay khong qua so phan tu CHUYEN DONG moi cung luc cua ho so nhip (tai_toi_da, ngoai phu de).
   Canh goc da manh (chuyen dong / dien xuat gat) -> do hoa phai it lai.
4. SONG NANG LUONG: nang_luong 1-5 theo doan. KHONG DI NGANG (khong de 2 doan lien nhau qua ~4s cung co khung + cung
   nang luong thap ma khong co gi doi — it nhat doi khung / day cham). BAT BUOC HA NHIET: ngay sau doan nang_luong 5, doan
   sau <= 3 (khung sach, nhip cham) de nao nguoi xem kip hap thu. CHONG NHON: khong lap cung mot y_do (tru NHIP_NEN /
   KHOANG_LANG) o 2 doan lien nhau, khong lap cung mot cach the hien / mot tieng o 2 diem nhan lien nhau.
   Diem nhan (y_do khac NHIP_NEN / KHOANG_LANG) ~30-40% so doan; 60-70% con lai la NHIP_NEN — van phai SONG nho khung.

# CACH NGHI (lam theo thu tu, viet ket qua vao JSON)
0. HIEU NOI DUNG TRUOC (bat buoc, ghi vao "phan_tich" — moi quyet dinh sau phai dua tren phan nay): doc toan_bo_loi_noi
   + timeline nhu mot nguoi bien tap doc kich ban. Nguoi noi la ai, dang noi voi ai, de lam gi (thong_diep_chinh)?
   Lap luan / mach ke di qua nhung Y nao, theo thu tu (moi y gan voi doan segment)? Tu khoa, hinh anh, an du, con so,
   ten rieng nao mang Y NGHIA (va y nghia do la gi trong video nay)? Cam xuc that cua nguoi noi o tung phan? Nguoi xem
   can HIEU va CAM duoc dieu gi? Khong hieu ro mot cau / mot tu -> ghi vao "chua_ro" thay vi doan bua.
1. CHU DE THAT: video nay THUC SU noi ve dieu gi (khong phai tom tat lai) — cai gi dang duoc dat cuoc voi nguoi xem?
   Nguoi xem nen roi video voi DIEU GI trong dau / trong long (dieu_dong_lai)?
2. Y TUONG LON: mot y tuong hinh-tieng CHI video nay moi co, moc tu CHI TIET THAT trong video (mot vat, mot cu chi,
   mot tu nguoi noi lap lai, chat lieu cua boi canh, nghe nghiep / san pham, mot an du trong loi noi). Thu: neu doi
   sang video khac cung linh vuc ma y tuong van dung nguyen -> y tuong qua chung, nghi lai.
3. THE GIOI HINH + MO TIP: chat lieu, anh sang, ket cau, logic mau rut tu chu de (vd video ve be boi -> nuoc, gon song,
   phan chieu; dich vu ke toan -> giay ke o, but chi, con dau). 1-2 MO TIP lap lai co chu dich (mot hinh / mot cach
   chuyen / mot am thanh) xuat hien o dau, cao trao va ket de video co "chu ky", va bien doi theo cau chuyen.
4. CUONG DO 1-5 cho ca video (1 tiet che cao cap / tam su sau -> 5 hyper reel / hai / bat trend), theo yeu cau edit +
   the loai + tone; xem ho_so_nhip_theo_cuong_do de biet cuong do do keo theo nhip gi. Video can NIEM TIN (chuyen gia, y
   te, tai chinh, cam on, tam su) -> it trang tri; video giai tri / trend -> nhieu.
5. DUONG CONG CAM XUC theo NHIP: chia timeline thanh cac nhip lien tiep (moi nhip = 1 hoac nhieu segment lien nhau,
   phu KIN tu segment dau toi cuoi). Moi nhip: vai_tro, cam_xuc nguoi xem can co, nang_luong 1-5, y tuong HINH chung cua
   nhip, chuyen canh vao nhip, va TIET CHE gi. Duong cong phai co TUONG PHAN: cho day len, cho cao trao, cho LANG / nghi.
   Truoc cao trao nen co mot nhip nen / don. Khong de nang_luong deu tu dau den cuoi.
6. KHOANH KHAC DAU AN (2-4): nhung luc nguoi xem se nho — y tuong rieng cho dung cau noi do (trich nguyen van tu
   loi noi), noi ro hinh + tieng + chu se lam gi. Cao trao / tiet lo / cau chot / cu chi dat cua nguoi noi.
7. KHOANG LANG CO CHU DICH (0-3): cau nao nen de TRON, khong SFX / hieu ung / chu bat ra (truoc cu chot, sau cau
   xuc dong, luc nguoi noi nghen / suy nghi) — im lang cung la lua chon dao dien manh. Trich nguyen van cau do. KHONG chon
   cau cua hook (cau do con mo dau video, phai gay chu y).
8. AM THANH: chon the_gioi (id) hop chu de + cam xuc; nhac nen (cam giac; bat dau sau hook); neu TAT nhac la mot quyet
   dinh cam xuc -> nhac_tat = cau do (trich nguyen van) + "truoc" / "sau" cau + "kieu": "cat" (dut ngang, soc) hoac
   "mo_dan" (lang dan) + "bat_lai" (cau nhac tro lai, trich nguyen van, hoac null = tat toi het); mat do SFX (thua / vua /
   day) theo cuong do; mo tip am (neu co).
9. HOOK: ban sao hook da chon (du lieu "hook") — cam xuc can danh vao (to mo / soc / buon cuoi / dong cam...), CACH MO cu
   the cho CHINH doan do (khong mac dinh punch-in vao mat), muc_do = rang_buoc.hook_muc_do neu co. Hook phai co hieu ung
   hinh TOAN KHUNG + am thanh gay chu y ngay dau (luat cua app) — hay de no la Y TUONG cua ban, dung muc do.
10. CAM: liet ke cu the nhung gi KHONG duoc dung trong video nay: chieu rap khuon (xem duoi), chieu da lap o
   so_tay_gan_day, va thu sai voi chu de / tone (vd video cam on thay co: khong glitch, khong rung).
11. BANG QUYET DINH (quan trong nhat — "quyet_dinh"): MOI segment dung MOT quyet dinh (segment 0..n-1), + "hook_qd" cho
   ban sao hook. Moi quyet dinh:
   - y_do: id trong tu_vung_y_do — chuc nang cua doan nay trong cau chuyen.
   - muc_dich: lam_ro | khuech_dai | giu_nhip | lang.  nang_luong 1-5 (khop duong cong nhip).
   - neo.tu: 1-4 TU nguyen van trong loi noi CUA DOAN DO (tu mang suc nang cam xuc / thong tin lon nhat) — he thong tim
     giay noi tu do de dat chu / tieng / hieu ung trung dung luc; neo.tin_hieu_hinh: cu chi / anh mat / vat trong khung (neu
     timeline / video co mo ta), khong bia.
   - tieu_diem: mat | chu | hinh | vat | toan_canh — mat nguoi xem phai nhin dau (dinh luat 2).
   - khung: co canh cua doan (code tu thuc hien, MUOT): rong (goc) | trung | can (cat vao can mat) | day_cham (day vao tu
     tu suot doan) | giu (nhu doan truoc) | nha (tra ve rong) | dong_bang (dung hinh ~0.8s dau doan, tieng van chay —
     chi cho MO_DINH_DANH / khoanh khac dat). NHIP_NEN: luan phien co canh theo cau (rong -> can / day_cham -> rong), khong
     de mot co qua dung_im_toi_da.
   - nen: giu | lam_toi | lam_mo | giam_mau — nen VIDEO diu xuong (nguoi noi van net) khi chu lon / lop phu can tieu diem.
   - giao_viec: {"R4": "...", "R5": "...", "FX": "...", "B6": "...", "B7": "..."} — CHI bo phan can lam o doan nay, moi viec
     1-2 cau CU THE theo y_tuong_lon / the_gioi_hinh / mo_tip (chu gi, hinh gi, o dau so voi nguoi noi, vao ra the nao,
     tieng gi): R4 = bo cuc + lop chu / hinh / anh AI; R5 = chu nhan hero (hiem); FX = hieu ung chuyen dong khung / lop phu
     ve bang code; B6 = meme; B7 = tieng. NHIP_NEN / KHOANG_LANG: giao_viec rong (hoac 1 viec rat nhe).
     Diem nhan nang_luong >= 4 PHAI giao >= 2 bo phan (vd hinh + tieng). Khoanh khac dau an = cac quyet dinh manh nhat.
   - ly_do: vi sao quyet dinh nay phuc vu dung y / cam xuc cua cau (doi chieu phan_tich).

# CO VIDEO MAU (video_mau) — NGUOI DUNG DA CHON PHONG CACH NAY
- video_mau.bo_phong_cach (font, mau, he chu, cong thuc lop, camera, chuyen canh, bo cuc) + anh tham chieu la PHONG CACH
  BAT BUOC: font / mau / kieu chu / cach edit cua video mau DUOC DUNG ca khi trung "chieu AI rap khuon" hay so tay
  (khong cam, khong doi sang font / mau / kieu chu khac). Ban chi dao Y TUONG, mo tip, duong cong cam xuc, dau an,
  khoang lang, nhip, bang quyet dinh — SONG TRONG phong cach do (y tuong mac vao he chu + bo cuc + chieu cua video mau).
- "cam" chi ghi thu sai voi chu de / tone hoac lam hong phong cach video mau; khong cam thu video mau dang dung.
- the_gioi_hinh, mau_nhan, chu: mo ta THEO video mau (co the them chi tiet rieng cua noi dung, khong doi he).

# Y NGHIA CUA MOI PHAN TU (luat cung — do that 2026-10-16: vong ve vo tri cat ngang mat, mot y 'vong khep' lap 3 lan)
- Moi hinh / chu nhan / hieu ung ban de xuat phai co Y NGHIA ro trong video nay, thuoc 1 trong 4 loai: (a) lam mot Y
  dang noi DE HIEU hon (minh hoa, an du thanh hinh, so lieu, vat that); (b) KHUECH DAI cam xuc THAT cua nguoi noi luc
  do; (c) DAN MAT toi tu / vat / chi tiet quan trong nhat cua cau; (d) GIU NHIP khi khung dung yen qua lau (chi bang
  phuong tien nhe). Khong noi duoc no phuc vu y nao trong phan_tich -> khong de xuat. Trang tri cho dep = khong.
- Khoanh / gach chan / mui ten chi danh cho tu / vat LA LOI cua cau (khong khoanh tu phu), toi da MOT lan cho mot y; ban
  sao hook va doan goc cung mot cau la CUNG mot y.
- Moi y tuong hinh phai thuc hien DUOC dep va dung cho tren khung: chu nho nam o dau, nguoi noi o dau (bo cuc card /
  circle thu nguoi vao khung) — y tuong ve net / vong de len mat nguoi noi = sai.

# THAM MY — KHAC BIET VAN PHAI DEP (do that 2026-10-15: ban chi dao 'luoi o Zoom' cuong do 2 ra cac khoi xam trong
  rong tren nen den -> dung y tuong nhung nhat, kem hap dan hon ban cu)
- Tiet che KHONG phai ngheo nan: khung nao cung phai DEP khi dung mot minh — co chat lieu, anh sang, chieu sau, mau co
  chu dich, typography tinh. Cam khoi xam / den phang trong rong, "gia giao dien" so sai, nen tron vo hon.
- DANH GIA HINH NGUON truoc (video.role, video.hinh_anh, chu_tren_man_hinh): quay man hinh / webcam / hop online / hinh
  mo / it chuyen dong / khung nho -> PHAI lam giau hinh: anh AI dep minh hoa dung loi noi (B-roll, vat the 3D cat nen),
  doi bo cuc nhieu hon, the gioi hinh giau chat lieu — de mat nguoi xem co cho nhin. Hinh nguon dep (canh that, cam xuc
  that, chuyen dong tot) -> giu canh that lam chinh, do hoa it ma tinh.
- Y tuong do hoa phai ra THANH PHAM dep bang kha_nang_bo_dung; khong chac ve ra dep -> chon cach don gian ma chac dep.

# CHIEU AI RAP KHUON (da do tren cac video truoc — mac dinh KHONG dung; chi dung khi la Y TUONG RIENG cua video nay,
  co ly do bam noi dung, va KHONG nam trong chieu_lap_nhieu)
- punch-in zoom 1.0 -> 1.1-1.2 dap vao mat o hook / moi cau chot; dai sang cheo quet ngang khung; 4 goc khung ngam
  chu L; thanh tien trinh mong o day khung; giam bao hoa luc "noi dau" roi am len luc "giai phap"; light leak;
  vignette toi vien; tia lap lanh / tia sang nan quat sau dau; vong tron gon song lan; vien sang chay quanh khung.
- moi chu deu "pop" / "scale_in" + whoosh; moi cau mot chu to giua khung; font the thao nghieng + chu viet tay cho
  moi video; CTA vong tron + nut Follow.
Thay vao do: tim chieu tu CHINH the gioi cua video (vat, chat lieu, cu chi, am thanh trong canh, nghe nghiep...).

# SCHEMA DAU RA (CHI JSON; moi truong chu viet TIENG VIET CO DAU, cu the, khong chung chung)
{
  "phan_tich": {"nguoi_noi": "<ai, vai tro, quan he voi nguoi xem>", "khan_gia": "<noi voi ai>",
                "thong_diep_chinh": "<1-2 cau>", "muc_dich": "<video nay muon nguoi xem lam / nghi / cam gi>",
                "mach_y": [{"tu_segment": 0, "den_segment": 2, "y": "<y cua doan nay trong mach chung>"}],
                "tu_khoa": [{"tu": "<trich nguyen van>", "segment": 3, "y_nghia": "<vi sao tu nay quan trong / an du gi>"}],
                "cam_xuc_chu_dao": "<cam xuc that cua nguoi noi + cach no doi qua video>",
                "nguoi_xem_can_hieu": "<dieu nguoi xem phai hieu / cam duoc khi xem xong>",
                "chua_ro": ["<cau / tu chua chac nghia (neu co)>"]},
  "chu_de_that": "<1-2 cau>",
  "dieu_dong_lai": "<nguoi xem roi video voi suy nghi / cam xuc gi>",
  "y_tuong_lon": "<y tuong hinh-tieng rieng cua video, moc tu chi tiet that nao>",
  "the_gioi_hinh": "<chat lieu, anh sang, ket cau, logic mau>",
  "mo_tip": [{"ten": "<ten ngan>", "mo_ta": "<la gi, xuat hien o nhip nao, bien doi ra sao>"}],
  "the_loai": "<loai video>", "cuong_do": 3, "ly_do_cuong_do": "<vi sao>",
  "nhip_cat": "<nhip cat / do dai shot / doi nhip o dau>",
  "mau_nhan": "<mau nhan duy nhat mang moi diem nhan — vai tro, goi y ma hex hop the gioi hinh / thuong hieu>",
  "chu": "<giong chu: cach nhan tu, kieu chu hop chu de, mat do chu>",
  "am_thanh": {"the_gioi": "<id>", "ly_do": "...", "nhac": "<cam giac nhac>",
               "nhac_tat": {"segment": 9, "loi_noi": "<trich nguyen van>", "khi": "truoc|sau", "kieu": "cat|mo_dan",
                            "bat_lai": {"segment": 11, "loi_noi": "<trich nguyen van>", "khi": "truoc|sau"} hoac null} hoac null,
               "mat_do_sfx": "thua|vua|day", "mo_tip_am": "<am thanh lap lai co chu dich hoac rong>"},
  "hook": {"cam_xuc": "...", "cach_mo": "<cu the cho CHINH doan hook>", "muc_do": "nhe|vua|manh"},
  "nhip": [{"tu_segment": 0, "den_segment": 1, "vai_tro": "mo|dan|day_len|cao_trao|lang|xoay|chot|cta",
            "cam_xuc": "<nguoi xem cam thay gi>", "nang_luong": 3,
            "hinh": "<y tuong hinh chung cua nhip, bam loi noi>", "y_nghia": "<hinh do lam ro / khuech dai Y nao>",
            "chuyen_canh_vao": "<cat thang / cach chuyen + vi sao>", "tiet_che": "<khong lam gi o nhip nay>"}],
  "khoanh_khac_dau_an": [{"segment": 3, "loi_noi": "<trich nguyen van>", "y_tuong": "<hinh + tieng + chu>",
                          "vi_sao": "<vi sao day la luc dang nho>"}],
  "khoang_lang": [{"segment": 5, "loi_noi": "<trich nguyen van>", "vi_sao": "..."}],
  "cam": ["<dieu cu the khong duoc dung>"],
  "hook_qd": {"y_do": "<id>", "muc_dich": "khuech_dai", "nang_luong": 4, "neo": {"tu": "<tu trong cau hook>",
              "tin_hieu_hinh": "..."}, "tieu_diem": "mat", "khung": "can", "nen": "giu",
              "giao_viec": {"R4": "...", "FX": "...", "B7": "..."}, "ly_do": "..."},
  "quyet_dinh": [{"segment": 0, "y_do": "<id>", "muc_dich": "lam_ro|khuech_dai|giu_nhip|lang", "nang_luong": 3,
                  "neo": {"tu": "<1-4 tu nguyen van trong loi noi doan nay>", "tin_hieu_hinh": "<neu co>"},
                  "tieu_diem": "mat|chu|hinh|vat|toan_canh", "khung": "rong|trung|can|day_cham|giu|nha|dong_bang",
                  "nen": "giu|lam_toi|lam_mo|giam_mau",
                  "giao_viec": {"R4": "<viec cu the>", "B7": "<tieng gi, luc nao>"}, "ly_do": "..."}]
}
TRA VE CHI JSON."""


# Video DAI (giai doan 6, tai lieu "Two-Stage Prompting"): luot 1 ra ban chi dao TONG (khong quyet_dinh), luot 2 di theo tung
# CUM doan (~15-25s) ra bang quyet dinh chi tiet — moi cum nhan ban chi dao da chot de khong lech y tuong / duong cong.
_DIRECTOR_SCENE_SYSTEM = """Ban la DAO DIEN CANH (scene director) cua mot video short-form. Ban chi dao TONG cua ca video DA CHOT
(chi_dao: y tuong lon, the gioi hinh, mo tip, cuong do, nhip + nang_luong, dau an, khoang lang, am thanh, cam). Viec cua ban:
viet BANG QUYET DINH chi tiet cho CUM doan duoc giao (cum.segments) — moi segment dung MOT quyet dinh — dung theo ban chi dao
TONG (nang_luong cua nhip chua doan do, dau an, khoang lang), KHONG ve duong cong khac.

# 4 DINH LUAT (bat buoc)
1. Ly do ton tai: moi phan tu lam ro / khuech dai / giu nhip — khong thi khong dat.
2. Don tieu diem: chu lon / lop phu -> nen diu xuong; uu tien mat -> chu nho.
3. Ngan sach nhan thuc: khong qua ho_so_nhip.tai_toi_da phan tu chuyen dong moi cung luc (ngoai phu de).
4. Song nang luong: khong di ngang, sau doan nang_luong 5 thi doan sau <= 3, khong lap y_do (tru NHIP_NEN / KHOANG_LANG) o
   2 doan lien nhau (ke ca doan cuoi cum truoc: cum.doan_truoc). Diem nhan ~30-40%, con lai NHIP_NEN van doi khung.

# MOI QUYET DINH
- y_do (id trong tu_vung_y_do), muc_dich (lam_ro | khuech_dai | giu_nhip | lang), nang_luong 1-5.
- neo.tu: 1-4 TU nguyen van trong loi noi CUA DOAN DO; neo.tin_hieu_hinh: cu chi / vat (neu co mo ta), khong bia.
- tieu_diem: mat | chu | hinh | vat | toan_canh.  khung: rong | trung | can | day_cham | giu | nha | dong_bang.
- nen: giu | lam_toi | lam_mo | giam_mau.
- giao_viec: CHI bo phan can lam (R4 bo cuc / chu / hinh / anh AI; R5 chu nhan hero; FX hieu ung code; B6 meme; B7 tieng),
  moi viec 1-2 cau CU THE theo y_tuong_lon / the_gioi_hinh / mo_tip. Nang_luong >= 4 -> >= 2 bo phan.
- ly_do: vi sao phuc vu dung y / cam xuc cua cau.

# SCHEMA (CHI JSON, tieng Viet co dau)
{"quyet_dinh": [{"segment": 12, "y_do": "<id>", "muc_dich": "...", "nang_luong": 3, "neo": {"tu": "...", "tin_hieu_hinh": "..."},
                 "tieu_diem": "...", "khung": "...", "nen": "giu", "giao_viec": {"R4": "..."}, "ly_do": "..."}]}
TRA VE CHI JSON."""


# ---------------------------------------------------------------------------
# PROMPT 2 — DUYET BAN DUNG
# ---------------------------------------------------------------------------
_DIRECTOR_REVIEW_SYSTEM = """Ban la DAO DIEN dang DUYET ban ke hoach dung cua chinh video ban da chi dao (chi_dao). Cac bo
phan da dat chu, hieu ung, chuyen canh, meme, SFX theo BANG QUYET DINH cua ban. Viec cua ban: xem TUNG NHIP, doi chieu voi
chi dao va CAT / DOI nhung gi lam video thanh "AI rap khuon", lam loang cam xuc, sai chu de, hoac pha 4 dinh luat
(ly do ton tai, don tieu diem, ngan sach nhan thuc, song nang luong). It ma dung > nhieu ma deu.

# DU LIEU
- chi_dao: ban chi dao cua ban (y tuong lon, mo tip, cuong do, tung nhip + nang_luong, dau an, khoang lang, cam, ho so nhip).
- ban_dung[]: theo tung nhip — moi phan tu co "id" de ban tham chieu:
  lop chu / do hoa ("layer:<id>" hoac "group:<id>" cho mot to hop), hieu ung tu viet ("fx:<id>" + mo ta + nhan chieu),
  chuyen canh ("tr:<segment_index>"), meme ("meme:<n>"), SFX ("sfx:<n>"), chu nhan R5 ("cap:<n>").
  "hook": true = thuoc ban sao hook o dau video (khong duoc bo). "qd": quyet dinh (segment) ma phan tu nay thuc hien.
  Moi nhip co "quyet_dinh": [{segment, y_do, nang_luong, neo, giao_viec, da_lam: {bo_phan: true/false}}] — he thong da
  dem: quyet dinh nao da duoc bo phan nao thuc hien.
- thong_ke_lap: so lan moi chieu / kieu vao chu / chuyen canh / tieng lap trong video NAY.
- chieu_lap_nhieu: chieu da dung o nhieu video gan day cua cung nguoi dung.
- danh_muc: kieu vao chu + chuyen canh hop le.

# XET (theo thu tu uu tien)
1. Phan tu nam trong KHOANG LANG cua chi dao -> bo (tru chu phu de).
2. Phan tu trai voi "cam" hoac voi tiet_che cua nhip -> bo.
3. Nhip nang_luong 1-2 ma day lop / hieu ung / tieng -> bo bot, giu thu dang gia nhat (NGAN SACH NHAN THUC).
4. LAP: cung mot chieu / cung kieu vao / cung tieng / cung chuyen canh lap nhieu -> giu lan dat nhat, bo hoac DOI cac
   lan con lai (doi kieu vao chu, doi chuyen canh trong danh_muc) de video co bien hoa. Chieu trong chieu_lap_nhieu ma
   khong phai y tuong rieng cua video -> bo.
5. Phan tu chung chung, khong phuc vu y tuong lon / mo tip / cam xuc nhip, hoac KHONG noi duoc no lam ro / khuech dai /
   giu nhip Y nao trong chi_dao.phan_tich -> bo. NGOAI LE: phan tu "qd" thuc hien quyet dinh nang_luong >= 4 hoac la phan tu
   DUY NHAT giu nhip mot doan dai -> khong bo vi ly do nay.
5b. TRUNG Y: hai phan tu cung the hien MOT y o cung khoanh khac (vd lop vong + hieu ung vong cung khoanh mot tu, mui ten +
   hieu ung chi cung mot vat) -> giu cai ro nhat, bo cai con lai.
6. KHOANH KHAC DAU AN phai con du luc: neu bi phan tu khac lan at -> bo phan tu lan at (khong bo chinh phan tu cua dau an).
Khong bo de tro thanh video trong: moi nhip nang_luong >= 3 van can diem nhan. Khong them phan tu moi.
Phan tu co "kieu_chu" / "theo_mau" = dang TAI HIEN video mau nguoi dung chon -> KHONG coi la rap khuon, khong doi kieu vao
cua no (chi bo khi roi vao khoang lang hoac lan at dau an).
Quyet dinh nang_luong >= 4 ma "da_lam" con false -> ghi vao "thieu" (he thong da / se bo sung bang code; ban chi ghi nhan).

# SCHEMA (CHI JSON, tieng Viet co dau)
{
  "nhan_xet": "<2-4 cau: ban dung dang dung / lech chi dao o dau>",
  "diem": {"dung_chu_de": 7, "khac_biet": 6, "cam_xuc": 7},
  "thieu": [{"segment": 6, "viec": "<quyet dinh manh nao chua duoc thuc hien>"}],
  "bo": [{"id": "<id trong ban_dung>", "ly_do": "..."}],
  "doi_kieu_vao": [{"id": "layer:<id>|group:<id>", "preset": "<kieu vao trong danh_muc>", "ly_do": "..."}],
  "doi_chuyen_canh": [{"id": "tr:<segment_index>", "type": "<id trong danh_muc hoac cut>", "ly_do": "..."}]
}
TRA VE CHI JSON."""


def _p(name):
    return prompt_store.get_prompt(name, globals()[name])


def prompt_fp():
    """Van tay 2 prompt dao dien (own_key: khong nam trong fingerprint chung -> sua khong lam B1/B2 chay lai)."""
    import hashlib
    blob = _p("_DIRECTOR_SYSTEM") + "\n---\n" + _p("_DIRECTOR_REVIEW_SYSTEM") + "\n---\n" + _p("_DIRECTOR_SCENE_SYSTEM")
    return hashlib.sha1(blob.encode("utf-8")).hexdigest()[:12]


# ---------------------------------------------------------------------------
# DAU VAO cho ban chi dao
# ---------------------------------------------------------------------------
def _f(v, d=0.0):
    return providers._f(v, d)


def _timeline_rows(segments, transcript_data, emotion_map_data, key_moments_data):
    rows = providers._ban_do_timeline(segments)
    out = []
    for i, seg in enumerate(segments or []):
        sid = seg.get("source_id", "")
        st, en = _f(seg.get("start")), _f(seg.get("end"))
        base = rows[i] if i < len(rows) else {}
        row = {"segment_index": i, "source_id": sid,
               "timeline_tu": base.get("timeline_tu"), "timeline_den": base.get("timeline_den"),
               "nguon_tu": round(st, 2), "nguon_den": round(en, 2)}
        row.update(providers._nhip_cua_segment(seg))
        row["loi_noi"] = providers._gon_loi_thoai((transcript_data or {}).get(sid), st, en)
        emos = []
        for e in (emotion_map_data or {}).get(sid) or []:
            if isinstance(e, dict) and providers._overlap(_f(e.get("start")), _f(e.get("end")), st, en):
                emos.append({k: e.get(k) for k in ("emotion", "intensity") if e.get(k)}
                            | ({"bang_chung": str(e.get("evidence"))[:160]} if e.get("evidence") else {}))
        if emos:
            row["cam_xuc"] = emos
        kms = [{"type": k.get("type"), "mo_ta": str(k.get("description") or "")[:200]}
               for k in (key_moments_data or {}).get(sid) or []
               if isinstance(k, dict) and providers._overlap(_f(k.get("start")), _f(k.get("end")), st, en)]
        if kms:
            row["khoanh_khac"] = kms
        out.append(row)
    return out


def _video_view(brief):
    out = []
    for s in (brief or {}).get("sources") or []:
        if not isinstance(s, dict):
            continue
        r = {k: s.get(k) for k in ("id", "summary", "role") if s.get(k)}
        if s.get("on_screen_text"):
            r["chu_tren_man_hinh"] = s["on_screen_text"][:12]
        if isinstance(s.get("giong_noi"), dict):
            r["giong_noi"] = {k: s["giong_noi"].get(k) for k in ("muc_to", "van_de") if s["giong_noi"].get(k)}
        if isinstance(s.get("quality"), dict) and s["quality"].get("notes"):
            r["hinh_anh"] = str(s["quality"]["notes"])[:200]
        out.append(r)
    if not out and (brief or {}).get("summary"):
        out.append({"summary": brief["summary"]})
    return out


FULL_SPEECH_MAX = 9000     # ky tu toi da cua toan bo loi noi goc dua dao dien (video dai -> rut moc gio thua hon)


def _overview(brief):
    """Tong quan CA BO video (Gemini): tom tat, tone, ngon ngu."""
    b = brief if isinstance(brief, dict) else {}
    out = {k: b.get(k) for k in ("summary", "tone", "language") if b.get(k)}
    return out or None


def _full_speech(brief):
    """NGUYEN VAN toan bo loi noi cua tung video goc (ca phan da cat) kem moc gio ~10s — dao dien hieu ca mach noi dung,
    khong chi cac doan giu lai. Qua dai -> cat bot moc gio, roi cat duoi (giu dau + cuoi)."""
    out = []
    for s in (brief or {}).get("sources") or []:
        if not isinstance(s, dict):
            continue
        parts, last = [], -99.0
        for t in s.get("transcript") or []:
            if not isinstance(t, dict) or not str(t.get("text") or "").strip():
                continue
            st = _f(t.get("start"))
            if st - last >= 10:
                parts.append("[%d:%02d]" % (int(st) // 60, int(st) % 60))
                last = st
            parts.append(str(t["text"]).strip())
        txt = " ".join(parts)
        if len(txt) > FULL_SPEECH_MAX:
            half = FULL_SPEECH_MAX // 2
            txt = txt[:half] + " … [luoc giua] … " + txt[-half:]
        if txt:
            out.append({"id": s.get("id"), "loi_noi": txt})
    return out or None


def _ref_view(reference_analysis):
    if not isinstance(reference_analysis, dict) or not reference_analysis:
        return None
    keys = ("summary", "format", "style_fingerprint", "pacing", "structure", "attention_system", "audio",
            "editing_language", "transfer_rules", "style_patterns")
    v = {k: reference_analysis[k] for k in keys if reference_analysis.get(k) not in (None, "", [], {})}
    kit = reference_analysis.get("style_kit") if isinstance(reference_analysis.get("style_kit"), dict) else {}
    if kit:
        # BO PHONG CACH chi tiet (font, mau, he chu, cong thuc, camera...) — dao dien phai song TRONG phong cach nay
        bk = {k: kit[k] for k in ("palette", "fonts", "subtitle", "text_system", "motion", "camera", "transitions",
                                  "layouts", "broll_style", "pacing") if kit.get(k) not in (None, "", [], {})}
        if kit.get("recipes"):
            bk["recipes"] = [{"name": r.get("name"), "when": r.get("when")} for r in kit["recipes"] if isinstance(r, dict)]
        v["bo_phong_cach"] = bk
    return v or None


def capabilities():
    """Nhung gi bo dung lam duoc — dao dien chi de xuat thu thuc hien duoc (font bang id, khong cat lai...)."""
    fonts = []
    try:
        import remotion_plan
        for f in remotion_plan.load_catalog().get("fonts") or []:
            if isinstance(f, dict) and f.get("id"):
                fonts.append({k: f.get(k) for k in ("id", "label", "look") if f.get(k)})
    except Exception:
        pass
    return {
        "noi_dung": "Thu tu + diem cat cac doan DA CHOT (khong cat lai, khong doi thu tu). Nhip hinh doi bang bo cuc, "
                    "chuyen canh, jump-cut doi co khung, lop do hoa, hieu ung — khong bang cat lai.",
        "font": fonts,
        "bo_cuc": ["full (toan khung nguoi noi)", "split (B-roll / anh o nua tren)", "card (A-roll trong the bo goc)",
                   "circle (A-roll trong khung tron)", "broll (B-roll toan khung, tieng van chay)", "graphic (canh do hoa)"],
        "lop_do_hoa": "chu nhieu tang (font, co, mau, gradient, glow, vien, nghieng, chu SAU nguoi nho tach nguoi), chu anh "
                      "AI (chu thiet ke thanh anh theo phong cach video), box, vong tu ve, duong / mui ten tu ve, anh "
                      "(anh AI / khung cat tu video / anh tach nen 3D), huy hieu (anh AI ca phan tu), so chay, thanh tien do",
        "kieu_vao_chu": list(ENTER_PRESETS),
        "chuyen_canh": _transition_ids(),
        "hieu_ung_tu_viet": "ve bang code tung khung: lop phu (hinh khoi, vet, hat, anh sang, khung, hinh vector minh hoa) "
                            "truoc hoac SAU nguoi; hoac tac dong ca khung video (zoom, xoay, lac, nghieng, mau, sang, nhoe). "
                            "Khong ve chu trong hieu ung.",
        "anh_ai": "toi da 6 anh AI chat luong cao (B-roll minh hoa dung loi noi, vat the 3D cat nen) theo the gioi hinh — "
                  "cong cu chinh de lam giau video co hinh nguon ngheo",
        "am_thanh": "1 bo tieng the gioi (whoosh, swoosh, pop, click, boom, riser, ding, typing) + SFX trong kho (co nhan) "
                    "dat dung giay; khoang lang = khong SFX",
        "nhac": "1 bai nhac nen co san trong kho (khong lam nhac moi, khong doi nhip bai): bat dau SAU hook, nho duoi giong "
                "noi, giam khi meme cat vao, fade cuoi; co the TAT nhac o 1 cau (nhac_tat)",
        "meme": "clip phan ung trong kho meme cat vao / de len (chi khi hop tone)",
        "khung": "co canh tung doan do CODE dung theo 'khung' cua quyet dinh (zoom muot quanh nguoi noi, toi da zoom_max "
                 "cua ho so nhip): rong / trung / can / day_cham / giu / nha; 'dong_bang' = dung hinh ~0.8s dau doan "
                 "(tieng van chay) + vien sang quanh nguoi noi (tach nen)",
        "nen": "'nen' cua quyet dinh: lam_toi / lam_mo / giam_mau chi NEN video quanh luc tu neo (nguoi noi tach nen van "
               "net) — de chu lon / lop phu thanh tieu diem",
        "so_sanh": "lop 'compare' (2 anh truoc / sau, gat ngang hoac chia doi, nhan TRUOC / SAU) cho y do TRUOC_SAU",
    }


def tu_vung_view():
    return [{"id": k, "khi": v["khi"], "cach": v["cach"], "bo_phan": list(v["bo_phan"])} for k, v in Y_DO.items()]


def rang_buoc_view(hook_level=None):
    """Rang buoc cung dua dao dien: muc hook bat buoc (yeu cau edit) + ho so nhip theo cuong do."""
    out = {"ho_so_nhip_theo_cuong_do": {str(k): {kk: v[kk] for kk in ("ten", "cat_toi_thieu", "dung_im_toi_da",
                                                                        "zoom_max", "chuyen_dong", "rung_loe",
                                                                        "mat_do_sfx", "tai_toi_da")}
                                        for k, v in HO_SO_NHIP.items()}}
    if hook_level and hook_level[0]:
        out["hook_muc_do"] = {"muc": hook_level[0], "ly_do": hook_level[1], "bat_buoc": True}
    return out


# Video DAI -> 2 luot (giai doan 6): luot 1 ban chi dao TONG, luot 2 bang quyet dinh theo CUM doan
SPLIT_SEGS = 28            # > 28 doan (B2 cat jump-cut ~2s: video 37s da ~17 doan) ...
SPLIT_SEC = 90.0           # ... hoac > 90s -> chia
CHUNK_SEC = 22.0           # moi cum ~15-25s
CHUNK_MAX = 8              # toi da 8 doan / cum


def _chunks(segments):
    out, cur, dur = [], [], 0.0
    for i, s in enumerate(segments or []):
        d = max(0.0, _f(s.get("end")) - _f(s.get("start")))
        if cur and (dur + d > CHUNK_SEC or len(cur) >= CHUNK_MAX):
            out.append(cur)
            cur, dur = [], 0.0
        cur.append(i)
        dur += d
    if cur:
        out.append(cur)
    return out


def needs_split(segments):
    n = len(segments or [])
    total = sum(max(0.0, _f(s.get("end")) - _f(s.get("start"))) for s in segments or [])
    return n > SPLIT_SEGS or total > SPLIT_SEC


def gpt_direct(segments, transcript_data, emotion_map_data, key_moments_data, story=None, brief=None,
               reference_analysis=None, brand_view=None, user_media=None, memory=None, overused_tags=None,
               canvas_note=None, log=None, hook=None, hook_level=None):
    """DD-chi-dao -> ban chi dao (chua chuan hoa). hook = doan hook B3 da chon (thong_tin_hook); hook_level = (muc, ly do)
    bat buoc tu yeu cau edit. Video dai (needs_split) -> luot 1 tong + luot 2 bang quyet dinh theo cum."""
    timeline = _timeline_rows(segments, transcript_data, emotion_map_data, key_moments_data)
    payload = {
        "tong_quan": _overview(brief),
        "toan_bo_loi_noi": _full_speech(brief),
        "video": _video_view(brief),
        "cau_chuyen": story or {},
        "timeline": timeline,
        "tong_do_dai_giay": round(sum(_f(s.get("end")) - _f(s.get("start")) for s in segments or []), 1),
        "hook": {k: hook.get(k) for k in ("source_id", "src_start", "src_end", "do_dai", "caption", "reason")
                 if hook.get(k) is not None} if isinstance(hook, dict) else None,
        "rang_buoc": rang_buoc_view(hook_level),
        "tu_vung_y_do": tu_vung_view(),
        "the_gioi_am_thanh": [{"id": k, "mo_ta": v} for k, v in SOUND_WORLDS.items()],
        "kha_nang_bo_dung": capabilities(),
    }
    if payload["hook"]:
        payload["hook"]["loi_noi"] = providers._gon_loi_thoai(
            (transcript_data or {}).get(hook.get("source_id")), _f(hook.get("src_start")), _f(hook.get("src_end")))
    else:
        payload.pop("hook")
    ref = _ref_view(reference_analysis)
    import ref_pack
    ref_imgs = ref_pack.step_images("DD")
    if ref:
        payload["video_mau"] = ref
        if ref_imgs:
            payload["video_mau"]["anh_tham_chieu"] = ref_pack.step_view("DD")
    if brand_view:
        payload["thuong_hieu"] = brand_view
    if user_media:
        payload["tu_lieu_nguoi_dung"] = user_media
    if memory:
        payload["so_tay_gan_day"] = memory
    if overused_tags:
        payload["chieu_lap_nhieu"] = [{"chieu": DEVICE_LABEL.get(k, k), "so_video": c} for k, c in overused_tags.items()]
    split = needs_split(segments)
    if log:
        log("DD: %s dao dien doc toan bo noi dung + phan tich Gemini -> ban chi dao%s..." % (
            providers.plan_ai_name(), " (video dai: luot 1 tong, luot 2 theo %d cum)" % len(_chunks(segments)) if split else ""))
    system = (_p("_DIRECTOR_SYSTEM") + (canvas_note or "") + (ref_pack.rule("DD") if ref_imgs else "")
              + ngon_ngu.luat(story, "DD"))
    if split:
        system += ("\n\n# VIDEO DAI — LUOT 1\nKHONG ghi \"quyet_dinh\" (de mang rong []): luot sau viet bang quyet dinh theo "
                   "tung cum doan, bam ban chi dao TONG nay. Van ghi day du phan con lai (ke ca \"hook_qd\" va nhip phu kin).")
    text = providers.plan_chat([
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ], json_mode=True, max_tokens=16000, temperature=0.7, req_timeout=420, max_attempts=2, step_label="DD-chi-dao",
        images=ref_imgs or None)
    raw = providers._safe_json(text)
    if split and isinstance(raw, dict) and (raw.get("y_tuong_lon") or raw.get("chu_de_that")):
        raw["quyet_dinh"] = _scene_decisions(raw, timeline, story, hook_level, log=log)
    return raw


def _scene_decisions(raw, timeline, story, hook_level, log=None):
    """Luot 2 (video dai): bang quyet dinh theo tung cum doan, moi cum nhan ban chi dao TONG da chot. Cum loi -> bo qua
    (normalize tu dien NHIP_NEN theo nang luong nhip)."""
    tong = {k: raw.get(k) for k in ("phan_tich", "chu_de_that", "dieu_dong_lai", "y_tuong_lon", "the_gioi_hinh", "mo_tip",
                                    "the_loai", "cuong_do", "mau_nhan", "chu", "am_thanh", "hook", "nhip",
                                    "khoanh_khac_dau_an", "khoang_lang", "cam") if raw.get(k) not in (None, "", [], {})}
    prof = profile_for(raw)
    out, prev = [], None
    segs = [{"start": r["nguon_tu"], "end": r["nguon_den"]} for r in timeline]
    for n, idx in enumerate(_chunks(segs)):
        user = {"chi_dao": tong, "ho_so_nhip": prof, "tu_vung_y_do": tu_vung_view(),
                "rang_buoc": rang_buoc_view(hook_level), "cau_chuyen": {k: (story or {}).get(k) for k in (
                    "story_arc", "tone", "edit_request") if (story or {}).get(k)},
                "cum": {"thu_tu": n + 1, "segments": [timeline[i] for i in idx], "doan_truoc": prev}}
        try:
            text = providers.plan_chat([
                {"role": "system", "content": _p("_DIRECTOR_SCENE_SYSTEM") + ngon_ngu.luat(story, "DD")},
                {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
            ], json_mode=True, max_tokens=8000, temperature=0.6, req_timeout=300, max_attempts=2,
                step_label="DD-canh")
            got = [q for q in (providers._safe_json(text) or {}).get("quyet_dinh") or []
                   if isinstance(q, dict) and _int(q.get("segment"), -1, 10 ** 6, -1) in idx]
        except Exception as ex:          # 1 cum loi khong lam hong ca ban chi dao
            if log:
                log("DD-canh: cum %d loi (%s) -> doan cua cum dung nhip nen" % (n + 1, str(ex)[:120]))
            got = []
        out += got
        if got:
            last = max(got, key=lambda q: _int(q.get("segment"), -1, 10 ** 6, -1))
            prev = {k: last.get(k) for k in ("segment", "y_do", "nang_luong", "khung")}
    return out


# ---------------------------------------------------------------------------
# CHUAN HOA ban chi dao (code, tat dinh)
# ---------------------------------------------------------------------------
def _int(v, lo, hi, d):
    try:
        return max(lo, min(hi, int(round(float(v)))))
    except (TypeError, ValueError):
        return d


def _txt(v, n=400):
    return str(v or "").strip()[:n]


def _level(v):
    m = _plain(v).strip()
    return {"nhe": "nhe", "vua": "vua", "manh": "manh"}.get(m)


def _find_quote(quote, seg, transcript_data):
    """Cau loi noi (trong segment) khop doan trich -> (src_start, src_end) hoac None."""
    q = re.sub(r"[^\w ]+", " ", _plain(quote)).split()
    if not q:
        return None
    sid = seg.get("source_id", "")
    st, en = _f(seg.get("start")), _f(seg.get("end"))
    best, score = None, 0.0
    for t in (transcript_data or {}).get(sid) or []:
        if not isinstance(t, dict) or not providers._overlap(_f(t.get("start")), _f(t.get("end")), st, en):
            continue
        words = set(re.sub(r"[^\w ]+", " ", _plain(t.get("text"))).split())
        if not words:
            continue
        sc = sum(1 for w in q if w in words) / float(len(q))
        if sc > score:
            best, score = t, sc
    if best is None or score < 0.5:
        return None
    return round(max(st, _f(best.get("start"))), 2), round(min(en, _f(best.get("end"))), 2)


def _guess_intensity(story):
    import hook_rule
    lv = hook_rule._level_of(" ".join(str(x) for x in (
        (story or {}).get("tone"), json.dumps((story or {}).get("edit_request") or {}, ensure_ascii=False)) if x))
    return {"nhe": 2, "manh": 4}.get(lv, 3)


def _analysis(pa, n):
    """Phan tich noi dung cua dao dien (thong diep, mach y, tu khoa...) -> ban gon, hop le. Thieu -> {}."""
    pa = pa if isinstance(pa, dict) else {}
    out = {k: _txt(pa.get(k), 400) for k in ("nguoi_noi", "khan_gia", "thong_diep_chinh", "muc_dich", "cam_xuc_chu_dao",
                                            "nguoi_xem_can_hieu") if _txt(pa.get(k))}
    my = []
    for m in pa.get("mach_y") or []:
        if isinstance(m, dict) and _txt(m.get("y")):
            a = _int(m.get("tu_segment"), 0, max(0, n - 1), None)
            z = _int(m.get("den_segment"), 0, max(0, n - 1), a)
            my.append({"tu_segment": a, "den_segment": z, "y": _txt(m.get("y"), 300)})
    if my:
        out["mach_y"] = my[:16]
    tk = [{"tu": _txt(t.get("tu"), 60), "segment": _int(t.get("segment"), 0, max(0, n - 1), None),
           "y_nghia": _txt(t.get("y_nghia"), 240)} for t in pa.get("tu_khoa") or [] if isinstance(t, dict) and _txt(t.get("tu"))]
    if tk:
        out["tu_khoa"] = tk[:10]
    cr = [_txt(x, 160) for x in pa.get("chua_ro") or [] if _txt(x)]
    if cr:
        out["chua_ro"] = cr[:6]
    return out


def _words(s):
    return re.sub(r"[^\w ]+", " ", _plain(s)).split()


def _anchor(tu, seg, transcript_data, asr):
    """Giay NOI tu neo trong doan -> (src_start, src_end, khop_tung_chu) hoac None. Uu tien gio TUNG CHU (Whisper:
    [[chu, dau, cuoi], ...]); khong khop -> cau loi noi chua cum do (Gemini)."""
    q = _words(tu)
    if not q:
        return None
    st, en = _f(seg.get("start")), _f(seg.get("end"))
    ws = []
    for w in (asr or {}).get(seg.get("source_id", "")) or []:
        try:
            ww, a, b = w[0], float(w[1]), float(w[2])
        except (TypeError, ValueError, IndexError):
            continue
        if a >= st - 0.05 and b <= en + 0.05:
            for t in _words(ww) or [""]:
                ws.append((t, a, b))
    best, score = None, 0.0
    for j in range(len(ws)):
        hit = [k for k in range(len(q)) if j + k < len(ws) and ws[j + k][0] == q[k]]
        sc = len(hit) / float(len(q))
        if sc > score:
            best, score = (ws[j + hit[0]][1], ws[j + hit[-1]][2]), sc
    if best and score >= 0.6:
        return round(best[0], 2), round(best[1], 2), True
    rng = _find_quote(tu, seg, transcript_data)
    return (rng[0], rng[1], False) if rng else None


def _gv(v, keep=None):
    """giao_viec -> {bo_phan: viec} hop le."""
    out = {}
    for k, t in (v.items() if isinstance(v, dict) else []):
        k = str(k).strip().upper()
        if k in BO_PHAN and _txt(t) and (keep is None or k in keep):
            out[k] = _txt(t, 400)
    return out


def _one_decision(q, seg, transcript_data, asr, default_nl, default_y="NHIP_NEN"):
    q = q if isinstance(q, dict) else {}
    y = str(q.get("y_do") or "").strip().upper()
    y = y if y in Y_DO else default_y
    nl = _int(q.get("nang_luong"), 1, 5, default_nl)
    md = _plain(q.get("muc_dich")).strip().replace(" ", "_")
    if md not in MUC_DICH:
        md = {"KHOANG_LANG": "lang", "NHIP_NEN": "giu_nhip"}.get(y, "khuech_dai")
    neo = q.get("neo") if isinstance(q.get("neo"), dict) else {}
    tu = _txt(neo.get("tu"), 60)
    rng = _anchor(tu, seg, transcript_data, asr) if tu else None
    kh = _plain(q.get("khung")).strip().replace(" ", "_")
    nen = _plain(q.get("nen")).strip().replace(" ", "_")
    td = _plain(q.get("tieu_diem")).strip().replace(" ", "_")
    out = {"source_id": seg.get("source_id"), "nguon_tu": round(_f(seg.get("start")), 2),
           "nguon_den": round(_f(seg.get("end")), 2),
           "y_do": y, "ten": Y_DO[y]["ten"], "muc_dich": md, "nang_luong": nl,
           "neo": {"tu": tu, "tin_hieu_hinh": _txt(neo.get("tin_hieu_hinh"), 200)},
           "tieu_diem": td if td in TIEU_DIEM else ("chu" if y in ("NHAN_TU_KHOA", "SO_LIEU", "TIENG_LONG") else "mat"),
           "khung": kh if kh in KHUNG else "", "nen": nen if nen in NEN else "giu",
           "giao_viec": {} if y == "KHOANG_LANG" else _gv(q.get("giao_viec")),
           "ly_do": _txt(q.get("ly_do"), 300)}
    if rng:
        out["neo"].update(src_start=rng[0], src_end=rng[1], khop_tung_chu=rng[2])
    if not q:
        out["_tu_dien"] = True          # AI khong ghi quyet dinh cho doan nay -> code dien theo nhip
    return out


_UU_TIEN_BP = ("R4", "B7", "R5", "FX", "B6")
HOOK_NL = {"nhe": 3, "vua": 4, "manh": 5}


def _rules(qds, cd, notes):
    """4 dinh luat tren BANG QUYET DINH (code, tat dinh): chong nhon, bat buoc ha nhiet, ngan sach nhan thuc, diem nhan du
    luc. Ghi lai moi thay doi vao notes."""
    def ha(q, why):
        notes.append("đoạn %d: %s %s -> nhịp nền (%s)" % (q["segment"], q["y_do"], q["ten"], why))
        q.update(y_do="NHIP_NEN", ten=Y_DO["NHIP_NEN"]["ten"], muc_dich="giu_nhip", giao_viec={},
                 nang_luong=min(q["nang_luong"], 3))
    for i in range(1, len(qds)):
        a, b = qds[i - 1], qds[i]
        # CHONG NHON: cung y do (diem nhan) o 2 doan lien nhau -> ha doan yeu hon (bang -> doan sau)
        if a["y_do"] == b["y_do"] and a["y_do"] not in NHE_Y_DO:
            ha(a if a["nang_luong"] < b["nang_luong"] else b, "lặp ý đồ 2 đoạn liền nhau — chống nhờn")
        # BAT BUOC HA NHIET: sau doan nang luong 5, doan sau <= 3 (y do nang -> nhip nen)
        a, b = qds[i - 1], qds[i]
        if a["nang_luong"] >= 5 and b["nang_luong"] > 3:
            notes.append("đoạn %d: năng lượng %d -> 3 (bắt buộc hạ nhiệt sau cao trào đoạn %d)" % (
                b["segment"], b["nang_luong"], a["segment"]))
            b["nang_luong"] = 3
            if Y_DO[b["y_do"]]["tai"] >= 3:
                ha(b, "ý đồ nặng ngay sau cao trào")
    for q in qds:
        gv = q["giao_viec"]
        if q["y_do"] in NHE_Y_DO:
            continue
        # NGAN SACH: nhip nang luong thap khong giao qua 2 bo phan
        if q["nang_luong"] <= 2 and len(gv) > 2:
            keep = [k for k in _UU_TIEN_BP if k in gv][:2]
            notes.append("đoạn %d: năng lượng %d chỉ giữ %s (ngân sách nhận thức)" % (q["segment"], q["nang_luong"], "+".join(keep)))
            q["giao_viec"] = {k: gv[k] for k in keep}
        # DIEM NHAN MANH phai co >= 2 bo phan (hinh + tieng): thieu tieng -> code giao B7 theo the gioi am thanh
        if q["nang_luong"] >= 4 and len(q["giao_viec"]) < 2 and "B7" not in q["giao_viec"]:
            q["giao_viec"]["B7"] = "1 tiếng nhấn đúng lúc nói '%s' theo thế giới âm thanh %s (mạnh theo năng lượng %d)" % (
                q["neo"].get("tu") or "từ chính", (cd.get("am_thanh") or {}).get("the_gioi"), q["nang_luong"])
            notes.append("đoạn %d: điểm nhấn năng lượng %d chỉ có 1 bộ phận -> giao thêm B7" % (q["segment"], q["nang_luong"]))
        if not q["giao_viec"]:
            # y do diem nhan ma khong giao viec nao -> giao bo phan mac dinh cua y do (viec = cach the hien)
            bp = [k for k in Y_DO[q["y_do"]]["bo_phan"]][:2]
            q["giao_viec"] = {k: "%s: %s — neo '%s'" % (q["ten"], Y_DO[q["y_do"]]["cach"], q["neo"].get("tu") or "")
                              for k in bp}
            if bp:
                notes.append("đoạn %d: %s chưa giao việc -> giao %s" % (q["segment"], q["y_do"], "+".join(bp)))


def normalize(raw, segments, transcript_data, story=None, hook=None, asr_words=None, hook_level=None):
    """Ban chi dao AI -> ban CHUAN (nhip phu kin timeline, gio nguon + timeline cho moi nhip / dau an / khoang lang,
    cuong do / muc hook / the gioi am thanh hop le, BANG QUYET DINH phu kin moi doan + 4 dinh luat, ho so nhip).
    hook = doan hook B3 (thong_tin_hook); asr_words = {source_id: [[chu, dau, cuoi]]}; hook_level = (muc, ly do) bat
    buoc tu yeu cau edit. raw hong -> None."""
    if not isinstance(raw, dict) or not segments:
        return None
    n = len(segments)
    rows = providers._ban_do_timeline(segments)
    notes = []
    cd = {k: _txt(raw.get(k), 600) for k in ("chu_de_that", "dieu_dong_lai", "y_tuong_lon", "the_gioi_hinh",
                                            "the_loai", "ly_do_cuong_do", "nhip_cat", "mau_nhan", "chu")}
    if not cd["y_tuong_lon"] and not cd["chu_de_that"]:
        return None
    cd["phan_tich"] = _analysis(raw.get("phan_tich"), n)
    cd["cuong_do"] = _int(raw.get("cuong_do"), 1, 5, _guess_intensity(story))
    cd["mo_tip"] = [{"ten": _txt(m.get("ten"), 80), "mo_ta": _txt(m.get("mo_ta"), 400)}
                    for m in raw.get("mo_tip") or [] if isinstance(m, dict) and (m.get("ten") or m.get("mo_ta"))][:3]
    am = raw.get("am_thanh") if isinstance(raw.get("am_thanh"), dict) else {}
    world = _plain(am.get("the_gioi")).strip().replace(" ", "_")
    if world not in SOUND_WORLDS:
        world = {1: "toi_gian", 2: "am_ap", 3: "cong_nghe", 4: "dien_anh", 5: "vui_nhon"}[cd["cuong_do"]]
        world_note = "(tu chon theo cuong do — AI khong ghi the gioi hop le)"
    else:
        world_note = ""
    mat_do = _plain(am.get("mat_do_sfx")).strip()

    def _cau(x):
        """{segment, loi_noi, khi} -> gio nguon cua cau (hoac None)."""
        if not isinstance(x, dict):
            return None
        i = _int(x.get("segment"), 0, n - 1, None)
        rng = _find_quote(x.get("loi_noi"), segments[i], transcript_data) if i is not None else None
        if not rng:
            return None
        return {"segment": i, "source_id": segments[i].get("source_id"), "src_start": rng[0], "src_end": rng[1],
                "loi_noi": _txt(x.get("loi_noi"), 200), "khi": "truoc" if _plain(x.get("khi")).strip() == "truoc" else "sau"}
    nhac_tat = _cau(am.get("nhac_tat"))
    if nhac_tat:
        nt = am["nhac_tat"]
        nhac_tat["kieu"] = "cat" if _plain(nt.get("kieu")).strip() == "cat" else "mo_dan"
        bl = _cau(nt.get("bat_lai"))
        if bl and (bl["segment"] > nhac_tat["segment"] or (bl["segment"] == nhac_tat["segment"] and bl["src_start"]
                                                           > nhac_tat["src_end"])):
            nhac_tat["bat_lai"] = bl
    cd["am_thanh"] = {"the_gioi": world, "ly_do": (_txt(am.get("ly_do"), 300) + " " + world_note).strip(),
                      "nhac_tat": nhac_tat,
                      "nhac": _txt(am.get("nhac"), 300), "mo_tip_am": _txt(am.get("mo_tip_am"), 200),
                      "mat_do_sfx": mat_do if mat_do in ("thua", "vua", "day") else
                      ("thua" if cd["cuong_do"] <= 2 else "day" if cd["cuong_do"] >= 5 else "vua")}
    hk = raw.get("hook") if isinstance(raw.get("hook"), dict) else {}
    cd["hook"] = {"cam_xuc": _txt(hk.get("cam_xuc"), 200), "cach_mo": _txt(hk.get("cach_mo"), 400),
                  "muc_do": _level(hk.get("muc_do")) or LEVEL_OF_INTENSITY[cd["cuong_do"]]}
    if hook_level and hook_level[0] in HOOK_NL and cd["hook"]["muc_do"] != hook_level[0]:
        # LUAT: muc hook theo YEU CAU EDIT la rang buoc cung — dao dien lech -> ep (truoc day lech toi luc dung moi bi
        # luat hook khuech dai x2.4, sai y dao dien)
        notes.append("hook: mức %s -> %s (%s)" % (cd["hook"]["muc_do"], hook_level[0], hook_level[1]))
        cd["hook"]["muc_do"] = hook_level[0]
    cd["cam"] = [_txt(x, 200) for x in raw.get("cam") or [] if _txt(x)][:12]

    # NHIP: sap theo segment, cat chong, lap ho -> phu kin 0..n-1
    beats = []
    for b in raw.get("nhip") or []:
        if not isinstance(b, dict):
            continue
        a = _int(b.get("tu_segment"), 0, n - 1, None)
        z = _int(b.get("den_segment"), 0, n - 1, a)
        if a is None:
            continue
        beats.append((min(a, z), max(a, z), b))
    beats.sort(key=lambda x: (x[0], x[1]))
    clean, nxt = [], 0
    for a, z, b in beats:
        if z < nxt:
            continue
        a = max(a, nxt)
        if a > nxt and clean:
            clean[-1][1] = a - 1          # lap ho: noi nhip truoc toi sat nhip nay
        elif a > nxt:
            a = nxt
        clean.append([a, z, b])
        nxt = z + 1
    if not clean:
        clean = [[0, n - 1, {"vai_tro": "dan", "nang_luong": cd["cuong_do"]}]]
    elif nxt <= n - 1:
        clean[-1][1] = n - 1
    out_beats = []
    for a, z, b in clean:
        role = _plain(b.get("vai_tro")).strip().replace(" ", "_")
        nguon = []
        for i in range(a, z + 1):
            s = segments[i]
            nguon.append({"source_id": s.get("source_id"), "tu": round(_f(s.get("start")), 2),
                          "den": round(_f(s.get("end")), 2)})
        row = {
            "tu_segment": a, "den_segment": z,
            "timeline_tu": rows[a]["timeline_tu"] if a < len(rows) else None,
            "timeline_den": rows[z]["timeline_den"] if z < len(rows) else None,
            "nguon": nguon,
            "vai_tro": role if role in ROLES else "dan",
            "cam_xuc": _txt(b.get("cam_xuc"), 200),
            "nang_luong": _int(b.get("nang_luong"), 1, 5, cd["cuong_do"]),
            "hinh": _txt(b.get("hinh"), 500), "y_nghia": _txt(b.get("y_nghia"), 300),
            "chuyen_canh_vao": _txt(b.get("chuyen_canh_vao"), 200),
            "tiet_che": _txt(b.get("tiet_che"), 200),
        }
        # ban chi dao cu (v4) con camera / am thanh / chu nhan theo nhip -> giu khi co
        for k, lim in (("camera", 200), ("am_thanh", 200)):
            if _txt(b.get(k)):
                row[k] = _txt(b.get(k), lim)
        if b.get("chu_nhan"):
            row["chu_nhan"] = [_txt(x, 60) for x in b.get("chu_nhan") or [] if _txt(x)][:4]
        out_beats.append(row)
    cd["nhip"] = out_beats

    def _moments(items, extra):
        res = []
        for m in items or []:
            if not isinstance(m, dict):
                continue
            i = _int(m.get("segment"), 0, n - 1, None)
            if i is None:
                continue
            rng = _find_quote(m.get("loi_noi"), segments[i], transcript_data)
            if not rng:
                continue
            r = {"segment": i, "source_id": segments[i].get("source_id"), "src_start": rng[0], "src_end": rng[1],
                 "loi_noi": _txt(m.get("loi_noi"), 200)}
            for k in extra:
                r[k] = _txt(m.get(k), 400)
            res.append(r)
        return res

    hk_rng = None
    if isinstance(hook, dict) and hook.get("src_start") is not None:
        hk_rng = (hook.get("source_id") or segments[0].get("source_id"), _f(hook.get("src_start")),
                  _f(hook.get("src_end"), _f(hook.get("src_start")) + 4.0))
    cd["khoanh_khac_dau_an"] = _moments(raw.get("khoanh_khac_dau_an"), ("y_tuong", "vi_sao"))[:4]
    # khoang lang khong duoc trung khoanh khac dau an (dau an can tieng / hinh) va KHONG trung cau cua hook (cau do con mo
    # dau video, phai gay chu y — do that 2026-10-17: 'Vao khong?' vua lang o than video vua on ao o ban sao hook)
    lang = []
    for x in _moments(raw.get("khoang_lang"), ("vi_sao",)):
        if any(x["source_id"] == d["source_id"] and providers._overlap(x["src_start"], x["src_end"], d["src_start"],
                                                                       d["src_end"]) for d in cd["khoanh_khac_dau_an"]):
            continue
        if hk_rng and x["source_id"] == hk_rng[0] and providers._overlap(x["src_start"], x["src_end"], hk_rng[1], hk_rng[2]):
            notes.append("khoảng lặng '%s' trùng câu của hook -> bỏ (câu hook phải gây chú ý)" % x["loi_noi"][:60])
            continue
        lang.append(x)

    # BANG QUYET DINH: moi doan dung 1 quyet dinh; doan AI bo trong -> dien theo nhip (lang -> KHOANG_LANG, con lai NHIP_NEN)
    by = {}
    for q in raw.get("quyet_dinh") or []:
        if not isinstance(q, dict):
            continue
        try:
            i = int(round(float(q.get("segment"))))
        except (TypeError, ValueError):
            continue
        if 0 <= i < n and i not in by:
            by[i] = q
    beat_of = {}
    for b in out_beats:
        for i in range(b["tu_segment"], b["den_segment"] + 1):
            beat_of[i] = b
    qds = []
    for i in range(n):
        b = beat_of.get(i) or {}
        q = _one_decision(by.get(i), segments[i], transcript_data, asr_words, b.get("nang_luong", cd["cuong_do"]),
                          "KHOANG_LANG" if b.get("vai_tro") == "lang" else "NHIP_NEN")
        q["segment"] = i
        q["timeline_tu"], q["timeline_den"] = rows[i]["timeline_tu"], rows[i]["timeline_den"]
        qds.append(q)
    if raw.get("quyet_dinh") and len(by) < n:
        notes.append("đạo diễn bỏ trống %d/%d đoạn -> code điền theo nhịp" % (n - len(by), n))
    _rules(qds, cd, notes)
    cd["quyet_dinh"] = qds
    # quyet dinh KHOANG_LANG co neo -> them vao khoang lang (neu chua co, khong trung hook / dau an)
    for q in qds:
        if q["y_do"] != "KHOANG_LANG" or q["neo"].get("src_start") is None or len(lang) >= 3:
            continue
        a, z = q["neo"]["src_start"], q["neo"]["src_end"]
        if any(x["source_id"] == q["source_id"] and providers._overlap(x["src_start"], x["src_end"], a, z) for x in lang):
            continue
        if any(d["source_id"] == q["source_id"] and providers._overlap(a, z, d["src_start"], d["src_end"])
               for d in cd["khoanh_khac_dau_an"]):
            continue
        if hk_rng and q["source_id"] == hk_rng[0] and providers._overlap(a, z, hk_rng[1], hk_rng[2]):
            continue
        lang.append({"segment": q["segment"], "source_id": q["source_id"], "src_start": a, "src_end": z,
                     "loi_noi": q["neo"]["tu"], "vi_sao": q["ly_do"] or "khoảng lặng trong bảng quyết định"})
    cd["khoang_lang"] = lang[:3]

    # QUYET DINH CHO BAN SAO HOOK: muc nang luong >= muc hook bat buoc
    if hk_rng:
        hseg = {"source_id": hk_rng[0], "start": hk_rng[1], "end": hk_rng[2]}
        hq = _one_decision(raw.get("hook_qd"), hseg, transcript_data, asr_words,
                           HOOK_NL[cd["hook"]["muc_do"]], "MO_CAU_HOI")
        need = HOOK_NL[cd["hook"]["muc_do"]]
        if hq["nang_luong"] < need:
            notes.append("hook: năng lượng %d -> %d (mức hook %s)" % (hq["nang_luong"], need, cd["hook"]["muc_do"]))
            hq["nang_luong"] = need
        if hq["y_do"] in NHE_Y_DO:
            notes.append("hook: ý đồ %s không hợp phần mở đầu -> MO_CAU_HOI" % hq["y_do"])
            hq.update(y_do="MO_CAU_HOI", ten=Y_DO["MO_CAU_HOI"]["ten"], muc_dich="khuech_dai")
        if not hq["giao_viec"]:
            hq["giao_viec"] = {k: "hook — %s: %s" % (hq["ten"], Y_DO[hq["y_do"]]["cach"]) for k in ("FX", "B7")}
        if not hq["khung"]:
            hq["khung"] = {"nhe": "day_cham", "vua": "can", "manh": "can"}[cd["hook"]["muc_do"]]
        hq["anchor"] = "hook"
        cd["hook_qd"] = hq
    cd["ho_so_nhip"] = profile_for(cd)
    cd["_sua"] = notes
    cd["_v"] = DIRECTOR_VERSION
    return cd


def story_view(cd):
    """Phan ban chi dao dua vao cau_chuyen (moi buoc sau nhan)."""
    if not cd:
        return None
    return {k: v for k, v in cd.items() if not k.startswith("_")}


_VIEW_CORE = ("chu_de_that", "dieu_dong_lai", "y_tuong_lon", "the_gioi_hinh", "mo_tip", "the_loai", "cuong_do", "mau_nhan",
              "chu", "hook", "cam", "khoanh_khac_dau_an", "khoang_lang", "ho_so_nhip")


def view_for(cd, buoc):
    """Ban chi dao GON cho MOT bo phan (giai doan 1): phan chung (y tuong, the gioi, mo tip, nhip, dau an, lang, cam, ho so
    nhip) + "viec_cua_ban" = cac quyet dinh giao cho chinh bo phan nay (kem qd, neo, gio nguon) + duong nang luong tung doan.
    Ban chi dao cu (khong co quyet_dinh) -> story_view nhu truoc."""
    if not cd:
        return None
    if not cd.get("quyet_dinh"):
        return story_view(cd)
    v = {k: cd[k] for k in _VIEW_CORE if cd.get(k) not in (None, "", [], {})}
    pa = cd.get("phan_tich") or {}
    v["phan_tich"] = {k: pa[k] for k in ("thong_diep_chinh", "muc_dich", "mach_y", "tu_khoa", "cam_xuc_chu_dao",
                                          "nguoi_xem_can_hieu") if pa.get(k)}
    am = cd.get("am_thanh") or {}
    v["am_thanh"] = am if buoc == "B7" else {k: am.get(k) for k in ("the_gioi", "mat_do_sfx", "mo_tip_am") if am.get(k)}
    keys = ("tu_segment", "den_segment", "timeline_tu", "timeline_den", "nguon", "vai_tro", "cam_xuc", "nang_luong",
            "hinh", "y_nghia", "tiet_che") + (("chuyen_canh_vao",) if buoc == "R4" else ())
    v["nhip"] = [{k: b.get(k) for k in keys if b.get(k) not in (None, "", [])} for b in cd.get("nhip") or []]
    v["duong_nang_luong"] = [{"qd": q["segment"], "y_do": q["y_do"], "nang_luong": q["nang_luong"], "khung": q.get("khung")}
                             for q in cd["quyet_dinh"]]
    viec = []
    for q in list(cd["quyet_dinh"]) + ([cd["hook_qd"]] if isinstance(cd.get("hook_qd"), dict) else []):
        task = (q.get("giao_viec") or {}).get(buoc)
        if not task:
            continue
        row = {"qd": q.get("segment", "hook"), "y_do": q["y_do"], "ten": q.get("ten"), "nang_luong": q["nang_luong"],
               "source_id": q.get("source_id"), "nguon_tu": q.get("nguon_tu"), "nguon_den": q.get("nguon_den"),
               "neo": q.get("neo"), "tieu_diem": q.get("tieu_diem"), "khung": q.get("khung"), "nen": q.get("nen"),
               "viec": task, "ly_do": q.get("ly_do")}
        if q.get("anchor") == "hook":
            row["anchor"] = "hook"
        viec.append(row)
    v["viec_cua_ban"] = viec
    return v


def story_for(story, cd, buoc):
    """cau_chuyen cho buoc `buoc` = story + ban chi dao GON cua bo phan do. Khong co chi dao -> story y nguyen."""
    if not cd:
        return story
    return dict(story or {}, chi_dao=view_for(cd, buoc))


# ---------------------------------------------------------------------------
# LUAT noi vao system prompt cac buoc sau
# ---------------------------------------------------------------------------
LUAT_CHUNG = """

# 🎬 CHI DAO CUA DAO DIEN (cau_chuyen.chi_dao) — neu co, day la QUYET DINH SANG TAO CHUNG cua ca video
Dao dien da doc toan bo video va chot: chu de that, y tuong lon, the gioi hinh, mo tip, cuong do + ho_so_nhip, duong cong
cam xuc theo TUNG NHIP (nhip[] kem gio nguon "nguon" + nang_luong 1-5), khoanh khac dau an, khoang lang, the gioi am
thanh, danh sach cam — va BANG QUYET DINH theo tung doan. Ban la MOT BO PHAN cua ekip — thuc hien dung y dao dien:
- VIEC CUA BAN (chi_dao.viec_cua_ban): moi muc la LENH dao dien giao cho CHINH bo phan nay o mot doan (qd = so doan, hoac
  "hook" = ban sao hook o dau video): y_do, nang_luong, neo (tu + gio nguon src_start/src_end luc noi tu do), tieu_diem,
  nen, viec. BAT BUOC thuc hien MOI muc (dung y do, dung luc neo, dung muc nang luong) va ghi "qd": <so doan> | "hook" vao
  phan tu ban tao cho muc do — he thong DO lai: lenh nao khong co phan tu mang qd cua no se bi bao THIEU va yeu cau lam bu.
  Ngoai viec_cua_ban: chi them phan tu khi that su can (it ma dung), khong lan at viec cua bo phan khac.
- Moi lua chon phai THUOC VE y_tuong_lon + the_gioi_hinh + mo_tip (hinh, mau, chat lieu, chuyen dong, tieng). Lua chon
  ma dat sang video khac van y nguyen = chung chung -> thay bang lua chon bam chi tiet that cua video nay.
- Muc manh / nhe / mat do o moi thoi diem theo nang_luong cua DOAN (duong_nang_luong) / NHIP chua thoi diem do: 1-2 tiet
  che (it phan tu, chuyen dong cham, tieng nhe hoac lang), 3 ro rang, 4-5 du luc. Lam theo "tiet_che" cua nhip. Chuyen
  dong theo ho_so_nhip.chuyen_dong; ho_so_nhip.rung_loe = false -> KHONG rung khung / loe / glitch.
- 4 DINH LUAT: (1) moi phan tu lam ro / khuech dai / giu nhip — khong thi khong dat; (2) MOT tieu diem moi luc: chu lon /
  lop phu dang hien thi khong dat them thu tranh mat (nen video do he thong diu xuong theo "nen" cua quyet dinh);
  (3) khong qua ho_so_nhip.tai_toi_da phan tu chuyen dong MOI cung luc (ngoai phu de); (4) khong lap cung mot cach the
  hien / mot tieng o 2 diem nhan lien nhau.
- khoanh_khac_dau_an (src_start/src_end gio nguon): la diem nhan lon nhat cua phan ban phu trach — hien thuc hoa dung
  y_tuong cua dao dien, cho no du khong gian (khong chen phan tu khac lan at).
- khoang_lang (gio nguon): KHONG dat hieu ung / chu bat ra / SFX / meme trong khoang nay — de cau noi do tro.
- cam[]: tuyet doi khong dung. Chieu rap khuon (punch-in vao mat, dai sang cheo, 4 goc khung ngam, thanh tien trinh
  mong, light leak, tia lap lanh...) chi khi chinh chi_dao goi ten no la y tuong rieng — HOAC video mau (style_kit /
  phong_cach_mau / anh tham chieu) dang dung chieu do: phong cach video mau nguoi dung chon luon duoc tai hien.
- CO KHUNG (zoom tung doan) do CODE dung theo "khung" cua quyet dinh — dung tu ve zoom / punch-in de len no.
- Y NGHIA (luat cung): chi_dao.phan_tich la cach dao dien HIEU video (thong diep, mach y theo segment, tu khoa + y
  nghia). Moi phan tu ban dat (hinh, chu nhan, hieu ung, chuyen canh, tieng) phai lam ro / khuech dai DUNG Y dang noi luc
  do theo phan_tich, dan mat toi tu khoa cua cau, hoac giu nhip doan dai. Khong chi ra duoc y nao -> khong dat. MOT y
  chi the hien MOT lan (khong vua lop vong vua hieu ung vong cho cung mot tu; ban sao hook va doan goc la cung mot y).
- Yeu cau edit cua nguoi dung + luat cung cua he thong (luat hook, chu ro net, khong che mat, thu tu noi dung) van
  dung tren chi dao. Khong co cau_chuyen.chi_dao -> bo qua khoi nay."""

_BUOC = {
    "B3": "\n- Rieng buoc HOOK: chon doan hook danh dung chi_dao.hook.cam_xuc; ghi hook.attention theo chi_dao.hook "
          "(cach_mo, muc_do) — y tuong hinh / tieng cua hook la CACH MO dao dien da chot, khong mac dinh punch-in.",
    "R4": "\n- Rieng buoc THIET KE: viec_cua_ban -> lop / bo cuc / anh ghi \"qd\" (lop chu, hinh, anh, to hop: ghi tren TUNG "
          "lop cua to hop; scene doi bo cuc: ghi tren scene). Chu cua lenh dat src_start DUNG neo.src_start (luc noi tu "
          "neo). Lenh y do TRUOC_SAU -> lop \"compare\" (2 anh). CO style_kit (video mau) thi font / mau / he chu / cong "
          "thuc / kieu chu theo VIDEO MAU (ke ca anh tham chieu) — chi dao chi quyet y tuong, mo tip, nhip, dau an TRONG "
          "phong cach do. Khong co video mau: 'concept' + 'style' (mau, font, mood, image_style) RUT tu y_tuong_lon / "
          "the_gioi_hinh / mau_nhan / chu cua chi dao (font chon theo giong chu cua video NAY, khong mac dinh cap the thao "
          "nghieng + viet tay); mo_tip phai xuat hien thanh lop hinh / bo cuc o dung cac nhip dao dien noi; anh AI "
          "(image_style + prompt) thuoc the gioi hinh; mat do lop + bo cuc theo nang_luong tung doan; chuyen canh theo "
          "chuyen_canh_vao cua nhip (nhieu cho la cat thang — chuyen canh chi khi doi y / doi cam xuc); kieu vao chu DA "
          "DANG theo cam xuc (khong de mot kieu vao chiem phan lon video). Y tuong can nguoi noi nam TRONG mot o / khung / "
          "man hinh -> dung scene card / circle / split (A-roll trong khung) + lop vien / nhan quanh no; KHONG phu lop duc "
          "len A-roll. Lop 'ring' / 'line' / 'arrow' nham vao MOT TU trong lop chu: ghi \"target_text\" = dung tu / cum do "
          "(nguyen van nhu trong lop chu) — he thong do khung that cua chu va ve vua khit; khong khoanh tu phu, moi y mot lan.",
    "R5": "\n- Rieng buoc CHU: viec_cua_ban (neu co) -> caption hero ghi \"qd\", dung neo; chu nhan / hero bam neo.tu cua "
          "cac quyet dinh diem nhan + giong chu cua chi dao; doan nang_luong thap: it chu nhan, chu nho, vao em; khong chu "
          "nhan trong khoang_lang. KHONG viet hero trung mot lenh R4 da lam (lop_do_hoa_da_co).",
    "FX": "\n- Rieng buoc HIEU UNG: viec_cua_ban -> hieu ung o DUNG khoanh khac cua doan (qd n = khoanh khac \"m<n+1>\"; qd "
          "\"hook\" = khoanh khac \"h<n>\") ghi \"qd\", cham dung neo.src_start, cuong do theo nang_luong — lenh nang_luong "
          ">= 4 KHONG duoc dua vao bo_qua. Ngoai viec_cua_ban: uu tien hien thuc hoa khoanh_khac_dau_an + mo_tip (moi mo "
          "tip lap lai co bien doi); doan nang_luong 1-2 phan lon KHONG dat; khong hieu ung trong khoang_lang; moi hieu ung "
          "phai doc la va rieng cho video nay — mo ta ro no lay cam hung tu chi tiet nao cua video (vat, chat lieu, cu chi, "
          "loi noi). KHONG transform zoom / day khung o doan da co 'khung' can / day_cham (code dang zoom) — chon tac dong "
          "khac (nghieng, lac, mau, sang) hoac lop phu. Quyet dinh co \"nen\" lam_toi / lam_mo / giam_mau: he thong DA diu nen "
          "(nguoi noi giu net) — KHONG lam toi / nhoe / giam mau CA khung bang transform (nguoi toi theo). Mo tip / dau an nao DA duoc lop hinh cua buoc thiet ke ve "
          "(da_co.lop_hinh: mui ten, khoi, vong, anh...) thi KHONG ve lai cung thu do — chi bo sung phan lop tinh khong lam "
          "duoc (chuyen dong, bien doi, tac dong khung). Lop phu KHONG chua duoc video: khong ve nen DUC / giao dien phu kin "
          "che nguoi noi (y tuong 'nguoi noi nam trong o / khung' la viec cua BO CUC o buoc thiet ke — card / circle / split; "
          "hieu ung chi ve vien, chi tiet TRONG SUOT quanh do). He thong do: che mat > 0.3s, NET VE CHAY QUA MAT > 0.25s hoac "
          "phu duc > 45% khung > 0.4s -> hieu ung bi bo. Hieu ung cho BAN SAO HOOK chon khoanh khac 'h<n>' (bo cuc / chu / "
          "mat cua chinh ban sao hook). Vong / gach / mui ten nham vao MOT TU la viec cua lop R4 (do khung chu that) — FX "
          "khong ve lai thu do (he thong bo).",
    "B6": "\n- Rieng buoc MEME: viec_cua_ban (thuong y do PHAN_UNG_HAI) -> meme ghi \"qd\", dat dung neo; ngoai ra chi chen "
          "khi hop cam_xuc + nang_luong cua doan (cuong_do <= 2: gan nhu khong chen); khong chen trong khoang_lang hay de "
          "len khoanh khac dau an.",
    "B7": "\n- Rieng buoc SFX: viec_cua_ban -> SFX ghi \"qd\", src_time = neo.src_start (cu dam roi dung tu neo: tru "
          "peak_time), manh / nhe theo nang_luong; theo chi_dao.am_thanh (the gioi am thanh, mat_do_sfx, mo_tip_am, nhac); "
          "khoang_lang = KHONG SFX (im lang co chu dich); doan nang_luong thap dung tieng nhe / it; chon tieng hop the gioi "
          "am thanh (doc summary / use_when), tranh lap mot tieng o 2 diem nhan lien nhau.",
}


def luat(buoc):
    """Khoi luat dao dien noi vao system prompt cua buoc `buoc` (B3 | R4 | R5 | FX | B6 | B7)."""
    return LUAT_CHUNG + _BUOC.get(buoc, "")


# ---------------------------------------------------------------------------
# GIO TIMELINE cho khoang lang (build_spec)
# ---------------------------------------------------------------------------
def silent_windows(plan, map_range):
    """[(t0, t1)] gio TIMELINE cua cac khoang lang (than video; hook la ban sao rieng). map_range = RP.map_range."""
    cd = plan.get("chi_dao") if isinstance(plan.get("chi_dao"), dict) else {}
    out = []
    for k in cd.get("khoang_lang") or []:
        try:
            hit = map_range(plan, k.get("source_id"), float(k["src_start"]) - 0.1, float(k["src_end"]) + 0.25, "body")
        except Exception:
            hit = None
        if hit:
            out.append((float(hit[0]), float(hit[1])))
    return out


_CATALOG_OF = {"punch_zoom": ("zoom_punch",), "shake": ("shake",), "flash": ("flash",), "glitch": ("rgb_split",),
               "light_leak": ("light_leak",), "vignette": ("vignette", "focus"), "blur": ("blur_focus",)}


def banned_catalog(cd):
    """Loai hieu ung KHO dao dien da cam (danh sach cam + cum phu dinh trong cach mo hook: 'KHONG zoom dap vao mat')
    -> du phong cua luat hook khong chen lai dung thu do."""
    if not isinstance(cd, dict):
        return set()
    tags = set()
    for c in cd.get("cam") or []:
        t = _plain(c)
        tags.update(k for k, rx in _DEVICE_RE if re.search(rx, t))
    for m in _NEG_RE.finditer(_plain((cd.get("hook") or {}).get("cach_mo") if isinstance(cd.get("hook"), dict) else "")):
        tags.update(k for k, rx in _DEVICE_RE if re.search(rx, m.group(0)))
    return {typ for t in tags for typ in _CATALOG_OF.get(t, ())}


def music_stop(plan, map_range):
    """Gio TIMELINE dao dien muon TAT nhac nen (truoc / sau cau nhac_tat), hoac None."""
    cd = plan.get("chi_dao") if isinstance(plan.get("chi_dao"), dict) else {}
    nt = ((cd.get("am_thanh") or {}) if isinstance(cd.get("am_thanh"), dict) else {}).get("nhac_tat")
    if not isinstance(nt, dict):
        return None
    try:
        hit = map_range(plan, nt.get("source_id"), float(nt["src_start"]), float(nt["src_end"]), "body")
    except Exception:
        hit = None
    if not hit:
        return None
    return round(max(0.0, float(hit[0]) - 0.15), 3) if nt.get("khi") == "truoc" else round(float(hit[1]) + 0.3, 3)


MUSIC_CUT_FADE = 0.06       # "cat": dut ngang (chi chong tieng 'cup')
MUSIC_SOFT_FADE = 1.6       # "mo_dan": lang dan
MUSIC_RESUME_FADE = 0.8     # bat lai: vao lai em


def music_mutes(plan, map_range):
    """[(t_tat, t_bat_lai | None, fade_ra, fade_vao)] gio TIMELINE cua lenh tat nhac (giai doan 5: cat dut / lang dan +
    bat lai o cau dao dien chon). Khong co -> []."""
    cd = plan.get("chi_dao") if isinstance(plan.get("chi_dao"), dict) else {}
    nt = ((cd.get("am_thanh") or {}) if isinstance(cd.get("am_thanh"), dict) else {}).get("nhac_tat")
    t = music_stop(plan, map_range)
    if t is None or not isinstance(nt, dict):
        return []
    cat = nt.get("kieu") == "cat"
    t = round(t + (0.15 if cat and nt.get("khi") == "truoc" else 0.0), 3)     # cat dut: dung sat dau cau
    back = None
    bl = nt.get("bat_lai") if isinstance(nt.get("bat_lai"), dict) else None
    if bl:
        try:
            hit = map_range(plan, bl.get("source_id"), float(bl["src_start"]), float(bl["src_end"]), "body")
        except Exception:
            hit = None
        if hit:
            back = round(float(hit[0]) - 0.1 if bl.get("khi") == "truoc" else float(hit[1]) + 0.2, 3)
            if back <= t + 0.5:
                back = None
    return [(t, back, MUSIC_CUT_FADE if cat else MUSIC_SOFT_FADE, MUSIC_RESUME_FADE)]


def in_windows(t, windows):
    return any(a <= float(t) <= b for a, b in windows or [])


_MEME_SFX = ("vine", "rizz", "meme", "bruh", "anime", "troll", "sus", "among us", "fart", "cartoon", "boing", "huh",
             "wtf", "oh no", "sad violin", "cricket", "laugh", "cuoi", "hai huoc", "tiktok trend")


def library_sfx_ok(item, cd):
    """Tieng TRONG KHO (khong phai bo the gioi) co hop ban chi dao khong: tieng meme / hai (vine boom, rizz, bruh...) chi
    khi video duoc chi dao vui (the gioi vui_nhon, hoac cuong do >= 4 va co y do PHAN_UNG_HAI). Do that 2026-10-17: the
    gioi 'dien anh tiet che' van nhan tieng 'rizz' o hook (nhan impact, tag vine boom -> loc theo loai khong bat)."""
    if not isinstance(cd, dict) or not cd:
        return True
    blob = _plain(" ".join(str(item.get(k) or "") for k in ("id", "name", "use_when", "summary"))
                  + " " + " ".join(str(x) for x in item.get("tags") or []))
    if not any(k in blob for k in _MEME_SFX):
        return True
    world = (cd.get("am_thanh") or {}).get("the_gioi") if isinstance(cd.get("am_thanh"), dict) else None
    if world == "vui_nhon":
        return True
    hai = any(isinstance(q, dict) and q.get("y_do") == "PHAN_UNG_HAI" for q in cd.get("quyet_dinh") or [])
    return bool(hai and _int(cd.get("cuong_do"), 1, 5, 3) >= 4)


def sound_world(plan):
    cd = plan.get("chi_dao") if isinstance(plan.get("chi_dao"), dict) else {}
    w = (cd.get("am_thanh") or {}).get("the_gioi") if isinstance(cd.get("am_thanh"), dict) else None
    return w if w in SOUND_WORLDS else None


# ---------------------------------------------------------------------------
# BUOC DUYET
# ---------------------------------------------------------------------------
def _beat_of(cd, source_id, t):
    for i, b in enumerate(cd.get("nhip") or []):
        for r in b.get("nguon") or []:
            if r.get("source_id") == source_id and r["tu"] - 0.05 <= t <= r["den"] + 0.05:
                return i
    return None


def _layer_text(L):
    if L.get("spans"):
        return " ".join(str(sp.get("text") or "") for sp in L["spans"] if isinstance(sp, dict))[:80]
    return str(L.get("text") or L.get("label") or L.get("value") or "")[:80]


def review_view(cd, design, captions, fx_list, transitions, inserts, audio, segments, hook_info=None, overused_tags=None,
                deliv=None):
    """Ban dung theo nhip cho dao dien duyet + thong ke lap. Tra (payload, index) — index: id -> cach bo / doi.
    deliv (director_guard.deliveries): {qd: {bo_phan: True/False}} -> moi nhip kem quyet dinh + da_lam."""
    beats = [{"nhip": i, "vai_tro": b.get("vai_tro"), "nang_luong": b.get("nang_luong"), "cam_xuc": b.get("cam_xuc"),
              "timeline": [b.get("timeline_tu"), b.get("timeline_den")], "phan_tu": []}
             for i, b in enumerate(cd.get("nhip") or [])]
    for q in cd.get("quyet_dinh") or []:
        for bt, b in zip(beats, cd.get("nhip") or []):
            if b["tu_segment"] <= q["segment"] <= b["den_segment"] and q["y_do"] not in NHE_Y_DO:
                bt.setdefault("quyet_dinh", []).append({
                    "segment": q["segment"], "y_do": q["y_do"], "nang_luong": q["nang_luong"], "neo": q["neo"].get("tu"),
                    "giao_viec": q.get("giao_viec"), "da_lam": (deliv or {}).get(q["segment"])})
    khac = {"nhip": None, "phan_tu": []}
    index = {}

    def put(src, t, item):
        i = _beat_of(cd, src, t) if t is not None else None
        (beats[i]["phan_tu"] if i is not None and i < len(beats) else khac["phan_tu"]).append(item)

    groups = {}
    for L in (design or {}).get("layers") or []:
        if not isinstance(L, dict) or L.get("um") or L.get("user_media"):
            continue
        g = L.get("group")
        if g:
            groups.setdefault(g, []).append(L)
        else:
            lid = "layer:%s" % L.get("id")
            index[lid] = ("layer", [L.get("id")], L.get("anchor") == "hook")
            put(L.get("source_id"), _f(L.get("src_start"), None), {
                "id": lid, "loai": L.get("type"), "chu": _layer_text(L) or None,
                "kieu_vao": (L.get("enter") or {}).get("preset") if isinstance(L.get("enter"), dict) else None,
                "sfx": L.get("sfx"), "gio_nguon": L.get("src_start"), "hook": L.get("anchor") == "hook" or None,
                "kieu_chu": L.get("kieu_chu") or None, "qd": L.get("qd"),
                "y_nghia": str(L.get("why") or "")[:200] or None})
    for g, ls in groups.items():
        gid = "group:%s" % g
        index[gid] = ("layer", [L.get("id") for L in ls], any(L.get("anchor") == "hook" for L in ls))
        L0 = min(ls, key=lambda L: _f(L.get("src_start"), 9e9))
        put(L0.get("source_id"), _f(L0.get("src_start"), None), {
            "id": gid, "loai": "to_hop", "chu": " / ".join(filter(None, (_layer_text(L) for L in ls)))[:120] or None,
            "kieu_vao": sorted({(L.get("enter") or {}).get("preset") for L in ls if isinstance(L.get("enter"), dict)} - {None}),
            "gio_nguon": L0.get("src_start"), "hook": index[gid][2] or None,
            "kieu_chu": next((L.get("kieu_chu") for L in ls if L.get("kieu_chu")), None),
            "qd": next((L.get("qd") for L in ls if L.get("qd") is not None), None)})
    for n, c in enumerate((captions or {}).get("captions") or []):
        if not isinstance(c, dict) or str(c.get("role") or "") not in ("hero", "micro"):
            continue
        cid = "cap:%d" % n
        index[cid] = ("caption", [n], c.get("anchor") == "hook")
        put(c.get("source_id"), _f(c.get("src_start"), None), {"id": cid, "loai": "chu_nhan_%s" % c.get("role"),
                                                              "chu": str(c.get("text") or "")[:60], "gio_nguon": c.get("src_start"),
                                                              "hook": c.get("anchor") == "hook" or None, "qd": c.get("qd")})
    fx_tags = {}
    for e in fx_list or []:
        fid = "fx:%s" % e.get("id")
        tags = tag_text(_fx_text(e))
        for t in tags:
            fx_tags[t] = fx_tags.get(t, 0) + 1
        index[fid] = ("fx", [e.get("id")], e.get("anchor") == "hook")
        put(e.get("source_id"), _f(e.get("src_start"), None), {
            "id": fid, "loai": "hieu_ung_" + str(e.get("kind") or ""), "mo_ta": str(e.get("visual") or "")[:260],
            "muc_tieu": str(e.get("goal") or "")[:160], "y_nghia": str(e.get("y_nghia") or "")[:200] or None,
            "nhan_chieu": [DEVICE_LABEL.get(t, t) for t in tags] or None,
            "gio_nguon": e.get("src_start"), "hook": e.get("anchor") == "hook" or None,
            "theo_mau": e.get("theo_mau") or None, "qd": e.get("qd")})
    tr_cnt = {}
    for t in transitions or []:
        idx = t.get("segment_index") if isinstance(t, dict) else None
        if not isinstance(idx, int) or not (0 <= idx < len(segments or [])):
            continue
        typ = t.get("type")
        tr_cnt[typ] = tr_cnt.get(typ, 0) + 1
        tid = "tr:%d" % idx
        index[tid] = ("transition", [idx], False)
        s = segments[idx]
        put(s.get("source_id"), _f(s.get("start")), {"id": tid, "loai": "chuyen_canh", "kieu": typ})
    for n, m in enumerate((inserts or {}).get("inserts") or []):
        if not isinstance(m, dict):
            continue
        mid = "meme:%d" % n
        index[mid] = ("insert", [n], False)
        put(m.get("source_id"), _f(m.get("src_time"), None), {"id": mid, "loai": "meme", "meme": m.get("meme_id"),
                                                              "vi_sao": str(m.get("why") or "")[:160],
                                                              "gio_nguon": m.get("src_time"), "qd": m.get("qd")})
    sfx_cnt = {}
    for n, a in enumerate((audio or {}).get("audio") or []):
        if not isinstance(a, dict):
            continue
        k = a.get("sfx_id")
        sfx_cnt[k] = sfx_cnt.get(k, 0) + 1
        aid = "sfx:%d" % n
        index[aid] = ("audio", [n], a.get("anchor") == "hook")
        put(a.get("source_id"), _f(a.get("src_time"), None), {"id": aid, "loai": "sfx", "tieng": k,
                                                              "muc_dich": a.get("purpose"), "gio_nguon": a.get("src_time"),
                                                              "hook": a.get("anchor") == "hook" or None, "qd": a.get("qd")})
    enter_cnt = {}
    for L in (design or {}).get("layers") or []:
        p = (L.get("enter") or {}).get("preset") if isinstance(L.get("enter"), dict) else None
        if p:
            enter_cnt[p] = enter_cnt.get(p, 0) + 1
    payload = {
        "chi_dao": {k: cd.get(k) for k in ("y_tuong_lon", "the_gioi_hinh", "mo_tip", "cuong_do", "hook",
                                            "khoanh_khac_dau_an", "khoang_lang", "cam", "am_thanh", "ho_so_nhip")},
        "ban_dung": beats + ([khac] if khac["phan_tu"] else []),
        "thong_ke_lap": {"chieu_hieu_ung": {DEVICE_LABEL.get(k, k): c for k, c in fx_tags.items()},
                         "kieu_vao_chu": enter_cnt, "chuyen_canh": tr_cnt, "tieng": sfx_cnt},
        "chieu_lap_nhieu": [{"chieu": DEVICE_LABEL.get(k, k), "so_video": c} for k, c in (overused_tags or {}).items()],
        "danh_muc": {"kieu_vao": list(ENTER_PRESETS), "chuyen_canh": _transition_ids()},
    }
    if hook_info:
        payload["hook"] = {k: hook_info.get(k) for k in ("src_start", "src_end", "caption") if hook_info.get(k) is not None}
    # phan tu dang THUC HIEN quyet dinh manh (nang luong >= 4) -> buoc duyet khong duoc bo (do that 2026-10-17: duyet chi
    # biet bo, cao trao nang luong 5 con 0 phan tu)
    strong = {q["segment"] for q in cd.get("quyet_dinh") or [] if q.get("nang_luong", 0) >= 4 and q["y_do"] not in NHE_Y_DO}
    prot = {}
    for b in payload["ban_dung"]:
        for it in b["phan_tu"]:
            q = qd_index(it.get("qd"))
            if q in strong:
                prot.setdefault((q, str(it["id"]).split(":")[0]), []).append(it["id"])
    # {(qd, loai): [id]} — duyet duoc bo phan tu SAI cua quyet dinh manh (vd tieng meme lac bo) mien con >= 1 phan tu
    # cung loai thuc hien quyet dinh do (truoc: bao ve het -> giu ca tieng 'rizz' dao dien duyet muon bo)
    index["_bao_ve"] = prot
    # tieng CUOI CUNG cua quyet dinh manh ma duyet muon bo -> DOI sang tieng bo the gioi dung ho theo y do (khong giu tieng
    # sai, khong de quyet dinh mat tieng)
    import director_guard
    world = sound_world({"chi_dao": cd})
    yd = {q["segment"]: q["y_do"] for q in cd.get("quyet_dinh") or []}
    if world:
        index["_doi_tieng"] = {"sfx:%d" % n: "kw-%s-%s" % (world, director_guard.SFX_FAM.get(yd.get(qd_index(a.get("qd"))), "pop"))
                               for n, a in enumerate((audio or {}).get("audio") or []) if isinstance(a, dict)
                               and qd_index(a.get("qd")) in strong}
    return payload, index


def qd_index(v):
    """Gia tri "qd" cua phan tu -> so doan (int) | "hook" | None."""
    if v is None or v == "":
        return None
    if str(v).strip().lower() == "hook":
        return "hook"
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return None


def _transition_ids():
    try:
        import remotion_plan
        return [t["id"] for t in remotion_plan.load_catalog().get("transitions") or [] if isinstance(t, dict)]
    except Exception:
        return ["cut", "crossfade", "fade_black", "flash", "zoom_in", "zoom_out", "whip_left", "whip_right", "slide_up",
                "slide_left", "wipe", "iris", "glitch", "spin", "blur"]


def gpt_review(payload, log=None):
    if log:
        log("DD-duyet: %s dao dien duyet ban dung theo tung nhip..." % providers.plan_ai_name())
    text = providers.plan_chat([
        {"role": "system", "content": _p("_DIRECTOR_REVIEW_SYSTEM")},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ], json_mode=True, max_tokens=6000, temperature=0.4, req_timeout=240, max_attempts=2, step_label="DD-duyet")
    return providers._safe_json(text)


def apply_review(res, index, design, captions, fx_list, visual, inserts, audio):
    """Ap ket qua duyet (CHI bo / doi trong danh muc, khong dung hook / tu lieu, tran REVIEW_MAX_DROP moi loai).
    Sua tai cho; tra (fx_list moi, [ghi chu])."""
    notes = []
    if not isinstance(res, dict):
        return fx_list, notes
    prot = {k: list(v) for k, v in (index.get("_bao_ve") or {}).items()} if isinstance(index.get("_bao_ve"), dict) else {}
    swap = index.get("_doi_tieng") or {}
    index = {k: v for k, v in index.items() if not k.startswith("_")}
    totals = {}
    for kind, _ids, _hook in index.values():
        totals[kind] = totals.get(kind, 0) + 1
    caps = {k: max(1, int(totals[k] * REVIEW_MAX_DROP)) if totals[k] >= 3 else (1 if totals[k] == 2 else 0)
            for k in totals}
    drop = {"layer": set(), "caption": set(), "fx": set(), "insert": set(), "audio": set(), "transition": set()}
    used = {}
    for it in res.get("bo") or []:
        if not isinstance(it, dict):
            continue
        ref = index.get(str(it.get("id") or "").strip())
        if not ref:
            continue
        kind, ids, is_hook = ref
        if is_hook:
            notes.append("giữ %s (thuộc hook)" % it.get("id"))
            continue
        iid = str(it.get("id") or "").strip()
        grp = next((v for v in prot.values() if iid in v), None)
        if grp is not None:
            if len([x for x in grp if x != iid]) == 0:
                new = swap.get(iid)
                old = ((audio or {}).get("audio") or [])[ref[1][0]] if ref[0] == "audio" else None
                if new and isinstance(old, dict) and old.get("sfx_id") != new:
                    notes.append("đổi %s %s -> %s (tiếng cuối của quyết định mạnh: đổi đúng bộ thay vì bỏ) — %s" % (
                        iid, old.get("sfx_id"), new, _txt(it.get("ly_do"), 120)))
                    old["sfx_id"] = new
                else:
                    notes.append("giữ %s (phần tử cuối cùng thực hiện quyết định mạnh của đạo diễn)" % it.get("id"))
                continue
            grp.remove(iid)
        if used.get(kind, 0) >= caps.get(kind, 0):
            notes.append("giữ %s (đã bỏ đủ trần %d%% loại này)" % (it.get("id"), int(REVIEW_MAX_DROP * 100)))
            continue
        used[kind] = used.get(kind, 0) + 1
        drop[kind].update(ids)
        notes.append("bỏ %s — %s" % (it.get("id"), _txt(it.get("ly_do"), 160)))
    if drop["layer"]:
        design["layers"] = [L for L in design.get("layers") or [] if L.get("id") not in drop["layer"]]
    if drop["caption"]:
        captions["captions"] = [c for n, c in enumerate(captions.get("captions") or []) if n not in drop["caption"]]
    if drop["fx"]:
        fx_list = [e for e in fx_list or [] if e.get("id") not in drop["fx"]]
    if drop["insert"]:
        inserts["inserts"] = [m for n, m in enumerate(inserts.get("inserts") or []) if n not in drop["insert"]]
    if drop["audio"]:
        audio["audio"] = [a for n, a in enumerate(audio.get("audio") or []) if n not in drop["audio"]]
    trs = visual.get("transitions") or []
    if drop["transition"]:
        visual["transitions"] = trs = [t for t in trs if t.get("segment_index") not in drop["transition"]]
    # doi kieu vao chu
    by_id = {L.get("id"): L for L in design.get("layers") or []}
    for it in res.get("doi_kieu_vao") or []:
        if not isinstance(it, dict):
            continue
        ref = index.get(str(it.get("id") or "").strip())
        pre = str(it.get("preset") or "").strip()
        if not ref or ref[0] != "layer" or pre not in ENTER_PRESETS or ref[2]:
            continue
        hit = 0
        for lid in ref[1]:
            L = by_id.get(lid)
            if L is None or L.get("kieu_chu"):     # dang tai hien kieu chu video mau -> giu kieu vao cua mau
                continue
            if pre in ("letters_blur", "words_blur", "typewriter", "words_pop", "letters_drop", "words_rise",
                       "letters_fade", "write_on") and L.get("type") != "text":
                continue
            if pre == "draw" and L.get("type") not in ("ring", "line", "arrow", "circle"):
                continue
            en = dict(L.get("enter") or {}) if isinstance(L.get("enter"), dict) else {}
            if en.get("preset") == pre:
                continue
            en["preset"] = pre
            L["enter"] = en
            hit += 1
        if hit:
            notes.append("đổi kiểu vào %s -> %s — %s" % (it.get("id"), pre, _txt(it.get("ly_do"), 120)))
    # doi chuyen canh
    valid = set(_transition_ids())
    for it in res.get("doi_chuyen_canh") or []:
        if not isinstance(it, dict):
            continue
        ref = index.get(str(it.get("id") or "").strip())
        typ = str(it.get("type") or "").strip()
        if not ref or ref[0] != "transition" or (typ not in valid and typ != "cut"):
            continue
        idx = ref[1][0]
        if typ == "cut":
            visual["transitions"] = trs = [t for t in trs if t.get("segment_index") != idx]
        else:
            for t in trs:
                if t.get("segment_index") == idx:
                    t["type"] = typ
        notes.append("chuyển cảnh tr:%d -> %s — %s" % (idx, typ, _txt(it.get("ly_do"), 120)))
    for it in res.get("thieu") or []:
        if isinstance(it, dict) and _txt(it.get("viec")):
            notes.append("thiếu ở đoạn %s: %s" % (it.get("segment"), _txt(it.get("viec"), 160)))
    return fx_list, notes


# ---------------------------------------------------------------------------
# DANH MUC AM THANH cho "Tao video" (skill motionmaxxing, Electron motion/runner.ts — user 2026-10-15: video tao ra khong
# con cam). Truoc day prompt bao skill "skip sfx and music" vi khong co ElevenLabs. Nay dua 5 bo tieng the gioi (tong hop,
# khong ban quyen) + SFX trong kho (khong giong noi) + nhac nen da gan nhan, kem DUONG DAN TUYET DOI cho mix.py.
# ---------------------------------------------------------------------------
def sound_catalog():
    import engine
    import music_lib
    import sfx_kit
    try:
        sfx_kit.ensure_worlds()
    except Exception:
        pass
    lib = {e.get("id"): e for e in engine.sfx_list() if isinstance(e, dict)}
    worlds = {}
    for w, (name, _db) in sfx_kit.WORLDS.items():
        sounds = []
        for fam in sfx_kit.WORLD_FAMILIES:
            e = lib.get(sfx_kit.world_id(w, fam)) or {}
            if e.get("file") and os.path.isfile(e["file"]):
                sounds.append({"family": fam, "file": e["file"], "duration": e.get("duration"),
                               "peak_time": e.get("peak_time")})
        if sounds:
            worlds[w] = {"name": name, "character": SOUND_WORLDS.get(w, ""), "sounds": sounds}
    library = []
    for e in lib.values():
        sid = str(e.get("id") or "")
        if sid.startswith(("kit-", "kw-")) or e.get("has_speech") or not os.path.isfile(str(e.get("file") or "")):
            continue
        if not (e.get("summary") or e.get("use_when")):
            continue
        library.append({k: e.get(k) for k in ("id", "name", "file", "sound_type", "summary", "use_when", "avoid_when",
                                              "emotion", "intensity", "duration", "peak_time") if e.get(k) not in (None, "", [])})
    music = []
    try:
        for t in music_lib.usable():
            if t.get("has_vocals"):
                continue
            music.append({k: t.get(k) for k in ("id", "name", "file", "summary", "genre", "moods", "energy", "tempo",
                                                "use_when", "avoid_when", "duration") if t.get(k) not in (None, "", [])})
    except Exception:
        pass
    return {"sfx_worlds": worlds, "sfx_library": library, "music": music}
