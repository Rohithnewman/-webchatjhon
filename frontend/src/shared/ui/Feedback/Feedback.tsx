import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./Feedback.module.css";

/** Visible to screen readers only. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className={styles.visuallyHidden}>{children}</span>;
}

export function Spinner({ size = 18 }: { size?: number }) {
  return <Loader2 size={size} className={styles.spinner} aria-hidden />;
}

/** Fills its container while work is in flight. */
export function LoadingState({ label }: { label: string }) {
  return (
    <div className={styles.centered} role="status">
      <Spinner size={22} />
      <span>{label}</span>
    </div>
  );
}

export interface EmptyStateProps {
  /** What is missing, stated plainly. */
  title: string;
  /** What the person can do next. An empty screen is an invitation to act. */
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cx(styles.empty, className)}>
      {icon}
      <span className={styles.emptyTitle}>{title}</span>
      {description ? <span>{description}</span> : null}
      {action}
    </div>
  );
}
