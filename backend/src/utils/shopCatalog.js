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
    description: '+50 энергии и снижает стресс на 10 пунктов',
    stars: 25,
    effect: 'restore_50_energy_and_reduce_10_stress',
    first_purchase_bonus: true,
    position: 'between_10_and_40',
    icon: '☕',
    category: 'bundle'
  },
  depression_cure: {
    id: 'depression_cure',
    name: 'Терапия',
    description: 'Снижает стресс на 50 пунктов',
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
    stars: 499,
    icon: '🎟️',
    category: 'pass'
  },
  streak_protect: {
    id: 'streak_protect',
    name: 'Защита стрика',
    description: 'Замораживает стрик на 24 часа',
    stars: 50,
    icon: '🧊',
    category: 'streak',
    effect: 'freeze_streak'
  },
  streak_saver: {
    id: 'streak_saver',
    name: 'Экстренный кофе',
    description: 'Сохраняет стрик, если день уже почти потерян',
    stars: 1,
    effect: 'preserve_streak_next_missed_day',
    discountPercent: 90,
    icon: '🛟',
    category: 'streak'
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
