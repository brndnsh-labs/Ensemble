import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
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
