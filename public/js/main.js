// public/js/main.js
import { io } from '/socket.io/socket.io.esm.min.js';
import { renderMarkdown } from './markdown.js';
import { handleSlash } from './slash.js';
import {
  renderMessages,
  appendMessage,
  ensureDateDivider,
  bindMessageEvents
} from './messages.js';

/* ---------- Utils ---------- */
function detectUsername() {
  // 1) body data-username (diset EJS)
  let u = (document.body?.dataset?.username || '').trim();
  if (u) return u;
  // 2) fallback: ambil dari header "Hi, <b>username</b>"
  const b = document.querySelector('.app-actions .muted b');
  u = (b?.textContent || '').trim();
  return u;
}

function currentRoomId() {
  // dari data-room (server bisa isi via cookie rid → EJS)
  const r = (document.body?.dataset?.room || '').trim();
  return r || ''; // kosong = biar server tentukan (default global)
}

/* ---------- Global state ---------- */
window.__state = {
  username: detectUsername(),
  roomId: currentRoomId(),
  messagesData: [],
  previewOn: false,
  replyTo: null
};

let nextCursor = null;
let socket = null;

/* ---------- UI helpers ---------- */
function setComposeEnabled(en) {
  const input = document.getElementById('input');
  const sb = document.querySelector('#form button[type="submit"]');
  if (input) input.disabled = !en;
  if (sb) sb.disabled = !en;
}

function showLogin() {
  const m = document.getElementById('loginModal');
  if (!m) return;
  m.style.display = 'flex';
  setComposeEnabled(false);
}

function hideLogin() {
  const m = document.getElementById('loginModal');
  if (m) {
    m.style.display = 'none';
    setComposeEnabled(true);
  }
}

function setMode(mode) {
  const g = document.getElementById('globalPanel');
  const p = document.getElementById('privatePanel');
  const bg = document.getElementById('btnTabGlobal');
  const bp = document.getElementById('btnTabPrivate');
  if (!g || !p) return;
  if (mode === 'global') {
    g.style.display = '';
    p.style.display = 'none';
    bg?.classList.add('active');
    bp?.classList.remove('active');
  } else {
    g.style.display = 'none';
    p.style.display = '';
    bg?.classList.remove('active');
    bp?.classList.add('active');
  }
}

function resetMessagesUI() {
  const messagesEl = document.getElementById('messages');
  if (!messagesEl) return;
  messagesEl.innerHTML = '';
  messagesEl.dataset.lastDateKey = '';
  window.__state.messagesData = [];
  nextCursor = null;
  window.__state.replyTo = null;
}

/* ---------- Reply bar ---------- */
// function setupReplyBar() {
//   const form = document.getElementById('form');
//   let bar = document.getElementById('replyBar');

//   // Buat bar kalau belum ada, tapi hanya jika form tersedia
//   function ensureBar() {
//     if (bar && document.body.contains(bar)) return bar;
//     if (!form || !form.parentNode) return null;

//     bar = document.createElement('div');
//     bar.id = 'replyBar';
//     bar.style.cssText =
//       'display:none;padding:6px 10px;font-size:12px;background:var(--bg-soft);border-left:3px solid var(--accent);margin:6px 0;border-radius:4px;';

//     // pakai class agar tidak bentrok ID global
//     const left = document.createElement('div');
//     left.innerHTML = 'Membalas <b class="reply-user"></b>: <span class="reply-text"></span>';

//     const cancelBtn = document.createElement('button');
//     cancelBtn.type = 'button';
//     cancelBtn.textContent = 'Batal';
//     cancelBtn.style.cssText = 'float:right;margin-left:8px;';

//     bar.appendChild(left);
//     bar.appendChild(cancelBtn);
//     form.parentNode.insertBefore(bar, form);

//     cancelBtn.addEventListener('click', (e) => {
//       e.preventDefault();
//       window.__state.replyTo = null;
//       bar.style.display = 'none';
//     });

//     return bar;
//   }

//   // Terima event dari messages.js
//   window.addEventListener('app:set-reply', (e) => {
//     const rbar = ensureBar();
//     if (!rbar) return; // tidak ada form di halaman ini

//     // cari target node setiap kali (kalau DOM pernah diganti)
//     const userEl = rbar.querySelector('.reply-user');
//     const textEl = rbar.querySelector('.reply-text');
//     if (!userEl || !textEl) return;

//     const r = e.detail;
//     if (r) {
//       window.__state.replyTo = r;
//       rbar.style.display = 'block';
//       userEl.textContent = r.username || '?';
//       textEl.textContent = (r.text || '').slice(0, 120);
//     } else {
//       window.__state.replyTo = null;
//       rbar.style.display = 'none';
//     }
//   });
// }

/* ---------- Reply bar (gaya WA) ---------- */
function setupReplyBar() {
  const form = document.getElementById('form');
  let bar = document.getElementById('replyBar');

  function ensureBar() {
    if (bar && document.body.contains(bar)) return bar;
    if (!form || !form.parentNode) return null;

    bar = document.createElement('div');
    bar.id = 'replyBar';
    bar.className = 'reply-bar'; // styling di CSS
    // konten bar
    const content = document.createElement('div');
    content.className = 'rb-content';

    const top = document.createElement('div');
    top.className = 'rb-top';
    top.innerHTML = `Membalas <b class="rb-username"></b>`;

    const snip = document.createElement('div');
    snip.className = 'rb-snippet';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'rb-close';
    close.setAttribute('aria-label', 'Batal');
    close.textContent = '×';

    content.appendChild(top);
    content.appendChild(snip);
    bar.appendChild(content);
    bar.appendChild(close);

    // sisipkan di atas form
    form.parentNode.insertBefore(bar, form);

    // aksi batal
    const hide = () => {
      window.__state.replyTo = null;
      bar.style.display = 'none';
    };
    close.addEventListener('click', (e) => { e.preventDefault(); hide(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && bar.style.display !== 'none') hide();
    });

    return bar;
  }

  // Terima event dari messages.js
  window.addEventListener('app:set-reply', (e) => {
    const rbar = ensureBar();
    if (!rbar) return;

    const userEl = rbar.querySelector('.rb-username');
    const snipEl = rbar.querySelector('.rb-snippet');
    if (!userEl || !snipEl) return;

    const r = e.detail;
    if (r) {
      window.__state.replyTo = r;
      rbar.style.display = 'block';
      userEl.textContent = r.username || '?';
      snipEl.textContent = (r.text || '').slice(0, 180);
      // fokus ke input biar langsung ngetik
      document.getElementById('input')?.focus();
    } else {
      window.__state.replyTo = null;
      rbar.style.display = 'none';
    }
  });
}


/* ---------- Socket setup ---------- */
function setupSocket() {
  socket = io({ autoConnect: false });
  window.__socket = socket;

  const messagesEl = document.getElementById('messages');

  // aktifkan event delegation (Reply/Edit/Hapus/React)
  bindMessageEvents(messagesEl, socket, () => window.__state.username);

  window.__onEdit = (id) => {
    const node = messagesEl?.querySelector(`[data-id="${CSS.escape(id)}"]`);
    const old = node?.querySelector('.msg-text')?.textContent || '';
    const next = prompt('Edit pesan:', old);
    if (next === null) return;
    const newText = next.trim();
    if (!newText) return alert('Isi tidak boleh kosong.');
    socket.emit('editMessage', { id, newText }, (res) => {
      if (!res?.ok) alert(res?.error || 'Gagal edit');
    });
  };

  window.__onDelete = (id) => {
    if (!confirm('Hapus pesan ini?')) return;
    socket.emit('deleteMessage', { id }, (res) => {
      if (!res?.ok) alert(res?.error || 'Gagal hapus');
    });
  };

  socket.on('history', (payload) => {
    const items = Array.isArray(payload) ? payload : (payload.items || []);
    nextCursor = Array.isArray(payload) ? null : payload.nextCursor || null;
    renderMessages(
      messagesEl,
      socket,
      items,
      window.__state.username,
      scrollToMessage,
      { scroll: true }
    );
    window.__state.messagesData = items.slice();
    maybeSendSeen();
  });

  socket.on('message', (m) => {
    if (m.roomId !== window.__state.roomId && window.__state.roomId) return;
    appendMessage(messagesEl, socket, m, window.__state.username, scrollToMessage);
    window.__state.messagesData.push(m);
    maybeSendSeen();
  });

  socket.on('messageEdited', (patch) => {
    const i = window.__state.messagesData.findIndex((x) => (x._id || x.id) === patch.id);
    if (i >= 0) {
      const old = window.__state.messagesData[i];
      old.text = patch.newText ?? old.text;
      old.editedAt = patch.editedAt ?? old.editedAt;
      old.linkPreview = patch.linkPreview ?? old.linkPreview;
      if (patch.reactions) old.reactions = patch.reactions;
      if (patch.seenBy) old.seenBy = patch.seenBy;
      renderMessages(
        messagesEl,
        socket,
        window.__state.messagesData,
        window.__state.username,
        scrollToMessage,
        { scroll: false }
      );
    }
  });

  socket.on('messageDeleted', ({ id }) => {
    window.__state.messagesData = window.__state.messagesData.filter(
      (x) => (x._id || x.id) !== id
    );
    renderMessages(
      messagesEl,
      socket,
      window.__state.messagesData,
      window.__state.username,
      scrollToMessage,
      { scroll: false }
    );
  });

  socket.on('roomInfo', ({ topic, rules, slowModeSec, theme, pins, announcements }) => {
    const t = document.getElementById('roomTopic');
    const r = document.getElementById('roomRules');
    if (t) t.textContent = topic || '';
    if (r) r.textContent = rules || '';
    document.documentElement.dataset.theme = theme?.mode === 'dark' ? 'dark' : 'light';
    document.documentElement.style.setProperty('--accent', theme?.accent || '#0ea472');

    const pinEl = document.getElementById('pinList');
    if (pinEl) {
      pinEl.innerHTML = '';
      (pins || []).forEach((m) => {
        const li = document.createElement('li');
        li.textContent = (m.text || m.imageUrl || m.file?.name || '').slice(0, 60);
        li.title = new Date(m.createdAt).toLocaleString();
        li.style.cursor = 'pointer';
        li.addEventListener('click', () => scrollToMessage(m._id, m.createdAt));
        pinEl.appendChild(li);
      });
    }

    const ann = document.getElementById('announcements');
    if (ann) {
      ann.innerHTML = '';
      (announcements || [])
        .slice(-3)
        .reverse()
        .forEach((a) => {
          const div = document.createElement('div');
          div.className = 'announce';
          div.textContent = a.text;
          ann.appendChild(div);
        });
    }
  });

  socket.on('typing', ({ username: u, isTyping }) => {
    const el = document.getElementById('typingIndicator');
    if (!el) return;
    el.textContent = isTyping ? `${u} sedang mengetik...` : '';
  });

  socket.on('connect', () => document.body.classList.remove('offline'));
  socket.on('disconnect', () => document.body.classList.add('offline'));

  window.addEventListener('beforeunload', () => {
    try { socket.emit('leaveRoom'); } catch {}
    try { socket.disconnect(); } catch {}
  });

  return socket;
}

/* ---------- Pagination (cursor) ---------- */
function addPagination() {
  const scroller = document.getElementById('messages');
  let loading = false;

  async function loadOlderByCursor() {
    if (!window.__state.roomId || !nextCursor || loading) return;
    loading = true;
    try {
      const url = `/messages?room=${encodeURIComponent(
        window.__state.roomId
      )}&limit=50&cursor=${encodeURIComponent(nextCursor)}`;
      const { items, nextCursor: nxt } = await fetch(url).then((r) => r.json());
      if (!items?.length) {
        nextCursor = null;
        return;
      }
      const prev = scroller.scrollHeight;
      window.__state.messagesData = items.concat(window.__state.messagesData);
      renderMessages(scroller, socket, window.__state.messagesData, window.__state.username, scrollToMessage, { scroll: false });
      const added = scroller.scrollHeight - prev;
      scroller.scrollTop = added;
      nextCursor = nxt || null;
    } finally {
      loading = false;
    }
  }

  scroller?.addEventListener('scroll', () => {
    if (scroller.scrollTop <= 0 && nextCursor) loadOlderByCursor();
  });
}

/* ---------- Search ---------- */
function setupSearch() {
  const q = document.getElementById('searchInput');
  const btn = document.getElementById('searchBtn');
  const results = document.getElementById('searchResults');
  async function run() {
    const query = (q.value || '').trim();
    if (!query) return;
    const r = await fetch(
      `/search?room=${encodeURIComponent(window.__state.roomId || 'global')}&q=${encodeURIComponent(
        query
      )}`
    ).then((r) => r.json());
    results.innerHTML = '';
    (r.items || []).forEach((m) => {
      const item = document.createElement('div');
      item.className = 'result';
      item.textContent = `[${new Date(m.createdAt).toLocaleString()}] ${m.username}: ${(
        m.text || m.imageUrl || m.file?.name || ''
      ).slice(0, 80)}`;
      item.addEventListener('click', () => {
        document.getElementById('searchPanel').style.display = 'none';
        scrollToMessage(m._id, m.createdAt);
      });
      results.appendChild(item);
    });
    document.getElementById('searchPanel').style.display = 'block';
  }
  btn?.addEventListener('click', run);
}

/* ---------- Compose ---------- */
function setupForm() {
  const form = document.getElementById('form');
  const input = document.getElementById('input');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = (input?.value || '').trim();
    if (!text) return;

    if (text.startsWith('/')) {
      const handled = await handleSlash(text, { socket, input });
      if (handled) {
        input.value = '';
        const prev = document.getElementById('mdPreview');
        if (prev) prev.innerHTML = '';
        return;
      }
    }

    const payload = { text };
    if (window.__state.replyTo && (window.__state.replyTo._id || window.__state.replyTo.id)) {
      payload.parentId = window.__state.replyTo._id || window.__state.replyTo.id;
    }
    socket.emit('messageRoom', payload);
    input.value = '';
    const prev = document.getElementById('mdPreview');
    if (prev) prev.innerHTML = '';
    window.__state.replyTo = null;
    document.getElementById('replyBar')?.style.setProperty('display', 'none');
  });

  // upload
  const fileInput = document.getElementById('fileInput');
  document.getElementById('fileBtn')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('file', f);
    const r = await fetch('/upload', { method: 'POST', body: fd }).then((r) => r.json());
    if (r?.ok) socket.emit('sendFile', { file: { url: r.url, name: r.name, mime: r.mime, size: r.size } });
    fileInput.value = '';
  });
}

/* ---------- Misc UI ---------- */
function setupUI() {
  // toolbar markdown
  const input = document.getElementById('input');
  const mdPreview = document.getElementById('mdPreview');
  const insertAtCursor = (el, before, after = '') => {
    if (!el) return;
    el.focus();
    const s = el.selectionStart ?? el.value.length;
    const e = el.selectionEnd ?? el.value.length;
    const sel = el.value.slice(s, e);
    el.value = el.value.slice(0, s) + before + sel + after + el.value.slice(e);
    const caret = s + before.length + sel.length;
    el.setSelectionRange(caret, caret);
    if (window.__state.previewOn && mdPreview) mdPreview.innerHTML = renderMarkdown(el.value);
  };
  document.getElementById('mdBoldBtn')?.addEventListener('click', () => insertAtCursor(input, '**', '**'));
  document.getElementById('mdItalicBtn')?.addEventListener('click', () => insertAtCursor(input, '_', '_'));
  document.getElementById('mdCodeBtn')?.addEventListener('click', () => insertAtCursor(input, '`', '`'));
  document.getElementById('mdBlockBtn')?.addEventListener('click', () => insertAtCursor(input, '\n```\n', '\n```\n'));
  document.getElementById('mdLinkBtn')?.addEventListener('click', () => {
    const url = prompt('Masukkan URL:', 'https://');
    if (url) insertAtCursor(input, `[teks](${url})`, '');
  });
  document.getElementById('previewToggle')?.addEventListener('click', () => {
    window.__state.previewOn = !window.__state.previewOn;
    mdPreview.style.display = window.__state.previewOn ? 'block' : 'none';
    if (window.__state.previewOn) mdPreview.innerHTML = renderMarkdown(input.value);
  });

  document.getElementById('openRoomModal')?.addEventListener('click', () => {
    const m = document.getElementById('loginModal');
    if (m) m.style.display = 'flex';
  });

  // tabs & modal
  document.getElementById('btnTabGlobal')?.addEventListener('click', () => setMode('global'));
  document.getElementById('btnTabPrivate')?.addEventListener('click', () => setMode('private'));
  document.getElementById('openLoginBtn')?.addEventListener('click', showLogin);

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    try { socket.emit('leaveRoom'); } catch {}
    window.__state.username = '';
    window.__state.roomId = '';
    resetMessagesUI();
    setMode('global');
    showLogin();
  });
}

/* ---------- Helpers ---------- */
function scrollToMessage(id) {
  const messagesEl = document.getElementById('messages');
  if (!id) return;
  const node = messagesEl?.querySelector(`[data-id="${CSS.escape(String(id))}"]`);
  if (node) {
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.style.outline = `2px solid var(--accent)`;
    setTimeout(() => (node.style.outline = ''), 1200);
  } else {
    alert('Pesan induk belum termuat. Scroll ke atas untuk memuat riwayat lama.');
  }
}

function maybeSendSeen() {
  const el = document.getElementById('messages');
  if (!el || !window.__state.messagesData.length) return;
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  if (nearBottom) {
    const last = window.__state.messagesData[window.__state.messagesData.length - 1];
    socket.emit('seenUpTo', { lastId: last._id });
  }
}

/* ---------- Boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // refresh username dari DOM jika perlu
  window.__state.username = detectUsername();
  window.__state.roomId = currentRoomId();

  setupReplyBar();

  // Socket connect → server auto-join via cookie/session
  const s = setupSocket();
  s.connect();

  setupForm();
  setupUI();
  setupSearch();
  addPagination();

  // Gating composer & modal
  if (!window.__state.username) {
    setMode('global');
    showLogin();
  } else {
    hideLogin();
  }

  // Jangan register SW sampai CSP siap:
  // if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(() => {}); }
});
