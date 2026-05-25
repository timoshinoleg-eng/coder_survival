import sys
sys.path.insert(0, r'C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_repo_new')

from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    
    # First log in to NGC
    page.goto('https://ngc.nvidia.com/signin')
    time.sleep(3)
    try:
        page.click('button:has-text("Accept All")')
        time.sleep(1)
    except:
        pass
    
    page.fill('input[name="email"]', 'info@chatbot24.su')
    time.sleep(1)
    page.click('button:has-text("Continue")')
    time.sleep(5)
    page.fill('input[type="password"]', 'New123123New!')
    time.sleep(1)
    page.click('button[type="submit"], button:has-text("Sign In")')
    time.sleep(15)
    
    # Now navigate to DSX Air and click Login
    page.goto('https://dsx-air.nvidia.com/')
    time.sleep(3)
    
    # Close "What's New" dialog if present
    try:
        page.click('button:has-text("✕"), [aria-label="close"], .close, button[class*="close"]')
        time.sleep(1)
    except:
        pass
    
    # Click Login on DSX Air
    page.click('button:has-text("Login"), a:has-text("Login")')
    time.sleep(10)
    
    page.screenshot(path='.planning/ui-reviews/chatbot24/dsx-air-after-login.png', full_page=True)
    print('URL:', page.url)
    print('Title:', page.title())
    
    # Check for simulations or dashboard elements
    text = page.inner_text('body')
    print('Body text preview:', text[:500])
    
    browser.close()
