# Rewarded Video Implementation — Coder Survival

> Provider: AdsGram (primary)  
> Format: 15-second rewarded video  
> Frequency cap: 5/hour, 20/day per user

---

## Overview

Rewarded video is the highest-engagement ad format for Mini Apps. Users voluntarily watch a video in exchange for in-game rewards (energy, depression relief, etc.).

**Why rewarded video works:**
- User-initiated (not intrusive)
- 80-90% completion rates
- 3-5× higher eCPM than banners
- Positive user sentiment (they get something)

---

## AdsGram Integration

### Step 1: Register

1. Go to [adsgram.ai](https://adsgram.ai)
2. Create publisher account
3. Add app: "Coder Survival" (Mini App type)
4. Get `app_id` and `api_key`

### Step 2: SDK Integration

```javascript
// Load AdsGram SDK in index.html
<script src="https://api.adsgram.ai/adsgram.js"></script>

// Or dynamic import
const AdsGram = await import('https://api.adsgram.ai/adsgram.js');
```

### Step 3: Initialize

```javascript
// ads/adsgram.js
class AdsGramManager {
  constructor(config) {
    this.appId = config.appId;
    this.apiKey = config.apiKey;
    this.initialized = false;
    this.adReady = false;
  }

  async init() {
    try {
      await AdsGram.init({
        appId: this.appId,
        apiKey: this.apiKey,
        debug: process.env.NODE_ENV !== 'production'
      });
      this.initialized = true;
      console.log('[AdsGram] Initialized');
    } catch (err) {
      console.error('[AdsGram] Init failed:', err);
    }
  }

  async loadAd() {
    if (!this.initialized) return false;
    try {
      await AdsGram.loadRewarded({
        placement: 'energy_reward' // or 'depression_reward', 'bonus'
      });
      this.adReady = true;
      return true;
    } catch (err) {
      console.error('[AdsGram] Load failed:', err);
      return false;
    }
  }

  async showAd(onReward, onClose, onError) {
    if (!this.adReady) {
      onError?.('Ad not ready');
      return;
    }

    try {
      const result = await AdsGram.showRewarded({
        onReward: (reward) => {
          // User watched full video
          onReward?.(reward);
        },
        onClose: (completed) => {
          // Ad closed (completed = true if watched fully)
          this.adReady = false;
          onClose?.(completed);
        },
        onError: (err) => {
          this.adReady = false;
          onError?.(err);
        }
      });
    } catch (err) {
      this.adReady = false;
      onError?.(err);
    }
  }
}

export const adsGramManager = new AdsGramManager({
  appId: process.env.ADSGRAM_APP_ID,
  apiKey: process.env.ADSGRAM_API_KEY
});
```

---

## Rewarded Video Flow

```
User taps "Watch ad for +25 energy"
        ↓
[Check frequency cap]
        ↓
[Load ad from AdsGram]
        ↓
[Show ad (15 sec video)]
        ↓
├─ User watches full → grant reward
└─ User skips early → no reward
        ↓
[Update analytics]
        ↓
[Preload next ad]
```

---

## Frequency Capping

```javascript
// ads/frequency-cap.js
class FrequencyCap {
  constructor() {
    this.HOUR_LIMIT = 5;
    this.DAY_LIMIT = 20;
    this.STORAGE_KEY = 'cs_ad_views';
  }

  getViews() {
    const data = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
    const now = Date.now();
    // Filter to last 24 hours
    return data.filter(ts => now - ts < 24 * 60 * 60 * 1000);
  }

  canShow() {
    const views = this.getViews();
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    const hourViews = views.filter(ts => ts > hourAgo).length;
    
    return hourViews < this.HOUR_LIMIT && views.length < this.DAY_LIMIT;
  }

  recordView() {
    const views = this.getViews();
    views.push(Date.now());
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(views));
  }

  getRemaining() {
    const views = this.getViews();
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    const hourViews = views.filter(ts => ts > hourAgo).length;
    
    return {
      hourRemaining: Math.max(0, this.HOUR_LIMIT - hourViews),
      dayRemaining: Math.max(0, this.DAY_LIMIT - views.length),
      nextAvailableIn: this.getNextAvailable(views)
    };
  }

  getNextAvailable(views) {
    if (views.length < this.DAY_LIMIT) return 0;
    const oldest = Math.min(...views);
    return Math.max(0, oldest + 24 * 60 * 60 * 1000 - Date.now());
  }
}

export const frequencyCap = new FrequencyCap();
```

---

## Reward Configuration

```javascript
// ads/rewards.js
export const AD_REWARDS = {
  energy_small: {
    name: '+25 энергии',
    energy: 25,
    cooldown_minutes: 5
  },
  energy_large: {
    name: '+50 энергии',
    energy: 50,
    cooldown_minutes: 15
  },
  depression_relief: {
    name: '-10 депрессии',
    depression_reduction: 10,
    cooldown_minutes: 30
  },
  bonus_coffee: {
    name: 'Бесплатный кофе',
    item: 'coffee',
    cooldown_minutes: 60
  }
};

export async function grantAdReward(rewardType) {
  const reward = AD_REWARDS[rewardType];
  if (!reward) return false;

  // TODO: Call backend to grant reward
  // POST /api/ad-reward { user_id, reward_type, ad_provider: 'adsgram' }
  
  return true;
}
```

---

## UI Integration

```javascript
// In game UI component
import { adsGramManager } from './ads/adsgram.js';
import { frequencyCap } from './ads/frequency-cap.js';
import { AD_REWARDS, grantAdReward } from './ads/rewards.js';
import { Events, trackEvent } from '../analytics/events.js';

async function onWatchAdClick(rewardType) {
  // Check cap
  if (!frequencyCap.canShow()) {
    const remaining = frequencyCap.getRemaining();
    showToast(`Лимит рекламы исчерпан. Следующая через ${formatTime(remaining.nextAvailableIn)}`);
    return;
  }

  // Track attempt
  trackEvent(Events.REWARDED_AD_REQUEST, {
    ad_provider: 'adsgram',
    placement: rewardType,
    reward_type: rewardType
  });

  // Load ad
  const loaded = await adsGramManager.loadAd();
  if (!loaded) {
    showToast('Реклама временно недоступна. Попробуйте позже.');
    trackEvent(Events.REWARDED_AD_ERROR, {
      ad_provider: 'adsgram',
      error: 'load_failed'
    });
    return;
  }

  // Show ad
  await adsGramManager.showAd(
    // onReward
    async (reward) => {
      frequencyCap.recordView();
      const granted = await grantAdReward(rewardType);
      
      trackEvent(Events.REWARDED_AD_COMPLETE, {
        ad_provider: 'adsgram',
        reward_type: rewardType,
        reward_granted: granted,
        duration_sec: 15
      });

      if (granted) {
        showToast(AD_REWARDS[rewardType].name + ' получено!');
        refreshGameState();
      }
    },
    // onClose
    (completed) => {
      if (!completed) {
        trackEvent(Events.REWARDED_AD_SKIP, {
          ad_provider: 'adsgram',
          reward_type: rewardType,
          progress_pct: 0 // AdsGram doesn't provide partial progress
        });
      }
      // Preload next ad
      adsGramManager.loadAd();
    },
    // onError
    (err) => {
      showToast('Ошибка загрузки рекламы');
      trackEvent(Events.REWARDED_AD_ERROR, {
        ad_provider: 'adsgram',
        error: err.message || 'unknown'
      });
    }
  );
}
```

---

## Fallback: Simple Rewarded Video (No SDK)

If AdsGram SDK unavailable, implement basic rewarded flow:

```javascript
// Simple fallback using direct video
class SimpleRewardedAd {
  constructor() {
    this.videoUrl = null; // CDN-hosted ad video
    this.rewardCallback = null;
  }

  async show(videoUrl, onComplete, onSkip) {
    // Create video element overlay
    const container = document.createElement('div');
    container.className = 'rewarded-ad-overlay';
    container.innerHTML = `
      <video id="rewarded-video" autoplay playsinline>
        <source src="${videoUrl}" type="video/mp4">
      </video>
      <div class="ad-timer">15</div>
      <button class="ad-skip" disabled>Пропустить через <span>15</span></button>
    `;
    document.body.appendChild(container);

    const video = container.querySelector('#rewarded-video');
    const skipBtn = container.querySelector('.ad-skip');
    let completed = false;

    // Countdown
    let seconds = 15;
    const timer = setInterval(() => {
      seconds--;
      skipBtn.querySelector('span').textContent = seconds;
      if (seconds <= 5) {
        skipBtn.disabled = false;
        skipBtn.textContent = 'Пропустить';
      }
    }, 1000);

    // Video ended = reward granted
    video.onended = () => {
      completed = true;
      clearInterval(timer);
      cleanup();
      onComplete?.();
    };

    // Skip button
    skipBtn.onclick = () => {
      clearInterval(timer);
      cleanup();
      onSkip?.(completed);
    };

    function cleanup() {
      video.pause();
      container.remove();
    }
  }
}
```

**Note:** This is a last-resort fallback. Real ad networks provide:
- Ad targeting
- Revenue tracking
- Anti-fraud
- Fill rate optimization

---

## Revenue Estimates

### Assumptions
- DAU: 10,000
- Ad-supported users: 70% (7,000)
- Avg ads watched / user / day: 3
- Fill rate: 85%

### Revenue by Tier

| Tier | eCPM | Daily Impressions | Daily Revenue | Monthly Revenue |
|------|------|-------------------|---------------|-----------------|
| Tier-1 (10%) | $5.00 | 2,550 | $12.75 | $382 |
| Tier-2 (30%) | $1.00 | 7,650 | $7.65 | $229 |
| Tier-3 (60%) | $0.50 | 15,300 | $7.65 | $229 |
| **Total** | — | 25,500 | **$28.05** | **$841** |

*Note: These are rough estimates. Actual revenue depends on fill rate, viewability, and advertiser demand.*

---

## Testing Checklist

- [ ] Ad loads within 3 seconds
- [ ] Video plays without stutter
- [ ] Reward granted only after full view
- [ ] Skip button appears after 10 sec
- [ ] Frequency cap enforced (5/hour, 20/day)
- [ ] Analytics events fire correctly
- [ ] UI responsive during ad playback
- [ ] Ad close handles gracefully
- [ ] Fallback works if AdsGram fails

---

*Last updated: 2026-05-05*
