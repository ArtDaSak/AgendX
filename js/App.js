import { Storage } from "./Storage.js";
import { Recurrence } from "./Recurrence.js";
import { DateUtils } from "./DateUtils.js";

const AppState = {
  view: "today",
  anchorDate: new Date(),
  data: Storage.load()
};

const Dom = {
  Tabs: document.querySelectorAll(".TabBtn"),
  ListTitle: document.getElementById("ListTitle"),
  OccurrenceList: document.getElementById("OccurrenceList"),
  ActiveSession: document.getElementById("ActiveSession"),
  PrevBtn: document.getElementById("PrevBtn"),
  NextBtn: document.getElementById("NextBtn"),
  TodayBtn: document.getElementById("TodayBtn"),

  OpenCreateBtn: document.getElementById("OpenCreateBtn"),
  Overlay: document.getElementById("Overlay"),
  Sheet: document.getElementById("Sheet"),
  CloseSheetBtn: document.getElementById("CloseSheetBtn"),
  CancelBtn: document.getElementById("CancelBtn"),
  DeleteBtn: document.getElementById("DeleteBtn"),
  SheetTitle: document.getElementById("SheetTitle"),

  EventForm: document.getElementById("EventForm"),
  EventId: document.getElementById("EventId"),
  TitleInput: document.getElementById("TitleInput"),
  RangeOrderInput: document.getElementById("RangeOrderInput"),
  DurationInput: document.getElementById("DurationInput"),
  NotesInput: document.getElementById("NotesInput"),
  RepeatType: document.getElementById("RepeatType"),
  StartOnInput: document.getElementById("StartOnInput"),
  RepeatConfig: document.getElementById("RepeatConfig")
};

boot();

function boot() {
  // Se setea fecha ancla a hoy en local
  AppState.anchorDate = new Date();
  AppState.anchorDate.setSeconds(0, 0);

  wireEvents();
  render();
}

function wireEvents() {
  Dom.Tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      Dom.Tabs.forEach(x => x.classList.remove("isActive"));
      btn.classList.add("isActive");
      AppState.view = btn.dataset.view;
      render();
    });
  });

  Dom.PrevBtn.addEventListener("click", () => {
    shiftAnchor(-1);
  });
  Dom.NextBtn.addEventListener("click", () => {
    shiftAnchor(1);
  });
  Dom.TodayBtn.addEventListener("click", () => {
    AppState.anchorDate = new Date();
    render();
  });

  Dom.OpenCreateBtn.addEventListener("click", () => openSheetForCreate());
  Dom.CloseSheetBtn.addEventListener("click", closeSheet);
  Dom.CancelBtn.addEventListener("click", closeSheet);
  Dom.Overlay.addEventListener("click", closeSheet);

  Dom.RepeatType.addEventListener("change", () => renderRepeatConfig());
  Dom.EventForm.addEventListener("submit", onSubmitEvent);

  Dom.DeleteBtn.addEventListener("click", () => {
    const id = Dom.EventId.value;
    if (!id) return;
    AppState.data.events = AppState.data.events.filter(e => e.id !== id);

    if (AppState.data.activeSession?.eventId === id) {
      AppState.data.activeSession = null;
    }

    persistAndRender();
    closeSheet();
  });
}

function shiftAnchor(direction) {
  if (AppState.view === "today") {
    AppState.anchorDate = DateUtils.addDays(AppState.anchorDate, direction);
  } else if (AppState.view === "week") {
    AppState.anchorDate = DateUtils.addDays(AppState.anchorDate, direction * 7);
  } else {
    AppState.anchorDate = DateUtils.addDays(AppState.anchorDate, direction * 30);
  }
  render();
}

function render() {
  renderActiveSession();

  const { rangeStart, rangeEnd, title } = computeRange();
  Dom.ListTitle.textContent = title;

  const occurrences = Recurrence.buildOccurrences(AppState.data.events, rangeStart, rangeEnd);

  if (occurrences.length === 0) {
    Dom.OccurrenceList.innerHTML = `<div class="Empty">No hay eventos en este rango</div>`;
    return;
  }

  Dom.OccurrenceList.innerHTML = renderOccurrences(occurrences, AppState.view);
  Dom.OccurrenceList.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", onActionClick);
  });
  Dom.OccurrenceList.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      const eventId = btn.dataset.edit;
      const found = AppState.data.events.find(e => e.id === eventId);
      if (found) openSheetForEdit(found);
    });
  });
}

function computeRange() {
  const anchor = new Date(AppState.anchorDate);
  anchor.setHours(0,0,0,0);

  if (AppState.view === "today") {
    const start = new Date(anchor);
    const end = new Date(anchor);
    end.setHours(23,59,59,999);
    return { rangeStart: start, rangeEnd: end, title: `Hoy · ${DateUtils.formatHumanDate(anchor)}` };
  }

  if (AppState.view === "week") {
    const start = DateUtils.startOfWeek(anchor);
    const end = DateUtils.endOfWeek(anchor);
    return { rangeStart: start, rangeEnd: end, title: `Semana · ${DateUtils.formatHumanDate(start)} → ${DateUtils.formatHumanDate(end)}` };
  }

  // Se muestra un rango amplio para "Todo" sin complicarse
  const start = DateUtils.addDays(anchor, -14);
  const end = DateUtils.addDays(anchor, 30);
  end.setHours(23,59,59,999);
  return { rangeStart: start, rangeEnd: end, title: `Todo · ${DateUtils.formatHumanDate(start)} → ${DateUtils.formatHumanDate(end)}` };
}

function renderOccurrences(occurrences, view) {
  let html = "";

  if (view === "today") {
    for (const occ of occurrences) html += rowHtml(occ);
    return html;
  }

  // Se agrupa por día
  const byDay = new Map();
  for (const occ of occurrences) {
    if (!byDay.has(occ.dayKey)) byDay.set(occ.dayKey, []);
    byDay.get(occ.dayKey).push(occ);
  }

  for (const [dayKey, list] of byDay.entries()) {
    const day = DateUtils.fromLocalDateKey(dayKey);
    html += `<div class="GroupTitle">${DateUtils.formatHumanDate(day)}</div>`;
    for (const occ of list) html += rowHtml(occ);
  }

  return html;
}

function rowHtml(occ) {
  const repeatLabel = repeatToLabel(occ.repeat?.type ?? "none");
  const duration = occ.durationMin ? `· ${occ.durationMin} min` : "";
  const isActive = AppState.data.activeSession?.occurrenceId === occ.occurrenceId;

  return `
    <article class="Row">
      <div class="RowTop">
        <div class="TitleLine">
          <strong>R${occ.rangeOrder} · ${escapeHtml(occ.title)}</strong>
          <small>${escapeHtml(occ.notes || "")}</small>
        </div>
        <div class="Badges">
          <span class="Badge isAccent">${repeatLabel}</span>
          ${occ.durationMin ? `<span class="Badge isCyan">${occ.durationMin} min</span>` : ""}
          ${isActive ? `<span class="Badge">En curso</span>` : ""}
        </div>
      </div>

      <div class="RowActions">
        <button class="GhostBtn" type="button" data-edit="${occ.eventId}">Editar</button>
        <button class="PrimaryBtn" type="button" data-action="${isActive ? "stop" : "start"}" data-occ="${occ.occurrenceId}">
          ${isActive ? "Finalizar" : "Iniciar"}
        </button>
      </div>
    </article>
  `;
}

function renderActiveSession() {
  const session = AppState.data.activeSession;

  if (!session) {
    Dom.ActiveSession.classList.remove("isVisible");
    Dom.ActiveSession.innerHTML = "";
    return;
  }

  const startedAt = new Date(session.startedAtIso);
  const time = DateUtils.formatTimeHHMM(startedAt);

  Dom.ActiveSession.classList.add("isVisible");
  Dom.ActiveSession.innerHTML = `
    <strong>Sesión activa</strong>
    <small>${escapeHtml(session.title)} · Inicio ${time} (redondeado)</small>
  `;
}

function onActionClick(e) {
  const btn = e.currentTarget;
  const action = btn.dataset.action;
  const occId = btn.dataset.occ;

  const occ = findOccurrenceById(occId);
  if (!occ) return;

  if (action === "start") {
    startSession(occ);
  } else {
    stopSession();
  }
}

function findOccurrenceById(occurrenceId) {
  const { rangeStart, rangeEnd } = computeRange();
  const occurrences = Recurrence.buildOccurrences(AppState.data.events, rangeStart, rangeEnd);
  return occurrences.find(x => x.occurrenceId === occurrenceId) ?? null;
}

function startSession(occ) {
  const now = new Date();
  const rounded = DateUtils.roundToNextHalfHour(now);

  AppState.data.activeSession = {
    occurrenceId: occ.occurrenceId,
    eventId: occ.eventId,
    dayKey: occ.dayKey,
    title: occ.title,
    startedAtIso: rounded.toISOString()
  };

  persistAndRender();
}

function stopSession() {
  AppState.data.activeSession = null;
  persistAndRender();
}

function persistAndRender() {
  Storage.save(AppState.data);
  render();
}

function openSheetForCreate() {
  Dom.SheetTitle.textContent = "Agregar evento";
  Dom.DeleteBtn.hidden = true;

  Dom.EventId.value = "";
  Dom.TitleInput.value = "";
  Dom.RangeOrderInput.value = "10";
  Dom.DurationInput.value = "";
  Dom.NotesInput.value = "";
  Dom.RepeatType.value = "none";

  Dom.StartOnInput.value = DateUtils.toLocalDateKey(new Date());

  renderRepeatConfig();
  openSheet();
}

function openSheetForEdit(event) {
  Dom.SheetTitle.textContent = "Editar evento";
  Dom.DeleteBtn.hidden = false;

  Dom.EventId.value = event.id;
  Dom.TitleInput.value = event.title ?? "";
  Dom.RangeOrderInput.value = String(event.rangeOrder ?? 10);
  Dom.DurationInput.value = event.durationMin ?? "";
  Dom.NotesInput.value = event.notes ?? "";
  Dom.RepeatType.value = event.repeat?.type ?? "none";
  Dom.StartOnInput.value = event.startOn ?? DateUtils.toLocalDateKey(new Date());

  renderRepeatConfig(event);
  openSheet();
}

function openSheet() {
  Dom.Overlay.hidden = false;
  Dom.Sheet.hidden = false;
}

function closeSheet() {
  Dom.Overlay.hidden = true;
  Dom.Sheet.hidden = true;
}

function renderRepeatConfig(event = null) {
  const type = Dom.RepeatType.value;

  if (type === "weekly") {
    const selected = new Set(event?.repeat?.daysOfWeek ?? []);
    Dom.RepeatConfig.innerHTML = `
      <div class="Field">
        <span>Días de la semana</span>
        <div class="CheckRow">
          ${weekPill(1, "Lun", selected)}
          ${weekPill(2, "Mar", selected)}
          ${weekPill(3, "Mié", selected)}
          ${weekPill(4, "Jue", selected)}
          ${weekPill(5, "Vie", selected)}
          ${weekPill(6, "Sáb", selected)}
          ${weekPill(0, "Dom", selected)}
        </div>
      </div>
    `;
    Dom.RepeatConfig.querySelectorAll("input[type=checkbox]").forEach(cb => {
      cb.addEventListener("change", () => {});
    });
    return;
  }

  if (type === "monthly") {
    const dayOfMonth = event?.repeat?.dayOfMonth ?? new Date().getDate();
    Dom.RepeatConfig.innerHTML = `
      <label class="Field">
        <span>Día del mes</span>
        <input id="DayOfMonthInput" type="number" min="1" max="31" value="${dayOfMonth}" />
        <small>Ej. 15 para repetir cada 15</small>
      </label>
    `;
    return;
  }

  if (type === "interval") {
    const everyDays = event?.repeat?.everyDays ?? 2;
    Dom.RepeatConfig.innerHTML = `
      <label class="Field">
        <span>Cada N días</span>
        <input id="EveryDaysInput" type="number" min="1" step="1" value="${everyDays}" />
      </label>
    `;
    return;
  }

  if (type === "dates") {
    const dateList = (event?.repeat?.dateList ?? []).join(", ");
    Dom.RepeatConfig.innerHTML = `
      <label class="Field">
        <span>Fechas (YYYY-MM-DD separadas por coma)</span>
        <input id="DateListInput" placeholder="2025-12-24, 2025-12-31" value="${dateList}" />
        <small>Se aceptan espacios y se ignoran vacíos</small>
      </label>
    `;
    return;
  }

  Dom.RepeatConfig.innerHTML = `<div class="Empty">Sin configuración adicional</div>`;
}

function weekPill(value, label, selectedSet) {
  const checked = selectedSet.has(value) ? "checked" : "";
  return `
    <label class="CheckPill">
      <input type="checkbox" value="${value}" ${checked} />
      <span>${label}</span>
    </label>
  `;
}

function onSubmitEvent(e) {
  e.preventDefault();

  const id = Dom.EventId.value || crypto.randomUUID();
  const title = Dom.TitleInput.value.trim();
  const rangeOrder = Number(Dom.RangeOrderInput.value);
  const durationMinRaw = Dom.DurationInput.value.trim();
  const durationMin = durationMinRaw ? Number(durationMinRaw) : null;

  const notes = Dom.NotesInput.value.trim();
  const startOn = Dom.StartOnInput.value || DateUtils.toLocalDateKey(new Date());
  const type = Dom.RepeatType.value;

  const repeat = buildRepeat(type);

  const payload = {
    id,
    title,
    rangeOrder,
    durationMin,
    notes,
    startOn,
    repeat
  };

  const existingIndex = AppState.data.events.findIndex(x => x.id === id);
  if (existingIndex >= 0) AppState.data.events[existingIndex] = payload;
  else AppState.data.events.push(payload);

  Storage.save(AppState.data);
  closeSheet();
  render();
}

function buildRepeat(type) {
  if (type === "none") {
    return { type: "none" };
  }

  if (type === "daily") {
    return { type: "daily" };
  }

  if (type === "weekly") {
    const daysOfWeek = Array.from(Dom.RepeatConfig.querySelectorAll("input[type=checkbox]"))
      .filter(x => x.checked)
      .map(x => Number(x.value));
    return { type: "weekly", daysOfWeek };
  }

  if (type === "monthly") {
    const input = document.getElementById("DayOfMonthInput");
    const dayOfMonth = Number(input?.value ?? 1);
    return { type: "monthly", dayOfMonth };
  }

  if (type === "interval") {
    const input = document.getElementById("EveryDaysInput");
    const everyDays = Number(input?.value ?? 1);
    return { type: "interval", everyDays };
  }

  if (type === "dates") {
    const input = document.getElementById("DateListInput");
    const raw = (input?.value ?? "");
    const dateList = raw.split(",").map(s => s.trim()).filter(Boolean);
    return { type: "dates", dateList };
  }

  return { type: "none" };
}

function repeatToLabel(type) {
  if (type === "none") return "Único";
  if (type === "daily") return "Diario";
  if (type === "weekly") return "Semanal";
  if (type === "monthly") return "Mensual";
  if (type === "interval") return "Cada N días";
  if (type === "dates") return "Fechas";
  return "Repite";
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
