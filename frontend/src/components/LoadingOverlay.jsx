import { h } from "preact";

export default function LoadingOverlay({ visible }) {
  if (!visible) return null;

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
        transition: "opacity 150ms step-end",
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
        "ЗАГРУЗКА"
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
