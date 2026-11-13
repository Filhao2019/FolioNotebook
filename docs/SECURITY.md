# Security design

## Trust boundaries

The browser calls a same-origin server. Only the server decrypts provider keys, makes provider requests and scores quizzes. SQLite private rows belong directly to a user or through a notebook/artifact. Every resource route checks that chain; failures use 404. There are no public notebook links, sharing roles or cross-user key reuse. Source excerpts and generated text have no tool privileges and never receive secrets.

Passwords are app passwords only, salted with scrypt (N=131072, r=8, p=1, 64-byte key). Session tokens have 256 bits of randomness and only their SHA-256 hashes are stored; sessions expire after seven days. Cookies are HttpOnly, SameSite=Lax and Secure in production. State-changing calls require an exact Origin and session CSRF token. OAuth state is single-use, session-bound and expires after ten minutes; PKCE verifiers remain server-side. The callback URL is server-configured. Login and resource operations are rate limited by connection address and user. Incoming Host must match configured APP_ORIGIN, including behind a proxy.

Provider keys use per-record AES-256-GCM data encryption keys wrapped under a separate master key, with user ID as authenticated data. In local development the master is under `.secrets/`, outside `data/`; production refuses startup without a separately supplied 32-byte MASTER_KEY. **Managed KMS wrapping/rotation is not yet implemented**; injecting a key from a secret manager is not the same as KMS envelope wrapping. Rotate a compromised provider key in its provider console and replace the connection. No endpoint exposes decrypted secrets. No payloads, provider error bodies or keys are logged. Anonymous request/error metrics and audit event names contain no source text.

Database/upload content is not application-encrypted. Production requires encrypted disks and backups. Logical deletion removes active database rows and upload files; SQLite pages, provider retention, audit retention and backup erasure require an operational retention policy. No claim of forensic erasure is made. Account deletion detaches residual audit event ownership. Export contains the owner's full notebook and quiz answer keys, never provider credentials.

## Files and rendering

Uploads allow PDF/DOCX/TXT/Markdown/CSV only, with size and signature validation, random server-generated paths, no executable serving and no user-provided filesystem destinations. Limits: 10 MB/file, 50 sources/notebook, 200 files/account, 500 PDF pages and 5,000 chunks/document. Worker threads provide parsing timeouts and a JS heap limit, but are **not an OS sandbox**. For internet-facing service, isolate parsers further using containers/process permissions. PDFs extract text, not executable scripts or active content. DOCX uses raw-text extraction. Native parsing libraries still have a supply-chain attack surface.

Production refuses uploads without an administrator-configured malware scanner. `SCANNER_COMMAND` is a clamdscan-compatible executable called without a shell, with a 30-second timeout; errors fail closed. Development does not claim files have been malware-scanned when the scanner is absent. Antivirus does not prove a file safe.

Untrusted content is rendered using DOM text nodes with a deliberately small Markdown renderer. No raw HTML, executable SVG injection, remote script includes or `eval`. SVG exports escape node text. CSV exports neutralize leading spreadsheet formula characters. CSP restricts scripts, styles and network connections to same origin and disables object/frame embedding. HSTS applies in production. Downloads require the same ownership checks as ordinary reads.

SQL uses bound values; dynamic table names are internal allowlists. Provider endpoints are fixed HTTPS destinations; custom URLs and website ingestion are deliberately absent to avoid an unimplemented SSRF boundary. Opt-in Ollama connects only to fixed server loopback and must not be enabled on a shared host exposing untrusted local services.

## AI limits

Source material is explicitly marked as untrusted data in the system prompt. It cannot grant tools, invoke operations or expose credentials. Server citation IDs correspond to retrieved excerpts; unknown numeric references are removed/rejected. This validates provenance, **not factual entailment**. Prompt injection, hallucinations, misleading valid citations and incomplete summaries remain possible. Strict mode requests admission of insufficient evidence; no lexical hits returns an explicit limitation without asking a model to guess.

Structured tools validate JSON, counts, references, quiz keys, tables and tree connectivity/cycles. Generated quiz keys remain hidden until submission, except owner-requested full data exports. Grading is deterministic against those generated keys; the keys themselves can be wrong. Free-response AI grading and psychological error diagnoses are absent. Guides disclose sampling rather than promising full source coverage.

## Production work remaining

Account recovery/email verification, managed identity/MFA/passkeys, managed KMS, stronger password policy/breached-password checks, hardened parser isolation, distributed rate limits, broader abuse monitoring, dependency update automation, penetration testing and WCAG audit remain release gates for a general public service. The current service is a self-hosted release candidate; it is not independently security-certified.
