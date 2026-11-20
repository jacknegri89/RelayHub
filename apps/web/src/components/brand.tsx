// The mark is a light cone: an event (the dot) with its past below and its
// future, where deliveries happen, filled above.
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M16 16 L4.5 3.5 H27.5 Z" fill="var(--bone)" />
      <path
        d="M16 16 L5.5 28.5 H26.5 Z"
        fill="none"
        stroke="var(--dust)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle
        cx="16"
        cy="16"
        r="2.6"
        fill="var(--void)"
        stroke="var(--bone)"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function Brand() {
  return (
    <span className="brand">
      <BrandMark />
      <span className="brand-name">RelayHub</span>
    </span>
  );
}
