// Production entry: seed demo data on first start, then run the server
const fs = require('fs'), path = require('path');
const file = process.env.DB_FILE || path.join(__dirname, 'localloop.db');
const { openDb } = require('./db');
const { createApp } = require('./server');
const fresh = !fs.existsSync(file);
const db = openDb(file);
if (fresh) { require('./seed').seed(db); console.log('Seeded demo data into', file); }
const port = Number(process.env.PORT || 3000);
createApp(db).listen(port, '0.0.0.0', () => console.log(`LocalLoop running on port ${port}`));
