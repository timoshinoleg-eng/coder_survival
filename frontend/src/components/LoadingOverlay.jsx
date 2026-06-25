import { h } from "preact";

export default function LoadingOverlay({ visible, isError, errorMessage }) {
  if (!visible) return null;

  // Error screen with retry button
  if (isError) {
    return h(
      "div",
      {
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "var(--bg-primary)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          gap: "var(--space-4)",
          padding: "24px",
        },
      },
      [
        h("div", {
          style: {
            fontSize: "48px",
            marginBottom: "var(--space-2)",
          },
        }, "\u{1F4BB}"),
        h(
          "div",
          {
            style: {
          fontFamily: "'Courier New', monospace",
          fontSize: "var(--text-lg)",
          color: "var(--danger)",
          textAlign: "center",
          lineHeight: "1.5",
          textShadow: "var(--shadow-text)",
            },
          },
          errorMessage || "\u0421\u0435\u0440\u0432\u0435\u0440 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D"
        ),
        h(
          "button",
          {
            onClick: () => window.location.reload(),
            style: {
              marginTop: "16px",
              padding: "10px 24px",
              fontFamily: "'Courier New', monospace",
              fontSize: "var(--text-md)",
              color: "var(--text-primary)",
              background: "var(--border-panel)",
              border: "1px solid #475569",
              borderRadius: "4px",
              cursor: "pointer",
            },
          },
          "\u041F\u043E\u043F\u0440\u043E\u0431\u043E\u0432\u0430\u0442\u044C \u0441\u043D\u043E\u0432\u0430"
        ),
      ]
    );
  }

  // Standard loading screen
  return h(
    "div",
    {
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "var(--bg-primary)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        pointerEvents: "none",
      },
    },
    [
      h(
        "div",
        {
          style: {
            fontFamily: "var(--font-pixel)",
            fontSize: "var(--text-lg)",
            color: "var(--text-primary)",
            textShadow: "var(--shadow-text)",
            letterSpacing: "2px",
          },
        },
        "\u0417\u0410\u0413\u0420\u0423\u0417\u041A\u0410"
      ),
      h(
        "span",
        {
          style: {
            fontFamily: "var(--font-pixel)",
            fontSize: "var(--text-lg)",
            color: "var(--text-primary)",
            textShadow: "var(--shadow-text)",
            animation: "pixel-blink 800ms step-end infinite",
            marginTop: "var(--space-2)",
          },
        },
        "_"
      ),
    ]
  );
}
