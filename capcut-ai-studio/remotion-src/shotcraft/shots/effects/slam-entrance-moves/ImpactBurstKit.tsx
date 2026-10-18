// 落点冲击套件（impact-burst-kit）——主卡从镜头前砸进页面里的空槽位，落点帧同帧起爆
// 冲击环 + 碎屑迸发 + 震屏；冲击波前沿扫到左右邻卡的那一帧（按半径-距离反解 = 落点后 3f），
// 早已驻场的邻卡被可见地向外推开、再阻尼弹回——"这一下震到了邻居"。
//
// 第二轮重设计（瓷白方案页 · 主推方案砸入）：
// - look = porcelain（冷白 · 钴蓝）。页面是三张 470×600 方案卡：眉题 + 标题，两张白卡开场就在，中间是一个虚线空槽；
//   主推卡是深墨蓝底（全片唯一的暗面 = 视觉重心），112px 大数字、钴蓝 CTA，落定后头顶弹出签。
// - 节奏「悬 — 砸 — 震 — 传 — 落」：0–16f 主卡悬在槽位上方的镜头前（scale 1.55→1.6、上提 20px、景深虚化，
//   槽位里的接触影随高度变实）→ 16–22f 六帧 ease-in 加速砸落 → 22f 落点帧：卡片压扁 3f 再弹簧回正 +
//   钴蓝冲击环（白色压力盘打底，扩散 out-cubic / 消散线性解耦）+ 18 片碎屑 + 8px 震屏 4f →
//   25f 环前沿过邻卡中心：邻卡外推 34px + 旋转 ±3.5°，包络 cos(t/2)·e^(−t/8)，40f 硬钳 0，推开那一下给水平拖影。
// - 落定后 28f 顶部签弹簧弹出，邻卡 ~65f 归位，此后整版真静止（只留极缓推镜）。
//
// 时间表（30fps，共 140f）：
//   0–16    邻卡驻场 ≥15f；主卡悬停蓄力（上提 + 放大 + 虚化），空槽可见
//   16–22   砸落（主动作 6f，ease-in）
//   22–38   落点：压扁回弹、冲击环 16f、碎屑 22f、震屏 4f
//   25–65   邻卡被波及：外推 → 阻尼弹回 → 硬钳归零
//   28–40   顶部签弹出
//   65–140  hold（75f）
//
// [Agent Edit] o chu: kicker / title (dau trang), names (3 ten phuong an: trai / GIUA = phuong an chinh bi dap vao / phai),
// values (3 con so lon), unit (don vi chung, vd "/ tháng"), blurbs (3 cau mo ta ngan, optional), feats (1-3 diem noi bat
// cua the giua), cta (nut the giua), badge (nhan tren the giua). The hai ben: ten / mo ta / so + 3 thanh khung xam trung
// tinh thay danh sach tinh nang (khong bịa noi dung). Chu dai -> thu nho vua be ngang the. Khung doc (native): ca hang the
// phong 1.9 lan quanh the giua (2 the ben lo ra mot phan o 2 mep), tieu de to o tren, ca khoi can giua.
import { useBackdrop, useCurrentFrame, useList, useShotFonts, useText, useVideoConfig, fitSize, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, SpeedBlur, bezier, mix, ramp, softShadow } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, springAt } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const IMPACT_BURST_KIT_DURATION = 140;

const L = LOOKS.porcelain;
const NAVY = '#0e1631';
const CW = 470;
const CH = 600;
const GAP = 44;
const ROW_W = CW * 3 + GAP * 2; // 1498
const IMPACT = 22;
const DROP0 = 16;
// 冲击环半径 100→1100（16f out-cubic）。前沿到邻卡中心距 514px：(514−100)/1000=0.414 → p≈0.163 → 2.6f → 取 +3f
const HIT = IMPACT + 3;
const EASE_IN_CUBIC = bezier(0.55, 0.055, 0.675, 0.19);

const rnd = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// 多行自适应：从 size 往下试，直到按真实宽度折行 ≤ maxLines 且每行不超宽（字距 em 计入）
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
      return { lines, size: Math.max(size * minK * 0.8, fit) };
    }
  }
};

// 碎屑：钴蓝碎片 + 白纸屑，上半球为主
const BITS = Array.from({ length: 18 }, (_, i) => ({
  ang: -Math.PI / 2 + (rnd(i + 1) - 0.5) * Math.PI * 1.75,
  dist: 260 + rnd(i + 40) * 300,
  size: 12 + rnd(i + 80) * 16,
  blue: i % 3 !== 2,
  spin: (rnd(i + 120) - 0.5) * 720,
  ratio: 0.35 + rnd(i + 9) * 0.5,
}));

// 邻卡被推开的阻尼包络：t=0 瞬时到 1，余弦衰减，40f 后钳 0 保证真静止
const pushEnv = (f: number) => {
  const t = f - HIT;
  if (t < 0 || t >= 40) return 0;
  return Math.cos(t * 0.5) * Math.exp(-t / 8);
};

const Check: React.FC<{ c: string }> = ({ c }) => (
  <svg width={30} height={30} viewBox="0 0 30 30" style={{ flex: 'none' }}>
    <circle cx={15} cy={15} r={14} fill={alpha(c, 0.14)} />
    <path d="M9 15.5 L13.2 19.5 L21 11" fill="none" stroke={c} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

type Plan = { name: string; price: string; unit: string; blurb: string; feats: string[]; cta: string; hero?: boolean };
const INNER = CW - 88; // 卡内文字宽

const PlanCard: React.FC<{ p: Plan; sans: string }> = ({ p, sans }) => {
  const dark = !!p.hero;
  const ink = dark ? '#f2f5ff' : L.ink;
  const ink2 = dark ? '#a9b4d0' : L.ink2;
  const acc = dark ? '#7d9bff' : L.accent;
  const nameS = fitSize(p.name, { family: sans, size: 34, maxWidth: INNER, weight: 700, letterSpacingEm: -0.02, minSize: 20 });
  const blurbS = p.blurb ? fitSize(p.blurb, { family: sans, size: 26, maxWidth: INNER, weight: 500, minSize: 16 }) : 0;
  const pS0 = dark ? 112 : 100;
  const unitW = p.unit ? measureText(p.unit, sans, 26, 500) + 12 : 0;
  const priceS = fitSize(p.price, { family: sans, size: pS0, maxWidth: Math.max(160, INNER - unitW), weight: 820, letterSpacingEm: -0.055, minSize: 44 });
  const unitS = p.unit ? fitSize(p.unit, { family: sans, size: 26, maxWidth: Math.max(80, INNER - measureText(p.price, sans, priceS, 820) * 0.95 - 12), weight: 500, minSize: 14 }) : 0;
  const ctaS = p.cta ? fitSize(p.cta, { family: sans, size: 28, maxWidth: INNER - 40, weight: 680, minSize: 16 }) : 0;
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '44px 44px 40px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', fontFamily: sans, color: ink }}>
      <div style={{ font: `700 ${nameS}px ${sans}`, letterSpacing: '-0.02em', whiteSpace: 'nowrap', lineHeight: 1.25 }}>{p.name}</div>
      {p.blurb ? <div style={{ marginTop: 4, font: `500 ${blurbS}px ${sans}`, color: ink2, whiteSpace: 'nowrap', lineHeight: 1.3 }}>{p.blurb}</div> : null}
      <div style={{ marginTop: 28, display: 'flex', alignItems: 'baseline', gap: 12, whiteSpace: 'nowrap' }}>
        <span style={{ font: `820 ${priceS}px ${sans}`, letterSpacing: '-0.055em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{p.price}</span>
        {p.unit ? <span style={{ font: `500 ${unitS}px ${sans}`, color: ink2 }}>{p.unit}</span> : null}
      </div>
      <div style={{ marginTop: dark ? 24 : 32, height: 1, background: dark ? 'rgba(160,190,255,0.16)' : L.line }} />
      <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {p.feats.length
          ? p.feats.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, font: `550 ${fitSize(f, { family: sans, size: 30, maxWidth: INNER - 46, weight: 550, minSize: 18 })}px ${sans}`, letterSpacing: '-0.012em', whiteSpace: 'nowrap', lineHeight: 1.25 }}>
              <Check c={acc} />
              {f}
            </div>
          ))
          : [0.78, 0.62, 0.7].map((w, i) => (
            // 邻卡：中性占位条（不编造内容）
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, height: 37 }}>
              <Check c={alpha(L.ink, 0.35)} />
              <div style={{ height: 14, width: `${w * 100}%`, borderRadius: 7, background: alpha(L.ink, 0.08) }} />
            </div>
          ))}
      </div>
      {p.cta ? (
        <div style={{
          marginTop: 'auto', height: 72, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `680 ${ctaS}px ${sans}`, letterSpacing: '-0.01em', whiteSpace: 'nowrap',
          background: dark ? `linear-gradient(180deg, #5b7dff, ${L.accent})` : 'transparent', color: dark ? '#ffffff' : ink,
          border: dark ? 'none' : `2px solid ${alpha(L.ink, 0.14)}`,
          boxShadow: dark ? `0 14px 30px -12px ${alpha(L.accent, 0.9)}, inset 0 1px 0 rgba(255,255,255,0.3)` : 'none',
        }}>
          {p.cta}
        </div>
      ) : null}
    </div>
  );
};

export const ImpactBurstKit: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const sans = fonts.sans;
  const mono = fonts.mono;
  const portrait = SH > 1080 * 1.2;
  const bd = !!useBackdrop(); // nen anh AI: Stage tu bo gradient; chu tren nen them bong sang
  const kicker = useText('kicker', 'BẢNG GIÁ');
  const title = useText('title', 'Chọn gói phù hợp với bạn.');
  const names = useList('names', ['Cơ bản', 'Chuyên nghiệp', 'Doanh nghiệp']);
  const values = useList('values', ['99K', '299K', '999K']);
  const unit = useText('unit', '/ tháng');
  const blurbs = useList('blurbs', ['Cho người mới bắt đầu.', 'Lựa chọn của đa số.', 'Cho đội nhóm lớn.']);
  const feats = useList('feats', ['Không giới hạn video', 'Phụ đề tự động', 'Hỗ trợ 24/7']).slice(0, 3);
  const cta = useText('cta', 'Chọn gói này');
  const badgeText = useText('badge', 'PHỔ BIẾN NHẤT');
  const at = (arr: string[], i: number) => (arr[i] ?? '').trim();
  const plans: Plan[] = [0, 1, 2].map((i) => ({
    name: at(names, i), price: at(values, i), unit, blurb: at(blurbs, i),
    feats: i === 1 ? feats : [], cta: i === 1 ? cta : 'Xem chi tiết', hero: i === 1,
  }));

  // ── 布局：卡片行 1498×600（竖屏整体 ×K 绕中卡），页眉标题在上；整组垂直居中（横屏保持原版 Y=300）──
  const K = portrait ? 1.9 : 1;
  const kSize = kicker ? fitSize(kicker, { family: mono, size: portrait ? 46 : 24, maxWidth: portrait ? 1400 : 1100, weight: 700, letterSpacingEm: 0.06, minSize: 14 }) : 0;
  const tS0 = portrait ? 150 : 76;
  const tt = fitWrap(title, sans, tS0, portrait ? 1640 : ROW_W, 780, portrait ? 3 : 2, -0.045, 0.5);
  const headH = (kicker || BRAND.name ? kSize * 1.5 + (portrait ? 26 : 14) : 0) + tt.lines.length * tt.size * 1.12;
  const headGap = portrait ? 190 : 0;
  const blockH = headH + headGap + CH * K;
  const Y = portrait ? Math.round((SH - blockH) / 2 + headH + headGap + (CH * K - CH) / 2) : Math.max(300, 104 + headH + 40);
  const headTop = portrait ? Math.round((SH - blockH) / 2) : 104;
  const X0 = (1920 - ROW_W) / 2;
  const CX = 960;
  const CY = Y + CH / 2;

  // ── 主卡：0–16 悬停蓄力 → 16–22 加速砸落 → 22 起压扁回弹
  const wind = ramp(frame, 0, DROP0, EASE.smooth);
  const drop = ramp(frame, DROP0, IMPACT - DROP0, EASE_IN_CUBIC);
  const hoverScale = 1.55 + 0.05 * wind;
  const hoverDy = -110 - 20 * wind;
  const mScale = mix(hoverScale, 1, drop);
  const mDy = mix(hoverDy, 0, drop);
  const lift = Math.min(1, Math.max(0, (mScale - 1) / 0.6));
  const dof = lift * 7;
  const squash = frame < IMPACT ? 0 : frame < IMPACT + 3 ? ramp(frame, IMPACT, 3, EASE.out) : 1 - springAt(frame, IMPACT + 3, { damping: 12, stiffness: 320 });
  const sx = mScale * (1 + 0.06 * squash);
  const sy = mScale * (1 - 0.085 * squash);
  const mOp = ramp(frame, 0, 5, EASE.out);

  // ── 冲击环 + 压力盘
  const ringP = ramp(frame, IMPACT, 16, EASE.snappy);
  const ringLin = ramp(frame, IMPACT, 16, EASE.linear);
  const ringOn = frame >= IMPACT && frame < IMPACT + 16;
  const ringR = mix(100, 1100, ringP);
  const ringOp = mix(0.95, 0, ringLin);
  const ringW = mix(10, 1.5, ringP);

  // ── 碎屑 22f
  const pT = ramp(frame, IMPACT, 22, EASE.out);
  const pLin = ramp(frame, IMPACT, 22, EASE.linear);
  const pOn = frame >= IMPACT && frame < IMPACT + 22;

  // ── 邻卡波及
  const env = pushEnv(frame);
  const pushX = 34 * env;
  const pushRot = 3.5 * env;
  const pushV = 34 * K * (pushEnv(frame + 0.5) - pushEnv(frame - 0.5));

  // ── 震屏 4f，8px 衰减
  let shakeX = 0;
  let shakeY = 0;
  if (frame >= IMPACT && frame < IMPACT + 4) {
    const amp = 8 * K * (1 - (frame - IMPACT) / 4);
    shakeX = (rnd(frame * 3.7) - 0.5) * 2 * amp;
    shakeY = (frame === IMPACT ? 1 : (rnd(frame * 7.1 + 13) - 0.5) * 2) * amp;
  }

  const badge = frame < IMPACT + 6 ? 0 : springAt(frame, IMPACT + 6, { damping: 13, stiffness: 240 });
  const badgeS = badgeText ? fitSize(badgeText, { family: mono, size: 22, maxWidth: CW - 60, weight: 800, letterSpacingEm: 0.12, minSize: 13 }) : 0;
  const push = 1 + 0.02 * ramp(frame, IMPACT, 118, EASE.swift);
  const neighborShadow = `${softShadow(6 + Math.abs(env) * 26, { color: L.shadow })}, inset 0 0 0 1px ${alpha(L.ink, 0.07)}, inset 0 1px 0 #ffffff`;

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Stage look={L} keyLight={{ x: 0.5, y: portrait ? 0.3 : 0.12 }} fill={{ x: 0.5, y: 1.0 }} />
      <div style={{ position: 'absolute', inset: 0, transform: `translate(${shakeX.toFixed(2)}px, ${shakeY.toFixed(2)}px) scale(${push.toFixed(5)})`, transformOrigin: `50% ${CY}px` }}>
        {/* 页眉：本来就在（竖屏居中） */}
        <div style={{ position: 'absolute', left: portrait ? 140 : X0, right: portrait ? 140 : undefined, top: headTop, fontFamily: sans, color: L.ink, textAlign: portrait ? 'center' : 'left', textShadow: bd ? '0 1px 12px rgba(255,255,255,0.7)' : undefined }}>
          {kicker || BRAND.name ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: portrait ? 'center' : 'flex-start', gap: kSize * 0.6, font: `700 ${kSize}px ${mono}`, letterSpacing: '0.06em', color: L.accent, lineHeight: 1.5, whiteSpace: 'nowrap' }}>
              {BRAND.name ? <ShotcraftMark size={kSize * 1.42} tone="light" /> : null}
              {BRAND.name ? <span style={{ color: L.ink }}>{BRAND.name}</span> : null}
              {kicker ? <span>{BRAND.name ? '· ' : ''}{kicker}</span> : null}
            </div>
          ) : null}
          <div style={{ marginTop: kicker || BRAND.name ? (portrait ? 26 : 14) : 0, font: `780 ${tt.size.toFixed(1)}px ${sans}`, letterSpacing: '-0.045em', lineHeight: 1.12, whiteSpace: 'nowrap' }}>
            {tt.lines.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>

        {/* 卡片行：竖屏绕中卡整体 ×K（冲击环 / 碎屑同坐标系一起放大） */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: SH, transform: K !== 1 ? `scale(${K})` : undefined, transformOrigin: `${CX}px ${CY}px` }}>
          {/* 中间空槽：虚线槽位 + 随下落变实的接触影 */}
          <div style={{ position: 'absolute', left: X0 + CW + GAP, top: Y, width: CW, height: CH, borderRadius: 30, border: `2px dashed ${alpha(L.accent, 0.3)}`, background: alpha(L.accent, 0.035), opacity: 1 - ramp(frame, IMPACT, 3, EASE.out) }} />
          <div style={{
            position: 'absolute', left: X0 + CW + GAP - 30, top: Y + CH - 60, width: CW + 60, height: 120, borderRadius: '50%',
            background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha(L.shadow, 0.22)} 0%, ${alpha(L.shadow, 0)} 70%)`,
            opacity: frame < IMPACT ? mix(0.25, 1, drop) : 1 - ramp(frame, IMPACT, 4, EASE.out), transform: `scale(${mix(1.5, 1, drop).toFixed(3)})`,
          }} />

          {/* 左右邻卡：被冲击波推开再弹回 */}
          {[0, 2].map((k) => {
            const dir = k === 0 ? -1 : 1;
            return (
              <SpeedBlur key={k} vx={dir * pushV} amount={0.22} max={8}>
                <div style={{
                  position: 'absolute', left: X0 + k * (CW + GAP), top: Y, width: CW, height: CH, borderRadius: 30, background: '#ffffff', boxShadow: neighborShadow,
                  transform: `translateX(${(dir * pushX).toFixed(2)}px) rotate(${(dir * pushRot).toFixed(3)}deg)`, transformOrigin: `50% 100%`,
                }}>
                  <PlanCard p={plans[k]} sans={sans} />
                </div>
              </SpeedBlur>
            );
          })}

          {/* 压力盘：落点一瞬的白色气浪（打底，让钴蓝环在亮底上读得出来） */}
          {ringOn && (
            <div style={{
              position: 'absolute', left: CX - ringR * 0.9, top: CY - ringR * 0.9, width: ringR * 1.8, height: ringR * 1.8, borderRadius: '50%',
              background: `radial-gradient(circle, ${alpha('#ffffff', 0)} 40%, ${alpha('#ffffff', 0.55 * (1 - ringLin))} 68%, ${alpha('#ffffff', 0)} 72%)`,
            }} />
          )}

          {/* 主卡 */}
          <div style={{
            position: 'absolute', left: X0 + CW + GAP, top: Y + mDy, width: CW, height: CH, borderRadius: 30, opacity: mOp,
            background: `linear-gradient(170deg, #1a2550 0%, ${NAVY} 55%, #0a1026 100%)`,
            boxShadow: `0 ${(18 + lift * 60).toFixed(1)}px ${(50 + lift * 90).toFixed(1)}px -18px ${alpha('#0c1a3a', 0.55 - lift * 0.15)}, 0 0 0 1px ${alpha('#9db4ff', 0.18)}, inset 0 1px 0 ${alpha('#ffffff', 0.14)}`,
            transform: `scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`, transformOrigin: '50% 100%',
            filter: dof > 0.4 ? `blur(${dof.toFixed(2)}px)` : undefined,
          }}>
            {/* 顶部钴蓝辉光 */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: 30, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: -80, right: -80, top: -260, height: 420, background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha(L.accent, 0.45)} 0%, ${alpha(L.accent, 0)} 70%)` }} />
            </div>
            <PlanCard p={plans[1]} sans={sans} />
            {/* 顶部签：落定后弹出，骑在卡顶缘 */}
            {badgeText ? (
              <div style={{ position: 'absolute', left: 0, right: 0, top: -24, display: 'flex', justifyContent: 'center' }}>
                <div style={{
                  height: 48, padding: '0 22px', borderRadius: 24, background: L.accent, color: '#ffffff', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap',
                  font: `800 ${badgeS}px ${mono}`, letterSpacing: '0.12em', transform: `scale(${badge.toFixed(4)})`, opacity: Math.min(1, badge * 2),
                  boxShadow: `0 10px 24px -8px ${alpha(L.accent, 0.8)}, inset 0 1px 0 rgba(255,255,255,0.35)`,
                }}>
                  {badgeText}
                </div>
              </div>
            ) : null}
          </div>

          {/* 碎屑（卡上方）：沿飞行方向按速度拉长 */}
          {pOn && BITS.map((b, i) => {
            const sp = Math.pow(1 - pT, 2 / 3);
            const px = CX + Math.cos(b.ang) * (140 + b.dist * pT);
            const py = CY - 40 + Math.sin(b.ang) * (140 + b.dist * pT) * 0.85 + 120 * pLin * pLin;
            const s = b.size * (1 - 0.6 * pLin);
            const stretch = 1 + Math.min(1.6, sp * 1.6);
            return (
              <div key={i} style={{ position: 'absolute', left: px - s / 2, top: py - (s * b.ratio) / 2, width: s, height: s * b.ratio, transform: `rotate(${((b.ang * 180) / Math.PI).toFixed(1)}deg) scaleX(${stretch.toFixed(3)})`, opacity: pLin < 0.65 ? 1 : 1 - (pLin - 0.65) / 0.35 }}>
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: 2,
                  background: b.blue ? L.accent : '#ffffff', boxShadow: b.blue ? `0 0 8px ${alpha(L.accent, 0.45)}` : `0 0 0 1px ${alpha(L.ink, 0.1)}, 0 3px 8px ${alpha(L.shadow, 0.25)}`,
                  transform: `rotate(${(b.spin * pT).toFixed(1)}deg)`,
                }} />
              </div>
            );
          })}

          {/* 冲击环：钴蓝细环 + 柔辉，越扩越细 */}
          {ringOn && (
            <div style={{
              position: 'absolute', left: CX - ringR, top: CY - ringR, width: ringR * 2, height: ringR * 2, borderRadius: '50%', boxSizing: 'border-box', opacity: ringOp,
              border: `${ringW.toFixed(2)}px solid ${alpha(L.accent, 0.9)}`,
              boxShadow: `0 0 ${(18 + ringP * 30).toFixed(0)}px ${alpha(L.accent, 0.35)}, inset 0 0 ${(18 + ringP * 30).toFixed(0)}px ${alpha(L.accent, 0.2)}`,
            }} />
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
