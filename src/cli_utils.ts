import { createInterface } from "node:readline";

export function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function parseNumberSelection(input: string, max: number): number | null {
  const n = Number.parseInt(input, 10);
  if (Number.isNaN(n) || n < 1 || n > max) return null;
  return n;
}

export type PagedSelection =
  | { action: "quit" }
  | { action: "next" }
  | { action: "prev" }
  | { action: "pick"; index: number }
  | { action: "invalid" };

export function parsePagedSelection(input: string, max: number): PagedSelection {
  const cmd = input.toLowerCase();
  if (cmd === "q") return { action: "quit" };
  if (cmd === "n" || cmd === "next") return { action: "next" };
  if (cmd === "p" || cmd === "prev" || cmd === "previous") return { action: "prev" };
  const n = parseNumberSelection(input, max);
  if (n == null) return { action: "invalid" };
  return { action: "pick", index: n - 1 };
}
