// research-card-stack-scroll — Research Stack 论文卡叠压滚流（motion-lab 定稿转原生 Remotion）
// 深色论文卡沿微微向右下的轴线连续飞入并叠压在中心：入场是 translateY(-40)+scale 0.94→1
// 的 6 帧短促 spring，落位带 1 帧压缩；只有最上一张全清晰渲染标题+作者+摘要，
// 下方卡按 depth 递增 blur/变暗只露顶部标题条，背景浅灰横向 grid 同步移动做速度参照。
// 设计坐标 480×270（DesignStage 等比放大），参数表数值以此坐标系标定。
//
// [Agent Edit] o chu: items (tieu de tai lieu, 5-11 the — 已知坑: 12f/the thi <= 11 the moi co khung cuoi sach),
// details (dong phu cua the dang doc, tuy chon), kicker (nhan nho phia tren chong + bo dem "n / N", tuy chon).
// Nhip PER = 120/(N-1) kep [12, 20] khung: the cuoi luon roi ~120f; sau khi the cuoi roi, dong chay (troi xuong,
// luoi nen) DUNG lai -> khung cuoi tinh, the tren cung ro net. Chu tieng Viet tu xuong dong (<= 2 dong ngang, 3 dong doc),
// the cao theo so dong that.
// Khung doc (portrait.mode = 'native'): DesignStage cao theo khung that (480 x height/4), the phong 1.5x, chu to hon.
import React from 'react';
import { useCurrentFrame, useList, useShotFonts, useText, useVideoConfig, wrapLines, fitSize } from '../../../runtime';
import { DesignStage, E, lerp, rand, seg } from '../../../fixtures/Motion';
import { BRAND } from '../../../fixtures/Brand';

export const RESEARCH_CARD_STACK_SCROLL_DURATION = 144; // 4800ms @30fps

const ORANGE_SOFT = '#FF8A44';
const INK = '#1A1A1A';

const GAP = 30; // 叠压后每张卡的下移间距
const XOFF = 9; // 滚流时的右移量

const SAMPLE = [
  'Báo cáo thị trường thương mại điện tử Việt Nam 2024',
  'Hành vi mua sắm của người dùng Gen Z trên mạng xã hội',
  'Chi phí quảng cáo giảm 41% nhờ tối ưu bằng AI',
  'Mười sai lầm phổ biến khi khởi nghiệp kinh doanh online',
  'Xu hướng thanh toán không tiền mặt tại Đông Nam Á',
  'Cách giữ chân khách hàng cũ hiệu quả hơn tìm khách mới',
  'Phân tích 500 chiến dịch TikTok bán hàng thành công',
  'Tác động của trí tuệ nhân tạo tới thị trường việc làm',
  'Quy trình chăm sóc khách hàng của các thương hiệu lớn',
  'Dữ liệu người dùng và bài toán quyền riêng tư',
  'Chiến lược giá cho sản phẩm mới ra mắt',
];

export const ResearchCardStackScroll: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const items = useList('items', SAMPLE).slice(0, 11);
  const details = useList('details', []);
  const kicker = useText('kicker', 'Đang đọc tài liệu');
  const N = Math.max(1, items.length);
  const PER = N > 1 ? Math.min(20, Math.max(12, 120 / (N - 1))) : 12; // 每张卡的节拍（帧）
  const lastCue = (N - 1) * PER;
  // 流动时钟：末张落定后停住（定格结尾，见已知坑）
  const f = Math.min(frame, lastCue);

  // 设计坐标：宽 480，高随舞台（竖版更高）
  const DW = 480;
  const DH = (480 * SH) / 1920;
  // 逻辑画布 → 设计坐标的缩放：横版沿用原值；竖版放大 1.5
  const S = portrait ? 1.5 : Math.min(480 / 420, 270 / 250);
  const CW = portrait ? 300 : 296;
  const TS = portrait ? 15 : 9.5; // 标题字号（逻辑 px）
  const TW = CW - 32;
  const maxL = portrait ? 3 : 2;
  const fam = fonts.sans;
  // 标题折行：每张卡按字体实测（设计坐标 ×4 = 舞台像素，测量在舞台尺度做，避免小字号取整误差）
  const K4 = 4 * S;
  const cards = items.map((tt) => {
    let lines = wrapLines(tt, fam, TS * K4, TW * K4, 650, maxL);
    const size = Math.min(TS, ...lines.map((l) => fitSize(l, { family: fam, size: TS * K4, maxWidth: TW * K4, weight: 650, minSize: TS * K4 * 0.7 }) / K4));
    if (size < TS) lines = wrapLines(tt, fam, size * K4, TW * K4, 650, maxL);
    return { lines, size };
  });
  const tLines = Math.max(...cards.map((c) => c.lines.length));
  const tLH = TS * 1.35;
  const bodyTop = 11 + tLines * tLH + 6;
  const BODY_LINES = portrait ? 3 : 4;
  const metaSize = portrait ? 10.5 : 8;
  const CH = Math.max(96, Math.round(bodyTop + metaSize + 9 + BODY_LINES * 9 + 8));
  const focus = Math.min(N - 1, Math.floor(f / PER)); // 只有最上一张卡渲染正文
  const landed = Math.min(N, Math.floor((frame + 0.0001) / PER) + 1);
  // 栈中心（设计坐标）：竖版略偏上，给下方漂移留空间
  // 竖版：页头 + 卡堆（含向下漂移的厚度）整体垂直居中
  const stackDown = (CH / 2 - 14 + Math.min(N - 1, 3.2) * GAP + 16) * S;
  const headUp = (CH / 2 + 14 + 40) * S + 18 + 112;
  const cy = portrait ? DH / 2 + (headUp - stackDown) / 2 : DH / 2;
  const kickY = cy - (CH / 2 + 14 + 40) * S - (portrait ? 18 : 6);
  // 眉题字号：按可用宽度缩到一行（横版右侧留给 "n / N"）
  const kBase = portrait ? 14 : 7.5;
  const kAvail = CW * S - (portrait ? 16 : 40);
  const kSize = kicker ? fitSize(kicker.toUpperCase(), { family: fam, size: kBase * 4, maxWidth: kAvail * 4, weight: 600, letterSpacingEm: 0.12, minSize: kBase * 4 * 0.55 }) / 4 : kBase;

  return (
    <DesignStage bg="#FAFAFA" w={DW} h={DH}>
      {/* 背景横向 grid：随滚流同步下移做速度参照（末张落定后与卡堆一起停） */}
      <div
        style={{
          position: 'absolute',
          inset: -40,
          backgroundImage: 'linear-gradient(rgba(0,0,0,.055) 1px,transparent 1px)',
          backgroundSize: '100% 24px',
          transform: `translateY(${((f / PER) * GAP * S) % 24}px)`,
        }}
      />
      {portrait ? (
        // 竖版页头：大号计数（每落一张跳一格、轻弹）+ 眉题，填满上方空间
        <div style={{ position: 'absolute', left: DW / 2 - (CW / 2) * S, width: CW * S, top: kickY - 112, opacity: seg(frame, 0, 8, E.outCubic) }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontFamily: fam, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
            <span style={{ fontSize: 76, fontWeight: 700, color: INK, letterSpacing: '-0.04em', display: 'inline-block', transformOrigin: '0 80%', transform: `scale(${(1 + 0.06 * (1 - seg(frame - (landed - 1) * PER, 0, 6, E.outCubic))).toFixed(4)})` }}>
              {String(landed).padStart(2, '0')}
            </span>
            <span style={{ fontSize: 30, fontWeight: 500, color: '#9a9a9a' }}>/ {String(N).padStart(2, '0')}</span>
          </div>
          {kicker ? (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 7, fontFamily: fam, fontSize: kSize, fontWeight: 600, letterSpacing: '0.12em', color: '#3a3a3a', lineHeight: 1.35, whiteSpace: 'nowrap' }}>
              <span style={{ width: 7, height: 7, flex: 'none', borderRadius: 4, background: BRAND.amber, display: 'inline-block', opacity: 0.55 + 0.45 * Math.abs(Math.sin(frame / 6)) }} />
              {kicker.toUpperCase()}
            </div>
          ) : null}
        </div>
      ) : kicker ? (
        <div style={{
          position: 'absolute', left: DW / 2 - (CW / 2) * S, width: CW * S, top: kickY, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          fontFamily: fam, fontSize: kSize, lineHeight: 1.35, color: '#3a3a3a', fontWeight: 600, letterSpacing: '0.12em', whiteSpace: 'nowrap',
          opacity: seg(frame, 0, 8, E.outCubic),
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 4.5, height: 4.5, borderRadius: 4, background: BRAND.amber, display: 'inline-block', opacity: 0.55 + 0.45 * Math.abs(Math.sin(frame / 6)) }} />
            {kicker.toUpperCase()}
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums', color: '#7a7a7a', letterSpacing: '0.04em', fontSize: 7.5 }}>
            {String(landed).padStart(2, '0')} / {String(N).padStart(2, '0')}
          </span>
        </div>
      ) : null}
      {/* 逻辑画布 track：中心锚点 + 等比缩放 */}
      <div style={{ position: 'absolute', left: DW / 2, top: cy, width: 0, height: 0, transformOrigin: '0 0', transform: `scale(${S})` }}>
        {cards.map((c, i) => {
          const e = frame - i * PER; // 该卡的本地帧（入场 / 落位压缩用真实帧）
          const eFlow = f - i * PER; // 流动（漂移/深度）用定格时钟
          const p = seg(Math.max(0, Math.min(1, (e + 6) / 6)), 0, 1, E.outCubic); // 6 帧入场
          const drift = (Math.max(0, eFlow) / PER) * GAP; // 叠压后随流下移
          const squash = e >= 0 && e < 1.6 ? 0.97 : 1; // 落位 1 帧压缩
          const y = lerp(p, -40, 0) + drift;
          const x = (Math.max(0, eFlow) / PER) * XOFF;
          const depth = Math.min(1, drift / (GAP * 3)); // depth 递增 blur + 变暗
          const opacity = e < -6 ? 0 : Math.min(1, (e + 6) / 2) * (1 - Math.max(0, (drift - GAP * 3.2) / (GAP * 1.6)));
          if (opacity <= 0) return null;
          const det = (details[i] || '').trim() || `Tài liệu ${String(i + 1).padStart(2, '0')} · ${12 + ((i * 7) % 30)} trang`;
          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: -CW / 2, top: -CH / 2 - 14, width: CW, height: CH,
                background: INK, borderRadius: 11, overflow: 'hidden', fontFamily: fam, zIndex: i, opacity,
                boxShadow: '0 14px 34px rgba(0,0,0,.22)', border: '1px solid #2A2A2A', boxSizing: 'border-box',
                transform: `translate(${x}px,${y}px) scale(${lerp(p, 0.94, 1)},${lerp(p, 0.94, 1) * squash})`,
                filter: depth > 0.001 ? `blur(${(depth * 4).toFixed(2)}px) brightness(${(1 - depth * 0.25).toFixed(3)})` : undefined,
              }}
            >
              {/* 左侧色条：每 4 张一根强调色 */}
              <div style={{ position: 'absolute', left: 0, top: 0, width: 3, height: '100%', background: i % 4 === 1 ? BRAND.amber : '#2E2E2E' }} />
              {/* 标题条：所有卡都渲染 */}
              <div style={{ position: 'absolute', left: 14, top: 11, width: TW + 4 }}>
                {c.lines.map((l, k) => (
                  <div key={k} style={{ fontFamily: fam, fontWeight: 650, fontSize: c.size, lineHeight: `${tLH}px`, color: '#F0F0F0', whiteSpace: 'nowrap' }}>{l}</div>
                ))}
              </div>
              {/* 正文（来源行 + 摘要骨架线）：只有 focus 卡可见 */}
              <div style={{ position: 'absolute', left: 14, top: bodyTop, width: TW + 2, opacity: i === focus ? 1 : 0 }}>
                <div style={{ fontFamily: fam, fontWeight: 500, fontSize: metaSize, lineHeight: 1.3, color: ORANGE_SOFT, letterSpacing: '.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {det}
                </div>
                {Array.from({ length: BODY_LINES }, (_, k) => (
                  <div key={k} style={{ marginTop: k ? 5 : 7, width: `${100 - k * 11 - rand(i * 5 + k) * 12}%`, height: 4, borderRadius: 2, background: '#3A3A3A' }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </DesignStage>
  );
};
