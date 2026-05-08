import { apiRequest } from './api.js';

/**
 * AdsManager — provider-agnostic rewarded video abstraction.
 * Current implementation uses a mock provider for dev/QA.
 * Production path expects an external SDK with server-side verification.
 */
class AdsManager {
  constructor() {
    this.provider = 'mock';
  }

  isAvailable() {
    // Guard: mock provider is disabled by default in production.
    // Set VITE_ENABLE_REWARDED_ADS=true only when a real ad SDK is integrated.
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ENABLE_REWARDED_ADS === 'true') {
      return true;
    }
    return false;
  }

  async requestSession(initData) {
    const payload = await apiRequest('/api/rewards/ad-session', {
      method: 'POST',
      initData
    });
    return payload;
  }

  async showRewardedAd(initData, nonce) {
    // Mock: simulate a 5-second rewarded video view
    // In production this would invoke the external ad SDK and pass the nonce
    // as a correlation id for server verification.
    await new Promise((resolve) => { setTimeout(resolve, 5000); });
    return true;
  }

  async claimReward(initData, nonce) {
    return apiRequest('/api/rewards/ad-claim', {
      method: 'POST',
      initData,
      body: { nonce, provider: this.provider }
    });
  }
}

export const adsManager = new AdsManager();
