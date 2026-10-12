// Runs the exact solvers off the main thread so the Sandbox UI never freezes.
// Message in: { id, doc }. Message out: { id, result } or { id, error }.

import { solveDoc, type SandboxDoc } from '../core/sandbox';

const ctx = self as unknown as { postMessage: (msg: unknown) => void; onmessage: ((e: MessageEvent) => void) | null };

ctx.onmessage = (e: MessageEvent<{ id: number; doc: SandboxDoc }>) => {
  const { id, doc } = e.data;
  try {
    ctx.postMessage({ id, result: solveDoc(doc) });
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
