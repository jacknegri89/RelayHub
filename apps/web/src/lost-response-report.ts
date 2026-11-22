export type LostResponseReport = {
  runId: string;
  event: {
    id: string;
    type: string;
    receivedAt: string;
    sourceName: string;
  };
  destinationName: string;
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

// A tab opened before a rollback can receive the earlier report without event details.
export function hasDashboardEvent(report: Partial<LostResponseReport>) {
  const event = report.event;
  return (
    typeof event?.id === "string" &&
    typeof event.type === "string" &&
    typeof event.sourceName === "string" &&
    typeof event.receivedAt === "string" &&
    Number.isFinite(Date.parse(event.receivedAt)) &&
    typeof report.destinationName === "string"
  );
}
