import { h, render } from "preact";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./assets/pixel-theme.css";

render(
  h(ErrorBoundary, null, h(App)),
  document.getElementById("app"),
);
