const StorageKey = "AgendXDataV1";

export const Storage = {
  load() {
    try {
      const raw = localStorage.getItem(StorageKey);
      if (!raw) return { events: [], activeSession: null };
      const parsed = JSON.parse(raw);

      if (!("activeDaySession" in parsed)) parsed.activeDaySession = null;
      // Se asegura forma mínima
      return {
        events: Array.isArray(parsed.events) ? parsed.events : [],
        activeSession: parsed.activeSession ?? null
      };
    } catch {
      return { events: [], activeSession: null };
    }
  },

  save(data) {
    localStorage.setItem(StorageKey, JSON.stringify(data));
  }
};
