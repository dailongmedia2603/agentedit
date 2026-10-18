// word-relay-filmstrip —— 左列证据胶片步进、右侧大词原位接力（名词恒定 + 动词轮换）
//
// 第二轮重设计（石墨 · 电影感编辑部）：
// - look = graphite（近单色暗场 + 金色点缀）。左列 940×530 页面卡黑白强制相间（出版级假页面：
//   节奏报告 / 分镜脚本 / 渲染流水线 / 成片 PR 评审 / 影像查看器 / 出货表），每个动词停在对应证据上。
//   主体 = 视频里的主语（产品 / 人 / 品牌），动词 = 它做的事；每个动词停在对应的证据卡上。
// - 景深：焦点卡（中心在 y=540）全亮全尺寸，邻卡按离焦距离压暗 + 缩到 0.94 + 轻虚化，
//   胶片步进时邻卡"对焦"进来——证据的主次一眼可见。
// - 步进制保留：左列平时零位移，只在切词窗口内 18f 不对称 in-out 滚一格，快段叠纵向运动模糊。
// - 右侧衬线 140px：第一行主语（正体、次级墨）恒定，第二行动词斜体白字原位接力——
//   旧词先灰化、8f ease-in 从遮罩上沿升出（先出），新词逐字母从遮罩下沿升起（后进，1.2f 错峰）。
//   词块垂直中心 = 焦点卡中点 y=540（像素级）；一条金色引线从焦点卡右缘指向词块中线，
//   换词时收回、新证据落定后重新画出；词块下方一行证据注脚随动词同步接力。
//
// 时间表（30fps，共 180f）：
//   0–16    预备：胶片静止、Shotcraft 与引线已在，序号 00
//   16–34   第 1 格：胶片滚到「分镜脚本」，frames 逐字升起（23–45）
//   34–66   hold（胶片零位移；相机 1→1.02 极缓推）
//   66–84   第 2 格：frames 灰化升出（66–74）→ builds 升起（73–95），胶片滚到「渲染流水线」
//   84–114  hold
//   114–132 第 3 格：ships（121–141），胶片停在「成片 PR 评审」
//   141–180 hold：尾帧是一张完整的图文对位海报
//
// [Agent Edit] o chu: subject (chu ngu co dinh dong 1; trong -> ten thuong hieu) / verbs (2-3 dong tu tiep suc dong 2,
// tu them dau cham vang) / notes (chu thich bang chung duoi moi dong tu). O anh shot1..shot3 (tuy chon): anh chup man hinh /
// anh minh hoa cho tung dong tu, thay trang gia tuong ung trong cuon phim (cover, ti le bat ky). Trang gia con lai doi sang
// tieng Viet trung tinh. Co chu tu thu nho cho vua be ngang con lai; mat na chu troi co dem tren 0.32em (dau tieng Viet).
// Khung doc (native): cuon phim phong 1.7x o nua tren (the trong tam o ~40% chieu cao, the duoi mo dan), khoi chu dat duoi
// the trong tam, can trai theo mep the; duong dan vang chay doc tu day the xuong khoi chu.
import { useCurrentFrame, useVideoConfig, useText, useList, useImage, useShotFonts, fitSize } from '../../../runtime';
import React from 'react';

import { EASE, FONT, SpeedBlur, mix, ramp, velocity } from '../../../fixtures/Polish';
import { LOOKS, Stage, alpha } from '../../../fixtures/Look';
import { BRAND, ShotcraftMark, ShotcraftWordmark } from '../../../fixtures/Brand';

export const WORD_RELAY_FILMSTRIP_DURATION = 180;

const L = LOOKS.graphite;

const CARD_W = 940;
const CARD_H = 530;
const GAP = 105;
const STEP = CARD_H + GAP;


// —— 页面卡集合：黑白相间（奇偶强制交替），内容各异 ——
// 分镜脚本（亮）——第 1 个动词的证据：宣传片分镜文档
const LightArticle: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, background: '#ffffff', padding: '30px 46px', fontFamily: FONT.sans }}>
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28, paddingBottom: 16, borderBottom: '1px solid #eceae5' }}>
      <ShotcraftWordmark size={19} tone="light" markScale={1.7} gap={9} />
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 26, fontSize: 14, color: '#8a8780' }}>
        {['Cảnh quay', 'Mẫu', 'Thư viện', 'Tài liệu'].map((t, i) => <span key={t} style={{ color: i === 0 ? '#1d1c1a' : undefined, fontWeight: i === 0 ? 600 : 400 }}>{t}</span>)}
      </div>
    </div>
    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: '#c4523a', marginBottom: 12 }}>KỊCH BẢN · VIDEO RA MẮT · 42 GIÂY</div>
    <div style={{ fontFamily: FONT.serif, fontSize: 36, lineHeight: 1.18, color: '#1b1a18', width: 680, marginBottom: 20, letterSpacing: '-0.01em' }}>
      Mười hai cảnh, một câu chuyện,<br />mỗi lần cắt đều đúng nhịp
    </div>
    <div style={{ display: 'flex', gap: 30 }}>
      <div style={{ flex: 1.3, fontFamily: FONT.serif, fontSize: 15, lineHeight: 1.6, color: '#5d5a54' }}>
        Video mở đầu bằng bảng điều khiển thật, đẩy máy vào màn hình trống rồi zoom nhanh vào kết quả đầu tiên. Mỗi lần
        cắt rơi đúng phách mạnh của bản nhạc 112 BPM, mỗi chuyển động máy lấy từ một công thức cảnh đã tinh chỉnh, và logo
        đứng yên hai ô nhịp cuối trước lời kêu gọi.
      </div>
      <div style={{ flex: 1, borderRadius: 10, background: '#f7f5f0', border: '1px solid #ebe7de', padding: '16px 18px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', color: '#9a7a3a', marginBottom: 12 }}>DANH SÁCH CẢNH</div>
        {[['C01', 'Đẩy vào bảng điều khiển'], ['C02', 'Zoom nhanh'], ['C03', 'Chữ tiếp sức'], ['C04', 'Logo kết']].map(([n, l]) => (
          <div key={l} style={{ display: 'flex', gap: 12, alignItems: 'baseline', marginBottom: 9 }}>
            <span style={{ width: 56, fontSize: 15, fontWeight: 700, color: '#1d1c1a', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
            <span style={{ fontSize: 13.5, color: '#77736b' }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
    {/* 图 1：每个镜头时长的小柱图 + 图注 */}
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22, marginTop: 20, paddingTop: 14, borderTop: '1px solid #eceae5' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 48 }}>
        {[0.18, 0.24, 0.31, 0.46, 0.58, 0.72, 0.9, 1].map((v, i) => (
          <div key={i} style={{ width: 14, height: `${v * 100}%`, borderRadius: 2, background: i === 7 ? '#c4523a' : '#d9d4ca' }} />
        ))}
      </div>
      <div style={{ fontSize: 13, color: '#8a8780', lineHeight: 1.45 }}>
        <span style={{ fontWeight: 700, color: '#4a4741' }}>Hình 1</span> — Độ dài từng cảnh, khớp lưới nhịp
      </div>
      <div style={{ marginLeft: 'auto', fontSize: 13, color: '#8a8780' }}>Kịch bản v3 · 30 fps</div>
    </div>
  </div>
);

const DarkMri: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, background: '#08090b', fontFamily: FONT.sans }}>
    <div style={{ height: 46, borderBottom: '1px solid #1a1c21', display: 'flex', alignItems: 'center', gap: 14, padding: '0 24px' }}>
      <div style={{ fontSize: 15, fontWeight: 650, color: '#d4d7dc' }}>Trình xem ảnh</div>
      <div style={{ fontSize: 13, color: '#5f646e' }}>Bộ ảnh 0042 · Sản phẩm · Cận cảnh</div>
      <div style={{ marginLeft: 'auto', fontSize: 12.5, color: '#b8a24e', fontWeight: 600 }}>● 3 ghi chú</div>
    </div>
    <div style={{ display: 'flex', height: CARD_H - 46 }}>
      <div style={{ width: 190, borderRight: '1px solid #16181c', padding: '18px 18px' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em', color: '#8d7c3e', marginBottom: 12 }}>BỘ ẢNH</div>
        {['Mặt trước', 'Mặt sau', 'Cận cảnh', 'Ánh sáng', 'Chi tiết'].map((t, i) => (
          <div key={t} style={{ fontSize: 13.5, color: i === 2 ? '#e2e4e8' : '#5c616b', padding: '6px 8px', borderRadius: 6, background: i === 2 ? 'rgba(255,255,255,0.05)' : 'transparent', marginBottom: 2 }}>{t}</div>
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 290, height: 350, borderRadius: '46% 46% 42% 42%',
          background: 'radial-gradient(ellipse 46% 40% at 50% 42%, #b9bcc0 0%, #6c7076 34%, #33363c 62%, #101216 100%)',
          position: 'relative', boxShadow: '0 0 60px rgba(150,160,180,0.08)',
        }}>
          {[[118, 98], [196, 150], [92, 210]].map(([x, y], i) => (
            <div key={i} style={{ position: 'absolute', left: x, top: y, width: 14, height: 14, borderRadius: 7, border: '2px solid #d8b25a', boxShadow: '0 0 8px rgba(216,178,90,0.5)' }} />
          ))}
        </div>
      </div>
      <div style={{ width: 200, borderLeft: '1px solid #16181c', padding: '18px 18px' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em', color: '#6a6f79', marginBottom: 12 }}>GHI CHÚ</div>
        {[['A1', 'Vết xước nhỏ, 4 mm'], ['A2', 'Màu đồng đều'], ['A3', 'Đường may chuẩn']].map(([k, v]) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#d8b25a' }}>{k}</div>
            <div style={{ fontSize: 13, color: '#8a8f99', lineHeight: 1.4 }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const LightTable: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, background: '#ffffff', padding: '28px 40px', fontFamily: FONT.sans }}>
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
      <ShotcraftMark size={30} tone="light" style={{ marginRight: 12 }} />
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1d1e21', letterSpacing: '-0.01em' }}>Doanh số quý 3 theo khu vực</div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 18, fontSize: 13.5, color: '#8b9099' }}>
        <span>Xuất CSV</span><span>Bộ lọc (2)</span>
      </div>
    </div>
    <div style={{ display: 'flex', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: '#9aa0aa', padding: '0 0 8px', borderBottom: '1px solid #e6e8ec' }}>
      <span style={{ width: 40 }}>#</span><span style={{ flex: 1 }}>KHU VỰC</span>
      <span style={{ width: 110, textAlign: 'right' }}>ĐƠN</span><span style={{ width: 110, textAlign: 'right' }}>DOANH THU</span><span style={{ width: 90, textAlign: 'right' }}>CÙNG KỲ</span>
    </div>
    {[
      ['TP. Hồ Chí Minh', '48.210', '12,4 tỷ', '+18%', '#3a8a52'], ['Hà Nội', '41.977', '11,9 tỷ', '+9%', '#2c62b8'],
      ['Đà Nẵng', '39.402', '10,2 tỷ', '+4%', '#caa53c'], ['Cần Thơ', '22.816', '5,1 tỷ', '+27%', '#b23a3a'],
      ['Hải Phòng', '18.330', '4,6 tỷ', '−2%', '#3a8a52'], ['Nha Trang', '9.114', '2,3 tỷ', '+11%', '#2c62b8'],
      ['Huế', '6.702', '1,4 tỷ', '+6%', '#caa53c'],
    ].map(([name, u, r, y, c], i) => (
      <div key={name} style={{ display: 'flex', alignItems: 'center', padding: '10.5px 0', borderBottom: '1px solid #f0f1f4', fontSize: 15, color: '#2a2c30', fontVariantNumeric: 'tabular-nums' }}>
        <span style={{ width: 40, color: '#a0a5ae', fontSize: 13.5 }}>{i + 1}</span>
        <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: c }} />{name}
        </span>
        <span style={{ width: 110, textAlign: 'right' }}>{u}</span>
        <span style={{ width: 110, textAlign: 'right', fontWeight: 600 }}>{r}</span>
        <span style={{ width: 90, textAlign: 'right', color: y.startsWith('−') ? '#b8463d' : '#2e8a50', fontWeight: 600 }}>{y}</span>
      </div>
    ))}
  </div>
);

const DarkStats: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #110f14 0%, #0c0b0f 100%)', padding: '34px 46px', fontFamily: FONT.sans }}>
    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: '#b0584c', marginBottom: 8 }}>BÁO CÁO NHỊP · VIDEO RA MẮT</div>
    <div style={{ fontSize: 28, fontWeight: 700, color: '#ece8e2', letterSpacing: '-0.015em', marginBottom: 22 }}>Năng lượng chuyển động từng cảnh</div>
    <div style={{ borderLeft: '2px solid #5e2530', paddingLeft: 26 }}>
      {[['C01', 0.24, '24,7'], ['C02', 0.33, '33,5'], ['C03', 0.46, '46,2'], ['C04', 0.58, '58,0'], ['C05', 0.69, '69,4'], ['C06', 0.86, '86,1']].map(([k, w, v], i) => (
        <div key={k as string} style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
          <span style={{ width: 40, fontSize: 14, color: '#7d7983', fontWeight: 600 }}>{k}</span>
          <div style={{ width: 520, height: i === 5 ? 22 : 16, borderRadius: 4, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
            <div style={{ width: `${(w as number) * 100}%`, height: '100%', borderRadius: 4, background: i === 5 ? 'linear-gradient(90deg, #8c2f27, #d24a3a)' : '#5a5560' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: i === 5 ? '#f08a76' : '#bdb8c2', fontVariantNumeric: 'tabular-nums' }}>{v}%</span>
        </div>
      ))}
    </div>
    <div style={{ marginTop: 22, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '16px 24px', display: 'flex', gap: 54 }}>
      {[['12', 'cảnh đúng nhịp'], ['112', 'BPM nhạc nền'], ['0', 'khung hình rơi']].map(([n, l]) => (
        <div key={l}>
          <div style={{ fontSize: 22, fontWeight: 750, color: '#e8735f', fontVariantNumeric: 'tabular-nums' }}>{n}</div>
          <div style={{ fontSize: 13, color: '#77727e' }}>{l}</div>
        </div>
      ))}
    </div>
  </div>
);

// 渲染流水线（暗）——第 2 个动词的证据：宣传片从分镜到成片的构建
const DarkBuild: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #111318 0%, #0c0d11 100%)', padding: '26px 40px', fontFamily: FONT.sans }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <div style={{ fontSize: 19, fontWeight: 700, color: '#e6e8ee' }}>{BRAND.name || 'du-an'} / video-ra-mat</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#9aa1b4', padding: '3px 9px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)' }}>main</div>
      <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: '#e8b84a' }}>● Đang xuất bản #1284</div>
    </div>
    {/* 流水线步骤 */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
      {[['Kịch bản', 1], ['Cảnh quay', 1], ['Âm thanh', 1], ['Xuất', 1], ['Bàn giao', 0]].map(([t, ok], i) => (
        <React.Fragment key={t as string}>
          {i > 0 && <div style={{ flex: 1, height: 1, background: ok ? 'rgba(95,195,140,0.4)' : 'rgba(255,255,255,0.1)' }} />}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 9, fontSize: 13.5, fontWeight: 600,
            color: ok ? '#cfe9da' : '#f1d58f', background: ok ? 'rgba(95,195,140,0.09)' : 'rgba(232,184,74,0.1)',
            border: `1px solid ${ok ? 'rgba(95,195,140,0.22)' : 'rgba(232,184,74,0.3)'}`,
          }}>
            <span style={{ color: ok ? '#5fc38c' : '#e8b84a' }}>{ok ? '✓' : '◐'}</span>{t}
          </div>
        </React.Fragment>
      ))}
    </div>
    <div style={{ display: 'flex', gap: 18 }}>
      {/* 渲染日志 */}
      <div style={{ flex: 1.6, background: '#08090c', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '14px 18px', fontFamily: FONT.mono, fontSize: 13, lineHeight: 1.75, color: '#7c8293' }}>
        <div><span style={{ color: '#5f6577' }}>$</span> <span style={{ color: '#d4d8e2' }}>npx remotion render Main launch.mp4</span></div>
        <div><span style={{ color: '#5fc38c' }}>✓</span> Đóng gói 12 cảnh trong 8,3 giây</div>
        <div><span style={{ color: '#5fc38c' }}>✓</span> Đã xuất 1.260 khung · 0 rơi</div>
        <div><span style={{ color: '#5fc38c' }}>✓</span> 18 hiệu ứng âm thanh khớp nhịp</div>
        <div><span style={{ color: '#5fc38c' }}>✓</span> Mã hóa h264 · 1080p · 30 fps</div>
        <div><span style={{ color: '#e8b84a' }}>▲</span> <span style={{ color: '#c9cdd8' }}>Đang xuất bản nháp CapCut…</span></div>
      </div>
      {/* 汇总 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[['Thời lượng', '42,0 giây'], ['Khung hình', '1.260'], ['Thời gian xuất', '1 phút 42 giây']].map(([k, v]) => (
          <div key={k} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '11px 16px' }}>
            <div style={{ fontSize: 12, color: '#6c7283', fontWeight: 600, letterSpacing: '0.06em' }}>{k.toUpperCase()}</div>
            <div style={{ fontSize: 21, fontWeight: 700, color: '#e6e8ee', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// 成片 PR 评审（亮）——第 3 个动词的证据：把宣传片接进落地页的 PR
const CODE: { n: number; d?: '+' | '-'; t: [string, string][] }[] = [
  { n: 12, t: [['export function ', '#a626a4'], ['Hero', '#4078f2'], ['(props: ', '#383a42'], ['HeroProps', '#c18401'], [') {', '#383a42']] },
  { n: 13, t: [['  const ', '#a626a4'], ['film', '#383a42'], [' = ', '#0184bc'], ['staticFile', '#4078f2'], ['(', '#383a42'], ["'launch.mp4'", '#50a14f'], [');', '#383a42']] },
  { n: 14, d: '-', t: [['  return ', '#a626a4'], ['<img src={props.screenshot} alt=', '#383a42'], ['""', '#50a14f'], [' />;', '#383a42']] },
  { n: 14, d: '+', t: [['  return ', '#a626a4'], ['<video src={film} autoPlay muted loop', '#383a42']] },
  { n: 15, d: '+', t: [['    poster=', '#383a42'], ['"launch-poster.jpg"', '#50a14f'], [' />;', '#383a42']] },
  { n: 16, t: [['}', '#383a42']] },
  { n: 17, t: [['', '#383a42']] },
  { n: 18, t: [['export default ', '#a626a4'], ['Hero', '#4078f2'], [';', '#383a42']] },
];
const LightCode: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, background: '#ffffff', fontFamily: FONT.sans, display: 'flex', flexDirection: 'column' }}>
    <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '0 28px', borderBottom: '1px solid #eceef1' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#1d1e21' }}>Thêm video ra mắt vào trang chủ</div>
      <div style={{ fontSize: 13, color: '#8b9099' }}>#482 · 3 tệp · +24 −9</div>
      <div style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: '#2e8a50', padding: '4px 10px', borderRadius: 10, background: 'rgba(46,138,80,0.1)' }}>✓ Đã kiểm tra</div>
    </div>
    <div style={{ display: 'flex', flex: 1 }}>
      <div style={{ width: 200, borderRight: '1px solid #eceef1', padding: '16px 18px', fontSize: 13.5, color: '#6b7079' }}>
        {[['src/', 0], ['landing/', 1], ['Hero.tsx', 2], ['Pricing.tsx', 2], ['public/', 0], ['launch.mp4', 1], ['launch-poster.jpg', 1]].map(([t, l]) => (
          <div key={t as string} style={{
            padding: '5px 8px', paddingLeft: 8 + (l as number) * 14, borderRadius: 6, marginBottom: 1,
            background: t === 'Hero.tsx' ? '#eef2fb' : 'transparent', color: t === 'Hero.tsx' ? '#2c62c6' : undefined,
            fontWeight: t === 'Hero.tsx' ? 600 : 400,
          }}>{t}</div>
        ))}
      </div>
      <div style={{ flex: 1, padding: '14px 0', fontFamily: FONT.mono, fontSize: 14.5, lineHeight: 1.85 }}>
        <div style={{ padding: '0 20px 8px', fontSize: 12.5, color: '#8b9099', fontFamily: FONT.sans }}>src/landing/Hero.tsx</div>
        {CODE.map((r, i) => (
          <div key={i} style={{
            display: 'flex', whiteSpace: 'pre',
            background: r.d === '+' ? 'rgba(46,160,90,0.09)' : r.d === '-' ? 'rgba(200,60,50,0.07)' : 'transparent',
          }}>
            <span style={{ width: 44, textAlign: 'right', color: '#b3b7bf', paddingRight: 10, fontVariantNumeric: 'tabular-nums' }}>{r.n}</span>
            <span style={{ width: 18, color: r.d === '+' ? '#2e9a5e' : '#c4473c' }}>{r.d ?? ' '}</span>
            {r.t.map(([s, c], k) => <span key={k} style={{ color: c, opacity: r.d === '-' ? 0.6 : 1 }}>{s}</span>)}
          </div>
        ))}
        {/* 评审评论 */}
        <div style={{ margin: '14px 20px 0 62px', display: 'flex', gap: 12, alignItems: 'flex-start', fontFamily: FONT.sans }}>
          <div style={{ width: 30, height: 30, borderRadius: 15, background: '#e6e9f2', color: '#4a5577', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>MA</div>
          <div style={{ border: '1px solid #e6e8ec', borderRadius: 10, padding: '9px 14px', background: '#fafbfc' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#2a2c30', marginBottom: 2 }}>Minh Anh <span style={{ fontWeight: 400, color: '#9aa0aa' }}>· đã duyệt</span></div>
            <div style={{ fontSize: 13.5, color: '#4a4e56' }}>Trông như video ra mắt của studio thật. Duyệt!</div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// 黑白相间的固定顺序（奇偶交替）
// 第 k 个动词配第 k+1 张卡（有 shot{k+1} 图时用真实截图替换）；第 0 张是开场的节奏报告，其余为上下露边的邻卡
const CARDS: React.FC[] = [DarkStats, LightArticle, DarkBuild, LightCode, DarkMri, LightTable];

const SW_DUR = 18;
const FOCUS_TOP0 = 540 - CARD_H / 2; // 275（横屏）

// 动词：逐字母从遮罩下沿升起；出场整词升出上沿（遮罩上下各留 0.32em / 0.26em 给越南语声调符号）
const Verb: React.FC<{ word: string; frame: number; inAt: number; outAt: number | null; line: number; fs: number; padT: number }> = ({ word, frame, inAt, outAt, line, fs, padT }) => {
  const grey = outAt !== null ? ramp(frame, outAt - 10, 10, EASE.smooth) : 0;
  const pOut = outAt !== null ? ramp(frame, outAt, 8, EASE.exit) : 0;
  if (frame < inAt || pOut >= 1) return null;
  const c = Math.round(mix(0xf4, 0x6a, grey));
  const travel = line + fs * 0.6; // 越过遮罩上下留白
  const chars = Array.from(word);
  const hasDot = !/[.!?…]$/.test(word);
  const units = hasDot ? [...chars, '.'] : chars;
  const stepF = Math.min(1.2, 14 / Math.max(1, units.length)); // 长词压密错峰，整词 ≤ ~30f 内升完
  // 出场时遮罩上沿迅速收回到行盒上沿（与原版一致：旧词不压到上一行主语）；静止时留出声调符号的空间
  const clipTop = padT * Math.min(1, pOut * 3);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: clipTop, bottom: 0, overflow: 'hidden' }}>
    <div style={{
      position: 'absolute', left: 0, top: padT - clipTop, height: line, whiteSpace: 'pre', color: `rgb(${c},${c},${Math.round(c * 0.98)})`,
      transform: `translateY(${(-pOut * travel).toFixed(2)}px)`, opacity: 1 - pOut * 0.6,
    }}>
      {units.map((ch, i) => {
        const k = ramp(frame, inAt + i * stepF, 16, EASE.snappy);
        const dot = hasDot && i === units.length - 1; // 句点（金）最后一个升起
        return (
          <span key={i} style={{ display: 'inline-block', color: dot && grey < 0.5 ? L.accent2 : undefined, transform: `translateY(${((1 - k) * travel).toFixed(2)}px)` }}>{ch}</span>
        );
      })}
    </div>
    </div>
  );
};

const ImageCard: React.FC<{ src: string }> = ({ src }) => (
  <img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 30%' }} />
);

export const WordRelayFilmstrip: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: SH } = useVideoConfig();
  const fonts = useShotFonts();
  const portrait = SH > 1080 * 1.2;
  const subject = useText('subject', '') || BRAND.short || 'Chúng tôi';
  const verbs = useList('verbs', ['lên kịch bản', 'dựng video', 'đăng bài']).slice(0, 3);
  const notes = useList('notes', ['Kịch bản · 12 cảnh khớp nhịp', 'Bản xuất #1284 · 1080p · 1 phút 42 giây', 'Đã duyệt · lên sóng hôm nay']);
  const shots = [useImage('shot1'), useImage('shot2'), useImage('shot3')];
  const n = Math.max(1, verbs.length);
  // 切词点：原版 16/66/114（词期 ~48–50f）；2 词 = 16/66
  const SWITCHES = Array.from({ length: n }, (_, i) => 16 + Math.round(i * Math.min(50, n > 1 ? 98 / (n - 1) : 0)));
  const IN_AT = SWITCHES.map((s) => s + 7); // 新词在切点后 7f 起升（旧词先出）

  // 胶片步进：平时静止，只在切词窗口内滚一格（不对称 in-out：起步稍快、落点很软）
  const stepAt = (f: number) => SWITCHES.reduce((acc, s) => acc + ramp(f, s, SW_DUR, EASE.swift), 0);
  const stepF = stepAt(frame);
  const scroll = stepF * STEP;
  const cam = mix(1, 1.02, ramp(frame, 0, WORD_RELAY_FILMSTRIP_DURATION, EASE.swift));

  // ── 版式 ──
  // 横屏：卡列左（CARD_L 100），词块右（WX 1196），词块中心 = 焦点卡中点 y540
  // 竖屏：卡列放大 cs 倍居中、焦点卡中心在 ~40% 高；词块在焦点卡下方，左对齐卡边
  const cs = portrait ? 1.7 : 1;
  const colX = portrait ? (1920 - CARD_W * cs) / 2 : 100;
  const focusCY = portrait ? Math.round(SH * 0.43) : 540;
  const FOCUS_TOP = focusCY / cs - CARD_H / 2; // 卡列坐标
  const WX = portrait ? colX + 6 : 1196;
  const maxW = portrait ? 1920 - 2 * colX - 12 : 1920 - 1196 - 56;
  const FS0 = portrait ? 210 : 140;
  const fsSub = fitSize(subject, { family: fonts.serif, size: FS0, maxWidth: maxW, weight: 400, minSize: 60 });
  const fsVerb = Math.min(...verbs.map((v) => fitSize(/[.!?…]$/.test(v) ? v : v + '.', { family: fonts.serif, size: FS0, maxWidth: maxW - FS0 * 0.1, weight: 400, italic: true, minSize: 60 })));
  const FS = Math.min(fsSub, fsVerb);
  const LINE = Math.round(FS * 1.12); // 每行行盒（≥1.1：越南语叠加声调符号）
  const PAD_T = Math.round(FS * 0.32);
  const PAD_B = Math.round(FS * 0.26);
  const BLOCK_TOP = portrait ? focusCY + (CARD_H * cs) / 2 + 250 : 540 - LINE; // 横屏：两行词块中心 = 540
  const noteSize = portrait ? 50 : 32;
  const noteW = maxW;
  const noteFit = (t: string) => fitSize(t, { family: fonts.sans, size: noteSize, maxWidth: noteW, weight: 450, minSize: noteSize * 0.6 });

  // 卡片：焦点卡顶 = FOCUS_TOP；离焦距离 → 压暗 / 缩小 / 虚化
  const total = CARDS.length * STEP;
  const visH = SH / cs;
  const cards: React.ReactNode[] = [];
  for (let rep = -1; rep < 2; rep++) {
    CARDS.forEach((C, i) => {
      const y = FOCUS_TOP + i * STEP + rep * total - scroll;
      if (y > visH + 120 || y < -CARD_H - 120) return;
      const dist = Math.min(1.4, Math.abs(y - FOCUS_TOP) / STEP);
      const dim = Math.min(0.68, dist * 0.68);
      const sc = 1 - 0.06 * Math.min(1, dist);
      const blur = Math.min(3, dist * 3);
      const dark = i % 2 === 0;
      const img = i >= 1 && i <= 3 ? shots[i - 1] : undefined;
      cards.push(
        <div key={`${rep}-${i}`} style={{
          position: 'absolute', top: y, left: 0, width: CARD_W, height: CARD_H, borderRadius: 18, overflow: 'hidden',
          background: dark ? '#0d0e10' : '#ffffff', transform: `scale(${sc.toFixed(4)})`,
          border: `1px solid ${dark ? alpha('#ffffff', 0.1) : alpha('#000000', 0.2)}`,
          boxShadow: `inset 0 1px 0 ${alpha('#ffffff', dark ? 0.08 : 0.6)}, 0 2px 6px ${alpha('#000000', 0.5)}, 0 40px 90px -30px ${alpha('#000000', 0.95)}`,
          filter: blur > 0.15 ? `blur(${blur.toFixed(2)}px)` : undefined,
        }}>
          {img ? <ImageCard src={img} /> : <C />}
          <div style={{ position: 'absolute', inset: 0, background: alpha(L.bg[1], dark || img ? dim : 0.04 + dim * 0.96) }} />
        </div>,
      );
    });
  }
  const vy = -velocity((f) => stepAt(f) * STEP * cs, frame);

  // 当前词序号
  const idx = IN_AT.filter((s) => frame >= s).length; // 0..n
  // 引线：切词起 6f 收回，新证据落定（切点 +10f）后 16f 重画
  const lastS = [...SWITCHES].reverse().find((s) => frame >= s);
  const lineP = lastS === undefined
    ? ramp(frame, 0, 16, EASE.snappy)
    : frame < lastS + 10 ? 1 - ramp(frame, lastS, 6, EASE.exit) : ramp(frame, lastS + 10, 16, EASE.snappy);
  const u = portrait ? 1.6 : 1;
  // 竖屏卡列下缘渐隐：焦点卡以下的邻卡淡出，不压到词块
  const focusBottom = focusCY + (CARD_H * cs) / 2;
  const colMask = portrait ? `linear-gradient(180deg, #000 0px, #000 ${focusBottom + 20}px, transparent ${focusBottom + 190}px)` : undefined;

  return (
    <div style={{ width: 1920, height: SH, position: 'relative', overflow: 'hidden', background: L.bg[2] }}>
      <Stage look={L} keyLight={{ x: portrait ? 0.5 : 0.72, y: 0.12 }} fill={{ x: 0.15, y: 1.0 }} intensity={0.85} breathe={0.4} />
      <div style={{ position: 'absolute', inset: 0, transformOrigin: `960px ${focusCY}px`, transform: `scale(${cam.toFixed(4)})` }}>
        <div style={{ position: 'absolute', inset: 0, WebkitMaskImage: colMask, maskImage: colMask }}>
          <SpeedBlur vx={0} vy={vy} amount={0.22} max={10}>
            <div style={{ position: 'absolute', left: colX, top: 0, width: CARD_W, height: visH, transform: `scale(${cs})`, transformOrigin: '0 0' }}>{cards}</div>
          </SpeedBlur>
        </div>

        {portrait ? (
          <>
            {/* 引线（竖）：焦点卡下缘 → 词块上方 */}
            <div style={{ position: 'absolute', left: WX + 2, top: focusBottom + 14, width: 3, height: (BLOCK_TOP - 130 - focusBottom - 14) * lineP, background: `linear-gradient(180deg, ${L.accent2}, ${alpha(L.accent2, 0.35)})` }} />
            <div style={{ position: 'absolute', left: WX + 3.5 - 11, top: focusBottom + 14 - 11, width: 22, height: 22, borderRadius: 11, background: L.accent2, opacity: Math.min(1, lineP * 2), boxShadow: `0 0 16px ${alpha(L.accent2, 0.6)}` }} />
          </>
        ) : (
          <>
            {/* 引线：焦点卡右缘 → 词块中线（y=540） */}
            <div style={{ position: 'absolute', left: colX + CARD_W + 14, top: 539, width: (WX - 40 - colX - CARD_W - 14) * lineP, height: 2, background: `linear-gradient(90deg, ${L.accent2}, ${alpha(L.accent2, 0.35)})` }} />
            <div style={{ position: 'absolute', left: colX + CARD_W + 7, top: 533, width: 14, height: 14, borderRadius: 7, background: L.accent2, opacity: Math.min(1, lineP * 2), boxShadow: `0 0 16px ${alpha(L.accent2, 0.6)}` }} />
          </>
        )}

        {/* 序号 */}
        <div style={{ position: 'absolute', left: WX + 6, top: BLOCK_TOP - 58 * u - (portrait ? 20 : 0), fontFamily: FONT.mono, fontSize: 28 * u, color: L.ink3, letterSpacing: '0.04em', lineHeight: 1.2 }}>
          <span style={{ color: L.accent2 }}>{String(Math.min(idx, n)).padStart(2, '0')}</span> / {String(n).padStart(2, '0')}
        </div>
        {/* 词块：主语恒定 + 动词接力；两行行盒各 LINE，横屏整块中心 = 540 */}
        <div style={{ position: 'absolute', left: WX, top: BLOCK_TOP, fontFamily: FONT.serif, fontSize: FS, lineHeight: `${LINE}px`, letterSpacing: '-0.01em' }}>
          <div style={{ height: LINE, color: L.ink2, whiteSpace: 'pre' }}>{subject}</div>
          <div style={{ position: 'relative', height: LINE + PAD_T + PAD_B, marginTop: -PAD_T, width: maxW + FS * 0.2, overflow: 'hidden', fontStyle: 'italic' }}>
            {verbs.map((w, i) => (
              <Verb key={i} word={w} frame={frame} inAt={IN_AT[i]} outAt={i + 1 < SWITCHES.length ? SWITCHES[i + 1] : null} line={LINE} fs={FS} padT={PAD_T} />
            ))}
          </div>
        </div>
        {/* 证据注脚：随动词接力 */}
        {verbs.map((_, i) => {
          const note = notes[i];
          if (!note) return null;
          const pIn = ramp(frame, IN_AT[i] + 6, 14, EASE.snappy);
          const pOut = i + 1 < SWITCHES.length ? ramp(frame, SWITCHES[i + 1], 7, EASE.exit) : 0;
          const op = pIn * (1 - pOut);
          if (op <= 0.002) return null;
          return (
            <div key={i} style={{
              position: 'absolute', left: WX + 6, top: BLOCK_TOP + LINE * 2 + 40 * u, fontFamily: FONT.sans, fontSize: noteFit(note), fontWeight: 450, lineHeight: 1.3,
              color: L.ink2, letterSpacing: '-0.01em', opacity: op, transform: `translateY(${((1 - pIn) * 14 - pOut * 10).toFixed(2)}px)`, whiteSpace: 'nowrap',
            }}>
              {note}
            </div>
          );
        })}
      </div>
    </div>
  );
};
