import sys
sys.path.insert(0, r'C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_repo_new')

from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    
    page.goto('https://ngc.nvidia.com/signin')
    time.sleep(3)
    
    # Handle cookie dialog - click "Accept All"
    try:
        page.click('button:has-text("Accept All")')
        time.sleep(1)
    except:
        pass
    
    # Fill email
    page.fill('input[name="email"]', 'info@chatbot24.su')
    time.sleep(1)
    
    # Click Continue
    page.click('button:has-text("Continue")')
    time.sleep(5)
    
    # Screenshot after email submission
    page.screenshot(path='.planning/ui-reviews/chatbot24/ngc-password.png', full_page=True)
    print('URL after email:', page.url)
    print('Title:', page.title())
    
    # Check for password field
    inputs = page.locator('input').all()
    print(f'Inputs: {len(inputs)}')
    for i, inp in enumerate(inputs):
        t = inp.get_attribute('type') or 'text'
        n = inp.get_attribute('name') or ''
        ph = inp.get_attribute('placeholder') or ''
        print(f'  {i}: type={t}, name={n}, placeholder={ph}')
    
    browser.close()
