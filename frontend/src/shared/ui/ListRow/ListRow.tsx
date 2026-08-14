import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./ListRow.module.css";

export interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  /** Supplying this renders a button; omitting it renders a static row. */
  onSelect?: () => void;
  className?: string;
}

/**
 * One row in a docked list — icon, two truncating lines, trailing slot.
 *
 * Renders a `button` only when selectable, so non-interactive rows (version
 * history entries) don't land in the tab order pretending to be actionable.
 */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  selected = false,
  onSelect,
  className,
}: ListRowProps) {
  const content = (
    <>
      {leading ? <span className={styles.leading}>{leading}</span> : null}
      <span className={styles.copy}>
        <span className={styles.title}>{title}</span>
        {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
      </span>
      {trailing}
    </>
  );

  const classes = cx(
    styles.root,
    onSelect && styles.interactive,
    selected && styles.selected,
    className,
  );

  if (!onSelect) {
    return <div className={classes}>{content}</div>;
  }

  return (
    <button type="button" onClick={onSelect} aria-current={selected} className={classes}>
      {content}
    </button>
  );
}
