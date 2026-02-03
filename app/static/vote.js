document.addEventListener('DOMContentLoaded', function() {
    const options = document.getElementById('options');
    const confirmation = document.getElementById('confirmation');
    const confirmChoice = document.getElementById('confirm-choice');

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

    async function submitVote(choice) {
        const referral = getReferralCode();
        const body = { choice };

        if (referral) {
            body.referral = referral;
        }

        try {
            const response = await fetch('/vote', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                showConfirmation(choice);
            } else {
                const error = await response.json();
                alert('Vote failed: ' + (error.detail || 'Unknown error'));
            }
        } catch (err) {
            alert('Network error. Please try again.');
            console.error('Vote error:', err);
        }
    }

    function showConfirmation(choice) {
        confirmChoice.textContent = '"' + choiceLabels[choice] + '"';
        options.style.display = 'none';
        confirmation.style.display = 'flex';
    }

    options.addEventListener('click', function(e) {
        const btn = e.target.closest('.option-btn');
        if (btn) {
            const choice = btn.dataset.choice;
            btn.disabled = true;
            btn.style.opacity = '0.6';
            submitVote(choice);
        }
    });
});
