import { ChevronRight } from "lucide-react";

export type WizardStage = "platform" | "purpose" | "setup" | "install";

const STAGES: readonly { id: WizardStage; label: string }[] = [
  { id: "platform", label: "Select Platform" },
  { id: "purpose", label: "Usecase" },
  { id: "setup", label: "Setup Bot" },
  { id: "install", label: "Install Bot" },
];

export function WizardStepper({ current }: { current: WizardStage }) {
  const index = STAGES.findIndex((s) => s.id === current);
  return (
    <ol className="wizard-stepper" aria-label="Create chatbot progress">
      {STAGES.map((stage, i) => (
        <li
          key={stage.id}
          className={`wizard-step ${i < index ? "is-done" : i === index ? "is-current" : ""}`}
          aria-current={i === index ? "step" : undefined}
        >
          <span>{stage.label}</span>
          {i < STAGES.length - 1 && <ChevronRight size={14} aria-hidden />}
        </li>
      ))}
    </ol>
  );
}
