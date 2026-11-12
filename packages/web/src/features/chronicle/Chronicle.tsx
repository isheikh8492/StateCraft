import { ScrollText } from 'lucide-react';
import { EmptyState } from '@/ui/empty-state';

/** The running story of the campaign. Entries arrive once time can advance. */
export function Chronicle() {
  return (
    <EmptyState icon={ScrollText} title="Nothing has happened yet">
      When you execute your policy boxes, time moves forward and the story of what followed is
      written here.
    </EmptyState>
  );
}
