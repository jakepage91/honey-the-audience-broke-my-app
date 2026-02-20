document.addEventListener('DOMContentLoaded', function() {
    const options = document.getElementById('options');
    const confirmation = document.getElementById('confirmation');
    const confirmChoice = document.getElementById('confirm-choice');
    const loading = document.getElementById('loading');
    const errorOverlay = document.getElementById('error');
    const errorMessage = document.getElementById('error-message');
    const retryBtn = document.getElementById('retry-btn');

    let currentChoice = null;

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
        const timeoutId = setTimeout(() => controller.abort(), 5000);

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
                const error = await response.json();
                showError('Vote failed: ' + (error.detail || 'Server returned an error'));
            }
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                showError('Request timed out. The server might be overwhelmed or down.');
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
