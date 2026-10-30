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
const multer = require("multer");
const admin = require("firebase-admin");

// ============================================
// ЦВЕТНЫЕ ЛОГИ
// ============================================
const colors = {
    reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
    blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m", gray: "\x1b[90m"
};
function logInfo(msg) { console.log(`${colors.gray}[${new Date().toLocaleTimeString()}]${colors.reset} ${colors.cyan}ℹ INFO${colors.reset}: ${msg}`); }
function logSuccess(msg) { console.log(`${colors.gray}[${new Date().toLocaleTimeString()}]${colors.reset} ${colors.green}✅ OK${colors.reset}: ${msg}`); }
function logWarn(msg) { console.log(`${colors.gray}[${new Date().toLocaleTimeString()}]${colors.reset} ${colors.yellow}⚠ WARN${colors.reset}: ${msg}`); }
function logError(msg) { console.error(`${colors.gray}[${new Date().toLocaleTimeString()}]${colors.reset} ${colors.red}❌ ERROR${colors.reset}: ${msg}`); }
function logWS(msg) { console.log(`${colors.gray}[${new Date().toLocaleTimeString()}]${colors.reset} ${colors.blue}🔌 WS${colors.reset}: ${msg}`); }

// ============================================
// FIREBASE ADMIN SDK
// ============================================
let serviceAccount;
try {
    serviceAccount = require("./firebase-service-account.json");
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    logSuccess("Firebase Admin успешно инициализирован.");
} catch (e) {
    logWarn("Firebase Admin не инициализирован. Пуши не будут работать!");
}

// ============================================
// КОНФИГ И БАЗА
// ============================================
const CONFIG_PATH = path.join(__dirname, "server.json");
if (!fs.existsSync(CONFIG_PATH)) { logError("server.json not found!"); process.exit(1); }
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
const PORT = CONFIG.port || 8080;
const SERVER_PASSWORD = CONFIG.password || "";
const REGISTRATION_OPEN = CONFIG.registration_open !== false;
const JWT_SECRET = CONFIG.jwt_secret || crypto.randomBytes(32).toString("hex");
const CONNECT_SECRET = CONFIG.connect_secret || crypto.randomBytes(32).toString("hex");

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const db = new Database(path.join(DATA_DIR, "flash.db"));
db.pragma("journal_mode = WAL");

// ============================================
// ТАБЛИЦЫ И МИГРАЦИИ
// ============================================
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL, avatar_url TEXT DEFAULT '', bio TEXT DEFAULT '',
        created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL,
        is_banned INTEGER DEFAULT 0, is_admin INTEGER DEFAULT 0, badge TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY, name TEXT, type TEXT DEFAULT 'direct',
        created_by TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_members (
        chat_id TEXT NOT NULL, user_id TEXT NOT NULL, joined_at INTEGER NOT NULL,
        last_read_at INTEGER DEFAULT 0, is_pinned INTEGER DEFAULT 0, is_blocked INTEGER DEFAULT 0,
        role TEXT DEFAULT 'member', PRIMARY KEY (chat_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, sender_id TEXT NOT NULL,
        content_encrypted TEXT NOT NULL, iv TEXT NOT NULL, reply_to TEXT,
        created_at INTEGER NOT NULL, is_deleted INTEGER DEFAULT 0,
        file_id TEXT, is_sticker INTEGER DEFAULT 0, is_pinned INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY, hash TEXT UNIQUE NOT NULL, file_path TEXT NOT NULL,
        file_name TEXT NOT NULL, mime_type TEXT, size INTEGER, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sticker_packs (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, creator_id TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stickers (
        id TEXT PRIMARY KEY, pack_id TEXT NOT NULL, file_id TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_sticker_packs (
        user_id TEXT NOT NULL, pack_id TEXT NOT NULL, PRIMARY KEY (user_id, pack_id)
    );
    CREATE TABLE IF NOT EXISTS push_tokens (
        user_id TEXT NOT NULL, token TEXT NOT NULL, platform TEXT DEFAULT 'android',
        PRIMARY KEY (user_id, token)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_files_hash ON files(hash);
`);

try {
    const userCols = db.prepare("PRAGMA table_info(users)").all();
    if (!userCols.some(c => c.name === "is_banned")) db.exec("ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0");
    if (!userCols.some(c => c.name === "is_admin")) db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0");
    if (!userCols.some(c => c.name === "badge")) db.exec("ALTER TABLE users ADD COLUMN badge TEXT DEFAULT ''");
    if (!userCols.some(c => c.name === "avatar_url")) db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ''");
    const chatsInfo = db.prepare("PRAGMA table_info(chats)").all();
    if (!chatsInfo.some(c => c.name === "type")) db.exec("ALTER TABLE chats ADD COLUMN type TEXT DEFAULT 'direct'");
    const membersInfo = db.prepare("PRAGMA table_info(chat_members)").all();
    if (!membersInfo.some(c => c.name === "last_read_at")) db.exec("ALTER TABLE chat_members ADD COLUMN last_read_at INTEGER DEFAULT 0");
    if (!membersInfo.some(c => c.name === "is_pinned")) db.exec("ALTER TABLE chat_members ADD COLUMN is_pinned INTEGER DEFAULT 0");
    if (!membersInfo.some(c => c.name === "is_blocked")) db.exec("ALTER TABLE chat_members ADD COLUMN is_blocked INTEGER DEFAULT 0");
    if (!membersInfo.some(c => c.name === "role")) db.exec("ALTER TABLE chat_members ADD COLUMN role TEXT DEFAULT 'member'");
    const messagesInfo = db.prepare("PRAGMA table_info(messages)").all();
    if (!messagesInfo.some(c => c.name === "reply_to")) db.exec("ALTER TABLE messages ADD COLUMN reply_to TEXT");
    if (!messagesInfo.some(c => c.name === "file_id")) db.exec("ALTER TABLE messages ADD COLUMN file_id TEXT");
    if (!messagesInfo.some(c => c.name === "is_sticker")) db.exec("ALTER TABLE messages ADD COLUMN is_sticker INTEGER DEFAULT 0");
    if (!messagesInfo.some(c => c.name === "is_pinned")) db.exec("ALTER TABLE messages ADD COLUMN is_pinned INTEGER DEFAULT 0");
} catch (e) { logWarn("Миграция не требуется"); }

// ============================================
// MULTER
// ============================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ============================================
// EXPRESS
// ============================================
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const color = duration > 1000 ? colors.red : duration > 300 ? colors.yellow : colors.gray;
        console.log(`${colors.gray}[${new Date().toLocaleTimeString()}]${colors.reset} ${colors.blue}${req.method}${colors.reset} ${req.url} - ${color}${duration}ms${colors.reset} (${res.statusCode})`);
    });
    next();
});

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOADS_DIR));

app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

function uuid() { return crypto.randomUUID(); }
function getUserById(id) { return db.prepare("SELECT id, username, display_name, avatar_url, bio, created_at, last_seen, is_banned, is_admin, badge FROM users WHERE id = ?").get(id); }
function getUserByUsername(u) { return db.prepare("SELECT * FROM users WHERE username = ?").get(u.toLowerCase()); }

// ============================================
// МИДЛВАРЫ
// ============================================
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
function adminAuth(req, res, next) {
    const user = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(req.userId);
    if (!user || user.is_admin !== 1) return res.status(403).json({ error: "not_admin" });
    next();
}

// ============================================
// API АВТОРИЗАЦИИ
// ============================================
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
    const isFirst = db.prepare("SELECT COUNT(*) as count FROM users").get().count === 0;
    db.prepare(`INSERT INTO users (id, username, display_name, password_hash, created_at, last_seen, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, clean, display_name || clean, hash, now, now, isFirst ? 1 : 0);
    logSuccess(`Новый пользователь: @${clean}`);
    res.json({ token: jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: "365d" }), user: getUserById(id) });
});
app.post("/api/login", connAuth, async (req, res) => {
    const { username, password } = req.body || {};
    const user = getUserByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "invalid_credentials" });
    if (user.is_banned) return res.status(403).json({ error: "user_banned" });
    db.prepare("UPDATE users SET last_seen = ? WHERE id = ?").run(Date.now(), user.id);
    res.json({ token: jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "365d" }), user: getUserById(user.id) });
});
app.get("/api/me", auth, (req, res) => {
    const user = getUserById(req.userId);
    if (!user) return res.status(404).json({ error: "not_found" });
    if (user.is_banned) return res.status(403).json({ error: "user_banned" });
    res.json(user);
});
app.post("/api/profile", auth, (req, res) => {
    try {
        const { username, display_name, bio } = req.body || {};
        if (!username) return res.status(400).json({ error: "missing_username" });
        const clean = username.toLowerCase().replace(/[^a-z0-9_]/g, "");
        if (clean.length < 3) return res.status(400).json({ error: "username_too_short" });
        const existing = db.prepare("SELECT id FROM users WHERE username = ? AND id != ?").get(clean, req.userId);
        if (existing) return res.status(400).json({ error: "username_taken" });
        db.prepare("UPDATE users SET username = ?, display_name = ?, bio = ? WHERE id = ?").run(clean, display_name || clean, bio || "", req.userId);
        res.json({ user: getUserById(req.userId) });
    } catch (e) { res.status(500).json({ error: "server_error" }); }
});
app.post("/api/profile/avatar", auth, upload.single("avatar"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "no_file" });
    const user = getUserById(req.userId);
    if (user.avatar_url) {
        const oldPath = path.join(UPLOADS_DIR, path.basename(user.avatar_url));
        if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath); } catch (e) {} }
    }
    const avatarUrl = `/uploads/${req.file.filename}`;
    db.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").run(avatarUrl, req.userId);
    res.json({ avatar_url: avatarUrl });
});
app.get("/api/users/:username", auth, (req, res) => {
    const user = getUserByUsername(req.params.username);
    if (!user) return res.status(404).json({ error: "not_found" });
    res.json({ id: user.id, username: user.username, display_name: user.display_name, last_seen: user.last_seen, badge: user.badge, avatar_url: user.avatar_url, bio: user.bio });
});

// ============================================
// API ЧАТОВ
// ============================================
app.get("/api/chats", auth, (req, res) => {
    try {
        const chats = db.prepare(`
            SELECT c.id, c.name, c.type, c.created_at, m.last_read_at, m.is_pinned, m.is_blocked, m.role,
                (SELECT COUNT(*) FROM messages msg WHERE msg.chat_id = c.id AND msg.created_at > m.last_read_at AND msg.sender_id != ?) as unread
            FROM chats c JOIN chat_members m ON m.chat_id = c.id WHERE m.user_id = ?
            ORDER BY m.is_pinned DESC, c.created_at DESC
        `).all(req.userId, req.userId);
        const enriched = chats.map(c => {
            if (c.type === 'direct') {
                const other = db.prepare(`SELECT u.id, u.username, u.display_name, u.last_seen, u.badge, u.avatar_url FROM chat_members cm JOIN users u ON u.id = cm.user_id WHERE cm.chat_id = ? AND cm.user_id != ? LIMIT 1`).get(c.id, req.userId);
                return { ...c, other_user: other || null };
            }
            return c;
        });
        res.json(enriched);
    } catch (e) { logError(`Ошибка в /api/chats: ${e.message}`); res.status(500).json({ error: "server_error" }); }
});
app.post("/api/chats/direct", auth, (req, res) => {
    const { other_user_id } = req.body || {};
    const existing = db.prepare(`SELECT c.id FROM chats c JOIN chat_members m1 ON m1.chat_id = c.id AND m1.user_id = ? JOIN chat_members m2 ON m2.chat_id = c.id AND m2.user_id = ? WHERE c.type = 'direct' LIMIT 1`).get(req.userId, other_user_id);
    if (existing) return res.json({ chat_id: existing.id });
    const chatId = uuid(); const now = Date.now();
    db.transaction(() => {
        db.prepare("INSERT INTO chats (id, type, created_by, created_at) VALUES (?, 'direct', ?, ?)").run(chatId, req.userId, now);
        db.prepare("INSERT INTO chat_members (chat_id, user_id, joined_at, role) VALUES (?, ?, ?, 'member')").run(chatId, req.userId, now);
        db.prepare("INSERT INTO chat_members (chat_id, user_id, joined_at, role) VALUES (?, ?, ?, 'member')").run(chatId, other_user_id, now);
    })();
    res.json({ chat_id: chatId });
});
app.post("/api/chats/group", auth, (req, res) => {
    const { name, type } = req.body || {};
    if (!name) return res.status(400).json({ error: "missing_name" });
    const chatId = uuid(); const now = Date.now();
    db.transaction(() => {
        db.prepare("INSERT INTO chats (id, name, type, created_by, created_at) VALUES (?, ?, ?, ?, ?)").run(chatId, name, type || 'group', req.userId, now);
        db.prepare("INSERT INTO chat_members (chat_id, user_id, joined_at, role) VALUES (?, ?, ?, 'admin')").run(chatId, req.userId, now);
    })();
    logSuccess(`Создана группа "${name}"`);
    res.json({ chat_id: chatId });
});
app.post("/api/chats/add_member", auth, (req, res) => {
    const { chat_id, username } = req.body;
    const chat = db.prepare("SELECT type FROM chats WHERE id = ?").get(chat_id);
    if (!chat || chat.type === 'direct') return res.status(400).json({ error: "invalid_chat" });
    const member = db.prepare("SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?").get(chat_id, req.userId);
    if (!member || member.role !== 'admin') return res.status(403).json({ error: "not_admin" });
    const user = getUserByUsername(username);
    if (!user) return res.status(404).json({ error: "user_not_found" });
    db.prepare("INSERT OR IGNORE INTO chat_members (chat_id, user_id, joined_at, role) VALUES (?, ?, ?, 'member')").run(chat_id, user.id, Date.now());
    res.json({ ok: true, user_id: user.id });
});
app.post("/api/chats/read", auth, (req, res) => {
    db.prepare("UPDATE chat_members SET last_read_at = ? WHERE chat_id = ? AND user_id = ?").run(Date.now(), req.body.chat_id, req.userId);
    broadcast(req.body.chat_id, { type: "read", chat_id: req.body.chat_id, user_id: req.userId });
    res.json({ ok: true });
});
app.post("/api/chats/delete", auth, (req, res) => {
    const { chat_id } = req.body;
    db.transaction(() => {
        db.prepare("DELETE FROM messages WHERE chat_id = ?").run(chat_id);
        db.prepare("DELETE FROM chat_members WHERE chat_id = ?").run(chat_id);
        db.prepare("DELETE FROM chats WHERE id = ?").run(chat_id);
    })();
    broadcast(chat_id, { type: "chat_deleted", chat_id });
    res.json({ ok: true });
});
app.post("/api/chats/pin", auth, (req, res) => {
    db.prepare("UPDATE chat_members SET is_pinned = ? WHERE chat_id = ? AND user_id = ?").run(req.body.pin ? 1 : 0, req.body.chat_id, req.userId);
    res.json({ ok: true });
});
app.post("/api/chats/block", auth, (req, res) => {
    db.prepare("UPDATE chat_members SET is_blocked = ? WHERE chat_id = ? AND user_id = ?").run(req.body.block ? 1 : 0, req.body.chat_id, req.userId);
    res.json({ ok: true });
});
app.get("/api/chats/:chat_id/members", auth, (req, res) => {
    const members = db.prepare(`SELECT u.id, u.username, u.display_name, u.avatar_url, u.badge, u.last_seen, cm.role FROM chat_members cm JOIN users u ON u.id = cm.user_id WHERE cm.chat_id = ?`).all(req.params.chat_id);
    res.json(members);
});

// ============================================
// API СООБЩЕНИЙ
// ============================================
app.get("/api/messages/:chat_id", auth, (req, res) => {
    if (!db.prepare("SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?").get(req.params.chat_id, req.userId)) return res.status(403).json({ error: "not_member" });
    const messages = db.prepare(`SELECT m.*, u.username as sender_username FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.chat_id = ? AND m.is_deleted = 0 ORDER BY m.created_at ASC LIMIT 200`).all(req.params.chat_id);
    const readers = db.prepare("SELECT user_id, last_read_at FROM chat_members WHERE chat_id = ?").all(req.params.chat_id);
    res.json({ messages, readers });
});
app.post("/api/messages", auth, (req, res) => {
    const { chat_id, content_encrypted, iv, reply_to, file_id, is_sticker } = req.body || {};
    if (!db.prepare("SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?").get(chat_id, req.userId)) return res.status(403).json({ error: "not_member" });
    const id = uuid(); const now = Date.now();
    db.prepare(`INSERT INTO messages (id, chat_id, sender_id, content_encrypted, iv, reply_to, created_at, file_id, is_sticker) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, chat_id, req.userId, content_encrypted, iv, reply_to || null, now, file_id || null, is_sticker ? 1 : 0);
    db.prepare("UPDATE chat_members SET last_read_at = ? WHERE chat_id = ? AND user_id = ?").run(now, chat_id, req.userId);
    const msg = { id, chat_id, sender_id: req.userId, content_encrypted, iv, reply_to, created_at: now, file_id, is_sticker: is_sticker ? 1 : 0 };
    res.json(msg);
    broadcast(chat_id, { type: "message", message: msg });
    setImmediate(async () => {
        try {
            const sender = getUserById(req.userId);
            const chatMembers = db.prepare("SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ?").all(chat_id, req.userId);
            let pushText = "Новое сообщение";
            if (is_sticker) pushText = "Стикер"; else if (file_id) pushText = "Файл";
            for (const m of chatMembers) await sendPush(m.user_id, sender.display_name || sender.username, pushText, chat_id);
        } catch (e) { logError(`Ошибка в фоновой отправке пушей: ${e.message}`); }
    });
});
app.post("/api/messages/delete", auth, (req, res) => {
    const { msg_id } = req.body;
    const msg = db.prepare("SELECT sender_id, chat_id FROM messages WHERE id = ?").get(msg_id);
    if (!msg) return res.status(404).json({ error: "not_found" });
    const isAuthor = msg.sender_id === req.userId;
    const member = db.prepare("SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?").get(msg.chat_id, req.userId);
    const isAdmin = member && member.role === 'admin';
    if (!isAuthor && !isAdmin) return res.status(403).json({ error: "no_rights" });
    db.prepare("UPDATE messages SET is_deleted = 1 WHERE id = ?").run(msg_id);
    broadcastAll({ type: "message_deleted", msg_id });
    res.json({ ok: true });
});
app.post("/api/messages/edit", auth, (req, res) => {
    const { msg_id, content_encrypted, iv } = req.body;
    const msg = db.prepare("SELECT sender_id FROM messages WHERE id = ?").get(msg_id);
    if (!msg) return res.status(404).json({ error: "not_found" });
    if (msg.sender_id !== req.userId) return res.status(403).json({ error: "not_author" });
    db.prepare("UPDATE messages SET content_encrypted = ?, iv = ? WHERE id = ?").run(content_encrypted, iv, msg_id);
    broadcastAll({ type: "message_edited", msg_id, content_encrypted, iv });
    res.json({ ok: true });
});
app.post("/api/messages/pin", auth, (req, res) => {
    const { msg_id, pin } = req.body;
    const msg = db.prepare("SELECT chat_id FROM messages WHERE id = ?").get(msg_id);
    if (!msg) return res.status(404).json({ error: "not_found" });
    const member = db.prepare("SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?").get(msg.chat_id, req.userId);
    if (!member) return res.status(403).json({ error: "not_member" });
    const chat = db.prepare("SELECT type FROM chats WHERE id = ?").get(msg.chat_id);
    if (chat.type !== 'direct' && member.role !== 'admin') return res.status(403).json({ error: "not_admin" });
    db.prepare("UPDATE messages SET is_pinned = ? WHERE id = ?").run(pin ? 1 : 0, msg_id);
    broadcastAll({ type: "message_pinned", msg_id, pin });
    res.json({ ok: true });
});

// ============================================
// API ФАЙЛОВ
// ============================================
app.post("/api/upload/check", auth, (req, res) => {
    const { hash } = req.body;
    if (!hash) return res.status(400).json({ error: "missing_hash" });
    const file = db.prepare("SELECT id FROM files WHERE hash = ?").get(hash);
    res.json({ exists: !!file, file_id: file?.id || null });
});
app.post("/api/upload", auth, upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "no_file" });
    const { chat_id, hash } = req.body;
    if (!chat_id || !hash) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: "missing_fields" }); }
    const member = db.prepare("SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?").get(chat_id, req.userId);
    if (!member) { fs.unlinkSync(req.file.path); return res.status(403).json({ error: "not_member" }); }
    const existing = db.prepare("SELECT id FROM files WHERE hash = ?").get(hash);
    if (existing) { fs.unlinkSync(req.file.path); return res.json({ file_id: existing.id, deduplicated: true }); }
    const fileId = uuid(); const now = Date.now();
    db.prepare("INSERT INTO files (id, hash, file_path, file_name, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(fileId, hash, req.file.path, req.file.originalname, req.file.mimetype, req.file.size, now);
    logInfo(`Загружен файл: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);
    res.json({ file_id: fileId, deduplicated: false });
});
app.get("/api/files/:file_id", (req, res) => {
    let token = req.query.token;
    if (!token && req.headers.authorization) token = req.headers.authorization.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "no_token" });
    let userId;
    try { userId = jwt.verify(token, JWT_SECRET).userId; } catch (e) { return res.status(401).json({ error: "invalid_token" }); }
    const file = db.prepare("SELECT * FROM files WHERE id = ?").get(req.params.file_id);
    if (!file) { logWarn(`Файл ${req.params.file_id} не найден в БД`); return res.status(404).json({ error: "not_found" }); }
    const access = db.prepare(`SELECT 1 FROM messages m JOIN chat_members cm ON cm.chat_id = m.chat_id WHERE m.file_id = ? AND cm.user_id = ? LIMIT 1`).get(file.id, userId);
    if (!access) return res.status(403).json({ error: "no_access" });
    if (req.query.download) res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.file_name)}"`);
    res.sendFile(file.file_path, (err) => {
        if (err && !res.headersSent) { logWarn(`Ошибка sendFile для файла ${file.id}: ${err.message}`); res.status(404).end(); }
    });
});

// ============================================
// API СТИКЕРОВ
// ============================================
app.get("/api/stickers/packs", auth, (req, res) => {
    const packs = db.prepare(`
        SELECT p.id, p.name, p.creator_id, u.username as creator_name FROM sticker_packs p JOIN users u ON p.creator_id = u.id
        WHERE p.creator_id = ? OR p.id IN (SELECT pack_id FROM user_sticker_packs WHERE user_id = ?) ORDER BY p.created_at ASC
    `).all(req.userId, req.userId);
    const result = packs.map(p => {
        const stickers = db.prepare("SELECT s.id, s.file_id FROM stickers s WHERE s.pack_id = ? ORDER BY s.created_at ASC").all(p.id);
        return { ...p, stickers, is_mine: p.creator_id === req.userId };
    });
    res.json(result);
});
app.post("/api/stickers/packs", auth, (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "missing_name" });
    const existing = db.prepare("SELECT id FROM sticker_packs WHERE name = ? AND creator_id = ?").get(name, req.userId);
    if (existing) return res.status(400).json({ error: "pack_already_exists" });
    const id = uuid();
    db.prepare("INSERT INTO sticker_packs (id, name, creator_id, created_at) VALUES (?, ?, ?, ?)").run(id, name, req.userId, Date.now());
    logSuccess(`Создан стикер-пак "${name}"`);
    res.json({ id, name });
});
app.post("/api/stickers/packs/delete", auth, (req, res) => {
    const { pack_id } = req.body;
    const pack = db.prepare("SELECT creator_id FROM sticker_packs WHERE id = ?").get(pack_id);
    if (!pack) return res.status(404).json({ error: "not_found" });
    if (pack.creator_id !== req.userId) return res.status(403).json({ error: "not_creator" });
    db.transaction(() => {
        db.prepare("DELETE FROM stickers WHERE pack_id = ?").run(pack_id);
        db.prepare("DELETE FROM sticker_packs WHERE id = ?").run(pack_id);
        db.prepare("DELETE FROM user_sticker_packs WHERE pack_id = ?").run(pack_id);
    })();
    res.json({ ok: true });
});
app.post("/api/stickers/packs/subscribe", auth, (req, res) => {
    db.prepare("INSERT OR IGNORE INTO user_sticker_packs (user_id, pack_id) VALUES (?, ?)").run(req.userId, req.body.pack_id);
    res.json({ ok: true });
});
app.post("/api/stickers/add", auth, upload.single("sticker"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "no_file" });
    const { pack_id, hash } = req.body;
    const pack = db.prepare("SELECT creator_id FROM sticker_packs WHERE id = ?").get(pack_id);
    if (!pack || pack.creator_id !== req.userId) { fs.unlinkSync(req.file.path); return res.status(403).json({ error: "not_creator" }); }
    const existingFile = db.prepare("SELECT id FROM files WHERE hash = ?").get(hash);
    let fileId;
    if (existingFile) { fs.unlinkSync(req.file.path); fileId = existingFile.id; }
    else {
        fileId = uuid();
        db.prepare("INSERT INTO files (id, hash, file_path, file_name, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(fileId, hash, req.file.path, req.file.originalname, req.file.mimetype, req.file.size, Date.now());
    }
    const stickerId = uuid();
    db.prepare("INSERT INTO stickers (id, pack_id, file_id, created_at) VALUES (?, ?, ?, ?)").run(stickerId, pack_id, fileId, Date.now());
    res.json({ id: stickerId, file_id: fileId });
});

// ============================================
// API ПУШЕЙ
// ============================================
app.post("/api/push/register", auth, (req, res) => {
    const { token, platform } = req.body;
    if (!token) return res.status(400).json({ error: "no_token" });
    db.prepare("INSERT OR IGNORE INTO push_tokens (user_id, token, platform) VALUES (?, ?, ?)").run(req.userId, token, platform || 'android');
    logInfo(`Зарегистрирован push-токен для юзера ${req.userId}`);
    res.json({ ok: true });
});
async function sendPush(userId, title, body, chatId) {
    try {
        const tokens = db.prepare("SELECT token FROM push_tokens WHERE user_id = ?").all(userId);
        if (tokens.length === 0) return;
        for (const t of tokens) {
            try {
                await Promise.race([
                    admin.messaging().send({ token: t.token, notification: { title, body }, data: { chat_id: chatId } }),
                    new Promise((_, rej) => setTimeout(() => rej(new Error("push timeout")), 5000))
                ]);
                logPush(`Отправлен пуш на устройство (юзер: ${title})`);
            } catch (e) {
                if (e.code === 'messaging/registration-token-not-registered' || e.code === 'messaging/invalid-argument') {
                    db.prepare("DELETE FROM push_tokens WHERE token = ?").run(t.token);
                    logWarn(`Удален недействительный токен`);
                } else logError(`Ошибка отправки пуша: ${e.message}`);
            }
        }
    } catch (e) { logError(`Ошибка в sendPush: ${e.message}`); }
}

// ============================================
// ADMIN API
// ============================================
app.get("/api/admin/check", auth, (req, res) => {
    const user = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(req.userId);
    res.json({ is_admin: user?.is_admin === 1 });
});
app.get("/api/admin/stats", auth, adminAuth, (req, res) => {
    res.json({
        users: db.prepare("SELECT COUNT(*) as count FROM users").get().count,
        chats: db.prepare("SELECT COUNT(*) as count FROM chats").get().count,
        messages: db.prepare("SELECT COUNT(*) as count FROM messages").get().count,
        online: clients.size
    });
});
app.get("/api/admin/users", auth, adminAuth, (req, res) => {
    res.json(db.prepare("SELECT id, username, display_name, created_at, last_seen, is_banned, is_admin, badge FROM users ORDER BY created_at DESC").all());
});
app.post("/api/admin/ban", auth, adminAuth, (req, res) => {
    db.prepare("UPDATE users SET is_banned = ? WHERE id = ?").run(req.body.ban ? 1 : 0, req.body.user_id);
    logWarn(`Бан/разбан юзера ${req.body.user_id}`);
    res.json({ ok: true });
});
app.post("/api/admin/promote", auth, adminAuth, (req, res) => {
    db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(req.body.promote ? 1 : 0, req.body.user_id);
    res.json({ ok: true });
});
app.post("/api/admin/badge", auth, adminAuth, (req, res) => {
    db.prepare("UPDATE users SET badge = ? WHERE id = ?").run(req.body.badge || "", req.body.user_id);
    res.json({ ok: true });
});
app.post("/api/admin/delete", auth, adminAuth, (req, res) => {
    const { user_id } = req.body;
    db.transaction(() => {
        db.prepare("DELETE FROM chat_members WHERE user_id = ?").run(user_id);
        db.prepare("DELETE FROM messages WHERE sender_id = ?").run(user_id);
        db.prepare("DELETE FROM users WHERE id = ?").run(user_id);
        db.prepare("DELETE FROM push_tokens WHERE user_id = ?").run(user_id);
    })();
    logWarn(`Удален юзер ${user_id}`);
    res.json({ ok: true });
});
app.post("/api/admin/broadcast", auth, adminAuth, (req, res) => {
    broadcastAll({ type: "broadcast", text: req.body.text });
    logInfo(`Отправлена рассылка: "${req.body.text}"`);
    res.json({ ok: true });
});
app.get("/api/admin/tech", auth, adminAuth, (req, res) => {
    const mem = process.memoryUsage();
    res.json({ uptime: Math.floor(process.uptime()), memory_rss: Math.round(mem.rss/1024/1024) + " MB", node_version: process.version, platform: process.platform });
});
app.get("/api/admin/logs", auth, adminAuth, (req, res) => {
    res.json(db.prepare(`SELECT m.id, m.chat_id, m.sender_id, u.username as sender_name, m.created_at, m.content_encrypted FROM messages m JOIN users u ON m.sender_id = u.id ORDER BY m.created_at DESC LIMIT 100`).all());
});

// ============================================
// WEBSOCKET (БЕЗ ЗВОНКОВ)
// ============================================
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });
const clients = new Map();

wss.on("connection", (ws, req) => {
    const token = new URL(req.url, `http://${req.headers.host}`).searchParams.get("token");
    if (!token) return ws.close();
    let userId;
    try { userId = jwt.verify(token, JWT_SECRET).userId; } catch (e) { return ws.close(); }
    const user = db.prepare("SELECT is_banned, username FROM users WHERE id = ?").get(userId);
    if (user?.is_banned) return ws.close();

    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(ws);
    logWS(`Подключился @${user.username} (всего онлайн: ${clients.size})`);
    broadcastAll({ type: "presence", user_id: userId, status: "online" });

    ws.on("close", () => {
        clients.get(userId)?.delete(ws);
        if (clients.get(userId)?.size === 0) {
            clients.delete(userId);
            logWS(`Отключился @${user.username} (осталось онлайн: ${clients.size})`);
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

server.listen(PORT, "0.0.0.0", () => {
    console.log(`\n${colors.green}========================================${colors.reset}`);
    console.log(`${colors.green}  FLASH SERVER STARTED on port ${PORT}${colors.reset}`);
    console.log(`${colors.green}  URL: http://localhost:${PORT}${colors.reset}`);
    console.log(`${colors.green}========================================${colors.reset}\n`);
});
