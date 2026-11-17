// Solara Bay — the HUD and menus: health, cash, wanted stars, the
// minimap, mission objectives, speed, and the start / pause / busted
// screens. Everything is drawn on the canvas so screenshots show it.

import { clamp, money, clock } from './util.js';
import { WORLD } from './city.js';

export function drawHUD(ctx, game, vw, vh) {
  const p = game.player;
  ctx.save();

  // --- Top-left: cash, health, weapon -----------------------------------
  ctx.fillStyle = 'rgba(10, 12, 18, 0.72)';
  roundRect(ctx, 14, 14, 218, 86, 10);
  ctx.fill();
  ctx.fillStyle = '#7ee787';
  ctx.font = 'bold 24px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(money(game.cash), 28, 44);
  // Health bar.
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(28, 54, 150, 10);
  ctx.fillStyle = p.health > 40 ? '#4ade80' : '#ef4444';
  ctx.fillRect(28, 54, 150 * clamp(p.health / 100, 0, 1), 10);
  ctx.fillStyle = '#e8e4d8';
  ctx.font = '13px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(`HP ${Math.ceil(p.health)}`, 184, 63);
  // Weapon + ammo.
  const w = game.combat;
  ctx.fillStyle = '#e8e4d8';
  ctx.font = '13px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(p.inCar ? 'DRIVING' : (w.weapon === 'pistol' ? 'PISTOL' : 'SMG'), 28, 90);
  if (!p.inCar) ctx.fillText(`${w.ammo} / ${w.reserve}`, 120, 90);

  // --- Top-right: wanted stars (they pulse while the heat is on) --------
  ctx.fillStyle = 'rgba(10, 12, 18, 0.72)';
  roundRect(ctx, vw - 214, 14, 200, 46, 10);
  ctx.fill();
  const starPulse = game.police.wanted > 0 ? 1 + Math.sin(game.time * 0.012) * 0.12 : 1;
  ctx.font = `${Math.round(26 * starPulse)}px sans-serif`;
  ctx.textAlign = 'left';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < game.police.wanted ? '#ffd23e' : 'rgba(255,255,255,0.22)';
    ctx.fillText('★', vw - 198 + i * 36, 46);
  }

  // --- Minimap (top-right, under the stars) ------------------------------
  drawMinimap(ctx, game, vw - 214, 70, 200, 200);

  // --- Objective banner (top-centre) --------------------------------------
  const obj = game.missions.objectiveText;
  ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
  const ow = ctx.measureText(obj).width + 36;
  ctx.fillStyle = 'rgba(10, 12, 18, 0.72)';
  roundRect(ctx, vw / 2 - ow / 2, 14, ow, 34, 10);
  ctx.fill();
  ctx.fillStyle = '#ffd76a';
  ctx.textAlign = 'center';
  ctx.fillText('◆ ' + obj, vw / 2, 36);

  // --- Bottom-left: speed when driving ------------------------------------
  if (p.inCar && p.car) {
    const kmh = Math.round(Math.abs(p.car.speed) * 0.9);
    ctx.fillStyle = 'rgba(10, 12, 18, 0.72)';
    roundRect(ctx, 14, vh - 74, 150, 60, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(String(kmh), 28, vh - 34);
    ctx.font = '13px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#b8b4a8';
    ctx.fillText('km/h', 92, vh - 34);
    ctx.fillStyle = '#e8e4d8';
    ctx.fillText(p.car.model.name, 28, vh - 18);
  }

  // --- Bottom-centre: controls hint ---------------------------------------
  ctx.fillStyle = 'rgba(10, 12, 18, 0.55)';
  ctx.font = '12px "Segoe UI", system-ui, sans-serif';
  const hint = p.inCar
    ? 'W/S drive · A/D steer · E exit car · Space handbrake · H horn · M mute'
    : 'WASD move · Mouse aim · Click shoot · E enter car · R reload · Shift sprint';
  const hw = ctx.measureText(hint).width + 24;
  roundRect(ctx, vw / 2 - hw / 2, vh - 30, hw, 22, 8);
  ctx.fill();
  ctx.fillStyle = 'rgba(232,228,216,0.85)';
  ctx.textAlign = 'center';
  ctx.fillText(hint, vw / 2, vh - 15);

  // --- Mission message banner ----------------------------------------------
  if (game.missions.messageTimer > 0 && game.missions.message) {
    ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
    const mw = Math.min(vw - 80, ctx.measureText(game.missions.message).width + 40);
    ctx.fillStyle = 'rgba(20, 16, 8, 0.85)';
    roundRect(ctx, vw / 2 - mw / 2, 62, mw, 36, 10);
    ctx.fill();
    ctx.fillStyle = '#ffd76a';
    ctx.textAlign = 'center';
    ctx.fillText(game.missions.message, vw / 2, 85);
  }

  // --- Damage vignette ------------------------------------------------------
  if (p.health < 40) {
    const a = (40 - p.health) / 40 * 0.35 * (0.7 + 0.3 * Math.sin(game.time * 6));
    const grad = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.35, vw / 2, vh / 2, vh * 0.75);
    grad.addColorStop(0, 'rgba(200,0,0,0)');
    grad.addColorStop(1, `rgba(200,0,0,${a})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, vw, vh);
  }
  ctx.restore();
}

// --- Minimap ----------------------------------------------------------------
export function drawMinimap(ctx, game, x, y, size, _h) {
  const scale = size / WORLD;
  ctx.save();
  ctx.fillStyle = 'rgba(10, 12, 18, 0.78)';
  roundRect(ctx, x - 4, y - 4, size + 8, size + 8, 10);
  ctx.fill();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();

  // Water / beach.
  ctx.fillStyle = '#3f8fb5';
  ctx.fillRect(x + (WORLD - 60) * scale, y, 60 * scale, size);
  ctx.fillStyle = '#e8d39a';
  ctx.fillRect(x + (WORLD - 170) * scale, y, 110 * scale, size);
  // Parks.
  ctx.fillStyle = '#4d7a3a';
  for (const p of game.city.parks) ctx.fillRect(x + p.x * scale, y + p.y * scale, p.w * scale, p.h * scale);
  // Roads.
  ctx.strokeStyle = 'rgba(220,220,220,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 12; i++) {
    const px = x + i * 300 * scale;
    const py = y + i * 300 * scale;
    ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + size, py); ctx.stroke();
  }
  // Mission waypoint.
  if (game.missions.targetPos) {
    const tx = x + game.missions.targetPos.x * scale;
    const ty = y + game.missions.targetPos.y * scale;
    const pulse = 3 + Math.sin(game.time * 0.006) * 1.5;
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath(); ctx.arc(tx, ty, 5 + pulse, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(tx, ty, 5 + pulse, 0, Math.PI * 2); ctx.stroke();
  }
  // Fare destination.
  if (game.missions.fare) {
    const f = game.missions.fare;
    ctx.fillStyle = '#7ee787';
    ctx.fillRect(x + f.to.x * scale - 3, y + f.to.y * scale - 3, 6, 6);
  }
  // Police units (red) and the player (white arrow).
  ctx.fillStyle = '#ff5a3d';
  for (const u of game.police.units) {
    ctx.beginPath(); ctx.arc(x + u.x * scale, y + u.y * scale, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  const px = x + game.player.x * scale;
  const py = y + game.player.y * scale;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(game.player.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Viewport box.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + (game.cam.x - game.vw / 2) * scale, y + (game.cam.y - game.vh / 2) * scale,
    game.vw * scale, game.vh * scale);
  ctx.restore();

  // District label under the map.
  ctx.fillStyle = 'rgba(232,228,216,0.9)';
  ctx.font = '12px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(game.districtName + '  ·  ' + clock(game.time), x, y + size + 18);
}

// --- Screens ----------------------------------------------------------------
export function drawStartScreen(ctx, game, vw, vh) {
  // Sun-soaked gradient sky over the city silhouette.
  const grad = ctx.createLinearGradient(0, 0, 0, vh);
  grad.addColorStop(0, '#ff9a56');
  grad.addColorStop(0.45, '#e85d75');
  grad.addColorStop(1, '#2b1b4a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, vw, vh);
  // Sun.
  ctx.fillStyle = '#ffd76a';
  ctx.beginPath(); ctx.arc(vw * 0.72, vh * 0.26, 70, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255, 215, 106, 0.35)';
  ctx.beginPath(); ctx.arc(vw * 0.72, vh * 0.26, 110, 0, Math.PI * 2); ctx.fill();
  // Skyline silhouette.
  ctx.fillStyle = '#1c1433';
  const base = vh * 0.78;
  let bx = 0;
  const rng = (() => { let s = 42; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
  while (bx < vw) {
    const w = 50 + rng() * 90;
    const h = 90 + rng() * 190;
    ctx.fillRect(bx, base - h, w, h + vh);
    // Lit windows.
    ctx.fillStyle = 'rgba(255, 215, 106, 0.8)';
    for (let wy = base - h + 14; wy < base - 12; wy += 22) {
      for (let wx = bx + 10; wx < bx + w - 10; wx += 18) {
        if (rng() < 0.4) ctx.fillRect(wx, wy, 7, 9);
      }
    }
    ctx.fillStyle = '#1c1433';
    bx += w + 6;
  }
  // Palm silhouettes.
  ctx.strokeStyle = '#140f28';
  ctx.lineWidth = 6;
  for (const px of [vw * 0.12, vw * 0.88]) {
    ctx.beginPath(); ctx.moveTo(px, base + 10); ctx.quadraticCurveTo(px + 8, base - 90, px - 6, base - 130); ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.5;
      ctx.beginPath(); ctx.moveTo(px - 6, base - 130);
      ctx.quadraticCurveTo(px - 6 + Math.cos(a) * 40, base - 130 + Math.sin(a) * 30, px - 6 + Math.cos(a) * 70, base - 130 + Math.sin(a) * 46);
      ctx.stroke();
    }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 84px "Segoe UI", system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 18;
  ctx.fillText('SOLARA BAY', vw / 2, vh * 0.34);
  ctx.shadowBlur = 0;
  ctx.font = '20px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#ffd76a';
  ctx.fillText('An open-world crime story — steal it, drive it, own the city.', vw / 2, vh * 0.34 + 40);

  // Menu buttons.
  const buttons = game.startButtons;
  for (const b of buttons) {
    ctx.fillStyle = b.hover ? '#ffd76a' : 'rgba(10, 12, 18, 0.8)';
    roundRect(ctx, b.x, b.y, b.w, b.h, 10);
    ctx.fill();
    ctx.fillStyle = b.hover ? '#14100a' : '#fff';
    ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 7);
  }

  ctx.font = '15px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('WASD move · Mouse aim · Click shoot · E enter / steal cars · Shift sprint · R reload · P pause · M mute', vw / 2, vh - 46);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '13px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('A free-roam crime game. All characters, places and music are original — no real city, no real gang.', vw / 2, vh - 22);
}

export function drawPauseScreen(ctx, game, vw, vh) {
  ctx.fillStyle = 'rgba(8, 10, 16, 0.72)';
  ctx.fillRect(0, 0, vw, vh);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 52px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('PAUSED', vw / 2, vh * 0.4);
  ctx.font = '17px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#e8e4d8';
  const lines = [
    `Missions completed: ${game.stats.missionsDone}   ·   Fares: ${game.stats.faresDone}`,
    `Cash earned: ${money(game.stats.cashEarned)}   ·   Cars stolen: ${game.stats.carsStolen}`,
    '',
    'P resume · M mute · S save game · N new game',
  ];
  lines.forEach((l, i) => ctx.fillText(l, vw / 2, vh * 0.4 + 46 + i * 26));
}

export function drawEndScreen(ctx, game, vw, vh, kind) {
  ctx.fillStyle = kind === 'busted' ? 'rgba(10, 16, 40, 0.82)' : 'rgba(40, 8, 8, 0.82)';
  ctx.fillRect(0, 0, vw, vh);
  ctx.textAlign = 'center';
  ctx.fillStyle = kind === 'busted' ? '#7db4ff' : '#ff6a5a';
  ctx.font = 'bold 72px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(kind === 'busted' ? 'BUSTED' : 'WASTED', vw / 2, vh * 0.42);
  ctx.fillStyle = '#e8e4d8';
  ctx.font = '18px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(kind === 'busted'
    ? 'The Solara Bay PD took you in. Mara bailed you out — minus a little handling fee.'
    : 'You flatlined on the streets of Solara Bay. The hospital patched you up — for a price.', vw / 2, vh * 0.42 + 44);
  ctx.font = '16px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('Press ENTER to get back out there', vw / 2, vh * 0.42 + 90);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
