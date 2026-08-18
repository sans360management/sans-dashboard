# 图片放这里

把两个档案丢进这个资料夹，页面会自动使用；档名要一模一样。

| 档名 | 内容 | 建议规格 |
|---|---|---|
| `hero-poster.jpg` | 主视觉海报（the Legacy of Wellbeing） | 直式，宽 1200–1600px，JPG，压到 300KB 以内 |
| `logo.png` | Sans Wellness Logo | 透明底 PNG，高度 ≥ 300px |

档案不在的时候，首页会自动 fallback 到橙色「26」图形版，不会破版 —— 所以可以先上线，图片随后补。

要换档名或路径，改 `assets/config.js` 里的 `images`。

> Logo 在深色页脚会自动转成白色（CSS `filter`），所以给**深色版透明底 PNG** 就好，不用另外准备白色版。
