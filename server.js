const path = require("path");
const http = require("http");
const express = require("express");
const morgan = require("morgan");
const helmet = require("helmet");
const compression = require("compression");
const { nanoid } = require("nanoid");
// gunakan fetch bawaan Node >=18; fallback ke node-fetch jika perlu
const fetchFallback = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const app = express();
const server = http.createServer(app);
const io = require("socket.io")(server, { cors: { origin: false } });

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(helmet());
app.use(compression());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public"), {
  maxAge: process.env.NODE_ENV === "production" ? "7d" : 0
}));

// ===== In-memory rooms (demo) =====
const rooms = new Map();
ensureRoom("global", null);

function ensureRoom(id, password = null) {
  if (!rooms.has(id)) {
    rooms.set(id, {
      id,
      password,
      topic: "",
      rules: "",
      slowModeSec: 0,
      users: new Map(),          // socket.id -> username
      nameToSockets: new Map(),  // username -> Set<socket.id>
      lastMsgAtByUser: new Map(),
      messages: []
    });
  }
  return rooms.get(id);
}

function broadcastPresence(rid) {
  const r = rooms.get(rid); if (!r) return;
  io.to(rid).emit("onlineCount", { roomId: rid, n: r.users.size });
  io.to(rid).emit("onlineUsers", {
    roomId: rid,
    users: Array.from(new Set(r.users.values()))
  });
}

const MENTION_RE = /(^|\s)@([A-Za-z0-9_]+)\b/g;

async function buildLinkPreview(text) {
  try {
    const m = String(text || "").match(/https?:\/\/[^\s)]+/);
    if (!m) return null;
    const url = m[0];
    const f = global.fetch || fetchFallback;
    const res = await f(url, { timeout: 5000 });
    const html = await res.text();
    const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1];
    return { url, title: title ? title.trim() : url, image: null, description: null, siteName: null };
  } catch { return null; }
}

// ===== Routes =====
app.get("/", (req, res) => res.render("index", { title: "Chat MVI" }));

app.get("/messages", (req, res) => {
  const roomId = String(req.query.room || "global");
  const before = req.query.before ? new Date(req.query.before) : null;
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || "50", 10)));
  const r = rooms.get(roomId);
  if (!r) return res.json([]);
  let list = r.messages;
  if (before) list = list.filter(m => new Date(m.createdAt) < before);
  list = list.slice(-5000).slice(-limit);
  return res.json(list);
});

// ===== Socket.IO =====
io.on("connection", (socket) => {
  let current = { roomId: null, username: null };

  const joinRoom = (roomId, username) => {
    if (current.roomId) {
      const prev = rooms.get(current.roomId);
      if (prev) {
        prev.users.delete(socket.id);
        const set = prev.nameToSockets.get(current.username);
        if (set) { set.delete(socket.id); if (!set.size) prev.nameToSockets.delete(current.username); }
        socket.leave(current.roomId);
        broadcastPresence(prev.id);
      }
    }
    current = { roomId, username };
    const r = ensureRoom(roomId);
    r.users.set(socket.id, username);
    if (!r.nameToSockets.has(username)) r.nameToSockets.set(username, new Set());
    r.nameToSockets.get(username).add(socket.id);
    socket.join(roomId);
    socket.emit("history", r.messages.slice(-50));
    socket.emit("roomInfo", { topic: r.topic, rules: r.rules, slowModeSec: r.slowModeSec });
    broadcastPresence(roomId);
  };

  socket.on("joinGlobal", ({ username }) => { if (!username) return; ensureRoom("global"); joinRoom("global", username); });

  socket.on("createRoom", ({ roomId, password, username }, cb) => {
    if (!roomId || !password || !username) return cb?.({ ok: false, error: "INVALID" });
    if (rooms.has(roomId)) return cb?.({ ok: false, error: "Room sudah ada" });
    ensureRoom(roomId, password);
    joinRoom(roomId, username);
    cb?.({ ok: true });
  });

  socket.on("joinRoom", ({ roomId, password, username }, cb) => {
    const r = rooms.get(roomId);
    if (!r) return cb?.({ ok: false, error: "Room tidak ada" });
    if (!password || r.password !== password) return cb?.({ ok: false, error: "Password salah" });
    if (!username) return cb?.({ ok: false, error: "Username wajib" });
    joinRoom(roomId, username);
    cb?.({ ok: true });
  });

  socket.on("leaveRoom", () => {
    if (!current.roomId) return;
    const r = rooms.get(current.roomId);
    if (r) {
      r.users.delete(socket.id);
      const set = r.nameToSockets.get(current.username);
      if (set) { set.delete(socket.id); if (!set.size) r.nameToSockets.delete(current.username); }
      broadcastPresence(r.id);
    }
    socket.leave(current.roomId);
    current = { roomId: null, username: null };
  });

  socket.on("typing", ({ isTyping }) => {
    if (!current.roomId || !current.username) return;
    socket.to(current.roomId).emit("typing", { username: current.username, isTyping: !!isTyping });
  });

  function makeMsgBase({ roomId, username, type = "text" }) {
    return { _id: nanoid(), roomId, username, type, createdAt: new Date().toISOString() };
  }
  function pushAndBroadcastMessage(r, msg) { r.messages.push(msg); io.to(r.id).emit("message", msg); }

  socket.on("messageRoom", async (payload, cb) => {
    const r = rooms.get(current.roomId);
    if (!r || !current.username) return;
    if (r.slowModeSec > 0) {
      const last = r.lastMsgAtByUser.get(current.username);
      const now = Date.now();
      if (last && (now - last) < r.slowModeSec * 1000) { cb?.({ ok: false, error: "SLOW_MODE" }); return; }
      r.lastMsgAtByUser.set(current.username, now);
    }
    const parent = (payload.parentId && r.messages.find(m => m._id === payload.parentId)) || null;

    if (payload.imageUrl) {
      const msg = {
        ...makeMsgBase({ roomId: r.id, username: current.username, type: "image" }),
        imageUrl: String(payload.imageUrl),
        parent: parent ? {_id: parent._id, id: parent._id, username: parent.username, text: parent.text, createdAt: parent.createdAt} : null
      };
      pushAndBroadcastMessage(r, msg);
      return cb?.({ ok: true });
    }

    const text = String(payload.text || "").slice(0, 4000);
    const linkPreview = await buildLinkPreview(text);
    const msg = {
      ...makeMsgBase({ roomId: r.id, username: current.username, type: "text" }),
      text,
      parent: parent ? {_id: parent._id, id: parent._id, username: parent.username, text: parent.text, createdAt: parent.createdAt} : null,
      linkPreview
    };
    pushAndBroadcastMessage(r, msg);
    cb?.({ ok: true });

    const mentioned = new Set();
    (text.match(MENTION_RE) || []).forEach((m) => {
      const name = m.trim().slice(1);
      if (name && r.nameToSockets.has(name)) {
        r.nameToSockets.get(name).forEach((sid) => {
          if (!mentioned.has(sid)) io.to(sid).emit("mention", { from: current.username, text });
          mentioned.add(sid);
        });
      }
    });
  });

  socket.on("editMessage", async ({ id, newText }, cb) => {
    const r = rooms.get(current.roomId);
    if (!r || !id) return cb?.({ ok: false });
    const m = r.messages.find(x => x._id === id);
    if (!m) return cb?.({ ok: false, error: "NOT_FOUND" });
    if (m.username !== current.username || m.type !== "text") return cb?.({ ok: false, error: "FORBIDDEN" });
    m.text = String(newText || "").slice(0, 4000);
    m.editedAt = new Date().toISOString();
    m.linkPreview = await buildLinkPreview(m.text);
    io.to(r.id).emit("messageEdited", { id: m._id, newText: m.text, editedAt: m.editedAt, linkPreview: m.linkPreview });
    cb?.({ ok: true });
  });

  socket.on("deleteMessage", ({ id }, cb) => {
    const r = rooms.get(current.roomId);
    if (!r || !id) return cb?.({ ok: false });
    const idx = r.messages.findIndex(x => x._id === id);
    if (idx < 0) return cb?.({ ok: false, error: "NOT_FOUND" });
    const m = r.messages[idx];
    if (m.username !== current.username) return cb?.({ ok: false, error: "FORBIDDEN" });
    r.messages.splice(idx, 1);
    io.to(r.id).emit("messageDeleted", { id });
    cb?.({ ok: true });
  });

  socket.on("createPoll", ({ question, options }, cb) => {
    const r = rooms.get(current.roomId);
    if (!r || !current.username) return cb?.({ ok: false });
    const poll = {
      question: String(question || "").slice(0, 300),
      options: (options || []).slice(0, 10).map(t => ({ text: String(t).slice(0, 200), votes: [] })),
      isClosed: false
    };
    if (poll.options.length < 2) return cb?.({ ok: false, error: "MIN_OPTIONS" });
    const msg = { _id: nanoid(), roomId: r.id, username: current.username, type: "poll", createdAt: new Date().toISOString(), poll };
    r.messages.push(msg);
    io.to(r.id).emit("message", msg);
    cb?.({ ok: true });
  });

  socket.on("votePoll", ({ id, optionIndex }, cb) => {
    const r = rooms.get(current.roomId);
    if (!r || !current.username) return cb?.({ ok: false });
    const m = r.messages.find(x => x._id === id && x.type === "poll");
    if (!m || m.poll.isClosed) return cb?.({ ok: false, error: "CLOSED" });
    const i = parseInt(optionIndex, 10);
    const opt = m.poll.options?.[i];
    if (!opt) return cb?.({ ok: false, error: "BAD_INDEX" });
    m.poll.options.forEach(o => { o.votes = o.votes.filter(u => u !== current.username); });
    opt.votes.push(current.username);
    io.to(r.id).emit("pollUpdated", { id: m._id, poll: m.poll });
    cb?.({ ok: true });
  });

  socket.on("closePoll", ({ id }, cb) => {
    const r = rooms.get(current.roomId);
    if (!r) return cb?.({ ok: false });
    const m = r.messages.find(x => x._id === id && x.type === "poll" && x.username === current.username);
    if (!m) return cb?.({ ok: false, error: "FORBIDDEN" });
    m.poll.isClosed = true;
    io.to(r.id).emit("pollUpdated", { id: m._id, poll: m.poll });
    cb?.({ ok: true });
  });

  socket.on("slash", async ({ cmd, args }, cb) => {
    try {
      if (!current.roomId || !current.username) return cb?.({ ok: false, error: "NOT_IN_ROOM" });
      const r = rooms.get(current.roomId);
      const c = String(cmd || "").toLowerCase();
      if (c === "giphy") {
        const q = (args && args[0]) ? String(args.join(" ")) : "funny cat";
        const KEY = process.env.GIPHY_API_KEY || "";
        let gifUrl = `https://giphy.com/search/${encodeURIComponent(q)}`;
        if (KEY) {
          try {
            const url = `https://api.giphy.com/v1/gifs/search?api_key=${KEY}&q=${encodeURIComponent(q)}&limit=1&rating=g`;
            const rGif = await (global.fetch || fetchFallback)(url).then(r => r.json());
            const data = rGif?.data?.[0];
            gifUrl = data?.images?.downsized_medium?.url || gifUrl;
          } catch {}
        }
        const msg = { _id: nanoid(), roomId: r.id, username: current.username, type: "image", createdAt: new Date().toISOString(), imageUrl: gifUrl };
        r.messages.push(msg);
        io.to(r.id).emit("message", msg);
        return cb?.({ ok: true });
      }
      if (c === "topic") {
        r.topic = String((args || []).join(" ")).slice(0, 500);
        io.to(r.id).emit("roomInfo", { topic: r.topic, rules: r.rules, slowModeSec: r.slowModeSec });
        return cb?.({ ok: true });
      }
      if (c === "rules") {
        r.rules = String((args || []).join(" ")).slice(0, 1000);
        io.to(r.id).emit("roomInfo", { topic: r.topic, rules: r.rules, slowModeSec: r.slowModeSec });
        return cb?.({ ok: true });
      }
      if (c === "slow") {
        const sec = Math.max(0, parseInt(args?.[0] || "0", 10) || 0);
        r.slowModeSec = sec;
        io.to(r.id).emit("slowMode", { seconds: sec, waitMs: sec * 1000 });
        return cb?.({ ok: true });
      }
      return cb?.({ ok: false, error: "UNKNOWN" });
    } catch (e) { cb?.({ ok: false, error: "ERR" }); }
  });

  socket.on("sendImage", ({ imageUrl }, cb) => {
    const r = rooms.get(current.roomId);
    if (!r || !current.username || !imageUrl) return cb?.({ ok: false });
    const msg = { _id: nanoid(), roomId: r.id, username: current.username, type: "image", createdAt: new Date().toISOString(), imageUrl: String(imageUrl) };
    r.messages.push(msg);
    io.to(r.id).emit("message", msg);
    cb?.({ ok: true });
  });

  socket.on("disconnect", () => {
    if (!current.roomId) return;
    const r = rooms.get(current.roomId);
    if (r) {
      r.users.delete(socket.id);
      const set = r.nameToSockets.get(current.username);
      if (set) { set.delete(socket.id); if (!set.size) r.nameToSockets.delete(current.username); }
      broadcastPresence(r.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ CHK EJS running on http://localhost:${PORT}`));
