import { describe, expect, it } from "vitest";
import { SaveQueue } from "./saveQueue";

describe("SaveQueue", () => {
  it("writes in order and merges waiting saves", async () => {
    const writes: number[] = [];
    let release = () => {};
    const firstWrite = new Promise<void>((resolve) => { release = resolve; });
    const queue = new SaveQueue<number>(async (value) => {
      writes.push(value);
      if (value === 1) await firstWrite;
    });

    const first = queue.save(1);
    const second = queue.save(2);
    const third = queue.save(3);
    release();

    await expect(first).resolves.toBe(1);
    await expect(second).resolves.toBe(3);
    await expect(third).resolves.toBe(3);
    expect(writes).toEqual([1, 3]);
  });

  it("runs tasks in order with saves and does not merge saves across them", async () => {
    const events: string[] = [];
    let release = () => {};
    const firstWrite = new Promise<void>((resolve) => { release = resolve; });
    const queue = new SaveQueue<number>(async (value) => {
      events.push(`save ${value}`);
      if (value === 1) await firstWrite;
    });

    const saves = [queue.save(1), queue.save(2)];
    const task = queue.run(async () => { events.push("delete"); return "done"; });
    saves.push(queue.save(3));
    release();

    await expect(task).resolves.toBe("done");
    await Promise.all(saves);
    expect(events).toEqual(["save 1", "save 2", "delete", "save 3"]);
  });

  it("continues after a failed task", async () => {
    const queue = new SaveQueue<number>(async () => {});
    await expect(queue.run(async () => { throw new Error("locked"); })).rejects.toThrow("locked");
    await expect(queue.save(2)).resolves.toBe(2);
  });

  it("continues after a failed save", async () => {
    const queue = new SaveQueue<number>(async (value) => {
      if (value === 1) throw new Error("full");
    });
    await expect(queue.save(1)).rejects.toThrow("full");
    await expect(queue.save(2)).resolves.toBe(2);
  });
});
