// =============================
// CONFIGURACIÓN POR DEFECTO
// =============================
const configPorDefecto = {
  colores: {
    fondo: "#f9f9f9",
    boton_inicio: "#9a27f7",
    boton_fin: "#e762d5",

    // la tarjeta va adentro de colores (así la guarda el backend)
    tarjetaResumen: { colorInicio: "#fa9be2", colorFinal: "#ffffff" }
  },

  fuentes: {
    titulo: "Gochi Hand",
    colorTitulo: "#553071",
    secundario: "Arial",
    colorSecundario: "#8b68b0"
  },

  logo: "",
  vistas: ["ingresos", "bills", "egresos", "pagos"],
  ingresos_fuentes: ["💼 Trabajo", "🛒 Tienda"],

  personas: [
    { nombre: "Persona1", telefono: "+1234567890" },
    { nombre: "Persona2", telefono: "+0987654321" }
  ],

  // 👇 nombres que coincide con columnas del backend
  bills_conf: [
    { nombre: "Luz",  personas: ["Persona1", "Persona2"] },
    { nombre: "Agua", personas: ["Persona1"] }
  ],

  egresos_conf: [
    { categoria: "🍔 Comida", subcategorias: ["Restaurante", "Supermercado"] }
  ],

  medios_pago: [
    { medio: "💳 Tarjeta", submedios: ["Crédito", "Débito"] }
  ],

  // útil para la vista de pagos
  pagos_config: {
    bills: ["Luz", "Agua"],
    personas: ["Persona1", "Persona2"],
    medios: ["💳 Tarjeta"],
    submediosPorMedio: { "💳 Tarjeta": ["Crédito", "Débito"] }
  }
};

window.configPorDefecto = configPorDefecto; // opcional pero útil

// === Util: reemplazo in-place para arrays (mantiene la MISMA referencia) ===
(function (global) {
  function replaceArray(target, next) {
    if (!Array.isArray(target)) {
      console.warn("replaceArray: target no es Array", target);
      return;
    }
    if (!Array.isArray(next)) next = [];
    target.splice(0, target.length, ...next);
  }
  global.replaceArray = replaceArray; // ← disponible en todo el script
})(typeof window !== "undefined" ? window : globalThis);

// --- Helpers de config ---------------------------------------------

function mostrarPantallaLogin() {
  _marcarSesion(false);                        // 👈 apaga el flag del gate
  try { sessionStorage.removeItem('usuario'); } catch {}
  ocultarSplash?.();                           // opcional, asegura que no quede la cortina
  enforceAuthView?.();                         // opcional, si la tienes

  // reutiliza tu vista de usuario (login/registro)
  if (typeof window.mostrarVistaUsuario === 'function') {
    window.mostrarVistaUsuario();
  } else {
    // fallback mínimo
    document.getElementById('zona-privada')?.setAttribute('style','display:none;');
    document.getElementById('barra-superior')?.setAttribute('style','display:none;');
    document.getElementById('menu-vistas')?.setAttribute('style','display:none;');
    document.getElementById('usuario')?.setAttribute('style','display:block;');
    document.getElementById('seccion-usuario')?.setAttribute('style','display:block;');
    document.getElementById('seccion-registro')?.setAttribute('style','display:block;');
    document.getElementById('seccion-login')?.setAttribute('style','display:block;');
  }
}

// 1) Normaliza nombres/estructuras legacy que puedan venir de la BD o de localStorage
function normalizarConfigEntrante(cfg) {
  const out = { ...(cfg || {}) };

  // mover tarjetaResumen si vino dentro de colores
  if (!out.tarjetaResumen && out.colores && out.colores.tarjetaResumen) {
    out.tarjetaResumen = out.colores.tarjetaResumen;
    try { delete out.colores.tarjetaResumen; } catch {}
  }

  // tolerancia por si vino el nombre "tarjetaresumen" o "tarjeta_resumen"
  if (!out.tarjetaResumen && out.tarjetaresumen) out.tarjetaResumen = out.tarjetaresumen;
  if (!out.tarjetaResumen && out.tarjeta_resumen) out.tarjetaResumen = out.tarjeta_resumen;

  // si por alguna razón el backend envió bills_conf/egresos_conf (nombres de BD),
  // mapeamos a las claves que usa el front.
  if (!out.bills && Array.isArray(out.bills_conf)) out.bills = out.bills_conf;
  if (!out.egresos_categorias && Array.isArray(out.egresos_conf)) out.egresos_categorias = out.egresos_conf;

  // pagos_config → pagos (nombre del front)
  if (!out.pagos && out.pagos_config) out.pagos = out.pagos_config;

  return out;
}

// 2) Mezcla con valores por defecto para que jamás falte nada
function mergeConDefecto(cfgIn) {
  const defaults = {
    colores: {
      fondo: "#f9f9f9",
      boton_inicio: "#9a27f7",
      boton_fin: "#e762d5",
    },
    tarjetaResumen: { colorInicio: "#fa9be2", colorFinal: "#ffffff" },
    fuentes: {
      titulo: "Gochi Hand",
      secundario: "Arial",
      colorTitulo: "#553071",
      colorSecundario: "#8b68b0",
    },
    logo: "",
    vistas: ["ingresos", "bills", "egresos", "pagos"],
    ingresos_fuentes: ["💼 Trabajo", "🛒 Tienda"],
    personas: [],
    bills: [],
    egresos_categorias: [],
    medios_pago: [],
    pagos: { bills: [], personas: [], medios: [], submediosPorMedio: {} },
  };

  const c = cfgIn || {};
  return {
    ...defaults,
    ...c,
    colores: { ...defaults.colores, ...(c.colores || {}) },
    tarjetaResumen: { ...defaults.tarjetaResumen, ...(c.tarjetaResumen || {}) },
    fuentes: { ...defaults.fuentes, ...(c.fuentes || {}) },
    vistas: Array.isArray(c.vistas) ? c.vistas : defaults.vistas,
    ingresos_fuentes: Array.isArray(c.ingresos_fuentes) ? c.ingresos_fuentes : defaults.ingresos_fuentes,
    personas: Array.isArray(c.personas) ? c.personas : defaults.personas,
    bills: Array.isArray(c.bills) ? c.bills : defaults.bills,
    egresos_categorias: Array.isArray(c.egresos_categorias) ? c.egresos_categorias : defaults.egresos_categorias,
    medios_pago: Array.isArray(c.medios_pago) ? c.medios_pago : defaults.medios_pago,
    pagos: {
      ...defaults.pagos,
      ...(c.pagos || {}),
      bills: Array.isArray(c?.pagos?.bills) ? c.pagos.bills : defaults.pagos.bills,
      personas: Array.isArray(c?.pagos?.personas) ? c.pagos.personas : defaults.pagos.personas,
      medios: Array.isArray(c?.pagos?.medios) ? c.pagos.medios : defaults.pagos.medios,
      submediosPorMedio: { ...(c?.pagos?.submediosPorMedio || {}) },
    },
  };
}

// 3) ÚNICA función aplicarConfiguracion (blindada y completa)
function aplicarConfiguracion(cfgIn) {
  // normaliza + defaults
  const cfg = mergeConDefecto(normalizarConfigEntrante(cfgIn || {}));
  console.log("Aplicando configuración:", cfg);

  // === Fondo general ===
  document.body.style.background = cfg.colores.fondo;

  // === Fuentes / colores de texto ===
  const colorTitulo     = cfg.fuentes.colorTitulo;
  const colorSecundario = cfg.fuentes.colorSecundario;

  document.body.style.fontFamily = cfg.fuentes.secundario;
  document.body.style.setProperty("--fuente-cuerpo", cfg.fuentes.secundario);

  document.querySelectorAll(".titulo, h1, h2, h3").forEach(el => {
    el.style.fontFamily = cfg.fuentes.titulo;
    el.style.color = colorTitulo;
  });

  document.querySelectorAll(".texto-secundario, p, span").forEach(el => {
    if (el.closest('.card-header')) return; // no tocar encabezado de tarjeta
    el.style.color = colorSecundario;
  });

  // --- Labels en formularios
  [
    "#form-ingresos",
    "#form-bills",
    "#form-egresos",
    "#form-egresos-personales",
    "#form-pagos",
  ].forEach(sel => {
    document.querySelectorAll(`${sel} label`).forEach(el => {
      el.style.color = colorSecundario;
    });
  });

  // --- Títulos secundarios
  document.querySelectorAll(".titulo-secundario").forEach(el => {
    el.style.color = colorSecundario;
  });

  // --- Texto de tarjetas flotantes
  document.querySelectorAll(".tarjeta-resumen").forEach(el => {
    el.style.color = colorTitulo;
  });

  // === Logo ===
  document.querySelectorAll(".logo-izquierda").forEach(img => {
    if (cfg.logo && cfg.logo.trim() !== "") {
      img.src = cfg.logo;
      img.style.display = "inline-block";
      img.style.filter = `drop-shadow(0 0 5px ${cfg.colores.boton_inicio})`;
    } else {
      img.style.display = "none";
    }
  });

  // === Botones (gradiente) ===
  const bIni = cfg.colores.boton_inicio;
  const bFin = cfg.colores.boton_fin;
  const grad = `linear-gradient(to right, ${bIni}, ${bFin})`;

  document.querySelectorAll("button:not(.icon-btn)").forEach(btn => {
    btn.style.backgroundImage = grad;
    btn.style.backgroundColor = "transparent";
    btn.style.color = "#fff";
  });

  const root = document.documentElement.style;
  root.setProperty('--btn-inicio', bIni);
  root.setProperty('--btn-fin', bFin);
  root.setProperty('--btn-gradient', grad);

  // === Tarjetas resumen (gradiente) ===
  const tIni = cfg.tarjetaResumen.colorInicio;
  const tFin = cfg.tarjetaResumen.colorFinal;
  document.querySelectorAll("#resumen-ingresos, #resumen-bills, #resumen-egresos, #resumen-pagos, #detalle-resumen")
    .forEach(card => {
      card.style.background = `linear-gradient(to right, ${tIni}, ${tFin})`;
    });

// === Catálogos globales (actualizando SIN romper referencias) ===
replaceArray(
  configFuentesIngresos,
  Array.from(new Set((cfg.ingresos_fuentes || []).map(s => String(s).trim()).filter(Boolean)))
);

replaceArray(
  configPersonas,
  (typeof dedupePersonas === 'function')
    ? dedupePersonas((cfg.personas || []).map(p => (typeof normalizaPersona === 'function' ? normalizaPersona(p) : p)))
    : (cfg.personas || [])
);

replaceArray(
  configBills,
  (typeof limpiarBillsConPersonasInvalidas === 'function')
    ? limpiarBillsConPersonasInvalidas(cfg.bills || [], configPersonas)
    : (cfg.bills || [])
);

replaceArray(configEgresosCategorias, cfg.egresos_categorias || []);
replaceArray(configMediosPago,        cfg.medios_pago        || []);

// ✅ refresca UI
if (typeof actualizarSelectsVistas === 'function') actualizarSelectsVistas();

}

// --- Auth helpers ---
function isLoggedIn() {
  const u = JSON.parse(sessionStorage.getItem('usuario') || '{}');
  return !!u.email;
}

function enforceAuthView() {
  const u = JSON.parse(sessionStorage.getItem('usuario') || '{}');
  const logged = !!u.email;

  const contenido = document.getElementById('contenido-app');
  if (contenido) {
    contenido.style.display = 'block';
    contenido.style.visibility = 'visible';
    contenido.style.opacity = '1';
  }

  if (logged) {
    if (typeof window.mostrarZonaPrivada === 'function') {
      window.mostrarZonaPrivada(u);
    } else {
      // Fallback mínimo si aún no está definida
      document.getElementById('usuario')?.setAttribute('style','display:none;');
      document.getElementById('zona-privada')?.setAttribute('style','display:block;');
      document.getElementById('barra-superior')?.setAttribute('style','display:flex;');
      document.getElementById('menu-vistas')?.setAttribute('style','display:flex;');
    }
  } else {
    if (typeof window.mostrarVistaUsuario === 'function') {
      window.mostrarVistaUsuario();
    } else {
      // Fallback mínimo si aún no está definida
      document.getElementById('zona-privada')?.setAttribute('style','display:none;');
      document.getElementById('barra-superior')?.setAttribute('style','display:none;');
      document.getElementById('menu-vistas')?.setAttribute('style','display:none;');
      document.getElementById('usuario')?.setAttribute('style','display:block;');
      document.getElementById('seccion-usuario')?.setAttribute('style','display:block;');
      document.getElementById('seccion-registro')?.setAttribute('style','display:block;');
      document.getElementById('seccion-login')?.setAttribute('style','display:block;');
    }
  }
}

// =============================
// VARIABLES GLOBALES
// =============================
let configTemporal = {};
let configActual = {};

const W = (typeof window !== "undefined" ? window : globalThis);

const configFuentesIngresos   = [];
const configBills             = [];
const configPersonas          = [];
const configEgresosCategorias = [];
const configMediosPago        = [];

let telefonoDueno = "";
let ingresos = [];
let bills = [];
let pagos = [];
let egresos = [];
let copiaAntesDeAbrirGlobal = null;
let seGuardoConfiguracion   = false;

// Exponer mismas referencias al HTML/onclick
W.configFuentesIngresos   = configFuentesIngresos;
W.configBills             = configBills;
W.configPersonas          = configPersonas;
W.configEgresosCategorias = configEgresosCategorias;
W.configMediosPago        = configMediosPago;

// === helpers compartidos para mes y disponible ===
// --- Mes actual en formato YYYY-MM ---
function mesActualYYYYMM() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}
W.mesActualYYYYMM = mesActualYYYYMM;

// --- Nombre legible de un YYYY-MM ---
function nombreDelMes(yyyyMM) {
  if (!yyyyMM || !yyyyMM.includes("-")) return "todos los meses";
  const [año, mes] = yyyyMM.split("-");
  const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                 "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return `${meses[parseInt(mes,10)-1]} ${año}`;
}

// --- Helpers internos para normalizar ---
function _normalizaFechaYYYYMM(fecha) {
  if (!fecha) return "";
  let s = String(fecha);
  if (s.includes("T")) s = s.split("T")[0];     // corta 'YYYY-MM-DDTHH:mm...'
  s = s.replace(/\//g, "-").slice(0, 10);       // admite 'YYYY/MM/DD'
  return s.slice(0, 7);                          // devuelve 'YYYY-MM'
}
function _ingresosBase() {
  // admite window.ingresos o { ingresos: [...] }
  const raw = Array.isArray(window.ingresos) ? window.ingresos
            : (Array.isArray(window.ingresos?.ingresos) ? window.ingresos.ingresos : []);
  return Array.isArray(raw) ? raw : [];
}
function _egresosBase() {
  if (Array.isArray(W.egresos) && W.egresos.length) return W.egresos;        // preferente
  if (Array.isArray(egresos) && egresos.length)       return egresos;        // backup local
  if (Array.isArray(W.egresos?.egresos))              return W.egresos.egresos; // por si viene como objeto
  return [];
}

// --- Sumas por mes robustas ---
function obtenerIngresosDelMes(mes) {
  const base = _ingresosBase();
  return base
    .filter(i => i && i.fecha && (!mes || _normalizaFechaYYYYMM(i.fecha) === mes))
    .reduce((acc, i) => acc + parseFloat(i.monto || 0), 0);
}
function obtenerEgresosDelMes(mes) {
  const base = _egresosBase();
  return base
    .filter(e => e && e.fecha && (!mes || _normalizaFechaYYYYMM(e.fecha) === mes))
    .reduce((acc, e) => acc + parseFloat(e.monto || 0), 0);
}
// Disponible del MES indicado (o del actual si viene vacío).
// Garantiza que egresos estén normalizados antes de calcular.
function disponibleMes(mesYYMM, done) {
  const objetivo = mesYYMM && mesYYMM.includes("-") ? mesYYMM : mesActualYYYYMM();
  const compute = () => {
    const ing = obtenerIngresosDelMes(objetivo);
    const egr = obtenerEgresosDelMes(objetivo);
    done({
      mes: objetivo,
      nombreMes: nombreDelMes(objetivo),
      ingresos: ing,
      egresos: egr,
      disponible: ing - egr
    });
  };
  // Si tu app usa normalización de egresos, respétala:
  if (typeof cargarYNormalizarEgresos === "function") {
    cargarYNormalizarEgresos(compute);
  } else {
    compute();
  }
}

// 👇 justo aquí insertas el bloque del overlay
(function setupMiniDisponible(){
  const btn     = document.getElementById('btn-mini-disponible');
  const overlay = document.getElementById('mini-disponible-overlay');
  const content = document.getElementById('mini-disponible-content');
  if (!btn || !overlay || !content) return;

  const idsMes = ['filtro-mes-ingreso','filtro-mes-egreso','filtro-mes-bill','filtro-mes-pago'];
  function getMesFiltroActivo(){
    for (const id of idsMes){
      const val = document.getElementById(id)?.value || '';
      if (val && val.includes('-')) return val;
    }
    return '';
  }
  function renderMini(){
    disponibleMes(getMesFiltroActivo(), ({ nombreMes, ingresos, egresos, disponible }) => {
      content.innerHTML = `
        <h3>💵 Disponible</h3>
        <div class="num">$${(disponible||0).toFixed(2)}</div>
        <span class="sub">en <em>${nombreMes}</em></span>
        <span class="sub">Ingresos $${(ingresos||0).toFixed(2)} — Egresos $${(egresos||0).toFixed(2)}</span>
      `;
    });
  }
  function open(){ renderMini(); overlay.hidden = false; }
  function close(){ overlay.hidden = true; }

  btn.addEventListener('click', open);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.mini-disp-close')?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (!overlay.hidden && e.key === 'Escape') close(); });

  idsMes.forEach(id => document.getElementById(id)?.addEventListener('input', () => {
    if (!overlay.hidden) renderMini();
  }));
})();

// =============================
// HELPERs
// =============================
function formatoLegible(fechaRaw) {
  if (!fechaRaw) return "sin fecha";
  const d = new Date(fechaRaw);
  if (isNaN(d)) return fechaRaw;
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(d);
}

// Compat: mantiene el mismo nombre que ya usas en todo el código
function ownerDisplay({ allowFallbackYo = false } = {}) {
  const perfil = JSON.parse(sessionStorage.getItem('perfil') || '{}');
  const apodo = (perfil.apodo || '').trim();
  if (apodo) return apodo;

  if (allowFallbackYo) {
    const ses = JSON.parse(sessionStorage.getItem('usuario') || '{}');
    return (ses.nombre || ses.email || 'Dueño').trim();
  }
  return '';
}

function getApodo() {
  const perfil = JSON.parse(sessionStorage.getItem('perfil') || '{}');
  return (perfil.apodo || '').trim();
}

function getTelefonoDueno() {
  const perfil = JSON.parse(sessionStorage.getItem('perfil') || '{}');
  return (perfil.telefono || window?.configTemporal?.telefono_dueno || '').trim();
}

function clienteActual() {
  const ses = JSON.parse(sessionStorage.getItem('usuario') || '{}');
  return ses.email || '';
}
function normalizarTelefono(raw) {
  if (!raw) return "";
  let t = String(raw).trim();

  // deja solo dígitos y '+'
  t = t.replace(/[^\d+]/g, "");

  // quita '+' o '00' inicial → dejamos solo dígitos
  if (t.startsWith("+")) t = t.slice(1);
  if (t.startsWith("00")) t = t.slice(2);

  // si es de 10 dígitos (ej. US sin código) → anteponer 1
  if (!t.startsWith("1") && t.length === 10) t = "1" + t;

  // muy corto = inválido para wa.me
  if (t.length < 11) return "";
  return t;
}
function dedupePersonas(arr) {
  // quita duplicados por NOMBRE (ignora mayúsculas/espacios). GANA la ÚLTIMA
  const mp = new Map(arr.map(p => [p.nombre.trim().toLowerCase(), p]));
  return [...mp.values()];
}

function personasActuales() {
  if (Array.isArray(configTemporal?.personas) && configTemporal.personas.length) return configTemporal.personas;
  if (Array.isArray(W.configPersonas)   && W.configPersonas.length)   return W.configPersonas;
  if (Array.isArray(configPersonas)          && configPersonas.length)          return configPersonas;
  return [];
}

function buscarPersonaPorNombre(nombre) {
  const n = (nombre || "").trim().toLowerCase();
  return personasActuales().find(p => (p?.nombre || "").trim().toLowerCase() === n);
}
function normalizaPersona(p) {
  return {
    nombre: String(p?.nombre || '').trim(),
    telefono: String(p?.telefono || '').trim(),
    activa: (p?.activa === false) ? false : true,   // default: activa
    archivado_en: p?.archivado_en || null
  };
}
function getPersonasVigentes() {
  return (configPersonas || []).filter(p => p?.activa !== false);
}
function limpiarBillsConPersonasInvalidas(bills, personas) {
  const set = new Set((personas || []).map(p => (p.nombre || '').trim().toLowerCase()));
  return (bills || []).map(b => ({
    nombre: String(b?.nombre || '').trim(),
    personas: (b?.personas || [])
      .map(n => String(n).trim())
      .filter(n => set.has(n.toLowerCase()))
  }));
}

// --- Gate de sesión (global)
window.__sessionOK = false;

const RUTAS_PRIVADAS = new Set([
  '/cargar_configuracion','/guardar_configuracion',
  '/cargar_bills','/guardar_bill','/eliminar_bill',
  '/cargar_ingresos','/guardar_ingreso','/eliminar_ingreso',
  '/cargar_egresos','/guardar_egreso','/eliminar_egreso',
  '/cargar_pagos','/guardar_pago','/eliminar_pago',
  '/cargar_perfil','/guardar_perfil'
]);

// Helper opcional para encender/apagar el flag
// Helper único: runtime flag + clase en <body> para la UI
function _marcarSesion(on) {
  window.__sessionOK = !!on;                          // <- dos "s"
  try { document.body.classList.toggle('is-auth', !!on); } catch {}
}


// ---- Helpers de toast (reusar en ingresos/bills/egresos/pagos) ----
function toastOk(title){
  if (W.Swal) {
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title,
      showConfirmButton: false,
      timer: 2500,
      timerProgressBar: true,
    });
  } else {
    alert(title);
  }
}
function toastErr(title){
  if (W.Swal) {
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'error',
      title,
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
    });
  } else {
    alert(title);
  }
}

async function borrarColeccion(urlCargar, extraerArray, urlEliminar, mapPayload) {
  try {
    const r = await fetch(urlCargar);
    const data = await r.json().catch(() => ({}));
    const items = extraerArray(data) || [];
    for (const it of items) {
      const payload = mapPayload(it);
      await fetch(urlEliminar, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {}); // tolerante
    }
  } catch (e) {
    console.warn('borrarColeccion fallo:', urlCargar, e);
  }
}
function setSelect(id, opciones = [], placeholder = "Seleccionar") {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `<option value="">${placeholder}</option>` +
    opciones.map(o => `<option value="${o}">${o}</option>`).join("");
}
function _safeArray(x, fb = []) {
  return Array.isArray(x) ? x : (Array.isArray(fb) ? fb : []);
}
function _getCfgFuenteIngresos(cfgArg) {
  const cfg = cfgArg && typeof cfgArg === 'object'
    ? cfgArg
    : (W.configActual || W.configTemporal || W.configPorDefecto || {});
  // Soporta ambas estructuras: top-level e "otros.*"
  const top = _safeArray(cfg.ingresos_fuentes);
  const otros = _safeArray(cfg.otros?.ingresos_fuentes);
  const def = _safeArray(W.configPorDefecto?.ingresos_fuentes, []);
  return (top.length ? top : (otros.length ? otros : def)).map(s => String(s).trim()).filter(Boolean);
}
function resetIngresosSelects(cfgArg) {
  const fuentes = Array.from(new Set(_getCfgFuenteIngresos(cfgArg)));

  const select = document.getElementById("fuente-ingreso");
  const filtro = document.getElementById("filtro-fuente-ingreso");

  if (select) {
    const current = ""; // queremos vaciar
    select.innerHTML = `<option value="" disabled selected>Selecciona fuente</option>` +
      fuentes.map(f => `<option value="${f}">${f}</option>`).join("");
    if (current) select.value = current;
  }
  if (filtro) {
    filtro.innerHTML = `<option value="">Todas</option>` +
      fuentes.map(f => `<option value="${f}">${f}</option>`).join("");
    filtro.value = ""; // 🔑 limpia el filtro
  }

  // Mantén la referencia global coherente
  W.configFuentesIngresos = fuentes;
}
// === Sesión en memoria (bandera rápida)
let __sessionOK = false;

function haySesion() {
  try {
    if (window.__sessionOK) return true; // runtime flag
    return !!JSON.parse(sessionStorage.getItem('usuario') || 'null'); // persistencia
  } catch {
    return false;
  }
}

// --- Guard contra re-aplicar la misma config ---
let __cfgAppliedSig = null;

function aplicarConfiguracionSegura(cfg, who = 'unknown') {
  try {
    const sig = JSON.stringify(cfg);
    if (__cfgAppliedSig === sig) {
      console.debug('CFG igual, no reaplico (%s)', who);
      return;
    }
    __cfgAppliedSig = sig;
    console.log('Aplicando configuración (%s):', who, cfg);
    aplicarConfiguracion(cfg); // <-- tu función existente
  } catch (err) {
    console.error('aplicarConfiguracionSegura error:', err);
  }
}

// =============================
// HELPERS: selects tras un reset
// =============================
function _cfgSegura() {
  // devuelve algo SIEMPRE (por lo menos {})
  if (W.configActual && Object.keys(W.configActual).length) return W.configActual;
  if (W.configTemporal && Object.keys(W.configTemporal).length) return W.configTemporal;
  if (W.configPorDefecto && Object.keys(W.configPorDefecto).length) return W.configPorDefecto;
  return {};
}

function limpiarYRepoblarSelects(cfgArg) {
  const cfg = (cfgArg && typeof cfgArg === 'object') ? cfgArg : _cfgSegura();

  const fuentesIngresos =
    (Array.isArray(W.configFuentesIngresos) && W.configFuentesIngresos.length
      ? W.configFuentesIngresos
      : (Array.isArray(cfg.ingresos_fuentes) ? cfg.ingresos_fuentes : []));

  const billsNombres =
    Array.isArray(W.configBills) ? W.configBills.map(b => b.nombre) :
    Array.isArray(cfg.bills) ? cfg.bills.map(b => b.nombre) :
    Array.isArray(cfg.bills_conf) ? cfg.bills_conf.map(b => b.nombre) : [];

  const personasNombres =
    Array.isArray(W.configPersonas) ? W.configPersonas.map(p => p.nombre) :
    Array.isArray(cfg.personas) ? cfg.personas.map(p => p.nombre) : [];

  const categorias =
    Array.isArray(W.configEgresosCategorias) ? W.configEgresosCategorias.map(c => c.categoria) :
    Array.isArray(cfg.egresos_categorias) ? cfg.egresos_categorias.map(c => c.categoria) :
    Array.isArray(cfg.egresos_conf) ? cfg.egresos_conf.map(c => c.categoria) : [];

  const medios =
    Array.isArray(W.configMediosPago) ? W.configMediosPago.map(m => m.medio) :
    Array.isArray(cfg.medios_pago) ? cfg.medios_pago.map(m => m.medio) : [];

  // INGRESOS
  setSelect("fuente-ingreso", fuentesIngresos, "Selecciona fuente");
  setSelect("filtro-fuente-ingreso", fuentesIngresos, "Todas");
  const fMesIng = document.getElementById("filtro-mes-ingreso"); if (fMesIng) fMesIng.value = "";
  const fFuen   = document.getElementById("filtro-fuente-ingreso"); if (fFuen) fFuen.value = "";

  // BILLS
  setSelect("bill-tipo", billsNombres, "Selecciona tipo");
  setSelect("filtro-tipo-bill", billsNombres, "Todos");
  const fMesBill = document.getElementById("filtro-mes-bill"); if (fMesBill) fMesBill.value = "";

  // EGRESOS
  setSelect("categoria-egreso", categorias, "Seleccionar");
  setSelect("filtro-categoria-egreso", categorias, "Todas");
  setSelect("medio-egreso", medios, "Seleccionar medio");
  const fMesEgr = document.getElementById("filtro-mes-egreso"); if (fMesEgr) fMesEgr.value = "";

  // PAGOS
  setSelect("bill-pago", billsNombres, "Selecciona Bill");
  setSelect("filtro-bill-pago", billsNombres, "Todos");
  setSelect("persona-pago", personasNombres, "Selecciona persona");
  setSelect("filtro-persona-pago", personasNombres, "Todas");
  setSelect("medio-pago", medios, "Selecciona medio");

  const subCont = document.getElementById("submedio-pago-container");
  const subSel  = document.getElementById("submedio-pago");
  if (subSel) subSel.innerHTML = `<option value="">(selecciona un medio)</option>`;
  if (subCont) subCont.style.display = "none";

  // notificar al resto
  if (typeof actualizarSelectsVistas === "function") actualizarSelectsVistas("todos");
}

// =============================
// LIMPIEZA DE LISTAS / FILTROS / CHARTS
// =============================
function resetearListasUI() {
  // vaciar contenedores de listas
  const ids = ["lista-ingresos", "lista-bills", "lista-egresos-personales", "lista-pagos"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });

  // vaciar resúmenes
  ["resumen-ingresos","resumen-bills","resumen-egresos","resumen-pagos"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });

  // destruir gráficos si existen
  try { W.graficoIngresos && W.graficoIngresos.destroy(); W.graficoIngresos = null; } catch {}
  try { W.grafico && W.grafico.destroy(); W.grafico = null; } catch {}
  try { W.graficoPagos && W.graficoPagos.destroy(); W.graficoPagos = null; } catch {}

  // ✅ limpiar filtros y notificar a los listeners
  resetFiltrosYNotificar();
}

// Deja filtros en blanco y dispara eventos para que repinten las vistas
function resetFiltrosYNotificar() {
  const ids = [
    "filtro-mes-ingreso","filtro-fuente-ingreso",
    "filtro-mes-bill","filtro-tipo-bill","buscador-bills",
    "filtro-mes-egreso","filtro-categoria-egreso",
    "filtro-mes-pago","filtro-persona-pago","filtro-bill-pago"
  ];

  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    if (el.tagName === 'SELECT') {
      if ([...el.options].some(o => o.value === '')) el.value = '';
      else el.selectedIndex = 0;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}

// --- Login overlay helper ante 401 ---
let __mostrandoLogin401 = false;
function mostrarPantallaLogin() {
  if (__mostrandoLogin401) return;
  __mostrandoLogin401 = true;

  try { sessionStorage.removeItem('usuario'); } catch {}

  // Si tienes un modal de login
  const modal = document.getElementById('modal-login');
  if (modal) {
    modal.classList.add('abierto');
  } else {
    // Fallback: mostrar vista de login/registro
    document.getElementById('zona-privada')?.setAttribute('style','display:none;');
    document.getElementById('barra-superior')?.setAttribute('style','display:none;');
    document.getElementById('menu-vistas')?.setAttribute('style','display:none;');
    document.getElementById('usuario')?.setAttribute('style','display:block;');
    document.getElementById('seccion-usuario')?.setAttribute('style','display:block;');
    document.getElementById('seccion-registro')?.setAttribute('style','display:block;');
    document.getElementById('seccion-login')?.setAttribute('style','display:block;');
  }

  // Si existen, usa tus helpers de UI
  if (typeof mostrarVistaUsuario === 'function') mostrarVistaUsuario();
  if (typeof enforceAuthView === 'function') enforceAuthView();

  // Evita mostrarlo múltiples veces seguidas
  setTimeout(() => { __mostrandoLogin401 = false; }, 1500);
}

// =============================
// FETCH JSON (gate de sesión + 401 amigable)
// =============================
async function fetchJSON(url, opts = {}, { silent401 = false } = {}) {
  // Normaliza por si te pasan null
  opts = opts || {};

  // Gate: NO llamar rutas privadas si aún no hay sesión OK
  try {
    const rutasPriv = window.RUTAS_PRIVADAS || new Set();     // tolera que aún no esté seteado
    const path      = new URL(url, location.origin).pathname; // soporta rutas relativas
    if (!window.__sessionOK && rutasPriv.has(path)) {
      console.info('⛔️ Bloqueado antes de sesión:', path);
      return null;
    }
  } catch {}

  const res = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });

  // 401 → si es silencioso devolvemos null; si no, mostramos login y lanzamos
  if (res.status === 401) {
    if (silent401) return null;
    try { mostrarPantallaLogin?.(); } catch {}
    if (typeof _marcarSesion === 'function') _marcarSesion(false);
    else window.__sessionOK = false;
    throw new Error('HTTP 401');
  }

  if (!res.ok) throw new Error(`Fallo en ${url} (HTTP ${res.status})`);

  const ctype = res.headers.get('content-type') || '';
  return ctype.includes('application/json') ? res.json() : res.text();
}

// =============================
// SPLASH
// =============================

let _splashOcultado = false;
let _splashStartTs = 0;

// marca el instante en que el splash "existe"
document.addEventListener('DOMContentLoaded', () => {
  ocultarSplash._ts = performance.now();
}, { once:true });

function ocultarSplash(done) {
  if (ocultarSplash._ran) return; 
  ocultarSplash._ran = true;

  const splash = document.getElementById('splash');
  const MIN = 800; // ms visibles mínimo
  const started = ocultarSplash._ts || performance.now();
  const wait = Math.max(0, MIN - (performance.now() - started));

  setTimeout(() => {
    if (!splash) { done?.(); return; }

    // fade-out por CSS (ver 2) y fallback por si no hay transitionend
    splash.classList.add('splash-hide');
    splash.addEventListener('transitionend', () => {
      splash.remove();
      done?.();
    }, { once:true });
    setTimeout(() => { try { splash.remove(); } catch {} ; done?.(); }, 400);
  }, wait);
}


// Refresca TODO tras un reset del backend
function refrescarUITrasReset(cfgDelBack = {}) {
  // 0) defaults normalizados desde tu constante local
  const defaultsNorm = mergeConDefecto(normalizarConfigEntrante(configPorDefecto));

  // 1) normaliza respuesta del back y fuerza defaults si vino vacío
  const cfg = mergeConDefecto(normalizarConfigEntrante(cfgDelBack));
  if (!cfg.personas?.length)            cfg.personas            = defaultsNorm.personas;
  if (!cfg.bills?.length)               cfg.bills               = defaultsNorm.bills;
  if (!cfg.egresos_categorias?.length)  cfg.egresos_categorias  = defaultsNorm.egresos_categorias;
  if (!cfg.medios_pago?.length)         cfg.medios_pago         = defaultsNorm.medios_pago;
  if (!cfg.ingresos_fuentes?.length)    cfg.ingresos_fuentes    = defaultsNorm.ingresos_fuentes;
  if (!cfg.pagos?.medios?.length)       cfg.pagos               = defaultsNorm.pagos;

  // 2) limpiar listas / filtros / gráficos ya mismo
  resetearListasUI?.();
  pintarListasVacias();

  // 3) limpiar estado en memoria (vaciar EN SITIO y reexponer)
ingresos.length = 0;
egresos.length  = 0;
pagos.length    = 0;
bills.length    = 0;

// cuelga las mismas referencias en todos lados
W.ingresos = ingresos;  window.ingresos = ingresos;
W.egresos  = egresos;   window.egresos  = egresos;
W.pagos    = pagos;     window.pagos    = pagos;
W.bills    = bills;     window.bills    = bills;

try { ['ingresos','egresos','pagos','bills'].forEach(k => localStorage.removeItem(k)); } catch {}

  // 4) actualizar snapshots y aplicar tema + catálogos
  configActual   = structuredClone(cfg);
  configTemporal = structuredClone(cfg);
  aplicarConfiguracion(cfg);

  // 5) re-render vacío
  try { mostrarIngresos(); } catch {}
  try { mostrarBills();    } catch {}
  try { mostrarEgresos();  } catch {}
  try { mostrarPagos();    } catch {}

  // 6) refrescar preview del logo del modal (si existe)
  const imgPreview = document.getElementById("preview-logo");
  if (imgPreview) {
    if (cfg.logo) { imgPreview.src = cfg.logo; imgPreview.style.display = "block"; }
    else { imgPreview.src = ""; imgPreview.style.display = "none"; }
  }
}
function pintarListasVacias() {
  const bloques = [
    ['lista-ingresos', '🪙 No hay ingresos registrados aún.'],
    ['lista-bills', '🪙 No hay bills registrados aún.'],
    ['lista-egresos-personales', '🪙 No hay egresos registrados aún.'],
    ['lista-pagos', '🪙 No hay pagos registrados aún.'],
  ];
  for (const [id, msg] of bloques) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<p>${msg}</p>`;
  }
}

// =============================
// Registrador ÚNICO de globals
// =============================
function registerGlobals() {
  // asegúrate de tener el contenedor
  window.W = window.W || {};

  // nombres que quieres exponer
  const keys = [
    // estado / catálogos
    "configPorDefecto","configTemporal","configActual",
    "configFuentesIngresos","configBills","configPersonas",
    "configEgresosCategorias","configMediosPago",
    "ingresos","bills","pagos","egresos",

    // helpers
    "byFechaDesc","nombreDelMes","obtenerIngresosDelMes","obtenerEgresosDelMes",
    "formatoLegible","ownerDisplay","getApodo","getTelefonoDueno","clienteActual",
    "normalizarTelefono","dedupePersonas","personasActuales","buscarPersonaPorNombre",
    "normalizaPersona","getPersonasVigentes","limpiarBillsConPersonasInvalidas",
    "toastOk","toastErr","borrarColeccion","setSelect","_safeArray","_getCfgFuenteIngresos",
    "resetIngresosSelects","_cfgSegura","limpiarYRepoblarSelects","resetearListasUI",
    "cargarYNormalizarEgresos",

    // vistas / renders
    "mostrarIngresos","editarIngreso","eliminarIngreso","actualizarResumenIngresos","actualizarGraficoIngresos",
    "mostrarBills","editarBill","eliminarBill","enviarMensaje","actualizarResumenBills","actualizarGrafico",
    "mostrarEgresos","editarEgreso","eliminarEgreso",
    "mostrarPagos","editarPago","eliminarPago","esNoPagoRegistro","buildWhatsURLPagoSoloConfig",
    "actualizarResumenPagos","actualizarGraficoPagos",

    // config / UI
    "aplicarConfiguracion","actualizarSelectsVistas","aplanarListas","restablecerConfiguracion",
    "toggleMedioPorMonto","rellenarSelectsPagos","poblarSubmediosPagoDesdeSeleccion",
  ];

  // copia segura desde window: acceder a window.prop es seguro (devuelve undefined si no existe)
  for (const k of keys) {
    const v = window[k];
    if (typeof v !== "undefined") {
      try { W[k] = v; } catch {}
    }
  }

  // atajo cómodo para abrir ventanas (lo usan tus botones de WhatsApp)
  if (!W.open) {
    W.open = function(url, target = "_blank", features = "") {
      return window.open(url, target, features);
    };
  }
}

// =====================================
// CARGAR Y NORMALIZAR EGRESOS (una vez)
// =====================================
let _egresosCargando = false;
let _egresosListos   = false;

function cargarYNormalizarEgresos(callback) {
  // si ya los tenemos en memoria, usamos eso
  if (_egresosListos && Array.isArray(egresos) && egresos.length > 0) {
    callback && callback();
    return;
  }
  if (_egresosCargando) {
    // evita loops agresivos
    setTimeout(() => { callback && callback(); }, 0);
    return;
  }
  if (!isLoggedIn()) {
  _egresosListos = true;
  _egresosCargando = false;
  callback && callback();
  return;
}
  _egresosCargando = true;

  fetchJSON('/cargar_egresos')   // 👈 usa el helper robusto
    .then(payload => {
      const lista = Array.isArray(payload)
        ? payload
        : (Array.isArray(payload.egresos) ? payload.egresos : []);

      const normalizados = (lista || []).map(e => {
        let fecha = e?.fecha ? String(e.fecha) : "";
        if (fecha.includes("T")) fecha = fecha.split("T")[0];
        fecha = fecha.replace(/\//g, "-").slice(0, 10);
        const montoNum = Number(String(e?.monto ?? 0).toString().replace(/[^0-9.-]+/g, ""));
        return {
          ...e,
          fecha,
          monto: isNaN(montoNum) ? 0 : montoNum
        };
      });

      egresos.length = 0;
      egresos.push(...normalizados);
      window.egresos = egresos;

      _egresosListos   = true;
      _egresosCargando = false;
      callback && callback();
    })
    .catch(err => {
      const msg = String(err?.message || "");
      // si es 401, mostramos login y NO seguimos spameando
      if (msg.includes('HTTP 401')) {
        document.getElementById('modal-login')?.classList.add('abierto');
      } else {
        console.error("Error cargando egresos:", err);
        // opcional: toastErr?.('❌ No se pudieron cargar los egresos');
      }
      _egresosListos   = true;   // marcamos listo para no entrar en bucles
      _egresosCargando = false;
      callback && callback();
    });
}

// =============================
// CAMBIO DE VISTA
// =============================
W.mostrarVista = function (idVista) {
  document.querySelectorAll(".vista").forEach(vista => {
    vista.style.display = "none";
  });

  const vistaActiva = document.getElementById(idVista);
  if (vistaActiva) vistaActiva.style.display = "block";

  // Ahora solo una llamada global
  actualizarSelectsVistas();
};

// =============================
// MODAL DE CONFIGURACIÓN
// =============================
async function abrirModalConfiguracion() {
  const cliente = clienteActual();

  let data;
  try {
    data = cliente
      ? await fetchJSON(`/cargar_configuracion?cliente=${encodeURIComponent(cliente)}`, { method: 'GET' }, { silent401: false })
      : configPorDefecto;
  } catch (err) {
    // Si es 401 ya se mostró el login en fetchJSON; salimos sin abrir modal
    if (String(err?.message).includes('401')) return;
    console.error("❌ Error cargando configuración:", err);
    data = {};
  }

  const base = data && Object.keys(data).length ? data : configPorDefecto;
  const cfg  = mergeConDefecto(normalizarConfigEntrante(base));

  // snapshots
  configTemporal = structuredClone(cfg);
  configActual   = structuredClone(cfg);

  // Actualiza arrays SIN reasignar
  replaceArray(
    configFuentesIngresos,
    Array.from(new Set((cfg.ingresos_fuentes || []).map(s => String(s).trim()).filter(Boolean)))
  );

  replaceArray(
    configPersonas,
    (typeof dedupePersonas === 'function')
      ? dedupePersonas((cfg.personas || []).map(p => (typeof normalizaPersona === 'function' ? normalizaPersona(p) : p)))
      : (cfg.personas || [])
  );

  replaceArray(
    configBills,
    (typeof limpiarBillsConPersonasInvalidas === 'function')
      ? limpiarBillsConPersonasInvalidas(cfg.bills || [], configPersonas)
      : (cfg.bills || [])
  );

  replaceArray(configEgresosCategorias, cfg.egresos_categorias || []);
  replaceArray(configMediosPago,        cfg.medios_pago        || []);

  // Reexponer referencias
  W.configFuentesIngresos = configFuentesIngresos;
  W.configBills           = configBills;
  W.configPersonas        = configPersonas;
  W.configMediosPago      = configMediosPago;

  // Pintar el modal
  try { cargarEnModal(configTemporal); } catch(e){ console.warn("cargarEnModal()", e); }
  try { W.llenarSelectFuentes?.(); } catch{}
  try { W.llenarSelectFuentesIngresos?.(); } catch{}
  try { renderizarConfigPagos?.(); } catch{}
  try { configTemporal.pagos && marcarChecksPagos?.(configTemporal.pagos); } catch{}

  const modal = document.getElementById("modal-configuracion");
  if (modal) modal.style.display = "flex";

  // Solo refrescos ligeros (sin re-aplicar tema global desde aquí)
  try { actualizarSelectsVistas?.(); }   catch(e){ console.warn("actualizarSelectsVistas()", e); }
  try { wireDisponibleAuto?.(); }        catch(e){ console.warn("wireDisponibleAuto()", e); }
  try { refrescarDisponibleGlobal?.(); } catch(e){ console.warn("refrescarDisponibleGlobal()", e); }
}

function cerrarModalConfiguracion() {
  const modal = document.getElementById("modal-configuracion");
  if (modal) modal.style.display = "none";
}

// =============================
// SERVICE WORKER
// =============================
if ('serviceWorker' in navigator) {
  W.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then(reg => console.log('🎉 Service Worker registrado', reg))
      .catch(err => console.error('😢 Error al registrar SW', err));
  });
}

// =============================
// FUNCIONES AUXILIARES
// =============================
function setInput(id, valor) {
  const el = document.getElementById(id);
  if (el) el.value = valor;
}

// === UTILITARIO GLOBAL: obtiene el value de un input por ID y hace trim. ===
function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

function guardarTelefonoDueno() {
  const tel = getVal("input-telefono-dueno");
  telefonoDueno = tel;
  if (typeof configTemporal === 'object') configTemporal.telefono_dueno = tel;
  alert("Número del dueño actualizado: " + tel);
}

// ---------------------------------------------------------------------------
// OPCIONAL: Si decides mantener cargarConfigYAplicar, hazla "segura":
// - No aplica defaults si /cargar_configuracion falla o devuelve 401
// - Úsala SOLO tras sesión OK (por ejemplo dentro de iniciarZonaPrivada)
// ---------------------------------------------------------------------------
let __cfgLoaded = false;
async function cargarConfigYAplicar() {
  if (__cfgLoaded) return;  // evita dobles cargas para el mismo login
  __cfgLoaded = true;

  let base = null;
  try {
    base = await fetchJSON('/cargar_configuracion', { method: 'GET' }, { silent401: true });
  } catch (e) {
    // Si cayó en 401, NO apliques defaults aquí. Deja el tema público ya aplicado.
    if (String(e?.message).includes('401')) { __cfgLoaded = false; return; }
    console.warn('cargarConfigYAplicar(): error no crítico:', e);
  }

  if (!base) {
    // Nada que aplicar (ya tienes /config_default desde boot)
    return;
  }

  const cfg = mergeConDefecto(normalizarConfigEntrante(base));
  // copias de trabajo
  configActual   = structuredClone(cfg);
  configTemporal = structuredClone(cfg);

  // Aplica tema/catálogos del usuario
  aplicarConfiguracion(cfg);
}

// ---------------------------------------------------------------------------
// Aplica cambios del modal en vivo (sin guardar en backend)
// ---------------------------------------------------------------------------
function aplicarConfiguracionDesdeModal() {
  // 1) Vistas marcadas en el modal
  const vistasSeleccionadas = Array.from(
    document.querySelectorAll(".vista-checkbox:checked")
  ).map(cb => cb.value);

  const vistasFinal = vistasSeleccionadas.length
    ? vistasSeleccionadas
    : (configActual?.vistas || []);

  // 2) Lee selección de pagos del modal (si existe)
  try { leerConfigPagosSeleccion?.(); } catch {}

  // 3) Construye la nueva config con lo que hay en el modal + arrays actuales
  const nueva = {
    colores: {
      fondo: getVal("conf-fondo") || (configActual.colores?.fondo || "#f9f9f9"),
      boton_inicio: getVal("conf-boton-inicio") || (configActual.colores?.boton_inicio || "#9a27f7"),
      boton_fin: getVal("conf-boton-fin") || (configActual.colores?.boton_fin || "#e762d5"),
    },
    tarjetaResumen: {
      colorInicio: getVal("conf-resumen-inicio") || (configActual.tarjetaResumen?.colorInicio || "#fa9be2"),
      colorFinal: getVal("conf-resumen-fin") || (configActual.tarjetaResumen?.colorFinal || "#ffffff"),
    },
    fuentes: {
      titulo: getVal("conf-fuente-titulo") || (configActual.fuentes?.titulo || "Gochi Hand"),
      secundario: getVal("conf-fuente-cuerpo") || (configActual.fuentes?.secundario || "Arial"),
      colorTitulo: getVal("conf-color-titulo") || (configActual.fuentes?.colorTitulo || "#553071"),
      colorSecundario: getVal("conf-color-secundario") || (configActual.fuentes?.colorSecundario || "#8b68b0"),
    },
    logo: (typeof configTemporal?.logo === 'string' ? configTemporal.logo : (configActual.logo || "")),
    vistas: vistasFinal,

    // catálogos actuales (editados en modal con sus botones)
    ingresos_fuentes: Array.isArray(configFuentesIngresos) ? [...configFuentesIngresos] : (configActual.ingresos_fuentes || []),
    bills: Array.isArray(configBills) ? [...configBills] : (configActual.bills || []),
    personas: Array.isArray(configPersonas) ? [...configPersonas] : (configActual.personas || []),
    egresos_categorias: Array.isArray(configEgresosCategorias) ? [...configEgresosCategorias] : (configActual.egresos_categorias || []),
    medios_pago: Array.isArray(configMediosPago) ? [...configMediosPago] : (configActual.medios_pago || []),

    telefono_dueno: getVal("input-telefono-dueno") || configTemporal?.telefono_dueno || configActual?.telefono_dueno || "",
    pagos: configTemporal?.pagos || configActual?.pagos || { bills: [], personas: [], medios: [], submediosPorMedio: {} }
  };

  // 4) Refresca estado en memoria
  configTemporal = structuredClone(nueva);
  configActual   = structuredClone(nueva);

  // 5) Aplica estilos/colores/fuentes/botones/tarjetas + repoblar selects
  aplicarConfiguracion(nueva);

  // 6) Mostrar/ocultar botones del menú según vistas activas
  document.querySelectorAll("#menu-vistas button[data-vista]").forEach(btn => {
    const v = btn.dataset.vista;
    btn.style.display = vistasFinal.includes(v) ? "inline-block" : "none";
  });

  // 7) Si hay vistas, muestra la primera
  if (Array.isArray(vistasFinal) && vistasFinal.length) {
    document.querySelectorAll(".vista").forEach(v => {
      if (v.id === 'usuario') return; // no tocar el login
      v.style.display = vistasFinal.includes(v.id) ? "block" : "none";
    });
    if (typeof window.mostrarVista === 'function') window.mostrarVista(vistasFinal[0]);
  }

  try { toastOk?.('Configuración aplicada (no guardada)'); } catch {}
}

// Si tu HTML llama onclick, expón al global:
window.aplicarConfiguracionDesdeModal = aplicarConfiguracionDesdeModal;

// ==============================
// CARGAR EN EL MODAL (simplificado, sin preview en vivo)
// ==============================
function cargarEnModal(cfg) {
  // snapshot para revertir si cierra sin guardar
  copiaAntesDeAbrirGlobal = structuredClone(configActual);
  seGuardoConfiguracion = false;

  // === Rellenar inputs ===
  setInput("conf-fondo", cfg.colores.fondo);
  setInput("conf-boton-inicio", cfg.colores.boton_inicio);
  setInput("conf-boton-fin", cfg.colores.boton_fin);
  setInput("conf-resumen-inicio", cfg.tarjetaResumen.colorInicio);
  setInput("conf-resumen-fin", cfg.tarjetaResumen.colorFinal);
  setInput("conf-color-titulo", cfg.fuentes.colorTitulo);
  setInput("conf-color-secundario", cfg.fuentes.colorSecundario);
  setInput("conf-fuente-titulo", cfg.fuentes.titulo);
  setInput("conf-fuente-cuerpo", cfg.fuentes.secundario);
  setInput("input-telefono-dueno", cfg.telefono_dueno || "");
  telefonoDueno = cfg.telefono_dueno || "";

// === Logo preview dentro del modal ===
const imgPreview = document.getElementById("preview-logo");
if (imgPreview) {
  if (cfg.logo && cfg.logo.trim() !== "") {
    imgPreview.src = cfg.logo;          // 👈 variable correcta
    imgPreview.style.display = "block";
  } else {
    imgPreview.src = "";
    imgPreview.style.display = "none";
  }
}

  // === ⚠️ EVITAR LISTENERS DUPLICADOS EN LAS CASILLAS DEL MODAL ===
  // Usamos el contenedor de las casillas y marcamos que ya se añadió el listener.
  const wrapper = document.getElementById("vistas-opciones");
  if (wrapper && !wrapper.dataset.listener) {
    document.querySelectorAll(".vista-checkbox").forEach(cb => {
      cb.addEventListener("change", () => {
        // 1️⃣ recojo qué vistas quedaron marcadas
        const vistasSeleccionadas = Array.from(
          document.querySelectorAll(".vista-checkbox:checked")
        ).map(c => c.value);

        // 2️⃣ actualizo visibilidad de botones del menú
        document.querySelectorAll("#menu-vistas button[data-vista]")
          .forEach(btn => {
            btn.style.display = vistasSeleccionadas.includes(btn.dataset.vista)
              ? "inline-block"
              : "none";
          });

        // 3️⃣ si hay al menos una, muestro sólo la primera
        if (vistasSeleccionadas.length > 0) {
          mostrarVista(vistasSeleccionadas[0]);
        } else {
          // si no queda ninguna, oculto todas
          document.querySelectorAll(".vista").forEach(v => v.style.display = "none");
        }

        // 4️⃣ refresco el panel interno del modal
        actualizarOpcionesEspecificas();
      });
    });

    // Marcamos que ya agregamos los listeners (la próxima vez no se duplica)
    wrapper.dataset.listener = "1";
  }

  // 3) Refresca las opciones del modal
  actualizarOpcionesEspecificas();
}

//==============================
// EVENTOS DOM para el modal
// ==============================
document.addEventListener("DOMContentLoaded", () => {
  const btnAbrir = document.getElementById("abrir-configuracion");
  if (btnAbrir) {
    btnAbrir.addEventListener("click", () => {
      cargarEnModal(configTemporal);
      document.getElementById("modal-configuracion").style.display = "flex";
    });
  }

  const inputLogo = document.getElementById("conf-logo");
  const imgPreview = document.getElementById("preview-logo");

  inputLogo?.addEventListener("change", () => {
    const file = inputLogo.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result;
      configTemporal.logo = base64;

      if (imgPreview) {
        imgPreview.src = base64;
        imgPreview.style.display = "block";
      }

      document.querySelectorAll(".logo-izquierda").forEach(img => {
        img.src = base64;
        img.style.display = "inline-block";
      });
    };
    reader.readAsDataURL(file);
  });
 });

// =============================
// GUARDAR CONFIGURACIÓN (definitivo)
// =============================
function guardarConfiguracion() {
  // 0) Extras de perfil usados en la UI
  configTemporal.telefono_dueno = getVal("input-telefono-dueno");

  // 1) Si existe lectura del modal de pagos, úsala
  try { leerConfigPagosSeleccion(); } catch {}

  // 2) Partes base desde la config en memoria
  const cfg = { ...configTemporal };

  // 3) Normalizaciones mínimas de catálogos
  const personas = Array.isArray(cfg.personas)
    ? cfg.personas
        .map(p => ({ nombre: String(p?.nombre||'').trim(), telefono: String(p?.telefono||'').trim() }))
        .filter(p => p.nombre)
    : [];

  const bills = Array.isArray(cfg.bills)
    ? cfg.bills
        .map(b => ({ nombre: String(b?.nombre||'').trim(), personas: Array.isArray(b?.personas) ? b.personas.filter(Boolean) : [] }))
        .filter(b => b.nombre)
    : [];

  const egresos_categorias = Array.isArray(cfg.egresos_categorias)
    ? cfg.egresos_categorias
        .map(c => ({ categoria: String(c?.categoria||'').trim(), subcategorias: Array.isArray(c?.subcategorias) ? c.subcategorias.filter(Boolean) : [] }))
        .filter(c => c.categoria)
    : [];

  const medios_pago = Array.isArray(cfg.medios_pago)
    ? cfg.medios_pago
        .map(m => ({ medio: String(m?.medio||'').trim(), submedios: Array.isArray(m?.submedios) ? m.submedios.filter(Boolean) : [] }))
        .filter(m => m.medio)
    : [];

  const ingresos_fuentes = Array.isArray(cfg.ingresos_fuentes)
    ? cfg.ingresos_fuentes.filter(Boolean)
    : [];

  // 4) pagos_config: tomar del modal si hay; si no, autogenerar consistente
  let pagos_config = cfg.pagos || cfg.pagos_config || null;
  if (!pagos_config) {
    pagos_config = {
      bills: bills.map(b => b.nombre),
      personas: personas.map(p => p.nombre),
      medios: medios_pago.map(m => m.medio),
      submediosPorMedio: Object.fromEntries(medios_pago.map(m => [m.medio, m.submedios || []]))
    };
  } else {
    // coherencia con catálogos actuales
    const billsSet    = new Set(bills.map(b => b.nombre));
    const personasSet = new Set(personas.map(p => p.nombre));
    const mediosSet   = new Set(medios_pago.map(m => m.medio));

    pagos_config.bills    = (pagos_config.bills    || []).filter(x => billsSet.has(x));
    pagos_config.personas = (pagos_config.personas || []).filter(x => personasSet.has(x));
    pagos_config.medios   = (pagos_config.medios   || []).filter(x => mediosSet.has(x));

    const spm = pagos_config.submediosPorMedio || {};
    const limpio = {};
    for (const medio in spm) {
      if (mediosSet.has(medio)) {
        limpio[medio] = Array.isArray(spm[medio]) ? spm[medio].filter(Boolean) : [];
      }
    }
    pagos_config.submediosPorMedio = limpio;
  }

  // 5) Payload EXACTO que espera el backend (columnas jsonb)
  const payload = {
    colores:          cfg.colores || {},
    fuentes:          cfg.fuentes || {},
    logo:             cfg.logo || "",
    vistas:           Array.isArray(cfg.vistas) ? cfg.vistas : ["ingresos","bills","egresos","pagos"],
    personas,
    bills_conf:       bills,
    egresos_conf:     egresos_categorias,
    medios_pago,
    ingresos_fuentes,
    pagos_config
  };

  // 6) Aplica en vivo (para que la UI refleje lo que vas a guardar)
  try { aplicarConfiguracion({ ...configTemporal, ...payload }); } catch {}

  // 7) Persistir en backend
  fetch('/guardar_configuracion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(async (res) => {
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok || data?.ok === false) {
      const msg = data?.error || data?.mensaje || 'Error desconocido';
      throw new Error(msg);
    }
    return data;
  })
  .then((data) => {
    // Refrescar estados locales
    configTemporal = structuredClone({ ...configTemporal, ...payload });
    configActual   = structuredClone({ ...configActual,   ...payload });
    try { sincronizarVistasSegunConfig?.(); } catch {}

    Swal.fire({ toast:true, position:'top-end', icon:'success',
                title: data.mensaje || '✅ Configuración guardada',
                showConfirmButton:false, timer:2000 });
    cerrarModalConfiguracion?.();
  })
  .catch(err => {
    console.error("❌ Error al guardar configuración:", err);
    Swal.fire({ icon:'error', title:'❌ Error', text:String(err.message || err) });
  });
}

// =============================
// RESTABLECER TODO: config por defecto + borrar TODOS los datos
// =============================
async function restablecerConfiguracion() {
  const ok = confirm("⚠️ Esto restablecerá la configuración por defecto y borrará TODOS tus datos (ingresos, egresos, bills y pagos). ¿Continuar?");
  if (!ok) return;

  try {
    // 1) reset de configuración en el servidor
    const resp = await fetchJSON('/restablecer_configuracion', { method: 'POST' });
    if (!resp || resp.ok === false) throw new Error(resp?.error || 'No se pudo restablecer');

    // 2) borrar colecciones (envía id cuando exista)
    const borrarColeccion = async (loadUrl, extractArray, deleteUrl, mapPayload) => {
      try {
        const data = await fetchJSON(loadUrl);
        const arr = extractArray(data) || [];
        for (const it of arr) {
          await fetchJSON(deleteUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mapPayload(it))
          }).catch(() => {});
        }
      } catch (e) { console.warn('borrarColeccion falló:', loadUrl, e); }
    };

    await borrarColeccion('/cargar_ingresos', p => Array.isArray(p) ? p : (p.ingresos || p || []), '/eliminar_ingreso', i => i);
    await borrarColeccion('/cargar_egresos', p => Array.isArray(p) ? p : (p.egresos  || p || []), '/eliminar_egreso',  e => e);
    await borrarColeccion('/cargar_bills',   p => Array.isArray(p) ? p : (p.bills    || p || []), '/eliminar_bill',   b => (b?.id ? { id: b.id } : b));
    await borrarColeccion('/cargar_pagos',   p => Array.isArray(p) ? p : (p.pagos    || p || []), '/eliminar_pago',   x => (x?.id ? { id: x.id } : x));

    // 3) aplicar defaults y refrescar todo (selects incluidos) SIN reiniciar
    refrescarUITrasReset(resp.config);

    // 4) UX
    try {
      Swal.fire({ icon: 'success', title: '🧹 Restablecido', text: 'Valores de fábrica aplicados.', timer: 1800, showConfirmButton: false });
    } catch {}
    cerrarModalConfiguracion?.();
  } catch (e) {
    console.error('reset server fail', e);
    try { Swal.fire({ icon:'error', title:'Error', text: String(e.message || e) }); } catch {}
  }
}

// ==============================
// FUNCIÓN AUXILIAR PARA RELLENAR SELECT
// ==============================
function rellenarSelect(select, opciones, placeholder = "Seleccionar") {
  if (!select) return;
  select.innerHTML = `<option value="">${placeholder}</option>`;
  opciones.forEach(texto => {
    select.innerHTML += `<option value="${texto}">${texto}</option>`;
  });
}

// ==============================
// ACTUALIZAR SELECTS DE TODAS LAS VISTAS
// ==============================
function actualizarSelectsVistas(vista = "todos") {
  console.log("DEBUG: actualizarSelectsVistas()", vista);

  // ======================================
  // INGRESOS
  // ======================================
  if (vista === "todos" || vista === "ingresos") {
  const selectIngresos = document.getElementById("fuente-ingreso");
  const filtroFuenteIngreso = document.getElementById("filtro-fuente-ingreso");

  rellenarSelect(selectIngresos, configFuentesIngresos, "Selecciona fuente");
  rellenarSelect(filtroFuenteIngreso, configFuentesIngresos, "Todas");
}

  // ======================================
  // BILLS
  // ======================================
  if (vista === "todos" || vista === "bills") {
    const selectTipoBill = document.getElementById("bill-tipo");
    const filtroTipoBill = document.getElementById("filtro-tipo-bill");

    rellenarSelect(selectTipoBill, configBills.map(b => b.nombre), "Selecciona tipo");
    rellenarSelect(filtroTipoBill, configBills.map(b => b.nombre), "Todos");

    // Personas en BILLS (checkbox)
    const personasContainer = document.getElementById("bill-personas-lista");
    if (personasContainer) {
      personasContainer.innerHTML = "";
      configPersonas.forEach(persona => {
        const idSeguro = persona.nombre.replace(/\s+/g, '-').replace(/[^\w-]/g, '');
        personasContainer.innerHTML += `
          <div class="fila-bill">
            <label>
              <input type="checkbox" name="persona" value="${persona.nombre}">
              ${persona.nombre}
            </label>
            <span id="monto-${idSeguro}" class="monto-persona">$0.00</span>
            <button type="button" onclick="enviarMensaje('${persona.nombre}', 0)">📩</button>
          </div>
        `;
      });
    }
  }

  // ======================================
  // EGRESOS
  // ======================================
  if (vista === "todos" || vista === "egresos") {
    const selectCategoria = document.getElementById("categoria-egreso");
    const filtroCategoria = document.getElementById("filtro-categoria-egreso");
    rellenarSelect(selectCategoria, configEgresosCategorias.map(c => c.categoria), "Seleccionar");
    rellenarSelect(filtroCategoria, configEgresosCategorias.map(c => c.categoria), "Todas");

    const selectMedioEgreso = document.getElementById("medio-egreso");
    rellenarSelect(selectMedioEgreso, configMediosPago.map(m => m.medio), "Seleccionar medio");
  }

  // ======================================
  // PAGOS
  // ======================================

    if (vista === "todos" || vista === "pagos") {
      // En lugar de rellenar uno por uno con los arrays globales,
      // usamos lo seleccionado en el modal:
      rellenarSelectsPagos();
    }
}

// =============================
// LLENAR SELECT DE FUENTES (para el modal)
// =============================
// === Tipografías del modal (RENOMBRADA para evitar choque con Ingresos) ===
function llenarSelectFuentesTipografia() {
  const fuentesTitulo = document.getElementById("conf-fuente-titulo");
  const fuentesCuerpo = document.getElementById("conf-fuente-cuerpo");

  if (W.configTemporal?.fuentes) {
    if (fuentesTitulo) fuentesTitulo.value = W.configTemporal.fuentes.titulo || "Arial";
    if (fuentesCuerpo)  fuentesCuerpo.value = W.configTemporal.fuentes.secundario || "Arial";
  }
}

// ✅ Alias de compatibilidad: si en algún lado llaman a llenarSelectFuentes(),
// lo redirigimos a la función nueva sin que tengas que cambiar nada más.
if (typeof W.llenarSelectFuentes !== "function") {
  W.llenarSelectFuentes = (...args) => llenarSelectFuentesTipografia(...args);
}


// =============================
// LEER DATOS DESDE EL MODAL A configTemporal
// =============================
function leerDesdeModal() {
  const vistas = Array.from(document.querySelectorAll(".vista-checkbox:checked"))
                      .map(cb => cb.value);

  configTemporal.colores = {
    fondo: getVal("conf-fondo"),
    texto: getVal("conf-texto"),
    boton_inicio: getVal("conf-boton-inicio"),
    boton_fin: getVal("conf-boton-fin")
  };

  configTemporal.tarjetaResumen = {
    colorInicio: getVal("conf-resumen-inicio"),
    colorFinal: getVal("conf-resumen-fin")
  };

  configTemporal.fuentes = {
    titulo: getVal("conf-fuente-titulo"),
    secundario: getVal("conf-fuente-cuerpo")
  };

  // NO tocar configTemporal.logo aquí
  // El logo ya está guardado en memoria cuando se selecciona un archivo en el input
  // y se maneja con FileReader.
  configTemporal.vistas = vistas;
}

// =============================
// OPCIONES ESPECÍFICAS SEGÚN VISTA
// =============================

function actualizarOpcionesEspecificas() {
  const contenedor = document.getElementById("opciones-especificas");
  if (!contenedor) return;
  contenedor.innerHTML = "";

  const vistasSeleccionadas = Array.from(document.querySelectorAll(".vista-checkbox:checked"))
                                   .map(cb => cb.value);

  console.log("✅ Vistas seleccionadas para renderizar:", vistasSeleccionadas);

  vistasSeleccionadas.forEach(vista => {
    if (vista === "ingresos") {
      contenedor.insertAdjacentHTML("beforeend", `
        <div id="config-ingresos">
          <h3>⚙️ Configuración Ingresos</h3>
          <h4>✏️ Editar Fuentes</h4>
          <div class="fila-con-boton">
            <input type="text" class="input-pequeno" id="input-ingresos-fuente" placeholder="🛒 Walmart">
            <button class="boton-pequeno" type="button" onclick="agregarConfigFuenteIngreso()">➕</button>
          </div>
          <div id="lista-ingresos-fuentes" class="contenedor-lista"></div>
        </div>
      `);
      renderizarConfigFuentesIngresos();
    }

    if (vista === "bills") {
      contenedor.insertAdjacentHTML("beforeend", `

        <div id="config-personas">
          <h3>⚙️ Configuración Bills</h3>
          <h4>✏️ Editar Personas</h4>
          <div class="fila-con-boton">
            <input type="text" class="input-pequeno" id="input-nombre-persona" placeholder="Nombre">
            <input type="text" class="input-pequeno" id="input-telefono-persona" placeholder="+00 (000) 000-0000">
            <button class="boton-pequeno" type="button" onclick="agregarConfigPersona()">➕</button>
          </div>
          <small id="telefono-ejemplo" class="texto-secundario">Ejemplo: +12 (345) 678-9012</small>
          <div id="lista-personas" class="contenedor-lista"></div>
        </div>

        <div id="config-bills">
          <h4>✏️ Editar Bills</h4>
          <div class="fila-con-boton">
            <input type="text" class="input-pequeno" id="input-bill-nombre" placeholder="💡 Luz">
            <button class="boton-pequeno" type="button" onclick="agregarConfigBill()">➕</button>
          </div>
          <p style="margin: 5px 0; font-size: 15px; color: #555;">Elige entre cuántas personas pagarán el Bill</p>
          <div id="lista-bills-config" class="contenedor-lista"></div>
        </div>
      `);

      renderizarConfigPersonas();
      renderizarConfigBills();

      // Validar formato de teléfono
      setTimeout(() => {
        const telefonoInput = document.getElementById("input-telefono-persona");
        const telefonoEjemplo = document.getElementById("telefono-ejemplo");

        if (telefonoInput) {
          telefonoInput.addEventListener("input", () => {
            let val = telefonoInput.value.replace(/[^\d]/g, "");
            if (val.length > 15) val = val.slice(-15);

            const parte4 = val.slice(-4);
            const parte3 = val.slice(-7, -4);
            const parte2 = val.slice(-10, -7);
            const codigoPais = val.slice(0, -10);

            let formatted = "";
            if (codigoPais) formatted += `+${codigoPais} `;
            if (parte2) formatted += `(${parte2}) `;
            if (parte3) formatted += `${parte3}-`;
            if (parte4) formatted += `${parte4}`;

            telefonoInput.value = formatted.trim();

            if (val.length < 10) {
              telefonoInput.style.borderColor = "red";
              telefonoEjemplo.textContent = "Número incompleto: mínimo 10 dígitos";
              telefonoEjemplo.style.color = "red";
            } else {
              telefonoInput.style.borderColor = "";
              telefonoEjemplo.textContent = "Ejemplo: +1 (000) 000-0000";
              telefonoEjemplo.style.color = "#999";
            }
          });
        }
      }, 50);
    }

    if (vista === "egresos") {
      contenedor.insertAdjacentHTML("beforeend", `
        <div id="config-egresos">
          <h3>⚙️ Configuración Egresos</h3>
          <h4>✏️ Editar Categorías</h4>
          <div class="fila-con-boton">
            <input type="text" class="input-pequeno" id="input-egreso-categoria" placeholder="🍔 Comida">
            <button class="boton-pequeno" type="button" onclick="agregarCategoriaEgreso()">➕</button>
          </div>
          <div id="lista-categorias-egreso" class="contenedor-lista"></div>

          <h4>✏️ Editar Medios de Pago</h4>
          <div class="fila-con-boton">
            <input type="text" class="input-pequeno" id="input-medio-pago" placeholder="💳 Zelle">
            <button class="boton-pequeno" type="button" onclick="agregarMedioPago()">➕</button>
          </div>
          <div id="lista-medios-pago" class="contenedor-lista"></div>
        </div>
      `);
      renderizarConfigEgresos();
    }
      if (vista === "pagos") {
  contenedor.insertAdjacentHTML("beforeend", `
        <div id="config-pagos" class="config-item">
          <h3>⚙️ Configuración Pagos</h3>
          <h4>Seleccionar Bills a Usar</h4>
          <div id="lista-bills-pagos" class="chips-wrapper"></div>

          <h4>Selecciona Personas a Usar</h4>
          <div id="lista-personas-pagos" class="chips-wrapper"></div>

          <h4>Selecciona Medio de Pago a Usar</h4>
          <div id="lista-medios-pago-pagos" class="contenedor-lista"></div>
        </div>
      `);
      renderizarConfigPagos(); // <- justo después de insertar el HTML
    }
  }); // <- cierra forEach
} // <- cierra función

// =============================
// CONFIGURACION INGRESOS
// =============================
function agregarConfigFuenteIngreso() {
  const input = document.getElementById("input-ingresos-fuente");
  const valor = input.value.trim();
  if (!valor) return;

  configFuentesIngresos.push(valor);
  input.value = "";
  renderizarConfigFuentesIngresos();
}

function eliminarConfigFuenteIngreso(index) {
  configFuentesIngresos.splice(index, 1);
  renderizarConfigFuentesIngresos();
}

function renderizarConfigFuentesIngresos() {
  const contenedor = document.getElementById("lista-ingresos-fuentes");
  if (!contenedor) return;

  contenedor.innerHTML = "";
  configFuentesIngresos.forEach((fuente, index) => {
    const item = document.createElement("div");
    item.className = "fuente-item"; // Asegúrate de tener este estilo en tu CSS
    item.innerHTML = `
      <span>${fuente}</span>
      <button type="button" class="boton-pequeno eliminar" onclick="eliminarConfigFuenteIngreso(${index})">✖</button>
    `;
    contenedor.appendChild(item);
  });
}

function llenarSelectFuentesIngresos() {
  const select = document.getElementById("fuente-ingreso");
  const filtro = document.getElementById("filtro-fuente-ingreso");
  if (!select && !filtro) return;

  // 1) Tomar fuentes desde Config (preferir configFuentesIngresos; caer a configTemporal.ingresos_fuentes)
  const raw = (Array.isArray(W.configFuentesIngresos) && W.configFuentesIngresos.length)
    ? W.configFuentesIngresos
    : (Array.isArray(W.configTemporal?.ingresos_fuentes) ? W.configTemporal.ingresos_fuentes : []);

  // 2) Limpiar y deduplicar
  const fuentes = [...new Set(raw.map(f => String(f).trim()).filter(Boolean))];

  // 3) Formulario
  if (select) {
    const prev = select.value;
    select.innerHTML = `<option value="" disabled selected>Selecciona fuente</option>`;
    fuentes.forEach(f => select.appendChild(new Option(f, f)));
    // (sin opción "Otro")
    if (fuentes.includes(prev)) select.value = prev;
  }

  // 4) Filtro
  if (filtro) {
    const prevFiltro = filtro.value;
    filtro.innerHTML = `<option value="">Todas</option>`;
    fuentes.forEach(f => filtro.appendChild(new Option(f, f)));
    if (fuentes.includes(prevFiltro)) filtro.value = prevFiltro;
  }
}

// opcional: exponerla por si la llamas desde otros módulos
W.llenarSelectFuentesIngresos = llenarSelectFuentesIngresos;

// =============================
// CONFIGURACION BILLS
// =============================
function agregarConfigBill() {
  const input = document.getElementById("input-bill-nombre");
  const nombre = input.value.trim();
  if (!nombre) return;

  configBills.push({ nombre, personas: [] });
  input.value = "";
  renderizarConfigBills();
}

function eliminarConfigBill(index) {
  configBills.splice(index, 1);
  renderizarConfigBills();
}

function togglePersonaBill(billIndex, nombrePersona, checked) {
  const personas = configBills[billIndex].personas || [];

  if (checked) {
    if (!personas.includes(nombrePersona)) personas.push(nombrePersona);
  } else {
    const i = personas.indexOf(nombrePersona);
    if (i >= 0) personas.splice(i, 1);
  }

  configBills[billIndex].personas = personas;
}

function renderizarConfigBills() {
  const contenedor = document.getElementById("lista-bills-config");
  if (!contenedor) return;
  contenedor.innerHTML = "";

  configBills.forEach((bill, index) => {
    const personasCheckboxes = configPersonas.map(p => `
      <label class="persona-chip">
        <input type="checkbox" onchange="togglePersonaBill(${index}, '${p.nombre}', this.checked)" 
        ${bill.personas?.includes(p.nombre) ? "checked" : ""}>
        ${p.nombre}
      </label>
    `).join("");

    const div = document.createElement("div");
    div.className = "fuente-item";
    div.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; width:100%;">
        <span>${bill.nombre}</span>
        <button class="boton-pequeno eliminar" onclick="eliminarConfigBill(${index})">❌</button>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:4px; margin:4px 0;">
        ${personasCheckboxes}
      </div>
    `;
    contenedor.appendChild(div);
  });

  try { renderizarConfigPagos(); } catch {}
}

// =============================
// CONFIGURACIÓN PERSONAS
// =============================
function agregarConfigPersona() {
  const nombreInput = document.getElementById("input-nombre-persona");
  const telInput = document.getElementById("input-telefono-persona");
  const nombre = nombreInput.value.trim();
  const telefono = telInput.value.trim();

  if (!nombre || !telefono) return;

  configPersonas.push({ nombre, telefono });
  nombreInput.value = "";
  telInput.value = "";
  renderizarConfigPersonas();
}

function eliminarConfigPersona(index) {
  configPersonas.splice(index, 1);
  renderizarConfigPersonas();
}

function renderizarConfigPersonas() {
  const contenedor = document.getElementById("lista-personas");
  if (!contenedor) return;
  contenedor.innerHTML = "";

  configPersonas.forEach((p, index) => {
    const div = document.createElement("div");
    div.className = "fuente-item";
    div.innerHTML = `
      <span>${p.nombre} <small style="color:#666;">📞 ${p.telefono}</small></span>
      <button class="boton-pequeno eliminar" onclick="eliminarConfigPersona(${index})">✖</button>
    `;
    contenedor.appendChild(div);
  });
  try { renderizarConfigPagos(); } catch {}

}
// =============================
// CONFIGURACIÓN EGRESOS
// =============================
function agregarCategoriaEgreso() {
  const input = document.getElementById("input-egreso-categoria");
  const valor = input.value.trim();
  if (!valor) return;

  configEgresosCategorias.push({ categoria: valor, subcategorias: [] });
  input.value = "";
  renderizarConfigEgresos();
}

function eliminarCategoriaEgreso(index) {
  configEgresosCategorias.splice(index, 1);
  renderizarConfigEgresos();
}

function agregarSubcategoria(catIndex) {
  const input = document.getElementById(`input-subcategoria-${catIndex}`);
  const valor = input.value.trim();
  if (!valor) return;

  configEgresosCategorias[catIndex].subcategorias.push(valor);
  input.value = "";
  renderizarConfigEgresos();
}

function eliminarSubcategoria(catIndex, subIndex) {
  configEgresosCategorias[catIndex].subcategorias.splice(subIndex, 1);
  renderizarConfigEgresos();
}
function agregarMedioPago() {
  const input = document.getElementById("input-medio-pago");
  const valor = input.value.trim();
  if (!valor) return;

  configMediosPago.push({ medio: valor, submedios: [] });
  input.value = "";
  renderizarConfigEgresos();
  try { renderizarConfigPagos(); } catch {}
}

function eliminarMedioPago(index) {
  configMediosPago.splice(index, 1);
  renderizarConfigEgresos();
  try { renderizarConfigPagos(); } catch {}
}

function agregarSubmedio(medioIndex) {
  const input = document.getElementById(`input-submedio-${medioIndex}`);
  const valor = input.value.trim();
  if (!valor) return;

  configMediosPago[medioIndex].submedios.push(valor);
  input.value = "";
  renderizarConfigEgresos();
  try { renderizarConfigPagos(); } catch {}
}

function eliminarSubmedio(medioIndex, subIndex) {
  configMediosPago[medioIndex].submedios.splice(subIndex, 1);
  renderizarConfigEgresos();
  try { renderizarConfigPagos(); } catch {}
}
function renderizarConfigEgresos() {
  const categoriasContenedor = document.getElementById("lista-categorias-egreso");
  const mediosContenedor     = document.getElementById("lista-medios-pago");
  if (!categoriasContenedor || !mediosContenedor) return;

  // ========== Categorías ==========
  categoriasContenedor.innerHTML = "";
  configEgresosCategorias.forEach((cat, i) => {
    const subchips = cat.subcategorias.map((sub, j) => `
      <div class="fuente-item">
        <span>${sub}</span>
        <button onclick="eliminarSubcategoria(${i}, ${j})">✖</button>
      </div>
    `).join("");

    const div = document.createElement("div");
    div.className = "config-item";
    div.innerHTML = `
      <div class="config-titulo">
        <strong>${cat.categoria}</strong>
        <button class="boton-pequeno" onclick="eliminarCategoriaEgreso(${i})">❌</button>
      </div>
      <div class="fila-con-boton">
        <input id="input-subcategoria-${i}" class="input-pequeno" placeholder="🍟 Subcategoría">
        <button class="boton-pequeno" onclick="agregarSubcategoria(${i})">➕</button>
      </div>
      <div class="chips-wrapper">${subchips}</div>
    `;
    categoriasContenedor.appendChild(div);
  });

  // ========== Medios de Pago ==========
  mediosContenedor.innerHTML = "";
  configMediosPago.forEach((medio, i) => {
    const subchips = medio.submedios.map((sub, j) => `
      <div class="fuente-item">
        <span>${sub}</span>
        <button onclick="eliminarSubmedio(${i}, ${j})">✖</button>
      </div>
    `).join("");

    const divMedio = document.createElement("div");
    divMedio.className = "config-item";
    divMedio.innerHTML = `
      <div class="config-titulo">
        <strong>${medio.medio}</strong>
        <button class="boton-pequeno" onclick="eliminarMedioPago(${i})">❌</button>
      </div>
      <div class="fila-con-boton">
        <input id="input-submedio-${i}" class="input-pequeno" placeholder="🛡️ Submedio">
        <button class="boton-pequeno" onclick="agregarSubmedio(${i})">➕</button>
      </div>
      <div class="chips-wrapper">${subchips}</div>
    `;
    mediosContenedor.appendChild(divMedio);
  });
}

// =============================
// CONFIGURACION PAGOS (modal)
// =============================
function renderizarConfigPagos() {
  const billsContenedor    = document.getElementById("lista-bills-pagos");
  const personasContenedor = document.getElementById("lista-personas-pagos");
  const mediosContenedor   = document.getElementById("lista-medios-pago-pagos");
  if (!billsContenedor || !personasContenedor || !mediosContenedor) return;

  // Lo ya guardado (para marcar checks)
  const sel = configTemporal?.pagos || {};
  const selBills     = new Set(sel.bills || []);
  const selPersonas  = new Set(sel.personas || []);
  const selMedios    = new Set(sel.medios || []);
  const selSubsPorMedio = sel.submediosPorMedio || {};

  // ===== Bills =====
  billsContenedor.innerHTML = (configBills.length)
    ? configBills.map(b => `
        <label class="fuente-item">
          <input type="checkbox" name="pago-bill" value="${b.nombre}" ${selBills.has(b.nombre) ? "checked" : ""}>
          ${b.nombre}
        </label>
      `).join("")
    : `<em style="color:#999;">No hay nada registrado en la sección Bills 🫣.</em>`;

  // ===== Personas =====
  personasContenedor.innerHTML = (configPersonas.length)
    ? configPersonas.map(p => `
        <label class="fuente-item">
          <input type="checkbox" name="pago-persona" value="${p.nombre}" ${selPersonas.has(p.nombre) ? "checked" : ""}>
          ${p.nombre}
        </label>
      `).join("")
    : `<em style="color:#999;">No hay nada registrado en la sección Personas 🫣.</em>`;

  // ===== Medios + Submedios =====
  if (!Array.isArray(configMediosPago) || !configMediosPago.length) {
    mediosContenedor.innerHTML = `<em style="color:#999;">No hay nada registrado en la sección Medios de Pago 🫣.</em>`;
  } else {
    mediosContenedor.innerHTML = configMediosPago.map(m => {
      const submedios = Array.isArray(m.submedios) ? m.submedios : [];
      const marcadosSub = new Set(selSubsPorMedio[m.medio] || []);
      return `
        <div class="config-item">
          <label class="fuente-item">
            <input type="checkbox" name="pago-medio" value="${m.medio}" ${selMedios.has(m.medio) ? "checked" : ""}>
            ${m.medio}
          </label>
          <div class="chips-wrapper">
            ${submedios.map(sub => `
              <label class="fuente-item">
                <input type="checkbox" name="pago-submedio-${m.medio}" value="${sub}" ${marcadosSub.has(sub) ? "checked" : ""}>
                ${sub}
              </label>
            `).join("")}
          </div>
        </div>
      `;
    }).join("");
  }

  // Listener de cambios para guardar al vuelo y refrescar selects de la vista Pagos
  const cont = document.getElementById("config-pagos");
  if (cont && !cont.dataset.listener) {
    cont.addEventListener("change", (e) => {
      if (e.target.matches(
        '#lista-bills-pagos input[type="checkbox"], ' +
        '#lista-personas-pagos input[type="checkbox"], ' +
        '#lista-medios-pago-pagos input[type="checkbox"]'
      )) {
        leerConfigPagosSeleccion();          // guarda en configTemporal.pagos
        actualizarSelectsVistas("pagos");    // refresca selects de la vista Pagos
      }
    });
    cont.dataset.listener = "1";
  }
}

// =============================
// LEE SELECCIÓN DE CONFIG > PAGOS
// =============================
function leerConfigPagosSeleccion() {
  const billsSel = Array.from(document.querySelectorAll('#lista-bills-pagos input[type="checkbox"]:checked'))
                        .map(cb => cb.value);

  const personasSel = Array.from(document.querySelectorAll('#lista-personas-pagos input[type="checkbox"]:checked'))
                           .map(cb => cb.value);

  const mediosSel = Array.from(document.querySelectorAll('#lista-medios-pago-pagos input[name="pago-medio"]:checked'))
                         .map(cb => cb.value);

  const submediosPorMedio = {};
  configMediosPago.forEach(m => {
    const marcados = Array.from(document.querySelectorAll(`#lista-medios-pago-pagos input[name="pago-submedio-${m.medio}"]:checked`))
                          .map(cb => cb.value);
    if (marcados.length) submediosPorMedio[m.medio] = marcados;
  });

  configTemporal.pagos = {
    bills: billsSel,
    personas: personasSel,
    medios: mediosSel,
    submediosPorMedio
  };
}

// =====================================
//  AUTO-INJECTOR DEL MODAL DE PERFIL
// =====================================
function ensurePerfilModal() {
  if (!document.getElementById("modal-perfil")) {
    const modalHTML = `
    <div id="modal-perfil" class="modal">
      <div class="modal-content" role="dialog" aria-modal="true" aria-label="Editar perfil">
        <h3>👤 Editar Perfil</h3>
        <label>Apodo:</label>
        <input type="text" id="perfil-apodo">

        <label>Teléfono:</label>
        <input type="text" id="perfil-telefono" placeholder="+1 (000) 000-0000">

        <div class="modal-buttons">
          <button id="perfil-guardar">💾 Guardar</button>
          <button id="perfil-cerrar">❌ Cerrar</button>
        </div>
      </div>
    </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHTML);
  }
}

// Abrir/cerrar modal
function abrirModalPerfil() {
  ensurePerfilModal();
  const modal = document.getElementById("modal-perfil");

  // Datos cargados del endpoint /cargar_perfil y guardados en memoria
  const perfil = JSON.parse(sessionStorage.getItem("perfil") || "{}");

  document.getElementById("perfil-apodo").value   = perfil?.apodo   || "";
  document.getElementById("perfil-telefono").value = perfil?.telefono || "";

  modal.classList.add("abierto");
}

function cerrarModalPerfil() {
  const modal = document.getElementById("modal-perfil");
  if (modal) modal.classList.remove("abierto");
}

// Aplica perfil en UI (barra + popover + sesión opcional)
function aplicarPerfilEnUI({ apodo, telefono }) {
  const barra    = document.getElementById("nombre-usuario-barra");
  const cabecera = document.getElementById("usuario-nombre"); // si lo usas en otra parte
  if (barra)    barra.textContent = apodo || "";
  if (cabecera) cabecera.textContent = apodo || "";

  // Teléfono en popover
  if (typeof updateTelefonoPopover === "function") {
    updateTelefonoPopover((telefono || "").trim());
  }
}

// ✅ 1) Guardar perfil: leer del input y quitar “montos[...]”
async function guardarPerfil() {
  const apodo = (document.getElementById("perfil-apodo")?.value || "").trim();
  const telefono = (document.getElementById("perfil-telefono")?.value || "").trim();

  // Formato simple (opcional)
  const solo = telefono.replace(/[^\d]/g, "");
  let telForm = telefono;
  if (solo) {
    const parte4 = solo.slice(-4);
    const parte3 = solo.slice(-7, -4);
    const parte2 = solo.slice(-10, -7);
    const codigo = solo.slice(0, -10);
    telForm = `${codigo ? `+${codigo} ` : ""}${parte2 ? `(${parte2}) ` : ""}${parte3 ? `${parte3}-` : ""}${parte4 || ""}`.trim();
  }

  try {
    const resp = await fetch("/cargar_perfil"); // ⚠️ chequeo que el backend responda
    // (no es obligatorio; puedes omitir este fetch previo si no lo necesitas)

    const r = await fetch("/guardar_perfil", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apodo, telefono: telForm })   // 👈 sin cliente, sin email
    });
    if (!r.ok) throw new Error("No se pudo guardar");

    // ✅ Actualiza UI
    aplicarPerfilEnUI({ apodo, telefono: telForm });

    // ✅ Persistencias útiles
    // - cachear perfil
    sessionStorage.setItem("perfil", JSON.stringify({ apodo, telefono: telForm }));
    // - reflejar apodo también en sessionStorage.usuario (para otras vistas)
    const ses = JSON.parse(sessionStorage.getItem("usuario") || "{}");
    ses.apodo = apodo;
    sessionStorage.setItem("usuario", JSON.stringify(ses));
    if (typeof enforceAuthView === "function") enforceAuthView();
    // - teléfono vivo para Bills/Pagos
    W.configTemporal = W.configTemporal || {};
    W.configTemporal.telefono_dueno = telForm;

    if (W.Swal) {
      Swal.fire({ toast:true, position:'top-end', icon:'success',
        title:'✅ Perfil actualizado', showConfirmButton:false, timer:1800 });
    }
    cerrarModalPerfil();

    // (opcional) volver a leer desde BD
    await cargarPerfilEnUI();
  } catch (e) {
    console.error(e);
    if (W.Swal) {
      Swal.fire({ icon:'error', title:'❌ Error', text:'No se pudo guardar el perfil.' });
    }
  }
}

// Delegación de eventos: funciona aunque el botón aparezca después del login
document.addEventListener("click", (e) => {
  if (e.target.closest("#btn-perfil")) {
    abrirModalPerfil();
  } else if (e.target.id === "perfil-guardar") {
    guardarPerfil();
  } else if (e.target.id === "perfil-cerrar") {
    cerrarModalPerfil();
  } else if (e.target.id === "modal-perfil") {
    // click fuera del cuadro cierra
    cerrarModalPerfil();
  }
});

// ✅ 2) Cargar perfil AL INICIO: además de pintar, guardamos en sessionStorage
async function cargarPerfilAlInicio() {
  try {
  const resp = await fetch("/cargar_perfil");
if (resp?.ok) {
  const data = await resp.json();

  // cachear
  sessionStorage.setItem('perfil', JSON.stringify({ 
    apodo: data.apodo || '', 
    telefono: data.telefono || '' 
  }));

  // reflejar apodo también en sessionStorage.usuario
  const ses = JSON.parse(sessionStorage.getItem("usuario") || "{}");
  if (data.apodo) { 
    ses.apodo = data.apodo.trim(); 
    sessionStorage.setItem("usuario", JSON.stringify(ses)); 
  }

  // pintar barra con dataset.apodo confiable
  const barra = document.getElementById('nombre-usuario-barra');
  if (barra) {
    const apodo = data.apodo?.trim();
    barra.textContent = apodo || ownerDisplay({ allowFallbackYo: true });
    barra.dataset.apodo = apodo || '';
  }

  // Teléfono en popover
  if (typeof updateTelefonoPopover === "function") {
    updateTelefonoPopover((data.telefono || "").trim());
  }

  // espejo para lógica que usa configTemporal
  W.configTemporal = W.configTemporal || {};
  W.configTemporal.telefono_dueno = data.telefono || "";

  return;
}

  } catch {}
  // fallback: muestra email como apodo
  const ses = JSON.parse(sessionStorage.getItem("usuario") || "{}");
  const fallbackApodo = ses?.email || "";
  sessionStorage.setItem("perfil", JSON.stringify({ apodo: fallbackApodo, telefono: "" }));
  aplicarPerfilEnUI({ apodo: fallbackApodo, telefono: "" });
}
if (sessionStorage.getItem("usuario")) {
  cargarPerfilAlInicio();
}

// ✅ 3) cargarPerfilEnUI: además de pintar, cachea en sessionStorage
async function cargarPerfilEnUI() {
  try {
    const resp = await fetch('/cargar_perfil');
    if (!resp.ok) throw new Error("No se pudo obtener perfil");
    const perfil = await resp.json();

    // cachear
    sessionStorage.setItem("perfil", JSON.stringify(perfil));

    // Barra y popover
    const barra = document.getElementById("nombre-usuario-barra");
    if (barra) {
      barra.textContent = perfil.apodo || "";
    }
    if (typeof updateTelefonoPopover === "function") {
      updateTelefonoPopover(perfil.telefono || "");
    }

    // Inputs del modal
    const inpApodo = document.getElementById('perfil-apodo');
    if (inpApodo) inpApodo.value = perfil.apodo || '';
    const inpTelef  = document.getElementById('perfil-telefono');
    if (inpTelef)  inpTelef.value  = perfil.telefono || '';

    // también refresca configTemporal.telefono_dueno
    W.configTemporal = W.configTemporal || {};
    W.configTemporal.telefono_dueno = perfil.telefono || "";
  } catch (e) {
    console.warn('No se pudo cargar perfil:', e);
  }
}

// ================================
// TELÉFONO EN BARRA (auto-inject)
// ================================
function updateTelefonoPopover(tel) {
  const out = document.getElementById("telefono-dueno-pop");
  if (out) out.textContent = (tel || "—").trim();
}

document.addEventListener("DOMContentLoaded", () => {
  const btnTel = document.getElementById("btn-telefono");
  const popTel = document.getElementById("popover-telefono");

  // toggle popover
  btnTel?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = popTel.classList.toggle("open");
    popTel.setAttribute("aria-hidden", String(!isOpen));
  });

  // cerrar al hacer click fuera
  document.addEventListener("click", (e) => {
    if (!popTel) return;
    if (!e.target.closest(".telefono-wrapper")) {
      popTel.classList.remove("open");
      popTel.setAttribute("aria-hidden", "true");
    }
  });

  // número inicial desde config
  const telInit = (W.configActual?.telefono_dueno || W.configTemporal?.telefono_dueno || "").trim();
  updateTelefonoPopover(telInit);
});

// sincroniza cuando guardes en Perfil
(function syncPerfilConTelefonoPopover(){
  const prev = W.aplicarPerfilEnUI;
  W.aplicarPerfilEnUI = function(data) {
    if (typeof prev === "function") prev.call(this, data);
    const tel = (data?.telefono || W.configActual?.telefono_dueno || W.configTemporal?.telefono_dueno || "").trim();
    updateTelefonoPopover(tel);
  };
})();

//=======================
// Usuario y Login //
//=======================
document.addEventListener("DOMContentLoaded", () => {
  const splash = document.getElementById("splash");
  const contenido = document.getElementById("contenido-app");
  const formRegistro = document.getElementById("form-registro");
  const formLogin = document.getElementById("form-login");
  const zonaPrivada = document.getElementById("zona-privada");
  const usuarioNombre = document.getElementById("nombre-usuario-barra");
  const btnCerrarSesion = document.getElementById("cerrar-sesion-barra");
  const inputPassRegistro = document.getElementById("registro-password");
  const inputPassLogin = document.getElementById("login-password");
  const usuarioInput = document.getElementById("registro-user");
  const dominioSelect = document.getElementById("registro-dominio");

  // 🕒 Inactividad cierra sesión en 15 min
  let temporizadorInactividad;

function reiniciarTemporizadorInactividad() {
  clearTimeout(temporizadorInactividad);
  temporizadorInactividad = setTimeout(() => {
    // 1) Invalidar la cookie de sesión en el backend
    fetch('/logout', { method: 'POST', credentials: 'same-origin' })
      .catch(() => {}) // ignoramos errores de red
      .finally(() => {
        // 2) Limpiar estado del front y refrescar
        try { sessionStorage.removeItem('usuario'); } catch {}
        if (typeof enforceAuthView === 'function') enforceAuthView();
        location.reload();
      });
  }, 15 * 60 * 1000); // 15 minutos
}

  ["click", "keydown", "mousemove", "scroll"].forEach(evt =>
    document.addEventListener(evt, reiniciarTemporizadorInactividad)
  );

  reiniciarTemporizadorInactividad();

  // 👉 Quitar @ al escribir usuario
  usuarioInput.addEventListener("input", () => {
    usuarioInput.value = usuarioInput.value.replace(/@/g, "");
  });

  // 👁️ Mostrar/ocultar contraseñas
  document.querySelectorAll(".boton-ojo").forEach(boton => {
    boton.addEventListener("click", () => {
      const input = boton.previousElementSibling;
      input.type = input.type === "password" ? "text" : "password";
      boton.textContent = input.type === "text" ? "🙈" : "👁️";
    });
  });

  // 🔒 Cerrar sesión
function cerrarSesion() {
  Swal.fire({
    title: '¡Hasta luego!',
    text: 'Tu sesión ha sido cerrada.',
    icon: 'info',
    timer: 1500,
    showConfirmButton: false
  });

  setTimeout(() => {
    sessionStorage.removeItem("usuario");
    location.reload();
  }, 1600);
}

// ✅ Registro (real, sin simulación)
formRegistro.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nombre = document.getElementById("registro-nombre").value.trim();
  const usuario = usuarioInput.value.trim();
  const contrasena = inputPassRegistro.value.trim();
  const email = `${usuario}${dominioSelect.value}`.trim().toLowerCase();

  // misma validación que ya tienes
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,16}$/;
  if (!regex.test(contrasena)) {
    Swal.fire({
      icon: 'error',
      title: '❌ Contraseña inválida',
      text: 'Debe tener mayúsculas, minúsculas, números y símbolos (8-16 caracteres).',
      confirmButtonText: '👌 Entendido',
    });
    return;
  }

  try {
    const resp = await fetch("/registro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // OJO: el backend espera `password`, no `contrasena`
      body: JSON.stringify({ nombre, email, password: contrasena })
    });
    const data = await resp.json().catch(() => ({}));

    if (resp.ok && data.ok) {
      // Backend hace auto-login → ya hay sesión
      const usuarioSesion = { nombre: nombre || email, email };
      sessionStorage.setItem("usuario", JSON.stringify(usuarioSesion));
      mostrarZonaPrivada(usuarioSesion);
      enforceAuthView();
      formRegistro.reset();
    } else {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo registrar',
        text: data.error || 'Intenta con otro correo o revisa la contraseña.',
      });
    }
  } catch (err) {
    console.error("Error en registro:", err);
    Swal.fire({ icon: 'error', title: 'Error de conexión' });
  }
});

  // ✅ Login
// ✅ Login
formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-usuario").value.trim().toLowerCase();
  const contrasena = inputPassLogin.value.trim();

  console.log("🔐 Intentando login con:", email);

  try {
    const resp = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: contrasena }),
      credentials: "same-origin"
    });

    let data = {};
    try { data = await resp.json(); } catch {}

    if (!resp.ok || data.error || data.ok === false) {
      alert(data.error || "Usuario o contraseña incorrectos");
      return;
    }

    // 👇👇 MARCAR SESIÓN **ANTES** de disparar cargar_configuracion/bills/etc.
    if (typeof _marcarSesion === "function") _marcarSesion(true);
    else window.__sessionOK = true;

    // Guardar usuario para el front
    const usuario = {
      id: data.id,
      email: data.email || email,
      nombre: data.nombre || data.email || email
    };
    try { sessionStorage.setItem("usuario", JSON.stringify(usuario)); } catch {}

    // Mostrar zona privada y cargar datos
    mostrarZonaPrivada?.(usuario);
    await iniciarZonaPrivada?.();    // aquí ya no se bloqueará /cargar_configuracion
    enforceAuthView?.();
    ocultarSplash?.();

  } catch (err) {
    console.error("Error en login:", err);
    alert("Error de conexión con el servidor");
    // por si algo falló, deja el flag apagado
    if (typeof _marcarSesion === "function") _marcarSesion(false);
    else window.__sessionOK = false;
  }
});

  // 🚀 splash y vistas


//* Funcion mostrar Zona Privada *//
function mostrarZonaPrivada(usuario) {
  const barra = document.getElementById("barra-superior");
  const nombre = document.getElementById("nombre-usuario-barra");
  const zonaPrivada = document.getElementById("zona-privada");
  const contenido = document.getElementById("contenido-app");
  const splash = document.getElementById("splash");

  if (splash) splash.style.display = "none";
  document.body.classList.add('auth');

  document.getElementById("menu-vistas").style.display = "flex";
  barra.style.display = "flex";
  nombre.textContent = usuario.nombre;

  document.querySelectorAll(".vista").forEach(v => v.style.display = "none");

  zonaPrivada.style.display = "block";
  contenido.style.display = "block";
  contenido.style.visibility = "visible";
  contenido.style.opacity = "1";

  const btnCerrar = document.getElementById("cerrar-sesion-barra");
  if (btnCerrar) btnCerrar.addEventListener("click", cerrarSesion);

  // ⬇️⬇️ SUSTITUYE el fetch antiguo por ESTA línea
  cargarConfigYAplicar()
    .finally(() => cargarPerfilEnUI?.());
}

//* Funcion Mostrar Vista Usuario *//
function mostrarVistaUsuario() {
  const barra = document.getElementById("barra-superior");
  const zonaPrivada = document.getElementById("zona-privada");
  const contenido = document.getElementById("contenido-app");
  const splash = document.getElementById("splash");

  if (splash) splash.style.display = "none";
  document.body.classList.remove('auth'); // oculta header .encabezado en login/registro

  document.getElementById("menu-vistas").style.display = "none";
  barra.style.display = "none";
  zonaPrivada.style.display = "none";

  contenido.style.display = "block";
  contenido.style.visibility = "visible";
  contenido.style.opacity = "1";

  document.getElementById("usuario").style.display = "block";
  document.getElementById("seccion-usuario").style.display = "block";
  document.getElementById("seccion-registro").style.display = "block";
  document.getElementById("seccion-login").style.display = "block";
}
});

// -----------------------------------
//  Globals mínimos
// -----------------------------------
W.configFuentesIngresos ||= [];
W.ingresos ||= [];

// -----------------------------------
//  Helper de deduplicación (anti-race)
//  Si luego tu backend devuelve id: usa i.id ?? claveIngreso(i)
// -----------------------------------
function claveIngreso(i) {
  return [
    String(i?.fecha || ""),
    Number(i?.monto || 0),
    String(i?.fuente || ""),
    String(i?.nota || "")
  ].join("||");
}

// -----------------------------------
//  Rellenar selects de fuentes (solo Config)
// -----------------------------------
function llenarSelectFuentesIngresos() {
  const select = document.getElementById("fuente-ingreso");
  const filtro = document.getElementById("filtro-fuente-ingreso");
  if (!select && !filtro) return;

  const fuentesRaw =
    (Array.isArray(W.configFuentesIngresos) && W.configFuentesIngresos.length
      ? W.configFuentesIngresos
      : (Array.isArray(W.configTemporal?.ingresos_fuentes)
          ? W.configTemporal.ingresos_fuentes
          : []
        )
    );

  const fuentes = [...new Set(
    (fuentesRaw || []).map(f => String(f).trim()).filter(Boolean)
  )];

  // Form
  if (select) {
    const valorActual = select.value;
    select.innerHTML = `<option value="" disabled selected>Selecciona fuente</option>`;
    fuentes.forEach(f => select.appendChild(new Option(f, f)));
    if (fuentes.includes(valorActual)) select.value = valorActual;
  }

  // Filtro
  if (filtro) {
    const valorFiltro = filtro.value;
    filtro.innerHTML = `<option value="">Todas</option>`;
    fuentes.forEach(f => filtro.appendChild(new Option(f, f)));
    if (fuentes.includes(valorFiltro)) filtro.value = valorFiltro;
  }
}
W.llenarSelectFuentesIngresos = llenarSelectFuentesIngresos;

// -----------------------------------
//  Main
// -----------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const form                = document.getElementById("form-ingresos");
  const selectFuente        = document.getElementById("fuente-ingreso");
  const filtroMesIngreso    = document.getElementById("filtro-mes-ingreso");
  const filtroFuenteIngreso = document.getElementById("filtro-fuente-ingreso");
  const campoOtraFuente     = document.getElementById("fuente-otra-container"); // ya no se usa

  // Oculta "Otra" si existe en el HTML
  if (campoOtraFuente) campoOtraFuente.hidden = true;

  // Rellenar selects
  llenarSelectFuentesIngresos();

  // Debounce helper
  function debounce(fn, delay) {
    let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), delay); };
  }

  // ------------------------------
  //  Cargar desde servidor (fusiona, no pisa)
  // ------------------------------
  // ==== LOADERS: INGRESOS ====

let _ingresosFiltrosRegistrados = false;

async function cargarIngresos({ firstRender = true } = {}) {
  try {
    const data = await fetchJSON('/cargar_ingresos', { method: 'GET' });
    const nuevos = Array.isArray(data) ? data : (data?.ingresos || []);

    window.W = window.W || {};
    W.ingresos = Array.isArray(W.ingresos) ? W.ingresos : [];

    // misma fusión que tenías
    const claveIngreso = i => `${i.fecha}|${i.monto}|${i.fuente}|${i.nota || ''}`;
    const mapa = new Map(W.ingresos.map(i => [claveIngreso(i), i]));
    (nuevos || []).forEach(i => mapa.set(claveIngreso(i), i));
    W.ingresos = Array.from(mapa.values());

    // Solo en el primer render: resetea filtros y registra listeners (una sola vez)
    if (firstRender) {
      if (typeof filtroMesIngreso !== 'undefined' && filtroMesIngreso)    filtroMesIngreso.value = "";
      if (typeof filtroFuenteIngreso !== 'undefined' && filtroFuenteIngreso) filtroFuenteIngreso.value = "";

      if (!_ingresosFiltrosRegistrados) {
        const debouncedMostrar = debounce(() => mostrarIngresos(), 180);
        if (typeof filtroMesIngreso !== 'undefined' && filtroMesIngreso)
          filtroMesIngreso.addEventListener("input", debouncedMostrar);
        if (typeof filtroFuenteIngreso !== 'undefined' && filtroFuenteIngreso)
          filtroFuenteIngreso.addEventListener("input", debouncedMostrar);
        _ingresosFiltrosRegistrados = true;
      }
    }

    if (typeof mostrarIngresos === 'function') mostrarIngresos();
  } catch (err) {
    console.error("❌ Error al cargar ingresos:", err);
    window.W = window.W || {};
    W.ingresos = Array.isArray(W.ingresos) ? W.ingresos : [];
    if (typeof mostrarIngresos === 'function') mostrarIngresos();
    try { toastErr('No se pudieron cargar los ingresos'); } catch {}
  }
}


 // ------------------------------
// Submit (alta/edición) con optimista
// ------------------------------
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const fecha  = document.getElementById("fecha-ingreso")?.value;
  const monto  = parseFloat(document.getElementById("monto-ingreso")?.value || 0);
  const fuente = (selectFuente?.value || "").trim();
  const nota   = document.getElementById("nota-ingreso")?.value || "";

  // Validación de fuente SOLO desde Config (normalizada)
  const fuentesValidasArr =
    (Array.isArray(W.configFuentesIngresos) && W.configFuentesIngresos.length
      ? W.configFuentesIngresos
      : (Array.isArray(W.configTemporal?.ingresos_fuentes)
          ? W.configTemporal.ingresos_fuentes
          : []
        )
    );
  const setFuentes = new Set(
    (fuentesValidasArr || []).map(s => String(s).trim().toLowerCase()).filter(Boolean)
  );

  const fuenteNorm = String(fuente).toLowerCase().trim();
  if (!fecha || isNaN(monto) || monto <= 0 || !fuente || !setFuentes.has(fuenteNorm)) {
    alert("Por favor completa los campos y selecciona una fuente válida desde Configuración.");
    return;
  }

  const nuevoIngreso = { fecha, monto, fuente, nota };
  const editIndex = form.dataset.editIndex;
  let agregadoIndex;

  if (editIndex !== undefined && editIndex !== "") {
    W.ingresos[editIndex] = nuevoIngreso;
    agregadoIndex = Number(editIndex);
    delete form.dataset.editIndex;
    form.querySelector("button[type='submit']").textContent = "💾 Guardar Ingreso";
    W.toastOk?.("✅ Ingreso actualizado");
  } else {
    W.ingresos.push(nuevoIngreso); // optimista
    agregadoIndex = W.ingresos.length - 1;
    W.toastOk?.("✅ Ingreso guardado");
  }
  
  // Pintar
  mostrarIngresos();
  setTimeout(mostrarIngresos, 0); // doble repaint por si otro bloque reescribe

  // Guardar en servidor y reconciliar
  fetch('/guardar_ingreso', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(nuevoIngreso)
  })
    .then(async (res) => {
      let data = null;
      try { data = await res.json(); } catch {}
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      // Reemplaza el optimista por la versión del server (si viene normalizada)
      if (data && typeof agregadoIndex === "number" && data.fecha) {
        W.ingresos[agregadoIndex] = data;
      }

      mostrarIngresos();
      form.reset();
      if (selectFuente) selectFuente.value = ""; // volver a "Selecciona fuente"
    })
    .catch(err => {
      console.error("Error al guardar ingreso:", err);
      // Se mantiene el optimista; avisamos
      W.toastErr?.("⚠️ No se pudo guardar en el servidor. Quedó localmente.");
      mostrarIngresos();
    });
});
});
// Ordenar por fecha DESC (YYYY-MM-DD funciona directo con localeCompare)
const byFechaDesc = (a, b) =>
  String(b?.fecha || '').slice(0,10).localeCompare(String(a?.fecha || '').slice(0,10));

// -----------------------------------
//  Mostrar Ingresos (única versión)
// -----------------------------------
function mostrarIngresos() {
  const lista   = document.getElementById("lista-ingresos");
  const fMes    = document.getElementById("filtro-mes-ingreso");
  const fFuente = document.getElementById("filtro-fuente-ingreso");
  const resumen = document.getElementById("resumen-ingresos");
  if (!lista) return;

  const base = Array.isArray(W.ingresos)
    ? W.ingresos
    : (Array.isArray(W.ingresos?.ingresos) ? W.ingresos.ingresos : []);

  lista.innerHTML = "";

  const mesSel     = fMes?.value;
  const fuenteText = (fFuente?.value || "").toLowerCase();

  const filtrados = base.filter(i => {
    if (!i || !i.fecha) return false;
    const mesIngreso   = String(i.fecha).slice(0, 7);
    const fuenteLower  = String(i.fuente || "").toLowerCase();
    const okMes        = !mesSel || mesIngreso === mesSel;
    const okFuente     = !fuenteText || fuenteLower.includes(fuenteText);
    return okMes && okFuente;
  });
  filtrados.sort(byFechaDesc);

  if (!filtrados.length) {
    lista.innerHTML = `<p>🪙 No hay ingresos registrados aún.</p>`;
  } else {
   filtrados.forEach((i, idx) => {
    const notaHtml = (i.nota && i.nota.trim())
      ? `<div>📝 ${i.nota}</div>` : "";

    const card = document.createElement("div");
    card.classList.add("card-datos");
    card.innerHTML = `
      <div class="card-header">
        📅 <strong>${formatoLegible(i.fecha)}</strong> — 💰 <strong>$${Number(i.monto||0).toFixed(2)}</strong>
      </div>
      <div class="card-body">
        <div> ${i.fuente || "Sin fuente"}</div>
        ${notaHtml}
      </div>
      <div class="card-actions">
        <button class="icon-btn" data-tip="Editar" title="Editar" aria-label="Editar"
          onclick="editarIngreso(${idx})">✏️</button>
        <button class="icon-btn danger" data-tip="Eliminar" title="Eliminar" aria-label="Eliminar"
          onclick="eliminarIngreso(${idx})">🗑️</button>
      </div>
    `;
    lista.appendChild(card);
  });
  }

  // Resumen y gráfico
  const resumenPorFuente = filtrados.reduce((acc, i) => {
    const f = i.fuente || "Sin fuente";
    acc[f] = (acc[f] || 0) + Number(i.monto || 0);
    return acc;
  }, {});
  const graficoData = { labels: Object.keys(resumenPorFuente), values: Object.values(resumenPorFuente) };

  // Estas funciones ya existen en tu app:
  // cargarYNormalizarEgresos, obtenerIngresosDelMes, obtenerEgresosDelMes
  typeof cargarYNormalizarEgresos === "function"
    ? cargarYNormalizarEgresos(() => {
        actualizarResumenIngresos(filtrados);
        actualizarGraficoIngresos(graficoData);
      })
    : (actualizarResumenIngresos(filtrados), actualizarGraficoIngresos(graficoData));
}
W.mostrarIngresos = mostrarIngresos;

// -----------------------------------
//  Resumen (solo ingresos)
// -----------------------------------
function actualizarResumenIngresos(filtrados) {
  const fMes    = document.getElementById("filtro-mes-ingreso");
  const fFuente = document.getElementById("filtro-fuente-ingreso");
  const panel   = document.getElementById("resumen-ingresos");
  if (!panel) return;

  const mesSel = fMes?.value || ""; // "" => mes actual
  const fuenteVis = fFuente?.value || "";
  const fuenteFiltro = fuenteVis.toLowerCase();

  // Texto del rango mostrado (totales de la lista filtrada)
  let nombreMes = "todos los meses";
  if (mesSel && mesSel.includes("-")) {
    const [a, m] = mesSel.split("-");
    const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio",
                   "Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    nombreMes = `${meses[parseInt(m,10)-1]} ${a}`;
  }

  const totalFiltrado = filtrados.reduce((acc, i) => acc + Number(i.monto || 0), 0);
  const titulo = fuenteFiltro
    ? `🤑 Total de ingresos de "${fuenteVis}" en ${nombreMes}: $${totalFiltrado.toFixed(2)}`
    : `🤑 Total de ingresos en ${nombreMes}: $${totalFiltrado.toFixed(2)}`;

  // ❌ Antes: aquí pintábamos "Disponible"
  // ✅ Ahora: solo el título/total de ingresos de esta vista
  panel.innerHTML = titulo;
}

// -----------------------------------
//  Gráfico
// -----------------------------------
function actualizarGraficoIngresos(data) {
  const canvas = document.getElementById('grafico-ingresos');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (W.graficoIngresos) W.graficoIngresos.destroy();
  W.graficoIngresos = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [{ label: 'Ingresos por fuente', data: data.values,
        backgroundColor: ['#2b97fa', '#9a27f7', '#fa9be2'] }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

// -----------------------------------
//  Editar / Eliminar
// -----------------------------------
W.editarIngreso = function (index) {
  const i = (W.ingresos || [])[index];
  if (!i) return;

  // refresca opciones por si la config cambió
  if (typeof W.llenarSelectFuentesIngresos === "function") llenarSelectFuentesIngresos();

  document.getElementById("fecha-ingreso").value = i.fecha;
  document.getElementById("monto-ingreso").value = i.monto;
  document.getElementById("nota-ingreso").value  = i.nota || "";

  const select = document.getElementById("fuente-ingreso");
  const fuentes = (Array.isArray(W.configFuentesIngresos) && W.configFuentesIngresos.length
    ? W.configFuentesIngresos
    : (Array.isArray(W.configTemporal?.ingresos_fuentes) ? W.configTemporal.ingresos_fuentes : [])
  ).map(s => String(s).trim());

  if (select) select.value = fuentes.includes(i.fuente) ? i.fuente : "";

  const form = document.getElementById("form-ingresos");
  if (form) {
    form.dataset.editIndex = index;
    form.querySelector("button[type='submit']").textContent = "Actualizar Ingreso";
  }
};

W.eliminarIngreso = function (index) {
  const arr = W.ingresos || [];
  if (!(index >= 0 && index < arr.length)) return;
  if (!confirm("¿Seguro que quieres eliminar este ingreso? 😱")) return;

  // Optimista: quita y repinta
  const eliminado = arr.splice(index, 1)[0];
  mostrarIngresos();

  // Persistir en servidor
  fetch('/eliminar_ingreso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(eliminado)
  })
    .then(async (res) => {
      let data = null;
      try { data = await res.json(); } catch {}
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      W.toastOk?.("🗑️ Ingreso eliminado");
    })
    .catch((err) => {
      console.error("Error al eliminar ingreso:", err);
      // Rollback: reinsertar en la misma posición y repintar
      arr.splice(index, 0, eliminado);
      mostrarIngresos();
      W.toastErr?.("❌ No se pudo eliminar el ingreso");
    });
};

// =============================
// MANEJO DE BILLS 
// =============================
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("form-bills");
  // Obtener usuario logueado
const usuarioLogueado = JSON.parse(sessionStorage.getItem("usuario") || "{}");
  const tipoSelect = document.getElementById("bill-tipo");
  const fechaInput = document.getElementById("bill-fecha");
  const montoInput = document.getElementById("bill-monto");
  const listaBills = document.getElementById("lista-bills");
  const resumenDiv = document.getElementById("resumen-bills");

  const filtroMes = document.getElementById("filtro-mes-bill");
  const filtroTipo = document.getElementById("filtro-tipo-bill");
  const buscador = document.getElementById("buscador-bills");

  const ctxGraficoEl = document.getElementById("grafico-bills");
  const ctxGrafico   = ctxGraficoEl ? ctxGraficoEl.getContext("2d") : null;
  let grafico;

// =============================
// Inicializar formulario
// =============================
function inicializarFormulario() {
  tipoSelect.innerHTML = `<option value="" disabled selected>Selecciona tipo</option>`;
  filtroTipo.innerHTML = `<option value="">Todos</option>`;

  // Si no hay configuración todavía, no hacemos nada
  if (!Array.isArray(configBills) || configBills.length === 0) {
    return;
  }

  // Opciones de tipo de bill
  configBills.forEach(bill => {
    const nombre = bill.nombre || bill;
    tipoSelect.appendChild(new Option(nombre, nombre));
    filtroTipo.appendChild(new Option(nombre, nombre));
  });
}

// =============================
// Cargar bills desde el servidor
// =============================
async function cargarBills() {
  // 🚫 No dispares si no hay sesión
  if (!__sessionOK && !haySesion?.()) {
    console.info('cargarBills: cancelado porque no hay sesión');
    if (!Array.isArray(window.bills)) window.bills = [];
    bills.length = 0;
    mostrarBills?.();
    return;
  }

  try {
    const data  = await fetchJSON('/cargar_bills', { method: 'GET' }, { silent401: true });
    if (!data) { // 401 silencioso
      console.info('No autenticado (cargar_bills).');
      mostrarPantallaLogin?.();
      if (!Array.isArray(window.bills)) window.bills = [];
      bills.length = 0;
      mostrarBills?.();
      return;
    }

    // 1) Cargar lista
    const lista = Array.isArray(data) ? data : (data.bills || []);
    if (!Array.isArray(window.bills)) window.bills = [];
    bills.splice(0, bills.length, ...lista);

    // 2) Normalizar montos → apodo del dueño
    const owner = (typeof ownerDisplay === 'function' ? ownerDisplay() : null) || 'Dueño';
    let emailLower = '';
    try { emailLower = (JSON.parse(sessionStorage.getItem('usuario') || '{}').email || '').toLowerCase(); } catch {}

    for (const b of bills) {
      let montos = b.montos;
      if (typeof montos === 'string') { try { montos = JSON.parse(montos); } catch { montos = {}; } }
      if (!montos || typeof montos !== 'object') montos = {};

      const norm = {};
      for (const [k, v] of Object.entries(montos)) {
        let key = k;
        if (k === 'DUEÑO') key = owner;
        if (emailLower && k.toLowerCase() === emailLower) key = owner;
        norm[key] = (norm[key] || 0) + Number(v || 0);
      }
      b.montos = norm;
    }

    // 3) (Anti-carrera) si los selects aún no tienen opciones, repoblar
    if (tipoSelect && tipoSelect.options.length <= 1) {
      inicializarFormulario();
    }

    // 4) (Anti-fantasma) limpia filtros para no ocultar todo
    ['filtro-mes-bill','filtro-tipo-bill','buscador-bills'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = '';
      const evt = el.tagName === 'INPUT' ? 'input' : 'change';
      el.dispatchEvent(new Event(evt, { bubbles:true }));
    });

    // 5) Render
    mostrarBills?.();

  } catch (err) {
    if (String(err?.message || '').includes('401')) {
      console.info('No autenticado (cargar_bills).');
      mostrarPantallaLogin?.();
      if (!Array.isArray(window.bills)) window.bills = [];
      bills.length = 0;
      mostrarBills?.();
      return;
    }
    console.error('Error al cargar bills:', err);
    try { toastErr?.('❌ No se pudieron cargar las facturas'); } catch {}
    bills.length = 0;
    mostrarBills?.();
  }
}

// =============================
// Guardar nuevo bill
// =============================
form.addEventListener("submit", e => {
  e.preventDefault();

  const tipo = tipoSelect.value;
  const fecha = fechaInput.value;
  const monto = parseFloat(montoInput.value);

  if (!tipo || !fecha || isNaN(monto) || monto <= 0) {
    alert("Completa todos los campos correctamente.");
    return;
  }

  // 1) Participantes: los del bill configurado + el dueño (apodo)
  const owner = ownerDisplay();
  const billConfig = configBills.find(b => b.nombre === tipo);

// personas válidas actuales
  const actuales = new Set(configPersonas.map(p => p.nombre.trim().toLowerCase()));

// solo personas que aún existen en Config > Personas
  const base = (billConfig?.personas || [])
  .map(n => String(n).trim())
  .filter(n => actuales.has(n.toLowerCase()))
  .map(n => (n.toLowerCase() === 'dueño' || n.toLowerCase() === 'dueno') ? owner : n);

// agregar dueño y dejar únicos
  const participantes = [...new Set([...base, owner].filter(Boolean))];

    if (participantes.length === 0) {
      alert("No hay personas configuradas para este bill.");
      return;
    }

  // 2) Divido y construyo montos
  const porPersona = monto / participantes.length;
  const montos = {};
  participantes.forEach(nombre => { montos[nombre] = porPersona; });

  const nuevoBill = { fecha, tipo, monto, montos };
  bills.push(nuevoBill);

  fetch("/guardar_bills", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(nuevoBill)
})
  .then(async (res) => {
    // tolera respuestas sin JSON y valida HTTP
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    if (!data?.bill) throw new Error("Respuesta inválida del servidor");

    // Reconciliar optimista: reemplaza el último si era el mismo, si no, push
    if (bills.length && bills[bills.length - 1] === nuevoBill) {
      bills[bills.length - 1] = data.bill;
    } else {
      bills.push(data.bill);
    }

    mostrarBills();
    form.reset();
    W.toastOk?.("✅ Bill guardado correctamente");
  })
  .catch((err) => {
    console.error("Error al guardar bill:", err);

    // Revertir optimista si corresponde
    if (bills.length && bills[bills.length - 1] === nuevoBill) {
      bills.pop();
      mostrarBills();
    }

    W.toastErr?.("❌ No se pudo guardar el bill");
  });
});
  // =============================
  // Filtros
  // =============================
  [filtroMes, filtroTipo, buscador].forEach(filtro => {
    filtro.addEventListener("input", mostrarBills);
  });

// =============================
// Mostrar bills
// =============================
function mostrarBills() {
  listaBills.innerHTML = "";

  const mes = filtroMes.value;
  const tipo = filtroTipo.value.toLowerCase();
  const busqueda = buscador.value.toLowerCase();

  const filtrados = bills.filter(bill => {
    const billMes = bill.fecha.slice(0, 7);
    const coincideMes = !mes || billMes === mes;
    const coincideTipo = !tipo || bill.tipo.toLowerCase() === tipo;
    const coincideTexto = !busqueda ||
      bill.tipo.toLowerCase().includes(busqueda) ||
      bill.fecha.includes(busqueda);
    return coincideMes && coincideTipo && coincideTexto;
  });
  filtrados.sort(W.byFechaDesc);

  if (filtrados.length === 0) {
    listaBills.innerHTML = `<p>🪙 No hay bills registrados aún.</p>`;
  }

  const usuario = JSON.parse(sessionStorage.getItem("usuario") || "{}");
  const nombreDueno = usuario?.nombre || "Dueño";

  filtrados.forEach((bill, index) => {
    const div = document.createElement("div");
    div.classList.add("card-datos");

    let personasHTML = "";
    // 🔹 ordenar para que dueño quede al final
    const owner = ownerDisplay();
    const entradas = Object.entries(bill.montos || {});
    // dueño al final
    entradas.sort(([a],[b]) => (a === owner) - (b === owner));

    entradas.forEach(([nombre, monto]) => {
      const mostrarNombre = (nombre === 'DUEÑO') ? owner : nombre;
      const boton = `
            <button type="button"
            class="wa-btn"
            data-tip="WhatsApp"
            title="WhatsApp"
            aria-label="WhatsApp"
            onclick="enviarMensaje('${mostrarNombre}', ${monto}, '${bill.fecha}', '${bill.tipo}')">
      📩
    </button> `;

      personasHTML += `
        <div class="persona-row">
          <strong class="nombre">${mostrarNombre}:</strong>
          <span class="importe">$${monto.toFixed(2)}</span>
          ${boton}
        </div>
      `;
    });

  div.innerHTML = `
    <div class="card-header">
      📅 ${formatoLegible(bill.fecha)} — ${bill.tipo} — 💰 TOTAL: $${bill.monto.toFixed(2)}
    </div>
    <div class="card-body bill-grid">${personasHTML}</div>
    <div class="card-actions">
      <button class="icon-btn" data-tip="Editar" title="Editar" aria-label="Editar" onclick="editarBill(${index})">✏️</button>
      <button class="icon-btn danger" data-tip="Eliminar" title="Eliminar" aria-label="Eliminar" onclick="eliminarBill(${index})">🗑️</button>
    </div>
  `;

    listaBills.appendChild(div);
  });

  actualizarResumenBills(filtrados);
  actualizarGrafico(filtrados);
}

// =============================
// Función única para enviar mensaje
// =============================

W.enviarMensaje = (nombre, monto, fecha, tipo) => {
  const perfil   = JSON.parse(sessionStorage.getItem("perfil") || "{}");
  const apodoLC  = (perfil.apodo || "").trim().toLowerCase();
  const nombreLC = (nombre || "").trim().toLowerCase();

  const esDueno = (nombreLC === apodoLC) || (nombreLC === "dueño") || (nombreLC === "dueno");

  let telefono = "";
  if (esDueno) {
    telefono = normalizarTelefono(
      perfil.telefono ||
      window?.configTemporal?.telefono_dueno ||
      document.getElementById("telefono-dueno-pop")?.textContent ||
      ""
    );
  } else {
    const persona = buscarPersonaPorNombre(nombre);
    telefono = normalizarTelefono(persona?.telefono || "");
  }

  if (!telefono) {
    console.warn("[WA DEBUG] Teléfono inválido para", nombre);
    alert(`No se encontró un teléfono válido para "${nombre}". Asegúrate de incluir código de país (ej. +1...).`);
    return;
  }

  const mensaje = `Hola ${nombre}, buen día! 🌞 Aquí está el Bill de ${tipo} (${fecha}) y tu monto a pagar es $${Number(monto).toFixed(2)}.`;
  const url = `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;

  // abrir evitando bloqueos
  const a = document.createElement("a");
  a.href = url; a.target = "_blank"; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
};

// -----------------------------------
//  Resumen (solo Bills)
// -----------------------------------
function actualizarResumenBills(billsMostrados) {
  const filtroMes  = document.getElementById("filtro-mes-bill")?.value || "";
  const filtroTipo = (document.getElementById("filtro-tipo-bill")?.value || "").toLowerCase();
  const nombreMes  = nombreDelMes(filtroMes);

  const totalBills = billsMostrados.reduce((acc, b) => acc + parseFloat(b.monto || 0), 0);

  let titulo;
  if (filtroTipo) {
    const v = document.getElementById("filtro-tipo-bill")?.value || "";
    titulo = `📬 Total de facturas de "${v}" en ${nombreMes}: $${totalBills.toFixed(2)}`;
  } else {
    titulo = `📬 Total de facturas en ${nombreMes}: $${totalBills.toFixed(2)}`;
  }

  const resumenDiv = document.getElementById("resumen-bills");
  if (!resumenDiv) return;

  // ✅ Solo pintamos el resumen de Bills; NADA de “Disponible” aquí
  resumenDiv.innerHTML = titulo;
}

  // =============================
  // Gráfico
  // =============================
function actualizarGrafico(billsMostrados) {
  const resumen = {};
  billsMostrados.forEach(b => {
    resumen[b.tipo] = (resumen[b.tipo] || 0) + Number(b.monto || 0);
  });

  const labels = Object.keys(resumen);
  const data   = Object.values(resumen);

  if (grafico) { try { grafico.destroy(); } catch {} grafico = null; }
  if (!ctxGrafico) return; // no hay canvas, salimos

  grafico = new Chart(ctxGrafico, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Total por tipo",
        data,
        backgroundColor: [
          "#f87171", "#facc15", "#34d399", "#60a5fa",
          "#a78bfa", "#fb923c", "#f472b6", "#4ade80"
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } }
    }
  });
}
  // =============================
  // Funciones globales
  // =============================
  W.editarBill = (index) => {
    const bill = bills[index];
    tipoSelect.value = bill.tipo;
    fechaInput.value = bill.fecha;
    montoInput.value = bill.monto;

    // Eliminamos el viejo bill de la lista para reemplazarlo al guardar
    bills.splice(index, 1);
  };

W.eliminarBill = (index) => {
  if (!confirm("¿Seguro que quieres eliminar este bill?")) return;

  const eliminado = bills[index];
  if (!eliminado?.id) {
    W.toastErr?.("Este bill no tiene id aún.");
    return;
  }

  fetch("/eliminar_bill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: eliminado.id })
  })
  .then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // tolera backend sin JSON
    try { await res.json(); } catch {}
    bills.splice(index, 1);
    mostrarBills();
    W.toastOk?.("🗑️ Bill eliminado");
  })
  .catch((err) => {
    console.error("Error al eliminar bill:", err);
    W.toastErr?.("❌ No se pudo eliminar el bill");
  });
};

// =============================
// Exportar funciones (para que iniciarZonaPrivada las use)
// =============================
window.W = window.W || {};
W.mostrarBills = mostrarBills;
W.cargarBills  = cargarBills;

// 👉 NUEVO: alias globales para que iniciarZonaPrivada() encuentre las funciones
window.mostrarBills = mostrarBills;
window.cargarBills  = cargarBills;

// NO auto-llamar si aún no hay sesión/config
if (window.__sessionOK || (typeof haySesion === 'function' && haySesion())) {
  inicializarFormulario();
  cargarBills();
}
});
// =============================
// MANEJO DE EGRESOS
// =============================
document.addEventListener("DOMContentLoaded", () => {
  // autor del egreso = apodo del dueño
  const persona = ownerDisplay();

  // refs de UI
  const form               = document.getElementById("form-egresos-personales");
  const categoriaSelect    = document.getElementById("categoria-egreso");
  const subcategoriaSelect = document.getElementById("subcategoria-egreso");
  const medioSelect        = document.getElementById("medio-egreso");
  const submedioSelect     = document.getElementById("submedio-egreso");
  const notaInput          = document.getElementById("nota-egreso");

  const filtroMes       = document.getElementById("filtro-mes-egreso");
  const filtroCategoria = document.getElementById("filtro-categoria-egreso");

  const ctxGrafico = document.getElementById("grafico-egresos")?.getContext("2d");
  let grafico;

  // Inicializar selects de categorías y filtros
  function inicializarFormulario() {
    if (categoriaSelect) categoriaSelect.innerHTML = `<option value="">Seleccionar</option>`;
    if (filtroCategoria) filtroCategoria.innerHTML = `<option value="">Todas</option>`;
    if (!Array.isArray(configEgresosCategorias) || !configEgresosCategorias.length) return;

    configEgresosCategorias.forEach(cat => {
      categoriaSelect.innerHTML += `<option value="${cat.categoria}">${cat.categoria}</option>`;
      filtroCategoria.innerHTML  += `<option value="${cat.categoria}">${cat.categoria}</option>`;
    });
  }
  inicializarFormulario();

  // Subcategorías dinámicas
  categoriaSelect?.addEventListener("change", () => {
    const catSeleccionada = categoriaSelect.value;
    const cat = configEgresosCategorias.find(c => c.categoria === catSeleccionada);
    const subcatContainer = document.getElementById("subcategoria-egreso-container");

    if (!cat || !Array.isArray(cat.subcategorias) || !cat.subcategorias.length) {
      subcategoriaSelect.innerHTML = `<option value="">Sin subcategorías</option>`;
      if (subcatContainer) subcatContainer.style.display = "none";
      return;
    }

    subcategoriaSelect.innerHTML = cat.subcategorias
      .map(sub => `<option value="${sub}">${sub}</option>`)
      .join("");
    if (subcatContainer) subcatContainer.style.display = "block";
  });

  // Submedios dinámicos
  medioSelect?.addEventListener("change", () => {
    const medioSeleccionado = medioSelect.value;
    const medio = configMediosPago.find(m => m.medio === medioSeleccionado);
    const submedioContainer = document.getElementById("submedio-egreso-container");

    if (!medio || !Array.isArray(medio.submedios) || !medio.submedios.length) {
      submedioSelect.innerHTML = `<option value="">Sin submedios</option>`;
      if (submedioContainer) submedioContainer.style.display = "none";
      return;
    }

    submedioSelect.innerHTML = `<option value="">Seleccionar submedio</option>` +
      medio.submedios.map(sm => `<option value="${sm}">${sm}</option>`).join("");

    if (submedioContainer) submedioContainer.style.display = "block";
  });

  // Crear/editar egreso
  form?.addEventListener("submit", e => {
    e.preventDefault();
    const fecha        = document.getElementById("fecha-egreso").value;
    const monto        = parseFloat(document.getElementById("monto-egreso").value);
    const categoria    = categoriaSelect.value;
    const subcategoria = subcategoriaSelect.value;
    const medio        = medioSelect.value;
    const submedio     = submedioSelect.value;  // 👈 ahora guardamos submedio
    const nota         = (notaInput.value || "").trim();

    if (!fecha || isNaN(monto) || monto <= 0 || !categoria || !medio) {
      alert("🤔 Por favor, completa todos los campos correctamente.");
      return;
    }

    const nuevoEgreso = { fecha, monto, categoria, subcategoria, medio, submedio, persona, nota };
    const idx = form.dataset.editIndex;
    const mensajeToast = (idx !== undefined && idx !== "")
      ? "✅ Egreso actualizado correctamente"
      : "✅ Egreso guardado correctamente";

    if (idx !== undefined && idx !== "") {
      egresos[idx] = nuevoEgreso;
      delete form.dataset.editIndex;
      form.querySelector("button[type='submit']").textContent = "💾 Guardar Egreso";
    } else {
      egresos.push(nuevoEgreso);
    }

    fetch('/guardar_egreso', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(nuevoEgreso)
})
  .then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json().catch(() => null); // por si el backend no devuelve JSON
  })
  .then(() => {
    W.toastOk?.(mensajeToast);
    mostrarEgresos();

    form.reset();
    // ocultar contenedores dependientes
    const subcat = document.getElementById("subcategoria-egreso-container");
    if (subcat?.style) subcat.style.display = "none";
    const submedio = document.getElementById("submedio-egreso-container");
    if (submedio?.style) submedio.style.display = "none";
  })
  .catch(err => {
    console.error("Error al guardar egreso:", err);
    W.toastErr?.("❌ Error guardando egreso. Quedó localmente.");
    mostrarEgresos(); // mantenemos el optimista
  });
  });

  // Filtros
  [filtroMes, filtroCategoria].forEach(f => f?.addEventListener("input", mostrarEgresos));

  // Render principal
function mostrarEgresos() {
  const listaEgresos = document.getElementById("lista-egresos-personales");
  const resumenDiv   = document.getElementById("resumen-egresos");
  if (!listaEgresos) return;

  listaEgresos.innerHTML = "";

  const mesValor       = filtroMes?.value; // "YYYY-MM" o vacío
  const categoriaValor = (filtroCategoria?.value || "").toLowerCase();

  cargarYNormalizarEgresos(() => {
    const base = Array.isArray(egresos) ? egresos : Object.values(egresos || {}).flat();

    const egresosFiltrados = base.filter(eg => {
      if (!eg || !eg.fecha) return false;
      const mes = eg.fecha.slice(0, 7);
      const coincideMes       = !mesValor || mes === mesValor;
      const coincideCategoria = !categoriaValor || (eg.categoria || "").toLowerCase() === categoriaValor;
      return coincideMes && coincideCategoria;
    });

    // ⬅️ aquí estaba el bug
    egresosFiltrados.sort(W.byFechaDesc);

   // 🔹 ACTUALIZAR RESUMEN SIEMPRE (haya o no datos)
    actualizarResumenEgresos(egresosFiltrados);

    if (!egresosFiltrados.length) {
      listaEgresos.innerHTML = `<p>🪙 No hay egresos registrados aún.</p>`;
      // (opcional) si tenés gráfico, destruilo para que no quede viejo
      if (grafico) { try { grafico.destroy(); } catch {} grafico = null; }
      return;
    }

    egresosFiltrados.forEach((eg) => {
      const idxReal = base.indexOf(eg); // índice en el array original

      const div = document.createElement("div");
      div.classList.add("card-datos");
      const notaHtml = (eg.nota && eg.nota.trim()) ? `<div>📝 ${eg.nota}</div>` : "";

      div.innerHTML = `
        <div class="card-header">📅 ${formatoLegible(eg.fecha)}</div>
        <div class="card-body">
          <div><strong>${eg.categoria || "sin categoría"}${eg.subcategoria ? ` - ${eg.subcategoria}` : ""}</strong></div>
          <div>💰 $${(parseFloat(eg.monto) || 0).toFixed(2)}</div>
          <div>${eg.medio || "sin medio"}${eg.submedio ? ` / ${eg.submedio}` : ""}</div>
          ${notaHtml}
        </div>
        <div class="card-actions">
          <button class="icon-btn" data-tip="Editar" aria-label="Editar" onclick="editarEgreso(${idxReal})">✏️</button>
          <button class="icon-btn danger" data-tip="Eliminar" aria-label="Eliminar" onclick="eliminarEgreso(${idxReal})">🗑️</button>
        </div>
      `;
      listaEgresos.appendChild(div);
    });

// -----------------------------------
//  Resumen (solo egresos) — GLOBAL
// -----------------------------------
function actualizarResumenEgresos(egresosFiltrados) {
  const resumenDiv = document.getElementById("resumen-egresos");
  if (!resumenDiv) return;

  const mesValor   = document.getElementById("filtro-mes-egreso")?.value || "";
  const nombreMes  = nombreDelMes(mesValor);
  const filtroCat  = document.getElementById("filtro-categoria-egreso")?.value || "";

  const total = (egresosFiltrados || []).reduce((acc, e) => acc + (parseFloat(e.monto) || 0), 0);

  const contexto = filtroCat ? ` de categoría "${filtroCat}"` : "";
  const periodo  = mesValor ? `en ${nombreMes}` : "en todos los meses";
  const apodo    = ownerDisplay();
  const prefijo  = apodo ? `${apodo}: ` : "";

  const titulo = `${prefijo}💸 Total${contexto} ${periodo}: $${total.toFixed(2)}`
    .replace(/\s+/g, " ")
    .trim();

  // Solo egresos; nada de Disponible aquí
  resumenDiv.textContent = titulo;
}

      // Gráfico
      const resumenPorCategoria = {};
      egresosFiltrados.forEach(e => {
        const key = e.categoria || "Sin categoría";
        resumenPorCategoria[key] = (resumenPorCategoria[key] || 0) + parseFloat(e.monto || 0);
      });
      const labels = Object.keys(resumenPorCategoria);
      const data   = Object.values(resumenPorCategoria);

      if (grafico) grafico.destroy();
      if (ctxGrafico) {
        grafico = new Chart(ctxGrafico, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Egresos por categoría',
              data,
              backgroundColor: ['#f76b8a', '#ffc107', '#01c4e7', '#9a27f7']
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
          }
        });
      }
    });
  }

// Editar / eliminar (global)
W.editarEgreso = (i) => {
  const eg = egresos[i];
  if (!eg) return;

  document.getElementById("fecha-egreso").value = eg.fecha;
  document.getElementById("monto-egreso").value = eg.monto;

  // categoría + sub
  categoriaSelect.value = eg.categoria || "";
  categoriaSelect.dispatchEvent(new Event("change"));
  subcategoriaSelect.value = eg.subcategoria || "";

  // medio + submedio
  medioSelect.value = eg.medio || "";
  medioSelect.dispatchEvent(new Event("change"));
  submedioSelect.value = eg.submedio || "";

  notaInput.value = eg.nota || "";

  form.dataset.editIndex = i;
  form.querySelector("button[type='submit']").textContent = "Actualizar Egreso";
};

W.eliminarEgreso = (i) => {
  if (!confirm("¿Eliminar este egreso? 😮")) return;

  const eliminado = egresos.splice(i, 1)[0]; // optimista
  mostrarEgresos();

  fetch('/eliminar_egreso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(eliminado)
  })
  .then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text(); // o .json() si tu backend devuelve JSON
  })
  .then(() => {
    toastOk("🗑️ Egreso eliminado");
  })
  .catch(err => {
    console.error("Error al eliminar egreso:", err);
    toastErr("❌ No se pudo eliminar el egreso");
    // Si prefieres revertir el optimista en error, descomenta:
    // egresos.push(eliminado);
    // mostrarEgresos();
  });
};

// Exportar para que otros flujos puedan llamar
window.W = window.W || {};
W.mostrarEgresos = mostrarEgresos;

// No fuerces una primera carga aquí; el boot ya la llama tras normalizar datos
});

// =============================
// MANEJO DE PAGOS (bloque base)
// =============================
// Helper para pedir los nodos SIEMPRE al usarlos
function $pagosEls() {
  const filtroPersonaEl = document.getElementById("filtro-persona-pago");
  return {
    form:        document.getElementById("form-pagos"),
    lista:       document.getElementById("lista-pagos"),
    monto:       document.getElementById("monto-total"),
    bill:        document.getElementById("bill-pago"),
    persona:     document.getElementById("persona-pago"),
    medio:       document.getElementById("medio-pago"),
    fecha:       document.getElementById("fecha-pago"),
    nota:        document.getElementById("nota-pago"),
    filtroMes:   document.getElementById("filtro-mes-pago"),
    filtroPer:   filtroPersonaEl,   // alias 1
    filtroPersona: filtroPersonaEl, // alias 2 (compat)
    filtroBill:  document.getElementById("filtro-bill-pago"),
    subCont:     document.getElementById("submedio-pago-container"),
    subSelect:   document.getElementById("submedio-pago"),
  };
}

// 👇 renombrado para evitar choques con otras vistas
const resumenPagosDiv  = document.getElementById("resumen-pagos");
const ctxGraficoPagos  = document.getElementById("grafico-pagos")?.getContext("2d");
let graficoPagos       = null;

// Habilita/Deshabilita medio y maneja submedio según el monto
function toggleMedioPorMonto() {
  const { monto, medio, subSelect, subCont } = $pagosEls();
  const val = parseFloat(monto?.value || "0");
  const isZero = !val || val <= 0;

  if (medio) {
    medio.disabled = isZero;
    if (isZero) medio.value = "";
  }

  if (isZero) {
    if (subSelect) subSelect.value = "";
    if (subCont)   subCont.style.display = "none";
  } else {
    poblarSubmediosPagoDesdeSeleccion();
  }
}

// Listener del monto + estado inicial (sin variables globales)
function wirePagosUI() {
  const { monto } = $pagosEls();
  if (monto && !monto.dataset.wired) {
    monto.addEventListener("input", toggleMedioPorMonto);
    monto.dataset.wired = "1";
  }
  // Forzamos un primer estado correcto del medio/submedio
  toggleMedioPorMonto();
}

function rellenarSelectsPagos() {
  const sel = configTemporal?.pagos || {};

  const billsSrc    = sel.bills?.length    ? sel.bills    : (configBills || []).map(b => b.nombre);
  const personasSrc = sel.personas?.length ? sel.personas : (configPersonas || []).map(p => p.nombre);
  const mediosSrc   = sel.medios?.length   ? sel.medios   : (configMediosPago || []).map(m => m.medio);

  const { bill, filtroBill, persona, medio, filtroPer, filtroPersona } = $pagosEls();
  const filtroPersonaEl = filtroPersona || filtroPer; // <- unifica

  // Bills
  if (bill) {
    bill.innerHTML = `<option value="">Selecciona Bill</option>` +
      billsSrc.map(b => `<option value="${b}">${b}</option>`).join("");
  }
  if (filtroBill) {
    filtroBill.innerHTML = `<option value="">Todos</option>` +
      billsSrc.map(b => `<option value="${b}">${b}</option>`).join("");
  }

  // Personas
  if (persona) {
    persona.innerHTML = `<option value="">Selecciona persona</option>` +
      personasSrc.map(p => `<option value="${p}">${p}</option>`).join("");
  }
  if (filtroPersonaEl) {
    filtroPersonaEl.innerHTML = `<option value="">Todas</option>` +
      personasSrc.map(p => `<option value="${p}">${p}</option>`).join("");
  }

  // Medios
  if (medio) {
    medio.innerHTML = `<option value="">Selecciona medio</option>` +
      mediosSrc.map(m => `<option value="${m}">${m}</option>`).join("");
  }

  wireCambioMedioPago();
  poblarSubmediosPagoDesdeSeleccion();
  wireFiltrosPagos();
  toggleMedioPorMonto();
}

// ==============================
// SUBMEDIOS dependientes del medio
// ==============================
function poblarSubmediosPagoDesdeSeleccion() {
  const { medio, subCont, subSelect } = $pagosEls();
  if (!subCont || !subSelect) return;

  const medioSel = medio?.value || "";
  if (!medioSel) {
    subSelect.innerHTML = `<option value="">(selecciona un medio)</option>`;
    subCont.style.display = "none";
    return;
  }

  const marcados = W?.configTemporal?.pagos?.submediosPorMedio?.[medioSel] || [];
  const medioCfg = (W?.configMediosPago || []).find(m => m.medio === medioSel);
  const submedios = marcados.length ? marcados : (medioCfg?.submedios || []);

  if (!submedios.length) {
    subSelect.innerHTML = `<option value="">(sin submedios)</option>`;
    subCont.style.display = "none";
    return;
  }

  subSelect.innerHTML = `<option value="">Selecciona submedio</option>` +
    submedios.map(s => `<option value="${s}">${s}</option>`).join("");

  subCont.style.display = "block";
}

// Nuevo: cablea el change del <select id="medio-pago">
function wireCambioMedioPago() {
  const { medio } = $pagosEls();
  if (medio && !medio.dataset.wired) {
    medio.addEventListener("change", poblarSubmediosPagoDesdeSeleccion);
    medio.dataset.wired = "1";
  }
}

// Carga inicial de pagos
function clavePago(p) {
  return `${p.bill}|${p.persona}|${p.fecha}|${p.medio||''}|${p.submedio||''}|${p.monto}|${p.nota||''}`;
}

async function cargarPagos() {
  try {
    const data  = await fetchJSON('/cargar_pagos', { method: 'GET' }, { silent401: true });
    const lista = Array.isArray(data) ? data : (data?.pagos || []);

    // 🔁 fusionar y ACTUALIZAR EN SITIO (mantener la MISMA referencia de `pagos`)
    if (!Array.isArray(window.pagos)) window.pagos = [];
    const mapa = new Map(pagos.map(p => [clavePago(p), p]));
    (lista || []).forEach(p => mapa.set(clavePago(p), p));
    const fusionados = Array.from(mapa.values());
    pagos.splice(0, pagos.length, ...fusionados);

    // 🧹 limpiar filtros para no ocultar la lista al cargar
    ['filtro-mes-pago','filtro-persona-pago','filtro-bill-pago'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = '';
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles:true }));
    });

    mostrarPagos?.();
  } catch (err) {
    console.error('Error al cargar pagos:', err);
    try { toastErr?.('❌ No se pudieron cargar los pagos'); } catch {}
    // mantener la app viva
    pagos.splice(0, pagos.length);
    mostrarPagos?.();
  }
}

// Alta / edición de pagos
(function wireFormPagos(){
  const { form } = $pagosEls();
  if (!form) { document.addEventListener('DOMContentLoaded', wireFormPagos, { once:true }); return; }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const { bill, monto, persona, medio, fecha, nota, subSelect, subCont } = $pagosEls();

    const billVal    = bill?.value || "";
    const montoVal   = parseFloat(monto?.value || "0");
    const personaVal = persona?.value || "";
    const fechaVal   = fecha?.value || "";
    const notaVal    = (nota?.value || "").trim();

    if (!billVal || !personaVal || !fechaVal || isNaN(montoVal)) {
      alert("Completa bill, persona, fecha y un monto válido (puede ser 0).");
      return;
    }

    let medioVal = medio?.value || "";
    let submedioVal = (subSelect?.value || "").trim();
    if (montoVal <= 0) { medioVal = "No pagó"; submedioVal = ""; }

    const nuevoPago = { bill: billVal, monto: montoVal, persona: personaVal, medio: medioVal, submedio: submedioVal, fecha: fechaVal, nota: notaVal };

    const index = form.dataset.editIndex;
    let mensajeToast = "";
    let idxAfectado;

    if (index !== undefined && index !== "") {
      idxAfectado = Number(index);
      pagos[idxAfectado] = { ...pagos[idxAfectado], ...nuevoPago };
      mensajeToast = "✅ Pago actualizado correctamente";
    } else {
      idxAfectado = pagos.push(nuevoPago) - 1;
      mensajeToast = "✅ Pago guardado correctamente";
    }
    mostrarPagos?.();

    fetch('/guardar_pago', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nuevoPago)
    })
    .then(async (res) => {
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch {}
      if (!res.ok || data.ok === false) throw new Error(data?.error || `HTTP ${res.status}`);

      if (data?.pago) {
        pagos[idxAfectado] = data.pago; // con id del back
        mostrarPagos?.();
      }
      toastOk?.(mensajeToast);
    })
    .catch(err => {
      const msg = String(err?.message || '');
      if (msg.includes('401')) {
        document.getElementById('modal-login')?.classList.add('abierto');
      } else {
        console.error('Error al guardar pago:', err);
        if (index === undefined || index === "") {
          pagos.splice(idxAfectado, 1);
          mostrarPagos?.();
        }
        toastErr?.('❌ Error guardando pago. Intenta de nuevo.');
      }
    })
    .finally(() => {
      form.reset();
      if (subCont) subCont.style.display = "none";
      toggleMedioPorMonto();
      delete form.dataset.editIndex;
      const btn = form.querySelector("button[type='submit']");
      if (btn) btn.textContent = "💾 Registrar Pago";
    });
  });
})();

// Filtros
function wireFiltrosPagos() {
  const { filtroMes, filtroPer, filtroPersona, filtroBill } = $pagosEls();
  const filtroPersonaEl = filtroPersona || filtroPer; // <- unifica
  [filtroMes, filtroPersonaEl, filtroBill].forEach(f => {
    if (f && !f.dataset.wiredPagos) {
      f.addEventListener("input", mostrarPagos);
      f.dataset.wiredPagos = "1";
    }
  });
}

// ¿Este pago es "No pagó"?
function esNoPagoRegistro(p) {
  if (!p) return true;
  const monto = Number(p.monto || 0);
  const medio = String(p.medio || "").toLowerCase();
  return monto <= 0 || medio === "no pagó" || medio === "no pago";
}
// Arma la URL de WhatsApp basada SOLO en configPersonas
function buildWhatsURLPagoSoloConfig(p) {
  const persona = buscarPersonaPorNombre(p.persona);   // ya la tienes
  const numero  = normalizarTelefono(persona?.telefono || "");
  if (!numero) return "";

  const noPago = esNoPagoRegistro(p);
  const msg = noPago
    ? `¡Hola ${p.persona}! 😅
Detectamos que no has pagado tu parte del bill *${p.bill}*.
Por favor, hazlo cuando puedas. ¡Te queremos igual! 😘
(pero paga, MALA PAGA 🧾💸)`
    : `¡Hola ${p.persona}! 🎉
Hemos recibido tu pago 🤑 del Bill *${p.bill}* 💡💧
💰 Monto: $${Number(p.monto).toFixed(2)}
📅 Fecha: ${p.fecha}
💳 Medio: ${p.medio}

¡Gracias por cumplir! 🫶✨
TQM 😍`;

  return `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;
}

// Mostrar Pagos (completa)
function mostrarPagos() {
  const { lista, filtroMes, filtroPer, filtroBill } = $pagosEls();
  if (!lista) {  // DOM aún no listo → reintenta cuando cargue
    document.addEventListener('DOMContentLoaded', mostrarPagos, { once: true });
    return;
  }

  lista.innerHTML = "";

  const mesFiltro     = (filtroMes?.value || "");
  const personaFiltro = (filtroPer?.value || "");
  const billFiltro    = (filtroBill?.value || "");

  const pagosFiltrados = (pagos || []).filter(p => {
    const coincideMes     = !mesFiltro     || String(p?.fecha || '').startsWith(mesFiltro);
    const coincidePersona = !personaFiltro || p.persona === personaFiltro;
    const coincideBill    = !billFiltro    || p.bill === billFiltro;
    return coincideMes && coincidePersona && coincideBill;
  }).sort(W.byFechaDesc || (() => 0));

  if (!pagosFiltrados.length) {
    lista.innerHTML = `<p>🪙 No hay pagos registrados aún.</p>`;
    actualizarResumenPagos(pagosFiltrados);
    actualizarGraficoPagos(pagosFiltrados);
    return;
  }

  for (const [i, pago] of pagosFiltrados.entries()) {
    const item = document.createElement("div");
    item.classList.add("card-datos");

    const urlWA = buildWhatsURLPagoSoloConfig(pago);
    const notaHtml = (pago.nota && pago.nota.trim()) ? `<div>📝 ${pago.nota}</div>` : "";

    item.innerHTML = `
      <div class="card-header">
        <span>📅 ${formatoLegible(pago.fecha)}</span>
        <span> ${pago.bill}</span>
        <span>💰 $${Number(pago.monto||0).toFixed(2)}</span>
      </div>
      <div class="card-body">
        <div>👤 ${pago.persona}</div>
        <div>${esNoPagoRegistro(pago) ? "No pagó" : (pago.medio || "—")}${pago.submedio ? ` / ${pago.submedio}` : ""}</div>
        ${notaHtml}
      </div>
      <div class="card-actions">
       ${urlWA ? `<button class="wa-btn" data-tip="WhatsApp" title="WhatsApp" aria-label="WhatsApp"
                  onclick="W.open('${urlWA}', '_blank')">📩</button>` : ""}
        <button class="icon-btn" data-tip="Editar" title="Editar" aria-label="Editar" onclick="editarPago(${i})">✏️</button>
        <button class="icon-btn danger" data-tip="Eliminar" title="Eliminar" aria-label="Eliminar" onclick="eliminarPago(${i})">🗑️</button>
      </div>
    `;
    lista.appendChild(item);
  }

  actualizarResumenPagos(pagosFiltrados);
  actualizarGraficoPagos(pagosFiltrados);
}

// -----------------------------------
// Resumen Pagos (sin globals sueltas)
// -----------------------------------
function actualizarResumenPagos(filtrados) {
  const { filtroMes, filtroPer } = $pagosEls();
  const mesFiltro = filtroMes?.value || "";
  const personaFiltro = (filtroPer?.value || "").toLowerCase();

  const totalPagos = filtrados.reduce((acc, p) => acc + parseFloat(p.monto || 0), 0);
  const resumenPorPersona = {};
  filtrados.forEach(p => {
    resumenPorPersona[p.persona] = (resumenPorPersona[p.persona] || 0) + parseFloat(p.monto || 0);
  });
  const detalle = Object.entries(resumenPorPersona)
    .map(([nombre, monto]) => `${nombre}: $${monto.toFixed(2)}`)
    .join(" | ");

  const nombreMesFiltro = nombreDelMes(mesFiltro);
  let tituloPrincipal = `💳 Total de pagos en ${nombreMesFiltro}: $${totalPagos.toFixed(2)}`;
  if (personaFiltro) {
    tituloPrincipal = `💳 Total de pagos de "${filtroPer?.value}" en ${nombreMesFiltro}: $${totalPagos.toFixed(2)}`;
  }

  const panel = document.getElementById("resumen-pagos");
  if (!panel) return;
  panel.innerHTML = `${tituloPrincipal}<br>👥 ${detalle || "—"}`;
}

// Grafico Pagos
function actualizarGraficoPagos(filtrados) {
  const resumen = {};
  filtrados.forEach(p => {
    resumen[p.persona] = (resumen[p.persona] || 0) + Number(p.monto || 0);
  });

  const labels = Object.keys(resumen);
  const data   = Object.values(resumen);

  if (graficoPagos) graficoPagos.destroy();
  if (!ctxGraficoPagos) return; // por si no existe el canvas

  graficoPagos = new Chart(ctxGraficoPagos, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Pagos por persona',
        data
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function editarPago(i) {
  const p = pagos[i];
  if (!p) return;

  const { bill, monto, persona, medio, fecha, nota, subCont, subSelect } = $pagosEls();
  if (!bill || !monto || !persona || !medio || !fecha || !nota) return;

  bill.value      = p.bill || "";
  monto.value     = Number(p.monto || 0);
  persona.value   = p.persona || "";
  fecha.value     = p.fecha || "";
  nota.value      = p.nota || "";

  const montoNum = Number(p.monto || 0);
  if (montoNum <= 0) {
    medio.value    = "";
    medio.disabled = true;
    medio.title    = "Monto = 0 → No pagó";
    if (subCont) subCont.style.display = "none";
    if (subSelect) subSelect.value = "";
  } else {
    medio.disabled = false;
    medio.title    = "";
    medio.value    = p.medio || "";
    medio.dispatchEvent(new Event("change")); // repobla submedios
    if (subSelect) subSelect.value = p.submedio || "";
  }

  const { form } = $pagosEls();
  if (form) {
    form.dataset.editIndex = i;
    const btn = form.querySelector("button[type='submit']");
    if (btn) btn.textContent = "Actualizar Pago";
  }
}

function eliminarPago(i) {
  if (!confirm("¿Eliminar este pago? 😱")) return;

  const eliminado = pagos[i];
  if (!eliminado) return;

  // Optimista
  const backup = pagos.splice(i, 1)[0];
  mostrarPagos();

  fetch('/eliminar_pago', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(eliminado)
  })

  .then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    try { await res.json(); } catch {}
    toastOk("🗑️ Pago eliminado");
  })
  .catch(err => {
    console.error("Error al eliminar pago:", err);
    toastErr("❌ No se pudo eliminar el pago");
    // rollback
    pagos.splice(i, 0, backup);
    mostrarPagos();
  });
}

// =============================
// DISPONIBLE (pintado central)
// =============================
function refrescarDisponibleGlobal() {
  const paneles = document.querySelectorAll('[data-disponible-panel]');
  if (!paneles.length) return;

  paneles.forEach(panel => {
    const sourceId = panel.getAttribute('data-mes-source') || '';
    const mesSel = sourceId ? (document.getElementById(sourceId)?.value || '') : '';
    disponibleMes(mesSel, ({ nombreMes, ingresos, egresos, disponible }) => {
      panel.innerHTML = `
        💵 <strong>Disponible</strong> en <em>${nombreMes}</em>:
        <strong>$${(disponible || 0).toFixed(2)}</strong>
        <small style="display:block;opacity:.7">
          Ingresos $${(ingresos||0).toFixed(2)} — Egresos $${(egresos||0).toFixed(2)}
        </small>
      `;
    });
  });
}

function wireDisponibleAuto() {
  // 1) Enlazar carga/normalización de egresos
  const prevCargar = window.cargarYNormalizarEgresos;
  if (typeof prevCargar === 'function' && !prevCargar._wiredDisponible) {
    window.cargarYNormalizarEgresos = function(cb) {
      prevCargar(() => {
        try { refrescarDisponibleGlobal(); } catch {}
        cb && cb();
      });
    };
    window.cargarYNormalizarEgresos._wiredDisponible = true;
  }

  // 2) Enlazar cambio de vista
  const prevMostrarVista = window.mostrarVista;
  if (typeof prevMostrarVista === 'function' && !prevMostrarVista._wiredDisponible) {
    window.mostrarVista = function(idVista) {
      prevMostrarVista(idVista);
      try { refrescarDisponibleGlobal(); } catch {}
    };
    window.mostrarVista._wiredDisponible = true;
  }

  // 3) Enlazar aplicar configuración
  const prevAplicarCfg = window.aplicarConfiguracion;
  if (typeof prevAplicarCfg === 'function' && !prevAplicarCfg._wiredDisponible) {
    window.aplicarConfiguracion = function(cfg) {
      prevAplicarCfg(cfg);
      try { refrescarDisponibleGlobal(); } catch {}
    };
    window.aplicarConfiguracion._wiredDisponible = true;
  }

  // 4) Enlazar altas/bajas de ingresos/egresos
  ['guardarIngreso','eliminarIngreso','guardarEgreso','eliminarEgreso'].forEach(fn => {
    const prev = window[fn];
    if (typeof prev === 'function' && !prev?._wiredDisponible) {
      window[fn] = function(...args) {
        const r = prev.apply(this, args);
        Promise.resolve(r).finally(() => { try { refrescarDisponibleGlobal(); } catch {} });
        return r;
      };
      window[fn]._wiredDisponible = true;
    }
  });

  // 5) Enlazar cambios de filtros de mes
  ['filtro-mes-ingreso','filtro-mes-egreso','filtro-mes-bill','filtro-mes-pago'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.wiredDisponible) {
      el.addEventListener('input', () => { try { refrescarDisponibleGlobal(); } catch {} });
      el.dataset.wiredDisponible = '1';
    }
  });

  // 6) Primer pintado
  try { refrescarDisponibleGlobal(); } catch {}
}

// === Tooltips en móviles: muestra data-tip ~1s al tocar ===
document.addEventListener("touchstart", (e) => {
  const btn = e.target.closest(".icon-btn[data-tip]");
  if (!btn) return;
  btn.classList.add("tip-show");
  setTimeout(() => btn.classList.remove("tip-show"), 1200);
}, { passive: true });

function marcarListasGrid() {
  ["lista-ingresos","lista-bills","lista-egresos-personales","lista-pagos"]
    .forEach(id => document.getElementById(id)?.classList.add("lista-grid"));
}

function aplanarListas() {
  const listas = ['lista-ingresos','lista-bills','lista-pagos','lista-egresos-personales'];
  listas.forEach(id => {
    const root = document.getElementById(id);
    if (!root) return;

    // Si el root tiene UN solo hijo y dentro hay tarjetas, subimos esas tarjetas
    const first = root.firstElementChild;
    if (first && first !== root && first.querySelector('.card-datos, .bill-card')) {
      const hijos = Array.from(first.children);
      if (hijos.length) {
        root.replaceChildren(...hijos);
      }
    }
  });
}

async function cargarIngresos() {
  try {
    const data = await fetchJSON('/cargar_ingresos', { method: 'GET' }, { silent401: true });
    if (!data) { // 401 → sin sesión
      if (Array.isArray(window.ingresos)) ingresos.length = 0;
      mostrarIngresos?.(true);
      return;
    }

    const nuevos = Array.isArray(data) ? data : (data?.ingresos || []);
    window.W = window.W || {};
    W.ingresos = Array.isArray(W.ingresos) ? W.ingresos : [];

    const clave = i => `${i.fecha}|${i.monto}|${i.fuente}|${i.nota||''}`;
    const mapa = new Map(W.ingresos.map(i => [clave(i), i]));
    (nuevos || []).forEach(i => mapa.set(clave(i), i));
    W.ingresos = Array.from(mapa.values());

    mostrarIngresos?.(true);
  } catch (err) {
    console.error('Error al cargar ingresos:', err);
    if (Array.isArray(window.ingresos)) ingresos.length = 0;
    mostrarIngresos?.(true);
  }
}

async function cargarEgresos() {
  try {
    await new Promise((resolve, reject) => {
      try {
        cargarYNormalizarEgresos(() => {
          try {
            if (typeof window.mostrarEgresos === 'function') window.mostrarEgresos();
          } finally {
            resolve();
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  } catch (err) {
    if (String(err?.message || '').includes('401')) {
      if (typeof window.mostrarPantallaLogin === 'function') window.mostrarPantallaLogin();
      if (Array.isArray(window.egresos)) window.egresos.length = 0;
      if (typeof window.mostrarEgresos === 'function') window.mostrarEgresos();
      return;
    }
    console.error('Error al cargar egresos:', err);
  }
}

async function cargarEgresos() {
  try {
    await new Promise((resolve, reject) => {
      try {
        cargarYNormalizarEgresos(() => {
          try { mostrarEgresos?.(); } finally { resolve(); }
        });
      } catch (e) {
        reject(e);
      }
    });
  } catch (err) {
    if (String(err?.message || '').includes('401')) {
      mostrarPantallaLogin?.();
      if (Array.isArray(window.egresos)) egresos.length = 0;
      mostrarEgresos?.();
      return;
    }
    console.error('Error al cargar egresos:', err);
  }
}

async function cargarConfiguracion() {
  try {
    const cfg = await fetchJSON('/cargar_configuracion', { method: 'GET' }, { silent401: true });
    if (!cfg) return;
    aplicarConfiguracionSegura(cfg, 'cargarConfiguracion');
  } catch (e) {
    console.error('Error al cargar configuración:', e);
  }
}

// === Boot ===
function ensureSplash() {
  let splash = document.getElementById('splash');
  if (!splash) {
    splash = document.createElement('div');
    splash.id = 'splash';
    splash.innerHTML = `<img src="/static/fondos/logo.png" alt="Splash">`;
    document.body.prepend(splash);
  }
  return splash;
}

function startSplashAnim() {
  const splash = ensureSplash();

  const fireAnim = (el) => {
    el.classList.remove('splash-anim');
    void el.offsetWidth;                 // reflow para reiniciar animación
    el.classList.add('splash-anim');
  };

  const img = splash.querySelector('img');
  fireAnim(img || splash);               // preferimos animar <img>, si no, el contenedor
}

// Dispara cuando el DOM está listo y también en load
document.addEventListener('DOMContentLoaded', startSplashAnim, { once:true });
window.addEventListener('load', startSplashAnim, { once:true });

async function iniciarZonaPrivada() {
  // 1) Config primero (muchas vistas dependen de ella)
  if (typeof cargarConfiguracion === 'function') {
    try { await cargarConfiguracion(); } catch (e) { console.warn('cargarConfiguracion falló:', e); }
  }

  // 2) Lo demás en paralelo
  const tareas = [];
  if (typeof cargarBills === 'function')      tareas.push(cargarBills());
  if (typeof cargarIngresos === 'function')   tareas.push(cargarIngresos());
  if (typeof cargarEgresos === 'function')    tareas.push(cargarEgresos());
  if (typeof cargarPagos === 'function')      tareas.push(cargarPagos());
  if (typeof cargarPerfilEnUI === 'function') tareas.push(cargarPerfilEnUI());
  await Promise.allSettled(tareas);

  // 3) Post-procesos UI
  aplanarListas?.();
  marcarListasGrid?.();
  wirePagosUI?.();
  wireDisponibleAuto?.();
  refrescarDisponibleGlobal?.();
}

async function boot() {
  // a) Defaults públicos
  try {
    const cfg = await fetchJSON('/config_default', { method: 'GET' }, { silent401: true });
    if (cfg) aplicarConfiguracionSegura(cfg, 'boot:config_default');
  } catch (e) {
    console.warn('No se pudo cargar config_default:', e);
  }

  // b) Sesión con try/catch (si hay error de red/500, no dejes el splash colgado)
  let ses = null;
  try {
    ses = await fetchJSON('/session', { method: 'GET' }, { silent401: true });
  } catch (e) {
    console.error('Error consultando /session:', e);
    _marcarSesion(false);
    mostrarPantallaLogin?.();
    requestAnimationFrame(() => ocultarSplash?.());
    return;
  }

  // c) Sin usuario
if (!ses || ses.ok === false || !ses.usuario) {
  _marcarSesion(false);
  // PRIMERO ocultamos el splash y LUEGO mostramos el login
  ocultarSplash(() => {
    mostrarPantallaLogin?.();
    enforceAuthView?.();
  });
  return;
}

// d) Autenticado
_marcarSesion(true);
const user = ses.usuario || { id: ses.id, email: ses.email, nombre: ses.nombre || ses.email };
try { sessionStorage.setItem('usuario', JSON.stringify(user)); } catch {}

await iniciarZonaPrivada(); // carga datos
// PRIMERO ocultamos el splash y LUEGO mostramos la zona privada (si no la mostraste antes)
ocultarSplash(() => {
  mostrarZonaPrivada?.(user);
  enforceAuthView?.();
});
}

// --- registrar accesos globales ---
registerGlobals(); // con la versión “segura” ya no hace falta el try/catch

// 3) ÚNICO listener de arranque (asegúrate de no tener otro en el archivo)
document.addEventListener('DOMContentLoaded', boot);