import { screenDir } from '../iso.js';
import { C, P, line, disc, ellipse, poly, shade } from './shapes.js';

const HATS = 4; // 0 cabelo, 1 boné, 2 gorro, 3 bandana

function bar(ctx, x, y, w, frac, color) {
  frac = Math.max(0, Math.min(1, frac));
  ctx.fillStyle = 'rgba(10,10,8,0.75)';
  ctx.fillRect(x - 1, y - 1, w + 2, 5);
  ctx.fillStyle = color || (frac > 0.6 ? C.ok : frac > 0.3 ? C.warn : C.bad);
  ctx.fillRect(x, y, w * frac, 3);
}
export { bar };

// Ferramenta na mão de quem está trabalhando, girando no golpe.
function tool(ctx, kind, hx, hy, ang, side) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const tip = [hx + c * 13 * side, hy + s * 13];
  line(ctx, [hx - c * 3 * side, hy - s * 3], tip, '#6e4f30', 2.2);
  const nx = -s * side, ny = c; // perpendicular
  if (kind === 'wood') {
    poly(ctx, [[tip[0], tip[1]], [tip[0] + nx * 6, tip[1] + ny * 6], [tip[0] + nx * 5 - c * 4 * side, tip[1] + ny * 5 - s * 4], [tip[0] - c * 3 * side, tip[1] - s * 3]], '#9aa0a4');
  } else if (kind === 'stone') {
    ctx.strokeStyle = '#8a9094';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(tip[0] + nx * 6 - c * 2 * side, tip[1] + ny * 6 - s * 2);
    ctx.quadraticCurveTo(tip[0] + c * 2 * side, tip[1] + s * 2, tip[0] - nx * 6 - c * 2 * side, tip[1] - ny * 6 - s * 2);
    ctx.stroke();
  } else if (kind === 'loot') {
    line(ctx, tip, [tip[0] + nx * 4, tip[1] + ny * 4], '#7a8288', 2.4);
  } else {
    poly(ctx, [[tip[0] + nx * 4, tip[1] + ny * 4], [tip[0] - nx * 4, tip[1] - ny * 4], [tip[0] - nx * 4 - c * 3 * side, tip[1] - ny * 4 - s * 3], [tip[0] + nx * 4 - c * 3 * side, tip[1] + ny * 4 - s * 3]], '#5d6266');
  }
}

export function drawUnit(ctx, u, selected, env, act) {
  const [x, y] = P(u.x, u.y);
  const soldier = u.role === 'soldado';
  const jacket = soldier ? C.army[u.look % C.army.length] : C.jackets[u.look % C.jackets.length];
  const skin = C.skin[(u.look >> 3) % C.skin.length];
  const pants = C.pants[(u.look >> 5) % C.pants.length];
  const hat = soldier ? HATS : (u.look >> 7) % HATS; // HATS = capacete
  const hatColor = C.hats[(u.look >> 2) % C.hats.length];
  const hair = C.hair[(u.look >> 4) % C.hair.length];
  ellipse(ctx, x + 3, y + 1, 9, 4.5, C.shadow);
  if (selected) {
    ctx.strokeStyle = C.sel;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y, 13, 6.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  const [dx, dy] = screenDir(u.facing);
  const side = dx >= 0 ? 1 : -1;
  const walking = u.path && u.aimT <= 0;
  const ph = env.now * 12 + u.id;
  const swing = walking ? Math.sin(ph) : 0;

  // Pernas e botas
  for (const k of [-1, 1]) {
    const off = swing * k * 2.5;
    const fx = x + k * 2.6 + dx * off, fy = y - 1 + dy * off * 0.5 - (walking && k * Math.sin(ph) > 0 ? 1.5 : 0);
    line(ctx, [x + k * 2.4, y - 10], [fx, fy], pants, 3.6);
    ellipse(ctx, fx + dx * 1.2, fy + 0.5, 2.6, 1.6, '#1d1a16');
  }
  const pack = () => {
    const px = x - dx * 6, py = y - 18 - dy * 2;
    ctx.fillStyle = '#4a3e2c';
    ctx.fillRect(px - 4.5, py - 6, 9, 11);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(px + 0.5, py - 6, 4, 11);
    if (u.carry.amount) {
      ctx.fillStyle = C.res[u.carry.type];
      ctx.fillRect(px - 4, py - 11, 8, 6);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px - 4, py - 11, 8, 6);
    }
  };
  const working = u.working && act !== 'idle';
  const handX = x + side * 5.5, handY = y - 17;
  const arms = () => {
    if (working) {
      const k = (Math.sin(env.now * 9 + u.id) + 1) / 2; // 0 = levantado, 1 = golpe
      const ang = -1.25 + k * 1.7;
      tool(ctx, act === 'repair' ? 'build' : act, handX, handY, ang, side);
      line(ctx, [x + side * 3, y - 19], [handX, handY], jacket, 3);
      disc(ctx, handX, handY, 1.8, skin);
      return;
    }
    // Espingarda segura com as duas mãos
    const gx = x + dx * 3, gy = y - 15;
    const reach = soldier ? 21 : 17;
    const tx = x + dx * reach, ty = y - 15 + dy * reach * 0.47;
    line(ctx, [gx - dx * 3, gy - dy * 1.5], [tx, ty], '#262422', 3);
    line(ctx, [gx - dx * 3, gy - dy * 1.5], [gx + dx * 3, gy + dy * 1.5], '#5a4026', 3.5);
    line(ctx, [x - side * 3, y - 19], [gx + dx * 4, gy + dy * 2], shade(jacket, 0.85), 3);
    line(ctx, [x + side * 3, y - 19], [gx + dx * 9, gy + dy * 4.5], jacket, 3);
    if (u.aimT > 0.17) {
      const fx = tx + dx * 3, fy = ty + dy * 1.5;
      poly(ctx, [[fx - 4, fy], [fx, fy - 4], [fx + 4, fy], [fx, fy + 4]], 'rgba(255,230,150,0.95)');
      disc(ctx, fx, fy, 2, '#fff');
    }
  };
  if (dy < 0) arms();
  else pack();
  // Tronco com sombreamento e contorno
  ctx.fillStyle = jacket;
  ctx.beginPath();
  ctx.ellipse(x, y - 15, 6.5, 7.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + 2.5, y - 14, 4, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,14,10,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, y - 15, 6.5, 7.8, 0, 0, Math.PI * 2);
  ctx.stroke();
  line(ctx, [x - 6, y - 10], [x + 6, y - 10], '#2a2218', 1.5);
  // Cabeça
  const hx = x + dx * 1.2, hy = y - 26;
  disc(ctx, hx, hy, 4.9, skin);
  ctx.strokeStyle = 'rgba(15,14,10,0.55)';
  ctx.stroke();
  if (dy > -0.2) {
    disc(ctx, hx + dx * 2 - 1.4, hy + 0.3, 0.75, '#1a1410');
    disc(ctx, hx + dx * 2 + 1.4, hy + 0.3, 0.75, '#1a1410');
  }
  if (hat === 0) {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(hx, hy - 1, 5, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
  } else if (hat === 1) {
    ctx.fillStyle = hatColor;
    ctx.beginPath();
    ctx.arc(hx, hy - 1.2, 5.1, Math.PI, 0);
    ctx.fill();
    ellipse(ctx, hx + dx * 5, hy - 1.2 + dy * 2, 3.6, 1.4, shade(hatColor, 0.8));
  } else if (hat === 2) {
    ctx.fillStyle = hatColor;
    ctx.beginPath();
    ctx.arc(hx, hy - 1, 5.3, Math.PI * 0.9, Math.PI * 2.1);
    ctx.fill();
    disc(ctx, hx, hy - 6.5, 1.8, shade(hatColor, 1.3));
  } else if (hat === HATS) {
    // Capacete com aba curta
    ctx.fillStyle = '#4a5233';
    ctx.beginPath();
    ctx.arc(hx, hy - 0.8, 5.8, Math.PI * 0.92, Math.PI * 2.08);
    ctx.fill();
    line(ctx, [hx - 6.2, hy - 0.4], [hx + 6.2, hy - 0.4], '#3a4128', 1.6);
  } else {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(hx, hy - 1, 5, Math.PI, Math.PI * 2);
    ctx.fill();
    line(ctx, [hx - 5, hy - 2], [hx + 5, hy - 2], hatColor, 2.2);
    line(ctx, [hx - side * 5, hy - 2], [hx - side * 7, hy + 1], hatColor, 1.5);
  }
  if (dy < 0) pack();
  else arms();
  if (u.hitT > 0) {
    ctx.fillStyle = `rgba(194,65,45,${u.hitT * 3})`;
    ctx.beginPath();
    ctx.ellipse(x, y - 17, 8, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (selected || u.hp < u.maxHp) bar(ctx, x - 11, y - 40, 22, u.hp / u.maxHp);
}

export function drawZombie(ctx, z, selected, env) {
  const [x, y] = P(z.x, z.y);
  const s = z.type === 'brute' ? 1.45 : z.type === 'runner' ? 0.92 : 1;
  const skin = C.zSkin[z.type];
  const cloth = C.zCloth[z.id % C.zCloth.length];
  const pants = C.zPants[z.id % C.zPants.length];
  ellipse(ctx, x + 3, y + 1, 9 * s, 4.5 * s, C.shadow);
  if (selected) {
    ctx.strokeStyle = C.bad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y, 14 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  const [dx, dy] = screenDir(z.facing);
  const side = dx >= 0 ? 1 : -1;
  const ph = z.anim * (z.type === 'runner' ? 10 : 4);
  const sway = Math.sin(ph);
  // Pernas: uma arrasta
  line(ctx, [x - 2.5 * s, y - 9 * s], [x - 2.8 * s + dx * sway * 2, y - 1 + dy * sway], pants, 3.6 * s);
  line(ctx, [x + 2.5 * s, y - 9 * s], [x + 3.5 * s - dx * 2, y], pants, 3.6 * s);
  ellipse(ctx, x + 3.5 * s - dx * 2, y + 0.5, 2.4 * s, 1.4, '#1d1a16');
  const lean = 3 * s; // corpo curvado para a frente
  const tx = x + dx * lean, ty = y - 14 * s;
  const arms = () => {
    for (const k of [-1, 1]) {
      const sx = tx + k * 5 * s, sy = ty - 3 * s;
      const reach = 13 * s + Math.sin(ph + k) * 1.5;
      const ex = sx + dx * reach + k * sway * 0.8, ey = sy + dy * reach * 0.5 + 2;
      line(ctx, [sx, sy], [ex, ey], z.type === 'brute' ? skin : cloth, 3.2 * s);
      line(ctx, [lerpN(sx, ex, 0.55), lerpN(sy, ey, 0.55)], [ex, ey], skin, 2.6 * s);
      disc(ctx, ex, ey, 1.9 * s, shade(skin, 0.9));
    }
  };
  if (dy < 0) arms();
  // Tronco
  const torso = z.type === 'brute' ? skin : cloth;
  ctx.fillStyle = torso;
  ctx.beginPath();
  ctx.ellipse(tx, ty, 6.6 * s, 7.4 * s, dx * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(tx + 2.5 * s, ty + 1, 4 * s, 6.5 * s, dx * 0.35, 0, Math.PI * 2);
  ctx.fill();
  if (z.type === 'brute') {
    // Pontos de costura e barriga
    ctx.strokeStyle = '#3a2a22';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx - 3 * s, ty - 4 * s);
    ctx.lineTo(tx + 2 * s, ty + 3 * s);
    for (let k = 0; k < 4; k++) {
      const px = tx - 3 * s + k * 1.6 * s, py = ty - 4 * s + k * 2.2 * s;
      ctx.moveTo(px - 1.5, py + 1);
      ctx.lineTo(px + 1.5, py - 1);
    }
    ctx.stroke();
  } else {
    // Barra rasgada e manchas de sangue
    poly(ctx, [[tx - 6 * s, ty + 4 * s], [tx - 3 * s, ty + 8 * s], [tx - 1 * s, ty + 5 * s], [tx + 2 * s, ty + 8.5 * s], [tx + 5 * s, ty + 5 * s], [tx + 6 * s, ty + 4 * s]], torso);
    ellipse(ctx, tx - 1.5 * s, ty + 1 * s, 2.6 * s, 1.8 * s, C.blood);
    if (z.id % 3 === 0) {
      ellipse(ctx, tx + 2 * s, ty - 2 * s, 2.4 * s, 3 * s, shade(skin, 0.85));
      ctx.strokeStyle = '#3a2a22';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        ctx.moveTo(tx + 0.4 * s, ty - 3.5 * s + k * 1.4 * s);
        ctx.lineTo(tx + 3.6 * s, ty - 3.5 * s + k * 1.4 * s);
      }
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(20,10,8,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(tx, ty, 6.6 * s, 7.4 * s, dx * 0.35, 0, Math.PI * 2);
  ctx.stroke();
  // Cabeça caída para a frente
  const hx = tx + dx * 3 * s, hy = y - 22 * s + Math.abs(sway) * 0.8;
  disc(ctx, hx, hy, 4.7 * s, skin);
  ctx.strokeStyle = 'rgba(20,10,8,0.5)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(40,30,25,0.6)';
  ctx.beginPath();
  ctx.arc(hx - side * 1.5, hy - 1.5, 3.6 * s, Math.PI * 1.05, Math.PI * 1.7);
  ctx.fill();
  if (dy > -0.2) {
    disc(ctx, hx + dx * 2 - 1.5 * s, hy, 0.9 * s, '#5a1a10');
    disc(ctx, hx + dx * 2 + 1.5 * s, hy, 0.9 * s, '#5a1a10');
    line(ctx, [hx + dx * 2 - 1.5, hy + 2.6 * s], [hx + dx * 2 + 1.8, hy + 2.4 * s], '#2a1410', 1.2);
  }
  if (dy >= 0) arms();
  if (z.hitT > 0) {
    ctx.fillStyle = `rgba(240,230,200,${z.hitT * 3})`;
    ctx.beginPath();
    ctx.ellipse(x, y - 14 * s, 8 * s, 11 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (selected || z.hp < z.maxHp) bar(ctx, x - 11, y - 36 * s, 22, z.hp / z.maxHp, C.bad);
}

function lerpN(a, b, t) {
  return a + (b - a) * t;
}

// Olhos que brilham no escuro (desenhados depois da camada de noite).
export function drawZombieEyes(ctx, z, dark) {
  const [dx, dy] = screenDir(z.facing);
  if (dy < -0.2) return;
  const [x, y] = P(z.x, z.y);
  const s = z.type === 'brute' ? 1.45 : z.type === 'runner' ? 0.92 : 1;
  const hx = x + dx * 3 * s + dx * 3 * s, hy = y - 22 * s;
  ctx.fillStyle = `rgba(255,${z.type === 'runner' ? 60 : 120},40,${0.85 * dark})`;
  for (const k of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(hx + dx * 2 + k * 1.5 * s, hy, 1.3 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- ícone de atividade

const ACT_COLOR = {
  idle: '#d9a441', wood: '#c08850', stone: '#b4b2a8', loot: '#d8c25a', build: '#9cbccb', repair: '#9cbccb',
  attack: '#d0533c', drop: '#86a95d', move: '#e7e0c8',
};
export { ACT_COLOR };

function glyph(ctx, act, x, y) {
  ctx.strokeStyle = C.ink;
  ctx.fillStyle = C.ink;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  switch (act) {
    case 'wood': // machado
      ctx.moveTo(x - 3, y + 3.5); ctx.lineTo(x + 2, y - 3);
      ctx.stroke();
      poly(ctx, [[x, y - 4], [x + 4, y - 2], [x + 3, y + 1]], C.ink);
      break;
    case 'stone': // picareta
      ctx.moveTo(x - 3, y + 3.5); ctx.lineTo(x + 1.5, y - 2);
      ctx.moveTo(x - 2.5, y - 3.5); ctx.quadraticCurveTo(x + 2, y - 3.5, x + 4, y + 0.5);
      ctx.stroke();
      break;
    case 'loot': // saco
      ctx.arc(x, y + 1, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 1.5, y - 2); ctx.lineTo(x, y - 4); ctx.lineTo(x + 1.5, y - 2);
      ctx.stroke();
      break;
    case 'build':
    case 'repair': // martelo
      ctx.moveTo(x - 3, y + 3.5); ctx.lineTo(x + 1.5, y - 1);
      ctx.stroke();
      poly(ctx, [[x - 0.5, y - 4], [x + 4.5, y + 1], [x + 3, y + 2.5], [x - 2, y - 2.5]], C.ink);
      break;
    case 'attack': // mira
      ctx.arc(x, y, 3.3, 0, Math.PI * 2);
      ctx.moveTo(x - 5, y); ctx.lineTo(x - 1.5, y);
      ctx.moveTo(x + 1.5, y); ctx.lineTo(x + 5, y);
      ctx.moveTo(x, y - 5); ctx.lineTo(x, y - 1.5);
      ctx.moveTo(x, y + 1.5); ctx.lineTo(x, y + 5);
      ctx.stroke();
      break;
    case 'drop': // seta para a base
      ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 2);
      ctx.moveTo(x - 3, y - 0.5); ctx.lineTo(x, y + 2.5); ctx.lineTo(x + 3, y - 0.5);
      ctx.moveTo(x - 4, y + 4); ctx.lineTo(x + 4, y + 4);
      ctx.stroke();
      break;
    case 'move':
      ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 1, y); ctx.lineTo(x - 3, y + 3);
      ctx.moveTo(x, y - 3); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 3);
      ctx.stroke();
      break;
    default: // parado: reticências
      for (const k of [-3, 0, 3]) {
        ctx.beginPath();
        ctx.arc(x + k, y + 0.5, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
  }
  ctx.lineCap = 'butt';
}

// Ícone acima da cabeça. O anel mostra quanto a pessoa já carrega.
export function drawBadge(ctx, u, act, now) {
  const [x0, y0] = P(u.x, u.y);
  const x = x0, y = y0 - 50;
  const color = ACT_COLOR[act] || ACT_COLOR.move;
  if (act === 'idle') {
    const pulse = 0.5 + 0.5 * Math.sin(now * 5 + u.id);
    ctx.fillStyle = `rgba(217,164,65,${0.25 + pulse * 0.35})`;
    ctx.beginPath();
    ctx.arc(x, y, 10 + pulse * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  disc(ctx, x, y, 7.5, 'rgba(15,14,10,0.85)');
  disc(ctx, x, y, 6.3, color);
  glyph(ctx, act, x, y);
  if (u.carry.amount > 0) {
    const frac = Math.min(1, u.carry.amount / (u.carry.type && act === 'loot' ? 12 : 10));
    ctx.strokeStyle = C.res[u.carry.type];
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, 9.5, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
  }
}
