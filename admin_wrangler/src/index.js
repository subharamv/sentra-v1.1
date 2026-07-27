/**
 * Sentra Admin Dashboard - Cloudflare Worker (API)
 *
 * The frontend is a static HTML/CSS/JS bundle served via Workers Assets
 * (see admin/public/ and the [assets] block in wrangler.toml). This Worker
 * only answers /api/* requests; everything else falls through to the
 * static asset handler configured in wrangler.toml.
 *
 * Features:
 * - Login authentication (against the "Manage Accounts" Google Sheet)
 * - Contact Leads tracking
 * - Newsletter Subscribers tracking
 * - Chatbot Leads tracking
 * - Live Chat management
 * - Lead Status management
 * - Admin account management (Manage Accounts sheet)
 *
 * Required Secrets:
 * - GOOGLE_SERVICE_ACCOUNT_EMAIL
 * - GOOGLE_PRIVATE_KEY
 */

const SPREADSHEET_ID = '1zBN7bSYfOl9MqyI34o5TwA02qhATqt5Wz7JhZLOx8qo';
const SHEET_CONTACTS = 'Contact Leads';
const SHEET_NEWSLETTER = 'Newsletter Subscribers';
const SHEET_CHATBOT_LEADS = 'Chatbot Leads';
const SHEET_CHAT_HISTORY = 'Chat History';
const SHEET_ACCOUNTS = 'Manage Accounts';
const SHEET_BROCHURE_DOWNLOADS = 'Brochure Downloads';

const CONTACT_HEADERS = ['Timestamp', 'First Name', 'Last Name', 'Email', 'Subject', 'Lead Type', 'Product Interest', 'Solution Interest', 'Timeline', 'Message', 'Status'];
const NEWSLETTER_HEADERS = ['Timestamp', 'Email', 'Status'];
const CHATBOT_LEADS_HEADERS = ['Timestamp', 'Name', 'Email', 'Status'];
const CHAT_HISTORY_HEADERS = ['Session ID', 'Timestamp', 'Lead Name', 'Lead Email', 'Message', 'Sender', 'Status'];
const ACCOUNTS_HEADERS = ['Email', 'Password Hash', 'Name', 'Role', 'Created At'];
const BROCHURE_DOWNLOADS_HEADERS = ['Timestamp', 'Full Name', 'Email', 'Contact Phone', 'Company / Institute', 'Additional Information', 'Brochure', 'Source Page'];

// The very first admin account, seeded into the "Manage Accounts" sheet
// the first time the sheet is empty. The plaintext password below is only
// ever used to compute the stored hash - it is never written to the sheet.
const DEFAULT_ADMIN_EMAIL = 'subharam.v@clovetech.com';
const DEFAULT_ADMIN_PASSWORD = 'Yuva8856@';
const DEFAULT_ADMIN_NAME = 'Subharam V';
const DEFAULT_ADMIN_ROLE = 'Super Admin';

// ─── Google Sheets JWT Auth ────────────────────────────────────────────────────

function b64url(str) {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlBuf(buffer) {
    const bytes = new Uint8Array(buffer);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return b64url(s);
}

function pemToDer(pem) {
    const b64 = pem
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/\s+/g, '');
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
}

async function getGoogleAccessToken(env) {
    const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const pem = (env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    if (!email || !pem) throw new Error('Missing Google credentials');

    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({
        iss: email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    }));

    const sigInput = `${header}.${payload}`;
    const key = await crypto.subtle.importKey(
        'pkcs8', pemToDer(pem),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false, ['sign']
    );
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(sigInput));
    const jwt = `${sigInput}.${b64urlBuf(sig)}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt
        })
    });
    const data = await res.json();
    if (!data.access_token) throw new Error('Google token error: ' + JSON.stringify(data));
    return data.access_token;
}

// ─── Sheets Helpers ────────────────────────────────────────────────────────────

async function sheetsGet(token, range) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Sheets GET error ${res.status}`);
    const data = await res.json();
    return data.values || [];
}

async function sheetsAppend(token, sheetName, row) {
    const range = encodeURIComponent(`${sheetName}!A:A`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [row] })
    });
    if (!res.ok) throw new Error(`Sheets append error ${res.status}`);
    return res.json();
}

async function sheetsUpdate(token, range, rows) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    const res = await fetch(url, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: rows })
    });
    if (!res.ok) throw new Error(`Sheets update error ${res.status}`);
    return res.json();
}

async function ensureSheetExists(token, title, headers) {
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!metaRes.ok) throw new Error(`Sheets meta error`);
    const meta = await metaRes.json();
    const exists = (meta.sheets || []).some(s => s.properties.title === title);

    if (!exists) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] })
        });
    }

    const rows = await sheetsGet(token, `${title}!A1:Z1`);
    if (rows.length === 0) {
        await sheetsAppend(token, title, headers);
    }
}

// ─── Password Hashing (PBKDF2-SHA256) ──────────────────────────────────────────

async function derivePbkdf2(password, saltB64, iterations) {
    const enc = new TextEncoder();
    const saltBytes = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
        keyMaterial,
        256
    );
    return b64urlBuf(bits);
}

async function createPasswordHash(password) {
    const iterations = 100000;
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const saltB64 = btoa(String.fromCharCode(...saltBytes));
    const hash = await derivePbkdf2(password, saltB64, iterations);
    return `pbkdf2$${iterations}$${saltB64}$${hash}`;
}

async function verifyPassword(password, stored) {
    if (!stored) return false;
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
    const iterations = parseInt(parts[1], 10);
    const saltB64 = parts[2];
    const expectedHash = parts[3];
    const actualHash = await derivePbkdf2(password, saltB64, iterations);
    if (actualHash.length !== expectedHash.length) return false;
    let diff = 0;
    for (let i = 0; i < actualHash.length; i++) {
        diff |= actualHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
    }
    return diff === 0;
}

// ─── Accounts Helpers ──────────────────────────────────────────────────────────

async function ensureDefaultAdmin(token) {
    const rows = await sheetsGet(token, `${SHEET_ACCOUNTS}!A:E`);
    const hasAccounts = rows.slice(1).some(r => r[0]);
    if (!hasAccounts) {
        const hash = await createPasswordHash(DEFAULT_ADMIN_PASSWORD);
        await sheetsAppend(token, SHEET_ACCOUNTS, [
            DEFAULT_ADMIN_EMAIL, hash, DEFAULT_ADMIN_NAME, DEFAULT_ADMIN_ROLE, new Date().toISOString()
        ]);
    }
}

async function findAccountByEmail(token, email) {
    const rows = await sheetsGet(token, `${SHEET_ACCOUNTS}!A:E`);
    const target = (email || '').trim().toLowerCase();
    return rows.slice(1).find(r => (r[0] || '').trim().toLowerCase() === target) || null;
}

// ─── Session Management ────────────────────────────────────────────────────────

const sessions = new Map();

function generateSessionId() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

function createSession(email) {
    const sessionId = generateSessionId();
    sessions.set(sessionId, { email, createdAt: Date.now() });
    return sessionId;
}

function validateSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return null;
    if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
        sessions.delete(sessionId);
        return null;
    }
    return session;
}

// ─── CORS ──────────────────────────────────────────────────────────────────────

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
    };
}

function jsonRes(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
}

// ─── Auth Middleware ────────────────────────────────────────────────────────────

function getSessionId(request) {
    const cookie = request.headers.get('Cookie') || '';
    const cookieMatch = cookie.match(/admin_session=([^;]+)/);
    if (cookieMatch) return cookieMatch[1];

    const auth = request.headers.get('Authorization') || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7);

    const url = new URL(request.url);
    const token = url.searchParams.get('token');
    if (token) return token;

    return null;
}

function requireAuth(request) {
    const sessionId = getSessionId(request);
    return validateSession(sessionId);
}

// ─── Login Handler ─────────────────────────────────────────────────────────────

async function handleLogin(request, env) {
    try {
        const { email, password } = await request.json();
        if (!email || !password) return jsonRes({ error: 'Email and password are required' }, 400);

        const token = await getGoogleAccessToken(env);
        await ensureSheetExists(token, SHEET_ACCOUNTS, ACCOUNTS_HEADERS);
        await ensureDefaultAdmin(token);

        const account = await findAccountByEmail(token, email);
        if (!account) return jsonRes({ error: 'Invalid credentials' }, 401);

        const ok = await verifyPassword(password, account[1] || '');
        if (!ok) return jsonRes({ error: 'Invalid credentials' }, 401);

        const sessionId = createSession(account[0]);
        const res = jsonRes({
            success: true,
            sessionId,
            name: account[2] || '',
            role: account[3] || 'Admin',
            message: 'Login successful'
        });
        res.headers.append('Set-Cookie', `admin_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
        return res;
    } catch (e) {
        return jsonRes({ error: 'Login failed' }, 500);
    }
}

// ─── Accounts Handlers ──────────────────────────────────────────────────────────

async function handleGetAccounts(request, env) {
    const session = requireAuth(request);
    if (!session) return jsonRes({ error: 'Unauthorized' }, 401);

    try {
        const token = await getGoogleAccessToken(env);
        await ensureSheetExists(token, SHEET_ACCOUNTS, ACCOUNTS_HEADERS);
        await ensureDefaultAdmin(token);
        const rows = await sheetsGet(token, `${SHEET_ACCOUNTS}!A:E`);

        const accounts = rows.slice(1)
            .filter(r => r[0])
            .map(r => ({
                email: r[0] || '',
                name: r[2] || '',
                role: r[3] || 'Admin',
                createdAt: r[4] || ''
            }));

        return jsonRes({ accounts, total: accounts.length });
    } catch (e) {
        return jsonRes({ error: e.message }, 500);
    }
}

async function handleCreateAccount(request, env) {
    const session = requireAuth(request);
    if (!session) return jsonRes({ error: 'Unauthorized' }, 401);

    try {
        const { name, email, password, role } = await request.json();
        if (!name || !email || !password) {
            return jsonRes({ error: 'Name, email and password are required' }, 400);
        }

        const token = await getGoogleAccessToken(env);
        await ensureSheetExists(token, SHEET_ACCOUNTS, ACCOUNTS_HEADERS);

        const existing = await findAccountByEmail(token, email);
        if (existing) return jsonRes({ error: 'An account with that email already exists' }, 409);

        const hash = await createPasswordHash(password);
        await sheetsAppend(token, SHEET_ACCOUNTS, [
            email.trim(), hash, name.trim(), role === 'Super Admin' ? 'Super Admin' : 'Admin', new Date().toISOString()
        ]);

        return jsonRes({ success: true });
    } catch (e) {
        return jsonRes({ error: e.message }, 500);
    }
}

// ─── Data Handlers ─────────────────────────────────────────────────────────────

async function handleGetLeads(request, env) {
    const session = requireAuth(request);
    if (!session) return jsonRes({ error: 'Unauthorized' }, 401);

    try {
        const token = await getGoogleAccessToken(env);
        await ensureSheetExists(token, SHEET_CONTACTS, CONTACT_HEADERS);
        const rows = await sheetsGet(token, `${SHEET_CONTACTS}!A:K`);

        if (rows.length <= 1) return jsonRes({ leads: [], total: 0 });

        const leads = rows.slice(1).map((row, idx) => ({
            id: idx + 1,
            timestamp: row[0] ? new Date(row[0]).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
            firstName: row[1] || '',
            lastName: row[2] || '',
            email: row[3] || '',
            subject: row[4] || '',
            leadType: row[5] || '',
            productInterest: row[6] || '',
            solutionInterest: row[7] || '',
            timeline: row[8] || '',
            message: row[9] || '',
            status: row[10] || 'New'
        }));

        return jsonRes({ leads, total: leads.length });
    } catch (e) {
        return jsonRes({ error: e.message }, 500);
    }
}

async function handleUpdateLeadStatus(request, env) {
    const session = requireAuth(request);
    if (!session) return jsonRes({ error: 'Unauthorized' }, 401);

    try {
        const { row, status } = await request.json();
        const token = await getGoogleAccessToken(env);
        await sheetsUpdate(token, `${SHEET_CONTACTS}!K${row + 2}`, [[status]]);
        return jsonRes({ success: true });
    } catch (e) {
        return jsonRes({ error: e.message }, 500);
    }
}

async function handleGetNewsletter(request, env) {
    const session = requireAuth(request);
    if (!session) return jsonRes({ error: 'Unauthorized' }, 401);

    try {
        const token = await getGoogleAccessToken(env);
        await ensureSheetExists(token, SHEET_NEWSLETTER, NEWSLETTER_HEADERS);
        const rows = await sheetsGet(token, `${SHEET_NEWSLETTER}!A:C`);

        if (rows.length <= 1) return jsonRes({ subscribers: [], total: 0 });

        const subscribers = rows.slice(1).map((row, idx) => ({
            id: idx + 1,
            timestamp: row[0] ? new Date(row[0]).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
            email: row[1] || '',
            status: row[2] || 'Active'
        }));

        return jsonRes({ subscribers, total: subscribers.length });
    } catch (e) {
        return jsonRes({ error: e.message }, 500);
    }
}

async function handleGetBrochureDownloads(request, env) {
    const session = requireAuth(request);
    if (!session) return jsonRes({ error: 'Unauthorized' }, 401);

    try {
        const token = await getGoogleAccessToken(env);
        await ensureSheetExists(token, SHEET_BROCHURE_DOWNLOADS, BROCHURE_DOWNLOADS_HEADERS);
        const rows = await sheetsGet(token, `${SHEET_BROCHURE_DOWNLOADS}!A:H`);

        if (rows.length <= 1) return jsonRes({ downloads: [], total: 0 });

        const downloads = rows.slice(1).map((row, idx) => ({
            id: idx + 1,
            timestamp: row[0] ? new Date(row[0]).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
            fullName: row[1] || '',
            email: row[2] || '',
            phone: row[3] || '',
            company: row[4] || '',
            info: row[5] || '',
            brochure: row[6] || '',
            sourcePage: row[7] || ''
        }));

        return jsonRes({ downloads, total: downloads.length });
    } catch (e) {
        return jsonRes({ error: e.message }, 500);
    }
}

async function handleGetChatbotLeads(request, env) {
    const session = requireAuth(request);
    if (!session) return jsonRes({ error: 'Unauthorized' }, 401);

    try {
        const token = await getGoogleAccessToken(env);
        await ensureSheetExists(token, SHEET_CHATBOT_LEADS, CHATBOT_LEADS_HEADERS);
        const rows = await sheetsGet(token, `${SHEET_CHATBOT_LEADS}!A:D`);

        if (rows.length <= 1) return jsonRes({ leads: [], total: 0 });

        const leads = rows.slice(1).map((row, idx) => ({
            id: idx + 1,
            timestamp: row[0] ? new Date(row[0]).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
            name: row[1] || '',
            email: row[2] || '',
            status: row[3] || 'New'
        }));

        return jsonRes({ leads, total: leads.length });
    } catch (e) {
        return jsonRes({ error: e.message }, 500);
    }
}

// ─── Chat History Handlers ─────────────────────────────────────────────────────

async function handleGetChatSessions(request, env) {
    const session = requireAuth(request);
    if (!session) return jsonRes({ error: 'Unauthorized' }, 401);

    try {
        const token = await getGoogleAccessToken(env);
        await ensureSheetExists(token, SHEET_CHAT_HISTORY, CHAT_HISTORY_HEADERS);
        const rows = await sheetsGet(token, `${SHEET_CHAT_HISTORY}!A:F`);

        if (rows.length <= 1) return jsonRes({ sessions: [], total: 0 });

        const sessionMap = new Map();
        rows.slice(1).forEach(row => {
            const sessionId = row[0];
            if (!sessionMap.has(sessionId)) {
                sessionMap.set(sessionId, {
                    sessionId,
                    leadName: row[2] || '',
                    leadEmail: row[3] || '',
                    lastMessage: row[4] || '',
                    lastTimestamp: row[1] || '',
                    status: row[5] || 'active',
                    messageCount: 0
                });
            }
            const s = sessionMap.get(sessionId);
            s.messageCount++;
            if (row[1] > s.lastTimestamp) {
                s.lastTimestamp = row[1];
                s.lastMessage = row[4];
            }
        });

        const sessionsList = Array.from(sessionMap.values()).sort((a, b) =>
            new Date(b.lastTimestamp) - new Date(a.lastTimestamp)
        );

        return jsonRes({ sessions: sessionsList, total: sessionsList.length });
    } catch (e) {
        return jsonRes({ error: e.message }, 500);
    }
}

async function handleGetChatMessages(request, env, sessionId) {
    const session = requireAuth(request);
    if (!session) return jsonRes({ error: 'Unauthorized' }, 401);

    try {
        const token = await getGoogleAccessToken(env);
        const rows = await sheetsGet(token, `${SHEET_CHAT_HISTORY}!A:F`);

        const messages = rows.slice(1)
            .filter(row => row[0] === sessionId)
            .map(row => ({
                timestamp: row[1] || '',
                leadName: row[2] || '',
                leadEmail: row[3] || '',
                message: row[4] || '',
                sender: row[5] || 'user'
            }));

        return jsonRes({ messages });
    } catch (e) {
        return jsonRes({ error: e.message }, 500);
    }
}

async function handleSendAgentMessage(request, env) {
    const session = requireAuth(request);
    if (!session) return jsonRes({ error: 'Unauthorized' }, 401);

    try {
        const { sessionId, message, leadName, leadEmail } = await request.json();
        const token = await getGoogleAccessToken(env);

        await sheetsAppend(token, SHEET_CHAT_HISTORY, [
            sessionId,
            new Date().toISOString(),
            leadName || '',
            leadEmail || '',
            message,
            'agent'
        ]);

        return jsonRes({ success: true });
    } catch (e) {
        return jsonRes({ error: e.message }, 500);
    }
}

async function handleEndChat(request, env) {
    const session = requireAuth(request);
    if (!session) return jsonRes({ error: 'Unauthorized' }, 401);

    try {
        const { sessionId } = await request.json();
        const token = await getGoogleAccessToken(env);
        const rows = await sheetsGet(token, `${SHEET_CHAT_HISTORY}!A:F`);
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][0] === sessionId) {
                await sheetsUpdate(token, `${SHEET_CHAT_HISTORY}!F${i + 1}`, [['closed']]);
                break;
            }
        }
        return jsonRes({ success: true });
    } catch (e) {
        return jsonRes({ error: e.message }, 500);
    }
}

// ─── Dashboard Stats ───────────────────────────────────────────────────────────

async function handleGetStats(request, env) {
    const session = requireAuth(request);
    if (!session) return jsonRes({ error: 'Unauthorized' }, 401);

    try {
        const token = await getGoogleAccessToken(env);

        let totalLeads = 0, newLeads = 0;
        let totalSubscribers = 0;
        let totalChatLeads = 0, activeChats = 0;
        let totalBrochureDownloads = 0;

        try {
            await ensureSheetExists(token, SHEET_CONTACTS, CONTACT_HEADERS);
            const leads = await sheetsGet(token, `${SHEET_CONTACTS}!A:K`);
            totalLeads = Math.max(0, leads.length - 1);
            newLeads = leads.slice(1).filter(r => !r[10] || r[10] === 'New').length;
        } catch (e) { console.error('Stats leads error:', e.message); }

        try {
            await ensureSheetExists(token, SHEET_NEWSLETTER, NEWSLETTER_HEADERS);
            const subs = await sheetsGet(token, `${SHEET_NEWSLETTER}!A:C`);
            totalSubscribers = Math.max(0, subs.length - 1);
        } catch (e) { console.error('Stats newsletter error:', e.message); }

        try {
            await ensureSheetExists(token, SHEET_CHATBOT_LEADS, CHATBOT_LEADS_HEADERS);
            const chatLeads = await sheetsGet(token, `${SHEET_CHATBOT_LEADS}!A:D`);
            totalChatLeads = Math.max(0, chatLeads.length - 1);
        } catch (e) { console.error('Stats chatbot error:', e.message); }

        try {
            await ensureSheetExists(token, SHEET_CHAT_HISTORY, CHAT_HISTORY_HEADERS);
            const chats = await sheetsGet(token, `${SHEET_CHAT_HISTORY}!A:F`);
            const activeSessions = new Set();
            chats.slice(1).forEach(r => {
                if (r[5] !== 'closed') activeSessions.add(r[0]);
            });
            activeChats = activeSessions.size;
        } catch (e) { console.error('Stats chat history error:', e.message); }

        try {
            await ensureSheetExists(token, SHEET_BROCHURE_DOWNLOADS, BROCHURE_DOWNLOADS_HEADERS);
            const downloads = await sheetsGet(token, `${SHEET_BROCHURE_DOWNLOADS}!A:H`);
            totalBrochureDownloads = Math.max(0, downloads.length - 1);
        } catch (e) { console.error('Stats brochure downloads error:', e.message); }

        return jsonRes({
            totalLeads,
            newLeads,
            totalSubscribers,
            totalChatLeads,
            activeChats,
            totalBrochureDownloads
        });
    } catch (e) {
        return jsonRes({ error: e.message }, 500);
    }
}

// ─── Main Handler ──────────────────────────────────────────────────────────────

export default {
    async fetch(request, env, ctx) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders() });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        if (path === '/api/login' && request.method === 'POST') {
            return handleLogin(request, env);
        }

        if (path === '/api/accounts' && request.method === 'GET') {
            return handleGetAccounts(request, env);
        }

        if (path === '/api/accounts' && request.method === 'POST') {
            return handleCreateAccount(request, env);
        }

        if (path === '/api/stats' && request.method === 'GET') {
            return handleGetStats(request, env);
        }

        if (path === '/api/leads' && request.method === 'GET') {
            return handleGetLeads(request, env);
        }

        if (path === '/api/leads/status' && request.method === 'POST') {
            return handleUpdateLeadStatus(request, env);
        }

        if (path === '/api/newsletter' && request.method === 'GET') {
            return handleGetNewsletter(request, env);
        }

        if (path === '/api/brochure-downloads' && request.method === 'GET') {
            return handleGetBrochureDownloads(request, env);
        }

        if (path === '/api/chatbot-leads' && request.method === 'GET') {
            return handleGetChatbotLeads(request, env);
        }

        if (path === '/api/chat-sessions' && request.method === 'GET') {
            return handleGetChatSessions(request, env);
        }

        if (path.startsWith('/api/chat-messages/') && request.method === 'GET') {
            const sessionId = decodeURIComponent(path.split('/').pop());
            return handleGetChatMessages(request, env, sessionId);
        }

        if (path === '/api/chat-send' && request.method === 'POST') {
            return handleSendAgentMessage(request, env);
        }

        if (path === '/api/chat-end' && request.method === 'POST') {
            return handleEndChat(request, env);
        }

        if (path.startsWith('/api/')) {
            return jsonRes({ error: 'Not Found' }, 404);
        }

        // Redirect root to the static login page.
        if (path === '/' || path === '') {
            return Response.redirect(`${url.origin}/login.html`, 302);
        }

        // Anything else falls through to the static asset handler
        // configured via [assets] in wrangler.toml.
        if (env.ASSETS) {
            return env.ASSETS.fetch(request);
        }

        return jsonRes({ error: 'Not Found' }, 404);
    }
};
