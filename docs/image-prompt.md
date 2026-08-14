# Q版 DeepSeek 记忆吉祥物 — 生成提示词

下面是一条可直接复制使用的图像生成提示词，用于生成「DeepSeek 记忆」的 Q 版（chibi）形象。

## 主提示词（中文，可直接复制）

> Q版可爱的深蓝色小鲸鱼吉祥物，圆滚滚的大脑袋和闪亮大眼睛，头顶戴着一顶小小的毕业帽，怀里抱着一本发光的书，书页里飘出几颗半透明的记忆泡泡，每个泡泡里都浮现着小小的齿轮、星星和爱心图案；小鲸鱼身边环绕着一圈柔和的光点，背后是淡淡的电路板与云朵剪影。整体采用 DeepSeek 标志性的科技蓝（#4D6BFE 到浅蓝渐变），扁平矢量插画风格，干净的白色背景，柔和的圆角高光，萌系表情，居中构图，超高细节，3D 渲染质感，工作室级柔和布光。

## 英文版（English, copy-paste ready）

> Adorable chibi mascot of a deep-blue baby whale, oversized round head with big sparkling eyes, wearing a tiny graduation cap, hugging a softly glowing book from which translucent memory bubbles float up — each bubble containing a tiny gear, star, and heart. The whale is ringed by a soft halo of light particles against a subtle circuit-board and cloud silhouette background. DeepSeek signature tech-blue palette (#4D6BFE to light-blue gradient), flat vector illustration style with soft rounded highlights, clean white background, kawaii expression, centered composition, ultra-detailed, soft 3D render feel, studio lighting.

## 负面提示词 / Negative prompt

```
blurry, low quality, extra fingers, deformed face, text, watermark, signature, logo text, realistic whale, scary, dark, cluttered background
```

## 建议参数

| 工具 | 建议 |
|---|---|
| Midjourney | `--ar 1:1 --v 6 --style raw --stylize 150` |
| DALL·E 3 | 直接粘贴主提示词，正方形 1024×1024 |
| Stable Diffusion / SDXL | 采样 28–40 步，CFG 5–7，配合负面提示词 |
| Flux / 其他 | 直接粘贴主提示词即可 |

## 使用说明

- 主题紧扣 **DeepSeek**（深蓝鲸鱼）与 **记忆**（发光的书、记忆泡泡、齿轮/星星/爱心）。
- 想要更「官方」一点，可把背景换成 DeepSeek 官网风格的极简几何底纹。
- 想要头像/Logo 尺寸，用正方形构图；想要横幅，改用 `--ar 3:1` 并让鲸鱼居左。
