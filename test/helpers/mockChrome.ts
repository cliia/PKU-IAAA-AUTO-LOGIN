import type { ChromeLike } from "../../src/shared/storage";

type StorageShape = Record<string, unknown>;

function cloneValue<TValue>(value: TValue): TValue {
  return structuredClone(value);
}

function selectValues(store: StorageShape, keys: string | string[] | Record<string, unknown> | null): StorageShape {
  if (keys === null) {
    return cloneValue(store);
  }

  if (typeof keys === "string") {
    return keys in store ? { [keys]: cloneValue(store[keys]) } : {};
  }

  if (Array.isArray(keys)) {
    return keys.reduce<StorageShape>((result, key) => {
      if (key in store) {
        result[key] = cloneValue(store[key]);
      }

      return result;
    }, {});
  }

  return Object.keys(keys).reduce<StorageShape>((result, key) => {
    result[key] = key in store ? cloneValue(store[key]) : keys[key];
    return result;
  }, {});
}

function createStorageArea(store: StorageShape) {
  return {
    get(keys: string | string[] | Record<string, unknown> | null, callback: (items: StorageShape) => void): void {
      callback(selectValues(store, keys));
    },
    set(items: StorageShape, callback?: () => void): void {
      Object.assign(store, cloneValue(items));
      callback?.();
    },
    remove(keys: string | string[], callback?: () => void): void {
      const targetKeys = Array.isArray(keys) ? keys : [keys];

      for (const key of targetKeys) {
        delete store[key];
      }

      callback?.();
    },
  };
}

export function createMockChrome(initialData: { sync?: StorageShape; local?: StorageShape } = {}) {
  const syncStore = cloneValue(initialData.sync ?? {});
  const localStore = cloneValue(initialData.local ?? {});

  const chromeLike: ChromeLike = {
    storage: {
      sync: createStorageArea(syncStore),
      local: createStorageArea(localStore),
    },
    runtime: {},
  };

  return {
    chromeLike,
    syncStore,
    localStore,
  };
}
