import type { Block } from './types';

/** The grammar path grouped by subject, for picking what to study today. */
export const BLOCKS: Block[] = [
  { id: 'articles', name: 'Artikel & Nomen', label: 'der, die, das and plurals', icon: '🏷️' },
  { id: 'cases', name: 'Kasus', label: 'Accusative, dative, genitive', icon: '🔀' },
  { id: 'pronouns', name: 'Pronomen & Begleiter', label: 'Pronouns and possessives', icon: '👥' },
  { id: 'present', name: 'Verben im Präsens', label: 'Present tense and verb types', icon: '⚙️' },
  { id: 'modals', name: 'Modalverben', label: 'can, must, want, may, should', icon: '🎛️' },
  { id: 'tenses', name: 'Zeitformen', label: 'Past and future', icon: '⏳' },
  { id: 'konjunktiv', name: 'Konjunktiv II', label: 'Wishes, advice, if only', icon: '💭' },
  { id: 'passive', name: 'Passiv', label: 'The passive voice', icon: '🏗️' },
  { id: 'sentence', name: 'Satzbau', label: 'Word order and linking sentences', icon: '🧱' },
  { id: 'clauses', name: 'Nebensätze', label: 'Subordinate clauses', icon: '🔗' },
  { id: 'prepositions', name: 'Präpositionen', label: 'Place, time and case', icon: '📍' },
  { id: 'adjectives', name: 'Adjektive', label: 'Comparing and endings', icon: '🎨' },
  { id: 'numbers', name: 'Zahlen & Zeit', label: 'Clock, dates, time phrases', icon: '🕒' },
  { id: 'word_formation', name: 'Wortbildung', label: 'Building words', icon: '🧪' },
];
