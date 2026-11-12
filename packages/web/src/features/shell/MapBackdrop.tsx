/** Stands in for the live map until it is built: a quiet graticule so windows have a ground. */
export function MapBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 bg-map-water"
      style={{
        backgroundImage:
          'linear-gradient(var(--color-map-line) 1px, transparent 1px), linear-gradient(90deg, var(--color-map-line) 1px, transparent 1px)',
        backgroundSize: '72px 72px',
      }}
    >
      <p className="label-caps absolute right-3 bottom-3 text-fg-subtle">Map layer not built yet</p>
    </div>
  );
}
