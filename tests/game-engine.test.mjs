import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/game/engine.js';

globalThis.window = { devicePixelRatio: 1 };

function engine(options = {}) {
  const e = new Engine({ clientWidth: 1280, clientHeight: 800, getContext: () => ({}) });
  e.reset({ seed: 123, ...options });
  return e;
}

function straight(options = {}) {
  const e = engine(options);
  e.runnerSeg.items = [];
  e.runnerSeg.gaps = [];
  e.rebuildCells();
  return e;
}

function advance(e, seconds, fps = 60) {
  for (let n = 0; n < Math.round(seconds * fps); n++) e.update(1 / fps);
}

function onPath(e) {
  const p = e.pos(e.runnerSeg, e.r.t, e.r.l);
  assert.equal(e.cells.get(`${Math.round(p.x)},${Math.round(p.y)}`)?.kind, 'path');
}

for (const fps of [20, 30, 60, 144]) {
  test(`a gap costs one heart and recovery stays safe at ${fps} FPS`, () => {
    const e = straight({ pace: 'swift' });
    e.runnerSeg.gaps = [[10, 11]];
    e.rebuildCells();
    Object.assign(e.r, { t: 9.4, slide: 0.6, turnQueued: true });
    advance(e, 1.4, fps);
    assert.equal(e.r.hearts, 2);
    assert.equal(e.stats.falls, 1);
    assert.equal(e.mode, 'run');
    assert.equal(e.r.slide, 0);
    assert.equal(e.r.turnQueued, false);
    onPath(e);
    advance(e, 0.5, fps);
    assert.equal(e.r.hearts, 2);
    assert.equal(e.stats.falls, 1);
  });

  test(`jump clears a two-tile gap at ${fps} FPS`, () => {
    const e = straight({ pace: 'gentle' });
    e.runnerSeg.gaps = [[10, 11]];
    e.rebuildCells();
    e.r.t = 8.8;
    e.input('jump');
    advance(e, 0.8, fps);
    assert.equal(e.r.hearts, 3);
    assert.equal(e.stats.falls, 0);
    assert.ok(e.r.t > 11.5);
  });
}

for (const dir of [0, 1]) {
  test(`reviving after a fatal gap lands beyond the hole, direction ${dir}`, () => {
    const e = straight();
    e.r.seg = dir;
    const seg = e.runnerSeg;
    seg.items = [];
    seg.gaps = [[10, 11]];
    e.rebuildCells();
    Object.assign(e.r, { t: 9.6, hearts: 1 });
    e.startFall();
    advance(e, 1.2);
    assert.equal(e.mode, 'caught');
    e.revive();
    assert.ok(e.r.t > 11.5);
    onPath(e);
    advance(e, 0.8);
    assert.equal(e.r.hearts, 3);
    assert.equal(e.stats.falls, 1);
  });

  for (const revive of [false, true]) {
    test(`${revive ? 'revive' : 'respawn'} after missed turn uses next straight, direction ${dir}`, () => {
      const e = engine();
      e.r.seg = dir;
      const next = e.segments[dir + 1];
      next.items = [];
      Object.assign(e.r, { t: e.runnerSeg.len + 1.7, slide: 0.5, turnQueued: true });
      e[revive ? 'revive' : 'respawn']();
      assert.equal(e.runnerSeg, next);
      assert.equal(e.r.t, 1);
      assert.equal(e.r.slide, 0);
      assert.equal(e.r.turnQueued, false);
      onPath(e);
      advance(e, 0.8);
      assert.equal(e.r.hearts, 3);
      assert.equal(e.stats.falls, 0);
    });
  }
}

test('recovery avoids a second gap and an obstacle at the landing', () => {
  const e = straight();
  e.runnerSeg.gaps = [[10, 11], [15, 16]];
  e.runnerSeg.items = [{ kind: 'barrier', t: 18, l: 0, lanes: [-1, 0, 1] }];
  e.rebuildCells();
  e.r.t = 9.6;
  e.respawn();
  assert.ok(e.r.t > 18.4);
  onPath(e);
  advance(e, 0.8);
  assert.equal(e.r.hearts, 3);
  assert.equal(e.stats.falls, 0);
});

test('recovery preserves and opens the next unanswered gate', () => {
  const e = straight();
  const gate = { kind: 'gate', t: 18, l: 0, state: 'closed' };
  e.runnerSeg.gaps = [[10, 11]];
  e.runnerSeg.items = [gate];
  e.rebuildCells();
  e.r.t = 9.6;
  e.revive();
  assert.ok(e.r.t < gate.t - 1.7);
  advance(e, 3);
  assert.equal(e.mode, 'gate');
  assert.equal(e.pendingGate, gate);
  assert.equal(e.r.hearts, 3);
});

for (const kind of ['barrier', 'toppled-statue', 'trap', 'braziers', 'lintel']) {
  for (const dir of [0, 1]) {
    test(`${kind} collides only in occupied lanes, direction ${dir}`, () => {
      const e = straight();
      e.r.seg = dir;
      const lanes = ['trap', 'braziers'].includes(kind) ? [-1] : [-1, 0, 1];
      e.runnerSeg.items = [{ kind, t: 12, l: 0, lanes }];
      Object.assign(e.r, { t: 12, l: 1 });
      e.collide();
      assert.equal(e.r.hearts, lanes.includes(1) ? 2 : 3);
      if (!lanes.includes(1)) {
        e.r.l = -1;
        e.collide();
        assert.equal(e.r.hearts, 2);
      }
    });
  }
}

test('lintels require a grounded slide; an airborne dive still hits', () => {
  for (const [z, hearts] of [[0, 3], [0.6, 2]]) {
    const e = straight();
    e.runnerSeg.items = [{ kind: 'lintel', t: 12, l: 0, lanes: [-1, 0, 1] }];
    Object.assign(e.r, { t: 12, slide: 0.5, z });
    e.collide();
    assert.equal(e.r.hearts, hearts);
  }
});

test('jump clearance and collision outcomes agree across frame rates and paces', () => {
  for (const pace of ['gentle', 'standard', 'swift']) {
    for (const fps of [20, 30, 60, 144]) {
      for (const kind of ['barrier', 'toppled-statue', 'trap']) {
        const e = straight({ pace });
        e.runnerSeg.items = [{ kind, t: 12, l: 0, lanes: [-1, 0, 1] }];
        e.r.t = 12 - e.baseSpeed * 0.26;
        e.input('jump');
        advance(e, 0.8, fps);
        assert.equal(e.r.hearts, 3, `${kind}, ${pace}, ${fps} FPS`);
      }
    }
  }
});

test('shield absorbs one collision and invulnerability prevents chained hits', () => {
  const e = straight();
  e.runnerSeg.items = [0, 0.1].map((offset) => ({ kind: 'barrier', t: 12 + offset, l: 0, lanes: [-1, 0, 1] }));
  Object.assign(e.r, { t: 12, shield: true });
  e.collide();
  e.collide();
  assert.equal(e.r.hearts, 3);
  assert.equal(e.r.shield, false);
});

test('reset clears the previous run gate and fallen state', () => {
  const e = engine();
  e.pendingGate = { state: 'asking' };
  e.fallenSent = true;
  e.reset({ seed: 123 });
  assert.equal(e.pendingGate, null);
  assert.equal(e.fallenSent, false);
});

test('an animation timestamp just before initialization cannot run physics backward', () => {
  const e = straight();
  const t = e.r.t;
  e.update(-0.001);
  assert.equal(e.r.t, t);
  assert.equal(e.chaser.anim, 0);
  assert.equal(e.r.anim, 0);
});

test('recovery can reopen an interrupted question gate', () => {
  const e = straight();
  const gate = { kind: 'gate', t: 18, l: 0, state: 'asking' };
  e.runnerSeg.items = [gate];
  e.pendingGate = gate;
  e.r.t = 16;
  e.revive();
  advance(e, 2);
  assert.equal(e.mode, 'gate');
  assert.equal(e.pendingGate, gate);
});

test('recovery finds safe ground across generated paths, speeds and corruption', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const e = engine({ seed, pace: ['gentle', 'standard', 'swift'][seed % 3], gates: 50 });
    e.setCorruption(seed % 2 ? 100 : 0);
    for (let n = 0; n < 25; n++) {
      e.r.t = e.runnerSeg.len + 1.7;
      e.respawn();
      const seg = e.runnerSeg;
      // Exercise every generated gap before moving to the next straight.
      for (const [a] of seg.gaps) {
        e.r.t = a - 0.4;
        e.revive();
        onPath(e);
        const falls = e.stats.falls;
        advance(e, 0.6);
        assert.equal(e.stats.falls, falls, `seed ${seed}, distance ${e.distance}`);
        assert.equal(e.r.hearts, 3);
      }
      for (const it of e.runnerSeg.items) if (it.kind === 'gate') { it.done = true; it.state = 'open'; }
    }
  }
});

test('obstacle drawing centers the footprint and mirrors the corrupt barrier', () => {
  const e = straight();
  const calls = [];
  e.ctx = Object.fromEntries(['save', 'restore', 'translate', 'scale', 'drawImage'].map((name) =>
    [name, (...args) => calls.push([name, ...args])]));
  e.k = 1; e.ox = 0; e.oy = 0;
  for (const realm of ['divine', 'corrupt']) {
    for (const flip of [false, true]) {
      const id = `${realm}-barrier`;
      e.img[id] = { width: 640, height: 640 };
      calls.length = 0;
      e.drawSprite({ id, x: 0, y: 0, size: 640, flip });
      const draw = calls.find(([name]) => name === 'drawImage');
      assert.equal(draw[3], realm === 'divine' ? -414 : -424);
      assert.equal(calls.some(([name]) => name === 'scale'), flip !== (realm === 'corrupt'));
    }
    const positions = [];
    for (const layer of ['back', 'front']) {
      const id = `${realm}-slide-lintel-${layer}`;
      e.img[id] = { width: 640, height: 640 };
      calls.length = 0;
      e.drawSprite({ id, x: 0, y: 0, size: 640 });
      positions.push(calls.find(([name]) => name === 'drawImage').slice(2));
    }
    assert.deepEqual(positions[0], positions[1]);
  }
});
