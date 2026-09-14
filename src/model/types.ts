export type Vec3 = [number, number, number];
export type Layer = 'base' | 'columns' | 'brackets' | 'frame' | 'rafters' | 'boards' | 'tiles' | 'enclosure' | 'statues';
export type ShapeKind = `douJoint:${string}` | `rootDouMud:${number}` | `douProfile:${string}` | `sculpture:${string}` | `junCove:${string}` | `coveBoard:${string}` | `roofBoard:${string}` | `stairNotch:${number}:${number}` | `vaseYou:${string}` | 'eaveDragon' | 'ridgeStopBeast' | `roofJoint:${string}` | `roofRafter:${number}:${number}:${number}` | `roofRafter:${number}:${number}:${number}:${number}` | `plaqueMount:${number}:${number}:${number}` | 'frontPlaqueFlat' | `openDou:${number}:${number}` | `ceilingArm:${number}:${number}:${number}` | `gongBearing:${number}:${number}` | `humpArm:${number}:${number}` | `humpWing:${number}:${number}` | `cornerFang:${number}:${number}:${number}` | `cornerFootDou:${number}:${number}` | `bearingVase:${number}` | `seatedAng:${number}:${number}:${number}` | `cornerGong:${number}:${number}` | 'ceilingRail' | 'ceilingSpan' | `rootDou:${number}` | `rootDou:${number}:diagonal:${number}` | `bracketHead:${'sixfen'|'pizhu'|'wing'}` | `bracketJoint:${string}` | `rootArm:${number}` | 'slopeDou' | 'slopeFootDou' | 'box' | 'jointHump' | 'jointFlat' | 'jointBraceA' | 'jointBraceB' | 'gongSolid' | 'gongSolidEndSeats' | 'gongUpper' | 'gongUpperEndSeats' | 'gongEndSeats' | 'wallInfill' | 'mudWedge' | 'earMud' | `wallJoint:${string}` | 'fangNode' | 'fangNodeSeated' | 'splicedFangSpan' | 'fangSpan' | 'sofang' | 'sofangSeated' | 'latticeTop' | 'latticeBottom' | 'lapTop' | 'grassBeam' | 'column' | 'stone' | 'dou' | 'gong' | 'ang' | 'beam' | 'fourBeam' | 'interShua' | 'innerThrough' | 'rearShort' | 'linkedBeam' | 'linkedBeamBlank' | 'rafter' | 'tile' | 'coverTile' | 'ridge' | 'door' | 'statue' | 'buddha' | 'amitabha' | 'maitreya' | 'manjusri' | 'samantabhadra' | 'attendant' | 'guardian' | 'donor' | 'finial' | 'vase' | 'flame' | 'hump' | 'wallWindow' | 'frontPlaque' | 'frontPlaqueSolid';
export type MaterialKind = 'wood' | 'redwood' | 'stone' | 'plaster' | 'tile' | 'gold' | 'glaze' | 'mortar' | 'clay' | 'polychrome' | 'plaque' | 'plaqueSolid';

export interface Evidence {
  sources: string[];
  basis: string;
  inferred: string;
}

export interface Part {
  id: string;
  name: string;
  kind: string;
  layer: Layer;
  assembly: string;
  shape: ShapeKind;
  /** Exterior blank retained for surface decoration; never replaces physical joinery. */
  paintSourceShape?: ShapeKind;
  material: MaterialKind;
  position: Vec3;
  rotation: Vec3;
  size: Vec3;
  explode: Vec3;
  insertion: Vec3;
  stage: number;
  requires: string[];
  /** Subset of requires that reserves an installation route, without claiming physical bearing. */
  orderOnlyRequires?: string[];
  role: string;
  joint: string;
  evidence: Evidence;
}

export interface Assembly {
  id: string;
  name: string;
  layer: Layer;
  description: string;
  partIds: string[];
  contextPartIds?: string[];
  intercolumnBay?: {columnIds:string[];bracketIds:string[];connectionIds:string[]};
  legacyPartIds?: string[];
  legacyPartSets?: string[][];
  variant?: string;
  location?: string;
}

export interface Source {
  id: string;
  title: string;
  author: string;
  url: string;
  detail: string;
}

export interface Catalog {
  /** Explicit additive migration; new pieces never inherit completed status. */
  practiceAdditions?: string[];
  partAliases?: Record<string,string>;
  version: string;
  parts: Part[];
  assemblies: Assembly[];
  sources: Source[];
}

export const LAYERS: { id: Layer; name: string; short: string }[] = [
  { id: 'tiles', name: '瓦作与屋脊', short: '瓦作' },
  { id: 'boards', name: '望板与平闇', short: '望板' },
  { id: 'rafters', name: '椽与角梁', short: '椽架' },
  { id: 'frame', name: '梁架与槫', short: '梁架' },
  { id: 'brackets', name: '内外檐斗拱', short: '斗拱' },
  { id: 'columns', name: '柱网与阑额', short: '柱网' },
  { id: 'enclosure', name: '墙体与门窗', short: '围护' },
  { id: 'statues', name: '佛坛与塑像', short: '佛坛' },
  { id: 'base', name: '台基与柱础', short: '台基' },
];
