import {
  CROSS_SECONDS,
  ENDPOINTS,
  LANE_POSITION,
  orderInProgress,
  type Endpoint,
  type Journey,
  type SpacetimeModel,
} from "./spacetime-model";

export type SpacetimeLabels = {
  sender: string;
  destinations: Record<Endpoint, string>;
  now: string;
  end: string;
  time: string;
  verified: string;
  rejected: string;
  delivered: string;
  retry: string;
  failed: string;
};

type Point = { x: number; y: number };
type Segment = { journeyId: number; from: Point; to: Point };
type Layout = {
  width: number;
  height: number;
  plotStart: number;
  spaceStart: number;
  spaceLength: number;
  nowAt: number;
  speed: number;
};
type Annotation = {
  position: number;
  time: number;
  text: string;
  tone: string;
};

// Colors are RGB channels so alpha can be applied per stroke.
const BONE = "230 232 235";
const PHOTON = "88 166 255";
const DELIVERED = "63 185 80";
const RETRY = "210 153 34";
const FAILED = "248 81 73";

const HISTORY_SECONDS = 8;
const COMPACT_PLOT_WIDTH = 430;
const PICK_RADIUS_PX = 22;
const SIGNAL_TRAIL_PX = 28;
const ANNOTATION_SECONDS = 4.2;
const FLASH_SECONDS = 0.9;
const CONE_FADE_SECONDS = 8;
const MONO_FONT = '"Geist Mono Variable", ui-monospace, monospace';

function color(channels: string, alpha: number) {
  return "rgb(" + channels + " / " + alpha.toFixed(3) + ")";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distanceToSegment(point: Point, segment: Segment) {
  const deltaX = segment.to.x - segment.from.x;
  const deltaY = segment.to.y - segment.from.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  let progress = 0;
  if (lengthSquared > 0) {
    progress =
      ((point.x - segment.from.x) * deltaX +
        (point.y - segment.from.y) * deltaY) /
      lengthSquared;
    progress = clamp(progress, 0, 1);
  }
  const nearestX = segment.from.x + progress * deltaX;
  const nearestY = segment.from.y + progress * deltaY;
  return Math.hypot(point.x - nearestX, point.y - nearestY);
}

export class SpacetimeRenderer {
  trackedOrder: Journey | null = null;
  private plotTime = 0;
  private atEnd = false;
  reveal = 1;
  highlightId: number | null = null;
  pointer: Point | null = null;
  // Static (reduced motion) frames keep visitor annotations on screen.
  holdAnnotations = false;

  private context: CanvasRenderingContext2D;
  private layout: Layout;
  private segments: Segment[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private model: SpacetimeModel,
    private labels: SpacetimeLabels,
  ) {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D is unavailable");
    }
    this.context = context;
    this.layout = this.computeLayout(canvas.clientWidth, canvas.clientHeight);
  }

  setLabels(labels: SpacetimeLabels) {
    this.labels = labels;
  }

  resize(width: number, height: number) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.layout = this.computeLayout(width, height);
  }

  // Returns the journey whose drawn signal is closest to the pointer.
  pick(point: Point) {
    if (point.x < this.layout.plotStart || point.x > this.layout.nowAt) {
      return null;
    }
    let nearestId: number | null = null;
    let nearestDistance = PICK_RADIUS_PX;
    for (const segment of this.segments) {
      const distance = distanceToSegment(point, segment);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = segment.journeyId;
      }
    }
    if (nearestId === null) {
      return null;
    }
    if (this.trackedOrder?.id === nearestId) {
      return this.trackedOrder;
    }
    for (const journey of this.model.journeys) {
      if (journey.id === nearestId) {
        return journey;
      }
    }
    return null;
  }

  draw() {
    const { width, height } = this.layout;
    if (!width || !height) {
      return;
    }
    // Keep a completed visitor order available for inspection after the model drops old traffic.
    this.plotTime = this.model.now;
    this.atEnd = false;
    if (this.trackedOrder && !orderInProgress(this.trackedOrder)) {
      const end = this.trackedOrder.lastActivity + FLASH_SECONDS;
      this.plotTime = Math.min(this.plotTime, end);
      this.atEnd = this.plotTime === end;
    }
    const ratio = this.canvas.width / width;
    const context = this.context;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    this.segments = [];

    this.drawGrid();
    context.save();
    this.clipToReveal();
    const focus = this.trackedOrder ?? this.focusedJourney();
    if (focus) {
      this.drawCone(focus);
    }
    let backgroundEmphasis = 0.75;
    if (focus) {
      backgroundEmphasis = 0.22;
    }
    this.drawLanes();
    if (!this.trackedOrder) {
      for (const journey of this.model.journeys) {
        if (journey !== focus) {
          this.drawJourney(journey, backgroundEmphasis);
        }
      }
    }
    if (focus) {
      this.drawJourney(focus, 1.25);
      this.drawAnnotations(focus);
    }
    context.restore();
    this.drawNowLine();
    this.drawLaneLabels();
  }

  private computeLayout(width: number, height: number): Layout {
    const nowAt = width - 22;
    let plotStart = 118;
    if (width < COMPACT_PLOT_WIDTH) {
      plotStart = 93;
    }
    return {
      width,
      height,
      plotStart,
      spaceStart: 34,
      spaceLength: Math.max(1, height - 92),
      nowAt,
      speed: Math.max(1, nowAt - plotStart) / HISTORY_SECONDS,
    };
  }

  private point(position: number, time: number): Point {
    const layout = this.layout;
    const space = layout.spaceStart + position * layout.spaceLength;
    const age = this.plotTime - time;
    return { x: layout.nowAt - age * layout.speed, y: space };
  }

  // Keep annotations on the order being inspected, or the last test order still on the plot.
  private focusedJourney() {
    let lastOrder: Journey | undefined;
    for (const journey of this.model.journeys) {
      if (journey.id === this.highlightId) {
        return journey;
      }
      if (
        journey.origin !== "ambient" &&
        journey.lastActivity >= this.plotTime - HISTORY_SECONDS
      ) {
        lastOrder = journey;
      }
    }
    return lastOrder;
  }

  private revealEase() {
    return 1 - (1 - this.reveal) ** 3;
  }

  private clipToReveal() {
    const layout = this.layout;
    const progress = this.revealEase();
    this.context.beginPath();
    const visibleWidth = (layout.nowAt - layout.plotStart) * progress;
    this.context.rect(
      layout.nowAt - visibleWidth,
      0,
      visibleWidth + 6,
      layout.height - 35,
    );
    this.context.clip();
  }

  // The guide lines share the time scale with the tick labels and the signals.
  private drawGrid() {
    const layout = this.layout;
    const context = this.context;
    const relayY = this.point(LANE_POSITION.relay, this.plotTime).y;
    context.fillStyle = color(PHOTON, 0.055);
    context.fillRect(0, relayY - 15, layout.width, 30);
    context.fillStyle = color(BONE, 0.1);
    for (let second = 1; second <= HISTORY_SECONDS; second++) {
      const x = layout.nowAt - second * layout.speed;
      context.fillRect(Math.round(x), 12, 1, layout.height - 44);
    }
    if (
      this.pointer &&
      this.pointer.x >= layout.plotStart &&
      this.pointer.x <= layout.nowAt
    ) {
      context.fillStyle = color(PHOTON, 0.45);
      context.fillRect(Math.round(this.pointer.x), 12, 1, layout.height - 44);
    }
  }

  // Only the scripted and visitor events get a (faint) light cone.
  private drawCone(journey: Journey) {
    if (!journey.accepted || journey.origin === "ambient") {
      return;
    }
    const age = this.plotTime - journey.arrivesAt;
    if (age <= 0 || age > CONE_FADE_SECONDS) {
      return;
    }
    const fade = 1 - age / CONE_FADE_SECONDS;
    const reach = Math.min(age / CROSS_SECONDS, 1.2);
    const apex = this.point(LANE_POSITION.relay, journey.arrivesAt);
    const near = this.point(LANE_POSITION.relay - reach, this.plotTime);
    const far = this.point(LANE_POSITION.relay + reach, this.plotTime);
    const layout = this.layout;
    const context = this.context;
    context.save();
    context.beginPath();
    context.rect(
      layout.plotStart,
      layout.spaceStart,
      layout.nowAt - layout.plotStart,
      layout.spaceLength,
    );
    context.clip();
    context.beginPath();
    context.moveTo(apex.x, apex.y);
    context.lineTo(near.x, near.y);
    context.lineTo(far.x, far.y);
    context.closePath();
    context.fillStyle = color(PHOTON, 0.05 * fade);
    context.fill();
    context.restore();
  }

  private drawLanes() {
    const layout = this.layout;
    const context = this.context;
    const lanes: {
      position: number;
      channels: string;
      alpha: number;
      dashed: boolean;
    }[] = [
      {
        position: LANE_POSITION.sender,
        channels: BONE,
        alpha: 0.22,
        dashed: false,
      },
    ];
    for (const endpoint of ENDPOINTS) {
      const online = this.model.online[endpoint];
      if (online) {
        lanes.push({
          position: LANE_POSITION[endpoint],
          channels: BONE,
          alpha: 0.22,
          dashed: false,
        });
      } else {
        lanes.push({
          position: LANE_POSITION[endpoint],
          channels: FAILED,
          alpha: 0.55,
          dashed: true,
        });
      }
    }
    for (const lane of lanes) {
      context.setLineDash([]);
      if (lane.dashed) {
        context.setLineDash([3, 5]);
      }
      this.strokeLane(lane.position, color(lane.channels, lane.alpha), 1);
    }
    context.setLineDash([]);
    // The relay lane is drawn as a double "horizon": every event must cross it.
    const horizonOffset = 2.5 / layout.spaceLength;
    this.strokeLane(
      LANE_POSITION.relay - horizonOffset,
      color(PHOTON, 0.55),
      1,
    );
    this.strokeLane(
      LANE_POSITION.relay + horizonOffset,
      color(PHOTON, 0.55),
      1,
    );
  }

  private strokeLane(position: number, strokeStyle: string, lineWidth: number) {
    const layout = this.layout;
    const now = this.point(position, this.plotTime);
    const context = this.context;
    context.strokeStyle = strokeStyle;
    context.lineWidth = lineWidth;
    context.beginPath();
    context.moveTo(layout.plotStart, now.y);
    context.lineTo(now.x, now.y);
    context.stroke();
  }

  private drawJourney(journey: Journey, emphasis: number) {
    const now = this.plotTime;
    const ingress = this.travel(journey.id, {
      from: LANE_POSITION.sender,
      to: LANE_POSITION.relay,
      start: journey.emittedAt,
      end: journey.arrivesAt,
      channels: BONE,
      alpha: 0.7 * emphasis,
      lineWidth: 1.2,
    });
    if (!ingress) {
      return;
    }
    if (journey.accepted === false && journey.rejectionReturnsAt !== null) {
      this.travel(journey.id, {
        from: LANE_POSITION.relay,
        to: LANE_POSITION.sender,
        start: journey.arrivesAt,
        end: journey.rejectionReturnsAt,
        channels: FAILED,
        alpha: 0.85 * emphasis,
        lineWidth: 1.2,
        dashed: true,
      });
      this.mark(
        LANE_POSITION.relay,
        journey.arrivesAt,
        FAILED,
        "cross",
        emphasis,
      );
      return;
    }
    if (journey.accepted) {
      this.flash(LANE_POSITION.relay, journey.arrivesAt, PHOTON, emphasis);
    }
    for (const delivery of journey.deliveries) {
      const endpointPosition = LANE_POSITION[delivery.endpoint];
      for (const attempt of delivery.attempts) {
        const sent = this.travel(journey.id, {
          from: LANE_POSITION.relay,
          to: endpointPosition,
          start: attempt.sentAt,
          end: attempt.arrivesAt,
          channels: PHOTON,
          alpha: 0.8 * emphasis,
          lineWidth: 1.4,
        });
        if (!sent || attempt.status === null) {
          continue;
        }
        if (attempt.returnsAt === null) {
          this.flash(endpointPosition, attempt.arrivesAt, DELIVERED, emphasis);
          this.mark(
            endpointPosition,
            attempt.arrivesAt,
            DELIVERED,
            "dot",
            emphasis,
          );
          continue;
        }
        this.mark(
          endpointPosition,
          attempt.arrivesAt,
          FAILED,
          "tick",
          emphasis,
        );
        const reflected = this.travel(journey.id, {
          from: endpointPosition,
          to: LANE_POSITION.relay,
          start: attempt.arrivesAt,
          end: attempt.returnsAt,
          channels: FAILED,
          alpha: 0.85 * emphasis,
          lineWidth: 1.2,
          dashed: true,
        });
        if (!reflected || now < attempt.returnsAt) {
          continue;
        }
        if (attempt.retryAt === null) {
          this.mark(
            LANE_POSITION.relay,
            attempt.returnsAt,
            FAILED,
            "cross",
            emphasis,
          );
          continue;
        }
        this.drawBackoff(
          journey.id,
          attempt.returnsAt,
          attempt.retryAt,
          emphasis,
        );
      }
    }
  }

  // Draws a signal from its emission to its current head. Returns false
  // while the signal has not been emitted yet.
  private travel(
    journeyId: number,
    signal: {
      from: number;
      to: number;
      start: number;
      end: number;
      channels: string;
      alpha: number;
      lineWidth: number;
      dashed?: boolean;
    },
  ) {
    const now = this.plotTime;
    if (now < signal.start) {
      return false;
    }
    let progress = 1;
    if (signal.end > signal.start) {
      progress = clamp(
        (now - signal.start) / (signal.end - signal.start),
        0,
        1,
      );
    }
    const headTime = signal.start + progress * (signal.end - signal.start);
    const headPosition = signal.from + progress * (signal.to - signal.from);
    const tail = this.point(signal.from, signal.start);
    const head = this.point(headPosition, headTime);
    const context = this.context;
    context.setLineDash([]);
    if (signal.dashed) {
      context.setLineDash([4, 4]);
    }
    context.strokeStyle = color(signal.channels, Math.min(signal.alpha, 1));
    context.lineWidth = signal.lineWidth;
    context.beginPath();
    context.moveTo(tail.x, tail.y);
    context.lineTo(head.x, head.y);
    context.stroke();
    context.setLineDash([]);
    this.segments.push({ journeyId, from: tail, to: head });
    if (progress < 1) {
      this.drawSignalHead(tail, head, signal.channels, signal.alpha);
    }
    return true;
  }

  // A short trail shows the direction of requests and returning errors on both axes.
  private drawSignalHead(
    tail: Point,
    point: Point,
    channels: string,
    emphasis: number,
  ) {
    const context = this.context;
    const alpha = Math.min(1, emphasis);
    const dx = point.x - tail.x;
    const dy = point.y - tail.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0) {
      const fraction = Math.min(1, SIGNAL_TRAIL_PX / distance);
      const startX = point.x - dx * fraction;
      const startY = point.y - dy * fraction;
      const trail = context.createLinearGradient(
        startX,
        startY,
        point.x,
        point.y,
      );
      trail.addColorStop(0, color(channels, 0));
      trail.addColorStop(1, color(channels, alpha));
      context.strokeStyle = trail;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(startX, startY);
      context.lineTo(point.x, point.y);
      context.stroke();
    }
    context.fillStyle = color(channels, alpha);
    context.beginPath();
    context.arc(point.x, point.y, 2.6, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = color(channels, 0.35 * alpha);
    context.lineWidth = 1;
    context.beginPath();
    context.arc(point.x, point.y, 6, 0, Math.PI * 2);
    context.stroke();
  }

  private flash(
    position: number,
    time: number,
    channels: string,
    emphasis: number,
  ) {
    const age = this.plotTime - time;
    if (age < 0 || age > FLASH_SECONDS) {
      return;
    }
    const progress = age / FLASH_SECONDS;
    const center = this.point(position, time);
    const context = this.context;
    context.strokeStyle = color(
      channels,
      (1 - progress) * 0.9 * Math.min(emphasis, 1),
    );
    context.lineWidth = 1.2;
    context.beginPath();
    context.arc(center.x, center.y, 4 + progress * 22, 0, Math.PI * 2);
    context.stroke();
  }

  private mark(
    position: number,
    time: number,
    channels: string,
    shape: "dot" | "tick" | "cross",
    emphasis: number,
  ) {
    if (this.plotTime < time) {
      return;
    }
    const center = this.point(position, time);
    const context = this.context;
    const alpha = Math.min(0.9 * emphasis, 1);
    context.fillStyle = color(channels, alpha);
    context.strokeStyle = color(channels, alpha);
    context.lineWidth = 1.4;
    if (shape === "dot") {
      context.beginPath();
      context.arc(center.x, center.y, 2.6, 0, Math.PI * 2);
      context.fill();
      return;
    }
    if (shape === "tick") {
      context.fillRect(center.x - 2, center.y - 2, 4, 4);
      return;
    }
    context.beginPath();
    context.moveTo(center.x - 4, center.y - 4);
    context.lineTo(center.x + 4, center.y + 4);
    context.moveTo(center.x + 4, center.y - 4);
    context.lineTo(center.x - 4, center.y + 4);
    context.stroke();
  }

  // While a retry waits, the relay holds the delivery: an amber dashed hold.
  private drawBackoff(
    journeyId: number,
    start: number,
    end: number,
    emphasis: number,
  ) {
    const now = this.plotTime;
    const visibleEnd = Math.min(now, end);
    const offset = 7 / this.layout.spaceLength;
    const from = this.point(LANE_POSITION.relay + offset, start);
    const to = this.point(LANE_POSITION.relay + offset, visibleEnd);
    const context = this.context;
    context.setLineDash([2, 3]);
    context.strokeStyle = color(RETRY, Math.min(0.95 * emphasis, 1));
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.setLineDash([]);
    this.segments.push({ journeyId, from, to });
    if (now < end) {
      this.drawSignalHead(from, to, RETRY, emphasis);
    }
  }

  private annotationsFor(journey: Journey) {
    const labels = this.labels;
    const notes: Annotation[] = [];
    if (journey.accepted === true) {
      notes.push({
        position: LANE_POSITION.relay,
        time: journey.arrivesAt,
        text: "HMAC v1 ✓ " + labels.verified,
        tone: PHOTON,
      });
    }
    if (journey.accepted === false) {
      notes.push({
        position: LANE_POSITION.relay,
        time: journey.arrivesAt,
        text: "401 · " + labels.rejected,
        tone: FAILED,
      });
    }
    for (const delivery of journey.deliveries) {
      for (const attempt of delivery.attempts) {
        if (attempt.status === null) {
          continue;
        }
        let text = attempt.status + " · " + labels.delivered;
        let tone = DELIVERED;
        if (attempt.returnsAt !== null && attempt.retryAt !== null) {
          text =
            attempt.status + " · " + labels.retry + " " + (attempt.number + 1);
          tone = RETRY;
        }
        if (attempt.returnsAt !== null && attempt.retryAt === null) {
          text = attempt.status + " · " + labels.failed;
          tone = FAILED;
        }
        notes.push({
          position: LANE_POSITION[delivery.endpoint],
          time: attempt.arrivesAt,
          text,
          tone,
        });
      }
    }
    return notes;
  }

  private drawAnnotations(journey: Journey) {
    const context = this.context;
    context.font = "500 11px " + MONO_FONT;
    context.textBaseline = "middle";
    context.textAlign = "left";
    // Each lane labels its latest visible result. Earlier attempts retain their marks.
    const latestByLane = new Map<number, Annotation>();
    for (const note of this.annotationsFor(journey)) {
      const age = this.plotTime - note.time;
      if (age >= 0 && age <= HISTORY_SECONDS) {
        latestByLane.set(note.position, note);
      }
    }
    for (const note of latestByLane.values()) {
      let alpha = 1;
      if (
        !this.trackedOrder &&
        journey.id !== this.highlightId &&
        !this.holdAnnotations
      ) {
        alpha = clamp(
          (ANNOTATION_SECONDS - (this.plotTime - note.time)) / 0.8,
          0,
          1,
        );
      }
      if (alpha > 0) {
        this.drawNote(note, alpha);
      }
    }
  }

  private drawNote(note: Annotation, alpha: number) {
    const anchor = this.point(note.position, note.time);
    const context = this.context;
    const width = context.measureText(note.text).width + 14;
    const y = anchor.y - 14;
    const x = clamp(
      anchor.x - width / 2,
      this.layout.plotStart + 2,
      this.layout.nowAt - width,
    );
    context.fillStyle = color("11 13 16", 0.82 * alpha);
    context.fillRect(x, y - 9, width, 18);
    context.strokeStyle = color(note.tone, 0.6 * alpha);
    context.lineWidth = 1;
    context.strokeRect(x + 0.5, y - 8.5, width - 1, 17);
    context.fillStyle = color(note.tone, alpha);
    context.fillText(note.text, x + 7, y + 0.5);
  }

  private drawNowLine() {
    const layout = this.layout;
    const context = this.context;
    const alpha = this.revealEase();
    const axisY = layout.height - 31;
    context.fillStyle = color(PHOTON, 0.62 * alpha);
    context.fillRect(layout.nowAt, 12, 1, axisY - 12);
    context.fillStyle = color(BONE, 0.3);
    context.fillRect(
      layout.plotStart,
      axisY,
      layout.nowAt - layout.plotStart,
      1,
    );
    context.font = "500 11px " + MONO_FONT;
    context.textBaseline = "middle";
    context.textAlign = "left";
    context.fillStyle = color(BONE, 0.72);
    context.fillText(this.labels.time, 10, axisY + 15);
    let tickInterval = 2;
    if (layout.width < COMPACT_PLOT_WIDTH) {
      tickInterval = 4;
    }
    context.textAlign = "center";
    for (
      let second = tickInterval;
      second <= HISTORY_SECONDS;
      second += tickInterval
    ) {
      const x = layout.nowAt - second * layout.speed;
      context.fillRect(Math.round(x), axisY, 1, 4);
      context.fillText("−" + second + " s", x, axisY + 15);
    }
    context.fillStyle = color(PHOTON, alpha);
    let endLabel = this.labels.now;
    if (this.atEnd) {
      endLabel = this.labels.end;
    }
    context.fillText(endLabel, layout.nowAt, axisY + 15);
  }

  private drawLaneLabels() {
    const layout = this.layout;
    const context = this.context;
    const alpha = this.revealEase();
    context.font = '550 12px "Geist Variable", system-ui, sans-serif';
    context.textAlign = "left";
    context.textBaseline = "middle";
    const labels: { position: number; text: string; channels: string }[] = [
      {
        position: LANE_POSITION.sender,
        text: this.labels.sender,
        channels: BONE,
      },
      { position: LANE_POSITION.relay, text: "RelayHub", channels: PHOTON },
    ];
    for (const endpoint of ENDPOINTS) {
      labels.push(this.endpointLabel(endpoint));
    }
    for (const label of labels) {
      const anchor = this.point(label.position, this.plotTime);
      context.fillStyle = color(label.channels, 0.92 * alpha);
      context.fillText(label.text, 10, anchor.y);
      context.beginPath();
      context.arc(layout.plotStart, anchor.y, 2.5, 0, 2 * Math.PI);
      context.fill();
    }
  }

  private endpointLabel(endpoint: Endpoint) {
    let text = this.labels.destinations[endpoint];
    if (this.model.online[endpoint]) {
      return { position: LANE_POSITION[endpoint], text, channels: BONE };
    }
    text += " ×";
    return { position: LANE_POSITION[endpoint], text, channels: FAILED };
  }
}
