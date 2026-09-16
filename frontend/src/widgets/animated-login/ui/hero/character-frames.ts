/**
 * Frame data for the professional character.
 *
 * This is a real frame sequence, not a transform applied to a still image: each
 * entry is a distinct hand pose, and oil-motion's `createFrameAnimator` walks
 * the cycle and reports a *fractional* position, which `lerpPose` blends so the
 * hands move continuously instead of stepping between drawings.
 *
 * Two renderers consume the same frame index:
 *   - the 2.5D cut-out in `ProfessionalCharacter` (used today), and
 *   - `createCssSpriteRenderer` against `CHARACTER_SPRITE_SHEET` (used the
 *     moment a drawn/rendered frame sequence is dropped in — see below).
 *
 * Units: SVG user units for x/y, degrees for wrist, 0-1 for a finger's dip
 * (0 = raised off the key, 1 = fully struck).
 */

/** Length of one typing cycle. Two strikes per hand, no repeated finger. */
export const TYPING_FRAME_COUNT = 12;

export interface HandPose {
  /** Vertical travel of the whole hand. Negative is lifted off the keys. */
  y: number;
  /** Lateral travel across the keyboard. */
  x: number;
  /** Wrist rotation. */
  wrist: number;
  /** Index, middle, ring — the three fingers that read at this scale. */
  fingers: readonly [number, number, number];
}

export interface TypingPose {
  readonly left: HandPose;
  readonly right: HandPose;
}

const hand = (
  y: number,
  x: number,
  wrist: number,
  fingers: readonly [number, number, number],
): HandPose => ({ y, x, wrist, fingers });

/**
 * The cycle. Hands alternate — one strikes while the other is already lifting
 * for its next key — which is what separates typing from tapping.
 */
export const TYPING_POSES: readonly TypingPose[] = [
  { left: hand(0.2, 0.5, -2.6, [1, 0.3, 0]), right: hand(-2, -0.4, 3, [0, 0, 0]) },
  { left: hand(0, 0.3, -1.8, [0.7, 0.5, 0.1]), right: hand(-1.4, -0.2, 2.2, [0.1, 0, 0.2]) },
  { left: hand(-1, 0, 0.4, [0.2, 0.1, 0]), right: hand(-0.6, 0.2, 0.9, [0.3, 0.2, 0.4]) },
  { left: hand(-1.9, -0.4, 2.8, [0, 0, 0]), right: hand(0.2, 0.5, -2.4, [0, 0.9, 0.4]) },
  { left: hand(-1.6, -0.5, 2.4, [0.1, 0, 0]), right: hand(0.05, 0.4, -1.9, [0.2, 0.7, 0.6]) },
  { left: hand(-0.8, -0.2, 1.1, [0.3, 0.2, 0.5]), right: hand(-1.2, 0, 1.6, [0, 0.2, 0.1]) },
  { left: hand(0.15, 0.4, -2.4, [0.2, 0.4, 1]), right: hand(-2, -0.3, 2.9, [0, 0, 0]) },
  { left: hand(0, 0.3, -1.7, [0.1, 0.6, 0.8]), right: hand(-1.3, -0.1, 2, [0.4, 0, 0]) },
  { left: hand(-1.1, 0, 0.6, [0, 0.2, 0.3]), right: hand(-0.5, 0.3, 0.7, [0.7, 0.2, 0]) },
  { left: hand(-2.1, -0.5, 3, [0, 0, 0]), right: hand(0.2, 0.5, -2.5, [1, 0.2, 0]) },
  { left: hand(-1.7, -0.4, 2.5, [0, 0.1, 0]), right: hand(0, 0.35, -1.8, [0.8, 0.4, 0.1]) },
  { left: hand(-0.9, -0.1, 1.2, [0.5, 0.3, 0.1]), right: hand(-1.3, 0.1, 1.7, [0.2, 0.1, 0]) },
];

/** Hands resting on the keys: reduced motion, and the pause in the relaxed beat. */
export const RESTING_POSE: TypingPose = {
  left: hand(-0.6, 0, 0.4, [0.05, 0.05, 0.05]),
  right: hand(-0.6, 0, 0.4, [0.05, 0.05, 0.05]),
};

/** Right hand off the keyboard, weight on the wrist. Used mid-relaxation. */
export const HAND_OFF_POSE: HandPose = hand(-3.4, -2.6, 6.5, [0, 0, 0]);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const lerpHand = (a: HandPose, b: HandPose, t: number, out: MutableHandPose) => {
  out.y = lerp(a.y, b.y, t);
  out.x = lerp(a.x, b.x, t);
  out.wrist = lerp(a.wrist, b.wrist, t);
  out.fingers[0] = lerp(a.fingers[0], b.fingers[0], t);
  out.fingers[1] = lerp(a.fingers[1], b.fingers[1], t);
  out.fingers[2] = lerp(a.fingers[2], b.fingers[2], t);
  return out;
};

export interface MutableHandPose {
  y: number;
  x: number;
  wrist: number;
  fingers: [number, number, number];
}

export interface MutableTypingPose {
  left: MutableHandPose;
  right: MutableHandPose;
}

export const createMutablePose = (): MutableTypingPose => ({
  left: { y: 0, x: 0, wrist: 0, fingers: [0, 0, 0] },
  right: { y: 0, x: 0, wrist: 0, fingers: [0, 0, 0] },
});

/**
 * Blends the cycle at a fractional frame position.
 *
 * The fraction comes straight from oil-motion's smooth-damped position, so a
 * speed change (calm typing -> overloaded typing) eases instead of snapping.
 */
export function lerpPose(position: number, out: MutableTypingPose): MutableTypingPose {
  const count = TYPING_POSES.length;
  const wrapped = ((position % count) + count) % count;
  const index = Math.floor(wrapped);
  const t = wrapped - index;
  const from = TYPING_POSES[index];
  const to = TYPING_POSES[(index + 1) % count];
  lerpHand(from.left, to.left, t, out.left);
  lerpHand(from.right, to.right, t, out.right);
  return out;
}

/** Copies a fixed pose into the mutable buffer. Used for reduced motion. */
export function copyPose(source: TypingPose, out: MutableTypingPose): MutableTypingPose {
  lerpHand(source.left, source.left, 0, out.left);
  lerpHand(source.right, source.right, 0, out.right);
  return out;
}

/** Blends a hand toward a fixed pose — used for the mid-relaxation hand rest. */
export function blendHand(target: HandPose, amount: number, out: MutableHandPose) {
  if (amount <= 0) return out;
  out.y = lerp(out.y, target.y, amount);
  out.x = lerp(out.x, target.x, amount);
  out.wrist = lerp(out.wrist, target.wrist, amount);
  out.fingers[0] = lerp(out.fingers[0], target.fingers[0], amount);
  out.fingers[1] = lerp(out.fingers[1], target.fingers[1], amount);
  out.fingers[2] = lerp(out.fingers[2], target.fingers[2], amount);
  return out;
}

/* ── Sprite sequence hook ────────────────────────────────────────────────── */

export interface CharacterSpriteSheet {
  /** Sheet URL. Import it so the bundler fingerprints and preloads it. */
  readonly url: string;
  readonly columns: number;
  readonly rows: number;
  /** Must equal TYPING_FRAME_COUNT so the animator and the sheet agree. */
  readonly frameCount: number;
}

/**
 * Where a drawn or rendered character sequence gets supplied.
 *
 * Leave it `null` and the vector rig below animates the character. Set it to a
 * sheet of `TYPING_FRAME_COUNT` frames (one full typing cycle, hands alternating
 * to match the table above) and `ProfessionalCharacter` switches to
 * `createCssSpriteRenderer` on the same animator — same timing, same states, no
 * other change. Example:
 *
 *   import sheet from "./assets/professional-typing.png";
 *   export const CHARACTER_SPRITE_SHEET = {
 *     url: sheet, columns: 4, rows: 3, frameCount: TYPING_FRAME_COUNT,
 *   };
 */
export const CHARACTER_SPRITE_SHEET: CharacterSpriteSheet | null = null;
