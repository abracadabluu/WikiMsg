const API = '';
let TOKEN = localStorage.getItem('wikimsg_token') || null;
let ME = null;
let currentChatUser = null;
let pollTimer = null;

const app = document.getElementById('app');
const navRight = document.getElementById('navRight');

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers.Authorization = 'Bearer ' + TOKEN;
  const res = await fetch(API + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

function renderNav() {
  if (ME) {
    navRight.innerHTML = `<span>${esc(ME.name)} (@${esc(ME.username)})</span> <button id="logoutBtn">Logout</button>`;
    document.getElementById('logoutBtn').onclick = logout;
  } else {
    navRight.innerHTML = '';
  }
}

function logout() {
  TOKEN = null; ME = null;
  localStorage.removeItem('wikimsg_token');
  stopPolling();
  renderNav();
  showAuth();
}

// ---------- AUTH VIEWS ----------
function showAuth() {
  stopPolling();
  app.innerHTML = `
    <h1>WikiMsg mein aapka swagat hai</h1>
    <div class="wiki-box">
      <div id="authTabs">
        <button class="btn" id="tabRegister">Register</button>
        <button class="btn secondary" id="tabLogin">Login</button>
      </div>
      <div id="authForm"></div>
    </div>
  `;
  document.getElementById('tabRegister').onclick = showRegisterForm;
  document.getElementById('tabLogin').onclick = showLoginForm;
  showRegisterForm();
}

function showRegisterForm() {
  const el = document.getElementById('authForm');
  el.innerHTML = `
    <h2>Register</h2>
    <label>Aapka naam</label>
    <input type="text" id="regName" placeholder="e.g. Rahul Sharma">
    <label>Username</label>
    <input type="text" id="regUsername" placeholder="e.g. rahul_s">
    <div id="unameStatus" class="hint"></div>
    <label>Password</label>
    <input type="password" id="regPassword" placeholder="Kam se kam 4 characters">
    <div id="regError" class="error"></div>
    <button class="btn" id="regSubmit">Register karein</button>
  `;
  const unameInput = document.getElementById('regUsername');
  const status = document.getElementById('unameStatus');
  let debounce;
  unameInput.oninput = () => {
    clearTimeout(debounce);
    const val = unameInput.value.trim();
    if (!val) { status.textContent = ''; return; }
    status.textContent = 'Checking...';
    debounce = setTimeout(async () => {
      try {
        const r = await api('/api/check-username?username=' + encodeURIComponent(val));
        if (r.available) { status.textContent = '✓ Username available hai'; status.className = 'ok'; }
        else { status.textContent = '✗ ' + (r.reason === true ? 'Username already taken' : (r.reason || 'Username already taken')); status.className = 'error'; }
      } catch (e) { status.textContent = ''; }
    }, 400);
  };
  document.getElementById('regSubmit').onclick = async () => {
    const name = document.getElementById('regName').value.trim();
    const username = unameInput.value.trim();
    const password = document.getElementById('regPassword').value;
    const errEl = document.getElementById('regError');
    errEl.textContent = '';
    try {
      const r = await api('/api/register', { method: 'POST', body: JSON.stringify({ name, username, password }) });
      TOKEN = r.token; ME = r.user;
      localStorage.setItem('wikimsg_token', TOKEN);
      renderNav();
      showHome();
    } catch (e) { errEl.textContent = e.message; }
  };
}

function showLoginForm() {
  const el = document.getElementById('authForm');
  el.innerHTML = `
    <h2>Login</h2>
    <label>Username</label>
    <input type="text" id="loginUsername">
    <label>Password</label>
    <input type="password" id="loginPassword">
    <div id="loginError" class="error"></div>
    <button class="btn" id="loginSubmit">Login karein</button>
  `;
  document.getElementById('loginSubmit').onclick = async () => {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginError');
    errEl.textContent = '';
    try {
      const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      TOKEN = r.token; ME = r.user;
      localStorage.setItem('wikimsg_token', TOKEN);
      renderNav();
      showHome();
    } catch (e) { errEl.textContent = e.message; }
  };
}

// ---------- HOME ----------
function showHome() {
  stopPolling();
  app.innerHTML = `
    <h1>Namaste, ${esc(ME.name)}</h1>
    <div class="big-actions">
      <button class="btn" id="goChat">💬 Start a chat</button>
      <button class="btn secondary" id="goPost">📝 Post something</button>
    </div>
  `;
  document.getElementById('goChat').onclick = showChatsList;
  document.getElementById('goPost').onclick = showPosts;
}

// ---------- CHATS LIST + SEARCH ----------
async function showChatsList() {
  stopPolling();
  app.innerHTML = `
    <span class="back-link" id="backHome">← Home</span>
    <h1>Chats</h1>
    <div class="wiki-box">
      <label>Dost ka username search karein</label>
      <input type="text" id="searchInput" placeholder="username type karein...">
      <div id="searchResults" class="search-results"></div>
    </div>
    <h2>Aapki chats</h2>
    <div class="wiki-box" id="chatsBox">Loading...</div>
    <button class="btn secondary" id="goPost2">📝 Post something</button>
  `;
  document.getElementById('backHome').onclick = showHome;
  document.getElementById('goPost2').onclick = showPosts;

  let debounce;
  document.getElementById('searchInput').oninput = (e) => {
    clearTimeout(debounce);
    const q = e.target.value.trim();
    const resultsEl = document.getElementById('searchResults');
    if (!q) { resultsEl.innerHTML = ''; return; }
    debounce = setTimeout(async () => {
      const r = await api('/api/users/search?q=' + encodeURIComponent(q));
      if (!r.results.length) { resultsEl.innerHTML = '<p class="hint">Koi user nahi mila</p>'; return; }
      resultsEl.innerHTML = r.results.map(u => `
        <div class="list-row">
          <div><span class="name">${esc(u.name)}</span><br><span class="uname">@${esc(u.username)}</span></div>
          <div>
            <button class="btn small" data-msg="${esc(u.username)}">Message</button>
            ${u.isContact ? '<span class="hint">✓ Contact</span>' : `<button class="btn small secondary" data-add="${esc(u.username)}">Add Contact</button>`}
          </div>
        </div>
      `).join('');
      resultsEl.querySelectorAll('[data-msg]').forEach(b => b.onclick = () => openChat(b.dataset.msg, esc(b.closest('.list-row').querySelector('.name').textContent)));
      resultsEl.querySelectorAll('[data-add]').forEach(b => b.onclick = async () => {
        await api('/api/contacts/add', { method: 'POST', body: JSON.stringify({ username: b.dataset.add }) });
        document.getElementById('searchInput').dispatchEvent(new Event('input'));
      });
    }, 350);
  };

  const chatsBox = document.getElementById('chatsBox');
  try {
    const r = await api('/api/chats');
    if (!r.chats.length) {
      chatsBox.innerHTML = '<p class="hint">Abhi tak koi chat nahi hai. Upar search karke kisi ko message karein.</p>';
    } else {
      chatsBox.innerHTML = r.chats.map(c => `
        <div class="list-row" data-open="${esc(c.username)}" data-name="${esc(c.name)}" style="cursor:pointer">
          <div><span class="name">${esc(c.name)}</span><br><span class="uname">@${esc(c.username)}</span></div>
          <div class="preview">${esc(c.last_text || '')}</div>
        </div>
      `).join('');
      chatsBox.querySelectorAll('[data-open]').forEach(row => {
        row.onclick = () => openChat(row.dataset.open, row.dataset.name);
      });
    }
  } catch (e) {
    chatsBox.innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
}

// ---------- CHAT WINDOW ----------
async function openChat(username, displayName) {
  stopPolling();
  currentChatUser = username;
  app.innerHTML = `
    <span class="back-link" id="backChats">← Chats</span>
    <h1>${esc(displayName || username)}</h1>
    <div class="chat-window">
      <div class="chat-messages" id="chatMessages">Loading...</div>
      <div class="chat-input">
        <input type="text" id="msgInput" placeholder="Message likhein...">
        <button class="btn" id="sendBtn">Send</button>
      </div>
    </div>
  `;
  document.getElementById('backChats').onclick = showChatsList;

  async function loadMessages(scrollDown) {
    const r = await api('/api/messages/' + encodeURIComponent(username));
    const box = document.getElementById('chatMessages');
    if (!box) return;
    box.innerHTML = r.messages.map(m => `
      <div class="msg ${m.mine ? 'mine' : 'theirs'}">
        ${esc(m.text)}
        <span class="time">${new Date(m.created_at).toLocaleString('hi-IN', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    `).join('') || '<p class="hint">Abhi koi message nahi hai. Sabse pehle aap likhein!</p>';
    if (scrollDown) box.scrollTop = box.scrollHeight;
  }
  await loadMessages(true);
  pollTimer = setInterval(() => loadMessages(false), 3000);

  async function send() {
    const input = document.getElementById('msgInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try {
      await api('/api/messages/' + encodeURIComponent(username), { method: 'POST', body: JSON.stringify({ text }) });
      await loadMessages(true);
    } catch (e) { alert(e.message); }
  }
  document.getElementById('sendBtn').onclick = send;
  document.getElementById('msgInput').onkeydown = (e) => { if (e.key === 'Enter') send(); };
}

// ---------- POSTS (12hr broadcast) ----------
async function showPosts() {
  stopPolling();
  app.innerHTML = `
    <span class="back-link" id="backHome">← Home</span>
    <h1>Post something</h1>
    <div class="wiki-box">
      <label>Kuchh likhein (ye aapke contacts ko 12 ghante ke liye dikhega, bina notification ke)</label>
      <textarea id="postText" placeholder="Kya soch rahe hain?"></textarea>
      <div id="postError" class="error"></div>
      <button class="btn" id="postSubmit">Post karein</button>
      <button class="btn secondary" id="goChatBtn">💬 Start a chat</button>
    </div>
    <h2>Feed</h2>
    <div class="wiki-box" id="feedBox">Loading...</div>
  `;
  document.getElementById('backHome').onclick = showHome;
  document.getElementById('goChatBtn').onclick = showChatsList;
  document.getElementById('postSubmit').onclick = async () => {
    const text = document.getElementById('postText').value.trim();
    const errEl = document.getElementById('postError');
    if (!text) { errEl.textContent = 'Kuchh likhein pehle'; return; }
    try {
      await api('/api/posts', { method: 'POST', body: JSON.stringify({ text }) });
      document.getElementById('postText').value = '';
      errEl.textContent = '';
      loadFeed();
    } catch (e) { errEl.textContent = e.message; }
  };

  async function loadFeed() {
    const feedBox = document.getElementById('feedBox');
    try {
      const r = await api('/api/posts/feed');
      if (!r.posts.length) {
        feedBox.innerHTML = '<p class="hint">Koi post nahi hai abhi. Contacts add karein taaki unki posts dikhein.</p>';
        return;
      }
      feedBox.innerHTML = r.posts.map(p => {
        const hoursLeft = Math.max(0, Math.round((p.expires_at - Date.now()) / 3600000));
        return `
        <div class="post-item">
          <div><span class="name">${esc(p.name)}</span> <span class="uname">@${esc(p.username)}</span></div>
          <div>${esc(p.text)}</div>
          <div class="meta">
            ${hoursLeft}h baaki &middot; ${new Date(p.created_at).toLocaleString('hi-IN')}
            ${p.mine ? `<br><span class="viewers-link" data-viewers="${p.id}">Dekhne walon ki list dekhein</span><div class="viewersOut" id="viewers-${p.id}"></div>` : ''}
          </div>
        </div>`;
      }).join('');
      feedBox.querySelectorAll('[data-viewers]').forEach(el => {
        el.onclick = async () => {
          const out = document.getElementById('viewers-' + el.dataset.viewers);
          const r2 = await api(`/api/posts/${el.dataset.viewers}/views`);
          out.innerHTML = r2.viewers.length
            ? '<ul>' + r2.viewers.map(v => `<li>${esc(v.name)} (@${esc(v.username)})</li>`).join('') + '</ul>'
            : '<p class="hint">Abhi tak kisi ne nahi dekha</p>';
        };
      });
    } catch (e) {
      feedBox.innerHTML = `<p class="error">${esc(e.message)}</p>`;
    }
  }
  loadFeed();
  pollTimer = setInterval(loadFeed, 15000);
}

// ---------- BOOTSTRAP ----------
async function init() {
  if (TOKEN) {
    try {
      const r = await api('/api/me');
      ME = r.user;
      renderNav();
      showHome();
      return;
    } catch (e) {
      TOKEN = null;
      localStorage.removeItem('wikimsg_token');
    }
  }
  renderNav();
  showAuth();
}

init();
