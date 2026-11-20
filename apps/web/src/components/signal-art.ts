export const TURN = Math.PI * 2;

const SKY_WIDTH = 960;
const SKY_HEIGHT = 640;
const CENTER = { x: 492, y: 315 };
const RADIUS = 145;
const TRACKS = [
  { radius: 232, depth: 62, tilt: -0.45, ink: "#a6e1fb", speed: 0.83 },
  { radius: 311, depth: 83, tilt: -0.44, ink: "#ff9c82", speed: -0.68 },
  { radius: 391, depth: 102, tilt: -0.42, ink: "#c7d9e9", speed: 0.47 },
] as const;
type Track = (typeof TRACKS)[number];

function drawSky(context: CanvasRenderingContext2D) {
  // A fixed low-discrepancy star map avoids flicker between animation frames.
  for (let index = 1; index < 170; index++) {
    const x = ((index * 0.754877666) % 1) * SKY_WIDTH;
    const y = ((index * 0.569840291) % 1) * SKY_HEIGHT;
    const size = 0.55 + ((index * 1.137) % 1) * 1.4;
    context.fillStyle = `rgb(190 216 234 / ${0.16 + ((index * 0.607) % 0.5)})`;
    context.fillRect(x, y, size, size);
    if (index % 37 === 0) {
      context.fillRect(x - 3, y, 7, 0.8);
      context.fillRect(x, y - 3, 0.8, 7);
    }
  }
}

function drawTrack(
  context: CanvasRenderingContext2D,
  track: Track,
  angle: number,
  front: boolean,
) {
  context.save();
  context.translate(CENTER.x, CENTER.y);
  context.rotate(track.tilt + Math.sin(angle * 0.3) * 0.025);
  let start = Math.PI;
  let end = TURN;
  if (front) {
    start = 0;
    end = Math.PI;
  }
  // Separate front and back arcs to occlude the far side behind the relay.
  context.strokeStyle = track.ink;
  for (const distance of [-4, 0, 4]) {
    context.globalAlpha = 0.17;
    context.lineWidth = 0.9;
    if (distance === 0) {
      context.globalAlpha = 0.78;
      context.lineWidth = 1.7;
    }
    context.beginPath();
    context.ellipse(
      0,
      0,
      track.radius + distance,
      track.depth + distance / 2,
      0,
      start,
      end,
    );
    context.stroke();
  }
  context.globalAlpha = 1;
  const packet = (angle * track.speed + track.depth + TURN * 8) % TURN;
  if (packet >= start && packet < end) {
    const x = Math.cos(packet) * track.radius;
    const y = Math.sin(packet) * track.depth;
    context.fillStyle = track.ink;
    context.beginPath();
    context.arc(x, y, 5, 0, TURN);
    context.fill();
    context.globalAlpha = 0.56;
    context.beginPath();
    context.arc(x, y, 10, 0, TURN);
    context.stroke();
  }
  context.restore();
}

export function paintSignal(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  angle: number,
  globe: HTMLImageElement,
) {
  if (!width || !height) {
    return;
  }
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, pixelWidth, pixelHeight);
  const scale = Math.min(pixelWidth / SKY_WIDTH, pixelHeight / SKY_HEIGHT);
  context.setTransform(
    scale,
    0,
    0,
    scale,
    (pixelWidth - scale * SKY_WIDTH) / 2,
    (pixelHeight - scale * SKY_HEIGHT) / 2,
  );
  drawSky(context);
  const halo = context.createRadialGradient(
    CENTER.x,
    CENTER.y,
    RADIUS * 0.85,
    CENTER.x,
    CENTER.y,
    RADIUS * 1.8,
  );
  halo.addColorStop(0, "#80c9ec30");
  halo.addColorStop(0.4, "#5e94b40e");
  halo.addColorStop(1, "#659ec200");
  context.fillStyle = halo;
  context.fillRect(0, 0, SKY_WIDTH, SKY_HEIGHT);
  for (const track of TRACKS) {
    drawTrack(context, track, angle, false);
  }
  if (globe.naturalWidth > 0) {
    context.drawImage(
      globe,
      CENTER.x - RADIUS,
      CENTER.y - RADIUS,
      RADIUS * 2,
      RADIUS * 2,
    );
  } else {
    context.beginPath();
    context.arc(CENTER.x, CENTER.y, RADIUS, 0, TURN);
    context.fillStyle = "#162636";
    context.fill();
  }
  for (const track of TRACKS) {
    drawTrack(context, track, angle, true);
  }
}
