// grain-dissolve — Grain Dissolve → Condense 文字砂化凝聚（motion-lab 定稿转原生 Remotion）
// 干净的整行字 "{ video-shotcraft. Now Live }" 先爆裂成沸腾颗粒噪点（轮廓隐约可辨、白色辉光），
// 同时出现带 45° 斜纹填充和像素方块角柄的选区框；噪点沸腾约半程后选区框消失，
// 噪点云急速凝聚成更大号的颗粒短字标（video-shotcraft 字标，全小写），位移量衰减归零、辉光冲高回落，
// 凝固为清晰发光短字标。四角 HUD 括角/圆点与左右中线短划全程常驻。
// 滤镜链：feTurbulence seed 逐帧 + displacement scale 双向动画，终字同走滤镜再解除。
// 质感升级：SVG 直接按 1920×1080 原生分辨率栅格化（viewBox 640×360，1 单位 = 3px），
// 噪点颗粒细到 2–3px 而不是 4 倍放大的糊团；辉光改在滤镜链内做"紧 + 宽"两层冷白 bloom；
// 外加一团确定性游离砂粒——砂化时被吹散、凝聚时加速吸回字标（越来越快），凝固时熄灭；
// 字标凝聚时从 1.06 收缩到 1（"被压实"），凝聚冲高的那一下给一道只出现一次的横向光痕。
//
// [Agent Edit] o chu: line (ca cau truoc khi vo hat — "{ ... }") / word (chu ngan ngung tu lai; trong -> ten thuong hieu).
// Hai o phai cung noi ve mot doi tuong (the goc). Bo cuc tinh tu be ngang that: cau dai tu xuong 2 dong (khung doc 3),
// chu ngan tu thu nho vua khung; khung chon / goc HUD / hat cat bam theo vung chu that. Khung doc (native): viewBox cao
// theo chieu cao that (1 don vi = 3px), chu to hon. Bo loc / nhip (burst 0.13–0.28, cond 0.60–0.71, lock 0.68–0.90,
// displacement 52, seed floor(t*46)) giu nguyen.
import React, { useId } from 'react';
import { AbsoluteFill } from 'remotion';
import { E, rand, seg, useT } from '../../../fixtures/Motion';
import { Backdrop, FONT } from '../../../fixtures/Polish';
import { measureText, fitSize, useBackdrop, useBrand, useShot, useText, useVideoConfig, wrapLines } from '../../../runtime';

export const GRAIN_DISSOLVE_DURATION = 60; // 2000ms @30fps

// 游离砂粒：随机量（确定性种子）；起点散在整行字的带状区域，终点落进短字标的字面范围 —— 区域在组件内按实际排版换算
const SAND = Array.from({ length: 150 }, (_, i) => {
  const r = (k: number) => rand(i * 13.7 + k * 101.3);
  const ang = r(3) * Math.PI * 2;
  return {
    hu: r(1), // 整行字带内的相对位置 x
    hv: r(2), // y
    dx: Math.cos(ang) * (8 + r(4) * 26), // 砂化时被吹散的位移
    dy: Math.sin(ang) * (5 + r(5) * 14),
    tu: r(6), // 短字标字面内相对位置
    tv: r(7),
    size: 0.35 + r(8) * 0.75,
    alpha: 0.25 + r(9) * 0.6,
    lag: r(10) * 0.05, // 吸回的起跑错峰（非等差）
    ph: r(11) * Math.PI * 2,
  };
});

// 四角像素棋盘手柄（两块 5×5 错位方块）
const Handle: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g transform={`translate(${x - 5},${y - 5})`} fill="#d6d9e0">
    <rect width={5} height={5} />
    <rect x={5} y={5} width={5} height={5} />
  </g>
);

// HUD 括角 + 圆点（sx/sy 控制朝向）
const Corner: React.FC<{ x: number; y: number; sx: number; sy: number }> = ({ x, y, sx, sy }) => (
  <>
    <path
      d={`M${x + 14 * sx} ${y}H${x}V${y + 14 * sy}`}
      fill="none"
      stroke="#474a55"
      strokeWidth={1.1}
      strokeLinecap="square"
    />
    <circle cx={x + 34 * sx} cy={y + 28 * sy} r={1.3} fill="#7d808b" />
  </>
);

export const GrainDissolve: React.FC = () => {
  const t = useT();
  const { height: SH } = useVideoConfig();
  const brand = useBrand();
  const given = useShot()?.texts.word;
  const lineText = useText('line', 'Phiên bản mới chính thức ra mắt hôm nay');
  const wordSample = useText('word', 'Đã ra mắt');
  const word = (typeof given === 'string' && given.trim()) || (brand?.name || '').trim() || wordSample;
  const portrait = SH > 1080 * 1.2;
  const sans = FONT.sans;
  // ── 排版（viewBox 单位，1 单位 = 3px）──
  const VW = 640;
  const VH = SH / 3;
  const CY = VH / 2;
  const maxW = portrait ? 500 : 440;
  const LS0 = portrait ? 44 : 26;
  const lineRows = wrapLines(`{ ${lineText} }`, sans, LS0, maxW, 500, portrait ? 3 : 2);
  const lw = (l: string, sz: number) => measureText(l, sans, sz, 500) + 1.2 * Math.max(0, l.length - 1) * (sz / 26);
  const LS = Math.min(LS0, ...lineRows.map((l) => LS0 * Math.min(1, maxW / lw(l, LS0))));
  const LLH = LS * 1.32;
  const lineBase0 = CY - ((lineRows.length - 1) * LLH) / 2 + LS * 0.42;
  const lineW = Math.max(...lineRows.map((l) => lw(l, LS)));
  const WS0 = portrait ? 80 : 44;
  const WS = fitSize(word, { family: sans, size: WS0, maxWidth: maxW, weight: 750, minSize: WS0 * 0.45, letterSpacingEm: 1.5 / 44 });
  const wordW = measureText(word, sans, WS, 750) + (1.5 * WS / 44) * Math.max(0, word.length - 1);
  const wordBase = CY + WS * 0.41;
  // 选区框：包住整行字（原 384×62）
  const BW = Math.min(VW - 120, Math.max(portrait ? 460 : 384, lineW + 40));
  const BH = Math.max(62, lineRows.length * LLH + 26);
  const BX = 320 - BW / 2;
  const BY = CY - BH / 2;
  const HATCH_XS: number[] = [];
  for (let x = BX - BH; x < BX + BW; x += 34) HATCH_XS.push(x);
  // 四角 HUD：原 (88,96)-(552,264)，内容更大时外扩
  const cx0 = Math.max(26, Math.min(88, BX - 36));
  const cx1 = 640 - cx0;
  const cy0 = Math.min(CY - (portrait ? 190 : 84), BY - 40, wordBase - WS - 30);
  const cy1 = 2 * CY - cy0;
  // 游离砂粒的起止区域
  const hx0 = 320 - lineW / 2;
  const hy0 = lineBase0 - LS * 0.9;
  const hyH = (lineRows.length - 1) * LLH + LS;
  const tx0 = 320 - wordW / 2;
  const ty0 = wordBase - WS * 0.64;
  // 滤镜/clipPath ID 按实例生成，同一 Composition 放多个实例时互不串引
  // （useId 的 «:» 在 CSS url() 里非法，清洗成纯字母数字）
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const fid = `gd-${uid}`;
  const cid = `gd-${uid}-clip`;
  const sid = `gd-${uid}-streak`;
  const burst = seg(t, 0.13, 0.28, E.outCubic); // 干净字 → 砂化
  const cond = seg(t, 0.60, 0.71, E.inOutCubic); // 整行噪点云 → 短字标噪点云
  const lock = seg(t, 0.68, 0.90, E.outCubic); // 位移衰减凝固
  const settle = seg(t, 0.88, 1, E.outCubic); // 辉光回落
  // 白色辉光：砂化期轻微，凝聚时冲高，凝固后回落到柔光
  const glow = Math.max(0, burst * 0.3 + cond * 0.7 - settle * 0.45);
  // 选区框：随 burst 从中线横向展开，0.55–0.64 收拢撤场（早于凝聚完成）
  const boxOut = seg(t, 0.55, 0.64, E.inCubic);
  const boxOpen = burst * (1 - boxOut * 0.35);
  const boxOp = Math.min(1, burst * 1.4) * (1 - boxOut);
  // 字标被压实：凝聚中 1.06 → 1（lock 曲线收敛）
  const markScale = 1 + 0.06 * (1 - lock);
  // 横向光痕：只在凝聚冲高处出现一次（cond 升、lock 后段熄）
  const streak = cond * (1 - seg(t, 0.74, 0.92, E.outCubic));
  const boil = Math.floor(t * 46); // 与 seed 同步的沸腾节拍
  // [Agent Edit] NEN ANH AI: bo nen toi + quang sang (Backdrop fixtures); chu / hat nam tren anh -> bong do nhe
  const bd = useBackdrop();

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : '#0a0b0e' }}>
      {!bd && <Backdrop tone="dark" light={{ x: 0.5, y: 0.47 }} grain={0.07} vignette={0.6} />}
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        width={1920}
        height={SH}
        style={{ position: 'absolute', inset: 0, filter: bd ? 'drop-shadow(0 2px 18px rgba(0,0,0,0.55))' : undefined }}
      >
        <defs>
          <filter id={fid} x="-40%" y="-150%" width="180%" height="400%" colorInterpolationFilters="sRGB">
            <feTurbulence
              type="fractalNoise"
              baseFrequency={0.9 + burst * 0.4}
              numOctaves={2}
              seed={boil}
              result="n"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="n"
              scale={burst * 52 * (1 - lock)}
              xChannelSelector="R"
              yChannelSelector="G"
              result="d"
            />
            <feGaussianBlur in="d" stdDeviation={burst * 1.1 * (1 - lock)} result="core" />
            {/* 两层 bloom：紧光（字边的亮晕）+ 宽光（空气里的散射），偏冷白，强度跟 glow 包络 */}
            <feGaussianBlur in="core" stdDeviation={1.2 + glow * 1.6} result="g1" />
            <feColorMatrix in="g1" type="matrix" result="g1c"
              values={`0 0 0 0 0.86  0 0 0 0 0.9  0 0 0 0 1  0 0 0 ${(0.15 + glow * 0.95).toFixed(3)} 0`} />
            <feGaussianBlur in="core" stdDeviation={5 + glow * 6} result="g2" />
            <feColorMatrix in="g2" type="matrix" result="g2c"
              values={`0 0 0 0 0.62  0 0 0 0 0.68  0 0 0 0 1  0 0 0 ${(glow * 0.75).toFixed(3)} 0`} />
            <feMerge>
              <feMergeNode in="g2c" />
              <feMergeNode in="g1c" />
              <feMergeNode in="core" />
            </feMerge>
          </filter>
          <linearGradient id={sid} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#9fb0ff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#eef1ff" stopOpacity="1" />
            <stop offset="1" stopColor="#9fb0ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* 四角 HUD 括角 + 圆点 + 左右中线短划（全程常驻） */}
        <g>
          <Corner x={cx0} y={cy0} sx={1} sy={1} />
          <Corner x={cx1} y={cy0} sx={-1} sy={1} />
          <Corner x={cx0} y={cy1} sx={1} sy={-1} />
          <Corner x={cx1} y={cy1} sx={-1} sy={-1} />
          <line x1={Math.max(4, cx0 - 36)} y1={CY} x2={cx0 - 12} y2={CY} stroke="#4c4f5a" strokeWidth={1.1} strokeDasharray="4 3" />
          <line x1={cx1 + 12} y1={CY} x2={Math.min(636, cx1 + 36)} y2={CY} stroke="#4c4f5a" strokeWidth={1.1} strokeDasharray="4 3" />
        </g>
        {/* 选区框：砂化时从中线横向展开浮现，凝聚前收拢撤掉 */}
        {boxOp > 0.002 && (
          <g opacity={boxOp} transform={`translate(320 0) scale(${(0.2 + 0.8 * boxOpen).toFixed(4)} 1) translate(-320 0)`}>
            <clipPath id={cid}>
              <rect x={BX} y={BY} width={BW} height={BH} />
            </clipPath>
            <rect x={BX} y={BY} width={BW} height={BH} fill="rgba(140,150,200,0.035)" />
            <g clipPath={`url(#${cid})`}>
              {HATCH_XS.map((x) => (
                <line key={x} x1={x} y1={BY + BH} x2={x + BH} y2={BY} stroke="#2f313a" strokeWidth={0.8} />
              ))}
            </g>
            <rect x={BX} y={BY} width={BW} height={BH} fill="none" stroke="#5d606c" strokeWidth={0.7} vectorEffect="non-scaling-stroke" />
            <Handle x={BX} y={BY} />
            <Handle x={BX + BW} y={BY} />
            <Handle x={BX} y={BY + BH} />
            <Handle x={BX + BW} y={BY + BH} />
          </g>
        )}
        {/* 横向光痕：凝聚冲高时一次，细芯 + 宽晕 */}
        {streak > 0.002 && (
          <g opacity={streak}>
            <ellipse cx={320} cy={CY + 2} rx={Math.max(250, wordW * 0.62)} ry={7} fill={`url(#${sid})`} opacity={0.12} />
            <ellipse cx={320} cy={CY + 2} rx={Math.max(230, wordW * 0.57)} ry={0.7} fill={`url(#${sid})`} opacity={0.7} />
          </g>
        )}
        {/* 游离砂粒：砂化时被吹散、沸腾；凝聚时加速吸回字标；凝固时熄灭 */}
        <g>
          {SAND.map((s, i) => {
            const pull = seg(t, 0.56 + s.lag, 0.71 + s.lag * 0.4, E.inQuart); // 越来越快的吸回
            const jitter = Math.sin(boil * 1.7 + s.ph) * 1.2 * burst * (1 - pull);
            const sx = hx0 + s.hu * lineW + s.dx * burst;
            const sy = hy0 + s.hv * hyH + s.dy * burst + jitter;
            const tx = tx0 + s.tu * wordW;
            const ty = ty0 + s.tv * WS * 0.64;
            const x = sx + (tx - sx) * pull;
            const y = sy + (ty - sy) * pull;
            const a = s.alpha * burst * (1 - seg(t, 0.66, 0.8, E.outCubic)) * (0.55 + 0.45 * Math.abs(Math.sin(boil * 0.9 + s.ph)));
            if (a < 0.01) return null;
            return <circle key={i} cx={x} cy={y} r={s.size * (1 - 0.4 * pull)} fill="#e9ecff" opacity={a} />;
          })}
        </g>
        {/* 文字组：整行字与终字标同走滤镜链（含 bloom） */}
        <g filter={`url(#${fid})`}>
          <g opacity={1 - cond}>
            {lineRows.map((l, i) => (
              <text
                key={i}
                x={320}
                y={lineBase0 + i * LLH}
                textAnchor="middle"
                style={{
                  fill: '#eceef3',
                  font: `500 ${LS.toFixed(2)}px ${sans}`,
                  letterSpacing: `${(1.2 * LS / 26).toFixed(2)}px`,
                }}
              >
                {l}
              </text>
            ))}
          </g>
          <text
            x={320}
            y={wordBase}
            textAnchor="middle"
            opacity={cond}
            transform={`translate(320 ${CY}) scale(${markScale.toFixed(4)}) translate(-320 ${-CY})`}
            style={{
              fill: '#ffffff',
              font: `750 ${WS.toFixed(2)}px ${sans}`,
              letterSpacing: `${(1.5 * WS / 44).toFixed(2)}px`,
            }}
          >
            {word}
          </text>
        </g>
      </svg>
    </AbsoluteFill>
  );
};
