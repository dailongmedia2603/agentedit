# THUẬT NGỮ EDIT — dùng đúng khi lập kế hoạch (và cách mỗi thứ hiện ra trong bộ dựng Remotion)

1. Layer: các lớp chồng lên nhau (video, text, sticker, effect, blur…) → `layers[]`, thứ tự bằng `track`.
2. Footage: file/cảnh quay gốc → `source_videos`.
3. A-roll: cảnh quay chính (người nói / nội dung chính) → video nguồn trên timeline chính.
4. B-roll: cảnh phụ minh hoạ cho A-roll, giúp đỡ nhàm → scene `split` / `broll` / `card` + `assets` (ảnh AI, khung nguồn) / meme.
5. Keyframe: mốc giá trị theo thời gian để tạo chuyển động (nhỏ→lớn, mờ→rõ, trái→phải) → `keyframes[]`.
6. Timeline: vùng sắp xếp video/audio/text/effect theo thời gian.
7. Track: từng hàng trên timeline → `track` của layer.
8. Clip: một đoạn video/audio trên timeline → `segments[]`.
9. SFX: hiệu ứng âm thanh (click, whoosh, boom, pop…) → `audio[]` / `sfx` của layer.
10. BGM: nhạc nền (dưới giọng nói rất nhiều, ~-25..-30 dB).
11. Transition: hiệu ứng chuyển cảnh → `transitions` / `hook_transition` / `morph` giữa bố cục.
12. Cut: điểm cắt giữa hai đoạn.
13. Split: chia một clip làm hai tại một vị trí.
14. Trim: cắt bớt đầu/cuối clip.
15. Jump Cut: cắt bỏ khoảng thừa trong cùng một cảnh (talking video/TikTok) — kèm đổi cỡ khung (`scale`) để đỡ giật.
16. J-cut / L-cut: tiếng cảnh trước/sau chạy lệch hình để chuyển tự nhiên → scene `broll`/`graphic`: hình đổi, tiếng A-roll chạy tiếp.
17. Overlay: video/hình/text đặt đè footage chính → layer `image`/`text`, meme `overlay`.
18. Mask: khoanh vùng để hiện/ẩn một phần → `mask: round|circle`, khung `card`/`circle`, ảnh `cutout`.
19. Crop: cắt bớt khung hình → A-roll trong `split`/`card`/`circle` (tự căn theo mặt).
20. Opacity: độ trong suốt → `opacity`.
21. Position: vị trí → `x`, `y`.
22. Scale: phóng to/thu nhỏ → `scale`, `w`.
23. Rotation: xoay → `rotation`.
24. Anchor Point: điểm tâm khi scale/rotate → `anchor`.
25. Ease In / Ease Out: tăng/giảm tốc mềm → `easing` (ease_in, ease_out, back_out…).
26. Motion Blur: nhoè chuyển động → tự có ở `slide_*`, `zoom_out`, `blur_in`.
27. Speed Ramp: tăng/giảm tốc theo đoạn → `speed` của segment.
28. Freeze Frame: đóng băng một khung hình.
29. Zoom In / Zoom Out: phóng gần / thu xa → `ken_burns`, `zoom_out_reveal`.
30. Punch In: zoom nhanh vào chủ thể để nhấn câu nói → `zoom_punch`.
31. Pan: lia ngang → `pan_left` / `pan_right`, `kenburns: left|right`.
32. Color Correction: chỉnh màu về cân bằng.
33. Color Grading: tạo tone màu cảm xúc → `grade`.
34. LUT: preset màu → `grade.preset`.
35. Exposure: độ sáng tổng thể.
36. Contrast: tương phản sáng–tối.
37. Saturation: độ đậm màu.
38. Adjustment Layer: lớp áp effect/màu lên nhiều clip cùng lúc → hiệu ứng camera (`effects[]`) áp cả khung A-roll.
39. Effect / FX: hiệu ứng hình ảnh → `effects[]`.
40. Text Animation: chữ xuất hiện/biến mất/chuyển động → `enter` / `exit` / `loop` của layer text.
41. Caption / Subtitle: phụ đề → `captions[]` (bước viết phụ đề).
42. Lower Third: chữ phía dưới giới thiệu tên/chức danh.
43. Hook: mở đầu giữ người xem vài giây đầu → `hook` + hiệu ứng mạnh (fisheye, focus, chữ nhấn, SFX).
44. CTA: kêu gọi hành động (follow, comment, mua…) ở cuối.
45. Pacing: nhịp dựng tổng thể — nhanh, chậm, dồn dập.
46. Beat Cut: cắt/chuyển theo nhịp nhạc.
47. Sync: đồng bộ hình, tiếng, nhạc, chuyển động → neo giờ nguồn theo từng chữ (Whisper).
48. Aspect Ratio: tỉ lệ khung — 9:16 TikTok/Reels/Shorts, 16:9 YouTube ngang, 1:1 vuông.
49. FPS: số khung/giây (24/30/60) — bộ dựng xuất 30fps.
50. Resolution: độ phân giải — xuất 1080×1920.
51. Render: xử lý effect/video trước khi xem hoặc xuất.
52. Export: xuất file hoàn chỉnh (MP4).
53. Bitrate: dữ liệu mỗi giây, ảnh hưởng chất lượng và dung lượng.
54. Concept / Editing Style: phong cách tổng thể (clean, cinematic, energetic, emotional, luxury, funny, fast-paced…) → `style_kit`.
55. Reference: video/hình mẫu tham khảo style → bước "Video mẫu".
