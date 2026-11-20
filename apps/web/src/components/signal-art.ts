export const TURN = Math.PI * 2;
const STEPS = 96;
const FIBERS = 26;
const ROUTES = [
  {
    entry: 0.28,
    exit: 0.2,
    bend: -0.16,
    ink: ["#4c2840", "#ad6183", "#ef9e94"],
  },
  { entry: 0.46, exit: 0.47, bend: 0, ink: ["#5e2418", "#db6840", "#ffd5a2"] },
  {
    entry: 0.72,
    exit: 0.78,
    bend: 0.14,
    ink: ["#421e27", "#ba4c3a", "#f8a66e"],
  },
] as const;

type Route = (typeof ROUTES)[number];
type RibbonSample = ReturnType<typeof sampleRibbon>;

export function paintSignal(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  angle: number,
) {
  if (!width || !height) {
    return;
  }
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelsWide = Math.round(width * ratio);
  const pixelsHigh = Math.round(height * ratio);
  if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) {
    canvas.width = pixelsWide;
    canvas.height = pixelsHigh;
  }
  context.setTransform(pixelsWide / 1000, 0, 0, pixelsHigh / 650, 0, 0);
  context.clearRect(0, 0, 1000, 650);
  drawGraticule(context);

  for (const route of ROUTES) {
    drawRibbon(context, route, angle);
    drawPackets(context, route, angle);
  }
}

function drawGraticule(context: CanvasRenderingContext2D) {
  context.lineWidth = 1;
  context.strokeStyle = "#e1b8a229";
  context.beginPath();
  for (let column = 55; column < 1000; column += 74) {
    for (let row = 62; row < 630; row += 74) {
      context.moveTo(column - 2, row);
      context.lineTo(column + 2, row);
      context.moveTo(column, row - 2);
      context.lineTo(column, row + 2);
    }
  }
  context.stroke();

  context.beginPath();
  context.ellipse(552, 325, 256, 232, -0.4, 0, TURN);
  context.stroke();
  context.beginPath();
  context.ellipse(552, 325, 295, 267, -0.4, 0, TURN);
  context.stroke();
}

function traceRibbon(
  context: CanvasRenderingContext2D,
  samples: RibbonSample[],
  fiber: number,
  reverse: boolean,
) {
  for (let index = 0; index <= STEPS; index += 1) {
    let sampleIndex = index;
    if (reverse) {
      sampleIndex = STEPS - index;
    }
    const point = fiberPoint(samples[sampleIndex], fiber);
    if (index === 0 && !reverse) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  }
}

function drawRibbon(
  context: CanvasRenderingContext2D,
  route: Route,
  angle: number,
) {
  const [shadow, metal, highlight] = route.ink;
  const foil = context.createLinearGradient(45, 485, 917, 178);
  foil.addColorStop(0, shadow);
  foil.addColorStop(0.34, metal);
  foil.addColorStop(0.51, shadow);
  foil.addColorStop(0.64, highlight);
  foil.addColorStop(0.79, metal);
  foil.addColorStop(1, shadow);

  // All fibers use one centerline and one cross-section per sample.
  const samples = [];
  for (let index = 0; index <= STEPS; index += 1) {
    samples.push(sampleRibbon(route, index / STEPS, angle));
  }
  context.beginPath();
  traceRibbon(context, samples, -1, false);
  traceRibbon(context, samples, 1, true);
  context.closePath();
  context.fillStyle = foil;
  context.fill();

  for (let index = 0; index <= FIBERS; index += 1) {
    const fiber = (index / FIBERS) * 2 - 1;
    context.beginPath();
    traceRibbon(context, samples, fiber, false);
    context.strokeStyle = highlight;
    context.globalAlpha = 0.26 + 0.11 * Math.cos(index * 2.4);
    context.lineWidth = 0.8;
    context.stroke();
  }
  context.globalAlpha = 1;
}

function sampleRibbon(route: Route, progress: number, angle: number) {
  const inverse = 1 - progress;
  const centerX = 28 + 942 * progress;
  const centerY =
    650 *
    (inverse ** 3 * route.entry +
      3 * inverse ** 2 * progress * (0.92 + route.bend) +
      3 * inverse * progress ** 2 * (0.02 + route.bend) +
      progress ** 3 * route.exit);
  const envelope = Math.sin(Math.PI * progress);
  const wave = Math.sin(progress * TURN * 1.5 - angle) * envelope;
  const fold = Math.cos(progress * TURN * 1.55 + route.bend * 5 + wave * 0.45);
  const width = 6 + 70 * envelope ** 2;
  return {
    x: centerX,
    y: centerY + wave * 13,
    acrossX: width * Math.sin(progress * TURN * 1.55) * 0.74,
    acrossY: width * fold,
  };
}

function fiberPoint(sample: RibbonSample, fiber: number) {
  return {
    x: sample.x + sample.acrossX * fiber,
    y: sample.y + sample.acrossY * fiber,
  };
}

function drawPackets(
  context: CanvasRenderingContext2D,
  route: Route,
  angle: number,
) {
  context.save();
  context.lineCap = "round";
  context.strokeStyle = "#fff3d3";
  context.lineWidth = 2.2;
  for (let index = 0; index < 3; index += 1) {
    const progress =
      ((((angle / TURN) * 4 + index / 3 + route.exit) % 1) + 1) % 1;
    const fiber = 0.48 - index * 0.44;
    const start = fiberPoint(sampleRibbon(route, progress, angle), fiber);
    const endProgress = Math.min(progress + 0.028, 1);
    const end = fiberPoint(sampleRibbon(route, endProgress, angle), fiber);
    context.globalAlpha = Math.sin(Math.PI * progress);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }
  for (const progress of [0, 1]) {
    const point = sampleRibbon(route, progress, angle);
    context.globalAlpha = 1;
    context.fillStyle = route.ink[2];
    context.fillRect(point.x - 3, point.y - 3, 6, 6);
  }
  context.restore();
}
