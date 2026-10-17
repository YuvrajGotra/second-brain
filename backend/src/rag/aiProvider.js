import { env } from '../config/env.js';
import { geminiProvider } from './providers/geminiProvider.js';
import { mockProvider } from './providers/mockProvider.js';

/**
 * Single access point for embeddings + LLM calls. The rest of the codebase
 * depends only on this interface, so adding OpenAI/Ollama is a new adapter file.
 */
const providers = { gemini: geminiProvider, mock: mockProvider };

export const ai = providers[env.AI_PROVIDER];
