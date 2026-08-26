# 影片放这里

活动介绍影片丢进这个资料夹，档名请用 **`event-intro.mp4`**（一模一样，包括小写）。

上传后跟我说一声，我把网址填进 `assets/config.js` 的 `videos.brand`，重新打包就会出现。
档案不在的时候影片区块会自动隐藏，页面不会破版。

## 规格建议

| 项目 | 建议 |
|---|---|
| 档名 | `event-intro.mp4` |
| 长度 | 1–3 分钟（这个位置在「关于 Sans」区块，太短撑不起来，太长冷流量看不完） |
| 档案大小 | **25MB 以内**（见下方限制） |
| 解析度 | 1080p 就够，不用 4K |
| 编码 | H.264 + AAC（相容性最好，所有浏览器都能播） |
| 码率 | 2–4 Mbps |

## ⚠️ GitHub 的档案大小限制

| 上传方式 | 上限 |
|---|---|
| **GitHub 网页版拖拉上传** | **25MB** ← 你用的是这个 |
| git 指令 / GitHub Desktop | 100MB |
| 超过 100MB | 一律挡下，要用 Git LFS |

所以**影片请先压到 25MB 以内**再上传，不然网页版会直接拒绝。
一支 2 分钟、1080p、码率 2 Mbps 的影片大约 30MB —— 压到 1.5 Mbps 大概就落在 22MB 左右。

用 HandBrake（免费）压：Preset 选 `Fast 1080p30`，Video 分页把 Average Bitrate 设 1500–2000 kbps。

## 上传步骤（跟图片一样）

1. GitHub 网页版 → 进到 `neckcare-26/assets/video/`
2. **Add file → Upload files**
3. 把 `event-intro.mp4` 拖进去
4. 下面 Commit changes → 绿色按钮
5. 跟我说一声

## 换影片

同名覆盖就好（先 Delete 旧档，再上传新档）。

> 注意：git 会**永久保留每一个版本**。影片换三次 = repo 里永远躺着三支影片的体积。
> 所以尽量一次到位，不要拿 repo 当草稿区反覆试。

## 影片网址长什么样

上传后，页面实际引用的是这个（我会帮你填）：

```
https://raw.githubusercontent.com/sans360management/sans-dashboard/main-sonhmr/neckcare-26/assets/video/event-intro.mp4
```

已实测：GitHub raw 会回传 `content-type: video/mp4` 且支援 Range 请求，
所以影片能内嵌播放、进度条也能拖动。
