// Solara Bay — main loop: input, player, camera, world updates and the
// render order. Ties together city, vehicles, pedestrians, police,
// missions, combat, HUD and sound into one playable open world.

import { clamp, dist, makeRng, range, wrapAngle } from './util.js';
import {
  WORLD, BLOCK, buildCity, drawCityGround, drawCityProps,
  collideBuildings, districtAt,
} from './city.js';
import { SoundBank } from './audio.js';
import { CAR_MODELS, makeCar, spawnCarNear, driveCar, updateTraffic, separateCars, drawCar } from './vehicles.js';
import { makePed, spawnPedNear, updatePed, scarePed, drawPed } from './pedestrians.js';
import { Police, HEAT } from './police.js';
import { Combat } from './combat.js';
import { MissionRunner } from './missions.js';
import { drawHUD, drawStartScreen, drawPauseScreen, drawEndScreen } from './hud.js';
import { parseShotParams, applyShot } from './shots.js';

const SAVE_KEY = 'solara-bay-save-v1';

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.vw = canvas.width;
    this.vh = canvas.height;
    this.time = 0;
    this.state = 'start';      // start | playing | paused | busted | wasted
    this.started = false;
    this.rng = makeRng(20261117);
    this.sound = new SoundBank();
    this.city = buildCity(7);
    this.police = new Police();
    this.combat = new Combat();
    this.missions = new MissionRunner(this.city.landmarks);
    this.cars = [];
    this.peds = [];
    this.cam = { x: 600, y: 600, zoom: 1 };
    this.cash = 250;
    this.stats = { missionsDone: 0, faresDone: 0, carsStolen: 0, cashEarned: 0 };
    this.districtName = 'Old Town';
    this.player = this.freshPlayer();
    this.input = { up: false, down: false, left: false, right: false, sprint: false, fire: false };
    this.mouse = { x: this.vw / 2, y: this.vh / 2 };
    this.keys = new Set();
    this.startButtons = [];
    this.endKind = null;
    this.endTimer = 0;
    this.fareTimer = 0;
    this.saveTimer = 0;
    this.shotCruise = false; // screenshot poses cruise the player's car
    this.populateWorld();
    this.combat.scatterPickups(this.city);
    this.bindInput();
    this.layoutStartButtons();
  }

  freshPlayer() {
    return {
      x: 600, y: 600, angle: 0, speed: 0,
      health: 100, inCar: false, car: null,
      walkPhase: 0, aimAngle: 0, dead: false,
    };
  }

  populateWorld() {
    const rng = this.rng;
    // Parked cars and traffic spread across the city, never piled on top
    // of each other.
    let placed = 0, tries = 0;
    while (placed < 26 && tries < 200) {
      tries++;
      const car = spawnCarNear(rng, range(rng, 200, WORLD - 300), range(rng, 200, WORLD - 300), rng() < 0.6);
      if (this.cars.some(c => dist(c.x, c.y, car.x, car.y) < 130)) continue;
      this.cars.push(car);
      placed++;
    }
    // A yellow sports car waiting outside the Palms Hotel for mission 4.
    const sport = makeCar(CAR_MODELS[4], this.city.landmarks.hotel.x + 90, this.city.landmarks.hotel.y + 40, 0);
    this.cars.push(sport);
    // Pedestrians everywhere.
    for (let i = 0; i < 42; i++) {
      this.peds.push(spawnPedNear(rng, range(rng, 200, WORLD - 300), range(rng, 200, WORLD - 300)));
    }
  }

  // --- Input ---------------------------------------------------------------
  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      this.keys.add(e.key.toLowerCase());
      this.sound.ensure();
      this.handleKey(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    this.canvas.addEventListener('mousemove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) * (this.vw / r.width);
      this.mouse.y = (e.clientY - r.top) * (this.vh / r.height);
    });
    this.canvas.addEventListener('mousedown', (e) => {
      this.sound.ensure();
      if (e.button === 0) {
        if (this.state === 'start') this.clickStartButton(e);
        else this.input.fire = true;
      }
    });
    window.addEventListener('mouseup', () => { this.input.fire = false; });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  handleKey(key) {
    if (this.state === 'start') {
      if (key === 'enter') this.startGame(false);
      return;
    }
    if (this.state === 'busted' || this.state === 'wasted') {
      if (key === 'enter') this.respawn();
      return;
    }
    if (key === 'p' || key === 'escape') {
      this.state = this.state === 'paused' ? 'playing' : 'paused';
      return;
    }
    if (key === 'm') { this.sound.setMuted(!this.sound.muted); return; }
    if (key === 's' && this.state === 'paused') { this.saveGame(); return; }
    if (key === 'n' && this.state === 'paused') { this.newGame(); return; }
    if (this.state !== 'playing') return;
    if (key === 'e') this.toggleCar();
    if (key === 'r') this.combat.reload();
    if (key === 'h') this.sound.horn();
  }

  layoutStartButtons() {
    const vw = this.vw, vh = this.vh;
    const hasSave = !!localStorage.getItem(SAVE_KEY);
    this.startButtons = [
      { label: hasSave ? 'CONTINUE' : 'NEW GAME', action: hasSave ? 'continue' : 'new', x: vw / 2 - 130, y: vh * 0.52, w: 260, h: 54, hover: false },
      { label: hasSave ? 'NEW GAME' : 'HOW TO PLAY', action: hasSave ? 'new' : 'how', x: vw / 2 - 130, y: vh * 0.52 + 66, w: 260, h: 54, hover: false },
    ];
  }

  clickStartButton(e) {
    const r = this.canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (this.vw / r.width);
    const my = (e.clientY - r.top) * (this.vh / r.height);
    for (const b of this.startButtons) {
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        this.sound.click();
        if (b.action === 'continue') this.startGame(true);
        else if (b.action === 'new') this.startGame(false);
        else this.missions.showMessage('Steal cars, run missions for Mara, and don\'t get busted. Good luck, Jax.', 6);
        return;
      }
    }
  }

  // --- Game flow -------------------------------------------------------------
  startGame(loadSave) {
    this.started = true;
    this.state = 'playing';
    if (loadSave) this.loadGame();
    else this.newGame();
    this.missions.startMission(this.missions.index);
    this.sound.ensure();
  }

  newGame() {
    this.player = this.freshPlayer();
    this.cash = 250;
    this.stats = { missionsDone: 0, faresDone: 0, carsStolen: 0, cashEarned: 0 };
    this.police.clear();
    this.combat.reset();
    this.combat.scatterPickups(this.city);
    this.missions = new MissionRunner(this.city.landmarks);
    this.cars = [];
    this.peds = [];
    this.populateWorld();
    this.state = 'playing';
    this.started = true;
    this.missions.startMission(0);
  }

  respawn() {
    const hospital = this.city.landmarks.hospital;
    const fee = Math.min(this.cash, 150);
    this.cash -= fee;
    this.player = this.freshPlayer();
    this.player.x = hospital.x + 60;
    this.player.y = hospital.y + 60;
    this.player.health = 100;
    this.police.clear();
    this.combat.reset();
    this.state = 'playing';
    this.missions.showMessage(`Back on the street. The hospital kept $${fee} for the trouble.`, 5);
    if (this.missions.active) {
      // A busted / wasted run fails the active mission.
      this.missions.failMission(this, this.endKind === 'busted' ? 'Busted by the police' : 'Wasted');
    }
  }

  saveGame() {
    const data = {
      cash: this.cash, x: this.player.x, y: this.player.y,
      health: this.player.health,
      missionIndex: this.missions.index,
      missionsDone: this.stats.missionsDone,
      faresDone: this.stats.faresDone,
      carsStolen: this.stats.carsStolen,
      time: this.time,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    this.missions.showMessage('Game saved.', 2.5);
  }

  loadGame() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!data) return;
      this.cash = data.cash ?? 250;
      this.player.x = data.x ?? 600;
      this.player.y = data.y ?? 600;
      this.player.health = data.health ?? 100;
      this.stats.missionsDone = data.missionsDone ?? 0;
      this.stats.faresDone = data.faresDone ?? 0;
      this.stats.carsStolen = data.carsStolen ?? 0;
      this.missions.index = data.missionIndex ?? 0;
      this.time = data.time ?? 0;
    } catch { /* corrupt save: start fresh */ }
  }

  // --- Cars: enter / steal ---------------------------------------------------
  toggleCar() {
    const p = this.player;
    if (p.inCar) {
      // Step out beside the car.
      const car = p.car;
      car.driver = null;
      car.speed *= 0.2;
      p.inCar = false;
      p.car = null;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
      p.angle = car.angle;
      return;
    }
    // Find the nearest car within reach.
    let best = null, bestD = 60;
    for (const car of this.cars) {
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < bestD) { best = car; bestD = d; }
    }
    if (!best) return;
    // A driven car has a driver who flees; a parked one is free.
    if (best.driver === 'traffic') {
      // The driver bails out to the side and runs — not under the wheels.
      const side = best.angle + Math.PI / 2;
      const ped = makePed(this.rng, best.x + Math.cos(side) * 34, best.y + Math.sin(side) * 34);
      ped.state = 'flee';
      ped.fleeTimer = 4;
      this.peds.push(ped);
      this.stats.carsStolen++;
      this.police.addHeat(HEAT.stealCar, this.time);
      this.sound.wantedUp();
      this.missions.showMessage('Car stolen! The law won\'t like that.', 3);
    }
    best.driver = 'player';
    best.speed = 0; // a stolen car comes to a stop as you take the wheel
    p.inCar = true;
    p.car = best;
    p.x = best.x; p.y = best.y;
    this.sound.pickup();
  }

  // --- Update ------------------------------------------------------------------
  update(dt) {
    this.time += dt;
    const p = this.player;
    const inp = this.input;
    inp.up = this.keys.has('w') || this.keys.has('arrowup');
    inp.down = this.keys.has('s') || this.keys.has('arrowdown');
    inp.left = this.keys.has('a') || this.keys.has('arrowleft');
    inp.right = this.keys.has('d') || this.keys.has('arrowright');
    inp.sprint = this.keys.has('shift');

    // Aim: mouse position in world space.
    const worldMouse = this.screenToWorld(this.mouse.x, this.mouse.y);
    p.aimAngle = Math.atan2(worldMouse.y - p.y, worldMouse.x - p.x);

    if (p.inCar && p.car) {
      const car = p.car;
      const throttle = this.shotCruise ? 0.55 : (inp.up ? 1 : 0) + (inp.down ? -1 : 0);
      const steer = this.shotCruise ? 0 : (inp.left ? -1 : 0) + (inp.right ? 1 : 0);
      if (this.keys.has(' ')) car.speed *= Math.max(0, 1 - dt * 3); // handbrake
      driveCar(car, { throttle, steer }, dt);
      // Building collision for the car.
      if (collideBuildings(car, car.width / 2, this.city)) {
        if (Math.abs(car.speed) > 180) this.sound.crash();
        car.speed *= 0.4;
      }
      p.x = car.x; p.y = car.y; p.angle = car.angle;
      this.sound.setEngine(Math.abs(car.speed) / car.model.top, true);
      // Running over a ped: crime + the ped goes down.
      for (const ped of this.peds) {
        if (ped.state === 'dead' || ped.state === 'driving') continue;
        if (dist(p.x, p.y, ped.x, ped.y) < 26 && Math.abs(car.speed) > 60) {
          ped.state = 'dead';
          this.police.addHeat(HEAT.runOverPed, this.time);
          this.sound.crash();
          this.missions.showMessage('You hit a pedestrian! The cops are coming.', 3);
        }
      }
    } else {
      // On foot.
      let mx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      let my = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
      const len = Math.hypot(mx, my);
      if (len > 0) { mx /= len; my /= len; }
      const speed = inp.sprint ? 235 : 150;
      p.x += mx * speed * dt;
      p.y += my * speed * dt;
      p.angle = p.aimAngle;
      if (len > 0) p.walkPhase += dt * (inp.sprint ? 13 : 9);
      collideBuildings(p, 11, this.city);
      p.x = clamp(p.x, 30, WORLD - 30);
      p.y = clamp(p.y, 30, WORLD - 30);
      this.sound.setEngine(0, false);
      // Shooting.
      if (inp.fire) {
        if (this.combat.tryShoot(p.x, p.y, p.aimAngle, true)) {
          this.sound.gunshot();
          this.police.addHeat(0.25, this.time);
          for (const ped of this.peds) {
            if (dist(p.x, p.y, ped.x, ped.y) < 320) scarePed(ped, p.x, p.y);
          }
        }
      }
      // Pickups.
      for (const got of this.combat.collectAt(p.x, p.y, 26)) {
        if (got.kind === 'cash') {
          this.cash += got.value;
          this.stats.cashEarned += got.value;
          this.missions.showMessage(`Found $${got.value} on the street.`, 2);
        } else if (got.kind === 'health') {
          p.health = Math.min(100, p.health + 40);
          this.missions.showMessage('Patched up. +40 HP', 2);
        } else if (got.kind === 'smg') {
          this.combat.weapon = 'smg';
          this.combat.ammo = 30;
          this.combat.reserve += 60;
          this.missions.showMessage('Picked up a Street SMG!', 3);
        } else {
          this.combat.reserve += 24;
          this.missions.showMessage('Ammo restocked. +24 rounds', 2);
        }
        this.sound.pickup();
      }
    }

    // Traffic and peds.
    for (const car of this.cars) {
      if (car.driver === 'traffic') updateTraffic(car, dt, this.city, this.rng, this.cars);
    }
    separateCars(this.cars);
    const danger = { x: p.x, y: p.y };
    for (const ped of this.peds) {
      updatePed(ped, dt, this.city, this.rng, danger);
      // A speeding car bearing down on a ped sends them running.
      if (ped.state === 'walk') {
        for (const car of this.cars) {
          if (Math.abs(car.speed) > 170 && dist(car.x, car.y, ped.x, ped.y) < 70) {
            scarePed(ped, car.x, car.y);
            break;
          }
        }
      }
    }

    // Bullets resolve against peds, cops and the player.
    const targets = [...this.peds, ...this.police.units.filter(u => u.kind === 'foot'), p];
    const hits = this.combat.update(dt, this.city, targets);
    for (const h of hits) {
      if (h.target === p) {
        p.health -= h.damage;
        this.sound.crash();
      } else if (h.target.state !== undefined) {
        h.target.state = 'dead';
        if (h.fromPlayer) {
          this.police.addHeat(HEAT.shoot, this.time);
          this.sound.wantedUp();
        }
      }
    }
    if (p.health <= 0) {
      this.endKind = 'wasted';
      this.state = 'wasted';
      this.sound.busted();
      return;
    }

    // Police.
    const busted = this.police.update(dt, p, this.cars, this.peds, this.time);
    this.sound.setSiren(this.police.wanted > 0);
    this.sound.updateSiren(dt);
    if (busted) {
      this.endKind = 'busted';
      this.state = 'busted';
      this.sound.busted();
      return;
    }

    // Missions and fares.
    this.missions.update(dt, p, this);
    this.missions.updateFare(dt, p, this);
    this.fareTimer -= dt;
    if (this.fareTimer <= 0) {
      this.fareTimer = 40;
      if (!this.missions.active && this.missions.completed >= 1 && p.inCar) {
        this.missions.offerFare(p, this.rng);
      }
    }

    // Keep the world populated near the player.
    this.maintainPopulation();

    // Camera follows the player, eased; snap when it is far behind
    // (after a respawn or a fast getaway) so it never loses the player.
    const tx = clamp(p.x, this.vw / 2, WORLD - this.vw / 2);
    const ty = clamp(p.y, this.vh / 2, WORLD - this.vh / 2);
    const camDist = dist(this.cam.x, this.cam.y, tx, ty);
    if (camDist > 500) {
      this.cam.x = tx;
      this.cam.y = ty;
    } else {
      this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 5);
      this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 5);
    }
    this.districtName = districtAt(p.x, p.y).name;

    // Autosave every 30 seconds.
    this.saveTimer += dt;
    if (this.saveTimer > 30) {
      this.saveTimer = 0;
      if (this.state === 'playing') this.saveGame();
    }
  }

  maintainPopulation() {
    const p = this.player;
    // Despawn far traffic and peds; spawn fresh ones nearby.
    this.cars = this.cars.filter(c => c.driver === 'player' || c.driver === 'police' || dist(c.x, c.y, p.x, p.y) < 1400);
    this.peds = this.peds.filter(pd => pd.state === 'dead' ? dist(pd.x, pd.y, p.x, p.y) < 900 : dist(pd.x, pd.y, p.x, p.y) < 1200);
    let tries = 0;
    while (this.cars.filter(c => c.driver === 'traffic').length < 14 && tries < 60) {
      tries++;
      const car = spawnCarNear(this.rng, p.x + range(this.rng, -700, 700), p.y + range(this.rng, -700, 700), true);
      if (this.cars.some(c => dist(c.x, c.y, car.x, car.y) < 120)) continue;
      this.cars.push(car);
    }
    while (this.peds.length < 30) {
      this.peds.push(spawnPedNear(this.rng, p.x + range(this.rng, -600, 600), p.y + range(this.rng, -600, 600)));
    }
  }

  screenToWorld(sx, sy) {
    return {
      x: this.cam.x - this.vw / 2 + sx,
      y: this.cam.y - this.vh / 2 + sy,
    };
  }

  // --- Render ------------------------------------------------------------------
  render() {
    const ctx = this.ctx;
    const vw = this.vw, vh = this.vh;
    ctx.clearRect(0, 0, vw, vh);
    if (this.state === 'start') {
      drawStartScreen(ctx, this, vw, vh);
      return;
    }
    const cam = { x: this.cam.x, y: this.cam.y };
    ctx.save();
    ctx.translate(vw / 2 - cam.x, vh / 2 - cam.y);
    drawCityGround(ctx, this.city, cam, vw, vh);
    // Waypoint beacon under everything else.
    if (this.missions.targetPos) {
      const t = this.missions.targetPos;
      const pulse = 26 + Math.sin(this.time * 0.005) * 6;
      ctx.strokeStyle = 'rgba(255, 210, 62, 0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(t.x, t.y, pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255, 210, 62, 0.25)';
      ctx.beginPath(); ctx.arc(t.x, t.y, pulse, 0, Math.PI * 2); ctx.fill();
      // A tall light pillar so the waypoint is visible from afar.
      ctx.fillStyle = 'rgba(255, 210, 62, 0.10)';
      ctx.fillRect(t.x - 6, t.y - 220, 12, 220);
    }
    // Fare customer marker.
    if (this.missions.fare && !this.missions.fare.pickedUp) {
      const f = this.missions.fare.from;
      ctx.fillStyle = '#7ee787';
      ctx.beginPath(); ctx.arc(f.x, f.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', f.x, f.y + 4);
    }
    drawCityProps(ctx, this.city, cam, vw, vh, this.time);
    this.combat.draw(ctx, this.time);
    // Peds, then cars, then the player on top.
    for (const ped of this.peds) drawPed(ctx, ped, this.time);
    // Sort cars by y so nearer ones draw over farther ones.
    const sortedCars = [...this.cars].sort((a, b) => a.y - b.y);
    for (const car of sortedCars) drawCar(ctx, car, this.time);
    // A marker ring under the player's car so it is never lost in traffic.
    if (this.player.inCar && this.player.car) {
      const c = this.player.car;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.length / 2 + 7, c.width / 2 + 9, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.police.draw(ctx, this.time);
    if (!this.player.inCar) this.drawPlayer(ctx);
    ctx.restore();

    drawHUD(ctx, this, vw, vh);
    if (this.state === 'paused') drawPauseScreen(ctx, this, vw, vh);
    if (this.state === 'busted' || this.state === 'wasted') drawEndScreen(ctx, this, vw, vh, this.endKind);
  }

  drawPlayer(ctx) {
    const p = this.player;
    const swing = Math.sin(p.walkPhase) * 3;
    ctx.save();
    ctx.translate(p.x, p.y);
    // Marker ring so Jax is easy to spot on foot.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 2, 14, 11, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(p.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 3, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
    // Legs.
    ctx.fillStyle = '#2c3a4a';
    ctx.fillRect(-3 + swing * 0.4, -5, 6, 4);
    ctx.fillRect(-3 - swing * 0.4, 1, 6, 4);
    // Jacket (Jax wears a teal jacket).
    ctx.fillStyle = '#1d7a6e';
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#155e55';
    ctx.fillRect(-8, -2, 16, 4);
    // Head.
    ctx.fillStyle = '#e8b88a';
    ctx.beginPath(); ctx.arc(6, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath(); ctx.arc(5, -1, 5, Math.PI, Math.PI * 2); ctx.fill();
    // Pistol in hand, pointing at the aim.
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(6, 4); ctx.lineTo(16, 4); ctx.stroke();
    // Muzzle flash.
    if (this.combat.muzzle > 0) {
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.arc(19, 4, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // --- Main loop ---------------------------------------------------------------
  run() {
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Hover state for start-screen buttons.
      if (this.state === 'start') {
        const r = this.canvas.getBoundingClientRect();
        // Hover is computed from the last mouse position.
        for (const b of this.startButtons) {
          b.hover = this.mouse.x >= b.x && this.mouse.x <= b.x + b.w &&
                    this.mouse.y >= b.y && this.mouse.y <= b.y + b.h;
        }
      }
      if (this.state === 'playing') this.update(dt);
      else this.time += dt * 0.2; // keep the world breathing on menus
      this.render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}

// --- Boot ----------------------------------------------------------------------
const canvas = document.getElementById('game');
function fitCanvas() {
  canvas.width = Math.max(960, window.innerWidth);
  canvas.height = Math.max(600, window.innerHeight);
}
fitCanvas();
window.addEventListener('resize', () => {
  fitCanvas();
  game.vw = canvas.width;
  game.vh = canvas.height;
  game.layoutStartButtons();
});

const game = new Game(canvas);
window.__solara = game; // handy for debugging and for the shot poser

// Screenshot posing: ?shot=foot|drive|chase|start
const params = parseShotParams();
if (params.shot) {
  game.city = buildCity(params.seed);
  game.missions = new MissionRunner(game.city.landmarks);
  applyShot(game, params.shot);
}

game.run();
