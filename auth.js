// ── AUTH TABS ──
function switchTab(t) {
  document.getElementById('formLogin').style.display    = t==='login'?'block':'none';
  document.getElementById('formRegister').style.display = t==='register'?'block':'none';
  document.getElementById('tabLogin').className    = 'tab'+(t==='login'?' on':'');
  document.getElementById('tabRegister').className = 'tab'+(t==='register'?' on':'');
}

// ── REGISTER ──
function registerUser() {
  const username = document.getElementById('rUser').value.trim();
  const email    = document.getElementById('rEmail').value.trim();
  const pass     = document.getElementById('rPass').value;
  const err = document.getElementById('rErr');
  if (!username) { showErr(err,'Entre ton pseudo'); return; }
  if (!email)    { showErr(err,'Entre ton email'); return; }
  if (pass.length < 6) { showErr(err,'Mot de passe trop court (min 6)'); return; }
  err.style.display='none';
  const btn=document.getElementById('rBtn'); btn.disabled=true; btn.textContent='Création...';

  auth.createUserWithEmailAndPassword(email, pass)
    .then(cred => {
      me = {
        uid:cred.user.uid, username, email, photo:'',
        country:document.getElementById('rCountry').value,
        level:document.getElementById('rLevel').value,
        pts:PTS0[document.getElementById('rLevel').value],
        wins:0,losses:0,draws:0,history:[]
      };
      return db.ref('players/'+me.uid).set(me);
    })
    .then(() => {
      try { onLoggedIn(); } catch(uiErr) { showErr(err, 'Erreur UI: ' + uiErr.message); }
      toast('🎮','Bienvenue '+me.username+' !');
      btn.disabled=false; btn.textContent='⚡ Créer mon compte';
    })
    .catch(e => {
      btn.disabled=false; btn.textContent='⚡ Créer mon compte';
      const msgs={'auth/email-already-in-use':'Cet email est déjà utilisé. Connecte-toi plutôt.','auth/invalid-email':'Email invalide.','auth/weak-password':'Mot de passe trop faible.'};
      showErr(err, (msgs[e.code]||e.message) + ' [code: ' + (e.code||'?') + ']');
    });
}

// ── LOGIN ──
function login() {
  dlog('login() appelé');
  const email = document.getElementById('lEmail').value.trim();
  const pass  = document.getElementById('lPass').value;
  const err   = document.getElementById('lErr');
  if (!email||!pass) { showErr(err,'Remplis tous les champs'); return; }
  err.style.display='none';
  const btn=document.getElementById('lBtn');
  btn.disabled=true; btn.textContent='Connexion...';

  dlog('signInWithEmailAndPassword...');
  auth.signInWithEmailAndPassword(email, pass)
    .then(cred => {
      dlog('Auth OK uid=' + cred.user.uid);
      btn.disabled=false; btn.textContent='🔐 Se connecter';
      // onAuthStateChanged va prendre le relais automatiquement
    })
    .catch(e => {
      dlog('❌ login error: ' + e.code + ' ' + e.message);
      btn.disabled=false; btn.textContent='🔐 Se connecter';
      const msgs={
        'auth/wrong-password':'Mot de passe incorrect.',
        'auth/user-not-found':'Aucun compte avec cet email.',
        'auth/invalid-email':'Email invalide.',
        'auth/invalid-credential':'Email ou mot de passe incorrect.'
      };
      showErr(err, msgs[e.code] || e.message);
    });
}

function resetPassword() {
  const email = document.getElementById('lEmail').value.trim();
  if (!email) { showErr(document.getElementById('lErr'),'Entre ton email d\'abord'); return; }
  auth.sendPasswordResetEmail(email)
    .then(() => toast('📧','Email de réinitialisation envoyé !'))
    .catch(e => showErr(document.getElementById('lErr'), e.message));
}

function logout() {
  if (me) db.ref('online/'+me.uid).remove();
  auth.signOut().then(() => {
    me=null; lobbyCode=null; opponent=null;
    document.getElementById('overlay').style.display='flex';
    document.getElementById('hbadge').style.display='none';
    document.getElementById('hsearch').style.display='none';
    document.getElementById('lBtn').disabled=false;
    document.getElementById('lBtn').textContent='🔐 Se connecter';
    showMS('idle'); go('home');
  });
}

function onLoggedIn() {
  dlog('onLoggedIn() début');
  alreadyLoggedIn = true;
  try { document.getElementById('overlay').style.display='none'; dlog('overlay caché'); } catch(e){ dlog('❌ overlay: '+e.message); }
  try { document.getElementById('hbadge').style.display='flex'; } catch(e){ dlog('❌ hbadge: '+e.message); }
  try { document.getElementById('hsearch').style.display='flex'; } catch(e){ dlog('❌ hsearch: '+e.message); }
  try { updateHeaderBadge(); dlog('updateHeaderBadge OK'); } catch(e){ dlog('❌ updateHeaderBadge: '+e.message); }
  try { updateDrawerProfile(); } catch(e){ dlog('❌ drawer: '+e.message); }
  try { updateAvatars(); dlog('updateAvatars OK'); } catch(e){ dlog('❌ updateAvatars: '+e.message); }
  try { startPresence(); dlog('startPresence OK'); } catch(e){ dlog('❌ startPresence: '+e.message); }
  try { listenOnline(); dlog('listenOnline OK'); } catch(e){ dlog('❌ listenOnline: '+e.message); }
  try { refreshHome(); dlog('refreshHome OK'); } catch(e){ dlog('❌ refreshHome: '+e.message); }
  try { checkPending(); dlog('checkPending OK'); } catch(e){ dlog('❌ checkPending: '+e.message); }
  try { chInit(); dlog('chInit OK'); } catch(e){ dlog('❌ chInit: '+e.message); }
  dlog('onLoggedIn() FIN');
}

function showErr(el,msg){ el.textContent=msg; el.style.display='block'; }