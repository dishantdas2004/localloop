# End-to-end browser tests (Playwright / Chromium) against http://localhost:3100
import json
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:3100/'
res = []
def rec(i, desc, expected, actual, ok): res.append({'id': i, 'desc': desc, 'expected': expected, 'actual': actual, 'pass': bool(ok)})

def login(pg, email):
    pg.goto(BASE + '#/login'); pg.wait_for_selector('#email')
    pg.fill('#email', email); pg.fill('#pw', 'demo1234'); pg.click('button[type=submit]')
    pg.wait_for_selector('.hero'); pg.wait_for_selector('.card')

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1280, 'height': 800}); pg = ctx.new_page()
    dialogs = []; pg.on('dialog', lambda d: (dialogs.append(d.message), d.dismiss()))

    # UI01 register
    pg.goto(BASE + '#/register'); pg.wait_for_selector('#name')
    pg.fill('#name', 'Sikha Sharma'); pg.fill('#email', 'sikha@example.com'); pg.fill('#pw', 'secret123'); pg.select_option('#nb', label='Majitar')
    pg.click('button[type=submit]'); pg.wait_for_selector('.hero')
    nav = pg.inner_text('#links')
    rec('UI01', 'Create an account through the registration form', 'User is logged in and the name appears in the navigation bar', 'Navigation shows: ' + ('Sikha Sharma' if 'Sikha Sharma' in nav else nav[:40]), 'Sikha Sharma' in nav)

    # UI02 post item
    pg.goto(BASE + '#/post'); pg.wait_for_selector('#title')
    pg.fill('#title', 'Portable induction cooktop'); pg.select_option('#category', 'Kitchen'); pg.fill('#days', '3'); pg.fill('#desc', 'Single burner, 2000W')
    pg.click('button[type=submit]'); pg.wait_for_selector('.detail h2')
    t = pg.inner_text('.detail h2')
    rec('UI02', 'Share an item using the “Share an item” form', 'Item page opens showing the new title', 'Item page title: ' + t, 'induction' in t)

    # UI03 live search
    pg.goto(BASE + '#/'); pg.wait_for_selector('.card'); pg.fill('#q', 'projector'); pg.wait_for_timeout(900)
    n = pg.locator('.card').count()
    rec('UI03', 'Type “projector” in the search box', 'Grid updates live to show only matching items', f'{n} card(s): ' + pg.locator('.card h3').first.inner_text(), n == 1)

    # UI04 invalid dates error
    pg.goto(BASE + '#/item/7'); pg.wait_for_selector('#start')
    pg.fill('#start', '2099-01-10'); pg.fill('#end', '2099-01-05'); pg.click('button[type=submit]'); pg.wait_for_timeout(500)
    e = pg.inner_text('.error')
    rec('UI04', 'Submit a borrow request with the end date before the start date', 'Friendly error message is shown, no request created', 'Message: ' + e, 'end date' in e.lower())
    ctx.clear_cookies(); pg.evaluate('localStorage.clear()')

    # UI05 borrow -> UI06 accept -> UI07 return
    login(pg, 'demo@localloop.test')
    pg.goto(BASE + '#/item/2'); pg.wait_for_selector('#start')
    pg.click('button[type=submit]'); pg.wait_for_selector('.tabs'); pg.click('text=/Requests I made/'); pg.wait_for_timeout(300)
    txt = pg.inner_text('#app')
    rec('UI05', 'Borrower sends a request for the step ladder', 'Request appears under “Requests I made” as Pending', 'Dashboard shows ladder request, Pending: ' + str('Aluminium step ladder' in txt and 'Pending' in txt), 'Aluminium step ladder' in txt and 'Pending' in txt)
    pg.evaluate('localStorage.clear()'); login(pg, 'rohan@localloop.test')
    pg.goto(BASE + '#/dashboard'); pg.wait_for_selector('.tabs'); pg.click('text=/Requests received/'); pg.wait_for_timeout(300)
    card = pg.locator('.row-card', has_text='Priya Rai wants Aluminium step ladder')
    card.get_by_text('Accept', exact=True).click(); pg.wait_for_timeout(600)
    pg.click('text=/Requests received/'); pg.wait_for_timeout(300)
    card = pg.locator('.row-card', has_text='Priya Rai wants Aluminium step ladder')
    st = card.inner_text()
    rec('UI06', 'Owner accepts the request from the dashboard', 'Status changes to Accepted and “Mark as returned” appears', 'Card shows: ' + ('Accepted' if 'Accepted' in st else st[:50]) + (', Mark as returned' if 'Mark as returned' in st else ''), 'Accepted' in st and 'Mark as returned' in st)
    card.get_by_text('Mark as returned').click(); pg.wait_for_timeout(600)
    pg.goto(BASE + '#/item/2'); pg.wait_for_selector('.detail h2'); pg.wait_for_timeout(300)
    page = pg.inner_text('.detail')
    rec('UI07', 'Owner marks the ladder as returned', 'Item shows as Available again', 'Item page status: ' + ('Available' if 'Available' in page else 'Lent out'), 'Available' in page)

    # UI08 XSS
    pg.goto(BASE + '#/post'); pg.wait_for_selector('#title')
    xss = '<img src=x onerror=alert(1)>'
    pg.fill('#title', xss); pg.select_option('#category', 'Other'); pg.fill('#desc', '<script>alert(2)</script>')
    pg.click('button[type=submit]'); pg.wait_for_selector('.detail h2'); pg.wait_for_timeout(500)
    shown = pg.inner_text('.detail h2'); injected = pg.locator('.detail img, .detail script').count()
    rec('UI08', 'Share an item whose name contains HTML/JavaScript (<img onerror>, <script>)', 'Shown as plain text; no script runs; no element injected', f'Shown as text: {shown == xss}; dialogs fired: {len(dialogs)}; injected elements: {injected}', shown == xss and not dialogs and injected == 0)

    # UI09 logged-out protection
    pg.evaluate('localStorage.clear()'); pg.goto(BASE + '#/'); pg.goto(BASE + '#/dashboard'); pg.wait_for_timeout(600)
    pg.reload(); pg.wait_for_timeout(700)
    t = pg.inner_text('#app')
    rec('UI09', 'Open the dashboard while logged out', 'Prompted to log in instead of showing data', 'Page says: ' + t.split('\n')[0], 'Please log in' in t)

    # UI10 mobile overflow
    m = b.new_context(viewport={'width': 390, 'height': 844}); mp = m.new_page(); mp.goto(BASE + '#/'); mp.wait_for_selector('.card'); mp.wait_for_timeout(500)
    sw, iw = mp.evaluate('[document.documentElement.scrollWidth, window.innerWidth]')
    rec('UI10', 'Open the home page on a 390 px wide phone screen', 'No horizontal scrolling; layout fits the screen', f'page width {sw}px, screen width {iw}px', sw <= iw)
    mp.goto(BASE + '#/item/1'); mp.wait_for_selector('.detail'); mp.wait_for_timeout(300)
    sw2 = mp.evaluate('document.documentElement.scrollWidth')
    rec('UI11', 'Open an item page on the same phone screen', 'No horizontal scrolling', f'page width {sw2}px, screen width {iw}px', sw2 <= iw)
    b.close()
json.dump(res, open('test/ui_results.json', 'w'), indent=1)
print(sum(r['pass'] for r in res), '/', len(res), 'UI tests passed')
for r in res:
    if not r['pass']: print('FAIL', r['id'], r['desc'], '->', r['actual'])
