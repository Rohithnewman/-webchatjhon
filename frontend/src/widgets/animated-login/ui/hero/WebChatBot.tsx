import { Check } from "lucide-react";
import { useRef } from "react";

import { useFrameAnimator } from "../../../../shared/motion";
import { useStoryClock, useStoryFrame } from "../../model/story-clock";
import styles from "./WebChatBot.module.css";

/** Directions the pupils can hold. Circular, so the eyes never spin the long way. */
const LOOK_FRAMES = 24;
const LOOK_START_ANGLE = -Math.PI * 0.75;

const STATUS: Record<string, string> = {
  IDLE: "Listening on 4 channels",
  RECEIVING: "Capturing conversation",
  PROCESSING: "Processing conversation",
  RESOLVED: "Resolved",
};

/**
 * WebChatBot — the point the whole stage converges on.
 *
 * It reacts rather than decorates: the glow tracks how much work is in flight,
 * every conversation that lands knocks it, and the eyes turn toward whichever
 * conversation is arriving (an oil-motion circular animator driven by
 * `setDirection`, which is what keeps the turn short and smooth).
 */
export function WebChatBot() {
  const { phase, reducedMotion } = useStoryClock();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const eyesRef = useRef<HTMLDivElement | null>(null);

  const look = useFrameAnimator({
    frameCount: LOOK_FRAMES,
    circular: true,
    smoothTime: 0.26,
    reducedMotion,
    render: () => {},
  });

  useStoryFrame((frame) => {
    const root = rootRef.current;
    if (root) {
      root.style.setProperty("--energy", frame.botEnergy.toFixed(3));
      root.style.setProperty("--impact", frame.botImpact.toFixed(3));
    }

    const animator = look.current;
    if (animator && root) {
      if (frame.botLookX !== 0 || frame.botLookY !== 1) {
        animator.setDirection(frame.botLookX, frame.botLookY, LOOK_START_ANGLE);
      }
      const angle = (animator.getCurrentFrame() / LOOK_FRAMES) * Math.PI * 2 + LOOK_START_ANGLE;
      const reach = 2.1 * (0.35 + frame.botEnergy * 0.65);
      // Both pupils read the same pair of variables — one write, two eyes.
      root.style.setProperty("--pupil-x", `${(Math.cos(angle) * reach).toFixed(2)}px`);
      root.style.setProperty("--pupil-y", `${(Math.sin(angle) * reach).toFixed(2)}px`);
    }

    const eyes = eyesRef.current;
    if (eyes && !reducedMotion) {
      // A blink every 3.4s. Deterministic, so it never lands on the same beat
      // as a conversation arriving.
      const cycle = frame.time % 3.4;
      const blink = cycle < 0.14 ? Math.sin((cycle / 0.14) * Math.PI) : 0;
      eyes.style.transform = `scaleY(${(1 - blink * 0.88).toFixed(3)})`;
    }
  });

  const state = phase.bot;

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-state={state.toLowerCase()}
      style={{ ["--energy" as string]: 0, ["--impact" as string]: 0 }}
    >
      <span className={styles.halo} />
      <span className={styles.ring} />
      {/* Absorption rings. With no drawn connectors on the stage, this is what
          makes "a conversation just landed here" unmistakable. */}
      <span className={styles.ripple} />
      <span className={styles.rippleWide} />

      <div className={styles.module}>
        <div className={styles.face}>
          <div className={styles.eyes} ref={eyesRef}>
            <span className={styles.eye}>
              <span className={styles.pupil} />
            </span>
            <span className={styles.eye}>
              <span className={styles.pupil} />
            </span>
          </div>
        </div>

        <div className={styles.meta}>
          <strong className={styles.name}>WebChatBot</strong>

          <div className={styles.statusStack}>
            <span className={styles.dots} aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <span className={styles.check} aria-hidden>
              <Check size={12} strokeWidth={3.2} />
            </span>
          </div>

          <span className={styles.status}>{STATUS[state]}</span>
        </div>
      </div>
    </div>
  );
}
