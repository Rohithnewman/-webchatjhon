import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cx } from "../../lib/cx";
import { useFieldContext } from "../Field/Field";
import styles from "./Input.module.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Rendered inside the control, before the text. */
  adornment?: ReactNode;
  /** Rendered inside the control, after the text (e.g. a reveal toggle). */
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { adornment, trailing, className, id, ...rest },
  ref,
) {
  const field = useFieldContext();
  const controlId = id ?? field?.controlId;
  const invalid = field?.invalid ?? false;

  const shared = {
    ...rest,
    id: controlId,
    ref,
    "aria-describedby": rest["aria-describedby"] ?? field?.describedBy,
    "aria-invalid": rest["aria-invalid"] ?? (invalid || undefined),
  };

  if (!adornment && !trailing) {
    return (
      <input
        {...shared}
        className={cx(styles.control, invalid && styles.invalid, className)}
      />
    );
  }

  return (
    <div className={cx(styles.wrap, invalid && styles.invalid, className)}>
      {adornment}
      <input {...shared} className={styles.bare} />
      {trailing}
    </div>
  );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, id, ...rest },
  ref,
) {
  const field = useFieldContext();
  const invalid = field?.invalid ?? false;

  return (
    <textarea
      {...rest}
      ref={ref}
      id={id ?? field?.controlId}
      aria-describedby={rest["aria-describedby"] ?? field?.describedBy}
      aria-invalid={rest["aria-invalid"] ?? (invalid || undefined)}
      className={cx(styles.control, styles.textarea, invalid && styles.invalid, className)}
    />
  );
});

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, id, children, ...rest },
  ref,
) {
  const field = useFieldContext();
  const invalid = field?.invalid ?? false;

  return (
    <select
      {...rest}
      ref={ref}
      id={id ?? field?.controlId}
      aria-describedby={rest["aria-describedby"] ?? field?.describedBy}
      aria-invalid={rest["aria-invalid"] ?? (invalid || undefined)}
      className={cx(styles.control, invalid && styles.invalid, className)}
    >
      {children}
    </select>
  );
});
