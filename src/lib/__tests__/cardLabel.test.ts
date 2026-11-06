import { cardLabel, langTag } from '../format';

describe('cardLabel', () => {
  it('marks non-English printings', () => {
    expect(cardLabel({ language: 'ja', grader: 'psa', grade: 10 })).toBe('JP · PSA 10');
    expect(cardLabel({ language: 'ko', grader: 'psa', grade: 9 })).toBe('KR · PSA 9');
  });
  it('leaves English cards as they were', () => {
    expect(cardLabel({ language: 'en', grader: 'psa', grade: 10 })).toBe('PSA 10');
    expect(cardLabel({ language: 'en', grader: 'raw', grade: null, condition: 'near mint' })).toBe('Raw · near mint');
  });
  it('tags languages', () => {
    expect(langTag('ja')).toBe('JP');
    expect(langTag('en')).toBe('');
  });
});
