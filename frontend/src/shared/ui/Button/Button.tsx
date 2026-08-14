import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cx } from "../../lib/cx";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a spinner and blocks interaction. */
  loading?: boolean;
  fullWidth?: boolean;
  /** Icon rendered before the label. Omitted while loading. */
  icon?: ReactNode;
}

/**
 * The only button in the product. Anything that looks like a button but isn't
 * this component is a bug — that's how the three near-identical button styles
 * this replaced came to exist.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    fullWidth = false,
    icon,
    disabled,
    children,
    className,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        styles.root,
        styles[variant],
        styles[size],
        fullWidth && styles.fullWidth,
        className,
      )}
    >
      {loading ? <Loader2 size={16} className={styles.spinner} aria-hidden /> : icon}
      {children}
    </button>
  );
});
