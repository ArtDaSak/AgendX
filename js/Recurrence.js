import { DateUtils } from "./DateUtils.js";

export const Recurrence = {
    buildOccurrences(events, startDate, endDate) {
        const startKey = DateUtils.toLocalDateKey(startDate);
        const endKey = DateUtils.toLocalDateKey(endDate);

        const days = [];
        for (let d = DateUtils.fromLocalDateKey(startKey); d <= endDate; d = DateUtils.addDays(d, 1)) {
            days.push(DateUtils.toLocalDateKey(d));
        }

        const occurrences = [];

        for (const event of events) {
            const eventStartKey = event.startOn ?? startKey;

            for (const dayKey of days) {
                if (dayKey < eventStartKey) continue;

                if (this.matches(event, dayKey)) {
                    occurrences.push({
                        occurrenceId: `${event.id}__${dayKey}`,
                        eventId: event.id,
                        dayKey,
                        title: event.title,
                        notes: event.notes ?? "",
                        rangeOrder: Number(event.rangeOrder ?? 999),
                        durationMin: event.durationMin ?? null,
                        repeat: event.repeat ?? { type: "none" }
                    });
                }
            }
        }

        occurrences.sort((a, b) => {
            if (a.dayKey !== b.dayKey) return a.dayKey.localeCompare(b.dayKey);
            return a.rangeOrder - b.rangeOrder;
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
            const diffMs = cur - start;
            const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
            return diffDays % everyDays === 0;
        }

        if (type === "dates") {
            const list = event.repeat?.dateList ?? [];
            return list.includes(dayKey);
        }

        return false;
    }
};