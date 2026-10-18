// basic-3d-scene — impress.js 式空间步进（第二轮重设计）
// 手法不变：卡片散布在 3D 空间（各有 x·y·z + 旋转 + 缩放），相机取每站姿态之逆依次飞行对齐，
// 末站拉远成 OVERVIEW 总览。核心配方 camera = stepTransform.inverse()。
//
// 设计决定
// - look：graphite（近单色暗场，白为强调、香槟金只做点缀）——像发布会上"三章节"的空间叙事。
//   产品是 video-shotcraft，三站 = 品牌短句拆成的三个章节：Frame / Craft / Ship，
//   总览站是品牌落版「Craft the shot.」（标志 + 字标做眉题）。
// - 卡片是为镜头设计的海报而不是小 UI：1240×700 原生 1:1 排版（对位时屏幕上就是原生像素，
//   不经 DesignStage 放大，字不糊），150px 标题 + 44px 说明 + 420px 细体大号章节数字（被卡边裁切的编辑感）。
// - 空间感：世界里散布 70 颗真 3D 浮尘（各有 z，相机飞/转时有真实视差）；非当前卡按"站距"退焦变暗；
//   飞行中段相机额外拉远 ~30%（hop）让观众看见"还有别的卡在空间里"，再推近落位。
// - 每站停留时卡底一条金色进度线走满（像幻灯片计时），停留段不是死帧；落位前 8f 标题逐词从线下升起，
//   每张卡只揭示一次，之后在总览里保持已读状态。
// - 运动模糊：飞行段做时间采样（快门 0.5f，子帧 3–8 个按相机位移自适应），停留段零开销。
//
// 时间表（30fps，225f = 7.5s）
//   0–36    站 1 Capture：相机从 1.06 倍距离缓推到位（snappy 30f）；2f 起标题逐词升起；进度线走满
//   36–64   飞行 1→2（28f）：右移 + 世界左转 38°，途中 hop 拉远 30%
//   64–96   站 2 Connect 停留 32f
//   96–128  飞行 2→3（32f）：画框侧躺 90° 被转正——最长的一段，观众要看懂"世界在转"
//   128–158 站 3 Ship 停留 30f
//   158–190 飞行 3→总览（32f）：相机 1/2.7 拉远，三卡与品牌落版同框
//   184–212 落版：眉题字距收拢 → 「Craft the shot.」逐词升起 → 副句淡入
//   206–224 hold：极缓推近 1.5%，尾帧是一张完整海报
//
// [Agent Edit] o chu: kicker (nhan chung tren the + tren ban tong ket) / step1..3 (tieu de 3 the) / desc1..3 (cau mo ta) /
// title + subtitle (ban tong ket cuoi). Chu dai ngan bat ky: tieu de the tu xuong dong (<= 2 dong ngang / 3 dong doc) va
// thu nho; nhip hien tung ky tu nen theo do dai. Mat na "chu troi len" co padding tren 0.32em / duoi 0.26em (dau tieng Viet).
// Ban tong ket: ban goc treo trong the gioi 3D (scale 2.7) bi Chrome ve hong -> ve o lop man hinh, bien doi theo dung
// camera (xoay rz + ti le + dich) nen van "dat" vao canh tong ket nhu ban goc.
// Khung doc (portrait.mode = 'native'): the to hon (1560x1400), cac tram xep zic-zac theo chieu doc, ban tong ket xep
// the o nua tren + chu o nua duoi; bui 3D phu kin chieu cao that.
import { useCurrentFrame, useVideoConfig, useText, useBrand, useShotFonts, wrapLines, fitSize } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, FONT, bezier, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, SERIF, Stage, alpha, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const BASIC_3D_SCENE_DURATION = 225; // 7.5s @30fps

const L = LOOKS.graphite;
const GOLD = L.accent2;

type Pose = { x: number; y: number; z: number; rx: number; ry: number; rz: number; s: number };
type Mote = { x: number; y: number; z: number; r: number; a: number };
type Geo = { portrait: boolean; CW: number; CH: number; PERSP: number; POSES: Pose[]; MOTES: Mote[]; SH: number };

const hash = (n: number) => {
  const x = Math.sin(n * 91.345 + 47.853) * 43758.5453;
  return x - Math.floor(x);
};
// 世界里的真 3D 浮尘：位置固定在世界坐标，视差全部来自相机
const motes = (x0: number, w: number, y0: number, h: number, n: number): Mote[] =>
  Array.from({ length: n }, (_, i) => ({
    x: x0 + hash(i * 3.1) * w,
    y: y0 + hash(i * 5.7 + 1) * h,
    z: -3200 + hash(i * 7.3 + 2) * 3600,
    r: 3 + hash(i * 11.9 + 3) * 7,
    a: 0.25 + hash(i * 13.1 + 4) * 0.55,
  }));

// 每站：卡片自己的 pose（相机取其逆）。站 2 世界左转 38°、站 3 画框侧躺 90°、总览 s=2.7 拉远
const GEO_LAND: Omit<Geo, 'SH'> = {
  portrait: false,
  CW: 1240, // 卡片原生尺寸（对位时屏幕 1:1）
  CH: 700,
  PERSP: 2600,
  POSES: [
    { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1 },
    { x: 1690, y: -260, z: -650, rx: 0, ry: -38, rz: 0, s: 1 },
    { x: 2590, y: 830, z: -850, rx: 0, ry: 0, rz: 90, s: 1 },
    { x: 594, y: 480, z: -400, rx: 0, ry: 0, rz: 0, s: 2.7 },
  ],
  MOTES: motes(-2600, 6800, -2000, 4800, 70),
};
// [Agent Edit] khung doc: cung 4 tram / cung kieu bien doi (ry -38 / rz 90 / tong ket), xep zic-zac xuong duoi
const GEO_PORT: Omit<Geo, 'SH'> = {
  portrait: true,
  CW: 1560,
  CH: 1400,
  PERSP: 3200,
  POSES: [
    { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1 },
    { x: 1150, y: 1550, z: -650, rx: 0, ry: -38, rz: 0, s: 1 },
    { x: -250, y: 3150, z: -850, rx: 0, ry: 0, rz: 90, s: 1 },
    { x: 420, y: 2700, z: -400, rx: 0, ry: 0, rz: 0, s: 2.5 },
  ],
  MOTES: motes(-3600, 8000, -4200, 11600, 110),
};

// 飞行时刻表（帧）：[起, 止]
const FLIGHTS: [number, number][] = [[36, 64], [96, 128], [158, 190]];
const ARRIVE = [0, 64, 128, 190]; // 每站落位帧（站 0 开场即在）
const HOLD_END = [36, 96, 158, 225];
const FLY_EASE = bezier(0.62, 0, 0.16, 1); // 起步稳、落位很软的不对称 in-out
const HOP = 0.3; // 站间飞行途中额外拉远比例

// 相机姿态（帧的纯函数，可取小数帧：运动模糊子帧采样用）
const camAt = (f: number, POSES: Pose[]) => {
  const cam: Pose = { ...POSES[0] };
  // 开场：从 1.06 倍距离缓推到位（不是死帧起手）
  cam.s = mix(1.06, 1, ramp(f, 0, 30, EASE.snappy));
  let af = 0; // 累计飞行进度（0..3，小数 = 途中）
  let hop = 0;
  FLIGHTS.forEach(([a, b], i) => {
    const u = ramp(f, a, b - a, FLY_EASE);
    af += u;
    const p = POSES[i + 1];
    (Object.keys(cam) as (keyof Pose)[]).forEach((k) => {
      cam[k] = mix(cam[k], p[k], u);
    });
    if (i < 2 && u > 0 && u < 1) hop = HOP * Math.sin(Math.PI * u);
  });
  cam.s *= 1 + hop;
  // 停留段极缓推近 1.5%：落位后慢慢吃进去，下一段飞行起步时同曲线还原（画面活着但不晃）
  let creep = 0;
  for (let i = 0; i < 3; i++) {
    creep += ramp(f, ARRIVE[i] + 4, HOLD_END[i] - ARRIVE[i], EASE.smooth) * (1 - ramp(f, FLIGHTS[i][0], 14, EASE.smooth));
  }
  cam.s *= 1 - 0.015 * creep;
  // 总览落定后极缓推近 1.5%（hold 段活着，不晃）
  cam.s *= 1 - 0.015 * ramp(f, 196, 29, EASE.smooth);
  return { cam, af };
};

const camTransform = (c: Pose) =>
  `scale(${(1 / c.s).toFixed(5)}) rotateZ(${(-c.rz).toFixed(4)}deg) rotateY(${(-c.ry).toFixed(4)}deg) rotateX(${(-c.rx).toFixed(4)}deg) translate3d(${(-c.x).toFixed(3)}px,${(-c.y).toFixed(3)}px,${(-c.z).toFixed(3)}px)`;
const poseTransform = (p: Pose) =>
  `translate3d(${p.x}px,${p.y}px,${p.z}px) rotateX(${p.rx}deg) rotateY(${p.ry}deg) rotateZ(${p.rz}deg) scale(${p.s})`;

// [Agent Edit] chu "troi len tu duoi vach" (thay TextReveal rise): mat na chua cho dau tieng Viet chong tang
const Rise: React.FC<{ text: string; by: 'char' | 'word'; start: number; each: number; gap: number; frame: number }> = ({ text, by, start, each, gap, frame }) => {
  const units = by === 'word' ? text.split(/(\s+)/) : Array.from(text.normalize('NFC'));
  let k = 0;
  return (
    <span style={{ whiteSpace: 'pre' }}>
      {units.map((u, i) => {
        if (/^\s+$/.test(u)) return <span key={i}>{u}</span>;
        const p = EASE.snappy(Math.max(0, Math.min(1, (frame - start - k++ * gap) / each)));
        return (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.32em 0.03em 0.26em', margin: '-0.32em -0.03em -0.26em' }}>
            <span style={{ display: 'inline-block', transform: `translateY(calc(${((1 - p) * 105).toFixed(2)}% + ${((1 - p) * 0.62).toFixed(3)}em))` }}>{u}</span>
          </span>
        );
      })}
    </span>
  );
};

// 标题按宽度折行 + 字号逐档下调：返回 { size, lines }
const fitLines = (text: string, family: string, base: number, maxW: number, weight: number, maxLines: number, fitsH: (size: number, n: number) => boolean = () => true) => {
  for (const k of [1, 0.88, 0.76, 0.66]) {
    const size = Math.round(base * k);
    const lines = balanced(text, family, size, maxW, weight, maxLines);
    const ok = lines.every((l) => fitSize(l, { family, size, maxWidth: maxW, weight }) >= size) && fitsH(size, lines.length);
    if (ok) return { size, lines };
  }
  const size = Math.round(base * 0.66);
  const lines = wrapLines(text, family, size, maxW, weight, maxLines);
  return { size: Math.min(...lines.map((l) => fitSize(l, { family, size, maxWidth: maxW, weight, minSize: base * 0.3 }))), lines };
};

// 多行正文按行数求最窄宽度 → 各行长度均衡（避免末行孤字）
const balanced = (text: string, family: string, size: number, maxW: number, weight: number, maxLines: number) => {
  const base = wrapLines(text, family, size, maxW, weight, maxLines);
  if (base.length < 2) return base;
  let lo = maxW * 0.5, hi = maxW;
  for (let k = 0; k < 10; k++) {
    const mid = (lo + hi) / 2;
    if (wrapLines(text, family, size, mid, weight, 99).length <= base.length) hi = mid; else lo = mid;
  }
  return wrapLines(text, family, size, hi, weight, maxLines);
};

type Chapter = { no: string; title: string; body: string };

// ───────── 章节卡 ─────────
const ChapterCard: React.FC<{ i: number; c: Chapter; kicker: string; frame: number; focus: number; geo: Geo }> = ({ i, c, kicker, frame, focus, geo }) => {
  const fonts = useShotFonts();
  const brand = useBrand();
  const P = geo.portrait;
  const padX = P ? 100 : 84;
  const padY = P ? 92 : 74;
  const innerW = geo.CW - padX * 2;
  const arrive = ARRIVE[i];
  const reveal = arrive - (i === 0 ? -2 : 8); // 标题在落位前一拍开始升起
  const hold = ramp(frame, arrive, HOLD_END[i] - arrive, EASE.smooth); // 进度线
  const numIn = ramp(frame, reveal - 4, 26, EASE.out);
  const bodyIn = ramp(frame, reveal + 8, 18, EASE.out);
  const bodySize = P ? 62 : 44;
  const bodyLines = c.body ? balanced(c.body, fonts.sans, bodySize, P ? innerW : Math.min(900, innerW), 420, 3) : [];
  const lhB = bodySize * 1.3;
  const bodyH = bodyLines.length ? (P ? 44 : 30) + bodyLines.length * lhB : 0;
  // 文字块底部锚在进度线之上；顶部不压眉题（标题字号按可用高度下调）
  const bottom = geo.CH - (P ? 200 : 150);
  const minTop = padY + (P ? 110 : 70);
  const T = fitLines(c.title, fonts.sans, P ? 210 : 156, innerW, 760, P ? 3 : 2, (sz, n) => n * sz * 1.12 + bodyH <= bottom - minTop);
  const lhT = T.size * 1.12;
  const blockH = T.lines.length * lhT + bodyH;
  const top = Math.max(minTop, bottom - blockH);
  // 逐字揭示：总字数多时压缩字间隔，标题须在本站停留结束前读完
  const nChars = Array.from(c.title).length;
  const g = Math.min(1.8, 22 / Math.max(1, nChars));
  let off = 0;
  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: FONT.sans }}>
      {/* 细体大号章节数字：被卡右缘裁掉一截（编辑感），只做纹理层 */}
      <div style={{
        position: 'absolute', right: -36, bottom: P ? -150 : -118, ...type(P ? 760 : 560, 200), letterSpacing: '-0.06em',
        color: 'transparent', backgroundImage: `linear-gradient(170deg, ${alpha('#ffffff', 0.16)} 10%, ${alpha('#ffffff', 0.02)} 70%)`,
        WebkitBackgroundClip: 'text', backgroundClip: 'text',
        transform: `translateY(${((1 - numIn) * 60).toFixed(1)}px)`, opacity: numIn,
      }}>{c.no}</div>
      {/* 眉题 */}
      <div style={{ position: 'absolute', left: padX, right: padX, top: padY, display: 'flex', alignItems: 'center', gap: 18, ...type(P ? 34 : 26, 600, { mono: true }), letterSpacing: '0.14em', color: L.ink3, whiteSpace: 'nowrap' }}>
        <span style={{ color: GOLD }}>{c.no}</span>
        <span style={{ width: P ? 60 : 44, height: 1, background: alpha(GOLD, 0.6), flex: 'none' }} />
        {kicker ? <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{kicker.toUpperCase()}</span> : null}
        {brand ? (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, fontFamily: BRAND.font, fontSize: P ? 36 : 28, fontWeight: 700, letterSpacing: '0.03em', color: L.ink2 }}>
            <ShotcraftMark size={P ? 42 : 32} tone="dark" />{BRAND.name}
          </span>
        ) : null}
      </div>
      {/* 标题：逐字从线下升起 */}
      <div style={{ position: 'absolute', left: padX, top, width: innerW, ...type(T.size, 760), lineHeight: `${lhT}px`, color: L.ink }}>
        {T.lines.map((l, li) => {
          const st = reveal + off * g;
          off += Array.from(l).length + 1;
          return (
            <div key={li} style={{ height: lhT, whiteSpace: 'nowrap' }}>
              <Rise text={l} by="char" start={st} each={20} gap={g} frame={frame} />
            </div>
          );
        })}
      </div>
      {bodyLines.length ? (
        <div style={{
          position: 'absolute', left: padX, top: top + T.lines.length * lhT + (P ? 44 : 30), ...type(bodySize, 420), lineHeight: `${lhB}px`, color: L.ink2,
          opacity: bodyIn, transform: `translateY(${((1 - bodyIn) * 18).toFixed(1)}px)`,
        }}>
          {bodyLines.map((l, li) => <div key={li} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
        </div>
      ) : null}
      {/* 底部：三段章节进度，当前段金色走满 */}
      <div style={{ position: 'absolute', left: padX, right: padX, bottom: P ? 96 : 70, display: 'flex', gap: 14 }}>
        {[0, 1, 2].map((k) => (
          <div key={k} style={{ flex: 1, height: P ? 4 : 3, borderRadius: 2, background: alpha('#ffffff', 0.1), overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${(k < i ? 1 : k === i ? hold : 0) * 100}%`,
              background: k === i ? `linear-gradient(90deg, ${alpha(GOLD, 0.7)}, ${GOLD})` : alpha('#ffffff', 0.45),
              boxShadow: k === i ? `0 0 ${10 * focus}px ${alpha(GOLD, 0.6)}` : undefined,
            }} />
          </div>
        ))}
      </div>
    </div>
  );
};

// ───────── 总览落版（屏幕层，按相机姿态变换 = 等同挂在总览站上） ─────────
const OverviewPlate: React.FC<{ frame: number; geo: Geo; kicker: string; title: string; sub: string }> = ({ frame, geo, kicker, title, sub }) => {
  const fonts = useShotFonts();
  const brand = useBrand();
  const P = geo.portrait;
  const st = 184;
  const kick = ramp(frame, st, 22, EASE.snappy);
  const subIn = ramp(frame, st + 16, 16, EASE.out);
  const left = P ? 150 : 120;
  const maxW = P ? 1920 - 300 : 1240;
  const T = fitLines(title, fonts.serif, P ? 190 : 140, maxW, 400, P ? 3 : 2);
  const subSize = P ? 60 : 38;
  const subLines = sub ? balanced(sub, fonts.sans, subSize, maxW, 420, 2) : [];
  const nWords = title.split(/\s+/).filter(Boolean).length;
  const g = Math.min(5, 16 / Math.max(1, nWords));
  const lhT = T.size * 1.14;
  const eyebrow = brand || kicker;
  let wi = 0;
  const block = (
    <>
      {eyebrow ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, ...type(P ? 34 : 24, 600, { mono: true }), letterSpacing: `${mix(0.6, 0.16, kick).toFixed(3)}em`, color: GOLD, opacity: kick, whiteSpace: 'nowrap' }}>
          {brand ? <ShotcraftMark size={P ? 54 : 40} tone="dark" /> : null}
          {brand ? <span style={{ fontFamily: BRAND.font, fontSize: P ? 42 : 30, fontWeight: 700, letterSpacing: '0.03em', color: L.ink }}>{BRAND.name}</span> : null}
          {kicker ? <span>{brand ? '· ' : ''}{kicker.toUpperCase()}</span> : null}
        </div>
      ) : null}
      <div style={{ marginTop: P ? 40 : 26, ...type(T.size, 400, { serif: true }), fontFamily: SERIF, letterSpacing: '-0.03em', lineHeight: `${lhT}px`, color: L.ink }}>
        {T.lines.map((l, li) => {
          const s0 = st + 6 + wi * g;
          wi += l.split(/\s+/).filter(Boolean).length;
          return (
            <div key={li} style={{ height: lhT, whiteSpace: 'nowrap' }}>
              <Rise text={l} by="word" start={s0} each={22} gap={g} frame={frame} />
            </div>
          );
        })}
      </div>
      {subLines.length ? (
        <div style={{ marginTop: P ? 34 : 22, ...type(subSize, 420), lineHeight: 1.3, color: L.ink2, opacity: subIn, transform: `translateY(${((1 - subIn) * 14).toFixed(1)}px)` }}>
          {subLines.map((l, li) => <div key={li} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
        </div>
      ) : null}
    </>
  );
  return (
    <div style={{ position: 'absolute', left: -960, top: -geo.SH / 2, width: 1920, height: geo.SH, pointerEvents: 'none' }}>
      {P ? (
        <div style={{ position: 'absolute', left, width: maxW, top: Math.round(geo.SH * 0.655) }}>{block}</div>
      ) : (
        <div style={{ position: 'absolute', left, width: maxW, bottom: 128 }}>{block}</div>
      )}
    </div>
  );
};

// 一个完整的世界（给定帧，可为小数帧）
const World: React.FC<{ f: number; frame: number; geo: Geo; chapters: Chapter[]; kicker: string }> = ({ f, frame, geo, chapters, kicker }) => {
  const { POSES, CW, CH } = geo;
  const { cam, af } = camAt(f, POSES);
  const over = ramp(f, FLIGHTS[2][0], FLIGHTS[2][1] - FLIGHTS[2][0], EASE.smooth);
  return (
    <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, transformStyle: 'preserve-3d', transform: camTransform(cam) }}>
      {geo.MOTES.map((m, k) => (
        <div key={k} style={{
          position: 'absolute', left: -m.r, top: -m.r, width: m.r * 2, height: m.r * 2, borderRadius: '50%',
          transform: `translate3d(${m.x}px,${m.y}px,${m.z}px)`,
          background: `radial-gradient(circle, ${alpha('#f4efe4', m.a)} 0%, ${alpha('#f4efe4', 0)} 70%)`,
        }} />
      ))}
      {chapters.map((c, i) => {
        const p = POSES[i];
        // enter/exit：按"站距"退焦变暗；总览时全部回到可读（但略压暗，给落版让主次）
        const d = Math.min(1, Math.abs(af - i));
        const focus = Math.max(1 - d, over * 0.85);
        const lift = (1 - d) * 18;
        return (
          <div key={i} style={{
            position: 'absolute', left: -CW / 2, top: -CH / 2, width: CW, height: CH, borderRadius: geo.portrait ? 44 : 34, overflow: 'hidden',
            transform: `${poseTransform(p)} translateZ(${lift.toFixed(2)}px)`,
            background: `radial-gradient(ellipse 80% 90% at 18% 0%, ${alpha('#ffffff', 0.07)} 0%, ${alpha('#ffffff', 0)} 60%), linear-gradient(165deg, #202226 0%, #16171a 55%, #111214 100%)`,
            border: `1.5px solid ${alpha('#ffffff', 0.08 + 0.08 * focus)}`,
            boxShadow: `inset 0 1.5px 0 ${alpha('#ffffff', 0.12)}, 0 30px 80px -10px rgba(0,0,0,0.7), 0 6px 18px rgba(0,0,0,0.5)`,
            opacity: 0.22 + 0.78 * focus,
            filter: focus < 0.985 ? `blur(${((1 - focus) * 7).toFixed(2)}px)` : undefined,
          }}>
            {/* 顶沿受光线：中间亮两端隐 */}
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, background: `linear-gradient(90deg, transparent, ${alpha('#ffffff', 0.35 * (0.4 + 0.6 * focus))}, transparent)` }} />
            <ChapterCard i={i} c={c} kicker={kicker} frame={frame} focus={focus} geo={geo} />
          </div>
        );
      })}
    </div>
  );
};

// 飞行段时间采样：快门 0.5 帧内 N 个子帧逐层 opacity 1/(i+1) 叠加 = 等权平均；N 按相机位移自适应
const SHUTTER = 0.5;
const samplesAt = (f: number, POSES: Pose[]) => {
  const a = camAt(f, POSES).cam, b = camAt(f - SHUTTER, POSES).cam;
  const disp = Math.hypot(a.x - b.x, a.y - b.y) / a.s + Math.abs(a.z - b.z) * 0.4
    + (Math.abs(a.ry - b.ry) + Math.abs(a.rz - b.rz)) * 14 + Math.abs(Math.log(a.s / b.s)) * 1400;
  return Math.max(1, Math.min(8, Math.ceil(disp / 5)));
};

export const Basic3DScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const portrait = SH > 1080 * 1.2;
  const geo: Geo = { ...(portrait ? GEO_PORT : GEO_LAND), SH };
  const kicker = useText('kicker', 'Lộ trình 3 bước');
  const chapters: Chapter[] = [
    { no: '01', title: useText('step1', 'Ý tưởng.'), body: useText('desc1', 'Bắt đầu từ một vấn đề thật của khách hàng.') },
    { no: '02', title: useText('step2', 'Thực hiện.'), body: useText('desc2', 'Biến kế hoạch thành sản phẩm chạy được.') },
    { no: '03', title: useText('step3', 'Ra mắt.'), body: useText('desc3', 'Đưa đến tay người dùng và đo kết quả.') },
  ];
  const title = useText('title', 'Ba bước, một hành trình.');
  const sub = useText('subtitle', 'Từ ý tưởng đến sản phẩm trong tay khách hàng.');
  const flying = FLIGHTS.some(([a, b]) => frame > a && frame < b);
  const n = flying ? samplesAt(frame, geo.POSES) : 1;
  // 落版：飞行过半才显影（与原版同一时刻），屏幕层按相机变换贴在总览站上
  const plateOn = ramp(frame, 176, 16, EASE.out);
  const { cam } = camAt(frame, geo.POSES);
  const O = geo.POSES[3];
  const plateT = `rotate(${(-cam.rz).toFixed(4)}deg) scale(${(1 / cam.s).toFixed(5)}) translate(${(O.x - cam.x).toFixed(2)}px,${(O.y - cam.y).toFixed(2)}px) scale(${O.s})`;
  return (
    <AbsoluteFill style={{ background: L.bg[2] }}>
      <Stage look={L} keyLight={{ x: 0.5, y: -0.08 }} fill={{ x: 0.85, y: 1.05 }} breathe={0.6} intensity={0.55} />
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        {Array.from({ length: n }, (_, i) => (
          <AbsoluteFill key={i} style={{ perspective: `${geo.PERSP}px`, opacity: 1 / (i + 1) }}>
            <World f={n > 1 ? frame - (SHUTTER * i) / (n - 1) : frame} frame={frame} geo={geo} chapters={chapters} kicker={kicker} />
          </AbsoluteFill>
        ))}
        {plateOn > 0 ? (
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, opacity: plateOn, transform: plateT }}>
            <OverviewPlate frame={frame} geo={geo} kicker={kicker} title={title} sub={sub} />
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
