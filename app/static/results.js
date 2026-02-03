document.addEventListener('DOMContentLoaded', function() {
    const resultsContainer = document.getElementById('results');
    const totalCountEl = document.getElementById('total-count');

    function updateResults(data) {
        let total = 0;
        let maxCount = 0;

        Object.keys(data).forEach(choice => {
            const count = data[choice].count;
            total += count;
            if (count > maxCount) maxCount = count;
        });

        Object.keys(data).forEach(choice => {
            const row = resultsContainer.querySelector(`[data-choice="${choice}"]`);
            if (row) {
                const bar = row.querySelector('.bar');
                const countEl = row.querySelector('.bar-count');
                const count = data[choice].count;

                const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
                bar.style.width = percentage + '%';
                countEl.textContent = count;
            }
        });

        totalCountEl.textContent = total;
    }

    function connectSSE() {
        const eventSource = new EventSource('/stream');

        eventSource.addEventListener('votes', function(event) {
            const data = JSON.parse(event.data);
            updateResults(data);
        });

        eventSource.onerror = function(err) {
            console.error('SSE error:', err);
            eventSource.close();
            setTimeout(connectSSE, 3000);
        };
    }

    async function fetchInitialResults() {
        try {
            const response = await fetch('/votes');
            if (response.ok) {
                const data = await response.json();
                updateResults(data);
            }
        } catch (err) {
            console.error('Failed to fetch initial results:', err);
        }
    }

    fetchInitialResults();
    connectSSE();
});
