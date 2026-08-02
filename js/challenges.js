// ════════════════════════════════════════════════════════════════════════
//
//  CHALLENGE RESULT VALIDATION SYSTEM
//  Architecture: Event-driven, Firebase Realtime DB, client-side logic
//
//  Database schema:
//    /challenges/{id}       — Challenge records
//    /notifications/{uid}/  — Per-user notification queue
//    /activity_feed/        — Global activity feed
//    /players/{uid}         — Extended with ELO + streak stats
//
// ════════════════════════════════════════════════════════════════════════

// ── ELO CONSTANTS ──
const ELO_K = 32;          // K-factor (sensitivity)
const ELO_BASE = 1200;     // Starting ELO for new players

// ── CHALLENGE STATUS LABELS ──
const CH_STATUS = {
  pending:    { label:'En attente',        css:'ch-status-pending'   },
  accepted:   { label:'Accepté',           css:'ch-status-accepted'  },
  inprogress: { label:'En cours',          css:'ch-status-inprogress'},
  waiting:    { label:'Attente confirmation', css:'ch-status-waiting'},
  confirmed:  { label:'Confirmé',          css:'ch-status-confirmed' },
  disputed:   { label:'Contesté',          css:'ch-status-disputed'  },
  completed:  { label:'Terminé',           css:'ch-status-completed' },
  declined:   { label:'Refusé',            css:'ch-status-completed' },
};

// ── STATE ──
let chCurrentTab      = 'feed';
let chSelectedOpp     = null;   // opponent selected for new challenge
let chEvidenceFiles   = [];     // files staged for dispute evidence
let chUnsubChallenges = null;   // Firebase listener handle
let chUnsubNotifs     = null;
let chUnsubFeed       = null;
let chCurrentDetail   = null;   // currently viewed challenge

// ════════════════════════════════
//  INITIALIZATION
// ════════════════════════════════

/**
 * Called once after login — starts all Firebase listeners.
 */
function chInit() {
  if (!me) return;
  // Ensure player has ELO initialized
  if (!me.elo) {
    me.elo = ELO_BASE;
    me.eloHigh = ELO_BASE;
    me.streak = 0;
    me.matchesPlayed = me.matchesPlayed || 0;
    db.ref('players/' + me.uid).update({
      elo: ELO_BASE, eloHigh: ELO_BASE, streak: 0,
      matchesPlayed: me.matchesPlayed
    });
  }
  chListenNotifs();
  dlog('chInit OK');
}

// ════════════════════════════════
//  TAB NAVIGATION
// ════════════════════════════════

function chSwitchTab(tab) {
  chCurrentTab = tab;
  document.querySelectorAll('.ch-tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.ch-panel').forEach(p => { p.style.display='none'; p.classList.remove('on'); });
  const tabEl   = document.getElementById('chtab-' + tab);
  const panelEl = document.getElementById('chpanel-' + tab);
  if (tabEl)   tabEl.classList.add('on');
  if (panelEl) { panelEl.style.display = 'block'; panelEl.classList.add('on'); }

  // Lazy-load data per tab
  if (tab === 'feed')   chLoadFeed();
  if (tab === 'active') chLoadActive();
  if (tab === 'notifs') { chLoadNotifs(); chMarkNotifsRead(); }
}

// ════════════════════════════════
//  CHALLENGE CREATION
// ════════════════════════════════

/**
 * Search opponent by username (exact match).
 */
function chSearchOpponent(query) {
  const q = (query || '').trim();
  const resultEl = document.getElementById('chOppResult');
  if (q.length < 2) { resultEl.innerHTML = ''; chSelectedOpp = null; return; }

  db.ref('players').orderByChild('username').once('value').then(snap => {
    if (!snap.exists()) { resultEl.innerHTML = '<div style="color:var(--gray);font-size:12px">Aucun joueur trouvé.</div>'; return; }
    const matches = [];
    snap.forEach(child => {
      const p = child.val();
      if (p.username && p.username.toLowerCase().includes(q.toLowerCase()) && p.uid !== me.uid) {
        matches.push(p);
      }
    });
    if (!matches.length) {
      resultEl.innerHTML = '<div style="color:var(--gray);font-size:12px">Aucun joueur trouvé.</div>';
      chSelectedOpp = null; return;
    }
    resultEl.innerHTML = matches.slice(0,5).map(p => `
      <div onclick="chSelectOpp(${JSON.stringify(p).replace(/"/g,'&quot;')})"
           style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--mid);border-radius:8px;cursor:pointer;margin-bottom:6px;border:1px solid var(--border)"
           onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--border)'">
        ${avatarHTML(p, 36)}
        <div>
          <div style="font-weight:700;font-size:13px">${FLAGS[p.country]||'🌍'} ${p.username}</div>
          <div style="font-size:11px;color:var(--gray)">${TIERS[p.level]||''} · ${p.pts||0} pts · ELO ${p.elo||ELO_BASE}</div>
        </div>
      </div>`).join('');
  });
}

function chSelectOpp(player) {
  chSelectedOpp = player;
  document.getElementById('chOppInput').value = player.username;
  document.getElementById('chOppResult').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;padding:10px;background:rgba(245,197,24,.08);border:1px solid var(--gold);border-radius:8px">
      ${avatarHTML(player, 36)}
      <div>
        <div style="font-weight:700;font-size:13px;color:var(--gold)">✅ ${player.username} sélectionné</div>
        <div style="font-size:11px;color:var(--gray)">ELO ${player.elo||ELO_BASE}</div>
      </div>
    </div>`;
}

/**
 * Create a new challenge and notify the opponent.
 */
function chCreate() {
  const errEl = document.getElementById('chCreateErr');
  errEl.style.display = 'none';
  if (!chSelectedOpp) { errEl.textContent = 'Sélectionne un adversaire.'; errEl.style.display = 'block'; return; }

  const game    = document.getElementById('chGame').value;
  const message = document.getElementById('chMessage').value.trim();
  const id      = db.ref('challenges').push().key;
  const now     = Date.now();

  // Build challenge record
  const challenge = {
    id,
    challengerUid:      me.uid,
    challengerUsername: me.username,
    challengerPhoto:    me.photo || '',
    challengerElo:      me.elo || ELO_BASE,
    opponentUid:        chSelectedOpp.uid,
    opponentUsername:   chSelectedOpp.username,
    opponentPhoto:      chSelectedOpp.photo || '',
    opponentElo:        chSelectedOpp.elo || ELO_BASE,
    game,
    message,
    status:    'pending',
    createdAt: now,
    updatedAt: now,
  };

  db.ref('challenges/' + id).set(challenge).then(() => {
    // Notify opponent
    chSendNotification(chSelectedOpp.uid, {
      type:      'challenge_received',
      icon:      '⚔️',
      title:     'Nouveau défi !',
      body:      `${me.username} te défie sur ${game}`,
      challengeId: id,
      from:      me.username,
      ts:        now,
      read:      false,
    });

    toast('⚔️', `Défi envoyé à ${chSelectedOpp.username} !`);
    // Reset form
    document.getElementById('chOppInput').value = '';
    document.getElementById('chOppResult').innerHTML = '';
    document.getElementById('chMessage').value = '';
    chSelectedOpp = null;
    chSwitchTab('active');
  }).catch(e => {
    errEl.textContent = 'Erreur: ' + e.message;
    errEl.style.display = 'block';
  });
}

// ════════════════════════════════
//  CHALLENGE RESPONSE (Accept / Decline)
// ════════════════════════════════

function chAccept(challengeId) {
  const now = Date.now();
  db.ref('challenges/' + challengeId).update({
    status: 'inprogress',
    acceptedAt: now,
    updatedAt: now,
  }).then(() => {
    db.ref('challenges/' + challengeId).once('value').then(snap => {
      const ch = snap.val();
      // Notify challenger
      chSendNotification(ch.challengerUid, {
        type: 'challenge_accepted', icon: '✅',
        title: 'Défi accepté !',
        body: `${ch.opponentUsername} a accepté ton défi sur ${ch.game}`,
        challengeId, from: ch.opponentUsername, ts: now, read: false,
      });
      toast('✅', 'Défi accepté !');
      chLoadActive();
      chViewDetail(challengeId);
    });
  });
}

function chDecline(challengeId) {
  const now = Date.now();
  db.ref('challenges/' + challengeId).update({
    status: 'declined', updatedAt: now,
  }).then(() => {
    db.ref('challenges/' + challengeId).once('value').then(snap => {
      const ch = snap.val();
      chSendNotification(ch.challengerUid, {
        type: 'challenge_declined', icon: '❌',
        title: 'Défi refusé',
        body: `${ch.opponentUsername} a refusé ton défi`,
        challengeId, from: ch.opponentUsername, ts: now, read: false,
      });
      toast('❌', 'Défi refusé.');
      chLoadActive();
      go('challenges');
    });
  });
}

// ════════════════════════════════
//  RESULT SUBMISSION
// ════════════════════════════════

/**
 * Show the result submission form inside the detail page.
 */
function chShowSubmitForm(challengeId) {
  const formHtml = `
    <div class="card" style="margin-top:12px" id="submitForm">
      <div class="stitle">📊 Soumettre le résultat</div>
      <div style="color:var(--gray);font-size:12px;margin-bottom:14px">Entre le score final du match.</div>
      <div class="score-row">
        <div class="sblock">
          <label style="font-size:11px;color:var(--gray);text-transform:uppercase">Tes buts</label>
          <input type="number" class="sinput" id="chMyGoals" min="0" max="50" value="0">
        </div>
        <div class="ssep">—</div>
        <div class="sblock">
          <label style="font-size:11px;color:var(--gray);text-transform:uppercase">Ses buts</label>
          <input type="number" class="sinput" id="chOppGoals" min="0" max="50" value="0">
        </div>
      </div>
      <div class="fg">
        <label class="fl">Commentaire (optionnel)</label>
        <input class="fi" id="chComment" placeholder="ex: Match serré !" maxlength="120">
      </div>
      <button class="btn btn-gold btn-block" onclick="chSubmitResult('${challengeId}')">📤 Soumettre</button>
    </div>`;
  const existing = document.getElementById('submitForm');
  if (existing) existing.remove();
  document.getElementById('challengeDetailContent').insertAdjacentHTML('beforeend', formHtml);
}

function chSubmitResult(challengeId) {
  const myGoals  = parseInt(document.getElementById('chMyGoals').value)  || 0;
  const oppGoals = parseInt(document.getElementById('chOppGoals').value) || 0;
  const comment  = document.getElementById('chComment').value.trim();
  const now      = Date.now();

  db.ref('challenges/' + challengeId).once('value').then(snap => {
    if (!snap.exists()) return;
    const ch = snap.val();

    // Determine who submitted (challenger or opponent) and map goals accordingly
    const iAmChallenger = me.uid === ch.challengerUid;
    const challengerGoals = iAmChallenger ? myGoals : oppGoals;
    const opponentGoals   = iAmChallenger ? oppGoals : myGoals;

    db.ref('challenges/' + challengeId).update({
      status:           'waiting',
      submitterUid:     me.uid,
      submitterUsername:me.username,
      challengerGoals,
      opponentGoals,
      comment,
      submittedAt:      now,
      updatedAt:        now,
    }).then(() => {
      // Notify the other player to confirm
      const otherUid      = iAmChallenger ? ch.opponentUid      : ch.challengerUid;
      const otherUsername = iAmChallenger ? ch.opponentUsername  : ch.challengerUsername;
      chSendNotification(otherUid, {
        type: 'result_submitted', icon: '📊',
        title: 'Score à confirmer',
        body: `${me.username} a soumis ${challengerGoals}-${opponentGoals} sur ${ch.game}`,
        challengeId, from: me.username, ts: now, read: false,
      });
      toast('📤', 'Score soumis ! En attente de confirmation.');
      chViewDetail(challengeId);
    });
  });
}

// ════════════════════════════════
//  RESULT CONFIRMATION / REJECTION
// ════════════════════════════════

function chConfirmResult(challengeId) {
  db.ref('challenges/' + challengeId).once('value').then(snap => {
    if (!snap.exists()) return;
    const ch  = snap.val();
    const now = Date.now();

    // Determine winner
    const challengerWon = ch.challengerGoals > ch.opponentGoals;
    const opponentWon   = ch.opponentGoals   > ch.challengerGoals;
    const isDraw        = ch.challengerGoals === ch.opponentGoals;

    // Calculate ELO changes
    const eloChallenger = ch.challengerElo || ELO_BASE;
    const eloOpponent   = ch.opponentElo   || ELO_BASE;
    const { deltaA, deltaB } = chCalcElo(eloChallenger, eloOpponent, challengerWon ? 1 : isDraw ? 0.5 : 0);

    // Batch update challenge record
    db.ref('challenges/' + challengeId).update({
      status: 'completed', confirmedAt: now, updatedAt: now,
      eloDeltaChallenger: deltaA, eloDeltaOpponent: deltaB,
    });

    // Update challenger stats
    chUpdatePlayerStats(ch.challengerUid, {
      won: challengerWon, lost: opponentWon, draw: isDraw,
      eloDelta: deltaA, elo: eloChallenger + deltaA,
      opponentUsername: ch.opponentUsername,
      score: `${ch.challengerGoals}-${ch.opponentGoals}`,
      challengeId, game: ch.game,
    });

    // Update opponent stats
    chUpdatePlayerStats(ch.opponentUid, {
      won: opponentWon, lost: challengerWon, draw: isDraw,
      eloDelta: deltaB, elo: eloOpponent + deltaB,
      opponentUsername: ch.challengerUsername,
      score: `${ch.opponentGoals}-${ch.challengerGoals}`,
      challengeId, game: ch.game,
    });

    // Generate activity feed post
    const winnerName = challengerWon ? ch.challengerUsername : ch.opponentUsername;
    const loserName  = challengerWon ? ch.opponentUsername   : ch.challengerUsername;
    const winnerDelta = challengerWon ? deltaA : deltaB;
    if (!isDraw) {
      chPostActivity({
        type: 'match_result',
        icon: '🏆',
        text: `<b>${winnerName}</b> a battu <b>${loserName}</b> ${ch.challengerGoals}-${ch.opponentGoals} sur ${ch.game} et a gagné <span class="elo-gain">+${winnerDelta} ELO</span>`,
        ts: now,
        players: [ch.challengerUid, ch.opponentUid],
      });
    } else {
      chPostActivity({
        type: 'match_result', icon: '🤝',
        text: `<b>${ch.challengerUsername}</b> et <b>${ch.opponentUsername}</b> ont fait match nul ${ch.challengerGoals}-${ch.opponentGoals} sur ${ch.game}`,
        ts: now,
        players: [ch.challengerUid, ch.opponentUid],
      });
    }

    // Notifications
    chSendNotification(ch.challengerUid, {
      type:'result_confirmed', icon:'✅',
      title:'Résultat confirmé !',
      body:`Match ${ch.challengerGoals}-${ch.opponentGoals} validé. ${deltaA > 0 ? '+'+deltaA : deltaA} ELO`,
      challengeId, from: ch.opponentUsername, ts: now, read: false,
    });
    chSendNotification(ch.opponentUid, {
      type:'result_confirmed', icon:'✅',
      title:'Résultat confirmé !',
      body:`Match ${ch.opponentGoals}-${ch.challengerGoals} validé. ${deltaB > 0 ? '+'+deltaB : deltaB} ELO`,
      challengeId, from: ch.challengerUsername, ts: now, read: false,
    });

    // If current user is challenger, update local me object
    if (me.uid === ch.challengerUid) {
      me.elo = (me.elo || ELO_BASE) + deltaA;
      me.pts = me.elo;
    } else {
      me.elo = (me.elo || ELO_BASE) + deltaB;
      me.pts = me.elo;
    }
    document.getElementById('hpts').textContent = me.elo + ' pts';

    toast('🏆', 'Résultat confirmé ! Classements mis à jour.');
    chLoadFeed();
    go('challenges');
  });
}

function chRejectResult(challengeId) {
  const now = Date.now();
  db.ref('challenges/' + challengeId).update({
    status: 'disputed', disputedAt: now, updatedAt: now,
  }).then(() => {
    db.ref('challenges/' + challengeId).once('value').then(snap => {
      const ch = snap.val();
      const otherUid = me.uid === ch.challengerUid ? ch.opponentUid : ch.challengerUid;
      chSendNotification(otherUid, {
        type:'result_disputed', icon:'⚠️',
        title:'Résultat contesté',
        body:`${me.username} conteste le score. Uploadez vos preuves.`,
        challengeId, from: me.username, ts: now, read: false,
      });
      toast('⚠️', 'Résultat contesté. Uploadez vos preuves.');
      chViewDetail(challengeId);
    });
  });
}

// ════════════════════════════════
//  EVIDENCE UPLOAD (for disputes)
// ════════════════════════════════

function chUploadEvidence(challengeId) {
  if (!chEvidenceFiles.length) { toast('📷','Sélectionne au moins une image'); return; }

  // Convert files to base64 and store in Firebase
  const uploads = chEvidenceFiles.map(f => new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.readAsDataURL(f);
  }));

  Promise.all(uploads).then(dataUrls => {
    const evidenceId = db.ref('evidence/' + challengeId).push().key;
    db.ref('evidence/' + challengeId + '/' + evidenceId).set({
      uid: me.uid, username: me.username,
      files: dataUrls, ts: Date.now(),
    }).then(() => {
      // Mark that this player submitted evidence
      const field = 'evidence_' + me.uid;
      db.ref('challenges/' + challengeId + '/' + field).set(true);
      toast('📸','Preuves soumises !');
      chEvidenceFiles = [];
      document.getElementById('chEvidPreview').innerHTML = '';
      chViewDetail(challengeId);
    });
  });
}

function chPreviewEvidence(input) {
  chEvidenceFiles = Array.from(input.files);
  const prev = document.getElementById('chEvidPreview');
  prev.innerHTML = '';
  chEvidenceFiles.forEach(f => {
    const r = new FileReader();
    r.onload = e => {
      const img = document.createElement('img');
      img.src = e.target.result;
      img.className = 'evidence-thumb';
      prev.appendChild(img);
    };
    r.readAsDataURL(f);
  });
}

// ════════════════════════════════
//  ELO CALCULATION
// ════════════════════════════════

/**
 * Standard ELO formula.
 * @param {number} rA  - ELO of player A
 * @param {number} rB  - ELO of player B
 * @param {number} sA  - Score of player A (1=win, 0.5=draw, 0=loss)
 * @returns {{ deltaA: number, deltaB: number }}
 */
function chCalcElo(rA, rB, sA) {
  const eA     = 1 / (1 + Math.pow(10, (rB - rA) / 400));
  const eB     = 1 - eA;
  const sB     = 1 - sA;
  const deltaA = Math.round(ELO_K * (sA - eA));
  const deltaB = Math.round(ELO_K * (sB - eB));
  return { deltaA, deltaB };
}

// ════════════════════════════════
//  PLAYER STATS UPDATE
// ════════════════════════════════

/**
 * Update a single player's stats after a confirmed match.
 */
function chUpdatePlayerStats(uid, { won, lost, draw, eloDelta, elo, opponentUsername, score, challengeId, game }) {
  db.ref('players/' + uid).once('value').then(snap => {
    if (!snap.exists()) return;
    const p = snap.val();

    const newElo      = Math.max(100, (p.elo || ELO_BASE) + eloDelta);
    const newEloHigh  = Math.max(p.eloHigh || ELO_BASE, newElo);
    const newWins     = (p.wins  || 0) + (won  ? 1 : 0);
    const newLosses   = (p.losses|| 0) + (lost ? 1 : 0);
    const newDraws    = (p.draws || 0) + (draw ? 1 : 0);
    const newPlayed   = (p.matchesPlayed || 0) + 1;
    const newWR       = newPlayed ? Math.round(newWins / newPlayed * 100) : 0;

    // Streak logic
    let newStreak = p.streak || 0;
    if (won)       newStreak = newStreak >= 0 ? newStreak + 1 : 1;
    else if (lost) newStreak = newStreak <= 0 ? newStreak - 1 : -1;
    else           newStreak = 0;

    // Recent matches (keep last 5)
    const recentMatch = { won, lost, draw, score, opponent: opponentUsername, game, ts: Date.now(), eloDelta };
    const recentMatches = [recentMatch, ...(p.recentMatches || [])].slice(0, 5);

    const updates = {
      elo: newElo, eloHigh: newEloHigh,
      wins: newWins, losses: newLosses, draws: newDraws,
      matchesPlayed: newPlayed, winRate: newWR,
      streak: newStreak, recentMatches,
      pts: newElo, level: getLevel(newElo),
    };

    db.ref('players/' + uid).update(updates);
    db.ref('online/'  + uid).update({ pts: newElo, elo: newElo });

    // Update local me if it's this user
    if (uid === me.uid) {
      Object.assign(me, updates);
      document.getElementById('hpts').textContent = newElo + ' pts';
    }

    // Check milestones
    chCheckMilestones(uid, p, updates, opponentUsername);
  });
}

/**
 * Check and post milestone activity (streaks, top 10, new division).
 */
function chCheckMilestones(uid, oldStats, newStats, opponentUsername) {
  const username = oldStats.username;
  const now = Date.now();

  // Win streak milestone (3, 5, 10)
  if ([3, 5, 10].includes(newStats.streak)) {
    chPostActivity({
      type: 'streak', icon: '🔥',
      text: `<b>${username}</b> est sur une série de <b>${newStats.streak} victoires consécutives</b> !`,
      ts: now, players: [uid],
    });
  }

  // New ELO high
  if (newStats.elo > (oldStats.eloHigh || ELO_BASE)) {
    chPostActivity({
      type: 'elo_high', icon: '⭐',
      text: `<b>${username}</b> atteint son meilleur ELO : <b>${newStats.elo}</b> !`,
      ts: now, players: [uid],
    });
  }

  // Division changes
  const divisions = [
    { min:2000, label:'Légendaire 👑' }, { min:1800, label:'Diamant 💎' },
    { min:1600, label:'Platine 🏆' },    { min:1400, label:'Or 🥇' },
    { min:1200, label:'Argent 🥈' },     { min:0,    label:'Bronze 🥉' },
  ];
  const newDiv = divisions.find(d => newStats.elo >= d.min);
  const oldDiv = divisions.find(d => (oldStats.elo || ELO_BASE) >= d.min);
  if (newDiv && oldDiv && newDiv.label !== oldDiv.label && newStats.elo > (oldStats.elo || ELO_BASE)) {
    chPostActivity({
      type: 'promotion', icon: '🎖️',
      text: `<b>${username}</b> est promu en division <b>${newDiv.label}</b> !`,
      ts: now, players: [uid],
    });
  }
}

// ════════════════════════════════
//  ACTIVITY FEED
// ════════════════════════════════

function chPostActivity(entry) {
  db.ref('activity_feed').push({ ...entry, id: db.ref('activity_feed').push().key });
}

function chLoadFeed() {
  const el = document.getElementById('activityFeed');
  if (!el) return;
  el.innerHTML = '<div class="ch-empty">Chargement...</div>';

  db.ref('activity_feed').orderByChild('ts').limitToLast(30).once('value').then(snap => {
    if (!snap.exists()) { el.innerHTML = '<div class="ch-empty">Aucune activité pour l\'instant.</div>'; return; }
    const items = Object.values(snap.val()).reverse();
    el.innerHTML = items.map(item => `
      <div class="feed-item">
        <div class="feed-icon">${item.icon||'📌'}</div>
        <div>
          <div class="feed-text">${item.text}</div>
          <div class="feed-time">${chTimeAgo(item.ts)}</div>
        </div>
      </div>`).join('');
  });
}

// ════════════════════════════════
//  ACTIVE CHALLENGES
// ════════════════════════════════

function chLoadActive() {
  const el = document.getElementById('activeChallenges');
  if (!el) return;
  el.innerHTML = '<div class="ch-empty">Chargement...</div>';

  // Query challenges where user is challenger or opponent
  db.ref('challenges').orderByChild('challengerUid').equalTo(me.uid).once('value').then(snapA => {
    db.ref('challenges').orderByChild('opponentUid').equalTo(me.uid).once('value').then(snapB => {
      const all = {};
      if (snapA.exists()) snapA.forEach(c => { all[c.key] = c.val(); });
      if (snapB.exists()) snapB.forEach(c => { all[c.key] = c.val(); });

      const active = Object.values(all)
        .filter(c => !['completed','declined'].includes(c.status))
        .sort((a,b) => b.updatedAt - a.updatedAt);

      // Update badge
      const badge = document.getElementById('chBadgeActive');
      if (active.length > 0) {
        badge.textContent = active.length;
        badge.classList.add('show');
      } else {
        badge.classList.remove('show');
      }

      if (!active.length) { el.innerHTML = '<div class="ch-empty">Aucun défi actif.</div>'; return; }

      el.innerHTML = active.map(ch => chRenderCard(ch)).join('');
    });
  });
}

function chRenderCard(ch) {
  const iAmChallenger = me.uid === ch.challengerUid;
  const statusInfo    = CH_STATUS[ch.status] || { label: ch.status, css:'ch-status-pending' };
  const myGoals       = iAmChallenger ? ch.challengerGoals : ch.opponentGoals;
  const oppGoals      = iAmChallenger ? ch.opponentGoals   : ch.challengerGoals;
  const hasScore      = ch.challengerGoals !== undefined;

  return `
    <div class="ch-card" onclick="chViewDetail('${ch.id}')">
      <div class="ch-card-header">
        <span class="ch-status ${statusInfo.css}">${statusInfo.label}</span>
        <span style="font-size:11px;color:var(--gray)">${chTimeAgo(ch.updatedAt)}</span>
      </div>
      <div class="ch-players">
        <div class="ch-player">${avatarHTML({photo:ch.challengerPhoto,username:ch.challengerUsername},28)} ${ch.challengerUsername}</div>
        <div class="ch-vs">VS</div>
        <div class="ch-player">${avatarHTML({photo:ch.opponentPhoto,username:ch.opponentUsername},28)} ${ch.opponentUsername}</div>
      </div>
      ${hasScore ? `<div class="ch-score"><span>${ch.challengerGoals}</span><span class="ch-score-sep">—</span><span>${ch.opponentGoals}</span></div>` : ''}
      <div style="font-size:11px;color:var(--gray);margin-top:6px">⚽ ${ch.game}</div>
    </div>`;
}

// ════════════════════════════════
//  CHALLENGE DETAIL PAGE
// ════════════════════════════════

function chViewDetail(challengeId) {
  go('challengeDetail');
  const el = document.getElementById('challengeDetailContent');
  el.innerHTML = '<div style="color:var(--gray);font-size:13px;padding:20px 0">Chargement...</div>';

  db.ref('challenges/' + challengeId).once('value').then(snap => {
    if (!snap.exists()) { el.innerHTML = '<div class="ch-empty">Défi introuvable.</div>'; return; }
    const ch = snap.val();
    chCurrentDetail = ch;
    const iAmChallenger = me.uid === ch.challengerUid;
    const iAmOpponent   = me.uid === ch.opponentUid;
    const statusInfo    = CH_STATUS[ch.status] || { label: ch.status, css:'ch-status-pending' };
    const hasScore      = ch.challengerGoals !== undefined;

    let actionsHtml = '';

    // Actions based on status and role
    if (ch.status === 'pending' && iAmOpponent) {
      actionsHtml = `
        <div style="display:flex;gap:8px;margin-top:14px">
          <button class="btn btn-green" style="flex:1" onclick="chAccept('${ch.id}')">✅ Accepter</button>
          <button class="btn btn-red"   style="flex:1" onclick="chDecline('${ch.id}')">❌ Refuser</button>
        </div>`;
    }
    if (ch.status === 'inprogress') {
      actionsHtml = `
        <div style="background:rgba(74,144,217,.1);border:1px solid rgba(74,144,217,.3);border-radius:10px;padding:14px;margin-top:14px">
          <div style="font-weight:700;margin-bottom:4px">🎮 Allez jouer sur ${ch.game} !</div>
          <div style="font-size:12px;color:var(--gray)">Revenez ici après le match pour soumettre le score.</div>
        </div>
        <button class="btn btn-gold btn-block" style="margin-top:10px" onclick="chShowSubmitForm('${ch.id}')">📊 Soumettre le score</button>`;
    }
    if (ch.status === 'waiting' && ch.submitterUid !== me.uid) {
      actionsHtml = `
        <div style="background:rgba(245,197,24,.08);border:1px solid rgba(245,197,24,.3);border-radius:10px;padding:14px;margin-top:14px">
          <div style="font-weight:700;margin-bottom:4px">⏳ Score soumis par ${ch.submitterUsername}</div>
          <div style="font-size:12px;color:var(--gray)">Confirme ou conteste ce résultat.</div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn btn-green" style="flex:1" onclick="chConfirmResult('${ch.id}')">✅ Confirmer</button>
          <button class="btn btn-red"   style="flex:1" onclick="chRejectResult('${ch.id}')">❌ Contester</button>
        </div>`;
    }
    if (ch.status === 'waiting' && ch.submitterUid === me.uid) {
      actionsHtml = `<div style="color:var(--gray);font-size:13px;padding:14px 0">⏳ En attente de confirmation par ${iAmChallenger ? ch.opponentUsername : ch.challengerUsername}...</div>`;
    }
    if (ch.status === 'disputed') {
      actionsHtml = `
        <div style="background:rgba(224,53,53,.08);border:1px solid rgba(224,53,53,.3);border-radius:10px;padding:14px;margin-top:14px">
          <div style="font-weight:700;color:var(--red);margin-bottom:6px">⚠️ Résultat contesté</div>
          <div style="font-size:12px;color:var(--gray)">Uploadez une capture d'écran du score final comme preuve.</div>
        </div>
        <div class="evidence-zone" onclick="document.getElementById('chEvidInput').click()" style="margin-top:10px">
          <div style="font-size:22px;margin-bottom:6px">📷</div>
          <div style="font-size:12px;color:var(--gray)">Capture d'écran du résultat</div>
          <div class="evidence-preview" id="chEvidPreview"></div>
        </div>
        <input type="file" id="chEvidInput" accept="image/*" multiple style="display:none" onchange="chPreviewEvidence(this)">
        <button class="btn btn-gold btn-block" style="margin-top:8px" onclick="chUploadEvidence('${ch.id}')">📤 Soumettre les preuves</button>`;
    }
    if (ch.status === 'completed') {
      const challengerWon = ch.challengerGoals > ch.opponentGoals;
      const eloC = ch.eloDeltaChallenger || 0;
      const eloO = ch.eloDeltaOpponent   || 0;
      actionsHtml = `
        <div style="background:rgba(26,180,80,.08);border:1px solid rgba(26,180,80,.3);border-radius:10px;padding:14px;margin-top:14px;text-align:center">
          <div style="font-size:20px;margin-bottom:6px">${challengerWon ? '🏆 ' + ch.challengerUsername + ' a gagné !' : ch.opponentGoals > ch.challengerGoals ? '🏆 ' + ch.opponentUsername + ' a gagné !' : '🤝 Match nul !'}</div>
          <div style="font-size:12px;color:var(--gray)">
            ${ch.challengerUsername}: <span class="${eloC>=0?'elo-gain':'elo-loss'}">${eloC>=0?'+':''}${eloC} ELO</span> &nbsp;|&nbsp;
            ${ch.opponentUsername}: <span class="${eloO>=0?'elo-gain':'elo-loss'}">${eloO>=0?'+':''}${eloO} ELO</span>
          </div>
        </div>`;
    }

    el.innerHTML = `
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <span class="ch-status ${statusInfo.css}">${statusInfo.label}</span>
          <span style="font-size:11px;color:var(--gray)">⚽ ${ch.game}</span>
        </div>
        <!-- Players -->
        <div style="display:flex;align-items:center;justify-content:space-around;margin-bottom:14px">
          <div style="text-align:center">
            ${avatarHTML({photo:ch.challengerPhoto,username:ch.challengerUsername},52)}
            <div style="font-weight:700;font-size:13px;margin-top:6px">${ch.challengerUsername}</div>
            <div style="font-size:11px;color:var(--gray)">ELO ${ch.challengerElo||ELO_BASE}</div>
          </div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:900;color:var(--red)">VS</div>
          <div style="text-align:center">
            ${avatarHTML({photo:ch.opponentPhoto,username:ch.opponentUsername},52)}
            <div style="font-weight:700;font-size:13px;margin-top:6px">${ch.opponentUsername}</div>
            <div style="font-size:11px;color:var(--gray)">ELO ${ch.opponentElo||ELO_BASE}</div>
          </div>
        </div>
        <!-- Score -->
        ${hasScore ? `<div class="ch-score"><span>${ch.challengerGoals}</span><span class="ch-score-sep">—</span><span>${ch.opponentGoals}</span></div>` : ''}
        ${ch.comment ? `<div style="font-size:12px;color:var(--gray);text-align:center;margin-bottom:6px">💬 "${ch.comment}"</div>` : ''}
        ${ch.message ? `<div style="font-size:12px;color:var(--gray);text-align:center">📢 "${ch.message}"</div>` : ''}
        <!-- Actions -->
        ${actionsHtml}
      </div>`;
  });
}

// ════════════════════════════════
//  NOTIFICATIONS
// ════════════════════════════════

/**
 * Write a notification to a user's Firebase node.
 */
function chSendNotification(uid, notif) {
  db.ref('notifications/' + uid).push(notif);
}

/**
 * Listen for incoming notifications in real time.
 */
function chListenNotifs() {
  if (!me) return;
  if (chUnsubNotifs) { db.ref('notifications/' + me.uid).off('value', chUnsubNotifs); }

  chUnsubNotifs = db.ref('notifications/' + me.uid)
    .orderByChild('read').equalTo(false)
    .on('value', snap => {
      const count = snap.exists() ? Object.keys(snap.val()).length : 0;
      const badge = document.getElementById('chBadgeNotifs');
      const dot   = document.getElementById('chNavDot');
      if (count > 0) {
        badge.textContent = count; badge.classList.add('show');
        if (dot) dot.style.display = 'block';
        // Show toast for the most recent notification
        if (snap.exists()) {
          const notifs = Object.values(snap.val()).sort((a,b) => b.ts - a.ts);
          const latest = notifs[0];
          if (Date.now() - latest.ts < 5000) { // only if recent (within 5s)
            toast(latest.title, latest.body);
          }
        }
      } else {
        badge.classList.remove('show');
        if (dot) dot.style.display = 'none';
      }
    });
}

function chLoadNotifs() {
  const el = document.getElementById('notifsList');
  if (!el) return;
  el.innerHTML = '<div class="ch-empty">Chargement...</div>';

  db.ref('notifications/' + me.uid).orderByChild('ts').limitToLast(30).once('value').then(snap => {
    if (!snap.exists()) { el.innerHTML = '<div class="ch-empty">Aucune notification.</div>'; return; }
    const notifs = Object.entries(snap.val())
      .map(([k,v]) => ({...v, _key: k}))
      .sort((a,b) => b.ts - a.ts);

    el.innerHTML = notifs.map(n => `
      <div class="notif-item ${n.read?'':'unread'}" onclick="chOnNotifClick('${n._key}','${n.challengeId||''}')">
        ${!n.read ? '<div class="notif-dot"></div>' : '<div style="width:8px;flex-shrink:0"></div>'}
        <div style="flex:1">
          <div style="font-weight:700;font-size:13px">${n.icon||'🔔'} ${n.title}</div>
          <div style="font-size:12px;color:var(--gray);margin-top:2px">${n.body}</div>
          <div style="font-size:11px;color:var(--gray);margin-top:4px">${chTimeAgo(n.ts)}</div>
        </div>
      </div>`).join('');
  });
}

function chOnNotifClick(key, challengeId) {
  // Mark as read
  db.ref('notifications/' + me.uid + '/' + key + '/read').set(true);
  if (challengeId) chViewDetail(challengeId);
}

function chMarkNotifsRead() {
  db.ref('notifications/' + me.uid).orderByChild('read').equalTo(false).once('value').then(snap => {
    if (!snap.exists()) return;
    const updates = {};
    snap.forEach(child => { updates[child.key + '/read'] = true; });
    db.ref('notifications/' + me.uid).update(updates);
  });
}

// ════════════════════════════════
//  SIDEBAR NAV ENTRY
// ════════════════════════════════

// Add challenges to sidebar (added dynamically to avoid HTML duplication)
document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    const rpsNav = sidebar.querySelector('[onclick*="rps"]');
    if (rpsNav) {
      const challengeNav = document.createElement('div');
      challengeNav.className = 'nav';
      challengeNav.setAttribute('onclick', "go('challenges')");
      challengeNav.innerHTML = '<span>🏅</span> Défis';
      sidebar.insertBefore(challengeNav, rpsNav);
    }
  }
});

// ════════════════════════════════
//  UTILITY
// ════════════════════════════════

function chTimeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0)  return `il y a ${d}j`;
  if (h > 0)  return `il y a ${h}h`;
  if (m > 0)  return `il y a ${m}min`;
  return 'à l\'instant';
}
