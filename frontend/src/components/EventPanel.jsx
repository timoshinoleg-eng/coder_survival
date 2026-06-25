import { h } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { apiRequest } from "../utils/api.js";
import { useTelegram } from "../hooks/useTelegram.js";
import { useGameState } from "../hooks/useGameState.js";
import { formatRewardPayload } from "../utils/rewardFormatting.js";
import { Analytics } from "../utils/analytics.js";

export default function EventPanel({ open, onClose }) {
  const { initData } = useTelegram();
  const { event, crunchTime, showToast } = useGameState();
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (open && event) {
      try { Analytics.track('event_panel_opened', { eventType: 'hackathon', eventId: event.id || null }); } catch (_) {}
    }
  }, [open, event]);

  const handleClaim = useCallback(async () => {
    if (!event || event.myContribution?.claimed) return;
    setClaiming(true);
    try {
      const payload = await apiRequest("/api/event/claim", {
        method: "POST",
        initData,
      });
      if (payload?.success) {
        showToast("Награда получена!", "success", 2000);
        window.location.reload();
      }
    } catch (err) {
      showToast(err?.message || "Не удалось забрать награду", "error", 2000);
    } finally {
      setClaiming(false);
    }
  }, [event, initData, showToast]);

  if (!open) return null;

  if (!event) {
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
          onClick: (e) => e.stopPropagation(),
          style: {
            width: "min(420px, 100%)",
            background: "#10192d",
            border: "1px solid #274267",
            borderRadius: "8px",
            color: "#e6edf7",
            padding: "14px",
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
              h("strong", null, "⚡ Ивент"),
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
          h(
            "div",
            {
              style: { padding: "14px 0", color: "#9eb6d2", fontSize: "13px" },
            },
            "Сейчас нет активных ивентов.",
          ),
        ],
      ),
    );
  }

  const progress = event.myContribution?.progressPercent || 0;
  const canClaim = progress >= 100 && !event.myContribution?.claimed;

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
        onClick: (e) => e.stopPropagation(),
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
            h("strong", null, "⚡ Ивент"),
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

        h(
          "div",
          {
            style: {
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            },
          },
          [
            h("div", null, [
              h(
                "div",
                {
                  style: {
                    fontSize: "16px",
                    fontWeight: "bold",
                    color: "#facc15",
                    marginBottom: "4px",
                  },
                },
                event.title,
              ),
              h(
                "div",
                { style: { fontSize: "12px", color: "#9eb6d2" } },
                event.description || "Набирай коммиты и получи награду!",
              ),
            ]),

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
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "12px",
                      marginBottom: "6px",
                    },
                  },
                  [
                    h("span", { style: { color: "#8ba1bb" } }, "Прогресс"),
                    h(
                      "span",
                      { style: { color: "#c7ddf5", fontWeight: "bold" } },
                      `${event.myContribution?.commitsContributed || 0} / ${event.targetCommits}`,
                    ),
                  ],
                ),
                h(
                  "div",
                  {
                    style: {
                      flex: 1,
                      height: "10px",
                      background: "#0f3460",
                      borderRadius: "5px",
                      overflow: "hidden",
                    },
                  },
                  h("div", {
                    style: {
                      width: `${Math.min(100, progress)}%`,
                      height: "100%",
                      background: canClaim ? "#4ade80" : "#60a5fa",
                      transition: "width 0.4s ease",
                    },
                  }),
                ),
                h(
                  "div",
                  {
                    style: {
                      textAlign: "right",
                      fontSize: "11px",
                      color: "#8ba1bb",
                      marginTop: "4px",
                    },
                  },
                  `${Math.round(progress)}%`,
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
                  border: "1px solid #1f3552",
                },
              },
              [
                h(
                  "div",
                  {
                    style: {
                      fontSize: "12px",
                      color: "#8ba1bb",
                      marginBottom: "4px",
                    },
                  },
                  "Награда за завершение",
                ),
                h(
                  "div",
                  { style: { fontSize: "13px", color: "#c7ddf5" } },
                  formatRewardPayload(event.rewardPayload),
                ),
              ],
            ),

            crunchTime?.active &&
              h(
                "div",
                {
                  style: {
                    background: "linear-gradient(90deg, #5a2d1a, #7c3b1c)",
                    borderRadius: "8px",
                    padding: "12px",
                    border: "1px solid rgba(250, 204, 21, 0.25)",
                  },
                },
                [
                  h(
                    "div",
                    {
                      style: {
                        fontSize: "12px",
                        color: "#fde68a",
                        marginBottom: "4px",
                        fontWeight: "bold",
                      },
                    },
                    "🔥 Crunch Time rules",
                  ),
                  h(
                    "div",
                    { style: { fontSize: "12px", color: "#fce7c3" } },
                    `${crunchTime.commitMultiplier || 2}x коммиты, ${crunchTime.depressionMultiplier || 1.5}x стресс до ${crunchTime.endsAt || crunchTime.endDate || "конца события"}`,
                  ),
                ],
              ),

            canClaim
              ? h(
                  "button",
                  {
                    onClick: handleClaim,
                    disabled: claiming,
                    style: {
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      border: "none",
                      background: claiming ? "#274267" : "#4ade80",
                      color: claiming ? "#8ba1bb" : "#0a1f12",
                      fontWeight: "bold",
                      fontSize: "14px",
                      cursor: claiming ? "not-allowed" : "pointer",
                    },
                  },
                  claiming ? "..." : "Забрать награду",
                )
              : event.myContribution?.claimed
                ? h(
                    "div",
                    {
                      style: {
                        textAlign: "center",
                        color: "#4ade80",
                        fontSize: "13px",
                        fontWeight: "bold",
                      },
                    },
                    "✅ Награда получена",
                  )
                : h(
                    "div",
                    {
                      style: {
                        textAlign: "center",
                        color: "#8ba1bb",
                        fontSize: "12px",
                      },
                    },
                    "Продолжай кодить, чтобы достичь цели!",
                  ),
          ],
        ),
      ],
    ),
  );
}
