const lobbyEl = document.getElementById('lobby');
const deckSelectorEl = document.getElementById('deck-selector');
const gameEl = document.getElementById('game');
const invitationModal = document.getElementById('invitation-modal');
const joinBtn = document.getElementById('join');
const roomInput = document.getElementById('room');
let playerPseudo = 'Player';
const handEl = document.getElementById('hand');
const infoEl = document.getElementById('info');
const opponentEl = document.getElementById('opponent');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let localPlayerId = localStorage.getItem('playerId') || null;
let currentRoom = null;
let draggingCardId = null;
let draggingEmoji = null;
let dragPos = null;
let justDragged = false;
let evtSource = null;
let selectedDeck = [];
let currentRoomId = null;
let isInvitationAccepted = false;
let isInvitationWaiting = false;
let isTouchControlMode = true;
let selectedCardForPlacement = null;




// Visual and audio effects for card selection
function playCardSelectEffect() {
  // Create particle effect around the card
  createCardParticles(event?.target, 'select');
  
  // Play subtle select sound using Web Audio API
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    
    // High-pitched beep for selection
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    
    osc.start(now);
    osc.stop(now + 0.15);
  } catch (e) {
    // Audio context not available, continue without sound
  }
}

function playCardDeselectEffect() {
  // Create particle effect
  createCardParticles(event?.target, 'deselect');
  
  // Play subtle deselect sound
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    
    // Lower-pitched beep for deselection
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
    
    osc.start(now);
    osc.stop(now + 0.12);
  } catch (e) {
    // Audio context not available
  }
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

function showGameEndedOverlay(winnerId, winnerName, rewards = null){
  const isWinner = winnerId === localPlayerId;
  const overlay = document.createElement('div');
  overlay.className = 'game-end-overlay';

  const content = document.createElement('div');
  content.className = 'game-end-card ' + (isWinner ? 'game-end-win' : 'game-end-loss');

  let rewardsHTML = '';
  if (isWinner && rewards) {
    rewardsHTML = `
      <div class="game-end-rewards">
        <div class="rewards-title">🎁 Récompenses</div>
        <div class="rewards-grid">
    `;
    
    if (rewards.gold) {
      rewardsHTML += `
        <div class="reward-item gold-reward">
          <div class="reward-icon">💰</div>
          <div class="reward-amount">${rewards.gold}</div>
          <div class="reward-label">Or</div>
        </div>
      `;
    }
    
    if (rewards.chest) {
      rewardsHTML += `
        <div class="reward-item chest-reward">
          <div class="reward-icon">📦</div>
          <div class="reward-amount">1</div>
          <div class="reward-label">Coffre</div>
        </div>
      `;
    }
    
    if (rewards.exp) {
      rewardsHTML += `
        <div class="reward-item exp-reward">
          <div class="reward-icon">⭐</div>
          <div class="reward-amount">+${rewards.exp}</div>
          <div class="reward-label">Exp</div>
        </div>
      `;
    }
    
    rewardsHTML += `
        </div>
      </div>
    `;
  }

  if (isWinner) {
    content.innerHTML = `
      <div class="game-end-emoji">🎉</div>
      <div class="game-end-title emerald">VICTOIRE!</div>
      <div class="game-end-sub">Tu as vaincu <strong>${winnerName}</strong></div>
      ${rewardsHTML}
    `;
  } else {
    content.innerHTML = `<div class="game-end-emoji">😢</div><div class="game-end-title" style="color:#ef4444">DÉFAITE</div><div class="game-end-sub"><strong>${winnerName}</strong> a gagné</div>`;
  }

  overlay.appendChild(content);
  document.body.appendChild(overlay);

  setTimeout(() => {
    window.location.href = `../index/index.html`;
  }, 3000);
}

const clientState = {
  prev: null,
  target: null,
  prevTime: 0,
  targetTime: 0,
  renderDelay: 120,
};
function deepCopy(obj){ return JSON.parse(JSON.stringify(obj)); }
function handleServerSnapshot(room){
  const now = Date.now();
  if (clientState.target){ clientState.prev = clientState.target; clientState.prevTime = clientState.targetTime; }
  else { clientState.prev = deepCopy(room); clientState.prevTime = now - 60; }
  clientState.target = deepCopy(room); clientState.targetTime = now;
}

document.addEventListener('pointermove', (ev)=>{ 
  if (!draggingCardId || isTouchControlMode) return; 
  dragPos = { x: ev.clientX, y: ev.clientY }; 
}, { passive: true });

document.addEventListener('pointerup', (ev)=>{
  document.body.classList.remove('is-dragging');
  
  // Souris mode only
  if (!isTouchControlMode && draggingCardId) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (ev.clientX - rect.left) * scaleX;
    const y = (ev.clientY - rect.top) * scaleY;
    const overCanvas = ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom;
    if (overCanvas) playCard(draggingCardId, { x: Math.round(x), y: Math.round(y) }); else playCard(draggingCardId);
    draggingCardId = null; draggingEmoji = null; dragPos = null; justDragged = true; setTimeout(()=>{ justDragged = false; }, 60);
  }
});

let shake = { intensity: 0, duration: 0, start: 0 };
function triggerScreenShake(intensity = 6, duration = 350){ shake.intensity = intensity; shake.duration = duration; shake.start = Date.now(); }

// Cache pour les images chargées
const imageCache = {};
function loadImage(url) {
  if (!url) return null;
  if (imageCache[url]) return imageCache[url];
  
  const img = new Image();
  img.src = url;
  imageCache[url] = img;
  return img;
}

function drawImage(ctx, x, y, size, imageUrl, fallbackEmoji) {
  if (!imageUrl) {
    ctx.font = (size + 6) + 'px serif';
    ctx.textAlign = 'center';
    ctx.fillText(fallbackEmoji || '❓', x, y + size / 3);
    return;
  }
  
  const img = loadImage(imageUrl);
  if (img && img.complete && img.naturalWidth > 0) {
    try {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
      ctx.restore();
    } catch (e) {
      // Fallback si erreur
      ctx.font = (size + 6) + 'px serif';
      ctx.textAlign = 'center';
      ctx.fillText(fallbackEmoji || '❓', x, y + size / 3);
    }
  } else {
    // Image pas chargée encore, affiche emoji
    ctx.font = (size + 6) + 'px serif';
    ctx.textAlign = 'center';
    ctx.fillText(fallbackEmoji || '❓', x, y + size / 3);
  }
}

function renderTick(){
  requestAnimationFrame(renderTick);
  const now = Date.now();
  const renderTime = now - clientState.renderDelay;

  let sx = 0, sy = 0;
  if (shake.duration > 0){ const elapsed = now - shake.start; if (elapsed < shake.duration){ const p = 1 - (elapsed / shake.duration); const mag = shake.intensity * p; sx = (Math.random()*2-1) * mag; sy = (Math.random()*2-1) * mag; } else { shake.duration = 0; } }

  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width, canvas.height);
  ctx.translate(sx, sy);

  if (currentRoom && currentRoom.players.length > 0){
    const me = currentRoom.players.find(p=>p.id === localPlayerId);
    if (me){
      const playerIndex = currentRoom.players.indexOf(me);
      let zone;
      if (me.view === 'vertical'){
        zone = playerIndex === 0 
          ? { x: 0, y: 0, w: 900, h: 200 }
          : { x: 0, y: 200, w: 900, h: 200 };
      } else {
        zone = playerIndex === 0 
          ? { x: 0, y: 0, w: 450, h: 400 }
          : { x: 450, y: 0, w: 450, h: 400 };
      }
      ctx.save();
      ctx.fillStyle = '#22c55e';
      ctx.globalAlpha = 0.15;
      ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
      ctx.restore();
    }
  }

  if (draggingCardId && dragPos){ const rect = canvas.getBoundingClientRect(); const gx = dragPos.x - rect.left; const gy = dragPos.y - rect.top; if (gx>=0 && gx<=canvas.width && gy>=0 && gy<=canvas.height){ ctx.save(); ctx.globalAlpha=0.85; 
  // Trouver la carte en train d'être traînée pour obtenir son lien
  let cardLink = '';
  if (currentRoom) {
    const me = currentRoom.players.find(p => p.id === localPlayerId);
    if (me) {
      const card = me.hand.find(c => c.id === draggingCardId);
      if (card) {
        cardLink = card.link || '';
        draggingEmoji = card.emoji || '❓';
      }
    }
  }
  drawImage(ctx, gx, gy, 40, cardLink, draggingEmoji || '❓'); 
  ctx.restore(); } }
  ctx.font = '28px serif'; ctx.textAlign='left'; ctx.fillText('🏰', 8, canvas.height/2); ctx.textAlign='right'; ctx.fillText('🏰', canvas.width-8, canvas.height/2);

  const prev = clientState.prev; const target = clientState.target; let t = 1;
  if (prev && target){ const dt = Math.max(1, clientState.targetTime - clientState.prevTime); t = (renderTime - clientState.prevTime) / dt; t = Math.max(0, Math.min(1, t)); }

  const drawnIds = new Set();
  if (target && target.entities){
    for (const te of target.entities.filter(e=>e.type==='aoe')){
      const pe = prev && prev.entities ? prev.entities.find(x=>x.id===te.id) : null;
      const x = te.x, y = te.y, r = te.radius || 40;
      if (te.subtype === 'frost'){
        ctx.save(); ctx.globalAlpha=0.18; ctx.fillStyle='#59f'; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.restore();
        drawImage(ctx, x, y + 8, 22, te.link, '❄️');
      } else if (te.subtype === 'heal'){
        const pulse = 0.9 + 0.1 * Math.sin(Date.now()/180);
        ctx.save(); ctx.globalAlpha=0.12; ctx.fillStyle='#6f6'; ctx.beginPath(); ctx.arc(x,y,r*pulse,0,Math.PI*2); ctx.fill(); ctx.restore(); 
        drawImage(ctx, x, y + 8, 22, te.link, '✨');
      } else {
        ctx.save(); ctx.globalAlpha=0.45; ctx.fillStyle='orange'; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.restore(); 
        drawImage(ctx, x, y + 8, 24, te.link, te.emoji||'💥');
      }
      drawnIds.add(te.id);
    }

    for (const te of target.entities.filter(e=>e.type==='projectile')){
      const pe = prev && prev.entities ? prev.entities.find(x=>x.id===te.id) : null;
      let x = te.x, y = te.y;
      if (pe){ x = pe.x + (te.x - pe.x) * t; y = pe.y + (te.y - pe.y) * t; }
      ctx.save(); ctx.globalAlpha=0.95; 
      drawImage(ctx, x, y, 20, te.link, te.emoji||'➡️'); 
      ctx.restore(); 
      drawnIds.add(te.id);
    }

    for (const te of target.entities.filter(e=>e.type==='unit')){
      const pe = prev && prev.entities ? prev.entities.find(x=>x.id===te.id) : null;
      let x = te.x, y = te.y, hp = te.hp, emoji = te.emoji||'❓';
      if (pe){ x = pe.x + (te.x - pe.x) * t; y = pe.y + (te.y - pe.y) * t; hp = pe.hp + (te.hp - pe.hp) * t; }
      const isFlying = !!te.isFlying;
      const yOffset = isFlying ? -12 : 0;
      drawImage(ctx, x+20, y+28 + yOffset, 34, te.link, emoji);
      if (te.attackAnim && te.attackAnim > 0){
        const p = te.attackAnim / (te.attackAnimMax||6);
        const cx2 = x+20, cy2 = y+28 + yOffset;
        const r1 = 20 + p*14, r2 = r1 + 5;
        ctx.save();
        const gAtk = ctx.createRadialGradient(cx2, cy2, r1*0.4, cx2, cy2, r2);
        gAtk.addColorStop(0, `rgba(255,220,0,${0.7*p})`);
        gAtk.addColorStop(0.5, `rgba(255,140,0,${0.4*p})`);
        gAtk.addColorStop(1, `rgba(255,60,0,0)`);
        ctx.fillStyle = gAtk;
        ctx.beginPath(); ctx.arc(cx2, cy2, r2, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = `rgba(255,220,50,${0.85*p})`;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = 'rgba(255,200,0,0.9)';
        ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(cx2, cy2, r1, 0, Math.PI*2); ctx.stroke();
        const dmgTxt = te.dmg ? `-${te.dmg}` : '!';
        ctx.font = `bold ${10 + p*4}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.shadowBlur = 6;
        ctx.shadowColor = 'rgba(255,100,0,0.9)';
        ctx.fillStyle = `rgba(255,255,80,${p})`;
        ctx.fillText(dmgTxt, cx2, cy2 - r1 - 4 - p*6);
        ctx.restore();
      }
      const hpRatio = Math.max(0, Math.min(1, (hp||0) / (te.maxHp||10)));
      const bx = x+4, by = y+2 + yOffset, bw = 40, bh = 6, br = 3;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.roundRect(bx-1, by-1, bw+2, bh+2, br+1); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, br); ctx.fill();
      if (hpRatio > 0){
        const hpColor = hpRatio > 0.55 ? ['#22c55e','#16a34a','rgba(74,222,128,0.7)'] : hpRatio > 0.28 ? ['#facc15','#ca8a04','rgba(250,204,21,0.7)'] : ['#ef4444','#b91c1c','rgba(239,68,68,0.7)'];
        const gHp = ctx.createLinearGradient(bx, by, bx, by+bh);
        gHp.addColorStop(0, hpColor[0]);
        gHp.addColorStop(1, hpColor[1]);
        ctx.fillStyle = gHp;
        ctx.beginPath(); ctx.roundRect(bx, by, bw*hpRatio, bh, br); ctx.fill();
        ctx.shadowColor = hpColor[2]; ctx.shadowBlur = 5;
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.roundRect(bx, by, bw*hpRatio, bh, br); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath(); ctx.roundRect(bx+1, by+1, (bw*hpRatio - 2)*0.7, 2, 1); ctx.fill();
      }
      const hpVal = Math.ceil(hp||0);
      ctx.font = 'bold 7px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
      ctx.fillText(`${hpVal}/${te.maxHp||10}`, bx + bw/2, by + bh - 0.5);
      ctx.restore();
      drawnIds.add(te.id);
    }
  }

  if (prev && prev.entities){ for (const pe of prev.entities){ if (drawnIds.has(pe.id)) continue; const x = pe.x, y = pe.y, emoji = pe.emoji || '❓'; ctx.save(); ctx.globalAlpha = 0.28; drawImage(ctx, x+20, y+28, 34, pe.link, emoji); ctx.restore(); } }
}
requestAnimationFrame(renderTick);

function startEventSource(roomId){
  if (evtSource) evtSource.close();
  const token = window.BrainrotAuth?.getToken?.() || '';
  evtSource = new EventSource(
    'https://darkgoldenrod-frog-258465.hostingersite.com/game/events?roomId=' + encodeURIComponent(roomId) +
    '&playerId=' + encodeURIComponent(localPlayerId || '') +
    '&token=' + encodeURIComponent(token)
  );
  evtSource.onmessage = (ev)=>{
    try { 
      const data = JSON.parse(ev.data); 
      if (!data || !data.type) return;
      
      if (data.type === 'roomUpdate'){ 
        currentRoom = data.payload;
        
        // Vérifier si on doit afficher le jeu ou si on attend toujours
        const invModalVisible = invitationModal.style.display === 'flex';
        const gameVisible = gameEl.style.display === 'block';
        
        if (invModalVisible) {
          // On est encore en phase d'invitation
          if (currentRoom.players.length === 2) {
            const opponent = currentRoom.players.find(p => p.id !== localPlayerId);
            const bothReady = currentRoom.players.every(p => p.deckReady === true);
            
            const title = document.getElementById('invitation-title');
            const message = document.getElementById('invitation-message');
            const waitingBtn = document.getElementById('waiting-btn');
            
            // Premier joueur en attente : afficher quand le deuxième rejoint
            if (isInvitationWaiting && !isInvitationAccepted && opponent) {
              console.log('SSE: Joueur 2 a rejoint, opponent deckReady:', opponent.deckReady);
              title.textContent = '🤝 ' + opponent.name + ' a rejoint !';
              
              if (opponent.deckReady) {
                message.textContent = '✅ ' + opponent.name + ' a accepté ! Démarrage du combat...';
              } else {
                message.textContent = 'En attente que ' + opponent.name + ' accepte son invitation...';
              }
            } else if (isInvitationAccepted && opponent) {
              // Deuxième joueur qui a accepté : afficher l'état du premier
              console.log('SSE: Je suis joueur 2, opponent deckReady:', opponent.deckReady);
              if (opponent.deckReady) {
                title.textContent = '✅ Prêt !';
                message.textContent = 'L\'autre joueur est prêt ! Démarrage du combat...';
              }
            }
            
            // Les deux sont prêts, démarrer le jeu
            if (bothReady) {
              console.log('SSE: Les deux sont prêts, startGame=', currentRoom.started);
              title.textContent = '🚀 Démarrage...';
              message.textContent = 'Tous les joueurs sont prêts !';
              
              if (currentRoom.started) {
                setTimeout(() => {
                  console.log('SSE: Affichage du jeu');
                  invitationModal.style.display = 'none';
                  gameEl.style.display = 'block';
                  document.body.classList.add('game-active');
                  handleServerSnapshot(currentRoom);
                  renderRoom(currentRoom);
                }, 600);
              }
            }
          }
        } else if (gameVisible) {
          // Si le jeu est visible, mettre à jour
          handleServerSnapshot(currentRoom);
          renderRoom(currentRoom);
        }
      } else if (data.type === 'playFailed'){ 
        alert('Play failed: ' + (data.payload && data.payload.reason ? data.payload.reason : 'unknown')); 
      } else if (data.type === 'gameEnded'){ 
        showGameEndedOverlay(data.payload.winnerId, data.payload.winnerName, data.payload.rewards); 
        triggerScreenShake(15, 600); 
      } else if (data.type === 'effect'){ 
        if (data.payload && data.payload.effect === 'screenShake'){ 
          triggerScreenShake(data.payload.intensity||6, data.payload.duration||300); 
        } 
      }
    }
    catch(err){ console.error('SSE error:', err); }
  };
  evtSource.onerror = ()=>{ console.error('SSE connection error'); };
}

joinBtn.addEventListener('click', async ()=>{
  showDeckSelector();
});

let matchmakingPollInterval = null;
let matchmakingTimerInterval = null;
let matchmakingStartTime = null;
let matchmakingEventSource = null;

document.getElementById('matchmaking-btn')?.addEventListener('click', async () => {
  try {
    const token = window.BrainrotAuth?.getToken?.() || '';
    if (!token) {
      console.error('❌ Pas de token disponible');
      alert('Erreur: Token non disponible');
      return;
    }
    
    console.log('🎯 Démarrage du matchmaking...');
    
    // Afficher l'écran d'attente
    showMatchmakingWaiting();
    matchmakingStartTime = Date.now();
    
    // Appeler l'endpoint de matchmaking
    const res = await fetch('https://darkgoldenrod-frog-258465.hostingersite.com/game/matchmaking', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) {
      console.error('❌ Erreur API matchmaking:', res.status);
      hideMatchmakingWaiting();
      alert('Erreur lors de la recherche. Réessaye !');
      return;
    }
    
    const payload = await res.json();
    console.log('📡 Réponse matchmaking:', payload);
    
    if (payload.success && payload.roomId) {
      // Match trouvé immédiatement
      console.log('✅ Match trouvé immédiatement!');
      clearMatchmakingPoll();
      roomInput.value = payload.roomId;
      hideMatchmakingWaiting();
      showDeckSelector();
    } else if (payload.success) {
      // En attente, commencer le polling SSE
      console.log('⏳ En attente, démarrage SSE...');
      startMatchmakingPoll(token);
    } else {
      hideMatchmakingWaiting();
      alert(payload.message || 'Erreur lors du matchmaking');
    }
  } catch (err) {
    console.error('❌ Matchmaking error:', err);
    hideMatchmakingWaiting();
    alert('Erreur réseau. Réessaye !');
  }
});

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

function updateMatchmakingTimer() {
  if (!matchmakingStartTime) return;
  const elapsed = Math.floor((Date.now() - matchmakingStartTime) / 1000);
  const timerEl = document.getElementById('matchmaking-timer');
  if (timerEl) {
    timerEl.textContent = elapsed + 's';
  }
}

function startMatchmakingPoll(token) {
  // Mettre à jour le timer toutes les secondes
  if (matchmakingTimerInterval) clearInterval(matchmakingTimerInterval);
  matchmakingTimerInterval = setInterval(updateMatchmakingTimer, 1000);
  
  console.log('🔌 Connexion SSE pour matchmaking...');
  
  // Connecter à SSE pour les mises à jour du matchmaking
  // Note: EventSource ne peut pas envoyer de headers, on utilise un query param
  matchmakingEventSource = new EventSource(`https://darkgoldenrod-frog-258465.hostingersite.com/game/matchmaking/watch?token=${encodeURIComponent(token)}`);

  matchmakingEventSource.addEventListener('message', (event) => {
    try {
      console.log('📨 Message SSE reçu:', event.data);
      const data = JSON.parse(event.data);

      if (data.type === 'stats' && data.stats) {
        // Mettre à jour les stats
        const queueEl = document.getElementById('queue-count');
        const matchesEl = document.getElementById('active-matches');
        if (queueEl) queueEl.textContent = data.stats.playersInQueue || 0;
        if (matchesEl) matchesEl.textContent = data.stats.activeMatches || 0;
      }

      if (data.type === 'matchFound' && data.roomId && data.roomId.trim() !== '') {
        // Match trouvé!
        console.log('✅ Match trouvé! Room:', data.roomId);
        clearMatchmakingPoll();
        roomInput.value = data.roomId;
        
        // Animation de transition
        const titleEl = document.getElementById('matchmaking-title');
        const msgEl = document.getElementById('matchmaking-message');
        if (titleEl) titleEl.textContent = '🎉 Match trouvé!';
        if (msgEl) msgEl.textContent = 'Prépare-toi pour le combat...';
        
        setTimeout(() => {
          hideMatchmakingWaiting();
          showDeckSelector();
        }, 1500);
      }
    } catch (err) {
      console.error('❌ SSE parse error:', err, event.data);
    }
  });

  matchmakingEventSource.onerror = () => {
    console.error('❌ SSE connection error');
    clearMatchmakingPoll();
  };
}

function clearMatchmakingPoll() {
  if (matchmakingEventSource) {
    matchmakingEventSource.close();
    matchmakingEventSource = null;
  }
  if (matchmakingPollInterval) {
    clearInterval(matchmakingPollInterval);
    matchmakingPollInterval = null;
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
    if (!token) return;
    
    await fetch('https://darkgoldenrod-frog-258465.hostingersite.com/game/matchmaking', {
      method: 'DELETE',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    hideMatchmakingWaiting();
  } catch (err) {
    console.error('Cancel matchmaking error:', err);
    hideMatchmakingWaiting();
  }
});

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
  try {
    const token = window.BrainrotAuth?.getToken?.() || '';
    if (!token) return;
    const res = await fetch('https://darkgoldenrod-frog-258465.hostingersite.com/user/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const payload = await res.json();
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

function renderRoom(room){
  const me = room.players.find(p=>p.id === localPlayerId);
  localPlayerId = me ? me.id : localPlayerId;
  const opponent = room.players.find(p=>p.id !== localPlayerId) || {name:'Waiting...', hp:'-'};
  opponentEl.innerHTML = `<span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Adversaire</span><br><span style="font-weight:900;font-size:1.1rem;">${opponent.name}</span> <span class="emerald" style="font-size:0.9rem;">❤️ ${opponent.hp}</span>`;
  const mana = me ? (me.mana||0) : 0;
  const maxMana = me ? (me.maxMana||10) : 10;
  let manaPips = '';
  for(let i=0;i<maxMana;i++) manaPips += `<div class="mana-pip ${i<mana?'filled':''}"></div>`;
  infoEl.innerHTML = `<span style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Toi</span><br><span style="font-weight:900;font-size:1.1rem;">${me?me.name:''}</span> <span style="color:#ef4444;font-size:0.9rem;">❤️ ${me?me.hp:'-'}</span><div class="mana-bar" style="justify-content:center;margin-top:6px;">${manaPips}</div>`;

  handEl.innerHTML = '';
  if (me){ 
    const handCardIds = me.hand.filter(Boolean).map(c => c.id);
    if (selectedCardForPlacement && !handCardIds.includes(selectedCardForPlacement)) {
      selectedCardForPlacement = null;
      canvas.classList.remove('touch-mode-active');
    }
    me.hand.forEach(card=>{ 
    if (!card) return; 
    const c = document.createElement('div'); 
    c.className='btn-card hand-card'; 
    c.dataset.cardId = card.id;
    const affordable = (me.mana || 0) >= card.cost;
    if (!affordable) c.classList.add('card-unaffordable');
    if (selectedCardForPlacement === card.id) {
      c.classList.add('card-selected');
      canvas.classList.add('touch-mode-active');
    }
    
    c.addEventListener('pointerdown', (ev)=>{
      if (!affordable) return;
      
      // Prevent default behavior for touch devices
      if (ev.pointerType === 'touch') {
        ev.preventDefault();
      }
      
      if (isTouchControlMode) {
        if (selectedCardForPlacement === card.id) {
          selectedCardForPlacement = null;
          c.classList.remove('card-selected');
          canvas.classList.remove('touch-mode-active');
          playCardDeselectEffect();
        } else {
          handEl.querySelectorAll('.hand-card').forEach(el => {
            el.classList.remove('card-selected');
          });
          selectedCardForPlacement = card.id;
          c.classList.add('card-selected');
          canvas.classList.add('touch-mode-active');
          playCardSelectEffect();
        }
      } else {
        document.body.classList.add('is-dragging');
        draggingCardId = card.id;
        draggingEmoji = card.emoji || '❓';
        dragPos = { x: ev.clientX, y: ev.clientY };
      }
    }, { passive: false });
    
    c.ondragstart = (ev)=>ev.preventDefault();
    
    // Click handler for non-dragging mode or touch mode
    c.onclick = ()=>{ 
      if (affordable && !justDragged && !isTouchControlMode) {
        // Mouse mode: play card immediately
        playCard(card.id);
      }
    };
    
    const cardImage = card.link
      ? `<img src="${card.link}" style="width:72px; height:72px; object-fit:cover; border-radius:6px; display:block; flex-shrink:0;">`
      : `<div class="card-emoji">${card.emoji || '❓'}</div>`;
    const cardName = card.name || card.card?.name || '';
    c.innerHTML = `<div class="card-cost">${card.cost ?? card.card?.cost ?? 0}</div>${cardImage}<div class="card-name">${cardName}</div>`;
    handEl.appendChild(c); 
  }); }
}

async function playCard(cardId, targetPos){
  if (!currentRoom) return; 
  if (!localPlayerId) return alert('You must join first');
  
  // Validate card exists in hand
  const me = currentRoom.players.find(p => p.id === localPlayerId);
  if (!me) return console.error('Player not found');
  
  const card = me.hand.find(c => c.id === cardId);
  if (!card) return console.error('Card not in hand:', cardId);
  
  // Check if affordable
  const affordable = (me.mana || 0) >= card.cost;
  if (!affordable) return alert('Pas assez de mana pour cette carte!');
  
  // Validate placement zone for units only
  if (card.type === 'unit' && targetPos) {
    if (!isValidPlacement(me, targetPos)) {
      alert('Tu ne peux placer des cartes que sur ta zone de jeu!');
      return;
    }
  }
  
  const payload = { roomId: currentRoom.id, playerId: localPlayerId, cardId };
  if (targetPos) payload.targetPos = targetPos;
  try{
    const token = window.BrainrotAuth?.getToken?.() || '';
    const res = await fetch('https://darkgoldenrod-frog-258465.hostingersite.com/game/play', { 
      method: 'POST', 
      headers: {'Content-Type':'application/json', 'Authorization': `Bearer ${token}`}, 
      body: JSON.stringify(payload) 
    });
    if (!res.ok){ 
      const err = await res.json().catch(()=>({error:'play failed'})); 
      console.error('Play failed:', err);
      alert('Play failed: '+(err && err.error?err.error:res.status)); 
    }
  } catch(e){ 
    console.error('Play card error:', e); 
  }
}

function isValidPlacement(player, targetPos) {
  if (!player || !targetPos) return true;
  
  const CANVAS_W = 900;
  const CANVAS_H = 400;
  const playerIndex = currentRoom.players.indexOf(player);
  
  let validZone;
  if (player.view === 'vertical') {
    validZone = playerIndex === 0 
      ? { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H / 2 }
      : { x: 0, y: CANVAS_H / 2, w: CANVAS_W, h: CANVAS_H / 2 };
  } else {
    validZone = playerIndex === 0 
      ? { x: 0, y: 0, w: CANVAS_W / 2, h: CANVAS_H }
      : { x: CANVAS_W / 2, y: 0, w: CANVAS_W / 2, h: CANVAS_H };
  }
  
  return targetPos.x >= validZone.x && 
         targetPos.x < (validZone.x + validZone.w) &&
         targetPos.y >= validZone.y && 
         targetPos.y < (validZone.y + validZone.h);
}

async function fetchAvailableCards(userId) {
  try {
    const res = await fetch('https://darkgoldenrod-frog-258465.hostingersite.com/game/available-cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.cards || [];
  } catch (e) {
    console.error('Erreur fetch cards:', e);
    return [];
  }
}

function loadSavedDeck() {
  try {
    return JSON.parse(localStorage.getItem('brainrot_saved_deck') || '[]');
  } catch { return []; }
}

function saveDeckToStorage(keys) {
  localStorage.setItem('brainrot_saved_deck', JSON.stringify(keys));
}

function renderDeckSelector(availableCards) {
  const deckList = document.getElementById('deck-list');
  deckList.innerHTML = '';

  if (!availableCards || availableCards.length === 0) {
    deckList.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:var(--text-muted);">Pas de cartes disponibles. Utilise un deck aléatoire.</p>';
    return;
  }

  const grouped = {};
  availableCards.forEach(entry => {
    const card = entry.card || {};
    const key = `${card.name}_${card.type || 'unit'}`;
    if (!grouped[key]) grouped[key] = { ...entry, card };
  });

  const savedKeys = loadSavedDeck();

  updateSavedDeckCount(savedKeys.length);

  Object.entries(grouped).forEach(([key, entry]) => {
    const card = entry.card;
    const cardEl = document.createElement('div');
    cardEl.className = 'deck-card btn-card';
    cardEl.dataset.key = key;

    const typeLabel = card.type === 'spell' ? '🔮 Sort' : '⚔️ Unité';
    const inSaved = savedKeys.includes(key);

    // Afficher image si disponible, sinon emoji
    const cardImage = card.link ? `<img src="${card.link}" style="width:64px; height:64px; object-fit:cover; border-radius:6px; display:block; margin:0 auto; flex-shrink:0;">` : `<div class="card-emoji">${card.emoji || '🃏'}</div>`;

    cardEl.innerHTML = `
      <div class="deck-star" style="display:${inSaved ? 'flex' : 'none'}">⭐</div>
      ${cardImage}
      <div class="card-name">${card.name}</div>
      <div class="card-cost-label">Coût: <span class="card-cost">${card.cost || 1}</span></div>
      <div class="card-type">${typeLabel}</div>
      <button class="deck-add-btn ${inSaved ? 'deck-add-btn--remove' : ''}" type="button">${inSaved ? '★ Retirer du deck' : '☆ Ajouter au deck'}</button>
    `;
    
    if (!card.link) {
      console.warn('Carte sans lien:', entry);
    }

    const refreshCard = () => {
      const inDeckNow = savedKeys.includes(key);
      const selectedNow = selectedDeck.some(c => `${c.card.name}_${c.card.type || 'unit'}` === key);
      cardEl.classList.toggle('selected', selectedNow);
      const star = cardEl.querySelector('.deck-star');
      const btn = cardEl.querySelector('.deck-add-btn');
      if (star) star.style.display = inDeckNow ? 'flex' : 'none';
      if (btn) {
        btn.textContent = inDeckNow ? '★ Retirer du deck' : '☆ Ajouter au deck';
        btn.classList.toggle('deck-add-btn--remove', inDeckNow);
      }
    };

    cardEl.addEventListener('click', (e) => {
      if (e.target.closest('.deck-add-btn')) return;
      const inSelected = selectedDeck.some(c => `${c.card.name}_${c.card.type || 'unit'}` === key);
      if (inSelected) {
        const idx = selectedDeck.findIndex(c => `${c.card.name}_${c.card.type || 'unit'}` === key);
        if (idx !== -1) selectedDeck.splice(idx, 1);
      } else {
        if (selectedDeck.length < 10) selectedDeck.push(entry);
      }
      refreshCard();
      updateDeckCounter();
    });

    const btn = cardEl.querySelector('.deck-add-btn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = savedKeys.indexOf(key);
      if (idx !== -1) {
        savedKeys.splice(idx, 1);
      } else {
        if (savedKeys.length < 10) savedKeys.push(key);
      }
      saveDeckToStorage(savedKeys);
      updateSavedDeckCount(savedKeys.length);
      refreshCard();
    });

    deckList.appendChild(cardEl);
  });

  const useSavedBtn = document.getElementById('use-saved-deck');
  if (useSavedBtn) {
    useSavedBtn.onclick = () => {
      const keys = loadSavedDeck();
      if (keys.length === 0) {
        alert('Aucun deck sauvegardé. Ajoute des cartes avec ☆ sur chaque carte !');
        return;
      }
      selectedDeck = [];
      keys.forEach(k => {
        if (grouped[k]) selectedDeck.push(grouped[k]);
      });
      document.querySelectorAll('.deck-card').forEach(el => {
        const k = el.dataset.key;
        el.classList.toggle('selected', selectedDeck.some(c => `${c.card.name}_${c.card.type || 'unit'}` === k));
      });
      updateDeckCounter();
    };
  }

  const resetBtn = document.getElementById('reset-saved-deck');
  if (resetBtn) {
    resetBtn.onclick = () => {
      if (confirm('⚠️ Êtes-vous sûr de vouloir réinitialiser votre deck sauvegardé ?\n\nCette action est irréversible !')) {
        saveDeckToStorage([]);
        updateSavedDeckCount(0);
        alert('✅ Deck réinitialisé avec succès !');
        
        // Décocher toutes les cartes
        document.querySelectorAll('.deck-card').forEach(el => {
          const star = el.querySelector('.deck-star');
          const btn = el.querySelector('.deck-add-btn');
          if (star) star.style.display = 'none';
          if (btn) {
            btn.textContent = '☆ Ajouter au deck';
            btn.classList.remove('deck-add-btn--remove');
          }
        });
      }
    };
  }

  updateDeckCounter();
}

function updateSavedDeckCount(count) {
  const el = document.getElementById('saved-deck-count');
  if (el) el.textContent = count > 0 ? `(${count}/10 cartes)` : '(aucun deck sauvegardé)';
}

function updateDeckCounter() {
  const confirmBtn = document.getElementById('confirm-deck');
  const isComplete = selectedDeck.length === 10;
  confirmBtn.disabled = !isComplete;
  confirmBtn.innerHTML = `⚔️ Commencer le combat (${selectedDeck.length}/10)<div class="shine"></div>`;
  confirmBtn.classList.toggle('btn-disabled', !isComplete);
}

async function showDeckSelector() {
  let fetchedCards = [];
  try {
    const token = window.BrainrotAuth?.getToken?.() || '';
    const url = 'https://darkgoldenrod-frog-258465.hostingersite.com/game/getCard';
    const res = await fetch(url, { method: 'GET' , headers: {'Content-Type':'application/json', 'Authorization': `Bearer ${token}`},});
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

  const normalized = fetchedCards.map((entry, idx) => {
    const cardData = entry.card || entry;
    return {
      cardId: entry.cardId || (cardData.name ? cardData.name.replace(/\s+/g, '_') : ('card_' + idx)) + '_' + idx,
      deckId: entry.deckId,
      quantity: entry.quantity || 1,
      card: cardData
    };
  });

  selectedDeck = [];
  renderDeckSelector(normalized);
  lobbyEl.style.display = 'none';
  deckSelectorEl.style.display = 'block';
}

document.getElementById('confirm-deck').addEventListener('click', async () => {
  if (selectedDeck.length === 0) {
    alert('Sélectionne au moins une carte!');
    return;
  }

  const name = playerPseudo;
  const room = roomInput.value || 'room1';
  currentRoomId = room;

  try {
    const token = window.BrainrotAuth?.getToken?.() || '';
    const res = await fetch('https://darkgoldenrod-frog-258465.hostingersite.com/game/join', {
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
      alert('Join failed: ' + (err && err.error ? err.error : res.status));
      return;
    }

    const data = await res.json();
    localPlayerId = data.playerId;
    localStorage.setItem('playerId', localPlayerId);
    currentRoom = data.room;
    
    // Marquer le deck comme ready pour ce joueur
    const acceptRes = await fetch('https://darkgoldenrod-frog-258465.hostingersite.com/game/accept-invitation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        roomId: room,
        playerId: localPlayerId
      })
    });

    // Afficher le modal d'invitation
    deckSelectorEl.style.display = 'none';
    showInvitationModal(data);
    
    // Commencer à écouter les événements
    startEventSource(room);
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
  const waitingBtn = document.getElementById('waiting-btn');
  
  // Si on est le premier joueur (on invite)
  if (joinData.waitingForOpponent) {
    isInvitationWaiting = true;
    title.textContent = '🎮 Partie créée';
    message.textContent = `Tu as créé une arène. En attente qu'un ami accepte ton invitation...`;
    acceptBtn.style.display = 'none';
    rejectBtn.style.display = 'none';
    waitingBtn.style.display = 'flex';
  } else {
    // Si on est le deuxième joueur (on accepte)
    title.textContent = '📨 Nouvelle invitation';
    message.textContent = `${joinData.invitation?.fromName || 'Un joueur'} t'invite à une partie. Acceptes-tu ?`;
    acceptBtn.style.display = 'block';
    rejectBtn.style.display = 'block';
    waitingBtn.style.display = 'none';
    
    acceptBtn.onclick = async () => {
      await handleAcceptInvitation(joinData);
    };
    
    rejectBtn.onclick = async () => {
      await handleRejectInvitation(joinData);
    };
  }
  
  invModal.style.display = 'flex';
}

async function handleAcceptInvitation(joinData) {
  isInvitationAccepted = true;
  const acceptBtn = document.getElementById('accept-invitation-btn');
  const rejectBtn = document.getElementById('reject-invitation-btn');
  const title = document.getElementById('invitation-title');
  const message = document.getElementById('invitation-message');
  const waitingBtn = document.getElementById('waiting-btn');
  
  acceptBtn.disabled = true;
  rejectBtn.disabled = true;
  
  try {
    const token = window.BrainrotAuth?.getToken?.() || '';
    const res = await fetch('https://darkgoldenrod-frog-258465.hostingersite.com/game/accept-invitation', {
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

    if (!res.ok) {
      alert('Erreur en acceptant l\'invitation');
      return;
    }

    title.textContent = '✅ Invitation acceptée';
    message.textContent = 'Connecté avec ' + (joinData.invitation?.fromName || 'l\'autre joueur') + '. En attente de démarrage...';
    acceptBtn.style.display = 'none';
    rejectBtn.style.display = 'none';
    waitingBtn.style.display = 'flex';
  } catch (e) {
    console.error('Accept error:', e);
    alert('Erreur de connexion');
  }
}

async function handleRejectInvitation(joinData) {
  try {
    const token = window.BrainrotAuth?.getToken?.() || '';
    await fetch('https://darkgoldenrod-frog-258465.hostingersite.com/game/reject-invitation', {
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

    // Retourner au lobby
    invitationModal.style.display = 'none';
    lobbyEl.style.display = 'block';
  } catch (e) {
    console.error('Reject error:', e);
  }
}

// Touch mode: canvas click/touch handler for card placement
function handleCanvasPlacement(ev) {
  if (!isTouchControlMode || !selectedCardForPlacement || !currentRoom) return;
  
  // Prevent default for touchend to avoid double-clicks
  if (ev.type === 'touchend') {
    ev.preventDefault();
  }
  
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  
  // Get position from either mouse or touch event
  let clientX, clientY;
  if (ev.touches && ev.touches.length > 0) {
    clientX = ev.touches[0].clientX;
    clientY = ev.touches[0].clientY;
  } else if (ev.changedTouches && ev.changedTouches.length > 0) {
    // For touchend, use changedTouches
    clientX = ev.changedTouches[0].clientX;
    clientY = ev.changedTouches[0].clientY;
  } else {
    clientX = ev.clientX;
    clientY = ev.clientY;
  }
  
  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;
  
  const cardId = selectedCardForPlacement;
  
  // Clear selection immediately for UX
  selectedCardForPlacement = null;
  canvas.classList.remove('touch-mode-active');
  handEl.querySelectorAll('.hand-card').forEach(card => {
    card.classList.remove('card-selected');
  });
  
  // Play card at clicked position (async, but don't wait for response)
  playCard(cardId, { x: Math.round(x), y: Math.round(y) }).catch(err => console.error('Play card error:', err));
}

canvas.addEventListener('click', handleCanvasPlacement);
canvas.addEventListener('touchend', handleCanvasPlacement, { passive: false });