// Solara Bay — story missions and side work.
// Jax Marlowe is back in Solara Bay after three years away, broke and
// owing the wrong people. Mara Quinn, who runs a garage in Old Town,
// puts him to work. Six story missions, then free roam with taxi fares.

import { dist } from './util.js';

export const MISSION_LIST = [
  {
    id: 'welcome',
    title: 'Welcome Back',
    giver: 'Mara Quinn',
    brief: 'Mara needs a driver. Get to her garage in Old Town — on foot or in a car, your call.',
    objective: 'Reach Mara\'s Garage',
    target: 'marasGarage',
    reward: 150,
    intro: 'MARA: Jax. Three years, and you come back broke. Get over here — I\'ve got work.',
  },
  {
    id: 'getaway',
    title: 'The Getaway',
    giver: 'Mara Quinn',
    brief: 'Eddie lifted a sports car from the Sunset Strip and the cops are on him. Pick him up and lose the heat.',
    objective: 'Pick up Eddie, then lose the cops',
    target: 'eddiesBar',
    reward: 400,
    intro: 'EDDIE: They\'re right behind me, Jax! Get me out of here!',
    wantedOnStart: 2,
    pickupPed: true,
  },
  {
    id: 'pickup',
    title: 'The Pickup',
    giver: 'Mara Quinn',
    brief: 'A package is waiting at the docks. Collect it and bring it back to the garage. No questions, no cops.',
    objective: 'Collect the package at the Docks',
    target: 'docks',
    reward: 350,
    intro: 'MARA: A crate came in on the night boat. Grab it before someone else does.',
  },
  {
    id: 'hotwheels',
    title: 'Hot Wheels',
    giver: 'Eddie Doyle',
    brief: 'A mint sports car is parked outside the Palms Hotel. Take it — quietly — and bring it to the garage.',
    objective: 'Steal the sports car at the Palms Hotel',
    target: 'hotel',
    reward: 600,
    intro: 'EDDIE: Yellow sports car, Palms Hotel, keys in the sun visor. Don\'t scratch it.',
    needCar: 'Sports',
  },
  {
    id: 'bankjob',
    title: 'The Bay Trust Job',
    giver: 'Mara Quinn',
    brief: 'The bank on North Heights keeps its vault light on Fridays. Get in, grab the cash, get out. Expect trouble.',
    objective: 'Rob Bay Trust Bank, then escape',
    target: 'bank',
    reward: 1200,
    intro: 'MARA: In and out in two minutes. The vault, the bags, the door. Go.',
    wantedOnStart: 3,
    grabCash: true,
  },
  {
    id: 'king',
    title: 'King of the Bay',
    giver: 'Mara Quinn',
    brief: 'The crew that owns the stadium wants the Bay for themselves. Take the package to the stadium and end it — whatever it takes.',
    objective: 'Deliver the package to Solara Stadium',
    target: 'stadium',
    reward: 2000,
    intro: 'MARA: One last job, Jax. After tonight, the Bay is ours.',
    wantedOnStart: 2,
    grabCash: false,
  },
];

export class MissionRunner {
  constructor(landmarks) {
    this.landmarks = landmarks;
    this.index = 0;              // which story mission is active
    this.stage = 'toTarget';     // toTarget | doing | return | done
    this.active = null;          // current mission object
    this.targetPos = null;       // {x, y} waypoint
    this.timer = 0;
    this.message = '';
    this.messageTimer = 0;
    this.fare = null;            // active taxi fare {from, to, paid, timer}
    this.completed = 0;
    this.storyDone = false;
  }

  startMission(i) {
    const m = MISSION_LIST[i];
    if (!m) { this.storyDone = true; this.active = null; return; }
    this.active = m;
    this.stage = 'toTarget';
    this.index = i;
    this.timer = 0;
    this.fare = null; // a story mission always outranks a taxi fare
    const lm = this.landmarks[m.target];
    this.targetPos = { x: lm.x, y: lm.y };
    this.showMessage(m.intro, 5);
    return m;
  }

  showMessage(text, secs = 4) {
    this.message = text;
    this.messageTimer = secs;
  }

  update(dt, player, game) {
    if (this.messageTimer > 0) this.messageTimer -= dt;
    if (!this.active) return;

    const m = this.active;
    const d = this.targetPos ? dist(player.x, player.y, this.targetPos.x, this.targetPos.y) : 9999;

    if (this.stage === 'toTarget' && d < 70) {
      if (m.id === 'welcome') {
        this.completeMission(game);
      } else if (m.id === 'getaway' && m.pickupPed) {
        this.stage = 'escape';
        this.showMessage('EDDIE: Drive! Lose the cops and get back to the garage!', 5);
        this.targetPos = { x: this.landmarks.marasGarage.x, y: this.landmarks.marasGarage.y };
        game.police.addHeat(1, game.time);
      } else if (m.id === 'pickup') {
        this.stage = 'return';
        this.showMessage('Package secured. Bring it back to Mara\'s Garage.', 4);
        this.targetPos = { x: this.landmarks.marasGarage.x, y: this.landmarks.marasGarage.y };
      } else if (m.id === 'hotwheels') {
        this.stage = 'steal';
        this.showMessage('There it is — the yellow sports car. Get in and drive it to the garage.', 5);
        this.targetPos = { x: this.landmarks.hotel.x, y: this.landmarks.hotel.y };
      } else if (m.id === 'bankjob') {
        this.stage = 'grab';
        this.timer = 90; // grab the cash, then escape
        this.showMessage('Grab the cash! Get out before the heat closes in!', 4);
      } else if (m.id === 'king') {
        this.stage = 'escape';
        this.showMessage('They know. Fight your way out and finish this at the stadium!', 5);
        this.targetPos = { x: this.landmarks.stadium.x, y: this.landmarks.stadium.y };
        game.police.addHeat(1, game.time);
      }
    } else if (this.stage === 'escape' && d < 70) {
      if (m.id === 'getaway') {
        if (game.police.wanted === 0) this.completeMission(game);
        else this.showMessage('Still hot! Lose the cops first.', 2);
      } else if (m.id === 'king') {
        this.completeMission(game);
      }
    } else if (this.stage === 'return' && d < 70) {
      this.completeMission(game);
    } else if (this.stage === 'steal') {
      // Completes when the player drives a Sports car to the garage.
      if (player.inCar && player.car.model.name === 'Sports') {
        this.stage = 'return';
        this.targetPos = { x: this.landmarks.marasGarage.x, y: this.landmarks.marasGarage.y };
        this.showMessage('Nice. Now bring it home — in one piece.', 4);
      }
    } else if (this.stage === 'grab') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.stage = 'escape';
        this.targetPos = { x: this.landmarks.marasGarage.x, y: this.landmarks.marasGarage.y };
        this.showMessage('That\'s the lot. Lose the heat and get back to the garage!', 5);
      }
    }
  }

  completeMission(game) {
    const m = this.active;
    game.cash += m.reward;
    game.stats.missionsDone++;
    this.completed++;
    game.sound.missionDone();
    this.showMessage(`MISSION COMPLETE: ${m.title}  +$${m.reward}`, 5);
    this.active = null;
    this.stage = 'done';
    this.targetPos = null;
    const next = this.index + 1;
    if (next >= MISSION_LIST.length) {
      this.storyDone = true;
      this.showMessage('STORY COMPLETE — Solara Bay is yours. Free roam: fares, cash and chaos.', 7);
    } else {
      setTimeout(() => this.startMission(next), 2500);
    }
  }

  failMission(game, reason) {
    this.showMessage(`MISSION FAILED: ${reason}`, 5);
    this.active = null;
    this.stage = 'done';
    this.targetPos = null;
    // Retry the same mission shortly after.
    const retry = this.index;
    setTimeout(() => this.startMission(retry), 3000);
  }

  // --- Taxi fares: side work after the first mission ---------------------
  offerFare(player, rng) {
    if (this.fare || this.active) return null;
    const lm = this.landmarks;
    const spots = [lm.hotel, lm.pier, lm.bank, lm.stadium, lm.docks, lm.eddiesBar];
    const dest = spots[Math.floor(rng() * spots.length)];
    const pay = 80 + Math.floor(rng() * 120);
    this.fare = {
      to: { x: dest.x, y: dest.y },
      name: dest.name,
      pay,
      timer: 75,
      pickedUp: false,
    };
    // The fare customer stands near the player.
    this.fare.from = { x: player.x + 60, y: player.y + 40 };
    this.showMessage(`FARE: A customer wants a ride to ${dest.name} — $${pay}. Pick them up!`, 5);
    return this.fare;
  }

  updateFare(dt, player, game) {
    if (!this.fare) return;
    const f = this.fare;
    f.timer -= dt;
    if (f.timer <= 0) {
      this.showMessage('Fare expired — the customer walked away.', 3);
      this.fare = null;
      return;
    }
    if (!f.pickedUp) {
      if (dist(player.x, player.y, f.from.x, f.from.y) < 40 && player.inCar) {
        f.pickedUp = true;
        this.showMessage(`Passenger aboard. Get to ${f.name} — fast pays better.`, 4);
      }
    } else if (dist(player.x, player.y, f.to.x, f.to.y) < 70 && player.inCar) {
      const bonus = f.timer > 30 ? 40 : 0;
      game.cash += f.pay + bonus;
      game.stats.faresDone++;
      game.sound.pickup();
      this.showMessage(`FARE COMPLETE +$${f.pay + bonus}`, 4);
      this.fare = null;
    }
  }

  get objectiveText() {
    if (this.fare && !this.active) {
      return this.fare.pickedUp
        ? `Fare: ${this.fare.name}`
        : 'Fare: pick up the passenger';
    }
    if (!this.active) return this.storyDone ? 'Free roam — Solara Bay is yours' : 'Talk to Mara';
    const m = this.active;
    if (this.stage === 'toTarget') return m.objective;
    if (this.stage === 'escape') return 'Escape — lose the cops';
    if (this.stage === 'return') return 'Return to Mara\'s Garage';
    if (this.stage === 'steal') return 'Steal the yellow sports car';
    if (this.stage === 'grab') return `Grab the cash — ${Math.ceil(this.timer)}s`;
    return m.objective;
  }
}
