/**
 * One clock for the whole story.
 *
 * The animated login has ~60 moving parts. Giving each one its own timer is how
 * a sequence drifts out of sync and how a login page ends up with dozens of
 * `setTimeout` calls nobody can reason about. Instead there is a single
 * requestAnimationFrame loop here; every component subscribes and reads the
 * story time it needs. Sequencing lives in one pure function (see
 * `widgets/animated-login/model/story.ts`), not in the components.
 */

export interface TimelineTick {
  /** Seconds into the current loop, always in [0, duration). */
  readonly time: number;
  /** Seconds since the previous tick, clamped so a backgrounded tab can't jump. */
  readonly delta: number;
  /** How many full loops have completed since start. */
  readonly loop: number;
}

export type TimelineListener = (tick: TimelineTick) => void;

export interface Timeline {
  subscribe(listener: TimelineListener): () => void;
  start(): void;
  stop(): void;
  /** Jumps to a story time and notifies once — used for the reduced-motion pose. */
  seek(time: number): void;
  destroy(): void;
}

const MAX_DELTA = 1 / 20;

export function createTimeline(duration: number): Timeline {
  const listeners = new Set<TimelineListener>();
  const tick: { time: number; delta: number; loop: number } = {
    time: 0,
    delta: 0,
    loop: 0,
  };

  let raf = 0;
  let last = 0;
  let destroyed = false;

  const emit = () => {
    for (const listener of listeners) listener(tick);
  };

  const frame = (now: number) => {
    raf = 0;
    if (destroyed) return;

    const delta = last ? Math.min((now - last) / 1000, MAX_DELTA) : 0;
    last = now;

    let time = tick.time + delta;
    while (time >= duration) {
      time -= duration;
      tick.loop += 1;
    }
    tick.time = time;
    tick.delta = delta;

    emit();
    raf = requestAnimationFrame(frame);
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      // Paint the newcomer immediately so it never shows an unstyled first frame.
      listener(tick);
      return () => listeners.delete(listener);
    },
    start() {
      if (raf || destroyed) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
    },
    seek(time) {
      tick.time = ((time % duration) + duration) % duration;
      tick.delta = 0;
      emit();
    },
    destroy() {
      destroyed = true;
      this.stop();
      listeners.clear();
    },
  };
}
