// outro-group-photo-launch —— 全片元素四方飞来围住字标合影，crane 落机位 + 舞台光 +
// 金尘做成发布会收场。outro/品牌收尾，多功能产品"全家福"式终镜，能量推到全片最高。
// 9 个元素从四方带旋转飞入（cue 4 起每 3f 一个，飞 12f，bezier y1>1 真过冲，
// 渲染顺序=cue 顺序后到者叠上）；字标 letterpress 逐字登场（delay=42+i·1.8）全员退后排
// （opacity −12% / saturate −8%）；rule 长出 + 190px 延长线射出；crane 运镜 perspective rotateX(4°→0) + scale 落下后缓推；
// 发布会三件套：开场光带扫过、字标背后舞台光、20 颗确定性金尘上飘；背景 blur 化景深；落定后 sign-off hold 30f。
//
// [Agent Edit] Anh chup trang mau + live-layout.json -> khung chung:
//   - 5 khung anh `img1..img5` (ti le bat ky, cover trong khung the / khung ngang) + 4 manh giao dien gia ve bang CSS
//     (thanh menu, o tim kiem, nhan so lieu, thanh bao cao — chu tieng Viet trung tinh). Thieu anh -> the giao dien gia.
//   - `bg` (tuy chon): nen mo phia sau; khong co -> nen giay am.
//   - Chu: `name` (ten thuong hieu / kenh / san pham; bo trong = ten thuong hieu cua video) + `tagline` (cau chao cuoi).
//   - Khung doc (native): cac manh xep thanh 2 cum tren / duoi, ten thuong hieu to giua khung (logo phia tren ten).
import { useBackdrop, useCurrentFrame, useVideoConfig, useText, useImage, useShot, useShotFonts, useBrand, fitSize, wrapLines, staticFile } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, Img, interpolate, Easing } from 'remotion';
import { EASE, Grain, SpeedBlur, ramp, velocity } from '../../../fixtures/Polish';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const OUTRO_GROUP_PHOTO_LAUNCH_DURATION = 145;

const FLY_EASE = Easing.bezier(0.34, 1.4, 0.44, 1);
const CRANE_EASE = Easing.bezier(0.3, 0, 0.2, 1);

type Kind = 'nav' | 'search' | 'stats' | 'report' | 'photo';
type FlyEl = {
  key: string;
  kind: Kind;
  img?: number; // chi so o anh (photo)
  w: number;
  h: number;
  cx: number;
  cy: number;
  rot: number;
  dx: number;
  dy: number;
  radius: number;
  cue: number;
};

// render order = cue order, so later arrivals stack on top
const ELS_LAND: FlyEl[] = [
  { key: 'nav', kind: 'nav', w: 1190, h: 38, cx: 960, cy: 84, rot: 0, dx: 0, dy: -120, radius: 10, cue: 4 },
  { key: 'p1', kind: 'photo', img: 0, w: 270, h: 228, cx: 280, cy: 300, rot: -5, dx: -500, dy: 0, radius: 16, cue: 7 },
  { key: 'p2', kind: 'photo', img: 1, w: 250, h: 210, cx: 1640, cy: 318, rot: 4, dx: 500, dy: 0, radius: 16, cue: 10 },
  { key: 'p3', kind: 'photo', img: 2, w: 420, h: 236, cx: 1500, cy: 800, rot: -3, dx: 450, dy: 260, radius: 12, cue: 13 },
  { key: 'p4', kind: 'photo', img: 3, w: 230, h: 196, cx: 260, cy: 800, rot: 3, dx: -400, dy: 300, radius: 16, cue: 16 },
  { key: 'p5', kind: 'photo', img: 4, w: 400, h: 225, cx: 660, cy: 925, rot: 2, dx: 0, dy: 320, radius: 12, cue: 19 },
  { key: 'search', kind: 'search', w: 560, h: 46, cx: 760, cy: 180, rot: -1.5, dx: 0, dy: -240, radius: 10, cue: 22 },
  { key: 'stats', kind: 'stats', w: 300, h: 52, cx: 1150, cy: 990, rot: -2, dx: 380, dy: 0, radius: 10, cue: 25 },
  { key: 'report', kind: 'report', w: 520, h: 44, cx: 1580, cy: 170, rot: 2.5, dx: 360, dy: -200, radius: 8, cue: 28 },
];
// khung doc: toa do y = ti le chieu cao san khau (fy), kich thuoc lon hon (chu / anh doc ro tren dien thoai)
const ELS_PORT: (Omit<FlyEl, 'cy'> & { fy: number })[] = [
  { key: 'nav', kind: 'nav', w: 1700, h: 58, cx: 960, fy: 0.075, rot: 0, dx: 0, dy: -160, radius: 14, cue: 4 },
  { key: 'p1', kind: 'photo', img: 0, w: 600, h: 520, cx: 470, fy: 0.3, rot: -5, dx: -650, dy: 0, radius: 24, cue: 7 },
  { key: 'p2', kind: 'photo', img: 1, w: 560, h: 480, cx: 1440, fy: 0.315, rot: 4, dx: 650, dy: 0, radius: 24, cue: 10 },
  { key: 'p3', kind: 'photo', img: 2, w: 720, h: 405, cx: 1380, fy: 0.69, rot: -3, dx: 580, dy: 340, radius: 20, cue: 13 },
  { key: 'p4', kind: 'photo', img: 3, w: 560, h: 480, cx: 480, fy: 0.72, rot: 3, dx: -520, dy: 380, radius: 24, cue: 16 },
  { key: 'p5', kind: 'photo', img: 4, w: 780, h: 440, cx: 900, fy: 0.865, rot: 2, dx: 0, dy: 420, radius: 20, cue: 19 },
  { key: 'search', kind: 'search', w: 980, h: 80, cx: 760, fy: 0.15, rot: -1.5, dx: 0, dy: -300, radius: 16, cue: 22 },
  { key: 'stats', kind: 'stats', w: 470, h: 84, cx: 1470, fy: 0.84, rot: -2, dx: 480, dy: 0, radius: 16, cue: 25 },
  { key: 'report', kind: 'report', w: 760, h: 72, cx: 1380, fy: 0.19, rot: 2.5, dx: 460, dy: -260, radius: 12, cue: 28 },
];

// 20 gold dust motes, all parameters index-derived (deterministic)
const DUST = Array.from({ length: 20 }, (_, i) => ({
  x: (i * 439 + 137) % 1920,
  y0: (i * 613 + 271) % 1080,
  rise: 0.3 + (i % 5) * 0.11,
  swayAmp: 9 + (i % 4) * 5,
  swayFreq: 0.022 + (i % 3) * 0.008,
  phase: (i * 0.83) % (Math.PI * 2),
  size: 2.4 + (i % 3) * 0.9,
  opacity: 0.35 + ((i * 7) % 5) * 0.09,
}));
const BOKEH = Array.from({ length: 6 }, (_, i) => ({
  x: (i * 701 + 260) % 1920,
  y0: (i * 389 + 640) % 1080,
  rise: 0.55 + (i % 3) * 0.2,
  size: 14 + (i % 3) * 7,
  opacity: 0.1 + (i % 2) * 0.06,
}));

const INKC = '#2a241c';
const MUTED = '#8a8072';
const ACC = 'oklch(62% 0.14 55)';

// Manh giao dien gia (ve bang CSS, chu tieng Viet trung tinh) — chieu cao h quyet dinh co chu
const UiPiece: React.FC<{ kind: Kind; h: number; family: string; src?: string; k: number }> = ({ kind, h, family, src, k }) => {
  const fs = h * 0.42;
  const row: React.CSSProperties = { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', fontFamily: family, color: INKC, whiteSpace: 'nowrap', background: '#fffdf9' };
  if (kind === 'nav')
    return (
      <div style={{ ...row, padding: `0 ${h * 0.5}px`, gap: h * 0.7, fontSize: fs, fontWeight: 500 }}>
        <div style={{ width: h * 0.5, height: h * 0.5, borderRadius: h * 0.14, background: ACC }} />
        <span style={{ fontWeight: 700 }}>Trang chủ</span>
        <span style={{ color: MUTED }}>Sản phẩm</span>
        <span style={{ color: MUTED }}>Bảng giá</span>
        <span style={{ color: MUTED }}>Liên hệ</span>
        <div style={{ marginLeft: 'auto', height: h * 0.62, padding: `0 ${h * 0.4}px`, borderRadius: h, background: INKC, color: '#fffdf9', display: 'flex', alignItems: 'center', fontSize: fs * 0.9, fontWeight: 600 }}>Đăng ký</div>
      </div>
    );
  if (kind === 'search')
    return (
      <div style={{ ...row, padding: `0 ${h * 0.4}px`, gap: h * 0.3, fontSize: fs, color: MUTED }}>
        <svg width={h * 0.45} height={h * 0.45} viewBox="0 0 26 26"><circle cx={11} cy={11} r={8} fill="none" stroke={MUTED} strokeWidth={2.6} /><path d="M17 17l6 6" stroke={MUTED} strokeWidth={2.6} strokeLinecap="round" /></svg>
        Tìm kiếm mọi thứ…
        <span style={{ marginLeft: 'auto', fontSize: fs * 0.8, border: `1px solid ${MUTED}`, borderRadius: h * 0.12, padding: `0 ${h * 0.12}px` }}>⌘K</span>
      </div>
    );
  if (kind === 'stats')
    return (
      <div style={{ ...row, padding: `0 ${h * 0.35}px`, gap: h * 0.25, fontSize: fs, fontWeight: 600 }}>
        <span style={{ color: 'oklch(58% 0.13 150)' }}>▲ 18%</span>
        <span style={{ color: MUTED, fontWeight: 500 }}>tăng trưởng tháng</span>
      </div>
    );
  if (kind === 'report')
    return (
      <div style={{ ...row, padding: `0 ${h * 0.35}px`, gap: h * 0.3, fontSize: fs, fontWeight: 600 }}>
        <div style={{ width: h * 0.42, height: h * 0.5, borderRadius: h * 0.08, background: 'oklch(85% 0.05 70)' }} />
        Báo cáo tuần
        <span style={{ color: MUTED, fontWeight: 450 }}>· cập nhật 2 phút trước</span>
      </div>
    );
  if (src)
    return <Img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />;
  // the giao dien gia khi khong co anh
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#fffdf9', padding: '9%', boxSizing: 'border-box' }}>
      <div style={{ height: '42%', borderRadius: 8, background: k % 2 ? 'oklch(88% 0.05 70)' : 'oklch(86% 0.04 200)' }} />
      {[0.8, 0.55, 0.68].map((w, j) => (
        <div key={j} style={{ marginTop: j ? '5%' : '8%', height: j ? '6%' : '9%', width: `${w * 100}%`, borderRadius: 5, background: `rgba(42,36,28,${j ? 0.1 : 0.22})` }} />
      ))}
    </div>
  );
};

export const OutroGroupPhotoLaunch: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const shot = useShot();
  const portrait = SH > 1080 * 1.2;
  const duration = OUTRO_GROUP_PHOTO_LAUNCH_DURATION;
  const given = useText('name', '');
  const NAME = (given || BRAND.name || '').trim();
  const TAG = useText('tagline', 'Hẹn gặp lại ở video tiếp theo');
  const preview = !shot || (!!shot.preview && Object.keys(shot.images).length === 0);
  const own = [useImage('img1'), useImage('img2'), useImage('img3'), useImage('img4'), useImage('img5')];
  const SAMPLES = ['samples/photo1.jpg', 'samples/wide1.jpg', 'samples/square1.jpg', 'samples/photo2.jpg', 'samples/wide1.jpg'];
  // [Agent Edit] app gui it anh hon 5 khung -> lap lai anh da co cho du khung (khong de khung trang)
  const ownList = own.filter((x): x is string => !!x);
  const imgs = preview ? SAMPLES.map((p) => staticFile(p)) : own.map((x, i) => x || ownList[i % Math.max(1, ownList.length)]);
  const bgSrc = useImage('bg');
  const ELS: FlyEl[] = portrait ? ELS_PORT.map((e) => ({ ...e, cy: Math.round(e.fy * SH) })) : ELS_LAND;
  const CY = portrait ? Math.round(SH * 0.5) : 540;

  const blur = interpolate(frame, [0, 24], [0, 14], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.4, 0, 0.4, 1),
  });
  const rule = interpolate(frame, [58, 70], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.3, 0, 0.2, 1),
  });
  const tag = ramp(frame, 68, 12, EASE.out);
  // 收尾淡到暖墨色（显式底色，不淡到透明），ease-in：先慢后快地"熄灯"
  const fadeOut = 1 - ramp(frame, duration - 12, 11, EASE.exit);
  const recede = interpolate(frame, [42, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // crane on the whole group-photo layer
  const craneT = interpolate(frame, [0, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: CRANE_EASE });
  // 缓推从零速起步（与 crane 的减速收尾衔接，避免 f40 处速度突变）
  const pushT = ramp(frame, 36, duration - 36, EASE.smooth);
  const camScale = 1.06 - 0.06 * craneT + 0.035 * pushT;
  const camTilt = 4 * (1 - craneT);

  // opening light sweep
  const sweepX = interpolate(frame, [2, 14], [-700, 2020], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.4, 0, 0.6, 1) });
  const sweepOpacity = interpolate(frame, [2, 5, 11, 14], [0, 0.12, 0.12, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // stage light behind the wordmark
  const stageLight = interpolate(frame, [42, 50, 58], [0, 0.55, 0.32], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const vignette = interpolate(frame, [42, 54], [0, 0.1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // rule extension lines
  const ruleExt = interpolate(frame, [58, 66], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.3, 0, 0.2, 1) });
  const ruleExtFade = interpolate(frame, [66, 72], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // one breath of letter-spacing once the wordmark is fully set
  const wordSpacing = interpolate(frame, [62, 66], [-0.01, 0.005], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.3, 0, 0.2, 1) });

  // —— chu ky ten: co chu vua be ngang (khung doc: logo nam tren ten)
  const hasMark = !!brand;
  const markSize = portrait ? 230 : 154;
  const nameMax = portrait ? 1700 : 1280 - (hasMark ? markSize + 36 : 0); // khung ngang: giu ten trong vung giua, khong de len cac manh hai ben
  const nameSize = NAME ? fitSize(NAME, { family: BRAND.font, size: portrait ? 210 : 118, maxWidth: nameMax, weight: 700, letterSpacingEm: 0.035, minSize: 56 }) : 0;
  const LETTERS = Array.from(NAME);
  const lstep = Math.min(1.8, 26 / Math.max(1, LETTERS.length));
  const tagFs0 = portrait ? 60 : 32;
  const tagLines = TAG ? wrapLines(TAG, fonts.sans, tagFs0, portrait ? 1600 : 1300, 500, 2) : [];
  const tagFs = Math.min(tagFs0, ...tagLines.map((l) => fitSize(l, { family: fonts.sans, size: tagFs0, maxWidth: portrait ? 1600 : 1300, weight: 500, letterSpacingEm: 0.1, minSize: tagFs0 * 0.6 })));
  const markEl = (() => {
    // 标志先压：比首字母早 4f，同一套 letterpress（上抬 + 放大 + 虚焦 → 落定）
    const t = interpolate(frame, [38, 46], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.2, 0.75, 0.3, 1) });
    return (
      <div style={{
        marginRight: portrait || !NAME ? 0 : 36, marginBottom: portrait && NAME ? 40 : 0, opacity: t, transform: `translateY(${(1 - t) * 28}px) scale(${1.35 - 0.35 * t})`,
        filter: t < 0.995 ? `blur(${(1 - t) * 8}px)` : undefined,
      }}>
        <ShotcraftMark size={markSize} tone="light" />
      </div>
    );
  })();

  const bgH = SH;
  // [Agent Edit] nen anh AI: bo nen giay / anh nen mo / lop phu am / hat -> anh nen hien ra; cuoi canh van "tat den" (lop toi phu len)
  const bd = useBackdrop();
  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : '#0f0d0a' }}>
    <AbsoluteFill style={{ opacity: fadeOut, background: bd ? 'transparent' : '#f3eee6' }}>
      {/* group-photo layer under a slow crane-in camera */}
      <AbsoluteFill style={{ transform: `perspective(1400px) rotateX(${camTilt}deg) scale(${camScale})`, transformOrigin: '50% 45%' }}>
        {/* 背景：tuy chon anh nen that, blur hoa canh sau (chi lop nen bi mo, cac manh bay vao ro net) */}
        {!bd && <div style={{ position: 'absolute', left: -60, top: -60, width: 2040, height: bgH + 120, background: 'linear-gradient(180deg, #f6f1e8, #ece4d6)', filter: bgSrc ? `blur(${blur.toFixed(2)}px)` : undefined }}>
          {bgSrc ? <Img src={bgSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
        </div>}
        {/* warm scrim under the flying elements */}
        {!bd && <AbsoluteFill style={{ background: `radial-gradient(1200px ${portrait ? 2000 : 800}px at 50% 48%, rgba(250,247,242,0.82), rgba(250,247,242,0.55) 60%, rgba(250,247,242,0.35))`, pointerEvents: 'none' }} />}

        {/* group photo: elements fly in from all sides and settle around the wordmark */}
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
          {ELS.map((el) => {
            if (frame < el.cue) return null;
            const t = interpolate(frame, [el.cue, el.cue + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: FLY_EASE });
            const opacity = interpolate(frame, [el.cue, el.cue + 3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            const x = el.dx * (1 - t);
            const y = el.dy * (1 - t);
            const rot = el.rot * (2 - t);
            const scale = 1.12 - 0.12 * t;
            const air = Math.max(0, 1 - t);
            const shadow =
              air > 0.01
                ? `0 ${10 + 26 * air}px ${24 + 46 * air}px rgba(30,25,18,${0.16 + 0.1 * air}), 0 2px 6px rgba(30,25,18,.08)`
                : '0 10px 24px rgba(30,25,18,.16), 0 2px 6px rgba(30,25,18,.08)';
            const settledOpacity = opacity * (1 - 0.12 * recede);
            const saturate = 1 - 0.08 * recede;
            // 方向性运动模糊：按屏幕速度（px/帧）沿飞行方向拖影，落地后为 0
            const posAt = (fr: number) => {
              const tt = interpolate(fr, [el.cue, el.cue + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: FLY_EASE });
              return [el.dx * (1 - tt), el.dy * (1 - tt)];
            };
            const vx = velocity((fr) => posAt(fr)[0], frame);
            const vy = velocity((fr) => posAt(fr)[1], frame);
            // 落地压实：过冲回落的那 4f 里接触影收紧、元素 1.5% 轻压
            const land = interpolate(frame, [el.cue + 9, el.cue + 12, el.cue + 16], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            return (
              <SpeedBlur key={el.key} vx={vx} vy={vy} amount={0.3} max={22}>
                <div
                  style={{
                    position: 'absolute', left: el.cx - el.w / 2, top: el.cy - el.h / 2, width: el.w, height: el.h,
                    transform: `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${scale * (1 - 0.015 * land)})`,
                    transformOrigin: 'center center', borderRadius: el.radius, overflow: 'hidden', background: '#fffdf9',
                    border: el.kind === 'photo' ? undefined : '1px solid oklch(90% .008 82)',
                    boxShadow: land > 0.01 ? `0 ${10 - 5 * land}px ${24 - 12 * land}px rgba(30,25,18,${0.16 + 0.06 * land}), 0 2px 6px rgba(30,25,18,${0.08 + 0.06 * land})` : shadow,
                    opacity: settledOpacity, filter: `saturate(${saturate})`,
                  }}
                >
                  <UiPiece kind={el.kind} h={el.h} family={fonts.sans} src={el.img !== undefined ? imgs[el.img] : undefined} k={el.img ?? 0} />
                </div>
              </SpeedBlur>
            );
          })}
        </AbsoluteFill>
      </AbsoluteFill>

      {/* gold dust drifting up in front of the group photo */}
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        {(portrait ? [0, 1, 2] : [0]).flatMap((band) => DUST.map((d, i) => {
          const y = (((d.y0 - frame * d.rise) % 1080) + 1080) % 1080 + band * 1140;
          const x = d.x + Math.sin(frame * d.swayFreq + d.phase) * d.swayAmp;
          const twinkle = 0.7 + 0.3 * Math.sin(frame * 0.21 + d.phase * 3);
          return (
            <div key={`${band}-${i}`} style={{
              position: 'absolute', left: (x + band * 613) % 1920, top: y, width: d.size, height: d.size,
              borderRadius: '50%', background: 'oklch(78% 0.085 80)', opacity: d.opacity * twinkle,
              boxShadow: `0 0 ${d.size * 2.5}px ${d.size * 0.6}px oklch(84% 0.08 82 / 0.6)`,
            }} />
          );
        }))}
        {/* 前景失焦光斑：大而虚、上飘更快，压在合影最前面做景深 */}
        {(portrait ? [0, 1, 2] : [0]).flatMap((band) => BOKEH.map((b, i) => {
          const y = (((b.y0 - frame * b.rise) % 1180) + 1180) % 1180 - 50 + band * 1140;
          return (
            <div key={`b${band}-${i}`} style={{
              position: 'absolute', left: (b.x + band * 377) % 1920, top: y, width: b.size, height: b.size, borderRadius: '50%',
              background: 'radial-gradient(circle, oklch(86% 0.1 82 / 0.9) 0%, oklch(86% 0.1 82 / 0.35) 55%, oklch(86% 0.1 82 / 0) 72%)',
              opacity: b.opacity, filter: 'blur(2px)',
            }} />
          );
        }))}
      </AbsoluteFill>

      {/* opening light sweep */}
      {sweepOpacity > 0 ? (
        <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'overlay' }}>
          <div style={{
            position: 'absolute', top: 0, bottom: 0, left: sweepX - 300, width: 600,
            background: 'linear-gradient(90deg, rgba(255,244,224,0), rgba(255,244,224,1) 50%, rgba(255,244,224,0))', opacity: sweepOpacity,
          }} />
        </AbsoluteFill>
      ) : null}

      {/* stage light behind the wordmark */}
      {stageLight > 0 ? (
        <AbsoluteFill style={{
          pointerEvents: 'none',
          background: `radial-gradient(${portrait ? '900px 640px' : '700px 360px'} at 960px ${CY - 70}px, rgba(255,246,228,0.95), rgba(255,246,228,0.35) 55%, rgba(255,246,228,0) 75%)`,
          opacity: stageLight,
        }} />
      ) : null}

      {/* closing vignette */}
      {vignette > 0 ? (
        <AbsoluteFill style={{
          pointerEvents: 'none',
          background: `radial-gradient(${portrait ? '1500px 2600px' : '1400px 900px'} at 50% 50%, rgba(62,48,32,0) 55%, rgba(62,48,32,0.7) 100%)`, opacity: vignette,
        }} />
      ) : null}

      {/* wordmark sign-off */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: BRAND.font, fontSize: nameSize || 118, fontWeight: 700, lineHeight: 1.25, color: BRAND.ink, letterSpacing: `${0.03 + wordSpacing}em`, display: 'flex',
            flexDirection: portrait ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap',
            // letterpress：下沿 1px 纸面高光 + 一层极软的环境影，让字标"压"在合影之上而不是浮在纸上
            textShadow: bd ? '0 1px 12px rgba(255,255,255,0.7), 0 1px 0 rgba(255,253,248,0.75)' : '0 1px 0 rgba(255,253,248,0.75), 0 14px 36px rgba(60,44,24,0.14)',
          }}>
            {hasMark ? markEl : null}
            {NAME ? (
              <div style={{ display: 'flex' }}>
                {LETTERS.map((ch, i) => {
                  const delay = Math.round(42 + i * lstep);
                  const t = interpolate(frame, [delay, delay + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.2, 0.75, 0.3, 1) });
                  return (
                    <span key={i} style={{ opacity: t, transform: `translateY(${(1 - t) * 28}px) scale(${1.35 - 0.35 * t})`, filter: `blur(${(1 - t) * 8}px)`, display: 'inline-block', whiteSpace: 'pre' }}>
                      {ch}
                    </span>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div style={{ position: 'relative', height: portrait ? 9 : 6, width: portrait ? 400 : 260, margin: `${portrait ? 50 : 34}px auto 0` }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 4, background: 'oklch(52% 0.115 65)', transform: `scaleX(${rule})` }} />
            {ruleExt > 0 && ruleExtFade > 0 ? (
              <>
                <div style={{ position: 'absolute', top: '42%', height: portrait ? 2 : 1, right: '100%', width: (portrait ? 280 : 190) * ruleExt, background: 'oklch(52% 0.115 65)', opacity: ruleExtFade }} />
                <div style={{ position: 'absolute', top: '42%', height: portrait ? 2 : 1, left: '100%', width: (portrait ? 280 : 190) * ruleExt, background: 'oklch(52% 0.115 65)', opacity: ruleExtFade }} />
              </>
            ) : null}
          </div>
          {tagLines.length ? (
            <div style={{
              fontFamily: fonts.sans, fontSize: tagFs, fontWeight: 500, lineHeight: 1.35, letterSpacing: '0.1em', color: 'oklch(42% 0.008 82)', marginTop: portrait ? 44 : 30, textShadow: bd ? '0 1px 12px rgba(255,255,255,0.7)' : undefined,
              opacity: tag, transform: `translateY(${(1 - tag) * 6}px)`,
            }}>
              {tagLines.map((l, j) => <div key={j} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
      {/* 极弱胶片颗粒：大面积奶白纸面防色带 */}
      {!bd && <Grain opacity={0.045} />}
    </AbsoluteFill>
    {bd && fadeOut < 1 ? <AbsoluteFill style={{ background: '#0f0d0a', opacity: 1 - fadeOut }} /> : null}
    </AbsoluteFill>
  );
};
