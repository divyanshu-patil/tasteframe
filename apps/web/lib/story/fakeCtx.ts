// Minimal recording stand-in for CanvasRenderingContext2D (Node has no canvas).
export function fakeCtx(): { ctx: CanvasRenderingContext2D; calls: string[]; texts: string[] } {
  const calls: string[] = [];
  const texts: string[] = [];
  const state: Record<string | symbol, unknown> = { font: "10px serif" };
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === "measureText") {
        return (t: string) => {
          const size = Number(/(\d+)px/.exec(String(target.font))?.[1] ?? 10);
          return { width: t.length * size * 0.5 };
        };
      }
      if (prop === "createLinearGradient" || prop === "createRadialGradient") {
        return () => ({ addColorStop: () => undefined });
      }
      if (prop === "createPattern") return () => null;
      return (...args: unknown[]) => {
        calls.push(String(prop));
        if (prop === "fillText" || prop === "strokeText") texts.push(String(args[0]));
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, texts };
}
