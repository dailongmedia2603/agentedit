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

import prompt_store
import providers

DIRECTOR_VERSION = 3      # 2: tham my + danh gia hinh nguon; 3: uu tien video mau + anh tham chieu (2026-10-15)
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
                                          "chieu_da_dung", "font", "chuyen_canh") if v.get(k)})
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
        "_tags": tags,
    }


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
va Y TUONG cua ca video. Noi dung (cau nao giu, thu tu) DA CHOT o buoc truoc; ban KHONG doi noi dung. Viec cua ban:
quyet dinh video nay se DUOC KE nhu the nao bang hinh, chu, am thanh va nhip — de nguoi xem bi KEO VAO, NHO, va CAM
THAY mot dieu cu the. Ban chi dao cua ban la quyet dinh CHUNG ma moi bo phan sau (hook, thiet ke hinh, chu, hieu ung,
meme, am thanh) phai theo.

# DU LIEU DAU VAO
- video: tom tat Gemini (da XEM + NGHE video that), nguoi / boi canh / san pham / chu tren man hinh, giong noi.
- cau_chuyen: story_arc, tone, nhip_truyen, edit_request (muc dich, phong cach, khan gia, do dai) — yeu cau cua
  nguoi dung la uu tien so 1.
- timeline[]: TUNG doan da chot theo thu tu: segment_index, gio timeline, loi noi (cau + emphasis / punchline),
  cam xuc Gemini thay (kem bang chung: net mat, giong), khoanh khac (hook / climax / twist / silence... + mo ta).
- video_mau (neu co): phong cach video mau nguoi dung muon theo — giu TINH THAN + nhip cua no nhung ap vao NOI DUNG nay.
- thuong_hieu (neu co): font / mau bat buoc.
- so_tay_gan_day: cac video ban da chi dao gan day cho CUNG nguoi dung nay (y tuong, mo tip, chieu da dung).
  chieu_lap_nhieu: chieu da xuat hien o nhieu video gan day. Khan gia cua ho xem moi ngay -> lap lai = nham chan.
- the_gioi_am_thanh: cac bo tieng co san (id + mo ta).
- kha_nang_bo_dung: NHUNG GI BO DUNG LAM DUOC (font co san, bo cuc, loai lop, kieu vao chu, chuyen canh, hieu ung tu viet,
  anh AI, am thanh, nhac). Moi y tuong cua ban PHAI thuc hien duoc bang nhung thu nay: goi font bang id trong danh sach
  (khong ten font ngoai), khong doi diem cat / thu tu doan (da chot), khong tao nhac moi.

# CACH NGHI (lam theo thu tu, viet ket qua vao JSON)
1. CHU DE THAT: video nay THUC SU noi ve dieu gi (khong phai tom tat lai) — cai gi dang duoc dat cuoc voi nguoi xem?
   Nguoi xem nen roi video voi DIEU GI trong dau / trong long (dieu_dong_lai)?
2. Y TUONG LON: mot y tuong hinh-tieng CHI video nay moi co, moc tu CHI TIET THAT trong video (mot vat, mot cu chi,
   mot tu nguoi noi lap lai, chat lieu cua boi canh, nghe nghiep / san pham, mot an du trong loi noi). Thu: neu doi
   sang video khac cung linh vuc ma y tuong van dung nguyen -> y tuong qua chung, nghi lai.
3. THE GIOI HINH + MO TIP: chat lieu, anh sang, ket cau, logic mau rut tu chu de (vd video ve be boi -> nuoc, gon song,
   phan chieu; dich vu ke toan -> giay ke o, but chi, con dau). 1-2 MO TIP lap lai co chu dich (mot hinh / mot cach
   chuyen / mot am thanh) xuat hien o dau, cao trao va ket de video co "chu ky", va bien doi theo cau chuyen.
4. CUONG DO 1-5 cho ca video (1 tiet che cao cap / tam su sau -> 5 hyper reel / hai / bat trend), theo yeu cau edit +
   the loai + tone. Video can NIEM TIN (chuyen gia, y te, tai chinh, cam on, tam su) -> it trang tri; video giai tri /
   trend -> nhieu. Moi hieu ung phai phuc vu chu y, nhan manh hoac chuyen y.
5. DUONG CONG CAM XUC theo NHIP: chia timeline thanh cac nhip lien tiep (moi nhip = 1 hoac nhieu segment lien nhau,
   phu KIN tu segment dau toi cuoi). Moi nhip: vai_tro, cam_xuc nguoi xem can co, nang_luong 1-5, y tuong HINH cu the
   (bam loi noi cua nhip do), camera, chuyen canh vao nhip, am thanh, chu can nhan (trich tu loi noi), va TIET CHE gi.
   Duong cong phai co TUONG PHAN: cho day len, cho cao trao, cho LANG / nghi. Truoc cao trao nen co mot nhip nen /
   don. Khong de nang_luong deu tu dau den cuoi.
6. KHOANH KHAC DAU AN (2-4): nhung luc nguoi xem se nho — y tuong rieng cho dung cau noi do (trich nguyen van tu
   loi noi), noi ro hinh + tieng + chu se lam gi. Cao trao / tiet lo / cau chot / cu chi dat cua nguoi noi.
7. KHOANG LANG CO CHU DICH (0-3): cau nao nen de TRON, khong SFX / hieu ung / chu bat ra (truoc cu chot, sau cau
   xuc dong, luc nguoi noi nghen / suy nghi) — im lang cung la lua chon dao dien manh. Trich nguyen van cau do.
8. AM THANH: chon the_gioi (id) hop chu de + cam xuc; nhac nen (cam giac; bat dau sau hook); neu TAT nhac la mot quyet
   dinh cam xuc (vd de cau cam dong cuoi tro trui) -> nhac_tat = cau do (trich nguyen van) + "truoc" / "sau" cau; mat do
   SFX (thua / vua / day) theo cuong do; mo tip am (neu co).
9. HOOK: cam xuc can danh vao (to mo / soc / buon cuoi / dong cam...), CACH MO cu the cho video nay (khong mac dinh
   punch-in vao mat), muc_do nhe / vua / manh.
10. CAM: liet ke cu the nhung gi KHONG duoc dung trong video nay: chieu rap khuon (xem duoi), chieu da lap o
   so_tay_gan_day, va thu sai voi chu de / tone (vd video cam on thay co: khong glitch, khong rung).

# CO VIDEO MAU (video_mau) — NGUOI DUNG DA CHON PHONG CACH NAY
- video_mau.bo_phong_cach (font, mau, he chu, cong thuc lop, camera, chuyen canh, bo cuc) + anh tham chieu la PHONG CACH
  BAT BUOC: font / mau / kieu chu / cach edit cua video mau DUOC DUNG ca khi trung "chieu AI rap khuon" hay so tay
  (khong cam, khong doi sang font / mau / kieu chu khac). Ban chi dao Y TUONG, mo tip, duong cong cam xuc, dau an,
  khoang lang, nhip — SONG TRONG phong cach do (y tuong mac vao he chu + bo cuc + chieu cua video mau).
- "cam" chi ghi thu sai voi chu de / tone hoac lam hong phong cach video mau; khong cam thu video mau dang dung.
- the_gioi_hinh, mau_nhan, chu: mo ta THEO video mau (co the them chi tiet rieng cua noi dung, khong doi he).

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
               "nhac_tat": {"segment": 9, "loi_noi": "<trich nguyen van>", "khi": "truoc|sau"} hoac null,
               "mat_do_sfx": "thua|vua|day", "mo_tip_am": "<am thanh lap lai co chu dich hoac rong>"},
  "hook": {"cam_xuc": "...", "cach_mo": "<cu the cho video nay>", "muc_do": "nhe|vua|manh"},
  "nhip": [{"tu_segment": 0, "den_segment": 1, "vai_tro": "hook|mo|dan|day_len|cao_trao|lang|xoay|chot|cta",
            "cam_xuc": "<nguoi xem cam thay gi>", "nang_luong": 3,
            "hinh": "<y tuong hinh cu the bam loi noi cua nhip>", "camera": "<giu / day cham / doi khung...>",
            "chuyen_canh_vao": "<cat thang / cach chuyen + vi sao>", "am_thanh": "<tieng / nhac / lang>",
            "chu_nhan": ["<tu / cum trich tu loi noi>"], "tiet_che": "<khong lam gi o nhip nay>"}],
  "khoanh_khac_dau_an": [{"segment": 3, "loi_noi": "<trich nguyen van>", "y_tuong": "<hinh + tieng + chu>",
                          "vi_sao": "<vi sao day la luc dang nho>"}],
  "khoang_lang": [{"segment": 5, "loi_noi": "<trich nguyen van>", "vi_sao": "..."}],
  "cam": ["<dieu cu the khong duoc dung>"]
}
TRA VE CHI JSON."""


# ---------------------------------------------------------------------------
# PROMPT 2 — DUYET BAN DUNG
# ---------------------------------------------------------------------------
_DIRECTOR_REVIEW_SYSTEM = """Ban la DAO DIEN dang DUYET ban ke hoach dung cua chinh video ban da chi dao (chi_dao). Cac bo
phan da dat chu, hieu ung, chuyen canh, meme, SFX. Viec cua ban: xem TUNG NHIP, doi chieu voi chi dao va CAT / DOI nhung
gi lam video thanh "AI rap khuon", lam loang cam xuc, hoac sai chu de. It ma dung > nhieu ma deu.

# DU LIEU
- chi_dao: ban chi dao cua ban (y tuong lon, mo tip, cuong do, tung nhip + nang_luong, dau an, khoang lang, cam).
- ban_dung[]: theo tung nhip — moi phan tu co "id" de ban tham chieu:
  lop chu / do hoa ("layer:<id>" hoac "group:<id>" cho mot to hop), hieu ung tu viet ("fx:<id>" + mo ta + nhan chieu),
  chuyen canh ("tr:<segment_index>"), meme ("meme:<n>"), SFX ("sfx:<n>"), chu nhan R5 ("cap:<n>").
  "hook": true = thuoc ban sao hook o dau video (khong duoc bo).
- thong_ke_lap: so lan moi chieu / kieu vao chu / chuyen canh / tieng lap trong video NAY.
- chieu_lap_nhieu: chieu da dung o nhieu video gan day cua cung nguoi dung.
- danh_muc: kieu vao chu + chuyen canh hop le.

# XET (theo thu tu uu tien)
1. Phan tu nam trong KHOANG LANG cua chi dao -> bo (tru chu phu de).
2. Phan tu trai voi "cam" hoac voi tiet_che cua nhip -> bo.
3. Nhip nang_luong 1-2 ma day lop / hieu ung / tieng -> bo bot, giu thu dang gia nhat.
4. LAP: cung mot chieu / cung kieu vao / cung tieng / cung chuyen canh lap nhieu -> giu lan dat nhat, bo hoac DOI cac
   lan con lai (doi kieu vao chu, doi chuyen canh trong danh_muc) de video co bien hoa. Chieu trong chieu_lap_nhieu ma
   khong phai y tuong rieng cua video -> bo.
5. Phan tu chung chung, khong phuc vu y tuong lon / mo tip / cam xuc nhip -> bo.
6. KHOANH KHAC DAU AN phai con du luc: neu bi phan tu khac lan at -> bo phan tu lan at.
Khong bo de tro thanh video trong: moi nhip nang_luong >= 3 van can diem nhan. Khong them phan tu moi.
Phan tu co "kieu_chu" / "theo_mau" = dang TAI HIEN video mau nguoi dung chon -> KHONG coi la rap khuon, khong doi kieu vao
cua no (chi bo khi roi vao khoang lang hoac lan at dau an).

# SCHEMA (CHI JSON, tieng Viet co dau)
{
  "nhan_xet": "<2-4 cau: ban dung dang dung / lech chi dao o dau>",
  "diem": {"dung_chu_de": 7, "khac_biet": 6, "cam_xuc": 7},
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
    blob = _p("_DIRECTOR_SYSTEM") + "\n---\n" + _p("_DIRECTOR_REVIEW_SYSTEM")
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
    }


def gpt_direct(segments, transcript_data, emotion_map_data, key_moments_data, story=None, brief=None,
               reference_analysis=None, brand_view=None, user_media=None, memory=None, overused_tags=None,
               canvas_note=None, log=None):
    """DD-chi-dao: 1 luot AI -> ban chi dao (chua chuan hoa)."""
    payload = {
        "video": _video_view(brief),
        "cau_chuyen": story or {},
        "timeline": _timeline_rows(segments, transcript_data, emotion_map_data, key_moments_data),
        "tong_do_dai_giay": round(sum(_f(s.get("end")) - _f(s.get("start")) for s in segments or []), 1),
        "the_gioi_am_thanh": [{"id": k, "mo_ta": v} for k, v in SOUND_WORLDS.items()],
        "kha_nang_bo_dung": capabilities(),
    }
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
    if log:
        log("DD: %s dao dien doc toan bo noi dung + phan tich Gemini -> ban chi dao..." % providers.plan_ai_name())
    text = providers.plan_chat([
        {"role": "system", "content": _p("_DIRECTOR_SYSTEM") + (canvas_note or "") + (ref_pack.rule("DD") if ref_imgs else "")},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ], json_mode=True, max_tokens=8000, temperature=0.7, req_timeout=300, max_attempts=2, step_label="DD-chi-dao",
        images=ref_imgs or None)
    return providers._safe_json(text)


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


def normalize(raw, segments, transcript_data, story=None):
    """Ban chi dao AI -> ban CHUAN (nhip phu kin timeline, gio nguon + timeline cho moi nhip / dau an / khoang lang,
    cuong do / muc hook / the gioi am thanh hop le). raw hong -> None."""
    if not isinstance(raw, dict) or not segments:
        return None
    n = len(segments)
    rows = providers._ban_do_timeline(segments)
    cd = {k: _txt(raw.get(k), 600) for k in ("chu_de_that", "dieu_dong_lai", "y_tuong_lon", "the_gioi_hinh",
                                            "the_loai", "ly_do_cuong_do", "nhip_cat", "mau_nhan", "chu")}
    if not cd["y_tuong_lon"] and not cd["chu_de_that"]:
        return None
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
    nt = am.get("nhac_tat") if isinstance(am.get("nhac_tat"), dict) else None
    nhac_tat = None
    if nt:
        i = _int(nt.get("segment"), 0, n - 1, None)
        rng = _find_quote(nt.get("loi_noi"), segments[i], transcript_data) if i is not None else None
        if rng:
            nhac_tat = {"segment": i, "source_id": segments[i].get("source_id"), "src_start": rng[0], "src_end": rng[1],
                        "loi_noi": _txt(nt.get("loi_noi"), 200),
                        "khi": "truoc" if _plain(nt.get("khi")).strip() == "truoc" else "sau"}
    cd["am_thanh"] = {"the_gioi": world, "ly_do": (_txt(am.get("ly_do"), 300) + " " + world_note).strip(),
                      "nhac_tat": nhac_tat,
                      "nhac": _txt(am.get("nhac"), 300), "mo_tip_am": _txt(am.get("mo_tip_am"), 200),
                      "mat_do_sfx": mat_do if mat_do in ("thua", "vua", "day") else
                      ("thua" if cd["cuong_do"] <= 2 else "day" if cd["cuong_do"] >= 5 else "vua")}
    hk = raw.get("hook") if isinstance(raw.get("hook"), dict) else {}
    cd["hook"] = {"cam_xuc": _txt(hk.get("cam_xuc"), 200), "cach_mo": _txt(hk.get("cach_mo"), 400),
                  "muc_do": _level(hk.get("muc_do")) or LEVEL_OF_INTENSITY[cd["cuong_do"]]}
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
        out_beats.append({
            "tu_segment": a, "den_segment": z,
            "timeline_tu": rows[a]["timeline_tu"] if a < len(rows) else None,
            "timeline_den": rows[z]["timeline_den"] if z < len(rows) else None,
            "nguon": nguon,
            "vai_tro": role if role in ROLES else "dan",
            "cam_xuc": _txt(b.get("cam_xuc"), 200),
            "nang_luong": _int(b.get("nang_luong"), 1, 5, cd["cuong_do"]),
            "hinh": _txt(b.get("hinh"), 500), "camera": _txt(b.get("camera"), 200),
            "chuyen_canh_vao": _txt(b.get("chuyen_canh_vao"), 200), "am_thanh": _txt(b.get("am_thanh"), 200),
            "chu_nhan": [_txt(x, 60) for x in b.get("chu_nhan") or [] if _txt(x)][:4],
            "tiet_che": _txt(b.get("tiet_che"), 200),
        })
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

    cd["khoanh_khac_dau_an"] = _moments(raw.get("khoanh_khac_dau_an"), ("y_tuong", "vi_sao"))[:4]
    # khoang lang khong duoc trung khoanh khac dau an (dau an can tieng / hinh)
    lang = _moments(raw.get("khoang_lang"), ("vi_sao",))
    cd["khoang_lang"] = [x for x in lang if not any(
        x["source_id"] == d["source_id"] and providers._overlap(x["src_start"], x["src_end"], d["src_start"], d["src_end"])
        for d in cd["khoanh_khac_dau_an"])][:3]
    cd["_v"] = DIRECTOR_VERSION
    return cd


def story_view(cd):
    """Phan ban chi dao dua vao cau_chuyen (moi buoc sau nhan)."""
    if not cd:
        return None
    return {k: v for k, v in cd.items() if not k.startswith("_")}


# ---------------------------------------------------------------------------
# LUAT noi vao system prompt cac buoc sau
# ---------------------------------------------------------------------------
LUAT_CHUNG = """

# 🎬 CHI DAO CUA DAO DIEN (cau_chuyen.chi_dao) — neu co, day la QUYET DINH SANG TAO CHUNG cua ca video
Dao dien da doc toan bo video va chot: chu de that, y tuong lon, the gioi hinh, mo tip, cuong do, duong cong cam xuc
theo TUNG NHIP (nhip[] kem gio nguon "nguon" + nang_luong 1-5), khoanh khac dau an, khoang lang, the gioi am thanh,
danh sach cam. Ban la MOT BO PHAN cua ekip — thuc hien dung y dao dien, khong ve duong cong / phong cach khac:
- Moi lua chon phai THUOC VE y_tuong_lon + the_gioi_hinh + mo_tip (hinh, mau, chat lieu, chuyen dong, tieng). Lua chon
  ma dat sang video khac van y nguyen = chung chung -> thay bang lua chon bam chi tiet that cua video nay.
- Muc manh / nhe / mat do o moi thoi diem theo nang_luong cua NHIP chua thoi diem do: 1-2 tiet che (it phan tu, chuyen
  dong cham, tieng nhe hoac lang), 3 ro rang, 4-5 du luc. Lam theo "tiet_che" cua nhip.
- khoanh_khac_dau_an (src_start/src_end gio nguon): la diem nhan lon nhat cua phan ban phu trach — hien thuc hoa dung
  y_tuong cua dao dien, cho no du khong gian (khong chen phan tu khac lan at).
- khoang_lang (gio nguon): KHONG dat hieu ung / chu bat ra / SFX / meme trong khoang nay — de cau noi do tro.
- cam[]: tuyet doi khong dung. Chieu rap khuon (punch-in vao mat, dai sang cheo, 4 goc khung ngam, thanh tien trinh
  mong, light leak, tia lap lanh...) chi khi chinh chi_dao goi ten no la y tuong rieng — HOAC video mau (style_kit /
  phong_cach_mau / anh tham chieu) dang dung chieu do: phong cach video mau nguoi dung chon luon duoc tai hien.
- Yeu cau edit cua nguoi dung + luat cung cua he thong (luat hook, chu ro net, khong che mat, thu tu noi dung) van
  dung tren chi dao. Khong co cau_chuyen.chi_dao -> bo qua khoi nay."""

_BUOC = {
    "B3": "\n- Rieng buoc HOOK: chon doan hook danh dung chi_dao.hook.cam_xuc; ghi hook.attention theo chi_dao.hook "
          "(cach_mo, muc_do) — y tuong hinh / tieng cua hook la CACH MO dao dien da chot, khong mac dinh punch-in.",
    "R4": "\n- Rieng buoc THIET KE: CO style_kit (video mau) thi font / mau / he chu / cong thuc / kieu chu theo VIDEO MAU "
          "(ke ca anh tham chieu) — chi dao chi quyet y tuong, mo tip, nhip, dau an TRONG phong cach do. Khong co video "
          "mau: 'concept' + 'style' (mau, font, mood, image_style) RUT tu y_tuong_lon / the_gioi_hinh / "
          "mau_nhan / chu cua chi dao (font chon theo giong chu cua video NAY, khong mac dinh cap the thao nghieng + viet "
          "tay); mo_tip phai xuat hien thanh lop hinh / bo cuc o dung cac nhip dao dien noi; anh AI (image_style + prompt) "
          "thuoc the gioi hinh; mat do lop + bo cuc theo nang_luong tung nhip; chuyen canh theo chuyen_canh_vao cua nhip "
          "(nhieu cho la cat thang — chuyen canh chi khi doi y / doi cam xuc); kieu vao chu DA DANG theo cam xuc nhip "
          "(khong de mot kieu vao chiem phan lon video). Y tuong can nguoi noi nam TRONG mot o / khung / man hinh -> dung "
          "scene card / circle / split (A-roll trong khung) + lop vien / nhan quanh no; KHONG phu lop duc len A-roll.",
    "R5": "\n- Rieng buoc CHU: chu nhan / hero dung chu_nhan cua tung nhip (trich loi noi) + giong chu cua chi dao; nhip "
          "nang_luong thap: it chu nhan, chu nho, vao em; khong chu nhan trong khoang_lang.",
    "FX": "\n- Rieng buoc HIEU UNG: uu tien hieu ung hien thuc hoa khoanh_khac_dau_an + mo_tip (moi mo tip lap lai co bien "
          "doi); nhip nang_luong 1-2 phan lon KHONG dat; khong hieu ung trong khoang_lang; moi hieu ung phai doc la va "
          "rieng cho video nay — mo ta ro no lay cam hung tu chi tiet nao cua video (vat, chat lieu, cu chi, loi noi). "
          "Mo tip / dau an nao DA duoc lop hinh cua buoc thiet ke ve (da_co.lop_hinh: mui ten, khoi, vong, anh...) thi KHONG "
          "ve lai cung thu do — chi bo sung phan lop tinh khong lam duoc (chuyen dong, bien doi, tac dong khung). "
          "Lop phu KHONG chua duoc video: khong ve nen DUC / giao dien phu kin che nguoi noi (y tuong 'nguoi noi nam trong "
          "o / khung' la viec cua BO CUC o buoc thiet ke — card / circle / split; hieu ung chi ve vien, chi tiet TRONG SUOT "
          "quanh do). He thong do: che mat > 0.3s hoac phu duc > 45% khung > 0.4s -> hieu ung bi bo.",
    "B6": "\n- Rieng buoc MEME: chi chen khi hop cam_xuc + nang_luong cua nhip (cuong_do <= 2: gan nhu khong chen); khong "
          "chen trong khoang_lang hay de len khoanh khac dau an.",
    "B7": "\n- Rieng buoc SFX: theo chi_dao.am_thanh (the gioi am thanh, mat_do_sfx, mo_tip_am, nhac) + am_thanh cua tung "
          "nhip; khoang_lang = KHONG SFX (im lang co chu dich); nhip nang_luong thap dung tieng nhe / it; chon tieng hop "
          "the gioi am thanh (doc summary / use_when), tranh lap mot tieng.",
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


def in_windows(t, windows):
    return any(a <= float(t) <= b for a, b in windows or [])


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


def review_view(cd, design, captions, fx_list, transitions, inserts, audio, segments, hook_info=None, overused_tags=None):
    """Ban dung theo nhip cho dao dien duyet + thong ke lap. Tra (payload, index) — index: id -> cach bo / doi."""
    beats = [{"nhip": i, "vai_tro": b.get("vai_tro"), "nang_luong": b.get("nang_luong"), "cam_xuc": b.get("cam_xuc"),
              "timeline": [b.get("timeline_tu"), b.get("timeline_den")], "phan_tu": []}
             for i, b in enumerate(cd.get("nhip") or [])]
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
                "kieu_chu": L.get("kieu_chu") or None})
    for g, ls in groups.items():
        gid = "group:%s" % g
        index[gid] = ("layer", [L.get("id") for L in ls], any(L.get("anchor") == "hook" for L in ls))
        L0 = min(ls, key=lambda L: _f(L.get("src_start"), 9e9))
        put(L0.get("source_id"), _f(L0.get("src_start"), None), {
            "id": gid, "loai": "to_hop", "chu": " / ".join(filter(None, (_layer_text(L) for L in ls)))[:120] or None,
            "kieu_vao": sorted({(L.get("enter") or {}).get("preset") for L in ls if isinstance(L.get("enter"), dict)} - {None}),
            "gio_nguon": L0.get("src_start"), "hook": index[gid][2] or None,
            "kieu_chu": next((L.get("kieu_chu") for L in ls if L.get("kieu_chu")), None)})
    for n, c in enumerate((captions or {}).get("captions") or []):
        if not isinstance(c, dict) or str(c.get("role") or "") not in ("hero", "micro"):
            continue
        cid = "cap:%d" % n
        index[cid] = ("caption", [n], c.get("anchor") == "hook")
        put(c.get("source_id"), _f(c.get("src_start"), None), {"id": cid, "loai": "chu_nhan_%s" % c.get("role"),
                                                              "chu": str(c.get("text") or "")[:60], "gio_nguon": c.get("src_start"),
                                                              "hook": c.get("anchor") == "hook" or None})
    fx_tags = {}
    for e in fx_list or []:
        fid = "fx:%s" % e.get("id")
        tags = tag_text(_fx_text(e))
        for t in tags:
            fx_tags[t] = fx_tags.get(t, 0) + 1
        index[fid] = ("fx", [e.get("id")], e.get("anchor") == "hook")
        put(e.get("source_id"), _f(e.get("src_start"), None), {
            "id": fid, "loai": "hieu_ung_" + str(e.get("kind") or ""), "mo_ta": str(e.get("visual") or "")[:260],
            "muc_tieu": str(e.get("goal") or "")[:160], "nhan_chieu": [DEVICE_LABEL.get(t, t) for t in tags] or None,
            "gio_nguon": e.get("src_start"), "hook": e.get("anchor") == "hook" or None,
            "theo_mau": e.get("theo_mau") or None})
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
                                                              "gio_nguon": m.get("src_time")})
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
                                                              "hook": a.get("anchor") == "hook" or None})
    enter_cnt = {}
    for L in (design or {}).get("layers") or []:
        p = (L.get("enter") or {}).get("preset") if isinstance(L.get("enter"), dict) else None
        if p:
            enter_cnt[p] = enter_cnt.get(p, 0) + 1
    payload = {
        "chi_dao": {k: cd.get(k) for k in ("y_tuong_lon", "the_gioi_hinh", "mo_tip", "cuong_do", "hook",
                                            "khoanh_khac_dau_an", "khoang_lang", "cam", "am_thanh")},
        "ban_dung": beats + ([khac] if khac["phan_tu"] else []),
        "thong_ke_lap": {"chieu_hieu_ung": {DEVICE_LABEL.get(k, k): c for k, c in fx_tags.items()},
                         "kieu_vao_chu": enter_cnt, "chuyen_canh": tr_cnt, "tieng": sfx_cnt},
        "chieu_lap_nhieu": [{"chieu": DEVICE_LABEL.get(k, k), "so_video": c} for k, c in (overused_tags or {}).items()],
        "danh_muc": {"kieu_vao": list(ENTER_PRESETS), "chuyen_canh": _transition_ids()},
    }
    if hook_info:
        payload["hook"] = {k: hook_info.get(k) for k in ("src_start", "src_end", "caption") if hook_info.get(k) is not None}
    return payload, index


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
