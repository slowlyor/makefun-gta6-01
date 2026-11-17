// Solara Bay — the city itself: road grid, districts, buildings, parks,
// the beach and the marina, plus the queries other systems use to navigate it.
// The layout is deterministic from a seed, so screenshots pose the same city.

import { clamp, makeRng, pick, range, intRange } from './util.js';

export const WORLD = 3600;          // world is WORLD x WORLD units
export const BLOCK = 300;           // block pitch (road centre to road centre)
export const ROAD_W = 64;           // road width

const DISTRICTS = [
  { name: 'Old Town',    x0: 0,    y0: 0,    x1: 1800, y1: 1200, tone: '#c9a06a' },
  { name: 'The Docks',   x0: 0,    y0: 1200, x1: 1200, y1: 3600, tone: '#8a97a3' },
  { name: 'Marina Bay',  x0: 1200, y0: 1200, x1: 2400, y1: 2400, tone: '#7fb8c9' },
  { name: 'North Heights', x0: 1800, y0: 0,  x1: 3600, y1: 1200, tone: '#b7c4a8' },
  { name: 'Sunset Strip', x0: 2400, y0: 1200, x1: 3600, y1: 3600, tone: '#e0a35e' },
];

// Palette of building face colours per district feel.
const BUILDING_COLORS = [
  '#b98a5e', '#a87c58', '#c4b49a', '#9aa5ad', '#7d8b96',
  '#d9c08a', '#8f7d6b', '#b0715a', '#6f7f8c', '#cbb28a',
  '#a34f3d', '#5e7d8a', '#93765a', '#c2a878',
];

export function buildCity(seed = 7) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const lamps = [];
  const parks = [];
  const plazas = [];

  // Beach strip along the east edge, and the marina water on the south-east.
  const beach = { x: WORLD - 170, y: 0, w: 170, h: WORLD };
  const sea = { x: WORLD - 60, y: 0, w: 60, h: WORLD };

  // Walk the block grid; each block gets buildings, a park, a plaza or parking.
  for (let bx = 0; bx < 12; bx++) {
    for (let by = 0; by < 12; by++) {
      const x0 = bx * BLOCK + ROAD_W / 2 + 14;
      const y0 = by * BLOCK + ROAD_W / 2 + 14;
      const x1 = (bx + 1) * BLOCK - ROAD_W / 2 - 14;
      const y1 = (by + 1) * BLOCK - ROAD_W / 2 - 14;
      if (x1 <= x0 || y1 <= y0) continue;
      // Keep the east edge clear for the beach and the south-east for the marina.
      if (bx >= 11) continue;
      if (bx >= 10 && by >= 9) continue;
      const roll = rng();
      if (roll < 0.10) {
        // Park: grass, trees, a pond.
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        const n = intRange(rng, 6, 10);
        for (let i = 0; i < n; i++) {
          trees.push({ x: range(rng, x0 + 14, x1 - 14), y: range(rng, y0 + 14, y1 - 14), r: range(rng, 9, 15) });
        }
        continue;
      }
      if (roll < 0.16) {
        // Plaza / parking lot: open ground with a few trees and lamps.
        plazas.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        trees.push({ x: x0 + 20, y: y0 + 20, r: 11 });
        trees.push({ x: x1 - 20, y: y1 - 20, r: 11 });
        continue;
      }
      // Buildings: 1-4 per block, with a courtyard gap.
      const count = rng() < 0.55 ? 2 : rng() < 0.8 ? 3 : 1;
      const vertical = rng() < 0.5;
      for (let i = 0; i < count; i++) {
        let bx0, by0, bw, bh;
        if (count === 1) {
          bx0 = x0 + 8; by0 = y0 + 8; bw = x1 - x0 - 16; bh = y1 - y0 - 16;
        } else if (vertical) {
          const w = (x1 - x0 - (count - 1) * 18) / count;
          bx0 = x0 + i * (w + 18); by0 = y0 + 6;
          bw = w; bh = y1 - y0 - 12;
        } else {
          const h = (y1 - y0 - (count - 1) * 18) / count;
          bx0 = x0 + 6; by0 = y0 + i * (h + 18);
          bw = x1 - x0 - 12; bh = h;
        }
        const tall = rng() < 0.22;
        buildings.push({
          x: bx0, y: by0, w: bw, h: bh,
          color: pick(rng, BUILDING_COLORS),
          roof: pick(rng, ['#5d5148', '#6b5d4f', '#4a5560', '#7a6a58']),
          height: tall ? intRange(rng, 3, 5) : intRange(rng, 1, 2),
          windows: rng() < 0.85,
        });
      }
      // A lamp at two corners of every block.
      lamps.push({ x: x0 + 6, y: y0 + 6 });
      lamps.push({ x: x1 - 6, y: y1 - 6 });
    }
  }

  // Landmarks: the places missions point at.
  const landmarks = {
    marasGarage: { x: 780, y: 690, name: "Mara's Garage" },
    eddiesBar: { x: 420, y: 1560, name: "Eddie's Bar" },
    bank: { x: 2100, y: 780, name: 'Bay Trust Bank' },
    docks: { x: 420, y: 2850, name: 'The Docks' },
    hotel: { x: 2820, y: 1890, name: 'Palms Hotel' },
    stadium: { x: 2820, y: 2820, name: 'Solara Stadium' },
    pier: { x: WORLD - 190, y: 2100, name: 'Sunset Pier' },
    hospital: { x: 1500, y: 1560, name: 'St. Aurelia Hospital' },
  };

  return { seed, buildings, trees, lamps, parks, plazas, beach, sea, landmarks, districts: DISTRICTS };
}

// --- Navigation queries -------------------------------------------------

export function isOnRoad(x, y) {
  const mx = x % BLOCK, my = y % BLOCK;
  return mx < ROAD_W / 2 + 8 || mx > BLOCK - ROAD_W / 2 - 8 ||
         my < ROAD_W / 2 + 8 || my > BLOCK - ROAD_W / 2 - 8;
}

// Snap a point to the centre of the nearest road.
export function nearestRoadPoint(x, y) {
  const rx = Math.round(x / BLOCK) * BLOCK;
  const ry = Math.round(y / BLOCK) * BLOCK;
  // Pick the nearer of the vertical road at rx and the horizontal road at ry.
  if (Math.abs(x - rx) < Math.abs(y - ry)) return { x: rx, y, vertical: true };
  return { x, y: ry, vertical: false };
}

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return DISTRICTS[0];
}

// --- Drawing ------------------------------------------------------------

// Draw the ground, roads, beach and parks for the visible viewport.
export function drawCityGround(ctx, city, cam, vw, vh) {
  const x0 = cam.x - vw / 2, y0 = cam.y - vh / 2;
  const x1 = cam.x + vw / 2, y1 = cam.y + vh / 2;

  // Ground base: warm sun-baked pavement.
  ctx.fillStyle = '#b7a077';
  ctx.fillRect(x0, y0, vw, vh);

  // Sidewalk blocks (slightly lighter) under each city block.
  ctx.fillStyle = '#c2ab82';
  const bx0 = Math.max(0, Math.floor(x0 / BLOCK));
  const by0 = Math.max(0, Math.floor(y0 / BLOCK));
  const bx1 = Math.min(11, Math.ceil(x1 / BLOCK));
  const by1 = Math.min(11, Math.ceil(y1 / BLOCK));
  for (let bx = bx0; bx <= bx1; bx++) {
    for (let by = by0; by <= by1; by++) {
      ctx.fillRect(
        bx * BLOCK + ROAD_W / 2, by * BLOCK + ROAD_W / 2,
        BLOCK - ROAD_W, BLOCK - ROAD_W);
    }
  }

  // Roads: dark asphalt with centre dashes.
  ctx.fillStyle = '#3a3d44';
  for (let i = 0; i <= 12; i++) {
    const p = i * BLOCK;
    if (p > x0 - ROAD_W && p < x1 + ROAD_W) ctx.fillRect(p - ROAD_W / 2, y0, ROAD_W, vh);
    if (p > y0 - ROAD_W && p < y1 + ROAD_W) ctx.fillRect(x0, p - ROAD_W / 2, vw, ROAD_W);
  }
  ctx.strokeStyle = 'rgba(240, 220, 140, 0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 22]);
  for (let i = 0; i <= 12; i++) {
    const p = i * BLOCK;
    if (p > x0 && p < x1) { ctx.beginPath(); ctx.moveTo(p, y0); ctx.lineTo(p, y1); ctx.stroke(); }
    if (p > y0 && p < y1) { ctx.beginPath(); ctx.moveTo(x0, p); ctx.lineTo(x1, p); ctx.stroke(); }
  }
  ctx.setLineDash([]);

  // Crosswalks at every intersection: zebra stripes on all four sides.
  ctx.fillStyle = 'rgba(240, 240, 230, 0.75)';
  for (let i = 0; i <= 12; i++) {
    for (let j = 0; j <= 12; j++) {
      const cx = i * BLOCK, cy = j * BLOCK;
      if (cx < x0 - 60 || cx > x1 + 60 || cy < y0 - 60 || cy > y1 + 60) continue;
      for (let k = -2; k <= 2; k++) {
        // North and south approaches.
        ctx.fillRect(cx + k * 12 - 3, cy - ROAD_W / 2 - 2, 6, 12);
        ctx.fillRect(cx + k * 12 - 3, cy + ROAD_W / 2 - 10, 6, 12);
        // East and west approaches.
        ctx.fillRect(cx - ROAD_W / 2 - 2, cy + k * 12 - 3, 12, 6);
        ctx.fillRect(cx + ROAD_W / 2 - 10, cy + k * 12 - 3, 12, 6);
      }
    }
  }
  // Parks.
  for (const p of city.parks) {
    if (p.x > x1 || p.y > y1 || p.x + p.w < x0 || p.y + p.h < y0) continue;
    ctx.fillStyle = '#5e9a4e';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#6fae5c';
    ctx.beginPath();
    ctx.ellipse(p.x + p.w * 0.7, p.y + p.h * 0.65, 26, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Plazas.
  ctx.fillStyle = '#a89a7e';
  for (const p of city.plazas) {
    if (p.x > x1 || p.y > y1 || p.x + p.w < x0 || p.y + p.h < y0) continue;
    ctx.fillRect(p.x, p.y, p.w, p.h);
  }

  // Beach and sea on the east edge.
  if (city.beach.x < x1) {
    ctx.fillStyle = '#e8d39a';
    ctx.fillRect(Math.max(city.beach.x, x0), y0, Math.min(city.beach.x + city.beach.w, x1) - Math.max(city.beach.x, x0), vh);
    ctx.fillStyle = '#3f8fb5';
    ctx.fillRect(Math.max(city.sea.x, x0), y0, Math.min(city.sea.x + city.sea.w, x1) - Math.max(city.sea.x, x0), vh);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(city.sea.x, y0);
    ctx.lineTo(city.sea.x, y1);
    ctx.stroke();
  }
}

// Draw buildings, trees and lamps for the visible viewport.
export function drawCityProps(ctx, city, cam, vw, vh, time) {
  const x0 = cam.x - vw / 2 - 60, y0 = cam.y - vh / 2 - 60;
  const x1 = cam.x + vw / 2 + 60, y1 = cam.y + vh / 2 + 60;

  for (const b of city.buildings) {
    if (b.x > x1 || b.y > y1 || b.x + b.w < x0 || b.y + b.h < y0) continue;
    // Drop shadow to fake height.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 5 + b.height * 2, b.y + 5 + b.height * 2, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
    // Windows as a dotted grid on the roof face.
    if (b.windows) {
      ctx.fillStyle = 'rgba(255, 244, 200, 0.75)';
      const cols = Math.max(1, Math.floor(b.w / 26));
      const rows = Math.max(1, Math.floor(b.h / 26));
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if ((i * 7 + j * 13 + b.height) % 4 === 0) continue;
          ctx.fillRect(b.x + 10 + i * 26, b.y + 10 + j * 26, 10, 8);
        }
      }
    }
    // Roof edge highlight.
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
  }

  // Trees sway gently.
  for (const t of city.trees) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    const sway = Math.sin(time * 0.001 + t.x * 0.01) * 1.5;
    ctx.fillStyle = '#4d7a3a';
    ctx.beginPath();
    ctx.arc(t.x + sway, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6aa84f';
    ctx.beginPath();
    ctx.arc(t.x + sway - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(t.x + 4, t.y + 5, t.r * 0.8, t.r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Street lamps.
  ctx.fillStyle = '#2c2f36';
  for (const l of city.lamps) {
    if (l.x < x0 || l.x > x1 || l.y < y0 || l.y > y1) continue;
    ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
  }
}

// Keep a moving circle out of every building; returns true if it collided.
export function collideBuildings(p, r, city) {
  let hit = false;
  for (const b of city.buildings) {
    if (p.x + r < b.x || p.x - r > b.x + b.w || p.y + r < b.y || p.y - r > b.y + b.h) continue;
    // Use the shared push helper via a small inline rectangle test.
    const nx = clamp(p.x, b.x, b.x + b.w);
    const ny = clamp(p.y, b.y, b.y + b.h);
    const dx = p.x - nx, dy = p.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 === 0) {
      const left = p.x - b.x, right = b.x + b.w - p.x;
      const top = p.y - b.y, bottom = b.y + b.h - p.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) p.x = b.x - r;
      else if (m === right) p.x = b.x + b.w + r;
      else if (m === top) p.y = b.y - r;
      else p.y = b.y + b.h + r;
    } else {
      const d = Math.sqrt(d2);
      p.x = nx + (dx / d) * r;
      p.y = ny + (dy / d) * r;
    }
  }
  return hit;
}
