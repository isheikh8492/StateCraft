import type { Health } from '@statecraft/protocol';
import {
  Cpu,
  Globe,
  History,
  Landmark,
  type LucideIcon,
  ScrollText,
  SquarePen,
  Users,
  Wrench,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Chronicle } from '@/features/chronicle/Chronicle';
import { PolicyDesk } from '@/features/desk/PolicyDesk';
import { Inspector } from '@/features/inspector/Inspector';
import { WorldMap } from '@/features/map/WorldMap';
import { ModelPanel } from '@/features/model/ModelPanel';
import { People } from '@/features/people/People';
import { Policies } from '@/features/policies/Policies';
import { StartScreen } from '@/features/start/StartScreen';
import { TimeControl } from '@/features/time/TimeControl';
import { Timeline } from '@/features/timeline/Timeline';
import { Briefing } from '@/features/world/Briefing';
import { api } from '@/lib/api';
import { GameProvider, useGame } from '@/lib/game';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { useWindowLayout, Window, type WindowFrame, type WindowLayout } from '@/ui/window';

const frame = (
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  minimized = false,
): WindowFrame => ({ x, y, w, h, z, minimized, maximized: false });
const DEFAULT_LAYOUT: WindowLayout = {
  desk: frame(16, 16, 400, 540, 3),
  chronicle: frame(432, 16, 560, 300, 2),
  briefing: frame(1064, 16, 360, 600, 1),
  policies: frame(488, 120, 520, 480, 0, true),
  timeline: frame(540, 160, 480, 380, 0, true),
  model: frame(580, 100, 480, 520, 0, true),
  inspector: frame(300, 80, 720, 520, 0, true),
  people: frame(440, 330, 620, 420, 0, true),
};

const WINDOWS: { id: string; title: string; icon: LucideIcon; body: () => ReactNode }[] = [
  { id: 'desk', title: 'Policy desk', icon: SquarePen, body: () => <PolicyDesk /> },
  { id: 'chronicle', title: 'Chronicle', icon: ScrollText, body: () => <Chronicle /> },
  { id: 'briefing', title: 'Briefing', icon: Globe, body: () => <Briefing /> },
  { id: 'policies', title: 'Policies', icon: Landmark, body: () => <Policies /> },
  { id: 'people', title: 'People', icon: Users, body: () => <People /> },
  { id: 'timeline', title: 'Rewind', icon: History, body: () => <Timeline /> },
  { id: 'model', title: 'Model', icon: Cpu, body: () => <ModelPanel /> },
  { id: 'inspector', title: 'Inspector', icon: Wrench, body: () => <Inspector /> },
];

export function Shell() {
  const windows = useWindowLayout(DEFAULT_LAYOUT);
  return (
    <GameProvider onOpenWindow={windows.open}>
      <Desktop windows={windows} />
    </GameProvider>
  );
}

function Desktop({ windows }: { windows: ReturnType<typeof useWindowLayout> }) {
  const { layout, update, focus, open } = windows;
  const { view, error, act } = useGame();
  const [health, setHealth] = useState<Health | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const topZ = Math.max(...Object.values(layout).map((f) => f.z));
  const campaign = view?.campaign ?? null;
  const unread = (view?.cast ?? []).reduce((sum, c) => sum + c.unread, 0);
  const events = health?.events;
  useEffect(() => {
    api.health().then(setHealth, () => setHealth(null));
  }, [view]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-surface px-3">
        <h1 className="text-ui font-semibold tracking-[0.14em] uppercase">
          State<span className="text-accent">Craft</span>
        </h1>
        <nav aria-label="Windows" className="flex items-center gap-0.5">
          {WINDOWS.map(({ id, title, icon: Icon }) =>
            // Tools for setting up and inspecting the game take less room than windows for playing it.
            id === 'model' || id === 'inspector' ? (
              <Button
                key={id}
                variant="ghost"
                size="icon"
                aria-label={title}
                title={title}
                onClick={() => open(id)}
              >
                <Icon />
              </Button>
            ) : (
              <Button key={id} variant="ghost" size="sm" onClick={() => open(id)}>
                <Icon />
                {title}
                {id === 'people' && unread > 0 && <Badge tone="accent">{unread}</Badge>}
              </Button>
            ),
          )}
        </nav>
        <div className="flex-1" />
        {campaign && <TimeControl />}
        {campaign && (
          <p className="flex items-center gap-2 text-xs whitespace-nowrap text-fg-muted">
            <span>
              {campaign.office}, {campaign.title.split(',')[0]}
            </span>
            {campaign.branch > 1 && <Badge tone="accent">Line {campaign.branch}</Badge>}
          </p>
        )}
        {view !== null && events !== undefined && (
          <Badge tone="good" title={health ? `Engine ${health.engineVersion}` : undefined}>
            Connected
          </Badge>
        )}
        {view === null && error === null && <Badge>Connecting</Badge>}
        {view === null && error !== null && (
          <Badge tone="bad" title={error}>
            Server offline
          </Badge>
        )}
        {campaign &&
          (confirmNew ? (
            <>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setConfirmNew(false);
                  void act(() => api.newCampaign());
                }}
              >
                Set this campaign aside
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmNew(false)}>
                Keep playing
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={view?.running != null}
              onClick={() => setConfirmNew(true)}
            >
              New campaign
            </Button>
          ))}
      </header>

      <main data-desktop className="relative min-h-0 flex-1 overflow-hidden">
        <WorldMap />
        {view !== null && campaign === null ? (
          <StartScreen />
        ) : (
          WINDOWS.map(({ id, title, icon, body }) => {
            const f = layout[id];
            if (!f) return null;
            return (
              <Window
                key={id}
                id={id}
                title={title}
                icon={icon}
                frame={f}
                focused={f.z === topZ}
                onChange={update}
                onFocus={focus}
              >
                {body()}
              </Window>
            );
          })
        )}
      </main>
    </div>
  );
}
