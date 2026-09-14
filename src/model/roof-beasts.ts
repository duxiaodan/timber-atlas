import * as T from 'three';
import dragonSculpt from './eave-dragon.json';
import {EAVE_DRAGON_FRAME as F} from './eave-dragon-frame';
import terminalSculpt from './ridge-beast.json';

/** Independent photo-guided ceramic sculptures, facing local +X.
 * Eave dragons have an inward socket. Ridge terminals have a level sole.
 * Depth, concealed fastening and reverse ornament remain inferred. */
export function roofBeastGeometry(eave:boolean):T.BufferGeometry{
 if(eave)return new T.BufferGeometryLoader().parse(dragonSculpt).translate(-F.center[0],-F.center[1],-F.center[2]).scale(1/F.extent[0],1/F.extent[1],1/F.extent[2]);
 return new T.BufferGeometryLoader().parse(terminalSculpt);
}
