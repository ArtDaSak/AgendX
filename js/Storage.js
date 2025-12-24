const ApiTemplate = "https://694bac9c26e870772068c665.mockapi.io/:endpoint";
const ApiRoot = ApiTemplate.replace("/:endpoint", "");

async function requestJson(method, endpoint, body = null) {
  const url = `${ApiRoot}/${endpoint}`;

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${method} ${endpoint} -> ${res.status} ${text}`);
  }

  // MockAPI responde JSON en casi todo
  return res.status === 204 ? null : res.json();
}

export const Api = {
  // Events
  getEvents() {
    return requestJson("GET", "events");
  },
  createEvent(payload) {
    return requestJson("POST", "events", payload);
  },
  updateEvent(id, payload) {
    return requestJson("PUT", `events/${id}`, payload);
  },
  deleteEvent(id) {
    return requestJson("DELETE", `events/${id}`);
  },

  // Recurrences (sesión diaria)
  getRecurrences() {
    return requestJson("GET", "recurrences");
  },
  createRecurrence(payload) {
    return requestJson("POST", "recurrences", payload);
  },
  patchRecurrence(id, patch) {
    return requestJson("PUT", `recurrences/${id}`, patch);
  },
  deleteRecurrence(id) {
    return requestJson("DELETE", `recurrences/${id}`);
  }
};