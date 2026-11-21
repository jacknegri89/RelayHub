# Destination email alerts

In a destination’s detail page, **Email alerts** subscribes the signed-in member’s account address. If the account address has already been verified, the subscription starts immediately. Otherwise RelayHub sends an eight-digit code valid for 30 minutes and accepts up to eight guesses. An address may request three confirmation messages per hour. Members can disable their subscription on the same page. Changing the account address or removing a member deletes its subscriptions and queued messages.

## Send from an existing Gmail account

1. Enable the Gmail API in a Google Cloud project with billing disabled. The operator is the only Google user who needs to authorize RelayHub. Recipients can use other email services.
2. Configure the OAuth audience and create a **Desktop app** client. If the audience is in Testing, add your personal Gmail address as a test user. Download the client's JSON file to a private folder outside the repository. In the repository root, run `pnpm setup` if you need a local `.env`. [Google's desktop OAuth guide](https://developers.google.com/identity/protocols/oauth2/native-app)
3. Run `pnpm gmail:authorize --client-json "/path/to/client.json" --sender "you@gmail.com"`, substituting your file path and sender address. Open the printed Google consent link in a browser on the **same computer**, select that Gmail account and grant the send permission. Google returns to a temporary address on `127.0.0.1`. After consent, the command saves `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `RELAYHUB_EMAIL_FROM` and `GMAIL_REFRESH_TOKEN` in the ignored local `.env`. If the first three settings are already in that file, run `pnpm gmail:authorize` on its own to update only the refresh token. The command asks for `gmail.send` only and has a ten-minute timeout. If consent expires or you cancel, rerun it.
4. To enable account mail, copy the three Gmail OAuth values to the web service's **server-side secrets**, set `RELAYHUB_EMAIL_FROM` to the authorized address, set `RELAYHUB_MAIL_PROVIDER=gmail` and `RELAYHUB_ACCOUNT_EMAIL=1`, then redeploy. On a mailbox you control, confirm receipt of the address verification email, verify the address and request a password reset. Open the reset email and check that the new password works. To send destination alerts from this mailbox too, configure the same sender, provider and OAuth credentials on the worker and redeploy it.

For this scope, an external Google project in Testing issues refresh tokens that expire after seven days. For ongoing use, complete Google's applicable production consent requirements and authorize again. Recipients see your Gmail address. Sent messages may appear in your Sent folder and count towards your account’s sending limits. [Token expiration](https://developers.google.com/identity/protocols/oauth2#expiration) · [Gmail limits](https://support.google.com/mail/answer/22839)

## Configure Resend

1. Verify a sending domain that you control and create a sending-only API key with Resend. [Verified domains](https://resend.com/docs/dashboard/domains/introduction)
2. Set `RELAYHUB_EMAIL_FROM` to an address on that domain and `RESEND_API_KEY` to the key in the private environment of both web and worker. While either setting is missing, RelayHub keeps email disabled and the webhook workspace available. The application calls the fixed HTTPS send endpoint with a five-second timeout. [Send email](https://resend.com/docs/api-reference/emails/send-email)
3. Apply the Prisma migrations, then restart the web and worker. Enable a subscription using a mailbox you control. Check confirmation, a three-failure outage, recovery and disabling. Email is an opt-in notification channel. The organization’s alert history remains available to all its members.

The Resend Free transactional plan lists 100 emails per day and 3,000 per month across the account. Notifications and account messages share this capacity. Pay-as-you-go overages are for paid subscriptions. Keep the existing free plan and monitor the provider dashboard. [Resend pricing](https://resend.com/pricing)

Without an existing verified domain, an operator can test destination alerts with `onboarding@resend.dev`. Set the private `RELAYHUB_RESEND_TEST_TO` to the mailbox registered with Resend. RelayHub only offers email alerts to that address while using the testing sender. Public account mail stays disabled with this sender. For general delivery, verify a domain you already control and check real receipt before enabling `RELAYHUB_ACCOUNT_EMAIL=1`. Account mail is off by default. [Resend testing sender restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)

## Local mailbox

Use Mailpit to capture fictional emails entirely on your machine. With the native Mailpit binary, run the following command and leave SMTP forwarding and relaying disabled:

```sh
mailpit --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025
```

For a native demo web and worker, set `RELAYHUB_MODE=demo` and `RELAYHUB_MAILPIT_URL=http://127.0.0.1:8025`. Leave both Resend settings empty. Open the mailbox at that address. An isolated Compose network can use the internal hostname `mailpit` and a loopback-bound UI port. The mail adapter sends the branded HTML and plain-text versions together. In Mailpit, open a message and switch between its HTML and text views. RelayHub rejects this transport in production. [Mailpit send API](https://mailpit.axllent.org/docs/usage/sending-messages/)

For automated integration tests, set only `RELAYHUB_TEST_MAILPIT_URL` to the running local mailbox origin. The tests capture confirmation, outage and recovery messages for a new fictional recipient through the same adapter as the worker. The simulated provider separately exercises HTTP errors and deduplication after a lost acknowledgement.

## Delivery and retention

PostgreSQL queues one message per subscribed member and transition in the transaction that records the incident. Messages contain the destination name, transition time and authenticated workspace link. Confirmation messages contain only generic instructions and a short-lived code. The provider receives the recipient address and email text.

The worker preserves transition order per subscription. With Resend it retries timeouts and transient errors using the original idempotency key. With Gmail it retries explicit rate limits and transient token exchange failures. Gmail does not document an idempotency key for sending. After an ambiguous send response, the worker flags the message as unconfirmed and continues with later alerts. A worker crash before the database records the outcome can still cause a repeat. Messages expire within 23 hours of the transition. Both providers must return a message ID before RelayHub records acceptance. Spam filtering or a later bounce can still affect receipt. [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys) · [Gmail send API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)

Completed queue rows are removed after `RETENTION_DAYS`. An unsendable alert is indicated in the member’s destination settings while the failed row is retained. Workers log rejection status codes, with recipient addresses, codes, credentials and provider response bodies omitted.
