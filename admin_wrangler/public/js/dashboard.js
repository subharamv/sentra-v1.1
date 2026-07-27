(function () {
    const session = localStorage.getItem('admin_session');
    if (!session) {
        window.location.href = '/login.html';
        return;
    }

    document.getElementById('whoami').textContent =
        (localStorage.getItem('admin_name') || localStorage.getItem('admin_email') || '');

    let currentLeadRow = null;

    function logout() {
        localStorage.removeItem('admin_session');
        localStorage.removeItem('admin_name');
        localStorage.removeItem('admin_role');
        localStorage.removeItem('admin_email');
        window.location.href = '/login.html';
    }
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function apiCall(endpoint, options = {}) {
        const res = await fetch(endpoint, {
            ...options,
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + session,
                ...options.headers
            }
        });
        if (res.status === 401) {
            logout();
            return null;
        }
        return res.json();
    }

    function setActiveNav(page) {
        document.querySelectorAll('.nav-item[data-page]').forEach(a => {
            a.classList.toggle('active', a.dataset.page === page);
        });
    }

    function openModal(id) { document.getElementById(id).classList.add('open'); }
    function closeModal(id) { document.getElementById(id).classList.remove('open'); }
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
    });

    const mainContent = document.getElementById('mainContent');

    // ─── Overview ───────────────────────────────────────────────────────────
    async function renderDashboard() {
        mainContent.innerHTML = '<div class="loading"><div class="spinner"></div> Loading...</div>';
        const stats = await apiCall('/api/stats');
        if (!stats || stats.error) return;

        mainContent.innerHTML = `
            <div class="page-header">
                <h1>Dashboard Overview</h1>
                <button class="refresh-btn" id="refreshBtn">↻ Refresh</button>
            </div>
            <div class="stats-grid">
                <div class="stat-card primary">
                    <div class="stat-label">Total Contact Leads</div>
                    <div class="stat-value">${stats.totalLeads}</div>
                </div>
                <div class="stat-card warning">
                    <div class="stat-label">New Leads</div>
                    <div class="stat-value">${stats.newLeads}</div>
                </div>
                <div class="stat-card success">
                    <div class="stat-label">Newsletter Subscribers</div>
                    <div class="stat-value">${stats.totalSubscribers}</div>
                </div>
                <div class="stat-card info">
                    <div class="stat-label">Chatbot Leads</div>
                    <div class="stat-value">${stats.totalChatLeads}</div>
                </div>
                <div class="stat-card" style="border-left: 3px solid var(--success);">
                    <div class="stat-label">Active Chats</div>
                    <div class="stat-value" style="color: var(--success);">${stats.activeChats}</div>
                </div>
                <div class="stat-card primary">
                    <div class="stat-label">Brochure Downloads</div>
                    <div class="stat-value">${stats.totalBrochureDownloads || 0}</div>
                </div>
            </div>
            <div class="table-container">
                <div class="table-header"><h2>Recent Activity</h2></div>
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <h3>Dashboard is ready</h3>
                    <p>Navigate to specific sections to view detailed data</p>
                </div>
            </div>
        `;
        document.getElementById('refreshBtn').addEventListener('click', renderDashboard);
    }

    // ─── Contact Leads ──────────────────────────────────────────────────────
    async function renderLeads() {
        mainContent.innerHTML = '<div class="loading"><div class="spinner"></div> Loading leads...</div>';
        const data = await apiCall('/api/leads');
        if (!data || data.error) return;

        let rows = '';
        data.leads.forEach(lead => {
            const statusClass = (lead.status || 'new').toLowerCase().replace(/\s+/g, '-');
            rows += `
                <tr>
                    <td>${lead.id}</td>
                    <td>${escapeHtml(lead.timestamp)}</td>
                    <td>${escapeHtml(lead.firstName)} ${escapeHtml(lead.lastName)}</td>
                    <td>${escapeHtml(lead.email)}</td>
                    <td>${escapeHtml(lead.subject)}</td>
                    <td>${escapeHtml(lead.leadType)}</td>
                    <td>${escapeHtml(lead.productInterest)}</td>
                    <td><span class="status-badge status-${statusClass}">${escapeHtml(lead.status)}</span></td>
                    <td>
                        <button class="action-btn btn-info" data-view-message data-row="${lead.id - 1}">View</button>
                        <button class="action-btn btn-warning" data-update-status data-row="${lead.id - 1}">Update</button>
                    </td>
                </tr>
            `;
        });

        mainContent.innerHTML = `
            <div class="page-header">
                <h1>Contact Leads (${data.total})</h1>
                <button class="refresh-btn" id="refreshBtn">↻ Refresh</button>
            </div>
            <div class="table-container">
                <div class="table-header">
                    <h2>All Contact Form Submissions</h2>
                    <div class="search-box">
                        <input type="text" id="searchInput" placeholder="Search leads...">
                    </div>
                </div>
                <div style="overflow-x: auto;">
                    <table id="leadsTable">
                        <thead>
                            <tr>
                                <th>#</th><th>Date (IST)</th><th>Name</th><th>Email</th>
                                <th>Subject</th><th>Lead Type</th><th>Product</th><th>Status</th><th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;

        document.getElementById('refreshBtn').addEventListener('click', renderLeads);
        document.getElementById('searchInput').addEventListener('keyup', (e) => filterTable(e.target, 'leadsTable'));
        mainContent.querySelectorAll('[data-view-message]').forEach(btn => {
            btn.addEventListener('click', () => {
                const lead = data.leads[Number(btn.dataset.row)];
                alert('Message:\n\n' + (lead ? lead.message : ''));
            });
        });
        mainContent.querySelectorAll('[data-update-status]').forEach(btn => {
            btn.addEventListener('click', () => {
                currentLeadRow = Number(btn.dataset.row);
                openModal('statusModal');
            });
        });
    }

    document.getElementById('saveStatusBtn').addEventListener('click', async () => {
        const status = document.getElementById('statusSelect').value;
        await apiCall('/api/leads/status', {
            method: 'POST',
            body: JSON.stringify({ row: currentLeadRow, status })
        });
        closeModal('statusModal');
        renderLeads();
    });

    // ─── Newsletter ─────────────────────────────────────────────────────────
    async function renderNewsletter() {
        mainContent.innerHTML = '<div class="loading"><div class="spinner"></div> Loading subscribers...</div>';
        const data = await apiCall('/api/newsletter');
        if (!data || data.error) return;

        let rows = '';
        data.subscribers.forEach(sub => {
            const statusClass = (sub.status || 'active').toLowerCase();
            rows += `
                <tr>
                    <td>${sub.id}</td>
                    <td>${escapeHtml(sub.timestamp)}</td>
                    <td>${escapeHtml(sub.email)}</td>
                    <td><span class="status-badge status-${statusClass}">${escapeHtml(sub.status)}</span></td>
                </tr>
            `;
        });

        mainContent.innerHTML = `
            <div class="page-header">
                <h1>Newsletter Subscribers (${data.total})</h1>
                <button class="refresh-btn" id="refreshBtn">↻ Refresh</button>
            </div>
            <div class="table-container">
                <div class="table-header">
                    <h2>All Newsletter Subscriptions</h2>
                    <div class="search-box"><input type="text" id="searchInput" placeholder="Search subscribers..."></div>
                </div>
                <div style="overflow-x: auto;">
                    <table id="subsTable">
                        <thead><tr><th>#</th><th>Date (IST)</th><th>Email</th><th>Status</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
        document.getElementById('refreshBtn').addEventListener('click', renderNewsletter);
        document.getElementById('searchInput').addEventListener('keyup', (e) => filterTable(e.target, 'subsTable'));
    }

    // ─── Brochure Downloads ─────────────────────────────────────────────────
    async function renderBrochureDownloads() {
        mainContent.innerHTML = '<div class="loading"><div class="spinner"></div> Loading brochure downloads...</div>';
        const data = await apiCall('/api/brochure-downloads');
        if (!data || data.error) return;

        let rows = '';
        data.downloads.forEach(dl => {
            rows += `
                <tr>
                    <td>${dl.id}</td>
                    <td>${escapeHtml(dl.timestamp)}</td>
                    <td>${escapeHtml(dl.fullName)}</td>
                    <td>${escapeHtml(dl.email)}</td>
                    <td>${escapeHtml(dl.phone)}</td>
                    <td>${escapeHtml(dl.company)}</td>
                    <td>${escapeHtml(dl.brochure)}</td>
                    <td>${escapeHtml(dl.sourcePage)}</td>
                    <td>
                        <button class="action-btn btn-info" data-view-info data-row="${dl.id - 1}">View</button>
                    </td>
                </tr>
            `;
        });

        mainContent.innerHTML = `
            <div class="page-header">
                <h1>Brochure Downloads (${data.total})</h1>
                <button class="refresh-btn" id="refreshBtn">↻ Refresh</button>
            </div>
            <div class="table-container">
                <div class="table-header">
                    <h2>All Brochure Download Requests</h2>
                    <div class="search-box"><input type="text" id="searchInput" placeholder="Search downloads..."></div>
                </div>
                <div style="overflow-x: auto;">
                    <table id="brochureTable">
                        <thead>
                            <tr>
                                <th>#</th><th>Date (IST)</th><th>Full Name</th><th>Email</th>
                                <th>Phone</th><th>Company</th><th>Brochure</th><th>Source Page</th><th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
        document.getElementById('refreshBtn').addEventListener('click', renderBrochureDownloads);
        document.getElementById('searchInput').addEventListener('keyup', (e) => filterTable(e.target, 'brochureTable'));
        mainContent.querySelectorAll('[data-view-info]').forEach(btn => {
            btn.addEventListener('click', () => {
                const dl = data.downloads[Number(btn.dataset.row)];
                alert('Additional Information:\n\n' + (dl && dl.info ? dl.info : '(none)'));
            });
        });
    }

    // ─── Chatbot Leads ──────────────────────────────────────────────────────
    async function renderChatbotLeads() {
        mainContent.innerHTML = '<div class="loading"><div class="spinner"></div> Loading chatbot leads...</div>';
        const data = await apiCall('/api/chatbot-leads');
        if (!data || data.error) return;

        let rows = '';
        data.leads.forEach(lead => {
            const statusClass = (lead.status || 'new').toLowerCase();
            rows += `
                <tr>
                    <td>${lead.id}</td>
                    <td>${escapeHtml(lead.timestamp)}</td>
                    <td>${escapeHtml(lead.name)}</td>
                    <td>${escapeHtml(lead.email)}</td>
                    <td><span class="status-badge status-${statusClass}">${escapeHtml(lead.status)}</span></td>
                </tr>
            `;
        });

        mainContent.innerHTML = `
            <div class="page-header">
                <h1>Chatbot Leads (${data.total})</h1>
                <button class="refresh-btn" id="refreshBtn">↻ Refresh</button>
            </div>
            <div class="table-container">
                <div class="table-header">
                    <h2>All Chatbot Registrations</h2>
                    <div class="search-box"><input type="text" id="searchInput" placeholder="Search leads..."></div>
                </div>
                <div style="overflow-x: auto;">
                    <table id="chatLeadsTable">
                        <thead><tr><th>#</th><th>Date (IST)</th><th>Name</th><th>Email</th><th>Status</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
        document.getElementById('refreshBtn').addEventListener('click', renderChatbotLeads);
        document.getElementById('searchInput').addEventListener('keyup', (e) => filterTable(e.target, 'chatLeadsTable'));
    }

    // ─── Live Chat ──────────────────────────────────────────────────────────
    async function renderChat() {
        mainContent.innerHTML = '<div class="loading"><div class="spinner"></div> Loading chat sessions...</div>';
        const data = await apiCall('/api/chat-sessions');
        if (!data || data.error) return;

        let sessionsHtml = '';
        data.sessions.forEach((s, idx) => {
            const time = s.lastTimestamp ? new Date(s.lastTimestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '';
            sessionsHtml += `
                <div class="chat-session-item" data-session-idx="${idx}">
                    <div class="session-name">${escapeHtml(s.leadName || 'Anonymous')}</div>
                    <div class="session-email">${escapeHtml(s.leadEmail)}</div>
                    <div class="session-preview">${escapeHtml(s.lastMessage)}</div>
                    <div class="session-time">${time} · ${s.messageCount} messages</div>
                </div>
            `;
        });

        mainContent.innerHTML = `
            <div class="page-header">
                <h1>Live Chat</h1>
                <button class="refresh-btn" id="refreshBtn">↻ Refresh</button>
            </div>
            <div class="chat-layout">
                <div class="chat-sessions-list">
                    <div style="padding: 16px; border-bottom: 1px solid var(--border); font-weight: 600;">
                        Chat Sessions (${data.total})
                    </div>
                    ${sessionsHtml || '<div class="empty-state"><p>No active chat sessions</p></div>'}
                </div>
                <div class="chat-view">
                    <div class="no-chat-selected">Select a chat session to view messages</div>
                </div>
            </div>
        `;
        document.getElementById('refreshBtn').addEventListener('click', renderChat);
        mainContent.querySelectorAll('[data-session-idx]').forEach(el => {
            el.addEventListener('click', () => {
                const s = data.sessions[Number(el.dataset.sessionIdx)];
                loadChatMessages(s.sessionId, s.leadName, s.leadEmail);
            });
        });
    }

    async function loadChatMessages(sessionId, leadName, leadEmail) {
        const data = await apiCall('/api/chat-messages/' + encodeURIComponent(sessionId));
        if (!data || data.error) return;

        let messagesHtml = '';
        data.messages.forEach(msg => {
            const isAgent = msg.sender === 'agent';
            messagesHtml += `
                <div class="chat-message ${isAgent ? 'agent' : 'user'}">
                    <div class="message-sender">${isAgent ? 'Agent (You)' : escapeHtml(msg.leadName || 'User')}</div>
                    ${escapeHtml(msg.message)}
                </div>
            `;
        });

        const chatView = document.querySelector('.chat-view');
        chatView.innerHTML = `
            <div class="chat-view-header">
                <div>
                    <h3>${escapeHtml(leadName || 'Anonymous')}</h3>
                    <div style="font-size: 12px; color: var(--text-muted);">${escapeHtml(leadEmail)}</div>
                </div>
                <button class="action-btn btn-danger" id="endChatBtn">End Chat</button>
            </div>
            <div class="chat-messages" id="chatMessages">${messagesHtml || '<div class="empty-state"><p>No messages yet</p></div>'}</div>
            <div class="chat-input-area">
                <input type="text" id="agentMessage" placeholder="Type your response...">
                <button class="btn btn-primary" id="sendAgentBtn">Send</button>
            </div>
        `;

        const chatMessagesEl = document.getElementById('chatMessages');
        if (chatMessagesEl) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;

        document.getElementById('endChatBtn').addEventListener('click', () => endChat(sessionId));
        document.getElementById('sendAgentBtn').addEventListener('click', () => sendAgentMessage(sessionId, leadName, leadEmail));
        document.getElementById('agentMessage').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendAgentMessage(sessionId, leadName, leadEmail);
        });
    }

    async function sendAgentMessage(sessionId, leadName, leadEmail) {
        const input = document.getElementById('agentMessage');
        const message = input.value.trim();
        if (!message) return;

        await apiCall('/api/chat-send', {
            method: 'POST',
            body: JSON.stringify({ sessionId, message, leadName, leadEmail })
        });

        input.value = '';
        loadChatMessages(sessionId, leadName, leadEmail);
    }

    async function endChat(sessionId) {
        if (confirm('End this chat session?')) {
            await apiCall('/api/chat-end', {
                method: 'POST',
                body: JSON.stringify({ sessionId })
            });
            renderChat();
        }
    }

    // ─── Manage Accounts ────────────────────────────────────────────────────
    async function renderAccounts() {
        mainContent.innerHTML = '<div class="loading"><div class="spinner"></div> Loading accounts...</div>';
        const data = await apiCall('/api/accounts');
        if (!data || data.error) return;

        let rows = '';
        data.accounts.forEach(acc => {
            const roleClass = (acc.role || 'admin').toLowerCase().replace(/\s+/g, '');
            rows += `
                <tr>
                    <td>${escapeHtml(acc.name)}</td>
                    <td>${escapeHtml(acc.email)}</td>
                    <td><span class="status-badge status-${roleClass}">${escapeHtml(acc.role || 'Admin')}</span></td>
                </tr>
            `;
        });

        mainContent.innerHTML = `
            <div class="page-header">
                <h1>Manage Accounts (${data.total})</h1>
                <div style="display:flex; gap:12px;">
                    <button class="refresh-btn" id="refreshBtn">↻ Refresh</button>
                    <button class="btn btn-primary" id="addAccountBtn" style="width:auto;">+ Add Account</button>
                </div>
            </div>
            <div class="table-container">
                <div class="table-header"><h2>Admin Accounts</h2></div>
                <div style="overflow-x: auto;">
                    <table id="accountsTable">
                        <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
        document.getElementById('refreshBtn').addEventListener('click', renderAccounts);
        document.getElementById('addAccountBtn').addEventListener('click', () => {
            document.getElementById('newAccountName').value = '';
            document.getElementById('newAccountEmail').value = '';
            document.getElementById('newAccountPassword').value = '';
            document.getElementById('newAccountRole').value = 'Admin';
            document.getElementById('accountErrorMsg').style.display = 'none';
            openModal('accountModal');
        });
    }

    document.getElementById('saveAccountBtn').addEventListener('click', async () => {
        const name = document.getElementById('newAccountName').value.trim();
        const email = document.getElementById('newAccountEmail').value.trim();
        const password = document.getElementById('newAccountPassword').value;
        const role = document.getElementById('newAccountRole').value;
        const errorEl = document.getElementById('accountErrorMsg');
        errorEl.style.display = 'none';

        if (!name || !email || !password) {
            errorEl.textContent = 'Name, email and password are required.';
            errorEl.style.display = 'block';
            return;
        }

        const result = await apiCall('/api/accounts', {
            method: 'POST',
            body: JSON.stringify({ name, email, password, role })
        });

        if (!result || result.error) {
            errorEl.textContent = (result && result.error) || 'Failed to create account';
            errorEl.style.display = 'block';
            return;
        }

        closeModal('accountModal');
        renderAccounts();
    });

    // ─── Helpers ────────────────────────────────────────────────────────────
    function filterTable(input, tableId) {
        const query = input.value.toLowerCase();
        const rows = document.querySelectorAll('#' + tableId + ' tbody tr');
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(query) ? '' : 'none';
        });
    }

    // ─── Router ─────────────────────────────────────────────────────────────
    const routes = {
        dashboard: renderDashboard,
        leads: renderLeads,
        newsletter: renderNewsletter,
        brochures: renderBrochureDownloads,
        chatbot: renderChatbotLeads,
        chat: renderChat,
        accounts: renderAccounts
    };

    function handleRoute() {
        const page = (location.hash.replace('#/', '') || 'dashboard');
        const renderFn = routes[page] || renderDashboard;
        setActiveNav(routes[page] ? page : 'dashboard');
        renderFn();
    }

    window.addEventListener('hashchange', handleRoute);
    if (!location.hash) location.hash = '#/dashboard';
    handleRoute();
})();
