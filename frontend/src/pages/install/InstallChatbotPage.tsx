import { Check, Code2, Copy, ExternalLink, Globe, Rocket, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { useToast } from "../../shared/ui";
import { AmbotShell } from "../../widgets/navigation/AmbotShell";

export function InstallChatbotPage() {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const API_BASE = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/api/v1").replace(/\/$/, "");
  const BACKEND_ROOT = API_BASE.replace(/\/api\/v1$/, "");

  return (
    <AmbotShell>
      {({ selectedChatbot }) => {
        const botId = selectedChatbot?.id ?? "YOUR_CHATBOT_ID";
        const scriptCode = `<script src="${BACKEND_ROOT}/widget.js" data-chatbot-id="${botId}" data-api="${API_BASE}" async></script>`;

        const handleCopy = async () => {
          await navigator.clipboard.writeText(scriptCode);
          setCopied(true);
          toast.success("Embed script copied to clipboard!");
          setTimeout(() => setCopied(false), 2000);
        };

        return (
          <div className="install-page-container">
            <header className="install-header">
              <div className="install-title-col">
                <h1>Install Your Chatbot</h1>
                <p>
                  Deploy your chatbot to any website in seconds by embedding a single lightweight
                  script tag.
                </p>
              </div>
            </header>

            <div className="install-card">
              <div className="install-card-header">
                <Code2 size={20} className="code-icon" />
                <div>
                  <strong>Standard HTML Script Tag</strong>
                  <span>Paste before the closing &lt;/body&gt; tag on your pages</span>
                </div>
              </div>

              <div className="install-snippet-box">
                <pre>
                  <code>{scriptCode}</code>
                </pre>
                <button type="button" className="btn-copy-script" onClick={handleCopy}>
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copied ? "Copied" : "Copy Code"}</span>
                </button>
              </div>
            </div>

            <div className="install-platforms-grid">
              <div className="platform-card">
                <div className="platform-icon">🌐</div>
                <h3>Custom Website / HTML</h3>
                <p>Paste the snippet into your index.html or theme template before &lt;/body&gt;.</p>
              </div>

              <div className="platform-card">
                <div className="platform-icon">⚡</div>
                <h3>WordPress</h3>
                <p>Use the WPCode plugin or insert the script in Appearance &gt; Theme File Editor.</p>
              </div>

              <div className="platform-card">
                <div className="platform-icon">🛍️</div>
                <h3>Shopify</h3>
                <p>Navigate to Online Store &gt; Themes &gt; Edit code, and add to theme.liquid.</p>
              </div>

              <div className="platform-card">
                <div className="platform-icon">🏷️</div>
                <h3>Google Tag Manager</h3>
                <p>Create a Custom HTML Tag, paste this script, and trigger on All Pages.</p>
              </div>
            </div>
          </div>
        );
      }}
    </AmbotShell>
  );
}
