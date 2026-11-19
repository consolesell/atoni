const STORAGE_KEY = 'terminal_settings_v4';

export interface StoredAIConfig {
  geminiApiKeys: string[];
  selectedModel: string;
}

export function getStoredAIConfig(): StoredAIConfig {
  if (typeof window === 'undefined') {
    return { geminiApiKeys: [], selectedModel: 'auto' };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { geminiApiKeys: [], selectedModel: 'auto' };
    const parsed = JSON.parse(raw);
    const keys = Array.isArray(parsed?.ai?.geminiApiKeys)
      ? parsed.ai.geminiApiKeys
          .map((k: unknown) => (typeof k === 'string' ? k.trim() : ''))
          .filter(Boolean)
      : [];
    const selectedModel =
      typeof parsed?.ai?.selectedModel === 'string' && parsed.ai.selectedModel.trim()
        ? parsed.ai.selectedModel.trim()
        : 'auto';

    return {
      geminiApiKeys: Array.from(new Set<string>(keys)),
      selectedModel,
    };
  } catch {
    return { geminiApiKeys: [], selectedModel: 'auto' };
  }
}

export function getAIRequestHeaders(): Record<string, string> {
  const { geminiApiKeys, selectedModel } = getStoredAIConfig();
  const headers: Record<string, string> = {};

  if (geminiApiKeys.length > 0) {
    headers['X-Gemini-Api-Keys'] = JSON.stringify(geminiApiKeys);
  }
  if (selectedModel) {
    headers['X-Gemini-Model'] = selectedModel;
  }

  return headers;
}
