import sys
sys.path.insert(0, r'C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_repo_new')

from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    
    page.goto('https://ngc.nvidia.com/signin')
    time.sleep(3)
    
    # Handle cookie dialog
    try:
        page.click('button:has-text("Accept All")')
        time.sleep(1)
    except:
        pass
    
    # Fill email and continue
    page.fill('input[name="email"]', 'info@chatbot24.su')
    time.sleep(1)
    page.click('button:has-text("Continue")')
    time.sleep(5)
    
    # Now on password page - fill password
    page.fill('input[type="password"]', 'New123123New!')
    time.sleep(1)
    
    # Click sign in button
    page.click('button[type="submit"], button:has-text("Sign In")')
    time.sleep(10)
    
    # Screenshot after login attempt
    page.screenshot(path='.planning/ui-reviews/chatbot24/ngc-logged-in.png', full_page=True)
    print('URL after login:', page.url)
    print('Title:', page.title())
    
    # Check for error messages
    error = page.locator('text=incorrect, text=invalid, text=wrong, text=error').count()
    print(f'Error indicators found: {error}')
    
    browser.close()
