# Q版 DeepSeek 记忆吉祥物 — 生成提示词

> 已生成的效果图：
> - 社交预览用（<1MB，1254×1254 JPEG）：[`../assets/q-version-deepseek-memory.jpg`](../assets/q-version-deepseek-memory.jpg)
> - 原始无损图（1254×1254 PNG）：[`../assets/q-version-deepseek-memory.png`](../assets/q-version-deepseek-memory.png)
>
> ![Q版 DeepSeek 记忆吉祥物](../assets/q-version-deepseek-memory.jpg)

下面是一份**详细版**提示词，用于生成「DeepSeek 记忆」的 Q 版（chibi）形象。分成：主提示词（中文）、英文版、可拆分的「模块化」版本、负面提示词与参数建议。

## 一、主提示词（中文 · 详细版，可直接复制）

> 一只超级可爱的 Q 版（chibi）深蓝色小鲸鱼吉祥物，作为「DeepSeek 记忆」的化身，大头娃娃比例（脑袋约占全身三分之二），圆润饱满、额头宽阔，脸颊有两团淡淡的粉腮红。它有一对超大、水汪汪的紫蓝色大眼睛，瞳孔里倒映着细小的星星和发光的蓝色数据点，睫毛长而浓密；小小的嘴巴微微上翘，露出一点开心的笑。
>
> 鲸鱼通体是 DeepSeek 标志性的科技蓝（#4D6BFE），肚皮是柔和的浅蓝白色（#EAF2FF），身体两侧有柔和的渐变与圆角高光，皮肤呈光滑的软胶/黏土质感。它头戴一顶小小的深蓝色毕业帽，帽穗末端挂着一颗发光的金色小星星。它用两只短短的小鳍温柔地抱着一本悬浮、半透明、会发光的魔法书，书页由光构成，正缓缓向上飘出许多半透明的「记忆泡泡」；每个泡泡里分别浮现着一个小齿轮、一颗星星、一颗爱心、一个沙漏、一把小钥匙、一个问号和一枚小小的蓝色鲸鱼徽章，泡泡边缘有细细的光晕，颜色从科技蓝渐变到淡紫和暖金。
>
> 在小鲸鱼头顶上方，悬浮着一个由发光线条勾勒的淡蓝色半透明大脑轮廓，内部有无数闪烁的连接点和流动的光线，象征记忆的储存与检索。环绕鲸鱼的是柔和漂浮的粒子光点，以及几条轻柔缠绕的发光数据丝带，形成微微旋转的「记忆轨道」。背景是极简的深蓝到浅蓝渐变，隐隐透出柔和的电路板线条、云朵剪影和几颗散落的四角星，干净不杂乱。
>
> 整体风格：高质量 3D 渲染的软胶/黏土质感结合扁平插画的萌系风格（类似 C4D / Blender 出品），柔和的工作室布光，柔和阴影，边缘光（rim light）勾勒出鲸鱼轮廓，浅景深，画面通透，色彩饱和但不刺眼，超高细节，8K，居中构图，纯白或极浅蓝底色可做头像/Logo 使用。

## 二、英文版（English, copy-paste ready）

> An adorable chibi baby whale mascot embodying "DeepSeek Memory". Big-head proportions (head about two-thirds of the body), round and plump with a broad forehead and two soft pink blush patches on the cheeks. It has huge, watery violet-blue eyes with tiny stars and glowing blue data points reflected in the pupils, long thick lashes, and a small upturned smiling mouth.
>
> The whale is DeepSeek's signature tech blue (#4D6BFE), with a soft pale blue-white belly (#EAF2FF), smooth gradient shading and rounded highlights, and a glossy soft-rubber / clay-like skin. It wears a tiny navy graduation cap with a glowing golden star dangling from the tassel. With two short little fins it tenderly hugs a floating, translucent, glowing magic book whose pages are made of light, from which many translucent "memory bubbles" drift upward; each bubble holds a small gear, a star, a heart, an hourglass, a little key, a question mark, or a tiny blue whale badge, each bubble edged with a fine glow that gradients from tech blue to soft violet and warm gold.
>
> Above the whale floats a translucent pale-blue brain outline drawn in luminous lines, filled with countless twinkling connection points and flowing light filaments, symbolizing the storage and retrieval of memories. Around the whale is a soft halo of floating light particles and several gently winding glowing data ribbons forming a slowly rotating "memory orbit". The background is a minimal deep-blue to light-blue gradient with faint circuit-board lines, cloud silhouettes, and a few scattered four-point stars — clean and uncluttered.
>
> Overall style: high-quality 3D-rendered soft-rubber / clay texture blended with flat-illustration kawaii style (C4D / Blender quality), soft studio lighting, soft shadows, rim light outlining the whale, shallow depth of field, airy and translucent, saturated but not harsh colors, ultra-detailed, 8K, centered composition, pure white or very pale blue base suitable for an avatar / logo.

## 三、模块化版本（可逐段替换微调）

如果模型对长提示词容易「漏掉细节」，把下面的模块按顺序拼起来用（每行一条）：

```
[角色] 一只 Q 版大头深蓝色小鲸鱼吉祥物，大头娃娃比例，圆润，脸颊有淡粉腮红
[表情] 超大紫蓝色水汪汪大眼睛，瞳孔里倒映小星星和发光数据点，长睫毛，微笑小嘴
[配色] DeepSeek 科技蓝 #4D6BFE 身体，浅蓝白 #EAF2FF 肚皮，软胶黏土质感，圆角高光
[头饰] 深蓝色小毕业帽，帽穗挂一颗发光金色小星星
[记忆元素 A] 小鳍抱住一本悬浮的半透明发光魔法书，书页由光构成
[记忆元素 B] 书页飘出半透明记忆泡泡，泡泡内含齿轮/星星/爱心/沙漏/钥匙/问号/小鲸鱼徽章
[记忆元素 C] 头顶悬浮发光线条勾勒的淡蓝半透明大脑轮廓，内有连接点和流动光线
[氛围] 环绕柔和粒子光点与发光数据丝带，形成旋转的「记忆轨道」
[背景] 极简深蓝到浅蓝渐变，柔和电路板线条、云朵剪影、四角星
[风格] 3D 软胶黏土质感 + 扁平萌系插画，C4D/Blender 品质，工作室柔光，边缘光，浅景深
[输出] 8K，超高细节，居中构图，纯白/极浅蓝底，可做头像 Logo
```

## 四、负面提示词 / Negative prompt

```
blurry, low quality, extra fingers, deformed, bad anatomy, text, watermark, signature, logo text, realistic whale, scary, dark, cluttered background, oversaturated, neon, jpeg artifacts, cropped
```

## 五、参数建议

| 工具 | 建议 |
|---|---|
| Midjourney | `--ar 1:1 --v 6 --style raw --stylize 150`（横幅用 `--ar 3:1`，鲸鱼居左） |
| DALL·E 3 | 直接粘贴主提示词，1024×1024（或 1792×1024） |
| Stable Diffusion / SDXL | 采样 28–40 步，CFG 5–7，配合负面提示词 |
| Flux / 其他 | 直接粘贴主提示词即可 |

## 六、使用说明

- 主题紧扣 **DeepSeek**（深蓝鲸鱼）与 **记忆**（魔法书、记忆泡泡、大脑轮廓、齿轮/星星/爱心）。
- 想要更「官方」：背景换成 DeepSeek 官网风格极简几何底纹，去掉大脑轮廓，只保留鲸鱼+书+泡泡。
- 想要头像/Logo 尺寸用正方形；想要横幅改用 `--ar 3:1` 并让鲸鱼居左、文字留白在右侧。
- 想更简洁（少元素）：保留「小鲸鱼 + 发光书 + 记忆泡泡」三件套即可，其余元素删掉。
