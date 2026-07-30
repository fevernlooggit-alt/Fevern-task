#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
「战士 · 天使」头部特写 · 成稿示范  (SHEET 02)
The head from the main template, drawn OUT — fully finished demo,
with step-by-step construction panels and a 3/4-view left blank to practice.
Same design language: 未完之线 The Unfinished Line.
"""
import math, random, os

random.seed(21)

W, H = 1240, 1754

PAPER_A = "#F0EADC"
PAPER_B = "#E5DCC7"
CONS    = "#94A0B3"
CONS_F  = "#AEB8C6"
INK     = "#4F4941"
INK_F   = "#787165"
FAINT   = "#B9B1A0"
ANNO    = "#6E6759"
FRAME   = "#A89F8B"
RED     = "#8E3A30"

FONT_DIR = "/root/.claude/skills/canvas-design/canvas-fonts"

cons_layer, ink_layer, faint_layer, anno_layer, frame_layer, red_layer = [], [], [], [], [], []

def jit(v, a=0.6):
    return v + random.uniform(-a, a)

def fmt(v):
    return f"{v:.1f}"

def pencil(layer, d, color, w=1.6, op=0.9, ghost=True, cap="round"):
    layer.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" '
                 f'stroke-opacity="{op}" stroke-linecap="{cap}" stroke-linejoin="round"/>')
    if ghost:
        dx, dy = random.uniform(0.4, 0.9), random.uniform(0.3, 0.8)
        layer.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w*1.9}" '
                     f'stroke-opacity="{op*0.20}" stroke-linecap="{cap}" stroke-linejoin="round" '
                     f'transform="translate({dx:.2f},{dy:.2f})"/>')

def line(layer, x1, y1, x2, y2, color, w=1.4, op=0.85, ghost=True, dash=None):
    d = f"M {fmt(jit(x1))},{fmt(jit(y1))} L {fmt(jit(x2))},{fmt(jit(y2))}"
    if dash:
        layer.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" '
                     f'stroke-opacity="{op}" stroke-dasharray="{dash}" stroke-linecap="round"/>')
    else:
        pencil(layer, d, color, w, op, ghost)

def circle(layer, cx, cy, r, color, w=1.4, op=0.85, ghost=True, dash=None):
    a0 = random.uniform(0, 6.28)
    p = []
    steps = 30
    for i in range(steps + 2):
        a = a0 + i * (2 * math.pi / steps)
        rr = r + random.uniform(-r * 0.010 - 0.3, r * 0.010 + 0.3)
        p.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d = "M " + " L ".join(f"{fmt(x)},{fmt(y)}" for x, y in p)
    if dash:
        layer.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" '
                     f'stroke-opacity="{op}" stroke-dasharray="{dash}" stroke-linecap="round"/>')
    else:
        pencil(layer, d, color, w, op, ghost)

def ellipse_arc(layer, cx, cy, rx, ry, a0, a1, color, w=1.4, op=0.85, ghost=True, dash=None, rot=0.0):
    steps = max(10, int(abs(a1 - a0) / 0.2))
    p = []
    cr, sr = math.cos(rot), math.sin(rot)
    for i in range(steps + 1):
        a = a0 + (a1 - a0) * i / steps
        ex, ey = rx * math.cos(a) + random.uniform(-0.5, 0.5), ry * math.sin(a) + random.uniform(-0.5, 0.5)
        p.append((cx + ex * cr - ey * sr, cy + ex * sr + ey * cr))
    d = "M " + " L ".join(f"{fmt(x)},{fmt(y)}" for x, y in p)
    if dash:
        layer.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" '
                     f'stroke-opacity="{op}" stroke-dasharray="{dash}" stroke-linecap="round"/>')
    else:
        pencil(layer, d, color, w, op, ghost)

def curve(layer, pts, color, w=1.5, op=0.9, ghost=True, dash=None, a=0.5):
    pts = [(jit(x, a), jit(y, a)) for x, y in pts]
    if len(pts) == 2:
        d = f"M {fmt(pts[0][0])},{fmt(pts[0][1])} L {fmt(pts[1][0])},{fmt(pts[1][1])}"
    else:
        d = f"M {fmt(pts[0][0])},{fmt(pts[0][1])}"
        for i in range(1, len(pts) - 1):
            xc = (pts[i][0] + pts[i + 1][0]) / 2
            yc = (pts[i][1] + pts[i + 1][1]) / 2
            d += f" Q {fmt(pts[i][0])},{fmt(pts[i][1])} {fmt(xc)},{fmt(yc)}"
        d += f" T {fmt(pts[-1][0])},{fmt(pts[-1][1])}"
    if dash:
        layer.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" '
                     f'stroke-opacity="{op}" stroke-dasharray="{dash}" stroke-linecap="round"/>')
    else:
        pencil(layer, d, color, w, op, ghost)

def cross_tick(layer, x, y, s, color, w=1.0, op=0.8):
    line(layer, x - s, y, x + s, y, color, w, op, ghost=False)
    line(layer, x, y - s, x, y + s, color, w, op, ghost=False)

def hatch(layer, cx, cy, w_, h_, ang_deg, gap, color=FAINT, sw=1.0, op=0.5):
    a = math.radians(ang_deg)
    ux, uy = math.cos(a), math.sin(a)
    vx, vy = -uy, ux
    n = int(h_ / gap)
    for i in range(n):
        off = (i - n / 2) * gap
        ln = w_ * random.uniform(0.55, 1.0)
        mx, my = cx + vx * off + random.uniform(-2, 2), cy + vy * off + random.uniform(-2, 2)
        line(layer, mx - ux * ln / 2, my - uy * ln / 2, mx + ux * ln / 2, my + uy * ln / 2,
             color, sw, op * random.uniform(0.7, 1.0), ghost=False)

def frame(x, y, w_, h_, zh, en):
    frame_layer.append(f'<rect x="{x}" y="{y}" width="{w_}" height="{h_}" fill="none" '
                       f'stroke="{FRAME}" stroke-width="0.8" stroke-opacity="0.35"/>')
    s = 14
    for (cx, cy, sx, sy) in [(x, y, 1, 1), (x+w_, y, -1, 1), (x, y+h_, 1, -1), (x+w_, y+h_, -1, -1)]:
        pencil(frame_layer, f"M {fmt(cx+sx*s)},{fmt(cy)} L {fmt(cx)},{fmt(cy)} L {fmt(cx)},{fmt(cy+sy*s)}",
               FRAME, 1.6, 0.75, ghost=False)
    anno_layer.append(f'<text x="{x+2}" y="{y-10}" class="zh" font-size="13" fill="{ANNO}" '
                      f'letter-spacing="2">{zh}</text>')
    if en:
        anno_layer.append(f'<text x="{x+w_-2}" y="{y-10}" class="mono" font-size="8" fill="{ANNO}" '
                          f'opacity="0.65" text-anchor="end" letter-spacing="1.5">{en}</text>')

def ztext(x, y, s, size=12, color=ANNO, ls=1.5, anchor="start", op=1.0):
    anno_layer.append(f'<text x="{x}" y="{y}" class="zh" font-size="{size}" fill="{color}" '
                      f'letter-spacing="{ls}" text-anchor="{anchor}" opacity="{op}">{s}</text>')

def mtext(x, y, s, size=9, color=ANNO, anchor="start", op=0.75, ls=1.2):
    anno_layer.append(f'<text x="{x}" y="{y}" class="mono" font-size="{size}" fill="{color}" '
                      f'letter-spacing="{ls}" text-anchor="{anchor}" opacity="{op}">{s}</text>')

# ================================================================== HEADER
def header():
    anno_layer.append(
        f'<text x="50" y="96" class="zh" font-size="38" letter-spacing="5">'
        f'<tspan fill="{ANNO}" font-size="22">「战士 · 天使」</tspan>'
        f'<tspan fill="{INK}">头部特写</tspan>'
        f'<tspan fill="{ANNO}" font-size="20" dx="12" letter-spacing="4">成稿示范</tspan></text>')
    ztext(52, 128, "主图纸 DETAIL 01 的放大完成稿 · 跟着步骤画", 13, ANNO, 2.5)
    line(anno_layer, 50, 142, 560, 142, FRAME, 1.0, 0.6, ghost=False)
    mtext(1192, 60, "TPL - 2026 · SHEET 02/02", 9, ANNO, "end")
    mtext(1192, 76, "HEAD STUDY · GRAPHITE", 9, ANNO, "end")
    for (x, y) in [(28, 28), (W-28, 28), (28, H-28), (W-28, H-28)]:
        cross_tick(anno_layer, x, y, 7, FRAME, 0.9, 0.7)

# ================================================================== BIG HEAD (finished)
def big_head():
    cx = 420
    # ---- construction ghosts kept faint under the finished ink
    circle(cons_layer, cx, 640, 175, CONS, 1.2, 0.5, dash="6 6")
    line(cons_layer, cx, 440, cx, 960, CONS, 1.0, 0.45, ghost=False, dash="5 6")
    ellipse_arc(cons_layer, cx, 795, 172, 40, 0.15, 3.0, CONS, 1.0, 0.3, ghost=False, dash="4 5")   # eye line
    line(cons_layer, cx - 168, 752, cx + 168, 752, CONS_F, 0.9, 0.3, ghost=False, dash="4 5")        # brow line
    line(cons_layer, cx - 120, 872, cx + 120, 872, CONS_F, 0.9, 0.28, ghost=False, dash="4 5")       # nose line

    # ---- broken halo behind the hood (ring passes behind the head)
    for (a0, a1, ww) in [(2.55, 3.35, 2.4), (3.55, 4.15, 2.0), (4.55, 5.15, 2.0), (5.35, 6.15, 2.4), (6.35, 6.75, 1.8)]:
        ellipse_arc(ink_layer, cx, 468, 232, 54, a0, a1, INK, ww, 0.85)
    for (x, y, r) in [(206, 500, 3.0), (648, 494, 2.6)]:
        circle(ink_layer, x, y, r, INK, 1.2, 0.7, ghost=False)                   # broken shards drifting

    # ---- hood, outer + inner rim
    curve(ink_layer, [(240, 710), (252, 556), (316, 458), (420, 416), (526, 460), (590, 558), (602, 712)], INK, 3.0)
    curve(ink_layer, [(276, 706), (288, 572), (336, 486), (420, 452), (506, 488), (556, 574), (568, 708)], INK, 1.8)
    # hood sides falling toward shoulders, fading out unfinished
    curve(ink_layer, [(240, 710), (216, 820), (228, 948)], INK, 2.7)
    curve(cons_layer, [(228, 948), (244, 1006), (268, 1042)], CONS, 1.4, 0.7, dash="7 5")
    curve(ink_layer, [(602, 712), (632, 824), (620, 950)], INK, 2.7)
    curve(cons_layer, [(620, 950), (604, 1008), (580, 1044)], CONS, 1.4, 0.7, dash="7 5")
    # folds
    curve(ink_layer, [(268, 762), (258, 852), (268, 932)], INK_F, 1.5, 0.65)
    curve(ink_layer, [(300, 792), (296, 880)], INK_F, 1.3, 0.55)
    curve(ink_layer, [(572, 764), (584, 856), (572, 934)], INK_F, 1.5, 0.65)
    curve(ink_layer, [(544, 794), (548, 882)], INK_F, 1.3, 0.55)
    # interior shadow of the hood — in the crescent between the two rims
    hatch(faint_layer, 306, 548, 40, 66, 66, 5.5, FAINT, 1.1, 0.55)
    hatch(faint_layer, 536, 552, 38, 62, 114, 5.5, FAINT, 1.1, 0.55)

    # ---- jaw / face outline
    curve(ink_layer, [(252, 742), (274, 852), (330, 922), (418, 952), (500, 920), (552, 850), (586, 740)], INK, 2.9)

    # ---- hair: a few curved direction strands under the hood
    for (p0, p1, p2) in [((356, 478), (320, 572), (308, 688)), ((400, 468), (380, 562), (372, 650)),
                         ((452, 468), (452, 572), (448, 704)), ((500, 478), (520, 582), (526, 668))]:
        curve(ink_layer, [p0, p1, p2], INK_F, 1.2, 0.4)
    # fringe: four clumps, tips brushing the brow line only
    clumps = [((300, 700), (330, 748), (362, 708)), ((362, 708), (398, 758), (430, 710)),
              ((430, 710), (462, 752), (492, 702)), ((492, 702), (518, 742), (540, 694))]
    for (p0, tip, p1) in clumps:
        curve(ink_layer, [p0, ((p0[0] + tip[0]) / 2 - 8, (p0[1] + tip[1]) / 2 + 12), tip], INK, 2.2)
        curve(ink_layer, [tip, ((tip[0] + p1[0]) / 2 + 8, (tip[1] + p1[1]) / 2 + 8), p1], INK, 2.2)
    # inner strands
    for (a, b) in [((330, 716), (336, 738)), ((396, 722), (400, 746)), ((460, 714), (464, 738))]:
        curve(ink_layer, [a, b], INK_F, 1.3, 0.55)
    # side locks, tapering to a point
    curve(ink_layer, [(282, 652), (254, 776), (264, 892)], INK, 2.3)
    curve(ink_layer, [(304, 664), (282, 780), (264, 892)], INK, 1.6)
    curve(ink_layer, [(556, 650), (586, 772), (574, 886)], INK, 2.3)
    curve(ink_layer, [(536, 662), (560, 772), (574, 886)], INK, 1.6)

    # ---- brows: straight, low — 冷峻
    curve(ink_layer, [(308, 764), (350, 754), (388, 758)], INK, 3.0)
    curve(ink_layer, [(316, 772), (352, 763)], INK, 1.6)
    curve(ink_layer, [(452, 758), (490, 753), (532, 763)], INK, 3.0)
    curve(ink_layer, [(488, 762), (524, 771)], INK, 1.6)

    # ---- eyes: iris clipped by the upper lid, small pupil, kept highlight
    def eye(inner, outer, ic):
        sgn = 1 if inner > outer else -1                     # +1 = left eye
        curve(ink_layer, [(outer, 798), ((outer + ic) / 2, 786), (inner, 800)], INK, 2.8)
        curve(ink_layer, [(outer, 801), ((outer * 2 + ic) / 3, 793)], INK, 1.8)          # lash weight
        curve(ink_layer, [(outer, 799), (outer - sgn * 8, 808)], INK, 1.8)               # outer flick
        ellipse_arc(ink_layer, ic, 808, 13, 18, 0.30, 2.85, INK, 1.6, 0.9, ghost=False)  # iris, open at top
        ellipse_arc(ink_layer, ic + 1, 812, 4.5, 6, 0, 6.28, INK, 1.3, 0.9, ghost=False) # pupil
        line(ink_layer, ic + 1, 807, ic + 1, 817, INK, 1.8, 0.8, ghost=False)
        circle(ink_layer, ic - 5, 802, 3.0, INK, 0.9, 0.35, ghost=False)                 # highlight
        curve(ink_layer, [(outer - sgn * 2, 824), (ic, 828), (inner - sgn * 4, 824)], INK_F, 1.2, 0.5)

    eye(387, 315, 352)
    eye(453, 525, 488)

    # ---- nose: minimal, cold
    curve(ink_layer, [(424, 844), (420, 856), (419, 864)], INK, 1.5)
    curve(ink_layer, [(419, 864), (427, 868)], INK, 1.3)

    # ---- mouth: level, tight
    curve(ink_layer, [(388, 906), (420, 910), (452, 905)], INK, 2.2)
    curve(ink_layer, [(406, 924), (434, 924)], INK_F, 1.3, 0.5)

    # ---- neck + collar fading out
    curve(ink_layer, [(352, 944), (360, 1024)], INK, 2.2)
    curve(ink_layer, [(486, 942), (478, 1024)], INK, 2.2)
    hatch(faint_layer, 420, 992, 56, 14, 4, 6, FAINT, 1.0, 0.4)                           # chin shadow
    curve(cons_layer, [(300, 1018), (420, 1060), (540, 1014)], CONS, 1.5, 0.75, dash="7 5")
    curve(cons_layer, [(268, 1042), (330, 1076), (420, 1090), (510, 1074), (580, 1044)], CONS, 1.3, 0.6, dash="7 5")
    ztext(420, 1124, "肩颈与衣领 · 由你继续", 11, CONS, 1.5, "middle", 0.9)

# ================================================================== STEP PANELS
def mini_head(cx, cy, r, stage):
    """stage: 1=structure 2=features 3=hair 4=hood+done ; r ~ cranium radius"""
    s = r / 175.0
    def M(x, y):
        return (cx + (x - 420) * s, cy + (y - 640) * s)
    # cranium + axis + guides
    col = CONS if stage < 4 else CONS_F
    circle(cons_layer, cx, cy, r, col, 1.2, 0.7 if stage < 4 else 0.45, dash=None if stage == 1 else "4 4")
    line(cons_layer, *M(420, 452), *M(420, 952), col, 0.9, 0.55, ghost=False)
    ellipse_arc(cons_layer, cx, cy + 155 * s, r * 0.98, 24 * s, 0.15, 3.0, col, 0.9, 0.5, ghost=False)
    line(cons_layer, *M(268, 752), *M(572, 752), col, 0.9, 0.5, ghost=False, dash="3 4")
    # jaw
    jaw = [(252, 742), (274, 852), (330, 922), (418, 952), (500, 920), (552, 850), (586, 740)]
    if stage == 1:
        curve(cons_layer, [M(*p) for p in jaw], CONS, 1.3, 0.8)
        cross_tick(cons_layer, cx, cy, 5 * s * 3, CONS_F, 0.9, 0.5)
        return
    curve(ink_layer if stage >= 2 else cons_layer, [M(*p) for p in jaw], INK if stage >= 2 else CONS, 1.6, 0.85)
    # features
    curve(ink_layer, [M(308, 764), M(350, 754), M(388, 758)], INK, 1.7)
    curve(ink_layer, [M(452, 758), M(490, 753), M(532, 763)], INK, 1.7)
    curve(ink_layer, [M(315, 798), M(352, 787), M(387, 800)], INK, 1.6)
    curve(ink_layer, [M(453, 800), M(488, 787), M(525, 798)], INK, 1.6)
    for icx in (352, 488):
        p = M(icx, 810)
        ellipse_arc(ink_layer, p[0], p[1], 13 * s, 18 * s, 0.3, 2.85, INK, 1.1, 0.85, ghost=False)
        circle(ink_layer, p[0] + 1, p[1] + 2, 4.5 * s, INK, 1.0, 0.9, ghost=False)
    curve(ink_layer, [M(426, 842), M(420, 866), M(430, 871)], INK, 1.2)
    curve(ink_layer, [M(388, 906), M(420, 910), M(452, 905)], INK, 1.4)
    if stage == 2:
        return
    # hair
    clumps = [((300, 676), (330, 762), (362, 690)), ((362, 690), (398, 778), (430, 694)),
              ((430, 694), (462, 770), (492, 686)), ((492, 686), (518, 748), (540, 672))]
    for (p0, tip, p1) in clumps:
        curve(ink_layer, [M(*p0), M((p0[0] + tip[0]) / 2 - 8, (p0[1] + tip[1]) / 2 + 14), M(*tip)], INK, 1.5)
        curve(ink_layer, [M(*tip), M((tip[0] + p1[0]) / 2 + 8, (tip[1] + p1[1]) / 2 + 10), M(*p1)], INK, 1.5)
    curve(ink_layer, [M(282, 652), M(256, 776), M(268, 886)], INK, 1.5)
    curve(ink_layer, [M(556, 650), M(584, 772), M(570, 880)], INK, 1.5)
    if stage == 3:
        return
    # hood
    curve(ink_layer, [M(240, 710), M(252, 556), M(316, 458), M(420, 416), M(526, 460), M(590, 558), M(602, 712)], INK, 1.9)
    curve(ink_layer, [M(276, 706), M(288, 572), M(336, 486), M(420, 452), M(506, 488), M(556, 574), M(568, 708)], INK, 1.2)
    curve(ink_layer, [M(240, 710), M(216, 820), M(228, 948)], INK, 1.6)
    curve(ink_layer, [M(602, 712), M(632, 824), M(620, 950)], INK, 1.6)
    curve(ink_layer, [M(352, 944), M(360, 975)], INK, 1.3)
    curve(ink_layer, [M(486, 942), M(478, 975)], INK, 1.3)

def step_panels():
    X, Wp, Hp = 840, 330, 214
    steps = [("① 结构", "定头骨圆 · 十字轴 · 下颌", 1, 236),
             ("② 五官", "眉压眼 · 眼距一眼宽", 2, 496),
             ("③ 发型", "四束刘海 · 两侧长发", 3, 756),
             ("④ 兜帽", "体积比头大一圈 · 罩住发顶", 4, 1016)]
    for (t, tip, stage, y) in steps:
        frame(X, y, Wp, Hp, t, f"STEP 0{stage}")
        mini_head(X + Wp / 2, y + 88, 56, stage)
        ztext(X + Wp / 2, y + Hp - 12, tip, 10.5, ANNO, 1, "middle", 0.85)

# ================================================================== BOTTOM
def bottom():
    # ---- 3/4 practice, construction only
    frame(60, 1310, 500, 380, "三分之四视图 · 起稿练习", "YOUR TURN")
    cx, cy, r = 268, 1478, 118
    circle(cons_layer, cx, cy, r, CONS, 1.3, 0.8)
    curve(cons_layer, [(cx - 66, cy - 112), (cx - 96, cy - 20), (cx - 70, cy + 96)], CONS, 1.2, 0.75)   # face axis swung left
    ellipse_arc(cons_layer, cx, cy + 104, r * 0.99, 26, 0.3, 2.9, CONS, 1.0, 0.55, ghost=False)          # eye line
    # jaw pointing 30° left
    curve(cons_layer, [(cx - 108, cy + 44), (cx - 96, cy + 118), (cx - 52, cy + 168), (cx + 16, cy + 184), (cx + 74, cy + 152), (cx + 106, cy + 84)], CONS, 1.4, 0.85)
    circle(cons_layer, cx + 62, cy + 66, 21, CONS, 1.1, 0.65)                                            # ear
    cross_tick(cons_layer, cx + 62, cy + 66, 8, CONS_F, 0.9, 0.5)
    # hood ghost
    curve(cons_layer, [(cx - 122, cy + 76), (cx - 116, cy - 78), (cx - 42, cy - 152), (cx + 52, cy - 150), (cx + 122, cy - 66), (cx + 128, cy + 78)], CONS, 1.2, 0.6, dash="7 5")
    ztext(430, 1372, "转角约30°", 11, CONS, 1.5)
    ztext(430, 1396, "沿弯曲的轴线", 11, CONS, 1.5)
    ztext(430, 1420, "重新定五官", 11, CONS, 1.5)
    ztext(430, 1466, "远侧脸变窄", 11, CONS, 1.5)
    ztext(430, 1490, "近侧露出耳朵", 11, CONS, 1.5)

    # ---- notes + seal
    ztext(640, 1330, "要点", 14, ANNO, 3)
    mtext(694, 1330, "NOTES", 8, ANNO, "start", 0.55)
    notes = ["－ 眉压得低，眉眼距离近，显冷峻", "－ 瞳孔画竖椭圆，左上留高光",
             "－ 刘海四束，尖端盖过眉线", "－ 兜帽体积始终大于头一圈",
             "－ 阴影集中：帽内 · 发下 · 颌下", "－ 肩颈已留白，接回主图纸"]
    for i, s in enumerate(notes):
        ztext(644, 1366 + i * 30, s, 11.5, ANNO, 1)
    sx_, sy_ = 1108, 1580
    pencil(red_layer, f"M {fmt(sx_)},{fmt(sy_)} L {fmt(sx_ + 46)},{fmt(sy_ + 1)} L {fmt(sx_ + 45)},{fmt(sy_ + 47)} "
                      f"L {fmt(sx_ - 1)},{fmt(sy_ + 46)} Z", RED, 2.2, 0.85)
    anno_layer.append(f'<text x="{sx_ + 23}" y="{sy_ + 33}" class="zh" font-size="20" fill="{RED}" '
                      f'text-anchor="middle" letter-spacing="2" opacity="0.9">已完</text>')
    mtext(sx_ + 23, sy_ + 62, "HEAD · DONE", 7, RED, "middle", 0.7)
    # one red thread on a hood tie, the second accent
    curve(red_layer, [(228, 950), (220, 990), (230, 1024)], RED, 1.5)

# ================================================================== build
header()
big_head()
step_panels()
bottom()

svg = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
@font-face {{ font-family:'DM Mono'; src:url('file://{FONT_DIR}/DMMono-Regular.ttf'); }}
* {{ margin:0; padding:0; }}
body {{ width:{W}px; height:{H}px; overflow:hidden; }}
.zh {{ font-family:'WenQuanYi Zen Hei',sans-serif; }}
.mono {{ font-family:'DM Mono',monospace; }}
</style></head><body>
<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="paper" x1="0" y1="0" x2="0.3" y2="1">
    <stop offset="0" stop-color="{PAPER_A}"/><stop offset="1" stop-color="{PAPER_B}"/>
  </linearGradient>
  <radialGradient id="vig" cx="0.5" cy="0.46" r="0.75">
    <stop offset="0.62" stop-color="#000" stop-opacity="0"/>
    <stop offset="1" stop-color="#8d7f63" stop-opacity="0.16"/>
  </radialGradient>
  <filter id="wobS" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="11" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3.0"/>
  </filter>
  <filter id="wobM" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.016" numOctaves="2" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="4.0"/>
  </filter>
  <filter id="grain">
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="3"/>
    <feColorMatrix type="matrix" values="0 0 0 0 0.32  0 0 0 0 0.29  0 0 0 0 0.23  0 0 0 0.055 0"/>
  </filter>
</defs>
<rect width="{W}" height="{H}" fill="url(#paper)"/>
<rect width="{W}" height="{H}" filter="url(#grain)"/>
<rect x="36" y="36" width="{W - 72}" height="{H - 72}" fill="none" stroke="{FRAME}" stroke-width="1" stroke-opacity="0.25"/>
<g filter="url(#wobS)">{''.join(faint_layer)}</g>
<g filter="url(#wobM)">{''.join(cons_layer)}</g>
<g filter="url(#wobS)">{''.join(ink_layer)}</g>
<g filter="url(#wobS)">{''.join(red_layer)}</g>
<g>{''.join(frame_layer)}</g>
<g>{''.join(anno_layer)}</g>
<rect width="{W}" height="{H}" fill="url(#vig)"/>
</svg></body></html>"""

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "head.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(svg)
print("wrote", out, len(svg), "bytes")
