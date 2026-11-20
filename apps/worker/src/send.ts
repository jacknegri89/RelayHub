import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import {
  DestinationBlocked,
  destinationUrl,
  publicAddress,
} from "@relayhub/shared/destinations";

export async function approvedAddress(
  hostname: string,
  resolve: (name: string) => Promise<{ address: string; family: number }[]> = (
    name,
  ) => lookup(name, { all: true, verbatim: true }),
) {
  const addresses = await resolve(hostname);
  if (
    !addresses.length ||
    addresses.some(({ address }) => !publicAddress(address))
  ) {
    throw new DestinationBlocked("DNS returned an ineligible address");
  }
  return addresses[0];
}

export async function send(
  destination: string,
  body: Buffer,
  headers: Record<string, string>,
  timeoutMs: number,
) {
  const { url, isDemo } = destinationUrl(destination);
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let address: Awaited<ReturnType<typeof approvedAddress>> | undefined;
    if (!isDemo) {
      address = await Promise.race([
        approvedAddress(url.hostname),
        new Promise<never>((_resolve, reject) => {
          controller.signal.addEventListener(
            "abort",
            () => reject(new Error("Delivery timed out")),
            { once: true },
          );
        }),
      ]);
    }
    return await new Promise<{ status: number; retryAfter?: string }>(
      (resolve, reject) => {
        let transport = httpsRequest;
        if (isDemo) {
          transport = httpRequest;
        }
        const outgoing = transport(
          url,
          {
            method: "POST",
            agent: false,
            maxHeaderSize: 8192,
            signal: controller.signal,
            headers: {
              ...headers,
              "content-type": "application/json",
              "content-length": String(body.length),
            },
            ...(address && {
              family: address.family,
              lookup: (_hostname, _options, callback) =>
                callback(null, address.address, address.family),
            }),
          },
          (incoming) => {
            // Delivery classification only needs response headers. Never buffer a response body.
            const status = incoming.statusCode ?? 0;
            const retryAfter = incoming.headers["retry-after"];
            resolve({ status, retryAfter });
            incoming.destroy();
          },
        );
        outgoing.on("error", reject);
        outgoing.end(body);
      },
    );
  } finally {
    clearTimeout(deadline);
  }
}
