// Tagging in the chat with "@" (634 A): where a name may stand after "@" in
// a message and which character it is (the engine), and on the page the
// name being typed, the characters it may be, the line with a whole name
// put in and the tags a message shows (src/client/mentions.js).

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { appendMention, matchingPeople, taggedParts, typedMention, withMention } from '../src/client/mentions.js';
import { mentionKey, mentionPlaces, pickMentions } from '../src/engine/index.js';

// The names each "@" of `text` may be, the longest first.
const names = (text) => mentionPlaces(text).map((place) => place.names.map((name) => name.written));
// The characters `text` tags among those named in `known`, as written.
const tags = (text, known) =>
  pickMentions(mentionPlaces(text), new Map(known.map((name) => [mentionKey(name), { name }]))).map(({ character, written }) => [character.name, written]);

describe('where a name may follow "@" (engine)', () => {
  test('a name ends at a space, a hyphen, an apostrophe or a sign that is no letter', () => {
    assert.deepEqual(names('Hej @Ola!'), [['Ola']]);
    assert.deepEqual(names('@Ola, @Ewa.'), [['Ola'], ['Ewa']]);
    assert.deepEqual(names('@Anna Maria idzie'), [['Anna Maria idzie', 'Anna Maria', 'Anna']]);
    assert.deepEqual(names('@Anna-Maria?'), [['Anna-Maria', 'Anna']]);
    assert.deepEqual(names("@Ola's"), [["Ola's", 'Ola']]);
    assert.deepEqual(names('@Justi_725 hej'), [['Justi_725 hej', 'Justi_725']]);
    // Polish letters are letters.
    assert.deepEqual(names('@Łucja Żaneta'), [['Łucja Żaneta', 'Łucja']]);
  });

  test('no name inside a word, before a sign that starts none, or shorter than two signs or longer than twenty', () => {
    assert.deepEqual(names('ala@ola.pl'), []);
    assert.deepEqual(names('@ Ola'), []);
    assert.deepEqual(names('@1Ola'), []);
    assert.deepEqual(names('@-Ola'), []);
    assert.deepEqual(names('@O hej'), [['O hej']]);
    assert.deepEqual(names('@O'), []);
    // Twenty signs at most: "Abcdefghijklmnopqrst" ends the 21st letter's word.
    assert.deepEqual(names(`@${'a'.repeat(20)}`), [['a'.repeat(20)]]);
    assert.deepEqual(names(`@${'a'.repeat(21)}`), []);
    assert.deepEqual(names(`@${'a'.repeat(19)} b`), [[`${'a'.repeat(19)}`]]);
    // "@@Ola": the second "@" starts the name.
    assert.deepEqual(names('@@Ola'), [['Ola']]);
  });

  test('the key is the name in lower case, Polish capitals too', () => {
    assert.equal(mentionKey('ŁUCJA Żaneta'), 'łucja żaneta');
    assert.deepEqual(
      mentionPlaces('@ŁUCJA').map((place) => place.names.map((name) => name.key)),
      [['łucja']],
    );
  });

  test('the longest name a character has wins, each character once, in order', () => {
    assert.deepEqual(tags('@Anna Maria, hej', ['Anna', 'Anna Maria']), [['Anna Maria', 'Anna Maria']]);
    assert.deepEqual(tags('@Anna Mar', ['Anna', 'Anna Maria']), [['Anna', 'Anna']]);
    // Whatever the letter case, as written.
    assert.deepEqual(tags('@anna maria i @EWA', ['Ewa', 'Anna Maria']), [
      ['Anna Maria', 'anna maria'],
      ['Ewa', 'EWA'],
    ]);
    assert.deepEqual(tags('@Ola @Ola @ola', ['Ola']), [['Ola', 'Ola']]);
    // A name running into more letters is not this one.
    assert.deepEqual(tags('@Alana', ['Ala']), []);
    assert.deepEqual(tags('@Nikt', ['Ola']), []);
  });
});

describe('tagging on the page (src/client/mentions.js)', () => {
  test('the name being typed after "@", up to the caret', () => {
    assert.deepEqual(typedMention('Hej @Ol'), { start: 4, query: 'Ol' });
    assert.deepEqual(typedMention('@'), { start: 0, query: '' });
    assert.deepEqual(typedMention('@Anna Ma'), { start: 0, query: 'Anna Ma' });
    assert.deepEqual(typedMention('@Ola i @Ew', 4), { start: 0, query: 'Ola' });
    assert.equal(typedMention('ala@ol'), null);
    assert.equal(typedMention('@ Ola'), null);
    assert.equal(typedMention('@Ola!'), null);
    assert.equal(typedMention('@Ola  i'), null);
    assert.equal(typedMention(`@${'a'.repeat(21)}`), null);
    assert.equal(typedMention('bez znaku'), null);
  });

  test('the characters whose names start so, without case and accents, each once, at most a few', () => {
    const people = [{ name: 'Łucja' }, { name: 'Ola' }, { name: 'Olgierd' }, { name: 'ola' }, { name: 'Lucyna' }];
    assert.deepEqual(matchingPeople('ol', people, 5).map((person) => person.name), ['Ola', 'Olgierd']);
    assert.deepEqual(matchingPeople('luc', people, 5).map((person) => person.name), ['Łucja', 'Lucyna']);
    assert.deepEqual(matchingPeople('', people, 2).map((person) => person.name), ['Łucja', 'Ola']);
  });

  test('a picked name goes in whole, with a space after it, and "Oznacz" puts it at the end', () => {
    assert.deepEqual(withMention('Hej @Ol', 4, 7, 'Ola'), { value: 'Hej @Ola ', caret: 9 });
    assert.deepEqual(withMention('@Anna M idziemy', 0, 7, 'Anna Maria'), { value: '@Anna Maria idziemy', caret: 12 });
    // The rest of a word at the caret goes with it.
    assert.deepEqual(withMention('@Olg hej', 0, 3, 'Olgierd'), { value: '@Olgierd hej', caret: 9 });
    assert.equal(appendMention('', 'Ola'), '@Ola ');
    assert.equal(appendMention('Idziemy?  ', 'Anna Maria'), 'Idziemy? @Anna Maria ');
  });

  test('a message shows its tags where "@" and the whole name stand', () => {
    assert.deepEqual(taggedParts('Hej @Ola i @anna maria!', ['Ola', 'Anna Maria']), ['Hej ', { tag: '@Ola' }, ' i ', { tag: '@anna maria' }, '!']);
    assert.deepEqual(taggedParts('@Olala i ala@Ola', ['Ola']), ['@Olala i ala@Ola']);
    assert.deepEqual(taggedParts('Bez oznaczeń', []), ['Bez oznaczeń']);
  });
});
