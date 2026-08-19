/**
 * The character state machine.
 *
 * Each state is a set of targets, never a set of frames to jump to. The rig
 * eases toward the targets through oil-motion animators (one per body axis,
 * each with its own smoothing time), so a transition is always a blend:
 *
 *   IDLE -> TYPING -> NOTIFICATION_RECEIVED -> BUSY_TYPING
 *        -> AI_PROCESSING -> RELAXED_TYPING -> TYPING -> (loop)
 *
 * The order the axes settle in is what sells it. The head is quick (0.3s), the
 * shoulders follow (0.6s), the torso is slowest (0.9s) — a person notices with
 * their eyes before their body catches up.
 */

import type { CharacterState } from "../../model/story";

export interface PostureTarget {
  /** Frames per second through the typing cycle. */
  readonly typingSpeed: number;
  /** 0 upright, 1 hunched over the keyboard. */
  readonly lean: number;
  /** 0 shoulders dropped, 1 shoulders up and tight. */
  readonly shoulder: number;
  /** 0 eyes down on the keys, 1 looking up at the conversations. */
  readonly gaze: number;
  /** Multiplier on the breathing amplitude. */
  readonly breathDepth: number;
  /** Multiplier on the breathing rate. */
  readonly breathRate: number;
}

export const POSTURE: Record<CharacterState, PostureTarget> = {
  IDLE: { typingSpeed: 1.2, lean: 0.28, shoulder: 0.25, gaze: 0.34, breathDepth: 1, breathRate: 0.95 },
  TYPING: { typingSpeed: 8.5, lean: 0.42, shoulder: 0.34, gaze: 0.16, breathDepth: 0.82, breathRate: 1.15 },
  // Head comes up, hands keep working — noticing is not stopping.
  NOTIFICATION_RECEIVED: {
    typingSpeed: 5.6,
    lean: 0.36,
    shoulder: 0.48,
    gaze: 0.9,
    breathDepth: 0.9,
    breathRate: 1.3,
  },
  // The overload beat: tight, fast, close to the screen.
  BUSY_TYPING: { typingSpeed: 14.5, lean: 0.74, shoulder: 0.76, gaze: 0.3, breathDepth: 0.68, breathRate: 1.75 },
  // Watching the bot work. Hands slow but never stop.
  AI_PROCESSING: { typingSpeed: 4.2, lean: 0.4, shoulder: 0.4, gaze: 0.74, breathDepth: 1.1, breathRate: 1.05 },
  // The point of the whole story: same job, less load.
  RELAXED_TYPING: { typingSpeed: 6.2, lean: 0.22, shoulder: 0.1, gaze: 0.3, breathDepth: 1.3, breathRate: 0.82 },
};
