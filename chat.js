let chatUnsub   = null;  // the listener function returned by .on()
let chatRef     = null;  // the Firebase ref, stored for .off()
let chatRoomId  = null;  // current room id

function initChat() {
  if (!opponent || !lobbyCode) {
    dlog('initChat: missing opponent or lobbyCode (' + lobbyCode + ')');
    return;
  }
  dlog('initChat: room=' + lobbyCode + ' opp=' + opponent.username);
  document.getElementById('chatOppName').textContent = opponent.username;

  // Remove previous listener properly using BOTH the ref and the function
  if (chatUnsub && chatRef) {
    chatRef.off('value', chatUnsub);
    chatUnsub = null;
    chatRef   = null;
  }

  chatRoomId = lobbyCode;
  chatRef    = db.ref('chats/' + chatRoomId);

  // Register listener and store the returned function
  chatUnsub = chatRef.on('value', snap => {
    const msgs = document.getElementById('chatMessages');
    if (!msgs) return;
    if (!snap.exists()) {
      msgs.innerHTML = '<div style="color:var(--gray);font-size:12px;text-align:center;padding:20px">👋 Dites bonjour et échangez vos identifiants FC !</div>';
      return;
    }
    const list = Object.values(snap.val()).sort((a,b) => a.ts - b.ts);
    msgs.innerHTML = list.map(m => {
      const isMe = m.uid === me.uid;
      const time = new Date(m.ts).toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'});
      return isMe
        ? `<div style="align-self:flex-end;max-width:80%"><div class="msg-me">${escapeHtml(m.text)}</div><div class="msg-time">${time}</div></div>`
        : `<div style="align-self:flex-start;max-width:80%"><div class="msg-name">${escapeHtml(m.username)}</div><div class="msg-opp">${escapeHtml(m.text)}</div><div class="msg-time-opp">${time}</div></div>`;
    }).join('');
    msgs.scrollTop = msgs.scrollHeight;
  });
  dlog('initChat: listener registered on chats/' + chatRoomId);
}

function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text || !lobbyCode) return;
  db.ref('chats/' + lobbyCode).push({
    uid: me.uid, username: me.username,
    text, ts: Date.now()
  });
  input.value = '';
}

function quickMsg(text) {
  const input = document.getElementById('chatInput');
  input.value = text;
  input.focus();
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}