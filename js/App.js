import { Api } from "./Storage.js";
import { Recurrence } from "./Recurrence.js";
import { DateUtils } from "./DateUtils.js";

/*
    AgendX V1
    - Vanilla + MockAPI (events, recurrences)
    - Tema oscuro, mobile-first
    - Agenda por rangos (sin horas fijas)
    - Día iniciado con progreso por rango y temporizador en tiempo real
    - Drag & Drop para reordenar (auto-gestiona prioridades)
    - Dropdowns custom con modal (Picker)
    - Notas renderizadas como Markdown (después de guardar)
    - Confirmación para eliminar rango y finalizar día
    - Recalcula plan si se edita/elimina evento con día iniciado
    - Sustituye solo ⚠️ y ✅ por iconos Lucide
    - Indentación 4 espacios
*/

const AppState = {
    view: "today",
    anchorDate: new Date(),
    isHydrated: false,
    isSaving: false,
    actionLockUntil: 0,

    data: {
        events: [],
        activeDaySession: null
    }
};

const UiState = {
    durationUnit: "min",
    drag: {
        isActive: false,
        pointerId: null,
        dragRow: null,
        placeholder: null
    },

    confirm: {
        isOpen: false,
        resolve: null
    },

    picker: {
        isOpen: false,
        resolve: null
    }
};

let timerTickId = null;
let pendingSessionSaveTimer = null;

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
    EventKindBtn: document.getElementById("EventKindBtn"),

    RangeOrderInput: document.getElementById("RangeOrderInput"),
    TitleWrap: document.getElementById("TitleWrap"),
    NotesWrap: document.getElementById("NotesWrap"),
    TitleInput: document.getElementById("TitleInput"),

    DurationInput: document.getElementById("DurationInput"),
    DurationUnitBtn: document.getElementById("DurationUnitBtn"),
    DurationHelp: document.getElementById("DurationHelp"),

    NotesInput: document.getElementById("NotesInput"),
    StartOnInput: document.getElementById("StartOnInput"),

    RepeatType: document.getElementById("RepeatType"),
    RepeatTypeBtn: document.getElementById("RepeatTypeBtn"),
    RepeatConfig: document.getElementById("RepeatConfig"),

    ConfirmOverlay: document.getElementById("ConfirmOverlay"),
    ConfirmModal: document.getElementById("ConfirmModal"),
    ConfirmTitle: document.getElementById("ConfirmTitle"),
    ConfirmBody: document.getElementById("ConfirmBody"),
    ConfirmCloseBtn: document.getElementById("ConfirmCloseBtn"),
    ConfirmCancelBtn: document.getElementById("ConfirmCancelBtn"),
    ConfirmOkBtn: document.getElementById("ConfirmOkBtn"),

    PickerOverlay: document.getElementById("PickerOverlay"),
    PickerModal: document.getElementById("PickerModal"),
    PickerTitle: document.getElementById("PickerTitle"),
    PickerBody: document.getElementById("PickerBody"),
    PickerCloseBtn: document.getElementById("PickerCloseBtn"),
    PickerCancelBtn: document.getElementById("PickerCancelBtn")
};

boot();

/* -------------------------
   Boot
-------------------------- */

async function boot() {
    AppState.anchorDate = new Date();
    AppState.anchorDate.setSeconds(0, 0);

    wireUi();
    renderLoading();

    try {
        await hydrateFromApi();
        AppState.isHydrated = true;
    } catch (err) {
        console.error(err);
        AppState.isHydrated = true;
        showToastLikeNotice("No se pudo cargar MockAPI. Revisa la URL o conexión.", "warn");
    }

    initLucideAndFavicon();

    render();
}

function renderLoading() {
    Dom.OccurrenceList.innerHTML = `<div class="Empty">Cargando…</div>`;
    Dom.StartDayBtn.disabled = true;
    Dom.OpenCreateBtn.disabled = true;
}

/* -------------------------
   Lucide helpers
-------------------------- */

function refreshLucideIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
    }
}

function initLucideAndFavicon() {
    const tryInit = () => {
        if (!window.lucide || typeof window.lucide.createIcons !== "function") {
            requestAnimationFrame(tryInit);
            return;
        }

        window.lucide.createIcons();

        const sourceSvg = document.querySelector("#faviconSource svg");
        if (!sourceSvg) return;

        const iconInner = sourceSvg.innerHTML;

        const faviconSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <defs>
                    <linearGradient id="agx" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="#ea00d9"/>
                        <stop offset="55%" stop-color="#0abdc6"/>
                        <stop offset="100%" stop-color="#711c91"/>
                    </linearGradient>
                </defs>

                <rect x="0" y="0" width="24" height="24" rx="5" fill="url(#agx)"/>
                <g stroke="#ebebff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
                    ${iconInner}
                </g>
            </svg>
        `.trim();

        const href = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(faviconSvg);

        let link = document.querySelector('link[rel="icon"]');
        if (!link) {
            link = document.createElement("link");
            link.rel = "icon";
            document.head.appendChild(link);
        }

        link.type = "image/svg+xml";
        link.href = href;
    };

    tryInit();
}

/* -------------------------
   Locks
-------------------------- */

function lockAction(ms = 350) {
    const now = Date.now();
    if (now < AppState.actionLockUntil) return false;
    AppState.actionLockUntil = now + ms;
    return true;
}

/* -------------------------
   UI wiring
-------------------------- */

function wireUi() {
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
        AppState.anchorDate.setSeconds(0, 0);
        render();
    });

    Dom.StartDayBtn.addEventListener("click", startDayOnly);

    Dom.OpenCreateBtn.addEventListener("click", openEventSheetForCreate);
    Dom.CloseEventSheetBtn.addEventListener("click", closeEventSheet);
    Dom.CancelEventBtn.addEventListener("click", closeEventSheet);
    Dom.Overlay.addEventListener("click", closeEventSheet);

    Dom.EventKindBtn.addEventListener("click", onPickKind);
    Dom.RepeatTypeBtn.addEventListener("click", onPickRepeat);
    Dom.DurationUnitBtn.addEventListener("click", onToggleDurationUnit);

    Dom.EventForm.addEventListener("submit", onSubmitEvent);
    Dom.DeleteBtn.addEventListener("click", onDeleteEvent);

    Dom.OccurrenceList.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;

        const editId = btn.dataset.edit;
        const toggleId = btn.dataset.toggleDone;

        if (editId) {
            const found = AppState.data.events.find(ev => String(ev.id) === String(editId));
            if (found) openEventSheetForEdit(found);
            return;
        }

        if (toggleId) {
            toggleDone(toggleId);
        }
    });

    Dom.ActiveSession.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;

        const action = btn.dataset.action;
        if (!action) return;

        if (action === "next") {
            nextRange();
            return;
        }

        if (action === "mark") {
            markCurrentOnly();
            return;
        }

        if (action === "finalize") {
            finalizeDayWithModal();
        }
    });

    wireConfirmModalOnce();
    wirePickerModalOnce();
    enableSortablePointerDnD();
}

/* -------------------------
   Range by view
-------------------------- */

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

function shiftAnchor(direction) {
    if (AppState.view === "today") AppState.anchorDate = DateUtils.addDays(AppState.anchorDate, direction);
    else if (AppState.view === "week") AppState.anchorDate = DateUtils.addDays(AppState.anchorDate, direction * 7);
    else AppState.anchorDate = DateUtils.addDays(AppState.anchorDate, direction * 30);

    render();
}

/* -------------------------
   Render core
-------------------------- */

function render() {
    stopTimerTick();

    if (!AppState.isHydrated) {
        renderLoading();
        return;
    }

    Dom.OpenCreateBtn.disabled = AppState.isSaving;

    if (AppState.view === "today" && AppState.data.activeDaySession?.dayKey) {
        const sk = AppState.data.activeDaySession.dayKey;
        const ak = DateUtils.toLocalDateKey(AppState.anchorDate);
        if (ak !== sk) AppState.anchorDate = DateUtils.fromLocalDateKey(sk);
    }

    renderActiveDaySession();
    updateStartDayButtonState();

    const { rangeStart, rangeEnd, title } = computeRange();
    Dom.ListTitle.textContent = title;

    let occurrences = Recurrence.buildOccurrences(AppState.data.events, rangeStart, rangeEnd);

    if (AppState.view === "week") {
        occurrences = occurrences.filter(o => (o.repeat?.type ?? "none") !== "daily");
    }

    const anchorKey = DateUtils.toLocalDateKey(AppState.anchorDate);
    const session = AppState.data.activeDaySession;

    if (AppState.view === "today") {
        if (session?.dayKey === anchorKey) {
            occurrences = session.plan ?? [];
        } else {
            occurrences = applyRestOverride(occurrences, anchorKey);
        }
    }

    if (occurrences.length === 0) {
        Dom.OccurrenceList.innerHTML = `<div class="Empty">No hay eventos en este rango</div>`;
        refreshLucideIcons();
        return;
    }

    let currentOccId = null;
    if (session?.dayKey === anchorKey) {
        currentOccId = getCurrentOccurrence(session)?.occurrenceId ?? null;
    }

    Dom.OccurrenceList.innerHTML = renderOccurrences(occurrences, AppState.view, currentOccId);
    refreshLucideIcons();
}

function renderOccurrences(occurrences, view, currentOccId) {
    if (view === "today") {
        return occurrences
            .slice()
            .sort((a, b) => (Number(a.rangeOrder) - Number(b.rangeOrder)) || String(a.eventId).localeCompare(String(b.eventId)))
            .map(o => rowHtml(o, currentOccId))
            .join("");
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
        html += list
            .slice()
            .sort((a, b) => (Number(a.rangeOrder) - Number(b.rangeOrder)) || String(a.eventId).localeCompare(String(b.eventId)))
            .map(o => rowHtml(o, null))
            .join("");
    }

    return html;
}

function rowHtml(occ, currentOccId) {
    const repeatLabel = repeatToLabel(occ.repeat?.type ?? "none");
    const isRest = isRestTitle(occ.title);

    const session = AppState.data.activeDaySession;
    const dayActive = session?.dayKey === occ.dayKey;

    const done = dayActive ? Boolean(session?.doneByOccId?.[occ.occurrenceId]) : false;
    const doneBadge = dayActive ? `<span class="Badge ${done ? "isDone" : ""}">${done ? "Hecho" : "Pendiente"}</span>` : "";

    const toggleBtn = dayActive
        ? `<button class="GhostBtn" type="button" data-toggle-done="${occ.occurrenceId}">${done ? "Desmarcar" : "Hecho"}</button>`
        : "";

    const notesHtml = (occ.notes && occ.notes.trim())
        ? `<div class="NotesMd">${renderMarkdown(occ.notes)}</div>`
        : "";

    const isCurrent = currentOccId && occ.occurrenceId === currentOccId ? "isCurrent" : "";

    const handleHtml = (AppState.view === "today")
        ? `<div class="DragHandle" data-drag-handle="true" aria-label="Reordenar">≡</div>`
        : "";

    return `
        <article class="Row ${isCurrent}" data-occ-id="${escapeHtml(occ.occurrenceId)}" data-event-id="${escapeHtml(occ.eventId)}">
            <div class="RowTop">
                <div style="display:flex; gap:10px; align-items:flex-start; min-width:0;">
                    ${handleHtml}
                    <div class="TitleLine">
                        <strong>R${Number(occ.rangeOrder)} · ${escapeHtml(occ.title)}</strong>
                        ${notesHtml}
                    </div>
                </div>

                <div class="Badges">
                    <span class="Badge ${isRest ? "isWarn" : "isAccent"}">${repeatLabel}</span>
                    ${occ.durationMin ? `<span class="Badge isCyan">${Number(occ.durationMin)} min</span>` : ""}
                    ${doneBadge}
                </div>
            </div>

            <div class="RowActions">
                ${toggleBtn}
                <button class="GhostBtn" type="button" data-edit="${escapeHtml(occ.eventId)}">Editar</button>
            </div>
        </article>
    `;
}

/* -------------------------
   Active day session UI
-------------------------- */

function renderActiveDaySession() {
    const session = AppState.data.activeDaySession;

    if (!session) {
        Dom.ActiveSession.classList.remove("isVisible");
        Dom.ActiveSession.innerHTML = "";
        return;
    }

    const startedAt = new Date(session.startedAtIso);
    const startedTime = DateUtils.formatTimeHHMM(startedAt);

    const doneCount = Object.values(session.doneByOccId ?? {}).filter(Boolean).length;
    const total = session.plan?.length ?? 0;

    Dom.ActiveSession.classList.add("isVisible");

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

        <div class="RowActions" style="justify-content:flex-end">
            <button class="GhostBtn" type="button" data-action="next" ${AppState.isSaving ? "disabled" : ""}>Siguiente rango</button>
            <button class="PrimaryBtn" type="button" data-action="mark" ${AppState.isSaving ? "disabled" : ""}>Marcar hecho</button>
            <button class="DangerBtn" type="button" data-action="finalize" ${AppState.isSaving ? "disabled" : ""}>Finalizar día</button>
        </div>
    `;

    refreshLucideIcons();
    startTimerTick(session);
}

/* -------------------------
   Timer logic
-------------------------- */

function startTimerTick(session) {
    const tick = () => {
        const timerLine = document.getElementById("TimerLine");
        const mainEl = document.getElementById("TimerMain");
        const remainEl = document.getElementById("TimerRemain");
        const subEl = document.getElementById("TimerSub");

        if (!mainEl || !remainEl || !subEl) return;

        const total = session.plan?.length ?? 0;
        const doneCount = Object.values(session.doneByOccId ?? {}).filter(Boolean).length;

        if (total > 0 && doneCount === total) {
            mainEl.innerHTML = `Día completado <span class="UiIcon"><i data-lucide="check-circle"></i></span>`;
            remainEl.textContent = "";
            subEl.textContent = "Todo listo. Puedes finalizar el día.";
            timerLine?.classList.remove("isRunning");
            refreshLucideIcons();
            return;
        }

        const current = getCurrentOccurrence(session);

        if (!current) {
            mainEl.textContent = "Sin rango actual";
            remainEl.textContent = "";
            subEl.textContent = "";
            timerLine?.classList.remove("isRunning");
            return;
        }

        const schedule = buildSchedule(session);
        const item = schedule.find(x => x.occurrenceId === current.occurrenceId);

        mainEl.textContent = `R${Number(current.rangeOrder)} · ${current.title}`;

        if (!item || item.durationSec <= 0) {
            remainEl.textContent = "Sin duración";
            subEl.textContent = "Define un tiempo para ver el temporizador";
            timerLine?.classList.remove("isRunning");
            return;
        }

        const now = Date.now();
        const remainSec = Math.max(0, Math.floor((item.endMs - now) / 1000));
        const elapsedSec = Math.max(0, Math.floor((now - item.startMs) / 1000));
        remainEl.textContent = `-${DateUtils.formatHMS(remainSec)}`;

        const pendingRemainMs = schedule
            .filter(x => !session.doneByOccId[x.occurrenceId])
            .reduce((acc, x) => acc + Math.max(0, x.endMs - Math.max(now, x.startMs)), 0);

        subEl.innerHTML = `
            <div>Transcurrido ${DateUtils.formatHMS(elapsedSec)}</div>
            <div>Faltan ${DateUtils.formatHMS(remainSec)} para concluir</div>
            <div>Restante total (estimado): ${DateUtils.formatHMS(Math.floor(pendingRemainMs / 1000))}</div>
        `;

        timerLine?.classList.add("isRunning");
    };

    tick();
    stopTimerTick();
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
   Day started actions
-------------------------- */

function nextRange() {
    if (!lockAction()) return;

    const session = AppState.data.activeDaySession;
    if (!session) return;

    moveToNext(session);
    queueActiveSessionSave();
    render();
}

function markCurrentOnly() {
    if (!lockAction()) return;

    const session = AppState.data.activeDaySession;
    if (!session) return;

    const current = getCurrentOccurrence(session);
    if (!current) return;

    session.doneByOccId[current.occurrenceId] = true;

    moveToNext(session);
    queueActiveSessionSave();
    render();
}

async function finalizeDayWithModal() {
    const session = AppState.data.activeDaySession;
    if (!session?.remoteId || AppState.isSaving) return;

    const total = session.plan?.length ?? 0;
    const doneCount = Object.values(session.doneByOccId ?? {}).filter(Boolean).length;

    const ok = await openConfirmModal({
        title: "Finalizar día",
        body:
            `Día activo: ${session.dayKey}\n` +
            `Progreso: ${doneCount}/${total}\n\n` +
            `Esto cerrará la sesión y borrará el progreso del día en MockAPI.`,
        okText: "Sí, finalizar",
        cancelText: "Cancelar"
    });

    if (!ok) return;

    AppState.isSaving = true;
    render();

    try {
        clearTimeout(pendingSessionSaveTimer);
        await Api.deleteRecurrence(session.remoteId);

        AppState.data.activeDaySession = null;
        showToastLikeNotice("Día finalizado", "success");
    } catch (err) {
        console.error(err);
        showToastLikeNotice("No se pudo finalizar el día en MockAPI.", "warn");
    } finally {
        AppState.isSaving = false;
        render();
    }
}

/* -------------------------
   Current index management
-------------------------- */

function getCurrentOccurrence(session) {
    if (!session.plan || session.plan.length === 0) return null;

    const current = session.plan[session.currentIndex] ?? null;
    if (current && !session.doneByOccId[current.occurrenceId]) return current;

    const idx = session.plan.findIndex(o => !session.doneByOccId[o.occurrenceId]);
    if (idx >= 0) {
        session.currentIndex = idx;
        return session.plan[idx];
    }

    return null;
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

/* -------------------------
   Toggle done from card button
-------------------------- */

function toggleDone(occurrenceId) {
    if (!lockAction()) return;

    const session = AppState.data.activeDaySession;
    const dayKey = DateUtils.toLocalDateKey(AppState.anchorDate);

    if (!session || session.dayKey !== dayKey) return;
    if (!occurrenceId || !Object.prototype.hasOwnProperty.call(session.doneByOccId, occurrenceId)) return;

    session.doneByOccId[occurrenceId] = !session.doneByOccId[occurrenceId];

    const current = getCurrentOccurrence(session);
    if (current && session.doneByOccId[current.occurrenceId]) moveToNext(session);

    queueActiveSessionSave();
    render();
}

/* -------------------------
   Session persistence (debounced)
-------------------------- */

function queueActiveSessionSave() {
    clearTimeout(pendingSessionSaveTimer);
    pendingSessionSaveTimer = setTimeout(() => {
        saveActiveSessionToApiNow();
    }, 450);
}

async function saveActiveSessionToApiNow() {
    const session = AppState.data.activeDaySession;
    if (!session?.remoteId) return;

    const payload = {
        dayKey: session.dayKey,
        status: "active",
        startedAtIso: session.startedAtIso,
        endedAtIso: null,
        plan: session.plan,
        doneByOccId: session.doneByOccId,
        currentIndex: session.currentIndex,
        keepUntil: keepUntilIso(session.dayKey),
        updatedAt: new Date().toISOString()
    };

    try {
        await Api.updateRecurrence(session.remoteId, payload);
    } catch (err) {
        console.error(err);
        showToastLikeNotice("No se pudo sincronizar la sesión con MockAPI.", "warn");
    }
}

/* -------------------------
   Start day logic
-------------------------- */

function updateStartDayButtonState() {
    const todayKey = DateUtils.toLocalDateKey(new Date());
    const dayKey = DateUtils.toLocalDateKey(AppState.anchorDate);

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
    if (AppState.isSaving) return;

    const todayKey = DateUtils.toLocalDateKey(new Date());
    const dayKey = DateUtils.toLocalDateKey(AppState.anchorDate);

    if (dayKey !== todayKey) {
        showToastLikeNotice("Solo puedes iniciar el día de hoy.", "warn");
        return;
    }

    if (AppState.data.activeDaySession?.dayKey === dayKey) return;

    const plan = buildDayPlan(dayKey);
    if (!plan || plan.length === 0) {
        showToastLikeNotice("No puedes iniciar el día porque no hay eventos para hoy.", "warn");
        return;
    }

    AppState.isSaving = true;
    render();

    const nowIso = new Date().toISOString();
    const doneByOccId = Object.fromEntries(plan.map(o => [o.occurrenceId, false]));

    const payload = {
        dayKey,
        status: "active",
        startedAtIso: nowIso,
        endedAtIso: null,
        plan,
        doneByOccId,
        currentIndex: 0,
        keepUntil: keepUntilIso(dayKey),
        createdAt: nowIso,
        updatedAt: nowIso
    };

    try {
        const recs = await Api.getRecurrences();
        const actives = (Array.isArray(recs) ? recs : []).filter(r => r.status === "active");
        for (const r of actives) await safeDeleteRecurrence(r.id);

        const created = await Api.createRecurrence(payload);
        setActiveSessionFromRemote(created);

        showToastLikeNotice("Día iniciado", "success");
    } catch (err) {
        console.error(err);
        showToastLikeNotice("No se pudo iniciar el día en MockAPI.", "warn");
    } finally {
        AppState.isSaving = false;
        render();
    }
}

/* -------------------------
   Plan for a day + Rest rule
-------------------------- */

function buildDayPlan(dayKey) {
    const dayStart = DateUtils.fromLocalDateKey(dayKey);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const occ = Recurrence.buildOccurrences(AppState.data.events, dayStart, dayEnd);
    const dayList = applyRestOverride(occ, dayKey);

    dayList.sort((a, b) => (Number(a.rangeOrder) - Number(b.rangeOrder)) || String(a.eventId).localeCompare(String(b.eventId)));

    return dayList;
}

function applyRestOverride(occurrences, dayKey) {
    const dayList = occurrences.filter(o => o.dayKey === dayKey);

    const nonDailyRanges = new Set();
    for (const o of dayList) {
        const type = o.repeat?.type ?? "none";
        if (type !== "daily") nonDailyRanges.add(Number(o.rangeOrder));
    }

    const filtered = dayList.filter(o => {
        if (!isRestTitle(o.title)) return true;
        return !nonDailyRanges.has(Number(o.rangeOrder));
    });

    filtered.sort((a, b) => (Number(a.rangeOrder) - Number(b.rangeOrder)) || String(a.eventId).localeCompare(String(b.eventId)));
    return filtered;
}

function isRestTitle(title) {
    return String(title ?? "").trim().toLowerCase() === "descanso";
}

/* -------------------------
   Recalculate plan when editing/deleting while day is active
-------------------------- */

async function recalcActivePlanIfNeeded() {
    const session = AppState.data.activeDaySession;
    if (!session) return;

    const dayKey = session.dayKey;
    const newPlan = buildDayPlan(dayKey);

    const oldDone = session.doneByOccId ?? {};
    const oldCurrentOccId = getCurrentOccurrence(session)?.occurrenceId ?? null;

    const newDone = {};
    for (const o of newPlan) {
        newDone[o.occurrenceId] = Boolean(oldDone[o.occurrenceId] ?? false);
    }

    session.plan = newPlan;
    session.doneByOccId = newDone;

    if (oldCurrentOccId) {
        const idx = newPlan.findIndex(x => x.occurrenceId === oldCurrentOccId && !newDone[x.occurrenceId]);
        if (idx >= 0) {
            session.currentIndex = idx;
        } else {
            const firstUndone = newPlan.findIndex(x => !newDone[x.occurrenceId]);
            session.currentIndex = firstUndone >= 0 ? firstUndone : 0;
        }
    } else {
        const firstUndone = newPlan.findIndex(x => !newDone[x.occurrenceId]);
        session.currentIndex = firstUndone >= 0 ? firstUndone : 0;
    }

    queueActiveSessionSave();
}

/* -------------------------
   Cross-midnight retention
-------------------------- */

function yesterdayKey() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return DateUtils.toLocalDateKey(DateUtils.addDays(d, -1));
}

function keepUntilIso(dayKey) {
    const d = DateUtils.fromLocalDateKey(dayKey);
    const next = DateUtils.addDays(d, 1);
    next.setHours(23, 59, 59, 999);
    return next.toISOString();
}

/* -------------------------
   API hydration + cleanup
-------------------------- */

async function hydrateFromApi() {
    const events = await Api.getEvents();
    AppState.data.events = Array.isArray(events) ? events : [];

    const recs = await Api.getRecurrences();
    const list = Array.isArray(recs) ? recs : [];

    const yKey = yesterdayKey();
    const now = Date.now();

    for (const r of list) {
        const keepUntil = r.keepUntil ? new Date(r.keepUntil).getTime() : null;
        const expired = keepUntil && now > keepUntil;
        const olderThanYesterday = (r.dayKey && r.dayKey < yKey);

        if (expired || olderThanYesterday) {
            await safeDeleteRecurrence(r.id);
        }
    }

    const recs2 = await Api.getRecurrences();
    const list2 = Array.isArray(recs2) ? recs2 : [];

    const actives = list2.filter(r => r.status === "active" && r.dayKey >= yKey);

    if (actives.length > 1) {
        const sorted = [...actives].sort((a, b) => new Date(b.startedAtIso) - new Date(a.startedAtIso));
        const keep = sorted[0];
        for (const extra of sorted.slice(1)) await safeDeleteRecurrence(extra.id);
        setActiveSessionFromRemote(keep);
    } else if (actives.length === 1) {
        setActiveSessionFromRemote(actives[0]);
    } else {
        AppState.data.activeDaySession = null;
    }
}

async function safeDeleteRecurrence(id) {
    try {
        await Api.deleteRecurrence(id);
    } catch (err) {
        console.error(err);
    }
}

function setActiveSessionFromRemote(remote) {
    const rawPlan = Array.isArray(remote.plan) ? remote.plan : [];
    const oldDone = remote.doneByOccId ?? {};

    const normalizedPlan = rawPlan.map(o => {
        const eventId = String(o.eventId ?? o.id ?? "");
        const dayKey = String(o.dayKey ?? remote.dayKey ?? "");
        const stableId = `${eventId}__${dayKey}`;

        return {
            occurrenceId: stableId,
            eventId,
            dayKey,
            title: String(o.title ?? ""),
            notes: String(o.notes ?? ""),
            rangeOrder: Number(o.rangeOrder ?? 999),
            durationMin: o.durationMin ?? null,
            repeat: o.repeat ?? { type: "none" }
        };
    });

    normalizedPlan.sort((a, b) => (Number(a.rangeOrder) - Number(b.rangeOrder)) || String(a.eventId).localeCompare(String(b.eventId)));

    const newDone = {};
    for (const o of normalizedPlan) {
        const legacyKey = `${o.eventId}__${o.dayKey}__R${o.rangeOrder}`;
        newDone[o.occurrenceId] = Boolean(oldDone[o.occurrenceId] ?? oldDone[legacyKey] ?? false);
    }

    AppState.data.activeDaySession = {
        remoteId: remote.id,
        dayKey: remote.dayKey,
        startedAtIso: remote.startedAtIso,
        keepUntil: remote.keepUntil ?? keepUntilIso(remote.dayKey),
        plan: normalizedPlan,
        doneByOccId: newDone,
        currentIndex: Number(remote.currentIndex ?? 0)
    };
}

/* -------------------------
   Event Sheet: open/create/edit
-------------------------- */

function getSuggestedRangeOrder() {
    const max = AppState.data.events.reduce((acc, e) => Math.max(acc, Number(e.rangeOrder ?? 0)), 0);
    return Math.max(1, max + 1);
}

function openEventSheetForCreate() {
    Dom.EventSheetTitle.textContent = "Agregar evento";
    Dom.DeleteBtn.hidden = true;

    Dom.EventId.value = "";
    Dom.EventKind.value = "event";
    Dom.EventKindBtn.textContent = "Evento";

    Dom.RangeOrderInput.value = String(getSuggestedRangeOrder());

    Dom.TitleInput.value = "";
    UiState.durationUnit = "min";
    Dom.DurationInput.value = "45";
    Dom.NotesInput.value = "";

    Dom.StartOnInput.value = DateUtils.toLocalDateKey(new Date());

    Dom.RepeatType.value = "none";
    Dom.RepeatTypeBtn.textContent = repeatToLabel("none");
    renderRepeatConfig("none", null);

    applyDurationUnitConstraints();
    applyKindUI();
    openEventSheet();
}

function openEventSheetForEdit(event) {
    Dom.EventSheetTitle.textContent = "Editar evento";
    Dom.DeleteBtn.hidden = false;

    Dom.EventId.value = String(event.id);

    const kind = event.kind ?? (isRestTitle(event.title) ? "rest" : "event");
    Dom.EventKind.value = kind;
    Dom.EventKindBtn.textContent = kind === "rest" ? "Descanso" : "Evento";

    Dom.RangeOrderInput.value = String(event.rangeOrder ?? 1);

    Dom.TitleInput.value = String(event.title ?? "");
    Dom.NotesInput.value = String(event.notes ?? "");
    Dom.StartOnInput.value = String(event.startOn ?? DateUtils.toLocalDateKey(new Date()));

    const rt = event.repeat?.type ?? "none";
    Dom.RepeatType.value = rt;
    Dom.RepeatTypeBtn.textContent = repeatToLabel(rt);
    renderRepeatConfig(rt, event);

    const dMin = event.durationMin ? Number(event.durationMin) : null;
    if (dMin && dMin >= 60 && dMin % 60 === 0) {
        UiState.durationUnit = "h";
        Dom.DurationInput.value = String(dMin / 60);
    } else {
        UiState.durationUnit = "min";
        Dom.DurationInput.value = dMin ? String(dMin) : "";
    }

    applyDurationUnitConstraints();
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

/* -------------------------
   Pickers (custom dropdowns)
-------------------------- */

async function onPickKind() {
    const picked = await openPicker({
        title: "Tipo",
        options: [
            { value: "event", label: "Evento" },
            { value: "rest", label: "Descanso" }
        ]
    });

    if (!picked) return;

    Dom.EventKind.value = picked;
    Dom.EventKindBtn.textContent = picked === "rest" ? "Descanso" : "Evento";
    applyKindUI();
}

async function onPickRepeat() {
    const picked = await openPicker({
        title: "Repetición",
        options: [
            { value: "none", label: "Único" },
            { value: "daily", label: "Diario" },
            { value: "weekly", label: "Semanal" },
            { value: "monthly", label: "Mensual" },
            { value: "interval", label: "Cada N días" },
            { value: "dates", label: "Fechas específicas" }
        ]
    });

    if (!picked) return;

    Dom.RepeatType.value = picked;
    Dom.RepeatTypeBtn.textContent = repeatToLabel(picked);
    renderRepeatConfig(picked, null);
}

/* -------------------------
   Duration unit toggle
-------------------------- */

function onToggleDurationUnit(e) {
    e.preventDefault();

    const currentValRaw = String(Dom.DurationInput.value ?? "").trim();
    const currentNum = currentValRaw ? Number(currentValRaw) : null;

    if (UiState.durationUnit === "min") {
        UiState.durationUnit = "h";
        Dom.DurationUnitBtn.textContent = "h";

        if (currentNum !== null && Number.isFinite(currentNum)) {
            const hours = Math.max(1, Math.ceil(currentNum / 60));
            Dom.DurationInput.value = String(hours);
        }
    } else {
        UiState.durationUnit = "min";
        Dom.DurationUnitBtn.textContent = "min";

        if (currentNum !== null && Number.isFinite(currentNum)) {
            const minutes = Math.max(1, Math.round(currentNum * 60));
            Dom.DurationInput.value = String(minutes);
        }
    }

    applyDurationUnitConstraints();
}

function applyDurationUnitConstraints() {
    if (UiState.durationUnit === "min") {
        Dom.DurationInput.min = "1";
        Dom.DurationInput.max = "1440";
        Dom.DurationInput.step = "1";
        Dom.DurationHelp.textContent = "Mínimo 1 minuto, máximo 1440 minutos";
        Dom.DurationUnitBtn.textContent = "min";
    } else {
        Dom.DurationInput.min = "1";
        Dom.DurationInput.max = "24";
        Dom.DurationInput.step = "1";
        Dom.DurationHelp.textContent = "Mínimo 1 hora, máximo 24 horas (se convierte a minutos)";
        Dom.DurationUnitBtn.textContent = "h";
    }
}

/* -------------------------
   Repeat config rendering
-------------------------- */

function renderRepeatConfig(type, event) {
    if (type === "weekly") {
        const picked = new Set((event?.repeat?.daysOfWeek ?? []).map(Number));
        Dom.RepeatConfig.innerHTML = `
            <div class="Field">
                <span>Días de la semana</span>
                <div class="CheckRow">
                    ${renderDowPill(1, "Lun", picked.has(1))}
                    ${renderDowPill(2, "Mar", picked.has(2))}
                    ${renderDowPill(3, "Mié", picked.has(3))}
                    ${renderDowPill(4, "Jue", picked.has(4))}
                    ${renderDowPill(5, "Vie", picked.has(5))}
                    ${renderDowPill(6, "Sáb", picked.has(6))}
                    ${renderDowPill(0, "Dom", picked.has(0))}
                </div>
                <small>Selecciona uno o varios días</small>
            </div>
        `;
        return;
    }

    if (type === "monthly") {
        const dayOfMonth = Number(event?.repeat?.dayOfMonth ?? 1);
        Dom.RepeatConfig.innerHTML = `
            <label class="Field">
                <span>Día del mes</span>
                <input id="RepeatMonthDay" type="number" min="1" max="31" step="1" value="${escapeHtml(dayOfMonth)}" />
                <small>Ej. 1 para el primer día del mes</small>
            </label>
        `;
        return;
    }

    if (type === "interval") {
        const everyDays = Number(event?.repeat?.everyDays ?? 2);
        Dom.RepeatConfig.innerHTML = `
            <label class="Field">
                <span>Cada N días</span>
                <input id="RepeatEveryDays" type="number" min="1" max="365" step="1" value="${escapeHtml(everyDays)}" />
                <small>Ej. 2 para un día sí y un día no</small>
            </label>
        `;
        return;
    }

    if (type === "dates") {
        const list = (event?.repeat?.dateList ?? []).join(", ");
        Dom.RepeatConfig.innerHTML = `
            <label class="Field">
                <span>Fechas</span>
                <textarea id="RepeatDateList" rows="2" maxlength="600" placeholder="YYYY-MM-DD, YYYY-MM-DD">${escapeHtml(list)}</textarea>
                <small>Separadas por coma</small>
            </label>
        `;
        return;
    }

    Dom.RepeatConfig.innerHTML = `<div class="Empty">Sin configuración extra</div>`;
}

function renderDowPill(value, label, checked) {
    const id = `Dow_${value}`;
    return `
        <label class="CheckPill" for="${id}">
            <input id="${id}" type="checkbox" data-dow="${value}" ${checked ? "checked" : ""} style="display:none" />
            ${label}
        </label>
    `;
}

/* -------------------------
   Submit / Delete event
-------------------------- */

async function onSubmitEvent(e) {
    e.preventDefault();
    if (AppState.isSaving) return;

    AppState.isSaving = true;
    render();

    try {
        const id = String(Dom.EventId.value || "").trim();
        const kind = Dom.EventKind.value;

        const rangeOrder = Math.max(1, Number(Dom.RangeOrderInput.value || 1));
        const startOn = String(Dom.StartOnInput.value || DateUtils.toLocalDateKey(new Date())).trim();

        let title = String(Dom.TitleInput.value || "").trim();
        let notes = String(Dom.NotesInput.value || "").trim();

        if (kind === "rest") {
            title = "Descanso";
            notes = "";
        } else {
            if (!title) throw new Error("El título es obligatorio.");
        }

        const durationRaw = String(Dom.DurationInput.value || "").trim();
        let durationMin = null;
        if (durationRaw) {
            const n = Number(durationRaw);
            if (!Number.isFinite(n) || n <= 0) throw new Error("Tiempo inválido.");

            if (UiState.durationUnit === "h") {
                durationMin = Math.max(1, Math.min(1440, Math.round(n * 60)));
            } else {
                durationMin = Math.max(1, Math.min(1440, Math.round(n)));
            }
        }

        const repeatType = Dom.RepeatType.value ?? "none";
        const repeat = buildRepeatPayload(repeatType);

        const nowIso = new Date().toISOString();

        const payload = {
            kind,
            title,
            rangeOrder,
            durationMin,
            notes,
            startOn,
            repeat,
            archived: false,
            updatedAt: nowIso
        };

        if (!id) {
            payload.createdAt = nowIso;
            const created = await Api.createEvent(payload);
            AppState.data.events.push(created);
            showToastLikeNotice("Evento creado", "success");
        } else {
            const updated = await Api.updateEvent(id, payload);
            const idx = AppState.data.events.findIndex(x => String(x.id) === String(id));
            if (idx >= 0) AppState.data.events[idx] = updated;
            showToastLikeNotice("Evento actualizado", "success");
        }

        closeEventSheet();

        await recalcActivePlanIfNeeded();
    } catch (err) {
        console.error(err);
        showToastLikeNotice(err?.message ? String(err.message) : "No se pudo guardar.", "warn");
    } finally {
        AppState.isSaving = false;
        render();
    }
}

function buildRepeatPayload(type) {
    if (type === "daily") return { type: "daily" };

    if (type === "weekly") {
        const checked = [...Dom.RepeatConfig.querySelectorAll("input[type='checkbox'][data-dow]:checked")]
            .map(x => Number(x.getAttribute("data-dow")))
            .filter(n => Number.isFinite(n));

        if (checked.length === 0) {
            return { type: "weekly", daysOfWeek: [1, 2, 3, 4, 5] };
        }

        return { type: "weekly", daysOfWeek: checked };
    }

    if (type === "monthly") {
        const el = Dom.RepeatConfig.querySelector("#RepeatMonthDay");
        const dayOfMonth = el ? Math.max(1, Math.min(31, Number(el.value || 1))) : 1;
        return { type: "monthly", dayOfMonth };
    }

    if (type === "interval") {
        const el = Dom.RepeatConfig.querySelector("#RepeatEveryDays");
        const everyDays = el ? Math.max(1, Math.min(365, Number(el.value || 2))) : 2;
        return { type: "interval", everyDays };
    }

    if (type === "dates") {
        const el = Dom.RepeatConfig.querySelector("#RepeatDateList");
        const raw = el ? String(el.value || "") : "";
        const list = raw
            .split(",")
            .map(x => x.trim())
            .filter(Boolean)
            .filter(isValidDateKey);

        return { type: "dates", dateList: list };
    }

    if (type === "none") return { type: "none" };

    return { type: "none" };
}

async function onDeleteEvent() {
    const id = String(Dom.EventId.value || "").trim();
    if (!id || AppState.isSaving) return;

    const ok = await openConfirmModal({
        title: "Eliminar rango",
        body: "¿Seguro que quieres eliminar este rango? Esta acción no se puede deshacer.",
        okText: "Eliminar",
        cancelText: "Cancelar"
    });

    if (!ok) return;

    AppState.isSaving = true;
    render();

    try {
        await Api.deleteEvent(id);
        AppState.data.events = AppState.data.events.filter(x => String(x.id) !== String(id));
        closeEventSheet();

        await recalcActivePlanIfNeeded();
        showToastLikeNotice("Rango eliminado", "success");
    } catch (err) {
        console.error(err);
        showToastLikeNotice("No se pudo eliminar en MockAPI.", "warn");
    } finally {
        AppState.isSaving = false;
        render();
    }
}

/* -------------------------
   Drag & Drop (pointer-based)
-------------------------- */

function enableSortablePointerDnD() {
    Dom.OccurrenceList.addEventListener("pointerdown", onPointerDownDrag, { passive: false });
    Dom.OccurrenceList.addEventListener("pointermove", onPointerMoveDrag, { passive: false });
    Dom.OccurrenceList.addEventListener("pointerup", onPointerUpDrag, { passive: false });
    Dom.OccurrenceList.addEventListener("pointercancel", onPointerUpDrag, { passive: false });
}

function onPointerDownDrag(e) {
    const handle = e.target.closest("[data-drag-handle='true']");
    if (!handle) return;

    if (AppState.view !== "today") return;

    const row = handle.closest(".Row");
    if (!row) return;

    e.preventDefault();

    UiState.drag.isActive = true;
    UiState.drag.pointerId = e.pointerId;
    UiState.drag.dragRow = row;

    row.classList.add("isDragging");
    row.setPointerCapture(e.pointerId);

    const placeholder = document.createElement("div");
    placeholder.className = "RowPlaceholder";
    placeholder.style.height = `${row.getBoundingClientRect().height}px`;

    UiState.drag.placeholder = placeholder;

    row.parentNode.insertBefore(placeholder, row.nextSibling);
}

function onPointerMoveDrag(e) {
    if (!UiState.drag.isActive) return;
    if (UiState.drag.pointerId !== e.pointerId) return;

    e.preventDefault();

    const row = UiState.drag.dragRow;
    const placeholder = UiState.drag.placeholder;
    if (!row || !placeholder) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const overRow = el ? el.closest(".Row") : null;
    if (!overRow || overRow === row) return;

    const rect = overRow.getBoundingClientRect();
    const insertBefore = e.clientY < rect.top + rect.height / 2;

    if (insertBefore) {
        Dom.OccurrenceList.insertBefore(placeholder, overRow);
    } else {
        Dom.OccurrenceList.insertBefore(placeholder, overRow.nextSibling);
    }
}

async function onPointerUpDrag(e) {
    if (!UiState.drag.isActive) return;
    if (UiState.drag.pointerId !== e.pointerId) return;

    e.preventDefault();

    const row = UiState.drag.dragRow;
    const placeholder = UiState.drag.placeholder;

    UiState.drag.isActive = false;
    UiState.drag.pointerId = null;
    UiState.drag.dragRow = null;
    UiState.drag.placeholder = null;

    if (!row || !placeholder) return;

    row.classList.remove("isDragging");

    try {
        row.releasePointerCapture(e.pointerId);
    } catch (_) {
        /* Se ignora */
    }

    Dom.OccurrenceList.insertBefore(row, placeholder);
    placeholder.remove();

    await persistReorderFromDom();
}

async function persistReorderFromDom() {
    if (AppState.view !== "today") return;

    const dayKey = DateUtils.toLocalDateKey(AppState.anchorDate);

    const rows = [...Dom.OccurrenceList.querySelectorAll(".Row[data-event-id]")];
    const orderedEventIds = rows.map(r => String(r.getAttribute("data-event-id") || "")).filter(Boolean);

    if (orderedEventIds.length === 0) return;

    const updates = [];
    for (let i = 0; i < orderedEventIds.length; i++) {
        const eventId = orderedEventIds[i];
        const newOrder = i + 1;

        const ev = AppState.data.events.find(x => String(x.id) === String(eventId));
        if (!ev) continue;

        const oldOrder = Number(ev.rangeOrder ?? 0);
        if (oldOrder === newOrder) continue;

        updates.push({ id: eventId, rangeOrder: newOrder });
        ev.rangeOrder = newOrder;
    }

    if (updates.length === 0) {
        await recalcActivePlanIfNeeded();
        render();
        return;
    }

    AppState.isSaving = true;
    render();

    try {
        for (const u of updates) {
            const ev = AppState.data.events.find(x => String(x.id) === String(u.id));
            if (!ev) continue;

            const payload = {
                kind: ev.kind ?? "event",
                title: ev.title ?? "",
                rangeOrder: Number(ev.rangeOrder ?? u.rangeOrder),
                durationMin: ev.durationMin ?? null,
                notes: ev.notes ?? "",
                startOn: ev.startOn ?? DateUtils.toLocalDateKey(new Date()),
                repeat: ev.repeat ?? { type: "none" },
                archived: Boolean(ev.archived ?? false),
                updatedAt: new Date().toISOString(),
                createdAt: ev.createdAt ?? undefined
            };

            const updated = await Api.updateEvent(u.id, payload);
            const idx = AppState.data.events.findIndex(x => String(x.id) === String(u.id));
            if (idx >= 0) AppState.data.events[idx] = updated;
        }

        await recalcActivePlanIfNeeded();

        if (AppState.data.activeDaySession?.dayKey === dayKey) {
            const session = AppState.data.activeDaySession;
            const currentId = getCurrentOccurrence(session)?.occurrenceId ?? null;

            session.plan.sort((a, b) => (Number(a.rangeOrder) - Number(b.rangeOrder)) || String(a.eventId).localeCompare(String(b.eventId)));

            if (currentId) {
                const idx = session.plan.findIndex(x => x.occurrenceId === currentId && !session.doneByOccId[x.occurrenceId]);
                if (idx >= 0) session.currentIndex = idx;
            }

            queueActiveSessionSave();
        }

        showToastLikeNotice("Orden actualizado", "success");
    } catch (err) {
        console.error(err);
        showToastLikeNotice("No se pudo guardar el orden en MockAPI.", "warn");
    } finally {
        AppState.isSaving = false;
        render();
    }
}

/* -------------------------
   Confirm modal
-------------------------- */

function wireConfirmModalOnce() {
    Dom.ConfirmCloseBtn.addEventListener("click", () => closeConfirm(false));
    Dom.ConfirmCancelBtn.addEventListener("click", () => closeConfirm(false));
    Dom.ConfirmOverlay.addEventListener("click", () => closeConfirm(false));
    Dom.ConfirmOkBtn.addEventListener("click", () => closeConfirm(true));
}

function openConfirmModal({ title, body, okText, cancelText }) {
    if (UiState.confirm.isOpen) return Promise.resolve(false);

    UiState.confirm.isOpen = true;

    Dom.ConfirmTitle.textContent = String(title ?? "Confirmación");
    Dom.ConfirmBody.textContent = String(body ?? "¿Seguro?");

    Dom.ConfirmOkBtn.textContent = String(okText ?? "Confirmar");
    Dom.ConfirmCancelBtn.textContent = String(cancelText ?? "Cancelar");

    Dom.ConfirmOverlay.hidden = false;
    Dom.ConfirmModal.hidden = false;

    return new Promise((resolve) => {
        UiState.confirm.resolve = resolve;
    });
}

function closeConfirm(value) {
    if (!UiState.confirm.isOpen) return;

    UiState.confirm.isOpen = false;

    Dom.ConfirmOverlay.hidden = true;
    Dom.ConfirmModal.hidden = true;

    const resolve = UiState.confirm.resolve;
    UiState.confirm.resolve = null;

    if (resolve) resolve(Boolean(value));
}

/* -------------------------
   Picker modal
-------------------------- */

function wirePickerModalOnce() {
    Dom.PickerCloseBtn.addEventListener("click", () => closePicker(null));
    Dom.PickerCancelBtn.addEventListener("click", () => closePicker(null));
    Dom.PickerOverlay.addEventListener("click", () => closePicker(null));

    Dom.PickerBody.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-pick]");
        if (!btn) return;
        closePicker(String(btn.getAttribute("data-pick")));
    });
}

function openPicker({ title, options }) {
    if (UiState.picker.isOpen) return Promise.resolve(null);

    UiState.picker.isOpen = true;

    Dom.PickerTitle.textContent = String(title ?? "Seleccionar");

    Dom.PickerBody.innerHTML = (options ?? []).map(opt => {
        return `
            <button class="GhostBtn" type="button" data-pick="${escapeHtml(opt.value)}" style="width:100%; text-align:left; margin-bottom:10px;">
                ${escapeHtml(opt.label)}
            </button>
        `;
    }).join("");

    Dom.PickerOverlay.hidden = false;
    Dom.PickerModal.hidden = false;

    return new Promise((resolve) => {
        UiState.picker.resolve = resolve;
    });
}

function closePicker(value) {
    if (!UiState.picker.isOpen) return;

    UiState.picker.isOpen = false;

    Dom.PickerOverlay.hidden = true;
    Dom.PickerModal.hidden = true;

    const resolve = UiState.picker.resolve;
    UiState.picker.resolve = null;

    if (resolve) resolve(value);
}

/* -------------------------
   Toast-like notice (⚠️/✅ -> Lucide)
-------------------------- */

function showToastLikeNotice(message, variant = "warn") {
    const iconName = variant === "success" ? "check-circle" : "alert-triangle";

    Dom.ActiveSession.classList.add("isVisible");
    Dom.ActiveSession.innerHTML = `
        <div class="TimerLine">
            <div class="MainLine">
                <span>AgendX</span>
                <span class="UiIcon"><i data-lucide="${iconName}"></i></span>
            </div>
            <div class="SubLine">${escapeHtml(message)}</div>
        </div>
    `;

    refreshLucideIcons();

    window.clearTimeout(showToastLikeNotice._t);
    showToastLikeNotice._t = window.setTimeout(() => {
        if (!AppState.data.activeDaySession) {
            Dom.ActiveSession.classList.remove("isVisible");
            Dom.ActiveSession.innerHTML = "";
        }
    }, 3200);
}

/* -------------------------
   Markdown renderer (safe + simple)
-------------------------- */

function renderMarkdown(md) {
    const raw = String(md ?? "");
    const escaped = escapeHtml(raw);

    const lines = escaped.split(/\r?\n/);

    const isList = (l) => l.trim().startsWith("- ") || l.trim().startsWith("* ");
    const anyList = lines.some(isList);

    let html = "";
    if (anyList) {
        const nonList = [];
        const listItems = [];

        for (const line of lines) {
            if (isList(line)) {
                listItems.push(line.trim().slice(2).trim());
            } else if (line.trim() !== "") {
                nonList.push(line);
            }
        }

        if (nonList.length > 0) {
            html += nonList.map(l => `<div>${inlineMd(l)}</div>`).join("");
        }

        if (listItems.length > 0) {
            html += `<ul>${listItems.map(li => `<li>${inlineMd(li)}</li>`).join("")}</ul>`;
        }
    } else {
        html = lines.map(l => `<div>${inlineMd(l)}</div>`).join("");
    }

    return html;
}

function inlineMd(text) {
    let t = String(text ?? "");

    t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, `<a href="$2" target="_blank" rel="noopener">$1</a>`);

    return t;
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

function isValidDateKey(x) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(x ?? "").trim());
}

function escapeHtml(str) {
    return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}