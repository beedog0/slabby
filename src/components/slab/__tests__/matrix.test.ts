import { slabLayout } from '../geometry';
import { faceMatrices, project } from '../matrix';

const L = slabLayout(190);
const close = (a: [number, number], b: [number, number]) => {
  expect(a[0]).toBeCloseTo(b[0], 6);
  expect(a[1]).toBeCloseTo(b[1], 6);
};

describe('faceMatrices', () => {
  // Corners shared by two faces must land on the same screen point at every pose, or the
  // edges come apart from the case.
  const poses = [
    [-7, 3],
    [-35, -12],
    [40, 25],
    [-85, -5],
    [150, 8],
    [271, -30],
    [-200, 38],
  ];
  it.each(poses)('edges meet the faces at yaw %p pitch %p', (yaw, pitch) => {
    const f = faceMatrices(L, yaw, pitch, 950);
    const hw = L.w / 2;
    const hh = L.h / 2;
    const d = L.depth / 2;
    // Front face's right edge (local x = +hw) vs the right strip's front edge (local x = -d
    // on a strip turned 90°, i.e. its +z side).
    for (const y of [-hh, 0, hh]) {
      close(project(f.front.matrix, hw, y, 0), project(f.right.matrix, -d, y, 0));
      close(project(f.front.matrix, -hw, y, 0), project(f.left.matrix, d, y, 0));
      close(project(f.back.matrix, -hw, y, 0), project(f.right.matrix, d, y, 0));
    }
    for (const x of [-hw, 0, hw]) {
      close(project(f.front.matrix, x, -hh, 0), project(f.top.matrix, x, d, 0));
      close(project(f.front.matrix, x, hh, 0), project(f.bottom.matrix, x, -d, 0));
    }
  });

  it('shows the front and hides the back at the hero pose', () => {
    const f = faceMatrices(L, -7, 3, 950);
    expect(f.front.opacity).toBe(1);
    expect(f.back.opacity).toBe(0);
    expect(f.left.opacity).toBe(0);
  });

  it('shows the back after half a turn', () => {
    const f = faceMatrices(L, 173, 3, 950);
    expect(f.back.opacity).toBe(1);
    expect(f.front.opacity).toBe(0);
  });
});
