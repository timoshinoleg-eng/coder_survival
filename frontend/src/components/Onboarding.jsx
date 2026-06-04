import { h } from "preact";
import { useCallback, useState } from "preact/hooks";
import "./Onboarding.css";

const STEPS = [
  {
    key: "welcome",
    title: "Добро пожаловать",
    subtitle: "Coder Survival",
    description: "Карьерный кликер для программистов. Тапай, пиши код, прокачивайся и выживай в IT.",
    icon: "💻",
  },
  {
    key: "tap",
    title: "Тапай = пиши код",
    subtitle: "Каждый тап — коммит",
    description: "Чем больше тапаешь, тем больше коммитов. Следи за энергией и не выгори.",
    icon: "👆",
    demo: true,
  },
  {
    key: "progression",
    title: "Прокачивайся",
    subtitle: "Карьерная лестница",
    description: "Junior → Middle → Senior → Lead → CTO. Новые ранги = больше коммитов за тап.",
    icon: "🚀",
    ladder: true,
  },
];

const RANKS = ["Junior", "Middle", "Senior", "Lead", "CTO"];

export default function Onboarding({ visible, onComplete, onSkip }) {
  const [step, setStep] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const [fading, setFading] = useState(false);

  const current = STEPS[step];

  const handleNext = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
      setTapCount(0);
    } else {
      setFading(true);
      window.setTimeout(() => {
        localStorage.setItem("cs_onboarding_completed", "1");
        onComplete?.();
      }, 400);
    }
  }, [step, onComplete]);

  const handleSkip = useCallback(() => {
    setFading(true);
    window.setTimeout(() => {
      localStorage.setItem("cs_onboarding_skipped", String(Date.now()));
      onSkip?.();
    }, 400);
  }, [onSkip]);

  const handleDemoTap = useCallback(() => {
    if (tapCount >= 5) return;
    setTapCount((c) => c + 1);
  }, [tapCount]);

  if (!visible) return null;

  return h(
    "div",
    { className: `onboarding ${fading ? "onboarding--fade-out" : ""}` },
    [
      h("div", { className: "onboarding__card" }, [
        // Header
        h("div", { className: "onboarding__header" }, [
          h("div", { className: "onboarding__icon" }, current.icon),
          h("div", { className: "onboarding__titles" }, [
            h("div", { className: "onboarding__title" }, current.title),
            h("div", { className: "onboarding__subtitle" }, current.subtitle),
          ]),
        ]),

        // Step indicator
        h("div", { className: "onboarding__dots" },
          STEPS.map((_, idx) =>
            h("div", {
              key: idx,
              className: `onboarding__dot ${idx === step ? "onboarding__dot--active" : ""}`,
            })
          )
        ),

        // Content
        h("div", { className: "onboarding__content" }, [
          h("p", { className: "onboarding__description" }, current.description),

          // Tap demo for step 2
          current.demo &&
            h("div", { className: "onboarding__demo" }, [
              h("button", {
                type: "button",
                className: "onboarding__demo-btn",
                onClick: handleDemoTap,
              }, [
                h("span", null, "💻 КОДИТЬ"),
                tapCount > 0 && h("span", { className: "onboarding__demo-counter" }, `${tapCount}/5`),
              ]),
              tapCount >= 5 &&
                h("div", { className: "onboarding__demo-done" }, "🔥 Отлично! Код пишется!"),
            ]),

          // Career ladder for step 3
          current.ladder &&
            h("div", { className: "onboarding__ladder" },
              RANKS.map((rank, idx) =>
                h(
                  "div",
                  {
                    key: rank,
                    className: `onboarding__ladder-step ${idx <= step ? "onboarding__ladder-step--active" : ""}`,
                  },
                  [
                    h("div", { className: "onboarding__ladder-rank" }, rank),
                    h("div", { className: "onboarding__ladder-arrow" }, idx < RANKS.length - 1 ? "↓" : "⭐"),
                  ]
                )
              )
            ),
        ]),

        // Actions
        h("div", { className: "onboarding__actions" }, [
          h(
            "button",
            {
              type: "button",
              className: "onboarding__btn onboarding__btn--secondary",
              onClick: handleSkip,
            },
            "Пропустить"
          ),
          h(
            "button",
            {
              type: "button",
              className: "onboarding__btn onboarding__btn--primary",
              onClick: handleNext,
            },
            step < STEPS.length - 1 ? "Далее" : "Начать выживание"
          ),
        ]),
      ]),
    ]
  );
}
