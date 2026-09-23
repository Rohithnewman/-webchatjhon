import type { FlowDocument, FlowNode } from "../../entities/chatbot/types";

export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  nodeTypes: string[];
  build: () => FlowDocument;
}

type N = FlowNode["type"];
const node = (id: string, type: N, y: number, data: Record<string, unknown>, x = 250): FlowNode =>
  ({ id, type, position: { x, y }, data }) as FlowNode;
const edge = (source: string, target: string, label?: string) =>
  ({ id: `${source}-${target}${label ? `-${label}` : ""}`, source, target, ...(label ? { label } : {}) });

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: "lead-capture",
    name: "Lead capture",
    description: "Greets the visitor, collects name and a validated email, branches on interest, and closes politely.",
    nodeTypes: ["message", "question", "input", "choice", "condition", "webhook", "end"],
    build: () => ({
      nodes: [
        node("start", "start", 0, { label: "Start" }),
        node("welcome", "message", 110, { label: "Welcome", message: "Hi! 👋 I can help you get in touch with our team." }),
        node("name", "question", 220, { label: "Ask name", prompt: "What's your name?", variable: "name" }),
        node("email", "input", 330, { label: "Ask email", prompt: "Thanks {{name}}! What's your email address?", variable: "email", inputType: "email" }),
        node("interest", "choice", 440, { label: "Interest", prompt: "What are you interested in?", options: "Pricing\nA demo\nSupport", variable: "interest" }),
        node("is-demo", "condition", 550, { label: "Wants a demo?", variable: "interest", operator: "equals", value: "A demo" }),
        node("demo-msg", "message", 660, { label: "Demo", message: "Great, {{name}} — someone will email {{email}} to book a demo within one business day." }, 80),
        node("other-msg", "message", 660, { label: "Other", message: "Got it. We'll send details about {{interest}} to {{email}}." }, 420),
        node("notify", "webhook", 770, { label: "Notify CRM", url: "https://example.com/hooks/lead", event: "lead.captured" }),
        node("end", "end", 880, { label: "End", message: "Thanks for stopping by!" }),
      ],
      edges: [
        edge("start", "welcome"), edge("welcome", "name"), edge("name", "email"), edge("email", "interest"),
        edge("interest", "is-demo"), edge("is-demo", "demo-msg", "true"), edge("is-demo", "other-msg", "false"),
        edge("demo-msg", "notify"), edge("other-msg", "notify"), edge("notify", "end"),
      ],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    }),
  },
  {
    id: "faq-knowledge",
    name: "FAQ with knowledge base",
    description: "Answers questions from an uploaded knowledge base; optionally lets an AI model phrase the answer.",
    nodeTypes: ["message", "question", "knowledge_search", "llm", "end"],
    build: () => ({
      nodes: [
        node("start", "start", 0, { label: "Start" }),
        node("welcome", "message", 110, { label: "Welcome", message: "Ask me anything about our products, shipping or returns." }),
        node("ask", "question", 220, { label: "Ask", prompt: "What would you like to know?", variable: "question" }),
        node("search", "knowledge_search", 330, { label: "Search docs", knowledgeBaseId: "", query: "{{question}}", topK: 3, variable: "knowledge" }),
        node("answer", "message", 440, { label: "Answer", message: "Here is what I found:\n\n{{knowledge}}" }),
        node("ai", "llm", 550, { label: "AI summary (optional)", prompt: "Using only these notes, answer the visitor's question in two sentences:\n{{knowledge}}", provider: "ollama", model: "", temperature: 0.3 }),
        node("end", "end", 660, { label: "End", message: "Hope that helps! Reload to ask another question." }),
      ],
      edges: [edge("start", "welcome"), edge("welcome", "ask"), edge("ask", "search"), edge("search", "answer"), edge("answer", "ai"), edge("ai", "end")],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    }),
  },
  {
    id: "support-handoff",
    name: "Support with live-agent handoff",
    description: "Triages the issue, tries a quick fix, and hands the visitor to a human in the Inbox.",
    nodeTypes: ["message", "choice", "condition", "http_request", "delay", "handoff", "end"],
    build: () => ({
      nodes: [
        node("start", "start", 0, { label: "Start" }),
        node("welcome", "message", 110, { label: "Welcome", message: "Welcome to support. Let's sort this out." }),
        node("issue", "choice", 220, { label: "Issue type", prompt: "What do you need help with?", options: "Billing\nTechnical problem\nSomething else", variable: "issue" }),
        node("is-tech", "condition", 330, { label: "Technical?", variable: "issue", operator: "equals", value: "Technical problem" }),
        node("status", "http_request", 440, { label: "Check status page", url: "https://httpbin.org/get?service=api", method: "GET", variable: "status" }, 80),
        node("wait", "delay", 550, { label: "Thinking…", seconds: 1 }, 80),
        node("tip", "message", 660, { label: "Quick tip", message: "Our systems look healthy. Try signing out and back in — if that doesn't help, an agent will take over now." }, 80),
        node("handoff", "handoff", 770, { label: "Handoff", queue: "Support", message: "Connecting you to a human agent. Please hold on…" }),
        node("end", "end", 880, { label: "End", message: "Thanks for contacting support." }),
      ],
      edges: [
        edge("start", "welcome"), edge("welcome", "issue"), edge("issue", "is-tech"),
        edge("is-tech", "status", "true"), edge("is-tech", "handoff", "false"),
        edge("status", "wait"), edge("wait", "tip"), edge("tip", "handoff"), edge("handoff", "end"),
      ],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    }),
  },
  {
    id: "sell-products",
    name: "Sell my products",
    description: "Engages customers, showcases products, and captures an email to follow up.",
    nodeTypes: ["message", "choice", "condition", "input", "end"],
    build: () => ({
      nodes: [
        node("start", "start", 0, { label: "Start" }),
        node("welcome", "message", 110, { label: "Welcome", message: "Hi there! 👋 Looking for something specific today?" }),
        node("category", "choice", 220, { label: "Category", prompt: "What are you shopping for?", options: "New arrivals\nBest sellers\nDeals", variable: "category" }),
        node("is-deals", "condition", 330, { label: "Deals?", variable: "category", operator: "equals", value: "Deals" }),
        node("deals-msg", "message", 440, { label: "Deals", message: "Our current deals save up to 30% — this week only." }, 80),
        node("catalogue-msg", "message", 440, { label: "Catalogue", message: "Great choice — {{category}} are our most popular picks right now." }, 420),
        node("email", "input", 550, { label: "Ask email", prompt: "Share your email and we'll send you a personalised product list.", variable: "email", inputType: "email" }),
        node("end", "end", 660, { label: "End", message: "Thanks! Check your inbox shortly." }),
      ],
      edges: [
        edge("start", "welcome"), edge("welcome", "category"), edge("category", "is-deals"),
        edge("is-deals", "deals-msg", "true"), edge("is-deals", "catalogue-msg", "false"),
        edge("deals-msg", "email"), edge("catalogue-msg", "email"), edge("email", "end"),
      ],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    }),
  },
  {
    id: "appointment-booking",
    name: "Appointment booking",
    description: "Collects a name, service, preferred time and email, then confirms the request.",
    nodeTypes: ["message", "question", "choice", "input", "end"],
    build: () => ({
      nodes: [
        node("start", "start", 0, { label: "Start" }),
        node("welcome", "message", 110, { label: "Welcome", message: "Hello! 📅 Let's book your appointment." }),
        node("name", "question", 220, { label: "Ask name", prompt: "What's your name?", variable: "name" }),
        node("service", "choice", 330, { label: "Service", prompt: "Which service do you need?", options: "Consultation\nFollow-up\nOther", variable: "service" }),
        node("when", "question", 440, { label: "Preferred time", prompt: "When would suit you? (day and time)", variable: "preferred_time" }),
        node("email", "input", 550, { label: "Ask email", prompt: "And your email, so we can confirm?", variable: "email", inputType: "email" }),
        node("confirm", "message", 660, { label: "Confirm", message: "Thanks {{name}}! We'll confirm your {{service}} for {{preferred_time}} at {{email}}." }),
        node("end", "end", 770, { label: "End", message: "See you soon!" }),
      ],
      edges: [
        edge("start", "welcome"), edge("welcome", "name"), edge("name", "service"), edge("service", "when"),
        edge("when", "email"), edge("email", "confirm"), edge("confirm", "end"),
      ],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    }),
  },
  {
    id: "generic",
    name: "Generic welcome",
    description: "A welcome message and one open question — the smallest flow to build on.",
    nodeTypes: ["message", "question", "end"],
    build: () => ({
      nodes: [
        node("start", "start", 0, { label: "Start" }),
        node("welcome", "message", 110, { label: "Welcome", message: "Hi there! 👋 Welcome to our chatbot — we're glad to have you here! 😊✨" }),
        node("ask", "question", 220, { label: "Ask", prompt: "How can we help you today? 😊💬", variable: "request" }),
        node("end", "end", 330, { label: "End", message: "Thanks — we'll get back to you shortly." }),
      ],
      edges: [edge("start", "welcome"), edge("welcome", "ask"), edge("ask", "end")],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    }),
  },
];
