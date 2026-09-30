/**
 * Public API of the chat module — pure part (ADR-001): the prompt policy and
 * message handling. Retrieval is in `./server`.
 */

export {
  buildChatSystemPrompt,
  CHAT_PROMPT,
  CHAT_PROMPT_VERSION,
  extractLastUserText,
  type ChatSource,
  type RetrievedChunk,
} from "./domain/prompt";
export { EXPLAIN_PROMPT, EXPLAIN_PROMPT_VERSION, explainInstructions } from "./domain/explain-prompt";
