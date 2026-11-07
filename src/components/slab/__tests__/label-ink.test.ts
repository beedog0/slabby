import { gradeDescriptor, labelInk } from '../geometry';

describe('grader label colours', () => {
  it('tells graders apart by colour', () => {
    expect(labelInk('psa', 10).frame).toBe('#D01C2A');
    expect(labelInk('cgc', 10).frame).not.toBe(labelInk('psa', 10).frame);
    expect(labelInk('bgs', 9.5).paper).toBe('#141416');
  });
  it('gives BGS a gold edge from 9.5 and silver below', () => {
    expect(labelInk('bgs', 9.5).frame).not.toBe(labelInk('bgs', 9).frame);
  });
  it('prints each grader’s own grade words', () => {
    expect(gradeDescriptor('psa', 10)).toBe('GEM MT');
    expect(gradeDescriptor('bgs', 9.5)).toBe('GEM MINT');
    expect(gradeDescriptor('cgc', 9.5)).toBe('MINT+');
    expect(gradeDescriptor('psa', null)).toBeUndefined();
  });
});

it('prints a PSA 10 in black like every other PSA grade', () => {
  expect(labelInk('psa', 10).grade).toBe(labelInk('psa', 9).grade);
});
