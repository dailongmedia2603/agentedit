// panel-to-canvas-materialize —— miro-promo 84–92s
// 侧面板列表行逐个打勾 → 按钮按下 → 三行沿上抛弧线错峰飞出面板、跨容器变形成画布上的三张卡（行→卡形态迁移）。
//
// 第二轮重设计（沙色暖场 · 研究洞察上墙）：
// - look = sand（米色纸面 · 赤陶强调 · 藏青点缀）。右侧面板列着 3-5 条内容（32px 行标题 + 头像），
//   左侧是一块开放的画布（标志 + 衬线大标题 + 淡点阵画布）。
// - 动作链有因果：光标逐个点三个复选框（赤陶色勾 spring 弹出、勾线描出）→ 移到「Đưa lên bảng」按下 →
//   三行先"拔起"（预备：放大 2% + 阴影加深 4f）再沿二次贝塞尔上抛弧线飞向画布，错峰 6f。
// - 形态迁移（本式命门）：位置走弧线先到，宽高 / 圆角晚 3f 收敛（父先子后）；行内容在 u<0.4 淡出、卡内容 u>0.5 淡入，
//   中段两态绝不同显；飞行中按速度做方向性运动模糊，阴影随弧线抬高变大变虚，落地 4f 压扁回弹 + 接触影收紧。
// - 行槽不复原：飞走的行塌成赤陶虚线留白「Đã lên bảng」，"迁移"不是"复制"。
// - 相机：起飞后整体极缓推近（总 2.5%）；落定后板头计数「3 mục đã ghim」升起，hold 成海报。
//
// 时间表（30fps，共 150f）：
//   0–18    面板从右滑入（snappy）、5 行错峰；板头衬线标题逐词升起
//   14/24/34 光标依次点中三个复选框（勾 spring damping 11，勾线 7f 描出），按钮计数 1→2→3
//   48      光标到按钮，52f 按下（scale 0.94 → 回弹）
//   56/62/68 三行拔起 4f → 起飞 40f（spring damping 17，弧线中点上抬 220px）
//   ~104–112 三卡依次落地（压扁回弹、倾角 −2.5/1.8/−1.2°），行槽塌成虚线
//   112–150 hold：板头「3 shots pinned」计数升起，相机极缓推进
//
// [Agent Edit] o chu: items (3-5 muc; 3 muc DAU = 3 muc duoc tick va bay len bang thanh the, muc 4-5 la hang khong chon xen
// giua) / notes (dong ghi chu tren 3 the, tuy chon) / title (tieu de bang) / kicker (nhan nho canh logo) / panel (tieu de
// bang ben phai). Chu tren giao dien gia (nut, dem, nhan the, ten nguoi) = tieng Viet trung tinh. Tieu de hang tu thu nho
// vua be ngang; tieu de the xuong toi da 2 dong. Khung doc (portrait.mode = 'native'): ca canh dung trong he toa do ao
// 1280 x (H/1.5) phong x1.5 — bang + 3 the o tren, bang chon o duoi, the bay VONG LEN tren; khung ngang giu bo cuc goc.
import { useBackdrop, useCurrentFrame, useVideoConfig, useText, useList, useShotFonts, fitSize, wrapLines, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, FONT, SpeedBlur, mix, ramp, softShadow } from '../../../fixtures/Polish';
import { LOOKS, SERIF, Stage, alpha, springAt, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const PANEL_TO_CANVAS_MATERIALIZE_DURATION = 150;

const L = LOOKS.sand;

// ── 行 / 卡尺寸（两种画幅共用；竖版整体在 1280 宽的虚拟坐标里排、再放大 1.5×） ──
const ROW_H = 104;
const ROW_STEP = 116;
const ROWS_OFF = 166; // 第一行相对面板顶的偏移
const CARD_W = 486;
const CARD_H = 300;

const CHECK_AT = [14, 24, 34];
const PRESS = 52;
const LIFT_AT = [56, 62, 68];
const LIFT = 4; // 拔起预备帧

type Item = { title: string; tag: string; who: string; name: string; quote: string };
type Target = { x: number; y: number; rot: number };
type Geo = {
  PANEL_X: number; PANEL_Y: number; PANEL_W: number; PANEL_H: number;
  ROW_X: number; ROW_W: number; ROWS_TOP: number;
  TARGETS: Target[]; SLOTS: number[];
  HEAD_X: number; HEAD_Y: number; HEAD_W: number;
  CUR0: { x: number; y: number };
};
const AV = ['#c4552d', '#3d5a80', '#7c6a4f', '#9a5b3f'];
// 界面里的"测量级"小字：中性越南语占位（人名 / 分类标签）
const PEOPLE = [['MA', 'Minh Anh'], ['QB', 'Quốc Bảo'], ['TH', 'Thu Hà'], ['ĐK', 'Đăng Khoa'], ['LV', 'Lan Vy']];
const TAGS = ['Ý tưởng', 'Nội dung', 'Dữ liệu', 'Kênh', 'Kết quả'];

const rowY = (g: Geo, slot: number) => g.ROWS_TOP + slot * ROW_STEP;

// 飞行进度（spring，可能短暂 >1）
const flyU = (f: number, k: number) => springAt(f, LIFT_AT[k] + LIFT, { damping: 17, stiffness: 95, mass: 0.9 });

// 飞行几何：位置走二次贝塞尔（中点上抬），尺寸晚 3f 收敛
const flyGeom = (g: Geo, f: number, k: number) => {
  const slot = g.SLOTS[k];
  const u = flyU(f, k);
  const us = flyU(f - 3, k); // 尺寸晚 3f
  const t = g.TARGETS[k];
  const sx = g.ROW_X + g.ROW_W / 2, sy = rowY(g, slot) + ROW_H / 2;
  const ex = t.x + CARD_W / 2, ey = t.y + CARD_H / 2;
  const cx = (sx + ex) / 2, cy = Math.min(sy, ey) - 220;
  const q = Math.min(1, Math.max(0, u));
  const bx = (1 - q) * (1 - q) * sx + 2 * (1 - q) * q * cx + q * q * ex + (u - q) * (ex - cx) * 0.6;
  const by = (1 - q) * (1 - q) * sy + 2 * (1 - q) * q * cy + q * q * ey + (u - q) * (ey - cy) * 0.6;
  const w = mix(g.ROW_W, CARD_W, us);
  const h = mix(ROW_H, CARD_H, us);
  return { u, us, cx: bx, cy: by, w, h, rot: t.rot * u, arc: Math.sin(Math.PI * q) };
};

const Avatar: React.FC<{ s: string; c: string; size?: number }> = ({ s, c, size = 44 }) => (
  <div style={{
    width: size, height: size, borderRadius: 99, flex: 'none', display: 'grid', placeItems: 'center',
    background: `linear-gradient(180deg, ${alpha(c, 0.85)}, ${c})`, color: '#fff8f0',
    ...type(size * 0.38, 650), letterSpacing: '0.02em', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
  }}>{s}</div>
);

const Tag: React.FC<{ s: string }> = ({ s }) => (
  <span style={{
    ...type(20, 650, { caps: true }), color: L.accent2, padding: '6px 12px', borderRadius: 99,
    background: alpha(L.accent2, 0.09), border: `1px solid ${alpha(L.accent2, 0.16)}`, whiteSpace: 'nowrap',
  }}>{s}</span>
);

const CheckBox: React.FC<{ frame: number; at: number | null }> = ({ frame, at }) => {
  const ACC = L.accent;
  const checked = at !== null && frame >= at;
  const pop = at === null ? 0 : springAt(frame, at, { damping: 11, stiffness: 300 });
  const draw = at === null ? 0 : ramp(frame, at + 1, 7, EASE.out);
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 10, flex: 'none', boxSizing: 'border-box',
      border: checked ? 'none' : `2px solid ${alpha(L.ink, 0.22)}`,
      background: checked ? `linear-gradient(180deg, ${alpha(ACC, 0.82)}, ${ACC})` : L.surface,
      boxShadow: checked ? `inset 0 1px 0 rgba(255,255,255,0.3), 0 3px 8px -3px ${alpha(ACC, 0.7)}` : `inset 0 1px 2px ${alpha(L.shadow, 0.08)}`,
      transform: checked ? `scale(${(0.75 + 0.25 * pop).toFixed(3)})` : undefined,
      display: 'grid', placeItems: 'center',
    }}>
      {checked && (
        <svg width="22" height="22" viewBox="0 0 18 18">
          <path d="M3.5 9.5 L7.3 13 L14.5 5" stroke={L.onAccent} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round"
            pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
        </svg>
      )}
    </div>
  );
};

// 行形态内容（面板内的行与飞行中的行共用，保证起飞同形）；标题按行宽缩字
const RowContent: React.FC<{ item: Item; hue: string; check: React.ReactNode; w: number }> = ({ item, hue, check, w }) => {
  const avail = w - 48 - 36 - 40 - 44;
  const fs = fitSize(item.title, { family: FONT.sans, size: 32, maxWidth: avail, weight: 600, minSize: 21 });
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: ROW_H, display: 'flex', alignItems: 'center', gap: 22, padding: '0 24px', boxSizing: 'border-box' }}>
      {check}
      <span style={{ ...type(fs, 600), lineHeight: 1.3, color: L.ink, whiteSpace: 'nowrap', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
      <Avatar s={item.who} c={hue} size={40} />
    </div>
  );
};

// 卡形态内容（按卡终态尺寸布局，飞行中由外框裁切）；标签行右侧放人名头像，标题 ≤2 行、备注 ≤2 行，都按宽度缩字
const CardContent: React.FC<{ item: Item; hue: string }> = ({ item, hue }) => {
  const IW = CARD_W - 60;
  const tl = wrapLines(item.title, SERIF, 38, IW, 600, 2);
  const ts = Math.min(...tl.map((l) => fitSize(l, { family: SERIF, size: 38, maxWidth: IW, weight: 600, minSize: 24 })));
  const ql = item.quote ? wrapLines(item.quote, FONT.sans, 24, IW, 450, 2) : [];
  const qs = ql.length ? Math.min(...ql.map((l) => fitSize(l, { family: FONT.sans, size: 24, maxWidth: IW, weight: 450, minSize: 17 }))) : 24;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: CARD_W, height: CARD_H, padding: '26px 30px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Tag s={item.tag} />
        <span style={{ marginLeft: 'auto', ...type(22, 560), color: L.ink2, whiteSpace: 'nowrap' }}>{item.name}</span>
        <Avatar s={item.who} c={hue} size={36} />
      </div>
      <div style={{ marginTop: 20, fontFamily: SERIF, fontSize: ts, fontWeight: 600, lineHeight: 1.16, letterSpacing: '-0.015em', color: L.ink }}>
        {tl.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
      </div>
      <div style={{ marginTop: 10, ...type(qs, 450), lineHeight: 1.3, color: L.ink2 }}>
        {ql.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
      </div>
    </div>
  );
};

const Cursor: React.FC<{ frame: number; g: Geo }> = ({ frame, g }) => {
  // 光标路径：入画 → 三个复选框 → 按钮；段间 swift 缓动 + 轻弧线，点击时缩一下
  const cb = (slot: number) => ({ x: g.ROW_X + 24 + 18 + 6, y: rowY(g, slot) + ROW_H / 2 + 6 });
  const btn = { x: g.PANEL_X + g.PANEL_W / 2 + 190, y: g.PANEL_Y + g.PANEL_H - 70 };
  const keys = [
    { f: 4, ...g.CUR0 },
    { f: CHECK_AT[0] - 1, ...cb(g.SLOTS[0]) },
    { f: CHECK_AT[1] - 1, ...cb(g.SLOTS[1]) },
    { f: CHECK_AT[2] - 1, ...cb(g.SLOTS[2]) },
    { f: PRESS - 2, ...btn },
  ];
  let x = keys[0].x, y = keys[0].y;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    const p = ramp(frame, a.f + 1, b.f - a.f - 1, EASE.swift);
    if (frame >= a.f) {
      x = mix(a.x, b.x, p);
      y = mix(a.y, b.y, p) - Math.sin(Math.PI * p) * 26;
    }
  }
  const clicks = [...CHECK_AT, PRESS];
  let press = 1;
  for (const c of clicks) if (frame >= c - 1 && frame < c + 6) press = Math.min(press, 1 - 0.16 * Math.sin((Math.PI * (frame - c + 1)) / 7));
  const show = ramp(frame, 3, 8, EASE.out) * (1 - ramp(frame, PRESS + 26, 10, EASE.out));
  return (
    <svg width={44} height={48} viewBox="0 0 20 22" style={{
      position: 'absolute', left: x, top: y, transform: `scale(${press.toFixed(3)})`, transformOrigin: '4px 2px', opacity: show,
      filter: `drop-shadow(0 3px 4px ${alpha(L.shadow, 0.3)})`,
    }}>
      <path d="M2 1 L2 17 L6.5 13.2 L9.4 20 L12.4 18.7 L9.5 12 L15 11.6 Z" fill={L.ink} stroke="#fff8f0" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
};

// 逐词升起（遮罩留足越南语叠加声调的上下空间：上 0.32em / 下 0.26em）
const WordRise: React.FC<{ text: string; start: number; each: number; gap: number; style: React.CSSProperties }> = ({ text, start, each, gap, style }) => {
  const frame = useCurrentFrame();
  const ws = text.split(/\s+/).filter(Boolean);
  return (
    <span style={{ display: 'inline-flex', whiteSpace: 'nowrap', columnGap: '0.24em', ...style }}>
      {ws.map((w, i) => {
        const p = ramp(frame, start + i * gap, each, EASE.snappy);
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', padding: '0.32em 0.03em 0.26em', margin: '-0.32em -0.03em -0.26em' }}>
            <span style={{ display: 'inline-block', transform: `translateY(calc(${((1 - p) * 105).toFixed(2)}% + ${((1 - p) * 0.6).toFixed(3)}em))` }}>{w}</span>
          </span>
        );
      })}
    </span>
  );
};

export const PanelToCanvasMaterialize: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const ACC = L.accent; // 赤陶
  const bd = useBackdrop(); // [Agent Edit] nen anh AI: khong ve nen tu ve, chu dau bang co bong sang nhe
  const title = useText('title', 'Kế hoạch ra mắt');
  const kicker = useText('kicker', 'Bảng kế hoạch');
  const panelTitle = useText('panel', 'Gợi ý từ AI');
  const raw = useList('items', ['Video giới thiệu sản phẩm', 'Livestream ngày đầu', 'Ưu đãi cho khách cũ', 'Bài đăng đếm ngược', 'Email cảm ơn']).slice(0, 5);
  while (raw.length < 3) raw.push(raw.length ? raw[raw.length - 1] : '…');
  const notes = useList('notes', ['Quay gọn trong 30 giây đầu.', 'Chốt khung giờ 20h tối.', 'Giảm 20% trong tuần đầu.']);
  // 面板顺序：3 条被选中的（items 前 3 条）与未选的穿插 → 读作"挑选"而非"全选"
  const order = raw.length === 3 ? [0, 1, 2] : raw.length === 4 ? [0, 3, 1, 2] : [0, 3, 1, 2, 4];
  const SLOTS = [order.indexOf(0), order.indexOf(1), order.indexOf(2)];
  const ITEMS: Item[] = order.map((idx, slot) => ({
    title: raw[idx],
    tag: TAGS[idx % TAGS.length],
    who: PEOPLE[slot % PEOPLE.length][0],
    name: PEOPLE[slot % PEOPLE.length][1],
    quote: idx < 3 ? notes[idx] || '' : '',
  }));
  const nRows = ITEMS.length;

  // ── 几何：横版沿用原版坐标；竖版（虚拟 1280 宽，×1.5）上画布、下面板 ──
  const VW = portrait ? 1280 : 1920;
  const VH = portrait ? SH / 1.5 : 1080;
  const PANEL_H = ROWS_OFF + nRows * ROW_STEP + 142; // n=5 → 888（原版）
  let g: Geo;
  if (!portrait) {
    const PANEL_X = 1164, PANEL_W = 656, PANEL_Y = Math.round((1080 - PANEL_H) / 2);
    g = {
      PANEL_X, PANEL_Y, PANEL_W, PANEL_H, ROW_X: PANEL_X + 24, ROW_W: PANEL_W - 48, ROWS_TOP: PANEL_Y + ROWS_OFF,
      TARGETS: [{ x: 116, y: 268, rot: -2.5 }, { x: 636, y: 306, rot: 1.8 }, { x: 330, y: 640, rot: -1.2 }], SLOTS,
      HEAD_X: 120, HEAD_Y: 92, HEAD_W: 1010, CUR0: { x: 860, y: 760 },
    };
  } else {
    const headH = 190, zoneH = 720, gap1 = 70, gap2 = 120;
    const total = headH + gap1 + zoneH + gap2 + PANEL_H;
    const y0 = Math.max(60, (VH - total) / 2);
    const zy = y0 + headH + gap1;
    const PANEL_X = 90, PANEL_W = VW - 180, PANEL_Y = zy + zoneH + gap2;
    g = {
      PANEL_X, PANEL_Y, PANEL_W, PANEL_H, ROW_X: PANEL_X + 24, ROW_W: PANEL_W - 48, ROWS_TOP: PANEL_Y + ROWS_OFF,
      TARGETS: [{ x: 100, y: zy, rot: -2.5 }, { x: VW - 100 - CARD_W, y: zy + 38, rot: 1.8 }, { x: (VW - CARD_W) / 2, y: zy + 380, rot: -1.2 }], SLOTS,
      HEAD_X: 100, HEAD_Y: y0, HEAD_W: VW - 200, CUR0: { x: VW / 2, y: PANEL_Y - 60 },
    };
  }

  const panelIn = ramp(frame, 0, 18, EASE.snappy);
  const checkedCount = CHECK_AT.filter((c) => frame >= c).length;
  const btnPress = frame < PRESS ? 0 : ramp(frame, PRESS, 3, EASE.out) * (1 - ramp(frame, PRESS + 3, 9, EASE.out));
  const btnReady = ramp(frame, CHECK_AT[0], 8, EASE.out);
  const landed = (k: number) => flyU(frame, k) > 0.96;
  const doneCount = [0, 1, 2].filter((k) => frame >= LIFT_AT[k] + LIFT + 30).length;

  // 相机：起飞后极缓推近，跟着内容看向画布
  const camP = ramp(frame, LIFT_AT[0], 94, EASE.smooth);
  const camS = 1 + 0.025 * camP;

  // 板头：标题与计数同一基线；标题按剩余宽度缩字
  const countText = `${Math.max(1, doneCount)} mục đã ghim`;
  const countW = measureText('3 mục đã ghim', fonts.sans, 32, 500) + 10;
  const titleSize = fitSize(title, { family: fonts.serif, size: 84, maxWidth: g.HEAD_W - countW - 30, weight: 600, minSize: 46 });
  const ptSize = fitSize(panelTitle, { family: fonts.sans, size: 44, maxWidth: g.PANEL_W - 64 - 170, weight: 700, minSize: 28 });
  const btnLabel = 'Đưa lên bảng';
  const kickerCaps = kicker.length <= 22;

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : L.bg[1], overflow: 'hidden', fontFamily: FONT.sans }}>
      <Stage look={L} keyLight={{ x: 0.3, y: 0.1 }} fill={{ x: 0.9, y: 0.9 }} />
      {/* [Agent Edit] bo luoi cham (canvas dot grid) trang tri theo yeu cau user */}

      <div style={{ position: 'absolute', left: 0, top: 0, width: VW, height: VH, transform: portrait ? 'scale(1.5)' : undefined, transformOrigin: '0 0' }}>
      <AbsoluteFill style={{ transform: `scale(${camS.toFixed(4)})`, transformOrigin: portrait ? '50% 40%' : '52% 50%' }}>
        {/* ── 板头 ── */}
        <div style={{ position: 'absolute', left: g.HEAD_X, top: g.HEAD_Y, width: g.HEAD_W, textShadow: bd ? '0 1px 12px rgba(255,255,255,0.7)' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: ramp(frame, 2, 12, EASE.out) }}>
            <ShotcraftMark size={34} tone="light" />
            {BRAND.name ? <span style={{ ...type(26, 680), letterSpacing: '0.01em', color: L.ink, whiteSpace: 'nowrap' }}>{BRAND.name}</span> : null}
            {kicker ? (
              <span style={{ ...type(22, 650, { caps: kickerCaps }), letterSpacing: kickerCaps ? '0.2em' : '0.02em', color: ACC, whiteSpace: 'nowrap' }}>
                {BRAND.name ? '· ' : ''}{kicker}
              </span>
            ) : null}
          </div>
          <div style={{ marginTop: 34, display: 'flex', alignItems: 'baseline', gap: 26 }}>
            <WordRise text={title} start={4} each={18} gap={5}
              style={{ fontFamily: SERIF, fontSize: titleSize, fontWeight: 600, letterSpacing: '-0.03em', color: L.ink, lineHeight: 1 }} />
            <div style={{ height: 44, overflow: 'hidden', paddingTop: 4 }}>
              <div style={{
                ...type(32, 500), color: L.ink2, whiteSpace: 'nowrap',
                transform: `translateY(${((1 - ramp(frame, LIFT_AT[0] + LIFT + 30, 14, EASE.snappy)) * 110).toFixed(1)}%)`,
              }}>
                <span style={{ color: ACC, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{countText.split(' ')[0]}</span> {countText.split(' ').slice(1).join(' ')}
              </div>
            </div>
          </div>
        </div>

        {/* ── 面板 ── */}
        <div style={{
          position: 'absolute', left: g.PANEL_X, top: g.PANEL_Y, width: g.PANEL_W, height: g.PANEL_H, boxSizing: 'border-box',
          borderRadius: 30, background: `linear-gradient(180deg, ${L.surface}, #f7f0e6)`,
          border: `1px solid ${L.line}`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.9), ${softShadow(30, { color: L.shadow, strength: 1.3 })}`,
          transform: portrait ? `translateY(${((1 - panelIn) * 160).toFixed(2)}px)` : `translateX(${((1 - panelIn) * 160).toFixed(2)}px)`, opacity: panelIn,
        }}>
          <div style={{ position: 'absolute', left: 32, top: 34, right: 32 }}>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span style={{ ...type(ptSize, 700), lineHeight: 1.2, color: L.ink, whiteSpace: 'nowrap' }}>{panelTitle}</span>
              <span style={{ marginLeft: 'auto', ...type(24, 500), color: L.ink3, whiteSpace: 'nowrap' }}>{nRows} gợi ý</span>
            </div>
            <div style={{ marginTop: 10, ...type(26, 450), color: L.ink2 }}>Chọn những mục muốn đưa lên bảng.</div>
          </div>
          {/* 按钮 */}
          <div style={{
            position: 'absolute', left: 24, right: 24, bottom: 24, height: 92, borderRadius: 20,
            background: `linear-gradient(180deg, #2c241b, ${L.ink})`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), ${softShadow(10 - 6 * btnPress, { color: L.shadow, strength: 1.6 })}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
            opacity: 0.35 + 0.65 * btnReady, transform: `scale(${(1 - 0.04 * btnPress).toFixed(4)})`,
          }}>
            <span style={{ ...type(32, 620), color: '#fff8f0' }}>{btnLabel}</span>
            <span style={{
              minWidth: 44, height: 44, borderRadius: 22, display: 'grid', placeItems: 'center', background: ACC,
              ...type(26, 700), color: L.onAccent, transform: `scale(${(1 + 0.12 * Math.max(0, 1 - Math.min(...CHECK_AT.map((c) => Math.abs(frame - c - 2))) / 4)).toFixed(3)})`,
            }}>{checkedCount}</span>
          </div>
        </div>

        {/* ── 面板行（未飞走的 / 塌陷成虚线留白的） ── */}
        {ITEMS.map((item, slot) => {
          const k = SLOTS.indexOf(slot);
          const inP = ramp(frame, 6 + slot * 2.5, 16, EASE.snappy);
          const y = rowY(g, slot);
          const gone = k >= 0 && frame >= LIFT_AT[k] + LIFT;
          const ghost = k >= 0 ? ramp(frame, LIFT_AT[k] + LIFT + 4, 10, EASE.out) : 0;
          const slide = (1 - panelIn) * 160;
          return (
            <div key={slot} style={{
              position: 'absolute', left: g.ROW_X, top: y, width: g.ROW_W, height: ROW_H,
              opacity: inP, transform: portrait ? `translate(${((1 - inP) * 40).toFixed(2)}px, ${slide.toFixed(2)}px)` : `translateX(${(slide + (1 - inP) * 40).toFixed(2)}px)`,
            }}>
              {k >= 0 && (
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: 18, border: `2px dashed ${alpha(ACC, 0.45)}`, boxSizing: 'border-box',
                  background: alpha(ACC, 0.04), opacity: ghost, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                  ...type(24, 600), color: alpha(ACC, 0.85),
                }}>
                  <svg width={22} height={22} viewBox="0 0 18 18"><path d="M3.5 9.5 L7.3 13 L14.5 5" stroke={ACC} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Đã lên bảng
                </div>
              )}
              {!gone && (
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: 18, overflow: 'hidden',
                  background: k >= 0 && frame >= CHECK_AT[k] ? `linear-gradient(180deg, #fffaf3, ${L.surface})` : L.surface2,
                  border: `1px solid ${k >= 0 && frame >= CHECK_AT[k] ? alpha(ACC, 0.35) : L.line}`,
                  boxShadow: k >= 0 && frame >= CHECK_AT[k] ? `0 0 0 3px ${alpha(ACC, 0.08)}` : undefined,
                }}>
                  <RowContent item={item} w={g.ROW_W} hue={AV[slot % 4]} check={<CheckBox frame={frame} at={k >= 0 ? CHECK_AT[k] : null} />} />
                </div>
              )}
            </div>
          );
        })}

        {/* ── 飞行 / 落定的卡 ── */}
        {SLOTS.map((slot, k) => {
          const liftStart = LIFT_AT[k];
          if (frame < liftStart) return null;
          const item = ITEMS[slot];
          const pre = ramp(frame, liftStart, LIFT, EASE.out); // 拔起预备
          const gg = flyGeom(g, frame, k);
          const flying = frame >= liftStart + LIFT;
          // 速度（px/帧）→ 方向性模糊
          const g0 = flyGeom(g, frame - 0.5, k), g1 = flyGeom(g, frame + 0.5, k);
          const vx = flying ? g1.cx - g0.cx : 0, vy = flying ? g1.cy - g0.cy : 0;
          // 落地压扁：u 首次越过 1 附近给一个 4f 的 scaleY 0.97 回弹
          const landF = liftStart + LIFT + 22;
          const squash = 1 - 0.03 * Math.sin(Math.PI * Math.min(1, Math.max(0, (frame - landF) / 6)));
          const rowOp = 1 - ramp(gg.us, 0.08, 0.32, EASE.linear);
          const cardOp = ramp(gg.us, 0.5, 0.3, EASE.linear);
          const elev = flying ? 8 + 46 * gg.arc + (landed(k) ? 0 : 6) : 4 + 10 * pre;
          const radius = mix(18, 24, Math.min(1, gg.us));
          const w = flying ? gg.w : g.ROW_W * (1 + 0.02 * pre);
          const h = flying ? gg.h : ROW_H * (1 + 0.02 * pre);
          const cx = flying ? gg.cx : g.ROW_X + g.ROW_W / 2;
          const cy = flying ? gg.cy : rowY(g, slot) + ROW_H / 2;
          return (
            <SpeedBlur key={slot} vx={vx} vy={vy} amount={0.32} max={14}>
              <div style={{
                position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h,
                transform: `rotate(${(flying ? gg.rot : 0).toFixed(3)}deg) scaleY(${squash.toFixed(4)})`, transformOrigin: '50% 100%',
                borderRadius: radius, overflow: 'hidden', boxSizing: 'border-box',
                background: `linear-gradient(180deg, #fffaf3, ${L.surface})`,
                border: `1px solid ${alpha(ACC, 0.35 * (1 - cardOp))}`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.95), ${softShadow(elev, { color: L.shadow, strength: 1.5 })}`,
              }}>
                {/* 赤陶顶线：卡形态的身份标记 */}
                <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 6, background: ACC, opacity: cardOp }} />
                <div style={{ position: 'absolute', inset: 0, opacity: rowOp }}>
                  <RowContent item={item} w={g.ROW_W} hue={AV[slot % 4]} check={<CheckBox frame={frame} at={CHECK_AT[k]} />} />
                </div>
                <div style={{ position: 'absolute', inset: 0, opacity: cardOp }}>
                  <CardContent item={item} hue={AV[slot % 4]} />
                </div>
              </div>
            </SpeedBlur>
          );
        })}

        <Cursor frame={frame} g={g} />
      </AbsoluteFill>
      </div>
    </AbsoluteFill>
  );
};
