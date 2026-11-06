jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../components/menu/Menu', () => ({ openMenu: jest.fn() }));
import { removeSlabs } from '../../components/collection/remove';
import { useDisplay } from '../display';
import { useVault } from '../vault';

describe('removing slabs', () => {
  it('drops them, keeps a tombstone, and unpins and unorders them', () => {
    const ids = useVault.getState().cards.map((c) => c.id);
    expect(ids.length).toBeGreaterThan(2);
    useDisplay.setState({ pinnedId: ids[0], order: ids });
    const then = jest.fn();
    removeSlabs([ids[0], ids[1]], then);
    expect(then).toHaveBeenCalled();
    expect(useVault.getState().cards.map((c) => c.id)).toEqual(ids.slice(2));
    expect(useVault.getState().removedIds).toEqual([ids[0], ids[1]]);
    expect(useDisplay.getState().pinnedId).toBeNull();
    expect(useDisplay.getState().order).toEqual(ids.slice(2));
    useVault.getState().clearRemoved([ids[0]]);
    expect(useVault.getState().removedIds).toEqual([ids[1]]);
  });
});
