import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Written text as a model lays it out: paragraphs, "## " headings, "- " and "1. " lists,
 * and "**" around the words that carry a point. Nothing else is understood and nothing is
 * ever treated as HTML: each piece is rendered as text. It copes with text that is still
 * arriving, so a half-written line or an unclosed "**" simply shows as it stands.
 */
type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] };

function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const last = blocks.at(-1);
    if (line.trim() === '') {
      // A blank line ends whatever came before it.
      if (last?.kind === 'paragraph' && last.text !== '')
        blocks.push({ kind: 'paragraph', text: '' });
      continue;
    }
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', text: heading[1] ?? '' });
      continue;
    }
    const item = /^\s*(?:([-*•])|(\d{1,2})[.)])\s+(.*)$/.exec(line);
    if (item) {
      const ordered = item[2] !== undefined;
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push(item[3] ?? '');
      else blocks.push({ kind: 'list', ordered, items: [item[3] ?? ''] });
      continue;
    }
    if (last?.kind === 'paragraph') last.text = last.text === '' ? line : `${last.text} ${line}`;
    else if (last?.kind === 'list' && /^\s{2,}/.test(raw)) {
      // An indented line under a list item carries that item on.
      last.items[last.items.length - 1] = `${last.items.at(-1) ?? ''} ${line.trim()}`;
    } else blocks.push({ kind: 'paragraph', text: line });
  }
  return blocks.filter((b) => b.kind !== 'paragraph' || b.text !== '');
}

/**
 * Text with its "**bold**" and "*italic*" runs marked. An unclosed run, still being
 * written, stays plain, and a stray mark is dropped rather than shown.
 */
function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part))
      return (
        <strong key={i} className="font-semibold text-fg">
          {part.slice(2, -2)}
        </strong>
      );
    if (/^\*[^*\s][^*]*\*$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    return part.replaceAll('*', '');
  });
}

export function Prose({ text, className }: { text: string; className?: string }) {
  const blocks = blocksOf(text);
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {blocks.map((block, i) => {
        const key = i;
        if (block.kind === 'heading')
          return (
            <p key={key} className="label-caps mt-2 text-fg first:mt-0">
              {inline(block.text)}
            </p>
          );
        if (block.kind === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List
              key={key}
              className={cn(
                'flex flex-col gap-1 pl-5',
                block.ordered ? 'list-decimal' : 'list-disc',
              )}
            >
              {block.items.map((item, n) => (
                <li key={n}>{inline(item)}</li>
              ))}
            </List>
          );
        }
        return <p key={key}>{inline(block.text)}</p>;
      })}
    </div>
  );
}
