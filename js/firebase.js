// ── PERSISTENT LOGGER ──
function dlog(msg) {
  const el = document.getElementById('diagBanner');
  if (!el) return;
  const time = new Date().toLocaleTimeString('fr-FR');
  el.textContent += '\n[' + time + '] ' + msg;
  el.scrollTop = el.scrollHeight;
}

window.onerror = function(msg, src, line, col, error) {
  dlog('❌ JS ERROR: ' + msg + ' @line ' + line + ':' + col);
  return false;
};
window.addEventListener('unhandledrejection', e => {
  dlog('❌ PROMISE REJECTED: ' + (e.reason && e.reason.message ? e.reason.message : JSON.stringify(e.reason)));
});

dlog('Script principal démarré');
dlog('typeof firebase = ' + typeof firebase);

// ── FIREBASE ──
firebase.initializeApp({
  apiKey:"AIzaSyA6N53pBJ71zcjXpbXQuYAtmGHVR7SEhmY",
  authDomain:"lets-play-ee44f.firebaseapp.com",
  databaseURL:"https://lets-play-ee44f-default-rtdb.firebaseio.com",
  projectId:"lets-play-ee44f",
  storageBucket:"lets-play-ee44f.firebasestorage.app",
  messagingSenderId:"791070579556",
  appId:"1:791070579556:web:2ba645f85dff0c066d7871"
});
dlog('firebase.initializeApp() OK');
const db   = firebase.database();
dlog('firebase.database() OK');
const auth = firebase.auth();
dlog('firebase.auth() OK');

db.ref('.info/connected').on('value', snap => {
  dlog('connected = ' + snap.val());
});

const TIERS={bronze:'🥉',silver:'🥈',gold:'🥇',platinum:'💎'};
const FLAGS={CM:'🇨🇲',SN:'🇸🇳',CI:'🇨🇮',NG:'🇳🇬',GH:'🇬🇭',MA:'🇲🇦',FR:'🇫🇷',OTHER:'🌍'};
const PTS0 ={bronze:500,silver:800,gold:1200,platinum:1600};

let me=null, lobbyCode=null, opponent=null, pendingId=null;
let screenshots=[], qSec=0, qInt=null;
let unsubLobby=null, unsubQueue=null, unsubGuestMatch=null, unsubResult=null;

// ── AUTH STATE ──
let alreadyLoggedIn = false;

auth.onAuthStateChanged(user => {
  dlog('onAuthStateChanged: ' + (user ? user.uid : 'null'));
  if (user && !alreadyLoggedIn) {
    db.ref('players/'+user.uid).once('value').then(snap => {
      dlog('onAuthStateChanged DB: exists=' + snap.exists());
      if (snap.exists() && !alreadyLoggedIn) {
        me = snap.val();
        alreadyLoggedIn = true;
        onLoggedIn();
        toast('👋', 'Bon retour ' + me.username + ' !');
      }
    }).catch(e => dlog('onAuthStateChanged DB err: ' + e.message));
  }
  if (!user) { alreadyLoggedIn = false; }
});
