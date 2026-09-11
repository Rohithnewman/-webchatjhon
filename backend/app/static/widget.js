/* WebChatBots embeddable widget.
 *
 * Install with one tag:
 *   <script src="https://YOUR-API/widget.js"
 *           data-chatbot-id="CHATBOT_UUID"
 *           data-api="https://YOUR-API/api/v1" async></script>
 *
 * Dependency-free by design: this file runs on customer pages, so it may
 * assume nothing about their stack and must never leak globals beyond
 * window.WebChatBots.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;
  var CHATBOT_ID = script.getAttribute("data-chatbot-id");
  if (!CHATBOT_ID) return;
  var API = (script.getAttribute("data-api") || "").replace(/\/$/, "");
  if (!API) {
    API = script.src.replace(/\/widget\.js.*$/, "") + "/api/v1";
  }
  var ACCENT = script.getAttribute("data-accent") || "#4f46e5";

  var state = {
    open: false,
    conversationId: null,
    token: null,
    status: "active",
    lastOrdinal: 0,
    busy: false,
    pollTimer: null,
  };

  /* ---------- styles ---------- */
  var css =
    ".wcb-root{position:fixed;bottom:20px;right:20px;z-index:2147483000;font-family:system-ui,-apple-system,Segoe UI,sans-serif}" +
    ".wcb-bubble{width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;background:" + ACCENT + ";color:#fff;font-size:24px;box-shadow:0 8px 24px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center}" +
    ".wcb-panel{position:absolute;bottom:72px;right:0;width:340px;max-width:calc(100vw - 40px);height:480px;max-height:calc(100vh - 120px);background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.28);display:none;flex-direction:column;overflow:hidden}" +
    ".wcb-panel.wcb-open{display:flex}" +
    ".wcb-head{background:" + ACCENT + ";color:#fff;padding:12px 16px;font-size:14px;font-weight:600;display:flex;justify-content:space-between;align-items:center}" +
    ".wcb-head button{background:none;border:none;color:#fff;font-size:18px;cursor:pointer;line-height:1}" +
    ".wcb-log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#f7f7fb}" +
    ".wcb-msg{max-width:82%;padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}" +
    ".wcb-msg.bot,.wcb-msg.agent{background:#fff;border:1px solid #e6e6ef;color:#1c1c28;align-self:flex-start;border-bottom-left-radius:4px}" +
    ".wcb-msg.agent{border-color:" + ACCENT + "}" +
    ".wcb-msg.visitor{background:" + ACCENT + ";color:#fff;align-self:flex-end;border-bottom-right-radius:4px}" +
    ".wcb-msg.system{background:transparent;color:#8a8aa0;font-size:11px;align-self:center}" +
    ".wcb-form{display:flex;border-top:1px solid #e6e6ef;background:#fff}" +
    ".wcb-form input{flex:1;border:none;outline:none;padding:12px 14px;font-size:13px}" +
    ".wcb-form button{border:none;background:none;color:" + ACCENT + ";font-weight:600;font-size:13px;padding:0 16px;cursor:pointer}" +
    ".wcb-form button:disabled{opacity:.4;cursor:default}" +
    ".wcb-sub{font-size:11px;font-weight:400;opacity:.85;margin-top:2px}";
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  /* ---------- DOM ---------- */
  var root = document.createElement("div");
  root.className = "wcb-root";
  root.innerHTML =
    '<div class="wcb-panel" role="dialog" aria-label="Chat">' +
    '<div class="wcb-head"><div><div class="wcb-title">Chat</div><div class="wcb-sub"></div></div><button type="button" aria-label="Close">×</button></div>' +
    '<div class="wcb-log"></div>' +
    '<form class="wcb-form"><input type="text" placeholder="Type a message…" maxlength="4000" autocomplete="off"/><button type="submit">Send</button></form>' +
    "</div>" +
    '<button class="wcb-bubble" type="button" aria-label="Open chat">💬</button>';
  document.body.appendChild(root);

  var panel = root.querySelector(".wcb-panel");
  var log = root.querySelector(".wcb-log");
  var form = root.querySelector(".wcb-form");
  var input = form.querySelector("input");
  var sendButton = form.querySelector("button");
  var title = root.querySelector(".wcb-title");
  var subtitle = root.querySelector(".wcb-sub");
  var bubble = root.querySelector(".wcb-bubble");
  var head = root.querySelector(".wcb-head");
  var overrides = document.createElement("style");
  document.head.appendChild(overrides);

  var SIZES = { S: [320, 440], M: [360, 520], L: [400, 600], XL: [440, 660], XXL: [480, 720] };

  function applyDesign(d) {
    d = d || {};
    var accent = d.themeColor || ACCENT;
    head.style.background = accent;
    bubble.style.background = accent;
    sendButton.style.color = accent;
    overrides.textContent =
      ".wcb-msg.visitor{background:" + accent + "}.wcb-msg.agent{border-color:" + accent + "}";
    if (d.chatBgColor) log.style.background = d.chatBgColor;
    if (d.fontFamily) root.style.fontFamily = d.fontFamily;
    if (d.botTitle) title.textContent = d.botTitle;
    subtitle.textContent = d.botStatusText || "";
    if (d.inputPlaceholder) input.placeholder = d.inputPlaceholder;
    if (d.positionWeb === "left") {
      root.style.right = "auto";
      root.style.left = "20px";
      panel.style.right = "auto";
      panel.style.left = "0";
    }
    var size = d.windowSize === "Custom" ? [d.customWidth || 360, d.customHeight || 520] : SIZES[d.windowSize];
    if (size) {
      panel.style.width = size[0] + "px";
      panel.style.height = size[1] + "px";
    }
  }

  function loadProfile() {
    request("GET", "/widget/chatbots/" + CHATBOT_ID, null, function (status, payload) {
      if (status === 200 && payload && payload.success) {
        if (payload.data.name) title.textContent = payload.data.name;
        applyDesign(payload.data.design);
      }
    });
  }

  function render(role, content) {
    var el = document.createElement("div");
    el.className = "wcb-msg " + role;
    el.textContent = content;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }

  function take(messages) {
    (messages || []).forEach(function (m) {
      if (m.ordinal > state.lastOrdinal) state.lastOrdinal = m.ordinal;
      render(m.role, m.content);
    });
  }

  function request(method, path, body, done) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, API + path);
    xhr.setRequestHeader("Content-Type", "application/json");
    if (state.token) xhr.setRequestHeader("Authorization", "Bearer " + state.token);
    xhr.onload = function () {
      var payload = null;
      try { payload = JSON.parse(xhr.responseText); } catch (e) { /* noop */ }
      done(xhr.status, payload);
    };
    xhr.onerror = function () { done(0, null); };
    xhr.send(body ? JSON.stringify(body) : null);
  }

  function setStatus(status) {
    state.status = status;
    if (status === "handoff") startPolling();
    else stopPolling();
    if (status === "closed") {
      input.disabled = true;
      sendButton.disabled = true;
      input.placeholder = "Conversation ended";
    }
  }

  function startPolling() {
    if (state.pollTimer) return;
    state.pollTimer = setInterval(function () {
      if (!state.conversationId) return;
      request(
        "GET",
        "/widget/conversations/" + state.conversationId + "/messages?after=" + state.lastOrdinal,
        null,
        function (status, payload) {
          if (status === 200 && payload && payload.success) {
            take(payload.data.messages);
            if (payload.data.status !== state.status) setStatus(payload.data.status);
          }
        }
      );
    }, 2000);
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function start() {
    if (state.conversationId || state.busy) return;
    state.busy = true;
    render("system", "Connecting…");
    request("POST", "/widget/conversations", { chatbot_id: CHATBOT_ID }, function (status, payload) {
      state.busy = false;
      log.innerHTML = "";
      if (status !== 201 || !payload || !payload.success) {
        render("system", "This chat is unavailable right now.");
        return;
      }
      state.conversationId = payload.data.conversation.id;
      state.token = payload.data.token;
      take(payload.data.messages);
      setStatus(payload.data.conversation.status);
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var content = input.value.trim();
    if (!content || state.busy || !state.conversationId || state.status === "closed") return;
    input.value = "";
    render("visitor", content);
    state.busy = true;
    sendButton.disabled = true;
    request(
      "POST",
      "/widget/conversations/" + state.conversationId + "/messages",
      { content: content },
      function (status, payload) {
        state.busy = false;
        sendButton.disabled = false;
        if (status === 200 && payload && payload.success) {
          take(payload.data.messages.filter(function (m) { return m.role !== "visitor"; }));
          state.lastOrdinal = Math.max.apply(
            null,
            [state.lastOrdinal].concat(payload.data.messages.map(function (m) { return m.ordinal; }))
          );
          setStatus(payload.data.status);
        } else if (status === 409) {
          setStatus("closed");
        } else {
          render("system", "Message failed to send.");
        }
        input.focus();
      }
    );
  });

  root.querySelector(".wcb-bubble").addEventListener("click", function () {
    state.open = !state.open;
    panel.classList.toggle("wcb-open", state.open);
    if (state.open) {
      start();
      input.focus();
    }
  });
  root.querySelector(".wcb-head button").addEventListener("click", function () {
    state.open = false;
    panel.classList.remove("wcb-open");
  });

  loadProfile();

  window.WebChatBots = { open: function () { root.querySelector(".wcb-bubble").click(); } };
})();
