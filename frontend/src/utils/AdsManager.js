import { apiRequest } from './api.js';

/**
 * AdsManager — provider-agnostic rewarded video abstraction.
 *
 * INTEGRATION CHECKLIST for real ad SDK (e.g., AdMob, MyTarget, Yandex, AdsGram):
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
    this.provider = this.detectProvider();
    this.sessionProviders = new Map();
    this.adsGramController = null;
  }

  detectProvider() {
    const configured = import.meta.env?.VITE_ADS_PROVIDER;
    if (typeof configured === 'string' && configured.trim()) {
      return configured.trim().toLowerCase();
    }
    return 'mock';
  }

  isAvailable() {
    // Guard: disabled by default until explicitly enabled via env.
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ENABLE_REWARDED_ADS === 'true') {
      return true;
    }
    return false;
  }

  async init() {
    if (this.provider === 'adsgram') {
      const blockId = import.meta.env?.VITE_ADSGRAM_BLOCK_ID;
      if (typeof window !== 'undefined' && window.AdsGram && blockId) {
        this.adsGramController = window.AdsGram.init({
          blockId,
          debug: import.meta.env.DEV,
        });
      }
    }
    // TODO: initialize other real ad SDKs here
    // Example: window.adsSdk.init({ appId: import.meta.env.VITE_ADS_APP_ID })
  }

  async createAdSession(initData) {
    const payload = await apiRequest('/api/rewards/ad-session', {
      method: 'POST',
      initData,
      body: { provider: this.provider }
    });
    if (payload?.nonce && payload?.provider) {
      this.sessionProviders.set(payload.nonce, payload.provider);
    }
    return payload;
  }

  async requestSession(initData) {
    return this.createAdSession(initData);
  }

  async showRewardedAd(initData, nonce) {
    if (this.provider === 'mock') {
      // Dev/QA only: simulate a 5-second rewarded video view
      await new Promise((resolve) => { setTimeout(resolve, 5000); });
      return true;
    }

    if (this.provider === 'adsgram') {
      const blockId = import.meta.env?.VITE_ADSGRAM_BLOCK_ID;
      if (!this.adsGramController) {
        if (typeof window !== 'undefined' && window.AdsGram && blockId) {
          this.adsGramController = window.AdsGram.init({
            blockId,
            debug: import.meta.env.DEV,
          });
        }
      }
      if (!this.adsGramController) {
        throw new Error('AdsGram SDK not available');
      }
      await this.adsGramController.show();
      return true;
    }

    if (this.provider === 'telegram_native') {
      const tg = window.Telegram?.WebApp;
      if (tg?.showRewardedVideo) {
        await new Promise((resolve) => tg.showRewardedVideo(resolve));
        return true;
      }
      throw new Error('Telegram native rewarded video not available');
    }

    // TODO: production flow for other providers
    // 1. Call provider SDK with nonce as custom_data
    // 2. Wait for onRewarded({ proof, signature })
    // 3. Return proof object to caller
    throw new Error('Real ad SDK not integrated yet');
  }

  async claimAdReward(initData, sessionOrNonce, proof = null) {
    const session =
      typeof sessionOrNonce === 'object' && sessionOrNonce !== null
        ? sessionOrNonce
        : {
            nonce: sessionOrNonce,
            provider: this.sessionProviders.get(sessionOrNonce) || this.provider
          };

    const payload = await apiRequest('/api/rewards/ad-claim', {
      method: 'POST',
      initData,
      body: {
        nonce: session?.nonce,
        provider: session?.provider,
        proof
      }
    });
    if (session?.nonce) {
      this.sessionProviders.delete(session.nonce);
    }
    return payload;
  }

  async claimReward(initData, sessionOrNonce, proof = null) {
    return this.claimAdReward(initData, sessionOrNonce, proof);
  }
}

export const adsManager = new AdsManager();
