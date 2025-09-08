export const state = {
  username: localStorage.getItem('chat_username') || '',
  roomId: localStorage.getItem('chat_room') || '',
  lastDateKey: null,
  messagesData: [],
  oldestAt: null,
  replyTo: null,
  previewOn: false,
};

const pwKey = (rid) => `chat_room_pw:${rid}`;
export const getRoomPw = (rid) => { try { return localStorage.getItem(pwKey(rid)) || ''; } catch { return ''; } };
export const setRoomPw = (rid, pw) => { try { localStorage.setItem(pwKey(rid), pw || ''); } catch { } };
export const delRoomPw = (rid) => { try { localStorage.removeItem(pwKey(rid)); } catch { } };

const MACROS_KEY = 'chat_macros';
export const loadMacros = () => { try { return JSON.parse(localStorage.getItem(MACROS_KEY) || '{}'); } catch { return {}; } };
export const saveMacros = (obj) => { try { localStorage.setItem(MACROS_KEY, JSON.stringify(obj)); } catch { } };
