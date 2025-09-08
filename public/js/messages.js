// public/js/messages.js (fully merged)
// - Tidak bergantung pada state.js; sinkron dengan main.js (window.__state & window.__onEdit/Del)
// - Memakai CSS variables (var(--border), var(--bg-soft), var(--me), var(--them)) agar theming konsisten
// - Dukungan: reply quote, poll, reactions, image/file bubble, link preview, seen count, edited label
// - Divider tanggal memakai messagesEl.dataset.lastDateKey (reset di main.js.resetMessagesUI)

import { renderMarkdown } from './markdown.js';

// ===== Utils lokal (hindari dependency eksternal) =====
function escapeHtml(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function truncate(str = '', n = 140) {
  const s = String(str);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ===== Link Preview =====
export function renderLinkPreview(lp) {
  if (!lp || !lp.url) return null;
  const card = document.createElement('a');
  card.href = lp.url; card.target = '_blank'; card.rel = 'noopener';
  card.className = 'link-card';
  card.style.cssText = 'display:flex;gap:10px;border:1px solid var(--border);border-radius:8px;padding:8px;margin-top:6px;text-decoration:none;color:inherit;';
  if (lp.image) {
    const img = document.createElement('img'); img.src = lp.image; img.alt = '';
    img.style.cssText = 'width:64px;height:64px;object-fit:cover;border-radius:6px;'; card.appendChild(img);
  }
  const box = document.createElement('div');
  const t = document.createElement('div'); t.style.fontWeight = '600'; t.textContent = lp.title || lp.url;
  const d = document.createElement('div'); d.style.cssText = 'font-size:12px;opacity:.85;'; d.textContent = lp.description || lp.siteName || '';
  box.appendChild(t); box.appendChild(d); card.appendChild(box);
  return card;
}

// ===== Reply Quote =====
function makeReplyQuote(parent, onScrollTo) {
  if (!parent) return null;
  const q = document.createElement('div');
  q.className = 'reply-quote';
  q.dataset.parentId = parent._id || parent.id || '';
  q.style.cssText = 'margin:6px 0;padding:6px 8px;border-left:3px solid #bbb;background:var(--bg-soft);border-radius:4px;';
  const u = document.createElement('div'); u.style.fontWeight = '600'; u.textContent = `@${parent.username || '?'}`;
  const t = document.createElement('div'); t.className = 'reply-snippet'; t.style.cssText = 'font-size:12px;opacity:.8;'; t.textContent = truncate(parent.text, 140);
  q.appendChild(u); q.appendChild(t); q.title = 'Klik untuk loncat ke pesan asal'; q.style.cursor = 'pointer';
  q.addEventListener('click', () => onScrollTo(parent._id || parent.id, parent.createdAt));
  return q;
}

// ===== Poll =====
function createPollNode(msg, socket, username) {
  const wrap = document.createElement('div'); wrap.className = 'poll';
  const q = document.createElement('div'); q.style.cssText = 'font-weight:700;margin:4px 0;'; q.textContent = msg.poll?.question || '(poll)';
  wrap.appendChild(q);
  const already = (i) => (msg.poll?.options?.[i]?.votes || []).includes(username);
  (msg.poll?.options || []).forEach((opt, i) => {
    const btn = document.createElement('button'); btn.className = 'poll-opt';
    const count = (opt.votes || []).length;
    btn.innerHTML = `${escapeHtml(opt.text)} <small>(${count})</small>`;
    btn.disabled = msg.poll?.isClosed || already(i);
    btn.style.cssText = 'display:block;width:100%;text-align:left;margin:6px 0;padding:8px;border:1px solid var(--border);border-radius:8px;';
    btn.addEventListener('click', () => socket.emit('votePoll', { id: msg._id || msg.id, optionIndex: i }, (res) => { if (!res?.ok) alert(res?.error || 'Gagal vote'); }));
    wrap.appendChild(btn);
  });
  if (msg.poll?.isClosed) {
    const cl = document.createElement('div'); cl.style.cssText = 'font-size:12px;opacity:.8;margin-top:4px;'; cl.textContent = '(poll ditutup)'; wrap.appendChild(cl);
  }
  return wrap;
}

// ===== Reactions =====
function makeReactionsBar(msg, socket, username) {
  const wrap = document.createElement('div');
  wrap.className = 'reactions';
  wrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;';
  const reactions = msg.reactions || {};
  const entries = Object.entries(reactions);
  const mkChip = (emo, n, active) => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (active ? ' active' : '');
    chip.textContent = `${emo} ${n}`;
    chip.style.cssText = 'font-size:12px;padding:2px 6px;border:1px solid var(--border);border-radius:999px;background:var(--bg-soft);';
    chip.addEventListener('click', () => socket.emit('reactMessage', { id: msg._id || msg.id, emoji: emo }));
    return chip;
  };
  // existing chips
  entries.forEach(([emo, users]) => {
    wrap.appendChild(mkChip(emo, (users || []).length, (users || []).includes(username)));
  });
  // defaults
  ['👍','❤️','😂'].forEach(emo => { if (!reactions[emo]) wrap.appendChild(mkChip(emo, 0, false)); });
  return wrap;
}

// ===== Message Node =====
export function createMsgNode(socket, msg, { username, onEdit, onDelete, scrollToMessage }) {
  const self = (msg.username === username);
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + (self ? 'right' : 'left');
  wrap.dataset.id = msg._id || msg.id;

  const avatar = document.createElement('div'); avatar.className = 'avatar'; avatar.textContent = (msg.username || '?')[0]?.toUpperCase() || '?';
  const bubbleWrap = document.createElement('div');
  const bubble = document.createElement('div'); bubble.className = 'bubble';

  const title = document.createElement('strong'); title.style.color = self ? 'var(--me)' : 'var(--them)'; title.textContent = msg.username;
  bubble.appendChild(title);

  const quote = makeReplyQuote(msg.parent, scrollToMessage); if (quote) bubble.appendChild(quote);

  if (msg.type === 'poll') {
    bubble.appendChild(createPollNode(msg, socket, username));
  } else if (msg.type === 'image' && msg.imageUrl) {
    const img = document.createElement('img'); img.src = msg.imageUrl; img.alt = 'image'; img.style.cssText = 'max-width:260px;border-radius:8px;margin-top:6px;'; bubble.appendChild(img);
  } else if (msg.type === 'file' && msg.file?.url) {
    const a = document.createElement('a'); a.href = msg.file.url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = `📎 ${msg.file.name || 'file'}`; a.style.display = 'inline-block'; a.style.marginTop = '6px';
    bubble.appendChild(a);
  } else {
    const content = document.createElement('div'); content.className = 'msg-text'; content.style.marginTop = '6px';
    content.innerHTML = renderMarkdown(msg.text || '');
    if (msg.flagged) { const fl = document.createElement('div'); fl.className = 'flag'; fl.textContent = '(difilter)'; fl.style.cssText = 'font-size:11px;opacity:.7;margin-top:2px;'; content.appendChild(fl); }
    bubble.appendChild(content);
    const lp = renderLinkPreview(msg.linkPreview); if (lp) bubble.appendChild(lp);
  }

  // Controls
  const controls = document.createElement('div'); controls.className = 'msg-controls'; controls.style.marginTop = '4px';
  const btnReply = document.createElement('button'); btnReply.textContent = 'Reply'; btnReply.className = 'btn-reply';
  btnReply.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('app:set-reply', { detail: { _id: msg._id || msg.id, username: msg.username, text: msg.text, createdAt: msg.createdAt } }));
  });
  controls.appendChild(btnReply);
  if (self && (msg.type === 'text' || !msg.type)) {
    const btnEdit = document.createElement('button'); btnEdit.textContent = 'Edit'; btnEdit.className = 'btn-edit'; btnEdit.style.marginLeft = '6px';
    btnEdit.addEventListener('click', () => onEdit?.(msg._id || msg.id));
    const btnDel = document.createElement('button'); btnDel.textContent = 'Hapus'; btnDel.className = 'btn-del'; btnDel.style.marginLeft = '6px';
    btnDel.addEventListener('click', () => onDelete?.(msg._id || msg.id));
    controls.appendChild(btnEdit); controls.appendChild(btnDel);
  }
  bubble.appendChild(controls);

  // Reactions
  bubble.appendChild(makeReactionsBar(msg, socket, username));

  // Meta
  const meta = document.createElement('div'); meta.className = 'meta';
  const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const seen = (msg.seenBy?.length ? ` • dilihat ${msg.seenBy.length}` : '');
  meta.textContent = time + (msg.editedAt ? ' • edited' : '') + seen;

  bubbleWrap.appendChild(bubble); bubbleWrap.appendChild(meta);
  wrap.appendChild(avatar); wrap.appendChild(bubbleWrap);
  return wrap;
}

// ===== Date Divider =====
export function ensureDateDivider(messagesEl, createdAt) {
  const d = new Date(createdAt);
  const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const last = messagesEl.dataset.lastDateKey || '';
  if (k !== last) {
    const div = document.createElement('div'); div.className = 'date-divider';
    const td = new Date();
    const todayK = `${td.getFullYear()}-${String(td.getMonth()+1).padStart(2,'0')}-${String(td.getDate()).padStart(2,'0')}`;
    div.textContent = (k === todayK) ? 'Hari ini' : d.toLocaleDateString([], { day:'2-digit', month:'short', year:'numeric' });
    messagesEl.appendChild(div);
    messagesEl.dataset.lastDateKey = k;
  }
}

// ===== Append & Render =====
export function appendMessage(messagesEl, socket, msg, username, scrollToMessage) {
  ensureDateDivider(messagesEl, msg.createdAt);
  const shouldStick = (messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight) < 40;
  messagesEl.appendChild(createMsgNode(socket, msg, { username, onEdit: window.__onEdit, onDelete: window.__onDelete, scrollToMessage }));
  if (shouldStick) messagesEl.scrollTop = messagesEl.scrollHeight;
}

export function renderMessages(messagesEl, socket, list, username, scrollToMessage, { scroll = true } = {}) {
  messagesEl.innerHTML = ''; messagesEl.dataset.lastDateKey = '';
  list.forEach(m => {
    ensureDateDivider(messagesEl, m.createdAt);
    messagesEl.appendChild(createMsgNode(socket, m, { username, onEdit: window.__onEdit, onDelete: window.__onDelete, scrollToMessage }));
  });
  if (scroll) messagesEl.scrollTop = messagesEl.scrollHeight;
}
