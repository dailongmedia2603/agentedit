#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""NGON NGU CHU TREN VIDEO = NGON NGU LOI NOI cua video nguon (user 2026-10-15: "video nguon noi tieng gi thi chu
hien thi, chu anh AI, mau Kho Text, phu de phai theo ngon ngu do").

- Ngon ngu lay tu phan tich Gemini (`brief.language`, schema "vi|en|..."); thieu -> doan theo transcript.
- `story_view(brief)` ghi vao `cau_chuyen` (story) cho MOI buoc AI sau B1 — CHI khi KHAC tieng Viet. Giong
  canvas.story_view: video tieng Viet khong them gi vao prompt / khoa cache -> ket qua AI da luu van dung lai.
- `luat(story, buoc)` = luat NOI BANG CODE vao system prompt cac buoc viet chu (B3 hook, DD dao dien, R4 thiet ke,
  R5 phu de, TXT-lib kho text, text_art / graphic_art anh AI) — ke ca khi user da sua prompt cua buoc do (prompt goc
  van ghi "tieng Viet co dau": luat nay UU TIEN hon). Tieng Viet -> ''.
- Ghi chu / ly do cho NGUOI DUNG doc (why, ly_do, nhan xet...) van tieng Viet — chi chu HIEN TREN VIDEO doi ngon ngu.
"""
import re
import unicodedata

VI = "vi"

# ten hien thi (khong dau, nhu cac prompt khac) + ten goc cho AI nhan dien
_TEN = {
    "vi": ("TIENG VIET", "Tiếng Việt"), "en": ("TIENG ANH", "English"), "zh": ("TIENG TRUNG", "中文"),
    "ja": ("TIENG NHAT", "日本語"), "ko": ("TIENG HAN", "한국어"), "th": ("TIENG THAI", "ไทย"),
    "fr": ("TIENG PHAP", "Français"), "de": ("TIENG DUC", "Deutsch"), "es": ("TIENG TAY BAN NHA", "Español"),
    "pt": ("TIENG BO DAO NHA", "Português"), "it": ("TIENG Y", "Italiano"), "ru": ("TIENG NGA", "Русский"),
    "uk": ("TIENG UKRAINA", "Українська"), "id": ("TIENG INDONESIA", "Bahasa Indonesia"),
    "ms": ("TIENG MA LAI", "Bahasa Melayu"), "tl": ("TIENG PHILIPPINES", "Filipino"), "hi": ("TIENG HINDI", "हिन्दी"),
    "ar": ("TIENG A RAP", "العربية"), "tr": ("TIENG THO NHI KY", "Türkçe"), "nl": ("TIENG HA LAN", "Nederlands"),
    "pl": ("TIENG BA LAN", "Polski"), "sv": ("TIENG THUY DIEN", "Svenska"), "km": ("TIENG KHMER", "ខ្មែរ"),
    "lo": ("TIENG LAO", "ລາວ"), "my": ("TIENG MIEN DIEN", "မြန်မာ"),
}

# ten ngon ngu (da bo dau, thuong) -> ma — Gemini doi khi ghi ten thay vi ma
_TU_TEN = {
    "vietnamese": "vi", "tieng viet": "vi", "viet": "vi", "english": "en", "tieng anh": "en", "anh": "en",
    "chinese": "zh", "mandarin": "zh", "cantonese": "zh", "tieng trung": "zh", "japanese": "ja", "tieng nhat": "ja",
    "korean": "ko", "tieng han": "ko", "thai": "th", "tieng thai": "th", "french": "fr", "tieng phap": "fr",
    "german": "de", "tieng duc": "de", "spanish": "es", "tieng tay ban nha": "es", "portuguese": "pt",
    "italian": "it", "russian": "ru", "tieng nga": "ru", "ukrainian": "uk", "indonesian": "id", "malay": "ms",
    "filipino": "tl", "tagalog": "tl", "hindi": "hi", "arabic": "ar", "turkish": "tr", "dutch": "nl",
    "polish": "pl", "swedish": "sv", "khmer": "km", "lao": "lo", "burmese": "my",
}
_MA_KHAC = {"fil": "tl", "zh-hans": "zh", "zh-hant": "zh", "yue": "zh", "cmn": "zh", "in": "id", "iw": "he",
            "eng": "en", "vie": "vi", "jpn": "ja", "kor": "ko", "tha": "th", "fra": "fr", "deu": "de", "spa": "es"}

# Apple Vision (VNRecognizeTextRequest) — ngon ngu doc chu de KIEM chinh ta chu anh AI
_OCR = {
    "vi": ["vi-VT"], "en": ["en-US"], "fr": ["fr-FR"], "de": ["de-DE"], "es": ["es-ES"], "it": ["it-IT"],
    "pt": ["pt-BR"], "zh": ["zh-Hans", "zh-Hant"], "ja": ["ja-JP"], "ko": ["ko-KR"], "ru": ["ru-RU"],
    "uk": ["uk-UA"], "th": ["th-TH"], "ar": ["ar-SA"], "tr": ["tr-TR"], "id": ["id-ID"], "ms": ["ms-MY"],
    "nl": ["nl-NL"], "pl": ["pl-PL"], "sv": ["sv-SE"],
}


def _fold(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").replace("đ", "d").strip()


def ma(v):
    """'en' / 'en-US' / 'English' / 'tiếng Anh' / 'vi|en' -> ma 2 chu ('en'); khong nhan ra -> None."""
    s = _fold(v)
    if not s or s in ("mixed", "unknown", "khong ro", "none", "null"):
        return None
    s = re.split(r"[|,/;]", s)[0].strip()
    if s in _TU_TEN:
        return _TU_TEN[s]
    if s in _MA_KHAC:
        return _MA_KHAC[s]
    m = re.match(r"^([a-z]{2,3})(?:[-_][a-z0-9]+)*$", s)
    if m:
        c = m.group(1)
        return _MA_KHAC.get(c, c if len(c) == 2 else None)
    return None


_VI_CHARS = set("ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ")


def tu_chu(text):
    """Doan ngon ngu tu chinh chu (chi khi Gemini khong ghi): co chu cai rieng tieng Viet -> 'vi'; toan chu Latin
    khong dau -> 'en'; con lai -> None."""
    s = str(text or "").lower()
    letters = [c for c in s if c.isalpha()]
    if len(letters) < 20:
        return None
    if sum(1 for c in letters if c in _VI_CHARS) >= max(2, len(letters) * 0.01):
        return VI
    if all("a" <= c <= "z" for c in letters):
        return "en"
    return None


def cua_brief(brief):
    """Ngon ngu loi noi cua bo video nguon. Mac dinh 'vi' (nhu truoc)."""
    b = brief if isinstance(brief, dict) else {}
    c = ma(b.get("language"))
    if c:
        return c
    srcs = [s for s in b.get("sources") or [] if isinstance(s, dict)]
    for s in srcs:
        c = ma(s.get("language"))
        if c:
            return c
    text = " ".join(str(t.get("text") or "") for s in srcs for t in s.get("transcript") or [] if isinstance(t, dict))
    return tu_chu(text) or VI


def ten(code):
    """('TIENG ANH', 'English') — ma la -> ('NGON NGU "xx"', 'xx')."""
    return _TEN.get(code) or ('NGON NGU "%s"' % code, code)


def story_view(brief):
    """Ghi vao `cau_chuyen` (story["ngon_ngu"]) — chi khi KHAC tieng Viet (tieng Viet: story y nhu truoc)."""
    c = cua_brief(brief)
    if c == VI:
        return None
    vn, goc = ten(c)
    return {"ma": c, "ten": "%s (%s)" % (vn, goc)}


def cua_story(story):
    """Ma ngon ngu chu tren video theo story (khong co 'ngon_ngu' -> 'vi')."""
    st = story if isinstance(story, dict) else {}
    nn = st.get("ngon_ngu") if isinstance(st.get("ngon_ngu"), dict) else {}
    return ma(nn.get("ma")) or VI


def ocr_langs(code):
    """Ngon ngu cho Apple Vision. Ma khong ho tro -> en-US (chu Latin) — doc sai thi cum do ve lai bang chu code."""
    return _OCR.get(code or VI) or ["en-US"]


_CHUNG = """

# NGON NGU CHU TREN VIDEO: {ten} — UU TIEN HON moi cho o tren noi "tieng Viet"
Nguoi trong video NOI {vn}. MOI chu HIEN TREN VIDEO phai viet bang {vn} (dung chinh ta, dau, hoa / thuong cua {vn}),
lay dung tu ngu cua chinh loi noi trong transcript. TUYET DOI KHONG dich sang tieng Viet, khong tron hai thu tieng
trong cung mot cum. Cho nao o tren ghi "dung chinh ta tieng Viet co dau" / "chu tieng Viet" thi hieu la "dung chinh ta
{vn}". Vi du trong prompt (vd "MẤT 3 TỶ") chi minh hoa cach lam, khong phai ngon ngu can viet.
Ghi chu cho nguoi dung doc (why, ly_do, reason, nhan_xet, mo ta...) van viet tieng Viet co dau nhu cu."""

_BUOC = {
    "B3": "\n- Rieng buoc HOOK: \"caption\" cua hook viet bang {vn}, tom y dung cau hook nguoi do noi.",
    "DD": "\n- Rieng DAO DIEN: cac truong mo ta van tieng Viet, NHUNG moi cho TRICH loi noi (loi_noi, chu_nhan) chep "
          "NGUYEN VAN {vn} nhu transcript; chu / CTA ban de xuat hien tren video cung bang {vn}.",
    "R4": "\n- Rieng buoc THIET KE: moi lop chu (text, counter, badge label / value, chu nhan, CTA, chu trong bo cuc) "
          "viet bang {vn}; \"illustrates\" chep NGUYEN VAN cau noi {vn} tu transcript; \"prompt\" anh AI van TIENG ANH "
          "nhu quy dinh.",
    "R5": "\n- Rieng buoc CHU: PHU DE (support) bam sat tung tu nguoi noi bang {vn} (gio va chu chay theo giong — "
          "KHONG dich, KHONG doi tu), chi bo tu dem cua {vn} (vd tieng Anh: um, uh, like, you know); chu hero / micro / "
          "CTA cuoi video cung bang {vn}.",
    "TXT-lib": "\n- Rieng buoc KHO TEXT: chu dien vao o la CHINH chu cua cum ({vn}) — khong dich, khong dung chu mau "
               "tieng Viet; mau co font thieu ky tu {vn} se bi code loai.",
    "image": "\n- CHU TRONG ANH la {vn}: chep DUNG tung ky tu nhu danh sach (dau, hoa / thuong), khong dich, khong them "
             "dau tieng Viet, khong doi sang ngon ngu khac.",
}


def luat(story, buoc):
    """Khoi luat ngon ngu noi vao system prompt cua buoc `buoc` (B3 | DD | R4 | R5 | TXT-lib | image). Tieng Viet -> ''."""
    c = cua_story(story)
    if c == VI:
        return ""
    vn, goc = ten(c)
    full = "%s (%s)" % (vn, goc)
    return _CHUNG.format(ten=full, vn=vn) + _BUOC.get(buoc, "").format(vn=vn)
