import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { count, countSession, countView } from "./counts.ts";
import { installMotion } from "./motion.ts";
import { keepOffline } from "./offline.ts";
import "./style.css";

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Safari on a phone shows a thing as pressed (`:active`) only on a page that listens for
// touches. Nothing is done with them: the stylesheet answers the press.
document.addEventListener("touchstart", () => {}, { passive: true });

keepOffline();
installMotion();

// Counted as the app opens (`counts.ts`: production only): the screen it opens on, and once what it runs on.
countView();
countSession();
// A page served by one build, taken charge of by the next (the worker takes over as soon as it is
// installed): the app has updated. A page no worker served yet is a first install, not an update.
if (navigator.serviceWorker?.controller) {
  navigator.serviceWorker.addEventListener("controllerchange", () => count("app_updated"), {
    once: true,
  });
}

// The motion study's switches were kept here; the study is over, and the browser need not keep them.
try {
  localStorage.removeItem("ensemble.motion-study.1");
} catch {
  // Storage refused: there is nothing kept to take away.
}
