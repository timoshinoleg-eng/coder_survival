# Prioritized Investigation Matrix: Coder Survival Freezes
**Stack:** Preact 10 + Phaser 3.60 (CANVAS) + Express + PostgreSQL  
**Runtime:** Telegram Mini App (iOS WKWebView + Android Chromium WebView)  
**Constraint:** MVP-stabilization only. No rewrites.

---

## Архитектурный контекст ( freeze-relevant)

| Компонент | Паттерн | Риск |
|-----------|---------|------|
| **Renderer** | Phaser.CANVAS, 7 particle emitters, 60fps `update()` | CPU-bound main thread |
| **DOM Overlay** | Preact components with inline styles over canvas | Layout thrashing |
| **State** | Monolithic context, ~75 fields spread every update | GC pressure |
| **Network** | Serial tap queue, 10-parallel `loadState()`, polling | Queue saturation |
| **Audio** | Web Audio API + `<audio>` BGM | iOS suspend/jank |
| **Memory** | Phaser textures + DOM nodes + base64 assets | OOM kill (iOS) |

**Ключевой инсайт:** В Telegram WebView нет DevTools. Freeze может быть:
- **Main thread block** (JS занят >100мс)
- **GC pause** (50–300мс)
- **OOM process kill** (iOS WKWebView умирает молча)
- **Network HOL blocking** (тап ждёт за неважными запросами)

---

## Матрица гипотез

### H1. Main thread block от Phaser CANVAS + частиц (Probability: **Very High**)

**Почему вероятно:**
- CANVAS 2D рендерит частицы на CPU. 7 эмиттеров × 60fps = ~420 particle updates/кадр.
- Telegram WebView не даёт GPU acceleration для Canvas 2D на всех устройствах.
- `update()` в GameScene работает каждый кадр и обращается к `window.__GAME_STATE__`.

**Telemetry signal:**
- **Подтвердит:** Phaser FPS (`game.loop.actualFps`) падает < 30 при активных эмиттерах. `requestAnimationFrame` delta > 33мс на >20% кадров.
- **Опровергнет:** FPS стабилен 58–60 даже при частицах. Freeze происходит при `actualFps > 55`.

**MVP-check за 10 мин:**
```js
// Временно в GameScene.create()
this.time.addEvent({ delay: 5000, callback: () => {
  console.log('fps', this.game.loop.actualFps, 'particles', this.countActiveParticles?.());
}, loop: true });
```

---

### H2. GC pressure от монолитного контекста + massive object spread (Probability: **Very High**)

**Почему вероятно:**
- `useGameState.js` делает `setState({ ...current, ...serverState })` — создаёт новый объект с 75+ полей.
- Каждый тап + каждый refresh = новый огромный объект в heap.
- Mobile WebView heap ограничен (~200МБ на iOS). Частый GC = freeze 50–200мс.

**Telemetry signal:**
- **Подтвердит:** `performance.memory.usedJSHeapSize` растёт на >10МБ за минуту игры. GC-спайки коррелируют с freeze (Chrome Android: `PerformanceObserver` с `entryType: 'longtask'`).
- **Опровергнет:** Heap flat. Long tasks отсутствуют. Freeze происходит при stable heap.

**MVP-check за 10 мин:**
```js
// В GameProvider
const mem = performance.memory;
console.log('heap', (mem?.usedJSHeapSize / 1e6).toFixed(1), 'MB');
// + PerformanceObserver для 'longtask' (Android Chrome)
```

---

### H3. Serial tap queue создаёт «мертвые» интервалы (Probability: **High**)

**Почему вероятно:**
- `flushTapQueue()` в `while` ждёт `await apiRequest("/api/tap")`.
- Бэкенд всё ещё тяжёлый (даже после оптимизаций: anti-cheat, achievements, quest updates).
- Пользователь тапает быстрее, чем бэкенд отвечает. Очередь растёт.
- Во время ожидания очереди UI **не блокируется** напрямую, но следующие тапы накапливаются и потом вылетают пачкой — создаёт ощущение «залипания».

**Telemetry signal:**
- **Подтвердит:** `pendingTapsRef.current` достигает >5. Время от физического тапа до `commitsDelta` в UI > 500мс. Backend response time for `/api/tap` > 200мс p95.
- **Опровергнет:** `pendingTaps` всегда 0–1. Tap response < 100мс. Freeze происходит без накопления очереди.

**MVP-check за 10 мин:**
```js
// В flushTapQueue
console.log('tapQueue', pendingTapsRef.current, 'lastRTT', Date.now() - tapStartTime);
```

---

### H4. Network HOL blocking: `loadState()` грузит 10 запросов и блокирует тапы (Probability: **High**)

**Почему вероятно:**
- Browser limit: 6 concurrent connections per domain.
- `loadState()` стреляет 10 параллельных запросами.
- Если в момент тапа идёт `loadState()` (например, после claim), 6 слотов заняты — тап ждёт.
- In-flight guard на `loadState()` есть, но не на отдельных эндпоинтах внутри `Promise.all`.

**Telemetry signal:**
- **Подтвердит:** В Network tab (или proxy-логах) видно, что `/api/tap` стоит в очереди (stalled) > 200мс, пока идут 6+ других запросов к тому же origin.
- **Опровергнет:** `/api/tap` всегда имеет `stalled: 0ms`, даже во время freeze.

**MVP-check за 10 мин:**
- Chrome DevTools → Network → включить «Group by frame». Нажать Claim Quest и сразу тапать. Смотреть stalled time у `/api/tap`.

---

### H5. iOS WKWebView OOM process kill (не freeze, а перезагрузка) (Probability: **High**)

**Почему вероятно:**
- iOS WKWebView имеет жёсткий memory limit (~200–300МБ для Mini App).
- Phaser CANVAS textures + 7 эмиттеров + Preact DOM + base64 BGM/assets накапливаются.
- OOM не бросает ошибку — процесс просто умирает. Telegram перезагружает WebView. Пользователь воспринимает это как «зависло и сбросилось».

**Telemetry signal:**
- **Подтвердит:** `pageshow` event с `event.persisted === true` (WebView восстановлен после kill). `window.__PHASER_GAME__` отсутствует после freeze. iOS-only воспроизведение.
- **Опровергнет:** Freeze воспроизводится на Android Chrome. После freeze `window.__PHASER_GAME__` живой. `persisted === false`.

**MVP-check за 10 мин:**
```js
window.addEventListener('pageshow', (e) => {
  if (e.persisted) console.log('WEBVIEW_WAS_KILLED');
});
```

---

### H6. Layout thrashing от inline style объектов + DOM overlay (Probability: **Medium-High**)

**Почему вероятно:**
- `TapArea.jsx` создаёт ~20 inline `style={{...}}` объектов каждый render.
- Каждый тап = новый float-text DOM-элемент + анимация.
- Preact обновляет DOM overlay поверх CANVAS. Browser делает layout + paint для overlay, потом composite с canvas.
- В Telegram WebView composite может быть медленным.

**Telemetry signal:**
- **Подтвердит:** Chrome DevTools Performance → `Layout`/`Paint` занимают > 5мс каждый кадр во время тапа. `forced reflow` события видны.
- **Опровергнет:** Layout/Paint < 1мс. Freeze происходит без DOM-изменений.

**MVP-check за 10 мин:**
- Chrome Performance tab → record 3 сек тапов → смотреть Layout flamegraph.

---

### H7. AudioContext suspend/resume loop на iOS (Probability: **Medium**)

**Почему вероятно:**
- `AudioManager.js` подписан на `visibilitychange`. При сворачивании/разворачивании: `suspend()` + `resume()`.
- iOS WKWebView имеет баг: частые suspend/resume могут переводить AudioContext в `suspended` state навсегда.
- Также `createMediaElementSource` может бросить `InvalidStateError` после resume.
- Пользователь сворачивает Telegram → разворачивает → игра «замирает» на 1–2 секунды из-за audio init.

**Telemetry signal:**
- **Подтвердит:** `audioManager.ctx.state === 'suspended'` после freeze. `InvalidStateError` в консоли после visibility toggle. Freeze 100% воспроизводится после сворачивания/разворачивания.
- **Опровергнет:** AudioContext state `'running'` до и после freeze. Freeze воспроизводится без изменения visibility.

**MVP-check за 10 мин:**
```js
// В консоль каждые 5 сек
console.log('audioState', audioManager.ctx?.state);
// + проверить: свернуть Telegram на 3 сек, развернуть, тапнуть
```

---

### H8. Phaser `update()` loop делает тяжёлую работу каждый кадр (Probability: **Medium**)

**Почему вероятно:**
- `GameScene.update()` пересоздаёт `skinTints` объект каждый кадр.
- Обращается к `window.__GAME_STATE__` (global variable lookup — медленный).
- `tremorShakeTimer` через `setInterval` вне Phaser clock может накапливаться.

**Telemetry signal:**
- **Подтвердит:** Chrome Performance → `update()` function занимает > 3мс CPU time per frame. `window.__GAME_STATE__` lookup виден в flamegraph.
- **Опровергнет:** `update()` < 0.5мс. Freeze происходит при выключенном `update()` (например, на паузе).

**MVP-check за 10 мин:**
```js
// Временно в GameScene.update()
const t0 = performance.now();
// ...existing update code...
const dt = performance.now() - t0;
if (dt > 2) console.log('slowUpdate', dt.toFixed(2), 'ms');
```

---

### H9. Backend response time spike от DB pool wait (Probability: **Medium**)

**Почему вероятно:**
- Pool увеличен до 50, но `/api/tap` всё ещё 30–40 запросов в транзакции.
- Если несколько пользователей тапают одновременно, запросы ждут connection из pool.
- Frontend не видит ошибку — просто ждёт. Serial queue растёт.

**Telemetry signal:**
- **Подтвердит:** Backend logs показывают `query` wait time > 50мс (время от `pool.connect()` до получения client). `/api/tap` p95 latency > 300мс.
- **Опровергнет:** Pool wait time = 0мс. `/api/tap` p95 < 100мс. Freeze происходит при backend latency < 50мс.

**MVP-check за 10 мин:**
- Добавить в `index.js` лог:
```js
const start = Date.now();
const client = await pool.connect();
const wait = Date.now() - start;
if (wait > 20) console.log('poolWait', wait, 'ms');
```

---

### H10. Preact re-render storm от `setRuntimeNow` + `activeRuntimeEvents` (Probability: **Medium**)

**Почему вероятно:**
- `App.jsx` имеет `setInterval(() => setRuntimeNow(Date.now()), 1000)`.
- `activeRuntimeEvents` вычисляется inline каждый render и зависит от `runtimeNow`.
- Это вызывает render `App` → render всех children → render `GameScene` overlay.
- Если любой child делает тяжёлую работу в render (например, `Confetti` с `Math.random()`), каждая секунда = jank.

**Telemetry signal:**
- **Подтвердит:** Chrome Performance → ровно каждую секунду виден render spike в Preact. `setRuntimeNow` correlates с drop FPS.
- **Опровергнет:** FPS stable между `setRuntimeNow` тиками. Freeze происходит в моменты, когда `runtimeNow` не менялся.

**MVP-check за 10 мин:**
```js
// Временно закомментировать setInterval(setRuntimeNow, 1000) в App.jsx
// Если freeze пропадает — виноват.
```

---

## Приоритезация для расследования

| Priority | Hypothesis | Quick validation time | Fix complexity | MVP-fix available? |
|----------|-----------|----------------------|----------------|-------------------|
| **P0** | H1. Phaser CANDS particles CPU | 5 мин (fps log) | Low (reduce count) | ✅ Yes |
| **P0** | H2. GC pressure from context | 5 мин (heap log) | Low (memoize value) | ✅ Yes |
| **P0** | H3. Serial tap queue backlog | 5 мин (queue depth log) | Medium (batch) | ✅ Yes |
| **P0** | H5. iOS OOM kill | 5 мин (pageshow persisted) | Low (reduce particles) | ✅ Yes |
| **P1** | H4. Network HOL blocking | 10 мин (DevTools stalled) | Low (priority fetch) | ✅ Yes |
| **P1** | H6. Layout thrashing | 10 мин (Performance tab) | Low (static styles) | ✅ Yes |
| **P1** | H8. Phaser update() heavy | 5 мин (update() timing) | Low (memoize tints) | ✅ Yes |
| **P1** | H10. Re-render storm from 1s tick | 2 мин (comment interval) | Low (remove/merge tick) | ✅ Yes |
| **P2** | H7. AudioContext iOS suspend | 5 мин (visibility toggle) | Low (lazy resume) | ✅ Yes |
| **P2** | H9. DB pool wait spike | 10 мин (pool wait log) | Medium (optimize queries) | ⚠️ Partial |

---

## Рекомендуемый порядок расследования (1 час total)

1. **5 мин:** Добавить `console.log` FPS + heap size + `pendingTaps`. Поиграть 30 сек — сразу видно H1/H2/H3.
2. **5 мин:** Сворачивать/разворачивать Telegram 3 раза. Смотреть `pageshow` + `audioManager.ctx.state` — проверяет H5/H7.
3. **10 мин:** Chrome DevTools Performance → record 5 сек тапов → смотреть Layout flamegraph + `update()` time → проверяет H6/H8.
4. **5 мин:** Закомментировать `setRuntimeNow` interval → проверить H10.
5. **10 мин:** Network tab → смотреть stalled time `/api/tap` во время claim → проверяет H4.
6. **10 мин:** Backend log → добавить pool wait time → проверяет H9.

После этого будут данные для 2–3 конкретных MVP-fix'ов без переписывания архитектуры.
