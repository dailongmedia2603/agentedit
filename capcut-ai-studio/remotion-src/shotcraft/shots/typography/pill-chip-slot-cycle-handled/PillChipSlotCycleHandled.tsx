// pill-chip-slot-cycle-handled — Chip Slot Cycle 胶囊滚轮挤开（motion-lab 定稿转原生 Remotion）
// 白底句式 "Your [chip] Handled"：深色胶囊内词垂直滚轮轮换，
// 上下露出灰色幽灵项，胶囊宽度随词长平滑变化，两侧文字被自然挤开收拢。
// 设计坐标 480×270（原 DesignStage 等比放大 ×4），参数表数值以此坐标系标定 —— 这里用 k = 每设计 px 的舞台 px。
//
// [Agent Edit] o chu: before (chu truoc chip) / items (3-4 tu xoay trong chip, list) / after (chu sau chip).
// Be ngang chip do bang measureText voi font that (Be Vietnam Pro) — khong con so do theo SF Pro / offsetWidth.
// Emoji -> dau tick don sac mau nhan (the goc khuyen bo emoji he thong). Nhip chuyen: n-1 lan chuyen trai deu tu 0.25,
// moi lan 0.12 (≈18f, inOutCubic — giu nguyen). Chu dai / khung doc: cau tu xep thanh 1-3 hang (hang co chip van dung
// flex:none -> chu canh chip van bi "day ra"), co chu lon nhat vua be ngang.
import React from 'react';
import { measureText, useList, useShotFonts, useText, useVideoConfig, wrapLines, useShot } from '../../../runtime';
import { E, lerp, seg, useT } from '../../../fixtures/Motion';
import { LOOKS } from '../../../fixtures/Look';

// [Agent Edit] o chu TUY CHON: app da gui noi dung (co texts) ma bo trong o nay -> '' (an di), khong hien chu mau
const useOptText = (id: string, sample: string): string => {
  const d = useShot();
  const v = useText(id, sample);
  const t = d?.texts[id];
  const app = !!d && Object.keys(d.texts).length > 0;
  return app && (t === undefined || (typeof t === 'string' && !t.trim())) ? '' : v;
};


export const PILL_CHIP_SLOT_CYCLE_HANDLED_DURATION = 150; // 5000ms @30fps

const INK = '#15171d';
const PAD = 74; // 胶囊留白（设计 px）：左 18 + 图标 18 + 间距 9 + 右 29
const SIDE_LH = 1.3; // dau tieng Viet chong tang

type Row = { kind: 'side'; text: string } | { kind: 'chip'; before?: string; after?: string };

export const PillChipSlotCycleHandled: React.FC = () => {
  const t = useT();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const before = useText('before', 'Để AI lo');
  const after = useOptText('after', 'giúp bạn');
  const raw = useList('items', ['Kịch bản', 'Quay dựng', 'Âm thanh', 'Xuất video']);
  const WORDS = (raw.length ? raw : ['…']).slice(0, 5);
  const N = WORDS.length;
  const portrait = SH > 1080 * 1.2;
  const fam = fonts.sans;
  const accent = LOOKS.porcelain.accent;

  // ── 量宽（设计 px，k=1）：两侧 800/30、胶囊内 700/22 ──
  const sideW = (s: string) => (s ? measureText(s, fam, 30, 800) - 0.5 * Math.max(0, s.length - 1) : 0);
  const wordW = WORDS.map((w) => measureText(w, fam, 22, 700));
  const chipMax = Math.max(...wordW) + PAD;
  const GAP = 14; // 胶囊左右 margin

  // ── 版式候选：一行 / before 单独一行 / after 单独一行 / 三行 ──
  const maxW = 1920 - (portrait ? 220 : 240);
  const kMax = portrait ? 7.2 : 4;
  const layouts: Row[][] = [
    [{ kind: 'chip', before, after }],
    [{ kind: 'side', text: before }, { kind: 'chip', after }],
    [{ kind: 'chip', before }, { kind: 'side', text: after }],
    [{ kind: 'side', text: before }, { kind: 'chip' }, { kind: 'side', text: after }],
  ].map((rows) => (rows as Row[]).filter((r) => r.kind === 'chip' || r.text));
  const rowW = (r: Row) =>
    r.kind === 'side' ? sideW(r.text) : chipMax + 2 * GAP + (r.before ? sideW(r.before) : 0) + (r.after ? sideW(r.after) : 0);
  // 每个候选能用的最大 k（宽度约束；单独一行的长 side 可折行，按 2 行算）
  const kOf = (rows: Row[]) => {
    let k = kMax;
    for (const r of rows) {
      const w = r.kind === 'side' ? Math.min(rowW(r), Math.max(rowW(r) / 2 + 40, ...r.text.split(/\s+/).map(sideW))) : rowW(r);
      k = Math.min(k, maxW / Math.max(1, w));
    }
    return k;
  };
  const scored = layouts.map((rows) => ({ rows, k: kOf(rows) }));
  const best = Math.max(...scored.map((s) => s.k));
  const pick = scored.find((s) => s.k >= best * (portrait ? 0.88 : 0.8))!;
  let k = pick.k;
  // 高度约束：幽灵项需要胶囊上下各 ~45 / 90 设计 px 的净空
  const sideLines = (text: string, kk: number) => wrapLines(text, fam, 30 * kk, maxW, 800, 2);
  const totalH = (kk: number) =>
    pick.rows.reduce((h, r) => h + (r.kind === 'chip' ? 48 * kk : sideLines(r.text, kk).length * 30 * SIDE_LH * kk), 0) +
    pick.rows.reduce((h, r, i) => h + (i === 0 ? 0 : pick.rows[i - 1].kind === 'chip' ? 70 * kk : r.kind === 'chip' ? 50 * kk : 14 * kk), 0);
  const maxH = SH * (portrait ? 0.62 : 0.8);
  const sideOver = (kk: number) =>
    pick.rows.some((r) => r.kind === 'side' && sideLines(r.text, kk).some((l) => measureText(l, fam, 30 * kk, 800) > maxW));
  while ((totalH(k) > maxH || sideOver(k)) && k > 1.5) k *= 0.95;

  // ── 运动：n-1 次切换，起点 0.25 起均布（原 0.25/0.47/0.69），每窗 0.12 inOutCubic ──
  const steps = N - 1;
  const span = steps <= 1 ? 0 : Math.min(0.22, 0.44 / (steps - 1));
  let pos = 0;
  for (let i = 0; i < steps; i++) {
    const s0 = 0.25 + i * span;
    pos += seg(t, s0, s0 + 0.12, E.inOutCubic);
  }
  const ci = Math.min(N - 1, Math.floor(pos));
  const frac = pos - ci;
  const widths = wordW.map((w) => w + PAD);
  const chipW = lerp(frac, widths[ci], widths[Math.min(ci + 1, N - 1)]) * k;

  const near = Math.round(pos);
  const roll = (pos - near) * 48 * 0.5 * k;
  const settle = 1 - Math.min(1, Math.abs(pos - near) * 3);
  const ghost = (top: number): React.CSSProperties => ({
    position: 'absolute',
    left: '50%',
    top: top * k,
    fontFamily: fam,
    fontWeight: 700,
    fontSize: 22 * k,
    lineHeight: 1.2,
    color: INK,
    whiteSpace: 'nowrap',
    transform: `translateX(-50%) translateY(${-roll}px)`,
    opacity: 0.13 * (0.4 + settle * 0.6),
  });
  const SIDE: React.CSSProperties = {
    color: INK,
    fontFamily: fam,
    fontWeight: 800,
    fontSize: 30 * k,
    lineHeight: SIDE_LH,
    letterSpacing: -0.5 * k,
    flex: 'none',
    whiteSpace: 'nowrap',
  };

  const chip = (
    <div style={{ position: 'relative', flex: 'none' }}>
      {/* 深色胶囊：overflow hidden 里放 n 行词的滚轮列 */}
      <div
        style={{
          position: 'relative',
          height: 48 * k,
          width: chipW,
          margin: `0 ${GAP * k}px`,
          flex: 'none',
          borderRadius: 99 * k,
          background: '#1a1c24',
          boxShadow: `0 ${8 * k}px ${24 * k}px rgba(20,22,40,.22)`,
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, transform: `translateY(${-pos * 48 * k}px)` }}>
          {WORDS.map((w, i) => (
            <div key={i} style={{ height: 48 * k, display: 'flex', alignItems: 'center', gap: 9 * k, paddingLeft: 18 * k, whiteSpace: 'nowrap' }}>
              <svg width={18 * k} height={18 * k} viewBox="0 0 18 18" style={{ flex: 'none' }}>
                <circle cx={9} cy={9} r={8.2} fill={accent} />
                <path d="M5.2 9.3l2.5 2.4 5-5.2" fill="none" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ fontFamily: fam, fontWeight: 700, fontSize: 22 * k, lineHeight: 1.2, color: '#fff' }}>{w}</span>
            </div>
          ))}
        </div>
      </div>
      {/* 胶囊外上下的灰色幽灵项 */}
      <div style={ghost(-38)}>{near > 0 ? WORDS[near - 1] : ''}</div>
      <div style={ghost(58)}>{near < N - 1 ? WORDS[near + 1] : ''}</div>
    </div>
  );

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#fbfbfd', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {pick.rows.map((r, i) => {
          const prev = pick.rows[i - 1];
          const mt = i === 0 ? 0 : prev.kind === 'chip' ? 70 * k : r.kind === 'chip' ? 50 * k : 14 * k;
          if (r.kind === 'side')
            return (
              <div key={i} style={{ marginTop: mt, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {sideLines(r.text, k).map((l, j) => (
                  <div key={j} style={SIDE}>{l}</div>
                ))}
              </div>
            );
          return (
            <div key={i} style={{ marginTop: mt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {r.before ? <div style={SIDE}>{r.before}</div> : null}
              {chip}
              {r.after ? <div style={SIDE}>{r.after}</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};
