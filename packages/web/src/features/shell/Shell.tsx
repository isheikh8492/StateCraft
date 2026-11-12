import { type LucideIcon, ScrollText, SquarePen } from 'lucide-react';
import { useState } from 'react';
import { Chronicle } from '@/features/chronicle/Chronicle';
import { PolicyDesk } from '@/features/desk/PolicyDesk';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { useWindowLayout, Window, type WindowLayout } from '@/ui/window';
import { MapBackdrop } from './MapBackdrop';
import { useHealth } from './useHealth';

const DEFAULT_LAYOUT: WindowLayout = {
  desk: { x: 24, y: 24, w: 440, h: 520, z: 2, minimized: false, maximized: false },
  chronicle: { x: 488, y: 24, w: 520, h: 360, z: 1, minimized: false, maximized: false },
};

const WINDOWS: { id: string; title: string; icon: LucideIcon }[] = [
  { id: 'desk', title: 'Policy desk', icon: SquarePen },
  { id: 'chronicle', title: 'Chronicle', icon: ScrollText },
];

export function Shell() {
  const { layout, update, focus, open } = useWindowLayout(DEFAULT_LAYOUT);
  const [changes, setChanges] = useState(0);
  const status = useHealth(changes);
  const topZ = Math.max(...Object.values(layout).map((frame) => frame.z));

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
        <h1 className="text-ui font-semibold tracking-[0.14em] uppercase">
          State<span className="text-accent">Craft</span>
        </h1>
        <nav aria-label="Windows" className="flex items-center gap-1">
          {WINDOWS.map(({ id, title, icon: Icon }) => (
            <Button key={id} variant="ghost" size="sm" onClick={() => open(id)}>
              <Icon />
              {title}
            </Button>
          ))}
        </nav>
        <div className="flex-1" />
        {status.state === 'connected' && (
          <Badge tone="good" title={`Engine ${status.health.engineVersion}`}>
            Connected
            <span className="tabular text-fg-muted">
              {status.health.events} {status.health.events === 1 ? 'event' : 'events'}
            </span>
          </Badge>
        )}
        {status.state === 'checking' && <Badge>Connecting</Badge>}
        {status.state === 'offline' && (
          <Badge tone="bad" title={status.message}>
            Server offline
          </Badge>
        )}
        <a
          href="#gallery"
          className="rounded-control px-2 py-1 text-xs text-fg-muted hover:bg-raised hover:text-fg"
        >
          Component gallery
        </a>
      </header>

      <main data-desktop className="relative min-h-0 flex-1 overflow-hidden">
        <MapBackdrop />
        {WINDOWS.map(({ id, title, icon }) => {
          const frame = layout[id];
          if (!frame) return null;
          return (
            <Window
              key={id}
              id={id}
              title={title}
              icon={icon}
              frame={frame}
              focused={frame.z === topZ}
              onChange={update}
              onFocus={focus}
            >
              {id === 'desk' ? (
                <PolicyDesk onChanged={() => setChanges((n) => n + 1)} />
              ) : (
                <Chronicle />
              )}
            </Window>
          );
        })}
      </main>
    </div>
  );
}
