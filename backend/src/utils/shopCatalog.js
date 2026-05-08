export const PRODUCT_CATALOG = {
  energy_refill: {
    id: 'energy_refill',
    name: 'Энергетик',
    description: 'Полное восстановление энергии',
    stars: 10,
    icon: '⚡',
    category: 'energy'
  },
  depression_cure: {
    id: 'depression_cure',
    name: 'Терапия',
    description: 'Снижает стресс на 60 пунктов',
    stars: 40,
    icon: '🧘',
    category: 'stress'
  },
  tier_boost: {
    id: 'tier_boost',
    name: 'Буст коммитов',
    description: '+40 XP и +50 прогресса к текущему рангу',
    stars: 75,
    icon: '🚀',
    category: 'boost'
  },
  premium_pass: {
    id: 'premium_pass',
    name: 'Premium Pass',
    description: 'Открывает premium-награды активного сезона',
    stars: 200,
    icon: '🎟️',
    category: 'pass'
  }
};

export function getProductById(productId) {
  return PRODUCT_CATALOG[productId] || null;
}

export function getProducts() {
  return Object.values(PRODUCT_CATALOG);
}
