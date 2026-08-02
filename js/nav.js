// ── NAV ──
function go(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.nav,.bnav').forEach(n=>n.classList.remove('on'));
  document.getElementById('page-'+id).classList.add('on');
  const bn=document.getElementById('bn-'+id);if(bn)bn.classList.add('on');
  document.querySelectorAll('.nav').forEach(n=>{
    const map={home:'Accueil',match:'Match',classement:'Classement',historique:'Historique',recherche:'Recherche',profil:'Profil',playerView:''};
    if(map[id]&&n.textContent.trim().startsWith(map[id]))n.classList.add('on');
  });
  // Update drawer active state
  updateDrawerActive(id);
  if(id==='classement')renderLeaderboard();
  if(id==='historique')renderHistory();
  if(id==='home')refreshHome();
  if(id==='profil'){renderProfilePage();}
  if(id==='match')checkPending();
  if(id==='challenges'){ chSwitchTab(chCurrentTab||'feed'); chLoadActive(); }
  if(id==='challengeDetail'){} // loaded by chViewDetail()
  if(id!=='rps' && rpsGameId) rpsLeave();
}

function showMS(id){
  ['idle','queue','lobby','found','score','pending'].forEach(x=>{
    document.getElementById('ms-'+x).style.display=x===id?'block':'none';
  });
}

let nT;
function toast(title,msg){
  clearTimeout(nT);
  document.getElementById('nT').textContent=title;
  document.getElementById('nM').textContent=msg;
  const n=document.getElementById('notif');n.classList.add('show');
  nT=setTimeout(()=>n.classList.remove('show'),3500);
}

setInterval(()=>{ if(me&&document.getElementById('page-home').classList.contains('on'))refreshHome(); },15000);

// ── DRAWER MENU ──
function toggleDrawer() {
  const drawer = document.getElementById('drawer');
  if (drawer.classList.contains('open')) closeDrawer(); else openDrawer();
}
function openDrawer() {
  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
  document.querySelector('.hamburger-btn').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
  const btn = document.querySelector('.hamburger-btn');
  if (btn) btn.classList.remove('open');
  document.body.style.overflow = '';
}
function goAndClose(id) { closeDrawer(); go(id); }
function updateDrawerBadge(id, count) {
  const el = document.getElementById('dbadge-' + id);
  if (!el) return;
  if (count > 0) { el.textContent = count; el.classList.add('show'); }
  else el.classList.remove('show');
}
function updateDrawerProfile() {
  if (!me) return;
  const avEl = document.getElementById('drawerAv');
  if (me.photo) {
    avEl.innerHTML = `<img src="${me.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    const ltEl = document.getElementById('drawerAvLetter');
    if (ltEl) ltEl.textContent = me.username[0].toUpperCase();
  }
  const dn = document.getElementById('drawerName'); if (dn) dn.textContent = me.username;
  const dp = document.getElementById('drawerPts');  if (dp) dp.textContent = (me.elo||me.pts||0) + ' pts · ' + (TIERS[me.level]||'');
}
function updateDrawerActive(id) {
  document.querySelectorAll('.drawer-item').forEach(el => el.classList.remove('on'));
  const el = document.getElementById('di-' + id);
  if (el) el.classList.add('on');
}
// Swipe gesture support
(function(){
  let sx=0, sy=0;
  document.addEventListener('touchstart', e=>{ sx=e.touches[0].clientX; sy=e.touches[0].clientY; }, {passive:true});
  document.addEventListener('touchend', e=>{
    const dx=e.changedTouches[0].clientX-sx, dy=Math.abs(e.changedTouches[0].clientY-sy);
    if(dy>60) return;
    if(dx>60&&sx<30) openDrawer();
    if(dx<-60) closeDrawer();
  },{passive:true});
})();
