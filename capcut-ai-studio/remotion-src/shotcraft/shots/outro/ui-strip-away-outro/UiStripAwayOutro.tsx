// ui-strip-away-outro —— framer-ai 33–36.5s
// 满屏"编辑器"里光标点击高亮 Publish 按钮 → UI 层层错峰蒸发退场
// （每层 fade + 方向性位移 + 蒸发模糊，从外围到中心）→ 黑场只剩按钮 → 按钮淡出交棒字标。
// 质感：编辑器是出版级假 UI（深色图层栏、属性面板真实字段、点阵画布、浏览器预览框里放内容卡），
// 发丝线 + 双层软阴影；Publish 用强调色，升格到黑场后带同色光晕；
// 黑场是带色相的深场（中心微光 + 暗角 + 颗粒）；字标是品牌标志 + 字标的 lockup，对焦式入场。
//
// [Agent Edit] o chu: cta (chu tren nut — "Xuat ban", "Dang ngay"...; nut rong theo chu that) / project (ten du an tren thanh
// cong cu) / name (ten o man ket; trong -> ten thuong hieu) / tagline (dong phu duoi ten). Giao dien gia = tieng Viet trung tinh.
// o anh `screen` (tuy chon, ti le bat ky): anh chup app / web cua video -> chia luoi 2x2 trong khung trinh duyet (moi o boc hoi
// rieng, van dung nhip so le 3f); khong co -> 4 the so lieu tieng Viet tu ve (the Card cua fixtures con chu tieng Anh).
// Khung doc (native): bien tap vien xep lai trong khung ao 1280 x (cao/1.5) roi phong 1.5x — lop ben trai, canvas tren,
// bang thuoc tinh duoi; nut bay ve giua, logo + ten to.
import { useBackdrop, useCurrentFrame, useImage, useShotFonts, useText, useVideoConfig, fitSize, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, interpolate, spring, Easing } from 'remotion';
import { G } from '../../../fixtures/Fixtures';
import { EASE, FONT, Grain, Vignette, mix, ramp, hairline, softShadow, innerHighlight } from '../../../fixtures/Polish';
import { LOOKS } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const UI_STRIP_AWAY_OUTRO_DURATION = 144; // 字标定版后 hold ≥1s（R1）

const CLICK = 34; // 点击时刻
// 蒸发层级（点击后延迟，外围先走）
const STRIP = {
  sidebar: CLICK + 4,
  leftPanel: CLICK + 8,
  canvasCards: CLICK + 12,
  topbarEnds: CLICK + 16,
  canvasBg: CLICK + 20,
  toolbarShell: CLICK + 24,
};
const STRIP_DUR = 14;
const BTN_FADE = CLICK + 52;
const LOGO_IN = CLICK + 62;

const INK = '#0b0c10'; // 黑场：带冷色相的近黑
const BTN_H = 40;

// 某层的蒸发进度 → {opacity, transform, filter}：ease-in 加速离场 + 位移 + 渐增模糊（蒸发感）
const strip = (frame: number, start: number, dx: number, dy: number): React.CSSProperties => {
  const p = interpolate(frame, [start, start + STRIP_DUR], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.quad), // 离场加速
  });
  return {
    opacity: 1 - p,
    transform: `translate(${dx * p}px, ${dy * p}px)`,
    filter: p > 0.001 ? `blur(${(p * 7).toFixed(2)}px)` : undefined,
  };
};

// hex → rgba
const rgba = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const shade = (hex: string, k: number) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  const f = (v: number) => Math.round(Math.max(0, Math.min(255, k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

// —— 小图标（1.5px 线性图标，与 fixture 同语言）——
const Icon: React.FC<{ d: string; size?: number; color?: string }> = ({ d, size = 18, color = G.ink2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const IC = {
  cursor: 'M5 3l13 8-6 1.5L9 19z',
  frame: 'M7 3v18M17 3v18M3 7h18M3 17h18',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  pen: 'M12 19l7-7-3-3-7 7-1 4zM14 7l3 3',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4',
  comp: 'M12 3l4 4-4 4-4-4zM12 13l4 4-4 4-4-4z',
  layer: 'M4 7h16v10H4z',
  textL: 'M6 7V5h12v2M12 5v14',
  group: 'M4 6h7v5H4zM13 6h7v5h-7zM4 13h16v5H4z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
};

const LAYERS: [string, string, number, boolean?][] = [
  ['frame', 'Video ra mắt', 0],
  ['layer', 'Mở đầu', 1],
  ['group', 'Cảnh chính', 1],
  ['textL', 'Tiêu đề', 2],
  ['textL', 'Phụ đề', 2],
  ['group', 'Cảnh tính năng', 1, true],
  ['layer', 'Cảnh zoom nhanh', 2],
  ['layer', 'Cảnh đẩy máy', 2],
  ['layer', 'Cảnh lia nhanh', 2],
  ['layer', 'Cảnh cắt theo nhịp', 2],
  ['layer', 'Logo kết', 1],
];

const Field: React.FC<{ label: string; value: string; w?: number }> = ({ label, value, w }) => (
  <div style={{
    height: 34, flex: w ? 'none' : 1, width: w, borderRadius: 8, background: G.fill, border: hairline(0.07),
    display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', boxSizing: 'border-box',
    fontFamily: FONT.sans, fontSize: 13, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
  }}>
    <span style={{ color: G.ink3 }}>{label}</span>
    <span style={{ color: G.ink1, fontWeight: 500 }}>{value}</span>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ title, children, style }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 18, borderBottom: hairline(0.07), ...style }}>
    <div style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: G.ink1, letterSpacing: '0.01em' }}>{title}</div>
    {children}
  </div>
);

// 内容卡（越南语假数据）：标题 + 大数字 + 涨幅 chip + 小柱图
const STATS: [string, string, string, string][] = [
  ['Doanh thu', '48,2 tr', '+6,3%', 'Tháng này'],
  ['Đơn hàng', '3.912', '+4,8%', 'Mọi kênh bán'],
  ['Người dùng', '24.812', '+12,4%', '7 ngày qua'],
  ['Tỉ lệ chốt', '68%', '+2,1%', 'Mục tiêu quý'],
];
const MiniCard: React.FC<{ w: number; h: number; i: number; accent: string }> = ({ w, h, i, accent }) => {
  const [t, v, d, c] = STATS[i % STATS.length];
  const bars = Array.from({ length: 12 }, (_, k) => 0.3 + 0.7 * Math.abs(Math.sin(k * 1.7 + i * 2.1)) * (0.5 + k / 24));
  const k = Math.min(w / 480, h / 280) ;
  return (
    <div style={{
      width: w, height: h, background: G.card, border: `1px solid ${G.hairline}`, borderRadius: 14, boxSizing: 'border-box',
      boxShadow: G.shadowSm, padding: 22 * k, display: 'flex', flexDirection: 'column', fontFamily: FONT.sans, color: G.ink1, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 * k }}>
        <div style={{ width: 34 * k, height: 34 * k, borderRadius: 9 * k, background: G.fill, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={IC.chart} size={18 * k} color={G.ink2} />
        </div>
        <span style={{ fontSize: 17 * k, fontWeight: 600, whiteSpace: 'nowrap' }}>{t}</span>
        <span style={{ marginLeft: 'auto', fontSize: 13 * k, color: G.ink2, background: G.fill, padding: `${3 * k}px ${9 * k}px`, borderRadius: 6 * k, whiteSpace: 'nowrap' }}>{c}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 * k, marginTop: 16 * k }}>
        <span style={{ fontSize: 44 * k, fontWeight: 700, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>{v}</span>
        <span style={{ fontSize: 14 * k, fontWeight: 600, color: accent, background: rgba(accent, 0.11), padding: `${3 * k}px ${8 * k}px`, borderRadius: 6 * k }}>{d}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 6 * k, marginTop: 14 * k }}>
        {bars.map((b, j) => (
          <div key={j} style={{ flex: 1, height: `${(b * 100).toFixed(1)}%`, borderRadius: 4 * k, background: j === bars.length - 1 ? accent : G.fill2 }} />
        ))}
      </div>
    </div>
  );
};

export const UiStripAwayOutro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const P = SH > 1080 * 1.2;
  // [Agent Edit] nen anh AI: giao dien boc hoi lo ra ANH NEN (thay cho man den + quang + toi goc + hat tu ve)
  const bd = useBackdrop();
  const onBg = bd ? '0 2px 18px rgba(0,0,0,0.55)' : undefined;
  const ACCENT = LOOKS.porcelain.accent; // Publish 的品牌高亮色（随视频强调色）

  const cta = useText('cta', 'Xuất bản');
  const project = useText('project', 'Video ra mắt');
  const nameText = useText('name', '');
  const tagline = useText('tagline', 'Một chạm, mọi thứ đã sẵn sàng.');
  const screen = useImage('screen');
  const name = (nameText || BRAND.name || '').trim();

  // ───────── 虚拟编辑器坐标：横版 1920×1080 ×1；竖版 1280×(H/1.5) ×1.5 ─────────
  const K = P ? 1.5 : 1;
  const VW = P ? 1280 : 1920;
  const VH = SH / K;
  const TB = P ? [400, 880] : [760, 1520]; // 工具条三段分界
  const propsH = 470;
  const panel = P ? { left: 240, right: 0, top: VH - propsH - 20, bottom: 0 } : { right: 0, top: 60, bottom: 0, width: 300 };
  const canvas = P ? { x: 280, y: 110, w: VW - 320, h: VH - propsH - 20 - 110 - 40 } : { x: 320, y: 130, w: 1180, h: 850 };
  const BAR = 46;
  // 卡片 / 截图分块（浏览器预览框内容区 2×2）
  const tiles = (() => {
    if (screen) {
      const g = 12;
      const cw = (canvas.w - g) / 2;
      const ch = (canvas.h - BAR - g) / 2;
      return [0, 1, 2, 3].map((i) => ({ x: (i % 2) * (cw + g), y: BAR + Math.floor(i / 2) * (ch + g), w: cw, h: ch }));
    }
    if (!P) return [0, 1, 2, 3].map((i) => ({ x: 70 + (i % 2) * 560, y: 120 + Math.floor(i / 2) * 340, w: 480, h: 280 }));
    // 竖版：一列四张横卡（与横版卡同比例），铺满预览框
    const g = 40;
    const cw = canvas.w - 2 * g;
    const ch = Math.min(cw * 0.42, (canvas.h - BAR - 5 * g) / 4);
    const y0 = BAR + (canvas.h - BAR - 4 * ch - 3 * g) / 2;
    return [0, 1, 2, 3].map((i) => ({ x: g, y: y0 + i * (ch + g), w: cw, h: ch }));
  })();

  // Publish 按钮几何：宽度按真实字宽；工具条右端 → 屏心
  const btnTextW = measureText(cta, fonts.sans, 15, 600);
  const BTN_W = Math.min(260, Math.max(150, btnTextW + 14 + 8 + 44));
  const btnFont = fitSize(cta, { family: fonts.sans, size: 15, maxWidth: BTN_W - 66, weight: 600, minSize: 9 });
  const BTN_FROM = { x: VW - 24 - BTN_W / 2, y: 30 };
  const BTN_TO = { x: VW / 2, y: VH / 2 };

  // 背景：编辑器底 → 黑场（随 canvasBg 层蒸发压黑）
  const bgDark = interpolate(frame, [STRIP.canvasBg, STRIP.canvasBg + STRIP_DUR + 6], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.quad),
  });

  const sidebar = strip(frame, STRIP.sidebar, -140, 0);
  const leftPanel = strip(frame, STRIP.leftPanel, P ? 0 : -90, P ? 90 : 20);
  const topLeft = strip(frame, STRIP.topbarEnds, -80, -60);
  const topRight = strip(frame, STRIP.topbarEnds, 80, -60);
  const toolbarShell = strip(frame, STRIP.toolbarShell, 0, -50);
  const canvasFrame = strip(frame, STRIP.canvasBg, 0, 40);

  // 画布卡片错峰蒸发（各错 3f，左右交替散开）
  const cardStrip = (i: number) => strip(frame, STRIP.canvasCards + i * 3, i % 2 ? 70 : -70, 50 + i * 10);

  // 按钮：点击脉冲 + 最后淡出
  const press = spring({ frame: frame - CLICK, fps, config: { damping: 12, stiffness: 220 } });
  const pressScale = frame < CLICK ? 1 : 1 - 0.12 * Math.sin(Math.min(1, press) * Math.PI);
  const btnOp = 1 - ramp(frame, BTN_FADE, 12, EASE.exit);
  // 蒸发期间按钮从工具条位置滑向屏幕中心，独占黑场
  const btnCenter = interpolate(frame, [STRIP.toolbarShell, STRIP.toolbarShell + 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  const btnX = mix(BTN_FROM.x, BTN_TO.x, btnCenter);
  const btnY = mix(BTN_FROM.y, BTN_TO.y, btnCenter);
  const btnScale = 1 + 0.5 * btnCenter;
  // 迁移最快段的方向性拖影（按每帧位移给模糊，静止为 0）
  const dPrev = interpolate(frame - 1, [STRIP.toolbarShell, STRIP.toolbarShell + 18], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic),
  });
  const btnSpeed = Math.hypot(BTN_TO.x - BTN_FROM.x, BTN_TO.y - BTN_FROM.y) * Math.abs(btnCenter - dPrev);
  const btnBlur = Math.min(3, btnSpeed * 0.04);
  // 按钮淡出时略微放大"化开"，把黑场交给字标
  const btnRelease = ramp(frame, BTN_FADE, 12, EASE.out);

  // 字标接棒：spring 定版 + 对焦模糊；字标比图形晚 3f（跟随）
  const logoP = spring({ frame: frame - LOGO_IN, fps, config: { damping: 14, stiffness: 90 } });
  const wordP = spring({ frame: frame - LOGO_IN - 3, fps, config: { damping: 14, stiffness: 90 } });
  const tagP = spring({ frame: frame - LOGO_IN - 10, fps, config: { damping: 16, stiffness: 90 } });
  // 字标尺寸（虚拟坐标；竖版 ×1.5 后更大）：名字一行装下
  const markS = P ? 120 : 132;
  const nameMaxW = VW - 160 - (markS + 30);
  const nameS = name ? fitSize(name, { family: BRAND.font, size: P ? 72 : 68, maxWidth: nameMaxW, weight: 700, minSize: 30, letterSpacingEm: 0.03 }) : 0;
  const tagS = tagline ? fitSize(tagline, { family: fonts.sans, size: name ? (P ? 34 : 30) : P ? 60 : 56, maxWidth: VW - 160, weight: name ? 500 : 650, minSize: 20 }) : 0;

  // 光标移向按钮：x、y 用不同缓动，走一条手腕带出的弧线；点击时笔尖压下
  const curX = interpolate(frame, [4, CLICK - 2], [VW * 0.43, BTN_FROM.x + 18], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad),
  });
  const curY = interpolate(frame, [4, CLICK - 2], [VH * 0.59, BTN_FROM.y + 4], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.3, 0, 0.15, 1),
  });
  const curOp = 1 - ramp(frame, CLICK + 6, 10, EASE.out);
  const curPress = frame >= CLICK - 1 && frame < CLICK + 3 ? 0.88 : 1;

  const toolbarBase: React.CSSProperties = {
    position: 'absolute', top: 0, height: 60, background: '#fbfbfa', borderBottom: hairline(0.08),
    boxSizing: 'border-box', display: 'flex', alignItems: 'center', fontFamily: FONT.sans, whiteSpace: 'nowrap', overflow: 'hidden',
  };
  const url = name ? `${name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '')}.vn` : 'xem-truoc.app';

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : INK, overflow: 'hidden' }}>
      {/* 黑场：中心极弱冷光（随压黑亮起） */}
      {!bd && <AbsoluteFill style={{
        opacity: bgDark,
        background: `radial-gradient(ellipse 50% 45% at 50% 50%, ${rgba(ACCENT, 0.1)} 0%, ${rgba(ACCENT, 0.03)} 50%, rgba(0,0,0,0) 75%)`,
      }} />}

      {/* 编辑器底（画布，作为一层可蒸发的背景）— [Agent Edit] bo luoi cham trang tri, giu mat phang giao dien */}
      <AbsoluteFill style={{
        opacity: 1 - bgDark,
        backgroundColor: '#ececea',
      }} />

      <div style={{ position: 'absolute', left: 0, top: 0, width: VW, height: VH, transform: `scale(${K})`, transformOrigin: '0 0' }}>
        {/* 左侧栏（图层面板） */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 240, boxSizing: 'border-box', paddingTop: 76,
          background: 'linear-gradient(180deg, #1c1d22 0%, #16171b 100%)', boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.06)',
          fontFamily: FONT.sans, ...sidebar,
        }}>
          <div style={{ padding: '0 18px 12px', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.36)' }}>CÁC LỚP</div>
          {LAYERS.map(([ic, nm, depth, sel]) => (
            <div key={nm} style={{
              height: 32, margin: '0 10px', borderRadius: 7, display: 'flex', alignItems: 'center', gap: 9, whiteSpace: 'nowrap', overflow: 'hidden',
              paddingLeft: 10 + depth * 16, fontSize: 13, color: sel ? '#fff' : 'rgba(255,255,255,0.62)',
              background: sel ? rgba(ACCENT, 0.24) : 'transparent',
              boxShadow: sel ? `inset 0 0 0 1px ${rgba(ACCENT, 0.4)}` : 'none',
            }}>
              <Icon d={IC[ic as keyof typeof IC]} size={14} color={sel ? '#dfe2ff' : 'rgba(255,255,255,0.42)'} />
              {nm}
            </div>
          ))}
        </div>

        {/* 属性面板（横版右侧 / 竖版底部） */}
        <div style={{
          position: 'absolute', ...panel, background: '#fbfbfa', borderLeft: hairline(0.08), borderTop: P ? hairline(0.08) : undefined,
          padding: 22, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 18, ...leftPanel,
        }}>
          <Section title="Khung">
            <div style={{ display: 'flex', gap: 8 }}><Field label="X" value="320" /><Field label="Y" value="130" /></div>
            <div style={{ display: 'flex', gap: 8 }}><Field label="R" value="1180" /><Field label="C" value="850" /></div>
          </Section>
          <Section title="Bố cục">
            <div style={{ display: 'flex', gap: 8 }}><Field label="Khoảng cách" value="40" /><Field label="Lề" value="70" /></div>
          </Section>
          <Section title="Màu nền">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: '#ffffff', border: hairline(0.12), boxSizing: 'border-box', flex: 'none' }} />
              <Field label="Mã" value="FFFFFF" />
              <Field label="" value="100%" w={64} />
            </div>
          </Section>
          <Section title="Hiệu ứng" style={{ borderBottom: 'none' }}>
            <div style={{ display: 'flex', gap: 8 }}><Field label="Đổ bóng" value="Mềm · 16" /></div>
          </Section>
        </div>

        {/* 顶部工具条左段（logo + 工具） */}
        <div style={{ ...toolbarBase, left: 0, width: TB[0], gap: 6, padding: '0 16px', ...topLeft }}>
          <div style={{ marginRight: 14, flex: 'none' }}><ShotcraftMark size={34} tone="light" /></div>
          {[IC.cursor, IC.frame, IC.text, IC.pen, IC.image, IC.comp].map((d, i) => (
            <div key={i} style={{
              width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
              background: i === 0 ? rgba(ACCENT, 0.11) : 'transparent',
            }}>
              <Icon d={d} size={18} color={i === 0 ? ACCENT : G.ink2} />
            </div>
          ))}
        </div>
        {/* 顶部工具条中段（标题） */}
        <div style={{ ...toolbarBase, left: TB[0], width: TB[1] - TB[0], justifyContent: 'center', gap: 10, ...toolbarShell }}>
          {name ? <><span style={{ fontSize: 14, color: G.ink3 }}>{name}</span><span style={{ fontSize: 14, color: G.ink3 }}>/</span></> : null}
          <span style={{ fontSize: fitSize(project, { family: fonts.sans, size: 14, maxWidth: (TB[1] - TB[0]) * 0.5, weight: 600, minSize: 9 }), color: G.ink1, fontWeight: 600, letterSpacing: '-0.01em' }}>{project}</span>
          <span style={{ fontSize: 11.5, fontWeight: 500, color: G.ink2, padding: '3px 8px', borderRadius: 6, background: G.fill2 }}>Bản nháp</span>
        </div>
        {/* 顶部工具条右段底板（头像 + 邀请；按钮单独渲染在最上层） */}
        <div style={{ ...toolbarBase, left: TB[1], right: 0, justifyContent: 'flex-end', gap: 12, padding: `0 ${24 + BTN_W + 12}px 0 24px`, ...topRight }}>
          <div style={{ display: 'flex' }}>
            {['TL', 'MH'].map((n, i) => (
              <div key={n} style={{
                width: 30, height: 30, borderRadius: 15, marginLeft: i ? -8 : 0, background: i ? '#dfe1e8' : '#e9e6df',
                border: '2px solid #fbfbfa', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 600, color: '#4a4c53',
              }}>{n}</div>
            ))}
          </div>
          <div style={{
            height: 34, padding: '0 14px', borderRadius: 9, border: hairline(0.13), boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', fontSize: 13.5, fontWeight: 500, color: G.ink1, background: '#fff',
            boxShadow: softShadow(1),
          }}>Mời</div>
        </div>

        {/* 画布区：一张浏览器式大卡 + 四张内容卡（或截图 2×2 分块） */}
        <div style={{ position: 'absolute', left: canvas.x, top: canvas.y, width: canvas.w, height: canvas.h, ...canvasFrame }}>
          <div style={{
            position: 'absolute', inset: 0, background: G.card, border: hairline(0.09), borderRadius: 18, overflow: 'hidden',
            boxShadow: `${innerHighlight(0.9)}, ${softShadow(22)}`,
          }}>
            <div style={{
              height: BAR, borderBottom: hairline(0.07), display: 'flex', alignItems: 'center', gap: 8, padding: '0 18px',
              background: 'linear-gradient(180deg, #fbfbfa 0%, #f5f5f3 100%)',
            }}>
              {['#ec6a5e', '#f4bf4f', '#61c554'].map((c) => (
                <div key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c, opacity: 0.85 }} />
              ))}
              <div style={{
                marginLeft: 16, height: 26, width: Math.min(380, canvas.w - 160), background: G.fill, borderRadius: 8, display: 'flex', alignItems: 'center',
                padding: '0 12px', fontFamily: FONT.sans, fontSize: 12.5, color: G.ink2, gap: 6, whiteSpace: 'nowrap', overflow: 'hidden',
              }}>
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={G.ink3} strokeWidth={2.4}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                {url}
              </div>
            </div>
          </div>
          {tiles.map((t, i) => {
            const s = cardStrip(i);
            return (
              <div key={i} style={{ position: 'absolute', left: t.x, top: t.y, width: t.w, height: t.h, ...s }}>
                {screen ? (
                  // 截图分块：每块露出整张图（在内容区 cover）的对应区域；块与块之间留缝 = "碎开走"
                  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: i === 2 ? '0 0 0 17px' : i === 3 ? '0 0 17px 0' : 0 }}>
                    <img src={screen} style={{
                      position: 'absolute', left: -t.x, top: -(t.y - BAR), width: canvas.w, height: canvas.h - BAR, objectFit: 'cover', objectPosition: '50% 0%',
                    }} />
                  </div>
                ) : (
                  <MiniCard w={t.w} h={t.h} i={i} accent={ACCENT} />
                )}
              </div>
            );
          })}
        </div>

        {/* Publish 按钮（高亮层，最后退场）：按中心定位，尺寸按布局放大（字边清晰） */}
        <div
          style={{
            position: 'absolute', left: btnX, top: btnY, width: 0, height: 0, zIndex: 30,
            opacity: btnOp, transform: `scale(${pressScale * (1 + 0.06 * btnRelease)})`,
            filter: btnBlur > 0.2 ? `blur(${btnBlur.toFixed(2)}px)` : undefined,
          }}
        >
          {/* 黑场上的主角光环：同色柔光盘，随压黑增强 */}
          <div style={{
            position: 'absolute', left: -260, top: -160, width: 520, height: 320, borderRadius: '50%',
            background: `radial-gradient(ellipse at center, ${rgba(ACCENT, 0.38)} 0%, ${rgba(ACCENT, 0.1)} 40%, ${rgba(ACCENT, 0)} 70%)`,
            opacity: btnCenter * bgDark,
          }} />
          <div
            style={{
              position: 'absolute',
              width: BTN_W * btnScale, height: BTN_H * btnScale,
              left: -(BTN_W * btnScale) / 2, top: -(BTN_H * btnScale) / 2,
              borderRadius: 10 * btnScale,
              background: `linear-gradient(180deg, ${shade(ACCENT, 0.1)} 0%, ${shade(ACCENT, -0.08)} 100%)`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.28), inset 0 0 0 1px rgba(255,255,255,0.06), 0 1px 2px rgba(30,34,120,0.35), 0 0 ${30 + 40 * btnCenter}px ${rgba(ACCENT, 0.18 + 0.4 * btnCenter * bgDark)}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 * btnScale, whiteSpace: 'nowrap',
              fontFamily: FONT.sans, fontWeight: 600, fontSize: btnFont * btnScale, letterSpacing: '-0.01em', color: LOOKS.porcelain.onAccent,
            }}
          >
            <svg width={14 * btnScale} height={14 * btnScale} viewBox="0 0 24 24" fill="none" stroke={LOOKS.porcelain.onAccent} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
            {cta}
          </div>
        </div>

        {/* 字标接棒（名字 / 品牌；都没有 → 只留标语） */}
        {frame >= LOGO_IN && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: P ? 40 : 30 }}>
            {name || BRAND.name ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 30, transform: `scale(${0.86 + 0.14 * logoP})` }}>
                <div style={{ opacity: Math.min(1, logoP * 1.4), filter: logoP < 0.995 ? `blur(${((1 - logoP) * 9).toFixed(2)}px)` : undefined }}>
                  <ShotcraftMark size={markS} tone="dark" />
                </div>
                {name ? (
                  <div style={{
                    opacity: Math.min(1, wordP * 1.4), transform: `translateX(${((1 - wordP) * -16).toFixed(2)}px)`,
                    filter: wordP < 0.995 ? `blur(${((1 - wordP) * 9).toFixed(2)}px)` : undefined,
                    fontFamily: BRAND.font, fontWeight: 700, fontSize: nameS, lineHeight: 1.25, letterSpacing: '0.03em', color: BRAND.paper, paddingBottom: 4, whiteSpace: 'nowrap', textShadow: onBg,
                  }}>
                    {name}
                  </div>
                ) : null}
              </div>
            ) : null}
            {tagline ? (
              <div style={{
                opacity: Math.min(1, (name ? tagP : logoP) * 1.3), transform: `translateY(${((1 - (name ? tagP : logoP)) * 14).toFixed(2)}px) scale(${name ? 1 : 0.9 + 0.1 * logoP})`,
                filter: (name ? tagP : logoP) < 0.995 ? `blur(${((1 - (name ? tagP : logoP)) * 8).toFixed(2)}px)` : undefined,
                fontFamily: fonts.sans, fontWeight: name ? 500 : 650, fontSize: tagS, lineHeight: 1.3, color: name ? (bd ? 'rgba(245,243,238,0.86)' : 'rgba(245,243,238,0.66)') : BRAND.paper, whiteSpace: 'nowrap', textShadow: onBg,
              }}>
                {tagline}
              </div>
            ) : null}
          </div>
        )}

        {/* 光标 */}
        <svg width={30} height={38} viewBox="0 0 14 18" style={{
          position: 'absolute', left: curX, top: curY, opacity: curOp, zIndex: 40,
          transform: `scale(${curPress})`, transformOrigin: '2px 2px', filter: 'drop-shadow(0 3px 5px rgba(16,18,24,0.3))',
        }}>
          <path d="M1 1 L1 15 L4.6 11.6 L7.2 17 L9.4 16 L6.9 10.7 L12 10.7 Z" fill="#111216" stroke="#ffffff" strokeWidth={1.1} strokeLinejoin="round" />
        </svg>
      </div>

      {/* 暗角 + 颗粒：随压黑加深（亮场时几乎不压） */}
      {!bd && <Vignette strength={0.12 + 0.45 * bgDark} inner={0.42} color="#000000" />}
      {!bd && <Grain opacity={0.05 + 0.03 * bgDark} blend="soft-light" />}
    </AbsoluteFill>
  );
};
