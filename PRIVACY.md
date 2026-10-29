# Magic Cursor Privacy Policy

Effective October 29, 2026.

Magic Cursor helps users fill application forms and draft answers from their resume.

## Information handled
The extension stores the profile details, custom fields, resume text and approved answers you choose to save on your device. It reads labels of form fields you interact with to find matching details or prepare a draft. Approved answer history includes the website origin and the question you chose to remember. It does not collect a browsing history or include analytics or advertising trackers.

PDF resumes are parsed locally. Extracted text is saved; the original PDF file is not retained by the extension. No resume is included in the software distribution.

## AI providers
In hover mode, holding near an unfamiliar field can send that question and relevant saved resume passages to the AI provider you selected: Anthropic (Claude) or OpenAI. Clicking Draft also sends this information. Your API key authenticates these requests. API charges and the provider's own data handling terms apply. Basic profile matching and local excerpts do not require an AI provider.

The extension does not send your entire application, other form entries, or approved answer library to an AI provider. Generated drafts require your review before filling. It does not submit applications.

## Storage and API keys
Remembered extension API keys are stored in local extension storage, restricted to trusted extension contexts, and are not synced through Chrome Sync. Session-only keys disappear after a browser restart or extension reload. Device storage is not encrypted by this application. Form-page content scripts cannot read the credential store directly.

The optional localhost practice server stores remembered API keys in a file restricted to your OS user account, outside the project, and uses session memory for keys you do not choose to remember. The local app and extension have separate storage.

## Controls and deletion
You can edit or clear your profile and resume, remove custom fields and approved answers, and disconnect a provider to remove its stored key. Uninstalling the extension removes its local extension storage. Disconnect providers in the localhost app to remove keys saved by that separate app.

The developer does not operate a server that collects your profile or resume, sell user data, or use it for advertising. Data is used only for the user-facing autofill and drafting features described above.

## Contact
For privacy questions or deletion assistance, open an issue without including personal information at https://github.com/NSK-syam/magic-cursor/issues.
