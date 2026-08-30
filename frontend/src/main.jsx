import { h, render } from "preact";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./assets/pixel-theme.css";
import "./tokens.css";
import "./assets/animations.css";
import "./assets/visual-system-v2.css";

const appElement = document.getElementById("app");

// Remove the static boot placeholder BEFORE Preact mounts. Preact 10 recycles
// existing DOM children during initial mount, so if #boot-fallback is still
// present it is adopted as the app root element (and gets id="app" from
// App.jsx), producing a duplicate nested #app and making the post-render
// remove() delete the whole application tree.
document.getElementById("boot-fallback")?.remove();

render(
  h(ErrorBoundary, null, h(App)),
  appElement,
);
