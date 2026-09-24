export const TaskStatus = Object.freeze({
  QUEUED: 'queued', RUNNING: 'running', WAITING: 'waiting_for_quota', COMPLETED: 'completed', FAILED: 'failed', CANCELLED: 'cancelled'
});
export const StepStatus = Object.freeze({
  QUEUED: 'queued', RUNNING: 'running', WAITING: 'waiting_for_quota', COMPLETED: 'completed', FAILED: 'failed', SKIPPED: 'skipped'
});

export class InMemoryTaskStore {
  constructor(snapshot = null) {
    this.tasks = new Map(); this.seq = 1;
    if (snapshot) this.import(snapshot);
  }
  createTask(input) {
    const id = this.seq++;
    const task = {
      id, title: input.title, instruction: input.instruction, status: TaskStatus.QUEUED,
      createdAt: Date.now(), updatedAt: Date.now(), wakeAt: null, error: null,
      maxProviderCalls: input.maxProviderCalls ?? 20, providerCalls: 0,
      maxRuntimeMs: input.maxRuntimeMs ?? 30 * 60_000,
      steps: input.steps.map((s, i) => ({ id: `${id}:${i+1}`, stepIndex: i+1, botId: s.botId, instruction: s.instruction, status: StepStatus.QUEUED, output: null, error: null, attempts: 0, claimedBy: null, leaseUntil: null }))
    };
    this.tasks.set(id, task); return structuredClone(task);
  }
  get(id) { const t = this.tasks.get(id); return t ? structuredClone(t) : null; }
  mutate(id, fn) { const t = this.tasks.get(id); if (!t) return null; fn(t); t.updatedAt = Date.now(); return structuredClone(t); }
  list() { return [...this.tasks.values()].map((x) => structuredClone(x)); }
  export() { return { seq: this.seq, tasks: [...this.tasks.entries()] }; }
  import(s) { this.seq = s.seq; this.tasks = new Map(s.tasks); }
}

export class BackgroundTaskEngine {
  constructor({ store, router, contextBuilder, now = () => Date.now(), workerId = 'worker-1', leaseMs = 60_000, maxStepAttempts = 4 } = {}) {
    this.store = store; this.router = router; this.contextBuilder = contextBuilder || (async () => ({})); this.now = now; this.workerId = workerId; this.leaseMs = leaseMs; this.maxStepAttempts = maxStepAttempts;
  }

  findRunnableTask() {
    return this.store.list().find((t) => {
      if ([TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED].includes(t.status)) return false;
      if (t.status === TaskStatus.WAITING && t.wakeAt && t.wakeAt > this.now()) return false;
      return t.steps.some((s) => s.status !== StepStatus.COMPLETED && s.status !== StepStatus.SKIPPED);
    }) || null;
  }

  claimNextStep(taskId) {
    let claimed = null;
    this.store.mutate(taskId, (t) => {
      if (t.status === TaskStatus.WAITING && (!t.wakeAt || t.wakeAt <= this.now())) { t.status = TaskStatus.QUEUED; t.wakeAt = null; }
      const next = t.steps.find((s) => s.status !== StepStatus.COMPLETED && s.status !== StepStatus.SKIPPED);
      if (!next) return;
      if (next.claimedBy && next.leaseUntil && next.leaseUntil > this.now() && next.claimedBy !== this.workerId) return;
      next.claimedBy = this.workerId; next.leaseUntil = this.now() + this.leaseMs; next.status = StepStatus.RUNNING; next.attempts += 1;
      t.status = TaskStatus.RUNNING;
      claimed = { ...next };
    });
    return claimed;
  }

  async runNext() {
    const task = this.findRunnableTask();
    if (!task) return null;
    const step = this.claimNextStep(task.id);
    if (!step) return null;

    const fresh = this.store.get(task.id);
    const previous = fresh.steps.filter((s) => s.stepIndex < step.stepIndex && s.status === StepStatus.COMPLETED).map((s) => ({ botId: s.botId, output: s.output }));
    const context = await this.contextBuilder({ task: fresh, step, previous });
    const requestId = `task:${fresh.id}:step:${step.stepIndex}:attempt:${step.attempts}`;

    if (fresh.providerCalls >= fresh.maxProviderCalls) {
      this.failStep(fresh.id, step.id, 'Task provider-call budget exceeded');
      return this.store.get(fresh.id);
    }

    try {
      this.store.mutate(fresh.id, (t) => { t.providerCalls += 1; });
      const result = await this.router.execute({
        requestId,
        input: context.input || `${fresh.instruction}\n\n${step.instruction}`,
        messages: context.messages,
        estimatedTokens: context.estimatedTokens || 1000,
        requirements: context.requirements,
        hasImage: context.hasImage,
        hasPdf: context.hasPdf,
        longContext: context.longContext,
        privacy: context.privacy,
      });
      this.store.mutate(fresh.id, (t) => {
        const s = t.steps.find((x) => x.id === step.id);
        s.status = StepStatus.COMPLETED; s.output = result.text; s.error = null; s.claimedBy = null; s.leaseUntil = null;
        const done = t.steps.every((x) => x.status === StepStatus.COMPLETED || x.status === StepStatus.SKIPPED);
        t.status = done ? TaskStatus.COMPLETED : TaskStatus.QUEUED;
        t.wakeAt = null; t.error = null;
      });
    } catch (error) {
      if (error?.code === 'NO_FREE_PROVIDER' && error.nextAt) {
        this.store.mutate(fresh.id, (t) => {
          const s = t.steps.find((x) => x.id === step.id);
          s.status = StepStatus.WAITING; s.error = null; s.claimedBy = null; s.leaseUntil = null;
          t.status = TaskStatus.WAITING; t.wakeAt = error.nextAt; t.error = null;
        });
      } else if (step.attempts < this.maxStepAttempts) {
        this.store.mutate(fresh.id, (t) => {
          const s = t.steps.find((x) => x.id === step.id);
          s.status = StepStatus.QUEUED; s.error = String(error?.message || error); s.claimedBy = null; s.leaseUntil = null;
          t.status = TaskStatus.QUEUED;
        });
      } else {
        this.failStep(fresh.id, step.id, String(error?.message || error));
      }
    }
    return this.store.get(fresh.id);
  }

  failStep(taskId, stepId, message) {
    this.store.mutate(taskId, (t) => {
      const s = t.steps.find((x) => x.id === stepId);
      if (s) { s.status = StepStatus.FAILED; s.error = message; s.claimedBy = null; s.leaseUntil = null; }
      t.status = TaskStatus.FAILED; t.error = message;
    });
  }

  async runTaskUntilIdle(taskId, maxTicks = 100) {
    let ticks = 0;
    while (ticks++ < maxTicks) {
      const before = this.store.get(taskId);
      if (!before || [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED, TaskStatus.WAITING].includes(before.status)) return before;
      await this.runNext();
    }
    return this.store.get(taskId);
  }
}
