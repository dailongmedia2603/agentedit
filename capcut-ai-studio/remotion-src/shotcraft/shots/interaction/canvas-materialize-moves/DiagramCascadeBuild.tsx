// diagram-cascade-build —— miro-promo 104–116s
// prompt 打字 → 结构图逐层级联生成（根 → 2 子 → 4 孙），连线先于节点生长，成树后整棵呼吸一拍。
//
// 第二轮重设计（极光暗场 · AI 画布"一句话长出一棵树"）：
// - look = aurora（深紫夜 · 紫粉光）。主角是"生长"本身：每条连线都带一颗发光的彗星头领跑，
//   线头到达子端口的那一帧子节点才从端口处"被拉出来"（缩放原点 = 节点顶边中点）——线牵节点，因果可见。
// - 生成源头清楚：prompt 条（AI 命令条，36px 大字）提交后描边变成流动的紫粉渐变（生成中），
//   从 prompt 条底部先滴下一条线接到根节点——树是从这句话里长出来的；生成完毕描边落定、右侧状态变成"7 mục · 6 liên kết"。
// - 节点做成内容卡：34px 标题 + 两行骨架条（逐行滑入），根节点用渐变描边当主角；
//   其余是带色相的深紫玻璃面板 + 发丝线 + 顶部内高光 + 两层软阴影。
// - 相机：开场推近在 prompt 条上（1.3× 居中，读字），提交后随树生长 smooth 拉远到 1.0 揭示整体结构（crane-back），
//   全程平滑无速度突变；成树后以树心为原点呼吸 1→1.03→1，背后极光同步亮一档。
//
// 时间表（30fps，共 180f）：
//   0–10    舞台 + prompt 条落下（空条 + 光标闪）
//   8–44    打字 prompt（每字 1–2f 不均匀，像真人敲）
//   46–50   敲完：描边转紫确认；48f 按下提交键（scale 0.9 → 回弹）
//   50–136  生成中：描边流光；50f 起相机 1.3→1.0 拉远（smooth，72f），prompt 条从画面中心升到顶部
//   54      prompt 底部滴线 → 62f 根节点从端口拉出（spring damping 14）
//   82/104  第 1 / 2 层：线先行 10f（16f ease-out + 彗星头），同层兄弟错峰 5f
//   ~128    末节点落定 → 状态 "7 mục · 6 liên kết"、描边流光收束
//   138–166 整棵呼吸一拍 + 极光亮一档
//   166–180 落定 hold：完整海报
//
// [Agent Edit] o chu: prompt (cau lenh / cau hoi go vao o AI) / nodes (3-7 muc: muc 1 = goc, muc 2-3 = hai nhanh, muc 4-7
// = y con chia cho nhanh 1 roi nhanh 2). Nhip go nen lai khi prompt dai (van nop ~50f); tieu de the tu thu nho / xuong
// 2 dong. Khung doc (portrait.mode = 'native'): cay doi thanh DAN DONG thut le (goc -> nhanh -> y con xep doc, duong noi
// gap khuc tu ray trai), the rong ~1400-1600px chu to; camera van day sat o prompt roi keo ra; khung ngang giu cay goc.
import { useCurrentFrame, useVideoConfig, useText, useList, useShotFonts, fitSize, wrapLines } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, FONT, mix, ramp, softShadow } from '../../../fixtures/Polish';
import { Dust, LOOKS, Stage, alpha, springAt, type } from '../../../fixtures/Look';

export const DIAGRAM_CASCADE_BUILD_DURATION = 180;

const L = LOOKS.aurora;
const TYPE_START = 8;

type Node = { id: number; x: number; y: number; w: number; h: number; level: number; parent: number; name: string };
type Edge = { d: string; len: number; at: (u: number) => { x: number; y: number } };

const LEVEL_GAP = 22;
const SIBLING_STAGGER = 5;
const LEAD = 10; // 线比子节点早到
const EDGE_DUR = 16;
const R = 22;

// ── 圆角折线（父底端口 → 下探 → 横移 → 下探到子顶端口），用 SVG 圆弧，长度可精确计算 ──
const edgeGeom = (p: Node, c: Node): Edge => {
  const x1 = p.x, y1 = p.y + p.h / 2 + 8, x2 = c.x, y2 = c.y - c.h / 2 - 8;
  const my = (y1 + y2) / 2;
  if (Math.abs(x2 - x1) < 1) {
    const len = y2 - y1;
    return { d: `M ${x1} ${y1} L ${x2} ${y2}`, len, at: (u: number) => ({ x: x1, y: y1 + Math.min(u, len) }) };
  }
  const dir = Math.sign(x2 - x1);
  const r = Math.min(R, Math.abs(x2 - x1) / 2);
  const sweep1 = dir > 0 ? 0 : 1;
  const sweep2 = dir > 0 ? 1 : 0;
  const d = `M ${x1} ${y1} L ${x1} ${my - r} A ${r} ${r} 0 0 ${sweep1} ${x1 + dir * r} ${my} L ${x2 - dir * r} ${my} A ${r} ${r} 0 0 ${sweep2} ${x2} ${my + r} L ${x2} ${y2}`;
  const s1 = my - r - y1, a = (Math.PI * r) / 2, h = Math.abs(x2 - x1) - 2 * r, s3 = y2 - my - r;
  const len = s1 + a + h + a + s3;
  // 沿路径弧长 u（px）取点：给彗星头定位
  const at = (u: number) => {
    if (u <= s1) return { x: x1, y: y1 + u };
    u -= s1;
    if (u <= a) { const th = u / r; return { x: x1 + dir * r * (1 - Math.cos(th)), y: my - r + r * Math.sin(th) }; }
    u -= a;
    if (u <= h) return { x: x1 + dir * (r + u), y: my };
    u -= h;
    if (u <= a) { const th = u / r; return { x: x2 - dir * r + dir * r * Math.sin(th), y: my + r - r * Math.cos(th) }; }
    u -= a;
    return { x: x2, y: my + r + Math.min(u, s3) };
  };
  return { d, len, at };
};

// 竖版（缩进大纲）：父卡左侧"导轨"端口 → 下探 → 圆弧右转 → 横进子卡左端口
const RAIL = 70;
const edgeGeomL = (p: Node, c: Node): Edge => {
  const x1 = p.x - p.w / 2 + RAIL, y1 = p.y + p.h / 2 + 8, x2 = c.x - c.w / 2 - 8, y2 = c.y;
  const r = Math.min(R * 1.5, (x2 - x1) / 2);
  const d = `M ${x1} ${y1} L ${x1} ${y2 - r} A ${r} ${r} 0 0 0 ${x1 + r} ${y2} L ${x2} ${y2}`;
  const s1 = y2 - r - y1, a = (Math.PI * r) / 2, h = x2 - x1 - r;
  const len = s1 + a + h;
  const at = (u: number) => {
    if (u <= s1) return { x: x1, y: y1 + u };
    u -= s1;
    if (u <= a) { const th = u / r; return { x: x1 + r - r * Math.cos(th), y: y2 - r + r * Math.sin(th) }; }
    u -= a;
    return { x: x1 + r + Math.min(u, h), y: y2 };
  };
  return { d, len, at };
};

// ── 小图标 ──
const SparkIcon: React.FC<{ c: string; size?: number }> = ({ c, size = 34 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 2.5l2.1 6.4 6.4 2.1-6.4 2.1L12 19.5l-2.1-6.4L3.5 11l6.4-2.1z" fill={c} />
    <path d="M19 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill={c} opacity={0.6} />
  </svg>
);
const NodeIcon: React.FC<{ c: string; size: number; level: number }> = ({ c, size, level }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
    {level === 0 ? (
      <>
        <circle cx={9} cy={9} r={6.5} stroke={c} strokeWidth={1.5} />
        <circle cx={9} cy={9} r={2.6} fill={c} />
      </>
    ) : level === 1 ? (
      <>
        <rect x={2} y={3} width={14} height={12} rx={2.5} stroke={c} strokeWidth={1.5} />
        <path d="M2 7.5h14M7 7.5V15" stroke={c} strokeWidth={1.5} />
      </>
    ) : (
      <>
        <rect x={2.5} y={2.5} width={13} height={13} rx={3} stroke={c} strokeWidth={1.5} />
        <path d="M6 9.2l2.2 2.2L12.4 7" stroke={c} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      </>
    )}
  </svg>
);

// ── 内容卡：标题（≤2 行，按宽缩字）+ 骨架行（逐行滑入，保留原版"字段行"节奏） ──
const NodeCard: React.FC<{ n: Node; t: number; k: number; sans: string }> = ({ n, t, k, sans }) => {
  const root = n.level === 0;
  const A1 = L.accent, A2 = L.accent2;
  const head = ramp(t, 3, 8, EASE.out);
  const row = (i: number) => ramp(t, 7 + i * 3, 9, EASE.out);
  const pad = 24 * k;
  const icon = 26 * k;
  const avail = n.w - pad * 2 - icon - 14 * k;
  const base = 34 * k;
  const lines = wrapLines(n.name, sans, base, avail, 650, 2);
  const fs = Math.min(...lines.map((l) => fitSize(l, { family: sans, size: base, maxWidth: avail, weight: 650, minSize: 22 * k })));
  const headH = lines.length > 1 ? Math.max(66 * k, lines.length * fs * 1.22 + 22 * k) : 66 * k;
  const rows = Math.max(0, Math.min(2, Math.floor((n.h - headH - 18 * k) / (36 * k))));
  const bars = [[0.62, 0.22], [0.44, 0.3]];
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        height: headH, display: 'flex', alignItems: 'center', gap: 14 * k, padding: `0 ${pad}px`, boxSizing: 'border-box', flex: 'none',
        borderBottom: `1px solid ${alpha('#ffffff', root ? 0.12 : 0.07)}`,
        opacity: head, transform: `translateY(${((1 - head) * 6).toFixed(2)}px)`,
      }}>
        <div style={{ flex: 'none', display: 'grid' }}><NodeIcon c={root ? A1 : L.ink3} size={icon} level={n.level} /></div>
        <div style={{ ...type(fs, 650), lineHeight: 1.22, color: L.ink }}>
          {lines.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
        </div>
      </div>
      <div style={{ padding: `${16 * k}px ${pad}px 0`, display: 'flex', flexDirection: 'column', gap: 14 * k }}>
        {bars.slice(0, rows).map(([a, b], i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10 * k, height: 20 * k,
            opacity: row(i), transform: `translateX(${((1 - row(i)) * -8).toFixed(2)}px)`,
          }}>
            <span style={{ width: 9 * k, height: 9 * k, borderRadius: 9, background: i === 0 ? A1 : A2, opacity: 0.8, flex: 'none' }} />
            <span style={{ height: 10 * k, width: `${a * 100}%`, borderRadius: 6, background: alpha(L.ink2, 0.28) }} />
            <span style={{ marginLeft: 'auto', height: 10 * k, width: `${b * 100}%`, borderRadius: 6, background: alpha(L.ink3, 0.32) }} />
          </div>
        ))}
      </div>
    </div>
  );
};

export const DiagramCascadeBuild: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const A1 = L.accent; // 紫
  const A2 = L.accent2; // 粉（点缀：渐变另一端）
  const PROMPT = useText('prompt', 'Lập kế hoạch mở quán cà phê đầu tiên').normalize('NFC');
  const names = useList('nodes', ['Quán cà phê', 'Vốn & chi phí', 'Khách hàng', 'Mặt bằng', 'Thiết bị', 'Thực đơn', 'Kênh online']).slice(0, 7);
  while (names.length < 3) names.push('…');
  const N = names.length;

  // ── prompt 打字节奏：确定性"人手节奏"，词间空格多停半拍；长句整体压缩，保证 ~44f 前敲完 ──
  const chars = Array.from(PROMPT);
  const rawGap = (i: number) => (chars[i] === ' ' ? 1.7 : 0.95 + 0.25 * Math.abs(Math.sin(i * 2.17)));
  let sumGap = 0;
  for (let i = 0; i < chars.length; i++) sumGap += rawGap(i);
  const gk = Math.min(1, 36 / Math.max(1, sumGap));
  const CHAR_T: number[] = [];
  {
    let t = TYPE_START;
    for (let i = 0; i < chars.length; i++) {
      t += rawGap(i) * gk;
      CHAR_T.push(t);
    }
  }
  const TYPE_END = CHAR_T.length ? CHAR_T[CHAR_T.length - 1] : TYPE_START;
  const SUBMIT = Math.round(TYPE_END) + 4;
  const ROOT_DRIP = SUBMIT + 6; // 滴线起笔
  const CASCADE_START = SUBMIT + 14; // 根节点出现

  // ── 层级：1 根 → 2 枝 → 其余为孙（先挂枝 1，再挂枝 2） ──
  const nKids = Math.min(2, N - 1);
  const nG = N - 1 - nKids;
  const gA = Math.ceil(nG / 2);
  const parentOfG = (gi: number) => (gi < gA ? 1 : 2);

  // ── prompt 条几何 ──
  const PW = portrait ? 1420 : 1120; // 竖版收窄：开场 1.3× 推近后仍在画面内
  const pFont = portrait ? 56 : 36;
  const pAvail = PW - (portrait ? 46 + 54 + 30 + 100 : 30 + 34 + 20 + 16 + 90);
  const oneLine = fitSize(PROMPT, { family: fonts.sans, size: pFont, maxWidth: pAvail, weight: 520 });
  const pLines = portrait ? wrapLines(PROMPT, fonts.sans, pFont, pAvail, 520, 3) : oneLine >= 28 ? [PROMPT] : wrapLines(PROMPT, fonts.sans, pFont, pAvail, 520, 2);
  const pSize = Math.min(...pLines.map((l) => fitSize(l, { family: fonts.sans, size: pFont, maxWidth: pAvail, weight: 520, minSize: pFont * 0.62 })));
  const PROMPT_H = portrait ? Math.max(150, pLines.length * pSize * 1.3 + 70) : Math.max(100, pLines.length * pSize * 1.3 + 40);
  const PRAD = portrait ? 75 : 50;

  // ── 节点布局 ──
  const nodes: Node[] = [];
  let PROMPT_Y = 96;
  let treeC = { x: 960, y: 620 };
  let edgeOf: (p: Node, c: Node) => Edge = edgeGeom;
  if (!portrait) {
    const NW = 344, NH = 158;
    nodes.push({ id: 0, x: 960, y: 372, w: NW, h: NH, level: 0, parent: -1, name: names[0] });
    const kx = nKids === 1 ? [960] : [540, 1380];
    for (let i = 0; i < nKids; i++) nodes.push({ id: 1 + i, x: kx[i], y: 608, w: NW, h: NH, level: 1, parent: 0, name: names[1 + i] });
    for (let gi = 0; gi < nG; gi++) {
      const par = parentOfG(gi);
      const sibs = par === 1 ? gA : nG - gA;
      const si = par === 1 ? gi : gi - gA;
      const x = sibs === 1 ? kx[par - 1] : kx[par - 1] + (si === 0 ? -220 : 220);
      nodes.push({ id: 1 + nKids + gi, x, y: 852, w: NW, h: NH, level: 2, parent: par, name: names[1 + nKids + gi] });
    }
  } else {
    // 缩进大纲：根 / 枝 1 / 枝 1 的孙 / 枝 2 / 枝 2 的孙，自上而下
    edgeOf = edgeGeomL;
    const NH = 230, GAP = 64;
    const order: { id: number; level: number; parent: number }[] = [{ id: 0, level: 0, parent: -1 }];
    for (let i = 0; i < nKids; i++) {
      order.push({ id: 1 + i, level: 1, parent: 0 });
      for (let gi = 0; gi < nG; gi++) if (parentOfG(gi) === 1 + i) order.push({ id: 1 + nKids + gi, level: 2, parent: 1 + i });
    }
    const treeH = order.length * NH + (order.length - 1) * GAP;
    const blockH = PROMPT_H + 150 + treeH;
    PROMPT_Y = Math.max(140, (SH - blockH) / 2);
    const top = PROMPT_Y + PROMPT_H + 150;
    const LEFT = 100, RIGHT = 1820;
    order.forEach((o, i) => {
      const indent = o.level * 150;
      const x0 = LEFT + indent;
      const w = RIGHT - x0;
      nodes.push({ id: o.id, x: x0 + w / 2, y: top + i * (NH + GAP) + NH / 2, w, h: NH, level: o.level, parent: o.parent, name: names[o.id] });
    });
    nodes.sort((a, b) => a.id - b.id);
    treeC = { x: 960, y: top + treeH / 2 };
  }
  const byId = (id: number) => nodes.find((m) => m.id === id)!;
  const nodeStart = (n: Node) => {
    if (n.level === 0) return CASCADE_START;
    const siblingIdx = nodes.filter((m) => m.level === n.level && m.id < n.id).length;
    return CASCADE_START + n.level * LEVEL_GAP + siblingIdx * SIBLING_STAGGER;
  };
  const LAST = Math.max(...nodes.map(nodeStart));
  const DONE = LAST + 12;
  const BREATHE = DONE + 10;
  const k = portrait ? 1.8 : 1; // 卡内元素比例

  // ── prompt ──
  let typed = 0;
  while (typed < chars.length && CHAR_T[typed] <= frame) typed++;
  const caretOn = frame < SUBMIT && (typed < chars.length || Math.floor((frame - TYPE_END) / 7) % 2 === 0);
  const confirm = ramp(frame, TYPE_END, 6, EASE.out);
  const press = frame < SUBMIT ? 0 : frame < SUBMIT + 3 ? ramp(frame, SUBMIT, 3, EASE.out) : 1 - ramp(frame, SUBMIT + 3, 10, EASE.out);
  const promptIn = ramp(frame, 0, 14, EASE.snappy);
  const generating = ramp(frame, SUBMIT, 8, EASE.out) * (1 - ramp(frame, DONE, 12, EASE.out));
  const doneIn = ramp(frame, DONE, 14, EASE.snappy);
  const flow = Math.max(0, frame - SUBMIT) * 0.012; // 描边流光相位

  // ── 相机：推近 prompt → 提交后拉远揭示全树 ──
  const pull = ramp(frame, SUBMIT + 2, 72, EASE.smooth);
  const cam = mix(1.3, 1, pull);
  const pCY = PROMPT_Y + PROMPT_H / 2;
  const camY = portrait ? mix(SH / 2 - pCY, 0, pull) : mix(340, 0, pull); // 推近时把 prompt 条拉到画面正中
  const camOrigin = portrait ? `960px ${pCY.toFixed(1)}px` : '50% 14%';

  // ── 成树呼吸 ──
  const br = ramp(frame, BREATHE, 14, EASE.smooth) - ramp(frame, BREATHE + 14, 14, EASE.smooth);
  const breathe = 1 + 0.03 * br;
  const auroraUp = ramp(frame, BREATHE - 6, 24, EASE.out);

  const drip = ramp(frame, ROOT_DRIP, 8, EASE.out);
  const root = nodes[0];
  const dripY1 = PROMPT_Y + PROMPT_H + 4;
  const dripY2 = root.y - root.h / 2 - 8;
  const sw = portrait ? 3.5 : 2.5;
  const portR = portrait ? 9 : 6;
  const headR = portrait ? 26 : 18;
  const statusText = `${N} mục · ${N - 1} liên kết`;

  // 打字：按行切出已敲出的字
  let ci = 0;
  const typedLines = pLines.map((l) => {
    const cs = Array.from(l);
    const shown = Math.max(0, Math.min(cs.length, typed - ci));
    ci += cs.length + 1; // +1：折行处的空格
    return cs.slice(0, shown).join('');
  });
  const caretLine = Math.max(0, typedLines.findIndex((t, i) => t.length < Array.from(pLines[i]).length) === -1 ? pLines.length - 1 : typedLines.findIndex((t, i) => t.length < Array.from(pLines[i]).length));

  return (
    <AbsoluteFill style={{ background: L.bg[1], overflow: 'hidden', fontFamily: FONT.sans }}>
      <Stage look={L} keyLight={{ x: 0.5, y: 0.05 }} fill={{ x: 0.82, y: 0.95 }} breathe={0.5}>
        {/* 树后的极光：随生成逐渐亮起，成树时再亮一档 */}
        <div style={{
          position: 'absolute', left: portrait ? 60 : 260, right: portrait ? 60 : 260,
          top: portrait ? treeC.y - 900 : 380, height: portrait ? 1800 : 640,
          background: `radial-gradient(ellipse 50% 50% at 35% 55%, ${alpha(A1, 0.1 + 0.12 * auroraUp)} 0%, transparent 70%), radial-gradient(ellipse 45% 45% at 70% 60%, ${alpha(A2, 0.05 + 0.08 * auroraUp)} 0%, transparent 70%)`,
          opacity: ramp(frame, SUBMIT, 60, EASE.out),
        }} />
        {/* 画布点阵 */}
        <div style={{
          position: 'absolute', left: 0, top: 0, width: 1920, height: SH,
          backgroundImage: `radial-gradient(${alpha(L.ink, 0.12)} 1.4px, transparent 1.7px)`,
          backgroundSize: portrait ? '56px 56px' : '40px 40px', backgroundPosition: '0 16px',
          WebkitMaskImage: 'radial-gradient(ellipse 60% 62% at 50% 58%, #000 25%, transparent 100%)',
          maskImage: 'radial-gradient(ellipse 60% 62% at 50% 58%, #000 25%, transparent 100%)',
        }} />
        {Array.from({ length: Math.ceil(SH / 1080) }, (_, i) => (
          <div key={i} style={{ position: 'absolute', left: 0, top: i * 1080, width: 1920, height: 1080 }}>
            <Dust look={L} count={22} seed={5 + i} drift={0.18} opacity={0.35} />
          </div>
        ))}
      </Stage>

      <AbsoluteFill style={{ transform: `translateY(${camY.toFixed(2)}px) scale(${cam.toFixed(4)})`, transformOrigin: camOrigin }}>
        {/* ── prompt 条：渐变描边（生成中流动）+ 内面板 ── */}
        <div style={{
          position: 'absolute', left: 960 - PW / 2, top: PROMPT_Y, width: PW, height: PROMPT_H, borderRadius: PRAD,
          padding: 2, boxSizing: 'border-box',
          background: alpha(A1, 0.14 + 0.4 * confirm),
          boxShadow: `0 0 ${(30 + 40 * generating).toFixed(1)}px ${alpha(A1, 0.1 + 0.25 * generating)}, ${softShadow(24, { color: L.shadow, strength: 2.4 })}`,
          opacity: promptIn, transform: `translateY(${((1 - promptIn) * -20).toFixed(2)}px)`,
        }}>
          {/* 生成中：流动的紫粉渐变描边；完成后留一道静止的渐变边 */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: PRAD,
            background: `linear-gradient(90deg, ${A1}, ${A2}, ${A1}, ${A2}, ${A1})`, backgroundSize: '300% 100%',
            backgroundPosition: `${(-flow * 100).toFixed(2)}% 0`, opacity: Math.max(generating, 0.55 * doneIn),
          }} />
          <div style={{
            position: 'relative', width: '100%', height: '100%', borderRadius: PRAD - 2, boxSizing: 'border-box',
            background: `linear-gradient(180deg, ${L.surface2}, ${L.surface})`,
            boxShadow: `inset 0 1px 0 ${alpha('#ffffff', 0.08)}`,
            display: 'flex', alignItems: 'center', padding: portrait ? '0 24px 0 46px' : '0 16px 0 30px',
          }}>
            <div style={{ marginRight: portrait ? 30 : 20, flexShrink: 0, display: 'grid', placeItems: 'center', filter: `drop-shadow(0 0 ${8 + 10 * generating}px ${alpha(A1, 0.6)})` }}>
              <SparkIcon c={A1} size={portrait ? 54 : 34} />
            </div>
            <div style={{ ...type(pSize, 520), lineHeight: 1.3, color: L.ink }}>
              {pLines.map((_, li) => (
                <div key={li} style={{ whiteSpace: 'pre', height: pSize * 1.3 }}>
                  {typedLines[li]}
                  {li === caretLine && (
                    <span style={{
                      display: 'inline-block', width: portrait ? 4 : 3, height: pSize * 1.1, marginLeft: 4, verticalAlign: -pSize * 0.2, borderRadius: 2,
                      background: A1, opacity: caretOn ? 1 : 0,
                    }} />
                  )}
                </div>
              ))}
            </div>
            {/* 右侧：提交键（完成后收起，状态移到条下方） */}
            <div style={{ marginLeft: 'auto', position: 'relative', height: 68, display: 'flex', alignItems: 'center', flex: 'none' }}>
              <div style={{
                width: portrait ? 96 : 68, height: portrait ? 96 : 68, borderRadius: 48, display: 'grid', placeItems: 'center',
                background: confirm > 0 ? `linear-gradient(135deg, ${A1}, ${A2})` : alpha('#ffffff', 0.06),
                opacity: (0.4 + 0.6 * confirm) * (1 - doneIn),
                transform: `scale(${(1 - 0.1 * press) * (1 - 0.3 * doneIn)})`,
                boxShadow: confirm > 0.5 ? `0 6px 20px -6px ${alpha(A2, 0.7)}` : 'none',
              }}>
                <svg width={portrait ? 42 : 30} height={portrait ? 42 : 30} viewBox="0 0 24 24" fill="none">
                  <path d="M12 19V5M6 11l6-6 6 6" stroke={confirm > 0.5 ? L.onAccent : L.ink3} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* 完成状态：条下方右侧的小签（不与长 prompt 重叠，也避开中线上的滴线） */}
        <div style={{
          position: 'absolute', right: 960 - PW / 2 + 10, top: PROMPT_Y + PROMPT_H + (portrait ? 26 : 16), whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: 12, padding: portrait ? '10px 26px' : '6px 18px', borderRadius: 40,
          background: alpha(L.surface, 0.9), border: `1px solid ${alpha(A1, 0.35)}`,
          opacity: doneIn * promptIn, transform: `translateY(${((1 - doneIn) * -12).toFixed(2)}px)`,
          ...type(portrait ? 40 : 26, 560), color: L.ink2,
        }}>
          <svg width={portrait ? 38 : 26} height={portrait ? 38 : 26} viewBox="0 0 24 24" fill="none">
            <circle cx={12} cy={12} r={10} fill={alpha(A1, 0.18)} />
            <path d="M7.5 12.3l3 3 6-6.3" stroke={A1} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {statusText}
        </div>

        {/* ── 树（呼吸以树心为原点） ── */}
        <div style={{ position: 'absolute', inset: 0, transform: `scale(${breathe.toFixed(4)})`, transformOrigin: `${treeC.x}px ${treeC.y}px` }}>
          <svg width={1920} height={SH} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
            <defs>
              <linearGradient id="dcbEdge" x1="0" y1={portrait ? dripY1 : 300} x2="0" y2={portrait ? dripY1 + 1600 : 800} gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor={A1} stopOpacity={0.85} />
                <stop offset="1" stopColor={A2} stopOpacity={0.7} />
              </linearGradient>
              <radialGradient id="dcbHead">
                <stop offset="0" stopColor="#ffffff" stopOpacity={1} />
                <stop offset="0.35" stopColor={A2} stopOpacity={0.9} />
                <stop offset="1" stopColor={A1} stopOpacity={0} />
              </radialGradient>
            </defs>
            {/* prompt → 根的滴线 */}
            {drip > 0 && (
              <g>
                <line x1={960} y1={dripY1} x2={960} y2={mix(dripY1, dripY2, drip)} stroke="url(#dcbEdge)" strokeWidth={sw} strokeLinecap="round" strokeDasharray={portrait ? '3 10' : '2 7'} />
                {drip < 1 && <circle cx={960} cy={mix(dripY1, dripY2, drip)} r={headR * 0.9} fill="url(#dcbHead)" />}
              </g>
            )}
            {nodes.filter((n) => n.parent >= 0).map((n) => {
              const g = edgeOf(byId(n.parent), n);
              const start = nodeStart(n) - LEAD;
              const grow = ramp(frame, start, EDGE_DUR, EASE.out);
              if (grow <= 0) return null;
              const tip = g.at(grow * g.len);
              const headOp = 1 - ramp(frame, start + EDGE_DUR - 4, 8, EASE.out);
              const port = ramp(frame, start + EDGE_DUR - 6, 10, EASE.overshoot);
              const cp = portrait ? { x: n.x - n.w / 2 - 8, y: n.y } : { x: n.x, y: n.y - n.h / 2 - 8 };
              return (
                <g key={n.id}>
                  {/* 柔光底线 + 实线 */}
                  <path d={g.d} stroke={A1} strokeOpacity={0.18} strokeWidth={sw * 3.6} fill="none" strokeLinecap="round"
                    strokeDasharray={`${g.len} ${g.len}`} strokeDashoffset={g.len * (1 - grow)} />
                  <path d={g.d} stroke="url(#dcbEdge)" strokeWidth={sw} fill="none" strokeLinecap="round"
                    strokeDasharray={`${g.len} ${g.len}`} strokeDashoffset={g.len * (1 - grow)} />
                  {headOp > 0 && <circle cx={tip.x} cy={tip.y} r={headR} fill="url(#dcbHead)" opacity={headOp} />}
                  <circle cx={cp.x} cy={cp.y} r={portR * port} fill={L.bg[1]} stroke={A2} strokeWidth={sw} />
                </g>
              );
            })}
            {/* 父端口：第一条出线起笔时出现 */}
            {nodes.filter((n) => nodes.some((c) => c.parent === n.id)).map((n) => {
              const firstChild = nodes.filter((c) => c.parent === n.id).sort((a, b) => a.id - b.id)[0];
              const port = ramp(frame, nodeStart(firstChild) - LEAD - 4, 8, EASE.overshoot);
              const px = portrait ? n.x - n.w / 2 + RAIL : n.x;
              return <circle key={`p${n.id}`} cx={px} cy={n.y + n.h / 2 + 8} r={portR * port} fill={L.bg[1]} stroke={A1} strokeWidth={sw} />;
            })}
            {/* 根的顶端口（接滴线） */}
            <circle cx={960} cy={dripY2} r={portR * ramp(frame, ROOT_DRIP + 4, 8, EASE.overshoot)} fill={L.bg[1]} stroke={A1} strokeWidth={sw} />
          </svg>

          {nodes.map((n) => {
            const start = nodeStart(n);
            if (frame < start) return null;
            const pop = springAt(frame, start, { damping: 14, stiffness: 190 });
            const op = ramp(frame, start, 5, EASE.linear);
            const lift = (1 - Math.min(1, pop)) * 22; // 弹出时离地更高，落定阴影收紧
            const isRoot = n.level === 0;
            return (
              <div key={n.id} style={{
                position: 'absolute', left: n.x - n.w / 2, top: n.y - n.h / 2, width: n.w, height: n.h,
                borderRadius: 22 * k, padding: isRoot ? 2 : 0, boxSizing: 'border-box',
                background: isRoot ? `linear-gradient(135deg, ${A1}, ${A2})` : undefined,
                boxShadow: `${softShadow(10 + lift, { color: L.shadow, strength: 2.6 })}${isRoot ? `, 0 0 50px ${alpha(A1, 0.25 + 0.2 * br)}` : ''}`,
                opacity: op,
                // 从端口"拉出"：横版缩放原点 = 顶边中点；竖版 = 左边中点（接线端口）
                transform: portrait
                  ? `translateX(${((1 - pop) * -18).toFixed(2)}px) scale(${(0.7 + 0.3 * pop).toFixed(4)})`
                  : `translateY(${((1 - pop) * -18).toFixed(2)}px) scale(${(0.7 + 0.3 * pop).toFixed(4)})`,
                transformOrigin: portrait ? (isRoot ? '50% 0%' : '0% 50%') : '50% 0%',
              }}>
                <div style={{
                  position: 'relative', width: '100%', height: '100%', borderRadius: isRoot ? 22 * k - 2 : 22 * k, overflow: 'hidden', boxSizing: 'border-box',
                  background: isRoot ? `linear-gradient(180deg, #2a2045, ${L.surface})` : `linear-gradient(180deg, ${alpha('#2a2340', 0.92)}, ${alpha(L.surface, 0.94)})`,
                  border: isRoot ? undefined : `1px solid ${alpha('#ffffff', 0.09)}`,
                  boxShadow: `inset 0 1px 0 ${alpha('#ffffff', isRoot ? 0.14 : 0.08)}`,
                }}>
                  <NodeCard n={n} t={frame - start} k={k} sans={fonts.sans} />
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
