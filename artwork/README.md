# 「战士 · 天使」半成品起稿模板

一张**故意只画一半**的角色设定图纸，供打印后手绘完成。构图参考角色设定图/模型参考图的版式（主体立绘 + 细节分格 + 设计说明）。

## 文件

| 文件 | 用途 |
| --- | --- |
| `warrior-angel-template.png` | SHEET 01 主模板（2480×3508，A4 @300dpi）。浅蓝灰=生成起稿线，深灰=已完成示范，虚线与留白=由你补全 |
| `warrior-angel-template-light.png` | 主模板的浅色临摹版，适合直接打印后用铅笔在上面加深、补全 |
| `warrior-angel-head-study.png` | SHEET 02 头部特写成稿：大头像完整画出（兜帽、刘海、冷峻五官、碎裂光环），配 ①结构→②五官→③发型→④兜帽 四步分解与三分之四视图起稿练习 |
| `warrior-angel-head-study-light.png` | 头部特写的浅色临摹版 |
| `warrior-angel-sheet.html` / `warrior-angel-head-sheet.html` | 矢量源文件（内嵌 SVG），浏览器打开即可缩放查看或打印 |
| `gen_sheet.py` / `gen_head.py` | 生成脚本：程序化绘制全部线稿并输出 HTML（渲染 PNG 用 headless Chromium 截图） |
| `PHILOSOPHY.md` | 本系列遵循的设计理念「未完之线」 |

## 使用建议

1. 打印 A4（或垫板临摹），铅笔沿浅线确定外形；
2. 参考左翼、左半胸甲、军靴等深线示范，补全右翼、披风与织物；
3. 统一阴影，最后在全图仅三处点暗红（枪缨、元素表、印章）。

## 重新生成

```bash
python3 artwork/gen_sheet.py   # 输出 sheet.html
chromium --headless=new --screenshot=sheet.png \
  --window-size=1240,1754 --force-device-scale-factor=2 \
  --allow-file-access-from-files "file://$PWD/sheet.html"
```

中文使用系统字体「文泉驿正黑」，等宽标注使用 DM Mono。
