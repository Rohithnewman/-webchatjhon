import type { ReactNode } from "react";

import { PrimaryNav } from "./PrimaryNav";

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/** Layout for workspace-level pages (settings, analytics, inbox, knowledge)
 *  that are not scoped to one chatbot, so they carry no chatbot sub-nav. */
export function DashboardShell({ title, subtitle, actions, children }: Props) {
  return (
    <div className="ambot-dashboard-shell">
      <PrimaryNav />
      <main className="ambot-main-viewport">
        <div className="dashboard-page">
          <header className="dashboard-page-header">
            <div>
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
            {actions && <div className="dashboard-page-actions">{actions}</div>}
          </header>
          <div className="dashboard-page-body">{children}</div>
        </div>
      </main>
    </div>
  );
}
