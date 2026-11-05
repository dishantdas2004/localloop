# LocalLoop – neighbourhood item-sharing platform with smart matching

Share items with neighbours, search by keyword/category/distance, post what you need on the Wanted board and get ranked matches.

## Requirements
Node.js 22.5 or newer (uses the built-in `node:sqlite`; developed on v22.23.4).

## Run
    npm install
    node --no-warnings seed.js      # creates localloop.db with demo data
    node --no-warnings server.js    # http://localhost:3000

Demo login: demo@localloop.test / demo1234 (all seeded users use password demo1234).
Demo coordinates for the Gangtok-area neighbourhoods are approximate.

## Tests
    node --no-warnings test/run_tests.js   # 34 API tests + matching accuracy + timings -> test/results.json
    python3 test/ui_tests.py               # 11 browser tests (needs Playwright + Chromium)

## Structure
db.js (schema) · matching.js (smart matching) · server.js (REST API) · seed.js · public/ (SPA) · test/

## Put it online
The site needs a running Node server, so it must go on a host that runs Node (not a static-file host).
Two ways:
- **Render (free tier):** push this folder to a GitHub repo, then in Render choose New > Blueprint (it reads `render.yaml`) or New > Web Service with build `npm install` and start `npm start`.
- **Any Docker host (Fly.io, Railway, a VPS):** `docker build -t localloop . && docker run -p 3000:3000 -v localloop-data:/data localloop`

On first start the app seeds the demo data. On free hosts the disk is wiped on restart, so data resets – fine for a demo.
Before a public launch you should add: HTTPS (hosts do this for you), session expiry and login rate limiting.
