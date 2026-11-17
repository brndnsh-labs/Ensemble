import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { installMotion } from "./motion/moves.ts";
import { MotionCorner } from "./motion/Switchboard.tsx";
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

// The motion study: its motions, and the corner that switches them, outside the app's own tree.
installMotion();
const corner = document.createElement("div");
corner.id = "motion-corner";
document.body.append(corner);
createRoot(corner).render(<MotionCorner />);
