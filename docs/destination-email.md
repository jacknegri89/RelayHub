# Destination email alerts

In a destination’s detail page, **Email alerts** subscribes the signed-in member’s account address. If the account address has already been verified, the subscription starts immediately. Otherwise RelayHub sends an eight-digit code valid for 30 minutes and accepts up to eight guesses. An address may request three confirmation messages per hour. Members can disable their subscription on the same page. Changing the account address or removing a member deletes its subscriptions and queued messages.

## Configure the sender

1. Verify a sending domain that you control and create a sending-only API key with Resend. [Verified domains](https://resend.com/docs/dashboard/domains/introduction)
2. Set `RELAYHUB_EMAIL_FROM` to an address on that domain and `RESEND_API_KEY` to the key in the private environment of both web and worker. Leave both unset to keep in-app monitoring available without email. The application calls the fixed HTTPS send endpoint with a five-second timeout. [Send email](https://resend.com/docs/api-reference/emails/send-email)
3. Apply the Prisma migrations, then restart the web and worker. Enable a subscription using a mailbox you control. Check confirmation, a three-failure outage, recovery and disabling. Email is an opt-in notification channel. The organization’s alert history remains available to all its members.

## Delivery and retention

PostgreSQL queues one message per subscribed member and transition in the transaction that records the incident. Messages contain the destination name, transition time and authenticated workspace link. Confirmation messages contain only generic instructions and a short-lived code. The provider receives the recipient address and email text.

The worker retries connection failures, timeouts, rate limits and server errors while preserving transition order for each subscription. It reuses a stable idempotency key and stops ambiguous retries 23 hours after the first attempt, inside the provider’s 24-hour deduplication period. A successful provider response records acceptance. Delivery to a mailbox can still be affected by spam filtering or a later bounce. [Provider idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)

Completed queue rows are removed after `RETENTION_DAYS`. An unsendable alert is indicated in the member’s destination settings while the failed row is retained. Workers log rejection status codes, with recipient addresses, codes, credentials and provider response bodies omitted.
