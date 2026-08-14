import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./IconButton.module.css";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon alone has no accessible name. */
  label: string;
  icon: ReactNode;
  size?: "sm" | "md";
  tone?: "default" | "danger";
  selected?: boolean;
}

/**
 * A square, label-less control. `label` is mandatory and becomes both the
 * tooltip and the accessible name, so an icon button can never ship unnamed.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { label, icon, size = "md", tone = "default", selected, className, type = "button", ...rest },
    ref,
  ) {
    return (
      <button
        {...rest}
        ref={ref}
        type={type}
        title={label}
        aria-label={label}
        aria-pressed={selected}
        className={cx(
          styles.root,
          styles[size],
          tone === "danger" && styles.danger,
          selected && styles.selected,
          className,
        )}
      >
        {icon}
      </button>
    );
  },
);
