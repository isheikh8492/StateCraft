import type { LucideIcon } from 'lucide-react';
import { Maximize2, Minimize2, Minus } from 'lucide-react';
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { cn } from '@/lib/cn';
import { Button } from './button';

export interface WindowFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
}

export type WindowLayout = Record<string, WindowFrame>;

const MIN_W = 240;
const MIN_H = 140;
const STORAGE_KEY = 'statecraft.windows.v4';

function loadLayout(defaults: WindowLayout): WindowLayout {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as WindowLayout | null;
    if (saved === null) return defaults;
    const merged: WindowLayout = {};
    for (const [id, frame] of Object.entries(defaults)) merged[id] = { ...frame, ...saved[id] };
    return merged;
  } catch {
    return defaults;
  }
}

/** Holds the position, size and stacking order of every window, and remembers them. */
export function useWindowLayout(defaults: WindowLayout) {
  const [layout, setLayout] = useState<WindowLayout>(() => loadLayout(defaults));

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // Layout memory is a convenience; the app works without it.
    }
  }, [layout]);

  const update = useCallback((id: string, patch: Partial<WindowFrame>) => {
    setLayout((current) => {
      const frame = current[id];
      return frame ? { ...current, [id]: { ...frame, ...patch } } : current;
    });
  }, []);

  const focus = useCallback((id: string) => {
    setLayout((current) => {
      const frame = current[id];
      if (!frame) return current;
      const top = Math.max(...Object.values(current).map((f) => f.z));
      return frame.z === top ? current : { ...current, [id]: { ...frame, z: top + 1 } };
    });
  }, []);

  const open = useCallback((id: string) => {
    setLayout((current) => {
      const frame = current[id];
      if (!frame) return current;
      const top = Math.max(...Object.values(current).map((f) => f.z));
      return { ...current, [id]: { ...frame, minimized: false, z: top + 1 } };
    });
  }, []);

  return { layout, update, focus, open };
}

interface WindowProps {
  id: string;
  title: string;
  icon: LucideIcon;
  frame: WindowFrame;
  focused: boolean;
  onChange: (id: string, patch: Partial<WindowFrame>) => void;
  onFocus: (id: string) => void;
  children: ReactNode;
}

/** Which sides a drag moves: the title bar moves the window; an edge or corner resizes it. */
type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
type DragMode = 'move' | Edge;

/** Where each grab area sits along the window's border, and the cursor it shows. */
const EDGES: { edge: Edge; className: string }[] = [
  { edge: 'n', className: 'top-0 right-3 left-3 h-1.5 cursor-ns-resize' },
  { edge: 's', className: 'right-3 bottom-0 left-3 h-1.5 cursor-ns-resize' },
  { edge: 'e', className: 'top-3 right-0 bottom-3 w-1.5 cursor-ew-resize' },
  { edge: 'w', className: 'top-3 bottom-3 left-0 w-1.5 cursor-ew-resize' },
  { edge: 'nw', className: 'top-0 left-0 size-3 cursor-nwse-resize' },
  { edge: 'ne', className: 'top-0 right-0 size-3 cursor-nesw-resize' },
  { edge: 'sw', className: 'bottom-0 left-0 size-3 cursor-nesw-resize' },
  { edge: 'se', className: 'right-0 bottom-0 size-4 cursor-nwse-resize' },
];

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high));

/** The one frame every widget sits in: drag by the title bar, resize from any edge or corner. */
export function Window({
  id,
  title,
  icon: Icon,
  frame,
  focused,
  onChange,
  onFocus,
  children,
}: WindowProps) {
  const startDrag = (mode: DragMode) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || frame.maximized) return;
    if ((event.target as HTMLElement).closest('button')) return;
    const handle = event.currentTarget;
    const bounds = handle.closest('[data-desktop]')?.getBoundingClientRect();
    if (!bounds) return;
    handle.setPointerCapture(event.pointerId);
    const origin = { px: event.clientX, py: event.clientY, ...frame };

    const move = (e: PointerEvent) => {
      const dx = e.clientX - origin.px;
      const dy = e.clientY - origin.py;
      if (mode === 'move') {
        onChange(id, {
          x: Math.min(Math.max(origin.x + dx, 80 - origin.w), bounds.width - 80),
          y: Math.min(Math.max(origin.y + dy, 0), bounds.height - 32),
        });
        return;
      }
      const patch: Partial<WindowFrame> = {};
      const right = origin.x + origin.w;
      const bottom = origin.y + origin.h;
      if (mode.includes('e')) patch.w = clamp(origin.w + dx, MIN_W, bounds.width - origin.x);
      if (mode.includes('s')) patch.h = clamp(origin.h + dy, MIN_H, bounds.height - origin.y);
      if (mode.includes('w')) {
        // A window already pushed partly off the left stays where it is until dragged back.
        patch.x = clamp(origin.x + dx, Math.min(0, origin.x), right - MIN_W);
        patch.w = right - patch.x;
      }
      if (mode.includes('n')) {
        patch.y = clamp(origin.y + dy, 0, bottom - MIN_H);
        patch.h = bottom - patch.y;
      }
      onChange(id, patch);
    };
    const stop = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  };

  if (frame.minimized) return null;
  const toggleMaximize = () => onChange(id, { maximized: !frame.maximized });

  return (
    <section
      aria-label={title}
      onPointerDownCapture={() => onFocus(id)}
      className={cn(
        'absolute flex flex-col overflow-hidden rounded-window border bg-surface shadow-window',
        focused ? 'border-border-strong' : 'border-border',
        frame.maximized && 'inset-2 rounded-window',
      )}
      style={
        frame.maximized
          ? { zIndex: frame.z }
          : { left: frame.x, top: frame.y, width: frame.w, height: frame.h, zIndex: frame.z }
      }
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: dragging is a pointer-only convenience; the title bar buttons cover keyboard use */}
      <header
        onPointerDown={startDrag('move')}
        onDoubleClick={toggleMaximize}
        className={cn(
          'flex h-9 shrink-0 touch-none items-center gap-2 border-b border-border bg-surface-2 pr-1 pl-3 select-none',
          !frame.maximized && 'cursor-grab active:cursor-grabbing',
        )}
      >
        <Icon className={cn('size-4', focused ? 'text-accent' : 'text-fg-subtle')} aria-hidden />
        <h2 className={cn('label-caps flex-1 truncate', focused ? 'text-fg' : 'text-fg-muted')}>
          {title}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Minimise ${title}`}
          onClick={() => onChange(id, { minimized: true })}
        >
          <Minus />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={frame.maximized ? `Restore ${title}` : `Maximise ${title}`}
          onClick={toggleMaximize}
        >
          {frame.maximized ? <Minimize2 /> : <Maximize2 />}
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      {!frame.maximized && (
        <>
          {/* A faint grip in the corner, so it is plain the window can be resized. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 10 10"
            className="pointer-events-none absolute right-1 bottom-1 size-2.5 text-fg-subtle"
          >
            <path d="M9 3 3 9M9 6 6 9" stroke="currentColor" strokeWidth="1.2" fill="none" />
          </svg>
          {EDGES.map(({ edge, className }) => (
            <div
              key={edge}
              aria-hidden="true"
              data-edge={edge}
              onPointerDown={startDrag(edge)}
              className={cn('absolute z-10 touch-none', className)}
            />
          ))}
        </>
      )}
    </section>
  );
}
