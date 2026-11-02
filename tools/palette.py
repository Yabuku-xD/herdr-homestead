#!/usr/bin/env python3
"""Writes Homestead's Vesper colors into the layout and measures every rendered pair.

Vesper defines surfaces, one accent, one mint and one red, and no terminal colors.
Its values stay as they are; the rest are derived in OKLCH at Vesper's own lightness
and chroma, so they read as one family. Run from the repo root:
    python3 tools/palette.py
"""
import json
import math
import sys
from pathlib import Path

LAYOUT = Path("layouts/Homestead.json")

# Reference values, as Vesper defines them, except QUIET: its #7e7e7e measures 4.46:1
# on the card, so it moves two steps lighter to hold 4.5:1.
INK, CARD, FIELD, LIFT, PRESS, LINE, FAINT, QUIET, SOFT = (
    "#101010", "#161616", "#1c1c1c", "#232323", "#282828", "#343434", "#505050", "#808080", "#a0a0a0")
WHITE, ORANGE, ORANGE_LIGHT, MINT, RED = "#ffffff", "#ffc799", "#ffcfa8", "#99ffe4", "#ff8080"


def to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def to_srgb(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def rgb(h):
    return [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]


def hexa(c):
    return "#" + "".join(f"{round(max(0, min(1, v)) * 255):02x}" for v in c)


def oklch(h):
    r, g, b = map(to_lin, rgb(h))
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l, m, s = (math.copysign(abs(v) ** (1 / 3), v) for v in (l, m, s))
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    b2 = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return L, math.hypot(a, b2), math.degrees(math.atan2(b2, a)) % 360


def from_oklch(L, C, H):
    a, b = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s]


def in_gamut(L, C, H):
    return all(-1e-4 <= v <= 1 + 1e-4 for v in from_oklch(L, C, H))


def mapped(L, C, H):
    """Reduces chroma to the sRGB boundary, holding lightness and hue."""
    while C > 0 and not in_gamut(L, C, H):
        C -= 0.001
    return hexa([to_srgb(max(0, v)) for v in from_oklch(L, C, H)])


def luminance(c):
    r, g, b = map(to_lin, c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    x, y = luminance(a), luminance(b)
    return (max(x, y) + 0.05) / (min(x, y) + 0.05)


def over(fg, alpha, bg):
    return [f * alpha + b * (1 - alpha) for f, b in zip(rgb(fg), rgb(bg))]


L_MINT, C_MINT, H_MINT = oklch(MINT)
L_RED, C_RED, H_RED = oklch(RED)
L_ORANGE, C_ORANGE, H_ORANGE = oklch(ORANGE)
# Derived hues take the lightness of Vesper's red and orange and a calm chroma.
L_HUE, C_HUE = 0.80, 0.09
BLUE = mapped(L_HUE, C_HUE, 255)
MAGENTA = mapped(L_HUE, C_HUE, 330)
CYAN = mapped(0.85, 0.08, 205)


def brighter(h):
    L, C, H = oklch(h)
    return mapped(min(0.97, L + 0.07), C * 0.75, H)


COLORS = {
    # Surfaces: one ink, the card a step up, and steps of lift for state.
    "chrome": INK, "canvas": INK, "background": CARD, "surface": CARD, "popover": FIELD,
    "raised": LIFT, "hover": FIELD, "selected": PRESS, "border": LIFT, "input": LINE,
    # Text.
    "foreground": WHITE, "muted": SOFT, "dim": QUIET,
    # One accent, for focus and primary action only.
    "accent": ORANGE, "accent_foreground": INK, "solid": ORANGE, "solid_foreground": INK,
    "selection": LINE, "cursor": ORANGE,
    # Status. Working stays neutral, so color always means something needs a look.
    "working": SOFT, "blocked": RED, "done": MINT, "idle": QUIET, "unknown": FAINT,
    # Terminal.
    "ansi0": FIELD, "ansi1": RED, "ansi2": MINT, "ansi3": ORANGE, "ansi4": BLUE, "ansi5": MAGENTA, "ansi6": CYAN,
    "ansi7": SOFT, "ansi8": QUIET, "ansi9": brighter(RED), "ansi10": brighter(MINT), "ansi11": ORANGE_LIGHT,
    "ansi12": brighter(BLUE), "ansi13": brighter(MAGENTA), "ansi14": brighter(CYAN), "ansi15": WHITE,
}

ALERT_FILL = 0x0c / 255
ALERT_CHIP = 0x26 / 255

doc = json.loads(LAYOUT.read_text())
doc["theme"] = {"light": "graphite", "dark": "graphite"}
doc["colors"] = COLORS
LAYOUT.write_text(json.dumps(doc, indent=2) + "\n")

c = {k: rgb(v) for k, v in COLORS.items()}
fill = {name: over(RED, ALERT_FILL, base) for name, base in (("chrome", INK), ("card", CARD))}
chip = over(RED, ALERT_CHIP, INK)
PAIRS = [
    ("foreground on chrome", c["foreground"], c["chrome"], 4.5), ("muted on chrome", c["muted"], c["chrome"], 4.5),
    ("dim on chrome", c["dim"], c["chrome"], 4.5), ("muted on card", c["muted"], c["background"], 4.5),
    ("dim on card", c["dim"], c["background"], 4.5), ("muted on selected", c["muted"], c["selected"], 4.5),
    ("foreground on selected", c["foreground"], c["selected"], 4.5), ("muted on hover", c["muted"], c["hover"], 4.5),
    ("muted on alert fill", c["muted"], fill["chrome"], 4.5), ("foreground on alert fill", c["foreground"], fill["chrome"], 4.5),
    ("muted on alert card", c["muted"], fill["card"], 4.5), ("blocked on chrome", c["blocked"], c["chrome"], 4.5),
    ("blocked on chip", c["blocked"], chip, 3), ("foreground on chip", c["foreground"], chip, 4.5),
    ("accent line on card", c["accent"], c["background"], 3), ("done mark on chrome", c["done"], c["chrome"], 3),
    ("working mark on chrome", c["working"], c["chrome"], 3), ("idle mark on chrome", c["idle"], c["chrome"], 3),
    ("accent text on accent", c["accent_foreground"], c["accent"], 4.5),
]
PAIRS += [(f"{k} on card", c[k], c["background"], 4.5) for k in
          ("ansi1", "ansi2", "ansi3", "ansi4", "ansi5", "ansi6", "ansi7", "ansi8", "ansi9", "ansi10", "ansi11", "ansi12", "ansi13", "ansi14")]
failed = 0
for name, fg, bg, need in PAIRS:
    value = ratio(fg, bg)
    failed += value < need
    print(f"{name:28} {value:5.2f}  {'ok' if value >= need else 'FAIL ' + str(need)}")
print("hues", {k: round(oklch(COLORS[k])[2]) for k in ("blocked", "accent", "done", "ansi4", "ansi5", "ansi6")},
      "L", {k: round(oklch(COLORS[k])[0], 3) for k in ("blocked", "accent", "done", "ansi4", "ansi5", "ansi6")})
print({k: COLORS[k] for k in ("ansi4", "ansi5", "ansi6", "ansi9", "ansi10", "ansi12", "ansi13", "ansi14")})
sys.exit(1 if failed else 0)
