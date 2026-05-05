# Telegram Ad Networks Comparison — Coder Survival

> Research for rewarded video and banner monetization in Telegram Mini App.
> Date: 2026-05-05

---

## Candidates

### 1. AdsGram (Recommended)

**Type:** Telegram-native ad network  
**Backed by:** TON Foundation ($50K grant)  
**Used by:** Hamster Kombat, Catizen, Not Pixel, Gamee, Pixiland (800+ projects)

#### Ad Formats
| Format | Status | Specs |
|--------|--------|-------|
| Rewarded Video | ✅ Live | 15 sec, vertical 9:16, mp4 |
| Static Banners | ✅ Live | Standard banner sizes |
| Inline Banners | 🔄 Coming | Native in-feed |
| Interstitials | 🔄 Planned | Full-screen |

#### Integration
- SDK-like integration for Mini Apps
- JavaScript API: `AdsGram.showRewardedAd({...})`
- Callbacks: `onReward`, `onClose`, `onError`

#### Pricing & Payouts
- **Model:** CPM (cost per mille impressions)
- **Advertiser pricing:** USDT
- **Publisher payouts:** USDt-TON (TON blockchain)
- **eCPM estimates:**
  - Tier-1 (US, EU): $3-8
  - Tier-2 (IN, ID, BR): $0.50-2
  - Tier-3 / СНГ: $0.20-1
- **Revenue share:** ~60-70% to publisher (estimated)

#### Pros
- Native Telegram integration — no external redirects
- TON-based payouts — fast, low fees
- Anti-fraud filtering (claims 99% bot filtering)
- Low entry barrier — no minimum deposit for publishers
- Co-marketing and ad credits for partners

#### Cons
- Limited to Telegram ecosystem
- Smaller inventory than global networks
- Payouts in crypto only (TON/USDT)
- Less mature reporting than Google/FB

---

### 2. AdTon

**Type:** TON ecosystem ad network  
**Focus:** TON wallet users, crypto-native audience

#### Ad Formats
- Rewarded video
- Banner ads
- Native ads

#### Integration
- TON Connect integration
- Smart contract-based payouts

#### Pricing
- **Model:** CPC / CPM hybrid
- **Payouts:** Toncoin (TON)
- **eCPM:** Similar to AdsGram, slightly lower liquidity

#### Pros
- Deep TON integration
- Crypto-native audience (higher value for Web3 games)
- Smart contract transparency

#### Cons
- Smaller network than AdsGram
- Limited advertiser pool
- Complex integration for non-crypto devs
- Documentation less mature

---

### 3. Telegram Ads (Official Platform)

**Type:** Official Telegram advertising  
**Access:** https://ads.telegram.org

#### Ad Formats
- Sponsored messages in channels (text + small media)
- Video ads up to 15 sec (2025 update)
- Search result ads (2025 update)
- Mini App placements (2025 update)

#### Integration
- Not a traditional SDK — ads served via Telegram infrastructure
- For Mini Apps: requires partnership or managed account
- Minimum budget: €500+ (via agencies) or €2M direct

#### Pricing
- **Model:** CPM in TON
- **Minimum CPM:** ~0.1 TON
- **Target:** User acquisition, not in-app monetization

#### Pros
- Massive reach (900M+ users)
- Brand-safe
- Official support

#### Cons
- **Not suitable for in-app rewarded video**
- Designed for user acquisition, not publisher monetization
- High minimum budgets
- No direct SDK for Mini App ad serving

---

## Comparison Matrix

| Criteria | AdsGram | AdTon | Telegram Ads |
|----------|---------|-------|--------------|
| **Rewarded Video** | ✅ Yes | ✅ Yes | ❌ No |
| **Mini App SDK** | ✅ Yes | ⚠️ Partial | ❌ No |
| **eCPM (Tier-1)** | $3-8 | $2-6 | N/A |
| **eCPM (Tier-2)** | $0.50-2 | $0.40-1.50 | N/A |
| **eCPM (СНГ)** | $0.20-1 | $0.15-0.80 | N/A |
| **Payout Currency** | USDT-TON | TON | TON/EUR |
| **Payout Speed** | Weekly | Bi-weekly | Monthly |
| **Integration Complexity** | Low | Medium | High |
| **Anti-Fraud** | Built-in | Basic | Basic |
| **Minimum Traffic** | None | Low | N/A |

---

## Recommendation

**Primary:** AdsGram
- Best fit for Telegram Mini App
- Rewarded video ready now
- TON payouts align with project ecosystem
- Proven by major TMA games

**Secondary / Backup:** AdTon
- If AdsGram inventory insufficient
- For TON-specific campaigns
- Diversification of revenue

**Not for monetization:** Telegram Ads Official
- Use only for user acquisition campaigns
- Not a publisher monetization tool

---

## Next Steps

1. Register publisher account at [adsgram.ai](https://adsgram.ai)
2. Create app placement for Coder Survival
3. Integrate SDK (see `rewarded-video.md`)
4. A/B test: AdsGram vs AdTon after 10K DAU

---

*Last updated: 2026-05-05*
