import type { Card } from '../types';

/**
 * Identity of a card independent of whose copy it is, so two users holding the same slab
 * share price history. Format: grader:grade:setCode:number:language, e.g. "psa:10:SV2a:205:ja".
 */
export function cardKey(c: Pick<Card, 'grader' | 'grade' | 'setCode' | 'number' | 'language'>): string {
  return [c.grader, c.grade ?? '', c.setCode ?? '', c.number ?? '', c.language || 'en'].join(':');
}
