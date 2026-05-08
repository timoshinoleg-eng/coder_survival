import { apiRequest } from './api.js';

/**
 * AdsManager — provider-agnostic rewarded video abstraction.
 *
 * INTEGRATION CHECKLIST for real ad SDK (e.g., AdMob, MyTarget, Yandex):
 * 1. Set env VITE_ADS_PROVIDER=<provider_name> and VITE_ENABLE_REWARDED_ADS=true
 * 2. Load provider SDK script in index.html or dynamically in init()
 * 3. Replace showRewardedAd() with provider-specific rewarded flow:
 *    - Pass nonce as custom_data / correlation_id to the ad request
 *    - Wait for provider's onRewarded callback
 *    - Validate provider signature / proof before calling claimReward()
 * 4. Update backend rewards.js:
 *    - Parse provider proof in ad-claim endpoint
 *    - Verify proof against provider's public key or server-to-server callback
 *    - Mark nonce as validated only after proof verification
 * 5. Remove mock fallback — never allow trust-based reward in production
 */
class AdsManager {
  constructor() {
    this.provider = import.meta.env?.VITE_ADS_PROVIDER || 'mock';
  }

  isAvailable() {
    // Guard: disabled by default until explicitly enabled via env.
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ENABLE_REWARDED_ADS === 'true') {
      return true;
    }
    return false;
  }

  async init() {
    // TODO: initialize real ad SDK here
    // Example: window.adsSdk.init({ appId: import.meta.env.VITE_ADS_APP_ID })
  }

  async requestSession(initData) {
    const payload = await apiRequest('/api/rewards/ad-session', {
      method: 'POST',
      initData
    });
    return payload;
  }

  async showRewardedAd(initData, nonce) {
    if (this.provider === 'mock') {
      // Dev/QA only: simulate a 5-second rewarded video view
      await new Promise((resolve) => { setTimeout(resolve, 5000); });
      return true;
    }

    // TODO: production flow
    // 1. Call provider SDK with nonce as custom_data
    // 2. Wait for onRewarded({ proof, signature })
    // 3. Return proof object to caller
    throw new Error('Real ad SDK not integrated yet');
  }

  async claimReward(initData, nonce, proof = null) {
    return apiRequest('/api/rewards/ad-claim', {
      method: 'POST',
      initData,
      body: { nonce, provider: this.provider, proof }
    });
  }
}

export const adsManager = new AdsManager();
