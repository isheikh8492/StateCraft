import type { TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full resize-none rounded-control border border-border bg-bg px-2.5 py-2 text-ui text-fg placeholder:text-fg-subtle hover:border-border-strong focus-visible:border-accent focus-visible:outline-none',
        className,
      )}
      {...props}
    />
  );
}
