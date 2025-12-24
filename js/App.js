import { Api } from "./Storage.js";
import { Recurrence } from "./Recurrence.js";
import { DateUtils } from "./DateUtils.js";

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
    TitleWrap: document.getElementById("TitleWrap"),
    NotesWrap: document.getElementById("NotesWrap"),
    TitleInput: document.getElementById("TitleInput"),
    RangeOrderInput: document.getElementById("RangeOrderInput"),
    DurationInput: document.getElementById("DurationInput"),
    NotesInput: document.getElementById("NotesInput"),
    RepeatType: document.getElementById("RepeatType"),
    StartOnInput: document.getElementById("StartOnInput"),
    RepeatConfig: document.getElementById("RepeatConfig"),

    ConfirmOverlay: document.getElementById("ConfirmOverlay"),
    ConfirmModal: document.getElementById("ConfirmModal"),
    ConfirmTitle: document.getElementById("ConfirmTitle"),
    ConfirmBody: document.getElementById("ConfirmBody"),
    ConfirmCloseBtn: document.getElementById("ConfirmCloseBtn"),
    ConfirmCancelBtn: document.getElementById("ConfirmCancelBtn"),
    ConfirmOkBtn: document.getElementById("ConfirmOkBtn")
};

boot();

async function boot() {
    AppState.anchorDate = new Date();
    AppState.anchorDate.setSeconds(0, 0);

    wireUi();
    enableSortableIfNeeded();

const SortState = {
    dragging: false,
    pointerId: null,
    draggedEl: null,
    placeholderEl: null,
    startParent: null,
    startNextSibling: null,
    shiftY: 0,
    widthPx: 0,
    leftPx: 0
};

function enableSortableIfNeeded() {
    Dom.OccurrenceList.addEventListener("pointerdown", onPointerDownSort, { passive: false });
}

function onPointerDownSort(e) {
    const handle = e.target.closest("[data-drag-handle]");
    if (!handle) return;

    if (AppState.view !== "today") return;
    if (AppState.isSaving) return;

    const row = handle.closest(".Row");
    if (!row) return;

    e.preventDefault();

    const rect = row.getBoundingClientRect();

    SortState.dragging = true;
    SortState.pointerId = e.pointerId;
    SortState.draggedEl = row;

    SortState.startParent = row.parentNode;
    SortState.startNextSibling = row.nextSibling;

    SortState.shiftY = e.clientY - rect.top;
    SortState.widthPx = rect.width;
    SortState.leftPx = rect.left;

    // Placeholder con el mismo alto
    const ph = document.createElement("div");
    ph.className = "RowPlaceholder";
    ph.style.height = `${rect.height}px`;
    SortState.placeholderEl = ph;

    // Inserta placeholder donde estaba el row
    SortState.startParent.insertBefore(ph, row);

    // “Despega” el row y lo mueve a fixed sobre la pantalla
    row.classList.add("isDragging");
    row.style.width = `${SortState.widthPx}px`;
    row.style.position = "fixed";
    row.style.left = `${SortState.leftPx}px`;
    row.style.top = `${rect.top}px`;
    row.style.zIndex = "9999";
    row.style.pointerEvents = "none";

    // Lo ponemos al final del body para que fixed sea confiable
    document.body.appendChild(row);

    row.setPointerCapture(e.pointerId);

    window.addEventListener("pointermove", onPointerMoveSort, { passive: false });
    window.addEventListener("pointerup", onPointerUpSort, { passive: false });
}

function onPointerMoveSort(e) {
    if (!SortState.dragging) return;
    if (e.pointerId !== SortState.pointerId) return;

    e.preventDefault();

    const row = SortState.draggedEl;
    const ph = SortState.placeholderEl;
    if (!row || !ph) return;

    // Mueve el row con fixed siguiendo el dedo
    const top = e.clientY - SortState.shiftY;
    row.style.top = `${top}px`;

    // Encuentra el row bajo el pointer (si existe)
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const targetRow = el ? el.closest(".Row") : null;

    if (!targetRow) return;

    // No reinsertar contra sí mismo (que está fuera del DOM de la lista)
    if (!SortState.startParent.contains(targetRow)) return;

    const r = targetRow.getBoundingClientRect();
    const mid = r.top + r.height / 2;

    // Inserta placeholder antes o después según el Y
    if (e.clientY < mid) {
        if (targetRow.previousSibling !== ph) {
            SortState.startParent.insertBefore(ph, targetRow);
        }
    } else {
        if (targetRow.nextSibling !== ph) {
            SortState.startParent.insertBefore(ph, targetRow.nextSibling);
        }
    }
}

async function onPointerUpSort(e) {
    if (!SortState.dragging) return;
    if (e.pointerId !== SortState.pointerId) return;

    e.preventDefault();

    window.removeEventListener("pointermove", onPointerMoveSort);
    window.removeEventListener("pointerup", onPointerUpSort);

    const row = SortState.draggedEl;
    const ph = SortState.placeholderEl;
    const parent = SortState.startParent;

    SortState.dragging = false;
    SortState.pointerId = null;

    if (!row || !ph || !parent) return;

    // Devuelve el row al DOM en la posición del placeholder
    row.classList.remove("isDragging");
    row.style.position = "";
    row.style.left = "";
    row.style.top = "";
    row.style.width = "";
    row.style.zIndex = "";
    row.style.pointerEvents = "";

    parent.insertBefore(row, ph);
    ph.remove();

    SortState.draggedEl = null;
    SortState.placeholderEl = null;
    SortState.startParent = null;
    SortState.startNextSibling = null;

    // Persistir nuevo orden
    await persistTodayOrderFromDom();
}

    renderLoading();

    try {
        await hydrateFromApi();
        AppState.isHydrated = true;
    } catch (err) {
        console.error(err);
        showToastLikeNotice("No se pudo cargar MockAPI. Revisa tu URL o conexión.");
        AppState.isHydrated = true;
    }

    render();
}

/* -------------------------
   Locks de acción
-------------------------- */

function lockAction(ms = 450) {
    const now = Date.now();
    if (now < AppState.actionLockUntil) return false;
    AppState.actionLockUntil = now + ms;
    return true;
}

/* -------------------------
   Wire UI (sin listeners duplicados)
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
        render();
    });

    Dom.StartDayBtn.addEventListener("click", startDayOnly);

    Dom.OpenCreateBtn.addEventListener("click", openEventSheetForCreate);
    Dom.CloseEventSheetBtn.addEventListener("click", closeEventSheet);
    Dom.CancelEventBtn.addEventListener("click", closeEventSheet);
    Dom.Overlay.addEventListener("click", closeEventSheet);

    Dom.RepeatType.addEventListener("change", () => renderRepeatConfig(Dom.RepeatConfig, Dom.RepeatType.value, null));
    Dom.EventKind.addEventListener("change", applyKindUI);

    Dom.EventForm.addEventListener("submit", onSubmitEvent);
    Dom.DeleteBtn.addEventListener("click", onDeleteEvent);

    /* ✅ Event delegation para lista */
    Dom.OccurrenceList.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;

        const editId = btn.dataset.edit;
        const toggleId = btn.dataset.toggleDone;

        if (editId) {
            const found = AppState.data.events.find(ev => ev.id === editId);
            if (found) openEventSheetForEdit(found);
            return;
        }

        if (toggleId) {
            toggleDone(toggleId);
        }
    });

    /* ✅ Event delegation para sesión activa */
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
}

/* -------------------------
   Modal confirmación
-------------------------- */

let confirmResolve = null;

function openConfirmModal({ title, body, okText = "Confirmar", cancelText = "Cancelar" }) {
    Dom.ConfirmTitle.textContent = title;
    Dom.ConfirmBody.textContent = body;
    Dom.ConfirmOkBtn.textContent = okText;
    Dom.ConfirmCancelBtn.textContent = cancelText;

    Dom.ConfirmOverlay.hidden = false;
    Dom.ConfirmModal.hidden = false;

    setTimeout(() => Dom.ConfirmCancelBtn.focus(), 0);

    return new Promise(resolve => {
        confirmResolve = resolve;
    });
}

function closeConfirmModal(result) {
    Dom.ConfirmOverlay.hidden = true;
    Dom.ConfirmModal.hidden = true;

    if (confirmResolve) {
        const r = confirmResolve;
        confirmResolve = null;
        r(result);
    }
}

function wireConfirmModalOnce() {
    if (wireConfirmModalOnce._wired) return;
    wireConfirmModalOnce._wired = true;

    Dom.ConfirmOverlay.addEventListener("click", () => closeConfirmModal(false));
    Dom.ConfirmCloseBtn.addEventListener("click", () => closeConfirmModal(false));
    Dom.ConfirmCancelBtn.addEventListener("click", () => closeConfirmModal(false));
    Dom.ConfirmOkBtn.addEventListener("click", () => closeConfirmModal(true));

    window.addEventListener("keydown", (e) => {
        if (Dom.ConfirmModal.hidden) return;

        if (e.key === "Escape") {
            e.preventDefault();
            closeConfirmModal(false);
        }
    });
}

/* -------------------------
   Render core
-------------------------- */

function renderLoading() {
    Dom.OccurrenceList.innerHTML = `<div class="Empty">Cargando…</div>`;
    Dom.StartDayBtn.disabled = true;
    Dom.OpenCreateBtn.disabled = true;
}

function render() {
    stopTimerTick();

    if (!AppState.isHydrated) {
        renderLoading();
        return;
    }

    Dom.OpenCreateBtn.disabled = AppState.isSaving;

    // Si hay sesión activa, el "día" de la vista debe seguir el dayKey de la sesión
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
        return;
    }

    let currentOccId = null;
    if (session?.dayKey === anchorKey) {
        currentOccId = getCurrentOccurrence(session)?.occurrenceId ?? null;
    }

    Dom.OccurrenceList.innerHTML = renderOccurrences(occurrences, AppState.view, currentOccId);
}

/* -------------------------
   Rango por vista
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
   Render de lista
-------------------------- */

function renderOccurrences(occurrences, view, currentOccId) {
    if (view === "today") return occurrences.map(o => rowHtml(o, currentOccId)).join("");

    const byDay = new Map();
    for (const occ of occurrences) {
        if (!byDay.has(occ.dayKey)) byDay.set(occ.dayKey, []);
        byDay.get(occ.dayKey).push(occ);
    }

    let html = "";
    for (const [dayKey, list] of byDay.entries()) {
        const day = DateUtils.fromLocalDateKey(dayKey);
        html += `<div class="GroupTitle">${DateUtils.formatHumanDate(day)}</div>`;
        html += list.map(o => rowHtml(o, null)).join("");
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

    return `
        <article class="Row ${isCurrent}" data-occ-id="${occ.occurrenceId}" data-event-id="${occ.eventId}">
            <div class="RowTop">
                <div style="display:flex; gap:10px; align-items:flex-start;">
                    ${AppState.view === "today" ? `<div class="DragHandle" data-drag-handle="true" aria-label="Reordenar">≡</div>` : ""}
                    <div class="TitleLine">
                        <strong>R${occ.rangeOrder} · ${escapeHtml(occ.title)}</strong>
                        ${notesHtml}
                    </div>
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
   Reordenar eventos
-------------------------- */

async function persistTodayOrderFromDom() {
    if (AppState.view !== "today") return;
    if (AppState.isSaving) return;

    const dayKey = DateUtils.toLocalDateKey(AppState.anchorDate);

    // Solo reordenamos el “día” actual visible
    const rows = Array.from(Dom.OccurrenceList.querySelectorAll(".Row[data-event-id]"));
    if (rows.length === 0) return;

    // Construimos el nuevo orden secuencial 1..N
    const nowIso = new Date().toISOString();

    // Map para acceder rápido a los eventos
    const eventsById = new Map(AppState.data.events.map(ev => [String(ev.id), ev]));

    // Calcula payloads de actualización
    const updates = [];
    for (let i = 0; i < rows.length; i++) {
        const eventId = rows[i].dataset.eventId;
        const ev = eventsById.get(String(eventId));
        if (!ev) continue;

        const newOrder = i + 1;

        // Si ya coincide, no lo actualizamos
        if (Number(ev.rangeOrder) === newOrder) continue;

        const merged = {
            ...ev,
            rangeOrder: newOrder,
            updatedAt: nowIso
        };

        updates.push({ id: ev.id, payload: merged });
    }

    if (updates.length === 0) {
        // No hubo cambios reales
        render();
        return;
    }

    AppState.isSaving = true;
    render();

    try {
        // ✅ Persistencia (secuencial, MockAPI no soporta batch real)
        for (const u of updates) {
            const updated = await Api.updateEvent(u.id, u.payload);

            const idx = AppState.data.events.findIndex(x => String(x.id) === String(u.id));
            if (idx >= 0) AppState.data.events[idx] = updated;
        }

        // ✅ Si el día está iniciado, recalcula el plan respetando done (por occurrenceId estable)
        await recalculateActiveDayIfNeeded();

        showToastLikeNotice("Orden actualizado ✅");
    } catch (err) {
        console.error(err);
        showToastLikeNotice("No se pudo guardar el nuevo orden en MockAPI.");
    } finally {
        AppState.isSaving = false;
        render();
    }
}

/* -------------------------
   Día iniciado: render + acciones
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

    startTimerTick(session);
}

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

    // ✅ Solo marca el actual. (No marca el siguiente aunque se dispare doble evento)
    session.doneByOccId[current.occurrenceId] = true;

    // Se mueve el puntero al siguiente pendiente (sin marcarlo)
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
        showToastLikeNotice("Día finalizado ✅");
    } catch (err) {
        console.error(err);
        showToastLikeNotice("No se pudo finalizar el día en MockAPI.");
    } finally {
        AppState.isSaving = false;
        render();
    }
}

/* -------------------------
   Temporizador
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
            mainEl.textContent = "Día completado ✅";
            remainEl.textContent = "";
            subEl.textContent = "Todo listo. Puedes finalizar el día.";
            timerLine?.classList.remove("isRunning");
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

        mainEl.textContent = `R${current.rangeOrder} · ${current.title}`;

        if (!item || item.durationSec <= 0) {
            remainEl.textContent = "Sin duración";
            subEl.textContent = "Define minutos para ver el temporizador en tiempo real";
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
   Toggle done (por tarjeta)
-------------------------- */

function toggleDone(occurrenceId) {
    if (!lockAction()) return;

    const session = AppState.data.activeDaySession;
    const dayKey = DateUtils.toLocalDateKey(AppState.anchorDate);

    if (!session || session.dayKey !== dayKey) return;
    if (!occurrenceId || !Object.prototype.hasOwnProperty.call(session.doneByOccId, occurrenceId)) return;

    session.doneByOccId[occurrenceId] = !session.doneByOccId[occurrenceId];

    // Si acabas de marcar el current, mueve el puntero
    const current = getCurrentOccurrence(session);
    if (current && session.doneByOccId[current.occurrenceId]) moveToNext(session);

    queueActiveSessionSave();
    render();
}

/* -------------------------
   Selección de currentIndex
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
   Persistencia sesión (debounce)
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
        showToastLikeNotice("No se pudo sincronizar la sesión con MockAPI.");
    }
}

/* -------------------------
   Iniciar día
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
        showToastLikeNotice("Solo puedes iniciar el día de hoy.");
        return;
    }

    if (AppState.data.activeDaySession?.dayKey === dayKey) return;

    const plan = buildDayPlan(dayKey);
    if (!plan || plan.length === 0) {
        showToastLikeNotice("No puedes iniciar el día porque no hay eventos para hoy.");
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
        // Asegura que no exista otro active
        const recs = await Api.getRecurrences();
        const actives = (Array.isArray(recs) ? recs : []).filter(r => r.status === "active");
        for (const r of actives) await safeDeleteRecurrence(r.id);

        const created = await Api.createRecurrence(payload);
        setActiveSessionFromRemote(created);
    } catch (err) {
        console.error(err);
        showToastLikeNotice("No se pudo iniciar el día en MockAPI.");
    } finally {
        AppState.isSaving = false;
        render();
    }
}

/* -------------------------
   Plan del día + Regla descanso
-------------------------- */

function buildDayPlan(dayKey) {
    const dayStart = DateUtils.fromLocalDateKey(dayKey);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const occ = Recurrence.buildOccurrences(AppState.data.events, dayStart, dayEnd);
    const filtered = applyRestOverride(occ, dayKey);

    filtered.sort((a, b) => {
        if (a.rangeOrder !== b.rangeOrder) return a.rangeOrder - b.rangeOrder;
        return String(a.eventId).localeCompare(String(b.eventId));
    });

    return filtered;
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
   Cross-midnight (conservar hoy y ayer; borrar antier)
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
   Hydrate API
-------------------------- */

async function hydrateFromApi() {
    const events = await Api.getEvents();
    AppState.data.events = Array.isArray(events) ? events : [];

    const recs = await Api.getRecurrences();
    const list = Array.isArray(recs) ? recs : [];

    const yKey = yesterdayKey();
    const now = Date.now();

    // Limpia antier y expirados
    for (const r of list) {
        const keepUntil = r.keepUntil ? new Date(r.keepUntil).getTime() : null;
        const expired = keepUntil && now > keepUntil;
        const olderThanYesterday = (r.dayKey && r.dayKey < yKey);

        if (expired || olderThanYesterday) {
            await safeDeleteRecurrence(r.id);
        }
    }

    // Re-lee y toma active (hoy o ayer)
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

function setActiveSessionFromRemote(remote) {
    const rawPlan = Array.isArray(remote.plan) ? remote.plan : [];
    const oldDone = remote.doneByOccId ?? {};

    const normalizedPlan = rawPlan.map(o => {
        const eventId = String(o.eventId ?? o.id ?? "");
        const dayKey = String(o.dayKey ?? remote.dayKey ?? "");
        const stableId = `${eventId}__${dayKey}`;

        return {
            ...o,
            eventId,
            dayKey,
            occurrenceId: stableId,
            rangeOrder: Number(o.rangeOrder ?? 999)
        };
    });

    normalizedPlan.sort((a, b) => {
        if (a.rangeOrder !== b.rangeOrder) return a.rangeOrder - b.rangeOrder;
        return String(a.eventId).localeCompare(String(b.eventId));
    });

    const newDone = {};
    for (const o of normalizedPlan) {
        // ✅ soporte de migración: si antes venía con "__R", intenta leer ese key viejo
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
   CRUD Eventos
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
            const prev = AppState.data.events.find(x => x.id === id) ?? {};
            const merged = { ...prev, ...payload };
            const updated = await Api.updateEvent(id, merged);
            const idx = AppState.data.events.findIndex(x => x.id === id);
            if (idx >= 0) AppState.data.events[idx] = updated;
        }

        await recalculateActiveDayIfNeeded();
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
        AppState.data.events = AppState.data.events.filter(ev => ev.id !== id);

        await recalculateActiveDayIfNeeded();
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
   Recalcular sesión activa si cambian eventos
-------------------------- */

async function recalculateActiveDayIfNeeded() {
    const session = AppState.data.activeDaySession;
    if (!session?.remoteId) return;

    const dayKey = session.dayKey;
    const plan = buildDayPlan(dayKey);

    if (!plan || plan.length === 0) {
        await safeDeleteRecurrence(session.remoteId);
        AppState.data.activeDaySession = null;
        showToastLikeNotice("El día activo se cerró porque ya no hay rangos.");
        return;
    }

    const oldDone = session.doneByOccId ?? {};
    const newDone = {};
    for (const o of plan) newDone[o.occurrenceId] = Boolean(oldDone[o.occurrenceId]);

    const oldCurrentOccId = session.plan?.[session.currentIndex]?.occurrenceId ?? null;
    let newIndex = oldCurrentOccId ? plan.findIndex(o => o.occurrenceId === oldCurrentOccId) : 0;
    if (newIndex < 0) newIndex = 0;

    session.plan = plan;
    session.doneByOccId = newDone;
    session.currentIndex = newIndex;

    getCurrentOccurrence(session);

    await saveActiveSessionToApiNow();
}

/* -------------------------
   Repeat config
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
   Helpers API
-------------------------- */

async function safeDeleteRecurrence(id) {
    try {
        await Api.deleteRecurrence(id);
    } catch (err) {
        console.error(err);
    }
}

/* -------------------------
   Markdown seguro (subset)
-------------------------- */

function renderMarkdown(md) {
    const raw = String(md ?? "");
    if (!raw.trim()) return "";

    let s = escapeHtml(raw);

    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, text, url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    });

    s = s.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);
    s = s.replace(/\*\*([^*]+)\*\*/g, (_m, bold) => `<strong>${bold}</strong>`);
    s = s.replace(/\*([^*]+)\*/g, (_m, it) => `<em>${it}</em>`);

    const lines = s.split("\n");
    let out = [];
    let inList = false;

    for (const line of lines) {
        const m = line.match(/^\s*-\s+(.*)$/);
        if (m) {
            if (!inList) {
                out.push("<ul>");
                inList = true;
            }
            out.push(`<li>${m[1]}</li>`);
        } else {
            if (inList) {
                out.push("</ul>");
                inList = false;
            }
            out.push(line);
        }
    }

    if (inList) out.push("</ul>");
    s = out.join("\n");
    s = s.replace(/\n/g, "<br>");
    return s;
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
        if (!AppState.data.activeDaySession) {
            Dom.ActiveSession.classList.remove("isVisible");
            Dom.ActiveSession.innerHTML = "";
        }
    }, 3200);
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