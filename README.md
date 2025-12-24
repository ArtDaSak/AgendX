# AgendX ✨🗓️

Agenda / calendario **por rangos** (no por horarios) hecha en **Vanilla JS**, enfocada en móvil y desplegable en **GitHub Pages**.

> AgendX está diseñada para días reales: puedes llevar tu progreso por rangos (Pendiente → Hecho), usar descansos, y continuar incluso si tu “día iniciado” cruza medianoche.

---

## 🌌 Características

* 📱 **Mobile-first** + responsive
* 🎨 **Tema oscuro** por defecto + paleta personalizada
* 🧩 **Eventos por rangos** (prioridad) en lugar de horas
* 🔁 **Recurrencias**: únicas, diarias, semanales, mensuales, cada N días, fechas específicas
* ✅ **Progreso**: marcar rangos como “Hecho” y botón “Siguiente rango”
* ⏱️ **Temporizador en tiempo real** por rango (si defines `durationMin`)
* 💤 **Descansos** como tipo de evento

  * Regla: si hay un evento **no diario** en el mismo rango, el “Descanso” se elimina automáticamente para ese día
* 🌙 **Cruce de medianoche seguro**

  * Mantiene sesión activa aunque cambie el día calendario
  * Política de limpieza: conserva “hoy” y “ayer”; elimina “antier” y anteriores
* 🌐 Persistencia remota con **MockAPI**

  * `events` (plantillas)
  * `recurrences` (sesión/progreso del día)

---

## 🧱 Stack

* HTML + CSS + JavaScript (ES Modules)
* MockAPI (REST)
* GitHub Pages

---

## 🗂️ Estructura del proyecto

```
/
  index.html
  css/
    Style.css
  js/
    App.js
    Storage.js
    Recurrence.js
    DateUtils.js
```

---

## 🚀 Cómo ejecutar (local)

> Recomendado: usar un servidor local (por módulos ES).

### Opción 1: VS Code Live Server

1. Instala **Live Server**
2. Click derecho en `index.html` → **Open with Live Server**

### Opción 2: Python

```bash
python -m http.server 5500
```

Abre: `http://localhost:5500`

---

## 🌍 Deploy en GitHub Pages

1. Sube el repo a GitHub
2. Ve a **Settings → Pages**
3. Source: **Deploy from a branch**
4. Branch: `main` / folder: `/root`
5. Guarda y abre el link que te entrega Pages

---

## 🔧 Configuración de MockAPI

AgendX usa dos resources:

* `events`
* `recurrences`

La URL base se configura en:

* `js/Storage.js`

Ejemplo:

```js
const ApiRoot = "https://TU_ID.mockapi.io";
```

---

## 🧠 Notas en Markdown (renderizado)

Las notas se escriben como texto normal y se renderizan como Markdown **al mostrarse**:

* `**negrita**`, `*cursiva*`
* listas con `- `
* `inline code`
* links `[texto](https://...)`

---

## 🛣️ Roadmap (ideas)

* ⌨️ Atajos de teclado (Siguiente rango, Hecho, etc.)
* 🧾 Exportar/Importar (JSON)
* 🔐 Multiusuario (si migra de MockAPI a un backend real)
* 📊 Estadísticas de cumplimiento por semana/mes

---

## 🤝 Contribuir

1. Haz un fork
2. Crea una rama: `feature/nombre`
3. Abre un PR con una descripción clara

---

## 📄 Licencia

Este proyecto está bajo la licencia **MIT** (ver [LICENSE](./LICENSE)).
