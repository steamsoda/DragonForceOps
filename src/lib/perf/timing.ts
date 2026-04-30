type Segment = {
  name: string;
  ms: number;
};

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function createPerfTimer(label: string) {
  const startedAt = now();
  let segmentStartedAt = startedAt;
  const segments: Segment[] = [];

  return {
    mark(name: string) {
      const current = now();
      segments.push({ name, ms: Math.round(current - segmentStartedAt) });
      segmentStartedAt = current;
    },
    end(metadata: Record<string, unknown> = {}) {
      const endedAt = now();
      const totalMs = Math.round(endedAt - startedAt);
      console.info("[perf]", label, {
        totalMs,
        segments,
        ...metadata,
      });
    },
  };
}
