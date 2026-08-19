/**
 * The project's motion layer.
 *
 * `interactive-motion` is the vendored oil-motion utility; everything else here
 * is a thin adapter around it (React lifecycle, one shared clock, pure math).
 * Nothing in this folder knows what a chatbot or a login form is.
 */

export {
  createFrameAnimator,
  createCssSpriteRenderer,
  type FrameAnimator,
  type FrameAnimatorOptions,
} from "./interactive-motion";

export { createTimeline, type Timeline, type TimelineTick, type TimelineListener } from "./timeline";

export { useFrameAnimator, useMediaQuery, usePrefersReducedMotion } from "./use-motion";

export {
  bezierAngle,
  bezierX,
  clamp,
  clamp01,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  easeOutQuint,
  lerp,
  progress,
  pulse,
  quantise,
} from "./math";
