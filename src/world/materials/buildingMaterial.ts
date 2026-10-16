import * as THREE from 'three';
import { BUILDING_VISUAL as B } from '../../config/buildings';

/**
 * Lambert material that paints a procedural window grid in world space, so
 * any box (any instance scale) gets correctly sized floors and windows with
 * no textures or UV work. Windows fade to their average tone with distance
 * to avoid moiré. Per-instance color tints the walls.
 */
export function createBuildingMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms['uWin'] = {
      value: new THREE.Vector4(B.windowSpacingX, B.floorHeight, B.windowFrameX, B.windowFrameY),
    };
    shader.uniforms['uGroundFloor'] = { value: B.groundFloorHeight };
    shader.uniforms['uGlassDark'] = { value: new THREE.Color(B.glassDark) };
    shader.uniforms['uGlassLight'] = { value: new THREE.Color(B.glassLight) };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBWorld;\nvarying vec3 vBNormal;\nvarying float vBBase;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        mat4 bModel = modelMatrix;
        #ifdef USE_INSTANCING
          bModel = modelMatrix * instanceMatrix;
        #endif
        vBWorld = (bModel * vec4(position, 1.0)).xyz;
        vBNormal = normalize(mat3(bModel) * normal);
        vBBase = (bModel * vec4(0.0, 0.0, 0.0, 1.0)).y;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec4 uWin;
        uniform float uGroundFloor;
        uniform vec3 uGlassDark;
        uniform vec3 uGlassLight;
        varying vec3 vBWorld;
        varying vec3 vBNormal;
        varying float vBBase;
        float bHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 bn = abs(vBNormal);
        if (bn.y < 0.5) {
          float u = bn.x > bn.z ? vBWorld.z : vBWorld.x;
          float h = vBWorld.y - vBBase;
          vec2 cell = vec2(u / uWin.x, h / uWin.y);
          vec2 f = fract(cell);
          float win = step(uWin.z, f.x) * step(f.x, 1.0 - uWin.z) * step(uWin.w, f.y) * step(f.y, 1.0 - uWin.w);
          win *= step(uGroundFloor, h);
          // Fade the pattern out where cells shrink below ~2px.
          vec2 fw = fwidth(cell);
          float detail = clamp(1.5 - max(fw.x, fw.y) * 3.0, 0.0, 1.0);
          float coverage = (1.0 - 2.0 * uWin.z) * (1.0 - 2.0 * uWin.w) * step(uGroundFloor, h);
          win = mix(coverage, win, detail);
          vec3 glass = mix(uGlassDark, uGlassLight, bHash(floor(cell) + floor(vBWorld.xz * 0.01)) * 0.7);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, win * 0.9);
        } else {
          diffuseColor.rgb *= 0.8; // roofs a touch darker
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'building-windows';
  return mat;
}
