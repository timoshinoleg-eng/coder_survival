import sys
sys.path.insert(0, r'C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_repo_new')

from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    
    # Go directly to DSX Air
    page.goto('https://dsx-air.nvidia.com/')
    time.sleep(3)
    
    # Click Login
    page.click('button:has-text("Login")')
    time.sleep(8)
    
    # Handle cookie dialog on NGC
    try:
        page.click('button:has-text("Accept All")')
        time.sleep(1)
    except:
        pass
    
    # Fill email if on login page
    try:
        page.fill('input[name="email"]', 'info@chatbot24.su')
        time.sleep(1)
        page.click('button:has-text("Continue")')
        time.sleep(5)
        page.fill('input[type="password"]', 'New123123New!')
        time.sleep(1)
        page.click('button[type="submit"], button:has-text("Sign In")')
        time.sleep(20)
    except Exception as e:
        print(f'Login form error: {e}')
    
    # Screenshot
    page.screenshot(path='.planning/ui-reviews/chatbot24/dsx-air-final.png', full_page=True)
    print('Final URL:', page.url)
    print('Final Title:', page.title())
    
    # Check for dashboard elements
    try:
        body_text = page.inner_text('body')
        print('Body preview:', body_text[:800])
    except:
        pass
    
    browser.close()
