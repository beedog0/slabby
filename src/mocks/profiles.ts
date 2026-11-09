// Other collectors, for running without a server (web preview, tests). Same shape as the
// profiles + showcases tables.

import type { Card } from '../types';
import type { PublicCard, PublicProfile } from '../profile/publicProfile';
import cards from './cards.json';

const pick = (ids: string[], values?: number[]): PublicCard[] =>
  ids.map((id, i) => {
    const c = (cards as Card[]).find((x) => x.id === id)!;
    return {
      id: `m-${c.id}`,
      game: c.game,
      grader: c.grader,
      grade: c.grade,
      name: c.name,
      setName: c.setName,
      setCode: c.setCode,
      number: c.number,
      variety: c.variety ?? null,
      language: c.language,
      year: c.year,
      imageFrontUrl: c.imageFrontUrl,
      finish: c.finish ?? null,
      artColor: c.artColor,
      condition: c.condition,
      ...(values ? { valueCents: values[i] } : {}),
    };
  });

export const MOCK_PROFILES: PublicProfile[] = [
  {
    userId: 'mock-ava',
    handle: 'avaslabs',
    name: 'Ava Chen',
    bio: 'Japanese promos and Eeveelutions. Usually at Collect-A-Con.',
    photo: null,
    audience: 'everyone',
    showcase: {
      stats: { owned: 38, graded: 31, topGrade: 10, topGradeCount: 14, sets: 19, valueCents: 2_184_000 },
      cards: pick(['c2', 'c8', 'c1', 'c9', 'c5', 'c3', 'c4'], [340000, 92000, 65000, 41000, 120000, 160000, 98000]),
    },
  },
  {
    userId: 'mock-marcus',
    handle: 'marcus.vault',
    name: 'Marcus Reyes',
    bio: 'Alt arts only.',
    photo: null,
    audience: 'friends',
    showcase: null,
  },
  {
    userId: 'mock-jun',
    handle: 'jun_pulls',
    name: 'Jun Park',
    bio: '',
    photo: null,
    audience: 'everyone',
    showcase: {
      stats: { owned: 12, graded: 9, topGrade: 10, topGradeCount: 3, sets: 8, valueCents: null },
      cards: pick(['c6', 'c4', 'c7', 'c3']),
    },
  },
];
