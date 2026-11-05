# Captures real screenshots of the running LocalLoop app (http://localhost:3100)
import sys
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:3100/'
OUT = 'shots/'
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1280, 'height': 800}, device_scale_factor=1)
    pg = ctx.new_page()
    pg.goto(BASE + '#/login'); pg.wait_for_selector('form')
    pg.screenshot(path=OUT + '01_login.png')
    pg.goto(BASE + '#/register'); pg.wait_for_selector('form'); pg.wait_for_timeout(300)
    pg.fill('#name', 'Sikha Sharma'); pg.fill('#email', 'sikha@example.com'); pg.fill('#pw', 'secret123'); pg.select_option('#nb', label='Majitar')
    pg.screenshot(path=OUT + '02_register.png')
    # log in as the demo user through the UI
    pg.goto(BASE + '#/login'); pg.wait_for_selector('#email')
    pg.fill('#email', 'demo@localloop.test'); pg.fill('#pw', 'demo1234'); pg.click('button[type=submit]')
    pg.wait_for_selector('.hero'); pg.wait_for_selector('.card'); pg.wait_for_timeout(3200)
    pg.screenshot(path=OUT + '03_home.png')
    pg.screenshot(path=OUT + '03_home_full.png', full_page=True)
    # search + filter
    pg.fill('#q', 'camera'); pg.wait_for_timeout(700)
    pg.select_option('#sort', 'distance'); pg.wait_for_timeout(500)
    pg.screenshot(path=OUT + '04_search.png')
    pg.fill('#q', ''); pg.select_option('#cat', 'Tools'); pg.select_option('#km', '3'); pg.wait_for_timeout(600)
    pg.screenshot(path=OUT + '05_filter.png')
    # item detail + request form
    pg.goto(BASE + '#/'); pg.wait_for_selector('.card')
    pg.goto(BASE + '#/item/7'); pg.wait_for_selector('.detail'); pg.wait_for_timeout(300)
    pg.fill('#msg', 'Planning a family movie night on Saturday. I will return it cleaned.')
    pg.screenshot(path=OUT + '06_item.png')
    # post item
    pg.goto(BASE + '#/post'); pg.wait_for_selector('#title')
    pg.fill('#title', 'Portable induction cooktop'); pg.select_option('#category', 'Kitchen'); pg.fill('#days', '3')
    pg.fill('#desc', 'Single-burner induction cooktop, 2000W. Great for small gatherings and hostel cooking.')
    pg.screenshot(path=OUT + '07_post.png')
    # wanted board with smart matches
    pg.goto(BASE + '#/wanted'); pg.wait_for_selector('.match'); pg.wait_for_timeout(500)
    pg.screenshot(path=OUT + '08_wanted.png', full_page=True)
    # dashboard tabs
    pg.goto(BASE + '#/dashboard'); pg.wait_for_selector('.tabs'); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT + '09_dash_listings.png')
    pg.click('text=/Requests I made/'); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT + '10_dash_mine.png')
    pg.click('text=/Requests received/'); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT + '11_dash_incoming.png')
    # mobile
    m = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    mp = m.new_page(); mp.goto(BASE + '#/login'); mp.wait_for_selector('#email')
    mp.fill('#email', 'demo@localloop.test'); mp.fill('#pw', 'demo1234'); mp.click('button[type=submit]')
    mp.wait_for_selector('.card'); mp.wait_for_timeout(3200)
    mp.screenshot(path=OUT + '12_mobile_home.png')
    mp.goto(BASE + '#/item/2'); mp.wait_for_selector('.detail'); mp.wait_for_timeout(300)
    mp.screenshot(path=OUT + '13_mobile_item.png', full_page=True)
    b.close()
print('done')
