import 'maplibre-gl/dist/maplibre-gl.css';
import type { RegionView } from '@statecraft/protocol';
import type { FeatureCollection as GeoFeatureCollection, Geometry } from 'geojson';
import maplibregl from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useGame } from '@/lib/game';

type FeatureCollection = GeoFeatureCollection<
  Geometry,
  { id: string; name: string; label: [number, number] }
>;

const STAGE_DOT: Record<RegionView['stage'], string> = {
  calm: 'bg-good',
  protest: 'bg-accent',
  riot: 'bg-warn',
  insurgency: 'bg-bad',
};

/** Colours come from the design tokens, read once from the page. */
const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();

/** A diagonal stripe tile, used to mark regions whose control is contested or lost. */
function stripes(base: string, stripe: string): ImageData {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new ImageData(size, size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = stripe;
  ctx.lineWidth = 2.5;
  for (const offset of [-size, 0, size]) {
    ctx.beginPath();
    ctx.moveTo(offset, size);
    ctx.lineTo(offset + size, 0);
    ctx.stroke();
  }
  return ctx.getImageData(0, 0, size, size);
}

/**
 * The map every window floats over (MapLibre). It needs no tile service or key: the world
 * and the scenario's regions are outlines shipped with the game. Everything on it is drawn
 * from engine state: who controls each region, whether that is contested, and how far
 * unrest has gone.
 */
export function WorldMap() {
  const { view, place, setPlace } = useGame();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef(new Map<string, HTMLButtonElement>());
  const outlines = useRef<FeatureCollection | null>(null);
  const [ready, setReady] = useState(false);
  const scenarioId = view?.campaign?.scenarioId;
  const regions = view?.world?.regions;
  const pick = useRef(setPlace);
  pick.current = setPlace;
  const selected = useRef(place);
  selected.current = place;

  useEffect(() => {
    if (!scenarioId || !container.current) return;
    let cancelled = false;
    let created: maplibregl.Map | undefined;
    const made = markers.current;
    void api.map().then((data) => {
      if (cancelled || !data || !container.current) return;
      const shapes = data.regions as FeatureCollection;
      outlines.current = shapes;
      try {
        created = new maplibregl.Map({
          container: container.current,
          style: {
            version: 8,
            sources: {},
            layers: [
              {
                id: 'water',
                type: 'background',
                paint: { 'background-color': token('map-water') },
              },
            ],
          },
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          maxZoom: 8,
          minZoom: 2,
        });
      } catch {
        // No WebGL: the briefing window still lists every region.
        return;
      }
      const m = created;
      map.current = m;
      m.on('load', () => {
        m.addImage('contested', stripes(token('map-land'), token('warn')));
        m.addImage('occupied', stripes(token('map-land'), token('bad')));
        m.addSource('world', { type: 'geojson', data: data.world as GeoFeatureCollection });
        m.addSource('regions', { type: 'geojson', data: shapes });
        m.addLayer({
          id: 'world-fill',
          type: 'fill',
          source: 'world',
          paint: { 'fill-color': token('surface') },
        });
        m.addLayer({
          id: 'world-line',
          type: 'line',
          source: 'world',
          paint: { 'line-color': token('border'), 'line-width': 0.6 },
        });
        m.addLayer({
          id: 'regions-fill',
          type: 'fill',
          source: 'regions',
          paint: { 'fill-color': token('map-land') },
        });
        m.addLayer({
          id: 'regions-status',
          type: 'fill',
          source: 'regions',
          filter: ['in', ['get', 'status'], ['literal', ['contested', 'occupied']]],
          paint: { 'fill-pattern': ['get', 'status'], 'fill-opacity': 0.75 },
        });
        m.addLayer({
          id: 'regions-line',
          type: 'line',
          source: 'regions',
          paint: { 'line-color': token('map-border'), 'line-width': 1.2 },
        });
        m.addLayer({
          id: 'regions-selected',
          type: 'line',
          source: 'regions',
          filter: ['==', ['get', 'id'], ''],
          paint: { 'line-color': token('accent'), 'line-width': 2.5 },
        });
        m.on('click', 'regions-fill', (event) => {
          const id = event.features?.[0]?.properties?.id as string | undefined;
          if (id) pick.current(selected.current === id ? null : id);
        });
        m.on('mouseenter', 'regions-fill', () => {
          m.getCanvas().style.cursor = 'pointer';
        });
        m.on('mouseleave', 'regions-fill', () => {
          m.getCanvas().style.cursor = '';
        });

        const bounds = new maplibregl.LngLatBounds();
        for (const feature of shapes.features) {
          const polygons =
            feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
          for (const ring of polygons.flat())
            for (const point of ring) bounds.extend(point as [number, number]);
          const { id, name, label } = feature.properties;
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.region = id;
          button.className =
            'flex cursor-pointer flex-col items-center gap-0.5 rounded-control px-1 text-xs font-medium text-fg-muted hover:text-fg aria-pressed:text-accent';
          const dot = document.createElement('span');
          dot.className = 'size-2.5 rounded-full border border-bg';
          const text = document.createElement('span');
          text.textContent = name;
          button.append(dot, text);
          button.addEventListener('click', () => pick.current(selected.current === id ? null : id));
          new maplibregl.Marker({ element: button }).setLngLat(label).addTo(m);
          made.set(id, button);
        }
        m.fitBounds(bounds, { padding: 60, animate: false });
        setReady(true);
      });
    });
    return () => {
      cancelled = true;
      setReady(false);
      made.clear();
      map.current = null;
      created?.remove();
    };
  }, [scenarioId]);

  // Engine state onto the map: control as fill, unrest as the marker's dot.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !regions || !outlines.current) return;
    const state = new Map(regions.map((r) => [r.id, r]));
    (m.getSource('regions') as maplibregl.GeoJSONSource | undefined)?.setData({
      ...outlines.current,
      features: outlines.current.features.map((f) => ({
        ...f,
        properties: { ...f.properties, status: state.get(f.properties.id)?.status ?? 'held' },
      })),
    });
    m.setFilter('regions-selected', ['==', ['get', 'id'], place ?? '']);
    for (const [id, button] of markers.current) {
      const region = state.get(id);
      if (!region) continue;
      button.dataset.status = region.status;
      button.dataset.stage = region.stage;
      button.setAttribute('aria-pressed', String(place === id));
      button.setAttribute('aria-label', `${region.name}: ${region.status}, ${region.stage}`);
      const dot = button.firstElementChild;
      if (dot) dot.className = `size-2.5 rounded-full border border-bg ${STAGE_DOT[region.stage]}`;
    }
  }, [ready, regions, place]);

  return (
    <div className="absolute inset-0 bg-map-water">
      <div
        ref={container}
        role="application"
        aria-label="Map of the country by region"
        className="h-full w-full"
      />
      {ready && (
        <ul
          aria-label="Map legend"
          className="absolute right-3 bottom-3 flex flex-col gap-1 rounded-control border border-border bg-surface/90 p-2 text-2xs text-fg-muted"
        >
          {(['calm', 'protest', 'riot', 'insurgency'] as const).map((stage) => (
            <li key={stage} className="flex items-center gap-2">
              <span className={`size-2.5 rounded-full ${STAGE_DOT[stage]}`} />
              {stage[0]?.toUpperCase()}
              {stage.slice(1)}
            </li>
          ))}
          <li className="mt-1 border-t border-border pt-1">Striped: control contested or lost</li>
          <li className="text-fg-subtle">Outlines: Natural Earth</li>
        </ul>
      )}
    </div>
  );
}
