import cards from '../../mocks/cards.json';
import { DEFAULT_RULES, type Card } from '../../types';
import { fromRow, isUuid, mergeVault, rulesFromRow, rulesToRow, toRow, uuid } from '../sync';

const mew = { ...(cards as Card[])[0], id: uuid() };

describe('ids', () => {
  it('makes v4 uuids', () => {
    for (let i = 0; i < 50; i++) expect(isUuid(uuid())).toBe(true);
    expect(isUuid('c1')).toBe(false);
  });
});

describe('row mapping', () => {
  it('round-trips a card and writes its card_key', () => {
    const row = toRow(mew, 'user-1');
    expect(row).toMatchObject({ user_id: 'user-1', card_key: 'psa:10:SV2a:205:ja', paid_cents: 65_000 });
    const back = fromRow(row);
    const { artColor, ...rest } = mew;
    expect(back).toEqual({ ...rest, game: 'pokemon' });
  });
  it('parses numeric grade strings from Postgres', () => {
    expect(fromRow({ ...toRow(mew, 'u'), grade: '9.5' as unknown as number }).grade).toBe(9.5);
  });
  it('round-trips rules', () => {
    expect(rulesFromRow(rulesToRow(DEFAULT_RULES, 'u'))).toEqual(DEFAULT_RULES);
  });
});

describe('mergeVault', () => {
  it('keeps server cards, adds local-only real cards, drops mock seeds', () => {
    const seed = (cards as Card[])[1]; // id "c2", not a uuid
    const localOnly = { ...mew, id: uuid() };
    const remote = [mew];
    const { merged, toPush } = mergeVault([seed, localOnly, mew], remote);
    expect(toPush).toEqual([localOnly]);
    expect(merged.map((c) => c.id)).toEqual([localOnly.id, mew.id]);
  });
  it('keeps slabs removed on this phone out, even while the server still has them', () => {
    const other = { ...mew, id: uuid() };
    const { merged, toPush } = mergeVault([], [mew, other], [mew.id]);
    expect(merged.map((c) => c.id)).toEqual([other.id]);
    expect(toPush).toEqual([]);
  });
});
