/**
 * Shared "gated" brochure download modal.
 * Any element with data-brochure-download="<pdf path>" data-brochure-name="<display name>"
 * opens this modal, collects lead details, records them via the API, then
 * triggers the actual file download.
 */
(function () {
    var STYLE_ID = 'brochure-modal-styles';
    var MODAL_ID = 'brochureDownloadModal';
    var pending = null;

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '.bdl-overlay { position: fixed; inset: 0; z-index: 9999; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); padding: 1rem; }',
            '.bdl-overlay.open { display: flex; }',
            '.bdl-modal { position: relative; width: 100%; max-width: 440px; max-height: 90vh; overflow-y: auto; border-radius: 16px; background: #14151a; border: 1px solid rgba(255,255,255,0.08); padding: 2rem 1.75rem 1.75rem; box-shadow: 0 24px 60px rgba(0,0,0,0.4); }',
            'body.lightmode .bdl-modal { background: #fff; border-color: rgba(0,0,0,0.08); }',
            '.bdl-close { position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; border-radius: 50%; border: none; background: rgba(255,255,255,0.08); color: inherit; font-size: 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; }',
            'body.lightmode .bdl-close { background: rgba(0,0,0,0.06); }',
            '.bdl-title { font-size: 1.15rem; font-weight: 800; margin: 0 0 0.3rem; color: #fff; }',
            'body.lightmode .bdl-title { color: #111; }',
            '.bdl-sub { font-size: 0.82rem; opacity: 0.6; margin: 0 0 1.25rem; line-height: 1.5; }',
            '.bdl-field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.9rem; }',
            '.bdl-field label { font-size: 0.78rem; font-weight: 600; opacity: 0.75; }',
            '.bdl-field input, .bdl-field textarea { width: 100%; padding: 0.65rem 0.85rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: inherit; font-size: 0.87rem; outline: none; font-family: inherit; transition: border-color 0.2s ease; }',
            'body.lightmode .bdl-field input, body.lightmode .bdl-field textarea { border-color: rgba(0,0,0,0.12); background: rgba(0,0,0,0.02); }',
            '.bdl-field input:focus, .bdl-field textarea:focus { border-color: #f48120; }',
            '.bdl-field textarea { resize: vertical; min-height: 64px; }',
            '.bdl-error { display: none; font-size: 0.78rem; color: #ff6b6b; margin: -0.3rem 0 0.75rem; }',
            '.bdl-error.visible { display: block; }',
            '.bdl-submit { width: 100%; padding: 0.75rem 1rem; border-radius: 9px; border: none; background: #f48120; color: #fff; font-size: 0.88rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; transition: background 0.2s ease; }',
            '.bdl-submit:hover { background: #e07010; }',
            '.bdl-submit:disabled { opacity: 0.6; cursor: not-allowed; }'
        ].join('\n');
        document.head.appendChild(style);
    }

    function buildModal() {
        if (document.getElementById(MODAL_ID)) return;
        var overlay = document.createElement('div');
        overlay.id = MODAL_ID;
        overlay.className = 'bdl-overlay';
        overlay.innerHTML =
            '<div class="bdl-modal" role="dialog" aria-modal="true" aria-labelledby="bdlTitle">' +
                '<button type="button" class="bdl-close" aria-label="Close">&times;</button>' +
                '<h3 class="bdl-title" id="bdlTitle">Download Brochure</h3>' +
                '<p class="bdl-sub">Please fill in the details to download our presentation</p>' +
                '<form id="bdlForm" novalidate>' +
                    '<div class="bdl-field"><label for="bdlFullName">Full Name *</label><input type="text" id="bdlFullName" name="fullName" required autocomplete="name"></div>' +
                    '<div class="bdl-field"><label for="bdlEmail">Email *</label><input type="email" id="bdlEmail" name="email" required autocomplete="email"></div>' +
                    '<div class="bdl-field"><label for="bdlPhone">Contact Phone</label><input type="tel" id="bdlPhone" name="phone" autocomplete="tel"></div>' +
                    '<div class="bdl-field"><label for="bdlCompany">Company / Institute</label><input type="text" id="bdlCompany" name="company" autocomplete="organization"></div>' +
                    '<div class="bdl-field"><label for="bdlInfo">Additional Information</label><textarea id="bdlInfo" name="info"></textarea></div>' +
                    '<p class="bdl-error" id="bdlError"></p>' +
                    '<button type="submit" class="bdl-submit" id="bdlSubmitBtn"><i class="fa-solid fa-download"></i><span>Download Brochure</span></button>' +
                '</form>' +
            '</div>';
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
        overlay.querySelector('.bdl-close').addEventListener('click', closeModal);
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

        overlay.querySelector('#bdlForm').addEventListener('submit', onSubmit);
    }

    function openModal(brochureName, brochureUrl) {
        injectStyles();
        buildModal();
        pending = { name: brochureName, url: brochureUrl };
        var overlay = document.getElementById(MODAL_ID);
        overlay.querySelector('#bdlTitle').textContent = 'Download ' + brochureName;
        overlay.querySelector('#bdlError').classList.remove('visible');
        overlay.querySelector('#bdlForm').reset();
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
        setTimeout(function () { overlay.querySelector('#bdlFullName').focus(); }, 50);
    }

    function closeModal() {
        var overlay = document.getElementById(MODAL_ID);
        if (!overlay) return;
        overlay.classList.remove('open');
        document.body.style.overflow = '';
        pending = null;
    }

    function validateEmail(email) {
        return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
    }

    function triggerFileDownload(url) {
        var a = document.createElement('a');
        a.href = url;
        a.setAttribute('download', '');
        a.target = '_blank';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    async function onSubmit(e) {
        e.preventDefault();
        if (!pending) return;

        var form = e.target;
        var errorEl = document.getElementById('bdlError');
        var submitBtn = document.getElementById('bdlSubmitBtn');
        var fullName = form.fullName.value.trim();
        var email = form.email.value.trim();

        if (!fullName || !email || !validateEmail(email)) {
            errorEl.textContent = 'Please enter your full name and a valid email address.';
            errorEl.classList.add('visible');
            return;
        }
        errorEl.classList.remove('visible');

        var originalHtml = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Submitting…</span>';

        try {
            var apiUrl = window.__API_URL__ || (
                window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                    ? 'http://localhost:8787'
                    : 'https://veronica-sentra-prod.subharam-v.workers.dev'
            );

            var res = await fetch(apiUrl + '/api/brochure-download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fullName: fullName,
                    email: email,
                    phone: form.phone.value.trim(),
                    company: form.company.value.trim(),
                    info: form.info.value.trim(),
                    brochure: pending.name,
                    sourcePage: window.location.pathname
                })
            });

            if (!res.ok) {
                var data = await res.json().catch(function () { return {}; });
                throw new Error(data.error || 'Submission failed');
            }

            triggerFileDownload(pending.url);
            closeModal();
        } catch (err) {
            errorEl.textContent = 'Something went wrong. Please try again.';
            errorEl.classList.add('visible');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalHtml;
        }
    }

    document.addEventListener('click', function (e) {
        var trigger = e.target.closest('[data-brochure-download]');
        if (!trigger) return;
        e.preventDefault();
        var url = trigger.getAttribute('data-brochure-download');
        var name = trigger.getAttribute('data-brochure-name') || 'Brochure';
        openModal(name, url);
    });
})();
