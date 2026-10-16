/** Building look. Gameplay values (HP, debris) join this file in Milestone 3. */
export interface BuildingVisualConfig {
  /** Window grid cell (m): horizontal spacing, floor height. */
  readonly windowSpacingX: number;
  readonly floorHeight: number;
  /** Fraction of each cell that is wall frame (0..0.5) horizontally / vertically. */
  readonly windowFrameX: number;
  readonly windowFrameY: number;
  /** No windows below this height (m): ground-floor band. */
  readonly groundFloorHeight: number;
  readonly glassDark: number;
  readonly glassLight: number;
}

export const BUILDING_VISUAL: BuildingVisualConfig = {
  windowSpacingX: 3.2,
  floorHeight: 3.6,
  windowFrameX: 0.18,
  windowFrameY: 0.24,
  groundFloorHeight: 4.5,
  glassDark: 0x1d2630,
  glassLight: 0x6d7f8f,
};
