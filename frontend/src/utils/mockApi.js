// Mock API layer — no backend yet
// Replace with real fetch calls when backend ready

const MOCK_DELAY = 300;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const mockApi = {
  // User profile
  async getUser(userId) {
    await delay(MOCK_DELAY);
    return {
      id: userId,
      username: 'coder_dev',
      commits: 1420,
      level: 15,
      energy: 85,
      depression: 12,
      coffeeCups: 2,
      streakDays: 7
    };
  },

  // Leaderboard
  async getLeaderboard(period = 'week') {
    await delay(MOCK_DELAY);
    return [
      { rank: 1, username: 'senior_dev', commits: 9999, avatar: '👑' },
      { rank: 2, username: 'junior42', commits: 4200, avatar: '🚀' },
      { rank: 3, username: 'bug_hunter', commits: 1337, avatar: '🐛' },
      { rank: 4, username: 'you', commits: 1420, avatar: '💻' },
      { rank: 5, username: 'coffee_addict', commits: 800, avatar: '☕' }
    ];
  },

  // Shop items (Stars)
  async getShopItems() {
    await delay(MOCK_DELAY);
    return [
      { id: 'coffee_pack', name: 'Пакет кофе', description: '5 чашек', price: 50, icon: '☕' },
      { id: 'energy_drink', name: 'Энергетик', description: 'Макс энергия', price: 100, icon: '⚡' },
      { id: 'keyboard', name: 'Механика', description: '×2 коммиты 1ч', price: 200, icon: '⌨️' },
      { id: 'monitor', name: '4K монитор', description: '×3 коммиты 30м', price: 500, icon: '🖥️' }
    ];
  },

  // Purchase (mock — no real payment)
  async purchase(itemId) {
    await delay(MOCK_DELAY);
    return { success: true, itemId, message: 'Покупка совершена (mock)' };
  },

  // Save session
  async saveSession(data) {
    await delay(MOCK_DELAY / 2);
    localStorage.setItem('coder_survival_server_sync', JSON.stringify({
      ...data,
      syncedAt: Date.now()
    }));
    return { success: true };
  },

  // Load session
  async loadSession() {
    await delay(MOCK_DELAY / 2);
    const raw = localStorage.getItem('coder_survival_server_sync');
    return raw ? JSON.parse(raw) : null;
  }
};
