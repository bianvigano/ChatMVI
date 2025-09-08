import { EMOJI, STICKERS } from './config.js';
import { state, getRoomPw, setRoomPw, delRoomPw } from './state.js';
import { renderMarkdown } from './markdown.js';
import { createTyping } from './typing.js';
import { handleSlash } from './slash.js';
import { renderMessages, appendMessage, ensureDateDivider, createMsgNode, renderLinkPreview } from './messages.js';

function insertAtCursor(el, before, after = '') {
  if (!el) return;
  el.focus();
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const sel = el.value.slice(start, end);
  const out = el.value.slice(0, start) + before + sel + after + el.value.slice(end);
  el.value = out;
  const caret = start + before.length + sel.length;
  el.setSelectionRange(caret, caret);
  const mdPreview = document.getElementById('mdPreview');
  if (state.previewOn && mdPreview) mdPreview.innerHTML = renderMarkdown(el.value);
}

function setComposeEnabled(en) {
  const input = document.getElementById('input');
  if (input) input.disabled = !en;
  const sb = document.querySelector('#form button[type="submit"]');
  if (sb) sb.disabled = !en;
}

function showLogin() {
  const loginModal = document.getElementById('loginModal');
  const usernameGlobalInput = document.getElementById('usernameGlobalInput');
  const usernamePrivateInput = document.getElementById('usernamePrivateInput');
  const roomInput = document.getElementById('roomInput');
  const passwordInput = document.getElementById('passwordInput');
  if (!loginModal) return;
  loginModal.style.display = 'flex'; setComposeEnabled(false);
  if (usernameGlobalInput) usernameGlobalInput.value = state.username || '';
  if (usernamePrivateInput) usernamePrivateInput.value = state.username || '';
  if (state.roomId && state.roomId !== 'global' && roomInput) roomInput.value = state.roomId;
  if (passwordInput) passwordInput.value = '';
}
function hideLogin() {
  const loginModal = document.getElementById('loginModal');
  if (!loginModal) return; loginModal.style.display = 'none'; setComposeEnabled(true);
}
function setMode(mode) {
  const btnTabGlobal = document.getElementById('btnTabGlobal');
  const btnTabPrivate = document.getElementById('btnTabPrivate');
  const globalPanel = document.getElementById('globalPanel');
  const privatePanel = document.getElementById('privatePanel');
  if (!globalPanel || !privatePanel || !btnTabGlobal || !btnTabPrivate) return;
  if (mode === 'global') { globalPanel.style.display = ''; privatePanel.style.display = 'none'; btnTabGlobal.classList.add('active'); btnTabPrivate.classList.remove('active'); }
  else { globalPanel.style.display = 'none'; privatePanel.style.display = ''; btnTabGlobal.classList.remove('active'); btnTabPrivate.classList.add('active'); }
}

function resetMessagesUI() {
  const messagesEl = document.getElementById('messages');
  if (messagesEl) messagesEl.innerHTML = '';
  state.lastDateKey = null; state.messagesData = []; state.oldestAt = null;
  window.dispatchEvent(new CustomEvent('app:set-reply', { detail: null }));
}

function setupReplyBar() {
  const form = document.getElementById('form');
  let replyBar = document.getElementById('replyBar'),
      replyUserEl = document.getElementById('replyUser'),
      replyTextEl = document.getElementById('replyText'),
      replyCancelBtn = document.getElementById('replyCancelBtn');
  if (!replyBar && form && form.parentNode) {
    replyBar = document.createElement('div');
    replyBar.id = 'replyBar'; replyBar.style.cssText = 'display:none;padding:6px 10px;font-size:12px;background:#f1f3f5;border-left:3px solid #7b1fa2;margin:6px 0;border-radius:4px;';
    const left = document.createElement('div'); left.innerHTML = 'Membalas <b id="replyUser"></b>: <span id="replyText"></span>';
    replyUserEl = left.querySelector('#replyUser'); replyTextEl = left.querySelector('#replyText');
    const right = document.createElement('button'); right.type = 'button'; right.id = 'replyCancelBtn'; right.textContent = 'Batal'; right.style.cssText = 'float:right;margin-left:8px;';
    replyBar.appendChild(left); replyBar.appendChild(right); form.parentNode.insertBefore(replyBar, form); replyCancelBtn = right;
  }
  window.addEventListener('app:set-reply', (e) => {
    state.replyTo = e.detail;
    if (state.replyTo) {
      replyUserEl.textContent = state.replyTo.username || '?';
      replyTextEl.textContent = (state.replyTo.text || '').slice(0, 120);
      replyBar.style.display = 'block';
      document.getElementById('input')?.focus();
    } else {
      replyBar.style.display = 'none';
    }
  });
  replyCancelBtn?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); window.dispatchEvent(new CustomEvent('app:set-reply', { detail: null })); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.replyTo) { e.preventDefault(); window.dispatchEvent(new CustomEvent('app:set-reply', { detail: null })); } });
}

function renderEmojiGrid(list) {
  const emojiGrid = document.getElementById('emojiGrid');
  const emojiPanel = document.getElementById('emojiPanel');
  const input = document.getElementById('input');
  if (!emojiGrid) return;
  emojiGrid.innerHTML = '';
  list.forEach(item => {
    const cell = document.createElement('div'); cell.className = 'cell'; cell.title = item.s;
    cell.textContent = item.e;
    cell.addEventListener('click', () => {
      insertAtCursor(input, item.e, '');
      if (emojiPanel) emojiPanel.style.display = 'none';
      input?.focus();
    });
    emojiGrid.appendChild(cell);
  });
}

function setupPanels() {
  const emojiBtn = document.getElementById('emojiBtn');
  const emojiPanel = document.getElementById('emojiPanel');
  const emojiSearch = document.getElementById('emojiSearch');

  const gifBtn = document.getElementById('gifBtn');
  const gifPanel = document.getElementById('gifPanel');
  const gifQuery = document.getElementById('gifQuery');
  const gifSendBtn = document.getElementById('gifSendBtn');

  const stickerBtn = document.getElementById('stickerBtn');
  const stickerPanel = document.getElementById('stickerPanel');
  const stickerGrid = document.getElementById('stickerGrid');

  if (document.getElementById('emojiGrid')) renderEmojiGrid(EMOJI);

  emojiBtn?.addEventListener('click', () => {
    if (!emojiPanel) return;
    const shown = emojiPanel.style.display !== 'none';
    emojiPanel.style.display = shown ? 'none' : 'block';
    if (!shown && emojiSearch) { emojiSearch.value = ''; renderEmojiGrid(EMOJI); emojiSearch.focus(); }
  });

  emojiSearch?.addEventListener('input', () => {
    const q = emojiSearch.value.trim().toLowerCase();
    const filtered = !q ? EMOJI : EMOJI.filter(x => x.s.includes(q));
    renderEmojiGrid(filtered);
  });

  gifBtn?.addEventListener('click', () => {
    if (!gifPanel) return;
    const shown = gifPanel.style.display !== 'none';
    gifPanel.style.display = shown ? 'none' : 'block';
    if (!shown) gifQuery?.focus();
  });
  gifSendBtn?.addEventListener('click', () => {
    const socket = window.__socket; if (!socket) return;
    const q = (gifQuery?.value || '').trim(); if (!q) return alert('Ketik kata kunci GIF');
    socket.emit('slash', { cmd: 'giphy', args: [q] }, (res) => {
      if (!res?.ok) alert(res?.error || 'Gagal kirim GIF');
    });
    if (gifPanel) gifPanel.style.display = 'none';
    if (gifQuery) gifQuery.value = '';
  });

  if (stickerGrid) {
    stickerGrid.innerHTML = '';
    STICKERS.forEach(url => {
      const cell = document.createElement('div'); cell.className = 'cell'; cell.title = url;
      const img = document.createElement('img'); img.src = url; img.alt = 'sticker';
      img.style.cssText = 'height:30px; width:30px; object-fit:cover; border-radius:4px;';
      cell.appendChild(img);
      cell.addEventListener('click', () => {
        const socket = window.__socket; if (!socket) return;
        socket.emit('sendImage', { imageUrl: url }, (res) => {
          if (!res?.ok) alert(res?.error || 'Gagal kirim sticker');
        });
        if (stickerPanel) stickerPanel.style.display = 'none';
      });
      stickerGrid.appendChild(cell);
    });
  }

  document.addEventListener('click', (e) => {
    if (emojiPanel) {
      const inEmoji = e.target.closest?.('#emojiPanel, #emojiBtn');
      if (!inEmoji) emojiPanel.style.display = 'none';
    }
    if (gifPanel) {
      const inGif = e.target.closest?.('#gifPanel, #gifBtn');
      if (!inGif) gifPanel.style.display = 'none';
    }
    if (stickerPanel) {
      const inSticker = e.target.closest?.('#stickerPanel, #stickerBtn');
      if (!inSticker) stickerPanel.style.display = 'none';
    }
  });
}

function setupToolbar() {
  const input = document.getElementById('input');
  const mdPreview = document.getElementById('mdPreview');
  document.getElementById('mdBoldBtn')?.addEventListener('click', () => insertAtCursor(input, '**', '**'));
  document.getElementById('mdItalicBtn')?.addEventListener('click', () => insertAtCursor(input, '_', '_'));
  document.getElementById('mdCodeBtn')?.addEventListener('click', () => insertAtCursor(input, '`', '`'));
  document.getElementById('mdBlockBtn')?.addEventListener('click', () => insertAtCursor(input, '\n```\n', '\n```\n'));
  document.getElementById('mdLinkBtn')?.addEventListener('click', () => {
    const url = prompt('Masukkan URL:', 'https://'); if (!url) return;
    insertAtCursor(input, `[teks](${url})`, '');
  });
  document.getElementById('previewToggle')?.addEventListener('click', () => {
    state.previewOn = !state.previewOn;
    if (!mdPreview) return;
    mdPreview.style.display = state.previewOn ? 'block' : 'none';
    document.getElementById('previewToggle').classList.toggle('active', state.previewOn);
    if (state.previewOn) mdPreview.innerHTML = renderMarkdown(input.value);
  });
  input?.addEventListener('input', () => {
    if (state.previewOn && mdPreview) mdPreview.innerHTML = renderMarkdown(input.value);
  });
}

function setupSuggest(input) {
  let suggestBox = null, suggestIndex = 0, suggestList = [];
  function ensureSuggestBox() {
    if (suggestBox) return suggestBox;
    suggestBox = document.createElement('div');
    suggestBox.className = 'emoji-suggest'; suggestBox.style.display = 'none';
    document.body.appendChild(suggestBox);
    return suggestBox;
  }
  function showSuggest(items) {
    ensureSuggestBox();
    suggestBox.innerHTML = ''; suggestList = items.slice(0, 50); suggestIndex = 0;
    suggestList.forEach((it, i) => {
      const row = document.createElement('div'); row.className = 'item' + (i === 0 ? ' active' : '');
      row.dataset.idx = i;
      row.innerHTML = `<span style="font-size:18px">${it.e}</span> <span class="short">${it.s}</span>`;
      row.addEventListener('mousedown', (ev) => { ev.preventDefault(); applySuggest(i); });
      suggestBox.appendChild(row);
    });
    const r = input.getBoundingClientRect();
    suggestBox.style.left = (r.left) + 'px';
    suggestBox.style.top = (r.top - 8 - Math.min(220, suggestList.length * 32)) + 'px';
    suggestBox.style.display = suggestList.length ? 'block' : 'none';
  }
  function hideSuggest() { if (suggestBox) { suggestBox.style.display = 'none'; } suggestList = []; }
  function updateActive() {
    if (!suggestBox) return;
    Array.from(suggestBox.children).forEach((c, i) => c.classList.toggle('active', i === suggestIndex));
  }
  function applySuggest(i) {
    const it = suggestList[i]; if (!it) return;
    const caret = input.selectionStart ?? input.value.length;
    const left = input.value.slice(0, caret);
    const m = left.match(/:([a-z0-9_+-]{1,30})$/i);
    if (m) {
      const start = caret - m[0].length;
      input.value = input.value.slice(0, start) + it.e + input.value.slice(caret);
      const pos = start + it.e.length;
      input.setSelectionRange(pos, pos);
    } else {
      insertAtCursor(input, it.e, '');
    }
    hideSuggest();
    const mdPreview = document.getElementById('mdPreview');
    if (state.previewOn && mdPreview) mdPreview.innerHTML = renderMarkdown(input.value);
  }
  input?.addEventListener('input', () => {
    const socket = window.__socket;
    if (state.roomId) (input.value.trim() ? socket.__typing.start() : socket.__typing.stop(true));
    const caret = input.selectionStart ?? input.value.length;
    const left = input.value.slice(0, caret);
    const m = left.match(/:([a-z0-9_+-]{1,30})$/i);
    if (m) {
      const key = ':' + m[1].toLowerCase();
      const filtered = EMOJI.filter(x => x.s.includes(key));
      showSuggest(filtered);
    } else {
      hideSuggest();
    }
    const mdPreview = document.getElementById('mdPreview');
    if (state.previewOn && mdPreview) mdPreview.innerHTML = renderMarkdown(input.value);
  });
  input?.addEventListener('keydown', (e) => {
    if (suggestList.length && suggestBox?.style.display !== 'none') {
      if (e.key === 'ArrowDown') { e.preventDefault(); suggestIndex = (suggestIndex + 1) % suggestList.length; updateActive(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); suggestIndex = (suggestIndex - 1 + suggestList.length) % suggestList.length; updateActive(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applySuggest(suggestIndex); return; }
      if (e.key === 'Escape') { hideSuggest(); return; }
    }
  });
  input?.addEventListener('blur', () => { const socket = window.__socket; socket && socket.__typing.stop(true); hideSuggest(); });
}

function addPagination(socket) {
  const scrollerEl = document.getElementById('messages');
  scrollerEl?.addEventListener('scroll', async () => {
    if (!state.roomId) return;
    if (scrollerEl.scrollTop <= 0 && !scrollerEl.__isLoadingOlder && state.oldestAt) {
      scrollerEl.__isLoadingOlder = true;
      try {
        const params = new URLSearchParams({ room: state.roomId, before: new Date(state.oldestAt).toISOString(), limit: '50' });
        const r = await fetch(`/messages?${params.toString()}`); const older = await r.json();
        if (Array.isArray(older) && older.length) {
          const prevHeight = scrollerEl.scrollHeight;
          const frag = document.createDocumentFragment();
          const messagesEl = document.getElementById('messages');
          older.forEach((m) => {
            ensureDateDivider(messagesEl, m.createdAt);
            frag.appendChild(createMsgNode(socket, m, {
              username: state.username,
              onEdit: (id)=>doEditMessage(socket, id),
              onDelete: (id)=>doDeleteMessage(socket, id),
              scrollToMessage,
            }));
          });
          messagesEl.insertBefore(frag, messagesEl.firstChild);
          state.messagesData = older.concat(state.messagesData);
          if (!state.oldestAt || new Date(older[0].createdAt) < new Date(state.oldestAt)) state.oldestAt = older[0].createdAt;
          const added = scrollerEl.scrollHeight - prevHeight;
          scrollerEl.scrollTop = added;
        }
      } finally { scrollerEl.__isLoadingOlder = false; }
    }
  });
}

function scrollToMessage(id) {
  const messagesEl = document.getElementById('messages');
  if (!id) return;
  const node = messagesEl?.querySelector(`[data-id="${CSS.escape(String(id))}"]`);
  if (node) { node.scrollIntoView({ behavior: 'smooth', block: 'center' }); node.style.outline = '2px solid #7b1fa2'; setTimeout(() => node.style.outline = '', 1200); }
  else alert('Pesan induk belum termuat. Scroll ke atas untuk memuat riwayat lama.');
}

function doEditMessage(socket, id) {
  const messagesEl = document.getElementById('messages');
  const node = messagesEl?.querySelector(`[data-id="${CSS.escape(id)}"]`);
  const old = node?.querySelector('.msg-text')?.textContent || '';
  const next = prompt('Edit pesan:', old); if (next === null) return;
  const newText = next.trim(); if (!newText) return alert('Isi tidak boleh kosong.');
  socket.emit('editMessage', { id, newText }, (res) => { if (!res?.ok) alert(res?.error || 'Gagal edit'); });
}
function doDeleteMessage(socket, id) {
  if (!confirm('Hapus pesan ini?')) return;
  socket.emit('deleteMessage', { id }, (res) => { if (!res?.ok) alert(res?.error || 'Gagal hapus'); });
}

function setupLogin(socket) {
  document.getElementById('btnTabGlobal')?.addEventListener('click', () => setMode('global'));
  document.getElementById('btnTabPrivate')?.addEventListener('click', () => setMode('private'));
  document.getElementById('loginGlobalBtn')?.addEventListener('click', () => {
    const u = (document.getElementById('usernameGlobalInput')?.value || '').trim(); if (!u) return alert('Masukkan username');
    state.username = u; state.roomId = 'global'; localStorage.setItem('chat_username', state.username); localStorage.setItem('chat_room', state.roomId);
    if (!socket.connected) socket.connect(); resetMessagesUI(); socket.emit('joinGlobal', { username: state.username }); hideLogin();
  });
  document.getElementById('createPrivateBtn')?.addEventListener('click', () => {
    const u = (document.getElementById('usernamePrivateInput')?.value || '').trim();
    const r = (document.getElementById('roomInput')?.value || '').trim();
    const p = (document.getElementById('passwordInput')?.value || '').trim();
    if (!u || !r || !p) return alert('Lengkapi data');
    if (!socket.connected) socket.connect(); resetMessagesUI();
    socket.emit('createRoom', { roomId: r, password: p, username: u }, (res) => {
      if (!res?.ok) return alert(res?.error || 'Gagal membuat room');
      state.username = u; state.roomId = r; localStorage.setItem('chat_username', u); localStorage.setItem('chat_room', r); setRoomPw(state.roomId, p); hideLogin();
    });
  });
  document.getElementById('loginPrivateBtn')?.addEventListener('click', () => {
    const u = (document.getElementById('usernamePrivateInput')?.value || '').trim();
    const r = (document.getElementById('roomInput')?.value || '').trim();
    const p = (document.getElementById('passwordInput')?.value || '').trim();
    if (!u || !r || !p) return alert('Lengkapi data');
    if (!socket.connected) socket.connect(); resetMessagesUI();
    socket.emit('joinRoom', { roomId: r, password: p, username: u }, (res) => {
      if (!res?.ok) return alert(res?.error || 'Gagal masuk room');
      state.username = u; state.roomId = r; localStorage.setItem('chat_username', u); localStorage.setItem('chat_room', r); setRoomPw(state.roomId, p); hideLogin();
    });
  });

  if (!state.username || !state.roomId) { setMode('global'); showLogin(); }
  else if (state.roomId === 'global') { if (!socket.connected) socket.connect(); resetMessagesUI(); socket.emit('joinGlobal', { username: state.username }); hideLogin(); }
  else {
    const p = getRoomPw(state.roomId);
    if (p) {
      if (!socket.connected) socket.connect(); resetMessagesUI();
      socket.emit('joinRoom', { roomId: state.roomId, password: p, username: state.username }, (res) => {
        if (!res?.ok) { setMode('private'); showLogin(); } else hideLogin();
      });
    } else { setMode('private'); showLogin(); }
  }
}

function setupForm(socket) {
  const form = document.getElementById('form');
  const input = document.getElementById('input');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = (input?.value || '').trim();
    if (!text) return;

    if (text.startsWith('/')) {
      const handled = await handleSlash(text, { socket, input });
      if (handled) { input.value = ''; socket.__typing.stop(true); window.dispatchEvent(new CustomEvent('app:set-reply', { detail: null })); const mdPreview = document.getElementById('mdPreview'); if (mdPreview && state.previewOn) mdPreview.innerHTML = ''; return; }
    }

    const payload = { text };
    if (state.replyTo && (state.replyTo._id || state.replyTo.id)) payload.parentId = state.replyTo._id || state.replyTo.id;

    socket.emit('messageRoom', payload, (res) => {
      if (res && res.ok === false && res.error === 'SLOW_MODE') {
        // optional toast
      }
    });
    input.value = '';
    const mdPreview = document.getElementById('mdPreview'); if (mdPreview && state.previewOn) mdPreview.innerHTML = '';
    socket.__typing.stop(true);
    window.dispatchEvent(new CustomEvent('app:set-reply', { detail: null }));
  });
}

function setupSocket() {
  const socket = io({ autoConnect: false });
  window.__socket = socket;

  const typing = createTyping(socket, document.getElementById('typingIndicator'), document.getElementById('input'));
  socket.__typing = typing;

  const messagesEl = document.getElementById('messages');

  socket.on('history', (messages) => renderMessages(messagesEl, socket, messages || [], state.username, scrollToMessage, { scroll: true }));
  socket.on('message', (m) => { if (m.roomId !== state.roomId) return; appendMessage(messagesEl, socket, m, state.username, scrollToMessage); typing.markUserStopped(m.username, state.username); });

  socket.on('messageEdited', ({ id, newText, editedAt, linkPreview }) => {
    const idx = state.messagesData.findIndex(x => (x._id || x.id) === id);
    if (idx >= 0) {
      state.messagesData[idx].text = newText;
      state.messagesData[idx].editedAt = editedAt;
      state.messagesData[idx].linkPreview = linkPreview || null;
      const node = messagesEl?.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (node) {
        const textEl = node.querySelector('.msg-text');
        const metaEl = node.querySelector('.meta');
        if (textEl) textEl.innerHTML = renderMarkdown(newText);
        if (metaEl) metaEl.textContent = new Date(state.messagesData[idx].createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' • edited';
        const oldCard = node.querySelector('.link-card'); if (oldCard) oldCard.remove();
        const lp = renderLinkPreview(linkPreview);
        if (lp) node.querySelector('.bubble')?.appendChild(lp);
      }
    }
    state.messagesData.forEach((m) => { if (m.parent && (m.parent._id === id || m.parent.id === id)) m.parent.text = newText; });
    document.querySelectorAll(`.reply-quote[data-parent-id="${CSS.escape(id)}"] .reply-snippet`).forEach(el => el.textContent = (newText || '').slice(0, 140));
  });

  socket.on('messageDeleted', ({ id }) => {
    state.messagesData = state.messagesData.filter(x => (x._id || x.id) !== id);
    state.messagesData.forEach(m => { if (m.parent && (m.parent._id === id || m.parent.id === id)) m.parent.text = '(pesan telah dihapus)'; });
    renderMessages(messagesEl, socket, state.messagesData, state.username, scrollToMessage, { scroll: false });
  });

  socket.on('pollUpdated', ({ id, poll }) => {
    const idx = state.messagesData.findIndex(x => (x._id || x.id) === id);
    if (idx >= 0) { state.messagesData[idx].poll = poll; renderMessages(messagesEl, socket, state.messagesData, state.username, scrollToMessage, { scroll: false }); }
  });

  socket.on('onlineCount', ({ roomId: rid, n }) => { if (rid === state.roomId) { const el = document.getElementById('onlineCount'); if (el) el.textContent = n; } });
  socket.on('onlineUsers', ({ roomId: rid, users }) => { if (rid !== state.roomId) return; const el = document.getElementById('onlineUsers'); if (el) el.textContent = (users && users.length) ? users.join(', ') : '-'; });
  socket.on('typing', ({ username: u, isTyping }) => { isTyping ? typing.markUserTyping(u, state.username) : typing.markUserStopped(u, state.username); });

  socket.on('roomInfo', ({ topic, rules }) => {
    const roomTopicEl = document.getElementById('roomTopic'); const roomRulesEl = document.getElementById('roomRules');
    if (roomTopicEl) roomTopicEl.textContent = topic || '';
    if (roomRulesEl) roomRulesEl.textContent = rules || '';
  });

  socket.on('slowMode', () => { /* optional toast */ });

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => { });
  }
  socket.on('mention', ({ from, text }) => {
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(`Mention oleh ${from}`, { body: text });
      setTimeout(() => n.close(), 4000);
    }
  });

  socket.on('connect', () => document.body.classList.remove('offline'));
  socket.on('disconnect', () => { document.body.classList.add('offline'); typing.reset(); });

  window.addEventListener('beforeunload', () => { try { socket.emit('leaveRoom'); } catch {} try { typing.stop(true); } catch {} try { socket.disconnect(); } catch {} });

  return socket;
}

function setupLogout(socket) {
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    socket.emit('leaveRoom');
    if (state.roomId && state.roomId !== 'global') delRoomPw(state.roomId);
    localStorage.removeItem('chat_username'); localStorage.removeItem('chat_room');
    state.username = ''; state.roomId = ''; resetMessagesUI(); setMode('global'); showLogin();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupReplyBar();
  setupPanels();
  setupToolbar();
  setupSuggest(document.getElementById('input'));
  const socket = setupSocket();
  setupLogin(socket);
  setupForm(socket);
  setupLogout(socket);
  addPagination(socket);
});
