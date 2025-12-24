export const DateUtils = {
  // Se convierte un Date a YYYY-MM-DD en horario local
  toLocalDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  },

  // Se crea un Date local desde YYYY-MM-DD sin desfase UTC
  fromLocalDateKey(dateKey) {
    const [y, m, d] = dateKey.split("-").map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  },

  // Se suma días manteniendo horario local
  addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  },

  startOfWeek(date) {
    const copy = new Date(date);
    const day = copy.getDay();
    const diff = (day + 6) % 7; // Se asume semana inicia lunes
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

  // Se redondea a la siguiente media hora
  roundToNextHalfHour(date) {
    const copy = new Date(date);
    const minutes = copy.getMinutes();
    const add = minutes === 0 || minutes === 30 ? 0 : (minutes < 30 ? (30 - minutes) : (60 - minutes));
    if (add > 0) copy.setMinutes(minutes + add);
    copy.setSeconds(0, 0);
    return copy;
  },

  formatTimeHHMM(date) {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  },

  formatHumanDate(date) {
    return date.toLocaleDateString("es-CO", { weekday: "short", month: "short", day: "numeric" });
  }
};
