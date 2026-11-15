// The strip under the chart: where the jam is, how it is shaped, and how much
// of it is left.

import type { Plan, PlanBar } from "@ensemble/engine";
import { seconds } from "@ensemble/engine";
import type { Place } from "./jam.ts";

interface Props {
  /** The plan being played, or the one play would start. */
  readonly plan: Plan;
  readonly place: Place | undefined;
  readonly elapsed: number;
  readonly playing: boolean;
  /** The soloist's instrument, when one is in the band. */
  readonly soloist: string | undefined;
}

export const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const passes = (n: number): string => (n === 1 ? "1 pass" : `${n} passes`);

function where(plan: Plan, place: Place | undefined, playing: boolean, elapsed: number): string {
  const bar = place?.bar;
  // Playing with no bar under it: the moment before the count, or the last chord ringing.
  if (!bar && playing) return elapsed > 0 ? "Ending" : "Count-in";
  if (!bar) return plan.open ? "Until you stop it" : passes(plan.passes);
  if (bar.kind === "count-in") return `Count-in ${place.beat + 1}`;
  if (bar.ending || bar.kind === "tail") return "Ending";
  if (bar.lastPass) return "Last pass";
  return plan.open ? `Pass ${bar.pass + 1}` : `Pass ${bar.pass + 1} of ${plan.passes}`;
}

export function StatusStrip({ plan, place, elapsed, playing, soloist }: Props) {
  const bar = place?.bar;
  const length = seconds(plan);
  const last = bar !== undefined && (bar.lastPass || bar.kind === "tail");
  return (
    <div className={`strip${last ? " last" : ""}`}>
      <span className="strip-where" aria-live="polite">
        {where(plan, place, playing, elapsed)}
      </span>
      <Arc plan={plan} at={bar} />
      {soloist !== undefined && playing && (
        <span className={`strip-solo${bar?.solo ? " on" : ""}`}>
          {bar?.solo ? `${soloist} solo` : `${soloist} resting`}
        </span>
      )}
      <span className="strip-time">
        {!playing
          ? plan.open
            ? ""
            : clock(length)
          : plan.open
            ? clock(elapsed)
            : `${clock(Math.max(0, length - elapsed))} left`}
      </span>
    </div>
  );
}

/** The shape of the jam: how hard the band plays in each bar, where the soloist leads, and where it is now. */
function Arc({ plan, at }: { plan: Plan; at: PlanBar | undefined }) {
  const bars = plan.bars.filter((bar) => bar.kind === "music");
  if (bars.length === 0) return <svg className="arc" />;
  const W = 300;
  const H = 24;
  const x = (tick: number) => (tick / plan.ticks) * W;
  const y = (energy: number) => H - 2 - energy * (H - 6);
  const steps = bars
    .map(
      (bar) =>
        `${x(bar.start).toFixed(1)},${y(bar.energy).toFixed(1)} ${x(bar.start + bar.ticks).toFixed(1)},${y(bar.energy).toFixed(1)}`,
    )
    .join(" ");
  const first = bars[0]!;
  const final = bars.at(-1)!;
  const tops = bars.filter((bar) => bar.barInPass === 0 && bar.section.role === "body");
  const lastPass = bars.find((bar) => bar.lastPass);
  return (
    <svg
      className="arc"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="The shape of the jam"
    >
      {lastPass && (
        <rect
          className="arc-last"
          x={x(lastPass.start)}
          y="0"
          width={W - x(lastPass.start)}
          height={H}
        />
      )}
      <polygon
        className="arc-fill"
        points={`${x(first.start)},${H} ${steps} ${x(final.start + final.ticks)},${H}`}
      />
      {tops.map((bar) => (
        <line
          key={bar.index}
          className="arc-top"
          x1={x(bar.start)}
          x2={x(bar.start)}
          y1="0"
          y2={H}
        />
      ))}
      {bars
        .filter((bar) => bar.solo)
        .map((bar) => (
          <line
            key={bar.index}
            className="arc-solo"
            x1={x(bar.start)}
            x2={x(bar.start + bar.ticks)}
            y1="1.5"
            y2="1.5"
          />
        ))}
      {at && (
        <rect
          className="arc-now"
          x={x(at.start)}
          y="0"
          width={Math.max(2, x(at.ticks))}
          height={H}
        />
      )}
    </svg>
  );
}
