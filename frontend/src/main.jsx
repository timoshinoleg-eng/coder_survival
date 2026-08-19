import { h, render } from "preact";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./assets/pixel-theme.css";
import "./tokens.css";
import "./assets/animations.css";
import "./assets/visual-system-v2.css";

const appElement = document.getElementById("app");
const bootFallback = document.getElementById("boot-fallback");

render(
  h(ErrorBoundary, null, h(App)),
  appElement,
);
bootFallback?.remove();
