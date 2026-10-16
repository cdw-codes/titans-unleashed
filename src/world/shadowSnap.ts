/**
 * Snap a world-space focus point to the shadow map's texel grid in light space,
 * so a moving shadow frustum doesn't make shadow edges shimmer.
 * `lightRight`/`lightUp` are the light camera's unit basis vectors.
 */
export function snapToTexelGrid(
  focus: { x: number; y: number; z: number },
  lightRight: { x: number; y: number; z: number },
  lightUp: { x: number; y: number; z: number },
  texelSize: number,
  out: { x: number; y: number; z: number },
): void {
  const r = focus.x * lightRight.x + focus.y * lightRight.y + focus.z * lightRight.z;
  const u = focus.x * lightUp.x + focus.y * lightUp.y + focus.z * lightUp.z;
  const dr = Math.round(r / texelSize) * texelSize - r;
  const du = Math.round(u / texelSize) * texelSize - u;
  out.x = focus.x + lightRight.x * dr + lightUp.x * du;
  out.y = focus.y + lightRight.y * dr + lightUp.y * du;
  out.z = focus.z + lightRight.z * dr + lightUp.z * du;
}
