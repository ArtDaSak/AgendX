import { DateUtils } from "./DateUtils.js";

export const Recurrence = {
    buildOccurrences(events, startDate, endDate) {
        const startKey = DateUtils.toLocalDateKey(startDate);
        const days = [];

        for (let d = DateUtils.fromLocalDateKey(startKey); d <= endDate; d = DateUtils.addDays(d, 1)) {
            days.push(DateUtils.toLocalDateKey(d));
        }

        const occurrences = [];

        for (const event of events) {
            const eventId = String(event.id ?? "");
            if (!eventId) continue;

            const startOn = event.startOn ?? startKey;

            for (const dayKey of days) {
                if (dayKey < startOn) continue;

                if (this.matches(event, dayKey)) {
                    const rangeOrder = Number(event.rangeOrder ?? 999);
                    const occurrenceId = `${eventId}__${dayKey}__R${rangeOrder}`;

                    occurrences.push({
                        occurrenceId,
                        eventId,
                        dayKey,
                        title: event.title ?? "",
                        notes: event.notes ?? "",
                        rangeOrder,
                        durationMin: event.durationMin ?? null,
                        repeat: event.repeat ?? { type: "none" }
                    });
                }
            }
        }

        occurrences.sort((a, b) => {
            if (a.dayKey !== b.dayKey) return a.dayKey.localeCompare(b.dayKey);
            if (a.rangeOrder !== b.rangeOrder) return a.rangeOrder - b.rangeOrder;
            return String(a.eventId).localeCompare(String(b.eventId));
        });

        return occurrences;
    },

    matches(event, dayKey) {
        const weekdayFilter = Array.isArray(event.weekdayFilter) ? event.weekdayFilter : [];
        if (weekdayFilter.length > 0) {
            const weekday = DateUtils.fromLocalDateKey(dayKey).getDay();
            if (!weekdayFilter.includes(weekday)) return false;
        }

        const type = event.repeat?.type ?? "none";

        if (type === "none") return event.startOn === dayKey;
        if (type === "daily") return true;

        if (type === "weekly") {
            const weekday = DateUtils.fromLocalDateKey(dayKey).getDay();
            const daysOfWeek = event.repeat?.daysOfWeek ?? [];
            return daysOfWeek.includes(weekday);
        }

        if (type === "monthly") {
            const dayOfMonth = Number(event.repeat?.dayOfMonth ?? 1);
            const d = DateUtils.fromLocalDateKey(dayKey).getDate();
            return d === dayOfMonth;
        }

        if (type === "interval") {
            const everyDays = Number(event.repeat?.everyDays ?? 1);
            const start = DateUtils.fromLocalDateKey(event.startOn);
            const cur = DateUtils.fromLocalDateKey(dayKey);
            const diffDays = Math.floor((cur - start) / (24 * 60 * 60 * 1000));
            return diffDays % everyDays === 0;
        }

        if (type === "dates") {
            const list = event.repeat?.dateList ?? [];
            return list.includes(dayKey);
        }

        return false;
    }
};