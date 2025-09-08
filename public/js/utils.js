export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
export const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const fmtDateLabel = (t) => new Date(t).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
export const dateKey = (x) => { const d = new Date(x); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const truncate = (s, n = 120) => (s && s.length > n ? s.slice(0, n) + '…' : (s || ''));
export const URL_RE = /(https?:\/\/[^\s)]+)/g;
