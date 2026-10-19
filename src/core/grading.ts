import {
  checkGerman,
  editDistance,
  normalizeAnswer,
  type AnswerCheck,
  type SlipKind,
} from './answers';
import { displayLemma, type ItemForms } from './cards';
import type { Article, MistakeCategory } from './model';

/** Grading for the classic cards. Every answer turns into an outcome without self-grading. */

export interface MistakeNote {
  category: MistakeCategory;
  yourText: string;
  correction: string;
  explanation: string;
}

export interface CardGrade {
  outcome: 'correct' | 'slip' | 'wrong';
  slips: SlipKind[];
  /** The right answer, as shown after answering. */
  expected: string;
  mistakes: MistakeNote[];
}

const ARTICLE_RE = /^(der|die|das)\s+(.+)$/i;

export function gradeProduce(item: ItemForms & { reflexive?: boolean }, given: string): CardGrade {
  const expected = displayLemma(item);
  const answer = normalizeAnswer(given);

  if (item.kind === 'noun') {
    const match = ARTICLE_RE.exec(answer);
    const article = match ? (match[1].toLowerCase() as Article) : null;
    const word = match ? match[2] : answer;
    const check = checkGerman(word, [item.lemma]);
    const grade = fromCheck(check, word, expected);
    if (grade.outcome !== 'wrong' && article && item.article && article !== item.article) {
      grade.outcome = 'slip';
      grade.mistakes.push({
        category: 'article',
        yourText: `${article} ${word}`,
        correction: expected,
        explanation: `${item.lemma} takes ${item.article}.`,
      });
    }
    return grade;
  }

  const check = checkGerman(answer, [item.lemma]);
  if (check.verdict === 'wrong' && item.lemma.startsWith('sich ')) {
    const withoutSich = checkGerman(answer, [item.lemma.slice(5)]);
    if (withoutSich.verdict !== 'wrong') {
      return {
        outcome: 'slip',
        slips: withoutSich.slips,
        expected,
        mistakes: [
          {
            category: 'verb_form',
            yourText: answer,
            correction: item.lemma,
            explanation: 'This verb is reflexive: it needs "sich".',
          },
        ],
      };
    }
  }
  return fromCheck(check, answer, expected);
}

export function gradeGender(item: ItemForms, chosen: Article): CardGrade {
  const expected = displayLemma(item);
  if (chosen === item.article) return { outcome: 'correct', slips: [], expected, mistakes: [] };
  return {
    outcome: 'wrong',
    slips: [],
    expected,
    mistakes: [
      {
        category: 'article',
        yourText: `${chosen} ${item.lemma}`,
        correction: expected,
        explanation: `${item.lemma} takes ${item.article}.`,
      },
    ],
  };
}

export function gradePlural(item: ItemForms, given: string): CardGrade {
  const plural = item.plural ?? '';
  const expected = `die ${plural}`;
  const answer = normalizeAnswer(given);
  const match = ARTICLE_RE.exec(answer);
  const word = match ? match[2] : answer;
  const grade = fromCheck(checkGerman(word, [plural]), word, expected);
  if (grade.outcome !== 'wrong' && match && match[1].toLowerCase() !== 'die') {
    grade.outcome = 'slip';
    grade.mistakes.push({
      category: 'article',
      yourText: answer,
      correction: expected,
      explanation: 'Every plural takes die.',
    });
  }
  return grade;
}

export interface VerbFormsAnswer {
  present3: string;
  preterite: string;
  perfect: string;
}

export interface VerbFormsGrade extends CardGrade {
  fields: Record<keyof VerbFormsAnswer, { outcome: CardGrade['outcome']; expected: string }>;
}

const PRONOUN_RE = /^(?:er\/sie\/es|er|sie|es|man)\s+/i;

export function gradeVerbForms(item: ItemForms, given: VerbFormsAnswer): VerbFormsGrade {
  const aux = item.verbAuxiliary === 'sein' ? 'ist' : 'hat';
  const expectedPerfect = `${aux} ${item.verbParticiple ?? ''}`;
  const mistakes: MistakeNote[] = [];
  const slips = new Set<SlipKind>();

  const simple = (text: string, form: string | null) => {
    const answer = normalizeAnswer(text).replace(PRONOUN_RE, '');
    const check = checkGerman(answer, [form ?? '']);
    for (const slip of check.slips) {
      slips.add(slip);
      mistakes.push(slipMistake(slip, answer, form ?? ''));
    }
    if (check.verdict === 'wrong') {
      mistakes.push({
        category: 'verb_form',
        yourText: answer,
        correction: form ?? '',
        explanation: `${item.lemma}: ${form}`,
      });
    }
    return { outcome: check.verdict, expected: form ?? '' };
  };

  const present3 = simple(given.present3, item.verbPresent3);
  const preterite = simple(given.preterite, item.verbPreterite);

  const perfectAnswer = normalizeAnswer(given.perfect).replace(PRONOUN_RE, '');
  const perfectMatch = /^(hat|ist|haben|sein)\s+(.+)$/i.exec(perfectAnswer);
  let perfect: { outcome: CardGrade['outcome']; expected: string };
  if (!perfectMatch) {
    perfect = { outcome: 'wrong', expected: expectedPerfect };
    mistakes.push({
      category: 'verb_form',
      yourText: perfectAnswer,
      correction: expectedPerfect,
      explanation: `The Perfekt needs its helper verb: ${expectedPerfect}.`,
    });
  } else {
    const givenAux = /^(ist|sein)$/i.test(perfectMatch[1]) ? 'ist' : 'hat';
    const check = checkGerman(perfectMatch[2], [item.verbParticiple ?? '']);
    if (givenAux !== aux) {
      perfect = { outcome: 'wrong', expected: expectedPerfect };
      mistakes.push({
        category: 'verb_form',
        yourText: perfectAnswer,
        correction: expectedPerfect,
        explanation: `${item.lemma} forms the Perfekt with ${item.verbAuxiliary}.`,
      });
    } else {
      for (const slip of check.slips) {
        slips.add(slip);
        mistakes.push(slipMistake(slip, perfectAnswer, expectedPerfect));
      }
      perfect = { outcome: check.verdict, expected: expectedPerfect };
      if (check.verdict === 'wrong') {
        mistakes.push({
          category: 'verb_form',
          yourText: perfectAnswer,
          correction: expectedPerfect,
          explanation: `${item.lemma}: ${expectedPerfect}`,
        });
      }
    }
  }

  const fields = { present3, preterite, perfect };
  const outcomes = Object.values(fields).map((f) => f.outcome);
  const outcome = outcomes.includes('wrong')
    ? 'wrong'
    : outcomes.includes('slip')
      ? 'slip'
      : 'correct';
  return {
    outcome,
    slips: [...slips],
    expected: `${item.verbPresent3}, ${item.verbPreterite}, ${expectedPerfect}`,
    mistakes,
    fields,
  };
}

function fromCheck(check: AnswerCheck, given: string, expected: string): CardGrade {
  const mistakes: MistakeNote[] = check.slips.map((slip) => slipMistake(slip, given, expected));
  if (check.verdict === 'wrong' && given) {
    const close = editDistance(given.toLowerCase(), check.expected.toLowerCase()) <= 2;
    mistakes.push({
      category: close ? 'spelling' : 'wrong_word',
      yourText: given,
      correction: expected,
      explanation: close ? 'Close, but the spelling is off.' : `The answer is ${expected}.`,
    });
  }
  return { outcome: check.verdict, slips: check.slips, expected, mistakes };
}

function slipMistake(slip: SlipKind, given: string, expected: string): MistakeNote {
  return slip === 'capitalization'
    ? {
        category: 'capitalization',
        yourText: given,
        correction: expected,
        explanation: 'German capitalizes every noun.',
      }
    : {
        category: 'spelling',
        yourText: given,
        correction: expected,
        explanation: 'Mind the umlaut (ä, ö, ü, ß).',
      };
}
