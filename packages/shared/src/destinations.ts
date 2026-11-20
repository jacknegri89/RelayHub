import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { settings } from "./config";

export class DestinationBlocked extends Error {}

export function destinationUrl(
  raw: string,
  configuration?: ReturnType<typeof settings>,
) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DestinationBlocked("Invalid destination URL");
  }
  const config = configuration ?? settings();
  const domain = url.hostname;
  if (url.username || url.password || url.hash || url.search) {
    throw new DestinationBlocked(
      "Credentials, fragments and query strings are forbidden",
    );
  }
  if (
    config.isDemo &&
    url.origin === config.DEMO_RECEIVER_URL &&
    /^\/hooks\/(success|transient|busy|timeout|slow|permanent)$/.test(
      url.pathname,
    ) &&
    !url.search
  ) {
    return { url, isDemo: true, isVerificationReceiver: false };
  }
  const ownOrigin = url.origin === config.RELAYHUB_BASE_URL;
  const ownReceiverOrigin =
    ownOrigin || url.origin === config.RELAYHUB_PREVIOUS_ORIGIN;
  const isVerificationReceiver = Boolean(
    config.VERIFICATION_RECEIVER_SECRET &&
    !config.isDemo &&
    ownReceiverOrigin &&
    url.pathname === "/api/receiver/verify",
  );
  if (
    url.protocol !== "https:" ||
    url.port ||
    isIP(domain) ||
    domain.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      domain,
    ) ||
    (!isVerificationReceiver &&
      (ownReceiverOrigin || !config.hosts.has(domain)))
  ) {
    throw new DestinationBlocked(
      "Destination must use an approved HTTPS hostname",
    );
  }
  return { url, isDemo: false, isVerificationReceiver };
}

export function publicAddress(address: string) {
  if (!ipaddr.isValid(address)) {
    return false;
  }
  const parsed = ipaddr.parse(address);
  if (parsed.range() !== "unicast") {
    return false;
  }
  if (parsed.kind() === "ipv6") {
    // Only globally routed IPv6 space is eligible.
    return (parsed.toByteArray()[0] & 0xe0) === 0x20;
  }
  return true;
}
