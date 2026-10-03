export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-[var(--color-text-muted)]">
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]"
        aria-hidden
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}
