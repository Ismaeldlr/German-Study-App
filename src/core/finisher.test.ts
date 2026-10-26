import { daysBetween, finisherKinds } from './finisher';

const at = (day: number, hour = 9) => new Date(2026, 9, day, hour).getTime();
const now = new Date(at(25, 18));

describe('session finisher', () => {
  it('starts with a story, which works offline, when neither was done', () => {
    expect(finisherKinds({ story: null, chat: null }, now)).toEqual(['story', 'chat']);
  });

  it('comes every other day: not today or the day after the last one', () => {
    expect(finisherKinds({ story: at(25, 7), chat: null }, now)).toEqual([]);
    expect(finisherKinds({ story: at(24, 23), chat: null }, now)).toEqual([]);
    expect(finisherKinds({ story: at(23, 23), chat: null }, now)).toEqual(['chat', 'story']);
  });

  it('alternates: the kind done less recently goes first', () => {
    expect(finisherKinds({ story: at(20), chat: at(22) }, now)).toEqual(['story', 'chat']);
    expect(finisherKinds({ story: at(22), chat: at(20) }, now)).toEqual(['chat', 'story']);
  });

  it('counts calendar days, not 24-hour blocks', () => {
    expect(daysBetween(at(24, 23), at(25, 1))).toBe(1);
    expect(daysBetween(at(25, 1), at(25, 23))).toBe(0);
  });
});
