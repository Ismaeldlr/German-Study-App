/**
 * Canned replies for the mock LLM server, so the app's flows can be tried
 * end to end offline. These are plausible, not authoritative: a handful of
 * known words plus simple guesses for everything else.
 */

const KNOWN = {
  Wohnung: {
    kind: 'noun',
    article: 'die',
    plural: 'Wohnungen',
    meanings: ['flat', 'apartment'],
    de: 'Die Wohnung hat zwei Zimmer.',
    en: 'The flat has two rooms.',
  },
  Küche: {
    kind: 'noun',
    article: 'die',
    plural: 'Küchen',
    meanings: ['kitchen'],
    de: 'Die Küche ist klein.',
    en: 'The kitchen is small.',
  },
  Zimmer: {
    kind: 'noun',
    article: 'das',
    plural: 'Zimmer',
    meanings: ['room'],
    de: 'Mein Zimmer ist hell.',
    en: 'My room is bright.',
  },
  Miete: {
    kind: 'noun',
    article: 'die',
    plural: 'Mieten',
    meanings: ['rent'],
    de: 'Die Miete ist hoch.',
    en: 'The rent is high.',
  },
  Nachbar: {
    kind: 'noun',
    article: 'der',
    plural: 'Nachbarn',
    meanings: ['neighbour'],
    de: 'Mein Nachbar ist nett.',
    en: 'My neighbour is nice.',
  },
  Balkon: {
    kind: 'noun',
    article: 'der',
    plural: 'Balkone',
    meanings: ['balcony'],
    de: 'Wir sitzen auf dem Balkon.',
    en: 'We are sitting on the balcony.',
  },
  Bahnhof: {
    kind: 'noun',
    article: 'der',
    plural: 'Bahnhöfe',
    meanings: ['train station'],
    de: 'Der Bahnhof ist nicht weit.',
    en: 'The station is not far.',
  },
  Eltern: {
    kind: 'noun',
    article: null,
    plural: 'Eltern',
    meanings: ['parents'],
    de: 'Meine Eltern wohnen in Wien.',
    en: 'My parents live in Vienna.',
  },
  // Deliberately wrong gender, to show the Wiktionary cross-check.
  Garten: {
    kind: 'noun',
    article: 'die',
    plural: 'Gärten',
    meanings: ['garden'],
    de: 'Der Garten ist schön.',
    en: 'The garden is beautiful.',
  },
  umziehen: {
    kind: 'verb',
    verb: ['zieht um', 'zog um', 'umgezogen', 'sein'],
    separable: true,
    meanings: ['to move (house)'],
    de: 'Wir ziehen im Mai um.',
    en: 'We are moving in May.',
  },
  wohnen: {
    kind: 'verb',
    verb: ['wohnt', 'wohnte', 'gewohnt', 'haben'],
    meanings: ['to live', 'to reside'],
    de: 'Ich wohne in Berlin.',
    en: 'I live in Berlin.',
  },
  'sich freuen auf': {
    kind: 'verb',
    verb: ['freut sich auf', 'freute sich auf', 'gefreut', 'haben'],
    reflexive: true,
    case: 'akk',
    meanings: ['to look forward to'],
    de: 'Ich freue mich auf das Wochenende.',
    en: 'I am looking forward to the weekend.',
  },
  gemütlich: {
    kind: 'adjective',
    meanings: ['cosy', 'comfortable'],
    de: 'Das Wohnzimmer ist gemütlich.',
    en: 'The living room is cosy.',
  },
};

// Inflected forms the mock can map back to a lemma.
const FORMS = { 'zog um': 'umziehen', 'zieht um': 'umziehen', wohnt: 'wohnen', Wohnug: 'Wohnung' };

function guessRecord(id, text) {
  const cleaned = text
    .replace(/^\s*(?:[-•*·]|\d+[.)])\s+/, '')
    .split(/\t| – | — | - | = /)[0]
    .trim();
  const translation = text.split(/\t| – | — | - | = /)[1]?.trim();
  if (/^(kapitel|lektion|seite)\b/i.test(cleaned) || !/[a-zäöü]/i.test(cleaned)) {
    return base(id, { status: 'unclear', kind: 'phrase', lemma: cleaned, meanings: [] });
  }
  const noun = /^(der|die|das)\s+([^,(]+)/i.exec(cleaned);
  const head = noun ? noun[2].trim() : cleaned.split(',')[0].trim();
  const lemma = FORMS[head] ?? head;
  const known = KNOWN[lemma];
  if (known) {
    return base(id, {
      kind: known.kind,
      lemma,
      article: known.kind === 'noun' ? known.article : null,
      plural: known.plural ?? null,
      verb: known.verb
        ? {
            present3: known.verb[0],
            preterite: known.verb[1],
            participle: known.verb[2],
            auxiliary: known.verb[3],
          }
        : null,
      separable: Boolean(known.separable),
      reflexive: Boolean(known.reflexive),
      case: known.case ?? null,
      meanings: translation ? [translation, ...known.meanings] : known.meanings,
      example_de: known.de,
      example_en: known.en,
    });
  }
  if (noun) {
    return base(id, {
      kind: 'noun',
      lemma,
      article: noun[1].toLowerCase(),
      plural: `${lemma}en`,
      meanings: [translation || `(meaning of ${lemma})`],
      example_de: `Das ist ${noun[1].toLowerCase() === 'der' ? 'der' : noun[1].toLowerCase()} ${lemma}.`,
      example_en: `That is the ${lemma}.`,
      low_confidence: ['plural', 'meanings'],
    });
  }
  return base(id, {
    kind: /en$/.test(lemma) && !/\s/.test(lemma) ? 'verb' : 'phrase',
    lemma,
    verb:
      /en$/.test(lemma) && !/\s/.test(lemma)
        ? {
            present3: `${lemma.slice(0, -2)}t`,
            preterite: `${lemma.slice(0, -2)}te`,
            participle: `ge${lemma.slice(0, -2)}t`,
            auxiliary: 'haben',
          }
        : null,
    meanings: [translation || `(meaning of ${lemma})`],
    example_de: `Ich sage: ${lemma}.`,
    example_en: `I say: ${lemma}.`,
    low_confidence: ['meanings'],
  });
}

function base(id, fields) {
  return {
    id,
    status: 'ok',
    kind: 'phrase',
    lemma: '',
    article: null,
    plural: null,
    verb: null,
    separable: false,
    reflexive: false,
    case: null,
    meanings: [],
    example_de: '',
    example_en: '',
    low_confidence: [],
    note: null,
    ...fields,
  };
}

const enrichWords = {
  task: 'enrich_words',
  respond(_lastUser, body) {
    const first = body.messages.find((m) => m.role === 'user')?.content ?? '';
    const json = first.slice(first.indexOf('['));
    const lines = JSON.parse(json);
    return JSON.stringify({ items: lines.map((l) => guessRecord(l.id, l.text)) });
  },
};

const ACCUSATIVE = { der: 'den', die: 'die', das: 'das' };
const TEMPLATES = {
  noun: [
    (a) => `${cap(a.nom)} ___ gefällt mir sehr gut.`,
    (a) => `Wo ist ${a.nom} ___ denn?`,
    (a) => `Mein Freund findet ${a.acc} ___ wirklich toll.`,
    (a) => `Gestern haben wir ${a.acc} ___ gesucht.`,
    (a) => `Ich brauche ${a.acc} ___ heute noch.`,
    (a) => `Für mich ist ${a.nom} ___ sehr wichtig.`,
  ],
  verb: [
    () => 'Wir möchten am Wochenende ___.',
    () => 'Ich kann heute leider nicht ___.',
    () => 'Morgen will meine Schwester ___.',
    () => 'Im Sommer müssen wir oft ___.',
    () => 'Darf ich am Abend ___?',
    () => 'Meine Eltern wollen nächstes Jahr ___.',
  ],
  adjective: [
    () => 'Die Wohnung ist wirklich ___.',
    () => 'Das finde ich sehr ___.',
    () => 'Unser neues Zimmer ist ___.',
    () => 'Der Abend war ziemlich ___.',
    () => 'Ist der Garten auch ___?',
  ],
  other: [
    () => 'Er sagt am Telefon nur: ___.',
    () => 'Sie antwortet ganz ruhig: ___.',
    () => 'Auf dem Zettel steht: ___.',
  ],
};
let sentenceCounter = 0;

function cap(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function gapItem(bundle) {
  const article = /^(der|die|das)\s+/.exec(bundle.word)?.[1] ?? null;
  const bare = bundle.word.replace(/^(der|die|das)\s+/, '');
  const kind = bundle.type in TEMPLATES ? bundle.type : 'other';
  const answer = kind === 'verb' ? bare.replace(/^sich\s+/, '').split(/\s+/)[0] : bare;
  const templates = TEMPLATES[kind];
  const pick = templates[(sentenceCounter++ + bundle.id) % templates.length];
  const articles = { nom: article ?? 'die', acc: article ? ACCUSATIVE[article] : 'die' };
  const support = bundle.support.map((s) => s.replace(/^(der|die|das)\s+/, ''));
  const extra = support.length ? ` Dazu passen auch: ${support.join(', ')}.` : '';
  return {
    id: bundle.id,
    sentence: `${pick(articles)}${extra}`,
    answer,
    accepted: [],
    cue: bundle.meaning,
    translation: `(${bundle.topic}) A sentence with "${bundle.meaning}".`,
    glosses: support.map((s) => ({ de: s, en: `(${s})` })),
  };
}

const genGapBatch = {
  task: 'gen_gap_batch',
  respond(_lastUser, body) {
    const first = body.messages.find((m) => m.role === 'user')?.content ?? '';
    const bundles = JSON.parse(first.slice(first.indexOf('[')));
    return JSON.stringify({ items: bundles.map(gapItem) });
  },
};

const suggestWords = {
  task: 'suggest_words',
  respond(_lastUser, body) {
    const first = body.messages.find((m) => m.role === 'user')?.content ?? '{}';
    const input = JSON.parse(first);
    const skip = new Set([...input.known, ...input.avoid].map((w) => w.toLowerCase()));
    const anchor = input.known[0];
    const items = Object.keys(KNOWN)
      .filter((lemma) => !skip.has(lemma.toLowerCase()))
      .slice(0, input.count)
      .map((lemma) => {
        const record = guessRecord(0, lemma);
        delete record.id;
        delete record.status;
        delete record.low_confidence;
        delete record.note;
        return {
          ...record,
          reason: anchor
            ? `Goes with ${anchor}, which you know.`
            : `Fits ${input.topic ?? 'the chapter'}.`,
        };
      });
    return JSON.stringify({ items });
  },
};

module.exports = { handlers: [enrichWords, genGapBatch, suggestWords] };
