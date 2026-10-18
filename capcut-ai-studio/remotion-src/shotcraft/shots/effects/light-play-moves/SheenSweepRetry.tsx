// sheen-sweep-retry —— 单点扫光（高标准重试）：深墨主角卡上一道斜向高光带缓扫一次，被圆角裁住，无声的加冕。
//
// 第二轮重设计（暖沙展台 · 钛黑会员卡发布）：
// - look = sand（米色 · 赤陶）。主角从"灰底上的 PRO 小卡"换成一张 900×567 的钛黑金属卡（video-shotcraft 导演卡），
//   卡面是拉丝钛（横向发丝纹）+ 激光蚀刻的单色「镜刻」标志与 video-shotcraft 字标 / 持卡人 / 非接图标 + 香槟金芯片，
//   带 8 层叠出的金属厚边。卡在右侧 3D 斜放（rotateY 朝向左侧文字栏、rotateX 微仰），左栏是编辑式标题
//   「Cinematic, / by default.」。
// - 扫光有物理动机：卡缓缓"转向光源"（rotateY 21°→14°）的同一时段，高光带掠过卡面——不是贴上去的特效，
//   而是转角带来的反射。四约束照旧：单点（只扫主角卡）、圆角裁剪、只扫一次、扫前扫后无光效层。
// - 光带三层：宽柔光（0.14）+ 窄亮芯（0.5）screen 叠在钛黑上；光带经过处，拉丝纹与蚀刻字被"照出来"
//   （固定在卡面上的亮版副本，用随光带移动的同一条 115° 遮罩揭开），卡的上沿发丝线同步亮一下。
// - 空间：Stage 左上主光 + 沙色地面；卡下两层软投影（接触影 + 远影）随入场高度收紧，不在 3D 层里。
//
// 时间表（30fps，共 150f）：
//   0–36    卡入场：从下方 120px 处升起 + 转到 21°（弹簧 damping 24，慢、重、无回弹的奢侈感）；投影晚 4f 收紧
//   6–44    左栏：眉题字距收拢 → 标题两行从线下升起（间隔 7f）→ 正文淡入上浮
//   44–58   hold：卡静置，观众先看清卡面
//   58–90   主动作：卡转向光源（smooth in-out，到 96f）+ 高光带扫过一次（32f，swift）
//   92–108  余波：CTA 胶囊升起
//   108–150 hold：卡极缓漂移（rotateY 再转 1°，ease-out 收住），尾段干净海报
//
// [Agent Edit] o chu: kicker / title / body / cta (cot chu) + card_name / card_label / card_holder / card_tier (chu khac tren
// the). Chu dai: tieu de tu xuong dong (<= 3 dong) + thu nho theo be ngang cot; chu tren the tu thu vua cho. Chu "len tu
// duoi vach" tu viet lai (TextReveal cua fixtures chi chua 0.06em phia tren -> cat dau tieng Viet): khung che co dem tren
// 0.32em / duoi 0.26em. Font mono cua ten chu the -> font sans (du dau). Khung doc (portrait.mode = 'native'): the phong
// to 1.45x dat giua nua tren, cot chu xep ben duoi can trai; khoi tong can giua theo chieu doc.
import { useBackdrop, useBrand, useCurrentFrame, useShotFonts, useText, useVideoConfig, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, FONT, mix, ramp } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha, springAt, type } from '../../../fixtures/Look';
import { ShotcraftMark } from '../../../fixtures/Brand';

export const SHEEN_SWEEP_RETRY_DURATION = 150;

const L = LOOKS.sand;

const W = 900;
const H = 567; // ISO 卡比例 1.586
const R = 38;

const SWEEP_START = 58;
const SWEEP_END = 90;
const TURN_END = 96;

const ENGRAVE = '#57534d'; // 蚀刻：比钛黑底亮两档的暖灰（静置时也读得出字标）
const LIT = '#efe6d8'; // 光带下的蚀刻反光：暖白

// 拉丝钛：横向发丝纹（两组不同周期叠出不规则感）
const BRUSH =
  'repeating-linear-gradient(180deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 3px),' +
  'repeating-linear-gradient(180deg, rgba(0,0,0,0.25) 0px, rgba(0,0,0,0.25) 1px, transparent 1px, transparent 7px)';

// 蚀刻标志：激光雕刻按规范用单色版（取景框与斜切同色），标志本身不加发光 / 投影
const Mark: React.FC<{ color: string; size?: number }> = ({ color, size = 66 }) => (
  <ShotcraftMark size={size} frameColor={color} cutColor={color} />
);

const Contactless: React.FC<{ color: string }> = ({ color }) => (
  <svg width={46} height={46} viewBox="0 0 24 24" style={{ display: 'block' }}>
    {[4.5, 8, 11.5].map((r, i) => (
      <path key={i} d={`M${6 + i * 3.2} ${12 - r * 0.7}a${r} ${r} 0 0 1 0 ${r * 1.4}`} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    ))}
  </svg>
);

type FaceText = { name: string; label: string; holder: string; tier: string; family: string };

// 卡面内容（蚀刻层）：tone = 字色；lit = 光带下的亮版（只换颜色与阴影）
const Face: React.FC<{ tone: string; lit?: boolean; t: FaceText }> = ({ tone, lit, t }) => {
  // 蚀刻感：下沿 1px 亮、上沿 1px 暗（刻进去的槽）；亮版换成发光
  const etch = lit ? `0 0 14px ${alpha(LIT, 0.5)}` : '0 1px 0 rgba(255,255,255,0.10), 0 -1px 0 rgba(0,0,0,0.6)';
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '52px 60px 50px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', color: tone }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Mark color={tone} />
        <div style={{ ...type(fitSize(t.name, { family: t.family, size: 42, maxWidth: 560, weight: 620, minSize: 24 }), 620), letterSpacing: '0.01em', lineHeight: 1.3, whiteSpace: 'nowrap', textShadow: etch }}>{t.name}</div>
        <div style={{ marginLeft: 'auto', filter: lit ? `drop-shadow(0 0 8px ${alpha(LIT, 0.5)})` : undefined }}>
          <Contactless color={tone} />
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <div>
          <div style={{ ...type(fitSize(t.label.toLocaleUpperCase('vi'), { family: t.family, size: 22, maxWidth: 480, weight: 600, minSize: 14, letterSpacingEm: 0.3 }), 600), letterSpacing: '0.3em', opacity: 0.8, lineHeight: 1.4, whiteSpace: 'nowrap', textShadow: etch }}>{t.label.toLocaleUpperCase('vi')}</div>
          <div style={{ ...type(fitSize(t.holder, { family: t.family, size: 36, maxWidth: 460, weight: 500, minSize: 20, letterSpacingEm: 0.16 }), 500), letterSpacing: '0.16em', marginTop: 8, lineHeight: 1.4, whiteSpace: 'nowrap', textShadow: etch }}>{t.holder}</div>
        </div>
        <div style={{ marginLeft: 'auto', ...type(fitSize(t.tier.toLocaleUpperCase('vi'), { family: t.family, size: 30, maxWidth: 240, weight: 700, minSize: 16, letterSpacingEm: 0.34 }), 700), letterSpacing: '0.34em', lineHeight: 1.4, whiteSpace: 'nowrap', textShadow: etch }}>{t.tier.toLocaleUpperCase('vi')}</div>
      </div>
    </div>
  );
};

// 香槟金芯片：拉丝金属 + 触点分割线
const Chip: React.FC = () => (
  <div
    style={{
      position: 'absolute', left: 60, top: 212, width: 116, height: 88, borderRadius: 16, overflow: 'hidden',
      background: 'linear-gradient(135deg, #e9d3a6 0%, #b8955c 42%, #8c6a39 70%, #d9bd86 100%)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 0 rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.5)',
    }}
  >
    <svg width={116} height={88} viewBox="0 0 116 88" style={{ position: 'absolute', inset: 0 }}>
      <g stroke="rgba(70,48,18,0.55)" strokeWidth={1.4} fill="none">
        <path d="M0 30H38M0 58H38M78 30H116M78 58H116M38 0V88M78 0V88" />
        <rect x={38} y={22} width={40} height={44} rx={9} />
      </g>
    </svg>
  </div>
);

// 标题逐行「从线下升起」：遮罩框上 0.32em / 下 0.26em 留白（越南语叠加声调不被裁）
const RiseLines: React.FC<{ lines: string[]; start: number; each: number; gap: number; style: React.CSSProperties }> = ({ lines, start, each, gap, style }) => {
  const frame = useCurrentFrame();
  return (
    <div style={style}>
      {lines.map((l, i) => {
        const p = ramp(frame, start + i * gap, each, EASE.snappy);
        return (
          <div key={i} style={{ overflow: 'hidden', padding: '0.32em 0.04em 0.26em', margin: '-0.32em -0.04em -0.26em' }}>
            <div style={{ transform: `translateY(calc(${((1 - p) * 105).toFixed(2)}% + ${((1 - p) * 0.6).toFixed(3)}em))`, whiteSpace: 'pre' }}>{l}</div>
          </div>
        );
      })}
    </div>
  );
};

export const SheenSweepRetry: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const brand = useBrand();
  const portrait = SH > 1080 * 1.2;
  const kickerText = useText('kicker', brand?.name || 'Ra mắt gói mới').trim();
  const titleText = useText('title', 'Đặc quyền, theo cách riêng.').replace(/\s+/g, ' ').trim();
  const bodyText = useText('body', 'Thẻ hội viên kim loại, ưu đãi trọn đời cho một trăm người đầu tiên.').trim();
  const ctaText = useText('cta', 'Đăng ký ngay').trim();
  const face: FaceText = {
    name: useText('card_name', brand?.name || 'Hội viên Vàng').trim(),
    label: useText('card_label', 'Thành viên').trim(),
    holder: useText('card_holder', 'NGUYỄN MINH ANH').trim(),
    tier: useText('card_tier', 'VIP').trim(),
    family: fonts.sans,
  };

  // —— 版式：landscape 卡在右、左栏文字（640 宽）；portrait 卡在上（放大 1.45）、文字在下 ——
  const COLW = portrait ? 1600 : 640;
  const TS0 = portrait ? 150 : 118;
  let TS = TS0;
  let tLines: string[] = [titleText];
  for (let k = 0; k < 40; k++) {
    tLines = wrapLines(titleText, fonts.sans, TS, COLW, 760, 99);
    if (tLines.length <= 3 || TS <= TS0 * 0.55) break;
    TS -= 4;
  }
  tLines = wrapLines(titleText, fonts.sans, TS, COLW, 760, 3);
  TS = Math.min(TS, ...tLines.map((l) => fitSize(l, { family: fonts.sans, size: TS, maxWidth: COLW, weight: 760, minSize: TS0 * 0.45 })));
  const BS = portrait ? 60 : 34;
  const bLines = bodyText ? wrapLines(bodyText, fonts.sans, BS, COLW, 450, portrait ? 3 : 3) : [];
  const KS = portrait ? 42 : 24;
  const CS = portrait ? 54 : 30;
  const tLH = TS * 1.12;
  const colH = KS * 1.4 + 34 + tLines.length * tLH + (bLines.length ? 40 + bLines.length * BS * 1.38 : 0) + (ctaText ? 48 + CS * 1.3 + 36 : 0);
  const CARD_K = portrait ? 1.45 : 1;
  const cardH = H * CARD_K;
  const CX = portrait ? 960 : 1262; // 卡心
  const gapPC = 230;
  const totalP = cardH + gapPC + colH;
  const CY = portrait ? Math.round(SH / 2 - totalP / 2 + cardH / 2) : 520;
  const colLeft = portrait ? 160 : 150;
  const colTop = portrait ? CY + cardH / 2 + gapPC : Math.max(90, Math.round(520 - colH / 2 + 10));

  // —— 卡入场：慢弹簧，无回弹 ——
  const enter = springAt(frame, 0, { damping: 24, stiffness: 70, mass: 1.1 });
  const shadowIn = springAt(frame, 4, { damping: 24, stiffness: 70, mass: 1.1 }); // 投影晚 4f
  // —— 转向光源：与扫光同段 ——
  const turn = ramp(frame, SWEEP_START - 4, TURN_END - SWEEP_START + 4, EASE.smooth);
  const drift = ramp(frame, TURN_END, 150 - TURN_END, EASE.out);
  const rotY = mix(36, 21, enter) - 7 * turn - 1.5 * drift;
  const rotX = mix(16, 9, enter) - 1.5 * turn;
  const lift = mix(120, 0, enter) - 6 * drift;
  const scale = mix(0.94, 1, enter);
  const appear = ramp(frame, 0, 8, EASE.out);

  // —— 扫光：只一次，条件挂载 ——
  const sweepOn = frame >= SWEEP_START && frame <= SWEEP_END;
  const p = ramp(frame, SWEEP_START, SWEEP_END - SWEEP_START, EASE.swift);
  // 光带中心从卡左外 0.45W 走到卡右外 0.45W；遮罩/光带宽 2W，中心在其 50% 处
  const bandC = mix(-0.45 * W, 1.45 * W, p);
  const bandX = bandC - W;
  const bandMask = `linear-gradient(115deg, transparent 38%, #000 50%, transparent 62%)`;
  const topX = bandC + ((H / 2) * Math.cos((65 * Math.PI) / 180)) / Math.sin((115 * Math.PI) / 180);

  const cta = ramp(frame, 92, 16, EASE.snappy);
  // [Agent Edit] nen anh AI: Stage tu trong suot, bo mat ban toi phia duoi; chu dat thang tren nen co bong sang
  const bd = useBackdrop();
  const TSH = bd ? '0 1px 12px rgba(255,255,255,0.7)' : undefined;

  return (
    <AbsoluteFill style={{ overflow: 'hidden', fontFamily: FONT.sans }}>
      <Stage look={L} keyLight={{ x: 0.3, y: 0.08 }} fill={{ x: 0.9, y: 0.95 }} horizon={0.86} intensity={1} />
      {/* 展台地面：下 1/4 微微压暗的桌面 + 远处一条柔和的桌沿（portrait 按真实高度铺） */}
      {!bd && <div style={{ position: 'absolute', left: 0, right: 0, top: portrait ? Math.round(SH * 0.8) : 820, bottom: 0, background: `linear-gradient(180deg, ${alpha(L.shadow, 0)} 0%, ${alpha(L.shadow, 0.08)} 100%)` }} />}

      {/* 卡下投影：接触影（小而实）+ 远影（大而虚），随入场高度收紧 */}
      <div
        style={{
          position: 'absolute', left: CX - W * 0.42 + 40, top: CY + H * 0.44 + mix(60, 0, shadowIn), width: W * 0.84, height: 70,
          borderRadius: '50%', background: alpha(L.shadow, mix(0.08, 0.34, shadowIn)), filter: 'blur(26px)', opacity: appear,
          transform: CARD_K !== 1 ? `scale(${CARD_K})` : undefined, transformOrigin: `${W * 0.42 - 40}px ${-H * 0.44}px`,
        }}
      />
      <div
        style={{
          position: 'absolute', left: CX - W * 0.5 + 90, top: CY + H * 0.3, width: W, height: 220,
          borderRadius: '50%', background: alpha(L.shadow, mix(0.05, 0.2, shadowIn)), filter: 'blur(70px)', opacity: appear,
          transform: CARD_K !== 1 ? `scale(${CARD_K})` : undefined, transformOrigin: `${W * 0.5 - 90}px ${-H * 0.3}px`,
        }}
      />

      {/* 主角卡：3D 斜放 */}
      <div style={{ position: 'absolute', inset: 0, perspective: 2400, perspectiveOrigin: `${CX}px ${CY - 120}px`, transform: CARD_K !== 1 ? `scale(${CARD_K})` : undefined, transformOrigin: `${CX}px ${CY}px` }}>
        <div
          style={{
            position: 'absolute', left: CX - W / 2, top: CY - H / 2, width: W, height: H, opacity: appear,
            transformStyle: 'preserve-3d',
            transform: `translateY(${lift.toFixed(2)}px) rotateX(${rotX.toFixed(3)}deg) rotateY(${rotY.toFixed(3)}deg) scale(${scale.toFixed(4)})`,
          }}
        >
          {/* 金属厚边：8 层叠出约 6px 厚度，越往后越暗 */}
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute', inset: 0, borderRadius: R,
                transform: `translateZ(${(-(i + 1) * 0.8).toFixed(1)}px)`,
                background: i < 2 ? '#8d877e' : mix(0, 1, i / 7) > 0.5 ? '#2a2826' : '#5c5852',
              }}
            />
          ))}
          {/* 正面 */}
          <div
            style={{
              position: 'absolute', inset: 0, borderRadius: R, overflow: 'hidden', // 圆角裁剪：一切光都被卡边裁住
              background: 'linear-gradient(140deg, #2d2b29 0%, #1b1a19 42%, #121110 72%, #1d1c1a 100%)',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 1.5px 0 rgba(255,255,255,0.16)',
            }}
          >
            <div style={{ position: 'absolute', inset: 0, backgroundImage: BRUSH, opacity: 0.6 }} />
            {/* 静态受光：左上主光方向 */}
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 90% at 12% 0%, rgba(255,240,220,0.09) 0%, rgba(255,240,220,0) 62%)' }} />
            <Chip />
            <Face tone={ENGRAVE} t={face} />

            {sweepOn && (
              <>
                {/* 光带下：拉丝纹被照亮（固定在卡面，遮罩随光带走） */}
                <div
                  style={{
                    position: 'absolute', inset: 0, backgroundImage: BRUSH.replace(/0\.05\)/g, '0.22)'), mixBlendMode: 'screen',
                    WebkitMaskImage: bandMask, maskImage: bandMask, WebkitMaskSize: `${2 * W}px 100%`, maskSize: `${2 * W}px 100%`,
                    WebkitMaskPosition: `${bandX.toFixed(1)}px 0`, maskPosition: `${bandX.toFixed(1)}px 0`,
                    WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                  }}
                />
                {/* 光带下：蚀刻字反光 */}
                <div
                  style={{
                    position: 'absolute', inset: 0,
                    WebkitMaskImage: bandMask, maskImage: bandMask, WebkitMaskSize: `${2 * W}px 100%`, maskSize: `${2 * W}px 100%`,
                    WebkitMaskPosition: `${bandX.toFixed(1)}px 0`, maskPosition: `${bandX.toFixed(1)}px 0`,
                    WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                  }}
                >
                  <Face tone={LIT} lit t={face} />
                </div>
                {/* 宽柔光 + 窄亮芯：screen 叠在钛黑上 */}
                <div
                  style={{
                    position: 'absolute', top: 0, left: bandX, width: 2 * W, height: H, mixBlendMode: 'screen', pointerEvents: 'none',
                    background:
                      'linear-gradient(115deg, transparent 36%, rgba(255,244,228,0.06) 43%, rgba(255,244,228,0.14) 47.5%, rgba(255,248,238,0.5) 50%, rgba(255,244,228,0.14) 52.5%, rgba(255,244,228,0.06) 57%, transparent 64%)',
                  }}
                />
                {/* 上沿发丝线受光 */}
                <div
                  style={{
                    position: 'absolute', left: 0, top: 0, right: 0, height: 2,
                    background: `linear-gradient(90deg, transparent ${(topX - 170).toFixed(1)}px, rgba(255,250,240,0.85) ${topX.toFixed(1)}px, transparent ${(topX + 170).toFixed(1)}px)`,
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* 左栏：编辑式标题（portrait：卡下方） */}
      <div style={{ position: 'absolute', left: colLeft, top: colTop, width: COLW }}>
        {kickerText ? (
          <div
            style={{
              ...type(KS, 700, { caps: true }), color: L.accent, textShadow: TSH, opacity: ramp(frame, 6, 18, EASE.out), lineHeight: 1.4, whiteSpace: 'nowrap',
              letterSpacing: `${mix(0.5, 0.28, ramp(frame, 6, 26, EASE.snappy)).toFixed(3)}em`, display: 'flex', alignItems: 'center', gap: 16,
            }}
          >
            <span style={{ width: KS * 0.42, height: KS * 0.42, borderRadius: KS, background: L.accent, display: 'inline-block', flex: 'none' }} />
            {kickerText}
          </div>
        ) : null}
        <div style={{ marginTop: 34 }}>
          <RiseLines
            lines={tLines}
            start={12}
            each={24}
            gap={7}
            style={{ ...type(TS, 760), letterSpacing: '-0.035em', lineHeight: 1.12, color: L.ink, textShadow: TSH }}
          />
        </div>
        {bLines.length ? (
          <div
            style={{
              marginTop: 40, ...type(BS, 450), lineHeight: 1.38, color: L.ink2, textShadow: TSH,
              opacity: ramp(frame, 30, 18, EASE.out), transform: `translateY(${mix(14, 0, ramp(frame, 30, 22, EASE.snappy)).toFixed(1)}px)`,
            }}
          >
            {bLines.map((l, i) => (
              <div key={i} style={{ whiteSpace: 'pre' }}>{l}</div>
            ))}
          </div>
        ) : null}
        {ctaText ? (
          <div
            style={{
              marginTop: 48, display: 'inline-flex', alignItems: 'center', gap: 14, padding: `${CS * 0.6}px ${CS}px`, borderRadius: 999,
              background: L.ink, color: L.surface, ...type(fitSize(ctaText, { family: fonts.sans, size: CS, maxWidth: COLW - CS * 3, weight: 600, minSize: CS * 0.6 }), 600), lineHeight: 1.3, whiteSpace: 'nowrap',
              boxShadow: `0 10px 26px -10px ${alpha(L.shadow, 0.5)}`,
              opacity: cta, transform: `translateY(${mix(22, 0, cta).toFixed(1)}px)`,
            }}
          >
            {ctaText}
            <span style={{ color: '#f0a07c' }}>→</span>
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
