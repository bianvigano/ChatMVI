import { fmtTime, fmtDateLabel, dateKey, truncate, escapeHtml } from './utils.js';
import { renderMarkdown } from './markdown.js';
import { state } from './state.js';

export function ensureDateDivider(messagesEl, createdAt) {
  const k = dateKey(createdAt);
  if (k !== state.lastDateKey) {
    const div = document.createElement('div');
    div.className = 'date-divider';
    const todayK = dateKey(new Date());
    div.textContent = (k === todayK) ? 'Hari ini' : fmtDateLabel(createdAt);
    messagesEl.appendChild(div);
    state.lastDateKey = k;
  }
}

export function renderLinkPreview(lp) {
  if (!lp || !lp.url) return null;
  const card = document.createElement('a');
  card.href = lp.url; card.target = '_blank'; card.rel = 'noopener';
  card.className = 'link-card';
  card.style.cssText = 'display:flex;gap:10px;border:1px solid #e2e2e2;border-radius:8px;padding:8px;margin-top:6px;text-decoration:none;color:inherit;';
  if (lp.image) { const img = document.createElement('img'); img.src = lp.image; img.alt = ''; img.style.cssText = 'width:64px;height:64px;object-fit:cover;border-radius:6px;'; card.appendChild(img); }
  const box = document.createElement('div');
  const t = document.createElement('div'); t.style.fontWeight = '600'; t.textContent = lp.title || lp.url;
  const d = document.createElement('div'); d.style.cssText = 'font-size:12px;opacity:.85;'; d.textContent = lp.description || lp.siteName || '';
  box.appendChild(t); box.appendChild(d); card.appendChild(box);
  return card;
}

export function makeReplyQuote(parent, scrollToMessage) {
  if (!parent) return null;
  const q = document.createElement('div');
  q.className = 'reply-quote';
  q.dataset.parentId = parent._id || parent.id || '';
  q.style.cssText = 'margin:6px 0;padding:6px 8px;border-left:3px solid #bbb;background:#fafafa;border-radius:4px;';
  const u = document.createElement('div'); u.style.fontWeight = '600'; u.textContent = `@${parent.username || '?'}`;
  const t = document.createElement('div'); t.className = 'reply-snippet'; t.style.cssText = 'font-size:12px;opacity:.8;'; t.textContent = truncate(parent.text, 140);
  q.appendChild(u); q.appendChild(t); q.title = 'Klik untuk loncat ke pesan asal'; q.style.cursor = 'pointer';
  q.addEventListener('click', () => scrollToMessage(parent._id, parent.createdAt));
  return q;
}

export function createPollNode(socket, msg, username) {
  const wrap = document.createElement('div'); wrap.className = 'poll';
  const q = document.createElement('div'); q.style.cssText = 'font-weight:700;margin:4px 0;'; q.textContent = msg.poll?.question || '(poll)';
  wrap.appendChild(q);
  const already = (i) => (msg.poll?.options?.[i]?.votes || []).includes(username);
  (msg.poll?.options || []).forEach((opt, i) => {
    const btn = document.createElement('button'); btn.className = 'poll-opt';
    const count = (opt.votes || []).length;
    btn.innerHTML = `${escapeHtml(opt.text)} <small>(${count})</small>`;
    btn.disabled = msg.poll?.isClosed || already(i);
    btn.style.cssText = 'display:block;width:100%;text-align:left;margin:6px 0;padding:8px;border:1px solid #ddd;border-radius:8px;';
    btn.addEventListener('click', () => socket.emit('votePoll', { id: msg._id, optionIndex: i }, (res) => { if (!res?.ok) alert(res?.error || 'Gagal vote'); }));
    wrap.appendChild(btn);
  });
  if (msg.poll?.isClosed) {
    const cl = document.createElement('div'); cl.style.cssText = 'font-size:12px;opacity:.8;margin-top:4px;'; cl.textContent = '(poll ditutup)'; wrap.appendChild(cl);
  } else if (msg.username === username) {
    const cb = document.createElement('button'); cb.textContent = 'Tutup Poll'; cb.style.cssText = 'margin-top:6px;font-size:12px;';
    cb.addEventListener('click', () => socket.emit('closePoll', { id: msg._id }, (res) => { if (!res?.ok) alert(res?.error || 'Gagal menutup poll'); }));
    wrap.appendChild(cb);
  }
  return wrap;
}

export function createMsgNode(socket, msg, { username, onEdit, onDelete, scrollToMessage }) {
  const self = (msg.username === username);
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + (self ? 'right' : 'left');
  wrap.dataset.id = msg._id || msg.id;

  const avatar = document.createElement('div'); avatar.className = 'avatar'; avatar.textContent = (msg.username || '?')[0]?.toUpperCase() || '?';
  const bubbleWrap = document.createElement('div');
  const bubble = document.createElement('div'); bubble.className = 'bubble';

  const title = document.createElement('strong'); title.style.color = self ? '#0b5d25' : '#7b1fa2'; title.textContent = msg.username;
  bubble.appendChild(title);

  const quote = makeReplyQuote(msg.parent, scrollToMessage); if (quote) bubble.appendChild(quote);

  if (msg.type === 'poll') {
    bubble.appendChild(createPollNode(socket, msg, username));
  } else if (msg.type === 'image' && msg.imageUrl) {
    const img = document.createElement('img'); img.src = msg.imageUrl; img.alt = 'image'; img.style.cssText = 'max-width:260px;border-radius:8px;margin-top:6px;'; bubble.appendChild(img);
  } else {
    const content = document.createElement('div'); content.className = 'msg-text'; content.style.marginTop = '6px';
    content.innerHTML = renderMarkdown(msg.text);
    bubble.appendChild(content);
    const lp = renderLinkPreview(msg.linkPreview);
    if (lp) bubble.appendChild(lp);
  }

  const controls = document.createElement('div'); controls.className = 'msg-controls'; controls.style.marginTop = '4px';
  const btnReply = document.createElement('button'); btnReply.textContent = 'Reply'; btnReply.className = 'btn-reply';
  btnReply.addEventListener('click', () => {
    state.replyTo = { _id: msg._id || msg.id, username: msg.username, text: msg.text, createdAt: msg.createdAt };
    const ev = new CustomEvent('app:set-reply', { detail: state.replyTo });
    window.dispatchEvent(ev);
  });
  controls.appendChild(btnReply);
  if (self && msg.type === 'text') {
    const btnEdit = document.createElement('button'); btnEdit.textContent = 'Edit'; btnEdit.className = 'btn-edit'; btnEdit.style.marginLeft = '6px';
    btnEdit.addEventListener('click', () => onEdit(wrap.dataset.id));
    const btnDel = document.createElement('button'); btnDel.textContent = 'Hapus'; btnDel.className = 'btn-del'; btnDel.style.marginLeft = '6px';
    btnDel.addEventListener('click', () => onDelete(wrap.dataset.id));
    controls.appendChild(btnEdit); controls.appendChild(btnDel);
  }
  bubble.appendChild(controls);

  const meta = document.createElement('div'); meta.className = 'meta';
  meta.textContent = fmtTime(msg.createdAt) + (msg.editedAt ? ' • edited' : '');
  bubbleWrap.appendChild(bubble); bubbleWrap.appendChild(meta);

  wrap.appendChild(avatar); wrap.appendChild(bubbleWrap);
  return wrap;
}

export function appendMessage(messagesEl, socket, msg, username, scrollToMessage) {
  state.messagesData.push(msg);
  if (!state.oldestAt || new Date(msg.createdAt) < new Date(state.oldestAt)) state.oldestAt = msg.createdAt;
  ensureDateDivider(messagesEl, msg.createdAt);
  const scrollerEl = messagesEl;
  const shouldStick = (scrollerEl.scrollHeight - scrollerEl.scrollTop - scrollerEl.clientHeight) < 40;
  messagesEl.appendChild(createMsgNode(socket, msg, { username, onEdit: ()=>{}, onDelete: ()=>{}, scrollToMessage }));
  if (shouldStick) scrollerEl.scrollTop = scrollerEl.scrollHeight;
}

export function renderMessages(messagesEl, socket, list, username, scrollToMessage, { scroll = true } = {}) {
  messagesEl.innerHTML = ''; state.lastDateKey = null; state.messagesData = []; state.oldestAt = null;
  list.forEach((m) => {
    ensureDateDivider(messagesEl, m.createdAt);
    messagesEl.appendChild(createMsgNode(socket, m, { username, onEdit: ()=>{}, onDelete: ()=>{}, scrollToMessage }));
    if (!state.oldestAt || new Date(m.createdAt) < new Date(state.oldestAt)) state.oldestAt = m.createdAt;
  });
  state.messagesData = list.slice();
  if (scroll) messagesEl.parentElement.scrollTop = messagesEl.parentElement.scrollHeight;
}
