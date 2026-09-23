import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { WizardStepper, type WizardStage } from "./WizardStepper";

interface Props {
  current: WizardStage;
  backTo: string;
  children?: ReactNode; // right-hand slot
}

export function WizardHeader({ current, backTo, children }: Props) {
  return (
    <header className="wizard-header">
      <Link to={backTo} className="wizard-back" aria-label="Back">
        <ArrowLeft size={18} />
        <span>Create Chatbot</span>
      </Link>
      <WizardStepper current={current} />
      <div className="wizard-header-right">{children}</div>
    </header>
  );
}
