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
          background: "#1a1a2e",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          gap: "16px",
          padding: "24px",
        },
      },
      [
        h("div", {
          style: {
            fontSize: "48px",
            marginBottom: "8px",
          },
        }, "\u{1F4BB}"),
        h(
          "div",
          {
            style: {
              fontFamily: "'Courier New', monospace",
              fontSize: "14px",
              color: "#ef4444",
              textAlign: "center",
              lineHeight: "1.5",
              textShadow: "1px 1px 0 #0f172a",
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
              fontSize: "13px",
              color: "#e2e8f0",
              background: "#334155",
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
        background: "#1a1a2e",
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
            fontFamily: "'Press Start 2P', 'Courier New', monospace",
            fontSize: "14px",
            color: "#e2e8f0",
            textShadow: "2px 2px 0 #0f172a",
            letterSpacing: "2px",
          },
        },
        "\u0417\u0410\u0413\u0420\u0423\u0417\u041A\u0410"
      ),
      h(
        "span",
        {
          style: {
            fontFamily: "'Press Start 2P', 'Courier New', monospace",
            fontSize: "14px",
            color: "#e2e8f0",
            textShadow: "2px 2px 0 #0f172a",
            animation: "pixel-blink 800ms step-end infinite",
            marginTop: "8px",
          },
        },
        "_"
      ),
    ]
  );
}
