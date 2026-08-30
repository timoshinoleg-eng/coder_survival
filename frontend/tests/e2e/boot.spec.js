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

/**
 * The two target Telegram Mini App viewports. Everything visual must hold at
 * the narrower one — 360px is where the HUD action row used to push МЕНЮ
 * off-screen, taking every bottom-sheet destination with it.
 */
const VIEWPORTS = [
  { label: '390x844', width: 390, height: 844 },
  { label: '360x800', width: 360, height: 800 },
];

/** Every destination that used to live in the legacy toolbar. */
const EXPECTED_MIN_DESTINATIONS = 15;

async function bootApp(page) {
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
}

test('app boots without uncaught errors and reaches interactive UI', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await bootApp(page);

  expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
});

for (const viewport of VIEWPORTS) {
  test(`responsive layout ${viewport.label} — single root, flex chain, bounded game area`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await bootApp(page);

    // Exactly one #app. App.jsx used to set id="app" on its own root, producing
    // a second one nested inside the mount container from index.html.
    await expect(page.locator('#app')).toHaveCount(1);

    // Flex chain #app -> .app-shell -> #game-container. Without a flex parent
    // the game area's `flex: 1` was inert and the layout collapsed.
    const chain = await page.evaluate(() => {
      const root = document.getElementById('app');
      const shell = root && root.querySelector(':scope > .app-shell');
      const game = shell && shell.querySelector('#game-container');
      const read = (el) => (el ? getComputedStyle(el) : null);
      const shellStyle = read(shell);
      const gameStyle = read(game);
      return {
        hasShell: Boolean(shell),
        hasGame: Boolean(game),
        shellDisplay: shellStyle && shellStyle.display,
        shellDirection: shellStyle && shellStyle.flexDirection,
        gameFlexGrow: gameStyle && gameStyle.flexGrow,
      };
    });

    expect(chain.hasShell, '#app must contain .app-shell').toBe(true);
    expect(chain.hasGame, '.app-shell must contain #game-container').toBe(true);
    expect(chain.shellDisplay).toBe('flex');
    expect(chain.shellDirection).toBe('column');
    expect(chain.gameFlexGrow).toBe('1');

    // The game area is actually laid out, and never wider than the viewport.
    const box = await page.locator('#game-container').boundingBox();
    expect(box, '#game-container must be laid out').not.toBeNull();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    expect(box.width).toBeLessThanOrEqual(viewport.width);

    // No horizontal overflow anywhere in the document.
    const widths = await page.evaluate(() => ({
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(widths.docScrollWidth, 'document must not scroll horizontally').toBeLessThanOrEqual(
      widths.innerWidth
    );
    expect(widths.bodyScrollWidth, 'body must not scroll horizontally').toBeLessThanOrEqual(
      widths.innerWidth
    );
  });

  test(`responsive navigation ${viewport.label} — reachable menu, all destinations actionable`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await bootApp(page);

    const menuButton = page.getByRole('button', { name: 'Открыть меню игры' });
    await expect(menuButton).toBeVisible();

    // МЕНЮ is the only entry point to the sheet — if it wraps off-screen the
    // entire rest of the app becomes unreachable.
    const menuBox = await menuButton.boundingBox();
    expect(menuBox).not.toBeNull();
    expect(menuBox.x, 'МЕНЮ pushed past the left edge').toBeGreaterThanOrEqual(0);
    expect(menuBox.x + menuBox.width, 'МЕНЮ pushed past the right edge').toBeLessThanOrEqual(
      viewport.width
    );

    await menuButton.click();

    const sheet = page.locator('.hud-v2__nav-sheet');
    await expect(sheet).toBeVisible();

    const destinations = page.locator('.hud-v2__nav-grid .hud-v2__nav-item');
    const count = await destinations.count();
    expect(
      count,
      `expected at least ${EXPECTED_MIN_DESTINATIONS} destinations in the sheet`
    ).toBeGreaterThanOrEqual(EXPECTED_MIN_DESTINATIONS);

    for (let i = 0; i < count; i += 1) {
      const item = destinations.nth(i);
      await expect(item, `destination #${i + 1} must be visible`).toBeVisible();
      const itemBox = await item.boundingBox();
      expect(itemBox, `destination #${i + 1} must be laid out`).not.toBeNull();
      expect(itemBox.width, `destination #${i + 1} has no width`).toBeGreaterThan(0);
    }

    // Closing through the scrim proves the sheet is the topmost layer. Before
    // the stacking-context fix the absolutely positioned tap area sat above it
    // and swallowed the click.
    await page.locator('.hud-v2__nav-scrim').click({ position: { x: 12, y: 40 } });
    await expect(sheet).toHaveCount(0);
  });
}

test('event keyart files are served', async ({ request }) => {
  // RandomEventToast uses these as card backgrounds; a missing file would
  // silently fall back to the flat panel — fail loudly instead.
  const files = [
    'friday_release_outage_keyart_780.jpg',
    'blameless_postmortem_keyart_780.jpg',
  ];
  for (const file of files) {
    const response = await request.get(`/visual_assets/first_pack/${file}`);
    expect(response.status(), `missing keyart: ${file}`).toBe(200);
  }
});
