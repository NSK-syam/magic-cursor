const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');

// Mirrors a Microsoft Forms question: label text runs together with the answer-type text, and the input is labelled by it.
function formWith(questions) {
  const body = questions.map((text, i) => `<div data-automation-id="questionItem"><div>
    <div id="QuestionId_${i}">${text}Single line text.</div><span id="QuestionInfo_${i}">Single line text.</span>
    <span><input type="text" aria-labelledby="QuestionId_${i} QuestionInfo_${i}"></span></div></div>`).join('');
  const dom = new JSDOM(`<form>${body}</form>`, { runScripts: 'outside-only' });
  for (const file of ['answers.js', 'matcher.js']) dom.window.eval(fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'));
  return dom.window;
}
const profile = { firstName: 'Alex', lastName: 'Morgan', email: 'alex@example.com' };

test('Microsoft Forms text questions fill from the profile and saved custom fields', () => {
  const window = formWith(['1.First name', '2.Last name', '3.University', '4.Email address Please enter the same email you used.']);
  const [first, last, university, email] = window.document.querySelectorAll('input');
  assert.equal(window.MagicMatcher.match(first, profile, []).value, 'Alex');
  assert.equal(window.MagicMatcher.match(last, profile, []).value, 'Morgan');
  assert.equal(window.MagicMatcher.match(email, profile, []).value, 'alex@example.com');
  assert.equal(window.MagicMatcher.match(university, profile, []), null);
  const custom = [{ id: 'u', name: 'University', value: 'University of North Texas' }];
  assert.equal(window.MagicMatcher.match(university, profile, custom).value, 'University of North Texas');
});
