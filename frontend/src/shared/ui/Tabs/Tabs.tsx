import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./Tabs.module.css";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
}

export interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the tab set for assistive technology. */
  label: string;
}

/**
 * Tab strip with arrow-key navigation, following the ARIA tabs pattern.
 * The caller renders the panel; this owns only the strip.
 */
export function Tabs<T extends string>({ items, value, onChange, label }: TabsProps<T>) {
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const index = items.findIndex((item) => item.id === value);
    const next = items[(index + delta + items.length) % items.length];
    onChange(next.id);
  }

  return (
    <div role="tablist" aria-label={label} className={styles.list} onKeyDown={onKeyDown}>
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cx(styles.tab, selected && styles.selected)}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
