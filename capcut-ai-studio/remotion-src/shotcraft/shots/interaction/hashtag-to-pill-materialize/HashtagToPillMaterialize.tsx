// hashtag-to-pill-materialize（bear-app 18–21.5s 重做版，按原片密帧逐帧对照）
// 原片实测节奏（25fps 逐帧）：
//  1) 白底居中打字 "#music"：几何无衬线（Futura 气质）、中灰墨色、红色实心光标恒亮不闪、人手节奏
//  2) 实体化 = 1 帧硬切：文字+光标 → 宽大浅灰无描边胶囊 + 灰色双八分音符图标 + "music"（字号不变，#被图标替换）
//  3) 停约 0.6s → 整体平滑缩小（→~0.55x）并左移落到页面标签位（约 0.55s，easeInOut）
//  4) 再 1 帧硬切揭示成品笔记页：奶油底、墨绿大标题 "My favorite shots"、胶囊换成鼠尾草绿、正文三行——
//     原片没有"胶囊飞入下方滑入卡片"的段落（批次 8 的飞行段为杜撰，已砍）
// 质感升级：两张底都换成带极淡纸感的渐变 + 颗粒（防大面积纯色死平）；胶囊是"实体"——受光上沿
// 内高光 + 微体积渐变 + 离地软影（hero 时浮起 10px，缩移中随落位降到 0，归位即"嵌进"页面）；
// 缩移段按速度给方向性运动模糊；成品页补一行页眉元信息（面包屑 + 编辑时间），版式完整。
// 两次硬切、缩移曲线与全部时间点不变。
// 品牌轮：话题词 "#music" → "#shots"（与原词等长，胶囊版式不变），音符图标换场记板，
// 成品页讲 video-shotcraft 的镜头（标题 "My favorite shots"，正文点名 video-shotcraft）。
//
// [Agent Edit] o chu: tag (tu khoa hashtag) / title (tieu de trang ghi chu) / body (doan van) / crumb (muc cha o duong dan).
// Font Futura -> Be Vietnam Pro (du dau). Chu dai bat ky: chieu dai vien thuoc tinh theo be ngang chu that (toi thieu 740 nhu
// goc), tieu de / doan van tu xuong dong + thu nho; vi tri o nhan tren trang tinh theo so dong tieu de that. Bieu tuong
// cai bang (clapper) -> bieu tuong nhan (tag) trung tinh. Nhip go 4-6f/chu; tu dai -> nen deu de go xong truoc khung 40
// (giu nguyen 2 nhat cat cung MORPH 48 / REVEAL 83 va doan thu nho 66-80).
// Khung doc (portrait.mode = 'native'): moi thu phong 1.4x, trang thanh pham can giua theo chieu doc.
import { useBackdrop, useCurrentFrame, useShotFonts, useText, useVideoConfig, measureText, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill, interpolate, Easing } from 'remotion';
import { Grain, SpeedBlur, velocity } from '../../../fixtures/Polish';

// 揭示 83f 后真静止 37f（≈1.2s 呼吸，R1），全段 4s
export const HASHTAG_TO_PILL_MATERIALIZE_DURATION = 120;

const C = {
  bgWhite: 'linear-gradient(180deg, #fdfdfc 0%, #fbfbfa 60%, #f6f6f3 100%)',
  bgCream: 'linear-gradient(180deg, #f6f3e8 0%, #f3f0e4 55%, #eeeadc 100%)',
  meta: '#a7a392',
  ink: '#454543',
  cursor: '#e0453f',
  pillGray: '#e9e9e7',
  pillTextGray: '#4b4b49',
  iconGray: '#7e7e7c',
  pillSage: '#d5e0cf',
  iconSage: '#5c7a63',
  titleGreen: '#2d5c47',
  pillSageText: '#3f5e4c',
  body: '#4c4b43',
};

// ---- mulberry32（仅用于打字节奏的人手抖动，确定性）----
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


// 打字起点 & 每字间隔（帧），4–6 帧带抖动，模拟原片真人节奏；字多 → 等比压密，最晚 f40 打完
const TYPE_START = 8;
const typeTimes = (n: number): number[] => {
  const rand = mulberry32(20260717);
  const raw: number[] = [];
  for (let i = 0; i < n; i++) raw.push(4 + Math.floor(rand() * 3)); // 4–6 帧（原片 ~6字/秒）
  const sum = raw.slice(0, -1).reduce((a, b) => a + b, 0);
  const k = Math.min(1, 32 / Math.max(1, sum));
  const at: number[] = [];
  let f = TYPE_START;
  for (let i = 0; i < n; i++) {
    at.push(Math.round(f));
    f += raw[i] * k;
  }
  return at;
};

// ---- 时间轴（30fps，共 132 帧，节奏对齐原片 18–21.5s）----
const MORPH = 48;       // 1 帧硬切实体化（打完 hold ~0.5s，原片 0.45s）
const MOVE_START = 66;  // 胶囊开始缩小左移（morph 后 0.6s，原片同）
const MOVE_END = 80;    // 落位（0.47s，原片 ~0.45s）
const REVEAL = 83;      // 1 帧硬切揭示成品页，之后静置收尾

// ---- 几何（1920x1080，等比换算自原片 1280x720 实测像素）----
const PILL_H0 = 236;                  // 原片实测 157 @720p ×1.5
const PILL_W0 = 740;                  // 最小胶囊宽（原片 493 @720p ×1.5）——词长时按真实字宽加宽
const END_SCALE = 0.554;              // 落位缩放（原片 273/493）
const LEFT = 160;                     // 成品页左边距

// 标签图标（实心剪影，与原音符图标同一视觉重量）：标签牌 + 穿孔
const TagIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => {
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: 'block' }}>
      <defs>
        <mask id={`k${id}`}>
          <rect x="0" y="0" width="48" height="48" fill="#fff" />
          <circle cx="15" cy="15" r="4.2" fill="#000" />
        </mask>
      </defs>
      <path d="M6 9.5 A3.5 3.5 0 0 1 9.5 6 H23.6 A3.5 3.5 0 0 1 26.1 7 L42.4 23.3 A3.5 3.5 0 0 1 42.4 28.3 L28.3 42.4 A3.5 3.5 0 0 1 23.3 42.4 L7 26.1 A3.5 3.5 0 0 1 6 23.6 Z" fill={color} mask={`url(#k${id})`} />
    </svg>
  );
};

// 胶囊（大字号绘制，整体 transform 缩放，保证实体化前后文字原位等大）
// lift = 离地高度（大字号坐标 px）：hero 时浮起，落位时归零贴进页面
const Pill: React.FC<{ bg: string; iconColor: string; textColor: string; lift: number; w: number; h: number; fs: number; text: string; family: string }> = ({ bg, iconColor, textColor, lift, w, h, fs, text, family }) => (
  <div style={{
    width: w, height: h, borderRadius: h / 2,
    // 无描边：实体感来自上亮下暗的微体积 + 顶沿内高光 + 离地软影（不是边框）
    background: `linear-gradient(180deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0) 46%, rgba(0,0,0,0.025) 100%), ${bg}`,
    boxShadow: `inset 0 3px 0 rgba(255,255,255,0.7), inset 0 -2px 0 rgba(40,40,30,0.03), ` +
      `0 ${(1 + lift * 0.12).toFixed(1)}px ${(2 + lift * 0.3).toFixed(1)}px rgba(40,40,30,${(0.04 + lift * 0.003).toFixed(3)}), ` +
      `0 ${(lift * 1.6).toFixed(1)}px ${(lift * 4).toFixed(1)}px ${(-lift * 0.6).toFixed(1)}px rgba(40,40,30,${(lift * 0.009).toFixed(3)})`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', gap: h * 0.28,
  }}>
    <TagIcon size={h * 0.44} color={iconColor} />
    <span style={{ fontFamily: family, fontSize: fs, fontWeight: 500, color: textColor, letterSpacing: 2, whiteSpace: 'pre', lineHeight: 1.25, marginRight: h * 0.12 }}>{text}</span>
  </div>
);

// 多行自适应：字号从 size 往下缩，直到 ≤ maxLines 行
const fitWrap = (text: string, family: string, size: number, maxW: number, weight: number, maxLines: number, minSize: number) => {
  let s = size;
  for (let k = 0; k < 40; k++) {
    const lines = wrapLines(text, family, s, maxW, weight, 99);
    const widest = Math.max(0, ...lines.map((l) => measureText(l, family, s, weight)));
    if ((lines.length <= maxLines && widest <= maxW) || s <= minSize) return { size: s, lines: wrapLines(text, family, s, maxW, weight, maxLines) };
    s = Math.max(minSize, s - 4);
  }
  return { size: s, lines: wrapLines(text, family, s, maxW, weight, maxLines) };
};

export const HashtagToPillMaterialize: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const FAM = fonts.sans;
  const portrait = SH > 1080 * 1.2;
  const K = portrait ? 1.4 : 1; // 竖屏整体放大
  const tag = useText('tag', 'giảm cân').replace(/^#+/, '').replace(/\s+/g, ' ').trim();
  const title = useText('title', 'Hành trình giảm cân của tôi').trim();
  const bodyText = useText('body', 'Ba tháng, mười hai cân và một thói quen nhỏ: mỗi tối viết lại mình đã ăn gì, tập gì. Đơn giản vậy thôi.').trim();
  const crumb = useText('crumb', 'Ghi chú').trim();
  const TEXT = '#' + tag;
  const TYPE_AT = typeTimes(Array.from(TEXT).length);

  // 胶囊几何：字号与打字层一致；词太长先加宽胶囊，再缩字
  const MAXW = 1920 - 2 * LEFT;
  let FS = 132 * K;
  const H = PILL_H0 * K;
  const pillFor = (fs: number) => H * 0.44 + H * 0.28 + measureText(tag, FAM, fs, 500) + Math.max(0, tag.length - 1) * 2 + H * 0.12 + H * 0.9;
  if (pillFor(FS) > MAXW) FS = Math.max(56, FS * ((MAXW - H * 1.74) / Math.max(1, pillFor(FS) - H * 1.74)));
  const W = Math.max(PILL_W0 * K, Math.min(MAXW, pillFor(FS)));
  const typedFS = Math.min(FS, FS * (MAXW / Math.max(1, measureText(TEXT, FAM, FS, 500) + 40)));

  // ---- 成品页排版（按真实行数排）----
  const HEAD = 32 * K;
  const T = fitWrap(title, FAM, 122 * K, MAXW, 700, portrait ? 3 : 2, 72 * K);
  const B = fitWrap(bodyText, FAM, 70 * K, MAXW, 500, portrait ? 6 : 3, 44 * K);
  const tLH = T.size * 1.22;
  const bLH = B.size * 1.36;
  const pillSmallH = H * END_SCALE;
  const contentH = HEAD + 50 * K + T.lines.length * tLH + 60 * K + pillSmallH + 70 * K + B.lines.length * bLH;
  const top0 = portrait ? Math.max(200, Math.round(SH / 2 - contentH / 2)) : 86;
  const ruleY = top0 + HEAD + 26 * K;
  const titleY = ruleY + 24 * K;
  const slotY = titleY + T.lines.length * tLH + 60 * K + pillSmallH / 2;
  const bodyY = landscapeBodyY(portrait, slotY + pillSmallH / 2 + 70 * K, B.lines.length, bLH);
  const HERO = { x: 960, y: SH / 2 };
  const SLOT = { x: LEFT + (W * END_SCALE) / 2, y: slotY };

  // ---- 打字 ----
  const typedCount = TYPE_AT.filter((t) => frame >= t).length;
  const typed = Array.from(TEXT).slice(0, typedCount).join('');

  // ---- 缩小左移 ----
  const moveAt = (f: number) => interpolate(f, [MOVE_START, MOVE_END], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.5, 0, 0.25, 1),
  });
  const pxAt = (f: number) => interpolate(moveAt(f), [0, 1], [HERO.x, SLOT.x]);
  const pyAt = (f: number) => interpolate(moveAt(f), [0, 1], [HERO.y, SLOT.y]);
  const moveT = moveAt(frame);
  const px = pxAt(frame);
  const py = pyAt(frame);
  const ps = interpolate(moveT, [0, 1], [1, END_SCALE]);
  // 缩移峰值 ~70px/帧：按速度沿运动方向给拖影，起止处速度→0 自动无模糊
  const vx = velocity(pxAt, frame);
  const vy = velocity(pyAt, frame);
  // 离地：hero hold 时浮 10px，缩移后半程降落，落位贴平（Q9：归位即嵌入页面）
  const lift = 10 * (1 - interpolate(moveT, [0.35, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  // 实体化瞬间极轻微落定（原片近乎硬切，仅 3 帧 1.03→1，避免死板）
  const settle = interpolate(frame, [MORPH, MORPH + 3], [1.03, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad),
  });

  const revealed = frame >= REVEAL;
  // [Agent Edit] nen anh AI: bo 2 nen giay trang / kem + hat; chu dat thang tren nen co bong sang
  const bd = useBackdrop();
  const TSH = bd ? '0 1px 12px rgba(255,255,255,0.7)' : undefined;

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : revealed ? C.bgCream : C.bgWhite, fontFamily: FAM, textShadow: TSH }}>
      {/* 成品页（硬切揭示，之后全静） */}
      {revealed && (
        <>
          {/* 页眉元信息：面包屑 + 编辑时间，让"成品页"版式完整（辅助文字 32px，低对比不抢标题） */}
          <div style={{
            position: 'absolute', left: LEFT + 4, right: LEFT, top: top0, display: 'flex', alignItems: 'center',
            fontSize: HEAD, fontWeight: 500, color: C.meta, letterSpacing: 0.6, lineHeight: 1.3, whiteSpace: 'nowrap',
          }}>
            <span>{crumb}</span>
            <span style={{ margin: '0 18px', opacity: 0.7 }}>/</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 700 * K }}>{tag}</span>
            <span style={{ marginLeft: 'auto' }}>Vừa chỉnh sửa</span>
          </div>
          <div style={{
            position: 'absolute', left: LEFT + 4, right: LEFT, top: ruleY, height: 1,
            background: 'linear-gradient(90deg, rgba(120,112,80,0.16), rgba(120,112,80,0.06))',
          }} />
          {T.lines.map((l, i) => (
            <div key={i} style={{
              position: 'absolute', left: LEFT, top: titleY + i * tLH, whiteSpace: 'pre',
              fontSize: T.size, fontWeight: 700, color: C.titleGreen, letterSpacing: 0.5, lineHeight: 1.22,
            }}>
              {l}
            </div>
          ))}
          {B.lines.map((l, i) => (
            <div key={i} style={{
              position: 'absolute', left: LEFT - 8 * K, top: bodyY + i * bLH, whiteSpace: 'pre',
              fontSize: B.size, fontWeight: 500, color: C.body, lineHeight: 1.36, letterSpacing: 0.3,
            }}>
              {l}
            </div>
          ))}
        </>
      )}

      {/* 打字层：文字 + 恒亮红光标（原片光标不闪烁），实体化帧整体消失 */}
      {frame < MORPH && (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: typedFS, fontWeight: 500, color: C.ink, letterSpacing: 2, whiteSpace: 'pre', lineHeight: 1.25 }}>
              {typed}
            </span>
            <span style={{
              display: 'inline-block', width: 7 * K, height: typedFS * 1.14,
              background: C.cursor, marginLeft: 8, borderRadius: 2,
            }} />
          </div>
        </AbsoluteFill>
      )}

      {/* 胶囊层：实体化 1 帧硬切出现 → hold → 缩小左移落位 → 揭示帧换鼠尾草绿 */}
      {frame >= MORPH && (
        <SpeedBlur vx={vx} vy={vy} amount={0.1} max={7}>
        <div style={{
          position: 'absolute', left: 0, top: 0,
          // origin 必须是 0 0：translate 先把原点送到目标中心，scale 绕该点缩放，
          // 否则默认 50% 50% 会让落位时中心漂移 (1-s)*半宽
          transformOrigin: '0 0',
          transform: `translate(${px}px, ${py}px) scale(${ps * settle})`,
        }}>
          <div style={{ transform: 'translate(-50%, -50%)' }}>
            {revealed
              ? <Pill bg={C.pillSage} iconColor={C.iconSage} textColor={C.pillSageText} lift={0} w={W} h={H} fs={FS} text={tag} family={FAM} />
              : <Pill bg={C.pillGray} iconColor={C.iconGray} textColor={C.pillTextGray} lift={lift} w={W} h={H} fs={FS} text={tag} family={FAM} />}
          </div>
        </div>
        </SpeedBlur>
      )}
      {/* 极弱纸面颗粒：防大面积浅底色带，揭示帧随底色一起硬切（同一层，不做过渡） */}
      {!bd && <Grain opacity={0.05} step={2} />}
    </AbsoluteFill>
  );
};

// landscape：正文块贴近原版位置（top 618），但不早于胶囊下方、不越出画面
function landscapeBodyY(portrait: boolean, minY: number, n: number, lh: number) {
  if (portrait) return minY;
  return Math.max(minY, Math.min(618, 1080 - 60 - n * lh));
}
