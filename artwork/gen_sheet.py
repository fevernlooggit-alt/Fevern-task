#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
「战士 · 天使」半成品起稿模板生成器  v2
Semi-finished character-design sheet: construction lines + partial demo inking,
deliberately left incomplete so the owner can finish it by hand.
Design language: 未完之线 The Unfinished Line (see PHILOSOPHY.md)
"""
import math, random, os

random.seed(12)

W, H = 1240, 1754

# ------------------------------------------------------------------ palette
PAPER_A = "#F0EADC"
PAPER_B = "#E5DCC7"
CONS    = "#94A0B3"   # non-photo blue-gray: generated construction lines
CONS_F  = "#AEB8C6"
INK     = "#514B43"   # graphite: finished demo lines
INK_F   = "#787165"
FAINT   = "#B9B1A0"
ANNO    = "#6E6759"
FRAME   = "#A89F8B"
RED     = "#8E3A30"

FONT_DIR = "/root/.claude/skills/canvas-design/canvas-fonts"

cons_layer, ink_layer, faint_layer, anno_layer, frame_layer, red_layer = [], [], [], [], [], []

# ------------------------------------------------------------------ helpers
def jit(v, a=0.8):
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
    steps = 26
    for i in range(steps + 2):
        a = a0 + i * (2 * math.pi / steps)
        rr = r + random.uniform(-r * 0.012 - 0.35, r * 0.012 + 0.35)
        p.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d = "M " + " L ".join(f"{fmt(x)},{fmt(y)}" for x, y in p)
    if dash:
        layer.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" '
                     f'stroke-opacity="{op}" stroke-dasharray="{dash}" stroke-linecap="round"/>')
    else:
        pencil(layer, d, color, w, op, ghost)

def ellipse_arc(layer, cx, cy, rx, ry, a0, a1, color, w=1.4, op=0.85, ghost=True, dash=None, rot=0.0):
    steps = max(10, int(abs(a1 - a0) / 0.22))
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

def curve(layer, pts, color, w=1.5, op=0.9, ghost=True, dash=None):
    pts = [(jit(x, 0.6), jit(y, 0.6)) for x, y in pts]
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

def contour(layer, pts, w0, w1, color, w=1.3, op=0.8, ghost=False, dash=None):
    """Two offset curves around a bone polyline -> limb volume. Width tapers w0 -> w1."""
    n = len(pts)
    left, right = [], []
    for i, (x, y) in enumerate(pts):
        if i == 0:
            dx, dy = pts[1][0] - x, pts[1][1] - y
        elif i == n - 1:
            dx, dy = x - pts[i - 1][0], y - pts[i - 1][1]
        else:
            dx, dy = pts[i + 1][0] - pts[i - 1][0], pts[i + 1][1] - pts[i - 1][1]
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L, dx / L
        ww = w0 + (w1 - w0) * i / (n - 1)
        left.append((x + nx * ww, y + ny * ww))
        right.append((x - nx * ww, y - ny * ww))
    curve(layer, left, color, w, op, ghost, dash)
    curve(layer, right, color, w, op, ghost, dash)

def joint(layer, cx, cy, r, color=None, w=1.3):
    circle(layer, cx, cy, r, color or CONS, w, 0.8, ghost=False)

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

def feather(layer, px, py, tx, ty, wdt, color, w=1.5, op=0.9, rib=True):
    """Rounded-tip feather from pivot to tip."""
    dx, dy = tx - px, ty - py
    L = math.hypot(dx, dy) or 1
    ux, uy = dx / L, dy / L
    nx, ny = -uy, ux
    mx, my = px + dx * 0.55, py + dy * 0.55
    c1 = (mx + nx * wdt, my + ny * wdt)
    c2 = (mx - nx * wdt * 0.8, my - ny * wdt * 0.8)
    tA = (tx + nx * wdt * 0.22, ty + ny * wdt * 0.22)
    tB = (tx - nx * wdt * 0.22, ty - ny * wdt * 0.22)
    tE = (tx + ux * wdt * 0.35, ty + uy * wdt * 0.35)
    d = (f"M {fmt(px + nx * wdt * 0.3)},{fmt(py + ny * wdt * 0.3)} "
         f"Q {fmt(jit(c1[0]))},{fmt(jit(c1[1]))} {fmt(tA[0])},{fmt(tA[1])} "
         f"Q {fmt(tE[0])},{fmt(tE[1])} {fmt(tB[0])},{fmt(tB[1])} "
         f"Q {fmt(jit(c2[0]))},{fmt(jit(c2[1]))} {fmt(px - nx * wdt * 0.3)},{fmt(py - ny * wdt * 0.3)}")
    pencil(layer, d, color, w, op)
    if rib:
        d2 = f"M {fmt(px)},{fmt(py)} L {fmt(px + dx * 0.66)},{fmt(py + dy * 0.66)}"
        pencil(layer, d2, color, w * 0.55, op * 0.45, ghost=False)

def chain(layer, pts, n, r, color, w=1.3, op=0.85):
    seg = []
    total = 0
    for i in range(len(pts) - 1):
        L = math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1])
        seg.append(L); total += L
    for k in range(n):
        t = (k + 0.5) / n * total
        acc = 0
        for i, L in enumerate(seg):
            if acc + L >= t:
                u = (t - acc) / L
                x = pts[i][0] + (pts[i+1][0]-pts[i][0]) * u
                y = pts[i][1] + (pts[i+1][1]-pts[i][1]) * u
                ang = math.atan2(pts[i+1][1]-pts[i][1], pts[i+1][0]-pts[i][0])
                break
            acc += L
        rot = ang + (0 if k % 2 == 0 else math.pi / 2)
        ellipse_arc(layer, x, y, r, r * 0.62, 0, 2 * math.pi, color, w, op, ghost=False, rot=rot)

def scallops(layer, p0, p1, bulge, n, color, w=1.4, op=0.85, dash=None):
    dx, dy = p1[0]-p0[0], p1[1]-p0[1]
    L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L, dx / L
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        a = (p0[0] + dx * t0, p0[1] + dy * t0)
        b = (p0[0] + dx * t1, p0[1] + dy * t1)
        m = ((a[0]+b[0])/2 + nx * bulge, (a[1]+b[1])/2 + ny * bulge)
        d = f"M {fmt(jit(a[0]))},{fmt(jit(a[1]))} Q {fmt(m[0])},{fmt(m[1])} {fmt(jit(b[0]))},{fmt(jit(b[1]))}"
        if dash:
            layer.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" '
                         f'stroke-opacity="{op}" stroke-dasharray="{dash}" stroke-linecap="round"/>')
        else:
            pencil(layer, d, color, w, op, ghost=False)

def frame(x, y, w_, h_, zh, en, tag=""):
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

def ztext(x, y, s, size=12, color=ANNO, ls=1.5, anchor="start", op=1.0, rot=0.0):
    t = f' transform="rotate({rot} {x} {y})"' if rot else ""
    anno_layer.append(f'<text x="{x}" y="{y}" class="zh" font-size="{size}" fill="{color}" '
                      f'letter-spacing="{ls}" text-anchor="{anchor}" opacity="{op}"{t}>{s}</text>')

def mtext(x, y, s, size=9, color=ANNO, anchor="start", op=0.75, ls=1.2):
    anno_layer.append(f'<text x="{x}" y="{y}" class="mono" font-size="{size}" fill="{color}" '
                      f'letter-spacing="{ls}" text-anchor="{anchor}" opacity="{op}">{s}</text>')

# ================================================================== HEADER
def header():
    anno_layer.append(
        f'<text x="50" y="98" class="zh" font-size="42" letter-spacing="6">'
        f'<tspan fill="{INK}">战士 · </tspan>'
        f'<tspan fill="none" stroke="{INK}" stroke-width="1.1">天使</tspan>'
        f'<tspan fill="{ANNO}" font-size="20" dx="14" letter-spacing="4">造型起稿</tspan></text>')
    ztext(52, 130, "半 成 品 模 板 · 供 手 绘 完 成", 13, ANNO, 3)
    line(anno_layer, 50, 142, 462, 142, FRAME, 1.0, 0.6, ghost=False)
    ztext(52, 166, "职业：战士 · 近战防御", 12, ANNO, 1.5)
    ztext(52, 188, "风格：神圣 · 冷峻 · 高贵", 12, ANNO, 1.5)
    line(anno_layer, 514, 66, 514, 200, FRAME, 1.0, 0.55, ghost=False, dash="4 4")
    ztext(530, 80, "设计说明：", 14, ANNO, 2)
    notes = ["－ 天使与战士的结合", "－ 冷峻的表情，神圣的气质", "－ 破碎与秩序的融合",
             "－ 黑白灰主调 · 点缀暗红", "－ 浅线为起稿，深线为示范"]
    for i, s in enumerate(notes):
        ztext(534, 104 + i * 22, s, 12, ANNO, 1)
    mtext(1192, 60, "TPL - 2026 · SHEET 01/01", 9, ANNO, "end")
    mtext(1192, 76, "SCALE 1:20 · GRAPHITE", 9, ANNO, "end")
    for (x, y) in [(28, 28), (W-28, 28), (28, H-28), (W-28, H-28)]:
        cross_tick(anno_layer, x, y, 7, FRAME, 0.9, 0.7)

# ================================================================== MAIN FIGURE
CX = 600
def main_figure():
    # head-unit ticks
    for i in range(9):
        y = 340 + i * 120
        line(cons_layer, 556, y, 648, y, CONS_F, 0.9, 0.5, ghost=False, dash="3 5")
        if i < 8:
            mtext(662, 344 + i * 120 + 58, str(i + 1), 8, CONS, "start", 0.65)
    line(cons_layer, CX, 306, CX, 1310, CONS_F, 0.9, 0.45, ghost=False, dash="6 6")

    # ---- broken halo, above the hood (ink the smooth top-left segment)
    ellipse_arc(ink_layer, CX, 250, 78, 16, 3.6, 4.6, INK, 1.9, 0.9)
    ellipse_arc(cons_layer, CX, 250, 78, 16, 2.6, 3.4, CONS, 1.3, 0.8)
    ellipse_arc(cons_layer, CX, 250, 78, 16, 4.9, 5.7, CONS, 1.3, 0.8)
    ellipse_arc(cons_layer, CX, 250, 78, 16, 5.9, 7.6, CONS, 1.2, 0.65, dash="5 4")

    # ---- head construction
    circle(cons_layer, 602, 396, 56, CONS, 1.4, 0.85)
    curve(cons_layer, [(552, 412), (566, 448), (588, 462), (604, 466), (622, 460), (642, 444), (652, 410)], CONS, 1.3)
    line(cons_layer, 604, 336, 602, 466, CONS, 1.0, 0.55, ghost=False)
    ellipse_arc(cons_layer, 602, 412, 55, 18, 0.15, 2.95, CONS, 1.0, 0.5, ghost=False)

    # ---- face (inked demo) — cold, sharp
    curve(ink_layer, [(558, 401), (572, 397), (587, 399)], INK, 2.2)            # brow L, low + straight
    curve(ink_layer, [(615, 399), (630, 397), (644, 402)], INK, 2.2)            # brow R
    curve(ink_layer, [(561, 414), (574, 410), (588, 411)], INK, 2.1)            # L upper lid
    curve(ink_layer, [(563, 416), (574, 413)], INK, 1.4)                        # lash weight
    ellipse_arc(ink_layer, 576, 417, 3.6, 5.0, 0.35, 2.8, INK, 1.2, 0.9, ghost=False)   # iris lower
    circle(ink_layer, 576, 417, 1.1, INK, 1.0, 0.95, ghost=False)
    curve(ink_layer, [(614, 411), (628, 409), (641, 413)], INK, 2.1)            # R upper lid
    curve(ink_layer, [(630, 412), (641, 415)], INK, 1.4)
    ellipse_arc(ink_layer, 627, 417, 3.6, 5.0, 0.35, 2.8, INK, 1.2, 0.9, ghost=False)
    circle(ink_layer, 627, 417, 1.1, INK, 1.0, 0.95, ghost=False)
    line(ink_layer, 603, 422, 600, 441, INK, 1.2, 0.7, ghost=False)             # nose
    line(ink_layer, 600, 441, 605, 444, INK, 1.2, 0.7, ghost=False)
    curve(ink_layer, [(593, 453), (602, 455), (613, 452)], INK, 1.6)            # mouth, level
    curve(ink_layer, [(560, 424), (566, 440), (578, 452), (596, 462)], INK, 1.8)
    curve(ink_layer, [(596, 462), (614, 462), (632, 452), (644, 434)], INK, 1.8)
    curve(ink_layer, [(646, 406), (655, 411), (651, 426), (643, 430)], INK, 1.5)

    # ---- hair: four soft clumps sweeping over the brow
    for (p0, tip, p1) in [((556, 380), (568, 400), (580, 384)), ((580, 384), (594, 406), (606, 386)),
                          ((606, 386), (620, 402), (630, 384)), ((630, 384), (644, 396), (650, 378))]:
        curve(ink_layer, [p0, ((p0[0] + tip[0]) / 2 - 3, (p0[1] + tip[1]) / 2 + 6), tip], INK, 1.8)
        curve(ink_layer, [tip, ((tip[0] + p1[0]) / 2 + 3, (tip[1] + p1[1]) / 2 + 4), p1], INK, 1.8)
    curve(ink_layer, [(554, 362), (544, 404), (550, 430)], INK, 1.6)            # side lock L
    curve(ink_layer, [(650, 362), (658, 402), (652, 426)], INK, 1.6)            # side lock R
    for (a, b) in [((574, 376), (570, 392)), ((598, 380), (596, 398)), ((624, 378), (624, 394))]:
        curve(ink_layer, [a, b], INK_F, 1.2, 0.5)

    # ---- hood: cowl hugging the head, rounded apex
    curve(ink_layer, [(536, 398), (560, 326), (602, 300), (646, 330), (666, 402)], INK, 2.2)
    curve(ink_layer, [(552, 404), (568, 344), (602, 322), (638, 348), (654, 406)], INK, 1.5)
    curve(ink_layer, [(536, 398), (522, 452), (518, 506)], INK, 2.0)
    curve(cons_layer, [(666, 402), (678, 456), (682, 508)], CONS, 1.4, 0.8, dash="6 5")
    curve(ink_layer, [(518, 506), (544, 528), (576, 540)], INK, 1.9)
    curve(cons_layer, [(682, 508), (658, 530), (628, 540)], CONS, 1.4, 0.8, dash="6 5")
    hatch(faint_layer, 548, 420, 26, 52, 74, 4.6)
    hatch(faint_layer, 652, 428, 22, 44, 106, 4.6)

    # ---- neck & shoulder construction
    line(cons_layer, 585, 466, 580, 506, CONS, 1.2, 0.7)
    line(cons_layer, 621, 466, 626, 508, CONS, 1.2, 0.7)
    curve(cons_layer, [(512, 520), (556, 506), (602, 502), (650, 508), (694, 526)], CONS, 1.5)
    joint(cons_layer, 516, 524, 13); joint(cons_layer, 692, 530, 13)

    # ---- torso construction + silhouette (kept quiet so the armor reads)
    ellipse_arc(cons_layer, 602, 612, 82, 96, 0, 6.28, CONS, 1.2, 0.55, dash="5 5")
    line(cons_layer, 566, 706, 642, 706, CONS, 1.3)
    pencil(cons_layer, f"M {fmt(552)},{fmt(724)} L {fmt(656)},{fmt(724)} L {fmt(664)},{fmt(820)} "
                       f"L {fmt(544)},{fmt(822)} Z", CONS, 1.4, 0.8)
    cross_tick(cons_layer, 602, 770, 9, CONS_F, 1.0, 0.55)
    curve(cons_layer, [(528, 540), (522, 610), (560, 700), (546, 760), (556, 826)], CONS, 1.1, 0.5, dash="6 5")
    curve(cons_layer, [(676, 544), (682, 612), (646, 700), (660, 762), (652, 826)], CONS, 1.1, 0.5, dash="6 5")

    # ---- pauldron (grip side) inked, closed plate
    curve(ink_layer, [(500, 518), (528, 504), (562, 510)], INK, 2.0)
    curve(ink_layer, [(494, 540), (500, 558), (514, 568)], INK, 1.7)
    curve(ink_layer, [(500, 518), (494, 540)], INK, 1.8)
    curve(ink_layer, [(562, 510), (568, 528), (560, 542)], INK, 1.8)
    curve(ink_layer, [(514, 568), (538, 560), (560, 542)], INK, 1.7)
    curve(ink_layer, [(504, 534), (534, 522), (558, 526)], INK_F, 1.2, 0.6)     # inner rim

    # ---- chest armor: left half inked demo, right half construction
    curve(ink_layer, [(576, 540), (554, 564), (548, 602), (556, 630), (548, 662), (564, 690), (588, 704)], INK, 2.1)
    curve(ink_layer, [(588, 704), (604, 709)], INK, 1.8)
    curve(ink_layer, [(566, 668), (586, 673), (602, 674)], INK_F, 1.2, 0.55)
    curve(ink_layer, [(602, 548), (603, 626), (602, 706)], INK, 1.6)
    curve(ink_layer, [(576, 540), (602, 548)], INK, 1.7)
    curve(ink_layer, [(548, 592), (566, 598), (584, 600)], INK_F, 1.3, 0.6)
    curve(ink_layer, [(552, 646), (570, 652), (586, 654)], INK_F, 1.3, 0.6)
    for (x, y) in [(556, 578), (554, 632), (584, 554)]:
        circle(ink_layer, x, y, 2.2, INK, 1.1, 0.85, ghost=False)
    # small cross emblem on the plate
    line(ink_layer, 570, 598, 570, 620, INK, 1.7, 0.9)
    line(ink_layer, 563, 605, 577, 605, INK, 1.7, 0.9)
    curve(cons_layer, [(628, 542), (650, 566), (658, 608), (652, 652), (638, 688), (616, 704)], CONS, 1.4, 0.8, dash="6 5")

    # ---- belt + chains
    curve(ink_layer, [(552, 726), (602, 734), (656, 726)], INK, 2.0)
    curve(ink_layer, [(550, 744), (602, 752), (658, 744)], INK, 1.6)
    circle(ink_layer, 604, 738, 9, INK, 1.6, 0.9)
    chain(ink_layer, [(566, 752), (556, 800), (552, 850)], 7, 6.5, INK, 1.3, 0.85)
    chain(cons_layer, [(646, 752), (656, 802), (660, 852)], 7, 6.5, CONS, 1.2, 0.7)

    # ---- arms
    # grip arm (viewer-left)
    bone_u = [(516, 524), (486, 580), (472, 636)]
    bone_f = [(472, 640), (476, 676), (486, 702)]
    curve(cons_layer, bone_u, CONS, 1.4, 0.8)
    joint(cons_layer, 472, 638, 9)
    curve(cons_layer, bone_f, CONS, 1.4, 0.8)
    joint(cons_layer, 487, 706, 7)
    contour(cons_layer, bone_u, 15, 10, CONS, 1.2, 0.7)
    # gauntlet inked
    curve(ink_layer, [(452, 648), (488, 640)], INK, 1.8)
    curve(ink_layer, [(452, 648), (458, 682), (470, 702)], INK, 1.9)
    curve(ink_layer, [(488, 640), (494, 676), (502, 700)], INK, 1.9)
    curve(ink_layer, [(458, 664), (490, 658)], INK_F, 1.2, 0.6)
    # hand gripping the shaft
    curve(ink_layer, [(470, 704), (500, 698), (508, 706), (510, 738), (502, 748), (478, 750), (470, 742), (468, 712)], INK, 1.8)
    for yy in (714, 726, 738):
        curve(ink_layer, [(472, yy + 2), (492, yy - 2), (506, yy)], INK_F, 1.2, 0.65)
    curve(ink_layer, [(504, 706), (514, 716), (511, 732)], INK, 1.4)
    # free arm (viewer-right) construction with volume
    bone_u2 = [(692, 530), (722, 588), (734, 650)]
    bone_f2 = [(734, 654), (728, 716), (720, 774)]
    curve(cons_layer, bone_u2, CONS, 1.4, 0.8)
    joint(cons_layer, 734, 652, 9)
    curve(cons_layer, bone_f2, CONS, 1.4, 0.8)
    joint(cons_layer, 719, 780, 7)
    contour(cons_layer, bone_u2, 15, 10, CONS, 1.2, 0.7)
    contour(cons_layer, bone_f2, 10, 7, CONS, 1.2, 0.7, dash="5 4")
    curve(cons_layer, [(714, 786), (726, 783), (731, 798), (727, 816), (716, 819), (710, 804), (714, 788)], CONS, 1.3, 0.75, dash="5 4")

    # ---- legs with volume
    bone_t1 = [(646, 812), (656, 932), (654, 1054)]      # weight thigh
    bone_s1 = [(654, 1062), (652, 1170), (646, 1274)]
    bone_t2 = [(566, 812), (548, 936), (536, 1058)]      # free thigh
    bone_s2 = [(536, 1064), (528, 1174), (518, 1280)]
    for b_, jx, jy in [(bone_t1, 654, 1058), (bone_t2, 536, 1062)]:
        curve(cons_layer, b_, CONS, 1.4, 0.8)
        joint(cons_layer, jx, jy, 12)
    curve(cons_layer, bone_s1, CONS, 1.4, 0.8)
    curve(cons_layer, bone_s2, CONS, 1.4, 0.8)
    contour(cons_layer, bone_t1, 22, 13, CONS, 1.2, 0.7)
    contour(cons_layer, bone_t2, 22, 13, CONS, 1.2, 0.7)
    contour(cons_layer, bone_s2, 13, 8, CONS, 1.2, 0.7, dash="5 4")
    curve(cons_layer, [(518, 1282), (488, 1298), (508, 1308), (528, 1296)], CONS, 1.3, 0.75, dash="5 4")
    # weight boot inked demo
    curve(ink_layer, [(636, 1046), (654, 1036), (672, 1046), (676, 1068), (660, 1082), (640, 1078), (632, 1062), (636, 1048)], INK, 1.8)
    line(ink_layer, 654, 1044, 654, 1074, INK_F, 1.1, 0.55, ghost=False)
    curve(ink_layer, [(634, 1084), (630, 1170), (630, 1262)], INK, 1.9)
    curve(ink_layer, [(674, 1084), (676, 1172), (668, 1262)], INK, 1.9)
    curve(ink_layer, [(632, 1128), (652, 1134), (674, 1128)], INK_F, 1.2, 0.6)
    curve(ink_layer, [(631, 1196), (650, 1202), (672, 1196)], INK_F, 1.2, 0.6)
    curve(ink_layer, [(630, 1262), (626, 1288), (646, 1300), (682, 1302), (694, 1290), (678, 1276), (668, 1264)], INK, 1.9)
    curve(ink_layer, [(630, 1284), (656, 1292), (684, 1294)], INK_F, 1.2, 0.55)

    # ---- ribbons
    curve(ink_layer, [(560, 736), (516, 790), (474, 828), (444, 880)], INK, 1.7)
    curve(ink_layer, [(444, 880), (452, 902), (470, 896)], INK, 1.4)
    curve(cons_layer, [(652, 740), (700, 800), (740, 846), (762, 900)], CONS, 1.4, 0.7, dash="7 5")

    # ---- cloak (right side falls behind)
    curve(ink_layer, [(682, 512), (712, 560), (736, 640), (748, 720)], INK, 2.0)
    curve(cons_layer, [(748, 720), (756, 812), (748, 906), (726, 986)], CONS, 1.5, 0.75, dash="7 5")
    curve(cons_layer, [(726, 986), (700, 1002), (688, 1022), (666, 1012)], CONS, 1.3, 0.65, dash="7 5")
    curve(cons_layer, [(514, 512), (492, 570), (478, 650), (476, 730)], CONS, 1.5, 0.75)
    curve(cons_layer, [(476, 730), (470, 812), (482, 880)], CONS, 1.3, 0.65, dash="7 5")
    curve(ink_layer, [(700, 560), (716, 630), (722, 700)], INK_F, 1.2, 0.55)
    hatch(faint_layer, 716, 640, 26, 66, 72, 5)

    # ---- spear
    SX = 490
    line(cons_layer, SX, 204, SX, 1304, CONS, 1.1, 0.65)
    curve(ink_layer, [(SX, 196), (SX - 13, 242), (SX - 9, 288), (SX - 3, 310)], INK, 2.0)
    curve(cons_layer, [(SX, 196), (SX + 13, 242), (SX + 9, 288), (SX + 3, 310)], CONS, 1.3, 0.8, dash="5 4")
    line(ink_layer, SX, 202, SX, 306, INK_F, 1.0, 0.5, ghost=False)
    curve(ink_layer, [(SX - 4, 310), (SX - 24, 320), (SX - 9, 334)], INK, 1.7)
    curve(cons_layer, [(SX + 4, 310), (SX + 24, 320), (SX + 9, 334)], CONS, 1.2, 0.75, dash="5 4")
    line(ink_layer, SX - 2.5, 334, SX - 2.5, 902, INK, 1.7, 0.9)
    line(ink_layer, SX + 2.5, 334, SX + 2.5, 902, INK, 1.7, 0.9)
    line(cons_layer, SX - 2.5, 902, SX - 2.5, 1300, CONS, 1.2, 0.65, dash="8 6")
    line(cons_layer, SX + 2.5, 902, SX + 2.5, 1300, CONS, 1.2, 0.65, dash="8 6")
    ellipse_arc(cons_layer, SX, 1303, 9, 3.5, 0, 6.28, CONS, 1.1, 0.6, ghost=False)   # contact with the base
    for yy in range(660, 698, 9):
        line(ink_layer, SX - 4, yy + 4, SX + 4, yy, INK_F, 1.2, 0.65, ghost=False)
    curve(ink_layer, [(SX - 3, 758), (SX - 16, 794), (SX - 12, 834)], INK, 1.4)
    curve(ink_layer, [(SX + 1, 758), (SX - 4, 798), (SX - 2, 840)], INK, 1.4)
    curve(red_layer, [(SX - 1, 758), (SX + 8, 798), (SX + 5, 836)], RED, 1.6)

    # ================================================= WINGS
    # ---- viewer-LEFT wing: half finished demo
    # bones
    curve(cons_layer, [(582, 548), (506, 492), (452, 442)], CONS, 1.5)
    curve(cons_layer, [(452, 442), (400, 404), (360, 376)], CONS, 1.5)
    joint(cons_layer, 452, 442, 6); joint(cons_layer, 360, 376, 6)
    # leading edge inked: root -> wrist -> alula point
    curve(ink_layer, [(578, 542), (510, 490), (452, 438), (404, 400), (360, 370), (322, 346), (296, 336)], INK, 2.3)
    curve(ink_layer, [(296, 336), (306, 352), (322, 362)], INK, 1.6)             # alula fold
    # trailing-edge silhouette (construction)
    curve(cons_layer, [(272, 470), (296, 546), (330, 600), (372, 634), (418, 652), (462, 656), (512, 640), (556, 610)], CONS, 1.3, 0.75, dash="6 5")
    # primaries: 6, outer 3 inked
    pri = [((352, 384), (272, 474), 20), ((362, 396), (298, 548), 19), ((376, 406), (332, 600), 18),
           ((394, 416), (374, 634), 17), ((414, 428), (418, 650), 16), ((436, 438), (462, 652), 16)]
    for i, (p, t, wd) in enumerate(pri):
        if i < 3:
            feather(ink_layer, p[0], p[1], t[0], t[1], wd, INK, 1.7, 0.92, rib=(i == 0))
        else:
            feather(cons_layer, p[0], p[1], t[0], t[1], wd, CONS, 1.2, 0.7, rib=False)
    # secondaries: 4, construction
    sec = [((458, 448), (512, 636), 17), ((482, 466), (548, 606), 17), ((508, 486), (572, 580), 16), ((534, 506), (588, 560), 15)]
    for (p, t, wd) in sec:
        feather(cons_layer, p[0], p[1], t[0], t[1], wd, CONS, 1.2, 0.7, rib=False)
    # covert row: one scallop row along mid wing, clear of the pauldron
    scallops(ink_layer, (504, 500), (446, 446), 3, 3, INK, 1.6, 0.9)
    scallops(cons_layer, (446, 446), (396, 402), 8, 3, CONS, 1.3, 0.7)
    hatch(faint_layer, 478, 494, 26, 30, 128, 5)

    # ---- viewer-RIGHT wing: pure construction silhouette
    curve(cons_layer, [(622, 550), (700, 494), (762, 442)], CONS, 1.5)
    curve(cons_layer, [(762, 442), (818, 400), (856, 372)], CONS, 1.5)
    joint(cons_layer, 762, 442, 6); joint(cons_layer, 856, 372, 6)
    curve(cons_layer, [(626, 546), (704, 490), (764, 438), (820, 396), (862, 366), (896, 344)], CONS, 1.5, 0.85, dash="8 5")
    curve(cons_layer, [(912, 462), (890, 540), (858, 596), (818, 632), (774, 650), (730, 654), (682, 638), (640, 608)], CONS, 1.3, 0.75, dash="6 5")
    curve(cons_layer, [(896, 344), (908, 372), (912, 428), (912, 462)], CONS, 1.3, 0.75, dash="6 5")
    # two tier arcs only
    curve(cons_layer, [(646, 566), (742, 500), (836, 414)], CONS_F, 1.2, 0.6, dash="5 5")
    curve(cons_layer, [(652, 596), (748, 556), (852, 470)], CONS_F, 1.2, 0.6, dash="5 5")
    ztext(830, 714, "右翼留白 · 参考左翼补全", 11, CONS, 1.5, "middle", 0.9)

    # ---- base pedestal + crystals
    ellipse_arc(cons_layer, 600, 1340, 208, 40, 0, 6.28, CONS, 1.4, 0.8)
    line(cons_layer, 392, 1342, 392, 1440, CONS, 1.3, 0.75)
    line(cons_layer, 808, 1342, 808, 1440, CONS, 1.3, 0.75)
    ellipse_arc(cons_layer, 600, 1442, 214, 42, -0.15, 3.30, CONS, 1.4, 0.8)
    ellipse_arc(ink_layer, 600, 1348, 204, 38, 1.2, 3.05, INK, 1.9, 0.9)
    ellipse_arc(ink_layer, 600, 1436, 210, 40, 1.35, 2.9, INK, 1.9, 0.9)
    # chipped rim + crack (破碎感)
    pencil(ink_layer, f"M {fmt(462)},{fmt(1352)} L {fmt(472)},{fmt(1364)} L {fmt(484)},{fmt(1352)}", INK, 1.6, 0.85)
    pencil(cons_layer, f"M {fmt(694)},{fmt(1346)} L {fmt(702)},{fmt(1358)} L {fmt(714)},{fmt(1344)}", CONS, 1.3, 0.7)
    curve(ink_layer, [(548, 1370), (540, 1394), (548, 1412), (542, 1430)], INK_F, 1.3, 0.65)
    curve(cons_layer, [(672, 1372), (680, 1398), (674, 1420)], CONS_F, 1.2, 0.55)
    # rubble on the top surface
    for (x, y, r) in [(566, 1318, 5), (664, 1322, 4), (610, 1312, 3.5)]:
        pencil(cons_layer, f"M {fmt(x - r)},{fmt(y)} L {fmt(x - r * 0.3)},{fmt(y - r * 0.8)} "
                           f"L {fmt(x + r * 0.7)},{fmt(y - r * 0.5)} L {fmt(x + r)},{fmt(y + r * 0.3)} "
                           f"L {fmt(x - r * 0.4)},{fmt(y + r * 0.5)} Z", CONS, 1.1, 0.6)

    def crystal(layer, bx, by, tx_, ty_, w_, color, inked):
        c = INK if inked else CONS
        pencil(layer, f"M {fmt(bx - w_)},{fmt(by)} L {fmt(bx - w_ * 0.55)},{fmt(ty_ + (by - ty_) * 0.12)} "
                      f"L {fmt(tx_)},{fmt(ty_)} L {fmt(bx + w_ * 0.6)},{fmt(ty_ + (by - ty_) * 0.18)} "
                      f"L {fmt(bx + w_)},{fmt(by - 4)}", c, 1.8 if inked else 1.3, 0.9 if inked else 0.72)
        if inked:
            line(layer, bx - w_ * 0.55, ty_ + (by - ty_) * 0.12, bx - w_ * 0.15, by - 4, INK_F, 1.1, 0.55, ghost=False)
            line(layer, tx_, ty_, bx + w_ * 0.15, by - 6, INK_F, 1.0, 0.45, ghost=False)
    crystal(ink_layer, 502, 1330, 488, 1226, 24, INK, True)
    crystal(ink_layer, 558, 1332, 552, 1186, 20, INK, True)
    crystal(cons_layer, 664, 1330, 676, 1212, 22, CONS, False)
    crystal(cons_layer, 712, 1334, 730, 1264, 16, CONS, False)
    crystal(cons_layer, 610, 1338, 604, 1262, 13, CONS, False)
    chain(ink_layer, [(444, 1362), (520, 1382), (610, 1388)], 9, 7, INK, 1.4, 0.85)
    chain(cons_layer, [(610, 1388), (700, 1382), (764, 1360)], 6, 7, CONS, 1.2, 0.55)
    for (x, y, r) in [(452, 1326, 3), (668, 1352, 2.5), (556, 1396, 2.5), (736, 1336, 3)]:
        circle(cons_layer, x, y, r, CONS_F, 1.0, 0.55, ghost=False)
    hatch(faint_layer, 520, 1408, 120, 24, 6, 5)

# ================================================================== SIDE PANELS
def left_column():
    X, Wp = 48, 220
    # -- 1 head close-up
    frame(X, 222, Wp, 180, "头部特写", "DETAIL 01")
    cx, cy = X + 104, 312
    circle(cons_layer, cx, cy, 46, CONS, 1.3, 0.8)
    line(cons_layer, cx, cy - 50, cx, cy + 60, CONS, 0.9, 0.5, ghost=False)
    ellipse_arc(cons_layer, cx, cy + 12, 45, 15, 0.15, 3.0, CONS, 0.9, 0.5, ghost=False)
    curve(cons_layer, [(cx - 42, cy + 14), (cx - 28, cy + 44), (cx, cy + 56), (cx + 28, cy + 44), (cx + 42, cy + 12)], CONS, 1.2)
    curve(ink_layer, [(cx - 30, cy + 2), (cx - 19, cy - 1), (cx - 8, cy + 1)], INK, 1.9)   # lid
    ellipse_arc(ink_layer, cx - 19, cy + 4, 3, 4.2, 0.35, 2.8, INK, 1.1, 0.9, ghost=False)
    circle(ink_layer, cx - 19, cy + 4, 1.0, INK, 1.0, 0.95, ghost=False)
    curve(ink_layer, [(cx - 31, cy - 10), (cx - 19, cy - 13), (cx - 7, cy - 11)], INK, 1.9)  # brow
    curve(ink_layer, [(cx - 40, cy + 18), (cx - 28, cy + 40), (cx - 10, cy + 52)], INK, 1.7)
    for (p0, tip, p1) in [((cx - 36, cy - 20), (cx - 26, cy - 4), (cx - 16, cy - 18)),
                          ((cx - 16, cy - 18), (cx - 4, cy - 2), (cx + 8, cy - 18)),
                          ((cx + 8, cy - 18), (cx + 20, cy - 6), (cx + 34, cy - 20))]:
        curve(ink_layer, [p0, ((p0[0] + tip[0]) / 2 - 2, (p0[1] + tip[1]) / 2 + 4), tip], INK, 1.5)
        curve(ink_layer, [tip, ((tip[0] + p1[0]) / 2 + 2, (tip[1] + p1[1]) / 2 + 3), p1], INK, 1.5)
    curve(ink_layer, [(cx - 36, cy - 20), (cx - 22, cy - 36), (cx + 4, cy - 40), (cx + 24, cy - 34), (cx + 34, cy - 20)], INK, 1.5)
    ztext(X + 208, 390, "左半示范", 10, ANNO, 1, "end", 0.8)

    # -- 2 hood
    frame(X, 446, Wp, 180, "兜帽特写", "DETAIL 02")
    cx, cy = X + 104, 546
    circle(cons_layer, cx, cy, 32, CONS_F, 1.1, 0.55, dash="4 4")
    curve(ink_layer, [(cx - 44, cy - 4), (cx - 30, cy - 40), (cx - 2, cy - 52), (cx + 4, cy - 52), (cx + 32, cy - 38), (cx + 46, cy)], INK, 2.0)
    curve(ink_layer, [(cx - 36, cy), (cx - 24, cy - 28), (cx, cy - 38), (cx + 26, cy - 26), (cx + 38, cy + 2)], INK, 1.4)
    curve(ink_layer, [(cx - 44, cy - 4), (cx - 52, cy + 26), (cx - 46, cy + 56)], INK, 1.8)
    curve(cons_layer, [(cx + 46, cy), (cx + 54, cy + 28), (cx + 48, cy + 58)], CONS, 1.3, 0.7, dash="5 4")
    curve(ink_layer, [(cx - 28, cy + 16), (cx - 32, cy + 36), (cx - 28, cy + 54)], INK_F, 1.2, 0.55)
    curve(ink_layer, [(cx - 8, cy + 22), (cx - 10, cy + 42)], INK_F, 1.1, 0.5)
    hatch(faint_layer, cx - 34, cy + 6, 20, 30, 68, 4.5)

    # -- 3 wing structure
    frame(X, 670, Wp, 180, "翅膀分层", "DETAIL 03")
    b = [(X + 30, 810), (X + 78, 754), (X + 138, 726), (X + 186, 712)]
    for i in range(3):
        curve(cons_layer, [b[i], b[i + 1]], CONS, 1.5)
    for (x, y) in b[1:3]:
        joint(cons_layer, x, y, 5)
    scallops(ink_layer, (X + 44, 812), (X + 130, 742), 7, 4, INK, 1.4, 0.85)
    scallops(cons_layer, (X + 58, 828), (X + 152, 750), 9, 4, CONS, 1.2, 0.7)
    feather(ink_layer, X + 148, 744, X + 124, 816, 9, INK, 1.5, 0.9)
    feather(cons_layer, X + 174, 734, X + 158, 810, 9, CONS, 1.2, 0.7, rib=False)
    ztext(X + 34, 744, "覆羽", 10, ANNO, 1)
    ztext(X + 96, 842, "次级", 10, ANNO, 1)
    ztext(X + 170, 842, "初级", 10, ANNO, 1)

    # -- 4 hand grip
    frame(X, 894, Wp, 180, "握枪手部", "DETAIL 04")
    gx = X + 104
    line(cons_layer, gx, 906, gx, 1058, CONS, 1.2, 0.65)
    curve(ink_layer, [(gx - 24, 958), (gx + 14, 950), (gx + 26, 960), (gx + 28, 1002), (gx + 16, 1012), (gx - 20, 1014), (gx - 28, 1002), (gx - 26, 964)], INK, 1.8)
    for yy in (968, 982, 996):
        curve(ink_layer, [(gx - 24, yy + 3), (gx, yy - 2), (gx + 25, yy + 1)], INK_F, 1.3, 0.65)
        curve(ink_layer, [(gx - 26, yy + 4), (gx - 31, yy + 8), (gx - 25, yy + 12)], INK, 1.3, 0.8)   # finger-tip curl
    curve(ink_layer, [(gx + 20, 956), (gx + 34, 970), (gx + 28, 992)], INK, 1.5)
    curve(cons_layer, [(gx - 22, 1022), (gx - 28, 1050)], CONS, 1.2, 0.65)
    curve(cons_layer, [(gx + 22, 1018), (gx + 30, 1046)], CONS, 1.2, 0.65)
    ztext(X + 208, 1062, "四指卷筒 · 拇指压扣", 9, ANNO, 1, "end", 0.75)

    # -- 5 armor & chain macro
    frame(X, 1118, Wp, 180, "盔甲细节", "DETAIL 05")
    ax, ay = X + 64, 1206
    curve(ink_layer, [(ax - 18, ay - 58), (ax - 34, ay - 18), (ax - 26, ay + 32), (ax - 6, ay + 56)], INK, 2.0)
    curve(ink_layer, [(ax - 18, ay - 58), (ax + 14, ay - 50), (ax + 20, ay + 48), (ax - 6, ay + 56)], INK, 1.5)
    curve(ink_layer, [(ax - 24, ay - 22), (ax + 6, ay - 16)], INK_F, 1.2, 0.6)
    curve(ink_layer, [(ax - 22, ay + 16), (ax + 8, ay + 22)], INK_F, 1.2, 0.6)
    curve(cons_layer, [(ax + 14, ay - 50), (ax + 44, ay - 38), (ax + 52, ay + 22), (ax + 20, ay + 48)], CONS, 1.3, 0.7, dash="5 4")
    for (x, y) in [(ax - 24, ay - 38), (ax - 22, ay + 4), (ax + 2, ay - 44)]:
        circle(ink_layer, x, y, 2.2, INK, 1.1, 0.85, ghost=False)
    chain(ink_layer, [(X + 132, 1156), (X + 158, 1202), (X + 170, 1254)], 6, 8, INK, 1.4, 0.9)
    chain(cons_layer, [(X + 170, 1254), (X + 178, 1278)], 2, 8, CONS, 1.2, 0.55)
    hatch(faint_layer, ax - 20, ay + 34, 22, 24, 62, 4.5)

def right_column():
    X, Wp = 920, 272
    # -- weapon design
    frame(X, 150, Wp, 440, "武器设计（长枪）", "WEAPON")
    for (sx, inked) in [(X + 84, True), (X + 190, False)]:
        Ltop, Lbot = 190, 560
        if inked:
            line(ink_layer, sx, Ltop + 96, sx, Lbot - 26, INK, 1.8, 0.9)
            curve(ink_layer, [(sx, Ltop), (sx - 13, Ltop + 42), (sx - 9, Ltop + 78), (sx - 2, Ltop + 92)], INK, 1.9)
            curve(ink_layer, [(sx, Ltop), (sx + 13, Ltop + 42), (sx + 9, Ltop + 78), (sx + 2, Ltop + 92)], INK, 1.9)
            line(ink_layer, sx, Ltop + 6, sx, Ltop + 90, INK_F, 1.0, 0.5, ghost=False)
            curve(ink_layer, [(sx - 3, Ltop + 94), (sx - 19, Ltop + 103), (sx - 6, Ltop + 116)], INK, 1.6)
            curve(ink_layer, [(sx + 3, Ltop + 94), (sx + 19, Ltop + 103), (sx + 6, Ltop + 116)], INK, 1.6)
            for yy in range(Ltop + 208, Ltop + 242, 8):
                line(ink_layer, sx - 4, yy + 3, sx + 4, yy, INK_F, 1.1, 0.65, ghost=False)
            curve(ink_layer, [(sx - 1, Ltop + 248), (sx - 10, Ltop + 280), (sx - 7, Ltop + 312)], INK, 1.3)
            curve(red_layer, [(sx + 1, Ltop + 248), (sx + 8, Ltop + 282), (sx + 5, Ltop + 312)], RED, 1.5)
            pencil(ink_layer, f"M {fmt(sx - 4)},{fmt(Lbot - 26)} L {fmt(sx)},{fmt(Lbot)} L {fmt(sx + 4)},{fmt(Lbot - 26)}", INK, 1.6, 0.9)
            ztext(sx, 582, "成稿示范", 10, ANNO, 1.5, "middle", 0.85)
        else:
            line(cons_layer, sx, Ltop, sx, Lbot, CONS, 1.2, 0.65, dash="8 6")
            pencil(cons_layer, f"M {fmt(sx)},{fmt(Ltop)} L {fmt(sx - 14)},{fmt(Ltop + 46)} L {fmt(sx)},{fmt(Ltop + 92)} "
                               f"L {fmt(sx + 14)},{fmt(Ltop + 46)} Z", CONS, 1.3, 0.72)
            line(cons_layer, sx - 17, Ltop + 100, sx + 17, Ltop + 100, CONS, 1.2, 0.65)
            circle(cons_layer, sx, Ltop + 234, 10, CONS, 1.2, 0.65, dash="4 3")
            line(cons_layer, sx - 8, Ltop + 300, sx + 8, Ltop + 300, CONS_F, 1.1, 0.55, ghost=False)
            ztext(sx, 582, "起稿 · 待完成", 10, CONS, 1.5, "middle", 0.9)

    # -- elements
    frame(X, 640, Wp, 118, "元素", "MOTIF")
    items = [("羽翼 · 神圣", ANNO), ("锁链 · 束缚", ANNO), ("碎晶 · 秩序", ANNO), ("暗红 · 点缀", RED)]
    for i, (s, c) in enumerate(items):
        y = 668 + i * 22
        circle(red_layer if c == RED else anno_layer, X + 22, y - 4, 2.4, c, 1.2, 0.9, ghost=False)
        ztext(X + 36, y, s, 12, c, 2)

    # -- back view
    frame(X, 800, Wp, 320, "背视图", "BACK")
    bx, by = X + 136, 862
    circle(cons_layer, bx, by, 16, CONS, 1.2, 0.75)
    curve(cons_layer, [(bx - 12, by + 13), (bx - 6, by + 24)], CONS, 1.1, 0.65)
    curve(cons_layer, [(bx + 12, by + 13), (bx + 6, by + 24)], CONS, 1.1, 0.65)
    curve(cons_layer, [(bx - 44, by + 36), (bx, by + 26), (bx + 44, by + 36)], CONS, 1.3)   # shoulders
    line(cons_layer, bx, by + 26, bx, by + 128, CONS, 1.3, 0.75)                             # spine
    curve(cons_layer, [(bx - 44, by + 36), (bx - 34, by + 96), (bx - 26, by + 124)], CONS, 1.2, 0.7)
    curve(cons_layer, [(bx + 44, by + 36), (bx + 34, by + 96), (bx + 26, by + 124)], CONS, 1.2, 0.7)
    # wing bones sweeping UP from shoulder blades
    curve(cons_layer, [(bx - 14, by + 46), (bx - 66, by + 10), (bx - 104, by - 28)], CONS, 1.5)
    curve(cons_layer, [(bx + 14, by + 46), (bx + 66, by + 10), (bx + 104, by - 28)], CONS, 1.5)
    joint(cons_layer, bx - 66, by + 10, 4); joint(cons_layer, bx + 66, by + 10, 4)
    curve(cons_layer, [(bx - 104, by - 28), (bx - 118, by + 30), (bx - 96, by + 96), (bx - 54, by + 96), (bx - 20, by + 66)], CONS, 1.2, 0.65, dash="6 5")
    curve(cons_layer, [(bx + 104, by - 28), (bx + 118, by + 30), (bx + 96, by + 96), (bx + 54, by + 96), (bx + 20, by + 66)], CONS, 1.2, 0.65, dash="6 5")
    for s in (-1, 1):
        for (p, q) in [((bx + s * 96, by - 10), (bx + s * 104, by + 58)),
                       ((bx + s * 76, by + 8), (bx + s * 80, by + 78)),
                       ((bx + s * 52, by + 26), (bx + s * 50, by + 84))]:
            line(cons_layer, p[0], p[1], q[0], q[1], CONS_F, 1.0, 0.5, ghost=False, dash="4 4")
    # cape from shoulders to base
    curve(cons_layer, [(bx - 40, by + 44), (bx - 56, by + 130), (bx - 48, by + 212)], CONS, 1.3, 0.7, dash="6 5")
    curve(cons_layer, [(bx + 40, by + 44), (bx + 56, by + 130), (bx + 50, by + 212)], CONS, 1.3, 0.7, dash="6 5")
    curve(cons_layer, [(bx - 48, by + 212), (bx - 12, by + 222), (bx + 24, by + 218), (bx + 50, by + 212)], CONS, 1.2, 0.6, dash="6 5")
    line(cons_layer, bx - 14, by + 128, bx - 20, by + 216, CONS, 1.2, 0.7)
    line(cons_layer, bx + 14, by + 128, bx + 18, by + 216, CONS, 1.2, 0.7)
    ellipse_arc(cons_layer, bx, by + 232, 76, 15, 0, 6.28, CONS, 1.2, 0.7)
    ztext(X + 136, 1106, "整体为起稿 · 待补全", 10, CONS, 1.5, "middle", 0.85)

    # -- base detail
    frame(X, 1160, Wp, 260, "底座细节", "BASE")
    cx2, cy2 = X + 136, 1354
    ellipse_arc(cons_layer, cx2, cy2, 104, 26, 0, 6.28, CONS, 1.3, 0.72)
    ellipse_arc(ink_layer, cx2, cy2 + 32, 110, 28, 1.0, 3.2, INK, 1.7, 0.9)
    def crys(layer, bx_, tx_, ty_, w_, inked):
        c = INK if inked else CONS
        pencil(layer, f"M {fmt(bx_ - w_)},{fmt(cy2 - 4)} L {fmt(bx_ - w_ * 0.5)},{fmt(ty_ + 14)} L {fmt(tx_)},{fmt(ty_)} "
                      f"L {fmt(bx_ + w_ * 0.55)},{fmt(ty_ + 20)} L {fmt(bx_ + w_)},{fmt(cy2 - 8)}",
               c, 1.7 if inked else 1.3, 0.9 if inked else 0.7)
        if inked:
            line(layer, bx_ - w_ * 0.5, ty_ + 14, bx_ - w_ * 0.1, cy2 - 10, INK_F, 1.0, 0.55, ghost=False)
    crys(ink_layer, cx2 - 52, cx2 - 62, 1248, 18, True)
    crys(ink_layer, cx2 - 8, cx2 - 12, 1216, 16, True)
    crys(cons_layer, cx2 + 38, cx2 + 48, 1252, 16, False)
    crys(cons_layer, cx2 + 72, cx2 + 86, 1298, 12, False)
    chain(ink_layer, [(cx2 - 96, cy2 + 6), (cx2 - 30, cy2 + 22)], 5, 6, INK, 1.3, 0.85)
    chain(cons_layer, [(cx2 - 30, cy2 + 22), (cx2 + 52, cy2 + 20)], 5, 6, CONS, 1.1, 0.55)
    hatch(faint_layer, cx2 - 44, cy2 + 14, 40, 14, 6, 4.5)

# ================================================================== BOTTOM STRIP
def mini_gesture(cx, base):
    curve(cons_layer, [(cx + 2, base - 176), (cx - 4, base - 130), (cx + 4, base - 84), (cx - 2, base - 8)], CONS, 1.4)
    circle(cons_layer, cx, base - 186, 11, CONS, 1.2, 0.8)
    line(cons_layer, cx - 26, base - 200, cx - 26, base - 16, CONS, 1.0, 0.6)
    line(cons_layer, cx - 34, base, cx + 34, base, CONS_F, 1.0, 0.5, ghost=False)

def mini_structure(cx, base):
    mini_gesture(cx, base)
    ellipse_arc(cons_layer, cx, base - 140, 17, 21, 0, 6.28, CONS, 1.1, 0.7)
    pencil(cons_layer, f"M {fmt(cx - 12)},{fmt(base - 112)} L {fmt(cx + 12)},{fmt(base - 112)} "
                       f"L {fmt(cx + 14)},{fmt(base - 92)} L {fmt(cx - 14)},{fmt(base - 92)} Z", CONS, 1.1, 0.7)
    for s in (-1, 1):
        curve(cons_layer, [(cx + 8 * s, base - 92), (cx + 10 * s, base - 50), (cx + 8 * s, base - 8)], CONS, 1.1)
        joint(cons_layer, cx + 9 * s, base - 50, 3.5)
    curve(cons_layer, [(cx - 6, base - 152), (cx - 36, base - 174), (cx - 58, base - 194)], CONS, 1.2)
    curve(cons_layer, [(cx + 6, base - 152), (cx + 36, base - 174), (cx + 58, base - 194)], CONS, 1.2)

def mini_finished(cx, base):
    # hooded head
    curve(ink_layer, [(cx - 12, base - 180), (cx - 10, base - 196), (cx, base - 202), (cx + 10, base - 196), (cx + 12, base - 180)], INK, 1.6)
    curve(ink_layer, [(cx - 12, base - 180), (cx - 8, base - 172), (cx + 8, base - 172), (cx + 12, base - 180)], INK, 1.3)
    # body: cloak A-line
    curve(ink_layer, [(cx - 12, base - 172), (cx - 20, base - 130), (cx - 22, base - 60), (cx - 26, base - 8)], INK, 1.8)
    curve(ink_layer, [(cx + 12, base - 172), (cx + 20, base - 130), (cx + 22, base - 60), (cx + 26, base - 8)], INK, 1.8)
    curve(ink_layer, [(cx - 4, base - 120), (cx - 6, base - 60), (cx - 4, base - 12)], INK_F, 1.1, 0.55)
    # wings: smooth top edge + three feather tips each
    curve(ink_layer, [(cx - 10, base - 160), (cx - 44, base - 184), (cx - 66, base - 200)], INK, 1.7)
    for (p, t) in [((cx - 58, base - 192), (cx - 62, base - 158)), ((cx - 44, base - 182), (cx - 44, base - 148)),
                   ((cx - 30, base - 172), (cx - 26, base - 144))]:
        feather(ink_layer, p[0], p[1], t[0], t[1], 6, INK, 1.3, 0.85, rib=False)
    curve(ink_layer, [(cx + 10, base - 160), (cx + 44, base - 184), (cx + 66, base - 200)], INK, 1.7)
    for (p, t) in [((cx + 58, base - 192), (cx + 62, base - 158)), ((cx + 44, base - 182), (cx + 44, base - 148)),
                   ((cx + 30, base - 172), (cx + 26, base - 144))]:
        feather(ink_layer, p[0], p[1], t[0], t[1], 6, INK, 1.3, 0.85, rib=False)
    # spear
    line(ink_layer, cx - 34, base - 210, cx - 34, base - 6, INK, 1.5, 0.9)
    pencil(ink_layer, f"M {fmt(cx - 34)},{fmt(base - 224)} L {fmt(cx - 39)},{fmt(base - 206)} "
                      f"L {fmt(cx - 34)},{fmt(base - 194)} L {fmt(cx - 29)},{fmt(base - 206)} Z", INK, 1.3, 0.9)
    ellipse_arc(ink_layer, cx, base, 42, 9, 0, 6.28, INK, 1.4, 0.85)
    line(ink_layer, cx - 14, base - 4, cx - 10, base - 22, INK, 1.2, 0.7, ghost=False)
    line(ink_layer, cx + 8, base - 22, cx + 12, base - 4, INK, 1.2, 0.7, ghost=False)

def bottom_strip():
    Y = 1470
    ztext(50, Y + 8, "绘制步骤", 14, ANNO, 3)
    mtext(150, Y + 8, "PROCESS", 8, ANNO, "start", 0.55)
    labels = ["① 起稿（生成）", "② 搭结构（生成）", "③ 成稿（手绘示范）"]
    for i, cx in enumerate((150, 330, 512)):
        [mini_gesture, mini_structure, mini_finished][i](cx, Y + 218)
        ztext(cx, Y + 244, labels[i], 11, ANNO, 1, "middle", 0.9)
        if i < 2:
            arx = cx + 92
            line(anno_layer, arx - 14, Y + 120, arx + 14, Y + 120, ANNO, 1.3, 0.8, ghost=False)
            pencil(anno_layer, f"M {fmt(arx + 8)},{fmt(Y + 114)} L {fmt(arx + 15)},{fmt(Y + 120)} L {fmt(arx + 8)},{fmt(Y + 126)}", ANNO, 1.3, 0.8, ghost=False)
    ztext(512, Y + 262, "全高约 260cm（含底座）", 10, ANNO, 1, "middle", 0.75)

    lx = 660
    ztext(lx, Y + 8, "图例", 14, ANNO, 3)
    mtext(lx + 52, Y + 8, "LEGEND", 8, ANNO, "start", 0.55)
    line(cons_layer, lx, Y + 44, lx + 64, Y + 44, CONS, 1.5, 0.85)
    ztext(lx + 78, Y + 48, "生成起稿线 · 定形参考", 12, ANNO, 1)
    line(ink_layer, lx, Y + 82, lx + 64, Y + 82, INK, 2.0, 0.9)
    ztext(lx + 78, Y + 86, "示范完成线 · 跟着画", 12, ANNO, 1)
    line(anno_layer, lx, Y + 120, lx + 64, Y + 120, FRAME, 1.2, 0.7, ghost=False, dash="5 5")
    ztext(lx + 78, Y + 124, "虚线与留白 · 由你补全", 12, ANNO, 1)
    line(red_layer, lx, Y + 158, lx + 64, Y + 158, RED, 1.8, 0.9)
    ztext(lx + 78, Y + 162, "暗红点缀 · 全图仅三处", 12, ANNO, 1)

    ux = 952
    ztext(ux, Y + 8, "使用建议", 14, ANNO, 3)
    mtext(ux + 82, Y + 8, "HOW TO", 8, ANNO, "start", 0.55)
    tips = ["① 打印后垫板临摹或直接加深", "② 铅笔沿浅线确定外形", "③ 参考深线补全右翼与织物", "④ 统一阴影 · 最后点暗红"]
    for i, s in enumerate(tips):
        ztext(ux, Y + 44 + i * 30, s, 11, ANNO, 1)
    # seal
    sx_, sy_ = 1128, Y + 168
    pencil(red_layer, f"M {fmt(sx_)},{fmt(sy_)} L {fmt(sx_ + 46)},{fmt(sy_ + 1)} L {fmt(sx_ + 45)},{fmt(sy_ + 47)} "
                      f"L {fmt(sx_ - 1)},{fmt(sy_ + 46)} Z", RED, 2.2, 0.85)
    anno_layer.append(f'<text x="{sx_ + 23}" y="{sy_ + 33}" class="zh" font-size="20" fill="{RED}" '
                      f'text-anchor="middle" letter-spacing="2" opacity="0.9">未完</text>')
    mtext(sx_ + 23, sy_ + 62, "TO BE FINISHED", 7, RED, "middle", 0.7)

# ================================================================== build
header()
main_figure()
left_column()
right_column()
bottom_strip()

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
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2"/>
  </filter>
  <filter id="wobM" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.016" numOctaves="2" seed="7" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="4.2"/>
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

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sheet.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(svg)
print("wrote", out, len(svg), "bytes")
