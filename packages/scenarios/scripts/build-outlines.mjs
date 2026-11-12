/**
 * Builds the map outlines for every scenario pack, and the world backdrop.
 *   npm run outlines -w @statecraft/scenarios
 *
 * Each region in a scenario lists the Natural Earth subdivisions it is made of ("shapes",
 * ISO 3166-2 codes). This script merges them into one outline per region, simplifies shared
 * borders once so neighbours stay flush, and writes `regions.geojson` beside the scenario.
 * Shapes: Natural Earth 1:10m admin-1 (public domain) via the geojson-places package;
 * backdrop: Natural Earth 1:110m countries via world-atlas.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature, merge } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, simplify } from 'topojson-simplify';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const places = join(dirname(require.resolve('geojson-places/package.json')), 'data', 'regions');
const round = (n) => Math.round(n * 1000) / 1000;

function tidy(geometry) {
  const ring = (r) => r.map(([x, y]) => [round(x), round(y)]);
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return {
    type: 'MultiPolygon',
    coordinates: polygons.map((p) => p.map(ring)).filter((p) => p[0].length >= 4),
  };
}

/** A point inside the largest part of a region, for its label. */
function labelPoint(geometry) {
  let best = { area: -1, point: [0, 0] };
  for (const polygon of geometry.coordinates) {
    const xs = polygon[0].map((p) => p[0]);
    const ys = polygon[0].map((p) => p[1]);
    const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (area > best.area)
      best = {
        area,
        point: [
          round(xs.reduce((a, b) => a + b) / xs.length),
          round(ys.reduce((a, b) => a + b) / ys.length),
        ],
      };
  }
  return best.point;
}

for (const entry of readdirSync(root, { withFileTypes: true })) {
  const file = join(root, entry.name, 'scenario.json');
  if (!entry.isDirectory() || !existsSync(file)) continue;
  const scenario = JSON.parse(readFileSync(file, 'utf8'));
  const objects = {};
  for (const region of scenario.regions) {
    for (const code of region.shapes ?? []) {
      objects[`${region.id}|${code}`] = JSON.parse(
        readFileSync(join(places, `${code}.json`), 'utf8'),
      );
    }
  }
  const simplified = simplify(presimplify(topology(objects)), 0.0004);
  const features = scenario.regions
    .filter((region) => (region.shapes ?? []).length > 0)
    .map((region) => {
      const parts = Object.entries(simplified.objects)
        .filter(([key]) => key.startsWith(`${region.id}|`))
        .map(([, object]) => object);
      const geometry = tidy(merge(simplified, parts));
      return {
        type: 'Feature',
        id: region.id,
        properties: { id: region.id, name: region.name, label: labelPoint(geometry) },
        geometry,
      };
    });
  writeFileSync(
    join(root, entry.name, 'regions.geojson'),
    `${JSON.stringify({ type: 'FeatureCollection', features })}\n`,
  );
  console.log(`${entry.name}: ${features.length} regions`);
}

const world = JSON.parse(readFileSync(require.resolve('world-atlas/countries-110m.json'), 'utf8'));
const countries = feature(world, world.objects.countries);
writeFileSync(
  join(root, 'shared', 'world-110m.geojson'),
  `${JSON.stringify({ type: 'FeatureCollection', features: countries.features.map((f) => ({ type: 'Feature', properties: { name: f.properties.name }, geometry: { ...f.geometry, coordinates: JSON.parse(JSON.stringify(f.geometry.coordinates, (_k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v))) } })) })}\n`,
);
console.log(`world: ${countries.features.length} countries`);
