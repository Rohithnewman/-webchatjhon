import { BarChart3, BookOpen, Bot, LogOut, MessageSquare, Settings, ShieldCheck } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useMe } from "../../entities/me/api";
import { useAuthStore } from "../../entities/session/auth-store";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

export function PrimaryNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const { me, can, isReady } = useMe();
  const path = location.pathname;
  // Optimistic until we know for sure: shows the link while /auth/me is
  // still loading, then hides it if the role turns out to lack the read.
  const canSeeAnalytics = !isReady || can("analytics:read");

  const handleSignOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const isChatbotActive = path.startsWith("/chatbots") || path.startsWith("/builder");
  const isSuperadmin = Boolean(me?.is_superadmin);

  return (
    <aside className="primary-icon-nav" aria-label="Main Navigation">
      <div className="primary-nav-top">
        <Link to={isSuperadmin ? "/admin" : "/chatbots"} className="primary-logo-link" title="Ambot365">
          <div className="primary-logo-icon">
            <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" width="28" height="28">
              <path
                d="M18 3L31 10.5V25.5L18 33L5 25.5V10.5L18 3Z"
                fill="#16c784"
                stroke="#10b981"
                strokeWidth="1.5"
              />
              <path
                d="M13 24L18 11L23 24M15 20H21"
                stroke="#ffffff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </Link>

        <nav className="primary-nav-menu">
          {isSuperadmin ? (
            <Link to="/admin" className={`primary-nav-btn ${path.startsWith("/admin") ? "is-active" : ""}`} title="Platform admin">
              <ShieldCheck size={20} /><span>Admin</span>
            </Link>
          ) : (
            <>
              <Link to="/chatbots" className={`primary-nav-btn ${isChatbotActive ? "is-active" : ""}`} title="Chatbots">
                <Bot size={20} /><span>Chatbot</span>
              </Link>
              <Link to="/conversations" className={`primary-nav-btn ${path.startsWith("/conversations") ? "is-active" : ""}`} title="Inbox">
                <MessageSquare size={20} /><span>Inbox</span>
              </Link>
              <Link to="/knowledge" className={`primary-nav-btn ${path.startsWith("/knowledge") ? "is-active" : ""}`} title="Knowledge base">
                <BookOpen size={20} /><span>Knowledge</span>
              </Link>
              {canSeeAnalytics && (
                <Link to="/analytics" className={`primary-nav-btn ${path.startsWith("/analytics") ? "is-active" : ""}`} title="Analytics">
                  <BarChart3 size={20} /><span>Analytics</span>
                </Link>
              )}
              <Link to="/settings" className={`primary-nav-btn ${path.startsWith("/settings") ? "is-active" : ""}`} title="Settings">
                <Settings size={20} /><span>Settings</span>
              </Link>
            </>
          )}
        </nav>
      </div>

      <div className="primary-nav-bottom">
        {!isSuperadmin && <WorkspaceSwitcher />}
        <button
          type="button"
          className="primary-nav-btn signout-btn"
          title="Sign Out"
          onClick={handleSignOut}
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
