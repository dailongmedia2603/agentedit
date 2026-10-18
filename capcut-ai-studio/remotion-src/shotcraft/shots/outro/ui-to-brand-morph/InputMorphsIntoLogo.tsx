// input-morphs-into-logo —— slack-promo 40–41s · B 式 input-morph-assemble
//
// 第二轮重设计（「字标构造图」· 瑞士网格亮场）：
// - look = custom「signal」：带一点灰绿的冷纸白底 + 12 栏淡网格（瑞士平面设计的构造感），
//   墨黑 + 钴蓝 #2446ff + 一粒琥珀。品牌轮：终点 logo = video-shotcraft「镜刻」标志（开口取景框 + 琥珀斜切）。
// - 主角是一只为镜头设计的大号消息输入框（1040×132，44px 文案，钴蓝焦点环 + 圆形发送键），上方是
//   频道名与两条最近消息（34px，发送即退场）。
//   点发送 → 文案加速飞出 → 输入框 x/y/w/h/r 五量同一个 spring 收缩成取景框的竖笔（横条直接挤成竖条、
//   圆角收成直角，中途不叠别的动画），发送后标志墨色从发送键处圆形漫开灌满输入框（全程实色）。
// - 三块图元依次从画外落下，把竖笔拼成「镜刻」标志：上横（墨）→ 下横（墨）→ 琥珀斜切。每块落下前 10f，
//   目标槽位先画出一圈蓝色虚线构造轮廓（Q9：落点是真实槽位），落地按速度拉伸 / 压扁（原点钉底部）后构造线淡出。
//   图元在空中带落影、落定即平（标志本身不加投影）。
// - 拼好后 mark 左移让位并收到 0.7（给 15 个字符的字标腾地方，标志高 ≈ 字号 2.1 倍），
//   「video-shotcraft」逐字从基线下升起、口号逐词升起；构造网格退场，留一张干净海报。
//
// 时间表（30fps，共 168f）：
//   0–20    光标从右下滑到发送键（第 0 帧画面即有频道上下文、输入框与光标），插入符闪烁
//   20      点击：发送键压缩 + 闪白 6f
//   21–32   文案 ease-in 加速向右上飞出 + 旋转 + 拖影
//   28–40   墨色从发送键圆形漫开灌满输入框
//   30–60   morph：spring(damping 15, stiffness 95) 输入框 → 取景框竖笔
//   58–76   落下①上横（构造轮廓 48 起画）
//   72–90   落下②下横
//   86–104  落下③琥珀斜切
//   108–128 mark 左移让位 + 收到 0.7；构造网格淡出
//   114–140 video-shotcraft 逐字升起、口号逐词升起
//   140–168 海报 hold（相机极缓推近 2%）
//
// [Agent Edit] Logo cuoi = dau hieu trung tinh cua VIDEO (khong con hinh hoc logo "kinh khac" cua video-shotcraft):
// khung vuong ghep tu 4 net — net doc trai = o nhap lieu co lai, roi tren / duoi / doc phai roi xuong khop rãnh —
// sau do LOI (logo anh cua thuong hieu, hoac chu viet tat cua ten) bat vao giua khung (nhip thu 4 thay vet cat ho phach).
// o chu: message (tin nhan dang go trong o nhap) / name (ten hien canh logo; bo trong -> ten thuong hieu cua video) /
// tagline (khau hieu duoi) / channel (ten kenh chat phia tren). Chu that dai ngan bat ky: tu thu nho vua be ngang.
// Khung doc (portrait.mode = 'native'): o nhap + tin nhan to hon; luc chot logo dich LEN, ten + khau hieu xep duoi.
import { useCurrentFrame, useBrand, useShotFonts, useText, useVideoConfig, fitSize, measureText, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, FONT, bezier, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, TextReveal, alpha, springAt, type, type Look } from '../../../fixtures/Look';
import { BRAND } from '../../../fixtures/Brand';

export const INPUT_MORPHS_INTO_LOGO_DURATION = 168;

const L: Look = {
  ...LOOKS.porcelain,
  bg: ['#f5f6f2', '#eeefe9', '#e3e5de'],
  light: '#ffffff',
  surface: '#ffffff',
  ink: '#10121a',
  ink2: '#545966',
  ink3: '#9a9ea6',
  accent: '#2446ff',
  accent2: '#ffb21f',
  shadow: '#1a2030',
};
const COBALT = '#2446ff';
const MARK_INK = BRAND.ink; // 标志取景框（亮底用墨色版）
const MARK_CORE = BRAND.amber; // 标志核心（首字母）：视频的强调色

// —— 关键帧
const CLICK = 20;
const FLY = 21;
const MORPH = 30;
const DROPS = [58, 72, 86];
const CORE = 98; // 第四拍：核心（logo / 首字母）弹入框心
const SHIFT = 108;
const WORD = 114;

// mark 局部几何（viewBox 128：方框 16..112，笔宽 26）。竖笔 = 输入框收成的那根竖条，
// 上横 / 下横 / 右竖三块落下拼成闭合方框。横笔取满宽（盖住竖笔两端，同色叠合）：拼缝不出发丝 / 台阶
type Piece = { x: number; y: number; w: number; h: number };
const FRAME_PATH = 'M16 16h96v96H16Z M42 42v44h44V42Z';

// 频道里最近两条消息（上下文）
const THREAD = [
  { n: 'Mai', t: '8:52', m: 'Bản thiết kế mới xong rồi nhé.', c: '#1f7a5c' },
  { n: 'Tuấn', t: '8:55', m: 'Tuyệt, gửi khách duyệt luôn thôi.', c: '#c2410c' },
];

// 落体：spring 从画外上方落到槽位；按速度纵向拉伸、回弹时压扁
const DROP_H = 760;
const dropAt = (f: number, i: number) => (f < DROPS[i] ? 0 : springAt(f, DROPS[i], { damping: 13, stiffness: 120, mass: 0.9 }));

// 构造虚线轮廓（目标槽位外扩 10px）：沿轮廓画出 → 落定后淡出
const guidePoints = (p: Piece, cx: number, cy: number, k: number) => {
  const d = 10;
  const w = (p.w * k) / 2 + d;
  const h = (p.h * k) / 2 + d;
  return [[cx - w, cy - h], [cx + w, cy - h], [cx + w, cy + h], [cx - w, cy + h]];
};
const Guide: React.FC<{ f: number; i: number; pts: number[][]; H: number }> = ({ f, i, pts, H }) => {
  const draw = ramp(f, DROPS[i] - 10, 12, EASE.out);
  const fade = 1 - ramp(f, DROPS[i] + 14, 10, EASE.out);
  const a = draw > 0 ? Math.min(draw * 2, 1) * fade : 0;
  if (a <= 0.001) return null;
  const d = `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`;
  const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length;
  const cy = pts.reduce((s, q) => s + q[1], 0) / pts.length;
  const mid = `guide-draw-${i}`;
  return (
    <svg width={1920} height={H} style={{ position: 'absolute', inset: 0, overflow: 'visible', opacity: a }}>
      <defs>
        <mask id={mid} maskUnits="userSpaceOnUse" x={0} y={0} width={1920} height={H}>
          <path d={d} fill="none" stroke="#fff" strokeWidth={8} pathLength={1} strokeDasharray={`${draw.toFixed(4)} 1`} />
        </mask>
      </defs>
      <path d={d} fill="none" stroke={COBALT} strokeWidth={2} strokeDasharray="10 8" opacity={0.75} mask={`url(#${mid})`} />
      <line x1={cx - 12} y1={cy} x2={cx + 12} y2={cy} stroke={COBALT} strokeWidth={1.5} opacity={0.7} />
      <line x1={cx} y1={cy - 12} x2={cx} y2={cy + 12} stroke={COBALT} strokeWidth={1.5} opacity={0.7} />
    </svg>
  );
};

export const InputMorphsIntoLogo: React.FC = () => {
  const f = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const P = SH > 1080 * 1.2;
  const message = useText('message', 'Gửi bản cuối cho khách nhé!');
  const name = useText('name', ' ').trim() || (brand?.name ?? '').trim();
  const tagline = useText('tagline', 'Làm việc nhóm nhanh hơn mỗi ngày.');
  const channel = useText('channel', 'ra-mat-san-pham');

  // —— 几何（landscape = 原版；portrait 放大、竖排收尾）
  const K = P ? 1.45 : 1;
  const U = (P ? 470 : 330) / 96; // 每个 viewBox 单位的像素数（竖笔高 96 单位）
  const BOX = P ? { x: 960, y: Math.round(SH * 0.56), w: 1600, h: 190, r: 50 } : { x: 960, y: 690, w: 1040, h: 132, r: 34 };
  const MY0 = P ? Math.round(SH * 0.47) : 492;
  const MX0 = 960; // 拼装时 mark 居中
  const END_S = P ? 0.8 : 0.7; // 让位时 mark 收小
  const STEM: Piece = { x: (29 - 64) * U, y: 0, w: 26 * U, h: 96 * U };
  const PIECES: Piece[] = [
    { x: 0, y: (29 - 64) * U, w: 96 * U, h: 26 * U }, // 上横
    { x: 0, y: (99 - 64) * U, w: 96 * U, h: 26 * U }, // 下横
    { x: (99 - 64) * U, y: 0, w: 26 * U, h: 96 * U }, // 右竖
  ];
  // 字标 + 口号尺寸
  const markW = 96 * U * END_S;
  const WFS0 = P ? 170 : 110;
  const wfs = name ? fitSize(name, { family: fonts.sans, size: WFS0, maxWidth: P ? 1640 : 1700 - markW - 60, weight: 700, letterSpacingEm: 0.03, minSize: 44 }) : WFS0;
  const wordW = name ? measureText(name, fonts.sans, wfs, 700) + 0.03 * wfs * name.length : 0;
  const TFS0 = P ? 64 : 46;
  let tLines = tagline ? wrapLines(tagline, fonts.sans, TFS0, P ? 1600 : 1600, 450, 2) : [];
  const tfs = tLines.length ? Math.min(TFS0, ...tLines.map((l) => fitSize(l, { family: fonts.sans, size: TFS0, maxWidth: 1600, weight: 450, minSize: 26 }))) : TFS0;
  if (!P && tLines.length > 1) tLines = [tagline];
  const tfsL = !P && tagline ? fitSize(tagline, { family: fonts.sans, size: TFS0, maxWidth: 1700, weight: 450, minSize: 24 }) : tfs;
  // 让位终点：landscape 整组横向居中；portrait 标志上移、字标与口号排在下面，整组纵向居中
  const lockW = markW + (name ? 60 + wordW : 0);
  const SHIFT_DX = P || !name ? 0 : 960 - lockW / 2 + markW / 2 - MX0;
  const stackH = markW + (name ? 80 + wfs * 1.25 : 0) + (tLines.length ? 50 + tLines.length * tfs * 1.3 : 0);
  const SHIFT_DY = P ? SH * 0.47 - stackH / 2 + markW / 2 - MY0 : 0;

  // —— 光标
  const curT = ramp(f, 0, CLICK - 2, EASE.swift);
  const sendD = 84 * K;
  const sendX = BOX.x + BOX.w / 2 - 24 * K - sendD / 2;
  const cursorX = mix(P ? 1500 : 1560, sendX + 6, curT);
  const cursorY = mix(P ? BOX.y + 420 : 940, BOX.y + 8, ramp(f, 0, CLICK - 2, bezier(0.25, 0.6, 0.3, 1)));
  const press = f >= CLICK && f <= CLICK + 4 ? 0.84 : 1;
  const cursorOp = 1 - ramp(f, FLY + 2, 8, EASE.out);
  const flash = f >= CLICK && f <= CLICK + 5 ? 1 - (f - CLICK) / 6 : 0;

  // —— 文案飞出（加速）
  const flyT = ramp(f, FLY, 11, bezier(0.5, 0, 0.9, 0.55));

  // —— morph：五量同一个 spring
  const m = f < MORPH ? 0 : springAt(f, MORPH, { damping: 15, stiffness: 95, mass: 1 });
  const flood = ramp(f, 28, 12, EASE.snappy); // 墨色从发送键漫开
  const fill = flood;
  const flat = 1 - Math.min(1, m); // 输入框的投影随 morph 收掉：落定的标志是平的
  // 拼齐后（让位起点，三块都已落定）把竖笔 + 上下横 + 右竖换成一条完整的方框路径（避免同色叠合的抗锯齿台阶）
  const assembled = f >= SHIFT;
  const shift = ramp(f, SHIFT, 20, EASE.swift);
  const MX = MX0 + SHIFT_DX * shift;
  const MY = MY0 + SHIFT_DY * shift;
  const S = mix(1, END_S, shift); // mark 整体比例（让位时收小）
  const bx = mix(BOX.x, MX + STEM.x * S, m);
  const by = mix(BOX.y, MY + STEM.y * S, m);
  const bw = mix(BOX.w, STEM.w * S, m);
  const bh = mix(BOX.h, STEM.h * S, m);
  const br = Math.max(0, mix(BOX.r, 0, Math.min(1, m))); // 圆角收成直角
  // morph 速度 → 收缩方向的轻微拖影（只在快段）
  const mPrev = f - 1 < MORPH ? 0 : springAt(f - 1, MORPH, { damping: 15, stiffness: 95, mass: 1 });
  const mBlur = Math.min(3, Math.abs(m - mPrev) * 30);

  // 输入框 UI 元素（随 morph 尽早退场，不在中途叠动画）
  const uiOut = Math.min(1, m * 3);

  // 构造网格 & 十字线：拼装期出现，让位时退场
  const gridA = 0.55 * ramp(f, MORPH + 10, 20, EASE.out) * (1 - ramp(f, SHIFT, 18, EASE.out)) + 0.25;
  const constrA = ramp(f, DROPS[0] - 14, 16, EASE.out) * (1 - ramp(f, SHIFT - 4, 16, EASE.out));

  // 第四拍：核心弹入框心（过冲 spring）
  const core = f < CORE ? 0 : springAt(f, CORE, { damping: 12, stiffness: 180 });
  const initials = name ? name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() : '';
  const coreSize = 44 * U * S; // 框内净空 44 单位

  // 落定后整组极缓推近
  const push = 1 + 0.02 * ramp(f, 124, 44, EASE.smooth);
  const cyPush = P ? SH * 0.47 : 540;

  return (
    <AbsoluteFill style={{ overflow: 'hidden', fontFamily: FONT.sans }}>
      <Stage look={L} keyLight={{ x: 0.42, y: 0.2 }} fill={{ x: 0.9, y: 0.95 }} grain={0.05} vignette={0.2}>
        {/* 12 栏淡网格 + 基线：瑞士式构造底 */}
        <svg width={1920} height={SH} style={{ position: 'absolute', left: 0, top: 0, opacity: gridA }}>
          {Array.from({ length: 13 }, (_, i) => (
            <line key={i} x1={96 + i * 144} y1={0} x2={96 + i * 144} y2={SH} stroke={alpha(L.ink, 0.06)} strokeWidth={1} />
          ))}
          {[MY0 - 312, MY0, MY0 + 312].map((y) => <line key={y} x1={0} y1={y} x2={1920} y2={y} stroke={alpha(L.ink, 0.05)} strokeWidth={1} />)}
        </svg>
      </Stage>

      <div style={{ position: 'absolute', inset: 0, transform: `scale(${push.toFixed(5)})`, transformOrigin: `960px ${cyPush}px` }}>
        {/* 构造十字线：穿过 mark 中心与上横 */}
        {constrA > 0.001 && (
          <svg width={1920} height={SH} style={{ position: 'absolute', left: 0, top: 0, opacity: constrA }}>
            <line x1={0} y1={MY + PIECES[0].y * S} x2={1920} y2={MY + PIECES[0].y * S} stroke={alpha(COBALT, 0.28)} strokeWidth={1.2} />
            <line x1={MX + PIECES[2].x * S} y1={0} x2={MX + PIECES[2].x * S} y2={SH} stroke={alpha(COBALT, 0.28)} strokeWidth={1.2} />
            <line x1={MX + (STEM.x - STEM.w / 2) * S} y1={0} x2={MX + (STEM.x - STEM.w / 2) * S} y2={SH} stroke={alpha(COBALT, 0.18)} strokeWidth={1.2} strokeDasharray="6 8" />
            <line x1={0} y1={MY + (STEM.h / 2) * S} x2={1920} y2={MY + (STEM.h / 2) * S} stroke={alpha(COBALT, 0.18)} strokeWidth={1.2} strokeDasharray="6 8" />
          </svg>
        )}

        {/* 频道上下文：频道名 + 两条最近消息（发送即退场） */}
        <div style={{
          position: 'absolute', left: BOX.x - BOX.w / 2 + 8, top: BOX.y - BOX.h / 2 - 410 * K, width: BOX.w - 16,
          opacity: 1 - ramp(f, FLY + 1, 10, EASE.out), transform: `translateY(${(-24 * ramp(f, FLY + 1, 10, EASE.exit)).toFixed(2)}px)`,
          filter: f > FLY + 1 ? `blur(${(6 * ramp(f, FLY + 1, 10, EASE.linear)).toFixed(2)}px)` : undefined,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 * K, ...type(34 * K, 650), lineHeight: 1.3, color: L.ink, paddingBottom: 22 * K, borderBottom: `1px solid ${alpha(L.ink, 0.08)}`, whiteSpace: 'nowrap' }}>
            <span style={{ color: COBALT, fontWeight: 800 }}>#</span>
            <span style={{ fontSize: fitSize(channel, { family: fonts.sans, size: 34 * K, maxWidth: BOX.w - 360 * K, weight: 650, minSize: 18 }) }}>{channel}</span>
            <span style={{ ...type(26 * K, 500), lineHeight: 1.3, color: L.ink3, marginLeft: 'auto' }}>12 thành viên</span>
          </div>
          {THREAD.map((msg, i) => (
            <div key={i} style={{ display: 'flex', gap: 22 * K, marginTop: 30 * K, opacity: i === 0 ? 0.55 : 1 }}>
              <div style={{ width: 60 * K, height: 60 * K, borderRadius: 18 * K, background: msg.c, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', ...type(24 * K, 700), color: '#fff' }}>{msg.n[0]}</div>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 * K }}>
                  <span style={{ ...type(30 * K, 700), lineHeight: 1.3, color: L.ink }}>{msg.n}</span>
                  <span style={{ ...type(24 * K, 500), lineHeight: 1.3, color: L.ink3 }}>{msg.t}</span>
                </div>
                <div style={{ ...type(34 * K, 450), lineHeight: 1.3, color: L.ink2, marginTop: 4 * K, whiteSpace: 'nowrap' }}>{msg.m}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 主体：输入框 → 方框竖笔 */}
        {!assembled && <div style={{
          position: 'absolute', left: bx - bw / 2, top: by - bh / 2, width: bw, height: bh, borderRadius: br,
          boxSizing: 'border-box', overflow: 'hidden',
          background: flood >= 1 ? MARK_INK : '#ffffff', // 灌满后底色也换墨：竖笔边缘不带白边，与横笔拼合无发丝缝
          boxShadow: `0 0 0 ${(3 * (1 - fill)).toFixed(2)}px ${alpha(COBALT, 0.9 * (1 - fill))}, 0 0 0 ${(9 * (1 - fill)).toFixed(2)}px ${alpha(COBALT, 0.12 * (1 - fill))}, ` +
            `0 2px 4px ${alpha(L.shadow, 0.06 * flat)}, 0 ${mix(24, 18, m).toFixed(1)}px ${mix(50, 36, m).toFixed(1)}px -18px ${alpha(L.shadow, 0.3 * flat)}`,
          filter: mBlur > 0.3 ? `blur(${mBlur.toFixed(2)}px)` : undefined,
        }}>
          {/* 标志墨色实心：从发送键处圆形漫开，全程实色；灌满后由底色接手 */}
          {flood < 1 && <div style={{
            position: 'absolute', inset: 0,
            clipPath: `circle(${(flood * Math.hypot(bw, bh)).toFixed(1)}px at ${(bw - (24 * K + sendD / 2) * (1 - m)).toFixed(1)}px ${(bh / 2).toFixed(1)}px)`,
            background: MARK_INK,
          }} />}
          {/* 工具图标（纹理级，morph 即退） */}
          <div style={{ position: 'absolute', right: 132 * K, top: 0, height: BOX.h, display: 'flex', alignItems: 'center', gap: 22 * K, opacity: 1 - uiOut }}>
            {['M12 5v14M5 12h14', 'M8 9h.01M16 9h.01M8 15q4 3 8 0'].map((d, i) => (
              <svg key={i} width={34 * K} height={34 * K} viewBox="0 0 24 24" fill="none" stroke={L.ink3} strokeWidth={2} strokeLinecap="round">
                {i === 1 && <circle cx={12} cy={12} r={9} />}
                <path d={d} />
              </svg>
            ))}
          </div>
          {/* 发送键 */}
          <div style={{
            position: 'absolute', right: 24 * K, top: (BOX.h - sendD) / 2, width: sendD, height: sendD, borderRadius: sendD / 2,
            background: flash > 0 ? `rgb(${Math.round(mix(36, 140, flash))},${Math.round(mix(70, 160, flash))},255)` : COBALT,
            boxShadow: `0 6px 16px -6px ${alpha(COBALT, 0.7)}, inset 0 1.5px 0 rgba(255,255,255,0.3)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: `scale(${press})`, opacity: 1 - uiOut,
          }}>
            <svg width={38 * K} height={38 * K} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />
            </svg>
          </div>
        </div>}

        {/* 文案（在输入框外层渲染：飞出时不被输入框圆角裁掉） */}
        <div style={{
          position: 'absolute', left: BOX.x - BOX.w / 2 + 44 * K, top: BOX.y - BOX.h / 2, height: BOX.h, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap',
          ...type(fitSize(message, { family: fonts.sans, size: 44 * K, maxWidth: BOX.w - 44 * K - 260 * K, weight: 450, minSize: 20 }), 450), lineHeight: 1.3, color: L.ink, opacity: (1 - flyT) * (1 - uiOut),
          transform: `translate(${(flyT * 760).toFixed(1)}px, ${(-flyT * 420).toFixed(1)}px) rotate(${(-flyT * 9).toFixed(2)}deg)`,
          filter: flyT > 0.15 ? `blur(${(flyT * 6).toFixed(2)}px)` : undefined,
        }}>
          {message}
          <span style={{ display: 'inline-block', width: 3 * K, height: 50 * K, marginLeft: 6, background: COBALT, opacity: f < FLY && Math.floor(f / 8) % 2 === 0 ? 1 : 0 }} />
        </div>

        {/* 构造虚线轮廓（目标槽位） */}
        {PIECES.map((p, i) => <Guide key={i} f={f} i={i} H={SH} pts={guidePoints(p, MX + p.x * S, MY + p.y * S, S)} />)}

        {/* 拼齐后：单一方框路径 */}
        {assembled && (
          <svg width={128 * U * S} height={128 * U * S} viewBox="0 0 128 128"
            style={{ position: 'absolute', left: MX - 64 * U * S, top: MY - 64 * U * S, overflow: 'visible' }}>
            <path d={FRAME_PATH} fill={MARK_INK} fillRule="evenodd" />
          </svg>
        )}
        {/* 三块图元落下（空中带落影，落定即平） */}
        {PIECES.map((p, i) => {
          if (f < DROPS[i] || assembled) return null;
          const s = dropAt(f, i);
          const v = (s - dropAt(f - 1, i)) * DROP_H; // 每帧下落像素（回弹时为负）
          const k = Math.max(-1, Math.min(1, v / 70));
          const sy = 1 + 0.14 * k;
          const sx = 1 - 0.09 * k;
          const w = p.w * S;
          const h = p.h * S;
          const top = MY + p.y * S - h / 2 - (1 - s) * DROP_H;
          const air = Math.max(0, Math.min(1, (1 - s) * 3));
          const shadow = air > 0.01 ? `drop-shadow(0 ${(14 * air).toFixed(1)}px ${(16 * air).toFixed(1)}px ${alpha('#1a1a10', 0.35 * air)})` : '';
          const blur = Math.abs(v) > 14 ? `blur(${Math.min(3, Math.abs(v) * 0.03).toFixed(2)}px)` : '';
          return (
            <div key={i} style={{
              position: 'absolute', left: MX + p.x * S - w / 2, top, width: w, height: h, background: MARK_INK,
              transform: `scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`, transformOrigin: '50% 100%',
              filter: [blur, shadow].filter(Boolean).join(' ') || undefined,
            }} />
          );
        })}
        {/* 第四拍：核心（品牌 logo / 名称首字母 / 强调色方块）弹入框心 */}
        {core > 0.001 && (
          <div style={{
            position: 'absolute', left: MX - coreSize / 2, top: MY - coreSize / 2, width: coreSize, height: coreSize,
            display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${core.toFixed(4)})`,
          }}>
            {brand?.logo ? (
              <img src={brand.logo} style={{ width: '86%', height: '86%', objectFit: 'contain' }} />
            ) : initials ? (
              <span style={{ fontFamily: fonts.sans, fontWeight: 800, fontSize: coreSize * (initials.length > 1 ? 0.56 : 0.72), lineHeight: 1, color: MARK_CORE, letterSpacing: '-0.02em' }}>{initials}</span>
            ) : (
              <div style={{ width: '58%', height: '58%', background: MARK_CORE }} />
            )}
          </div>
        )}

        {/* 字标 + 口号 */}
        {name ? (
          <div style={{
            position: 'absolute', whiteSpace: 'nowrap', fontFamily: BRAND.font, fontSize: wfs, fontWeight: 700, lineHeight: 1.3, letterSpacing: '0.03em', color: MARK_INK,
            ...(P
              ? { left: 960 - wordW / 2, top: MY + markW / 2 + 80 }
              : { left: MX + 48 * U * S + 60, top: MY - 4, transform: 'translateY(-50%)' }),
          }}>
            <TextReveal text={name} by="char" variant="rise" start={WORD} each={16} gap={Math.min(1.5, 24 / Math.max(1, name.length))} ease={EASE.snappy} />
          </div>
        ) : null}
        {tLines.length ? (
          <div style={{
            position: 'absolute', left: 0, right: 0, textAlign: 'center', ...type(P ? tfs : tfsL, 450), lineHeight: 1.3, color: L.ink2,
            top: P ? MY + markW / 2 + (name ? 80 + wfs * 1.25 : 0) + 50 : MY + 190,
          }}>
            {tLines.map((l, i) => (
              <div key={i} style={{ whiteSpace: 'nowrap' }}>
                <TextReveal text={l} by="word" variant="rise" start={WORD + 16 + i * 6} each={16} gap={Math.min(3, 18 / Math.max(1, tagline.split(/\s+/).length))} ease={EASE.out} />
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* 光标 */}
      {cursorOp > 0.001 && (
        <svg width={40 * K} height={46 * K} viewBox="0 0 40 44" style={{
          position: 'absolute', left: cursorX, top: cursorY, opacity: cursorOp, transform: `scale(${press})`, transformOrigin: '4px 2px',
          filter: `drop-shadow(0 4px 8px ${alpha(L.shadow, 0.3)})`,
        }}>
          <path d="M4 2 L4 34 L13 26 L19 40 L26 37 L20 23 L32 22 Z" fill={L.ink} stroke="#ffffff" strokeWidth={2.2} strokeLinejoin="round" />
        </svg>
      )}
    </AbsoluteFill>
  );
};
