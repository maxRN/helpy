// Node 25+ defines a global `localStorage` that is undefined unless --localstorage-file is given, which breaks
// zustand's persist middleware in tests. Give tests a plain in-memory Storage instead.
if (typeof globalThis.localStorage === 'undefined' || globalThis.localStorage === null) {
  const items = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  }
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true })
}
