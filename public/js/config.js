// Static config; bisa nanti diganti pakai inject dari server.
export const EMOJI = [
  { s: ':smile:', e: '😄' }, { s: ':grin:', e: '😁' }, { s: ':joy:', e: '😂' },
  { s: ':rofl:', e: '🤣' }, { s: ':wink:', e: '😉' }, { s: ':blush:', e: '😊' },
  { s: ':heart:', e: '❤️' }, { s: ':thumbsup:', e: '👍' }, { s: ':clap:', e: '👏' },
  { s: ':fire:', e: '🔥' }, { s: ':100:', e: '💯' }, { s: ':star:', e: '⭐' },
  { s: ':thinking:', e: '🤔' }, { s: ':sunglasses:', e: '😎' }, { s: ':cry:', e: '😢' },
  { s: ':sob:', e: '😭' }, { s: ':pray:', e: '🙏' }, { s: ':rocket:', e: '🚀' },
  { s: ':ok:', e: '👌' }, { s: ':party:', e: '🥳' }, { s: ':tada:', e: '🎉' }
];
export const EMOJI_MAP = Object.fromEntries(EMOJI.map(x => [x.s, x.e]));

export const STICKERS = [
  '/stickers/hi.webp', '/stickers/gg.webp', '/stickers/lol.webp',
  '/stickers/ok.webp', '/stickers/thumb.webp', '/stickers/sad.webp'
];
