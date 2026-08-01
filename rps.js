// ════════════════════════════════════════════════════════
//  ROCK · PAPER · SCISSORS — Complete Multiplayer System
// ════════════════════════════════════════════════════════

const RPS_EMOJI  = { rock:'✊', paper:'✋', scissors:'✌️' };
const RPS_LABELS = { rock:'PIERRE', paper:'FEUILLE', scissors:'CISEAUX' };
const RPS_BEATS  = { rock:'scissors', paper:'rock', scissors:'paper' }; // key beats value
const RPS_PTS_WIN = 100;

// Game state
let rpsGameId    = null;
let rpsRole      = null;
let rpsOppData   = null;
let rpsMyChoice  = null;
let rpsCountSec  = 5;
let rpsCountInt  = null;
let rpsGameUnsub = null;
let rpsInQueue   = false;
let rpsAlreadyProcessed = false; // prevents double point application

// ── Join matchmaking queue ──
function rpsJoinQueue() {
  if (!me) { toast('⚠️', 'Connecte-toi d\'abord'); return; }
  rpsInQueue = true;
  document.getElementById('rpsJoinBtn').style.display    = 'none';
  document.getElementById('rpsCancelBtn').style.display  = 'block';
  document.getElementById('rpsSearching').style.display  = 'flex';

  const qRef = db.ref('rps_queue/' + me.uid);
  qRef.set({ uid:me.uid, username:me.username, pts:me.pts, photo:me.photo||'', ts:Date.now() });
  qRef.onDisconnect().remove();

  // Watch queue for another player
  db.ref('rps_queue').on('value', rpsQueueWatch);
}

function rpsQueueWatch(snap) {
  if (!rpsInQueue || !me) return;
  const data = snap.val() || {};
  const others = Object.values(data).filter(p => p.uid !== me.uid && Date.now() - p.ts < 15000);
  if (others.length === 0) return;

  // Match found — host creates the game
  const opp = others[0];
  db.ref('rps_queue').off('value', rpsQueueWatch);
  rpsInQueue = false;

  // Only the alphabetically first uid creates game to avoid race condition
  if (me.uid < opp.uid) {
    // I'm host — create game
    const gameRef = db.ref('rps_games').push();
    rpsGameId = gameRef.key;
    rpsRole   = 'host';
    rpsOppData = opp;
    gameRef.set({
      host:    { uid:me.uid,  username:me.username,  pts:me.pts,  photo:me.photo||'' },
      guest:   { uid:opp.uid, username:opp.username, pts:opp.pts, photo:opp.photo||'' },
      status:  'countdown',
      round:   1,
      hostChoice:  null,
      guestChoice: null,
      countdown:   5,
      created:     Date.now()
    });
    // Remove both from queue
    db.ref('rps_queue/' + me.uid).remove();
    db.ref('rps_queue/' + opp.uid).remove();
    rpsStartGame();
  } else {
    // I'm guest — wait for host to create game, then find it
    rpsRole = 'guest';
    rpsOppData = opp;
    db.ref('rps_queue/' + me.uid).remove();
    rpsWaitForGame(opp.uid);
  }
}

function rpsWaitForGame(hostUid) {
  // Poll for a game where I'm the guest
  const check = db.ref('rps_games').orderByChild('guest/uid').equalTo(me.uid);
  check.on('value', snap => {
    if (!snap.exists()) return;
    snap.forEach(child => {
      if (child.val().status === 'countdown') {
        rpsGameId = child.key;
        check.off('value');
        rpsStartGame();
      }
    });
  });
  // Timeout after 10s
  setTimeout(() => { if (!rpsGameId) { rpsCancelQueue(); toast('⏰','Aucun adversaire'); } }, 10000);
}

// ── Cancel queue ──
function rpsCancelQueue() {
  rpsInQueue = false;
  if (me) db.ref('rps_queue/' + me.uid).remove();
  db.ref('rps_queue').off('value', rpsQueueWatch);
  document.getElementById('rpsJoinBtn').style.display   = 'block';
  document.getElementById('rpsCancelBtn').style.display = 'none';
  document.getElementById('rpsSearching').style.display = 'none';
}

// ── Start game UI ──
function rpsStartGame() {
  // Show arena, hide waiting
  document.getElementById('rps-waiting').style.display = 'none';
  document.getElementById('rps-arena').style.display   = 'block';
  document.getElementById('rpsPlayAgain').style.display = 'none';
  document.getElementById('rpsResult').style.display    = 'none';
  document.getElementById('rpsPtsGained').style.display = 'none';

  // Reset choice state
  rpsMyChoice = null;
  rpsAlreadyProcessed = false;
  document.getElementById('rpsMyChoice').textContent    = '❓';
  document.getElementById('rpsOppChoice').textContent   = '❓';
  document.getElementById('rpsMyChoiceLbl').textContent = 'En attente...';
  document.getElementById('rpsOppChoiceLbl').textContent= 'En attente...';
  document.getElementById('rpsStatus').textContent      = 'Choisis !';

  // Enable choice buttons
  ['btnRock','btnPaper','btnScissors'].forEach(id => {
    const btn = document.getElementById(id);
    btn.disabled = false;
    btn.classList.remove('selected');
  });

  // Fill player info
  const myData  = { username:me.username, pts:me.pts, photo:me.photo||'' };
  const oppData = rpsOppData;
  rpsRenderPlayer('rpsMyAv',  'rpsMyName',  'rpsMyPts',  myData);
  rpsRenderPlayer('rpsOppAv', 'rpsOppName', 'rpsOppPts', oppData);

  // Start countdown from Firebase
  rpsStartCountdown();

  // Listen to game state changes
  if (rpsGameUnsub) { db.ref('rps_games/' + rpsGameId).off('value', rpsGameUnsub); }
  rpsGameUnsub = db.ref('rps_games/' + rpsGameId).on('value', rpsOnGameUpdate);

  // Handle disconnection — if I leave, opponent wins
  db.ref('rps_games/' + rpsGameId).onDisconnect().update({
    status: 'disconnected',
    disconnectedUid: me.uid
  });
}

function rpsRenderPlayer(avId, nameId, ptsId, data) {
  const av = document.getElementById(avId);
  if (data.photo) {
    av.innerHTML = `<img src="${data.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    av.textContent = (data.username||'?')[0].toUpperCase();
  }
  document.getElementById(nameId).textContent = data.username || '—';
  document.getElementById(ptsId).textContent  = (data.pts || 0) + ' pts';
}

// ── Countdown ──
function rpsStartCountdown() {
  rpsCountSec = 5;
  document.getElementById('rpsCountdown').textContent = rpsCountSec;
  if (rpsCountInt) clearInterval(rpsCountInt);

  rpsCountInt = setInterval(() => {
    rpsCountSec--;
    const el = document.getElementById('rpsCountdown');
    el.textContent = Math.max(0, rpsCountSec);

    // Pulse animation
    el.classList.remove('pulse');
    void el.offsetWidth; // reflow
    el.classList.add('pulse');

    if (rpsCountSec <= 0) {
      clearInterval(rpsCountInt);
      // If no choice made, auto-lose
      if (!rpsMyChoice) {
        rpsChoose('__none__'); // will be treated as forfeit
      }
    }
  }, 1000);
}

// ── Player makes a choice ──
function rpsChoose(choice) {
  if (rpsMyChoice && choice !== '__none__') return; // already chose
  rpsMyChoice = choice;

  // Update button UI
  if (choice !== '__none__') {
    ['btnRock','btnPaper','btnScissors'].forEach(id => {
      document.getElementById(id).disabled = true;
      document.getElementById(id).classList.remove('selected');
    });
    const btnMap = { rock:'btnRock', paper:'btnPaper', scissors:'btnScissors' };
    if (btnMap[choice]) document.getElementById(btnMap[choice]).classList.add('selected');

    // Show my choice immediately
    document.getElementById('rpsMyChoice').textContent    = RPS_EMOJI[choice];
    document.getElementById('rpsMyChoiceLbl').textContent = RPS_LABELS[choice];
    document.getElementById('rpsStatus').textContent = 'En attente de l\'adversaire...';
  }

  // Write choice to Firebase
  const field = rpsRole === 'host' ? 'hostChoice' : 'guestChoice';
  db.ref('rps_games/' + rpsGameId + '/' + field).set(choice);
}

// ── Listen to game state ──
function rpsOnGameUpdate(snap) {
  if (!snap.exists()) return;
  const game = snap.val();

  // Handle disconnection
  if (game.status === 'disconnected') {
    clearInterval(rpsCountInt);
    if (game.disconnectedUid !== me.uid) {
      // I win — update my points
      me.pts += RPS_PTS_WIN;
      db.ref('players/' + me.uid + '/pts').set(me.pts);
      db.ref('online/'  + me.uid + '/pts').set(me.pts);
      document.getElementById('hpts').textContent = me.pts + ' pts';
      rpsShowResult('win', '__disconnect__', true);
    } else {
      rpsShowResult('loss', '__disconnect__', false);
    }
    return;
  }

  // Wait until BOTH choices are submitted
  const hc = game.hostChoice;
  const gc = game.guestChoice;
  if (!hc || !gc) return;

  // Stop countdown as soon as both choices are in
  clearInterval(rpsCountInt);

  // --- FIX: Both clients wait for 'done' status with result written by host ---
  // Host: calculate result, write to DB, then apply locally
  if (rpsRole === 'host' && game.status !== 'done') {
    const result = rpsCalcWinner(hc, gc);
    db.ref('rps_games/' + rpsGameId).update({ status: 'done', result })
      .then(() => rpsApplyPoints(result, hc, gc));
    return;
  }

  // Guest (and host on re-trigger): only proceed when status === 'done' AND result is set
  if (game.status === 'done' && game.result) {
    // Prevent processing twice
    if (rpsAlreadyProcessed) return;
    rpsAlreadyProcessed = true;
    rpsApplyPoints(game.result, hc, gc);
  }
}

function rpsCalcWinner(hc, gc) {
  if (hc === '__none__' && gc === '__none__') return 'draw';
  if (hc === '__none__') return 'guest';
  if (gc === '__none__') return 'host';
  if (hc === gc) return 'draw';
  return RPS_BEATS[hc] === gc ? 'host' : 'guest';
}

function rpsApplyPoints(result, hc, gc) {
  // Each client independently determines if they won
  const iWin = (rpsRole === 'host' && result === 'host') ||
               (rpsRole === 'guest' && result === 'guest');
  const isDraw = result === 'draw';

  // Update winner's points — each client only updates their own
  if (iWin) {
    me.pts += RPS_PTS_WIN;
    db.ref('players/' + me.uid + '/pts').set(me.pts);
    db.ref('online/'  + me.uid + '/pts').set(me.pts);
    document.getElementById('hpts').textContent = me.pts + ' pts';
  }

  rpsRevealBothChoices(hc, gc, result);
}

function rpsRevealBothChoices(hc, gc, result) {
  const myChoice  = rpsRole === 'host' ? hc : gc;
  const oppChoice = rpsRole === 'host' ? gc : hc;
  const iWin = (rpsRole === 'host' && result === 'host') || (rpsRole === 'guest' && result === 'guest');
  const isDraw = result === 'draw';
  const disconnectWin = result === '__disconnect__';

  // Reveal opponent's choice with animation
  const oppEl = document.getElementById('rpsOppChoice');
  oppEl.textContent = oppChoice === '__none__' ? '💨' : (RPS_EMOJI[oppChoice] || '?');
  oppEl.classList.remove('reveal');
  void oppEl.offsetWidth;
  oppEl.classList.add('reveal');
  document.getElementById('rpsOppChoiceLbl').textContent = oppChoice === '__none__' ? 'Forfait' : (RPS_LABELS[oppChoice] || '');

  // Re-show my choice with animation
  const myEl = document.getElementById('rpsMyChoice');
  myEl.textContent = myChoice === '__none__' ? '💨' : (RPS_EMOJI[myChoice] || '?');
  myEl.classList.remove('reveal');
  void myEl.offsetWidth;
  myEl.classList.add('reveal');

  // Show result after short delay
  setTimeout(() => rpsShowResult(iWin ? 'win' : isDraw ? 'draw' : 'loss', result, disconnectWin), 600);
}

function rpsShowResult(outcome, result, disconnectWin) {
  const resultEl = document.getElementById('rpsResult');
  const ptsEl    = document.getElementById('rpsPtsGained');
  resultEl.style.display = 'block';
  ptsEl.style.display    = 'block';

  if (outcome === 'win') {
    resultEl.textContent        = disconnectWin ? '🏆 Adversaire déconnecté — Tu gagnes !' : '🏆 VICTOIRE !';
    resultEl.style.background   = 'rgba(26,180,80,.2)';
    resultEl.style.color        = 'var(--green)';
    ptsEl.textContent           = '+' + RPS_PTS_WIN + ' pts ajoutés à ton score 🔥';
    document.getElementById('rpsMyPts').textContent = me.pts + ' pts';
  } else if (outcome === 'draw') {
    resultEl.textContent        = '🤝 ÉGALITÉ !';
    resultEl.style.background   = 'rgba(122,158,130,.15)';
    resultEl.style.color        = 'var(--gray)';
    ptsEl.textContent           = 'Aucun point — Match nul';
  } else {
    resultEl.textContent        = '😤 DÉFAITE';
    resultEl.style.background   = 'rgba(224,53,53,.15)';
    resultEl.style.color        = 'var(--red)';
    ptsEl.textContent           = '0 pts';
  }

  document.getElementById('rpsCountdown').textContent = '—';
  document.getElementById('rpsStatus').textContent    = 'Terminé';
  document.getElementById('rpsChoiceBtns').style.opacity = '0.4';
  document.getElementById('rpsPlayAgain').style.display  = 'block';
}

// ── Rematch ──
function rpsRequestRematch() {
  document.getElementById('rpsRematchStatus').textContent = 'En attente de l\'adversaire...';
  db.ref('rps_games/' + rpsGameId + '/rematch/' + me.uid).set(true);

  // Check if both want rematch
  db.ref('rps_games/' + rpsGameId + '/rematch').on('value', snap => {
    if (!snap.exists()) return;
    const data = snap.val();
    const uids = Object.keys(data);
    if (uids.length >= 2) {
      db.ref('rps_games/' + rpsGameId + '/rematch').off('value');
      toast('🔄', 'Revanche acceptée !');
      // Reset game for new round
      db.ref('rps_games/' + rpsGameId).update({
        status: 'countdown', hostChoice: null, guestChoice: null,
        result: null, rematch: null, countdown: 5
      });
      rpsStartGame();
    }
  });
}

// ── Leave game ──
function rpsLeave() {
  if (rpsGameUnsub) { db.ref('rps_games/' + rpsGameId).off('value', rpsGameUnsub); rpsGameUnsub = null; }
  if (rpsCountInt)  { clearInterval(rpsCountInt); rpsCountInt = null; }
  rpsGameId = null; rpsRole = null; rpsOppData = null; rpsMyChoice = null;
  document.getElementById('rps-arena').style.display   = 'none';
  document.getElementById('rps-waiting').style.display = 'block';
  document.getElementById('rpsJoinBtn').style.display   = 'block';
  document.getElementById('rpsCancelBtn').style.display = 'none';
  document.getElementById('rpsSearching').style.display = 'none';
}