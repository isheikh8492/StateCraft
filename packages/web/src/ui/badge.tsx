import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const badge = cva(
  'inline-flex h-5 items-center gap-1 rounded-full border px-2 text-2xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-surface-2 text-fg-muted',
        accent: 'border-accent/40 bg-accent-soft text-accent',
        good: 'border-good/40 bg-good-soft text-good',
        warn: 'border-warn/40 bg-warn-soft text-warn',
        bad: 'border-bad/40 bg-bad-soft text-bad',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}
