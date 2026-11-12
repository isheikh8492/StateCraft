import { useEffect, useState } from 'react';
import { Gallery } from './features/gallery/Gallery';
import { Shell } from './features/shell/Shell';

const currentView = () => (window.location.hash === '#gallery' ? 'gallery' : 'game');

export function App() {
  const [view, setView] = useState(currentView);
  useEffect(() => {
    const onHashChange = () => setView(currentView());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return view === 'gallery' ? <Gallery /> : <Shell />;
}
