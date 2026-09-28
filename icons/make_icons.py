"""生成 PWA 图标：蓝色圆角方块 + 白色遗忘曲线 + 对勾"""
from PIL import Image, ImageDraw
import os

S = 4  # 4x 超采样
BASE = 512
SIZE = BASE * S
BG1 = (79, 124, 255)   # #4f7cff
BG2 = (66, 100, 220)

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 圆角方块背景（带轻微渐变）
radius = int(SIZE * 0.22)
mask = Image.new("L", (SIZE, SIZE), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=radius, fill=255)
grad = Image.new("RGBA", (SIZE, SIZE))
gd = ImageDraw.Draw(grad)
for y in range(SIZE):
    t = y / SIZE
    c = tuple(int(BG1[i] + (BG2[i] - BG1[i]) * t) for i in range(3)) + (255,)
    gd.line([(0, y), (SIZE, y)], fill=c)
img.paste(grad, (0, 0), mask)

# 白色遗忘曲线（衰减曲线）+ 关键节点
w_curve = int(S * 13)
pts = []
for i in range(41):
    t = i / 40
    x = SIZE * 0.14 + t * SIZE * 0.70
    y = SIZE * 0.30 + (1 - (1 / (1 + 6.5 * t)) ** 0.5) * SIZE * 0.40
    pts.append((x, y))
d.line(pts, fill=(255, 255, 255, 255), width=w_curve, joint="curve")
for p in (pts[0], pts[13], pts[27], pts[40]):
    r = int(S * 10)
    d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=(255, 255, 255, 255))

# 右下角对勾
chk = [(SIZE * 0.55, SIZE * 0.68), (SIZE * 0.68, SIZE * 0.80), (SIZE * 0.88, SIZE * 0.55)]
d.line(chk, fill=(255, 255, 255, 255), width=int(S * 20), joint="curve")
for p in (chk[0], chk[2]):
    r = int(S * 10)
    d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=(255, 255, 255, 255))

img = img.resize((BASE, BASE), Image.LANCZOS)

out = os.path.dirname(os.path.abspath(__file__))
img.save(os.path.join(out, "icon-512.png"))
img.resize((192, 192), Image.LANCZOS).save(os.path.join(out, "icon-192.png"))
print("icons written to", out)
