// Simulation behind the homepage spacetime diagram.
// Space is a 0..1 axis (sender → RelayHub → endpoints), time is in seconds.
// Signals travel at one "speed of light": crossing the whole axis takes
// CROSS_SECONDS, independently of the size of the canvas.

export type Endpoint = "a" | "b" | "c";
export type JourneyOrigin = "ambient" | "featured" | "visitor";
export type DeliveryOutcome = "in_flight" | "retrying" | "delivered" | "failed";

export const ENDPOINTS: Endpoint[] = ["a", "b", "c"];
export const LANE_POSITION = {
  sender: 0,
  relay: 0.3,
  a: 0.66,
  b: 0.83,
  c: 1,
} as const;
export const CROSS_SECONDS = 3.2;
export const MAX_ATTEMPTS = 5;

const BACKOFF_BASE_SECONDS = 0.6;
const STEP_SECONDS = 1 / 60;
const FORGET_AFTER_SECONDS = 14;
const AMBIENT_GAP_MIN_SECONDS = 1;
const AMBIENT_GAP_RANGE_SECONDS = 1.1;
const TAMPERED_SHARE = 0.08;
const STATUS_DELIVERED = 204;
const STATUS_BAD_SIGNATURE = 401;
const STATUS_UNAVAILABLE = 503;
const TRANSIENT_STATUSES = [500, 502, 429];
const AMBIENT_FAILURE_CHANCE: Record<Endpoint, number> = {
  a: 0.04,
  b: 0.24,
  c: 0.08,
};
const EVENT_TYPES = [
  "order.created",
  "invoice.paid",
  "payment.failed",
  "shipment.sent",
  "user.updated",
];

export type Attempt = {
  number: number;
  sentAt: number;
  arrivesAt: number;
  status: number | null;
  returnsAt: number | null;
  retryAt: number | null;
};

export type Delivery = {
  endpoint: Endpoint;
  attempts: Attempt[];
  outcome: DeliveryOutcome;
  forcedFailures: number;
};

export type Journey = {
  id: number;
  code: string;
  type: string;
  origin: JourneyOrigin;
  emittedAt: number;
  arrivesAt: number;
  tampered: boolean;
  accepted: boolean | null;
  rejectionReturnsAt: number | null;
  plannedEndpoints: Endpoint[];
  forcedFailures: Partial<Record<Endpoint, number>>;
  deliveries: Delivery[];
  lastActivity: number;
};

export function snapshotOrder(journey: Journey) {
  const deliveries = journey.deliveries.map((delivery) => ({
    endpoint: delivery.endpoint,
    attempts: delivery.attempts.length,
    status: delivery.attempts.at(-1)?.status ?? null,
    outcome: delivery.outcome,
  }));
  return {
    code: journey.code,
    type: journey.type,
    origin: journey.origin,
    accepted: journey.accepted,
    deliveries,
  };
}

export type OrderSnapshot = ReturnType<typeof snapshotOrder>;

export function orderInProgress(order: OrderSnapshot | Journey | null) {
  if (!order) {
    return false;
  }
  return (
    order.accepted === null ||
    order.deliveries.some(
      (delivery) =>
        delivery.outcome === "retrying" || delivery.outcome === "in_flight",
    )
  );
}

export type JourneyNotice = {
  code: string;
  type: string;
  origin: JourneyOrigin;
  kind:
    "rejected" | "accepted" | "delivered" | "retrying" | "resending" | "failed";
  endpoint?: Endpoint;
  status?: number;
  attempt?: number;
};

export function flightSeconds(from: number, to: number) {
  return Math.abs(to - from) * CROSS_SECONDS;
}

export function backoffSeconds(attemptNumber: number) {
  return BACKOFF_BASE_SECONDS * 2 ** (attemptNumber - 1);
}

// Small deterministic generator so the opening frame is identical on every load.
function createRandom(seed: number) {
  let state = seed;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export class SpacetimeModel {
  now = 0;
  journeys: Journey[] = [];
  online: Record<Endpoint, boolean> = { a: true, b: true, c: true };
  onNotice: ((notice: JourneyNotice, journey: Journey) => void) | undefined;

  private random: () => number;
  private sequence = 0;
  private nextAmbientAt = 0.3;

  constructor(seed: number) {
    this.random = createRandom(seed);
  }

  advance(seconds: number) {
    let remaining = Math.min(seconds, 1);
    while (remaining > 0) {
      const step = Math.min(STEP_SECONDS, remaining);
      this.tick(step);
      remaining -= step;
    }
  }

  // Runs a long stretch of time quickly, used to pre-fill the diagram.
  fastForward(seconds: number) {
    const steps = Math.ceil(seconds / STEP_SECONDS);
    for (let index = 0; index < steps; index++) {
      this.tick(STEP_SECONDS);
    }
  }

  // A manual step stops at the next change to this order, ignoring background traffic.
  advanceOrder(journey: Journey) {
    let next = Infinity;
    if (journey.accepted === null) {
      next = journey.arrivesAt;
    }
    for (const delivery of journey.deliveries) {
      const latest = delivery.attempts.at(-1);
      if (latest && delivery.outcome === "in_flight") {
        next = Math.min(next, latest.arrivesAt);
      }
      if (latest?.retryAt != null && delivery.outcome === "retrying") {
        next = Math.min(next, latest.retryAt);
      }
    }
    if (Number.isFinite(next)) {
      this.fastForward(Math.max(0, next - this.now) + STEP_SECONDS);
    }
  }

  emitVisitorEvent(tampered: boolean) {
    return this.emit({
      origin: "visitor",
      tampered,
      endpoints: [...ENDPOINTS],
      forcedFailures: {},
    });
  }

  // The scripted first event: one endpoint answers 503 once, then accepts.
  emitFeaturedEvent() {
    return this.emit({
      origin: "featured",
      tampered: false,
      endpoints: [...ENDPOINTS],
      forcedFailures: { b: 1 },
    });
  }

  setOnline(endpoint: Endpoint, online: boolean) {
    this.online[endpoint] = online;
  }

  private tick(step: number) {
    this.now += step;
    if (this.now >= this.nextAmbientAt) {
      this.emitAmbientEvent();
    }
    for (const journey of this.journeys) {
      this.updateJourney(journey);
    }
    this.forgetOldJourneys();
  }

  private emitAmbientEvent() {
    const gap =
      AMBIENT_GAP_MIN_SECONDS + this.random() * AMBIENT_GAP_RANGE_SECONDS;
    this.nextAmbientAt = this.now + gap;
    const endpoints: Endpoint[] = [];
    for (const endpoint of ENDPOINTS) {
      if (this.random() < 0.55) {
        endpoints.push(endpoint);
      }
    }
    if (!endpoints.length) {
      const index = Math.floor(this.random() * ENDPOINTS.length);
      endpoints.push(ENDPOINTS[index]);
    }
    this.emit({
      origin: "ambient",
      tampered: this.random() < TAMPERED_SHARE,
      endpoints,
      forcedFailures: {},
    });
  }

  private emit(options: {
    origin: JourneyOrigin;
    tampered: boolean;
    endpoints: Endpoint[];
    forcedFailures: Partial<Record<Endpoint, number>>;
  }) {
    this.sequence += 1;
    const typeIndex = Math.floor(this.random() * EVENT_TYPES.length);
    let eventType = "order.created";
    if (options.origin === "ambient") {
      eventType = EVENT_TYPES[typeIndex];
    }
    const codeNumber = Math.floor(this.random() * 0xffff);
    const arrivesAt =
      this.now + flightSeconds(LANE_POSITION.sender, LANE_POSITION.relay);
    const journey: Journey = {
      id: this.sequence,
      code: "evt_" + codeNumber.toString(16).padStart(4, "0"),
      type: eventType,
      origin: options.origin,
      emittedAt: this.now,
      arrivesAt,
      tampered: options.tampered,
      accepted: null,
      rejectionReturnsAt: null,
      plannedEndpoints: options.endpoints,
      forcedFailures: options.forcedFailures,
      deliveries: [],
      lastActivity: arrivesAt,
    };
    this.journeys.push(journey);
    return journey;
  }

  private updateJourney(journey: Journey) {
    if (journey.accepted === null && this.now >= journey.arrivesAt) {
      this.resolveIngress(journey);
    }
    for (const delivery of journey.deliveries) {
      this.updateDelivery(journey, delivery);
    }
  }

  private resolveIngress(journey: Journey) {
    if (journey.tampered) {
      journey.accepted = false;
      journey.rejectionReturnsAt =
        journey.arrivesAt +
        flightSeconds(LANE_POSITION.relay, LANE_POSITION.sender);
      journey.lastActivity = journey.rejectionReturnsAt;
      this.notify(journey, { kind: "rejected", status: STATUS_BAD_SIGNATURE });
      return;
    }
    journey.accepted = true;
    for (const endpoint of journey.plannedEndpoints) {
      const delivery: Delivery = {
        endpoint,
        attempts: [],
        outcome: "in_flight",
        forcedFailures: journey.forcedFailures[endpoint] ?? 0,
      };
      this.sendAttempt(journey, delivery, journey.arrivesAt);
      journey.deliveries.push(delivery);
    }
    this.notify(journey, { kind: "accepted" });
  }

  private sendAttempt(journey: Journey, delivery: Delivery, sentAt: number) {
    const flight = flightSeconds(
      LANE_POSITION.relay,
      LANE_POSITION[delivery.endpoint],
    );
    delivery.attempts.push({
      number: delivery.attempts.length + 1,
      sentAt,
      arrivesAt: sentAt + flight,
      status: null,
      returnsAt: null,
      retryAt: null,
    });
    delivery.outcome = "in_flight";
    journey.lastActivity = Math.max(journey.lastActivity, sentAt + flight);
  }

  private updateDelivery(journey: Journey, delivery: Delivery) {
    const attempt = delivery.attempts[delivery.attempts.length - 1];
    if (attempt.status === null && this.now >= attempt.arrivesAt) {
      this.resolveAttempt(journey, delivery, attempt);
    }
    const retryIsDue =
      delivery.outcome === "retrying" &&
      attempt.retryAt !== null &&
      this.now >= attempt.retryAt;
    if (retryIsDue && attempt.retryAt !== null) {
      this.sendAttempt(journey, delivery, attempt.retryAt);
      this.notify(journey, {
        kind: "resending",
        endpoint: delivery.endpoint,
        attempt: delivery.attempts.length,
      });
    }
  }

  private resolveAttempt(
    journey: Journey,
    delivery: Delivery,
    attempt: Attempt,
  ) {
    const failureStatus = this.failureStatus(journey, delivery);
    if (failureStatus === null) {
      attempt.status = STATUS_DELIVERED;
      delivery.outcome = "delivered";
      this.notify(journey, {
        kind: "delivered",
        endpoint: delivery.endpoint,
        status: STATUS_DELIVERED,
        attempt: attempt.number,
      });
      return;
    }
    attempt.status = failureStatus;
    attempt.returnsAt =
      attempt.arrivesAt +
      flightSeconds(LANE_POSITION[delivery.endpoint], LANE_POSITION.relay);
    journey.lastActivity = Math.max(journey.lastActivity, attempt.returnsAt);
    if (attempt.number >= MAX_ATTEMPTS) {
      delivery.outcome = "failed";
      this.notify(journey, {
        kind: "failed",
        endpoint: delivery.endpoint,
        status: failureStatus,
        attempt: attempt.number,
      });
      return;
    }
    attempt.retryAt = attempt.returnsAt + backoffSeconds(attempt.number);
    delivery.outcome = "retrying";
    journey.lastActivity = Math.max(journey.lastActivity, attempt.retryAt);
    this.notify(journey, {
      kind: "retrying",
      endpoint: delivery.endpoint,
      status: failureStatus,
      attempt: attempt.number,
    });
  }

  // Returns the HTTP status of a failed attempt, or null when it succeeds.
  private failureStatus(journey: Journey, delivery: Delivery) {
    if (!this.online[delivery.endpoint]) {
      return STATUS_UNAVAILABLE;
    }
    if (delivery.forcedFailures > 0) {
      delivery.forcedFailures -= 1;
      return STATUS_UNAVAILABLE;
    }
    if (journey.origin !== "ambient") {
      return null;
    }
    if (this.random() >= AMBIENT_FAILURE_CHANCE[delivery.endpoint]) {
      return null;
    }
    const index = Math.floor(this.random() * TRANSIENT_STATUSES.length);
    return TRANSIENT_STATUSES[index];
  }

  private notify(
    journey: Journey,
    notice: Omit<JourneyNotice, "code" | "type" | "origin">,
  ) {
    if (!this.onNotice) {
      return;
    }
    this.onNotice(
      {
        code: journey.code,
        type: journey.type,
        origin: journey.origin,
        ...notice,
      },
      journey,
    );
  }

  private forgetOldJourneys() {
    const settledBefore = this.now - FORGET_AFTER_SECONDS;
    const kept: Journey[] = [];
    for (const journey of this.journeys) {
      if (journey.lastActivity >= settledBefore || orderInProgress(journey)) {
        kept.push(journey);
      }
    }
    this.journeys = kept;
  }
}
