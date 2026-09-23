import { Globe } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { PrimaryNav } from "../../widgets/navigation/PrimaryNav";
import { WizardHeader } from "../../widgets/wizard/WizardHeader";

const CHANNELS = [
  { id: "website", title: "Website / Mobile App", description: "Add a chatbot to your website or app and engage visitors instantly.", emoji: "🌐", enabled: true },
  { id: "whatsapp", title: "WhatsApp", description: "Automate conversations, send alerts, and chat using WhatsApp.", emoji: "🟢", enabled: false },
  { id: "instagram", title: "Instagram", description: "Reply to DMs, comments, and stories.", emoji: "📸", enabled: false },
  { id: "facebook", title: "Facebook", description: "Connect through automated conversations in Messenger.", emoji: "🔵", enabled: false },
  { id: "telegram", title: "Telegram", description: "Build secure, lightning-fast bot conversations inside Telegram.", emoji: "✈️", enabled: false },
] as const;

export function SelectPlatformPage() {
  const navigate = useNavigate();
  return (
    <div className="ambot-dashboard-shell">
      <PrimaryNav />
      <main className="ambot-main-viewport wizard-viewport">
        <WizardHeader current="platform" backTo="/chatbots" />
        <section className="wizard-body">
          <h1>Select Your Platform</h1>
          <p className="wizard-subtitle">Every platform offers unique features, this helps us to personalize your bot creation</p>
          <div className="wizard-card-grid wizard-grid-5">
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`wizard-card ${c.enabled ? "" : "is-disabled"}`}
                aria-disabled={!c.enabled}
                disabled={!c.enabled}
                onClick={() => navigate("/chatbots/new/purpose", { state: { platform: "website" } })}
              >
                <span className="wizard-card-art" aria-hidden>{c.emoji}</span>
                <span className="wizard-card-title">{c.id === "website" ? <Globe size={16} /> : null}{c.title}</span>
                <span className="wizard-card-desc">{c.description}</span>
                {!c.enabled && <span className="wizard-card-badge">Coming soon</span>}
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
