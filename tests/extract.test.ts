import { describe, it, expect } from "vitest";
import { extractText, replaceText } from "../src/extract.js";

describe("extractText", () => {
  it("extracts from a plain string", () => {
    expect(extractText("hello world")).toBe("hello world");
  });

  it("extracts from an object with content as string", () => {
    expect(extractText({ role: "toolResult", content: "file contents here" })).toBe(
      "file contents here",
    );
  });

  it("extracts from content block array with single text block", () => {
    const msg = {
      role: "toolResult",
      content: [{ type: "text", text: "block one" }],
    };
    expect(extractText(msg)).toBe("block one");
  });

  it("extracts from content block array with multiple text blocks", () => {
    const msg = {
      content: [
        { type: "text", text: "first" },
        { type: "text", text: "second" },
      ],
    };
    expect(extractText(msg)).toBe("first\0second");
  });

  it("skips non-text blocks in content array", () => {
    const msg = {
      content: [
        { type: "text", text: "visible" },
        { type: "image", source: { data: "base64..." } },
        { type: "text", text: "also visible" },
      ],
    };
    expect(extractText(msg)).toBe("visible\0also visible");
  });

  it("returns empty string for null", () => {
    expect(extractText(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(extractText(undefined)).toBe("");
  });

  it("returns empty string for a number", () => {
    expect(extractText(42)).toBe("");
  });

  it("returns empty string for object with no content", () => {
    expect(extractText({ role: "toolResult" })).toBe("");
  });

  it("returns empty string for object with null content", () => {
    expect(extractText({ content: null })).toBe("");
  });

  it("returns empty string for empty content array", () => {
    expect(extractText({ content: [] })).toBe("");
  });

  it("returns empty string for content array with only image blocks", () => {
    const msg = {
      content: [
        { type: "image", source: { data: "..." } },
        { type: "image", source: { data: "..." } },
      ],
    };
    expect(extractText(msg)).toBe("");
  });

  it("handles empty string content", () => {
    expect(extractText({ content: "" })).toBe("");
  });

  it("handles text block with empty text", () => {
    const msg = { content: [{ type: "text", text: "" }] };
    expect(extractText(msg)).toBe("");
  });

  it("handles content array with mixed valid and invalid blocks", () => {
    const msg = {
      content: [
        { type: "text", text: "valid" },
        { type: "text" }, // missing text property
        null,
        { type: "text", text: "also valid" },
      ],
    };
    expect(extractText(msg)).toBe("valid\0also valid");
  });
});

describe("replaceText", () => {
  it("replaces plain string message", () => {
    expect(replaceText("original", "redacted")).toBe("redacted");
  });

  it("replaces content string in object", () => {
    const msg = { role: "toolResult", content: "original text" };
    const result = replaceText(msg, "redacted text") as Record<string, unknown>;
    expect(result.content).toBe("redacted text");
    expect(result.role).toBe("toolResult");
  });

  it("does not mutate the original message object", () => {
    const msg = { role: "toolResult", content: "original" };
    replaceText(msg, "redacted");
    expect(msg.content).toBe("original");
  });

  it("replaces single text block in content array", () => {
    const msg = {
      content: [{ type: "text", text: "original" }],
    };
    const result = replaceText(msg, "redacted") as Record<string, unknown>;
    const content = result.content as Array<Record<string, unknown>>;
    expect(content[0].text).toBe("redacted");
    expect(content[0].type).toBe("text");
  });

  it("replaces multiple text blocks using segment separator", () => {
    const msg = {
      content: [
        { type: "text", text: "first original" },
        { type: "text", text: "second original" },
      ],
    };
    const result = replaceText(msg, "first redacted\0second redacted") as Record<string, unknown>;
    const content = result.content as Array<Record<string, unknown>>;
    expect(content[0].text).toBe("first redacted");
    expect(content[1].text).toBe("second redacted");
  });

  it("preserves non-text blocks in content array", () => {
    const msg = {
      content: [
        { type: "text", text: "original" },
        { type: "image", source: { data: "base64" } },
        { type: "text", text: "also original" },
      ],
    };
    const result = replaceText(msg, "redacted\0also redacted") as Record<string, unknown>;
    const content = result.content as Array<Record<string, unknown>>;
    expect(content[0].text).toBe("redacted");
    expect((content[1] as any).type).toBe("image");
    expect((content[1] as any).source.data).toBe("base64");
    expect(content[2].text).toBe("also redacted");
  });

  it("returns null unchanged", () => {
    expect(replaceText(null, "x")).toBe(null);
  });

  it("returns undefined unchanged", () => {
    expect(replaceText(undefined, "x")).toBe(undefined);
  });

  it("returns number unchanged", () => {
    expect(replaceText(42, "x")).toBe(42);
  });

  it("returns message unchanged if content is null", () => {
    const msg = { content: null };
    expect(replaceText(msg, "x")).toBe(msg);
  });

  it("returns message unchanged if content is not string or array", () => {
    const msg = { content: 123 };
    expect(replaceText(msg, "x")).toBe(msg);
  });

  it("preserves extra properties on the message", () => {
    const msg = { role: "toolResult", content: "original", toolCallId: "abc123" };
    const result = replaceText(msg, "redacted") as Record<string, unknown>;
    expect(result.toolCallId).toBe("abc123");
    expect(result.role).toBe("toolResult");
  });
});
