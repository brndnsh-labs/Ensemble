// The study's own furniture: a switch for each motion, all on or all off, and
// the speed. Reached from a small control in the screen's top right corner on
// every screen, and at `#/motion`.

import { useState } from "react";
import { Sheet } from "../play/Sheet.tsx";
import { Trail } from "../Trail.tsx";
import type { Speed } from "./switches.ts";
import { allSwitched, MOTIONS, reduced, setSwitches, useSwitches } from "./switches.ts";

const SPEEDS: readonly { readonly speed: Speed; readonly name: string }[] = [
  { speed: 1, name: "As specified" },
  { speed: 0.5, name: "Half the time" },
  { speed: 1.5, name: "1½ times" },
];

function Switches() {
  const state = useSwitches();
  return (
    <div className="motion-board">
      {reduced() && (
        <p className="motion-note">
          This device asks for less movement: nothing moves, whatever is switched on. The pivot and
          the titles, being layout, stay.
        </p>
      )}
      <div className="motion-all">
        <button
          type="button"
          className="act"
          onClick={() => setSwitches({ ...state, on: allSwitched(true) })}
        >
          All on
        </button>
        <button
          type="button"
          className="act"
          onClick={() => setSwitches({ ...state, on: allSwitched(false) })}
        >
          All off
        </button>
      </div>
      <ul className="motion-list">
        {MOTIONS.map(({ id, name, says }, index) => (
          <li key={id}>
            <button
              type="button"
              className="motion-switch"
              aria-pressed={state.on[id]}
              onClick={() => setSwitches({ ...state, on: { ...state.on, [id]: !state.on[id] } })}
            >
              <span className="motion-name">
                {index + 1}. {name}
              </span>
              <small className="motion-says">{says}</small>
              <span className="motion-state" aria-hidden="true">
                {state.on[id] ? "On" : "Off"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="motion-label" id="motion-speed">
        Speed
      </p>
      <fieldset className="motion-speeds" aria-labelledby="motion-speed">
        {SPEEDS.map(({ speed, name }) => (
          <button
            key={speed}
            type="button"
            className="act"
            aria-pressed={state.speed === speed}
            onClick={() => setSwitches({ ...state, speed })}
          >
            {name}
          </button>
        ))}
      </fieldset>
    </div>
  );
}

/** The corner control, on every screen, and the switchboard it opens. */
export function MotionCorner() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="motion-corner"
        aria-label="Motion study"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        M
      </button>
      <Sheet open={open} close={() => setOpen(false)} title="Motion study" kind="motion-sheet">
        <Switches />
      </Sheet>
    </>
  );
}

/** The switchboard as a page of its own, at `#/motion`. */
export function MotionPage() {
  return (
    <div className="motion-page">
      <Trail />
      <h1>Motion study</h1>
      <Switches />
    </div>
  );
}
