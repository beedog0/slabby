import { groupsOf } from '../Menu';

const a = { label: 'A', onPress: () => {} };
const b = { label: 'B', onPress: () => {} };

test('a flat list is one group', () => {
  expect(groupsOf([a, b])).toEqual([[a, b]]);
});

test('grouped lists keep their groups and drop empty ones', () => {
  expect(groupsOf([[a], [], [b]])).toEqual([[a], [b]]);
});

test('no items, no groups', () => {
  expect(groupsOf([])).toEqual([]);
});
