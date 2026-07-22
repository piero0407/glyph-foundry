type Waiter<T> = {
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

type Job<T> = {
  value: T;
  waiters: Waiter<T>[];
};

export class SaveQueue<T> {
  private next: Job<T> | null = null;
  private running = false;

  constructor(private readonly write: (value: T) => Promise<void>) {}

  save(value: T): Promise<T> {
    const promise = new Promise<T>((resolve, reject) => {
      if (this.next) {
        this.next.value = value;
        this.next.waiters.push({ resolve, reject });
      } else {
        this.next = { value, waiters: [{ resolve, reject }] };
      }
    });
    void this.drain();
    return promise;
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.next) {
      const job = this.next;
      this.next = null;
      try {
        await this.write(job.value);
        for (const waiter of job.waiters) waiter.resolve(job.value);
      } catch (error) {
        for (const waiter of job.waiters) waiter.reject(error);
      }
    }
    this.running = false;
  }
}
