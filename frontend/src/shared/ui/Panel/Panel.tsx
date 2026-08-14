import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./Panel.module.css";

export interface PanelProps {
  children: ReactNode;
  /** Which edge carries the divider when docked in the builder grid. */
  border?: "left" | "right" | "none";
  className?: string;
}

/**
 * A docked column: fixed header, scrolling body, optional footer.
 *
 * The sidebar, node palette, and config panel were each re-declaring this
 * 48px header and scroll body; they are now the same component.
 */
export function Panel({ children, border = "none", className }: PanelProps) {
  return (
    <section
      className={cx(
        styles.root,
        border === "right" && styles.borderRight,
        border === "left" && styles.borderLeft,
        className,
      )}
    >
      {children}
    </section>
  );
}

export interface PanelHeaderProps {
  title: ReactNode;
  /** Secondary text shown next to the title. */
  meta?: ReactNode;
  /** Controls aligned to the trailing edge. */
  actions?: ReactNode;
}

Panel.Header = function PanelHeader({ title, meta, actions }: PanelHeaderProps) {
  return (
    <header className={styles.header}>
      <span>
        {title}
        {meta ? <small className={styles.headerMeta}> {meta}</small> : null}
      </span>
      {actions}
    </header>
  );
};

Panel.Body = function PanelBody({
  children,
  flush = false,
  className,
}: {
  children: ReactNode;
  /** Tight padding, for lists that supply their own row insets. */
  flush?: boolean;
  className?: string;
}) {
  return (
    <div className={cx(styles.body, flush && styles.bodyFlush, className)}>{children}</div>
  );
};

Panel.Footer = function PanelFooter({ children }: { children: ReactNode }) {
  return <footer className={styles.footer}>{children}</footer>;
};
