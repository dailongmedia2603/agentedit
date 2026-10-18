// pill-slot-cycle —— 句中词槽轮换：固定句干 + 句尾 pill 老虎机式滚一格
// 源：notion-ai 4.5–8.5s。旧 pill 上飞淡出、新 pill 从下带运动模糊滑入，
// 连换 3–6 次后 pill 消失、句子落成完整结论句收束。
//
// 质感升级：
// - pill 绕"滚筒"翻入翻出：入场 rotateX -38°→0 + 0.94→1，出场 0→34° + 1→0.94（perspective 1400），
//   竖向运动模糊按真实速度计算（SVG 只在 y 轴模糊），静止为 0。
// - pill 材质：白面 + 发丝线 + 顶部内高光 + 随"离槽高度"变化的两层软阴影；图标换同一套线性 SVG，
//   落在强调色浅底小方块里（替代 Unicode 字符 ▲ ☰ 等字体回退字形）。
// - 系统字体栈 + 负字距；柔光 Backdrop 替代 #ececea 平铺。
// - 收束：结论句落位后，整行用 smooth 缓缓居中（句干在列举期间仍纹丝不动），再 hold ≥45f。
//
// [Agent Edit] o chu: stem (than cau co dinh, vd "Chỉ một app để") / items (3-6 cum dong tu lan luot trong pill) /
// ending (vế chot thay pill o cuoi, cung co chu voi than cau, vd "làm tất cả."). Nhip moi pill = min(28, 126/n) khung
// (6 muc = 21f nhu ban goc), phan con lai la hold. Co chu tinh tu be ngang that (than cau + pill dai nhat vua khung); diem
// neo trai dat sao cho pill dai nhat nam giua. Mau nhan = mau nhan cua video (LOOKS.porcelain.accent).
// Khung doc (native): than cau o dong tren (to, toi da 2 dong), pill / ve chot o dong duoi, ca hai neo trai co dinh khi
// lan pill; khi chot xong moi dong truot ve giua.
import { useCurrentFrame, useVideoConfig, useText, useList, useShotFonts, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, interpolate, Easing } from 'remotion';
import { G } from '../../../fixtures/Fixtures';
import { Backdrop, EASE, FONT as PFONT, mix, ramp, softShadow, innerHighlight } from '../../../fixtures/Polish';
import { LOOKS, alpha } from '../../../fixtures/Look';

const L = LOOKS.porcelain; // 只取强调色（随视频主色）

type IconKey = 'board' | 'capture' | 'camera' | 'beat' | 'sound' | 'render';
const ICONS: IconKey[] = ['board', 'capture', 'camera', 'beat', 'sound', 'render'];

const INTRO = 12; // 句干入场
const SWAP = 8; // 每拍前 8f 完成换位
const FIN = 14; // 收束句落位
const CENTER = 26; // 落位后整行缓缓居中
// 12f 入场 + 6×21f 列举 + 14f 收束 + 48f 完整句 hold
export const PILL_SLOT_CYCLE_DURATION = 200; // ≈ 6.7s

const STEM_GAP0 = 36;
const WORD_GAP0 = 18; // 结论句里句干与结论之间是普通词距，不是槽位间距

// 线性图标（24 视框，stroke 继承 currentColor）
const Icon: React.FC<{ k: IconKey; size: number }> = ({ k, size }) => {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
      {k === 'board' && (
        <>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" {...p} />
          <path d="M12 4.5v15M3.5 12h17" {...p} />
        </>
      )}
      {k === 'capture' && (
        <>
          <path d="M4 8.5V5.5A1.5 1.5 0 0 1 5.5 4h3M15.5 4h3A1.5 1.5 0 0 1 20 5.5v3M20 15.5v3a1.5 1.5 0 0 1-1.5 1.5h-3M8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3" {...p} />
          <rect x="8" y="9" width="8" height="6" rx="1" {...p} />
        </>
      )}
      {k === 'camera' && (
        <>
          <rect x="3" y="7" width="12" height="10" rx="2" {...p} />
          <path d="M15 10.5l5.5-3v9l-5.5-3z" {...p} />
        </>
      )}
      {k === 'beat' && <path d="M5 10v4M8.5 7v10M12 4v16M15.5 8v8M19 10.5v3" {...p} />}
      {k === 'sound' && (
        <>
          <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" {...p} />
          <path d="M15.5 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" {...p} />
        </>
      )}
      {k === 'render' && (
        <>
          <rect x="3.5" y="5" width="17" height="14" rx="2.5" {...p} />
          <path d="M10 9.2v5.6l4.8-2.8z" {...p} />
        </>
      )}
    </svg>
  );
};

// pill 本体；lift = 离槽高度（0 落槽 → 1 飞行中），驱动阴影大小与虚实；k = 整体缩放
const Pill: React.FC<{ label: string; icon: IconKey; k: number; lift?: number; style?: React.CSSProperties }> = ({ label, icon, k, lift = 0, style }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 18 * k,
      padding: `${14 * k}px ${38 * k}px ${14 * k}px ${18 * k}px`,
      borderRadius: 999,
      background: 'linear-gradient(180deg, #ffffff 0%, #fafafb 100%)',
      border: '1px solid rgba(20,22,28,0.10)',
      boxShadow: `${innerHighlight(0.95)}, ${softShadow(6 + lift * 30)}`,
      fontFamily: PFONT.sans,
      fontWeight: 700,
      fontSize: 64 * k,
      lineHeight: 1.3,
      letterSpacing: '-0.025em',
      color: G.ink1,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    <span
      style={{
        width: 62 * k,
        height: 62 * k,
        borderRadius: 18 * k,
        background: alpha(L.accent, 0.11),
        boxShadow: `inset 0 0 0 1px ${alpha(L.accent, 0.14)}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: L.accent,
        flexShrink: 0,
      }}
    >
      <Icon k={icon} size={34 * k} />
    </span>
    {label}
  </div>
);

// 竖向运动模糊滤镜（只在 y 轴模糊；std<0.3 时不挂滤镜）
const VBlur: React.FC<{ id: string; std: number }> = ({ id, std }) => (
  <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
    <filter id={id} x="-10%" y="-60%" width="120%" height="220%">
      <feGaussianBlur stdDeviation={`0 ${std.toFixed(2)}`} />
    </filter>
  </svg>
);

// 入场位移曲线（像素）：从下 +120 强 ease-out 落槽
const inYAt = (bf: number) => mix(120, 0, ramp(bf, 0, SWAP, EASE.snappy));
// 出场位移曲线：向上 -130 ease-in 加速飞出
const outYAt = (bf: number) => mix(0, -130, ramp(bf, 0, SWAP - 1, EASE.exit));

export const PillSlotCycle: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const stem = useText('stem', 'Chỉ một app để');
  const items = useList('items', ['Lên kịch bản', 'Quay sản phẩm', 'Dựng video', 'Chèn nhạc nền', 'Làm phụ đề', 'Đăng lên mạng']).slice(0, 6);
  const ending = useText('ending', 'làm tất cả.');
  const PILLS = items.map((label, i) => ({ label, icon: ICONS[i % ICONS.length] }));
  const CYCLES = Math.max(1, PILLS.length);
  // 拍长：6 词 = 21f（原版）；词少时放慢但 ≤28f，余量全给收尾 hold
  const BEAT = Math.min(28, Math.floor(126 / CYCLES));

  // 字号：句干 96 / pill 64 的比例不变，整体缩放 k 让"句干 + 最宽 pill"放进安全宽度
  const SAFE = portrait ? 1680 : 1720;
  const fam = fonts.sans;
  const padW = (kk: number) => 138 * kk; // pill 内边距 + 图标
  const maxPillTextW = (kk: number) => Math.max(...PILLS.map((p) => measureText(p.label, fam, 64 * kk, 700) * 0.985));
  const rowW = (kk: number) => measureText(stem, fam, 96 * kk, 800) * 0.97 + STEM_GAP0 * kk + Math.max(maxPillTextW(kk) + padW(kk), measureText(ending, fam, 96 * kk, 800) * 0.97);
  let k = Math.min(1, SAFE / rowW(1));
  // 竖屏 / 横屏一行放不下（字会缩得太小）→ 两行式：句干独占上行（可两行），pill 在下一行
  const stacked = portrait || k < 0.72;
  let stemLines = [stem];
  if (stacked) {
    const kMax = portrait ? 2.5 : 1.1;
    const pk = SAFE / ((maxPillTextW(1) + padW(1)) || 1);
    const endK = SAFE / (measureText(ending, fam, 96, 800) * 0.97 || 1);
    k = Math.max(0.7, Math.min(kMax, pk, endK));
    // 句干：略缩字号能放进一行就一行；否则两行均衡折行（不留孤字）
    const one = measureText(stem, fam, 96 * k, 800) * 0.97;
    if (one > SAFE && one * 0.78 <= SAFE) k *= SAFE / one;
    else if (one > SAFE) {
      const ws = stem.split(/\s+/).filter(Boolean);
      let best = [stem];
      let bw = Infinity;
      for (let i = 1; i < ws.length; i++) {
        const a = ws.slice(0, i).join(' ');
        const b = ws.slice(i).join(' ');
        const m = Math.max(measureText(a, fam, 96 * k, 800), measureText(b, fam, 96 * k, 800));
        if (m < bw) {
          bw = m;
          best = [a, b];
        }
      }
      stemLines = best;
    }
    const sw = Math.max(...stemLines.map((l) => measureText(l, fam, 96 * k, 800) * 0.97));
    if (sw > SAFE) k *= SAFE / sw;
  }
  const STEM_GAP = STEM_GAP0 * k;
  const WORD_GAP = WORD_GAP0 * k;
  const stemW = Math.max(...stemLines.map((l) => measureText(l, fam, 96 * k, 800) * 0.97));
  const endW = measureText(ending, fam, 96 * k, 800) * 0.97;
  const widest = Math.max(maxPillTextW(k) + padW(k), endW);
  // 左锚点：最宽 pill 时整行居中（列举期间纹丝不动）
  const STEM_LEFT = stacked ? (1920 - Math.max(stemW, widest)) / 2 : (1920 - (stemW + STEM_GAP + widest)) / 2;
  const finalW = stacked ? 0 : stemW + WORD_GAP + endW;

  // 句干入场：ease-out 上浮淡入 + 轻虚化收拢
  const stemT = ramp(frame, 0, INTRO, EASE.out);

  const cycleStart = INTRO;
  const cycleEnd = cycleStart + CYCLES * BEAT;

  // 当前处于第几个 pill 拍
  const rel = frame - cycleStart;
  const idx = Math.max(0, Math.min(Math.floor(rel / BEAT), CYCLES - 1));
  const beatFrame = rel - idx * BEAT;

  // 收束段：pill 上飞消失，结论从下滑入落位（全片唯一一次过冲）
  const isFinale = frame >= cycleEnd;
  const finT = interpolate(frame, [cycleEnd, cycleEnd + FIN], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.back(1.4)),
  });
  // 落位后整行缓缓居中
  const centerT = ramp(frame, cycleEnd + FIN - 2, CENTER, EASE.smooth);
  const shiftX = centerT * ((1920 - finalW) / 2 - STEM_LEFT);

  const stemStyle: React.CSSProperties = {
    fontFamily: PFONT.sans,
    fontWeight: 800,
    fontSize: 96 * k,
    lineHeight: 1.2,
    color: G.ink1,
    letterSpacing: '-0.035em',
    whiteSpace: 'nowrap',
  };

  // 槽内容渲染
  let slot: React.ReactNode = null;
  const endEl = (style: React.CSSProperties) => <span style={{ ...stemStyle, display: 'inline-block', ...style }}>{ending}</span>;
  if (!isFinale && rel >= 0) {
    const incoming = PILLS[idx];
    const outgoing = idx > 0 ? PILLS[idx - 1] : null;

    // 新 pill：从下 +120px 绕滚筒翻入，blur 按速度
    const inT = ramp(beatFrame, 0, SWAP, EASE.snappy);
    const inY = inYAt(beatFrame) * k;
    const inV = Math.abs(inYAt(beatFrame + 0.5) - inYAt(beatFrame - 0.5)) * k;
    const inBlur = Math.min(14, inV * 0.55);

    // 旧 pill：向上 -130px 加速翻出淡掉
    const outT = ramp(beatFrame, 0, SWAP - 1, EASE.exit);
    const outY = outYAt(beatFrame) * k;
    const outV = Math.abs(outYAt(beatFrame + 0.5) - outYAt(beatFrame - 0.5)) * k;
    const outBlur = Math.min(12, outV * 0.45);

    slot = (
      <div style={{ position: 'relative', display: 'inline-block', perspective: 1400 }}>
        <VBlur id="psc-in" std={inBlur} />
        <VBlur id="psc-out" std={outBlur} />
        {/* 撑起槽宽度的隐形占位（当前 pill） */}
        <Pill label={incoming.label} icon={incoming.icon} k={k} style={{ visibility: 'hidden' }} />
        {outgoing && outT < 1 && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              transformOrigin: '50% 100%',
              transform: `translateY(${outY.toFixed(2)}px) rotateX(${(34 * outT).toFixed(2)}deg) scale(${mix(1, 0.94, outT).toFixed(4)})`,
              opacity: 1 - outT,
              filter: outBlur > 0.3 ? 'url(#psc-out)' : undefined,
            }}
          >
            <Pill label={outgoing.label} icon={outgoing.icon} k={k} lift={outT} />
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transformOrigin: '50% 0%',
            transform: `translateY(${inY.toFixed(2)}px) rotateX(${(-38 * (1 - inT)).toFixed(2)}deg) scale(${mix(0.94, 1, inT).toFixed(4)})`,
            opacity: idx === 0 ? inT : Math.min(1, inT * 1.6),
            filter: inBlur > 0.3 ? 'url(#psc-in)' : undefined,
          }}
        >
          <Pill label={incoming.label} icon={incoming.icon} k={k} lift={1 - inT} />
        </div>
      </div>
    );
  } else if (isFinale) {
    // 最后一个 pill 上飞离场（前 7f），然后结论落位
    const lastOutT = ramp(frame, cycleEnd, 7, EASE.exit);
    const fv = Math.abs(
      interpolate(frame + 0.5, [cycleEnd, cycleEnd + FIN], [90, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.4)) }) -
        interpolate(frame - 0.5, [cycleEnd, cycleEnd + FIN], [90, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.back(1.4)) }),
    ) * k;
    const finBlur = Math.min(10, fv * 0.5);
    slot = (
      <div style={{ position: 'relative', display: 'inline-block', perspective: 1400 }}>
        <VBlur id="psc-fin" std={finBlur} />
        <VBlur id="psc-last" std={Math.min(12, lastOutT * 12)} />
        {endEl({
          marginLeft: stacked ? 0 : WORD_GAP - STEM_GAP,
          opacity: Math.min(1, finT * 1.4),
          transform: `translateY(${((1 - finT) * 90 * k).toFixed(2)}px)`,
          filter: finBlur > 0.3 ? 'url(#psc-fin)' : undefined,
        })}
        {lastOutT < 1 && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: -8 * k,
              transformOrigin: '50% 100%',
              transform: `translateY(${(-130 * k * lastOutT).toFixed(2)}px) rotateX(${(34 * lastOutT).toFixed(2)}deg) scale(${mix(1, 0.94, lastOutT).toFixed(4)})`,
              opacity: 1 - lastOutT,
              filter: lastOutT > 0.03 ? 'url(#psc-last)' : undefined,
            }}
          >
            <Pill label={PILLS[CYCLES - 1].label} icon={PILLS[CYCLES - 1].icon} k={k} lift={lastOutT} />
          </div>
        )}
      </div>
    );
  }

  const enter: React.CSSProperties = {
    opacity: stemT,
    filter: stemT < 0.98 ? `blur(${((1 - stemT) * 6).toFixed(2)}px)` : undefined,
  };

  if (stacked) {
    // 竖屏：上行句干（左锚死），下行槽位；收束后各行分别滑到居中
    const lh = 96 * k * 1.2;
    const slotH = Math.max(64 * k * 1.3 + 28 * k, lh);
    const blockH = stemLines.length * lh + 40 * k + slotH;
    const top = SH / 2 - blockH / 2;
    const slotTop = top + stemLines.length * lh + 40 * k;
    const lineShift = (w: number) => centerT * ((1920 - w) / 2 - STEM_LEFT);
    return (
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <Backdrop tone="light" light={{ x: 0.4, y: 0.3 }} accent={L.accent} grain={0.045} vignette={0.14} />
        {stemLines.map((l, i) => (
          <div key={i} style={{ position: 'absolute', left: STEM_LEFT, top: top + i * lh, transform: `translate(${lineShift(measureText(l, fam, 96 * k, 800) * 0.97).toFixed(2)}px, ${((1 - stemT) * 50).toFixed(2)}px)`, ...enter }}>
            <span style={stemStyle}>{l}</span>
          </div>
        ))}
        <div style={{ position: 'absolute', left: STEM_LEFT, top: slotTop + slotH / 2, transform: `translate(${lineShift(endW).toFixed(2)}px, calc(-50% + ${((1 - stemT) * 50).toFixed(2)}px))`, display: 'flex', alignItems: 'center', ...enter }}>
          {slot}
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Backdrop tone="light" light={{ x: 0.4, y: 0.3 }} accent={L.accent} grain={0.045} vignette={0.14} />
      {/* 句干固定不动：整行左端锚死，不随 pill 宽度居中重排（收束落位后才整体居中） */}
      <div
        style={{
          position: 'absolute',
          left: STEM_LEFT,
          top: 540,
          transform: `translate(${shiftX.toFixed(2)}px, calc(-50% + ${((1 - stemT) * 50).toFixed(2)}px))`,
          display: 'flex',
          alignItems: 'center',
          gap: STEM_GAP,
          ...enter,
        }}
      >
        <span style={stemStyle}>{stem}</span>
        {slot}
      </div>
    </AbsoluteFill>
  );
};
