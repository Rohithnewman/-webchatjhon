/**
 * The shared UI kit — general-purpose, product-agnostic components.
 *
 * Rule: nothing in here may import from `entities`, `features`, `widgets`, or
 * `pages`. If a component needs to know what a chatbot or a flow node is, it
 * belongs in that layer, not here.
 */

export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from "./Button/Button";
export { IconButton, type IconButtonProps } from "./IconButton/IconButton";
export { Field, useFieldContext, type FieldProps } from "./Field/Field";
export {
  Input,
  Textarea,
  Select,
  type InputProps,
  type TextareaProps,
  type SelectProps,
} from "./Input/Input";
export { Panel, type PanelProps, type PanelHeaderProps } from "./Panel/Panel";
export { ListRow, type ListRowProps } from "./ListRow/ListRow";
export { Dialog, type DialogProps } from "./Dialog/Dialog";
export { Tabs, type TabItem, type TabsProps } from "./Tabs/Tabs";
export { Badge, StatusDot, type BadgeTone, type ChatbotStatus } from "./Status/Status";
export {
  Spinner,
  LoadingState,
  EmptyState,
  VisuallyHidden,
  ReadOnlyBanner,
  type EmptyStateProps,
} from "./Feedback/Feedback";
export { ToastProvider, useToast, type ToastTone } from "./Toast/ToastProvider";
