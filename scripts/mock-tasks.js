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

function firstUser(body) {
  return body.messages.find((m) => m.role === 'user')?.content ?? '';
}

/** "die Wohnung" -> "Wohnung", "sich freuen auf" -> "freuen". */
function bareWord(word, type) {
  const bare = word.replace(/^(der|die|das)\s+/, '').replace(/^sich\s+/, '');
  return type === 'verb' ? bare.split(/\s+/)[0] : bare;
}

const GRAMMAR_CATEGORIES = [
  [/adjektiv|adjective/i, 'adjective_ending'],
  [/perfekt|präteritum|verb|konjunktiv|modal/i, 'verb_form'],
  [/weil|dass|nebensatz|wortstellung|word order/i, 'word_order'],
  [/artikel|article/i, 'article'],
];

const describeGrammar = {
  task: 'describe_grammar',
  respond(_lastUser, body) {
    const { point } = JSON.parse(firstUser(body));
    const category = GRAMMAR_CATEGORIES.find(([re]) => re.test(point))?.[1] ?? 'case_ending';
    return JSON.stringify({
      name: point.trim(),
      label: `the rule "${point.trim()}"`,
      summary: `${point.trim()}: a rule you practise in class. Look at the examples for the pattern.`,
      examples: [
        { de: 'Ich fahre mit dem Bus.', en: 'I go by bus.' },
        { de: 'Wir wohnen bei meinen Eltern.', en: 'We live with my parents.' },
        { de: 'Sie kommt von der Arbeit.', en: 'She is coming from work.' },
      ],
      categories: [category],
    });
  },
};

const DRILL_POOL = [
  ['Ich fahre mit ___ Bus zur Arbeit.', 'der Bus', 'dem', 'I go to work by bus.'],
  ['Wir wohnen bei ___ Eltern.', 'meine Eltern', 'meinen', 'We live with my parents.'],
  ['Sie kommt gerade von ___ Arbeit.', 'die Arbeit', 'der', 'She is just coming from work.'],
  [
    'Er spricht oft mit ___ Nachbarin.',
    'seine Nachbarin',
    'seiner',
    'He often talks to his neighbour.',
  ],
  ['Nach ___ Kurs gehen wir essen.', 'der Kurs', 'dem', 'After the course we go to eat.'],
  ['Das Geschenk ist von ___ Bruder.', 'mein Bruder', 'meinem', 'The present is from my brother.'],
  ['Wir treffen uns bei ___ Freundin.', 'eine Freundin', 'einer', 'We meet at a friend’s place.'],
  [
    'Seit ___ Jahr lerne ich Deutsch.',
    'ein Jahr',
    'einem',
    'I have been learning German for a year.',
  ],
  [
    'Ich gehe mit ___ Kindern in den Park.',
    'die Kinder',
    'den',
    'I go to the park with the children.',
  ],
  ['Aus ___ Küche riecht es gut.', 'die Küche', 'der', 'It smells good from the kitchen.'],
];
let drillCounter = 0;

const genGrammarDrill = {
  task: 'gen_grammar_drill',
  respond(_lastUser, body) {
    const input = JSON.parse(firstUser(body));
    const start = drillCounter++ * 5;
    const items = Array.from({ length: 5 }, (_, i) => {
      const [sentence, hint, answer, translation] = DRILL_POOL[(start + i) % DRILL_POOL.length];
      return {
        sentence,
        hint,
        answer,
        accepted: [],
        translation,
        explanation: `${input.point}: ${hint} becomes ${answer} ${hint.split(' ').slice(1).join(' ')}.`,
        category: input.categories[0] ?? 'case_ending',
      };
    });
    return JSON.stringify({ items });
  },
};

function translationClause(target) {
  const bare = bareWord(target.word, target.type);
  if (target.type === 'noun') {
    const article = /^(der|die|das)\s+/.exec(target.word)?.[1];
    return {
      de: `ich mag ${article ? ACCUSATIVE[article] + ' ' : ''}${bare}`,
      en: `I like the ${target.meaning}`,
    };
  }
  if (target.type === 'verb') return { de: `wir möchten ${bare}`, en: `we want ${target.meaning}` };
  return { de: `das ist ${bare}`, en: `that is ${target.meaning}` };
}

const genTranslation = {
  task: 'gen_translation',
  respond(_lastUser, body) {
    const first = firstUser(body);
    const items = JSON.parse(first.slice(first.indexOf('[')));
    return JSON.stringify({
      items: items.map((item) => {
        const clauses = item.targets.map(translationClause);
        return {
          id: item.id,
          english: `${cap(clauses.map((c) => c.en).join(', and '))}.`,
          reference: `${cap(clauses.map((c) => c.de).join(' und '))}.`,
          cues: item.targets.map((t) => t.meaning),
        };
      }),
    });
  },
};

function words(text) {
  return text
    .toLowerCase()
    .replace(/[.,!?;:"„“]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

const gradeTranslation = {
  task: 'grade_translation',
  respond(_lastUser, body) {
    const input = JSON.parse(firstUser(body));
    const given = words(input.answer);
    const reference = words(input.reference);
    const same = given.join(' ') === reference.join(' ');
    const targets = input.targets.map((t) => {
      const type = /^(der|die|das)\s/.test(t.word) ? 'noun' : /^to /.test(t.meaning) ? 'verb' : '';
      const bare = bareWord(t.word, type).toLowerCase();
      return { word: t.word, verdict: given.includes(bare) ? 'correct' : 'missing' };
    });
    const reordered = !same && [...given].sort().join(' ') === [...reference].sort().join(' ');
    const errors = same
      ? []
      : [
          {
            category: reordered ? 'word_order' : 'wrong_word',
            text: input.answer.trim(),
            correction: input.reference,
            explanation: reordered
              ? 'The verb goes in second position.'
              : 'Compare your sentence with the correction.',
            word: null,
          },
        ];
    return JSON.stringify({
      verdict: same ? 'correct' : 'wrong',
      targets,
      errors,
      corrected: same ? input.answer.trim() : input.reference,
      natural: input.reference,
      explanation: same ? 'Well done, that is correct.' : 'Not quite: see the correction.',
    });
  },
};

const CONTRAST_TEMPLATES = {
  verb: ['Wir möchten am Wochenende ___.', 'Ich kann das heute nicht ___.', 'Morgen will sie ___.'],
  noun: ['Wo ist ___ denn?', 'Ich brauche ___ heute.', 'Für mich ist ___ wichtig.'],
  other: ['Das finde ich ___.', 'Er sagt nur: ___.', 'Es ist wirklich ___.'],
};

const genContrast = {
  task: 'gen_contrast',
  respond(_lastUser, body) {
    const input = JSON.parse(firstUser(body));
    const items = Array.from({ length: 6 }, (_, i) => {
      const index = i % 2;
      const word = input.words[index];
      const type = word.type in CONTRAST_TEMPLATES ? word.type : 'other';
      const sentence = CONTRAST_TEMPLATES[type][Math.floor(i / 2)];
      const answer = type === 'noun' ? word.word : bareWord(word.word, type);
      return {
        word: index,
        sentence,
        hint: word.meaning,
        answer,
        accepted: [],
        translation: `(${input.topic}) A sentence with "${word.meaning}".`,
        explanation: `Here it means "${word.meaning}", so ${answer}.`,
      };
    });
    return JSON.stringify({
      explanation: `${input.words[0].word} means ${input.words[0].meaning}; ${input.words[1].word} means ${input.words[1].meaning}.`,
      items,
    });
  },
};

const leechHelp = {
  task: 'leech_help',
  respond(_lastUser, body) {
    const input = JSON.parse(firstUser(body));
    return JSON.stringify({
      hook: `Picture ${input.word} written in huge red letters next to "${input.meanings[0]}".`,
      partner: input.confusedWith
        ? { word: input.confusedWith, meaning: '(the other word)' }
        : null,
    });
  },
};

const STORY_OPENING = [
  'Lena wohnt seit einem Jahr in Leipzig. Sie arbeitet in einem kleinen Café in der Stadt.',
  'Am Morgen trinkt sie immer einen Kaffee und liest die Zeitung. Heute ist ein besonderer Tag.',
].join(' ');
const STORY_ENDING = [
  'Am Abend ruft sie ihre Freundin Mia an. Die beiden sprechen lange über den Tag.',
  'Mia lacht viel und erzählt von ihrer Arbeit. Das Wetter ist schön, und die Sonne scheint warm.',
  'Danach geht Lena müde ins Bett und schläft schnell ein.',
].join(' ');

/** A sentence that uses the target, and the form it stands in. */
function storyLine(target) {
  const bare = bareWord(target.word, target.type);
  if (target.type === 'noun') {
    const article = /^(der|die|das)\s+/.exec(target.word)?.[1] ?? 'die';
    return { de: `Für Lena ist ${article} ${bare} heute sehr wichtig.`, form: bare };
  }
  if (target.type === 'verb') return { de: `Lena möchte heute endlich ${bare}.`, form: bare };
  return { de: `Das findet Lena wirklich ${bare}.`, form: bare };
}

function storyQuestion(target) {
  const bare = bareWord(target.word, target.type);
  const sentence =
    target.type === 'noun'
      ? 'Lena denkt den ganzen Tag an ___.'
      : target.type === 'verb'
        ? 'Lena möchte bald ___.'
        : 'Lena findet alles ___.';
  return {
    target: target.id,
    sentence,
    answer: bare,
    accepted: [],
    cue: target.meaning,
    translation: `(story) A sentence with "${target.meaning}".`,
  };
}

const genStory = {
  task: 'gen_story',
  respond(_lastUser, body) {
    const input = JSON.parse(firstUser(body));
    const lines = input.targets.map(storyLine);
    return JSON.stringify({
      title: `Lenas Tag: ${input.topic}`,
      text: [STORY_OPENING, lines.map((l) => l.de).join(' '), STORY_ENDING].join('\n\n'),
      targets: input.targets.map((t, i) => ({ id: t.id, forms: [lines[i].form] })),
      glosses: [
        { de: 'besonderer', en: 'special' },
        { de: 'Zeitung', en: 'newspaper' },
        { de: 'erzählt', en: 'tells' },
      ],
      questions: input.targets.slice(0, 5).map(storyQuestion),
    });
  },
};

const chatOpen = {
  task: 'chat_open',
  respond(_lastUser, body) {
    const input = JSON.parse(firstUser(body));
    return JSON.stringify({
      title: `Im Treppenhaus: ${input.topic}`,
      character: 'Frau Becker, your neighbour',
      situation: `You meet your neighbour Frau Becker on the stairs and chat about ${input.topic}.`,
      reply: 'Hallo! Schön, Sie zu sehen. Wie geht es Ihnen heute?',
      translation: 'Hello! Nice to see you. How are you today?',
    });
  },
};

const CHAT_REPLIES = [
  [
    'Interessant! Und was machen Sie am Wochenende?',
    'Interesting! And what are you doing at the weekend?',
  ],
  ['Ah, verstehe. Wie lange wohnen Sie schon hier?', 'Ah, I see. How long have you lived here?'],
  ['Schön! Kennen Sie schon die anderen Nachbarn?', 'Nice! Do you know the other neighbours yet?'],
  ['Wirklich? Erzählen Sie mehr!', 'Really? Tell me more!'],
];
const NOUNS = Object.keys(KNOWN).filter((w) => KNOWN[w].kind === 'noun');

const chatTurn = {
  task: 'chat_turn',
  respond(_lastUser, body) {
    const input = JSON.parse(firstUser(body));
    const message = input.message;
    const tokens = message.split(/[\s,.!?]+/).filter(Boolean);
    const nounTargets = input.targets
      .filter((t) => /^(der|die|das)\s/.test(t.word))
      .map((t) => bareWord(t.word, 'noun'));
    const errors = [];
    for (const noun of [...new Set([...NOUNS, ...nounTargets])]) {
      if (tokens.includes(noun.toLowerCase())) {
        errors.push({
          category: 'capitalization',
          text: noun.toLowerCase(),
          correction: noun,
          explanation: 'German capitalizes every noun.',
        });
      }
    }
    if (/habe gegangen/i.test(message)) {
      errors.push({
        category: 'verb_form',
        text: 'habe gegangen',
        correction: 'bin gegangen',
        explanation: 'gehen forms the Perfekt with sein.',
      });
    }
    let corrected = message;
    for (const e of errors) corrected = corrected.replace(e.text, e.correction);
    const lower = tokens.map((t) => t.toLowerCase());
    const used = input.targets.flatMap((t) => {
      const type = /^(der|die|das)\s/.test(t.word) ? 'noun' : /^to /.test(t.meaning) ? 'verb' : '';
      const bare = bareWord(t.word, type);
      if (!lower.includes(bare.toLowerCase())) return [];
      return [
        { word: t.word, verdict: type === 'noun' && !tokens.includes(bare) ? 'slip' : 'correct' },
      ];
    });
    const last = input.turn >= input.turns;
    const [reply, translation] = last
      ? ['Das war schön! Vielen Dank und bis bald!', 'That was nice! Thank you and see you soon!']
      : CHAT_REPLIES[input.turn % CHAT_REPLIES.length];
    return JSON.stringify({
      correction: {
        verdict:
          errors.length === 0
            ? 'correct'
            : errors.some((e) => e.category !== 'capitalization')
              ? 'wrong'
              : 'minor',
        corrected,
        errors,
      },
      used,
      reply,
      translation,
      summary: `The learner has written ${input.turn} messages in "${input.scenario.title}".`,
    });
  },
};

const chatSummary = {
  task: 'chat_summary',
  respond(_lastUser, body) {
    const input = JSON.parse(firstUser(body));
    const mistakes = input.messages.flatMap((m) => m.errors);
    const text = input.messages.map((m) => m.text.toLowerCase()).join(' ');
    const wellUsed = input.targets.filter((t) => text.includes(bareWord(t, '').toLowerCase()));
    return JSON.stringify({
      feedback: mistakes.length
        ? 'You kept the conversation going well. Watch the capital letters on nouns: die Wohnung, not die wohnung.'
        : 'A great chat without a single mistake. Next time, try a sentence with weil.',
      wellUsed,
    });
  },
};

module.exports = {
  handlers: [
    enrichWords,
    genGapBatch,
    suggestWords,
    describeGrammar,
    genGrammarDrill,
    genTranslation,
    gradeTranslation,
    genContrast,
    leechHelp,
    genStory,
    chatOpen,
    chatTurn,
    chatSummary,
  ],
};
