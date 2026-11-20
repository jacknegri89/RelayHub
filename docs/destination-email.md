# Destination email alerts

In a destination’s detail page, **Email alerts** subscribes the signed-in member’s account address. If the account address has already been verified, the subscription starts immediately. Otherwise RelayHub sends an eight-digit code valid for 30 minutes and accepts up to eight guesses. An address may request three confirmation messages per hour. Members can disable their subscription on the same page. Changing the account address or removing a member deletes its subscriptions and queued messages.

## Configure the sender

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

For a native demo web and worker, set `RELAYHUB_MODE=demo` and `RELAYHUB_MAILPIT_URL=http://127.0.0.1:8025`. Leave both Resend settings empty. Open the mailbox at that address. An isolated Compose network can use the internal hostname `mailpit` and a loopback-bound UI port. The mail adapter posts plain text to Mailpit’s local HTTP API. RelayHub rejects this transport in production. [Mailpit send API](https://mailpit.axllent.org/docs/usage/sending-messages/)

For automated integration tests, set only `RELAYHUB_TEST_MAILPIT_URL` to the running local mailbox origin. The tests capture confirmation, outage and recovery messages for a new fictional recipient through the same adapter as the worker. The simulated provider separately exercises HTTP errors and deduplication after a lost acknowledgement.

## Delivery and retention

PostgreSQL queues one message per subscribed member and transition in the transaction that records the incident. Messages contain the destination name, transition time and authenticated workspace link. Confirmation messages contain only generic instructions and a short-lived code. The provider receives the recipient address and email text.

The worker retries connection failures, timeouts, rate limits and server errors while preserving transition order for each subscription. It reuses a stable idempotency key and expects a provider message ID. A lost or malformed acknowledgement is retried with that same key. A permanent rejection finishes that message and allows later alerts to proceed. Messages expire within 23 hours of the incident transition, including outages queued during worker downtime, and always within the provider’s 24-hour deduplication period after the first request. A confirmed provider response records acceptance. Spam filtering or a later bounce can still affect receipt. [Provider idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)

Completed queue rows are removed after `RETENTION_DAYS`. An unsendable alert is indicated in the member’s destination settings while the failed row is retained. Workers log rejection status codes, with recipient addresses, codes, credentials and provider response bodies omitted.
