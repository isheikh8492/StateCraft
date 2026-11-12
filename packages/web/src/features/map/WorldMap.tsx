import type { RegionView } from '@statecraft/protocol';
import { cn } from '@/lib/cn';
import { useGame } from '@/lib/game';
import shapes from './pakistan.json';

const STAGE_FILL: Record<RegionView['stage'], string> = {
  calm: 'fill-good',
  protest: 'fill-accent',
  riot: 'fill-warn',
  insurgency: 'fill-bad',
};
const regions = shapes.regions as Record<string, { d: string; x: number; y: number }>;

/**
 * The map every window floats over. It is drawn only from engine state: who controls each
 * region, whether that control is contested, and how far unrest has gone.
 */
export function WorldMap() {
  const { view, place, setPlace } = useGame();
  const world = view?.world;
  return (
    <div
      className="absolute inset-0 bg-map-water"
      style={{
        backgroundImage:
          'linear-gradient(var(--color-map-line) 1px, transparent 1px), linear-gradient(90deg, var(--color-map-line) 1px, transparent 1px)',
        backgroundSize: '72px 72px',
      }}
    >
      {world && (
        <>
          <svg
            viewBox={`-20 -20 ${shapes.width + 40} ${shapes.height + 40}`}
            role="img"
            aria-label="Map of the country by region"
            className="absolute inset-0 m-auto h-[92%] w-[92%]"
          >
            <defs>
              <pattern
                id="contested"
                width="8"
                height="8"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="8" height="8" className="fill-map-land" />
                <rect width="3" height="8" className="fill-warn/45" />
              </pattern>
              <pattern
                id="occupied"
                width="8"
                height="8"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(-45)"
              >
                <rect width="8" height="8" className="fill-map-land" />
                <rect width="4" height="8" className="fill-bad/55" />
              </pattern>
            </defs>
            {world.regions.map((region) => {
              const shape = regions[region.id];
              if (!shape) return null;
              return (
                // biome-ignore lint/a11y/useSemanticElements: an SVG region cannot be a button element.
                <g
                  key={region.id}
                  role="button"
                  tabIndex={0}
                  data-region={region.id}
                  data-status={region.status}
                  data-stage={region.stage}
                  aria-label={`${region.name}: ${region.status}, ${region.stage}`}
                  aria-pressed={place === region.id}
                  className="cursor-pointer outline-none [&:focus-visible>path]:stroke-accent"
                  onClick={() => setPlace(place === region.id ? null : region.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ')
                      setPlace(place === region.id ? null : region.id);
                  }}
                >
                  <path
                    d={shape.d}
                    fill={region.status === 'held' ? undefined : `url(#${region.status})`}
                    className={cn(
                      'stroke-map-border transition-colors duration-(--duration-fast) hover:stroke-fg-muted',
                      region.status === 'held' && 'fill-map-land',
                      place === region.id && 'stroke-accent stroke-[3]',
                    )}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                  <circle
                    cx={shape.x}
                    cy={shape.y - 16}
                    r={6}
                    className={cn(STAGE_FILL[region.stage], 'stroke-bg')}
                    strokeWidth={2}
                  />
                  <text
                    x={shape.x}
                    y={shape.y + 6}
                    textAnchor="middle"
                    className="pointer-events-none fill-fg-muted text-[15px] font-medium"
                  >
                    {region.name}
                  </text>
                </g>
              );
            })}
          </svg>
          <ul
            aria-label="Map legend"
            className="absolute right-3 bottom-3 flex flex-col gap-1 rounded-control border border-border bg-surface/90 p-2 text-2xs text-fg-muted"
          >
            {(['calm', 'protest', 'riot', 'insurgency'] as const).map((stage) => (
              <li key={stage} className="flex items-center gap-2">
                <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden="true">
                  <circle cx="5" cy="5" r="5" className={STAGE_FILL[stage]} />
                </svg>
                {stage[0]?.toUpperCase()}
                {stage.slice(1)}
              </li>
            ))}
            <li className="mt-1 border-t border-border pt-1">Striped: control contested or lost</li>
          </ul>
        </>
      )}
    </div>
  );
}
