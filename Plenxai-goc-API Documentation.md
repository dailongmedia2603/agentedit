OpenAI GPT Image 2 — tạo ảnh chất lượng cao

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`prompt`|string|Bắt buộc|Mô tả văn bản nội dung mong muốn.|
|`model`|string|Bắt buộc|ID model đã chọn: `gpt-image-2`|
|`resolution`|string|Tùy chọn|Cho phép: 'low', 'medium', 'high'. Mặc định: 'low'|
|`aspect_ratio`|string|Tùy chọn|Cho phép: '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'|
|`references_urls`|string\[\]|Tùy chọn|URLs ảnh tham khảo (tối đa 3)|
|`negative_prompt`|string|Tùy chọn|Những gì không muốn xuất hiện trong ảnh|
|`server`|string|Tùy chọn|Server slug: 'vip-01', 'business'. Ảnh hưởng routing + cost.|

`vip-01``business`default

#### Ví dụ request cho GPT Image 2

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/image \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cinematic shot of a sunset over mountains",
    "model": "gpt-image-2",
    "resolution": "low",
    "aspect_ratio": "16:9",
    "references_urls": ["https://example.com/style.jpg"]
  }'
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "task_id": "abc123-def456-...",
  "status": "queued",
  "message": "Image generation queued successfully."
}
```

------------------------------------------------------------------------------------------------

Google Image Gen 4 (Imagen 3.5)

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`prompt`|string|Bắt buộc|Mô tả văn bản nội dung mong muốn.|
|`model`|string|Bắt buộc|ID model đã chọn: `imagen-3-5`|
|`resolution`|string|Tùy chọn|Cho phép: '1k', '2k', '4k'. Mặc định: '1k'|
|`aspect_ratio`|string|Tùy chọn|Cho phép: '1:1', '4:3', '16:9', '9:16', '3:4'|
|`negative_prompt`|string|Tùy chọn|Những gì không muốn xuất hiện trong ảnh|

`fast`default

#### Ví dụ request cho Image Gen 4

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/image \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cinematic shot of a sunset over mountains",
    "model": "imagen-3-5",
    "resolution": "1k",
    "aspect_ratio": "16:9"
  }'
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "task_id": "abc123-def456-...",
  "status": "queued",
  "message": "Image generation queued successfully."
}
```

------------------------------------------------------------------------------------------------

nano-banana-2

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`prompt`|string|Bắt buộc|Mô tả văn bản nội dung mong muốn.|
|`model`|string|Bắt buộc|ID model đã chọn: `nano-banana-2`|
|`resolution`|string|Tùy chọn|Cho phép: '1k', '2k', '4k'. Mặc định: '1k'|
|`aspect_ratio`|string|Tùy chọn|Cho phép: 'Auto', '1:1', '4:3', '16:9', '21:9', '3:2', '9:16', '3:4'|
|`references_urls`|string\[\]|Tùy chọn|URLs ảnh tham khảo (tối đa 8)|
|`negative_prompt`|string|Tùy chọn|Những gì không muốn xuất hiện trong ảnh|

`vip-01`default

#### Ví dụ request cho Nano Banana 2

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/image \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cinematic shot of a sunset over mountains",
    "model": "nano-banana-2",
    "resolution": "1k",
    "aspect_ratio": "16:9",
    "references_urls": ["https://example.com/style.jpg"]
  }'
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "task_id": "abc123-def456-...",
  "status": "queued",
  "message": "Image generation queued successfully."
}
```


------------------------------------------------------------------------------------------------

nano-banana-pro

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`prompt`|string|Bắt buộc|Mô tả văn bản nội dung mong muốn.|
|`model`|string|Bắt buộc|ID model đã chọn: `nano-banana-pro`|
|`resolution`|string|Tùy chọn|Cho phép: '1k', '2k', '4k'. Mặc định: '1k'|
|`aspect_ratio`|string|Tùy chọn|Cho phép: 'Auto', '1:1', '4:3', '3:4', '9:16', '16:9'|
|`references_urls`|string\[\]|Tùy chọn|URLs ảnh tham khảo (tối đa 8)|
|`negative_prompt`|string|Tùy chọn|Những gì không muốn xuất hiện trong ảnh|

`vip-01`default

#### Ví dụ request cho Nano Banana PRO

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/image \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cinematic shot of a sunset over mountains",
    "model": "nano-banana-pro",
    "resolution": "1k",
    "aspect_ratio": "16:9",
    "references_urls": ["https://example.com/style.jpg"]
  }'
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "task_id": "abc123-def456-...",
  "status": "queued",
  "message": "Image generation queued successfully."
}
```


------------------------------------------------------------------------------------------------

Seedream 4.5 image generation

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`prompt`|string|Bắt buộc|Mô tả văn bản nội dung mong muốn.|
|`model`|string|Bắt buộc|ID model đã chọn: `seedream-4-5`|
|`resolution`|string|Tùy chọn|Cho phép: '2k', '1k'. Mặc định: '2k'|
|`aspect_ratio`|string|Tùy chọn|Cho phép: '1:1', '4:3', '3:4', '2:3', '21:9', '4:5', '5:4', '9:16', '16:9', '3:2'|
|`negative_prompt`|string|Tùy chọn|Những gì không muốn xuất hiện trong ảnh|
|`server`|string|Tùy chọn|Server slug: 'vip-01', 'business'. Ảnh hưởng routing + cost.|

`vip-01`default`business`

#### Ví dụ request cho Seedream 4.5

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/image \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cinematic shot of a sunset over mountains",
    "model": "seedream-4-5",
    "resolution": "2k",
    "aspect_ratio": "16:9"
  }'
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "task_id": "abc123-def456-...",
  "status": "queued",
  "message": "Image generation queued successfully."
}
```


------------------------------------------------------------------------------------------------

T2V & I2V với Omni References (images, videos, audios) — Google Veo 3.1 tốc độ nhanh

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`prompt`|string|Bắt buộc|Mô tả nội dung video mong muốn|
|`model`|string|Tùy chọn|Cho phép: 'veo-3.1-fast', 'seedance-2.0', 'seedance-2.0-pro', 'kling-3-omni-video', 'omni-flash-video'. Mặc định: 'seedance-2.0'|
|`reference_images`|string\[\]|Bắt buộc|URLs ảnh tham khảo bổ sung (tối đa 3). Bắt buộc ít nhất 1 ảnh cho R2V mode|
|`reference_videos`|string\[\]|Tùy chọn|URLs video tham khảo cho motion/style guidance|
|`reference_audios`|string\[\]|Tùy chọn|URLs audio tham khảo (hỗ trợ trong tương lai)|
|`duration`|int|Tùy chọn|Thời lượng (giây). Cho phép: 4s, 6s, 8s. Mặc định: 4s|
|`aspect_ratio`|string|Tùy chọn|Cho phép: '16:9', '9:16'. Mặc định: '16:9'|
|`resolution`|string|Tùy chọn|Cho phép: '720p', '1080p', '4K'. Mặc định: '720p'|
|`generate_audio`|boolean|Tùy chọn|Tạo âm thanh cho video. Mặc định: true|

`vip-01`default

#### Ví dụ R2V (Reference-to-Video) — nhiều ảnh tham chiếu

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/video-omni \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cinematic product showcase with smooth camera movement",
    "model": "veo-3.1-fast",
    "reference_images": ["https://example.com/product-front.jpg", "https://example.com/product-side.jpg"],
    "reference_videos": ["https://example.com/style-reference.mp4"],
    "duration": 4,
    "aspect_ratio": "16:9",
    "resolution": "720p"
  }'
```

#### Ví dụ R2V — 1 ảnh tham chiếu

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/video-omni \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "The character turns around and smiles at the camera",
    "model": "veo-3.1-fast",
    "reference_images": ["https://example.com/character.jpg"],
    "duration": 4,
    "aspect_ratio": "16:9",
    "resolution": "720p"
  }'
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "task_id": "vo-abc123-...",
  "status": "queued",
  "message": "Video Omni (veo-3.1-fast) queued successfully."
}
```



------------------------------------------------------------------------------------------------

Text to Video / IMG to Video — Video tiết kiệm credits (veo-3-relaxed)

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`prompt`|string|Bắt buộc|Mô tả văn bản nội dung mong muốn.|
|`model`|string|Bắt buộc|ID model đã chọn: `veo-3-relaxed`|
|`mode`|string|Tùy chọn|Cho phép: 't2v', 'i2v'. t2v = Text-to-Video. i2v = Image-to-Video.|
|`duration`|int|Tùy chọn|Thời lượng (giây). Cho phép: 4s, 6s, 8s.|
|`quality`|string|Tùy chọn|Cho phép: '720p', '1080p', '4K'. Mặc định: '720p'|
|`aspect_ratio`|string|Tùy chọn|Cho phép: '16:9', '9:16'|
|`start_image_url`|string|Tùy chọn|URL ảnh Start Frame cho I2V mode|
|`end_image_url`|string|Tùy chọn|URL ảnh End Frame cho I2V mode (Kling, Veo3)|

`vip-01`default

#### Ví dụ request cho Veo 3 Relaxed

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/video \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cat playing with a ball in slow motion",
    "model": "veo-3-relaxed",
    "mode": "t2v",
    "aspect_ratio": "16:9",
    "duration": 4,
    "quality": "720p"
  }'
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "task_id": "vid-987654-...",
  "status": "queued",
  "message": "Video generation queued successfully."
}
```



------------------------------------------------------------------------------------------------


Text to Video / IMG to Video — Video chất lượng cao (veo-3-quality)

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`prompt`|string|Bắt buộc|Mô tả văn bản nội dung mong muốn.|
|`model`|string|Bắt buộc|ID model đã chọn: `veo-3-quality`|
|`mode`|string|Tùy chọn|Cho phép: 't2v', 'i2v'. t2v = Text-to-Video. i2v = Image-to-Video.|
|`duration`|int|Tùy chọn|Thời lượng (giây). Cho phép: 4s, 6s, 8s.|
|`quality`|string|Tùy chọn|Cho phép: '720p', '1080p', '4K'. Mặc định: '720p'|
|`aspect_ratio`|string|Tùy chọn|Cho phép: '16:9', '9:16'|
|`start_image_url`|string|Tùy chọn|URL ảnh Start Frame cho I2V mode|
|`end_image_url`|string|Tùy chọn|URL ảnh End Frame cho I2V mode (Kling, Veo3)|

`vip-01`default

#### Ví dụ request cho Veo 3 Quality

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/video \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cat playing with a ball in slow motion",
    "model": "veo-3-quality",
    "mode": "t2v",
    "aspect_ratio": "16:9",
    "duration": 4,
    "quality": "720p"
  }'
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "task_id": "vid-987654-...",
  "status": "queued",
  "message": "Video generation queued successfully."
}
```


------------------------------------------------------------------------------------------------

Text to Video / IMG to Video — Video nhanh (veo-3-fast)

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`prompt`|string|Bắt buộc|Mô tả văn bản nội dung mong muốn.|
|`model`|string|Bắt buộc|ID model đã chọn: `veo-3-fast`|
|`mode`|string|Tùy chọn|Cho phép: 't2v', 'i2v'. t2v = Text-to-Video. i2v = Image-to-Video.|
|`duration`|int|Tùy chọn|Thời lượng (giây). Cho phép: 4s, 6s, 8s.|
|`quality`|string|Tùy chọn|Cho phép: '720p', '1080p', '4K'. Mặc định: '720p'|
|`aspect_ratio`|string|Tùy chọn|Cho phép: '16:9', '9:16'|
|`start_image_url`|string|Tùy chọn|URL ảnh Start Frame cho I2V mode|
|`end_image_url`|string|Tùy chọn|URL ảnh End Frame cho I2V mode (Kling, Veo3)|

`vip-01`default

#### Ví dụ request cho Veo 3 Fast

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/video \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cat playing with a ball in slow motion",
    "model": "veo-3-fast",
    "mode": "t2v",
    "aspect_ratio": "16:9",
    "duration": 4,
    "quality": "720p"
  }'
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "task_id": "vid-987654-...",
  "status": "queued",
  "message": "Video generation queued successfully."
}
```



------------------------------------------------------------------------------------------------

T2V & I2V với Omni References (images, videos, audios) — SeeDance 2.0 video generation

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`prompt`|string|Bắt buộc|Mô tả nội dung video mong muốn|
|`model`|string|Tùy chọn|Cho phép: 'veo-3.1-fast', 'seedance-2.0', 'seedance-2.0-pro', 'kling-3-omni-video', 'omni-flash-video'. Mặc định: 'seedance-2.0'|
|`input_image_url`|string|Tùy chọn|URL ảnh cho I2V mode. Nếu bỏ trống → T2V (text-to-video)|
|`reference_images`|string\[\]|Tùy chọn|URLs ảnh tham khảo bổ sung (tối đa 3). Hướng dẫn style/nội dung|
|`reference_videos`|string\[\]|Tùy chọn|URLs video tham khảo cho motion/style guidance|
|`reference_audios`|string\[\]|Tùy chọn|URLs audio tham khảo (hỗ trợ trong tương lai)|
|`duration`|int|Tùy chọn|Thời lượng (giây). Cho phép: 5s, 8s, 10s, 12s, 15s. Mặc định: 5s|
|`aspect_ratio`|string|Tùy chọn|Cho phép: '9:16', '16:9', '1:1', '21:9'. Mặc định: '16:9'|
|`resolution`|string|Tùy chọn|Cho phép: '720p', '480p'. Mặc định: '720p'|
|`generate_audio`|boolean|Tùy chọn|Tạo âm thanh cho video. Mặc định: true|
|`server`|string|Tùy chọn|Server slug: 'business', 'vip-01'|

`business`default`vip-01`

#### Ví dụ T2V (Text-to-Video)

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/video-omni \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cat playing with a ball in slow motion",
    "model": "seedance-2.0",
    "duration": 5,
    "aspect_ratio": "9:16",
    "resolution": "720p",
    "generate_audio": true
  }'
```

#### Ví dụ I2V (Image-to-Video)

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/video-omni \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Make the character walk forward gracefully",
    "model": "seedance-2.0",
    "input_image_url": "https://example.com/character.jpg",
    "duration": 5,
    "resolution": "720p"
  }'
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "task_id": "vo-abc123-...",
  "status": "queued",
  "message": "Video Omni (seedance-2.0) queued successfully."
}
```



------------------------------------------------------------------------------------------------


T2V & I2V với Omni References (images, videos, audios) — SeeDance 2.0 Pro — chất lượng cao nhất

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`prompt`|string|Bắt buộc|Mô tả nội dung video mong muốn|
|`model`|string|Tùy chọn|Cho phép: 'veo-3.1-fast', 'seedance-2.0', 'seedance-2.0-pro', 'kling-3-omni-video', 'omni-flash-video'. Mặc định: 'seedance-2.0'|
|`input_image_url`|string|Tùy chọn|URL ảnh cho I2V mode. Nếu bỏ trống → T2V (text-to-video)|
|`reference_images`|string\[\]|Tùy chọn|URLs ảnh tham khảo bổ sung (tối đa 3). Hướng dẫn style/nội dung|
|`reference_videos`|string\[\]|Tùy chọn|URLs video tham khảo cho motion/style guidance|
|`reference_audios`|string\[\]|Tùy chọn|URLs audio tham khảo (hỗ trợ trong tương lai)|
|`duration`|int|Tùy chọn|Thời lượng (giây). Cho phép: 5s, 8s, 10s, 12s, 15s. Mặc định: 5s|
|`aspect_ratio`|string|Tùy chọn|Cho phép: '1:1', '9:16', '16:9', '21:9', '4:3', '3:4'. Mặc định: '16:9'|
|`resolution`|string|Tùy chọn|Cho phép: '720p', '1080p', '480p'. Mặc định: '720p'|
|`generate_audio`|boolean|Tùy chọn|Tạo âm thanh cho video. Mặc định: true|
|`server`|string|Tùy chọn|Server slug: 'rw', 'business'|

`rw``business`default

#### Ví dụ T2V (Text-to-Video)

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/video-omni \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cat playing with a ball in slow motion",
    "model": "seedance-2.0-pro",
    "duration": 5,
    "aspect_ratio": "1:1",
    "resolution": "720p",
    "generate_audio": true
  }'
```

#### Ví dụ I2V (Image-to-Video)

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/video-omni \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Make the character walk forward gracefully",
    "model": "seedance-2.0-pro",
    "input_image_url": "https://example.com/character.jpg",
    "duration": 5,
    "resolution": "720p"
  }'
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "task_id": "vo-abc123-...",
  "status": "queued",
  "message": "Video Omni (seedance-2.0-pro) queued successfully."
}
```


------------------------------------------------------------------------------------------------

T2V & I2V với Omni References (images, videos, audios) — Omni Flash R2V — video từ ảnh thành phần (reference images), hỗ trợ tối đa 3 ảnh

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`prompt`|string|Bắt buộc|Mô tả nội dung video mong muốn|
|`model`|string|Tùy chọn|Cho phép: 'veo-3.1-fast', 'seedance-2.0', 'seedance-2.0-pro', 'kling-3-omni-video', 'omni-flash-video'. Mặc định: 'seedance-2.0'|
|`reference_images`|string\[\]|Bắt buộc|URLs ảnh tham khảo bổ sung (tối đa 3). Bắt buộc ít nhất 1 ảnh cho R2V mode|
|`reference_videos`|string\[\]|Tùy chọn|URLs video tham khảo cho motion/style guidance|
|`reference_audios`|string\[\]|Tùy chọn|URLs audio tham khảo (hỗ trợ trong tương lai)|
|`duration`|int|Tùy chọn|Thời lượng (giây). Cho phép: 4s, 6s, 8s, 10s. Mặc định: 4s|
|`aspect_ratio`|string|Tùy chọn|Cho phép: '16:9', '9:16'. Mặc định: '16:9'|
|`resolution`|string|Tùy chọn|Cho phép: '720p', '1080p', '4k'. Mặc định: '720p'|
|`generate_audio`|boolean|Tùy chọn|Tạo âm thanh cho video. Mặc định: true|

`flow`default

#### Ví dụ R2V (Reference-to-Video) — nhiều ảnh tham chiếu

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/video-omni \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cinematic product showcase with smooth camera movement",
    "model": "omni-flash-video",
    "reference_images": ["https://example.com/product-front.jpg", "https://example.com/product-side.jpg"],
    "reference_videos": ["https://example.com/style-reference.mp4"],
    "duration": 4,
    "aspect_ratio": "16:9",
    "resolution": "720p"
  }'
```

#### Ví dụ R2V — 1 ảnh tham chiếu

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/video-omni \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "The character turns around and smiles at the camera",
    "model": "omni-flash-video",
    "reference_images": ["https://example.com/character.jpg"],
    "duration": 4,
    "aspect_ratio": "16:9",
    "resolution": "720p"
  }'
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "task_id": "vo-abc123-...",
  "status": "queued",
  "message": "Video Omni (omni-flash-video) queued successfully."
}
```



------------------------------------------------------------------------------------------------

Kling Motion Control — điều khiển chuyển động video (cần ảnh nhân vật + video tham chiếu)

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`character_image_url`|string|Bắt buộc|URL ảnh nhân vật/người. Nhân vật sẽ được animate theo chuyển động từ video.|
|`video_reference_url`|string|Bắt buộc|URL video tham chiếu chuyển động (nhảy, di chuyển...). Tối đa 30 giây.|
|`model`|string|Tùy chọn|Model: `kling-motion` (v2.6, mặc định) hoặc `kling-motion-30` (v3.0, chất lượng cao hơn)|
|`prompt`|string|Tùy chọn|Mô tả bối cảnh/background bổ sung|
|`resolution`|string|Tùy chọn|Cho phép: '720p', '1080p'. Mặc định: '720p'|
|`character_orientation`|string|Tùy chọn|Cho phép: 'video' (theo tỷ lệ video), 'image' (theo tỷ lệ ảnh). Mặc định: 'video'|
|`original_sound`|boolean|Tùy chọn|Giữ âm thanh gốc từ video tham chiếu. Mặc định: false|
|`server`|string|Tùy chọn|Server slug: 'business', 'cheap'|

`business``cheap`default

#### Ví dụ request

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/motion-control \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "character_image_url": "https://example.com/person.jpg",
    "video_reference_url": "https://example.com/dance.mp4",
    "prompt": "Dancing in a studio with neon lights",
    "resolution": "720p",
    "character_orientation": "video"
  }'
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "task_id": "mc-abc123-...",
  "status": "queued",
  "message": "Motion control video queued successfully."
}
```

Upload ảnh/video trước qua `/developer/media-upload`, rồi dùng URL trả về cho endpoint này. v3.0 cho chất lượng cao hơn v2.6 nhưng tốn nhiều credits hơn.



------------------------------------------------------------------------------------------------

Kling Motion Control 3.0 — chất lượng cao hơn, AI Clone kết hợp ảnh chân dung với video chuyển động

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`character_image_url`|string|Bắt buộc|URL ảnh nhân vật/người. Nhân vật sẽ được animate theo chuyển động từ video.|
|`video_reference_url`|string|Bắt buộc|URL video tham chiếu chuyển động (nhảy, di chuyển...). Tối đa 30 giây.|
|`model`|string|Tùy chọn|Model: `kling-motion` (v2.6, mặc định) hoặc `kling-motion-30` (v3.0, chất lượng cao hơn)|
|`prompt`|string|Tùy chọn|Mô tả bối cảnh/background bổ sung|
|`resolution`|string|Tùy chọn|Cho phép: '1080p', '720p'. Mặc định: '720p'|
|`character_orientation`|string|Tùy chọn|Cho phép: 'video' (theo tỷ lệ video), 'image' (theo tỷ lệ ảnh). Mặc định: 'video'|
|`original_sound`|boolean|Tùy chọn|Giữ âm thanh gốc từ video tham chiếu. Mặc định: false|
|`server`|string|Tùy chọn|Server slug: 'cheap', 'business'|

`cheap`default`business`

#### Ví dụ request

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/motion-control \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kling-motion-30",
    "character_image_url": "https://example.com/person.jpg",
    "video_reference_url": "https://example.com/dance.mp4",
    "prompt": "Dancing in a studio with neon lights",
    "resolution": "720p",
    "character_orientation": "video"
  }'
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "task_id": "mc-abc123-...",
  "status": "queued",
  "message": "Motion control video queued successfully."
}
```

Upload ảnh/video trước qua `/developer/media-upload`, rồi dùng URL trả về cho endpoint này. v3.0 cho chất lượng cao hơn v2.6 nhưng tốn nhiều credits hơn.



------------------------------------------------------------------------------------------------


IMG to Video — Kling 3.0 Pro video chất lượng cao

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`prompt`|string|Bắt buộc|Mô tả văn bản nội dung mong muốn.|
|`model`|string|Bắt buộc|ID model đã chọn: `kling-3.0`|
|`mode`|string|Tùy chọn|Cho phép: 'i2v'. i2v = Image-to-Video.|
|`duration`|int|Tùy chọn|Thời lượng (giây). Cho phép: 3s, 5s, 6s, 7s, 8s, 10s, 12s, 15s.|
|`quality`|string|Tùy chọn|Cho phép: '720p', '1080p'. Mặc định: '720p'|
|`aspect_ratio`|string|Tùy chọn|Cho phép: '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'|
|`start_image_url`|string|Tùy chọn|URL ảnh Start Frame cho I2V mode|
|`end_image_url`|string|Tùy chọn|URL ảnh End Frame cho I2V mode (Kling, Veo3)|
|`server`|string|Tùy chọn|Server slug: 'vip-03', 'cheap', 'business'. Ảnh hưởng routing + cost.|

`vip-03``cheap``business`default

#### Ví dụ request cho Kling 3.0 Pro

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/video \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Make the character dance smoothly",
    "model": "kling-3.0",
    "mode": "i2v",
    "start_image_url": "https://example.com/character.jpg",
    "duration": 3,
    "quality": "720p"
  }'
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "task_id": "vid-987654-...",
  "status": "queued",
  "message": "Video generation queued successfully."
}
```


------------------------------------------------------------------------------------------------

Text to Video / IMG to Video — Kling 3.0 Omni — T2V & I2V, hỗ trợ visual references

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`prompt`|string|Bắt buộc|Mô tả văn bản nội dung mong muốn.|
|`model`|string|Bắt buộc|ID model đã chọn: `kling-3-omni`|
|`mode`|string|Tùy chọn|Cho phép: 't2v', 'i2v'. t2v = Text-to-Video. i2v = Image-to-Video.|
|`duration`|int|Tùy chọn|Thời lượng (giây). Cho phép: 3s, 5s, 6s, 7s, 8s, 10s, 12s, 15s.|
|`quality`|string|Tùy chọn|Cho phép: '720p', '1080p', '4k'. Mặc định: '720p'|
|`aspect_ratio`|string|Tùy chọn|Cho phép: '1:1', '9:16', '4:3', '3:4', '16:9'|
|`start_image_url`|string|Tùy chọn|URL ảnh Start Frame cho I2V mode|
|`end_image_url`|string|Tùy chọn|URL ảnh End Frame cho I2V mode (Kling, Veo3)|
|`server`|string|Tùy chọn|Server slug: 'vip-01', 'business'. Ảnh hưởng routing + cost.|

`vip-01``business`default

#### Ví dụ request cho Kling 3.0 Omni

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/video \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cat playing with a ball in slow motion",
    "model": "kling-3-omni",
    "mode": "t2v",
    "aspect_ratio": "1:1",
    "duration": 3,
    "quality": "720p"
  }'
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "task_id": "vid-987654-...",
  "status": "queued",
  "message": "Video generation queued successfully."
}
```



------------------------------------------------------------------------------------------------

T2V & I2V với Omni References (images, videos, audios) — Kling 3.0 Omni Video với omni references

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`prompt`|string|Bắt buộc|Mô tả nội dung video mong muốn|
|`model`|string|Tùy chọn|Cho phép: 'veo-3.1-fast', 'seedance-2.0', 'seedance-2.0-pro', 'kling-3-omni-video', 'omni-flash-video'. Mặc định: 'seedance-2.0'|
|`input_image_url`|string|Tùy chọn|URL ảnh cho I2V mode. Nếu bỏ trống → T2V (text-to-video)|
|`reference_images`|string\[\]|Tùy chọn|URLs ảnh tham khảo bổ sung (tối đa 3). Hướng dẫn style/nội dung|
|`reference_videos`|string\[\]|Tùy chọn|URLs video tham khảo cho motion/style guidance|
|`reference_audios`|string\[\]|Tùy chọn|URLs audio tham khảo (hỗ trợ trong tương lai)|
|`duration`|int|Tùy chọn|Thời lượng (giây). Cho phép: 3s, 5s, 6s, 7s, 8s, 10s, 12s, 15s. Mặc định: 3s|
|`aspect_ratio`|string|Tùy chọn|Cho phép: '1:1', '9:16', '4:3', '3:4', '16:9'. Mặc định: '16:9'|
|`resolution`|string|Tùy chọn|Cho phép: '720p', '1080p', '4k'. Mặc định: '720p'|
|`generate_audio`|boolean|Tùy chọn|Tạo âm thanh cho video. Mặc định: true|
|`server`|string|Tùy chọn|Server slug: 'vip-01', 'business'|

`vip-01``business`default

#### Ví dụ T2V (Text-to-Video)

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/video-omni \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cat playing with a ball in slow motion",
    "model": "kling-3-omni-video",
    "duration": 3,
    "aspect_ratio": "1:1",
    "resolution": "720p",
    "generate_audio": true
  }'
```

#### Ví dụ I2V (Image-to-Video)

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/video-omni \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Make the character walk forward gracefully",
    "model": "kling-3-omni-video",
    "input_image_url": "https://example.com/character.jpg",
    "duration": 3,
    "resolution": "720p"
  }'
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "task_id": "vo-abc123-...",
  "status": "queued",
  "message": "Video Omni (kling-3-omni-video) queued successfully."
}
```



------------------------------------------------------------------------------------------------

IMG to Video — Kling 2.6 video generation

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`prompt`|string|Bắt buộc|Mô tả văn bản nội dung mong muốn.|
|`model`|string|Bắt buộc|ID model đã chọn: `kling-2.6`|
|`mode`|string|Tùy chọn|Cho phép: 'i2v'. i2v = Image-to-Video.|
|`duration`|int|Tùy chọn|Thời lượng (giây). Cho phép: 5s, 10s.|
|`quality`|string|Tùy chọn|Cho phép: '720p', '1080p'. Mặc định: '720p'|
|`aspect_ratio`|string|Tùy chọn|Cho phép: '16:9', '9:16'|
|`start_image_url`|string|Tùy chọn|URL ảnh Start Frame cho I2V mode|
|`end_image_url`|string|Tùy chọn|URL ảnh End Frame cho I2V mode (Kling, Veo3)|
|`server`|string|Tùy chọn|Server slug: 'business', 'vip-02'. Ảnh hưởng routing + cost.|

`business``vip-02`default

#### Ví dụ request cho Kling 2.6

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/video \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Make the character dance smoothly",
    "model": "kling-2.6",
    "mode": "i2v",
    "start_image_url": "https://example.com/character.jpg",
    "duration": 5,
    "quality": "720p"
  }'
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "task_id": "vid-987654-...",
  "status": "queued",
  "message": "Video generation queued successfully."
}
```



------------------------------------------------------------------------------------------------

Text to Video / IMG to Video — Grok AI video generation (T2V & I2V)

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`prompt`|string|Bắt buộc|Mô tả văn bản nội dung mong muốn.|
|`model`|string|Bắt buộc|ID model đã chọn: `grok-video`|
|`mode`|string|Tùy chọn|Cho phép: 't2v', 'i2v'. t2v = Text-to-Video. i2v = Image-to-Video.|
|`duration`|int|Tùy chọn|Thời lượng (giây). Cho phép: 6s, 10s.|
|`quality`|string|Tùy chọn|Cho phép: '720p'. Mặc định: '720p'|
|`aspect_ratio`|string|Tùy chọn|Cho phép: '16:9', '9:16', '1:1'|
|`start_image_url`|string|Tùy chọn|URL ảnh Start Frame cho I2V mode|
|`end_image_url`|string|Tùy chọn|URL ảnh End Frame cho I2V mode (Kling, Veo3)|
|`server`|string|Tùy chọn|Server slug: 'business', 'vip-01'. Ảnh hưởng routing + cost.|

`business``vip-01`default

#### Ví dụ request cho Grok Video

bash

```
curl -X POST https://plenxai.com/api/v1/developer/generate/video \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cat playing with a ball in slow motion",
    "model": "grok-video",
    "mode": "t2v",
    "aspect_ratio": "16:9",
    "duration": 6,
    "quality": "720p"
  }'
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "task_id": "vid-987654-...",
  "status": "queued",
  "message": "Video generation queued successfully."
}
```



------------------------------------------------------------------------------------------------


---
1Tạo API key từ tab **API Keys**

2Gửi request với header `X-API-Key`

3Poll `/status` để lấy kết quả

### Status & Polling

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`task_id`|string|Bắt buộc|ID task từ response generate (path param).|

#### Ví dụ request

bash

```
curl https://plenxai.com/api/v1/developer/status/{task_id} \
  -H "X-API-Key: pk_your_api_key_here"
```

#### Phản hồi — Đang xử lý

json

```
{
  "success": true,
  "task_id": "abc123-...",
  "status": "queued",
  "result_url": null
}
```

#### Phản hồi — Hoàn thành

json

```
{
  "success": true,
  "task_id": "abc123-...",
  "status": "succeeded",
  "result_url": "https://imagedelivery.net/hash/img-uuid/format=png,quality=100",
  "thumbnail_url": "https://imagedelivery.net/hash/img-uuid/w=360,h=640,fit=cover"
}
```

Status values: `queued` → `running` → `succeeded` / `failed`. Poll mỗi 3-5s cho image, 10s cho video.



------------------------------------------------------------------------------------------------

### Text Generation API (X-API-Key)

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`prompt`|string|Bắt buộc|Text prompt (1–50000 ký tự)|
|`model`|string|Tùy chọn|Mặc định: gemini-2.5-flash|
|`system_instruction`|string|Tùy chọn|System prompt / persona cho AI|
|`temperature`|float|Tùy chọn|Sampling temperature (0.0–2.0)|
|`max_tokens`|int|Tùy chọn|Max output tokens (1–65536)|
|`images`|string\[\]|Tùy chọn|Base64 images hoặc URLs (multi-modal)|

#### Ví dụ request

bash

```
curl -X POST https://plenxai.com/api/v1/developer/text-gen/generate \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Viết mô tả sản phẩm cho áo thun cotton organic",
    "model": "gemini-2.5-flash",
    "system_instruction": "Bạn là copywriter chuyên nghiệp",
    "temperature": 0.7,
    "max_tokens": 2048
  }'
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "text": "Áo thun cotton organic – Mềm mại, thoáng mát...",
  "blocked": false,
  "model": "gemini-2.5-flash",
  "latency_ms": 1847
}
```



------------------------------------------------------------------------------------------------

### Text Generation API (X-API-Key)

#### Ví dụ request

bash

```
curl https://plenxai.com/api/v1/developer/text-gen/models \
  -H "X-API-Key: pk_your_api_key_here"
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "models": [
    { "id": "uuid-...", "code": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "provider": "google" },
    { "id": "uuid-...", "code": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "provider": "google" }
  ]
}
```



------------------------------------------------------------------------------------------------

### Media Upload API (X-API-Key)

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`filename`|string|Bắt buộc|Tên file gốc|
|`content_type`|string|Bắt buộc|MIME type (image/jpeg, video/mp4, ...)|
|`file_size`|int|Bắt buộc|Kích thước file (bytes). Image max 50MB, Video max 500MB.|
|`media_type`|string|Bắt buộc|"image" hoặc "video"|

#### Ví dụ request

bash

```
curl -X POST https://plenxai.com/api/v1/developer/media-upload/presign \
  -H "X-API-Key: pk_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{"filename":"photo.jpg","content_type":"image/jpeg","file_size":2048000,"media_type":"image"}'
```

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "upload_url": "https://abc123.r2.cloudflarestorage.com/bucket/images/...",
  "upload_key": "images/20260414/photo_a1b2c3.jpg",
  "public_url": "https://media.plenxai.com/images/20260414/photo_a1b2c3.jpg",
  "expires_in": 3600
}
```



------------------------------------------------------------------------------------------------

### Media Upload API (X-API-Key)

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`upload_key`|string|Bắt buộc|R2 object key từ presign response|
|`media_type`|string|Bắt buộc|"image" hoặc "video"|
|`push_to_cdn`|bool|Tùy chọn|Push lên CF Images CDN (default: true)|
|`aspect_ratio`|string|Tùy chọn|Aspect ratio cho thumbnail (default: 1:1)|

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "url": "https://media.plenxai.com/images/20260414/photo_a1b2c3.jpg",
  "cdn_url": "https://imagedelivery.net/hash/img-uuid/format=jpeg,quality=100",
  "thumbnail_url": "https://imagedelivery.net/hash/img-uuid/w=480,h=480,fit=cover",
  "media_id": "550e8400-e29b-41d4-a716-446655440000"
}
```



------------------------------------------------------------------------------------------------


### Media Upload API (X-API-Key)

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`image_data`|string|Bắt buộc|Base64 data URL (data:image/png;base64,...)|
|`filename`|string|Tùy chọn|Tên file|
|`media_type`|string|Tùy chọn|"image" hoặc "video"|
|`push_to_cdn`|bool|Tùy chọn|Push lên CDN (default: true)|

#### Phản hồi 200 OK

json

```
{
  "success": true,
  "url": "https://imagedelivery.net/hash/img-uuid/format=png,quality=100",
  "cdn_url": "https://imagedelivery.net/hash/img-uuid/format=png,quality=100",
  "thumbnail_url": "https://imagedelivery.net/hash/img-uuid/w=640,h=360,fit=cover",
  "key": "images/20260414/screenshot_a1b2c3.png",
  "bytes": 245760
}
```



------------------------------------------------------------------------------------------------

### Media Upload API (X-API-Key)

|Tên|Loại|Bắt buộc|Mô tả|
|---|---|---|---|
|`media_id`|string|Bắt buộc|UUID của media cần xóa|

#### Phản hồi 200 OK

json

```
{ "success": true, "message": "Media deleted" }
```

### Error Handling




