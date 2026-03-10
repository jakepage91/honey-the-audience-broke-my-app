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

    // Conference config - add new conferences here
    const conferenceConfig = {
        'sreday': { logos: ['/static/logos/sreday.png'], city: 'NYC', greeting: 'SREDay' },
        'kubecon': { logos: ['/static/logos/kubecon.png'], city: 'NYC', greeting: 'KubeCon' },
        'devopsdays': { logos: ['/static/logos/devopsdays.png'], city: 'NYC', greeting: 'DevOpsDays' },
        'lisbon': { logos: ['/static/logos/cloud-native-lisbon.png', '/static/logos/aws-ug-lisbon.jpeg'], city: 'Lisbon', greeting: 'Lisbon' }
    };

    // Load conference logo(s)
    function loadConferenceLogo(conf) {
        if (!conf || !conferenceConfig[conf]) return;

        const config = conferenceConfig[conf];
        const logoEl = document.getElementById('conference-logo');
        logoEl.innerHTML = '';
        config.logos.forEach(function(src) {
            const img = document.createElement('img');
            img.src = src;
            img.alt = config.greeting + ' Conference';
            img.className = 'logo-img';
            logoEl.appendChild(img);
        });
        logoEl.style.display = 'flex';

        // Update page title with city
        if (config.city) {
            document.title = "Live Results - " + config.city + " Poll '26";
        }
    }

    // Fetch version and conference config from server
    async function fetchConfig() {
        try {
            const response = await fetch('/version');
            if (response.ok) {
                const data = await response.json();
                versionEl.textContent = data.version.startsWith('v') ? data.version : 'v' + data.version;

                // URL param overrides server config
                const params = new URLSearchParams(window.location.search);
                const conf = params.get('conf') || data.conference;
                loadConferenceLogo(conf);
            }
        } catch (err) {
            console.error('Failed to fetch config:', err);
        }
    }

    fetchConfig();

    let sseRetryCount = 0;

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
            sseRetryCount = 0;  // Reset retry count on success
        });

        eventSource.onerror = function(err) {
            console.error('SSE error:', err);
            sseRetryCount++;
            if (sseRetryCount > 3) {
                showError('⚠️ LIVE UPDATES FAILED! Database connection pool likely exhausted. The app cannot stream new votes.');
            } else {
                showError('Connection lost. Retrying...');
            }
            eventSource.close();
            setTimeout(connectSSE, 3000);
        };
    }

    async function fetchInitialResults() {
        try {
            const response = await fetch('/votes', {
                signal: AbortSignal.timeout(10000)  // 10s timeout
            });
            if (response.ok) {
                const data = await response.json();
                updateResults(data);
                hideError();
            } else if (response.status === 500) {
                showError('⚠️ DATABASE ERROR! Connection pool may be exhausted.');
            } else {
                showError('Failed to load results. Retrying...');
            }
        } catch (err) {
            console.error('Failed to fetch initial results:', err);
            if (err.name === 'TimeoutError') {
                showError('⏱️ REQUEST TIMED OUT! App is hanging - connection pool likely exhausted.');
            } else {
                showError('Connection error. Retrying...');
            }
        }
    }

    fetchInitialResults();
    connectSSE();
});
