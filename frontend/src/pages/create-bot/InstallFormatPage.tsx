import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";

import { chatbotApi } from "../../entities/chatbot/api";
import type { Chatbot } from "../../entities/chatbot/types";
import { LoadingState, useToast } from "../../shared/ui";
import { PrimaryNav } from "../../widgets/navigation/PrimaryNav";
import { WizardHeader } from "../../widgets/wizard/WizardHeader";

type Format = NonNullable<Chatbot["install_format"]>;

const FORMATS = [
  { id: "chat_button", title: "Add as chat button on website", bestFor: "Lead capture & customer support", description: "Add a floating chat button on your website that opens when users need help.", emoji: "💬", enabled: true, recommended: true, tab: "website" },
  { id: "landing_page", title: "Put chatbot to your entire page", bestFor: "Full conversational landing experience", description: "Turn your full page into a conversational experience by connecting your website.", emoji: "🖥️", enabled: true, recommended: false, tab: "landing" },
  { id: "mobile_app", title: "Bot in your Mobile App", bestFor: "In-app engagement", description: "Install website bot directly into your mobile application.", emoji: "📱", enabled: false, recommended: false, tab: "" },
  { id: "embedded", title: "Embed chatbot in a page", bestFor: "Specific workflows or page sections", description: "Place the chatbot inside a specific section or page of your website or product.", emoji: "🧩", enabled: false, recommended: false, tab: "" },
] as const;

export function InstallFormatPage() {
  const { chatbotId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const client = useQueryClient();
  const bot = useQuery({ queryKey: ["chatbot", chatbotId], queryFn: () => chatbotApi.get(chatbotId), enabled: Boolean(chatbotId) });

  const choose = useMutation({
    mutationFn: (format: Format) => chatbotApi.update(chatbotId, { install_format: format }),
    onSuccess: async (updated) => {
      await client.invalidateQueries({ queryKey: ["chatbots"] });
      const tab = FORMATS.find((f) => f.id === updated.install_format)?.tab ?? "website";
      navigate(`/chatbots/${chatbotId}/install?tab=${tab}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save the install format"),
  });

  if (bot.isLoading) return <LoadingState label="Loading chatbot..." />;

  return (
    <div className="ambot-dashboard-shell">
      <PrimaryNav />
      <main className="ambot-main-viewport wizard-viewport">
        <WizardHeader current="install" backTo={`/builder/${chatbotId}?wizard=1`} />
        <section className="wizard-body">
          <h1>Link bot to your platform</h1>
          <p className="wizard-subtitle">Choose how you want to make your chatbot accessible to your users.</p>
          <div className="wizard-card-grid wizard-grid-formats" role="radiogroup" aria-label="Install format">
            {FORMATS.map((f) => {
              const selected = bot.data?.install_format === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`format-card ${selected ? "is-selected" : ""} ${f.enabled ? "" : "is-disabled"}`}
                  disabled={!f.enabled || choose.isPending}
                  onClick={() => choose.mutate(f.id as Format)}
                >
                  {f.recommended && <span className="format-recommended">★ Recommended</span>}
                  <span className="format-radio" aria-hidden />
                  <span className="format-art" aria-hidden>{f.emoji}</span>
                  <span className="format-body">
                    <strong>{f.title}</strong>
                    <span className="format-best"><b>Best for:</b> {f.bestFor}</span>
                    <span className="format-desc">{f.description}</span>
                    {!f.enabled && <span className="wizard-card-badge">Coming soon</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="wizard-footnote">🛈 You can always change the platform or install on additional pages later from "Install your Chatbot".</p>
        </section>
      </main>
    </div>
  );
}
