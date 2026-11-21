"use client";

import { useEffect, useRef, useState } from "react";
import type { LostResponseReport } from "../lost-response-report";

const STORAGE_KEY = "relayhub.lost-response.v1";
const POLL_MS = 2_000;
const MAX_WAIT_MS = 90_000;
const MAX_BACKOFF_MS = 16_000;
const REQUEST_TIMEOUT_MS = 10_000;
// Only UUID v4 pairs generated for this tab may become a read URL and bearer.
const UUID_V4 =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

type Ticket = { runId: string; runKey: string; confirmed: boolean };
type Watch = { ticket: Ticket; form?: { formProof: string; website: string } };
type Phase = "idle" | "watching" | "paused" | "finished";
type Issue =
  | "none"
  | "connection"
  | "unavailable"
  | "limit"
  | "missing"
  | "unconfirmed"
  | "proof"
  | "other";

function saveTicket(ticket: Ticket) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ticket));
  } catch {
    // The current tab can still run the test in memory when browser storage is unavailable.
  }
}

function loadTicket(): Ticket | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored);
    if (
      typeof parsed?.runId === "string" &&
      UUID_V4.test(parsed.runId) &&
      typeof parsed.runKey === "string" &&
      UUID_V4.test(parsed.runKey) &&
      typeof parsed.confirmed === "boolean"
    ) {
      return {
        runId: parsed.runId,
        runKey: parsed.runKey,
        confirmed: parsed.confirmed,
      };
    }
  } catch {
    /* Invalid or unavailable session storage starts on the idle screen. */
  }
  return null;
}

function retryAfterMs(response: Response) {
  const raw = response.headers.get("retry-after");
  if (!raw) {
    return 0;
  }
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const until = Date.parse(raw);
  if (Number.isFinite(until)) {
    return Math.max(0, until - Date.now());
  }
  return 0;
}

export function useLostResponse(formProof: string, minFormTimeMs: number) {
  const [readyProof, setReadyProof] = useState<string | null>(null);
  const ready = readyProof === formProof;
  const [watch, setWatch] = useState<Watch | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [issue, setIssue] = useState<Issue>("none");
  const [report, setReport] = useState<LostResponseReport | null>(null);
  const ticket = useRef<Ticket | null>(null);
  const locked = useRef(false);
  const [allowedAfter, setAllowedAfter] = useState(0);

  useEffect(() => {
    const stored = loadTicket();
    if (stored) {
      ticket.current = stored;
      locked.current = true;
      setPhase("watching");
      // Reloads only read the previous run. Starting another order always takes a click.
      setWatch({ ticket: stored });
    }
  }, []);

  // An RSC refresh can issue a new proof while this tab still has the previous run open.
  useEffect(() => {
    const timer = window.setTimeout(
      () => setReadyProof(formProof),
      minFormTimeMs,
    );
    return () => window.clearTimeout(timer);
  }, [formProof, minFormTimeMs]);

  useEffect(() => {
    if (!allowedAfter) {
      return;
    }
    const timer = window.setTimeout(
      () => setAllowedAfter(0),
      Math.max(0, allowedAfter - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [allowedAfter]);

  useEffect(() => {
    if (!watch) {
      return;
    }
    const { ticket: current } = watch;
    let confirmed = current.confirmed;
    let form = watch.form;
    let delay = POLL_MS;
    let next: number | undefined;
    const controller = new AbortController();
    const deadline = window.setTimeout(() => stop("paused"), MAX_WAIT_MS);

    function stop(state: Phase) {
      window.clearTimeout(next);
      window.clearTimeout(deadline);
      controller.abort();
      locked.current = false;
      setPhase(state);
    }

    function backoff(problem: Issue, minimum = 0) {
      setIssue(problem);
      delay = Math.min(MAX_BACKOFF_MS, delay * 2);
      next = window.setTimeout(poll, Math.max(minimum, delay));
    }

    async function poll() {
      const headers: Record<string, string> = {
        Authorization: "Bearer " + current.runKey,
      };
      let url = "/api/lost-response/" + current.runId;
      const options: RequestInit = {
        method: "GET",
        headers,
        cache: "no-store",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ]),
      };
      if (form) {
        url = "/api/lost-response";
        headers["Content-Type"] = "application/json";
        options.method = "POST";
        options.body = JSON.stringify({ runId: current.runId, ...form });
      }
      try {
        const response = await fetch(url, options);
        if (controller.signal.aborted) {
          return;
        }
        if (response.status === 429) {
          const wait = retryAfterMs(response);
          if (wait > 0) {
            setAllowedAfter(Date.now() + wait);
          }
          backoff("limit", wait);
          return;
        }
        if (response.status >= 500) {
          backoff("unavailable", retryAfterMs(response));
          return;
        }
        if (!response.ok) {
          let problem: Issue = "other";
          if (response.status === 404) {
            problem = "missing";
            if (!confirmed) {
              problem = "unconfirmed";
            }
          }
          if (response.status === 422 && form) {
            problem = "proof";
          }
          setIssue(problem);
          stop("paused");
          return;
        }
        const result: LostResponseReport = await response.json();
        if (controller.signal.aborted) {
          return;
        }
        if (result.runId !== current.runId || !Array.isArray(result.attempts)) {
          setIssue("other");
          stop("paused");
          return;
        }
        if (!confirmed) {
          confirmed = true;
          const accepted = { ...current, confirmed };
          ticket.current = accepted;
          saveTicket(accepted);
        }
        form = undefined;
        setReport(result);
        setIssue("none");
        if (["delivered", "failed", "cancelled"].includes(result.status)) {
          stop("finished");
          return;
        }
        delay = POLL_MS;
        next = window.setTimeout(poll, delay);
      } catch {
        if (!controller.signal.aborted) {
          backoff("connection");
        }
      }
    }

    void poll();
    return () => {
      controller.abort();
      window.clearTimeout(next);
      window.clearTimeout(deadline);
    };
  }, [watch]);

  function begin(newRun: boolean, website: string) {
    if (!ready || locked.current || allowedAfter > Date.now()) {
      return;
    }
    let current = ticket.current;
    if (newRun || !current) {
      current = {
        runId: crypto.randomUUID(),
        runKey: crypto.randomUUID(),
        confirmed: false,
      };
      ticket.current = current;
      saveTicket(current);
      setReport(null);
    }
    locked.current = true;
    setPhase("watching");
    setIssue("none");
    if (current.confirmed) {
      setWatch({ ticket: current });
      return;
    }
    setWatch({ ticket: current, form: { formProof, website } });
  }

  return { ready: ready && !allowedAfter, phase, issue, report, begin };
}
