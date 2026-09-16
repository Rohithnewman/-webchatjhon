import { Bot, Lock, LogOut } from "lucide-react";

import { useMe } from "../../entities/me/api";
import { useAuthStore } from "../../entities/session/auth-store";
import { Badge, Button, type BadgeTone } from "../../shared/ui";

const EFFECTIVE_TONE: Record<string, BadgeTone> = { active: "brand", suspended: "warning", expired: "danger" };

const HEADLINE: Record<string, string> = {
  suspended: "This organisation has been suspended",
  expired: "This organisation's subscription has expired",
};

/** Shown instead of the routed page whenever the signed-in user's
 *  organisation is suspended or its subscription period has ended. The
 *  workspace API is already locked server-side (403 `SUBSCRIPTION_LOCKED`),
 *  so this page relies only on `/auth/me`, which stays reachable. */
export function SubscriptionLockedPage() {
  const { me } = useMe();
  const logout = useAuthStore((s) => s.logout);
  const sub = me?.subscription ?? null;
  const status = sub?.effective_status ?? "suspended";

  return (
    <main className="locked-shell">
      <div className="locked-card">
        <div className="brand-mark">
          <Bot size={22} aria-hidden />
          <span>WebChatBots</span>
        </div>

        <div className="locked-icon" aria-hidden>
          <Lock size={28} />
        </div>

        <h1>{HEADLINE[status] ?? "Access to this organisation is locked"}</h1>
        <p className="locked-copy">
          Your account is signed in, but this organisation's chatbots, conversations and settings are unavailable
          right now.
        </p>

        {sub ? (
          <dl className="locked-details">
            <div>
              <dt>Plan</dt>
              <dd style={{ textTransform: "capitalize" }}>{sub.plan}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd><Badge tone={EFFECTIVE_TONE[sub.effective_status] ?? "neutral"}>{sub.effective_status}</Badge></dd>
            </div>
            <div>
              <dt>Period</dt>
              <dd>{sub.ends_at ? `${sub.starts_at} → ${sub.ends_at}` : `${sub.starts_at} → no expiry`}</dd>
            </div>
          </dl>
        ) : null}

        <p className="locked-copy">Contact the platform administrator to restore access.</p>

        <Button variant="secondary" icon={<LogOut size={15} />} onClick={() => void logout()}>
          Sign out
        </Button>
      </div>
    </main>
  );
}
