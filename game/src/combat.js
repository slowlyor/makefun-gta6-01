// Solara Bay — combat: the player's pistol, bullets, muzzle flash,
// hit sparks, and the cash and health pickups scattered around the city.

import { clamp, dist, makeRng, range } from './util.js';
import { WORLD } from './city.js';

export const WEAPONS = {
  pistol: { name: 'Pistol', damage: 34, fireRate: 0.22, bulletSpeed: 720, mag: 12, spread: 0.05 },
  smg:    { name: 'Street SMG', damage: 16, fireRate: 0.09, bulletSpeed: 780, mag: 30, spread: 0.12 },
};

export class Combat {
  constructor() {
    this.bullets = [];       // {x, y, vx, vy, life, fromPlayer}
    this.sparks = [];        // {x, y, vx, vy, life, color}
    this.pickups = [];       // {kind: 'cash'|'health'|'ammo', x, y, value}
    this.weapon = 'pistol';
    this.ammo = WEAPONS.pistol.mag;
    this.reserve = 48;
    this.cooldown = 0;
    this.muzzle = 0;         // frames of muzzle flash left
    this.rng = makeRng(31);
  }

  reset() {
    this.bullets = [];
    this.sparks = [];
    this.cooldown = 0;
    this.muzzle = 0;
    this.ammo = WEAPONS.pistol.mag;
    this.reserve = 48;
    this.weapon = 'pistol';
  }

  // Scatter cash bags, medkits, ammo and the odd SMG around the city.
  scatterPickups(city) {
    this.pickups = [];
    for (let i = 0; i < 26; i++) {
      const x = range(this.rng, 120, WORLD - 200);
      const y = range(this.rng, 120, WORLD - 120);
      const kind = i % 5 === 4 ? 'health' : i % 7 === 6 ? 'ammo' : 'cash';
      this.pickups.push({
        kind, x, y,
        value: kind === 'cash' ? 50 + Math.floor(this.rng() * 150) : 0,
        bob: this.rng() * Math.PI * 2,
      });
    }
    // Two SMGs hidden in the city for players who go looking.
    for (let i = 0; i < 2; i++) {
      this.pickups.push({
        kind: 'smg',
        x: range(this.rng, 300, WORLD - 300),
        y: range(this.rng, 300, WORLD - 300),
        value: 0, bob: this.rng() * Math.PI * 2,
      });
    }
  }

  tryShoot(x, y, angle, fromPlayer) {
    if (this.cooldown > 0) return false;
    if (fromPlayer) {
      if (this.ammo <= 0) return false;
      this.ammo--;
    }
    const w = WEAPONS[this.weapon];
    this.cooldown = w.fireRate;
    this.muzzle = 3;
    const a = angle + (this.rng() - 0.5) * w.spread * 2;
    this.bullets.push({
      x: x + Math.cos(angle) * 18,
      y: y + Math.sin(angle) * 18,
      vx: Math.cos(a) * w.bulletSpeed,
      vy: Math.sin(a) * w.bulletSpeed,
      life: 0.9,
      fromPlayer,
      damage: w.damage,
    });
    return true;
  }

  reload() {
    const w = WEAPONS[this.weapon];
    const need = w.mag - this.ammo;
    if (need <= 0 || this.reserve <= 0) return false;
    const take = Math.min(need, this.reserve);
    this.ammo += take;
    this.reserve -= take;
    this.cooldown = Math.max(this.cooldown, 0.6);
    return true;
  }

  // Advance bullets; returns hit events for the game to resolve.
  // hits: [{x, y, damage, fromPlayer}]
  update(dt, city, targets) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.muzzle = Math.max(0, this.muzzle - 1);
    const hits = [];
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      // Buildings stop bullets.
      let blocked = false;
      for (const bl of city.buildings) {
        if (b.x > bl.x && b.x < bl.x + bl.w && b.y > bl.y && b.y < bl.y + bl.h) { blocked = true; break; }
      }
      if (blocked || b.life <= 0) {
        this.sparks.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.25, color: '#ffd76a' });
        b.life = 0;
        continue;
      }
      // Test against every live target (peds, cops, player).
      for (const t of targets) {
        if (t.dead || t.state === 'dead') continue;
        if (dist(b.x, b.y, t.x, t.y) < 14) {
          hits.push({ x: b.x, y: b.y, damage: b.damage, fromPlayer: b.fromPlayer, target: t });
          this.burst(b.x, b.y, '#ff5a3d');
          b.life = 0;
          break;
        }
      }
    }
    this.bullets = this.bullets.filter(b => b.life > 0);
    for (const s of this.sparks) {
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.life -= dt;
    }
    this.sparks = this.sparks.filter(s => s.life > 0);
    return hits;
  }

  burst(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const a = this.rng() * Math.PI * 2;
      const sp = 60 + this.rng() * 140;
      this.sparks.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.25 + this.rng() * 0.2, color,
      });
    }
  }

  // Pickups the player walks over; returns the collected ones.
  collectAt(x, y, radius) {
    const got = [];
    this.pickups = this.pickups.filter(p => {
      if (dist(x, y, p.x, p.y) < radius) { got.push(p); return false; }
      return true;
    });
    return got;
  }

  draw(ctx, time) {
    // Pickups bob gently.
    for (const p of this.pickups) {
      const bob = Math.sin(time * 0.003 + p.bob) * 3;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(0, 6 - bob, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
      if (p.kind === 'cash') {
        ctx.fillStyle = '#2fae5f';
        ctx.fillRect(-9, -6, 18, 12);
        ctx.fillStyle = '#e8f5e9';
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1d7a3e';
        ctx.font = 'bold 7px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('$', 0, 2.5);
      } else if (p.kind === 'health') {
        ctx.fillStyle = '#f5f0dc';
        ctx.fillRect(-8, -8, 16, 16);
        ctx.fillStyle = '#d93d3d';
        ctx.fillRect(-2, -6, 4, 12);
        ctx.fillRect(-6, -2, 12, 4);
      } else if (p.kind === 'smg') {
        // A Street SMG lying on the ground: dark body, amber grip.
        ctx.fillStyle = '#22262e';
        ctx.fillRect(-11, -4, 22, 7);
        ctx.fillStyle = '#d9a03c';
        ctx.fillRect(4, 3, 5, 7);
        ctx.fillStyle = '#ffd76a';
        ctx.fillRect(-11, -4, 4, 7);
      } else {
        ctx.fillStyle = '#3d6fc9';
        ctx.fillRect(-8, -5, 16, 10);
        ctx.fillStyle = '#ffd76a';
        ctx.fillRect(-5, -2, 10, 4);
      }
      ctx.restore();
    }
    // Bullets as bright tracer lines.
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 2.5;
    for (const b of this.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Sparks.
    for (const s of this.sparks) {
      ctx.globalAlpha = clamp(s.life * 4, 0, 1);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }
}
