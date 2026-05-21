import Phaser from 'phaser';

const EVENT_TEMPLATES = [
  {
    type: 'prod_down',
    title: 'ПРОД БАЗА УПАЛА',
    description: 'Кажется, кто-то деплоил в пятницу. Код красный, пейджер орёт.',
    ignore: { label: 'ИГНОРИРОВАТЬ', energyDelta: 0, depressionDelta: 10, commitsDelta: -20 },
    solve: { label: 'РЕШИТЬ', energyDelta: 0, depressionDelta: -5, commitsDelta: 30 },
  },
  {
    type: 'coworker_meme',
    title: 'КОЛЛЕГА ПРИСЛАЛ МЕМ',
    description: 'В чате закинули мем про джунов. Ты смеёшься или завидуешь?',
    ignore: { label: 'НЕ МОЁ', energyDelta: 5, depressionDelta: -5, commitsDelta: 0 },
    solve: { label: 'ШЕРИТЬ', energyDelta: 10, depressionDelta: -15, commitsDelta: 0 },
  },
  {
    type: 'manager_deadline',
    title: 'МЕНЕДЖЕР: +1 ДЕДЛАЙН',
    description: '«Это же просто кнопку добавить?» — сказал он, не зная правды.',
    ignore: { label: 'МОЛЧАТЬ', energyDelta: 0, depressionDelta: 25, commitsDelta: 0 },
    solve: { label: 'ОТВЕТИТЬ', energyDelta: 0, depressionDelta: -10, commitsDelta: 0 },
  },
  {
    type: 'sleep_not_found',
    title: '404: SLEEP NOT FOUND',
    description: '3 часа ночи. Глаза горят, но не от радости. Ещё один баг?',
    ignore: { label: 'СПАТЬ', energyDelta: -30, depressionDelta: 20, commitsDelta: 0 },
    solve: { label: 'КОФЕ', energyDelta: 50, depressionDelta: 0, commitsDelta: 0 },
  },
];

export default class EventManager {
  constructor(scene) {
    this.scene = scene;
    this.timer = null;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._scheduleNext();
  }

  stop() {
    this.running = false;
    if (this.timer) {
      this.timer.remove();
      this.timer = null;
    }
  }

  _scheduleNext() {
    if (!this.running) return;
    const delay = Phaser.Math.Between(30000, 90000); // 30–90 seconds
    this.timer = this.scene.time.delayedCall(delay, () => {
      this._triggerEvent();
      this._scheduleNext();
    });
  }

  _triggerEvent() {
    const template = Phaser.Math.RND.pick(EVENT_TEMPLATES);
    const eventId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const payload = {
      type: template.type,
      eventId,
      title: template.title,
      description: template.description,
      options: {
        solve: { ...template.solve },
        ignore: { ...template.ignore },
      },
      timeout: 15,
    };

    this.scene.showRandomEvent(payload);
  }
}
