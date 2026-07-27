const chatBody = document.querySelector("#chat-body");
const messageInput = document.querySelector(".message-input");
const sendMessage = document.querySelector("#send-message");
const fileInput = document.querySelector("#file-input");
const fileUploadWrapper = document.querySelector(".file-upload-wrapper");
const fileCancelButton = fileUploadWrapper.querySelector("#file-cancel");
const chatbotToggler = document.querySelector("#chatbot-toggler");
const closeChatbot = document.querySelector("#close-chatbot");

// User info form elements
const userInfoForm = document.querySelector("#user-info-form");
const infoForm = document.querySelector("#info-form");
const userNameInput = document.querySelector("#user-name");
const userEmailInput = document.querySelector("#user-email");
const submitInfoBtn = document.querySelector("#submit-info");
const nameError = document.querySelector("#name-error");
const emailError = document.querySelector("#email-error");
const chatFooter = document.querySelector("#chat-footer");
const welcomeMessage = document.querySelector("#welcome-message");

// Conversation threads / presence / notification elements
const threadsToggler = document.querySelector("#threads-toggler");
const threadsPanel = document.querySelector("#threads-panel");
const threadsList = document.querySelector("#threads-list");
const newConversationBtn = document.querySelector("#new-conversation-btn");
const togglerPresenceDot = document.querySelector("#togglerPresenceDot");
const togglerUnreadBadge = document.querySelector("#togglerUnreadBadge");
const agentStatusLine = document.querySelector("#agentStatusLine");
const agentStatusText = document.querySelector("#agentStatusText");

// Keep references to the two static chat-body children (welcome message +
// predefined questions) so we can always restore them, even after the DOM
// has been emptied out to show a past conversation's real history.
const staticWelcomeNode = chatBody.children[0];
const staticPredefinedNode = document.querySelector("#predefined-questions");

// -----------------------------------------------------------------
// API Configuration
// -----------------------------------------------------------------
// All API calls are now routed through the backend server for security
// No direct calls to external APIs from the frontend
// Determine the API endpoint based on current environment
const getAPIEndpoint = () => {
  // Check if running on localhost with Live Server (port 5539)
  if (window.location.port === '5539') {
    // Return production worker for testing on localhost
    return 'https://veronica-sentra-prod.subharam-v.workers.dev/api/chat';
  }

  // Check if running on localhost:3000 (Node server)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return '/api/chat';
  }

  // Production deployment - use Cloudflare Worker (production environment)
  const PRODUCTION_BACKEND_URL = 'https://veronica-sentra-prod.subharam-v.workers.dev/api/chat';

  return PRODUCTION_BACKEND_URL;
};

const API_ENDPOINT = getAPIEndpoint();

// Request throttling to prevent rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 second minimum between requests

const shouldThrottleRequest = () => {
  const now = Date.now();
  if (now - lastRequestTime < MIN_REQUEST_INTERVAL) {
    return true;
  }
  lastRequestTime = now;
  return false;
};

// Initialize user message and file data
const userData = {
  message: null,
  file: {
    data: null,
    mimeType: null, // <-- FIX: Changed from mime_type
  },
};

// User profile data
let userProfile = {
  name: null,
  email: null,
  isFormSubmitted: false
};

// Function to save user profile to localStorage
function saveUserProfile() {
  localStorage.setItem('sentraChatbotUserProfile', JSON.stringify(userProfile));
}

// Function to load user profile from localStorage
function loadUserProfile() {
  const savedProfile = localStorage.getItem('sentraChatbotUserProfile');
  if (savedProfile) {
    userProfile = JSON.parse(savedProfile);
    return true;
  }
  return false;
}

// Store chat history - Now starts empty.
const chatHistory = [];
const MAX_CHAT_HISTORY = 20; // keep last 20 exchanges to avoid payload bloat

// Chat session ID for tracking in admin dashboard
let chatSessionId = localStorage.getItem('sentraChatSessionId');
if (!chatSessionId) {
  chatSessionId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('sentraChatSessionId', chatSessionId);
}

// Function to save chat message to backend for admin dashboard
async function saveChatMessage(message, sender) {
  try {
    const apiBaseUrl = getAPIEndpoint().replace('/api/chat', '');
    await fetch(apiBaseUrl + '/api/chat-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: chatSessionId,
        message: message,
        leadName: userProfile.name || '',
        leadEmail: userProfile.email || '',
        sender: sender
      })
    });
  } catch (e) {
    console.error('Failed to save chat message:', e);
  }
  upsertThread(chatSessionId, message);
}

function escapeForHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : str;
  return d.innerHTML;
}

const BOT_AVATAR_SVG = `<svg class="bot-avatar" xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 1024 1024">
  <path d="M738.3 287.6H285.7c-59 0-106.8 47.8-106.8 106.8v303.1c0 59 47.8 106.8 106.8 106.8h81.5v111.1c0 .7.8 1.1 1.4.7l166.9-110.6 41.8-.8h117.4l43.6-.4c59 0 106.8-47.8 106.8-106.8V394.5c0-59-47.8-106.9-106.8-106.9zM351.7 448.2c0-29.5 23.9-53.5 53.5-53.5s53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5-53.9-23.9-53.5-53.5zm157.9 267.1c-67.8 0-123.8-47.5-132.3-109h264.6c-8.6 61.5-64.5 109-132.3 109zm110-213.7c-29.5 0-53.5-23.9-53.5-53.5s23.9-53.5 53.5-53.5 53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5zM867.2 644.5V453.1h26.5c19.4 0 35.1 15.7 35.1 35.1v121.1c0 19.4-15.7 35.1-35.1 35.1h-26.5zM95.2 609.4V488.2c0-19.4 15.7-35.1 35.1-35.1h26.5v191.3h-26.5c-19.4 0-35.1-15.7-35.1-35.1zM561.5 149.6c0 23.4-15.6 43.3-36.9 49.7v44.9h-30v-44.9c-21.4-6.5-36.9-26.3-36.9-49.7 0-28.6 23.3-51.9 51.9-51.9s51.9 23.3 51.9 51.9z" />
</svg>`;

// -----------------------------------------------------------------
// Lead Qualification Questionnaire
// -----------------------------------------------------------------
// An agent can push this from the admin dashboard ("Send Questionnaire").
// It arrives as a normal agent chat message whose text is this sentinel;
// instead of showing that literal text, the widget renders an interactive
// button flow. The final answer is saved as a regular chat message (via
// saveChatMessage), so it flows through the exact same admin notification
// pipeline (badge + sound) as any other message - no separate plumbing needed.
const QUALIFY_SENTINEL = '__QUALIFY_START__';
const IMG_MSG_PREFIX = '__IMG__';

const QUALIFY_PRODUCT_CATEGORIES = ['Edge Devices', 'Core Communications', 'Wired Sensors', 'Not sure yet'];
const QUALIFY_SOLUTION_CATEGORIES = [
  'Structural Health Monitoring', 'Advanced NDT', 'Bridge Inspection',
  'Asset Monitoring', 'Geotechnical Monitoring', 'Fatigue Assessment',
  'Digital Engineering', 'Not sure yet'
];

function renderQualifyOptions(options, onSelect) {
  const wrap = document.createElement('div');
  wrap.className = 'qualify-options';
  options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'qualify-option';
    btn.textContent = opt;
    btn.addEventListener('click', () => {
      wrap.remove();
      onSelect(opt);
    });
    wrap.appendChild(btn);
  });
  chatBody.appendChild(wrap);
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: 'smooth' });
  return wrap;
}

function appendQualifyBotNote(text) {
  const div = createMessageElement(
    `${BOT_AVATAR_SVG}<div class="message-text">${escapeForHtml(text)}</div>`,
    'bot-message'
  );
  chatBody.appendChild(div);
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: 'smooth' });
}

function appendQualifyUserChoice(text) {
  const div = createMessageElement(`<div class="message-text">${escapeForHtml(text)}</div>`, 'user-message');
  chatBody.appendChild(div);
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: 'smooth' });
  saveChatMessage(text, 'user');
}

function finalizeQualification(category, subcategory) {
  const summary = subcategory && subcategory !== 'Not sure yet'
    ? `📋 Lead Interest: ${category} → ${subcategory}`
    : `📋 Lead Interest: ${category}`;
  appendQualifyUserChoice(summary);
  appendQualifyBotNote("Thanks! I've passed this along to our team — they'll follow up with more details shortly.");
}

function startQualificationFlow() {
  appendQualifyBotNote("Is there anything specific you're looking for?");
  renderQualifyOptions(['Products', 'Solutions', 'Just browsing'], (choice) => {
    appendQualifyUserChoice(choice);
    if (choice === 'Products') {
      appendQualifyBotNote('Which product category interests you?');
      renderQualifyOptions(QUALIFY_PRODUCT_CATEGORIES, (sub) => finalizeQualification(choice, sub));
    } else if (choice === 'Solutions') {
      appendQualifyBotNote('Which solution area interests you?');
      renderQualifyOptions(QUALIFY_SOLUTION_CATEGORIES, (sub) => finalizeQualification(choice, sub));
    } else {
      finalizeQualification(choice, '');
    }
  });
}

// -----------------------------------------------------------------
// Conversation Threads (per-device history, switch / delete / new)
// -----------------------------------------------------------------
// "Delete" here only removes the thread from this browser's local list -
// the admin dashboard / Google Sheet always keeps the full record.
const THREADS_KEY = 'sentraChatThreads';

function getThreads() {
  try { return JSON.parse(localStorage.getItem(THREADS_KEY) || '[]'); } catch { return []; }
}

function saveThreads(threads) {
  localStorage.setItem(THREADS_KEY, JSON.stringify(threads));
}

function upsertThread(sessionId, lastMessage) {
  const threads = getThreads();
  const idx = threads.findIndex(t => t.sessionId === sessionId);
  const existing = idx >= 0 ? threads[idx] : null;
  const entry = {
    sessionId,
    lastMessage: lastMessage || (existing ? existing.lastMessage : ''),
    updatedAt: Date.now(),
    createdAt: existing ? existing.createdAt : Date.now()
  };
  if (idx >= 0) threads[idx] = entry; else threads.unshift(entry);
  saveThreads(threads);
}

function removeThreadLocal(sessionId) {
  saveThreads(getThreads().filter(t => t.sessionId !== sessionId));
}

function renderThreadsPanel() {
  const threads = getThreads().sort((a, b) => b.updatedAt - a.updatedAt);
  if (!threads.length) {
    threadsList.innerHTML = '<div class="threads-empty">No past conversations yet.</div>';
    return;
  }
  threadsList.innerHTML = threads.map(t => `
    <div class="thread-item ${t.sessionId === chatSessionId ? 'active' : ''}" data-session-id="${t.sessionId}">
      <div class="thread-item-main" data-action="switch">
        <div class="thread-item-date">${new Date(t.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
        <div class="thread-item-preview">${escapeForHtml(t.lastMessage || 'New conversation')}</div>
      </div>
      <button type="button" class="thread-item-delete" data-action="delete" title="Delete from this device">🗑</button>
    </div>
  `).join('');
}

function openThreadsPanel() {
  renderThreadsPanel();
  threadsPanel.style.display = 'flex';
}

function closeThreadsPanel() {
  threadsPanel.style.display = 'none';
}

if (threadsToggler) {
  threadsToggler.addEventListener('click', () => {
    if (threadsPanel.style.display === 'flex') closeThreadsPanel();
    else openThreadsPanel();
  });
}

if (threadsList) {
  threadsList.addEventListener('click', (e) => {
    const item = e.target.closest('.thread-item');
    if (!item) return;
    const sid = item.dataset.sessionId;
    if (e.target.closest('[data-action="delete"]')) {
      removeThreadLocal(sid);
      renderThreadsPanel();
      return;
    }
    if (sid !== chatSessionId) switchToThread(sid);
    else closeThreadsPanel();
  });
}

if (newConversationBtn) {
  newConversationBtn.addEventListener('click', startNewConversation);
}

function stopChatPolling() {
  if (agentPollTimer) { clearInterval(agentPollTimer); agentPollTimer = null; }
}

// Empties chat-body completely so a past conversation's real transcript can
// be shown in its place.
function clearChatBodyForHistory() {
  while (chatBody.firstChild) chatBody.removeChild(chatBody.firstChild);
}

// Restores the original welcome message + predefined-question cards for a
// brand new conversation.
function resetToFreshConversationView() {
  clearChatBodyForHistory();
  chatBody.appendChild(staticWelcomeNode);
  if (staticPredefinedNode) {
    chatBody.appendChild(staticPredefinedNode);
    staticPredefinedNode.style.display = '';
  }
  const greeting = getTimeBasedGreeting();
  welcomeMessage.textContent = `${greeting}, ${userProfile.name}! How can I help you today?`;
}

function renderHistoryMessage(m) {
  if (m.sender === 'user') {
    const div = createMessageElement(`<div class="message-text">${escapeForHtml(m.message)}</div>`, 'user-message');
    chatBody.appendChild(div);
  } else if (m.sender === 'agent') {
    if (m.message === QUALIFY_SENTINEL) {
      // Don't replay the interactive button flow when just viewing history -
      // just note that it happened.
      appendSystemNotice('📋 A qualification questionnaire was sent in this conversation.');
    } else {
      appendAgentMessage(m.message, m.agentName, true);
    }
  } else {
    const div = createMessageElement(`${BOT_AVATAR_SVG}<div class="message-text">${parseMarkdown(m.message)}</div>`, 'bot-message');
    chatBody.appendChild(div);
  }
}

async function loadThreadHistoryIntoView(sessionId) {
  try {
    const apiBaseUrl = getAPIEndpoint().replace('/api/chat', '');
    const res = await fetch(apiBaseUrl + '/api/chat-history?sessionId=' + encodeURIComponent(sessionId));
    if (!res.ok) return;
    const data = await res.json();
    const messages = data.messages || [];
    messages.forEach(renderHistoryMessage);
    lastSeenChatCount = messages.length;

    const last = messages[messages.length - 1];
    if (last && last.sender === 'agent' && last.status !== 'closed') {
      liveAgentConnected = true;
      updateAgentStatusUI(true, last.agentName);
    } else {
      updateAgentStatusUI(false);
    }
  } catch (e) {
    console.error('Failed to load thread history:', e);
  }
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: 'auto' });
}

async function switchToThread(sessionId) {
  stopChatPolling();
  chatSessionId = sessionId;
  localStorage.setItem('sentraChatSessionId', chatSessionId);
  liveAgentConnected = false;
  lastSeenChatCount = 0;
  clearChatBodyForHistory();
  await loadThreadHistoryIntoView(sessionId);
  startChatPolling();
  closeThreadsPanel();
}

function startNewConversation() {
  stopChatPolling();
  const newId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  chatSessionId = newId;
  localStorage.setItem('sentraChatSessionId', chatSessionId);
  liveAgentConnected = false;
  lastSeenChatCount = 0;
  updateAgentStatusUI(false);
  resetToFreshConversationView();
  upsertThread(newId, '');
  startChatPolling();
  closeThreadsPanel();
}

// -----------------------------------------------------------------
// Live Agent Handover
// -----------------------------------------------------------------
// While a human support agent is actively replying from the admin
// dashboard, the AI (Veronica) stays quiet so the two don't talk over
// each other. We detect this by polling /api/chat-history for this
// session and watching for messages with sender === 'agent'. When the
// admin clicks "End Chat" the last row's status flips to 'closed',
// which is our signal to resume the AI.
let liveAgentConnected = false;
let lastSeenChatCount = 0;
let agentPollTimer = null;
let widgetUnreadCount = 0;

function isWidgetOpen() {
  return document.body.classList.contains('show-chatbot');
}

function updateTogglerBadge() {
  if (widgetUnreadCount > 0) {
    togglerUnreadBadge.textContent = widgetUnreadCount > 9 ? '9+' : String(widgetUnreadCount);
    togglerUnreadBadge.style.display = 'flex';
  } else {
    togglerUnreadBadge.style.display = 'none';
  }
}

function updateAgentStatusUI(connected, agentName) {
  if (connected) {
    agentStatusLine.style.display = 'flex';
    agentStatusText.textContent = (agentName || 'Support agent') + ' is here';
    togglerPresenceDot.style.display = 'block';
    togglerPresenceDot.classList.remove('dot-red');
    togglerPresenceDot.classList.add('dot-green');
  } else {
    agentStatusLine.style.display = 'none';
    togglerPresenceDot.classList.remove('dot-green');
    togglerPresenceDot.style.display = 'none';
  }
}

function flashAgentLeftDot() {
  togglerPresenceDot.classList.remove('dot-green');
  togglerPresenceDot.classList.add('dot-red');
  togglerPresenceDot.style.display = 'block';
  setTimeout(() => {
    togglerPresenceDot.classList.remove('dot-red');
    togglerPresenceDot.style.display = 'none';
  }, 6000);
}

function appendSystemNotice(text) {
  const noticeDiv = createMessageElement(
    `<div class="message-text" style="text-align:center;font-size:12px;color:var(--text-muted,#787c82);width:100%;">${text}</div>`,
    "bot-message",
    "system-notice"
  );
  chatBody.appendChild(noticeDiv);
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
}

function appendAgentMessage(text, agentName, skipUnread) {
  const isImage = typeof text === 'string' && text.startsWith(IMG_MSG_PREFIX);
  const bodyHtml = isImage
    ? `<img src="${text.slice(IMG_MSG_PREFIX.length)}" class="agent-image-attachment" alt="Attachment">`
    : escapeForHtml(text);
  const agentDiv = createMessageElement(
    `<div class="message-text"><strong style="color:#f48120;">${escapeForHtml(agentName || 'Support Agent')}</strong><br>${bodyHtml}</div>`,
    "bot-message",
    "agent-message"
  );
  chatBody.appendChild(agentDiv);
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
  upsertThread(chatSessionId, isImage ? '📎 Image' : text);

  if (!skipUnread && !isWidgetOpen()) {
    widgetUnreadCount++;
    updateTogglerBadge();
    playNotifySound();
  }
}

// A beep needs one prior user gesture on the page before browsers allow
// audio - grab the first click anywhere to unlock it.
let widgetAudioCtx = null;
document.addEventListener('click', () => {
  if (!widgetAudioCtx) {
    try { widgetAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
}, { once: true });

function playNotifySound() {
  if (!widgetAudioCtx) return;
  try {
    const o = widgetAudioCtx.createOscillator();
    const g = widgetAudioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = 740;
    g.gain.value = 0.15;
    o.connect(g);
    g.connect(widgetAudioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, widgetAudioCtx.currentTime + 0.4);
    o.stop(widgetAudioCtx.currentTime + 0.4);
  } catch (e) {}
}

async function pollChatUpdates() {
  try {
    const apiBaseUrl = getAPIEndpoint().replace('/api/chat', '');
    const res = await fetch(apiBaseUrl + '/api/chat-history?sessionId=' + encodeURIComponent(chatSessionId));
    if (!res.ok) return;
    const data = await res.json();
    const messages = data.messages || [];

    if (messages.length > lastSeenChatCount) {
      const newMessages = messages.slice(lastSeenChatCount);
      newMessages.forEach((m) => {
        if (m.sender === 'agent') {
          if (!liveAgentConnected) {
            liveAgentConnected = true;
            appendSystemNotice('🟢 A support agent has joined the conversation. Veronica will pause while they assist you.');
            updateAgentStatusUI(true, m.agentName);
          }
          if (m.message === QUALIFY_SENTINEL) {
            startQualificationFlow();
          } else {
            appendAgentMessage(m.message, m.agentName);
          }
        }
      });
      lastSeenChatCount = messages.length;
    }

    const lastStatus = messages.length ? messages[messages.length - 1].status : '';
    if (liveAgentConnected && lastStatus === 'closed') {
      liveAgentConnected = false;
      appendSystemNotice('🔴 The support agent has left the chat. Veronica is back to help you.');
      updateAgentStatusUI(false);
      flashAgentLeftDot();
    }
  } catch (err) {
    console.error('Chat poll failed:', err);
  }
}

// Establish a baseline message count first so we don't replay an old,
// already-closed conversation's agent messages as if they were new.
async function startChatPolling() {
  if (agentPollTimer) return;
  try {
    const apiBaseUrl = getAPIEndpoint().replace('/api/chat', '');
    const res = await fetch(apiBaseUrl + '/api/chat-history?sessionId=' + encodeURIComponent(chatSessionId));
    if (res.ok) {
      const data = await res.json();
      lastSeenChatCount = (data.messages || []).length;
    }
  } catch (e) {
    console.error('Chat poll baseline failed:', e);
  }
  agentPollTimer = setInterval(pollChatUpdates, 7000);
}

// -----------------------------------------------------------------
// Presence heartbeat (lets the admin see if the user's chat box is open)
// -----------------------------------------------------------------
let presenceInterval = null;

async function sendPresence(status) {
  try {
    const apiBaseUrl = getAPIEndpoint().replace('/api/chat', '');
    await fetch(apiBaseUrl + '/api/chat-presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: chatSessionId, status })
    });
  } catch (e) {}
}

function sendPresenceBeacon(status) {
  try {
    const apiBaseUrl = getAPIEndpoint().replace('/api/chat', '');
    const blob = new Blob([JSON.stringify({ sessionId: chatSessionId, status })], { type: 'application/json' });
    navigator.sendBeacon(apiBaseUrl + '/api/chat-presence', blob);
  } catch (e) {}
}

function startPresenceHeartbeat() {
  sendPresence('open');
  if (presenceInterval) clearInterval(presenceInterval);
  presenceInterval = setInterval(() => sendPresence('open'), 30000);
}

function stopPresenceHeartbeat() {
  if (presenceInterval) { clearInterval(presenceInterval); presenceInterval = null; }
  sendPresence('closed');
}

window.addEventListener('beforeunload', () => sendPresenceBeacon('closed'));
document.addEventListener('visibilitychange', () => {
  if (!userProfile.isFormSubmitted) return;
  if (document.visibilityState === 'hidden') {
    if (isWidgetOpen()) sendPresenceBeacon('closed');
  } else if (isWidgetOpen()) {
    startPresenceHeartbeat();
  }
});

// ----- Site content fetching (sentratech.in) -----
let cachedSiteContent = null;
const SITE_PAGES = [
  '/',
  '/products.html',
  '/solutions.html',
  '/about.html'
];

async function fetchSiteContent() {
  if (cachedSiteContent) return cachedSiteContent;
  const parts = [];
  
  for (const path of SITE_PAGES) {
    try {
      // Use relative path directly to ensure it uses the current origin automatically
      const resp = await fetch(path, { method: 'GET' });
      if (!resp.ok) continue;
      const html = await resp.text();
      // extract visible text using DOMParser to avoid raw HTML
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        // remove script and style
        doc.querySelectorAll('script,style,noscript').forEach(n => n.remove());
        const text = doc.body.innerText.replace(/\s+/g, ' ').trim();
        if (text) parts.push(`--- ${path} ---\n${text}`);
      } catch (e) {
        // fallback: strip tags
        const stripped = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (stripped) parts.push(`--- ${path} ---\n${stripped}`);
      }
    } catch (err) {
      // skip page on error
    }
    // stop if we collected a lot
    if (parts.join('\n').length > 15000) break;
  }
  cachedSiteContent = parts.join('\n\n').slice(0, 15000);
  return cachedSiteContent;
}

// ----- Interaction & CTA management -----
const INTERACTION_KEY = 'sentratech_chat_interactions_v1';
const CTA_SUPPRESS_KEY = 'sentratech_cta_suppressed_v1';
const CTA_SHOWN_KEY = 'sentratech_cta_shown_v1';

function getInteractionCount() {
  return parseInt(localStorage.getItem(INTERACTION_KEY) || '0', 10);
}

function incrementInteractionCount() {
  const next = getInteractionCount() + 1;
  localStorage.setItem(INTERACTION_KEY, String(next));
  return next;
}

function isCtaSuppressed() {
  return localStorage.getItem(CTA_SUPPRESS_KEY) === '1';
}

function markCtaSuppressed() {
  localStorage.setItem(CTA_SUPPRESS_KEY, '1');
}

function isCtaShown() {
  return localStorage.getItem(CTA_SHOWN_KEY) === '1';
}

function markCtaShown() {
  localStorage.setItem(CTA_SHOWN_KEY, '1');
}

// strip emojis and other pictographs
function stripEmojis(text) {
  if (!text) return text;
  // wide regex to remove most emoji ranges
  return text.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|[\uD83C-\uDBFF\uDC00-\uDFFF]|[\u2011-\u26FF])/g, '')
    .replace(/\uFE0F/g, '')
    .replace(/\s+\u200D\s+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// =============================================================
// Predefined Questions & Answers (Smart Matching)
// =============================================================
const predefinedQuestions = [
  {
    id: 'shm',
    question: 'What is Structural Health Monitoring?',
    keywords: ['structural health monitoring', 'shm', 'bridge monitoring', 'real-time monitoring', 'structure monitoring', 'health monitoring'],
    category: 'Solutions',
    answer: `**Structural Health Monitoring (SHM)**

Sentra's Structural Health Monitoring delivers continuous, real-time data collection using wireless sensors and edge devices to detect stress, strain, displacement, and vibration in infrastructure assets.

**Key Capabilities:**
- Real-time monitoring for bridges, buildings, tunnels, and railways
- Early warning detection for structural anomalies
- AI-powered predictive analytics for proactive maintenance
- Integration with BIM/GIS for digital twin visualization
- Cloud-based dashboards with customizable alerts

**Benefits:**
- Extends asset lifespan through data-driven maintenance
- Reduces inspection costs with automated monitoring
- Enhances public safety with real-time alerts

[Learn more about SHM](./solutions/structural-health-monitoring.html)`
  },
  {
    id: 'edge-devices',
    question: 'Tell me about Edge Devices',
    keywords: ['edge device', 'edge', 'sensor', 'wireless sensor', 'data logger', 'iot device', 'vibrating wire', 'tiltmeter', 'data acquisition'],
    category: 'Products',
    answer: `**Edge Devices Overview**

Sentra Edge Devices are designed for continuous structural health monitoring across diverse environments. They capture acceleration data across a wide frequency spectrum (0.1 Hz - 10 kHz) and transmit it to cloud platforms for real-time visualization.

**Product Lineup:**
- **Vibrating Wire** - Precise strain and pressure measurements for geotechnical monitoring
- **Vibrating Wire RCR** - Enhanced model with real-time compensation
- **Digital Data Logger** - Captures and transmits sensor data via LoRaWAN or LTE
- **Analog Data Logger** - Supports analog sensor inputs
- **Piconode Data Logger** - Compact, low-power logger for distributed networks
- **Tiltmeter** - Monitors structural inclination in real time
- **Tiltmeter Event Detection** - Detects sudden tilting events automatically
- **Vibration Meter** - Records vibration patterns for structural integrity
- **Laser Tiltmeter** - High-precision optical micro-level tilt detection
- **GNSS Meter** - Geospatial displacement tracking using satellite positioning

**Key Features:** 3-axis MEMS, IP67 rated, 5-10 year battery, LoRaWAN & 4G LTE

[Explore Edge Devices](./products/edge-devices.html)`
  },
  {
    id: 'wired-sensors',
    question: 'What Wired Sensors do you offer?',
    keywords: ['wired sensor', 'accelerometer', 'strain gauge', 'wired', 'cable sensor', '4100 series'],
    category: 'Products',
    answer: `**Wired Sensors**

Sentra Wired Sensors deliver precise, real-time data for continuous structural health monitoring. They provide direct, stable, and interference-free measurements ideal for long-term monitoring.

**Product Lineup:**
- **Accelerometer** - High-precision vibration sensor for acceleration, velocity, and displacement. Ideal for bridge vibration, seismic, and dynamic load monitoring.
- **Spot Weldable Strain Gauge** - Compact sensor for measuring localized strain on steel structures. Rugged design for harsh conditions.
- **4100 Series Strain Gauge** - High-accuracy strain measurement for long-term structural monitoring of bridges, tunnels, and geotechnical applications.

[Explore Wired Sensors](./products/wired-sensors.html)`
  },
  {
    id: 'core-communications',
    question: 'What is Core Communications?',
    keywords: ['core communications', 'gateway', 'repeater', 'thread', 'communication', 'narrowband', 'broadband', 'lorawan'],
    category: 'Products',
    answer: `**Core Communications**

Sentra Core Communications forms the backbone of the monitoring ecosystem, enabling seamless data transmission between edge devices and cloud platforms.

**Narrowband Communications:**
- **4G Rugged Gateway** - Outdoor LoRa gateway with 4G and Ethernet backhaul. Core communication hub for edge devices.
- **K20 Edge Repeater** - Extends network range by relaying data between remote sensors and gateways in underground or tunnel environments.

**Broadband Communications:**
- **Thread X3** - High-speed broadband module for data-intensive monitoring. Features 4G/LTE modem, wireless mesh networking, and battery pack.

[Explore Core Communications](./products/core-communications.html)`
  },
  {
    id: 'ndt',
    question: 'What is Advanced NDT?',
    keywords: ['ndt', 'non-destructive testing', 'non destructive', 'ultrasonic', 'ground penetrating radar', 'inspection', 'testing method'],
    category: 'Solutions',
    answer: `**Advanced Non-Destructive Testing (NDT)**

Sentra provides precision inspection techniques to evaluate material properties and detect hidden defects without causing damage to the structure.

**Techniques Include:**
- Ultrasonic Testing - Detects internal flaws using high-frequency sound waves
- Ground Penetrating Radar (GPR) - Maps subsurface structures and utilities
- Phased Array Ultrasonics - Advanced imaging for complex geometries
- Acoustic Emission Monitoring - Detects active cracks and material failure
- Thermography - Identifies moisture, insulation issues, and delamination

**Applications:** Bridges, tunnels, pipelines, industrial structures, heritage buildings

[Learn about NDT](./solutions/advanced-non-destructive-testing-ndt.html)`
  },
  {
    id: 'digital-twin',
    question: 'What is Digital Twin?',
    keywords: ['digital twin', 'digital', 'twin', 'bim', '3d model', 'simulation', 'virtual'],
    category: 'Solutions',
    answer: `**Digital Twin & Simulation**

Sentra creates integrated digital twins combining BIM, IoT, and GIS data to enable continuous performance monitoring and simulation of real-world infrastructure systems.

**Key Features:**
- Real-time synchronization with physical assets
- Predictive simulation for maintenance planning
- 3D visualization with sensor data overlay
- Historical data analysis for trend identification
- Integration with existing BIM/GIS workflows

**Benefits:**
- Improved decision-making with real-time insights
- Reduced downtime through predictive analytics
- Enhanced collaboration across engineering teams

[Learn about Digital Twin](./solutions/digital-twin.html)`
  },
  {
    id: 'fatigue-assessment',
    question: 'What is Fatigue Assessment?',
    keywords: ['fatigue', 'residual life', 'life assessment', 'structural lifespan', 'rul', 'remaining useful life', 'fatigue assessment'],
    category: 'Solutions',
    answer: `**Fatigue and Residual Life Assessment**

Sentra provides structural lifespan evaluation and Remaining Useful Life (RUL) estimation using advanced analytics and monitoring data.

**Our Approach:**
- Continuous stress and strain monitoring
- Load history analysis and fatigue damage calculation
- Crack propagation modeling
- Remaining useful life prediction
- Prioritized maintenance recommendations

**Applications:**
- Bridges and highway structures
- Industrial machinery and equipment
- Offshore and marine structures
- Railway infrastructure

[Learn about Fatigue Assessment](./solutions/fatigue-and-residual-life-assessment.html)`
  },
  {
    id: 'parent-company',
    question: 'Who is Sentra parent company?',
    keywords: ['parent company', 'clove', 'clove technologies', 'parent', 'ownership', 'company', 'who owns'],
    category: 'Company',
    answer: `**Parent Organization**

Sentra is a flagship product line developed and managed by **Clove Technologies Private Limited**.

**About Clove Technologies:**
With over two decades of industry expertise, Clove Technologies integrates advanced geospatial intelligence, engineering analytics, and AI-driven automation.

**Specialities:**
1. Geospatial Technologies - GIS, LiDAR, remote sensing, spatial analytics
2. BIM and Digital Engineering - 3D modeling, 4D scheduling, 5D cost estimation
3. Smart Infrastructure Solutions - IoT monitoring (Sentra), predictive maintenance
4. Custom Software Development - Enterprise applications and mobile tools
5. AI, ML & Data Analytics - Predictive modeling and anomaly detection
6. Digital Twin & Simulation - Integrated BIM + IoT + GIS
7. Surveying & Data Acquisition - UAV, GNSS, laser scanning

**Website:** [www.clovetech.com](https://www.clovetech.com)`
  },
  {
    id: 'contact',
    question: 'How can I contact Sentra?',
    keywords: ['contact', 'phone', 'email', 'call', 'reach', 'address', 'location', 'office', 'get in touch'],
    category: 'Company',
    answer: `**Contact Sentra**

We would be happy to discuss your infrastructure monitoring needs.

**Phone:** +91 7893023322
**Email:** sentra@clovetech.com
**Office Address:** IT SEZ, Plot No. 9, Pedda Rushikonda, Rushikonda, Visakhapatnam, Andhra Pradesh 530045

To schedule a call and discuss your project requirements, please use the options below.

[Schedule a Call](https://calendly.com/sentra-clovetech/30min?primary_color=f47b0a)`
  },
  {
    id: 'tiltmeter',
    question: 'Tell me about the Tiltmeter',
    keywords: ['tiltmeter', 'tilt', 'inclination', 'inclinometer', 'ls-g6-til90', 'til90', 'ground movement'],
    category: 'Products',
    answer: `**Tiltmeter (LS-G6-TIL90)**

Worldsensing Tiltmeter provides high-precision measurements of relative inclination changes in structures, ground movements, and differential settlements.

**Models:**
- **LS-G6-TIL90-X** - External antenna for high-precision applications
- **LS-G6-TIL90-I** - Internal antenna for rail track monitoring

**Technical Specifications:**
- 3-axis MEMS accelerometer with integrated thermometer
- Range: ±90°
- Accuracy: ±0.005° (X), ±0.006° (I)
- Resolution: ±0.0001°
- Battery Life: Up to >25 years (1h reporting)
- IP68 weather protection
- LoRa radio communication (up to 15 km range)

**Applications:** Track geometry monitoring, slope stability, structural settlement

[Explore Tiltmeter](./products/tiltmeter.html)`
  },
  {
    id: 'vibrating-wire',
    question: 'What is the Vibrating Wire?',
    keywords: ['vibrating wire', 'vw', 'strain', 'piezometer', 'load cell', 'pressure cell', 'ls-g6-vw'],
    category: 'Products',
    answer: `**Vibrating Wire Data Logger (LS-G6-VW)**

The Vibrating Wire Data Logger automates data collection by connecting vibrating wire instruments wirelessly to monitoring systems.

**Models:**
- **LS-G6-VW** - 5 Channel (external antenna)
- **LS-G6-VW-1** - 1 Channel (external antenna)
- **LS-G6-VW-RCR** - Ultra-robust for embedding in precast concrete

**Technical Specifications:**
- Measurement Range: 300 to 7000 Hz
- Accuracy: 0.008% to 0.013%
- Resolution: <0.01 Hz
- Up to 25 years of unattended operation
- Up to 15 km communication range using LoRa
- IP68 weather protection

**Applications:** Tunnel linings, dams, bridges, geotechnical structures

[Explore Vibrating Wire](./products/vibrating-wire.html)`
  },
  {
    id: 'geotechnical-monitoring',
    question: 'What is Geotechnical Monitoring?',
    keywords: ['geotechnical', 'foundation', 'soil', 'slope', 'settlement', 'ground movement', 'excavation'],
    category: 'Solutions',
    answer: `**Geotechnical and Foundation Monitoring**

Sentra provides comprehensive monitoring solutions for soil stability, foundation settlement, and slope movements.

**Monitoring Parameters:**
- Soil deformation and settlement
- Pore water pressure
- Groundwater levels
- Slope inclination and movement
- Foundation tilt and displacement
- Vibrations during construction

**Applications:**
- Deep excavations and retaining walls
- Tunnel construction
- Embankments and dam foundations
- Landslide-prone areas
- Building and bridge foundations

[Learn about Geotechnical Monitoring](./solutions/geotechnical-and-foundation-monitoring.html)`
  },
  {
    id: 'bridge-inspection',
    question: 'What does Bridge Inspection involve?',
    keywords: ['bridge inspection', 'bridge', 'condition assessment', 'bridge assessment', 'bridge monitoring', 'inspection'],
    category: 'Solutions',
    answer: `**Bridge Inspection and Condition Assessment**

Sentra provides comprehensive bridge condition assessment and lifecycle management services.

**Our Approach:**
- Visual inspection and documentation
- Non-destructive testing (ultrasonic, GPR)
- Load rating and capacity analysis
- Continuous monitoring with IoT sensors
- AI-powered anomaly detection
- Digital twin integration for lifecycle management

**Benefits:**
- Extended bridge service life
- Reduced maintenance costs
- Enhanced public safety
- Data-driven repair prioritization

[Learn about Bridge Inspection](./solutions/bridge-inspection-and-condition-assessment.html)`
  },
  {
    id: 'vibration-meter',
    question: 'Tell me about the Vibration Meter',
    keywords: ['vibration meter', 'vibration', 'ppv', 'law', 'acceleration', 'lsg7acl', 'dynamic load'],
    category: 'Products',
    answer: `**Vibration Meter (LSG7ACL-BILH-VIB)**

The Vibration Meter is a wireless sensor that automates data collection for long-term, continuous vibration monitoring.

**Key Features:**
- High-precision 3-axis MEMS accelerometer
- Up to 1000 Hz derived from a 4k Hz signal
- Exception-based edge algorithm for threshold breach detection using LAW/PPV and frequency
- Configurable operational modes for different regulatory standards

**Battery Life:** Up to 1.5 years (30 min reporting period)
**Communication:** LoRa, up to 10 km with repeaters
**Applications:** Construction vibration monitoring, structural dynamics, blast monitoring

[Explore Vibration Meter](./products/vibration-meter.html)`
  },
  {
    id: 'gnss-meter',
    question: 'Tell me about the GNSS Meter',
    keywords: ['gnss', 'gnss meter', 'gps', 'displacement', 'rtk', 'satellite', 'positioning'],
    category: 'Products',
    answer: `**GNSS Meter (LSG7GNS-SXLH)**

Worldsensing's GNSS Meter enables precise automated measurement of surface point movements with millimetric precision.

**Key Features:**
- Sub-centimeter 3D positioning with RTK technology (2mm for 24h aggregated)
- Operates as both base and rover
- Integrated tiltmeter and environmental sensors
- Multi-band: GPS, GLONASS, Galileo, BeiDou

**Battery Life:** Up to 2.6 years (1h reporting)
**Communication:** LoRa radio (ISM sub-GHz)
**Applications:** Landslide monitoring, structural settlement, deformation monitoring

[Explore GNSS Meter](./products/gnss-meter.html)`
  },
  {
    id: 'asset-monitoring',
    question: 'What is Asset Monitoring?',
    keywords: ['asset monitoring', 'asset management', 'lifecycle management', 'predictive maintenance', 'asset health'],
    category: 'Solutions',
    answer: `**Asset Monitoring and Management Solutions**

Sentra provides end-to-end asset management with real-time dashboards and predictive analytics.

**Key Capabilities:**
- Real-time asset health tracking
- Predictive maintenance scheduling
- Lifecycle cost optimization
- Multi-site portfolio management
- Integration with existing asset management systems

**Benefits:**
- Reduce maintenance costs by up to 40%
- Extend asset service life through data-driven decisions
- Improve operational efficiency with automated alerts

[Learn about Asset Monitoring](./solutions/asset-monitoring-and-management-solutions.html)`
  },
  {
    id: 'consulting',
    question: 'What Consulting Services do you offer?',
    keywords: ['consulting', 'advisory', 'expert', 'advice', 'feasibility', 'strategy', 'assessment'],
    category: 'Solutions',
    answer: `**Consulting and Advisory Services**

Sentra provides expert engineering advice and deployment strategies for infrastructure monitoring.

**Services Include:**
- Feasibility studies and technical assessments
- Monitoring strategy development
- Sensor selection and deployment planning
- Data interpretation and reporting
- Risk assessment and mitigation planning

Our consultants bring deep domain expertise across structural engineering, IoT systems, and geotechnical analysis.

[Learn about Consulting](./solutions/consulting-and-advisory-services.html)`
  },
  {
    id: 'digital-engineering',
    question: 'What is Digital Engineering?',
    keywords: ['digital engineering', 'bim', '3d modeling', 'documentation', 'digital workflow', 'cad'],
    category: 'Solutions',
    answer: `**Digital Engineering and Documentation**

Sentra provides BIM, 3D modeling, digital twins, and comprehensive documentation services.

**Capabilities:**
- Building Information Modeling (BIM) for infrastructure
- 3D laser scanning and point cloud processing
- As-built documentation and BIM-to-field workflows
- Digital twin creation from IoT sensor data
- CAD drafting and engineering drawings

**Benefits:**
- Improved collaboration across project teams
- Reduced design and construction errors
- Enhanced facility management with accurate digital records

[Learn about Digital Engineering](./solutions/digital-engineering-and-documentation.html)`
  },
  {
    id: 'industries',
    question: 'What industries does Sentra serve?',
    keywords: ['industry', 'industries', 'verticals', 'sectors', 'railway', 'bridge', 'building', 'mining', 'port', 'dam', 'construction', 'tunnel'],
    category: 'Company',
    answer: `**Industries We Serve**

Sentra provides structural health monitoring solutions across a wide range of infrastructure sectors:

**Railway Networks** — Bridges, viaducts, embankments, and track geometry monitoring
**Road Bridges** — Highway flyovers, cable-stayed bridges, and major crossings
**High-Rise Buildings** — Tall structures, deep basements, and adjacent construction impacts
**Dams & Reservoirs** — Embankment, gravity, and arch dams with seepage monitoring
**Ports & Marine** — Wharves, jetties, and marine structures
**Mining & Geotechnical** — Slope stability, tailings dams, and excavation monitoring
**Construction & Tunnelling** — Settlement, vibration, and structural integrity during construction
**Industrial Facilities** — Machinery, pipelines, and plant infrastructure

[Explore Industries](./industries.html)`
  },
  {
    id: 'installation',
    question: 'How does the installation process work?',
    keywords: ['installation', 'setup', 'deploy', 'deployment', 'install', 'commissioning', 'on-site'],
    category: 'Company',
    answer: `**Installation Process**

Sentra's installation process is designed to be efficient and minimally disruptive to your operations.

**Typical Process:**
1. **Site Survey** — Our engineers visit to assess conditions and identify sensor locations
2. **Design** — A bespoke sensor layout is designed for your structure
3. **Installation** — Certified engineers install sensors, gateways, and communication equipment
4. **Configuration** — Edge devices are configured and connected to cloud platforms
5. **Testing** — Full system testing with calibration and baseline data collection
6. **Handover** — Training and documentation provided to your team

**Timeline:** Small projects can be installed in days; complex multi-site deployments typically take 2-6 weeks.

[Contact us for a custom deployment plan](./contact.html)`
  },
  {
    id: 'case-studies',
    question: 'Do you have case studies?',
    keywords: ['case study', 'case studies', 'reference', 'success story', 'project example', 'portfolio', 'past projects'],
    category: 'Company',
    answer: `**Success Stories**

Sentra has successfully deployed monitoring solutions on hundreds of structures worldwide.

**Featured Case Studies:**

**BridgePulse — AI and Drone Technology for Bridge Health Monitoring**
Combined AI-powered analytics with drone-based inspections for comprehensive bridge assessment.
[Read Case Study](./case-studies/bridgepluse-ai-and-drone-technology-for-bridge-health-monitoring.html)

**IoT Bridge Monitoring on Railway Bridges**
Deployed wireless sensor networks on operational railway bridges for continuous structural monitoring.
[Read Case Study](./case-studies/iot-bridge-monitoring-and-sensor-installation-on-railway-bridges.html)

Over 200+ structures monitored across bridges, buildings, railways, and industrial facilities.

[View All Case Studies](./resources.html#case-studies)`
  },
  {
    id: 'pricing',
    question: 'How much does it cost?',
    keywords: ['price', 'pricing', 'cost', 'budget', 'quote', 'expensive', 'investment', 'roi', 'how much'],
    category: 'Company',
    answer: `**Pricing and Investment**

Sentra provides tailored solutions, so pricing is based on your specific requirements.

**Factors that influence pricing:**
- Number and type of sensors required
- Communication infrastructure needs (gateways, repeaters)
- Deployment complexity and site access
- Analytics and reporting requirements
- Ongoing support and maintenance

**Getting a Quote:**
We recommend starting with a free consultation to understand your needs and provide an accurate quote. Most projects start with a pilot deployment to validate the approach before full-scale rollout.

**Contact our team for a custom quote:**
- Phone: +91 7893023322
- Email: sentra@clovetech.com

[Request a Quote](./contact.html)`
  },
  {
    id: 'demos',
    question: 'Can I get a demo?',
    keywords: ['demo', 'demonstration', 'trial', 'pilot', 'see it working', 'showcase', 'preview', 'sample'],
    category: 'Company',
    answer: `**Demos and Pilot Deployments**

We offer several ways to experience Sentra's monitoring solutions before committing.

**Demo Options:**
1. **Live Product Demo** — A guided walkthrough of our sensors, edge devices, and analytics platform (30-45 min)
2. **Pilot Deployment** — A small-scale trial on your structure (typically 4-8 weeks)
3. **Virtual Dashboard Tour** — See our real-time monitoring dashboards in action
4. **Sample Reports** — Review example monitoring reports and analytics

To schedule a demo or discuss a pilot:
- Call: +91 7893023322
- Email: sentra@clovetech.com

[Schedule a Demo](https://calendly.com/sentra-clovetech/30min?primary_color=f47b0a)`
  }
];

// Define follow-up questions for each predefined question
const questionFollowUps = {
  'shm': [
    'What sensors are used for SHM?',
    'How does SHM compare to traditional inspection?',
    'Can I get a demo of SHM?'
  ],
  'edge-devices': [
    'What is the battery life of edge devices?',
    'How do I install edge devices?',
    'Tell me about the Vibration Meter'
  ],
  'wired-sensors': [
    'How do wired sensors compare to wireless?',
    'What is an Accelerometer?',
    'What is a Strain Gauge?'
  ],
  'core-communications': [
    'What is the difference between Gateway and Repeater?',
    'How far can the Gateway reach?',
    'Tell me about the Thread device'
  ],
  'ndt': [
    'Which NDT technique is best for bridges?',
    'How does NDT compare to visual inspection?',
    'Can I request an NDT assessment?'
  ],
  'digital-twin': [
    'How does Digital Twin integrate with BIM?',
    'What data is needed for a Digital Twin?',
    'Tell me about your Digital Engineering services'
  ],
  'fatigue-assessment': [
    'How do you calculate remaining useful life?',
    'What structures need fatigue assessment?',
    'Tell me about your Consulting services'
  ],
  'parent-company': [
    'What services does Clove Technologies offer?',
    'What industries does Sentra serve?',
    'Tell me about Sentra solutions'
  ],
  'contact': [
    'Schedule a demo',
    'Tell me about pricing',
    'What is your office address?'
  ],
  'tiltmeter': [
    'What is the accuracy of the Tiltmeter?',
    'What is Tiltmeter Event Detection?',
    'Tell me about the Laser Tiltmeter'
  ],
  'vibrating-wire': [
    'What is Vibrating Wire RCR?',
    'What is the difference between VW and Digital Logger?',
    'What is the battery life of VW?'
  ],
  'geotechnical-monitoring': [
    'What sensors are used for geotechnical monitoring?',
    'How do you monitor slope stability?',
    'Tell me about Foundation Monitoring'
  ],
  'bridge-inspection': [
    'How often should bridges be inspected?',
    'What is the advantage of continuous monitoring?',
    'How does AI help in bridge inspection?'
  ],
  'vibration-meter': [
    'What is the frequency range of the Vibration Meter?',
    'How does it detect threshold breaches?',
    'Tell me about the Vibrating Wire'
  ],
  'gnss-meter': [
    'What is the precision of GNSS Meter?',
    'How does RTK correction work?',
    'Tell me about the Tiltmeter'
  ],
  'asset-monitoring': [
    'How does asset monitoring reduce costs?',
    'What assets can be monitored?',
    'Tell me about Asset Management dashboards'
  ],
  'consulting': [
    'What does a consulting engagement look like?',
    'Do you offer feasibility studies?',
    'Tell me about your Digital Engineering services'
  ],
  'digital-engineering': [
    'How does BIM integrate with IoT?',
    'What is a Digital Twin?',
    'Tell me about your documentation services'
  ],
  'industries': [
    'Tell me about Railway Monitoring',
    'Tell me about Bridge Monitoring',
    'Tell me about Building Monitoring'
  ],
  'installation': [
    'How long does installation take?',
    'Do you provide training?',
    'What support do you offer after installation?'
  ],
  'case-studies': [
    'Tell me about your team',
    'What is the ROI of monitoring?',
    'Can I speak to a reference customer?'
  ],
  'pricing': [
    'How much does a typical project cost?',
    'Do you offer pilot deployments?',
    'Contact an expert'
  ],
  'demos': [
    'What does a demo include?',
    'How long is the demo?',
    'Schedule a demo'
  ]
};

// Render follow-up quick-reply buttons after a predefined answer
function renderFollowUpQuestions(questionId, afterElement) {
  const followUps = questionFollowUps[questionId];
  if (!followUps || followUps.length === 0) return;

  // Remove any existing quick-replies to keep the chat clean
  document.querySelectorAll('.quick-replies').forEach(function(el) { el.remove(); });

  const quickRepliesDiv = document.createElement('div');
  quickRepliesDiv.className = 'quick-replies';
  quickRepliesDiv.style.marginTop = '12px';
  quickRepliesDiv.style.justifyContent = 'flex-start';
  quickRepliesDiv.style.paddingLeft = '46px';

  for (const text of followUps) {
    const btn = document.createElement('button');
    btn.className = 'quick-reply';
    btn.textContent = text;
    quickRepliesDiv.appendChild(btn);
  }

  // Insert after the bot message
  if (afterElement && afterElement.parentNode) {
    afterElement.parentNode.insertBefore(quickRepliesDiv, afterElement.nextSibling);
  }
}

// Find best matching predefined question for user input
function findPredefinedMatch(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') return null;

  const input = userMessage.toLowerCase().trim();
  if (!input) return null;

  // 1. Check exact match first (user clicked a question card or typed exact question)
  for (const q of predefinedQuestions) {
    if (input === q.question.toLowerCase()) {
      return q;
    }
  }

  // 2. Check if user's message contains the full question or vice versa
  for (const q of predefinedQuestions) {
    const qLower = q.question.toLowerCase();
    if (input.includes(qLower) || qLower.includes(input)) {
      return q;
    }
  }

  // 3. Keyword-based scoring
  const inputTokens = input.split(/\s+/).filter(t => t.length > 2);
  if (inputTokens.length === 0) return null;

  let bestMatch = null;
  let bestScore = 0;
  const THRESHOLD = 0.3;

  for (const q of predefinedQuestions) {
    // Build keyword set from question text + explicit keywords
    const questionTokens = q.question.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    const allKeywords = [...new Set([...questionTokens, ...q.keywords.map(k => k.toLowerCase())])];

    if (allKeywords.length === 0) continue;

    let matchCount = 0;
    for (const token of inputTokens) {
      for (const kw of allKeywords) {
        // Check if token contains keyword or keyword contains token (substring match)
        if (token.includes(kw) || kw.includes(token)) {
          matchCount++;
          break;
        }
      }
    }

    // Also check for multi-word keyword matches (e.g., "structural health monitoring")
    let phraseMatchCount = 0;
    for (const kw of allKeywords) {
      if (kw.split(/\s+/).length > 1 && input.includes(kw)) {
        phraseMatchCount++;
      }
    }

    // Score = token match proportion + bonus for phrase matches
    const tokenScore = matchCount / Math.max(inputTokens.length, 1);
    const phraseBonus = phraseMatchCount * 0.15;
    const score = tokenScore + phraseBonus;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = q;
    }
  }

  return bestScore >= THRESHOLD ? bestMatch : null;
}

// Render predefined question cards in the UI (accordion style)
function renderPredefinedQuestions() {
  const grid = document.getElementById('pq-grid');
  if (!grid) return;

  grid.innerHTML = '';

  // Group questions by category
  const categories = {};
  for (const q of predefinedQuestions) {
    if (!categories[q.category]) {
      categories[q.category] = [];
    }
    categories[q.category].push(q);
  }

  const categoryOrder = ['Solutions', 'Products', 'Company'];
  const categoryIcons = {
    'Solutions': '\u2191',
    'Products': '\u2699',
    'Company': '\u2139'
  };

  for (const cat of categoryOrder) {
    if (!categories[cat]) continue;

    // Category block button
    const catBtn = document.createElement('button');
    catBtn.className = 'pq-cat-btn';
    catBtn.setAttribute('data-category', cat);
    catBtn.innerHTML = `<span class="pq-cat-icon">${categoryIcons[cat] || '?'}</span><span class="pq-cat-label">${cat}</span><span class="pq-cat-arrow">\u25BC</span>`;
    grid.appendChild(catBtn);

    // Questions container (hidden by default)
    const questionsContainer = document.createElement('div');
    questionsContainer.className = 'pq-questions';
    questionsContainer.id = `pq-questions-${cat.toLowerCase()}`;
    questionsContainer.style.display = 'none';

    for (const q of categories[cat]) {
      const card = document.createElement('button');
      card.className = 'pq-card';
      card.setAttribute('data-question', q.question);
      card.textContent = q.question;
      questionsContainer.appendChild(card);
    }

    grid.appendChild(questionsContainer);
  }
}

// ----- Main contact information (authoritative) -----
const MAIN_PHONE = '+91 7893023322';
const MAIN_EMAIL = 'sentra@clovetech.com';
const MAIN_ADDRESS = 'IT SEZ, Plot No. 9, Pedda Rushikonda, Rushikonda, Visakhapatnam, Andhra Pradesh 530045';

function formatContactBlock() {
  return `Phone: ${MAIN_PHONE}\nEmail: ${MAIN_EMAIL}\nOffice Address: ${MAIN_ADDRESS}\n\nNote: This is the main office address and phone number.`;
}

// System instruction with company context
const systemInstruction = {
  parts: [
    {
      text: `Company Name: Sentra
Sentra is a structural health monitoring and digital engineering company specializing in real-time infrastructure intelligence.
We integrate smart sensor networks, digital twins, and edge AI for predictive maintenance, fatigue analysis, and geotechnical monitoring.

CRITICAL FORMATTING INSTRUCTIONS:
1. Use double newlines (\n\n) to create clear space between different sections or paragraphs.
2. Every list item or numbered point MUST start on a new line.
3. For lists of solutions or features, use a format with bold headers followed by a NEWLINE before the description.
4. Bold and highlight key titles using **Title Name**.
5. Do not cluster information; provide breathing room between points.

Example Formatting:
**1. Structural Health Monitoring**
Continuous, real-time data collection using wireless sensors and edge devices to detect stress...

**2. Advanced Non-Destructive Testing (NDT)**
Precision inspection techniques such as ultrasonic, ground-penetrating radar...

When users ask about products, categorize them exactly like this with links:

- **EDGE DEVICES** ([Explore Edge Devices](./products/edge-devices.html))
-- **WIRELESS DATA ACQUISITION**
--- [Vibrating Wire](./products/vibrating-wire.html)
--- [Vibrating Wire RCR](./products/vibrating-wire-rcr.html)
--- [Digital Data Logger](./products/digital-data-logger.html)
--- [Analog Data Logger](./products/analog-data-logger.html)
--- [Piconode Data Logger](./products/piconode-data-logger.html)

-- **WIRELESS SENSORS**
--- [Tiltmeter](./products/tiltmeter.html)
--- [Tiltmeter Event Detection](./products/tiltmeter-event-detection.html)
--- [Vibration Meter](./products/vibration-meter.html)
--- [Laser Tiltmeter](./products/laser-tiltmeter.html)
--- [GNSS Meter](./products/gnss-meter.html)

- **CORE COMMUNICATIONS** ([Explore Core Communications](./products/core-communications.html))
-- **NARROWBAND COMMUNICATIONS**
--- [Gateway](./products/gateway.html)
--- [Repeater](./products/repeater.html)

-- **BROADBAND COMMUNICATIONS**
--- [Thread](./products/thread.html)

- **WIRED SENSORS** ([Explore Wired Sensors](./products/wired-sensors.html))
--- [Accelerometer](./products/accelerometers.html)
--- [Strain Gauge](./products/strain-gauges.html)

Sentra is a flagship product line developed and managed by Clove Technologies Private Limited.

With over two decades of industry expertise, Clove Technologies integrates advanced geospatial intelligence, engineering analytics, and AI-driven automation to help clients build smarter, more resilient assets.

Parent Organization
Parent Company: Clove Technologies Private Limited (website:www.clovetech.com)
Subsidiary/Product Line: Sentra (Structural Health Monitoring & IoT Solutions)
Sentra operates under Clove Technologies’ Smart Infrastructure division, focusing on intelligent monitoring systems, IoT-based sensing, and digital twin integration for infrastructure lifecycle management.

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

Phone Number: +91 7893023322
Email Address: sentra@clovetech.com
Office Address: IT SEZ, Plot No. 9, Pedda Rushikonda, Rushikonda, Visakhapatnam, Andhra Pradesh 530045

AI AGENT OF SENTRA'S WEBSITE IS Veronica

Use this company and page-specific context to answer all upcoming user queries accurately and in alignment with Sentra's expertise.



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
Wireless data acquisition: We offer comprehensive sensor reading solutions for diverse monitoring needs, supporting analog, vibrating wire, and digital sensor interfaces. Our sensors offer multiple input channels to fit specific requirements of tailored configurations. Whether it’s a small or a large-scale project, Loadsensing ensures accurate data collection and reliable data transmission. Explore our range of Edge Devices to find the best match for your monitoring needs.

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
Key component of Worldsensing’s Early Warning System to monitor zones that are prone to geohazards
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
Compatible with Worldsensing’s single-net and multi-net configurations

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
Compatible with Worldsensing’s single-net and multi-net configurations

Model: LSG7ACL-BILH-VIB
Datasheet: https://info.worldsensing.com/Datasheet_VibrationMeter_EN
Technical specifications


GNSS Meter
Worldsensing’s GNSS Meter is a wireless sensor that enables precise automated measurement of surface point movements. It features advanced multi-band Real-Time Kinematic (RTK) technology and innovative edge processing that delivers millimetric precision with great reliability.

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
Choose your network and enable your communications with Worldsensing’s broadband and narrowband connectivity portfolio. Extend your narrowband networks using repeaters to gain extra coverage in low-visibility environments

Narrowband communications
Rely on powerful signal strength, excellent interference mitigation and enhanced radio performance for your monitoring systems. Use the 4G Rugged Gateway in combination with the different variants of Worldsensing Management Software to deploy private, locally managed, single-net deployments, or redundant, multi-network deployments managed in the cloud. Leverage the addition of the Edge Repeater to obtain additional radio coverage in underground or tunnel construction projects.

Narrowband gateways
Choose between Edge or Cloud according to your network configuration
4G Rugged Gateway

Narrowband repeaters
Extend your edge networks
K20 Edge Repeater

Broadband communications
Select Worldsensing’s broadband communications for high data-rate and high-power monitoring projects. Broadband communications are enabled by Worldsensing’s ThreadX3 Device, a fully autonomous sensor connectivity device with an integrated 4G/LTE cellular modem, wireless mesh networking, and an internal battery pack.

Broadband gateways
2-in-1 data logger and gateway for broadband communications
Thread

Narrowband Communications
Gateway: 4G Rugged Gateway
The 4G Rugged Gateway is an outdoor LoRa gateway featuring 4G and Ethernet backhaul connectivity. It serves as the core communication hub for Worldsensing edge devices, efficiently connecting a high volume of end devices and managing millions of bidirectional messages daily.

The 4G Rugged Gateway is a key component for Worldsensing’s narrowband networks
Provides connectivity in areas without internet coverage using LoRa/LoRaWAN radio communications
Supports private, single-network local deployments and redundant, multi-network cloud deployments with Worldsensing’s CMT software.
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

The Thread X3 is the key component for Worldsensing’s broadband networks
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
- Users ask for current news, updates, or recent developments
- Questions require data from external sources
- Information about competitors, industry trends, or market data
- Technical specifications or documentation from other websites
- Real-time information like weather, stock prices, or current events

Format: Can i Access Website:: https://sentratech.in/

`,


    },
  ],
};

const initialInputHeight = messageInput.scrollHeight;

// Simple markdown parser for basic formatting
const parseMarkdown = (text) => {
  if (!text) return '';

  // Normalize and clean text
  let content = text.replace(/\r\n/g, '\n').trim();
  content = stripEmojis(content);

  // === Pre-processing: normalize AI responses that lack proper newlines ===

  // Break before **Heading that appears after sentence-ending punctuation
  content = content.replace(/([.!?])\s+(\*\*[A-Z])/g, '$1\n\n$2');

  // Break "**Header:** - item" -> header on its own line
  content = content.replace(/(\*\*[^*\n]{1,60}\*\*\s*:?)\s*(?=[-*•]\s+[A-Za-z])/g, '$1\n\n');

  // Break inline list items "word - Capitalized" into paragraph + list marker
  content = content.replace(/([a-zA-Z,.!?])\s+-\s+([A-Z][a-z])/g, '$1\n\n- $2');

  // Numbered/bullet points at sentence boundaries
  content = content.replace(/([.!?])\s+(\d+\.\s+)/g, '$1\n\n$2');
  content = content.replace(/([.!?])\s+([-*•]\s+)/g, '$1\n\n$2');

  // Single newlines before list markers become double newlines
  content = content.replace(/\n([-*•]\s+)/g, '\n\n$1');
  content = content.replace(/\n(\d+\.\s+)/g, '\n\n$1');

  // Split into paragraphs
  const paragraphs = content.split(/\n\n+/);

  const htmlParagraphs = paragraphs.map(p => {
    let trimmed = p.trim();
    if (!trimmed) return '';

    // Handle lists (numbered or bullets)
    const listMatch = trimmed.match(/^(\d+\.|[-*•])\s+([\s\S]*)/);
    if (listMatch) {
      const marker = listMatch[1];
      let listContent = listMatch[2];

      // Highlight bold title in list item: "1. **Title** desc" or "1. Title: desc"
      const boldTitleMatch = listContent.match(/^(\*\*.*?\*\*|[^:.]{1,60}[:.])([ \s\S]*)/);
      if (boldTitleMatch) {
        const title = boldTitleMatch[1].replace(/\*\*/g, '');
        const desc = boldTitleMatch[2].replace(/\n/g, '<br>').trim();
        return '<div class="chat-paragraph" style="margin-bottom:10px;line-height:1.55;padding-left:2px;">'
          + '<span style="color:#f48120;font-weight:700;">' + marker + ' ' + title + '</span>'
          + (desc ? '<br><span style="display:block;margin-top:3px;">' + applyInline(desc) + '</span>' : '')
          + '</div>';
      }

      return '<div class="chat-paragraph" style="margin-bottom:8px;line-height:1.55;padding-left:2px;">'
        + '<span style="color:#f48120;font-weight:700;">' + marker + '</span> ' + applyInline(listContent.replace(/\n/g, '<br>'))
        + '</div>';
    }

    // Handle standalone bold headers: "**Title**" or "**Title:**"
    const headerMatch = trimmed.match(/^\*\*(.+?)\*\*[:.\u2013\-!]?\s*$/);
    if (headerMatch) {
      const title = headerMatch[1];
      const hasPunct = /[:.\u2013\-!]/.test(trimmed.replace(/\*\*/g, '').slice(-1));
      const align = hasPunct ? 'left' : 'center';
      return '<div style="margin-top:14px;margin-bottom:6px;color:#f48120;font-weight:700;font-size:1.05em;'
        + 'text-align:' + align + ';border-bottom:1px solid rgba(244,129,32,0.15);padding-bottom:3px;">' + title + '</div>';
    }

    // Generic paragraph: apply inline formatting, single \n becomes <br>
    const formatted = applyInline(trimmed.replace(/\n/g, '<br>'));
    return '<div class="chat-paragraph" style="margin-bottom:8px;line-height:1.55;">' + formatted + '</div>';
  });

  return htmlParagraphs.join('');
};

// Apply inline markdown (bold, code, links) without altering structure
const applyInline = (str) => str
  .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#f48120;">$1</strong>')
  .replace(/`(.*?)`/g, '<code>$1</code>')
  .replace(/\[(.*?)\]\((.*?)\)/g, '<a class="link-btn" href="$2" target="_blank" rel="noopener noreferrer">$1</a>');


// Create message element with dynamic classes and return it
const createMessageElement = (content, ...classes) => {
  const div = document.createElement("div");
  div.classList.add("message", ...classes);
  div.innerHTML = content;
  return div;
};

// Generate bot response using backend API endpoint
const generateBotResponse = async (incomingMessageDiv) => {
  const messageElement = incomingMessageDiv.querySelector(".message-text");

  // Check if request should be throttled
  if (shouldThrottleRequest()) {
    messageElement.textContent = "Please wait a moment before sending another message...";
    messageElement.classList.add("error");
    return;
  }

  // Add user message to chat history
  chatHistory.push({
    role: "user",
    parts: [{ text: userData.message }],
  });
  if (chatHistory.length > MAX_CHAT_HISTORY) chatHistory.splice(0, chatHistory.length - MAX_CHAT_HISTORY);

  try {
    // Fetch site content once and include it in the prompt to improve product/site-aware answers
    let siteContent = '';
    try {
      siteContent = await fetchSiteContent();
    } catch (e) {
      siteContent = '';
    }

    // Add assistant instruction to ensure professional sales tone and no emojis
    const assistantInstructions = `Respond in a professional sales representative tone. Do not use emojis or informal punctuation. Be concise and helpful. After three or more meaningful exchanges, politely suggest scheduling a call to discuss solutions and provide a clear way to schedule. If the user chooses 'Don't show again' when offered a call, do not prompt again.`;

    const augmentedMessage = `${userData.message}\n\n[SiteContext]: ${siteContent}\n\n[AssistantInstructions]: ${assistantInstructions}`;

    // Send message to backend API endpoint
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: augmentedMessage,
        history: chatHistory,
        needsWebAccess: true,
        file: userData.file.data ? {
          data: userData.file.data,
          mimeType: userData.file.mimeType
        } : null
      }),
    });

    if (!response.ok) {
      let errText = '';
      try { const errData = await response.json(); errText = errData.error || ''; } catch (_) {}
      if (response.status === 429) {
        throw new Error('AI service rate limit reached. Please wait a moment and try again.');
      }
      throw new Error(errText || `Service error (${response.status}). Please try again.`);
    }

    const data = await response.json();
    let apiResponseText = data.response || data.message || '';

    // Post-process response: strip emojis and normalize whitespace (preserve newlines)
    apiResponseText = stripEmojis(apiResponseText).replace(/ {2,}/g, ' ').trim();

    // Normalize company name: prefer 'Sentra' or 'Sentra - By Clove Technologies'
    try {
      apiResponseText = apiResponseText.replace(/Sentra Technologies/gi, 'Sentra - By Clove Technologies');
      apiResponseText = apiResponseText.replace(/\bSentra Technologies\b/gi, 'Sentra - By Clove Technologies');
    } catch (e) {
      // ignore
    }

    // If the user asked for contact information (or the response mentions contact), override with authoritative main contact
    try {
      const userText = (userData.message || '');
      // Stronger contact intent detection: explicit contact phrases or clear phone/email patterns
      const contactIntent = /\b(contact(?:\s+us)?|call(?:\s+(?:me|us))?|how to reach|get in touch|phone|mobile|email|office address|visit us|contact details)\b/i;
      const isProductInquiry = /\b(product|products|solution|solutions|explore|sensor|edge|device|gateway|repeater|logger|monitor|test|consulting|tiltmeter|vibration|strain|accelerometer|gnss|ndt|shm|geotechnical|fatigue|inspection|digital\s*twin|ai|artificial\s*intelligence|bridge|monitoring|infrastructure|tunnel|dam|railway|structural|monitoring|health|civil|engineering|asset|management|predictive|maintenance|analysis|data|intelligence|smart|iot|deployment|sensing|assessment|fatigue|residual|life|geotechnical|foundation|ndt|non-destructive|testing|digital|engineering|bim|gis|simulation|optimization|real-time|insights|analytics|edge|computing|hard|difficult|question|complex|issue|how|why|what|explain|describe|details|more|information)\b/i.test(userText);
      // Only treat the response as containing contact info when it includes an email, phone-like number, or explicit 'contact us' phrase
      const responseContainsContact = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?\d[\d\-\s\(\)]{6,}\d)|\bcontact\s+us\b/i;

      // Refined override: Only trigger if the user explicitly asked for contact info OR if the AI response is short and primarily contact-focused
      const isShortResponse = apiResponseText.length < 300;
      const explicitContactRequest = contactIntent.test(userText) && !isProductInquiry;

      if ((explicitContactRequest || (responseContainsContact.test(apiResponseText) && isShortResponse)) && !isProductInquiry) {
        // Determine header based on user intent
        const userTextLower = userText.toLowerCase();
        let header = 'Explore our solutions';
        if (/product/.test(userTextLower)) {
          header = 'Explore our products';
        } else if (/solution/.test(userTextLower)) {
          header = 'Explore our solutions';
        }

        // Compose a professional contact block with context-aware header
        const contactBlock = `${header}\nThank you for reaching out. Please use the following primary contact details for Sentra:\n\n${formatContactBlock()}\n\nWe can schedule a call or follow up by email as needed.`;
        apiResponseText = contactBlock;
      }
    } catch (e) {
      // ignore
    }

    // Display the final response
    messageElement.innerHTML = parseMarkdown(apiResponseText);

    // Add bot response to chat history
    chatHistory.push({
      role: "model",
      parts: [{ text: apiResponseText }],
    });
    if (chatHistory.length > MAX_CHAT_HISTORY) chatHistory.splice(0, chatHistory.length - MAX_CHAT_HISTORY);

    // Save bot response to chat history for admin dashboard
    saveChatMessage(apiResponseText, 'bot');

    // Interaction count and CTA: after a few interactions, prompt to schedule a call
    try {
      const interactions = incrementInteractionCount();
      const CTA_THRESHOLD = 3;
      if (interactions >= CTA_THRESHOLD && !isCtaSuppressed() && !isCtaShown()) {
        // append a professional CTA message with action buttons
        const ctaHtml = `
          <div class="cta-message">
            <div class="cta-text">If you'd like, we can arrange a short call to discuss Sentra's solutions and how they fit your needs. Would you like to schedule a call?</div>
            <div class="cta-actions">
              <button id="cta-schedule" class="cta-btn">Schedule a Call</button>
              <button id="cta-remind" class="cta-btn">Remind Me Later</button>
              <button id="cta-never" class="cta-btn">Don't Show Again</button>
            </div>
          </div>`;

        const ctaDiv = document.createElement('div');
        ctaDiv.className = 'bot-message cta-wrapper';
        ctaDiv.innerHTML = `<div class="message-text">${ctaHtml}</div>`;
        chatBody.appendChild(ctaDiv);
        chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: 'smooth' });
        markCtaShown();

        // attach handlers
        setTimeout(() => {
          const scheduleBtn = document.getElementById('cta-schedule');
          const remindBtn = document.getElementById('cta-remind');
          const neverBtn = document.getElementById('cta-never');
          if (scheduleBtn) scheduleBtn.addEventListener('click', () => { window.open('https://sentratech.in/contact.html', '_blank'); });
          if (remindBtn) remindBtn.addEventListener('click', () => { /* simply close CTA */ ctaDiv.remove(); });
          if (neverBtn) neverBtn.addEventListener('click', () => { markCtaSuppressed(); ctaDiv.remove(); });
        }, 200);
      }
    } catch (e) {
      // ignore CTA errors
    }
  } catch (error) {
    console.error('Chat error:', error);
    const msg = error.message || 'Unknown error';
    if (msg.includes('rate limit') || msg.includes('429')) {
      messageElement.textContent = 'Too many requests. Please wait a moment and try again.';
    } else if (msg.includes('unavailable') || msg.includes('503') || msg.includes('502')) {
      messageElement.textContent = 'Service is temporarily unavailable. Please try again shortly.';
    } else {
      messageElement.textContent = 'Sorry, something went wrong. Please try again.';
    }
    messageElement.classList.add("error");
  } finally {
    // Reset user's file data, removing thinking indicator and scroll chat to bottom
    userData.file = { data: null, mimeType: null };
    incomingMessageDiv.classList.remove("thinking");
    chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
  }
};

// Handle outgoing user messages
const handleOutgoingMessage = (e, predefinedText) => {
  e.preventDefault();

  // Support both typed messages and predefined question clicks
  const userMsg = predefinedText || messageInput.value.trim();
  userData.message = userMsg;

  // Do nothing if message and file are empty
  if (!userData.message && !userData.file.data) {
    messageInput.value = "";
    return;
  }

  messageInput.value = "";
  messageInput.dispatchEvent(new Event("input"));
  fileUploadWrapper.classList.remove("file-uploaded");

  // Hide predefined questions after first message
  const pqContainer = document.getElementById("predefined-questions");
  if (pqContainer) {
    pqContainer.style.display = "none";
  }

  // Create and display user message
  const messageContent = `<div class="message-text"></div>
                          ${userData.file.data
      ? `<img src="data:${userData.file.mimeType};base64,${userData.file.data}" class="attachment" />`
      : ""
    }`;
  const outgoingMessageDiv = createMessageElement(messageContent, "user-message");
  outgoingMessageDiv.querySelector(".message-text").innerText = userData.message;
  chatBody.appendChild(outgoingMessageDiv);
  chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });

  // Save user message to chat history for admin dashboard
  saveChatMessage(userData.message, 'user');

  // While a live agent has taken over, let them reply directly instead
  // of Veronica auto-responding - the agent's reply will show up via
  // pollChatUpdates().
  if (liveAgentConnected) {
    return;
  }

  // Check if user's message matches a predefined question
  const matchedQuestion = findPredefinedMatch(userData.message);

  if (matchedQuestion && !userData.file.data) {
    // Found a match! Display predefined answer directly - no API call needed
    setTimeout(() => {
      const botMsgContent = `<svg class="bot-avatar" xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 1024 1024">
          <path d="M738.3 287.6H285.7c-59 0-106.8 47.8-106.8 106.8v303.1c0 59 47.8 106.8 106.8 106.8h81.5v111.1c0 .7.8 1.1 1.4.7l166.9-110.6 41.8-.8h117.4l43.6-.4c59 0 106.8-47.8 106.8-106.8V394.5c0-59-47.8-106.9-106.8-106.9zM351.7 448.2c0-29.5 23.9-53.5 53.5-53.5s53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5-53.9-23.9-53.5-53.5zm157.9 267.1c-67.8 0-123.8-47.5-132.3-109h264.6c-8.6 61.5-64.5 109-132.3 109zm110-213.7c-29.5 0-53.5-23.9-53.5-53.5s23.9-53.5 53.5-53.5 53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5zM867.2 644.5V453.1h26.5c19.4 0 35.1 15.7 35.1 35.1v121.1c0 19.4-15.7 35.1-35.1 35.1h-26.5zM95.2 609.4V488.2c0-19.4 15.7-35.1 35.1-35.1h26.5v191.3h-26.5c-19.4 0-35.1-15.7-35.1-35.1zM561.5 149.6c0 23.4-15.6 43.3-36.9 49.7v44.9h-30v-44.9c-21.4-6.5-36.9-26.3-36.9-49.7 0-28.6 23.3-51.9 51.9-51.9s51.9 23.3 51.9 51.9z" />
        </svg>
        <div class="message-text">${parseMarkdown(matchedQuestion.answer)}</div>`;
      const botMsgDiv = createMessageElement(botMsgContent, 'bot-message');
      chatBody.appendChild(botMsgDiv);
      chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: 'smooth' });

      // Show follow-up quick-reply buttons
      renderFollowUpQuestions(matchedQuestion.id, botMsgDiv);
      chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: 'smooth' });

      // Track in chat history
      chatHistory.push({
        role: 'user',
        parts: [{ text: userData.message }]
      });
      chatHistory.push({
        role: 'model',
        parts: [{ text: matchedQuestion.answer }]
      });
      if (chatHistory.length > MAX_CHAT_HISTORY) chatHistory.splice(0, chatHistory.length - MAX_CHAT_HISTORY);

      // Save predefined answer to chat history for admin dashboard
      saveChatMessage(matchedQuestion.answer, 'bot');

      // Increment interaction count
      try { incrementInteractionCount(); } catch (e) {}
    }, 600);
  } else {
    // No predefined match found - use AI/API as fallback
    setTimeout(() => {
      const messageContent = `<svg class="bot-avatar" xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 1024 1024">
              <path
                d="M738.3 287.6H285.7c-59 0-106.8 47.8-106.8 106.8v303.1c0 59 47.8 106.8 106.8 106.8h81.5v111.1c0 .7.8 1.1 1.4.7l166.9-110.6 41.8-.8h117.4l43.6-.4c59 0 106.8-47.8 106.8-106.8V394.5c0-59-47.8-106.9-106.8-106.9zM351.7 448.2c0-29.5 23.9-53.5 53.5-53.5s53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5-53.9-23.9-53.5-53.5zm157.9 267.1c-67.8 0-123.8-47.5-132.3-109h264.6c-8.6 61.5-64.5 109-132.3 109zm110-213.7c-29.5 0-53.5-23.9-53.5-53.5s23.9-53.5 53.5-53.5 53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5zM867.2 644.5V453.1h26.5c19.4 0 35.1 15.7 35.1 35.1v121.1c0 19.4-15.7 35.1-35.1 35.1h-26.5zM95.2 609.4V488.2c0-19.4 15.7-35.1 35.1-35.1h26.5v191.3h-26.5c-19.4 0-35.1-15.7-35.1-35.1zM561.5 149.6c0 23.4-15.6 43.3-36.9 49.7v44.9h-30v-44.9c-21.4-6.5-36.9-26.3-36.9-49.7 0-28.6 23.3-51.9 51.9-51.9s51.9 23.3 51.9 51.9z"
              />
            </svg>
            <div class="message-text">
              <div class="thinking-indicator">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
              </div>
            </div>`;
      const incomingMessageDiv = createMessageElement(messageContent, "bot-message", "thinking");
      chatBody.appendChild(incomingMessageDiv);
      chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
      generateBotResponse(incomingMessageDiv);
    }, 600);
  }
};

// Adjust input field height dynamically
messageInput.addEventListener("input", () => {
  messageInput.style.height = `${initialInputHeight}px`;
  messageInput.style.height = `${messageInput.scrollHeight}px`;
  document.querySelector(".chat-form").style.borderRadius =
    messageInput.scrollHeight > initialInputHeight ? "15px" : "32px";
});

// Handle Enter key press for sending messages
messageInput.addEventListener("keydown", (e) => {
  const userMessage = e.target.value.trim();
  const fileUploaded = userData.file.data;

  if (e.key === "Enter" && !e.shiftKey && (userMessage || fileUploaded)) {
    e.preventDefault(); // Prevent default newline
    handleOutgoingMessage(e);
  }
  // Shift+Enter allows new lines (default behavior)
});

// Handle file input change and preview the selected file
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;

  // Simple validation for image types (optional but recommended)
  if (!file.type.startsWith("image/")) {
    alert("Please select an image file (e.g., JPEG, PNG, WEBP).");
    fileInput.value = ""; // Clear the input
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    fileInput.value = "";
    fileUploadWrapper.querySelector("img").src = e.target.result;
    fileUploadWrapper.classList.add("file-uploaded");
    const base64String = e.target.result.split(",")[1];

    // Store file data in userData
    userData.file = {
      data: base64String,
      mimeType: file.type, // <-- FIX: Use mimeType
    };
  };
  reader.readAsDataURL(file);
});

// Cancel file upload
fileCancelButton.addEventListener("click", () => {
  userData.file = { data: null, mimeType: null };
  fileUploadWrapper.classList.remove("file-uploaded");
});

// Assume EmojiMart is loaded correctly in your HTML
// Initialize emoji picker and handle emoji selection
const picker = new EmojiMart.Picker({
  theme: "light",
  skinTonePosition: "none",
  previewPosition: "none",
  onEmojiSelect: (emoji) => {
    const { selectionStart: start, selectionEnd: end } = messageInput;
    messageInput.setRangeText(emoji.native, start, end, "end");
    messageInput.focus();
  },
  onClickOutside: (e) => {
    if (e.target.id === "emoji-picker") {
      document.body.classList.toggle("show-emoji-picker");
    } else {
      document.body.classList.remove("show-emoji-picker");
    }
  },
});
document.querySelector(".chat-form").appendChild(picker);

// Function to get time-based greeting
function getTimeBasedGreeting() {
  const now = new Date();
  const hour = now.getHours();

  if (hour >= 5 && hour < 12) {
    return "Good morning";
  } else if (hour >= 12 && hour < 17) {
    return "Good afternoon";
  } else if (hour >= 17 && hour < 22) {
    return "Good evening";
  } else {
    return "Hello";
  }
}

// Function to validate business email
// Function to handle user info form submission
function handleInfoFormSubmission(e) {
  e.preventDefault();

  const name = userNameInput.value.trim();
  const email = userEmailInput.value.trim();

  let isValid = true;

  // Clear previous errors
  nameError.textContent = '';
  emailError.textContent = '';

  // Validate name
  if (!name) {
    nameError.textContent = 'Please enter your name';
    isValid = false;
  }

  // Validate email
  if (!email) {
    emailError.textContent = 'Please enter your email';
    isValid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    emailError.textContent = 'Please enter a valid email address';
    isValid = false;
  }

  if (isValid) {
    // Store user profile
    userProfile.name = name;
    userProfile.email = email;
    userProfile.isFormSubmitted = true;

    // Save to localStorage
    saveUserProfile();

    // Submit lead to Google Sheets via API
    submitChatbotLead(name, email);

    // Hide form and show chat interface
    userInfoForm.style.display = 'none';
    chatBody.style.display = 'block';
    chatFooter.style.display = 'block';

    // Update welcome message with personalized greeting
    const greeting = getTimeBasedGreeting();
    welcomeMessage.textContent = `${greeting}, ${name}! How can I help you today?`;

    // Register this as a fresh conversation thread and start watching for
    // a live agent joining this session
    upsertThread(chatSessionId, '');
    startChatPolling();
    startPresenceHeartbeat();
  }
}

// Function to submit chatbot lead to backend API
function submitChatbotLead(name, email) {
  // Derive the base API URL from the chat endpoint (replace /api/chat with /api/user-profile)
  const chatEndpoint = getAPIEndpoint();
  const apiBaseUrl = chatEndpoint.replace('/api/chat', '');
  const userProfileUrl = apiBaseUrl + '/api/user-profile';

  fetch(userProfileUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      console.log('Chatbot lead saved successfully');
    } else if (data.duplicate) {
      console.log('Returning lead:', data.message);
    } else {
      console.warn('Lead save response:', data);
    }
  })
  .catch(err => {
    console.error('Failed to save chatbot lead:', err);
  });
}

// Function to initialize chatbot on page load
function initializeChatbot() {
  // Pre-render predefined question cards
  renderPredefinedQuestions();

  // Try to load saved user profile
  if (loadUserProfile() && userProfile.isFormSubmitted) {
    // User data exists, skip form and show chat interface
    userInfoForm.style.display = 'none';
    chatBody.style.display = 'block';
    chatFooter.style.display = 'block';

    // Update welcome message with personalized greeting
    const greeting = getTimeBasedGreeting();
    welcomeMessage.textContent = `${greeting}, ${userProfile.name}! How can I help you today?`;

    // Make sure this session shows up in the conversation threads list
    upsertThread(chatSessionId, '');

    // Resume watching for a live agent picking up this returning session
    startChatPolling();
  }
  // If no saved data, form remains visible (default behavior)
}

// --- Event Listeners ---
infoForm.addEventListener("submit", handleInfoFormSubmission);

sendMessage.addEventListener("click", (e) => {
  if (!userProfile.isFormSubmitted) return;

  const userMessage = messageInput.value.trim();
  const fileUploaded = userData.file.data;
  if (userMessage || fileUploaded) {
    handleOutgoingMessage(e);
  }
});
document.querySelector("#file-upload").addEventListener("click", () => fileInput.click());
closeChatbot.addEventListener("click", () => {
  document.body.classList.remove("show-chatbot");
  closeThreadsPanel();
  if (userProfile.isFormSubmitted) stopPresenceHeartbeat();
});
chatbotToggler.addEventListener("click", () => {
  document.body.classList.toggle("show-chatbot");
  if (!userProfile.isFormSubmitted) return;
  if (isWidgetOpen()) {
    widgetUnreadCount = 0;
    updateTogglerBadge();
    startPresenceHeartbeat();
  } else {
    stopPresenceHeartbeat();
  }
});

// Event listener using event delegation for chat interactions
chatBody.addEventListener("click", (e) => {
  // Handle category button clicks (accordion expand/collapse)
  if (e.target.classList.contains("pq-cat-btn") || e.target.closest(".pq-cat-btn")) {
    const btn = e.target.classList.contains("pq-cat-btn") ? e.target : e.target.closest(".pq-cat-btn");
    const category = btn.getAttribute('data-category');
    if (!category) return;

    const containerId = `pq-questions-${category.toLowerCase()}`;
    const container = document.getElementById(containerId);
    if (!container) return;

    const isOpen = container.style.display !== 'none';

    // Close all other open containers
    document.querySelectorAll('.pq-questions').forEach(el => {
      el.style.display = 'none';
    });
    document.querySelectorAll('.pq-cat-btn').forEach(b => {
      b.classList.remove('active');
    });

    // Toggle this one
    if (!isOpen) {
      container.style.display = 'flex';
      btn.classList.add('active');
    }

    return;
  }

  // Handle predefined question card clicks
  if (e.target.classList.contains("pq-card") || e.target.closest(".pq-card")) {
    const card = e.target.classList.contains("pq-card") ? e.target : e.target.closest(".pq-card");
    const question = card.getAttribute('data-question') || card.textContent.trim();

    if (!userProfile.isFormSubmitted) {
      return;
    }

    // Hide predefined questions
    const pqContainer = document.getElementById("predefined-questions");
    if (pqContainer) {
      pqContainer.style.display = "none";
    }

    // Create artificial event and pass question text through handleOutgoingMessage
    const syntheticEvent = { preventDefault: () => {} };
    handleOutgoingMessage(syntheticEvent, question);
    return;
  }

  if (e.target.classList.contains("quick-reply")) {
    console.log('Quick reply clicked:', e.target.textContent.trim());
    if (!userProfile.isFormSubmitted) {
      console.log('User profile not submitted');
      return;
    }

    const message = e.target.textContent.trim();

    // Special handling for Schedule a call button
    if (message === "Schedule a call") {
      console.log('Schedule a call detected');
      // Hide quick replies
      const quickReplies = document.querySelector(".quick-replies");
      if (quickReplies) {
        quickReplies.style.display = "none";
      }

      // Create user message
      const userMessageContent = `<div class="message-text">${message}</div>`;
      const userMessageDiv = createMessageElement(userMessageContent, "user-message");
      chatBody.appendChild(userMessageDiv);
      chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });

      // Show bot response with scheduling options
      setTimeout(() => {
        const botMessageContent = `<svg class="bot-avatar" xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 1024 1024">
            <path d="M738.3 287.6H285.7c-59 0-106.8 47.8-106.8 106.8v303.1c0 59 47.8 106.8 106.8 106.8h81.5v111.1c0 .7.8 1.1 1.4.7l166.9-110.6 41.8-.8h117.4l43.6-.4c59 0 106.8-47.8 106.8-106.8V394.5c0-59-47.8-106.9-106.8-106.9zM351.7 448.2c0-29.5 23.9-53.5 53.5-53.5s53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5-53.9-23.9-53.5-53.5zm157.9 267.1c-67.8 0-123.8-47.5-132.3-109h264.6c-8.6 61.5-64.5 109-132.3 109zm110-213.7c-29.5 0-53.5-23.9-53.5-53.5s23.9-53.5 53.5-53.5 53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5zM867.2 644.5V453.1h26.5c19.4 0 35.1 15.7 35.1 35.1v121.1c0 19.4-15.7 35.1-35.1 35.1h-26.5zM95.2 609.4V488.2c0-19.4 15.7-35.1 35.1-35.1h26.5v191.3h-26.5c-19.4 0-35.1-15.7-35.1-35.1zM561.5 149.6c0 23.4-15.6 43.3-36.9 49.7v44.9h-30v-44.9c-21.4-6.5-36.9-26.3-36.9-49.7 0-28.6 23.3-51.9 51.9-51.9s51.9 23.3 51.9 51.9z" />
          </svg>
          <div class="message-text" id="scheduling-options">
            To schedule a call and discuss your project requirements for real-time infrastructure intelligence, please use one of the following options:<br><br>
            1. Call Our Experts Directly:<br>
            • Phone: +91 7893023322<br><br>
            2. Send a Detailed Inquiry:<br>
            • Email: <a href="mailto:sentra@clovetech.com">sentra@clovetech.com</a><br><br>
            <button class="calendly-link" style="background: #f48120; color: white; border: none; padding: 8px 16px; border-radius: 50px; cursor: pointer; font-weight: bold;">Schedule a Call</button>
          </div>`;
        const botMessageDiv = createMessageElement(botMessageContent, "bot-message");
        chatBody.appendChild(botMessageDiv);
        chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });

        // Add click handler for Calendly link
        const calendlyLink = botMessageDiv.querySelector('.calendly-link');
        if (calendlyLink) {
          calendlyLink.addEventListener('click', () => {
            if (typeof Calendly !== 'undefined') {
              Calendly.initPopupWidget({ url: 'https://calendly.com/sentra-clovetech/30min?primary_color=f47b0a' });
            } else {
              window.open('https://calendly.com/sentra-clovetech/30min?primary_color=f47b0a', '_blank');
            }
          });
        }
      }, 600);
      return;
    }

    messageInput.value = message;

    // Trigger the send message functionality
    handleOutgoingMessage(e);
  }
});

// Initialize chatbot on page load
initializeChatbot();