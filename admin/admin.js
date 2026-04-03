async function fetchStats() {
    try {
        const res = await fetch('https://darkgoldenrod-frog-258465.hostingersite.com/admin/stats', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!res.ok) {
            console.error('Erreur lors de la récupération des stats');
            return;
        }

        const response = await res.json();
        
        if (response.success && response.data) {
            const data = response.data;
            
            document.getElementById('current-players').textContent = data.currentPlayers;
            document.getElementById('peak-24h').textContent = data.peak24h;
            document.getElementById('peak-all-time').textContent = data.peakAllTime;
            document.getElementById('players-in-queue').textContent = data.playersInQueue;
            document.getElementById('active-matches').textContent = data.activeMatches;
        }
    } catch (error) {
        console.error('Erreur:', error);
    }
}

fetchStats();
