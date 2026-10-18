#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BO TIENG MOTION GRAPHICS tu tong hop (whoosh, swoosh, pop, click, boom, riser, ding, go phim).

Kho SFX nguoi dung chu yeu la tieng meme (Myinstants) — thieu nhom tieng "dau cham cau" cho
chu va do hoa bay vao, thu editor dung dac dac trong video nhu mau1.mp4. Tong hop bang numpy
(khong ban quyen, khong can mang), ghi WAV vao ~/.capcut-studio/sfx/ va dang ky vao
sfx_library.json voi id co dinh "kit-*" -> dung duoc o CA hai luong (B7 chon, lop do hoa goi).
"""
import os
import wave
import zlib
import numpy as np

import engine

SR = 44100
KIT = {
    "kit-whoosh": ("Whoosh (luot qua)", "neutral", "Chu / hinh / anh BAY VAO khung, doi bo cuc, chuyen canh nhanh", ["whoosh", "transition"]),
    "kit-swoosh": ("Swoosh ngan", "neutral", "Chu truot vao nhanh, lat the, doi y nho", ["swoosh", "transition"]),
    "kit-pop": ("Pop bat ra", "positive", "Icon / huy hieu / sticker / chu nho BAT RA", ["pop", "ui"]),
    "kit-click": ("Click", "neutral", "Bam nut, danh dau, hien tung muc danh sach, con tro", ["click", "ui"]),
    "kit-boom": ("Boom tram (impact)", "punch", "Chu nhan LON dap vao, cau chot, con so soc", ["boom", "impact", "punch"]),
    "kit-riser": ("Riser (don toi)", "neutral", "Don cang truoc khi tiet lo / truoc chu nhan / truoc hook", ["riser", "build"]),
    "kit-ding": ("Ding sang", "positive", "Tiet lo con so / dap an dung / diem tich cuc", ["ding", "reveal"]),
    "kit-typing": ("Go phim", "neutral", "Chu hien kieu go phim / the prompt sang dan", ["typing", "ui"]),
}


def _env(n, attack, release, peak=0.5):
    t = np.linspace(0, 1, n)
    up = np.clip(t / max(1e-4, attack), 0, 1)
    down = np.clip((1 - t) / max(1e-4, release), 0, 1)
    e = np.minimum(up, down)
    return e ** 1.5


def _bandpass_sweep(x, f0, f1, q=1.2):
    """Loc bang thong co tan so trung tam truot f0 -> f1 (biquad tung mau)."""
    n = len(x)
    y = np.zeros(n)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(n):
        f = f0 * (f1 / f0) ** (i / n)
        w = 2 * np.pi * f / SR
        alpha = np.sin(w) / (2 * q)
        b0, b2 = alpha, -alpha
        a0, a1, a2 = 1 + alpha, -2 * np.cos(w), 1 - alpha
        yi = (b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2) / a0
        x2, x1 = x1, x[i]
        y2, y1 = y1, yi
        y[i] = yi
    return y


def _norm(x, peak=0.89):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak


def synth(kind, seed=7):
    rng = np.random.default_rng(seed)
    if kind == "kit-whoosh":
        n = int(SR * 0.5)
        x = _bandpass_sweep(rng.standard_normal(n), 350, 3200, 1.0) * _env(n, 0.62, 0.38)
    elif kind == "kit-swoosh":
        n = int(SR * 0.28)
        x = _bandpass_sweep(rng.standard_normal(n), 1200, 7000, 1.4) * _env(n, 0.45, 0.55)
    elif kind == "kit-pop":
        n = int(SR * 0.13)
        t = np.arange(n) / SR
        f = 1150 * np.exp(-t / 0.035) + 260
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.04)
        x[:120] += rng.standard_normal(120) * 0.25
    elif kind == "kit-click":
        n = int(SR * 0.05)
        t = np.arange(n) / SR
        x = rng.standard_normal(n) * np.exp(-t / 0.004) * 0.6 + np.sin(2 * np.pi * 3100 * t) * np.exp(-t / 0.008)
    elif kind == "kit-boom":
        n = int(SR * 1.1)
        t = np.arange(n) / SR
        f = 38 + 30 * np.exp(-t / 0.08)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.45)
        hit = _bandpass_sweep(rng.standard_normal(n), 900, 120, 0.8) * np.exp(-t / 0.06) * 0.8
        x = np.tanh((body + hit) * 2.2)
    elif kind == "kit-riser":
        n = int(SR * 0.9)
        t = np.arange(n) / SR
        noise = _bandpass_sweep(rng.standard_normal(n), 300, 6000, 1.1)
        tone = np.sin(2 * np.pi * np.cumsum(220 * (6 ** (t / t[-1]))) / SR) * 0.35
        x = (noise + tone) * (t / t[-1]) ** 2.2
        x[-400:] *= np.linspace(1, 0, 400)
    elif kind == "kit-ding":
        n = int(SR * 0.9)
        t = np.arange(n) / SR
        x = (np.sin(2 * np.pi * 1568 * t) + 0.45 * np.sin(2 * np.pi * 3136 * t) + 0.2 * np.sin(2 * np.pi * 2350 * t)) * np.exp(-t / 0.28)
        x[:60] *= np.linspace(0, 1, 60)
    elif kind == "kit-typing":
        n = int(SR * 0.7)
        x = np.zeros(n)
        pos = 0
        while pos < n - 3000:
            m = int(SR * 0.03)
            tt = np.arange(m) / SR
            clk = rng.standard_normal(m) * np.exp(-tt / 0.003) + 0.4 * np.sin(2 * np.pi * rng.uniform(1800, 3200) * tt) * np.exp(-tt / 0.006)
            x[pos:pos + m] += clk * rng.uniform(0.5, 1.0)
            pos += int(SR * rng.uniform(0.06, 0.11))
    else:
        raise ValueError(kind)
    return _norm(x)


def _write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def ensure_kit():
    """Tao (neu thieu) + dang ky bo tieng vao kho SFX. Tra danh sach id co san."""
    os.makedirs(engine.SFX_DIR, exist_ok=True)
    lib = engine._load_lib()
    items = lib.get("sfx", [])
    have = {e.get("id") for e in items}
    changed = False
    for sid, (name, emo, use_when, tags) in KIT.items():
        path = os.path.join(engine.SFX_DIR, sid + ".wav")
        if not os.path.isfile(path):
            _write_wav(path, synth(sid))
        if sid not in have:
            items.append({"id": sid, "name": name, "file": path, "source": "tong_hop",
                          "emotion": emo, "use_when": use_when, "tags": tags})
            changed = True
    if changed:
        lib["sfx"] = items
        engine._save_lib(lib)
    return list(KIT)


# ho tieng (goi y "sfx" cua lop do hoa) -> id trong kho
FAMILY = {"whoosh": "kit-whoosh", "swoosh": "kit-swoosh", "pop": "kit-pop", "click": "kit-click",
          "boom": "kit-boom", "impact": "kit-boom", "punch": "kit-boom", "riser": "kit-riser",
          "ding": "kit-ding", "typing": "kit-typing"}


# ---------------------------------------------------------------------------
# THE GIOI AM THANH (user 2026-10-15) — 5 bo tieng co CHAT RIENG cho luong Tao video (`sound_catalog` -> motion/sound.ts:
# AI chon 1 bo cho ca video). Luong Edit Video khong dung (dao dien da go 2026-10-18 -> dung kit-* + kho nhu truoc).
# Id "kw-<the_gioi>-<ho>", WAV 44.1k mono, tong hop bang numpy (khong ban quyen, khong can mang).
# ---------------------------------------------------------------------------
WORLDS = {
    "am_ap": ("Ấm áp", -1.5),          # (ten, chinh muc to so voi bo chuan, dB — mix_sfx cong vao muc theo giong noi)
    "cong_nghe": ("Công nghệ", 0.0),
    "dien_anh": ("Điện ảnh", 0.5),
    "vui_nhon": ("Vui nhộn", 0.0),
    "toi_gian": ("Tối giản", -4.0),
}
WORLD_CHARACTER = {     # mo ta chat tung bo (dua AI cua Tao video chon)
    "am_ap": "Ấm, mộc, mềm: tiếng gỗ, tiếng bong bóng tròn, chuông marimba — kể chuyện, gia đình, chữa lành, cảm ơn.",
    "cong_nghe": "Sạch, sáng, kính / kỹ thuật số: blip, click giao diện, chuông thuỷ tinh, quét điện tử — công nghệ, "
                 "SaaS, dịch vụ số, số liệu.",
    "dien_anh": "Dày, sâu, có không gian: impact trầm có đuôi vang, whoosh nặng, riser dài, chuông trầm — kịch tính, "
                "truyền cảm hứng, tiết lộ lớn, sang trọng.",
    "vui_nhon": "Nảy, hoạt hình: bloop, tiếng gõ đồ chơi, xylophone, bonk lò xo, còi trượt — hài, trẻ em, bắt trend.",
    "toi_gian": "Rất khẽ, tinh: tick nhỏ, chạm nhẹ, hơi gió — chuyên gia, tài chính, y tế, cao cấp, tâm sự sâu.",
}
WORLD_FAMILIES = ("whoosh", "swoosh", "pop", "click", "boom", "riser", "ding", "typing")
WORLD_VERSION = 4       # 4: toi_gian pop / click day hon; 2: mo go am_ap (Gemini nghe ban 1 thanh 'click chuot'); 3: summary = Gemini nghe that
_FAM_INFO = {   # ten tieng Viet + tag (sfx_family cua plan_guard doc tag de can muc to: whoosh / ui / impact / riser)
    "whoosh": ("Whoosh lướt", ["whoosh", "transition"], "Chữ / hình / ảnh bay vào, đổi bố cục, chuyển cảnh"),
    "swoosh": ("Swoosh ngắn", ["swoosh", "transition"], "Chữ trượt vào nhanh, lật thẻ, đổi ý nhỏ"),
    "pop": ("Pop bật ra", ["pop", "ui"], "Icon / huy hiệu / chữ nhỏ bật ra"),
    "click": ("Click", ["click", "ui"], "Bấm, đánh dấu, hiện từng mục"),
    "boom": ("Impact", ["boom", "impact"], "Chữ nhấn lớn đập vào, câu chốt, con số"),
    "riser": ("Riser dồn", ["riser", "build"], "Dồn căng trước tiết lộ / cao trào"),
    "ding": ("Chuông sáng", ["ding", "bell"], "Tiết lộ con số / đáp án / điểm tích cực"),
    "typing": ("Gõ chữ", ["typing", "type"], "Chữ hiện kiểu gõ / sáng dần"),
}
# Gemini NGHE that tung tieng (2026-10-15, agy gemini-3.8-flash-high) -> summary trong kho (B7 chon theo nhan nay)
HEARD = {
    "kw-am_ap-whoosh": "Tiếng gió rít whoosh trầm ấm lướt qua mượt mà, có độ vang êm.",
    "kw-am_ap-swoosh": "Tiếng vút gió swoosh ngắn, nhanh và dứt khoát.",
    "kw-am_ap-pop": "Tiếng bốp nổ bong bóng rất nhẹ, thanh thoát và êm tai.",
    "kw-am_ap-boom": "Tiếng dội sub-bass trầm sâu, đục và ngân vang đầy sức nặng.",
    "kw-am_ap-riser": "Tiếng chuông ngân synth nhẹ nhàng vuốt dần lên cao tạo cảm giác ấm áp và kỳ vọng",
    "kw-am_ap-ding": "Tiếng gõ nốt chuông mộc trong trẻo, ngân vang ngắn êm tai",
    "kw-am_ap-typing": "Chuỗi âm thanh gõ bàn phím cơ êm tai, dồn dập nhẹ nhàng",
    "kw-cong_nghe-whoosh": "Tiếng whoosh vút gió mang âm sắc điện tử công nghệ, dứt khoát",
    "kw-cong_nghe-swoosh": "Tiếng vút gió điện tử cực ngắn, sắc gọn như thao tác vuốt chuyển nhanh trên màn hình",
    "kw-cong_nghe-pop": "Tiếng bong bóng nổ bụp nhẹ, tròn âm, giòn giã và dứt khoát.",
    "kw-cong_nghe-click": "Tiếng click chuột máy tính siêu ngắn, đanh gọn và dứt khoát.",
    "kw-cong_nghe-boom": "Tiếng nổ bass trầm uy lực, rền vang và có độ ngân sâu đậm chất điện ảnh.",
    "kw-cong_nghe-riser": "Tiếng synth riser điện tử quét tần số tăng dần, tạo cảm giác hồi hộp và dồn nén trước cao trào.",
    "kw-cong_nghe-ding": "Tiếng chuông ding kim loại trong trẻo, ngân vang sáng sủa và rõ nét.",
    "kw-cong_nghe-typing": "Tiếng gõ phím máy tính cơ lách cách liên tục và dứt nhanh",
    "kw-dien_anh-whoosh": "Tiếng gió vút điện ảnh trầm sâu kéo dài và có đuôi vang",
    "kw-dien_anh-swoosh": "Tiếng vụt gió nhanh, sắc nét và dứt khoát",
    "kw-dien_anh-pop": "Tiếng pop bật nảy ngắn, đanh gọn như tiếng búng hoặc bong bóng nổ",
    "kw-dien_anh-click": "Tiếng click cơ khí gọn gàng, sắc sảo như bật công tắc hoặc chụp ảnh",
    "kw-dien_anh-boom": "Tiếng boom trầm điện ảnh dội mạnh uy lực và ngân rền kéo dài.",
    "kw-dien_anh-riser": "Âm thanh riser điện ảnh dồn dập tăng dần cao độ và độ căng thẳng rồi ngắt đột ngột ở đỉnh điểm.",
    "kw-dien_anh-ding": "Tiếng chuông ding kim loại ngân vang trong trẻo, sáng rõ và kéo dài.",
    "kw-dien_anh-typing": "Tiếng gõ bàn phím cơ lách cách liên tục, giòn giã và dồn dập trong thời gian ngắn.",
    "kw-vui_nhon-whoosh": "Tiếng vút gió nhanh với âm sắc trượt hoạt hình vui nhộn và dí dỏm.",
    "kw-vui_nhon-swoosh": "Tiếng gió rít vút qua cực nhanh và dứt khoát",
    "kw-vui_nhon-pop": "Tiếng bật 'pop' như bong bóng nổ nhẹ nhàng, vui tai",
    "kw-vui_nhon-click": "Tiếng click chuột cơ học cực ngắn, đanh gọn",
    "kw-vui_nhon-boom": "Tiếng nổ 'bùm' âm trầm phong cách hoạt hình đập mạnh dứt khoát",
    "kw-vui_nhon-riser": "Tiếng còi trượt kéo tông vút lên cao kiểu hoạt hình hài hước",
    "kw-vui_nhon-ding": "Tiếng chuông ting kim loại cao, trong trẻo và ngân vang ngắn",
    "kw-vui_nhon-typing": "Tiếng gõ phím cơ lách cách liên tục, nhanh và dồn dập",
    "kw-toi_gian-whoosh": "Tiếng gió vút whoosh lướt qua nhanh, êm ái và sạch gọn",
    "kw-toi_gian-swoosh": "Tiếng xoẹt gió swoosh cực ngắn, thanh thoát và dứt khoát",
    "kw-toi_gian-pop": "Tiếng pop nảy bong bóng cực ngắn, giòn và nhỏ nhẹ",
    "kw-toi_gian-click": "Tiếng click chuột hoặc công tắc cơ học cực ngắn, đanh gọn và dứt khoát",
    "kw-toi_gian-boom": "Tiếng bass boom trầm gọn gàng, dứt khoát tạo độ rung nhẹ hiện đại",
    "kw-toi_gian-riser": "Tiếng âm thanh điện tử quét dồn dần lên cao tạo cảm giác hồi hộp chờ đợi",
    "kw-toi_gian-ding": "Tiếng chuông ding điện tử trong trẻo, tươi sáng và ngân vang nhẹ",
    "kw-toi_gian-typing": "Tiếng gõ phím cơ lách cách liên hồi ngắn gọn và rõ ràng",
}
HEARD["kw-am_ap-click"] = "Tiếng click bấm nút trầm ấm, gọn gàng và dứt khoát như tiếng công tắc êm (mõ gỗ mềm)."


def world_id(world, fam):
    return "kw-%s-%s" % (world, fam)


def world_of(sfx_id):
    """'kw-am_ap-pop' -> 'am_ap' (khong phai tieng the gioi -> None)."""
    s = str(sfx_id or "")
    if not s.startswith("kw-"):
        return None
    for w in WORLDS:
        if s.startswith("kw-%s-" % w):
            return w
    return None


def world_gain_db(sfx_id):
    w = world_of(sfx_id)
    return WORLDS[w][1] if w else 0.0


def _t(n):
    return np.arange(n) / SR


def _tone(freqs_hz, n):
    """Song sin theo duong tan so (mang n gia tri hoac so)."""
    f = np.broadcast_to(np.asarray(freqs_hz, dtype=float), (n,))
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def _exp_sweep(f0, f1, n, curve=1.0):
    x = np.linspace(0, 1, n) ** curve
    return f0 * (f1 / f0) ** x


def _decay(n, tau):
    return np.exp(-_t(n) / max(1e-4, tau))


def _lowpass(x, fc):
    """Loc thong thap 1 cuc (lam mem tieng)."""
    a = 1 - np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += a * (v - acc)
        y[i] = acc
    return y


def _reverb(x, seconds=1.2, wet=0.25, seed=3, damp=3500):
    """Duoi vang: tich chap voi nhieu tat dan (IR tong hop) — 'khong gian' cho bo dien anh."""
    rng = np.random.default_rng(seed)
    n = int(SR * seconds)
    ir = rng.standard_normal(n) * np.exp(-_t(n) / (seconds / 5.0))
    ir = _lowpass(ir, damp)
    ir[0] = 0
    m = len(x) + n - 1
    size = 1 << (m - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:m]
    y = y / (np.max(np.abs(y)) or 1.0) * np.max(np.abs(x))
    out = np.zeros(m)
    out[:len(x)] += x
    out += wet * y
    return out


def _fade_tail(x, ms=12):
    k = min(len(x), int(SR * ms / 1000))
    if k > 1:
        x[-k:] *= np.linspace(1, 0, k)
    return x


def _clicks(rng, n, gap, fn):
    x = np.zeros(n)
    pos = int(SR * 0.01)
    while pos < n - int(SR * 0.04):
        c = fn(rng)
        m = min(len(c), n - pos)
        x[pos:pos + m] += c[:m]
        pos += int(SR * rng.uniform(*gap))
    return x


def synth_world(world, fam, seed=11):
    """1 tieng cua 1 the gioi. Moi bo giu MOT chat: am_ap (go / bong bong / marimba, mem), cong_nghe (blip so, kinh,
    sweep sang), dien_anh (tram, day, co khong gian vang), vui_nhon (bloop, coi truot, xylophone, bonk lo xo), toi_gian
    (rat ngan, nho, tinh)."""
    rng = np.random.default_rng(seed + zlib.crc32(("%s/%s" % (world, fam)).encode()) % 997)  # on dinh moi may
    nz = rng.standard_normal
    if world == "am_ap":
        if fam == "pop":                      # bong bong / go tron: sin truot xuong + hai bac 2 nhe
            n = int(SR * 0.16)
            f = 330 + 260 * _decay(n, 0.02)
            x = (_tone(f, n) + 0.25 * _tone(2 * f, n)) * _decay(n, 0.045)
            x[:200] += _lowpass(nz(200), 2500) * 0.3
        elif fam == "click":                  # mo go (wood block): 2 mode cong huong tat nhanh + tieng go (v2: v1 nghe nhu click chuot)
            n = int(SR * 0.16)
            x = (_tone(950, n) * _decay(n, 0.045) + 0.55 * _tone(2390, n) * _decay(n, 0.018)
                 + 0.25 * _tone(520, n) * _decay(n, 0.06))
            x[:180] += _lowpass(nz(180), 3000) * 0.5
            x[:40] *= np.linspace(0.3, 1, 40)
        elif fam == "whoosh":                 # gio am, thap
            n = int(SR * 0.6)
            x = _lowpass(_bandpass_sweep(nz(n), 180, 1100, 0.7), 2400) * _env(n, 0.55, 0.45)
        elif fam == "swoosh":                 # vai luot
            n = int(SR * 0.32)
            x = _lowpass(_bandpass_sweep(nz(n), 600, 2600, 0.9), 4000) * _env(n, 0.4, 0.6)
        elif fam == "boom":                   # thud mem, khong meo
            n = int(SR * 0.7)
            x = _tone(45 + 30 * _decay(n, 0.05), n) * _decay(n, 0.28) + _lowpass(nz(n), 300) * _decay(n, 0.04) * 0.6
        elif fam == "riser":                  # phong len nhe nhang
            n = int(SR * 1.2)
            ramp = np.linspace(0, 1, n) ** 1.6
            x = (_lowpass(_bandpass_sweep(nz(n), 200, 1500, 0.8), 3000) * 0.7
                 + 0.35 * _tone(_exp_sweep(196, 392, n), n)) * ramp
        elif fam == "ding":                   # marimba (hai bac 1 : 4)
            n = int(SR * 0.8)
            x = _tone(659, n) * _decay(n, 0.22) + 0.35 * _tone(659 * 3.93, n) * _decay(n, 0.05)
            x[:80] *= np.linspace(0, 1, 80)
        else:                                 # typing: go but chi / go nhe, thua
            n = int(SR * 0.75)
            x = _clicks(rng, n, (0.08, 0.14), lambda r: _bandpass_sweep(
                r.standard_normal(1100), 2200, 1800, 2.0) * _decay(1100, 0.004) * r.uniform(0.5, 0.9))
    elif world == "cong_nghe":
        if fam == "pop":                      # pluck kinh (FM)
            n = int(SR * 0.14)
            idx = 3.0 * _decay(n, 0.02)
            x = np.sin(2 * np.pi * 1400 * _t(n) + idx * np.sin(2 * np.pi * 1974 * _t(n))) * _decay(n, 0.04)
        elif fam == "click":                  # blip so vuong
            n = int(SR * 0.03)
            x = np.sign(_tone(3200, n)) * 0.5 * _decay(n, 0.006) + nz(n) * _decay(n, 0.0015) * 0.3
        elif fam == "whoosh":                 # sweep sang + vet tone dien tu
            n = int(SR * 0.45)
            x = (_bandpass_sweep(nz(n), 800, 6000, 1.3) + 0.25 * _tone(_exp_sweep(400, 1600, n), n)) * _env(n, 0.6, 0.4)
        elif fam == "swoosh":
            n = int(SR * 0.22)
            x = _bandpass_sweep(nz(n), 2000, 9000, 1.6) * _env(n, 0.45, 0.55)
        elif fam == "boom":                   # sub drop + click so + nen bit nhe
            n = int(SR * 0.8)
            x = _tone(_exp_sweep(95, 34, n, 0.6), n) * _decay(n, 0.35)
            x[:300] += np.sign(nz(300)) * _decay(300, 0.002) * 0.6
            x = np.round(x * 48) / 48
        elif fam == "riser":                  # saw sweep + nhieu sang
            n = int(SR * 1.4)
            f = _exp_sweep(110, 880, n)
            saw = sum(_tone(k * f, n) / k for k in range(1, 7))
            x = (0.45 * saw + _bandpass_sweep(nz(n), 500, 8000, 1.0)) * np.linspace(0, 1, n) ** 2.0
        elif fam == "ding":                   # chuong thuy tinh (bac khong dieu hoa)
            n = int(SR * 1.0)
            x = sum(a * _tone(1046 * r, n) * _decay(n, d) for r, a, d in ((1, 1, 0.45), (2.76, 0.5, 0.2), (5.4, 0.25, 0.09)))
            x[:60] *= np.linspace(0, 1, 60)
        else:                                 # ban phim co
            n = int(SR * 0.7)
            x = _clicks(rng, n, (0.05, 0.09), lambda r: (r.standard_normal(1300) * _decay(1300, 0.0025)
                                                         + 0.5 * _tone(r.uniform(2400, 3800), 1300) * _decay(1300, 0.005)))
    elif world == "dien_anh":
        if fam == "boom":                     # impact tram co duoi vang
            n = int(SR * 0.9)
            body = _tone(30 + 28 * _decay(n, 0.09), n) * _decay(n, 0.5)
            hit = _lowpass(nz(n), 900) * _decay(n, 0.05)
            x = _reverb(np.tanh((body + hit) * 1.6), seconds=1.8, wet=0.35, damp=1800)
        elif fam == "whoosh":                 # whoosh nang, sau
            n = int(SR * 0.8)
            x = _reverb(_bandpass_sweep(nz(n), 120, 900, 0.8) * _env(n, 0.7, 0.3)
                        + 0.2 * _tone(_exp_sweep(260, 120, n), n) * _env(n, 0.7, 0.3), seconds=1.0, wet=0.3)
        elif fam == "swoosh":
            n = int(SR * 0.4)
            x = _reverb(_bandpass_sweep(nz(n), 400, 3000, 1.0) * _env(n, 0.5, 0.5), seconds=0.8, wet=0.25)
        elif fam == "riser":                  # don dai, cat dot (cho cu dap ngay sau)
            n = int(SR * 2.0)
            f = _exp_sweep(110, 440, n)
            x = (_bandpass_sweep(nz(n), 150, 5000, 0.9) + 0.3 * _tone(f, n) + 0.3 * _tone(f * 1.006, n)) \
                * np.linspace(0, 1, n) ** 2.4
        elif fam == "ding":                   # chuong tram, ngan vang dai
            n = int(SR * 1.6)
            x = sum(a * _tone(392 * r, n) * _decay(n, d) for r, a, d in
                    ((0.5, 0.5, 0.9), (1, 1, 0.7), (2.0, 0.45, 0.4), (2.4, 0.3, 0.3), (3.0, 0.2, 0.2)))
            x[:120] *= np.linspace(0, 1, 120)
            x = _reverb(x, seconds=1.4, wet=0.3)
        elif fam == "pop":                    # thump dam
            n = int(SR * 0.22)
            x = _tone(_exp_sweep(180, 60, n, 0.5), n) * _decay(n, 0.06) + nz(n) * _decay(n, 0.003) * 0.4
        elif fam == "click":                  # tick nang
            n = int(SR * 0.12)
            x = _bandpass_sweep(nz(n), 1300, 1100, 2.0) * _decay(n, 0.006) + 0.6 * _tone(400, n) * _decay(n, 0.03)
            x = _reverb(x, seconds=0.6, wet=0.2)
        else:                                 # may danh chu co
            n = int(SR * 0.8)
            x = _clicks(rng, n, (0.09, 0.15), lambda r: (_bandpass_sweep(r.standard_normal(2200), 1500, 1300, 1.5)
                                                         * _decay(2200, 0.005) + 0.5 * _tone(170, 2200) * _decay(2200, 0.015)))
    elif world == "vui_nhon":
        if fam == "pop":                      # bloop di len
            n = int(SR * 0.13)
            x = _tone(_exp_sweep(300, 900, n, 0.7), n) * _env(n, 0.08, 0.6)
        elif fam == "click":                  # tick do choi
            n = int(SR * 0.05)
            x = _tone(2400, n) * _decay(n, 0.005) + 0.6 * _tone(1200, n) * _decay(n, 0.012)
        elif fam == "whoosh":                 # coi truot co rung
            n = int(SR * 0.42)
            f = _exp_sweep(500, 1500, n) * (1 + 0.03 * np.sin(2 * np.pi * 9 * _t(n)))
            x = _tone(f, n) * _env(n, 0.3, 0.5) * 0.7 + _bandpass_sweep(nz(n), 900, 3000, 1.2) * _env(n, 0.5, 0.5) * 0.4
        elif fam == "swoosh":
            n = int(SR * 0.18)
            x = _tone(_exp_sweep(900, 1800, n), n) * _env(n, 0.2, 0.6)
        elif fam == "boom":                   # bonk + lo xo
            n = int(SR * 0.55)
            f = 160 * (1 + 0.25 * np.sin(2 * np.pi * 22 * _t(n)) * _decay(n, 0.15))
            x = _tone(f, n) * _decay(n, 0.18) + _lowpass(nz(n), 600) * _decay(n, 0.02) * 0.7
        elif fam == "riser":                  # coi truot len
            n = int(SR * 1.0)
            f = _exp_sweep(300, 1400, n, 1.2) * (1 + 0.02 * np.sin(2 * np.pi * 7 * _t(n)))
            x = _tone(f, n) * np.linspace(0.3, 1, n) * _env(n, 0.1, 0.05)
        elif fam == "ding":                   # xylophone 2 not "ting-ding"
            n = int(SR * 0.7)
            a = _tone(1046, n) * _decay(n, 0.12) + 0.3 * _tone(1046 * 3.9, n) * _decay(n, 0.03)
            k = int(SR * 0.07)
            b = np.zeros(n)
            m = n - k
            b[k:] = _tone(1568, m) * _decay(m, 0.16) + 0.3 * _tone(1568 * 3.9, m) * _decay(m, 0.03)
            x = a + b
        else:                                 # bong bong go chu
            n = int(SR * 0.7)
            x = _clicks(rng, n, (0.06, 0.1), lambda r: _tone(_exp_sweep(r.uniform(500, 700), r.uniform(900, 1300),
                                                                         1500), 1500) * _env(1500, 0.1, 0.6) * 0.8)
    else:   # toi_gian (v4: pop / click co them than tieng ngan — ban 25 ms qua mong, mo het am luong van -13 dB so voi giong)
        if fam == "pop":
            n = int(SR * 0.12)
            x = _tone(_exp_sweep(460, 300, n), n) * _decay(n, 0.035)
        elif fam == "click":
            n = int(SR * 0.07)
            x = (_bandpass_sweep(nz(n), 3000, 2800, 2.0) * _decay(n, 0.002) + 0.6 * _tone(1900, n) * _decay(n, 0.012)
                 + 0.35 * _tone(950, n) * _decay(n, 0.02))
        elif fam == "whoosh":
            n = int(SR * 0.45)
            x = _bandpass_sweep(nz(n), 500, 2500, 0.6) * _env(n, 0.5, 0.5) * 0.7
        elif fam == "swoosh":
            n = int(SR * 0.2)
            x = _bandpass_sweep(nz(n), 1500, 5000, 0.9) * _env(n, 0.4, 0.6) * 0.7
        elif fam == "boom":
            n = int(SR * 0.5)
            x = _tone(_exp_sweep(60, 44, n), n) * _decay(n, 0.2)
        elif fam == "riser":
            n = int(SR * 1.0)
            x = _lowpass(_bandpass_sweep(nz(n), 300, 2500, 0.7), 3500) * np.linspace(0, 1, n) ** 1.8
        elif fam == "ding":
            n = int(SR * 0.7)
            x = (_tone(880, n) + 0.2 * _tone(1760, n)) * _decay(n, 0.25)
            x[:80] *= np.linspace(0, 1, 80)
        else:
            n = int(SR * 0.6)
            x = _clicks(rng, n, (0.07, 0.12), lambda r: r.standard_normal(500) * _decay(500, 0.0015) * 0.6)
    return _norm(_fade_tail(np.asarray(x, dtype=float)))


def ensure_worlds(worlds=None):
    """Tao (neu thieu / phien ban cu) + dang ky 5 bo tieng vao kho SFX (do to + moc cu dam do bang may). Tra so muc moi."""
    os.makedirs(engine.SFX_DIR, exist_ok=True)
    lib = engine._load_lib()
    items = lib.get("sfx", [])
    have = {e.get("id"): e for e in items}
    changed = 0
    for w in (worlds or WORLDS):
        wname = WORLDS[w][0]
        for fam in WORLD_FAMILIES:
            sid = world_id(w, fam)
            path = os.path.join(engine.SFX_DIR, sid + ".wav")
            old = have.get(sid)
            if os.path.isfile(path) and old and old.get("kit_v") == WORLD_VERSION:
                continue
            _write_wav(path, synth_world(w, fam))
            name, tags, use_when = _FAM_INFO[fam]
            e = {"id": sid, "name": "%s · %s" % (name, wname), "file": path, "source": "tong_hop",
                 "emotion": "neutral", "use_when": "%s — bộ âm thanh '%s'" % (use_when, wname),
                 "tags": tags + ["the gioi %s" % w], "sound_type": tags[0], "world": w, "kit_v": WORLD_VERSION,
                 "summary": HEARD.get(sid) or "Tiếng tổng hợp bộ '%s' (%s)." % (wname, name)}
            try:
                e["lufs_m"] = engine.measure_loudness(path)
                e.update({k: v for k, v in engine.sfx_audio_facts(path).items() if k in ("duration", "peak_time", "onset")})
            except Exception:
                pass
            if old:
                old.clear()
                old.update(e)
            else:
                items.append(e)
                have[sid] = e
            changed += 1
    if changed:
        lib["sfx"] = items
        engine._save_lib(lib)
    return changed


def family_file(name, world=None):
    """Ho tieng -> (id, duong dan). Co the gioi (tham so) -> tieng cua bo do; khong thi kit-*."""
    fam = str(name or "").strip().lower()
    sid = FAMILY.get(fam)
    if not sid:
        return None, None
    w = world if world in WORLDS else None
    if w:
        wf = {"impact": "boom", "punch": "boom"}.get(fam, fam)
        if wf in WORLD_FAMILIES:
            wid = world_id(w, wf)
            path = os.path.join(engine.SFX_DIR, wid + ".wav")
            if not os.path.isfile(path):
                try:
                    ensure_worlds([w])
                except Exception:
                    pass
            if os.path.isfile(path):
                return wid, path
    path = os.path.join(engine.SFX_DIR, sid + ".wav")
    if not os.path.isfile(path):
        ensure_kit()
    return (sid, path) if os.path.isfile(path) else (None, None)


def auto_item(fam, t, ref, purpose, lib=None, dur=None):
    """Muc audio (gio timeline) cho tieng TU GAN tai su kien `t` (chu hien, lop do hoa, canh shot, hieu ung tu viet).
    Plan co bo tieng earshot (sfx_gen.use trong build_spec) -> tieng TAO theo bo cua video, take theo `ref`; plan cu
    -> bo tieng kit-* trong kho nhu truoc. `lib` = {id: muc kho} (doc 1 lan o ham goi). Tra None neu khong co tieng."""
    import sfx_gen
    a = sfx_gen.auto_item(fam, ref, dur=dur)
    if a:
        a.update({"start": sfx_gen.place(a, float(t)), "purpose": purpose, "_from_layer": ref})
        return a
    sid, path = family_file(fam)
    if not sid:
        return None
    e = (lib or {}).get(sid)
    if e is None:
        e = next((x for x in engine.sfx_list() if x.get("id") == sid), {})
    return {"sfx_id": sid, "file": path, "start": t, "purpose": purpose, "_name": e.get("name"),
            "tags": e.get("tags") or [], "_lufs": e.get("lufs_m"), "_from_layer": ref}


def sound_catalog():
    """Danh muc am thanh cho luong Tao video (sidecar /sound/catalog -> motion/sound.ts): 5 bo tieng the gioi + SFX kho
    khong giong noi co nhan + nhac nen khong loi."""
    import music_lib
    try:
        ensure_worlds()
    except Exception:
        pass
    lib = {e.get("id"): e for e in engine.sfx_list() if isinstance(e, dict)}
    worlds = {}
    for w, (name, _db) in WORLDS.items():
        sounds = []
        for fam in WORLD_FAMILIES:
            e = lib.get(world_id(w, fam)) or {}
            if e.get("file") and os.path.isfile(e["file"]):
                sounds.append({"family": fam, "file": e["file"], "duration": e.get("duration"),
                               "peak_time": e.get("peak_time")})
        if sounds:
            worlds[w] = {"name": name, "character": WORLD_CHARACTER.get(w, ""), "sounds": sounds}
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
