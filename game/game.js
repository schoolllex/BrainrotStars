// ============================================
// Configuration
// ============================================

const API_BASE = 'https://darkgoldenrod-frog-258465.hostingersite.com';
const SSE_TIMEOUT = 45000; // 45 secondes avant reconnexion

// Helper pour décoder JWT
function decodeJWT(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map((c) => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (error) {
        console.error('Erreur lors du décodage JWT:', error);
        return null;
    }
}

// ============================================
// State Management
// ============================================

const gameState = {
    token: null,
    userId: null,
    userName: null,
    gameId: null,
    eventSource: null,
    currentScreen: 'lobby',
    allCards: [], // Toutes les cartes disponibles
    selectedCards: [], // Cartes sélectionnées pour la partie (max 5)
    cards: [], // Alias pour selectedCards (pour compatibilité)
    placedCards: [],
    cardsSubmitted: false, // Flag pour éviter les soumissions multiples
    battleStartTime: null,
    currentRound: 0,
    playerHealth: 100,
    opponentHealth: 100,
    opponentName: 'Adversaire',
    playerName: 'Vous',
    gameEnded: false,
    invitations: []
};

// ============================================
// DOM Elements
// ============================================

const elements = {
    gameContainer: document.getElementById('gameContainer'),
    screens: document.querySelectorAll('.screen'),
    
    // Lobby
    lobbyScreen: document.getElementById('lobbyScreen'),
    quickPlayBtn: document.getElementById('quickPlayBtn'),
    inviteFriendBtn: document.getElementById('inviteFriendBtn'),
    invitationsContainer: document.getElementById('invitationsContainer'),
    invitationsList: document.getElementById('invitationsList'),
    
    // Friends Modal
    friendsModal: document.getElementById('friendsModal'),
    friendsList: document.getElementById('friendsList'),
    
    // Card Selection Modal
    cardSelectionModal: document.getElementById('cardSelectionModal'),
    cardSelectionList: document.getElementById('cardSelectionList'),
    selectedCount: document.getElementById('selectedCount'),
    confirmCardSelectionBtn: document.getElementById('confirmCardSelectionBtn'),
    
    // Placement
    placementScreen: document.getElementById('placementScreen'),
    playerName: document.getElementById('playerName'),
    opponentName: document.getElementById('opponentName'),
    arenaCanvas: document.getElementById('arenaCanvas'),
    arenaOverlay: document.getElementById('arenaOverlay'),
    cardsToPlace: document.getElementById('cardsToPlace'),
    placeCardsBtn: document.getElementById('placeCardsBtn'),
    clearPlacementBtn: document.getElementById('clearPlacementBtn'),
    placementTime: document.getElementById('placementTime'),
    
    // Battle
    battleScreen: document.getElementById('battleScreen'),
    battlePlayerName: document.getElementById('battlePlayerName'),
    battleOpponentName: document.getElementById('battleOpponentName'),
    battleCanvasPlayer: document.getElementById('battleCanvasPlayer'),
    battleCanvasOpponent: document.getElementById('battleCanvasOpponent'),
    roundNumber: document.getElementById('roundNumber'),
    battleStatus: document.getElementById('battleStatus'),
    player1Health: document.getElementById('player1Health'),
    player2Health: document.getElementById('player2Health'),
    player1HealthText: document.getElementById('player1HealthText'),
    player2HealthText: document.getElementById('player2HealthText'),
    surrenderBtn: document.getElementById('surrenderBtn'),
    
    // End
    endScreen: document.getElementById('endScreen'),
    endTitle: document.getElementById('endTitle'),
    endMessage: document.getElementById('endMessage'),
    endResultIcon: document.getElementById('endResultIcon'),
    endRounds: document.getElementById('endRounds'),
    endSurviving: document.getElementById('endSurviving'),
    endDamage: document.getElementById('endDamage'),
    playAgainBtn: document.getElementById('playAgainBtn'),
    
    // Loading
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingText: document.getElementById('loadingText')
};

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Loaded, starting initialization...');
    await initializeAuthAndGame();
    setupEventListeners();
    setupModalCloseButton();
    console.log('Initialization complete');
});

async function initializeAuthAndGame() {
    const token = await window.BrainrotAuth.waitUntilReady();
    
    if (!token) {
        window.location.href = '../index/index.html';
        return;
    }
    
    gameState.token = token;
    
    // Extraire l'ID du token JWT
    const decoded = decodeJWT(token);
    if (decoded && decoded.id) {
        gameState.userId = decoded.id;
    }
    
    // Récupérer le pseudo via /user/stats
    try {
        const response = await fetch(`${API_BASE}/user/stats`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.value) {
                gameState.userName = data.value.pseudo || 'Joueur';
            }
        }
    } catch (error) {
        console.error('Erreur lors de la récupération du pseudo:', error);
        gameState.userName = 'Joueur';
    }
    
    // Démarrer la connexion SSE
    connectSSE();
}

function setupEventListeners() {
    console.log('Setting up event listeners...');
    console.log('quickPlayBtn element:', elements.quickPlayBtn);
    
    // Lobby
    if(elements.quickPlayBtn) {
        elements.quickPlayBtn.addEventListener('click', () => {
            console.log('Quick Play clicked!');
            quickPlay();
        });
    } else {
        console.error('quickPlayBtn not found!');
    }
    
    if(elements.inviteFriendBtn) {
        elements.inviteFriendBtn.addEventListener('click', () => showFriendsModal());
    }
    
    // Placement
    if(elements.placeCardsBtn) {
        elements.placeCardsBtn.addEventListener('click', () => submitPlacedCards());
    }
    if(elements.clearPlacementBtn) {
        elements.clearPlacementBtn.addEventListener('click', () => clearPlacement());
    }
    
    // Battle
    if(elements.surrenderBtn) {
        elements.surrenderBtn.addEventListener('click', () => surrenderGame());
    }
    
    // End
    if(elements.playAgainBtn) {
        elements.playAgainBtn.addEventListener('click', () => {
            goToLobby();
        });
    }
    
    // Card Selection Modal
    if(elements.confirmCardSelectionBtn) {
        elements.confirmCardSelectionBtn.addEventListener('click', () => confirmCardSelection());
    }
    
    // Setup canvas
    setupCanvases();
    console.log('Event listeners setup complete');
}

function setupModalCloseButton() {
    const closeBtn = document.querySelector('[data-close]');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            elements.friendsModal.classList.remove('active');
        });
    }
    
    // Close modal on background click
    elements.friendsModal.addEventListener('click', (e) => {
        if (e.target === elements.friendsModal) {
            elements.friendsModal.classList.remove('active');
        }
    });
}

// ============================================
// Screen Navigation
// ============================================

function showScreen(screenName) {
    elements.screens.forEach(screen => {
        screen.classList.remove('active');
        screen.classList.add('hidden');
    });
    
    switch(screenName) {
        case 'lobby':
            elements.lobbyScreen.classList.remove('hidden');
            elements.lobbyScreen.classList.add('active');
            gameState.currentScreen = 'lobby';
            break;
        case 'placement':
            elements.placementScreen.classList.remove('hidden');
            elements.placementScreen.classList.add('active');
            gameState.currentScreen = 'placement';
            initializePlacementScreen();
            break;
        case 'battle':
            elements.battleScreen.classList.remove('hidden');
            elements.battleScreen.classList.add('active');
            gameState.currentScreen = 'battle';
            break;
        case 'end':
            elements.endScreen.classList.remove('hidden');
            elements.endScreen.classList.add('active');
            gameState.currentScreen = 'end';
            break;
    }
    
    lucide.createIcons();
}

function goToLobby() {
    gameState.gameId = null;
    gameState.placedCards = [];
    gameState.playerHealth = 100;
    gameState.opponentHealth = 100;
    gameState.gameEnded = false;
    gameState.currentRound = 0;
    showScreen('lobby');
    loadInvitations();
}

// ============================================
// Lobby Functions
// ============================================

function showLoading(text = 'Connexion au serveur...') {
    elements.loadingText.textContent = text;
    elements.loadingOverlay.classList.add('active');
}

function hideLoading() {
    elements.loadingOverlay.classList.remove('active');
}

async function quickPlay() {
    showLoading('Recherche d\'un adversaire...');
    
    try {
        const response = await fetch(`${API_BASE}/game/ask/random`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${gameState.token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // La recherche a réussi, attendre le SSE message newInvitation ou gameStart
            console.log('Recherche d\'adversaire en cours...');
            // Ne pas cacher le loading, attendre que SSE nous notifie
        } else {
            hideLoading();
            alert(data.message || 'Erreur lors de la recherche d\'un adversaire');
        }
    } catch (error) {
        hideLoading();
        console.error('Erreur lors de la recherche d\'adversaire:', error);
        alert('Erreur de connexion');
    }
}

async function loadInvitations() {
    // Les invitations arrivent via SSE (newInvitation)
    // On affiche juste celles déjà reçues
    if (gameState.invitations.length > 0) {
        displayInvitations();
    } else {
        elements.invitationsContainer.classList.add('hidden');
    }
}

function displayInvitations() {
    elements.invitationsContainer.classList.remove('hidden');
    elements.invitationsList.innerHTML = '';
    
    gameState.invitations.forEach(invitation => {
        const card = document.createElement('div');
        card.className = 'invitation-card';
        card.innerHTML = `
            <div class="invitation-player">
                <strong>${invitation.from.username || invitation.from.pseudo || 'Ami'}</strong>
                <p style="font-size: 0.85rem; color: var(--text-muted);">Vous invite à jouer</p>
            </div>
            <div class="invitation-actions">
                <button class="accept" onclick="acceptInvitation('${invitation.id}')">Accepter</button>
                <button class="deny" onclick="denyInvitation('${invitation.id}')">Refuser</button>
            </div>
        `;
        elements.invitationsList.appendChild(card);
    });
}

async function acceptInvitation(demandId) {
    showLoading('Acceptation de l\'invitation...');
    
    try {
        const response = await fetch(`${API_BASE}/game/accept/${demandId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${gameState.token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (!data.success) {
            hideLoading();
            alert(data.message || 'Erreur lors de l\'acceptation');
        }
    } catch (error) {
        hideLoading();
        console.error('Erreur lors de l\'acceptation:', error);
        alert('Erreur de connexion');
    }
}

async function denyInvitation(demandId) {
    try {
        const response = await fetch(`${API_BASE}/game/deny/${demandId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${gameState.token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            loadInvitations();
        }
    } catch (error) {
        console.error('Erreur lors du refus:', error);
    }
}

function showFriendsModal() {
    loadFriendsList();
    elements.friendsModal.classList.add('active');
}

async function loadFriendsList() {
    elements.friendsList.innerHTML = '<p style="padding: 1rem; text-align: center; color: var(--text-muted);">Chargement...</p>';
    
    try {
        const response = await fetch(`${API_BASE}/friend/`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${gameState.token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        // Adapter à la structure retournée: result au lieu de data, et user imbriqué
        const friendsList = data.success && data.result ? data.result.map(item => item.user) : [];
        
        if (friendsList.length > 0) {
            displayFriendsList(friendsList);
        } else {
            elements.friendsList.innerHTML = '<p style="padding: 1rem; text-align: center; color: var(--text-muted);">Aucun ami pour le moment</p>';
        }
    } catch (error) {
        console.error('Erreur lors du chargement des amis:', error);
        elements.friendsList.innerHTML = '<p style="padding: 1rem; text-align: center; color: var(--text-muted);">Erreur de chargement</p>';
    }
}

function displayFriendsList(friends) {
    elements.friendsList.innerHTML = '';
    
    friends.forEach(friend => {
        const item = document.createElement('div');
        item.className = 'friend-item';
        item.innerHTML = `
            <div class="friend-info">
                <span class="friend-name">${friend.pseudo}</span>
                <span class="friend-status">Cliquez pour inviter</span>
            </div>
            <button class="friend-action" onclick="inviteFriend('${friend.id}', '${friend.pseudo}')">
                Inviter
            </button>
        `;
        elements.friendsList.appendChild(item);
    });
}

async function inviteFriend(friendId, friendName) {
    showLoading(`Invitation envoyée à ${friendName}...`);
    
    try {
        const response = await fetch(`${API_BASE}/game/ask/${friendId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${gameState.token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            hideLoading();
            elements.friendsModal.classList.remove('active');
            alert(`Invitation envoyée à ${friendName}!`);
        } else {
            hideLoading();
            alert(data.message || 'Erreur lors de l\'invitation');
        }
    } catch (error) {
        hideLoading();
        console.error('Erreur lors de l\'invitation:', error);
        alert('Erreur de connexion');
    }
}

// ============================================
// SSE Connection
// ============================================

function connectSSE() {
    if (gameState.eventSource) {
        gameState.eventSource.close();
    }
    
    gameState.eventSource = new EventSource(`${API_BASE}/game/listen?token=${encodeURIComponent(gameState.token)}`);
    
    console.log('SSE Connected to:', `${API_BASE}/game/listen`);
    
    gameState.eventSource.onmessage = (event) => {
        console.log('Raw SSE event.data:', event.data);
        try {
            const message = JSON.parse(event.data);
            console.log('Parsed SSE message:', message);
            handleSSEMessage(message);
        } catch (error) {
            console.error('Erreur parsing SSE:', error, 'data:', event.data);
        }
    };
    
    // Aussi écouter pour les named events (gameStart, placementPhaseStarted, etc)
    const eventTypes = ['gameStart', 'placementPhaseStarted', 'placementPhaseEnded', 'roundResult', 'gameEnded', 'playerSurrendered', 'newInvitation', 'opponentPlacedCards'];
    
    eventTypes.forEach(eventType => {
        gameState.eventSource.addEventListener(eventType, (event) => {
            console.log(`SSE event [${eventType}]:`, event.data);
            try {
                const message = JSON.parse(event.data);
                message.type = eventType; // Ajouter le type si c'est pas dedans
                handleSSEMessage(message);
            } catch (error) {
                console.error(`Erreur parsing SSE event ${eventType}:`, error);
            }
        });
    });
    
    gameState.eventSource.onerror = (error) => {
        console.error('SSE Error:', error);
        console.log('SSE readyState:', gameState.eventSource.readyState);
        gameState.eventSource.close();
        // Reconnect après 2 secondes
        setTimeout(() => connectSSE(), 2000);
    };
}

function handleSSEMessage(message) {
    console.log('SSE Message:', message);
    
    switch(message.type) {
        case 'gameStart':
            handleGameStart(message).catch(err => console.error('Error in handleGameStart:', err));
            break;
        case 'placementPhaseStarted':
            handlePlacementPhaseStarted(message);
            break;
        case 'placementPhaseEnded':
            handlePlacementPhaseEnded(message);
            break;
        case 'roundResult':
            handleRoundResult(message);
            break;
        case 'gameEnded':
            handleGameEnded(message);
            break;
        case 'playerSurrendered':
            handlePlayerSurrendered(message);
            break;
        case 'newInvitation':
            handleNewInvitation(message);
            break;
        case 'opponentPlacedCards':
            console.log('L\'adversaire a placé des cartes');
            break;
    }
}

async function handleGameStart(message) {
    hideLoading();
    gameState.gameId = message.gameId;
    gameState.opponentName = message.data.opponentName;
    gameState.playerName = gameState.userName;
    gameState.playerHealth = 100;
    gameState.opponentHealth = 100;
    gameState.gameEnded = false;
    
    // Charger les cartes disponibles
    await loadPlayerCards();
    console.log('Cards loaded:', gameState.cards.length);
}

function handlePlacementPhaseStarted(message) {
    console.log('Placement phase started');
    console.log('Current cards:', gameState.cards.length);
    console.log('Is replacement:', message.data?.isReplacement);
    
    hideLoading(); // Hide the "Waiting for opponent..." or any other loading message
    
    showScreen('placement');
    
    // Accéder à la deadline depuis message.data ou directement depuis message
    const deadline = message.data?.placeCardDeadline || message.placeCardDeadline;
    console.log('Deadline:', deadline);
    if (deadline) {
        startPlacementTimer(deadline);
    }
}

function handlePlacementPhaseEnded(message) {
    console.log('Phase de placement terminée');
    showScreen('battle');
    initializeBattleScreen();
}

function handleRoundResult(message) {
    gameState.currentRound = message.round;
    gameState.playerHealth = message.players[0].lifePoints;
    gameState.opponentHealth = message.players[1].lifePoints;
    
    updateBattleDisplay(message);
    
    // Animer les combats avant de dessiner l'état final
    if (message.battleActions && message.battleActions.length > 0) {
        animateBattleActions(message.units, message.battleActions);
    } else {
        drawBattle(message.units);
    }
    
    // Vérifier si c'est un match nul (10 rounds atteints)
    if (gameState.currentRound >= 10) {
        console.log('Max rounds atteint! Match nul');
        setTimeout(() => {
            showGameEnd(false, {
                winner: null,
                finalStats: {
                    survivingCards: 0,
                    damageInflicted: 0
                }
            });
        }, 2000);
    } else {
        // Après un round, attendre que le serveur envoie placementPhaseStarted pour redéplacement
        console.log('Round terminé, attente de la phase de redéplacement...');
        setTimeout(() => {
            elements.battleStatus.textContent = `Round ${gameState.currentRound} terminé! Redéplacement...`;
        }, 1500);
    }
}

function handleGameEnded(message) {
    gameState.gameEnded = true;
    const isWinner = message.winner === gameState.userId;
    
    showGameEnd(isWinner, message);
}

function handlePlayerSurrendered(message) {
    // Quand un joueur se rend
    gameState.gameEnded = true;
    const isWinner = message.surrendererId !== gameState.userId; // L'autre joueur a perdu
    
    console.log('Player surrendered:', message.surrendererId, 'Winner:', message.winner);
    
    // Afficher l'écran de fin avec animation
    showGameEnd(isWinner, {
        winner: message.winner,
        finalStats: {
            survivingCards: 0,
            damageInflicted: 0
        }
    });
}

function handleNewInvitation(message) {
    // Ajouter à la liste des invitations
    if (message.from && message.id) {
        gameState.invitations.push({
            id: message.id,
            from: message.from
        });
    }
    
    if (gameState.currentScreen === 'lobby') {
        displayInvitations();
    }
}

// ============================================
// Placement Screen
// ============================================

async function loadPlayerCards() {
    try {
        const response = await fetch(`${API_BASE}/user/cards`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${gameState.token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        console.log('Raw cards data:', data);
        
        // Adapter à la structure retournée: structure avec card imbriquée
        let cardsList = [];
        if (data.success && data.cards && Array.isArray(data.cards)) {
            // Les cartes peuvent avoir la structure: { cardId, card: { id, name } }
            cardsList = data.cards.map(item => ({
                id: item.card ? item.card.id : item.id,
                name: item.card ? item.card.name : item.name,
                cardId: item.cardId || item.id,
                quantity: item.quantity || 1,
                image: item.card?.image || item.image || null // Support pour les images
            }));
        }
        
        console.log('Processed cards:', cardsList);
        
        if (cardsList.length > 0) {
            gameState.allCards = cardsList; // Stocker toutes les cartes
            gameState.selectedCards = []; // Réinitialiser la sélection
            gameState.cards = gameState.selectedCards; // Alias
            console.log('Cartes chargées:', gameState.allCards.length, gameState.allCards);
            
            // Afficher le modal de sélection
            showCardSelectionModal();
        } else {
            console.warn('Aucune carte disponible');
            gameState.allCards = [];
        }
    } catch (error) {
        console.error('Erreur lors du chargement des cartes:', error);
        gameState.allCards = [];
    }
}

function showCardSelectionModal() {
    elements.cardSelectionList.innerHTML = '';
    gameState.selectedCards = [];
    
    gameState.allCards.forEach(card => {
        const cardEl = document.createElement('div');
        cardEl.className = 'card-selection-item';
        cardEl.innerHTML = `
            ${card.image ? `<img src="${card.image}" alt="${card.name}" class="card-selection-image">` : ''}
            <div class="card-selection-info">
                <div class="card-selection-name">${card.name || 'Carte'}</div>
                <div class="card-selection-stats">
                    <span>❤️ 100</span>
                    <span>⚔️ 15</span>
                </div>
            </div>
            <input type="checkbox" class="card-checkbox" data-card-id="${card.cardId || card.id}">
        `;
        
        const checkbox = cardEl.querySelector('.card-checkbox');
        checkbox.addEventListener('change', (e) => {
            handleCardSelection(card, e.target.checked);
        });
        
        elements.cardSelectionList.appendChild(cardEl);
    });
    
    elements.cardSelectionModal.classList.remove('hidden');
    elements.cardSelectionModal.classList.add('active');
}

function handleCardSelection(card, isSelected) {
    const cardId = card.cardId || card.id;
    
    if (isSelected) {
        if (gameState.selectedCards.length < 5) {
            gameState.selectedCards.push(card);
        } else {
            // Repêcher la checkbox
            const checkbox = document.querySelector(`[data-card-id="${cardId}"]`);
            if (checkbox) checkbox.checked = false;
            alert('Maximum 5 cartes sélectionnées!');
        }
    } else {
        gameState.selectedCards = gameState.selectedCards.filter(c => (c.cardId || c.id) !== cardId);
    }
    
    // Mettre à jour le compteur et activer/désactiver le bouton
    elements.selectedCount.textContent = `${gameState.selectedCards.length}/5`;
    elements.confirmCardSelectionBtn.disabled = gameState.selectedCards.length !== 5;
}

function confirmCardSelection() {
    if (gameState.selectedCards.length !== 5) {
        alert('Veuillez sélectionner exactement 5 cartes');
        return;
    }
    
    // Envoyer la confirmation au serveur (qui attend les deux joueurs)
    sendCardConfirmationToServer();
}

async function sendCardConfirmationToServer() {
    showLoading('Confirmation des cartes...');
    
    try {
        const selectedCardIds = gameState.selectedCards.map(card => card.cardId || card.id);
        
        const response = await fetch(`${API_BASE}/game/${gameState.gameId}/confirm-cards`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${gameState.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ selectedCardIds })
        });
        
        const data = await response.json();
        
        if (!data.success) {
            hideLoading();
            alert(data.message || 'Erreur lors de la confirmation');
            return;
        }
        
        // IMPORTANT: Garder les cartes sélectionnées dans gameState.cards
        gameState.cards = gameState.selectedCards;
        
        // Fermer le modal et attendre la phase de placement
        elements.cardSelectionModal.classList.remove('active');
        elements.cardSelectionModal.classList.add('hidden');
        
        // Afficher un message d'attente jusqu'à ce que l'adversaire confirme aussi
        showLoading('En attente de l\'adversaire...');
        
        console.log('Cartes confirmées:', selectedCardIds);
        // Le serveur va envoyer placementPhaseStarted via SSE quand les deux sont prêts
    } catch (error) {
        hideLoading();
        console.error('Erreur lors de la confirmation:', error);
        alert('Erreur de connexion');
    }
}

function initializePlacementScreen() {
    console.log('Initializing placement screen');
    console.log('Player name:', gameState.playerName);
    console.log('Opponent name:', gameState.opponentName);
    console.log('Cards count:', gameState.cards.length);
    console.log('Current round:', gameState.currentRound);
    
    // Réinitialiser le flag de soumission pour permettre un nouveau placement
    gameState.cardsSubmitted = false;
    
    // En redéplacement, ne pas effacer les cartes, juste permettre le redéplacement
    // En placement initial, effacer les cartes placées
    if (gameState.currentRound === 0) {
        gameState.placedCards = [];
    }
    
    elements.playerName.textContent = gameState.playerName;
    elements.opponentName.textContent = gameState.opponentName;
    
    // Afficher les cartes sélectionnées
    displayCardsToPlace();
    initArenaCanvas();
    
    console.log('Placement screen initialized');
}

function displayCardsToPlace() {
    elements.cardsToPlace.innerHTML = '';
    
    if (gameState.cards.length === 0) {
        elements.cardsToPlace.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Aucune carte disponible</p>';
        return;
    }
    
    gameState.cards.forEach((card, index) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'card-item';
        // Utiliser card.cardId s'il existe, sinon card.id
        const cardId = card.cardId || card.id;
        cardEl.dataset.cardId = cardId;
        cardEl.dataset.cardIndex = index;
        
        // Vérifier si la carte est déjà placée
        const isPlaced = gameState.placedCards.some(pc => pc.cardId === cardId);
        if (isPlaced) {
            cardEl.classList.add('placed');
        }
        
        // Toujours permettre le drag-drop (même si placée pour redéplacement)
        cardEl.draggable = true;
        
        cardEl.innerHTML = `
            ${card.image ? `<img src="${card.image}" alt="${card.name}" class="card-item-image">` : ''}
            <div class="card-item-name">${card.name || 'Carte'}</div>
            <div class="card-item-stats">
                <div class="card-item-stat health">
                    <span>❤️ 100</span>
                </div>
                <div class="card-item-stat attack">
                    <span>⚔️ 15</span>
                </div>
            </div>
        `;
        
        cardEl.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('cardId', cardId);
            e.dataTransfer.setData('cardIndex', index);
            console.log('Drag start - cardId:', cardId);
            cardEl.classList.add('dragging');
        });
        
        cardEl.addEventListener('dragend', () => {
            cardEl.classList.remove('dragging');
        });
        
        elements.cardsToPlace.appendChild(cardEl);
    });
}

function initArenaCanvas() {
    const canvas = elements.arenaCanvas;
    const ctx = canvas.getContext('2d');
    
    // Responsive canvas
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    // Afficher les zones
    elements.arenaOverlay.classList.add('show');
    
    // Redessiner
    drawPlacementArena(ctx, canvas.width, canvas.height);
    
    // Setup drag and drop
    setupArenaDragDrop(canvas, ctx);
}

function drawPlacementArena(ctx, width, height) {
    // Background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.fillRect(0, 0, width, height);
    
    // Ligne de séparation
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();
    
    // Grille
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    
    for (let x = 0; x <= width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    
    for (let y = 0; y <= height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    
    // Dessiner les cartes placées
    drawPlacedCards(ctx, width, height);
}

function drawPlacedCards(ctx, width, height) {
    gameState.placedCards.forEach(placedCard => {
        // Chercher la carte par cardId ou id
        const card = gameState.cards.find(c => c.cardId === placedCard.cardId || c.id === placedCard.cardId);
        if (!card) {
            console.warn('Card not found:', placedCard.cardId);
            return;
        }
        
        const x = placedCard.x;
        const y = placedCard.y;
        const cardWidth = 60;
        const cardHeight = 80;
        
        // Card background
        ctx.fillStyle = placedCard.isPlayerCard ? 'rgba(16, 185, 129, 0.2)' : 'rgba(220, 38, 38, 0.2)';
        ctx.strokeStyle = placedCard.isPlayerCard ? 'rgba(16, 185, 129, 0.5)' : 'rgba(220, 38, 38, 0.5)';
        ctx.lineWidth = 2;
        ctx.fillRect(x - cardWidth / 2, y - cardHeight / 2, cardWidth, cardHeight);
        ctx.strokeRect(x - cardWidth / 2, y - cardHeight / 2, cardWidth, cardHeight);
        
        // Card name
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = 'bold 10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(card.name.substring(0, 8), x, y);
        
        // Si la carte a une image, l'afficher (à améliorer avec async image loading)
        if (card.image) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fillText('📷', x, y - 15);
        }
    });
}

function setupArenaDragDrop(canvas, ctx) {
    // Permettre le drag sur le canvas
    canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        canvas.style.backgroundColor = 'rgba(249, 115, 22, 0.1)';
    });
    
    canvas.addEventListener('dragleave', (e) => {
        e.preventDefault();
        canvas.style.backgroundColor = '';
    });
    
    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        canvas.style.backgroundColor = '';
        
        const cardId = e.dataTransfer.getData('cardId');
        if (!cardId) {
            console.log('No cardId in drag data');
            return;
        }
        
        console.log('Dropped card:', cardId);
        
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        console.log('Drop position:', x, y);
        
        // Vérifier si c'est dans la zone du joueur (gauche)
        if (x < canvas.width / 2) {
            addPlacedCard(cardId, x, y, true);
            drawPlacementArena(ctx, canvas.width, canvas.height);
            displayCardsToPlace(); // Mettre à jour l'affichage des cartes
            console.log('Card placed for player');
        } else {
            console.log('Drop position outside player zone');
        }
    });
    
    // Support pour redéplacer les cartes en les cliquant-glissant directement sur le canvas
    let selectedCard = null;
    let isDraggingCard = false;
    
    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Vérifier si on a cliqué sur une carte placée
        for (let i = gameState.placedCards.length - 1; i >= 0; i--) {
            const placedCard = gameState.placedCards[i];
            const dx = placedCard.x - x;
            const dy = placedCard.y - y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 40) { // Rayon de 40px
                selectedCard = i;
                isDraggingCard = true;
                canvas.style.cursor = 'grabbing';
                break;
            }
        }
    });
    
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Vérifier si on peut sélectionner une carte
        let canSelect = false;
        for (let placedCard of gameState.placedCards) {
            const dx = placedCard.x - x;
            const dy = placedCard.y - y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < 40) {
                canSelect = true;
                break;
            }
        }
        canvas.style.cursor = canSelect ? 'grab' : 'default';
        
        // Si on traîne une carte
        if (isDraggingCard && selectedCard !== null && x < canvas.width / 2) {
            gameState.placedCards[selectedCard].x = x;
            gameState.placedCards[selectedCard].y = y;
            drawPlacementArena(ctx, canvas.width, canvas.height);
        }
    });
    
    canvas.addEventListener('mouseup', () => {
        isDraggingCard = false;
        selectedCard = null;
        canvas.style.cursor = 'default';
        drawPlacementArena(ctx, canvas.width, canvas.height);
    });
    
    canvas.addEventListener('mouseleave', () => {
        isDraggingCard = false;
        selectedCard = null;
        canvas.style.cursor = 'default';
    });
}

function addPlacedCard(cardId, x, y, isPlayerCard) {
    // Vérifier si la carte est déjà placée
    const existing = gameState.placedCards.find(pc => pc.cardId === cardId);
    
    if (existing) {
        // Redéplacer la carte (déplacement)
        existing.x = x;
        existing.y = y;
        console.log('Carte redéplacée:', cardId, {x, y});
    } else {
        // Vérifier qu'on n'a pas déjà 5 cartes placées (optionnel, mais logique)
        if (gameState.placedCards.length >= gameState.cards.length) {
            console.log('Toutes les cartes sont déjà placées');
            return;
        }
        
        // Placer la nouvelle carte
        gameState.placedCards.push({
            cardId,
            x,
            y,
            isPlayerCard
        });
        console.log('Nouvelle carte placée:', cardId, {x, y});
    }
}

function clearPlacement() {
    gameState.placedCards = [];
    const ctx = elements.arenaCanvas.getContext('2d');
    drawPlacementArena(ctx, elements.arenaCanvas.width, elements.arenaCanvas.height);
}

async function submitPlacedCards() {
    // Empêcher les soumissions multiples
    if (gameState.cardsSubmitted) {
        console.log('Cartes déjà soumises');
        return;
    }
    
    gameState.cardsSubmitted = true;
    
    if (gameState.placedCards.length === 0) {
        alert('Veuillez placer au moins une carte');
        gameState.cardsSubmitted = false; // Réinitialiser si erreur
        return;
    }
    
    showLoading('Envoi des cartes...');
    
    try {
        const cardsPayload = gameState.placedCards
            .filter(pc => pc.isPlayerCard)
            .map(pc => ({
                id: pc.cardId,
                x: Math.round(pc.x * 1000 / elements.arenaCanvas.width),
                y: Math.round(pc.y * 1000 / elements.arenaCanvas.height)
            }));
        
        const response = await fetch(`${API_BASE}/game/${gameState.gameId}/place-cards`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${gameState.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ cards: cardsPayload })
        });
        
        const data = await response.json();
        
        if (!data.success) {
            hideLoading();
            alert(data.message || 'Erreur lors du placement');
            gameState.cardsSubmitted = false; // Réinitialiser si erreur
        } else {
            console.log('Cartes envoyées avec succès');
            hideLoading();
            // Le backend gèrera le passage au round suivant ou la phase de redéplacement
        }
    } catch (error) {
        hideLoading();
        console.error('Erreur lors du placement:', error);
        alert('Erreur de connexion');
        gameState.cardsSubmitted = false; // Réinitialiser si erreur
    }
}

function startPlacementTimer(deadline) {
    // Si deadline est un nombre (timestamp), l'utiliser directement
    // Si c'est une string ISO, la convertir
    const deadlineTime = typeof deadline === 'number' ? deadline : new Date(deadline).getTime();
    
    console.log('Starting placement timer');
    console.log('Deadline:', deadline);
    console.log('Deadline time:', deadlineTime);
    console.log('Current time:', new Date().getTime());
    
    const interval = setInterval(() => {
        const now = new Date().getTime();
        const remaining = Math.max(0, Math.floor((deadlineTime - now) / 1000));
        
        elements.placementTime.textContent = remaining;
        console.log('Placement time remaining:', remaining);
        
        // Si le timer est à 0, auto-soumettre les cartes
        if (remaining <= 0) {
            clearInterval(interval);
            console.log('Timer expired, auto-submitting cards...');
            
            // Vérifier si on a déjà envoyé les cartes
            if (!gameState.cardsSubmitted) {
                gameState.cardsSubmitted = true;
                submitPlacedCards();
            }
        }
    }, 1000);
}

// ============================================
// Battle Screen
// ============================================

function initializeBattleScreen() {
    hideLoading();
    elements.battlePlayerName.textContent = gameState.playerName;
    elements.battleOpponentName.textContent = gameState.opponentName;
    gameState.currentRound = 0;
    
    // Setup canvases
    setupBattleCanvases();
}

function setupBattleCanvases() {
    const setupCanvas = (canvas) => {
        const container = canvas.parentElement;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    
    setupCanvas(elements.battleCanvasPlayer);
    setupCanvas(elements.battleCanvasOpponent);
}

function updateBattleDisplay(message) {
    elements.roundNumber.textContent = `Round ${gameState.currentRound}`;
    
    const player1Percent = (gameState.playerHealth / 100) * 100;
    const player2Percent = (gameState.opponentHealth / 100) * 100;
    
    elements.player1Health.style.width = Math.max(0, player1Percent) + '%';
    elements.player2Health.style.width = Math.max(0, player2Percent) + '%';
    
    elements.player1HealthText.textContent = `${Math.max(0, gameState.playerHealth)}/100`;
    elements.player2HealthText.textContent = `${Math.max(0, gameState.opponentHealth)}/100`;
}

function drawBattle(units) {
    // Filtrer seulement les cartes vivantes
    const playerUnits = units.filter(u => u.ownerId === gameState.userId && u.alive);
    const opponentUnits = units.filter(u => u.ownerId !== gameState.userId && u.alive);
    
    console.log('Drawing battle - Player units:', playerUnits.length, 'Opponent units:', opponentUnits.length);
    console.log('All units:', units);
    
    drawUnitsOnCanvas(elements.battleCanvasPlayer, playerUnits);
    drawUnitsOnCanvas(elements.battleCanvasOpponent, opponentUnits);
}

function drawUnitsOnCanvas(canvas, units) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.fillRect(0, 0, width, height);
    
    console.log(`Drawing ${units.length} units on canvas (${width}x${height})`);
    
    // Draw units
    units.forEach((unit, index) => {
        // Vérifier que x et y sont valides (0-1000)
        let x = unit.x || 0;
        let y = unit.y || 0;
        
        // Si x ou y est > 1000, ça vient du pixel -> normaliser
        if (x > 1000 || y > 1000) {
            console.warn(`Unit ${unit.id} has invalid position: x=${x}, y=${y}`);
            // Garder juste les coordonnées en pixels si elles viennent pas du scale
            x = Math.min(x, 1000);
            y = Math.min(y, 1000);
        }
        
        const pixelX = (x / 1000) * width;
        const pixelY = (y / 1000) * height;
        
        console.log(`Unit ${index}: id=${unit.id}, x=${x} (${pixelX}px), y=${y} (${pixelY}px), health=${unit.health}, alive=${unit.alive}`);
        
        const unitSize = 40;
        
        if (unit.alive) {
            // Alive unit - GREEN
            ctx.fillStyle = 'rgba(16, 185, 129, 0.4)';
            ctx.strokeStyle = 'rgba(16, 185, 129, 1)';
        } else {
            // Dead unit - RED
            ctx.fillStyle = 'rgba(220, 38, 38, 0.2)';
            ctx.strokeStyle = 'rgba(220, 38, 38, 0.6)';
        }
        
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(pixelX, pixelY, unitSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Health text
        ctx.fillStyle = unit.alive ? 'rgba(16, 185, 129, 1)' : 'rgba(220, 38, 38, 1)';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.max(0, unit.health), pixelX, pixelY);
    });
}

// Animation des combats avec mouvements et 💥
function animateBattleActions(units, battleActions) {
    // Créer une carte unitId -> unit pour un accès rapide
    const unitMap = new Map();
    units.forEach(u => unitMap.set(u.id, u));
    
    let actionIndex = 0;
    let allActions = [...battleActions]; // Copier les actions
    
    console.log(`Starting battle animations with ${allActions.length} actions`);
    
    const animateNextAction = () => {
        if (actionIndex >= allActions.length) {
            // Toutes les actions sont terminées, afficher l'état final
            console.log('All battle actions done, drawing final state');
            drawBattle(units);
            return;
        }
        
        const action = allActions[actionIndex];
        const attacker = unitMap.get(action.attacker);
        const defender = action.defender === 'opponent_life' ? null : unitMap.get(action.defender);
        
        console.log(`Animating action ${actionIndex + 1}/${allActions.length}:`, action);
        
        // Animer l'attaque
        animateSingleAttack(attacker, defender, action.damage, units, () => {
            actionIndex++;
            // Ajouter un petit délai entre les actions
            setTimeout(animateNextAction, 300);
        });
    };
    
    animateNextAction();
}

// Animer une seule attaque avec mouvement et impact 💥
function animateSingleAttack(attacker, defender, damage, units, callback) {
    if (!attacker) {
        console.log('No attacker, skipping animation');
        if (callback) callback();
        return;
    }
    
    console.log(`Animating attack: ${attacker.id} -> ${defender ? defender.id : 'opponent_life'} (${damage} damage)`);
    
    // Déterminer le canvas de l'attaquant
    const isPlayerAttacker = attacker.ownerId === gameState.userId;
    const attackerCanvas = isPlayerAttacker ? elements.battleCanvasPlayer : elements.battleCanvasOpponent;
    const defenderCanvas = !isPlayerAttacker ? elements.battleCanvasPlayer : elements.battleCanvasOpponent;
    
    const attackerCtx = attackerCanvas.getContext('2d');
    const defenderCtx = defenderCanvas.getContext('2d');
    
    const attackerX = (attacker.x / 1000) * attackerCanvas.width;
    const attackerY = (attacker.y / 1000) * attackerCanvas.height;
    
    const startTime = Date.now();
    const duration = 700; // ms
    const unitSize = 40;
    
    let defenderX = 0;
    let defenderY = 0;
    
    if (defender) {
        defenderX = (defender.x / 1000) * defenderCanvas.width;
        defenderY = (defender.y / 1000) * defenderCanvas.height;
    }
    
    let frameCount = 0;
    
    const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        frameCount++;
        
        // Redessiner l'état actuel des deux côtés
        const playerUnits = units.filter(u => u.ownerId === gameState.userId && u.alive);
        const opponentUnits = units.filter(u => u.ownerId !== gameState.userId && u.alive);
        
        drawUnitsOnCanvas(elements.battleCanvasPlayer, playerUnits);
        drawUnitsOnCanvas(elements.battleCanvasOpponent, opponentUnits);
        
        // Phase 1: Mouvement de l'attaquant (0-40%)
        if (progress < 0.4) {
            const moveProgress = progress / 0.4;
            const moveDistance = 20 * moveProgress;
            const moveX = moveDistance * (isPlayerAttacker ? 1 : -1);
            
            attackerCtx.save();
            attackerCtx.globalAlpha = 0.6 + 0.4 * moveProgress;
            attackerCtx.fillStyle = 'rgba(249, 115, 22, 0.8)';
            attackerCtx.beginPath();
            attackerCtx.arc(attackerX + moveX, attackerY, unitSize / 2 + 3, 0, Math.PI * 2);
            attackerCtx.fill();
            attackerCtx.strokeStyle = 'rgba(249, 115, 22, 1)';
            attackerCtx.lineWidth = 2;
            attackerCtx.stroke();
            attackerCtx.restore();
        }
        
        // Phase 2: Impact 💥 (40-100%)
        if (progress >= 0.3) {
            const impactProgress = Math.max(0, Math.min(1, (progress - 0.3) / 0.5));
            
            if (defender) {
                // Impact sur le défenseur
                defenderCtx.save();
                defenderCtx.globalAlpha = Math.max(0, 1 - impactProgress);
                defenderCtx.font = 'bold 48px Arial';
                defenderCtx.textAlign = 'center';
                defenderCtx.fillStyle = '#fbbf24';
                
                const scale = 0.6 + impactProgress * 0.6;
                defenderCtx.save();
                defenderCtx.translate(defenderX, defenderY - 40);
                defenderCtx.scale(scale, scale);
                defenderCtx.fillText('💥', 0, 0);
                defenderCtx.restore();
                
                // Afficher les dégâts
                if (impactProgress < 0.8) {
                    defenderCtx.font = 'bold 24px Arial';
                    defenderCtx.fillStyle = '#ef4444';
                    defenderCtx.fillText(`-${damage}`, defenderX + 40, defenderY + 50);
                }
                defenderCtx.restore();
            } else {
                // Impact direct sur les PV
                const targetCanvas = !isPlayerAttacker ? elements.battleCanvasPlayer : elements.battleCanvasOpponent;
                const targetCtx = targetCanvas.getContext('2d');
                
                targetCtx.save();
                targetCtx.globalAlpha = Math.max(0, 1 - impactProgress);
                targetCtx.font = 'bold 60px Arial';
                targetCtx.textAlign = 'center';
                targetCtx.fillStyle = '#fbbf24';
                
                const scale = 0.6 + impactProgress * 0.6;
                targetCtx.save();
                targetCtx.translate(targetCanvas.width / 2, targetCanvas.height / 2 - 60);
                targetCtx.scale(scale, scale);
                targetCtx.fillText('💥', 0, 0);
                targetCtx.restore();
                
                // Afficher les dégâts directs
                if (impactProgress < 0.8) {
                    targetCtx.font = 'bold 32px Arial';
                    targetCtx.fillStyle = '#ef4444';
                    targetCtx.fillText(`-${damage} PV`, targetCanvas.width / 2, targetCanvas.height / 2 + 80);
                }
                targetCtx.restore();
            }
        }
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            // Animation terminée
            console.log(`Attack animation complete after ${frameCount} frames`);
            const playerUnits = units.filter(u => u.ownerId === gameState.userId && u.alive);
            const opponentUnits = units.filter(u => u.ownerId !== gameState.userId && u.alive);
            drawUnitsOnCanvas(elements.battleCanvasPlayer, playerUnits);
            drawUnitsOnCanvas(elements.battleCanvasOpponent, opponentUnits);
            
            if (callback) callback();
        }
    };
    
    animate();
}

async function surrenderGame() {
    if (!confirm('Êtes-vous sûr de vouloir vous rendre?')) return;
    
    showLoading('Abandon du jeu...');
    
    try {
        const response = await fetch(`${API_BASE}/game/${gameState.gameId}/surrender`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${gameState.token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (!data.success) {
            hideLoading();
            alert(data.message || 'Erreur');
        }
    } catch (error) {
        hideLoading();
        console.error('Erreur:', error);
        alert('Erreur de connexion');
    }
}

// ============================================
// Game End
// ============================================

function showGameEnd(isWinner, message) {
    const finalStats = message.finalStats || {};
    const endContent = elements.endScreen.querySelector('.end-content');
    
    // Réinitialiser les classes
    elements.endResultIcon.className = 'result-icon';
    if (endContent) {
        endContent.className = 'end-content';
    }
    
    if (isWinner === null || (isWinner === false && gameState.currentRound >= 10)) {
        // Match nul
        elements.endResultIcon.textContent = '🤝';
        elements.endTitle.textContent = 'Match Nul';
        elements.endTitle.style.color = '#f59e0b';
        elements.endMessage.textContent = `Égalité après ${gameState.currentRound} rounds!`;
        
        // Ajouter l'animation de draw
        elements.endResultIcon.classList.add('draw');
        if (endContent) endContent.classList.add('draw');
        
        // Créer des confettis
        createConfetti();
        
    } else if (isWinner) {
        // Victoire
        elements.endResultIcon.textContent = '🏆';
        elements.endTitle.textContent = 'Victoire!';
        elements.endTitle.style.color = '';
        elements.endMessage.textContent = `Vous avez vaincu ${gameState.opponentName}!`;
        
        // Ajouter l'animation de victoire
        elements.endResultIcon.classList.add('victory');
        if (endContent) endContent.classList.add('victory');
        
        // Créer des confettis
        createConfetti();
        
    } else {
        // Défaite
        elements.endResultIcon.textContent = '💔';
        elements.endTitle.textContent = 'Défaite';
        elements.endTitle.style.color = '#dc2626';
        elements.endMessage.textContent = `Vous avez perdu contre ${gameState.opponentName}`;
        
        // Ajouter l'animation de défaite
        elements.endResultIcon.classList.add('defeat');
        if (endContent) endContent.classList.add('defeat');
    }
    
    elements.endRounds.textContent = gameState.currentRound;
    elements.endSurviving.textContent = finalStats.survivingCards || 0;
    elements.endDamage.textContent = finalStats.damageInflicted || 0;
    
    showScreen('end');
}

function createConfetti() {
    // Créer des particules de confettis uniquement en cas de victoire/draw
    const confettiCount = 30;
    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.top = '-20px';
        confetti.style.opacity = Math.random() * 0.5 + 0.5;
        document.body.appendChild(confetti);
        
        // Supprimer après animation
        setTimeout(() => {
            confetti.remove();
        }, 3000);
    }
}

// ============================================
// Canvas Setup
// ============================================

function setupCanvases() {
    window.addEventListener('resize', () => {
        if (gameState.currentScreen === 'placement') {
            initArenaCanvas();
        } else if (gameState.currentScreen === 'battle') {
            setupBattleCanvases();
        }
    });
}

// ============================================
// Icones
// ============================================

window.addEventListener('load', () => {
    lucide.createIcons();
});
