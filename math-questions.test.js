const test = require('node:test');
const assert = require('node:assert/strict');
const { createQuestion, LEVEL_THRESHOLDS } = require('./math-questions');
const { handleMathGame, levelFor } = require('./math-game-api');

function question(yards, xp, variant, value = 0) {
  let first = true;
  return createQuestion(yards, xp, () => {
    if (first) { first = false; return variant / 4; }
    return value;
  });
}

test('all 16 templates calculate correct answers at every student level', () => {
  for (const [level, xp] of LEVEL_THRESHOLDS.entries()) {
    const expected = {
      5: [146+135*level, 27+15*level, 75+40*level, 75+40*level],
      10: [55+45*level, 25+15*level, 73+51*level, 16+12*level],
      15: [13+7*level, 31+16*level, 22+12*level, 52-6*level],
      20: [Math.ceil((107+32*level)/20), 68+8*level, Math.floor((20+5*level)/6), Math.ceil((34+18*level)/(24+8*level))]
    };
    for (const yards of [5, 10, 15, 20]) {
      for (let variant = 0; variant < 4; variant++) {
        const q = question(yards, xp, variant);
        assert.equal(q.answer, expected[yards][variant], `${yards} yards, level ${level}, variant ${variant}`);
        assert.equal(q.xp, yards);
        assert.equal(q.yards, yards);
        assert.ok(q.explanation.includes(String(q.answer)));
      }
    }
  }
});

test('question answers remain finite nonnegative whole numbers across parameter ranges', () => {
  for (const xp of [-10, ...LEVEL_THRESHOLDS, 999999]) {
    for (const yards of [5, 10, 15, 20]) {
      for (let variant = 0; variant < 4; variant++) {
        for (const value of [0, 0.25, 0.5, 0.75, 0.999999]) {
          const q = question(yards, xp, variant, value);
          assert.ok(Number.isSafeInteger(q.answer) && q.answer >= 0, JSON.stringify(q));
        }
      }
    }
  }
});

test('levels change at the same XP thresholds as profiles, and invalid play defaults to ten yards', () => {
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    const xp = LEVEL_THRESHOLDS[i];
    assert.notEqual(levelFor(xp).name, levelFor(xp-1).name);
    assert.notEqual(question(5, xp, 0).question, question(5, xp-1, 0).question);
  }
  assert.equal(createQuestion(999).yards, 10);
});

test('challenge uses stored XP, ignores client level, and never discloses the answer', async () => {
  for (const storedXp of [undefined, 7500]) {
    let inserted, response;
    await handleMathGame({
      pool: {query: async (sql, params) => {
        if (sql.startsWith('SELECT total_xp')) {
          assert.deepEqual(params, [42]);
          return {rows: storedXp === undefined ? [] : [{total_xp:storedXp}]};
        }
        if (sql.startsWith('INSERT INTO math_challenges')) inserted = params;
        return {rows:[]};
      }},
      req:{method:'POST'}, res:{}, path:'/api/math-game/challenge', user:{id:42},
      readJson:async () => ({yards:5, totalXp:999999, level:99}),
      sendJson:(_res, status, body) => {assert.equal(status, 201); response = body.challenge;}
    });
    assert.ok(inserted);
    assert.equal(response.question, inserted[2]);
    assert.equal(response.answer, undefined);
    assert.equal(response.explanation, undefined);
    const possible = Array.from({length:4}, (_, variant) => question(5, storedXp || 0, variant));
    const numbers = response.question.match(/\d+/g).map(Number);
    assert.ok(numbers.some(n => n >= (storedXp ? 625 : 125)));
    assert.equal(possible[0].xp, response.xp);
  }
});
