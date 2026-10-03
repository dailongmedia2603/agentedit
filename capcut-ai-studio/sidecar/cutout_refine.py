#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LAM SACH ban tach nen (user 2026-10-03: anh tach nen con du LOP BONG -> mang mo de len mat nguoi noi).

Mat na AI (Vision tren macOS / BiRefNet tren Windows) co 3 loi da gap tren anh AI (nen xam nhat tron):
  - giu BONG DO tren san (vung xam toi dan duoi vat) thanh mot vet loang ban trong suot;
  - BO SOT mang vat the toi mau (de nut bam do tham) -> phan con lai trong nhu vet bong;
  - de lai lop alpha rat thap (mo mo) tren ca khung -> dat len video thanh mang mo hinh chu nhat.
Cach lam (chi numpy + PIL): anh co NEN TRON MOT MAU (vien anh dong nhat) -> diem "giong nen" = cung sac do voi nen,
sang bang hoac TOI HON (bong), min (khong co canh); vung giong nen NOI LIEN voi vien anh la nen + bong -> xoa.
Phan vat AI bo sot ma khac han mau nen (va o sat chu the) -> lay lai. Alpha < ALPHA_FLOOR -> 0, khu mau nen o vien.
Nen phuc tap (anh chup, khung video) -> chi giu mat na AI + xoa lop mo + bo vien thua.
"""
import numpy as np

VERSION = 2                  # doi cach tach -> tang so: ban tach cu (khac VERSION) tu tach lai
CHROMA_TOL = 10.0            # lech sac do toi da so voi nen (thang 0..255) de con tinh la nen / bong
K_MIN, K_MAX = 0.22, 1.12    # do sang so voi nen: bong toi den 22%, nen sang hon vien (vignette) den 112%
SHADOW_K = 0.97              # toi hon nen >= 3% = bong
GRAD_MAX = 6.0               # nen / bong min: chenh sang giua 2 diem canh nhau <= 6 (canh vat the >> 6)
T_LO, T_HI = 12.0, 40.0      # khoang cach mau toi nen -> alpha mau (vien anti-alias)
ALPHA_FLOOR = 0.08           # alpha thap hon = lop mo du -> 0
FLOOD_SIDE = 640             # loang nen tren luoi thu nho (nhanh), roi tra ve do phan giai goc


def _lum(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def _border(f, frac=0.02):
    H, W = f.shape[:2]
    b = max(2, int(min(H, W) * frac))
    return np.concatenate([f[:b].reshape(-1, 3), f[-b:].reshape(-1, 3),
                           f[:, :b].reshape(-1, 3), f[:, -b:].reshape(-1, 3)])


def plain_background(f):
    """Mau nen (3,) neu anh nam tren NEN TRON MOT MAU sang (>= 90% vien anh cung sac do), nguoc lai None."""
    px = _border(f)
    B = np.median(px, 0)
    LB = float(_lum(B))
    if LB < 90:
        return None
    k = _lum(px) / LB
    dev = np.abs(px - k[:, None] * B).max(1)
    ok = (dev <= CHROMA_TOL) & (k > 0.6) & (k < K_MAX)
    return B if ok.mean() >= 0.9 else None


def _grow(m, n):
    """Noi rong mat na bool n diem (4 huong)."""
    for _ in range(n):
        g = m.copy()
        g[1:] |= m[:-1]
        g[:-1] |= m[1:]
        g[:, 1:] |= m[:, :-1]
        g[:, :-1] |= m[:, 1:]
        m = g
    return m


def _spread(m, seed):
    """Loang 4 huong tu seed trong m (bool cung kich thuoc)."""
    reach = seed & m
    n0 = -1
    while True:
        for _ in range(16):
            reach = _grow(reach, 1) & m
        n = int(reach.sum())
        if n == n0:
            return reach
        n0 = n


def _shrink(m, s, mode):
    """Luoi thu nho s lan: 'all' = ca khoi deu True, 'any' = co it nhat 1 diem."""
    H, W = m.shape
    h, w = H // s, W // s
    b = m[:h * s, :w * s].reshape(h, s, w, s)
    return b.all(axis=(1, 3)) if mode == "all" else b.any(axis=(1, 3))


def _expand(small, s, shape):
    up = np.zeros(shape, bool)
    h, w = small.shape
    up[:h * s, :w * s] = np.repeat(np.repeat(small, s, 0), s, 1)
    return up


def _step(shape):
    return max(1, int(np.ceil(max(shape) / float(FLOOD_SIDE))))


def _flood(cand):
    """Vung cand NOI LIEN voi vien anh (loang 4 huong, lam tren luoi da thu nho)."""
    s = _step(cand.shape)
    # o luoi nho chi la nen khi CA khoi s x s deu la nen -> khong ri qua canh mong cua vat the
    small = _shrink(cand, s, "all")
    edge = np.zeros_like(small)
    edge[0], edge[-1], edge[:, 0], edge[:, -1] = True, True, True, True
    seed = _expand(_spread(small, edge), s, cand.shape)
    # bu phan vien bi khoi thu nho bo qua: noi rong s diem nhung CHI trong cand (khong vuot qua canh vat)
    seed[0] |= cand[0]
    seed[-1] |= cand[-1]
    seed[:, 0] |= cand[:, 0]
    seed[:, -1] |= cand[:, -1]
    for _ in range(s + 1):
        seed = _grow(seed, 1) & cand
    return seed


def _box3(a):
    p = np.pad(a, 1, mode="edge")
    return (p[:-2, :-2] + p[:-2, 1:-1] + p[:-2, 2:] + p[1:-1, :-2] + p[1:-1, 1:-1] + p[1:-1, 2:]
            + p[2:, :-2] + p[2:, 1:-1] + p[2:, 2:]) / 9.0


def refine(rgb, mask, src_alpha=None):
    """rgb (H, W, 3) uint8 + mat na AI mem (H, W) 0..1 -> (rgba uint8 (H, W, 4), info) — chua cat khung."""
    f = rgb.astype(np.float32)
    V = np.clip(mask.astype(np.float32), 0.0, 1.0)
    info = {"plain": False}
    B = plain_background(f)
    if B is None:
        alpha = V
    else:
        info["plain"] = True
        LB = float(_lum(B))
        L = _lum(f)
        k = L / LB
        dev = np.abs(f - k[..., None] * B).max(-1)
        gx = np.zeros_like(L)
        gy = np.zeros_like(L)
        gx[:, 1:] = np.abs(L[:, 1:] - L[:, :-1])
        gy[1:] = np.abs(L[1:] - L[:-1])
        grad = np.maximum(gx, gy)
        grad = np.maximum(grad, np.pad(grad[:, 1:], ((0, 0), (0, 1))))
        grad = np.maximum(grad, np.pad(grad[1:], ((0, 1), (0, 0))))
        bgish = (dev <= CHROMA_TOL) & (k >= K_MIN) & (k <= K_MAX)
        bg = _flood(bgish & (grad <= GRAD_MAX))
        # xam trung tinh NOI LIEN ra nen (ke ca qua canh bong gat) = nen / bong; nam KIN trong vat = mau cua vat
        floor = _flood(bgish)
        shadow = bg & (k < SHADOW_K)
        # phan vat AI bo sot: KHONG phai nen / bong va NOI LIEN voi chu the AI da thay (de nut bam do tham Vision bo)
        core = V >= 0.5
        s = _step(V.shape)
        near = _expand(_spread(_shrink(~bg, s, "any"), _shrink(core, s, "any")), s, V.shape) if core.any() else core
        dB = np.abs(f - B).max(-1)
        a_col = np.clip((dB - T_LO) / (T_HI - T_LO), 0.0, 1.0)
        a_col[floor] = 0.0                      # nen / bong noi ra vien anh khong bao gio duoc lay lai bang mau
        alpha = np.where(near, np.maximum(V, a_col), V)
        alpha[bg & (V < 0.5)] = 0.0             # nen noi lien vien anh
        alpha[shadow] = 0.0                     # bong do tren san — ke ca khi mat na AI tinh la vat
        # mem canh cat cung 1 diem — CHI vao trong (lam mo ra ngoai = diem nen xam co alpha ~0.3 -> vien sang mo)
        alpha = np.minimum(alpha, _box3(alpha))
        soft = alpha < 0.999
        alpha[soft] *= np.clip(dB[soft] / T_LO, 0.0, 1.0)   # diem vien dung mau nen -> trong suot
        hard = int((alpha >= 0.5).sum())
        if hard < 0.25 * max(1, int(core.sum())):
            alpha = V                           # loc hong (anh la) -> giu mat na AI
            info["plain"] = False
        else:
            info["shadow_px"] = int(shadow.sum())
            info["recovered_px"] = int(((alpha >= 0.5) & ~core).sum())
            info["removed_px"] = int((core & (alpha < 0.5)).sum())
            # khu mau nen o diem vien: C = a*F + (1-a)*B  ->  F = (C - (1-a)B) / a
            edge = (alpha > 0.04) & (alpha < 0.96)
            if edge.any():
                a3 = alpha[edge][:, None]
                f[edge] = np.clip((f[edge] - (1.0 - a3) * B) / a3, 0, 255)
    if src_alpha is not None:
        alpha = np.minimum(alpha, src_alpha.astype(np.float32) / 255.0)
    alpha = np.where(alpha < ALPHA_FLOOR, 0.0, alpha)
    rgba = np.dstack([f.astype(np.uint8), (np.clip(alpha, 0, 1) * 255).astype(np.uint8)])
    return rgba, info


def crop(rgba, pad=2):
    """Cat sat chu the (alpha > 8). Khong con gi -> None."""
    ys, xs = np.nonzero(rgba[..., 3] > 8)
    if not ys.size:
        return None
    H, W = rgba.shape[:2]
    return rgba[max(0, ys.min() - pad):min(H, ys.max() + 1 + pad), max(0, xs.min() - pad):min(W, xs.max() + 1 + pad)]


def save(rgba, out_path):
    """Ghi PNG kem dau phien ban (studio_cut) -> ban cu tu tach lai."""
    import os
    from PIL import Image, PngImagePlugin
    meta = PngImagePlugin.PngInfo()
    meta.add_text("studio_cut", str(VERSION))
    tmp = out_path + ".tmp.png"
    Image.fromarray(rgba, "RGBA").save(tmp, pnginfo=meta)
    os.replace(tmp, out_path)
    return out_path


def fresh(out_path, src_path):
    """Ban tach da co, moi hon anh goc va cung phien ban."""
    import os
    if not (out_path and os.path.isfile(out_path) and src_path and os.path.isfile(src_path)):
        return False
    if os.path.getmtime(out_path) < os.path.getmtime(src_path):
        return False
    try:
        from PIL import Image
        with Image.open(out_path) as im:
            return str(im.info.get("studio_cut")) == str(VERSION)
    except Exception:
        return False


def own_alpha(img_path, min_clear=0.03):
    """Anh DA trong suot that (>= 3% dien tich alpha ~0, vd anh Codex nen trong suot) -> alpha (H, W) 0..1, khong thi None.
    Alpha cua chinh anh sach hon mat na AI (Vision hay cat mat mot phan vat) -> dung thang, khong tach lai."""
    from PIL import Image
    try:
        with Image.open(img_path) as im:
            if not (im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)):
                return None
            a = np.asarray(im.convert("RGBA"))[..., 3]
    except Exception:
        return None
    if (a < 10).mean() < min_clear:
        return None
    return a.astype(np.float32) / 255.0


def cutout(img_path, mask, out_path):
    """Anh goc + mat na AI mem (H, W) cung kich thuoc anh -> PNG trong suot da lam sach, cat sat. Tra out_path / None."""
    from PIL import Image
    with Image.open(img_path) as im:
        im.load()
        rgb = np.asarray(im.convert("RGB"))
        src_a = None
        if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
            src_a = np.asarray(im.convert("RGBA"))[..., 3]
    if mask.shape != rgb.shape[:2]:
        m8 = Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8)).resize((rgb.shape[1], rgb.shape[0]), Image.BILINEAR)
        mask = np.asarray(m8).astype(np.float32) / 255.0
    rgba, _info = refine(rgb, mask, src_a)
    c = crop(rgba)
    if c is None:
        return None
    return save(c, out_path)
