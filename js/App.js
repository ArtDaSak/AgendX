import { Api } from "./Storage.js";
import { Recurrence } from "./Recurrence.js";
import { DateUtils } from "./DateUtils.js";

const AppState = {
  view: "today",
  anchorDate: new Date(),

  isHydrated: false,
  isSaving: false,

  data: {
    events: [],
    activeDaySession: null
  }
};

let timerTickId = null;

// Se acumulan patches para no spamear la API
let pendingRecPatch = null;
let pendingRecPatchTimer = null;

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

boot().catch(err => {
  console.error(err);
  showToastLikeNotice("No se pudo cargar MockAPI. Revisa tu conexión o la URL.");
  render();
});

async function boot() {
  AppState.anchorDate = new Date();
  AppState.anchorDate.setSeconds(0, 0);

  wireEvents();
  renderLoading();

  await hydrateFromApi();
  AppState.isHydrated = true;

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

  Dom.DeleteBtn.addEventListener("click", onDeleteEvent);
}

async function hydrateFromApi() {
  // Se cargan eventos
  const events = await Api.getEvents();
  AppState.data.events = Array.isArray(events) ? events : [];

  // Se cargan recurrences y se aplica limpieza
  const recs = await Api.getRecurrences();
  const list = Array.isArray(recs) ? recs : [];

  const todayKey = DateUtils.toLocalDateKey(new Date());
  const now = Date.now();

  // Se busca un active
  const actives = list.filter(r => r.status === "active");
  for (const r of actives) {
    const keepUntil = r.keepUntil ? new Date(r.keepUntil).getTime() : null;
    const shouldDelete = (r.dayKey !== todayKey) || (keepUntil && now > keepUntil);

    if (shouldDelete) {
      await safeDeleteRecurrence(r.id);
    }
  }

  // Se recarga una vez más y se toma el active de hoy si existe
  const recs2 = await Api.getRecurrences();
  const list2 = Array.isArray(recs2) ? recs2 : [];

  const todayActive = list2.find(r => r.status === "active" && r.dayKey === todayKey) ?? null;

  if (todayActive) {
    AppState.data.activeDaySession = {
      remoteId: todayActive.id,
      dayKey: todayActive.dayKey,
      startedAtIso: todayActive.startedAtIso,
      planCount: todayActive.plan?.length ?? 0,
      plan: Array.isArray(todayActive.plan) ? todayActive.plan : [],
      doneByOccId: todayActive.doneByOccId ?? {},
      currentIndex: Number(todayActive.currentIndex ?? 0)
    };
  } else {
    AppState.data.activeDaySession = null;
  }
}

function renderLoading() {
  Dom.OccurrenceList.innerHTML = `<div class="Empty">Cargando datos…</div>`;
  Dom.StartDayBtn.disabled = true;
  Dom.OpenCreateBtn.disabled = true;
}

function shiftAnchor(direction) {
  if (AppState.view === "today") AppState.anchorDate = DateUtils.addDays(AppState.anchorDate, direction);
  else if (AppState.view === "week") AppState.anchorDate = DateUtils.addDays(AppState.anchorDate, direction * 7);
  else AppState.anchorDate = DateUtils.addDays(AppState.anchorDate, direction * 30);

  render();
}

function render() {
  stopTimerTick();

  if (!AppState.isHydrated) {
    renderLoading();
    return;
  }

  Dom.OpenCreateBtn.disabled = AppState.isSaving;

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

    // Si el día está iniciado, se muestra el snapshot guardado en MockAPI
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
   Botón Iniciar día
-------------------------- */

function updateStartDayButtonState() {
  const todayKey = DateUtils.toLocalDateKey(new Date());
  const dayKey = DateUtils.toLocalDateKey(AppState.anchorDate);

  // Solo se permite iniciar el día de hoy, para evitar múltiples actives
  if (dayKey !== todayKey) {
    Dom.StartDayBtn.disabled = true;
    Dom.StartDayBtn.textContent = "Iniciar día";
    Dom.StartDayBtn.title = "Solo se puede iniciar el día de hoy";
    return;
  }

  const sessionSameDay = AppState.data.activeDaySession?.dayKey === dayKey;

  if (sessionSameDay) {
    Dom.StartDayBtn.disabled = true;
    Dom.StartDayBtn.textContent = "Día iniciado";
    Dom.StartDayBtn.title = "Ya se inició este día";
    return;
  }

  const plan = buildDayPlan(dayKey);
  const hasPlan = Array.isArray(plan) && plan.length > 0;

  Dom.StartDayBtn.disabled = !hasPlan || AppState.isSaving;
  Dom.StartDayBtn.textContent = "Iniciar día";
  Dom.StartDayBtn.title = hasPlan ? "Inicia todos los rangos de hoy" : "Agrega al menos un evento para poder iniciar";
}

async function startDayOnly() {
  if (!AppState.isHydrated || AppState.isSaving) return;

  const todayKey = DateUtils.toLocalDateKey(new Date());
  const dayKey = DateUtils.toLocalDateKey(AppState.anchorDate);

  if (dayKey !== todayKey) {
    showToastLikeNotice("Solo puedes iniciar el día de hoy.");
    return;
  }

  if (AppState.data.activeDaySession?.dayKey === dayKey) return;

  const plan = buildDayPlan(dayKey);

  // Si no hay rangos, no se permite iniciar
  if (!plan || plan.length === 0) {
    showToastLikeNotice("No puedes iniciar el día porque no hay eventos para hoy.");
    return;
  }

  AppState.isSaving = true;
  render();

  const nowIso = new Date().toISOString();
  const keepUntilIso = endOfDayIso(dayKey);

  const doneByOccId = Object.fromEntries(plan.map(o => [o.occurrenceId, false]));

  const payload = {
    dayKey,
    status: "active",
    startedAtIso: nowIso,
    endedAtIso: null,
    plan,
    doneByOccId,
    currentIndex: 0,
    keepUntil: keepUntilIso,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  try {
    // Se asegura que no exista otro active remoto
    const recs = await Api.getRecurrences();
    const actives = (Array.isArray(recs) ? recs : []).filter(r => r.status === "active");
    for (const r of actives) {
      await safeDeleteRecurrence(r.id);
    }

    const created = await Api.createRecurrence(payload);

    AppState.data.activeDaySession = {
      remoteId: created.id,
      dayKey: created.dayKey,
      startedAtIso: created.startedAtIso,
      planCount: created.plan?.length ?? plan.length,
      plan: created.plan ?? plan,
      doneByOccId: created.doneByOccId ?? doneByOccId,
      currentIndex: Number(created.currentIndex ?? 0)
    };
  } catch (err) {
    console.error(err);
    showToastLikeNotice("No se pudo iniciar el día en MockAPI.");
  } finally {
    AppState.isSaving = false;
    render();
  }
}

function endOfDayIso(dayKey) {
  const d = DateUtils.fromLocalDateKey(dayKey);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/* -------------------------
   Plan del día + Regla Descanso
-------------------------- */

function buildDayPlan(dayKey) {
  const dayStart = DateUtils.fromLocalDateKey(dayKey);
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 59, 999);

  const occ = Recurrence.buildOccurrences(AppState.data.events, dayStart, dayEnd);
  return applyRestOverride(occ, dayKey);
}

function applyRestOverride(occurrences, dayKey) {
  const dayList = occurrences.filter(o => o.dayKey === dayKey);

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
  const session = AppState.data.activeDaySession;
  const dayKey = DateUtils.toLocalDateKey(AppState.anchorDate);

  if (!session || session.dayKey !== dayKey) return;

  session.doneByOccId[occurrenceId] = !session.doneByOccId[occurrenceId];

  const current = getCurrentOccurrence(session);
  if (current && session.doneByOccId[current.occurrenceId]) {
    moveToNext(session);
  }

  queueRecurrencePatch({
    doneByOccId: session.doneByOccId,
    currentIndex: session.currentIndex
  });

  render();
}

function moveToNext(session) {
  const total = session.plan.length;
  if (total === 0) return;

  for (let step = 1; step <= total; step++) {
    const idx = (session.currentIndex + step) % total;
    const occ = session.plan[idx];
    if (!session.doneByOccId[occ.occurrenceId]) {
      session.currentIndex = idx;
      return;
    }
  }
}

function getCurrentOccurrence(session) {
  if (!session.plan || session.plan.length === 0) return null;

  const current = session.plan[session.currentIndex] ?? null;
  if (current && !session.doneByOccId[current.occurrenceId]) return current;

  const idx = session.plan.findIndex(o => !session.doneByOccId[o.occurrenceId]);
  if (idx >= 0) {
    session.currentIndex = idx;
    return session.plan[idx];
  }

  return current;
}

/* -------------------------
   Temporizador en vivo + render session
-------------------------- */

function renderActiveDaySession() {
  const session = AppState.data.activeDaySession;
  const anchorKey = DateUtils.toLocalDateKey(AppState.anchorDate);
  const todayKey = DateUtils.toLocalDateKey(new Date());

  if (!session) {
    Dom.ActiveSession.classList.remove("isVisible");
    Dom.ActiveSession.innerHTML = "";
    return;
  }

  // Si cambia el día mientras la app está abierta, se limpia el active remoto
  if (todayKey !== session.dayKey) {
    safeDeleteRecurrence(session.remoteId).finally(() => {
      AppState.data.activeDaySession = null;
      render();
    });
    return;
  }

  const startedAt = new Date(session.startedAtIso);
  const startedTime = DateUtils.formatTimeHHMM(startedAt);

  const isSameDay = session.dayKey === anchorKey;
  const doneCount = Object.values(session.doneByOccId ?? {}).filter(Boolean).length;
  const total = session.plan?.length ?? 0;

  Dom.ActiveSession.classList.add("isVisible");

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
      queueRecurrencePatch({ currentIndex: session.currentIndex });
      render();
    });

    document.getElementById("MarkCurrentBtn")?.addEventListener("click", () => {
      const current = getCurrentOccurrence(session);
      if (!current) return;

      session.doneByOccId[current.occurrenceId] = true;
      moveToNext(session);

      queueRecurrencePatch({
        doneByOccId: session.doneByOccId,
        currentIndex: session.currentIndex
      });

      render();
    });

    startTimerTick(session);
  }
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

    const pendingRemainMs = schedule
      .filter(x => !session.doneByOccId[x.occurrenceId])
      .reduce((acc, x) => acc + Math.max(0, x.endMs - Math.max(now, x.startMs)), 0);

    subEl.textContent =
      `Transcurrido ${DateUtils.formatHMS(elapsedSec)} · Faltan ${DateUtils.formatHMS(remainSec)} para concluir` +
      ` · Restante total (estimado): ${DateUtils.formatHMS(Math.floor(pendingRemainMs / 1000))}`;
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
   CRUD Events -> MockAPI
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
  Dom.StartOnInput.value = DateUtils.toLocalDateKey(new Date());

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
  Dom.StartOnInput.value = event.startOn ?? DateUtils.toLocalDateKey(new Date());

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
    Dom.TitleInput.value = "Descanso";
    Dom.NotesInput.value = "";
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

async function onSubmitEvent(e) {
  e.preventDefault();
  if (AppState.isSaving) return;

  const isEdit = Boolean(Dom.EventId.value);
  const id = Dom.EventId.value || null;
  const kind = Dom.EventKind.value;

  const title = (kind === "rest") ? "Descanso" : Dom.TitleInput.value.trim();
  const rangeOrder = Number(Dom.RangeOrderInput.value);
  const durationMin = Dom.DurationInput.value ? Number(Dom.DurationInput.value) : null;
  const notes = (kind === "rest") ? "" : Dom.NotesInput.value.trim();

  const startOn = Dom.StartOnInput.value || DateUtils.toLocalDateKey(new Date());
  const repeatType = Dom.RepeatType.value;

  const weekdayFilter = getWeekdayFilter(Dom.RepeatConfig);
  const repeat = buildRepeat(repeatType, Dom.RepeatConfig);

  const nowIso = new Date().toISOString();

  const payload = {
    kind,
    title,
    rangeOrder,
    durationMin,
    notes,
    startOn,
    weekdayFilter,
    repeat,
    archived: false,
    updatedAt: nowIso,
    ...(isEdit ? {} : { createdAt: nowIso })
  };

  AppState.isSaving = true;
  render();

  try {
    if (!isEdit) {
      const created = await Api.createEvent(payload);
      AppState.data.events.push(created);
    } else {
      const updated = await Api.updateEvent(id, payload);
      const idx = AppState.data.events.findIndex(x => x.id === id);
      if (idx >= 0) AppState.data.events[idx] = updated;
    }

    closeEventSheet();
  } catch (err) {
    console.error(err);
    showToastLikeNotice("No se pudo guardar el evento en MockAPI.");
  } finally {
    AppState.isSaving = false;
    render();
  }
}

async function onDeleteEvent() {
  const id = Dom.EventId.value;
  if (!id || AppState.isSaving) return;

  AppState.isSaving = true;
  render();

  try {
    await Api.deleteEvent(id);
    AppState.data.events = AppState.data.events.filter(e => e.id !== id);
    closeEventSheet();
  } catch (err) {
    console.error(err);
    showToastLikeNotice("No se pudo eliminar el evento en MockAPI.");
  } finally {
    AppState.isSaving = false;
    render();
  }
}

/* -------------------------
   Persistencia progreso -> MockAPI (recurrences)
-------------------------- */

function queueRecurrencePatch(fields) {
  const session = AppState.data.activeDaySession;
  if (!session?.remoteId) return;

  const nowIso = new Date().toISOString();
  pendingRecPatch = { ...(pendingRecPatch ?? {}), ...fields, updatedAt: nowIso };

  clearTimeout(pendingRecPatchTimer);
  pendingRecPatchTimer = setTimeout(async () => {
    const patch = pendingRecPatch;
    pendingRecPatch = null;

    try {
      await Api.patchRecurrence(session.remoteId, {
        dayKey: session.dayKey,
        status: "active",
        startedAtIso: session.startedAtIso,
        endedAtIso: null,
        plan: session.plan,
        keepUntil: endOfDayIso(session.dayKey),
        ...patch
      });
    } catch (err) {
      console.error(err);
      showToastLikeNotice("No se pudo sincronizar el progreso con MockAPI.");
    }
  }, 450);
}

async function safeDeleteRecurrence(id) {
  try {
    await Api.deleteRecurrence(id);
  } catch (err) {
    console.error(err);
  }
}

/* -------------------------
   Repeat Config (UI)
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

/* -------------------------
   Avisos
-------------------------- */

function showToastLikeNotice(message) {
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

  window.clearTimeout(showToastLikeNotice._t);
  showToastLikeNotice._t = window.setTimeout(() => {
    // Se limpia si no hay sesión activa
    if (!AppState.data.activeDaySession) {
      Dom.ActiveSession.classList.remove("isVisible");
      Dom.ActiveSession.innerHTML = "";
    }
  }, 3200);
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