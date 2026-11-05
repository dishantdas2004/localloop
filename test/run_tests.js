// LocalLoop automated verification: API test cases, matching accuracy and response times.
// Usage: node --no-warnings test/run_tests.js   (writes test/results.json)
const fs = require('fs'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { openDb } = require('../db');
const { seed } = require('../seed');
const { createApp } = require('../server');

const DB = '/tmp/ll_test.db';
fs.rmSync(DB, { force: true });
const db = openDb(DB); seed(db);
const app = createApp(db);
const PORT = 3200, BASE = `http://localhost:${PORT}/api`;
const results = [];

async function call(method, url, body, token) {
  const t0 = performance.now();
  const res = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const ms = performance.now() - t0;
  let data = null; try { data = await res.json(); } catch (e) {}
  return { status: res.status, data, ms };
}
function record(id, module, desc, expected, actual, pass) { results.push({ id, module, desc, expected, actual, pass }); }
const days = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

(async () => {
  const server = app.listen(PORT);
  const login = async (email) => (await call('POST', '/login', { email, password: 'demo1234' })).data.token;
  const priya = await login('demo@localloop.test'), tenzing = await login('tenzing@localloop.test'), rohan = await login('rohan@localloop.test');
  let r, n = 0; const id = () => 'TC' + String(++n).padStart(2, '0');

  // ---- Authentication ----
  r = await call('POST', '/register', { name: 'Sikha Sharma', email: 'sikha@example.com', password: 'secret123', neighbourhood_id: 8 });
  record(id(), 'Authentication', 'Register with valid details', '201 Created and a session token', `${r.status}, token ${r.data.token ? 'issued' : 'missing'}`, r.status === 201 && !!r.data.token);
  r = await call('POST', '/register', { name: 'Sikha Again', email: 'sikha@example.com', password: 'secret123', neighbourhood_id: 8 });
  record(id(), 'Authentication', 'Register with an email that already exists', '409 Conflict', `${r.status}: ${r.data.error}`, r.status === 409);
  r = await call('POST', '/register', { name: 'Test User', email: 'short@example.com', password: '123', neighbourhood_id: 8 });
  record(id(), 'Authentication', 'Register with a password shorter than 6 characters', '400 Bad Request', `${r.status}: ${r.data.error}`, r.status === 400);
  r = await call('POST', '/register', { name: 'Test User', email: 'not-an-email', password: 'secret123', neighbourhood_id: 8 });
  record(id(), 'Authentication', 'Register with an invalid email address', '400 Bad Request', `${r.status}: ${r.data.error}`, r.status === 400);
  r = await call('POST', '/login', { email: 'demo@localloop.test', password: 'demo1234' });
  record(id(), 'Authentication', 'Log in with correct credentials', '200 OK and a session token', `${r.status}, token ${r.data.token ? 'issued' : 'missing'}`, r.status === 200 && !!r.data.token);
  r = await call('POST', '/login', { email: 'demo@localloop.test', password: 'wrongpass' });
  record(id(), 'Authentication', 'Log in with a wrong password', '401 Unauthorized', `${r.status}: ${r.data.error}`, r.status === 401);
  r = await call('GET', '/me');
  record(id(), 'Authentication', 'Open a protected route without logging in', '401 Unauthorized', `${r.status}: ${r.data.error}`, r.status === 401);

  // ---- Items ----
  r = await call('POST', '/items', { title: 'Portable induction cooktop', category: 'Kitchen', condition: 'Good', max_days: 3, description: '2000W single burner' }, priya);
  const newItem = r.data.id;
  record(id(), 'Items', 'Share an item with valid details', '201 Created', `${r.status}, item id ${newItem}`, r.status === 201);
  r = await call('POST', '/items', { title: '', category: 'Kitchen' }, priya);
  record(id(), 'Items', 'Share an item without a title', '400 Bad Request', `${r.status}: ${r.data.error}`, r.status === 400);
  r = await call('POST', '/items', { title: 'Mystery box', category: 'Weapons' }, priya);
  record(id(), 'Items', 'Share an item with an invalid category', '400 Bad Request', `${r.status}: ${r.data.error}`, r.status === 400);
  r = await call('GET', '/items');
  record(id(), 'Items', 'Browse all items without logging in', '200 OK and the full list (21 items)', `${r.status}, ${r.data.length} items`, r.status === 200 && r.data.length === 21);
  r = await call('GET', '/items?q=ladder');
  record(id(), 'Items', 'Search for the keyword “ladder”', 'Only the step ladder is returned', `${r.data.length} result: ${r.data.map((x) => x.title).join('; ')}`, r.data.length === 1 && /ladder/i.test(r.data[0].title));
  r = await call('GET', '/items?category=Kitchen');
  record(id(), 'Items', 'Filter by category “Kitchen”', 'Every returned item is in Kitchen', `${r.data.length} items, all Kitchen: ${r.data.every((x) => x.category === 'Kitchen')}`, r.data.length > 0 && r.data.every((x) => x.category === 'Kitchen'));
  r = await call('GET', '/items?max_km=3', null, priya);
  record(id(), 'Items', 'Filter items within 3 km (user in Deorali)', 'Every returned item is 3 km or closer', `${r.data.length} items, max distance ${Math.max(...r.data.map((x) => x.distance_km))} km`, r.data.length > 0 && r.data.every((x) => x.distance_km <= 3));
  r = await call('GET', '/items?sort=distance', null, priya);
  const ds = r.data.map((x) => x.distance_km);
  record(id(), 'Items', 'Sort items by nearest first', 'Distances are in ascending order', `first ${ds[0]} km, last ${ds[ds.length - 1]} km`, ds.every((v, i) => i === 0 || ds[i - 1] <= v));
  r = await call('DELETE', `/items/${newItem}`, null, tenzing);
  record(id(), 'Items', 'Remove an item that belongs to someone else', '403 Forbidden', `${r.status}: ${r.data.error}`, r.status === 403);
  r = await call('DELETE', `/items/${newItem}`, null, priya);
  record(id(), 'Items', 'Remove your own item', '200 OK', `${r.status}`, r.status === 200);

  // ---- Borrow requests ----
  const ladder = 2; // owned by Rohan, available
  r = await call('POST', '/items/2/requests', { start_date: days(1), end_date: days(2) }, rohan);
  record(id(), 'Requests', 'Request your own item', '400 Bad Request', `${r.status}: ${r.data.error}`, r.status === 400);
  r = await call('POST', `/items/${ladder}/requests`, { start_date: days(3), end_date: days(1) }, priya);
  record(id(), 'Requests', 'Request with an end date before the start date', '400 Bad Request', `${r.status}: ${r.data.error}`, r.status === 400);
  r = await call('POST', `/items/${ladder}/requests`, { start_date: days(1), end_date: days(6) }, priya);
  record(id(), 'Requests', 'Request longer than the item’s maximum lending period (2 days)', '400 Bad Request', `${r.status}: ${r.data.error}`, r.status === 400);
  r = await call('POST', `/items/${ladder}/requests`, { start_date: days(1), end_date: days(2), message: 'Water tank cleaning' }, priya);
  const reqId = r.data.id;
  record(id(), 'Requests', 'Send a valid borrow request', '201 Created', `${r.status}, request id ${reqId}`, r.status === 201);
  r = await call('POST', `/items/${ladder}/requests`, { start_date: days(1), end_date: days(2) }, priya);
  record(id(), 'Requests', 'Send a second pending request for the same item', '409 Conflict', `${r.status}: ${r.data.error}`, r.status === 409);
  r = await call('PATCH', `/requests/${reqId}`, { action: 'accept' }, tenzing);
  record(id(), 'Requests', 'Someone other than the owner tries to accept', '403 Forbidden', `${r.status}: ${r.data.error}`, r.status === 403);
  r = await call('PATCH', `/requests/${reqId}`, { action: 'accept' }, rohan);
  const after = await call('GET', `/items/${ladder}`);
  record(id(), 'Requests', 'Owner accepts the request', 'Request accepted and item becomes “lent”', `${r.status}, request ${r.data.status}, item ${after.data.status}`, r.status === 200 && r.data.status === 'accepted' && after.data.status === 'lent');
  r = await call('POST', `/items/${ladder}/requests`, { start_date: days(1), end_date: days(2) }, tenzing);
  record(id(), 'Requests', 'Request an item that is already lent out', '409 Conflict', `${r.status}: ${r.data.error}`, r.status === 409);
  r = await call('PATCH', `/requests/${reqId}`, { action: 'returned' }, rohan);
  const back = await call('GET', `/items/${ladder}`);
  record(id(), 'Requests', 'Owner marks the item as returned', 'Request returned and item “available” again', `${r.status}, request ${r.data.status}, item ${back.data.status}`, r.data.status === 'returned' && back.data.status === 'available');
  r = await call('POST', `/items/${ladder}/requests`, { start_date: days(4), end_date: days(5) }, tenzing);
  const r2 = await call('PATCH', `/requests/${r.data.id}`, { action: 'cancel' }, tenzing);
  record(id(), 'Requests', 'Borrower cancels a pending request', 'Request status becomes “cancelled”', `${r2.status}, ${r2.data.status}`, r2.data.status === 'cancelled');

  // ---- Wanted board ----
  r = await call('POST', '/wanted', { text: 'Need a ladder to reach the ceiling fan', category: 'Tools' }, priya);
  const wid = r.data.id;
  record(id(), 'Wanted board', 'Post a valid “wanted” request', '201 Created', `${r.status}, id ${wid}`, r.status === 201);
  r = await call('POST', '/wanted', { text: 'abc' }, priya);
  record(id(), 'Wanted board', 'Post a request that is too short', '400 Bad Request', `${r.status}: ${r.data.error}`, r.status === 400);
  r = await call('GET', `/wanted/${wid}/matches`, null, priya);
  record(id(), 'Wanted board', 'Smart matches for “Need a ladder to reach the ceiling fan”', 'Top match is the aluminium step ladder', `Top: ${r.data[0] ? r.data[0].title + ' (' + r.data[0].score + '%)' : 'none'}`, !!r.data[0] && /ladder/i.test(r.data[0].title));
  r = await call('GET', `/wanted/${wid}/matches`, null, tenzing);
  record(id(), 'Wanted board', 'Another user views someone else’s matches', '403 Forbidden', `${r.status}: ${r.data.error}`, r.status === 403);
  await call('PATCH', `/wanted/${wid}`, null, priya);
  r = await call('GET', '/wanted');
  record(id(), 'Wanted board', 'Mark a request as fulfilled', 'It disappears from the open board', `still listed: ${r.data.some((w) => w.id === wid)}`, !r.data.some((w) => w.id === wid));

  // ---- Security ----
  r = await call('GET', "/items?q=' OR 1=1 --");
  record(id(), 'Security', 'SQL injection attempt in the search box', 'No error and no data leak (0 results)', `${r.status}, ${r.data.length} results`, r.status === 200 && r.data.length === 0);
  const raw = new DatabaseSync(DB);
  const row = raw.prepare('SELECT password_hash, salt FROM users WHERE email = ?').get('demo@localloop.test');
  record(id(), 'Security', 'Check how passwords are stored in the database', 'Salted scrypt hash, never plain text', `hash length ${row.password_hash.length}, equals password: ${row.password_hash === 'demo1234'}`, row.password_hash !== 'demo1234' && row.password_hash.length === 64 && row.salt.length === 32);

  // ---- Matching accuracy (queries written independently of the item titles) ----
  const queries = [
    ['Need a ladder to reach the ceiling fan', 'Tools', 'Aluminium step ladder (6 ft)'],
    ['Looking for a drill to put up shelves', 'Tools', 'Cordless power drill with bit set'],
    ['Want to borrow a beamer for a presentation', 'Electronics', 'Portable projector with HDMI cable'],
    ['Need a big pot to cook for 30 guests', 'Kitchen', 'Large stock pot for parties'],
    ['Need a tent for a camping trip', 'Outdoors', '4-person camping tent'],
    ['Want a DSLR for a wedding photo shoot', 'Electronics', 'DSLR camera with 50mm lens'],
    ['Need folding tables for a community lunch', 'Party & Events', 'Folding tables (set of 4)'],
    ['Looking for a chess board', 'Books & Games', 'Wooden chess set'],
    ['Need a lawn mower to cut the grass', 'Garden', 'Electric lawn mower'],
    ['Looking for fairy lights for decoration', 'Party & Events', 'String lights 20m'],
    ['Need a bluetooth speaker for a farewell', 'Electronics', 'Bluetooth party speaker'],
    ['Need a saw and hammer to fix a bench', 'Tools', 'Hand saw and hammer set'],
    ['Want a sleeping bag for a cold night', 'Outdoors', 'Sleeping bag (-5°C)'],
    ['Need a trekking bag for a hike', 'Outdoors', 'Trekking backpack 60L'],
    ['Looking for something to cook snacks without oil', 'Kitchen', 'Air fryer (4 litre)'],
    ['Need a pressure cooker for rajma', 'Kitchen', 'Pressure cooker 7 litre'],
    ['Want a board game for a family evening', 'Books & Games', 'Board game set: Catan'],
    ['Need a shovel to plant saplings', 'Garden', 'Garden shovel and pruning shears'],
  ];
  const negatives = [['Need a helicopter for a day', 'Other'], ['Looking for a grand piano', 'Other'], ['Want a surfboard for the weekend', 'Outdoors']];
  const acc = [];
  for (const [text, cat, expected] of queries) {
    const w = await call('POST', '/wanted', { text, category: cat }, priya);
    const m = await call('GET', `/wanted/${w.data.id}/matches`, null, priya);
    const titles = m.data.map((x) => x.title);
    const rank = titles.indexOf(expected) + 1;
    acc.push({ text, expected, rank, top: titles[0] || '(none)', topScore: m.data[0] ? m.data[0].score : 0, count: titles.length });
  }
  const neg = [];
  for (const [text, cat] of negatives) {
    const w = await call('POST', '/wanted', { text, category: cat }, priya);
    const m = await call('GET', `/wanted/${w.data.id}/matches`, null, priya);
    neg.push({ text, count: m.data.length });
  }
  const top1 = acc.filter((a) => a.rank === 1).length, top3 = acc.filter((a) => a.rank >= 1 && a.rank <= 3).length;
  const mrr = acc.reduce((s, a) => s + (a.rank ? 1 / a.rank : 0), 0) / acc.length;
  const matching = { total: acc.length, top1, top3, mrr: Math.round(mrr * 100) / 100, cases: acc, negatives: neg, negCorrect: neg.filter((x) => x.count === 0).length };

  // ---- Performance ----
  async function bench(label, fn, N = 200) {
    const t = []; for (let i = 0; i < N; i++) t.push((await fn()).ms);
    t.sort((a, b) => a - b);
    return { label, n: N, mean: Math.round((t.reduce((a, b) => a + b, 0) / N) * 10) / 10, p95: Math.round(t[Math.floor(N * 0.95)] * 10) / 10, max: Math.round(t[N - 1] * 10) / 10 };
  }
  const perf = [];
  perf.push(await bench('GET /api/items (21 items)', () => call('GET', '/items')));
  perf.push(await bench('GET /api/items?q=drill (search)', () => call('GET', '/items?q=drill')));
  perf.push(await bench('GET /api/items?sort=distance (logged in)', () => call('GET', '/items?sort=distance', null, priya)));
  const w0 = (await call('POST', '/wanted', { text: 'Need a speaker or projector for a movie night', category: 'Electronics' }, priya)).data.id;
  perf.push(await bench('GET /api/wanted/:id/matches (21 items)', () => call('GET', `/wanted/${w0}/matches`, null, priya)));
  // scale test: 2,000 extra synthetic items
  const ins = db.prepare('INSERT INTO items (owner_id, title, description, category, condition, max_days, neighbourhood_id) VALUES (?,?,?,?,?,?,?)');
  const cats = ['Tools', 'Kitchen', 'Electronics', 'Outdoors', 'Garden', 'Books & Games', 'Party & Events', 'Other'];
  db.exec('BEGIN'); for (let i = 0; i < 2000; i++) ins.run(2 + (i % 7), `Sample item ${i} widget gadget`, 'Synthetic listing used for the scale test', cats[i % 8], 'Good', 3, 1 + (i % 8)); db.exec('COMMIT');
  perf.push(await bench('GET /api/wanted/:id/matches (2,021 items)', () => call('GET', `/wanted/${w0}/matches`, null, priya), 100));
  perf.push(await bench('GET /api/items?q=widget (2,021 items)', () => call('GET', '/items?q=widget'), 50));

  server.close();
  const passed = results.filter((x) => x.pass).length;
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify({ tests: results, passed, total: results.length, matching, perf, node: process.version }, null, 1));
  console.log(`API tests: ${passed}/${results.length} passed`);
  results.filter((x) => !x.pass).forEach((x) => console.log('FAIL', x.id, x.desc, '->', x.actual));
  console.log(`Matching: top-1 ${top1}/${acc.length}, top-3 ${top3}/${acc.length}, MRR ${matching.mrr}, negatives ok ${matching.negCorrect}/${neg.length}`);
  acc.filter((a) => a.rank !== 1).forEach((a) => console.log('  miss:', a.text, '| expected', a.expected, '| rank', a.rank, '| top', a.top));
  perf.forEach((p) => console.log(`  ${p.label}: mean ${p.mean} ms, p95 ${p.p95} ms`));
  process.exit(0);
})();
