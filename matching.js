// Smart matching engine: scores how well an available item satisfies a "wanted" post.
// score = 100 * ( W_TEXT * S_text + W_CAT * S_cat + W_DIST * S_dist )

const WEIGHTS = { text: 0.55, cat: 0.15, dist: 0.30 };
const DIST_SCALE_KM = 3;      // S_dist = exp(-d / 3)
const MIN_SCORE = 25;         // matches below this are hidden
const TEXT_K = 1.2;           // S_text = 1 - exp(-K * m), m = weighted keyword hits

const STOP = new Set(('a an the i me my we our you your need needs want wants looking look for to of in on at with and or ' +
  'some any borrow borrowing lend please can could would get use using this that it is be have has just ' +
  'today tomorrow weekend week day days night trip party event home house small big good new old one two three').split(' '));

// Groups of words that mean (almost) the same thing for borrowing purposes
const SYNONYM_GROUPS = [
  ['ladder', 'stepladder', 'step'],
  ['drill', 'driver', 'cordless', 'power'],
  ['projector', 'beamer', 'hdmi', 'movie'],
  ['tent', 'camping', 'camp'],
  ['trek', 'trekking', 'hike', 'hiking'],
  ['camera', 'dslr', 'lens', 'photo', 'photography'],
  ['speaker', 'bluetooth', 'sound', 'music'],
  ['cooker', 'pressure', 'pot', 'stock'],
  ['saw', 'hammer', 'tool', 'toolbox'],
  ['shovel', 'pruning', 'shears', 'garden', 'spade'],
  ['table', 'tables', 'folding'],
  ['lights', 'light', 'string', 'fairy', 'decoration'],
  ['backpack', 'rucksack', 'bag'],
  ['sleeping', 'sleep'],
  ['chess', 'board', 'game', 'catan'],
  ['fryer', 'airfryer', 'air'],
  ['mower', 'lawn', 'grass'],
];

function stem(w) {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function tokenize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(Boolean).filter((w) => !STOP.has(w)).map(stem);
}

const GROUP_OF = new Map();
SYNONYM_GROUPS.forEach((g, i) => g.map(stem).forEach((w) => GROUP_OF.set(w, i)));

function sameConcept(a, b) {
  if (a === b) return true;
  const ga = GROUP_OF.get(a), gb = GROUP_OF.get(b);
  return ga !== undefined && ga === gb;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// wanted: { text, category|null }, item: { title, description, category }, distKm: number
function scoreMatch(wanted, item, distKm) {
  const wTokens = [...new Set(tokenize(wanted.text))];
  const titleT = tokenize(item.title), descT = tokenize(item.description);
  let textSum = 0;
  for (const w of wTokens) {
    if (titleT.some((t) => sameConcept(w, t))) textSum += 1;
    else if (descT.some((t) => sameConcept(w, t))) textSum += 0.5;
  }
  const sText = 1 - Math.exp(-TEXT_K * textSum);   // saturating: one clear hit already counts, long requests are not penalised
  const hasCat = !!wanted.category;
  const sCat = hasCat && wanted.category === item.category ? 1 : 0;
  const sDist = Math.exp(-distKm / DIST_SCALE_KM);
  let total;
  if (hasCat) total = WEIGHTS.text * sText + WEIGHTS.cat * sCat + WEIGHTS.dist * sDist;
  else total = (WEIGHTS.text / (WEIGHTS.text + WEIGHTS.dist)) * sText + (WEIGHTS.dist / (WEIGHTS.text + WEIGHTS.dist)) * sDist;
  // an item that shares no keyword at all is never a real match, however close it is
  if (textSum === 0) total = Math.min(total, 0.2);
  return { score: Math.round(total * 100), text: Math.round(sText * 100), categoryMatch: sCat === 1, distanceKm: Math.round(distKm * 10) / 10 };
}

module.exports = { scoreMatch, tokenize, haversineKm, WEIGHTS, MIN_SCORE, DIST_SCALE_KM, TEXT_K };
