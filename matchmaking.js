// ── MATCHMAKING ──
function startAutoMatch() {
  if (!me) return;
  showMS('queue'); qSec=0;
  qInt=setInterval(()=>{ qSec++; const m=Math.floor(qSec/60),s=qSec%60; document.getElementById('qTimer').textContent=m+':'+(s<10?'0':'')+s; },1000);

  db.ref('queue/'+me.uid).set({ uid:me.uid, username:me.username, country:me.country, level:me.level, pts:me.pts, photo:me.photo||'', ts:Date.now() });
  db.ref('queue/'+me.uid).onDisconnect().remove();

  // Guard: prevent firing twice if both listeners trigger
  let matchFound = false;

  // Listener 1: I find someone in queue → I become HOST
  unsubQueue = db.ref('queue').on('value', snap => {
    if (matchFound) return; // already matched
    const data = snap.val() || {};
    const others = Object.values(data).filter(p => p.uid !== me.uid && Date.now()-p.ts < 30000);
    if (others.length === 0) return;

    const opp = others[0];
    // Only the player with the smaller uid creates the match
    if (me.uid > opp.uid) return;

    matchFound = true;
    clearInterval(qInt);
    db.ref('queue').off('value', unsubQueue); unsubQueue = null;
    // Also cancel the guest listener
    if (unsubGuestMatch) { db.ref('matches').orderByChild('guestUid').equalTo(me.uid).off('value', unsubGuestMatch); unsubGuestMatch = null; }
    db.ref('queue/'+me.uid).remove();
    db.ref('queue/'+opp.uid).remove();

    const code = String(Math.floor(1000 + Math.random() * 9000));
    db.ref('matches/'+code).set({
      code,
      hostUid: me.uid, hostUser: me.username, hostCountry: me.country, hostLevel: me.level, hostPts: me.pts, hostPhoto: me.photo||'',
      guestUid: opp.uid, guestUser: opp.username, guestCountry: opp.country, guestLevel: opp.level, guestPts: opp.pts, guestPhoto: opp.photo||'',
      status: 'matched', created: Date.now()
    });

    lobbyCode = code;
    opponent  = opp;
    showFoundMatch();
  });

  // Listener 2: Someone else finds me → I become GUEST
  // Store this reference so we can properly remove it later
  unsubGuestMatch = db.ref('matches').orderByChild('guestUid').equalTo(me.uid).on('value', snap => {
    if (matchFound) return; // already matched
    if (!snap.exists()) return;
    snap.forEach(child => {
      if (matchFound) return;
      const m = child.val();
      if (m.status === 'matched') {
        matchFound = true;
        // Remove BOTH listeners immediately
        db.ref('matches').orderByChild('guestUid').equalTo(me.uid).off('value', unsubGuestMatch); unsubGuestMatch = null;
        if (unsubQueue) { db.ref('queue').off('value', unsubQueue); unsubQueue = null; }
        clearInterval(qInt);
        db.ref('queue/'+me.uid).remove();

        lobbyCode = m.code;
        opponent  = { uid:m.hostUid, username:m.hostUser, country:m.hostCountry, level:m.hostLevel, pts:m.hostPts, photo:m.hostPhoto||'' };
        showFoundMatch();
      }
    });
  });

  setTimeout(()=>{ if(document.getElementById('ms-queue').style.display!=='none'){cancelAutoMatch();toast('⏰','Aucun joueur trouvé.');} },60000);
}

function cancelAutoMatch(){
  clearInterval(qInt);
  if(unsubQueue){ db.ref('queue').off('value',unsubQueue); unsubQueue=null; }
  if(unsubGuestMatch){ db.ref('matches').orderByChild('guestUid').equalTo(me.uid).off('value',unsubGuestMatch); unsubGuestMatch=null; }
  if(me) db.ref('queue/'+me.uid).remove();
  lobbyCode=null;
  showMS('idle');
}

function createLobby(){
  if(!me)return;
  const code=String(Math.floor(1000+Math.random()*9000)); lobbyCode=code;
  db.ref('lobbies/'+code).set({code,host:me.uid,hostUser:me.username,hostCountry:me.country,hostLevel:me.level,hostPts:me.pts,status:'waiting',created:Date.now()});
  document.getElementById('lobbyCode').textContent=code;
  showMS('lobby'); toast('🎯','Code: '+code);
  unsubLobby=db.ref('lobbies/'+code).on('value',snap=>{
    const d=snap.val();
    if(d&&d.status==='matched'){
      db.ref('lobbies/'+code).off('value',unsubLobby);unsubLobby=null;
      opponent={uid:d.guestUid,username:d.guestUser,country:d.guestCountry,level:d.guestLevel,pts:d.guestPts,photo:d.guestPhoto||''};
      showFoundMatch();
    }
  });
}

function joinLobby(){
  const code=document.getElementById('joinCode').value.trim();
  if(code.length!==4){toast('⚠️','Code à 4 chiffres');return;}
  db.ref('lobbies/'+code).once('value').then(snap=>{
    if(!snap.exists()){toast('❌','Lobby introuvable');return;}
    const l=snap.val();
    if(l.status!=='waiting'){toast('❌','Lobby complet');return;}
    if(l.host===me.uid){toast('⚠️','C\'est ton propre lobby !');return;}
    db.ref('lobbies/'+code).update({guestUid:me.uid,guestUser:me.username,guestCountry:me.country,guestLevel:me.level,guestPts:me.pts,guestPhoto:me.photo||'',status:'matched'});
    lobbyCode=code;
    opponent={uid:l.host,username:l.hostUser,country:l.hostCountry,level:l.hostLevel,pts:l.hostPts};
    document.getElementById('joinForm').style.display='none';
    showFoundMatch(); toast('✅','Tu rejoins '+l.hostUser+' !');
  });
}

function cancelLobby(){
  if(unsubLobby){db.ref('lobbies/'+lobbyCode).off('value',unsubLobby);unsubLobby=null;}
  if(lobbyCode)db.ref('lobbies/'+lobbyCode).remove();
  lobbyCode=null;showMS('idle');
}

function showJoin(){document.getElementById('joinForm').style.display='block';document.getElementById('joinCode').focus();}

function showFoundMatch(){
  const o=opponent;
  if(o.photo){document.getElementById('avOpp').innerHTML=`<img src="${o.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;}
  else{document.getElementById('avOpptxt').textContent=o.username[0].toUpperCase();}
  document.getElementById('anOpp').textContent=o.username;
  document.getElementById('arOpp').textContent=(TIERS[o.level]||'')+' '+o.pts+' pts';
  showMS('found'); toast('⚔️','Match contre '+o.username+' !');
  setTimeout(initChat, 300);
}

// ── SCORE ──
function showScore(){
  resultApplied = false; // reset guard for new submission
  document.getElementById('slMe').textContent=me.username;
  document.getElementById('slOpp').textContent=opponent.username;
  document.getElementById('myG').value=0;document.getElementById('oppG').value=0;
  document.getElementById('uprev').innerHTML='';
  document.getElementById('pendingBox').style.display='none';
  screenshots=[];showMS('score');
}

function previewSS(input){
  const prev=document.getElementById('uprev');screenshots=[];prev.innerHTML='';
  Array.from(input.files).forEach(f=>{
    const r=new FileReader();r.onload=e=>{screenshots.push(e.target.result);const img=document.createElement('img');img.src=e.target.result;img.className='thumb';prev.appendChild(img);};r.readAsDataURL(f);
  });
}

function submitScore(){
  resultApplied = false; // reset guard
  const myG=parseInt(document.getElementById('myG').value)||0;
  const oppG=parseInt(document.getElementById('oppG').value)||0;
  if(!screenshots.length){toast('📷','Ajoute une capture d\'écran !');return;}
  const mid=lobbyCode||('m'+Date.now()); pendingId=mid;
  db.ref('results/'+mid).set({submitter:me.uid,submitterName:me.username,opponent:opponent.uid,opponentName:opponent.username,scoreSubmitter:myG,scoreOpponent:oppG,status:'pending',created:Date.now()});
  document.getElementById('pendingBox').style.display='block';
  toast('📤','Score soumis ! En attente...');
  unsubResult=db.ref('results/'+mid).on('value',snap=>{
    const d=snap.val();if(!d)return;
    if(d.status==='confirmed'){db.ref('results/'+mid).off('value',unsubResult);applyResult(myG,oppG);}
    if(d.status==='disputed'){db.ref('results/'+mid).off('value',unsubResult);toast('⚠️','Match contesté.');showMS('idle');}
  });
}

function checkPending(){
  db.ref('results').orderByChild('opponent').equalTo(me.uid).once('value').then(snap=>{
    if(!snap.exists())return;
    snap.forEach(child=>{
      const r=child.val();
      if(r.status==='pending'){
        pendingId=child.key;
        opponent={uid:r.submitter,username:r.submitterName};
        document.getElementById('pendingDisplay').textContent=r.submitterName+' '+r.scoreSubmitter+' — '+r.scoreOpponent+' '+me.username;
        document.getElementById('pendingSub').textContent='Score proposé par '+r.submitterName;
        go('match');showMS('pending');
        toast('🔔',r.submitterName+' attend ta confirmation !');
      }
    });
  });
}

// Guard to prevent applying the same result more than once
let resultApplied = false;

function confirmScore(accepted){
  // Disable both buttons immediately to prevent double-click
  document.querySelectorAll('#ms-pending .btn').forEach(b => b.disabled = true);

  db.ref('results/'+pendingId).once('value').then(snap=>{
    const r=snap.val();
    if (!r || r.status !== 'pending') {
      // Already processed
      showMS('idle'); return;
    }
    if(accepted){
      db.ref('results/'+pendingId+'/status').set('confirmed');
      applyResult(r.scoreOpponent,r.scoreSubmitter);
    } else {
      db.ref('results/'+pendingId+'/status').set('disputed');
      toast('⚠️','Contestation envoyée.');showMS('idle');
    }
  });
}

function applyResult(myG,oppG){
  // Guard: prevent applying the same result twice
  if(resultApplied){ dlog('applyResult: already applied, skipping'); return; }
  resultApplied = true;

  let result,pts;
  if(myG>oppG){result='win';pts=50;}else if(myG<oppG){result='loss';pts=-30;}else{result='draw';pts=10;}
  me.pts=Math.max(0,me.pts+pts);
  me.wins  +=result==='win' ?1:0;
  me.losses+=result==='loss'?1:0;
  me.draws +=result==='draw'?1:0;
  me.level=getLevel(me.pts);
  if(!me.history)me.history=[];
  me.history.unshift({date:new Date().toLocaleDateString('fr-FR'),opponent:opponent?opponent.username:'?',myG,oppG,result,pts});
  if(me.history.length>50)me.history=me.history.slice(0,50);
  db.ref('players/'+me.uid).set(me);
  db.ref('online/'+me.uid).update({pts:me.pts,level:me.level});
  document.getElementById('hpts').textContent=me.pts+' pts';
  const msgs={win:'Victoire ! +50 pts 🔥',loss:'Défaite -30 pts',draw:'Nul +10 pts'};
  toast(result==='win'?'🏆 Victoire !':result==='loss'?'😤 Défaite':'🤝 Nul',msgs[result]+' ('+myG+'-'+oppG+')');

  // Reset guard after navigation so next match works
  setTimeout(()=>{ resultApplied = false; }, 3000);
  showMS('idle');go('home');
}

function getLevel(p){return p<700?'bronze':p<1200?'silver':p<1800?'gold':'platinum';}