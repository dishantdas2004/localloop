// LocalLoop REST API (Express 5 + SQLite)
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { openDb } = require('./db');
const { scoreMatch, haversineKm, MIN_SCORE } = require('./matching');

const CATEGORIES = ['Tools', 'Kitchen', 'Electronics', 'Outdoors', 'Garden', 'Books & Games', 'Party & Events', 'Other'];
const CONDITIONS = ['New', 'Good', 'Fair'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString('hex');
}
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000) + 1;

function createApp(db) {
  const app = express();
  app.use(express.json({ limit: '50kb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  const q = (sql, ...p) => db.prepare(sql).all(...p);
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  const fail = (res, code, msg) => res.status(code).json({ error: msg });
  const clean = (s, max) => String(s ?? '').trim().slice(0, max);

  // ---------- auth ----------
  function auth(req, res, next) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    const row = token && one(`SELECT u.id, u.name, u.email, u.neighbourhood_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`, token);
    if (!row) return fail(res, 401, 'Please log in first.');
    req.user = row;
    next();
  }
  function optionalAuth(req, res, next) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    req.user = (token && one(`SELECT u.id, u.name, u.email, u.neighbourhood_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`, token)) || null;
    next();
  }
  const newSession = (userId) => {
    const token = crypto.randomBytes(32).toString('hex');
    run('INSERT INTO sessions (token, user_id) VALUES (?, ?)', token, userId);
    return token;
  };

  app.get('/api/neighbourhoods', (req, res) => res.json(q('SELECT * FROM neighbourhoods ORDER BY name')));
  app.get('/api/categories', (req, res) => res.json(CATEGORIES));

  app.post('/api/register', (req, res) => {
    const name = clean(req.body.name, 60), email = clean(req.body.email, 120).toLowerCase();
    const password = String(req.body.password ?? ''), nb = Number(req.body.neighbourhood_id);
    if (name.length < 2) return fail(res, 400, 'Please enter your name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, 'Please enter a valid email address.');
    if (password.length < 6) return fail(res, 400, 'Password must be at least 6 characters.');
    if (!one('SELECT id FROM neighbourhoods WHERE id = ?', nb)) return fail(res, 400, 'Please choose your neighbourhood.');
    if (one('SELECT id FROM users WHERE email = ?', email)) return fail(res, 409, 'An account with this email already exists.');
    const salt = crypto.randomBytes(16).toString('hex');
    const r = run('INSERT INTO users (name, email, password_hash, salt, neighbourhood_id) VALUES (?,?,?,?,?)', name, email, hashPassword(password, salt), salt, nb);
    const token = newSession(Number(r.lastInsertRowid));
    res.status(201).json({ token, user: { id: Number(r.lastInsertRowid), name, email, neighbourhood_id: nb } });
  });

  app.post('/api/login', (req, res) => {
    const email = clean(req.body.email, 120).toLowerCase(), password = String(req.body.password ?? '');
    const u = one('SELECT * FROM users WHERE email = ?', email);
    if (!u) return fail(res, 401, 'Incorrect email or password.');
    const a = Buffer.from(hashPassword(password, u.salt), 'hex'), b = Buffer.from(u.password_hash, 'hex');
    if (!crypto.timingSafeEqual(a, b)) return fail(res, 401, 'Incorrect email or password.');
    res.json({ token: newSession(u.id), user: { id: u.id, name: u.name, email: u.email, neighbourhood_id: u.neighbourhood_id } });
  });

  app.post('/api/logout', auth, (req, res) => {
    run('DELETE FROM sessions WHERE token = ?', req.headers.authorization.slice(7));
    res.json({ ok: true });
  });

  app.get('/api/me', auth, (req, res) => res.json(req.user));

  app.get('/api/stats', (req, res) => res.json({
    items: one(`SELECT COUNT(*) c FROM items WHERE status != 'removed'`).c,
    members: one('SELECT COUNT(*) c FROM users').c,
    loans: one(`SELECT COUNT(*) c FROM requests WHERE status IN ('accepted','returned')`).c,
    neighbourhoods: one('SELECT COUNT(*) c FROM neighbourhoods').c,
  }));

  // ---------- items ----------
  const itemSelect = `SELECT i.*, u.name AS owner_name, n.name AS neighbourhood, n.lat, n.lng
    FROM items i JOIN users u ON u.id = i.owner_id JOIN neighbourhoods n ON n.id = i.neighbourhood_id`;

  function withDistance(rows, user) {
    const home = user && one('SELECT lat, lng FROM neighbourhoods WHERE id = ?', user.neighbourhood_id);
    return rows.map((r) => {
      const o = { ...r };
      o.distance_km = home ? Math.round(haversineKm(home.lat, home.lng, r.lat, r.lng) * 10) / 10 : null;
      delete o.lat; delete o.lng;
      return o;
    });
  }

  app.get('/api/items', optionalAuth, (req, res) => {
    const where = [`i.status != 'removed'`], params = [];
    const text = clean(req.query.q, 80);
    if (text) { where.push('(i.title LIKE ? OR i.description LIKE ?)'); params.push(`%${text}%`, `%${text}%`); }
    if (req.query.category && CATEGORIES.includes(req.query.category)) { where.push('i.category = ?'); params.push(req.query.category); }
    if (req.query.status === 'available') where.push(`i.status = 'available'`);
    let rows = withDistance(q(`${itemSelect} WHERE ${where.join(' AND ')} ORDER BY i.created_at DESC, i.id DESC`, ...params), req.user);
    const maxKm = Number(req.query.max_km);
    if (maxKm > 0 && req.user) rows = rows.filter((r) => r.distance_km <= maxKm);
    if (req.query.sort === 'distance' && req.user) rows.sort((a, b) => a.distance_km - b.distance_km);
    res.json(rows);
  });

  app.get('/api/items/:id', optionalAuth, (req, res) => {
    const row = one(`${itemSelect} WHERE i.id = ? AND i.status != 'removed'`, req.params.id);
    if (!row) return fail(res, 404, 'Item not found.');
    const [item] = withDistance([row], req.user);
    item.owner_id = row.owner_id;
    res.json(item);
  });

  app.post('/api/items', auth, (req, res) => {
    const title = clean(req.body.title, 80), description = clean(req.body.description, 500);
    const category = req.body.category, condition = req.body.condition || 'Good', maxDays = Number(req.body.max_days ?? 3);
    if (title.length < 3) return fail(res, 400, 'Please give the item a title (at least 3 characters).');
    if (!CATEGORIES.includes(category)) return fail(res, 400, 'Please choose a valid category.');
    if (!CONDITIONS.includes(condition)) return fail(res, 400, 'Please choose a valid condition.');
    if (!Number.isInteger(maxDays) || maxDays < 1 || maxDays > 30) return fail(res, 400, 'Maximum lending period must be between 1 and 30 days.');
    const r = run('INSERT INTO items (owner_id, title, description, category, condition, max_days, neighbourhood_id) VALUES (?,?,?,?,?,?,?)',
      req.user.id, title, description, category, condition, maxDays, req.user.neighbourhood_id);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  app.delete('/api/items/:id', auth, (req, res) => {
    const item = one('SELECT * FROM items WHERE id = ?', req.params.id);
    if (!item || item.status === 'removed') return fail(res, 404, 'Item not found.');
    if (item.owner_id !== req.user.id) return fail(res, 403, 'You can only remove your own items.');
    if (item.status === 'lent') return fail(res, 409, 'This item is currently lent out. Mark it as returned first.');
    run(`UPDATE items SET status = 'removed' WHERE id = ?`, item.id);
    run(`UPDATE requests SET status = 'declined' WHERE item_id = ? AND status = 'pending'`, item.id);
    res.json({ ok: true });
  });

  // ---------- borrow requests ----------
  app.post('/api/items/:id/requests', auth, (req, res) => {
    const item = one('SELECT * FROM items WHERE id = ?', req.params.id);
    if (!item || item.status === 'removed') return fail(res, 404, 'Item not found.');
    if (item.owner_id === req.user.id) return fail(res, 400, 'You cannot borrow your own item.');
    const { start_date, end_date } = req.body, message = clean(req.body.message, 300);
    if (!DATE_RE.test(start_date || '') || !DATE_RE.test(end_date || '')) return fail(res, 400, 'Please choose valid start and end dates.');
    if (start_date < today()) return fail(res, 400, 'The start date cannot be in the past.');
    if (end_date < start_date) return fail(res, 400, 'The end date must be on or after the start date.');
    if (daysBetween(start_date, end_date) > item.max_days) return fail(res, 400, `This item can be borrowed for at most ${item.max_days} day(s).`);
    if (item.status !== 'available') return fail(res, 409, 'This item is currently lent out.');
    if (one(`SELECT id FROM requests WHERE item_id = ? AND borrower_id = ? AND status = 'pending'`, item.id, req.user.id))
      return fail(res, 409, 'You already have a pending request for this item.');
    const r = run('INSERT INTO requests (item_id, borrower_id, start_date, end_date, message) VALUES (?,?,?,?,?)', item.id, req.user.id, start_date, end_date, message);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  const reqSelect = `SELECT r.*, i.title AS item_title, i.category, bu.name AS borrower_name, ou.name AS owner_name, i.owner_id
    FROM requests r JOIN items i ON i.id = r.item_id JOIN users bu ON bu.id = r.borrower_id JOIN users ou ON ou.id = i.owner_id`;

  app.get('/api/requests/mine', auth, (req, res) => res.json(q(`${reqSelect} WHERE r.borrower_id = ? ORDER BY r.id DESC`, req.user.id)));
  app.get('/api/requests/incoming', auth, (req, res) => res.json(q(`${reqSelect} WHERE i.owner_id = ? ORDER BY r.id DESC`, req.user.id)));
  app.get('/api/items-mine', auth, (req, res) => res.json(q(`${itemSelect} WHERE i.owner_id = ? AND i.status != 'removed' ORDER BY i.id DESC`, req.user.id)));

  app.patch('/api/requests/:id', auth, (req, res) => {
    const r = one(`${reqSelect} WHERE r.id = ?`, req.params.id);
    if (!r) return fail(res, 404, 'Request not found.');
    const action = req.body.action;
    const isOwner = r.owner_id === req.user.id, isBorrower = r.borrower_id === req.user.id;
    if (action === 'cancel') {
      if (!isBorrower) return fail(res, 403, 'Only the borrower can cancel this request.');
      if (r.status !== 'pending') return fail(res, 409, 'Only pending requests can be cancelled.');
      run(`UPDATE requests SET status = 'cancelled' WHERE id = ?`, r.id);
    } else if (['accept', 'decline', 'returned'].includes(action)) {
      if (!isOwner) return fail(res, 403, 'Only the item owner can do this.');
      if (action === 'accept') {
        if (r.status !== 'pending') return fail(res, 409, 'Only pending requests can be accepted.');
        if (one('SELECT status FROM items WHERE id = ?', r.item_id).status !== 'available') return fail(res, 409, 'This item is already lent out.');
        run(`UPDATE requests SET status = 'accepted' WHERE id = ?`, r.id);
        run(`UPDATE items SET status = 'lent' WHERE id = ?`, r.item_id);
      } else if (action === 'decline') {
        if (r.status !== 'pending') return fail(res, 409, 'Only pending requests can be declined.');
        run(`UPDATE requests SET status = 'declined' WHERE id = ?`, r.id);
      } else {
        if (r.status !== 'accepted') return fail(res, 409, 'Only accepted requests can be marked as returned.');
        run(`UPDATE requests SET status = 'returned' WHERE id = ?`, r.id);
        run(`UPDATE items SET status = 'available' WHERE id = ?`, r.item_id);
      }
    } else return fail(res, 400, 'Unknown action.');
    res.json(one(`${reqSelect} WHERE r.id = ?`, r.id));
  });

  // ---------- wanted board + smart matching ----------
  function matchesFor(w) {
    const home = one('SELECT lat, lng FROM neighbourhoods WHERE id = ?', w.neighbourhood_id);
    const items = q(`${itemSelect} WHERE i.status = 'available' AND i.owner_id != ?`, w.user_id);
    return items.map((it) => {
      const d = haversineKm(home.lat, home.lng, it.lat, it.lng);
      const m = scoreMatch(w, it, d);
      return { id: it.id, title: it.title, item_category: it.category, neighbourhood: it.neighbourhood, owner_name: it.owner_name, ...m };
    }).filter((m) => m.score >= MIN_SCORE).sort((a, b) => b.score - a.score).slice(0, 5);
  }

  app.post('/api/wanted', auth, (req, res) => {
    const text = clean(req.body.text, 200);
    const category = req.body.category && req.body.category !== 'Any' ? req.body.category : null;
    if (text.length < 4) return fail(res, 400, 'Please describe what you need (at least 4 characters).');
    if (category && !CATEGORIES.includes(category)) return fail(res, 400, 'Please choose a valid category.');
    const r = run('INSERT INTO wanted (user_id, text, category, neighbourhood_id) VALUES (?,?,?,?)', req.user.id, text, category, req.user.neighbourhood_id);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  const wantedSelect = `SELECT w.*, u.name AS user_name, n.name AS neighbourhood FROM wanted w JOIN users u ON u.id = w.user_id JOIN neighbourhoods n ON n.id = w.neighbourhood_id`;
  app.get('/api/wanted', optionalAuth, (req, res) => {
    const rows = q(`${wantedSelect} WHERE w.status = 'open' ORDER BY w.id DESC`);
    res.json(rows.map((w) => ({ ...w, mine: !!req.user && w.user_id === req.user.id })));
  });
  app.get('/api/wanted/:id/matches', auth, (req, res) => {
    const w = one('SELECT * FROM wanted WHERE id = ?', req.params.id);
    if (!w) return fail(res, 404, 'Request not found.');
    if (w.user_id !== req.user.id) return fail(res, 403, 'You can only see matches for your own requests.');
    res.json(matchesFor(w));
  });
  app.patch('/api/wanted/:id', auth, (req, res) => {
    const w = one('SELECT * FROM wanted WHERE id = ?', req.params.id);
    if (!w) return fail(res, 404, 'Request not found.');
    if (w.user_id !== req.user.id) return fail(res, 403, 'You can only close your own requests.');
    run(`UPDATE wanted SET status = 'fulfilled' WHERE id = ?`, w.id);
    res.json({ ok: true });
  });

  app.use('/api', (req, res) => fail(res, 404, 'Not found.'));
  return app;
}

module.exports = { createApp, CATEGORIES };

if (require.main === module) {
  const db = openDb(process.env.DB_FILE || path.join(__dirname, 'localloop.db'));
  const port = Number(process.env.PORT || 3000);
  createApp(db).listen(port, () => console.log(`LocalLoop running at http://localhost:${port}`));
}
