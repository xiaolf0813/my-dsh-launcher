# Generates a Lottie loading animation from dsh-favicon.svg:
# a whale cruising in place (loading), then dashing out to the right,
# and swimming back in from the left for a seamless 3.0s loop.
# Usage: python generate_fish_loading.py
# Tunables live in the CFG block below.
import re, math, json, os

SVG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dsh-favicon.svg")
OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- CFG
FR, OP, W, H = 60, 180, 200, 120          # 3.0 s loop @ 60 fps
SCALE = 1.3                                # whale scale relative to 50px svg
CX, CY = 24.9, 25.2                        # whale centroid in svg coords
HOME_X, HOME_Y = 100.0, 60.0               # whale center on canvas

SWAY_A, SWAY_T = 7.0, 36                   # cruise x sway  (period must divide OP)
BOB_A,  BOB_T  = 5.0, 36                   # cruise y bob   (null layer)
PITCH_M, PITCH_A, PITCH_T = -2.0, 3.0, 36  # cruise nose pitch wave
BREATH_A = 2.0                             # cruise scale breathing %

T_ANT0, T_ANT1 = 84, 100                   # anticipation window (pull back + squash)
T_DASH1       = 140                        # whale fully off right edge
T_RE0         = 144                        # whale re-enters from left edge
X_OUT, X_IN   = 234.0, -58.0               # fully off right edge at ~T_DASH1 / re-enter from left
ANT_X, ANT_Y  = 74.0, 60.0                 # anticipation end position
DASH_Y        = 54.0                       # exit y (slight lift)
RE_IN_Y       = 66.0                       # re-entry y (slightly low, settles up)

# accent colors (bubbles / streaks / waves); brand whale blue #4D6BFE
BRAND_BLUE = [0x4D / 255, 0x6B / 255, 0xFE / 255, 1.0]
THEMES = {
    "light": {"fish": BRAND_BLUE,               "bubble": [0.49, 0.64, 0.77, 1.0],
              "streak": [0.42, 0.56, 0.67, 1.0], "wave": [0.70, 0.78, 0.84, 1.0],
              "bg_hint": None},
    "dark":  {"fish": BRAND_BLUE,               "bubble": [0.38, 0.47, 0.58, 1.0],
              "streak": [0.42, 0.52, 0.63, 1.0], "wave": [0.30, 0.38, 0.47, 1.0],
              "bg_hint": None},
}

BUBBLES = [  # diameter, period(frames, must divide OP), x0, phase(deg)
    (9.0, 90, 119.0,   0.0),
    (7.0, 60, 128.0, 120.0),
    (5.0, 45, 112.0, 240.0),
]
STREAKS = [  # length, y, x0, t0 (appear window is t0..t0+40)
    (22.0, 46.0, 54.0,  96),
    (15.0, 62.0, 36.0, 100),
    (10.0, 76.0, 70.0,  92),
]

# ------------------------------------------------------- easing helpers
EASE_SINE    = ({"x": [0.37], "y": [0.0]}, {"x": [0.63], "y": [1.0]})
EASE_INOUT   = ({"x": [0.40], "y": [0.0]}, {"x": [0.20], "y": [1.0]})   # (0.4,0,0.2,1)
EASE_IN_ACC  = ({"x": [0.30], "y": [0.0]}, {"x": [1.00], "y": [1.0]})   # MD3 accelerate
EASE_OUT_EMP = ({"x": [0.05], "y": [0.70]}, {"x": [0.10], "y": [1.0]})  # MD3 emphasized
EASE_OUT_SOFT= ({"x": [0.10], "y": [0.55]}, {"x": [0.15], "y": [1.0]})  # gentler decelerate
EASE_LINEAR  = ({"x": [0.333], "y": [0.333]}, {"x": [0.667], "y": [0.667]})

def K(t, v, ease=EASE_SINE, hold=False, to=None, ti=None):
    if not isinstance(v, (list, tuple)):
        v = [v]                      # animated keyframes require array values
    k = {"t": t, "s": v}
    if hold:
        k["h"] = 1
    else:
        k["o"], k["i"] = ease[0], ease[1]
    if to is not None: k["to"] = to
    if ti is not None: k["ti"] = ti
    return k

def static_p(v):        return {"a": 0, "k": v}
def anim_p(keys):       return {"a": 1, "k": keys}

# --------------------------------------------------------- cruise waves
def sway(f):   return HOME_X - SWAY_A * math.cos(2 * math.pi * f / SWAY_T)
def bob(f):    return -BOB_A * math.cos(2 * math.pi * f / BOB_T)   # null is relative: whale adds its own HOME_Y
def pitch(f):  return PITCH_M + PITCH_A * math.sin(2 * math.pi * f / PITCH_T)
def breath(f): return 100.0 + BREATH_A * math.sin(2 * math.pi * f / PITCH_T)

# --------------------------------------------------------- svg -> lottie
def parse_subpaths(d):
    tokens = re.findall(r"([MCZz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)", d)
    nums, cmds = [], []
    for letter, num in tokens:
        if letter: cmds.append(letter)
        elif num: nums.append(float(num))
    subs, cur, start, i = [], None, None, 0
    def take(n):
        nonlocal i
        v = nums[i:i + n]; i += n; return v
    for c in cmds:
        if c == "M":
            if cur: subs.append(cur)
            start = take(2); cur = {"start": start, "segs": []}
        elif c == "C":
            c1x, c1y, c2x, c2y, x, y = take(6)
            cur["segs"].append(((c1x, c1y), (c2x, c2y), (x, y)))
        elif c in "Zz":
            cur["segs"].append((None, None, start))
    subs.append(cur)
    return subs

def bake(x, y):
    """mirror around whale centroid (face right) and map onto canvas."""
    return (round(HOME_X - (x - CX) * SCALE, 2), round(HOME_Y + (y - CY) * SCALE, 2))

def subpath_to_lottie(sub):
    # collect segments: anchors[j] -> anchors[j+1] with (c1, c2) absolute controls
    anchors = [sub["start"]]
    segs = []
    for c1, c2, b in sub["segs"]:
        if c1 is None:                       # Z: straight close
            if b != anchors[-1]:
                segs.append((anchors[-1], b, None, None))
                anchors.append(b)
            continue
        segs.append((anchors[-1], b, c1, c2))
        anchors.append(b)
    closed = len(anchors) > 1 and anchors[0] == anchors[-1]
    if closed:
        anchors.pop()
        # segs[j] still starts at anchors[j]; segs[-1] closes back to anchors[0]
    V, ins, outs = [], [], []
    n = len(anchors)
    for j in range(n):
        vj = bake(*anchors[j])
        seg_out = segs[j] if j < n else None
        seg_in = segs[j - 1]
        c1 = seg_out[2] if seg_out else None
        c2 = seg_in[3] if seg_in else None
        o = bake(*c1) if c1 is not None else vj
        i = bake(*c2) if c2 is not None else vj
        V.append(vj)
        outs.append([round(o[0] - vj[0], 2), round(o[1] - vj[1], 2)])
        ins.append([round(i[0] - vj[0], 2), round(i[1] - vj[1], 2)])
    return {"i": ins, "o": outs, "v": V, "c": closed}

def fish_shape_paths(theme):
    svg = open(SVG_PATH, encoding="utf-8").read()
    d = re.search(r'\bd="([^"]+)"', svg).group(1)
    shapes = []
    for sub in parse_subpaths(d):
        shapes.append({"ty": "sh", "nm": "fish-path",
                       "ks": static_p(subpath_to_lottie(sub))})
    shapes.append({"ty": "fl", "nm": "fill", "c": static_p(theme["fish"]),
                   "o": static_p(100), "r": 1})
    return shapes

# ------------------------------------------------------------ layer bits
def tr(p=[0, 0]):
    return {"ty": "tr", "p": static_p(p), "a": static_p([0, 0]),
            "s": static_p([100, 100]), "r": static_p(0), "o": static_p(100)}

def shape_layer(ind, nm, shapes, ks, parent=None):
    L = {"ddd": 0, "ind": ind, "ty": 4, "nm": nm, "sr": 1, "ks": ks,
         "ao": 0, "shapes": shapes, "ip": 0, "op": OP, "st": 0, "bm": 0}
    if parent: L["parent"] = parent
    return L

def null_layer(ind, nm, ks):
    return {"ddd": 0, "ind": ind, "ty": 3, "nm": nm, "sr": 1, "ks": ks,
            "ao": 0, "ip": 0, "op": OP, "st": 0, "bm": 0}

# ------------------------------------------------------------ whale keys
def whale_pos_keys():
    ks = []
    for f in range(0, 82, 9):                       # cruise grid 0..81
        ks.append(K(f, [round(sway(f), 2), HOME_Y]))
    ks.append(K(84, [round(sway(84), 2), HOME_Y]))  # sway(84)=91.5
    ks.append(K(T_ANT1, [ANT_X, ANT_Y], EASE_INOUT, to=[14, 0], ti=[-12, 0]))
    ks.append(K(T_DASH1, [X_OUT, DASH_Y], EASE_IN_ACC))
    ks.append(K(T_DASH1, [X_OUT, DASH_Y], hold=True))   # hold while off-screen
    ks.append(K(T_RE0, [X_IN, RE_IN_Y], EASE_OUT_SOFT, to=[28, -4], ti=[-26, 2]))
    ks.append(K(OP, [round(sway(0), 2), HOME_Y]))       # = f0 value: seamless
    return ks

def whale_rot_keys():
    ks = [K(f, round(pitch(f), 2)) for f in range(0, 82, 9)]
    ks.append(K(84, round(pitch(84), 2)))
    ks.append(K(96, -8.0, EASE_INOUT))    # wind-up: nose up, body rocks back
    ks.append(K(104, -8.0))
    ks.append(K(114, -5.0))
    ks.append(K(126, -2.0))
    ks.append(K(140, 0.0))
    ks.append(K(150, -2.0))
    ks.append(K(162, -4.0))
    ks.append(K(171, round(pitch(171), 2)))  # -5, rejoins cruise wave
    ks.append(K(OP, round(pitch(0), 2)))
    return ks

def whale_scale_keys():
    ks = []
    for f in range(0, 82, 9):
        b = round(breath(f), 2)
        ks.append(K(f, [b, b]))
    b84 = round(breath(84), 2)
    ks.append(K(84, [b84, b84]))
    ks.append(K(96, [96.5, 103.5], EASE_INOUT))   # squash during wind-up
    ks.append(K(104, [101, 99]))
    ks.append(K(114, [107, 93]))                  # stretch at full speed
    ks.append(K(128, [106, 94]))
    ks.append(K(140, [105, 95], hold=True))
    ks.append(K(144, [105, 95]))
    ks.append(K(158, [102, 98]))
    ks.append(K(168, [round(breath(168), 2)] * 2))
    ks.append(K(171, [round(breath(171), 2)] * 2))
    ks.append(K(OP, [100.0, 100.0]))
    return ks

def bob_keys():
    return [K(f, [0.0, round(bob(f), 2)]) for f in range(0, OP + 1, 9)]

# ------------------------------------------------------ secondary layers
def bubble_layer(ind, d, T, x0, phase, theme):
    cyc = OP // T
    pa, sa, oa = [], [], []
    for k in range(cyc):
        t0 = k * T
        # last opacity key of the final cycle needs t=OP, so include u=1.0 there
        stops = [(0.0, 0), (0.18, 70), (0.72, 70), (0.95, 12)]
        if k == cyc - 1: stops.append((1.0, 0))
        for u, al in stops:
            f = round(t0 + u * T)
            y = 72.0 - 32.0 * (1 - math.cos(math.pi * u)) / 2
            x = x0 + 4.0 * math.sin(2 * math.pi * f / T + math.radians(phase))
            sc = 40.0 + 60.0 * u
            pa.append(K(f, [round(x, 2), round(y, 2)], EASE_SINE))
            sa.append(K(f, [round(sc, 2), round(sc, 2)], EASE_SINE))
            oa.append(K(f, al, EASE_SINE))
    ks = {"o": anim_p(oa), "r": static_p(0), "p": anim_p(pa),
          "a": static_p([0, 0]), "s": anim_p(sa)}
    shapes = [{"ty": "gr", "nm": "bubble", "it": [
        {"ty": "el", "p": static_p([0, 0]), "s": static_p([d, d])},
        {"ty": "fl", "c": static_p(theme["bubble"]), "o": static_p(100), "r": 1},
        tr()]}]
    return shape_layer(ind, f"bubble-{ind}", shapes, ks)

def streak_layer(ind, ln, y, x0, t0, theme):
    pa, oa = [], []
    for f, x, al in [(t0, x0, 0), (t0 + 8, x0, 85), (t0 + 26, x0 - 9, 38),
                     (t0 + 40, x0 - 18, 0)]:
        pa.append(K(f, [x, y], EASE_SINE))
        oa.append(K(f, al, EASE_SINE))
    ks = {"o": anim_p(oa), "r": static_p(0), "p": anim_p(pa),
          "a": static_p([0, 0]), "s": static_p([100, 100])}
    path = {"ty": "sh", "nm": "streak", "ks": static_p(
        {"i": [[0, 0], [0, 0]], "o": [[0, 0], [0, 0]],
         "v": [[-ln / 2, 0], [ln / 2, 0]], "c": False})}
    shapes = [{"ty": "gr", "nm": "streak-grp", "it": [
        path,
        {"ty": "st", "c": static_p(theme["streak"]), "o": static_p(100),
         "w": static_p(3.5), "lc": 2, "lj": 2},
        tr()]}]
    return shape_layer(ind, f"streak-{ind}", shapes, ks)

def wave_layer(ind, amp, y, phase_px, shift, opac, sw, theme):
    pts, ins, outs = [], [], []
    x = -60.0
    while x <= 341.0:
        yy = amp * math.sin(2 * math.pi * (x - phase_px) / 80.0)
        pts.append([round(x, 1), round(yy, 2)])
        ins.append([0, 0]); outs.append([0, 0])
        x += 5.0
    path = {"ty": "sh", "nm": "wave", "ks": static_p(
        {"i": ins, "o": outs, "v": pts, "c": False})}
    ks = {"o": static_p(opac), "r": static_p(0),
          "p": anim_p([K(0, [0, y], EASE_LINEAR), K(OP, [shift, y])]),
          "a": static_p([0, 0]), "s": static_p([100, 100])}
    shapes = [{"ty": "gr", "nm": "wave-grp", "it": [
        path,
        {"ty": "st", "c": static_p(theme["wave"]), "o": static_p(100),
         "w": static_p(sw), "lc": 2, "lj": 2},
        tr()]}]
    return shape_layer(ind, f"wave-{ind}", shapes, ks)

# ------------------------------------------------------------------ main
def build(theme_name):
    th = THEMES[theme_name]
    bob_null = null_layer(2, "bob-null", {
        "o": static_p(0), "r": static_p(0), "p": anim_p(bob_keys()),
        "a": static_p([0, 0]), "s": static_p([100, 100])})
    whale = shape_layer(1, "whale", fish_shape_paths(th), {
        "o": static_p(100), "r": anim_p(whale_rot_keys()),
        "p": anim_p(whale_pos_keys()), "a": static_p([HOME_X, HOME_Y]),
        "s": anim_p(whale_scale_keys())}, parent=2)
    layers = [whale, bob_null]
    ind = 3
    for d, T, x0, ph in BUBBLES:
        layers.append(bubble_layer(ind, d, T, x0, ph, th)); ind += 1
    for ln, y, x0, t0 in STREAKS:
        layers.append(streak_layer(ind, ln, y, x0, t0, th)); ind += 1
    layers.append(wave_layer(ind, 5.0, 97, 0, -80, 34, 2.0, th)); ind += 1
    layers.append(wave_layer(ind, 3.5, 108, 40, -160, 24, 1.5, th)); ind += 1
    return {"v": "5.9.6", "fr": FR, "ip": 0, "op": OP, "w": W, "h": H,
            "nm": f"dsh-fish-loading-{theme_name}", "ddd": 0,
            "assets": [], "layers": layers,
            "meta": {"g": "generate_fish_loading.py", "theme": theme_name}}

for name in THEMES:
    data = build(name)
    out = os.path.join(OUT_DIR, f"dsh-fish-loading{'' if name == 'light' else '-dark'}.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
    print(out, os.path.getsize(out), "bytes,", len(data["layers"]), "layers")
