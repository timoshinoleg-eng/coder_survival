import sys
sys.path.insert(0, r'C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_repo_new')

from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    
    # Go directly to NGC signin
    page.goto('https://ngc.nvidia.com/signin')
    time.sleep(5)
    
    # Screenshot of login form
    page.screenshot(path='.planning/ui-reviews/chatbot24/ngc-signin.png', full_page=True)
    print('URL:', page.url)
    print('Title:', page.title())
    
    # Check for input fields
    inputs = page.locator('input').all()
    print(f'Inputs: {len(inputs)}')
    for i, inp in enumerate(inputs):
        t = inp.get_attribute('type') or 'text'
        n = inp.get_attribute('name') or ''
        ph = inp.get_attribute('placeholder') or ''
        print(f'  {i}: type={t}, name={n}, placeholder={ph}')
    
    browser.close()
