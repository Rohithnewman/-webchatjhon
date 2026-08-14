import { createContext, useContext, useId, type ReactNode } from "react";
import styles from "./Field.module.css";

interface FieldContextValue {
  controlId: string;
  describedBy?: string;
  invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** Consumed by Input/Textarea/Select so they wire their own a11y attributes. */
export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext);
}

export interface FieldProps {
  label: string;
  children: ReactNode;
  /** Shown under the control; replaced by `error` when one is present. */
  hint?: string;
  error?: string;
  optionalText?: string;
}

/**
 * Labels a control and owns its description and error wiring.
 *
 * The control inside reads this component's context, so `id`,
 * `aria-describedby`, and `aria-invalid` are never hand-maintained at the call
 * site — which is where they normally rot.
 */
export function Field({ label, children, hint, error, optionalText }: FieldProps) {
  const controlId = useId();
  const messageId = `${controlId}-message`;
  const hasMessage = Boolean(error ?? hint);

  return (
    <FieldContext.Provider
      value={{
        controlId,
        describedBy: hasMessage ? messageId : undefined,
        invalid: Boolean(error),
      }}
    >
      <div className={styles.root}>
        <label className={styles.label} htmlFor={controlId}>
          <span>{label}</span>
          {optionalText ? <span className={styles.optional}>{optionalText}</span> : null}
        </label>

        {children}

        {error ? (
          <span id={messageId} className={styles.error} role="alert">
            {error}
          </span>
        ) : hint ? (
          <span id={messageId} className={styles.hint}>
            {hint}
          </span>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
