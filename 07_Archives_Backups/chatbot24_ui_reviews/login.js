const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('https://chatbot24.su/admin');
  await page.waitForTimeout(2000);
  await page.fill('input[type="password"], input[placeholder*="пароль"], input', 'New123123New!');
  await page.click('button:has-text("Войти"), button');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '.planning/ui-reviews/chatbot24/logged-in.png', fullPage: true });
  console.log('URL after login:', page.url());
  await browser.close();
})();
