import Phaser from 'phaser';
import { apiRequest } from '../utils/api.js';

const POLL_INTERVAL_MS = 15000;

export default class EventManager {
  constructor(scene) {
    this.scene = scene;
    this.timer = null;
    this.running = false;
    this.isPolling = false;
    this.lastEventId = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._pollActiveEvent();
    this._schedulePoll();
  }

  stop() {
    this.running = false;
    if (this.timer) {
      this.timer.remove();
      this.timer = null;
    }
  }

  _schedulePoll() {
    if (!this.running) return;
    this.timer = this.scene.time.delayedCall(POLL_INTERVAL_MS, () => {
      this._pollActiveEvent();
      this._schedulePoll();
    });
  }

  async _pollActiveEvent() {
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      const payload = await apiRequest('/api/events/active', {
        initData: window.Telegram?.WebApp?.initData || '',
      });
      const event = payload?.activeEvent;
      if (event && event.eventId !== this.lastEventId) {
        this.lastEventId = event.eventId;
        this.scene.showRandomEvent(event);
      }
      if (!event) {
        this.lastEventId = null;
      }
    } catch (_err) {
      // Silently ignore poll failures to keep game resilient
    } finally {
      this.isPolling = false;
    }
  }
}
