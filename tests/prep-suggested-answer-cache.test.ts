import assert from "node:assert/strict";
import test from "node:test";

import {
    deleteSuggestedAnswerCache,
    getSuggestedAnswerCache,
    setSuggestedAnswerCache,
    suggestedAnswerStorageKey,
} from "../src/lib/prep/suggested-answer-cache";

function createStorageMock(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

function withLocalStorage(run: (storage: Storage) => void): void {
  const globalWithWindow = globalThis as typeof globalThis & {
    window?: { localStorage: Storage };
  };
  const originalWindow = globalWithWindow.window;
  const storage = createStorageMock();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
    writable: true,
  });

  try {
    run(storage);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
        writable: true,
      });
    } else {
      Reflect.deleteProperty(globalWithWindow, "window");
    }
  }
}

test("restores a suggested answer from persisted storage", () => {
  withLocalStorage((storage) => {
    const userId = "user-restore";
    const entry = {
      hint: "ANSWER:\nUse option B and explain the trade-off.",
      questionType: "SINGLE_CHOICE",
    };

    storage.setItem(
      suggestedAnswerStorageKey(userId, "interview-restore", "question-restore"),
      JSON.stringify(entry),
    );

    assert.deepEqual(
      getSuggestedAnswerCache(userId, "interview-restore", "question-restore"),
      entry,
    );
  });
});

test("persists and deletes suggested answer cache entries", () => {
  withLocalStorage((storage) => {
    const userId = "user-delete";
    setSuggestedAnswerCache(userId, "interview-delete", "question-delete", {
      hint: "ANSWER:\nPersist this response.",
      questionType: "OPEN_ENDED",
    });

    assert.ok(
      storage.getItem(
        suggestedAnswerStorageKey(userId, "interview-delete", "question-delete"),
      ),
    );

    deleteSuggestedAnswerCache(userId, "interview-delete", "question-delete");

    assert.equal(
      storage.getItem(
        suggestedAnswerStorageKey(userId, "interview-delete", "question-delete"),
      ),
      null,
    );
    assert.equal(
      getSuggestedAnswerCache(userId, "interview-delete", "question-delete"),
      undefined,
    );
  });
});

test("ignores invalid persisted suggested answer entries", () => {
  withLocalStorage((storage) => {
    const userId = "user-invalid";
    const key = suggestedAnswerStorageKey(
      userId,
      "interview-invalid",
      "question-invalid",
    );
    storage.setItem(
      key,
      JSON.stringify({ hint: "", questionType: "OPEN_ENDED" }),
    );

    assert.equal(
      getSuggestedAnswerCache(userId, "interview-invalid", "question-invalid"),
      undefined,
    );
    assert.equal(storage.getItem(key), null);
  });
});
