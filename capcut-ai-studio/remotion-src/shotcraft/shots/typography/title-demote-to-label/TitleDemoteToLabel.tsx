// title-demote-to-label —— 大标题降格为节标签（两式串播）
// 源：perplexity-promo 16–18.5s；B 式变体源自 framer text-selection-title。
//
// 第二轮重设计（paper · 瑞士网格编辑版式 · 产品 = video-shotcraft 的分镜工作台）：
// - look = paper（暖白纸 · 墨 · 朱红）。主角是 220px / 850 字重的单词海报标题「Frame.」「Craft.」（品牌短句 Frame motion. Craft the shot.），
//   句点是朱红——降格后它就是栏目标签的识别点。12 栏网格的左边距 120、发丝线、mono 眉题撑起编辑版式。
// - 降格：一次连续补间（26f，不对称 in-out：起步果断、落点很软）scale 1→0.22、中心→左上标签槽，
//   transform-origin 左中、居中修正 translate(-50%) 随补间归零；飞行按速度加方向性运动模糊。
//   眉题「CHAPTER 01」随起飞 6f 淡出，落位时标签前的「01 /」从左擦入接班。
// - 内容在降格进行到 12f 时开始错峰生长（裁切揭开 + 上移 + 淡入，先密后疏），交接零空档：
//   A = 导语 + 三张卡（镜头配方卡 / 用户评价 / 卡点节拍）；B = 一段分镜脚本，其中一句带朱红选区 → 连线 → 匹配镜头卡。
// - 两式之间不再白闪：A 内容 ease-in 上移退场，A 标签上移一行、变灰缩小成"上一节"（多节连用不叠放），
//   B 大标题在同一个舞台上显影——共享一个 Stage，没有接缝。
// - B 式：朱红选区扫入（右缘跟着 3px 插入光标）→ 站 10f → 左缘撤走 → 再降格。
//
// 时间表（30fps，共 246f）：
//   A  0–16    眉题字距收拢 + 标题逐字从线下升起（rise，先到先稳）
//      16–36   站稳 20f（极缓 1.5% 推近，画面不死）
//      36–62   降格 26f；48 起内容生长（~44f 长完）
//      92–112  hold
//   转 112–124 A 内容退场（exit 12f）；A 标签 124–140 上移成"上一节"
//   B  118–134 B 标题显影；136–146 选区扫入；146–156 站；156–164 撤；166–192 降格；178 起内容生长
//      226–246 hold 落定（尾帧 = 完整编辑页海报）
//
// [Agent Edit] o chu — phan A: title1 (tu tieu de lon, tu them dau cham do) / lead + lead2 (cau dan, lead2 mau xam) /
// point1 + point1_note (the 1) / quote (the 2, trich dan nen toi) / point2 (the 3, kem dai nhip). Phan B: title2 / lines
// (3-4 cau "kich ban", cau THU 3 duoc to chon roi noi day sang the ghi chu) / note (tieu de the ghi chu). Chu dai ngan
// bat ky: tieu de tu thu nho theo be ngang that, nhan sau khi ha cap giu ~48px (doc 64px); moi doan wrapLines + fitSize.
// Khung doc (portrait.mode = 'native'): tieu de to hon, 3 the xep doc, the ghi chu nam DUOI kich ban (day noi doc xuong),
// ca khoi noi dung can giua theo chieu cao that. Khung ngang giu bo cuc goc.
import { useBackdrop, useCurrentFrame, useVideoConfig, useText, useList, useBrand, useShotFonts, fitSize, wrapLines, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, SpeedBlur, bezier, mix, ramp, softShadow } from '../../../fixtures/Polish';
import { LOOKS, Stage, TextReveal, alpha, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

const L = LOOKS.paper;
export const TITLE_DEMOTE_TO_LABEL_DURATION = 246;

const B0 = 112; // B 式（转场）起点
const MARGIN = 120; // 网格左边距
const CW = 1920 - MARGIN * 2; // 内容宽 1680
const DEMOTE_EASE = bezier(0.6, 0, 0.18, 1); // 起步果断、落点很软的不对称 in-out
const SEL = alpha(L.accent, 0.2);

// [Agent Edit] 版式几何（横屏 = 原版；竖屏按真实高度重排）
type Geo = {
  P: boolean; SH: number; u: number; // u = 竖屏字号系数
  slotY: number; contentTop: number; headerY: number; footerY: number;
  hero: number; label: number; // 标题字号上限 / 降格后标签字号
};
const geoOf = (SH: number): Geo => {
  if (SH <= 1080 * 1.2) return { P: false, SH, u: 1, slotY: 196, contentTop: 262, headerY: 182, footerY: 948, hero: 220, label: 48 };
  const slotY = Math.round(SH * 0.2);
  return { P: true, SH, u: 1.6, slotY, contentTop: slotY + 90, headerY: slotY - 150, footerY: SH - Math.round(SH * 0.11), hero: 270, label: 66 };
};

// ───────────── 生长块：裁切从左揭开 + 上移 + 淡入（内容不变形） ─────────────
const Grow: React.FC<{ frame: number; at: number; dur?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  frame, at, dur = 20, children, style,
}) => {
  const p = ramp(frame, at, dur, EASE.out);
  return (
    <div style={{
      opacity: Math.min(1, p * 1.6),
      transform: `translateY(${((1 - p) * 30).toFixed(2)}px)`,
      clipPath: p < 1 ? `inset(-60px ${((1 - (0.3 + 0.7 * p)) * 100).toFixed(2)}% -60px -20px)` : undefined,
      ...style,
    }}>
      {children}
    </div>
  );
};

const Tag: React.FC<{ label: string; color?: string; u: number }> = ({ label, color = L.accent, u }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 * u, ...type(22 * u, 700, { caps: true, mono: true }), letterSpacing: '0.14em', color: L.ink2, whiteSpace: 'nowrap' }}>
    <span style={{ width: 10 * u, height: 10 * u, borderRadius: 5 * u, background: color }} />
    {label}
  </span>
);

const cardStyle = (w: number, h: number | 'auto', u: number): React.CSSProperties => ({
  position: 'relative', width: w, height: h, borderRadius: 22 * u, background: L.surface,
  border: `1px solid ${L.line}`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.9), ${softShadow(10, { color: L.shadow, strength: 0.9 })}`,
  padding: `${34 * u}px ${36 * u}px`, boxSizing: 'border-box', overflow: 'hidden',
  textShadow: 'none', // [Agent Edit] chu trong the co nen rieng: khong ke bong sang cua nen anh
});

type Copy = {
  title1: string; lead: string; lead2: string; point1: string; point1Note: string; quote: string; point2: string;
  title2: string; lines: string[]; note: string; sans: string; serif: string; brand: string;
};

// 多行文本：按宽度折行（最多 maxLines），整体字号缩到每行都放得下
// maxH（可选）：总高（行数 × 字号 × lh）也须放得下
const fitBlock = (text: string, family: string, size: number, maxW: number, weight: number, maxLines: number, minK = 0.6, maxH = Infinity, lh = 1.2) => {
  for (const k of [1, 0.9, 0.8, 0.7, 0.62, 0.55, minK].filter((x) => x >= minK)) {
    const sz = Math.round(size * k);
    const lines = wrapLines(text, family, sz, maxW, weight, maxLines);
    if (lines.every((l) => measureText(l, family, sz, weight) <= maxW) && lines.length * sz * lh <= maxH) return { size: sz, lines };
  }
  const sz = Math.round(size * minK);
  const lines = wrapLines(text, family, sz, maxW, weight, maxLines);
  return { size: Math.min(...lines.map((l) => fitSize(l, { family, size: sz, maxWidth: maxW, weight, minSize: size * 0.35 }))), lines };
};

// ───────────── A：导语 + 三张卡（要点 / 引言 / 要点 + 节拍条） ─────────────
const ContentA: React.FC<{ frame: number; at: number; c: Copy; g: Geo }> = ({ frame, at, c, g }) => {
  const t = (k: number) => at + k; // 先密后疏的错峰
  const u = g.u;
  const cardW = g.P ? CW : 536;
  const cardH = g.P ? 480 : 430;
  const inner = cardW - 72 * u;
  // 导语：主句墨色 + 尾句灰色（横屏一行 / 竖屏折行）
  const leadText = c.lead2 ? `${c.lead} ${c.lead2}` : c.lead;
  const LB = fitBlock(leadText, c.sans, 60 * (g.P ? 1.5 : 1), CW, 650, g.P ? 3 : 1, 0.55);
  const leadCut = c.lead.split(/\s+/).filter(Boolean).length; // 前 leadCut 个词是墨色
  let wi = 0;
  // 卡内可用高：顶 padding + 标签 + 间距 ~ (34+30+26)u，底部 mono 脚注 ~ 70u
  const avail = cardH - 160 * u;
  const p1 = fitBlock(c.point1, c.sans, 42 * u, inner, 700, 2, 0.7);
  const p1H = p1.lines.length * p1.size * 1.18;
  const p1n = c.point1Note ? fitBlock(c.point1Note, c.sans, 32 * u, inner, 400, g.P ? 2 : 3, 0.55, avail - p1H - 18 * u, 1.35) : null;
  const q = fitBlock(`“${c.quote}”`, c.serif, 52 * (g.P ? 1.45 : 1), inner, 400, g.P ? 3 : 5, 0.45, avail, 1.16);
  const p2 = fitBlock(c.point2, c.sans, 42 * u, inner, 700, 2, 0.7);
  const bars = g.P ? 80 : 34;
  return (
    <div style={{ position: 'absolute', left: MARGIN, top: g.contentTop, width: CW }}>
      <Grow frame={frame} at={t(8)} dur={18}>
        <div style={{ height: 1.5, background: alpha(L.ink, 0.85) }} />
      </Grow>
      <Grow frame={frame} at={t(6)} style={{ marginTop: 40 * u }}>
        <div style={{ ...type(LB.size, 650), color: L.ink, lineHeight: 1.22, paddingTop: 6 }}>
          {LB.lines.map((ln, i) => (
            <div key={i} style={{ whiteSpace: 'nowrap' }}>
              {ln.split(/\s+/).map((w, k) => {
                const ink = wi++ < leadCut;
                return <span key={k} style={{ color: ink ? L.ink : L.ink3 }}>{k ? ' ' : ''}{w}</span>;
              })}
            </div>
          ))}
        </div>
      </Grow>
      <div style={{ display: 'flex', flexDirection: g.P ? 'column' : 'row', gap: 36, marginTop: 56 * u }}>
        <Grow frame={frame} at={t(10)} dur={22}>
          <div style={cardStyle(cardW, cardH, u)}>
            <Tag label="Ý chính" u={u} />
            <div style={{ ...type(p1.size, 700), color: L.ink, marginTop: 26 * u, lineHeight: 1.18 }}>
              {p1.lines.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
            </div>
            {p1n ? (
              <div style={{ ...type(p1n.size, 400), color: L.ink2, marginTop: 18 * u, lineHeight: 1.35 }}>
                {p1n.lines.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
              </div>
            ) : null}
            <div style={{ position: 'absolute', left: 36 * u, right: 36 * u, bottom: 30 * u, display: 'flex', justifyContent: 'space-between', ...type(22 * u, 500, { mono: true }), color: L.ink3 }}>
              <span>ghi chú / 01</span><span>1 phút</span>
            </div>
          </div>
        </Grow>
        <Grow frame={frame} at={t(16)} dur={22}>
          <div style={{ ...cardStyle(cardW, cardH, u), background: L.ink, border: 'none' }}>
            <Tag label="Trích dẫn" color={L.accent} u={u} />
            <div style={{ fontFamily: c.serif, fontSize: q.size, lineHeight: 1.16, fontStyle: 'italic', color: L.surface, marginTop: 26 * u, letterSpacing: '-0.01em' }}>
              {q.lines.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
            </div>
            <div style={{ position: 'absolute', left: 36 * u, right: 36 * u, bottom: 30 * u, ...type(22 * u, 500, { mono: true }), color: alpha(L.surface, 0.5) }}>
              Đã lưu · 03:12
            </div>
          </div>
        </Grow>
        <Grow frame={frame} at={t(24)} dur={22}>
          <div style={cardStyle(cardW, cardH, u)}>
            <Tag label="Nhịp" color={L.accent2} u={u} />
            <div style={{ ...type(p2.size, 700), color: L.ink, marginTop: 26 * u, lineHeight: 1.18 }}>
              {p2.lines.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
            </div>
            <div style={{ position: 'absolute', left: 36 * u, right: 36 * u, bottom: 78 * u, display: 'flex', alignItems: 'center', gap: 6, height: (p2.lines.length > 1 ? 90 : 120) * (g.P ? 0.8 : 1) }}>
              {Array.from({ length: bars }, (_, i) => {
                const hgt = (18 + 90 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.43))) * (p2.lines.length > 1 ? 0.75 : 1) * (g.P ? 0.8 : 1);
                return <span key={i} style={{ width: 7 * (g.P ? 1.3 : 1), height: hgt, borderRadius: 4, background: i < bars * 0.38 ? L.accent2 : alpha(L.ink, 0.18) }} />;
              })}
            </div>
            <div style={{ position: 'absolute', left: 36 * u, right: 36 * u, bottom: 30 * u, display: 'flex', justifyContent: 'space-between', ...type(22 * u, 500, { mono: true }), color: L.ink3 }}>
              <span>Đúng nhịp</span><span>00:32</span>
            </div>
          </div>
        </Grow>
      </div>
    </div>
  );
};

// ───────────── B：脚本段落 + 句内选区 → 连线 → 旁注卡 ─────────────
const ContentB: React.FC<{ frame: number; at: number; c: Copy; g: Geo }> = ({ frame, at, c, g }) => {
  const u = g.u;
  const sel = ramp(frame, at + 20, 12, EASE.swift); // 文中那句的选区扫入
  const wire = ramp(frame, at + 30, 12, EASE.swift); // 选区 → 旁注卡的连线
  const textW = g.P ? CW : 1040; // 横屏右侧留给旁注卡（x ≥ 1120）
  const lines = c.lines.slice(0, 4);
  const hl = Math.min(2, lines.length - 1); // 第 3 句（或最后一句）带选区
  // 优先每句一行（像原版：字号最多缩到 80%）；放不下再每句折 ≤2 行，全段统一字号
  const base = 58 * (g.P ? 1.45 : 1);
  const one = Math.min(...lines.map((l) => fitSize(l, { family: c.sans, size: base, maxWidth: textW, weight: 450, minSize: 1 })));
  const single = one >= base * 0.8;
  const headH = (40 + 22 * 1.4 + 22) * u;
  // 折行模式：段落总高（行数 × 1.5 字号）须落在页脚之上（竖屏另留旁注卡 ~520u）
  const maxTextH = g.footerY - g.contentTop - headH - 40 - (g.P ? 520 * u : 0);
  let size = Math.floor(one);
  if (!single) {
    size = Math.min(...lines.map((l) => fitBlock(l, c.sans, base, textW, 450, 2, 0.6).size));
    for (let k = 0; k < 8; k++) {
      const n = lines.reduce((a, l) => a + wrapLines(l, c.sans, size, textW, 450, 2).length, 0);
      if (n * size * 1.5 <= maxTextH) break;
      size = Math.floor(size * 0.92);
    }
  }
  const vis = lines.map((l, i) => ({ i, rows: single ? [l] : wrapLines(l, c.sans, size, textW, 450, 2) }));
  const lh = size * 1.5;
  let row = 0;
  let hlEndX = 0, hlY = 0;
  const rows = vis.flatMap(({ i, rows: rs }) => rs.map((r, k) => {
    const y = row * lh;
    const node = { i, k, text: r, y, idx: row };
    row++;
    if (i === hl) { hlEndX = Math.max(hlEndX, k === rs.length - 1 ? measureText(r, c.sans, size, 450) : hlEndX); hlY = y; }
    return node;
  }));
  const textH = row * lh;
  // 旁注卡
  const cardW = g.P ? CW : 560;
  const N = fitBlock(c.note, c.sans, 40 * u, cardW - 72 * u, 650, 3, 0.7);
  const cardX = g.P ? 0 : 1120;
  const cardY = g.P ? headH + textH + 140 : -40;
  // 连线：横屏 = 选区右缘水平拐到卡左缘；竖屏 = 选区末端向下接卡顶
  const wx0 = Math.min(hlEndX + 14, g.P ? CW - 40 : 1080);
  const wy0 = headH + hlY + lh * 0.55;
  const path = g.P ? `M ${wx0} ${wy0 + lh * 0.35} L ${wx0} ${cardY - 6}` : `M ${wx0} ${wy0} L ${cardX - 8} ${wy0}`;
  return (
    <div style={{ position: 'absolute', left: MARGIN, top: g.contentTop, width: CW }}>
      <Grow frame={frame} at={at + 6} dur={18}>
        <div style={{ height: 1.5, background: alpha(L.ink, 0.85) }} />
      </Grow>
      <Grow frame={frame} at={at + 8} style={{ marginTop: 40 * u }}>
        <div style={{ ...type(22 * u, 700, { caps: true, mono: true }), letterSpacing: '0.14em', color: L.ink3, whiteSpace: 'nowrap' }}>
          Kịch bản <span style={{ color: L.accent }}>·</span> Bản nháp 4
        </div>
      </Grow>
      <div style={{ position: 'absolute', left: 0, top: headH, width: CW }}>
        {rows.map((r) => (
          <div key={r.idx} style={{ position: 'absolute', left: 0, top: r.y, width: CW }}>
            <Grow frame={frame} at={at + 10 + r.idx * 2}>
              <div style={{ ...type(size, 450), lineHeight: 1.5, color: r.i === hl ? L.ink : r.i === lines.length - 1 && r.i !== hl ? L.ink3 : L.ink2, whiteSpace: 'nowrap' }}>
                {r.i === hl ? (
                  <span style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: -6, top: size * 0.14, bottom: size * 0.07, width: `calc(${(sel * 100).toFixed(2)}% + 12px)`, background: SEL, borderRadius: 5 }} />
                    <span style={{ position: 'relative' }}>{r.text}</span>
                  </span>
                ) : r.text}
              </div>
            </Grow>
          </div>
        ))}
      </div>
      {/* 连线：从选区右缘拐到旁注卡 */}
      <svg width={CW} height={Math.max(400, cardY + 10)} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
        <path d={path} stroke={L.accent} strokeWidth={2.5 * (g.P ? 1.4 : 1)} fill="none" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - wire} />
        {wire > 0.02 && <circle cx={wx0} cy={g.P ? wy0 + lh * 0.35 : wy0} r={6 * u} fill={L.accent} />}
      </svg>
      {/* 旁注卡 */}
      <div style={{ position: 'absolute', left: cardX, top: cardY + (g.P ? 0 : headH + 40), width: cardW }}>
        <Grow frame={frame} at={at + 38} dur={22}>
          <div style={{ ...cardStyle(cardW, 'auto', u), padding: `${32 * u}px ${36 * u}px ${30 * u}px` }}>
            <Tag label="Ghi chú · 2 mục" u={u} />
            <div style={{ ...type(N.size, 650), color: L.ink, marginTop: 22 * u, lineHeight: 1.2 }}>
              {N.lines.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap' }}>{l}</div>)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 * u, marginTop: 28 * u }}>
              {[['ví dụ thực tế', '3 ý'], ['số liệu đi kèm', '2 ý']].map(([a, b]) => (
                <div key={a} style={{ display: 'flex', justifyContent: 'space-between', padding: `${14 * u}px ${18 * u}px`, borderRadius: 12 * u, background: L.surface2, ...type(26 * u, 500, { mono: true }), color: L.ink2 }}>
                  <span>{a}</span><span style={{ color: L.accent }}>{b}</span>
                </div>
              ))}
            </div>
          </div>
        </Grow>
      </div>
    </div>
  );
};

// 页脚：发丝线 + 纹理级 mono 小字（两节共用，给海报一个底边）
const Footer: React.FC<{ frame: number; g: Geo; brand: string }> = ({ frame, g, brand }) => {
  const p = ramp(frame, 54, 26, EASE.out);
  return (
    <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top: g.footerY, opacity: p }}>
      <div style={{ height: 1, background: L.line, transformOrigin: 'left', transform: `scaleX(${p.toFixed(4)})` }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 * g.u, ...type(22 * g.u, 500, { mono: true }), letterSpacing: '0.06em', color: L.ink3 }}>
        <span>{brand ? `${brand} / ` : ''}ghi chú</span><span>Đã lưu · vừa xong</span>
      </div>
    </div>
  );
};

// ───────────── 标题：显影 → (选区) → 降格 ─────────────
const Title: React.FC<{
  frame: number; word: string; num: string; reveal: number; demote: number; select?: { on: number; off: number };
  retire?: number; // 被下一节顶上去的时刻（变"上一节"）
  g: Geo; sans: string;
}> = ({ frame, word, num, reveal, demote, select, retire, g, sans }) => {
  const u = g.u;
  const SLOT = { x: MARGIN + 96 * u, y: g.slotY }; // 标签槽（左中锚点）；前面留给「01 /」
  // 标题字号：整词（含句点）放进一行；降格后的标签字号固定 ≈ g.label
  const hero = fitSize(`${word}.`, { family: sans, size: g.hero, maxWidth: CW - 60, weight: 850, minSize: 90, letterSpacingEm: -0.055 });
  const labelScale = Math.min(0.45, g.label / hero);
  const demAt = (f: number) => ramp(f, demote, 26, DEMOTE_EASE);
  const dem = demAt(frame);
  const v = demAt(frame + 0.5) - demAt(frame - 0.5);
  const hold = ramp(frame, reveal + 14, demote - reveal - 14, EASE.linear);
  const scale = mix(1 + 0.015 * hold, labelScale, dem);
  const x = mix(960, SLOT.x, dem);
  const y = mix(g.SH / 2, SLOT.y, dem);
  // 退位：上移一行、变小、变灰
  const ret = retire !== undefined ? ramp(frame, retire, 16, EASE.swift) : 0;
  const ry = -68 * u * ret;
  const rs = 1 - 0.3 * ret;
  if (frame < reveal) return null;

  // 眉题：字距由宽收紧（显影），起飞后 6f 淡出
  const eyebrowIn = ramp(frame, reveal, 16, EASE.out);
  const eyebrowOut = ramp(frame, demote, 6, EASE.exit);
  // 选区（B 式）
  let selL = 0, selW = 0, caret = 0;
  if (select) {
    const on = ramp(frame, select.on, 10, EASE.swift);
    const off = ramp(frame, select.off, 8, EASE.exit);
    selL = off * 100;
    selW = Math.max(0, on * 100 - selL);
    caret = frame >= select.on && frame < select.off + 6 ? 1 - off : 0;
  }
  // 「01 /」在落位前 4f 从左擦入
  const numIn = ramp(frame, demote + 20, 12, EASE.out);
  const ink = ret > 0 ? `rgb(${[23, 19, 15].map((c, k) => Math.round(mix(c, [155, 145, 132][k], ret))).join(',')})` : L.ink;

  return (
    <>
      {/* 落位后的「01 /」 */}
      <div style={{
        position: 'absolute', left: MARGIN, top: SLOT.y + ry, transform: `translateY(-50%) scale(${rs})`, transformOrigin: 'left center',
        ...type(30 * u, 700, { mono: true }), color: ret > 0.5 ? L.ink3 : L.accent, whiteSpace: 'nowrap',
        clipPath: `inset(-10px ${((1 - numIn) * 100).toFixed(1)}% -10px 0)`, opacity: numIn,
      }}>
        {num} <span style={{ color: L.ink3 }}>/</span>
      </div>
      <SpeedBlur vx={v * (SLOT.x - 960)} vy={v * (SLOT.y - g.SH / 2)} amount={0.2} max={12}>
        <div style={{
          position: 'absolute', left: x - (SLOT.x - MARGIN) * (1 - rs), top: y + ry,
          transform: `translate(${(-(1 - dem) * 50).toFixed(3)}%, -50%) scale(${(scale * rs).toFixed(4)})`,
          transformOrigin: 'left center', whiteSpace: 'nowrap',
        }}>
          {/* 眉题 */}
          <div style={{
            position: 'absolute', left: 14, top: -46 * (hero / 220) - 10, ...type(30 * (g.P ? 1.25 : 1), 700, { caps: true, mono: true }),
            letterSpacing: `${(0.3 - 0.12 * eyebrowIn).toFixed(3)}em`, color: L.accent,
            opacity: eyebrowIn * (1 - eyebrowOut), whiteSpace: 'nowrap',
          }}>
            Phần {num}
          </div>
          <div style={{ position: 'relative', ...type(hero, 850), lineHeight: 1.12, letterSpacing: '-0.055em', color: ink, padding: '0 14px' }}>
            {selW > 0 && (
              <div style={{ position: 'absolute', left: `${selL}%`, width: `${selW}%`, top: '8%', bottom: '2%', background: SEL, borderRadius: 6 }} />
            )}
            {caret > 0 && (
              <div style={{ position: 'absolute', left: `calc(${(selL + selW).toFixed(2)}% - 2px)`, top: '4%', bottom: '-2%', width: 5, borderRadius: 3, background: L.accent, opacity: caret }} />
            )}
            <span style={{ position: 'relative' }}>
              <TextReveal text={word.normalize('NFC')} start={reveal} by="char" variant="rise" each={16} gap={Math.min(1.6, 14 / Math.max(1, word.length))} />
              <span style={{ color: ret > 0.5 ? L.ink3 : L.accent, display: 'inline-block', transform: `scale(${ramp(frame, reveal + 10, 14, EASE.overshoot).toFixed(3)})`, transformOrigin: '50% 85%' }}>.</span>
            </span>
          </div>
        </div>
      </SpeedBlur>
    </>
  );
};

const strip = (t: string) => t.trim().replace(/[.。!！?？]+$/, '');

export const TitleDemoteToLabel: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const g = geoOf(SH);
  const fonts = useShotFonts();
  const brand = useBrand();
  const c: Copy = {
    title1: strip(useText('title1', 'Ý tưởng')),
    lead: useText('lead', 'Chọn một vấn đề.'),
    lead2: useText('lead2', 'Mỗi vấn đề đi kèm một lời giải.'),
    point1: useText('point1', 'Bắt đầu từ khách hàng'),
    point1Note: useText('point1_note', 'Hỏi đúng câu hỏi trước khi làm bất cứ thứ gì.'),
    quote: useText('quote', 'Ý tưởng hay nhất đến từ người dùng thật.'),
    point2: useText('point2', 'Thử nhanh, sửa nhanh'),
    title2: strip(useText('title2', 'Thực hiện')),
    lines: useList('lines', ['Bản kế hoạch mở đầu bằng mục tiêu rõ ràng,', 'đi qua từng con số và quan trọng nhất,', 'mỗi việc đều có người chịu trách nhiệm.', 'Báo cáo và tổng kết để cuối cùng.']),
    note: useText('note', 'Mỗi dòng kế hoạch thành một việc cụ thể.'),
    sans: fonts.sans,
    serif: fonts.serif,
    brand: brand?.name || '',
  };
  // A 内容退场
  const outA = ramp(frame, B0, 12, EASE.exit);
  // [Agent Edit] nen anh AI (Stage tu bo gradient): chu nam thang tren anh -> bong sang nhe de doc ro
  const bd = useBackdrop();
  return (
    <AbsoluteFill style={{ overflow: 'hidden', textShadow: bd ? '0 1px 12px rgba(255,255,255,0.7)' : undefined }}>
      <Stage look={L} keyLight={{ x: 0.3, y: 0.05 }} fill={{ x: 0.9, y: 0.95 }} />
      {/* 网格页眉：右上角品牌（视频自己的品牌）/ 页码（纹理级小字） */}
      <div style={{ position: 'absolute', right: MARGIN, top: g.headerY, display: 'flex', alignItems: 'center', gap: 40 * g.u, ...type(22 * g.u, 600, { caps: true, mono: true }), letterSpacing: '0.16em', color: L.ink3, opacity: ramp(frame, 40, 20, EASE.out) }}>
        {brand ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 * g.u, textTransform: 'none', letterSpacing: '0.04em', fontFamily: BRAND.font }}><ShotcraftMark size={28 * g.u} tone="light" />{BRAND.name}</span> : null}
        <span style={{ color: L.ink }}>{frame < 190 ? '01' : '02'} / 02</span>
      </div>
      {frame < B0 + 14 && (
        <div style={{ position: 'absolute', inset: 0, opacity: 1 - outA, transform: `translateY(${(-50 * outA).toFixed(2)}px)` }}>
          <ContentA frame={frame} at={48} c={c} g={g} />
        </div>
      )}
      {frame >= B0 + 40 && <ContentB frame={frame} at={178} c={c} g={g} />}
      <Footer frame={frame} g={g} brand={c.brand} />
      <Title frame={frame} word={c.title1} num="01" reveal={0} demote={36} retire={B0 + 54} g={g} sans={fonts.sans} />
      <Title frame={frame} word={c.title2} num="02" reveal={B0 + 6} demote={166} select={{ on: 136, off: 156 }} g={g} sans={fonts.sans} />
    </AbsoluteFill>
  );
};
