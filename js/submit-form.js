function showToast(message, type) {
    var $existing = $('#sentra-toast');
    if ($existing.length) $existing.remove();

    var iconClass = type === 'success' ? 'fa-circle-check' : 'fa-circle-xmark';
    var $toast = $(
        '<div id="sentra-toast" class="sentra-toast sentra-toast-' + type + '">' +
        '<i class="fa-solid ' + iconClass + '"></i>' +
        '<span>' + message + '</span>' +
        '</div>'
    );
    $('body').append($toast);
    setTimeout(function () { $toast.addClass('visible'); }, 10);
    setTimeout(function () {
        $toast.removeClass('visible');
        setTimeout(function () { $toast.remove(); }, 400);
    }, 3500);
}

function initSubmitContact() {
    $('#contactForm').on('submit', async function (event) {
        event.preventDefault();

        var $form = $('#contactForm');
        var $submitButton = $('#finalSubmitBtn');
        var originalButtonHtml = $submitButton.text();

        if ($submitButton.prop('disabled')) return;

        var $email = $('#email');
        var $message = $('#message');
        var $successMessage = $('#success-message');
        var $errorMessage = $('#error-message');
        var $firstName = $('#first-name');
        var $lastName = $('#last-name');
        var $subject = $('#subject');
        var $timeline = $('#timeline');

        function validateEmail(email) {
            return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
        }

        if (!validateEmail($email.val()) || !$message.val().trim()) {
            goStep(3);
            $errorMessage.find('p').text('Please enter a valid email and message.');
            $errorMessage.removeClass('hidden');
            $successMessage.addClass('hidden');
            setTimeout(function () { $errorMessage.addClass('hidden'); }, 3000);
            return;
        }

        $submitButton.prop('disabled', true).text('Sending...');

        try {
            const apiUrl = window.__API_URL__ || (
                window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                    ? 'http://localhost:8787'
                    : 'https://veronica-sentra-prod.subharam-v.workers.dev'
            );

            var leadType = [];
            $('input[name="lead-type"]:checked').each(function() { leadType.push($(this).val()); });
            var productInterest = [];
            $('input[name="product-interest"]:checked').each(function() { productInterest.push($(this).val()); });
            var solutionInterest = [];
            $('input[name="solution-interest"]:checked').each(function() { solutionInterest.push($(this).val()); });

            var response = await fetch(apiUrl + '/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName: $firstName.val().trim(),
                    lastName: $lastName.val().trim(),
                    email: $email.val().trim(),
                    subject: $subject.val().trim(),
                    leadType: leadType.join(', '),
                    productInterest: productInterest.join(', '),
                    solutionInterest: solutionInterest.join(', '),
                    timeline: $timeline.val(),
                    message: $message.val().trim()
                })
            });

            var data = await response.json();

            if (response.status === 409 && data.duplicate) {
                $errorMessage.find('p').text('This message was already submitted. Please try a different message.');
                $errorMessage.removeClass('hidden');
                $successMessage.addClass('hidden');
                setTimeout(function () { $errorMessage.addClass('hidden'); }, 4000);
                $submitButton.prop('disabled', false).text(originalButtonHtml);
                return;
            }

            if (!response.ok) {
                throw new Error(data.error || 'Failed to submit contact form');
            }

            $errorMessage.addClass('hidden');
            $successMessage.removeClass('hidden');
            $form[0].reset();
            document.getElementById('productInterestGroup').style.display = 'none';
            document.getElementById('solutionInterestGroup').style.display = 'none';
            goStep(1);
            showToast('Your message has been sent successfully!', 'success');

            setTimeout(function () { $successMessage.addClass('hidden'); }, 3000);
        } catch (error) {
            $errorMessage.find('p').text('Oops! Form submission failed. Please try again.');
            $errorMessage.removeClass('hidden');
            $successMessage.addClass('hidden');
            setTimeout(function () { $errorMessage.addClass('hidden'); }, 3000);
        } finally {
            $submitButton.prop('disabled', false).text(originalButtonHtml);
        }
    });
}

function initSubmitNewsletter() {
    $('#newsletterForm').on('submit', async function (event) {
        event.preventDefault();

        var $form = $(this);
        var $email = $('#newsletter-email');
        var $submitBtn = $form.find('.btn-compact');
        var $errorDiv = $('#newsletter-error');
        var $errorP = $errorDiv.find('p');
        var $errorIcon = $errorDiv.find('span.cross-icon');

        function validateEmail(email) {
            return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
        }

        var emailVal = $email.val().trim();

        if (!emailVal) {
            $errorDiv.removeClass('info-alert').addClass('error');
            $errorIcon.html('<i class="fa-solid fa-xmark"></i>');
            $errorP.text('Please enter your email address.');
            $errorDiv.removeClass('hidden');
            setTimeout(function () { $errorDiv.addClass('hidden'); }, 3000);
            return;
        }

        if (!validateEmail(emailVal)) {
            $errorDiv.removeClass('info-alert').addClass('error');
            $errorIcon.html('<i class="fa-solid fa-xmark"></i>');
            $errorP.text('Invalid email format.');
            $errorDiv.removeClass('hidden');
            setTimeout(function () { $errorDiv.addClass('hidden'); }, 3000);
            return;
        }

        var originalHtml = $submitBtn.html();
        $submitBtn.prop('disabled', true).html('<span>Subscribing...</span>');

        try {
            const apiUrl = window.__API_URL__ || (
                window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                    ? 'http://localhost:8787'
                    : 'https://veronica-sentra-prod.subharam-v.workers.dev'
            );

            var response = await fetch(apiUrl + '/api/newsletter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailVal })
            });

            var data = await response.json();

            if (response.status === 409 && data.exists) {
                // Already subscribed
                $errorDiv.removeClass('error').addClass('info-alert');
                $errorIcon.html('<i class="fa-solid fa-circle-info"></i>');
                $errorP.text('Email already exists. Thank you!');
                $errorDiv.removeClass('hidden');
                $email.val('');
                setTimeout(function () { $errorDiv.addClass('hidden'); }, 4000);
                return;
            }

            if (!response.ok) {
                throw new Error(data.error || 'Subscription failed');
            }

            // Success
            $errorDiv.addClass('hidden');
            $email.val('');
            $submitBtn.html('<span>Thank you!</span><span class="btn-detail"><i class="fa-solid fa-check"></i></span>');
            $submitBtn.addClass('thankyou');
            showToast('Successfully subscribed to our newsletter!', 'success');

            setTimeout(function () {
                $submitBtn.html(originalHtml);
                $submitBtn.removeClass('thankyou');
            }, 3500);
        } catch (err) {
            $errorDiv.removeClass('info-alert').addClass('error');
            $errorIcon.html('<i class="fa-solid fa-xmark"></i>');
            $errorP.text('Failed. Please try again.');
            $errorDiv.removeClass('hidden');
            setTimeout(function () { $errorDiv.addClass('hidden'); }, 3000);
        } finally {
            $submitBtn.prop('disabled', false);
            if (!$submitBtn.hasClass('thankyou')) {
                $submitBtn.html(originalHtml);
            }
        }
    });
}
