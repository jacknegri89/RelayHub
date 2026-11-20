export const deliveryStates = [
  "pending",
  "queued",
  "delivering",
  "retry_scheduled",
  "delivered",
  "failed",
  "cancelled",
] as const;

type State = (typeof deliveryStates)[number];

const transitions: Record<State, readonly State[]> = {
  pending: ["queued", "delivering"],
  queued: ["delivering"],
  delivering: ["retry_scheduled", "delivered", "failed", "cancelled"],
  retry_scheduled: ["queued", "delivering"],
  delivered: [],
  failed: ["pending"],
  cancelled: [],
};

export function canTransition(from: State, to: State) {
  return transitions[from].includes(to);
}

export const activeStates: State[] = [
  "pending",
  "queued",
  "delivering",
  "retry_scheduled",
];
