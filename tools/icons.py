#!/usr/bin/env python3
"""Draws every icon natively for each rendered size, so strokes land on whole pixels.

A single drawing scaled to another size lands between pixels and renders soft on a
1x screen. Sizes are odd so a center line falls on a pixel. Run from the repo root:
    python3 tools/icons.py
"""
from pathlib import Path

OUT = Path("mods/homestead/icons")
SIZES = range(11, 25, 2)


def fmt(v):
    return f"{v:g}"


def rect(x, y, w, h, r):
    return f'<rect x="{fmt(x)}" y="{fmt(y)}" width="{fmt(w)}" height="{fmt(h)}" rx="{fmt(r)}"/>'


def path(d):
    return f'<path d="{d}"/>'


def circle(x, y, r):
    return f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(r)}"/>'


def frame(n):
    return rect(1.5, 1.5, n - 3, n - 3, 2)


def tabs(n, c, a, b):
    return frame(n) + path(f"M{fmt(c)} {fmt(a)}V{fmt(b)}")


def panel(n, c, a, b):
    x = a + round((b - a) * 2 / 3)
    return frame(n) + path(f"M{fmt(x)} {fmt(a)}V{fmt(b)}")


def agent(n, c, a, b):
    k = max(2, round(n / 7.5))
    x = a + k + 1
    return frame(n) + path(f"m{fmt(x)} {fmt(c - k)} {k} {k}-{k} {k}") + path(f"M{fmt(c + 1)} {fmt(c + k)}h{k}")


def fleet(n, c, a, b):
    w = (n - 5) // 2
    far = a + w + 2
    return "".join(rect(x, y, w, w, 1) for y in (a, far) for x in (a, far))


def github(n, c, a, b):
    r = max(1.5, round(n / 7.5))
    x, y = a + r, b - r
    top = a + 3
    return (circle(x, x, r) + circle(x, y, r) + circle(y, y, r)
            + path(f"M{fmt(x)} {fmt(x + r)}V{fmt(y - r)}")
            + path(f"M{fmt(y)} {fmt(y - r)}V{fmt(top + r)}a{fmt(r)} {fmt(r)} 0 0 0-{fmt(r)}-{fmt(r)}H{fmt(c)}")
            + path(f"m{fmt(c + 2)} {fmt(top - 2)}-2 2 2 2"))


def plus(n, c, a, b):
    return path(f"M{fmt(c)} {fmt(a + 1)}V{fmt(b - 1)}") + path(f"M{fmt(a + 1)} {fmt(c)}H{fmt(b - 1)}")


def close(n, c, a, b):
    lo, hi = a + 2, b - 2
    return path(f"M{fmt(lo)} {fmt(lo)}L{fmt(hi)} {fmt(hi)}") + path(f"M{fmt(hi)} {fmt(lo)}L{fmt(lo)} {fmt(hi)}")


def unfold(n, c, a, b):
    k = round((b - a) / 3)
    x = a + 2
    return "".join(path(f"m{fmt(x + i * (k + 1))} {fmt(c - k)} {k} {k}-{k} {k}") for i in (0, 1))


def split_right(n, c, a, b):
    return rect(a, a + 1, b - a, b - a - 2, 1.5) + path(f"M{fmt(c)} {fmt(a + 1)}V{fmt(b - 1)}")


def split_down(n, c, a, b):
    return rect(a, a + 1, b - a, b - a - 2, 1.5) + path(f"M{fmt(a)} {fmt(c)}H{fmt(b)}")


def zoom(n, c, a, b):
    k = max(2, round(n / 5))
    lo, hi = a + 1, b - 1
    return (path(f"M{fmt(hi - k)} {fmt(lo)}H{fmt(hi)}V{fmt(lo + k)}") + path(f"M{fmt(hi)} {fmt(lo)}L{fmt(c + 1)} {fmt(c - 1)}")
            + path(f"M{fmt(lo + k)} {fmt(hi)}H{fmt(lo)}V{fmt(hi - k)}") + path(f"M{fmt(lo)} {fmt(hi)}L{fmt(c - 1)} {fmt(c + 1)}"))


def unzoom(n, c, a, b):
    k = max(2, round(n / 5))
    lo, hi = a + 1, b - 1
    return (path(f"M{fmt(c + 1)} {fmt(c - 1 - k)}V{fmt(c - 1)}H{fmt(c + 1 + k)}") + path(f"M{fmt(hi)} {fmt(lo)}L{fmt(c + 1)} {fmt(c - 1)}")
            + path(f"M{fmt(c - 1)} {fmt(c + 1 + k)}V{fmt(c + 1)}H{fmt(c - 1 - k)}") + path(f"M{fmt(lo)} {fmt(hi)}L{fmt(c - 1)} {fmt(c + 1)}"))


def monitor(n, c, a, b):
    h = round((b - a) * 0.7)
    return rect(a, a, b - a, h, 1) + path(f"M{fmt(c)} {fmt(a + h)}V{fmt(b)}") + path(f"M{fmt(a + 2)} {fmt(b)}H{fmt(b - 2)}")


def server(n, c, a, b):
    h = (n - 5) // 2
    y = a + h + 2
    return rect(a, a, b - a, h, 1) + rect(a, y, b - a, h, 1)


def branch(n, c, a, b):
    r = 1.5
    x, right = a + 2, b - 1
    return (circle(x, a + 1, r) + circle(x, b - 1, r) + circle(right, a + 3, r)
            + path(f"M{fmt(x)} {fmt(a + 2.5)}V{fmt(b - 2.5)}")
            + path(f"M{fmt(right)} {fmt(a + 4.5)}Q{fmt(right)} {fmt(b - 2.5 - 1)} {fmt(x)} {fmt(b - 2.5)}"))


ICONS = {"tabs": tabs, "panel": panel, "agent": agent, "fleet": fleet, "github": github, "plus": plus, "close": close,
         "unfold": unfold, "split-right": split_right, "split-down": split_down, "zoom": zoom, "unzoom": unzoom,
         "monitor": monitor, "server": server, "branch": branch}

OUT.mkdir(parents=True, exist_ok=True)
for name, draw in ICONS.items():
    for n in SIZES:
        a, b, c = 1.5, n - 1.5, n / 2
        body = draw(n, c, a, b)
        (OUT / f"{name}-{n}.svg").write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{n}" height="{n}" viewBox="0 0 {n} {n}" fill="none" '
            f'stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">{body}</svg>\n')
print(len(ICONS) * len(SIZES), "icons")
