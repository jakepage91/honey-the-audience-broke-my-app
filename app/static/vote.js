document.addEventListener('DOMContentLoaded', function() {
    const options = document.getElementById('options');
    const confirmation = document.getElementById('confirmation');
    const confirmChoice = document.getElementById('confirm-choice');
    const loading = document.getElementById('loading');
    const errorOverlay = document.getElementById('error');
    const errorMessage = document.getElementById('error-message');
    const retryBtn = document.getElementById('retry-btn');
    const versionEl = document.getElementById('version');

    let currentChoice = null;

    // Conference config - add new conferences here
    const conferenceConfig = {
        'sreday': { logo: '/static/logos/sreday.png', name: 'SREDay' },
        'kubecon': { logo: '/static/logos/kubecon.png', name: 'KubeCon' },
        'devopsdays': { logo: '/static/logos/devopsdays.png', name: 'DevOpsDays' }
    };

    // Load conference branding (logo + welcome banner)
    function loadConferenceBranding(conf) {
        if (!conf || !conferenceConfig[conf]) return;

        const config = conferenceConfig[conf];

        // Show logo
        const logoEl = document.getElementById('conference-logo');
        const logoImg = document.getElementById('logo-img');
        logoImg.src = config.logo;
        logoImg.alt = config.name + ' Conference';
        logoEl.style.display = 'block';

        // Show welcome banner
        const bannerEl = document.getElementById('welcome-banner');
        const nameEl = document.getElementById('conference-name');
        nameEl.textContent = config.name;
        bannerEl.style.display = 'block';
    }

    // Fetch version and conference config from server
    async function fetchConfig() {
        try {
            const response = await fetch('/version');
            if (response.ok) {
                const data = await response.json();
                versionEl.textContent = 'v' + data.version;

                // URL param overrides server config
                const params = new URLSearchParams(window.location.search);
                const conf = params.get('conf') || data.conference;
                loadConferenceBranding(conf);
            }
        } catch (err) {
            console.error('Failed to fetch config:', err);
        }
    }

    fetchConfig();

    const choiceLabels = {
        'print': 'Add more print statements',
        'stare': 'Stare at the code until it confesses',
        'ai': 'Ask an AI to explain it',
        'revert': 'Revert and pretend it never happened',
        'restart': 'Turn it off and on again'
    };

    function getReferralCode() {
        const params = new URLSearchParams(window.location.search);
        return params.get('referral');
    }

    function showLoading() {
        loading.style.display = 'flex';
    }

    function hideLoading() {
        loading.style.display = 'none';
    }

    function showError(message) {
        hideLoading();
        errorMessage.textContent = message;
        errorOverlay.style.display = 'flex';
    }

    function hideError() {
        errorOverlay.style.display = 'none';
    }

    async function submitVote(choice) {
        const referral = getReferralCode();
        const body = { choice };

        if (referral) {
            body.referral = referral;
        }

        showLoading();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);  // Increased to 20s

        try {
            const response = await fetch('/vote', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                hideLoading();
                showConfirmation(choice);
            } else {
                let errorDetail = 'Server returned an error';
                try {
                    const error = await response.json();
                    errorDetail = error.detail || errorDetail;
                } catch (e) {
                    // Response wasn't JSON, use status text
                    errorDetail = response.statusText || errorDetail;
                }

                if (response.status === 503) {
                    showError('⚠️ SERVICE DEGRADED! Referral cache exhausted - the app has a memory leak bug!');
                } else if (response.status === 500) {
                    showError('⚠️ SERVER ERROR: ' + errorDetail);
                } else {
                    showError('Vote failed: ' + errorDetail);
                }
            }
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                showError('⏱️ REQUEST TIMED OUT (20s)! The app is hanging - likely waiting for a database connection that will never come. Connection pool exhausted!');
            } else {
                showError('Network error. The connection failed.');
            }
            console.error('Vote error:', err);
        }
    }

    function showConfirmation(choice) {
        confirmChoice.textContent = '"' + choiceLabels[choice] + '"';
        options.style.display = 'none';
        confirmation.style.display = 'flex';
    }

    function resetVoting() {
        hideError();
        // Re-enable all buttons
        const buttons = options.querySelectorAll('.option-btn');
        buttons.forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
        });
    }

    options.addEventListener('click', function(e) {
        const btn = e.target.closest('.option-btn');
        if (btn) {
            currentChoice = btn.dataset.choice;
            btn.disabled = true;
            btn.style.opacity = '0.6';
            submitVote(currentChoice);
        }
    });

    retryBtn.addEventListener('click', function() {
        if (currentChoice) {
            resetVoting();
            submitVote(currentChoice);
        }
    });
});
