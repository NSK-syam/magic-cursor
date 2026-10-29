# Chrome Web Store listing

Name: Magic Cursor — pointer autofill

Summary: Fill application fields from your saved profile and draft resume-based answers with your own AI API key.

Category: Productivity / Workflow & Planning

Single purpose: Assist the user in filling application forms with saved profile details and resume-grounded draft answers.

Description:
Save your details once, then hover near an empty application field to fill matching information. Add custom fields and alternate labels for information you reuse.

Upload a PDF, TXT, or Markdown resume. For unfamiliar questions, Magic Cursor retrieves relevant resume passages and drafts an answer using your own Claude or OpenAI API key. AI usage may incur charges. Review and approve drafts before filling them. Missing facts need your input.

Features:
- Profile matching for names, contact details, links, city and location.
- Reusable custom fields and optional saved answers scoped to a website.
- Local PDF text extraction and resume-based retrieval.
- Hover or click mode, pause, Escape to dismiss and Undo.
- Local device storage and optional remembered API keys.
- No automatic application submission.

Privacy policy: https://github.com/NSK-syam/magic-cursor/blob/main/PRIVACY.md
Support: https://github.com/NSK-syam/magic-cursor/issues

## Permission explanations
storage: Save the user's profile, resume, preferences, custom fields, approved answers and optional API credentials locally.
activeTab and scripting: Attach the helper to the current application tab when the user clicks Enable on this page.
HTTP/HTTPS content scripts: Detect text fields on application sites and display the pointer helper where the user interacts. No browsing-history collection.
Optional Anthropic/OpenAI host access: Send drafting requests to the user's chosen AI provider after the user connects it.

## Privacy declarations to review in the developer dashboard
The extension handles personally identifiable information, authentication information, website content and user-supplied form/resume data. AI drafting transmits the current question and relevant resume passages to the selected provider. Declare this accurately; do not claim that all information remains on device. There is no advertising or analytics.

## Reviewer test instructions
1. Open the extension options. Use fictional profile details and save.
2. Hover over a matching practice field; test Undo and click mode.
3. Upload a text-based PDF or TXT resume; verify extracted text is saved.
4. To test AI drafting, connect a reviewer-owned Anthropic/OpenAI API key. The developer does not provide a shared credential in this package. This feature may incur API charges.
5. Hover an unfamiliar practice question; review the draft and evidence. Approve to fill. The extension never submits applications.
6. Disconnect the provider to remove its saved credential.

## Remaining store assets/account steps
Upload a real product screenshot at a supported store size; never use a real applicant's personal data. Complete developer account registration, select distribution and submit for review. Listing publication is subject to Chrome Web Store review.
