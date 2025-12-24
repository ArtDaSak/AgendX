const ApiRoot = "https://694bac9c26e870772068c665.mockapi.io";

async function requestJson(method, endpoint, body = null) {
  const url = `${ApiRoot}/${endpoint}`;

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
    cache: "no-store"
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${method} ${endpoint} -> ${res.status} ${text}`);
  }

  return res.status === 204 ? null : res.json();
}

export const Api = {
  getEvents() {
    return requestJson("GET", "events");
  },
  createEvent(payload) {
    return requestJson("POST", "events", payload);
  },
  updateEvent(id, payload) {
    return requestJson("PUT", `events/${encodeURIComponent(id)}`, payload);
  },
  deleteEvent(id) {
    return requestJson("DELETE", `events/${encodeURIComponent(id)}`);
  },

  getRecurrences() {
    return requestJson("GET", "recurrences");
  },
  createRecurrence(payload) {
    return requestJson("POST", "recurrences", payload);
  },
  updateRecurrence(id, payload) {
    return requestJson("PUT", `recurrences/${encodeURIComponent(id)}`, payload);
  },
  deleteRecurrence(id) {
    return requestJson("DELETE", `recurrences/${encodeURIComponent(id)}`);
  }
};