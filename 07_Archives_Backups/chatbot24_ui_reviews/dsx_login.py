import sys
sys.path.insert(0, r'C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_repo_new')

from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    page.goto('https://dsx-air.nvidia.com/')
    time.sleep(2)
    
    # Click the Login button
    page.click('button:has-text("Login"), a:has-text("Login")')
    time.sleep(3)
    
    # Take screenshot of login form
    page.screenshot(path='.planning/ui-reviews/chatbot24/dsx-air-login-form.png', full_page=True)
    print('URL after clicking Login:', page.url)
    
    browser.close()
