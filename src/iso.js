// Projeção isométrica 2:1. Coordenadas de tile (float) <-> pixels isométricos do mundo.
export const ISO_W = 64;
export const ISO_H = 32;
export const HW = ISO_W / 2;
export const HH = ISO_H / 2;

export function toIso(tx, ty) {
  return [(tx - ty) * HW, (tx + ty) * HH];
}

export function fromIso(x, y) {
  const a = x / HW, b = y / HH;
  return [(a + b) / 2, (b - a) / 2];
}

// Direção na tela (normalizada) para um ângulo no plano dos tiles.
export function screenDir(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const x = (c - s) * HW, y = (c + s) * HH;
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}
