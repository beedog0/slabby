import cards from '../../mocks/cards.json';
import { rowFor } from '../../pricing/portfolio';
import { DEFAULT_RULES, type Card } from '../../types';
import { sellSheetHtml, sellSheetRows } from '../sellSheet';

jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));

const rows = (cards as Card[]).map((c) => rowFor(c, DEFAULT_RULES));

describe('sell sheet', () => {
  it('lists only owned cards for sale or trade, highest ask first', () => {
    const list = sellSheetRows(rows);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((r) => r.card.status === 'owned' && r.card.plan !== 'hold')).toBe(true);
    const asks = list.map((r) => r.ask ?? 0);
    expect(asks).toEqual([...asks].sort((a, b) => b - a));
  });

  it('shows the title and asks, never floors or paid prices', () => {
    const html = sellSheetHtml(rows, { title: 'Collect-A-Con', date: 'Nov 5' });
    expect(html).toContain('Collect-A-Con');
    expect(html).not.toMatch(/paid|floor/i);
  });
});
