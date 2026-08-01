// ── PROFILE PHOTO (base64) ──
function uploadPhoto(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    me.photo = dataUrl;
    db.ref('players/'+me.uid+'/photo').set(dataUrl);
    renderProfilePage();
    updateHeaderBadge();
    updateAvatars();
    toast('📸','Photo de profil mise à jour !');
  };
  reader.readAsDataURL(file);
}

// ── SAVE PROFILE ──
function saveProfile() {
  const username = document.getElementById('editUser').value.trim() || me.username;
  const country  = document.getElementById('editCountry').value;
  const level    = document.getElementById('editLevel').value;
  me.username = username; me.country = country; me.level = level;
  db.ref('players/'+me.uid).update({ username, country, level });
  db.ref('online/'+me.uid).update({ username, country, level });
  updateHeaderBadge(); updateAvatars(); renderProfilePage(); updateDrawerProfile();
  toast('✅','Profil mis à jour !');
}

function changePassword() {
  const newPass = document.getElementById('newPass').value;
  if (newPass.length < 6) { toast('⚠️','Mot de passe trop court'); return; }
  auth.currentUser.updatePassword(newPass)
    .then(() => { document.getElementById('newPass').value=''; toast('🔑','Mot de passe modifié !'); })
    .catch(e => toast('❌', e.message));
}

// ── PRESENCE ──
function startPresence() {
  if (!me) return;
  const ref = db.ref('online/'+me.uid);
  ref.set({ uid:me.uid, username:me.username, country:me.country, level:me.level, pts:me.pts, photo:me.photo||'', ts:Date.now() });
  ref.onDisconnect().remove();
  setInterval(() => { if(me) ref.update({ ts:Date.now(), pts:me.pts }); }, 20000);
}

function listenOnline() {
  db.ref('online').on('value', snap => {
    const now=Date.now(), data=snap.val()||{};
    const players=Object.values(data).filter(p=>now-p.ts<60000);
    const el=document.getElementById('onlinePlayers');
    if(!players.length){el.innerHTML='<div style="color:var(--gray);font-size:13px">Aucun joueur en ligne.</div>';return;}
    el.innerHTML=players.map(p=>`
      <div class="card-sm" onclick="viewPlayer('${p.uid||p.username}')">
        <div class="pi">
          <span style="width:7px;height:7px;border-radius:50%;background:var(--green);display:inline-block;flex-shrink:0"></span>
          ${avatarHTML(p,30)}
          <span class="un">${FLAGS[p.country]||'🌍'} ${p.username}</span>
          <span class="tier-tag">${TIERS[p.level]||''}</span>
        </div>
        <span style="font-family:'Barlow Condensed',sans-serif;color:var(--gold);font-size:14px;font-weight:700">${p.pts} pts</span>
      </div>`).join('');
  });
}

// ── SEARCH ──
function searchPlayer() {
  const q = (document.getElementById('searchBar').value || document.getElementById('searchInput').value || '').trim().toLowerCase();
  if (!q) return;
  document.getElementById('searchBar').value = q;
  go('recherche');
  document.getElementById('searchResults').innerHTML = '<div style="color:var(--gray);font-size:13px">Recherche...</div>';
  db.ref('players').once('value').then(snap => {
    if (!snap.exists()) { document.getElementById('searchResults').innerHTML='<div style="color:var(--gray);font-size:13px">Aucun résultat.</div>'; return; }
    const results = Object.values(snap.val()).filter(p => p.username && p.username.toLowerCase().includes(q));
    if (!results.length) { document.getElementById('searchResults').innerHTML='<div style="color:var(--gray);font-size:13px">Aucun joueur trouvé.</div>'; return; }
    document.getElementById('searchResults').innerHTML = results.map(p => `
      <div class="search-result" onclick="viewPlayer('${p.uid}')">
        <div class="pi">
          ${avatarHTML(p,38)}
          <div>
            <div style="font-weight:700">${FLAGS[p.country]||'🌍'} ${p.username}</div>
            <div style="font-size:12px;color:var(--gray)">${TIERS[p.level]||''} ${p.level} · ${p.pts} pts · ${p.wins||0}V ${p.losses||0}D</div>
          </div>
        </div>
      </div>`).join('');
  });
}

// ── VIEW PLAYER ──
function viewPlayer(uid) {
  db.ref('players/'+uid).once('value').then(snap => {
    if (!snap.exists()) { toast('❌','Joueur introuvable'); return; }
    const p = snap.val();
    db.ref('players').orderByChild('pts').once('value').then(allSnap => {
      const all = allSnap.exists() ? Object.values(allSnap.val()).sort((a,b)=>b.pts-a.pts) : [];
      const rank = all.findIndex(x=>x.uid===uid)+1;
      const total = (p.wins||0)+(p.losses||0)+(p.draws||0);
      const wr = total ? Math.round((p.wins||0)/total*100) : 0;
      document.getElementById('playerViewContent').innerHTML = `
        <div class="player-view">
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
            ${avatarHTML(p,72,'border:3px solid var(--gold)')}
            <div>
              <div style="font-family:Barlow Condensed,sans-serif;font-size:24px;font-weight:900">${p.username}</div>
              <div style="color:var(--gray);font-size:12px;margin-top:2px">${FLAGS[p.country]||'🌍'} ${p.country} · ${TIERS[p.level]||''} ${p.level}</div>
            </div>
          </div>
          <div class="srow" style="grid-template-columns:repeat(2,1fr)">
            <div class="scard"><div class="snum">#${rank||'—'}</div><div class="slbl">Classement</div></div>
            <div class="scard"><div class="snum">${p.pts}</div><div class="slbl">Points</div></div>
            <div class="scard"><div class="snum">${p.wins||0}</div><div class="slbl">Victoires</div></div>
            <div class="scard"><div class="snum">${wr}%</div><div class="slbl">Win Rate</div></div>
          </div>
          <div style="display:flex;gap:24px;text-align:center;background:var(--mid);border-radius:10px;padding:14px">
            <div style="flex:1"><div style="font-family:Barlow Condensed,sans-serif;font-size:22px;color:var(--green);font-weight:900">${p.wins||0}</div><div style="font-size:11px;color:var(--gray)">Victoires</div></div>
            <div style="flex:1"><div style="font-family:Barlow Condensed,sans-serif;font-size:22px;color:var(--red);font-weight:900">${p.losses||0}</div><div style="font-size:11px;color:var(--gray)">Défaites</div></div>
            <div style="flex:1"><div style="font-family:Barlow Condensed,sans-serif;font-size:22px;color:var(--gray);font-weight:900">${p.draws||0}</div><div style="font-size:11px;color:var(--gray)">Nuls</div></div>
            <div style="flex:1"><div style="font-family:Barlow Condensed,sans-serif;font-size:22px;color:var(--white);font-weight:900">${total}</div><div style="font-size:11px;color:var(--gray)">Total</div></div>
          </div>
        </div>`;
      go('playerView');
    });
  });
}

// ── AVATAR HELPER ──
function avatarHTML(p, size=30, extraStyle='') {
  if (p.photo) return `<img src="${p.photo}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;${extraStyle}">`;
  return `<div class="mav" style="width:${size}px;height:${size}px;font-size:${Math.floor(size*0.45)}px;${extraStyle}">${(p.username||'?')[0].toUpperCase()}</div>`;
}