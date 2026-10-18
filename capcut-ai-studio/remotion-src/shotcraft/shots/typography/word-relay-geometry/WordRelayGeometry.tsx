// word-relay-geometry — 三个利益词接力，每个词各带一套只属于它的几何：
//   Faster   —— 虚线大圆 + 刻度环减速自转，一道彗星弧沿环飞跑（"在转"＝快）
//   Tighter  —— 三实线圆依次 trim 生长（相位差 6f），长满后向中心收拢 40px 互相咬紧（"咬合"＝紧）
//   Stronger —— 无几何；金属 sheen 从左扫到右，一拍后收成纯白 + 泛光（"材质硬"＝强，结论词的升格待遇）
// 旧词缩到 0.86 并退焦淡出，新词从 1.06 去虚推近、描边先到位、填充柔边擦入。
//
// 第二轮重设计（石墨 · 电影字卡）：
// - look = graphite（近单色暗场，白为强调、香槟金只做 sheen 高光一丝暖色）。几何全是白色发丝线 + 柔光，
//   不加色——"一词一世界"靠形状说话，不靠颜色。
// - 版式：词 230px / 800 静态字库（描边不露可变字体内部交叠线），画面正中；
//   几何放大到画幅级（虚线环 r=400、三圆 r=230），字压在几何上；词下一行 40px 副句给出产品证据；
//   左上 mono 计数「01 / 03」、右上品牌标志 + 名字、底部三段进度条（label 级纹理字，不当内容读）。
// - 节奏：三拍等长推进但每拍内部「快入—稳—决绝出」：入场 14f snappy、出场 10f exit；
//   交接重叠 6f；第三拍收白后 hold 26f，镜头整体 1→1.025 极缓推进（不抖）。
//
// 时间表（30fps，共 180f）：
//   0–2     舞台光 + 虚线环起始态（0.4 倍、半透明）已在画面
//   副句：Faster / Stronger 在词下 210px，Tighter 让出三圆下沿压到 246px
//   0–22    Faster：环 0.4→1 snappy 生长、减速自转；2–16 描边入；12–30 填充擦入；18 起副句
//   52–62   Faster 出（0.86 + 退焦）
//   56–70   Tighter 入；58/64/70 三圆 trim 生长（22f）；66–84 填充；92–106 三圆收拢咬紧（swift）
//   112–122 Tighter 出
//   116–128 Stronger 入（描边）；124–148 金属 sheen 扫过；146–158 收纯白 + 泛光一次
//   158–180 hold 落定（相机极缓推进）
//
// [Agent Edit] o chu: words (dung 3 tu/cum loi ich, cung cu phap — vd "Nhanh hơn / Chặt hơn / Mạnh hơn"; tu thu 3 la ket luan,
// duoc quet anh kim) + subs (3 cau phu duoi tu, optional). Chu dai -> thu nho / xuong 2 dong (font tinh cua shot, khong
// dung Helvetica); dem dau / chan duoi o mat na tang len cho dau tieng Viet. Khung doc (native): tu to ~260px, hinh hoc
// phong 1.5 lan, ca khoi can giua; dem / thuong hieu / thanh tien do bam theo mep khung that.
import { useBackdrop, useCurrentFrame, useList, useShotFonts, useVideoConfig, fitSize, measureText } from '../../../runtime';
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE, mix, ramp } from '../../../fixtures/Polish';
import { Dust, LOOKS, Stage, TextReveal, alpha, type } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark } from '../../../fixtures/Brand';

export const WORD_RELAY_GEOMETRY_DURATION = 180; // 6000ms @30fps

const L = LOOKS.graphite;
const W = 1920;
const CX = W / 2;
const GEO = 'rgba(236,238,244,0.42)'; // 几何线：比字暗一档，层级在字之下
const GOLD = L.accent2;

type Slot = { word: string; sub: string; in0: number; out0: number | null };
const TIMES: Array<[number, number | null]> = [[2, 52], [56, 112], [116, null]];

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

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

// 一个词的进出场包络：入 14f（snappy，1.06→1 去虚）、出 10f（exit，1→0.86 退焦）
const envelope = (f: number, s: Slot) => {
  const tin = ramp(f, s.in0, 14, EASE.snappy);
  const tout = s.out0 === null ? 0 : ramp(f, s.out0, 10, EASE.exit);
  return { tin, tout, alive: f >= s.in0 - 1 && tout < 1 };
};

// ───────────── Faster：虚线环 + 刻度环 + 彗星弧 ─────────────
const FasterGeo: React.FC<{ f: number; fade: number; cy: number; G: number }> = ({ f, fade, cy, G }) => {
  const grow = ramp(f, 0, 22, EASE.snappy);
  const s = mix(0.4, 1, grow) * G;
  // 自转：入场时多转 160° 并减速（像飞轮刹住），之后匀速慢转永不停
  const spin = -90 - 160 * (1 - grow) + f * 0.9;
  const spinTicks = 40 * (1 - grow) - f * 0.35; // 刻度环反向慢转，两层相对运动读出"转速"
  const R = 400;
  const RT = 452;
  // 彗星：沿 r=400 飞跑的亮弧（头亮尾淡），角速度比环快得多
  const head = -90 + f * 7.5 - 220 * (1 - grow);
  const comet = Array.from({ length: 16 }, (_, k) => {
    const a0 = ((head - k * 4) * Math.PI) / 180;
    const a1 = ((head - (k + 1) * 4) * Math.PI) / 180;
    return { d: `M ${R * Math.cos(a0)} ${R * Math.sin(a0)} A ${R} ${R} 0 0 0 ${R * Math.cos(a1)} ${R * Math.sin(a1)}`, o: (1 - k / 16) ** 1.6 };
  });
  return (
    <g opacity={fade * mix(0.35, 1, grow)} transform={`translate(${CX} ${cy}) scale(${s})`}>
      <circle r={R} fill="none" stroke={GEO} strokeWidth={2} strokeDasharray="10 16" transform={`rotate(${spin})`} />
      <g transform={`rotate(${spinTicks})`}>
        {Array.from({ length: 120 }, (_, k) => {
          const a = (k / 120) * Math.PI * 2;
          const long = k % 10 === 0;
          const r0 = RT - (long ? 18 : 8);
          return (
            <line key={k} x1={r0 * Math.cos(a)} y1={r0 * Math.sin(a)} x2={RT * Math.cos(a)} y2={RT * Math.sin(a)}
              stroke={long ? 'rgba(236,238,244,0.55)' : 'rgba(236,238,244,0.2)'} strokeWidth={long ? 2 : 1.4} />
          );
        })}
      </g>
      <circle r={R - 58} fill="none" stroke="rgba(236,238,244,0.08)" strokeWidth={1.4} />
      <g opacity={grow} style={{ filter: `drop-shadow(0 0 10px ${alpha('#ffffff', 0.6)})` }}>
        {comet.map((c, k) => (
          <path key={k} d={c.d} fill="none" stroke="#ffffff" strokeOpacity={c.o} strokeWidth={4 - k * 0.15} strokeLinecap="round" />
        ))}
      </g>
    </g>
  );
};

// ───────────── Tighter：三圆 trim 生长 → 收拢咬紧 ─────────────
const TighterGeo: React.FC<{ f: number; fade: number; outF: number | null; cy: number; G: number }> = ({ f, fade, outF, cy, G }) => {
  const R = 218;
  const tight = ramp(f, 92, 14, EASE.swift); // 长满后向中心收拢
  const gap = mix(340, 300, tight);
  // 收拢落定时圆线一次提亮（咬合的"咔"）
  const click = Math.sin(clamp01((f - 100) / 12) * Math.PI);
  return (
    <g opacity={fade} transform={`translate(${CX} ${cy}) scale(${G})`}>
      {[-1, 0, 1].map((k, i) => {
        const grow = ramp(f, 58 + i * 6, 22, EASE.out);
        const back = outF === null ? 0 : ramp(f, outF - 4, 12, EASE.exit);
        const tr = Math.max(0, grow - back);
        const x = k * gap;
        const a = -Math.PI / 2 + tr * Math.PI * 2;
        const tip = tr > 0.001 && grow < 1 ? 1 - clamp01((grow - 0.85) / 0.15) : 0;
        return (
          <g key={k}>
            <circle cx={x} cy={0} r={R} fill="none" stroke={alpha('#ffffff', 0.4 + 0.35 * click)} strokeWidth={2.2}
              pathLength={1} strokeDasharray="1" strokeDashoffset={1 - tr} transform={`rotate(-90 ${x} 0)`} />
            {tip > 0 && (
              <circle cx={x + Math.cos(a) * R} cy={Math.sin(a) * R} r={6} fill="#ffffff" opacity={tip}
                style={{ filter: `drop-shadow(0 0 8px #ffffff) drop-shadow(0 0 22px ${alpha('#ffffff', 0.6)})` }} />
            )}
          </g>
        );
      })}
      {/* 相邻两圆的交点：收拢落定时亮起四枚铆钉光点，证明"咬住了" */}
      {[-1, 1].flatMap((k) => [-1, 1].map((sy) => {
        const h = Math.sqrt(Math.max(0, R * R - (gap / 2) ** 2));
        const on = ramp(f, 100 + (k + 1) * 1.5 + (sy + 1), 10, EASE.overshoot);
        return (
          <g key={`${k}${sy}`} transform={`translate(${(k * gap) / 2} ${sy * h}) rotate(45) scale(${on})`} opacity={clamp01(on)}>
            <rect x={-6} y={-6} width={12} height={12} fill="#ffffff" style={{ filter: `drop-shadow(0 0 10px ${alpha('#ffffff', 0.8)})` }} />
          </g>
        );
      }))}
    </g>
  );
};

// ───────────── 词组（描边 / 填充 / sheen 三层） ─────────────
const Word: React.FC<{ f: number; slot: Slot; idx: number; lines: string[]; size: number; cy: number; family: string; tsh?: string }> = ({ f, slot, idx, lines, size, cy, family, tsh }) => {
  const { tin, tout } = envelope(f, slot);
  const last = idx === 2;
  const scale = mix(1.06, 1, tin) * mix(1, 0.86, tout);
  const defocus = (1 - tin) * 10 + tout * 12;
  const fillStart = slot.in0 + 10;
  const fillp = ramp(f, fillStart, 18, EASE.swift);
  // 柔边擦入：前沿 ±7%
  const FE = 7;
  const edge = fillp * (100 + FE * 2) - FE;
  const mask = `linear-gradient(90deg, #000 ${(edge - FE).toFixed(2)}%, transparent ${(edge + FE).toFixed(2)}%)`;
  // 结论词：sheen 出现 → 扫光 → 收白
  const sh = ramp(f, 120, 10, EASE.out);
  const sweep = ramp(f, 124, 24, EASE.smooth);
  const white = ramp(f, 146, 12, EASE.out);
  const bloom = Math.sin(clamp01((f - 146) / 22) * Math.PI) * 0.9 + white * 0.35;
  const LH = lines.length > 1 ? 1.1 : 1;

  const base: React.CSSProperties = {
    fontFamily: family, fontSize: size, fontWeight: 800, letterSpacing: '-0.045em', lineHeight: LH, whiteSpace: 'nowrap', textAlign: 'center',
    // 三层共用留白：mask / background-clip 只画在盒内——上方给越南语叠加声调留 0.34em，下方给 g/y 下伸部
    padding: '0.34em 0.1em 0.28em',
  };
  const text = lines.map((l, i) => <div key={i}>{l}</div>);
  // 视觉中心：首行基线区 ≈ 原版位置，多行时整块上移半个行差
  const lift = 0.86 * size + ((lines.length - 1) * size * LH) / 2;
  return (
    <div style={{
      position: 'absolute', left: CX, top: cy, transform: `translate(-50%, ${-lift}px) scale(${scale.toFixed(4)})`, transformOrigin: `50% ${lift}px`,
      opacity: clamp01(tin * 1.6) * (1 - tout), filter: defocus > 0.05 ? `blur(${defocus.toFixed(2)}px)` : undefined,
    }}>
      <div style={{ position: 'relative' }}>
        <div style={{ ...base, color: 'transparent', WebkitTextStroke: `2px ${alpha('#e9ebf0', 0.55)}`, opacity: last ? 1 - sh * 0.85 : 1 - fillp * 0.8 }}>
          {text}
        </div>
        {last ? (
          <>
            {/* 金属底：竖向镀铬分层（亮顶—暗腰—亮底），读出"材质硬" */}
            <div style={{
              ...base, position: 'absolute', inset: 0, color: 'transparent',
              backgroundImage: 'linear-gradient(180deg, #f2f3f6 8%, #b9bdc6 40%, #4a4e57 52%, #8b909a 62%, #e1e3e8 88%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', opacity: sh * (1 - white),
            }}>{text}</div>
            {/* 扫光：一道带香槟暖色的窄白带从左扫到右（只给结论词一次，Q4） */}
            <div style={{
              ...base, position: 'absolute', inset: 0, color: 'transparent',
              backgroundImage: `linear-gradient(100deg, transparent 38%, ${alpha(GOLD, 0.7)} 45%, #ffffff 50%, ${alpha(GOLD, 0.7)} 55%, transparent 62%)`,
              backgroundSize: '300% 100%', backgroundPosition: `${mix(100, 0, sweep).toFixed(2)}% 0`,
              WebkitBackgroundClip: 'text', backgroundClip: 'text', opacity: sh * (1 - white) * (sweep > 0 && sweep < 1 ? 1 : 0),
            }}>{text}</div>
            <div style={{
              ...base, position: 'absolute', inset: 0, color: L.ink, opacity: white,
              textShadow: `0 0 ${(30 * bloom).toFixed(1)}px ${alpha('#ffffff', 0.35 * bloom)}, 0 0 ${(90 * bloom).toFixed(1)}px ${alpha('#ffffff', 0.22 * bloom)}${tsh ? ', ' + tsh : ''}`,
            }}>{text}</div>
          </>
        ) : (
          fillp > 0 && (
            <div style={{ ...base, position: 'absolute', inset: 0, color: L.ink, WebkitMaskImage: mask, maskImage: mask, textShadow: tsh }}>{text}</div>
          )
        )}
      </div>
    </div>
  );
};

export const WordRelayGeometry: React.FC = () => {
  const f = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  // nen anh AI: bo nen dac + bui sang (Stage tu bo gradient); hinh hoc + chu giu; chu tren nen them bong
  const bd = !!useBackdrop();
  const tsh = bd ? '0 2px 18px rgba(0,0,0,0.55)' : undefined;
  const words = useList('words', ['Nhanh hơn', 'Chặt hơn', 'Mạnh hơn']);
  const subs = useList('subs', ['Một câu lệnh, ra ngay video hoàn chỉnh.', 'Mọi đoạn cắt đều khớp nhịp nhạc.', 'Thành phẩm như studio chuyên nghiệp làm.']);
  const SLOTS: Slot[] = TIMES.map(([in0, out0], i) => ({ word: (words[i] ?? words[words.length - 1] ?? '').trim(), sub: (subs[i] ?? '').trim(), in0, out0 }));

  // ── 版式：竖屏词更大、几何 ×1.5、整组居中 ──
  const G = portrait ? 1.5 : 1;
  const CY = portrait ? Math.round(SH / 2 - 120) : 500; // 视觉中心略高于几何中心，给副句留位
  const WS = portrait ? 260 : 230;
  const fit = SLOTS.map((s) => fitWrap(s.word, fonts.sans, WS, portrait ? 1680 : 1640, 800, portrait ? 2 : 1, -0.045, portrait ? 0.45 : 0.55)); // 横屏优先单行（缩到 0.55 仍超宽才折两行）
  const subFS = portrait ? 62 : 40;
  const subFit = SLOTS.map((s) => (s.sub ? fitWrap(s.sub, fonts.sans, subFS, portrait ? 1640 : 1500, 450, 2, -0.02, 0.6) : { lines: [] as string[], size: subFS }));

  // 相机：全程极缓推进 1→1.025（smooth，起止无速度突变），给 hold 段一点呼吸
  const cam = mix(1, 1.025, ramp(f, 0, 180, EASE.smooth));
  const e = SLOTS.map((s) => envelope(f, s));
  const active = f < 56 ? 0 : f < 116 ? 1 : 2;
  // 结论词收白时主光一次提亮
  const flare = Math.sin(clamp01((f - 146) / 26) * Math.PI);
  const M = portrait ? 140 : 120; // 画框边距
  const lab = portrait ? 34 : 22; // 纹理字号
  const topY = portrait ? 220 : 96;
  const botY = portrait ? 240 : 96;

  return (
    <AbsoluteFill style={{ background: bd ? 'transparent' : L.bg[2] }}>
      <Stage look={L} keyLight={{ x: 0.5, y: CY / SH - 0.12 }} fill={{ x: 0.5, y: 1.05 }} intensity={0.62 + flare * 0.3} breathe={0.4}>
        {!bd && Array.from({ length: Math.ceil(SH / 1080) }, (_, i) => (
          <div key={i} style={{ position: 'absolute', left: 0, top: i * 1080, width: 1920, height: 1080 }}>
            <Dust look={L} count={26} seed={7 + i} drift={0.18} opacity={0.35} />
          </div>
        ))}
      </Stage>

      <AbsoluteFill style={{ transform: `scale(${cam.toFixed(4)})`, transformOrigin: `${CX}px ${CY}px` }}>
        <svg width={W} height={SH} viewBox={`0 0 ${W} ${SH}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {e[0].alive && <FasterGeo f={f} fade={1 - e[0].tout} cy={CY} G={G} />}
          {e[1].alive && (
            <g transform={`translate(${CX} ${CY}) scale(${mix(1.04, 1, e[1].tin) * mix(1, 0.9, e[1].tout)}) translate(${-CX} ${-CY})`}>
              <TighterGeo f={f} fade={clamp01(e[1].tin * 2) * (1 - e[1].tout)} outF={SLOTS[1].out0} cy={CY} G={G} />
            </g>
          )}
        </svg>

        {/* 结论词落定的地平线光带：脚下一道横向冷白光，只出现一次 */}
        <div style={{
          position: 'absolute', left: CX - 700 * G, width: 1400 * G, top: CY + 158 * G + ((fit[2].lines.length - 1) * fit[2].size * 1.1) / 2, height: 2,
          background: `linear-gradient(90deg, transparent, ${alpha('#ffffff', 0.7)} 50%, transparent)`,
          opacity: ramp(f, 148, 14, EASE.out) * 0.8, transform: `scaleX(${mix(0.2, 1, ramp(f, 146, 22, EASE.snappy))})`,
          boxShadow: `0 0 24px ${alpha('#ffffff', 0.4)}`,
        }} />

        {SLOTS.map((s, i) => (e[i].alive ? <Word key={i} f={f} slot={s} idx={i} lines={fit[i].lines} size={fit[i].size} cy={CY} family={fonts.sans} tsh={tsh} /> : null))}

        {/* 副句：词落定后从线下升起，随词一起退场；Tighter 让出三圆下沿 */}
        {SLOTS.map((s, i) => {
          if (!e[i].alive || !subFit[i].lines.length) return null;
          const extra = ((fit[i].lines.length - 1) * fit[i].size * 1.1) / 2;
          const top = CY + (i === 1 ? 246 * G : 210 * G) + extra;
          const sf = subFit[i];
          let wi = 0;
          return (
            <div key={`sub${i}`} style={{
              position: 'absolute', left: 0, right: 0, top, textAlign: 'center',
              ...type(sf.size, 450), lineHeight: 1.3, color: L.ink2, opacity: 1 - e[i].tout, textShadow: tsh,
              filter: e[i].tout > 0.02 ? `blur(${(e[i].tout * 6).toFixed(2)}px)` : undefined,
            }}>
              {sf.lines.map((l, li) => {
                const st = s.in0 + (i === 2 ? 34 : 16) + wi * 2.2;
                wi += l.split(' ').length;
                return (
                  <div key={li} style={{ whiteSpace: 'pre' }}>
                    <TextReveal text={l} by="word" variant="rise" start={st} each={16} gap={Math.min(2.2, 18 / Math.max(1, l.split(' ').length))} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </AbsoluteFill>

      {/* 画框装饰（不随相机）：左上计数、底部三段进度——label 级纹理字 */}
      <div style={{ position: 'absolute', left: M, top: topY, fontFamily: fonts.mono, fontSize: lab, letterSpacing: '0.18em', color: bd ? L.ink2 : L.ink3, opacity: ramp(f, 0, 14, EASE.out), textShadow: tsh }}>
        <span style={{ color: L.ink }}>{`0${active + 1}`}</span> / 03
      </div>
      {/* 右上品牌签：品牌标志 + 名字（label 级，不抢词；无品牌则不显示） */}
      {BRAND.name ? (
        <div style={{ position: 'absolute', right: M, top: topY - 6, display: 'flex', alignItems: 'center', gap: 12, fontFamily: fonts.mono, fontSize: lab, letterSpacing: '0.1em', color: bd ? L.ink2 : L.ink3, opacity: ramp(f, 4, 14, EASE.out), whiteSpace: 'nowrap', textShadow: tsh }}>
          <ShotcraftMark size={lab * 1.55} tone="dark" />
          {BRAND.name}
        </div>
      ) : null}
      <div style={{ position: 'absolute', left: M, right: M, bottom: botY, display: 'flex', gap: 24 }}>
        {SLOTS.map((s, i) => {
          const start = s.in0;
          const end = s.out0 ?? 158;
          const p = ramp(f, start, end - start, EASE.linear);
          const on = i === active;
          const label = `0${i + 1}  ${s.word.toUpperCase()}`;
          const colW = (1920 - 2 * M - 48) / 3;
          const ls = fitSize(label, { family: fonts.mono, size: lab, maxWidth: colW, weight: 400, letterSpacingEm: 0.18, minSize: lab * 0.55 });
          return (
            <div key={i} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ height: 2, background: alpha('#ffffff', 0.1), position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, background: on ? L.ink : alpha('#ffffff', 0.45), transform: `scaleX(${p})`, transformOrigin: 'left' }} />
              </div>
              <div style={{ marginTop: 16, fontFamily: fonts.mono, fontSize: ls, letterSpacing: '0.18em', color: on ? L.ink : bd ? L.ink2 : L.ink3, whiteSpace: 'pre', lineHeight: 1.4, textShadow: tsh }}>
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
