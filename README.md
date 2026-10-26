# German Study

A mobile flashcard app for learning German vocabulary and grammar at A2 level. It pairs a spaced-repetition scheduler (FSRS) with a cheap LLM, so you study the exact words from your class in fresh sentences instead of the same stale card every time.

Built with React Native and Expo. Everything lives on the phone: no accounts, no server.

## Features

- **Add words fast.** Type a single word or paste a whole list in textbook notation (`die Wohnung, -en`, `umziehen, zog um, ist umgezogen`). The LLM fills in article, plural, verb forms and meaning, and you confirm a preview before anything enters the deck.
- **One item, several cards.** A noun gets separate cards for meaning, gender and plural; verbs get a card for their forms. Each card has its own schedule.
- **Smart study sessions.** One Study button builds a mixed session from what is due, adding fewer new words when your review pile is big.
- **Gap-fill exercises.** The LLM writes new A2 sentences around the words you are closest to forgetting, generated ahead of time so reviews work offline.
- **Translate and correct.** Words you know well come back as English sentences to write in German. The LLM accepts any correct German, marks the errors and shows a more natural version. Offline, answers wait and are graded later.
- **Grammar points.** Name a rule such as *Dativ nach mit, bei, von*; the LLM writes a short summary and examples, and the rule is drilled with generated five-item drills.
- **Weak spots.** Every mistake gets a category (articles, case endings, word order…). Recent ones weigh most, and your top weak spot pulls its grammar point into the next session.
- **Leeches and mix-ups.** Cards you keep forgetting get a memory hook; words you confuse, such as *stellen* and *stehen*, come back together in contrast exercises.
- **Mini stories.** Once a day the LLM writes a 120 to 200 word story around words you know. Tap any underlined word for its English, then answer a few gap questions with the story out of sight. A deck word you tap comes back sooner; one you read without help is left alone.
- **Chat roleplay.** Talk with a character in an everyday scenario that fits your chapter or interests, for up to ten messages. Every message you write gets a correction folded under it, the character steers toward words you are learning, and the chat ends with a teacher's summary. Mistakes go to your weak spots and each target word you used gets rated.
- **A finisher for the session.** About three days a week the Study session ends with a mini story or a short chat, alternating. Both are also on Home under *Mehr üben*.
- **Word suggestions.** When your queue runs dry, the app suggests A2 words for the current chapter, and you approve each one.
- **Chapters.** Paste the textbook's contents page once (`1 Zu Hause: Wohnen, Umzug`) and every new word lands in the chapter class is on. Each chapter shows how much of it is mature and has its own word list.
- **Cram mode.** Pick the chapters an exam covers and its date. Until then their cards are scheduled at 95% recall and come back on at least two different days, spread evenly over the days left instead of piling up the night before.
- **Stats.** Real recall over 7 and 30 days against your target, split by exercise so a strong gap fill cannot hide a weak translation. Also a 14-day review forecast, coverage per chapter, minutes studied per day and LLM spend.
- **Weak-spot drills.** Every weak spot has a one-tap drill: its grammar drills and the cards you made those mistakes on, due or not.
- **Progress you can see.** Every card earns XP, harder exercises earn more, and a daily goal ring fills as you go. Streaks come with freezes, so one missed day does not erase weeks. There are levels with German titles, an activity calendar and badges. All of it is computed from your review history, so a backup restores it too.
- **A daily reminder, if you want one.** Off until you turn it on. It sends one local notification a day at the hour you pick, plus an optional second one at 21:00, and skips days you already studied. The text names the work waiting (*23 reviews and 4 new words*), your streak and any banked freezes, and never guilt-trips.
- **A friendlier study session.** Articles are coloured by gender (der blue, die red, das green), answers get instant colour, haptics and a German cheer, a combo counter tracks answers in a row, and every session ends with a summary of what you earned.
- **Budget control.** Tracks token usage and stops at a monthly spending cap.
- **Backups.** Export and import your whole deck as a file.

## Tech stack

| Area      | Tools                                          |
| --------- | ---------------------------------------------- |
| App       | Expo, React Native, Expo Router, TypeScript    |
| Storage   | SQLite (`expo-sqlite`) with Drizzle ORM        |
| State     | Zustand                                        |
| Scheduler | [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) |
| LLM       | Any OpenAI-compatible API (OpenAI, DeepSeek, OpenRouter, or a custom URL) |
| Testing   | Jest, React Native Testing Library             |

## Getting started

You need Node.js 22 and either the [Expo Go](https://expo.dev/go) app, an Android emulator or an iOS simulator.

```bash
npm install
npm start
```

Then scan the QR code with Expo Go, or press `a` for Android or `i` for iOS.

### Connecting an LLM

Open **Settings** in the app, pick a provider, and paste your API key. The key is stored in the device's secure storage and never leaves the phone except to call that provider.

To try the app without an API key or spending money, run the local mock server:

```bash
node scripts/mock-llm-server.js
```

Then choose the **Custom** provider in Settings with base URL `http://10.0.2.2:8787/v1` (Android emulator) and key `test-key`.

## Scripts

| Command               | What it does                                  |
| --------------------- | --------------------------------------------- |
| `npm start`           | Start the Expo dev server                     |
| `npm test`            | Run the tests                                 |
| `npm run typecheck`   | Check types                                   |
| `npm run lint`        | Lint the code                                 |
| `npm run format`      | Format the code with Prettier                 |
| `npm run db:generate` | Generate a migration after changing the schema |
| `npm run ci`          | Run every check, the same as CI               |

## Project structure

```
src/
  app/        Screens and routes (Expo Router)
  core/       Pure logic: scheduling, grading, session planning, list parsing
  data/       SQLite schema, migrations and repositories
  features/   Screen components grouped by feature
  jobs/       Background work like prefetching exercises
  llm/        Provider adapters, prompts and cost tracking
  ui/         Shared UI components and theme
scripts/      Mock LLM server and data build scripts
```

## Status

Work in progress. The deck, scheduler, word entry, gap fills, translations, grammar drills, weak spots, leech handling, progress (XP, streaks, badges), mini stories, chat roleplay, stats, chapter coverage and cram mode work. Next up: end-to-end tests and a release build.
