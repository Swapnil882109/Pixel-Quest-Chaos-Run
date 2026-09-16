(function () {

// ============================================================
// SETUP
// ============================================================
var canvas = document.getElementById('cv');
var ctx = canvas.getContext('2d');
var W = 960, H = 540;

// ============================================================
// STORAGE
// ============================================================
function loadBest() {
  try {
    var v = localStorage.getItem('pq_best');
    if (v) { var n = parseInt(v, 10); if (!isNaN(n)) return n; }
  } catch (e) {}
  return 0;
}
function saveBest(v) {
  try { localStorage.setItem('pq_best', String(v)); } catch (e) {}
}

// ============================================================
// GAME STATE
// ============================================================
var G = {
  state: 'menu',
  level: 1,
  maxLevel: 6,
  score: 0,
  coins: 0,
  lives: 3,
  frame: 0,
  levelFrame: 0,
  levelWidth: 2000,
  shake: 0,
  best: loadBest(),
  themeIdx: 0
};

// ============================================================
// THEMES
// ============================================================
var THEMES = [
  { skyTop:'#7ec0e8', skyBot:'#c8e8f4', plat:'#6a9a4a', platTop:'#8aba5a',
    dirt:'#5a4a2a', tree:'#2a5a2a', accent:'#a0d060' },
  { skyTop:'#f0b870', skyBot:'#fce0a0', plat:'#c89050', platTop:'#e0b070',
    dirt:'#8a6030', tree:'#6a5a30', accent:'#ffd080' },
  { skyTop:'#2a3a50', skyBot:'#4a5e70', plat:'#3a5a4a', platTop:'#4a6a5a',
    dirt:'#2a3a2a', tree:'#1a3a2a', accent:'#70b090' },
  { skyTop:'#3a1a10', skyBot:'#7a2a10', plat:'#6a3020', platTop:'#a04020',
    dirt:'#3a1a08', tree:'#3a1008', accent:'#ff7030' },
  { skyTop:'#8ab8d8', skyBot:'#d8eef8', plat:'#a0c8e0', platTop:'#c8e4f4',
    dirt:'#7088a0', tree:'#6080a0', accent:'#d0f0ff' },
  { skyTop:'#1a1030', skyBot:'#3a2850', plat:'#4a3868', platTop:'#6a5890',
    dirt:'#2a2040', tree:'#1a1030', accent:'#a080e0' }
];
function theme() { return THEMES[G.themeIdx]; }

// ============================================================
// INPUT
// ============================================================
var keys = { left:false, right:false, jump:false, dash:false, jumpJust:false };

document.addEventListener('keydown', function (e) {
  var k = (e.key || '').toLowerCase();
  if (k === 'a' || k === 'arrowleft') keys.left = true;
  if (k === 'd' || k === 'arrowright') keys.right = true;
  if (k === 'w' || k === 'arrowup' || k === ' ') {
    if (!keys.jump) keys.jumpJust = true;
    keys.jump = true;
    e.preventDefault();
  }
  if (k === 'shift') { keys.dash = true; e.preventDefault(); }
  if (k === 'p') {
    if (G.state === 'playing') G.state = 'paused';
    else if (G.state === 'paused') G.state = 'playing';
  }
  if (k === 'r') {
    if (G.state === 'playing' || G.state === 'paused' || G.state === 'levelComplete') {
      startLevel(G.level);
    }
  }
  if (k === 'enter' || k === ' ') {
    if (G.state === 'menu') startGame();
    else if (G.state === 'gameover') startGame();
    else if (G.state === 'win') startGame();
    else if (G.state === 'levelComplete') nextLevel();
  }
});

document.addEventListener('keyup', function (e) {
  var k = (e.key || '').toLowerCase();
  if (k === 'a' || k === 'arrowleft') keys.left = false;
  if (k === 'd' || k === 'arrowright') keys.right = false;
  if (k === 'w' || k === 'arrowup' || k === ' ') { keys.jump = false; e.preventDefault(); }
  if (k === 'shift') { keys.dash = false; e.preventDefault(); }
});

// ============================================================
// AUDIO
// ============================================================
var actx = null;
function initAudio() {
  if (actx) return;
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (AC) actx = new AC();
  } catch (e) { actx = null; }
}
function beep(freq, dur, type, vol) {
  if (!actx) return;
  try {
    var o = actx.createOscillator();
    var g = actx.createGain();
    o.type = type || 'square';
    o.frequency.value = freq;
    g.gain.value = (vol == null) ? 0.05 : vol;
    o.connect(g);
    g.connect(actx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.stop(actx.currentTime + dur + 0.02);
  } catch (e) {}
}
function sfxJump()  { beep(440, 0.10, 'square', 0.05); }
function sfxCoin()  { beep(1000, 0.06, 'square', 0.05); }
function sfxHurt()  { beep(160, 0.20, 'sawtooth', 0.07); }
function sfxPower() { beep(520, 0.08); setTimeout(function () { beep(780, 0.10); }, 80); }
function sfxDash()  { beep(300, 0.07); }
function sfxKill()  { beep(200, 0.09); }
function sfxLevel() { beep(600, 0.10); setTimeout(function () { beep(820, 0.10); }, 100); setTimeout(function () { beep(1100, 0.16); }, 200); }
function sfxOver()  { beep(280, 0.16); setTimeout(function () { beep(180, 0.22); }, 150); }

// ============================================================
// PLAYER
// ============================================================
var player = {
  x:80, y:300, w:26, h:34,
  vx:0, vy:0,
  onGround:false,
  facing:1,
  coyote:0,
  jumpBuf:0,
  jumpsLeft:1,
  maxJumps:1,
  dashCd:0, dashTime:0, dashDir:1,
  invuln:0,
  speedBoost:0, jumpBoost:0, shield:0, star:0, magnet:0,
  animT:0,
  state:'idle',
  landT:0
};

// ============================================================
// WORLD
// ============================================================
var platforms = [];
var enemies = [];
var coins = [];
var powerups = [];
var particles = [];
var portal = null;
var boss = null;
var cam = { x:0, y:0, shakeX:0, shakeY:0 };

// ============================================================
// HELPERS
// ============================================================
function rnd(a, b) { return Math.random() * (b - a) + a; }
function rndi(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}
function roundRect(x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function circlePath(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

// ============================================================
// PARTICLES
// ============================================================
function emit(x, y, count, speed, color) {
  for (var i = 0; i < count; i++) {
    var a = Math.random() * Math.PI * 2;
    var s = Math.random() * speed / 60 + 0.5;
    particles.push({
      x:x, y:y,
      vx:Math.cos(a) * s,
      vy:Math.sin(a) * s - 0.8,
      life:rndi(20, 45),
      maxLife:45,
      r:rnd(2, 4.5),
      color:color
    });
  }
}
function updateParticles() {
  for (var i = particles.length - 1; i >= 0; i--) {
    var p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08;
    p.vx *= 0.98;
    p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ============================================================
// LEVEL GENERATION
// ============================================================
var GROUND_Y = 460;

function makePlatform(x, y, w, h, type) {
  return {
    x:x, y:y, w:w, h:h,
    type:type,
    baseX:x, baseY:y,
    mt:Math.random() * 100,
    hidden:false,
    fallTimer:0,
    triggered:false
  };
}

function generateLevel(level) {
  platforms = [];
  enemies = [];
  coins = [];
  powerups = [];
  particles = [];
  portal = null;
  boss = null;

  G.themeIdx = (level - 1) % THEMES.length;
  var diff = (level - 1) / (G.maxLevel - 1);

  platforms.push(makePlatform(40, GROUND_Y, 220, 22, 'normal'));

  var x = 260;
  var lastY = GROUND_Y;
  var targetX = 2400 + level * 350;

  while (x < targetX) {
    var gap = rndi(95, 160);
    if (diff > 0.4 && Math.random() < 0.25) gap = rndi(160, 200);

    var w = rndi(85, 155);
    var dy = rndi(-65, 55);
    var ny = clamp(lastY + dy, 260, GROUND_Y + 10);

    var type = 'normal';
    var r = Math.random();
    if (level >= 2 && r < 0.18) type = 'moving';
    else if (level >= 3 && r < 0.28) type = 'bounce';
    else if (level >= 4 && r < 0.36) type = 'falling';
    else if (level >= 5 && r < 0.42) type = 'ice';

    var p = makePlatform(x + gap, ny, w, 20, type);
    platforms.push(p);

    if (Math.random() < 0.75) {
      var cn = rndi(1, 4);
      for (var ci = 0; ci < cn; ci++) {
        var cx = p.x + 25;
        if (cn > 1) cx += ci * (p.w - 50) / (cn - 1);
        coins.push({
          x:cx,
          y:p.y - 32 - rnd(0, 8),
          r:9, val:10,
          bob:Math.random() * 6.28,
          spin:Math.random() * 6.28,
          taken:false, big:false,
          color:'#ffd040'
        });
      }
      if (Math.random() < 0.15) {
        coins.push({
          x:p.x + p.w / 2,
          y:p.y - 58,
          r:13, val:50,
          bob:Math.random() * 6.28,
          spin:Math.random() * 6.28,
          taken:false, big:true,
          color:'#ffe860'
        });
      }
    }

    if (Math.random() < 0.10 + diff * 0.05) {
      var kinds = ['speed', 'jump', 'shield', 'double', 'star'];
      powerups.push({
        x:p.x + p.w / 2 - 12,
        y:p.y - 50,
        w:24, h:24,
        kind:kinds[rndi(0, kinds.length - 1)],
        bob:Math.random() * 6.28,
        taken:false
      });
    }

    if (Math.random() < 0.20 + diff * 0.28) {
      var e = {
        x:p.x + rnd(15, Math.max(16, p.w - 35)),
        y:p.y - 26,
        w:22, h:24,
        kind:'walker',
        dir:Math.random() < 0.5 ? 1 : -1,
        speed:0.85 + level * 0.07,
        patrolMin:p.x,
        patrolMax:p.x + p.w,
        alive:true,
        vy:0, anim:0, hurtT:0
      };
      if (level >= 3 && Math.random() < 0.4) {
        e.kind = 'flyer';
        e.w = 24; e.h = 20;
        e.baseY = p.y - 70;
        e.y = e.baseY;
        e.phase = Math.random() * 6.28;
        e.patrolMin = p.x - 60;
        e.patrolMax = p.x + p.w + 60;
      }
      enemies.push(e);
    }

    lastY = ny;
    x = p.x + p.w;
  }

  var last = platforms[platforms.length - 1];
  var finX = last.x + last.w + 130;
  var finY = Math.max(260, last.y - 20);
  platforms.push(makePlatform(finX, finY, 200, 22, 'normal'));
  portal = { x:finX + 80, y:finY - 80, w:46, h:66, t:0 };

  if (level === G.maxLevel) {
    boss = {
      x:finX - 250, y:finY - 90, w:64, h:64,
      hp:18, maxHp:18, vx:-1.2, dir:-1,
      t:0, hurtT:0, phaseT:0
    };
  }

  G.levelWidth = x + 400;

  player.x = 80;
  player.y = GROUND_Y - 100;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.jumpsLeft = player.maxJumps;
  player.invuln = 60;
  player.dashTime = 0;
  player.dashCd = 0;
  player.speedBoost = 0;
  player.jumpBoost = 0;
  player.shield = 0;
  player.star = 0;
  player.magnet = 0;
  player.state = 'idle';

  cam.x = 0;
  cam.y = 0;
}

// ============================================================
// GAME FLOW
// ============================================================
function resetKeys() {
  keys.left = false;
  keys.right = false;
  keys.jump = false;
  keys.dash = false;
  keys.jumpJust = false;
}

function startGame() {
  resetKeys();
  G.score = 0;
  G.coins = 0;
  G.lives = 3;
  G.level = 1;
  G.frame = 0;
  G.levelFrame = 0;
  player.maxJumps = 1;
  generateLevel(1);
  G.state = 'playing';
}

function startLevel(n) {
  resetKeys();
  G.level = n;
  G.levelFrame = 0;
  player.maxJumps = 1;
  generateLevel(n);
  G.state = 'playing';
}

function nextLevel() {
  if (G.level >= G.maxLevel) {
    G.state = 'win';
    if (G.score > G.best) { G.best = G.score; saveBest(G.best); }
    return;
  }
  startLevel(G.level + 1);
}

function levelComplete() {
  sfxLevel();
  G.score += 100;
  if (G.score > G.best) { G.best = G.score; saveBest(G.best); }
  G.state = 'levelComplete';
}

function hurtPlayer(fromX) {
  if (player.invuln > 0) return;

  if (player.shield > 0) {
    player.shield = 0;
    player.invuln = 60;
    emit(player.x + player.w / 2, player.y + player.h / 2, 20, 260, '#80e0ff');
    G.shake = 6;
    return;
  }

  G.lives--;
  player.invuln = 90;
  player.vx = (player.x < fromX ? -6 : 6);
  player.vy = -6;
  G.shake = 10;
  emit(player.x + player.w / 2, player.y + player.h / 2, 18, 240, '#ff8080');
  sfxHurt();

  if (G.lives <= 0) {
    G.state = 'gameover';
    if (G.score > G.best) { G.best = G.score; saveBest(G.best); }
    sfxOver();
  }
}

// ============================================================
// PLAYER UPDATE
// ============================================================
function updatePlayer() {
  if (player.invuln > 0)    player.invuln--;
  if (player.speedBoost > 0) player.speedBoost--;
  if (player.jumpBoost > 0)  player.jumpBoost--;
  if (player.shield > 0)     player.shield--;
  if (player.star > 0)       player.star--;
  if (player.magnet > 0)     player.magnet--;
  if (player.dashCd > 0)     player.dashCd--;
  if (player.dashTime > 0)   player.dashTime--;
  if (player.landT > 0)      player.landT--;

  if (keys.jumpJust) {
    player.jumpBuf = 8;
    keys.jumpJust = false;
  }
  if (player.jumpBuf > 0) player.jumpBuf--;

  if (player.onGround) player.coyote = 8;
  else if (player.coyote > 0) player.coyote--;

  var maxSpeed = 4.6 * (player.speedBoost > 0 ? 1.5 : 1);
  if (player.dashTime > 0) {
    player.vx = player.dashDir * 13;
  } else {
    if (keys.left && !keys.right) {
      player.vx -= 0.75;
      player.facing = -1;
    } else if (keys.right && !keys.left) {
      player.vx += 0.75;
      player.facing = 1;
    } else {
      player.vx *= player.onGround ? 0.82 : 0.92;
      if (Math.abs(player.vx) < 0.15) player.vx = 0;
    }
    player.vx = clamp(player.vx, -maxSpeed, maxSpeed);
  }

  var canJump = player.onGround || player.coyote > 0;
  if (player.jumpBuf > 0 && canJump) {
    player.vy = -11.2 * (player.jumpBoost > 0 ? 1.18 : 1);
    player.onGround = false;
    player.coyote = 0;
    player.jumpBuf = 0;
    player.jumpsLeft = player.maxJumps - 1;
    player.state = 'jump';
    sfxJump();
    emit(player.x + player.w / 2, player.y + player.h, 8, 160, '#ffffff');
  } else if (player.jumpBuf > 0 && !player.onGround && player.jumpsLeft > 0) {
    player.vy = -11.2 * 0.92 * (player.jumpBoost > 0 ? 1.15 : 1);
    player.jumpsLeft--;
    player.jumpBuf = 0;
    player.state = 'jump';
    sfxJump();
    emit(player.x + player.w / 2, player.y + player.h, 12, 200, '#a8d0ff');
  }

  if (!keys.jump && player.vy < -3) player.vy *= 0.86;

  if (keys.dash && player.dashCd <= 0 && player.dashTime <= 0) {
    player.dashTime = 12;
    player.dashCd = 40;
    player.dashDir = player.facing;
    player.vx = player.dashDir * 13;
    sfxDash();
    emit(player.x + player.w / 2, player.y + player.h / 2, 12, 260, '#ffe060');
    G.shake = 4;
  }

  if (player.dashTime <= 0) player.vy += 0.62;
  if (player.vy > 14) player.vy = 14;

  player.x += player.vx;
  for (var i = 0; i < platforms.length; i++) {
    var p = platforms[i];
    if (p.hidden) continue;
    if (!aabb(player, p)) continue;
    var overlapL = (player.x + player.w) - p.x;
    var overlapR = (p.x + p.w) - player.x;
    if (overlapL < overlapR) player.x = p.x - player.w;
    else player.x = p.x + p.w;
    player.vx = 0;
  }

  var wasOnGround = player.onGround;
  player.y += player.vy;
  player.onGround = false;

  for (var j = 0; j < platforms.length; j++) {
    var p2 = platforms[j];
    if (p2.hidden) continue;
    if (!aabb(player, p2)) continue;

    var topOverlap = (player.y + player.h) - p2.y;
    var botOverlap = (p2.y + p2.h) - player.y;
    var sideL = (player.x + player.w) - p2.x;
    var sideR = (p2.x + p2.w) - player.x;
    var minSide = Math.min(sideL, sideR);

    if (player.vy >= 0 && topOverlap <= Math.max(14, player.vy + 4) && topOverlap <= minSide) {
      player.y = p2.y - player.h;
      player.vy = 0;
      player.onGround = true;

      if (p2.type === 'bounce') {
        player.vy = -14;
        player.onGround = false;
        player.jumpsLeft = player.maxJumps;
        sfxJump();
        emit(player.x + player.w / 2, p2.y, 10, 200, '#ff80c0');
      }
      if (p2.type === 'falling' && !p2.triggered) {
        p2.triggered = true;
        p2.fallTimer = 22;
      }
    } else if (player.vy < 0 && botOverlap <= minSide) {
      player.y = p2.y + p2.h;
      player.vy = 0;
    } else {
      if (sideL < sideR) player.x = p2.x - player.w;
      else player.x = p2.x + p2.w;
      player.vx = 0;
    }
  }

  if (player.onGround && !wasOnGround) {
    player.landT = 6;
    player.jumpsLeft = player.maxJumps;
    emit(player.x + player.w / 2, player.y + player.h, 5, 120, '#ffffff');
  }

  if (player.dashTime > 0) player.state = 'dash';
  else if (player.vy < -1) player.state = 'jump';
  else if (player.vy > 1.5 && !player.onGround) player.state = 'fall';
  else if (Math.abs(player.vx) > 0.5) player.state = 'run';
  else player.state = 'idle';
  player.animT += (player.state === 'run' ? Math.abs(player.vx) * 0.4 + 0.3 : 1);

  if (player.x < 0) { player.x = 0; player.vx = 0; }
  if (player.x > G.levelWidth - player.w) player.x = G.levelWidth - player.w;
  if (player.y > H + 250) hurtPlayer(player.x);

  if (player.magnet > 0) {
    for (var ci = 0; ci < coins.length; ci++) {
      var c = coins[ci];
      if (c.taken) continue;
      var dx = (player.x + player.w / 2) - c.x;
      var dy = (player.y + player.h / 2) - c.y;
      var d2 = dx * dx + dy * dy;
      if (d2 < 40000 && d2 > 1) {
        var d = Math.sqrt(d2);
        c.x += dx / d * 4;
        c.y += dy / d * 4;
      }
    }
  }

  if (portal && !boss) {
    if (aabb(player, portal)) levelComplete();
  }
}

// ============================================================
// PLATFORMS
// ============================================================
function updatePlatforms() {
  for (var i = 0; i < platforms.length; i++) {
    var p = platforms[i];
    if (p.type === 'moving') {
      p.mt += 0.02;
      var ny = p.baseY + Math.sin(p.mt) * 35;
      if (player.onGround && aabb(player, { x:p.x, y:ny - 2, w:p.w, h:p.h + 8 })) {
        player.y += ny - p.y;
      }
      p.y = ny;
    }
    if (p.type === 'falling' && p.triggered) {
      p.fallTimer--;
      if (p.fallTimer <= 0) {
        p.y += 4;
        if (p.y > H + 200) p.hidden = true;
      }
    }
  }
}

// ============================================================
// ENEMIES
// ============================================================
function updateEnemies() {
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (!e.alive) continue;
    if (e.hurtT > 0) e.hurtT--;
    e.anim += 0.15;

    if (e.kind === 'walker') {
      e.x += e.dir * e.speed;
      if (e.x < e.patrolMin) { e.x = e.patrolMin; e.dir = 1; }
      if (e.x + e.w > e.patrolMax) { e.x = e.patrolMax - e.w; e.dir = -1; }
    } else if (e.kind === 'flyer') {
      e.x += e.dir * e.speed;
      if (e.x < e.patrolMin) { e.x = e.patrolMin; e.dir = 1; }
      if (e.x + e.w > e.patrolMax) { e.x = e.patrolMax - e.w; e.dir = -1; }
      e.phase += 0.08;
      e.y = e.baseY + Math.sin(e.phase) * 20;
    } else if (e.kind === 'proj') {
      e.x += e.vx;
      e.y += e.vy;
      e.t = (e.t || 0) + 1;
      if (e.t > 300 || e.x < -40 || e.x > G.levelWidth + 40 || e.y < -40 || e.y > H + 200) {
        e.alive = false;
      }
    }

    if (e.kind !== 'proj' && aabb(player, e)) {
      if (player.star > 0 || player.dashTime > 0) {
        e.alive = false;
        G.score += 25;
        sfxKill();
        emit(e.x + e.w / 2, e.y + e.h / 2, 14, 220, '#ffd060');
        G.shake = 3;
      } else if (player.vy > 0.5 && (player.y + player.h) - e.y < 18) {
        e.alive = false;
        G.score += 25;
        player.vy = -9;
        player.jumpsLeft = player.maxJumps - 1;
        sfxKill();
        emit(e.x + e.w / 2, e.y + e.h / 2, 14, 220, '#ffd060');
        G.shake = 3;
      } else if (player.invuln <= 0) {
        hurtPlayer(e.x + e.w / 2);
      }
    }
    if (e.kind === 'proj' && aabb(player, e) && player.invuln <= 0) {
      hurtPlayer(e.x);
      e.alive = false;
    }
  }
}

// ============================================================
// COINS
// ============================================================
function updateCoins() {
  for (var i = 0; i < coins.length; i++) {
    var c = coins[i];
    if (c.taken) continue;
    c.bob += 0.07;
    c.spin += 0.09;
    var cy = c.y + Math.sin(c.bob) * 3;
    if (aabb(player, { x:c.x - c.r, y:cy - c.r, w:c.r * 2, h:c.r * 2 })) {
      c.taken = true;
      G.coins++;
      G.score += c.val;
      sfxCoin();
      emit(c.x, cy, 8, 200, c.color);
    }
  }
}

// ============================================================
// POWERUPS
// ============================================================
function updatePowerups() {
  for (var i = 0; i < powerups.length; i++) {
    var pu = powerups[i];
    if (pu.taken) continue;
    pu.bob += 0.08;
    var py = pu.y + Math.sin(pu.bob) * 4;
    if (aabb(player, { x:pu.x, y:py, w:pu.w, h:pu.h })) {
      pu.taken = true;
      G.score += 50;
      sfxPower();
      emit(pu.x + pu.w / 2, py + pu.h / 2, 16, 260, '#80ffd0');
      if (pu.kind === 'speed')  player.speedBoost = 360;
      if (pu.kind === 'jump')   player.jumpBoost = 360;
      if (pu.kind === 'shield') player.shield = 1;
      if (pu.kind === 'double') { player.maxJumps = 2; player.jumpsLeft = 2; }
      if (pu.kind === 'star')   player.star = 300;
    }
  }
}

// ============================================================
// BOSS
// ============================================================
function updateBoss() {
  if (!boss) return;
  boss.t++;
  if (boss.hurtT > 0) boss.hurtT--;

  var rage = 1 + (1 - boss.hp / boss.maxHp) * 1.2;
  boss.x += boss.vx * rage;
  if (boss.x < 200) { boss.x = 200; boss.vx = Math.abs(boss.vx); }
  if (boss.x + boss.w > G.levelWidth - 100) {
    boss.x = G.levelWidth - 100 - boss.w;
    boss.vx = -Math.abs(boss.vx);
  }
  boss.y = (GROUND_Y - 130) + Math.sin(boss.t * 0.04) * 18;

  boss.phaseT++;
  if (boss.phaseT > 70 / rage) {
    boss.phaseT = 0;
    var dx = (player.x + player.w / 2) - (boss.x + boss.w / 2);
    var dy = (player.y + player.h / 2) - (boss.y + boss.h / 2);
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    enemies.push({
      x:boss.x + boss.w / 2 - 8,
      y:boss.y + boss.h / 2 - 8,
      w:16, h:16, kind:'proj',
      vx:dx / d * 4.5,
      vy:dy / d * 4.5,
      alive:true, anim:0, t:0
    });
  }

  if (aabb(player, boss)) {
    if (player.star > 0 || player.dashTime > 0 ||
        (player.vy > 0.5 && (player.y + player.h) - boss.y < 20)) {
      boss.hp--;
      boss.hurtT = 8;
      player.vy = -9;
      player.dashTime = 0;
      emit(boss.x + boss.w / 2, boss.y + boss.h / 2, 12, 240, '#ff6060');
      G.shake = 5;
    } else if (player.invuln <= 0) {
      hurtPlayer(boss.x + boss.w / 2);
    }
  }

  if (boss.hp <= 0) {
    G.score += 1000;
    emit(boss.x + boss.w / 2, boss.y + boss.h / 2, 50, 320, '#ffc040');
    G.shake = 18;
    sfxLevel();
    boss = null;
  }
}

// ============================================================
// CAMERA
// ============================================================
function updateCamera() {
  var tx = player.x + player.w / 2 - W / 2;
  var ty = player.y + player.h / 2 - H / 2 - 20;
  cam.x = lerp(cam.x, tx, 0.09);
  cam.y = lerp(cam.y, ty, 0.08);
  cam.x = clamp(cam.x, 0, Math.max(0, G.levelWidth - W));
  cam.y = clamp(cam.y, -80, 160);

  if (G.shake > 0) {
    cam.shakeX = rnd(-1, 1) * G.shake;
    cam.shakeY = rnd(-1, 1) * G.shake;
    G.shake *= 0.88;
    if (G.shake < 0.4) G.shake = 0;
  } else {
    cam.shakeX = 0;
    cam.shakeY = 0;
  }
}

// ============================================================
// RENDER — BACKGROUND
// ============================================================
function drawBackground() {
  var t = theme();
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, t.skyTop);
  g.addColorStop(0.7, t.skyBot);
  g.addColorStop(1, t.skyBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  var sx = W * 0.75 - cam.x * 0.02;
  var sy = 100 - cam.y * 0.05;
  var sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 180);
  sg.addColorStop(0, 'rgba(255,250,200,0.55)');
  sg.addColorStop(1, 'rgba(255,250,200,0)');
  ctx.fillStyle = sg;
  circlePath(sx, sy, 180); ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  for (var i = 0; i < 6; i++) {
    var cx = ((i * 260 - cam.x * 0.15) % (W + 300)) - 150;
    var cy = 70 + (i % 3) * 35;
    circlePath(cx, cy, 24); ctx.fill();
    circlePath(cx + 22, cy - 8, 20); ctx.fill();
    circlePath(cx + 42, cy, 22); ctx.fill();
  }

  ctx.globalAlpha = 0.35;
  ctx.fillStyle = t.plat;
  ctx.beginPath();
  ctx.moveTo(-100, H);
  for (var k = 0; k < 10; k++) {
    var hx = (k * 220 - cam.x * 0.25) % (W + 400) - 200;
    var hy = H * 0.7 - Math.abs(Math.sin(k * 1.7)) * 100;
    ctx.lineTo(hx, hy);
    ctx.lineTo(hx + 110, hy - 40);
  }
  ctx.lineTo(W + 200, H);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.globalAlpha = 0.7;
  for (var m = 0; m < 8; m++) {
    var tx = ((m * 180 - cam.x * 0.5) % (W + 300)) - 150;
    var ty = H * 0.82;
    ctx.fillStyle = t.dirt;
    ctx.fillRect(tx - 2, ty - 30, 4, 30);
    ctx.fillStyle = t.tree;
    circlePath(tx, ty - 38, 18); ctx.fill();
    circlePath(tx - 12, ty - 32, 13); ctx.fill();
    circlePath(tx + 12, ty - 32, 13); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ============================================================
// RENDER — PLATFORMS
// ============================================================
function drawPlatforms() {
  var t = theme();
  for (var i = 0; i < platforms.length; i++) {
    var p = platforms[i];
    if (p.hidden) continue;
    var sx = p.x - cam.x + cam.shakeX;
    var sy = p.y - cam.y + cam.shakeY;
    if (sx + p.w < -40 || sx > W + 40) continue;

    var topCol = t.platTop;
    var bodyCol = t.plat;
    if (p.type === 'bounce')  { topCol = '#ff90c0'; bodyCol = '#c04080'; }
    if (p.type === 'ice')     { topCol = '#e0f4ff'; bodyCol = '#a8d0e8'; }
    if (p.type === 'falling') { topCol = '#d8c0a0'; bodyCol = '#a08860'; }
    if (p.type === 'moving')  { topCol = '#90d8ff'; bodyCol = '#4080b0'; }

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(sx + p.w / 2, sy + p.h + 3, p.w * 0.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    var grad = ctx.createLinearGradient(0, sy, 0, sy + p.h);
    grad.addColorStop(0, topCol);
    grad.addColorStop(1, bodyCol);
    ctx.fillStyle = grad;
    roundRect(sx, sy, p.w, p.h, 6);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    roundRect(sx, sy, p.w, p.h, 6);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    roundRect(sx + 3, sy + 2, p.w - 6, 3, 2);
    ctx.fill();

    if (p.type === 'normal') {
      ctx.fillStyle = t.accent;
      var tufts = Math.floor(p.w / 22);
      for (var gi = 0; gi < tufts; gi++) {
        var gx = sx + 10 + gi * 22;
        ctx.beginPath();
        ctx.moveTo(gx, sy);
        ctx.lineTo(gx + 2, sy - 5);
        ctx.lineTo(gx + 4, sy);
        ctx.fill();
      }
    }
  }
}

// ============================================================
// RENDER — PLAYER
// ============================================================
function drawPlayer() {
  var sx = player.x - cam.x + cam.shakeX;
  var sy = player.y - cam.y + cam.shakeY;

  if (player.invuln > 0 && Math.floor(player.invuln / 4) % 2 === 0) {
    ctx.globalAlpha = 0.4;
  }

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(sx + player.w / 2, sy + player.h + 3, player.w * 0.6, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(sx + player.w / 2, sy + player.h);
  ctx.scale(player.facing, 1);
  ctx.translate(-player.w / 2, -player.h);

  var bob = 0;
  if (player.state === 'run') bob = Math.sin(player.animT * 0.4) * 1.5;
  if (player.state === 'idle') bob = Math.sin(player.animT * 0.05) * 0.8;

  ctx.fillStyle = '#3a2a1a';
  var legY = player.h - 10 + bob;
  var lo1 = 0, lo2 = 0;
  if (player.state === 'run') {
    lo1 = Math.sin(player.animT * 0.4) * 3;
    lo2 = -lo1;
  } else if (player.state === 'jump' || player.state === 'fall') {
    lo1 = -2; lo2 = 2;
  }
  ctx.fillRect(player.w / 2 - 8 + lo1, legY, 6, 10);
  ctx.fillRect(player.w / 2 + 2 + lo2, legY, 6, 10);

  var bg = ctx.createLinearGradient(0, 4, 0, player.h);
  bg.addColorStop(0, '#6ac8ff');
  bg.addColorStop(0.5, '#3a90e0');
  bg.addColorStop(1, '#2058a0');
  ctx.fillStyle = bg;
  roundRect(2, 5 + bob, player.w - 4, player.h - 14, 8);
  ctx.fill();
  ctx.strokeStyle = '#102040';
  ctx.lineWidth = 1.5;
  roundRect(2, 5 + bob, player.w - 4, player.h - 14, 8);
  ctx.stroke();

  ctx.fillStyle = '#ffd040';
  ctx.fillRect(3, player.h - 12 + bob, player.w - 6, 2.5);

  var headY = 8 + bob;
  var hg = ctx.createRadialGradient(player.w / 2 - 2, headY - 2, 2, player.w / 2, headY, 12);
  hg.addColorStop(0, '#ffd8b0');
  hg.addColorStop(1, '#d09060');
  ctx.fillStyle = hg;
  circlePath(player.w / 2, headY, 10);
  ctx.fill();
  ctx.strokeStyle = '#402010';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#e04040';
  ctx.beginPath();
  ctx.arc(player.w / 2, headY - 1, 10, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(player.w / 2 - 10, headY - 2, 20, 2.5);

  ctx.fillStyle = '#ffffff';
  circlePath(player.w / 2 + 3, headY + 1, 2.3); ctx.fill();
  circlePath(player.w / 2 - 1, headY + 1, 2.3); ctx.fill();
  ctx.fillStyle = '#101020';
  circlePath(player.w / 2 + 4, headY + 1, 1.1); ctx.fill();
  circlePath(player.w / 2, headY + 1, 1.1); ctx.fill();

  if (player.shield > 0) {
    ctx.globalAlpha = 0.5 + Math.sin(Date.now() * 0.01) * 0.2;
    ctx.strokeStyle = '#80e0ff';
    ctx.lineWidth = 2.5;
    circlePath(player.w / 2, player.h / 2, 22);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (player.star > 0) {
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#ffe060';
    for (var si = 0; si < 6; si++) {
      var a = Date.now() * 0.005 + si * Math.PI / 3;
      var r = 20 + Math.sin(Date.now() * 0.01 + si) * 4;
      circlePath(player.w / 2 + Math.cos(a) * r, player.h / 2 + Math.sin(a) * r, 2.3);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ============================================================
// RENDER — ENEMIES
// ============================================================
function drawEnemies() {
  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (!e.alive) continue;
    var sx = e.x - cam.x + cam.shakeX;
    var sy = e.y - cam.y + cam.shakeY;
    if (sx + e.w < -40 || sx > W + 40) continue;

    if (e.kind === 'proj') {
      var pg = ctx.createRadialGradient(sx + e.w / 2, sy + e.h / 2, 1, sx + e.w / 2, sy + e.h / 2, e.w);
      pg.addColorStop(0, '#fff8b0');
      pg.addColorStop(0.5, '#ff8040');
      pg.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = pg;
      circlePath(sx + e.w / 2, sy + e.h / 2, e.w);
      ctx.fill();
      continue;
    }

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(sx + e.w / 2, sy + e.h + 2, e.w * 0.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    var bob = Math.sin(e.anim) * 1.5;

    if (e.kind === 'walker') {
      var g = ctx.createRadialGradient(sx + e.w / 2, sy + e.h / 2 + bob, 2, sx + e.w / 2, sy + e.h / 2 + bob, e.w);
      g.addColorStop(0, '#ff8060');
      g.addColorStop(1, '#a03020');
      ctx.fillStyle = g;
      circlePath(sx + e.w / 2, sy + e.h / 2 + bob, e.w / 2);
      ctx.fill();
      ctx.strokeStyle = '#401010';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      circlePath(sx + e.w / 2 - 4, sy + e.h / 2 - 3 + bob, 3); ctx.fill();
      circlePath(sx + e.w / 2 + 4, sy + e.h / 2 - 3 + bob, 3); ctx.fill();
      ctx.fillStyle = '#000000';
      circlePath(sx + e.w / 2 - 4 + e.dir, sy + e.h / 2 - 3 + bob, 1.4); ctx.fill();
      circlePath(sx + e.w / 2 + 4 + e.dir, sy + e.h / 2 - 3 + bob, 1.4); ctx.fill();
    } else if (e.kind === 'flyer') {
      var wing = Math.sin(e.anim * 2) * 0.5 + 0.5;
      ctx.fillStyle = 'rgba(180,120,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(sx - 4, sy + e.h / 2, 10, 5 * wing + 2, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(sx + e.w + 4, sy + e.h / 2, 10, 5 * wing + 2, 0.4, 0, Math.PI * 2);
      ctx.fill();

      var g2 = ctx.createRadialGradient(sx + e.w / 2, sy + e.h / 2, 2, sx + e.w / 2, sy + e.h / 2, e.w);
      g2.addColorStop(0, '#c080ff');
      g2.addColorStop(1, '#6020a0');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.ellipse(sx + e.w / 2, sy + e.h / 2, e.w / 2, e.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#200840';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      circlePath(sx + e.w / 2 - 4, sy + e.h / 2 - 2, 2.4); ctx.fill();
      circlePath(sx + e.w / 2 + 4, sy + e.h / 2 - 2, 2.4); ctx.fill();
      ctx.fillStyle = '#000000';
      circlePath(sx + e.w / 2 - 4, sy + e.h / 2 - 2, 1.1); ctx.fill();
      circlePath(sx + e.w / 2 + 4, sy + e.h / 2 - 2, 1.1); ctx.fill();
    }
  }
}

// ============================================================
// RENDER — COINS
// ============================================================
function drawCoins() {
  for (var i = 0; i < coins.length; i++) {
    var c = coins[i];
    if (c.taken) continue;
    var sx = c.x - cam.x + cam.shakeX;
    var sy = c.y + Math.sin(c.bob) * 3 - cam.y + cam.shakeY;
    if (sx < -30 || sx > W + 30) continue;

    var glow = ctx.createRadialGradient(sx, sy, 1, sx, sy, c.r * 2.2);
    glow.addColorStop(0, 'rgba(255,220,80,0.7)');
    glow.addColorStop(1, 'rgba(255,220,80,0)');
    ctx.fillStyle = glow;
    circlePath(sx, sy, c.r * 2.2);
    ctx.fill();

    var wobble = Math.abs(Math.cos(c.spin));
    var cg = ctx.createLinearGradient(sx - c.r, sy, sx + c.r, sy);
    cg.addColorStop(0, '#a06010');
    cg.addColorStop(0.5, c.big ? '#ffe860' : '#ffd040');
    cg.addColorStop(1, '#a06010');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(sx, sy, c.r * wobble + 1, c.r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,60,10,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(sx - c.r * 0.3, sy - c.r * 0.35, c.r * 0.22 * wobble + 0.5, c.r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============================================================
// RENDER — POWERUPS
// ============================================================
function drawPowerups() {
  for (var i = 0; i < powerups.length; i++) {
    var pu = powerups[i];
    if (pu.taken) continue;
    var sx = pu.x - cam.x + cam.shakeX;
    var sy = pu.y + Math.sin(pu.bob) * 4 - cam.y + cam.shakeY;
    if (sx < -40 || sx > W + 40) continue;

    var col = '120,220,255';
    if (pu.kind === 'speed')  col = '255,180,60';
    if (pu.kind === 'jump')   col = '140,255,140';
    if (pu.kind === 'shield') col = '140,200,255';
    if (pu.kind === 'double') col = '255,140,200';
    if (pu.kind === 'star')   col = '255,240,120';

    var glow = ctx.createRadialGradient(sx + pu.w / 2, sy + pu.h / 2, 2, sx + pu.w / 2, sy + pu.h / 2, 26);
    glow.addColorStop(0, 'rgba(' + col + ',0.9)');
    glow.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.fillStyle = glow;
    circlePath(sx + pu.w / 2, sy + pu.h / 2, 26);
    ctx.fill();

    ctx.fillStyle = 'rgba(' + col + ',0.95)';
    roundRect(sx, sy, pu.w, pu.h, 7);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    roundRect(sx, sy, pu.w, pu.h, 7);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var icon = '?';
    if (pu.kind === 'speed')  icon = 'S';
    if (pu.kind === 'jump')   icon = 'J';
    if (pu.kind === 'shield') icon = 'O';
    if (pu.kind === 'double') icon = 'D';
    if (pu.kind === 'star')   icon = '*';
    ctx.fillText(icon, sx + pu.w / 2, sy + pu.h / 2 + 1);
  }
}

// ============================================================
// RENDER — PORTAL
// ============================================================
function drawPortal() {
  if (!portal) return;
  var sx = portal.x - cam.x + cam.shakeX + portal.w / 2;
  var sy = portal.y - cam.y + cam.shakeY + portal.h / 2;
  portal.t += 0.06;

  var glow = ctx.createRadialGradient(sx, sy, 5, sx, sy, 70);
  glow.addColorStop(0, 'rgba(180,255,240,0.9)');
  glow.addColorStop(0.4, 'rgba(80,220,200,0.7)');
  glow.addColorStop(1, 'rgba(80,220,200,0)');
  ctx.fillStyle = glow;
  circlePath(sx, sy, 70);
  ctx.fill();

  for (var i = 0; i < 3; i++) {
    var r = 22 + i * 6 + Math.sin(portal.t + i) * 3;
    ctx.strokeStyle = 'rgba(140,255,220,' + (0.8 - i * 0.2) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sx, sy, r, portal.t * (1 + i * 0.5), portal.t * (1 + i * 0.5) + 4.5);
    ctx.stroke();
  }

  ctx.fillStyle = '#c0ffee';
  ctx.beginPath();
  ctx.ellipse(sx, sy, 16, 24, 0, 0, Math.PI * 2);
  ctx.fill();

  for (var k = 0; k < 6; k++) {
    var a = portal.t + k * Math.PI / 3;
    var px = sx + Math.cos(a) * 40;
    var py = sy + Math.sin(a) * 40;
    ctx.fillStyle = 'rgba(180,255,240,' + (0.6 + Math.sin(portal.t * 2 + k) * 0.3) + ')';
    circlePath(px, py, 3);
    ctx.fill();
  }
}

// ============================================================
// RENDER — BOSS
// ============================================================
function drawBoss() {
  if (!boss) return;
  var sx = boss.x - cam.x + cam.shakeX;
  var sy = boss.y - cam.y + cam.shakeY;

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(sx + boss.w / 2, sy + boss.h + 8, boss.w * 0.7, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  var g = ctx.createRadialGradient(sx + boss.w / 2, sy + boss.h / 2, 5, sx + boss.w / 2, sy + boss.h / 2, boss.w);
  g.addColorStop(0, boss.hurtT > 0 ? '#ffffff' : '#ff5060');
  g.addColorStop(0.6, '#a02030');
  g.addColorStop(1, '#400810');
  ctx.fillStyle = g;
  roundRect(sx, sy, boss.w, boss.h, 12);
  ctx.fill();
  ctx.strokeStyle = '#200008';
  ctx.lineWidth = 3;
  roundRect(sx, sy, boss.w, boss.h, 12);
  ctx.stroke();

  ctx.fillStyle = '#e0d0a0';
  ctx.beginPath();
  ctx.moveTo(sx + 10, sy);
  ctx.lineTo(sx + 4, sy - 16);
  ctx.lineTo(sx + 18, sy);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(sx + boss.w - 10, sy);
  ctx.lineTo(sx + boss.w - 4, sy - 16);
  ctx.lineTo(sx + boss.w - 18, sy);
  ctx.fill();

  ctx.fillStyle = '#ffe040';
  circlePath(sx + 22, sy + 28, 6); ctx.fill();
  circlePath(sx + boss.w - 22, sy + 28, 6); ctx.fill();
  ctx.fillStyle = '#200000';
  var lookX = boss.dir > 0 ? 2 : -2;
  circlePath(sx + 22 + lookX, sy + 28, 3); ctx.fill();
  circlePath(sx + boss.w - 22 + lookX, sy + 28, 3); ctx.fill();

  var hbW = 240, hbH = 12;
  var hbX = W / 2 - hbW / 2;
  var hbY = 20;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRect(hbX - 3, hbY - 3, hbW + 6, hbH + 6, 6);
  ctx.fill();
  ctx.fillStyle = '#500010';
  roundRect(hbX, hbY, hbW, hbH, 5);
  ctx.fill();
  var hpFrac = boss.hp / boss.maxHp;
  var hpG = ctx.createLinearGradient(hbX, 0, hbX + hbW, 0);
  hpG.addColorStop(0, '#ff3040');
  hpG.addColorStop(1, '#ffb020');
  ctx.fillStyle = hpG;
  roundRect(hbX, hbY, hbW * hpFrac, hbH, 5);
  ctx.fill();
  ctx.strokeStyle = '#ffd060';
  ctx.lineWidth = 1.5;
  roundRect(hbX, hbY, hbW, hbH, 5);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CHAOS BEAST', W / 2, hbY + 26);
}

// ============================================================
// RENDER — PARTICLES
// ============================================================
function drawParticles() {
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i];
    var a = p.life / p.maxLife;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    circlePath(p.x - cam.x + cam.shakeX, p.y - cam.y + cam.shakeY, p.r * a + 0.5);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ============================================================
// RENDER — HUD
// ============================================================
function drawHUD() {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(12, 12, 500, 40, 20);
  ctx.fill();

  ctx.font = 'bold 18px Arial';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  ctx.fillStyle = '#ff5050';
  ctx.fillText('LIVES ' + G.lives, 28, 32);
  ctx.fillStyle = '#ffe040';
  ctx.fillText('SCORE ' + G.score, 120, 32);
  ctx.fillStyle = '#ffb060';
  ctx.fillText('COINS ' + G.coins, 280, 32);
  ctx.fillStyle = '#80e0ff';
  ctx.fillText('LV ' + G.level + '/' + G.maxLevel, 400, 32);

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(W - 200, 12, 188, 40, 20);
  ctx.fill();
  ctx.fillStyle = '#d0d0ff';
  ctx.fillText('BEST ' + G.best, W - 180, 32);

  var bx = 20;
  var by = H - 44;
  var buffs = [];
  if (player.speedBoost > 0) buffs.push({ c: '#ffb040', t: 'SPEED' });
  if (player.jumpBoost > 0)  buffs.push({ c: '#80ff80', t: 'JUMP' });
  if (player.shield > 0)     buffs.push({ c: '#80c8ff', t: 'SHIELD' });
  if (player.star > 0)       buffs.push({ c: '#ffe060', t: 'STAR' });
  if (player.maxJumps > 1)   buffs.push({ c: '#ff80c0', t: '2xJUMP' });

  for (var i = 0; i < buffs.length; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(bx, by, 76, 24, 12);
    ctx.fill();
    ctx.fillStyle = buffs[i].c;
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(buffs[i].t, bx + 38, by + 13);
    bx += 84;
  }
  ctx.restore();
}

// ============================================================
// RENDER — MENU
// ============================================================
function drawMenu() {
  G.frame++;
  var th = THEMES[Math.floor(G.frame / 180) % THEMES.length];
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, th.skyTop);
  g.addColorStop(1, th.skyBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  for (var i = 0; i < 40; i++) {
    var x = ((i * 137 + G.frame * 0.5) % (W + 100)) - 50;
    var y = ((i * 97 + Math.sin(G.frame * 0.02 + i) * 30) % H + H) % H;
    ctx.globalAlpha = 0.4 + Math.sin(G.frame * 0.05 + i) * 0.3;
    ctx.fillStyle = '#c0f0ff';
    circlePath(x, y, 2 + (i % 3));
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  var ty = H * 0.32 + Math.sin(G.frame * 0.03) * 6;

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.font = 'bold 72px Arial';
  ctx.fillText('PIXEL QUEST', W / 2 + 4, ty + 4);
  ctx.fillText('CHAOS RUN', W / 2 + 4, ty + 72);

  var tg = ctx.createLinearGradient(0, ty - 50, 0, ty + 40);
  tg.addColorStop(0, '#e0f8ff');
  tg.addColorStop(0.5, '#60d0ff');
  tg.addColorStop(1, '#2080e0');
  ctx.fillStyle = tg;
  ctx.fillText('PIXEL QUEST', W / 2, ty);

  var sg = ctx.createLinearGradient(0, ty + 40, 0, ty + 110);
  sg.addColorStop(0, '#ffe880');
  sg.addColorStop(1, '#ff8040');
  ctx.fillStyle = sg;
  ctx.fillText('CHAOS RUN', W / 2, ty + 72);

  var bx = W / 2 - 130;
  var by = H * 0.62;
  var bw = 260;
  var bh = 62;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(bx + 4, by + 6, bw, bh, 16);
  ctx.fill();

  var bg = ctx.createLinearGradient(0, by, 0, by + bh);
  bg.addColorStop(0, '#60e0a0');
  bg.addColorStop(1, '#20a060');
  ctx.fillStyle = bg;
  roundRect(bx, by, bw, bh, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2;
  roundRect(bx, by, bw, bh, 16);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px Arial';
  ctx.fillText('PLAY', W / 2, by + bh / 2 + 2);

  ctx.fillStyle = '#e0f0ff';
  ctx.font = 'bold 18px Arial';
  ctx.fillText('Best Score: ' + G.best, W / 2, H * 0.80);

  var pulse = 0.5 + Math.sin(G.frame * 0.1) * 0.5;
  ctx.fillStyle = 'rgba(255,255,255,' + pulse + ')';
  ctx.font = 'bold 18px Arial';
  ctx.fillText('PRESS ENTER OR CLICK PLAY', W / 2, H * 0.90);

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '14px Arial';
  ctx.fillText('A/D or Arrows = Move   |   W / Space / Up = Jump   |   Shift = Dash   |   P = Pause   |   R = Restart', W / 2, H - 30);
}

// ============================================================
// RENDER — PAUSED / LEVEL COMPLETE / GAME OVER / WIN
// ============================================================
function drawPaused() {
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffe880';
  ctx.font = 'bold 72px Arial';
  ctx.fillText('PAUSED', W / 2, H * 0.35);
  ctx.fillStyle = '#c0e0ff';
  ctx.font = 'bold 22px Arial';
  ctx.fillText('Press P to resume', W / 2, H * 0.52);
  ctx.fillText('Press R to restart level', W / 2, H * 0.58);
}

function drawLevelComplete() {
  ctx.fillStyle = 'rgba(0,20,40,0.78)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  var bob = Math.sin(Date.now() * 0.005) * 5;
  var g = ctx.createLinearGradient(0, H * 0.22 + bob - 30, 0, H * 0.22 + bob + 40);
  g.addColorStop(0, '#fff080');
  g.addColorStop(1, '#ffa040');
  ctx.fillStyle = g;
  ctx.font = 'bold 58px Arial';
  ctx.fillText('LEVEL COMPLETE!', W / 2, H * 0.22 + bob);

  ctx.fillStyle = '#e0f8ff';
  ctx.font = 'bold 26px Arial';
  ctx.fillText('Score: ' + G.score, W / 2, H * 0.48);
  ctx.fillText('Coins: ' + G.coins, W / 2, H * 0.56);
  ctx.fillText('Time: ' + Math.floor(G.levelFrame / 60) + 's', W / 2, H * 0.64);

  var pulse = 0.5 + Math.sin(Date.now() * 0.008) * 0.5;
  ctx.fillStyle = 'rgba(255,255,255,' + pulse + ')';
  ctx.font = 'bold 22px Arial';
  ctx.fillText(G.level >= G.maxLevel ? 'PRESS ENTER TO FINISH' : 'PRESS ENTER FOR NEXT LEVEL', W / 2, H * 0.84);
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(40,0,0,0.85)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  var g = ctx.createLinearGradient(0, H * 0.2, 0, H * 0.35);
  g.addColorStop(0, '#ff8080');
  g.addColorStop(1, '#800020');
  ctx.fillStyle = g;
  ctx.font = 'bold 78px Arial';
  ctx.fillText('GAME OVER', W / 2, H * 0.28);

  ctx.fillStyle = '#ffe0d0';
  ctx.font = 'bold 26px Arial';
  ctx.fillText('Final Score: ' + G.score, W / 2, H * 0.50);
  ctx.fillText('Coins: ' + G.coins, W / 2, H * 0.58);
  ctx.fillText('Level: ' + G.level, W / 2, H * 0.66);
  ctx.fillText('Best: ' + G.best, W / 2, H * 0.74);

  var pulse = 0.5 + Math.sin(Date.now() * 0.008) * 0.5;
  ctx.fillStyle = 'rgba(255,255,255,' + pulse + ')';
  ctx.font = 'bold 22px Arial';
  ctx.fillText('PRESS ENTER TO RETRY', W / 2, H * 0.87);
}

function drawWin() {
  ctx.fillStyle = 'rgba(0,20,40,0.88)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  var bob = Math.sin(Date.now() * 0.006) * 8;
  var g = ctx.createLinearGradient(0, H * 0.3 + bob - 40, 0, H * 0.3 + bob + 40);
  g.addColorStop(0, '#fff8a0');
  g.addColorStop(0.5, '#ffe040');
  g.addColorStop(1, '#ff8040');
  ctx.fillStyle = g;
  ctx.font = 'bold 78px Arial';
  ctx.fillText('YOU WIN!', W / 2, H * 0.30 + bob);

  ctx.fillStyle = '#e0f8ff';
  ctx.font = 'bold 24px Arial';
  ctx.fillText('You conquered all ' + G.maxLevel + ' levels!', W / 2, H * 0.52);
  ctx.fillText('Final Score: ' + G.score, W / 2, H * 0.60);
  ctx.fillText('Coins: ' + G.coins, W / 2, H * 0.68);

  var pulse = 0.5 + Math.sin(Date.now() * 0.008) * 0.5;
  ctx.fillStyle = 'rgba(255,255,255,' + pulse + ')';
  ctx.font = 'bold 22px Arial';
  ctx.fillText('PRESS ENTER TO PLAY AGAIN', W / 2, H * 0.84);
}

// ============================================================
// MAIN LOOP
// ============================================================
var lastTime = 0;
var accumulator = 0;
var STEP_MS = 1000 / 60;

function tick() {
  if (G.state === 'playing') {
    G.frame++;
    G.levelFrame++;

    updatePlayer();
    updatePlatforms();
    updateEnemies();
    updateCoins();
    updatePowerups();
    updateBoss();
    updateParticles();
    updateCamera();

    if (G.frame % 180 === 0) {
      var kept = [];
      for (var i = 0; i < enemies.length; i++) {
        if (enemies[i].alive) kept.push(enemies[i]);
      }
      enemies = kept;
    }
  } else if (G.state === 'levelComplete') {
    updateParticles();
    updateCamera();
  }
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1a2030';
  ctx.fillRect(0, 0, W, H);

  if (G.state === 'menu') {
    drawMenu();
  } else {
    drawBackground();
    drawPlatforms();
    drawPortal();
    drawCoins();
    drawPowerups();
    drawEnemies();
    drawBoss();
    drawPlayer();
    drawParticles();
    drawHUD();

    if (G.state === 'paused')        drawPaused();
    if (G.state === 'levelComplete') drawLevelComplete();
    if (G.state === 'gameover')      drawGameOver();
    if (G.state === 'win')           drawWin();
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!lastTime) lastTime = now;
  var dt = now - lastTime;
  lastTime = now;
  if (dt > 200) dt = 200;
  accumulator += dt;

  var safety = 0;
  while (accumulator >= STEP_MS && safety < 5) {
    tick();
    accumulator -= STEP_MS;
    safety++;
  }
  if (safety >= 5) accumulator = 0;

  render();
}

// ============================================================
// CLICK / TOUCH
// ============================================================
canvas.addEventListener('click', function (e) {
  initAudio();
  if (G.state === 'menu') {
    var r = canvas.getBoundingClientRect();
    var mx = (e.clientX - r.left) * (W / r.width);
    var my = (e.clientY - r.top)  * (H / r.height);
    if (mx > W / 2 - 130 && mx < W / 2 + 130 && my > H * 0.62 && my < H * 0.62 + 62) {
      startGame();
    }
  }
});

canvas.addEventListener('touchstart', function (e) {
  initAudio();
  if (G.state === 'menu') { startGame(); e.preventDefault(); return; }
  if (G.state === 'playing') {
    var r = canvas.getBoundingClientRect();
    for (var i = 0; i < e.touches.length; i++) {
      var t = e.touches[i];
      var tx = (t.clientX - r.left) / r.width;
      var ty = (t.clientY - r.top)  / r.height;
      if (ty > 0.5) {
        if (tx < 0.5) keys.left = true;
        else          keys.right = true;
      } else {
        if (!keys.jump) keys.jumpJust = true;
        keys.jump = true;
      }
    }
    e.preventDefault();
  }
}, { passive: false });

canvas.addEventListener('touchend', function (e) {
  if (e.touches.length === 0) {
    keys.left = false;
    keys.right = false;
    keys.jump = false;
  }
  e.preventDefault();
}, { passive: false });

// ============================================================
// BOOT
// ============================================================
requestAnimationFrame(frame);

})();