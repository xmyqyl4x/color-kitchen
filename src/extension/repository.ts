import { extensionState, type ExtensionState } from './state.js';

export const extensionStateKey = 'ck.extension.selection';
type ExtensionLocalStorage = {
  get(key: string): Promise<Record<string, unknown>>;
  set(entries: Record<string, unknown>): Promise<void>;
};

export function extensionRepository(local: ExtensionLocalStorage) {
  return {
    async load() {
      const record = await local.get(extensionStateKey);
      return extensionState(record[extensionStateKey]);
    },
    async save(input: ExtensionState) {
      const value = extensionState(input);
      await local.set({ [extensionStateKey]: value });
      return value;
    },
  };
}
