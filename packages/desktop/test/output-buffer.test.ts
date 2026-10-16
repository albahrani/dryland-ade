import { describe, expect, it } from "vitest";
import { createOutputBuffer } from "../src/main/output-buffer.ts";

describe("output buffer", () => {
  it("keeps every chunk while within the bound", () => {
    const buffer = createOutputBuffer(100);
    buffer.append("one\r\n");
    buffer.append("");
    buffer.append("two");
    expect(buffer.text()).toBe("one\r\ntwo");
  });

  it("keeps only the newest output beyond the bound, from the first line start in it", () => {
    const buffer = createOutputBuffer(12);
    for (const line of ["first\r\n", "second\r\n", "third\r\n", "four"]) buffer.append(line);
    // The newest 12 are "\nthird\r\nfour"; the cut part line before the first newline is dropped.
    expect(buffer.text()).toBe("third\r\nfour");
  });

  it("cuts inside a single chunk larger than the bound", () => {
    const buffer = createOutputBuffer(8);
    buffer.append("aaaa\nbbbbbbbbbb\ncc");
    expect(buffer.text()).toBe("cc");
  });

  it("keeps the newest characters as they are when no line starts in them", () => {
    const buffer = createOutputBuffer(4);
    buffer.append("abc");
    buffer.append("defg");
    expect(buffer.text()).toBe("defg");
  });

  it("stays bounded over a long run of output", () => {
    const buffer = createOutputBuffer(1000);
    for (let i = 0; i < 10_000; i++) buffer.append(`line ${i}\r\n`);
    const text = buffer.text();
    expect(text.length).toBeLessThanOrEqual(1000);
    expect(text.endsWith("line 9999\r\n")).toBe(true);
    expect(text.startsWith("line ")).toBe(true);
  });
});
