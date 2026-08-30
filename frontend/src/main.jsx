import { h, render } from "preact";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./assets/pixel-theme.css";
import "./tokens.css";
import "./assets/animations.css";
import "./assets/visual-system-v2.css";

const appElement = document.getElementById("app");
const bootFallback = document.getElementById("boot-fallback");

// Remove the static boot placeholder BEFORE Preact mounts. Preact 10 recycles
// existing DOM children during initial mount, so if #boot-fallback is still
// present it is adopted as the app root element (and gets id="app" from
// App.jsx), producing a duplicate nested #app and making the post-render
// remove() delete the whole application tree.
bootFallback?.remove();

render(
  h(ErrorBoundary, null, h(App)),
  appElement,
);

// Safety net. If the mount produced no elements at all, put the placeholder
// back so the WebView shows a retry path instead of a permanent blank screen.
// Safe because the removal above already guaranteed Preact created its own
// root node, so this cannot delete a live tree.
if (bootFallback && appElement.childElementCount === 0) {
  appElement.appendChild(bootFallback);
}
