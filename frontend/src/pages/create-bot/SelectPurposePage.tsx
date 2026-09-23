import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { chatbotApi } from "../../entities/chatbot/api";
import { FLOW_TEMPLATES } from "../../features/flow-templates/templates";
import { Button, Dialog, Field, Input, useToast } from "../../shared/ui";
import { PrimaryNav } from "../../widgets/navigation/PrimaryNav";
import { WizardHeader } from "../../widgets/wizard/WizardHeader";
import { OTHER_SUGGESTIONS, PURPOSES, type Purpose } from "./purposes";

export function SelectPurposePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const client = useQueryClient();
  const [otherOpen, setOtherOpen] = useState(false);
  const [note, setNote] = useState("");

  const create = useMutation({
    mutationFn: async (input: { purpose: Purpose; note?: string }) => {
      const card = PURPOSES.find((p) => p.id === input.purpose)!;
      const bot = await chatbotApi.create({
        name: card.botName,
        description: input.note ?? "",
        platform: "website",
        use_case: input.purpose,
        use_case_note: input.note ?? null,
      });
      const template = FLOW_TEMPLATES.find((t) => t.id === card.templateId);
      if (template) {
        try {
          await chatbotApi.saveFlow(bot.id, template.build());
        } catch {
          toast.error("The starting template could not be applied — pick one from Chat Flow Templates.");
        }
      }
      return bot;
    },
    onSuccess: async (bot) => {
      await client.invalidateQueries({ queryKey: ["chatbots"] });
      navigate(`/builder/${bot.id}?wizard=1`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not create the chatbot"),
  });

  const platform = (location.state as { platform?: string } | null)?.platform;
  if (platform !== "website") return <Navigate to="/chatbots/new" replace />;

  const pick = (purpose: Purpose) => {
    if (purpose === "other") { setOtherOpen(true); return; }
    create.mutate({ purpose });
  };

  return (
    <div className="ambot-dashboard-shell">
      <PrimaryNav />
      <main className="ambot-main-viewport wizard-viewport">
        <WizardHeader current="purpose" backTo="/chatbots/new" />
        <section className="wizard-body">
          <h1>Select Your Purpose</h1>
          <p className="wizard-subtitle">Every platform offers unique features, this helps us to personalize your bot creation journey.</p>
          <div className="wizard-card-grid wizard-grid-purpose">
            {PURPOSES.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`wizard-card ${p.id === "other" ? "is-wide" : ""} ${create.isPending && create.variables?.purpose === p.id ? "is-pending" : ""}`}
                disabled={create.isPending}
                onClick={() => pick(p.id)}
              >
                <span className="wizard-card-art" aria-hidden>{p.emoji}</span>
                <span className="wizard-card-title">{p.title}</span>
                <span className="wizard-card-desc">{p.description}</span>
              </button>
            ))}
          </div>
        </section>
      </main>

      <Dialog
        open={otherOpen}
        onClose={() => setOtherOpen(false)}
        title="Describe what you are trying to solve here."
        footer={
          <>
            <Button onClick={() => { setOtherOpen(false); create.mutate({ purpose: "other" }); }}>Skip</Button>
            <Button variant="primary" loading={create.isPending} onClick={() => { setOtherOpen(false); create.mutate({ purpose: "other", note: note.trim() || undefined }); }}>
              Next
            </Button>
          </>
        }
      >
        <Field label="Use Case">
          <Input autoFocus maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Use Case" />
        </Field>
        <div className="wizard-chips">
          {OTHER_SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="wizard-chip" onClick={() => setNote(s)}>{s}</button>
          ))}
        </div>
      </Dialog>
    </div>
  );
}
