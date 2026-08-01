// ── RENDER ──
function refreshHome(){
  if(!me)return;
  db.ref('players').once('value').then(snap=>{
    const players=snap.exists()?Object.values(snap.val()).sort((a,b)=>b.pts-a.pts):[];
    const rank=players.findIndex(p=>p.uid===me.uid)+1;
    const total=me.wins+me.losses+me.draws, wr=total?Math.round(me.wins/total*100):0;
    document.getElementById('sRank').textContent='#'+rank;
    document.getElementById('sPts').textContent=me.pts;
    document.getElementById('sWins').textContent=me.wins;
    document.getElementById('sWR').textContent=wr+'%';
    document.getElementById('homeTop').innerHTML=players.slice(0,3).map((p,i)=>`
      <div class="card-sm" onclick="viewPlayer('${p.uid}')">
        <div class="pi"><span style="font-size:16px">${['🥇','🥈','🥉'][i]}</span>${avatarHTML(p,32)}<span class="un">${FLAGS[p.country]||'🌍'} ${p.username}</span></div>
        <span style="font-family:'Barlow Condensed',sans-serif;color:var(--gold);font-size:14px;font-weight:700">${p.pts} pts</span>
      </div>`).join('');
  });
}

function renderLeaderboard(){
  db.ref('players').once('value').then(snap=>{
    const players=snap.exists()?Object.values(snap.val()).sort((a,b)=>b.pts-a.pts):[];
    document.getElementById('lbBody').innerHTML=players.map((p,i)=>{
      const isMe=me&&p.uid===me.uid,rc=i===0?'r1':i===1?'r2':i===2?'r3':'';
      return `<div class="lbr ${isMe?'me':''}" onclick="viewPlayer('${p.uid}')">
        <div class="rnum ${rc}">${i<3?['🥇','🥈','🥉'][i]:i+1}</div>
        <div class="pi">${avatarHTML(p,30)}<span class="un">${FLAGS[p.country]||'🌍'} ${p.username}${isMe?' <span style="color:var(--gold);font-size:10px">(toi)</span>':''}</span><span class="tier-tag">${TIERS[p.level]||''}</span></div>
        <div class="lbs" style="color:var(--green)">${p.wins||0}</div>
        <div class="lbp">${p.pts}</div>
      </div>`;
    }).join('');
  });
}

function renderHistory(){
  const list=document.getElementById('histList');
  if(!me||!me.history||!me.history.length){list.innerHTML='<div style="color:var(--gray);font-size:13px">Aucun match joué.</div>';return;}
  list.innerHTML=me.history.map(m=>{
    const cls=m.result==='win'?'win':m.result==='loss'?'loss':'draw';
    const lbl=m.result==='win'?'VICTOIRE':m.result==='loss'?'DÉFAITE':'NUL';
    return `<div class="hitem">
      <div><div class="hres ${cls}">${lbl}</div><div style="font-size:11px;color:var(--gray);margin-top:2px">vs ${m.opponent} · ${m.date}</div></div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:900">${m.myG}–${m.oppG}</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:700;color:${m.pts>=0?'var(--green)':'var(--red)'}">${m.pts>0?'+':''}${m.pts}pts</div>
    </div>`;
  }).join('');
}

function renderProfilePage(){
  if(!me)return;
  const pAvEl=document.getElementById('pAv');
  if(me.photo){pAvEl.innerHTML=`<img src="${me.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;}
  else{document.getElementById('pAvLetter').textContent=me.username[0].toUpperCase();}
  document.getElementById('pName').textContent=me.username;
  document.getElementById('pCo').textContent=(FLAGS[me.country]||'🌍')+' '+me.country+' · '+(TIERS[me.level]||'')+' '+me.level;
  document.getElementById('pEmail').textContent=me.email||'';
  document.getElementById('pPts').textContent=me.pts;
  document.getElementById('pW').textContent=me.wins;
  document.getElementById('pG').textContent=(me.wins||0)+(me.losses||0)+(me.draws||0);
  document.getElementById('editUser').value=me.username;
  document.getElementById('editCountry').value=me.country;
  document.getElementById('editLevel').value=me.level;
}

function updateHeaderBadge(){
  if(!me)return;
  const havEl=document.getElementById('hav');
  if(me.photo){havEl.innerHTML=`<img src="${me.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;}
  else{document.getElementById('havLetter').textContent=me.username[0].toUpperCase();}
  document.getElementById('hname').textContent=me.username;
  document.getElementById('hpts').textContent=me.pts+' pts';
}

function updateAvatars(){
  if(!me)return;
  ['av1','av2'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    if(me.photo){el.innerHTML=`<img src="${me.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;}
    else{const t=document.getElementById(id+'txt');if(t)t.textContent=me.username[0].toUpperCase();}
  });
  ['an1','an2'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent=me.username;});
  ['ar1','ar2'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent=(TIERS[me.level]||'')+' '+me.pts+' pts';});
}