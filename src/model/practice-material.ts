import type {Part} from './types';

/** Applied earth and bedding are stripped for study, not rotated into timber joints. */
export function isPracticePart(part:Pick<Part,'material'>):boolean {
  return part.material!=='clay'&&part.material!=='mortar';
}
