import { ArrowLeft, Plus, ScrollText, SquarePen, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { Textarea } from '@/ui/textarea';

const COLOURS: { group: string; tokens: string[] }[] = [
  {
    group: 'Surfaces',
    tokens: ['bg', 'surface', 'surface-2', 'raised', 'border', 'border-strong'],
  },
  { group: 'Text', tokens: ['fg', 'fg-muted', 'fg-subtle'] },
  { group: 'Accent', tokens: ['accent', 'accent-hover', 'accent-soft'] },
  { group: 'Status', tokens: ['good', 'warn', 'bad', 'good-soft', 'warn-soft', 'bad-soft'] },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="label-caps border-b border-border pb-2 text-fg-muted">{title}</h2>
      {children}
    </section>
  );
}

/** Every component in every state. New screens are built from what is shown here. */
export function Gallery() {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-8">
        <header className="flex flex-col gap-2">
          <a
            href="#game"
            className="inline-flex items-center gap-1 self-start text-xs text-fg-muted hover:text-fg"
          >
            <ArrowLeft className="size-3.5" /> Back to the game
          </a>
          <h1 className="text-xl font-semibold">Component gallery</h1>
          <p className="max-w-[70ch] text-fg-muted">
            The StateCraft design system. Every colour, size and font comes from the tokens in{' '}
            <code className="tabular text-xs text-fg">src/theme/tokens.css</code>.
          </p>
        </header>

        <Section title="Colour">
          {COLOURS.map(({ group, tokens }) => (
            <div key={group} className="flex flex-col gap-2">
              <p className="text-xs text-fg-subtle">{group}</p>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
                {tokens.map((token) => (
                  <div key={token} className="overflow-hidden rounded-control border border-border">
                    <div className="h-12" style={{ background: `var(--color-${token})` }} />
                    <p className="tabular bg-surface px-2 py-1 text-2xs text-fg-muted">{token}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Section>

        <Section title="Type">
          <p className="text-xl font-semibold">Interface heading, 22 px</p>
          <p className="text-lg font-medium">Section heading, 17 px</p>
          <p>Interface text, 13 px. Used for controls, lists and labels.</p>
          <p className="label-caps text-fg-muted">Window title and table header</p>
          <p className="tabular">2027-03-14 · 1,284.50 · REQ-POL-05</p>
          <p className="prose-read">
            Reading text, 15 px serif. The chronicle, scenes and letters are set in this face, with
            lines capped near seventy characters so long passages stay comfortable to read.
          </p>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary">Execute</Button>
            <Button>Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">
              <Trash2 /> Delete
            </Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary">
              Small
            </Button>
            <Button size="sm">Small</Button>
            <Button size="icon" variant="primary" aria-label="Add">
              <Plus />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Delete">
              <Trash2 />
            </Button>
          </div>
        </Section>

        <Section title="Badges">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Neutral</Badge>
            <Badge tone="accent">Yours</Badge>
            <Badge tone="good">Enacted</Badge>
            <Badge tone="warn">Stalled</Badge>
            <Badge tone="bad">Blocked</Badge>
          </div>
        </Section>

        <Section title="Text input">
          <label htmlFor="gallery-input-empty" className="flex max-w-md flex-col gap-1.5">
            <span className="text-xs text-fg-muted">Empty</span>
            <Textarea
              id="gallery-input-empty"
              rows={2}
              placeholder="What do you want to do next?"
            />
          </label>
          <label htmlFor="gallery-input-filled" className="flex max-w-md flex-col gap-1.5">
            <span className="text-xs text-fg-muted">Filled</span>
            <Textarea
              id="gallery-input-filled"
              rows={2}
              defaultValue="Cut the fuel subsidy by a fifth and announce it with the budget."
            />
          </label>
        </Section>

        <Section title="Empty states">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="h-48 rounded-window border border-border bg-surface">
              <EmptyState icon={SquarePen} title="No policy boxes yet">
                Says what will appear here and how to add the first one.
              </EmptyState>
            </div>
            <div className="h-48 rounded-window border border-border bg-surface">
              <EmptyState icon={ScrollText} title="Nothing has happened yet">
                Used wherever a list or window has nothing in it.
              </EmptyState>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
