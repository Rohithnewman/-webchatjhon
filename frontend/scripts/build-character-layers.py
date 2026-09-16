"""Builds the 2.5D character layers for the animated login from the reference illustration.

Usage:
    python scripts/build-character-layers.py <reference.png> src/widgets/animated-login/ui/hero/assets <preview-dir>

Requires Pillow and numpy. Pixels are never repainted: every layer is the same
artwork with a different alpha mask, so at rest the stack is indistinguishable
from the flat image. The printed layer table goes into `character-layers.ts`.
"""
import sys, os, json
from PIL import Image, ImageFilter
import numpy as np

src = sys.argv[1]; out_dir = sys.argv[2]; preview_dir = sys.argv[3]
os.makedirs(out_dir, exist_ok=True)

im = Image.open(src).convert("RGBA")
a = np.array(im).astype(np.float64)
rgb = a[:, :, :3]
mx = rgb.max(axis=2)

# ── 1. Alpha from the black background ─────────────────────────────────────
bg = mx <= 6
near_bg = bg.copy()
for dy in range(-2, 3):
    for dx in range(-2, 3):
        near_bg |= np.roll(np.roll(bg, dy, 0), dx, 1)

# Colour decontamination. Observed = alpha * colour over black. The true
# colour of an edge pixel is estimated from the solid artwork next to it (a
# 7x7 average, so thin stems still find their own core), which gives
# alpha = observed_max / true_max and removes the dark halo entirely.
solid = ~near_bg & (mx > 6)
inked = mx > 6
def box_sum(arr, r):
    acc = np.zeros_like(arr)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            acc += np.roll(np.roll(arr, dy, 0), dx, 1)
    return acc
w_solid = box_sum(solid.astype(np.float64), 3)
c_solid = np.stack([box_sum(np.where(solid, rgb[:, :, i], 0), 3) for i in range(3)], -1)
# Fallback for hairline strokes with no solid core: the brightest inked pixel
# nearby stands in for the true colour.
best = np.zeros_like(mx)
best_rgb = np.zeros_like(rgb)
for dy in range(-3, 4):
    for dx in range(-3, 4):
        m2 = np.roll(np.roll(np.where(inked, mx, 0), dy, 0), dx, 1)
        c2 = np.roll(np.roll(rgb, dy, 0), dx, 1)
        take = m2 > best
        best = np.where(take, m2, best)
        best_rgb = np.where(take[:, :, None], c2, best_rgb)
has_solid = w_solid > 0
true_rgb = np.where(has_solid[:, :, None], c_solid / np.maximum(w_solid, 1)[:, :, None], best_rgb)
true_max = np.maximum(true_rgb.max(axis=2), 24)

alpha = np.ones_like(mx)
alpha[bg] = 0
fringe = near_bg & ~bg
alpha[fringe] = np.clip(mx[fringe] / true_max[fringe], 0, 1)
alpha[fringe & (mx < 10)] = 0

col = rgb.copy()
f = fringe & (alpha > 0)
col[f] = true_rgb[f]

cut = np.dstack([col, alpha * 255]).astype(np.uint8)
ys, xs = np.where(alpha > 0.02)
M = 6
x0, y0, x1, y1 = max(xs.min() - M, 0), max(ys.min() - M, 0), min(xs.max() + M + 1, im.width), min(ys.max() + M + 1, im.height)
base = Image.fromarray(cut).crop((x0, y0, x1, y1))
W, H = base.size
print("base crop origin", (x0, y0), "size", (W, H))
base.save(f"{out_dir}/professional-base.webp", "WEBP", quality=92, method=6)
base.save(f"{preview_dir}/professional-base.png")

base_np = np.array(base).astype(np.float64)
bA = base_np[:, :, 3] / 255.0
bR, bG, bB = base_np[:, :, 0], base_np[:, :, 1], base_np[:, :, 2]

def blur(mask, r):
    m = Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(r))
    return np.array(m).astype(np.float64) / 255.0

def dilate(mask, r):
    m = mask.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            m = np.maximum(m, np.roll(np.roll(mask, dy, 0), dx, 1))
    return m

def smooth(v, lo, hi):
    t = np.clip((v - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)

Y, X = np.mgrid[0:H, 0:W]
# Coordinates below are in the ORIGINAL image space; convert to crop space.
ox, oy = x0, y0

layers = {}

def save_layer(name, mask, pivot):
    m = np.clip(mask, 0, 1) * bA
    ys, xs = np.where(m > 0.01)
    lx0, ly0, lx1, ly1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    patch = np.dstack([bR, bG, bB, m * 255]).astype(np.uint8)[ly0:ly1, lx0:lx1]
    img = Image.fromarray(patch)
    img.save(f"{out_dir}/professional-{name}.webp", "WEBP", quality=92, method=6)
    img.save(f"{preview_dir}/professional-{name}.png")
    layers[name] = {
        "left": lx0 / W * 100, "top": ly0 / H * 100,
        "width": (lx1 - lx0) / W * 100, "height": (ly1 - ly0) / H * 100,
        # Pivot as % of the patch's own box, for transform-origin.
        "originX": (pivot[0] - ox - lx0) / (lx1 - lx0) * 100,
        "originY": (pivot[1] - oy - ly0) / (ly1 - ly0) * 100,
    }
    print(name, (lx0, ly0, lx1, ly1))

# ── 2. Head: everything above the shoulders, fading out across the neck ────
hx0, hy0, hx1, hy1 = 392 - ox, max(40 - oy, 0), 580 - ox, 232 - oy
head = np.zeros((H, W))
head[hy0:hy1, hx0:hx1] = 1
head *= smooth(X, hx0, hx0 + 10) * (1 - smooth(X, hx1 - 10, hx1))
head *= smooth(Y, hy0, hy0 + 6)
# The neck fade: solid through the jaw (y<=192), gone by the collar (y>=228).
head *= 1 - smooth(Y, 192 - oy, 228 - oy)
save_layer("head", head, (492, 206))

# ── 3. Typing hand: skin-coloured pixels on the keyboard ──────────────────
kx0, ky0, kx1, ky1 = 512 - ox, 318 - oy, 615 - ox, 392 - oy
skin = (bR > 150) & (bR > bG + 28) & (bG > bB) & (bA > 0.5)
hand = np.zeros((H, W))
hand[ky0:ky1, kx0:kx1] = skin[ky0:ky1, kx0:kx1]
hand = dilate(hand, 2)
hand = blur(hand, 1.4)
# Fade at the wrist so the hand blends into the (static) forearm.
hand *= smooth(Y, 326 - oy, 344 - oy)
save_layer("hand", hand, (540, 340))

# ── 4. Torso: soft disc over the shirt, excluding the armchair ─────────────
cx, cy = 478 - ox, 292 - oy
d = np.sqrt(((X - cx) / 128.0) ** 2 + ((Y - cy) / 118.0) ** 2)
torso = 1 - smooth(d, 0.62, 1.0)
chair = smooth(bG - bR, 120, 150) * smooth(bG, 180, 200)
torso *= 1 - chair
torso = blur(torso, 2.5)
# Keep it off the head (head layer owns that) — but overlap the neck so the
# breathing offset is shared.
torso *= 1 - smooth(-Y, -(200 - oy), -(176 - oy))
save_layer("torso", torso, (470, 400))

json.dump({"base": {"width": W, "height": H}, "layers": layers}, open(f"{preview_dir}/layers.json", "w"), indent=2)
print(json.dumps(layers, indent=1))

# ── Preview: patches deliberately displaced so seams show up ───────────────
bg_img = Image.new("RGBA", (W, H), (240, 248, 244, 255))
bg_img.alpha_composite(base)
for name, off in (("torso", (0, 3)), ("head", (0, -4)), ("hand", (0, 4))):
    p = Image.open(f"{preview_dir}/professional-{name}.png")
    L = layers[name]
    px, py = round(L["left"] / 100 * W) + off[0], round(L["top"] / 100 * H) + off[1]
    bg_img.alpha_composite(p, (px, py))
bg_img.save(f"{preview_dir}/preview-displaced.png")
# Mask visualisation
vis = Image.new("RGBA", (W, H), (255, 255, 255, 255)); vis.alpha_composite(base)
tint = {"head": (255, 0, 0), "hand": (0, 0, 255), "torso": (255, 160, 0)}
for name in ("torso", "head", "hand"):
    p = np.array(Image.open(f"{preview_dir}/professional-{name}.png")).astype(np.float64)
    L = layers[name]; px, py = round(L["left"] / 100 * W), round(L["top"] / 100 * H)
    ov = np.zeros((p.shape[0], p.shape[1], 4)); ov[:, :, :3] = tint[name]; ov[:, :, 3] = p[:, :, 3] * 0.45
    vis.alpha_composite(Image.fromarray(ov.astype(np.uint8)), (px, py))
vis.save(f"{preview_dir}/preview-masks.png")
