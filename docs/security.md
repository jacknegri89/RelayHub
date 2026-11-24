# Security model

Internet senders, authenticated tenant users, destination receivers, Redis and network dependencies are distinct trust boundaries. The main assets are organization data, signing secrets, payloads, identities and worker egress.

| Concern                                | Control                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Credential abuse and cross-site writes | Better Auth password hashing and expiring HttpOnly cookies, strict Origin check, HTTPS/Secure cookies in production, PostgreSQL request counters, form proof and honeypot |
| Cross-tenant access                    | Server membership checks, scoped lookups, role checks in configuration transactions and tenant-aware foreign keys                                                         |
| Forged or duplicate events             | Time-bounded raw-body HMAC, constant-time verification, bounded JSON parsing, signature replay receipt and persistent event uniqueness                                    |
| Sensitive payloads and signing keys    | AES-256-GCM envelopes with resource-bound AAD, limited metadata views, key IDs, retention and no payloads in Redis                                                        |
| Untrusted destination URLs             | Allowlisted HTTPS hostnames, address classification, pinned resolution, TLS validation, no redirects and an absolute request deadline                                     |
| Unsafe browser output                  | React text escaping, security headers, no third-party scripts and no persisted credentials in browser storage                                                             |

RelayHub sources sign the timestamp and original payload bytes with HMAC v1. Senders should include a unique business ID inside the JSON so identical payloads sent in the same second can be distinguished. The signature receipt limits reuse with a different header ID once a valid request has been observed.

GitHub sources verify `X-Hub-Signature-256` over the original bytes using a dedicated webhook secret. GitHub's signature covers only the body. Use HTTPS with certificate verification and keep the payload and signature private. GitHub reuses `X-GitHub-Delivery` on redelivery. PostgreSQL enforces one event per source and delivery GUID while the event is retained. A matching redelivery returns the original event ID, and reuse of the same GUID with a different body or event type returns HTTP 409.

The worker also sends an outbound v2 signature in `X-RelayHub-Delivery-Signature`. It binds the timestamp, stable delivery ID, external event ID and raw body. Receivers that deduplicate a business operation should verify this signature and the timestamp before using those identifiers. The original v1 header remains available for existing integrations. Use TLS and a distinct secret per destination.

Proxy mode trusts X-Real-IP only when the app is behind a network-restricted proxy that overwrites it. Direct mode aggregates limits under a shared identity. Rate limiting uses fixed windows and PostgreSQL availability. The form timestamp is an abuse signal and can be reused after the minimum time. Set request, connection and traffic limits at the perimeter.

A lost encryption key makes existing envelopes unreadable. Application-level encryption assumes the DB and runtime credentials are separately protected. Use deployment network policy to block internal routes, private address space and metadata access at egress. Production TLS and reverse proxy configuration require environment-specific validation.

## Account enrollment

Registration initially stores an unverified email. With account mail enabled, the signup response is uniform and the user signs in separately. A verification link must be confirmed from a session belonging to the same account and address. The link expires, is stored as a digest and is consumed atomically. A resend replaces the previous link. Existing users keep their current verification state and can request a link under **Workspace → Profile**.

Password reset is available only for a verified account. The public request responds uniformly to valid submissions, including unknown or unverified addresses. IP and mailbox limits bound requests, and the public form uses a signed form timestamp and honeypot. The token travels in the link fragment; the browser removes the fragment from the address bar and submits the token by same-origin POST. Better Auth hashes the new password and revokes existing sessions. Changing the password also invalidates earlier reset links and pending second-factor challenges. MFA enrollment and unused recovery codes continue to apply on the next sign-in. A mailbox alone cannot take over an unverified legacy account.

Users can enable MFA with a time-based authenticator app. The first code confirms enrollment. A short-lived challenge cookie then gates subsequent sign-ins. The server encrypts authenticator secrets and recovery codes. Recovery codes can each be used once.

Organization owners grant membership using the account UUID shown on the member's authenticated **Organizations** page. Exchange it over an established channel.

| Organization role | Read activity | Configure routes and retry deliveries | Manage members |
| ----------------- | ------------- | ------------------------------------- | -------------- |
| Owner             | Yes           | Yes                                   | Yes            |
| Admin             | Yes           | Yes                                   |                |
| Viewer            | Yes           |                                       |                |

Manage members in **Workspace → Settings**. Roles apply to one organization at a time.

Only owners can delete an organization in **Settings → Delete organization**. The server requires an exact name confirmation, a same-origin request and a token tied to the current session and organization. The database removes organization-scoped records in one transaction. A request already transmitted to an external receiver may still finish.

## Browser policy

The content security policy permits inline hydration scripts and styles. A nonce-based policy requires framework integration.

References: [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) and [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).
