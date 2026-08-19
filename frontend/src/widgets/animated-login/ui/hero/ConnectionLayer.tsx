import { useEffect, useRef, useState } from "react";

import { bezierX, clamp01, easeInOutCubic } from "../../../../shared/motion";
import { BOT_ANCHOR, CONVERSATIONS, CRM_ANCHOR, DESK_ANCHOR } from "../../model/story";
import { useStoryClock, useStoryFrame } from "../../model/story-clock";
import styles from "./ConnectionLayer.module.css";

/**
 * Particles in the wake of a travelling conversation. They are spread across
 * the part of the route already covered rather than bunched a fixed distance
 * behind the card — so the wake grows from the card's old position toward
 * WebChatBot, which is the thing that has to read.
 */
const TRAIL_LENGTH = 7;

/** Dots on the WebChatBot -> CRM stream. */
const STREAM_LENGTH = 5;

interface Route {
  readonly from: { x: number; y: number };
  readonly via: { x: number; y: number };
  readonly to: { x: number; y: number };
}

/** Each conversation's hand-off curve — the same one its card flies along. */
const HANDOFF_ROUTES: readonly Route[] = CONVERSATIONS.map((conversation) => ({
  from: conversation.settle,
  via: conversation.handoffVia,
  to: BOT_ANCHOR,
}));

/** The outcome stream: what WebChatBot resolved, on its way into the CRM. */
const CRM_ROUTE: Route = {
  from: BOT_ANCHOR,
  via: { x: 50, y: 40 },
  to: CRM_ANCHOR,
};

/** Where the next conversation is already coming from as the loop closes. */
const INTAKE_ROUTE: Route = {
  from: { x: -14, y: 66 },
  via: { x: 0, y: 84 },
  to: { x: DESK_ANCHOR.x - 4, y: DESK_ANCHOR.y - 14 },
};

/**
 * The data moving between the parts of the stage.
 *
 * There are deliberately no drawn connectors here. A permanent web of lines
 * describes a diagram; what this page needs to show is movement, so the only
 * thing on this layer is matter in transit — a trail of particles pulled along
 * behind each conversation as WebChatBot draws it in, and a slow stream of
 * resolved work running from the bot into the CRM. Direction comes from the
 * motion itself, which means nothing is left on screen once the work is done.
 */
export function ConnectionLayer() {
  const { reducedMotion } = useStoryClock();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const trailRefs = useRef<(SVGGElement | null)[]>([]);
  const streamRefs = useRef<(SVGGElement | null)[]>([]);
  const intakeRef = useRef<SVGGElement | null>(null);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const measure = () =>
      setSize((current) =>
        current.width === node.clientWidth && current.height === node.clientHeight
          ? current
          : { width: node.clientWidth, height: node.clientHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useStoryFrame((frame) => {
    const { width, height } = size;
    if (!width) return;

    const place = (node: SVGGElement, route: Route, u: number, scale: number, opacity: number) => {
      const x = (bezierX(route.from.x, route.via.x, route.to.x, u) / 100) * width;
      const y = (bezierX(route.from.y, route.via.y, route.to.y, u) / 100) * height;
      node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(
        3,
      )})`;
      node.style.opacity = opacity.toFixed(3);
    };

    for (let r = 0; r < HANDOFF_ROUTES.length; r += 1) {
      const route = HANDOFF_ROUTES[r];
      const travel = frame.conversations[r].travel;
      // Matches the card's own easing, so the trail sits exactly behind it
      // rather than drifting off its path.
      const head = easeInOutCubic(travel);
      const live = travel > 0 && travel < 1;

      for (let i = 0; i < TRAIL_LENGTH; i += 1) {
        const node = trailRefs.current[r * TRAIL_LENGTH + i];
        if (!node) continue;

        const u = head * (1 - (i + 1) / (TRAIL_LENGTH + 1));
        if (!live || u <= 0.002) {
          if (node.style.opacity !== "0") node.style.opacity = "0";
          continue;
        }

        const falloff = 1 - i / TRAIL_LENGTH;
        place(
          node,
          route,
          u,
          0.42 + falloff * 0.58,
          // Fades in as the card leaves and out as the whole hand-off completes.
          falloff * 0.9 * clamp01(travel * 6) * (1 - clamp01((travel - 0.82) * 5.5)),
        );
      }
    }

    const streaming = clamp01(frame.crmProgress * 2.6) * (1 - clamp01(frame.reset * 2));
    for (let i = 0; i < STREAM_LENGTH; i += 1) {
      const node = streamRefs.current[i];
      if (!node) continue;
      if (streaming <= 0.01) {
        if (node.style.opacity !== "0") node.style.opacity = "0";
        continue;
      }
      const u = (frame.time * 0.42 + i / STREAM_LENGTH) % 1;
      place(node, CRM_ROUTE, u, 0.7 + Math.sin(u * Math.PI) * 0.3, streaming * Math.sin(u * Math.PI));
    }

    const intake = intakeRef.current;
    if (intake) {
      const u = clamp01(frame.intake);
      place(intake, INTAKE_ROUTE, u, 0.8 + Math.sin(u * Math.PI) * 0.4, Math.sin(u * Math.PI) * 0.85);
    }
  });

  // Reduced motion: the story is parked, so there is nothing in transit to draw.
  if (reducedMotion) return null;

  return (
    <div className={styles.layer} ref={rootRef}>
      <svg
        className={styles.canvas}
        viewBox={`0 0 ${size.width || 1} ${size.height || 1}`}
        aria-hidden
      >
        <defs>
          <radialGradient id="ambot-particle">
            <stop offset="0%" stopColor="#1DFFB2" stopOpacity="0.95" />
            <stop offset="45%" stopColor="#16C784" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#16C784" stopOpacity="0" />
          </radialGradient>
        </defs>

        {HANDOFF_ROUTES.map((_, routeIndex) =>
          Array.from({ length: TRAIL_LENGTH }, (_unused, index) => (
            <g
              key={`trail-${routeIndex}-${index}`}
              ref={(node) => {
                trailRefs.current[routeIndex * TRAIL_LENGTH + index] = node;
              }}
              style={{ opacity: 0 }}
            >
              <circle r={10} fill="url(#ambot-particle)" />
              <circle r={2.6} fill="#1DFFB2" />
            </g>
          )),
        )}

        {Array.from({ length: STREAM_LENGTH }, (_unused, index) => (
          <g
            key={`stream-${index}`}
            ref={(node) => {
              streamRefs.current[index] = node;
            }}
            style={{ opacity: 0 }}
          >
            <circle r={7} fill="url(#ambot-particle)" />
            <circle r={2} fill="var(--ambot-primary)" />
          </g>
        ))}

        <g ref={intakeRef} style={{ opacity: 0 }}>
          <circle r={12} fill="url(#ambot-particle)" />
          <circle r={2.8} fill="var(--ambot-primary)" />
        </g>
      </svg>
    </div>
  );
}
