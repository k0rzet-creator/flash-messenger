// ============================================
// КОНФИГ И ПЕРЕМЕННЫЕ
// ============================================
const STORAGE_KEY = "flash_state_v1";
const PERSONALIZATION_KEY = "flash_personalization_v1";
const DEFAULT_SERVER_URL = "https://flash-msg.site";

let state = { servers: [], active_server_id: null };
let currentServer = null, currentUser = null, currentAccount = null;
let currentChat = null, currentChannel = null, chatsCache = [];
let cryptoKey = null, connectToken = null;
let onlineUsers = new Set(), readersCache = {}, replyingTo = null;
let authMode = "login";
let isMarkingAsRead = false;
let chatPollInterval = null;
let pendingFile = null;
let registrationStep = 1;
let tempRegData = null;
let ctxTargetMsgId = null;
let ctxTargetChatId = null;

let messagesCache = [];

// Персонализация
let personalization = { accent: "#ff2d6f", wallpaper: "default", customWallpaper: "" };

const ACCENT_PRESETS = [
    { name: "Flash", value: "#ff2d6f" },
    { name: "Океан", value: "#0ea5e9" },
    { name: "Изумруд", value: "#10b981" },
    { name: "Аметист", value: "#8b5cf6" },
    { name: "Закат", value: "#f97316" },
    { name: "Золото", value: "#eab308" },
    { name: "Малина", value: "#e11d48" },
    { name: "Лаванда", value: "#a78bfa" },
];

const WALLPAPER_PRESETS = [
    { id: "default", label: "По умолчанию", value: "transparent" },
    { id: "dark", label: "Тёмный", value: "#0a0a10" },
    { id: "night", label: "Ночной", value: "#10121a" },
    { id: "plum", label: "Сливовый", value: "#1a1020" },
    { id: "ocean", label: "Океан", value: "#0b1a22" },
    { id: "forest", label: "Лес", value: "#0f1a12" },
    { id: "wine", label: "Вино", value: "#1f0f14" },
    { id: "graphite", label: "Графит", value: "#151515" },
];

const $ = (id) => document.getElementById(id);

// ============================================
// ОПРЕДЕЛЕНИЕ СВОЕГО ORIGIN
// ============================================
function getSelfOrigin() {
    try {
        const o = window.location.origin;
        if (!o || o === "null") return null;          // file:// или sandbox
        if (!/^https?:\/\//i.test(o)) return null;    // не http(s)
        return o.replace(/\/$/, "");
    } catch (e) { return null; }
}

function normalizeServerAddr(addr) {
    if (!addr) return "";
    let a = String(addr).trim().replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(a)) a = "http://" + a;
    try {
        const u = new URL(a);
        // убираем дефолтные порты: http:80 и https:443
        const isDefaultPort =
            (u.protocol === "http:" && (u.port === "" || u.port === "80")) ||
            (u.protocol === "https:" && (u.port === "" || u.port === "443"));
        const host = u.hostname.toLowerCase();
        const portPart = isDefaultPort ? "" : (u.port ? ":" + u.port : "");
        const pathPart = u.pathname.replace(/\/+$/, "");
        return u.protocol + "//" + host + portPart + pathPart;
    } catch (e) {
        return a.toLowerCase();
    }
}

function isDefaultOrigin(origin) {
    if (!origin) return false;
    try {
        const o = new URL(origin);
        const d = new URL(DEFAULT_SERVER_URL);
        return o.protocol === d.protocol && o.hostname === d.hostname &&
            (o.port || "") === (d.port || "");
    } catch (e) { return false; }
}

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
            state = { servers: [], active_server_id: null };
        }
    } catch (e) {
        state = { servers: [], active_server_id: null };
    }

    const selfOrigin = getSelfOrigin();
    const defaultAddr = normalizeServerAddr(DEFAULT_SERVER_URL);

    // Убедимся, что дефолтный сервер есть в списке (чтобы можно было переключиться)
    let defaultServer = state.servers.find(s => normalizeServerAddr(s.address) === defaultAddr);
    if (!defaultServer) {
        defaultServer = { id: crypto.randomUUID(), address: DEFAULT_SERVER_URL, password: "", account: null };
        state.servers.unshift(defaultServer);
    }

    if (selfOrigin && !isDefaultOrigin(selfOrigin)) {
        // Клиент открыт НЕ с дефолтного origin → ищем/добавляем «свой» сервер и делаем активным
        const normSelf = normalizeServerAddr(selfOrigin);
        let own = state.servers.find(s => normalizeServerAddr(s.address) === normSelf);
        if (!own) {
            own = { id: crypto.randomUUID(), address: selfOrigin, password: "", account: null };
            state.servers.unshift(own);
        }
        state.active_server_id = own.id;
    } else {
        // Клиент открыт с дефолтного origin (или file://) → активный = сохранённый, иначе дефолтный
        if (!state.active_server_id || !state.servers.some(s => s.id === state.active_server_id)) {
            state.active_server_id = defaultServer.id;
        }
    }

    saveState();
}

function saveState() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {} }
function getActiveServer() { return state.servers.find((s) => s.id === state.active_server_id) || null; }

// ============================================
// ПЕРСОНАЛИЗАЦИЯ
// ============================================
function loadPersonalization() {
    try {
        const raw = localStorage.getItem(PERSONALIZATION_KEY);
        if (raw) {
            const p = JSON.parse(raw);
            if (p && typeof p === "object") {
                personalization.accent = p.accent || "#ff2d6f";
                personalization.wallpaper = p.wallpaper || "default";
                personalization.customWallpaper = p.customWallpaper || "";
            }
        }
    } catch (e) {}
    applyPersonalization();
}
function savePersonalization() {
    try { localStorage.setItem(PERSONALIZATION_KEY, JSON.stringify(personalization)); } catch (e) {}
}
function hexToRgba(hex, alpha) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function lightenHex(hex, percent) {
    const h = hex.replace("#", "");
    let r = parseInt(h.substring(0, 2), 16);
    let g = parseInt(h.substring(2, 4), 16);
    let b = parseInt(h.substring(4, 6), 16);
    r = Math.min(255, Math.round(r + (255 - r) * percent));
    g = Math.min(255, Math.round(g + (255 - g) * percent));
    b = Math.min(255, Math.round(b + (255 - b) * percent));
    return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}
function applyPersonalization() {
    const accent = personalization.accent || "#ff2d6f";
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty("--accent-h", lightenHex(accent, 0.15));
    document.documentElement.style.setProperty("--accent-soft", hexToRgba(accent, 0.2));

    let wallpaperValue = "transparent";
    if (personalization.wallpaper === "custom" && personalization.customWallpaper) {
        wallpaperValue = personalization.customWallpaper;
    } else {
        const preset = WALLPAPER_PRESETS.find(w => w.id === personalization.wallpaper);
        if (preset) wallpaperValue = preset.value;
    }
    document.documentElement.style.setProperty("--chat-wallpaper", wallpaperValue);
}

function renderPersonalizationPickers() {
    for (const containerId of ["theme-swatches", "theme-swatches-desktop"]) {
        const el = $(containerId);
        if (!el) continue;
        el.innerHTML = "";
        for (const preset of ACCENT_PRESETS) {
            const sw = document.createElement("div");
            sw.className = "theme-swatch" + (personalization.accent === preset.value ? " active" : "");
            sw.style.background = preset.value;
            sw.title = preset.name;
            sw.onclick = () => {
                personalization.accent = preset.value;
                savePersonalization();
                applyPersonalization();
                renderPersonalizationPickers();
            };
            el.appendChild(sw);
        }
    }

    for (const containerId of ["wallpaper-grid", "wallpaper-grid-desktop"]) {
        const el = $(containerId);
        if (!el) continue;
        el.innerHTML = "";
        for (const preset of WALLPAPER_PRESETS) {
            const item = document.createElement("div");
            item.className = "wallpaper-item" + (personalization.wallpaper === preset.id ? " active" : "");
            if (preset.id === "default") {
                item.style.background = "repeating-linear-gradient(45deg, #0a0a10 0, #0a0a10 4px, #151520 4px, #151520 8px)";
            } else {
                item.style.background = preset.value;
            }
            item.innerHTML = `<span class="wallpaper-item-label">${preset.label}</span>`;
            item.onclick = () => {
                personalization.wallpaper = preset.id;
                personalization.customWallpaper = "";
                savePersonalization();
                applyPersonalization();
                renderPersonalizationPickers();
            };
            el.appendChild(item);
        }
        if (personalization.wallpaper === "custom" && personalization.customWallpaper) {
            const item = document.createElement("div");
            item.className = "wallpaper-item active";
            item.style.background = personalization.customWallpaper;
            item.innerHTML = `<span class="wallpaper-item-label">Свой</span>`;
            item.onclick = () => {
                personalization.wallpaper = "custom";
                savePersonalization();
                applyPersonalization();
                renderPersonalizationPickers();
            };
            el.appendChild(item);
        }
    }

    const hexInputs = ["wallpaper-custom-hex", "wallpaper-custom-hex-desktop"];
    for (const id of hexInputs) {
        const input = $(id);
        if (input) input.value = personalization.customWallpaper || "";
    }
}

// ============================================
// ШИФРОВАНИЕ
// ============================================
async function initCrypto() {
    cryptoKey = await crypto.subtle.importKey("raw", new Uint8Array(32), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function encryptText(text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, new TextEncoder().encode(text));
    return { ciphertext: btoa(String.fromCharCode(...new Uint8Array(cipher))), iv: btoa(String.fromCharCode(...new Uint8Array(iv))) };
}
async function decryptText(ciphertextB64, ivB64) {
    try {
        const cipher = Uint8Array.from(atob(ciphertextB64), c => c.charCodeAt(0));
        const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, cipher);
        return new TextDecoder().decode(plain);
    } catch (e) { return "[не удалось расшифровать]"; }
}
async function hashFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: server.password || "" })
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
// ПОЛЛИНГ ЧАТОВ
// ============================================
function startChatPolling() {
    if (chatPollInterval) clearInterval(chatPollInterval);
    chatPollInterval = setInterval(async () => {
        if (!currentUser || !currentServer || document.hidden) return;
        try {
            const chats = await apiRequest("/api/chats");
            if (chats.length !== chatsCache.length) {
                chatsCache = chats;
                await loadChats();
            }
        } catch (e) {}
    }, 4000);
}
function stopChatPolling() {
    if (chatPollInterval) { clearInterval(chatPollInterval); chatPollInterval = null; }
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
    registrationStep = 1;
    if (!$("auth-slider")) return;
    $("auth-slider").classList.toggle("right", mode === "register");
    $("tab-login").classList.toggle("active", mode === "login");
    $("tab-register").classList.toggle("active", mode === "register");
    $("field-username").classList.toggle("hidden", mode === "login");
    $("field-login").classList.toggle("hidden", mode === "register");
    $("auth-submit").textContent = mode === "login" ? "Войти" : "Далее";
    $("auth-status").textContent = "";
    $("auth-step-2").classList.add("hidden");
    $("field-password").classList.remove("hidden");
}

async function doAuth() {
    const status = $("auth-status"), submit = $("auth-submit");

    if (authMode === "register" && registrationStep === 1) {
        const username = $("auth-username").value.trim().toLowerCase();
        const password = $("auth-password").value;
        if (!username || !password) { status.textContent = "Заполни все поля"; return; }

        tempRegData = { username, password };
        registrationStep = 2;

        $("auth-step-2").classList.remove("hidden");
        $("field-username").classList.add("hidden");
        $("field-login").classList.add("hidden");
        $("auth-password").value = "";
        $("auth-password").parentElement.classList.add("hidden");

        $("reg-avatar-preview").textContent = username[0].toUpperCase();
        $("reg-display-name").value = username;
        $("auth-submit").textContent = "Зарегистрироваться";
        status.textContent = "Шаг 2: Настройка профиля";
        return;
    }

    submit.disabled = true; status.textContent = "Подключение...";
    const conn = await connectToServer(currentServer);
    if (conn.status !== "online") { status.textContent = "Сервер недоступен"; submit.disabled = false; return; }
    connectToken = conn.connect_token;

    try {
        if (authMode === "login") {
            const username = $("login-username").value.trim().toLowerCase();
            const password = $("auth-password").value;
            if (!username || !password) { status.textContent = "Заполни все поля"; submit.disabled = false; return; }

            const data = await apiRequest("/api/login", { method: "POST", body: JSON.stringify({ username, password }) });
            currentAccount = { token: data.token, user: data.user };
            currentServer.account = currentAccount; currentUser = data.user;
        } else {
            const displayName = $("reg-display-name").value.trim() || tempRegData.username;
            const data = await apiRequest("/api/register", { method: "POST", body: JSON.stringify({ username: tempRegData.username, password: tempRegData.password, display_name: displayName }) });
            currentAccount = { token: data.token, user: data.user };
            currentServer.account = currentAccount; currentUser = data.user;

            const avatarInput = $("reg-avatar-input");
            if (avatarInput && avatarInput.files[0]) {
                const formData = new FormData();
                formData.append("avatar", avatarInput.files[0]);
                const uploadRes = await fetch(currentServer.address.replace(/\/$/, "") + "/api/profile/avatar", {
                    method: "POST", headers: { "Authorization": "Bearer " + currentAccount.token }, body: formData
                });
                const uploadData = await uploadRes.json();
                if (uploadData.avatar_url) {
                    currentUser.avatar_url = uploadData.avatar_url;
                    currentServer.account.user.avatar_url = uploadData.avatar_url;
                }
            }
        }

        const autoLogin = $("auto-login-checkbox") ? $("auto-login-checkbox").checked : true;
        if (!autoLogin) {
            currentAccount = null; currentServer.account = null; currentUser = null;
            saveState(); status.textContent = "Вошли, но автовход выключен"; submit.disabled = false; return;
        }
        saveState(); status.textContent = ""; await showApp();
    } catch (e) {
        const msgs = { invalid_credentials: "Неверный логин или пароль", username_taken: "Username занят", user_banned: "Ты забанен на этом сервере", missing_fields: "Заполни поля" };
        status.textContent = msgs[e.message] || e.message; submit.disabled = false;
    }
}

// ============================================
// НАСТРОЙКИ ПРОФИЛЯ
// ============================================
async function saveProfile() {
    const username = $("settings-username").value.trim().toLowerCase();
    const displayName = $("settings-display-name").value.trim();
    const status = $("settings-profile-status");
    if (!username) { status.textContent = "Username не может быть пустым"; return; }
    status.textContent = "Сохранение...";
    try {
        const result = await apiRequest("/api/profile", { method: "POST", body: JSON.stringify({ username, display_name: displayName }) });
        currentUser = result.user;
        if (currentServer) currentServer.account.user = result.user;
        saveState(); status.style.color = "var(--green)"; status.textContent = "Сохранено";
        setTimeout(() => { status.textContent = ""; status.style.color = ""; }, 2000);
        loadChats();
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
    document.body.classList.remove("app-active", "chat-open");
    $("app-screen").classList.remove("active");
    $("auth-screen").classList.add("active");
    $("auth-submit").disabled = false;
    updateAuthServerInfo(); setAuthMode("login");
    stopChatPolling();
    closeMobileSettings();
}
async function showApp() {
    document.body.classList.add("app-active");
    $("auth-screen").classList.remove("active");
    $("app-screen").classList.add("active");
    if (currentUser) $("logout-name").textContent = "@" + currentUser.username;
    subscribeWebSocket(); await loadChats(); startChatPolling();
    if (window.innerWidth <= 768) {
        $("mobile-nav")?.classList.remove("hidden");
    }
}

// ============================================
// ЧАТЫ И АВАТАРКИ
// ============================================
function getAvatarHtml(user, sizeClass = "") {
    if (user && user.avatar_url) {
        return `<img src="${currentServer.address.replace(/\/$/, "")}${user.avatar_url}" class="avatar ${sizeClass}" style="object-fit: cover;">`;
    }
    const letter = (user?.display_name || user?.username || "?")[0].toUpperCase();
    return `<div class="avatar ${sizeClass}">${letter}</div>`;
}

async function loadChats() {
    const list = $("chat-list"); list.innerHTML = "";
    if (!currentUser) return;
    try {
        const chats = await apiRequest("/api/chats"); chatsCache = chats;
        for (const chat of chats) {
            const name = chat.other_user?.display_name || chat.other_user?.username || chat.name || "Чат";
            const isOnline = chat.other_user && onlineUsers.has(chat.other_user.id);

            let avatarHtml = getAvatarHtml(chat.other_user);
            if (isOnline) {
                avatarHtml = `<div style="position:relative;">${avatarHtml}<div style="position:absolute;bottom:0;right:0;width:12px;height:12px;background:var(--green);border:2px solid var(--bg-soft);border-radius:50%;"></div></div>`;
            }

            const badge = chat.other_user?.badge ? `<span style="font-size:9px; background:var(--accent); padding:2px 6px; border-radius:10px; margin-left: 5px; color: #fff; white-space: nowrap;">${chat.other_user.badge}</span>` : '';
            const statusHtml = chat.type === 'direct' && chat.other_user
                ? `<div class="chat-item-preview" style="color: ${isOnline ? 'var(--green)' : 'var(--gray)'}">${isOnline ? 'онлайн' : 'не в сети'}</div>`
                : `<div class="chat-item-preview">${chat.type === 'group' ? 'Группа' : 'Канал'}</div>`;

            const el = document.createElement("div");
            el.className = "chat-item" + (currentChat?.id === chat.id ? " active" : "");
            el.innerHTML = `
                ${avatarHtml}
                <div class="chat-item-info">
                    <div class="chat-item-name" style="display:flex;justify-content:space-between;align-items:center;">
                        <div style="display:flex;align-items:center;overflow:hidden;white-space:nowrap;">
                            ${escapeHtml(name)} ${badge}
                        </div>
                        ${chat.unread > 0 ? `<span style="background:var(--accent);color:#fff;font-size:10px;padding:2px 6px;border-radius:10px;">${chat.unread}</span>` : ''}
                    </div>
                    ${statusHtml}
                </div>`;
            el.onclick = () => openChat(chat);
            el.oncontextmenu = (e) => {
                e.preventDefault();
                ctxTargetChatId = chat.id;
                const menu = $("chat-context-menu");
                menu.style.left = e.clientX + "px";
                menu.style.top = e.clientY + "px";
                menu.classList.remove("hidden");
            };
            list.appendChild(el);
        }
    } catch (e) { console.error(e); }
}

async function openChat(chat) {
    currentChat = chat;
    $("app-screen").classList.add("chat-open");
    document.body.classList.add("chat-open");
    $("empty-state").classList.add("hidden");
    $("active-chat").classList.remove("hidden");

    const name = chat.other_user?.display_name || chat.other_user?.username || chat.name || "Чат";
    const badge = chat.other_user?.badge ? ` <span style="font-size: 11px; background: var(--accent); padding: 2px 8px; border-radius: 10px; margin-left: 8px;">${chat.other_user.badge}</span>` : '';
    $("chat-name").innerHTML = escapeHtml(name) + badge;

    const avatarContainer = $("chat-avatar-container");
    if (avatarContainer) {
        avatarContainer.innerHTML = getAvatarHtml(chat.other_user, "avatar-sm");
    }

    const isOnline = chat.other_user && onlineUsers.has(chat.other_user.id);
    const headerStatus = $("chat-header-status");
    if (headerStatus) {
        if (chat.other_user) { headerStatus.textContent = isOnline ? "в сети" : "не в сети"; headerStatus.style.color = isOnline ? "var(--green)" : "var(--gray)"; }
        else { headerStatus.textContent = chat.type === 'group' ? "Группа" : "Канал"; headerStatus.style.color = "var(--gray)"; }
    }

    await loadMessages(); loadChats();

    const headerInfo = document.querySelector(".chat-header-info");
    if (headerInfo) {
        headerInfo.onclick = () => {
            if (!currentChat.other_user) return;
            const u = currentChat.other_user;
            $("profile-avatar").innerHTML = getAvatarHtml(u, "").replace('class="avatar"', 'class="avatar" style="width:80px;height:80px;font-size:30px;"');
            $("profile-name").textContent = u.display_name || u.username;
            $("profile-username").textContent = "@" + u.username;
            $("profile-badge").innerHTML = u.badge ? `<span class="badge custom">${u.badge}</span>` : '';
            const isOnline = onlineUsers.has(u.id);
            $("profile-status").textContent = "Статус: " + (isOnline ? "в сети" : "не в сети");
            $("profile-status").style.color = isOnline ? "var(--green)" : "var(--gray)";
            openModal("profile-modal");
        };
    }
}

// ============================================
// СООБЩЕНИЯ
// ============================================
function normalizeMessage(m, decryptedText, senderUsername) {
    return {
        id: m.id, text: decryptedText ?? "", sender_id: m.sender_id,
        sender_username: senderUsername ?? m.sender_username ?? "",
        file_id: m.file_id || null, reply_to: m.reply_to || null, created_at: m.created_at,
        is_sticker: m.is_sticker || 0
    };
}

async function loadMessages() {
    const container = $("messages"); container.innerHTML = "";
    if (!currentChat) return;
    try {
        const data = await apiRequest(`/api/messages/${currentChat.id}`);
        readersCache = {}; data.readers.forEach(r => readersCache[r.user_id] = r.last_read_at);
        messagesCache = [];

        const decrypted = [];
        for (const m of data.messages) {
            const text = await decryptText(m.content_encrypted, m.iv);
            const norm = normalizeMessage(m, text, m.sender_username);
            messagesCache.push(norm);
            decrypted.push({ m, text });
        }
        for (const { m, text } of decrypted) {
            renderMessage(text, m.sender_id === currentUser.id, m.created_at, m.id, m.reply_to, m.sender_username, m.file_id, m.is_sticker);
        }
        scrollToBottom();
        if (!isMarkingAsRead) {
            isMarkingAsRead = true;
            apiRequest("/api/chats/read", { method: "POST", body: JSON.stringify({ chat_id: currentChat.id }) }).finally(() => { isMarkingAsRead = false; });
        }
    } catch (e) { console.error(e); }
}

function renderMessage(text, isOut, timeIso, msgId, replyTo, senderUsername, fileId, isStickerFlag) {
    const row = document.createElement("div");
    row.className = `msg-row ${isOut ? "out" : "in"}`;
    row.dataset.msgId = msgId;
    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";

    const isSticker = isStickerFlag == 1;
    if (isSticker) bubble.classList.add("sticker-bubble");

    if (replyTo) {
        const replyMsg = messagesCache.find(m => m.id === replyTo);
        const replyDiv = document.createElement("div");
        replyDiv.className = "msg-reply";

        if (replyMsg) {
            const preview = replyMsg.text ? (replyMsg.text.length > 40 ? replyMsg.text.substring(0, 40) + "…" : replyMsg.text) : (replyMsg.file_id ? "📎 Файл" : "Сообщение");
            replyDiv.innerHTML = `<span class="msg-reply-author">${escapeHtml(replyMsg.sender_username || "")}</span><span class="msg-reply-text">${escapeHtml(preview)}</span>`;
            replyDiv.onclick = (e) => {
                e.stopPropagation();
                const target = document.querySelector(`[data-msg-id="${replyTo}"]`);
                if (!target) return;
                target.scrollIntoView({ behavior: "smooth", block: "center" });
                target.classList.remove("msg-highlight");
                void target.offsetWidth;
                target.classList.add("msg-highlight");
                setTimeout(() => target.classList.remove("msg-highlight"), 1200);
            };
        } else {
            replyDiv.innerHTML = `<span class="msg-reply-text" style="opacity:0.6;">Сообщение удалено</span>`;
        }
        bubble.appendChild(replyDiv);
    }

    const textContainer = document.createElement("div");
    textContainer.className = "msg-text";
    textContainer.textContent = text;
    if (text) bubble.appendChild(textContainer);

    if (fileId) {
        const fileUrl = `${currentServer.address.replace(/\/$/, "")}/api/files/${fileId}?token=${currentAccount.token}`;

        if (isSticker) {
            const img = document.createElement("img");
            img.className = "sticker-image";
            img.src = fileUrl;
            img.onclick = (e) => {
                e.stopPropagation();
                openPackByStickerId(fileId);
            };
            bubble.appendChild(img);
        } else {
            const fileBox = document.createElement("div");
            fileBox.style.cssText = "margin-top: 6px; width: 100%; max-width: 320px;";

            const img = document.createElement("img");
            img.style.cssText = "max-width: 100%; max-height: 300px; border-radius: 8px; display: block; cursor: pointer; object-fit: contain; border: 1px solid rgba(255,255,255,0.1);";
            img.src = fileUrl;

            img.onload = () => {
                fileBox.innerHTML = "";
                fileBox.style.width = "auto";
                fileBox.appendChild(img);
            };

            img.onerror = () => {
                fileBox.innerHTML = "";

                const video = document.createElement("video");
                video.src = fileUrl;
                video.controls = true;
                video.style.cssText = "max-width: 100%; max-height: 300px; border-radius: 8px; display: none;";
                video.onloadedmetadata = () => {
                    video.style.display = "block";
                    fileBox.innerHTML = "";
                    fileBox.style.width = "auto";
                    fileBox.appendChild(video);
                    video.onclick = (e) => { e.preventDefault(); openMediaViewer(fileUrl, 'video', senderUsername, text, msgId); };
                };

                const audio = document.createElement("audio");
                audio.src = fileUrl;
                audio.controls = true;
                audio.style.cssText = "width: 100%; min-width: 250px; display: none; outline: none;";
                audio.onloadedmetadata = () => {
                    audio.style.display = "block";
                    fileBox.innerHTML = "";
                    fileBox.appendChild(audio);
                };

                const docBox = document.createElement("div");
                docBox.style.cssText = "display: flex; align-items: center; gap: 12px; cursor: pointer; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);";
                docBox.innerHTML = `
                    <div style="font-size: 24px;">📄</div>
                    <div style="display: flex; flex-direction: column; overflow: hidden;">
                        <div style="font-weight: bold; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--white);">Файл</div>
                        <div style="font-size: 11px; opacity: 0.7;">Нажми, чтобы скачать</div>
                    </div>
                `;
                docBox.onclick = () => {
                    const tempA = document.createElement("a");
                    tempA.href = fileUrl + "&download=1";
                    tempA.download = "file";
                    tempA.click();
                };

                fileBox.style.width = "100%";
                fileBox.appendChild(video);
                fileBox.appendChild(audio);
                fileBox.appendChild(docBox);
            };

            img.onclick = (e) => {
                e.stopPropagation();
                openMediaViewer(fileUrl, 'image', senderUsername, text, msgId);
            };

            fileBox.appendChild(img);
            bubble.appendChild(fileBox);
        }
    }

    if (timeIso) {
        const timeWrap = document.createElement("div");
        timeWrap.className = isSticker ? "sticker-meta" : "msg-time";
        if (!isSticker) timeWrap.style.display = "inline-block";

        const time = document.createElement("span");
        time.textContent = new Date(timeIso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

        if (isOut) {
            let isRead = false;
            for (const [uid, lastRead] of Object.entries(readersCache)) if (uid !== currentUser.id && lastRead > timeIso) isRead = true;
            time.innerHTML += isRead ? ' <span style="color:var(--white); font-weight:bold;">✓✓</span>' : ' <span style="opacity:0.5;">✓</span>';
        }
        timeWrap.appendChild(time);
        bubble.appendChild(timeWrap);
    }

    bubble.onclick = (e) => {
        if (e.target.closest(".msg-reply")) return;
        if (e.target.closest("img")) return;
        if (e.target.closest("a")) return;
        if (e.target.closest("video") || e.target.closest("audio")) return;
        if (isSticker) return;

        replyingTo = { id: msgId, text: text ? text.substring(0, 40) : "", username: senderUsername };
        $("reply-preview").style.display = "flex";
        $("reply-text").textContent = text ? (text.substring(0, 40) + (text.length > 40 ? "…" : "")) : "📎 Файл";
        $("msg-input").placeholder = `Ответ ${senderUsername}...`;
        $("msg-input").focus();
    };

    bubble.oncontextmenu = (e) => {
        e.preventDefault();
        ctxTargetMsgId = msgId;

        const menu = $("msg-context-menu");
        menu.style.left = e.clientX + "px";
        menu.style.top = e.clientY + "px";
        menu.classList.remove("hidden");

        const isAuthor = senderUsername === currentUser.username;
        const isAdmin = currentChat.type !== 'direct' && currentChat.role === 'admin';
        const isDirect = currentChat.type === 'direct';

        menu.querySelector('[data-action="edit"]').style.display = isAuthor ? "block" : "none";
        menu.querySelector('[data-action="delete"]').style.display = (isAuthor || isAdmin) ? "block" : "none";
        menu.querySelector('[data-action="pin"]').style.display = (isDirect || isAdmin) ? "block" : "none";

        const dlBtn = menu.querySelector('[data-action="download"]');
        if (fileId) {
            dlBtn.style.display = "block";
            dlBtn.onclick = () => {
                const tempA = document.createElement("a");
                tempA.href = fileUrl + "&download=1";
                tempA.download = "file";
                tempA.click();
                $("msg-context-menu").classList.add("hidden");
            };
        } else {
            dlBtn.style.display = "none";
        }

        menu.querySelector('[data-action="reply"]').onclick = () => {
            replyingTo = { id: msgId, text: text ? text.substring(0, 40) : "", username: senderUsername };
            $("reply-preview").style.display = "flex";
            $("reply-text").textContent = text ? (text.substring(0, 40) + (text.length > 40 ? "…" : "")) : "📎 Файл";
            $("msg-input").focus();
            menu.classList.add("hidden");
        };
    };

    row.appendChild(bubble); $("messages").appendChild(row);
}
function scrollToBottom() { $("messages").scrollTop = $("messages").scrollHeight; }

async function sendMessage() {
    if (!currentChat) return;
    const input = $("msg-input"), text = input.value.trim();

    if (pendingFile) {
        try {
            const hash = await hashFile(pendingFile);
            const check = await apiRequest("/api/upload/check", { method: "POST", body: JSON.stringify({ hash }) });
            let fileId;
            if (check.exists) {
                fileId = check.file_id;
            } else {
                const formData = new FormData();
                formData.append("file", pendingFile); formData.append("chat_id", currentChat.id); formData.append("hash", hash);
                const uploadRes = await fetch(currentServer.address.replace(/\/$/, "") + "/api/upload", {
                    method: "POST", headers: { "Authorization": "Bearer " + currentAccount.token }, body: formData
                });
                const uploadData = await uploadRes.json();
                if (uploadData.error) throw new Error(uploadData.error);
                fileId = uploadData.file_id;
            }
            const enc = await encryptText("");
            const msg = await apiRequest("/api/messages", { method: "POST", body: JSON.stringify({ chat_id: currentChat.id, content_encrypted: enc.ciphertext, iv: enc.iv, file_id: fileId, is_sticker: 0 }) });
            messagesCache.push(normalizeMessage(msg, "", currentUser.username));
            renderMessage("", true, msg.created_at, msg.id, null, currentUser.username, fileId, 0);
            scrollToBottom(); pendingFile = null; input.value = ""; input.placeholder = "Пиши что-нибудь..."; $("file-input").value = "";
            return;
        } catch (e) { console.error(e); alert("Ошибка загрузки"); pendingFile = null; return; }
    }

    if (!text) return;
    input.value = ""; input.placeholder = "Пиши что-нибудь...";
    const currentReply = replyingTo; replyingTo = null;
    if ($("reply-preview")) $("reply-preview").style.display = "none";

    try {
        const enc = await encryptText(text);
        const body = { chat_id: currentChat.id, content_encrypted: enc.ciphertext, iv: enc.iv };
        if (currentReply) body.reply_to = currentReply.id;
        const msg = await apiRequest("/api/messages", { method: "POST", body: JSON.stringify(body) });
        messagesCache.push(normalizeMessage(msg, text, currentUser.username));
        renderMessage(text, true, msg.created_at, msg.id, msg.reply_to, currentUser.username, null, 0);
        scrollToBottom();
    } catch (e) { console.error(e); }
}

// ============================================
// ГАЛЕРЕЯ
// ============================================
function openMediaViewer(url, type, senderName, text, msgId) {
    const oldViewer = document.querySelector(".media-viewer-overlay");
    if (oldViewer) oldViewer.remove();

    const overlay = document.createElement("div");
    overlay.className = "media-viewer-overlay";

    overlay.onclick = (e) => {
        if (e.target === overlay) {
            overlay.classList.remove("active");
            setTimeout(() => overlay.remove(), 200);
        }
    };

    const closeBtn = document.createElement("button");
    closeBtn.className = "media-close-btn";
    closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
    closeBtn.onclick = () => {
        overlay.classList.remove("active");
        setTimeout(() => overlay.remove(), 200);
    };
    overlay.appendChild(closeBtn);

    const mediaEl = document.createElement(type === 'video' ? 'video' : 'img');
    mediaEl.className = "media-viewer-content";
    mediaEl.src = url;
    if (type === 'video') {
        mediaEl.controls = true;
        mediaEl.autoplay = true;
    }
    overlay.appendChild(mediaEl);

    const panel = document.createElement("div");
    panel.className = "media-viewer-panel";

    const info = document.createElement("div");
    info.className = "media-viewer-info";
    info.innerHTML = `
        <div class="media-viewer-avatar">${(senderName || "?")[0].toUpperCase()}</div>
        <div class="media-viewer-name">${escapeHtml(senderName || "Пользователь")}</div>
    `;
    panel.appendChild(info);

    const actions = document.createElement("div");
    actions.className = "media-viewer-actions";

    const gotoBtn = document.createElement("button");
    gotoBtn.className = "media-action-btn";
    gotoBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18"/><path d="m15 6 6 6-6 6"/></svg> Перейти к сообщению`;
    gotoBtn.onclick = () => {
        closeBtn.click();
        const target = document.querySelector(`[data-msg-id="${msgId}"]`);
        if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
            target.classList.remove("msg-highlight");
            void target.offsetWidth;
            target.classList.add("msg-highlight");
            setTimeout(() => target.classList.remove("msg-highlight"), 1200);
        }
    };
    actions.appendChild(gotoBtn);

    const dlBtn = document.createElement("button");
    dlBtn.className = "media-action-btn";
    dlBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Скачать`;
    dlBtn.onclick = () => {
        const tempA = document.createElement("a");
        tempA.href = url + "&download=1";
        tempA.download = "file";
        tempA.click();
    };
    actions.appendChild(dlBtn);

    panel.appendChild(actions);
    overlay.appendChild(panel);

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("active"));
}

// ============================================
// СТИКЕРЫ
// ============================================
function toggleStickers() {
    const popover = $("stickers-popover");
    if (popover.classList.contains("hidden")) {
        popover.classList.remove("hidden");
        loadStickerPacks();
    } else {
        popover.classList.add("hidden");
    }
}

async function loadStickerPacks() {
    const container = $("stickers-container");
    container.innerHTML = "<div style='color:var(--gray); text-align:center; margin-top:20px;'>Загрузка...</div>";
    try {
        const packs = await apiRequest("/api/stickers/packs");
        container.innerHTML = "";

        if (packs.length === 0) {
            container.innerHTML = "<div style='color:var(--gray); text-align:center; margin-top:20px;'>Нет стикеров. Нажми + чтобы создать пак.</div>";
            return;
        }

        for (const pack of packs) {
            const packDiv = document.createElement("div");
            packDiv.style.cssText = "margin-bottom: 20px; background: var(--bg-soft); border-radius: 12px; padding: 10px; border: 1px solid var(--border);";

            const header = document.createElement("div");
            header.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; cursor: pointer; padding: 4px; border-radius: 6px; transition: background 0.2s;";
            header.onmouseover = () => header.style.background = "rgba(255,255,255,0.05)";
            header.onmouseout = () => header.style.background = "transparent";
            header.onclick = () => openPackView(pack);

            const titleWrap = document.createElement("div");
            titleWrap.style.cssText = "font-weight: 800; font-size: 14px; color: var(--white); display: flex; align-items: center; gap: 8px;";
            titleWrap.textContent = pack.name;

            if (!pack.is_mine) {
                const subBtn = document.createElement("button");
                subBtn.innerHTML = "➕";
                subBtn.title = "Добавить себе";
                subBtn.style.cssText = "background: transparent; border: none; color: var(--accent); cursor: pointer; font-size: 16px; padding: 0;";
                subBtn.onclick = async (e) => {
                    e.stopPropagation();
                    await apiRequest("/api/stickers/packs/subscribe", { method: "POST", body: JSON.stringify({ pack_id: pack.id }) });
                    loadStickerPacks();
                };
                titleWrap.appendChild(subBtn);
            }
            header.appendChild(titleWrap);

            if (pack.is_mine) {
                const delBtn = document.createElement("button");
                delBtn.innerHTML = "✕";
                delBtn.title = "Удалить пак";
                delBtn.style.cssText = "background: transparent; border: none; color: var(--red); cursor: pointer; font-size: 16px; font-weight: bold; padding: 5px;";
                delBtn.onclick = async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Удалить пак "${pack.name}"?`)) return;
                    await apiRequest("/api/stickers/packs/delete", { method: "POST", body: JSON.stringify({ pack_id: pack.id }) });
                    loadStickerPacks();
                };
                header.appendChild(delBtn);
            }
            packDiv.appendChild(header);

            const grid = document.createElement("div");
            grid.className = "sticker-pack-grid";

            const previewStickers = pack.stickers.slice(0, 8);
            for (const st of previewStickers) {
                const imgWrap = document.createElement("div");
                imgWrap.className = "sticker-item";

                const img = document.createElement("img");
                fetch(`${currentServer.address.replace(/\/$/, "")}/api/files/${st.file_id}`, { headers: { "Authorization": "Bearer " + currentAccount.token } })
                    .then(r => r.blob()).then(b => {
                        if (b.size > 0) img.src = URL.createObjectURL(b);
                    }).catch(()=>{});

                imgWrap.onclick = () => {
                    $("stickers-popover").classList.add("hidden");
                    sendSticker(st.file_id);
                };
                imgWrap.appendChild(img);
                grid.appendChild(imgWrap);
            }

            packDiv.appendChild(grid);
            container.appendChild(packDiv);
        }
    } catch (e) { console.error(e); container.innerHTML = "Ошибка загрузки."; }
}

async function openPackByStickerId(fileId) {
    try {
        const packs = await apiRequest("/api/stickers/packs");
        for (const pack of packs) {
            if (pack.stickers.some(s => s.file_id === fileId)) {
                openPackView(pack);
                return;
            }
        }
    } catch(e) {}
}

function openPackView(pack) {
    $("stickers-popover").classList.add("hidden");

    const modal = document.createElement("div");
    modal.className = "modal";
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };

    modal.innerHTML = `
        <div class="sticker-pack-view-modal">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid var(--border); padding-bottom:10px;">
                <div style="font-size:18px; font-weight:900;">${escapeHtml(pack.name)}</div>
                <button class="modal-close" style="position:static; width:32px; height:32px;">✕</button>
            </div>
            <div class="sticker-pack-grid" id="pack-view-grid" style="flex:1; overflow-y:auto; align-content: start; padding-right:5px; gap: 12px;">
                <!-- Сюда рендерятся все стикеры -->
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector(".modal-close").onclick = () => modal.remove();

    const grid = modal.querySelector("#pack-view-grid");

    pack.stickers.forEach(st => {
        const imgWrap = document.createElement("div");
        imgWrap.className = "sticker-item";
        imgWrap.style.background = "var(--bg-soft)";
        imgWrap.style.borderRadius = "8px";
        const img = document.createElement("img");

        fetch(`${currentServer.address.replace(/\/$/, "")}/api/files/${st.file_id}`, { headers: { "Authorization": "Bearer " + currentAccount.token } })
            .then(r => r.blob()).then(b => {
                if (b.size > 0) img.src = URL.createObjectURL(b);
            }).catch(()=>{});

        imgWrap.onclick = () => {
            modal.remove();
            sendSticker(st.file_id);
        };
        imgWrap.appendChild(img);
        grid.appendChild(imgWrap);
    });

    if (pack.is_mine) {
        const addBtn = document.createElement("div");
        addBtn.className = "sticker-item";
        addBtn.style.border = "2px dashed var(--border)";
        addBtn.innerHTML = "+";
        addBtn.style.fontSize = "24px";
        addBtn.style.color = "var(--gray)";
        addBtn.onclick = () => uploadStickerToPack(pack.id, () => { modal.remove(); loadStickerPacks(); });
        grid.appendChild(addBtn);
    }
}

function uploadStickerToPack(packId, onSuccess) {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "none";
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const hash = await hashFile(file);
        const formData = new FormData();
        formData.append("sticker", file);
        formData.append("pack_id", packId);
        formData.append("hash", hash);

        try {
            await fetch(currentServer.address.replace(/\/$/, "") + "/api/stickers/add", {
                method: "POST", headers: { "Authorization": "Bearer " + currentAccount.token }, body: formData
            });
            if (onSuccess) onSuccess();
        } catch(e) { alert("Ошибка загрузки стикера"); }
    };
    fileInput.click();
}

async function sendSticker(fileId) {
    if (!currentChat) return;
    try {
        const enc = await encryptText("");
        const msg = await apiRequest("/api/messages", {
            method: "POST",
            body: JSON.stringify({ chat_id: currentChat.id, content_encrypted: enc.ciphertext, iv: enc.iv, file_id: fileId, is_sticker: 1 })
        });
        messagesCache.push(normalizeMessage(msg, "", currentUser.username));
        renderMessage("", true, msg.created_at, msg.id, null, currentUser.username, fileId, 1);
        scrollToBottom();
    } catch (e) { console.error(e); }
}

// ============================================
// WEBSOCKET
// ============================================
function subscribeWebSocket() {
    if (currentChannel) currentChannel.close();
    if (!currentServer || !currentAccount) return;
    const wsUrl = currentServer.address.replace(/^http/, "ws").replace(/\/$/, "") + "/ws?token=" + encodeURIComponent(currentAccount.token);
    try {
        currentChannel = new WebSocket(wsUrl);
        currentChannel.onmessage = async (e) => {
            const data = JSON.parse(e.data);
            if (data.type === "message" && data.message.chat_id === currentChat?.id && data.message.sender_id !== currentUser.id) {
                const decrypted = await decryptText(data.message.content_encrypted, data.message.iv);
                const senderName = currentChat.other_user?.username || "User";
                messagesCache.push(normalizeMessage(data.message, decrypted, senderName));
                renderMessage(decrypted, false, data.message.created_at, data.message.id, data.message.reply_to, senderName, data.message.file_id, data.message.is_sticker || 0);
                scrollToBottom();
                if (!isMarkingAsRead) {
                    isMarkingAsRead = true;
                    apiRequest("/api/chats/read", { method: "POST", body: JSON.stringify({ chat_id: currentChat.id }) }).finally(() => { isMarkingAsRead = false; });
                }
                if (window.flashApp && window.flashApp.showNotification && (document.hidden || !document.hasFocus())) {
                    window.flashApp.showNotification({ title: "Flash", body: "Новое сообщение", chat_id: currentChat.id });
                }
            }
            if (data.type === "message_deleted") {
                messagesCache = messagesCache.filter(m => m.id !== data.msg_id);
                const el = document.querySelector(`[data-msg-id="${data.msg_id}"]`);
                if (el) el.remove();
            }
            if (data.type === "message_edited") {
                const newText = await decryptText(data.content_encrypted, data.iv);
                const el = document.querySelector(`[data-msg-id="${data.msg_id}"] .msg-text`);
                if (el) el.textContent = newText;
                const cached = messagesCache.find(x => x.id === data.msg_id);
                if (cached) cached.text = newText;
            }
            if (data.type === "chat_deleted") {
                if (currentChat?.id === data.chat_id) {
                    currentChat = null;
                    $("empty-state").classList.remove("hidden");
                    $("active-chat").classList.add("hidden");
                }
                loadChats();
            }
            if (data.type === "broadcast") { alert("Системное сообщение: " + data.text); }
            if (data.type === "read") { readersCache[data.user_id] = Date.now(); }
            if (data.type === "presence") {
                if (data.status === "online") onlineUsers.add(data.user_id); else onlineUsers.delete(data.user_id);
                loadChats();
                if (currentChat?.other_user?.id === data.user_id) {
                    const isOnline = data.status === "online";
                    const headerStatus = $("chat-header-status");
                    if (headerStatus) { headerStatus.textContent = isOnline ? "в сети" : "не в сети"; headerStatus.style.color = isOnline ? "var(--green)" : "var(--gray)"; }
                }
            }
        };
        currentChannel.onclose = () => setTimeout(() => { if (currentChat) subscribeWebSocket(); }, 3000);
    } catch (e) {}
}

// ============================================
// УТИЛИТЫ И ИВЕНТЫ
// ============================================
function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function openModal(id) { $(id)?.classList.remove("hidden"); }
function closeModal(id) { $(id)?.classList.add("hidden"); }

function switchSettingsSection(section) {
    document.querySelectorAll(".settings-nav[data-section]").forEach((el) => el.classList.toggle("active", el.dataset.section === section));
    document.querySelectorAll(".settings-section").forEach((el) => el.classList.toggle("active", el.dataset.section === section));

    if (section === "profile" && currentUser) {
        $("settings-username").value = currentUser.username || "";
        $("settings-display-name").value = currentUser.display_name || "";
        const preview = $("settings-avatar-preview");
        if (currentUser.avatar_url) {
            preview.innerHTML = `<img src="${currentServer.address.replace(/\/$/, "")}${currentUser.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            preview.textContent = (currentUser.display_name || currentUser.username || "?")[0].toUpperCase();
        }
    }
    if (section === "servers") {
        renderServersList();
    }
    if (section === "personalization") {
        renderPersonalizationPickers();
    }
}

// ============================================
// СЕРВЕРА
// ============================================
async function renderServersList() {
    const list = $("servers-list");
    const mobileList = $("mobile-servers-list");
    const targets = [list, mobileList].filter(Boolean);
    for (const el of targets) el.innerHTML = "";

    if (state.servers.length === 0) {
        for (const el of targets) el.innerHTML = `<div style="text-align:center;color:var(--gray);padding:20px;">Нет серверов</div>`;
        return;
    }

    for (const server of state.servers) {
        const status = await checkServerInfo(server);
        const statusText = {
            online: "✔ Сервер доступен",
            offline: "✕ Сервер недоступен",
            wrong: "⚠ Сервер ответил неправильные данные",
        }[status.status];

        const name = status.info?.name || "Неизвестный сервер";

        for (const el of targets) {
            const item = document.createElement("div");
            item.className = "server-item";
            if (server.id === state.active_server_id) item.classList.add("active");

            item.innerHTML = `
                <div class="server-dot ${status.status}"></div>
                <div class="server-item-info">
                    <div class="server-item-name">${escapeHtml(name)}</div>
                    <div class="server-item-addr">${escapeHtml(server.address)}</div>
                    <div class="server-item-status ${status.status}">${statusText}</div>
                </div>
                <button class="server-item-menu" data-server-id="${server.id}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
                    </svg>
                </button>
            `;

            item.addEventListener("click", async (e) => {
                if (e.target.closest(".server-item-menu")) return;
                await selectServer(server.id);
            });

            item.querySelector(".server-item-menu").addEventListener("click", (e) => {
                e.stopPropagation();
                openServerMenu(server.id);
            });

            el.appendChild(item);
        }
    }
}

async function selectServer(serverId) {
    state.active_server_id = serverId;
    saveState();
    currentServer = getActiveServer();
    currentAccount = currentServer?.account || null;
    currentUser = currentAccount?.user || null;

    if (currentAccount) {
        await connectToCurrentServer();
    }

    closeModal("settings-modal");
    closeMobileSettings();
    updateAuthServerInfo();

    if (currentUser) {
        await showApp();
    } else {
        await showAuth();
    }
}

async function connectToCurrentServer() {
    if (!currentServer) return false;
    const result = await connectToServer(currentServer);
    if (result.status !== "online") {
        connectToken = null;
        return false;
    }
    connectToken = result.connect_token;
    return true;
}

function openServerMenu(serverId) {
    const server = state.servers.find((s) => s.id === serverId);
    if (!server) return;

    const modal = $("server-menu-modal");
    const title = $("server-menu-title");
    const body = $("server-menu-body");

    title.textContent = "Сервер";
    body.innerHTML = "";

    (async () => {
        const status = await checkServerInfo(server);

        const nameField = document.createElement("div");
        nameField.className = "server-menu-field";
        nameField.innerHTML = `
            <div class="server-menu-label">Имя сервера</div>
            <div class="server-menu-value">${escapeHtml(status.info?.name || "—")}</div>
        `;
        body.appendChild(nameField);

        const descField = document.createElement("div");
        descField.className = "server-menu-field";
        descField.innerHTML = `
            <div class="server-menu-label">Описание</div>
            <div class="server-menu-value">${escapeHtml(status.info?.description || "—")}</div>
        `;
        body.appendChild(descField);

        const regField = document.createElement("div");
        regField.className = "server-menu-field";
        const regText = status.info?.registration_open
            ? "Можно зарегистрировать новый аккаунт"
            : "Нельзя зарегистрировать новый аккаунт";
        regField.innerHTML = `
            <div class="server-menu-label">Регистрация</div>
            <div class="server-menu-value">${regText}</div>
        `;
        body.appendChild(regField);

        const addrField = document.createElement("div");
        addrField.className = "server-menu-field";
        addrField.innerHTML = `
            <div class="server-menu-label">Адрес сервера</div>
            <div class="server-menu-value editable mono">
                <input type="text" value="${escapeHtml(server.address)}" id="edit-server-address">
            </div>
        `;
        body.appendChild(addrField);

        const pwdField = document.createElement("div");
        pwdField.className = "server-menu-field";
        pwdField.innerHTML = `
            <div class="server-menu-label">Пароль сервера</div>
            <div class="server-menu-value editable mono">
                <input type="text" value="${escapeHtml(server.password || "")}" id="edit-server-password">
            </div>
        `;
        body.appendChild(pwdField);

        const saveBtn = document.createElement("button");
        saveBtn.className = "btn-primary btn-full";
        saveBtn.textContent = "Сохранить изменения";
        saveBtn.style.marginTop = "8px";
        saveBtn.addEventListener("click", () => {
            const newAddr = $("edit-server-address").value.trim();
            const newPwd = $("edit-server-password").value;
            if (newAddr) server.address = newAddr.replace(/\/$/, "");
            server.password = newPwd;
            saveState();
            closeModal("server-menu-modal");
            renderServersList();
            updateAuthServerInfo();
        });
        body.appendChild(saveBtn);

        const delBtn = document.createElement("div");
        delBtn.className = "server-menu-danger";
        delBtn.textContent = "Удалить сервер";
        delBtn.addEventListener("click", () => {
            if (!confirm("Удалить этот сервер из списка?")) return;
            state.servers = state.servers.filter((s) => s.id !== serverId);
            if (state.active_server_id === serverId) {
                state.active_server_id = state.servers[0]?.id || null;
            }
            saveState();
            closeModal("server-menu-modal");
            renderServersList();
            updateAuthServerInfo();
        });
        body.appendChild(delBtn);

        modal.classList.remove("hidden");
    })();
}

// ============================================
// МОБИЛЬНЫЕ НАСТРОЙКИ И НАВИГАЦИЯ
// ============================================
function loadMobileSettings() {
    if (!currentUser) return;
    $("mobile-settings-name").textContent = currentUser.display_name || currentUser.username;
    $("mobile-settings-username").textContent = "@" + currentUser.username;
    $("mobile-input-username").value = currentUser.username || "";
    $("mobile-input-display").value = currentUser.display_name || "";

    const avatarEl = $("mobile-settings-avatar");
    if (currentUser.avatar_url) {
        avatarEl.innerHTML = `<img src="${currentServer.address.replace(/\/$/, "")}${currentUser.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
        avatarEl.textContent = (currentUser.display_name || currentUser.username || "?")[0].toUpperCase();
    }

    $("mobile-settings-save").onclick = async () => {
        const username = $("mobile-input-username").value.trim().toLowerCase();
        const displayName = $("mobile-input-display").value.trim();
        if (!username) return alert("Username не может быть пустым");

        try {
            const result = await apiRequest("/api/profile", { method: "POST", body: JSON.stringify({ username, display_name: displayName }) });
            currentUser = result.user;
            currentServer.account.user = result.user;
            saveState();
            alert("Сохранено!");
            loadMobileSettings();
            loadChats();
        } catch (e) { alert("Ошибка: " + e.message); }
    };
}

function showMobileSubScreen(id) {
    hideMobileSubScreens();
    const el = $(id);
    if (el) {
        el.classList.remove("closing");
        el.classList.add("active");
    }
}

function hideMobileSubScreens() {
    document.querySelectorAll(".mobile-sub-screen").forEach(el => {
        if (el.classList.contains("active")) {
            el.classList.remove("active");
            el.classList.add("closing");
            setTimeout(() => {
                el.classList.remove("closing");
            }, 250);
        }
    });
}

function closeMobileSettings() {
    const settingsScreen = $("mobile-settings-screen");
    if (settingsScreen && settingsScreen.classList.contains("active")) {
        settingsScreen.classList.remove("active");
        settingsScreen.classList.add("closing");
        setTimeout(() => {
            settingsScreen.classList.remove("closing");
        }, 250);
    }
    hideMobileSubScreens();
}

function bindEvents() {
    $("sticker-toggle-btn")?.addEventListener("click", toggleStickers);
    $("stickers-close-btn")?.addEventListener("click", () => $("stickers-popover").classList.add("hidden"));

    $("btn-create-pack")?.addEventListener("click", async () => {
        const name = prompt("Введите название для нового стикер-пака:");
        if (!name || !name.trim()) return;

        const btn = $("btn-create-pack");
        btn.disabled = true; btn.textContent = "...";
        try {
            await apiRequest("/api/stickers/packs", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
            loadStickerPacks();
        } catch(e) { alert("Ошибка создания пака"); }
        btn.disabled = false; btn.textContent = "+";
    });

    $("attach-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        const isNative = window.Capacitor && window.Capacitor.isNativePlatform();
        if (isNative) {
            $("attach-menu").classList.toggle("hidden");
        } else {
            $("file-input").click();
        }
    });

    $("attach-file-btn")?.addEventListener("click", () => {
        $("attach-menu").classList.add("hidden");
        $("file-input").click();
    });

    $("attach-gallery-btn")?.addEventListener("click", () => {
        $("attach-menu").classList.add("hidden");
        $("file-input").accept = "image/*,video/*";
        $("file-input").click();
    });

    $("attach-camera-btn")?.addEventListener("click", () => {
        $("attach-menu").classList.add("hidden");
        $("camera-input").click();
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest(".attach-menu") && !e.target.closest("#attach-btn")) {
            $("attach-menu")?.classList.add("hidden");
        }
    });

    $("file-input")?.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 50 * 1024 * 1024) { alert("Файл слишком большой (макс 50 МБ)"); return; }
        pendingFile = file;
        $("msg-input").placeholder = `Файл: ${file.name} (нажми Enter)`;
    });

    $("camera-input")?.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 50 * 1024 * 1024) { alert("Файл слишком большой (макс 50 МБ)"); return; }
        pendingFile = file;
        $("msg-input").placeholder = `Снимок: ${file.name} (нажми Enter)`;
    });

    // Мобильная навигация
    $("nav-chats")?.addEventListener("click", () => {
        $("nav-chats").classList.add("active");
        $("nav-settings").classList.remove("active");
        closeMobileSettings();
        $("app-screen").classList.remove("chat-open");
        document.body.classList.remove("chat-open");
    });

    $("nav-settings")?.addEventListener("click", () => {
        $("nav-settings").classList.add("active");
        $("nav-chats").classList.remove("active");
        hideMobileSubScreens();
        const settingsScreen = $("mobile-settings-screen");
        if (settingsScreen) {
            settingsScreen.classList.remove("closing");
            settingsScreen.classList.add("active");
        }
        loadMobileSettings();
    });

    $("mobile-avatar-input")?.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append("avatar", file);
        try {
            const uploadRes = await fetch(currentServer.address.replace(/\/$/, "") + "/api/profile/avatar", {
                method: "POST", headers: { "Authorization": "Bearer " + currentAccount.token }, body: formData
            });
            const uploadData = await uploadRes.json();
            if (uploadData.avatar_url) {
                currentUser.avatar_url = uploadData.avatar_url;
                currentServer.account.user.avatar_url = uploadData.avatar_url;
                saveState();
                loadMobileSettings();
                loadChats();
            }
        } catch (e) { alert("Ошибка загрузки аватарки"); }
    });

    // Кнопки разделов мобильных настроек
    document.querySelectorAll(".mobile-section-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const section = btn.dataset.mobileSection;
            if (section === "servers") {
                renderServersList();
                showMobileSubScreen("mobile-servers-screen");
            } else if (section === "about") {
                showMobileSubScreen("mobile-about-screen");
            } else if (section === "personalization") {
                renderPersonalizationPickers();
                showMobileSubScreen("mobile-personalization-screen");
            }
        });
    });

    // Назад из под-экранов
    document.querySelectorAll(".mobile-sub-back").forEach(btn => {
        btn.addEventListener("click", () => {
            const backId = btn.dataset.back;
            hideMobileSubScreens();
            if (backId) {
                const backEl = $(backId);
                if (backEl) {
                    backEl.classList.remove("closing");
                    backEl.classList.add("active");
                }
            }
        });
    });

    $("mobile-btn-logout")?.addEventListener("click", () => {
        if (!confirm("Выйти из аккаунта?")) return;
        currentAccount = null; currentUser = null; if (currentServer) currentServer.account = null;
        saveState(); if (currentChannel) currentChannel.close(); stopChatPolling(); showAuth();
    });

    $("mobile-add-server-btn")?.addEventListener("click", () => {
        closeModal("mobile-servers-screen");
        $("add-server-address").value = "";
        $("add-server-password").value = "";
        $("add-server-status").textContent = "";
        openModal("add-server-modal");
    });

    $("server-btn-auth")?.addEventListener("click", () => {
        if (window.innerWidth <= 768) {
            $("nav-settings")?.click();
        } else {
            switchSettingsSection("servers");
            openModal("settings-modal");
        }
    });
    $("settings-btn")?.addEventListener("click", () => {
        if (window.innerWidth <= 768) {
            $("nav-settings")?.click();
        } else {
            switchSettingsSection("profile");
            openModal("settings-modal");
        }
    });
    $("settings-close")?.addEventListener("click", () => closeModal("settings-modal"));
    document.querySelectorAll(".settings-nav[data-section]").forEach((btn) => btn.addEventListener("click", () => switchSettingsSection(btn.dataset.section)));
    $("settings-profile-save")?.addEventListener("click", saveProfile);

    $("profile-avatar-input-desktop")?.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { alert("Аватарка слишком большая (макс 5 МБ)"); return; }
        const formData = new FormData();
        formData.append("avatar", file);
        try {
            const uploadRes = await fetch(currentServer.address.replace(/\/$/, "") + "/api/profile/avatar", {
                method: "POST", headers: { "Authorization": "Bearer " + currentAccount.token }, body: formData
            });
            const uploadData = await uploadRes.json();
            if (uploadData.avatar_url) {
                currentUser.avatar_url = uploadData.avatar_url;
                currentServer.account.user.avatar_url = uploadData.avatar_url;
                saveState();
                $("settings-avatar-preview").innerHTML = `<img src="${currentServer.address.replace(/\/$/, "")}${uploadData.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                loadChats();
            }
        } catch (e) { alert("Ошибка загрузки аватарки"); }
    });

    $("add-server-btn")?.addEventListener("click", () => {
        closeModal("settings-modal");
        $("add-server-address").value = "";
        $("add-server-password").value = "";
        $("add-server-status").textContent = "";
        openModal("add-server-modal");
    });

    $("add-server-close")?.addEventListener("click", () => {
        closeModal("add-server-modal");
        if (window.innerWidth > 768) {
            openModal("settings-modal");
        } else {
            $("mobile-servers-screen")?.classList.add("active");
        }
    });

    $("add-server-submit")?.addEventListener("click", async () => {
        const addr = $("add-server-address").value.trim();
        const pwd = $("add-server-password").value;
        const status = $("add-server-status");

        if (!addr) { status.textContent = "Введи адрес"; return; }

        let cleanAddr = addr.replace(/\/$/, "");
        if (!/^https?:\/\//i.test(cleanAddr)) cleanAddr = "http://" + cleanAddr;

        status.textContent = "Проверяем...";
        const testServer = { address: cleanAddr, password: pwd };
        const check = await checkServerInfo(testServer);

        if (check.status === "offline") { status.textContent = "Сервер недоступен"; return; }
        if (check.status === "wrong") { status.textContent = "Сервер ответил неправильные данные"; return; }

        if (check.info.password_required) {
            const conn = await connectToServer(testServer);
            if (conn.status !== "online") { status.textContent = "Неверный пароль сервера"; return; }
        }

        const newServer = { id: crypto.randomUUID(), address: cleanAddr, password: pwd, account: null };
        state.servers.push(newServer);
        saveState();

        closeModal("add-server-modal");
        renderServersList();
        if (window.innerWidth > 768) {
            openModal("settings-modal");
            switchSettingsSection("servers");
        } else {
            $("mobile-servers-screen")?.classList.add("active");
        }
    });

    $("server-menu-close")?.addEventListener("click", () => closeModal("server-menu-modal"));

    $("tab-login")?.addEventListener("click", () => setAuthMode("login"));
    $("tab-register")?.addEventListener("click", () => setAuthMode("register"));
    $("auth-submit")?.addEventListener("click", doAuth);
    $("auth-password")?.addEventListener("keydown", (e) => { if (e.key === "Enter") doAuth(); });

    $("send-btn")?.addEventListener("click", sendMessage);
    $("msg-input")?.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

    $("cancel-reply")?.addEventListener("click", () => {
        replyingTo = null; $("reply-preview").style.display = "none"; $("msg-input").placeholder = "Пиши что-нибудь...";
    });

    const resetAll = () => {
        if (!confirm("ВНИМАНИЕ! Все настройки и сохраненные аккаунты будут удалены. Продолжить?")) return;
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(PERSONALIZATION_KEY);
        if (currentChannel) { try { currentChannel.close(); } catch (e) {} }
        location.reload();
    };
    $("btn-reset-all")?.addEventListener("click", resetAll);
    $("btn-reset-all-desktop")?.addEventListener("click", resetAll);

    $("new-chat-btn")?.addEventListener("click", () => {
        const choice = prompt("Введите username для личного чата ИЛИ напишите 'группа' для создания группы:");
        if (!choice) return;
        if (choice.toLowerCase() === 'группа') {
            const gName = prompt("Введите название группы:");
            if (!gName) return;
            apiRequest("/api/chats/group", { method: "POST", body: JSON.stringify({ name: gName, type: 'group' }) }).then(async res => {
                await loadChats();
                const chat = chatsCache.find(c => c.id === res.chat_id);
                if (chat) openChat(chat);
            }).catch(() => alert("Ошибка создания группы"));
        } else {
            $("new-chat-username").value = choice;
            createNewChat();
        }
    });

    $("new-chat-close")?.addEventListener("click", () => closeModal("new-chat-modal"));
    $("new-chat-submit")?.addEventListener("click", createNewChat);

    $("back-btn")?.addEventListener("click", () => {
        $("app-screen").classList.remove("chat-open");
        document.body.classList.remove("chat-open");
    });

    $("logout-btn")?.addEventListener("click", () => {
        if (!confirm("Выйти из аккаунта?")) return;
        currentAccount = null; currentUser = null; if (currentServer) currentServer.account = null;
        saveState(); if (currentChannel) currentChannel.close(); stopChatPolling(); showAuth();
    });

    document.querySelectorAll('#msg-context-menu .ctx-item').forEach(btn => {
        btn.addEventListener("click", async () => {
            const action = btn.dataset.action;
            if (action === "download") return;

            $("msg-context-menu").classList.add("hidden");
            if (!ctxTargetMsgId) return;

            if (action === "reply") {
                const cached = messagesCache.find(m => m.id === ctxTargetMsgId);
                replyingTo = { id: ctxTargetMsgId, text: cached?.text || "", username: cached?.sender_username || "Вы" };
                $("reply-preview").style.display = "flex";
                $("reply-text").textContent = cached?.text ? (cached.text.substring(0, 40) + (cached.text.length > 40 ? "…" : "")) : "📎 Файл";
                $("msg-input").focus();
            }
            if (action === "delete") {
                if (!confirm("Удалить сообщение?")) return;
                await apiRequest("/api/messages/delete", { method: "POST", body: JSON.stringify({ msg_id: ctxTargetMsgId }) });
                messagesCache = messagesCache.filter(m => m.id !== ctxTargetMsgId);
                const msgEl = document.querySelector(`[data-msg-id="${ctxTargetMsgId}"]`);
                if (msgEl) msgEl.remove();
            }
            if (action === "edit") {
                const newText = prompt("Новый текст:");
                if (!newText) return;
                const enc = await encryptText(newText);
                await apiRequest("/api/messages/edit", { method: "POST", body: JSON.stringify({ msg_id: ctxTargetMsgId, content_encrypted: enc.ciphertext, iv: enc.iv }) });
                const msgEl = document.querySelector(`[data-msg-id="${ctxTargetMsgId}"] .msg-text`);
                if (msgEl) msgEl.textContent = newText;
                const cached = messagesCache.find(m => m.id === ctxTargetMsgId);
                if (cached) cached.text = newText;
            }
            if (action === "pin") {
                await apiRequest("/api/messages/pin", { method: "POST", body: JSON.stringify({ msg_id: ctxTargetMsgId, pin: true }) });
                alert("Сообщение закреплено");
            }
            ctxTargetMsgId = null;
        });
    });

    document.querySelectorAll('#chat-context-menu .ctx-item').forEach(btn => {
        btn.addEventListener("click", async () => {
            const action = btn.dataset.action;
            $("chat-context-menu").classList.add("hidden");
            if (!ctxTargetChatId) return;

            if (action === "delete_chat") {
                if (!confirm("Удалить чат? Переписка сотрется навсегда.")) return;
                await apiRequest("/api/chats/delete", { method: "POST", body: JSON.stringify({ chat_id: ctxTargetChatId }) });
                location.reload();
            }
            if (action === "pin_chat") {
                await apiRequest("/api/chats/pin", { method: "POST", body: JSON.stringify({ chat_id: ctxTargetChatId, pin: true }) });
                loadChats();
            }
            if (action === "block_chat") {
                await apiRequest("/api/chats/block", { method: "POST", body: JSON.stringify({ chat_id: ctxTargetChatId, block: true }) });
                alert("Чат заблокирован");
                loadChats();
            }
            if (action === "report_chat") {
                window.open("https://flash-msg.site/support.html", "_blank");
            }
            ctxTargetChatId = null;
        });
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest(".context-menu")) {
            $("msg-context-menu").classList.add("hidden");
            $("chat-context-menu").classList.add("hidden");
        }
    });

    $("profile-close")?.addEventListener("click", () => closeModal("profile-modal"));

    // Персонализация (кастомный HEX)
    const applyCustomWallpaper = (inputId) => {
        const input = $(inputId);
        if (!input) return;
        let hex = input.value.trim();
        if (!hex) return;
        if (!hex.startsWith("#")) hex = "#" + hex;
        if (!/^#[0-9a-fA-F]{6}$/.test(hex)) { alert("Введи цвет в формате #RRGGBB"); return; }
        personalization.wallpaper = "custom";
        personalization.customWallpaper = hex;
        savePersonalization();
        applyPersonalization();
        renderPersonalizationPickers();
    };
    $("wallpaper-custom-apply")?.addEventListener("click", () => applyCustomWallpaper("wallpaper-custom-hex"));
    $("wallpaper-custom-apply-desktop")?.addEventListener("click", () => applyCustomWallpaper("wallpaper-custom-hex-desktop"));

    const resetPersonalization = () => {
        if (!confirm("Сбросить персонализацию?")) return;
        personalization = { accent: "#ff2d6f", wallpaper: "default", customWallpaper: "" };
        savePersonalization();
        applyPersonalization();
        renderPersonalizationPickers();
    };
    $("personalization-reset")?.addEventListener("click", resetPersonalization);
    $("personalization-reset-desktop")?.addEventListener("click", resetPersonalization);

    if (window.flashApp && window.flashApp.onOpenChatNotification) {
        window.flashApp.onOpenChatNotification((chatId) => {
            const chat = chatsCache.find(c => c.id === chatId);
            if (chat) openChat(chat);
        });
    }
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

async function boot() {
    loadPersonalization();
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
