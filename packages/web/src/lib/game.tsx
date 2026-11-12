import type { Moment, View, WorldView } from '@statecraft/protocol';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api } from './api';

interface Game {
  view: View | null;
  /** A problem reaching the server, or the reason the last action was refused. */
  error: string | null;
  /** Run an action, then refresh. The screen never waits on a model: actions return at once. */
  act: (action: () => Promise<unknown>) => Promise<boolean>;
  clearError: () => void;
  /** The region picked in the chronicle or on the map. */
  place: string | null;
  setPlace: (id: string | null) => void;
  /** The policy whose page is open. */
  policy: string | null;
  openPolicy: (id: string | null) => void;
  /** Whether the panel for moving time forward is open. */
  timeOpen: boolean;
  setTimeOpen: (open: boolean) => void;
  openWindow: (id: string) => void;
  /** The past turn being looked at, if any. Looking back changes nothing. */
  moment: Moment | null;
  lookAt: (turnId: string | null) => void;
  /** The world to draw: as it was at the moment being looked at, otherwise as it is now. */
  world: WorldView | null;
}

const GameContext = createContext<Game | null>(null);

/** Keeps one copy of the game's state on screen, refreshed quickly while a resolution runs. */
export function GameProvider({
  children,
  onOpenWindow,
}: {
  children: ReactNode;
  onOpenWindow?: (id: string) => void;
}) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [policy, setPolicy] = useState<string | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const [moment, setMoment] = useState<Moment | null>(null);
  const busy =
    view?.running != null ||
    view?.arriving.reactions === true ||
    (view?.arriving.entries.length ?? 0) > 0 ||
    Object.values(view?.talks ?? {}).some((thread) =>
      thread.some((turn) => turn.reply === undefined),
    );
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await api.view();
      if (alive.current) setView(next);
      return true;
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'The server is not responding.');
      return false;
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(), busy ? 600 : 4000);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [refresh, busy]);

  const act = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
        setError(null);
        await refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That did not work.');
        return false;
      }
    },
    [refresh],
  );

  const value = useMemo<Game>(
    () => ({
      view,
      error,
      act,
      clearError: () => setError(null),
      place,
      setPlace,
      policy,
      openPolicy: (id) => {
        setPolicy(id);
        if (id) onOpenWindow?.('policies');
      },
      timeOpen,
      setTimeOpen,
      openWindow: (id) => onOpenWindow?.(id),
      moment,
      lookAt: (turnId) => {
        if (turnId === null) setMoment(null);
        else api.moment(turnId).then(setMoment, () => setMoment(null));
      },
      world: moment?.world ?? view?.world ?? null,
    }),
    [view, error, act, place, policy, timeOpen, moment, onOpenWindow],
  );
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): Game {
  const game = useContext(GameContext);
  if (!game) throw new Error('useGame must be used inside GameProvider');
  return game;
}

const longDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const shortDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
export const formatDate = (iso: string, long = false) =>
  (long ? longDate : shortDate).format(new Date(`${iso}T00:00:00Z`));
