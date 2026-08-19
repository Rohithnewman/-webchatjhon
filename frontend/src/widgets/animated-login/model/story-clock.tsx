import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { createTimeline, useMediaQuery, usePrefersReducedMotion } from "../../../shared/motion";
import {
  createStoryFrame,
  LOOP_DURATION,
  REDUCED_MOTION_TIME,
  sampleStory,
  samplePhase,
  type StoryFrame,
  type StoryPhase,
} from "./story";

type FrameListener = (frame: StoryFrame) => void;

interface StoryClockValue {
  /** Per-frame subscription. The listener receives a shared, mutable buffer:
   *  read from it, never keep a reference to its contents. */
  subscribe(listener: FrameListener): () => void;
  /** Current buffer, for a component's very first paint. */
  getFrame(): StoryFrame;
  /** The only story values that re-render React. Changes a handful of times a loop. */
  phase: StoryPhase;
  reducedMotion: boolean;
  /** How many conversation cards this viewport can hold without crowding. */
  conversationBudget: number;
}

const StoryClockContext = createContext<StoryClockValue | null>(null);

export function useStoryClock(): StoryClockValue {
  const value = useContext(StoryClockContext);
  if (!value) throw new Error("useStoryClock must be used inside <StoryClockProvider>");
  return value;
}

/**
 * Subscribes a component to the story clock and hands it the frame buffer.
 *
 * The listener is kept in a ref, so a component may close over fresh props
 * every render without re-subscribing 60 times a second.
 */
export function useStoryFrame(listener: FrameListener) {
  const { subscribe } = useStoryClock();
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  useEffect(() => subscribe((frame) => listenerRef.current(frame)), [subscribe]);
}

/**
 * Owns the one requestAnimationFrame loop behind the animated login.
 *
 * Continuous values are pushed straight to subscribers (which write them to the
 * DOM themselves); only the discrete story phase is React state. That split is
 * what keeps a 13.5s, 60fps composition off the React render path entirely.
 */
export function StoryClockProvider({ children }: { children: ReactNode }) {
  const reducedMotion = usePrefersReducedMotion();
  const compact = useMediaQuery("(max-width: 640px)");
  const medium = useMediaQuery("(max-width: 1024px)");
  const conversationBudget = compact ? 2 : medium ? 3 : 4;

  const frameRef = useRef<StoryFrame | null>(null);
  if (frameRef.current === null) frameRef.current = createStoryFrame();

  // Listeners live outside the timeline so a remount (or StrictMode's double
  // effect) can rebuild the clock without every child having to resubscribe.
  const listenersRef = useRef(new Set<FrameListener>());

  const [phase, setPhase] = useState<StoryPhase>(() =>
    samplePhase(0, sampleStory(0, frameRef.current!)),
  );

  const subscribe = useCallback((listener: FrameListener) => {
    listenersRef.current.add(listener);
    listener(frameRef.current!);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const getFrame = useCallback(() => frameRef.current!, []);

  useEffect(() => {
    const buffer = frameRef.current!;
    const listeners = listenersRef.current;

    const publish = (time: number) => {
      const frame = sampleStory(time, buffer);
      for (const listener of listeners) listener(frame);

      const next = samplePhase(time, frame);
      setPhase((current) =>
        current.character === next.character &&
        current.bot === next.bot &&
        current.resolvedCount === next.resolvedCount
          ? current
          : next,
      );
    };

    const timeline = createTimeline(LOOP_DURATION);
    const unsubscribe = timeline.subscribe((tick) => publish(tick.time));

    if (reducedMotion) {
      // Park the story on its resolved beat: the whole message still reads,
      // nothing moves, and no frames are scheduled.
      timeline.seek(REDUCED_MOTION_TIME);
    } else {
      timeline.start();
    }

    return () => {
      unsubscribe();
      timeline.destroy();
    };
  }, [reducedMotion]);

  const value = useMemo<StoryClockValue>(
    () => ({ subscribe, getFrame, phase, reducedMotion, conversationBudget }),
    [subscribe, getFrame, phase, reducedMotion, conversationBudget],
  );

  return <StoryClockContext.Provider value={value}>{children}</StoryClockContext.Provider>;
}
