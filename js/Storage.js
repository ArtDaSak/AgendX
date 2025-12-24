const StorageKey = "AgendXDataV2";

export const Storage = {
  load() {
    try {
      const raw = localStorage.getItem(StorageKey);
      if (!raw) return this.defaultState();

      const parsed = JSON.parse(raw);
      return {
        events: Array.isArray(parsed.events) ? parsed.events : [],
        activeDaySession: parsed.activeDaySession ?? null
      };
    } catch {
      return this.defaultState();
    }
  },

  save(data) {
    localStorage.setItem(StorageKey, JSON.stringify(data));
  },

  defaultState() {
    return {
      events: [],
      activeDaySession: null
    };
  }
};