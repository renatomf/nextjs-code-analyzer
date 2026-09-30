/**
 * Public API of the chat module — pure part (ADR-001): the prompt policy and
 * message handling. Retrieval is in `./server`.
 */

export {
  buildChatSystemPrompt,
  extractLastUserText,
  type ChatSource,
  type RetrievedChunk,
} from "./domain/prompt";
