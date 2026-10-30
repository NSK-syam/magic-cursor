const { test } = require('node:test');
const assert = require('node:assert/strict');
const answers = require('../src/answers.js');
const { JSDOM } = require('jsdom');
test('questions preserve the original wording and support accessible labels', () => {
  const doc = new JSDOM('<div id="q">Describe your Python experience?</div><textarea aria-labelledby="q"></textarea>').window.document;
  assert.equal(answers.question(doc.querySelector('textarea')), 'Describe your Python experience?');
});
test('reads an unassociated question above a field rather than its generic placeholder', () => {
  for (const markup of [
    '<div><p>Describe a manual process from a previous role.</p><textarea placeholder="Type here..."></textarea></div>',
    '<div><div>Share a link to something you built and describe your role.</div><div><textarea placeholder="Type here..."></textarea></div></div>',
    '<fieldset><legend>Describe your Python experience</legend><textarea></textarea></fieldset>'
  ]) {
    const dom = new JSDOM(markup);
    assert.match(answers.question(dom.window.document.querySelector('textarea')), /Describe|Share/);
    dom.window.close();
  }
});
test('does not borrow another field question or hidden text', () => {
  for (const markup of [
    '<div><label>Previous question<textarea></textarea></label></div><textarea placeholder="Type here..." id="target"></textarea>',
    '<p hidden>Hidden instructions</p><textarea placeholder="Type here..." id="target"></textarea>',
    '<label for="other">Other field</label><textarea placeholder="Type here..." id="target"></textarea><input id="other">'
  ]) {
    const dom = new JSDOM(markup);
    assert.equal(answers.question(dom.window.document.querySelector('#target')), ''); dom.window.close();
  }
});
test('uses a form question title over generic textbox labels through deep wrappers', () => {
  const dom = new JSDOM('<div data-automation-id="questionItem"><div data-automation-id="questionTitle">3. University <span aria-hidden="true">*</span></div><div><div><div><div><input aria-label="Enter your answer" placeholder="Enter your answer"></div></div></div></div><p role="alert">This question is required.</p></div>');
  assert.equal(answers.question(dom.window.document.querySelector('input')), '3. University'); dom.window.close();
});
test('facts and preferences cannot be generated from a resume', () => {
  for (const question of ['Are you legally authorized to work?', 'Will you require sponsorship?', 'When are you available?', 'Are you willing to relocate?', 'What is your current company?', 'Do you certify this information?']) {
    assert.equal(answers.needsFact(question), true, question);
    assert.equal(answers.excerpt(question, 'I built Python applications.').answer, '');
  }
});
test('local drafts quote matching resume evidence and abstain when missing', () => {
  const resume = 'Built Python services with FastAPI and Redis for production applications.\nTrained computer vision models using PyTorch.';
  assert.equal(answers.excerpt('Describe your Python experience', resume).answer, 'Built Python services with FastAPI and Redis for production applications.');
  assert.equal(answers.excerpt('Describe your Rust experience', resume).answer, '');
  assert.equal(answers.excerpt('Describe your Python experience', '').answer, '');
});
test('AI results require exact evidence and expose missing facts without an answer', () => {
  const resume = 'Built Python services.';
  assert.throws(() => answers.validateDraft({ answer: 'I built Rust systems.', evidence: ['Built Rust systems.'], missingFacts: [] }, resume));
  assert.throws(() => answers.validateDraft({ answer: 'Something', evidence: [], missingFacts: [] }, resume));
  assert.equal(answers.validateDraft({ answer: 'I built Python services.', evidence: [resume], missingFacts: [] }, resume).answer, 'I built Python services.');
  assert.equal(answers.validateDraft({ answer: 'A guess', evidence: [], missingFacts: ['Start date'] }, resume).answer, '');
});
test('a supported draft is preserved when Claude also lists unanswered details', () => {
  const resume = 'Built Python services using FastAPI and Redis.';
  const result = answers.validateDraft({ answer: 'I built Python services using FastAPI and Redis.', evidence: [resume], missingFacts: ['Exact Python-specific years of experience'] }, resume);
  assert.equal(result.answer, 'I built Python services using FastAPI and Redis.');
  assert.deepEqual(result.missingFacts, ['Exact Python-specific years of experience']);
  assert.throws(() => answers.validateDraft({ answer: 'Invented experience', evidence: ['A fabricated quote'], missingFacts: ['Years'] }, resume), /verifiable/);
});

test('evidence quotes that span line breaks or sentences match the resume', () => {
  const source = 'Built Python services using FastAPI.\nReduced API latency by 40% for the payments team.';
  const draft = { answer: 'I built Python services and reduced API latency by 40%.', evidence: ['Built Python services using FastAPI. Reduced API latency by 40% for the payments team.'], missingFacts: [] };
  assert.equal(answers.validateDraft(draft, source).answer, draft.answer);
  assert.throws(() => answers.validateDraft({ ...draft, evidence: ['Built Rust services.'] }, source), /verifiable/);
});

test('professional motivation can be drafted while personal declarations remain protected', () => {
  for (const question of ['Why are you interested in this role at Trace?', 'Why do you want to join us?', 'What motivates you about this role?']) {
    assert.equal(answers.needsFact(question), false); assert.equal(answers.isMotivation(question), true);
  }
  assert.equal(answers.needsFact('Why do you require visa sponsorship?'), true);
});
