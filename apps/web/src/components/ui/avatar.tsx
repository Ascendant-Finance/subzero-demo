const PALETTE = ['#2563eb', '#22a06b', '#c377e0', '#ff9f1a', '#eb5a46', '#0079bf'];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function colorFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function Avatar({
  name,
  avatarUrl,
  size = 28,
  title,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  title?: string;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        title={title ?? name}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      title={title ?? name}
      aria-label={name}
      className="inline-flex items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: colorFor(name),
        fontSize: Math.max(10, size * 0.4),
      }}
    >
      {initials(name)}
    </span>
  );
}
