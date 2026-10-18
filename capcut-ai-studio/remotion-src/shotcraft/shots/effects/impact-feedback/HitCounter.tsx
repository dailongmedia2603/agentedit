// hit-counter 连招计数：三张功能卡接连砸入槽位，每次命中 = 全局顿帧 2f + 落点伤害数字上浮渐隐
// + 右上角 ×N combo 跳字（脉冲 / 倾斜 / 字号逐次加码）。组合：hitstop + damage-number-pop + combo-counter。
//
// 第二轮重设计（钴蓝街机海报 · 构建工具更新日）：
// - look = custom「cobalt arcade」：满版高饱和钴蓝色场（不是深海军蓝暗场）+ 白卡 + 街机黄。
//   格斗游戏 combo UI 的语言直接拿来讲"功能连招"：伤害数字是黄色斜体 900 字重 + 硬投影（漫画式错位影），
//   计数器是 150→210px 的斜体「×N」，底下三格热度条逐格点亮。
// - 内容：video-shotcraft 的三项能力，每一击的"伤害"= 做一支宣传片省下的制作时间（−2 h / −1 day / −3 days，示意值），
//   三击打完收尾一行「Up to a week back on every promo.」——游戏梗落到真实收益上。
// - 顿帧是全局的：背景斜纹滚动、浮尘、卡片、特效全部由同一个 remap 时间 t 驱动，命中时整幅画面一起冻 2f；
//   只有卡面闪白与槽位受光用真实帧（冻结期间也要发生）。
// - 触地：卡按速度竖向拉伸 + 运动模糊 → 触地压扁回弹（指数回落）→ 白色冲击环外扩 + 黄色火花八向迸射 + 槽底受光。
//
// 时间表（动画时间 t，30fps；真实帧 = t + 已冻结帧）：
//   0–22    建立：钴蓝场、三个虚线槽位（01/02/03）、眉题、暗色 ×0 计数器
//   20/48/76 → 30/58/86  三张卡各 10f ease-in(quad) 砸落（间隔 28f 的均匀连招节拍）
//   每命中   全局顿帧 2f；伤害数字打在卡面上 scale 1.45→1 + 上浮 150px 出卡沿，4f 后 12f 渐隐；计数器 exp(−t/2.4) 回落
//   100–124 收尾行逐词升起，"a week" 用街机黄
//   124–176 hold：背景斜纹极缓滚动，干净海报
//
// [Agent Edit] Noi dung that: o chu `items` (3 muc = 3 cu dap — ten tinh nang / buoc / loi ich), `descs` (mo ta ngan
// tung the, tuy chon), `numbers` (3 "con so sat thuong" bay len o moi cu dap, vd −2 giờ / +30% / x3), `kicker` (nhan
// tren cung, canh thuong hieu cua video), `title` (cau chot cuoi; 2 TU CUOI to vang). Nhip 3 cu dap / do lon tang dan /
// do dong khung toan cuc giu nguyen. Chu dai: ten the <= 2 dong, mo ta <= 2 dong, the tu cao them (khung ngang) hoac
// rong ca khung (khung doc). Khung doc (portrait.mode = 'native'): 3 the xep doc rong ca khung, roi tu tren xuong vao
// tung o; bo dem COMBO goc phai tren; cau chot to o duoi; ca khoi can giua chieu cao that.
import { useBackdrop, useCurrentFrame, useList, useShotFonts, useText, useVideoConfig, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, FONT, Grain, SpeedBlur, Vignette, bezier, mix, ramp } from '../../../fixtures/Polish';
import { alpha, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const HIT_COUNTER_DURATION = 176;

// 自定义 look「cobalt arcade」
const C = {
  bg0: '#1b3fd6', bg1: '#1230b0', bg2: '#0a1d78',
  card: '#f7f8ff', ink: '#0b1240', ink2: '#4a5488', ink3: '#8a93bf',
  hit: '#ffd23f', // 街机黄：只给伤害数字 / 计数器 / 火花 / 关键收益
  deep: '#06104a', // 硬投影色
};

const HITS_T = [30, 58, 86]; // 命中时刻（动画时间）
const STOP = 2; // 每次顿帧帧数
const HITS_REAL = HITS_T.map((h, i) => h + i * STOP); // 真实命中帧 = 动画命中帧 + 已冻结帧
const inQuad = bezier(0.55, 0.085, 0.68, 0.53);

const DMG_SIZE = [88, 104, 124]; // 伤害数字逐击加大
const PULSE = [1.3, 1.45, 1.6];
const TILT = [-2, -4, -6];
const COUNTER_SIZE = [140, 166, 196];
const ICONS = ['recipe', 'beat', 'layers'];

const Icon: React.FC<{ name: string; size: number }> = ({ name, size }) => {
  const sw = { fill: 'none', stroke: C.bg1, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      {/* 清单卡 */}
      {name === 'recipe' && (
        <>
          <rect x="4" y="3.5" width="16" height="17" rx="2.5" {...sw} />
          <path d="M8 8.5h8M8 12h8M8 15.5h5" {...sw} />
        </>
      )}
      {/* 波形 */}
      {name === 'beat' && <path d="M3 12h1.5M7 8.5v7M11 4.5v15M15 8v8M19 10.5v3M21 12h0.5" {...sw} />}
      {/* 层叠 */}
      {name === 'layers' && (
        <>
          <path d="M3 8.5L12 4l9 4.5-9 4.5-9-4.5z" {...sw} />
          <path d="M3 12.5l9 4.5 9-4.5M3 16.5L12 21l9-4.5" {...sw} />
        </>
      )}
    </svg>
  );
};

type CardLay = { w: number; h: number; k: number; pad: [number, number]; nameSize: number; nameLines: string[][]; descSize: number; descLines: string[][] };

// saved = 伤害数字飘走后，收益「落」进卡片页脚的进度（0–1）
const FeatureCard: React.FC<{ i: number; elev: number; saved: number; L: CardLay; dmg: string }> = ({ i, elev, saved, L, dmg }) => {
  const k = L.k;
  return (
    <div
      style={{
        width: L.w, height: L.h, boxSizing: 'border-box', borderRadius: 26 * k, padding: `${L.pad[0]}px ${L.pad[1]}px ${32 * k}px`,
        background: `linear-gradient(180deg, #ffffff 0%, ${C.card} 100%)`,
        boxShadow: `inset 0 1px 0 #fff, 0 ${(2 + elev * 0.4).toFixed(1)}px ${(4 + elev * 0.6).toFixed(1)}px ${alpha(C.deep, 0.25)}, 0 ${(10 + elev * 0.8).toFixed(1)}px ${(30 + elev * 1.4).toFixed(1)}px -8px ${alpha(C.deep, 0.5)}`,
        display: 'flex', flexDirection: 'column', fontFamily: FONT.sans, color: C.ink,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ width: 62 * k, height: 62 * k, borderRadius: 18 * k, background: alpha(C.bg0, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={ICONS[i]} size={34 * k} />
        </div>
        <div style={{ marginLeft: 'auto', ...type(26 * k, 600, { mono: true }), color: C.ink3 }}>0{i + 1}</div>
      </div>
      <div style={{ marginTop: 26 * k, ...type(L.nameSize, 760), letterSpacing: '-0.03em', lineHeight: 1.18, whiteSpace: 'nowrap' }}>
        {L.nameLines[i].map((l, j) => <div key={j}>{l}</div>)}
      </div>
      {L.descLines[i].length ? (
        <div style={{ marginTop: 10 * k, ...type(L.descSize, 450), letterSpacing: '-0.01em', lineHeight: 1.3, color: C.ink2, whiteSpace: 'nowrap' }}>
          {L.descLines[i].map((l, j) => <div key={j}>{l}</div>)}
        </div>
      ) : null}
      <div
        style={{
          marginTop: 'auto', paddingTop: 16 * k, borderTop: `1px solid ${alpha(C.ink, 0.1)}`, display: 'flex', alignItems: 'baseline',
          opacity: saved, transform: `translateY(${mix(10, 0, saved).toFixed(1)}px)`,
        }}
      >
        <span style={{ ...type(32 * k, 800), fontStyle: 'italic', letterSpacing: '-0.02em', lineHeight: 1.25, color: C.bg1, whiteSpace: 'nowrap' }}>{dmg}</span>
      </div>
    </div>
  );
};

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export const HitCounter: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const kicker = useText('kicker', 'CÓ GÌ MỚI');
  const items0 = useList('items', ['Tự động cắt ghép', 'Phụ đề tức thì', 'Hiệu ứng một chạm']);
  const descs0 = useList('descs', ['Chọn cảnh, AI lo phần còn lại.', 'Nói tới đâu, chữ hiện tới đó.', 'Bấm một lần là có chuyển động.']);
  const nums0 = useList('numbers', ['−2 giờ', '−1 ngày', '−3 ngày']);
  const title = useText('title', 'Mỗi video tiết kiệm trọn một tuần.');
  const pad3 = (a: string[], d: string[]) => [0, 1, 2].map((i) => (a[i] ?? d[i] ?? '').trim());
  const items = pad3(items0, ['', '', '']);
  const descs = pad3(descs0, ['', '', '']);
  const DMG = pad3(nums0, ['', '', '']);

  // —— 版式 ——
  const k = portrait ? 1.8 : 1;
  const SLOT_W = portrait ? 1920 - 240 : 480;
  const GAP = portrait ? 64 : 60;
  const padY = 34 * k;
  const padX = 38 * k;
  const inner = SLOT_W - padX * 2;
  // ten the: <= 2 dong, co chung cho 3 the; mo ta: <= 2 dong
  const N0 = 48 * k;
  const nameRaw = items.map((t) => wrapLines(t, fonts.sans, N0, inner, 760, 2));
  const nameSize = Math.min(...nameRaw.flat().map((l) => fitSize(l, { family: fonts.sans, size: N0, maxWidth: inner, weight: 760, minSize: N0 * 0.6 })));
  const nameLines = items.map((t) => wrapLines(t, fonts.sans, nameSize, inner, 760, 2));
  const D0 = 30 * k;
  const DL = portrait ? 1 : 2; // khung doc: the rong, mo ta 1 dong
  const descRaw = descs.map((t) => (t ? wrapLines(t, fonts.sans, D0, inner, 450, DL) : []));
  const descSize = Math.min(D0, ...descRaw.flat().map((l) => fitSize(l, { family: fonts.sans, size: D0, maxWidth: inner, weight: 450, minSize: D0 * 0.7 })));
  const descLines = descs.map((t) => (t ? wrapLines(t, fonts.sans, descSize, inner, 450, DL) : []));
  const nameH = Math.max(...nameLines.map((l) => l.length)) * nameSize * 1.18;
  const descH = Math.max(...descLines.map((l) => l.length)) * descSize * 1.3;
  const need = padY + 62 * k + 26 * k + nameH + (descH ? 10 * k + descH : 0) + 18 * k + 16 * k + 32 * k * 1.25 + 32 * k;
  const SLOT_H = Math.ceil(Math.max((portrait ? 270 : 330) * k, need));
  const cardL: CardLay = { w: SLOT_W, h: SLOT_H, k, pad: [padY, padX], nameSize, nameLines, descSize, descLines };

  // 收尾行：<= 2 行（竖屏 3 行），末两词街机黄
  const T0 = portrait ? 108 : 60;
  const tMaxW = portrait ? 1920 - 240 : 1680;
  const tLinesRaw = wrapLines(title, fonts.sans, T0, tMaxW, 760, portrait ? 3 : 2);
  const tSize = Math.min(...tLinesRaw.map((l) => fitSize(l, { family: fonts.sans, size: T0, maxWidth: tMaxW, weight: 760, minSize: T0 * 0.6 })));
  const tLines = wrapLines(title, fonts.sans, tSize, tMaxW, 760, portrait ? 3 : 2);
  const tLH = Math.round(tSize * 1.22);

  // 槽位坐标
  let SLOT_Y: number[];
  let SLOT_XS: number[];
  let titleY: number;
  let headY: number;
  if (!portrait) {
    const y = Math.min(446, 830 - SLOT_H);
    SLOT_Y = [y, y, y];
    SLOT_XS = [0, 1, 2].map((i) => 960 - (SLOT_W * 3 + GAP * 2) / 2 + i * (SLOT_W + GAP));
    titleY = Math.max(y + SLOT_H + 50, 1040 - tLines.length * tLH);
    headY = 104;
  } else {
    const headH = 340;
    const blockH = headH + 80 + SLOT_H * 3 + GAP * 2 + 110 + tLines.length * tLH;
    const y0 = Math.max(160, Math.round((SH - blockH) / 2));
    headY = y0;
    const sy = y0 + headH + 80;
    SLOT_Y = [0, 1, 2].map((i) => sy + i * (SLOT_H + GAP));
    SLOT_XS = [120, 120, 120];
    titleY = sy + SLOT_H * 3 + GAP * 2 + 110;
  }
  const dropFrom = -SLOT_H - 140;
  const dropY = (t: number, hit: number, i: number) => mix(Math.min(dropFrom, SLOT_Y[i] - 906), SLOT_Y[i], ramp(t, hit - 10, 10, inQuad));

  // —— 全局帧 remap：每个真实命中帧起冻结 2f ——
  const remap = (fr: number) => {
    let t = fr;
    for (const h of HITS_REAL) t -= Math.min(Math.max(fr - h, 0), STOP);
    return t;
  };
  const t = remap(frame);
  const count = HITS_T.filter((h) => t >= h).length;

  // —— 计数器 ——
  let cScale = 1;
  let cRot = 0;
  let cSize = 130;
  if (count > 0) {
    const i = count - 1;
    const since = t - HITS_T[i];
    cScale = 1 + (PULSE[i] - 1) * Math.exp(-since / 2.4);
    cRot = TILT[i];
    cSize = COUNTER_SIZE[i];
  }
  const ck = portrait ? 1.3 : 1;
  const stamp = count > 0 ? 1 - ramp(t, HITS_T[count - 1], 7, EASE.out) : 0;

  // 背景斜纹滚动（t 驱动 → 顿帧时一起冻住）
  const stripeShift = t * 2.2;
  const words = title.split(/\s+/).filter(Boolean);
  const nW = words.length;
  const wGap = Math.min(3, 36 / Math.max(1, nW));
  const tStart = HITS_REAL[2] + 14;
  let wi = 0;
  // [Agent Edit] nen anh AI: bo nen gradient + quang + soc cheo; chu nam thang tren anh -> bong toi nhe.
  // Luoi cham (网点) trang tri da bo han (ke ca khi khong co nen anh).
  const bd = useBackdrop();
  const tsh = bd ? '0 2px 18px rgba(0,0,0,0.55)' : undefined;

  return (
    <AbsoluteFill style={{ overflow: 'hidden', fontFamily: FONT.sans, background: bd ? 'transparent' : `linear-gradient(170deg, ${C.bg0} 0%, ${C.bg1} 55%, ${C.bg2} 100%)` }}>
      {/* 背景：主光 + 斜纹（速度线的静态版） */}
      {!bd && <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 60% ${portrait ? 35 : 55}% at 38% 30%, ${alpha('#6f8dff', 0.45)} 0%, ${alpha('#6f8dff', 0)} 70%)` }} />}
      {!bd && (
        <div
          style={{
            position: 'absolute', inset: -200, opacity: 0.1,
            backgroundImage: 'repeating-linear-gradient(-58deg, #ffffff 0px, #ffffff 2px, transparent 2px, transparent 46px)',
            transform: `translateX(${(stripeShift % 54.2).toFixed(2)}px)`,
          }}
        />
      )}

      {/* 眉题：视频品牌 + 标签 */}
      <div style={{ position: 'absolute', left: 120, top: headY, display: 'flex', alignItems: 'center', gap: 18 * k, opacity: ramp(frame, 0, 14, EASE.out), maxWidth: portrait ? 1100 : 1000, textShadow: tsh }}>
        <ShotcraftMark size={52 * k} tone="dark" />
        {BRAND.name ? <div style={{ ...type(34 * k, 760), color: '#fff', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{BRAND.name}</div> : null}
        <div style={{ ...type(fitSize(kicker, { family: fonts.sans, size: 26 * k, maxWidth: portrait ? 1050 : 700, weight: 700, minSize: 16 * k, letterSpacingEm: 0.2 }), 700), color: alpha('#ffffff', 0.72), letterSpacing: '0.2em', marginLeft: 8, whiteSpace: 'nowrap' }}>{kicker.toUpperCase()}</div>
      </div>

      {/* 槽位：虚线 + 大号序号，建立期就立预期 */}
      {SLOT_XS.map((x, i) => {
        const near = ramp(t, HITS_T[i] - 10, 10, inQuad);
        const df = frame - HITS_REAL[i];
        const glowA = df >= 0 ? Math.exp(-df / 6) : 0; // 槽底受光（真实帧）
        return (
          <React.Fragment key={`slot-${i}`}>
            <div
              style={{
                position: 'absolute', left: x, top: SLOT_Y[i], width: SLOT_W, height: SLOT_H, borderRadius: 26 * k, boxSizing: 'border-box',
                border: `${2 * k}px dashed ${alpha('#ffffff', 0.28)}`, background: alpha(C.deep, 0.16),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                ...type(120 * k, 800), color: alpha('#ffffff', 0.1), letterSpacing: '-0.04em',
              }}
            >
              0{i + 1}
            </div>
            {near > 0 && t < HITS_T[i] && (
              <div
                style={{
                  position: 'absolute', left: x + 40 - (1 - near) * 40, top: SLOT_Y[i] + 50, width: SLOT_W - 80 + (1 - near) * 80, height: SLOT_H - 40,
                  borderRadius: 30, background: C.deep, filter: `blur(${mix(44, 16, near).toFixed(1)}px)`, opacity: mix(0.05, 0.5, near),
                }}
              />
            )}
            {glowA > 0.02 && (
              <div
                style={{
                  position: 'absolute', left: x - 120, top: SLOT_Y[i] + SLOT_H - 80 * k, width: SLOT_W + 240, height: 200 * k, borderRadius: '50%',
                  background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha(C.hit, 0.45 * glowA)} 0%, ${alpha(C.hit, 0)} 70%)`,
                }}
              />
            )}
          </React.Fragment>
        );
      })}

      {/* 三张卡 */}
      {HITS_T.map((hit, i) => {
        if (t < hit - 10) return null;
        const y = dropY(t, hit, i);
        const vy = t < hit ? dropY(t + 0.5, hit, i) - dropY(t - 0.5, hit, i) : 0;
        const speed = Math.min(1, vy / 200);
        const s = t - hit;
        const squash = s >= 0 ? 0.07 * Math.exp(-s / 1.6) : 0;
        const sy = 1 + speed * 0.06 - squash;
        const sx = 1 - speed * 0.025 + squash * 0.5;
        const from = Math.min(dropFrom, SLOT_Y[i] - 906);
        const elev = s >= 0 ? 6 : mix(6, 60, (SLOT_Y[i] - y) / (SLOT_Y[i] - from));
        const df = frame - HITS_REAL[i];
        const flash = df >= 0 && df < STOP + 4 ? (df < STOP ? 0.7 : 0.7 * (1 - (df - STOP + 1) / 5)) : 0;
        return (
          <SpeedBlur key={`card-${i}`} vx={0} vy={vy} amount={0.12} max={24}>
            <div style={{ position: 'absolute', left: SLOT_XS[i], top: y, transform: `scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`, transformOrigin: 'bottom center' }}>
              <FeatureCard i={i} elev={elev} saved={ramp(t, hit + 12, 12, EASE.snappy)} L={cardL} dmg={DMG[i]} />
              {flash > 0 && <div style={{ position: 'absolute', inset: 0, borderRadius: 26 * k, background: '#ffffff', opacity: flash }} />}
            </div>
          </SpeedBlur>
        );
      })}

      {/* 触地冲击：白色冲击环 + 八向黄色火花（t 驱动，顿帧时冻住） */}
      {HITS_T.map((hit, i) => {
        const s = t - hit;
        if (s < 0 || s > 16) return null;
        const ring = ramp(t, hit, 14, EASE.out);
        const grow = mix(0, (46 + i * 10) * k, ring);
        const x0 = SLOT_XS[i];
        const cx = x0 + SLOT_W / 2;
        const cy = SLOT_Y[i] + SLOT_H / 2;
        const burst = ramp(t, hit, 12, EASE.snappy);
        const n = 10 + i * 3; // 火花逐击加码
        // 竖屏卡很宽：火花椭圆按卡高取半径，横向放宽
        const rx = SLOT_W * 0.52;
        const ry = SLOT_H * 0.56;
        return (
          <React.Fragment key={`fx-${i}`}>
            <div
              style={{
                position: 'absolute', left: x0 - grow, top: SLOT_Y[i] - grow * 0.7, width: SLOT_W + grow * 2, height: SLOT_H + grow * 1.4,
                borderRadius: 26 * k + grow * 0.6, boxSizing: 'border-box', border: `${mix(5 * k, 1, ring).toFixed(2)}px solid #ffffff`, opacity: (1 - ring) * 0.8,
              }}
            />
            <svg width={1920} height={SH} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
              {Array.from({ length: n }, (_, kk) => {
                const ang = (kk / n) * Math.PI * 2 + hash(i * 31 + kk) * 0.4;
                const r0 = mix(1, 1.08 + hash(kk + i * 7) * 0.15, burst);
                const r1 = mix(1.04, 1.3 + hash(kk * 3 + i) * 0.35 + i * 0.06, Math.min(1, burst * 1.2));
                const ex = portrait ? 0.35 : 1; // 竖屏宽卡：横向火花不要飞出画面
                return (
                  <line
                    key={kk}
                    x1={cx + Math.cos(ang) * rx * (1 + (r0 - 1) * ex)} y1={cy + Math.sin(ang) * ry * r0}
                    x2={cx + Math.cos(ang) * rx * (1 + (r1 - 1) * ex)} y2={cy + Math.sin(ang) * ry * r1}
                    stroke={kk % 3 === 0 ? '#ffffff' : C.hit} strokeWidth={mix(7 * k, 2 * k, burst)} strokeLinecap="round"
                    opacity={Math.min(1, burst * 6) * (1 - burst)}
                  />
                );
              })}
            </svg>
          </React.Fragment>
        );
      })}

      {/* 伤害数字：黄色斜体 + 漫画式硬投影 */}
      {HITS_T.map((hit, i) => {
        const s = t - hit;
        if (s < 0 || s > 17 || !DMG[i]) return null;
        const size = fitSize(DMG[i], { family: fonts.sans, size: DMG_SIZE[i] * k, maxWidth: Math.min(SLOT_W * 0.92, 1680 / 1.45), weight: 900, italic: true, minSize: DMG_SIZE[i] * k * 0.5 });
        const scale = mix(1.45, 1, ramp(t, hit, 5, EASE.snappy));
        const rise = mix(0, -150 * k, ramp(t, hit, 16, EASE.out));
        const opacity = s < 4 ? 1 : 1 - ramp(t, hit + 4, 12, EASE.swift);
        return (
          <div
            key={`dmg-${i}`}
            style={{
              // 落点在卡面中下部（打在目标身上），上浮出卡沿：不与右上角计数器抢位置
              position: 'absolute', left: SLOT_XS[i] + SLOT_W / 2, top: SLOT_Y[i] + SLOT_H * 0.62 - size + rise,
              transform: `translateX(-50%) scale(${scale.toFixed(3)}) skewX(-8deg)`, transformOrigin: 'center bottom', opacity,
              ...type(size, 900), fontStyle: 'italic', letterSpacing: '-0.04em', lineHeight: 1.2, color: C.hit, whiteSpace: 'nowrap',
              textShadow: `${6 * k}px ${6 * k}px 0 ${C.deep}`,
            }}
          >
            {DMG[i]}
          </div>
        );
      })}

      {/* 右上角 combo 计数器 */}
      <div
        style={{
          position: 'absolute', right: 120, top: portrait ? headY - 20 : 64, width: 400 * ck, height: 280 * ck,
          transform: `scale(${cScale.toFixed(4)}) rotate(${cRot}deg)`, transformOrigin: '90% 20%',
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
        }}
      >
        <div style={{ ...type(26 * ck, 800, { caps: true }), letterSpacing: '0.3em', color: count ? '#ffffff' : alpha('#ffffff', 0.4), fontStyle: 'italic', textShadow: tsh }}>Combo</div>
        <div
          style={{
            ...type(cSize * ck, 900), fontStyle: 'italic', letterSpacing: '-0.05em', lineHeight: 0.9, whiteSpace: 'nowrap',
            color: count ? C.hit : alpha('#ffffff', bd ? 0.5 : 0.22), textShadow: count ? `7px 7px 0 ${C.deep}` : tsh ?? 'none',
            transform: `translateY(${(-stamp * 0.14 * cSize * ck).toFixed(1)}px) skewX(-6deg)`, marginTop: 6,
          }}
        >
          ×{count}
        </div>
        <div style={{ display: 'flex', gap: 8 * ck, marginTop: 14 * ck }}>
          {[0, 1, 2].map((kk) => (
            <div key={kk} style={{ width: 56 * ck, height: 10 * ck, borderRadius: 5 * ck, background: kk < count ? C.hit : alpha('#ffffff', 0.18), boxShadow: kk < count ? `3px 3px 0 ${C.deep}` : 'none' }} />
          ))}
        </div>
      </div>

      {/* 收尾：真实收益（逐词升起；遮罩上下留足越南语声调符号的空间） */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: titleY, textAlign: 'center', ...type(tSize, 760), letterSpacing: '-0.025em', lineHeight: `${tLH}px`, color: '#ffffff', textShadow: tsh }}>
        {tLines.map((ln, li) => (
          <div key={li} style={{ whiteSpace: 'nowrap' }}>
            {ln.split(/\s+/).filter(Boolean).map((w, j, arr) => {
              const idx = wi++;
              const p = ramp(frame, tStart + idx * wGap, 18, EASE.snappy);
              const hot = idx >= nW - Math.min(2, Math.max(1, nW - 2));
              return (
                <React.Fragment key={j}>
                  <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.32em 0.04em 0.26em', margin: '-0.32em -0.04em -0.26em' }}>
                    <span style={{ display: 'inline-block', transform: `translateY(${((1 - p) * 160).toFixed(2)}%)`, color: hot ? C.hit : undefined }}>{w}</span>
                  </span>
                  {j < arr.length - 1 ? ' ' : null}
                </React.Fragment>
              );
            })}
          </div>
        ))}
      </div>

      <Vignette strength={0.42} inner={0.45} color={bd ? '#000000' : C.deep} />
      <Grain opacity={0.07} blend="soft-light" />
    </AbsoluteFill>
  );
};
