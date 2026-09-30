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


def silence_threshold(db):
    """Nguong 'het tieng': nen on + 35% khoang dong (dB) giua nen on va tieng noi."""
    import numpy as np
    floor, loud = float(np.percentile(db, 10)), float(np.percentile(db, 90))
    return floor + 0.35 * max(6.0, loud - floor)


class Audio:
    """Do to cua 1 nguon + nguong lang. db=None -> chi dung moc chu Whisper.

    Do that: moc chu Whisper hay NUOT khoang lang (chu sau "bat dau" ngay khi chu truoc het du am
    thanh o giua im han -62 dB) va nguoc lai hai cau noi LIEN khong co lang ("luon. Cai") -> dung
    am thanh that de tim cho ngat va diem cat."""

    def __init__(self, db):
        self.db = db
        self.thr = silence_threshold(db) if db is not None and len(db) > 50 else None

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
            if a <= nxt_start + TAIL_OVER or not self.has_sound(nxt_start + TAIL_OVER, a):
                return min(q_hi, a + TAIL_KEEP)             # tieng tat -> cat ngay sau do 30ms
        return self.valley(lo, hi)                          # noi lien: cat o cho nho tieng nhat

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


PAUSE_KEEP = 0.08         # giu 80ms moi ben cho cat khoang nghi (hoi tho tu nhien, khong cut cut)
EDGE_KEEP_TAIL = 0.12     # sau chu cuoi truoc cho noi
EDGE_KEEP_HEAD = 0.06     # truoc chu dau sau cho noi
MIN_PIECE = 0.35          # manh doan ngan hon -> khong cat o do (giu khoang nghi)
_FAST = ("nhanh", "bắt trend", "trend", "vui", "năng lượng", "sôi động", "hài", "dồn dập", "hype", "gắt")
_SLOW = ("nhẹ nhàng", "tâm sự", "sâu lắng", "cảm động", "chậm", "thư giãn", "chữa lành", "thủ thỉ", "bình yên")


def pause_limit(story=None):
    """Khoang nghi dai nhat duoc GIU theo nhip video (yeu cau edit + tone): nhanh / vui / bat trend 0.30s,
    binh thuong 0.45s, nhe nhang / tam su 0.75s."""
    st = story or {}
    req = st.get("edit_request") if isinstance(st.get("edit_request"), dict) else {}
    txt = " ".join([str(st.get("tone") or "")] + [str(v) for v in req.values() if isinstance(v, str)]).lower()
    f, sl = sum(k in txt for k in _FAST), sum(k in txt for k in _SLOW)
    if sl > f:
        return 0.75
    if f > sl:
        return 0.30
    return 0.45


def tighten_pauses(plan, segs, max_pause, changes=None, label="seg"):
    """SIET KHOANG NGHI (than video): khoang lang THAT (do bang am thanh) dai hon `max_pause`
    - giua mot doan -> tach doan, bo khoang lang (giu PAUSE_KEEP moi ben); doan sau phong nhe +0.08 (jump-cut)
      de khong thay giat hinh;
    - o cho noi 2 doan tren timeline (duoi doan truoc + dau doan sau = khoang nguoi xem nghe thay) -> cat bot.
    Mep cat danh dau quiet_start / quiet_end -> cat an toan theo tieng noi (va build_spec chay lai) giu nguyen.
    Tra danh sach segment moi (target_start xep lai sau bang chuan_hoa_segments)."""
    if not segs or not max_pause:
        return segs
    words = words_by_source(plan)
    if not words:
        return segs
    audios = {}
    srcs = {sv.get("id") for sv in plan.get("source_videos") or [] if isinstance(sv, dict)}

    def spoken(sid, a, b):
        """Chu Whisper trong [a, b]: chi siet o doan CO LOI NOI (b-roll / nhac / quay man hinh khong loi: giu nguyen)."""
        return [w for w in words.get(sid) or [] if w[2] > a + 0.02 and w[1] < b - 0.02]
    body = [s for s in segs if isinstance(s, dict) and s.get("kind") not in ("insert", "hook")]
    body.sort(key=lambda s: float(s.get("target_start") or 0))
    au_of = {}
    for s in body:
        sid = s.get("source_id")
        if sid in srcs and spoken(sid, float(s["start"]), float(s["end"])):
            try:
                au_of[id(s)] = _audio_for(plan, sid, audios)
            except Exception:
                au_of[id(s)] = None
    # 1) cho noi giua 2 doan lien tiep tren timeline
    for i, s in enumerate(body):
        au = au_of.get(id(s))
        if au is None or au.thr is None:
            continue
        st, en = float(s["start"]), float(s["end"])
        sw = spoken(s.get("source_id"), st, en)
        q0 = au.quiet_start(en - 0.02)
        if q0 is not None and sw:
            q0 = max(q0, sw[-1][1] + 0.05)                    # khong cat vao chu cuoi (Whisper)
        tail = (en - max(st, q0)) if q0 is not None else 0.0
        nxt = body[i + 1] if i + 1 < len(body) else None
        head, nq1 = 0.0, None
        if nxt is not None and au_of.get(id(nxt)) is not None:
            nau = au_of[id(nxt)]
            nst, nen = float(nxt["start"]), float(nxt["end"])
            nq1 = nau.quiet_end(nst + 0.02)
            nw = spoken(nxt.get("source_id"), nst, nen)
            if nq1 is not None and nw:
                nq1 = min(nq1, nw[0][2] - 0.05)                # khong cat vao chu dau (Whisper)
            head = max(0.0, min(nen, nq1) - nst) if nq1 is not None else 0.0
        if tail + head <= max_pause + 0.05:
            continue
        cut = []
        if tail > EDGE_KEEP_TAIL + 0.03 and en - tail + EDGE_KEEP_TAIL - st >= MIN_PIECE:
            s["end"] = round(en - tail + EDGE_KEEP_TAIL, 3)
            s["quiet_end"] = True
            cut.append("duoi %.2fs" % (tail - EDGE_KEEP_TAIL))
        if nxt is not None and head > EDGE_KEEP_HEAD + 0.03 and float(nxt["end"]) - (float(nxt["start"]) + head - EDGE_KEEP_HEAD) >= MIN_PIECE:
            old = float(nxt["start"])
            nxt["start"] = round(old + head - EDGE_KEEP_HEAD, 3)
            nxt["quiet_start"] = True
            cut.append("dau doan sau %.2fs" % (head - EDGE_KEEP_HEAD))
        if cut and changes is not None:
            changes.append("%s%d: siet khoang nghi o cho noi %.2fs -> cat %s" % (label, i, tail + head, ", ".join(cut)))
    # dau video (doan dau tien)
    if body and au_of.get(id(body[0])) is not None and au_of[id(body[0])].thr is not None:
        s0 = body[0]
        q1 = au_of[id(s0)].quiet_end(float(s0["start"]) + 0.02)
        w0 = spoken(s0.get("source_id"), float(s0["start"]), float(s0["end"]))
        if q1 is not None and w0:
            q1 = min(q1, w0[0][2] - 0.05)
        if q1 is not None and q1 - float(s0["start"]) > max_pause and float(s0["end"]) - (q1 - EDGE_KEEP_HEAD) >= MIN_PIECE:
            if changes is not None:
                changes.append("%s0: bo %.2fs lang dau video" % (label, q1 - float(s0["start"]) - EDGE_KEEP_HEAD))
            s0["start"] = round(q1 - EDGE_KEEP_HEAD, 3)
            s0["quiet_start"] = True
    # 2) khoang lang GIUA doan
    out = []
    for s in segs:
        if not isinstance(s, dict) or s.get("kind") in ("insert", "hook") or au_of.get(id(s)) is None:
            out.append(s)
            continue
        au = au_of[id(s)]
        st, en = float(s["start"]), float(s["end"])
        sw = spoken(s.get("source_id"), st, en)
        acc, left = [], st
        for a, b in au.quiet_runs(st + 0.15, en - 0.15, max_pause):
            # lang GIUA loi noi: co chu truoc va sau (khong cat doan nhac / b-roll o dau hay cuoi doan)
            if not (any(w[1] < a for w in sw) and any(w[2] > b for w in sw)):
                continue
            if (a + PAUSE_KEEP) - left >= MIN_PIECE and en - (b - PAUSE_KEEP) >= MIN_PIECE:
                acc.append((a, b))
                left = b - PAUSE_KEEP
        if not acc:
            out.append(s)
            continue
        base = float(s.get("scale", 1.0) or 1.0)
        bounds = [st] + [x for a, b in acc for x in (a + PAUSE_KEEP, b - PAUSE_KEEP)] + [en]
        ts = float(s.get("target_start") or 0)
        for k in range(len(acc) + 1):
            p = dict(s)
            p["start"], p["end"] = round(bounds[2 * k], 3), round(bounds[2 * k + 1], 3)
            p["target_start"] = round(ts, 3)
            ts += (p["end"] - p["start"]) / float(p.get("speed", 1.0) or 1.0)
            if k > 0:
                p["quiet_start"] = True
                p.pop("hard_lo", None)
                # jump-cut: doi khung nhe o moi cho cat de khong thay giat hinh
                p["scale"] = round(base + 0.08 if k % 2 else base, 2) if base <= 1.3 else round(base - 0.08 if k % 2 else base, 2)
            if k < len(acc):
                p["quiet_end"] = True
                p.pop("hard_hi", None)
            out.append(p)
        if changes is not None:
            changes.append("%s %.2f-%.2f: siet %d khoang nghi giua doan (%s)" % (
                label, st, en, len(acc), ", ".join("%.2fs@%.2f" % (b - a, a) for a, b in acc)))
    return out


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
