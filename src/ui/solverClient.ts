// Talks to the solver Web Worker. Cancelling terminates the worker (the only way to stop
// a running computation); a fresh worker is started for the next request.

import type { SandboxDoc, SolveResult } from '../core/sandbox';

export class Cancelled extends Error {
  constructor() {
    super('Cancelled');
  }
}

export class SolverClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending: { id: number; resolve: (r: SolveResult) => void; reject: (e: Error) => void } | null = null;

  get busy(): boolean {
    return this.pending !== null;
  }

  solve(doc: SandboxDoc): Promise<SolveResult> {
    this.cancel();
    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/solver.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<{ id: number; result?: SolveResult; error?: string }>) => {
        const p = this.pending;
        if (!p || p.id !== e.data.id) return;
        this.pending = null;
        if (e.data.result) p.resolve(e.data.result);
        else p.reject(new Error(e.data.error ?? 'Solver failed'));
      };
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending = { id, resolve, reject };
      this.worker!.postMessage({ id, doc });
    });
  }

  cancel() {
    if (!this.pending) return;
    this.worker?.terminate();
    this.worker = null;
    const p = this.pending;
    this.pending = null;
    p.reject(new Cancelled());
  }

  destroy() {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
  }
}
