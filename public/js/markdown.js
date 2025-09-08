import { escapeHtml, URL_RE } from './utils.js';
import { state } from './state.js';
import { EMOJI_MAP } from './config.js';

export function renderMarkdown(text, { mentionSelf = state.username } = {}) {
  let s = escapeHtml(text || '');

  // code block ```
  s = s.replace(/```([\s\S]*?)```/g, (_, code) =>
    `<pre><code>${escapeHtml(code)}</code></pre>`);

  // inline code `
  s = s.replace(/`([^`]+?)`/g, (_, code) =>
    `<code>${escapeHtml(code)}</code>`);

  // bold **text**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

  // italic _text_
  s = s.replace(/(^|[^\w])_([^_]+)_/g, '$1<i>$2</i>');

  // link [text](url)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // emoji shortname → unicode
  s = s.replace(/:([a-z0-9_+-]+):/gi, (m) => EMOJI_MAP[m] || m);

  // raw URL autolink
  s = s.replace(URL_RE, '<a href="$1" target="_blank" rel="noopener">$1</a>');

  // mentions
  if (mentionSelf) {
    const meEsc = mentionSelf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(`(^|\\s)@${meEsc}(?=\\b)`, 'g'), `$1<span class="mention me">@${escapeHtml(mentionSelf)}</span>`);
  }
  s = s.replace(/(^|\s)@([A-Za-z0-9_]+)\b/g, '$1<span class="mention">@$2</span>');

  // newline
  s = s.replace(/\n/g, '<br>');
  return s;
}
