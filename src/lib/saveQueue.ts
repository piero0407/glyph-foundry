type Waiter<T> = {
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

type Job<T> = {
  value: T;
  waiters: Waiter<T>[];
};

/**
 * Serializes storage writes. Consecutive `save` calls that wait behind a running
 * write are merged so only the latest value is written. `run` queues any other
 * storage task (delete, rename) in order with the saves around it.
 */
export class SaveQueue<T> {
  private open: Job<T> | null = null;
  private tail: Promise<void> = Promise.resolve();
  private active = 0;

  constructor(private readonly write: (value: T) => Promise<void>) {}

  save(value: T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.open) {
        this.open.value = value;
        this.open.waiters.push({ resolve, reject });
        return;
      }
      const job: Job<T> = { value, waiters: [{ resolve, reject }] };
      this.open = job;
      void this.schedule(async () => {
        if (this.open === job) this.open = null;
        try {
          await this.write(job.value);
          for (const waiter of job.waiters) waiter.resolve(job.value);
        } catch (error) {
          for (const waiter of job.waiters) waiter.reject(error);
        }
      });
    });
  }

  run<R>(task: () => Promise<R>): Promise<R> {
    // Saves requested after this task must not merge into a job queued before it.
    this.open = null;
    return this.schedule(task);
  }

  private schedule<R>(task: () => Promise<R>): Promise<R> {
    this.active += 1;
    // An idle queue starts at once, so the first save is not merged with later ones.
    const result = this.active === 1 ? task() : this.tail.then(task);
    this.tail = result.then(() => undefined, () => undefined).then(() => { this.active -= 1; });
    return result;
  }
}
