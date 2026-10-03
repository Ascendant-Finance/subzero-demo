/** Original geometric mark. No third party logo (spec section 8.1). */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Stacks">
      <rect x="2" y="2" width="20" height="20" rx="5" fill="var(--color-accent)" />
      <rect x="6" y="6" width="4.5" height="12" rx="1.5" fill="#ffffff" opacity="0.95" />
      <rect x="13.5" y="6" width="4.5" height="7" rx="1.5" fill="#ffffff" opacity="0.75" />
    </svg>
  );
}
