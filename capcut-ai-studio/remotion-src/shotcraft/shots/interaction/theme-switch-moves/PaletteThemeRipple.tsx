// 组合：命令面板 × 深浅涟漪（palette-theme-ripple）——第二轮重设计：video-shotcraft 样片画廊 · 关灯
//
// 设计决定：
// - 主体：满屏的 video-shotcraft 样片画廊（品牌轮由虚构音乐库 Overtone 换来，版式逐像素不变）——
//   112px「Gallery」大标题、5 张 259px 程序化镜头缩略图（同一批缩略图在深浅两版里完全不变，只换 UI 外壳——
//   真实产品的深色模式就是这样）、底部正在预览的样片播放条。侧栏标志 = 「镜刻」ShotcraftMark（随主题换反白版）。
// - look = custom：浅版冷瓷灰白 + 珊瑚红强调；深版近黑石墨 + 同色相更亮的珊瑚。强调色只给选中态 / 播放进度 / 涟漪。
// - 因果链（组合命门）：⌘K 面板落下 → 人手节奏打 "dark"（不等间隔）→ 回车 → 面板像老电视关机一样
//   先纵向压成一条亮线、再横向收成一个亮点 → 亮点在原地钉 5f → 深色涟漪**从这个点**荡开换肤。
//   收缩点 = 面板中心 = 涟漪圆心 ORIGIN；收缩完成帧 = 亮点帧，亮点结束帧 = 涟漪起始帧 RIPPLE。
// - 涟漪：3px 白热环 + 珊瑚外辉 + 内侧白辉，外加一道晚 4f 的淡回声环；深版从圆心 1.035→1 收拢"坐实"。
//   深版落定后专辑封面在暗场里各自投下一圈同色辉光（只有深色模式才看得见的光）。
// - 相机：打字时极缓推向面板（1→1.03），涟漪荡开时顺势呼一口气退回 1，hold 段再 1→1.012 极缓推。
//
// 时间表（30fps，共 156f）：
//   0–10    静置：浅色样片画廊（播放进度在走，画面不死）
//   10–18   压暗 + 虚化背景（8f EASE.out）；12 面板弹簧落下（damping 17，一次轻过冲）
//   24–37   打字 d·a·r·k（24/28/31/37，人手不等间隔）；匹配字母逐个加粗，37 首行进入选中态
//   46      回车：首行闪一下、↵ 键帽按下
//   48–56   CRT 关机式收缩：48–52 纵向压成亮线（ease-in），52–56 横向收成亮点；背景同步去虚化
//   56–61   亮点钉在 ORIGIN（因果钉扎）
//   61–95   深色涟漪荡开（34f，强 ease-out：起步猛、边缘越走越缓）+ 回声环；相机 1.03→1
//   95–156  hold：深色定格，封面辉光亮起（95–112），进度条继续走，相机 1→1.012
//
// [Agent Edit] o chu: title (tieu de lon cua trang thu vien — ten muc / ten app trong loi noi) / command (lenh dong 1 cua
// bang lenh; tu "tối" trong lenh duoc go va to dam). Ten thuong hieu cua video -> logo + ten o thanh ben (khong co -> "Thư
// viện"). Moi chu giao dien khac = tieng Viet trung tinh. Khung doc (portrait.mode = 'native'): the gioi logic 1200 x
// (1200*H/1920) phong 1.6x; thu vien xep luoi 2 cot, thanh ben thanh hang thuong hieu tren cung; bang lenh / tam gon /
// gon song giu nguyen (tam = tam bang lenh, ban kinh cuoi = goc xa nhat x1.1).
import { useBrand, useCurrentFrame, useShotFonts, useText, useVideoConfig, fitSize } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, Grain, Vignette, bezier, mix, ramp } from '../../../fixtures/Polish';
import { alpha, springAt } from '../../../fixtures/Look';
import { ShotcraftMark } from '../../../fixtures/Brand';

export const PALETTE_THEME_RIPPLE_DURATION = 156;

// ───────────── 时间轴 ─────────────
const DIM0 = 10;
const PANEL_IN = 12;
const TYPE_FRAMES = [24, 28, 33]; // t ố i —— 人手节奏：起手快、末字犹豫一下
const SEL = 37; // 首行进入选中态（原版 = 第 4 键）
const ENTER = 46;
const SQUASH = 48; // 纵向压线开始
const LINE = 52; // 压成线 → 开始横向收点
const DOT = 56; // 收成点（= 亮点帧）
const RIPPLE = 61; // 亮点钉 5f 后涟漪起跳（组合命门：圆心 = 收缩点）
const RIPPLE_END = 95;
// ORIGIN（面板中心 = 收缩点 = 涟漪圆心）与 MAX_R（圆心到最远角 ×1.1）随画幅在组件里计算（横屏 = 原版 960,452 / 1260）
const QUERY = 'tối';

// ───────────── 两套外壳（同布局，逐键映射）─────────────
type Theme = {
  dark: boolean; bg: string; side: string; surface: string; chip: string; line: string;
  ink: string; ink2: string; ink3: string; accent: string; bar: string;
};
const LIGHT: Theme = {
  dark: false, bg: '#f1f2f4', side: '#e8eaed', surface: '#ffffff', chip: '#e3e6ea', line: 'rgba(15,20,30,0.08)',
  ink: '#0f1217', ink2: '#5a616e', ink3: '#9aa1ad', accent: '#f2483a', bar: 'rgba(248,249,250,0.92)',
};
const DARK: Theme = {
  dark: true, bg: '#0b0d10', side: '#08090b', surface: '#15181c', chip: '#1b1f24', line: 'rgba(255,255,255,0.07)',
  ink: '#f3f4f6', ink2: '#939aa7', ink3: '#59606c', accent: '#ff5f48', bar: 'rgba(16,18,22,0.94)',
};

// ───────────── 程序化镜头缩略图（深浅两版共用，不随主题变）─────────────
type Album = { t: string; a: string; glow: string; Art: React.FC };
const ArtLowTide: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #0f2747 0%, #1d5f74 58%, #e7a874 100%)' }}>
    <div style={{ position: 'absolute', left: '30%', top: '30%', width: '40%', height: '40%', borderRadius: '50%', background: 'radial-gradient(circle at 50% 40%, #ffe6bd, #f7b57a)', boxShadow: '0 0 40px rgba(255,200,140,0.6)' }} />
    <div style={{ position: 'absolute', left: 0, right: 0, top: '62%', bottom: 0, background: 'repeating-linear-gradient(180deg, rgba(10,30,55,0.92) 0px, rgba(10,30,55,0.92) 7px, rgba(255,200,150,0.35) 7px, rgba(255,200,150,0.35) 9px)' }} />
  </div>
);
const ArtPaperMoons: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, background: '#f1d8c2' }}>
    <div style={{ position: 'absolute', left: '12%', top: '18%', width: '52%', height: '52%', borderRadius: '50%', background: '#e46a4e' }} />
    <div style={{ position: 'absolute', left: '36%', top: '34%', width: '52%', height: '52%', borderRadius: '50%', background: '#253a63', mixBlendMode: 'multiply' }} />
    <div style={{ position: 'absolute', left: '58%', top: '12%', width: '22%', height: '22%', borderRadius: '50%', background: '#f4b23e' }} />
  </div>
);
const ArtNeonOrchard: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(150deg, #ff2f7d 0%, #ff8a3a 100%)', overflow: 'hidden' }}>
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
      {Array.from({ length: 9 }, (_, i) => <line key={`h${i}`} x1={0} x2={100} y1={55 + i * i * 0.6} y2={55 + i * i * 0.6} stroke="rgba(255,255,255,0.45)" strokeWidth={0.5} />)}
      {Array.from({ length: 11 }, (_, i) => <line key={`v${i}`} x1={50} y1={55} x2={-50 + i * 20} y2={100} stroke="rgba(255,255,255,0.45)" strokeWidth={0.5} />)}
      <circle cx={50} cy={38} r={17} fill="#ffe14d" />
      {[0, 1, 2, 3].map((i) => <rect key={i} x={30} y={40 + i * 4} width={40} height={1.6} fill="#ff4f6e" />)}
    </svg>
  </div>
);
const ArtStaticBloom: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 50%, #2c5a3e, #142b1f)' }}>
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <circle key={i} cx={50 + Math.cos(a) * 17} cy={50 + Math.sin(a) * 17} r={13} fill="#9fe48c" opacity={0.85} style={{ mixBlendMode: 'screen' }} />;
      })}
      <circle cx={50} cy={50} r={9} fill="#f4f8cc" />
    </svg>
  </div>
);
const ArtNightSwim: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, background: '#060a14', overflow: 'hidden' }}>
    <div style={{ position: 'absolute', inset: '-20%', transform: 'rotate(-28deg)', background: 'repeating-linear-gradient(90deg, rgba(70,120,255,0.0) 0px, rgba(70,120,255,0.0) 16px, rgba(70,140,255,0.75) 16px, rgba(70,140,255,0.75) 22px)' }} />
    <div style={{ position: 'absolute', right: '16%', top: '14%', width: '16%', height: '16%', borderRadius: '50%', background: '#eef3ff', boxShadow: '0 0 24px rgba(220,230,255,0.8)' }} />
  </div>
);
const ArtGlassHarbor: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #19c3b4 0%, #2a3d9e 100%)' }}>
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
      {[14, 24, 34, 44].map((r) => <circle key={r} cx={30} cy={70} r={r} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={1.2} />)}
    </svg>
  </div>
);

const ALBUMS: Album[] = [
  { t: 'Thủy triều', a: 'Phong cảnh', glow: '#f2a46e', Art: ArtLowTide },
  { t: 'Trăng giấy', a: 'Minh họa', glow: '#e46a4e', Art: ArtPaperMoons },
  { t: 'Vườn neon', a: 'Đô thị', glow: '#ff5a6a', Art: ArtNeonOrchard },
  { t: 'Nở hoa', a: 'Thiên nhiên', glow: '#7ed67a', Art: ArtStaticBloom },
  { t: 'Bơi đêm', a: 'Ban đêm', glow: '#5c8cff', Art: ArtNightSwim },
];
const ROW2: { Art: React.FC; hue: number }[] = [
  { Art: ArtNightSwim, hue: 140 }, { Art: ArtStaticBloom, hue: -60 }, { Art: ArtLowTide, hue: 40 }, { Art: ArtNeonOrchard, hue: 160 }, { Art: ArtPaperMoons, hue: 180 },
];

// ───────────── 布局（逻辑世界 LW×LH；横屏 = 原版 1920×1080）─────────────
type Geo = {
  portrait: boolean; LW: number; LH: number; K: number;
  SIDE_W: number; MAIN_X: number; MAIN_W: number; TILE_GAP: number; TILE: number; COLS: number; ROW1_Y: number; ROW_STEP: number; BAR_H: number;
};
const makeGeo = (SH: number): Geo => {
  const portrait = SH > 1080 * 1.2;
  const K = portrait ? 1.6 : 1;
  const LW = 1920 / K;
  const LH = SH / K;
  if (!portrait) {
    const MAIN_X = 430;
    const MAIN_W = 1920 - MAIN_X - 112;
    const TILE = (MAIN_W - 36 * 4) / 5;
    return { portrait, LW, LH, K, SIDE_W: 350, MAIN_X, MAIN_W, TILE_GAP: 36, TILE, COLS: 5, ROW1_Y: 300, ROW_STEP: TILE + 130, BAR_H: 124 };
  }
  const MAIN_X = 60;
  const MAIN_W = LW - 120;
  const TILE = (MAIN_W - 36) / 2;
  return { portrait, LW, LH, K, SIDE_W: 0, MAIN_X, MAIN_W, TILE_GAP: 36, TILE, COLS: 2, ROW1_Y: 420, ROW_STEP: TILE + 130, BAR_H: 150 };
};

// 16 网格线性图标
const Ic: React.FC<{ d: string[]; color: string; size?: number; w?: number }> = ({ d, color, size = 28, w = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: 'block', flex: 'none' }}>
    {d.map((p, i) => <path key={i} d={p} stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />)}
  </svg>
);
const I = {
  play: ['M5 3.5v9l7-4.5z'],
  grid: ['M2.5 2.5h4.5v4.5h-4.5z', 'M9 2.5h4.5v4.5h-4.5z', 'M2.5 9h4.5v4.5h-4.5z', 'M9 9h4.5v4.5h-4.5z'],
  radio: ['M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'M4.8 4.8a4.5 4.5 0 0 0 0 6.4', 'M11.2 4.8a4.5 4.5 0 0 1 0 6.4'],
  lib: ['M3 2.5v11', 'M6 2.5v11', 'M9 3l3.5 10'],
  sliders: ['M2.5 4.5h11', 'M2.5 11.5h11', 'M5.5 2.5v4', 'M10.5 9.5v4'],
  list: ['M2.5 4h11', 'M2.5 8h11', 'M2.5 12h7'],
  moon: ['M13 9.6A5.5 5.5 0 1 1 6.4 3a4.4 4.4 0 0 0 6.6 6.6z'],
  half: ['M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z', 'M8 2.5v11'],
  gear: ['M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1'],
  search: ['M7 11.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z', 'm10.5 10.5 3 3'],
  prev: ['M4 3.5v9', 'M12.5 3.5v9l-6.5-4.5z'],
  next: ['M12 3.5v9', 'M3.5 3.5v9l6.5-4.5z'],
};

// ───────────── 整个 App（两版主题共用这一份布局）─────────────
type AppText = { title: string; brand: string; sans: string };
const App: React.FC<{ th: Theme; frame: number; artGlow: number; g: Geo; tx: AppText }> = ({ th, frame, artGlow, g, tx }) => {
  const { portrait, SIDE_W, MAIN_X, MAIN_W, TILE_GAP, TILE, COLS, ROW1_Y, ROW_STEP, BAR_H } = g;
  const prog = 0.34 + frame * 0.0009; // 播放进度一直在走
  const titleSize = fitSize(tx.title, { family: tx.sans, size: 112, maxWidth: portrait ? MAIN_W : MAIN_W - 40, weight: 800, minSize: 60, letterSpacingEm: -0.04 });
  const brandSize = fitSize(tx.brand, { family: tx.sans, size: 34, maxWidth: portrait ? MAIN_W - 70 : SIDE_W - 104 - 70, weight: 700, minSize: 20 });
  // 封面网格：前 5 张带标题（ALBUMS），其余为纵深行（ROW2，被播放条截断）
  const tiles: { Art: React.FC; hue: number; al?: Album }[] = [...ALBUMS.map((al) => ({ Art: al.Art, hue: 0, al })), ...ROW2];
  const nTiles = portrait ? 8 : 10;
  return (
    <div style={{ position: 'absolute', inset: 0, background: th.bg, fontFamily: tx.sans, color: th.ink, overflow: 'hidden' }}>
      {/* 竖屏：品牌行代替侧栏 */}
      {portrait && (
        <div style={{ position: 'absolute', left: MAIN_X, top: 74, display: 'flex', alignItems: 'center', gap: 14 }}>
          <ShotcraftMark size={44} tone={th.dark ? 'dark' : 'light'} />
          <span style={{ fontSize: brandSize, fontWeight: 700, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>{tx.brand}</span>
        </div>
      )}
      {/* 侧栏 */}
      {!portrait && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: SIDE_W, background: th.side, borderRight: `1px solid ${th.line}`, padding: '64px 0 0 104px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 64 }}>
          {/* 「镜刻」标志：亮版墨框 / 深版反白框，琥珀斜切不变（标志本身不加底块与渐变） */}
          <ShotcraftMark size={44} tone={th.dark ? 'dark' : 'light'} />
          <span style={{ fontSize: brandSize, fontWeight: 700, letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>{tx.brand}</span>
        </div>
        {[
          { l: 'Trang chủ', i: I.play },
          { l: 'Khám phá', i: I.grid },
          { l: 'Chỉnh sửa', i: I.sliders },
          { l: 'Thư viện', i: I.lib, on: true },
          { l: 'Đã lưu', i: I.list },
        ].map((n) => (
          <div key={n.l} style={{
            display: 'flex', alignItems: 'center', gap: 18, height: 64, marginLeft: -18, marginRight: 34, paddingLeft: 18, borderRadius: 14,
            background: n.on ? (th.dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,20,30,0.06)') : 'transparent',
            color: n.on ? th.ink : th.ink2, fontSize: 28, fontWeight: n.on ? 650 : 500, whiteSpace: 'nowrap',
          }}>
            <Ic d={n.i} color={n.on ? th.accent : th.ink3} />
            {n.l}
          </div>
        ))}
      </div>}

      {/* 标题区 */}
      <div style={{ position: 'absolute', left: MAIN_X, top: portrait ? 150 : 60, fontSize: titleSize, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{tx.title}</div>
      <div style={{ position: 'absolute', left: MAIN_X, top: portrait ? 310 : 208, display: 'flex', gap: 12 }}>
        {['Tất cả', 'Mới nhất', 'Yêu thích', 'Dành cho bạn'].map((c, i) => (
          <div key={c} style={{
            padding: '10px 24px', borderRadius: 999, fontSize: 26, fontWeight: i === 0 ? 650 : 500, whiteSpace: 'nowrap',
            background: i === 0 ? th.ink : th.chip, color: i === 0 ? th.bg : th.ink2,
          }}>{c}</div>
        ))}
      </div>
      {!portrait && <div style={{ position: 'absolute', right: 112, top: 222, fontSize: 26, color: th.ink3, fontWeight: 500 }}>1080p · mới nhất trước</div>}

      {/* 封面网格：带标题的封面（深色版各自投下同色辉光）+ 纵深行 */}
      {tiles.slice(0, nTiles).map((tl, i) => {
        const x = MAIN_X + (i % COLS) * (TILE + TILE_GAP);
        const y = ROW1_Y + Math.floor(i / COLS) * ROW_STEP;
        const al = tl.al;
        return (
          <React.Fragment key={i}>
            {al && th.dark && (
              <div style={{
                position: 'absolute', left: x - 90, top: y - 30, width: TILE + 180, height: TILE + 170,
                background: `radial-gradient(ellipse 50% 50% at 50% 55%, ${alpha(al.glow, 0.5 * artGlow)} 0%, ${alpha(al.glow, 0)} 70%)`,
              }} />
            )}
            <div style={{
              position: 'absolute', left: x, top: y, width: TILE, height: TILE, borderRadius: 18, overflow: 'hidden',
              filter: tl.hue ? `hue-rotate(${tl.hue}deg) saturate(0.85)` : undefined,
              boxShadow: !al ? undefined : th.dark ? 'inset 0 0 0 1px rgba(255,255,255,0.08), 0 20px 40px -18px rgba(0,0,0,0.9)' : '0 1px 2px rgba(15,20,30,0.08), 0 18px 36px -18px rgba(15,20,30,0.35)',
            }}>
              <tl.Art />
            </div>
            {al && <div style={{ position: 'absolute', left: x, top: y + TILE + 22, fontSize: 30, fontWeight: 650, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{al.t}</div>}
            {al && <div style={{ position: 'absolute', left: x, top: y + TILE + 62, fontSize: 25, color: th.ink2, whiteSpace: 'nowrap' }}>{al.a}</div>}
          </React.Fragment>
        );
      })}

      {/* 正在播放条 */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: BAR_H, background: th.bar, borderTop: `1px solid ${th.line}`,
        display: 'flex', alignItems: 'center', padding: portrait ? `0 ${MAIN_X}px` : '0 104px 0 104px', boxSizing: 'border-box',
        boxShadow: th.dark ? '0 -20px 40px rgba(0,0,0,0.5)' : '0 -16px 40px rgba(15,20,30,0.06)',
      }}>
        <div style={{ position: 'relative', width: 76, height: 76, borderRadius: 12, overflow: 'hidden', flex: 'none' }}><ArtGlassHarbor /></div>
        <div style={{ marginLeft: 22, width: portrait ? 'auto' : 330, flex: portrait ? 1 : undefined, whiteSpace: 'nowrap' }}>
          <div style={{ fontSize: 28, fontWeight: 650, letterSpacing: '-0.02em' }}>Video giới thiệu</div>
          <div style={{ fontSize: 23, color: th.ink2, marginTop: 4 }}>Xem trước · Cảnh 04</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 34, marginLeft: portrait ? 20 : 120 }}>
          <Ic d={I.prev} color={th.ink2} size={30} w={1.8} />
          <div style={{ width: 66, height: 66, borderRadius: 33, background: th.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={26} height={26} viewBox="0 0 16 16"><rect x={4} y={3} width={2.6} height={10} rx={1} fill={th.bg} /><rect x={9.4} y={3} width={2.6} height={10} rx={1} fill={th.bg} /></svg>
          </div>
          <Ic d={I.next} color={th.ink2} size={30} w={1.8} />
        </div>
        {portrait ? (
          <div style={{ position: 'absolute', left: 0, right: 0, top: -1, height: 5, background: th.chip }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${prog * 100}%`, background: th.accent, boxShadow: th.dark ? `0 0 12px ${alpha(th.accent, 0.6)}` : 'none' }} />
          </div>
        ) : (
        <div style={{ marginLeft: 70, flex: 1, display: 'flex', alignItems: 'center', gap: 20, fontSize: 22, color: th.ink3, fontVariantNumeric: 'tabular-nums' }}>
          <span>{`0:${String(Math.floor(22 + frame / 30)).padStart(2, '0')}`}</span>
          <div style={{ position: 'relative', flex: 1, height: 6, borderRadius: 3, background: th.chip }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${prog * 100}%`, borderRadius: 3, background: th.accent, boxShadow: th.dark ? `0 0 12px ${alpha(th.accent, 0.6)}` : 'none' }} />
          </div>
          <span style={{ marginRight: 4 }}>0:48</span>
        </div>
        )}
      </div>
    </div>
  );
};

const Kbd: React.FC<{ children: React.ReactNode; on?: number; press?: number }> = ({ children, on = 0, press = 0 }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 40, height: 40, padding: '0 10px', boxSizing: 'border-box',
    borderRadius: 9, fontSize: 21, fontWeight: 600, color: on > 0.5 ? '#ffffff' : '#7a818d',
    background: on > 0.5 ? 'rgba(255,255,255,0.22)' : '#eef0f3',
    boxShadow: on > 0.5 ? `inset 0 ${-2 + press * 2}px 0 rgba(0,0,0,0.18)` : 'inset 0 -2px 0 rgba(15,20,30,0.08), inset 0 0 0 1px rgba(15,20,30,0.06)',
    transform: `translateY(${(press * 2).toFixed(2)}px)`,
  }}>{children}</span>
);

const RIPPLE_EASE = bezier(0.2, 0.55, 0.3, 1); // 强 ease-out：起步猛，边缘越走越缓（但圆形全程读得出）

export const PaletteThemeRipple: React.FC = () => {
  const f = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const g = makeGeo(SH);
  const { LW, LH, K } = g;
  const fonts = useShotFonts();
  const brand = useBrand();
  const tx: AppText = {
    title: useText('title', 'Thư viện ảnh'),
    brand: (brand?.name ?? '').trim() || 'Thư viện',
    sans: fonts.sans,
  };
  const command = useText('command', 'Chuyển sang giao diện tối');
  // 面板中心 = 收缩点 = 涟漪圆心；横屏 = 原版 (960, 452)
  const ORIGIN = g.portrait ? { x: LW / 2, y: Math.round(LH * 0.42) } : { x: 960, y: 452 };
  // 涟漪终值半径 ≈ 圆心到最远角 ×1.1（横屏 = 原版 1260）
  const MAX_R = g.portrait ? Math.round(1.1 * Math.hypot(Math.max(ORIGIN.x, LW - ORIGIN.x), Math.max(ORIGIN.y, LH - ORIGIN.y))) : 1260;

  // ── 背景压暗 / 虚化：面板在时生效，收缩时同步退去 ──
  const dim = ramp(f, DIM0, 8, EASE.out) * (1 - ramp(f, SQUASH, DOT - SQUASH, EASE.swift));

  // ── 面板：弹簧落下 → CRT 关机式收缩（先 Y 后 X）──
  const drop = f < PANEL_IN ? 0 : springAt(f, PANEL_IN, { damping: 17, stiffness: 190 });
  const sy = f < SQUASH ? 1 : mix(1, 0.012, ramp(f, SQUASH, LINE - SQUASH, EASE.exit));
  const sx = f < LINE ? 1 : mix(1, 0.008, ramp(f, LINE, DOT - LINE, EASE.exit));
  const collapsing = f >= SQUASH;
  const contentO = 1 - ramp(f, SQUASH, 3, EASE.linear); // 内容在压扁时先熄
  const glare = ramp(f, SQUASH, LINE - SQUASH, EASE.linear); // 压扁过程面板越来越白热
  const panelMounted = f >= PANEL_IN && f < DOT;

  // ── 输入 ──
  const typed = TYPE_FRAMES.filter((t) => f >= t).length;
  const charIn = (i: number) => ramp(f, TYPE_FRAMES[i], 4, EASE.snappy);
  const selT = ramp(f, SEL, 5, EASE.out);
  const enterPress = ramp(f, ENTER, 2, EASE.linear) * (1 - ramp(f, ENTER + 2, 4, EASE.out));
  const caretOn = f < SEL + 2 ? true : Math.floor((f - SEL) / 8) % 2 === 1 ? false : true;

  // ── 亮点（钉在收缩点）──
  const dotOn = f >= LINE + 2 && f < RIPPLE + 4;
  const dotA = f < DOT ? ramp(f, LINE + 2, DOT - LINE - 2, EASE.linear) : 1 - ramp(f, RIPPLE, 4, EASE.linear);
  const dotPulse = 1 + 0.18 * Math.sin(Math.max(0, f - DOT) * 0.9) * (f >= DOT && f < RIPPLE ? 1 : 0);

  // ── 涟漪 ──
  const rAt = (fr: number, start: number) => mix(6, MAX_R, ramp(fr, start, RIPPLE_END - RIPPLE, RIPPLE_EASE));
  const r = rAt(f, RIPPLE);
  const r2 = rAt(f, RIPPLE + 4) * 0.96;
  const rippling = f >= RIPPLE && f < RIPPLE_END;
  const darkOn = f >= RIPPLE;
  const done = f >= RIPPLE_END;
  const ringO = 1 - ramp(f, RIPPLE + 6, RIPPLE_END - RIPPLE - 6, EASE.out);
  const darkScale = mix(1.035, 1, ramp(f, RIPPLE, 26, EASE.snappy));
  const artGlow = ramp(f, RIPPLE_END, 17, EASE.out);

  // ── 相机：打字时推向面板，涟漪时呼气退回，hold 极缓推 ──
  const push = ramp(f, PANEL_IN, ENTER - PANEL_IN, EASE.swift);
  const exhale = ramp(f, RIPPLE, 30, EASE.smooth);
  const holdPush = ramp(f, RIPPLE_END, PALETTE_THEME_RIPPLE_DURATION - RIPPLE_END, EASE.swift);
  const z = 1 + 0.03 * push * (1 - exhale) + 0.012 * holdPush;

  const rows = [
    { icon: I.moon, label: command, hint: '⇧⌘D' },
    { icon: I.half, label: 'Theo giao diện hệ thống', hint: 'Giao diện' },
    { icon: I.gear, label: 'Cài đặt giao diện…', hint: 'Cài đặt' },
  ];
  const cmdSize = fitSize(command, { family: fonts.sans, size: 32, maxWidth: 980 - 40 - 50 - 22 - 150, weight: 520, minSize: 22 });
  const label0 = (txt: string) => {
    const at = txt.toLowerCase().indexOf(QUERY);
    if (at < 0) return <>{txt}</>;
    return (
      <>
        {txt.slice(0, at)}
        {txt.slice(at, at + QUERY.length).split('').map((c, i) => (
          <span key={i} style={{ fontWeight: i < typed ? 750 : 500, color: i < typed ? (selT > 0.5 ? '#ffffff' : '#0f1217') : undefined }}>{c}</span>
        ))}
        {txt.slice(at + QUERY.length)}
      </>
    );
  };

  const PW = 980;
  const PH = 420;
  const panelY = mix(-46, 0, drop);
  const panelS = mix(0.94, 1, drop);

  return (
    <AbsoluteFill style={{ background: DARK.bg, overflow: 'hidden' }}>
      {/* 逻辑世界 LW×LH 等比放大 K 倍铺满真实舞台（横屏 K=1 = 原版） */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: LW, height: LH, transform: K !== 1 ? `scale(${K})` : undefined, transformOrigin: '0 0', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, transformOrigin: `${ORIGIN.x}px ${ORIGIN.y}px`, transform: `scale(${z.toFixed(4)})` }}>
        {/* 浅色层：涟漪荡完卸载 */}
        {!done && (
          <div style={{ position: 'absolute', inset: 0, filter: dim > 0.01 ? `blur(${(dim * 7).toFixed(2)}px) saturate(${(1 - 0.25 * dim).toFixed(3)})` : undefined }}>
            <App th={LIGHT} frame={f} artGlow={0} g={g} tx={tx} />
            <div style={{ position: 'absolute', inset: 0, opacity: dim, background: 'radial-gradient(ellipse 70% 70% at 50% 42%, rgba(18,22,32,0.30) 0%, rgba(12,14,22,0.55) 100%)' }} />
          </div>
        )}

        {/* 深色层：从收缩点被圆形 clip 揭开 */}
        {darkOn && (
          <div style={{ position: 'absolute', inset: 0, clipPath: done ? undefined : `circle(${r.toFixed(1)}px at ${ORIGIN.x}px ${ORIGIN.y}px)` }}>
            <div style={{ position: 'absolute', inset: 0, transformOrigin: `${ORIGIN.x}px ${ORIGIN.y}px`, transform: darkScale !== 1 ? `scale(${darkScale.toFixed(4)})` : undefined }}>
              <App th={DARK} frame={f} artGlow={artGlow} g={g} tx={tx} />
            </div>
          </div>
        )}

        {/* 涟漪环：白热 3px + 珊瑚外辉 + 内侧白辉；晚 4f 的回声环 */}
        {rippling && (
          <>
            <div style={{
              position: 'absolute', left: ORIGIN.x - r2, top: ORIGIN.y - r2, width: r2 * 2, height: r2 * 2, borderRadius: '50%', boxSizing: 'border-box',
              border: '1.5px solid rgba(255,190,170,0.5)', opacity: ringO * 0.6,
            }} />
            <div style={{
              position: 'absolute', left: ORIGIN.x - r, top: ORIGIN.y - r, width: r * 2, height: r * 2, borderRadius: '50%', boxSizing: 'border-box',
              border: '3px solid rgba(255,246,240,0.95)', opacity: ringO,
              boxShadow: `0 0 34px 6px ${alpha(DARK.accent, 0.55)}, 0 0 90px 20px ${alpha(DARK.accent, 0.22)}, inset 0 0 30px rgba(255,255,255,0.3)`,
            }} />
          </>
        )}

        {/* 亮点 */}
        {dotOn && (
          <>
            {/* 横向变形光斑：CRT 收线留下的余辉，随亮点一起衰减 */}
            <div style={{
              position: 'absolute', left: ORIGIN.x - 420, top: ORIGIN.y - 3, width: 840, height: 6, borderRadius: 3, opacity: dotA * 0.8,
              background: `linear-gradient(90deg, rgba(255,255,255,0) 0%, ${alpha(DARK.accent, 0.5)} 30%, rgba(255,250,245,0.95) 50%, ${alpha(DARK.accent, 0.5)} 70%, rgba(255,255,255,0) 100%)`,
              transform: `scaleX(${(0.4 + 0.6 * (1 - ramp(f, DOT, RIPPLE - DOT + 4, EASE.out))).toFixed(3)})`, filter: 'blur(1.5px)',
            }} />
            <div style={{
              position: 'absolute', left: ORIGIN.x - 13, top: ORIGIN.y - 13, width: 26, height: 26, borderRadius: 13, background: '#ffffff',
              opacity: dotA, transform: `scale(${dotPulse.toFixed(3)})`,
              boxShadow: `0 0 0 5px rgba(255,255,255,0.35), 0 0 36px 14px ${alpha(DARK.accent, 0.75)}, 0 0 120px 40px rgba(255,255,255,0.4)`,
            }} />
          </>
        )}

        {/* ⌘K 命令面板 */}
        {panelMounted && (
          <div style={{
            position: 'absolute', left: ORIGIN.x - PW / 2, top: ORIGIN.y - PH / 2 + (collapsing ? 0 : panelY), width: PW, height: PH,
            transformOrigin: '50% 50%', transform: `scale(${(collapsing ? sx : panelS).toFixed(4)}, ${(collapsing ? sy : panelS).toFixed(4)})`,
            opacity: ramp(f, PANEL_IN, 4, EASE.linear),
            borderRadius: collapsing ? 22 * Math.min(1, sy * 6) : 22, overflow: 'hidden',
            background: collapsing ? `rgba(${Math.round(mix(255, 255, glare))},${Math.round(mix(255, 250, glare))},${Math.round(mix(255, 246, glare))},1)` : 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,251,252,0.97))',
            boxShadow: collapsing
              ? `0 0 ${(30 + 60 * glare).toFixed(1)}px ${(6 + 10 * glare).toFixed(1)}px rgba(255,255,255,${(0.4 + 0.4 * glare).toFixed(3)}), 0 0 120px 20px ${alpha(DARK.accent, 0.35 * glare)}`
              : 'inset 0 1px 0 #ffffff, 0 0 0 1px rgba(15,20,30,0.08), 0 50px 100px -30px rgba(6,8,14,0.6), 0 18px 40px -12px rgba(6,8,14,0.35)',
            fontFamily: fonts.sans, color: '#0f1217',
          }}>
            <div style={{ opacity: contentO }}>
              {/* 输入行 */}
              <div style={{ height: 104, display: 'flex', alignItems: 'center', gap: 22, padding: '0 34px', borderBottom: '1px solid rgba(15,20,30,0.07)' }}>
                <Ic d={I.search} color="#9aa1ad" size={34} w={1.7} />
                <div style={{ display: 'flex', alignItems: 'center', fontSize: 46, fontWeight: 550, letterSpacing: '-0.025em' }}>
                  {QUERY.split('').map((c, i) => (
                    <span key={i} style={{
                      display: f >= TYPE_FRAMES[i] ? 'inline-block' : 'none',
                      opacity: charIn(i), transform: `translateY(${((1 - charIn(i)) * 10).toFixed(2)}px)`,
                    }}>{c}</span>
                  ))}
                  <span style={{ width: 3, height: 50, marginLeft: 3, borderRadius: 2, background: LIGHT.accent, opacity: caretOn ? 1 : 0 }} />
                  {typed === 0 && <span style={{ color: '#a7adb8', marginLeft: 10, fontWeight: 450 }}>Tìm lệnh…</span>}
                </div>
                <span style={{ marginLeft: 'auto' }}><Kbd>esc</Kbd></span>
              </div>
              {/* 结果 */}
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rows.map((row, i) => {
                  const on = i === 0 ? selT : 0;
                  const dimRow = i === 0 ? 0 : 0.4 * Math.min(1, typed / QUERY.length);
                  return (
                    <div key={i} style={{
                      position: 'relative', height: 82, borderRadius: 16, display: 'flex', alignItems: 'center', gap: 22, padding: '0 20px',
                      background: on > 0 ? `rgba(242,72,58,${(on * (0.94 + 0.06 * enterPress)).toFixed(3)})` : 'transparent',
                      boxShadow: on > 0.5 ? `0 10px 24px -10px ${alpha(LIGHT.accent, 0.7)}${enterPress > 0 ? `, 0 0 0 ${(4 * enterPress).toFixed(1)}px ${alpha(LIGHT.accent, 0.25)}` : ''}` : 'none',
                      color: on > 0.5 ? '#ffffff' : '#262b33', opacity: 1 - dimRow, fontSize: i === 0 ? cmdSize : 32, fontWeight: 520, letterSpacing: '-0.015em', whiteSpace: 'nowrap',
                    }}>
                      <div style={{
                        width: 50, height: 50, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
                        background: on > 0.5 ? 'rgba(255,255,255,0.2)' : '#eef0f3',
                      }}>
                        <Ic d={row.icon} color={on > 0.5 ? '#ffffff' : '#5a616e'} size={28} w={1.7} />
                      </div>
                      <span>{i === 0 ? label0(row.label) : row.label}</span>
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                        {i === 0
                          ? <><Kbd on={on}>⇧⌘D</Kbd><Kbd on={on} press={enterPress}>↵</Kbd></>
                          : <span style={{ fontSize: 23, color: '#9aa1ad' }}>{row.hint}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
              {/* 页脚提示 */}
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 52, borderTop: '1px solid rgba(15,20,30,0.06)', background: '#f7f8f9', display: 'flex', alignItems: 'center', padding: '0 34px', gap: 26, fontSize: 21, color: '#9aa1ad' }}>
                <span>↑↓ Di chuyển</span><span>↵ Chạy</span><span style={{ marginLeft: 'auto' }}>Bảng lệnh</span>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
      <Vignette strength={mix(0.12, 0.42, ramp(f, RIPPLE, 24, EASE.out))} color="#06080c" inner={0.5} />
      <Grain opacity={0.05} blend="overlay" />
    </AbsoluteFill>
  );
};
