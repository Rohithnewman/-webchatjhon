import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronRight,
  Info,
  Maximize2,
  MessageSquare,
  Minus,
  MoreVertical,
  Plus,
  RotateCcw,
  Send,
  Smile,
  Upload,
  X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { chatbotApi } from "../../entities/chatbot/api";
import type { Chatbot, FlowDocument } from "../../entities/chatbot/types";
import { useMe } from "../../entities/me/api";
import { ReadOnlyBanner, useToast } from "../../shared/ui";
import { AmbotShell } from "../../widgets/navigation/AmbotShell";

// Color presets matching the design specifications
const THEME_COLORS = [
  { id: "green", value: "#16c784", bg: "#16c784" },
  { id: "orange", value: "#ff8a00", bg: "#ff8a00" },
  { id: "red", value: "#e53e3e", bg: "#e53e3e" },
  { id: "magenta", value: "#d53f8c", bg: "#d53f8c" },
  { id: "blue", value: "#3182ce", bg: "#3182ce" },
  { id: "bright-green", value: "#38a169", bg: "#38a169" },
  { id: "black", value: "#1a202c", bg: "#1a202c" },
  { id: "burgundy", value: "#9b2c2c", bg: "#9b2c2c" },
];

const CHAT_BG_COLORS = [
  { id: "light-green", value: "#f3faf5", bg: "#f3faf5", border: "#d4eedd" },
  { id: "orange", value: "#fffaf0", bg: "#fffaf0", border: "#fed7aa" },
  { id: "red", value: "#fff5f5", bg: "#fff5f5", border: "#fecaca" },
  { id: "magenta", value: "#fff5f7", bg: "#fff5f7", border: "#fbcfe8" },
  { id: "blue", value: "#ebf8ff", bg: "#ebf8ff", border: "#bae6fd" },
  { id: "white", value: "#ffffff", bg: "#ffffff", border: "#e2e8f0" },
  { id: "black", value: "#1a202c", bg: "#1a202c" },
  { id: "burgundy", value: "#fff5f5", bg: "#9b2c2c" },
];

const AVATARS = [
  { id: "ambot", label: "Ambot", icon: "ambot" },
  { id: "avatar1", label: "Agent 1", icon: "👨‍💼" },
  { id: "avatar2", label: "Agent 2", icon: "🧔" },
  { id: "avatar3", label: "Agent 3", icon: "🧑‍🦱" },
  { id: "avatar4", label: "Agent 4", icon: "👨‍💻" },
  { id: "robot", label: "Robot", icon: "🤖" },
];

interface ChatbotDesignPageInnerProps {
  selectedChatbot: Chatbot | null;
}

function ChatbotDesignPageInner({ selectedChatbot }: ChatbotDesignPageInnerProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { me, can, isReady } = useMe();
  const readOnly = isReady && !can("features:use");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const customColorInputRef = useRef<HTMLInputElement>(null);
  const customBgColorInputRef = useRef<HTMLInputElement>(null);

  // Platform tab: Website Chatbot vs Landing Page Bot
  const [platformTab, setPlatformTab] = useState<"website" | "landing">("website");

  // Inner tab: Content | Theme | Layout
  const [innerTab, setInnerTab] = useState<"content" | "theme" | "layout">("theme");

  // Theme settings
  const [styleMode, setStyleMode] = useState<"classic" | "modern">("modern");
  const [selectedAvatar, setSelectedAvatar] = useState("ambot");
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string | null>(null);
  const [themeColor, setThemeColor] = useState(THEME_COLORS[0].value);
  const [chatBgColor, setChatBgColor] = useState(CHAT_BG_COLORS[0].value);
  const [fontFamily, setFontFamily] = useState("Inter, system-ui, sans-serif");

  // Layout settings
  const [positionWeb, setPositionWeb] = useState<"left" | "center" | "right">("right");
  const [positionMobile, setPositionMobile] = useState<"left" | "center" | "right">("right");
  const [windowSize, setWindowSize] = useState<"S" | "M" | "L" | "XL" | "XXL" | "Custom">("M");
  const [customWidth, setCustomWidth] = useState(380);
  const [customHeight, setCustomHeight] = useState(510);
  const [enableResize, setEnableResize] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Content settings
  const [botTitle, setBotTitle] = useState(selectedChatbot?.name ?? "Ambot365");
  const [botStatusText, setBotStatusText] = useState("Usual reply time: 2 to 3 Minutes");
  const [welcomeMessage, setWelcomeMessage] = useState(
    "👋 Welcome to Ambot365\n\nWe empower businesses with Copilot, AI Agents, Microsoft 365, and smart digital solutions to automate, transform, and accelerate growth.\n\n🚀 Our Solutions • Microsoft 365 Automation & Copilot • AI Chatbots • Premium 3D Website • Office AI Bots • CRM Solutions"
  );
  const [followUpQuestion, setFollowUpQuestion] = useState("May I have your name please? 🙏");
  const [inputPlaceholder, setInputPlaceholder] = useState("Type your answer...");

  // Simulator & interactive test chat in preview
  const [testInput, setTestInput] = useState("");
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [simMessages, setSimMessages] = useState<Array<{ role: string; text: string }>>([
    { role: "bot", text: welcomeMessage },
    { role: "bot", text: followUpQuestion },
  ]);

  // Keep bot name in sync if chatbot loads
  useEffect(() => {
    if (selectedChatbot?.name) {
      setBotTitle(selectedChatbot.name);
    }
  }, [selectedChatbot?.name]);

  // Query current flow document to load saved design
  const flowQuery = useQuery({
    queryKey: ["flow", selectedChatbot?.id],
    queryFn: () => chatbotApi.flow(selectedChatbot!.id),
    enabled: Boolean(selectedChatbot?.id),
  });

  // Load saved design settings from flow definition or localStorage
  useEffect(() => {
    if (!selectedChatbot?.id) return;

    let savedDesign: Record<string, any> | null = null;
    if (flowQuery.data?.definition?.design) {
      savedDesign = flowQuery.data.definition.design;
    } else {
      const localStr = localStorage.getItem(`ambot_design_${selectedChatbot.id}`);
      if (localStr) {
        try {
          savedDesign = JSON.parse(localStr);
        } catch {
          // ignore
        }
      }
    }

    if (savedDesign) {
      if (savedDesign.styleMode) setStyleMode(savedDesign.styleMode);
      if (savedDesign.selectedAvatar) setSelectedAvatar(savedDesign.selectedAvatar);
      if (savedDesign.customAvatarUrl) setCustomAvatarUrl(savedDesign.customAvatarUrl);
      if (savedDesign.themeColor) setThemeColor(savedDesign.themeColor);
      if (savedDesign.chatBgColor) setChatBgColor(savedDesign.chatBgColor);
      if (savedDesign.fontFamily) setFontFamily(savedDesign.fontFamily);
      if (savedDesign.positionWeb) setPositionWeb(savedDesign.positionWeb);
      if (savedDesign.positionMobile) setPositionMobile(savedDesign.positionMobile);
      if (savedDesign.windowSize) setWindowSize(savedDesign.windowSize);
      if (savedDesign.customWidth) setCustomWidth(savedDesign.customWidth);
      if (savedDesign.customHeight) setCustomHeight(savedDesign.customHeight);
      if (savedDesign.enableResize !== undefined) setEnableResize(savedDesign.enableResize);
      if (savedDesign.botTitle) setBotTitle(savedDesign.botTitle);
      if (savedDesign.botStatusText) setBotStatusText(savedDesign.botStatusText);
      if (savedDesign.welcomeMessage) setWelcomeMessage(savedDesign.welcomeMessage);
      if (savedDesign.followUpQuestion) setFollowUpQuestion(savedDesign.followUpQuestion);
      if (savedDesign.inputPlaceholder) setInputPlaceholder(savedDesign.inputPlaceholder);

      // Refresh simulator with saved messages
      setSimMessages([
        { role: "bot", text: savedDesign.welcomeMessage || welcomeMessage },
        { role: "bot", text: savedDesign.followUpQuestion || followUpQuestion },
      ]);
    }
  }, [flowQuery.data?.definition, selectedChatbot?.id]);

  // Update simulator when welcome or question text changes in Content tab
  const handleWelcomeChange = (val: string) => {
    setWelcomeMessage(val);
    setSimMessages((prev) => {
      const rest = prev.slice(1);
      return [{ role: "bot", text: val }, ...rest];
    });
  };

  const handleQuestionChange = (val: string) => {
    setFollowUpQuestion(val);
    setSimMessages((prev) => {
      if (prev.length <= 1) return [...prev, { role: "bot", text: val }];
      return [prev[0], { role: "bot", text: val }, ...prev.slice(2)];
    });
  };

  // Scroll preview to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [simMessages, isBotTyping]);

  // Handle sending a test message in the live interactive preview
  const handleSendSim = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testInput.trim()) return;
    const text = testInput.trim();
    setTestInput("");

    setSimMessages((prev) => [...prev, { role: "user", text }]);
    setIsBotTyping(true);

    setTimeout(() => {
      setIsBotTyping(false);
      setSimMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: `Thank you! I received: "${text}". Our live support team or AI will respond to you right away!`,
        },
      ]);
    }, 700);
  };

  const handleResetPreview = () => {
    setSimMessages([
      { role: "bot", text: welcomeMessage },
      { role: "bot", text: followUpQuestion },
    ]);
    setIsMinimized(false);
    toast.success("Preview conversation reset");
  };

  // Handle custom avatar upload
  const handleAvatarFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === "string") {
        setCustomAvatarUrl(event.target.result);
        setSelectedAvatar("custom");
        toast.success("Custom bot avatar uploaded");
      }
    };
    reader.readAsDataURL(file);
  };

  // Save changes mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedChatbot?.id) throw new Error("No chatbot selected");

      const designConfig = {
        styleMode,
        selectedAvatar,
        customAvatarUrl,
        themeColor,
        chatBgColor,
        fontFamily,
        positionWeb,
        positionMobile,
        windowSize,
        customWidth,
        customHeight,
        enableResize,
        botTitle,
        botStatusText,
        welcomeMessage,
        followUpQuestion,
        inputPlaceholder,
        platformTab,
      };

      // Persist in localStorage for instant access
      localStorage.setItem(`ambot_design_${selectedChatbot.id}`, JSON.stringify(designConfig));

      // Persist in backend flow definition if available
      const currentDoc: FlowDocument = flowQuery.data?.definition ?? {
        nodes: [
          {
            id: "start",
            type: "start",
            position: { x: 200, y: 100 },
            data: { label: "Start Conversation" },
          },
        ],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      };

      const updatedDoc: FlowDocument = {
        ...currentDoc,
        design: designConfig,
      };

      return chatbotApi.saveFlow(selectedChatbot.id, updatedDoc);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["flow", selectedChatbot?.id] });
      toast.success("Chatbot design settings saved successfully!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save design settings");
    },
  });

  const handleDiscard = () => {
    if (flowQuery.data?.definition?.design) {
      const d = flowQuery.data.definition.design;
      setStyleMode(d.styleMode || "modern");
      setSelectedAvatar(d.selectedAvatar || "ambot");
      setCustomAvatarUrl(d.customAvatarUrl || null);
      setThemeColor(d.themeColor || THEME_COLORS[0].value);
      setChatBgColor(d.chatBgColor || CHAT_BG_COLORS[0].value);
      setFontFamily(d.fontFamily || "Inter, system-ui, sans-serif");
      setPositionWeb(d.positionWeb || "right");
      setPositionMobile(d.positionMobile || "right");
      setWindowSize(d.windowSize || "M");
      setBotTitle(d.botTitle || selectedChatbot?.name || "Ambot365");
      setBotStatusText(d.botStatusText || "Usual reply time: 2 to 3 Minutes");
      setWelcomeMessage(d.welcomeMessage || welcomeMessage);
      setFollowUpQuestion(d.followUpQuestion || followUpQuestion);
      setInputPlaceholder(d.inputPlaceholder || "Type your answer...");
      setSimMessages([
        { role: "bot", text: d.welcomeMessage || welcomeMessage },
        { role: "bot", text: d.followUpQuestion || followUpQuestion },
      ]);
    }
    toast.success("Changes discarded");
  };

  // Helper to render avatar icon
  const renderAvatarContent = (size: "sm" | "md" | "lg" = "md") => {
    if (selectedAvatar === "custom" && customAvatarUrl) {
      return <img src={customAvatarUrl} alt="Bot Avatar" />;
    }
    const found = AVATARS.find((a) => a.id === selectedAvatar);
    if (!found || found.id === "ambot") {
      return "A";
    }
    return found.icon;
  };

  return (
    <div className="chatbot-design-container">
      <header className="design-header">
        <div>
          <h1>Chatbot Design</h1>
          <p>Manage the look, layout, colors, and content of your chatbot.</p>
        </div>

        <div className="design-platform-tabs">
          <button
            type="button"
            className={`platform-tab ${platformTab === "website" ? "is-active" : ""}`}
            onClick={() => setPlatformTab("website")}
          >
            Website Chatbot
          </button>
          <button
            type="button"
            className={`platform-tab ${platformTab === "landing" ? "is-active" : ""}`}
            onClick={() => setPlatformTab("landing")}
          >
            Landing Page Bot
          </button>
        </div>
      </header>

      {readOnly && <ReadOnlyBanner role={me?.role} />}

      <div className="design-split-layout">
        {/* ── Left Controls Column ─────────────────────────────────────────── */}
        <div className="design-controls-panel">
          <div className="design-inner-nav">
            <button
              type="button"
              className={`inner-nav-btn ${innerTab === "content" ? "is-active" : ""}`}
              onClick={() => setInnerTab("content")}
            >
              Content
            </button>
            <button
              type="button"
              className={`inner-nav-btn ${innerTab === "theme" ? "is-active" : ""}`}
              onClick={() => setInnerTab("theme")}
            >
              Theme
            </button>
            <button
              type="button"
              className={`inner-nav-btn ${innerTab === "layout" ? "is-active" : ""}`}
              onClick={() => setInnerTab("layout")}
            >
              Layout
            </button>
          </div>

          <div className="design-controls-body">
            {/* ── THEME TAB ────────────────────────────────────────── */}
            {innerTab === "theme" && (
              <div className="theme-options-stack">
                <div className="control-group">
                  <label className="control-label">
                    Select Your Chat Window Style * <Info size={13} />
                  </label>
                  <div className="window-style-cards">
                    <div
                      role="button"
                      tabIndex={0}
                      className={`style-card ${styleMode === "classic" ? "is-selected" : ""}`}
                      onClick={() => setStyleMode("classic")}
                    >
                      <span className="badge-deprecated">Deprecated</span>
                      <div className="style-card-mockup classic-mockup">
                        <div className="mock-bar" style={{ background: themeColor }} />
                        <div className="mock-bubble" />
                      </div>
                      <span className="style-card-title">Classic (Old)</span>
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      className={`style-card ${styleMode === "modern" ? "is-selected" : ""}`}
                      onClick={() => setStyleMode("modern")}
                    >
                      <span className="badge-new">NEW</span>
                      <div className="style-card-mockup modern-mockup">
                        <div className="mock-header" style={{ background: themeColor }} />
                        <div className="mock-bubble primary" style={{ background: themeColor }} />
                      </div>
                      <span className="style-card-title">Modern (NEW)</span>
                    </div>
                  </div>
                </div>

                <div className="control-group">
                  <label className="control-label">
                    Bot Icon * <Info size={13} />
                  </label>
                  <div className="bot-icon-picker-row">
                    <label
                      className="btn-upload-icon"
                      title="Upload custom icon"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={16} />
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={handleAvatarFileUpload}
                      />
                    </label>

                    {AVATARS.map((av) => (
                      <button
                        key={av.id}
                        type="button"
                        className={`avatar-circle-btn ${selectedAvatar === av.id ? "is-selected" : ""}`}
                        onClick={() => setSelectedAvatar(av.id)}
                        title={av.label}
                      >
                        {av.id === "ambot" ? (
                          <div className="ambot-avatar-icon">
                            <span className="green-bg" style={{ backgroundColor: themeColor }}>
                              A
                            </span>
                            {selectedAvatar === "ambot" && (
                              <span className="check-badge">
                                <Check size={10} />
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="emoji-avatar">{av.icon}</span>
                        )}
                      </button>
                    ))}

                    {customAvatarUrl && (
                      <button
                        type="button"
                        className={`avatar-circle-btn ${selectedAvatar === "custom" ? "is-selected" : ""}`}
                        onClick={() => setSelectedAvatar("custom")}
                        title="Custom Uploaded Avatar"
                      >
                        <img
                          src={customAvatarUrl}
                          alt="Custom"
                          style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }}
                        />
                      </button>
                    )}
                  </div>
                </div>

                <div className="control-group">
                  <label className="control-label">
                    Theme Color * <Info size={13} />
                  </label>
                  <div className="color-palette-grid">
                    {THEME_COLORS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`color-swatch-circle ${themeColor === c.value ? "is-active" : ""}`}
                        style={{ background: c.bg }}
                        onClick={() => setThemeColor(c.value)}
                        title={c.id}
                      >
                        {themeColor === c.value && <Check size={14} color="#fff" />}
                      </button>
                    ))}

                    {/* Custom Color Rainbow Picker */}
                    <label
                      className="color-swatch-circle is-rainbow"
                      style={{
                        background:
                          "linear-gradient(135deg, red, orange, yellow, green, blue, indigo, violet)",
                        position: "relative",
                        cursor: "pointer",
                      }}
                      title="Custom color picker"
                    >
                      <input
                        ref={customColorInputRef}
                        type="color"
                        value={themeColor}
                        onChange={(e) => setThemeColor(e.target.value)}
                        style={{
                          opacity: 0,
                          position: "absolute",
                          width: "100%",
                          height: "100%",
                          cursor: "pointer",
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="control-group">
                  <label className="control-label">
                    Chat Background Color * <Info size={13} />
                  </label>
                  <div className="color-palette-grid">
                    {CHAT_BG_COLORS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`color-swatch-circle ${chatBgColor === c.value ? "is-active" : ""}`}
                        style={{
                          background: c.bg,
                          border: c.border ? `1px solid ${c.border}` : undefined,
                        }}
                        onClick={() => setChatBgColor(c.value)}
                        title={c.id}
                      >
                        {chatBgColor === c.value && (
                          <Check
                            size={14}
                            color={c.id === "light-green" || c.id === "white" ? themeColor : "#fff"}
                          />
                        )}
                      </button>
                    ))}

                    {/* Custom Background Color Picker */}
                    <label
                      className="color-swatch-circle is-rainbow"
                      style={{
                        background:
                          "linear-gradient(135deg, red, orange, yellow, green, blue, indigo, violet)",
                        position: "relative",
                        cursor: "pointer",
                      }}
                      title="Custom background color picker"
                    >
                      <input
                        ref={customBgColorInputRef}
                        type="color"
                        value={chatBgColor}
                        onChange={(e) => setChatBgColor(e.target.value)}
                        style={{
                          opacity: 0,
                          position: "absolute",
                          width: "100%",
                          height: "100%",
                          cursor: "pointer",
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="control-group">
                  <label className="control-label">
                    Select Font * <Info size={13} />
                  </label>
                  <div className="font-selector-row">
                    <select
                      className="font-dropdown"
                      value={fontFamily}
                      onChange={(e) => setFontFamily(e.target.value)}
                    >
                      <option value="Inter, system-ui, sans-serif">Inter (Default)</option>
                      <option value="'Plus Jakarta Sans', sans-serif">Plus Jakarta Sans</option>
                      <option value="'Roboto', sans-serif">Roboto</option>
                      <option value="'Outfit', sans-serif">Outfit</option>
                      <option value="'Poppins', sans-serif">Poppins</option>
                      <option value="'Open Sans', sans-serif">Open Sans</option>
                      <option value="'Courier New', monospace">Courier (Code)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ── LAYOUT TAB ───────────────────────────────────────── */}
            {innerTab === "layout" && (
              <div className="layout-options-stack">
                <div className="control-group">
                  <label className="control-label">Position on web *</label>
                  <div className="position-cards-row">
                    <button
                      type="button"
                      className={`position-card ${positionWeb === "left" ? "is-selected" : ""}`}
                      onClick={() => setPositionWeb("left")}
                    >
                      <div className="pos-card-mockup pos-left" />
                      <span>Left</span>
                    </button>
                    <button
                      type="button"
                      className={`position-card ${positionWeb === "center" ? "is-selected" : ""}`}
                      onClick={() => setPositionWeb("center")}
                    >
                      <div className="pos-card-mockup pos-center" />
                      <span>Center</span>
                    </button>
                    <button
                      type="button"
                      className={`position-card ${positionWeb === "right" ? "is-selected" : ""}`}
                      onClick={() => setPositionWeb("right")}
                    >
                      <div className="pos-card-mockup pos-right" />
                      <span>Right</span>
                    </button>
                  </div>
                </div>

                <div className="control-group">
                  <label className="control-label">Position on mobile *</label>
                  <div className="position-cards-row">
                    <button
                      type="button"
                      className={`position-card is-mobile ${positionMobile === "left" ? "is-selected" : ""}`}
                      onClick={() => setPositionMobile("left")}
                    >
                      <div className="pos-mobile-mockup pos-left" />
                      <span>Left</span>
                    </button>
                    <button
                      type="button"
                      className={`position-card is-mobile ${positionMobile === "center" ? "is-selected" : ""}`}
                      onClick={() => setPositionMobile("center")}
                    >
                      <div className="pos-mobile-mockup pos-center" />
                      <span>Center</span>
                    </button>
                    <button
                      type="button"
                      className={`position-card is-mobile ${positionMobile === "right" ? "is-selected" : ""}`}
                      onClick={() => setPositionMobile("right")}
                    >
                      <div className="pos-mobile-mockup pos-right" />
                      <span>Right</span>
                    </button>
                  </div>
                </div>

                <div className="control-group">
                  <label className="control-label">
                    Window size * <Info size={13} />
                  </label>
                  <div className="size-selector-pills">
                    {(["S", "M", "L", "XL", "XXL", "Custom"] as const).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        className={`size-pill-btn ${windowSize === sz ? "is-selected" : ""}`}
                        onClick={() => setWindowSize(sz)}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>

                  {windowSize === "Custom" && (
                    <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 11, color: "#64748b" }}>Width (px)</label>
                        <input
                          type="number"
                          className="design-text-input"
                          value={customWidth}
                          onChange={(e) => setCustomWidth(Number(e.target.value))}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 11, color: "#64748b" }}>Height (px)</label>
                        <input
                          type="number"
                          className="design-text-input"
                          value={customHeight}
                          onChange={(e) => setCustomHeight(Number(e.target.value))}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="control-group row-toggle">
                  <label className="control-label">
                    Enable Chat Window Resize <Info size={13} />
                  </label>
                  <label className="switch-toggle">
                    <input
                      type="checkbox"
                      checked={enableResize}
                      onChange={(e) => setEnableResize(e.target.checked)}
                    />
                    <span className="slider round" />
                  </label>
                </div>
              </div>
            )}

            {/* ── CONTENT TAB ──────────────────────────────────────── */}
            {innerTab === "content" && (
              <div className="content-options-stack">
                <div className="control-group">
                  <label className="control-label">Bot Name</label>
                  <input
                    type="text"
                    className="design-text-input"
                    value={botTitle}
                    onChange={(e) => setBotTitle(e.target.value)}
                    placeholder="e.g. Ambot365"
                  />
                </div>

                <div className="control-group">
                  <label className="control-label">Sub-header Status</label>
                  <input
                    type="text"
                    className="design-text-input"
                    value={botStatusText}
                    onChange={(e) => setBotStatusText(e.target.value)}
                    placeholder="e.g. Usual reply time: 2 to 3 Minutes"
                  />
                </div>

                <div className="control-group">
                  <label className="control-label">Welcome Message</label>
                  <textarea
                    className="design-textarea"
                    rows={6}
                    value={welcomeMessage}
                    onChange={(e) => handleWelcomeChange(e.target.value)}
                    placeholder="First greeting message..."
                  />
                </div>

                <div className="control-group">
                  <label className="control-label">First Prompt Question</label>
                  <input
                    type="text"
                    className="design-text-input"
                    value={followUpQuestion}
                    onChange={(e) => handleQuestionChange(e.target.value)}
                    placeholder="e.g. May I have your name please? 🙏"
                  />
                </div>

                <div className="control-group">
                  <label className="control-label">Input Placeholder</label>
                  <input
                    type="text"
                    className="design-text-input"
                    value={inputPlaceholder}
                    onChange={(e) => setInputPlaceholder(e.target.value)}
                    placeholder="e.g. Type your answer..."
                  />
                </div>
              </div>
            )}
          </div>

          <div className="design-controls-footer">
            <button type="button" className="btn-discard" onClick={handleDiscard} disabled={readOnly}>
              Discard
            </button>
            <button
              type="button"
              className="btn-save-changes"
              onClick={() => saveMutation.mutate()}
              disabled={readOnly || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        {/* ── Right Live Interactive Preview Column ────────────────────────── */}
        <div className="design-preview-panel">
          <div className="browser-mockup-frame">
            <div className="browser-top-bar">
              <div className="browser-dots">
                <span className="dot dot-red" />
                <span className="dot dot-yellow" />
                <span className="dot dot-green" />
              </div>

              <div className="browser-window-title">
                {platformTab === "website" ? "Website Chatbot Preview" : "Landing Page Bot Preview"}
              </div>

              <div className="browser-bar-actions">
                <button
                  type="button"
                  className="btn-reset-preview"
                  onClick={handleResetPreview}
                  title="Reset conversation test"
                >
                  <RotateCcw size={12} />
                  <span>Reset Chat</span>
                </button>
              </div>
            </div>

            <div
              className={`browser-viewport ${
                platformTab === "landing" ? "is-landing-bg" : "is-website-bg"
              }`}
              style={{ fontFamily }}
            >
              {platformTab === "website" ? (
                // Website wireframe background with floating widget
                <div className="website-wireframe-layout">
                  <div className="wireframe-content-lines">
                    <div className="wire-hero-box" />
                    <div className="wire-line line-70" />
                    <div className="wire-line line-90" />
                    <div className="wire-line line-60" />
                    <div className="wire-line line-80" />
                    <div className="wire-line line-40" />
                  </div>

                  {/* Floating Widget Window */}
                  {!isMinimized ? (
                    <div
                      className={`floating-widget-window pos-${positionWeb} size-${windowSize} style-${styleMode}`}
                      style={{
                        backgroundColor: chatBgColor,
                        fontFamily,
                        ...(windowSize === "Custom"
                          ? { width: customWidth, height: customHeight }
                          : {}),
                      }}
                    >
                      <div
                        className="widget-header-banner"
                        style={{
                          backgroundColor: styleMode === "modern" ? themeColor : "#ffffff",
                        }}
                      >
                        <div className="widget-header-left">
                          <div
                            className="widget-avatar-badge"
                            style={{
                              backgroundColor: styleMode === "modern" ? "rgba(255,255,255,0.22)" : themeColor,
                            }}
                          >
                            {renderAvatarContent("sm")}
                          </div>
                          <div className="widget-title-block">
                            <strong>{botTitle}</strong>
                            <span>
                              <span className="status-green-dot" /> {botStatusText}
                            </span>
                          </div>
                        </div>

                        <div className="widget-header-actions">
                          <button type="button" onClick={() => setIsMinimized(true)} title="Minimize">
                            <Minus size={16} />
                          </button>
                          <button type="button" onClick={() => setIsMinimized(true)} title="Close">
                            <X size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="widget-messages-stream">
                        {simMessages.map((m, idx) => (
                          <div
                            key={idx}
                            className={`widget-bubble-wrap ${
                              m.role === "user" ? "is-user" : "is-bot"
                            }`}
                          >
                            {m.role === "bot" && (
                              <div
                                className="bot-avatar-circle"
                                style={{ backgroundColor: themeColor }}
                              >
                                {renderAvatarContent("sm")}
                              </div>
                            )}
                            <div
                              className="widget-bubble"
                              style={
                                m.role === "user"
                                  ? { backgroundColor: themeColor, color: "#ffffff" }
                                  : { backgroundColor: "#ffffff", color: "#1e293b" }
                              }
                            >
                              {m.text}
                            </div>
                          </div>
                        ))}

                        {isBotTyping && (
                          <div className="widget-bubble-wrap is-bot">
                            <div
                              className="bot-avatar-circle"
                              style={{ backgroundColor: themeColor }}
                            >
                              {renderAvatarContent("sm")}
                            </div>
                            <div className="widget-bubble typing-indicator" style={{ background: "#ffffff" }}>
                              <span className="typing-dot" />
                              <span className="typing-dot" />
                              <span className="typing-dot" />
                            </div>
                          </div>
                        )}
                        <div ref={messagesEndRef} />
                      </div>

                      <form className="widget-input-footer" onSubmit={handleSendSim}>
                        <input
                          type="text"
                          placeholder={inputPlaceholder}
                          value={testInput}
                          onChange={(e) => setTestInput(e.target.value)}
                        />
                        <button type="button" className="icon-emoji-btn" title="Emoji">
                          <Smile size={18} />
                        </button>
                        <button
                          type="submit"
                          className="widget-send-btn"
                          style={{ backgroundColor: themeColor }}
                          title="Send message"
                        >
                          <Send size={15} />
                        </button>
                      </form>
                    </div>
                  ) : (
                    // Floating launcher bubble when minimized
                    <div
                      className={`preview-launcher-bubble pos-${positionWeb}`}
                      style={{ backgroundColor: themeColor }}
                      onClick={() => setIsMinimized(false)}
                      title="Open Chat"
                    >
                      {selectedAvatar === "custom" && customAvatarUrl ? (
                        <img src={customAvatarUrl} alt="Bot" />
                      ) : (
                        <MessageSquare size={26} />
                      )}
                    </div>
                  )}
                </div>
              ) : (
                // Landing Page Bot: Full-screen centered card
                <div className="landing-bot-wrapper">
                  <div
                    className={`landing-chat-card style-${styleMode}`}
                    style={{ backgroundColor: chatBgColor, fontFamily }}
                  >
                    <div className="landing-chat-header" style={{ backgroundColor: themeColor }}>
                      <div className="widget-header-left">
                        <div className="widget-avatar-badge" style={{ background: "rgba(255,255,255,0.22)" }}>
                          {renderAvatarContent("md")}
                        </div>
                        <div className="widget-title-block">
                          <strong>{botTitle}</strong>
                          <span>
                            <span className="status-green-dot" /> {botStatusText}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="landing-chat-stream">
                      {simMessages.map((m, idx) => (
                        <div
                          key={idx}
                          className={`landing-msg-row ${
                            m.role === "user" ? "is-user" : "is-bot"
                          }`}
                        >
                          {m.role === "bot" && (
                            <div
                              className="bot-avatar-circle"
                              style={{ backgroundColor: themeColor }}
                            >
                              {renderAvatarContent("sm")}
                            </div>
                          )}
                          <div
                            className="landing-bubble"
                            style={
                              m.role === "user"
                                ? { backgroundColor: themeColor, color: "#ffffff" }
                                : { backgroundColor: "#ffffff", color: "#1e293b" }
                            }
                          >
                            {m.text}
                          </div>
                        </div>
                      ))}

                      {isBotTyping && (
                        <div className="landing-msg-row is-bot">
                          <div
                            className="bot-avatar-circle"
                            style={{ backgroundColor: themeColor }}
                          >
                            {renderAvatarContent("sm")}
                          </div>
                          <div className="landing-bubble typing-indicator" style={{ background: "#ffffff" }}>
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    <form className="landing-input-footer" onSubmit={handleSendSim}>
                      <input
                        type="text"
                        placeholder={inputPlaceholder}
                        value={testInput}
                        onChange={(e) => setTestInput(e.target.value)}
                      />
                      <button type="button" className="icon-emoji-btn">
                        <Smile size={18} />
                      </button>
                      <button
                        type="submit"
                        className="landing-send-btn"
                        style={{ backgroundColor: themeColor }}
                      >
                        <Send size={15} />
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChatbotDesignPage() {
  return (
    <AmbotShell>
      {({ selectedChatbot }) => <ChatbotDesignPageInner selectedChatbot={selectedChatbot} />}
    </AmbotShell>
  );
}
