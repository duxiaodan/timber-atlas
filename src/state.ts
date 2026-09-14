import {getDouProfile} from './model/dou-installation';
import type { Catalog, Layer, Part, Vec3 } from './model/types';
import {practiceMemberIds,localPracticeMemberIds,studyMemberIds} from './model/study-scope';
import {isPracticePart} from './model/practice-material';
export interface CameraPose {position:Vec3;target:Vec3;pivot?:Vec3;}

export const SAVE_KEY = 'foguang-east-hall:v1';
export interface Practice {
  scope: string[];
  completed: string[];
  active: string | null;
  turn: number;
  distance: number;
  hints: boolean;
}
export interface Session {
  version: string;
  selected: string | null;
  scope: string | null;
  isolated: string | null;
  expandedContext: boolean;
  doorsOpen: boolean;
  camera: CameraPose | null;
  visible: Record<Layer, boolean>;
  appearance: 'present' | 'wood' | 'natural';
  explode: number;
  removed: string[];
  hidden: string[];
  practice: Practice | null;
  lessons: Record<string, Practice>;
}

export function initialSession(version: string): Session {
  return { version, selected: null, scope: null, isolated: null, expandedContext:false, doorsOpen:false, camera:null,
    visible: { base: true, columns: true, brackets: true, frame: true, rafters: true, boards: true, tiles: true, enclosure: true, statues: true },
    appearance: 'present', explode: 0, removed: [], hidden: [], practice: null, lessons: {} };
}

export function lessonKey(session: Pick<Session,'isolated'|'scope'|'expandedContext'>): string {
  return session.isolated?`part:${session.isolated}`:session.scope?(session.expandedContext?session.scope:`local:${session.scope}`):'hall';
}

export function restoreSession(raw: string | null, catalog: Catalog): Session {
  const fresh = initialSession(catalog.version);
  if (!raw) return fresh;
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== catalog.version) return fresh;
    const ids = new Set(catalog.parts.map(p => p.id));
    const assemblies = new Set(catalog.assemblies.map(a => a.id));
    const physicalId=(id:unknown)=>typeof id==='string'?(catalog.partAliases?.[id]??id):'';
    const strings = (items: unknown): string[] => Array.isArray(items) ? [...new Set(items.map(physicalId).filter(id=>ids.has(id)))] : [];
    fresh.selected = ids.has(physicalId(data.selected)) ? physicalId(data.selected) : null;
    fresh.scope = assemblies.has(data.scope) ? data.scope : null;
    fresh.expandedContext = data.expandedContext === true;
    fresh.doorsOpen = data.doorsOpen === true;
    fresh.isolated = ids.has(physicalId(data.isolated)) ? physicalId(data.isolated) : null;
    const vector=(v:unknown):v is Vec3=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<1000);
    if(vector(data.camera?.position)&&vector(data.camera?.target)){
      const distance=Math.hypot(...data.camera.position.map((n:number,i:number)=>n-data.camera.target[i]));
      if(distance>.015&&distance<500)fresh.camera={position:data.camera.position,target:data.camera.target,...vector(data.camera.pivot)?{pivot:data.camera.pivot}:{}};
    }
    for (const key of Object.keys(fresh.visible) as Layer[]) if (typeof data.visible?.[key] === 'boolean') fresh.visible[key] = data.visible[key];
    fresh.appearance = data.appearance === 'wood' || data.appearance === 'natural' ? data.appearance : 'present';
    fresh.explode = typeof data.explode === 'number' && Number.isFinite(data.explode) ? Math.max(0, Math.min(1, data.explode)) : 0;
    fresh.removed = strings(data.removed); fresh.hidden = strings(data.hidden);
    const byId = new Map(catalog.parts.map(p => [p.id, p]));
    function restorePractice(value: unknown, key: string): Practice | null {
      if (!value || typeof value !== 'object') return null;
      const p = value as Record<string, unknown>;
      const local=key.startsWith('local:');
      const assembly=catalog.assemblies.find(a=>a.id===(local?key.slice(6):key));
      const original=(key==='hall'?catalog.parts.map(p=>p.id):key.startsWith('part:')?[key.slice(5)]:assembly?.partIds??[]).filter(id=>byId.has(id)&&isPracticePart(byId.get(id)!));
      const expected=assembly?localPracticeMemberIds(catalog,assembly):original;
      // Older lessons included applied coatings; retain valid piece progress when stripping them.
      const requested = new Set(strings(p.scope).filter(id=>isPracticePart(byId.get(id)!)));
      const matches=(ids:string[])=>ids.length===requested.size&&ids.every(id=>requested.has(id));
      const legacySets=[...(assembly?.legacyPartSets??[]),...(assembly?.legacyPartIds?[assembly.legacyPartIds]:[])];
      const legacyMatches=assembly&&legacySets.some(legacy=>matches(legacy)||matches(practiceMemberIds(catalog,{...assembly,partIds:legacy})));
      const bayMigration=assembly?.intercolumnBay&&expected.every(id=>requested.has(id))&&[...requested].every(id=>studyMemberIds(catalog,assembly,true).includes(id));
      const fullMigration=assembly&&matches(practiceMemberIds(catalog,assembly));
      const additiveHallMigration=key==='hall'&&!!catalog.practiceAdditions?.length&&expected.filter(id=>!catalog.practiceAdditions!.includes(id)).every(id=>requested.has(id))&&[...requested].every(id=>expected.includes(id));
      if(!additiveHallMigration&&!bayMigration&&!fullMigration&&!matches(expected)&&!matches(original)&&!legacyMatches)return null;
      const ordered = installationOrder(expected.map(id => byId.get(id)!));
      const scope = ordered.map(p => p.id), scopeSet = new Set(scope);
      if (!scope.length) return null;
      // Completing a former short segment cannot complete its newly unified full beam.
      const claimed = new Set((Array.isArray(p.completed)?p.completed:[]).filter((id:unknown):id is string=>typeof id==='string'&&ids.has(id)&&requested.has(id))), valid = new Set<string>();
      for (const part of ordered) if (claimed.has(part.id) && part.requires.every(id => !scopeSet.has(id) || valid.has(id))) valid.add(part.id);
      const ready = ordered.filter(part => !valid.has(part.id) && part.requires.every(id => !scopeSet.has(id) || valid.has(id)));
      const active = ready.find(part => part.id === physicalId(p.active))?.id ?? ready[0]?.id ?? null;
      const sameActive = active === physicalId(p.active);
      const turn = sameActive && Number.isInteger(p.turn) ? ((Number(p.turn) % 4) + 4) % 4 : 1;
      const distance = sameActive && typeof p.distance === 'number' && Number.isFinite(p.distance) ? Math.max(0,Math.min(3,p.distance)) : 2;
      return {scope, completed:[...valid], active, turn, distance, hints:p.hints !== false};
    }
    fresh.practice = restorePractice(data.practice,lessonKey(fresh));
    if (data.lessons && typeof data.lessons === 'object') for (const [key,value] of Object.entries(data.lessons)) {
      const physicalKey=key.startsWith('part:')?`part:${physicalId(key.slice(5))}`:key;
      if (physicalKey !== 'hall' && !assemblies.has(physicalKey) && !(physicalKey.startsWith('local:')&&assemblies.has(physicalKey.slice(6))) && !(physicalKey.startsWith('part:') && ids.has(physicalKey.slice(5)))) continue;
      const lesson = restorePractice(value,physicalKey);
      if (lesson) fresh.lessons[physicalKey] = lesson;
    }
    if(fresh.scope&&!fresh.isolated&&!fresh.expandedContext){
      const assembly=catalog.assemblies.find(a=>a.id===fresh.scope)!;
      if(fresh.selected&&!studyMemberIds(catalog,assembly).includes(fresh.selected))fresh.selected=assembly.partIds[0]??null;
      // An old forest-wide camera would leave the new compact view tiny or off centre.
      if(data.expandedContext===undefined)fresh.camera=null;
    }
    return fresh;
  } catch { return fresh; }
}

export function installationOrder(parts: Part[]): Part[] {
  const byId = new Map(parts.map(p => [p.id, p]));
  const sorted = [...parts].sort((a, b) => a.stage - b.stage || a.position[1] - b.position[1] || a.id.localeCompare(b.id));
  const visited = new Set<string>(); const visiting = new Set<string>(); const result: Part[] = [];
  function visit(part: Part) {
    if (visited.has(part.id)) return;
    if (visiting.has(part.id)) throw new Error(`构件依赖成环：${part.id}`);
    visiting.add(part.id);
    for (const dep of part.requires) { const required = byId.get(dep); if (required) visit(required); }
    visiting.delete(part.id); visited.add(part.id); result.push(part);
  }
  sorted.forEach(visit);
  return result;
}

export function startPractice(parts: Part[], hints = true): Practice {
  const scope = installationOrder(parts.filter(isPracticePart)).map(p => p.id);
  return { scope, completed: [], active: scope[0] ?? null, turn: 1, distance: 2, hints };
}

export function allowedQuarterTurns(part: Part): number[] {
  const square=Math.abs(part.size[0]-part.size[2])<1e-6;
  if(part.shape.startsWith('rootDouMud:'))return [0,2];
  if(part.shape.startsWith('douProfile:')){
    const p=getDouProfile(part.shape.slice(11));
    if(p.slope?.some(v=>Math.abs(v)>1e-8))return [0];
    if(p.channels.length===1)return [0,2];
    return square&&p.channels.length===2&&Math.abs(p.channels[0].width-p.channels[1].width)<1e-8?[0,1,2,3]:[0,2];
  }
  if(['column','stone','dou','vase'].includes(part.shape)||part.shape.startsWith('rootDou:'))return square?[0,1,2,3]:[0,2];
  if(part.shape==='box'||part.shape==='lapTop')return square&&part.shape==='box'?[0,1,2,3]:[0,2];
  if(['gong','gongUpper','gongEndSeats','beam','fourBeam','linkedBeam','sofang','rafter','tile','coverTile','hump'].includes(part.shape))return [0,2];
  // One-sided end joints, asymmetric profiles and uneven grid notches keep their designated orientation.
  return [0];
}

export function checkPlacement(practice: Practice, part: Part): { ok: boolean; message: string } {
  if (part.id !== practice.active || !practice.scope.includes(part.id) || practice.completed.includes(part.id)) return {ok:false,message:'请先选择本次练习中待安装的构件。'};
  const missing = part.requires.filter(id => practice.scope.includes(id) && !practice.completed.includes(id));
  if (missing.length) return { ok: false, message: '承接这件构件的前置构件尚未安装，请先完成前一步。' };
  if (!Number.isInteger(practice.turn)||!allowedQuarterTurns(part).includes(((practice.turn%4)+4)%4)) return { ok: false, message: '朝向尚未对齐。旋转构件，让榫头与承接位置一致。' };
  if (!Number.isFinite(practice.distance) || practice.distance < 0 || practice.distance > 0.10) return { ok: false, message: '还没有插入到位。沿插入方向继续移动，接近位置时会自动吸附。' };
  return { ok: true, message: `${part.name}已安装。` };
}

export function completePlacement(practice: Practice, part: Part): Practice {
  if (!checkPlacement(practice, part).ok) return practice;
  const completed = [...new Set([...practice.completed, part.id])];
  return { ...practice, completed, active: practice.scope.find(id => !completed.includes(id)) ?? null, turn: 1, distance: 2 };
}
