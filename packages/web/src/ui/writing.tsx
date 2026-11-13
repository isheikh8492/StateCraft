import { cn } from '@/lib/cn';

/**
 * Prose that is still being written: the words so far, with a mark where the next will
 * land. What it shows is provisional; the finished text replaces it when the writing ends.
 */
export function Writing({ text, className }: { text: string; className?: string }) {
  return (
    <span aria-busy="true" className={cn('whitespace-pre-wrap', className)}>
      {text}
      <span aria-hidden="true" className="ml-0.5 animate-pulse text-accent">
        ▍
      </span>
    </span>
  );
}
