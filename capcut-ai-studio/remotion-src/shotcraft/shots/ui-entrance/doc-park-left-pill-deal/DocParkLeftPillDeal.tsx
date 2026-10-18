// doc-park-left-pill-deal — Doc Park 文档靠左 + 结论慢发牌（motion-lab 定稿转原生 Remotion）
// 扫描结束文档不淡出，而是向左滑出只露约 35% 宽并微缩到 0.92；右侧按旁白节奏
// 慢速发牌三张白底描边药丸（outBack 弹入），每张落定后其下方走逐词加深字幕、
// 下一张到来前整句淡出；左侧文档全程做极缓慢自动滚动保持"正在被读"。
// 设计坐标 480×270（DesignStage 等比放大），440×240 定尺画布居中排版。
// 质感层（改版）：文档从骨架条换成出版级正文（标题 / 元信息 / 分节正文），
// 自动滚动改为连续匀速（原取模写法每 1/3 片长整页回跳 40px）；每张药丸落定时，文档里对应的
// 依据句被荧光笔划出，并有一条强调色细线从该句连到药丸（"结论从文档里长出来"），随字幕退场；
// 药丸换成受光白面 + 发丝线 + 两层软阴影 + 强调色图标底；柔光浅底 + 颗粒。
//
// [Agent Edit] o chu: items (2-3 ket luan tren vien thuoc), captions (cau giai thich chay duoi moi vien), evidence (cau
// "bang chung" trong tai lieu duoc to sang + noi day toi vien; trong -> dung caption), scores (con so nho cuoi vien, tuy
// chon), doc_title (tieu de tai lieu). Chu con lai trong tai lieu = van ban trung tinh tieng Viet (chi la nen "dang doc").
// Nhan / cau dai: co chu tu thu nho, caption tu xuong toi da 2 dong (nhip dam dan tung tu giu nguyen).
// Khung doc (native): tai lieu "do" len phia tren (thu 0.92) thay vi sang trai, vien thuoc to + xep doc ben duoi;
// nhip phat bai T0 / park / lam dam / tu cuon giu nguyen.
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { DesignStage, E, lerp, seg, useT } from '../../../fixtures/Motion';
import { Backdrop, EASE, FONT, softShadow } from '../../../fixtures/Polish';
import { LOOKS, alpha } from '../../../fixtures/Look';
import { useList, useShotFonts, useText, useVideoConfig, fitSize, wrapLines, useShot } from '../../../runtime';

// [Agent Edit] o chu TUY CHON: app da gui noi dung (co texts) ma bo trong o nay -> '' (an di), khong hien chu mau
const useOptText = (id: string, sample: string): string => {
  const d = useShot();
  const v = useText(id, sample);
  const t = d?.texts[id];
  const app = !!d && Object.keys(d.texts).length > 0;
  return app && (t === undefined || (typeof t === 'string' && !t.trim())) ? '' : v;
};
const useOptList = (id: string, samples: string[]): string[] => {
  const d = useShot();
  const v = useList(id, samples);
  const t = d?.texts[id];
  const app = !!d && Object.keys(d.texts).length > 0;
  return app && (t === undefined || (Array.isArray(t) ? !t.length : !String(t).trim())) ? [] : v;
};


export const DOC_PARK_LEFT_PILL_DEAL_DURATION = 174; // 5800ms @30fps

// ---- 本卡共享量（浅灰瑞士极简系配色，与 Phase 0 fixture 令牌协调） ----
const TXT = '#17181c'; // 正文近黑（带冷调）
const DIM = '#c4c6cc'; // 浅灰占位字
const INK2 = '#5d5f66';
const INK3 = '#9b9da3';
const LINE = 'rgba(20,22,28,0.09)'; // 发丝描边

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const h2r = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// 颜色插值：mix(p,'#C9C9CE','#111')
const mix = (p: number, a: string, b: string) => {
  const A = h2r(a), B = h2r(b), q = clamp01(p);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * q)},${Math.round(A[1] + (B[1] - A[1]) * q)},${Math.round(A[2] + (B[2] - A[2]) * q)})`;
};
const darker = (hex: string) => {
  const [r, g, b] = h2r(hex);
  return `#${[r, g, b].map((v) => Math.round(v * 0.55).toString(16).padStart(2, '0')).join('')}`;
};

// 简易线性占位图标（纯 SVG，零依赖），强调色描边：看 / 对勾 / 星芒
type IconK = 'eye' | 'check' | 'sting';
const Icon: React.FC<{ k: IconK; size: number; color: string }> = ({ k, size, color }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth={1.35} strokeLinecap="round" strokeLinejoin="round">
    {k === 'eye' && (
      <>
        <path d="M1.8 8c1.6-3 3.7-4.4 6.2-4.4S12.6 5 14.2 8c-1.6 3-3.7 4.4-6.2 4.4S3.4 11 1.8 8Z" />
        <circle cx={8} cy={8} r={1.8} />
      </>
    )}
    {k === 'check' && (
      <>
        <rect x={2.5} y={2.5} width={11} height={11} rx={3} />
        <path d="M5.3 8.2 7.2 10l3.6-4" />
      </>
    )}
    {k === 'sting' && <path d="M8 2.2 9.3 6.7 13.8 8 9.3 9.3 8 13.8 6.7 9.3 2.2 8 6.7 6.7Z" />}
  </svg>
);
const ICONS: IconK[] = ['eye', 'check', 'sting'];

// 逐词加深字幕（本系列统一语法）：浅灰占位 → 逐词加深到黑 → 逐词淡回浅灰 → 整行归零
// innP: 入场加深进度；outP: 出场进度（>0 时覆盖颜色与整行透明）；showV: 行基础透明
// [Agent Edit] 多行：词序跨行连续编号（交错节奏按总词数算，与单行一致）
const Caption: React.FC<{
  lines: string[];
  left: number;
  top: number;
  size: number;
  showV: number;
  innP: number;
  outP: number;
  family: string;
}> = ({ lines, left, top, size, showV, innP, outP, family }) => {
  const rows = lines.map((l) => l.split(' ').filter(Boolean));
  const n = Math.max(1, rows.reduce((a, r) => a + r.length, 0));
  const st = 0.78 / n, win = st * 1.5; // 入场逐词交错
  const stw = 0.55 / n;                // 出场逐词交错
  const rowOpacity = outP > 0 ? clamp01(1 - (outP - 0.7) / 0.3) : showV;
  let idx = 0;
  return (
    <div style={{ position: 'absolute', left, top, opacity: rowOpacity }}>
      {rows.map((words, ri) => (
        <div key={ri} style={{ display: 'flex', alignItems: 'baseline', whiteSpace: 'nowrap' }}>
          {words.map((w, wi) => {
            const i = idx++;
            const q = clamp01((innP - i * st) / win);
            let color = mix(q, DIM, TXT);
            if (outP > 0) {
              const p = clamp01((outP - i * stw) / (stw * 1.4));
              color = mix(1 - p, DIM, TXT);
            }
            return (
              <span
                key={wi}
                style={{
                  font: `600 ${size}px/1.3 ${family}`,
                  color,
                  letterSpacing: (-0.03 * (1 - q)).toFixed(4) + 'em',
                  marginRight: wi === words.length - 1 ? 0 : size * 0.4,
                }}
              >
                {w}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// ---- 文档：出版级报告（内容坐标，宽 DW；横版只露右侧约 35%，行尾要铺满） ----
type Line = { y: number; kind: 'title' | 'meta' | 'h' | 'p'; text: string; mark?: number };
const docLines = (title: string, ev: string[]): Line[] => [
  { y: 17, kind: 'title', text: title },
  { y: 30, kind: 'meta', text: 'Trợ lý AI đã đọc  ·  12 trang  ·  phân tích trong 8 giây' },
  { y: 53, kind: 'h', text: 'TỔNG QUAN' },
  { y: 63, kind: 'p', text: 'Tài liệu tổng hợp ý kiến, số liệu và ghi chú từ nhiều nguồn khác nhau.' },
  { y: 73, kind: 'p', text: 'Mỗi mục được đối chiếu với dữ liệu gốc trước khi đưa ra kết luận.' },
  { y: 83, kind: 'p', text: 'Phần dưới liệt kê các điểm nổi bật được nhắc đến nhiều lần nhất.' },
  { y: 97, kind: 'h', text: 'ĐIỂM 1' },
  { y: 107, kind: 'p', text: ev[0] || '', mark: 0 },
  { y: 117, kind: 'p', text: 'Nhiều phản hồi lặp lại cùng một ý, cho thấy đây là xu hướng rõ ràng.' },
  { y: 127, kind: 'p', text: 'Số liệu tháng gần nhất xác nhận nhận định này vẫn đang đúng.' },
  { y: 141, kind: 'h', text: 'ĐIỂM 2' },
  { y: 151, kind: 'p', text: ev[1] || '', mark: ev[1] ? 1 : undefined },
  { y: 161, kind: 'p', text: 'Mức độ ảnh hưởng được đánh giá cao so với các yếu tố còn lại.' },
  { y: 171, kind: 'p', text: 'Nên ưu tiên giữ vững điểm này trong kế hoạch của quý tiếp theo.' },
  { y: 185, kind: 'h', text: 'ĐIỂM 3' },
  { y: 195, kind: 'p', text: ev[2] || '', mark: ev[2] ? 2 : undefined },
  { y: 205, kind: 'p', text: 'Đây là cơ hội cải thiện nhanh với chi phí thấp nhất trong danh sách.' },
  { y: 215, kind: 'p', text: 'Đề xuất thử nghiệm trong hai tuần rồi đo lại kết quả cụ thể.' },
  { y: 229, kind: 'h', text: 'SỐ LIỆU' },
  { y: 239, kind: 'p', text: 'Tổng cộng 1.240 phản hồi, tỉ lệ hoàn thành khảo sát đạt 68 phần trăm.' },
  { y: 249, kind: 'p', text: 'Dữ liệu được làm sạch, loại trùng lặp và chuẩn hoá theo từng nhóm.' },
  { y: 259, kind: 'p', text: 'Các con số được cập nhật tự động mỗi khi có phản hồi mới gửi về.' },
  { y: 273, kind: 'h', text: 'BƯỚC TIẾP THEO' },
  { y: 283, kind: 'p', text: 'Chia sẻ báo cáo cho cả nhóm và thống nhất ba việc cần làm ngay.' },
  { y: 293, kind: 'p', text: 'Theo dõi tiến độ hằng tuần, so sánh với mốc ban đầu của tài liệu.' },
  { y: 303, kind: 'p', text: 'Lên lịch rà soát lại toàn bộ sau một tháng triển khai thực tế.' },
];
// 自动滚动总行程（设计 px）：等于原 3 周期 × 40 的速度（≈0.7px/f），改为连续匀速、不回跳
const SCROLL = 120;

export const DocParkLeftPillDeal: React.FC = () => {
  const t = useT();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const SANS = fonts.sans;
  const P = SH > 1080 * 1.2;
  const ACCENT = LOOKS.porcelain.accent;
  const items = useList('items', ['Giao hàng nhanh', 'Giá hợp lý', 'Cần thêm size']).slice(0, 3);
  const caps = useList('captions', ['Khách khen tốc độ giao hàng', 'Mức giá được đánh giá vừa túi tiền', 'Nhiều người hỏi thêm cỡ lớn hơn']);
  const evIn = useOptList('evidence', [
    'Gần 87% khách hài lòng với thời gian nhận hàng chỉ trong hai ngày.',
    'Đa số cho rằng giá bán ngang hoặc thấp hơn các cửa hàng cùng loại.',
    'Khoảng một phần ba bình luận đề nghị bổ sung cỡ XL và XXL.',
  ]);
  const scores = useOptList('scores', ['92%', '88%', '95%']);
  const docTitle = useOptText('doc_title', 'Báo cáo phản hồi khách hàng · Quý 3') || 'Tài liệu phân tích';
  const N = Math.max(1, items.length);
  const ev = items.map((_, k) => (evIn[k] || caps[k] || items[k] || '').trim());
  const DOC = docLines(docTitle, ev);
  // 发牌起点：3 张 = 原片 [0.26, 0.48, 0.70]；2 张拉开间隔（字幕更从容）
  const T0 = N >= 3 ? [0.26, 0.48, 0.7] : N === 2 ? [0.26, 0.56] : [0.3];
  const ceOf = (k: number) => (k < N - 1 ? T0[k + 1] - 0.03 : 0.98);

  // ── 几何（设计 px）：横版 = 原片；竖版文档在上、药丸在下，整体放大 ──
  const SHd = SH / 4; // 设计坐标高（DesignStage 4×）
  const CW = 440;
  const CHc = P ? SHd : 240;
  const Z = P ? 2.0 : 1; // 药丸 / 字幕放大
  const DS = P ? 1.6 : 1; // 文档字号 / 行距放大
  const DW = P ? 400 : 250;
  const DH = P ? 400 : 190;
  const DOC_LEFT = P ? 20 : 34;
  const DOC_TOP0 = P ? (CHc - DH) / 2 : (240 - DH) / 2;
  const DOC_TOP1 = P ? 70 : DOC_TOP0;
  const PH = 34 * Z, PG = 14 * Z;
  const PW = P ? 400 : 172;
  const PX = P ? 20 : 214;
  const PY = P ? DOC_TOP1 + DH * 0.92 + 48 : 54;
  const capSize = 11 * Z;
  // do bang khoang trang thuong; tu that cach nhau 0.4em -> chua du 14%
  const capMaxW = (P ? 392 : 440 - (PX + 4) + 14) * 0.86;
  const labelMax = PW - (7 + 21 + 8 + 12) * Z - 30 * Z;
  const labelSize = Math.min(...items.map((s) => fitSize(s, { family: SANS, size: 12.5 * Z, maxWidth: labelMax, weight: 600, minSize: 7 * Z })));
  const capLines = items.map((_, k) => {
    const c = caps[k] || '';
    const ls = wrapLines(c, SANS, capSize, capMaxW, 600, 2);
    const sz = Math.min(capSize, ...ls.map((l) => fitSize(l, { family: SANS, size: capSize, maxWidth: capMaxW, weight: 600, minSize: 6 * Z })));
    return { ls, sz };
  });

  // 文档驻留：横版向左滑出只露约 35% 宽；竖版上移到顶部；两者都微缩 0.92
  const park = seg(t, 0.06, 0.24, E.inOutCubic);
  const tx = P ? 0 : lerp(park, 0, -0.55 * DW);
  const ty = P ? lerp(park, 0, DOC_TOP1 - DOC_TOP0) : 0;
  const sc = lerp(park, 1, 0.92);
  const origin = P ? '50% 0%' : '0% 50%';
  // 极缓慢自动滚动：连续匀速（不取模，避免整页回跳）
  const scrollY = -t * SCROLL;
  const toCanvas = (xd: number, yd: number) =>
    P
      ? { x: DOC_LEFT + DW / 2 + sc * (xd - DW / 2), y: DOC_TOP0 + ty + sc * yd }
      : { x: DOC_LEFT + tx + sc * xd, y: DOC_TOP0 + DH / 2 + sc * (yd - DH / 2) };

  return (
    <AbsoluteFill>
      <Backdrop tone="light" light={{ x: 0.6, y: 0.24 }} accent={ACCENT} grain={0.05} vignette={0.12} />
      <DesignStage bg="transparent" h={P ? SHd : 270}>
        {/* 页面 + 440×CH 定尺画布（居中） */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: SANS, WebkitFontSmoothing: 'antialiased' }}>
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: CW, height: CHc, margin: `${-CHc / 2}px 0 0 ${-CW / 2}px` }}>
            {/* 文档窗格：驻留 + 微缩 */}
            <div
              style={{
                position: 'absolute',
                left: DOC_LEFT,
                top: DOC_TOP0,
                width: DW,
                height: DH,
                transformOrigin: origin,
                transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${sc.toFixed(4)})`,
              }}
            >
              {/* 文档卡：白面 + 发丝线 + 内高光 + 两层软阴影 */}
              <div
                style={{
                  position: 'absolute', left: 0, top: 0, width: DW, height: DH, background: '#fff', border: `0.5px solid ${LINE}`,
                  borderRadius: 10 * (P ? 1.3 : 1), boxShadow: `inset 0 0.5px 0 rgba(255,255,255,1), ${softShadow(6, { strength: 0.7 })}`, overflow: 'hidden',
                }}
              >
                <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: 330 * DS, transform: `translateY(${scrollY.toFixed(2)}px)` }}>
                  <div style={{ position: 'absolute', left: 14 * DS, right: 14 * DS, top: 41.5 * DS, height: 0.5, background: LINE }} />
                  {DOC.map((l, i) => {
                    if (!l.text) return null;
                    const st: React.CSSProperties =
                      l.kind === 'title'
                        ? { fontSize: fitSize(l.text, { family: SANS, size: 8.6 * DS, maxWidth: DW - 30 * DS, weight: 650, minSize: 5 * DS }), fontWeight: 650, color: TXT, letterSpacing: '-0.015em' }
                        : l.kind === 'meta'
                          ? { fontSize: 5.4 * DS, fontWeight: 500, color: INK3, letterSpacing: '0.01em' }
                          : l.kind === 'h'
                            ? { fontSize: 5 * DS, fontWeight: 650, color: INK3, letterSpacing: '0.1em' }
                            : { fontSize: 6.3 * DS, fontWeight: 450, color: INK2, letterSpacing: '0' };
                    // 依据句荧光笔：对应药丸落定后自左向右划出
                    const mk = l.mark !== undefined && l.mark < N ? seg(t, T0[l.mark] + 0.06, T0[l.mark] + 0.13, EASE.out) : 0;
                    return (
                      <div key={i} style={{ position: 'absolute', left: 14 * DS, width: DW - 28 * DS, top: (l.y - 5) * DS, height: 10 * DS, lineHeight: `${10 * DS}px`, whiteSpace: 'nowrap', ...st }}>
                        {mk > 0 && (
                          <div
                            style={{
                              position: 'absolute', left: -2, top: 1.2 * DS, height: 7.6 * DS,
                              width: `calc(${(mk * 100).toFixed(1)}% + 4px)`, borderRadius: 2, background: alpha(ACCENT, 0.14),
                            }}
                          />
                        )}
                        <span style={{ position: 'relative', color: mk > 0 ? mix(mk, '#5d5f66', darker(ACCENT)) : undefined }}>{l.text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 依据连线：文档依据句右端 → 药丸，药丸落定后 draw-on，随字幕退场淡出 */}
            <svg width={CW} height={CHc} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
              {items.map((_, k) => {
                const f = T0[k];
                const ce = ceOf(k);
                const draw = seg(t, f + 0.04, f + 0.11, EASE.out);
                const fade = 1 - seg(t, ce - 0.06, ce - 0.01, EASE.out);
                if (draw <= 0 || fade <= 0) return null;
                const line = DOC.find((l) => l.mark === k);
                if (!line) return null;
                const a = toCanvas(DW - 6 * DS, line.y * DS + scrollY);
                if (P) {
                  const b = { x: PX + PW - 30 * Z, y: PY + k * (PH + PG) - 3 };
                  const my = (a.y + b.y) / 2;
                  return (
                    <g key={k} opacity={(0.9 * fade).toFixed(3)}>
                      <path
                        d={`M${a.x.toFixed(2)},${a.y.toFixed(2)} C${(a.x + 14).toFixed(2)},${my.toFixed(2)} ${b.x.toFixed(2)},${my.toFixed(2)} ${b.x.toFixed(2)},${b.y.toFixed(2)}`}
                        fill="none" stroke={ACCENT} strokeWidth={1.1} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={(1 - draw).toFixed(4)}
                      />
                      <circle cx={a.x} cy={a.y} r={2.2} fill={ACCENT} opacity={Math.min(1, draw * 3)} />
                    </g>
                  );
                }
                const b = { x: PX - 3, y: PY + k * (PH + PG) + PH / 2 };
                const mx = (a.x + b.x) / 2;
                return (
                  <g key={k} opacity={(0.9 * fade).toFixed(3)}>
                    <path
                      d={`M${a.x.toFixed(2)},${a.y.toFixed(2)} C${mx.toFixed(2)},${a.y.toFixed(2)} ${mx.toFixed(2)},${b.y.toFixed(2)} ${b.x.toFixed(2)},${b.y.toFixed(2)}`}
                      fill="none" stroke={ACCENT} strokeWidth={0.75} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={(1 - draw).toFixed(4)}
                    />
                    <circle cx={a.x} cy={a.y} r={1.6} fill={ACCENT} opacity={Math.min(1, draw * 3)} />
                  </g>
                );
              })}
            </svg>

            {/* 药丸 + 逐词字幕，按 T0 节奏慢发牌 */}
            {items.map((it, k) => {
              const f = T0[k];
              const o = seg(t, f, f + 0.035, E.outQuad);
              const b = seg(t, f, f + 0.062, E.outBack);
              // 字幕：落定 +3 帧起加深，下一张入场前淡出
              const cs = f + 0.05, ce = ceOf(k);
              const showV = seg(t, cs, cs + 0.02);
              const innP = seg(t, cs, cs + (ce - cs) * 0.7);
              const outP = seg(t, ce - 0.05, ce, E.outQuad);
              // 落定前阴影更高更虚（飞入感），落定后收成静置阴影
              const lift = lerp(clamp01(b), 14, 4);
              const score = (scores[k] || '').trim();
              return (
                <React.Fragment key={k}>
                  <div
                    style={{
                      position: 'absolute', left: PX, top: PY + k * (PH + PG), width: PW, height: PH, borderRadius: PH / 2,
                      background: 'linear-gradient(180deg, #ffffff 0%, #fbfbfa 100%)', border: `${0.5 * Z}px solid ${LINE}`, boxSizing: 'border-box',
                      boxShadow: `inset 0 0.5px 0 rgba(255,255,255,1), ${softShadow(lift * Z, { strength: 0.75 })}`,
                      display: 'flex', alignItems: 'center', gap: 8 * Z, padding: `0 ${12 * Z}px 0 ${7 * Z}px`,
                      opacity: o, transform: `translateY(${lerp(b, 14 * Z, 0).toFixed(2)}px) scale(${lerp(b, 0.94, 1).toFixed(4)})`,
                    }}
                  >
                    <div
                      style={{
                        width: 21 * Z, height: 21 * Z, borderRadius: 11 * Z, background: alpha(ACCENT, 0.1), border: `${0.5 * Z}px solid ${alpha(ACCENT, 0.16)}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
                      }}
                    >
                      <Icon k={ICONS[k % 3]} size={12 * Z} color={ACCENT} />
                    </div>
                    <div style={{ font: `600 ${labelSize}px/1.25 ${SANS}`, color: TXT, letterSpacing: '-.012em', whiteSpace: 'nowrap' }}>{it}</div>
                    <div style={{ flex: 1 }} />
                    {score ? (
                      <div style={{ font: `500 ${8 * Z}px/1 ${SANS}`, color: INK3, letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{score}</div>
                    ) : null}
                  </div>
                  <Caption
                    lines={capLines[k].ls}
                    left={PX + 4 * Z}
                    top={PY + k * (PH + PG) + PH + 7 * Z}
                    size={capLines[k].sz}
                    showV={showV}
                    innP={innP}
                    outP={outP}
                    family={SANS}
                  />
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </DesignStage>
    </AbsoluteFill>
  );
};
