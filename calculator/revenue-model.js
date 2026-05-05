/**
 * Revenue Model Calculator — Coder Survival
 * Projects monthly revenue from DAU, ARPDAU, paying share, and tier distribution.
 *
 * Usage:
 *   const calc = new RevenueCalculator({ dau: 10000, arpdau: 0.05, ... });
 *   console.log(calc.calculate());
 */

// ─── Default Configuration ───────────────────────────────────────────
const DEFAULTS = {
  // User base
  dau: 10000,                    // Daily Active Users
  mau_multiplier: 3.5,           // MAU = DAU × multiplier (industry avg)

  // Monetization metrics
  arpdau: 0.05,                  // Average Revenue Per DAU (USD)
  paying_share: 0.03,            // % of users who pay (3% = casual game avg)

  // Tier distribution (% of DAU)
  tier_distribution: {
    tier1: 0.60,                 // СНГ / CIS
    tier2: 0.30,                 // Tier-2 markets
    tier3: 0.10                  // Tier-3 / emerging
  },

  // Revenue split by source (% of total)
  revenue_split: {
    in_app_purchases: 0.70,      // Stars purchases
    rewarded_ads: 0.30           // Ad revenue
  },

  // Commission / fees
  commissions: {
    telegram_stars: 0.05,        // Telegram takes ~5% on Stars (estimated)
    adsgram: 0.30,               // AdsGram takes ~30% (estimated)
    payment_processor: 0.00,     // No extra processor for Stars
    app_store: 0.00              // No app store (Mini App)
  },

  // Ad-specific
  ad_metrics: {
    ad_supported_users: 0.70,    // % of users who watch ads
    avg_ads_per_user_per_day: 3,
    fill_rate: 0.85,
    ecpm_by_tier: {
      tier1: 0.50,               // СНГ eCPM (USD)
      tier2: 1.00,               // Tier-2 eCPM
      tier3: 3.00                // Tier-3 eCPM (higher value users)
    }
  }
};

// ─── RevenueCalculator Class ─────────────────────────────────────────
export class RevenueCalculator {
  constructor(config = {}) {
    this.config = this.mergeConfig(DEFAULTS, config);
  }

  mergeConfig(base, override) {
    return {
      ...base,
      ...override,
      tier_distribution: { ...base.tier_distribution, ...override.tier_distribution },
      revenue_split: { ...base.revenue_split, ...override.revenue_split },
      commissions: { ...base.commissions, ...override.commissions },
      ad_metrics: {
        ...base.ad_metrics,
        ...override.ad_metrics,
        ecpm_by_tier: { ...base.ad_metrics.ecpm_by_tier, ...override.ad_metrics?.ecpm_by_tier }
      }
    };
  }

  // ─── Core Calculation ──────────────────────────────────────────────
  calculate() {
    const c = this.config;
    const dau = c.dau;
    const mau = Math.round(dau * c.mau_multiplier);

    // Revenue by source
    const iapRevenue = this.calculateIAPRevenue(dau);
    const adRevenue = this.calculateAdRevenue(dau);

    // Total gross revenue
    const dailyGross = iapRevenue.daily + adRevenue.daily;
    const monthlyGross = dailyGross * 30;

    // Net after commissions
    const net = this.calculateNet(iapRevenue, adRevenue);

    // Per-user metrics
    const arppu = c.paying_share > 0
      ? (iapRevenue.daily / (dau * c.paying_share))
      : 0;

    return {
      inputs: {
        dau,
        mau,
        arpdau: c.arpdau,
        paying_share: c.paying_share,
        tier_distribution: c.tier_distribution
      },

      revenue: {
        daily: {
          gross: round(dailyGross),
          in_app: round(iapRevenue.daily),
          ads: round(adRevenue.daily)
        },
        monthly: {
          gross: round(monthlyGross),
          in_app: round(iapRevenue.monthly),
          ads: round(adRevenue.monthly)
        }
      },

      net: {
        daily: round(net.daily),
        monthly: round(net.monthly),
        margin_pct: round((net.monthly / monthlyGross) * 100)
      },

      per_user: {
        arpdau: round(dailyGross / dau),
        arppu: round(arppu),
        ad_revenue_per_user: round(adRevenue.daily / dau)
      },

      breakdown: {
        by_tier: this.getTierBreakdown(dailyGross),
        by_source: {
          in_app: {
            gross: round(iapRevenue.daily),
            net: round(iapRevenue.daily * (1 - c.commissions.telegram_stars)),
            commission_pct: round(c.commissions.telegram_stars * 100)
          },
          ads: {
            gross: round(adRevenue.daily),
            net: round(adRevenue.daily * (1 - c.commissions.adsgram)),
            commission_pct: round(c.commissions.adsgram * 100)
          }
        }
      }
    };
  }

  // ─── IAP Revenue ───────────────────────────────────────────────────
  calculateIAPRevenue(dau) {
    const c = this.config;
    // IAP revenue = DAU × paying_share × avg_purchase_value
    // We derive avg_purchase from arpdau and revenue_split
    const targetIAPArpdau = c.arpdau * c.revenue_split.in_app_purchases;
    const daily = dau * targetIAPArpdau;

    return {
      daily,
      monthly: daily * 30
    };
  }

  // ─── Ad Revenue ────────────────────────────────────────────────────
  calculateAdRevenue(dau) {
    const c = this.config;
    const ad = c.ad_metrics;

    // Ad revenue by tier
    let daily = 0;
    for (const [tier, share] of Object.entries(c.tier_distribution)) {
      const tierDau = dau * share;
      const adUsers = tierDau * ad.ad_supported_users;
      const impressions = adUsers * ad.avg_ads_per_user_per_day * ad.fill_rate;
      const ecpm = ad.ecpm_by_tier[tier] || 1.0;
      const tierRevenue = (impressions / 1000) * ecpm;
      daily += tierRevenue;
    }

    return {
      daily,
      monthly: daily * 30
    };
  }

  // ─── Net Revenue After Commissions ─────────────────────────────────
  calculateNet(iapRevenue, adRevenue) {
    const c = this.config;

    const iapNet = iapRevenue.daily * (1 - c.commissions.telegram_stars);
    const adNet = adRevenue.daily * (1 - c.commissions.adsgram);

    const daily = iapNet + adNet;
    return {
      daily,
      monthly: daily * 30
    };
  }

  // ─── Tier Breakdown ────────────────────────────────────────────────
  getTierBreakdown(dailyGross) {
    const c = this.config;
    return Object.entries(c.tier_distribution).map(([tier, share]) => ({
      tier,
      share_pct: round(share * 100),
      dau: Math.round(c.dau * share),
      revenue_daily: round(dailyGross * share),
      revenue_monthly: round(dailyGross * share * 30)
    }));
  }

  // ─── Scenario Comparison ─────────────────────────────────────────────
  static compareScenarios(baseConfig) {
    const scenarios = {
      pessimistic: {
        dau: Math.round(baseConfig.dau * 0.5),
        arpdau: baseConfig.arpdau * 0.5,
        paying_share: baseConfig.paying_share * 0.5,
        ad_metrics: {
          ...baseConfig.ad_metrics,
          fill_rate: 0.60,
          avg_ads_per_user_per_day: 2
        }
      },
      realistic: baseConfig,
      optimistic: {
        dau: Math.round(baseConfig.dau * 2.5),
        arpdau: baseConfig.arpdau * 2.0,
        paying_share: Math.min(baseConfig.paying_share * 2, 0.08),
        ad_metrics: {
          ...baseConfig.ad_metrics,
          fill_rate: 0.95,
          avg_ads_per_user_per_day: 5,
          ecpm_by_tier: {
            tier1: baseConfig.ad_metrics.ecpm_by_tier.tier1 * 1.5,
            tier2: baseConfig.ad_metrics.ecpm_by_tier.tier2 * 1.5,
            tier3: baseConfig.ad_metrics.ecpm_by_tier.tier3 * 1.5
          }
        }
      }
    };

    return Object.entries(scenarios).map(([name, config]) => {
      const calc = new RevenueCalculator(config);
      const result = calc.calculate();
      return {
        scenario: name,
        dau: config.dau,
        monthly_gross: result.revenue.monthly.gross,
        monthly_net: result.net.monthly,
        margin_pct: result.net.margin_pct
      };
    });
  }
}

// ─── Helper ──────────────────────────────────────────────────────────
function round(n, decimals = 2) {
  return Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

// ─── CLI / Script Usage ──────────────────────────────────────────────
if (typeof window === 'undefined') {
  // Node.js environment
  const baseConfig = {
    dau: 10000,
    arpdau: 0.05,
    paying_share: 0.03,
    tier_distribution: { tier1: 0.60, tier2: 0.30, tier3: 0.10 }
  };

  console.log('=== Coder Survival Revenue Calculator ===\n');

  // Single scenario
  const calc = new RevenueCalculator(baseConfig);
  const result = calc.calculate();

  console.log('Inputs:');
  console.log(`  DAU: ${result.inputs.dau.toLocaleString()}`);
  console.log(`  MAU: ${result.inputs.mau.toLocaleString()}`);
  console.log(`  ARPDAU: $${result.inputs.arpdau}`);
  console.log(`  Paying Share: ${(result.inputs.paying_share * 100).toFixed(1)}%\n`);

  console.log('Revenue (Monthly):');
  console.log(`  Gross: $${result.revenue.monthly.gross.toLocaleString()}`);
  console.log(`  Net:   $${result.net.monthly.toLocaleString()}`);
  console.log(`  Margin: ${result.net.margin_pct}%\n`);

  console.log('Breakdown:');
  result.breakdown.by_tier.forEach(t => {
    console.log(`  ${t.tier}: ${t.share_pct}% → $${t.revenue_monthly.toLocaleString()}/mo`);
  });

  console.log('\nScenario Comparison:');
  const comparisons = RevenueCalculator.compareScenarios(baseConfig);
  comparisons.forEach(s => {
    console.log(`  ${s.scenario.padEnd(12)} | DAU: ${s.dau.toLocaleString().padStart(6)} | Gross: $${s.monthly_gross.toLocaleString().padStart(6)} | Net: $${s.monthly_net.toLocaleString().padStart(6)} | Margin: ${s.margin_pct}%`);
  });
}

// ─── Export for module use ───────────────────────────────────────────
export default RevenueCalculator;
