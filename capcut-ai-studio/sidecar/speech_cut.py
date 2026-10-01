#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CAT AN TOAN THEO TIENG NOI + LOP CHU KHOP LOI (2026-09-26).

Su co that (IMG_3839, du an r_muhwdi9idyzqlb) — user: "cat canh nhung tieng chua kip noi het",
"chu / anh nhay ra kem am thanh hay di truoc vai giay". Do tren chu Whisper (asr_words):
  - Diem cat lay theo "cum tu" cua ban chep loi Gemini: cum tu NOI LIEN nhau ngay giua cau, nen
    ranh gioi cum bi coi la "khoang lang" -> cat giua cau (64.58 'it' -> 'cai'...), cat DUNG luc
    Whisper cho la het chu (du 0.00s — Whisper hay bao het chu SOM hon am that) va ca cat ngang chu
    ('Skew.' 20.91-21.45 bi cat o 21.29).
  - Lop chu (R4) neo o DAU doan / dau cau thay vi luc noi tu khoa ('KHOA NICK' hien tu 41.49 khi
    "rat de bi khoa nick" noi tu 42.4). SFX cua lop bam theo lop -> cung som.

Co che (chi o cho NHAY DOAN: hai doan lien nhau tren timeline ma khong noi tiep nhau trong nguon —
doan noi tiep thi tieng van lien, khong dung toi):
  1. Cuoi doan: khong cat giua chu, khong cat giua cau (dau cau . ? ! hoac khoang lang >= 0.25s;
     dau phay kem khoang lang >= 0.12s) -> noi them cho het cau neu gan (<= 1.2s), khong thi lui ve
     cho ngat truoc (<= 1.2s), khong thi noi toi 2.5s. Duoi am lay theo DO TO THAT cua am thanh
     (het tieng >= 60ms) chu khong tin moc cuoi chu cua Whisper.
  2. Dau doan: khong bat dau giua chu / giua cau (lui ve dau cau <= 1.2s), chua 1 chut lang truoc
     chu dau (khong xen am dau).
  3. Khong keo vao doan nguon da dung cho doan khac (tranh lap tieng); cham doan ke tiep thi noi
     lien luon (thanh doan lien mach).
  4. Lop chu: tim dung chu Whisper khop noi dung lop trong pham vi cua no -> hien ngay truoc khi tu
     do duoc noi (LAYER_LEAD); hinh cung nhom (vong, mui ten) doi theo; SFX cua lop (va SFX rieng
     dat dung luc lop hien) doi theo.
Ham thuan tren du lieu (plan), chay lai nhieu lan ra cung ket qua. Khong co ffmpeg/numpy -> chi
dung moc chu Whisper + duoi am co dinh.
"""
import hashlib
import os
import re
import subprocess
import threading
import unicodedata

CACHE_DIR = os.path.join(os.path.expanduser("~"), ".capcut-studio", "cache", "speech-energy")
HOP = 0.01                # 10 ms / khung do do to
PAUSE_GAP = 0.25          # khoang lang giua 2 chu du coi la ngat cau
SOFT_GAP = 0.12           # dau phay + khoang lang nho cung la cho ngat duoc
EXTEND_NEAR = 1.2         # het cau trong 1.2s -> noi them cho tron cau
RETRACT_MAX = 1.2         # lui ve cho ngat truoc toi da 1.2s
EXTEND_MAX = 2.5          # noi them toi da
TAIL_SEARCH = 0.45        # tim cho het tieng sau cuoi chu toi da 0.45s
TAIL_MIN = 0.08           # it nhat 80ms sau cuoi chu Whisper
TAIL_KEEP = 0.03          # giu 30ms lang sau khi het tieng
PREROLL = 0.06            # vao doan som 60ms truoc chu dau
SILENCE_RUN = 0.06        # het tieng = do to duoi nguong lien tuc >= 60ms
TAIL_RUN = 0.04           # o vung duoi am cua chu cuoi: lang 40ms da la het tieng
TAIL_OVER = 0.10          # Whisper hay bao chu sau bat dau SOM hon am that toi ~0.1s: duoi am cua chu
                          # truoc duoc phep vuot moc do (do that: 'luon.|Cai' 30.41 -> het tieng 30.44)
MIN_SEG = 0.8
LAYER_LEAD = 0.12         # lop chu hien 0.12s truoc khi noi tu do (hieu ung vao kip hien ro)
CONTIG = 0.03

_energy_cache = {}
_lock = threading.Lock()


# ----------------------------------------------------------------------------
# Du lieu chu Whisper + do to am thanh
# ----------------------------------------------------------------------------
def words_by_source(plan):
    """{source_id: [(chu, s, e)]} tu plan['asr_words'] (sap theo gio)."""
    out = {}
    for sid, rows in (plan.get("asr_words") or {}).items():
        ws = []
        for r in rows or []:
            try:
                if isinstance(r, dict):
                    w, s, e = r.get("w") or r.get("word") or r.get("text"), r.get("s", r.get("start")), r.get("e", r.get("end"))
                else:
                    w, s, e = r[0], r[1], r[2]
                s, e = float(s), float(e)
            except (TypeError, ValueError, IndexError):
                continue
            if e >= s:
                ws.append((str(w or ""), s, e))
        ws.sort(key=lambda x: x[1])
        if ws:
            out[sid] = ws
    return out


def _src_key(path):
    st = os.stat(path)
    return hashlib.sha1(("%s|%d|%d|v1" % (os.path.abspath(path), st.st_size, st.st_mtime_ns)).encode()).hexdigest()[:20]


def energy(path):
    """Mang do to (dBFS) moi 10ms cua am thanh file, hoac None. Cache o dia + trong RAM."""
    try:
        import numpy as np
    except ImportError:
        return None
    if not path or not os.path.isfile(path):
        return None
    try:
        key = _src_key(path)
    except OSError:
        return None
    with _lock:
        if key in _energy_cache:
            return _energy_cache[key]
    cp = os.path.join(CACHE_DIR, key + ".npy")
    db = None
    if os.path.isfile(cp):
        try:
            db = np.load(cp)
        except (OSError, ValueError):
            db = None
    if db is None:
        import remotion_plan
        hop = int(16000 * HOP)
        try:
            p = subprocess.Popen([remotion_plan._ffbin("ffmpeg"), "-v", "error", "-i", path, "-vn", "-ac", "1",
                                  "-ar", "16000", "-f", "s16le", "-"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        except OSError:
            return None
        vals, rest = [], b""
        chunk = hop * 2 * 2000
        while True:
            buf = p.stdout.read(chunk)
            if not buf:
                break
            buf = rest + buf
            n = (len(buf) // (hop * 2)) * hop * 2
            rest = buf[n:]
            x = np.frombuffer(buf[:n], dtype=np.int16).astype(np.float32) / 32768.0
            if x.size:
                rms = np.sqrt((x.reshape(-1, hop) ** 2).mean(axis=1))
                vals.append(20 * np.log10(rms + 1e-6))
        p.wait()
        if not vals:
            return None
        db = np.concatenate(vals).astype(np.float32)
        try:
            os.makedirs(CACHE_DIR, exist_ok=True)
            np.save(cp, db)
        except OSError:
            pass
    with _lock:
        _energy_cache[key] = db
    return db


def silence_threshold(db, frac=0.35):
    """Nguong 'het tieng': nen on + 35% khoang dong (dB) giua nen on va tieng noi.
    frac=SOFT_FRAC -> nguong MEM: duoi am nho (phu am cuoi, hoi xuong giong, hoi tho) van tinh la tieng."""
    import numpy as np
    floor, loud = float(np.percentile(db, 10)), float(np.percentile(db, 90))
    return floor + frac * max(6.0, loud - floor)


SOFT_FRAC = 0.18          # nguong mem (xem silence_threshold)
SOFT_RUN = 0.03           # tieng TAT HAN = duoi nguong mem lien tuc >= 30ms
SOFT_SEARCH = 0.30        # tim cho tieng tat han / bat dau that toi da 0.3s quanh moc nguong chinh


class Audio:
    """Do to cua 1 nguon + nguong lang. db=None -> chi dung moc chu Whisper.

    Do that: moc chu Whisper hay NUOT khoang lang (chu sau "bat dau" ngay khi chu truoc het du am
    thanh o giua im han -62 dB) va nguoc lai hai cau noi LIEN khong co lang ("luon. Cai") -> dung
    am thanh that de tim cho ngat va diem cat."""

    def __init__(self, db):
        self.db = db
        self.thr = silence_threshold(db) if db is not None and len(db) > 50 else None
        self.soft = silence_threshold(db, SOFT_FRAC) if self.thr is not None else None

    def soft_in(self, a, b):
        """Nguong mem CHO KHOANG LANG [a, b]: phong on (nen) o day co the cao hon nguong mem chung (do that 2026-10-01:
        phong -55..-60 dB tren nguong mem -59 -> ca khoang lang bi coi la 'duoi am', khong cat duoc). Lay
        trung vi khoang lang + 6 dB (khong vuot nguong chinh - 1)."""
        if self.thr is None:
            return None
        import numpy as np
        seg = self.db[self._idx(a):self._idx(b) + 1]
        if len(seg) < 5:
            return self.soft
        return min(self.thr - 1.0, max(self.soft, float(np.median(seg)) + 6.0))

    def sound_end(self, a, limit=SOFT_SEARCH, soft=None):
        """Tieng TAT HAN tu moc `a` (moc bat dau lang theo nguong chinh): duoi am nho hon nguong chinh nhung
        tren nguong mem van la tieng -> chua duoc cat. Khong thay tat han trong `limit` -> a + limit."""
        if self.thr is None:
            return a
        soft = self.soft if soft is None else soft
        i, i_end, need, cnt = self._idx(a), self._idx(a + limit), max(1, int(round(SOFT_RUN / HOP))), 0
        for k in range(i, i_end + 1):
            if float(self.db[k]) < soft:
                cnt += 1
                if cnt >= need:
                    return max(a, (k - cnt + 1) * HOP)
            else:
                cnt = 0
        return a + limit

    def sound_start(self, b, limit=SOFT_SEARCH, soft=None):
        """Tieng BAT DAU THAT truoc moc `b` (cho tieng vuot nguong chinh): phan dau am dang len (tren nguong mem)
        cung la tieng -> vao truoc no."""
        if self.thr is None:
            return b
        soft = self.soft if soft is None else soft
        k, lo = self._idx(b) - 1, self._idx(max(0.0, b - limit))
        while k >= lo and float(self.db[k]) >= soft:
            k -= 1
        return min(b, (k + 1) * HOP)

    def loud_at(self, t0, t1):
        """Co tieng THAT (nguong chinh) trong [t0, t1] — dung de kiem diem cat co roi vao tieng khong."""
        if self.thr is None or t1 <= t0:
            return False
        seg = self.db[self._idx(t0):self._idx(t1) + 1]
        return bool(len(seg)) and float(seg.max()) >= self.thr

    def _idx(self, t):
        return max(0, min(len(self.db) - 1, int(round(t / HOP))))

    def quiet_runs(self, t0, t1, min_run=SILENCE_RUN):
        """[(dau, cuoi)] cac doan lang lien tuc >= min_run trong [t0, t1]."""
        if self.thr is None or t1 <= t0:
            return []
        i0, i1 = self._idx(t0), self._idx(t1)
        runs, st = [], None
        for i in range(i0, i1 + 1):
            q = float(self.db[i]) < self.thr
            if q and st is None:
                st = i
            elif not q and st is not None:
                runs.append((st, i))
                st = None
        if st is not None:
            runs.append((st, i1 + 1))
        n = int(round(min_run / HOP))
        return [(a * HOP, b * HOP) for a, b in runs if b - a >= n]

    def quiet_start(self, t):
        """Dang lang o `t` -> gio bat dau khoang lang do; con tieng -> None."""
        if self.thr is None:
            return None
        i = self._idx(max(0.0, t))
        if float(self.db[i]) >= self.thr:
            return None
        while i > 0 and float(self.db[i - 1]) < self.thr:
            i -= 1
        return i * HOP

    def quiet_end(self, t):
        """Dang lang o `t` -> gio HET khoang lang do (tieng tiep theo bat dau); con tieng -> None."""
        if self.thr is None:
            return None
        i = self._idx(max(0.0, t))
        if float(self.db[i]) >= self.thr:
            return None
        while i < len(self.db) - 1 and float(self.db[i + 1]) < self.thr:
            i += 1
        return (i + 1) * HOP

    def has_sound(self, t0, t1):
        """Co tieng (do to >= nguong) trong [t0, t1] khong. Khong co du lieu -> coi nhu co."""
        if self.thr is None:
            return True
        if t1 <= t0:
            return False
        seg = self.db[self._idx(t0):self._idx(t1) + 1]
        return bool(len(seg)) and float(seg.max()) >= self.thr

    def longest_quiet(self, t0, t1):
        return max([b - a for a, b in self.quiet_runs(t0, t1)] or [0.0])

    def valley(self, t0, t1):
        """Moc nho tieng nhat trong [t0, t1] (cat o day khi hai chu noi lien, khong co lang)."""
        if self.thr is None or t1 <= t0:
            return (t0 + t1) / 2.0
        i0, i1 = self._idx(t0), self._idx(t1)
        seg = self.db[i0:i1 + 1]
        return (i0 + int(seg.argmin())) * HOP if len(seg) else t0

    def cut_after(self, w_end, w_start, nxt_start, nxt_end, hard_hi):
        """Diem cat sau mot chu (het chu [w_start, w_end]), truoc chu ke tiep [nxt_start, nxt_end]."""
        # KHONG vuot qua luc chu ke tiep bat dau (theo Whisper): vuot qua la dinh am dau cau sau,
        # va lan dung spec sau se tuong doan dang cat giua cau -> ket qua khong on dinh.
        hi = min(hard_hi, nxt_start - 0.01, w_end + TAIL_SEARCH)
        lo = max(w_start + 0.05, w_end - 0.15)
        if hi <= lo:
            return max(min(w_end, hard_hi), lo if lo <= hard_hi else hard_hi)
        if self.thr is None:
            return min(hi, max(lo, w_end + 0.2 if nxt_start - w_end > 0.25 else (w_end + nxt_start) / 2.0))
        # Khoang lang that co the nam LAN vao khung chu sau cua Whisper (Whisper tinh ca doan im vao
        # chu, va bao chu sau bat dau som) -> van cat duoc, mien truoc do CHUA co tieng cua chu sau.
        q_hi = min(hard_hi, nxt_start + 0.35, w_end + TAIL_SEARCH)
        for a, b in self.quiet_runs(lo, q_hi, TAIL_RUN):
            # tieng VANG LAI truoc khi chu sau bat dau (Whisper bao chu sau SOM, khong bao gio muon) -> khoang lang
            # nay con nam TRONG chu hien tai (vd khoang dong cua phu am 't' trong 'tính' — do that 2026-10-01: cat o
            # 122.42 giua 'tính,') -> chua phai het tieng
            if nxt_start < float("inf") and b < nxt_start - 0.05 and self.has_sound(b + 0.01, nxt_start - 0.03):
                continue
            if a <= nxt_start + TAIL_OVER or not self.has_sound(nxt_start + TAIL_OVER, a):
                return min(q_hi, a + TAIL_KEEP)             # tieng tat -> cat ngay sau do 30ms
        # noi lien: cat o cho nho tieng nhat — uu tien SAU moc het chu (giua chu nay va chu sau): cho trung trong chu
        # (khoang dong phu am 't' cua 'tính') co the con nho tieng hon khe giua hai chu (do that 2026-10-01)
        v_lo = max(lo, w_end - 0.03)
        return self.valley(v_lo, hi) if hi - v_lo >= 0.03 else self.valley(lo, hi)

    def cut_before(self, w_start, prv_end, lo_hard):
        """Diem vao truoc chu [w_start, ...] (chu truoc het o prv_end)."""
        lo = max(lo_hard, prv_end - 0.05 if prv_end is not None else w_start - 0.4)
        hi = w_start + 0.12
        if hi <= lo:
            return max(lo_hard, w_start - PREROLL)
        if self.thr is None:
            return max(lo, w_start - PREROLL)
        runs = self.quiet_runs(lo, hi)
        if runs:
            return max(lo, runs[-1][1] - TAIL_KEEP)          # het lang -> vao truoc tieng 30ms
        return self.valley(lo, hi)


def break_after(words, k, audio=None):
    """Muc ngat sau chu k: 2 = het cau / co khoang lang nghe duoc, 1 = dau phay + lang nho, 0 = noi lien."""
    if k >= len(words) - 1:
        return 2
    gap = words[k + 1][1] - words[k][2]
    t = words[k][0].strip()
    if t.endswith((".", "?", "!", "…")) or gap >= PAUSE_GAP:
        return 2
    if audio is not None and audio.thr is not None:
        a = (words[k][1] + words[k][2]) / 2.0
        b = (words[k + 1][1] + words[k + 1][2]) / 2.0
        if audio.longest_quiet(a, b) >= 0.18:
            return 2                                        # Whisper nuot khoang lang nhung am thanh im that
    if t.endswith((",", ";", ":")) and gap >= SOFT_GAP:
        return 1
    return 0


# ----------------------------------------------------------------------------
# Cuoi doan / dau doan
# ----------------------------------------------------------------------------
def _nxt(words, k):
    return (words[k + 1][1], words[k + 1][2]) if k + 1 < len(words) else (float("inf"), float("inf"))


def safe_end(words, audio, t, lim_hi, min_t, bridge=None):
    """Diem ket thuc an toan cho doan ket thuc o `t`. Tra (t_moi, ly_do|None).
    `bridge` = dau doan KE TIEP tren timeline neu no la cung nguon va nam sau `t`: keo cuoi doan
    toi do -> hai doan noi tiep nhau trong nguon, tieng lien mach (khong lap, khong cat).
    Ngay sau doan la phan DA BO: `lim_hi` da bi chan (hard_hi) -> khong noi vao do."""
    idx = None
    q0 = audio.quiet_start(t - 0.03)                      # dang cat trong khoang lang bat dau tu q0
    for k, w in enumerate(words):
        if w[1] >= t - 0.02:
            break
        # chu "da bat dau" truoc t chi khi THAT SU co tieng cua no truoc t (Whisper hay tinh ca khoang
        # lang truoc chu vao chu, va bao chu bat dau som hon am that): cat trong khoang lang thi tieng
        # ngay truoc khoang lang (<= TAIL_OVER sau moc Whisper) la duoi am cua chu TRUOC
        if k == 0:
            idx = k
        elif q0 is not None:
            if w[1] < q0 - TAIL_OVER and audio.has_sound(w[1], q0 - 0.01):
                idx = k
        elif audio.has_sound(w[1], t - 0.02):
            idx = k
    if idx is None:
        return t, None                                    # truoc do chua ai noi
    w = words[idx]
    ns, ne = _nxt(words, idx)
    if w[2] <= t + 0.02 and break_after(words, idx, audio) >= 1:
        # da o cho ngat: giu nguyen neu dang nam trong khoang lang (chua cham chu sau)
        if t <= ns - 0.02 and (audio.thr is None or float(audio.db[audio._idx(max(0.0, t - 0.03))]) < audio.thr):
            return t, None
        k, why = idx, None
    else:
        br_ = lambda j: break_after(words, j, audio)      # noqa: E731
        k2 = next((j for j in range(idx, len(words)) if words[j][2] - t > EXTEND_MAX or br_(j) >= 1), None)
        if k2 is not None and words[k2][2] - t > EXTEND_MAX:
            k2 = None
        k1 = None
        for j in range(idx - 1, -1, -1):
            if t - words[j][2] > RETRACT_MAX:
                break
            if words[j][2] <= t + 0.02 and br_(j) >= 1:
                k1 = j
                break
        ext = (words[k2][2] - t) if k2 is not None else None
        if k2 is not None and words[k2][2] > lim_hi:
            ext = None                                     # noi them se de len doan nguon khac
        ret_ok = k1 is not None and words[k1][2] - min_t >= MIN_SEG
        br = (bridge - t) if bridge is not None and bridge >= t and bridge <= lim_hi + 1e-6 else None
        if ext is not None and ext <= EXTEND_NEAR:
            k, why = k2, "noi cho het cau"
        elif br is not None and br <= EXTEND_NEAR:
            return round(bridge, 3), "noi lien sang doan ke tiep (cau chua het)"
        elif ret_ok:
            k, why = k1, "lui ve cho ngat cau truoc"
        elif ext is not None:
            k, why = k2, "noi cho het cau"
        elif br is not None and br <= EXTEND_MAX:
            return round(bridge, 3), "noi lien sang doan ke tiep (cau chua het)"
        else:
            # khong co cho ngat cau gan: it nhat KHONG CAT GIUA CHU -> ranh gioi chu gan nhat (cho nho tieng nhat)
            w = words[idx]
            if w[1] + 0.03 < t < w[2] - 0.03:
                cands = []
                if idx > 0 and t - w[1] <= 0.4 and w[1] - min_t >= MIN_SEG:
                    pw = words[idx - 1]
                    cands.append(audio.cut_after(pw[2], pw[1], w[1], w[2], lim_hi))
                if w[2] - t <= 0.4 and w[2] <= lim_hi:
                    ns2, ne2 = _nxt(words, idx)
                    cands.append(audio.cut_after(w[2], w[1], ns2, ne2, lim_hi))
                if cands:
                    return round(min(cands, key=lambda x: abs(x - t)), 3), "khong co cho ngat cau gan -> cat o ranh gioi chu"
            return t, "khong tim duoc cho ngat cau gan — giu nguyen"
        ns, ne = _nxt(words, k)
    new = audio.cut_after(words[k][2], words[k][1], ns, ne, lim_hi)
    return round(max(min_t + MIN_SEG * 0.5, new), 3), why


def safe_start(words, audio, t, lim_lo, max_t, locked=False):
    """Diem bat dau an toan cho doan bat dau o `t`. Tra (t_moi, ly_do|None).
    `locked`: ngay truoc doan la phan DA BO (noi lap / tieng dem) -> khong lui vao do: dang o khoang
    lang thi giu nguyen; dang co tieng thi TIEN toi cho ngat gan nhat (khong vao giua tieng)."""
    if locked and audio.thr is not None:
        if audio.quiet_start(t) is not None:
            return t, None
        runs = audio.quiet_runs(t, min(t + RETRACT_MAX, max_t - MIN_SEG), 0.12)
        if runs:
            return round(max(t, runs[0][1] - TAIL_KEEP), 3), "tien toi cho ngat (phia truoc da bo)"
    j = next((k for k, w in enumerate(words) if w[2] > t + 0.02), None)
    if j is None or words[j][1] >= max_t:
        return t, None
    w = words[j]
    inside = w[1] < t - 0.02 and audio.has_sound(w[1], t - 0.02)
    prev_ok = j == 0 or break_after(words, j - 1, audio) >= 1
    prv_end = words[j - 1][2] if j > 0 else None
    if not inside and prev_ok:
        if w[1] - t > 0.6:
            return t, None                                 # lang dai truoc chu dau -> de AI quyet
        # chi LUI som hon cho khoi xen am dau; khong tu cat bot khoang lang AI da chon
        new = audio.cut_before(w[1], prv_end, max(lim_lo, t - 0.3))
        return round(min(t, new), 3), None
    # bat dau giua chu / giua cau -> lui ve dau cau
    k0 = j
    while k0 > 0 and break_after(words, k0 - 1, audio) == 0:
        k0 -= 1
    if t - words[k0][1] <= RETRACT_MAX and words[k0][1] >= lim_lo:
        pe = words[k0 - 1][2] if k0 > 0 else None
        return round(audio.cut_before(words[k0][1], pe, lim_lo), 3), "lui ve dau cau"
    if inside and j + 1 < len(words) and words[j + 1][1] < max_t - MIN_SEG:
        return round(audio.cut_before(words[j + 1][1], w[2], max(lim_lo, w[1])), 3), "bo chu bi cat do"
    return t, None


# ----------------------------------------------------------------------------
# Ap vao plan
# ----------------------------------------------------------------------------
def _src_paths(plan):
    out = {}
    for sv in plan.get("source_videos") or []:
        if isinstance(sv, dict) and sv.get("id"):
            # file goc (cung tieng voi ban SDR); file goc bi chuyen / xoa -> dung ban lam viec
            cands = [x for x in (sv.get("orig_path"), sv.get("path")) if x]
            out[sv["id"]] = next((x for x in cands if os.path.isfile(x)), cands[0] if cands else None)
    return out


def _audio_for(plan, sid, cache):
    if sid not in cache:
        cache[sid] = Audio(energy(_src_paths(plan).get(sid)))
    return cache[sid]


def fix_segment_cuts(plan, segs, changes=None, label="seg", moves=None):
    """Sua dau/cuoi cac doan (than video, theo thu tu timeline) o cho NHAY DOAN. Sua tai cho.
    `moves` (list) nhan (source_id, dau_cu, cuoi_cu, dau_moi, cuoi_moi) cua doan da sua."""
    words = words_by_source(plan)
    if not words or not segs:
        return segs
    audios = {}
    body = [s for s in segs if isinstance(s, dict) and s.get("kind") not in ("insert", "hook")]
    body.sort(key=lambda s: float(s.get("target_start") or 0))
    durs = {sv.get("id"): float(sv.get("duration") or 0) or None for sv in plan.get("source_videos") or []
            if isinstance(sv, dict)}

    def same(a, b):
        return (a.get("source_id") == b.get("source_id")
                and abs(float(a.get("speed", 1) or 1) - float(b.get("speed", 1) or 1)) < 1e-6)

    for i, s in enumerate(body):
        sid = s.get("source_id")
        ws = words.get(sid)
        if not ws:
            continue
        au = _audio_for(plan, sid, audios)
        prev = body[i - 1] if i > 0 else None
        nxt = body[i + 1] if i + 1 < len(body) else None
        st, en = float(s["start"]), float(s["end"])
        c_prev = prev is not None and same(prev, s) and abs(float(prev["end"]) - st) < CONTIG
        c_next = nxt is not None and same(s, nxt) and abs(en - float(nxt["start"])) < CONTIG
        others = [o for o in body if o is not s and o.get("source_id") == sid]
        lim_hi = min([float(o["start"]) for o in others if float(o["start"]) >= en - 1e-3] or [durs.get(sid) or float("inf")])
        lim_lo = max([float(o["end"]) for o in others if float(o["end"]) <= st + 1e-3] or [0.0])
        # mep ke doan AI / code DA BO (noi lap, tieng dem): khong lui dau / noi duoi vao phan da bo
        if s.get("hard_lo") is not None:
            lim_lo = max(lim_lo, min(st, float(s["hard_lo"])))
        if s.get("hard_hi") is not None:
            lim_hi = min(lim_hi, max(en, float(s["hard_hi"])))
        bridge = float(nxt["start"]) if (nxt is not None and same(s, nxt) and float(nxt["start"]) >= en) else None
        # mep da cat TRONG khoang lang (siet khoang nghi, do bang am thanh that) -> giu nguyen: Whisper hay keo
        # chu vao khoang lang, 'noi cho het cau' / 'lui ve dau cau' se noi lai dung khoang nghi vua cat
        new_en, why_e = (en, None) if (c_next or s.get("quiet_end")) else safe_end(ws, au, en, lim_hi, st, bridge)
        new_st, why_s = (st, None) if (c_prev or s.get("quiet_start")) else safe_start(ws, au, st, lim_lo, new_en,
                                                                                    locked=s.get("hard_lo") is not None)
        if new_en - new_st < MIN_SEG:
            continue
        if abs(new_en - en) > 0.01 or abs(new_st - st) > 0.01:
            s["start"], s["end"] = round(new_st, 3), round(new_en, 3)
            if moves is not None:
                moves.append((sid, st, en, s["start"], s["end"]))
            if changes is not None:
                ly = "; ".join(x for x in (why_s, why_e) if x) or "chua duoi am / vao truoc chu dau"
                changes.append("%s%d: cat an toan theo tieng noi %.2f-%.2f -> %.2f-%.2f (%s)"
                               % (label, i, st, en, new_st, new_en, ly))
    return segs


_EDGE_FILL = {"o", "a", "u", "um", "uh", "ah", "ua"}      # ờ ơ à ừ ừm... (da bo dau)


def trim_filler_edges(plan, segs, transcript_data, changes=None, label="seg"):
    """Dau / cuoi doan (than video) la KHOANG LANG DAI hoac tieng dem keo dai ('Ờ ... thì đây là'):
    Whisper khong nghe thay chu nao trong >= 0.6s dau (>= 0.8s cuoi) -> cat sat vao chu dau / chu
    cuoi. CHI khi loi Gemini cua cau do xac nhan phan truoc chu dau (sau chu cuoi) chi la tieng dem
    hoac khong co gi — Whisper hay bo sot ca cau that (vd 'Hello mọi người, mình là...' o dau video):
    khi do KHONG cat. Sua tai cho, ghi len segment -> build_spec chay lai van ra cung diem cat."""
    words = words_by_source(plan)
    if not words or not segs:
        return segs
    for i, s in enumerate(segs):
        if not isinstance(s, dict) or s.get("kind") in ("insert", "hook"):
            continue
        sid = s.get("source_id")
        ws, rows = words.get(sid), [r for r in (transcript_data or {}).get(sid) or []
                                    if isinstance(r, dict) and (r.get("text") or "").strip()]
        if not ws or not rows:
            continue
        st, en = float(s["start"]), float(s["end"])
        inside = [w for w in ws if w[2] > st + 0.02 and w[1] < en - 0.02]
        if not inside:
            continue

        def line_at(t):
            return next((r for r in rows if float(r.get("start", 0)) - 0.1 <= t < float(r.get("end", 0))), None)

        new_st, new_en = st, en
        w0, wl = inside[0], inside[-1]
        why = []
        ln = line_at(st + 0.01)
        if w0[1] - st >= 0.6 and ln is not None and w0[1] < float(ln["end"]):
            lt, wt = _norm(ln.get("text")), _norm(w0[0])
            k = next((n for n, t in enumerate(lt) if wt and _tok_eq(t, wt[0])), None)
            if k is not None and all(t in _EDGE_FILL for t in lt[:k]):
                new_st = round(w0[1] - 0.15, 3)
                why.append("dau: \"%s\"" % (ln.get("text") or "")[:40])
        ln = line_at(en - 0.05)
        if en - wl[2] >= 0.8 and ln is not None and wl[2] > float(ln["start"]):
            lt, wt = _norm(ln.get("text")), _norm(wl[0])
            k = next((n for n in range(len(lt) - 1, -1, -1) if wt and _tok_eq(lt[n], wt[-1])), None)
            if k is not None and all(t in _EDGE_FILL for t in lt[k + 1:]):
                new_en = round(wl[2] + 0.2, 3)
                why.append("cuoi: \"%s\"" % (ln.get("text") or "")[:40])
        if new_en - new_st < MIN_SEG or (new_st == st and new_en == en):
            continue
        s["start"], s["end"] = new_st, new_en
        if changes is not None:
            changes.append("%s%d: bo khoang lang / tieng dem o mep %.2f-%.2f -> %.2f-%.2f (loi Gemini %s)"
                           % (label, i, st, en, new_st, new_en, "; ".join(why)))
    return segs


# ----------------------------------------------------------------------------
# SIET KHOANG NGHI — LUAT CUNG (2026-10-01, user: "toan bo cac video co khoang im lang deu phai cat, cat khong
# duoc mat am, am phai phat het"). Moi khoang lang THAT (do bang am thanh) ma nguoi xem nghe thay dai hon
# `max_pause` deu bi cat; mep cat dat theo NGUONG MEM (duoi am nho / dau am dang len van la tieng) + dem, nen
# khong bao gio xen vao tieng. Sau khi cat co buoc KIEM LAI tren timeline (audit_cuts): con lang dai / mep cat
# roi vao tieng -> tu sua neu an toan, khong thi bao ro trong nhat ky.
# ----------------------------------------------------------------------------
CUT_TAIL_KEEP = 0.06      # giu 60ms sau khi tieng TAT HAN (nguong mem) — dai hon doan giam am 30ms o mep clip
CUT_HEAD_KEEP = 0.05      # vao truoc tieng bat dau that 50ms
END_KEEP = 0.20           # cuoi video: giu 0.2s sau tieng cuoi (khong dung khung dot ngot)
MIN_PIECE = 0.25          # manh doan ngan hon -> khong cat o do (bao trong buoc kiem lai)
MIN_CUT = 0.08            # phan lang bo di ngan hon -> khong dang cat
AUDIT_TOL = 0.12          # kiem lai: lang nghe thay > gioi han + 0.12s moi bao (duoi am mem nam duoi nguong chinh)
TAIL_PAST_HARD = 0.25     # kiem lai: duoi am duoc vuot moc phan da bo (hard_hi / hard_lo) toi 0.25s (khong chen chu moi)
PAUSE_FAST, PAUSE_NORMAL, PAUSE_SLOW = 0.22, 0.28, 0.40
_FAST = ("nhanh", "bắt trend", "trend", "vui", "năng lượng", "sôi động", "hài", "dồn dập", "hype", "gắt")
_SLOW = ("nhẹ nhàng", "tâm sự", "sâu lắng", "cảm động", "chậm", "thư giãn", "chữa lành", "thủ thỉ", "bình yên")


def pause_limit(story=None):
    """Khoang lang dai nhat nguoi xem duoc nghe thay (giua 2 cau / 2 doan). Moi khoang dai hon deu bi cat.
    Nhip theo yeu cau edit + tone: nhanh / vui / bat trend 0.22s, binh thuong 0.28s, nhe nhang / tam su 0.40s
    (truoc 2026-10-01 la 0.30 / 0.45 / 0.75 — user bao 'cat chua chat')."""
    st = story or {}
    req = st.get("edit_request") if isinstance(st.get("edit_request"), dict) else {}
    txt = " ".join([str(st.get("tone") or "")] + [str(v) for v in req.values() if isinstance(v, str)]).lower()
    f, sl = sum(k in txt for k in _FAST), sum(k in txt for k in _SLOW)
    if sl > f:
        return PAUSE_SLOW
    if f > sl:
        return PAUSE_FAST
    return PAUSE_NORMAL


def plan_pause_limit(plan):
    """Gioi han khoang lang cua MOT plan: autoplan ghi plan['pause_limit']; plan cu -> theo tone da luu."""
    try:
        v = float(plan.get("pause_limit"))
    except (TypeError, ValueError):
        v = None
    if v:
        return max(0.15, min(PAUSE_SLOW, v))
    pp = plan.get("_pipeline") if isinstance(plan.get("_pipeline"), dict) else {}
    return pause_limit({"tone": pp.get("tone")})


def _cut_window(au, a, b):
    """Khoang lang that [a, b] (nguong chinh) -> (cat_tu, cat_den): giu TRON duoi am cua tieng truoc va dau am
    cua tieng sau (nguong mem) + dem. cat_den - cat_tu < MIN_CUT -> khong cat."""
    sf = au.soft_in(a, b)
    return round(au.sound_end(a, soft=sf) + CUT_TAIL_KEEP, 3), round(au.sound_start(b, soft=sf) - CUT_HEAD_KEEP, 3)


def _spoken(words, sid, a, b):
    return [w for w in words.get(sid) or [] if w[2] > a + 0.02 and w[1] < b - 0.02]


def _split_middle(s, au, sw, max_pause, open_head=False, open_tail=False):
    """Cac khoang [cat_tu, cat_den] can bo GIUA doan: lang that > max_pause co tieng noi ca truoc va sau.
    open_head / open_tail: doan lien truoc / lien sau tren timeline noi LIEN trong nguon -> manh sat mep do duoc
    ngan hon MIN_PIECE (no chay tiep tu clip ben canh, khong phai 'manh nhay'). Do that 2026-10-01: doan bat dau
    bang 0.16s duoi am 'rồi.' roi lang 0.61s -> truoc day khong cat duoc."""
    st, en = float(s["start"]), float(s["end"])
    acc, left = [], st
    for a, b in au.quiet_runs(st + 0.1, en - 0.1, max_pause):
        before = any(w[1] < a for w in sw) or au.has_sound(st, a - 0.01)
        after = any(w[2] > b for w in sw) or au.has_sound(b + 0.01, en)
        if not (before and after):
            continue                                       # doan nhac / b-roll o dau hay cuoi doan: de cho noi xu ly
        lo, hi = _cut_window(au, a, b)
        if hi - lo < MIN_CUT:
            continue
        def no_word(x0, x1):
            # chu Whisper dai > 1.2s la moc hong (Whisper keo 1 chu qua ca khoang lang, vd 'nếu' 185.86-188.68)
            return not any(w[1] < x1 - 0.02 and w[2] > x0 + 0.02 and w[2] - w[1] <= 1.2 for w in sw)
        head_ok = lo - left >= MIN_PIECE or (open_head and not acc and lo - left >= 0.03)
        tail_ok = en - hi >= MIN_PIECE or (open_tail and en - hi >= 0.03)
        if not head_ok and not acc and not open_head and no_word(st, lo):
            lo, head_ok = st, True          # manh dau chi la hoi tho / tieng lach tach < 0.25s -> doan bat dau sau lang
        if not tail_ok and not open_tail and no_word(hi, en) and lo > st:
            hi, tail_ok = en, True          # manh cuoi tuong tu -> doan ket thuc truoc lang
        if head_ok and tail_ok:
            acc.append((lo, hi))
            left = hi
    return acc


def _pieces(s, acc):
    """Tach doan `s` bo cac khoang `acc`. Giu NGUYEN khung (scale) — khong con jump-cut zoom o cho cat lang:
    doi khung dot ngot o diem cat la 'zoom giat' (user 2026-10-01); zoom gio la chuyen dong muot (xem
    remotion_plan._smooth_zoom)."""
    st, en = float(s["start"]), float(s["end"])
    s = dict(s)
    acc = list(acc)
    if acc and acc[0][0] <= st + 1e-6:                     # bo ca dau doan (hoi tho + lang)
        st = acc.pop(0)[1]
        s["start"], s["quiet_start"] = round(st, 3), True
        s.pop("hard_lo", None)
    if acc and acc[-1][1] >= en - 1e-6:                    # bo ca cuoi doan
        en = acc.pop()[0]
        s["end"], s["quiet_end"] = round(en, 3), True
        s.pop("hard_hi", None)
    bounds = [st] + [x for lo, hi in acc for x in (lo, hi)] + [en]
    ts = float(s.get("target_start") or 0)
    out = []
    for k in range(len(acc) + 1):
        p = dict(s)
        p["start"], p["end"] = round(bounds[2 * k], 3), round(bounds[2 * k + 1], 3)
        p["target_start"] = round(ts, 3)
        ts += (p["end"] - p["start"]) / float(p.get("speed", 1.0) or 1.0)
        if k > 0:
            p["quiet_start"] = True
            p.pop("hard_lo", None)
        if k < len(acc):
            p["quiet_end"] = True
            p.pop("hard_hi", None)
        out.append(p)
    return out


def tighten_pauses(plan, segs, max_pause, changes=None, label="seg", removed=None):
    """SIET KHOANG NGHI (than video): moi khoang lang THAT ma nguoi xem nghe thay > `max_pause`
    - giua mot doan -> tach doan, bo khoang lang (giu tron duoi am / dau am theo nguong mem + dem);
    - o cho noi 2 doan tren timeline (duoi doan truoc + dau doan sau) -> cat bot ca hai ben;
    - dau video (lang truoc tieng dau) va CUOI video (lang sau tieng cuoi) -> cat.
    Mep cat danh dau quiet_start / quiet_end -> cat an toan theo tieng noi (va build_spec chay lai) giu nguyen.
    `removed` (list) nhan (source_id, tu, den) cac khoang da bo -> moc diem (meme / SFX) trong do theo mep cat.
    Tra danh sach segment moi (target_start xep lai sau bang chuan_hoa_segments)."""
    if not segs or not max_pause:
        return segs
    words = words_by_source(plan)
    if not words:
        return segs
    audios = {}
    srcs = {sv.get("id") for sv in plan.get("source_videos") or [] if isinstance(sv, dict)}

    def note(sid, a, b):
        if removed is not None and b - a > 0.01:
            removed.append((sid, round(a, 3), round(b, 3)))

    body = [s for s in segs if isinstance(s, dict) and s.get("kind") not in ("insert", "hook")]
    body.sort(key=lambda s: float(s.get("target_start") or 0))
    au_of = {}
    for s in body:
        sid = s.get("source_id")
        # chi siet o NGUON co loi noi (video khong loi / chi nhac: giu nguyen) va doan CO TIENG (canh b-roll im hoan toan
        # la co y: giu nguyen). Khong doi doan phai co chu Whisper: Whisper hay bo sot ca cau (do that 2026-10-01:
        # doan 278.4-281.5 co tieng noi, khong chu Whisper nao -> lang 0.44s khong duoc cat).
        if sid in srcs and words.get(sid):
            try:
                au = _audio_for(plan, sid, audios)
            except Exception:
                au = None
            ok = au is not None and au.thr is not None and au.has_sound(float(s["start"]), float(s["end"]))
            au_of[id(s)] = au if ok else None
    # 1) cho noi giua 2 doan lien tiep tren timeline
    for i, s in enumerate(body):
        au = au_of.get(id(s))
        sid = s.get("source_id")
        st, en = float(s["start"]), float(s["end"])
        sw = _spoken(words, sid, st, en)
        q0 = au.quiet_start(en - 0.02) if au is not None else None
        if q0 is not None and sw:
            q0 = max(q0, sw[-1][1] + 0.05)                    # khong cat vao chu cuoi (Whisper)
        tail = (en - max(st, q0)) if q0 is not None else 0.0
        if au is None and (i + 1 >= len(body) or au_of.get(id(body[i + 1])) is None):
            continue
        nxt = body[i + 1] if i + 1 < len(body) else None
        head, nq1, nau = 0.0, None, au_of.get(id(nxt)) if nxt is not None else None
        if nau is not None:
            nst, nen = float(nxt["start"]), float(nxt["end"])
            nq1 = nau.quiet_end(nst + 0.02)
            nw = _spoken(words, nxt.get("source_id"), nst, nen)
            if nq1 is not None and nw:
                nq1 = min(nq1, nw[0][2] - 0.05)                # khong cat vao chu dau (Whisper)
            head = max(0.0, min(nen, nq1) - nst) if nq1 is not None else 0.0
        limit = max_pause if nxt is not None else END_KEEP     # cuoi video: chi giu 0.2s sau tieng cuoi
        if tail + head <= limit + 0.02:
            continue
        cut = []
        if tail > 0.0 and au is not None:
            keep = CUT_TAIL_KEEP if nxt is not None else END_KEEP
            new_en = round(min(en, au.sound_end(en - tail, soft=au.soft_in(en - tail, en)) + keep), 3)
            if en - new_en >= 0.03 and new_en - st >= MIN_PIECE:
                note(sid, new_en, en)
                s["end"] = new_en
                s["quiet_end"] = True
                s.pop("hard_hi", None)
                cut.append("duoi %.2fs" % (en - new_en))
        if nau is not None and head > 0.0:
            nst, nen = float(nxt["start"]), float(nxt["end"])
            new_st = round(max(nst, nau.sound_start(nst + head, soft=nau.soft_in(nst, nst + head)) - CUT_HEAD_KEEP), 3)
            if new_st - nst >= 0.03 and nen - new_st >= MIN_PIECE:
                note(nxt.get("source_id"), nst, new_st)
                nxt["start"] = new_st
                nxt["quiet_start"] = True
                nxt.pop("hard_lo", None)
                cut.append("dau doan sau %.2fs" % (new_st - nst))
        if cut and changes is not None:
            changes.append("%s%d: siet khoang nghi %s %.2fs -> cat %s" % (
                label, i, "o cho noi" if nxt is not None else "cuoi video", tail + head, ", ".join(cut)))
    # dau video (doan dau tien)
    if body and au_of.get(id(body[0])) is not None:
        s0, au = body[0], au_of[id(body[0])]
        st0 = float(s0["start"])
        q1 = au.quiet_end(st0 + 0.02)
        w0 = _spoken(words, s0.get("source_id"), st0, float(s0["end"]))
        if q1 is not None and w0:
            q1 = min(q1, w0[0][2] - 0.05)
        if q1 is not None and q1 - st0 > max_pause:
            new_st = round(max(st0, au.sound_start(q1, soft=au.soft_in(st0, q1)) - CUT_HEAD_KEEP), 3)
            if new_st - st0 >= 0.03 and float(s0["end"]) - new_st >= MIN_PIECE:
                if changes is not None:
                    changes.append("%s0: bo %.2fs lang dau video" % (label, new_st - st0))
                note(s0.get("source_id"), st0, new_st)
                s0["start"] = new_st
                s0["quiet_start"] = True
                s0.pop("hard_lo", None)
    # 2) khoang lang GIUA doan (theo thu tu timeline: manh dau / cuoi qua ngan duoc GOP vao doan ben canh noi lien
    #    trong nguon — chuan_hoa_segments bo moi doan < 0.2s, tach rieng la MAT duoi am; do that 2026-10-01)
    def lien(a, b):
        return (a.get("source_id") == b.get("source_id") and abs(float(a["end"]) - float(b["start"])) < CONTIG
                and abs(float(a.get("speed", 1) or 1) - float(b.get("speed", 1) or 1)) < 1e-6)
    res = {}
    for i, s in enumerate(body):
        au = au_of.get(id(s))
        if au is None:
            continue
        st, en = float(s["start"]), float(s["end"])
        prv = body[i - 1] if i > 0 and lien(body[i - 1], s) else None
        nxt = body[i + 1] if i + 1 < len(body) and lien(s, body[i + 1]) else None
        acc = _split_middle(s, au, _spoken(words, s.get("source_id"), st, en), max_pause, prv is not None, nxt is not None)
        if not acc:
            continue
        for lo, hi in acc:
            note(s.get("source_id"), lo, hi)
        if prv is not None and acc[0][0] - st < MIN_PIECE:
            last = (res.get(id(prv)) or [prv])[-1]           # manh dau ngan -> noi vao cuoi doan truoc
            last["end"], last["quiet_end"] = acc[0][0], True
            last.pop("hard_hi", None)
            s["start"], s["quiet_start"] = acc[0][1], True
            s.pop("hard_lo", None)
            acc = acc[1:]
        if nxt is not None and acc and en - acc[-1][1] < MIN_PIECE:
            nxt["start"], nxt["quiet_start"] = acc[-1][1], True   # manh cuoi ngan -> doan sau bat dau som hon
            nxt.pop("hard_lo", None)
            s["end"], s["quiet_end"] = acc[-1][0], True
            s.pop("hard_hi", None)
            acc = acc[:-1]
        res[id(s)] = _pieces(s, acc) if acc else [s]
        if changes is not None:
            changes.append("%s %.2f-%.2f: siet khoang nghi giua doan (%s)" % (
                label, st, en, ", ".join("%.2fs@%.2f" % (hi - lo, lo) for lo, hi in
                                          [x for x in au.quiet_runs(st + 0.1, en - 0.1, max_pause)])))
    out = []
    for s in segs:
        out.extend(res.get(id(s)) or [s])
    return out


def split_quiet(plan, seg, max_pause, changes=None, label="hook"):
    """Mot doan dung RIENG (ban sao hook o dau video): khoang lang that > max_pause ben trong -> tach thanh
    nhieu manh lien tiep (cung kind). Tra [manh...] (it nhat 1)."""
    sid = seg.get("source_id")
    words = words_by_source(plan)
    st, en = float(seg["start"]), float(seg["end"])
    sw = _spoken(words, sid, st, en)
    if not sw or not max_pause:
        return [seg]
    au = _audio_for(plan, sid, {})
    if au.thr is None:
        return [seg]
    acc = _split_middle(seg, au, sw, max_pause)
    if not acc:
        return [seg]
    if changes is not None:
        changes.append("%s %.2f-%.2f: siet %d khoang nghi (%s)" % (
            label, st, en, len(acc), ", ".join("%.2fs@%.2f" % (hi - lo, lo) for lo, hi in acc)))
    return _pieces(seg, acc)


# ----------------------------------------------------------------------------
# NOI LAP LIEN KE: vap roi noi lai ngay ("cái này... cái này là") -> bo lan dau
# ----------------------------------------------------------------------------
RESTART_MIN, RESTART_MAX = 2, 8      # cum lap 2-8 chu (1 chu 'rất rất' co the la nhan manh -> giu)
RESTART_GAP = 0.15                   # giua lan dau va lan noi lai phai co khoang lang that >= 0.15s (vap)
RESTART_SPAN = 6.0


def _restart_at(sw, toks, au, i, st):
    """Lan noi lai bat dau o chu i? Tra (cat_tu, cat_den, k, cum) hoac None. Chi khi CA HAI diem cat roi vao
    khoang lang that (khong mat tieng)."""
    for k in range(RESTART_MAX, RESTART_MIN - 1, -1):
        A = toks[i:i + k]
        if len(A) < k or not all(A) or sum(len(x) for x in A) < 6 or all(x in _EDGE_FILL for x in A):
            continue
        j = i + k
        while j < len(toks) and j - (i + k) < 2 and toks[j] in _EDGE_FILL:
            j += 1                                          # 'cái này ờ cái này'
        B = toks[j:j + k]
        if len(B) < k or not all(_tok_eq(x, y) for x, y in zip(A, B)):
            continue
        a0, b0 = sw[i][1], sw[j][1]
        if b0 - a0 > RESTART_SPAN:
            continue
        gap = [r for r in au.quiet_runs(sw[i + k - 1][1], b0 + 0.1, RESTART_GAP) if r[1] >= b0 - 0.15]
        if not gap:
            continue                                        # noi lien khong ngap ngung = nhan manh co chu y
        hi = round(au.sound_start(gap[-1][1]) - CUT_HEAD_KEEP, 3)
        if a0 - st < 0.15:
            lo = st                                         # lan dau nam ngay dau doan -> chi cat dau doan
        else:
            pre = [r for r in au.quiet_runs(max(st, a0 - 0.6), a0 + 0.1, 0.06) if r[1] >= a0 - 0.15]
            if not pre:
                continue                                    # truoc lan dau dang noi lien -> cat se mat tieng
            lo = round(au.sound_end(pre[-1][0]) + CUT_TAIL_KEEP, 3)
        if hi - lo >= 0.2:
            return lo, hi, j - i, " ".join(w[0] for w in sw[i:i + k])
    return None


def cut_restarts(plan, segs, changes=None, label="seg", removed=None):
    """Nguoi noi VAP roi noi lai ngay cung cum 2-8 chu (co ngap ngung >= 0.15s o giua) -> bo lan dau, giu lan
    noi lai. Diem cat nam trong khoang lang that o ca hai dau (do bang am thanh) -> khong mat tieng. Cau lap xa
    hon / dai hon do B1 + `providers.bo_lap_trong_video` lo."""
    words = words_by_source(plan)
    if not words or not segs:
        return segs
    audios, out = {}, []
    for s in segs:
        if not isinstance(s, dict) or s.get("kind") in ("insert", "hook") or not words.get(s.get("source_id")):
            out.append(s)
            continue
        sid = s.get("source_id")
        st, en = float(s["start"]), float(s["end"])
        sw = [w for w in words[sid] if w[1] >= st - 0.02 and w[2] <= en + 0.05]
        try:
            au = _audio_for(plan, sid, audios)
        except Exception:
            au = None
        if au is None or au.thr is None or len(sw) < 2 * RESTART_MIN:
            out.append(s)
            continue
        toks = [" ".join(_norm(w[0])) for w in sw]
        acc, i, left = [], 0, st
        while i < len(sw):
            hit = _restart_at(sw, toks, au, i, st)
            if hit and (hit[0] == st or hit[0] - left >= MIN_PIECE) and en - hit[1] >= MIN_PIECE:
                acc.append(hit)
                left = hit[1]
                i += hit[2]
            else:
                i += 1
        if not acc:
            out.append(s)
            continue
        cur = dict(s)
        if acc[0][0] <= st + 1e-6:                          # lan dau o ngay dau doan -> chi doi dau doan
            lo, hi, _k, txt = acc.pop(0)
            cur["start"], cur["quiet_start"] = hi, True
            cur.pop("hard_lo", None)
            if removed is not None:
                removed.append((sid, st, hi))
            if changes is not None:
                changes.append("%s %.2f-%.2f: bo lan noi vap '%s' (%.2fs) o dau doan" % (label, st, en, txt, hi - st))
        pieces = _pieces(cur, [(lo, hi) for lo, hi, _k, _t in acc]) if acc else [cur]
        for lo, hi, _k, txt in acc:
            if removed is not None:
                removed.append((sid, lo, hi))
            if changes is not None:
                changes.append("%s %.2f-%.2f: bo lan noi vap '%s' %.2f-%.2f" % (label, st, en, txt, lo, hi))
        out.extend(pieces)
    return out


def follow_removed(plan, removed, changes=None):
    """Moc DIEM (meme chen, SFX) nam trong khoang vua bi cat bo -> dat o mep cat (cho noi tren timeline)."""
    if not removed:
        return plan
    for key in ("inserts", "audio"):
        for n, it in enumerate(plan.get(key) or []):
            if not isinstance(it, dict) or it.get("src_time") is None or (it.get("role") or "") == "bgm":
                continue
            try:
                t = float(it["src_time"])
            except (TypeError, ValueError):
                continue
            for sid, a, b in removed:
                if (not it.get("source_id") or it.get("source_id") == sid) and a + 1e-3 < t < b - 1e-3:
                    it["src_time"] = round(a, 3)
                    if changes is not None:
                        changes.append("%s%d: moc %.2f nam trong khoang da cat -> mep cat %.2f" % (key, n, t, a))
                    break
    return plan


def quiet_point(plan, sid, t, reach=0.8):
    """Diem nam TRONG khoang lang that gan `t` nhat — de cat ngang chen meme: dang co tieng -> uu tien cho tieng
    TAT ngay sau (chu dang noi duoc noi het), khong thi khoang lang ngay truoc; duoi am giu tron (nguong mem).
    Da o trong lang (sau duoi am) -> giu nguyen `t` (on dinh). Khong co lang trong `reach` -> None."""
    au = _audio_for(plan, sid, {})
    if au.thr is None:
        return None
    q0 = au.quiet_start(t)
    if q0 is not None:
        q1 = au.quiet_end(t)
        lo = min(au.sound_end(q0) + CUT_TAIL_KEEP, (q0 + q1) / 2.0)
        return round(t if t >= lo - 1e-3 else lo, 3)
    cands = []
    after = au.quiet_runs(t, t + reach, 0.08)
    if after:
        cands.append((after[0][0] - t, after[0]))
    before = au.quiet_runs(max(0.0, t - reach), t, 0.08)
    if before:
        cands.append((t - before[-1][1], before[-1]))
    if not cands:
        return None
    a, b = min(cands)[1]
    return round(min(au.sound_end(a) + CUT_TAIL_KEEP, (a + b) / 2.0), 3)


# ----------------------------------------------------------------------------
# KIEM LAI tren timeline (sau moi buoc cat)
# ----------------------------------------------------------------------------
def _edge_kind(ws, t, side):
    """Mep cat tai `t` dang co tieng: 'giua_chu' (nam TRONG chu Whisper) | 'noi_lien' (ranh gioi hai chu noi lien
    khong co khoang lang — cat o cho nho tieng nhat la tot nhat co the, chu duoc giu van tron) | 'duoi_am' (tieng
    keo dai sau chu cuoi / truoc chu dau ma Whisper khong tinh vao chu: duoi am, hoi xuong giong -> phai giu)."""
    if any(w[1] + 0.05 < t < w[2] - 0.05 for w in ws):
        return "giua_chu"
    if side == "end":
        prv = [w for w in ws if w[2] <= t + 0.05]
        nxt = [w for w in ws if w[1] >= t - 0.05]
        if prv and nxt and t - prv[-1][2] <= 0.08 and nxt[0][1] - t <= 0.1:
            return "noi_lien"
    else:
        prv = [w for w in ws if w[2] <= t + 0.05]
        nxt = [w for w in ws if w[1] >= t - 0.05]
        if prv and nxt and nxt[0][1] - t <= 0.08 and t - prv[-1][2] <= 0.1:
            return "noi_lien"
    return "duoi_am"


def _tail_end(au, t, limit=0.35):
    """Duoi am dang keo o `t` -> gio cat sau khi tieng tat (nguong mem; nen nhac / on lam nguong mem khong toi
    duoc thi lay khoang lang theo nguong chinh) + dem. None neu tieng van con qua `limit`."""
    e = au.sound_end(t, limit)
    if e < t + limit - 1e-6:
        return round(e + CUT_TAIL_KEEP, 3)
    runs = au.quiet_runs(t, t + limit, 0.04)
    return round(runs[0][0] + CUT_TAIL_KEEP, 3) if runs else None


def audit_cuts(plan, segs, max_pause, changes=None, fix=True, label="seg"):
    """KIEM LAI timeline (theo thu tu target_start, gom hook): (1) khoang lang nguoi xem nghe thay > max_pause
    (+ AUDIT_TOL), (2) mep cat roi vao TIENG (cat cut duoi am / vao giua tieng). fix=True: mep cat roi vao duoi am
    -> keo toi khi tieng tat han / lui ve dau am (chi khi khong chen them chu khac, khong de len doan nguon khac).
    Tra {"im_lang": [...], "cat_vao_tieng": [...], "da_sua": n} (moi muc la chuoi mo ta, gio timeline)."""
    rep = {"im_lang": [], "cat_vao_tieng": [], "da_sua": 0}
    words = words_by_source(plan)
    if not words or not segs:
        return rep
    srcs = {sv.get("id") for sv in plan.get("source_videos") or [] if isinstance(sv, dict)}
    audios = {}
    order = sorted([s for s in segs if isinstance(s, dict)], key=lambda s: float(s.get("target_start") or 0))

    def au_of(s):
        sid = s.get("source_id")
        if s.get("kind") == "insert" or sid not in srcs or not words.get(sid):
            return None
        try:
            au = _audio_for(plan, sid, audios)
        except Exception:
            return None
        return au if au.thr is not None else None

    def same(a, b):
        return (b is not None and b.get("kind") != "insert" and a.get("source_id") == b.get("source_id")
                and abs(float(a.get("speed", 1) or 1) - float(b.get("speed", 1) or 1)) < 1e-6)

    def tl(s, t):
        return float(s.get("target_start") or 0) + (t - float(s["start"])) / float(s.get("speed", 1.0) or 1.0)

    body = [s for s in order if s.get("kind") not in ("insert", "hook")]
    for i, s in enumerate(order):
        au = au_of(s)
        if au is None:
            continue
        sid, ws = s.get("source_id"), words.get(s.get("source_id")) or []
        st, en = float(s["start"]), float(s["end"])
        prv = order[i - 1] if i > 0 else None
        nxt = order[i + 1] if i + 1 < len(order) else None
        c_prev = same(s, prv) and abs(float(prv["end"]) - st) < CONTIG
        c_next = same(s, nxt) and abs(en - float(nxt["start"])) < CONTIG
        others = [o for o in body if o is not s and o.get("source_id") == sid] if s.get("kind") != "hook" else []
        # doan nguon DANG DUNG o cho khac: chan cung (tranh lap tieng). hard_hi / hard_lo (phan B1 da bo): duoi am cua
        # chu cuoi duoc vuot TAIL_PAST_HARD (do that 2026-10-01: 'Shigen' keu toi 55.17, doan bi chan o hard_hi 55.03
        # -> mat 0.14s cuoi chu); vuot nhieu hon se lay tieng cua phan da bo (tieng 'ờ' sau 38.15).
        lim_hi = min([float(o["start"]) for o in others if float(o["start"]) >= en - 1e-3] or [float("inf")])
        lim_lo = max([float(o["end"]) for o in others if float(o["end"]) <= st + 1e-3] or [0.0])
        if s.get("hard_hi") is not None:          # duoc vuot it thoi (duoi am), khong toi tieng cua phan da bo
            lim_hi = min(lim_hi, max(en, float(s["hard_hi"])) + TAIL_PAST_HARD)
        if s.get("hard_lo") is not None:
            lim_lo = max(lim_lo, min(st, float(s["hard_lo"])) - TAIL_PAST_HARD)
        # (2a) cuoi doan cat vao tieng
        if not c_next and au.loud_at(en - 0.025, en - 0.005):    # cat dung chuan = het tieng + 30ms -> 25ms cuoi lang
            kind_, new = _edge_kind(ws, en, "end"), None
            if kind_ == "duoi_am":
                new = _tail_end(au, en)
                chen = [w for w in ws if en + 0.02 < w[1] < new] if new is not None else True
                if fix and new is not None and not chen and new <= lim_hi + 1e-3:
                    s["end"], s["quiet_end"] = new, True
                    rep["da_sua"] += 1
                    if changes is not None:
                        changes.append("%s %.2f: kiem lai — cuoi doan cat vao duoi am -> keo toi %.2f (tieng tat han)"
                                       % (label, en, new))
                    en = new
                    kind_ = None
            if kind_ in ("giua_chu", "duoi_am"):
                rep["cat_vao_tieng"].append("%.2fs: cuối đoạn nguồn %.2fs %s" % (
                    tl(s, en), en, "cắt giữa chữ" if kind_ == "giua_chu" else "còn tiếng"))
        # (2b) dau doan vao giua tieng
        if not c_prev and st >= 0.05 and au.loud_at(st - 0.04, st - 0.005) and au.loud_at(st, st + 0.03):
            kind_ = _edge_kind(ws, st, "start")
            if kind_ == "duoi_am":
                new = round(au.sound_start(st, 0.25) - CUT_HEAD_KEEP, 3)
                chen = [w for w in ws if new < w[2] < st - 0.05]
                if fix and not chen and st - new <= 0.31 and new >= lim_lo - 1e-3 and new >= 0:
                    s["start"], s["quiet_start"] = new, True
                    rep["da_sua"] += 1
                    if changes is not None:
                        changes.append("%s %.2f: kiem lai — dau doan vao giua tieng -> lui ve %.2f (dau am)" % (label, st, new))
                    st = new
                    kind_ = None
            if kind_ in ("giua_chu", "duoi_am"):
                rep["cat_vao_tieng"].append("%.2fs: đầu đoạn nguồn %.2fs %s" % (
                    tl(s, st), st, "cắt giữa chữ" if kind_ == "giua_chu" else "vào giữa tiếng"))
        # (1) lang nghe thay: giua doan
        for a, b in au.quiet_runs(st + 0.05, en - 0.05, max_pause + AUDIT_TOL):
            if au.has_sound(st, a - 0.01) and au.has_sound(b + 0.01, en):
                rep["im_lang"].append("%.2fs: lặng %.2fs giữa đoạn (nguồn %.2f)" % (tl(s, a), b - a, a))
        # (1) lang nghe thay: cho noi sang doan sau (duoi + dau)
        q0 = au.quiet_start(en - 0.02)
        tail = (en - max(st, q0)) if q0 is not None else 0.0
        head = 0.0
        nau = au_of(nxt) if nxt is not None else None
        if nau is not None:
            q1 = nau.quiet_end(float(nxt["start"]) + 0.02)
            head = max(0.0, min(float(nxt["end"]), q1) - float(nxt["start"])) if q1 is not None else 0.0
        lim = max_pause if nxt is not None else END_KEEP
        if tail + head > lim + AUDIT_TOL and (tail > 0.05 or head > 0.05):
            rep["im_lang"].append("%.2fs: lặng %.2fs %s" % (tl(s, en) - tail, tail + head,
                                                           "ở chỗ nối hai đoạn" if nxt is not None else "cuối video"))
    return rep


def follow_anchors(plan, moves, changes=None):
    """Moc DIEM (meme chen, SFX) nam o phan mep doan vua bi cat bot -> dich theo mep moi. Khong thi
    moc roi ra ngoai timeline: SFX bi bo, meme bi bo / chen nham cho (do that: meme neo 109.68 = cuoi
    doan, doan con 109.66 -> meme nhay len dau video)."""
    if not moves:
        return plan
    segs = [s for s in plan.get("segments") or [] if isinstance(s, dict) and s.get("kind") != "insert"]

    def covered(sid, t):
        return any((not sid or s.get("source_id") in (None, sid))
                   and float(s.get("start", 0)) - 1e-3 <= t <= float(s.get("end", 0)) + 1e-3 for s in segs)

    for key in ("inserts", "audio"):
        for n, it in enumerate(plan.get(key) or []):
            if not isinstance(it, dict) or it.get("src_time") is None or (it.get("role") or "") == "bgm":
                continue
            try:
                t = float(it["src_time"])
            except (TypeError, ValueError):
                continue
            sid = it.get("source_id")
            if covered(sid, t):
                continue
            for msid, st, en, nst, nen in moves:
                if sid and msid != sid:
                    continue
                if nen < en and nen < t <= en + 0.05:
                    new = nen
                elif nst > st and st - 0.05 <= t < nst:
                    new = nst
                else:
                    continue
                it["src_time"] = round(new, 3)
                if changes is not None:
                    changes.append("%s%d: moc %.2f o mep doan vua chinh -> %.2f" % (key, n, t, new))
                break
    return plan


def fix_range(plan, sid, st, en, min_len=None, max_len=None):
    """Khoang nguon [st, en] phat roi NHAY sang doan khac (vd hook) -> vao/ra o cho ngat cau."""
    ws = words_by_source(plan).get(sid)
    if not ws:
        return st, en
    au = _audio_for(plan, sid, {})
    new_st, _ = safe_start(ws, au, st, 0.0, en)
    hi = (new_st + max_len) if max_len else float("inf")
    new_en, _ = safe_end(ws, au, en, hi, new_st)
    if min_len and new_en - new_st < min_len:
        return st, en
    return round(new_st, 3), round(new_en, 3)


# ----------------------------------------------------------------------------
# Lop chu khop loi noi
# ----------------------------------------------------------------------------
_STOP = {"va", "la", "cua", "cho", "trong", "tren", "duoc", "cac", "mot", "nhung", "thi", "ma", "de",
         "voi", "nay", "do", "co", "khong", "cai", "nhe", "nha", "a", "o", "ra", "vao", "rat"}
_FILL = _STOP | {"no", "u", "um", "oi", "ay", "ha", "ne"}   # chu dem hay chen giua cum khi noi


def _norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("đ", "d")
    return re.findall(r"[a-z0-9]+", s)


def _layer_text(L):
    parts = [L.get("text") or ""]
    for sp in L.get("spans") or []:
        if isinstance(sp, dict):
            parts.append(sp.get("text") or "")
    for k in ("label", "value"):
        if L.get(k) is not None:
            parts.append(str(L[k]))
    return " ".join(" ".join(parts).split())


def _layer_primary(L):
    """Phan chu CHINH cua lop (chu to): text, hoac span dau tien co chu. Vd 'GIAI PHAP' cua
    'GIAI PHAP / tren trinh duyet' — phan phu thuong la loi dien giai, khong noi nguyen van."""
    if (L.get("text") or "").strip():
        return L["text"]
    for sp in L.get("spans") or []:
        if isinstance(sp, dict) and (sp.get("text") or "").strip():
            return sp["text"]
    for k in ("label", "value"):
        if L.get(k) is not None and str(L[k]).strip():
            return str(L[k])
    return ""


def _tok_eq(a, b):
    """Hai chu (da bo dau) coi la mot: giong nhau, hoac gan giong (Whisper nghe 'repo' -> 'rebo')."""
    if a == b:
        return True
    if min(len(a), len(b)) < 3:
        return False
    if a.startswith(b) or b.startswith(a):
        return True
    import difflib
    return difflib.SequenceMatcher(None, a, b).ratio() >= 0.75


FAR_PEN = 0.25            # so cac cho khop: moi giay lech (sau 0.5s dau) tru 0.25 diem -> cho GAN gio AI thang
FAR_SHIFT = 1.5           # khong co cau phu de lam moc: doi > 1.5s chi khi khop CHAC (>= 2 chu khoa, du het)
LINE_PAD = 0.8            # tim tieng noi trong cau chua cum chu +- 0.8s (gio cau Gemini lech Whisper ~0.3-0.5s)
MIN_VAL = 0.25            # diem sau khi phat do xa < 0.25 -> bo (vd som hon gio AI > ~1.2s, muon hon > ~3.5s)


def _key_of(toks):
    """(chu khoa, khop_nguyen_cum). Cum ngan chi con <= 1 chu khoa sau khi bo chu phu ('minh la' ->
    'minh'): mot chu thuong gap nhu the khop o dau cung duoc -> phai khop NGUYEN CUM, lien nhau."""
    key = [t for t in toks if t not in _STOP]
    return (key or toks), (len(key) < 2 and len(toks) >= 2)


def _score_at(win, toks, key, whole):
    """Diem khop cum `toks` bat dau tu chu dau cua `win` (0..1) hoac None."""
    if not win or not any(_tok_eq(win[0], t) for t in toks):
        return None
    if whole:
        # nguyen cum, theo thu tu; loi noi duoc chen toi da 2 chu dem ('rat LA quan trong' = 'RAT QUAN TRONG')
        i, skips = 0, 0
        for t in toks:
            while i < len(win) and not _tok_eq(win[i], t):
                if i == 0 or skips >= 2 or win[i] not in _FILL:
                    return None
                i, skips = i + 1, skips + 1
            if i >= len(win):
                return None
            i += 1
        return 1.0
    pos, hit = 0, 0
    for t in key:
        k = next((i for i in range(pos, len(win)) if _tok_eq(win[i], t)), None)
        if k is not None:
            pos, hit = k + 1, hit + 1
    score = hit / float(len(key))
    return score if score >= 0.6 else None


def _cost(t, anchor):
    # AI hay dat lop som, hiem khi muon -> phat nang cho nam TRUOC anchor
    if anchor is None:
        return 0.0
    return (anchor - t) * 3.0 if t < anchor else (t - anchor)


def _match(ws, toks, a, b, anchor=None):
    """Cho khop noi dung lop (toks) trong [a, b] (gio nguon): (chi so chu dau, diem) hoac None.
    Diem = ti le chu khoa cua lop tim thay THEO THU TU ngay sau chu dau; >= 0.6 moi nhan; cum ngan
    phai khop nguyen cum. Chon cho diem cao nhung phat theo do xa `anchor` (gio AI dat): cho khop du
    hon o XA (vd lan noi lai sau 3s) khong thang cho khop vua du ngay tai gio AI dat. Cung diem -> gan
    anchor nhat (chay lai sau khi da doi van chon dung chu cu -> ket qua on dinh)."""
    if not toks:
        return None
    key, whole = _key_of(toks)
    best = None
    for j, w in enumerate(ws):
        if not (a <= w[1] <= b):
            continue
        win = [t for x in ws[j:j + len(toks) + 3] for t in _norm(x[0])]
        score = _score_at(win, toks, key, whole)
        if score is None:
            continue
        cost = _cost(w[1], anchor)
        val = score - FAR_PEN * max(0.0, cost - 0.5)
        if val < MIN_VAL:
            continue
        if best is None or val > best[0] + 1e-9 or (abs(val - best[0]) <= 1e-9 and cost < best[1]):
            best = (val, cost, j, score)
    return (best[2], best[3]) if best else None


def _caption_lines(plan, sid):
    """Cau phu de (loi dung do Gemini chep, gio CAU) cua nguon `sid`: [(chu, dau, cuoi)]."""
    out = []
    for c in plan.get("captions") or []:
        if not isinstance(c, dict) or c.get("src_start") is None:
            continue
        if c.get("source_id") and c.get("source_id") != sid:
            continue
        a = float(c["src_start"])
        out.append((_norm(c.get("text") or ""), a, float(c.get("src_end") or a + 1.5)))
    return out


def _line_for(lines, toks, anchor):
    """Cau phu de CHUA cum chu cua lop, gan gio AI dat nhat -> (dau, cuoi) hoac None. Dung lam MOC:
    tieng noi cua lop phai nam trong cau do (khong nhay sang cau khac co cung chu, vd Whisper bo sot
    cau 'minh la Mr Vi Coding' -> chu 'minh' cua cau sau)."""
    key, whole = _key_of(toks)
    best = None
    for lt, s, e in lines or []:
        sc = max((x for x in (_score_at(lt[i:i + len(toks) + 3], toks, key, whole) for i in range(len(lt)))
                  if x is not None), default=None)
        if sc is None:
            continue
        dist = 0.0 if s - 0.3 <= anchor <= e + 0.3 else min(abs(anchor - s), abs(anchor - e))
        if dist > FAR_SHIFT:
            continue                                      # gio AI dat lay tu chinh cac cau nay -> cau xa la cau khac
        val = sc - FAR_PEN * 2 * dist
        if best is None or val > best[0] + 1e-9:
            best = (val, s, e)
    return (best[1], best[2]) if best else None


def _caption_words(plan, sid, rows):
    """Chu cua PHU DE (loi dung do Gemini chep) kem moc gio nguon theo Whisper — khop lop chu duoc ca
    khi Whisper nghe sai ('khoa nick' -> 'chronic.'). [(chu, s, e)] sap theo gio."""
    try:
        import speech_align
    except ImportError:
        return []
    out = []
    for c in plan.get("captions") or []:
        if not isinstance(c, dict) or c.get("src_start") is None:
            continue
        if c.get("source_id") and c.get("source_id") != sid:
            continue
        a = float(c["src_start"])
        b = float(c.get("src_end") or a + 1.5)
        try:
            wt = speech_align.caption_word_times(c.get("text") or "", rows, a, b)
        except Exception:
            wt = None
        for t, s_, e_ in wt or []:
            out.append((t, float(s_), float(e_)))
    out.sort(key=lambda x: x[1])
    return out


def _covered(plan, sid, t):
    for s in plan.get("segments") or []:
        if s.get("kind") == "insert" or (s.get("source_id") and s.get("source_id") != sid):
            continue
        if float(s.get("start", 0)) - 1e-3 <= t < float(s.get("end", 0)):
            return True
    hook = plan.get("hook") if isinstance(plan.get("hook"), dict) else None
    if hook and hook.get("src_start") is not None and (hook.get("source_id") in (None, sid)):
        if float(hook["src_start"]) - 1e-3 <= t < float(hook.get("src_end") or hook["src_start"]):
            return True
    return False


def snap_layers(plan, changes=None):
    """Lop chu co neo gio nguon -> hien ngay truoc khi tu cua no duoc noi. Hinh cung nhom doi theo."""
    words = words_by_source(plan)
    layers = plan.get("layers") or []
    if not words or not layers:
        return plan
    first_src = next(iter(words)) if len(words) == 1 else None
    raw = plan.get("asr_words") or {}
    capw = {sid: _caption_words(plan, sid, raw.get(sid) or []) for sid in words}
    lines = {sid: _caption_lines(plan, sid) for sid in words}
    deltas, group_delta = {}, {}
    # thu tu CO DINH theo plan (khong theo gio): chay lai sau khi da doi van chon cung lop chinh cua nhom
    for i in range(len(layers)):
        L = layers[i]
        if not isinstance(L, dict) or L.get("src_start") is None:
            continue
        sid = L.get("source_id") or first_src
        toks = _norm(_layer_primary(L))
        if not words.get(sid) or not toks:
            continue
        a = float(L["src_start"])
        b = float(L.get("src_end") or a + 2.0)
        anchor = a + LAYER_LEAD
        # cau (loi Gemini) chua cum chu -> chi tim tieng noi trong cau do; khong co -> quanh gio AI dat
        line = _line_for(lines.get(sid), toks, anchor)
        lo, hi = (line[0] - LINE_PAD, line[1] + LINE_PAD) if line else (a - 0.6, max(b, a + 1.0) + 1.0)
        key = _key_of(toks)[0]
        t_word, score = None, 0.0
        # Whisper truoc (moc chinh xac); Whisper nghe sai chu (vd 'khoa nick' -> 'chronic.') moi dung
        # chu phu de (loi dung, moc noi suy tu Whisper)
        for ws in (words[sid], capw.get(sid) or []):
            m = _match(ws, toks, lo, hi, anchor=anchor)
            if m is None or not _covered(plan, sid, ws[m[0]][1]):
                continue
            # khong co cau lam moc: doi xa chi khi khop chac (vd 'minh' le loi o cau khac: KHONG doi)
            if not line and abs(ws[m[0]][1] - anchor) > FAR_SHIFT and (len(key) < 2 or m[1] < 0.99):
                continue
            t_word, score = ws[m[0]][1], m[1]
            break
        if t_word is None:
            continue
        new_a = max(0.0, t_word - LAYER_LEAD)
        d = new_a - a
        if abs(d) < 0.08:
            deltas[i] = 0.0
        else:
            deltas[i] = d
        if L.get("group"):
            group_delta.setdefault(L["group"], []).append((a, (1 if line else 0, score * len(key)), deltas[i]))
    moved = []                                    # (source, gio nguon CU, do doi, la lop cua hook)
    for i, L in enumerate(layers):
        if not isinstance(L, dict) or L.get("src_start") is None:
            continue
        d = deltas.get(i)
        if d is None and L.get("group") in group_delta:
            # hinh / chu khong khop duoc: doi theo lop khop duoc GAN no nhat trong nhom (hinh dat ngay sau
            # chu 'BROWSER' la hinh cua chu do); gan bang nhau -> lop khop chac hon (co cau lam moc...)
            a0 = float(L["src_start"])
            d = min(group_delta[L["group"]], key=lambda m: (round(abs(m[0] - a0), 2), tuple(-x for x in m[1])))[2]
        if not d:
            continue
        a = float(L["src_start"])
        b = float(L.get("src_end") or a + 2.0)
        L["src_start"] = round(a + d, 3)
        L["src_end"] = round(max(b + d, a + d + 0.6), 3)
        moved.append((L.get("source_id") or first_src, a, d, L.get("anchor") == "hook"))
        if changes is not None:
            changes.append("layer%d %r: hien khop loi noi %.2f -> %.2f (gio nguon, %+.2fs)"
                           % (i, _layer_text(L)[:24], a, a + d, d))
    # SFX rieng cua plan (B7) dat DUNG luc mot lop hien ("ding dung luc chu hero xuat hien") -> doi theo
    # lop do. Chi SFX trung gio bat dau CU cua lop (<= 0.15s); SFX bam loi noi / cuoi cau giu nguyen.
    for n, au in enumerate(plan.get("audio") or []):
        if not isinstance(au, dict) or au.get("src_time") is None or (au.get("role") or "sfx") == "bgm":
            continue
        try:
            t = float(au["src_time"])
        except (TypeError, ValueError):
            continue
        sid = au.get("source_id") or first_src
        # SFX cua HOOK (ban sao o dau video) chi doi theo lop cua hook, va khong ra ngoai khoang hook:
        # truoc day tieng dam mo hook doi theo lop chu cua THAN video (cung gio nguon) ra truoc
        # hook.src_start -> roi khoi hook, nhay xuong than video -> hook mat am thanh
        is_hook = au.get("anchor") == "hook"
        hit = min(((abs(t - a), d) for s_, a, d, hk in moved if s_ == sid and hk == is_hook and abs(t - a) <= 0.15),
                  default=None)
        if hit is None:
            continue
        nt = t + hit[1]
        hook = plan.get("hook") if isinstance(plan.get("hook"), dict) else None
        if is_hook and hook and hook.get("src_start") is not None:
            h0 = float(hook["src_start"])
            h1 = float(hook.get("src_end") or h0)
            nt = min(max(nt, h0), max(h0, h1 - 0.05))
        if abs(nt - t) < 0.005:
            continue
        au["src_time"] = round(nt, 3)
        if changes is not None:
            changes.append("audio%d %s: doi theo lop chu %.2f -> %.2f (gio nguon)" % (n, au.get("sfx_id"), t, nt))
    return plan


# ----------------------------------------------------------------------------
# DO TO KHI PHAT (LUFS momentary) — can SFX theo GIONG NOI cua chinh video (2026-10-01)
# ----------------------------------------------------------------------------
# User: "am thanh khi chu hien ra dang qua to, phai dong bo voi tang am thanh cua ca video (video tieng nho
# ma SFX lai to)". SFX truoc day can theo muc TUYET DOI (-9..-18 LUFS, gia dinh giong noi ~-12) + san volume
# 0.2 -> video thu am nho (giong -30) thi SFX to hon giong 15-20 dB. Gio do CA HAI bang cung mot thuoc:
# ebur128 momentary (cua so 400ms) tren tieng da DOI SANG STEREO (giong luc render: file mono phat ra 2 loa).
LOUD_HOP = 0.1
_loud_cache = {}


def loudness_series(path):
    """Mang do to MOMENTARY (LUFS) moi 0.1s cua am thanh file khi phat stereo, hoac None. Cache dia + RAM."""
    try:
        import numpy as np
    except ImportError:
        return None
    if not path or not os.path.isfile(path):
        return None
    try:
        key = _src_key(path) + "-m2"
    except OSError:
        return None
    with _lock:
        if key in _loud_cache:
            return _loud_cache[key]
    cp = os.path.join(CACHE_DIR, key + ".npy")
    arr = None
    if os.path.isfile(cp):
        try:
            arr = np.load(cp)
        except (OSError, ValueError):
            arr = None
    if arr is None:
        import remotion_plan
        try:
            r = subprocess.run([remotion_plan._ffbin("ffmpeg"), "-v", "error", "-i", path, "-vn", "-af",
                                # apad: SFX ngan hon cua so 400ms thi ebur128 khong ra so nao (do that: 'Pop SFX')
                                "aformat=sample_rates=48000:channel_layouts=stereo,apad=pad_dur=0.5,ebur128=metadata=1,"
                                "ametadata=mode=print:key=lavfi.r128.M:file=-", "-f", "null", "-"],
                               capture_output=True, text=True, timeout=600)
        except (OSError, subprocess.SubprocessError):
            return None
        vals = [float(x) for x in re.findall(r"lavfi\.r128\.M=(-?[\d.]+|-inf)", r.stdout or "") if x != "-inf"]
        if not vals:
            return None
        arr = np.array(vals, dtype=np.float32)
        try:
            os.makedirs(CACHE_DIR, exist_ok=True)
            np.save(cp, arr)
        except OSError:
            pass
    with _lock:
        _loud_cache[key] = arr
    return arr


def playback_lufs(path, t0=0.0, t1=None):
    """Muc to MANH NHAT (momentary max, LUFS) cua file trong [t0, t1] khi phat — thuoc do cua SFX / meme."""
    import numpy as np
    arr = loudness_series(path)
    if arr is None:
        return None
    i0 = max(0, int(t0 / LOUD_HOP))
    i1 = len(arr) if t1 is None else min(len(arr), int(np.ceil(t1 / LOUD_HOP)) + 4)   # cua so 400ms tre 4 khung
    v = arr[i0:i1]
    v = v[v > -70]
    return round(float(v.max()), 1) if v.size else None


def voice_level(plan):
    """Muc to GIONG / TIENG CHINH cua video (LUFS momentary): phan vi 90 cua cac khung CO TIENG trong nhung doan
    nguon thuc su duoc dung (than video + hook), nhan volume cua doan. None neu khong do duoc."""
    import numpy as np
    paths = _src_paths(plan)
    vals = []
    for s in plan.get("segments") or []:
        if not isinstance(s, dict) or s.get("kind") == "insert":
            continue
        arr = loudness_series(paths.get(s.get("source_id")))
        if arr is None:
            continue
        try:
            st, en = float(s["start"]), float(s["end"])
            vol = float(s.get("volume", 1.0) if s.get("volume") is not None else 1.0)
        except (KeyError, TypeError, ValueError):
            continue
        if vol <= 0.01 or en <= st:
            continue
        # M o khung k = cua so 400ms ket thuc o (k+1)*0.1 -> lay khung trong [st+0.3, en]
        v = arr[int((st + 0.3) / LOUD_HOP):int(en / LOUD_HOP) + 1]
        if v.size:
            vals.append(v + 20.0 * np.log10(min(1.0, vol)))
    if not vals:
        return None
    x = np.concatenate(vals)
    x = x[x > -60]
    if x.size < 10:
        return None
    x = x[x >= float(np.percentile(x, 95)) - 20.0]      # bo khoang lang / tieng nen
    return round(float(np.percentile(x, 90)), 1)
