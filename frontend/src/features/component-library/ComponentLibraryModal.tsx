import {
  BookOpen,
  Bot,
  Calendar,
  CheckCircle,
  FileText,
  Globe,
  HelpCircle,
  Image,
  Layers,
  Link2,
  ListCheck,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Search,
  Share2,
  Terminal,
  User,
  Video,
  X,
} from "lucide-react";
import { useState } from "react";

export interface ComponentItemDef {
  id: string;
  name: string;
  category: "request" | "send" | "decide" | "dev";
  description: string;
  icon: any;
  nodeType: string;
  defaultData?: any;
}

export const ALL_COMPONENTS: ComponentItemDef[] = [
  // Request Information
  {
    id: "name",
    name: "Name",
    category: "request",
    description: "Ask for user's name",
    icon: User,
    nodeType: "input",
    defaultData: { label: "Name", prompt: "May I know your name please?", variable: "name", inputType: "name" },
  },
  {
    id: "phone",
    name: "Phone Number",
    category: "request",
    description: "Ask for user's phone number + country code",
    icon: Phone,
    nodeType: "input",
    defaultData: { label: "Phone Number", prompt: "Please share your phone number:", variable: "phone", inputType: "phone" },
  },
  {
    id: "email",
    name: "Email",
    category: "request",
    description: "Ask for User's email address",
    icon: Mail,
    nodeType: "input",
    defaultData: { label: "Email", prompt: "What is your email address?", variable: "email", inputType: "email" },
  },
  {
    id: "single_choice",
    name: "Single Choice",
    category: "request",
    description: "Give user choice to select one from multiple options and direct flow based on the choice",
    icon: CheckCircle,
    nodeType: "choice",
    defaultData: { label: "Single Choice", prompt: "Please choose an option:", options: "Option 1\nOption 2" },
  },
  {
    id: "multiple_choice",
    name: "Multiple Choice",
    category: "request",
    description: "Give user choice to select multiple options and store responses",
    icon: ListCheck,
    nodeType: "choice",
    defaultData: { label: "Multiple Choice", prompt: "Select all that apply:", options: "Item A\nItem B\nItem C" },
  },
  {
    id: "text_question",
    name: "Text Question",
    category: "request",
    description: "Ask a question and collect answer in text",
    icon: HelpCircle,
    nodeType: "question",
    defaultData: { label: "Question", prompt: "How can we assist you today?", variable: "inquiry" },
  },
  {
    id: "file",
    name: "File",
    category: "request",
    description: "Ask user to upload a file",
    icon: FileText,
    nodeType: "question",
    defaultData: { label: "Upload File", prompt: "Please upload your document:", variable: "uploaded_file" },
  },
  {
    id: "location",
    name: "Location",
    category: "request",
    description: "Capture user city or coordinates",
    icon: MapPin,
    nodeType: "input",
    defaultData: { label: "Location", prompt: "What is your city or location?", variable: "location", inputType: "text" },
  },
  {
    id: "appointment",
    name: "Appointment",
    category: "request",
    description: "Schedule a booking or site visit",
    icon: Calendar,
    nodeType: "question",
    defaultData: { label: "Appointment", prompt: "Choose a convenient date and time:", variable: "appointment_time" },
  },

  // Send Information
  {
    id: "message",
    name: "Message",
    category: "send",
    description: "Send static text message to the user",
    icon: MessageSquare,
    nodeType: "message",
    defaultData: { label: "Message", message: "Hello! Welcome to our service." },
  },
  {
    id: "image",
    name: "Image / GIF",
    category: "send",
    description: "Display an image or banner",
    icon: Image,
    nodeType: "message",
    defaultData: { label: "Image", message: "Here is a preview: https://example.com/banner.png" },
  },
  {
    id: "video",
    name: "Video",
    category: "send",
    description: "Share a video guide or demo link",
    icon: Video,
    nodeType: "message",
    defaultData: { label: "Video", message: "Watch our demo: https://example.com/demo.mp4" },
  },
  {
    id: "weblink",
    name: "Web Link",
    category: "send",
    description: "Direct user to an external URL",
    icon: Link2,
    nodeType: "message",
    defaultData: { label: "Link", message: "Visit our website at https://example.com" },
  },

  // Decide and Act
  {
    id: "condition",
    name: "Condition / Branch",
    category: "decide",
    description: "Branch conversation based on variable comparison",
    icon: Layers,
    nodeType: "condition",
    defaultData: { label: "Condition", variable: "inquiry", operator: "contains", value: "pricing" },
  },
  {
    id: "handoff",
    name: "Live Agent Handoff",
    category: "decide",
    description: "Transfer the conversation to a human agent",
    icon: User,
    nodeType: "handoff",
    defaultData: { label: "Live Agent", message: "Connecting you to an agent. Please hold on..." },
  },
  {
    id: "llm_answer",
    name: "AI / LLM Answer",
    category: "decide",
    description: "Generate intelligent response with AI provider",
    icon: Bot,
    nodeType: "llm",
    defaultData: { label: "AI Response", prompt: "You are a helpful customer concierge." },
  },
  {
    id: "knowledge_search",
    name: "Knowledge Search (RAG)",
    category: "decide",
    description: "Search workspace knowledge base for answers",
    icon: BookOpen,
    nodeType: "knowledge_search",
    defaultData: { label: "Knowledge Search" },
  },

  // Developers
  {
    id: "http_request",
    name: "HTTP Request",
    category: "dev",
    description: "Fetch or push data to external REST API",
    icon: Globe,
    nodeType: "http_request",
    defaultData: { label: "API Call", url: "https://api.example.com/lead", method: "POST" },
  },
  {
    id: "webhook",
    name: "Webhook Event",
    category: "dev",
    description: "Emit an event payload to a webhook URL",
    icon: Share2,
    nodeType: "webhook",
    defaultData: { label: "Webhook", url: "https://webhook.site/event" },
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectComponent: (comp: ComponentItemDef) => void;
}

export function ComponentLibraryModal({ open, onClose, onSelectComponent }: Props) {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  if (!open) return null;

  const counts = {
    all: ALL_COMPONENTS.length,
    request: ALL_COMPONENTS.filter((c) => c.category === "request").length,
    send: ALL_COMPONENTS.filter((c) => c.category === "send").length,
    decide: ALL_COMPONENTS.filter((c) => c.category === "decide").length,
    dev: ALL_COMPONENTS.filter((c) => c.category === "dev").length,
  };

  const filtered = ALL_COMPONENTS.filter((item) => {
    const matchesCategory = activeCategory === "all" || item.category === activeCategory;
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="component-modal-overlay" onClick={onClose}>
      <div
        className="component-modal-box"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="component-modal-search">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search By Component Name"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          <button type="button" className="btn-close-modal" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="component-modal-body">
          {/* Left Categories List */}
          <aside className="comp-category-sidebar">
            <button
              type="button"
              className={`cat-btn ${activeCategory === "all" ? "is-active" : ""}`}
              onClick={() => setActiveCategory("all")}
            >
              <span>All</span>
              <span className="cat-count">{counts.all}</span>
            </button>
            <button
              type="button"
              className={`cat-btn ${activeCategory === "request" ? "is-active" : ""}`}
              onClick={() => setActiveCategory("request")}
            >
              <span>Request Information</span>
              <span className="cat-count">{counts.request}</span>
            </button>
            <button
              type="button"
              className={`cat-btn ${activeCategory === "send" ? "is-active" : ""}`}
              onClick={() => setActiveCategory("send")}
            >
              <span>Send Information</span>
              <span className="cat-count">{counts.send}</span>
            </button>
            <button
              type="button"
              className={`cat-btn ${activeCategory === "decide" ? "is-active" : ""}`}
              onClick={() => setActiveCategory("decide")}
            >
              <span>Decide and Act</span>
              <span className="cat-count">{counts.decide}</span>
            </button>
            <button
              type="button"
              className={`cat-btn ${activeCategory === "dev" ? "is-active" : ""}`}
              onClick={() => setActiveCategory("dev")}
            >
              <span>Developers</span>
              <span className="cat-count">{counts.dev}</span>
            </button>
          </aside>

          {/* Right Components Grid */}
          <div className="comp-items-scroll">
            <h4 className="comp-section-title">All Components</h4>
            <div className="comp-items-list">
              {filtered.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    className="comp-card"
                    onClick={() => {
                      onSelectComponent(item);
                      onClose();
                    }}
                  >
                    <div className={`comp-icon-box cat-${item.category}`}>
                      <Icon size={20} />
                    </div>
                    <div className="comp-info">
                      <strong>{item.name}</strong>
                      <p>{item.description}</p>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="comp-empty">No components found for "{searchQuery}"</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
