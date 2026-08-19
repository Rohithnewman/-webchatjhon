import { useEffect, useRef } from "react";

import { CHANNELS, CONVERSATIONS } from "../../model/story";
import { useStoryClock, useStoryFrame } from "../../model/story-clock";
import { ChannelGlyph } from "./ChannelGlyph";
import styles from "./CustomerConversationLayer.module.css";

/**
 * The incoming customer conversations.
 *
 * Every card is a real DOM element on a real trajectory: it starts off stage,
 * curves in along a quadratic bezier, settles and drifts while it can be read,
 * then curves again into WebChatBot and shrinks out. Position comes from the
 * story sample; this component only converts stage percentages to pixels and
 * writes one transform per card per frame.
 */
export function CustomerConversationLayer() {
  const { conversationBudget } = useStoryClock();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  // Measured on resize, not per frame: stage percentages are meaningless until
  // we know how many pixels the stage actually is.
  const sizeRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const measure = () => {
      sizeRef.current = { width: node.clientWidth, height: node.clientHeight };
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useStoryFrame((frame) => {
    const { width, height } = sizeRef.current;
    if (!width) return;

    for (let i = 0; i < CONVERSATIONS.length; i += 1) {
      const card = cardRefs.current[i];
      if (!card) continue;
      const sample = frame.conversations[i];

      if (sample.opacity <= 0.001) {
        if (card.style.visibility !== "hidden") card.style.visibility = "hidden";
        continue;
      }
      if (card.style.visibility === "hidden") card.style.visibility = "visible";

      const x = (sample.x / 100) * width;
      const y = (sample.y / 100) * height;
      card.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(
        1,
      )}px, 0) translate(-50%, -50%) rotate(${sample.rotate.toFixed(2)}deg) scale(${sample.scale.toFixed(
        3,
      )})`;
      card.style.opacity = sample.opacity.toFixed(3);
      card.style.setProperty("--land", sample.land.toFixed(3));
    }
  });

  return (
    <div className={styles.layer} ref={rootRef}>
      {CONVERSATIONS.map((conversation, index) => {
        const channel = CHANNELS[conversation.channel];
        // Narrow viewports carry fewer cards: the story is the same, the stage
        // is just less crowded.
        if (conversation.weight > conversationBudget) return null;

        return (
          <article
            key={conversation.id}
            className={styles.card}
            style={{ ["--tint" as string]: channel.tint, visibility: "hidden" }}
            ref={(node) => {
              cardRefs.current[index] = node;
            }}
          >
            <header className={styles.channel}>
              <span className={styles.channelIcon}>
                <ChannelGlyph channel={conversation.channel} size={13} />
              </span>
              {channel.label}
              <span className={styles.badge}>{conversation.badge}</span>
            </header>
            <div className={styles.body}>
              <span className={styles.avatar}>{conversation.initials}</span>
              <div className={styles.text}>
                <strong>{conversation.name}</strong>
                <span>{conversation.preview}</span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
