// [Agent Edit] So lieu tu loi noi (chuoi bat ky: "1.350", "12,5%", "$2,4 triệu", "126 ms") -> so + cach viet goc
// (dau nghin / dau thap phan / so le / tien to / hau to) de bieu do dung so nguoi noi va hien lai DUNG kieu viet do.
export type Num = { pre: string; value: number; post: string; dec: number; th: string; dc: string; ok: boolean };

export function parseNum(raw: string | undefined, fallback: number): Num {
  const s = (raw || '').trim();
  const m = /^(.*?)(\d[\d.,]*)(.*)$/s.exec(s);
  const dflt: Num = { pre: '', value: fallback, post: '', dec: 0, th: '.', dc: ',', ok: false };
  if (!m) return { ...dflt, post: s ? ' ' + s : '' };
  let ns = m[2];
  let post = m[3];
  while (/[.,]$/.test(ns)) {
    post = ns.slice(-1) + post;
    ns = ns.slice(0, -1);
  }
  const hasDot = ns.includes('.');
  const hasCom = ns.includes(',');
  let th = '.';
  let dc = ',';
  let intPart = ns;
  let frac = '';
  if (hasDot && hasCom) {
    dc = ns.lastIndexOf('.') > ns.lastIndexOf(',') ? '.' : ',';
    th = dc === '.' ? ',' : '.';
    const i = ns.lastIndexOf(dc);
    intPart = ns.slice(0, i).split(th).join('');
    frac = ns.slice(i + 1);
  } else if (hasDot || hasCom) {
    const c = hasDot ? '.' : ',';
    const parts = ns.split(c);
    const thousands = parts.length > 2 || (parts[1].length === 3 && parts[0].length <= 3 && parts[0] !== '0');
    if (thousands) {
      th = c;
      dc = c === '.' ? ',' : '.';
      intPart = parts.join('');
    } else {
      dc = c;
      th = c === '.' ? ',' : '.';
      intPart = parts[0];
      frac = parts[1];
    }
  }
  const value = Number(intPart + (frac ? '.' + frac : ''));
  if (!isFinite(value)) return dflt;
  return { pre: m[1], value, post, dec: frac.length, th, dc, ok: true };
}

/** So -> chuoi theo kieu viet cua `f` (khong kem tien to / hau to). */
export function fmtBare(n: number, f: Pick<Num, 'th' | 'dc'>, dec = 0): string {
  const neg = n < 0;
  const [i, d] = Math.abs(n).toFixed(dec).split('.');
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, f.th);
  return (neg ? '−' : '') + g + (d ? f.dc + d : '');
}

/** So -> chuoi day du (tien to + so + hau to) theo kieu viet cua `f`. */
export const fmtNum = (n: number, f: Num, dec = f.dec) => `${f.pre}${fmtBare(n, f, dec)}${f.post}`;

/** Buoc chia truc "dep" >= x. fine = them 1.2 / 1.5 / 3 / 4 / 6 / 8 (it khoang trong phia tren hon). */
export function niceStep(x: number, fine = false): number {
  const e = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, x))));
  const ks = fine ? [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] : [1, 2, 2.5, 5, 10];
  for (const k of ks) if (k * e >= x - 1e-9) return k * e;
  return 10 * e;
}

/** Tach chu thanh <= 2 dong can bang (dong dai nhat ngan nhat) — tranh 1 tu mo coi o dong 2. */
export function balance2(words: string[], width: (t: string) => number): [string, string] | null {
  if (words.length < 2) return null;
  let best: [string, string] | null = null;
  let bw = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const w = Math.max(width(a), width(b));
    if (w < bw) {
      bw = w;
      best = [a, b];
    }
  }
  return best;
}

/** Nhan truc gon: 3000 -> "3K", 2500000 -> "2,5M" (nho hon 1000 giu nguyen). */
export function compact(n: number, f: Pick<Num, 'th' | 'dc'>): string {
  const a = Math.abs(n);
  const k = a >= 1e9 ? [1e9, 'B'] : a >= 1e6 ? [1e6, 'M'] : a >= 1e3 ? [1e3, 'K'] : [1, ''];
  const v = n / (k[0] as number);
  const dec = Math.abs(v - Math.round(v)) < 1e-6 ? 0 : Math.abs(v * 10 - Math.round(v * 10)) < 1e-6 ? 1 : 2;
  return fmtBare(v, f, dec) + k[1];
}

/** Gia tri that (nhan he so cua hau to): "36,3K" -> 36300, "2,5 triệu" -> 2500000, "1,2 tỷ" -> 1.2e9. */
export function realValue(n: Num): number {
  const t = n.post.trim().toLowerCase();
  const m = /^(k\b|k$|nghìn|ngàn)/.test(t) ? 1e3 : /^(m\b|m$|tr\b|tr$|triệu)/.test(t) ? 1e6 : /^(b\b|b$|tỷ|tỉ)/.test(t) ? 1e9 : 1;
  return n.value * m;
}
