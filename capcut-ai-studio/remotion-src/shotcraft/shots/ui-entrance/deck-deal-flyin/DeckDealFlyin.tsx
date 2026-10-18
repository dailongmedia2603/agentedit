// deck-deal-flyin —— 牌堆特写环绕 → 预备 → 一摞卡硬加速发进网格 → 相机追着发牌升起 → 满板定格（第二轮重设计）
// 手法不变：实体牌堆特写 orbit 开局，预备拍后 26 张卡按阅读序、出牌间隔硬加速地甩进页面网格，
// 相机追着发牌走，满板后停住。
//
// 设计决定
// - look = graphite（近单色暗场 · 白为强调 · 一点香槟金）。整镜头发生在一张暗色拉丝石墨桌面上：
//   牌堆放在页面板右侧的桌面上，一盏顶光只打牌堆；拉远时"灯"从牌堆亮到页面板（板面由暗到亮的光圈），
//   页面板像一块被摆上桌的白色展板，四周始终是暗场——暗/亮反差贯穿到最后一帧。
// - 相机：一条连续的单调 Hermite 样条（关键帧处速度连续，无顿挫）——低机位侧斜绕牌堆 → 拉远正视板顶 →
//   追着越发越快的牌往板尾走、同时升高后仰 → 落在一张"跑道式"俯瞰：整块板沿对角线伸向远处，
//   26 张卡全部在画，近大远小。俯瞰位只保留极缓推近（1.5%）。
// - 景深：俯瞰位远端（板首）压暗 + 降对比，近端最亮。
// - 版式：满板后左下升起两行标题（120px 800/300 字重对比）+ 一行 mono 计数——计数在发牌期间就跟着落地数跳。
//
// 时间表（30fps，共 150f）
//   0–28    orbit：侧斜低机位绕牌堆（rotY −30°→+26°），顶光只打牌堆，板面暗
//   26–36   预备：牌堆整体下压 48px、顶卡向出牌反方向回拉 30px（过肉眼阈值判例）
//   36–~101 发牌：第 k 张 cue = 36 + 4k − 0.0792·k(k−1)（间隔 4f → 0.2f 硬加速），
//           单卡 8f 俯冲（z 弧顶 + 峰值 1.06x）+ 4f 过冲落定 + 2f press；飞行残影
//   34–62   拉远：板面光圈亮起，相机正视板顶
//   62–108  追逐 + 升起：相机沿板往下追、升高后仰、侧转 → 跑道俯瞰
//   100–126 标题逐词升起、计数行定格
//   108–150 hold：满板静止（> 0.5s），极缓推近 + 光的呼吸
//
// [Agent Edit] o anh photo1..photo6 (ti le BAT KY; it nhat 1): 26 la bai xoay vong dung cac anh do, anh `cover` trong khung the.
// Khong co anh -> the ve tay tieng Viet (tieu de tu o `items` + dong mo + the tag). Trang nen (truoc la anh chup trang mau
// projects-empty.png, chu Trung/Anh) -> ve lai bang tieng Viet: thanh tren (logo + ten thuong hieu), o tim kiem, tieu muc (o
// `sections`). Chu ket: title (dong dam) / title2 (dong manh) / label (nhan dem: "NN <label>"); mat na "troi len" padding
// 0.32em (TextReveal 'rise' cua fixtures chi 0.06em -> cat dau tieng Viet).
// Khung doc (native): camera giu nguyen quy dao (tam = giua khung that), cuoi canh ban bai day len tren chua cho tieu de
// to ~200px o phan duoi.
import { useCurrentFrame, useImage, useList, useShotFonts, useText, useVideoConfig, fitSize } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Img, interpolate, Easing } from 'remotion';
import { EASE, FONT, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const DECK_DEAL_FLYIN_DURATION = 150;

const L = LOOKS.graphite;
const PAPER = '#f9f6f1';
const PAGE_H = 1746;

// 网格（页面坐标，与原截图 projects 页同一套：3 栏 × 4 行 + 下方纸面延长 5 行）
const COLS = [408, 781.328125, 1154.65625];
const CARD_W = 357.328125;
const BASE: { x: number; y: number; h: number }[] = [
  { x: COLS[0], y: 247, h: 288 }, { x: COLS[1], y: 247, h: 288 },
  { x: COLS[0], y: 616, h: 312 }, { x: COLS[1], y: 616, h: 312 }, { x: COLS[2], y: 616, h: 312 },
  { x: COLS[0], y: 1009, h: 312 }, { x: COLS[1], y: 1009, h: 312 }, { x: COLS[2], y: 1009, h: 312 },
  { x: COLS[0], y: 1402, h: 312 }, { x: COLS[1], y: 1402, h: 312 },
];
const SECTION_Y = [206, 575, 968, 1361];
const EXTRA_ROWS = [1795, 2188, 2581, 2974, 3367];
const BOARD = { x: 352, w: 1216 };
const BOARD_H = PAGE_H + 2036;

const extras = Array.from({ length: 16 }, (_, i) => ({
  x: i === 0 ? COLS[2] : COLS[(i - 1) % 3],
  y: i === 0 ? 1402 : EXTRA_ROWS[Math.floor((i - 1) / 3)],
  h: 312,
}));

// 牌堆：放在板右侧的桌面上（页面坐标）
const PILE = { x: 1640, y: 250 };
const N_CARDS = 26;
const DEAL_START = 36;
const STACK_STEP = 3;
const PILE_CX = PILE.x + CARD_W / 2;
const PILE_CY = PILE.y + 156;

const grid = [...BASE, ...extras]
  .map((c, src) => ({ ...c, w: CARD_W, src }))
  .sort((a, b) => a.y - b.y || a.x - b.x)
  .map((c, k) => ({
    ...c,
    cue: DEAL_START + 4 * k - 0.0792 * k * (k - 1),
    px: PILE.x + (((k * 7) % 9) - 4) * 2,
    py: PILE.y + (((k * 5) % 7) - 3) * 2,
    protZ: ((k * 11) % 7) - 3,
    pz: (N_CARDS - k) * STACK_STEP,
  }));

const HOVER_H = 40;
const SETTLE_EASE = Easing.bezier(0.3, 0, 0.25, 1.15);
const DIVE_EASE = Easing.bezier(0.3, 0, 0.2, 1);
const ANTICIPATE = { from: 26, to: 36, pileDown: 48, topPull: 30 };

// ───────────── 相机：单调三次 Hermite 样条（各参数分别过锚点，关键帧处速度连续） ─────────────
type Cam = { cx: number; cy: number; zoom: number; rotX: number; rotY: number; rotZ: number; persp: number; sx: number; sy: number };
type Key = Cam & { frame: number };
const ANCHORS: Key[] = [
  { frame: 0, cx: PILE_CX - 40, cy: PILE_CY + 60, zoom: 1.9, rotX: 48, rotY: -30, rotZ: 9, persp: 1100, sx: 0, sy: 0 },
  { frame: 30, cx: PILE_CX + 20, cy: PILE_CY + 40, zoom: 1.8, rotX: 42, rotY: 24, rotZ: -6, persp: 1100, sx: 0, sy: 0 },
  { frame: 62, cx: 1080, cy: 760, zoom: 0.8, rotX: 22, rotY: 0, rotZ: 2, persp: 1700, sx: 0, sy: 0 },
  { frame: 86, cx: 980, cy: 1720, zoom: 0.56, rotX: 38, rotY: -4, rotZ: -10, persp: 2500, sx: 120, sy: 0 },
  { frame: 110, cx: 960, cy: 2150, zoom: 0.5, rotX: 52, rotY: -6, rotZ: -26, persp: 3300, sx: 300, sy: 0 },
  { frame: 150, cx: 960, cy: 2160, zoom: 0.508, rotX: 52, rotY: -6, rotZ: -26, persp: 3300, sx: 300, sy: 0 },
];
// 竖版：不右移（标题在下方），俯瞰段整体上推给标题让位；俯瞰 zoom 略大（竖屏宽度是瓶颈）
const ANCHORS_P: Key[] = ANCHORS.map((k, i) => ({
  ...k, sx: 0, sy: [0, 0, 0, -200, -520, -520][i], zoom: k.zoom * [1.35, 1.35, 1.25, 1.35, 1.5, 1.5][i],
}));
const PARAMS: (keyof Cam)[] = ['cx', 'cy', 'zoom', 'rotX', 'rotY', 'rotZ', 'persp', 'sx', 'sy'];
const hermite = (xs: number[], ys: number[]) => {
  const n = xs.length;
  const d = xs.slice(0, -1).map((x, i) => (ys[i + 1] - ys[i]) / (xs[i + 1] - x));
  const m = xs.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? 0 : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
};
const curvesOf = (A: Key[]) => Object.fromEntries(PARAMS.map((p) => [p, hermite(A.map((k) => k.frame), A.map((k) => k[p]))])) as Record<keyof Cam, (x: number) => number>;
const CURVES = curvesOf(ANCHORS);
const CURVES_P = curvesOf(ANCHORS_P);
const camAt = (f: number, P: boolean): Cam => Object.fromEntries(PARAMS.map((p) => [p, (P ? CURVES_P : CURVES)[p](f)])) as Cam;

// ───────────── 拉丝石墨桌面纹理（确定性 feTurbulence：x 极低频 / y 高频 = 横向拉丝） ─────────────
const BRUSH_TILE = (() => {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='640'>` +
    `<filter id='b' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>` +
    `<feTurbulence type='fractalNoise' baseFrequency='0.0018 0.62' numOctaves='3' seed='11' stitchTiles='stitch'/>` +
    `<feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.4 0.4 0.4 0 -0.5'/>` +
    `</filter><rect width='100%' height='100%' filter='url(#b)'/></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
})();

const T = 4000; // 桌面平面外扩（页面坐标），任意斜角不穿帮

// 卡面：真实图片（cover）或越南语手绘卡（标题 + 描述骨架 + 标签）
const TAGS = [['Nổi bật', 'Mới'], ['Xu hướng'], ['Gợi ý', 'Hot'], ['Yêu thích'], ['Mới', 'Ưu đãi'], ['Phổ biến']];
const CardFace: React.FC<{ src?: string; i: number; title: string; w: number; h: number; sans: string }> = ({ src, i, title, w, h, sans }) => {
  if (src) return <Img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 40%' }} />;
  const tSize = fitSize(title, { family: sans, size: 24, maxWidth: (w - 44) * 1.9, weight: 700, minSize: 15 }) ;
  const hue = [212, 28, 160, 340, 260, 90][i % 6];
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#fffdfa', border: '1px solid rgba(60,45,30,0.12)', borderRadius: 16, boxSizing: 'border-box', padding: '20px 22px', fontFamily: sans, color: '#1c1a17' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: `hsl(${hue} 70% 92%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 14, height: 14, borderRadius: 4, background: `hsl(${hue} 65% 52%)` }} />
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 14, color: '#8a8278' }}>{(i % 6) + 1} ngày trước</span>
      </div>
      <div style={{ marginTop: 14, fontSize: tSize, fontWeight: 700, lineHeight: 1.3, letterSpacing: '-0.01em', maxHeight: tSize * 1.3 * 2, overflow: 'hidden' }}>{title}</div>
      {[0.92, 0.84, 0.6].map((k, j) => (
        <div key={j} style={{ marginTop: j ? 9 : 14, height: 10, width: `${k * 100}%`, borderRadius: 5, background: 'rgba(60,45,30,0.09)' }} />
      ))}
      <div style={{ position: 'absolute', left: 22, right: 22, bottom: 20, display: 'flex', gap: 8 }}>
        {TAGS[i % TAGS.length].map((t) => (
          <span key={t} style={{ fontSize: 13, padding: '5px 11px', borderRadius: 999, border: '1px solid rgba(60,45,30,0.16)', color: '#5d554b', whiteSpace: 'nowrap' }}>{t}</span>
        ))}
        <span style={{ marginLeft: 'auto', width: h > 300 ? 54 : 44, height: 10, alignSelf: 'center', borderRadius: 5, background: `hsl(${hue} 65% 52%)`, opacity: 0.5 }} />
      </div>
    </div>
  );
};

// 逐词升起（遮罩留足越南语叠放声调的上下空间）
const RiseWords: React.FC<{ f: number; text: string; start: number; each: number; gap: number }> = ({ f, text, start, each, gap }) => (
  <span style={{ whiteSpace: 'nowrap' }}>
    {text.split(/\s+/).filter(Boolean).map((w, i) => {
      const p = EASE.snappy(Math.max(0, Math.min(1, (f - start - i * gap) / each)));
      return (
        <React.Fragment key={i}>
          {i ? ' ' : null}
          <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.32em 0.03em 0.26em', margin: '-0.32em -0.03em -0.26em' }}>
            <span style={{ display: 'inline-block', transform: `translateY(calc(${((1 - p) * 105).toFixed(2)}% + ${((1 - p) * 0.6).toFixed(3)}em))` }}>{w}</span>
          </span>
        </React.Fragment>
      );
    })}
  </span>
);

export const DeckDealFlyin: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const P = SH > 1080 * 1.2;
  const cam = camAt(frame, P);

  const title = useText('title', 'Nội dung mới,');
  const title2 = useText('title2', 'đổ về mỗi ngày.');
  const label = useText('label', 'BÀI VIẾT ĐÃ ĐĂNG');
  const items = useList('items', ['Mẹo bán hàng online', 'Ý tưởng video ngắn', 'Lịch đăng bài tuần này', 'Kịch bản livestream', 'Báo cáo doanh thu', 'Bộ ảnh sản phẩm mới']);
  const sections = useList('sections', ['NỔI BẬT', 'MỚI NHẤT', 'ĐƯỢC YÊU THÍCH', 'GỢI Ý CHO BẠN']);
  const imgs = [useImage('photo1'), useImage('photo2'), useImage('photo3'), useImage('photo4'), useImage('photo5'), useImage('photo6')].filter((x): x is string => !!x);
  const srcOf = (k: number) => (imgs.length ? imgs[k % imgs.length] : undefined);

  // 板面"灯亮"：f34→64 以牌堆为圆心的柔边光圈把暗板照亮
  const lightUp = interpolate(frame, [34, 64], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.5, 0, 0.6, 1) });
  const holeR = 4200 * lightUp;
  const feather = 600 + 1000 * lightUp;
  // 俯瞰位景深：远端（板首）压暗
  const fog = ramp(frame, 80, 34, EASE.smooth);

  // 预备拍
  const antT = interpolate(frame, [ANTICIPATE.from, ANTICIPATE.to], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad) });

  // 计数：已落地张数
  const landed = grid.filter((c) => frame >= c.cue + 8).length;
  const statIn = ramp(frame, 90, 12, EASE.out);

  const tableBg = [
    // 顶光：落在牌堆上（开场最亮），随拉远扩大成照亮整块板的大光
    `radial-gradient(${1100 + 1400 * lightUp}px ${800 + 1600 * lightUp}px at ${T + PILE_CX - 600 * lightUp}px ${T + PILE_CY + 900 * lightUp}px, rgba(235,232,224,${0.2 - 0.08 * lightUp}), rgba(220,216,206,0.05) 45%, transparent 70%)`,
    // 宽幅镜面高光带
    `linear-gradient(104deg, transparent ${T + PILE_CX - 1600}px, rgba(220,226,236,0.07) ${T + PILE_CX - 500}px, rgba(240,244,252,0.11) ${T + PILE_CX}px, rgba(220,226,236,0.05) ${T + PILE_CX + 600}px, transparent ${T + PILE_CX + 1800}px)`,
    `${BRUSH_TILE} 0 0 / 640px 640px repeat`,
    'linear-gradient(115deg, #1b1c1f 0%, #24262a 30%, #18191c 56%, #202226 80%, #141518 100%)',
  ].join(', ');

  const persp = cam.persp * cam.zoom;
  const CY = SH / 2;

  // 标题：两行各自缩到一行（横版左下 ≤1000 宽；竖版底部 1680 宽、字更大）
  const tMax = P ? 1680 : 1000;
  const tSize0 = P ? 200 : 120;
  const t1S = fitSize(title, { family: fonts.sans, size: tSize0, maxWidth: tMax, weight: 800, minSize: tSize0 * 0.45 });
  const t2S = fitSize(title2, { family: fonts.sans, size: tSize0, maxWidth: tMax, weight: 300, minSize: tSize0 * 0.45 });
  const tS = Math.min(t1S, t2S);
  const statS = P ? 44 : 30;
  const labelS = fitSize(label, { family: fonts.mono, size: statS, maxWidth: tMax - statS * 5, weight: 600, minSize: statS * 0.55, letterSpacingEm: 0.14 });
  const titleTop = P ? SH - 300 - 2 * tS * 1.15 : 664;
  const statTop = titleTop - (P ? 90 : 54);

  return (
    <AbsoluteFill style={{ fontFamily: FONT.sans, overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.6, y: 0.2 }} fill={null} intensity={0.5} grain={0} vignette={0} />

      {/* 3D 相机（PageCam2D 同款坐标数学：CSS zoom 做放大，Q2 文字按放大后尺寸栅格化） */}
      <AbsoluteFill style={{ transform: `translate(${cam.sx.toFixed(2)}px, ${cam.sy.toFixed(2)}px)` }}>
        <div style={{ position: 'absolute', inset: 0, perspective: `${persp.toFixed(2)}px`, perspectiveOrigin: `960px ${CY}px` }}>
          <div
            style={{
              position: 'absolute', width: 1920, height: BOARD_H, zoom: cam.zoom,
              transform: `translate(${(960 / cam.zoom - cam.cx).toFixed(3)}px, ${(CY / cam.zoom - cam.cy).toFixed(3)}px) rotateY(${cam.rotY.toFixed(3)}deg) rotateX(${cam.rotX.toFixed(3)}deg) rotateZ(${cam.rotZ.toFixed(3)}deg)`,
              transformOrigin: `${cam.cx.toFixed(2)}px ${cam.cy.toFixed(2)}px`,
              transformStyle: 'preserve-3d',
            }}
          >
            {/* 石墨桌面：远处柔边隐进暗场 */}
            <div
              style={{
                position: 'absolute', left: -T, top: -T, width: 1920 + 2 * T, height: BOARD_H + 2 * T, background: tableBg,
                WebkitMaskImage: `radial-gradient(ellipse ${2600}px ${3600}px at ${T + 960}px ${T + BOARD_H / 2}px, #000 40%, transparent 100%)`,
                maskImage: `radial-gradient(ellipse ${2600}px ${3600}px at ${T + 960}px ${T + BOARD_H / 2}px, #000 40%, transparent 100%)`,
              }}
            />

            {/* 页面板：越南语页面（顶栏 + 搜索 + 分区小标）+ 纸面延长；落在桌上的大投影 */}
            <div
              style={{
                position: 'absolute', left: BOARD.x, top: 0, width: BOARD.w, height: BOARD_H, overflow: 'hidden', borderRadius: 18,
                background: PAPER, fontFamily: fonts.sans, color: '#2a251f',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 60px 160px rgba(0,0,0,0.7), 0 12px 40px rgba(0,0,0,0.5)',
              }}
            >
              <div style={{ position: 'absolute', left: 0, top: 0, width: BOARD.w, height: 61, background: '#fcfbf8', borderBottom: '1px solid rgba(60,45,30,0.1)', display: 'flex', alignItems: 'center', gap: 14, paddingLeft: 408 - BOARD.x, boxSizing: 'border-box' }}>
                <ShotcraftMark size={26} tone="light" />
                {BRAND.name ? <span style={{ fontSize: 21, fontWeight: 700, whiteSpace: 'nowrap' }}>{BRAND.name}</span> : null}
                <span style={{ fontSize: 15, color: '#5d554b', marginLeft: 12 }}>Bảng tin</span>
                <span style={{ fontSize: 15, color: '#5d554b' }}>Bài viết</span>
              </div>
              <div style={{ position: 'absolute', left: 408 - BOARD.x, top: 90, width: 1104, display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#3d372f' }}>
                <span style={{ fontWeight: 600 }}>Tất cả mục</span>
                <span style={{ color: '#8a8278' }}>Hiển thị {landed} / {N_CARDS}</span>
              </div>
              <div style={{ position: 'absolute', left: 408 - BOARD.x, top: 124, width: 1020, height: 46, borderRadius: 8, border: '1px solid rgba(60,45,30,0.14)', background: '#fffdfa', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', fontSize: 14, color: '#a39a8e' }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#8a8278" strokeWidth={2.4}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
                Tìm theo tên, mô tả, thẻ…
              </div>
              <div style={{ position: 'absolute', left: 1440 - BOARD.x, top: 124, width: 72, height: 46, borderRadius: 8, border: '1px solid rgba(60,45,30,0.14)', background: '#fffdfa', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#3d372f' }}>Lọc</div>
              {SECTION_Y.map((y, i) => (
                <React.Fragment key={y}>
                  <div style={{ position: 'absolute', left: 408 - BOARD.x, top: y - 4, width: 1104, display: 'flex', justifyContent: 'space-between', fontSize: 14, letterSpacing: '0.1em', color: '#5d554b', whiteSpace: 'nowrap' }}>
                    <span>{(sections[i] ?? '').toUpperCase()}</span>
                    <span style={{ letterSpacing: 0, color: '#8a8278' }}>{[2, 3, 3, 2][i]} mục</span>
                  </div>
                  <div style={{ position: 'absolute', left: 408 - BOARD.x, top: y + 22, width: 1104, height: 1, background: 'rgba(60,45,30,0.08)' }} />
                </React.Fragment>
              ))}
              {/* 纸面延长段的分区线 */}
              <div style={{ position: 'absolute', left: 408 - BOARD.x, top: PAGE_H + 6, width: 1104, height: 1, background: 'rgba(60,45,30,0.08)' }} />
              {/* 板面暗层：开场整块板在暗处，灯从牌堆处亮开（柔边光圈） */}
              {lightUp < 1 && (
                <div
                  style={{
                    position: 'absolute', inset: 0, background: 'rgba(14,14,16,0.88)',
                    WebkitMaskImage: lightUp > 0 ? `radial-gradient(circle at ${PILE_CX - BOARD.x}px ${PILE_CY}px, transparent ${holeR.toFixed(0)}px, #000 ${(holeR + feather).toFixed(0)}px)` : undefined,
                    maskImage: lightUp > 0 ? `radial-gradient(circle at ${PILE_CX - BOARD.x}px ${PILE_CY}px, transparent ${holeR.toFixed(0)}px, #000 ${(holeR + feather).toFixed(0)}px)` : undefined,
                  }}
                />
              )}
            </div>

            {/* 26 张卡：牌堆在板右侧桌面上，按硬加速节拍逐张发进网格 */}
            {grid.map((c, i) => {
              const { cue } = c;
              const diveT = interpolate(frame, [cue, cue + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: DIVE_EASE });
              const settleT = interpolate(frame, [cue + 8, cue + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: SETTLE_EASE });
              const dx = (c.px - c.x) * (1 - diveT);
              const dy = (c.py - c.y) * (1 - diveT);
              const rotFlight = c.protZ * (1 - diveT);
              const arc = Math.sin(diveT * Math.PI) * 110;
              const zDive = interpolate(diveT, [0, 1], [c.pz, HOVER_H]) + arc;
              const z = frame < cue ? c.pz : zDive * (1 - settleT);
              const dealScale = 1 + Math.sin(diveT * Math.PI) * 0.06;
              const press = interpolate(frame, [cue + 10, cue + 11, cue + 12], [1, 0.996, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
              const scale = dealScale * press;
              const isLanded = frame >= cue + 12;
              const inPile = frame < cue;
              const antDy = inPile ? ANTICIPATE.pileDown * antT * (frame < ANTICIPATE.to + 2 ? 1 : 0) : 0;
              const antPull = i === 0 && inPile ? ANTICIPATE.topPull * antT : 0;
              const transform = isLanded
                ? 'translate3d(0px, 0px, 0px)'
                : inPile
                  ? `translate3d(${c.px - c.x - antPull}px, ${c.py - c.y + antDy}px, ${c.pz}px) rotateZ(${c.protZ}deg)`
                  : `translate3d(${dx}px, ${dy}px, ${z}px) rotateZ(${rotFlight}deg) scale(${scale})`;
              // 阴影：牌堆在暗桌上投重影；飞行时又高又虚；落地后在纸面上收成静置影（滞后卡体 ~3f 收敛）
              const shadowLag = interpolate(frame, [cue + 8, cue + 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE.out });
              const shadow = isLanded
                ? `0 ${(2 + 14 * (1 - shadowLag)).toFixed(1)}px ${(6 + 30 * (1 - shadowLag)).toFixed(1)}px rgba(40,30,20,${(0.1 + 0.12 * (1 - shadowLag)).toFixed(3)})`
                : inPile
                  ? i === N_CARDS - 1
                    ? '0 1px 3px rgba(0,0,0,.4), 0 26px 60px rgba(0,0,0,0.75)'
                    : '0 1px 2px rgba(0,0,0,.35)'
                  : `0 ${36 - 24 * settleT}px ${70 - 50 * settleT}px rgba(0,0,0,${(0.45 - 0.25 * settleT).toFixed(3)})`;
              const showGhost = diveT > 0.02 && diveT < 0.98;
              const gx = (c.px - c.x) * 0.06;
              const gy = (c.py - c.y) * 0.06;
              // 落进还没被照亮的板面区域的卡同样在暗处（与板面光圈同一公式），牌堆本身只压一点暗部
              const dist = Math.hypot(c.x + c.w / 2 - PILE_CX, c.y + c.h / 2 - PILE_CY);
              const dark = Math.min(1, Math.max(0, (dist - holeR) / feather)) * 0.88 * (lightUp < 1 ? 1 : 0);
              const pileShade = inPile ? 0.08 * (1 - lightUp) : diveT > 0.6 ? dark * Math.min(1, (diveT - 0.6) / 0.4) : 0;
              const face = <CardFace src={srcOf(i)} i={i} title={items[i % Math.max(1, items.length)] || ''} w={c.w} h={c.h} sans={fonts.sans} />;
              return (
                <div key={i} style={{ transformStyle: 'preserve-3d' }}>
                  {showGhost ? (
                    <div
                      style={{
                        position: 'absolute', left: c.x, top: c.y, width: c.w, height: c.h,
                        transform: `translate3d(${dx + gx}px, ${dy + gy}px, ${z}px) rotateZ(${rotFlight}deg) scale(${scale})`,
                        opacity: 0.28 * (1 - diveT), filter: 'blur(7px)', borderRadius: 16, overflow: 'hidden',
                      }}
                    >
                      {face}
                    </div>
                  ) : null}
                  <div
                    style={{
                      position: 'absolute', left: c.x, top: c.y, width: c.w, height: c.h,
                      transform, boxShadow: shadow, borderRadius: 16, overflow: 'hidden', background: '#fffdfa',
                    }}
                  >
                    {face}
                    {pileShade > 0.005 && <div style={{ position: 'absolute', inset: 0, background: `rgba(10,10,12,${pileShade.toFixed(3)})` }} />}
                  </div>
                </div>
              );
            })}

            {fog > 0 && (
              <div
                style={{
                  position: 'absolute', left: BOARD.x - 2, top: -2, width: BOARD.w + 4, height: BOARD_H + 4, pointerEvents: 'none', borderRadius: 18,
                  transform: 'translateZ(1px)',
                  background: `linear-gradient(180deg, rgba(12,12,14,${(0.62 * fog).toFixed(3)}) 0%, rgba(12,12,14,${(0.3 * fog).toFixed(3)}) 35%, rgba(12,12,14,0) 70%)`,
                }}
              />
            )}
          </div>
        </div>
      </AbsoluteFill>

      {/* 暗角 + 颗粒（屏幕空间，全程） */}
      <AbsoluteFill style={{ pointerEvents: 'none', background: `radial-gradient(ellipse 75% 75% at 58% 46%, transparent 45%, ${alpha('#050506', 0.55)} 100%)` }} />
      {/* 竖版：标题区底部压暗，保证标题可读 */}
      {P && (
        <AbsoluteFill style={{ pointerEvents: 'none', opacity: statIn, background: `linear-gradient(180deg, transparent ${((statTop - 300) / SH) * 100}%, ${alpha('#060607', 0.78)} ${((statTop + 60) / SH) * 100}%, ${alpha('#060607', 0.88)} 100%)` }} />
      )}

      {/* 左下 / 底部：标题 + 计数行 */}
      <div style={{ position: 'absolute', left: 120, top: titleTop, color: L.ink }}>
        <div style={{ ...type(tS, 800), lineHeight: 1.15 }}>
          <RiseWords f={frame} text={title} start={100} each={16} gap={4} />
        </div>
        <div style={{ ...type(tS, 300), color: L.ink2, marginTop: 4, lineHeight: 1.15 }}>
          <RiseWords f={frame} text={title2} start={106} each={16} gap={4} />
        </div>
      </div>
      <div
        style={{
          position: 'absolute', left: 124, top: statTop, display: 'flex', alignItems: 'center', gap: 16, opacity: statIn, whiteSpace: 'nowrap',
          ...type(statS, 600, { mono: true }), letterSpacing: '0.14em', color: L.ink2, lineHeight: 1.3,
        }}
      >
        {/* 品牌标志（暗底反白版，不加发光） */}
        <ShotcraftMark size={statS * 1.13} tone="dark" style={{ margin: '-6px 0' }} />
        <span style={{ color: L.ink, fontVariantNumeric: 'tabular-nums', minWidth: '2.2ch' }}>{String(landed).padStart(2, '0')}</span>
        <span style={{ fontSize: labelS }}>{label}</span>
      </div>
    </AbsoluteFill>
  );
};
