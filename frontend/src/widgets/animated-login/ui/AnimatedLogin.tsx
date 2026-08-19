import { StoryClockProvider } from "../model/story-clock";
import styles from "./AnimatedLogin.module.css";
import { AnimatedHero } from "./hero/AnimatedHero";
import { LoginPanel } from "./login/LoginPanel";

/**
 * The Ambot365 login.
 *
 * Two halves with one rule between them: the left half tells the product story
 * on a continuous 13.5s loop, the right half stays completely still so signing
 * in is never competing with an animation. The clock provider wraps both so the
 * story has exactly one owner.
 */
export function AnimatedLogin() {
  return (
    <StoryClockProvider>
      <main className={styles.shell}>
        <AnimatedHero />
        <LoginPanel />
      </main>
    </StoryClockProvider>
  );
}
