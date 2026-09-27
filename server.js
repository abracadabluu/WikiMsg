const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const HOUR = 60 * 60 * 1000;
const POST_LIFETIME = 12 * HOUR;

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

function publicUser(u) {
  return { id: u.id, name: u.name, username: u.username };
}

// --- Auth middleware ---
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  const user = db.prepare('SELECT * FROM users WHERE token = ?').get(token);
  if (!user) return res.status(401).json({ error: 'Invalid session, please login again' });
  req.user = user;
  next();
}

// --- Username availability check ---
app.get('/api/check-username', (req, res) => {
  const username = String(req.query.username || '').trim().toLowerCase();
  if (!username) return res.json({ available: false, reason: 'empty' });
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return res.json({ available: false, reason: 'Username 3-20 chars: letters, numbers, underscore only' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  res.json({ available: !existing });
});

// --- Register ---
app.post('/api/register', (req, res) => {
  const { name, username, password } = req.body || {};
  const uname = String(username || '').trim().toLowerCase();
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!/^[a-z0-9_]{3,20}$/.test(uname)) {
    return res.status(400).json({ error: 'Username must be 3-20 chars: letters, numbers, underscore only' });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(uname);
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  const hash = bcrypt.hashSync(password, 10);
  const token = makeToken();
  const info = db.prepare(
    'INSERT INTO users (name, username, password_hash, token, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(name.trim(), uname, hash, token, Date.now());

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.json({ token, user: publicUser(user) });
});

// --- Login ---
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const uname = String(username || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(uname);
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = makeToken();
  db.prepare('UPDATE users SET token = ? WHERE id = ?').run(token, user.id);
  res.json({ token, user: publicUser(user) });
});

// --- Current user ---
app.get('/api/me', auth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// --- Search users by username (excludes self) ---
app.get('/api/users/search', auth, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return res.json({ results: [] });
  const rows = db.prepare(
    'SELECT id, name, username FROM users WHERE username LIKE ? AND id != ? LIMIT 20'
  ).all(`%${q}%`, req.user.id);
  const contactIds = new Set(
    db.prepare('SELECT contact_id FROM contacts WHERE owner_id = ?').all(req.user.id).map(r => r.contact_id)
  );
  res.json({ results: rows.map(r => ({ ...r, isContact: contactIds.has(r.id) })) });
});

// --- Get a profile by username ---
app.get('/api/users/:username', auth, (req, res) => {
  const target = db.prepare('SELECT id, name, username FROM users WHERE username = ?').get(req.params.username.toLowerCase());
  if (!target) return res.status(404).json({ error: 'User not found' });
  const isContact = !!db.prepare('SELECT 1 FROM contacts WHERE owner_id = ? AND contact_id = ?').get(req.user.id, target.id);
  res.json({ user: target, isContact });
});

// --- Add contact (mutual) ---
app.post('/api/contacts/add', auth, (req, res) => {
  const uname = String((req.body || {}).username || '').trim().toLowerCase();
  const target = db.prepare('SELECT * FROM users WHERE username = ?').get(uname);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: "Can't add yourself" });
  const now = Date.now();
  db.prepare('INSERT OR IGNORE INTO contacts (owner_id, contact_id, created_at) VALUES (?, ?, ?)').run(req.user.id, target.id, now);
  db.prepare('INSERT OR IGNORE INTO contacts (owner_id, contact_id, created_at) VALUES (?, ?, ?)').run(target.id, req.user.id, now);
  res.json({ ok: true });
});

// --- List contacts ---
app.get('/api/contacts', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.name, u.username FROM contacts c
    JOIN users u ON u.id = c.contact_id
    WHERE c.owner_id = ?
    ORDER BY u.name COLLATE NOCASE
  `).all(req.user.id);
  res.json({ contacts: rows });
});

// --- List chats (people you've exchanged messages with) ---
app.get('/api/chats', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.name, u.username,
      (SELECT text FROM messages m2
        WHERE (m2.sender_id = u.id AND m2.receiver_id = ?) OR (m2.sender_id = ? AND m2.receiver_id = u.id)
        ORDER BY m2.created_at DESC LIMIT 1) AS last_text,
      (SELECT created_at FROM messages m2
        WHERE (m2.sender_id = u.id AND m2.receiver_id = ?) OR (m2.sender_id = ? AND m2.receiver_id = u.id)
        ORDER BY m2.created_at DESC LIMIT 1) AS last_time
    FROM users u
    WHERE u.id IN (
      SELECT sender_id FROM messages WHERE receiver_id = ?
      UNION
      SELECT receiver_id FROM messages WHERE sender_id = ?
    )
    ORDER BY last_time DESC
  `).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id);
  res.json({ chats: rows });
});

// --- Get conversation with a user ---
app.get('/api/messages/:username', auth, (req, res) => {
  const other = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username.toLowerCase());
  if (!other) return res.status(404).json({ error: 'User not found' });
  const rows = db.prepare(`
    SELECT id, sender_id, receiver_id, text, created_at FROM messages
    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    ORDER BY created_at ASC
  `).all(req.user.id, other.id, other.id, req.user.id);
  res.json({
    other: publicUser(other),
    messages: rows.map(r => ({ ...r, mine: r.sender_id === req.user.id }))
  });
});

// --- Send a message ---
app.post('/api/messages/:username', auth, (req, res) => {
  const text = String((req.body || {}).text || '').trim();
  if (!text) return res.status(400).json({ error: 'Message is empty' });
  const other = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username.toLowerCase());
  if (!other) return res.status(404).json({ error: 'User not found' });
  const now = Date.now();
  db.prepare('INSERT INTO messages (sender_id, receiver_id, text, created_at) VALUES (?, ?, ?, ?)')
    .run(req.user.id, other.id, text, now);
  res.json({ ok: true, created_at: now });
});

// --- Create a post (12hr broadcast to contacts) ---
app.post('/api/posts', auth, (req, res) => {
  const text = String((req.body || {}).text || '').trim();
  if (!text) return res.status(400).json({ error: 'Post is empty' });
  const now = Date.now();
  const info = db.prepare('INSERT INTO posts (user_id, text, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(req.user.id, text, now, now + POST_LIFETIME);
  res.json({ ok: true, id: info.lastInsertRowid });
});

// --- Feed: own posts + contacts' posts (not expired). Viewing marks contacts' posts as seen. ---
app.get('/api/posts/feed', auth, (req, res) => {
  const now = Date.now();
  db.prepare('DELETE FROM posts WHERE expires_at <= ?').run(now); // cleanup expired

  const contactIds = db.prepare('SELECT contact_id FROM contacts WHERE owner_id = ?').all(req.user.id).map(r => r.contact_id);
  const ids = [req.user.id, ...contactIds];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT p.id, p.user_id, p.text, p.created_at, p.expires_at, u.name, u.username
    FROM posts p JOIN users u ON u.id = p.user_id
    WHERE p.user_id IN (${placeholders})
    ORDER BY p.created_at DESC
  `).all(...ids);

  // mark as viewed for posts not authored by me
  const markView = db.prepare('INSERT OR IGNORE INTO post_views (post_id, viewer_id, viewed_at) VALUES (?, ?, ?)');
  for (const p of rows) {
    if (p.user_id !== req.user.id) markView.run(p.id, req.user.id, now);
  }

  res.json({ posts: rows.map(p => ({ ...p, mine: p.user_id === req.user.id })) });
});

// --- Who has viewed my post ---
app.get('/api/posts/:id/views', auth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found or expired' });
  if (post.user_id !== req.user.id) return res.status(403).json({ error: 'Not your post' });
  const viewers = db.prepare(`
    SELECT u.name, u.username, pv.viewed_at FROM post_views pv
    JOIN users u ON u.id = pv.viewer_id
    WHERE pv.post_id = ?
    ORDER BY pv.viewed_at ASC
  `).all(post.id);
  res.json({ viewers });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`WikiMsg server running on port ${PORT}`));
    
