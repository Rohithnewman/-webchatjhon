import { BookOpen, Bot, LogOut, MessageSquare, Workflow } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuthStore } from "../../features/auth/model/auth-store";
import { Button } from "../../shared/ui";

export function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const path = location.pathname;

  const handleSignOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="app-global-header">
      <div className="header-brand">
        <Bot size={22} className="brand-icon" />
        <strong>WebChatBots</strong>
      </div>

      <nav className="header-nav">
        <Link
          to="/builder"
          className={`header-nav-link ${path.startsWith("/builder") ? "is-active" : ""}`}
        >
          <Workflow size={16} />
          <span>Flow Builder</span>
        </Link>
        <Link
          to="/conversations"
          className={`header-nav-link ${path.startsWith("/conversations") ? "is-active" : ""}`}
        >
          <MessageSquare size={16} />
          <span>Inbox & Live Chat</span>
        </Link>
        <Link
          to="/knowledge"
          className={`header-nav-link ${path.startsWith("/knowledge") ? "is-active" : ""}`}
        >
          <BookOpen size={16} />
          <span>Knowledge Base</span>
        </Link>
      </nav>

      <div className="header-actions">
        <Button
          size="sm"
          variant="ghost"
          icon={<LogOut size={15} />}
          onClick={handleSignOut}
        >
          Sign Out
        </Button>
      </div>
    </header>
  );
}
