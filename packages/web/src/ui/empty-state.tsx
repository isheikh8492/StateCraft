import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}

/** Shown wherever a list or window has nothing in it yet. Always says what will appear and how. */
export function EmptyState({ icon: Icon, title, children }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <Icon className="size-6 text-fg-subtle" aria-hidden="true" />
      <p className="font-medium text-fg">{title}</p>
      <p className="max-w-[44ch] text-fg-muted">{children}</p>
    </div>
  );
}
