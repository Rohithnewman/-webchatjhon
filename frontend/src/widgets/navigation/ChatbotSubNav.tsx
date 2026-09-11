import {
  ChevronDown,
  Code2,
  Globe,
  Layers,
  Palette,
  Plus,
  Rocket,
  Settings,
  Workflow,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import type { Chatbot } from "../../entities/chatbot/types";

interface Props {
  chatbots: Chatbot[];
  selectedChatbot: Chatbot | null;
  onSelectChatbot: (id: string) => void;
  onCreateNewBot: () => void;
  onOpenTemplates?: () => void;
}

export function ChatbotSubNav({
  chatbots,
  selectedChatbot,
  onSelectChatbot,
  onCreateNewBot,
  onOpenTemplates,
}: Props) {
  const location = useLocation();
  const path = location.pathname;
  const currentId = selectedChatbot?.id || chatbots[0]?.id || "";

  return (
    <aside className="chatbot-sub-sidebar">
      <div className="chatbot-sub-header">
        <h2>Chatbot</h2>
        <button
          type="button"
          className="btn-new-bot-pill"
          onClick={onCreateNewBot}
        >
          <Plus size={15} />
          <span>New Bot</span>
        </button>
      </div>

      <div className="chatbot-selector-section">
        <button
          type="button"
          className="all-chatbots-link"
          onClick={() => {}}
        >
          <span className="dot-circle" />
          <span>All Chatbots</span>
        </button>

        <div className="bot-dropdown-wrapper">
          <div className="bot-dropdown-btn">
            <Globe size={16} className="bot-globe-icon" />
            <select
              value={currentId}
              onChange={(e) => onSelectChatbot(e.target.value)}
              className="bot-select-field"
            >
              {chatbots.map((bot) => (
                <option key={bot.id} value={bot.id}>
                  {bot.name}
                </option>
              ))}
            </select>
            <ChevronDown size={15} className="dropdown-chevron" />
          </div>
        </div>
      </div>

      <nav className="chatbot-sub-menu">
        <Link
          to={`/chatbots/${currentId}/flows`}
          className={`sub-menu-item ${
            path.includes("/flows") || path === "/chatbots" || path.startsWith("/builder")
              ? "is-active"
              : ""
          }`}
        >
          <Workflow size={17} />
          <span>Chat Flows</span>
        </Link>

        <Link
          to={`/chatbots/${currentId}/design`}
          className={`sub-menu-item ${path.includes("/design") ? "is-active" : ""}`}
        >
          <Palette size={17} />
          <span>Chatbot Design</span>
        </Link>

        <Link
          to={`/chatbots/${currentId}/install`}
          className={`sub-menu-item ${path.includes("/install") ? "is-active" : ""}`}
        >
          <Rocket size={17} />
          <span>Install Your Chatbot</span>
        </Link>

        <Link
          to="/settings"
          className={`sub-menu-item ${path.startsWith("/settings") ? "is-active" : ""}`}
        >
          <Settings size={17} />
          <span>Settings</span>
        </Link>

        <button type="button" className="sub-menu-item" onClick={onOpenTemplates}>
          <Layers size={17} />
          <span>Chat Flow Templates</span>
        </button>
      </nav>
    </aside>
  );
}
