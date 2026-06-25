import { h } from "preact";
import { useEffect, useState, useCallback } from "preact/hooks";
import { apiRequest } from "../utils/api.js";
import { useTelegram } from "../hooks/useTelegram.js";
import { Analytics } from "../utils/analytics.js";
import ReferralChainPanel from "./ReferralChainPanel.jsx";

function skinLabel(skinId) {
  const labels = {
    team_lead: "Team Lead",
    dark_mode_ide: "Dark Mode IDE",
  };
  return labels[skinId] || skinId;
}

function formatMilestoneReward(reward = {}) {
  const parts = [];
  if (reward.stars) parts.push(`⭐ ${reward.stars}`);
  if (reward.skin) parts.push(`🎨 ${skinLabel(reward.skin)}`);
  if (reward.commits) parts.push(`+${reward.commits} коммитов`);
  if (reward.energy) parts.push(`+${reward.energy} энергии`);
  return parts.join(" · ") || "—";
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин назад`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч назад`;
  const days = Math.floor(hrs / 24);
  return `${days} дн назад`;
}

function ProgressBar({ current, target, claimed }) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  return h(
    "div",
    {
      style: {
        width: "100%",
        height: "6px",
        borderRadius: "3px",
        background: "#0f1b30",
        overflow: "hidden",
        marginTop: "4px",
      },
    },
    h("div", {
      style: {
        width: `${pct}%`,
        height: "100%",
        borderRadius: "3px",
        background: claimed
          ? "linear-gradient(90deg, #d97706, #facc15)"
          : "linear-gradient(90deg, #2563eb, #60a5fa)",
        transition: "width 0.4s ease",
      },
    })
  );
}

const REWARD_LADDER = [
  { referrals: 1, stars: 50, label: "50 Stars за каждого друга", color: "#60a5fa" },
  { referrals: 3, stars: 200, label: "200 Stars за 3 друзей", color: "#a78bfa" },
  { referrals: 5, stars: 500, label: "500 Stars + Team Lead skin за 5 друзей", color: "#facc15" },
];

export default function ReferralPanel({ open, onClose }) {
  const { initData, shareUrl } = useTelegram();
  const [state, setState] = useState({
    loading: false,
    referralCode: "",
    referralLink: "",
    stats: {
      total: 0,
      active: 0,
      nextMilestone: null,
      milestones: [],
      claimedMilestones: [],
    },
    socialProof: null,
    activity: [],
    error: null,
    copied: false,
    claimLoading: null,
    claimError: null,
    claimSuccess: null,
  });

  const loadData = useCallback(async () => {
    const [statusPayload, socialPayload, activityPayload] = await Promise.all([
      apiRequest("/api/referral/status", { initData }),
      apiRequest("/api/referral/social-proof", { initData }).catch(() => null),
      apiRequest("/api/referral/activity", { initData }).catch(() => null),
    ]);
    setState((s) => ({
      ...s,
      loading: false,
      referralCode: statusPayload?.referralCode || "",
      referralLink: statusPayload?.referralLink || "",
      stats: {
        total: statusPayload?.total ?? 0,
        active: statusPayload?.active ?? 0,
        premiumActive: statusPayload?.premiumActive ?? 0,
        nextMilestone: statusPayload?.nextMilestone ?? null,
        milestones: statusPayload?.milestones || [],
        claimedMilestones:
          statusPayload?.milestones
            ?.filter((m) => m.claimed)
            .map((m) => m.milestone) || [],
        referred: statusPayload?.referred || [],
        activeThresholdCommits: statusPayload?.activeThresholdCommits || 20,
        antiFarmDays: statusPayload?.antiFarmDays || 2,
      },
      socialProof: socialPayload || null,
      activity: activityPayload?.activity || [],
      error: null,
    }));
  }, [initData]);

  useEffect(() => {
    if (!open) {
      setState((s) => ({
        ...s,
        copied: false,
        claimError: null,
        claimSuccess: null,
      }));
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    loadData().catch(() => {
      if (cancelled) return;
      setState((s) => ({
        ...s,
        loading: false,
        error: "Не удалось загрузить реферальные данные",
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [open, loadData]);

  const handleCopy = useCallback(() => {
    if (!state.referralLink) return;
    navigator.clipboard
      .writeText(state.referralLink)
      .then(() => {
        setState((s) => ({ ...s, copied: true }));
        setTimeout(() => setState((s) => ({ ...s, copied: false })), 2000);
      })
      .catch(() => {
        const ta = document.createElement("textarea");
        ta.value = state.referralLink;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setState((s) => ({ ...s, copied: true }));
        setTimeout(() => setState((s) => ({ ...s, copied: false })), 2000);
      });
    Analytics.track("referral_invite_sent", { channel: "copy" });
  }, [state.referralLink]);

  const handleShare = useCallback(() => {
    if (!state.referralLink) return;
    shareUrl(
      state.referralLink,
      "Я выживаю в IT в Coder Survival — тапаю коммиты и пью кофе, пока не выгорел. Присоединяйся, вместе гораздо веселее ☕️💀"
    );
    Analytics.track("referral_invite_sent", { channel: "telegram" });
  }, [state.referralLink, shareUrl]);

  const handleClaimMilestone = useCallback(
    async (milestone) => {
      setState((s) => ({
        ...s,
        claimLoading: milestone,
        claimError: null,
        claimSuccess: null,
      }));
      try {
        const payload = await apiRequest("/api/referral/claim", {
          method: "POST",
          initData,
          body: { milestone },
        });
        if (payload?.success) {
          if (payload?.already_claimed) {
            setState((s) => ({
              ...s,
              claimSuccess: "Награда уже была получена",
              claimLoading: null,
            }));
            await loadData();
            return;
          }
          const reward = payload.reward || {};
          const parts = [];
          if (reward.commits) parts.push(`+${reward.commits} коммитов`);
          if (reward.energy) parts.push(`+${reward.energy} энергии`);
          if (reward.stars) parts.push(`+${reward.stars} Stars`);
          if (reward.skin) parts.push(`скин ${skinLabel(reward.skin)}`);
          if (payload?.premiumApplied) parts.push("Premium x5");
          setState((s) => ({
            ...s,
            claimSuccess: parts.join(" · ") || "Награда получена!",
            claimLoading: null,
          }));
          Analytics.track("referral_claimed", {
            referrer_id: state.referralCode || "",
            campaign: "milestone",
            k_depth: milestone,
          });
          await loadData();
          setTimeout(
            () => setState((s) => ({ ...s, claimSuccess: null })),
            3000
          );
        }
      } catch (err) {
        setState((s) => ({
          ...s,
          claimError: err?.message || "Не удалось забрать награду",
          claimLoading: null,
        }));
      }
    },
    [initData, loadData, state.referralCode]
  );

  if (!open) return null;

  const { stats } = state;

  return h(
    "div",
    {
      onClick: onClose,
      style: {
        position: "absolute",
        inset: 0,
        zIndex: 40,
        background: "rgba(7, 12, 24, 0.78)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "16px 12px",
      },
    },
    h(
      "div",
      {
        onClick: (event) => event.stopPropagation(),
        style: {
          width: "min(420px, 100%)",
          maxHeight: "70vh",
          overflowY: "auto",
          background: "#10192d",
          border: "1px solid #274267",
          borderRadius: "8px",
          color: "#e6edf7",
          boxShadow: "0 18px 48px rgba(0, 0, 0, 0.35)",
        },
      },
      [
        h(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 14px",
              borderBottom: "1px solid #1f3552",
            },
          },
          [
            h("strong", null, "Рефералы"),
            h(
              "button",
              {
                onClick: onClose,
                style: {
                  border: "none",
                  background: "transparent",
                  color: "#9eb6d2",
                  fontSize: "18px",
                  cursor: "pointer",
                  padding: 0,
                  lineHeight: 1,
                },
              },
              "×"
            ),
          ]
        ),

        state.loading
          ? h(
              "div",
              { style: { padding: "14px", color: "#9eb6d2" } },
              "Загрузка..."
            )
          : state.error
            ? h(
                "div",
                { style: { padding: "14px", color: "#fda4af" } },
                state.error
              )
            : h(
                "div",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    padding: "14px",
                  },
                },
                [
                  /* ===== VALUE PROPOSITION (Why invite?) ===== */
                  h(
                    "div",
                    {
                      style: {
                        background: "linear-gradient(135deg, #1a2744, #1f3552)",
                        borderRadius: "8px",
                        padding: "12px",
                        border: "1px solid #274267",
                      },
                    },
                    [
                      h(
                        "div",
                        {
                          style: {
                            fontSize: "12px",
                            fontWeight: 700,
                            marginBottom: "8px",
                            color: "#facc15",
                          },
                        },
                        "🎯 Зачем приглашать?"
                      ),
                      REWARD_LADDER.map((tier) =>
                        h(
                          "div",
                          {
                            key: tier.referrals,
                            style: {
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              padding: "5px 0",
                              borderBottom:
                                tier.referrals < 5
                                  ? "1px solid #1f355266"
                                  : "none",
                            },
                          },
                          [
                            h(
                              "div",
                              {
                                style: {
                                  width: "22px",
                                  height: "22px",
                                  borderRadius: "50%",
                                  background: `${tier.color}22`,
                                  border: `1.5px solid ${tier.color}`,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  color: tier.color,
                                  flexShrink: 0,
                                },
                              },
                              tier.referrals
                            ),
                            h(
                              "span",
                              {
                                style: {
                                  fontSize: "11px",
                                  color: "#c7ddf5",
                                  flex: 1,
                                },
                              },
                              tier.label
                            ),
                            h(
                              "span",
                              {
                                style: {
                                  fontSize: "10px",
                                  color: stats.active >= tier.referrals ? "#4ade80" : "#8ba1bb",
                                  fontWeight: stats.active >= tier.referrals ? 700 : 400,
                                },
                              },
                              stats.active >= tier.referrals ? "✅" : `${Math.max(0, tier.referrals - stats.active)} ещё`
                            ),
                          ]
                        )
                      ),
                      h(
                        "div",
                        {
                          style: {
                            marginTop: "6px",
                            fontSize: "10px",
                            color: "#d8b4fe",
                            fontStyle: "italic",
                          },
                        },
                        "✦ Premium-друзья дают x5 награду и скин Dark Mode IDE"
                      ),
                    ]
                  ),

                  /* ===== REFERRAL LINK SECTION (improved) ===== */
                  h(
                    "div",
                    {
                      style: {
                        background: "#131d33",
                        borderRadius: "8px",
                        padding: "12px",
                        border: "1px solid #274267",
                      },
                    },
                    [
                      h(
                        "div",
                        {
                          style: {
                            fontSize: "11px",
                            color: "#8ba1bb",
                            marginBottom: "6px",
                          },
                        },
                        "Твоя реферальная ссылка"
                      ),
                      h(
                        "div",
                        {
                          style: {
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            background: "#0f1b30",
                            borderRadius: "6px",
                            padding: "8px 10px",
                            fontSize: "12px",
                            wordBreak: "break-all",
                            fontFamily: "monospace",
                            color: "#60a5fa",
                            border: "1px solid #1f3552",
                          },
                        },
                        [
                          h(
                            "span",
                            { style: { flex: 1 } },
                            state.referralLink || "—"
                          ),
                          h(
                            "button",
                            {
                              onClick: handleCopy,
                              style: {
                                padding: "6px 12px",
                                borderRadius: "6px",
                                border: "none",
                                background: state.copied
                                  ? "#16a34a"
                                  : "linear-gradient(135deg, #2563eb, #3b82f6)",
                                color: "#fff",
                                fontWeight: "bold",
                                fontSize: "11px",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                                boxShadow: state.copied
                                  ? "none"
                                  : "0 2px 8px rgba(37,99,235,0.3)",
                                transition: "background 0.2s",
                              },
                            },
                            state.copied ? "✅ Скопировано!" : "📋 Копировать"
                          ),
                        ]
                      ),
                      h(
                        "button",
                        {
                          onClick: handleShare,
                          style: {
                            marginTop: "8px",
                            width: "100%",
                            padding: "10px 0",
                            borderRadius: "6px",
                            border: "none",
                            background:
                              "linear-gradient(135deg, #274267, #1a3a5c)",
                            color: "#dce9f9",
                            fontWeight: 600,
                            fontSize: "13px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                          },
                        },
                        [
                          h(
                            "span",
                            { style: { fontSize: "16px" } },
                            "✈️"
                          ),
                          "Поделиться в Telegram",
                        ]
                      ),
                    ]
                  ),

                  /* ===== STATS ===== */
                  h(
                    "div",
                    {
                      style: {
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "8px",
                      },
                    },
                    [
                      h(
                        "div",
                        {
                          style: {
                            background: "#131d33",
                            borderRadius: "8px",
                            padding: "12px",
                            textAlign: "center",
                            border: "1px solid #1f3552",
                          },
                        },
                        [
                          h(
                            "div",
                            {
                              style: {
                                fontSize: "20px",
                                fontWeight: "bold",
                                color: "#4ade80",
                              },
                            },
                            stats.total
                          ),
                          h(
                            "div",
                            { style: { fontSize: "11px", color: "#8ba1bb" } },
                            "Всего приглашено"
                          ),
                        ]
                      ),
                      h(
                        "div",
                        {
                          style: {
                            background: "#131d33",
                            borderRadius: "8px",
                            padding: "12px",
                            textAlign: "center",
                            border: "1px solid #1f3552",
                          },
                        },
                        [
                          h(
                            "div",
                            {
                              style: {
                                fontSize: "20px",
                                fontWeight: "bold",
                                color: "#facc15",
                              },
                            },
                            stats.active
                          ),
                          h(
                            "div",
                            { style: { fontSize: "11px", color: "#8ba1bb" } },
                            "Активных"
                          ),
                        ]
                      ),
                      h(
                        "div",
                        {
                          style: {
                            background: "#131d33",
                            borderRadius: "8px",
                            padding: "12px",
                            textAlign: "center",
                            border: "1px solid #1f3552",
                          },
                        },
                        [
                          h(
                            "div",
                            {
                              style: {
                                fontSize: "20px",
                                fontWeight: "bold",
                                color: "#c084fc",
                              },
                            },
                            stats.premiumActive || 0
                          ),
                          h(
                            "div",
                            { style: { fontSize: "11px", color: "#8ba1bb" } },
                            "Premium-активных"
                          ),
                        ]
                      ),
                    ]
                  ),

                  /* ===== SOCIAL PROOF ===== */
                  state.socialProof &&
                    h(
                      "div",
                      {
                        style: {
                          background: "linear-gradient(90deg, #1a3a5c22, #27426722)",
                          borderRadius: "8px",
                          padding: "10px 12px",
                          border: "1px solid #27426766",
                        },
                      },
                      [
                        h(
                          "div",
                          {
                            style: {
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              fontSize: "11px",
                              color: "#c7ddf5",
                              marginBottom: state.socialProof.topReferrer ? "4px" : 0,
                            },
                          },
                          [
                            h("span", null, "🔥"),
                            h(
                              "span",
                              null,
                              `${state.socialProof.weeklyJoins} игроков присоединились за неделю`
                            ),
                          ]
                        ),
                        state.socialProof.topReferrer &&
                          h(
                            "div",
                            {
                              style: {
                                fontSize: "11px",
                                color: "#facc15",
                              },
                            },
                            `👑 Лучший реферал: ${state.socialProof.topReferrer.name} — ${state.socialProof.topReferrer.count} активных`
                          ),
                      ]
                    ),

                  /* ===== RECENT ACTIVITY FEED ===== */
                  state.activity.length > 0 &&
                    h(
                      "div",
                      {
                        style: {
                          background: "#131d33",
                          borderRadius: "8px",
                          padding: "12px",
                          border: "1px solid #1f3552",
                        },
                      },
                      [
                        h(
                          "div",
                          {
                            style: {
                              fontSize: "12px",
                              fontWeight: 600,
                              marginBottom: "8px",
                              color: "#8ba1bb",
                            },
                          },
                          "📡 Последняя активность"
                        ),
                        h(
                          "div",
                          {
                            style: {
                              display: "flex",
                              flexDirection: "column",
                              gap: "4px",
                            },
                          },
                          state.activity.slice(0, 5).map((a, i) =>
                            h(
                              "div",
                              {
                                key: i,
                                style: {
                                  fontSize: "11px",
                                  color: "#8ba1bb",
                                  padding: "4px 6px",
                                  borderRadius: "4px",
                                  background: "#0f1b30",
                                },
                              },
                              a.isNowActive
                                ? `✅ ${a.username || "Игрок"} стал активным`
                                : `👤 ${a.username || "Игрок"} присоединился ${timeAgo(a.createdAt)}`
                            )
                          )
                        ),
                      ]
                    ),

                  /* ===== REFERRED LIST WITH ANTI-FARM ===== */
                  stats.referred &&
                    stats.referred.length > 0 &&
                    h(
                      "div",
                      {
                        style: {
                          background: "#131d33",
                          borderRadius: "8px",
                          padding: "12px",
                          border: "1px solid #1f3552",
                        },
                      },
                      [
                        h(
                          "div",
                          {
                            style: {
                              fontSize: "12px",
                              fontWeight: 600,
                              marginBottom: "8px",
                            },
                          },
                          "👥 Приглашённые"
                        ),
                        h(
                          "div",
                          {
                            style: {
                              display: "flex",
                              flexDirection: "column",
                              gap: "6px",
                            },
                          },
                          stats.referred.map((r, i) =>
                            h(
                              "div",
                              {
                                key: i,
                                style: {
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "4px",
                                  padding: "6px 8px",
                                  borderRadius: "6px",
                                  background: r.isActive
                                    ? "#1a3f25"
                                    : "#0f1b30",
                                  border: r.isActive
                                    ? "1px solid #2d5a3e"
                                    : "1px solid #1f3552",
                                },
                              },
                              [
                                h(
                                  "div",
                                  {
                                    style: {
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                    },
                                  },
                                  [
                                    h(
                                      "div",
                                      {
                                        style: {
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "6px",
                                        },
                                      },
                                      [
                                        h(
                                          "span",
                                          {
                                            style: {
                                              fontSize: "12px",
                                              color: "#c7ddf5",
                                            },
                                          },
                                          r.username || "Аноним"
                                        ),
                                        r.isPremium &&
                                          h(
                                            "span",
                                            {
                                              style: {
                                                fontSize: "10px",
                                                color: "#d8b4fe",
                                              },
                                            },
                                            "✦ Premium"
                                          ),
                                      ]
                                    ),
                                    h(
                                      "span",
                                      {
                                        style: {
                                          fontSize: "11px",
                                          color: r.isActive
                                            ? "#4ade80"
                                            : "#8ba1bb",
                                        },
                                      },
                                      r.isActive
                                        ? "✅ Активен"
                                        : r.antiFarmStatus ||
                                            `${r.commitsTotal}/${stats.activeThresholdCommits || 20} коммитов`
                                    ),
                                  ]
                                ),
                                /* Mini progress bar for each referred user */
                                !r.isActive &&
                                  h(ProgressBar, {
                                    current: r.commitsTotal || 0,
                                    target: stats.activeThresholdCommits || 20,
                                    claimed: false,
                                  }),
                              ]
                            )
                          )
                        ),
                      ]
                    ),

                  /* ===== MILESTONES WITH PROGRESS BARS ===== */
                  stats.milestones.length > 0 &&
                    h(
                      "div",
                      {
                        style: {
                          background: "#131d33",
                          borderRadius: "8px",
                          padding: "12px",
                          border: "1px solid #1f3552",
                        },
                      },
                      [
                        h(
                          "div",
                          {
                            style: {
                              fontSize: "12px",
                              fontWeight: 600,
                              marginBottom: "8px",
                            },
                          },
                          "🎯 Milestone прогресс"
                        ),
                        h(
                          "div",
                          {
                            style: {
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                            },
                          },
                          stats.milestones.map((m) => {
                            const milestoneTarget =
                              m.milestone ?? m.target;
                            const canClaim = m.reached && !m.claimed;
                            const rewardLabel = formatMilestoneReward(
                              m.reward
                            );
                            const premiumEligible =
                              (stats.premiumActive || 0) >=
                              milestoneTarget;
                            const progressCount = Math.min(
                              stats.active,
                              milestoneTarget
                            );
                            return h(
                              "div",
                              {
                                key: milestoneTarget,
                                style: {
                                  padding: "8px 10px",
                                  borderRadius: "6px",
                                  background: m.claimed
                                    ? "#1a3f25"
                                    : m.reached
                                      ? "#1a3a5c"
                                      : "#0f1b30",
                                  border: m.claimed
                                    ? "1px solid #2d5a3e"
                                    : m.reached
                                      ? "1px solid #4ade80"
                                      : "1px solid #1f3552",
                                },
                              },
                              [
                                h(
                                  "div",
                                  {
                                    style: {
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                    },
                                  },
                                  [
                                    h(
                                      "div",
                                      null,
                                      [
                                        h(
                                          "span",
                                          {
                                            style: {
                                              fontSize: "12px",
                                              fontWeight: 600,
                                              color: m.claimed
                                                ? "#4ade80"
                                                : "#e6edf7",
                                            },
                                          },
                                          `${stats.active}/${milestoneTarget} активных`
                                        ),
                                        h(
                                          "span",
                                          {
                                            style: {
                                              fontSize: "10px",
                                              color: "#8ba1bb",
                                              marginLeft: "6px",
                                            },
                                          },
                                          rewardLabel
                                        ),
                                        premiumEligible &&
                                          h(
                                            "span",
                                            {
                                              style: {
                                                fontSize: "10px",
                                                color: "#d8b4fe",
                                                marginLeft: "4px",
                                              },
                                            },
                                            "Premium x5"
                                          ),
                                      ]
                                    ),
                                    canClaim
                                      ? h(
                                          "button",
                                          {
                                            onClick: () =>
                                              handleClaimMilestone(
                                                milestoneTarget
                                              ),
                                            disabled:
                                              state.claimLoading ===
                                              milestoneTarget,
                                            style: {
                                              padding: "5px 12px",
                                              borderRadius: "6px",
                                              border: "none",
                                              background:
                                                state.claimLoading ===
                                                milestoneTarget
                                                  ? "#274267"
                                                  : "linear-gradient(135deg, #16a34a, #22c55e)",
                                              color:
                                                state.claimLoading ===
                                                milestoneTarget
                                                  ? "#8ba1bb"
                                                  : "#fff",
                                              fontWeight: "bold",
                                              fontSize: "11px",
                                              cursor:
                                                state.claimLoading ===
                                                milestoneTarget
                                                  ? "not-allowed"
                                                  : "pointer",
                                              boxShadow:
                                                state.claimLoading ===
                                                milestoneTarget
                                                  ? "none"
                                                  : "0 2px 8px rgba(22,163,74,0.3)",
                                            },
                                          },
                                          state.claimLoading ===
                                            milestoneTarget
                                            ? "..."
                                            : premiumEligible
                                              ? "Забрать x5 🚀"
                                              : "Забрать"
                                        )
                                      : h(
                                          "span",
                                          {
                                            style: {
                                              fontSize: "12px",
                                              fontWeight: "bold",
                                              color: m.claimed
                                                ? "#4ade80"
                                                : "#8ba1bb",
                                            },
                                          },
                                          m.claimed ? "✅" : "⏳"
                                        ),
                                  ]
                                ),
                                /* Progress bar for milestone */
                                !m.claimed &&
                                  h(ProgressBar, {
                                    current: progressCount,
                                    target: milestoneTarget,
                                    claimed: m.reached,
                                  }),
                              ]
                            );
                          })
                        ),
                        stats.nextMilestone &&
                          h(
                            "div",
                            {
                              style: {
                                marginTop: "8px",
                                fontSize: "11px",
                                color: "#8ba1bb",
                                textAlign: "center",
                                padding: "6px",
                                borderRadius: "6px",
                                background: "#0f1b30",
                              },
                            },
                            `До следующей цели: ${stats.nextMilestone - stats.active} активных`
                          ),
                      ]
                    ),

                  /* ===== PREMIUM REFERRALS ===== */
                  h(
                    "div",
                    {
                      style: {
                        background: "#131d33",
                        borderRadius: "8px",
                        padding: "12px",
                        border: "1px solid #1f3552",
                      },
                    },
                    [
                      h(
                        "div",
                        {
                          style: {
                            fontSize: "12px",
                            fontWeight: 600,
                            marginBottom: "8px",
                            color: "#d8b4fe",
                          },
                        },
                        "✦ Premium рефералы"
                      ),
                      h(
                        "div",
                        {
                          style: {
                            fontSize: "11px",
                            color: "#c7ddf5",
                            marginBottom: "4px",
                          },
                        },
                        `Сейчас premium-активных: ${stats.premiumActive || 0}`
                      ),
                      h(
                        "div",
                        {
                          style: { fontSize: "11px", color: "#8ba1bb" },
                        },
                        "Каждый milestone, для которого хватает premium-активных рефералов, даёт x5 награду и скин dark_mode_ide."
                      ),
                      (() => {
                        const nextPremiumMilestone = (
                          stats.milestones || []
                        ).find(
                          (m) =>
                            (stats.premiumActive || 0) < m.milestone
                        );
                        return nextPremiumMilestone
                          ? h(
                              "div",
                              {
                                style: {
                                  marginTop: "6px",
                                  fontSize: "11px",
                                  color: "#d8b4fe",
                                },
                              },
                              `До следующего premium milestone: ${nextPremiumMilestone.milestone - (stats.premiumActive || 0)} premium-активных`
                            )
                          : h(
                              "div",
                              {
                                style: {
                                  marginTop: "6px",
                                  fontSize: "11px",
                                  color: "#4ade80",
                                },
                              },
                              "Все premium milestone уже доступны по количеству premium-активных."
                            );
                      })(),
                    ]
                  ),

                  h(ReferralChainPanel),

                  /* ===== CLAIM MESSAGES ===== */
                  state.claimSuccess &&
                    h(
                      "div",
                      {
                        style: {
                          padding: "8px 10px",
                          borderRadius: "6px",
                          background: "#1a3f25",
                          color: "#4ade80",
                          fontSize: "12px",
                          fontWeight: 600,
                          border: "1px solid #2d5a3e",
                          textAlign: "center",
                        },
                      },
                      state.claimSuccess
                    ),

                  state.claimError &&
                    h(
                      "div",
                      {
                        style: {
                          padding: "8px 10px",
                          borderRadius: "6px",
                          background: "#3f1a1a",
                          color: "#fca5a5",
                          fontSize: "12px",
                          textAlign: "center",
                        },
                      },
                      state.claimError
                    ),

                  /* ===== HOW TO ACTIVATE ===== */
                  h(
                    "div",
                    {
                      style: {
                        background:
                          "linear-gradient(90deg, #1a3a5c, #274267)",
                        borderRadius: "8px",
                        padding: "10px 12px",
                        fontSize: "12px",
                        color: "#c7ddf5",
                      },
                    },
                    [
                      h(
                        "div",
                        {
                          style: {
                            fontWeight: "bold",
                            marginBottom: "2px",
                          },
                        },
                        "💡 Как активировать реферала?"
                      ),
                      h(
                        "div",
                        null,
                        `Приглашённый друг должен набрать минимум ${stats.activeThresholdCommits} коммитов, чтобы считаться активным.`
                      ),
                      h(
                        "div",
                        { style: { marginTop: "4px", color: "#d8b4fe" } },
                        "Если активный реферал имеет Telegram Premium, milestone claim даёт x5 награду и скин dark_mode_ide."
                      ),
                    ]
                  ),
                ]
              ),
      ]
    )
  );
}
