import type { Source } from '@bdu/lib';
import { makeCmaAtomSource } from './cma-atom.js';
import { makeEcPressSource } from './ec-press.js';
import { makeEcCaseSearchSource } from './ec-case-search.js';

export function buildAllSources(): Source[] {
  return [makeCmaAtomSource(), makeEcPressSource(), makeEcCaseSearchSource()];
}

export { makeCmaAtomSource, makeEcPressSource, makeEcCaseSearchSource };
