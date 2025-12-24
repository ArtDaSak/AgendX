import { Storage } from "./Storage.js";
import { Recurrence } from "./Recurrence.js";
import { DateUtils } from "./DateUtils.js";

const AppState = {
  view: "today",
  anchorDate: new Date(),
  data: Storage.load()
};

let timerTickId = null;

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

  EventSheet: document.getElementById("EventSheet"),
  CloseEventSheetBtn: document.getElementById("CloseEventSheetBtn"),
  CancelEventBtn: document.getElementById("CancelEventBtn"),
  EventSheetTitle: document.getElementById("EventSheetTitle"),
  EventForm: document.getElementById("EventForm"),
  DeleteBtn: document.getElementById("DeleteBtn"),

  EventId: document.getElementById("EventId"),
  EventKind: document.getElementById("EventKind"),
  TitleWrap: document.getElementById("TitleWrap"),
  NotesWrap: document.getElementById("NotesWrap"),
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

  Dom.StartDayBtn.addEventListener("click", startDayOnly);

  Dom.OpenCreateBtn.addEventListener("click", () => openEventSheetForCreate());

  Dom.CloseEventSheetBtn.addEventListener("click", closeEventSheet);
  Dom.CancelEventBtn.addEventListener("click", closeEventSheet);
  Dom.Overlay.addEventListener("click", closeEventSheet);

  Dom.RepeatType.addEventListener("change", () => renderRepeatConfig(Dom.RepeatConfig, Dom.RepeatType.value, null));
  Dom.EventKind.addEventListener("change", () => applyKindUI());

  Dom.EventForm.addEventListener("submit", onSubmitEvent);

  Dom.DeleteBtn.addEventListener("click", () => {
    const id = Dom.EventId.value;
    if (!id) return;

    AppState.data.events = AppState.data.events.filter(e => e.id !== id);
    Storage.save(AppState.data);

    // Si el día ya fue iniciado, su snapshot NO se recalcula (se mantiene como estuvo al iniciar)
    closeEventSheet();
    render();
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
  updateStartDayButtonState();

  const { rangeStart, rangeEnd, title } = computeRange();
  Dom.ListTitle.textContent = title;

  let occurrences = Recurrence.buildOccurrences(AppState.data.events, rangeStart, rangeEnd);

  if (AppState.view === "week") {
    occurrences = occurrences.filter(o => (o.repeat?.type ?? "none") !== "daily");
  }

  if (AppState.view === "today") {
    const dayKey = DateUtils.toLocalDateKey(AppState.anchorDate);

    // Si el día está iniciado, se muestra el snapshot
    if (AppState.data.activeDaySession?.dayKey === dayKey) {
      occurrences = AppState.data.activeDaySession.plan ?? [];
    } else {
      // Si no está iniciado, se aplican reglas de descanso en vivo
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

  // Toggle progreso por ocurrencia (solo si el día está iniciado)
  Dom.OccurrenceList.querySelectorAll("[data-toggle-done]").forEach(btn => {
    btn.addEventListener("click", () => {
      const occId = btn.dataset.toggleDone;
      toggleDone(occId);
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
  if (view === "today") return occurrences.map(rowHtml).join("");

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
  const isRest = isRestTitle(occ.title);

  const session = AppState.data.activeDaySession;
  const dayActive = session?.dayKey === occ.dayKey;

  const done = dayActive ? Boolean(session?.doneByOccId?.[occ.occurrenceId]) : false;
  const doneBadge = dayActive ? `<span class="Badge ${done ? "isDone" : ""}">${done ? "Hecho" : "Pendiente"}</span>` : "";

  const toggleBtn = dayActive
    ? `<button class="GhostBtn" type="button" data-toggle-done="${occ.occurrenceId}">${done ? "Desmarcar" : "Hecho"}</button>`
    : "";

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
          ${doneBadge}
        </div>
      </div>

      <div class="RowActions">
        ${toggleBtn}
        <button class="GhostBtn" type="button" data-edit="${occ.eventId}">Editar</button>
      </div>
    </article>
  `;
}

/* -------------------------
   Iniciar día (solo inicia)
-------------------------- */

function startDayOnly() {
  const dayKey = DateUtils.toLocalDateKey(AppState.anchorDate);

  // Si ya inició ese día, no hace nada
  if (AppState.data.activeDaySession?.dayKey === dayKey) return;

  const plan = buildDayPlan(dayKey);

  if (!plan || plan.length === 0) {
    showToastLikeNotice("No puedes iniciar el día porque no hay eventos para hoy.");
    return;
  }

  AppState.data.activeDaySession = {
    dayKey,
    startedAtIso: new Date().toISOString(), // exacto, sin redondeo
    planCount: plan.length,
    plan,
    doneByOccId: Object.fromEntries(plan.map(o => [o.occurrenceId, false])),
    currentIndex: 0
  };

  Storage.save(AppState.data);
  render();
}


function buildDayPlan(dayKey) {
  const dayStart = DateUtils.fromLocalDateKey(dayKey);
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 59, 999);

  const occ = Recurrence.buildOccurrences(AppState.data.events, dayStart, dayEnd);
  return applyRestOverride(occ, dayKey);
}

/* -------------------------
   Regla de descanso
-------------------------- */

function applyRestOverride(occurrences, dayKey) {
  const dayList = occurrences.filter(o => o.dayKey === dayKey);

  // Rango ocupado por evento NO diario => se elimina descanso en ese rango
  const nonDailyRanges = new Set();
  for (const o of dayList) {
    const type = o.repeat?.type ?? "none";
    if (type !== "daily") nonDailyRanges.add(o.rangeOrder);
  }

  const filtered = dayList.filter(o => {
    if (!isRestTitle(o.title)) return true;
    return !nonDailyRanges.has(o.rangeOrder);
  });

  filtered.sort((a, b) => a.rangeOrder - b.rangeOrder);
  return filtered;
}

function isRestTitle(title) {
  return String(title ?? "").trim().toLowerCase() === "descanso";
}

/* -------------------------
   Progreso + Siguiente rango
-------------------------- */

function toggleDone(occurrenceId) {
  const dayKey = DateUtils.toLocalDateKey(AppState.anchorDate);
  const session = AppState.data.activeDaySession;

  if (!session || session.dayKey !== dayKey) return;

  session.doneByOccId[occurrenceId] = !session.doneByOccId[occurrenceId];

  // Si se marcó hecho el actual, puede avanzar
  const current = getCurrentOccurrence(session);
  if (current && session.doneByOccId[current.occurrenceId]) {
    moveToNext(session);
  }

  Storage.save(AppState.data);
  render();
}

function moveToNext(session) {
  const total = session.plan.length;
  if (total === 0) return;

  // Busca el siguiente pendiente desde currentIndex+1 con wrap
  for (let step = 1; step <= total; step++) {
    const idx = (session.currentIndex + step) % total;
    const occ = session.plan[idx];
    if (!session.doneByOccId[occ.occurrenceId]) {
      session.currentIndex = idx;
      return;
    }
  }

  // Si todos están hechos, se queda en el mismo
}

/* -------------------------
   Temporizador en tiempo real
-------------------------- */

function renderActiveDaySession() {
  const session = AppState.data.activeDaySession;
  const dayKey = DateUtils.toLocalDateKey(AppState.anchorDate);

  stopTimerTick();

  if (!session) {
    Dom.ActiveSession.classList.remove("isVisible");
    Dom.ActiveSession.innerHTML = "";
    return;
  }

  const startedAt = new Date(session.startedAtIso);
  const startedTime = DateUtils.formatTimeHHMM(startedAt);

  const isSameDay = session.dayKey === dayKey;
  const doneCount = Object.values(session.doneByOccId ?? {}).filter(Boolean).length;
  const total = session.planCount ?? 0;

  Dom.ActiveSession.classList.add("isVisible");

  // Botones de progreso solo si estás viendo el mismo día iniciado
  const controls = isSameDay ? `
    <div class="RowActions" style="justify-content:flex-end">
      <button class="GhostBtn" id="NextRangeBtn" type="button">Siguiente rango</button>
      <button class="PrimaryBtn" id="MarkCurrentBtn" type="button">Marcar hecho</button>
    </div>
  ` : "";

  Dom.ActiveSession.innerHTML = `
    <div>
      <strong>Día iniciado</strong>
      <small>${escapeHtml(session.dayKey)} · Inicio ${startedTime} · Progreso ${doneCount}/${total}</small>
    </div>

    <div class="TimerLine" id="TimerLine">
      <div class="MainLine">
        <span id="TimerMain">—</span>
        <span id="TimerRemain">—</span>
      </div>
      <div class="SubLine" id="TimerSub">—</div>
    </div>

    ${controls}
  `;

  if (isSameDay) {
    document.getElementById("NextRangeBtn")?.addEventListener("click", () => {
      moveToNext(session);
      Storage.save(AppState.data);
      render();
    });

    document.getElementById("MarkCurrentBtn")?.addEventListener("click", () => {
      const current = getCurrentOccurrence(session);
      if (!current) return;
      session.doneByOccId[current.occurrenceId] = true;
      moveToNext(session);
      Storage.save(AppState.data);
      render();
    });

    startTimerTick(session);
  }
}

function getCurrentOccurrence(session) {
  if (!session.plan || session.plan.length === 0) return null;

  // Garantiza que currentIndex apunte a algo válido; si ese está hecho, busca pendiente
  const current = session.plan[session.currentIndex] ?? null;
  if (current && !session.doneByOccId[current.occurrenceId]) return current;

  // Busca el primero pendiente
  const idx = session.plan.findIndex(o => !session.doneByOccId[o.occurrenceId]);
  if (idx >= 0) {
    session.currentIndex = idx;
    return session.plan[idx];
  }

  // Si todo está hecho, devuelve el current
  return current;
}

function startTimerTick(session) {
  const tick = () => {
    const current = getCurrentOccurrence(session);
    const mainEl = document.getElementById("TimerMain");
    const remainEl = document.getElementById("TimerRemain");
    const subEl = document.getElementById("TimerSub");

    if (!mainEl || !remainEl || !subEl) return;

    if (!current) {
      mainEl.textContent = "Sin rango actual";
      remainEl.textContent = "";
      subEl.textContent = "";
      return;
    }

    const schedule = buildSchedule(session);
    const item = schedule.find(x => x.occurrenceId === current.occurrenceId);

    mainEl.textContent = `R${current.rangeOrder} · ${current.title}`;

    if (!item || item.durationSec <= 0) {
      remainEl.textContent = "Sin duración";
      subEl.textContent = "Define minutos para ver el temporizador en tiempo real";
      return;
    }

    const now = Date.now();
    const endMs = item.endMs;
    const startMs = item.startMs;
    const remainSec = Math.max(0, Math.floor((endMs - now) / 1000));
    const elapsedSec = Math.max(0, Math.floor((now - startMs) / 1000));

    remainEl.textContent = `-${DateUtils.formatHMS(remainSec)}`;
    subEl.textContent = `Transcurrido ${DateUtils.formatHMS(elapsedSec)} · Faltan ${DateUtils.formatHMS(remainSec)} para concluir`;

    // También calcula restante estimado del día (solo de pendientes con duración)
    const pendingRemainSec = schedule
      .filter(x => !session.doneByOccId[x.occurrenceId])
      .reduce((acc, x) => acc + Math.max(0, x.endMs - Math.max(now, x.startMs)), 0);

    const pendingRemainTotalSec = Math.floor(pendingRemainSec / 1000);
    subEl.textContent += ` · Restante total (estimado): ${DateUtils.formatHMS(pendingRemainTotalSec)}`;
  };

  tick();
  timerTickId = setInterval(tick, 1000);
}

function stopTimerTick() {
  if (timerTickId) {
    clearInterval(timerTickId);
    timerTickId = null;
  }
}

function buildSchedule(session) {
  const startMs = new Date(session.startedAtIso).getTime();
  let cursorMs = startMs;

  const schedule = [];
  for (const occ of session.plan) {
    const durationSec = (occ.durationMin ? Number(occ.durationMin) : 0) * 60;
    const item = {
      occurrenceId: occ.occurrenceId,
      startMs: cursorMs,
      durationSec,
      endMs: cursorMs + durationSec * 1000
    };
    schedule.push(item);
    cursorMs = item.endMs;
  }
  return schedule;
}

/* -------------------------
   Event Sheet (Agregar/Editar) + Descanso
-------------------------- */

function openEventSheetForCreate() {
  Dom.EventSheetTitle.textContent = "Agregar Evento";
  Dom.DeleteBtn.hidden = true;

  Dom.EventId.value = "";
  Dom.EventKind.value = "event";

  Dom.TitleInput.value = "";
  Dom.RangeOrderInput.value = "10";
  Dom.DurationInput.value = "45";
  Dom.NotesInput.value = "";

  Dom.RepeatType.value = "none";
  Dom.StartOnInput.value = DateUtils.toLocalDateKey(AppState.anchorDate);

  renderRepeatConfig(Dom.RepeatConfig, Dom.RepeatType.value, null);
  applyKindUI();
  openEventSheet();
}

function openEventSheetForEdit(event) {
  Dom.EventSheetTitle.textContent = "Editar Evento";
  Dom.DeleteBtn.hidden = false;

  Dom.EventId.value = event.id;
  Dom.EventKind.value = event.kind ?? (isRestTitle(event.title) ? "rest" : "event");

  Dom.TitleInput.value = event.title ?? "";
  Dom.RangeOrderInput.value = String(event.rangeOrder ?? 10);
  Dom.DurationInput.value = event.durationMin ?? "";
  Dom.NotesInput.value = event.notes ?? "";

  Dom.RepeatType.value = event.repeat?.type ?? "none";
  Dom.StartOnInput.value = event.startOn ?? DateUtils.toLocalDateKey(AppState.anchorDate);

  renderRepeatConfig(Dom.RepeatConfig, Dom.RepeatType.value, event);
  applyKindUI();
  openEventSheet();
}

function applyKindUI() {
  const kind = Dom.EventKind.value;

  if (kind === "rest") {
    Dom.TitleWrap.style.display = "none";
    Dom.NotesWrap.style.display = "none";
    Dom.TitleInput.required = false;

    // Descanso: título fijo
    Dom.TitleInput.value = "Descanso";
  } else {
    Dom.TitleWrap.style.display = "";
    Dom.NotesWrap.style.display = "";
    Dom.TitleInput.required = true;

    if (isRestTitle(Dom.TitleInput.value)) Dom.TitleInput.value = "";
  }
}

function openEventSheet() {
  Dom.Overlay.hidden = false;
  Dom.EventSheet.hidden = false;
}

function closeEventSheet() {
  Dom.Overlay.hidden = true;
  Dom.EventSheet.hidden = true;
}

function showToastLikeNotice(message) {
  // Se muestra un aviso simple en la caja superior (sin iniciar sesión)
  Dom.ActiveSession.classList.add("isVisible");
  Dom.ActiveSession.innerHTML = `
    <div class="TimerLine">
      <div class="MainLine">
        <span>AgendX</span>
        <span>⚠️</span>
      </div>
      <div class="SubLine">${escapeHtml(message)}</div>
    </div>
  `;

  // Se oculta luego de unos segundos para no estorbar
  window.clearTimeout(showToastLikeNotice._t);
  showToastLikeNotice._t = window.setTimeout(() => {
    // Solo se limpia si NO se inició nada entre tanto
    const dayKey = DateUtils.toLocalDateKey(AppState.anchorDate);
    if (!AppState.data.activeDaySession || AppState.data.activeDaySession.dayKey !== dayKey) {
      Dom.ActiveSession.classList.remove("isVisible");
      Dom.ActiveSession.innerHTML = "";
    }
  }, 3200);
}

function onSubmitEvent(e) {
  e.preventDefault();

  const id = Dom.EventId.value || crypto.randomUUID();
  const kind = Dom.EventKind.value;

  const title = (kind === "rest") ? "Descanso" : Dom.TitleInput.value.trim();
  const rangeOrder = Number(Dom.RangeOrderInput.value);
  const durationMin = Dom.DurationInput.value ? Number(Dom.DurationInput.value) : null;
  const notes = (kind === "rest") ? "" : Dom.NotesInput.value.trim();

  const startOn = Dom.StartOnInput.value || DateUtils.toLocalDateKey(new Date());
  const repeatType = Dom.RepeatType.value;

  const weekdayFilter = getWeekdayFilter(Dom.RepeatConfig);
  const repeat = buildRepeat(repeatType, Dom.RepeatConfig);

  const payload = {
    id,
    kind,
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

  Storage.save(AppState.data);

  // Si el día ya está iniciado, se respeta snapshot (no se recalcula)
  closeEventSheet();
  render();
}

/* -------------------------
   Repeat Config (días permitidos + configs)
-------------------------- */

function renderRepeatConfig(container, type, eventOrNull) {
  const selectedWeekdays = new Set(eventOrNull?.weekdayFilter ?? []);

  const weekdaysBlock = `
    <div class="Field">
      <span>Días permitidos (uno o varios)</span>
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

function updateStartDayButtonState() {
  const dayKey = DateUtils.toLocalDateKey(AppState.anchorDate);
  const sessionSameDay = AppState.data.activeDaySession?.dayKey === dayKey;

  // Si ya se inició este día, el botón deja de servir (solo inicia)
  if (sessionSameDay) {
    Dom.StartDayBtn.disabled = true;
    Dom.StartDayBtn.textContent = "Día iniciado";
    Dom.StartDayBtn.title = "Ya se inició este día";
    return;
  }

  // Se calcula el plan efectivo del día (incluye regla de descansos)
  const plan = buildDayPlan(dayKey);
  const hasPlan = Array.isArray(plan) && plan.length > 0;

  Dom.StartDayBtn.disabled = !hasPlan;
  Dom.StartDayBtn.textContent = "Iniciar día";
  Dom.StartDayBtn.title = hasPlan
    ? "Inicia todos los rangos de hoy"
    : "Agrega al menos un evento para poder iniciar";
}

/* -------------------------
   Helpers
-------------------------- */

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