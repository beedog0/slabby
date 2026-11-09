jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import { cleanHandle, handleProblem, initialOf, publishKey } from '../profile';

describe('profile handles', () => {
  it('cleans what you type into a link-safe handle', () => {
    expect(cleanHandle('@Bryan Nguyen!')).toBe('bryannguyen');
    expect(cleanHandle('slab_king.10')).toBe('slab_king.10');
    expect(cleanHandle('a'.repeat(40))).toHaveLength(20);
  });
  it('explains a handle that can’t be used', () => {
    expect(handleProblem('')).toBeNull();
    expect(handleProblem('ab')).toMatch(/At least 3/);
    expect(handleProblem('.bryan')).toMatch(/Start and end/);
    expect(handleProblem('bryan_')).toMatch(/Start and end/);
    expect(handleProblem('bry..an')).toMatch(/two dots/);
    expect(handleProblem('bryan.n_16')).toBeNull();
  });
  it('picks the letter for a profile with no photo', () => {
    expect(initialOf('  bryan', '')).toBe('B');
    expect(initialOf('', 'slabking')).toBe('S');
    expect(initialOf('', '', 'nguyen@example.com')).toBe('N');
    expect(initialOf('', '')).toBe('');
  });
  it('sees a changed profile as needing a publish', () => {
    const p = { name: 'Bryan', handle: 'bryan', bio: '', photo: null };
    expect(publishKey(p)).toBe(publishKey({ ...p, name: 'Bryan ' }));
    expect(publishKey(p)).not.toBe(publishKey({ ...p, bio: 'PSA 10 Pikachu' }));
  });
});
