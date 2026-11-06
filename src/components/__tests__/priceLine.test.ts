import { layoutLabels, scale, type Tick } from '../PriceLine';

const W = 350;
const line = (ticks: Tick[]) => {
  const pos = scale(ticks.map((t) => t.value));
  return layoutLabels(ticks, (v) => pos(v) * W, W);
};
const t = (value: number, label: string): Tick => ({ value, label, color: '#000' });

describe('layoutLabels', () => {
  it('gives every marker its price', () => {
    const out = line([t(9500, 'Paid'), t(13000, 'Floor'), t(15000, 'Market'), t(16500, 'Ask'), t(17200, 'High')]);
    expect(out.map((l) => l.price)).toEqual(['$95', '$130', '$150', '$165', '$172']);
  });

  it('never drops a label; crowded ones move above the line', () => {
    const out = line([t(13000, 'Target'), t(14500, 'Max'), t(15000, 'Market'), t(17200, 'High')]);
    expect(out).toHaveLength(4);
    expect(out.some((l) => l.lane === 'above')).toBe(true);
  });

  it('labels in the same lane do not overlap', () => {
    const out = line([t(100, 'Paid'), t(105, 'Floor'), t(110, 'Market'), t(115, 'Ask'), t(120, 'High')]);
    for (const lane of ['below', 'above'] as const) {
      const ls = out.filter((l) => l.lane === lane).sort((a, b) => a.left - b.left);
      for (let i = 1; i < ls.length; i++) expect(ls[i].left).toBeGreaterThanOrEqual(ls[i - 1].left + ls[i - 1].width);
    }
  });

  it('merges markers at the same price into one label', () => {
    const out = line([t(9500, 'Paid'), t(9500, 'Floor'), t(15000, 'Market')]);
    expect(out).toHaveLength(2);
    expect(out[0].names.map((n) => n.text)).toEqual(['Paid', 'Floor']);
    expect(out[0].price).toBe('$95');
  });
});

describe('pinned label', () => {
  it('keeps the dot label under the line and others yield', () => {
    const ask: Tick = { ...t(10000, 'Ask'), pin: true };
    const out = line([t(6000, 'Paid'), t(8000, 'Floor'), t(9100, 'Market'), t(9900, 'High'), ask]);
    const a = out.find((l) => l.names[0].text === 'Ask')!;
    expect(a.lane).toBe('below');
    expect(out.find((l) => l.names[0].text === 'High')!.lane).toBe('above');
  });
});
