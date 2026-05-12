/**
 * Returns the angle (degrees) at joint B formed by the ray B→A and B→C.
 * Both a, b, c must have { x, y } numeric properties.
 */
export function angleBetween(a, b, c) {
  const bax = a.x - b.x;
  const bay = a.y - b.y;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;

  const dot = bax * bcx + bay * bcy;
  const magBa = Math.sqrt(bax * bax + bay * bay);
  const magBc = Math.sqrt(bcx * bcx + bcy * bcy);

  if (magBa === 0 || magBc === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / (magBa * magBc)))) * (180 / Math.PI);
}
