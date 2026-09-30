# BÁO CÁO KHO TÀI NGUYÊN CAPCUT — kèm MÔ TẢ & KHI NÀO DÙNG

Trích trực tiếp từ metadata repo CapCutAPI. **Mục tiêu:** để AI đọc + phân tích video gốc rồi CHỌN hiệu ứng đúng ngữ cảnh.

> ⚠️ **Về cột Mô tả:** suy luận từ TÊN + tham số (chưa xem tận mắt từng cái). Rất đáng tin với tên rõ (`Fade_Out`, `Shake`, `White_Flash`...); cái nào ghi *'(Suy từ tên...)'* là tên mơ hồ → nên xác minh bằng `build_swatch.py`.

> **CapCut vs JianYing:** máy đặt `is_capcut_env=true` → bộ **CapCut** (PHẦN A) là bộ chạy thật. JianYing ở PHẦN C.


---
# PHẦN 0 — BẢNG TRA THEO TÌNH HUỐNG (AI dùng để chọn nhanh)

| Tình huống trong video | Scene/Char effect gợi ý | Transition | Text animation |
|---|---|---|---|
| Hook mở đầu, gây chú ý | `Zoom_Lens`, `Star_Rain`, `Mini_Stars` | `White_Flash`, `Twinkle_Zoom` | `Bounce_In`, `Blow_In` |
| Số liệu tiền/thành công/tăng | `Star_Rain`, `Heart_Disco`, `Mini_Stars` | `Light_Beam` | `Bounce_In` |
| View tụt / thuật toán / tiêu cực | `Color_Glitch`, `RGB_Border`, `Glitch`, `Noise` | `RGB_Glitch`, `Color_Glitch` | `Faulty_text`, `Flicker` |
| Cú đấm / nói thẳng / tức giận | `Shake`, `Camera_Shake`, `Black_Flash` | `BW_Flash`, `Shake_3` | `Boing`, `Flip_Verbatim` |
| Cảnh báo / mất mát (mất trắng) | `Black_Flash`, `Lightning`, `Blackout` | `Black_Fade` | `Flicker` |
| Chuyển mạch / đổi chủ đề | `Motion_Blur` | `White_Flash`, `Pull_in`, `Dissolve` | — |
| Tâm sự / cảm xúc lắng | `Light_leak`, `Heartbeat` | `Dissolve`, `Black_Fade` | `Fade_In`, `Float_Down` |
| Hoài niệm / kể chuyện cũ | `Retro_Film`, `Film_Frame` | `Black_smoke` | `Typewriter`-like |
| Câu chốt / kết video | `Heartbeat`, `Light_leak` | `White_Flash` | `Bounce_In` |

> Bảng trên là gợi ý chính; danh sách đầy đủ + mô tả từng cái ở dưới.


---
# PHẦN A — BỘ CAPCUT (chạy thật)

## A1. Transition — Chuyển cảnh
**Áp dụng:** `add_video/add_image(transition="<key>", transition_duration=...)`

> Tổng **116** mục.

| # | key (API) | Tên | Mô tả & khi nào dùng | Tham số/TL |
|---|---|---|---|---|
| 1 | `Montage_Snippets` | Montage Snippets | (Suy từ tên 'Montage Snippets') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 2.00s/chồng |
| 2 | `Mix` | Mix | (Suy từ tên 'Mix') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 1.00s/chồng |
| 3 | `Mix_1` | Mix | (Suy từ tên 'Mix') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s/chồng |
| 4 | `Mix_2` | Mix | (Suy từ tên 'Mix') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s/chồng |
| 5 | `Black_Fade` | Black Fade | Tối/đen, mờ dần. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | 0.47s |
| 6 | `Then_and_Now` | Then and Now | (Suy từ tên 'Then and Now') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 7 | `White_Flash` | White Flash | Trắng, loé sáng chớp. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | 0.47s |
| 8 | `Dissolve` | Dissolve | Hoà tan. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.47s |
| 9 | `Dissolve_1` | Dissolve | Hoà tan. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.47s |
| 10 | `Gradient_Wipe` | Gradient Wipe | Chuyển sắc, gạt/quét ngang. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 11 | `Dissolve_II` | Dissolve II | Hoà tan. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.47s |
| 12 | `Dissolve_III` | Dissolve III | Hoà tan. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.47s |
| 13 | `Black_smoke` | Black smoke | Tối/đen, khói. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | 0.47s |
| 14 | `White_smoke` | White smoke | Trắng, khói. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.47s |
| 15 | `BW_Flash` | B&W Flash | Loé sáng chớp. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | 2.00s/chồng |
| 16 | `Rainbow_Warp` | Rainbow Warp | Cầu vồng, bẻ cong méo. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 1.00s/chồng |
| 17 | `RGB_Glitch` | RGB Glitch | Nhiễu/trục trặc số. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | 1.00s/chồng |
| 18 | `Rainbow_Filter` | Rainbow Filter | Cầu vồng. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 1.00s/chồng |
| 19 | `Urban_Glitch` | Urban Glitch | Nhiễu/trục trặc số. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | 1.00s/chồng |
| 20 | `Camera_Glow` | Camera Glow | Máy quay, phát sáng. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | 1.00s/chồng |
| 21 | `White_Flash_1` | White Flash | Trắng, loé sáng chớp. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | 0.40s/chồng |
| 22 | `Light_Sweep_II` | Light Sweep II | Ánh sáng, quét sáng. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.80s/chồng |
| 23 | `Flash` | Flash | Loé sáng chớp. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | 0.47s |
| 24 | `Light_Beam` | Light Beam | Ánh sáng, luồng sáng. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 25 | `Burn` | Burn | Cháy sém. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 26 | `Blanch` | Blanch | Chớp trắng loá. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 27 | `Fold_Over` | Fold Over | Gấp lại. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 1.00s/chồng |
| 28 | `Bottom_Left_II` | Bottom Left II | (Suy từ tên 'Bottom Left II') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.67s/chồng |
| 29 | `Vertical_Blur_II` | Vertical Blur II | Theo chiều dọc, làm mờ. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.60s/chồng |
| 30 | `Fold_Over_1` | Fold Over | Gấp lại. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 1.00s/chồng |
| 31 | `Bottom_Left_II_1` | Bottom Left II | (Suy từ tên 'Bottom Left II') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.67s/chồng |
| 32 | `Inhale` | Inhale | (Suy từ tên 'Inhale') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.60s/chồng |
| 33 | `Shake_3` | Shake 3 | Rung lắc máy quay. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | 0.80s/chồng |
| 34 | `Rotate_CW_II` | Rotate CW II | Xoay. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.80s/chồng |
| 35 | `Rotate_CCW_II` | Rotate CCW II | Xoay. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.80s/chồng |
| 36 | `Pull_in` | Pull in | Kéo. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 37 | `Pull_Out` | Pull Out | Kéo. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 38 | `CW_Swirl` | CW Swirl | Xoáy. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 39 | `Right` | Right | (Suy từ tên 'Right') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 40 | `AntiCW_Swirl` | Anti-CW Swirl | Xoáy. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 41 | `Transform_Shimmer` | Transform Shimmer | (Suy từ tên 'Transform Shimmer') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s/chồng |
| 42 | `Twinkle_Zoom` | Twinkle Zoom | Lấp lánh nhấp nháy, phóng to (zoom). Dùng để CHUYỂN giữa 2 cảnh khi cắt. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | 1.00s/chồng |
| 43 | `Horizontal_Blur` | Horizontal Blur | Theo chiều ngang, làm mờ. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.47s/chồng |
| 44 | `Horizontal_Blur_1` | Horizontal Blur | Theo chiều ngang, làm mờ. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 1.47s/chồng |
| 45 | `Horizontal_Blur_2` | Horizontal Blur | Theo chiều ngang, làm mờ. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.47s/chồng |
| 46 | `Radial_Blur` | Radial Blur | Mờ toả tròn, làm mờ. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.47s |
| 47 | `Blurred_Highlight` | Blurred Highlight | (Suy từ tên 'Blurred Highlight') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 48 | `Vertical_Blur` | Vertical Blur | Theo chiều dọc, làm mờ. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.47s |
| 49 | `Blur` | Blur | Làm mờ. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.47s |
| 50 | `Woosh` | Woosh | (Suy từ tên 'Woosh') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 51 | `Particles` | Particles | (Suy từ tên 'Particles') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 52 | `Mosaic` | Mosaic | Ô vuông mờ mặt. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | 0.47s |
| 53 | `Blink` | Blink | Chớp tắt. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 54 | `Flip_II` | Flip II | Lật mặt. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 55 | `Flip` | Flip | Lật mặt. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 1.00s |
| 56 | `Left` | Left | (Suy từ tên 'Left') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 57 | `Up` | Up | (Suy từ tên 'Up') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 58 | `Wipe_Right` | Wipe Right | Gạt/quét ngang. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 59 | `Open_Horizontally` | Open Horizontally | Mở ra. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 60 | `Right_1` | Right | (Suy từ tên 'Right') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 1.00s/chồng |
| 61 | `Slide` | Slide | Trượt. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 62 | `Slide_1` | Slide | Trượt. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 63 | `Wipe_Up` | Wipe Up | Gạt/quét ngang. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s/chồng |
| 64 | `Wipe_Left` | Wipe Left | Gạt/quét ngang. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 65 | `Wipe_Left_1` | Wipe Left | Gạt/quét ngang. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 66 | `Open_Vertically` | Open Vertically | Mở ra. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 67 | `Curling_Wave` | Curling Wave | Gợn sóng. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 68 | `Flame` | Flame | Ngọn lửa. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 69 | `Cartoon_Swirl` | Cartoon Swirl | Hoạt hình, xoáy. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 70 | `Blue_Lines` | Blue Lines | Xanh dương, đường kẻ. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 71 | `Recorder` | Recorder | (Suy từ tên 'Recorder') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 72 | `Like` | Like | (Suy từ tên 'Like') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 73 | `Little_Devil` | Little Devil | (Suy từ tên 'Little Devil') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 74 | `Super_Like` | Super Like | (Suy từ tên 'Super Like') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 75 | `Lightning` | Lightning | Tia chớp/sấm sét. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | 0.47s |
| 76 | `Snow` | Snow | Tuyết rơi. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 77 | `White_Ink` | White Ink | Trắng, loang mực. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 78 | `Cloud` | Cloud | Mây/khói. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.47s |
| 79 | `Wave_Right` | Wave Right | Gợn sóng. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 80 | `Wave_Left` | Wave Left | Gợn sóng. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 81 | `Dots_Right` | Dots Right | Chấm bi. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 82 | `Circular_Slices_II` | Circular Slices II | (Suy từ tên 'Circular Slices II') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.80s/chồng |
| 83 | `Split_III` | Split III | Tách đôi. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 84 | `Horizontal_Slice` | Horizontal Slice | Theo chiều ngang. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s/chồng |
| 85 | `Diagonal_Slices` | Diagonal Slices | (Suy từ tên 'Diagonal Slices') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s/chồng |
| 86 | `Split` | Split | Tách đôi. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 87 | `Vertical_Slices` | Vertical Slices | Theo chiều dọc. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s/chồng |
| 88 | `Split_IV` | Split IV | Tách đôi. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 89 | `Vintage_Screening` | Vintage Screening | Cổ điển. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Hợp tông HOÀI NIỆM/kể chuyện/nhìn lại. | 0.47s/chồng |
| 90 | `Vintage_Screening_1` | Vintage Screening | Cổ điển. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Hợp tông HOÀI NIỆM/kể chuyện/nhìn lại. | 0.60s/chồng |
| 91 | `Cube` | Cube | (Suy từ tên 'Cube') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 92 | `Switch` | Switch | (Suy từ tên 'Switch') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 93 | `Open` | Open | Mở ra. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 94 | `Page_Turning` | Page Turning | (Suy từ tên 'Page Turning') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 95 | `Clock_wipe` | Clock wipe | Gạt/quét ngang. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 96 | `Windmill` | Windmill | (Suy từ tên 'Windmill') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 97 | `Color_Glitch` | Color Glitch | Màu, nhiễu/trục trặc số. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | 0.47s |
| 98 | `Strobe` | Strobe | Nhấp nháy mạnh. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | 0.47s |
| 99 | `Blocks` | Blocks | Khối vỡ ô vuông. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 100 | `Glitch` | Glitch | Nhiễu/trục trặc số. Dùng để CHUYỂN giữa 2 cảnh khi cắt. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | 0.47s |
| 101 | `Horizontal_Lines` | Horizontal Lines | Theo chiều ngang, đường kẻ. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 102 | `Horizontal_Lines_1` | Horizontal Lines | Theo chiều ngang, đường kẻ. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.47s |
| 103 | `Cutout_Flip` | Cutout Flip | Lật mặt. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.80s/chồng |
| 104 | `Color_Swirl` | Color Swirl | Màu, xoáy. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 1.00s/chồng |
| 105 | `Shutter_II` | Shutter II | (Suy từ tên 'Shutter II') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.60s/chồng |
| 106 | `Stretch_ll` | Stretch ll | (Suy từ tên 'Stretch ll') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.60s/chồng |
| 107 | `Stretch` | Stretch | (Suy từ tên 'Stretch') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 1.20s/chồng |
| 108 | `Shutter` | Shutter | (Suy từ tên 'Shutter') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 109 | `Whirlpool` | Whirlpool | (Suy từ tên 'Whirlpool') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 110 | `Whirlpool_1` | Whirlpool | (Suy từ tên 'Whirlpool') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 111 | `Distortion` | Distortion | (Suy từ tên 'Distortion') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 112 | `Axis_Rotation` | Axis Rotation | Xoay. Dùng để CHUYỂN giữa 2 cảnh khi cắt. | 0.80s/chồng |
| 113 | `Stretch_Right` | Stretch Right | (Suy từ tên 'Stretch Right') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 114 | `Stretch_Left` | Stretch Left | (Suy từ tên 'Stretch Left') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 115 | `Squeeze` | Squeeze | (Suy từ tên 'Squeeze') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |
| 116 | `Squeeze_1` | Squeeze | (Suy từ tên 'Squeeze') Dùng để CHUYỂN giữa 2 cảnh khi cắt. — nên xem Bảng thử để chắc. | 0.47s |

## A2. Scene effect — Hiệu ứng cảnh (toàn khung)
**Áp dụng:** `add_effect(effect_type="<key>", effect_category="scene")`

> Tổng **345** mục.

| # | key (API) | Tên | Mô tả & khi nào dùng | Tham số/TL |
|---|---|---|---|---|
| 1 | `Blur` | Blur | Làm mờ. Phủ TOÀN khung — nhấn không khí/cao trào. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | effects_adjust_blur=0.5[0~1] |
| 2 | `Fade_In` | Fade In | Mờ dần. Phủ TOÀN khung — nhấn không khí/cao trào. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | effects_adjust_speed=0.33[0~1] |
| 3 | `Heart_Kisses` | Heart Kisses | Trái tim, nụ hôn. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 4 | `Explosion` | Explosion | Nổ bung. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 5 | `Fireworks_2` | Fireworks 2 | Pháo hoa. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 6 | `Fade_Out` | Fade Out | Mờ dần. Phủ TOÀN khung — nhấn không khí/cao trào. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | effects_adjust_speed=0.33[0~1] |
| 7 | `The_End` | The End | (Suy từ tên 'The End') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | — |
| 8 | `Zoom_Lens` | Zoom Lens | Zoom kiểu ống kính máy ảnh — nhấn chủ thể, lấy nét. | effects_adjust_speed=0.33[0~1]; effects_adjust_range=0.3[0~1] |
| 9 | `Meteor` | Meteor | (Suy từ tên 'Meteor') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 10 | `Horizontal_Open` | Horizontal Open | Theo chiều ngang, mở ra. Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 11 | `Spectrum_Scan` | Spectrum Scan | Quét dòng. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_background_animation=0[0~1]; effects_adjust_intensity=0.614[0~1]; effects_adjust_luminance=0.642[0~1]; effects_adjust_speed=0.333[0~1]; effects_adjust_range=0.333[0~1] |
| 12 | `By_the_Fireplace` | By the Fireplace | Ánh lửa lò sưởi ấm áp — cozy, tâm sự nhẹ nhàng. | effects_adjust_speed=0.2[0~1]; sticker=1[0~1]; effects_adjust_filter=0.4[0~1] |
| 13 | `Rolling_Film` | Rolling Film | Phim nhựa/điện ảnh. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp tông HOÀI NIỆM/kể chuyện/nhìn lại. | effects_adjust_filter=0.7[0~1]; effects_adjust_speed=0.5[0~1] |
| 14 | `Landscape_Close` | Landscape Close | Đóng lại. Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 15 | `Flipped` | Flipped | (Suy từ tên 'Flipped') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1] |
| 16 | `Horizontal_Close` | Horizontal Close | Theo chiều ngang, đóng lại. Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 17 | `Astral` | Astral | Bóng ma/phân thân — tạo vệt mờ ethereal như hồn lìa khỏi xác. Dùng cho khoảnh khắc siêu thực, ảo, chuyển cảnh huyền bí. | effects_adjust_speed=0.33[0~1]; effects_adjust_range=1[0~1] |
| 18 | `Edge_Glow` | Edge Glow | Phát sáng. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_luminance=0.25[0~1] |
| 19 | `Shake` | Shake | Rung lắc máy quay. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_speed=0.33[0~1]; effects_adjust_intensity=0.5[0~1] |
| 20 | `Camera_Focus` | Camera Focus | Máy quay, lấy nét. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_blur=0.25[0~1] |
| 21 | `Collision_Sparks` | Collision Sparks | Tia lửa bắn. Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 22 | `Diamond_Zoom` | Diamond Zoom | Zoom kèm lấp lánh kim cương — sang, nhấn thành công/đắt giá. | effects_adjust_size=0.521[0~1]; effects_adjust_intensity=0.72[0~1]; effects_adjust_speed=0.333[0~1]; effects_adjust_horizontal_shift=0.33[0~1]; effects_adjust_rotate=0.5[0~1] |
| 23 | `Disco_Ball_1` | Disco Ball 1 | Disco nhấp nháy. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 24 | `Mini_Zoom` | Mini Zoom | Zoom nhẹ nhanh — punch-in tinh tế nhấn từ khoá. | effects_adjust_speed=0.33[0~1]; effects_adjust_range=0.5[0~1] |
| 25 | `Bluray_Scanning` | Blu-ray Scanning | Quét dòng. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_luminance=0.5[0~1]; effects_adjust_blur=0.3[0~1]; effects_adjust_intensity=0.3[0~1]; effects_adjust_speed=0.333[0~1]; effects_adjust_range=0.7[0~1] |
| 26 | `Portrait_Open` | Portrait Open | Mở ra. Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 27 | `Girls_Secrets` | Girl's Secrets | (Suy từ tên 'Girl's Secrets') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1]; effects_adjust_filter=1[0~1] |
| 28 | `Color_Phosphor` | Color Phosphor | Màu. Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 29 | `Rebound_Swing` | Rebound Swing | (Suy từ tên 'Rebound Swing') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.333[0~1]; effects_adjust_size=0.5[0~1]; effects_adjust_intensity=0[0~1] |
| 30 | `Camera_Shake` | Camera Shake | Rung máy quay chân thực — nhấn cú sốc/mạnh, tăng năng lượng. | effects_adjust_range=0.15[0~1]; effects_adjust_speed=0.33[0~1] |
| 31 | `Pulse` | Pulse | Đập theo nhịp. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1] |
| 32 | `Vertical_Open` | Vertical Open | Theo chiều dọc, mở ra. Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 33 | `Star` | Star | Ngôi sao. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_size=0.33[0~1]; effects_adjust_number=1[0~1]; effects_adjust_filter=1[0~1] |
| 34 | `Heart_Disco` | Heart Disco | Tim bay nhấp nháy kiểu disco — vui, tích cực, 'thả tim'. | effects_adjust_speed=0.333[0~1]; effects_adjust_background_animation=1[0~1]; effects_adjust_filter=0.634[0~1] |
| 35 | `Butterfly_Dream` | Butterfly Dream | Bướm bay, mơ màng. Phủ TOÀN khung — nhấn không khí/cao trào. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 36 | `Camcorder` | Camcorder | Khung máy quay cũ (REC). Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 37 | `TV_On` | TV On | (Suy từ tên 'TV On') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_intensity=0.5[0~1]; effects_adjust_speed=0.33[0~1]; effects_adjust_horizontal_chromatic=0.6[0~1]; effects_adjust_vertical_chromatic=0.6[0~1] |
| 38 | `Vignette` | Vignette | Tối 4 góc (vignette). Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_texture=1[0~1] |
| 39 | `Heartbeat` | Heartbeat | Đập như nhịp tim. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1] |
| 40 | `Blurry_Focus` | Blurry Focus | Nhoè mờ, lấy nét. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_blur=0.25[0~1] |
| 41 | `Noise_2` | Noise 2 | Nhiễu hạt. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_speed=0.33[0~1] |
| 42 | `Leak_1` | Leak 1 | Loé sáng lọt khung. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 43 | `Black_Noise` | Black Noise | Tối/đen, nhiễu hạt. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_speed=0.33[0~1] |
| 44 | `Old_TV_2` | Old TV 2 | Cũ kỹ. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp tông HOÀI NIỆM/kể chuyện/nhìn lại. | effects_adjust_speed=0.33[0~1] |
| 45 | `Fuzzy` | Fuzzy | (Suy từ tên 'Fuzzy') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_intensity=1[0~1]; effects_adjust_horizontal_chromatic=0.75[0~1]; effects_adjust_vertical_chromatic=0.5[0~1] |
| 46 | `Soft` | Soft | Dịu nhẹ. Phủ TOÀN khung — nhấn không khí/cao trào. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | effects_adjust_soft=0.7[0~1] |
| 47 | `TV_Off` | TV Off | (Suy từ tên 'TV Off') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_horizontal_chromatic=0.6[0~1]; effects_adjust_vertical_chromatic=0.6[0~1] |
| 48 | `Lightning_Crack` | Lightning Crack | Tia chớp/sấm sét, nứt vỡ. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_distortion=0.5[0~1]; effects_adjust_speed=0.8[0~1]; sticker=1[0~1]; effects_adjust_filter=0.7[0~1] |
| 49 | `Shake_3` | Shake 3 | Rung lắc máy quay. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_speed=0.33[0~1]; effects_adjust_horizontal_chromatic=0.75[0~1]; effects_adjust_vertical_chromatic=0.75[0~1] |
| 50 | `Gleam` | Gleam | (Suy từ tên 'Gleam') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_size=1[0~1]; effects_adjust_luminance=0.55[0~1]; effects_adjust_range=0.65[0~1]; effects_adjust_color=0[0~1]; effects_adjust_intensity=1[0~1]; effects_adjust_soft=0.4[0~1]; effects_adjust_filter=0.8[0~1] |
| 51 | `Butterflies` | Butterflies | Đàn bướm bay. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 52 | `Ripple` | Ripple | Lăn tăn. Phủ TOÀN khung — nhấn không khí/cao trào. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | effects_adjust_sharpen=0.35[0~1]; effects_adjust_blur=0.5[0~1]; effects_adjust_size=0.2[0~1]; effects_adjust_speed=0.2[0~1]; effects_adjust_intensity=0.4[0~1]; effects_adjust_distortion=0.55[0~1] |
| 53 | `Electro_Border` | Electro Border | Điện, viền khung. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_color=1[0~1]; effects_adjust_horizontal_shift=1[0~1]; effects_adjust_speed=0.5[0~1]; effects_adjust_size=0.6[0~1]; effects_adjust_intensity=0.5[0~1]; effects_adjust_rotate=0.5[0~1] |
| 54 | `Shake_1` | Shake | Rung lắc máy quay. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_speed=0.5[0~1]; effects_adjust_range=0.5[0~1] |
| 55 | `Trilayer_Mirror` | Tri-layer Mirror | Phản chiếu đối xứng. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_vertical_shift=0.5[0~1]; effects_adjust_filter=0.5[0~1] |
| 56 | `Radiating_Love` | Radiating Love | Tình yêu. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_speed=0.5[0~1]; effects_adjust_filter=1[0~1]; effects_adjust_background_animation=1[0~1] |
| 57 | `White_Flash` | White Flash | Trắng, loé sáng chớp. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_speed=0.33[0~1] |
| 58 | `Lightning` | Lightning | Tia chớp/sấm sét. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_color=0.7[0~1]; effects_adjust_luminance=0.4[0~1]; effects_adjust_speed=0.4[0~1]; effects_adjust_rotate=1[0~1]; sticker=1[0~1]; effects_adjust_filter=0.8[0~1] |
| 59 | `Motion_Blur` | Motion Blur | Mờ chuyển động, làm mờ. Phủ TOÀN khung — nhấn không khí/cao trào. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | effects_adjust_horizontal_shift=0.7[0~1]; effects_adjust_intensity=0.85[0~1] |
| 60 | `Spooky_Camera` | Spooky Camera | Rùng rợn, máy quay. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_filter=0.6[0~1]; effects_adjust_background_animation=0.3[0~1]; effects_adjust_sharpen=0.5[0~1]; effects_adjust_texture=0.8[0~1]; sticker=0.4[0~1] |
| 61 | `Frosted_Quality` | Frosted Quality | (Suy từ tên 'Frosted Quality') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_intensity=0.5[0~1]; effects_adjust_speed=0.15[0~1]; effects_adjust_size=0.6[0~1]; effects_adjust_filter=1[0~1]; effects_adjust_blur=0.15[0~1]; effects_adjust_sharpen=0.35[0~1]; effects_adjust_noise=0.5[0~1] |
| 62 | `Frosted_Quality_1` | Frosted Quality | (Suy từ tên 'Frosted Quality') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_intensity=0.5[0~1]; effects_adjust_speed=0.15[0~1]; effects_adjust_size=0.6[0~1]; effects_adjust_filter=1[0~1]; effects_adjust_blur=0.15[0~1]; effects_adjust_sharpen=0.35[0~1]; effects_adjust_noise=0.5[0~1] |
| 63 | `Leak_2` | Leak 2 | Loé sáng lọt khung. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 64 | `Vertical_Close` | Vertical Close | Theo chiều dọc, đóng lại. Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 65 | `Rainbow_Neon` | Rainbow Neon | Cầu vồng, đèn neon rực. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_rotate=0.5[0~1]; effects_adjust_distortion=0.12[0~1]; effects_adjust_size=0.1[0~1]; effects_adjust_luminance=0.5[0~1]; effects_adjust_intensity=0.6[0~1]; effects_adjust_blur=0.2[0~1] |
| 66 | `Sharpen_Edges` | Sharpen Edges | (Suy từ tên 'Sharpen Edges') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_blur=0.12[0~1]; effects_adjust_sharpen=0.5[0~1]; effects_adjust_size=0.08[0~1]; effects_adjust_range=1[0~1]; effects_adjust_filter=0.7[0~1] |
| 67 | `Chromatic` | Chromatic | Sai sắc viền màu. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_intensity=1[0~1]; effects_adjust_horizontal_chromatic=0.6[0~1] |
| 68 | `Dizzy` | Dizzy | (Suy từ tên 'Dizzy') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_size=0.7[0~1]; effects_adjust_speed=0.333[0~1]; effects_adjust_background_animation=0.8[0~1]; effects_adjust_filter=0.9[0~1]; effects_adjust_texture=0.9[0~1]; effects_adjust_color=0.9[0~1] |
| 69 | `Swing` | Swing | (Suy từ tên 'Swing') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | — |
| 70 | `Halo_2` | Halo 2 | Vòng hào quang. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 71 | `Leak_2_1` | Leak 2 | Loé sáng lọt khung. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_intensity=1[0~1]; effects_adjust_speed=0.25[0~1]; effects_adjust_range=0.47[0~1]; effects_adjust_blur=0.4[0~1]; effects_adjust_noise=0.3[0~1]; effects_adjust_filter=0.5[0~1] |
| 72 | `Vertical_Blur` | Vertical Blur | Theo chiều dọc, làm mờ. Phủ TOÀN khung — nhấn không khí/cao trào. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | effects_adjust_blur=0.5[0~1] |
| 73 | `Black_Flash` | Black Flash | Tối/đen, loé sáng chớp. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_speed=0.33[0~1] |
| 74 | `Wipe_Board` | Wipe Board | Gạt/quét ngang. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1] |
| 75 | `Butterfly_Color` | Butterfly Color | Bướm bay, màu. Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 76 | `Camera_Focus_2` | Camera Focus 2 | Máy quay, lấy nét. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_blur=0.5[0~1] |
| 77 | `To_Color` | To Color | Màu. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1] |
| 78 | `Flicker` | Flicker | Chập chờn. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1] |
| 79 | `Pixel_Blur` | Pixel Blur | Vỡ điểm ảnh (pixel), làm mờ. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_noise=0.5[0~1]; effects_adjust_speed=0.33[0~1] |
| 80 | `TV_Colored_Lines` | TV Colored Lines | Đường kẻ. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_texture=1[0~1] |
| 81 | `Shake_2` | Shake 2 | Rung lắc máy quay. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_speed=0.33[0~1]; effects_adjust_range=1[0~1] |
| 82 | `Wobbly_Black` | Wobbly Black | Tối/đen. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_background_animation=1[0~1] |
| 83 | `Strobe` | Strobe | Nhấp nháy mạnh. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_speed=1[0~1] |
| 84 | `Fade_In_1` | Fade In | Mờ dần. Phủ TOÀN khung — nhấn không khí/cao trào. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | effects_adjust_speed=0.33[0~1] |
| 85 | `Fade_In_2` | Fade In | Mờ dần. Phủ TOÀN khung — nhấn không khí/cao trào. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | effects_adjust_speed=0.33[0~1] |
| 86 | `Fade_Out_1` | Fade Out | Mờ dần. Phủ TOÀN khung — nhấn không khí/cao trào. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | effects_adjust_speed=0.33[0~1] |
| 87 | `The_End_1` | The End | (Suy từ tên 'The End') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | — |
| 88 | `Horizontal_Open_1` | Horizontal Open | Theo chiều ngang, mở ra. Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 89 | `Blurry_Focus_1` | Blurry Focus | Nhoè mờ, lấy nét. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_blur=0.25[0~1] |
| 90 | `Diamond_Zoom_1` | Diamond Zoom | Zoom kèm lấp lánh kim cương — sang, nhấn thành công/đắt giá. (biến thể) | effects_adjust_size=0.521[0~1]; effects_adjust_intensity=0.72[0~1]; effects_adjust_speed=0.333[0~1]; effects_adjust_horizontal_shift=0.33[0~1]; effects_adjust_rotate=0.5[0~1] |
| 91 | `Horizontal_Close_1` | Horizontal Close | Theo chiều ngang, đóng lại. Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 92 | `Landscape_Close_1` | Landscape Close | Đóng lại. Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 93 | `Vertical_Open_1` | Vertical Open | Theo chiều dọc, mở ra. Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 94 | `Camera_Focus_1` | Camera Focus | Máy quay, lấy nét. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_blur=0.25[0~1] |
| 95 | `Portrait_Open_1` | Portrait Open | Mở ra. Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 96 | `TV_Off_1` | TV Off | (Suy từ tên 'TV Off') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_horizontal_chromatic=0.6[0~1]; effects_adjust_vertical_chromatic=0.6[0~1] |
| 97 | `Camera_Focus_2_1` | Camera Focus 2 | Máy quay, lấy nét. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_blur=0.5[0~1] |
| 98 | `Vertical_Close_1` | Vertical Close | Theo chiều dọc, đóng lại. Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 99 | `TV_On_1` | TV On | (Suy từ tên 'TV On') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_intensity=0.5[0~1]; effects_adjust_speed=0.33[0~1]; effects_adjust_horizontal_chromatic=0.6[0~1]; effects_adjust_vertical_chromatic=0.6[0~1] |
| 100 | `Low_Exposure` | Low Exposure | (Suy từ tên 'Low Exposure') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1] |
| 101 | `To_Color_1` | To Color | Màu. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1] |
| 102 | `Wipe_Board_1` | Wipe Board | Gạt/quét ngang. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1] |
| 103 | `Vertical_Blur_1` | Vertical Blur | Theo chiều dọc, làm mờ. Phủ TOÀN khung — nhấn không khí/cao trào. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | effects_adjust_blur=0.5[0~1] |
| 104 | `White_Out` | White Out | Trắng. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1] |
| 105 | `Rebound_Swing_1` | Rebound Swing | (Suy từ tên 'Rebound Swing') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.333[0~1]; effects_adjust_size=0.5[0~1]; effects_adjust_intensity=0[0~1] |
| 106 | `Astral_1` | Astral | Bóng ma/phân thân — tạo vệt mờ ethereal như hồn lìa khỏi xác. Dùng cho khoảnh khắc siêu thực, ảo, chuyển cảnh huyền bí. (biến thể) | effects_adjust_speed=0.33[0~1]; effects_adjust_range=1[0~1] |
| 107 | `Disco_Ball_1_1` | Disco Ball 1 | Disco nhấp nháy. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 108 | `Color_Phosphor_1` | Color Phosphor | Màu. Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 109 | `Camera_Shake_1` | Camera Shake | Rung máy quay chân thực — nhấn cú sốc/mạnh, tăng năng lượng. (biến thể) | effects_adjust_range=0.15[0~1]; effects_adjust_speed=0.33[0~1] |
| 110 | `Pulse_1` | Pulse | Đập theo nhịp. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1] |
| 111 | `Shake_4` | Shake | Rung lắc máy quay. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_speed=0.33[0~1]; effects_adjust_intensity=0.5[0~1] |
| 112 | `Shockwave` | Shockwave | (Suy từ tên 'Shockwave') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1] |
| 113 | `Heart_Disco_1` | Heart Disco | Tim bay nhấp nháy kiểu disco — vui, tích cực, 'thả tim'. (biến thể) | effects_adjust_speed=0.333[0~1]; effects_adjust_background_animation=1[0~1]; effects_adjust_filter=0.634[0~1] |
| 114 | `Shake_3_1` | Shake 3 | Rung lắc máy quay. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_speed=0.33[0~1]; effects_adjust_horizontal_chromatic=0.75[0~1]; effects_adjust_vertical_chromatic=0.75[0~1] |
| 115 | `Black_Flash_2` | Black Flash 2 | Tối/đen, loé sáng chớp. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_speed=0.8[0~1]; effects_adjust_intensity=0.2[0~1]; effects_adjust_size=0.25[0~1]; effects_adjust_distortion=0.4[0~1] |
| 116 | `Throb` | Throb | (Suy từ tên 'Throb') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_luminance=0.8[0~1]; effects_adjust_intensity=0.9[0~1]; effects_adjust_filter=1[0~1]; effects_adjust_range=0.7[0~1] |
| 117 | `Strobe_1` | Strobe | Nhấp nháy mạnh. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_speed=1[0~1] |
| 118 | `Shake_5` | Shake | Rung lắc máy quay. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_speed=0.5[0~1]; effects_adjust_range=0.5[0~1] |
| 119 | `White_Flash_1` | White Flash | Trắng, loé sáng chớp. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_speed=0.33[0~1] |
| 120 | `Flicker_1` | Flicker | Chập chờn. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1] |
| 121 | `Colorful` | Colorful | (Suy từ tên 'Colorful') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_filter=1[0~1] |
| 122 | `Club_Mood` | Club Mood | (Suy từ tên 'Club Mood') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_filter=1[0~1] |
| 123 | `Neon_Outline` | Neon Outline | Đèn neon rực. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_intensity=1[0~1] |
| 124 | `RGB_Border` | RGB Border | Viền RGB tách màu quanh khung — nhấn căng thẳng/công nghệ, hợp đoạn 'thuật toán/AI'. | effects_adjust_speed=0.67[0~1]; effects_adjust_horizontal_shift=1[0~1]; effects_adjust_vertical_shift=0.5[0~1] |
| 125 | `Black_Flash_1` | Black Flash | Tối/đen, loé sáng chớp. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_speed=0.33[0~1] |
| 126 | `Blur_1` | Blur | Làm mờ. Phủ TOÀN khung — nhấn không khí/cao trào. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | effects_adjust_blur=1[0~1]; effects_adjust_range=1[0~1] |
| 127 | `Disco` | Disco | Disco nhấp nháy. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_speed=0.33[0~1] |
| 128 | `Delay` | Delay | (Suy từ tên 'Delay') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=1[0~1] |
| 129 | `Neon_Swing` | Neon Swing | Đèn neon rực. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_luminance=1[0~1] |
| 130 | `Shadow` | Shadow | (Suy từ tên 'Shadow') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_horizontal_chromatic=0.75[0~1]; effects_adjust_vertical_chromatic=0.75[0~1]; effects_adjust_range=1[0~1] |
| 131 | `Color_Flame` | Color Flame | Màu, ngọn lửa. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_intensity=1[0~1]; effects_adjust_color=1[0~1] |
| 132 | `Rainbow_Haze` | Rainbow Haze | Cầu vồng. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=1[0~1]; effects_adjust_filter=1[0~1] |
| 133 | `Unreal` | Unreal | (Suy từ tên 'Unreal') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=1[0~1] |
| 134 | `Flashing_Frame` | Flashing Frame | Khung viền. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.8[0~1]; effects_adjust_filter=0.8[0~1] |
| 135 | `Trippy` | Trippy | (Suy từ tên 'Trippy') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=1[0~1]; effects_adjust_filter=1[0~1] |
| 136 | `Orange_Negative` | Orange Negative | (Suy từ tên 'Orange Negative') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_color=1[0~1] |
| 137 | `White_Border` | White Border | Trắng, viền khung. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_horizontal_shift=0.5[0~1]; effects_adjust_vertical_shift=0.5[0~1] |
| 138 | `Color_Negative` | Color Negative | Màu. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_color=1[0~1] |
| 139 | `Stuck_Frame` | Stuck Frame | Khung viền. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_size=0[0~1]; effects_adjust_speed=0.33[0~1] |
| 140 | `Zoom_Lens_1` | Zoom Lens | Zoom kiểu ống kính máy ảnh — nhấn chủ thể, lấy nét. (biến thể) | effects_adjust_speed=0.33[0~1]; effects_adjust_range=0.3[0~1] |
| 141 | `Mini_Zoom_1` | Mini Zoom | Zoom nhẹ nhanh — punch-in tinh tế nhấn từ khoá. (biến thể) | effects_adjust_speed=0.33[0~1]; effects_adjust_range=0.5[0~1] |
| 142 | `Magnifying_Glass` | Magnifying Glass | Kính vỡ. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_color=1[0~1]; effects_adjust_size=0.5[0~1]; effects_adjust_intensity=1[0~1]; effects_adjust_vertical_shift=0.5[0~1]; effects_adjust_horizontal_shift=0.5[0~1] |
| 143 | `Wide_Angle` | Wide Angle | Góc nhìn. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_intensity=0.45[0~1] |
| 144 | `Heart_Magnifier` | Heart Magnifier | Tim phóng to bằng kính lúp — đáng yêu, nhấn cảm xúc. | effects_adjust_size=0.5[0~1]; effects_adjust_intensity=0.5[0~1]; effects_adjust_color=0[0~1]; effects_adjust_vertical_shift=0.5[0~1]; effects_adjust_horizontal_shift=0.5[0~1]; effects_adjust_blur=0[0~1] |
| 145 | `Chrome_Blur` | Chrome Blur | Ánh kim loại, làm mờ. Phủ TOÀN khung — nhấn không khí/cao trào. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | effects_adjust_blur=0.25[0~1]; effects_adjust_horizontal_chromatic=0.55[0~1] |
| 146 | `Fisheye_4` | Fisheye 4 | (Suy từ tên 'Fisheye 4') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_intensity=0.6[0~1]; effects_adjust_filter=0.6[0~1]; effects_adjust_size=0.35[0~1]; effects_adjust_texture=0.55[0~1] |
| 147 | `Swing_1` | Swing | (Suy từ tên 'Swing') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | — |
| 148 | `Cinema` | Cinema | Điện ảnh. Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 149 | `Rotary_Focus` | Rotary Focus | Lấy nét. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_intensity=1[0~1]; effects_adjust_speed=0.33[0~1] |
| 150 | `Blink` | Blink | Chớp tắt. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1] |
| 151 | `Chromatic_Quirk` | Chromatic Quirk | Sai sắc viền màu. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_horizontal_chromatic=0.6[0~1]; effects_adjust_vertical_chromatic=0.5[0~1] |
| 152 | `Backlit_Focus` | Backlit Focus | Ngược sáng viền, lấy nét. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_soft=0.7[0~1]; effects_adjust_speed=0.33[0~1]; effects_adjust_blur=0.33[0~1] |
| 153 | `Hazy` | Hazy | (Suy từ tên 'Hazy') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_blur=0.5[0~1]; effects_adjust_horizontal_shift=0.5[0~1]; effects_adjust_vertical_shift=0.5[0~1] |
| 154 | `Blackout` | Blackout | Tối sầm. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_blur=0.7[0~1]; effects_adjust_sharpen=0.8[0~1] |
| 155 | `Mirror` | Mirror | Phản chiếu đối xứng. Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 156 | `Fisheye` | Fisheye | (Suy từ tên 'Fisheye') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_distortion=0.77[0~1] |
| 157 | `Fisheye_2` | Fisheye 2 | (Suy từ tên 'Fisheye 2') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0[0~1]; effects_adjust_filter=1[0~1]; effects_adjust_range=0.5[0~1]; effects_adjust_size=1[0~1]; effects_adjust_distortion=0.8[0~1] |
| 158 | `VX1000` | VX1000 | (Suy từ tên 'VX1000') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_distortion=0.9[0~1]; effects_adjust_horizontal_chromatic=0.6[0~1]; effects_adjust_filter=0.8[0~1]; effects_adjust_blur=0.2[0~1]; effects_adjust_sharpen=0.2[0~1] |
| 159 | `Binoculars` | Binoculars | Khung ống nhòm. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1] |
| 160 | `Spectrum_Scan_1` | Spectrum Scan | Quét dòng. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_background_animation=0[0~1]; effects_adjust_intensity=0.614[0~1]; effects_adjust_luminance=0.642[0~1]; effects_adjust_speed=0.333[0~1]; effects_adjust_range=0.333[0~1] |
| 161 | `Explosion_1` | Explosion | Nổ bung. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 162 | `Tree_Shade` | Tree Shade | (Suy từ tên 'Tree Shade') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 163 | `By_the_Fireplace_1` | By the Fireplace | Ánh lửa lò sưởi ấm áp — cozy, tâm sự nhẹ nhàng. (biến thể) | effects_adjust_speed=0.2[0~1]; sticker=1[0~1]; effects_adjust_filter=0.4[0~1] |
| 164 | `Leak_1_1` | Leak 1 | Loé sáng lọt khung. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 165 | `Angel` | Angel | Thiên thần/hào quang. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_intensity=1[0~1] |
| 166 | `Sunset_4` | Sunset 4 | (Suy từ tên 'Sunset 4') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 167 | `Spark` | Spark | Tia lửa. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 168 | `Meteor_1` | Meteor | (Suy từ tên 'Meteor') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 169 | `Bluray_Scanning_1` | Blu-ray Scanning | Quét dòng. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_luminance=0.5[0~1]; effects_adjust_blur=0.3[0~1]; effects_adjust_intensity=0.3[0~1]; effects_adjust_speed=0.333[0~1]; effects_adjust_range=0.7[0~1] |
| 170 | `Leak_2_2` | Leak 2 | Loé sáng lọt khung. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 171 | `Dizzy_1` | Dizzy | (Suy từ tên 'Dizzy') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_size=0.7[0~1]; effects_adjust_speed=0.333[0~1]; effects_adjust_background_animation=0.8[0~1]; effects_adjust_filter=0.9[0~1]; effects_adjust_texture=0.9[0~1]; effects_adjust_color=0.9[0~1] |
| 172 | `Collision_Sparks_1` | Collision Sparks | Tia lửa bắn. Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 173 | `Spark_2` | Spark 2 | Tia lửa. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 174 | `Pool_Reflection` | Pool Reflection | (Suy từ tên 'Pool Reflection') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_size=0.6[0~1]; effects_adjust_filter=1[0~1]; effects_adjust_color=0[0~1]; effects_adjust_distortion=0.15[0~1] |
| 175 | `Magic` | Magic | (Suy từ tên 'Magic') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.336[0~1]; effects_adjust_filter=0.802[0~1]; effects_adjust_background_animation=1[0~1] |
| 176 | `Blinds_2` | Blinds 2 | Rèm sọc. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_background_animation=1[0~1] |
| 177 | `Negative_Strobe` | Negative Strobe | Nhấp nháy mạnh. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_color=0[0~1]; effects_adjust_speed=0.45[0~1]; effects_adjust_filter=0.85[0~1] |
| 178 | `Negative_Strobe_1` | Negative Strobe | Nhấp nháy mạnh. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_color=0[0~1]; effects_adjust_speed=0.45[0~1]; effects_adjust_filter=0.85[0~1] |
| 179 | `Halo` | Halo | Vòng hào quang. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 180 | `Rainbow_Sparkle` | Rainbow Sparkle | Cầu vồng, lấp lánh. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1]; effects_adjust_filter=1[0~1] |
| 181 | `Tree_Shade_2` | Tree Shade 2 | (Suy từ tên 'Tree Shade 2') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 182 | `Halo_2_1` | Halo 2 | Vòng hào quang. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 183 | `Light_leak` | Light leak | Loé sáng lọt khung kiểu film analog — ấm, điện ảnh, chuyển cảnh mượt/cảm xúc. | effects_adjust_texture=1[0~1] |
| 184 | `Window` | Window | (Suy từ tên 'Window') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_background_animation=1[0~1] |
| 185 | `Flash` | Flash | Loé sáng chớp. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_speed=0.33[0~1] |
| 186 | `Blinds` | Blinds | Rèm sọc. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_background_animation=1[0~1] |
| 187 | `Flame_Frame` | Flame Frame | Ngọn lửa, khung viền. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_color=0.35[0~1]; effects_adjust_filter=0.7[0~1]; effects_adjust_speed=0.4[0~1]; effects_adjust_size=0.6[0~1]; effects_adjust_intensity=0.6[0~1] |
| 188 | `Cold_Lab` | Cold Lab | (Suy từ tên 'Cold Lab') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_range=1[0~1]; effects_adjust_intensity=0.267[0~1]; effects_adjust_filter=1[0~1]; effects_adjust_speed=0.33[0~1] |
| 189 | `Glowburst` | Glowburst | (Suy từ tên 'Glowburst') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 190 | `Electro_Heart` | Electro Heart | Tim điện neon — yêu thích/năng lượng. | effects_adjust_range=0.5[0~1]; effects_adjust_speed=0.419[0~1]; effects_adjust_intensity=0.473[0~1]; effects_adjust_color=0.59[0~1]; effects_adjust_size=1[0~1]; effects_adjust_horizontal_shift=1[0~1] |
| 191 | `Develop` | Develop | (Suy từ tên 'Develop') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1]; effects_adjust_soft=1[0~1] |
| 192 | `Electro_Border_1` | Electro Border | Điện, viền khung. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_color=1[0~1]; effects_adjust_horizontal_shift=1[0~1]; effects_adjust_speed=0.5[0~1]; effects_adjust_size=0.6[0~1]; effects_adjust_intensity=0.5[0~1]; effects_adjust_rotate=0.5[0~1] |
| 193 | `Train_Window` | Train Window | (Suy từ tên 'Train Window') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 194 | `Film_Frame` | Film Frame | Khung viền cuộn phim — phong cách điện ảnh/máy chiếu. | — |
| 195 | `Dark_Night` | Dark Night | (Suy từ tên 'Dark Night') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1]; effects_adjust_texture=1[0~1]; effects_adjust_range=1[0~1] |
| 196 | `Noise_1` | Noise 1 | Nhiễu hạt. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_speed=0.33[0~1] |
| 197 | `Noise_2_1` | Noise 2 | Nhiễu hạt. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_speed=0.33[0~1] |
| 198 | `Black_Noise_1` | Black Noise | Tối/đen, nhiễu hạt. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_speed=0.33[0~1] |
| 199 | `Retro_Film` | Retro Film | Tông phim nhựa cũ — hạt, ngả màu. HOÀI NIỆM/kể chuyện. | effects_adjust_speed=0.301[0~1]; effects_adjust_filter=0.801[0~1] |
| 200 | `Film_Frame_2` | Film Frame 2 | Khung viền cuộn phim — phong cách điện ảnh/máy chiếu. (biến thể) | — |
| 201 | `Rolling_Film_1` | Rolling Film | Phim nhựa/điện ảnh. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp tông HOÀI NIỆM/kể chuyện/nhìn lại. | effects_adjust_filter=0.7[0~1]; effects_adjust_speed=0.5[0~1] |
| 202 | `_1998` | 1998 | (Suy từ tên '1998') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1]; effects_adjust_texture=1[0~1] |
| 203 | `Reversal_Film` | Reversal Film | Phim nhựa/điện ảnh. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp tông HOÀI NIỆM/kể chuyện/nhìn lại. | effects_adjust_filter=0.7[0~1]; effects_adjust_intensity=0[0~1]; effects_adjust_color=0[0~1]; effects_adjust_texture=1[0~1] |
| 204 | `Leak_2_3` | Leak 2 | Loé sáng lọt khung. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_intensity=1[0~1]; effects_adjust_speed=0.25[0~1]; effects_adjust_range=0.47[0~1]; effects_adjust_blur=0.4[0~1]; effects_adjust_noise=0.3[0~1]; effects_adjust_filter=0.5[0~1] |
| 205 | `Film_2` | Film 2 | Phim nhựa/điện ảnh. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp tông HOÀI NIỆM/kể chuyện/nhìn lại. | effects_adjust_horizontal_chromatic=0.55[0~1]; effects_adjust_vertical_chromatic=0.55[0~1] |
| 206 | `Glitch` | Glitch | Nhiễu/trục trặc số. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_speed=0.33[0~1]; effects_adjust_filter=1[0~1]; effects_adjust_range=1[0~1] |
| 207 | `Fuzzy_1` | Fuzzy | (Suy từ tên 'Fuzzy') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_intensity=1[0~1]; effects_adjust_horizontal_chromatic=0.75[0~1]; effects_adjust_vertical_chromatic=0.5[0~1] |
| 208 | `Chromatic_1` | Chromatic | Sai sắc viền màu. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_intensity=1[0~1]; effects_adjust_horizontal_chromatic=0.6[0~1] |
| 209 | `Spooky_Camera_1` | Spooky Camera | Rùng rợn, máy quay. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_filter=0.6[0~1]; effects_adjust_background_animation=0.3[0~1]; effects_adjust_sharpen=0.5[0~1]; effects_adjust_texture=0.8[0~1]; sticker=0.4[0~1] |
| 210 | `Level_Glitch_2` | Level Glitch 2 | Trục trặc dữ liệu nhiều lớp — mạnh hơn glitch thường, hợp cao trào tiêu cực. (biến thể) | effects_adjust_speed=0.33[0~1] |
| 211 | `Spooky_Camera_2` | Spooky Camera | Rùng rợn, máy quay. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_filter=0.6[0~1]; effects_adjust_background_animation=0.3[0~1]; effects_adjust_sharpen=0.5[0~1]; effects_adjust_texture=0.8[0~1]; sticker=0.4[0~1] |
| 212 | `Color_Glitch` | Color Glitch | Màu, nhiễu/trục trặc số. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_speed=0.33[0~1] |
| 213 | `Chromozoom` | Chromo-zoom | Zoom giật kèm TÁCH MÀU RGB ở rìa — nhấn cú punch năng lượng cao, hợp beat nhạc/câu gắt. | effects_adjust_speed=0.33[0~1]; effects_adjust_size=0.33[0~1] |
| 214 | `XSignal` | X-Signal | Mất tín hiệu. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1] |
| 215 | `_70s` | 70's | (Suy từ tên '70's') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1] |
| 216 | `Distort` | Distort | (Suy từ tên 'Distort') Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1] |
| 217 | `Invisible_Person` | Invisible Person | (Suy từ tên 'Invisible Person') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_intensity=0.5[0~1]; effects_adjust_filter=1[0~1]; effects_adjust_speed=0.35[0~1] |
| 218 | `Invisible_Person_1` | Invisible Person | (Suy từ tên 'Invisible Person') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_intensity=0.5[0~1]; effects_adjust_filter=1[0~1]; effects_adjust_speed=0.35[0~1] |
| 219 | `Invisible_Person_2` | Invisible Person | (Suy từ tên 'Invisible Person') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_intensity=0.5[0~1]; effects_adjust_filter=1[0~1]; effects_adjust_speed=0.35[0~1] |
| 220 | `Invisible_Person_3` | Invisible Person | (Suy từ tên 'Invisible Person') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_intensity=0.5[0~1]; effects_adjust_filter=1[0~1]; effects_adjust_speed=0.35[0~1] |
| 221 | `Distort_1` | Distort | (Suy từ tên 'Distort') Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1] |
| 222 | `_70s_1` | 70's | (Suy từ tên '70's') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1] |
| 223 | `Color_Glitch_2` | Color Glitch 2 | Màu, nhiễu/trục trặc số. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_speed=0.33[0~1]; effects_adjust_horizontal_chromatic=0.75[0~1]; effects_adjust_vertical_chromatic=0.5[0~1] |
| 224 | `Bad_TV_` | Bad TV  | Nhiễu TIVI HỎNG — vạch quét, méo hình như tivi trục trặc. Hợp đoạn tiêu cực/hỗn loạn hoặc chuyển cảnh glitch. | effects_adjust_intensity=1[0~1] |
| 225 | `Snow_Glitch` | Snow Glitch | Nhiễu hạt tuyết + glitch — lạnh lẽo, trục trặc. | effects_adjust_range=0.15[0~1]; effects_adjust_noise=0.5[0~1]; effects_adjust_horizontal_chromatic=0.55[0~1] |
| 226 | `Color_Glitch_1` | Color Glitch | Màu, nhiễu/trục trặc số. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_speed=0.33[0~1]; effects_adjust_intensity=1[0~1]; effects_adjust_horizontal_chromatic=0.67[0~1]; effects_adjust_vertical_chromatic=0.5[0~1] |
| 227 | `Ethereal` | Ethereal | Huyền ảo. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_filter=1[0~1]; effects_adjust_size=1[0~1]; effects_adjust_rotate=1[0~1]; effects_adjust_blur=0.5[0~1] |
| 228 | `Ethereal_1` | Ethereal | Huyền ảo. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_filter=1[0~1]; effects_adjust_size=1[0~1]; effects_adjust_rotate=1[0~1]; effects_adjust_blur=0.5[0~1] |
| 229 | `Level_Glitch` | Level Glitch | Trục trặc dữ liệu nhiều lớp — mạnh hơn glitch thường, hợp cao trào tiêu cực. | effects_adjust_speed=0.33[0~1] |
| 230 | `Edgy` | Edgy | (Suy từ tên 'Edgy') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_horizontal_chromatic=0.75[0~1]; effects_adjust_vertical_chromatic=0.5[0~1] |
| 231 | `Ripples` | Ripples | (Suy từ tên 'Ripples') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_distortion=1[0~1] |
| 232 | `Ripple_1` | Ripple | Lăn tăn. Phủ TOÀN khung — nhấn không khí/cao trào. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | effects_adjust_sharpen=0.35[0~1]; effects_adjust_blur=0.5[0~1]; effects_adjust_size=0.2[0~1]; effects_adjust_speed=0.2[0~1]; effects_adjust_intensity=0.4[0~1]; effects_adjust_distortion=0.55[0~1] |
| 233 | `Screen_Pulse` | Screen Pulse | Màn hình, đập theo nhịp. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.6[0~1]; effects_adjust_intensity=0.6[0~1]; effects_adjust_size=0.333[0~1] |
| 234 | `Spinning_Space` | Spinning Space | (Suy từ tên 'Spinning Space') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_size=0.336[0~1]; effects_adjust_distortion=0.7[0~1]; effects_adjust_rotate=0.667[0~1]; effects_adjust_filter=0.801[0~1]; effects_adjust_number=1[0~1] |
| 235 | `Distorted` | Distorted | (Suy từ tên 'Distorted') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | — |
| 236 | `Gentle_Ripples` | Gentle Ripples | (Suy từ tên 'Gentle Ripples') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_distortion=0.333[0~1] |
| 237 | `Jittered_Ripples_3` | Jittered Ripples 3 | (Suy từ tên 'Jittered Ripples 3') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.333[0~1] |
| 238 | `White_Diffusion` | White Diffusion | Trắng. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.333[0~1] |
| 239 | `Rippling` | Rippling | (Suy từ tên 'Rippling') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_range=0.35[0~1]; effects_adjust_intensity=0.35[0~1] |
| 240 | `Jittered_Ripples` | Jittered Ripples | (Suy từ tên 'Jittered Ripples') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.333[0~1] |
| 241 | `Jittered_Ripples_2` | Jittered Ripples 2 | (Suy từ tên 'Jittered Ripples 2') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.333[0~1] |
| 242 | `Vortex_Setting` | Vortex Setting | (Suy từ tên 'Vortex Setting') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_intensity=0.5[0~1] |
| 243 | `Firefly` | Firefly | (Suy từ tên 'Firefly') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 244 | `Firefly_1` | Firefly | (Suy từ tên 'Firefly') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 245 | `Heart_Kisses_1` | Heart Kisses | Trái tim, nụ hôn. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 246 | `Sun` | Sun | Nắng. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 247 | `Cherry_Blossom` | Cherry Blossom | (Suy từ tên 'Cherry Blossom') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 248 | `Rain` | Rain | Rơi như mưa. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 249 | `Mist` | Mist | (Suy từ tên 'Mist') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 250 | `Soft_Rose` | Soft Rose | Dịu nhẹ. Phủ TOÀN khung — nhấn không khí/cao trào. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 251 | `Purple_Mist` | Purple Mist | (Suy từ tên 'Purple Mist') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 252 | `Flipped_1` | Flipped | (Suy từ tên 'Flipped') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1] |
| 253 | `Feathers` | Feathers | (Suy từ tên 'Feathers') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 254 | `Butterfly_Dream_1` | Butterfly Dream | Bướm bay, mơ màng. Phủ TOÀN khung — nhấn không khí/cao trào. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 255 | `Starry` | Starry | Bầu trời đầy sao lấp lánh — mơ mộng/tích cực. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 256 | `Girls_Secrets_1` | Girl's Secrets | (Suy từ tên 'Girl's Secrets') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1]; effects_adjust_filter=1[0~1] |
| 257 | `Pink_Hearts` | Pink Hearts | Hồng, nhiều trái tim. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 258 | `Luminance` | Luminance | (Suy từ tên 'Luminance') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_intensity=1[0~1]; effects_adjust_filter=1[0~1]; effects_adjust_rotate=0.4[0~1] |
| 259 | `Fire` | Fire | Lửa. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 260 | `Lightning_1` | Lightning | Tia chớp/sấm sét. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_color=0.7[0~1]; effects_adjust_luminance=0.4[0~1]; effects_adjust_speed=0.4[0~1]; effects_adjust_rotate=1[0~1]; sticker=1[0~1]; effects_adjust_filter=0.8[0~1] |
| 261 | `Lightning_Crack_1` | Lightning Crack | Tia chớp/sấm sét, nứt vỡ. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_distortion=0.5[0~1]; effects_adjust_speed=0.8[0~1]; sticker=1[0~1]; effects_adjust_filter=0.7[0~1] |
| 262 | `Heartbeat_1` | Heartbeat | Đập như nhịp tim. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1] |
| 263 | `Camcorder_3` | Camcorder 3 | Khung máy quay cũ (REC). Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 264 | `Camcorder_2` | Camcorder 2 | Khung máy quay cũ (REC). Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 265 | `BW_VHS` | B&W VHS | Băng VHS đen trắng cũ — nhiễu hạt, vạch băng từ. Tông HOÀI NIỆM/retro, kể chuyện quá khứ. | effects_adjust_intensity=0.5[0~1]; effects_adjust_filter=1[0~1]; effects_adjust_speed=0.33[0~1]; effects_adjust_horizontal_chromatic=0.53[0~1]; effects_adjust_vertical_chromatic=0.43[0~1] |
| 266 | `Camcorder_1` | Camcorder | Khung máy quay cũ (REC). Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 267 | `Frame_1` | Frame 1 | Khung viền. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_noise=1[0~1] |
| 268 | `Photo_Frame` | Photo Frame | Khung viền. Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 269 | `Old_TV_2_1` | Old TV 2 | Cũ kỹ. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp tông HOÀI NIỆM/kể chuyện/nhìn lại. | effects_adjust_speed=0.33[0~1] |
| 270 | `TV_Lines` | TV Lines | Đường kẻ. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_texture=1[0~1]; effects_adjust_range=1[0~1]; effects_adjust_distortion=1[0~1] |
| 271 | `Retro_Cam` | Retro Cam | Hoài cổ retro. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp tông HOÀI NIỆM/kể chuyện/nhìn lại. | — |
| 272 | `Graphic_3` | Graphic 3 | (Suy từ tên 'Graphic 3') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | — |
| 273 | `Noise` | Noise | Nhiễu hạt. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_noise=0.5[0~1] |
| 274 | `White_Sprockets` | White Sprockets | Trắng. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_texture=1[0~1] |
| 275 | `Insta` | Insta | (Suy từ tên 'Insta') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | — |
| 276 | `Jitter` | Jitter | (Suy từ tên 'Jitter') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_range=0.25[0~1] |
| 277 | `_1998_1` | 1998 | (Suy từ tên '1998') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1]; effects_adjust_texture=1[0~1] |
| 278 | `Constellation` | Constellation | (Suy từ tên 'Constellation') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 279 | `Mini_stars_II` | Mini stars II | Nhẹ, sao lấp lánh. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 280 | `Mini_Stars` | Mini Stars | Nhẹ, sao lấp lánh. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 281 | `Star_Rain` | Star Rain | Ngôi sao, rơi như mưa. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 282 | `Daily` | Daily | (Suy từ tên 'Daily') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_size=0.33[0~1]; effects_adjust_number=1[0~1]; effects_adjust_filter=1[0~1]; effects_adjust_rotate=0[0~1] |
| 283 | `Gleam_1` | Gleam | (Suy từ tên 'Gleam') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_size=1[0~1]; effects_adjust_luminance=0.55[0~1]; effects_adjust_range=0.65[0~1]; effects_adjust_color=0[0~1]; effects_adjust_intensity=1[0~1]; effects_adjust_soft=0.4[0~1]; effects_adjust_filter=0.8[0~1] |
| 284 | `Star_Rain_2` | Star Rain 2 | Ngôi sao, rơi như mưa. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 285 | `Color_Diamond` | Color Diamond | Màu, hình kim cương lấp lánh. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_size=0.2[0~1]; effects_adjust_number=0.5[0~1]; effects_adjust_filter=0.7[0~1]; effects_adjust_rotate=0[0~1] |
| 286 | `Daily_2` | Daily 2 | (Suy từ tên 'Daily 2') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_size=0.33[0~1]; effects_adjust_number=1[0~1]; effects_adjust_filter=1[0~1]; effects_adjust_rotate=0[0~1] |
| 287 | `Daily_4` | Daily 4 | (Suy từ tên 'Daily 4') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_size=0.33[0~1]; effects_adjust_number=1[0~1]; effects_adjust_filter=1[0~1]; effects_adjust_rotate=0[0~1] |
| 288 | `Polychromatic` | Polychromatic | (Suy từ tên 'Polychromatic') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_size=0[0~1]; effects_adjust_number=0.3[0~1]; effects_adjust_filter=0.8[0~1] |
| 289 | `Milky_Way_2` | Milky Way 2 | (Suy từ tên 'Milky Way 2') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_filter=0.6[0~1] |
| 290 | `Iridescent` | Iridescent | (Suy từ tên 'Iridescent') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 291 | `Torn_Frames` | Torn Frames | (Suy từ tên 'Torn Frames') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_filter=0.8[0~1] |
| 292 | `Torn_Frames_1` | Torn Frames | (Suy từ tên 'Torn Frames') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_filter=0.8[0~1] |
| 293 | `Torn_Frames_2` | Torn Frames | (Suy từ tên 'Torn Frames') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_filter=0.8[0~1] |
| 294 | `Torn_Frames_3` | Torn Frames | (Suy từ tên 'Torn Frames') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_filter=0.8[0~1] |
| 295 | `Folds_4` | Folds 4 | (Suy từ tên 'Folds 4') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_texture=1[0~1] |
| 296 | `Blue_Mosaic` | Blue Mosaic | Xanh dương, ô vuông mờ mặt. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_texture=0.5[0~1]; effects_adjust_size=0.7[0~1]; effects_adjust_filter=1[0~1] |
| 297 | `Dot_Silkscreen` | Dot Silkscreen | (Suy từ tên 'Dot Silkscreen') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_texture=0.6[0~1]; effects_adjust_filter=1[0~1]; effects_adjust_color=0.5[0~1]; effects_adjust_size=0.5[0~1] |
| 298 | `Folds_5` | Folds 5 | (Suy từ tên 'Folds 5') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_texture=1[0~1] |
| 299 | `Paper_Tear` | Paper Tear | (Suy từ tên 'Paper Tear') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_texture=1[0~1] |
| 300 | `Painting` | Painting | (Suy từ tên 'Painting') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_texture=1[0~1]; effects_adjust_filter=1[0~1] |
| 301 | `Dot_Silkscreen_1` | Dot Silkscreen | (Suy từ tên 'Dot Silkscreen') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_texture=0.6[0~1]; effects_adjust_filter=1[0~1]; effects_adjust_color=0.5[0~1]; effects_adjust_size=0.5[0~1] |
| 302 | `Striped_Glass` | Striped Glass | Kính vỡ. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_distortion=1[0~1]; effects_adjust_horizontal_shift=0[0~1]; effects_adjust_blur=0.2[0~1]; effects_adjust_rotate=0[0~1]; effects_adjust_size=0.5[0~1] |
| 303 | `Folds_2` | Folds 2 | (Suy từ tên 'Folds 2') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_texture=1[0~1] |
| 304 | `Folds_4_1` | Folds 4 | (Suy từ tên 'Folds 4') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_texture=1[0~1] |
| 305 | `Grain` | Grain | Hạt phim. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp tông HOÀI NIỆM/kể chuyện/nhìn lại. | effects_adjust_texture=1[0~1] |
| 306 | `Old` | Old | Cũ kỹ. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp tông HOÀI NIỆM/kể chuyện/nhìn lại. | effects_adjust_texture=1[0~1]; effects_adjust_background_animation=1[0~1] |
| 307 | `Folds` | Folds | (Suy từ tên 'Folds') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_texture=1[0~1] |
| 308 | `Energy` | Energy | (Suy từ tên 'Energy') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | — |
| 309 | `Neon` | Neon | Đèn neon rực. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_background_animation=1[0~1] |
| 310 | `Fire_Edges` | Fire Edges | Lửa. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1] |
| 311 | `Warning` | Warning | (Suy từ tên 'Warning') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | — |
| 312 | `BW_Sketch` | B&W Sketch | Phác hoạ chì. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp tông HOÀI NIỆM/kể chuyện/nhìn lại. | effects_adjust_background_animation=1[0~1] |
| 313 | `Quick_Math` | Quick Math | (Suy từ tên 'Quick Math') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | — |
| 314 | `Flames` | Flames | (Suy từ tên 'Flames') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1] |
| 315 | `Question_Marks` | Question Marks | Dấu hỏi. Phủ TOÀN khung — nhấn không khí/cao trào. | — |
| 316 | `Splice` | Splice | (Suy từ tên 'Splice') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | — |
| 317 | `Mosaic` | Mosaic | Ô vuông mờ mặt. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_blur=0.5[0~1] |
| 318 | `Cartoon_Border` | Cartoon Border | Hoạt hình, viền khung. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.5[0~1]; effects_adjust_blur=0.5[0~1] |
| 319 | `Flames_2` | Flames 2 | (Suy từ tên 'Flames 2') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1] |
| 320 | `Explosion_2` | Explosion | Nổ bung. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_speed=0.33[0~1] |
| 321 | `Super_Like` | Super Like | (Suy từ tên 'Super Like') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_vertical_shift=0[0~1]; effects_adjust_size=0.2[0~1]; effects_adjust_speed=0.5[0~1] |
| 322 | `Oh_My_God` | Oh My God | (Suy từ tên 'Oh My God') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | — |
| 323 | `Dual_Screens` | Dual Screens | (Suy từ tên 'Dual Screens') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | — |
| 324 | `Four_Screens` | Four Screens | (Suy từ tên 'Four Screens') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | — |
| 325 | `Three_Screens` | Three Screens | (Suy từ tên 'Three Screens') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | — |
| 326 | `Split_Screen` | Split Screen | Tách đôi, màn hình. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_speed=0.33[0~1]; effects_adjust_filter=0.8[0~1]; effects_adjust_range=0.1[0~1] |
| 327 | `Trilayer_Mirror_1` | Tri-layer Mirror | Phản chiếu đối xứng. Phủ TOÀN khung — nhấn không khí/cao trào. | effects_adjust_vertical_shift=0.5[0~1]; effects_adjust_filter=0.5[0~1] |
| 328 | `Six_Screens` | Six Screens | (Suy từ tên 'Six Screens') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | — |
| 329 | `Circuit` | Circuit | (Suy từ tên 'Circuit') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | — |
| 330 | `Nine_Screens` | Nine Screens | (Suy từ tên 'Nine Screens') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | — |
| 331 | `Alt_BW` | Alt. B&W | (Suy từ tên 'Alt. B&W') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | — |
| 332 | `Snowflakes` | Snowflakes | (Suy từ tên 'Snowflakes') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 333 | `Snowflakes_1` | Snowflakes | (Suy từ tên 'Snowflakes') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 334 | `Gold_Sparkles` | Gold Sparkles | Vàng kim. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_speed=0.336[0~1]; effects_adjust_filter=0.5[0~1]; effects_adjust_background_animation=1[0~1] |
| 335 | `Xmas_Stars` | Xmas Stars | Giáng sinh, sao lấp lánh. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 336 | `Xmas_Stars_1` | Xmas Stars | Giáng sinh, sao lấp lánh. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 337 | `Snowfall` | Snowfall | (Suy từ tên 'Snowfall') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 338 | `Snowfall_1` | Snowfall | (Suy từ tên 'Snowfall') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 339 | `Fireworks_2_1` | Fireworks 2 | Pháo hoa. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 340 | `Gold_Sequins` | Gold Sequins | Vàng kim. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_filter=0.7[0~1]; effects_adjust_speed=0.5[0~1]; sticker=1[0~1] |
| 341 | `Confetti_II` | Confetti II | (Suy từ tên 'Confetti II') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 342 | `Sparkle_Spiral` | Sparkle Spiral | Lấp lánh. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_speed=0.336[0~1]; effects_adjust_filter=0.5[0~1]; effects_adjust_background_animation=1[0~1] |
| 343 | `Gold_Dust` | Gold Dust | Vàng kim, bụi bay. Phủ TOÀN khung — nhấn không khí/cao trào. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 344 | `Wonderland` | Wonderland | (Suy từ tên 'Wonderland') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |
| 345 | `Wonderland_1` | Wonderland | (Suy từ tên 'Wonderland') Phủ TOÀN khung — nhấn không khí/cao trào. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1] |

## A3. Character effect — Hiệu ứng bám người
**Áp dụng:** `add_effect(effect_type="<key>", effect_category="character")`

> Tổng **95** mục.

| # | key (API) | Tên | Mô tả & khi nào dùng | Tham số/TL |
|---|---|---|---|---|
| 1 | `Woman_4` | Woman 4 | (Suy từ tên 'Woman 4') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_size=0[0~1] |
| 2 | `Face_Mosaic` | Face Mosaic | Khuôn mặt, ô vuông mờ mặt. BÁM theo người — nhấn vào nhân vật. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_range=0.5[0~1]; effects_adjust_size=0.5[0~1] |
| 3 | `Flipped` | Flipped | (Suy từ tên 'Flipped') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.2[0~1]; effects_adjust_filter=0.85[0~1] |
| 4 | `Embarrassed_Face` | Embarrassed Face | Khuôn mặt. BÁM theo người — nhấn vào nhân vật. | — |
| 5 | `In_My_Heart` | In My Heart | Trái tim. BÁM theo người — nhấn vào nhân vật. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_size=0.35[0~1]; effects_adjust_vertical_shift=0.5[0~1]; effects_adjust_horizontal_shift=0.5[0~1]; effects_adjust_speed=0.5[0~1]; effects_adjust_background_animation=1[0~1]; effects_adjust_filter=1[0~1] |
| 6 | `Lightning_Eyes` | Lightning Eyes | Tia chớp/sấm sét, mắt. BÁM theo người — nhấn vào nhân vật. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_color=0.25[0~1]; effects_adjust_luminance=0.25[0~1]; effects_adjust_filter=1[0~1]; effects_adjust_intensity=0.8[0~1]; effects_adjust_range=0.85[0~1] |
| 7 | `Sad` | Sad | (Suy từ tên 'Sad') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_background_animation=1[0~1]; sticker=1[0~1] |
| 8 | `Totem_Flames` | Totem Flames | (Suy từ tên 'Totem Flames') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_color=1[0~1] |
| 9 | `Like` | Like | (Suy từ tên 'Like') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_number=0.5[0~1]; effects_adjust_horizontal_shift=0.5[0~1]; effects_adjust_vertical_shift=0.5[0~1]; effects_adjust_size=0[0~1]; effects_adjust_filter=0.5[0~1]; effects_adjust_speed=0.5[0~1] |
| 10 | `Big_Head` | Big Head | Bóp méo PHÓNG TO ĐẦU — hài hước, nhấn phản ứng bất ngờ/chế giễu. | effects_adjust_speed=0.33[0~1]; effects_adjust_range=0.5[0~1]; effects_adjust_intensity=0.5[0~1] |
| 11 | `Electric_Storm` | Electric Storm | Điện. BÁM theo người — nhấn vào nhân vật. | effects_adjust_speed=0.33[0~1]; effects_adjust_color=1[0~1] |
| 12 | `Heart_Flames` | Heart Flames | Trái tim. BÁM theo người — nhấn vào nhân vật. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_speed=0.33[0~1]; effects_adjust_vertical_shift=0.5[0~1]; effects_adjust_size=0.5[0~1]; effects_adjust_color=1[0~1] |
| 13 | `Electro_Border` | Electro Border | Điện, viền khung. BÁM theo người — nhấn vào nhân vật. | effects_adjust_color=0.85[0~1]; effects_adjust_speed=0.4[0~1]; effects_adjust_size=0.8[0~1]; effects_adjust_intensity=0.35[0~1]; effects_adjust_filter=0.4[0~1] |
| 14 | `Club_Hearts` | Club Hearts | Nhiều trái tim. BÁM theo người — nhấn vào nhân vật. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_speed=0.33[0~1]; effects_adjust_vertical_shift=0.5[0~1]; effects_adjust_size=0.5[0~1]; effects_adjust_color=1[0~1] |
| 15 | `Electric_Shock` | Electric Shock | Điện. BÁM theo người — nhấn vào nhân vật. | effects_adjust_speed=0.33[0~1]; effects_adjust_color=1[0~1] |
| 16 | `Musical_Notes_2` | Musical Notes 2 | (Suy từ tên 'Musical Notes 2') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | — |
| 17 | `Hurricane` | Hurricane | (Suy từ tên 'Hurricane') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_color=1[0~1] |
| 18 | `Woman_3` | Woman 3 | (Suy từ tên 'Woman 3') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_size=0[0~1] |
| 19 | `Cool` | Cool | (Suy từ tên 'Cool') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_size=0.5[0~1]; effects_adjust_vertical_shift=0.5[0~1]; effects_adjust_horizontal_shift=0.5[0~1] |
| 20 | `Lovestruck` | Lovestruck | (Suy từ tên 'Lovestruck') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_filter=0.8[0~1]; effects_adjust_size=0.8[0~1]; effects_adjust_color=0.3[0~1]; effects_adjust_intensity=0.8[0~1] |
| 21 | `Heart_Background` | Heart Background | Trái tim. BÁM theo người — nhấn vào nhân vật. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_size=0.8[0~1]; effects_adjust_color=0[0~1]; effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=1[0~1]; effects_adjust_intensity=1[0~1] |
| 22 | `Star_Trails` | Star Trails | Ngôi sao. BÁM theo người — nhấn vào nhân vật. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | — |
| 23 | `Cutout_Poster` | Cutout Poster | (Suy từ tên 'Cutout Poster') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_vertical_chromatic=0[0~1]; effects_adjust_horizontal_chromatic=0.1[0~1]; effects_adjust_size=0.3[0~1]; effects_adjust_texture=0.661[0~1]; effects_adjust_filter=0.65[0~1]; effects_adjust_speed=0.33[0~1]; effects_adjust_intensity=1[0~1] |
| 24 | `Gorilla_Face` | Gorilla Face | Khuôn mặt. BÁM theo người — nhấn vào nhân vật. | — |
| 25 | `Big_Mouth` | Big Mouth | Bóp méo PHÓNG TO MIỆNG — hài hước, nhấn lúc nói/hét. | — |
| 26 | `Tyndall_Effect` | Tyndall Effect | (Suy từ tên 'Tyndall Effect') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_intensity=0.5[0~1]; effects_adjust_color=0.25[0~1]; effects_adjust_filter=0.5[0~1] |
| 27 | `Musical_Notes` | Musical Notes | (Suy từ tên 'Musical Notes') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | — |
| 28 | `Crackling` | Crackling | (Suy từ tên 'Crackling') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_size=0.5[0~1]; effects_adjust_vertical_shift=0.5[0~1] |
| 29 | `Man_4` | Man 4 | (Suy từ tên 'Man 4') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_size=0[0~1] |
| 30 | `Shape_Trails_2` | Shape Trails 2 | (Suy từ tên 'Shape Trails 2') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | — |
| 31 | `Revolving_Text` | Revolving Text | (Suy từ tên 'Revolving Text') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_filter=0.5[0~1]; effects_adjust_speed=0.25[0~1]; effects_adjust_color=0[0~1]; effects_adjust_intensity=1[0~1] |
| 32 | `Streamer_Stroke` | Streamer Stroke | (Suy từ tên 'Streamer Stroke') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_intensity=0.85[0~1]; effects_adjust_size=0.15[0~1]; effects_adjust_range=0.33[0~1]; effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=0.25[0~1]; effects_adjust_color=0[0~1] |
| 33 | `Hellfire` | Hellfire | Lửa địa ngục. BÁM theo người — nhấn vào nhân vật. | effects_adjust_color=1[0~1]; effects_adjust_speed=0.33[0~1]; effects_adjust_size=0.33[0~1]; effects_adjust_vertical_shift=0.5[0~1] |
| 34 | `Man_3` | Man 3 | (Suy từ tên 'Man 3') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_size=0[0~1] |
| 35 | `Struck` | Struck | (Suy từ tên 'Struck') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_intensity=0.55[0~1] |
| 36 | `Halo_2` | Halo 2 | Vòng hào quang. BÁM theo người — nhấn vào nhân vật. | effects_adjust_vertical_shift=0.5[0~1]; effects_adjust_size=0.5[0~1]; effects_adjust_color=1[0~1] |
| 37 | `Chroma_Diffusion` | Chroma Diffusion | (Suy từ tên 'Chroma Diffusion') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_blur=0.3[0~1]; effects_adjust_horizontal_chromatic=0.65[0~1]; effects_adjust_filter=0.3[0~1]; effects_adjust_size=0.65[0~1] |
| 38 | `Aura` | Aura | Hào quang phát sáng quanh người. BÁM theo người — nhấn vào nhân vật. | effects_adjust_speed=0.33[0~1]; effects_adjust_color=1[0~1] |
| 39 | `Bright_Idea` | Bright Idea | Bóng đèn ý tưởng bật sáng — khoảnh khắc 'À ha!', nhấn mẹo/insight. | effects_adjust_speed=0.33[0~1]; effects_adjust_background_animation=0.6[0~1]; sticker=1[0~1]; effects_adjust_size=0.5[0~1] |
| 40 | `Thermal_Aura` | Thermal Aura | Hào quang phát sáng quanh người. BÁM theo người — nhấn vào nhân vật. | effects_adjust_background_animation=1[0~1]; effects_adjust_filter=0.801[0~1] |
| 41 | `Radiate_Bolts` | Radiate Bolts | (Suy từ tên 'Radiate Bolts') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_color=1[0~1]; effects_adjust_vertical_shift=0.5[0~1]; effects_adjust_size=0.5[0~1] |
| 42 | `Mechanical` | Mechanical | (Suy từ tên 'Mechanical') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_vertical_shift=0.5[0~1]; effects_adjust_size=0.5[0~1]; effects_adjust_color=1[0~1] |
| 43 | `Dopelgangers` | Dopelgangers | (Suy từ tên 'Dopelgangers') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_distortion=0.2[0~1]; effects_adjust_speed=0.5[0~1]; effects_adjust_number=1[0~1]; effects_adjust_intensity=1[0~1]; effects_adjust_rotate=0[0~1] |
| 44 | `Phantom` | Phantom | (Suy từ tên 'Phantom') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_speed=1[0~1]; effects_adjust_intensity=1[0~1] |
| 45 | `Lightning_Bound` | Lightning Bound | Tia chớp/sấm sét. BÁM theo người — nhấn vào nhân vật. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_speed=0.33[0~1]; effects_adjust_vertical_shift=0.5[0~1]; effects_adjust_size=0.5[0~1]; effects_adjust_color=1[0~1] |
| 46 | `Dot_Shadow` | Dot Shadow | (Suy từ tên 'Dot Shadow') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_color=0.6[0~1]; effects_adjust_intensity=0.25[0~1]; effects_adjust_range=0[0~1]; effects_adjust_horizontal_shift=0.5[0~1]; effects_adjust_filter=0.5[0~1] |
| 47 | `Butterfly_Wings` | Butterfly Wings | Bướm bay. BÁM theo người — nhấn vào nhân vật. | effects_adjust_vertical_shift=0.5[0~1]; effects_adjust_size=0.5[0~1]; effects_adjust_color=1[0~1] |
| 48 | `Gas_Flow` | Gas Flow | (Suy từ tên 'Gas Flow') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_size=0.1[0~1]; effects_adjust_filter=0.6[0~1]; effects_adjust_speed=0.67[0~1]; effects_adjust_color=0[0~1] |
| 49 | `Distorted_Whirl` | Distorted Whirl | Cuộn xoáy. BÁM theo người — nhấn vào nhân vật. | effects_adjust_color=0.7[0~1]; effects_adjust_intensity=0.8[0~1]; effects_adjust_luminance=0.5[0~1]; effects_adjust_distortion=1[0~1]; effects_adjust_speed=0.33[0~1] |
| 50 | `Eye_Reflection` | Eye Reflection | (Suy từ tên 'Eye Reflection') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_intensity=0.75[0~1]; effects_adjust_range=0.85[0~1]; effects_adjust_color=0[0~1] |
| 51 | `Color_Fringe` | Color Fringe | Màu. BÁM theo người — nhấn vào nhân vật. | effects_adjust_speed=0.33[0~1]; effects_adjust_intensity=1[0~1]; effects_adjust_filter=0.8[0~1] |
| 52 | `Flame_Eyes_` | Flame Eyes  | Ngọn lửa, mắt. BÁM theo người — nhấn vào nhân vật. | effects_adjust_color=0.15[0~1]; effects_adjust_range=0.4[0~1]; effects_adjust_speed=0.2[0~1]; effects_adjust_intensity=0.6[0~1]; effects_adjust_filter=0.6[0~1] |
| 53 | `Fluoro_Flash` | Fluoro Flash | Loé sáng chớp. BÁM theo người — nhấn vào nhân vật. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_filter=0.85[0~1]; effects_adjust_speed=0.254[0~1]; sticker=1[0~1]; effects_adjust_background_animation=1[0~1] |
| 54 | `Scan` | Scan | Quét dòng. BÁM theo người — nhấn vào nhân vật. | effects_adjust_range=0.5[0~1]; effects_adjust_color=1[0~1] |
| 55 | `Ghost` | Ghost | Bóng ma trong suốt. BÁM theo người — nhấn vào nhân vật. | effects_adjust_speed=0.33[0~1]; effects_adjust_color=1[0~1] |
| 56 | `Dopelgangers_1` | Dopelgangers | (Suy từ tên 'Dopelgangers') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_distortion=0.2[0~1]; effects_adjust_speed=0.5[0~1]; effects_adjust_number=1[0~1]; effects_adjust_intensity=1[0~1]; effects_adjust_rotate=0[0~1] |
| 57 | `Phantom_1` | Phantom | (Suy từ tên 'Phantom') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_speed=1[0~1]; effects_adjust_intensity=1[0~1] |
| 58 | `Apparate_1` | Apparate 1 | Hiện ra bất chợt. BÁM theo người — nhấn vào nhân vật. | effects_adjust_rotate=0.5[0~1]; effects_adjust_blur=1[0~1]; effects_adjust_speed=1[0~1] |
| 59 | `Phantom_Face` | Phantom Face | Khuôn mặt. BÁM theo người — nhấn vào nhân vật. | effects_adjust_rotate=0.5[0~1]; effects_adjust_blur=0.5[0~1]; effects_adjust_speed=0.5[0~1] |
| 60 | `PopOut` | Pop-Out | (Suy từ tên 'Pop-Out') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | — |
| 61 | `Starlight` | Starlight | (Suy từ tên 'Starlight') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_size=0.5[0~1]; effects_adjust_color=1[0~1] |
| 62 | `Bubbles_2` | Bubbles 2 | Bong bóng nổi. BÁM theo người — nhấn vào nhân vật. | effects_adjust_speed=0.33[0~1]; effects_adjust_vertical_shift=0.5[0~1]; effects_adjust_size=0.5[0~1]; effects_adjust_color=1[0~1] |
| 63 | `Flame_Wings_1` | Flame Wings 1 | Ngọn lửa. BÁM theo người — nhấn vào nhân vật. | effects_adjust_speed=0.33[0~1]; effects_adjust_color=1[0~1] |
| 64 | `Revolving_Flames` | Revolving Flames | (Suy từ tên 'Revolving Flames') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_color=1[0~1] |
| 65 | `Flame_Trails` | Flame Trails | Ngọn lửa. BÁM theo người — nhấn vào nhân vật. | — |
| 66 | `Technology_2` | Technology 2 | (Suy từ tên 'Technology 2') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_size=0.5[0~1]; effects_adjust_color=1[0~1] |
| 67 | `Firework` | Firework | Pháo hoa. BÁM theo người — nhấn vào nhân vật. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_size=0.5[0~1]; effects_adjust_color=1[0~1]; effects_adjust_speed=0.5[0~1] |
| 68 | `Halo` | Halo | Vòng hào quang. BÁM theo người — nhấn vào nhân vật. | effects_adjust_vertical_shift=0.5[0~1]; effects_adjust_size=0.5[0~1]; effects_adjust_color=1[0~1] |
| 69 | `Gas_Waves` | Gas Waves | (Suy từ tên 'Gas Waves') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_color=1[0~1]; effects_adjust_speed=0.5[0~1] |
| 70 | `Sound_Wave` | Sound Wave | Gợn sóng. BÁM theo người — nhấn vào nhân vật. | effects_adjust_color=1[0~1] |
| 71 | `Geometric_Lasers` | Geometric Lasers | (Suy từ tên 'Geometric Lasers') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_vertical_shift=0.5[0~1]; effects_adjust_size=0.5[0~1]; effects_adjust_color=1[0~1] |
| 72 | `Shape_Trails` | Shape Trails | (Suy từ tên 'Shape Trails') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | — |
| 73 | `Flame_Wings_2` | Flame Wings 2 | Ngọn lửa. BÁM theo người — nhấn vào nhân vật. | effects_adjust_color=1[0~1] |
| 74 | `Consciousness` | Consciousness | (Suy từ tên 'Consciousness') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_speed=0.33[0~1]; effects_adjust_vertical_shift=0.6[0~1]; effects_adjust_color=1[0~1] |
| 75 | `Looping_Arrows` | Looping Arrows | (Suy từ tên 'Looping Arrows') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_size=0.5[0~1]; effects_adjust_color=1[0~1] |
| 76 | `Scan_2` | Scan 2 | Quét dòng. BÁM theo người — nhấn vào nhân vật. | effects_adjust_range=0.5[0~1]; effects_adjust_color=1[0~1] |
| 77 | `Flame_Outline` | Flame Outline | Ngọn lửa. BÁM theo người — nhấn vào nhân vật. | effects_adjust_color=1[0~1]; effects_adjust_range=0.5[0~1]; effects_adjust_intensity=0.75[0~1]; effects_adjust_speed=0.3[0~1]; effects_adjust_filter=0.6[0~1] |
| 78 | `Color_Fringe_1` | Color Fringe | Màu. BÁM theo người — nhấn vào nhân vật. | effects_adjust_speed=0.33[0~1]; effects_adjust_intensity=1[0~1]; effects_adjust_filter=0.8[0~1] |
| 79 | `Thermal_Aura_2` | Thermal Aura 2 | Hào quang phát sáng quanh người. BÁM theo người — nhấn vào nhân vật. | effects_adjust_background_animation=1[0~1]; effects_adjust_filter=0.801[0~1] |
| 80 | `Frame_Scatter_2` | Frame Scatter 2 | Khung viền. BÁM theo người — nhấn vào nhân vật. | effects_adjust_speed=0.33[0~1]; effects_adjust_range=0.5[0~1]; effects_adjust_color=1[0~1] |
| 81 | `Frame_Scatter` | Frame Scatter | Khung viền. BÁM theo người — nhấn vào nhân vật. | effects_adjust_speed=0.33[0~1]; effects_adjust_range=0.5[0~1]; effects_adjust_color=1[0~1] |
| 82 | `Sinking` | Sinking | (Suy từ tên 'Sinking') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_range=1[0~1]; effects_adjust_color=1[0~1]; effects_adjust_speed=0.33[0~1] |
| 83 | `Axis_Rotation` | Axis Rotation | Xoay. BÁM theo người — nhấn vào nhân vật. | effects_adjust_speed=0.6[0~1]; effects_adjust_rotate=0.5[0~1]; effects_adjust_color=0[0~1] |
| 84 | `Light_Trails` | Light Trails | Ánh sáng. BÁM theo người — nhấn vào nhân vật. | effects_adjust_intensity=1[0~1]; effects_adjust_blur=1[0~1]; effects_adjust_speed=0.33[0~1] |
| 85 | `Speed_Streaks` | Speed Streaks | (Suy từ tên 'Speed Streaks') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_horizontal_shift=0.7[0~1]; effects_adjust_intensity=0.85[0~1] |
| 86 | `Face_Glitch` | Face Glitch | Khuôn mặt, nhiễu/trục trặc số. BÁM theo người — nhấn vào nhân vật. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | effects_adjust_background_animation=0.5[0~1]; effects_adjust_intensity=0.5[0~1]; effects_adjust_color=0.6[0~1]; effects_adjust_speed=0.5[0~1] |
| 87 | `Lightning` | Lightning | Tia chớp/sấm sét. BÁM theo người — nhấn vào nhân vật. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | effects_adjust_color=0[0~1]; effects_adjust_speed=0.1[0~1]; effects_adjust_intensity=1[0~1]; effects_adjust_filter=0.7[0~1] |
| 88 | `Neon_Doodle` | Neon Doodle | Đèn neon rực. BÁM theo người — nhấn vào nhân vật. | effects_adjust_size=0.5[0~1]; effects_adjust_speed=0.22[0~1]; effects_adjust_vertical_shift=0[0~1]; effects_adjust_horizontal_shift=0[0~1]; effects_adjust_filter=0.75[0~1] |
| 89 | `Heart_Lenses` | Heart Lenses | Trái tim. BÁM theo người — nhấn vào nhân vật. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. | effects_adjust_intensity=0.7[0~1]; effects_adjust_range=0.5[0~1]; effects_adjust_filter=0.5[0~1] |
| 90 | `Loving_Gaze` | Loving Gaze | (Suy từ tên 'Loving Gaze') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_filter=0.5[0~1]; effects_adjust_color=0[0~1]; effects_adjust_speed=1[0~1]; effects_adjust_horizontal_shift=0.5[0~1]; effects_adjust_vertical_shift=0.35[0~1] |
| 91 | `Neon_Variation` | Neon Variation | Đèn neon rực. BÁM theo người — nhấn vào nhân vật. | effects_adjust_speed=0.2[0~1]; effects_adjust_filter=0.8[0~1] |
| 92 | `Woman_2` | Woman 2 | (Suy từ tên 'Woman 2') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_size=0[0~1] |
| 93 | `Woman` | Woman | (Suy từ tên 'Woman') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_size=0[0~1] |
| 94 | `Man` | Man | (Suy từ tên 'Man') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_size=0[0~1] |
| 95 | `Man_2` | Man 2 | (Suy từ tên 'Man 2') BÁM theo người — nhấn vào nhân vật. — nên xem Bảng thử để chắc. | effects_adjust_size=0[0~1] |

## A4. Intro animation (ảnh/video)
**Áp dụng:** `add_image(intro_animation="<key>")`

> Tổng **43** mục.

| # | key (API) | Tên | Mô tả & khi nào dùng | Tham số/TL |
|---|---|---|---|---|
| 1 | `Fade_In` | Fade In | Mờ dần. Cách ảnh/clip overlay XUẤT HIỆN. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.50s |
| 2 | `Zoom_1` | Zoom 1 | Phóng to (zoom). Cách ảnh/clip overlay XUẤT HIỆN. | 0.50s |
| 3 | `Rock_Vertically` | Rock Vertically | (Suy từ tên 'Rock Vertically') Cách ảnh/clip overlay XUẤT HIỆN. — nên xem Bảng thử để chắc. | 0.50s |
| 4 | `Slide_Down` | Slide Down | Trượt. Cách ảnh/clip overlay XUẤT HIỆN. | 0.50s |
| 5 | `Slide_Up` | Slide Up | Trượt. Cách ảnh/clip overlay XUẤT HIỆN. | 0.50s |
| 6 | `Slide_Right` | Slide Right | Trượt. Cách ảnh/clip overlay XUẤT HIỆN. | 0.50s |
| 7 | `Slide_Left` | Slide Left | Trượt. Cách ảnh/clip overlay XUẤT HIỆN. | 0.50s |
| 8 | `Rotate` | Rotate | Xoay. Cách ảnh/clip overlay XUẤT HIỆN. | 0.50s |
| 9 | `Flame_Risen` | Flame Risen | Ngọn lửa. Cách ảnh/clip overlay XUẤT HIỆN. | 2.87s |
| 10 | `Rotation_Opening` | Rotation Opening | Xoay. Cách ảnh/clip overlay XUẤT HIỆN. | 1.00s |
| 11 | `Retro_Fadein_2` | Retro Fade-in 2 | Hoài cổ retro. Cách ảnh/clip overlay XUẤT HIỆN. Hợp tông HOÀI NIỆM/kể chuyện/nhìn lại. | 2.00s |
| 12 | `Retro_Fadein` | Retro Fade-in | Hoài cổ retro. Cách ảnh/clip overlay XUẤT HIỆN. Hợp tông HOÀI NIỆM/kể chuyện/nhìn lại. | 2.00s |
| 13 | `Screen_Wipe` | Screen Wipe | Màn hình, gạt/quét ngang. Cách ảnh/clip overlay XUẤT HIỆN. | 2.00s |
| 14 | `RGB_Scanlines` | RGB Scanlines | Vạch quét. Cách ảnh/clip overlay XUẤT HIỆN. | 1.00s |
| 15 | `Zoom_2` | Zoom 2 | Phóng to (zoom). Cách ảnh/clip overlay XUẤT HIỆN. | 0.50s |
| 16 | `Zoom_Out` | Zoom Out | Phóng to (zoom). Cách ảnh/clip overlay XUẤT HIỆN. | 0.50s |
| 17 | `Zoom_In` | Zoom In | Phóng to (zoom). Cách ảnh/clip overlay XUẤT HIỆN. | 0.50s |
| 18 | `Shake_3` | Shake 3 | Rung lắc máy quay. Cách ảnh/clip overlay XUẤT HIỆN. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | 0.50s |
| 19 | `CRT_Bands` | CRT Bands | Dải sọc. Cách ảnh/clip overlay XUẤT HIỆN. | 2.00s |
| 20 | `Vibrating_Panels` | Vibrating Panels | (Suy từ tên 'Vibrating Panels') Cách ảnh/clip overlay XUẤT HIỆN. — nên xem Bảng thử để chắc. | 2.00s |
| 21 | `Swing_Top_Right` | Swing Top Right | (Suy từ tên 'Swing Top Right') Cách ảnh/clip overlay XUẤT HIỆN. — nên xem Bảng thử để chắc. | 0.50s |
| 22 | `Anime_Frame` | Anime Frame | Hoạt hình anime, khung viền. Cách ảnh/clip overlay XUẤT HIỆN. | 1.00s |
| 23 | `Rock_Horizontally` | Rock Horizontally | (Suy từ tên 'Rock Horizontally') Cách ảnh/clip overlay XUẤT HIỆN. — nên xem Bảng thử để chắc. | 0.50s |
| 24 | `Gray_Mask` | Gray Mask | (Suy từ tên 'Gray Mask') Cách ảnh/clip overlay XUẤT HIỆN. — nên xem Bảng thử để chắc. | 1.53s |
| 25 | `Shake_1` | Shake 1 | Rung lắc máy quay. Cách ảnh/clip overlay XUẤT HIỆN. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | 0.50s |
| 26 | `Spin_Up_2` | Spin Up 2 | Xoay tròn. Cách ảnh/clip overlay XUẤT HIỆN. | 0.50s |
| 27 | `Whirl` | Whirl | Cuộn xoáy. Cách ảnh/clip overlay XUẤT HIỆN. | 0.50s |
| 28 | `Mini_Zoom` | Mini Zoom | Zoom nhẹ nhanh — punch-in tinh tế nhấn từ khoá. | 0.50s |
| 29 | `Spin_Up_1` | Spin Up 1 | Xoay tròn. Cách ảnh/clip overlay XUẤT HIỆN. | 0.50s |
| 30 | `Swing_Bottom` | Swing Bottom | (Suy từ tên 'Swing Bottom') Cách ảnh/clip overlay XUẤT HIỆN. — nên xem Bảng thử để chắc. | 0.50s |
| 31 | `Swing_Right` | Swing Right | (Suy từ tên 'Swing Right') Cách ảnh/clip overlay XUẤT HIỆN. — nên xem Bảng thử để chắc. | 0.50s |
| 32 | `Swing_Bottom_Left` | Swing Bottom Left | (Suy từ tên 'Swing Bottom Left') Cách ảnh/clip overlay XUẤT HIỆN. — nên xem Bảng thử để chắc. | 0.50s |
| 33 | `Flip` | Flip | Lật mặt. Cách ảnh/clip overlay XUẤT HIỆN. | 0.50s |
| 34 | `Shake_2` | Shake 2 | Rung lắc máy quay. Cách ảnh/clip overlay XUẤT HIỆN. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | 0.50s |
| 35 | `Blinds` | Blinds | Rèm sọc. Cách ảnh/clip overlay XUẤT HIỆN. | 0.50s |
| 36 | `Swing_Bottom_Right` | Swing Bottom Right | (Suy từ tên 'Swing Bottom Right') Cách ảnh/clip overlay XUẤT HIỆN. — nên xem Bảng thử để chắc. | 0.50s |
| 37 | `Puzzle` | Puzzle | (Suy từ tên 'Puzzle') Cách ảnh/clip overlay XUẤT HIỆN. — nên xem Bảng thử để chắc. | 0.50s |
| 38 | `Swing_Top_Left` | Swing Top Left | (Suy từ tên 'Swing Top Left') Cách ảnh/clip overlay XUẤT HIỆN. — nên xem Bảng thử để chắc. | 0.50s |
| 39 | `Shake_Down` | Shake Down | Rung lắc máy quay. Cách ảnh/clip overlay XUẤT HIỆN. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | 0.50s |
| 40 | `Swing` | Swing | (Suy từ tên 'Swing') Cách ảnh/clip overlay XUẤT HIỆN. — nên xem Bảng thử để chắc. | 0.50s |
| 41 | `Wiper` | Wiper | (Suy từ tên 'Wiper') Cách ảnh/clip overlay XUẤT HIỆN. — nên xem Bảng thử để chắc. | 0.50s |
| 42 | `Roll_Right` | Roll Right | Lăn/cuộn. Cách ảnh/clip overlay XUẤT HIỆN. | 0.50s |
| 43 | `Spin_Left` | Spin Left | Xoay tròn. Cách ảnh/clip overlay XUẤT HIỆN. | 0.50s |

## A5. Outro animation (ảnh/video)
**Áp dụng:** `add_image(outro_animation="<key>")`

> Tổng **23** mục.

| # | key (API) | Tên | Mô tả & khi nào dùng | Tham số/TL |
|---|---|---|---|---|
| 1 | `Fade_Out` | Fade Out | Mờ dần. Cách ảnh/clip overlay BIẾN MẤT. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.50s |
| 2 | `RGB_Scanlines` | RGB Scanlines | Vạch quét. Cách ảnh/clip overlay BIẾN MẤT. | 1.00s |
| 3 | `Blurred_Fadein` | Blurred Fade-in | (Suy từ tên 'Blurred Fade-in') Cách ảnh/clip overlay BIẾN MẤT. — nên xem Bảng thử để chắc. | 2.00s |
| 4 | `Slide_Down` | Slide Down | Trượt. Cách ảnh/clip overlay BIẾN MẤT. | 0.50s |
| 5 | `Slide_Up` | Slide Up | Trượt. Cách ảnh/clip overlay BIẾN MẤT. | 0.50s |
| 6 | `Slide_Right` | Slide Right | Trượt. Cách ảnh/clip overlay BIẾN MẤT. | 0.50s |
| 7 | `Slide_Left` | Slide Left | Trượt. Cách ảnh/clip overlay BIẾN MẤT. | 0.50s |
| 8 | `Blurred_Fadein_1` | Blurred Fade-in | (Suy từ tên 'Blurred Fade-in') Cách ảnh/clip overlay BIẾN MẤT. — nên xem Bảng thử để chắc. | 2.00s |
| 9 | `Zoom_In` | Zoom In | Phóng to (zoom). Cách ảnh/clip overlay BIẾN MẤT. | 0.50s |
| 10 | `CRT_Bands` | CRT Bands | Dải sọc. Cách ảnh/clip overlay BIẾN MẤT. | 2.00s |
| 11 | `Flame_Risen` | Flame Risen | Ngọn lửa. Cách ảnh/clip overlay BIẾN MẤT. | 2.97s |
| 12 | `Screen_Wipe` | Screen Wipe | Màn hình, gạt/quét ngang. Cách ảnh/clip overlay BIẾN MẤT. | 2.00s |
| 13 | `Rotation_Closing` | Rotation Closing | Xoay. Cách ảnh/clip overlay BIẾN MẤT. | 1.00s |
| 14 | `Rotate` | Rotate | Xoay. Cách ảnh/clip overlay BIẾN MẤT. | 0.50s |
| 15 | `Anime_Frame` | Anime Frame | Hoạt hình anime, khung viền. Cách ảnh/clip overlay BIẾN MẤT. | 1.00s |
| 16 | `Zoom_Out` | Zoom Out | Phóng to (zoom). Cách ảnh/clip overlay BIẾN MẤT. | 0.50s |
| 17 | `Rotate_Out_1` | Rotate Out 1 | Xoay. Cách ảnh/clip overlay BIẾN MẤT. | 0.50s |
| 18 | `Mini_Zoom` | Mini Zoom | Zoom nhẹ nhanh — punch-in tinh tế nhấn từ khoá. | 0.50s |
| 19 | `Gray_Mask` | Gray Mask | (Suy từ tên 'Gray Mask') Cách ảnh/clip overlay BIẾN MẤT. — nên xem Bảng thử để chắc. | 1.53s |
| 20 | `Whirl` | Whirl | Cuộn xoáy. Cách ảnh/clip overlay BIẾN MẤT. | 0.50s |
| 21 | `Vibrating_Panels` | Vibrating Panels | (Suy từ tên 'Vibrating Panels') Cách ảnh/clip overlay BIẾN MẤT. — nên xem Bảng thử để chắc. | 2.00s |
| 22 | `Rotate_Out_2` | Rotate Out 2 | Xoay. Cách ảnh/clip overlay BIẾN MẤT. | 0.50s |
| 23 | `Flip` | Flip | Lật mặt. Cách ảnh/clip overlay BIẾN MẤT. | 0.50s |

## A6. Group/Combo animation (ảnh)
**Áp dụng:** `add_image(combo_animation="<key>")`

> Tổng **108** mục.

| # | key (API) | Tên | Mô tả & khi nào dùng | Tham số/TL |
|---|---|---|---|---|
| 1 | `Zoom_1` | Zoom 1 | Phóng to (zoom). Animation chạy LẶP/tổ hợp cho ảnh. | 4.00s |
| 2 | `Stretch_and_distort` | Stretch and distort | (Suy từ tên 'Stretch and distort') Animation chạy LẶP/tổ hợp cho ảnh. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). — nên xem Bảng thử để chắc. | 3.50s |
| 3 | `Bounce_1` | Bounce 1 | Nảy. Animation chạy LẶP/tổ hợp cho ảnh. | 2.50s |
| 4 | `Sway_Out` | Sway Out | (Suy từ tên 'Sway Out') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 4.00s |
| 5 | `_3D_card_2` | 3D card 2 | (Suy từ tên '3D card 2') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 4.00s |
| 6 | `Slide_and_wave` | Slide and wave | Trượt, gợn sóng. Animation chạy LẶP/tổ hợp cho ảnh. | 4.00s |
| 7 | `Pendulum_1` | Pendulum 1 | (Suy từ tên 'Pendulum 1') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 4.00s |
| 8 | `Wobble` | Wobble | (Suy từ tên 'Wobble') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 2.50s |
| 9 | `Wave_and_slide` | Wave and slide | Gợn sóng, trượt. Animation chạy LẶP/tổ hợp cho ảnh. | 1.63s |
| 10 | `Enlarge_and_bounce` | Enlarge and bounce | Phóng to chữ, nảy. Animation chạy LẶP/tổ hợp cho ảnh. | 2.00s |
| 11 | `Distort_and_stretch` | Distort and stretch | (Suy từ tên 'Distort and stretch') Animation chạy LẶP/tổ hợp cho ảnh. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). — nên xem Bảng thử để chắc. | 0.03s |
| 12 | `Pendulum_2` | Pendulum 2 | (Suy từ tên 'Pendulum 2') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 1.00s |
| 13 | `Zoom_2` | Zoom 2 | Phóng to (zoom). Animation chạy LẶP/tổ hợp cho ảnh. | 2.00s |
| 14 | `Sway_In` | Sway In | (Suy từ tên 'Sway In') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 3.50s |
| 15 | `BendZoom` | Bend-Zoom | Phóng to (zoom). Animation chạy LẶP/tổ hợp cho ảnh. | 3.50s |
| 16 | `Bounce_2` | Bounce 2 | Nảy. Animation chạy LẶP/tổ hợp cho ảnh. | 4.00s |
| 17 | `Spin_Rise` | Spin Rise | Xoay tròn, trồi lên. Animation chạy LẶP/tổ hợp cho ảnh. | 4.00s |
| 18 | `Train_2` | Train 2 | (Suy từ tên 'Train 2') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 4.00s |
| 19 | `Spin` | Spin | Xoay tròn. Animation chạy LẶP/tổ hợp cho ảnh. | 1.47s |
| 20 | `Shrink_and_bounce` | Shrink and bounce | Nảy. Animation chạy LẶP/tổ hợp cho ảnh. | 2.50s |
| 21 | `Smartphone_1` | Smartphone 1 | (Suy từ tên 'Smartphone 1') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 2.50s |
| 22 | `Distort_Right` | Distort Right | (Suy từ tên 'Distort Right') Animation chạy LẶP/tổ hợp cho ảnh. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). — nên xem Bảng thử để chắc. | 3.50s |
| 23 | `Trisect_2` | Trisect 2 | (Suy từ tên 'Trisect 2') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 4.00s |
| 24 | `Train_4` | Train 4 | (Suy từ tên 'Train 4') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 3.47s |
| 25 | `Fall_Spin` | Fall Spin | Rơi, xoay tròn. Animation chạy LẶP/tổ hợp cho ảnh. | 4.50s |
| 26 | `_3D_card_1` | 3D card 1 | (Suy từ tên '3D card 1') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 4.50s |
| 27 | `Spinning_top_2` | Spinning top 2 | (Suy từ tên 'Spinning top 2') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 4.50s |
| 28 | `Fall_Right` | Fall Right | Rơi. Animation chạy LẶP/tổ hợp cho ảnh. | 4.50s |
| 29 | `Pan_Right` | Pan Right | (Suy từ tên 'Pan Right') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 4.50s |
| 30 | `Distort_Left` | Distort Left | (Suy từ tên 'Distort Left') Animation chạy LẶP/tổ hợp cho ảnh. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). — nên xem Bảng thử để chắc. | 4.50s |
| 31 | `Slip_and_slide_2` | Slip and slide 2 | Trượt. Animation chạy LẶP/tổ hợp cho ảnh. | 4.50s |
| 32 | `Slip_and_slide_1` | Slip and slide 1 | Trượt. Animation chạy LẶP/tổ hợp cho ảnh. | 4.50s |
| 33 | `Roll_InOut_2` | Roll In&Out 2 | Lăn/cuộn. Animation chạy LẶP/tổ hợp cho ảnh. | 4.50s |
| 34 | `Right_Zoom` | Right Zoom | Phóng to (zoom). Animation chạy LẶP/tổ hợp cho ảnh. | 4.50s |
| 35 | `Slice__Rotate_2` | Slice & Rotate 2 | Xoay. Animation chạy LẶP/tổ hợp cho ảnh. | 4.50s |
| 36 | `Cube_3` | Cube 3 | (Suy từ tên 'Cube 3') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 4.50s |
| 37 | `Pirate_ship_1` | Pirate ship 1 | (Suy từ tên 'Pirate ship 1') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 4.50s |
| 38 | `Bisect_2` | Bisect 2 | Chia đôi khung. Animation chạy LẶP/tổ hợp cho ảnh. | 4.50s |
| 39 | `Pan_Left` | Pan Left | (Suy từ tên 'Pan Left') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 4.50s |
| 40 | `Train_3` | Train 3 | (Suy từ tên 'Train 3') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 4.50s |
| 41 | `Train_1` | Train 1 | (Suy từ tên 'Train 1') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 4.50s |
| 42 | `Magic_Cube_2` | Magic Cube 2 | (Suy từ tên 'Magic Cube 2') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 4.50s |
| 43 | `Yoyo_2` | Yo-yo 2 | (Suy từ tên 'Yo-yo 2') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 4.50s |
| 44 | `_3D_card_5` | 3D card 5 | (Suy từ tên '3D card 5') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 45 | `Fall_Bottom_Right` | Fall Bottom Right | Rơi. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 46 | `_3D_card_3` | 3D card 3 | (Suy từ tên '3D card 3') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 47 | `Funhouse_mirror_1` | Funhouse mirror 1 | Phản chiếu đối xứng. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 48 | `Revolving_Checker_2` | Revolving Checker 2 | (Suy từ tên 'Revolving Checker 2') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 49 | `Roll_InOut_1` | Roll In&Out 1 | Lăn/cuộn. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 50 | `Left_Zoom` | Left Zoom | Phóng to (zoom). Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 51 | `Fall_Left` | Fall Left | Rơi. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 52 | `Checker_Slide_2` | Checker Slide 2 | Trượt. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 53 | `Waltzer_2` | Waltzer 2 | (Suy từ tên 'Waltzer 2') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 54 | `Smartphone_3` | Smartphone 3 | (Suy từ tên 'Smartphone 3') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 55 | `Spinning_top_1` | Spinning top 1 | (Suy từ tên 'Spinning top 1') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 56 | `Smaller` | Smaller | (Suy từ tên 'Smaller') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 57 | `Zoom_Spin` | Zoom Spin | Phóng to (zoom), xoay tròn. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 58 | `Spin_In` | Spin In | Xoay tròn. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 59 | `Fall_Bottom_Left` | Fall Bottom Left | Rơi. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 60 | `Yoyo_1` | Yo-yo 1 | (Suy từ tên 'Yo-yo 1') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 61 | `Flip_6` | Flip 6 | Lật mặt. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 62 | `Funhouse_mirror_2` | Funhouse mirror 2 | Phản chiếu đối xứng. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 63 | `ZoomRoll` | Zoom-Roll | Phóng to (zoom), lăn/cuộn. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 64 | `_3D_card_4` | 3D card 4 | (Suy từ tên '3D card 4') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 65 | `Spin_Fall` | Spin Fall | Xoay tròn, rơi. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 66 | `Cube` | Cube | (Suy từ tên 'Cube') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 67 | `Fan_Out` | Fan Out | (Suy từ tên 'Fan Out') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 68 | `Triplets_1` | Triplets 1 | (Suy từ tên 'Triplets 1') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 69 | `Magic_Cube_1` | Magic Cube 1 | (Suy từ tên 'Magic Cube 1') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 70 | `_3D_card_6` | 3D card 6 | (Suy từ tên '3D card 6') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 71 | `Quarter_2` | Quarter 2 | (Suy từ tên 'Quarter 2') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 72 | `Spin_Out` | Spin Out | Xoay tròn. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 73 | `Pirate_ship_2` | Pirate ship 2 | (Suy từ tên 'Pirate ship 2') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 74 | `Bisect_Domino_2` | Bisect Domino 2 | Chia đôi khung, đổ dây chuyền. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 75 | `Waltzer_4` | Waltzer 4 | (Suy từ tên 'Waltzer 4') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 76 | `Rise_Spin` | Rise Spin | Trồi lên, xoay tròn. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 77 | `Puzzle` | Puzzle | (Suy từ tên 'Puzzle') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 78 | `Bisect_1` | Bisect 1 | Chia đôi khung. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 79 | `Pirate_ship_3` | Pirate ship 3 | (Suy từ tên 'Pirate ship 3') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 80 | `Pirate_ship_4` | Pirate ship 4 | (Suy từ tên 'Pirate ship 4') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 81 | `Checker_Slide_1` | Checker Slide 1 | Trượt. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 82 | `Waltzer_1` | Waltzer 1 | (Suy từ tên 'Waltzer 1') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 83 | `Smartphone_2` | Smartphone 2 | (Suy từ tên 'Smartphone 2') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 84 | `Sliding_Doors_1` | Sliding Doors 1 | (Suy từ tên 'Sliding Doors 1') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 85 | `Split_up__down_2` | Split up & down 2 | Tách đôi. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 86 | `Cube_2` | Cube 2 | (Suy từ tên 'Cube 2') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 87 | `Crystal_1` | Crystal 1 | Pha lê. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 88 | `Angle_1` | Angle 1 | Góc nhìn. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 89 | `Trisect_1` | Trisect 1 | (Suy từ tên 'Trisect 1') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 90 | `Flip_2` | Flip 2 | Lật mặt. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 91 | `Waltzer_3` | Waltzer 3 | (Suy từ tên 'Waltzer 3') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 92 | `Blinds` | Blinds | Rèm sọc. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 93 | `Crystal_2` | Crystal 2 | Pha lê. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 94 | `Triplets_2` | Triplets 2 | (Suy từ tên 'Triplets 2') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 95 | `Angle_2` | Angle 2 | Góc nhìn. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 96 | `Cube_3_1` | Cube 3 | (Suy từ tên 'Cube 3') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 97 | `Cube_2_1` | Cube 2 | (Suy từ tên 'Cube 2') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 98 | `Slice__Rotate_1` | Slice & Rotate 1 | Xoay. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 99 | `Quarter_1` | Quarter 1 | (Suy từ tên 'Quarter 1') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 100 | `Revolving_Checker_1` | Revolving Checker 1 | (Suy từ tên 'Revolving Checker 1') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 101 | `Flip_II` | Flip II | Lật mặt. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 102 | `Flip_3` | Flip 3 | Lật mặt. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 103 | `Flip_4` | Flip 4 | Lật mặt. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 104 | `Rollercoaster_1` | Roller-coaster 1 | (Suy từ tên 'Roller-coaster 1') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 105 | `Rollercoaster_2` | Roller-coaster 2 | (Suy từ tên 'Roller-coaster 2') Animation chạy LẶP/tổ hợp cho ảnh. — nên xem Bảng thử để chắc. | 5.00s |
| 106 | `Split_up__down_1` | Split up & down 1 | Tách đôi. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 107 | `Bisect_Domino_1` | Bisect Domino 1 | Chia đôi khung, đổ dây chuyền. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |
| 108 | `Flip_5` | Flip 5 | Lật mặt. Animation chạy LẶP/tổ hợp cho ảnh. | 5.00s |

## A7. Text intro — Chữ vào
**Áp dụng:** `add_text(intro_animation="<key>")`

> Tổng **76** mục.

| # | key (API) | Tên | Mô tả & khi nào dùng | Tham số/TL |
|---|---|---|---|---|
| 1 | `Throw_Out` | Throw Out | (Suy từ tên 'Throw Out') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 2 | `Typewriter` | Typewriter | Đánh máy từng chữ. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 3 | `Concentrate` | Concentrate | Dồn tụ vào. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 4 | `Fade_In` | Fade In | Mờ dần. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.50s |
| 5 | `Glitch` | Glitch | Nhiễu/trục trặc số. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | 0.50s |
| 6 | `Spin_In_2` | Spin In 2 | Xoay tròn. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 7 | `Spin_In_1` | Spin In 1 | Xoay tròn. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 8 | `Zoom_Out_2` | Zoom Out 2 | Phóng to (zoom). Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 9 | `Wave_in` | Wave in | Gợn sóng. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 10 | `Faulty_text` | Faulty text | (Suy từ tên 'Faulty text') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 11 | `Dissolve` | Dissolve | Hoà tan. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.50s |
| 12 | `Pop_Up` | Pop Up | (Suy từ tên 'Pop Up') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 13 | `Random_Typewriter` | Random Typewriter | Đánh máy từng chữ. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 14 | `Fly_In` | Fly In | (Suy từ tên 'Fly In') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 15 | `Chroma_Type` | Chroma Type | (Suy từ tên 'Chroma Type') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 16 | `Spiral` | Spiral | (Suy từ tên 'Spiral') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 17 | `Blur` | Blur | Làm mờ. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.50s |
| 18 | `Type_2` | Type 2 | (Suy từ tên 'Type 2') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 19 | `Type_1` | Type 1 | (Suy từ tên 'Type 1') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 20 | `Float_Down` | Float Down | Trôi nổi. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.50s |
| 21 | `Zoom_In` | Zoom In | Phóng to (zoom). Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 22 | `Open` | Open | Mở ra. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 23 | `Blur_to_the_Left` | Blur to the Left | Làm mờ. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.50s |
| 24 | `Karaoke` | Karaoke | (Suy từ tên 'Karaoke') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 25 | `Flicker` | Flicker | Chập chờn. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 26 | `Flip_and_jump` | Flip and jump | Lật mặt, nhảy. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 27 | `Flutter` | Flutter | (Suy từ tên 'Flutter') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 28 | `Dissolve_Down` | Dissolve Down | Hoà tan. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.50s |
| 29 | `Wipe_Right` | Wipe Right | Gạt/quét ngang. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 30 | `Blur_Wipe_Right` | Blur Wipe Right | Làm mờ, gạt/quét ngang. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.50s |
| 31 | `Slingshot` | Slingshot | (Suy từ tên 'Slingshot') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 32 | `Blur_to_the_right` | Blur to the right | Làm mờ. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.50s |
| 33 | `Jolt_Forward` | Jolt Forward | (Suy từ tên 'Jolt Forward') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 34 | `Rotation_Verbatim` | Rotation Verbatim | Xoay, hiện từng chữ. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 35 | `Elastic_Telescopic_II` | Elastic Telescopic II | Co giãn đàn hồi. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 36 | `Flip_Verbatim` | Flip Verbatim | Lật mặt, hiện từng chữ. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 37 | `Zoom_Out` | Zoom Out | Phóng to (zoom). Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 38 | `Trail` | Trail | (Suy từ tên 'Trail') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 39 | `Slide_Right` | Slide Right | Trượt. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 40 | `Clock_wipe` | Clock wipe | Gạt/quét ngang. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 41 | `Flipping` | Flipping | (Suy từ tên 'Flipping') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 42 | `Squeeze` | Squeeze | (Suy từ tên 'Squeeze') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 43 | `Fold` | Fold | Gấp lại. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 44 | `Roll_In` | Roll In | Lăn/cuộn. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 45 | `Judder_Up` | Judder Up | (Suy từ tên 'Judder Up') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 46 | `Type_3` | Type 3 | (Suy từ tên 'Type 3') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 47 | `Bounce_In` | Bounce In | Nảy. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 48 | `Slide_Up` | Slide Up | Trượt. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 49 | `Blow_In` | Blow In | (Suy từ tên 'Blow In') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 50 | `Wobble` | Wobble | (Suy từ tên 'Wobble') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 51 | `Bounce_from_TR` | Bounce from TR | Nảy. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 52 | `Showing_Right` | Showing Right | (Suy từ tên 'Showing Right') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 53 | `Showing_Up` | Showing Up | (Suy từ tên 'Showing Up') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 54 | `Mini_Zoom` | Mini Zoom | Zoom nhẹ nhanh — punch-in tinh tế nhấn từ khoá. | 0.50s |
| 55 | `Set_to_the_Right` | Set to the Right | (Suy từ tên 'Set to the Right') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 56 | `Slide_Left` | Slide Left | Trượt. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 57 | `Bounce_In_TL` | Bounce In TL | Nảy. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 58 | `Wipe_Up` | Wipe Up | Gạt/quét ngang. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 59 | `Random_Bounce` | Random Bounce | Nảy. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 60 | `Blur_Wipe_Left` | Blur Wipe Left | Làm mờ, gạt/quét ngang. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.50s |
| 61 | `Sunrise` | Sunrise | (Suy từ tên 'Sunrise') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 62 | `Wipe_Down` | Wipe Down | Gạt/quét ngang. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 63 | `Wipe_In_LR` | Wipe In LR | Gạt/quét ngang. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 64 | `Wipe_Left` | Wipe Left | Gạt/quét ngang. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 65 | `Slide_Left_1` | Slide Left | Trượt. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 66 | `Slide_Down` | Slide Down | Trượt. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 67 | `Slide_Up_1` | Slide Up | Trượt. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 68 | `Showing_Left` | Showing Left | (Suy từ tên 'Showing Left') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 69 | `Slide_Down_1` | Slide Down | Trượt. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 70 | `Boing` | Boing | Nảy bật lò xo. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 71 | `Spring` | Spring | Mùa xuân. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 72 | `Ease_In_Right` | Ease In Right | (Suy từ tên 'Ease In Right') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 73 | `Turn_Horizontal` | Turn Horizontal | Theo chiều ngang. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |
| 74 | `Grow` | Grow | (Suy từ tên 'Grow') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 75 | `Showing_Down` | Showing Down | (Suy từ tên 'Showing Down') Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). — nên xem Bảng thử để chắc. | 0.50s |
| 76 | `Flip_up` | Flip up | Lật mặt. Cách CHỮ XUẤT HIỆN (pop theo nhịp nói). | 0.50s |

## A8. Text outro — Chữ ra
**Áp dụng:** `add_text(outro_animation="<key>")`

> Tổng **68** mục.

| # | key (API) | Tên | Mô tả & khi nào dùng | Tham số/TL |
|---|---|---|---|---|
| 1 | `Fade_Out` | Fade Out | Mờ dần. Cách CHỮ BIẾN MẤT. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.50s |
| 2 | `Blur` | Blur | Làm mờ. Cách CHỮ BIẾN MẤT. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.50s |
| 3 | `Zoom_In` | Zoom In | Phóng to (zoom). Cách CHỮ BIẾN MẤT. | 0.50s |
| 4 | `Typewriter` | Typewriter | Đánh máy từng chữ. Cách CHỮ BIẾN MẤT. | 0.50s |
| 5 | `Zoom_In_2` | Zoom In 2 | Phóng to (zoom). Cách CHỮ BIẾN MẤT. | 0.50s |
| 6 | `Dissolve_Up` | Dissolve Up | Hoà tan. Cách CHỮ BIẾN MẤT. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.50s |
| 7 | `Slide_Down` | Slide Down | Trượt. Cách CHỮ BIẾN MẤT. | 0.50s |
| 8 | `Dissolve` | Dissolve | Hoà tan. Cách CHỮ BIẾN MẤT. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.50s |
| 9 | `Slide_Up` | Slide Up | Trượt. Cách CHỮ BIẾN MẤT. | 0.50s |
| 10 | `Flicker` | Flicker | Chập chờn. Cách CHỮ BIẾN MẤT. | 0.50s |
| 11 | `Blur_to_the_Left` | Blur to the Left | Làm mờ. Cách CHỮ BIẾN MẤT. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.50s |
| 12 | `Zoom_Out` | Zoom Out | Phóng to (zoom). Cách CHỮ BIẾN MẤT. | 0.50s |
| 13 | `Slide_Down_1` | Slide Down | Trượt. Cách CHỮ BIẾN MẤT. | 0.50s |
| 14 | `Mini_Zoom` | Mini Zoom | Zoom nhẹ nhanh — punch-in tinh tế nhấn từ khoá. | 0.50s |
| 15 | `Bounce_Out` | Bounce Out | Nảy. Cách CHỮ BIẾN MẤT. | 0.50s |
| 16 | `Wipe_Left` | Wipe Left | Gạt/quét ngang. Cách CHỮ BIẾN MẤT. | 0.50s |
| 17 | `Expand` | Expand | Giãn nở. Cách CHỮ BIẾN MẤT. | 0.50s |
| 18 | `Throw_Back` | Throw Back | (Suy từ tên 'Throw Back') Cách CHỮ BIẾN MẤT. — nên xem Bảng thử để chắc. | 0.50s |
| 19 | `Slide_Left` | Slide Left | Trượt. Cách CHỮ BIẾN MẤT. | 0.50s |
| 20 | `Slide_Up_1` | Slide Up | Trượt. Cách CHỮ BIẾN MẤT. | 0.50s |
| 21 | `Type_1` | Type 1 | (Suy từ tên 'Type 1') Cách CHỮ BIẾN MẤT. — nên xem Bảng thử để chắc. | 0.50s |
| 22 | `Dilute` | Dilute | (Suy từ tên 'Dilute') Cách CHỮ BIẾN MẤT. — nên xem Bảng thử để chắc. | 0.50s |
| 23 | `Type_2` | Type 2 | (Suy từ tên 'Type 2') Cách CHỮ BIẾN MẤT. — nên xem Bảng thử để chắc. | 0.50s |
| 24 | `Horizontal_Close` | Horizontal Close | Theo chiều ngang, đóng lại. Cách CHỮ BIẾN MẤT. | 0.50s |
| 25 | `Slide_Right` | Slide Right | Trượt. Cách CHỮ BIẾN MẤT. | 0.50s |
| 26 | `Disband_to_the_Left` | Disband to the Left | (Suy từ tên 'Disband to the Left') Cách CHỮ BIẾN MẤT. — nên xem Bảng thử để chắc. | 0.50s |
| 27 | `Random_Typewriter` | Random Typewriter | Đánh máy từng chữ. Cách CHỮ BIẾN MẤT. | 0.50s |
| 28 | `Flutter` | Flutter | (Suy từ tên 'Flutter') Cách CHỮ BIẾN MẤT. — nên xem Bảng thử để chắc. | 0.50s |
| 29 | `Fold` | Fold | Gấp lại. Cách CHỮ BIẾN MẤT. | 0.50s |
| 30 | `Trail` | Trail | (Suy từ tên 'Trail') Cách CHỮ BIẾN MẤT. — nên xem Bảng thử để chắc. | 0.50s |
| 31 | `Chromatic_Aberration_Tailing` | Chromatic Aberration Tailing | Sai sắc viền màu, viền màu lệch. Cách CHỮ BIẾN MẤT. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | 0.50s |
| 32 | `Roll_Out` | Roll Out | Lăn/cuộn. Cách CHỮ BIẾN MẤT. | 0.50s |
| 33 | `Pop_Down` | Pop Down | (Suy từ tên 'Pop Down') Cách CHỮ BIẾN MẤT. — nên xem Bảng thử để chắc. | 0.50s |
| 34 | `Slingshot` | Slingshot | (Suy từ tên 'Slingshot') Cách CHỮ BIẾN MẤT. — nên xem Bảng thử để chắc. | 0.50s |
| 35 | `Faulty_text` | Faulty text | (Suy từ tên 'Faulty text') Cách CHỮ BIẾN MẤT. — nên xem Bảng thử để chắc. | 0.50s |
| 36 | `Sunset` | Sunset | (Suy từ tên 'Sunset') Cách CHỮ BIẾN MẤT. — nên xem Bảng thử để chắc. | 0.50s |
| 37 | `Ink_Print` | Ink Print | Loang mực. Cách CHỮ BIẾN MẤT. | 0.50s |
| 38 | `Wipe_Right` | Wipe Right | Gạt/quét ngang. Cách CHỮ BIẾN MẤT. | 0.50s |
| 39 | `Bounce_Out_TR` | Bounce Out TR | Nảy. Cách CHỮ BIẾN MẤT. | 0.50s |
| 40 | `Glitch` | Glitch | Nhiễu/trục trặc số. Cách CHỮ BIẾN MẤT. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | 0.50s |
| 41 | `Stroke_Fill` | Stroke Fill | (Suy từ tên 'Stroke Fill') Cách CHỮ BIẾN MẤT. — nên xem Bảng thử để chắc. | 0.50s |
| 42 | `Wipe_Down` | Wipe Down | Gạt/quét ngang. Cách CHỮ BIẾN MẤT. | 0.50s |
| 43 | `Flip_Down` | Flip Down | Lật mặt. Cách CHỮ BIẾN MẤT. | 0.50s |
| 44 | `Blur_Erase_Right` | Blur Erase Right | Làm mờ. Cách CHỮ BIẾN MẤT. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.50s |
| 45 | `Turn_Horizontal` | Turn Horizontal | Theo chiều ngang. Cách CHỮ BIẾN MẤT. | 0.50s |
| 46 | `Flipping` | Flipping | (Suy từ tên 'Flipping') Cách CHỮ BIẾN MẤT. — nên xem Bảng thử để chắc. | 0.50s |
| 47 | `Grow` | Grow | (Suy từ tên 'Grow') Cách CHỮ BIẾN MẤT. — nên xem Bảng thử để chắc. | 0.50s |
| 48 | `Ease_Out_Right` | Ease Out Right | (Suy từ tên 'Ease Out Right') Cách CHỮ BIẾN MẤT. — nên xem Bảng thử để chắc. | 0.50s |
| 49 | `Spring` | Spring | Mùa xuân. Cách CHỮ BIẾN MẤT. | 0.50s |
| 50 | `Blur_Erase_Left` | Blur Erase Left | Làm mờ. Cách CHỮ BIẾN MẤT. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.50s |
| 51 | `Wipe_Up` | Wipe Up | Gạt/quét ngang. Cách CHỮ BIẾN MẤT. | 0.50s |
| 52 | `Bounce_Out_TL` | Bounce Out TL | Nảy. Cách CHỮ BIẾN MẤT. | 0.50s |
| 53 | `Vrille` | Vrille | (Suy từ tên 'Vrille') Cách CHỮ BIẾN MẤT. — nên xem Bảng thử để chắc. | 0.50s |
| 54 | `Blow_Away` | Blow Away | (Suy từ tên 'Blow Away') Cách CHỮ BIẾN MẤT. — nên xem Bảng thử để chắc. | 0.50s |
| 55 | `Type_3` | Type 3 | (Suy từ tên 'Type 3') Cách CHỮ BIẾN MẤT. — nên xem Bảng thử để chắc. | 0.50s |
| 56 | `Rotation_Verbatim` | Rotation Verbatim | Xoay, hiện từng chữ. Cách CHỮ BIẾN MẤT. | 0.50s |
| 57 | `Fly_Out` | Fly Out | (Suy từ tên 'Fly Out') Cách CHỮ BIẾN MẤT. — nên xem Bảng thử để chắc. | 0.50s |
| 58 | `Float_Up` | Float Up | Trôi nổi. Cách CHỮ BIẾN MẤT. Chuyển MƯỢT, nhẹ nhàng, cảm xúc lắng. | 0.50s |
| 59 | `Spin_Out_1` | Spin Out 1 | Xoay tròn. Cách CHỮ BIẾN MẤT. | 0.50s |
| 60 | `Spin_Out_2` | Spin Out 2 | Xoay tròn. Cách CHỮ BIẾN MẤT. | 0.50s |
| 61 | `Slide_Down_2` | Slide Down | Trượt. Cách CHỮ BIẾN MẤT. | 0.50s |
| 62 | `Flip_Verbatim` | Flip Verbatim | Lật mặt, hiện từng chữ. Cách CHỮ BIẾN MẤT. | 0.50s |
| 63 | `Boing` | Boing | Nảy bật lò xo. Cách CHỮ BIẾN MẤT. | 0.50s |
| 64 | `Random_Bounce` | Random Bounce | Nảy. Cách CHỮ BIẾN MẤT. | 0.50s |
| 65 | `Wave_out` | Wave out | Gợn sóng. Cách CHỮ BIẾN MẤT. | 0.50s |
| 66 | `Elastic_Telescopic_II` | Elastic Telescopic II | Co giãn đàn hồi. Cách CHỮ BIẾN MẤT. | 0.50s |
| 67 | `Clock_wipe` | Clock wipe | Gạt/quét ngang. Cách CHỮ BIẾN MẤT. | 0.50s |
| 68 | `Jump_and_flip` | Jump and flip | Nhảy, lật mặt. Cách CHỮ BIẾN MẤT. | 0.50s |

## A9. Text loop — Chữ chuyển động lặp

> Tổng **53** mục.

| # | key (API) | Tên | Mô tả & khi nào dùng | Tham số/TL |
|---|---|---|---|---|
| 1 | `Flare` | Flare | Loé ống kính. CHỮ chuyển động LẶP suốt lúc hiện. | 0.50s |
| 2 | `Wobble_2` | Wobble 2 | (Suy từ tên 'Wobble 2') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 3 | `Wave` | Wave | Gợn sóng. CHỮ chuyển động LẶP suốt lúc hiện. | 0.50s |
| 4 | `Color_Glitch` | Color Glitch | Màu, nhiễu/trục trặc số. CHỮ chuyển động LẶP suốt lúc hiện. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | 0.50s |
| 5 | `Enlarge_Letters` | Enlarge Letters | Phóng to chữ. CHỮ chuyển động LẶP suốt lúc hiện. | 0.50s |
| 6 | `Converge` | Converge | Hội tụ. CHỮ chuyển động LẶP suốt lúc hiện. | 0.50s |
| 7 | `Scroll_Up` | Scroll Up | (Suy từ tên 'Scroll Up') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 8 | `Flash` | Flash | Loé sáng chớp. CHỮ chuyển động LẶP suốt lúc hiện. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | 0.50s |
| 9 | `Jiggly` | Jiggly | (Suy từ tên 'Jiggly') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 10 | `Gushing` | Gushing | (Suy từ tên 'Gushing') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 11 | `Wobbly_Projector_1` | Wobbly Projector 1 | Máy chiếu. CHỮ chuyển động LẶP suốt lúc hiện. Hợp tông HOÀI NIỆM/kể chuyện/nhìn lại. | 0.50s |
| 12 | `Wave_3` | Wave 3 | Gợn sóng. CHỮ chuyển động LẶP suốt lúc hiện. | 0.50s |
| 13 | `Ink_Print` | Ink Print | Loang mực. CHỮ chuyển động LẶP suốt lúc hiện. | 0.50s |
| 14 | `Donut` | Donut | (Suy từ tên 'Donut') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 15 | `Shout_Out` | Shout Out | (Suy từ tên 'Shout Out') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 16 | `Pulse` | Pulse | Đập theo nhịp. CHỮ chuyển động LẶP suốt lúc hiện. | 0.50s |
| 17 | `Tremble` | Tremble | (Suy từ tên 'Tremble') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 18 | `Super_Wavy_2` | Super Wavy 2 | (Suy từ tên 'Super Wavy 2') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 19 | `Font_Reel` | Font Reel | Cuộn phim. CHỮ chuyển động LẶP suốt lúc hiện. Hợp tông HOÀI NIỆM/kể chuyện/nhìn lại. | 0.50s |
| 20 | `VHS` | VHS | (Suy từ tên 'VHS') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 21 | `Space_Type` | Space Type | (Suy từ tên 'Space Type') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 22 | `Wobble_3` | Wobble 3 | (Suy từ tên 'Wobble 3') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 23 | `Top_Arch` | Top Arch | (Suy từ tên 'Top Arch') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 24 | `Rotate` | Rotate | Xoay. CHỮ chuyển động LẶP suốt lúc hiện. | 0.50s |
| 25 | `Random_Bounce` | Random Bounce | Nảy. CHỮ chuyển động LẶP suốt lúc hiện. | 0.50s |
| 26 | `Jump` | Jump | Nhảy. CHỮ chuyển động LẶP suốt lúc hiện. | 0.50s |
| 27 | `Shake` | Shake | Rung lắc máy quay. CHỮ chuyển động LẶP suốt lúc hiện. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | 0.50s |
| 28 | `Wave_2` | Wave 2 | Gợn sóng. CHỮ chuyển động LẶP suốt lúc hiện. | 0.50s |
| 29 | `Scrolling` | Scrolling | (Suy từ tên 'Scrolling') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 30 | `Strong_Tremble_1` | Strong Tremble 1 | (Suy từ tên 'Strong Tremble 1') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 31 | `Jiggle` | Jiggle | Rung lắc nhẹ. CHỮ chuyển động LẶP suốt lúc hiện. | 0.50s |
| 32 | `Rotate_1` | Rotate | Xoay. CHỮ chuyển động LẶP suốt lúc hiện. | 0.50s |
| 33 | `Dance` | Dance | (Suy từ tên 'Dance') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 34 | `Super_Wavy` | Super Wavy | (Suy từ tên 'Super Wavy') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 35 | `Emotional_Loading` | Emotional Loading | Đang tải. CHỮ chuyển động LẶP suốt lúc hiện. | 0.50s |
| 36 | `Retro_BW` | Retro B&W | Hoài cổ retro. CHỮ chuyển động LẶP suốt lúc hiện. Hợp tông HOÀI NIỆM/kể chuyện/nhìn lại. | 0.50s |
| 37 | `Wobble` | Wobble | (Suy từ tên 'Wobble') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 38 | `Pixel_Bounce` | Pixel Bounce | Vỡ điểm ảnh (pixel), nảy. CHỮ chuyển động LẶP suốt lúc hiện. Hợp đoạn TIÊU CỰC/căng thẳng/trục trặc (vd view tụt, thuật toán, thất bại). | 0.50s |
| 39 | `Swing` | Swing | (Suy từ tên 'Swing') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 40 | `Fold` | Fold | Gấp lại. CHỮ chuyển động LẶP suốt lúc hiện. | 0.50s |
| 41 | `Trailing_Beating` | Trailing Beating | (Suy từ tên 'Trailing Beating') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 42 | `Pressing` | Pressing | (Suy từ tên 'Pressing') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 43 | `Page_Turning_I` | Page Turning I | (Suy từ tên 'Page Turning I') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 44 | `Bullet_Screen` | Bullet Screen | Bình luận bay ngang màn hình (danmaku) — kiểu livestream, tương tác đông vui. | 0.50s |
| 45 | `Wiper` | Wiper | (Suy từ tên 'Wiper') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 46 | `Shake_1` | Shake 1 | Rung lắc máy quay. CHỮ chuyển động LẶP suốt lúc hiện. Hợp CÚ ĐẤM mạnh/câu chốt gắt/nói thẳng. | 0.50s |
| 47 | `Blocks` | Blocks | Khối vỡ ô vuông. CHỮ chuyển động LẶP suốt lúc hiện. | 0.50s |
| 48 | `Scream` | Scream | (Suy từ tên 'Scream') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 49 | `Strong_Tremble_2` | Strong Tremble 2 | (Suy từ tên 'Strong Tremble 2') CHỮ chuyển động LẶP suốt lúc hiện. — nên xem Bảng thử để chắc. | 0.50s |
| 50 | `Flip` | Flip | Lật mặt. CHỮ chuyển động LẶP suốt lúc hiện. | 0.50s |
| 51 | `Wobbly_Projector_2` | Wobbly Projector 2 | Máy chiếu. CHỮ chuyển động LẶP suốt lúc hiện. Hợp tông HOÀI NIỆM/kể chuyện/nhìn lại. | 0.50s |
| 52 | `Wobbly_Projector_3` | Wobbly Projector 3 | Máy chiếu. CHỮ chuyển động LẶP suốt lúc hiện. Hợp tông HOÀI NIỆM/kể chuyện/nhìn lại. | 0.50s |
| 53 | `Jump_Pieces` | Jump Pieces | Nhảy. CHỮ chuyển động LẶP suốt lúc hiện. | 0.50s |

## A10. Mask — Mặt nạ/khuôn hình
**Áp dụng:** `add_video/add_image(mask_type="<key>")`

> Tổng **9** mục.

| # | key | Tên | Mô tả & khi nào dùng |
|---|---|---|---|
| 1 | `Split` | Split | Tách đôi. Giới hạn vùng hiển thị theo hình — làm khung/highlight/chuyển mask. |
| 2 | `Filmstrip` | Filmstrip | (Suy từ tên 'Filmstrip') Giới hạn vùng hiển thị theo hình — làm khung/highlight/chuyển mask. — nên xem Bảng thử để chắc. |
| 3 | `Circle` | Circle | Hình tròn. Giới hạn vùng hiển thị theo hình — làm khung/highlight/chuyển mask. |
| 4 | `Rectangle` | Rectangle | (Suy từ tên 'Rectangle') Giới hạn vùng hiển thị theo hình — làm khung/highlight/chuyển mask. — nên xem Bảng thử để chắc. |
| 5 | `Stars` | Stars | Sao lấp lánh. Giới hạn vùng hiển thị theo hình — làm khung/highlight/chuyển mask. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. |
| 6 | `Heart` | Heart | Trái tim. Giới hạn vùng hiển thị theo hình — làm khung/highlight/chuyển mask. Hợp đoạn TÍCH CỰC/vui/thành công/tiền bạc. |
| 7 | `Text` | Text | (Suy từ tên 'Text') Giới hạn vùng hiển thị theo hình — làm khung/highlight/chuyển mask. — nên xem Bảng thử để chắc. |
| 8 | `Brush` | Brush | Nét cọ vẽ. Giới hạn vùng hiển thị theo hình — làm khung/highlight/chuyển mask. |
| 9 | `Pen` | Pen | (Suy từ tên 'Pen') Giới hạn vùng hiển thị theo hình — làm khung/highlight/chuyển mask. — nên xem Bảng thử để chắc. |


---
# PHẦN B — DÙNG CHUNG

## B1. Filter — Bộ lọc màu / tông
**Lưu ý:** API hiện chưa có tool add_filter trực tiếp; kho có sẵn để mở rộng.

> Tổng **468** mục.

| # | key (API) | Tên | Mô tả & khi nào dùng | Tham số/TL |
|---|---|---|---|---|
| 1 | `_1980` | 1980 | (Suy từ tên '1980') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 2 | `ABG` | ABG | (Suy từ tên 'ABG') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 3 | `Ditto` | Ditto | (Suy từ tên 'Ditto') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 4 | `KE1` | KE1 | (Suy từ tên 'KE1') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 5 | `KV5D` | KV5D | (Suy từ tên 'KV5D') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 6 | `VHS_III` | VHS III | (Suy từ tên 'VHS III') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 7 | `三洋VPC` | 三洋VPC | (Suy từ tên '三洋VPC') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 8 | `书意` | 书意 | (Suy từ tên '书意') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 9 | `亮肤` | 亮肤 | (Suy từ tên '亮肤') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 10 | `仲夏绿光` | 仲夏绿光 | (Suy từ tên '仲夏绿光') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 11 | `似锦` | 似锦 | (Suy từ tên '似锦') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 12 | `低保真` | 低保真 | (Suy từ tên '低保真') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 13 | `侘寂灰` | 侘寂灰 | (Suy từ tên '侘寂灰') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 14 | `冬恋` | 冬恋 | (Suy từ tên '冬恋') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 15 | `冰火` | 冰火 | (Suy từ tên '冰火') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 16 | `冰肌` | 冰肌 | (Suy từ tên '冰肌') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 17 | `冷气机` | 冷气机 | (Suy từ tên '冷气机') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 18 | `冷白` | 冷白 | (Suy từ tên '冷白') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 19 | `冷蓝` | 冷蓝 | (Suy từ tên '冷蓝') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 20 | `凝黛` | 凝黛 | (Suy từ tên '凝黛') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 21 | `初冷` | 初冷 | (Suy từ tên '初冷') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 22 | `初恋` | 初恋 | (Suy từ tên '初恋') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 23 | `千玺IXU` | 千玺IXU | (Suy từ tên '千玺IXU') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 24 | `千金妝` | 千金妝 | (Suy từ tên '千金妝') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 25 | `即刻春光` | 即刻春光 | (Suy từ tên '即刻春光') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 26 | `原木` | 原木 | (Suy từ tên '原木') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 27 | `古罗马` | 古罗马 | (Suy từ tên '古罗马') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 28 | `喜市` | 喜市 | (Suy từ tên '喜市') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 29 | `复古工业` | 复古工业 | (Suy từ tên '复古工业') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 30 | `夏日风吟` | 夏日风吟 | (Suy từ tên '夏日风吟') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 31 | `奈良` | 奈良 | (Suy từ tên '奈良') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 32 | `奥本海默` | 奥本海默 | (Suy từ tên '奥本海默') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 33 | `奶油` | 奶油 | (Suy từ tên '奶油') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 34 | `奶绿` | 奶绿 | (Suy từ tên '奶绿') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 35 | `姜饼红` | 姜饼红 | (Suy từ tên '姜饼红') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 36 | `安愉` | 安愉 | (Suy từ tên '安愉') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 37 | `富士CC_II` | 富士CC II | (Suy từ tên '富士CC II') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 38 | `寻荷` | 寻荷 | (Suy từ tên '寻荷') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 39 | `小镇` | 小镇 | (Suy từ tên '小镇') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 40 | `山系` | 山系 | (Suy từ tên '山系') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 41 | `巧克力` | 巧克力 | (Suy từ tên '巧克力') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 42 | `布兰卡` | 布兰卡 | (Suy từ tên '布兰卡') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 43 | `布朗` | 布朗 | (Suy từ tên '布朗') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 44 | `希望` | 希望 | (Suy từ tên '希望') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 45 | `幽蓝` | 幽蓝 | (Suy từ tên '幽蓝') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 46 | `彩果` | 彩果 | (Suy từ tên '彩果') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 47 | `影叙` | 影叙 | (Suy từ tên '影叙') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 48 | `德古拉` | 德古拉 | (Suy từ tên '德古拉') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 49 | `快照I` | 快照I | (Suy từ tên '快照I') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 50 | `忽风` | 忽风 | (Suy từ tên '忽风') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 51 | `恋颂` | 恋颂 | (Suy từ tên '恋颂') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 52 | `敦刻尔克` | 敦刻尔克 | (Suy từ tên '敦刻尔克') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 53 | `料理` | 料理 | (Suy từ tên '料理') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 54 | `新闪` | 新闪 | (Suy từ tên '新闪') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 55 | `日出` | 日出 | (Suy từ tên '日出') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 56 | `日系奶油` | 日系奶油 | (Suy từ tên '日系奶油') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 57 | `日落橘` | 日落橘 | (Suy từ tên '日落橘') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 58 | `旧乐园` | 旧乐园 | (Suy từ tên '旧乐园') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 59 | `旧时代I` | 旧时代I | (Suy từ tên '旧时代I') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 60 | `明晰` | 明晰 | (Suy từ tên '明晰') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 61 | `星云` | 星云 | (Suy từ tên '星云') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 62 | `晴颜` | 晴颜 | (Suy từ tên '晴颜') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 63 | `暖食` | 暖食 | (Suy từ tên '暖食') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 64 | `暗夜` | 暗夜 | (Suy từ tên '暗夜') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 65 | `暗雅` | 暗雅 | (Suy từ tên '暗雅') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 66 | `暮光` | 暮光 | (Suy từ tên '暮光') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 67 | `暮色` | 暮色 | (Suy từ tên '暮色') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 68 | `月升之国` | 月升之国 | (Suy từ tên '月升之国') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 69 | `月夜` | 月夜 | (Suy từ tên '月夜') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 70 | `月辉` | 月辉 | (Suy từ tên '月辉') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 71 | `未央` | 未央 | (Suy từ tên '未央') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 72 | `松果棕` | 松果棕 | (Suy từ tên '松果棕') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 73 | `林间` | 林间 | (Suy từ tên '林间') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 74 | `枫糖咖` | 枫糖咖 | (Suy từ tên '枫糖咖') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 75 | `柠檬青` | 柠檬青 | (Suy từ tên '柠檬青') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 76 | `梦海` | 梦海 | (Suy từ tên '梦海') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 77 | `梨花白` | 梨花白 | (Suy từ tên '梨花白') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 78 | `梵时` | 梵时 | (Suy từ tên '梵时') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 79 | `棕咖` | 棕咖 | (Suy từ tên '棕咖') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 80 | `棕宥` | 棕宥 | (Suy từ tên '棕宥') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 81 | `棠梨` | 棠梨 | (Suy từ tên '棠梨') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 82 | `椰林` | 椰林 | (Suy từ tên '椰林') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 83 | `椿和` | 椿和 | (Suy từ tên '椿和') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 84 | `椿来` | 椿来 | (Suy từ tên '椿来') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 85 | `樱粉` | 樱粉 | (Suy từ tên '樱粉') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 86 | `比佛利` | 比佛利 | (Suy từ tên '比佛利') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 87 | `气泡水` | 气泡水 | (Suy từ tên '气泡水') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 88 | `气色` | 气色 | (Suy từ tên '气色') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 89 | `江浙沪` | 江浙沪 | (Suy từ tên '江浙沪') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 90 | `浅岛` | 浅岛 | (Suy từ tên '浅岛') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 91 | `浮生` | 浮生 | (Suy từ tên '浮生') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 92 | `海街日记` | 海街日记 | (Suy từ tên '海街日记') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 93 | `海雾` | 海雾 | (Suy từ tên '海雾') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 94 | `海鸥DC` | 海鸥DC | (Suy từ tên '海鸥DC') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 95 | `深褐` | 深褐 | (Suy từ tên '深褐') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 96 | `清明上河` | 清明上河 | (Suy từ tên '清明上河') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 97 | `清晰` | 清晰 | (Suy từ tên '清晰') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 98 | `清澈` | 清澈 | (Suy từ tên '清澈') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 99 | `温述` | 温述 | (Suy từ tên '温述') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 100 | `港历` | 港历 | (Suy từ tên '港历') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 101 | `港风` | 港风 | (Suy từ tên '港风') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 102 | `漫夏` | 漫夏 | (Suy từ tên '漫夏') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 103 | `漫彩` | 漫彩 | (Suy từ tên '漫彩') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 104 | `漫步` | 漫步 | (Suy từ tên '漫步') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 105 | `烘培` | 烘培 | (Suy từ tên '烘培') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 106 | `烟岚` | 烟岚 | (Suy từ tên '烟岚') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 107 | `烟霞` | 烟霞 | (Suy từ tên '烟霞') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 108 | `煦日` | 煦日 | (Suy từ tên '煦日') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 109 | `燃力` | 燃力 | (Suy từ tên '燃力') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 110 | `牛皮纸` | 牛皮纸 | (Suy từ tên '牛皮纸') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 111 | `珠光蓝` | 珠光蓝 | (Suy từ tên '珠光蓝') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 112 | `珠落` | 珠落 | (Suy từ tên '珠落') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 113 | `病娇` | 病娇 | (Suy từ tên '病娇') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 114 | `白皙` | 白皙 | (Suy từ tên '白皙') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 115 | `盐岚` | 盐岚 | (Suy từ tên '盐岚') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 116 | `矿野` | 矿野 | (Suy từ tên '矿野') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 117 | `砂红` | 砂红 | (Suy từ tên '砂红') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 118 | `砾绀` | 砾绀 | (Suy từ tên '砾绀') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 119 | `祈安` | 祈安 | (Suy từ tên '祈安') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 120 | `空灵` | 空灵 | (Suy từ tên '空灵') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 121 | `米棕` | 米棕 | (Suy từ tên '米棕') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 122 | `粉瓷` | 粉瓷 | (Suy từ tên '粉瓷') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 123 | `粉肤` | 粉肤 | (Suy từ tên '粉肤') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 124 | `粹光` | 粹光 | (Suy từ tên '粹光') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 125 | `素肌` | 素肌 | (Suy từ tên '素肌') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 126 | `红绿` | 红绿 | (Suy từ tên '红绿') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 127 | `绝对红` | 绝对红 | (Suy từ tên '绝对红') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 128 | `绿妍` | 绿妍 | (Suy từ tên '绿妍') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 129 | `老友记` | 老友记 | (Suy từ tên '老友记') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 130 | `胡桃木` | 胡桃木 | (Suy từ tên '胡桃木') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 131 | `自然` | 自然 | (Suy từ tên '自然') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 132 | `自由` | 自由 | (Suy từ tên '自由') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 133 | `臻金` | 臻金 | (Suy từ tên '臻金') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 134 | `花园` | 花园 | (Suy từ tên '花园') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 135 | `花椿` | 花椿 | (Suy từ tên '花椿') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 136 | `苍岭` | 苍岭 | (Suy từ tên '苍岭') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 137 | `落日` | 落日 | (Suy từ tên '落日') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 138 | `落日海岛` | 落日海岛 | (Suy từ tên '落日海岛') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 139 | `落日飞车` | 落日飞车 | (Suy từ tên '落日飞车') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 140 | `薄荷` | 薄荷 | (Suy từ tên '薄荷') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 141 | `褪色` | 褪色 | (Suy từ tên '褪色') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 142 | `西野` | 西野 | (Suy từ tên '西野') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 143 | `西餐` | 西餐 | (Suy từ tên '西餐') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 144 | `谧歌` | 谧歌 | (Suy từ tên '谧歌') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 145 | `贝松绿` | 贝松绿 | (Suy từ tên '贝松绿') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 146 | `质感暗调` | 质感暗调 | (Suy từ tên '质感暗调') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 147 | `赛博朋克` | 赛博朋克 | (Suy từ tên '赛博朋克') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 148 | `赤陀` | 赤陀 | (Suy từ tên '赤陀') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 149 | `赫本` | 赫本 | (Suy từ tên '赫本') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 150 | `赫石` | 赫石 | (Suy từ tên '赫石') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 151 | `轻食` | 轻食 | (Suy từ tên '轻食') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 152 | `达芬妮` | 达芬妮 | (Suy từ tên '达芬妮') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 153 | `迈阿密` | 迈阿密 | (Suy từ tên '迈阿密') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 154 | `酷白` | 酷白 | (Suy từ tên '酷白') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 155 | `金属` | 金属 | (Suy từ tên '金属') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 156 | `闪光灯` | 闪光灯 | (Suy từ tên '闪光灯') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 157 | `闻香识人` | 闻香识人 | (Suy từ tên '闻香识人') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 158 | `阿尔菲` | 阿尔菲 | (Suy từ tên '阿尔菲') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 159 | `雪鹿` | 雪鹿 | (Suy từ tên '雪鹿') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 160 | `雾瓷` | 雾瓷 | (Suy từ tên '雾瓷') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 161 | `青橙` | 青橙 | (Suy từ tên '青橙') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 162 | `青红夜` | 青红夜 | (Suy từ tên '青红夜') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 163 | `风铃` | 风铃 | (Suy từ tên '风铃') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 164 | `高饱和` | 高饱和 | (Suy từ tên '高饱和') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 165 | `鬼魅` | 鬼魅 | (Suy từ tên '鬼魅') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 166 | `黑胶唱片` | 黑胶唱片 | (Suy từ tên '黑胶唱片') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 167 | `黑豹` | 黑豹 | (Suy từ tên '黑豹') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 168 | `默片` | 默片 | (Suy từ tên '默片') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 169 | `_160C` ⭐Pro | 160C | (Suy từ tên '160C') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 170 | `_2077` ⭐Pro | 2077 | (Suy từ tên '2077') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 171 | `_400H` ⭐Pro | 400H | (Suy từ tên '400H') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 172 | `_800Z` ⭐Pro | 800Z | (Suy từ tên '800Z') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 173 | `_90s` ⭐Pro | 90s | (Suy từ tên '90s') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 174 | `City_Walk` ⭐Pro | City Walk | Thành phố. Chỉnh TÔNG MÀU cả khung tạo mood. | — |
| 175 | `FXN` ⭐Pro | FXN | (Suy từ tên 'FXN') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 176 | `GR正片` ⭐Pro | GR正片 | (Suy từ tên 'GR正片') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 177 | `GR绿` ⭐Pro | GR绿 | (Suy từ tên 'GR绿') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 178 | `GR蓝` ⭐Pro | GR蓝 | (Suy từ tên 'GR蓝') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 179 | `IG白` ⭐Pro | IG白 | (Suy từ tên 'IG白') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 180 | `INS暗` ⭐Pro | INS暗 | (Suy từ tên 'INS暗') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 181 | `中性` ⭐Pro | 中性 | (Suy từ tên '中性') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 182 | `中性II` ⭐Pro | 中性II | (Suy từ tên '中性II') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 183 | `丹枫` ⭐Pro | 丹枫 | (Suy từ tên '丹枫') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 184 | `乐游` ⭐Pro | 乐游 | (Suy từ tên '乐游') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 185 | `云暖` ⭐Pro | 云暖 | (Suy từ tên '云暖') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 186 | `人生之事` ⭐Pro | 人生之事 | (Suy từ tên '人生之事') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 187 | `仲夏夜` ⭐Pro | 仲夏夜 | (Suy từ tên '仲夏夜') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 188 | `余晖` ⭐Pro | 余晖 | (Suy từ tên '余晖') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 189 | `佳能G7X_II` ⭐Pro | 佳能G7X II | (Suy từ tên '佳能G7X II') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 190 | `佳能G7X_III` ⭐Pro | 佳能G7X III | (Suy từ tên '佳能G7X III') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 191 | `俱乐部` ⭐Pro | 俱乐部 | (Suy từ tên '俱乐部') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 192 | `倾森` ⭐Pro | 倾森 | (Suy từ tên '倾森') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 193 | `光流` ⭐Pro | 光流 | (Suy từ tên '光流') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 194 | `冬禧` ⭐Pro | 冬禧 | (Suy từ tên '冬禧') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 195 | `冰原` ⭐Pro | 冰原 | (Suy từ tên '冰原') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 196 | `冰瀑` ⭐Pro | 冰瀑 | (Suy từ tên '冰瀑') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 197 | `冰茶` ⭐Pro | 冰茶 | (Suy từ tên '冰茶') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 198 | `冰雪世界` ⭐Pro | 冰雪世界 | (Suy từ tên '冰雪世界') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 199 | `冷叙` ⭐Pro | 冷叙 | (Suy từ tên '冷叙') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 200 | `冷墨` ⭐Pro | 冷墨 | (Suy từ tên '冷墨') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 201 | `冷寂` ⭐Pro | 冷寂 | (Suy từ tên '冷寂') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 202 | `冷月夜` ⭐Pro | 冷月夜 | (Suy từ tên '冷月夜') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 203 | `冷透` ⭐Pro | 冷透 | (Suy từ tên '冷透') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 204 | `净白` ⭐Pro | 净白 | (Suy từ tên '净白') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 205 | `净透` ⭐Pro | 净透 | (Suy từ tên '净透') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 206 | `凛风` ⭐Pro | 凛风 | (Suy từ tên '凛风') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 207 | `初雪` ⭐Pro | 初雪 | (Suy từ tên '初雪') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 208 | `初雪II` ⭐Pro | 初雪II | (Suy từ tên '初雪II') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 209 | `劲闯` ⭐Pro | 劲闯 | (Suy từ tên '劲闯') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 210 | `原生肤` ⭐Pro | 原生肤 | (Suy từ tên '原生肤') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 211 | `去灰` ⭐Pro | 去灰 | (Suy từ tên '去灰') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 212 | `去灰II` ⭐Pro | 去灰II | (Suy từ tên '去灰II') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 213 | `去黄` ⭐Pro | 去黄 | (Suy từ tên '去黄') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 214 | `古早记忆` ⭐Pro | 古早记忆 | (Suy từ tên '古早记忆') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 215 | `古筑` ⭐Pro | 古筑 | (Suy từ tên '古筑') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 216 | `古都` ⭐Pro | 古都 | (Suy từ tên '古都') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 217 | `吉宵` ⭐Pro | 吉宵 | (Suy từ tên '吉宵') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 218 | `向晚` ⭐Pro | 向晚 | (Suy từ tên '向晚') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 219 | `味蕾` ⭐Pro | 味蕾 | (Suy từ tên '味蕾') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 220 | `哈苏I` ⭐Pro | 哈苏I | (Suy từ tên '哈苏I') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 221 | `哈苏II` ⭐Pro | 哈苏II | (Suy từ tên '哈苏II') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 222 | `哈苏蓝` ⭐Pro | 哈苏蓝 | (Suy từ tên '哈苏蓝') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 223 | `哥谭` ⭐Pro | 哥谭 | (Suy từ tên '哥谭') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 224 | `增色` ⭐Pro | 增色 | (Suy từ tên '增色') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 225 | `墨林` ⭐Pro | 墨林 | (Suy từ tên '墨林') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 226 | `夏日粉` ⭐Pro | 夏日粉 | (Suy từ tên '夏日粉') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 227 | `多巴胺` ⭐Pro | 多巴胺 | (Suy từ tên '多巴胺') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 228 | `夜景增色` ⭐Pro | 夜景增色 | (Suy từ tên '夜景增色') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 229 | `夜雾` ⭐Pro | 夜雾 | (Suy từ tên '夜雾') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 230 | `奥林巴斯` ⭐Pro | 奥林巴斯 | (Suy từ tên '奥林巴斯') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 231 | `奶昔` ⭐Pro | 奶昔 | (Suy từ tên '奶昔') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 232 | `奶杏` ⭐Pro | 奶杏 | (Suy từ tên '奶杏') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 233 | `好莱坞I` ⭐Pro | 好莱坞I | (Suy từ tên '好莱坞I') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 234 | `好莱坞II` ⭐Pro | 好莱坞II | (Suy từ tên '好莱坞II') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 235 | `好莱坞III` ⭐Pro | 好莱坞III | (Suy từ tên '好莱坞III') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 236 | `好莱坞IV` ⭐Pro | 好莱坞IV | (Suy từ tên '好莱坞IV') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 237 | `嫩肤` ⭐Pro | 嫩肤 | (Suy từ tên '嫩肤') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 238 | `子弹列车` ⭐Pro | 子弹列车 | (Suy từ tên '子弹列车') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 239 | `家宴` ⭐Pro | 家宴 | (Suy từ tên '家宴') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 240 | `宿营` ⭐Pro | 宿营 | (Suy từ tên '宿营') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 241 | `富士CC_I` ⭐Pro | 富士CC I | (Suy từ tên '富士CC I') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 242 | `富士NC_I` ⭐Pro | 富士NC I | (Suy từ tên '富士NC I') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 243 | `富士NC_II` ⭐Pro | 富士NC II | (Suy từ tên '富士NC II') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 244 | `富士NC_III` ⭐Pro | 富士NC III | (Suy từ tên '富士NC III') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 245 | `富士蓝` ⭐Pro | 富士蓝 | (Suy từ tên '富士蓝') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 246 | `富士蓝II` ⭐Pro | 富士蓝II | (Suy từ tên '富士蓝II') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 247 | `富士青` ⭐Pro | 富士青 | (Suy từ tên '富士青') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 248 | `小麦肌` ⭐Pro | 小麦肌 | (Suy từ tên '小麦肌') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 249 | `小麦色` ⭐Pro | 小麦色 | (Suy từ tên '小麦色') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 250 | `尘烟` ⭐Pro | 尘烟 | (Suy từ tên '尘烟') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 251 | `山晴` ⭐Pro | 山晴 | (Suy từ tên '山晴') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 252 | `山本` ⭐Pro | 山本 | (Suy từ tên '山本') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 253 | `岚夏` ⭐Pro | 岚夏 | (Suy từ tên '岚夏') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 254 | `岩灰` ⭐Pro | 岩灰 | (Suy từ tên '岩灰') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 255 | `底特律` ⭐Pro | 底特律 | (Suy từ tên '底特律') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 256 | `彩光` ⭐Pro | 彩光 | (Suy từ tên '彩光') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 257 | `影部` ⭐Pro | 影部 | (Suy từ tên '影部') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 258 | `徕卡I` ⭐Pro | 徕卡I | (Suy từ tên '徕卡I') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 259 | `徕卡II` ⭐Pro | 徕卡II | (Suy từ tên '徕卡II') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 260 | `心动夏` ⭐Pro | 心动夏 | (Suy từ tên '心动夏') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 261 | `忆山` ⭐Pro | 忆山 | (Suy từ tên '忆山') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 262 | `快照II` ⭐Pro | 快照II | (Suy từ tên '快照II') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 263 | `怦然心动` ⭐Pro | 怦然心动 | (Suy từ tên '怦然心动') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 264 | `恍光` ⭐Pro | 恍光 | (Suy từ tên '恍光') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 265 | `慕斯` ⭐Pro | 慕斯 | (Suy từ tên '慕斯') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 266 | `捕风` ⭐Pro | 捕风 | (Suy từ tên '捕风') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 267 | `摩登` ⭐Pro | 摩登 | (Suy từ tên '摩登') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 268 | `攀岩` ⭐Pro | 攀岩 | (Suy từ tên '攀岩') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 269 | `日和` ⭐Pro | 日和 | (Suy từ tên '日和') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 270 | `旧时代II` ⭐Pro | 旧时代II | (Suy từ tên '旧时代II') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 271 | `旧时来信` ⭐Pro | 旧时来信 | (Suy từ tên '旧时来信') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 272 | `旧金山` ⭐Pro | 旧金山 | (Suy từ tên '旧金山') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 273 | `旷野` ⭐Pro | 旷野 | (Suy từ tên '旷野') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 274 | `旷野蓝` ⭐Pro | 旷野蓝 | (Suy từ tên '旷野蓝') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 275 | `明肤` ⭐Pro | 明肤 | (Suy từ tên '明肤') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 276 | `春风` ⭐Pro | 春风 | (Suy từ tên '春风') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 277 | `昭和` ⭐Pro | 昭和 | (Suy từ tên '昭和') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 278 | `晚宴` ⭐Pro | 晚宴 | (Suy từ tên '晚宴') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 279 | `晚晴` ⭐Pro | 晚晴 | (Suy từ tên '晚晴') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 280 | `晚樱` ⭐Pro | 晚樱 | (Suy từ tên '晚樱') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 281 | `晚霞` ⭐Pro | 晚霞 | (Suy từ tên '晚霞') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 282 | `晚霞增色` ⭐Pro | 晚霞增色 | (Suy từ tên '晚霞增色') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 283 | `普林斯顿` ⭐Pro | 普林斯顿 | (Suy từ tên '普林斯顿') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 284 | `晴冬` ⭐Pro | 晴冬 | (Suy từ tên '晴冬') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 285 | `晴好` ⭐Pro | 晴好 | (Suy từ tên '晴好') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 286 | `晴好假日` ⭐Pro | 晴好假日 | (Suy từ tên '晴好假日') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 287 | `晴春` ⭐Pro | 晴春 | (Suy từ tên '晴春') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 288 | `晴空` ⭐Pro | 晴空 | (Suy từ tên '晴空') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 289 | `晴肤` ⭐Pro | 晴肤 | (Suy từ tên '晴肤') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 290 | `晶透` ⭐Pro | 晶透 | (Suy từ tên '晶透') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 291 | `暖冬` ⭐Pro | 暖冬 | (Suy từ tên '暖冬') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 292 | `暖晨` ⭐Pro | 暖晨 | (Suy từ tên '暖晨') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 293 | `暖黄` ⭐Pro | 暖黄 | (Suy từ tên '暖黄') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 294 | `暗匣` ⭐Pro | 暗匣 | (Suy từ tên '暗匣') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 295 | `暗夜明肤` ⭐Pro | 暗夜明肤 | (Suy từ tên '暗夜明肤') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 296 | `暗影` ⭐Pro | 暗影 | (Suy từ tên '暗影') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 297 | `暗曛` ⭐Pro | 暗曛 | (Suy từ tên '暗曛') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 298 | `暗银` ⭐Pro | 暗银 | (Suy từ tên '暗银') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 299 | `暗银II` ⭐Pro | 暗银II | (Suy từ tên '暗银II') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 300 | `暮川` ⭐Pro | 暮川 | (Suy từ tên '暮川') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 301 | `暮色约会` ⭐Pro | 暮色约会 | (Suy từ tên '暮色约会') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 302 | `月吟` ⭐Pro | 月吟 | (Suy từ tên '月吟') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 303 | `松绿` ⭐Pro | 松绿 | (Suy từ tên '松绿') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 304 | `果酥` ⭐Pro | 果酥 | (Suy từ tên '果酥') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 305 | `柔焦` ⭐Pro | 柔焦 | (Suy từ tên '柔焦') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 306 | `柔绀` ⭐Pro | 柔绀 | (Suy từ tên '柔绀') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 307 | `栩栩` ⭐Pro | 栩栩 | (Suy từ tên '栩栩') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 308 | `格金` ⭐Pro | 格金 | (Suy từ tên '格金') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 309 | `桃木` ⭐Pro | 桃木 | (Suy từ tên '桃木') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 310 | `桃粉` ⭐Pro | 桃粉 | (Suy từ tên '桃粉') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 311 | `桐影` ⭐Pro | 桐影 | (Suy từ tên '桐影') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 312 | `梦境` ⭐Pro | 梦境 | (Suy từ tên '梦境') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 313 | `梦幻雪乡` ⭐Pro | 梦幻雪乡 | (Suy từ tên '梦幻雪乡') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 314 | `梦核紫` ⭐Pro | 梦核紫 | (Suy từ tên '梦核紫') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 315 | `棕榈` ⭐Pro | 棕榈 | (Suy từ tên '棕榈') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 316 | `森山` ⭐Pro | 森山 | (Suy từ tên '森山') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 317 | `森秋` ⭐Pro | 森秋 | (Suy từ tên '森秋') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 318 | `榄白` ⭐Pro | 榄白 | (Suy từ tên '榄白') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 319 | `橙蓝` ⭐Pro | 橙蓝 | (Suy từ tên '橙蓝') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 320 | `殷粉` ⭐Pro | 殷粉 | (Suy từ tên '殷粉') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 321 | `沙砾` ⭐Pro | 沙砾 | (Suy từ tên '沙砾') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 322 | `法餐` ⭐Pro | 法餐 | (Suy từ tên '法餐') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 323 | `浅茶` ⭐Pro | 浅茶 | (Suy từ tên '浅茶') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 324 | `浅草` ⭐Pro | 浅草 | (Suy từ tên '浅草') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 325 | `润光` ⭐Pro | 润光 | (Suy từ tên '润光') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 326 | `润白` ⭐Pro | 润白 | (Suy từ tên '润白') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 327 | `淡奶油` ⭐Pro | 淡奶油 | (Suy từ tên '淡奶油') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 328 | `清新润颜` ⭐Pro | 清新润颜 | (Suy từ tên '清新润颜') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 329 | `清晰ll` ⭐Pro | 清晰ll | (Suy từ tên '清晰ll') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 330 | `清爽` ⭐Pro | 清爽 | (Suy từ tên '清爽') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 331 | `漠土` ⭐Pro | 漠土 | (Suy từ tên '漠土') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 332 | `漫樱` ⭐Pro | 漫樱 | (Suy từ tên '漫樱') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 333 | `漫空` ⭐Pro | 漫空 | (Suy từ tên '漫空') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 334 | `漫荫` ⭐Pro | 漫荫 | (Suy từ tên '漫荫') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 335 | `漱石` ⭐Pro | 漱石 | (Suy từ tên '漱石') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 336 | `潘多拉` ⭐Pro | 潘多拉 | (Suy từ tên '潘多拉') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 337 | `灯会` ⭐Pro | 灯会 | (Suy từ tên '灯会') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 338 | `灰麻` ⭐Pro | 灰麻 | (Suy từ tên '灰麻') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 339 | `炊烟` ⭐Pro | 炊烟 | (Suy từ tên '炊烟') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 340 | `烈空` ⭐Pro | 烈空 | (Suy từ tên '烈空') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 341 | `烘挞` ⭐Pro | 烘挞 | (Suy từ tên '烘挞') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 342 | `烟橙` ⭐Pro | 烟橙 | (Suy từ tên '烟橙') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 343 | `烟花璀璨` ⭐Pro | 烟花璀璨 | (Suy từ tên '烟花璀璨') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 344 | `热带季风` ⭐Pro | 热带季风 | (Suy từ tên '热带季风') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 345 | `焕肤` ⭐Pro | 焕肤 | (Suy từ tên '焕肤') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 346 | `焰色` ⭐Pro | 焰色 | (Suy từ tên '焰色') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 347 | `爱之城` ⭐Pro | 爱之城 | (Suy từ tên '爱之城') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 348 | `爱之城II` ⭐Pro | 爱之城II | (Suy từ tên '爱之城II') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 349 | `牙白` ⭐Pro | 牙白 | (Suy từ tên '牙白') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 350 | `牧野` ⭐Pro | 牧野 | (Suy từ tên '牧野') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 351 | `独行侠` ⭐Pro | 独行侠 | (Suy từ tên '独行侠') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 352 | `玩趣` ⭐Pro | 玩趣 | (Suy từ tên '玩趣') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 353 | `琥珀` ⭐Pro | 琥珀 | (Suy từ tên '琥珀') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 354 | `画报` ⭐Pro | 画报 | (Suy từ tên '画报') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 355 | `登高` ⭐Pro | 登高 | (Suy từ tên '登高') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 356 | `白富美` ⭐Pro | 白富美 | (Suy từ tên '白富美') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 357 | `白桃` ⭐Pro | 白桃 | (Suy từ tên '白桃') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 358 | `白色恋人` ⭐Pro | 白色恋人 | (Suy từ tên '白色恋人') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 359 | `百川` ⭐Pro | 百川 | (Suy từ tên '百川') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 360 | `皓影` ⭐Pro | 皓影 | (Suy từ tên '皓影') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 361 | `盐系` ⭐Pro | 盐系 | (Suy từ tên '盐系') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 362 | `石山` ⭐Pro | 石山 | (Suy từ tên '石山') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 363 | `砂金` ⭐Pro | 砂金 | (Suy từ tên '砂金') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 364 | `破晓` ⭐Pro | 破晓 | (Suy từ tên '破晓') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 365 | `硬朗` ⭐Pro | 硬朗 | (Suy từ tên '硬朗') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 366 | `碳烤` ⭐Pro | 碳烤 | (Suy từ tên '碳烤') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 367 | `私语` ⭐Pro | 私语 | (Suy từ tên '私语') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 368 | `秋池` ⭐Pro | 秋池 | (Suy từ tên '秋池') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 369 | `秋波` ⭐Pro | 秋波 | (Suy từ tên '秋波') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 370 | `简餐` ⭐Pro | 简餐 | (Suy từ tên '简餐') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 371 | `粉橘` ⭐Pro | 粉橘 | (Suy từ tên '粉橘') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 372 | `粉白` ⭐Pro | 粉白 | (Suy từ tên '粉白') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 373 | `素净` ⭐Pro | 素净 | (Suy từ tên '素净') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 374 | `素简` ⭐Pro | 素简 | (Suy từ tên '素简') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 375 | `素银` ⭐Pro | 素银 | (Suy từ tên '素银') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 376 | `繁花似锦` ⭐Pro | 繁花似锦 | (Suy từ tên '繁花似锦') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 377 | `繁花如梦` ⭐Pro | 繁花如梦 | (Suy từ tên '繁花如梦') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 378 | `繁花璀璨` ⭐Pro | 繁花璀璨 | (Suy từ tên '繁花璀璨') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 379 | `红运` ⭐Pro | 红运 | (Suy từ tên '红运') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 380 | `纱雾` ⭐Pro | 纱雾 | (Suy từ tên '纱雾') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 381 | `美拉德` ⭐Pro | 美拉德 | (Suy từ tên '美拉德') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 382 | `美高` ⭐Pro | 美高 | (Suy từ tên '美高') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 383 | `羽梦` ⭐Pro | 羽梦 | (Suy từ tên '羽梦') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 384 | `聚焦` ⭐Pro | 聚焦 | (Suy từ tên '聚焦') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 385 | `艾丽莎` ⭐Pro | 艾丽莎 | (Suy từ tên '艾丽莎') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 386 | `花间` ⭐Pro | 花间 | (Suy từ tên '花间') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 387 | `花间II` ⭐Pro | 花间II | (Suy từ tên '花间II') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 388 | `花食` ⭐Pro | 花食 | (Suy từ tên '花食') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 389 | `苍橘` ⭐Pro | 苍橘 | (Suy từ tên '苍橘') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 390 | `茶酪` ⭐Pro | 茶酪 | (Suy từ tên '茶酪') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 391 | `莫吉托` ⭐Pro | 莫吉托 | (Suy từ tên '莫吉托') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 392 | `落日派对` ⭐Pro | 落日派对 | (Suy từ tên '落日派对') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 393 | `落日粉` ⭐Pro | 落日粉 | (Suy từ tên '落日粉') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 394 | `落日鎏金` ⭐Pro | 落日鎏金 | (Suy từ tên '落日鎏金') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 395 | `蓝梦核` ⭐Pro | 蓝梦核 | (Suy từ tên '蓝梦核') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 396 | `蓝橙II` ⭐Pro | 蓝橙II | (Suy từ tên '蓝橙II') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 397 | `蓝灰` ⭐Pro | 蓝灰 | (Suy từ tên '蓝灰') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 398 | `蓝调` ⭐Pro | 蓝调 | (Suy từ tên '蓝调') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 399 | `蓝调时刻` ⭐Pro | 蓝调时刻 | (Suy từ tên '蓝调时刻') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 400 | `蓝调烟火` ⭐Pro | 蓝调烟火 | (Suy từ tên '蓝调烟火') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 401 | `蓝调舞曲` ⭐Pro | 蓝调舞曲 | (Suy từ tên '蓝调舞曲') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 402 | `蓝都` ⭐Pro | 蓝都 | (Suy từ tên '蓝都') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 403 | `蓝金` ⭐Pro | 蓝金 | (Suy từ tên '蓝金') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 404 | `裸粉` ⭐Pro | 裸粉 | (Suy từ tên '裸粉') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 405 | `西冷` ⭐Pro | 西冷 | (Suy từ tên '西冷') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 406 | `西西里` ⭐Pro | 西西里 | (Suy từ tên '西西里') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 407 | `西雅图` ⭐Pro | 西雅图 | (Suy từ tên '西雅图') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 408 | `诗诺` ⭐Pro | 诗诺 | (Suy từ tên '诗诺') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 409 | `象牙白` ⭐Pro | 象牙白 | (Suy từ tên '象牙白') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 410 | `贝果` ⭐Pro | 贝果 | (Suy từ tên '贝果') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 411 | `赏味` ⭐Pro | 赏味 | (Suy từ tên '赏味') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 412 | `赤墙` ⭐Pro | 赤墙 | (Suy từ tên '赤墙') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 413 | `超白` ⭐Pro | 超白 | (Suy từ tên '超白') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 414 | `越岭` ⭐Pro | 越岭 | (Suy từ tên '越岭') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 415 | `越野` ⭐Pro | 越野 | (Suy từ tên '越野') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 416 | `过期电影卷` ⭐Pro | 过期电影卷 | (Suy từ tên '过期电影卷') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 417 | `迷幻` ⭐Pro | 迷幻 | (Suy từ tên '迷幻') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 418 | `迷雾` ⭐Pro | 迷雾 | (Suy từ tên '迷雾') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 419 | `逆光提亮` ⭐Pro | 逆光提亮 | (Suy từ tên '逆光提亮') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 420 | `透亮` ⭐Pro | 透亮 | (Suy từ tên '透亮') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 421 | `邂逅` ⭐Pro | 邂逅 | (Suy từ tên '邂逅') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 422 | `郁金香` ⭐Pro | 郁金香 | (Suy từ tên '郁金香') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 423 | `都卡` ⭐Pro | 都卡 | (Suy từ tên '都卡') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 424 | `都市` ⭐Pro | 都市 | (Suy từ tên '都市') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 425 | `酚蓝` ⭐Pro | 酚蓝 | (Suy từ tên '酚蓝') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 426 | `醒春` ⭐Pro | 醒春 | (Suy từ tên '醒春') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 427 | `里昂` ⭐Pro | 里昂 | (Suy từ tên '里昂') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 428 | `野趣` ⭐Pro | 野趣 | (Suy từ tên '野趣') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 429 | `金喜` ⭐Pro | 金喜 | (Suy từ tên '金喜') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 430 | `金姜` ⭐Pro | 金姜 | (Suy từ tên '金姜') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 431 | `金色韶华` ⭐Pro | 金色韶华 | (Suy từ tên '金色韶华') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 432 | `银蓝` ⭐Pro | 银蓝 | (Suy từ tên '银蓝') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 433 | `镜粉` ⭐Pro | 镜粉 | (Suy từ tên '镜粉') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 434 | `闪星` ⭐Pro | 闪星 | (Suy từ tên '闪星') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 435 | `阳光肤` ⭐Pro | 阳光肤 | (Suy từ tên '阳光肤') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 436 | `陶瓷肌` ⭐Pro | 陶瓷肌 | (Suy từ tên '陶瓷肌') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 437 | `随性` ⭐Pro | 随性 | (Suy từ tên '随性') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 438 | `雨空` ⭐Pro | 雨空 | (Suy từ tên '雨空') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 439 | `雪挞` ⭐Pro | 雪挞 | (Suy từ tên '雪挞') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 440 | `雪肤` ⭐Pro | 雪肤 | (Suy từ tên '雪肤') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 441 | `雾都` ⭐Pro | 雾都 | (Suy từ tên '雾都') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 442 | `雾野` ⭐Pro | 雾野 | (Suy từ tên '雾野') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 443 | `青提` ⭐Pro | 青提 | (Suy từ tên '青提') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 444 | `青灰` ⭐Pro | 青灰 | (Suy từ tên '青灰') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 445 | `青蒲` ⭐Pro | 青蒲 | (Suy từ tên '青蒲') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 446 | `青黄` ⭐Pro | 青黄 | (Suy từ tên '青黄') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 447 | `青黄II` ⭐Pro | 青黄II | (Suy từ tên '青黄II') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 448 | `风味` ⭐Pro | 风味 | (Suy từ tên '风味') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 449 | `风铃II` ⭐Pro | 风铃II | (Suy từ tên '风铃II') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 450 | `风铃蓝` ⭐Pro | 风铃蓝 | (Suy từ tên '风铃蓝') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 451 | `飒意` ⭐Pro | 飒意 | (Suy từ tên '飒意') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 452 | `食色` ⭐Pro | 食色 | (Suy từ tên '食色') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 453 | `香浓` ⭐Pro | 香浓 | (Suy từ tên '香浓') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 454 | `驮月` ⭐Pro | 驮月 | (Suy từ tên '驮月') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 455 | `高清` ⭐Pro | 高清 | (Suy từ tên '高清') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 456 | `高清II` ⭐Pro | 高清II | (Suy từ tên '高清II') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 457 | `魅影` ⭐Pro | 魅影 | (Suy từ tên '魅影') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 458 | `魔都` ⭐Pro | 魔都 | (Suy từ tên '魔都') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 459 | `鲜亮` ⭐Pro | 鲜亮 | (Suy từ tên '鲜亮') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 460 | `鲜明` ⭐Pro | 鲜明 | (Suy từ tên '鲜明') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 461 | `鲜明II` ⭐Pro | 鲜明II | (Suy từ tên '鲜明II') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 462 | `鲜美` ⭐Pro | 鲜美 | (Suy từ tên '鲜美') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 463 | `黄昏` ⭐Pro | 黄昏 | (Suy từ tên '黄昏') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 464 | `黑冰` ⭐Pro | 黑冰 | (Suy từ tên '黑冰') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 465 | `黑曜` ⭐Pro | 黑曜 | (Suy từ tên '黑曜') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 466 | `黑金` ⭐Pro | 黑金 | (Suy từ tên '黑金') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |
| 467 | `黑金红` ⭐Pro | 黑金红 | (Suy từ tên '黑金红') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | effects_adjust_filter=1[0~1] |
| 468 | `龙舌兰` ⭐Pro | 龙舌兰 | (Suy từ tên '龙舌兰') Chỉnh TÔNG MÀU cả khung tạo mood. — nên xem Bảng thử để chắc. | — |

## B2. Font — Phông chữ
**Áp dụng:** `add_text(font="<key>")`. (Mô tả font dựa trên độ đậm trong tên; cần thử dấu tiếng Việt.)

> Tổng **335** mục.

| # | key | Tên | Gợi ý |
|---|---|---|---|
| 1 | `CC_Captial` | CC-Captial | Thường — thân chữ/phụ đề |
| 2 | `CC_Moderno` | CC-Moderno | Thường — thân chữ/phụ đề |
| 3 | `JYruantang` | JYruantang | Thường — thân chữ/phụ đề |
| 4 | `JYshiduo` | JYshiduo | Thường — thân chữ/phụ đề |
| 5 | `JYzhuqingting` | JYzhuqingting | Thường — thân chữ/phụ đề |
| 6 | `Merry_Christmas` | Merry Christmas | Thường — thân chữ/phụ đề |
| 7 | `MyFont凌渡哥哥简` | MyFont凌渡哥哥简 | Thường — thân chữ/phụ đề |
| 8 | `ZY_Balloonbillow` | ZY Balloonbillow | Thường — thân chữ/phụ đề |
| 9 | `ZY_Blossom` | ZY Blossom | Thường — thân chữ/phụ đề |
| 10 | `ZY_Brief` | ZY Brief | Thường — thân chữ/phụ đề |
| 11 | `ZY_Courage` | ZY Courage | Thường — thân chữ/phụ đề |
| 12 | `ZY_Daisy` | ZY Daisy | Thường — thân chữ/phụ đề |
| 13 | `ZY_Elixir` | ZY Elixir | Thường — thân chữ/phụ đề |
| 14 | `ZY_Fabulous` | ZY Fabulous | Thường — thân chữ/phụ đề |
| 15 | `ZY_Fantasy` | ZY Fantasy | Thường — thân chữ/phụ đề |
| 16 | `ZY_Flourishing_Italic` | ZY Flourishing-Italic | Nghiêng — nhấn/trích dẫn |
| 17 | `ZY_Fortitude` | ZY Fortitude | Thường — thân chữ/phụ đề |
| 18 | `ZY_Kindly_Breeze` | ZY Kindly Breeze | Thường — thân chữ/phụ đề |
| 19 | `ZY_Loyalty` | ZY Loyalty | Thường — thân chữ/phụ đề |
| 20 | `ZY_Modern` | ZY Modern | Thường — thân chữ/phụ đề |
| 21 | `ZY_Multiplicity` | ZY Multiplicity | Thường — thân chữ/phụ đề |
| 22 | `ZY_Panacea` | ZY Panacea | Thường — thân chữ/phụ đề |
| 23 | `ZY_Relax` | ZY Relax | Thường — thân chữ/phụ đề |
| 24 | `ZY_Slender` | ZY Slender | Thường — thân chữ/phụ đề |
| 25 | `ZY_Spunk` | ZY Spunk | Thường — thân chữ/phụ đề |
| 26 | `ZY_Squiggle` | ZY Squiggle | Thường — thân chữ/phụ đề |
| 27 | `ZY_Starry` | ZY Starry | Thường — thân chữ/phụ đề |
| 28 | `ZY_Timing` | ZY Timing | Thường — thân chữ/phụ đề |
| 29 | `ZY_Trend` | ZY Trend | Thường — thân chữ/phụ đề |
| 30 | `ZYLAA_Demure` | ZYLAA Demure | Thường — thân chữ/phụ đề |
| 31 | `Amigate` | Amigate | Thường — thân chữ/phụ đề |
| 32 | `Anson` | Anson | Thường — thân chữ/phụ đề |
| 33 | `BlackMango_Black` | BlackMango-Black | Rất đậm — hợp TIÊU ĐỀ/keyword to |
| 34 | `BlackMango_Regular` | BlackMango-Regular | Rất đậm — hợp TIÊU ĐỀ/keyword to |
| 35 | `Bungee_Regular` | Bungee-Regular | Thường — thân chữ/phụ đề |
| 36 | `Cabin_Rg` | Cabin-Rg | Thường — thân chữ/phụ đề |
| 37 | `Caveat_Regular` | Caveat-Regular | Thường — thân chữ/phụ đề |
| 38 | `Climate` | Climate | Thường — thân chữ/phụ đề |
| 39 | `Coiny_Regular` | Coiny-Regular | Thường — thân chữ/phụ đề |
| 40 | `DMSans_BoldItalic` | DMSans-BoldItalic | Rất đậm — hợp TIÊU ĐỀ/keyword to |
| 41 | `Exo` | Exo | Thường — thân chữ/phụ đề |
| 42 | `Gallery` | Gallery | Thường — thân chữ/phụ đề |
| 43 | `Giveny` | Giveny | Thường — thân chữ/phụ đề |
| 44 | `Grandstander_Regular` | Grandstander-Regular | Thường — thân chữ/phụ đề |
| 45 | `Gratefulness` | Gratefulness | Thường — thân chữ/phụ đề |
| 46 | `HarmonyOS_Sans_SC_Bold` | HarmonyOS_Sans_SC_Bold | Rất đậm — hợp TIÊU ĐỀ/keyword to |
| 47 | `HarmonyOS_Sans_SC_Medium` | HarmonyOS_Sans_SC_Medium | Đậm vừa — tiêu đề phụ |
| 48 | `HarmonyOS_Sans_SC_Regular` | HarmonyOS_Sans_SC_Regular | Thường — thân chữ/phụ đề |
| 49 | `HarmonyOS_Sans_TC_Bold` | HarmonyOS_Sans_TC_Bold | Rất đậm — hợp TIÊU ĐỀ/keyword to |
| 50 | `HarmonyOS_Sans_TC_Light` | HarmonyOS_Sans_TC_Light | Mảnh — chữ trang trí/nền |
| 51 | `HarmonyOS_Sans_TC_Medium` | HarmonyOS_Sans_TC_Medium | Đậm vừa — tiêu đề phụ |
| 52 | `HarmonyOS_Sans_TC_Regular` | HarmonyOS_Sans_TC_Regular | Thường — thân chữ/phụ đề |
| 53 | `HeptaSlab_ExtraBold` | HeptaSlab-ExtraBold | Rất đậm — hợp TIÊU ĐỀ/keyword to |
| 54 | `HeptaSlab_Light` | HeptaSlab-Light | Mảnh — chữ trang trí/nền |
| 55 | `Huben` | Huben | Thường — thân chữ/phụ đề |
| 56 | `Ingram` | Ingram | Thường — thân chữ/phụ đề |
| 57 | `Integrity` | Integrity | Thường — thân chữ/phụ đề |
| 58 | `Inter_Black` | Inter-Black | Rất đậm — hợp TIÊU ĐỀ/keyword to |
| 59 | `Kanit_Black` | Kanit-Black | Rất đậm — hợp TIÊU ĐỀ/keyword to |
| 60 | `Kanit_Regular` | Kanit-Regular | Thường — thân chữ/phụ đề |
| 61 | `Koulen_Regular` | Koulen-Regular | Thường — thân chữ/phụ đề |
| 62 | `LXGWWenKai_Bold` | LXGWWenKai-Bold | Rất đậm — hợp TIÊU ĐỀ/keyword to |
| 63 | `LXGWWenKai_Light` | LXGWWenKai-Light | Mảnh — chữ trang trí/nền |
| 64 | `LXGWWenKai_Regular` | LXGWWenKai-Regular | Thường — thân chữ/phụ đề |
| 65 | `Love` | Love | Thường — thân chữ/phụ đề |
| 66 | `Luxury` | Luxury | Thường — thân chữ/phụ đề |
| 67 | `MiSans_Heavy` | MiSans-Heavy | Rất đậm — hợp TIÊU ĐỀ/keyword to |
| 68 | `MiSans_Regular` | MiSans-Regular | Thường — thân chữ/phụ đề |
| 69 | `Modern` | Modern | Thường — thân chữ/phụ đề |
| 70 | `Nunito` | Nunito | Thường — thân chữ/phụ đề |
| 71 | `OldStandardTT_Regular` | OldStandardTT-Regular | Thường — thân chữ/phụ đề |
| 72 | `Pacifico_Regular` | Pacifico-Regular | Thường — thân chữ/phụ đề |
| 73 | `PlayfairDisplay_Bold` | PlayfairDisplay-Bold | Rất đậm — hợp TIÊU ĐỀ/keyword to |
| 74 | `Plunct` | Plunct | Thường — thân chữ/phụ đề |
| 75 | `Polly` | Polly | Thường — thân chữ/phụ đề |
| 76 | `Poppins_Bold` | Poppins-Bold | Rất đậm — hợp TIÊU ĐỀ/keyword to |
| 77 | `Poppins_Regular` | Poppins-Regular | Thường — thân chữ/phụ đề |
| 78 | `RedHatDisplay_BoldItalic` | RedHatDisplay-BoldItalic | Rất đậm — hợp TIÊU ĐỀ/keyword to |
| 79 | `RedHatDisplay_Light` | RedHatDisplay-Light | Mảnh — chữ trang trí/nền |
| 80 | `ResourceHanRoundedCN_Md` | ResourceHanRoundedCN-Md | Thường — thân chữ/phụ đề |
| 81 | `ResourceHanRoundedCN_Nl` | ResourceHanRoundedCN-Nl | Thường — thân chữ/phụ đề |
| 82 | `Roboto_BlkCn` | Roboto-BlkCn | Thường — thân chữ/phụ đề |
| 83 | `SansitaSwashed_Regular` | SansitaSwashed-Regular | Thường — thân chữ/phụ đề |
| 84 | `SecularOne_Regular` | SecularOne-Regular | Thường — thân chữ/phụ đề |
| 85 | `Signature` | Signature | Thường — thân chữ/phụ đề |
| 86 | `Soap` | Soap | Thường — thân chữ/phụ đề |
| 87 | `Sora_Bold` | Sora-Bold | Rất đậm — hợp TIÊU ĐỀ/keyword to |
| 88 | `Sora_Regular` | Sora-Regular | Thường — thân chữ/phụ đề |
| 89 | `SourceHanSansCN_Bold` | SourceHanSansCN-Bold | Rất đậm — hợp TIÊU ĐỀ/keyword to |
| 90 | `SourceHanSansCN_Light` | SourceHanSansCN-Light | Mảnh — chữ trang trí/nền |
| 91 | `SourceHanSansCN_Medium` | SourceHanSansCN-Medium | Đậm vừa — tiêu đề phụ |
| 92 | `SourceHanSansCN_Normal` | SourceHanSansCN-Normal | Thường — thân chữ/phụ đề |
| 93 | `SourceHanSansCN_Regular` | SourceHanSansCN-Regular | Thường — thân chữ/phụ đề |
| 94 | `SourceHanSansTW_Bold` | SourceHanSansTW-Bold | Rất đậm — hợp TIÊU ĐỀ/keyword to |
| 95 | `SourceHanSansTW_Light` | SourceHanSansTW-Light | Mảnh — chữ trang trí/nền |
| 96 | `SourceHanSansTW_Medium` | SourceHanSansTW-Medium | Đậm vừa — tiêu đề phụ |
| 97 | `SourceHanSansTW_Normal` | SourceHanSansTW-Normal | Thường — thân chữ/phụ đề |
| 98 | `SourceHanSansTW_Regular` | SourceHanSansTW-Regular | Thường — thân chữ/phụ đề |
| 99 | `SourceHanSerifCN_Light` | SourceHanSerifCN-Light | Mảnh — chữ trang trí/nền |
| 100 | `SourceHanSerifCN_Medium` | SourceHanSerifCN-Medium | Đậm vừa — tiêu đề phụ |
| 101 | `SourceHanSerifCN_Regular` | SourceHanSerifCN-Regular | Thường — thân chữ/phụ đề |
| 102 | `SourceHanSerifCN_SemiBold` | SourceHanSerifCN-SemiBold | Rất đậm — hợp TIÊU ĐỀ/keyword to |
| 103 | `SourceHanSerifTW_Bold` | SourceHanSerifTW-Bold | Rất đậm — hợp TIÊU ĐỀ/keyword to |
| 104 | `SourceHanSerifTW_Light` | SourceHanSerifTW-Light | Mảnh — chữ trang trí/nền |
| 105 | `SourceHanSerifTW_Medium` | SourceHanSerifTW-Medium | Đậm vừa — tiêu đề phụ |
| 106 | `SourceHanSerifTW_Regular` | SourceHanSerifTW-Regular | Thường — thân chữ/phụ đề |
| 107 | `SourceHanSerifTW_SemiBold` | SourceHanSerifTW-SemiBold | Rất đậm — hợp TIÊU ĐỀ/keyword to |
| 108 | `Staatliches_Regular` | Staatliches-Regular | Thường — thân chữ/phụ đề |
| 109 | `Sunset` | Sunset | Thường — thân chữ/phụ đề |
| 110 | `Thrive` | Thrive | Thường — thân chữ/phụ đề |
| 111 | `Thunder` | Thunder | Thường — thân chữ/phụ đề |
| 112 | `Tronica` | Tronica | Thường — thân chữ/phụ đề |
| 113 | `Vintage` | Vintage | Thường — thân chữ/phụ đề |
| 114 | `ZY_Dexterous` | ZY Dexterous | Thường — thân chữ/phụ đề |
| 115 | `ZY_Earnest` | ZY Earnest | Thường — thân chữ/phụ đề |
| 116 | `ZY_Vigorous` | ZY Vigorous | Thường — thân chữ/phụ đề |
| 117 | `ZY_Vigorous_Medium` | ZY Vigorous-Medium | Đậm vừa — tiêu đề phụ |
| 118 | `ZYLantastic` | ZYLantastic | Thường — thân chữ/phụ đề |
| 119 | `ZYLullaby` | ZYLullaby | Thường — thân chữ/phụ đề |
| 120 | `ZYSilhouette` | ZYSilhouette | Thường — thân chữ/phụ đề |
| 121 | `ZYWitty` | ZYWitty | Thường — thân chữ/phụ đề |
| 122 | `Zapfino` | Zapfino | Thường — thân chữ/phụ đề |
| 123 | `中秀体` | 中秀体 | Thường — thân chữ/phụ đề |
| 124 | `今宋体` | 今宋体 | Thường — thân chữ/phụ đề |
| 125 | `仓耳周珂正大榜书` | 仓耳周珂正大榜书 | Thường — thân chữ/phụ đề |
| 126 | `优设标题黑` | 优设标题黑 | Thường — thân chữ/phụ đề |
| 127 | `俊雅体` | 俊雅体 | Thường — thân chữ/phụ đề |
| 128 | `元气泡泡体` | 元气泡泡体 | Thường — thân chữ/phụ đề |
| 129 | `元瑶体` | 元瑶体 | Thường — thân chữ/phụ đề |
| 130 | `先锋体` | 先锋体 | Thường — thân chữ/phụ đề |
| 131 | `兰亭圆` | 兰亭圆 | Thường — thân chữ/phụ đề |
| 132 | `凌东齐伋体_combo` | 凌东齐伋体-combo | Thường — thân chữ/phụ đề |
| 133 | `凌东齐伋体_fallback` | 凌东齐伋体-fallback | Thường — thân chữ/phụ đề |
| 134 | `匹喏曹` | 匹喏曹 | Thường — thân chữ/phụ đề |
| 135 | `半梦体` | 半梦体 | Thường — thân chữ/phụ đề |
| 136 | `卡酷体` | 卡酷体 | Thường — thân chữ/phụ đề |
| 137 | `古典体` | 古典体 | Thường — thân chữ/phụ đề |
| 138 | `古印宋简` | 古印宋简 | Thường — thân chữ/phụ đề |
| 139 | `古雅体` | 古雅体 | Thường — thân chữ/phụ đề |
| 140 | `古风小楷` | 古风小楷 | Thường — thân chữ/phụ đề |
| 141 | `台北黑体_Light` | 台北黑体-Light | Mảnh — chữ trang trí/nền |
| 142 | `台北黑体_Regular` | 台北黑体-Regular | Thường — thân chữ/phụ đề |
| 143 | `后现代体` | 后现代体 | Thường — thân chữ/phụ đề |
| 144 | `喜悦体` | 喜悦体 | Thường — thân chữ/phụ đề |
| 145 | `嘉木体` | 嘉木体 | Thường — thân chữ/phụ đề |
| 146 | `圆体` | 圆体 | Thường — thân chữ/phụ đề |
| 147 | `基础像素` | 基础像素 | Thường — thân chữ/phụ đề |
| 148 | `墩墩体` | 墩墩体 | Thường — thân chữ/phụ đề |
| 149 | `大字报` | 大字报 | Thường — thân chữ/phụ đề |
| 150 | `大梁体` | 大梁体 | Thường — thân chữ/phụ đề |
| 151 | `妙黑体` | 妙黑体 | Thường — thân chữ/phụ đề |
| 152 | `字制区喜脉体` | 字制区喜脉体 | Thường — thân chữ/phụ đề |
| 153 | `孤月体` | 孤月体 | Thường — thân chữ/phụ đề |
| 154 | `宋体` | 宋体 | Thường — thân chữ/phụ đề |
| 155 | `小薇体` | 小薇体 | Thường — thân chữ/phụ đề |
| 156 | `尔雅新大黑` | 尔雅新大黑 | Thường — thân chữ/phụ đề |
| 157 | `峰骨体` | 峰骨体 | Thường — thân chữ/phụ đề |
| 158 | `幼萱体` | 幼萱体 | Thường — thân chữ/phụ đề |
| 159 | `得意黑` | 得意黑 | Thường — thân chữ/phụ đề |
| 160 | `快乐体` | 快乐体 | Thường — thân chữ/phụ đề |
| 161 | `快速体` | 快速体 | Thường — thân chữ/phụ đề |
| 162 | `思源中宋` | 思源中宋 | Thường — thân chữ/phụ đề |
| 163 | `思源粗宋` | 思源粗宋 | Thường — thân chữ/phụ đề |
| 164 | `悠悠然` | 悠悠然 | Thường — thân chữ/phụ đề |
| 165 | `悦妍体` | 悦妍体 | Thường — thân chữ/phụ đề |
| 166 | `惊鸿体` | 惊鸿体 | Thường — thân chữ/phụ đề |
| 167 | `抖音美好体` | 抖音美好体 | Thường — thân chữ/phụ đề |
| 168 | `招牌体` | 招牌体 | Thường — thân chữ/phụ đề |
| 169 | `挥墨体` | 挥墨体 | Thường — thân chữ/phụ đề |
| 170 | `文研体` | 文研体 | Thường — thân chữ/phụ đề |
| 171 | `文艺繁体` | 文艺繁体 | Thường — thân chữ/phụ đề |
| 172 | `文轩体` | 文轩体 | Thường — thân chữ/phụ đề |
| 173 | `文雅体` | 文雅体 | Thường — thân chữ/phụ đề |
| 174 | `新青年体` | 新青年体 | Thường — thân chữ/phụ đề |
| 175 | `方糖体` | 方糖体 | Thường — thân chữ/phụ đề |
| 176 | `无界黑` | 无界黑 | Thường — thân chữ/phụ đề |
| 177 | `日式标题` | 日式标题 | Thường — thân chữ/phụ đề |
| 178 | `星光体` | 星光体 | Thường — thân chữ/phụ đề |
| 179 | `有猫在` | 有猫在 | Thường — thân chữ/phụ đề |
| 180 | `李李体` | 李李体 | Thường — thân chữ/phụ đề |
| 181 | `极简拼音` | 极简拼音 | Thường — thân chữ/phụ đề |
| 182 | `梅雨煎茶` | 梅雨煎茶 | Thường — thân chữ/phụ đề |
| 183 | `梦桃体` | 梦桃体 | Thường — thân chữ/phụ đề |
| 184 | `楚辰体` | 楚辰体 | Thường — thân chữ/phụ đề |
| 185 | `欣然体` | 欣然体 | Thường — thân chữ/phụ đề |
| 186 | `毡笔体` | 毡笔体 | Thường — thân chữ/phụ đề |
| 187 | `汇文明朝体` | 汇文明朝体 | Thường — thân chữ/phụ đề |
| 188 | `汉仪英雄体` | 汉仪英雄体 | Thường — thân chữ/phụ đề |
| 189 | `江户招牌` | 江户招牌 | Thường — thân chữ/phụ đề |
| 190 | `江湖体` | 江湖体 | Thường — thân chữ/phụ đề |
| 191 | `油漆体` | 油漆体 | Thường — thân chữ/phụ đề |
| 192 | `海岛森林_全字符` | 海岛森林-全字符 | Thường — thân chữ/phụ đề |
| 193 | `清刻本悦` | 清刻本悦 | Thường — thân chữ/phụ đề |
| 194 | `温柔体` | 温柔体 | Thường — thân chữ/phụ đề |
| 195 | `港风繁体` | 港风繁体 | Thường — thân chữ/phụ đề |
| 196 | `游园体` | 游园体 | Thường — thân chữ/phụ đề |
| 197 | `漫语体` | 漫语体 | Thường — thân chữ/phụ đề |
| 198 | `点宋体` | 点宋体 | Thường — thân chữ/phụ đề |
| 199 | `烈金体` | 烈金体 | Thường — thân chữ/phụ đề |
| 200 | `烟波宋` | 烟波宋 | Thường — thân chữ/phụ đề |
| 201 | `特黑体` | 特黑体 | Thường — thân chữ/phụ đề |
| 202 | `琉璃宋` | 琉璃宋 | Thường — thân chữ/phụ đề |
| 203 | `瑞意宋` | 瑞意宋 | Thường — thân chữ/phụ đề |
| 204 | `瑶蝶体` | 瑶蝶体 | Thường — thân chữ/phụ đề |
| 205 | `甜甜圈` | 甜甜圈 | Thường — thân chữ/phụ đề |
| 206 | `目光体` | 目光体 | Thường — thân chữ/phụ đề |
| 207 | `真言体` | 真言体 | Thường — thân chữ/phụ đề |
| 208 | `研宋体` | 研宋体 | Thường — thân chữ/phụ đề |
| 209 | `禅影体` | 禅影体 | Thường — thân chữ/phụ đề |
| 210 | `童趣体` | 童趣体 | Thường — thân chữ/phụ đề |
| 211 | `简中圆` | 简中圆 | Thường — thân chữ/phụ đề |
| 212 | `糯米团` | 糯米团 | Thường — thân chữ/phụ đề |
| 213 | `纯真体` | 纯真体 | Thường — thân chữ/phụ đề |
| 214 | `细体` | 细体 | Thường — thân chữ/phụ đề |
| 215 | `经典雅黑` | 经典雅黑 | Thường — thân chữ/phụ đề |
| 216 | `综艺字` | 综艺字 | Thường — thân chữ/phụ đề |
| 217 | `美佳体` | 美佳体 | Thường — thân chữ/phụ đề |
| 218 | `聚珍体` | 聚珍体 | Thường — thân chữ/phụ đề |
| 219 | `芋圆体` | 芋圆体 | Thường — thân chữ/phụ đề |
| 220 | `若烟体` | 若烟体 | Thường — thân chữ/phụ đề |
| 221 | `荔枝体` | 荔枝体 | Thường — thân chữ/phụ đề |
| 222 | `萌趣体` | 萌趣体 | Thường — thân chữ/phụ đề |
| 223 | `蒹葭体` | 蒹葭体 | Thường — thân chữ/phụ đề |
| 224 | `薯条少年` | 薯条少年 | Thường — thân chữ/phụ đề |
| 225 | `蝉影隶书` | 蝉影隶书 | Thường — thân chữ/phụ đề |
| 226 | `装甲明朝` | 装甲明朝 | Thường — thân chữ/phụ đề |
| 227 | `谷秋体` | 谷秋体 | Thường — thân chữ/phụ đề |
| 228 | `超重要体` | 超重要体 | Thường — thân chữ/phụ đề |
| 229 | `轻吟体` | 轻吟体 | Thường — thân chữ/phụ đề |
| 230 | `追光体` | 追光体 | Thường — thân chữ/phụ đề |
| 231 | `逸致拼音` | 逸致拼音 | Thường — thân chữ/phụ đề |
| 232 | `金陵体` | 金陵体 | Thường — thân chữ/phụ đề |
| 233 | `锦瑟体` | 锦瑟体 | Thường — thân chữ/phụ đề |
| 234 | `雁兰体` | 雁兰体 | Thường — thân chữ/phụ đề |
| 235 | `雅酷黑简` | 雅酷黑简 | Thường — thân chữ/phụ đề |
| 236 | `霸燃手书` | 霸燃手书 | Thường — thân chữ/phụ đề |
| 237 | `青松体` | 青松体 | Thường — thân chữ/phụ đề |
| 238 | `风雅宋` | 风雅宋 | Thường — thân chữ/phụ đề |
| 239 | `飒爽手写` | 飒爽手写 | Thường — thân chữ/phụ đề |
| 240 | `飞扬行书` | 飞扬行书 | Thường — thân chữ/phụ đề |
| 241 | `飞驰体` | 飞驰体 | Thường — thân chữ/phụ đề |
| 242 | `高字标志黑` | 高字标志黑 | Thường — thân chữ/phụ đề |
| 243 | `高字湘黑体` | 高字湘黑体 | Thường — thân chữ/phụ đề |
| 244 | `黄令东齐伋复刻体` | 黄令东齐伋复刻体 | Thường — thân chữ/phụ đề |
| 245 | `黄金时代` | 黄金时代 | Thường — thân chữ/phụ đề |
| 246 | `黑糖体` | 黑糖体 | Thường — thân chữ/phụ đề |
| 247 | `默陌手写` | 默陌手写 | Thường — thân chữ/phụ đề |
| 248 | `아기` | 아기 | Thường — thân chữ/phụ đề |
| 249 | `セリフ太字` | ｾﾘﾌ太字 | Thường — thân chữ/phụ đề |
| 250 | `一笔壹画加油体` | 一笔壹画加油体 | Thường — thân chữ/phụ đề |
| 251 | `一笔壹画潮黑体` | 一笔壹画潮黑体 | Thường — thân chữ/phụ đề |
| 252 | `三极力量体简_粗` | 三极力量体简-粗 | Thường — thân chữ/phụ đề |
| 253 | `三极妙漫体` | 三极妙漫体 | Thường — thân chữ/phụ đề |
| 254 | `三极宋黑体超粗` | 三极宋黑体超粗 | Thường — thân chữ/phụ đề |
| 255 | `三极拙墨体` | 三极拙墨体 | Thường — thân chữ/phụ đề |
| 256 | `三极极宋超粗` | 三极极宋超粗 | Thường — thân chữ/phụ đề |
| 257 | `三极榜楷简体` | 三极榜楷简体 | Thường — thân chữ/phụ đề |
| 258 | `三极欢乐体` | 三极欢乐体 | Thường — thân chữ/phụ đề |
| 259 | `三极正雅黑粗` | 三极正雅黑粗 | Thường — thân chữ/phụ đề |
| 260 | `三极气泡体` | 三极气泡体 | Thường — thân chữ/phụ đề |
| 261 | `三极泼墨体` | 三极泼墨体 | Thường — thân chữ/phụ đề |
| 262 | `三极浓密仙粗` | 三极浓密仙粗 | Thường — thân chữ/phụ đề |
| 263 | `三极湘乡体` | 三极湘乡体 | Thường — thân chữ/phụ đề |
| 264 | `三极萌喵简体` | 三极萌喵简体 | Thường — thân chữ/phụ đề |
| 265 | `三极行楷简体_粗` | 三极行楷简体-粗 | Thường — thân chữ/phụ đề |
| 266 | `三极黑宋体中粗` | 三极黑宋体中粗 | Thường — thân chữ/phụ đề |
| 267 | `云书法三行魏碑体` | 云书法三行魏碑体 | Thường — thân chữ/phụ đề |
| 268 | `云书法手书建刚静心楷简` | 云书法手书建刚静心楷简 | Thường — thân chữ/phụ đề |
| 269 | `云书法生如夏花简` | 云书法生如夏花简 | Thường — thân chữ/phụ đề |
| 270 | `云书法罗西硬笔楷书体` | 云书法罗西硬笔楷书体 | Thường — thân chữ/phụ đề |
| 271 | `亦然体` | 亦然体 | Thường — thân chữ/phụ đề |
| 272 | `仓耳丝柔体` | 仓耳丝柔体 | Thường — thân chữ/phụ đề |
| 273 | `仓耳体` | 仓耳体 | Thường — thân chữ/phụ đề |
| 274 | `仓耳力士` | 仓耳力士 | Thường — thân chữ/phụ đề |
| 275 | `凌丝体` | 凌丝体 | Thường — thân chữ/phụ đề |
| 276 | `利飞体` | 利飞体 | Thường — thân chữ/phụ đề |
| 277 | `剪映新年体` | 剪映新年体 | Thường — thân chữ/phụ đề |
| 278 | `励字大黑简繁` | 励字大黑简繁 | Thường — thân chữ/phụ đề |
| 279 | `励字姚体简繁` | 励字姚体简繁 | Thường — thân chữ/phụ đề |
| 280 | `励字志向黑简_特粗` | 励字志向黑简 特粗 | Thường — thân chữ/phụ đề |
| 281 | `励字憨憨简` | 励字憨憨简 | Thường — thân chữ/phụ đề |
| 282 | `励字敲可爱简_中粗` | 励字敲可爱简 中粗 | Thường — thân chữ/phụ đề |
| 283 | `励字行楷简繁` | 励字行楷简繁 | Thường — thân chữ/phụ đề |
| 284 | `励字趣石简` | 励字趣石简 | Thường — thân chữ/phụ đề |
| 285 | `励字造梦简_特粗` | 励字造梦简 特粗 | Thường — thân chữ/phụ đề |
| 286 | `励字隶书简繁` | 励字隶书简繁 | Thường — thân chữ/phụ đề |
| 287 | `华书体` | 华书体 | Thường — thân chữ/phụ đề |
| 288 | `听露体` | 听露体 | Thường — thân chữ/phụ đề |
| 289 | `字由爱驾公路体` | 字由爱驾公路体 | Thường — thân chữ/phụ đề |
| 290 | `字语古兰体` | 字语古兰体 | Thường — thân chữ/phụ đề |
| 291 | `字语咏宋体` | 字语咏宋体 | Thường — thân chữ/phụ đề |
| 292 | `字语咏楷体` | 字语咏楷体 | Thường — thân chữ/phụ đề |
| 293 | `字语嘟嘟体` | 字语嘟嘟体 | Thường — thân chữ/phụ đề |
| 294 | `字语文韵体` | 字语文韵体 | Thường — thân chữ/phụ đề |
| 295 | `字语软糖体` | 字语软糖体 | Thường — thân chữ/phụ đề |
| 296 | `宜宋` | 宜宋 | Thường — thân chữ/phụ đề |
| 297 | `小可爱体` | 小可爱体 | Thường — thân chữ/phụ đề |
| 298 | `少年南波万` | 少年南波万 | Thường — thân chữ/phụ đề |
| 299 | `山雁体` | 山雁体 | Thường — thân chữ/phụ đề |
| 300 | `幽梦体` | 幽梦体 | Thường — thân chữ/phụ đề |
| 301 | `归雁体` | 归雁体 | Thường — thân chữ/phụ đề |
| 302 | `景曜体` | 景曜体 | Thường — thân chữ/phụ đề |
| 303 | `月亮供电不足` | 月亮供电不足 | Thường — thân chữ/phụ đề |
| 304 | `未光体` | 未光体 | Thường — thân chữ/phụ đề |
| 305 | `毛体行楷` | 毛体行楷 | Thường — thân chữ/phụ đề |
| 306 | `汉字之美棒棒糖粗简` | 汉字之美棒棒糖粗简 | Thường — thân chữ/phụ đề |
| 307 | `汉字之美郝刚牡丹体简` | 汉字之美郝刚牡丹体简 | Thường — thân chữ/phụ đề |
| 308 | `点字佳楷` | 点字佳楷 | Thường — thân chữ/phụ đề |
| 309 | `点字奇巧` | 点字奇巧 | Thường — thân chữ/phụ đề |
| 310 | `点字小隶书` | 点字小隶书 | Thường — thân chữ/phụ đề |
| 311 | `点字玄真宋` | 点字玄真宋 | Thường — thân chữ/phụ đề |
| 312 | `点字艺圆` | 点字艺圆 | Thường — thân chữ/phụ đề |
| 313 | `点字青花楷` | 点字青花楷 | Thường — thân chữ/phụ đề |
| 314 | `点字青花隶` | 点字青花隶 | Thường — thân chữ/phụ đề |
| 315 | `烟客体` | 烟客体 | Thường — thân chữ/phụ đề |
| 316 | `爱你是无解命题` | 爱你是无解命题 | Thường — thân chữ/phụ đề |
| 317 | `爱民小楷` | 爱民小楷 | Thường — thân chữ/phụ đề |
| 318 | `玄鸟体` | 玄鸟体 | Thường — thân chữ/phụ đề |
| 319 | `知新体` | 知新体 | Thường — thân chữ/phụ đề |
| 320 | `竹言体` | 竹言体 | Thường — thân chữ/phụ đề |
| 321 | `花锦体` | 花锦体 | Thường — thân chữ/phụ đề |
| 322 | `莫雪体` | 莫雪体 | Thường — thân chữ/phụ đề |
| 323 | `造字侠今朝醉简` | 造字侠今朝醉简 | Thường — thân chữ/phụ đề |
| 324 | `造字侠寻味江湖简` | 造字侠寻味江湖简 | Thường — thân chữ/phụ đề |
| 325 | `造字侠陈坤风行简繁` | 造字侠陈坤风行简繁 | Thường — thân chữ/phụ đề |
| 326 | `阳华体` | 阳华体 | Thường — thân chữ/phụ đề |
| 327 | `阳煦体` | 阳煦体 | Thường — thân chữ/phụ đề |
| 328 | `雅月体` | 雅月体 | Thường — thân chữ/phụ đề |
| 329 | `青鸟华光书宋2` | 青鸟华光书宋2 | Thường — thân chữ/phụ đề |
| 330 | `青鸟华光仿宋2` | 青鸟华光仿宋2 | Thường — thân chữ/phụ đề |
| 331 | `青鸟华光细黑` | 青鸟华光细黑 | Thường — thân chữ/phụ đề |
| 332 | `青鸟华光美黑` | 青鸟华光美黑 | Thường — thân chữ/phụ đề |
| 333 | `青鸟华光黑变` | 青鸟华光黑变 | Thường — thân chữ/phụ đề |
| 334 | `高字标志圆` | 高字标志圆 | Thường — thân chữ/phụ đề |
| 335 | `鱼太闲躺平体` | 鱼太闲躺平体 | Thường — thân chữ/phụ đề |

## B3. ÂM THANH — Voice filter & Voice changer (XỬ LÝ GIỌNG)

> ⚠️ Đây là hiệu ứng **xử lý giọng nói** (vọng âm, méo, đổi chất giọng), KHÔNG phải SFX hay nhạc nền. **Kho KHÔNG có sẵn SFX (whoosh/ding/boom) và nhạc nền** — muốn dùng phải đưa **file audio** rồi gắn qua `add_audio(audio_url=...)`.

### B3a. CapCut Voice filters (lọc âm — 15)
**Áp dụng:** xử lý track audio/giọng.

> Tổng **15** mục.

| # | key (API) | Mô tả & khi nào dùng |
|---|---|---|
| 1 | `Big_House` | Vang vọng phòng lớn/sảnh. |
| 2 | `Low` | Giọng thấp/trầm. |
| 3 | `Energetic` | Giọng phấn khích, bật năng lượng. |
| 4 | `High` | Giọng CAO the thé — hài hước. |
| 5 | `Low_Battery` | Méo rè như sắp hết pin — hài. |
| 6 | `Tremble` | Run rẩy, rung giọng — sợ hãi/hồi hộp. |
| 7 | `Electronic` | Điện tử robot. |
| 8 | `Sweet` | Giọng ngọt ngào, dễ thương. |
| 9 | `Vinyl` | Đĩa than cũ, ấm + nhiễu lo-fi — tông hoài niệm. |
| 10 | `Mic_Hog` | Ồm như giành mic karaoke. |
| 11 | `LoFi` | Lo-fi trầm đục, chill — nền thư giãn. |
| 12 | `Megaphone` | Loa phóng thanh méo tiếng — hô hào, châm biếm, kiểu 'thông báo'. |
| 13 | `Echo` | Vọng âm vang — như trong hang/phòng lớn. Nhấn câu kết, kịch tính, hù dọa. |
| 14 | `Synth` | Tổng hợp điện tử — tương lai/công nghệ. |
| 15 | `Deep` | Giọng TRẦM hơn — nghiêm trọng hoặc hài. |

### B3b. CapCut Voice characters (đổi giọng nhân vật — 13)

> Tổng **13** mục.

| # | key (API) | Mô tả & khi nào dùng |
|---|---|---|
| 1 | `Fussy_male` | Giọng nam khó tính/càu nhàu. |
| 2 | `Bestie` | Giọng bạn thân trẻ trung. |
| 3 | `Queen` | Giọng nữ hoàng kiêu sa. |
| 4 | `Squirrel` | Giọng sóc nhanh cao — hài. |
| 5 | `Distorted` | Méo loạn — kinh dị/hỗn loạn. |
| 6 | `Chipmunk` | Giọng sóc chít cao the thé — hài hước. |
| 7 | `Trickster` | Giọng tinh nghịch/lừa lọc. |
| 8 | `Elf` | Giọng yêu tinh Giáng sinh. |
| 9 | `Elfy` | Giọng yêu tinh. |
| 10 | `Santa` | Giọng ông già Noel trầm ấm — dịp lễ. |
| 11 | `Jessie` | Giọng nhân vật nữ. |
| 12 | `Good_Guy` | Giọng 'người tốt' ấm áp. |
| 13 | `Robot` | Giọng NGƯỜI MÁY — công nghệ/AI, hài. |

### B3c. CapCut Speech-to-song (hát hoá lời nói)

> Tổng **1** mục.

| # | key (API) | Mô tả & khi nào dùng |
|---|---|---|
| 1 | `Folk` | Hát hoá lời nói theo điệu dân ca (speech-to-song). |

### B3d. (JianYing) Audio scene effect — 43 & Tone/voice — 57 (tên tiếng Trung)

> Chỉ dùng khi is_capcut_env=false. Liệt kê key để đầy đủ:

**Audio scene (JianYing):** `_8bit`, `低保真`, `合成器`, `回音`, `扩音器`, `水下`, `没电了`, `环绕音`, `电音`, `颤音`, `麦霸`, `黑胶`, `_3d环绕音`, `Autotune`, `下雨`, `乡村大喇叭`, `人声增强`, `低音增强`, `停车场`, `冰川之下`, `刮风`, `噪音混响`, `地狱`, `复古收音机`, `失真电子`, `对讲机`, `房间`, `捂嘴`, `教堂`, `教室`, `机器人2`, `沙漠`, `派对`, `深海回声`, `电话`, `留声机`, `百老汇`, `空灵感`, `空谷回声`, `老式电话`, `言灵术`, `豪宅回声`, `迷幻电子`

**Tone/voice (JianYing):** `台湾小哥`, `圣诞精灵`, `圣诞老人`, `广告男声`, `港普男声`, `老婆婆`, `解说小帅`, `大叔`, `女生`, `怪物`, `机器人`, `男生`, `花栗鼠`, `萝莉`, `TVB女声`, `东厂公公`, `云龙哥`, `侠客`, `做作夹子音`, `八戒`, `军事解说`, `动漫小新`, `动漫海绵`, `咆哮哥`, `商务殷语`, `四郎`, `太白`, `如来佛祖`, `姜饼人`, `容嬷嬷`, `小孩`, `强势妹`, `快板`, `恐怖电影`, `悬疑解说`, `懒小羊`, `搞笑解说`, `文艺女声`, `樱桃丸子`, `樱花小哥`, `武则天`, `沉稳解说`, `温柔姐姐`, `熊二`, `猴哥`, `甜美悦悦`, `生活小妙招`, `电竞解说`, `电视广告`, `紫薇`, `舌尖解说`, `蜡笔小妮`, `语音助手`, `那姐`, `锤子哥`, `顾姐`, `黛玉`

## B5. Keyframe property — thuộc tính tạo chuyển động
**Áp dụng:** `add_video_keyframe(property_type="<key>", time, value)`

| # | key | Mô tả & khi nào dùng |
|---|---|---|
| 1 | `position_x` | Vị trí ngang [-1..1] — di chuyển trái/phải; dùng làm hiệu ứng trượt. |
| 2 | `position_y` | Vị trí dọc [-1..1] — lên/xuống. |
| 3 | `rotation` | Xoay ('45deg') — nghiêng/quay. |
| 4 | `scale_x` | Phóng ngang. |
| 5 | `scale_y` | Phóng dọc. |
| 6 | `uniform_scale` | Zoom đều — punch-in nhấn. |
| 7 | `alpha` | Độ mờ ('50%') — hiện/ẩn dần. |
| 8 | `saturation` | Bão hoà [-1..1] — rực/nhạt màu. |
| 9 | `contrast` | Tương phản [-1..1]. |
| 10 | `brightness` | Độ sáng [-1..1] — tối/sáng dần. |
| 11 | `volume` | Âm lượng. |


---
# PHẦN C — BỘ JIANYING (chỉ khi is_capcut_env=false)

Tên hiển thị tiếng Trung; liệt kê key cho đầy đủ (không mô tả từng cái).

**C1 Transition** (362): `_3D空间`, `上移`, `下移`, `中心旋转`, `云朵`, `倒影`, `冰雪结晶`, `冲鸭`, `分割`, `分割_II`, `分割_III`, `分割_IV`, `前后对比_II`, `动漫云朵`, `动漫漩涡`, `动漫火焰`, `动漫闪电`, `压缩`, `叠加`, `叠化`, `右移`, `向上`, `向上擦除`, `向下`, `向下擦除`, `向下流动`, `向右`, `向右上`, `向右下`, `向右拉伸`, `向右擦除`, `向右流动`, `向左`, `向左上`, `向左下`, `向左拉伸`, `向左擦除`, `吸入`, `回忆下滑`, `圆形分割_II`, `圆形扫描`, `圆形遮罩`, `圆形遮罩_II`, `复古放映`, `岁月的痕迹`, `左下角_II`, `左移`, `开幕`, `弹幕转场`, `弹跳`, `打板转场_I`, `打板转场_II`, `抖动`, `抖动_II`, `抠像旋转`, `拉伸`, `拉伸_II`, `拉远`, `拍摄器`, `推近`, `撕纸拉屏`, `放射`, `故障`, `斜向分割`, `星星`, `星星_II`, `模糊`, `横向分割`, `横向拉幕`, `横线`, `气泡转场`, `水波卷动`, `水波向右`, `水波向左`, `泛光`, `泛白`, `波点向右`, `渐变擦除`, `滑动`, `漩涡`, `爱心`, `爱心_II`, `爱心上升`, `电视故障_I`, `电视故障_II`, `画笔擦除`, `白光快闪`, `白色墨花`, `白色烟雾`, `百叶窗`, `眨眼`, `矩形分割`, `窗格`, `立方体`, `竖向分割`, `竖向拉幕`, `竖向模糊`, `竖向模糊_II`, `竖线`, `箭头向右`, `粒子`, `翻篇`, `翻页`, `色差逆时针`, `色差顺时针`, `色彩溶解`, `色彩溶解_II`, `色彩溶解_III`, `蓝色线条`, `逆时针旋转`, `逆时针旋转_II`, `镜像翻转`, `闪白`, `闪白_II`, `闪黑`, `雪花故障`, `雾化`, `震动`, `顺时针旋转`, `顺时针旋转_II`, `频闪`, `风车`, `马赛克`, `黑色块`, `黑色烟雾`, `万花筒`, `三屏放大`, `三屏滑入`, `三屏闪切`, `下滑`, `云朵_II`, `亮点模糊`, `便利贴`, `信号故障`, `信号故障_II`, `倾斜拉伸`, `倾斜模糊`, `像素冲屏`, `光束`, `全息投影`, `六边形变焦`, `冲屏扭曲`, `几何分割`, `分屏下滑`, `前后对比`, `剧烈摇晃`, `卡片弹出`, `可爱爆炸`, `吃掉`, `后台切换`, `向上波动`, `向下抖动`, `向下拖拽`, `向左拉屏`, `向左波动`, `喜欢`, `四屏转换`, `回忆`, `回忆_II`, `回忆拉屏`, `回忆拉屏_II`, `圆形分割`, `圣诞树`, `复古叠影`, `复古放映_II`, `复古漏光`, `复古漏光_II`, `复古胶片`, `多层环形`, `多屏定格`, `大圆盘`, `射灯`, `小喇叭`, `小恶魔`, `幻影`, `幻觉`, `开心`, `弹出`, `弹动发光`, `彩色像素`, `微抖动`, `心形叠化`, `快速缩放`, `快门`, `扫光`, `扭曲溶解`, `扭转弹动`, `抖动放大`, `抖动缩小`, `抖动缩小__II`, `抽象前景`, `抽象前景_II`, `拉开`, `拉框入屏`, `拍摄器_II`, `拍摄器_III`, `推近_II`, `推远_II`, `摄像机`, `摇晃描边`, `摇晃震动`, `摇镜`, `撕纸`, `撕纸掉落`, `收缩抖动`, `放大左移`, `放大镜`, `故障模糊`, `数字矩阵`, `斜向模糊`, `斜向闪光`, `斜线翻页`, `新篇章`, `新篇章_II`, `方形分割`, `方形模糊`, `方形模糊_II`, `旋焦`, `旋转圆球`, `旋转圆盘`, `旋转圆盘_II`, `旋转快门`, `旋转拨盘`, `旋转模糊`, `旋转穿越`, `旋转纵深`, `旋转翻页`, `旋转震动`, `无限穿越_I`, `无限穿越_II`, `旧胶片`, `旧胶片_II`, `时光穿梭`, `星光`, `星光叠化`, `星星_III`, `星星吸入`, `星星模糊`, `春日光斑`, `暧昧光晕`, `曝光拉丝`, `曝光摇镜`, `未来光谱`, `未来光谱II`, `条形模糊`, `模糊放大`, `模糊缩小`, `横条挤压`, `横移模糊`, `水墨`, `水滴`, `水滴_II`, `水滴_III`, `汇聚`, `泡泡模糊`, `波光粼粼`, `波动`, `波动_II`, `波动故障`, `流光`, `涂鸦放大`, `溶解推进`, `滑动弹出`, `滑动放大`, `滑块拼贴`, `漩涡扭曲`, `炫光`, `炫光_II`, `炫光_III`, `炫光弹动`, `炫光扫描`, `炸弹`, `烟雾弹`, `热成像`, `燃烧`, `燃烧_II`, `燃烧_III`, `爆米花`, `爆闪`, `爆闪_II`, `爱心冲击`, `爱心模糊`, `爱心气球`, `环形色散`, `玻璃破碎`, `玻璃破碎_II`, `珠光模糊`, `生气`, `电光`, `电光_II`, `百叶窗_II`, `相片切换`, `相片拼贴`, `空间弹动`, `空间弹动_II`, `空间弹动_III`, `空间弹动_IV`, `空间旋转`, `空间旋转_II`, `空间旋转_III`, `空间翻转`, `空间翻转_II`, `空间跳跃`, `穿越`, `穿越_II`, `穿越_III`, `立体翻转`, `立体翻页`, `立体翻页_II`, `竖向拉伸`, `竖移模糊`, `粉色反转片`, `纸团`, `翻转冲屏`, `翻页_II`, `聚光灯`, `胶片定格`, `胶片擦除`, `胶片融化`, `胶片闪光`, `色块故障`, `色差故障`, `色彩溶解_IV`, `色彩溶解_V`, `色散晃镜`, `色散闪烁`, `色散闪烁_II`, `荧光爆闪`, `菱格翻转`, `蓝光扫描`, `蓝色反转片`, `融化`, `融化_II`, `负片下滑`, `超赞`, `透镜故障`, `重叠上滑`, `金色光斑`, `钱兔无量`, `长曝光`, `闪光灯`, `闪光灯_II`, `闪光灯_III`, `闪动光斑`, `闪动光斑_II`, `闪回`, `闪屏故障`, `闪黑_II`, `闹钟`, `雪雾`, `震动_II`, `震动缩小`, `霓虹闪光`, `霓虹闪光_II`, `飘雪`, `飘雪_II`, `马赛克_II`, `鱼眼`, `鱼眼_II`, `鱼眼_III`, `黑白摇镜`, `黑色反转片`

**C2 Scene** (912): `_1998`, `_70s`, `_90s画质`, `DV录制框`, `DV界面`, `I_Lose_You`, `I_Love_You`, `JVC`, `List边框`, `MV封面`, `New_Year`, `PS边框`, `RGB描边`, `VCR`, `X_Signal`, `X开幕`, `betamax`, `emoji钻石`, `ins界面`, `ins风放大镜`, `kirakira`, `ktv灯光`, `ktv灯光_II`, `windows弹窗关闭`, `windows弹窗打开`, `丁达尔光线`, `万圣emoji`, `万圣夜`, `三屏`, `三格漫画`, `下雨`, `不对劲`, `不规则黑框`, `两屏`, `中枪了`, `乌鸦飞过`, `九屏`, `九屏跑马灯`, `亮片`, `人鱼滤镜`, `仙女变身`, `仙女变身_II`, `仙女棒`, `仙尘闪闪`, `低像素`, `低像素_II`, `倒计时_II`, `像素画`, `像素纹理`, `光斑虚化`, `光斑飘落`, `光晕`, `光晕_II`, `全剧终`, `六屏`, `关月亮`, `冰冷实验室`, `冰霜`, `冰霜_II`, `冲击波`, `冲刺`, `冲刺_II`, `冲刺_III`, `冲屏闪粉`, `凄凉`, `几何图形`, `刀光剑影`, `分屏开幕`, `初雪_I`, `加载甜蜜`, `动感模糊`, `动感荧光`, `动感蓝带`, `单色涂鸦`, `南瓜光斑`, `南瓜笑脸`, `卷动`, `原相机`, `友友商店`, `反转片_I`, `发光`, `取景框`, `取景框_II`, `变形了`, `变彩色`, `变清晰`, `变清晰_II`, `变焦推镜`, `变秋天`, `变黑白`, `告白氛围`, `咔嚓`, `哈哈弹幕`, `哈苏胶片`, `唱片`, `唱片封面`, `啊啊啊啊`, `噪点`, `四屏`, `回弹摇摆`, `回忆文件夹`, `回忆胶片`, `圆形虚线放大镜`, `圣诞光斑`, `圣诞星光`, `地狱使者`, `基础黑框`, `塑料封面`, `塑料封面_II`, `塑料封面III`, `复古DV`, `复古DV_II`, `复古DV_III`, `复古DV_IV`, `复古发光`, `复古多格`, `复古弹窗_I`, `复古弹窗_II`, `复古漫画`, `复古甜心`, `复古碎钻`, `复古蓝调`, `夏日冰块`, `夏日泡泡_I`, `夕阳`, `夕阳_II`, `夕阳_III`, `夜蝶`, `夜视框`, `大雪`, `大雪纷飞`, `天使光`, `天使降临`, `失焦`, `夸夸弹幕`, `夺冠`, `孔明灯`, `孔明灯_II`, `字幕投影`, `字幕投影_II`, `字幕投影_III`, `字幕投影_IV`, `定格闪烁`, `小剧场`, `小动物`, `小花花`, `少女心`, `少女心事`, `少女星闪`, `左右摇晃`, `布拉格`, `幻彩文字`, `幻影`, `幻影_II`, `幻术摇摆`, `幻觉`, `广角`, `庆祝彩带`, `开幕`, `开幕__II`, `强锐化`, `录像带`, `录像带_II`, `录像带_III`, `录制框`, `录制边框`, `录制边框_II`, `录制边框_III`, `录制边框_IIII`, `彩信`, `彩噪画质`, `彩带`, `彩色描边`, `彩色漫画`, `彩色负片`, `彩虹光`, `彩虹光_II`, `彩虹光晕`, `彩虹射线`, `彩虹幻影`, `彩虹气泡`, `彩虹爱心`, `彩钻`, `心河`, `心跳`, `心跳黑框`, `必杀技`, `必杀技_II`, `怀旧边框`, `怀旧边框_II`, `怦然心动`, `恐怖故事`, `恐怖故事_II`, `恐怖故事_III`, `恐怖综艺`, `恶灵冲屏`, `愛`, `我酸了`, `手帐边框`, `手电筒`, `手绘拍摄器`, `手绘边框_II`, `扫描光条`, `抖动`, `折痕`, `折痕_II`, `折痕_III`, `折痕_IV`, `折痕_V`, `报纸_今日热门`, `摇摆`, `摇摆_II`, `撒星星`, `撒星星_II`, `撕纸涂鸦边框`, `播放器`, `播放器_II`, `擦拭开幕`, `放大镜`, `放映机`, `放映机卡顿`, `放映机抖动`, `放映滚动`, `故障`, `故障_II`, `故障读条`, `文字闪动`, `斑斓`, `斜向模糊`, `方形取景器`, `方形开幕`, `旋转方块`, `日式DV`, `日文字幕`, `日落灯`, `时光碎片`, `时间停止`, `星光`, `星光_II`, `星光绽放`, `星光闪耀`, `星光闪闪`, `星夜`, `星星冲屏`, `星星坠落`, `星星投影`, `星星灯`, `星星闪烁`, `星星闪烁_II`, `星星闪烁_III`, `星月童话`, `星河`, `星河_II`, `星火`, `星火_II`, `星火炸开`, `星移`, `星空`, `星辰`, `星辰_I`, `星辰_II`, `星辰_III`, `星雨`, `春日樱花`, `春日边框`, `晴天光线`, `暗夜`, `暗夜归来`, `暗夜彩虹`, `暗夜彩虹_II`, `暗夜彩虹III`, `暗夜精灵`, `暗夜蝙蝠`, `暗角`, `暗黑剪影`, `暗黑噪点`, `暗黑蝙蝠`, `曝光`, `曝光降低`, `月亮投影`, `月亮闪闪`, `月光闪闪`, `望远镜`, `未来主义`, `杂志`, `树影`, `树影_II`, `格纹纸质`, `格纹纸质_II`, `梦境`, `梦境_II`, `梦境_III`, `梦境_IV`, `梦幻雪花`, `梦蝶`, `梦魇`, `梵高背景`, `模糊`, `模糊开幕`, `模糊星光`, `模糊星光_II`, `模糊闭幕`, `横向闭幕`, `横纹故障`, `横纹故障_II`, `樱花朵朵`, `橘色负片`, `欧根纱`, `毛刺`, `毛玻璃`, `水墨晕染`, `水彩晕染`, `水波纹`, `水波纹投影`, `水滴模糊`, `水滴滚动`, `油画纹理`, `泡泡`, `泡泡变焦`, `波纹扭曲`, `波纹色差`, `流动烟雾`, `流星雨`, `浓雾`, `浪漫氛围`, `浪漫氛围_II`, `涂鸦切割边框`, `淡彩边框`, `清新绿格子`, `渐显开幕`, `渐渐放大`, `渐隐闭幕`, `温柔细闪`, `游戏界面`, `满屏问号`, `漏光噪点`, `火光`, `火光刷过`, `火光包围`, `火光翻滚`, `火光蔓延`, `灵魂出窍`, `炫彩`, `炫彩_II`, `烟花`, `烟花_II`, `烟花_III`, `烟雾`, `烟雾炸开`, `爆炸`, `爱心Kira`, `爱心bling`, `爱心光斑`, `爱心光斑_II`, `爱心光波`, `爱心啵啵`, `爱心射线`, `爱心投影`, `爱心方块`, `爱心暗角`, `爱心气泡`, `爱心泡泡`, `爱心爆炸`, `爱心缤纷`, `爱心缤纷_II`, `爱心跳动`, `爱心跳动_II`, `爱心闪烁`, `牛皮纸关闭`, `牛皮纸打开`, `牛皮纸边框_I`, `牛皮纸边框_II`, `玫瑰花瓣`, `玻璃破碎`, `甜心投影`, `生日快乐`, `电光包围`, `电光漩涡`, `电子屏`, `电影刮花`, `电影感`, `电影感画幅`, `电脑桌面`, `电视关机`, `电视开机`, `电视彩虹屏`, `电视纹理`, `画展边框`, `白噪点边框`, `白胶边框`, `白色描边`, `白色渐显`, `白色爱心`, `白色线框`, `白色边框`, `百叶窗`, `百叶窗_II`, `监控`, `盗梦空间`, `盛世美颜`, `相机网格`, `相纸`, `瞬间模糊`, `破冰`, `磨砂纹理`, `祝福环绕`, `秋日暖黄`, `空灵`, `窗格`, `窗格光`, `简约边框`, `箭头放大镜`, `粉红老电视`, `粉红芭比边框`, `粉色闪粉`, `粉黄渐变`, `粒子模糊`, `精灵闪粉`, `精细锐化`, `糖果纸`, `紫色波纹`, `紫色负片`, `紫雾`, `繁星点点`, `纵向开幕`, `纵向模糊`, `纸膜边框_I`, `纸膜边框_II`, `纸质撕边`, `纸质边框`, `纸质边框_II`, `细闪`, `细闪_II`, `细闪_III`, `美式`, `美式_II`, `美式_III`, `美式_IV`, `美式_V`, `美漫`, `羽毛`, `老照片`, `老照片_II`, `老照片_III`, `老电影`, `老电影_II`, `老电视卡顿`, `聚光灯`, `聚焦`, `胡言乱语`, `胶片`, `胶片_II`, `胶片_III`, `胶片_IV`, `胶片抖动`, `胶片显影`, `胶片框`, `胶片框_II`, `胶片框_III`, `胶片漏光`, `胶片漏光_II`, `胶片连拍`, `自然`, `自然_II`, `自然_III`, `自然_IV`, `自然_V`, `色差`, `色差开幕`, `色差放大`, `色差放射`, `色差故障`, `色差故障_II`, `色差星闪`, `色差默片`, `节日彩带`, `花火`, `花火_II`, `花瓣飘落`, `花瓣飞扬`, `荡漾_II`, `荡秋千`, `荧光扫描`, `荧光爱心`, `荧光线描`, `荧光绿`, `荧光蝙蝠`, `荧幕噪点`, `荧幕噪点_II`, `萤光`, `萤光飞舞`, `萤火`, `落叶`, `落樱`, `蒸汽波`, `蒸汽波投影`, `蒸汽波路灯`, `蒸汽腾腾`, `蓝光扫描`, `蓝线模糊`, `蓝色负片`, `蓝色闪电边框`, `虚化`, `蝙蝠Kira`, `蝴蝶`, `蝴蝶_II`, `蝴蝶光斑`, `蝶舞`, `表面模糊`, `裂开了`, `视频分割`, `视频界面`, `诡异分割`, `负片闪烁`, `赞赞赞`, `蹦迪光`, `蹦迪彩光`, `车窗`, `车窗影`, `轻微抖动`, `轻微放大`, `边缘glitch`, `边缘加色`, `边缘加色_II`, `边缘加色_III`, `边缘发光`, `边缘荧光`, `运动一夏`, `迪斯科`, `迷幻烟雾`, `迷离`, `迷雾`, `逆光对焦`, `选中框`, `邮票边框`, `金属背景`, `金片`, `金片_II`, `金片炸开`, `金粉`, `金粉_II`, `金粉_III`, `金粉撒落`, `金粉旋转`, `金粉聚拢`, `金粉闪闪`, `钻光`, `钻石碎片`, `镜像`, `镜头变焦`, `长虹玻璃`, `闪亮登场`, `闪亮登场_II`, `闪光灯_I`, `闪光震动`, `闪动`, `闪动光斑`, `闪屏`, `闪电`, `闪白`, `闪耀星光`, `闪闪`, `闪闪发光_II`, `闪黑`, `闪黑II`, `闭幕`, `闭幕_II`, `随机色块`, `随机色块_II`, `随机裁剪`, `隐形人`, `隔行扫描`, `雨滴晕开`, `雪窗`, `雪花`, `雪花冲屏`, `雪花开幕`, `雪花故障`, `雪花细闪`, `零点解锁`, `雾气`, `雾气_II`, `雾气光线`, `震动`, `霓虹投影`, `霓虹摇摆`, `霓虹灯`, `预警`, `颤抖`, `飘落花瓣`, `飘落闪粉`, `飘落闪粉_II`, `飘雪`, `飘雪_II`, `飞速计算`, `马赛克`, `高光瞬间`, `魅力光束`, `魔法`, `魔法变身`, `魔法边框`, `魔法边框_II`, `鱼眼`, `黄蓝星芒`, `黑白VHS`, `黑白三格`, `黑白漫画`, `黑白漫画_II`, `黑白线描`, `黑线故障`, `黑羽毛`, `黑羽毛_II`, `黑胶边框`, `黑色噪点`, `黑色老电视`, `Bling飘落`, `C300`, `IXUS`, `Ins描边`, `S形运镜`, `W830`, `一刀两断`, `丁达尔旋焦`, `丝印涂鸦`, `丝滑运镜`, `两屏分割`, `中轴旋转`, `云朵绵绵`, `五星好评`, `交叉震闪`, `低保真`, `侧移模糊`, `倒带`, `倒计时`, `假日闪闪_II`, `像素屏闪`, `像素扫描`, `像素拉伸_II`, `像素排序`, `像素故障`, `像素爱心`, `像素震闪`, `光线扫描`, `光线拖影`, `光谱扫描`, `兔兔碎闪`, `全息扫描`, `分屏漏光`, `动态侦测`, `动态格`, `动感光束`, `动感变焦`, `动感扫光`, `动感推镜`, `动感竖线`, `动感运镜`, `十字模糊`, `十字爆闪`, `单向移动`, `单彩渐变`, `单色填充`, `卡机`, `卡通渲染`, `发光HDR`, `取景器`, `变色狙击`, `变色闪光`, `变速推镜`, `变速推镜II`, `可爱涂鸦`, `吓到失魂`, `噪片映射`, `圆形分屏`, `圣诞日记`, `复古彩虹`, `复古拼贴`, `复古紫调`, `复古红调`, `复古连拍`, `复古闪闪`, `复古频闪`, `失焦CCD`, `失焦光斑`, `定格祝福`, `实况开幕`, `对焦DV`, `局部推镜`, `局部色彩`, `居中闪切`, `屏幕律动`, `幻动光斑`, `幻彩故障`, `幻影_I`, `弹动摇镜`, `弹动旋入`, `弹性闪动`, `彩光摇晃`, `彩光频闪`, `彩色像素`, `彩色流光_I`, `彩色流光_II`, `彩色流光_III`, `彩色火焰`, `彩色珠滴`, `彩色电光`, `彩色碎彩`, `彩色碎片`, `彩色碎片_II`, `彩色闪烁`, `彩虹光影`, `彩虹棱镜`, `彩虹泛光`, `彩虹闪屏`, `彩边频闪`, `微震闪黑`, `心跳_II`, `快速变焦`, `快闪运镜`, `恐怖涂鸦`, `慢门拖影`, `手写边框`, `扭动变焦`, `扭曲变焦`, `扭曲模糊`, `抖动模糊`, `抽帧拖影`, `拉伸旋镜`, `拉扯震动`, `拉镜开幕`, `拍照定格`, `拖影灯光`, `拟截图放大镜`, `推拉跟随`, `推拉运镜`, `摇晃叠影`, `摇晃推镜`, `摇晃运镜`, `撕纸特写`, `播放界面`, `故障定格`, `故障开幕`, `故障震闪`, `散光弹动`, `散光闪烁`, `数字矩阵`, `斜线震动`, `新年仙女棒`, `方形模糊`, `旋焦`, `旋焦推镜`, `旋转变焦`, `旋转回弹`, `旋转圆球`, `旋转抖动`, `旋转抖动_II`, `星星变焦`, `曝光变焦`, `曝光扩散`, `曲线模糊`, `极速旋转`, `柔和辉光`, `梦幻辉光`, `模拟拍照`, `横向闪光`, `横条开幕`, `樱花飘落`, `欧根纱II`, `气球花花`, `氛围边框`, `水光影`, `水波倒影`, `水波模糊`, `水波泛起`, `水波流动`, `水滴扩散`, `油画模糊`, `法式暖调`, `法式涂鸦`, `泛光扫描`, `泛光爆闪`, `泛光闪动`, `泡泡光斑`, `泡泡冲屏`, `波动清晰`, `波浪`, `波浪丝印`, `波纹闪动`, `流体冲屏`, `流体荡开`, `海报描边`, `海鸥DC`, `液态分离`, `漂浮爱心`, `潮流涂鸦`, `瀑布开幕`, `灵魂出窍_II`, `灿灿金币`, `灿金彩带`, `炫光变焦`, `炫光扫描`, `烟花2024`, `热恋`, `爆闪锐化`, `爱心扫光`, `爱心气球`, `爱心软糖`, `爱心边框`, `珠光Kira`, `珠光碎闪`, `电光描边`, `电光波动`, `电光爆闪`, `电光爆闪_II`, `电光爱心`, `电音故障`, `画质清晰`, `白鸽`, `相片定格`, `矩阵频闪`, `碎闪描边`, `磁带DV`, `磨砂水晶`, `神龙纳福`, `秋日暖阳`, `移轴模糊`, `竖向开幕`, `竖向闪光`, `竖线屏闪`, `竖闪模糊`, `粉雪`, `粒子放射`, `精致辉光`, `紫光夜`, `繁花棱镜II`, `红蓝魔`, `红边模糊`, `纵向跳动`, `纸质抽帧`, `线光变速`, `线条涂鸦`, `缤纷`, `网点丝印`, `群蝶飞舞`, `羽毛飘落`, `翻转变焦`, `翻转开幕`, `老式DV`, `胶片V`, `胶片冷绿`, `胶片暖棕`, `胶片滚动`, `胶片闪切`, `脉搏跳动`, `色差震闪`, `色散冲击`, `色散故障`, `花屏故障`, `花瓣环绕`, `菱形光斑`, `菱形变焦`, `落叶_II`, `蓝光爆闪`, `蓝色丝印`, `虹光旋入`, `视频播放`, `负片分屏`, `负片涂鸦`, `负片涂鸦_II`, `负片涂鸦_III`, `负片游移`, `负片频闪`, `超大光斑`, `超强锐化`, `跟随运镜`, `跟随运镜_II`, `车窗_II`, `辉光开幕`, `边缘扫光`, `迷幻故障`, `迷幻荡漾`, `迷幻震动`, `重复变焦`, `重复震闪`, `金色碎片`, `金边闪烁`, `银杏飘落`, `闪光弹跳`, `闪光灯_II`, `闪光灯IV`, `闪电扭曲`, `闪白_II`, `随机闪切`, `随机马赛克`, `隔行DV`, `雨季_I`, `雪花光斑`, `雪雾`, `雾镜_II`, `震动光束`, `震动发光`, `震动屏闪`, `震动扫光`, `震动推镜`, `震闪渐黑`, `霓虹光线`, `霓虹闪切`, `马赛克闪切`, `高速彩光`, `鱼眼_II`, `鱼眼_III`, `鱼眼_IV`, `黑白胶片`

**C3 Character** (227): `BOOM`, `X`, `crash`, `中刀`, `主体冲破屏幕`, `九尾狐`, `人影爆闪`, `光环_I`, `光环_II`, `几何拖尾_I`, `几何拖尾_II`, `击中`, `分头行动`, `分身`, `动感爱心`, `卡通脸`, `变身`, `可爱女生`, `可爱猪`, `吻痕坏笑`, `哈哈哈`, `图腾`, `圣诞小熊`, `圣诞帽`, `圣诞树`, `圣诞胡子`, `圣诞辣妹`, `圣诞铃铛`, `声波`, `多屏圣诞树`, `大头`, `大眼睛`, `天使环`, `太阳神`, `好吃`, `妖气`, `委屈丑丑脸`, `害羞`, `小恶魔`, `小鹿角`, `尴尬住了`, `局部扭曲`, `局部马赛克`, `巴哥犬`, `帅气男生`, `幻影_I`, `幽灵`, `弥散流光`, `彩色负片`, `彩色重影`, `微笑摇摆头`, `心动`, `心动信号`, `心心眼`, `恶灵骑士`, `恶魔印记`, `恶魔尾巴`, `恶魔角`, `惨`, `意识流`, `憔悴`, `懵`, `我不听`, `我服了`, `打击`, `打脸`, `扫描_II`, `拼贴抽帧`, `拼贴风暴`, `拽酷红眼`, `掉小珍珠啦`, `故障描边_I`, `敲打`, `新年星黛露`, `无信号`, `星光放射`, `星星拖尾`, `未来眼镜`, `机械几何`, `机械姬_I`, `机械姬_II`, `机灵怪`, `欧美女性`, `欧美男性`, `气泡_I`, `气泡_II`, `气波`, `沉沦`, `流光描边`, `流口水`, `漩涡`, `潮流入侵`, `潮酷女孩`, `潮酷男孩`, `激光几何`, `火焰拖尾`, `火焰环绕`, `火焰翅膀_I`, `火焰翅膀_II`, `灵机一动`, `灵魂出走`, `爱心光波`, `爱心焰火`, `猩猩脸`, `猫耳女孩`, `电光描边`, `电光放射`, `电击`, `电子屏故障`, `真的会谢`, `真香`, `破碎的心`, `神明少女`, `科技氛围_I`, `科技氛围_III`, `秘密`, `箭头环绕`, `粉色便便`, `背景拖影`, `背景氛围II`, `脸红`, `脸绿了`, `脸部故障`, `舞者`, `舞者_II`, `萤火`, `虚拟人生_I`, `虚拟人生_II`, `衰`, `视线遮挡`, `赛博朋克_I`, `赛博朋克_II`, `赛博眼镜`, `轻金属`, `运动轨迹`, `迷茫`, `闪影`, `闪烁`, `闪电炸裂`, `阳光`, `阴云密布`, `阴暗面`, `难吃`, `难过`, `雪花眼泪`, `霓虹特技`, `音符拖尾`, `音符拖尾_II`, `飓风`, `飞翔的帽子`, `鬼火`, `黑人女孩`, `黑人男生`, `_3D兔兔`, `Love_u`, `X瞬移`, `分身_III`, `分身ll`, `发光分身`, `变老美颜`, `可爱龙龙`, `嘻哈眼镜`, `天使`, `天使翅膀`, `奇行种`, `局部模糊`, `幻彩流光`, `幻影平移`, `彩虹流体`, `彩虹边缘`, `影分身`, `恶魔之翼`, `情绪定格`, `我太可爱了`, `我爱了`, `我麻了`, `手写描边`, `捕梦`, `旋转分身`, `无限穿越`, `有事吗`, `机械环绕_I`, `机械环绕_II`, `梦境`, `气炸了`, `波点分身`, `流体故障`, `漩涡溶解`, `火焰图腾`, `点赞`, `热力光谱_I`, `热力光谱_II`, `焰火`, `熬夜冠军`, `爱心`, `爱心发射`, `爱心泡泡`, `爱心眼`, `爱心美瞳`, `狱火`, `生气`, `电光描边_II`, `电光灼烧`, `电光眼`, `电光耳机`, `眼神光`, `瞬移`, `碎片分身`, `碎闪边缘`, `科技氛围_II`, `移形回位`, `移形幻影_I`, `移形幻影_II`, `空气流体`, `笑哭`, `粒子弥散`, `美味召唤`, `蝴蝶翅膀`, `轮廓扫描`, `迷幻分身`, `金币掉落`, `镭射眼_I`, `镭射眼_II`, `闪电`, `闪电环绕`, `闪电眼`, `霓虹爱心`

**C4 Intro** (95): `缩小`, `渐显`, `放大`, `旋转`, `Kira游动`, `抖动下降`, `镜像翻转`, `旋转开幕`, `折叠开幕`, `漩涡旋转`, `跳转开幕`, `轻微抖动`, `轻微抖动_II`, `轻微抖动_III`, `上下抖动`, `左右抖动`, `斜切`, `钟摆`, `雨刷`, `雨刷_II`, `向上转入`, `向上转入_II`, `向左转入`, `向右转入`, `向上滑动`, `向下滑动`, `向左滑动`, `向右滑动`, `向下甩入`, `向右甩入`, `向左上甩入`, `向右上甩入`, `向左下甩入`, `向右下甩入`, `动感放大`, `动感缩小`, `轻微放大`, `快速翻页`, `荧光爆闪`, `十字震动`, `爱心碰撞`, `冲撞`, `闪屏`, `扫描`, `震动波纹`, `分屏翻转`, `立体翻转`, `马赛克`, `_2024`, `多层环形`, `弹力分割`, `弹近`, `画出爱心`, `发光矩形`, `空间扭曲`, `四屏转换`, `展开`, `划水`, `色散波纹`, `模糊聚焦`, `圆形开幕`, `聚合`, `砸出波纹`, `向下甩动`, `向上滚动`, `拼图`, `向上闪入`, `交错开幕`, `便利贴`, `侧滑`, `横向模糊`, `闪现`, `水墨`, `交叉震动`, `抖动横移`, `抖动变焦`, `斜向拉丝`, `拉丝滑入`, `果冻_I`, `果冻_II`, `烟雾弹`, `震波`, `震波_II`, `震波_III`, `旋转圆球`, `转圈圈`, `曝光放射`, `玻璃聚集`, `分屏横移`, `流金`, `心形放大`, `老电视`, `脉冲`, `能量立方`, `波纹弹动`

**C5 Outro** (72): `向上转出`, `向上转出_II`, `跳转闭幕`, `镜像翻转`, `旋转闭幕`, `漩涡旋转`, `向上滑动`, `向下滑动`, `向左滑动`, `向右滑动`, `折叠闭幕`, `轻微放大`, `Kira游动`, `缩小`, `放大`, `旋转`, `斜切`, `渐隐`, `空间扭曲`, `弹远`, `四屏转换`, `分屏翻转`, `冲撞`, `旋转圆球`, `砸出波纹`, `交叉震动`, `能量立方`, `横向模糊`, `多层环形`, `斜向拉丝`, `分屏横移`, `_2024`, `扫描`, `曝光放射`, `色散波纹`, `马赛克`, `十字震动`, `震动波纹`, `弹力分割`, `震波_III`, `立体翻转`, `流金`, `划水`, `发光矩形`, `玻璃爆开`, `转圈圈`, `烟雾弹`, `闪现`, `圆形闭幕`, `飘散`, `闪屏`, `老电视`, `向上闪出`, `交错闭幕`, `心形缩小`, `水墨`, `折叠`, `画出爱心`, `侧滑`, `抖动横移`, `便利贴`, `拼图`, `向下甩动`, `脉冲`, `向上滚动`, `拉丝滑出`, `波纹弹动`, `快速翻页`, `荧光爆闪`, `模糊聚焦`, `抖动变焦`, `爱心碰撞`

**C6 Group** (123): `三分割`, `三分割_II`, `上下分割`, `上下分割_II`, `上升旋转`, `下降向右`, `下降向左`, `中间分割`, `中间分割_II`, `叠叠乐`, `叠叠乐_II`, `叠叠乐_III`, `叠叠乐_IV`, `叠叠乐_V`, `叠叠乐_VI`, `右拉镜`, `向右下降`, `向右缩小`, `向左下降`, `向左缩小`, `哈哈镜`, `哈哈镜_II`, `四格滑动`, `四格翻转`, `四格转动`, `四格转动_II`, `回弹伸缩`, `夹心饼干`, `夹心饼干_II`, `小火车`, `小火车_II`, `小火车_III`, `小火车_IV`, `小陀螺`, `小陀螺_II`, `左右分割`, `左右分割_II`, `左拉镜`, `弹入旋转`, `形变右缩`, `形变左缩`, `形变缩小`, `悠悠球`, `悠悠球_II`, `手机`, `手机_II`, `手机_III`, `扭曲拉伸`, `抖入放大`, `拉伸扭曲`, `放大弹动`, `斜转`, `斜转_II`, `方片转动`, `方片转动_II`, `旋入晃动`, `旋出渐隐`, `旋转上升`, `旋转伸缩`, `旋转回吸`, `旋转缩小`, `旋转降落`, `晃动旋出`, `水晶`, `水晶_II`, `波动滑出`, `海盗船`, `海盗船_II`, `海盗船_III`, `海盗船_IV`, `滑入波动`, `滑滑梯`, `滑滑梯_II`, `百叶窗`, `百叶窗_II`, `碎块滑动`, `碎块滑动_II`, `立方体`, `立方体_II`, `立方体_III`, `立方体_IV`, `立方体_V`, `绕圈圈`, `绕圈圈_II`, `绕圈圈_III`, `绕圈圈_IV`, `缩小弹动`, `缩小旋转`, `缩小转出`, `缩放`, `缩放_II`, `翻转`, `翻转_II`, `翻转_III`, `翻转_IV`, `翻转_V`, `翻转_VI`, `荡秋千`, `荡秋千_II`, `转入转出`, `转入转出_II`, `转圈圈`, `过山车`, `过山车_II`, `降落旋转`, `魔方`, `魔方_II`, `分身`, `分身_II`, `动感摇晃I`, `动感摇晃II`, `四格滑动_II`, `四格翻转_II`, `回忆旋转`, `坠落`, `弹动冲屏`, `波动吸收`, `波动放大`, `相框滑动`, `红酒摇晃`, `跳跳糖`, `闪光放大`, `闪光放大_II`

**C7 Text intro** (144): `冲屏位移`, `卡拉OK`, `变色输入`, `右上弹入`, `右下擦开`, `向上擦除`, `向上滑动`, `向上翻转`, `向上重叠`, `向上露出`, `向下擦除`, `向下滑动`, `向下露出`, `向下飞入`, `向右擦除`, `向右滑动`, `向右缓入`, `向右集合`, `向右露出`, `向左擦除`, `向左滑动`, `向左露出`, `圆形扫描`, `复古打字机`, `居中打字`, `左上弹入`, `左移弹动`, `开幕`, `弹入`, `弹弓`, `弹性伸缩`, `弹簧`, `彩色映射`, `打字机_I`, `打字机_II`, `打字机_III`, `打字机IV`, `扭曲模糊`, `拖尾`, `收拢`, `放大`, `故障打字机`, `旋入`, `日出`, `晕开`, `模糊`, `水墨晕开`, `水平翻转`, `波浪弹入`, `渐显`, `溶解`, `滑动上升`, `生长`, `甩出`, `站起`, `缩小`, `缩小_II`, `羽化向右擦开`, `羽化向左擦开`, `翻动`, `轻微放大`, `逐字旋转`, `逐字显影`, `逐字翻转`, `闪动`, `随机弹跳`, `随机飞入`, `乱码故障`, `二段缩放`, `便利贴`, `倒数`, `兔子弹跳`, `冰雪飘动`, `发光闪入`, `叠影并入`, `向上弹入`, `向下溶解`, `向右模糊_II`, `向左模糊`, `吸入`, `呐喊声波`, `喷绘`, `圆柱体滚动`, `圣诞帽弹跳`, `圣诞树弹跳II`, `弹入跳动`, `弹性伸缩_II`, `心动瞬间`, `慢速放大`, `打字光标`, `抖动甩入`, `折叠`, `描边填充`, `放大震动`, `故障闪动`, `新年打字机`, `旋转缩放`, `旋转飞入`, `星光闪闪`, `星光闪闪_II`, `星星弹跳`, `模糊发光`, `模糊滚动`, `模糊缩小`, `汇聚`, `波浪弹跳`, `流光扩散`, `滚入`, `激光雕刻`, `爱心弹跳`, `玩雪`, `环绕滑入`, `生长_II`, `电光`, `电光_II`, `碰碰车`, `空翻`, `缤纷冲屏`, `缩放_III`, `翻页II`, `背景滑入`, `色散拖影`, `螺旋上升`, `跃进`, `跳跳捣蛋鬼`, `跳跳糖`, `辉光`, `辉光扫描`, `逐字弹跳`, `逐字旋入`, `金粉飘落`, `镂空跳入`, `闪烁集合`, `随机上升`, `随机弹跳_II`, `随机打字机`, `随机落下`, `随机集合`, `雪光模糊`, `音符弹跳`, `顶出`, `预览打字`, `飞入`, `鼠标点击`

**C8 Text outro** (97): `右上弹出`, `右下擦除`, `向上擦除`, `向上溶解`, `向上滑动`, `向下擦除`, `向下滑动`, `向右擦除`, `向右滑动`, `向右缓出`, `向左擦除`, `向左滑动`, `向左解散`, `圆形扫描`, `居中打字`, `展开`, `左上弹出`, `左移弹动`, `弹出`, `弹弓`, `弹性伸缩`, `弹簧`, `打字机_I`, `打字机_II`, `打字机_III`, `扭曲模糊`, `拖尾`, `放大`, `放大_II`, `故障打字机`, `旋出`, `日落`, `晕开`, `模糊`, `水墨晕开`, `水平翻转`, `波浪弹出`, `渐隐`, `溶解`, `滑动下落`, `生长`, `缩小`, `羽化向右擦除`, `羽化向左擦除`, `翻动`, `躺下`, `轻微放大`, `闪动`, `闭幕`, `随机弹跳`, `随机飞出`, `二段缩放`, `发光闪出`, `叠影并出`, `向上飞出`, `向下弹出`, `向下翻转`, `向左模糊`, `向左模糊_II`, `吸出`, `喷绘`, `复古打字机`, `弹出跳动`, `弹性伸缩_II`, `打字光标`, `打字机IV`, `折叠`, `描边填充`, `收缩震动`, `故障`, `故障闪动`, `旋转缩放`, `旋转飞出`, `模糊发光`, `模糊滚动`, `波浪弹跳`, `消散`, `滚出`, `激光雕刻`, `炸开`, `炸开_II`, `炸开_III`, `环绕滑出`, `甩回`, `空翻`, `螺旋下降`, `逐字旋出`, `逐字旋转`, `逐字翻转`, `逐字虚影`, `镂空跳出`, `闪烁散开`, `随机弹跳_II`, `随机打字机`, `顶出`, `预览打字`, `飞出`

**C9 Text loop** (92): `VHS`, `上弧`, `刷屏`, `发光模糊多行`, `吹泡泡`, `吹泡泡_II`, `呐喊`, `复古涂鸦`, `字体变换`, `弹幕滚动`, `彩虹`, `彩虹_情人节`, `彩虹_新年`, `彩虹_马卡龙`, `扫光`, `投影颤抖_II`, `折叠`, `拼贴纹理`, `描边粉笔`, `摇摆`, `摇荡`, `故障闪动`, `旋转`, `晃动`, `波纹`, `爆闪`, `环绕`, `翻转`, `色差故障`, `蓝黄滑动`, `超强晃动`, `超强晃动_II`, `超强波浪`, `超强波浪_II`, `跳动`, `轻微跳动`, `钟摆`, `闪烁`, `雨刷`, `频闪边框`, `颤抖`, `颤抖_III`, `喷涌`, `喷绘`, `圆形涂鸦`, `声波震动`, `字幕滚动`, `尾巴摇摆`, `弹幕`, `弹幕_II`, `强调三遍`, `彩色切换`, `彩色火焰`, `影像叠加`, `心跳`, `急了`, `悸动`, `情绪加载`, `扩音器`, `扭动`, `投影颤抖`, `抖动故障`, `拉住`, `拉开`, `排队入场`, `摇摆_I`, `放大缩小`, `放大镜`, `文字泛光`, `波浪`, `波浪_II`, `波浪_III`, `流光`, `涂鸦手绘`, `涂鸦手绘_II`, `渐变拖尾`, `漂浮`, `漩涡`, `环形滚动`, `环绕_II`, `甜甜圈`, `福袋炸开`, `空间翻转_I`, `空间翻转_II`, `空间翻转_III`, `翻页I`, `调皮`, `逐字放大`, `错位`, `随机弹跳`, `颤抖_II`, `飘起`

**C10 Mask** (6): `线性`, `镜面`, `圆形`, `矩形`, `爱心`, `星形`
