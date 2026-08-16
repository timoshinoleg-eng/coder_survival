import { test, expect } from '@playwright/test';

/**
 * Boot smoke against the production build.
 * - Stubs telegram-web-app.js (CI has no Telegram).
 * - Mocks every /api/** call with empty JSON so the boot Promise.all resolves.
 * - Fails on any uncaught page error — the class of bug (TDZ in
 *   SprintPassPanel) that shipped past build + unit tests.
 */

const TELEGRAM_STUB = `
  (function () {
    function noop() {}
    function chain() { return api; }
    var api = {
      initData: '',
      initDataUnsafe: {
        user: { id: 1, first_name: 'Smoke', username: 'smoke_bot', language_code: 'ru', is_premium: false },
        start_param: null,
        receiver: { username: 'coder_survival_bot' },
      },
      version: '9.0',
      platform: 'unknown',
      colorScheme: 'dark',
      themeParams: { bg_color: '#1a1a2e', text_color: '#ffffff' },
      viewportStableHeight: 800,
      isExpanded: true,
      isVersionAtLeast: function () { return true; },
      ready: noop, expand: noop, close: noop,
      disableVerticalSwipes: noop, enableClosingConfirmation: noop, disableClosingConfirmation: noop,
      requestFullscreen: noop, exitFullscreen: noop,
      setHeaderColor: noop, setBackgroundColor: noop, setBottomBarColor: noop,
      openTelegramLink: noop, openLink: noop, openInvoice: noop, shareToStory: noop,
      onEvent: noop, offEvent: noop, sendData: noop, showAlert: noop, showConfirm: noop,
      showPopup: noop, scanQrPopup: noop, readTextFromClipboard: noop,
      HapticFeedback: { impactOccurred: noop, notificationOccurred: noop, selectionChanged: noop },
      MainButton: {
        setVisible: noop, hide: noop, show: noop, setText: noop, onClick: noop, offClick: noop,
        enable: noop, disable: noop, showProgress: noop, hideProgress: noop, setParams: noop,
      },
      BackButton: { show: noop, hide: noop, onClick: noop, offClick: noop },
      shareMessage: noop, downloadFile: noop,
    };
    window.Telegram = window.Telegram || {};
    window.Telegram.WebApp = api;
  })();
`;

test('app boots without uncaught errors and reaches interactive UI', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.route('https://telegram.org/js/telegram-web-app.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: TELEGRAM_STUB })
  );
  await page.route('**/api/**', (route) => route.fulfill({ contentType: 'application/json', body: '{}' }));

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // The app either mounts the tap area or shows the graceful
  // "server unavailable" fallback — both are acceptable boot outcomes.
  // A construction-time crash (TDZ etc.) produces neither within 20s.
  await expect
    .poll(
      async () => {
        const tap = await page.locator('#game-container, [class*="tap"], button').count();
        const fallback = await page.getByText(/Сервер недоступен|Попробовать снова/i).count();
        return tap > 0 || fallback > 0;
      },
      { timeout: 20_000 }
    )
    .toBe(true);

  expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
});
