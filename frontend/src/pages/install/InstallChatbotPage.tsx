import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Headset, Mail, MessageCircle, PlayCircle } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { chatbotApi } from "../../entities/chatbot/api";
import type { Chatbot, InstallVerifyResult } from "../../entities/chatbot/types";
import { useMe } from "../../entities/me/api";
import { permissionLabel } from "../../entities/workspace/api";
import { WidgetEmbedDialog } from "../../features/widget-embed/WidgetEmbedDialog";
import { ReadOnlyBanner, Tabs, useToast } from "../../shared/ui";
import { AmbotShell } from "../../widgets/navigation/AmbotShell";

const API_BASE = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/api/v1").replace(/\/$/, "");
const BACKEND_ROOT = API_BASE.replace(/\/api\/v1$/, "");
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL ?? "support@ambot365.in";
const SUPPORT_WHATSAPP = import.meta.env.VITE_SUPPORT_WHATSAPP ?? "https://wa.me/";

const REASONS: Record<Extract<InstallVerifyResult, { connected: false }>["reason"], string> = {
  unreachable: "We could not reach that page. Check the URL and that the site is published.",
  script_missing: "The page loaded but the chatbot script is not on it.",
  wrong_chatbot: "The page has a chatbot script for a different bot.",
};

type Tab = "website" | "landing";
const TABS = [{ id: "website", label: "Website Chatbot" }, { id: "landing", label: "Landing Page Bot" }] as const;

function useCopy() {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  return {
    copied,
    copy: async (text: string, message: string) => {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(message);
      setTimeout(() => setCopied(false), 2000);
    },
  };
}

function WebsiteTab({ bot, readOnly }: { bot: Chatbot; readOnly: boolean }) {
  const toast = useToast();
  const client = useQueryClient();
  const { copied, copy } = useCopy();
  const [url, setUrl] = useState(bot.installed_url ?? "");
  const [reason, setReason] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const script = `<script src="${BACKEND_ROOT}/widget.js" data-chatbot-id="${bot.id}" data-api="${API_BASE}" async></script>`;

  const verify = useMutation({
    mutationFn: () => chatbotApi.verifyInstall(bot.id, url.trim()),
    onSuccess: async (result) => {
      if (result.connected) {
        setReason(null);
        await client.invalidateQueries({ queryKey: ["chatbots"] });
        toast.success("Installation verified — your chatbot is connected.");
      } else {
        setReason(REASONS[result.reason]);
      }
    },
    onError: (err) => setReason(err instanceof Error ? err.message : "Verification failed"),
  });

  const connected = Boolean(bot.installed_url);
  return (
    <div className="install-layout">
      <section className="install-card install-main">
        <div className="install-card-header">
          <span className="install-code-badge">&lt;/&gt;</span>
          <div><strong>Chatbot Installation</strong><span>Installation instructions to install for Custom Platform</span></div>
          <span className={`install-pill ${connected ? "is-connected" : ""}`}>{connected ? `Connected · ${new URL(bot.installed_url!).host}` : "Not Connected"}</span>
        </div>

        <div className="install-step">
          <span className="install-step-no">1</span>
          <div>
            <strong>Install Your Chatbot</strong>
            <p>Add the following script inside the <code>&lt;head&gt;</code> or just before the closing <code>&lt;/body&gt;</code> tag of your website</p>
            <div className="install-snippet-box">
              <pre><code>{script}</code></pre>
              <button type="button" className="btn-copy-script" onClick={() => copy(script, "Script copied to clipboard")}>
                {copied ? <Check size={16} /> : <Copy size={16} />}<span>{copied ? "Copied" : "Copy Script"}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="install-step">
          <span className="install-step-no">2</span>
          <div>
            <strong>Verify Installation</strong>
            <p>Enter your website URL to confirm the script is active and correctly configured.</p>
            <form className="install-verify-row" onSubmit={(e) => { e.preventDefault(); if (url.trim() && !readOnly) verify.mutate(); }}>
              <input type="url" placeholder="Enter your website URL" value={url} onChange={(e) => setUrl(e.target.value)} required disabled={readOnly} />
              <button type="submit" className="btn-verify" disabled={readOnly || verify.isPending || !url.trim()}>{verify.isPending ? "Verifying…" : "Verify"}</button>
            </form>
            {reason && <p className="install-verify-error" role="alert">{reason}</p>}
          </div>
        </div>
      </section>

      <aside className="install-card install-help">
        <Headset size={40} className="install-help-icon" />
        <h3>Need Help?</h3>
        <p>Our team is here to help you get started and make the most of your chatbot.</p>
        <a className="install-help-row" href={`mailto:${SUPPORT_EMAIL}?subject=Chatbot installation help (${bot.name})`}><Mail size={18} /><span><strong>Email a Developer</strong><small>Get help from our technical team</small></span></a>
        <a className="install-help-row" href={SUPPORT_WHATSAPP} target="_blank" rel="noreferrer"><MessageCircle size={18} /><span><strong>WhatsApp Support</strong><small>Chat with our support team</small></span></a>
        <button type="button" className="install-help-row" onClick={() => setTestOpen(true)}><PlayCircle size={18} /><span><strong>Test Bot</strong><small>Test your chatbot in real-time</small></span></button>
      </aside>

      <WidgetEmbedDialog open={testOpen} chatbot={bot} onClose={() => setTestOpen(false)} />
    </div>
  );
}

function LandingTab({ bot }: { bot: Chatbot }) {
  const { copied, copy } = useCopy();
  const link = `${BACKEND_ROOT}/chat/${bot.id}`;
  return (
    <section className="install-card install-main">
      <div className="install-card-header">
        <span className="install-code-badge">🖥️</span>
        <div><strong>Landing Page Bot</strong><span>Share this link — the chatbot fills the whole page.</span></div>
      </div>
      <div className="install-snippet-box">
        <pre><code>{link}</code></pre>
        <button type="button" className="btn-copy-script" onClick={() => copy(link, "Link copied to clipboard")}>
          {copied ? <Check size={16} /> : <Copy size={16} />}<span>{copied ? "Copied" : "Copy link"}</span>
        </button>
        <a className="btn-copy-script" href={link} target="_blank" rel="noreferrer"><ExternalLink size={16} /><span>Open</span></a>
      </div>
      {bot.status !== "published" && <p className="install-verify-error">Publish the chatbot first — the landing page only answers when the bot is published.</p>}
    </section>
  );
}

export function InstallChatbotPage() {
  const [params, setParams] = useSearchParams();
  const { can, isReady } = useMe();
  const readOnly = isReady && !can("bots:manage");
  const tab: Tab = params.get("tab") === "landing" ? "landing" : "website";
  return (
    <AmbotShell>
      {({ selectedChatbot }) => (
        <div className="install-page-container">
          <header className="install-header">
            <div className="install-title-col">
              <h1>Install Your Chatbot</h1>
              <p>Install your chatbot on your website or launch it as a landing page.</p>
            </div>
            <Link to="/chatbots" className="install-help-link">Help Guide ↗</Link>
          </header>
          {readOnly && <ReadOnlyBanner label={permissionLabel("bots:manage")} />}
          <Tabs items={TABS} value={tab} onChange={(next) => setParams({ tab: next })} label="Install format" />
          {selectedChatbot && (tab === "website" ? <WebsiteTab key={selectedChatbot.id} bot={selectedChatbot} readOnly={readOnly} /> : <LandingTab bot={selectedChatbot} />)}
        </div>
      )}
    </AmbotShell>
  );
}
