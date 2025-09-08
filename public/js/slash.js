import { loadMacros, saveMacros } from './state.js';

export async function handleSlash(text, { socket, input }) {
  if (!text.startsWith('/')) return false;
  const parts = text.slice(1).split(/\s+/);
  const cmd = (parts.shift() || '').toLowerCase();
  const args = parts;

  if (cmd === 'shrug') { socket.emit('messageRoom', { text: `¯\\_(ツ)_/¯` }); return true; }

  if (cmd === 'roll') {
    const expr = (args[0] || 'd6').toLowerCase();
    const m = expr.match(/^(\d*)d(\d+)([+-]\d+)?$/);
    if (!m) { alert('Format: /roll NdM+K'); return true; }
    const n = Math.max(1, parseInt(m[1] || '1', 10));
    const faces = Math.max(2, parseInt(m[2], 10));
    const mod = parseInt(m[3] || '0', 10);
    let rolls = []; for (let i=0;i<n;i++) rolls.push(1 + Math.floor(Math.random() * faces));
    const total = rolls.reduce((a,b)=>a+b,0) + mod;
    socket.emit('messageRoom', { text:`🎲 ${expr} = [${rolls.join(', ')}] ${mod ? ((mod>0?'+':'')+mod) : ''} → **${total}**` });
    return true;
  }
  if (cmd === 'save') {
    const joined = args.join(' ');
    const eq = joined.indexOf('=');
    if (eq < 1) { alert('Format: /save nama = isi template'); return true; }
    const name = joined.slice(0, eq).trim();
    const val = joined.slice(eq + 1).trim();
    const m = loadMacros(); m[name] = val; saveMacros(m);
    alert(`Macro tersimpan: ${name}`);
    return true;
  }
  if (cmd === 'use') {
    const name = args[0]; if (!name) { alert('Format: /use nama'); return true; }
    const m = loadMacros(); const val = m[name];
    if (!val) { alert('Macro tidak ditemukan'); return true; }
    input.value = (input.value ? input.value + ' ' : '') + val;
    input.focus();
    return true;
  }
  if (cmd === 'macros') {
    const m = loadMacros(); alert(Object.keys(m).length ? Object.entries(m).map(([k, v]) => `${k}: ${v}`).join('\n') : 'Belum ada macro');
    return true;
  }
  if (cmd === 'delmacro') {
    const name = args[0]; const m = loadMacros(); delete m[name]; saveMacros(m); alert('Macro dihapus'); return true;
  }
  if (cmd === 'poll') {
    const joined = args.join(' ');
    const [question, ...opts] = joined.split('|').map(s => s.trim()).filter(Boolean);
    if (!question || opts.length < 2) { alert('Format: /poll Pertanyaan? | opsi1 | opsi2'); return true; }
    socket.emit('createPoll', { question, options: opts }, (res) => { if (!res?.ok) alert(res?.error || 'Gagal membuat poll'); });
    return true;
  }

    // server commands passthrough
  const pass = ['giphy','topic','rules','slow','theme','announce','pin','unpin','ban','unban','kick','mod','unmod','invite','export','tr'];
  if (pass.includes(cmd)) {
    socket.emit('slash', { cmd, args }, (res) => {
      if (!res?.ok) {
        alert(res?.error || 'Gagal menjalankan perintah.');
      } else if (res?.url) {
        window.open(res.url, '_blank');
      } else if (res?.token && res?.url) {
        prompt('Invite URL:', location.origin + res.url);
      }
    });
    return true;
  }

  socket.emit('slash', { cmd, args }, (res) => {
    if (!res?.ok && res?.error === 'UNKNOWN') alert('Perintah tidak dikenal.');
    else if (!res?.ok) alert(res?.error || 'Gagal menjalankan perintah.');
  });
  return true;
}
