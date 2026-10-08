#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""KHO PROMPT & QUY TAC NGUOI DUNG CHINH SUA (menu "Prompt & quy tac").

Moi thu nguoi dung sua duoc luu CHUNG mot file:
    ~/.capcut-studio/prompt_overrides.json
    {"version": 1, "prompts": {id: text}, "refs": {id: text}, "rules": {id: value}}

Chi luu PHAN DA SUA. Muc nao khong co trong file = dung ban goc trong code, nen
cap nhat app (prompt goc doi) van tu nhan ban moi cho nhung muc nguoi dung chua dung toi.

Ai doc file nay:
  - providers.py / remotion_plan.py / reference_video.py / motion_design.py
                   -> get_prompt() moi lan goi AI (khong can khoi dong lai)
  - motion_design  -> get_ref() cho references/remotion-dsl.md + edit-glossary.md
  - plan_guard.py  -> TU doc muc "rules" (stdlib thuan)

Muc trong file ma khong con dang ky o day (prompt/quy tac cua luong CapCut cu) duoc GIU
NGUYEN trong file nhung khong hien, khong dung — va van nam trong fingerprint().

Doc theo mtime nen sua xong la lan goi AI / lan dung ke tiep ap dung ngay.
"""
import copy
import hashlib
import json
import math
import os
import re
import threading
import importlib
import time

import plan_guard

OVERRIDES_PATH = plan_guard.OVERRIDES_PATH
HERE = os.path.dirname(os.path.abspath(__file__))
REFS_DIR = os.path.join(HERE, "references")

_LOCK = threading.Lock()
_CACHE = {"stamp": None, "data": None}

# ---------------------------------------------------------------------------
# NHOM hien thi
# ---------------------------------------------------------------------------
GROUPS = [
    {"id": "understand", "title": "Đọc hiểu video (Gemini)",
     "info": "Các prompt gửi cho Gemini kèm file video. Gemini chỉ XEM và GHI NHẬN (transcript, cảm xúc, "
             "khoảnh khắc chính…) — kết quả là 'source brief' làm đầu vào cho mọi bước sau."},
    {"id": "plan", "title": "Lập kế hoạch — các bước chung (GPT / Claude)",
     "info": "Khi bấm lập plan: B1 chọn chất liệu & câu chuyện → B2 timeline → B3 hook → R4 thiết kế → "
             "R5 phụ đề → FX hiệu ứng tự viết (+ chữ ảnh AI) → B6 meme → B7 SFX + nhạc nền. Mỗi bước là 1 lần gọi AI lập kế hoạch (GPT hoặc Claude — chọn "
             "trong Cài đặt API) với prompt riêng. Nhóm này là các bước "
             "B1/B2/B3/B6/B7; R4, R5 và video mẫu nằm ở nhóm 'Video Remotion'. Câu chuyện của B1 và phần video "
             "mẫu liên quan đi vào MỌI bước; timeline B2 là xương sống; B7 SFX nhận cả hook, chuyển cảnh, chữ "
             "hero, meme của các bước trước."},
    {"id": "remotion", "title": "Video Remotion",
     "info": "Các prompt riêng của Remotion: phân tích video mẫu (Gemini xem + nghe video mẫu), "
             "thiết kế bố cục + lớp đồ hoạ (R4), phụ đề (R5), hiệu ứng hình AI tự thiết kế + viết code (FX) và chữ ảnh "
             "AI. Chuyển cảnh / màu / kiểu chữ / font chỉ được chọn trong danh mục Remotion."},
    {"id": "refs", "title": "Tài liệu kiến thức",
     "info": "Các tài liệu dài được NỐI vào cuối prompt R4 (và bước bóc bộ phong cách video mẫu) để GPT "
             "dùng đúng ngôn ngữ dựng Remotion và thuật ngữ edit."},
    {"id": "caption", "title": "Quy tắc chữ / caption",
     "info": "Lớp bảo vệ (plan_guard) chạy bằng CODE khi dựng bản Remotion: chữ của video chính không được "
             "chạy đè lên đoạn meme cắt vào — bị cắt đuôi, dời ra sau meme, hoặc bỏ nếu không còn đủ thời gian đọc."},
    {"id": "hook", "title": "Quy tắc hook mở đầu",
     "info": "Ràng buộc cho đoạn hook (cold-open) được đặt lên đầu video."},
    {"id": "meme", "title": "Quy tắc chèn meme",
     "info": "Ràng buộc cho meme/b-roll: số lượng, độ dài, khoảng cách, cách cắt vào khoảng lặng."},
    {"id": "sfx", "title": "Quy tắc SFX & âm lượng",
     "info": "Số lượng SFX, khoảng cách, và cách tự tính âm lượng theo loại tiếng + độ to đo được (LUFS)."},
    {"id": "mechanism", "title": "Cơ chế cố định (chỉ xem)",
     "info": "Các cơ chế được viết bằng code, hiển thị để bạn hiểu hệ thống vận hành thế nào. "
             "Không sửa ở đây được vì đổi sai sẽ làm hỏng logic."},
]

# ---------------------------------------------------------------------------
# PROMPT (id = ten hang so trong providers.py)
# template=True: prompt co cho trong {ten} de he thong chen tai lieu vao.
# ---------------------------------------------------------------------------
PROMPTS = [
    {"id": "_GEMINI_SOURCES_PROMPT", "group": "understand", "title": "Hiểu video nguồn",
     "used_in": "Bước 'Hiểu nguồn' — Video Remotion",
     "info": "Prompt Gemini dùng để xem TẤT CẢ video nguồn trong 1 lần và trả về phân tích riêng cho từng "
             "source_id: transcript theo cụm từ kèm giây, bản đồ cảm xúc, khoảnh khắc chính, vùng mặt… "
             "Hệ thống tự nối thêm danh sách video (id, tên, thời lượng) vào cuối prompt. "
             "Chỉ áp dụng cho lần phân tích MỚI — project đã phân tích rồi vẫn giữ kết quả cũ."},
    {"id": "_GEMINI_MERGE_PROMPT", "group": "understand", "title": "Ghép phân tích video dài",
     "used_in": "Bước 'Hiểu nguồn' — chỉ khi video phải cắt nhiều phần",
     "info": "Video nén 720p mà vẫn quá 20 MB thì được cắt nhiều phần THEO DUNG LƯỢNG, Gemini xem từng phần "
             "riêng. Hệ thống tự cộng giờ và bỏ trùng; prompt này cho AI (chỉ đọc chữ, không xem video) viết lại "
             "tóm tắt liền mạch và xếp hạng lại khoảnh khắc trên TOÀN video. Không được đổi mốc giờ."},
    {"id": "_GEMINI_MEME_PROMPT", "group": "understand", "title": "Gắn nhãn meme",
     "used_in": "Kho meme → nút 'AI gắn nhãn'",
     "info": "Gemini xem 1 clip meme và viết nhãn (tên, emotion, use_when, đoạn đắt nhất…). AI lập plan "
             "KHÔNG xem được clip nên chỉ chọn meme dựa vào nhãn này — viết use_when càng rõ, chèn càng trúng."},
    {"id": "_GEMINI_SFX_PROMPT", "group": "understand", "title": "Gắn nhãn âm thanh (SFX)",
     "used_in": "Kho âm thanh → nút 'Cho Gemini nghe'",
     "info": "Gemini NGHE từng file SFX (5 file/lượt) và viết nhãn: nghe thấy gì, loại tiếng, có giọng người "
             "nói không (+ lời), cảm xúc, mức mạnh, dùng khi / tránh khi. Độ dài và mốc cú đậm (peak_time) do "
             "máy đo từ âm thanh thật. AI lập plan KHÔNG nghe được file nên chỉ chọn SFX dựa vào nhãn này."},
    {"id": "_GEMINI_MUSIC_PROMPT", "group": "understand", "module": "music_lib", "own_key": True,
     "title": "Gắn nhãn nhạc nền (Kho nhạc nền)",
     "used_in": "Tài nguyên → Kho nhạc nền → nút 'Cho Gemini nghe'",
     "info": "Gemini NGHE từng bài nhạc nền (3 bài/lượt, bản nén mono) và viết nhãn: thể loại, cảm xúc, năng lượng, "
             "nhịp, nhạc cụ, có lời hát không, có hợp làm nền dưới giọng nói không, dùng khi / tránh khi, giây bắt đầu "
             "đẹp. Độ dài + độ to do máy đo. AI lập plan KHÔNG nghe được bài nên chỉ chọn nhạc dựa vào nhãn này."},
    {"id": "_GEMINI_TEXT_TEMPLATE_PROMPT", "group": "understand", "title": "Gắn nhãn mẫu chữ (Kho Text)",
     "used_in": "Kho Text → nút '✨ Gemini phân tích'",
     "info": "Gemini XEM preview.mp4 của 1 mẫu chữ động (chuyển từ preset CapCut) và viết nhãn: phong cách/"
             "cảm giác, mức độ (nhẹ/vừa/mạnh), chuyển động, hợp dùng khi nào (hook, nhấn từ khoá, chuyển ý, "
             "CTA…), vai trò từng ô chữ. Chữ hiện trong preview CHỈ LÀ CHỮ MẪU minh hoạ bố cục — prompt nhắc "
             "Gemini KHÔNG được suy 'dùng khi' theo Ý NGHĨA chữ mẫu, chỉ theo phong cách hình/nhịp. AI lập plan "
             "KHÔNG xem được hoạt cảnh nên chỉ chọn mẫu dựa vào nhãn này."},

    {"id": "_GEMINI_FX_PROMPT", "group": "understand", "module": "fx_lib", "own_key": True,
     "title": "Gắn nhãn hiệu ứng (Kho hiệu ứng)",
     "used_in": "Kho hiệu ứng — tự chạy nền sau khi video render xong (hoặc nút '✨ Gemini phân tích')",
     "info": "Gemini XEM preview của hiệu ứng tự viết (vẽ trên nền trung tính + bóng người giả ở vị trí mặt, không "
             "dùng hình video thật) và viết nhãn TỔNG QUÁT: tên, mô tả hình, dùng khi / tránh khi, cảm xúc, loại "
             "khoảnh khắc, vị trí, độ mạnh, điểm chất lượng. AI lập plan ở video khác chỉ đọc nhãn này để tìm hiệu "
             "ứng dùng lại; nhãn cũng là phần gửi lên kho chung (không tên sản phẩm / lời nói của video gốc)."},
    {"id": "_USER_MEDIA_PROMPT", "group": "understand", "module": "user_media", "own_key": True,
     "title": "Đọc hiểu tư liệu của bạn (ảnh / video chèn)",
     "used_in": "Video Remotion — mục 'Tư liệu của bạn', ngay khi thêm ảnh / video",
     "info": "Gemini XEM từng ảnh / video bạn muốn chèn lên video và mô tả khách quan: là gì, chủ thể, đặc điểm "
             "nhận diện (để vẽ lại đúng khi làm mẫu ảnh AI), chữ trong ảnh + có cần đọc được không, nền (tách nền được "
             "không), từ khoá người nói có thể nhắc tới, hợp khi nói về gì; video thêm các cảnh + đoạn đẹp theo giây. "
             "Hệ thống tự nối số đo của máy (kích thước, tỉ lệ, độ dài) vào cuối prompt. Kết quả lưu theo NỘI DUNG file "
             "— sửa prompt không làm cũ bản đã lưu, bấm 'Đọc lại' ở từng tư liệu để Gemini xem lại."},

    {"id": "_SELECT_SYSTEM", "group": "plan", "title": "B1 · Chọn chất liệu & câu chuyện",
     "used_in": "Bước Plan — B1",
     "info": "Nhận: phân tích video nguồn (tóm tắt, cảm xúc, khoảnh khắc + LỜI THOẠI theo giây), video mẫu, "
             "yêu cầu edit. GIỮ NGUYÊN kịch bản theo đúng thứ tự người nói — chỉ bỏ im lặng, tiếng đệm (ờ, à, "
             "ừm…), câu nói lặp (cắt theo ranh giới câu) — rồi ghi CÂU CHUYỆN: story_arc, tone, beat từng đoạn "
             "(hook/setup/body/proof/twist/payoff/cta). Câu chuyện này được truyền cho TẤT CẢ các bước sau. "
             "Nhiều video: tự xếp thứ tự video theo NỘI DUNG (thu_tu_video) và chỉ giữ một lần đoạn bị nói lại "
             "giữa hai video. Hệ thống ép lại thứ tự bằng code, tự bỏ câu trùng ở chỗ nối hai video và ghi vào "
             "nhật ký những câu bị bỏ."},
    {"id": "_TIMELINE_SYSTEM", "group": "plan", "title": "B2 · Dựng timeline",
     "used_in": "Bước Plan — B2",
     "info": "Nhận: các đoạn B1 chọn + lời thoại bên trong từng đoạn + câu chuyện + nhịp cắt của video mẫu. "
             "Nối thành timeline liên tục theo ĐÚNG thứ tự gốc (jump-cut tại ranh giới câu, không đảo, không bỏ "
             "câu nội dung), mỗi segment mang beat/purpose. "
             "Sau bước này hệ thống TỰ kéo điểm cắt lỡ rơi giữa câu về ranh giới câu và nối timeline liên tục "
             "— timeline này là xương sống cho các bước sau."},
    {"id": "_HOOK_SYSTEM", "group": "plan", "title": "B3 · Chọn hook",
     "used_in": "Bước Plan — B3 (gợi ý chuyển cảnh lấy từ danh mục Remotion)",
     "info": "Nhận: timeline (B2) + câu chuyện + lời thoại/cảm xúc CHỈ của phần còn trên timeline + cách mở "
             "đầu của video mẫu. Chọn 3-5s đắt nhất đặt lên đầu video kèm caption hook. Chạy trước các bước "
             "trang trí vì thiết kế/phụ đề/meme/SFX đều cần biết đầu video là gì."},
    {"id": "_INSERT_SYSTEM", "group": "plan", "title": "B6 · Chèn meme",
     "used_in": "Bước Plan — B6",
     "info": "Nhận: timeline + lời thoại còn trên timeline + câu chuyện/tone + hook + chữ hero (R5) + mức dùng "
             "b-roll của video mẫu. Chọn meme cắt vào đúng câu nói (mặc định CẮT, không đè lên lời), không cắt "
             "mất chữ hero. Danh mục meme được tự nối vào cuối prompt. Kho trống → bỏ qua bước này."},
    {"id": "_AUDIO_SYSTEM", "group": "plan", "title": "B7 · Chọn SFX",
     "used_in": "Bước Plan — B7 (cuối cùng)",
     "info": "Chạy CUỐI vì SFX là dấu chấm câu cho mọi thứ đã có. Nhận: timeline + câu chuyện + hook + "
             "chuyển cảnh (R4) + chữ hero (R5 + lớp chữ đồ hoạ) + meme (B6) + kiểu SFX của video mẫu. Mỗi chữ "
             "hiện ra đều có SFX (thiếu thì hệ thống tự gắn) + SFX ở điểm nhấn, đặt đúng giây (neo theo giờ trong file gốc, hệ thống tự quy đổi). Danh mục SFX được tự nối "
             "vào cuối prompt. Kho trống → bỏ qua bước này."},
    {"id": "_MUSIC_RULE", "group": "plan", "module": "music_lib", "own_key": True,
     "title": "B7 · Chọn nhạc nền",
     "used_in": "Bước Plan — B7 (cùng lượt chọn SFX), CHỈ khi Kho nhạc nền có bài đã gắn nhãn và bật 'Tự thêm nhạc nền'",
     "info": "Hệ thống tự nối luật này + danh mục nhạc nền vào cuối prompt B7: AI chọn 1 bài hợp nội dung / cảm xúc cho "
             "cả video (hoặc không dùng, phải có lý do: video gốc đã có nhạc, người dùng không muốn nhạc...) và mức "
             "rất nhỏ / nhỏ / vừa. Độ to THẬT do code tính theo giọng nói của chính video (thanh trượt ở Kho nhạc nền), "
             "không bao giờ lấn giọng; nhạc bắt đầu SAU hook, tự giảm khi meme cắt vào, fade ở cuối. AI không chọn / "
             "chọn sai id → hệ thống tự chọn bài hợp nhãn nhất."},
    {"id": "_CREATIVE_RULE", "group": "plan", "module": "creative",
     "title": "Luật sáng tạo + cảm xúc (chung)",
     "used_in": "Hệ thống tự nối vào B3 hook, R4 thiết kế, R5 chữ, FX hiệu ứng, B6 meme, B7 SFX",
     "info": "Khối luật CHUNG cho mọi bước thiết kế: mỗi lựa chọn (âm thanh, hiệu ứng, chuyển cảnh, chữ, nhịp) phải "
             "tạo đúng một cảm xúc cho người xem; đi theo đường cong cảm xúc của câu chuyện; tránh lối mòn lặp một "
             "công thức; âm thanh chọn theo cảm xúc; vài khoảnh khắc 'đắt' riêng cho nội dung video. Luôn được nối "
             "vào các bước trên kể cả khi bạn đã sửa prompt của bước đó (B1/B2 không nhận: nội dung giữ thứ tự, chỉ "
             "cắt). Sửa ở đây → các bước thiết kế chạy lại thật ở lần lập plan sau."},
    {"id": "_HOOK_FIX_SFX_PROMPT", "group": "plan", "module": "hook_rule",
     "title": "Luật hook · Bổ sung âm thanh cho hook",
     "used_in": "Sau khi dựng bản Remotion — chỉ khi hook CHƯA có SFX",
     "info": "LUẬT HOOK (luôn áp dụng, hệ thống tự nối vào B3 / FX-plan / B7 và R4 dự phòng — không nằm trong prompt sửa được): "
             "3-5s đầu video BẮT BUỘC có hiệu ứng hình + âm thanh đủ gây chú ý, không ép loại nào, MỨC ĐỘ theo tone "
             "video (nhẹ: rõ nhưng êm / vừa: dứt khoát / mạnh: mạnh tay). Hệ thống kiểm trên bản dựng cuối; hook "
             "chưa có SFX, SFX vào muộn hoặc bị hạ quá nhỏ thì prompt này nhờ AI chọn lại 1-2 tiếng hợp câu hook + "
             "mức độ (AI vẫn không chọn được mới dùng tiếng dự phòng theo mức)."},
    {"id": "_HOOK_FIX_VISUAL_PROMPT", "group": "plan", "module": "hook_rule",
     "title": "Luật hook · Bổ sung hiệu ứng hình cho hook",
     "used_in": "Sau khi dựng bản Remotion — chỉ khi hiệu ứng hình của hook chưa đạt và AI không tự viết lại được",
     "info": "Hệ thống ĐO độ mạnh thật của hiệu ứng hook (biên độ chuyển động khung, độ phủ lớp hình, thời điểm "
             "chạm, có gắt không) so với mức theo tone + hiệu ứng mạnh nhất thân video. Thiếu / yếu / muộn / quá gắt "
             "với tone nhẹ: hệ thống nhờ AI tự thiết kế + viết code lại hiệu ứng hook (kèm số đo); không viết được thì "
             "dùng prompt này để AI chọn 1-2 hiệu ứng trong kho. AI vẫn không đạt mới dùng dự "
             "phòng theo mức (nhẹ: kéo mắt vào chủ thể; vừa: đập camera; mạnh: đập camera + lóe sáng)."},

    {"id": "_RM_REFERENCE_PROMPT", "group": "remotion", "module": "remotion_plan",
     "title": "Phân tích video mẫu (Gemini xem + nghe)",
     "used_in": "Video Remotion — bước 'Video mẫu', lượt 1",
     "info": "Gemini XEM + NGHE chính video mẫu (bản nén 720p, giữ tiếng). Hệ thống đo thêm bằng ffmpeg: mốc cắt cảnh, "
             "giây/shot, độ to âm thanh từng giây — gửi kèm làm số đo chuẩn vì Gemini ước giờ hay lệch. Kết quả là "
             "phân tích phong cách + 'remotion_hints' (id kiểu chữ/font/màu/transition gần video mẫu nhất). Danh mục "
             "Remotion được tự nối vào cuối prompt."},
    {"id": "_RM_STYLE_KIT_PROMPT", "group": "remotion", "module": "reference_video",
     "title": "Video mẫu · Bóc bộ phong cách (lượt 2)",
     "used_in": "Video Remotion — bước 'Video mẫu', lượt 2 (sau lượt Gemini xem video)",
     "info": "Gemini chỉ lấy ~1 khung/giây khi xem video, nên hệ thống cắt thêm DẢI KHUNG DÀY (~6 khung/giây) quanh các "
             "mốc đắt của video mẫu (hook, chỗ cắt cảnh, cuối video). Gemini xem để bóc BỘ PHONG CÁCH (style_kit): màu, font theo vai, cách dùng "
             "phụ đề, các bố cục A-roll/B-roll, hệ thống chữ nhiều tầng, chuyển động, camera, SFX và 'recipes' — công "
             "thức lớp mẫu viết đúng ngôn ngữ dựng. Bước R4 chép cấu trúc recipe, thay nội dung."},
    {"id": "_TEXT_ART_PROMPT", "group": "remotion", "module": "text_art",
     "template": ["hang", "out"],
     "title": "Chữ ảnh AI (tấm chữ)",
     "used_in": "Video Remotion — bước Plan, sau R5 (song song FX)",
     "info": "Mọi cụm chữ nổi bật (không gồm phụ đề karaoke) được GPT vẽ thành ảnh chữ đẹp theo chủ đề + phong "
             "cách video: 3 cụm / tấm, mỗi tầng một hàng cách xa, NỀN TRONG SUỐT; tấm đầu làm mẫu phong cách cho các "
             "tấm sau. Hệ thống cắt từng tầng, kiểm chính tả bằng OCR, tìm vị trí từng từ để chuyển động từng chữ. "
             "Hệ thống tự điền {chu_de} {phong_cach} {hang} {mau_tham_chieu} {out} — giữ nguyên {hang} và {out}."},
    {"id": "_TEXT_LIB_SYSTEM", "group": "remotion", "module": "text_tpl", "own_key": True,
     "title": "Kho Text · Chọn mẫu chữ cho từng cụm chữ (TXT-lib)",
     "used_in": "Video Remotion — bước Plan, sau R5, TRƯỚC chữ ảnh AI",
     "info": "Mỗi cụm chữ nổi bật được KIỂM TRA KHO TEXT TRƯỚC: AI đọc nhãn từng mẫu (phong cách, mức độ, hợp khi / tránh "
             "khi, vai trò từng ô chữ) + bối cảnh cụm chữ (câu đang nói, hook, ý đồ) rồi chọn mẫu và điền CHỮ CỦA CỤM vào "
             "các ô. Code kiểm: đọc theo thứ tự đọc của mẫu phải đúng nguyên chữ + đúng thứ tự lời nói, font đủ dấu tiếng "
             "Việt, chữ không phải thu nhỏ dưới 60% để vừa ô, mỗi mẫu tối đa 2 lần / video — sai thì AI sửa 1 lượt. Cụm "
             "dùng mẫu giữ NGUYÊN hoạt cảnh + font + âm thanh của mẫu, KHÔNG tạo chữ ảnh AI; cụm không có mẫu hợp mới tạo "
             "chữ ảnh AI. Kho trống thì bước này không chạy."},
    {"id": "_GRAPHIC_ART_PROMPT", "group": "remotion", "module": "graphic_art", "own_key": True,
     "template": ["phan_tu", "out"],
     "title": "Đồ hoạ có chữ bằng ảnh AI (huy hiệu…)",
     "used_in": "Video Remotion — bước Plan, sau R4 (chạy nền cùng chữ ảnh AI)",
     "info": "Khác chữ ảnh AI: mỗi mục là MỘT PHẦN TỬ ĐỒ HOẠ HOÀN CHỈNH (hình khối + chất liệu + icon minh hoạ đúng ý "
             "+ chữ), không chỉ là chữ. Áp cho lớp huy hiệu (badge) của R4: các phần tử cùng nhóm vẽ chung một ảnh "
             "để ra một bộ đồng nhất, nhóm đầu làm mẫu phong cách cho các nhóm sau. Hệ thống cắt từng phần tử, "
             "kiểm chữ bằng OCR; sai → tạo lại 1 lần → vẫn sai thì vẽ bằng code theo màu của video. Hệ thống tự "
             "điền {chu_de} {phong_cach} {phan_tu} {mau_tham_chieu} {out} — giữ nguyên {phan_tu} và {out}."},
    {"id": "_FX_PLAN_SYSTEM", "group": "remotion", "module": "fx_flow",
     "title": "FX · Đề xuất hiệu ứng theo bối cảnh (FX-plan)",
     "used_in": "Video Remotion — bước Plan, sau R5",
     "info": "AI xem TỪNG khoảnh khắc (đang nói gì, cảm xúc, sự kiện, bố cục + chữ đang trên màn hình, vị trí mặt, "
             "có phải hook) rồi mới đề xuất hiệu ứng TỰ THIẾT KẾ (không lấy kho mẫu). Mỗi hiệu ứng bắt buộc có: bối "
             "cảnh → mục tiêu → vì sao hợp → mô tả hình ảnh; thiếu thì hệ thống bỏ. Không có mục tiêu rõ thì không đặt."},
    {"id": "_FX_CODE_SYSTEM", "group": "remotion", "module": "fx_flow",
     "title": "FX · Viết code hiệu ứng (FX-code)",
     "used_in": "Video Remotion — bước Plan, sau FX-plan",
     "info": "Bộ quy tắc code: AI tự kiểm lần 2 hiệu ứng có hợp bối cảnh không (không hợp -> bỏ), rồi viết "
             "render(ctx) / transform(ctx) bằng JS thuần với API cho phép. Code chạy trong HỘP CÁCH LY (không quyền "
             "của app), được kiểm (từ cấm, chạy thử, tất định, tốc độ) — lỗi thì AI sửa 1 lượt, vẫn lỗi thì bỏ."},
    {"id": "_FX_REUSE_NOTE", "group": "remotion", "module": "fx_lib", "own_key": True,
     "title": "FX · Dùng lại hiệu ứng trong Kho hiệu ứng (FX-code)",
     "used_in": "Video Remotion — bước Plan, FX-code (chỉ khi kho có hiệu ứng giống)",
     "info": "Hiệu ứng đã viết code ở video trước được đóng gói vào Kho hiệu ứng. Sau FX-plan, hệ thống tự lọc 1-3 "
             "hiệu ứng trong kho giống mô tả của từng hiệu ứng mới và gửi kèm cho FX-code: AI dùng NGUYÊN (chỉ trả id + "
             "màu / cường độ), SỬA NHẸ code có sẵn, hoặc viết mới nếu không cái nào hợp ngữ cảnh. Code dùng lại vẫn "
             "qua hộp cách ly + tự kiểm lần 2 như code mới. Kho trống / không có cái giống thì phần này không gửi."},
    {"id": "_ASSET_IMAGE_PROMPT", "group": "remotion", "module": "asset_gen",
     "template": ["prompt", "context", "out"],
     "title": "Tạo ảnh AI (khung prompt chuẩn)",
     "used_in": "Video Remotion — bước 'Tạo ảnh' (GPT qua Codex CLI)",
     "info": "Khung prompt gửi AI tạo ảnh cho MỖI ảnh R4 khai. Hệ thống tự điền: {prompt} = mô tả ảnh R4 viết, "
             "{context} = BỐI CẢNH (câu người nói đang nói lúc ảnh hiện, vị trí ảnh trên màn hình, chữ hiện cùng lúc, "
             "chủ đề + giọng video, sản phẩm/bối cảnh thật), {style} phong cách video, {vung_trong} chỗ chừa cho chữ, "
             "{aspect}, {bg} (nền trơn khi cần tách nền), {out} đường dẫn lưu. Giữ nguyên {prompt} {context} {out}."},
    {"id": "_RM_DESIGN_SYSTEM", "group": "remotion", "module": "motion_design",
     "title": "R4 · Thiết kế bố cục + lớp đồ hoạ",
     "used_in": "Video Remotion — bước Plan (R4)",
     "info": "GPT làm motion designer: chia bố cục A-roll theo thời gian (full / chia đôi với B-roll / thẻ / tròn / "
             "B-roll toàn khung / cảnh đồ hoạ), khai ảnh cần tạo (ảnh AI qua Codex, khung cắt từ video nguồn, tách "
             "nền), thiết kế lớp đồ hoạ (chữ nhấn nhiều tầng, font, độ nghiêng, glow, huy hiệu, mũi tên, vòng tự vẽ, "
             "thẻ trích dẫn...) + chuyển động từng lớp, chuyển cảnh, tông màu. Hiệu ứng hình (camera, rung, vệt, ánh "
             "sáng...) KHÔNG khai ở bước này: hệ thống tự nối ghi chú vào cuối prompt, bước FX tự đề xuất + viết "
             "code theo từng khoảnh khắc. Có video mẫu: theo BỘ PHONG CÁCH bóc từ chính video mẫu đó. Không có video mẫu: KHÔNG có phong cách mặc định — AI tự thiết kế phong cách riêng cho video này từ nội dung + tone + yêu cầu edit (chỉ nằm trong plan của dự án). Tài liệu ngôn ngữ dựng + thuật "
             "ngữ edit + danh mục Remotion được tự nối vào cuối prompt."},
    {"id": "_USER_MEDIA_NOTE", "group": "remotion", "module": "user_media", "own_key": True,
     "title": "R4 · Tư liệu của bạn (ảnh / video chèn lên video)",
     "used_in": "Video Remotion — bước Plan (R4), CHỈ khi dự án có tư liệu",
     "info": "Luật hệ thống tự nối vào cuối prompt R4 khi bạn thêm ảnh / video ở mục 'Tư liệu của bạn'. R4 nhận mỗi tư "
             "liệu kèm MỤC ĐÍCH bạn đặt (chèn thẳng / làm mẫu ảnh AI / cả hai, cách hiển thị, ghi chú lúc nào chèn) + "
             "phân tích của Gemini + số đo, rồi đặt vào đúng lúc người nói nhắc tới với vị trí + cỡ hợp (khung nổi, "
             "sticker tách nền, nửa trên, toàn màn hình); ảnh AI có 'ref_media' được gửi kèm ảnh thật làm mẫu. Code kiểm "
             "lại: tư liệu 'chèn' chưa dùng → R4 sửa 1 vòng → vẫn thiếu thì đặt dự phòng theo từ khoá khớp lời nói. "
             "Cỡ theo đúng tỉ lệ ảnh, không đè lên mặt, trong vùng an toàn do code bảo đảm."},
    {"id": "_RM_VISUAL_SYSTEM", "group": "remotion", "module": "remotion_plan",
     "title": "R4 (dự phòng) · Chuyển cảnh, hiệu ứng, tông màu",
     "used_in": "Video Remotion — CHỈ chạy khi R4 · Thiết kế lỗi (bản cũ, không có lớp đồ hoạ)",
     "info": "Nhận: timeline + beat + cảm xúc + câu chốt (giờ nguồn) + hook + phong cách video mẫu. Chọn transition "
             "ở chỗ đổi nhịp truyện, hiệu ứng neo theo giờ nguồn (punch zoom, rung, emoji...), tông màu cả video và "
             "chuyển cảnh hook → thân video. Chỉ được dùng id trong danh mục Remotion (tự nối vào cuối prompt)."},
    {"id": "_RM_CAPTION_SYSTEM", "group": "remotion", "module": "remotion_plan",
     "title": "R5 · Caption Remotion",
     "used_in": "Video Remotion — bước Plan (R5)",
     "info": "Hai lớp chữ: phụ đề lời nói chạy liền mạch (karaoke / bật từng chữ / viền đậm...) và chữ nhấn hero ở "
             "khoảnh khắc đắt. Trình duyệt tự xuống dòng nên không bị ràng buộc số ký tự mỗi dòng. Lớp code sau đó "
             "tự tách chữ chồng giờ, tách vùng khi hero và phụ đề hiện cùng lúc, tránh vùng giao diện TikTok che."},
]

REFS = [
    {"id": "remotion-dsl.md", "group": "refs", "title": "Ngôn ngữ dựng Remotion (bố cục + lớp đồ hoạ)",
     "used_in": "Nối vào cuối 'R4 · Thiết kế' và 'Video mẫu · Bóc bộ phong cách'",
     "info": "Mô tả mọi trường GPT được dùng: bố cục scene, ảnh (assets), lớp chữ/hình, font, kiểu vào/ra/lặp, "
             "keyframe, hiệu ứng camera + công thức mẫu. Thêm kiểu mới ở đây mà bộ dựng chưa hỗ trợ thì phần tử "
             "đó bị bỏ khi dựng."},
    {"id": "edit-glossary.md", "group": "refs", "title": "Thuật ngữ edit (55 từ)",
     "used_in": "Nối vào cuối 'R4 · Thiết kế'",
     "info": "Layer, B-roll, Keyframe, J/L-cut, Punch In, Mask, Ease… và mỗi thứ ứng với trường nào trong ngôn ngữ "
             "dựng — để GPT dùng đúng chỗ khi lập kế hoạch."},
]

# ---------------------------------------------------------------------------
# THONG SO (quy tac bang code). id = duong dan trong plan_guard (ten.khoa.chi_so).
# ---------------------------------------------------------------------------
def _r(rid, group, title, info, lo, hi, unit=""):
    return {"id": rid, "group": group, "title": title, "info": info,
            "min": lo, "max": hi, "unit": unit}


RULES = [
    # --- caption
    _r("MIN_CAPTION_SEC", "caption", "Chữ hiện ít nhất",
       "Khi tránh đoạn meme cắt vào, chữ bị cắt đuôi mà còn ngắn hơn mức này thì được dời cả khối ra sau meme; "
       "vẫn không đủ chỗ thì bỏ hẳn (không để lại chữ chớp nhoáng không kịp đọc).", 0.2, 3, "giây"),
    _r("KARAOKE_MAX_WORDS", "caption", "Karaoke — số chữ mỗi lần",
       "Phụ đề karaoke / bật từng chữ chỉ hiện tối đa bấy nhiêu chữ một lúc: nói tới đâu chữ đổi màu tới đó, nói xong "
       "cụm thì cụm tiếp theo hiện ra. Hệ thống tự chia câu theo mốc từng chữ (Whisper), ưu tiên ngắt ở dấu câu / chỗ "
       "ngừng nói và chia đều (7 chữ → 3+2+2, không để 1 chữ lẻ).", 1, 8, "chữ"),
    # --- hook
    _r("HOOK_MIN_SEC", "hook", "Hook ngắn nhất", "Hook ngắn hơn mức này bị coi là lỗi.", 0.5, 10, "giây"),
    _r("HOOK_MAX_SEC", "hook", "Hook dài nhất", "Hook dài hơn mức này sẽ bị cắt ngắn.", 1, 20, "giây"),
    _r("HOOK_IDEAL.0", "hook", "Hook lý tưởng — từ", "Độ dài hook lý tưởng (cận dưới). Dùng khi tự dựng lại hook và khi kiểm tra.", 0.5, 20, "giây"),
    _r("HOOK_IDEAL.1", "hook", "Hook lý tưởng — đến", "Độ dài hook lý tưởng (cận trên).", 0.5, 20, "giây"),
    _r("HOOK_REPEAT_GUARD_SEC", "hook", "Chống lặp hook ở đầu thân", "Nếu hook lấy trong bấy nhiêu giây đầu của thân video thì bị coi là lặp (vừa chiếu xong lại chiếu).", 0, 15, "giây"),
    # --- meme
    _r("MAX_INSERTS", "meme", "Số meme tối đa", "Số meme tối đa trong 1 video; dư sẽ bị bỏ.", 0, 20, "meme"),
    _r("INSERT_MIN_GAP", "meme", "Khoảng cách giữa 2 meme", "2 meme gần nhau hơn mức này → bỏ bớt, tránh đứt mạch video chính.", 0, 20, "giây"),
    _r("INSERT_MIN_SEC", "meme", "Meme đè lên — ngắn nhất", "Độ dài tối thiểu 1 meme đè lên (overlay).", 0.1, 5, "giây"),
    _r("INSERT_MAX_SEC", "meme", "Meme đè lên — dài nhất", "Độ dài tối đa 1 meme đè lên (overlay).", 0.5, 15, "giây"),
    _r("CUTAWAY_MIN_SEC", "meme", "Meme cắt vào — ngắn nhất", "Độ dài tối thiểu 1 meme cắt vào (cutaway, tạm dừng video chính).", 0.1, 5, "giây"),
    _r("CUTAWAY_MAX_SEC", "meme", "Meme cắt vào — dài nhất", "Meme cắt vào ăn thời gian video chính nên phải ngắn.", 0.3, 10, "giây"),
    _r("CUT_SNAP_SEC", "meme", "Bán kính hút về khoảng lặng", "Điểm cắt meme được kéo về khoảng lặng gần nhất trong bán kính này để không cắt giữa từ.", 0, 5, "giây"),
    _r("CUTAWAY_TOTAL_RATIO", "meme", "Tổng thời lượng meme cắt vào", "Tổng thời gian meme cắt vào không vượt tỉ lệ này của video chính (0.18 = 18%).", 0, 1),
    _r("OVERLAY_SILENCE_MARGIN", "meme", "Biên khoảng lặng cho meme đè", "Meme chỉ được đè lên khi nằm gọn trong khoảng lặng, còn dư biên này ở 2 đầu.", 0, 2, "giây"),
    _r("SPEECH_GAP_SEC", "meme", "Khoảng nghỉ tính là 'lặng'", "Hai cụm lời cách nhau ít hơn mức này được coi là liền nhau (không phải khoảng lặng). Ảnh hưởng chỗ cắt meme và hạ SFX khi trùng giọng.", 0, 2, "giây"),
    # --- sfx
    _r("MAX_SFX", "sfx", "Số SFX tối đa", "Số SFX tối đa trong 1 video; dư sẽ bị bỏ.", 0, 30, "SFX"),
    _r("MUSIC_VOICE_PCT", "sfx", "Nhạc nền so với tiếng người",
       "Quy tắc bước lập kế hoạch: độ lớn nhạc nền = bấy nhiêu % tiếng người nói của CHÍNH video (đo bằng máy; 20% = "
       "nhỏ hơn giọng 14 dB). Nhạc bắt đầu sau hook, nhỏ hẳn khi meme cắt vào, fade 2 đầu. Áp dụng cả khi mở lại dự án cũ.",
       5, 60, "%"),
    _r("SFX_MIN_GAP", "sfx", "Khoảng cách giữa 2 SFX", "2 SFX gần nhau hơn mức này → bỏ bớt.", 0, 10, "giây"),
    _r("SFX_VOL_MIN", "sfx", "Âm lượng SFX thấp nhất", "Sàn âm lượng sau khi tự tính (1 = 100%).", 0, 2),
    _r("SFX_VOL_MAX", "sfx", "Âm lượng SFX cao nhất", "Trần âm lượng sau khi tự tính (bản Remotion kẹp lại tối đa 1 = 100% khi dựng).", 0.1, 2),
    _r("SFX_DUCK_OVER_SPEECH", "sfx", "Hạ SFX khi đang có lời", "SFX rơi đúng lúc người nói → nhân âm lượng với hệ số này để lùi sau giọng.", 0, 1.5, "×"),
    _r("SFX_HOOK_BOOST", "sfx", "Tăng SFX đầu tiên ở hook", "SFX đầu tiên trong hook được nhân hệ số này.", 0.5, 2, "×"),
    _r("SFX_REPEAT_DECAY", "sfx", "Giảm khi lặp cùng 1 tiếng", "Cùng một tiếng lặp lại → mỗi lần nhân hệ số này (đỡ nhàm tai).", 0.1, 1.5, "×"),
    _r("SFX_CROWD_DECAY", "sfx", "Giảm khi 2 SFX sát nhau", "Hai SFX cách nhau dưới 'Cửa sổ sát nhau' → cái sau nhân hệ số này.", 0.1, 1.5, "×"),
    _r("SFX_CROWD_SEC", "sfx", "Cửa sổ sát nhau", "Hai SFX trong khoảng này coi là sát nhau.", 0, 10, "giây"),
    _r("SFX_LOUD_MARK", "sfx", "Ngưỡng 'tiếng to'", "SFX có âm lượng trên mức này coi là tiếng to.", 0.1, 2),
    _r("SFX_LOUD_EVERY_SEC", "sfx", "Giãn cách tiếng to", "Mỗi khoảng bấy nhiêu giây chỉ cho 1 tiếng to; tiếng to khác bị hạ.", 0, 60, "giây"),
]
for _fam, _lbl in (("impact", "Tiếng dằn/boom"), ("comedy", "Tiếng hài/meme"), ("whoosh", "Whoosh chuyển cảnh"),
                   ("crowd", "Vỗ tay/đám đông"), ("ui", "Tiếng UI (ding/pop)"), ("riser", "Riser/nền"),
                   ("neutral", "Không xếp loại được")):
    RULES.append(_r("SFX_MIX.%s.lufs" % _fam, "sfx", "%s — độ to mục tiêu" % _lbl,
                    "Độ to mục tiêu (LUFS momentary max) cho loại tiếng này khi đo được file. Càng gần 0 càng to. "
                    "Giọng nói talking-head thường khoảng -14..-10.", -40, 0, "LUFS"))
    RULES.append(_r("SFX_MIX.%s.vol" % _fam, "sfx", "%s — âm lượng dự phòng" % _lbl,
                    "Âm lượng dùng khi KHÔNG đo được độ to file (thiếu ffmpeg / file cũ).", 0, 2))

# Cap phai dung thu tu: (id_nho, id_lon, thong bao)
PAIRS = [
    ("HOOK_MIN_SEC", "HOOK_MAX_SEC", "Hook ngắn nhất phải ≤ hook dài nhất"),
    ("HOOK_IDEAL.0", "HOOK_IDEAL.1", "Hook lý tưởng: 'từ' phải ≤ 'đến'"),
    ("HOOK_MIN_SEC", "HOOK_IDEAL.0", "Hook lý tưởng phải nằm trong khoảng ngắn nhất – dài nhất"),
    ("HOOK_IDEAL.1", "HOOK_MAX_SEC", "Hook lý tưởng phải nằm trong khoảng ngắn nhất – dài nhất"),
    ("INSERT_MIN_SEC", "INSERT_MAX_SEC", "Meme đè lên: ngắn nhất phải ≤ dài nhất"),
    ("CUTAWAY_MIN_SEC", "CUTAWAY_MAX_SEC", "Meme cắt vào: ngắn nhất phải ≤ dài nhất"),
    ("SFX_VOL_MIN", "SFX_VOL_MAX", "Âm lượng SFX thấp nhất phải ≤ cao nhất"),
]

_PROMPT_BY_ID = {p["id"]: p for p in PROMPTS}
_REF_BY_ID = {r["id"]: r for r in REFS}
_RULE_BY_ID = {r["id"]: r for r in RULES}


# ---------------------------------------------------------------------------
# DOC / GHI FILE
# ---------------------------------------------------------------------------
def _empty():
    return {"version": 1, "prompts": {}, "refs": {}, "rules": {}}


def load():
    """Doc file ghi de (cache theo mtime). Loi/khong co file -> rong."""
    try:
        st = os.stat(OVERRIDES_PATH)
        stamp = (st.st_mtime_ns, st.st_size)
    except OSError:
        stamp = None
    with _LOCK:
        if stamp is not None and stamp == _CACHE["stamp"] and _CACHE["data"] is not None:
            return _CACHE["data"]
        data = _empty()
        if stamp is not None:
            try:
                with open(OVERRIDES_PATH, encoding="utf-8") as f:
                    raw = json.load(f)
                if isinstance(raw, dict):
                    for k in ("prompts", "refs", "rules"):
                        if isinstance(raw.get(k), dict):
                            data[k] = raw[k]
            except Exception:
                pass
        _CACHE["stamp"], _CACHE["data"] = stamp, data
        return data


def _write(data):
    os.makedirs(os.path.dirname(OVERRIDES_PATH), exist_ok=True)
    data = dict(data, version=1, updated_at=time.strftime("%Y-%m-%dT%H:%M:%S"))
    tmp = OVERRIDES_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, OVERRIDES_PATH)
    with _LOCK:
        _CACHE["stamp"], _CACHE["data"] = None, None


def fingerprint():
    """Van tay cua prompt / tai lieu / thong so DANG CO HIEU LUC — dua vao khoa cache tung buoc
    de sua prompt xong thi cac buoc B1..B7 chay lai that, khong tra ket qua cu.

    Tinh ca prompt MAC DINH trong code (khong chi phan user sua): truoc 2026-09-27 chi tinh phan
    sua -> doi prompt mac dinh (vd B1 'giu nguyen kich ban') ma lap plan lai du an cu van tra ket
    qua B1 cu tu cache."""
    d = load()
    eff = {}
    for p in PROMPTS:
        if p.get("own_key"):
            # prompt chi dung khi co tu lieu nguoi dung, da nam trong khoa RIENG cua buoc dung no
            # (user_media.key_view / cache phan tich theo noi dung file) -> them / sua no khong lam
            # cache moi buoc B1..B7 cua moi du an chay lai
            continue
        try:
            eff[p["id"]] = get_prompt(p["id"], default_prompt(p["id"]))
        except Exception:
            eff[p["id"]] = (d.get("prompts") or {}).get(p["id"])
    refs = {r["id"]: get_ref(r["id"]) for r in REFS}
    blob = json.dumps({"prompts": eff, "refs": refs, "rules": d.get("rules")},
                      ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


# ---------------------------------------------------------------------------
# PROMPT
# ---------------------------------------------------------------------------
def _unescape_template(s):
    """Ban goc cua prompt template viet kieu str.format ({{ }}). Nguoi dung thay/sua
    ban 'tu nhien' voi dau ngoac don; khi chay thi thay {ten} bang render()."""
    return s.replace("{{", "{").replace("}}", "}")


def _providers():
    import providers
    return providers


def default_prompt(pid):
    meta = _PROMPT_BY_ID[pid]
    # Prompt khong nam trong providers.py (vd luong Remotion) khai "module"
    mod = importlib.import_module(meta["module"]) if meta.get("module") else _providers()
    raw = getattr(mod, pid)
    return _unescape_template(raw) if meta.get("template") else raw


def get_prompt(pid, default=None):
    """Prompt dang co hieu luc. `default` = hang so goc trong providers (khong phai template)."""
    ov = load()["prompts"].get(pid)
    if isinstance(ov, str) and ov.strip():
        return ov
    if default is not None:
        return default
    return default_prompt(pid)


def render(pid, **values):
    """Prompt template: thay {ten} bang tai lieu, MOT luot (khong thay long nhau)."""
    text = get_prompt(pid, default_prompt(pid))
    names = "|".join(re.escape(k) for k in values)
    if not names:
        return text
    return re.sub(r"\{(%s)\}" % names, lambda m: str(values[m.group(1)]), text)


# ---------------------------------------------------------------------------
# TAI LIEU
# ---------------------------------------------------------------------------
def default_ref(rid):
    path = os.path.join(REFS_DIR, rid)
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def get_ref(rid):
    ov = load()["refs"].get(rid)
    if isinstance(ov, str) and ov.strip():
        return ov
    return default_ref(rid)


# ---------------------------------------------------------------------------
# THONG SO
# ---------------------------------------------------------------------------
def default_rule(rid):
    return plan_guard.rule_default(rid)


def _is_int_rule(rid):
    return isinstance(default_rule(rid), int) and not isinstance(default_rule(rid), bool)


def rule_value(rid):
    """Gia tri dang co hieu luc (da sua hoac mac dinh)."""
    ov = load()["rules"].get(rid)
    if ov is not None:
        try:
            return _coerce_rule(rid, ov)
        except ValueError:
            pass
    return default_rule(rid)


def rule_overridden(rid):
    return rid in load()["rules"]


def _coerce_rule(rid, value):
    meta = _RULE_BY_ID[rid]
    if isinstance(value, bool):
        raise ValueError("%s: phải là số" % meta["title"])
    try:
        v = float(value)
    except (TypeError, ValueError):
        raise ValueError("%s: phải là số" % meta["title"])
    if math.isnan(v) or math.isinf(v):
        raise ValueError("%s: phải là số hợp lệ" % meta["title"])
    if _is_int_rule(rid):
        if abs(v - round(v)) > 1e-9:
            raise ValueError("%s: phải là số nguyên" % meta["title"])
        v = int(round(v))
    if v < meta["min"] or v > meta["max"]:
        raise ValueError("%s: phải trong khoảng %s – %s" % (meta["title"], meta["min"], meta["max"]))
    return v


def _check_pairs(effective):
    for lo, hi, msg in PAIRS:
        if effective[lo] > effective[hi] + 1e-9:
            raise ValueError(msg)


# ---------------------------------------------------------------------------
# API cho server
# ---------------------------------------------------------------------------
def listing():
    """Toan bo muc cho menu "Prompt & quy tac" (ban goc + ban dang dung + da sua chua)."""
    d = load()
    prompts = []
    for p in PROMPTS:
        dflt = default_prompt(p["id"])
        cur = d["prompts"].get(p["id"])
        prompts.append(dict(p, default=dflt, value=cur if isinstance(cur, str) and cur.strip() else dflt,
                            overridden=isinstance(cur, str) and bool(cur.strip())))
    refs = []
    for r in REFS:
        dflt = default_ref(r["id"])
        cur = d["refs"].get(r["id"])
        refs.append(dict(r, default=dflt, value=cur if isinstance(cur, str) and cur.strip() else dflt,
                         overridden=isinstance(cur, str) and bool(cur.strip())))
    rules = []
    for r in RULES:
        rules.append(dict(r, default=default_rule(r["id"]), value=rule_value(r["id"]),
                          overridden=rule_overridden(r["id"]), integer=_is_int_rule(r["id"])))
    return {"groups": GROUPS, "prompts": prompts, "refs": refs, "rules": rules,
            "mechanisms": mechanisms(), "path": OVERRIDES_PATH}


def save(kind, rid, value):
    """Luu 1 muc. kind: prompt|ref|rule. Tra ve muc sau khi luu (hoac raise ValueError)."""
    data = copy.deepcopy(load())
    if kind == "prompt":
        meta = _PROMPT_BY_ID.get(rid)
        if not meta:
            raise ValueError("Không có prompt '%s'" % rid)
        text = value if isinstance(value, str) else ""
        if not text.strip():
            raise ValueError("Prompt không được để trống. Muốn quay về bản gốc hãy bấm 'Khôi phục mặc định'.")
        for ph in meta.get("template") or []:
            if "{%s}" % ph not in text:
                raise ValueError("Phải giữ nguyên chỗ {%s} — hệ thống chèn tài liệu vào đó." % ph)
        if text == default_prompt(rid):
            data["prompts"].pop(rid, None)
        else:
            data["prompts"][rid] = text
    elif kind == "ref":
        if rid not in _REF_BY_ID:
            raise ValueError("Không có tài liệu '%s'" % rid)
        text = value if isinstance(value, str) else ""
        if not text.strip():
            raise ValueError("Tài liệu không được để trống. Muốn quay về bản gốc hãy bấm 'Khôi phục mặc định'.")
        if text == default_ref(rid):
            data["refs"].pop(rid, None)
        else:
            data["refs"][rid] = text
    elif kind == "rule":
        if rid not in _RULE_BY_ID:
            raise ValueError("Không có thông số '%s'" % rid)
        v = _coerce_rule(rid, value)
        effective = {r["id"]: rule_value(r["id"]) for r in RULES}
        effective[rid] = v
        _check_pairs(effective)
        if v == default_rule(rid):
            data["rules"].pop(rid, None)
        else:
            data["rules"][rid] = v
    else:
        raise ValueError("Loại không hợp lệ: %s" % kind)
    _write(data)
    plan_guard.apply_overrides(force=True)
    return True


def save_rules(values):
    """Luu nhieu thong so mot lan (kiem tra cap min/max tren TOAN BO gia tri moi)."""
    data = copy.deepcopy(load())
    effective = {r["id"]: rule_value(r["id"]) for r in RULES}
    clean = {}
    for rid, value in (values or {}).items():
        if rid not in _RULE_BY_ID:
            raise ValueError("Không có thông số '%s'" % rid)
        clean[rid] = _coerce_rule(rid, value)
    effective.update(clean)
    _check_pairs(effective)
    for rid, v in clean.items():
        if v == default_rule(rid):
            data["rules"].pop(rid, None)
        else:
            data["rules"][rid] = v
    _write(data)
    plan_guard.apply_overrides(force=True)
    return True


def reset(kind, rid):
    data = copy.deepcopy(load())
    key = {"prompt": "prompts", "ref": "refs", "rule": "rules"}.get(kind)
    if not key:
        raise ValueError("Loại không hợp lệ: %s" % kind)
    if kind == "rule":
        effective = {r["id"]: rule_value(r["id"]) for r in RULES}
        effective[rid] = default_rule(rid)
        _check_pairs(effective)
    data[key].pop(rid, None)
    _write(data)
    plan_guard.apply_overrides(force=True)
    return True


# ---------------------------------------------------------------------------
# CO CHE (chi xem)
# ---------------------------------------------------------------------------
def mechanisms():
    return [
        {"id": "flow", "title": "Luồng tổng thể",
         "info": "Thứ tự các bước từ lúc thả video tới khi có MP4 (menu Video Remotion).",
         "body": "1. Hiểu nguồn — video được nén 720p (giữ tiếng) rồi gửi Gemini (API hoặc Antigravity CLI bằng tài khoản "
                 "Google); bản nén vẫn > 20 MB thì cắt nhiều phần THEO DUNG LƯỢNG (cắt ở chỗ im lặng, chồng lấn ~5s), "
                 "Gemini xem từng phần song song rồi hệ thống ghép lại + 1 lượt AI viết lại tóm tắt. → source brief "
                 "(transcript, cảm xúc, khoảnh khắc); Whisper căn lại giờ lời nói. Kết quả tự lưu vào thư viện phân "
                 "tích để lần sau dùng lại.\n"
                 "2. Video mẫu (tuỳ chọn) — máy đo nhịp cắt + độ to bằng ffmpeg; Gemini xem + nghe video mẫu để "
                 "phân tích phong cách, rồi xem dải khung dày để bóc bộ phong cách (style_kit) — lưu KÈM video mẫu đó trong "
                 "thư viện, chọn lại video mẫu thì dùng lại. App KHÔNG có phong cách mặc định: không dùng video mẫu thì "
                 "mỗi video được AI thiết kế riêng theo nội dung.\n"
                 "3. Plan — mỗi bước 1 prompt riêng:\n"
                 "   B1 chất liệu & câu chuyện → B2 timeline → (hệ thống kéo điểm cắt về ranh giới câu) → "
                 "B3 hook → R4 thiết kế (bố cục + lớp đồ hoạ + chuyển cảnh + màu) → tạo ảnh (AI / khung nguồn / "
                 "tách nền) → R5 phụ đề → FX hiệu ứng AI tự đề xuất theo bối cảnh + tự viết code (kiểm trong hộp cách ly) "
                 "song song chữ ảnh AI → B6 meme → B7 SFX.\n"
                 "   Câu chuyện (story_arc, tone, beat) của B1 + phần video mẫu liên quan đi vào mọi bước; "
                 "các bước sau nhận kết quả cần thiết của bước trước (xem mục 'Luồng thông tin').\n"
                 "4. Hệ thống tự: đổi sfx_id/meme_id thành file thật, gắn caption cho hook, dựng bản Remotion "
                 "(build_spec + plan_guard) — xem mục 'Lớp bảo vệ'.\n"
                 "5. Xem trước bằng trình phát Remotion trong app → Render MP4 1080×1920."},
        {"id": "info_flow", "title": "Luồng thông tin giữa các bước",
         "info": "Mỗi bước nhận gì, từ đâu, và trả ra gì cho bước sau.",
         "body": "Nguồn chung: Gemini (lời thoại, cảm xúc, khoảnh khắc, vùng mặt) · video mẫu · yêu cầu edit.\n\n"
                 "B1 Chất liệu & câu chuyện\n"
                 "  Nhận: tóm tắt + cảm xúc + khoảnh khắc + LỜI THOẠI từng video · video mẫu · yêu cầu edit\n"
                 "  Trả: toàn bộ kịch bản theo thứ tự gốc (chỉ bỏ im lặng/tiếng đệm/câu lặp) + story_arc + tone + "
                 "beat từng đoạn  → 'câu chuyện'\n"
                 "  Nhiều video: thứ tự video theo nội dung (thu_tu_video), đoạn nói lại giữa 2 video chỉ giữ 1 lần\n"
                 "  Hệ thống: kiểm thu_tu_video, ép thứ tự trong từng video, bỏ câu trùng ở chỗ nối 2 video, "
                 "ghi nhật ký các câu bị bỏ\n"
                 "B2 Timeline\n"
                 "  Nhận: đoạn chọn + lời thoại trong từng đoạn · câu chuyện · nhịp cắt video mẫu\n"
                 "  Trả: segments (giờ nguồn ↔ giờ timeline, beat/purpose)\n"
                 "  Hệ thống: gắn beat còn thiếu, ép thứ tự gốc, kéo điểm cắt giữa câu về ranh giới câu, nối liền timeline\n"
                 "B3 Hook\n"
                 "  Nhận: timeline · câu chuyện · lời thoại/cảm xúc CHỈ phần còn trên timeline · cách mở của video mẫu · "
                 "gợi ý chuyển cảnh Remotion\n"
                 "  Trả: đoạn hook (BẢN SAO đặt lên đầu — thân video vẫn nói lại đủ đoạn đó) + caption hook  → 'hook' cho các bước sau\n"
                 "R4 Thiết kế\n"
                 "  Nhận: timeline + beat + cảm xúc + câu chốt · câu chuyện · hook · vị trí mặt · bộ phong cách VIDEO "
                 "MẪU (nếu có — không có thì tự thiết kế theo nội dung) · ngôn ngữ dựng video mẫu\n"
                 "  Trả: scenes (bố cục), layers (lớp đồ hoạ), assets (ảnh cần tạo), chuyển cảnh, tông màu "
                 "(hiệu ứng hình để bước FX làm)\n"
                 "R5 Phụ đề\n"
                 "  Nhận: timeline + lời thoại + khoảnh khắc + vùng mặt · câu chuyện · hook · chữ video mẫu · "
                 "lớp chữ đồ hoạ R4 (để không viết trùng)\n"
                 "  Trả: captions (phụ đề lời nói + chữ hero)\n"
                 "FX Hiệu ứng tự viết (FX-plan → FX-code)\n"
                 "  Nhận: bối cảnh TỪNG khoảnh khắc (lời nói, cảm xúc, sự kiện, bố cục + chữ đang trên màn hình, "
                 "vị trí mặt, hook) · câu chuyện · phong cách phiên\n"
                 "  Trả: fx (hiệu ứng kèm bối cảnh → mục tiêu → vì sao hợp + code đã kiểm trong hộp cách ly)\n"
                 "Chữ ảnh AI (song song FX)\n"
                 "  Nhận: các cụm chữ nổi bật (lớp chữ R4, chữ hero, chữ hook) · phong cách phiên\n"
                 "  Trả: text_art (ảnh từng tầng chữ + vị trí từng từ); lỗi thì giữ chữ vẽ bằng code\n"
                 "B6 Meme\n"
                 "  Nhận: timeline + lời thoại còn trên timeline · câu chuyện/tone · hook · chữ hero (R5) · "
                 "mức b-roll video mẫu · kho meme\n"
                 "  Trả: inserts\n"
                 "B7 SFX\n"
                 "  Nhận: timeline · câu chuyện · hook + hiệu ứng hình của hook · chuyển cảnh (R4) · chữ hero "
                 "(R5 + lớp chữ R4) · meme (B6) · kiểu SFX video mẫu · kho SFX\n"
                 "  Trả: audio\n\n"
                 "Sau đó: ghép plan (kèm story_arc/tone trong _pipeline) → dựng bản Remotion (build_spec).\n"
                 "Mọi đầu vào nằm trong 'vân tay' cache của bước đó: đổi đầu vào nào thì bước đó chạy lại thật."},
        {"id": "guard", "title": "Lớp bảo vệ plan (build_spec + plan_guard)",
         "info": "Chạy bằng code, không gọi AI, mỗi lần dựng bản Remotion từ plan.",
         "body": "• Quy đổi giờ trong file gốc sang giờ trên timeline cho caption/SFX/meme/lớp đồ hoạ.\n"
                 "• Dựng hook lên đầu, cắt meme vào khoảng lặng, giới hạn số SFX/meme và giãn cách.\n"
                 "• Tự tính âm lượng SFX theo loại tiếng + LUFS đo được.\n"
                 "• Chữ của video chính không chạy đè lên đoạn meme cắt vào.\n"
                 "• Chuyển cảnh cần chất liệu hai bên — thiếu thì đổi sang kiểu cắt.\n"
                 "• Bám phụ đề vào giờ từng chữ của Whisper; lớp đồ hoạ né mặt người.\n"
                 "Các con số chính chỉnh được trong các nhóm 'Quy tắc …'."},
        {"id": "cache", "title": "Nhớ kết quả từng bước",
         "info": "Mỗi bước (B1, B2, B3, R4, R5, FX, chữ ảnh AI, B6, B7) được lưu theo 'vân tay' đầu vào "
                 "(~/.capcut-studio/cache/steps, 48 giờ).",
         "body": "Chạy lại với cùng đầu vào sẽ lấy kết quả cũ (miễn phí, tức thì). Vân tay gồm: dữ liệu đầu vào, "
                 "model/kết nối GPT, VÀ toàn bộ prompt/quy tắc bạn đã sửa ở menu này — nên sửa xong bấm lập plan "
                 "là các bước chạy lại thật với prompt mới. Nút 'Lập lại plan' bỏ qua bộ nhớ này."},
        {"id": "catalog", "title": "Danh mục tự nối vào prompt",
         "info": "Phần này hệ thống tự thêm vào cuối prompt, không nằm trong nội dung bạn sửa.",
         "body": "• B3: vài chuyển cảnh trong danh mục Remotion hợp với hook.\n"
                 "• R4: danh mục Remotion (chuyển cảnh, hiệu ứng, tông màu, kiểu chữ, font) + tài liệu ngôn ngữ dựng "
                 "+ thuật ngữ edit + ghi chú 'không khai hiệu ứng hình — bước FX làm'.\n"
                 "• FX-plan / FX-code: luật hook + quy tắc code và API được phép của hộp cách ly.\n"
                 "• R5: cùng danh mục Remotion (dùng phần kiểu chữ, font, màu nhấn).\n"
                 "• B6: danh mục meme trong Kho meme (id, tên, emotion, use_when, reaction, avoid_when…).\n"
                 "• B7: danh mục SFX trong Kho âm thanh (id, tên, emotion, use_when).\n"
                 "• Hiểu nguồn: danh sách video (id, tên, thời lượng). Video mẫu: số đo ffmpeg + ảnh lưới khung hình.\n"
                 "• Dữ liệu đầu vào (brief, timeline, transcript…) luôn gửi ở tin nhắn user dạng JSON."},
    ]
