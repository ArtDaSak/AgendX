export const DateUtils = {
    toLocalDateKey(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    },

    fromLocalDateKey(dateKey) {
        const [y, m, d] = dateKey.split("-").map(Number);
        return new Date(y, m - 1, d, 0, 0, 0, 0);
    },

    addDays(date, days) {
        const copy = new Date(date);
        copy.setDate(copy.getDate() + days);
        return copy;
    },

    startOfWeek(date) {
        const copy = new Date(date);
        const day = copy.getDay();
        const diff = (day + 6) % 7;
        copy.setDate(copy.getDate() - diff);
        copy.setHours(0, 0, 0, 0);
        return copy;
    },

    endOfWeek(date) {
        const start = this.startOfWeek(date);
        const end = this.addDays(start, 6);
        end.setHours(23, 59, 59, 999);
        return end;
    },

    formatTimeHHMM(date) {
        const hh = String(date.getHours()).padStart(2, "0");
        const mm = String(date.getMinutes()).padStart(2, "0");
        return `${hh}:${mm}`;
    },

    formatHumanDate(date) {
        return date.toLocaleDateString("es-CO", { weekday: "short", month: "short", day: "numeric" });
    },

    formatHMS(totalSeconds) {
        const s = Math.max(0, Math.floor(totalSeconds));
        const hh = Math.floor(s / 3600);
        const mm = Math.floor((s % 3600) / 60);
        const ss = s % 60;

        if (hh > 0) {
            return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
        }

        return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    }
};