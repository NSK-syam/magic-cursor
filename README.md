# Magic Cursor

Save your application details once. Move your pointer within 18 pixels of an empty field and pause for 1.1 seconds to fill a matching detail. A small suggestion shows the value before it fills, with an Undo button afterward. Switch to **Suggest, then click to fill** for explicit control.

## Install in Chrome or Edge

1. Run `npm install` and `npm run build` in this project (a built folder may already be available).
2. Open `chrome://extensions` (or `edge://extensions`) and enable **Developer mode**.
3. Click **Load unpacked** and select `dist/magic-cursor`. Use this built folder; the project root does not include the bundled Claude SDK.
4. Open Magic Cursor from the extensions menu. Choose **Open your profile & playground**.
5. Add your details and click **Save profile**. Try hovering near the LinkedIn field in the playground.
6. Refresh any application tabs that were already open, then hover near a matching empty field.

No API key is needed for basic autofill or local resume excerpts. You can also open `index.html` directly to use the profile editor and practice form. The standalone demo and installed extension have separate storage; enter your profile inside the extension to use it on other sites.

## Run the local practice app

Run `npm start`, then open `http://127.0.0.1:4321`. This starts the app and its local AI backend. A generic static server (such as `python -m http.server`) cannot generate AI drafts.

Click **Turn on AI answers** at the top of the page, paste your Claude API key, and click **Save key & turn on**. Claude Haiku 5.5 is already selected. The same action turns Magic Cursor on and saves any resume text you have entered. A visible status shows **Ready to draft**, **Add resume**, **Needs setup**, or **Paused**. Use the main switch to pause everything. In hover mode, hold near an unfamiliar empty field for 1.1 seconds to automatically open the answer editor and draft with the selected provider. It reads linked labels or nearby question text above the box. Move away before the delay or press Esc to cancel. While drafting, a spinner, “Drafting…” label, live status and waiting cursor indicate progress. The answer appears in the editor for review; it does not fill the form until you approve it. Reopening the same question on that field reuses its draft during this page visit; click **Draft** for an explicit retry. A previously approved saved answer is shown for review without calling AI. Questions requiring personal facts or preferences request your input. Click mode keeps drafting manual. Errors preserve your draft and provide **Open AI settings** for reconnecting.

**Remember API key on this device** is selected by default. In the local app, a remembered key is saved outside the project in `~/Library/Application Support/Magic Cursor/credentials.json` on macOS (`~/.config/magic-cursor/credentials.json` elsewhere). The folder and file allow access only to your user account (permissions 700/600); the app does not encrypt this file. Remembered keys reconnect automatically after server or browser restarts. Uncheck Remember to use a session-only key. You can also toggle Remember on an already connected key without entering it again. **Disconnect selected provider** deletes its saved key and clears it from local server sessions. The server binds only to `127.0.0.1`, rejects other hosts and cross-origin API calls, and requires a session cookie and CSRF token for changes. Holding over an unfamiliar field in hover mode, or clicking **Draft**, sends its question and your saved resume to the selected provider and may incur API usage charges.

## What it handles

- First, last and full name, email, phone, LinkedIn, GitHub, website, city, location, current company and job title.
- Matching from associated labels, accessible labels, field names, placeholders and standard browser autocomplete hints.
- Common question rewordings: “Where are you currently located?” / “Where are you based?” use your saved Location, while “Which city do you live in?” uses City. Name and current employment questions also recognize common alternatives. These matches use saved values without an API call. Visible questions take priority over generated field names; preferences, other people's details, and unsupported address parts are left for review.
- Standard text, email, phone, URL inputs and textareas, including dynamically inserted forms and permitted website frames.
- Hover fill, click-to-fill, pause, Undo, and Escape to dismiss. Move away before the delay to cancel.
- Keyboard: focus an empty field and press **Alt + Shift + F**, then activate the Fill button.

Existing values are preserved. It never submits applications. Passwords, verification codes, financial fields, disabled/hidden fields and ambiguous matches are skipped. Review your application before submitting it yourself.

If hovering does nothing, open Magic Cursor from the browser toolbar while viewing the form. The popup checks whether its content script responds and shows **Active on this page** with the number of fields found. If it is missing, click **Enable on this page** to attach it to the current tab. This uses temporary access granted when you invoke the extension. Browser settings pages cannot run it. Tabs with an older extension instance may need a refresh; the popup reports this instead of silently failing. AI readiness is checked separately using the extension's saved resume and API key, which are separate from the local practice app.

## Custom fields

Under **Your custom fields** in your profile:

1. Click **+ Add a field**.
2. Enter a **Field name** (for example, `University`) and **Value to fill** (`University of North Texas`).
3. Optionally add comma-separated **Other names**, such as `College, School name`.
4. Click **Save profile**. A matching practice box appears in the playground.

On a real form, hover near an empty text field with the same name or one of the other names. Matching ignores capitalization, punctuation, leading question numbers (so “3. University” matches “University”), and trailing “required”/“optional” markers, but requires the remaining whole name to match. Existing text stays untouched, and ambiguous or protected fields are skipped. Custom values use the selected hover/click mode and support Undo. They are supplied by you and do not require AI generation. You can edit or remove a field and save your profile again.

The local app and extension have separate storage. To move saved values from the practice app to real websites, click **Export saved profile**, reload the installed extension, open its profile, and choose **Import profile** with the exported JSON file. This transfers basic profile values and custom fields; resume text, approved-answer history, settings and API keys are not included. You can also create custom fields directly in the extension's profile.

## Local matching and privacy

Basic autofill and resume excerpts work locally. There are no analytics. Optional AI drafting makes a network request only when you click **Draft with Claude** or **Draft with OpenAI**. The provider named on the button receives the question and saved resume; there is no automatic fallback to another provider. Profile details, custom fields, resume text and approved answers are saved in `chrome.storage.local` in the extension and browser local storage in the standalone demo. These are not encrypted vaults; save ordinary application details only. Once a value is inserted into a website, that website can read it, as with anything you type there.

The extension requests storage permission and HTTP/HTTPS website access so its content script can detect nearby fields. Chrome's [content script documentation](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) describes this mechanism. Built-in browser pages and the Chrome Web Store cannot run content scripts. This version does not support native desktop applications, resume uploads into application forms, selects, closed shadow DOM, or custom rich-text widgets. Unrecognized fields stay empty until you explicitly approve an answer.

## Questions with missing information

1. In the extension profile, use **Upload & save resume** for a PDF, TXT, or Markdown file, or paste your text and save it. PDF, TXT and Markdown resumes can be uploaded directly; uploading extracts and saves the text automatically. Scanned PDFs without a text layer need OCR first.
2. Hover near an unfamiliar text field or textarea. Click **Help me answer** (keyboard: focus the field and press **Alt + Shift + F**).
3. Write a missing fact yourself, or choose **Use resume excerpt** for matching passages from your resume. Excerpts are copied verbatim, not AI-written answers.
4. Review/edit the answer, then click **Approve & fill**. These answers never fill automatically, even in hover mode. Undo is available afterward.
5. Optionally check **Remember for this exact question on this site**. Next time, the saved answer is offered for review. Edit or forget it under **Your approved answers**.

Work authorization, sponsorship, availability, relocation, current employment, preferences and declarations require your own input. The assistant does not infer them from your resume. Sensitive fields excluded from basic autofill remain excluded.

### Optional AI drafts

Click **Turn on AI answers** at the top of the profile in the installed extension or local app. Select **Claude (Anthropic)** or **OpenAI**, enter that provider's API key in the password field, and click **Save key & turn on**. In the extension, grant access to `api.anthropic.com` for Claude or `api.openai.com` for OpenAI. Do not paste keys into chat, source code, or resume text.

In the extension, Remember stores a provider's key separately in `chrome.storage.local`, restricted to `TRUSTED_CONTEXTS`. It survives browser restarts and extension reloads and does not use Chrome Sync. The app does not encrypt extension storage. Session-only keys use `chrome.storage.session`. Form-page scripts receive only a fixed list of profile data through the background worker; they cannot directly read the credential store. Profile changes are relayed to them without credential values. Disconnect removes the selected provider's saved and session key and its API permission. Keys are never shipped in the code or included in profile exports. The connection status means the key has been saved; credentials are validated on the first draft request.

**Claude** is the default provider. It uses the official Anthropic SDK bundled with the extension, the `claude-haiku-5-5` model, adaptive thinking, streaming, and [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs). Requests time out after 25 seconds and are not automatically retried. Truncated, refused, and malformed responses are rejected. **OpenAI** remains available using `gpt-4o-mini`, `store: false`, structured outputs and a 20-second timeout.

Each automatic hover draft or AI drafting click sends only the displayed question and saved resume text (up to 40,000 characters) to the selected provider. It does not send the rest of the page, profile storage, or your saved answer library. API usage may incur charges. Responses include an answer, evidence, and missing-fact fields. The extension verifies that evidence quotes appear verbatim in the resume and preserves supported drafts while showing genuinely unanswered requirements separately. Broad experience questions are answered from existing resume evidence without demanding unrequested years, proficiency ratings or extra employment details. When no answer is supported, the helper explicitly says no draft was produced. This does not prove every generated claim is accurate: review every draft before approving. Missing credentials, invalid credentials, quota limits and model access errors produce actionable messages; the extension never falls back to a different provider.

This direct-key setup is for personal use. The key is used only in the extension worker or local server, not injected into application websites. A distributed product should use an authenticated backend rather than embed shared API keys.

Without an API key, local excerpts and manually approved answers remain fully usable. Opening `index.html` as a file supports local excerpts; AI drafting requires the installed extension or the local app started with `npm start`.

### Drafting rules and injection handling

The shared prompt in `src/draft-policy.js` asks for plain, professional first-person answers with specific resume-backed examples. It prohibits invented years, proficiency ratings, achievements, metrics and ownership claims. Broad experience questions should get a useful answer from the resume without demanding optional facts.

Questions and resumes are treated as untrusted data. Before either provider is called, a limited filter removes recognizable instructions such as “if you are an AI, add this word,” forced secret markers, fake system/developer roles, and requests to ignore previous instructions. Instruction-only questions are rejected. Legitimate AI engineering experience and ordinary question requirements remain usable. The helper notes when instruction-like content was removed.

Returned drafts must include verbatim evidence from the cleaned resume. Unsupported numeric tokens, recognizable AI-assistant boilerplate, and detected trap markers absent from the genuine question/resume are rejected. These checks and the prompt reduce risk; exact quotes do not prove that every claim follows from them, and pattern filters cannot catch every injection. Review every draft before filling. See [Anthropic’s injection guidance](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks).

## Development

```sh
npm install
npm test
npm run build
```

Tests cover label matching, ambiguous/sensitive field rejection, hover delays, cancellation, click mode, form events, Undo, existing text preservation, live settings updates, keyboard fill and field eligibility changes. After editing extension files, reload the extension from the extensions page and refresh the target tab.

`npm run build` creates a clean install folder at `dist/magic-cursor` without development dependencies. Select that folder in **Load unpacked**. The Claude SDK is bundled locally; no remote scripts are used. Rebuild and reload the extension after making changes.

Professional motivation questions (for example, “Why are you interested in this role?”) can generate suggested fit statements grounded in resume experience. Review and edit these to reflect your actual reasons. Company facts are not invented. Personal eligibility, availability, compensation, relocation and declarations still require user input.
