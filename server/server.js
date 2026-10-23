const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const CONFIG_PATH = path.join(__dirname, "server.json");
if (!fs.existsSync(CONFIG_PATH)) {
    console.error("ERROR: server.json not found!");
    process.exit(1);
}

const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
const PORT = CONFIG.port || 8080;
const SERVER_PASSWORD = CONFIG.password || "";
const REGISTRATION_OPEN = CONFIG.registration_open !== false;
const JWT_SECRET = CONFIG.jwt_secret || crypto.randomBytes(32).toString("hex");
const CONNECT_SECRET = CONFIG.connect_secret || crypto.randomBytes(32).toString("hex");

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "flash.db"));
db.pragma("journal_mode = WAL");

// Создаем таблицы если их нет (бд тупит иногда)
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL, avatar_url TEXT, bio TEXT DEFAULT '',
        created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY, name TEXT, type TEXT DEFAULT 'direct',
        created_by TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_members (
        chat_id TEXT NOT NULL, user_id TEXT NOT NULL, joined_at INTEGER NOT NULL,
        last_read_at INTEGER DEFAULT 0, PRIMARY KEY (chat_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, sender_id TEXT NOT NULL,
        content_encrypted TEXT NOT NULL, iv TEXT NOT NULL, reply_to TEXT,
        created_at INTEGER NOT NULL, is_deleted INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);
`);

try {
    // миграции для старых бд
    const chatsInfo = db.prepare("PRAGMA table_info(chats)").all();
    if (!chatsInfo.some(c => c.name === "type")) db.exec("ALTER TABLE chats ADD COLUMN type TEXT DEFAULT 'direct'");
    
    const membersInfo = db.prepare("PRAGMA table_info(chat_members)").all();
    if (!membersInfo.some(c => c.name === "last_read_at")) db.exec("ALTER TABLE chat_members ADD COLUMN last_read_at INTEGER DEFAULT 0");
    
    const messagesInfo = db.prepare("PRAGMA table_info(messages)").all();
    if (!messagesInfo.some(c => c.name === "reply_to")) db.exec("ALTER TABLE messages ADD COLUMN reply_to TEXT");
} catch (e) { 
    console.log("Миграция не требуется"); 
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// статика чтоб клиент отдавался
app.use(express.static(__dirname)); 
app.use(express.static(path.join(__dirname, "public")));

app.get("/app", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "web.html"));
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

function uuid() { return crypto.randomUUID(); }

function getUserById(id) { 
    return db.prepare("SELECT id, username, display_name, avatar_url, bio, created_at, last_seen FROM users WHERE id = ?").get(id); 
}

function getUserByUsername(u) { 
    return db.prepare("SELECT * FROM users WHERE username = ?").get(u.toLowerCase()); 
}

function auth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) return res.status(401).json({ error: "no_token" });
    try {
        req.userId = jwt.verify(header.slice(7), JWT_SECRET).userId;
        db.prepare("UPDATE users SET last_seen = ? WHERE id = ?").run(Date.now(), req.userId);
        next();
    } catch (e) { return res.status(401).json({ error: "invalid_token" }); }
}

function connAuth(req, res, next) {
    if (!SERVER_PASSWORD) return next(); 
    const header = req.headers["x-connect-token"];
    if (!header) return res.status(401).json({ error: "no_connect_token" });
    try { jwt.verify(header, CONNECT_SECRET); next(); } 
    catch (e) { return res.status(401).json({ error: "invalid_connect_token" }); }
}

// API
app.get("/api/server-info", (req, res) => res.json({ name: CONFIG.server_name || "Flash", password_required: SERVER_PASSWORD.length > 0, registration_open: REGISTRATION_OPEN }));

app.post("/api/connect", (req, res) => {
    if (SERVER_PASSWORD.length > 0 && (req.body || {}).password !== SERVER_PASSWORD) return res.status(401).json({ error: "invalid_server_password" });
    res.json({ connect_token: jwt.sign({ type: "connect" }, CONNECT_SECRET, { expiresIn: "30d" }) });
});

app.post("/api/register", connAuth, async (req, res) => {
    if (!REGISTRATION_OPEN) return res.status(403).json({ error: "registration_closed" });
    const { username, password, display_name } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "missing_fields" });
    
    const clean = username.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (clean.length < 3) return res.status(400).json({ error: "username_too_short" });
    if (getUserByUsername(clean)) return res.status(400).json({ error: "username_taken" });

    const id = uuid(); const hash = await bcrypt.hash(password, 10); const now = Date.now();
    db.prepare(`INSERT INTO users (id, username, display_name, password_hash, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)`).run(id, clean, display_name || clean, hash, now, now);
    res.json({ token: jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: "365d" }), user: getUserById(id) });
});

app.post("/api/login", connAuth, async (req, res) => {
    const { username, password } = req.body || {};
    const user = getUserByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "invalid_credentials" });
    db.prepare("UPDATE users SET last_seen = ? WHERE id = ?").run(Date.now(), user.id);
    res.json({ token: jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "365d" }), user: getUserById(user.id) });
});

app.get("/api/me", auth, (req, res) => {
    const user = getUserById(req.userId);
    if (!user) return res.status(404).json({ error: "not_found" });
    res.json(user);
});

app.post("/api/profile", auth, (req, res) => {
    try {
        const { username, display_name } = req.body || {};
        if (!username) return res.status(400).json({ error: "missing_username" });
        const clean = username.toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (clean.length < 3) return res.status(400).json({ error: "username_too_short" });
        
        const existing = db.prepare("SELECT id FROM users WHERE username = ? AND id != ?").get(clean, req.userId);
        if (existing) return res.status(400).json({ error: "username_taken" });
        
        db.prepare("UPDATE users SET username = ?, display_name = ? WHERE id = ?").run(clean, display_name || clean, req.userId);
        res.json({ user: getUserById(req.userId) });
    } catch (e) { 
        res.status(500).json({ error: "server_error" }); 
    }
});

app.get("/api/users/:username", auth, (req, res) => {
    const user = getUserByUsername(req.params.username);
    if (!user) return res.status(404).json({ error: "not_found" });
    res.json({ id: user.id, username: user.username, display_name: user.display_name, last_seen: user.last_seen });
});

app.get("/api/chats", auth, (req, res) => {
    const chats = db.prepare(`SELECT c.id, c.name, c.type, c.created_at, m.last_read_at FROM chats c JOIN chat_members m ON m.chat_id = c.id WHERE m.user_id = ? ORDER BY c.created_at DESC`).all(req.userId);
    const enriched = chats.map(c => {
        const unread = db.prepare(`SELECT COUNT(*) as count FROM messages WHERE chat_id = ? AND created_at > ? AND sender_id != ?`).get(c.id, c.last_read_at, req.userId).count;
        
        if (c.type === 'direct') {
            const other = db.prepare(`SELECT u.id, u.username, u.display_name, u.last_seen FROM chat_members cm JOIN users u ON u.id = cm.user_id WHERE cm.chat_id = ? AND cm.user_id != ? LIMIT 1`).get(c.id, req.userId);
            return { ...c, other_user: other || null, unread };
        }
        return { ...c, unread };
    });
    res.json(enriched);
});

app.post("/api/chats/direct", auth, (req, res) => {
    const { other_user_id } = req.body || {};
    const existing = db.prepare(`SELECT c.id FROM chats c JOIN chat_members m1 ON m1.chat_id = c.id AND m1.user_id = ? JOIN chat_members m2 ON m2.chat_id = c.id AND m2.user_id = ? WHERE c.type = 'direct' LIMIT 1`).get(req.userId, other_user_id);
    if (existing) return res.json({ chat_id: existing.id });

    const chatId = uuid(); const now = Date.now();
    db.transaction(() => {
        db.prepare("INSERT INTO chats (id, type, created_by, created_at) VALUES (?, 'direct', ?, ?)").run(chatId, req.userId, now);
        db.prepare("INSERT INTO chat_members (chat_id, user_id, joined_at) VALUES (?, ?, ?)").run(chatId, req.userId, now);
        db.prepare("INSERT INTO chat_members (chat_id, user_id, joined_at) VALUES (?, ?, ?)").run(chatId, other_user_id, now);
    })();
    res.json({ chat_id: chatId });
});

app.post("/api/chats/read", auth, (req, res) => {
    db.prepare("UPDATE chat_members SET last_read_at = ? WHERE chat_id = ? AND user_id = ?").run(Date.now(), req.body.chat_id, req.userId);
    broadcast(req.body.chat_id, { type: "read", chat_id: req.body.chat_id, user_id: req.userId });
    res.json({ ok: true });
});

app.get("/api/messages/:chat_id", auth, (req, res) => {
    if (!db.prepare("SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?").get(req.params.chat_id, req.userId)) return res.status(403).json({ error: "not_member" });
    const messages = db.prepare(`SELECT m.*, u.username as sender_username FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.chat_id = ? AND m.is_deleted = 0 ORDER BY m.created_at ASC LIMIT 200`).all(req.params.chat_id);
    const readers = db.prepare("SELECT user_id, last_read_at FROM chat_members WHERE chat_id = ?").all(req.params.chat_id);
    res.json({ messages, readers });
});

app.post("/api/messages", auth, (req, res) => {
    const { chat_id, content_encrypted, iv, reply_to } = req.body || {};
    if (!db.prepare("SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?").get(chat_id, req.userId)) return res.status(403).json({ error: "not_member" });
    const id = uuid(); const now = Date.now();
    db.prepare(`INSERT INTO messages (id, chat_id, sender_id, content_encrypted, iv, reply_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, chat_id, req.userId, content_encrypted, iv, reply_to || null, now);
    db.prepare("UPDATE chat_members SET last_read_at = ? WHERE chat_id = ? AND user_id = ?").run(now, chat_id, req.userId);
    const msg = { id, chat_id, sender_id: req.userId, content_encrypted, iv, reply_to, created_at: now };
    broadcast(chat_id, { type: "message", message: msg });
    res.json(msg);
});

// WS для сокетов
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });
const clients = new Map();

wss.on("connection", (ws, req) => {
    const token = new URL(req.url, `http://${req.headers.host}`).searchParams.get("token");
    if (!token) return ws.close();
    
    let userId;
    try { userId = jwt.verify(token, JWT_SECRET).userId; } catch (e) { return ws.close(); }

    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(ws);
    broadcastAll({ type: "presence", user_id: userId, status: "online" });

    ws.on("close", () => {
        clients.get(userId)?.delete(ws);
        if (clients.get(userId)?.size === 0) {
            clients.delete(userId);
            broadcastAll({ type: "presence", user_id: userId, status: "offline" });
        }
    });
});

function broadcast(chatId, data) {
    const members = db.prepare("SELECT user_id FROM chat_members WHERE chat_id = ?").all(chatId);
    const payload = JSON.stringify(data);
    members.forEach(m => clients.get(m.user_id)?.forEach(ws => ws.readyState === 1 && ws.send(payload)));
}

function broadcastAll(data) {
    const payload = JSON.stringify(data);
    clients.forEach(set => set.forEach(ws => ws.readyState === 1 && ws.send(payload)));
}

server.listen(PORT, "0.0.0.0", () => console.log(`\nFLASH SERVER STARTED on port ${PORT}\n`));