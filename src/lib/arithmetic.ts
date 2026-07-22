class ExpressionParser {
  private position = 0;

  constructor(private readonly source: string) {}

  parse(): number | null {
    const value = this.parseSum();
    this.skipWhitespace();
    return value !== null && this.position === this.source.length && Number.isFinite(value) ? value : null;
  }

  private parseSum(): number | null {
    let value = this.parseProduct();
    if (value === null) return null;

    while (true) {
      const operator = this.take("+") || this.take("-");
      if (!operator) return value;
      const right = this.parseProduct();
      if (right === null) return null;
      value = operator === "+" ? value + right : value - right;
    }
  }

  private parseProduct(): number | null {
    let value = this.parseUnary();
    if (value === null) return null;

    while (true) {
      const operator = this.take("*") || this.take("/") || this.take("%");
      if (!operator) return value;
      const right = this.parseUnary();
      if (right === null) return null;
      if (operator === "*") value *= right;
      if (operator === "/") value /= right;
      if (operator === "%") value %= right;
    }
  }

  private parseUnary(): number | null {
    if (this.take("+")) return this.parseUnary();
    if (this.take("-")) {
      const value = this.parseUnary();
      return value === null ? null : -value;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number | null {
    if (this.take("(")) {
      const value = this.parseSum();
      return value !== null && this.take(")") ? value : null;
    }

    this.skipWhitespace();
    const match = this.source.slice(this.position).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (!match) return null;
    this.position += match[0].length;
    return Number(match[0]);
  }

  private take(token: string): string | null {
    this.skipWhitespace();
    if (this.source[this.position] !== token) return null;
    this.position += 1;
    return token;
  }

  private skipWhitespace() {
    while (/\s/.test(this.source[this.position] ?? "")) this.position += 1;
  }
}

export function evaluateArithmeticExpression(expression: string): number | null {
  if (!expression.trim()) return null;
  return new ExpressionParser(expression).parse();
}

export function adjustBoundedValue(value: number, delta: number, min?: number, max?: number): number {
  return Math.max(min ?? -Infinity, Math.min(max ?? Infinity, value + delta));
}

export function horizontalDragSteps(distance: number, pixelsPerStep = 8): number {
  if (pixelsPerStep <= 0) return 0;
  return Math.trunc(distance / pixelsPerStep);
}
