// Demo data: neighbourhoods (approximate demo coordinates), members, items, requests and wanted posts
const crypto = require('crypto');
const { openDb } = require('./db');

function seed(db) {
  const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
  const ins = (sql, ...p) => Number(db.prepare(sql).run(...p).lastInsertRowid);

  const nbs = [['Deorali', 27.3405, 88.6035], ['Tadong', 27.3160, 88.6055], ['MG Marg', 27.3389, 88.6122], ['Development Area', 27.3300, 88.6200],
    ['Sichey', 27.3350, 88.5950], ['Arithang', 27.3290, 88.6110], ['Ranipool', 27.2950, 88.5800], ['Majitar', 27.2420, 88.5340]];
  const nb = {};
  nbs.forEach(([n, la, ln]) => { nb[n] = ins('INSERT INTO neighbourhoods (name, lat, lng) VALUES (?,?,?)', n, la, ln); });

  const users = [['Priya Rai', 'demo@localloop.test', 'Deorali'], ['Tenzing Bhutia', 'tenzing@localloop.test', 'Tadong'], ['Anjali Chettri', 'anjali@localloop.test', 'MG Marg'],
    ['Rohan Sharma', 'rohan@localloop.test', 'Development Area'], ['Dolma Lepcha', 'dolma@localloop.test', 'Sichey'], ['Kiran Thapa', 'kiran@localloop.test', 'Arithang'],
    ['Mingma Sherpa', 'mingma@localloop.test', 'Ranipool'], ['Sonam Pradhan', 'sonam@localloop.test', 'Majitar']];
  const u = {};
  users.forEach(([name, email, n]) => {
    const salt = crypto.randomBytes(16).toString('hex');
    u[name.split(' ')[0]] = ins('INSERT INTO users (name, email, password_hash, salt, neighbourhood_id) VALUES (?,?,?,?,?)', name, email, hash('demo1234', salt), salt, nb[n]);
  });

  const items = [
    ['Tenzing', 'Tadong', 'Cordless power drill with bit set', 'Tools', 'Good', 3, '18V cordless drill with 20 drill bits and a charger. Great for hanging shelves or putting up curtain rods.'],
    ['Rohan', 'Development Area', 'Aluminium step ladder (6 ft)', 'Tools', 'Good', 2, 'Lightweight foldable ladder, reaches ceiling fans and water tanks. Please return clean.'],
    ['Tenzing', 'Tadong', 'Hand saw and hammer set', 'Tools', 'Fair', 3, 'Basic carpentry set: hand saw, claw hammer, measuring tape and a spirit level.'],
    ['Anjali', 'MG Marg', 'Pressure cooker 7 litre', 'Kitchen', 'Good', 2, 'Stainless steel pressure cooker, ideal for cooking for a big family gathering.'],
    ['Kiran', 'Arithang', 'Air fryer (4 litre)', 'Kitchen', 'Good', 3, 'Digital air fryer with a basket and recipe booklet.'],
    ['Anjali', 'MG Marg', 'Large stock pot for parties', 'Kitchen', 'Good', 2, '20 litre stock pot with lid. Perfect for momos, biryani or soup for many guests.'],
    ['Dolma', 'Sichey', 'Portable projector with HDMI cable', 'Electronics', 'Good', 2, 'Full HD projector, 100 inch screen size. Great for movie nights. HDMI cable included.'],
    ['Rohan', 'Development Area', 'DSLR camera with 50mm lens', 'Electronics', 'Good', 3, 'Entry-level DSLR with a 50mm prime lens, two batteries and a camera bag.'],
    ['Kiran', 'Arithang', 'Bluetooth party speaker', 'Electronics', 'Good', 2, 'Loud portable speaker with 12 hours of battery. Charging cable included.'],
    ['Mingma', 'Ranipool', '4-person camping tent', 'Outdoors', 'Good', 5, 'Waterproof dome tent, easy to pitch, comes with pegs and a carry bag.'],
    ['Mingma', 'Ranipool', 'Trekking backpack 60L', 'Outdoors', 'Good', 7, 'Comfortable 60 litre trekking backpack with rain cover.'],
    ['Sonam', 'Majitar', 'Sleeping bag (-5°C)', 'Outdoors', 'Fair', 5, 'Warm sleeping bag suitable for cold mountain nights.'],
    ['Dolma', 'Sichey', 'Garden shovel and pruning shears', 'Garden', 'Good', 3, 'Small garden tools set for planting and trimming.'],
    ['Sonam', 'Majitar', 'Electric lawn mower', 'Garden', 'Fair', 2, 'Corded electric mower with grass box. Needs an extension cable.'],
    ['Anjali', 'MG Marg', 'Board game set: Catan', 'Books & Games', 'Good', 5, 'Complete Catan base game with all pieces, perfect for game nights.'],
    ['Tenzing', 'Tadong', 'Wooden chess set', 'Books & Games', 'Good', 7, 'Full-size wooden chess board with weighted pieces.'],
    ['Rohan', 'Development Area', 'Folding tables (set of 4)', 'Party & Events', 'Good', 2, 'Four sturdy folding tables for birthdays, puja or community events.'],
    ['Kiran', 'Arithang', 'String lights 20m', 'Party & Events', 'Good', 4, 'Warm white fairy lights, 20 metres, indoor and outdoor use.'],
  ];
  const itemId = {};
  items.forEach(([own, n, title, cat, cond, days, desc]) => { itemId[title] = ins('INSERT INTO items (owner_id, title, description, category, condition, max_days, neighbourhood_id) VALUES (?,?,?,?,?,?,?)', u[own], title, desc, cat, cond, days, nb[n]); });

  const d = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  // Priya (demo user) owns nothing yet, so give her a couple of listings and some request history
  const own = [
    ['Rangoli and puja decoration kit', 'Party & Events', 'Good', 3, 'Complete set of rangoli stencils, colours and diyas for festivals.'],
    ['Foldable camping chairs (2)', 'Outdoors', 'Good', 4, 'Two lightweight foldable chairs with carry bags.'],
  ];
  own.forEach(([title, cat, cond, days, desc]) => { itemId[title] = ins('INSERT INTO items (owner_id, title, description, category, condition, max_days, neighbourhood_id) VALUES (?,?,?,?,?,?,?)', u.Priya, title, desc, cat, cond, days, nb.Deorali); });

  const rq = (item, who, s, e, msg, st) => ins('INSERT INTO requests (item_id, borrower_id, start_date, end_date, message, status) VALUES (?,?,?,?,?,?)', itemId[item], u[who], s, e, msg, st);
  rq('Portable projector with HDMI cable', 'Priya', d(-6), d(-5), 'For a family movie night. Will return it cleaned.', 'returned');
  rq('Cordless power drill with bit set', 'Priya', d(-3), d(-1), 'Need to hang two shelves.', 'returned');
  rq('Bluetooth party speaker', 'Priya', d(2), d(3), 'Birthday get-together on Saturday.', 'pending');
  rq('Rangoli and puja decoration kit', 'Tenzing', d(1), d(2), 'For our society Diwali event.', 'pending');
  rq('Foldable camping chairs (2)', 'Rohan', d(3), d(5), 'Weekend picnic at Rumtek.', 'pending');
  db.prepare(`UPDATE items SET status = 'lent' WHERE id = ?`).run(itemId['Foldable camping chairs (2)']);
  rq('Foldable camping chairs (2)', 'Dolma', d(-1), d(1), 'Camping near Tsomgo lake.', 'accepted');
  rq('Hand saw and hammer set', 'Anjali', d(-8), d(-6), 'Fixing a wooden shelf.', 'returned');
  rq('Large stock pot for parties', 'Kiran', d(-10), d(-9), 'Housewarming party.', 'returned');

  const w = (who, text, cat) => ins('INSERT INTO wanted (user_id, text, category, neighbourhood_id) VALUES (?,?,?,?)', u[who], text, cat, nb[users.find((x) => x[0].startsWith(who))[2]]);
  w('Priya', 'Need a ladder to clean the water tank this weekend', 'Tools');
  w('Priya', 'Need a speaker or projector for a movie night with friends', 'Electronics');
  w('Priya', 'Want a camera for a photo shoot', null);
  w('Anjali', 'Need a drill to fix curtain rods', 'Tools');
  w('Rohan', 'Looking for a Bluetooth speaker for a farewell party', 'Electronics');
  w('Sonam', 'Need folding tables for a community lunch', 'Party & Events');
}

module.exports = { seed };

if (require.main === module) {
  const file = process.env.DB_FILE || require('path').join(__dirname, 'localloop.db');
  require('fs').rmSync(file, { force: true });
  const db = openDb(file);
  seed(db);
  console.log('Seeded', file);
}
