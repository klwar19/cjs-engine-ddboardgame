import type { EntityId, Position } from "./types";

export type { Position };

export interface GridDimensions {
  readonly width: number;
  readonly height: number;
}

export type MapType = "open" | "dungeon" | "town" | "wilderness" | (string & {});

export type AOEShape =
  | "single"
  | "cross"
  | "square"
  | "diamond"
  | "line"
  | "cone"
  | "ring"
  | (string & {});

export interface GridCell {
  readonly pos: Position;
  passable: boolean;
  terrain?: string;
  occupantId?: EntityId | null;
}
