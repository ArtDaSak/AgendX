import { Storage } from "./Storage.js";
import { Recurrence } from "./Recurrence.js";
import { DateUtils } from "./DateUtils.js";

const AppState = {
  view: "today",
  anchorDate: new Date(),
  data: Storage.load(),
  startDayMode: "quick" // quick | rest
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

  // Event sheet
  EventSheet: document.getElementById("EventSheet"),
  CloseEventSheetBtn: document.getElementById("CloseEventSheetBtn"),
  CancelEventBtn: document.getElementById("CancelEventBtn"),
  EventSheetTitle: document.getElementById("EventSheetTitle"),
  EventForm: document.getElementById("EventForm"),
  DeleteBtn: document.getElementById("DeleteBtn"),
  EventId: document.getElementById("EventId"),
  TitleInput: document.getElementById("TitleInput"),
  RangeOrderInput: document.getElementById("RangeOrderInput"),
  DurationInput: document.getElementById("DurationInput"),
  NotesInput: document.getElementById("NotesInput"),
  RepeatType: document.getElementById("RepeatType"),
  StartOnInput: document.getElementById("StartOnInput"),
  RepeatConfig: document.getElementById("RepeatConfig"),

  // Start day sheet
  StartDaySheet: document.getElementById("StartDaySheet"),
  CloseStartDaySheetBtn: document.getElementById("CloseStartDaySheetBtn"),
  CancelStartDayBtn: document.getElementById("CancelStartDayBtn"),
  StartDayForm: document.getElementById("StartDayForm"),
  SegBtns: document.querySelectorAll(".SegBtn"),

  QuickEventBlock: document.getElementById("QuickEventBlock"),
  RestBlock: document.getElementById("RestBlock"),

  QuickTitle: document.getElementById("QuickTitle"),
  QuickRange: document.getElementById("QuickRange"),
  QuickDuration: document.getElementById("QuickDuration"),
  QuickRepeatType: document.getElementById("QuickRepeatType"),
  QuickStartOn: document.getElementById("QuickStartOn"),
  QuickRepeatConfig: document.getElementById("QuickRepeatConfig"),

  RestRange: document.getElementById("RestRange"),
  RestDuration: document.getElementById("RestDuration"),
  RestRepeatType: document.getElementById("RestRepeatType"),
  RestStartOn: document.getElementById("RestStartOn"),
  RestRepeatConfig: document.getElementById("RestRepeatConfig")
};

boot();

function boot() {
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

  Dom.PrevBtn.addEventListener("click", () => shiftAnchor(-1));
  Dom.NextBtn.addEventListener("click", () => shiftAnchor(1));
  Dom.TodayBtn.addEventListener("click", () => {
    AppState.anchorDate = new Date();
    render();
  });

  Dom.StartDayBtn.addEventListener("click", onStartDayClick);

  Dom.OpenCreateBtn.addEventListener("click", () => openEventSheetForCreate());

  Dom.CloseEventSheetBtn.addEventListener("click", closeSheets);
  Dom.CancelEventBtn.addEventListener("click", closeSheets);

  Dom.CloseStartDaySheetBtn.addEventListener("click", closeSheets);
  Dom.CancelStartDayBtn.addEventListener("click", closeSheets);

  Dom.Overlay.addEventListener("click", closeSheets);

  Dom.RepeatType.addEventListener("change", () => renderRepeatConfig(Dom.RepeatConfig, Dom.RepeatType.value, null));
  Dom.EventForm.addEventListener("submit", onSubmitEvent);

  Dom.DeleteBtn.addEventListener("click", () => {
    const id = Dom.EventId.value;
    if (!id) return;

    AppState.data.events = AppState.data.events.filter(e => e.id !== id);

    // Se invalida sesión si existía un snapshot
    if (AppState.data.activeDaySession) {
      const newPlan = buildDayPlan(AppState.data.activeDaySession.dayKey);
      AppState.data.activeDaySession.plan = newPlan;
      AppState.data.activeDaySession.planCount = newPlan.length;
    }

    persistAndRender();
    closeSheets();
  });

  // Start day sheet interactions
  Dom.SegBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      Dom.SegBtns.forEach(x => x.classList.remove("isActive"));
      btn.classList.add("isActive");
      AppState.startDayMode = btn.dataset.seg;
      renderStartDayMode();
    });
  });

  Dom.QuickRepeatType.addEventListener("change", () => renderRepeatConfig(Dom.QuickRepeatConfig, Dom.QuickRepeatType.value, null));
  Dom.RestRepeatType.addEventListener("change", () => renderRepeatConfig(Dom.RestRepeatConfig, Dom.RestRepeatType.value, null));

  Dom.StartDayForm.addEventListener("submit", onConfirmStartDay);
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

  // Semana NO incluye eventos diarios
  if (AppState.view === "week") {
    occurrences = occurrences.filter(o => (o.repeat?.type ?? "none") !== "daily");
  }

  // Día: si el día actual está iniciado, se muestra el snapshot del plan
  if (AppState.view === "today") {
    const dayKey = DateUtils.toLocalDateKey(AppState.anchorDate);
    if (AppState.data.activeDaySession?.dayKey === dayKey) {
      occurrences = AppState.data.activeDaySession.plan ?? [];
    } else {
      occurrences = applyRestOverride(occurrences, dayKey);
    }
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
      if (found) openEventSheetForEdit(found);
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
  const isRest = String(occ.title).trim().toLowerCase() === "descanso";
  const dayActive = AppState.data.activeDaySession?.dayKey === occ.dayKey;

  return `
    <article class="Row">
      <div class="RowTop">
        <div class="TitleLine">
          <strong>R${occ.rangeOrder} · ${escapeHtml(occ.title)}</strong>
          <small>${escapeHtml(occ.notes || "")}</small>
        </div>
        <div class="Badges">
          <span class="Badge ${isRest ? "isWarn" : "isAccent"}">${repeatLabel}</span>
          ${occ.durationMin ? `<span class="Badge isCyan">${occ.durationMin} min</span>` : ""}
          ${dayActive ? `<span class="Badge">Día iniciado</span>` : ""}
        </div>
      </div>

      <div class="RowActions">
        <button class="GhostBtn" type="button" data-edit="${occ.eventId}">Editar</button>
      </div>
    </article>
  `;
}

/* -------------------------
   Iniciar día: pop-up + snapshot
-------------------------- */

function onStartDayClick() {
  const dayKey = DateUtils.toLocalDateKey(AppState.anchorDate);

  // Si ya está iniciado ese mismo día, se finaliza
  if (AppState.data.activeDaySession?.dayKey === dayKey) {
    AppState.data.activeDaySession = null;
    persistAndRender();
    return;
  }

  // Se abre modal para elegir: evento rápido o descanso (opcional) y luego iniciar
  openStartDaySheet(dayKey);
}

function openStartDaySheet(dayKey) {
  Dom.Overlay.hidden = false;
  Dom.StartDaySheet.hidden = false;

  // Defaults sobre el día ancla
  Dom.QuickStartOn.value = dayKey;
  Dom.RestStartOn.value = dayKey;

  // Render config blocks
  renderStartDayMode();
  renderRepeatConfig(Dom.QuickRepeatConfig, Dom.QuickRepeatType.value, null);
  renderRepeatConfig(Dom.RestRepeatConfig, Dom.RestRepeatType.value, null);
}

function renderStartDayMode() {
  const mode = AppState.startDayMode;

  if (mode === "quick") {
    Dom.QuickEventBlock.hidden = false;
    Dom.RestBlock.hidden = true;
    return;
  }

  Dom.QuickEventBlock.hidden = true;
  Dom.RestBlock.hidden = false;
}

function onConfirmStartDay(e) {
  e.preventDefault();

  const dayKey = DateUtils.toLocalDateKey(AppState.anchorDate);

  // Se permite crear algo rápido antes de iniciar
  if (AppState.startDayMode === "quick") {
    const title = (Dom.QuickTitle.value || "").trim();
    if (title.length > 0) {
      const created = buildQuickEventPayload({
        title,
        rangeOrder: Number(Dom.QuickRange.value || 10),
        durationMin: Dom.QuickDuration.value ? Number(Dom.QuickDuration.value) : null,
        repeatType: Dom.QuickRepeatType.value,
        startOn: Dom.QuickStartOn.value || dayKey,
        configRoot: Dom.QuickRepeatConfig
      });

      AppState.data.events.push(created);
    }
  } else {
    // Descanso
    const created = buildQuickEventPayload({
      title: "Descanso",
      rangeOrder: Number(Dom.RestRange.value || 10),
      durationMin: Dom.RestDuration.value ? Number(Dom.RestDuration.value) : 30,
      repeatType: Dom.RestRepeatType.value,
      startOn: Dom.RestStartOn.value || dayKey,
      configRoot: Dom.RestRepeatConfig
    });

    AppState.data.events.push(created);
  }

  // Se construye snapshot del plan para ese día y se inicia
  const now = new Date();
  const rounded = DateUtils.roundToNextHalfHour(now);

  const plan = buildDayPlan(dayKey);

  AppState.data.activeDaySession = {
    dayKey,
    startedAtIso: rounded.toISOString(),
    planCount: plan.length,
    plan
  };

  persistAndRender();
  closeSheets();
}

function buildDayPlan(dayKey) {
  const dayStart = DateUtils.fromLocalDateKey(dayKey);
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 59, 999);

  // Día incluye TODO (incluye diarios)
  const occ = Recurrence.buildOccurrences(AppState.data.events, dayStart, dayEnd);

  // Se aplica regla de descansos: si existe NO diario en mismo rango -> se elimina descanso
  const cleaned = applyRestOverride(occ, dayKey);

  return cleaned;
}

function applyRestOverride(occurrences, dayKey) {
  const dayList = occurrences.filter(o => o.dayKey === dayKey);

  // Se detectan rangos que tienen evento NO diario
  const nonDailyRanges = new Set();
  for (const o of dayList) {
    const type = o.repeat?.type ?? "none";
    if (type !== "daily") nonDailyRanges.add(o.rangeOrder);
  }

  // Si hay evento NO diario en rango X, se elimina cualquier "Descanso" en X
  const out = dayList.filter(o => {
    const isRest = String(o.title).trim().toLowerCase() === "descanso";
    if (!isRest) return true;
    return !nonDailyRanges.has(o.rangeOrder);
  });

  // Se ordena por rango (y si hay duplicados, mantiene orden estable)
  out.sort((a, b) => a.rangeOrder - b.rangeOrder);

  return out;
}

/* -------------------------
   Evento Sheet (CRUD)
-------------------------- */

function openEventSheetForCreate() {
  Dom.EventSheetTitle.textContent = "Agregar evento";
  Dom.DeleteBtn.hidden = true;

  Dom.EventId.value = "";
  Dom.TitleInput.value = "";
  Dom.RangeOrderInput.value = "10";
  Dom.DurationInput.value = "";
  Dom.NotesInput.value = "";

  Dom.RepeatType.value = "none";
  Dom.StartOnInput.value = DateUtils.toLocalDateKey(AppState.anchorDate);

  renderRepeatConfig(Dom.RepeatConfig, Dom.RepeatType.value, null);
  openEventSheet();
}

function openEventSheetForEdit(event) {
  Dom.EventSheetTitle.textContent = "Editar evento";
  Dom.DeleteBtn.hidden = false;

  Dom.EventId.value = event.id;
  Dom.TitleInput.value = event.title ?? "";
  Dom.RangeOrderInput.value = String(event.rangeOrder ?? 10);
  Dom.DurationInput.value = event.durationMin ?? "";
  Dom.NotesInput.value = event.notes ?? "";

  Dom.RepeatType.value = event.repeat?.type ?? "none";
  Dom.StartOnInput.value = event.startOn ?? DateUtils.toLocalDateKey(AppState.anchorDate);

  renderRepeatConfig(Dom.RepeatConfig, Dom.RepeatType.value, event);
  openEventSheet();
}

function openEventSheet() {
  Dom.Overlay.hidden = false;
  Dom.EventSheet.hidden = false;
}

function onSubmitEvent(e) {
  e.preventDefault();

  const id = Dom.EventId.value || crypto.randomUUID();
  const title = Dom.TitleInput.value.trim();
  const rangeOrder = Number(Dom.RangeOrderInput.value);
  const durationMin = Dom.DurationInput.value ? Number(Dom.DurationInput.value) : null;
  const notes = Dom.NotesInput.value.trim();
  const startOn = Dom.StartOnInput.value || DateUtils.toLocalDateKey(new Date());
  const repeatType = Dom.RepeatType.value;

  const weekdayFilter = getWeekdayFilter(Dom.RepeatConfig);

  const repeat = buildRepeat(repeatType, Dom.RepeatConfig);

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

  const idx = AppState.data.events.findIndex(x => x.id === id);
  if (idx >= 0) AppState.data.events[idx] = payload;
  else AppState.data.events.push(payload);

  // Si hay un día activo, se actualiza snapshot para mantener consistencia (simple)
  if (AppState.data.activeDaySession) {
    const newPlan = buildDayPlan(AppState.data.activeDaySession.dayKey);
    AppState.data.activeDaySession.plan = newPlan;
    AppState.data.activeDaySession.planCount = newPlan.length;
  }

  persistAndRender();
  closeSheets();
}

/* -------------------------
   Repeat Config UI (reutilizable)
-------------------------- */

function renderRepeatConfig(container, type, eventOrNull) {
  const selectedWeekdays = new Set(eventOrNull?.weekdayFilter ?? []);

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
      <small>Si eliges días, el evento solo ocurre en esos días</small>
    </div>
  `;

  if (type === "weekly") {
    const selected = new Set(eventOrNull?.repeat?.daysOfWeek ?? []);
    container.innerHTML = `
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
    const dayOfMonth = eventOrNull?.repeat?.dayOfMonth ?? new Date().getDate();
    container.innerHTML = `
      ${weekdaysBlock}
      <label class="Field">
        <span>Día del mes</span>
        <input data-role="DayOfMonthInput" type="number" min="1" max="31" value="${dayOfMonth}" />
      </label>
    `;
    return;
  }

  if (type === "interval") {
    const everyDays = eventOrNull?.repeat?.everyDays ?? 2;
    container.innerHTML = `
      ${weekdaysBlock}
      <label class="Field">
        <span>Cada N días</span>
        <input data-role="EveryDaysInput" type="number" min="1" step="1" value="${everyDays}" />
      </label>
    `;
    return;
  }

  if (type === "dates") {
    const dateList = (eventOrNull?.repeat?.dateList ?? []).join(", ");
    container.innerHTML = `
      ${weekdaysBlock}
      <label class="Field">
        <span>Fechas (YYYY-MM-DD separadas por coma)</span>
        <input data-role="DateListInput" placeholder="2025-12-24, 2025-12-31" value="${escapeHtml(dateList)}" />
      </label>
    `;
    return;
  }

  // daily / none
  container.innerHTML = `${weekdaysBlock}<div class="Empty">Sin configuración adicional</div>`;
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

function getWeekdayFilter(container) {
  return Array.from(container.querySelectorAll('input[name="AllowedWeekday"]'))
    .filter(x => x.checked)
    .map(x => Number(x.value));
}

function buildRepeat(type, container) {
  if (type === "none") return { type: "none" };
  if (type === "daily") return { type: "daily" };

  if (type === "weekly") {
    const daysOfWeek = Array.from(container.querySelectorAll('input[name="WeeklyDay"]'))
      .filter(x => x.checked)
      .map(x => Number(x.value));
    return { type: "weekly", daysOfWeek };
  }

  if (type === "monthly") {
    const input = container.querySelector('[data-role="DayOfMonthInput"]');
    const dayOfMonth = Number(input?.value ?? 1);
    return { type: "monthly", dayOfMonth };
  }

  if (type === "interval") {
    const input = container.querySelector('[data-role="EveryDaysInput"]');
    const everyDays = Number(input?.value ?? 1);
    return { type: "interval", everyDays };
  }

  if (type === "dates") {
    const input = container.querySelector('[data-role="DateListInput"]');
    const raw = (input?.value ?? "");
    const dateList = raw.split(",").map(s => s.trim()).filter(Boolean);
    return { type: "dates", dateList };
  }

  return { type: "none" };
}

function buildQuickEventPayload({ title, rangeOrder, durationMin, repeatType, startOn, configRoot }) {
  const weekdayFilter = getWeekdayFilter(configRoot);
  const repeat = buildRepeat(repeatType, configRoot);

  return {
    id: crypto.randomUUID(),
    title,
    rangeOrder,
    durationMin,
    notes: "",
    startOn,
    weekdayFilter,
    repeat
  };
}

/* -------------------------
   Sesión activa (Día)
-------------------------- */

function renderActiveDaySession() {
  const session = AppState.data.activeDaySession;
  const dayKey = DateUtils.toLocalDateKey(AppState.anchorDate);

  if (!session) {
    Dom.ActiveSession.classList.remove("isVisible");
    Dom.ActiveSession.innerHTML = "";
    Dom.StartDayBtn.textContent = "Iniciar día";
    return;
  }

  const startedAt = new Date(session.startedAtIso);
  const time = DateUtils.formatTimeHHMM(startedAt);

  Dom.ActiveSession.classList.add("isVisible");
  Dom.ActiveSession.innerHTML = `
    <strong>Día iniciado</strong>
    <small>${escapeHtml(session.dayKey)} · Inicio ${time} (redondeado) · ${session.planCount ?? 0} rangos</small>
  `;

  // Solo muestra "Finalizar día" si el ancla está en el mismo día iniciado
  Dom.StartDayBtn.textContent = (session.dayKey === dayKey) ? "Finalizar día" : "Iniciar día";
}

/* -------------------------
   Helpers
-------------------------- */

function closeSheets() {
  Dom.Overlay.hidden = true;
  Dom.EventSheet.hidden = true;
  Dom.StartDaySheet.hidden = true;
}

function persistAndRender() {
  Storage.save(AppState.data);
  render();
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