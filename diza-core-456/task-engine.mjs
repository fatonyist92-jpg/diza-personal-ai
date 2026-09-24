export const TaskStatus = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  WAITING: 'waiting_for_quota',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
});
export const StepStatus = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  WAITING: 'waiting_for_quota',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
});

export class InMemoryTaskStore {
  constructor(snapshot = null) {
    this.tasks = new Map();
    this.seq = 1;
    if (snapshot) this.import(snapshot);
  }

  createTask(input) {
    const id = this.seq++;
    const now=Date.now();
    const task = {
      id,
      title: input.title,
      instruction: input.instruction,
      status: TaskStatus.QUEUED,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      wakeAt: null,
      error: null,
      maxProviderCalls: input.maxProviderCalls ?? 20,
      providerCalls: 0,
      maxRuntimeMs: input.maxRuntimeMs ?? 30 * 60_000,
      activeRuntimeMs: 0,
      steps: input.steps.map((s, i) => ({
        id: id+':'+(i+1),
        stepIndex: i+1,
        botId: s.botId,
        instruction: s.instruction,
        status: StepStatus.QUEUED,
        output: null,
        error: null,
        attempts: 0,
        claimedBy: null,
        leaseUntil: null
      }))
    };
    this.tasks.set(id, task);
    return structuredClone(task);
  }

  get(id) {
    const t = this.tasks.get(id);
    return t ? structuredClone(t) : null;
  }

  mutate(id, fn) {
    const t = this.tasks.get(id);
    if (!t) return null;
    fn(t);
    t.updatedAt = Date.now();
    return structuredClone(t);
  }

  list() {
    return [...this.tasks.values()].map((x) => structuredClone(x));
  }

  export() {
    return { seq: this.seq, tasks: [...this.tasks.entries()] };
  }

  import(s) {
    this.seq = s.seq;
    this.tasks = new Map(s.tasks);
  }
}

export class BackgroundTaskEngine {
  constructor({
    store,
    router,
    contextBuilder,
    now = () => Date.now(),
    workerId = 'worker-1',
    leaseMs = 60_000,
    maxStepAttempts = 4
  } = {}) {
    this.store = store;
    this.router = router;
    this.contextBuilder = contextBuilder || (async () => ({}));
    this.now = now;
    this.workerId = workerId;
    this.leaseMs = leaseMs;
    this.maxStepAttempts = maxStepAttempts;
  }

  findRunnableTask() {
    return this.store.list().find((t) => {
      if ([TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED].includes(t.status)) return false;
      if (t.status === TaskStatus.WAITING && t.wakeAt && t.wakeAt > this.now()) return false;
      return t.steps.some((s) => s.status !== StepStatus.COMPLETED && s.status !== StepStatus.SKIPPED);
    }) || null;
  }

  cancelTask(taskId, reason='Cancelled by user') {
    return this.store.mutate(taskId, (t) => {
      if ([TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED].includes(t.status)) return;
      t.status=TaskStatus.CANCELLED;
      t.cancelledAt=this.now();
      t.wakeAt=null;
      t.error=reason;
      for(const s of t.steps){
        if(s.status!==StepStatus.COMPLETED){
          s.status=StepStatus.SKIPPED;
          s.error=reason;
          s.claimedBy=null;
          s.leaseUntil=null;
        }
      }
    });
  }

  runtimeExceeded(task) {
    return Number(task.activeRuntimeMs||0) >= Number(task.maxRuntimeMs||Infinity);
  }

  claimNextStep(taskId) {
    let claimed = null;
    this.store.mutate(taskId, (t) => {
      if ([TaskStatus.CANCELLED,TaskStatus.COMPLETED,TaskStatus.FAILED].includes(t.status)) return;
      if (t.status === TaskStatus.WAITING && (!t.wakeAt || t.wakeAt <= this.now())) {
        t.status = TaskStatus.QUEUED;
        t.wakeAt = null;
      }
      const next = t.steps.find((s) => s.status !== StepStatus.COMPLETED && s.status !== StepStatus.SKIPPED);
      if (!next) return;
      if (next.claimedBy && next.leaseUntil && next.leaseUntil > this.now() && next.claimedBy !== this.workerId) return;
      if(!t.startedAt)t.startedAt=this.now();
      next.claimedBy = this.workerId;
      next.leaseUntil = this.now() + this.leaseMs;
      next.status = StepStatus.RUNNING;
      next.attempts += 1;
      t.status = TaskStatus.RUNNING;
      claimed = { ...next };
    });
    return claimed;
  }

  addProviderCalls(taskId,count){
    if(!count)return;
    this.store.mutate(taskId,t=>{
      t.providerCalls=Math.min(
        Number.MAX_SAFE_INTEGER,
        Number(t.providerCalls||0)+Math.max(0,Number(count)||0)
      );
    });
  }

  addRuntime(taskId,startedAt){
    const elapsed=Math.max(0,this.now()-startedAt);
    if(!elapsed)return;
    this.store.mutate(taskId,t=>{
      t.activeRuntimeMs=Number(t.activeRuntimeMs||0)+elapsed;
    });
  }

  async runNext() {
    const task = this.findRunnableTask();
    if (!task) return null;

    if(this.runtimeExceeded(task)){
      this.failTask(task.id,'Task active-runtime budget exceeded');
      return this.store.get(task.id);
    }

    const step = this.claimNextStep(task.id);
    if (!step) return null;

    const attemptStarted=this.now();
    const fresh = this.store.get(task.id);

    if (fresh.providerCalls >= fresh.maxProviderCalls) {
      this.failStep(fresh.id, step.id, 'Task provider-call budget exceeded');
      return this.store.get(fresh.id);
    }

    const previous = fresh.steps
      .filter((s) => s.stepIndex < step.stepIndex && s.status === StepStatus.COMPLETED)
      .map((s) => ({ botId: s.botId, output: s.output }));

    let context;
    try{
      context = await this.contextBuilder({ task: fresh, step, previous });
    }catch(error){
      this.addRuntime(fresh.id,attemptStarted);
      if(step.attempts < this.maxStepAttempts){
        this.store.mutate(fresh.id,t=>{
          const s=t.steps.find(x=>x.id===step.id);
          s.status=StepStatus.QUEUED;
          s.error=String(error?.message||error);
          s.claimedBy=null;
          s.leaseUntil=null;
          t.status=TaskStatus.QUEUED;
        });
      }else{
        this.failStep(fresh.id,step.id,String(error?.message||error));
      }
      return this.store.get(fresh.id);
    }

    const requestId = 'task:'+fresh.id+':step:'+step.stepIndex;
    const remainingProviderCalls=Math.max(0,fresh.maxProviderCalls-fresh.providerCalls);

    try {
      const result = await this.router.execute({
        requestId,
        maxProviderAttempts:remainingProviderCalls,
        input: context.input || (fresh.instruction+'\n\n'+step.instruction),
        messages: context.messages,
        estimatedTokens: context.estimatedTokens || 1000,
        requirements: context.requirements,
        hasImage: context.hasImage,
        hasPdf: context.hasPdf,
        longContext: context.longContext,
        privacy: context.privacy,
      });

      const usedCalls=result.cached?0:(result.attempts||[]).length;
      this.addProviderCalls(fresh.id,usedCalls);
      this.addRuntime(fresh.id,attemptStarted);

      const current=this.store.get(fresh.id);
      if(!current||current.status===TaskStatus.CANCELLED)return current;
      if(this.runtimeExceeded(current)){
        this.failStep(fresh.id,step.id,'Task active-runtime budget exceeded');
        return this.store.get(fresh.id);
      }

      this.store.mutate(fresh.id, (t) => {
        const s = t.steps.find((x) => x.id === step.id);
        if(!s||t.status===TaskStatus.CANCELLED)return;
        s.status = StepStatus.COMPLETED;
        s.output = result.text;
        s.error = null;
        s.claimedBy = null;
        s.leaseUntil = null;
        const done = t.steps.every((x) => x.status === StepStatus.COMPLETED || x.status === StepStatus.SKIPPED);
        t.status = done ? TaskStatus.COMPLETED : TaskStatus.QUEUED;
        t.completedAt = done ? this.now() : null;
        t.wakeAt = null;
        t.error = null;
      });
    } catch (error) {
      this.addProviderCalls(fresh.id,(error?.attempts||[]).length);
      this.addRuntime(fresh.id,attemptStarted);

      const current=this.store.get(fresh.id);
      if(!current||current.status===TaskStatus.CANCELLED)return current;

      if(this.runtimeExceeded(current)){
        this.failStep(fresh.id,step.id,'Task active-runtime budget exceeded');
      }else if (error?.code === 'NO_FREE_PROVIDER' && error.nextAt) {
        this.store.mutate(fresh.id, (t) => {
          const s = t.steps.find((x) => x.id === step.id);
          s.status = StepStatus.WAITING;
          s.error = null;
          s.claimedBy = null;
          s.leaseUntil = null;
          t.status = TaskStatus.WAITING;
          t.wakeAt = error.nextAt;
          t.error = null;
        });
      } else if (step.attempts < this.maxStepAttempts) {
        this.store.mutate(fresh.id, (t) => {
          const s = t.steps.find((x) => x.id === step.id);
          s.status = StepStatus.QUEUED;
          s.error = String(error?.message || error);
          s.claimedBy = null;
          s.leaseUntil = null;
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
      if (s) {
        s.status = StepStatus.FAILED;
        s.error = message;
        s.claimedBy = null;
        s.leaseUntil = null;
      }
      t.status = TaskStatus.FAILED;
      t.error = message;
      t.completedAt=this.now();
    });
  }

  failTask(taskId,message){
    this.store.mutate(taskId,t=>{
      t.status=TaskStatus.FAILED;
      t.error=message;
      t.completedAt=this.now();
      t.wakeAt=null;
      for(const s of t.steps){
        if(s.status===StepStatus.RUNNING){
          s.status=StepStatus.FAILED;
          s.error=message;
          s.claimedBy=null;
          s.leaseUntil=null;
        }
      }
    });
  }

  async runTaskUntilIdle(taskId, maxTicks = 100) {
    let ticks = 0;
    while (ticks++ < maxTicks) {
      const before = this.store.get(taskId);
      if (!before || [
        TaskStatus.COMPLETED,
        TaskStatus.FAILED,
        TaskStatus.CANCELLED,
        TaskStatus.WAITING
      ].includes(before.status)) return before;
      await this.runNext();
    }
    return this.store.get(taskId);
  }
}
