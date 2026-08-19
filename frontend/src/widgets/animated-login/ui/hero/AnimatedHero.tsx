import { cx } from "../../../../shared/lib/cx";
import type { BotState } from "../../model/story";
import { useStoryClock } from "../../model/story-clock";
import styles from "./AnimatedHero.module.css";
import { AmbotInbox } from "./AmbotInbox";
import { ConnectionLayer } from "./ConnectionLayer";
import { CustomerConversationLayer } from "./CustomerConversationLayer";
import { ProfessionalCharacter } from "./ProfessionalCharacter";
import { WebChatBot } from "./WebChatBot";

/**
 * The three things the product actually does, in order. The strip is not a
 * decoration: it names the beat the stage is currently playing, which is what
 * lets the animation be understood on the first pass without a paragraph of
 * explanation next to it.
 */
const STEPS = ["Capture", "Resolve", "Record"] as const;

const ACTIVE_STEP: Record<BotState, number> = {
  IDLE: 0,
  RECEIVING: 0,
  PROCESSING: 1,
  RESOLVED: 2,
};

/** The animated half of the page: the whole Ambot365 product story on one stage. */
export function AnimatedHero() {
  const { phase } = useStoryClock();
  const activeStep = ACTIVE_STEP[phase.bot];

  return (
    <section className={styles.hero}>
      <p className={styles.srOnly}>
        An illustration of the Ambot365 workflow: customer conversations arrive from WhatsApp,
        Instagram, Messenger and web chat, WebChatBot answers and resolves them automatically, and
        Ambot365 records each resolved conversation in the shared inbox.
      </p>

      <div className={styles.stage} aria-hidden>
        <span className={styles.glowTop} />
        <span className={styles.glowBottom} />
        <span className={styles.grid} />

        <ConnectionLayer />
        <ProfessionalCharacter />
        <CustomerConversationLayer />
        <WebChatBot />
        <AmbotInbox />
      </div>

      <ol className={styles.steps} aria-hidden>
        {STEPS.map((step, index) => (
          <li
            key={step}
            className={cx(styles.step, index === activeStep && styles.stepActive)}
          >
            <span className={styles.stepDot} />
            {step}
          </li>
        ))}
      </ol>
    </section>
  );
}
