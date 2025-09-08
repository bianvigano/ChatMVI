export function createTyping(socket, typingEl, input, { timeoutMs = 4000, heartbeatMs = 1500 } = {}) {
  const typingUsers = new Map();
  let heartbeat = null;

  function update() {
    if (!typingEl) return;
    const names = [...typingUsers.keys()];
    typingEl.textContent = names.length ? `${names.join(', ')} sedang mengetik...` : '';
  }
  function markUserTyping(u, selfName) {
    if (!u || u === selfName) return;
    const prev = typingUsers.get(u);
    if (prev) clearTimeout(prev);
    const tid = setTimeout(() => { typingUsers.delete(u); update(); }, timeoutMs);
    typingUsers.set(u, tid);
    update();
  }
  function markUserStopped(u, selfName) {
    if (!u || u === selfName) return;
    const prev = typingUsers.get(u);
    if (prev) clearTimeout(prev);
    typingUsers.delete(u);
    update();
  }
  function reset() {
    typingUsers.forEach(clearTimeout);
    typingUsers.clear();
    update();
    stop(true);
  }
  function start() {
    if (heartbeat) return;
    socket.emit('typing', { isTyping: true });
    heartbeat = setInterval(() => {
      if (!input || document.activeElement !== input || !input.value.trim()) { stop(true); return; }
      socket.emit('typing', { isTyping: true });
    }, heartbeatMs);
  }
  function stop(sendFalse) {
    if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    if (sendFalse) socket.emit('typing', { isTyping: false });
  }

  return { update, markUserTyping, markUserStopped, reset, start, stop };
}
