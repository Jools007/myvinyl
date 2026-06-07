interface MyVinylBrandMarkProps {
  className?: string;
  size?: number;
}

/** Minimal vinyl disc — keep in sync with /public/favicon.svg (fixed colours there). */
export function MyVinylBrandMark({ className = '', size = 36 }: MyVinylBrandMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle className="mv-disc" cx="16" cy="16" r="15" />
      <circle className="mv-disc-ring" cx="16" cy="16" r="15" />
      <circle className="mv-groove" cx="16" cy="16" r="11.5" />
      <circle className="mv-label" cx="16" cy="16" r="5.25" />
      <circle className="mv-spindle" cx="16" cy="16" r="1" />
    </svg>
  );
}