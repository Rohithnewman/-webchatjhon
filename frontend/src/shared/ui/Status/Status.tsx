import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./Status.module.css";

export type ChatbotStatus = "draft" | "published" | "archived";

/**
 * Colour-coded state marker. Always pair it with adjacent text — colour alone
 * is not an accessible signal.
 */
export function StatusDot({ status }: { status: ChatbotStatus }) {
  return (
    <span
      aria-hidden
      className={cx(
        styles.dot,
        status === "published" && styles.dotPublished,
        status === "archived" && styles.dotArchived,
      )}
    />
  );
}

export type BadgeTone = "neutral" | "brand" | "warning" | "danger";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return <span className={cx(styles.badge, styles[tone])}>{children}</span>;
}
