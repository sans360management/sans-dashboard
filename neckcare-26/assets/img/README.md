# 图片放这里

把档案丢进这个资料夹，档名要跟下表一模一样，页面会自动使用。
档案不在的时候，对应区块会自动隐藏或降级，**不会破版**。

| 档名 | 用途 | 建议规格 |
|---|---|---|
| `logo.png` | Sans Wellness Logo（已放好，跟周年庆页共用） | 透明底 PNG，高度 ≥ 300px |
| `hero-neck.jpg` | 首屏主视觉（刮痧特写） | 直式或方形，宽 1400–1800px，JPG，压到 300KB 以内 |
| `poster-neckcare.jpg` | 直式活动海报（选用，目前没有区块在用，先留档名） | 直式 1200×1690 左右 |
| `sym-1.jpg` | 症状卡①：手麻痹 / 肩颈酸痛 / 富贵包 | 正方或 4:3，800px 内，150KB 以内 |
| `sym-2.jpg` | 症状卡②：失眠 / 多梦 / 偏头痛 | 同上 |
| `sym-3.jpg` | 症状卡③：肩颈僵硬 / 头痛头晕 | 同上 |
| `sym-4.jpg` | 症状卡④：走路气喘 / 腿脚无力 | 同上 |
| `offer-1.jpg` | Offer 卡①：元气肩颈疏通护理实拍 | 16:10，1200px 内，200KB 以内 |
| `offer-2.jpg` | Offer 卡②：1 对 1 健康咨询实拍 | 同上 |
| `offer-3.jpg` | Offer 卡③：4 合 1 健康检测实拍 | 同上 |
| `value-grid.jpg` | 价值锚定区的四宫格拼图（NECKFIX STUDIO 招牌 + 团队合照） | 横式，1400px 内，300KB 以内 |
| `awards.png` | 奖项墙长条图 | 宽 2000px 内，白底或透明底 |
| `brand-video-cover.jpg` | 品牌影片封面（已用 26 周年海报做好） | 16:9，1280px 内 |
| `testimonial-1.jpg` | 顾客头像：Tan Yean Chin | 正方，头像居中，300px 内即可 |
| `testimonial-2.jpg` | 顾客头像：Ïrēnē Èrłíndà | 同上 |
| `testimonial-3.jpg` | 顾客头像：Candy Leng | 同上 |
| `testimonial-4.jpg` | 顾客头像：Nabiha Karimah Sulieman | 同上 |

> 顾客头像还没上传前，会先显示橙底圆圈 + 姓名缩写（例如 TY、IE），不会破版；
> 上传后自动换成真人照片。

## 换图流程（跟周年庆页一样）

1. 打开 GitHub 网页版，进到 `neckcare-26/assets/img/`
2. 「Add file → Upload files」，把新档案拖进去，档名照上表打
3. 如果是要**换掉**旧图，先把旧档案 Delete，再上传新档案（同名会被要求覆盖，直接确认即可）
4. 我这边收到通知后会重新打包（`build-single.py` / `build-ghl.py`），几分钟内给你新的 GHL 贴码

## 影片

影片不放在这个资料夹，是填网址。跟我说要放哪几支：
- 品牌介绍影片（1 支）
- 顾客见证影片（最多 3 支）

给我 YouTube 连结或影片档网址就好，我会填进 `assets/config.js` 的 `videos` 栏位。
