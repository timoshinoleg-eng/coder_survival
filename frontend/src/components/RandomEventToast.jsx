import { h } from "preact";
import { useEffect, useState, useCallback } from "preact/hooks";

export default function RandomEventToast({ event, onChoice }) {
  const [timeLeft, setTimeLeft] = useState(100);

  useEffect(() => {
    if (!event) return;
    setTimeLeft(100);
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        const next = prev - (100 / 15); // 15 seconds total
        return next <= 0 ? 0 : next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [event?.eventId]);

  useEffect(() => {
    if (timeLeft <= 0 && event) {
      onChoice(event.eventId, 'ignore', event.options.ignore);
    }
  }, [timeLeft, event, onChoice]);

  const handleSolve = useCallback(() => {
    if (!event) return;
    onChoice(event.eventId, 'solve', event.options.solve);
  }, [event, onChoice]);

  const handleIgnore = useCallback(() => {
    if (!event) return;
    onChoice(event.eventId, 'ignore', event.options.ignore);
  }, [event, onChoice]);

  if (!event) return null;

  return h(
    "div",
    {
      className: "pixel-toast",
      style: {
        position: "fixed",
        top: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "90vw",
        maxWidth: "420px",
        zIndex: 200,
        animation: "pixel-fade-in 150ms step-end forwards",
      },
    },
    [
      // Title
      h(
        "div",
        {
          style: {
            fontFamily: "'Press Start 2P', 'Courier New', monospace",
            fontSize: "11px",
            color: "#fbbf24",
            textTransform: "uppercase",
            marginBottom: "8px",
            textShadow: "2px 2px 0 #0f172a",
          },
        },
        event.title
      ),

      // Description
      h(
        "div",
        {
          style: {
            fontFamily: "'Press Start 2P', 'Courier New', monospace",
            fontSize: "9px",
            color: "#e2e8f0",
            lineHeight: 1.5,
            marginBottom: "12px",
            textShadow: "2px 2px 0 #0f172a",
          },
        },
        event.description
      ),

      // Timer bar
      h(
        "div",
        {
          style: {
            width: "100%",
            height: "2px",
            background: "#0f3460",
            marginBottom: "12px",
            overflow: "hidden",
          },
        },
        h("div", {
          style: {
            width: `${timeLeft}%`,
            height: "100%",
            background: "#fbbf24",
            transition: "width 1s linear",
          },
        })
      ),

      // Buttons
      h(
        "div",
        {
          style: {
            display: "flex",
            gap: "8px",
            justifyContent: "stretch",
          },
        },
        [
          h(
            "button",
            {
              className: "pixel-button",
              onClick: handleSolve,
              style: { flex: 1 },
            },
            event.options.solve.label
          ),
          h(
            "button",
            {
              className: "pixel-button pixel-button--danger",
              onClick: handleIgnore,
              style: { flex: 1 },
            },
            event.options.ignore.label
          ),
        ]
      ),
    ]
  );
}
