/**
 * Utilities for extracting text from AgentMessage tool result payloads
 * and replacing text content after redaction.
 *
 * AgentMessage shapes handled:
 * - Plain string
 * - Object with `content: string`
 * - Object with `content: [{ type: "text", text: "..." }, ...]`
 *
 * When multiple text blocks exist in a content array, they are joined
 * with a null byte separator (\0) so entity offsets stay valid across
 * the concatenated string. replaceText splits on the same separator
 * to map redacted text back to individual blocks.
 */

// Separator between text segments from content block arrays.
// Null byte won't appear in regex PII patterns or normal text content.
const SEGMENT_SEP = "\0";

/**
 * Extract all text content from an AgentMessage tool result payload.
 * Returns an empty string if no text content is found.
 */
export function extractText(message: unknown): string {
  if (message == null) return "";
  if (typeof message === "string") return message;
  if (typeof message !== "object") return "";

  const msg = message as Record<string, unknown>;
  const content = msg.content;

  if (content == null) return "";
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    const textParts: string[] = [];
    for (const block of content) {
      if (
        block != null &&
        typeof block === "object" &&
        (block as Record<string, unknown>).type === "text" &&
        typeof (block as Record<string, unknown>).text === "string"
      ) {
        textParts.push((block as Record<string, unknown>).text as string);
      }
    }
    if (textParts.length === 0) return "";
    return textParts.join(SEGMENT_SEP);
  }

  return "";
}

/**
 * Replace text content in an AgentMessage tool result payload with
 * the redacted version. Returns a shallow copy; does not mutate.
 *
 * If the message shape is not recognized or has no text, returns
 * the original message unchanged.
 */
export function replaceText(message: unknown, redactedText: string): unknown {
  if (message == null) return message;
  if (typeof message === "string") return redactedText;
  if (typeof message !== "object") return message;

  const msg = message as Record<string, unknown>;
  const content = msg.content;

  if (content == null) return message;

  if (typeof content === "string") {
    return { ...msg, content: redactedText };
  }

  if (Array.isArray(content)) {
    const segments = redactedText.split(SEGMENT_SEP);
    let segmentIndex = 0;

    const newContent = content.map((block) => {
      if (
        block != null &&
        typeof block === "object" &&
        (block as Record<string, unknown>).type === "text" &&
        typeof (block as Record<string, unknown>).text === "string" &&
        segmentIndex < segments.length
      ) {
        const replaced = { ...(block as Record<string, unknown>), text: segments[segmentIndex] };
        segmentIndex++;
        return replaced;
      }
      return block;
    });

    return { ...msg, content: newContent };
  }

  return message;
}
