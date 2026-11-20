import {
  CROSS_SECONDS,
  ENDPOINTS,
  LANE_POSITION,
  type Endpoint,
  type Journey,
  type SpacetimeModel,
} from "./spacetime-model";

export type SpacetimeLabels = {
  sender: string;
  relay: string;
  endpoint: string;
  offline: string;
  now: string;
  verified: string;
  rejected: string;
  delivered: string;
  retry: string;
  failed: string;
};

type Point = { x: number; y: number };
type Segment = { journeyId: number; from: Point; to: Point };
type Layout = {
  horizontal: boolean;
  width: number;
  height: number;
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

const LATTICE_CELL_PX = 30;
const LENS_RADIUS_PX = 170;
const PICK_RADIUS_PX = 22;
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
  reveal = 1;
  highlightId: number | null = null;
  pointer: Point | null = null;
  // Wide screens draw time left → right; phones draw it top → bottom.
  horizontal = true;
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

  get isVertical() {
    return !this.layout.horizontal;
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
    const ratio = this.canvas.width / width;
    const context = this.context;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    this.segments = [];

    this.drawLattice();
    context.save();
    this.clipToReveal();
    for (const journey of this.model.journeys) {
      this.drawCone(journey);
    }
    this.drawLanes();
    let highlighted: Journey | null = null;
    for (const journey of this.model.journeys) {
      if (journey.id === this.highlightId) {
        highlighted = journey;
        continue;
      }
      this.drawJourney(journey, this.dimFactor());
    }
    if (highlighted) {
      this.drawJourney(highlighted, 1.35);
    }
    this.drawAnnotations();
    context.restore();
    this.drawNowLine();
    this.drawLaneLabels();
    this.fadeHistoryEdge();
  }

  private computeLayout(width: number, height: number): Layout {
    if (this.horizontal) {
      // The lower third stays free for the controls and the visitor log.
      const spaceLength = height * 0.5;
      return {
        horizontal: true,
        width,
        height,
        spaceStart: height * 0.15,
        spaceLength,
        nowAt: width * 0.82,
        speed: spaceLength / CROSS_SECONDS,
      };
    }
    const spaceLength = width * 0.76;
    return {
      horizontal: false,
      width,
      height,
      spaceStart: width * 0.12,
      spaceLength,
      nowAt: height * 0.16,
      speed: spaceLength / CROSS_SECONDS,
    };
  }

  private point(position: number, time: number): Point {
    const layout = this.layout;
    const space = layout.spaceStart + position * layout.spaceLength;
    const age = this.model.now - time;
    if (layout.horizontal) {
      return { x: layout.nowAt - age * layout.speed, y: space };
    }
    return { x: space, y: layout.nowAt + age * layout.speed };
  }

  private dimFactor() {
    if (this.highlightId === null) {
      return 1;
    }
    return 0.32;
  }

  private revealEase() {
    return 1 - (1 - this.reveal) ** 3;
  }

  private clipToReveal() {
    const layout = this.layout;
    const progress = this.revealEase();
    this.context.beginPath();
    if (layout.horizontal) {
      const left = layout.nowAt * (1 - progress) - 2;
      this.context.rect(left, 0, layout.width - left, layout.height);
    } else {
      const bottom =
        layout.nowAt + progress * (layout.height - layout.nowAt) + 2;
      this.context.rect(0, 0, layout.width, bottom);
    }
    this.context.clip();
  }

  // A diamond lattice of null coordinates drifts with time, like a slow sky.
  private drawLattice() {
    const layout = this.layout;
    const context = this.context;
    const half = LATTICE_CELL_PX / 2;
    const drift = (this.model.now * layout.speed) % LATTICE_CELL_PX;
    const baseAlpha = 0.08 * this.revealEase();
    for (let row = -1; row * half < layout.height + half; row++) {
      for (
        let column = -2;
        column * half < layout.width + LATTICE_CELL_PX;
        column++
      ) {
        if ((row + column) % 2 !== 0) {
          continue;
        }
        let x = column * half;
        let y = row * half;
        if (layout.horizontal) {
          x -= drift;
        } else {
          y += drift;
        }
        let alpha = baseAlpha;
        let size = 1.1;
        if (this.pointer) {
          const distance = Math.hypot(x - this.pointer.x, y - this.pointer.y);
          if (distance < LENS_RADIUS_PX) {
            const strength = 1 - distance / LENS_RADIUS_PX;
            alpha += strength * 0.3;
            size += strength * 0.6;
          }
        }
        context.fillStyle = color(BONE, alpha);
        context.fillRect(x - size / 2, y - size / 2, size, size);
      }
    }
  }

  // Only the scripted and visitor events get a (faint) light cone.
  private drawCone(journey: Journey) {
    if (!journey.accepted || journey.origin === "ambient") {
      return;
    }
    const age = this.model.now - journey.arrivesAt;
    if (age <= 0 || age > CONE_FADE_SECONDS) {
      return;
    }
    const fade = 1 - age / CONE_FADE_SECONDS;
    const reach = Math.min(age / CROSS_SECONDS, 1.2);
    const apex = this.point(LANE_POSITION.relay, journey.arrivesAt);
    const near = this.point(LANE_POSITION.relay - reach, this.model.now);
    const far = this.point(LANE_POSITION.relay + reach, this.model.now);
    const layout = this.layout;
    const context = this.context;
    context.save();
    context.beginPath();
    if (layout.horizontal) {
      context.rect(0, layout.spaceStart, layout.width, layout.spaceLength);
    } else {
      context.rect(layout.spaceStart, 0, layout.spaceLength, layout.height);
    }
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
    const now = this.point(position, this.model.now);
    const context = this.context;
    context.strokeStyle = strokeStyle;
    context.lineWidth = lineWidth;
    context.beginPath();
    if (layout.horizontal) {
      context.moveTo(0, now.y);
      context.lineTo(now.x, now.y);
    } else {
      context.moveTo(now.x, layout.height);
      context.lineTo(now.x, now.y);
    }
    context.stroke();
  }

  private drawJourney(journey: Journey, emphasis: number) {
    const now = this.model.now;
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
    const now = this.model.now;
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
      this.glow(head, signal.channels);
    }
    return true;
  }

  // The head of a signal in flight: a plain dot with a thin ring, no glow.
  private glow(point: Point, channels: string) {
    const context = this.context;
    context.fillStyle = color(channels, 1);
    context.beginPath();
    context.arc(point.x, point.y, 2.6, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = color(channels, 0.35);
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
    const age = this.model.now - time;
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
    if (this.model.now < time) {
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
    const now = this.model.now;
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
      this.glow(to, RETRY);
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

  private drawAnnotations() {
    const context = this.context;
    context.font = "500 11px " + MONO_FONT;
    context.textBaseline = "middle";
    context.textAlign = "left";
    for (const journey of this.model.journeys) {
      const highlighted = journey.id === this.highlightId;
      if (journey.origin === "ambient" && !highlighted) {
        continue;
      }
      for (const note of this.annotationsFor(journey)) {
        const age = this.model.now - note.time;
        if (age < 0) {
          continue;
        }
        let alpha = 1;
        if (!highlighted && !this.holdAnnotations) {
          if (age > ANNOTATION_SECONDS) {
            continue;
          }
          alpha = clamp((ANNOTATION_SECONDS - age) / 0.8, 0, 1);
        }
        this.drawNote(note, alpha);
      }
    }
  }

  private drawNote(note: Annotation, alpha: number) {
    const anchor = this.point(note.position, note.time);
    const context = this.context;
    const width = context.measureText(note.text).width + 14;
    let x = anchor.x + 9;
    let y = anchor.y - 16;
    if (!this.layout.horizontal) {
      x = anchor.x - width - 8;
      y = anchor.y - 12;
      if (x < 4) {
        x = anchor.x + 10;
      }
    }
    x = clamp(x, 4, this.layout.width - width - 4);
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
    const start = this.point(-0.08, this.model.now);
    const end = this.point(1.08, this.model.now);
    context.strokeStyle = color(BONE, 0.55 * alpha);
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();

    context.font = "500 10px " + MONO_FONT;
    context.fillStyle = color(BONE, 0.62 * alpha);
    context.textBaseline = "middle";
    // Second marks: the time axis ruler, measured back from now.
    for (let second = 1; second <= 12; second++) {
      const mark = this.point(1.08, this.model.now - second);
      if (mark.x < 0 || mark.y > layout.height) {
        break;
      }
      const tickLength = 4;
      context.fillStyle = color(BONE, 0.32 * alpha);
      if (layout.horizontal) {
        context.fillRect(mark.x, mark.y - tickLength, 1, tickLength);
      } else {
        context.fillRect(mark.x, mark.y, tickLength, 1);
      }
      if (second % 2 === 0) {
        context.fillStyle = color(BONE, 0.45 * alpha);
        if (layout.horizontal) {
          context.textAlign = "center";
          context.fillText("−" + second + " s", mark.x, mark.y + 9);
        } else {
          context.textAlign = "right";
          context.fillText("−" + second + "s", layout.width - 2, mark.y);
        }
      }
    }
    context.fillStyle = color(PHOTON, alpha);
    if (layout.horizontal) {
      context.textAlign = "center";
      context.fillText(this.labels.now.toUpperCase(), end.x, end.y + 9);
    } else {
      context.textAlign = "right";
      context.fillText(
        this.labels.now.toUpperCase(),
        layout.width - 2,
        start.y - 10,
      );
    }
  }

  private drawLaneLabels() {
    const layout = this.layout;
    const context = this.context;
    const alpha = this.revealEase();
    context.font = "600 10.5px " + MONO_FONT;
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
      const anchor = this.point(label.position, this.model.now);
      context.fillStyle = color(label.channels, 0.92 * alpha);
      if (layout.horizontal) {
        context.textAlign = "left";
        context.fillText(label.text.toUpperCase(), anchor.x + 14, anchor.y);
      } else {
        context.textAlign = "center";
        context.fillText(label.text.toUpperCase(), anchor.x, anchor.y - 28);
      }
    }
  }

  private endpointLabel(endpoint: Endpoint) {
    const letter = endpoint.toUpperCase();
    let text = this.labels.endpoint + " " + letter;
    if (!this.layout.horizontal) {
      text = letter;
    }
    if (this.model.online[endpoint]) {
      return { position: LANE_POSITION[endpoint], text, channels: BONE };
    }
    if (this.layout.horizontal) {
      text += " · " + this.labels.offline;
    } else {
      text += "×";
    }
    return { position: LANE_POSITION[endpoint], text, channels: FAILED };
  }

  // Erases the oldest history so the diagram dissolves into the page.
  private fadeHistoryEdge() {
    const layout = this.layout;
    const context = this.context;
    context.save();
    context.globalCompositeOperation = "destination-out";
    let fade: CanvasGradient;
    if (layout.horizontal) {
      // Strong under the headline (left), clear around "now" (right).
      fade = context.createLinearGradient(0, 0, layout.width * 0.62, 0);
      fade.addColorStop(0, "rgb(0 0 0 / 0.97)");
      fade.addColorStop(0.62, "rgb(0 0 0 / 0.82)");
      fade.addColorStop(1, "rgb(0 0 0 / 0)");
      context.fillStyle = fade;
      context.fillRect(0, 0, layout.width * 0.62, layout.height);
    } else {
      const start = layout.height * 0.72;
      fade = context.createLinearGradient(0, start, 0, layout.height);
      fade.addColorStop(0, "rgb(0 0 0 / 0)");
      fade.addColorStop(1, "rgb(0 0 0 / 0.9)");
      context.fillStyle = fade;
      context.fillRect(0, start, layout.width, layout.height - start);
    }
    context.restore();
  }
}
