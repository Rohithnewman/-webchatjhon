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

/** Shown to anyone missing the permission a control needs, so they know why
 *  save/upload/reply controls are missing before they go looking for them.
 *  `label` is the human label from PERMISSION_CATALOGUE, e.g. "Build bots". */
export function ReadOnlyBanner({ label }: { label: string }) {
  return (
    <div className="readonly-banner" role="status">
      Your role does not include <strong>{label}</strong>
    </div>
  );
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
