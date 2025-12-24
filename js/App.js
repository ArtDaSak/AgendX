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
  StartDayBtn: document.getElementById("StartDayBtn"),

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
  AppState.anchorDate = new Date();
  AppState.anchorDate.setSeconds(0, 0);

  // Se asegura esquema para sesión del día
  if (!("activeDaySession" in AppState.data)) AppState.data.activeDaySession = null;

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

  Dom.PrevBtn.addEventListener("click", () => shiftAnchor(-1));
  Dom.NextBtn.addEventListener("click", () => shiftAnchor(1));
  Dom.TodayBtn.addEventListener("click", () => {
    AppState.anchorDate = new Date();
    render();
  });

  Dom.StartDayBtn?.addEventListener("click", () => toggleDaySession());

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

    // Se limpia sesión si el día activo dependía de ocurrencias borradas (se recalcula luego)
    persistAndRender();
    closeSheet();
  });
}

function shiftAnchor(direction) {
  if (AppState.view === "today") AppState.anchorDate = DateUtils.addDays(AppState.anchorDate, direction);
  else if (AppState.view === "week") AppState.anchorDate = DateUtils.addDays(AppState.anchorDate, direction * 7);
  else AppState.anchorDate = DateUtils.addDays(AppState.anchorDate, direction * 30);

  render();
}

function render() {
  renderActiveDaySession();

  const { rangeStart, rangeEnd, title } = computeRange();
  Dom.ListTitle.textContent = title;

  let occurrences = Recurrence.buildOccurrences(AppState.data.events, rangeStart, rangeEnd);

  // Regla: Semana no muestra "Daily"
  if (AppState.view === "week") {
    occurrences = occurrences.filter(o => (o.repeat?.type ?? "none") !== "daily");
  }

  if (occurrences.length === 0) {
    Dom.OccurrenceList.innerHTML = `<div class="Empty">No hay eventos en este rango</div>`;
    return;
  }

  Dom.OccurrenceList.innerHTML = renderOccurrences(occurrences, AppState.view);

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
  anchor.setHours(0, 0, 0, 0);

  if (AppState.view === "today") {
    const start = new Date(anchor);
    const end = new Date(anchor);
    end.setHours(23, 59, 59, 999);
    return { rangeStart: start, rangeEnd: end, title: `Día · ${DateUtils.formatHumanDate(anchor)}` };
  }

  if (AppState.view === "week") {
    const start = DateUtils.startOfWeek(anchor);
    const end = DateUtils.endOfWeek(anchor);
    return { rangeStart: start, rangeEnd: end, title: `Semana · ${DateUtils.formatHumanDate(start)} → ${DateUtils.formatHumanDate(end)}` };
  }

  const start = DateUtils.addDays(anchor, -14);
  const end = DateUtils.addDays(anchor, 30);
  end.setHours(23, 59, 59, 999);
  return { rangeStart: start, rangeEnd: end, title: `Todo · ${DateUtils.formatHumanDate(start)} → ${DateUtils.formatHumanDate(end)}` };
}

function renderOccurrences(occurrences, view) {
  if (view === "today") {
    return occurrences.map(rowHtml).join("");
  }

  // Se agrupa por día
  const byDay = new Map();
  for (const occ of occurrences) {
    if (!byDay.has(occ.dayKey)) byDay.set(occ.dayKey, []);
    byDay.get(occ.dayKey).push(occ);
  }

  let html = "";
  for (const [dayKey, list] of byDay.entries()) {
    const day = DateUtils.fromLocalDateKey(dayKey);
    html += `<div class="GroupTitle">${DateUtils.formatHumanDate(day)}</div>`;
    html += list.map(rowHtml).join("");
  }

  return html;
}

function rowHtml(occ) {
  const repeatLabel = repeatToLabel(occ.repeat?.type ?? "none");
  const duration = occ.durationMin ? `· ${occ.durationMin} min` : "";
  const dayActive = isDayActiveFor(occ.dayKey);

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
          ${dayActive ? `<span class="Badge">Día en curso</span>` : ""}
        </div>
      </div>

      <div class="RowActions">
        <button class="GhostBtn" type="button" data-edit="${occ.eventId}">Editar</button>
      </div>
    </article>
  `;
}

function renderActiveDaySession() {
  const session = AppState.data.activeDaySession;

  if (!session) {
    Dom.ActiveSession.classList.remove("isVisible");
    Dom.ActiveSession.innerHTML = "";
    if (Dom.StartDayBtn) Dom.StartDayBtn.textContent = "Iniciar día";
    return;
  }

  const startedAt = new Date(session.startedAtIso);
  const time = DateUtils.formatTimeHHMM(startedAt);

  Dom.ActiveSession.classList.add("isVisible");
  Dom.ActiveSession.innerHTML = `
    <strong>Día iniciado</strong>
    <small>${escapeHtml(session.dayKey)} · Inicio ${time} (redondeado) · ${session.occurrenceIds.length} eventos</small>
  `;

  if (Dom.StartDayBtn) Dom.StartDayBtn.textContent = "Finalizar día";
}

function toggleDaySession() {
  const dayKey = DateUtils.toLocalDateKey(AppState.anchorDate);

  // Si ya está activo ese mismo día, se finaliza
  if (AppState.data.activeDaySession?.dayKey === dayKey) {
    AppState.data.activeDaySession = null;
    persistAndRender();
    return;
  }

  // Se inicia el día para el dayKey anclado (solo ocurrencias de ese día)
  const dayStart = DateUtils.fromLocalDateKey(dayKey);
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 59, 999);

  // Para “día”: incluye TODO (incluye daily)
  const dayOccurrences = Recurrence.buildOccurrences(AppState.data.events, dayStart, dayEnd);

  const now = new Date();
  const rounded = DateUtils.roundToNextHalfHour(now);

  AppState.data.activeDaySession = {
    dayKey,
    startedAtIso: rounded.toISOString(),
    occurrenceIds: dayOccurrences.map(o => o.occurrenceId)
  };

  persistAndRender();
}

function isDayActiveFor(dayKey) {
  return AppState.data.activeDaySession?.dayKey === dayKey;
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

  // Selector extra: días permitidos (uno o varios)
  const selectedWeekdays = new Set(event?.weekdayFilter ?? []);
  const weekdaysBlock = `
    <div class="Field">
      <span>Días permitidos (opcional)</span>
      <div class="CheckRow">
        ${weekdayPill(1, "Lun", selectedWeekdays, "AllowedWeekday")}
        ${weekdayPill(2, "Mar", selectedWeekdays, "AllowedWeekday")}
        ${weekdayPill(3, "Mié", selectedWeekdays, "AllowedWeekday")}
        ${weekdayPill(4, "Jue", selectedWeekdays, "AllowedWeekday")}
        ${weekdayPill(5, "Vie", selectedWeekdays, "AllowedWeekday")}
        ${weekdayPill(6, "Sáb", selectedWeekdays, "AllowedWeekday")}
        ${weekdayPill(0, "Dom", selectedWeekdays, "AllowedWeekday")}
      </div>
      <small>Si eliges días, el evento solo ocurre en esos días (aplica a cualquier repetición)</small>
    </div>
  `;

  if (type === "weekly") {
    const selected = new Set(event?.repeat?.daysOfWeek ?? []);
    Dom.RepeatConfig.innerHTML = `
      ${weekdaysBlock}
      <div class="Field">
        <span>Días de repetición semanal</span>
        <div class="CheckRow">
          ${weekdayPill(1, "Lun", selected, "WeeklyDay")}
          ${weekdayPill(2, "Mar", selected, "WeeklyDay")}
          ${weekdayPill(3, "Mié", selected, "WeeklyDay")}
          ${weekdayPill(4, "Jue", selected, "WeeklyDay")}
          ${weekdayPill(5, "Vie", selected, "WeeklyDay")}
          ${weekdayPill(6, "Sáb", selected, "WeeklyDay")}
          ${weekdayPill(0, "Dom", selected, "WeeklyDay")}
        </div>
      </div>
    `;
    return;
  }

  if (type === "monthly") {
    const dayOfMonth = event?.repeat?.dayOfMonth ?? new Date().getDate();
    Dom.RepeatConfig.innerHTML = `
      ${weekdaysBlock}
      <label class="Field">
        <span>Día del mes</span>
        <input id="DayOfMonthInput" type="number" min="1" max="31" value="${dayOfMonth}" />
      </label>
    `;
    return;
  }

  if (type === "interval") {
    const everyDays = event?.repeat?.everyDays ?? 2;
    Dom.RepeatConfig.innerHTML = `
      ${weekdaysBlock}
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
      ${weekdaysBlock}
      <label class="Field">
        <span>Fechas (YYYY-MM-DD separadas por coma)</span>
        <input id="DateListInput" placeholder="2025-12-24, 2025-12-31" value="${dateList}" />
      </label>
    `;
    return;
  }

  if (type === "daily") {
    Dom.RepeatConfig.innerHTML = `${weekdaysBlock}`;
    return;
  }

  Dom.RepeatConfig.innerHTML = `${weekdaysBlock}<div class="Empty">Sin configuración adicional</div>`;
}

function weekdayPill(value, label, selectedSet, name) {
  const checked = selectedSet.has(value) ? "checked" : "";
  return `
    <label class="CheckPill">
      <input type="checkbox" name="${name}" value="${value}" ${checked} />
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

  const weekdayFilter = Array.from(Dom.RepeatConfig.querySelectorAll('input[name="AllowedWeekday"]'))
    .filter(x => x.checked)
    .map(x => Number(x.value));

  const repeat = buildRepeat(type);

  const payload = {
    id,
    title,
    rangeOrder,
    durationMin,
    notes,
    startOn,
    weekdayFilter,
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
  if (type === "none") return { type: "none" };
  if (type === "daily") return { type: "daily" };

  if (type === "weekly") {
    const daysOfWeek = Array.from(Dom.RepeatConfig.querySelectorAll('input[name="WeeklyDay"]'))
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
