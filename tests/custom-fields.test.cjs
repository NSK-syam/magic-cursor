const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const matcher = require('../src/matcher.js');
const fields = [{ id: 'school', name: 'University', value: 'University of North Texas', aliases: ['College', 'School name'] }];
const input = html => new JSDOM(html).window.document.querySelector('input,textarea');
test('custom names and aliases match labels, accessibility labels and unlabelled field hints', () => {
  for (const html of ['<label>UNIVERSITY *<input></label>', '<label>3. University *<input placeholder="Enter your answer"></label>', '<input aria-label="Question 3) University (required)">', '<input aria-label="College (required)">', '<label>School name:<textarea></textarea></label>', '<input name="university">', '<input placeholder="University">', '<b id="q">University</b><input aria-labelledby="q">']) {
    assert.equal(matcher.match(input(html), {}, fields)?.value, fields[0].value, html);
  }
  assert.equal(matcher.match(input('<label>Référence<input></label>'), {}, [{ id: 'ref', name: 'Référence', value: 'A reference' }]).value, 'A reference');
});
test('custom matching requires exact names and respects meaningful labels and ambiguity', () => {
  assert.equal(matcher.match(input('<label>University graduation year<input></label>'), {}, fields), null);
  assert.equal(matcher.match(input('<label>Department<input name="university"></label>'), {}, fields), null);
  assert.equal(matcher.match(input('<input aria-label="College">'), {}, [...fields, { id: 'other', name: 'College', value: 'Other school' }]), null);
});
test('custom values cannot fill protected or disabled fields', () => {
  for (const html of ['<label>University<input type="password"></label>', '<input aria-label="University" disabled>', '<label>University<input readonly></label>', '<input aria-label="Bank account number">']) assert.equal(matcher.match(input(html), {}, [...fields, { name: 'Bank account number', value: '123' }]), null, html);
});
test('a saved answer to an exact question can be matched without AI', () => {
  assert.equal(matcher.match(input('<label>Describe your Python experience<textarea></textarea></label>'), {}, [{ id: 'python', name: 'Describe your Python experience', value: 'I built Python services.' }]).value, 'I built Python services.');
});
