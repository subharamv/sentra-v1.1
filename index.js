/**
 * Cloudflare Worker - Sentra Backend (Veronica + CRM)
 *
 * Endpoints:
 * - GET  /api/health         Health check
 * - POST /api/chat           Veronica chatbot
 * - POST /api/user-profile   User profile storage
 * - POST /api/contact        Contact form → Google Sheet
 * - POST /api/newsletter     Newsletter subscribe → Google Sheet
 *
 * Required Worker Secrets (set via `wrangler secret put`):
 * - OPENROUTER_API_KEY
 * - GOOGLE_SERVICE_ACCOUNT_EMAIL
 * - GOOGLE_PRIVATE_KEY
 *
 * Optional Secrets:
 * - MAILGUN_API_KEY
 * - MAILGUN_DOMAIN
 */

// ─── Config ────────────────────────────────────────────────────────────────────

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_NAME = 'nvidia/nemotron-3-super-120b-a12b:free'; // verified live via OpenRouter's /api/v1/models - 1M context, ~12B active params (MoE), high usage/availability
const RATE_LIMIT_REQUESTS = 60;
const RATE_LIMIT_WINDOW = 60000;

const SPREADSHEET_ID = '1zBN7bSYfOl9MqyI34o5TwA02qhATqt5Wz7JhZLOx8qo';
const SHEET_CONTACTS = 'Contact Leads';
const SHEET_NEWSLETTER = 'Newsletter Subscribers';
const SHEET_CHATBOT_LEADS = 'Chatbot Leads';
const SHEET_CHAT_HISTORY = 'Chat History'; // legacy, one row per message - left as-is, no longer written to
const SHEET_CHAT_CONVERSATIONS = 'Chat Conversations'; // current - one row per session, messages as JSON
const SHEET_LEAD_NOTES = 'Lead Notes';
const SHEET_BROCHURE_DOWNLOADS = 'Brochure Downloads';
const CONTACT_HEADERS = ['Timestamp', 'First Name', 'Last Name', 'Email', 'Subject', 'Lead Type', 'Product Interest', 'Solution Interest', 'Timeline', 'Message'];
const NEWSLETTER_HEADERS = ['Timestamp', 'Email'];
const BROCHURE_DOWNLOADS_HEADERS = ['Timestamp', 'Full Name', 'Email', 'Contact Phone', 'Company / Institute', 'Additional Information', 'Brochure', 'Source Page'];
const CHATBOT_LEADS_HEADERS = ['Timestamp', 'Name', 'Email'];
const CHAT_HISTORY_HEADERS = ['Session ID', 'Timestamp', 'Lead Name', 'Lead Email', 'Message', 'Sender', 'Status', 'Agent Name'];
const CHAT_CONVERSATIONS_HEADERS = ['Session ID', 'Lead Name', 'Lead Email', 'Status', 'Last Updated', 'Messages JSON'];
const LEAD_NOTES_HEADERS = ['Timestamp', 'Lead Row', 'Lead Email', 'Type', 'Content'];

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

// Reused across requests within the same isolate - Google tokens are valid
// for an hour, so minting a brand new one (RSA sign + a round trip to
// oauth2.googleapis.com) on every single request was pure waste and one of
// the biggest contributors to slow/rate-limited Sheets calls.
let cachedGoogleToken = null; // { token, expiresAt } - expiresAt in epoch seconds

async function getGoogleAccessToken(env) {
    const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const pem = (env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    if (!email || !pem) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY secret');

    const now = Math.floor(Date.now() / 1000);
    if (cachedGoogleToken && cachedGoogleToken.expiresAt > now) return cachedGoogleToken.token;

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
    cachedGoogleToken = { token: data.access_token, expiresAt: now + (data.expires_in || 3600) - 60 };
    return cachedGoogleToken.token;
}

// ─── Sheets Helpers ────────────────────────────────────────────────────────────
//
// Every poller (dashboard stats, chat sessions, chat messages, the public
// chat widget) used to mint a fresh Google OAuth token and re-verify sheet
// existence on every single request. Under normal traffic that meant a
// handful of Google API calls *per poll, per open tab* - which is what was
// blowing through Sheets' per-minute quota and making the dashboard/live
// chat feel slow or randomly fail. The caches below dedupe that: the OAuth
// token is reused until near expiry, "sheet exists" checks run once per
// isolate, and reads are cached for a few seconds and invalidated on write.

const SHEETS_READ_CACHE_TTL_MS = 4000;
const sheetsReadCache = new Map(); // range -> { data, expiresAt }

function invalidateSheetCache(sheetName) {
    for (const key of sheetsReadCache.keys()) {
        if (key.startsWith(`${sheetName}!`)) sheetsReadCache.delete(key);
    }
}

async function sheetsGet(token, range) {
    const cached = sheetsReadCache.get(range);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    // Google's default Sheets quota is a low 60 reads/min per user - under
    // real traffic (multiple open chats + admin dashboard polling) that's
    // still reachable even with caching, and without a retry a single
    // transient 429 used to fail the request outright (e.g. "can't open
    // chat history"). Retry with backoff instead of surfacing it immediately.
    const values = await retryWithBackoff(async () => {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
            const e = new Error(`Sheets GET error ${res.status}: ${await res.text()}`);
            e.status = res.status;
            throw e;
        }
        const data = await res.json();
        return data.values || [];
    }, 4, 600);

    sheetsReadCache.set(range, { data: values, expiresAt: Date.now() + SHEETS_READ_CACHE_TTL_MS });
    return values;
}

async function sheetsAppend(token, sheetName, row) {
    const result = await retryWithBackoff(async () => {
        const range = encodeURIComponent(`${sheetName}!A:A`);
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: [row] })
        });
        if (!res.ok) {
            const e = new Error(`Sheets append error ${res.status}: ${await res.text()}`);
            e.status = res.status;
            throw e;
        }
        return res.json();
    }, 4, 600);

    invalidateSheetCache(sheetName);
    return result;
}

// "Sheet exists with the right headers" only needs checking once per
// isolate - the sheet doesn't get renamed or deleted mid-flight, and every
// handler was previously paying a metadata GET (plus header-row GET) for
// this on every request.
const ensuredSheets = new Set();

async function ensureSheetExists(token, title, headers) {
    if (ensuredSheets.has(title)) return;

    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!metaRes.ok) throw new Error(`Sheets meta error: ${await metaRes.text()}`);
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
    } else if (rows[0].length < headers.length) {
        // Update header row if new columns were added
        await sheetsUpdate(token, `${title}!A1`, [headers]);
    }

    ensuredSheets.add(title);
}

async function sheetsUpdate(token, range, rows) {
    const result = await retryWithBackoff(async () => {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
        const res = await fetch(url, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: rows })
        });
        if (!res.ok) {
            const e = new Error(`Sheets update error ${res.status}: ${await res.text()}`);
            e.status = res.status;
            throw e;
        }
        return res.json();
    }, 4, 600);

    invalidateSheetCache(range.split('!')[0]);
    return result;
}

// ─── Rate limiter ──────────────────────────────────────────────────────────────

const rateLimitStore = new Map();

function getClientIP(req) {
    return req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown';
}

function isRateLimited(ip) {
    const now = Date.now();
    if (!rateLimitStore.has(ip)) {
        rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return false;
    }
    const d = rateLimitStore.get(ip);
    if (now > d.resetTime) { d.count = 1; d.resetTime = now + RATE_LIMIT_WINDOW; return false; }
    return ++d.count > RATE_LIMIT_REQUESTS;
}

// ─── Retry helper ──────────────────────────────────────────────────────────────

async function retryWithBackoff(fn, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try { return await fn(); }
        catch (e) {
            if (i === maxRetries - 1) throw e;
            const status = e.status || 0;
            const msg = String(e.message || '');
            const retryable = status === 429 || status === 500 || status === 502 || status === 503
                || msg.includes('429') || msg.includes('RATE_LIMITED') || msg.includes('overloaded');
            if (!retryable) throw e;
            console.log(`Retry ${i + 1}/${maxRetries} after ${delay * Math.pow(2, i)}ms (status=${status})`);
            await new Promise(r => setTimeout(r, delay * Math.pow(2, i)));
        }
    }
}

// ─── Mailgun ───────────────────────────────────────────────────────────────────

async function sendMailgunEmail(env, name, email, subject, leadType, productInterest, solutionInterest, timeline, message) {
    if (!env.MAILGUN_API_KEY || !env.MAILGUN_DOMAIN) return false;
    try {
        const details = [
            `Name: ${name}`,
            `Email: ${email}`,
            `Subject: ${subject}`,
            `Lead Type: ${leadType || 'N/A'}`,
            `Product Interest: ${productInterest || 'N/A'}`,
            `Solution Interest: ${solutionInterest || 'N/A'}`,
            `Timeline: ${timeline || 'N/A'}`,
            ``,
            `Message:`,
            `${message}`
        ].join('\n');
        const res = await fetch(`https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${btoa(`api:${env.MAILGUN_API_KEY}`)}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                from: `Contact Form <noreply@${env.MAILGUN_DOMAIN}>`,
                to: 'contact@sentratech.in',
                subject: `New Contact Form: ${subject || 'Contact Request'}`,
                text: details,
                'h:Reply-To': email
            })
        });
        return res.ok;
    } catch { return false; }
}

// ─── CORS ──────────────────────────────────────────────────────────────────────

function corsHeaders(request) {
    const origin = request ? (request.headers.get('Origin') || '*') : '*';
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400'
    };
}

function withCors(response, request) {
    const headers = new Headers(response.headers);
    const origin = request ? (request.headers.get('Origin') || '*') : '*';
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function jsonRes(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
}

// ─── Handlers ──────────────────────────────────────────────────────────────────

async function handleHealth() {
    return jsonRes({
        status: 'ok',
        message: 'Server is running',
        model: MODEL_NAME,
        provider: 'OpenRouter',
        chatbot: 'Veronica - Sentra',
        timestamp: new Date().toISOString()
    });
}

async function handleChat(request, env) {
    let message;
    try {
        const body = await request.json();
        message = body.message;
    } catch (e) {
        console.error('Chat: failed to parse request body:', e.message);
        return jsonRes({ error: 'Invalid request body' }, 400);
    }

    if (!message || !String(message).trim()) return jsonRes({ error: 'Message is required' }, 400);

    const OPENROUTER_API_KEY = env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) return jsonRes({ error: 'Missing OpenRouter API key' }, 401);

    try {
        const data = await retryWithBackoff(async () => {
            const res = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                    'HTTP-Referer': 'https://sentratech.in',
                    'X-Title': 'Sentra Chatbot'
                },
                body: JSON.stringify({
                    model: MODEL_NAME,
                    messages: [{ role: 'user', content: `${SYSTEM_INSTRUCTION}\n\nUser query: ${message}` }]
                })
            });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                const errMsg = errBody.error?.message || errBody.error || `HTTP ${res.status}`;
                console.error(`Chat: OpenRouter error ${res.status}:`, errMsg);
                const e = new Error(String(errMsg));
                e.status = res.status;
                throw e;
            }
            return res.json();
        }, 3, 1000);

        if (data.choices?.[0]?.message) {
            const text = data.choices[0].message.content;
            return jsonRes({ response: text, message: text });
        }
        console.error('Chat: unexpected OpenRouter response:', JSON.stringify(data).slice(0, 500));
        return jsonRes({ error: 'Unexpected response from AI service' }, 502);
    } catch (e) {
        console.error('Chat error:', e.message || e);
        if (e.status === 429) return jsonRes({ error: 'AI service rate limit reached. Please try again shortly.' }, 429);
        if (e.status === 404) return jsonRes({ error: 'AI model not found' }, 404);
        if (e.status === 401 || e.status === 403) return jsonRes({ error: 'AI service authentication error' }, 502);
        if (e.status >= 400 && e.status < 500) return jsonRes({ error: `AI service error: ${e.message}` }, 502);
        return jsonRes({ error: 'Service temporarily unavailable. Please try again.' }, 503);
    }
}

async function handleUserProfile(request, env) {
    try {
        const body = await request.json();
        const name = String(body.name || '').trim();
        const email = String(body.email || '').trim();

        if (!name || !email) return jsonRes({ error: 'Name and email are required' }, 400);
        if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
            return jsonRes({ error: 'Invalid email format' }, 400);
        }

        // Save to Google Sheets 'Chatbot Leads' sheet
        if (env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY) {
            try {
                const token = await getGoogleAccessToken(env);
                await ensureSheetExists(token, SHEET_CHATBOT_LEADS, CHATBOT_LEADS_HEADERS);

                const rows = await sheetsGet(token, `${SHEET_CHATBOT_LEADS}!A:C`);
                // Skip header row (index 0), check email (col 2) for duplicates
                const isDuplicate = rows.slice(1).some(r =>
                    (r[2] || '').toLowerCase() === email.toLowerCase()
                );
                if (isDuplicate) return jsonRes({ duplicate: true, message: 'You have already registered. Welcome back!' });

                await sheetsAppend(token, SHEET_CHATBOT_LEADS, [
                    new Date().toISOString(), name, email
                ]);
                console.log('Chatbot lead saved:', { name, email });
            } catch (sheetsErr) {
                console.error('Sheets chatbot lead error:', sheetsErr.message);
                // Don't fail if Sheets is unavailable
            }
        }

        return jsonRes({ success: true, message: 'Profile saved successfully' });
    } catch (e) {
        console.error('User profile error:', e);
        return jsonRes({ error: 'Failed to save user profile' }, 500);
    }
}

async function handleContact(request, env) {
    try {
        const body = await request.json();
        const firstName = String(body.firstName || '').trim();
        const lastName = String(body.lastName || '').trim();
        const email = String(body.email || '').trim();
        const subject = String(body.subject || '').trim();
        const leadType = String(body.leadType || '').trim();
        const productInterest = String(body.productInterest || '').trim();
        const solutionInterest = String(body.solutionInterest || '').trim();
        const timeline = String(body.timeline || '').trim();
        const message = String(body.message || '').trim();

        if (!email || !message) return jsonRes({ error: 'Email and message are required' }, 400);
        if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
            return jsonRes({ error: 'Invalid email format' }, 400);
        }

        // Google Sheets: duplicate check + append
        if (env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY) {
            try {
                const token = await getGoogleAccessToken(env);
                await ensureSheetExists(token, SHEET_CONTACTS, CONTACT_HEADERS);

                const rows = await sheetsGet(token, `${SHEET_CONTACTS}!A:J`);
                // Skip header row (index 0), check email (col 3) + message (col 9)
                const isDuplicate = rows.slice(1).some(r =>
                    (r[3] || '').toLowerCase() === email.toLowerCase() &&
                    (r[9] || '').trim() === message
                );
                if (isDuplicate) return jsonRes({ duplicate: true, message: 'This message was already submitted.' }, 409);

                await sheetsAppend(token, SHEET_CONTACTS, [
                    new Date().toISOString(), firstName, lastName, email, subject,
                    leadType, productInterest, solutionInterest, timeline, message
                ]);
            } catch (sheetsErr) {
                console.error('Sheets contact error:', sheetsErr.message);
                // Don't fail the submission if Sheets is unavailable — still send email
            }
        }

        // Mailgun email (optional)
        if (env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN) {
            await sendMailgunEmail(env, `${firstName} ${lastName}`.trim() || 'Guest', email, subject, leadType, productInterest, solutionInterest, timeline, message);
        }

        return jsonRes({ success: true, message: 'Thank you for contacting us. We will get back to you soon.' });
    } catch (e) {
        console.error('Contact error:', e);
        return jsonRes({ error: e.message || 'Failed to submit contact form.' }, 500);
    }
}

async function handleNewsletter(request, env) {
    try {
        const body = await request.json();
        const email = String(body.email || '').trim();

        if (!email || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
            return jsonRes({ error: 'Valid email is required' }, 400);
        }

        if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
            return jsonRes({ error: 'Sheets not configured' }, 500);
        }

        const token = await getGoogleAccessToken(env);
        await ensureSheetExists(token, SHEET_NEWSLETTER, NEWSLETTER_HEADERS);

        const rows = await sheetsGet(token, `${SHEET_NEWSLETTER}!A:B`);
        // Skip header row (index 0), check email (col 1)
        const exists = rows.slice(1).some(r => (r[1] || '').toLowerCase() === email.toLowerCase());
        if (exists) return jsonRes({ exists: true, message: 'Email already subscribed.' }, 409);

        await sheetsAppend(token, SHEET_NEWSLETTER, [new Date().toISOString(), email]);
        return jsonRes({ success: true });
    } catch (e) {
        console.error('Newsletter error:', e);
        return jsonRes({ error: e.message || 'Failed to subscribe.' }, 500);
    }
}

async function handleBrochureDownload(request, env) {
    try {
        const body = await request.json();
        const fullName = String(body.fullName || '').trim();
        const email = String(body.email || '').trim();
        const phone = String(body.phone || '').trim();
        const company = String(body.company || '').trim();
        const info = String(body.info || '').trim();
        const brochure = String(body.brochure || '').trim();
        const sourcePage = String(body.sourcePage || '').trim();

        if (!fullName || !email) return jsonRes({ error: 'Full name and email are required' }, 400);
        if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
            return jsonRes({ error: 'Invalid email format' }, 400);
        }

        if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
            return jsonRes({ error: 'Sheets not configured' }, 500);
        }

        const token = await getGoogleAccessToken(env);
        await ensureSheetExists(token, SHEET_BROCHURE_DOWNLOADS, BROCHURE_DOWNLOADS_HEADERS);
        await sheetsAppend(token, SHEET_BROCHURE_DOWNLOADS, [
            new Date().toISOString(), fullName, email, phone, company, info, brochure, sourcePage
        ]);

        return jsonRes({ success: true, message: 'Thank you — your download will begin shortly.' });
    } catch (e) {
        console.error('Brochure download error:', e);
        return jsonRes({ error: e.message || 'Failed to record brochure request.' }, 500);
    }
}

// ─── Chat Conversations (one row per session, messages stored as JSON) ─────────
//
// Sheet layout: Session ID | Lead Name | Lead Email | Status | Last Updated | Messages JSON
// The "Messages JSON" cell holds a JSON array of {timestamp, sender, message, agentName}.
// This keeps the whole thread readable in a single row instead of one row
// per message. The public API response shape (a flat `messages` array) is
// unchanged, so the widget and admin dashboard needed no changes for this.

async function findChatConversationRow(token, sessionId) {
    const rows = await sheetsGet(token, `${SHEET_CHAT_CONVERSATIONS}!A:A`);
    for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === sessionId) return i + 1; // 1-indexed sheet row number
    }
    return null;
}

async function getChatConversation(token, sessionId) {
    const rowNum = await findChatConversationRow(token, sessionId);
    if (!rowNum) return null;
    const row = (await sheetsGet(token, `${SHEET_CHAT_CONVERSATIONS}!A${rowNum}:F${rowNum}`))[0] || [];
    let messages = [];
    try { messages = JSON.parse(row[5] || '[]'); } catch { messages = []; }
    return {
        rowNum,
        sessionId: row[0] || sessionId,
        leadName: row[1] || '',
        leadEmail: row[2] || '',
        status: row[3] || 'active',
        lastUpdated: row[4] || '',
        messages
    };
}

async function handleChatHistory(request, env) {
    try {
        const body = await request.json();
        const { sessionId, message, leadName, leadEmail, sender, agentName } = body;

        if (!sessionId || !message) {
            return jsonRes({ error: 'Session ID and message are required' }, 400);
        }

        if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
            return jsonRes({ error: 'Sheets not configured' }, 500);
        }

        const token = await getGoogleAccessToken(env);
        await ensureSheetExists(token, SHEET_CHAT_CONVERSATIONS, CHAT_CONVERSATIONS_HEADERS);

        const timestamp = new Date().toISOString();
        const newMessage = { timestamp, sender: sender || 'user', message, agentName: agentName || '' };
        const existing = await getChatConversation(token, sessionId);

        if (existing) {
            existing.messages.push(newMessage);
            // Any new message reactivates the conversation - "closed" should
            // only ever be set by an explicit End Chat, never linger after
            // the visitor or agent starts talking again.
            await sheetsUpdate(token, `${SHEET_CHAT_CONVERSATIONS}!A${existing.rowNum}:F${existing.rowNum}`, [[
                sessionId,
                leadName || existing.leadName,
                leadEmail || existing.leadEmail,
                'active',
                timestamp,
                JSON.stringify(existing.messages)
            ]]);
        } else {
            await sheetsAppend(token, SHEET_CHAT_CONVERSATIONS, [
                sessionId, leadName || '', leadEmail || '', 'active', timestamp, JSON.stringify([newMessage])
            ]);
        }

        return jsonRes({ success: true });
    } catch (e) {
        console.error('Chat history error:', e);
        return jsonRes({ error: e.message || 'Failed to save chat message.' }, 500);
    }
}

function conversationToFlatMessages(conv) {
    return conv.messages.map(m => ({
        sessionId: conv.sessionId,
        timestamp: m.timestamp,
        leadName: conv.leadName,
        leadEmail: conv.leadEmail,
        message: m.message,
        sender: m.sender,
        status: conv.status,
        agentName: m.agentName || ''
    }));
}

async function handleGetChatHistory(request, env) {
    try {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get('sessionId');

        if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
            return jsonRes({ error: 'Sheets not configured' }, 500);
        }

        const token = await getGoogleAccessToken(env);

        if (sessionId) {
            const conv = await getChatConversation(token, sessionId);
            return jsonRes({ messages: conv ? conversationToFlatMessages(conv) : [] });
        }

        // No sessionId - flatten every conversation (rarely used).
        await ensureSheetExists(token, SHEET_CHAT_CONVERSATIONS, CHAT_CONVERSATIONS_HEADERS);
        const rows = await sheetsGet(token, `${SHEET_CHAT_CONVERSATIONS}!A:F`);
        const messages = [];
        rows.slice(1).forEach(row => {
            if (!row[0]) return;
            let msgs = [];
            try { msgs = JSON.parse(row[5] || '[]'); } catch { msgs = []; }
            msgs.forEach(m => messages.push({
                sessionId: row[0], timestamp: m.timestamp, leadName: row[1] || '', leadEmail: row[2] || '',
                message: m.message, sender: m.sender, status: row[3] || 'active', agentName: m.agentName || ''
            }));
        });
        return jsonRes({ messages });
    } catch (e) {
        console.error('Get chat history error:', e);
        return jsonRes({ error: e.message || 'Failed to get chat history.' }, 500);
    }
}

// ─── Chat Presence (live open/closed status) ───────────────────────────────────
// Ephemeral - stored in the ADMIN_SESSIONS KV with a short TTL so a closed
// tab / lost connection naturally goes "offline" without an explicit signal.
const PRESENCE_TTL_SECONDS = 60; // Cloudflare KV's minimum allowed TTL

async function handleChatPresence(request, env) {
    try {
        const { sessionId, status } = await request.json();
        if (!sessionId) return jsonRes({ error: 'Session ID is required' }, 400);

        await env.ADMIN_SESSIONS.put(
            `presence:${sessionId}`,
            JSON.stringify({ status: status === 'open' ? 'open' : 'closed', ts: Date.now() }),
            { expirationTtl: PRESENCE_TTL_SECONDS }
        );
        return jsonRes({ success: true });
    } catch (e) {
        return jsonRes({ error: e.message }, 500);
    }
}

async function getPresence(env, sessionId) {
    try {
        const raw = await env.ADMIN_SESSIONS.get(`presence:${sessionId}`);
        if (!raw) return { online: false };
        const data = JSON.parse(raw);
        return { online: data.status === 'open' };
    } catch {
        return { online: false };
    }
}

// ─── Admin Dashboard ───────────────────────────────────────────────────────────

const CONTACT_HEADERS_ADMIN = ['Timestamp', 'First Name', 'Last Name', 'Email', 'Subject', 'Lead Type', 'Product Interest', 'Solution Interest', 'Timeline', 'Message', 'Status'];
const NEWSLETTER_HEADERS_ADMIN = ['Timestamp', 'Email', 'Status'];
const CHATBOT_LEADS_HEADERS_ADMIN = ['Timestamp', 'Name', 'Email', 'Status'];
const SHEET_ACCOUNTS = 'Manage Accounts';
const ACCOUNTS_HEADERS = ['Email', 'Password Hash', 'Name', 'Role', 'Created At'];

// The first admin account, seeded into the "Manage Accounts" sheet the
// first time that sheet is empty. The plaintext password is only ever
// used to compute the stored hash below - it is never written to the sheet.
const DEFAULT_ADMIN_EMAIL = 'subharam.v@clovetech.com';
const DEFAULT_ADMIN_PASSWORD = 'Yuva8856@';
const DEFAULT_ADMIN_NAME = 'Subharam V';
const DEFAULT_ADMIN_ROLE = 'Super Admin';

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

// Session management
// Sessions are stored in Workers KV (ADMIN_SESSIONS binding) rather than an
// in-memory Map: Cloudflare can route successive requests to different
// isolates/instances that don't share memory, so an in-memory Map caused
// logins to randomly appear as "Unauthorized" on the very next request.
const ADMIN_SESSION_TTL_SECONDS = 24 * 60 * 60;

function generateSessionId() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

async function createAdminSession(env, email, name) {
    const sessionId = generateSessionId();
    await env.ADMIN_SESSIONS.put(
        `session:${sessionId}`,
        JSON.stringify({ email, name: name || '', createdAt: Date.now() }),
        { expirationTtl: ADMIN_SESSION_TTL_SECONDS }
    );
    return sessionId;
}

function getAdminSessionId(request) {
    const cookie = request.headers.get('Cookie') || '';
    const m = cookie.match(/admin_session=([^;]+)/);
    if (m) return m[1];
    const auth = request.headers.get('Authorization') || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7);
    return null;
}

async function requireAdminAuth(request, env) {
    try {
        const sid = getAdminSessionId(request);
        if (!sid) return null;
        if (!env.ADMIN_SESSIONS) return null;
        const raw = await env.ADMIN_SESSIONS.get(`session:${sid}`);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

// Admin API handlers
async function handleAdminLogin(request, env) {
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

        const sessionId = await createAdminSession(env, account[0], account[2] || '');
        const res = jsonRes({
            success: true,
            sessionId,
            name: account[2] || '',
            role: account[3] || 'Admin'
        });
        res.headers.append('Set-Cookie', `admin_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
        return res;
    } catch (e) {
        console.error('Admin login error:', e.message);
        return jsonRes({ error: 'Login failed' }, 500);
    }
}

async function handleAdminGetAccounts(request, env) {
    if (!(await requireAdminAuth(request, env))) return jsonRes({ error: 'Unauthorized' }, 401);
    try {
        const token = await getGoogleAccessToken(env);
        await ensureSheetExists(token, SHEET_ACCOUNTS, ACCOUNTS_HEADERS);
        await ensureDefaultAdmin(token);
        const rows = await sheetsGet(token, `${SHEET_ACCOUNTS}!A:E`);
        const accounts = rows.slice(1)
            .filter(r => r[0])
            .map(r => ({ email: r[0] || '', name: r[2] || '', role: r[3] || 'Admin', createdAt: r[4] || '' }));
        return jsonRes({ accounts, total: accounts.length });
    } catch (e) { return jsonRes({ error: e.message }, 500); }
}

async function handleAdminCreateAccount(request, env) {
    if (!(await requireAdminAuth(request, env))) return jsonRes({ error: 'Unauthorized' }, 401);
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
    } catch (e) { return jsonRes({ error: e.message }, 500); }
}

async function handleAdminStats(request, env) {
    if (!(await requireAdminAuth(request, env))) return jsonRes({ error: 'Unauthorized' }, 401);
    try {
        const token = await getGoogleAccessToken(env);
        let totalLeads = 0, newLeads = 0, totalSubscribers = 0, totalChatLeads = 0, activeChats = 0;

        // These four metrics are independent - run them concurrently instead
        // of one-at-a-time so a stats poll costs one round-trip's worth of
        // latency instead of four stacked up in series.
        await Promise.all([
            (async () => {
                try { await ensureSheetExists(token, SHEET_CONTACTS, CONTACT_HEADERS_ADMIN); const r = await sheetsGet(token, `${SHEET_CONTACTS}!A:K`); totalLeads = Math.max(0, r.length - 1); newLeads = r.slice(1).filter(x => !x[10] || x[10] === 'New').length; } catch {}
            })(),
            (async () => {
                try { await ensureSheetExists(token, SHEET_NEWSLETTER, NEWSLETTER_HEADERS_ADMIN); const r = await sheetsGet(token, `${SHEET_NEWSLETTER}!A:C`); totalSubscribers = Math.max(0, r.length - 1); } catch {}
            })(),
            (async () => {
                try { await ensureSheetExists(token, SHEET_CHATBOT_LEADS, CHATBOT_LEADS_HEADERS_ADMIN); const r = await sheetsGet(token, `${SHEET_CHATBOT_LEADS}!A:D`); totalChatLeads = Math.max(0, r.length - 1); } catch {}
            })(),
            (async () => {
                try {
                    await ensureSheetExists(token, SHEET_CHAT_CONVERSATIONS, CHAT_CONVERSATIONS_HEADERS);
                    const r = await sheetsGet(token, `${SHEET_CHAT_CONVERSATIONS}!A:D`);
                    activeChats = r.slice(1).filter(x => x[0] && x[3] !== 'closed').length;
                } catch {}
            })()
        ]);

        return jsonRes({ totalLeads, newLeads, totalSubscribers, totalChatLeads, activeChats });
    } catch (e) { return jsonRes({ error: e.message }, 500); }
}

async function handleAdminLeads(request, env) {
    if (!(await requireAdminAuth(request, env))) return jsonRes({ error: 'Unauthorized' }, 401);
    try {
        const token = await getGoogleAccessToken(env);
        await ensureSheetExists(token, SHEET_CONTACTS, CONTACT_HEADERS_ADMIN);
        const rows = await sheetsGet(token, `${SHEET_CONTACTS}!A:K`);
        if (rows.length <= 1) return jsonRes({ leads: [], total: 0 });
        const leads = rows.slice(1).map((row, idx) => ({
            id: idx + 1, timestamp: row[0] ? new Date(row[0]).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
            firstName: row[1] || '', lastName: row[2] || '', email: row[3] || '', subject: row[4] || '',
            leadType: row[5] || '', productInterest: row[6] || '', solutionInterest: row[7] || '',
            timeline: row[8] || '', message: row[9] || '', status: row[10] || 'New'
        }));
        return jsonRes({ leads, total: leads.length });
    } catch (e) { return jsonRes({ error: e.message }, 500); }
}

async function handleAdminLeadStatus(request, env) {
    if (!(await requireAdminAuth(request, env))) return jsonRes({ error: 'Unauthorized' }, 401);
    try {
        const { row, status, leadEmail } = await request.json();
        if (row === undefined || row === null || !status) {
            return jsonRes({ error: 'row and status are required' }, 400);
        }
        const token = await getGoogleAccessToken(env);

        // Only log a note (and only write the cell) if the status actually changed,
        // so re-saving the same status doesn't pile up duplicate log entries.
        let previousStatus = '';
        try {
            const current = await sheetsGet(token, `${SHEET_CONTACTS}!K${row + 2}`);
            previousStatus = (current[0] && current[0][0]) || 'New';
        } catch (e) { console.error('Lead status read error:', e.message); }

        if (previousStatus === status) {
            return jsonRes({ success: true, unchanged: true });
        }

        await sheetsUpdate(token, `${SHEET_CONTACTS}!K${row + 2}`, [[status]]);

        try {
            await ensureSheetExists(token, SHEET_LEAD_NOTES, LEAD_NOTES_HEADERS);
            await sheetsAppend(token, SHEET_LEAD_NOTES, [
                new Date().toISOString(), String(row), leadEmail || '', 'status_change', `Status changed to ${status}`
            ]);
        } catch (e) { console.error('Lead note log error:', e.message); }

        return jsonRes({ success: true });
    } catch (e) { return jsonRes({ error: e.message }, 500); }
}

async function handleAdminGetLeadNotes(request, env) {
    if (!(await requireAdminAuth(request, env))) return jsonRes({ error: 'Unauthorized' }, 401);
    try {
        const url = new URL(request.url);
        const leadRow = url.searchParams.get('leadRow');
        const token = await getGoogleAccessToken(env);
        await ensureSheetExists(token, SHEET_LEAD_NOTES, LEAD_NOTES_HEADERS);
        const rows = await sheetsGet(token, `${SHEET_LEAD_NOTES}!A:E`);
        const notes = rows.slice(1)
            .filter(r => String(r[1] || '') === String(leadRow))
            .map(r => ({
                timestamp: r[0] ? new Date(r[0]).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
                type: r[3] || 'note',
                content: r[4] || ''
            }));
        return jsonRes({ notes });
    } catch (e) { return jsonRes({ error: e.message }, 500); }
}

async function handleAdminAddLeadNote(request, env) {
    if (!(await requireAdminAuth(request, env))) return jsonRes({ error: 'Unauthorized' }, 401);
    try {
        const { leadRow, leadEmail, note } = await request.json();
        // Note: leadRow can legitimately be 0 (the first lead in the list),
        // so this must not use a plain falsy check (`!leadRow`) - that would
        // wrongly reject row 0 as "missing".
        if (leadRow === undefined || leadRow === null || leadRow === '' || !note) {
            return jsonRes({ error: 'leadRow and note are required' }, 400);
        }

        const token = await getGoogleAccessToken(env);
        await ensureSheetExists(token, SHEET_LEAD_NOTES, LEAD_NOTES_HEADERS);
        await sheetsAppend(token, SHEET_LEAD_NOTES, [
            new Date().toISOString(), String(leadRow), leadEmail || '', 'note', note
        ]);
        return jsonRes({ success: true });
    } catch (e) { return jsonRes({ error: e.message }, 500); }
}

async function handleAdminNewsletter(request, env) {
    if (!(await requireAdminAuth(request, env))) return jsonRes({ error: 'Unauthorized' }, 401);
    try {
        const token = await getGoogleAccessToken(env);
        await ensureSheetExists(token, SHEET_NEWSLETTER, NEWSLETTER_HEADERS_ADMIN);
        const rows = await sheetsGet(token, `${SHEET_NEWSLETTER}!A:C`);
        if (rows.length <= 1) return jsonRes({ subscribers: [], total: 0 });
        const subscribers = rows.slice(1).map((row, idx) => ({
            id: idx + 1, timestamp: row[0] ? new Date(row[0]).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
            email: row[1] || '', status: row[2] || 'Active'
        }));
        return jsonRes({ subscribers, total: subscribers.length });
    } catch (e) { return jsonRes({ error: e.message }, 500); }
}

async function handleAdminChatbotLeads(request, env) {
    if (!(await requireAdminAuth(request, env))) return jsonRes({ error: 'Unauthorized' }, 401);
    try {
        const token = await getGoogleAccessToken(env);
        await ensureSheetExists(token, SHEET_CHATBOT_LEADS, CHATBOT_LEADS_HEADERS_ADMIN);
        const rows = await sheetsGet(token, `${SHEET_CHATBOT_LEADS}!A:D`);
        if (rows.length <= 1) return jsonRes({ leads: [], total: 0 });
        const leads = rows.slice(1).map((row, idx) => ({
            id: idx + 1, timestamp: row[0] ? new Date(row[0]).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
            name: row[1] || '', email: row[2] || '', status: row[3] || 'New'
        }));
        return jsonRes({ leads, total: leads.length });
    } catch (e) { return jsonRes({ error: e.message }, 500); }
}

async function handleAdminChatSessions(request, env) {
    try {
        if (!(await requireAdminAuth(request, env))) return jsonRes({ error: 'Unauthorized' }, 401);
        const token = await getGoogleAccessToken(env);
        await ensureSheetExists(token, SHEET_CHAT_CONVERSATIONS, CHAT_CONVERSATIONS_HEADERS);
        const rows = await sheetsGet(token, `${SHEET_CHAT_CONVERSATIONS}!A:F`);
        if (rows.length <= 1) return jsonRes({ sessions: [], total: 0 });

        const sessionsList = rows.slice(1).filter(row => row[0]).map(row => {
            let messages = [];
            try { messages = JSON.parse(row[5] || '[]'); } catch { messages = []; }
            const last = messages[messages.length - 1] || {};
            let agentName = '';
            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].sender === 'agent' && messages[i].agentName) { agentName = messages[i].agentName; break; }
            }
            return {
                sessionId: row[0],
                leadName: row[1] || '',
                leadEmail: row[2] || '',
                status: row[3] || 'active',
                lastTimestamp: row[4] || last.timestamp || '',
                lastMessage: last.message || '',
                agentName,
                messageCount: messages.length
            };
        });

        await Promise.all(sessionsList.map(async (s) => {
            const presence = await getPresence(env, s.sessionId);
            s.userOnline = presence.online;
        }));

        sessionsList.sort((a, b) => new Date(b.lastTimestamp) - new Date(a.lastTimestamp));
        return jsonRes({ sessions: sessionsList, total: sessionsList.length });
    } catch (e) { return jsonRes({ error: e.message }, 500); }
}

async function handleAdminChatMessages(request, env, sessionId) {
    try {
        if (!(await requireAdminAuth(request, env))) return jsonRes({ error: 'Unauthorized' }, 401);
        const token = await getGoogleAccessToken(env);
        const conv = await getChatConversation(token, sessionId);
        const messages = conv ? conv.messages.map(m => ({
            timestamp: m.timestamp, leadName: conv.leadName, leadEmail: conv.leadEmail, message: m.message, sender: m.sender, agentName: m.agentName || ''
        })) : [];
        return jsonRes({ messages });
    } catch (e) { return jsonRes({ error: e.message }, 500); }
}

async function handleAdminChatSend(request, env) {
    const session = await requireAdminAuth(request, env);
    if (!session) return jsonRes({ error: 'Unauthorized' }, 401);
    try {
        const { sessionId, message, leadName, leadEmail } = await request.json();
        const token = await getGoogleAccessToken(env);
        await ensureSheetExists(token, SHEET_CHAT_CONVERSATIONS, CHAT_CONVERSATIONS_HEADERS);

        // Never fall back to showing the agent's email to the visitor - name only.
        const agentName = session.name || 'Support Agent';
        const timestamp = new Date().toISOString();
        const newMessage = { timestamp, sender: 'agent', message, agentName };
        const existing = await getChatConversation(token, sessionId);

        if (existing) {
            existing.messages.push(newMessage);
            // Any new message reactivates the conversation - "closed" should
            // only ever be set by an explicit End Chat, never linger after
            // the visitor or agent starts talking again.
            await sheetsUpdate(token, `${SHEET_CHAT_CONVERSATIONS}!A${existing.rowNum}:F${existing.rowNum}`, [[
                sessionId,
                leadName || existing.leadName,
                leadEmail || existing.leadEmail,
                'active',
                timestamp,
                JSON.stringify(existing.messages)
            ]]);
        } else {
            await sheetsAppend(token, SHEET_CHAT_CONVERSATIONS, [
                sessionId, leadName || '', leadEmail || '', 'active', timestamp, JSON.stringify([newMessage])
            ]);
        }

        return jsonRes({ success: true });
    } catch (e) { return jsonRes({ error: e.message }, 500); }
}

async function handleAdminChatEnd(request, env) {
    if (!(await requireAdminAuth(request, env))) return jsonRes({ error: 'Unauthorized' }, 401);
    try {
        const { sessionId } = await request.json();
        const token = await getGoogleAccessToken(env);
        const rowNum = await findChatConversationRow(token, sessionId);
        if (rowNum) {
            await sheetsUpdate(token, `${SHEET_CHAT_CONVERSATIONS}!D${rowNum}`, [['closed']]);
        }
        await env.ADMIN_SESSIONS.delete(`presence:${sessionId}`);
        return jsonRes({ success: true });
    } catch (e) { return jsonRes({ error: e.message }, 500); }
}

async function handleAdminChatDelete(request, env) {
    if (!(await requireAdminAuth(request, env))) return jsonRes({ error: 'Unauthorized' }, 401);
    try {
        const { sessionId } = await request.json();
        if (!sessionId) return jsonRes({ error: 'sessionId is required' }, 400);

        const token = await getGoogleAccessToken(env);
        const rowNum = await findChatConversationRow(token, sessionId);
        if (!rowNum) return jsonRes({ error: 'Session not found' }, 404);

        const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const meta = await metaRes.json();
        const sheet = (meta.sheets || []).find(s => s.properties.title === SHEET_CHAT_CONVERSATIONS);
        if (!sheet) return jsonRes({ error: 'Sheet not found' }, 404);

        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requests: [{
                    deleteDimension: {
                        range: {
                            sheetId: sheet.properties.sheetId,
                            dimension: 'ROWS',
                            startIndex: rowNum - 1,
                            endIndex: rowNum
                        }
                    }
                }]
            })
        });

        await env.ADMIN_SESSIONS.delete(`presence:${sessionId}`);
        return jsonRes({ success: true });
    } catch (e) { return jsonRes({ error: e.message }, 500); }
}

// ─── Main fetch handler ────────────────────────────────────────────────────────

export default {
    async fetch(request, env, ctx) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders(request) });
        }

        const { pathname } = new URL(request.url);
        let res;

        if (pathname === '/api/chat' && request.method === 'POST') {
            const ip = getClientIP(request);
            if (isRateLimited(ip)) res = jsonRes({ error: 'Too many requests. Please wait.', retryAfter: 60 }, 429);
            else res = await handleChat(request, env);
        }
        else if (pathname === '/api/health' && request.method === 'GET') res = handleHealth();
        else if (pathname === '/api/user-profile' && request.method === 'POST') res = await handleUserProfile(request, env);
        else if (pathname === '/api/contact' && request.method === 'POST') res = await handleContact(request, env);
        else if (pathname === '/api/newsletter' && request.method === 'POST') res = await handleNewsletter(request, env);
        else if (pathname === '/api/brochure-download' && request.method === 'POST') res = await handleBrochureDownload(request, env);
        else if (pathname === '/api/chat-history' && request.method === 'POST') res = await handleChatHistory(request, env);
        else if (pathname === '/api/chat-history' && request.method === 'GET') res = await handleGetChatHistory(request, env);
        else if (pathname === '/api/chat-presence' && request.method === 'POST') res = await handleChatPresence(request, env);

        // Admin routes
        else if (pathname === '/api/admin/login' && request.method === 'POST') res = await handleAdminLogin(request, env);
        else if (pathname === '/api/admin/accounts' && request.method === 'GET') res = await handleAdminGetAccounts(request, env);
        else if (pathname === '/api/admin/accounts' && request.method === 'POST') res = await handleAdminCreateAccount(request, env);
        else if (pathname === '/api/admin/stats' && request.method === 'GET') res = await handleAdminStats(request, env);
        else if (pathname === '/api/admin/leads' && request.method === 'GET') res = await handleAdminLeads(request, env);
        else if (pathname === '/api/admin/leads/status' && request.method === 'POST') res = await handleAdminLeadStatus(request, env);
        else if (pathname === '/api/admin/lead-notes' && request.method === 'GET') res = await handleAdminGetLeadNotes(request, env);
        else if (pathname === '/api/admin/lead-notes' && request.method === 'POST') res = await handleAdminAddLeadNote(request, env);
        else if (pathname === '/api/admin/newsletter' && request.method === 'GET') res = await handleAdminNewsletter(request, env);
        else if (pathname === '/api/admin/chatbot-leads' && request.method === 'GET') res = await handleAdminChatbotLeads(request, env);
        else if (pathname === '/api/admin/chat-sessions' && request.method === 'GET') res = await handleAdminChatSessions(request, env);
        else if (pathname.startsWith('/api/admin/chat-messages/') && request.method === 'GET') {
            const sid = pathname.split('/').pop();
            res = await handleAdminChatMessages(request, env, sid);
        }
        else if (pathname === '/api/admin/chat-send' && request.method === 'POST') res = await handleAdminChatSend(request, env);
        else if (pathname === '/api/admin/chat-end' && request.method === 'POST') res = await handleAdminChatEnd(request, env);
        else if (pathname === '/api/admin/chat-delete' && request.method === 'POST') res = await handleAdminChatDelete(request, env);

        // Static admin pages - served by Cloudflare Pages/static hosting
        // API routes above handle all admin data operations

        if (!res) res = jsonRes({ error: 'Not Found' }, 404);
        return withCors(res, request);
    }
};

// ─── Veronica System Instruction ──────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are Veronica, an intelligent support assistant for Sentra.
You represent Sentra's suite of products including IoT sensors, data loggers, gateways, and monitoring solutions for infrastructure health and safety.


Company Name: Sentra
Sentra is a structural health monitoring and digital engineering company specializing in real-time infrastructure intelligence.
We integrate smart sensor networks, digital twins, and edge AI for predictive maintenance, fatigue analysis, and geotechnical monitoring.
Our solutions help detect early signs of stress, displacement, vibration, and material degradation across bridges, tunnels, buildings, and other critical assets.
Sentra also provides consulting and advisory services, foundation and geotechnical monitoring, fatigue and residual life assessment, and digital documentation of infrastructure assets.

AI AGENT: Veronica - Sentra Support Assistant

Developers:
- Yuva Subharam - https://in.linkedin.com/in/yuva-subharam-vasamsetti-75a39117a
- Vishal Das - https://in.linkedin.com/in/vishaldas01


Sentra is a flagship product line developed and managed by Clove Technologies Private Limited, a leading geospatial and engineering technology company headquartered in India. Clove specializes in delivering end-to-end digital transformation solutions across infrastructure, construction, utilities, and government sectors.

With over two decades of industry expertise, Clove Technologies integrates advanced geospatial intelligence, engineering analytics, and AI-driven automation to help clients build smarter, more resilient assets.

Parent Organization
Parent Company: Clove Technologies Private Limited (website:www.clovetech.com)
Subsidiary/Product Line: Sentra (Structural Health Monitoring & IoT Solutions)
Sentra operates under Clove Technologies' Smart Infrastructure division, focusing on intelligent monitoring systems, IoT-based sensing, and digital twin integration for infrastructure lifecycle management.

Clove Technologies – Specialities
1. Geospatial Technologies: Comprehensive GIS and mapping solutions, including cadastral mapping, LiDAR data processing, remote sensing, and spatial analytics for land administration, urban planning, and infrastructure management.
2. BIM and Digital Engineering: Integrated Building Information Modeling (BIM) services covering 3D modeling, 4D scheduling, and 5D cost estimation to support design, construction, and asset management workflows.
3. Smart Infrastructure Solutions: End-to-end systems for infrastructure digitization, including IoT-based monitoring (Sentra), predictive maintenance, and real-time analytics for bridges, buildings, tunnels, and industrial structures.
4. Custom Software Development: Development of enterprise-grade applications, web platforms, and mobile tools for geospatial data management, field data collection, and engineering operations.
5. AI, Machine Learning & Data Analytics:Deployment of AI-powered analytics for predictive modeling, anomaly detection, and decision intelligence across engineering and asset management domains.
6. Digital Twin & Simulation: Creation of integrated digital twins combining BIM, IoT, and GIS data to enable continuous performance monitoring and simulation of real-world infrastructure systems.
7. Surveying & Data Acquisition: Comprehensive ground and aerial survey services using UAVs, GNSS, and laser scanning for high-precision spatial data acquisition and modeling.

Industry Verticals Served:
- Infrastructure and Construction
- Transportation and Mobility
- Utilities and Energy
- Land Administration and Cadastre
- Urban Development and Smart Cities
- Oil, Gas, and Industrial Facilities


Sentra's Product Line from Various Brands (From World Sensing, Rockfield, . etc.,)

Edge Devices :
- Wireless Data Acquisition
-- Vibrating Wire
-- Vibrating Wire RCR
-- Digital Data Logger
-- Analog Data Logger
-- Piconode Data Logger

- Wireless Sensors
-- Tiltmeter
-- Tiltmeter Event Detection
-- Vibration Meter
-- Laser Tiltmeter
-- GNSS Meter

Core Communications :
- Narrowband Communications
-- Gateway
-- Repeater

- Broadband Communications
-- Thread

Wired Sensors:
- Accelerometer
- Strain Gauge

Key Product Model Numbers (for reference):
- Tiltmeter: LS-G6-TIL90-X (external antenna), LS-G6-TIL90-I (internal antenna)
- Tiltmeter Event Detection: LS-G6-TIL90-XE (external antenna), LS-G6-TIL90-IE (internal antenna)
- Vibrating Wire: LS-G6-VW (5-channel), LS-G6-VW-1 (1-channel)
- Vibrating Wire RCR: LS-G6-VW-RCR
- Gateway: 4G Rugged Gateway
- Repeater: K20 Edge Repeater

You are currently on the About Us page of Sentra's website. Key information from this page:
- Sentra engineers intelligent monitoring solutions for infrastructure owners, engineers, and decision-makers.
- We specialize in bridges, tunnels, railways, and high-rise structures.
- Our team brings expertise in structural engineering, IoT technology, and real-time analytics.
- We provide Structural Health Monitoring, Bridge Inspection & Condition Assessment, Advanced Non-Destructive Testing (NDT), Asset Monitoring & Management Solutions, Geotechnical & Foundation Monitoring, and Fatigue and Residual Life Assessment.
- Sentra has over 21 years of experience in digital engineering.

Phone Number: +91 7893023322
Email Address: sentra@clovetech.com
Office Address: IT SEZ, Plot No. 9, Pedda Rushikonda, Rushikonda, Visakhapatnam, Andhra Pradesh 530045

AI AGENT OF SENTRA'S WEBSITE IS Veronica

Use this company and page-specific context to answer all upcoming user queries accurately and in alignment with Sentra's expertise.


Sentra's Core Solutions:

1. Structural Health Monitoring
Real-time monitoring for bridges, buildings, tunnels

2. Advanced NDT
Non-invasive testing methods

3. Bridge Inspection
Comprehensive condition assessment & lifecycle management

4. Asset Monitoring
End-to-end management with dashboards & predictive analytics

5. Consulting Services
Expert engineering advice & deployment strategies

6. Geotechnical Monitoring
Soil stability, foundation settlement, slope monitoring

7. Fatigue Assessment
Structural lifespan evaluation & RUL estimation

8. Digital Engineering
BIM, 3D modeling, digital twins, documentation

When users ask about our solutions, provide high-level overview and encourage contact for implementation details, custom quotes, or demos.


Sentra Edge Devices
Product Overview:
Sentra Edge Devices are designed for continuous structural health monitoring across diverse environments. Whether deployed on bridges to monitor traffic-induced vibrations, on buildings to track seismic activity, or on industrial equipment to detect mechanical wear, these sensors deliver actionable insights that protect assets and lives.

Combining advanced MEMS technology with long-range wireless communication, the devices capture acceleration data across a wide frequency spectrum (0.1 Hz - 10 kHz) and securely transmit it to cloud-based platforms for real-time visualization and intelligent analysis.

Product Lineup of Edge Devices:
- Vibrating Wire: Wireless data acquisition for precise strain and pressure measurements, Ideal for geotechnical and structural monitoring.
- Vibrating Wire RCR: Enhanced model offering real-time compensation for higher accuracy.
- Digital Data Logger: Captures and transmits sensor data via LoRaWAN or LTE with cloud integration.
- Analog Data Logger: Supports analog sensor inputs and converts readings into digital data.
- Piconode Data Logger: Compact, low-power logger designed for distributed or small-scale sensor networks.
- Tiltmeter: Monitors structural inclination or ground movement in real time.
- Tiltmeter Event Detection: Detects sudden tilting events or structural shifts automatically.
- Vibration Meter: Records vibration patterns to assess structural integrity and performance.
- Laser Tiltmeter: High-precision optical measurement device for micro-level tilt detection.
- GNSS Meter: Provides geospatial displacement tracking using satellite positioning systems.

Key Features and Specifications
- 3-axis MEMS accelerometer (±16g range)
- Frequency range: 0.1 Hz – 10 kHz
- LoRaWAN and 4G LTE connectivity
- IP67 waterproof and dustproof rating
- 5–10 year replaceable battery life
- Real-time alerts and notifications
- Cloud-based analytics platform
- BIM/GIS integration ready

Why our Edge Devices
- High-Precision Detection: Capture minute vibrations with exceptional accuracy for comprehensive structural assessment.
- Predictive Maintenance: AI-powered analytics identify patterns and trends, enabling proactive maintenance before failures occur.
- Rugged and Reliable: Weather-resistant IP67 construction ensures continuous operation in harsh conditions.
- Easy Integration: Seamlessly connects with existing IoT platforms, SCADA systems, and building management software.




Sentra Core Communications
Product Overview:

Sentra Core Communications forms the backbone of the Sentra monitoring ecosystem, enabling seamless, reliable, and secure data transmission between edge devices and cloud platforms. Designed for large-scale structural health monitoring networks, Core Communications ensures uninterrupted connectivity across bridges, buildings, and industrial environments.
With advanced narrowband and broadband communication technologies, the system supports long-range, low-power data transmission for real-time monitoring and intelligent analysis. Its rugged design and intelligent architecture ensure dependable performance in even the harshest environments.

Product Lineup
- 4G Rugged Gateway: A robust communication hub for connecting wireless sensors and loggers to the cloud using 4G LTE or LoRaWAN networks.
Ideal for distributed monitoring systems requiring secure, long-range connectivity.

- K20 Edge Repeater: Extends network range and reliability by relaying data between remote sensors and gateways.
Optimized for low-power, wide-area network configurations.

- Thread: A high-speed broadband communication module enabling efficient, scalable data exchange in complex monitoring infrastructures.
Ideal for multi-device synchronization and high-throughput data environments.

Key Features and Specifications
- Long-range, low-power communication
- LoRaWAN and 4G LTE connectivity options
- IP67-rated waterproof and dustproof construction
- Secure data transmission with advanced encryption
- Scalable mesh network support for extended coverage
- Cloud-based analytics and management platform
- BIM/GIS integration ready
- Seamless interoperability with Sentra Edge Devices and sensors

Why our Core Communications
- Reliable Connectivity
Ensures continuous communication between field sensors and the cloud for uninterrupted monitoring.
- Scalable Architecture: Supports large networks of devices with efficient data routing and low latency.
- Rugged and Durable: IP67-certified construction withstands extreme weather and field conditions.
- Intelligent Integration: Fully compatible with IoT platforms, SCADA systems, and enterprise data environments.
- Proven Performance: Trusted by engineering teams and infrastructure owners worldwide for mission-critical applications.


Sentra Wired Sensors
Product Overview:

Sentra Wired Sensors deliver precise, real-time data for continuous structural health monitoring across a wide range of infrastructure and industrial environments.
Engineered for reliability and accuracy, these sensors provide direct, stable, and interference-free measurements—making them ideal for long-term monitoring of structural integrity, load behavior, and vibration response.

Whether installed on bridges, tunnels, buildings, or machinery, Sentra Wired Sensors offer the accuracy and durability required for mission-critical applications, forming an integral part of the Sentra monitoring ecosystem.

Product Lineup:
- Accelerometer: High-precision vibration sensor designed to measure acceleration, velocity, and displacement in structures and machinery.
Ideal for bridge vibration, seismic, and dynamic load monitoring.

- Spot Weldable Strain Gauge: Compact and easy-to-install sensor for measuring localized strain on steel structures, machinery, and pressure vessels.
Features a rugged spot-weldable design for long-term durability in harsh conditions.

- 4100 Series Strain Gauge: High-accuracy strain measurement device suited for long-term structural monitoring.
Designed for bridges, tunnels, and geotechnical applications where reliable strain data is essential.

Key Features and Specifications:
- High-accuracy signal output for structural and mechanical measurements
- Robust construction for long-term field deployment
- Compatible with Sentra Data Loggers and Core Communications devices
- Shielded wiring for interference-free data transmission
- Configurable sampling rates for static and dynamic monitoring
- Cloud-based data visualization and analytics integration
- BIM/GIS integration ready
- Designed for plug-and-play field installation

Why our Wired Sensors
- High-Precision Measurement: Deliver consistent, accurate readings for structural load, vibration, and stress analysis.
- Proven Durability: Engineered for extreme field conditions, ensuring long-term data reliability.
- Flexible Integration: Compatible with a range of Sentra data acquisition systems and industry-standard monitoring platforms.
- Stable Connectivity: Wired configuration eliminates wireless signal interference for uninterrupted performance.
- Field-Tested Reliability: Trusted by engineers and asset managers worldwide for infrastructure, energy, and industrial monitoring projects.


-product complete specifications-

Loadsensing is a family of Worldsensing edge connectivity solutions enabling wireless data transfer with long-range, low power devices
Wireless data acquisition: We offer comprehensive sensor reading solutions for diverse monitoring needs, supporting analog, vibrating wire, and digital sensor interfaces. Our sensors offer multiple input channels to fit specific requirements of tailored configurations. Whether it's a small or a large-scale project, Loadsensing ensures accurate data collection and reliable data transmission. Explore our range of Edge Devices to find the best match for your monitoring needs.

Vibrating Wire: The Vibrating Wire Data Loggers automate data collection by connecting your vibrating wire instruments such as piezometers, load cells, strain gauges and pressure cells wirelessly to your monitoring systems.
- Stream data wirelessly from all leading vibrating wire sensor manufacturers
- Minimum maintenance required, with up to 25 years of unattended operations
- Up to 15 km of communication range using LoRa radio communications

Model Numbers/Models:
LS-G6-VW
LS-G6-VW-1

Datasheet: https://info.worldsensing.com/Datasheet_VibratingWire_EN

Technical Specifications

Category
Details
Input Types
Vibrating wire and thermistor per channel
Variants
LS-G6-VW 5 Channel (external antenna) LS-G6-VW 1 Channel (external antenna)
Memory
73,500 readings for 5 channels 200,000 readings for 1 channel
Operating Temperature
-40ºC to 80ºC
Weather Protection
IP68
System Configuration
Locally via Worldsensing App Remotely using CMT Edge (single-net) or CMT Cloud (multi-net)


Vibrating Wire

Parameter
Details
Measurement Method
Embedded algorithms increasing immunity to noise
Excitation Wave
±5 V
Measurement Range
300 to 7000 Hz
Accuracy
0.008% to 0.013% (depending on frequency sweep range)
Resolution
< 0.01 Hz (depending on frequency sweep range)


Thermistor

Parameter
Details
Measurement Range
0 Ω to 4 MΩ
Resolution
1 Ω
Accuracy (at 20ºC)
0.05ºC (0.04% FS)


Barometer

Parameter
Details
Pressure Range
300 to 1,100 hPa
Relative Accuracy
±0.12 hPa (700 to 900 hPa at 25ºC)


Battery Life Estimations

Reporting Period
1-Channel, 1 Cell
5-Channel, 4 Cells
5 minutes
1.7 years
4.6 years
1 hour
8.6 years
22.7 years
6 hours
12.5 years
>25 years


Vibrating Wire RCR: The vibrating Wire RCR is the best option to securely monitor structural health of tunnel linings and other concrete-based infrastructure from as early as the concrete segment manufacturing stage.

- Ultra-robust 5-channel data logger designed to be embedded in precast concrete to measure real-time stress and strain in concrete segments.
- Suitable for construction projects underground . Up to 3 km radio range.

Models: LS-G6-VW-RCR

Datasheet: https://info.worldsensing.com/VW-RCR_Datasheet_EN?_gl=1*sutcy3*_gcl_au*NjgzMjAxOTU5LjE3NjEzMDU4MTU.

Technical Specifications

Category
Parameter
Specification / Details
Input Types


Vibrating wire and thermistor per channel
Memory


73,500 readings
Vibrating Wire
Measurement Method
Embedded algorithms increasing immunity to noise


Excitation Wave
±5 V


Measurement Range
300 to 7000 Hz


Accuracy
From 0.008% to 0.013% (depending on frequency sweep range)


Resolution
<0.01 Hz (depending on frequency sweep range)
Thermistor
Measurement Range
0 Ω to 4 MΩ


Resolution
1 Ω


Accuracy (20°C)
0.05°C (0.04% FS)
Battery Life Estimations
Reporting Period – 5 min
4.6 years


Reporting Period – 1 h
22.7 years


Reporting Period – 6 h
> 25 years




Digital Data Logger
The Digital Logger is a robust, low-power, long-battery life device that connects to a wide catalog of digital sensors, streaming data wirelessly to your information systems.
The best option to stream data wirelessly from digital sensors using ModBus RTU communications
Compatible with other proprietary protocols from main geotechnical, structural and environmental sensor manufacturers
Unrivalled autonomy and long-range communications to connect digital in-place inclinometers (IPIs) and multipoint borehole extensometers (MPBX) in isolated areas

Model: LS-G6-DIG-2

Datasheet: https://info.worldsensing.com/Datasheet_Digital_EN

Technical specifications

Input types
RS485 full or half duplex supported
Output power
Regulated 12 V DC up to 200 mA in continuous operation. Maximum startup current peak of 1.5 A, up to 50 ms
Supported protocols
MODBUS RTU and proprietary protocols




Analog Data Logger
This 4-channel data logger supports inputs from most analog sensors, enabling connections with any voltage, current, and resistive transducers.

It allows wireless data streaming from analog load cells, strain gauges, pressure cells, pressure sensors, thermometers, flow sensors
Suitable for unattended operations, it offers up to 10 years of battery life and a communication range of up to 15 km

Model: LS-G6-ANALOG-4
Datasheet:
Technical specifications

Category
Parameter
Specification / Details
General
Device Type
Analog industrial data logger


Data Transmission
LoRa radio communication (868 or 915 MHz)


Channels
6 channels


Input Types
Voltage, current loop, potentiometer, full wheatstone bridge


Power Supply per Channel
6.6 V (±0.2 V) – 4 × 1.5 V C cells


Memory Size
64,000 readings (16 bits)


Operating Temperature
−40°C to +80°C


Weather Protection
IP68


System Configuration
Locally via Worldsensing App or remotely using CMT Edge for single-net deployments and CMT Cloud for multi-net deployments
Voltage Input Specifications
Measurement Range
±10 V DC


Accuracy
±(0.02% of reading ±5 µV)
Current Loop Input Specifications
Measuring Range
0–20 mA


Accuracy (25°C)
±(0.02% of reading ±0.5 µA)
Ratiometric and Potentiometer Signals Specifications
Accuracy (25°C)
±(0.03% of reading ±8 µV/V)
Full Wheatstone Bridge Input Specifications
Accuracy (25°C)
±(0.03% of reading ±8 µV/V)
Thermistor Input Specifications
Accuracy (25°C)
±0.05°C (0.04% FS)
PT100 Input Specifications
Accuracy
±0.05°C
Battery Life Estimations
Note
These are typical values for standard operations depending on the logging and transmission intervals.


Reporting Period – 5 min
4.6 years (1-ch) / 4.6 years (5-ch)


Reporting Period – 1 h
22.7 years (1-ch) / 22.7 years (5-ch)


Reporting Period – 6 h
>25 years (1-ch) / >25 years (5-ch)


Piconode Data Logger
The Piconode is a compact data logger that offers the most cost-effective way to capture data from low-power sensors such as rain gauges, load cells, NTC thermistors, and displacement sensors with potentiometer output.

3-channel wireless data logger with a configurable analog channel, a thermistor channel and a pulse counter channel
Suitable for unattended operations, it offers up to 25 years of battery life and a communication range of up to 15 km

Model: LS-G6-PICO
Datasheet: https://info.worldsensing.com/Datasheet_Piconode_EN
Technical specifications

Category
Parameter
Specification / Details
General
Device Type
Compact analog wireless data logger


Data Transmission
LoRa radio communication (868 MHz or 915 MHz)


Channels
3 channels: 1 configurable, 1 thermistor, and 1 pulse counter channel


Operating Temperature
−40°C to +80°C


Weather Protection
IP68


System Configuration
Locally via Worldsensing App or remotely using CMT Edge (single-net deployments) and CMT Cloud (multi-net deployments)
Channel 1: Configurable
Input Types
Voltage, Potentiometer, Full Wheatstone Bridge


Voltage Excitation
0–5 VDC up to 50 mA


Measurement Range
±7.5 mV/V for FWB 0–5 VDC (0–1 V/V) for Potentiometer 0–5 VDC for Single-ended Voltage


Accuracy
0.04% FS for FWB 0.1% FS for Potentiometer 0.04–0.5% FS for Single-ended Voltage
Channel 2: Thermistor
Measuring Range
0 Ω to 2 MΩ


Accuracy (at 25°C)
0.04°C (0.04% FS) for 32kΩ 0.05°C (0.04% FS) for 50kΩ
Channel 3: Pulse Counter
Pulse Count
0 to 4,294,967,295 pulses


Pulse Rate
0 to 50 Hz


Accuracy
±1 Pulse
Battery Life Estimations
Reporting Period
1 Cell / 2 Cells


5 min
1.3 years / 2.9 years


1 h
8.6 years / 17.2 years


6 h
15.4 years / >25 years


Wireless sensors

Leverage low-power wireless sensors from the Loadsensing family. These accelerometer-based sensors operate autonomously using Worldsensing networks. Discover how they integrate into your monitoring systems for accurate tilt, vibration and distance measurements.

Tiltmeter
Worldsensing Tiltmeter provides complementary data for existing geospatial monitoring when high precision and robustness is needed in fixed structures, ground movements and differential settlements of slopes or infrastructure.

3-axis wireless sensor designed to provide measurements of relative inclination changes, either on the ground or in structures
It provides a cost-effective way to monitor track geometry in railway projects in combination with other geospatial monitoring techniques
Up to 25 years of battery life and a communication range of up to 15 km

Model: LS-G6-TIL90-X       LS-G6-TIL90-I
Datasheet: https://info.worldsensing.com/Datasheet_Tilt90_EN
Technical specifications

Category
Parameter
Specification / Details
General
Sensor Type
3-axis MEMS accelerometer and integrated thermometer


Range
±90°


Device Variants
LS-G6-TIL90-X — with external antenna for high-precision applications LS-G6-TIL90-I — with internal antenna for rail track monitoring


Secondary Sensor
Integrated temperature sensor


Power Source
2 × 3.6 V C-size replaceable batteries


Data Transmission
LoRa radio communications (ISM sub-GHz)


Operating Temperature
−40°C to +80°C


Weather Protection
IP68


System Configuration
Device setup and configuration via Worldsensing App. Remote configuration using CMT Edge on single-net deployments and CMT Cloud on multi-net deployments.



Tiltmeter


LS-G6-TIL90-X
LS-G6-TIL90-I


Accuracy (±4°)
±0.005°
±0.006°


Resolution
±0.0001°
±0.0001°


Repeatability
<0.0003°
<0.0015°


Battery Life Estimations
Reporting Period
Lifespan


30 s
6.2 months


5 min
5.1 years


1 h
>25 years


6 h
>25 years


Tiltmeter Event Detection
The Tiltmeter Event Detection is a smart, 3-axis wireless tiltmeter designed to identify ground movements with high precision and low noise with less than 2-second latency in most cases.

3-axis wireless tiltmeter with edge processing capabilities to detect ground movements in less than 2 seconds
Key component of Worldsensing's Early Warning System to monitor zones that are prone to geohazards
Up to 3.5 years of unattended operations, with up to 8 km communication range using LoRa networks

Model: LS-G6-TIL90-XE      LS-G6-TIL90-IE
Datasheet: https://info.worldsensing.com/Datasheet_Tilt90EDS_EN
Technical specifications

Category
Parameter
Specification / Details
General
Sensor Type
3-axis MEMS accelerometer


Range
±15°


Product Variants
LS-G6-TIL90-XE with external antenna LS-G6-TIL90-E with internal antenna


Power Source
2 × 3.6 V C-size replaceable batteries


Data Transmission
LoRa radio communications (ISM sub-GHz)


Operating Temperature
−40°C to +80°C


Weather Protection
IP68


System Configuration
Locally via Worldsensing App or remotely using CMT Edge on single-net deployments and CMT Cloud on multi-net deployments



Category
Parameter
Specification / Details
Normal State Operational Mode
Description
Continuous sampling at 4.9 Hz. Wireless communication to the gateway via LoRa network at a configurable reporting period ranging from 30 min to 24 h.


Accuracy (±4°)
±0.005°


Repeatability
<0.0005°


Offset Temperature Dependency
≤ 0.002°/°C
Threshold Breach
Description
When a reading in continuous sampling logs outside the threshold, an alert message is sent in real time. It also triggers an alert status that changes the data transmission according to the set reporting period for the alert status.


Communication Latency
2 s for 10 simultaneous alerts & 5 s for 25 simultaneous alerts


Repeatability (Continuous Sampling)
<0.0005°


Peak-to-Peak Noise
<0.0006°
Battery Life Estimations
Reporting Period
Lifespan


5 min
2.1 years


30 min
3.2 years


1 h
3.5 years


6 h
5.3 years



Laser Tiltmeter
The Worldsensing Laser Tiltmeter uses a laser to measure distance to reference points and a tiltmeter to detect vertical deviations in ground or structures.

3-in-1 laser distance meter, inclinometer and data logger designed to provide robust data when monitoring inclinations, movements and differential settlements of slopes or infrastructure
Field-proven, non-intrusive method for convergence monitoring with minimal interference to tunneling activities
Great communication ranges underground, with up to 10 km using repeaters
Compatible with Worldsensing's single-net and multi-net configurations

Model: LS-G6-LAS-TIL90
Datasheet: https://info.worldsensing.com/Datasheet_LaserTilt90_EN
Technical specifications
Category
Parameter
Specification / Details
General
Sensor Type
2-in-1 Laser Distance Meter and 3-axis MEMS accelerometer


Power Source
2 × 3.6 V C-size replaceable batteries


Memory
100,000 readings including time, distance, and 3-axis tiltmeter measurements


Data Transmission
LoRa radio communication (ISM sub-GHz)


Operating Temperature
−20°C to +60°C


Weather Protection
IP68


System Configuration
Locally via Worldsensing App or remotely using CMT Edge on single-net deployments and CMT Cloud on multi-net deployments


Category
Parameter
Specification / Details
Laser Distance Meter
Sensor
Visible laser (class II) with 650 nm


Laser Power
0.75 to 0.95 mW


Resolution
0.1 mm


Repeatability (1σ)
0.15 mm


Accuracy
±1 mm at 10 m ±4 mm at 50 m ±8 mm at 150 m
Tiltmeter
Sensor
3-axis MEMS accelerometer


Range
±15°


Accuracy (±4°)
±0.005°


Repeatability
±0.0005°


Resolution
±0.0001°


Temperature Sensor Resolution
0.1°C
Battery Life Estimations
Reporting Period
20 m Distance / 65 m Distance


5 min
1.8 years / 6 months


1 h
10.3 years / 5.1 years


6 h
14.3 years / 9.2 years


Vibration Meter
The Vibration Meter is a wireless sensor that automates data collection for long term, continuous vibration monitoring. It features a tri-axial accelerometer and an exception-based, edge algorithm that allows the detection of threshold breaches for vibration-based events using LAW/PPV and frequency.

High precision 3-axis MEMS accelerometer. Up to 1000 Hz derived from a 4k Hz signal
Configurable operational modes to address different regulatory standards
Up to 1.5 years battery lifespan using a 30 min reporting period, considering a vibration scenario with relevant events triggering alert mode two or three times per week
Great communication ranges underground, with up to 10 km using repeaters
Compatible with Worldsensing's single-net and multi-net configurations

Model: LSG7ACL-BILH-VIB
Datasheet: https://info.worldsensing.com/Datasheet_VibrationMeter_EN
Technical specifications


GNSS Meter
Worldsensing's GNSS Meter is a wireless sensor that enables precise automated measurement of surface point movements. It features advanced multi-band Real-Time Kinematic (RTK) technology and innovative edge processing that delivers millimetric precision with great reliability.

Sub-centimeter level 3D positioning with RTK technology, delivering precision down to 2mm for 24h aggregated values.
Flexible configuration: operates seamlessly as both a base and rover.
Integrated tiltmeter and environmental sensors enhance data accuracy and reliability.
Long-lasting performance with up to 2.6 years of autonomy on an hourly reporting cycle.


Model: LSG7GNS-SXLH
Datasheet: https://info.worldsensing.com/Datasheet_GNSSMeter_EN
Technical specifications

Category
Parameter
Specification / Details
General
Sensor Type
GNSS


Secondary Sensor
Tiltmeter


Environmental Sensor
Integrated temperature and humidity sensor


Power Source
4 × 3.6 V D-size user-replaceable, high energy density batteries


Reporting Period
1 hour


Communication
LoRa radio (ISM sub-GHz)


GNSS Time Synchronization
±5 ns


Reporting Format
Position (WGS84) data for: • Last fix (real-time) • Last 6 h aggregated • Last 24 h aggregated


System Configuration
Device setup and configuration via Worldsensing App. Remote configuration using CMT Edge. Data can be exported to third-party software via MQTT, REST API, or FTP.




Category
Parameter
Specification / Details
GNSS Sensor
Correction Technology
Real Time Kinematic (RTK)


GNSS Channels
184


Constellations / GNSS Signals Received
• GPS: QZSS-L1CA, L2C • GLONASS: L1OF, L2OF • Galileo: E1B/C, E5b • BeiDou: B1I, B2I


GNSS Warmup Time
Selectable from: 10 s 20 s 30 s
Tiltmeter
Sensor Type
3-axis MEMS accelerometer


Range
±15°


Accuracy
±(0.0025° + 0.005% FS) ±(0.005° + 0.012% FS) ±(0.007° + 0.015% FS)


Offset Temperature Dependency
≤ 0.002°/°C
GNSS Precision (95th Percentile)
Distance Base to Rover
40 m (Horizontal / Vertical) 4,000 m (Horizontal / Vertical)


1 h Last Sample
9 mm / 20 mm (40 m) 21 mm / 27 mm (4,000 m)


6 h Aggregated
5 mm / 8 mm (40 m) 8 mm / 14 mm (4,000 m)


24 h Aggregated
2 mm / 3 mm (40 m) 4 mm / 7 mm (4,000 m)
Battery Life Estimations
Warmup Time
10 s / 20 s / 30 s


1 h Reporting Period
3.1 years / 2.9 years / 2.4 years


6 h Reporting Period
10.2 years / 9.9 years / 9.2 years


24 h Reporting Period
22 years / 21 years / 20 years


Core Communications
Leverage top-of-line communication coverage and work with minimum downtimes to deploy robust, secure and reliable communication networks for your monitoring projects

Key features
Choose your network and enable your communications with Worldsensing's broadband and narrowband connectivity portfolio. Extend your narrowband networks using repeaters to gain extra coverage in low-visibility environments

Narrowband communications
Rely on powerful signal strength, excellent interference mitigation and enhanced radio performance for your monitoring systems. Use the 4G Rugged Gateway in combination with the different variants of Worldsensing Management Software to deploy private, locally managed, single-net deployments, or redundant, multi-network deployments managed in the cloud. Leverage the addition of the Edge Repeater to obtain additional radio coverage in underground or tunnel construction projects.

Narrowband gateways
Choose between Edge or Cloud according to your network configuration
4G Rugged Gateway

Narrowband repeaters
Extend your edge networks
K20 Edge Repeater

Broadband communications
Select Worldsensing's broadband communications for high data-rate and high-power monitoring projects. Broadband communications are enabled by Worldsensing's ThreadX3 Device, a fully autonomous sensor connectivity device with an integrated 4G/LTE cellular modem, wireless mesh networking, and an internal battery pack.

Broadband gateways
2-in-1 data logger and gateway for broadband communications
Thread

Narrowband Communications
Gateway: 4G Rugged Gateway
The 4G Rugged Gateway is an outdoor LoRa gateway featuring 4G and Ethernet backhaul connectivity. It serves as the core communication hub for Worldsensing edge devices, efficiently connecting a high volume of end devices and managing millions of bidirectional messages daily.

The 4G Rugged Gateway is a key component for Worldsensing's narrowband networks
Provides connectivity in areas without internet coverage using LoRa/LoRaWAN radio communications
Supports private, single-network local deployments and redundant, multi-network cloud deployments with Worldsensing's CMT software.
4G Rugged Gateway Cloud
Set up multi-gateway networks for data redundancy: if one gateway fails, data is routed through alternative gateways to CMT Cloud. Manage all networks, devices, and data from a single interface in CMT Cloud.
4G Rugged Gateway Edge
Operate your network, device and data locally via ethernet or 4G using the embedded CMT Edge. Compatible with the K20 Edge Repeater in the 863-874.4MHz (EMEA, India) and 915-928MHz (APAC, Latin America) bands for extended radio range.
4G Rugged Gateway Edge 915R
Operate your network, device and data locally via ethernet or 4G using the embedded CMT Edge. Compatible with the K20 Edge Repeater 915R for extended radio range in the 902-928MHz (North America) radio band.

Model: LS-M6-KIO-GW     LS-G6-KIO-GW      LS-G6-KIOGW915R
Datasheet:
4G Rugged Gateway - Cloud
https://info.worldsensing.com/datasheet_4GGatewayCloud_EN?_gl=1*11d58oe*_gcl_au*NjgzMjAxOTU5LjE3NjEzMDU4MTU.

Edge Gateway Datasheet EN
https://info.worldsensing.com/datasheet_4GGatewayEdge_EN?_gl=1*337tu4*_gcl_au*NjgzMjAxOTU5LjE3NjEzMDU4MTU.

Edge Gateway 915R Datasheet EN
https://info.worldsensing.com/Datasheet_4GRuggedGatewayEdge915R_EN?_gl=1*337tu4*_gcl_au*NjgzMjAxOTU5LjE3NjEzMDU4MTU.
Edge Gateway Datasheet PT
https://info.worldsensing.com/4G-Rugged-Gateway-Edge-datasheet-PT?_gl=1*jn3usr*_gcl_au*NjgzMjAxOTU5LjE3NjEzMDU4MTU.

Technical specifications
Category
Specification / Details
Radio Communication Protocol
LoRa / LoRaWAN
Backhaul Connectivity
4G Worldwide module with 3G/2G fallback; Ethernet (RJ45)
Antenna
Integrated internal antennas: GPS, 4G, LoRa (peak gain = 2.6 dBi) Optional external antenna
Supported Unlicensed Bands
863–874.4 MHz (EMEA, India), 902–928 MHz (North America), 915–928 MHz (APAC, Latin America)
Rx Sensitivity
−141 dBm (SF12)
Weather Protection
IP68
Operating Temperature
−40°C to +60°C
Local Access
Via USB-C port


Category
Parameter
Specification / Details
Device Interfaces
Ethernet
Waterproof RJ45


Cellular
Waterproof Mini SIM card slot
Power Requirements
Power Options
PoE both mode A and mode B (802.3 af specifications) 5V through USB-C PoE injector for indoor use included in the kit


Mean Power Consumption
4.5 W

K20 Edge Repeater
The repeater retransmits data from its associated nodes to the main gateway. Data can travel along multiple repeaters in hops before arriving at the main gateway, thus gaining significant longer range.
The K20 Edge Repeater extends the network range of single-net deployments
Field-proven tree network technology which has been tested for both straight and curved tunnels in underground mines
Up to 10 km of radio coverage for underground monitoring systems
Compared to other network topologies, long-range LoRa Tree topology offers the longest radio range in underground environments

Product Variants
K20 Edge Repeater
K20 Edge Repeater 915R

Model: RPK20E
Datasheet: https://info.worldsensing.com/K20EdgeRepeater_Datasheet?_gl=1*1keb51l*_gcl_au*NjgzMjAxOTU5LjE3NjEzMDU4MTU.
Technical specifications

Category
Parameter
Specification / Details
Radio Communication Protocol


LoRa
Supported Unlicensed Bands


863–874.4 MHz (EMEA, India), 902–928 MHz (North America), 915–928 MHz (APAC, Latin America)
Antenna


Integrated internal antennas GPS, 4G, LoRa (peak gain = 2.6 dBi)
Maximum Distance Between Hops


150 m to 3 km / 0.1 mi to 1.83 mi
Maximum Number of Hops


8 hops
Sensitivity
Node to Repeater / Gateway
Down to −137 dBm (SF11)


Repeater to Repeater / Gateway
Down to −127 dBm (SF7)
Communications Performance
Message Rate (Default Network)
3.125 messages/min


Probability of Transmission Success (Default Network)
> 99.7% ± 3σ


Message Rate (High Demand Network)
8 messages/min


Probability of Transmission Success (High Demand Network)
> 98.75% ± 2.5σ
Device Capacity per Network
Reporting Period — 5 min
Default Network: 15 High Demand Network: 40


Reporting Period — 30 min
Default Network: 93 High Demand Network: 240


Reporting Period — 1 h
Default Network: 187 High Demand Network: 480
Power Options
Power Options
PoE both mode A and mode B (802.3af specifications); 5V through USB-C; PoE injector for indoor use included in the kit


Mean Power Consumption
4.5 W


Weather Protection
IP67


Operating Temperature
−40°C to +60°C


Broadband Communications
Thread
The Thread X3 is designed for customers needing broadband connectivity for high data-rate, high-power industrial projects. This autonomous device features an integrated 4G/LTE modem, wireless mesh networking, and a battery pack in a weather-resistant enclosure.

The Thread X3 is the key component for Worldsensing's broadband networks
Provides robust connectivity to sensors that are data-intensive and power-demanding
Enables complex monitoring applications with simple configuration steps

Model: ThreadX3
Datasheet: https://info.worldsensing.com/Datasheet_ThreadX3_EN?_gl=1*147tzpe*_gcl_au*NjgzMjAxOTU5LjE3NjEzMDU4MTU.
Technical specifications

Category
Parameter
Specification / Details
Network Features
Cellular
Integrated SIM card. Globally compliant on 600+ cellular networks across 190 countries.


Ethernet
10/100 Ethernet interface with end-to-end encrypted communication secured by TLS 1.2.


Wireless Mesh
LPWA with compatible devices and smart sensors through MQTT-SN standard. Automatic network role detection (Gateway, Repeater, or Endpoint).



Category
Parameter
Specification / Details
Sensor I/O
Number of Channels
3 channels


Input Types
Channel 01: USB, RS232, RS485, 4–20 mA Channel 02: RS232, RS485, 4–20 mA Channel 03: RS232, RS485, 4–20 mA


Power
12 or 15 VDC Out, up to 20 W


Advanced Capabilities
Supports Multiplexer (MUX) with up to 128 sensors. Relay capabilities: each device port can output 12V that can be toggled on/off manually, via API integration, alert trigger, or recorded flow.
Power Requirements
Input Voltage
Nominal voltage 24 VDC, range 15–26 VDC


Mean Power Consumption
Up to 2500 mA RMS (Charge mode); 200 mA RMS (Standard mode); 20 mA RMS (Low power mode) @ 24 VDC


Direct Connect Solar Panel
Maximum Peak Power (Pmax): 160 W Maximum open circuit voltage (Voc): 22.9 V Optimum operating voltage (Vmp): 20.2 V Maximum operating current (Imp): 7.92 A


Battery
Internal 12.8 V 9.9 AH (126.72 Wh) LiFePO4

Creator of Sentra's website and Developers of Veronica: Vasamsetti Yuva Subharam and Vishal Das

And Vishal Das is the Sales and Business Development Expert of Sentra

You have the ability to access and fetch content from websites. When a user asks for information that requires current data, external research, or information not in your training data, you can request web access by including "Can i Access Website:" followed by the URL in your response. The system will fetch the content and provide it to you for analysis. Use this capability when:
- Questions require data from external sources
- Technical specifications or documentation from other websites

Your responsibilities:
1. Provide expert guidance on Sentra products and solutions (accelerometers, strain gauges, tiltmeters, vibration meters, data loggers, gateways, communications modules)
2. Answer questions about infrastructure monitoring, structural health monitoring (SHM), bridge inspection, geotechnical monitoring, and all solution domains
3. Assist with technical queries about sensor installation, data acquisition, and real-time monitoring
4. Help with information about Sentra's services including NDT, consulting, digital engineering, and asset management
5. Provide details about IoT solutions, edge devices, and cloud integration
6. Direct users to appropriate resources or contact information for sales inquiries

CRITICAL: When users ask about OUR PRODUCTS or SOLUTIONS, mention they can contact Sentra for demos, quotes, or detailed specifications. Encourage them to reach out via phone or email. The frontend will automatically display authoritative contact information including:
- Phone: +91 7893023322
- Email: sentra@clovetech.com
- Office Address: IT SEZ, Plot No. 9, Pedda Rushikonda, Rushikonda, Visakhapatnam, Andhra Pradesh 530045

Always maintain a professional, helpful tone and provide accurate, relevant information about Sentra's offerings.`;
