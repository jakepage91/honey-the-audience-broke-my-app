document.addEventListener('DOMContentLoaded', function() {
    const resultsContainer = document.getElementById('results');
    const totalCountEl = document.getElementById('total-count');
    const versionEl = document.getElementById('version');
    const errorBanner = document.getElementById('error-banner');
    const errorText = document.getElementById('error-text');

    let errorCount = 0;

    function showError(message) {
        errorText.textContent = message;
        errorBanner.style.display = 'block';
    }

    function hideError() {
        errorBanner.style.display = 'none';
    }

    // Fetch and display version
    async function fetchVersion() {
        try {
            const response = await fetch('/version');
            if (response.ok) {
                const data = await response.json();
                versionEl.textContent = 'v' + data.version;
            }
        } catch (err) {
            console.error('Failed to fetch version:', err);
        }
    }

    fetchVersion();

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
            hideError();
        });

        eventSource.onerror = function(err) {
            console.error('SSE error:', err);
            showError('Connection lost. Retrying...');
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
                hideError();
            } else {
                showError('Failed to load results. Retrying...');
            }
        } catch (err) {
            console.error('Failed to fetch initial results:', err);
            showError('Connection error. Retrying...');
        }
    }

    fetchInitialResults();
    connectSSE();
});
