const currentPseudoDisplay = document.getElementById("current-pseudo");
const updatePseudoForm = document.getElementById("update-pseudo-form");
const newPseudoInput = document.getElementById("new-pseudo-input");
const profileFeedback = document.getElementById("profile-feedback");
const API_BASE_URL = "http://darkgoldenrod-frog-258465.hostingersite.com";

let pollingInterval = null;

async function getAuthToken() {
    return await window.BrainrotAuth.waitUntilReady();
}

async function fetchUserStats(token) {
    const response = await fetch(`${API_BASE_URL}/user/stats`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
    if (!response.ok) {
        throw new Error(`Stats request failed (${response.status})`);
    }
    const payload = await response.json();
    if (!payload?.success) {
        throw new Error("Stats payload invalid");
    }
    return payload.value;
}

async function fetchFriends(token) {
    try {
        const response = await fetch(`${API_BASE_URL}/friend/`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        if (!response.ok) {
            throw new Error(`Friends request failed (${response.status})`);
        }
        const payload = await response.json();
        if (!payload?.success) {
            throw new Error("Friends payload invalid");
        }
        return payload.result || [];
    } catch (error) {
        console.error("Error fetching friends:", error);
        return [];
    }
}

async function fetchFriendRequests(token) {
    try {
        const response = await fetch(`${API_BASE_URL}/friend/req/`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        if (!response.ok) {
            return [];
        }
        const payload = await response.json();
        if (Array.isArray(payload)) return payload;
        if (payload?.result && Array.isArray(payload.result)) return payload.result;
        return [];
    } catch (error) {
        console.error("Error fetching friend requests:", error);
        return [];
    }
}

async function sendFriendRequest(pseudo) {
    try {
        const token = await getAuthToken();
        if (!token) throw new Error("No auth token");

        const response = await fetch(`${API_BASE_URL}/friend/req/${encodeURIComponent(pseudo)}`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const data = await response.json();
        return {
            success: response.ok && data.success,
            message: data.message || (response.ok ? null : "Erreur lors de l'envoi de la demande")
        };
    } catch (error) {
        console.error("Error sending friend request:", error);
        return { success: false, message: "Erreur lors de l'envoi de la demande" };
    }
}

async function acceptFriendRequest(userId) {
    try {
        const token = await getAuthToken();
        if (!token) throw new Error("No auth token");

        const response = await fetch(`${API_BASE_URL}/friend/accept/${userId}`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const data = await response.json();
        return { success: response.ok && data.success };
    } catch (error) {
        console.error("Error accepting friend request:", error);
        return { success: false };
    }
}

async function denyFriendRequest(userId) {
    try {
        const token = await getAuthToken();
        if (!token) throw new Error("No auth token");

        const response = await fetch(`${API_BASE_URL}/friend/deny/${userId}`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const data = await response.json();
        return { success: response.ok && data.success };
    } catch (error) {
        console.error("Error denying friend request:", error);
        return { success: false };
    }
}

async function loadUserPseudo() {
    try {
        const token = await getAuthToken();
        if (!token) {
            throw new Error("No auth token");
        }
        const stats = await fetchUserStats(token);
        currentPseudoDisplay.textContent = stats.pseudo || "Inconnu";
    } catch (error) {
        console.error("Erreur chargement pseudo:", error);
        currentPseudoDisplay.textContent = "Erreur";
    }
}

async function updatePseudo(event) {
    event.preventDefault();
    const newPseudo = (newPseudoInput.value || "").trim();

    if (!newPseudo) {
        profileFeedback.textContent = "Entre un pseudo valide.";
        profileFeedback.style.color = "#fda4af";
        return;
    }

    try {
        const token = await getAuthToken();
        if (!token) {
            throw new Error("No auth token");
        }

        const response = await fetch(`${API_BASE_URL}/user/pseudo`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ pseudo: newPseudo })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            profileFeedback.textContent = data.message || "Erreur lors de la modification.";
            profileFeedback.style.color = "#fda4af";
            return;
        }

        profileFeedback.textContent = `Pseudo modifié avec succès ✅`;
        profileFeedback.style.color = "#86efac";
        currentPseudoDisplay.textContent = data.pseudo;
        updatePseudoForm.reset();
    } catch (error) {
        console.error("Erreur modification pseudo:", error);
        profileFeedback.textContent = "Impossible de modifier le pseudo pour le moment.";
        profileFeedback.style.color = "#fda4af";
    }
}

function renderFriendRequests(requests) {
    const requestList = document.querySelector(".request-list");
    if (!requestList) return;

    requestList.innerHTML = "";

    if (!requests || requests.length === 0) {
        requestList.innerHTML = `<p style="text-align: center; color: #a3a3a3; padding: 1rem;">Aucune demande en attente</p>`;
        return;
    }

    requests.forEach(request => {
        const pseudo = request.user?.pseudo || "Utilisateur inconnu";
        const userId = request.user?.id;

        const requestRow = document.createElement("article");
        requestRow.className = "request-row";

        requestRow.innerHTML = `
            <div>
                <strong>${pseudo}</strong>
                <p>Veut vous ajouter en ami</p>
            </div>
            <div class="request-actions">
                <button type="button" class="accept-btn" data-user-id="${userId}">Accepter</button>
                <button type="button" class="ghost-btn deny-btn" data-user-id="${userId}">Rejeter</button>
            </div>
        `;

        requestList.appendChild(requestRow);
    });

    requestList.querySelectorAll(".accept-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const userId = e.currentTarget.dataset.userId;
            const result = await acceptFriendRequest(userId);
            if (result.success) {
                await loadFriendsData();
            } else {
                alert("Erreur lors de l'acceptation de la demande");
            }
        });
    });

    requestList.querySelectorAll(".deny-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const userId = e.currentTarget.dataset.userId;
            const result = await denyFriendRequest(userId);
            if (result.success) {
                await loadFriendsData();
            } else {
                alert("Erreur lors du refus de la demande");
            }
        });
    });
}

function renderFriendsList(friends) {
    const friendsList = document.querySelector(".friends-list");
    if (!friendsList) return;

    friendsList.innerHTML = "";

    if (!friends || friends.length === 0) {
        friendsList.innerHTML = `<p style="text-align: center; color: #a3a3a3; padding: 1rem;">Aucun ami pour le moment</p>`;
        return;
    }

    friends.forEach(friend => {
        const pseudo = friend.user?.pseudo || "Utilisateur inconnu";

        const friendRow = document.createElement("article");
        friendRow.className = "friend-row";

        friendRow.innerHTML = `
            <div>
                <strong>${pseudo}</strong>
            </div>
            <button type="button" class="disabled-action">Défier</button>
        `;

        friendsList.appendChild(friendRow);
    });
}

function updateFriendsCounter(count) {
    const badge = document.querySelector(".friends.nav-link .nav-badge");
    if (badge) {
        badge.textContent = count;
        if (count === 0) {
            badge.classList.add("hidden");
        } else {
            badge.classList.remove("hidden");
        }
    }
}

function showInviteFeedback(message, isSuccess) {
    const addFriendCard = document.querySelector(".add-friend-card");
    let feedback = addFriendCard.querySelector(".invite-feedback");
    if (!feedback) {
        feedback = document.createElement("p");
        feedback.className = "invite-feedback";
        feedback.style.cssText = "font-size: 0.9rem; font-weight: 700; margin-top: 0.5rem; min-height: 1.25rem;";
        addFriendCard.appendChild(feedback);
    }
    feedback.textContent = message;
    feedback.style.color = isSuccess ? "#86efac" : "#fda4af";

    clearTimeout(feedback._timeout);
    feedback._timeout = setTimeout(() => { feedback.textContent = ""; }, 4000);
}

async function loadFriendsData() {
    try {
        const token = await getAuthToken();
        if (!token) return;

        const [friends, requests] = await Promise.all([
            fetchFriends(token),
            fetchFriendRequests(token)
        ]);

        renderFriendRequests(requests);
        renderFriendsList(friends);
        updateFriendsCounter(requests.length);
    } catch (error) {
        console.error("Error loading friends data:", error);
    }
}

function startPolling() {
    stopPolling();
    pollingInterval = setInterval(() => {
        loadFriendsData();
    }, 10000);
}

function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

function setupAddFriendForm() {
    const addFriendCard = document.querySelector(".add-friend-card");
    const inviteInput = addFriendCard.querySelector("input");
    const inviteButton = addFriendCard.querySelector("button");

    inviteButton.addEventListener("click", async () => {
        const pseudo = (inviteInput.value || "").trim();

        if (!pseudo) {
            showInviteFeedback("Entre un pseudo valide", false);
            return;
        }

        inviteButton.disabled = true;
        inviteButton.textContent = "Envoi...";

        const result = await sendFriendRequest(pseudo);

        if (result.success) {
            inviteInput.value = "";
            showInviteFeedback("Demande envoyée avec succès ✅", true);
        } else {
            showInviteFeedback(result.message || "Erreur lors de l'envoi de la demande", false);
        }

        inviteButton.disabled = false;
        inviteButton.textContent = "Envoyer";
    });

    inviteInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            inviteButton.click();
        }
    });
}

document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        stopPolling();
    } else {
        loadFriendsData();
        startPolling();
    }
});

document.addEventListener("DOMContentLoaded", () => {
    GlobalLoader.show();
    (async () => {
        try {
            lucide.createIcons();
            await loadUserPseudo();
            await loadFriendsData();
            updatePseudoForm.addEventListener("submit", updatePseudo);
            setupAddFriendForm();
            startPolling();
        } catch (error) {
            console.error("Erreur initialisation:", error);
        } finally {
            GlobalLoader.hide(true);
        }
    })();
});