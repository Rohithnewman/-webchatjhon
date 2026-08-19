import { useEffect, useRef, useState } from "react";

import {
  createFrameAnimator,
  type FrameAnimator,
  type FrameAnimatorOptions,
} from "./interactive-motion";

/** Live media-query subscription. Re-renders only when the match flips. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/**
 * The accessibility switch for everything on this page.
 *
 * It is read once at the top of the animated login and pushed down, so no
 * component has to remember to check it — a component that receives
 * `reducedMotion` cannot forget to honour it.
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

type AnimatorConfig = Omit<FrameAnimatorOptions, "render"> & {
  render: (frame: number) => void;
};

/**
 * Owns an oil-motion `createFrameAnimator` for a component's lifetime.
 *
 * `render` is kept in a ref so a new closure each render never tears the
 * animator down — rebuilding it would reset the frame position and produce
 * exactly the visible pops this page is supposed to avoid.
 */
export function useFrameAnimator(config: AnimatorConfig) {
  const { frameCount, initialFrame, circular, smoothTime, maxSpeed, reducedMotion } = config;
  const renderRef = useRef(config.render);
  renderRef.current = config.render;

  const animatorRef = useRef<FrameAnimator | null>(null);

  useEffect(() => {
    const animator = createFrameAnimator({
      frameCount,
      initialFrame,
      circular,
      smoothTime,
      maxSpeed,
      reducedMotion,
      render: (frame) => renderRef.current(frame),
    });
    animatorRef.current = animator;
    return () => {
      animator.destroy();
      animatorRef.current = null;
    };
    // `initialFrame` is intentionally excluded: it seeds the animator, and
    // reacting to it would restart the animation mid-loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameCount, circular, smoothTime, maxSpeed, reducedMotion]);

  return animatorRef;
}
