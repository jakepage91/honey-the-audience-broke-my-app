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

    // Conference logo support
    function loadConferenceLogo() {
        const params = new URLSearchParams(window.location.search);
        const conf = params.get('conf');
        const logoEl = document.getElementById('conference-logo');
        const logoImg = document.getElementById('logo-img');

        const conferenceLogos = {
            'sreday': '/static/logos/sreday.png',
            'kubecon': '/static/logos/kubecon.png',
            'devopsdays': '/static/logos/devopsdays.png'
        };

        if (conf && conferenceLogos[conf]) {
            logoImg.src = conferenceLogos[conf];
            logoImg.alt = conf.toUpperCase() + ' Conference';
            logoEl.style.display = 'block';
        }
    }

    loadConferenceLogo();

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
                    showError('⚠️ DATABASE CONNECTION POOL EXHAUSTED! All connections are in use due to the referral bug. The app is broken!');
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
