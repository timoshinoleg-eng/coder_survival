import { h } from "preact";
import { useEffect, useState, useCallback } from "preact/hooks";
import { apiRequest } from "../utils/api.js";
import { useTelegram } from "../hooks/useTelegram.js";
import { formatRewardPayload } from "../utils/rewardFormatting.js";
import ReferralChainPanel from "./ReferralChainPanel.jsx";

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
    error: null,
    copied: false,
    claimLoading: null,
    claimError: null,
    claimSuccess: null,
  });

  const loadData = useCallback(async () => {
    const statusPayload = await apiRequest("/api/referral/status", { initData });
    setState((s) => ({
      ...s,
      loading: false,
      referralCode: statusPayload?.referralCode || "",
      referralLink: statusPayload?.referralLink || "",
      stats: {
        total: statusPayload?.total ?? 0,
        active: statusPayload?.active ?? 0,
        nextMilestone: statusPayload?.nextMilestone ?? null,
        milestones: statusPayload?.milestones || [],
        claimedMilestones: statusPayload?.milestones?.filter((m) => m.claimed).map((m) => m.milestone) || [],
        referred: statusPayload?.referred || [],
        antiFarmDays: statusPayload?.antiFarmDays || 2,
      },
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
        setTimeout(() => setState((s) => ({ ...s, copied: false })), 1500);
      })
      .catch(() => {
        const ta = document.createElement("textarea");
        ta.value = state.referralLink;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setState((s) => ({ ...s, copied: true }));
        setTimeout(() => setState((s) => ({ ...s, copied: false })), 1500);
      });
  }, [state.referralLink]);

  const handleShare = useCallback(() => {
    if (!state.referralLink) return;
    shareUrl(
      state.referralLink,
      "Я выживаю в IT. Присоединяйся, вместе страдать веселее!",
    );
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
          const reward = payload.reward || {};
          const parts = [];
          if (reward.commits) parts.push(`+${reward.commits} коммитов`);
          if (reward.energy) parts.push(`+${reward.energy} энергии`);
          if (reward.stars) parts.push(`+${reward.stars} Stars`);
          if (reward.skin) parts.push('скин Team Lead');
          setState((s) => ({
            ...s,
            claimSuccess: parts.join(' · ') || 'Награда получена!',
            claimLoading: null,
          }));
          await loadData();
          setTimeout(
            () => setState((s) => ({ ...s, claimSuccess: null })),
            3000,
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
    [initData, loadData],
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
              "×",
            ),
          ],
        ),

        state.loading
          ? h(
              "div",
              { style: { padding: "14px", color: "#9eb6d2" } },
              "Загрузка...",
            )
          : state.error
            ? h(
                "div",
                { style: { padding: "14px", color: "#fda4af" } },
                state.error,
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
                  // Referral code + link
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
                            fontSize: "11px",
                            color: "#8ba1bb",
                            marginBottom: "6px",
                          },
                        },
                        "Твоя реферальная ссылка",
                      ),
                      h(
                        "div",
                        {
                          style: {
                            fontSize: "11px",
                            color: "#60a5fa",
                            marginBottom: "6px",
                          },
                        },
                        "Твой друг получит +100 коммитов и эспрессо, когда наберёт 20 коммитов за 2 дня",
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
                            fontSize: "13px",
                            wordBreak: "break-all",
                          },
                        },
                        [
                          h(
                            "span",
                            { style: { flex: 1, color: "#c7ddf5" } },
                            state.referralLink || "—",
                          ),
                          h(
                            "button",
                            {
                              onClick: handleCopy,
                              style: {
                                padding: "5px 10px",
                                borderRadius: "6px",
                                border: "none",
                                background: state.copied
                                  ? "#1a3f25"
                                  : "#1a3a5c",
                                color: state.copied ? "#4ade80" : "#dce9f9",
                                fontWeight: "bold",
                                fontSize: "11px",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                              },
                            },
                            state.copied ? "Скопировано!" : "Копировать",
                          ),
                        ],
                      ),
                      h(
                        "button",
                        {
                          onClick: handleShare,
                          style: {
                            marginTop: "8px",
                            width: "100%",
                            padding: "6px 0",
                            borderRadius: "6px",
                            border: "none",
                            background: "#274267",
                            color: "#dce9f9",
                            fontWeight: 600,
                            fontSize: "12px",
                            cursor: "pointer",
                          },
                        },
                        "🔗 Поделиться в Telegram",
                      ),
                    ],
                  ),

                  // Stats
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
                            stats.total,
                          ),
                          h(
                            "div",
                            { style: { fontSize: "11px", color: "#8ba1bb" } },
                            "Всего приглашено",
                          ),
                        ],
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
                            stats.active,
                          ),
                          h(
                            "div",
                            { style: { fontSize: "11px", color: "#8ba1bb" } },
                            "Активных",
                          ),
                        ],
                      ),
                    ],
                  ),

                  // Referred list with anti-farm status
                  stats.referred && stats.referred.length > 0 &&
                    h(
                      "div",
                      {
                        style: {
                          background: "#131d33",
                          borderRadius: "8px",
                          padding: "12px",
                          border: "1px solid #1f3552",
                          marginBottom: "10px",
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
                          "👥 Приглашённые",
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
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  padding: "6px 8px",
                                  borderRadius: "6px",
                                  background: r.isActive ? "#1a3f25" : "#0f1b30",
                                  border: r.isActive ? "1px solid #2d5a3e" : "1px solid #1f3552",
                                },
                              },
                              [
                                h("span", { style: { fontSize: "12px", color: "#c7ddf5" } }, r.username || "Аноним"),
                                h("span", { style: { fontSize: "11px", color: r.isActive ? "#4ade80" : "#8ba1bb" } },
                                  r.isActive ? "✅ Активен" : r.antiFarmStatus || `${r.commitsTotal}/${stats.activeThresholdCommits || 20} коммитов`
                                ),
                              ]
                            )
                          )
                        ),
                      ]
                    ),

                  // Milestones
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
                          "🎯 Прогресс",
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
                          stats.milestones.map((m) => {
                            const canClaim = m.reached && !m.claimed;
                            const rewardLabel = formatRewardPayload(m.reward);
                            return h(
                              "div",
                              {
                                key: m.target,
                                style: {
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "6px 8px",
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
                                h("div", null, [
                                  h(
                                    "span",
                                    {
                                      style: {
                                        fontSize: "12px",
                                        color: m.claimed
                                          ? "#4ade80"
                                          : "#c7ddf5",
                                      },
                                    },
                                    `${m.target} активных рефералов`,
                                  ),
                                  h(
                                    "span",
                                    {
                                      style: {
                                        fontSize: "11px",
                                        color: "#8ba1bb",
                                        marginLeft: "6px",
                                      },
                                    },
                                    rewardLabel,
                                  ),
                                ]),
                                canClaim
                                  ? h(
                                      "button",
                                      {
                                        onClick: () =>
                                          handleClaimMilestone(m.target),
                                        disabled:
                                          state.claimLoading === m.target,
                                        style: {
                                          padding: "4px 8px",
                                          borderRadius: "6px",
                                          border: "none",
                                          background:
                                            state.claimLoading === m.target
                                              ? "#274267"
                                              : "#4ade80",
                                          color:
                                            state.claimLoading === m.target
                                              ? "#8ba1bb"
                                              : "#0a1f12",
                                          fontWeight: "bold",
                                          fontSize: "11px",
                                          cursor:
                                            state.claimLoading === m.target
                                              ? "not-allowed"
                                              : "pointer",
                                        },
                                      },
                                      state.claimLoading === m.target
                                        ? "..."
                                        : "Забрать",
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
                                      m.claimed ? "✅" : "⏳",
                                    ),
                              ],
                            );
                          }),
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
                              },
                            },
                            `До следующей цели: ${stats.nextMilestone - stats.active} активных`,
                          ),
                      ],
                    ),

                  h(ReferralChainPanel),

                  // Claim messages
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
                      state.claimSuccess,
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
                      state.claimError,
                    ),

                  h(
                    "div",
                    {
                      style: {
                        background: "linear-gradient(90deg, #1a3a5c, #274267)",
                        borderRadius: "8px",
                        padding: "10px 12px",
                        fontSize: "12px",
                        color: "#c7ddf5",
                      },
                    },
                    [
                      h(
                        "div",
                        { style: { fontWeight: "bold", marginBottom: "2px" } },
                        "💡 Как активировать реферала?",
                      ),
                      h(
                        "div",
                        null,
                        `Приглашённый друг должен набрать минимум ${stats.activeThresholdCommits} коммитов, чтобы считаться активным.`,
                      ),
                    ],
                  ),
                ],
              ),
      ],
    ),
  );
}
