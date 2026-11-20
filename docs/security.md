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

The HMAC v1 format signs timestamp and payload bytes. The event ID and outbound Delivery ID are headers. Senders should include a unique business ID inside the JSON so identical payloads sent in the same second can be distinguished. The signature receipt limits reuse with a different header ID once a valid request has been observed. Always protect transit with TLS and authorize trusted senders. A future signature version can bind additional headers.

Proxy mode trusts X-Real-IP only when the app is behind a network-restricted proxy that overwrites it. Direct mode aggregates limits under a shared identity. Rate limiting uses fixed windows and PostgreSQL availability. The form timestamp is an abuse signal and can be reused after the minimum time. Set request, connection and traffic limits at the perimeter.

A lost encryption key makes existing envelopes unreadable. Application-level encryption assumes the DB and runtime credentials are separately protected. Use deployment network policy to block internal routes, private address space and metadata access at egress. Production TLS and reverse proxy configuration require environment-specific validation.

## Account enrollment

Production enrollment requires a single-use invitation. Registration stores the supplied email as a sign-in identifier. The hosted app does not verify ownership or send password-reset messages. Deliver invitations through a trusted channel.

Organization owners grant membership using the account UUID shown on the member's authenticated **Organizations** page. Exchange it over an established channel.

| Organization role | Read activity | Configure routes and retry deliveries | Manage members |
| ----------------- | ------------- | ------------------------------------- | -------------- |
| Owner             | Yes           | Yes                                   | Yes            |
| Admin             | Yes           | Yes                                   |                |
| Viewer            | Yes           |                                       |                |

Manage members in **Workspace → Settings**. Roles apply to one organization at a time. Platform operators issue registration invitations from a trusted terminal, as described in [Operations](operations.md#vercel-deployment).

## Browser policy

The content security policy permits inline hydration scripts and styles. A nonce-based policy requires framework integration.

References: [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) and [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).
