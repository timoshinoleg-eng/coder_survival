import { h } from "preact";
import { useEffect, useState, useCallback } from "preact/hooks";
import { apiRequest } from "../utils/api.js";
import { useTelegram } from "../hooks/useTelegram.js";

const LANGUAGE_META = {
  python: { icon: "🐍", color: "#4ade80" },
  javascript: { icon: "📜", color: "#facc15" },
  rust: { icon: "🦀", color: "#f87171" },
  go: { icon: "🐹", color: "#60a5fa" },
};

export default function LanguageSelector({ open, onClose }) {
  const { initData } = useTelegram();
  const [languages, setLanguages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [equipping, setEquipping] = useState(null);

  const fetchLanguages = useCallback(async () => {
    try {
      setLoading(true);
      const payload = await apiRequest("/api/languages", { initData });
      setLanguages(payload?.languages || []);
    } catch (_err) {
      // silent
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    if (open) fetchLanguages();
  }, [open, fetchLanguages]);

  const handleEquip = async (slug) => {
    if (equipping) return;
    setEquipping(slug);
    try {
      const payload = await apiRequest("/api/languages/equip", {
        method: "POST",
        initData,
        body: { languageSlug: slug },
      });
      if (payload?.success) {
        setLanguages((prev) =>
          prev.map((lang) => ({
            ...lang,
            isActive: lang.slug === slug,
          }))
        );
        window.dispatchEvent(new CustomEvent("language-equipped", { detail: payload }));
      }
    } catch (_err) {
      // silent
    } finally {
      setEquipping(null);
    }
  };

  if (!open) return null;

  return h(
    "div",
    {
      style: {
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      },
      onClick: (e) => {
        if (e.target === e.currentTarget) onClose();
      },
    },
    h(
      "div",
      {
        className: "pixel-panel",
        style: {
          width: "100%",
          maxWidth: "380px",
          maxHeight: "80vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
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
            h("h3", { style: { margin: 0, fontSize: "14px", color: "#e0e0e0" } }, "Языки программирования"),
            h(
              "button",
              {
                onClick: onClose,
                style: {
                  background: "transparent",
                  border: "none",
                  color: "#8ba1bb",
                  fontSize: "16px",
                  cursor: "pointer",
                },
              },
              "✕"
            ),
          ]
        ),
        loading && h("div", { style: { fontSize: "12px", color: "#8ba1bb", textAlign: "center" } }, "Загрузка..."),
        languages.map((lang) => {
          const meta = LANGUAGE_META[lang.slug] || { icon: "💻", color: "#8ba1bb" };
          const locked = !lang.unlocked;
          const active = lang.isActive;
          return h(
            "div",
            {
              key: lang.slug,
              style: {
                border: `1px solid ${active ? meta.color : "#17304f"}`,
                borderRadius: "8px",
                padding: "12px",
                background: active ? `${meta.color}11` : "#0d1f35",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                opacity: locked ? 0.65 : 1,
              },
            },
            [
              h(
                "div",
                { style: { display: "flex", alignItems: "center", gap: "10px" } },
                [
                  h("span", { style: { fontSize: "22px" } }, meta.icon),
                  h(
                    "div",
                    { style: { flex: 1 } },
                    [
                      h(
                        "div",
                        { style: { fontSize: "13px", fontWeight: "bold", color: active ? meta.color : "#e0e0e0" } },
                        [
                          lang.display_name || lang.name,
                          locked && h("span", { style: { marginLeft: "6px", fontSize: "11px", color: "#8ba1bb" } }, "🔒"),
                        ]
                      ),
                      h(
                        "div",
                        { style: { fontSize: "11px", color: "#8ba1bb", marginTop: "2px" } },
                        locked
                          ? `Разблокируется на уровне ${lang.unlock_level}`
                          : lang.description
                      ),
                    ]
                  ),
                ]
              ),
              !locked &&
                h(
                  "div",
                  { style: { display: "flex", gap: "8px", alignItems: "center" } },
                  [
                    h(
                      "button",
                      {
                        onClick: () => handleEquip(lang.slug),
                        disabled: equipping === lang.slug || active,
                        className: "pixel-button",
                        style: {
                          flex: 1,
                          fontSize: "11px",
                          padding: "6px 10px",
                          background: active ? `${meta.color}22` : "#122642",
                          borderColor: active ? meta.color : "#30527e",
                          color: active ? meta.color : "#dce9f9",
                          cursor: active ? "default" : "pointer",
                        },
                      },
                      active ? "Экипировано" : equipping === lang.slug ? "..." : "Экипировать"
                    ),
                  ]
                ),
              active &&
                h(
                  "div",
                  {
                    style: {
                      fontSize: "10px",
                      color: meta.color,
                      padding: "4px 8px",
                      background: `${meta.color}15`,
                      borderRadius: "4px",
                      textAlign: "center",
                    },
                  },
                  "Активный язык — пассивный эффект применяется"
                ),
              active &&
                h(
                  "div",
                  {
                    style: {
                      fontSize: "10px",
                      color: "#8ba1bb",
                      textAlign: "center",
                      padding: "4px",
                      border: `1px dashed ${meta.color}44`,
                      borderRadius: "4px",
                    },
                  },
                  `IDE Theme Preview: ${lang.theme_color || meta.color}`
                ),
            ]
          );
        }),
      ]
    )
  );
}
