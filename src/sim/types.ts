export type CellType =
  | 'river' | 'bank' | 'road' | 'bridge' | 'residential'
  | 'hospital' | 'school' | 'substation' | 'firestation' | 'park';

export type DistrictId = 'riverside' | 'oldtown' | 'hillcrest' | 'market' | 'eastfield';
export const DISTRICTS: DistrictId[] = ['riverside', 'oldtown', 'hillcrest', 'market', 'eastfield'];

export type ResourceType = 'crew' | 'bus' | 'sandbags' | 'pump' | 'fuel';

export type AgentId = 'fire' | 'hospital' | 'utilities' | 'press';
export type Actor = 'player' | AgentId | 'director' | 'rumor' | 'sim';

export interface XY { x: number; y: number }

export interface Cell {
  x: number;
  y: number;
  type: CellType;
  elevation: 0 | 1 | 2 | 3 | 4 | 5;
  water: number;
  sandbags: number;
  residents: number;
  district: DistrictId;
  powered: boolean;
}

export interface Token {
  id: string;
  type: ResourceType;
  cell: XY | null;
  /** game seconds; token is working (e.g. a bus mid-trip) until then */
  busyUntil: number;
}

export interface GameEvent {
  t: number;
  type: string;
  actor: string;
  data: Record<string, unknown>;
}

export interface Rumour {
  id: string;
  text: string;
  district: DistrictId;
  severity: 1 | 2 | 3;
  countered: boolean;
  t: number;
}

export type Modifier = 'light' | 'heavy' | 'night';

export interface SimState {
  seed: number;
  /** game seconds */
  t: number;
  /** [y][x] */
  cells: Cell[][];
  tokens: Token[];
  rain: number;
  generatorFuel: number;
  substationFlooded: boolean;
  bridgeIntact: boolean;
  compliance: Record<DistrictId, number>;
  cutDistricts: DistrictId[];
  /** cellKey "x,y" -> game seconds spent in danger */
  peopleInDanger: Record<string, number>;
  harmed: number;
  saved: number;
  rumours: Rumour[];
  log: GameEvent[];
  modifier: Modifier;
}

export type Action =
  | { kind: 'deploy'; token: string; cell: XY }
  | { kind: 'recall'; token: string }
  | { kind: 'cut_power' | 'restore_power'; district: DistrictId }
  | { kind: 'broadcast'; text: string; counters?: string }
  | { kind: 'report'; fact: string };

export const cellKey = (c: XY) => `${c.x},${c.y}`;
