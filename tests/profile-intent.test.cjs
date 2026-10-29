const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const matcher = require('../src/matcher.js');
const profile = { firstName: 'Alex Taylor', lastName: 'Morgan', city: 'Dallas', location: 'Dallas, TX', company: 'MCI', jobTitle: 'AI Engineer' };

function match(label, attributes = '', saved = profile) {
  const dom = new JSDOM(`<label>${label}<input ${attributes}></label>`);
  try { return matcher.match(dom.window.document.querySelector('input'), saved); }
  finally { dom.window.close(); }
}

test('understands equivalent questions about the saved current location', () => {
  for (const question of [
    'Where are you currently located?', 'Where are you located?', 'Where are you based?',
    'Where are you currently based?', 'Where do you live?', 'Where do you currently reside?',
    'What is your current location?', 'Current place of residence', 'Where is your home base?'
  ]) assert.equal(match(question)?.value, 'Dallas, TX', question);
});

test('distinguishes city questions from broader location questions', () => {
  for (const question of ['Which city do you live in?', 'What city are you currently located in?', 'City of residence', 'Town']) {
    assert.equal(match(question)?.key, 'city', question);
    assert.equal(match(question)?.value, 'Dallas', question);
  }
  assert.equal(match('Where are you currently located?', 'name="city" placeholder="City"')?.value, 'Dallas, TX');
  assert.equal(match('City', 'name="location"')?.value, 'Dallas');
});

test('understands common name and employment rewordings', () => {
  for (const [question, key] of [
    ['What should we call you?', 'fullName'], ['Forename', 'firstName'],
    ['Where do you currently work?', 'company'], ['Who is your current employer?', 'company'],
    ['What is your current position?', 'jobTitle'], ['What do you do for work?', 'jobTitle']
  ]) assert.equal(match(question)?.key, key, question);
});

test('does not confuse personal facts with other people, preferences, or narrower address details', () => {
  for (const question of [
    'Preferred location', 'Desired work location', 'Are you willing to relocate?',
    'Where would you like to live?', 'Previous location', 'Birth city', 'City of birth',
    'State where you are currently located', 'Country of residence', 'Postal code for your location',
    'Street address of your current location', 'Where is your current company located?',
    'Where do you want to work?', 'Previous employer', 'Desired job title',
    'Emergency contact full name', 'Reference email address',
    'Describe your experience in your current location', 'LinkedIn or website'
  ]) assert.equal(match(question), null, question);
  assert.equal(match('Country', 'name="location" autocomplete="address-level2"'), null);
  assert.equal(match('Where are you currently located?', '', { city: 'Dallas' }), null);
});

test('a recognizable hidden name cannot override an unrelated visible question', () => {
  assert.equal(match('Where would you like to live?', 'name="location"'), null);
  assert.equal(match('Department', 'name="company"'), null);
});

test('address-part safeguards preserve contact fields requesting a country code', () => {
  assert.equal(match('Phone number including country code', '', { phone: '+12025550123' })?.value, '+12025550123');
});
