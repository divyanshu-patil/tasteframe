// A procedurally drawn "dusk" photo, so anyone can try the full flow without their own image.
import { rng } from "./story/draw";

export function drawSample(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#2c2f4a");
  sky.addColorStop(0.45, "#c9756b");
  sky.addColorStop(0.7, "#f2b47a");
  sky.addColorStop(1, "#f6d7a7");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const sun = ctx.createRadialGradient(w * 0.62, h * 0.6, 0, w * 0.62, h * 0.6, w * 0.5);
  sun.addColorStop(0, "rgba(255,236,190,1)");
  sun.addColorStop(0.12, "rgba(255,214,150,0.95)");
  sun.addColorStop(1, "rgba(255,190,120,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);
  const rand = rng(1234);
  const ridge = (base: number, amp: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += w / 24) ctx.lineTo(x, h * base - rand() * h * amp);
    ctx.lineTo(w, h);
    ctx.fill();
  };
  ridge(0.72, 0.06, "#6e4a5c");
  ridge(0.8, 0.05, "#3e2c3d");
  ridge(0.9, 0.04, "#1c1520");
  ctx.strokeStyle = "rgba(28,21,32,0.8)";
  ctx.lineWidth = w / 400;
  for (let i = 0; i < 6; i++) {
    const x = w * (0.2 + rand() * 0.5);
    const y = h * (0.2 + rand() * 0.25);
    const s = w * (0.012 + rand() * 0.012);
    ctx.beginPath();
    ctx.moveTo(x - s, y - s * 0.4);
    ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.6, x, y);
    ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.6, x + s, y - s * 0.4);
    ctx.stroke();
  }
}

export async function sampleFile(): Promise<File> {
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1440;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  drawSample(ctx, c.width, c.height);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.9));
  if (!blob) throw new Error("Could not create sample");
  return new File([blob], "sample-dusk.jpg", { type: "image/jpeg" });
}
