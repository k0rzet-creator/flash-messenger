// ============================================
// КОНФИГ И ПЕРЕМЕННЫЕ
// ============================================
const STORAGE_KEY = "flash_state_v1";
const DEFAULT_SERVER_URL = "https://flash-msg.site";

let state = { servers: [], active_server_id: null };
let currentServer = null, currentUser = null, currentAccount = null;
let currentChat = null, currentChannel = null, chatsCache = [];
let cryptoKey = null, connectToken = null;
let onlineUsers = new Set(), readersCache = {}, replyingTo = null;
let authMode = "login";
let isMarkingAsRead = false; // Защита от спама на прочтение

const $ = (id) => document.getElementById(id);

// ============================================
// LOCALSTORAGE
// ============================================
function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            state = JSON.parse(raw);
            if (!Array.isArray(state.servers)) state.servers = [];
        } else {
            state.servers = [
                {
                    id: crypto.randomUUID(),
                    address: DEFAULT_SERVER_URL,
                    password: "", 
                    account: null,
                },
            ];
            state.active_server_id = state.servers[0].id;
            saveState();
        }
    } catch (e) { state = { servers: [], active_server_id: null }; }
}

function saveState() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {} }
function getActiveServer() { return state.servers.find((s) => s.id === state.active_server_id) || null; }

// ============================================
// ШИФРОВАНИЕ
// ============================================
async function initCrypto() {
    cryptoKey = await crypto.subtle.importKey("raw", new Uint8Array(32), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptText(text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, new TextEncoder().encode(text));
    return { ciphertext: btoa(String.fromCharCode(...new Uint8Array(cipher))), iv: btoa(String.fromCharCode(...iv)) };
}

async function decryptText(ciphertextB64, ivB64) {
    try {
        const cipher = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));
        const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, cipher);
        return new TextDecoder().decode(plain);
    } catch (e) { return "[не удалось расшифровать]"; }
}

// ============================================
// API
// ============================================
async function checkServerInfo(server) {
    try {
        const res = await fetch(server.address.replace(/\/$/, "") + "/api/server-info?_=" + Date.now(), { cache: "no-store" });
        if (!res.ok) return { status: "offline" };
        const data = await res.json();
        return { status: data && typeof data.name === "string" ? "online" : "wrong", info: data };
    } catch (e) { return { status: "offline" }; }
}

async function connectToServer(server) {
    const info = await checkServerInfo(server);
    if (info.status !== "online") return info;
    if (info.info.password_required) {
        try {
            const res = await fetch(server.address.replace(/\/$/, "") + "/api/connect?_=" + Date.now(), {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: server.password || "" })
            });
            if (!res.ok) return { status: "offline" };
            const data = await res.json();
            return { status: "online", info: info.info, connect_token: data.connect_token };
        } catch (e) { return { status: "offline" }; }
    }
    return { status: "online", info: info.info, connect_token: null };
}

async function apiRequest(path, options = {}) {
    if (!currentServer) throw new Error("no_server");
    if (path.includes("/api/register") || path.includes("/api/login")) {
        const conn = await connectToServer(currentServer);
        if (conn.status === "online") connectToken = conn.connect_token;
    }
    const url = currentServer.address.replace(/\/$/, "") + path + (path.includes("?") ? "&" : "?") + "_=" + Date.now();
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (currentAccount?.token) headers["Authorization"] = "Bearer " + currentAccount.token;
    if (connectToken) headers["X-Connect-Token"] = connectToken;

    const res = await fetch(url, { ...options, headers, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `http_${res.status}`);
    return data;
}

// ============================================
// UI АВТОРИЗАЦИИ
// ============================================
async function updateAuthServerInfo() {
    if (!currentServer) return;
    const nameEl = $("auth-server-name"), addrEl = $("auth-server-addr"), dotEl = $("auth-server-dot");
    if (!nameEl) return;
    addrEl.textContent = currentServer.address;
    const status = await checkServerInfo(currentServer);
    dotEl.className = "server-dot " + status.status;
    nameEl.textContent = status.info?.name || "Сервер недоступен";
}

function setAuthMode(mode) {
    authMode = mode;
    if (!$("auth-slider")) return;
    $("auth-slider").classList.toggle("right", mode === "register");
    $("tab-login").classList.toggle("active", mode === "login");
    $("tab-register").classList.toggle("active", mode === "register");
    $("field-username").classList.toggle("hidden", mode === "login");
    $("field-login").classList.toggle("hidden", mode === "register");
    $("auth-submit").textContent = mode === "login" ? "Войти" : "Создать аккаунт";
    $("auth-status").textContent = "";
}

async function doAuth() {
    const password = $("auth-password").value, status = $("auth-status"), submit = $("auth-submit");
    let username = authMode === "login" ? $("login-username").value.trim().toLowerCase() : $("auth-username").value.trim().toLowerCase();

    if (!username || !password) { status.textContent = "Заполни все поля"; return; }
    submit.disabled = true; status.textContent = "Подключение...";

    const conn = await connectToServer(currentServer);
    if (conn.status !== "online") { status.textContent = "Сервер недоступен"; submit.disabled = false; return; }
    connectToken = conn.connect_token;
    status.textContent = "Загрузка...";

    try {
        const endpoint = authMode === "login" ? "/api/login" : "/api/register";
        const body = authMode === "login" ? { username, password } : { username, password, display_name: username };
        const data = await apiRequest(endpoint, { method: "POST", body: JSON.stringify(body) });

        currentAccount = { token: data.token, user: data.user };
        currentServer.account = currentAccount;
        currentUser = data.user;

        const autoLogin = $("auto-login-checkbox") ? $("auto-login-checkbox").checked : true;
        if (!autoLogin) {
            currentAccount = null; currentServer.account = null; currentUser = null;
            saveState(); status.textContent = "Вошли, но автовход выключен"; submit.disabled = false; return;
        }

        saveState(); status.textContent = ""; await showApp();
    } catch (e) {
        const msgs = { invalid_credentials: "Неверный логин или пароль", username_taken: "Username занят", missing_fields: "Заполни поля" };
        status.textContent = msgs[e.message] || e.message;
        submit.disabled = false;
    }
}

async function saveProfile() {
    const username = $("settings-username").value.trim().toLowerCase();
    const displayName = $("settings-display-name").value.trim();
    const status = $("settings-profile-status");
    if (!username) { status.textContent = "Username не может быть пустым"; return; }
    status.textContent = "Сохранение...";
    try {
        const result = await apiRequest("/api/profile", {
            method: "POST",
            body: JSON.stringify({ username, display_name: displayName }),
        });
        currentUser = result.user;
        if (currentServer) currentServer.account = { token: currentAccount.token, user: result.user };
        saveState();
        status.style.color = "var(--green)";
        status.textContent = "Сохранено";
        setTimeout(() => { status.textContent = ""; status.style.color = ""; }, 2000);
    } catch (e) {
        status.style.color = "var(--accent)";
        const msgs = { username_taken: "Такой username уже занят", username_too_short: "Username минимум 3 символа" };
        status.textContent = msgs[e.message] || e.message;
    }
}

// ============================================
// ЭКРАНЫ
// ============================================
async function showAuth() {
    document.body.classList.remove("app-active");
    $("app-screen").classList.remove("active");
    $("auth-screen").classList.add("active");
    $("auth-submit").disabled = false;
    updateAuthServerInfo();
    setAuthMode("login");
}

async function showApp() {
    document.body.classList.add("app-active");
    $("auth-screen").classList.remove("active");
    $("app-screen").classList.add("active");
    if (currentUser) $("logout-name").textContent = "@" + currentUser.username;
    subscribeWebSocket();
    await loadChats();
}

// ============================================
// ЧАТЫ
// ============================================
async function loadChats() {
    const list = $("chat-list"); list.innerHTML = "";
    if (!currentUser) return;
    try {
        const chats = await apiRequest("/api/chats"); chatsCache = chats;
        for (const chat of chats) {
            const name = chat.other_user?.display_name || chat.other_user?.username || chat.name || "Чат";
            const isOnline = chat.other_user && onlineUsers.has(chat.other_user.id);
            const statusHtml = chat.type === 'direct' && chat.other_user 
                ? `<div class="chat-item-preview" style="color: ${isOnline ? 'var(--green)' : 'var(--gray)'}">${isOnline ? 'онлайн' : 'не в сети'}</div>`
                : `<div class="chat-item-preview">${chat.type === 'group' ? 'Группа' : 'Канал'}</div>`;

            const el = document.createElement("div");
            el.className = "chat-item" + (currentChat?.id === chat.id ? " active" : "");
            el.innerHTML = `
                <div class="avatar" style="position:relative;">${name[0].toUpperCase()}
                    ${isOnline ? '<div style="position:absolute;bottom:0;right:0;width:12px;height:12px;background:var(--green);border:2px solid var(--bg-soft);border-radius:50%;"></div>' : ''}
                </div>
                <div class="chat-item-info">
                    <div class="chat-item-name" style="display:flex;justify-content:space-between;">${escapeHtml(name)} 
                        ${chat.unread > 0 ? `<span style="background:var(--accent);color:#fff;font-size:10px;padding:2px 6px;border-radius:10px;">${chat.unread}</span>` : ''}
                    </div>
                    ${statusHtml}
                </div>`;
            el.onclick = () => openChat(chat);
            list.appendChild(el);
        }
    } catch (e) { console.error(e); }
}

async function openChat(chat) {
    currentChat = chat;
    $("app-screen").classList.add("chat-open");
    $("empty-state").classList.add("hidden");
    $("active-chat").classList.remove("hidden");
    
    const name = chat.other_user?.display_name || chat.other_user?.username || chat.name || "Чат";
    $("chat-name").textContent = name;
    $("chat-avatar").textContent = name[0]?.toUpperCase() || "?";
    
    // Статус в шапке
    const isOnline = chat.other_user && onlineUsers.has(chat.other_user.id);
    const headerStatus = $("chat-header-status");
    if (headerStatus) {
        if (chat.other_user) {
            headerStatus.textContent = isOnline ? "в сети" : "не в сети";
            headerStatus.style.color = isOnline ? "var(--green)" : "var(--gray)";
        } else {
            headerStatus.textContent = chat.type === 'group' ? "Группа" : "Канал";
            headerStatus.style.color = "var(--gray)";
        }
    }

    await loadMessages();
    loadChats();
}

async function loadMessages() {
    const container = $("messages"); container.innerHTML = "";
    if (!currentChat) return;
    try {
        const data = await apiRequest(`/api/messages/${currentChat.id}`);
        readersCache = {}; data.readers.forEach(r => readersCache[r.user_id] = r.last_read_at);
        for (const m of data.messages) {
            renderMessage(await decryptText(m.content_encrypted, m.iv), m.sender_id === currentUser.id, m.created_at, m.id, m.reply_to, m.sender_username);
        }
        scrollToBottom();
        
        // Отправляем прочтение только если не спамим
        if (!isMarkingAsRead) {
            isMarkingAsRead = true;
            apiRequest("/api/chats/read", { method: "POST", body: JSON.stringify({ chat_id: currentChat.id }) })
                .finally(() => { isMarkingAsRead = false; });
        }
    } catch (e) { console.error(e); }
}

function renderMessage(text, isOut, timeIso, msgId, replyTo, senderUsername) {
    const row = document.createElement("div");
    row.className = `msg-row ${isOut ? "out" : "in"}`;
    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    
    if (replyTo) {
        const replyDiv = document.createElement("div");
        replyDiv.style.cssText = "border-left: 2px solid #fff; padding-left: 8px; margin-bottom: 4px; font-size: 11px; opacity: 0.7;";
        replyDiv.textContent = "Ответ на сообщение";
        bubble.appendChild(replyDiv);
    }
    const textNode = document.createElement("div"); textNode.textContent = text; bubble.appendChild(textNode);

    if (timeIso) {
        const time = document.createElement("span"); time.className = "msg-time";
        time.textContent = new Date(timeIso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
        if (isOut) {
            let isRead = false;
            for (const [uid, lastRead] of Object.entries(readersCache)) if (uid !== currentUser.id && lastRead > timeIso) isRead = true;
            time.innerHTML += isRead ? ' <span style="color:var(--white); font-weight:bold;">✓✓</span>' : ' <span style="opacity:0.5;">✓</span>';
        }
        bubble.appendChild(time);
    }

    bubble.onclick = () => {
        replyingTo = { id: msgId, text: text.substring(0, 30), username: senderUsername };
        $("reply-preview").style.display = "flex";
        $("reply-text").textContent = text.substring(0, 30) + "...";
        $("msg-input").placeholder = `Ответ ${senderUsername}...`;
        $("msg-input").focus();
    };
    row.appendChild(bubble); $("messages").appendChild(row);
}

function scrollToBottom() { $("messages").scrollTop = $("messages").scrollHeight; }

async function sendMessage() {
    if (!currentChat) return;
    const input = $("msg-input"), text = input.value.trim();
    if (!text) return;
    input.value = ""; input.placeholder = "Пиши что-нибудь...";
    const currentReply = replyingTo; replyingTo = null;
    if ($("reply-preview")) $("reply-preview").style.display = "none";

    try {
        const enc = await encryptText(text);
        const body = { chat_id: currentChat.id, content_encrypted: enc.ciphertext, iv: enc.iv };
        if (currentReply) body.reply_to = currentReply.id;
        const msg = await apiRequest("/api/messages", { method: "POST", body: JSON.stringify(body) });
        renderMessage(text, true, msg.created_at, msg.id, msg.reply_to, currentUser.username);
        scrollToBottom();
    } catch (e) { console.error(e); }
}

function subscribeWebSocket() {
    if (currentChannel) currentChannel.close();
    if (!currentServer || !currentAccount) return;
    const wsUrl = currentServer.address.replace(/^http/, "ws").replace(/\/$/, "") + "/ws?token=" + encodeURIComponent(currentAccount.token);
    
    try {
        currentChannel = new WebSocket(wsUrl);
        currentChannel.onmessage = async (e) => {
            const data = JSON.parse(e.data);
            
            if (data.type === "message" && data.message.chat_id === currentChat?.id && data.message.sender_id !== currentUser.id) {
                renderMessage(await decryptText(data.message.content_encrypted, data.message.iv), false, data.message.created_at, data.message.id, data.message.reply_to, "User");
                scrollToBottom();
                
                if (!isMarkingAsRead) {
                    isMarkingAsRead = true;
                    apiRequest("/api/chats/read", { method: "POST", body: JSON.stringify({ chat_id: currentChat.id }) })
                        .finally(() => { isMarkingAsRead = false; });
                }

                // УВЕДОМЛЕНИЕ В ВИНДЕ
                if (window.flashApp && window.flashApp.showNotification) {
                    if (document.hidden || !document.hasFocus()) {
                        window.flashApp.showNotification({
                            title: "Flash",
                            body: "Новое сообщение в чате",
                            chat_id: currentChat.id
                        });
                    }
                }
            }
            
            // ПРОСТО ОБНОВЛЯЕМ КЭШ, НЕ ПЕРЕЗАГРУЖАЕМ СООБЩЕНИЯ
            if (data.type === "read") { 
                readersCache[data.user_id] = Date.now(); 
            }
            
            if (data.type === "presence") {
                if (data.status === "online") onlineUsers.add(data.user_id); else onlineUsers.delete(data.user_id);
                loadChats();
                
                // Обновляем статус в шапке, если открыт чат с этим юзером
                if (currentChat?.other_user?.id === data.user_id) {
                    const isOnline = data.status === "online";
                    const headerStatus = $("chat-header-status");
                    if (headerStatus) {
                        headerStatus.textContent = isOnline ? "в сети" : "не в сети";
                        headerStatus.style.color = isOnline ? "var(--green)" : "var(--gray)";
                    }
                }
            }
        };
        currentChannel.onclose = () => setTimeout(() => { if (currentChat) subscribeWebSocket(); }, 3000);
    } catch (e) {}
}

async function createNewChat() {
    const username = $("new-chat-username").value.trim().toLowerCase(), status = $("new-chat-status");
    if (!username) return status.textContent = "Введи username";
    status.textContent = "Ищем...";
    try {
        const other = await apiRequest(`/api/users/${encodeURIComponent(username)}`);
        const result = await apiRequest("/api/chats/direct", { method: "POST", body: JSON.stringify({ other_user_id: other.id }) });
        closeModal("new-chat-modal"); await loadChats();
        const chat = chatsCache.find(c => c.id === result.chat_id);
        if (chat) await openChat(chat);
    } catch (e) { status.textContent = e.message === "not_found" ? "Пользователь не найден" : e.message; }
}

// ============================================
// УТИЛИТЫ И ИВЕНТЫ
// ============================================
function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function openModal(id) { $(id)?.classList.remove("hidden"); }
function closeModal(id) { $(id)?.classList.add("hidden"); }

function bindEvents() {
    $("server-btn-auth")?.addEventListener("click", () => { switchSettingsSection("servers"); openModal("settings-modal"); });
    $("settings-btn")?.addEventListener("click", () => { switchSettingsSection("profile"); openModal("settings-modal"); });
    $("settings-close")?.addEventListener("click", () => closeModal("settings-modal"));
    
    document.querySelectorAll(".settings-nav").forEach((btn) => btn.addEventListener("click", () => switchSettingsSection(btn.dataset.section)));
    $("settings-profile-save")?.addEventListener("click", saveProfile);

    $("tab-login")?.addEventListener("click", () => setAuthMode("login"));
    $("tab-register")?.addEventListener("click", () => setAuthMode("register"));
    $("auth-submit")?.addEventListener("click", doAuth);
    $("auth-password")?.addEventListener("keydown", (e) => { if (e.key === "Enter") doAuth(); });
    
    $("send-btn")?.addEventListener("click", sendMessage);
    $("msg-input")?.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    
    $("cancel-reply")?.addEventListener("click", () => {
        replyingTo = null; $("reply-preview").style.display = "none"; $("msg-input").placeholder = "Пиши что-нибудь...";
    });

    $("btn-reset-all")?.addEventListener("click", () => {
        if (!confirm("ВНИМАНИЕ! Все настройки и сохраненные аккаунты будут удалены. Продолжить?")) return;
        localStorage.removeItem(STORAGE_KEY);
        if (currentChannel) { try { currentChannel.close(); } catch (e) {} }
        location.reload();
    });

    $("new-chat-btn")?.addEventListener("click", () => { 
        $("new-chat-username").value = ""; 
        $("new-chat-status").textContent = ""; 
        openModal("new-chat-modal"); 
    });
    $("new-chat-close")?.addEventListener("click", () => closeModal("new-chat-modal"));
    $("new-chat-submit")?.addEventListener("click", createNewChat);
    $("back-btn")?.addEventListener("click", () => $("app-screen").classList.remove("chat-open"));
    
    $("logout-btn")?.addEventListener("click", () => {
        if (!confirm("Выйти из аккаунта?")) return;
        currentAccount = null; currentUser = null; if (currentServer) currentServer.account = null;
        saveState(); if (currentChannel) currentChannel.close(); showAuth();
    });

    if (window.flashApp && window.flashApp.onOpenChatNotification) {
        window.flashApp.onOpenChatNotification((chatId) => {
            const chat = chatsCache.find(c => c.id === chatId);
            if (chat) openChat(chat);
        });
    }
}

function switchSettingsSection(section) {
    document.querySelectorAll(".settings-nav").forEach((el) => el.classList.toggle("active", el.dataset.section === section));
    document.querySelectorAll(".settings-section").forEach((el) => el.classList.toggle("active", el.dataset.section === section));
}

// ============================================
// СТАРТ
// ============================================
async function boot() {
    loadState(); await initCrypto(); bindEvents();
    currentServer = getActiveServer();
    if (currentServer) {
        currentAccount = currentServer.account || null;
        currentUser = currentAccount?.user || null;
    }

    if (currentAccount?.token) {
        const conn = await connectToServer(currentServer);
        if (conn.status === "online") connectToken = conn.connect_token;
        try {
            currentUser = await apiRequest("/api/me");
            await showApp(); return;
        } catch (e) {
            currentAccount = null; currentUser = null; currentServer.account = null; saveState();
        }
    }
    await showAuth();
}
boot();