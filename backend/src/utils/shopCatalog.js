export const PRODUCT_CATALOG = {
  energy_refill: {
    id: 'energy_refill',
    name: 'Энергетик',
    description: 'Полное восстановление энергии',
    stars: 10,
    icon: '⚡',
    category: 'energy'
  },
  coffee_break: {
    id: 'coffee_break',
    name: 'Кофе-брейк',
    description: '+50 энергии и снижает стресс на 30 пунктов',
    stars: 25,
    icon: '☕',
    category: 'bundle'
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
  },
  office_cat: {
    id: 'office_cat',
    name: 'Офисный кот',
    description: '-10 депрессии каждые 5 минут',
    stars: 100,
    icon: '🐱',
    category: 'skin'
  }
};

export function getProductById(productId) {
  return PRODUCT_CATALOG[productId] || null;
}

export function getProducts() {
  return Object.values(PRODUCT_CATALOG);
}
