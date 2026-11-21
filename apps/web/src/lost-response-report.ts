export type LostResponseReport = {
  runId: string;
  deliveryId: string;
  status: string;
  attempts: {
    number: number;
    deliveryId: string;
    startedAt: string;
    finishedAt: string | null;
    outcome: string;
    httpStatus: number | null;
    durationMs: number | null;
  }[];
  requestsReceived: number;
  ordersSaved: number;
  orderSavedAt: string | null;
};
