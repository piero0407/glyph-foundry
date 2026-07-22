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

  it("continues after a failed save", async () => {
    const queue = new SaveQueue<number>(async (value) => {
      if (value === 1) throw new Error("full");
    });
    await expect(queue.save(1)).rejects.toThrow("full");
    await expect(queue.save(2)).resolves.toBe(2);
  });
});
