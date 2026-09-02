/**
 * Russian UI dictionary (v1). Extracted from App.jsx / StatsBar.jsx so an EN
 * twin (see content/punchlines/en.json from the content factory) can be added
 * without touching component code again. Template-literal strings stay inline
 * for now (v2 once this structure proves stable).
 */
export const ru = {
  punchlines: {
    golden_commit: '✨ Код на секунду был красивым. Никому не рассказывай.',
    open_source_contribution: '🌍 Твой PR приняли. Теперь его будут поддерживать все, кроме тебя.',
    green_build: '🟢 CI зелёный с первого раза. Никто не трогает pipeline, пока он не передумал.',
    legacy_code: '🧹 Legacy пережит. Файл всё ещё называется final_final_v2.js.',
    deploy_friday: '📅 Пятничный deploy: потому что понедельник слишком предсказуемый.',
    bug_production: '🐛 Прод спасён. Постмортем назначен на завтра в 09:00.',
    code_review: '👀 Ревью завершено. Комментарий «небольшое замечание» оказался на 47 пунктов.',
    slack_huddle: '🎧 Созвон длился ровно две минуты. По времени Slack. В реальности — как всегда.',
    scope_creep: '📐 «Одна маленькая правка» получила отдельный epic, дедлайн и собственный эмодзи.',
    merge_conflict: '🌿 Конфликт решён. Git всё ещё помнит. Но теперь хотя бы молчит.',
    canary_rollback: '🐤 Канарейка выжила. Релиз — почти. Зато пятница снова принадлежит тебе.',
    production_500_spike: '📈 Grafana обновлена. Ошибки никуда не делись, но теперь выглядят свежее.',
    ci_pipeline_red: '🧪 Логи прочитаны. Виноват тест, который «никогда раньше не падал».',
    slack_thread_storm: '💬 Статус отправлен. Тред успокоился на 14 секунд и снова спросил ETA.',
    friday_release_outage: '🚨 Релиз откатан. Прод снова дышит. Пятница теперь — официальный участник postmortem.',
    coffee_stain: '☕ Кофе убран. Клавиатура официально снова production-ready.',
    stack_overflow_down: '📚 Stack Overflow вернулся. Самостоятельность продлилась 30 секунд.',
  },
  eventResolution: {
    legacyCodeDone: '🧹 Legacy Code отрефакторен. Цены вернулись в норму.',
    bugProductionDone: '🐛 Bug in Production исправлен. Продакшн спасён.',
    coffeeStainDone: '☕ Coffee Stain вытерта. Клавиатура чиста.',
    deployFridayCancelled: '📅 Deploy Friday отменён. Выходные спасены.',
    goldenCommitDone: '✨ Golden Commit завершён. Множитель LOC/s вернулся к норме.',
    stackOverflowBack: '📉 Stack Overflow восстановлен. Можно снова копипастить.',
    hotStreakDone: '🔥 Hot Streak завершён. Темп вернулся к норме.',
    productionAlertDone: '🚨 Production Alert погашен. Утечка энергии остановлена.',
  },
  toasts: {
    choiceFailed: 'Не удалось применить выбор. Попробуй ещё раз.',
    eventAlreadyResolved: 'Событие уже завершилось.',
    eventSyncFailed: 'Не удалось синхронизировать событие. Повтори тап.',
    minigameWon: 'Мини-игра пройдена!',
    productionAlertStarted: '🚨 Production Alert активирован на 3 минуты.',
    goldenCommitStarted: '✨ Golden Commit активирован! x7 LOC/s на 77 секунд.',
  },
  effects: {
    hotStreakActive: '🔥 Hot Streak active: повышенный темп',
    productionAlertActive: '🚨 Production Alert active: энергия убывает',
  },
};
