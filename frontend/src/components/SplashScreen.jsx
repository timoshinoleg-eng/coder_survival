import { h } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import "./SplashScreen.css";

export default function SplashScreen({ onComplete, minDuration = 2500 }) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const progressRef = useRef(0);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    const startTime = Date.now();
    let rafId;
    let progressTimer;

    progressTimer = setInterval(() => {
      setProgress((p) => {
        const next = Math.min(100, p + Math.random() * 15 + 5);
        progressRef.current = next;
        return next;
      });
    }, 200);

    const finish = () => {
      setProgress(100);
      clearInterval(progressTimer);
      setFading(true);
      window.setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, 600);
    };

    const check = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= minDuration && progressRef.current >= 90) {
        finish();
      } else if (elapsed >= minDuration + 800) {
        finish();
      } else {
        rafId = requestAnimationFrame(check);
      }
    };

    rafId = requestAnimationFrame(check);

    return () => {
      clearInterval(progressTimer);
      cancelAnimationFrame(rafId);
    };
  }, [minDuration, onComplete]);

  if (!visible) return null;

  return h(
    "div",
    { className: `splash-screen ${fading ? "splash-screen--fade-out" : ""}` },
    [
      h("div", { className: "splash-screen__content" }, [
        // Logo / Icon
        h("div", { className: "splash-screen__logo" }, [
          h("div", { className: "splash-screen__logo-icon" }, "💻"),
          h("div", { className: "splash-screen__logo-title" }, "CODER"),
          h("div", { className: "splash-screen__logo-subtitle" }, "SURVIVAL"),
        ]),

        // Progress bar
        h("div", { className: "splash-screen__progress" }, [
          h("div", {
            className: "splash-screen__progress-bar",
            style: { width: `${progress}%` },
          }),
        ]),

        h("div", { className: "splash-screen__status" }, [
          h("span", { className: "splash-screen__status-text" }, "Загрузка ассетов"),
          h("span", { className: "splash-screen__status-blink" }, "_"),
        ]),

        h("div", { className: "splash-screen__percent" }, `${Math.round(progress)}%`),
      ]),
    ]
  );
}
