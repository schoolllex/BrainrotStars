const lobbyEl = document.getElementById('lobby');
const deckSelectorEl = document.getElementById('deck-selector');
const gameEl = document.getElementById('game');
const invitationModal = document.getElementById('invitation-modal');
const joinBtn = document.getElementById('join');
const roomInput = document.getElementById('room');
let playerPseudo = 'Player';
const handEl = document.getElementById('hand');
const canvas = document.getElementById('canvas');
let localPlayerId = localStorage.getItem('playerId') || null;
let currentRoom = null;
let selectedDeck = [];
let currentRoomId = null;
let isInvitationAccepted = false;
let isInvitationWaiting = false;
// Partie trouvee par le matchmaking : les deux joueurs sont prets des qu'ils
// valident leur deck, sans passer par l'invitation a accepter.
let isMatchmakingGame = false;
let matchEnded = false;
/**
 * Arrivee par "Lancer une partie" (accueil, ?matchmaking=1) : la recherche
 * demarre tout de suite, sans afficher le lobby et son tuto.
 */
const matchmakingFromHome = new URLSearchParams(window.location.search).get('matchmaking') === '1';
const pageParams = new URLSearchParams(window.location.search);
const isTournamentGame = pageParams.get('tournament') === '1' && (pageParams.get('room') || '').startsWith('t-');
const tournamentPageUrl = pageParams.get('tid')
  ? `../tournament/tournament.html?id=${encodeURIComponent(pageParams.get('tid'))}`
  : '../tournament/tournament.html';
const spectateRoomId = (pageParams.get('spectate') || '').trim();
let spectating = false;
if (isTournamentGame) isMatchmakingGame = true;
if (matchmakingFromHome || isTournamentGame || spectateRoomId) lobbyEl.style.display = 'none';




/* --------------------------------------------------------------------------
   Effets visuels et sonores de selection de carte.
   Safari iOS limite severement le nombre d'AudioContext : en creer un neuf a
   chaque clic finissait par rendre le son muet, puis par faire ramer l'onglet.
   On en partage donc un seul, cree au premier geste utilisateur et reveille
   si le systeme l'a suspendu.
   -------------------------------------------------------------------------- */

let sharedAudioContext = null;
function getAudioContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    if (!sharedAudioContext) sharedAudioContext = new Ctor();
    if (sharedAudioContext.state === 'suspended') sharedAudioContext.resume();
    return sharedAudioContext;
  } catch {
    return null;
  }
}

function playBeep(fromHz, toHz, gainValue, duration) {
  const audioContext = getAudioContext();
  if (!audioContext) return;
  try {
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.frequency.setValueAtTime(fromHz, now);
    osc.frequency.exponentialRampToValueAtTime(toHz, now + 0.1);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    osc.start(now);
    osc.stop(now + duration);
    // Sans cette liberation, les noeuds s'accumulaient dans le graphe audio.
    osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch {} };
  } catch {}
}

// L'element est desormais passe explicitement : l'ancien code lisait la
// variable globale `event`, supprimee des navigateurs modernes.
function playCardSelectEffect(element) {
  createCardParticles(element, 'select');
  playBeep(800, 1200, 0.3, 0.15);
}

function playCardDeselectEffect(element) {
  createCardParticles(element, 'deselect');
  playBeep(600, 400, 0.2, 0.12);
}

function createCardParticles(element, type) {
  if (!element) return;
  
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  // Create 6-8 particles
  const particleCount = type === 'select' ? 8 : 5;
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.style.cssText = `
      position: fixed;
      left: ${centerX}px;
      top: ${centerY}px;
      pointer-events: none;
      z-index: 1000;
      font-size: 1.2rem;
      font-weight: bold;
    `;
    
    if (type === 'select') {
      particle.textContent = '✨';
      particle.style.animation = `particleFloat${Math.random() > 0.5 ? '1' : '2'} 0.8s ease-out forwards`;
    } else {
      particle.textContent = '💨';
      particle.style.animation = `particleFloat${Math.random() > 0.5 ? '3' : '4'} 0.6s ease-out forwards`;
    }
    
    document.body.appendChild(particle);
    
    // Remove particle after animation
    setTimeout(() => particle.remove(), 800);
  }
}

// Add particle animations to CSS dynamically
function initParticleAnimations() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes particleFloat1 {
      0% {
        transform: translate(0, 0) scale(1) rotate(0deg);
        opacity: 1;
      }
      100% {
        transform: translate(30px, -50px) scale(0.5) rotate(360deg);
        opacity: 0;
      }
    }
    
    @keyframes particleFloat2 {
      0% {
        transform: translate(0, 0) scale(1) rotate(0deg);
        opacity: 1;
      }
      100% {
        transform: translate(-30px, -50px) scale(0.5) rotate(-360deg);
        opacity: 0;
      }
    }
    
    @keyframes particleFloat3 {
      0% {
        transform: translate(0, 0) scale(1);
        opacity: 1;
      }
      100% {
        transform: translate(20px, -40px) scale(0.3);
        opacity: 0;
      }
    }
    
    @keyframes particleFloat4 {
      0% {
        transform: translate(0, 0) scale(1);
        opacity: 1;
      }
      100% {
        transform: translate(-20px, -40px) scale(0.3);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

// Initialize animations on load
initParticleAnimations();

function showSpectatorEndOverlay(payload) {
  const crowns = payload.crowns || {};
  const [a, b] = currentRoom?.players || [];
  const draw = payload.draw || !payload.winnerId;
  const scoreA = a ? crowns[a.id] || 0 : 0;
  const scoreB = b ? crowns[b.id] || 0 : 0;
  const overlay = document.createElement('div');
  overlay.className = 'game-end-overlay';
  const content = document.createElement('div');
  content.className = 'game-end-card game-end-draw';
  content.innerHTML = `
    <div class="game-end-emoji">${draw ? '🤝' : '🏁'}</div>
    <div class="game-end-title">${draw ? 'ÉGALITÉ' : 'FIN DU MATCH'}</div>
    <div class="game-end-score">
      <div class="cr-crowns is-me">${crownsHtml(scoreA)}</div>
      <strong>${scoreA} – ${scoreB}</strong>
      <div class="cr-crowns">${crownsHtml(scoreB)}</div>
    </div>
    <div class="game-end-sub">${escapeHtml(a?.name || '?')} contre ${escapeHtml(b?.name || '?')}<br>${draw ? 'Personne n’a pris l’avantage.' : `<strong>${escapeHtml(payload.winnerName)}</strong> a gagné`}</div>
    <a class="btn-play game-end-back" href="../admin/admin.html">Retour au panel</a>`;
  overlay.appendChild(content);
  document.body.appendChild(overlay);
}

function showGameEndedOverlay(payload) {
  if (spectating) {
    showSpectatorEndOverlay(payload);
    return;
  }
  const crowns = payload.crowns || {};
  const draw = payload.draw || !payload.winnerId;
  const isWinner = !draw && payload.winnerId === localPlayerId;
  const myCrowns = crowns[localPlayerId] || 0;
  const foeId = Object.keys(crowns).find((id) => id !== localPlayerId);
  const foeCrowns = foeId ? crowns[foeId] || 0 : 0;
  const rewards = payload.rewards;

  const overlay = document.createElement('div');
  overlay.className = 'game-end-overlay';
  const content = document.createElement('div');
  content.className = 'game-end-card ' + (isWinner ? 'game-end-win' : draw ? 'game-end-draw' : 'game-end-loss');

  let rewardsHTML = '';
  if (isWinner && rewards) {
    const items = [];
    if (rewards.gold) items.push(`<div class="reward-item gold-reward"><div class="reward-icon">💰</div><div class="reward-amount">${rewards.gold}</div><div class="reward-label">Or</div></div>`);
    if (rewards.chest) items.push(`<div class="reward-item chest-reward"><div class="reward-icon">${escapeHtml(rewards.chestIcon || '📦')}</div><div class="reward-amount">1</div><div class="reward-label">${escapeHtml(rewards.chestName || 'Coffre')}</div></div>`);
    if (rewards.exp) items.push(`<div class="reward-item exp-reward"><div class="reward-icon">⭐</div><div class="reward-amount">+${rewards.exp}</div><div class="reward-label">Exp</div></div>`);
    rewardsHTML = `<div class="game-end-rewards"><div class="rewards-title">🎁 Récompenses</div><div class="rewards-grid">${items.join('')}</div></div>`;
  }

  const forfeit = payload.reason === 'forfeit';
  const title = draw ? 'ÉGALITÉ' : isWinner ? 'VICTOIRE !' : 'DÉFAITE';
  const emoji = draw ? '🤝' : isWinner ? (forfeit ? '🏳️' : '🏆') : '💥';
  const winText = {
    king: 'Tu as détruit la tour du roi !',
    crowns: 'Tu as détruit plus de tours que ton adversaire !',
    towers: 'Les tours adverses étaient plus abîmées que les tiennes.',
    forfeit: 'Ton adversaire a quitté la partie.'
  };
  let sub = draw
    ? (forfeit ? 'Les deux joueurs ont quitté la partie.' : 'Personne n’a pris l’avantage.')
    : isWinner ? (winText[payload.reason] || winText.crowns) : `<strong>${escapeHtml(payload.winnerName)}</strong> a gagné`;
  if (isWinner && forfeit && !rewards && !isTournamentGame) sub += '<br><small>Pas de récompense : la partie a duré moins d’une minute.</small>';
  if (isTournamentGame && draw) sub = 'Égalité : la manche va être rejouée.';
  const backUrl = isTournamentGame ? tournamentPageUrl : '../index/index.html';
  content.innerHTML = `
    <div class="game-end-emoji">${emoji}</div>
    <div class="game-end-title">${title}</div>
    <div class="game-end-score">
      <div class="cr-crowns is-me">${crownsHtml(myCrowns)}</div>
      <strong>${myCrowns} – ${foeCrowns}</strong>
      <div class="cr-crowns">${crownsHtml(foeCrowns)}</div>
    </div>
    <div class="game-end-sub">${sub}</div>
    ${rewardsHTML}
    <a class="btn-play game-end-back" href="${backUrl}">${isTournamentGame ? 'Retour au tournoi' : 'Retour à l’accueil'}</a>`;

  overlay.appendChild(content);
  document.body.appendChild(overlay);
  setTimeout(() => { window.location.href = backUrl; }, 6000);
}
/* ==========================================================================
   TEMPS REEL : socket.io
   --------------------------------------------------------------------------
   Remplace l'ancien EventSource. Avantages concrets :
     - une seule connexion : celle que la page a ouverte pour tous ses appels
       d'API (assets/realtime.js), reutilisee par le combat ;
     - le serveur n'envoie que les deltas, pas la room entiere 10 fois/seconde ;
     - jouer une carte passe par la meme connexion : plus de requete HTTP
       (et donc plus de re-authentification) a chaque carte posee.
   ========================================================================== */

let gameSocket = null;
let joinedRoomId = null;
let gameRoomJoined = false;
let gameReadyRequested = false;

/**
 * La socket est celle de la page (assets/realtime.js), deja ouverte pour les
 * appels d'API : le combat n'ouvre plus de connexion a lui. Les evenements du
 * combat n'y sont branches qu'une fois.
 */
function bindGameSocket() {
  if (gameSocket) return gameSocket;
  gameSocket = window.BrainrotRealtime?.socket?.() || null;
  if (!gameSocket) return null;

  gameSocket.on('disconnect', () => { gameRoomJoined = false; });

  gameSocket.on('connect', () => {
    gameRoomJoined = false;
    // A chaque reconnexion on rejoint la room : le serveur renvoie alors
    // un etat complet, ce qui resynchronise la partie apres une coupure.
    if (!joinedRoomId) return;
    Arena.reset();
    if (spectating) gameSocket.emit('spectate', { roomId: joinedRoomId }, onSpectateAck);
    else gameSocket.emit('join', { roomId: joinedRoomId }, onJoinAck);
  });

  gameSocket.on('init', (data) => {
    if (!joinedRoomId || !data || !data.room) return;
    if (data.playerId) {
      localPlayerId = data.playerId;
      try { localStorage.setItem('playerId', localPlayerId); } catch {}
    } else if (spectating) {
      localPlayerId = data.room.players?.[0]?.id || null;
    }
    currentRoom = data.room;
    Arena.reset();
    Arena.setPerspective(localPlayerId, data.room.players || []);
    Arena.spawn(data.room.entities || []);
    setClock(data.room.clock);
    applyRoomState(currentRoom);
    if (spectating) showSpectatorView();
  });

  gameSocket.on('players', (data) => {
    if (!joinedRoomId || !data || !Array.isArray(data.players)) return;
    if (!currentRoom) currentRoom = { id: joinedRoomId, players: [], entities: [] };
    currentRoom.players = data.players;
    currentRoom.started = data.started;
    setClock(data.clock);
    if (data.invitation) currentRoom.invitation = data.invitation;
    applyRoomState(currentRoom);
  });

  gameSocket.on('spawn', (list) => { if (joinedRoomId) Arena.spawn(list); });
  gameSocket.on('mv', (list) => { if (joinedRoomId) Arena.move(list); });
  gameSocket.on('rm', (ids) => { if (joinedRoomId) Arena.remove(ids); });
  gameSocket.on('fx', (list) => { if (joinedRoomId) Arena.fx(list); });

  gameSocket.on('ended', (payload) => {
    if (!joinedRoomId || !payload) return;
    matchEnded = true;
    closeLeaveGameModal();
    window.PlayWebAnalytics?.setStatus('online');
    window.PlayWebAnalytics?.track(
      payload.winnerId === localPlayerId ? 'match_won' : 'match_lost'
    );
    selectCard(null);
    showGameEndedOverlay(payload);
    Arena.shake(15, 600);
  });

  gameSocket.on('effect', (payload) => {
    if (payload && payload.effect === 'screenShake') {
      Arena.shake(payload.intensity || 6, payload.duration || 300);
    }
  });

  return gameSocket;
}

function connectGameSocket(roomId) {
  if (!bindGameSocket()) { console.error('Connexion temps reel impossible'); return; }
  joinedRoomId = roomId;
  gameRoomJoined = false;
  gameReadyRequested = false;
  // Deconnectee : le 'connect' a venir rejoindra la room.
  if (gameSocket.connected) gameSocket.emit('join', { roomId }, onJoinAck);
}

function onJoinAck(res) {
  if (!res?.ok) {
    console.error('Impossible de rejoindre la room :', res?.error);
    return;
  }
  if (!joinedRoomId || !gameSocket?.connected) return;
  gameRoomJoined = true;
  if (gameReadyRequested) sendGameReady();
}

function showSpectatorView() {
  if (gameEl.style.display === 'block') {
    renderRoom(currentRoom);
    return;
  }
  invitationModal.style.display = 'none';
  gameEl.style.display = 'block';
  document.body.classList.add('game-active', 'is-spectator');
  Arena.start();
  renderRoom(currentRoom);
  if (!currentRoom?.started) showGameToast('👀 Le match n’a pas encore commencé.', 4000);
}

function onSpectateAck(res) {
  if (!res || res.ok) return;
  joinedRoomId = null;
  gameEl.style.display = 'none';
  document.body.classList.remove('game-active', 'is-spectator');
  invitationModal.style.display = 'flex';
  showWaitingDeadEnd('👀 Match indisponible', res.error || 'Ce match est terminé.');
}

async function startSpectating(roomId) {
  try { await window.BrainrotAuth?.waitUntilReady?.(); } catch {}
  spectating = true;
  if (!bindGameSocket()) return;
  joinedRoomId = roomId;
  if (gameSocket.connected) gameSocket.emit('spectate', { roomId }, onSpectateAck);
}

/** Quitte la room de combat ; la socket de la page, elle, reste ouverte. */
function disconnectGameSocket() {
  if (!gameSocket || !joinedRoomId) return;
  gameSocket.emit('leave');
  joinedRoomId = null;
  gameRoomJoined = false;
  gameReadyRequested = false;
  Arena.reset();
}

window.addEventListener('pagehide', disconnectGameSocket);

/* ==========================================================================
   NAVBAR PENDANT UNE PARTIE
   --------------------------------------------------------------------------
   La navbar partagee reste visible pendant le combat. Tout clic dessus (logo
   compris) passe d'abord par un modal de confirmation, pour ne pas quitter la
   partie par erreur.
   ========================================================================== */

const leaveGameModal = document.getElementById('leave-game-modal');
let pendingNavTarget = null;
let leaveConfirmed = false;

function isMatchInProgress() {
  return !spectating && document.body.classList.contains('game-active') && !matchEnded;
}

function openLeaveGameModal(target) {
  pendingNavTarget = target;
  selectCard(null);
  leaveGameModal.style.display = 'flex';
  document.getElementById('leave-game-stay').focus();
}

function closeLeaveGameModal() {
  pendingNavTarget = null;
  leaveGameModal.style.display = 'none';
}

// En phase de capture : on passe avant les handlers propres aux boutons
// (le Profil redirige en JS, ce n'est pas un simple lien). Couvre la navbar
// et le menu hamburger mobile, mais pas le bouton qui ouvre ce menu.
document.addEventListener('click', (ev) => {
  if (leaveConfirmed || !isMatchInProgress()) return;
  const target = ev.target.closest('.navbar a, .navbar button, .mobile-menu-overlay a, .mobile-menu-overlay button');
  if (!target || target.classList.contains('mobile-menu-btn')) return;
  ev.preventDefault();
  ev.stopPropagation();
  // Le menu mobile se referme : le modal s'affiche seul.
  if (target.closest('.mobile-menu-overlay')) document.querySelector('.mobile-menu-btn.active')?.click();
  openLeaveGameModal(target);
}, true);

document.getElementById('leave-game-stay').addEventListener('click', closeLeaveGameModal);
leaveGameModal.addEventListener('click', (ev) => {
  if (ev.target === leaveGameModal) closeLeaveGameModal();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && leaveGameModal.style.display === 'flex') closeLeaveGameModal();
});

/**
 * Abandon explicite, confirme par le serveur. Le 'leave' envoye pendant la
 * fermeture de la page peut se perdre : l'adversaire attendait alors la fin
 * du delai de grace au lieu de gagner tout de suite.
 */
function quitMatch() {
  return new Promise((resolve) => {
    if (!gameSocket || !gameSocket.connected) return resolve();
    const timer = setTimeout(resolve, 800);
    gameSocket.emit('leave', {}, () => { clearTimeout(timer); resolve(); });
  });
}

document.getElementById('leave-game-confirm').addEventListener('click', async () => {
  const target = pendingNavTarget;
  closeLeaveGameModal();
  if (!target) return;
  await quitMatch();
  // On rejoue le clic d'origine, cette fois sans l'intercepter.
  leaveConfirmed = true;
  target.click();
  leaveConfirmed = false;
});

/**
 * Applique l'etat de room recu : gere la phase d'invitation puis le jeu.
 * N'est appele que lorsque l'etat joueurs change reellement, plus a chaque
 * tick : c'est ce qui evitait le plus gros du lag sur iPad, ou la main etait
 * reconstruite en DOM 10 fois par seconde.
 */
function applyRoomState(room) {
  if (!room) return;

  const invModalVisible = invitationModal.style.display === 'flex';
  const gameVisible = gameEl.style.display === 'block';

  if (invModalVisible) {
    if (room.players.length !== 2) {
      // L'adversaire est reparti avant le combat : le serveur a libere sa place.
      if (waitingOpponentName && !gameStartScheduled && isTournamentGame) {
        document.getElementById('invitation-title').textContent = '⌛ ' + waitingOpponentName + ' est parti';
        document.getElementById('invitation-message').textContent = 'S’il ne revient pas à temps, tu remportes la manche.';
        waitingOpponentName = null;
      } else if (waitingOpponentName && !gameStartScheduled) {
        showWaitingDeadEnd('🚪 ' + waitingOpponentName + ' est parti', 'Ton adversaire a quitté la partie avant le combat.');
      }
      return;
    }

    const opponent = room.players.find(p => p.id !== localPlayerId);
    const bothReady = room.players.every(p => p.deckReady === true);
    const title = document.getElementById('invitation-title');
    const message = document.getElementById('invitation-message');
    if (opponent) {
      waitingOpponentName = opponent.name;
      clearTimeout(matchmakingWaitTimer);
    }

    if (isMatchmakingGame && opponent) {
      setWaitingButtons({ waiting: true, leaveLabel: '🚪 Quitter' });
      title.textContent = '⚔️ ' + opponent.name;
      message.textContent = opponent.deckReady
        ? '✅ ' + opponent.name + ' a validé son deck ! Démarrage du combat...'
        : 'En attente que ' + opponent.name + ' choisisse son deck...';
    } else if (isInvitationWaiting && !isInvitationAccepted && opponent) {
      title.textContent = '🤝 ' + opponent.name + ' a rejoint !';
      message.textContent = opponent.deckReady
        ? '✅ ' + opponent.name + ' a accepté ! Démarrage du combat...'
        : 'En attente que ' + opponent.name + ' accepte son invitation...';
    } else if (isInvitationAccepted && opponent && opponent.deckReady) {
      title.textContent = '✅ Prêt !';
      message.textContent = 'L\'autre joueur est prêt ! Démarrage du combat...';
    }

    if (bothReady) {
      setWaitingButtons({ waiting: true, leaveLabel: null });
      title.textContent = '🚀 Démarrage...';
      message.textContent = 'Tous les joueurs sont prêts !';
      if (room.started && !gameStartScheduled) {
        gameStartScheduled = true;
        // Le statut remonte au panel : "en ligne" et "en partie" sont deux
        // choses differentes.
        window.PlayWebAnalytics?.setStatus('in_game');
        window.PlayWebAnalytics?.track('match_started');
        setTimeout(() => {
          invitationModal.style.display = 'none';
          gameEl.style.display = 'block';
          document.body.classList.add('game-active');
          Arena.start();
          renderRoom(room);
        }, 600);
      }
    }
    return;
  }

  if (gameVisible) renderRoom(room);
}

let gameStartScheduled = false;

/** Adversaire vu dans la salle d'attente, pour annoncer son depart. */
let waitingOpponentName = null;
let matchmakingWaitTimer = null;
/** En matchmaking, delai laisse a l'adversaire pour valider son deck. */
const MATCHMAKING_DECK_TIMEOUT_MS = 90_000;

function setWaitingButtons({ waiting, leaveLabel }) {
  document.getElementById('waiting-btn').style.display = waiting ? 'flex' : 'none';
  const leaveBtn = document.getElementById('leave-waiting-btn');
  leaveBtn.style.display = leaveLabel ? 'flex' : 'none';
  if (leaveLabel) leaveBtn.textContent = leaveLabel;
}

/** La salle d'attente ne peut plus aboutir : on le dit et on propose de repartir. */
function showWaitingDeadEnd(title, message) {
  clearTimeout(matchmakingWaitTimer);
  document.getElementById('invitation-title').textContent = title;
  document.getElementById('invitation-message').textContent = message;
  document.getElementById('accept-invitation-btn').style.display = 'none';
  document.getElementById('reject-invitation-btn').style.display = 'none';
  setWaitingButtons({ waiting: false, leaveLabel: '↩️ Retour au lobby' });
}

// Quitter la salle d'attente : on recharge le lobby. La fermeture de la page
// previent le serveur, qui libere la place et avertit l'autre joueur.
document.getElementById('leave-waiting-btn').addEventListener('click', async () => {
  await quitMatch();
  window.location.href = isTournamentGame ? tournamentPageUrl : spectating ? '../admin/admin.html' : window.location.pathname;
});

joinBtn.addEventListener('click', async ()=>{
  showDeckSelector();
});

let matchmakingTimerInterval = null;
let matchmakingStartTime = null;
let matchmakingWatching = false;
let matchmakingRetryTimer = null;
/** true du clic sur "Matchmaking" jusqu'au match trouve ou a l'annulation. */
let isSearchingMatch = false;

document.getElementById('matchmaking-btn')?.addEventListener('click', async () => {
  const token = window.BrainrotAuth?.getToken?.() || '';
  if (!token) {
    console.error('❌ Pas de token disponible');
    alert('Erreur: Token non disponible');
    return;
  }

  window.PlayWebAnalytics?.track('matchmaking_started');
  showMatchmakingWaiting();
  isSearchingMatch = true;
  resetBotOffer();
  matchmakingStartTime = Date.now();
  if (matchmakingTimerInterval) clearInterval(matchmakingTimerInterval);
  matchmakingTimerInterval = setInterval(updateMatchmakingTimer, 1000);

  try {
    await requestMatch(token);
  } catch (err) {
    console.error('❌ Matchmaking error:', err);
    alert(err.message || 'Erreur réseau. Réessaye !');
    exitMatchmaking();
  }
});

/** Fin de recherche sans match : retour au lobby, ou a l'accueil si on en venait. */
function exitMatchmaking() {
  if (matchmakingFromHome) {
    clearMatchmakingPoll();
    window.location.href = '../index/index.html';
    return;
  }
  hideMatchmakingWaiting();
}

/**
 * S'inscrit dans la file. Le serveur repond directement la room si un
 * adversaire attend deja ; sinon on suit la file en direct par la socket.
 * L'inscription est idempotente : on peut la rejouer apres une coupure.
 */
async function requestMatch(token) {
  const res = await apiFetch(window.API_BASE_URL + '/game/matchmaking', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.success) {
    throw new Error(payload?.message || 'Erreur lors de la recherche. Réessaye !');
  }
  if (!isSearchingMatch) return;
  if (payload.roomId) onMatchFound(payload.roomId);
  else watchMatchmaking();
}

function onMatchFound(roomId) {
  console.log('✅ Match trouvé! Room:', roomId);
  isMatchmakingGame = true;
  clearMatchmakingPoll();
  roomInput.value = roomId;

  const titleEl = document.getElementById('matchmaking-title');
  const msgEl = document.getElementById('matchmaking-message');
  if (titleEl) titleEl.textContent = '🎉 Match trouvé !';
  if (msgEl) msgEl.textContent = 'Choisis ton deck...';

  setTimeout(() => {
    hideMatchmakingWaiting();
    showDeckSelector();
  }, 700);
}

function showMatchmakingWaiting() {
  const lobbyEl = document.getElementById('lobby');
  const waitingEl = document.getElementById('matchmaking-waiting');
  if (lobbyEl) lobbyEl.style.display = 'none';
  if (waitingEl) waitingEl.style.display = 'flex';
  lucide.createIcons();
}

function hideMatchmakingWaiting() {
  const lobbyEl = document.getElementById('lobby');
  const waitingEl = document.getElementById('matchmaking-waiting');
  if (lobbyEl) lobbyEl.style.display = 'block';
  if (waitingEl) waitingEl.style.display = 'none';
  clearMatchmakingPoll();
}

const BOT_BUTTON_AFTER_S = 15;
const botMatchBtn = document.getElementById('bot-match-btn');
const botHint = document.getElementById('bot-hint');
const botHintBar = document.getElementById('bot-hint-bar');
const botHintCount = document.getElementById('bot-hint-count');

function resetBotOffer() {
  botMatchBtn?.classList.add('hidden');
  if (botMatchBtn) botMatchBtn.disabled = false;
  botHint?.classList.remove('hidden');
  if (botHintBar) botHintBar.style.width = '0%';
  if (botHintCount) botHintCount.textContent = BOT_BUTTON_AFTER_S + 's';
}

function updateBotOffer(elapsed) {
  if (!isSearchingMatch) return;
  const left = Math.max(0, BOT_BUTTON_AFTER_S - elapsed);
  if (botHintBar) botHintBar.style.width = Math.min(100, (elapsed / BOT_BUTTON_AFTER_S) * 100) + '%';
  if (botHintCount) botHintCount.textContent = left + 's';
  if (left > 0) return;
  botHint?.classList.add('hidden');
  botMatchBtn?.classList.remove('hidden');
}

function updateMatchmakingTimer() {
  if (!matchmakingStartTime) return;
  const elapsed = Math.floor((Date.now() - matchmakingStartTime) / 1000);
  const timerEl = document.getElementById('matchmaking-timer');
  if (timerEl) {
    timerEl.textContent = elapsed + 's';
  }
  updateBotOffer(elapsed);
}

botMatchBtn?.addEventListener('click', async () => {
  const token = window.BrainrotAuth?.getToken?.() || '';
  if (!token || !isSearchingMatch || botMatchBtn.disabled) return;
  botMatchBtn.disabled = true;
  try {
    const res = await apiFetch(window.API_BASE_URL + '/game/matchmaking/bot', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    const payload = await res.json().catch(() => null);
    if (res.ok && payload?.success && payload.roomId) {
      window.PlayWebAnalytics?.track('bot_match_started');
      onMatchFound(payload.roomId);
      return;
    }
    console.warn('Partie contre le bot impossible :', payload?.message);
  } catch (err) {
    console.error('Bot match error:', err);
  }
  botMatchBtn.disabled = false;
});

function showMatchmakingStats(stats) {
  const queueEl = document.getElementById('queue-count');
  const matchesEl = document.getElementById('active-matches');
  if (queueEl) queueEl.textContent = stats.playersInQueue || 0;
  if (matchesEl) matchesEl.textContent = stats.activeMatches || 0;
}

function onMatchmakingEvent(data) {
  if (!matchmakingWatching || !data) return;
  if (data.type === 'stats' && data.stats) showMatchmakingStats(data.stats);
  if (data.type === 'matchFound' && data.roomId && data.roomId.trim() !== '') onMatchFound(data.roomId);
}

/**
 * Coupure (reseau, redemarrage du serveur) : a la reconnexion on se reinscrit
 * puis on reprend le suivi. Sans cela la recherche resterait affichee sans
 * pouvoir aboutir.
 */
function onMatchmakingReconnect() {
  if (!isSearchingMatch) return;
  const token = window.BrainrotAuth?.getToken?.() || '';
  requestMatch(token).catch((err) => {
    console.warn('Matchmaking indisponible, nouvel essai...', err);
    scheduleMatchmakingRetry(token);
  });
}

function scheduleMatchmakingRetry(token) {
  clearTimeout(matchmakingRetryTimer);
  matchmakingRetryTimer = setTimeout(() => {
    if (!isSearchingMatch) return;
    requestMatch(token).catch((err) => {
      console.warn('Matchmaking indisponible, nouvel essai...', err);
      scheduleMatchmakingRetry(token);
    });
  }, 2500);
}

let matchmakingListenersBound = false;

function watchMatchmaking() {
  const socket = window.BrainrotRealtime?.socket?.();
  if (!socket) throw new Error('Connexion temps réel impossible. Réessaye !');
  if (!matchmakingListenersBound) {
    matchmakingListenersBound = true;
    socket.on('mm', onMatchmakingEvent);
    socket.on('connect', onMatchmakingReconnect);
  }
  matchmakingWatching = true;
  socket.emit('mm:watch', {}, (res) => {
    if (res && res.ok === false && isSearchingMatch) {
      scheduleMatchmakingRetry(window.BrainrotAuth?.getToken?.() || '');
    }
  });
}

function clearMatchmakingPoll() {
  isSearchingMatch = false;
  if (botMatchBtn) {
    botMatchBtn.classList.add('hidden');
    botMatchBtn.disabled = false;
  }
  botHint?.classList.add('hidden');
  clearTimeout(matchmakingRetryTimer);
  matchmakingRetryTimer = null;
  if (matchmakingWatching) {
    matchmakingWatching = false;
    window.BrainrotRealtime?.socket?.()?.emit('mm:unwatch');
  }
  if (matchmakingTimerInterval) {
    clearInterval(matchmakingTimerInterval);
    matchmakingTimerInterval = null;
  }
  matchmakingStartTime = null;
}

document.getElementById('cancel-matchmaking-btn')?.addEventListener('click', async () => {
  try {
    const token = window.BrainrotAuth?.getToken?.() || '';
    clearMatchmakingPoll();
    if (!token) return;

    await apiFetch(window.API_BASE_URL + '/game/matchmaking', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    exitMatchmaking();
  } catch (err) {
    console.error('Cancel matchmaking error:', err);
    exitMatchmaking();
  }
});

// Nettoyer le matchmaking quand l'utilisateur quitte la page
const cleanupMatchmakingOnExit = () => {
  if (!isSearchingMatch) return;
  const token = window.BrainrotAuth?.getToken?.() || '';
  clearMatchmakingPoll();
  if (!token) return;
  // Par la socket encore ouverte ; si elle ne l'est plus, le serveur sort de
  // toute facon de la file un joueur qui ne la suit plus.
  apiFetch(window.API_BASE_URL + '/game/matchmaking', {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    keepalive: true
  }).catch(() => {});
};

// Nettoyer quand l'utilisateur quitte la page
window.addEventListener('beforeunload', cleanupMatchmakingOnExit);
window.addEventListener('pagehide', cleanupMatchmakingOnExit);

// Volontairement : on ne quitte PLUS la file d'attente quand l'onglet passe en
// arriere-plan. Sur iPad, repondre a un message suffisait a annuler la
// recherche de partie. Le serveur dispose deja d'un timeout de heartbeat pour
// nettoyer les joueurs reellement partis.

document.getElementById('invite-btn')?.addEventListener('click', async () => {
  let room = roomInput.value.trim();
  
  // Si pas de room spécifiée, générer un UUID aléatoire
  if (!room) {
    // Générer un UUID v4 simplifié
    room = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0,
            v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    roomInput.value = room;
  }
  
  // Créer l'URL d'invitation
  const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(room)}`;
  
  // Copier/partager le lien
  if (navigator.share) {
    navigator.share({ 
      title: 'BrainrotStars — Combat', 
      text: 'Rejoins mon arène !', 
      url 
    }).then(() => {
      window.location.href = url;
    }).catch(() => {
      window.location.href = url;
    });
  } else {
    navigator.clipboard.writeText(url).then(() => {
      alert('🔗 Lien copié !\n\nArène: ' + room + '\n\nPartage-le à ton ami !');
      window.location.href = url;
    }).catch(() => {
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('🔗 Lien copié !\n\nArène: ' + room + '\n\nPartage-le à ton ami !');
      window.location.href = url;
    });
  }
});

(async () => {
  if (spectateRoomId) {
    startSpectating(spectateRoomId);
    return;
  }
  if (matchmakingFromHome) {
    // Un rechargement de la page ne relance pas une recherche.
    history.replaceState(null, '', window.location.pathname);
    document.getElementById('matchmaking-btn')?.click();
  }

  // Le pseudo est facultatif (le serveur le relit en base) : un echec ici ne
  // doit plus empecher de rejoindre l'arene d'un lien d'invitation.
  try {
    const token = window.BrainrotAuth?.getToken?.() || '';
    const res = token ? await apiFetch(window.API_BASE_URL + '/user/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    }) : null;
    const payload = res && res.ok ? await res.json() : null;
    if (payload?.success && payload?.value?.pseudo) {
      playerPseudo = payload.value.pseudo;
    }
  } catch {}

  const params = new URLSearchParams(window.location.search);
  if (params.get('room')) {
    roomInput.value = params.get('room');
    joinBtn.click();
  }
})();

/* ==========================================================================
   INTERFACE DE PARTIE : HUD (couronnes, chrono, mana), main, pose des cartes
   --------------------------------------------------------------------------
   Le DOM n'est touche que lorsqu'une valeur change. Le chrono et la barre de
   mana avancent en local entre deux messages serveur (10 fois par seconde).
   ========================================================================== */

const hud = {
  enemyName: document.getElementById('enemy-name'),
  enemyCrowns: document.getElementById('enemy-crowns'),
  meName: document.getElementById('me-name'),
  meCrowns: document.getElementById('me-crowns'),
  timer: document.getElementById('timer-value'),
  timerLabel: document.getElementById('timer-label'),
  elixirFill: document.getElementById('elixir-fill'),
  elixirCount: document.getElementById('elixir-count'),
  elixirX2: document.getElementById('elixir-x2'),
  next: document.getElementById('next-card'),
  foeSide: document.querySelector('.cr-side.is-foe')
};

const handCardElements = new Map(); // cardId -> element
const SPELL_RADIUS = { bomb: 56, molotov: 52, freeze: 66, banana: 50 };
let lastHudSignature = '';
let lastFoeAway = false;
let matchClock = null;
let manaState = { value: 0, at: 0, max: 10 };
let selectedCard = null;
let press = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function crownsHtml(n) {
  return [0, 1, 2].map((i) => `<span class="${i < n ? 'on' : ''}">👑</span>`).join('');
}

function setClock(clock) {
  if (!clock) return;
  matchClock = { endsAt: clock.endsAt, overtime: clock.overtime, offset: (clock.serverNow || Date.now()) - Date.now() };
}

function renderRoom(room) {
  if (!room) return;
  const me = room.players.find((p) => p.id === localPlayerId);
  const foe = room.players.find((p) => p.id !== localPlayerId);
  Arena.setPerspective(localPlayerId, room.players);

  const signature = `${foe ? foe.name : ''}|${foe ? foe.crowns : 0}|${me ? me.name : ''}|${me ? me.crowns : 0}`;
  if (signature !== lastHudSignature) {
    lastHudSignature = signature;
    hud.enemyName.textContent = foe ? foe.name : 'Adversaire';
    hud.enemyCrowns.innerHTML = crownsHtml(foe ? foe.crowns || 0 : 0);
    hud.meName.textContent = me ? me.name : 'Toi';
    hud.meCrowns.innerHTML = crownsHtml(me ? me.crowns || 0 : 0);
  }
  if (me && me.mana !== manaState.value) manaState = { value: me.mana, at: performance.now(), max: me.maxMana || 10 };

  // Adversaire deconnecte : le serveur lui laisse un court delai pour revenir,
  // sinon il abandonne et la victoire est pour nous.
  const foeAway = !!(foe && foe.away);
  if (foeAway !== lastFoeAway) {
    lastFoeAway = foeAway;
    hud.foeSide.classList.toggle('is-away', foeAway);
    if (foe && !matchEnded && !spectating) {
      showGameToast(foeAway
        ? `📡 ${foe.name} s'est déconnecté. S'il ne revient pas vite, tu gagnes !`
        : `✅ ${foe.name} est de retour !`, foeAway ? 5000 : 2200);
    }
  }
  if (spectating) return;
  renderHand(me);
  renderNext(me);
}

function cardFace(card, small = false) {
  const art = card.link
    ? `<img src="${escapeHtml(card.link)}" alt="" loading="lazy" decoding="async" draggable="false">`
    : `<span class="cr-card-emoji">${escapeHtml(card.emoji || '❓')}</span>`;
  return `<span class="cr-card-cost">${card.cost}</span>${art}${small ? '' : `<span class="cr-card-name">${escapeHtml(card.name)}</span>`}`;
}

function renderHand(me) {
  const hand = me && Array.isArray(me.hand) ? me.hand.filter(Boolean) : [];
  const ids = new Set(hand.map((c) => c.id));
  if (selectedCard && !ids.has(selectedCard.id)) selectCard(null);

  for (const [cardId, el] of handCardElements) {
    if (!ids.has(cardId)) {
      el.remove();
      handCardElements.delete(cardId);
    }
  }
  const mana = me ? me.mana || 0 : 0;
  hand.forEach((card, index) => {
    let el = handCardElements.get(card.id);
    if (!el) {
      el = buildHandCard(card);
      handCardElements.set(card.id, el);
    }
    el.classList.toggle('card-unaffordable', card.cost > mana);
    el.classList.toggle('card-selected', !!selectedCard && selectedCard.id === card.id);
    if (handEl.children[index] !== el) handEl.insertBefore(el, handEl.children[index] || null);
  });
}

function renderNext(me) {
  const next = me && me.next;
  const key = next ? next.id : '';
  if (hud.next.dataset.id === key) return;
  hud.next.dataset.id = key;
  hud.next.innerHTML = next ? cardFace(next, true) : '';
}

function buildHandCard(card) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'cr-card' + (card.type === 'spell' ? ' is-spell' : '');
  el.dataset.cardId = card.id;
  el._cost = card.cost;
  const role = Arena.roleOf(card);
  el.title = `${card.name} · ${role.label}`;
  el.innerHTML = cardFace(card) + `<span class="cr-card-role">${role.label.split(' ')[0]}${role.flying ? '🪽' : ''}</span>`;
  el.addEventListener('pointerdown', (ev) => {
    if (ev.button !== undefined && ev.button !== 0) return;
    if (ev.pointerType === 'touch') ev.preventDefault();
    press = { card, x: ev.clientX, y: ev.clientY, dragging: false, wasSelected: !!selectedCard && selectedCard.id === card.id };
    selectCard(card);
    playCardSelectEffect(el);
  });
  el.addEventListener('dragstart', (ev) => ev.preventDefault());
  return el;
}

function selectCard(card) {
  selectedCard = card || null;
  for (const el of handCardElements.values()) el.classList.toggle('card-selected', !!card && el.dataset.cardId === card.id);
  Arena.setPlacement(card ? { ...card, radius: SPELL_RADIUS[card.effect] || 55 } : null);
}

function overCanvas(ev) {
  const r = canvas.getBoundingClientRect();
  return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
}

function tryPlay(card, pos) {
  if (spectating || !card || !pos) return;
  if (!Arena.canPlace(card, pos)) {
    showGameToast(card.type === 'spell' ? 'Vise un endroit de l’arène !' : 'Pose tes unités de ton côté de la rivière !');
    return;
  }
  playCard(card.id, pos);
  selectCard(null);
}

// Glisser-deposer (doigt ou souris) : la carte suit le pointeur au-dessus de l'arene.
document.addEventListener('pointermove', (ev) => {
  if (press && !press.dragging && Math.hypot(ev.clientX - press.x, ev.clientY - press.y) > 12) {
    press.dragging = true;
    document.body.classList.add('is-dragging');
  }
  if (!selectedCard) return;
  Arena.setHover(overCanvas(ev) ? Arena.toView(ev.clientX, ev.clientY) : null);
}, { passive: true });

document.addEventListener('pointerup', (ev) => {
  const p = press;
  press = null;
  document.body.classList.remove('is-dragging');
  if (!p) return;
  if (p.dragging) {
    if (overCanvas(ev)) tryPlay(p.card, Arena.toWorld(ev.clientX, ev.clientY));
    else Arena.setHover(null);
  } else if (p.wasSelected) {
    // Deuxieme toucher sur la meme carte : on la repose.
    selectCard(null);
  }
});

// Toucher l'arene avec une carte choisie : on la joue a cet endroit.
canvas.addEventListener('pointerup', (ev) => {
  if (press || !selectedCard) return;
  tryPlay(selectedCard, Arena.toWorld(ev.clientX, ev.clientY));
});

function perPointMs() {
  if (!matchClock) return 1400;
  const left = matchClock.endsAt - (Date.now() + matchClock.offset);
  return matchClock.overtime || left <= 60000 ? 700 : 1400;
}

let lastTimerText = '';
function updateHudClock() {
  if (document.hidden || gameEl.style.display !== 'block') return;
  if (matchClock) {
    const left = Math.max(0, matchClock.endsAt - (Date.now() + matchClock.offset));
    const s = Math.ceil(left / 1000);
    const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (text !== lastTimerText) {
      lastTimerText = text;
      hud.timer.textContent = text;
    }
    const double = matchClock.overtime || left <= 60000;
    const label = matchClock.overtime ? 'Prolongation' : double ? 'Mana x2' : 'Temps';
    if (hud.timerLabel.textContent !== label) hud.timerLabel.textContent = label;
    hud.timer.classList.toggle('is-hot', matchClock.overtime || left <= 30000);
    hud.elixirX2.classList.toggle('hidden', !double);
  }
  const max = manaState.max || 10;
  const partial = manaState.value >= max ? 0 : Math.min(0.98, (performance.now() - manaState.at) / perPointMs());
  hud.elixirFill.style.transform = `scaleX(${Math.min(1, (manaState.value + partial) / max)})`;
  const count = String(manaState.value);
  if (hud.elixirCount.textContent !== count) hud.elixirCount.textContent = count;
}
setInterval(updateHudClock, 100);

/* ==========================================================================
   JOUER UNE CARTE
   --------------------------------------------------------------------------
   Passe par la socket deja authentifiee. Le serveur revalide le mana, la zone
   et la possession de la carte : la verification locale n'est la que pour un
   retour immediat.
   ========================================================================== */

function playCard(cardId, targetPos) {
  if (!currentRoom || !localPlayerId) return;
  const me = currentRoom.players.find((p) => p.id === localPlayerId);
  const card = me && Array.isArray(me.hand) ? me.hand.find((c) => c && c.id === cardId) : null;
  if (!card) return;
  if ((me.mana || 0) < card.cost) {
    showGameToast('Pas assez de mana pour cette carte !');
    return;
  }
  if (!gameSocket || !gameSocket.connected) {
    showGameToast('Connexion perdue, reconnexion en cours...');
    return;
  }
  window.PlayWebAnalytics?.track('card_played');
  gameSocket.emit('play', { cardId, targetPos }, (res) => {
    if (res && res.ok === false) showGameToast(res.error || 'Action refusée');
  });
}

/**
 * Petit retour visuel non bloquant.
 * alert() gelait tout l'onglet et, sur iPad, coupait la boucle de rendu.
 */
let toastTimer = null;
function showGameToast(text, duration = 2200) {
  let toast = document.getElementById('game-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'game-toast';
    toast.className = 'cr-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-on'), duration);
}
async function fetchAvailableCards() {
  try {
    const token = window.BrainrotAuth?.getToken?.() || '';
    const res = await apiFetch(window.API_BASE_URL + '/game/available-cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.cards || [];
  } catch (e) {
    console.error('Erreur fetch cards:', e);
    return [];
  }
}

const DECK_SIZE = 10;
const DECK_STORE = 'brainrot_deck_ids';
let deckEntries = [];

function deckKey(card) {
  return `${card.name}_${card.type || 'unit'}`;
}

function loadSavedDeckIds(available) {
  try {
    const ids = JSON.parse(localStorage.getItem(DECK_STORE) || 'null');
    if (Array.isArray(ids)) return ids;
    const legacy = JSON.parse(localStorage.getItem('brainrot_saved_deck') || '[]');
    if (!Array.isArray(legacy)) return [];
    return legacy.map((key) => available.find((entry) => deckKey(entry.card) === key)?.cardId).filter(Boolean);
  } catch {
    return [];
  }
}

function saveDeck() {
  try {
    localStorage.setItem(DECK_STORE, JSON.stringify(selectedDeck.map((entry) => entry.cardId)));
    localStorage.removeItem('brainrot_saved_deck');
  } catch {}
}

function isInDeck(entry) {
  return selectedDeck.some((picked) => picked.cardId === entry.cardId);
}

function refreshDeckCards() {
  document.querySelectorAll('#deck-list .deck-card').forEach((el) => {
    const entry = deckEntries.find((e) => e.cardId === el.dataset.id);
    el.classList.toggle('selected', !!entry && isInDeck(entry));
  });
  updateDeckCounter();
}

function renderDeckSelector(availableCards) {
  const deckList = document.getElementById('deck-list');
  deckList.innerHTML = '';

  const seen = new Set();
  deckEntries = (availableCards || []).filter((entry) => {
    if (!entry.cardId || seen.has(entry.cardId)) return false;
    seen.add(entry.cardId);
    return true;
  });

  if (deckEntries.length === 0) {
    deckList.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:var(--text-muted);">Pas de cartes disponibles.</p>';
    selectedDeck = [];
    updateDeckCounter();
    return;
  }

  const savedIds = loadSavedDeckIds(deckEntries);
  selectedDeck = [];
  for (const id of savedIds) {
    const entry = deckEntries.find((e) => e.cardId === id);
    if (entry && !isInDeck(entry) && selectedDeck.length < DECK_SIZE) selectedDeck.push(entry);
  }
  saveDeck();

  deckEntries.forEach((entry) => {
    const card = entry.card;
    const cardEl = document.createElement('div');
    cardEl.className = 'deck-card btn-card';
    cardEl.dataset.id = entry.cardId;

    const cardImage = card.link
      ? `<img src="${escapeHtml(card.link)}" alt="" style="width:64px; height:64px; object-fit:cover; border-radius:6px; display:block; margin:0 auto; flex-shrink:0;">`
      : `<div class="card-emoji">${escapeHtml(card.emoji || '🃏')}</div>`;

    cardEl.innerHTML = `
      <span class="deck-check" aria-hidden="true">✓</span>
      ${cardImage}
      <div class="card-name">${escapeHtml(card.name)}</div>
      <div class="card-cost-label">Coût: <span class="card-cost">${Number(card.cost) || 1}</span></div>
      <div class="card-type">${escapeHtml(Arena.roleOf(card).label)}</div>
    `;

    cardEl.addEventListener('click', () => {
      if (isInDeck(entry)) {
        selectedDeck = selectedDeck.filter((picked) => picked.cardId !== entry.cardId);
      } else if (selectedDeck.length >= DECK_SIZE) {
        showGameToast(`Ton deck est complet (${DECK_SIZE}/${DECK_SIZE}) : retire une carte d'abord.`);
        cardEl.animate?.([
          { transform: 'translateX(0)' },
          { transform: 'translateX(-5px)' },
          { transform: 'translateX(5px)' },
          { transform: 'translateX(0)' }
        ], { duration: 240 });
        return;
      } else {
        selectedDeck.push(entry);
      }
      saveDeck();
      refreshDeckCards();
    });

    deckList.appendChild(cardEl);
  });

  const clearBtn = document.getElementById('clear-deck');
  if (clearBtn) {
    clearBtn.onclick = () => {
      selectedDeck = [];
      saveDeck();
      refreshDeckCards();
    };
  }

  refreshDeckCards();
}

function updateDeckCounter() {
  const confirmBtn = document.getElementById('confirm-deck');
  const isComplete = selectedDeck.length === DECK_SIZE;
  confirmBtn.disabled = !isComplete;
  confirmBtn.innerHTML = `⚔️ Commencer le combat (${selectedDeck.length}/${DECK_SIZE})<div class="shine"></div>`;
  confirmBtn.classList.toggle('btn-disabled', !isComplete);
  const clearBtn = document.getElementById('clear-deck');
  if (clearBtn) clearBtn.disabled = selectedDeck.length === 0;
}

async function showDeckSelector() {
  let fetchedCards = [];
  try {
    const token = window.BrainrotAuth?.getToken?.() || '';
    const url = window.API_BASE_URL + '/game/getCard';
    const res = await apiFetch(url, { method: 'GET' , headers: {'Content-Type':'application/json', 'Authorization': `Bearer ${token}`},});
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.result)) {
        fetchedCards = data.result;
      } else if (Array.isArray(data)) {
        fetchedCards = data;
      } else {
        console.warn('Unexpected /game/getCard shape', data);
      }
    } else {
      console.warn('getCard responded with', res.status);
    }
  } catch (e) {
    console.error('Erreur fetch /game/getCard:', e);
  }

  // Vérifier si l'utilisateur a assez de cartes
  if (!fetchedCards || fetchedCards.length === 0) {
    // Pas de cartes du tout
    alert('❌ Tu n\'as pas de cartes disponibles!\n\nTu dois débloquer au moins 10 cartes avant de jouer.\nRetour à l\'accueil...');
    window.location.href = '../index/index.html';
    return;
  }
  
  if (fetchedCards.length < 10) {
    // Moins de 10 cartes
    const missing = 10 - fetchedCards.length;
    alert(`⚠️ Tu n'as que ${fetchedCards.length}/10 cartes!\n\nIl te manque ${missing} carte(s) pour former un deck complet.\n\nDéverrouille plus de cartes et réessaye!`);
    window.location.href = '../index/index.html';
    return;
  }

  const normalized = fetchedCards.map((entry) => {
    const cardData = entry.card || entry;
    return {
      cardId: entry.cardId || cardData.id,
      deckId: entry.deckId,
      quantity: entry.quantity || 1,
      card: cardData
    };
  });

  renderDeckSelector(normalized);
  lobbyEl.style.display = 'none';
  deckSelectorEl.style.display = 'block';
}

document.getElementById('confirm-deck').addEventListener('click', async () => {
  if (selectedDeck.length !== DECK_SIZE) {
    showGameToast(`Choisis ${DECK_SIZE} cartes pour ton deck.`);
    return;
  }

  const name = playerPseudo;
  const room = roomInput.value || 'room1';
  currentRoomId = room;

  try {
    const token = window.BrainrotAuth?.getToken?.() || '';
    const res = await apiFetch(window.API_BASE_URL + '/game/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        roomId: room,
        name,
        playerId: localPlayerId,
        selectedCards: selectedDeck,
        view: 'horizontal'
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'join failed' }));
      if (isTournamentGame) {
        alert(err && err.error ? err.error : 'Ce match de tournoi n’est plus disponible.');
        window.location.href = tournamentPageUrl;
        return;
      }
      alert('Join failed: ' + (err && err.error ? err.error : res.status));
      return;
    }

    const data = await res.json();
    localPlayerId = data.playerId;
    try { localStorage.setItem('playerId', localPlayerId); } catch {}
    currentRoom = data.room;

    deckSelectorEl.style.display = 'none';
    showInvitationModal(data);

    // La socket est ouverte avant toute chose : on ne peut pas rater
    // l'evenement de demarrage de la partie.
    connectGameSocket(room);

    // Le createur de l'arene est pret des qu'il a valide son deck. Le second
    // joueur, lui, ne l'est qu'apres avoir accepte l'invitation : auparavant
    // il etait marque pret d'office, avant meme de voir le modal.
    // En matchmaking il n'y a pas d'invitation : valider son deck suffit.
    if (data.waitingForOpponent || isMatchmakingGame) markReady();
  } catch (e) {
    console.error('Join error:', e);
    alert('Erreur de connexion');
  }
});

function showInvitationModal(joinData) {
  isInvitationAccepted = false;
  isInvitationWaiting = false;
  
  const invModal = document.getElementById('invitation-modal');
  const title = document.getElementById('invitation-title');
  const message = document.getElementById('invitation-message');
  const buttons = document.getElementById('invitation-buttons');
  const acceptBtn = document.getElementById('accept-invitation-btn');
  const rejectBtn = document.getElementById('reject-invitation-btn');
  
  if (isMatchmakingGame) {
    title.textContent = isTournamentGame ? '🏆 Match de tournoi' : '⚔️ Adversaire trouvé';
    message.textContent = isTournamentGame ? 'En attente de ton adversaire...' : 'En attente que ton adversaire choisisse son deck...';
    acceptBtn.style.display = 'none';
    rejectBtn.style.display = 'none';
    setWaitingButtons({ waiting: true, leaveLabel: '🚪 Quitter' });
    clearTimeout(matchmakingWaitTimer);
    if (!isTournamentGame) matchmakingWaitTimer = setTimeout(() => {
      if (!gameStartScheduled && !waitingOpponentName) {
        showWaitingDeadEnd('⌛ Adversaire introuvable', 'Ton adversaire n’a pas validé son deck à temps.');
      }
    }, MATCHMAKING_DECK_TIMEOUT_MS);
  } else if (joinData.waitingForOpponent) {
    // Premier joueur : c'est lui qui invite.
    isInvitationWaiting = true;
    title.textContent = '🎮 Partie créée';
    message.textContent = `Tu as créé une arène. En attente qu'un ami accepte ton invitation...`;
    acceptBtn.style.display = 'none';
    rejectBtn.style.display = 'none';
    setWaitingButtons({ waiting: true, leaveLabel: '🚪 Quitter' });
  } else {
    // Si on est le deuxième joueur (on accepte)
    title.textContent = '📨 Nouvelle invitation';
    message.textContent = `${joinData.invitation?.fromName || 'Un joueur'} t'invite à une partie. Acceptes-tu ?`;
    acceptBtn.style.display = 'block';
    rejectBtn.style.display = 'block';
    setWaitingButtons({ waiting: false, leaveLabel: null });
    
    acceptBtn.onclick = async () => {
      await handleAcceptInvitation(joinData);
    };
    
    rejectBtn.onclick = async () => {
      await handleRejectInvitation(joinData);
    };
  }
  
  invModal.style.display = 'flex';
}

/** Declare le joueur pret aupres du serveur temps reel. */
function markReady() {
  gameReadyRequested = true;
  sendGameReady();
}

/** Attendre l'accuse de join : les handlers asynchrones du serveur se chevauchent. */
function sendGameReady() {
  if (!gameSocket?.connected || !gameRoomJoined || !joinedRoomId) return;
  gameSocket.emit('ready', {}, (res) => {
    if (res && res.ok === false) console.warn('ready refuse :', res.error);
  });
}

function handleAcceptInvitation(joinData) {
  isInvitationAccepted = true;
  const acceptBtn = document.getElementById('accept-invitation-btn');
  const rejectBtn = document.getElementById('reject-invitation-btn');
  const title = document.getElementById('invitation-title');
  const message = document.getElementById('invitation-message');

  acceptBtn.disabled = true;
  rejectBtn.disabled = true;

  markReady();

  title.textContent = '✅ Invitation acceptée';
  message.textContent = 'Connecté avec ' + (joinData.invitation?.fromName || "l'autre joueur") + '. En attente de démarrage...';
  acceptBtn.style.display = 'none';
  rejectBtn.style.display = 'none';
  setWaitingButtons({ waiting: true, leaveLabel: '🚪 Quitter' });
}

async function handleRejectInvitation(joinData) {
  try {
    const token = window.BrainrotAuth?.getToken?.() || '';
    await apiFetch(window.API_BASE_URL + '/game/reject-invitation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        roomId: currentRoomId,
        playerId: localPlayerId
      })
    });

    // On quitte aussi la room temps reel : le serveur libere la place et
    // l'invitant est prevenu au lieu d'attendre indefiniment.
    disconnectGameSocket();

    // Retourner au lobby
    invitationModal.style.display = 'none';
    lobbyEl.style.display = 'block';
  } catch (e) {
    console.error('Reject error:', e);
  }
}
