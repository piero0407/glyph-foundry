import { describe, expect, it } from "vitest";
import { adjustBoundedValue, evaluateArithmeticExpression, horizontalDragSteps } from "./arithmetic";

describe("evaluateArithmeticExpression", () => {
  it("respects arithmetic precedence and parentheses", () => {
    expect(evaluateArithmeticExpression("2 + 3 * 4")).toBe(14);
    expect(evaluateArithmeticExpression("(2 + 3) * 4")).toBe(20);
  });

  it("supports decimals, unary signs, remainder, and scientific notation", () => {
    expect(evaluateArithmeticExpression("-.5 + +2")).toBe(1.5);
    expect(evaluateArithmeticExpression("10 % 4")).toBe(2);
    expect(evaluateArithmeticExpression("1e2 / 4")).toBe(25);
  });

  it.each(["", "2 +", "abc", "(2 + 3", "2 / 0", "1 2"])("rejects invalid expression %j", (expression) => {
    expect(evaluateArithmeticExpression(expression)).toBeNull();
  });
});

describe("numeric field interactions", () => {
  it("steps values while respecting bounds", () => {
    expect(adjustBoundedValue(4, 1, 0, 5)).toBe(5);
    expect(adjustBoundedValue(5, 1, 0, 5)).toBe(5);
    expect(adjustBoundedValue(0, -1, 0, 5)).toBe(0);
  });

  it("converts horizontal drag distance to whole steps", () => {
    expect(horizontalDragSteps(7)).toBe(0);
    expect(horizontalDragSteps(8)).toBe(1);
    expect(horizontalDragSteps(19)).toBe(2);
    expect(horizontalDragSteps(-8)).toBe(-1);
    expect(horizontalDragSteps(-19)).toBe(-2);
  });
});
