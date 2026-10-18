// freeze-annotate 定格标注——真实卡片流运动中瞬间定格，马克笔圈注目标卡 + 箭头点题，解冻继续。
//
// 第二轮重设计（「评审暂停」· porcelain 瓷白 + 钴蓝马克笔）：
// - look = porcelain（冷白舞台 · 钴蓝强调）。主角仍是产品真实的项目卡流（2x 截图纹理，Q1）；
//   卡片立在冷白展台上，舞台有顶光与地面接触影，不再是平铺页面截图。
// - 定格要"像按下暂停"：45f 一帧切到斜率 0——快门白闪 3f、整帧套上钴蓝取景框四角（8f 弹入）、
//   左上时间码从「● TRỰC TIẾP 00:00:01:14」走字到「❚❚ TẠM DỪNG」并停住；其余卡去饱和 + 退淡，目标卡被拾起。
// - 标注是一套钴蓝马克笔：超椭圆一笔圈（1.08 圈、收笔不闭合、feTurbulence 手绘抖动）10f 画完 →
//   弧线箭头 6f + 箭头 3f → 右上 68px 粗体批注从线下升起 + 手绘下划线 →
//   批注署名一行。解冻前 8f 墨迹淡出，但在目标卡右上角留下一枚评论图钉「1」随卡离场——标注被"存下来了"。
// - 解冻：ease-in 起步（smootherstep），一张卡的行程 22f 赶完（平均斜率 >1 补偿停掉的时间），
//   快段按速度方向性模糊，落定时下一张卡停在屏中、带图钉的目标卡留在左侧。
//
// 时间表（30fps，共 158f）：
//   0–45    流动 1×（26px/f，轻微模糊），时间码走字——开场第 1 帧就在动
//   45      定格（瞬切，无缓入）：快门白闪 45–48、取景框 45–53 弹入、时间码变 PAUSED
//   45–55   拾起目标、其余卡去饱和退淡
//   54–64   圈注一笔（10f）；64–70 箭杆、70–73 箭头
//   66–78   批注升起；78–88 下划线；84–96 署名
//   96–108  hold（读）
//   104–112 墨迹淡出、取景框收回；图钉 104 起钉到卡角
//   112–134 解冻：ease-in 起步 → 刹停，一张卡行程（峰值 ≈55px/f，平均斜率 >1）
//   134–158 hold 24f：静止落定，带评论图钉的目标卡停在左侧
//
// [Agent Edit] o anh: focus (the duoc dung hinh + khoanh, BAT BUOC) + card1..card3 (cac the khac trong dong chay, optional;
// thieu -> the khung xam trung tinh). Anh ti le bat ky -> objectFit cover trong the 1.2:1 (thay cho card*.png + toa do
// live-layout.json). O chu: note (loi phe tay, 1-2 dong, tu thu nho), name (chu ky nguoi phe, optional), label (goc phai
// tren, optional, canh ten thuong hieu). Chu giao dien co dinh doi sang tieng Viet. Khung doc (native): the 1240 rong,
// loi phe to o phia tren, mui ten cong xuong vong khoanh; dong ho / nhan / 4 goc khung bam mep khung that.
import { useCurrentFrame, useImage, useShotFonts, useText, useVideoConfig, measureText, useBrand } from '../../../runtime';
import React, { useId } from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { EASE, SpeedBlur, mix, ramp, velocity } from '../../../fixtures/Polish';
import { LOOKS, Stage, TextReveal, alpha, springAt, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const FREEZEANNOTATE_DUR = 158;

const L = LOOKS.porcelain;
const INK = L.accent; // 钴蓝马克笔

const TARGET_K = 5;
const FREEZE = 45;
const THAW = 112;
const LAND = 134;
const SRC_PER_CARD = 652 / 26; // 一张卡的源帧行程（原版 PITCH 652 / 26px）——竖屏卡更大，速度按比例放大
const SE = 2 / 3; // 超椭圆参数指数 2/n（n=3）

const rnd = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// 多行自适应：从 size 往下试，直到按真实宽度折行 ≤ maxLines 且每行不超宽
const fitWrap = (text: string, family: string, size: number, maxW: number, weight: number, maxLines: number, trackEm = 0, minK = 0.42) => {
  const words = text.split(/\s+/).filter(Boolean);
  const w = (t: string, sz: number) => measureText(t, family, sz, weight) + Math.max(0, t.length - 1) * trackEm * sz;
  for (let sz = size; ; sz *= 0.94) {
    const lines: string[] = [];
    let cur = '';
    for (const word of words) {
      const t = cur ? cur + ' ' + word : word;
      if (cur && w(t, sz) > maxW) { lines.push(cur); cur = word; } else cur = t;
    }
    if (cur) lines.push(cur);
    const ok = lines.length <= maxLines && lines.every((l) => w(l, sz) <= maxW);
    if (ok || sz <= size * minK) {
      const fit = Math.min(sz, ...lines.map((l) => (sz * maxW) / Math.max(1, w(l, sz))));
      return { lines, size: Math.max(size * minK * 0.8, fit), w: (l: string) => w(l, Math.max(size * minK * 0.8, fit)) };
    }
  }
};

// remap：流动斜率 1 → 定格斜率 0（瞬切）→ 解冻 smootherstep（ease-in 起步，峰值斜率 ≈2.1，落定为 0）
const srcAt = (f: number) => {
  if (f <= FREEZE) return Math.max(0, f);
  if (f <= THAW) return FREEZE;
  const t = Math.min(1, (f - THAW) / (LAND - THAW));
  return FREEZE + SRC_PER_CARD * t * t * t * (t * (6 * t - 15) + 10);
};

// 时间码（30fps）：定格后停住
const timecode = (f: number) => {
  const total = 30 * 72 + Math.floor(srcAt(f)); // 从 00:00:01:12 起
  const ff = total % 30;
  const ss = Math.floor(total / 30) % 60;
  const mm = Math.floor(total / 1800) % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `00:${p(mm)}:${p(ss)}:${p(ff)}`;
};

// 取景框四角
const Bracket: React.FC<{ x: number; y: number; sx: 1 | -1; sy: 1 | -1; s: number; z: number }> = ({ x, y, sx, sy, s, z }) => (
  <div
    style={{
      position: 'absolute',
      left: sx === 1 ? x : x - 64 * z,
      top: sy === 1 ? y : y - 64 * z,
      width: 64 * z,
      height: 64 * z,
      borderLeft: sx === 1 ? `${4 * z}px solid ${INK}` : undefined,
      borderRight: sx === -1 ? `${4 * z}px solid ${INK}` : undefined,
      borderTop: sy === 1 ? `${4 * z}px solid ${INK}` : undefined,
      borderBottom: sy === -1 ? `${4 * z}px solid ${INK}` : undefined,
      transform: `translate(${(-sx * (1 - s) * 40 * z).toFixed(1)}px, ${(-sy * (1 - s) * 40 * z).toFixed(1)}px)`,
      opacity: Math.min(1, s * 1.5),
    }}
  />
);

// 中性占位卡：没有图片时的"其它卡"（不编造内容）
const SkeletonCard: React.FC<{ k: number; w: number; h: number }> = ({ k, w, h }) => {
  const u = w / 600;
  const bar = (top: number, width: number, hh: number, a: number) => (
    <div style={{ position: 'absolute', left: 30 * u, top: top * u, width: width * u, height: hh * u, borderRadius: hh * u, background: alpha(L.ink, a) }} />
  );
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#ffffff', borderRadius: 16 * u, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: h * 0.52, background: `linear-gradient(135deg, ${alpha(L.accent, 0.1 + rnd(k) * 0.08)}, ${alpha(L.accent2, 0.08 + rnd(k + 3) * 0.08)})` }}>
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 64 * u, height: 64 * u, marginLeft: -32 * u, marginTop: -32 * u, borderRadius: 16 * u, background: alpha('#ffffff', 0.65) }} />
      </div>
      {bar(h / u * 0.52 + 34, 300 + rnd(k + 7) * 200, 22, 0.14)}
      {bar(h / u * 0.52 + 80, 420 + rnd(k + 9) * 100, 14, 0.07)}
      {bar(h / u * 0.52 + 108, 260 + rnd(k + 11) * 160, 14, 0.07)}
      {bar(h / u * 0.52 + 150, 110, 28, 0.06)}
    </div>
  );
};

export const FreezeAnnotateReal: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = SH > 1080 * 1.2;
  const roughId = `rough-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const focusImg = useImage('focus', 'textures/live/card9.png');
  const others = [useImage('card1'), useImage('card2'), useImage('card3')].filter(Boolean) as string[];
  const note = useText('note', 'Làm cái này trước!');
  const signer = useText('name', 'Minh · trưởng nhóm');
  const label = useText('label', 'Buổi duyệt sản phẩm');

  // ── 几何：横屏原版 600 宽卡（统一 1.2:1）；竖屏 1100 宽卡 ──
  const Z = portrait ? 1.6 : 1; // 纹理元素（时间码 / 角标 / 签名）缩放
  const CARD_W = portrait ? 1240 : 600;
  const CARD_H = Math.round(CARD_W / 1.2);
  const GAP = portrait ? 80 : 52;
  const PITCH = CARD_W + GAP;
  const PX = PITCH / SRC_PER_CARD; // 每源帧导轨位移
  const RAIL_TOP = portrait ? Math.round(SH * 0.6 - CARD_H / 2) : 336;
  const OFFSET = 960 - (TARGET_K * PITCH + CARD_W / 2) + FREEZE * PX; // 定格时目标卡中心落屏中
  const railX = (f: number) => OFFSET - srcAt(f) * PX;

  // 圈注几何（定格时卡被拾起 −16px、放大 3%）
  const CX = 960;
  const CY = RAIL_TOP + CARD_H / 2 - 16 * Z;
  const RX = 1.2 * (CARD_W / 2) * 1.03;
  const RY = 1.22 * (CARD_H / 2) * 1.03;
  const N = 140;
  const a0 = -2.3;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const a = a0 + u * Math.PI * 2 * 1.08;
    const k = 1 - 0.04 * u;
    const c = Math.cos(a), sn = Math.sin(a);
    pts.push(`${(CX + Math.sign(c) * Math.pow(Math.abs(c), SE) * RX * k).toFixed(1)} ${(CY + Math.sign(sn) * Math.pow(Math.abs(sn), SE) * RY * k).toFixed(1)}`);
  }
  const circlePath = `M ${pts.join(' L ')}`;

  // 批注排版：横屏右上（x 1318，≤ 2 行）；竖屏卡片上方（左对齐 x 220，≤ 3 行）
  const NOTE_X = portrait ? 220 : 1318;
  const noteW = portrait ? 1480 : 1840 - 1318;
  const nf = fitWrap(note, fonts.sans, portrait ? 132 : 68, noteW, 820, portrait ? 3 : 2, -0.04, 0.55);
  const nLH = nf.size * 1.15;
  const noteH = nf.lines.length * nLH;
  const signS = 30 * Z;
  const NOTE_TOP = portrait ? Math.round(RAIL_TOP - 330 - noteH - (signer ? signS * 2.2 : 0)) : 112;
  const lastW = nf.w(nf.lines[nf.lines.length - 1] || '');
  const underY = NOTE_TOP + noteH + 6 * Z;
  const underW = Math.min(Math.max(...nf.lines.map((l) => nf.w(l))), portrait ? 1100 : 410);
  const signTop = underY + 26 * Z;

  const x0 = railX(frame);
  const v = velocity(railX, frame);
  const frozen = frame >= FREEZE && frame < THAW;
  const vth = 8 * (PITCH / 652);
  const blurV = frozen ? 0 : Math.sign(v) * Math.max(0, Math.abs(v) - vth) * (652 / PITCH);

  // 定格聚焦：10f 拾起目标、退淡其余；解冻前还原
  const focus = ramp(frame, FREEZE, 10, EASE.snappy) * (1 - ramp(frame, THAW - 8, 12, EASE.swift));
  const flash = frame >= FREEZE ? 1 - ramp(frame, FREEZE, 4, EASE.out) : 0;
  const frameIn = frame >= FREEZE ? springAt(frame, FREEZE, { damping: 16, stiffness: 260 }) : 0;
  const frameOut = ramp(frame, 104, 8, EASE.exit);
  const bracket = frameIn * (1 - frameOut);

  // 圈注时序
  const draw = ramp(frame, 54, 10, EASE.swift);
  const shaft = ramp(frame, 64, 6, EASE.out);
  const head = ramp(frame, 70, 3, EASE.out);
  const under = ramp(frame, 78, 10, EASE.swift);
  const sign = ramp(frame, 84, 12, EASE.out);
  const fade = 1 - ramp(frame, 104, 8, EASE.out);
  const showInk = frame >= 54 && fade > 0.001;

  // 图钉：墨迹淡出时钉到目标卡右上角，随卡离场
  const pin = frame >= 104 ? springAt(frame, 104, { damping: 13, stiffness: 240 }) : 0;

  // 箭头：横屏 = 右上批注左侧 → 圈的右上缘（原版）；竖屏 = 批注下方 → 圈的左上缘（向下弯）
  const ax0 = portrait ? NOTE_X + 80 : 1296;
  const ay0 = portrait ? signTop + (signer ? signS * 1.6 : 0) + 40 : signTop + 22;
  const ax1 = portrait ? CX - RX * 0.62 : CX + RX * 0.72;
  const ay1 = portrait ? CY - RY * 0.86 : CY - RY * 0.78;
  const qx = portrait ? ax0 : ax1 + 30;
  const qy = portrait ? ay1 - 20 : ay0 + 4;
  const arrowD = `M ${ax0} ${ay0} Q ${qx} ${qy} ${ax1} ${ay1}`;
  const ang = Math.atan2(ay1 - qy, ax1 - qx);
  const wl = 34 * Z;
  const wing = (s: number) =>
    `M ${ax1.toFixed(1)} ${ay1.toFixed(1)} L ${(ax1 - Math.cos(ang + s * 0.5) * wl).toFixed(1)} ${(ay1 - Math.sin(ang + s * 0.5) * wl).toFixed(1)}`;
  const underD = `M ${NOTE_X} ${underY + 8 * Z} C ${NOTE_X + underW * 0.27} ${underY} ${NOTE_X + underW * 0.66} ${underY + 4 * Z} ${NOTE_X + underW} ${underY - 4 * Z}`;
  void lastW;

  const cards: React.ReactNode[] = [];
  for (let k = 0; k < 14; k++) {
    const left = x0 + k * PITCH;
    if (left > 1980 || left + CARD_W < -60) continue;
    const isT = k === TARGET_K;
    const src = isT ? focusImg : others.length ? others[(((k - TARGET_K - 1) % others.length) + others.length) % others.length] : undefined;
    const lift = isT ? focus : 0;
    cards.push(
      <div
        key={k}
        style={{
          position: 'absolute',
          left: k * PITCH,
          top: 0,
          width: CARD_W,
          height: CARD_H,
          transform: isT ? `translateY(${(-16 * Z * lift).toFixed(2)}px) scale(${(1 + 0.03 * lift).toFixed(4)})` : undefined,
          opacity: isT ? 1 : 1 - 0.5 * focus,
          filter: !isT && focus > 0.01 ? `saturate(${(1 - 0.9 * focus).toFixed(3)})` : undefined,
          zIndex: isT ? 2 : 1,
        }}
      >
        {/* 两层软阴影：接触影 + 环境影（拾起时加深加大） */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 16 * Z,
            boxShadow: `0 2px 4px ${alpha(L.shadow, 0.08)}, 0 ${((24 + 26 * lift) * Z).toFixed(0)}px ${((60 + 40 * lift) * Z).toFixed(0)}px -18px ${alpha(L.shadow, 0.22 + 0.14 * lift)}`,
          }}
        />
        {src ? (
          <Img src={src} style={{ position: 'relative', width: '100%', height: '100%', display: 'block', borderRadius: 16 * Z, objectFit: 'cover', background: '#ffffff' }} />
        ) : (
          <SkeletonCard k={k} w={CARD_W} h={CARD_H} />
        )}
        {isT && pin > 0.001 && (
          <div
            style={{
              position: 'absolute',
              right: -22 * Z,
              top: -22 * Z,
              width: 52 * Z,
              height: 52 * Z,
              borderRadius: `${26 * Z}px ${26 * Z}px ${26 * Z}px ${6 * Z}px`,
              background: INK,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `scale(${pin.toFixed(4)})`,
              transformOrigin: '0% 100%',
              boxShadow: `0 8px 20px -6px ${alpha(INK, 0.6)}`,
              ...type(26 * Z, 750),
            }}
          >
            1
          </div>
        )}
      </div>,
    );
  }

  const tcTop = portrait ? 200 : 96;
  const M = portrait ? 120 : 96;
  const live = frozen ? 'TẠM DỪNG' : 'TRỰC TIẾP';
  const initial = (signer.trim()[0] || 'A').toUpperCase();
  const labelS = Math.min(30 * Z, (30 * Z * 820) / Math.max(1, measureText(`${BRAND.name} ${label}`, fonts.sans, 30 * Z, 600)));

  return (
    <AbsoluteFill style={{ background: L.bg[1], overflow: 'hidden', fontFamily: fonts.sans }}>
      <Stage look={L} keyLight={{ x: 0.5, y: portrait ? 0.3 : 0.1 }} fill={{ x: 0.5, y: 1.0 }} horizon={portrait ? undefined : 0.86} />
      {/* 展台地面：一道很淡的冷灰接地带，让卡片"立在台上" */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: RAIL_TOP + CARD_H + 26 * Z,
          height: 120 * Z,
          background: `radial-gradient(ellipse 60% 50% at 50% 0%, ${alpha(L.shadow, 0.08)} 0%, ${alpha(L.shadow, 0)} 70%)`,
        }}
      />

      {/* 导轨 */}
      <SpeedBlur vx={blurV} amount={0.3 * (PITCH / 652)} max={26 * (PITCH / 652)}>
        <div style={{ position: 'absolute', left: 0, top: RAIL_TOP, transform: `translateX(${x0.toFixed(2)}px)` }}>{cards}</div>
      </SpeedBlur>

      {/* 左上：时间码（定格即停） */}
      <div style={{ position: 'absolute', left: M, top: tcTop, display: 'flex', alignItems: 'center', gap: 18 * Z }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12 * Z,
            padding: `${10 * Z}px ${18 * Z}px`,
            borderRadius: 12 * Z,
            background: frozen ? INK : alpha(L.ink, 0.06),
            color: frozen ? '#fff' : L.ink2,
            ...type(24 * Z, 750, { mono: true }),
            letterSpacing: '0.12em',
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
          }}
        >
          {frozen ? (
            <span style={{ display: 'flex', gap: 5 * Z }}>
              <span style={{ width: 6 * Z, height: 20 * Z, background: '#fff', borderRadius: 1 }} />
              <span style={{ width: 6 * Z, height: 20 * Z, background: '#fff', borderRadius: 1 }} />
            </span>
          ) : (
            <span style={{ width: 12 * Z, height: 12 * Z, borderRadius: 6 * Z, background: '#e5484d' }} />
          )}
          {live}
        </div>
        <span style={{ ...type(30 * Z, 600, { mono: true }), color: frozen ? INK : L.ink2 }}>{timecode(frame)}</span>
      </div>
      {/* 右上：品牌 + 场次标签（定格时退场，让位给批注）；竖屏放到时间码下一行 */}
      {(brand || label) && (
        <div style={{ position: 'absolute', right: M, top: portrait ? tcTop + 110 : 96, display: 'flex', alignItems: 'center', gap: 16 * Z, opacity: 1 - focus, whiteSpace: 'nowrap' }}>
          {brand ? <ShotcraftMark size={44 * Z * (labelS / (30 * Z))} tone="light" /> : null}
          {brand ? <span style={{ ...type(labelS * 1.06, 700), fontFamily: BRAND.font, letterSpacing: '0.02em', color: L.ink }}>{BRAND.name}</span> : null}
          {label ? <span style={{ ...type(labelS, 450), color: L.ink3 }}>{label}</span> : null}
        </div>
      )}

      {/* 墨迹：圈 + 箭头 + 下划线 */}
      {showInk && (
        <svg width={1920} height={SH} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: fade, mixBlendMode: 'multiply' }}>
          <defs>
            <filter id={roughId}>
              <feTurbulence type="fractalNoise" baseFrequency={(0.022 / Z).toFixed(4)} numOctaves="2" seed="11" result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale={6 * Z} />
            </filter>
          </defs>
          <g filter={`url(#${roughId})`} fill="none" stroke={INK} strokeLinecap="round" strokeLinejoin="round" opacity={0.92}>
            <path d={circlePath} strokeWidth={11 * Z} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw} transform={`rotate(-3 ${CX} ${CY})`} />
            {shaft > 0 && <path d={arrowD} strokeWidth={8 * Z} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - shaft} />}
            {head > 0 && (
              <>
                <path d={wing(1)} strokeWidth={8 * Z} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - head} />
                <path d={wing(-1)} strokeWidth={8 * Z} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - head} />
              </>
            )}
            {under > 0 && <path d={underD} strokeWidth={8 * Z} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - under} />}
          </g>
        </svg>
      )}

      {/* 批注：粗体钴蓝，从线下升起；署名一行 */}
      {showInk && frame >= 66 && (
        <div style={{ position: 'absolute', left: NOTE_X, top: NOTE_TOP, opacity: fade, transform: 'rotate(-2deg)', transformOrigin: '0% 100%' }}>
          {nf.lines.map((l, i) => (
            <div key={i} style={{ ...type(nf.size, 820), lineHeight: 1.15, color: INK, whiteSpace: 'pre' }}>
              <TextReveal text={l} by="word" variant="rise" start={66 + i * 4} each={14} gap={Math.min(3, 10 / Math.max(1, l.split(' ').length))} />
            </div>
          ))}
        </div>
      )}
      {showInk && sign > 0 && signer ? (
        <div
          style={{
            position: 'absolute',
            left: NOTE_X + 4,
            top: signTop,
            opacity: sign * fade,
            transform: `translateY(${mix(10, 0, sign).toFixed(2)}px)`,
            display: 'flex',
            alignItems: 'center',
            gap: 12 * Z,
            ...type(signS, 550),
            lineHeight: 1.3,
            color: L.ink2,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ width: 34 * Z, height: 34 * Z, borderRadius: 17 * Z, background: `linear-gradient(135deg, #8aa4ff, ${INK})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', ...type(18 * Z, 750) }}>
            {initial}
          </span>
          {signer}
        </div>
      ) : null}

      {/* 取景框四角（定格才出现） */}
      {bracket > 0.001 && (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
          <Bracket x={48} y={48} sx={1} sy={1} s={bracket} z={Z} />
          <Bracket x={1872} y={48} sx={-1} sy={1} s={bracket} z={Z} />
          <Bracket x={48} y={SH - 48} sx={1} sy={-1} s={bracket} z={Z} />
          <Bracket x={1872} y={SH - 48} sx={-1} sy={-1} s={bracket} z={Z} />
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: portrait ? 160 : 64,
              textAlign: 'center',
              opacity: bracket,
              ...type(22 * Z, 700, { mono: true }),
              letterSpacing: '0.24em',
              color: alpha(INK, 0.8),
            }}
          >
            DỪNG HÌNH · 0 FPS
          </div>
        </AbsoluteFill>
      )}

      {/* 快门白闪 */}
      {flash > 0.001 && <AbsoluteFill style={{ background: '#ffffff', opacity: 0.7 * flash, pointerEvents: 'none' }} />}
    </AbsoluteFill>
  );
};
