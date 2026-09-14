"""The three demo flows, mirrored from frontend/src/features/flow-templates/templates.ts.
Keep both in sync when changing either, with two deliberate differences:

(a) `faq_knowledge()` omits the template's optional `llm` "AI summary" node
    (the template's `search -> answer -> ai -> end`, here `search -> answer
    -> end`) so the seeded bot answers from the knowledge base even when no
    model provider is reachable — the seeded demo must work with no model
    configured.
(b) the seed adds `design` blocks (widget appearance: theme color, bot
    title/status text, window size, position) that the templates do not
    carry.
"""


def _node(id_, type_, y, data, x=250):
    return {"id": id_, "type": type_, "position": {"x": x, "y": y}, "data": data}


def _edge(source, target, label=None):
    edge = {"id": f"{source}-{target}" + (f"-{label}" if label else ""), "source": source, "target": target}
    if label:
        edge["label"] = label
    return edge


def lead_capture() -> dict:
    return {
        "nodes": [
            _node("start", "start", 0, {"label": "Start"}),
            _node("welcome", "message", 110, {"label": "Welcome", "message": "Hi! 👋 I can help you get in touch with our team."}),
            _node("name", "question", 220, {"label": "Ask name", "prompt": "What's your name?", "variable": "name"}),
            _node("email", "input", 330, {"label": "Ask email", "prompt": "Thanks {{name}}! What's your email address?", "variable": "email", "inputType": "email"}),
            _node("interest", "choice", 440, {"label": "Interest", "prompt": "What are you interested in?", "options": "Pricing\nA demo\nSupport", "variable": "interest"}),
            _node("is-demo", "condition", 550, {"label": "Wants a demo?", "variable": "interest", "operator": "equals", "value": "A demo"}),
            _node("demo-msg", "message", 660, {"label": "Demo", "message": "Great, {{name}} — someone will email {{email}} to book a demo within one business day."}, 80),
            _node("other-msg", "message", 660, {"label": "Other", "message": "Got it. We'll send details about {{interest}} to {{email}}."}, 420),
            _node("notify", "webhook", 770, {"label": "Notify CRM", "url": "https://example.com/hooks/lead", "event": "lead.captured"}),
            _node("end", "end", 880, {"label": "End", "message": "Thanks for stopping by!"}),
        ],
        "edges": [
            _edge("start", "welcome"), _edge("welcome", "name"), _edge("name", "email"), _edge("email", "interest"),
            _edge("interest", "is-demo"), _edge("is-demo", "demo-msg", "true"), _edge("is-demo", "other-msg", "false"),
            _edge("demo-msg", "notify"), _edge("other-msg", "notify"), _edge("notify", "end"),
        ],
        "viewport": {"x": 0, "y": 0, "zoom": 0.9},
    }


def faq_knowledge(knowledge_base_id: str) -> dict:
    return {
        "nodes": [
            _node("start", "start", 0, {"label": "Start"}),
            _node("welcome", "message", 110, {"label": "Welcome", "message": "Ask me anything about our products, shipping or returns."}),
            _node("ask", "question", 220, {"label": "Ask", "prompt": "What would you like to know?", "variable": "question"}),
            _node("search", "knowledge_search", 330, {"label": "Search docs", "knowledgeBaseId": knowledge_base_id, "query": "{{question}}", "topK": 3, "variable": "knowledge"}),
            _node("answer", "message", 440, {"label": "Answer", "message": "Here is what I found:\n\n{{knowledge}}"}),
            _node("end", "end", 550, {"label": "End", "message": "Hope that helps! Reload to ask another question."}),
        ],
        "edges": [_edge("start", "welcome"), _edge("welcome", "ask"), _edge("ask", "search"), _edge("search", "answer"), _edge("answer", "end")],
        "viewport": {"x": 0, "y": 0, "zoom": 0.9},
        "design": {"themeColor": "#3182ce", "botTitle": "Northwind Help", "botStatusText": "Answers from our docs", "windowSize": "L"},
    }


def support_handoff() -> dict:
    return {
        "nodes": [
            _node("start", "start", 0, {"label": "Start"}),
            _node("welcome", "message", 110, {"label": "Welcome", "message": "Welcome to support. Let's sort this out."}),
            _node("issue", "choice", 220, {"label": "Issue type", "prompt": "What do you need help with?", "options": "Billing\nTechnical problem\nSomething else", "variable": "issue"}),
            _node("is-tech", "condition", 330, {"label": "Technical?", "variable": "issue", "operator": "equals", "value": "Technical problem"}),
            _node("status", "http_request", 440, {"label": "Check status page", "url": "https://httpbin.org/get?service=api", "method": "GET", "variable": "status"}, 80),
            _node("wait", "delay", 550, {"label": "Thinking…", "seconds": 1}, 80),
            _node("tip", "message", 660, {"label": "Quick tip", "message": "Our systems look healthy. Try signing out and back in — if that doesn't help, an agent will take over now."}, 80),
            _node("handoff", "handoff", 770, {"label": "Handoff", "queue": "Support", "message": "Connecting you to a human agent. Please hold on…"}),
            _node("end", "end", 880, {"label": "End", "message": "Thanks for contacting support."}),
        ],
        "edges": [
            _edge("start", "welcome"), _edge("welcome", "issue"), _edge("issue", "is-tech"),
            _edge("is-tech", "status", "true"), _edge("is-tech", "handoff", "false"),
            _edge("status", "wait"), _edge("wait", "tip"), _edge("tip", "handoff"), _edge("handoff", "end"),
        ],
        "viewport": {"x": 0, "y": 0, "zoom": 0.9},
        "design": {"themeColor": "#ff8a00", "botTitle": "Northwind Support", "botStatusText": "Usually replies in minutes", "positionWeb": "left"},
    }


DEMO_DOCUMENT = """Northwind Outdoor — Customer FAQ

Shipping: Orders ship within 2 to 3 business days. Free shipping on orders over 75 dollars. International shipping is available to Canada and the EU.

Returns and refunds: You can return any unused item within 30 days for a full refund. Refunds are issued to the original payment method within 5 business days of receiving the return.

Warranty: Backpacks carry a lifetime warranty on zips and straps. Tents carry a 2 year warranty against manufacturing defects.

Tent care: Never store a tent wet. Air dry it fully, then store loosely in the mesh bag, not the compression sack.

Contact: Email help@northwind.example or use the chat on our website. Support hours are 9am to 6pm, Monday to Friday.
"""
