(function (root) {
  'use strict';
  const normalize = text => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  function question(element, { placeholder = true } = {}) {
    const tidy = text => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
    const generic = text => !text || /^(?:(?:type|write|enter)(?: your)?(?: answer| response| text)?(?: here)?|your (?:answer|response)|(?:single|multi|multiple) line text|long answer text|this question is required|required|optional)[\s.…*]*$/i.test(text);
    const textOf = node => {
      if (!node) return '';
      const copy = node.cloneNode(true);
      copy.querySelectorAll('input,textarea,select,button,[hidden],[aria-hidden="true"],[role="alert"]').forEach(child => child.remove());
      return tidy(copy.textContent);
    };
    const labels = (element.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => textOf(element.ownerDocument.getElementById(id))).join(' ').trim();
    const explicit = [tidy(element.getAttribute('aria-label')), labels, ...Array.from(element.labels || []).map(textOf)].find(text => !generic(text));
    if (explicit) return explicit;
    const group = element.closest('[data-automation-id="questionItem"], [role="listitem"], [role="group"]');
    if (group && group.querySelectorAll('input:not([type="hidden"]),textarea,select').length === 1) {
      const title = group.querySelector('[data-automation-id="questionTitle"], [role="heading"], legend');
      const text = textOf(title);
      if (!generic(text)) return text;
    }
    // Many application builders render a question followed by a wrapper around
    // the input, without linking the two. Search only immediately preceding
    // siblings through a few wrappers; never take text from another form field.
    for (let node = element, depth = 0; node && depth < 4 && !node.matches('form,body,html'); node = node.parentElement, depth++) {
      if (node !== element && node.querySelectorAll('input,textarea,select').length !== 1) break;
      const before = node.previousElementSibling;
      if (!before) continue;
      if (before.matches('input,textarea,select,button,script,style') || before.querySelector('input,textarea,select,button')) break;
      if (before.matches('label[for]') && before.control !== element) break;
      if (before.closest('[hidden],[aria-hidden="true"], [inert]')) break;
      const css = element.ownerDocument.defaultView?.getComputedStyle(before);
      if (css?.display === 'none' || css?.visibility === 'hidden') break;
      const text = textOf(before);
      if (!generic(text)) return text;
    }
    const fallback = placeholder ? tidy(element.placeholder) : '';
    return generic(fallback) ? '' : fallback;
  }
  function isMotivation(text) { return /\b(why|interest\w*|motiv\w*)\b/i.test(text); }
  function needsFact(text) {
    return /\b(authorized|authorised|authorization|authorisation|sponsor\w*|visa|citizenship|citizen|work permit|eligible to work|legally|relocat\w*|willing|availability|available|start date|notice period|salary|compensation|pay expectation|current (company|employer|role|title)|currently employed|disability|disabled|veteran|gender|pronouns|ethnicity|race|criminal|convict\w*|date of birth|age|consent|agree|certify|attest|prefer\w*)\b/i.test(text);
  }
  function find(answers, text, origin) {
    return (Array.isArray(answers) ? answers : []).find(item => item.origin === origin && item.questionKey === normalize(text));
  }
  function excerpt(text, resume) {
    if (needsFact(text)) return { answer: '', evidence: [], missingFacts: ['This needs your answer. Your resume cannot confirm your current circumstances, preferences, or declarations.'] };
    if (!resume?.trim()) return { answer: '', evidence: [], missingFacts: ['Add resume text in your profile, or write your answer below.'] };
    const stops = new Set('describe explain tell about your you the a an and or of to in with experience background skills have has how what do does please relevant briefly us can using'.split(' '));
    const terms = [...new Set(normalize(text).split(' ').filter(word => word.length > 1 && !stops.has(word)))];
    const sentences = resume.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(s => s.length > 30 && s.length < 1700);
    const ranked = sentences.map((sentence, index) => ({ sentence, index, score: terms.filter(term => normalize(sentence).split(' ').includes(term)).length })).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 2);
    if (!ranked.length) return { answer: '', evidence: [], missingFacts: ['No matching evidence in your resume. Please supply this information yourself.'] };
    const evidence = ranked.map(item => item.sentence);
    return { answer: evidence.join('\n\n'), evidence, missingFacts: [] };
  }
  // Quotes often span line breaks or double spaces in the original resume; compare words, not whitespace.
  const squash = text => String(text).replace(/\s+/g, ' ').trim();
  function validateDraft(draft, resume, { blockedMarkers = [] } = {}) {
    if (!draft || typeof draft.answer !== 'string' || draft.answer.length > 6000 || !Array.isArray(draft.evidence) || !Array.isArray(draft.missingFacts)) throw new Error('The AI returned an invalid draft. Write your answer or try again.');
    if (draft.missingFacts.some(item => typeof item !== 'string')) throw new Error('The AI returned invalid missing facts.');
    if (draft.missingFacts.length && (!draft.answer.trim() || !draft.evidence.length)) return { answer: '', evidence: [], missingFacts: draft.missingFacts.slice(0, 8) };
    if (!draft.answer.trim() || !draft.evidence.length || draft.evidence.some(quote => typeof quote !== 'string' || !squash(quote) || !squash(resume).includes(squash(quote)))) throw new Error('The draft did not include verifiable resume evidence. Please write your answer or try again.');
    if (blockedMarkers.some(marker => (' ' + normalize(draft.answer) + ' ').includes(' ' + normalize(marker) + ' '))) throw new Error('The draft included an instruction marker from the form. Please retry or write your answer.');
    const numbers = text => text.match(/\b\d+(?:[.,]\d+)*%?/g) || [];
    const supportedNumbers = new Set(numbers(resume));
    if (numbers(draft.answer).some(number => !supportedNumbers.has(number))) throw new Error('The draft included a number not stated in your resume. Please retry or write your answer.');
    if (/\b(?:as an?|i am an?)\s+(?:ai(?:\s+(?:model|assistant|system))?|(?:large\s+)?language model|llm)\b(?!\s+(?:engineer|researcher|developer|specialist))/i.test(draft.answer)) throw new Error('The draft included AI-assistant boilerplate. Please retry or write your answer.');
    return { answer: draft.answer.trim(), evidence: draft.evidence.slice(0, 6), missingFacts: draft.missingFacts.slice(0, 8) };
  }
  const api = { normalize, question, needsFact, isMotivation, find, excerpt, validateDraft };
  root.MagicAnswers = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
