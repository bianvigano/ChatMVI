// public/js/messages.js
import { renderMarkdown } from './markdown.js';

/** Format util */
function fmtTime(t) {
  const d = new Date(t);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function dateKey(x) {
  const d = new Date(x);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Divider tanggal (pakai dataset container) */
export function ensureDateDivider(container, createdAt) {
  if (!container) return;
  const k = dateKey(createdAt);
  const last = container.dataset.lastDateKey || '';
  if (k !== last) {
    const div = document.createElement('div');
    div.className = 'date-divider';
    const todayK = dateKey(Date.now());
    div.textContent = (k === todayK) ? 'Hari ini' : new Date(createdAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
    container.appendChild(div);
    container.dataset.lastDateKey = k;
  }
}

/** Kartu link preview sederhana */
function createLinkPreview(lp) {
  if (!lp || !lp.url) return null;
  const card = document.createElement('a');
  card.href = lp.url;
  card.target = '_blank';
  card.rel = 'noopener';
  card.className = 'link-card';
  card.style.cssText = 'display:flex;gap:10px;border:1px solid #e2e2e2;border-radius:8px;padding:8px;margin-top:6px;text-decoration:none;color:inherit;';
  if (lp.image) {
    const img = document.createElement('img');
    img.src = lp.image; img.alt = '';
    img.style.cssText = 'width:64px;height:64px;object-fit:cover;border-radius:6px;';
    card.appendChild(img);
  }
  const box = document.createElement('div');
  const t = document.createElement('div'); t.style.fontWeight = '600'; t.textContent = lp.title || lp.url;
  const d = document.createElement('div'); d.style.cssText = 'font-size:12px;opacity:.85;'; d.textContent = lp.description || lp.siteName || '';
  box.appendChild(t); box.appendChild(d); card.appendChild(box);
  return card;
}

/** Quote untuk reply */
function makeReplyQuote(parent, scrollToMessage) {
  if (!parent) return null;
  const q = document.createElement('div');
  q.className = 'reply-quote';
  q.dataset.parentId = parent._id || parent.id || '';
  q.style.cssText = 'margin:6px 0;padding:6px 8px;border-left:3px solid #bbb;background:#fafafa;border-radius:4px;cursor:pointer;';
  const u = document.createElement('div'); u.className = 'author'; u.style.fontWeight = '600'; u.textContent = `@${parent.username || '?'}`;
  const t = document.createElement('div'); t.className = 'reply-snippet'; t.style.cssText = 'font-size:12px;opacity:.8;'; t.textContent = (parent.text || '').slice(0, 140);
  q.appendChild(u); q.appendChild(t);
  q.title = 'Klik untuk loncat ke pesan asal';
  q.addEventListener('click', () => scrollToMessage?.(parent._id, parent.createdAt));
  return q;
}

/** Node pesan */
function createMsgNode(msg, youName, scrollToMessage) {
  const self = (msg.username === youName);
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + (self ? 'right' : 'left');
  wrap.dataset.id = msg._id || msg.id;
  wrap.dataset.username = msg.username || '';
  wrap.dataset.created = msg.createdAt || '';

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = (msg.username || '?')[0]?.toUpperCase() || '?';

  const bubbleWrap = document.createElement('div');
  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  const title = document.createElement('strong');
  title.className = 'author';
  title.style.color = self ? '#0b5d25' : '#7b1fa2';
  title.textContent = msg.username;

  bubble.appendChild(title);

  // reply quote
  const quote = makeReplyQuote(msg.parent, scrollToMessage);
  if (quote) bubble.appendChild(quote);

  // content
  if (msg.type === 'poll') {
    const wrapPoll = document.createElement('div'); wrapPoll.className = 'poll';
    const q = document.createElement('div'); q.style.cssText = 'font-weight:700;margin:4px 0;'; q.textContent = msg.poll?.question || '(poll)';
    wrapPoll.appendChild(q);
    (msg.poll?.options || []).forEach((opt, i) => {
      const btn = document.createElement('button'); btn.className = 'poll-opt';
      const count = (opt.votes || []).length;
      btn.innerHTML = `${opt.text} <small>(${count})</small>`;
      btn.disabled = msg.poll?.isClosed || (opt.votes || []).includes(youName);
      btn.style.cssText = 'display:block;width:100%;text-align:left;margin:6px 0;padding:8px;border:1px solid #ddd;border-radius:8px;';
      // vote dikirim via event delegation 'react' jika mau, atau langsung socket disini (disederhanakan, biar tetap murni)
      wrapPoll.appendChild(btn);
    });
    bubble.appendChild(wrapPoll);
  } else if (msg.type === 'image' && msg.imageUrl) {
    const img = document.createElement('img');
    img.src = msg.imageUrl; img.alt = 'image';
    img.style.cssText = 'max-width:260px;border-radius:8px;margin-top:6px;';
    bubble.appendChild(img);
  } else if (msg.type === 'file' && msg.file?.url) {
    const a = document.createElement('a');
    a.href = msg.file.url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = msg.file.name || 'file';
    bubble.appendChild(a);
  } else {
    const content = document.createElement('div');
    content.className = 'msg-text';
    content.style.marginTop = '6px';
    content.innerHTML = renderMarkdown(msg.text || '');
    bubble.appendChild(content);
    const lp = createLinkPreview(msg.linkPreview);
    if (lp) bubble.appendChild(lp);
  }

  // controls
  const controls = document.createElement('div');
  controls.className = 'msg-controls';
  controls.style.marginTop = '4px';

  const btnReply = document.createElement('button');
  btnReply.textContent = 'Reply';
  btnReply.setAttribute('data-action', 'reply');
  controls.appendChild(btnReply);

  if (self && msg.type === 'text') {
    const btnEdit = document.createElement('button');
    btnEdit.textContent = 'Edit';
    btnEdit.setAttribute('data-action', 'edit');
    btnEdit.style.marginLeft = '6px';

    const btnDel = document.createElement('button');
    btnDel.textContent = 'Hapus';
    btnDel.setAttribute('data-action', 'delete');
    btnDel.style.marginLeft = '6px';

    controls.appendChild(btnEdit);
    controls.appendChild(btnDel);
  }
  bubble.appendChild(controls);

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = fmtTime(msg.createdAt) + (msg.editedAt ? ' • edited' : '');

  bubbleWrap.appendChild(bubble);
  bubbleWrap.appendChild(meta);
  wrap.appendChild(avatar);
  wrap.appendChild(bubbleWrap);

  return wrap;
}

/** Render semua pesan */
export function renderMessages(container, socket, list, youName, scrollToMessage, { scroll = true } = {}) {
  if (!container) return;
  container.innerHTML = '';
  container.dataset.lastDateKey = '';
  list.forEach((m) => {
    ensureDateDivider(container, m.createdAt);
    container.appendChild(createMsgNode(m, youName, scrollToMessage));
  });
  if (scroll) {
    container.scrollTop = container.scrollHeight;
  }
}

/** Tambah satu pesan ke bawah */
export function appendMessage(container, socket, msg, youName, scrollToMessage) {
  if (!container) return;
  const nearBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) < 40;
  ensureDateDivider(container, msg.createdAt);
  container.appendChild(createMsgNode(msg, youName, scrollToMessage));
  if (nearBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

/** Ambil snippet teks untuk balasan (teks/gambar/file) */
function getMessageSnippet(wrap) {
  const textEl = wrap.querySelector('.msg-text');
  if (textEl) {
    const t = (textEl.textContent || '').trim();
    if (t) return t;
  }
  const img = wrap.querySelector('img');
  if (img) return '🖼️ Gambar';
  const fileLink = wrap.querySelector('a[href]');
  if (fileLink) return `📎 ${fileLink.textContent || 'Berkas'}`;
  return '';
}

/** Event delegation untuk Reply/Edit/Hapus/React */
export function bindMessageEvents(container, socket, getUsername) {
  if (!container) return;

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || !container.contains(btn)) return;

    const action = btn.dataset.action;
    const wrap = btn.closest('.msg');
    if (!wrap) return;

    const id = wrap.dataset.id;
    const author = wrap.dataset.username || wrap.querySelector('.author')?.textContent || '';
    const isSelf = getUsername && getUsername() && (getUsername() === author);

    if (action === 'reply') {
      const text = getMessageSnippet(wrap);
      const createdAt = wrap.dataset.created || null;

      window.dispatchEvent(new CustomEvent('app:set-reply', {
        detail: { _id: id, id, username: author, text, createdAt }
      }));
      document.getElementById('input')?.focus();
      return;
    }

    if (action === 'edit') {
      if (!isSelf) return alert('Tidak bisa edit pesan orang lain.');
      window.__onEdit?.(id);
      return;
    }

    if (action === 'delete') {
      if (!isSelf) return alert('Tidak bisa menghapus pesan orang lain.');
      window.__onDelete?.(id);
      return;
    }

    if (action === 'react') {
      const emoji = btn.dataset.emoji;
      if (!emoji) return;
      socket.emit('reactMessage', { id, emoji });
      return;
    }
  });
}


/** Event delegation untuk Reply/Edit/Hapus/React */
// export function bindMessageEvents(container, socket, getUsername) {
//   if (!container) return;

//   container.addEventListener('click', (e) => {
//     const btn = e.target.closest('[data-action]');
//     if (!btn || !container.contains(btn)) return;

//     const action = btn.dataset.action;
//     const wrap = btn.closest('.msg');
//     if (!wrap) return;

//     const id = wrap.dataset.id;
//     const author = wrap.dataset.username || wrap.querySelector('.author')?.textContent || '';
//     const isSelf = getUsername && getUsername() && (getUsername() === author);

//     if (action === 'reply') {
//       const text = wrap.querySelector('.msg-text')?.textContent || '';
//       const createdAt = wrap.dataset.created || null;

//       window.dispatchEvent(new CustomEvent('app:set-reply', {
//         detail: { _id: id, id, username: author, text, createdAt }
//       }));
//       document.getElementById('input')?.focus();
//       return;
//     }

//     if (action === 'edit') {
//       if (!isSelf) return alert('Tidak bisa edit pesan orang lain.');
//       window.__onEdit?.(id);
//       return;
//     }

//     if (action === 'delete') {
//       if (!isSelf) return alert('Tidak bisa menghapus pesan orang lain.');
//       window.__onDelete?.(id);
//       return;
//     }

//     if (action === 'react') {
//       const emoji = btn.dataset.emoji;
//       if (!emoji) return;
//       socket.emit('reactMessage', { id, emoji });
//       return;
//     }
//   });
// }
