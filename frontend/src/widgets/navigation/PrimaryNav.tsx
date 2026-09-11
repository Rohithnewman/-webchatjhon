import {
  BarChart3,
  Bot,
  CreditCard,
  Home,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Users,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuthStore } from "../../features/auth/model/auth-store";

export function PrimaryNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const path = location.pathname;

  const handleSignOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const isChatbotActive =
    path.startsWith("/chatbots") || path.startsWith("/builder") || path.startsWith("/design");

  return (
    <aside className="primary-icon-nav" aria-label="Main Navigation">
      <div className="primary-nav-top">
        <Link to="/chatbots" className="primary-logo-link" title="Ambot365">
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
          <Link
            to="/chatbots"
            className={`primary-nav-btn ${path === "/home" ? "is-active" : ""}`}
            title="Home"
          >
            <Home size={20} />
            <span>Home</span>
          </Link>

          <Link
            to="/chatbots"
            className={`primary-nav-btn ${isChatbotActive ? "is-active" : ""}`}
            title="Chatbot"
          >
            <Bot size={20} />
            <span>Chatbot</span>
          </Link>

          <Link
            to="/conversations"
            className={`primary-nav-btn ${path.startsWith("/conversations") ? "is-active" : ""}`}
            title="Inbox"
          >
            <MessageSquare size={20} />
            <span>Inbox</span>
          </Link>

          <Link
            to="/analytics"
            className={`primary-nav-btn ${path.startsWith("/analytics") ? "is-active" : ""}`}
            title="Analytics"
          >
            <BarChart3 size={20} />
            <span>Analytics</span>
          </Link>

          <Link
            to="/knowledge"
            className={`primary-nav-btn ${path.startsWith("/knowledge") || path.startsWith("/subscriptions") ? "is-active" : ""}`}
            title="Subscriptions & Knowledge"
          >
            <CreditCard size={20} />
            <span>Subscriptions</span>
          </Link>

          <button
            type="button"
            className="primary-nav-btn"
            title="Partner"
            onClick={() => alert("Partner portal")}
          >
            <Users size={20} />
            <span>Partner</span>
          </button>

          <button
            type="button"
            className="primary-nav-btn"
            title="More Options"
            onClick={() => alert("More features")}
          >
            <MoreHorizontal size={20} />
            <span>More</span>
          </button>
        </nav>
      </div>

      <div className="primary-nav-bottom">
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
