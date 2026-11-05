/* LocalLoop front-end: a small hash-routed single-page app (no framework) */
const $app = document.getElementById('app');
const CAT = {
  'Tools': ['🔧', '#fde7d3'], 'Kitchen': ['🍳', '#fff0c9'], 'Electronics': ['📽️', '#dbe9fb'], 'Outdoors': ['⛺', '#d9f1e1'],
  'Garden': ['🌱', '#e3f3cf'], 'Books & Games': ['♟️', '#eadcf8'], 'Party & Events': ['🎉', '#fcd9e6'], 'Other': ['📦', '#e8ecea'],
};
const state = { token: localStorage.getItem('ll_token'), user: null, nbs: [], cats: Object.keys(CAT), filters: { q: '', category: '', max_km: '', sort: 'newest' }, tab: 'listings' };

// ---------- helpers ----------
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.setAttribute('style', v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'Something went wrong.'); e.status = res.status; throw e; }
  return data;
}
function toast(msg, err) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = 'toast'), 2600);
}
const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const dist = (km) => (km == null ? '' : km < 0.05 ? 'same area' : km + ' km away');
function statusBadge(s) { return h('span', { class: 'badge ' + (s === 'available' ? 'ok' : s) }, s === 'available' ? 'Available' : s === 'lent' ? 'Lent out' : s[0].toUpperCase() + s.slice(1)); }
const mount = (...nodes) => { $app.replaceChildren(...nodes.flat()); window.scrollTo(0, 0); };

// ---------- navigation ----------
function renderNav() {
  const route = location.hash || '#/';
  const link = (href, text) => h('a', { href, class: route === href ? 'active' : '' }, text);
  const links = document.getElementById('links');
  links.replaceChildren(
    link('#/', 'Browse'), link('#/wanted', 'Wanted board'), link('#/post', 'Share an item'),
    ...(state.user
      ? [link('#/dashboard', 'Dashboard'), h('span', { class: 'user' }, '👤 ' + state.user.name), h('button', { class: 'btn sec small', onclick: logout }, 'Log out')]
      : [link('#/login', 'Log in'), h('a', { class: 'btn small', href: '#/register' }, 'Join free')])
  );
  links.classList.remove('open');
}
document.getElementById('burger').addEventListener('click', () => document.getElementById('links').classList.toggle('open'));
async function logout() { try { await api('/logout', { method: 'POST' }); } catch (e) {} localStorage.removeItem('ll_token'); state.token = null; state.user = null; toast('You have been logged out.'); location.hash = '#/'; route(); }

function needLogin() {
  mount(h('div', { class: 'panel narrow empty' }, h('h2', {}, 'Please log in'), h('p', {}, 'You need an account to do this.'), h('a', { class: 'btn', href: '#/login' }, 'Log in'), ' ', h('a', { class: 'btn sec', href: '#/register' }, 'Create account')));
}

// ---------- pages ----------
async function pageHome() {
  const stats = await api('/stats');
  const f = state.filters;
  const q = h('input', { placeholder: 'Search for a drill, tent, projector…', value: f.q, id: 'q' });
  const cat = h('select', { id: 'cat' }, h('option', { value: '' }, 'All categories'), state.cats.map((c) => h('option', { value: c, selected: f.category === c }, CAT[c][0] + ' ' + c)));
  const km = h('select', { id: 'km', disabled: !state.user }, [['', state.user ? 'Any distance' : 'Log in for distance'], ['1', 'Within 1 km'], ['3', 'Within 3 km'], ['5', 'Within 5 km'], ['10', 'Within 10 km']].map(([v, t]) => h('option', { value: v, selected: f.max_km === v }, t)));
  const sort = h('select', { id: 'sort' }, [['newest', 'Newest first'], ['distance', 'Nearest first']].map(([v, t]) => h('option', { value: v, selected: f.sort === v, disabled: v === 'distance' && !state.user }, t)));
  const results = h('div');
  const load = async () => {
    f.q = q.value; f.category = cat.value; f.max_km = km.value; f.sort = sort.value;
    const params = new URLSearchParams(); Object.entries(f).forEach(([k, v]) => v && params.set(k, v));
    const items = await api('/items?' + params);
    results.replaceChildren(
      h('div', { class: 'count' }, items.length + (items.length === 1 ? ' item' : ' items') + ' found'),
      items.length ? h('div', { class: 'grid' }, items.map(card)) : h('div', { class: 'empty panel' }, 'No items match your search. Try another word or post what you need on the Wanted board.')
    );
  };
  let timer; q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
  [cat, km, sort].forEach((s) => s.addEventListener('change', load));
  mount(
    h('section', { class: 'hero' },
      h('div', {}, h('h1', {}, 'Borrow it. Share it. Loop it back.'), h('p', {}, 'Why buy a drill you will use once? Borrow tools, gadgets and gear from neighbours who live a few minutes away – and lend yours when they sit idle.')),
      h('div', { class: 'stats' }, [[stats.items, 'items shared'], [stats.members, 'neighbours'], [stats.loans, 'loans made'], [stats.neighbourhoods, 'areas']].map(([n, t]) => h('div', { class: 'stat' }, h('b', {}, n), h('span', {}, t))))),
    h('div', { class: 'filters' }, q, cat, km, sort),
    results
  );
  await load();
}
function card(it) {
  const [icon, bg] = CAT[it.category] || CAT.Other;
  return h('a', { class: 'card', href: '#/item/' + it.id },
    h('div', { class: 'band', style: 'background:' + bg }, icon, h('span', { class: 'badge ' + (it.status === 'available' ? 'ok' : 'lent') }, it.status === 'available' ? 'Available' : 'Lent out')),
    h('div', { class: 'body' }, h('h3', {}, it.title),
      h('div', {}, h('span', { class: 'chip' }, it.category), h('span', { class: 'chip' }, it.condition)),
      h('div', { class: 'meta' }, '📍 ' + it.neighbourhood + (it.distance_km != null ? ' · ' + dist(it.distance_km) : '')),
      h('div', { class: 'meta' }, 'Shared by ' + it.owner_name + ' · up to ' + it.max_days + ' days')));
}

async function pageItem(id) {
  let it;
  try { it = await api('/items/' + id); } catch (e) { return mount(h('div', { class: 'panel empty' }, h('h2', {}, 'Item not found'), h('a', { class: 'btn', href: '#/' }, 'Back to browse'))); }
  const [icon, bg] = CAT[it.category] || CAT.Other;
  const mine = state.user && state.user.id === it.owner_id;
  const err = h('div', { class: 'error' });
  const start = h('input', { type: 'date', id: 'start', min: today(), value: plusDays(1) });
  const end = h('input', { type: 'date', id: 'end', min: today(), value: plusDays(Math.min(2, it.max_days)) });
  const msg = h('textarea', { id: 'msg', placeholder: 'Say hello and tell the owner what you need it for…' });
  const submit = async (e) => {
    e.preventDefault(); err.textContent = '';
    try { await api(`/items/${it.id}/requests`, { method: 'POST', body: { start_date: start.value, end_date: end.value, message: msg.value } }); toast('Request sent to ' + it.owner_name + '!'); location.hash = '#/dashboard'; state.tab = 'mine'; }
    catch (ex) { err.textContent = ex.message; }
  };
  let side;
  if (mine) side = h('div', { class: 'panel' }, h('h2', {}, 'This is your listing'), h('p', { class: 'sub' }, 'Manage requests from your dashboard.'), h('a', { class: 'btn', href: '#/dashboard' }, 'Open dashboard'));
  else if (it.status !== 'available') side = h('div', { class: 'panel' }, h('h2', {}, 'Currently lent out'), h('p', { class: 'sub' }, 'Check back soon or post it on the Wanted board.'), h('a', { class: 'btn sec', href: '#/wanted' }, 'Go to Wanted board'));
  else if (!state.user) side = h('div', { class: 'panel' }, h('h2', {}, 'Want to borrow this?'), h('p', { class: 'sub' }, 'Log in to send a request.'), h('a', { class: 'btn', href: '#/login' }, 'Log in'));
  else side = h('form', { class: 'panel form', onsubmit: submit }, h('h2', {}, 'Request to borrow'), h('p', { class: 'sub' }, 'Up to ' + it.max_days + ' day(s). The owner will accept or decline.'),
    h('div', { class: 'row' }, h('div', {}, h('label', { for: 'start' }, 'From'), start), h('div', {}, h('label', { for: 'end' }, 'Until'), end)),
    h('label', { for: 'msg' }, 'Message'), msg, err, h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'submit' }, 'Send request')));
  mount(h('p', {}, h('a', { href: '#/' }, '← Back to browse')),
    h('div', { class: 'detail' },
      h('div', { class: 'panel' }, h('div', { class: 'big', style: 'background:' + bg }, icon), h('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, h('h2', { style: 'margin:0;font-size:1.5rem' }, it.title), statusBadge(it.status)),
        h('p', {}, it.description || 'No description provided.'),
        h('dl', { class: 'facts' }, h('dt', {}, 'Category'), h('dd', {}, it.category), h('dt', {}, 'Condition'), h('dd', {}, it.condition), h('dt', {}, 'Max lending period'), h('dd', {}, it.max_days + ' day(s)'),
          h('dt', {}, 'Shared by'), h('dd', {}, it.owner_name), h('dt', {}, 'Neighbourhood'), h('dd', {}, it.neighbourhood + (it.distance_km != null ? ' (' + dist(it.distance_km) + ')' : '')))),
      side));
}

function pageLogin() {
  const err = h('div', { class: 'error' });
  const email = h('input', { type: 'email', id: 'email', required: true, placeholder: 'you@example.com' });
  const pw = h('input', { type: 'password', id: 'pw', required: true, placeholder: 'Your password' });
  mount(h('form', { class: 'panel form narrow', onsubmit: async (e) => { e.preventDefault(); err.textContent = ''; try { await auth('/login', { email: email.value, password: pw.value }); } catch (ex) { err.textContent = ex.message; } } },
    h('h2', {}, 'Welcome back'), h('p', { class: 'sub' }, 'Log in to borrow, lend and manage your requests.'),
    h('label', { for: 'email' }, 'Email'), email, h('label', { for: 'pw' }, 'Password'), pw, err,
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'submit' }, 'Log in'), h('a', { href: '#/register' }, 'New here? Create an account')),
    h('div', { class: 'hint' }, 'Demo account: ', h('b', {}, 'demo@localloop.test'), ' / ', h('b', {}, 'demo1234'))));
}
function pageRegister() {
  const err = h('div', { class: 'error' });
  const name = h('input', { id: 'name', required: true, placeholder: 'Your full name' });
  const email = h('input', { type: 'email', id: 'email', required: true, placeholder: 'you@example.com' });
  const pw = h('input', { type: 'password', id: 'pw', required: true, placeholder: 'At least 6 characters' });
  const nb = h('select', { id: 'nb' }, state.nbs.map((n) => h('option', { value: n.id }, n.name)));
  mount(h('form', { class: 'panel form narrow', onsubmit: async (e) => { e.preventDefault(); err.textContent = ''; try { await auth('/register', { name: name.value, email: email.value, password: pw.value, neighbourhood_id: Number(nb.value) }); } catch (ex) { err.textContent = ex.message; } } },
    h('h2', {}, 'Join your neighbourhood loop'), h('p', { class: 'sub' }, 'Free to join. Your area is used to show how far each item is.'),
    h('label', { for: 'name' }, 'Full name'), name, h('label', { for: 'email' }, 'Email'), email, h('label', { for: 'pw' }, 'Password'), pw,
    h('label', { for: 'nb' }, 'Your neighbourhood'), nb, err,
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'submit' }, 'Create account'), h('a', { href: '#/login' }, 'Already a member? Log in'))));
}
async function auth(path, body) {
  const r = await api(path, { method: 'POST', body });
  state.token = r.token; state.user = r.user; localStorage.setItem('ll_token', r.token);
  toast('Welcome, ' + r.user.name.split(' ')[0] + '!'); location.hash = '#/'; route();
}

function pagePost() {
  if (!state.user) return needLogin();
  const err = h('div', { class: 'error' });
  const f = { title: h('input', { id: 'title', required: true, placeholder: 'e.g. Cordless drill with bit set' }),
    cat: h('select', { id: 'category' }, state.cats.map((c) => h('option', { value: c }, CAT[c][0] + ' ' + c))),
    cond: h('select', { id: 'condition' }, ['New', 'Good', 'Fair'].map((c) => h('option', { value: c, selected: c === 'Good' }, c))),
    days: h('input', { id: 'days', type: 'number', min: 1, max: 30, value: 3 }),
    desc: h('textarea', { id: 'desc', placeholder: 'Describe the item, what is included and any rules (clean it, charge it…)' }) };
  const home = state.nbs.find((n) => n.id === state.user.neighbourhood_id);
  mount(h('form', { class: 'panel form narrow', onsubmit: async (e) => { e.preventDefault(); err.textContent = '';
      try { const r = await api('/items', { method: 'POST', body: { title: f.title.value, category: f.cat.value, condition: f.cond.value, max_days: Number(f.days.value), description: f.desc.value } }); toast('Your item is now on LocalLoop!'); location.hash = '#/item/' + r.id; }
      catch (ex) { err.textContent = ex.message; } } },
    h('h2', {}, 'Share an item'), h('p', { class: 'sub' }, 'Something sitting idle at home? Let a neighbour use it. It will appear under ' + (home ? home.name : 'your area') + '.'),
    h('label', { for: 'title' }, 'Item name'), f.title,
    h('div', { class: 'row' }, h('div', {}, h('label', { for: 'category' }, 'Category'), f.cat), h('div', {}, h('label', { for: 'condition' }, 'Condition'), f.cond)),
    h('label', { for: 'days' }, 'Maximum lending period (days)'), f.days,
    h('label', { for: 'desc' }, 'Description'), f.desc, err,
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'submit' }, 'Publish item'), h('a', { href: '#/' }, 'Cancel'))));
}

async function pageWanted() {
  const board = await api('/wanted');
  const text = h('input', { id: 'wtext', required: true, placeholder: 'e.g. Need a ladder to clean the water tank this weekend' });
  const wcat = h('select', { id: 'wcat' }, h('option', { value: 'Any' }, 'Any category'), state.cats.map((c) => h('option', { value: c }, CAT[c][0] + ' ' + c)));
  const err = h('div', { class: 'error' });
  const form = state.user
    ? h('form', { class: 'panel form', onsubmit: async (e) => { e.preventDefault(); err.textContent = ''; try { await api('/wanted', { method: 'POST', body: { text: text.value, category: wcat.value } }); toast('Posted! Checking for matches…'); pageWanted(); } catch (ex) { err.textContent = ex.message; } } },
      h('h2', {}, 'What do you need?'), h('p', { class: 'sub' }, 'Describe it in your own words. LocalLoop finds the best nearby matches automatically.'),
      h('label', { for: 'wtext' }, 'I need…'), text, h('label', { for: 'wcat' }, 'Category'), wcat, err, h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'submit' }, 'Find matches')))
    : h('div', { class: 'panel' }, h('h2', {}, 'What do you need?'), h('p', { class: 'sub' }, 'Log in to post a request and get smart matches.'), h('a', { class: 'btn', href: '#/login' }, 'Log in'));
  const mine = board.filter((w) => w.mine);
  const matchPanels = await Promise.all(mine.map(async (w) => {
    const ms = await api(`/wanted/${w.id}/matches`);
    const col = (s) => (s >= 70 ? '#1f8a5b' : s >= 45 ? '#d9892b' : '#8a9a93');
    return h('div', { class: 'panel' },
      h('div', { style: 'display:flex;justify-content:space-between;gap:12px;align-items:start' },
        h('div', { style: 'flex:1' }, h('h2', {}, '“' + w.text + '”'), h('p', { class: 'sub' }, (w.category || 'Any category') + ' · ' + w.neighbourhood)),
        h('button', { class: 'btn sec small', style: 'flex:none;white-space:nowrap', onclick: async () => { await api('/wanted/' + w.id, { method: 'PATCH' }); toast('Marked as fulfilled.'); pageWanted(); } }, 'Mark fulfilled')),
      ms.length ? ms.map((m) => h('div', { class: 'match' },
        h('div', { class: 'score', style: 'background:' + col(m.score) }, m.score + '%'),
        h('div', { style: 'flex:1' }, h('a', { href: '#/item/' + m.id, style: 'font-weight:700' }, m.title),
          h('div', { class: 'meta' }, m.neighbourhood + ' · ' + dist(m.distanceKm) + ' · ' + m.owner_name),
          h('div', { style: 'margin-top:4px' }, h('span', { class: 'chip' }, 'Keywords ' + m.text + '%'), m.categoryMatch ? h('span', { class: 'chip' }, 'Category match') : null, h('span', { class: 'chip' }, dist(m.distanceKm))),
          h('div', { class: 'bar' }, h('i', { style: `width:${m.score}%;background:${col(m.score)}` }))),
        h('a', { class: 'btn small', href: '#/item/' + m.id }, 'View'))) : h('div', { class: 'empty' }, 'No close matches yet. We will show new ones as neighbours share items.'));
  }));
  const others = board.filter((w) => !w.mine);
  mount(h('h1', { style: 'margin:0 0 4px' }, 'Wanted board'), h('p', { class: 'meta', style: 'margin:0 0 18px' }, 'Tell neighbours what you are looking for. Smart matching ranks available items by keywords, category and distance.'),
    h('div', { class: 'cols' }, h('div', {}, form, ...matchPanels),
      h('div', { class: 'panel' }, h('h2', {}, 'Community requests'), h('p', { class: 'sub' }, 'Have one of these lying around? Share it from the “Share an item” page.'),
        others.length ? others.map((w) => h('div', { class: 'match' }, h('div', { style: 'flex:1' }, h('b', {}, w.text), h('div', { class: 'meta' }, w.user_name + ' · ' + w.neighbourhood + (w.category ? ' · ' + w.category : '')))) ) : h('div', { class: 'empty' }, 'No open requests from neighbours.'))));
}

async function pageDashboard() {
  if (!state.user) return needLogin();
  const [items, mineReq, incoming] = await Promise.all([api('/items-mine'), api('/requests/mine'), api('/requests/incoming')]);
  const pendingIn = incoming.filter((r) => r.status === 'pending').length;
  const act = async (id, action, okMsg) => { try { await api('/requests/' + id, { method: 'PATCH', body: { action } }); toast(okMsg); pageDashboard(); } catch (ex) { toast(ex.message, true); } };
  const tabs = [['listings', 'My listings (' + items.length + ')'], ['mine', 'Requests I made (' + mineReq.length + ')'], ['incoming', 'Requests received' + (pendingIn ? ' (' + pendingIn + ' new)' : ' (' + incoming.length + ')')]];
  let body;
  if (state.tab === 'listings') body = items.length ? items.map((it) => h('div', { class: 'row-card' }, h('div', { class: 'l' }, h('h4', {}, it.title), h('div', { class: 'meta' }, it.category + ' · ' + it.condition + ' · up to ' + it.max_days + ' days')), statusBadge(it.status),
      h('div', { class: 'acts' }, h('a', { class: 'btn sec small', href: '#/item/' + it.id }, 'View'), h('button', { class: 'btn danger small', onclick: async () => { try { await api('/items/' + it.id, { method: 'DELETE' }); toast('Item removed.'); pageDashboard(); } catch (ex) { toast(ex.message, true); } } }, 'Remove')))) : [h('div', { class: 'empty panel' }, 'You have not shared anything yet. ', h('a', { href: '#/post' }, 'Share your first item'))];
  else if (state.tab === 'mine') body = mineReq.length ? mineReq.map((r) => h('div', { class: 'row-card' }, h('div', { class: 'l' }, h('h4', {}, r.item_title), h('div', { class: 'meta' }, fmtDate(r.start_date) + ' → ' + fmtDate(r.end_date) + ' · from ' + r.owner_name), r.message ? h('div', { class: 'meta' }, '“' + r.message + '”') : null), statusBadge(r.status),
      r.status === 'pending' ? h('div', { class: 'acts' }, h('button', { class: 'btn danger small', onclick: () => act(r.id, 'cancel', 'Request cancelled.') }, 'Cancel request')) : null)) : [h('div', { class: 'empty panel' }, 'You have not requested anything yet. ', h('a', { href: '#/' }, 'Browse items'))];
  else body = incoming.length ? incoming.map((r) => h('div', { class: 'row-card' }, h('div', { class: 'l' }, h('h4', {}, r.borrower_name + ' wants ' + r.item_title), h('div', { class: 'meta' }, fmtDate(r.start_date) + ' → ' + fmtDate(r.end_date)), r.message ? h('div', { class: 'meta' }, '“' + r.message + '”') : null), statusBadge(r.status),
      h('div', { class: 'acts' },
        r.status === 'pending' ? [h('button', { class: 'btn small', onclick: () => act(r.id, 'accept', 'Request accepted.') }, 'Accept'), h('button', { class: 'btn danger small', onclick: () => act(r.id, 'decline', 'Request declined.') }, 'Decline')] : null,
        r.status === 'accepted' ? h('button', { class: 'btn sec small', onclick: () => act(r.id, 'returned', 'Marked as returned. The item is available again.') }, 'Mark as returned') : null))) : [h('div', { class: 'empty panel' }, 'No one has requested your items yet.')];
  mount(h('h1', { style: 'margin:0 0 14px' }, 'Hi ' + state.user.name.split(' ')[0] + ' 👋'),
    h('div', { class: 'tabs' }, tabs.map(([k, t]) => h('button', { class: state.tab === k ? 'on' : '', onclick: () => { state.tab = k; pageDashboard(); } }, t))), body);
}

// ---------- router ----------
async function route() {
  renderNav();
  const hash = location.hash || '#/';
  try {
    if (hash === '#/' || hash === '') await pageHome();
    else if (hash.startsWith('#/item/')) await pageItem(hash.split('/')[2]);
    else if (hash === '#/login') pageLogin();
    else if (hash === '#/register') pageRegister();
    else if (hash === '#/post') pagePost();
    else if (hash === '#/wanted') await pageWanted();
    else if (hash === '#/dashboard') await pageDashboard();
    else mount(h('div', { class: 'panel empty' }, h('h2', {}, 'Page not found'), h('a', { class: 'btn', href: '#/' }, 'Go home')));
  } catch (ex) {
    if (ex.status === 401) { state.user = null; state.token = null; localStorage.removeItem('ll_token'); renderNav(); needLogin(); }
    else mount(h('div', { class: 'panel empty' }, h('h2', {}, 'Something went wrong'), h('p', {}, ex.message)));
  }
}
window.addEventListener('hashchange', route);
(async function init() {
  state.nbs = await api('/neighbourhoods');
  if (state.token) { try { state.user = await api('/me'); } catch (e) { state.token = null; localStorage.removeItem('ll_token'); } }
  route();
})();
