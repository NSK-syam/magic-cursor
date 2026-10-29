(function (root) {
  'use strict';
  const fields = [
    { key: 'firstName', label: 'First name', autocomplete: ['given-name'], patterns: [/\bfirst\s*name\b/, /\bgiven\s*name\b/, /\bforename\b/] },
    { key: 'lastName', label: 'Last name', autocomplete: ['family-name'], patterns: [/\blast\s*name\b/, /\bfamily\s*name\b/, /\bsurname\b/] },
    { key: 'fullName', label: 'Full name', autocomplete: ['name'], patterns: [/\bfull\s*name\b/, /^name$/, /\byour name\b/, /\blegal name\b/, /\bwhat (?:should|can) we call you\b/] },
    { key: 'email', label: 'Email address', autocomplete: ['email'], patterns: [/\be\s*mail\b/] },
    { key: 'phone', label: 'Phone number', autocomplete: ['tel'], patterns: [/\bphone\b/, /\bmobile\b/, /\btelephone\b/] },
    { key: 'linkedin', label: 'LinkedIn URL', autocomplete: [], patterns: [/\blinked\s*in\b/] },
    { key: 'github', label: 'GitHub URL', autocomplete: [], patterns: [/\bgit\s*hub\b/] },
    { key: 'website', label: 'Personal website', autocomplete: ['url'], patterns: [/\bportfolio\b/, /\bpersonal\s*(website|site)\b/, /\bwebsite\b/] },
    { key: 'city', label: 'City', autocomplete: ['address-level2'], patterns: [/\b(city|town|municipality)\b/] },
    { key: 'location', label: 'Location', autocomplete: [], patterns: [/\blocation\b/, /\bwhere are you (?:currently |presently |now )?(?:located|based|living|residing)\b/, /\bwhere do you (?:currently |presently |now )?(?:live|reside)\b/, /\b(?:current |place of )residence\b/, /\bhome base\b/] },
    { key: 'company', label: 'Current company', autocomplete: ['organization'], patterns: [/\b(current\s+)?company\b/, /\b(current\s+)?employer\b/, /\bwhere do you (?:currently |presently )?work\b/, /\bwho do you (?:currently )?work for\b/] },
    { key: 'jobTitle', label: 'Current job title', autocomplete: ['organization-title'], patterns: [/\b(current\s+)?job title\b/, /\bcurrent (role|title|position|occupation)\b/, /\bwhat do you do for (?:work|a living)\b/] }
  ];
  const normalize = (value) => String(value || '').normalize('NFKC').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[_\-.:/]+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
  // Microsoft Forms appends answer-type text ("Single line text.") with no space before it.
  const normalizeLabel = value => normalize(String(value || '').replace(/^\s*(?:question\s+)?\d+\s*[.)]\s*/i, '').replace(/(?:\s*(?:single|multi(?:ple)?) line text\.?)+\s*$/i, '').replace(/\s*[([]?\b(?:required|optional)\b[)\]]?\s*[:*]?\s*$/i, ''));
  function accessibleLabels(element) {
    if (root.MagicAnswers) {
      const question = root.MagicAnswers.question(element, { placeholder: false });
      if (question) return [normalizeLabel(question)];
      return [];
    }
    const doc = element.ownerDocument;
    const labelledBy = (element.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => doc.getElementById(id)?.textContent || '').join(' ');
    const labels = [element.getAttribute('aria-label'), labelledBy, ...Array.from(element.labels || []).map(label => label.textContent)].map(normalizeLabel).filter(Boolean);
    return labels;
  }
  function describe(element) {
    return [...accessibleLabels(element), element.placeholder, element.name, element.id].map(normalize).filter(Boolean);
  }
  function eligible(element) {
    if (!element || !['INPUT', 'TEXTAREA'].includes(element.tagName)) return false;
    if (element.disabled || element.readOnly || element.matches(':disabled') || element.closest('[inert], [hidden], [aria-hidden="true"]')) return false;
    if (element.tagName === 'INPUT' && !['text', 'email', 'tel', 'url'].includes(element.type)) return false;
    const clues = describe(element).join(' ');
    return !/\b(password|passcode|otp|verification|credit|card number|social security|ssn|salary|passport|bank|routing|account number|search|filter|username|login|sign in)\b/.test(clues);
  }
  function match(element, profile, customFields = []) {
    if (!eligible(element)) return null;
    const labels = accessibleLabels(element);
    const customClues = labels.length ? labels : [element.placeholder, element.name, element.id].map(normalizeLabel).filter(Boolean);
    const custom = (Array.isArray(customFields) ? customFields : []).filter(field => {
      if (!field || typeof field.name !== 'string' || typeof field.value !== 'string' || !field.value.trim()) return false;
      const names = [field.name, ...(Array.isArray(field.aliases) ? field.aliases : [])].map(normalizeLabel).filter(Boolean);
      return customClues.some(clue => names.includes(clue));
    });
    if (custom.length > 1) return null;
    if (custom.length === 1) return { key: 'custom:' + (custom[0].id || normalizeLabel(custom[0].name)), label: custom[0].name, value: custom[0].value.trim() };
    // Resolve the question the applicant sees. Generated IDs and placeholders
    // frequently describe a different field and must not override that question.
    const clues = labels.length ? labels : element.placeholder ? [normalizeLabel(element.placeholder)] : [element.name, element.id].map(normalize).filter(Boolean);
    if (clues.some(clue => /\b(describe|explain|experience|sentence|paragraph|outline|why|tell us|tell me|how did|how do|how have|preferred|desired|previous|former|birth|birthplace|willing|relocate|relocation|would|want|emergency|reference|referee|recruiter|hiring)\b/.test(clue))) return null;
    if (clues.some(clue => /\b(work|office|job|company|employer)\s+(location|city|address)\b/.test(clue)
      || /\b(company|employer|office)\b.*\b(located|based|location|city)\b/.test(clue))) return null;
    let candidates = fields.filter(field => clues.some(clue => field.patterns.some(pattern => pattern.test(clue))));
    // Narrow address parts are not interchangeable with a saved broad location.
    // Apply this only to address matches: phone labels may request a country code.
    if (candidates.some(field => ['city', 'location'].includes(field.key))
      && clues.some(clue => /\b(state|province|country|county|zip|postal|street|address line)\b/.test(clue))) return null;
    if (candidates.length > 1) return null;
    if (!candidates.length && !labels.length && !element.placeholder) {
      const hint = (element.autocomplete || '').split(/\s+/).pop();
      candidates = fields.filter(field => field.autocomplete.includes(hint));
    }
    if (candidates.length !== 1) return null;
    const field = candidates[0];
    const value = field.key === 'fullName' ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') : profile[field.key];
    return typeof value === 'string' && value.trim() ? { key: field.key, label: field.label, value: value.trim() } : null;
  }
  function validateCustomFields(items) {
    if (!Array.isArray(items) || items.length > 50) throw new Error('You can save up to 50 custom fields.');
    const names = new Set(), ids = new Set();
    return items.map((item, index) => {
      if (!item || typeof item.name !== 'string' || typeof item.value !== 'string') throw new Error('Give every custom field a name and a value before saving.');
      const name = item.name.trim(), value = item.value.trim();
      if (!name || !value || !normalizeLabel(name)) throw new Error('Give every custom field a name and a value before saving.');
      if (name.length > 120 || value.length > 6000) throw new Error('Custom field names can have 120 characters and values can have 6,000.');
      if (item.aliases !== undefined && (!Array.isArray(item.aliases) || item.aliases.some(alias => typeof alias !== 'string'))) throw new Error('Other field names must be a list of names.');
      const aliases = [...new Set((item.aliases || []).map(alias => alias.trim()).filter(Boolean))];
      if (aliases.length > 10 || aliases.some(alias => alias.length > 120)) throw new Error('Use up to 10 other names, each under 120 characters.');
      for (const label of new Set([name, ...aliases].map(normalizeLabel).filter(Boolean))) {
        if (names.has(label)) throw new Error(`Two custom fields match “${label}”. Use different names or remove the duplicate.`);
        names.add(label);
      }
      const id = typeof item.id === 'string' && item.id.length <= 120 && item.id ? item.id : `field-${Date.now().toString(36)}-${index}`;
      if (ids.has(id)) throw new Error('Custom fields must have different IDs.');
      ids.add(id); return { id, name, value, aliases };
    });
  }
  const api = { fields, normalize, normalizeLabel, describe, eligible, match, validateCustomFields };
  root.MagicMatcher = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
