// The way back, at the top left of every screen but the first.

interface Props {
  /** Where it goes: the charts, unless the screen has somewhere nearer to go back to. */
  readonly href?: string;
  /** The word beside the arrow, where there is room for one. */
  readonly label?: string;
  /** What a screen reader says. */
  readonly said?: string;
}

export function Back({ href = "#/", label = "Charts", said = "Back to the charts" }: Props) {
  return (
    <a className="back" href={href} aria-label={said}>
      <svg viewBox="0 0 22 22" aria-hidden="true">
        <path d="M13.5 4.5L7 11l6.5 6.5" />
      </svg>
      <span>{label}</span>
    </a>
  );
}
