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
    ".wcb-sub{font-size:11px;font-weight:400;opacity:.85;margin-top:2px}" +
    ".wcb-media{max-width:100%;border-radius:8px;display:block}iframe.wcb-media{width:100%;aspect-ratio:16/9;border:0}" +
    ".wcb-options{display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start;max-width:90%}" +
    ".wcb-opt{border:1px solid " + ACCENT + ";color:" + ACCENT + ";background:#fff;border-radius:999px;padding:6px 12px;font-size:12px;cursor:pointer}" +
    ".wcb-opt-on,.wcb-opt-done{background:" + ACCENT + ";color:#fff}" +
    ".wcb-avatar{width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-right:10px;overflow:hidden;font-size:14px;font-weight:700}.wcb-avatar img{width:100%;height:100%;object-fit:cover}" +
    ".wcb-row{display:flex;gap:6px;align-items:flex-end;align-self:flex-start;max-width:90%}.wcb-row .wcb-msg{align-self:auto}" +
    ".wcb-teaser{position:absolute;bottom:68px;right:0;background:#fff;color:#1c1c28;border:1px solid #e6e6ef;border-radius:12px;padding:8px 12px;font-size:13px;box-shadow:0 6px 20px rgba(0,0,0,.15);max-width:240px;cursor:pointer}";
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
  var AVATARS = { ambot: "A", avatar1: "👨‍💼", avatar2: "🧔", avatar3: "🧑‍🦱", avatar4: "👨‍💻", robot: "🤖" };
  var design = {};

  function avatarNode(d) {
    var wrap = document.createElement("span");
    wrap.className = "wcb-avatar";
    if (d.selectedAvatar === "custom" && d.customAvatarUrl) {
      var img = document.createElement("img"); img.src = d.customAvatarUrl; img.alt = "";
      wrap.appendChild(img);
    } else {
      wrap.textContent = AVATARS[d.selectedAvatar] || AVATARS.ambot;
    }
    return wrap;
  }

  function applyDesign(d) {
    design = d || {};
    var accent = design.themeColor || ACCENT;
    var classic = design.styleMode === "classic";
    head.style.background = classic ? "#ffffff" : accent;
    head.style.color = classic ? "#1c1c28" : "#ffffff";
    head.style.borderBottom = classic ? "1px solid #e6e6ef" : "none";
    bubble.style.background = accent;
    sendButton.style.color = accent;
    overrides.textContent =
      ".wcb-msg.visitor{background:" + accent + "}.wcb-msg.agent{border-color:" + accent + "}" +
      ".wcb-opt{border-color:" + accent + ";color:" + accent + "}.wcb-opt-on,.wcb-opt-done{background:" + accent + ";color:#fff}" +
      ".wcb-avatar{background:" + (classic ? accent : "rgba(255,255,255,.25)") + "}" +
      "@media (max-width:480px){.wcb-root{left:" + (design.positionMobile === "left" ? "16px" : "auto") + ";right:" + (design.positionMobile === "left" ? "auto" : "16px") + "}}";
    if (design.chatBgColor) log.style.background = design.chatBgColor;
    if (design.fontFamily) root.style.fontFamily = design.fontFamily;
    if (design.botTitle) title.textContent = design.botTitle;
    subtitle.textContent = design.botStatusText || "";
    if (design.inputPlaceholder) input.placeholder = design.inputPlaceholder;
    var headAvatar = head.querySelector(".wcb-avatar");
    if (headAvatar) headAvatar.remove();
    head.insertBefore(avatarNode(design), head.firstChild);
    bubble.innerHTML = "";
    bubble.appendChild(design.selectedAvatar === "custom" && design.customAvatarUrl ? avatarNode(design) : document.createTextNode("💬"));
    if (design.positionWeb === "left") {
      root.style.right = "auto"; root.style.left = "20px"; panel.style.right = "auto"; panel.style.left = "0";
    } else if (design.positionWeb === "center") {
      root.style.right = "auto"; root.style.left = "50%"; root.style.transform = "translateX(-50%)";
      panel.style.right = "auto"; panel.style.left = "50%"; panel.style.transform = "translateX(-50%)";
    }
    var size = design.windowSize === "Custom" ? [design.customWidth || 360, design.customHeight || 520] : SIZES[design.windowSize];
    if (size) { panel.style.width = size[0] + "px"; panel.style.height = size[1] + "px"; }
    panel.style.resize = design.enableResize ? "both" : "none";
    panel.style.overflow = design.enableResize ? "auto" : "hidden";
    showTeaser(design.followUpQuestion);
  }

  var teaser = document.createElement("div");
  teaser.className = "wcb-teaser";
  teaser.hidden = true;
  root.appendChild(teaser);
  function showTeaser(text) {
    if (!text || state.open) { teaser.hidden = true; return; }
    teaser.textContent = text;
    teaser.hidden = false;
  }
  teaser.addEventListener("click", function () { bubble.click(); });

  function loadProfile() {
    request("GET", "/widget/chatbots/" + CHATBOT_ID, null, function (status, payload) {
      if (status === 200 && payload && payload.success) {
        if (payload.data.name) title.textContent = payload.data.name;
        applyDesign(payload.data.design);
      }
    });
  }

  var VIDEO_EMBED = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/;

  function render(role, content, meta) {
    meta = meta || {};
    var el = document.createElement("div");
    el.className = "wcb-msg " + role;
    if (meta.kind === "image" && meta.url) {
      var img = document.createElement("img");
      img.src = meta.url; img.alt = content; img.className = "wcb-media";
      el.appendChild(img);
    } else if (meta.kind === "video" && meta.url) {
      var yt = VIDEO_EMBED.exec(meta.url);
      if (yt) {
        var frame = document.createElement("iframe");
        frame.src = "https://www.youtube.com/embed/" + yt[1]; frame.className = "wcb-media"; frame.allowFullscreen = true;
        el.appendChild(frame);
      } else {
        var video = document.createElement("video");
        video.src = meta.url; video.controls = true; video.className = "wcb-media";
        el.appendChild(video);
      }
    } else if (meta.kind === "link" && meta.url) {
      var a = document.createElement("a");
      a.href = meta.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = content;
      el.appendChild(a);
    } else {
      el.textContent = content;
    }
    if (role === "bot") {
      var row = document.createElement("div");
      row.className = "wcb-row";
      row.appendChild(avatarNode(design));
      row.appendChild(el);
      log.appendChild(row);
    } else {
      log.appendChild(el);
    }
    if (meta.options && meta.options.length) renderOptions(meta.options, !!meta.multiple);
    if (meta.inputType) setInputType(meta.inputType);
    log.scrollTop = log.scrollHeight;
  }

  function setInputType(kind) {
    var map = { email: "email", number: "number", phone: "tel", date: "date" };
    input.type = map[kind] || "text";
  }

  function renderOptions(options, multiple) {
    var row = document.createElement("div");
    row.className = "wcb-options";
    var selected = [];
    options.forEach(function (label) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "wcb-opt"; b.textContent = label;
      b.addEventListener("click", function () {
        if (!multiple) { row.remove(); send(label); return; }
        b.classList.toggle("wcb-opt-on");
        var i = selected.indexOf(label);
        if (i >= 0) selected.splice(i, 1); else selected.push(label);
      });
      row.appendChild(b);
    });
    if (multiple) {
      var done = document.createElement("button");
      done.type = "button"; done.className = "wcb-opt wcb-opt-done"; done.textContent = "Done";
      done.addEventListener("click", function () { if (selected.length) { row.remove(); send(selected.join(", ")); } });
      row.appendChild(done);
    }
    log.appendChild(row);
  }

  function take(messages) {
    (messages || []).forEach(function (m) {
      if (m.ordinal > state.lastOrdinal) state.lastOrdinal = m.ordinal;
      render(m.role, m.content, m.meta);
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
    if (design.welcomeMessage) render("bot", design.welcomeMessage, {});
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
      if (design.welcomeMessage) render("bot", design.welcomeMessage, {});
      take(payload.data.messages);
      setStatus(payload.data.conversation.status);
    });
  }

  function send(content) {
    setInputType("text");
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
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var content = input.value.trim();
    if (!content || state.busy || !state.conversationId || state.status === "closed") return;
    send(content);
  });

  root.querySelector(".wcb-bubble").addEventListener("click", function () {
    state.open = !state.open;
    panel.classList.toggle("wcb-open", state.open);
    showTeaser(design.followUpQuestion);
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
