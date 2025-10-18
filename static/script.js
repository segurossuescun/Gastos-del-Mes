// --- Gate de sesión (global)
window.__sessionOK = window.__sessionOK ?? false;

window.RUTAS_PRIVADAS = new Set([
  '/cargar_configuracion','/guardar_configuracion','/restablecer_configuracion',
  '/cargar_perfil','/guardar_perfil',
  '/cargar_ingresos','/guardar_ingreso','/eliminar_ingreso',
  '/cargar_bills','/guardar_bill','/eliminar_bill',
  '/cargar_egresos','/guardar_egreso','/eliminar_egreso',
  '/cargar_pagos','/guardar_pago','/eliminar_pago'
]);

function _marcarSesion(on) {
  window.__sessionOK = !!on;
  try { document.body.classList.toggle('is-auth', !!on); } catch {}
}

// === FLAGS GLOBALES (poner aquí, antes de fetchJSON/boot) ===
window.__paywall = window.__paywall ?? false;         // si 402/403, true
window.__waitingStripeVerify = window.__waitingStripeVerify 
  ?? (new URLSearchParams(location.search).get('checkout') === 'success'); // pausa tras Stripe
window.__modalGate   = window.__modalGate   ?? false;  // evita dobles modales
window.__privadaInit = window.__privadaInit ?? false;  // evita duplicar cargas privadas
window.__stripeHandled = window.__stripeHandled ?? false; // anti-doble verificación
let __paywallShown = false; // mensaje de paywall solo 1 vez

/* =========================
   ⬇⬇⬇ PEGA ESTE BLOQUE AQUÍ ⬇⬇⬇
========================= */
(function handlePasswordResetFromURL() {
  try {
    const q = new URLSearchParams(location.search);
    const token = q.get('reset_token');
    if (!token) return;

    // evita dobles
    if (window.__resetModalShown) return;
    window.__resetModalShown = true;

    const clean = () => {
      q.delete('reset_token');
      const rest = q.toString();
      history.replaceState({}, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
    };

    (async () => {
      const { value: vals } = await Swal.fire({
        title: 'Nueva contraseña',
        html:
          '<input id="pw1" type="password" class="swal2-input" placeholder="Nueva contraseña">' +
          '<input id="pw2" type="password" class="swal2-input" placeholder="Repite la contraseña">',
        focusConfirm: false,
        preConfirm: () => {
          const p1 = document.getElementById('pw1').value || '';
          const p2 = document.getElementById('pw2').value || '';
          if (p1.length < 8) return Swal.showValidationMessage('Mínimo 8 caracteres');
          if (p1 !== p2)     return Swal.showValidationMessage('No coinciden');
          return { password: p1 };
        },
        showCancelButton: true,
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar',
        customClass: { popup:'gastos', confirmButton:'btn-gastos', cancelButton:'btn-gastos-sec' },
        buttonsStyling: false
      });

      if (!vals) { clean(); return; }

      const r = await fetch('/reset_password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, password: vals.password })
      });
      const j = await r.json().catch(()=> ({}));

      if (!r.ok || j.ok === false) {
        await Swal.fire('Ups', j.error || 'No pudimos cambiar la contraseña.', 'error');
        clean();
        return;
      }

      await Swal.fire('Listo', 'Tu contraseña fue actualizada. Ahora inicia sesión.', 'success');
      clean();
      document.getElementById('login-password')?.focus();
    })();
  } catch (e) {
    console.warn('reset handler error', e);
  }
})();

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

// --- Guard global: evita ReferenceError si la llaman antes de definirla real ---
if (typeof window.mostrarZonaPrivada !== 'function') {
  window.mostrarZonaPrivada = function () { /* stub temporal; se reemplaza más abajo */ };
}

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

function setInApp(on){
  document.body.classList.toggle('in-app', !!on);
  window.dispatchEvent(new Event(on ? 'inApp:on' : 'inApp:off'));
}

// --- Helpers de config ---------------------------------------------
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

// === Estado GLOBAL (una vez) ===
const State = {
  cfg: null,     // configuración por usuario
  IDX: {},       // índices id -> objeto (para mostrar emoji+label)
  inited: false, // evita doble init
};


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
// === Helpers GLOBAL ===
function genId(prefix='t_'){
  if (crypto?.getRandomValues){
    const b=new Uint8Array(9); crypto.getRandomValues(b);
    return prefix + Array.from(b, x=>x.toString(36).padStart(2,'0')).join('').slice(0,12);
  }
  return prefix + (Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-4));
}

function ensureIds(list, pfx='t_', pfxChild='s_'){
  if(!Array.isArray(list)) return [];
  for(const it of list){
    if(!it.id) it.id=genId(pfx);
    (it.children||[]).forEach(ch=>{ if(!ch.id) ch.id=genId(pfxChild); });
  }
  return list;
}
// Separa emoji inicial (si hay) del texto visible
function parseEmojiLabel(txt){
  const m = String(txt||'').match(/^\p{Extended_Pictographic}/u);
  const emoji = m ? m[0] : '';
  const label = emoji ? String(txt).replace(/^\p{Extended_Pictographic}\s*/u,'').trim()
                      : String(txt||'');
  return { emoji, label };
}

// ÚNICA función reutilizable (Bills/Ingresos/Egresos/Pagos)
function rellenarSelectTextoConDataId(selectEl, listaTextos, placeholder, prefix='t_'){
  if(!selectEl) return;
  const opts = [];
  if (placeholder) opts.push(`<option value="">${placeholder}</option>`);
  for (const txt of (listaTextos || [])){
    const m = String(txt||'').match(/^\p{Extended_Pictographic}/u);
    const emoji = m ? m[0] : '';
    const label = emoji ? String(txt).replace(/^\p{Extended_Pictographic}\s*/u,'').trim()
                        : String(txt||'');
    const dataId = genId(prefix);
    const vis = `${emoji ? emoji+' ' : ''}${label}`;
    opts.push(`<option value="${txt}" data-id="${dataId}">${vis}</option>`);
  }
  selectEl.innerHTML = opts.join('');
}

// Fechas seguras (sin timezone)
function fechaDMY(ymd){
  if(!ymd) return ''; const [y,m,d]=String(ymd).slice(0,10).split('-'); return `${d}/${m}/${y}`;
}

// Índice por id (para lookups emoji+label)
function indexById(list){ const m=new Map(); (list||[]).forEach(x=>m.set(x.id,x)); return m; }
function displayLabel(map, id){ const it=map.get(id); return it ? `${it.emoji||''} ${it.label}`.trim() : (id||''); }

// Si no viene con ese patrón, caemos al formateo clásico pero a mediodía local.
function formatoLegible(fechaRaw) {
  if (!fechaRaw) return "sin fecha";
  const s = String(fechaRaw).slice(0, 10);      // por si venía con hora
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  }
  // fallback para otros formatos: “anclar” a 12:00 local evita -1 día
  const d = new Date(s + "T12:00:00");
  return isNaN(d) ? s : new Intl.DateTimeFormat("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric"
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
async function syncNextChargeIfMissing() {
  const r = await fetch('/billing_sync', { method:'POST', credentials:'same-origin' });
  return r.json();
}

// corre una sola vez (a menos que uses {force:true})
window.__privadaInit = window.__privadaInit ?? false;

async function mostrarAppYcargar({ force = false } = {}) {
  if (window.__privadaInit && !force) return;
  window.__privadaInit = true;

  setInApp(true);

  // mostrar zona privada
  document.getElementById('seccion-login')?.classList.add('oculto');
  const zp = document.getElementById('zona-privada');
  if (zp && zp.style) zp.style.display = 'block';

  // solo carga datos si NO estás esperando verificación Stripe ni hay paywall
  if (!window.__waitingStripeVerify && !window.__paywall) {
    try { await iniciarZonaPrivada?.(); } catch {}
  }

  // refrescos suaves (no rompen si ya estás suscrito)
  try { await checkAccountStatus?.(); } catch {}
  try { await refrescarEstadoCuenta?.(); } catch {}

  enforceAuthView?.();
}
// === HELPERS BILLS (arriba del script, zona helpers) ===
// --- 1) Loader de bills con manejo de 401 y repintado ---
async function cargarBillsSiHaceFalta(){
  window.W = window.W || {};
  if (Array.isArray(W.bills) && W.bills.length) return;

  try{
    const r = await fetch('/cargar_bills', { credentials:'include' });
    if (!r.ok) throw new Error('no-auth');
    const t = await r.text(); let d={};
    try{ d = JSON.parse(t); }catch{}
    W.bills = Array.isArray(d) ? d : (d?.bills || []);
    console.log('📦 Bills desde servidor:', W.bills.length);
  }catch(e){
    console.warn('No se pudieron cargar bills del server:', e?.message);
    // ⬇️ Fallback a configuración local
    const conf = (W.configTemporal?.bills || W.configTemporal?.bills_conf || []);
    const fromConf = (Array.isArray(conf) ? conf : (Array.isArray(W.configBills) ? W.configBills : []))
      .map((b,i) => ({
        id: -(i+1),                           // id sintético negativo
        nombre: b.nombre || b.label || b.texto || b,
        tipo_id: b.id || ''                   // si existe
      }));
    W.bills = fromConf;
    console.log('📦 Bills desde config (fallback):', W.bills.length);
  }
}

// --- 2) Una función de inicialización para Pagos ---
async function initPagosPopulate(){
  const ok = await cargarBillsSiHaceFalta();
  if (!ok) return;            // si no hay sesión, no seguimos
  if (typeof rellenarSelectsPagos === 'function') {
    rellenarSelectsPagos();   // ← repinta bill/persona/medio
  }
}

// --- 3) Llamarla desde cambio de vista Pagos ---
/* En tu actualizarSelectsVistas:
   if (vista === "todos" || vista === "pagos") { initPagosPopulate(); }
*/

// --- 4) (Opcional) Reintento automático post-login ---
window.W = window.W || {};
// Si tu flujo de login emite algún evento, cuélgalo aquí:
W.onLoginSuccess = function(){
  initPagosPopulate();
};
// --- Utils para listas (requeridas por iniciarZonaPrivada) ---
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
      if (hijos.length) root.replaceChildren(...hijos);
    }
  });
}

// Export para uso en otros lados (opcional)
window.marcarListasGrid = marcarListasGrid;
window.aplanarListas   = aplanarListas;

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
async function loadUserConfig(){
  if (State.cfg) return State.cfg; // cache
  const res = await fetch('/api/config', {credentials:'include'});
  State.cfg = await res.json();

  // Asegura IDs en cada bloque del user
  State.cfg.bills_conf        = ensureIds(State.cfg.bills_conf,        't_','s_');
  State.cfg.egresos_conf      = ensureIds(State.cfg.egresos_conf,      'c_','sc_');
  State.cfg.medios_pago       = ensureIds(State.cfg.medios_pago,       'm_','sm_');
  State.cfg.ingresos_fuentes  = ensureIds(State.cfg.ingresos_fuentes,  'f_','sf_');
  State.cfg.personas          = ensureIds(State.cfg.personas,          'p_','');

  // Índices para mostrar bonito
  State.IDX = {
    bills:   indexById(State.cfg.bills_conf),
    egCat:   indexById(State.cfg.egresos_conf),
    medios:  indexById(State.cfg.medios_pago),
    fuentes: indexById(State.cfg.ingresos_fuentes),
    personas:indexById(State.cfg.personas),
  };

  // (Opcional) persistir config saneada con nuevos IDs:
  // await fetch('/api/config', {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(State.cfg)});

  return State.cfg;
}
function fillSelect(sel, items){
  if(!sel) return;
  sel.innerHTML = (items||[])
    .map(it => `<option value="${it.id}">${(it.emoji||'')} ${it.label}</option>`)
    .join('');
}

// Bills
function initBillsSelects(){
  const tipoSel = document.getElementById('bill-tipo');
  const subSel  = document.getElementById('bill-subtipo');
  if(!tipoSel) return;
  fillSelect(tipoSel, State.cfg.bills_conf);
  function renderSubs(id){
    const tipo = State.cfg.bills_conf.find(t=>t.id===id);
    fillSelect(subSel, tipo?.children || []);
  }
  renderSubs(tipoSel.value);
  tipoSel.addEventListener('change', e=>renderSubs(e.target.value), {once:false});
}

// Egresos
function initEgresosSelects(){
  fillSelect(document.getElementById('categoria-egreso'),  State.cfg.egresos_conf);
  fillSelect(document.getElementById('medio-egreso'),      State.cfg.medios_pago);
  fillSelect(document.getElementById('egreso-persona'),    State.cfg.personas);
  // subcategorías dependientes
  const catSel = document.getElementById('categoria-egreso');
  const subSel = document.getElementById('subcategoria-egreso');
  if(catSel && subSel){
    const render = id=>{
      const cat = State.cfg.egresos_conf.find(c=>c.id===id);
      fillSelect(subSel, cat?.children || []);
    };
    render(catSel.value);
    catSel.addEventListener('change', e=>render(e.target.value), {once:false});
  }
}

// Ingresos
function initIngresosSelects(){
  fillSelect(document.getElementById('ingreso-fuente'), State.cfg.ingresos_fuentes);
}

// Pagos
function initPagosSelects(){
  fillSelect(document.getElementById('pago-medio'),    State.cfg.medios_pago);
  fillSelect(document.getElementById('pago-persona'),  State.cfg.personas);
}
function bindBillsForm(){
  const form = document.getElementById('form-bills');
  if(!form || form._bound) return; form._bound = true;  // evita doble binding al cambiar de vista
  form.addEventListener('submit', async e=>{
    e.preventDefault();
    const payload = {
      fecha:  document.getElementById('bill-fecha').value,
      monto:  Number(document.getElementById('bill-monto').value),
      tipo_id: document.getElementById('bill-tipo').value,
      subtipo_id: document.getElementById('bill-subtipo')?.value || null,
    };
    await fetch('/api/bills', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
    // refresca tu lista aquí…
  });
}

function bindEgresosForm(){
  const form = document.getElementById('form-egresos');
  if(!form || form._bound) return; form._bound = true;
  form.addEventListener('submit', async e=>{
    e.preventDefault();
    const payload = {
      fecha:  document.getElementById('egreso-fecha').value,
      monto:  Number(document.getElementById('egreso-monto').value),
      categoria_id:   document.getElementById('categoria-egreso').value,
      subcategoria_id:document.getElementById('subcategoria-egreso')?.value || null,
      medio_id:       document.getElementById('medio-egreso').value,
      submedio_id:    document.getElementById('submedio-egreso')?.value || null,
      persona_id:     document.getElementById('egreso-persona')?.value || null,
      nota:           document.getElementById('egreso-nota')?.value || null,
    };
    await fetch('/api/egresos', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
    // refresca…
  });
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

// --- Login overlay helper (ÚNICO) ---
let __mostrandoLogin401 = false;
function mostrarPantallaLogin({ reason = "" } = {}) {
  if (__mostrandoLogin401) return;
  __mostrandoLogin401 = true;

  // Estado de sesión
  try { _marcarSesion(false); } catch {}
  window.__sessionOK = false;
  try { sessionStorage.removeItem('usuario'); } catch {}
  document.body.classList.remove('auth','is-auth');

  // Accesibilidad: el login vive dentro de #contenido-app → NO debe estar aria-hidden
  const root = document.getElementById('contenido-app');
  if (root) {
    root.style.setProperty('display','block','important');
    root.style.visibility = 'visible';
    root.style.opacity    = '1';
    root.removeAttribute('aria-hidden');
  }

  // Oculta TODO lo privado (incluso si alguna vista quedó fuera de #zona-privada)
  document.querySelectorAll('.vista, #ingresos, #bills, #egresos, #pagos, #detalle-resumen')
    .forEach(n => n?.style?.setProperty('display','none','important'));
  ['zona-privada','barra-superior','menu-vistas']
    .forEach(id => document.getElementById(id)?.style?.setProperty('display','none','important'));

  // Limpia “activo” en el menú
  const menu = document.getElementById('menu-vistas');
  menu?.querySelectorAll('button[data-vista]')?.forEach(b => b.classList.remove('is-active'));

  // Muestra login/registro
  ['usuario','seccion-usuario','seccion-login','seccion-registro']
    .forEach(id => document.getElementById(id)?.style?.setProperty('display','block','important'));

  // Modal de login (si existe)
  const modal = document.getElementById('modal-login');
  if (modal) modal.classList.add('abierto');

  // Limpia inputs (si tienes estos helpers)
  try { limpiarLoginUI?.(); limpiarRegistroUI?.(); } catch {}

  // ⚠️ NO llames enforceAuthView aquí (puede volver a encender vistas privadas)

  // Anti-doble disparo
  setTimeout(() => { __mostrandoLogin401 = false; }, 1200);
}

// Exponer global (una sola vez)
window.mostrarPantallaLogin = window.mostrarPantallaLogin || mostrarPantallaLogin;

// =============================
// FETCH JSON (gate sesión + paywall 402/403)
// =============================
async function fetchJSON(url, opts = {}, { silent401 = false } = {}) {
  opts = opts || {};
  const path = new URL(url, location.origin).pathname;

  // ✋ No llames rutas privadas si NO hay sesión o estás en paywall
  try {
    const rutasPriv = window.RUTAS_PRIVADAS || new Set();
    if ((!window.__sessionOK || window.__paywall) && rutasPriv.has(path)) {
      console.info('⛔️ Bloqueado por sesión/paywall:', path);
      return null;
    }
  } catch {}

  const res = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
    // opcional si usas abort en logout:
    // signal: window.__netAbort?.signal
  });

  // 401 → manda a login
  if (res.status === 401) {
    if (!silent401) {
      try { mostrarPantallaLogin?.(); } catch {}
      if (typeof _marcarSesion === 'function') _marcarSesion(false);
      else window.__sessionOK = false;
    }
    return null;
  }

  // 402/403 → activa paywall **una sola vez**
  if (res.status === 402 || res.status === 403) {
    window.__paywall = true;
    // si estamos volviendo de Stripe, no dispares nada ahora
    if (window.__waitingStripeVerify) return null;

    if (!__paywallShown) {
      __paywallShown = true;
      try {
        setTimeout(() => onBellClick?.(), 0); // abre campanita
        Swal.fire({
          icon: 'info',
          title: 'Suscripción requerida',
          html: 'Pulsa la campanita <b>🔔</b> para activar tu suscripción.',
          customClass: { popup: 'gastos', confirmButton: 'btn-gastos' },
          buttonsStyling: false
        });
      } catch {}
    }
    return null;
  }

  if (!res.ok) {
    console.warn('fetchJSON fallo', url, res.status);
    return null;
  }

  const ctype = (res.headers.get('content-type') || '').toLowerCase();
  return ctype.includes('application/json') ? res.json() : res.text();
}

// =============================
// LOGIN / REGISTRO + avisos trial
// =============================

// Normaliza email: exige correo completo en login (no “usuario” suelto)
function normalizarEmailLogin(valor) {
  const v = String(valor || "").trim().toLowerCase();
  if (!v) return "";
  if (v.includes("@")) return v; // ya es correo
  Swal.fire({
    icon: "info",
    title: "Escribe tu correo completo",
    text: "Incluye @gmail.com, @hotmail.com, etc.",
  });
  return "";
}

// Lógica de login con mensajes de trial/paid (corregida)
// ⛳ pega esta versión (clave: early-return cuando needs_subscription)
async function doLogin(email, password) {
  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const text = await res.text(); let data = {}; try { data = JSON.parse(text); } catch {}
    if (!res.ok) {
      const msg = data?.error || `Error ${res.status}`;
      Swal.fire({ icon:'error', title:'No pudimos iniciar sesión', text: msg });
      return;
    }

    // sesión ok
    if (typeof _marcarSesion === 'function') _marcarSesion(true); else window.__sessionOK = true;
    const usuario = { id:data.id, email:data.email, nombre:data.nombre || data.email };
    try { sessionStorage.setItem('usuario', JSON.stringify(usuario)); } catch {}

    // 🔔 siempre deja lista la campanita
    const bell = document.getElementById('btn-suscribirme');
    if (bell) {
      bell.style.display = 'inline-flex';
      bell.replaceWith(bell.cloneNode(true));
      document.getElementById('btn-suscribirme').addEventListener('click', onBellClick, { passive:true });
    }

    // 🚧 PAYWALL: NO mostrar zona privada ni iniciar datos si falta suscripción
    if (data.needs_subscription) {
      window.__paywall = true;
      await Swal.fire({
        icon:'info',
        title:'Suscripción requerida',
        text:'Tu prueba terminó o tu suscripción está inactiva. Actívala para continuar.',
        showCancelButton:true,
        confirmButtonText:'Suscribirme',
        cancelButtonText:'Luego'
      }).then(r => { if (r.isConfirmed) onBellClick(); });

      // UI básica sin pedir datos (evita la lluvia de 403)
      document.getElementById('seccion-login')?.classList.add('oculto');
      document.getElementById('zona-privada')?.style && (document.getElementById('zona-privada').style.display='block');
      mostrarPaywallSuscripcion();
      return; // 👈 CLAVE
    }

    // Mensajitos normales…
    if (data.plan === 'trial' && typeof data.days_left === 'number') {
      const d = data.days_left;
      await Swal.fire({
        icon: d<=3 ? 'warning' : 'info',
        title: d<=3 ? '⚠️ Tu prueba está por terminar' : '🎉 Prueba gratuita activa',
        text: `Te quedan ${d} día${d!==1?'s':''}.`
      });
    } else if (data.plan === 'paid' && data.is_active) {
      await Swal.fire({ icon:'success', title:'¡Gracias por suscribirte! 💜', text:'Acceso activo.' });
    }

    // ✅ Ahora sí: mostrar app y cargar datos
    await mostrarAppYcargar();

  } catch (err) {
    console.error('Login error:', err);
    Swal.fire({ icon:'error', title:'Ups', text:'Error inesperado iniciando sesión.' });
  }
}

// UI paywall suavecita
function mostrarPaywallSuscripcion() {
  Swal.fire({
    icon:'info',
    title:'Suscripción pendiente',
    html:'Pulsa la campanita <b>🔔</b> para activar tu suscripción y habilitar tus datos.',
    confirmButtonText:'Entendido'
  });
  // si quieres ocultar secciones que requieren datos:
  document.querySelectorAll('[data-requiere-suscripcion]').forEach(el => el.classList.add('oculto'));
}

(function handleCheckoutReturn(){
  const url = new URL(location.href);
  const chk = url.searchParams.get('checkout');
  const sid = url.searchParams.get('session_id');
  if (chk !== 'success' || !sid) return;

  window.__waitingStripeVerify = true;  // pausa modales/paywall

  const clean = () => {
    url.searchParams.delete('checkout');
    url.searchParams.delete('session_id');
    history.replaceState({}, '', url.pathname + (url.search ? '?' + url.search : '') + url.hash);
    window.__waitingStripeVerify = false;
    window.__paywall = false;
    __paywallShown = false;
  };

  (async () => {
    try {
      await fetch(`/checkout_verify?session_id=${encodeURIComponent(sid)}`, {credentials:'same-origin'});
      // por si Stripe cierra ciclo unos segundos después
      await fetch('/billing_sync', { method:'POST', credentials:'same-origin' });

      const st = await fetch('/billing_status', {credentials:'same-origin'}).then(r=>r.json()).catch(()=>null);

      // si ya está activo, mostramos *solo* éxito y NO paywall
      if (st?.plan === 'paid' && st?.is_active) {
        if (!window.__modalGate) {
          window.__modalGate = true;
          await Swal.fire({
            icon:'success',
            title:'¡Suscripción activada! 💜',
            text:'Tu acceso completo ya está disponible.',
            customClass:{ popup:'gastos', confirmButton:'btn-gastos' },
            buttonsStyling:false
          });
          window.__modalGate = false;
        }
        window.__paywallShown = true;  // evita que otro trozo lo muestre
      }
    } finally {
      clean();
    }
  })();
})();

// === Listeners de formularios ===// LOGIN
// ¿Olvidaste tu contraseña? (se cablea una sola vez)
(function wireForgotLink(){
  const link = document.getElementById('forgot-link');
  if (!link) {
    document.addEventListener('DOMContentLoaded', wireForgotLink, { once: true });
    return;
  }

  link.addEventListener('click', async (e) => {
    e.preventDefault();

    const { value: email } = await Swal.fire({
      icon: 'question',
      title: 'Restablecer contraseña',
      input: 'email',
      inputLabel: 'Escribe tu correo',
      inputPlaceholder: 'tu@correo.com',
      showCancelButton: true,
      confirmButtonText: 'Enviar enlace',
      cancelButtonText: 'Cancelar',
      customClass: { popup:'gastos', confirmButton:'btn-gastos', cancelButton:'btn-gastos-sec' },
      buttonsStyling: false,
      inputValidator: v => (!v ? 'Ingresa tu correo' : undefined)
    });
    if (!email) return;

    try {
      const r = await fetch('/forgot_password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email })
      });

      // Siempre respondemos “ok” para no revelar si existe o no
      await r.json().catch(() => ({}));

      await Swal.fire({
        icon: 'info',
        title: 'Si el correo existe…',
        text: 'Te enviamos un enlace para restablecer la contraseña.',
        customClass:{ popup:'gastos', confirmButton:'btn-gastos' },
        buttonsStyling:false
      });
    } catch {
      Swal.fire({
        icon:'error',
        title:'Ups',
        text:'No pudimos procesar tu solicitud. Intenta de nuevo.',
        customClass:{ popup:'gastos', confirmButton:'btn-gastos' },
        buttonsStyling:false
      });
    }
  });
})();

// Detecta el token en la URL y abre el modal de reset
(function openResetIfToken(){
  const q = new URLSearchParams(location.search);
  const tok = q.get('reset_token');
  if (!tok) return;

  // Pon el token en el input oculto del modal
  const hid = document.getElementById('reset-token');
  if (hid) hid.value = tok;

  // Abre tu modal (ajusta a cómo lo abres en tu UI)
  document.getElementById('modal-reset')?.classList.add('abierto');

  // Limpia la query para evitar reabrir al refrescar
  q.delete('reset_token');
  history.replaceState({}, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
})();

// Envío del formulario de nueva contraseña
(function wireResetForm(){
  const form = document.getElementById('form-reset');
  if (!form) { document.addEventListener('DOMContentLoaded', wireResetForm, { once:true }); return; }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = document.getElementById('reset-token')?.value?.trim();
    const pass  = document.getElementById('reset-password')?.value || '';

    if (!token) {
      Swal.fire({ icon:'error', title:'Token inválido', text:'Vuelve a solicitar el enlace.' });
      return;
    }
    if (pass.length < 8) {
      Swal.fire({ icon:'info', title:'Contraseña muy corta', text:'Mínimo 8 caracteres.' });
      return;
    }

    try {
      const r = await fetch('/reset_password', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, password: pass })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.ok === false) throw new Error(data.error || `HTTP ${r.status}`);

      await Swal.fire({ icon:'success', title:'¡Contraseña actualizada!' });
      document.getElementById('modal-reset')?.classList.remove('abierto');
      // Enfoca el login
      document.getElementById('seccion-login')?.scrollIntoView({ behavior:'smooth' });
    } catch (err) {
      Swal.fire({ icon:'error', title:'No se pudo cambiar', text:String(err?.message||err) });
    }
  });
})();

// === Reset de contraseña con SweetAlert2 (detecta ?reset_token=...) ===
function showResetPasswordDialog(token) {
  if (!token) return;

  Swal.fire({
    icon: 'question',
    title: 'Restablecer contraseña',
    html: `
      <input id="rp1" type="password" class="swal2-input" placeholder="Nueva contraseña (min 8)">
      <input id="rp2" type="password" class="swal2-input" placeholder="Repite la nueva contraseña">
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Guardar',
    cancelButtonText: 'Cancelar',
    preConfirm: () => {
      const p1 = (document.getElementById('rp1')?.value || '').trim();
      const p2 = (document.getElementById('rp2')?.value || '').trim();
      if (p1.length < 8) {
        Swal.showValidationMessage('La contraseña debe tener al menos 8 caracteres');
        return false;
      }
      if (p1 !== p2) {
        Swal.showValidationMessage('Las contraseñas no coinciden');
        return false;
      }
      return p1; // devuelve la contraseña válida
    }
  }).then(async (res) => {
    if (!res.isConfirmed) return;
    const password = res.value;

    try {
      const r = await fetch('/reset_password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });
      const data = await r.json().catch(() => ({}));

      if (!r.ok || data.ok === false) {
        const msg = data?.error || `Error ${r.status}`;
        await Swal.fire('No se pudo cambiar', msg, 'error');
        return;
      }

      await Swal.fire('Listo ✨', 'Tu contraseña fue actualizada. Inicia sesión de nuevo.', 'success');

      // Limpia el token de la URL para que no se repita el modal
      const url = new URL(location.href);
      url.searchParams.delete('reset_token');
      history.replaceState({}, '', url.pathname + (url.search ? '?' + url.search : '') + url.hash);

      // Muestra pantalla de login
      try { mostrarPantallaLogin?.(); } catch {}
    } catch (e) {
      await Swal.fire('Ups', 'Hubo un problema guardando tu contraseña', 'error');
    }
  });
}

(function openResetIfToken(){
  const url = new URL(location.href);
  const token = url.searchParams.get('reset_token');
  if (token) {
    showResetPasswordDialog(token);
  }
})();

(function wireLoginForm(){
  const form = document.getElementById('form-login');
  if (!form) { document.addEventListener('DOMContentLoaded', wireLoginForm, { once:true }); return; }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('login-usuario');
    const passInput  = document.getElementById('login-password');
    let email = normalizarEmailLogin(emailInput?.value);
    const password = String(passInput?.value || "");
    if (!email || !password) return;
    await doLogin(email, password);
  });
})();

// === REGISTRO (único, unificado y anti-doble-submit) ===
(function wireRegistroFormUnico(){
  const form = document.getElementById('form-registro');
  if (!form) { document.addEventListener('DOMContentLoaded', wireRegistroFormUnico, { once:true }); return; }

  // Evita agregar más de un listener
  form.replaceWith(form.cloneNode(true));
  const f = document.getElementById('form-registro');

  f.addEventListener('submit', async (e) => {
    e.preventDefault();

    // anti-doble submit (por si el usuario hace doble click)
    if (f.dataset.busy === '1') return;
    f.dataset.busy = '1';
    const release = () => { delete f.dataset.busy; };

    // Toma de campos
    const nombre   = document.getElementById('registro-nombre')?.value?.trim() || "";
    const usuario  = document.getElementById('registro-user')?.value?.trim().toLowerCase() || "";
    const dominio  = document.getElementById('registro-dominio')?.value || "@gmail.com";
    const pass1    = document.getElementById('registro-password')?.value || "";
    const pass2    = document.getElementById('registro-password2')?.value || "";

    // Email final
    const email = usuario.includes("@") ? usuario : `${usuario}${dominio}`;

    // Validaciones de cliente
    if (!usuario || !pass1) {
      release();
      Swal.fire({ icon:'info', title:'Falta información', text:'Completa usuario y contraseña.' });
      return;
    }
    if (pass1 !== pass2) {
      release();
      Swal.fire({ icon:'info', title:'Las contraseñas no coinciden' });
      return;
    }
    // Mismo criterio que el backend: 8+, 1 mayúscula, 1 minúscula, 1 número (símbolos OPCIONALES)
    const re = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/;
    if (!re.test(pass1)) {
      release();
      Swal.fire({
        icon:'info',
        title:'Contraseña no válida',
        text:'Mínimo 8 caracteres e incluye 1 mayúscula, 1 minúscula y 1 número.'
      });
      return;
    }

    // Llamada al backend
    try {
      const res  = await fetch('/registro', {
        method : 'POST',
        headers: { 'Content-Type':'application/json' },
        body   : JSON.stringify({ nombre, email, password: pass1 })
      });

      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch {}

      // ✅ Éxito SOLO si es 2xx y ok:true
      if (res.ok && data?.ok === true) {
        await Swal.fire({
          icon:'success',
          title:'🎉 ¡Cuenta creada!',
          text :'Tu prueba gratuita ya comenzó.',
          confirmButtonText:'Entrar'
        });

        // El backend ya creó la sesión → marca y entra
        if (typeof _marcarSesion === 'function') _marcarSesion(true); else window.__sessionOK = true;
        try {
          sessionStorage.setItem('usuario', JSON.stringify({
            id: data.id, email: data.email, nombre: data.nombre || data.email
          }));
        } catch {}

        // Muestra la app y carga datos
        await (window.mostrarAppYcargar?.() || Promise.resolve());

        // Oculta vistas de registro/login
        document.getElementById('seccion-login')?.classList.add('oculto');
        document.getElementById('seccion-registro')?.classList.add('oculto');
        document.getElementById('usuario')?.setAttribute('style','display:none;');
        document.getElementById('zona-privada')?.style && (document.getElementById('zona-privada').style.display='block');
        if (typeof enforceAuthView === 'function') enforceAuthView();

        f.reset();
        release();
        return; // 👈 importantísimo: no caer al bloque de error
      }

      // ❌ Cualquier otra cosa es error
      const msg = data?.error || `Error ${res.status}`;
      release();
      Swal.fire({ icon:'error', title:'No pudimos registrar', text: msg });

    } catch (err) {
      console.error('Registro error:', err);
      release();
      Swal.fire({ icon:'error', title:'Ups', text:'Error inesperado creando la cuenta.' });
    }
  }, { once:true });
})();

// Detecta ?reset_token=... en la URL y abre modal para cambiar la clave
(function handlePasswordResetToken(){
  const url = new URL(location.href);
  const token = url.searchParams.get('reset_token');
  if (!token) return;

  // Limpia la URL al final pase lo que pase
  const cleanURL = () => {
    url.searchParams.delete('reset_token');
    history.replaceState({}, '', url.pathname + (url.search ? '?' + url.search : '') + url.hash);
  };

  (async () => {
    // 1) verificación rápida del token
    try {
      const ok = await fetch(`/password_reset_verify?token=${encodeURIComponent(token)}`)
        .then(r => r.ok);
      if (!ok) {
        await Swal.fire({
          icon:'error',
          title:'Enlace inválido o vencido',
          text:'Solicita un nuevo enlace desde "¿Olvidaste tu contraseña?"'
        });
        cleanURL();
        return;
      }
    } catch {
      cleanURL();
      return;
    }

    // 2) pedir nueva contraseña
    const { value: pass1 } = await Swal.fire({
      icon:'question',
      title:'Nueva contraseña',
      input:'password',
      inputPlaceholder:'Mínimo 6 caracteres',
      inputAttributes:{ minlength: 6 },
      showCancelButton:true,
      confirmButtonText:'Continuar',
      cancelButtonText:'Cancelar',
      customClass:{ popup:'gastos', confirmButton:'btn-gastos', cancelButton:'btn-gastos-sec' },
      buttonsStyling:false,
      inputValidator: v => !v || v.length < 6 ? 'Mínimo 6 caracteres' : undefined
    });
    if (!pass1) { cleanURL(); return; }

    const { value: pass2 } = await Swal.fire({
      icon:'question',
      title:'Confirmar contraseña',
      input:'password',
      inputPlaceholder:'Repite tu nueva contraseña',
      showCancelButton:true,
      confirmButtonText:'Cambiar',
      cancelButtonText:'Cancelar',
      customClass:{ popup:'gastos', confirmButton:'btn-gastos', cancelButton:'btn-gastos-sec' },
      buttonsStyling:false,
      inputValidator: v => v !== pass1 ? 'No coincide' : undefined
    });
    if (!pass2) { cleanURL(); return; }

    // 3) confirmar en el backend
    try {
      const r = await fetch('/password_reset_confirm', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        credentials:'same-origin',
        body: JSON.stringify({ token, new_password: pass1 })
      });
      const j = await r.json().catch(()=> ({}));
      if (!r.ok || j.ok === false) throw new Error(j.error || 'No se pudo cambiar la contraseña');

      await Swal.fire({
        icon:'success',
        title:'¡Listo!',
        text:'Tu contraseña fue actualizada. Inicia sesión con tu nueva clave.',
        customClass:{ popup:'gastos', confirmButton:'btn-gastos' },
        buttonsStyling:false
      });

      // muestra la pantalla de login
      try { mostrarPantallaLogin?.(); } catch {}
    } catch (err) {
      await Swal.fire({
        icon:'error',
        title:'No se pudo cambiar',
        text: String(err?.message || 'Intenta de nuevo con un nuevo enlace.')
      });
    } finally {
      cleanURL();
    }
  })();
})();

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
// ACTUALIZAR SELECTS DE TODAS LAS VISTAS (con FILTROS)
// ==============================
function actualizarSelectsVistas(vista = "todos") {
  console.log("DEBUG: actualizarSelectsVistas()", vista);

  // ==========================
  // INGRESOS
  // ==========================
  if (vista === "todos" || vista === "ingresos") {
    const selectIngresos       = document.getElementById("fuente-ingreso");
    const filtroFuenteIngreso  = document.getElementById("filtro-fuente-ingreso");
    const listaFuentes = (configFuentesIngresos || []);
    if (selectIngresos)
      rellenarSelectTextoConDataId(selectIngresos,      listaFuentes, "Selecciona fuente", 'f_');
    if (filtroFuenteIngreso)
      rellenarSelectTextoConDataId(filtroFuenteIngreso, listaFuentes, "Todas",            'f_');
  }

  // ==========================
  // BILLS
  // ==========================
  if (vista === "todos" || vista === "bills") {
    const selectTipoBill = document.getElementById("bill-tipo");
    const filtroTipoBill = document.getElementById("filtro-tipo-bill");
    const listaBillsTexto = (configBills || []).map(b => b.nombre);

    if (selectTipoBill) {
      rellenarSelectTextoConDataId(selectTipoBill, listaBillsTexto, "Selecciona tipo");
    }
    if (filtroTipoBill) {
      rellenarSelectTextoConDataId(filtroTipoBill, listaBillsTexto, "Todos");
    }

    // Personas (checkboxes) en BILLS
    const personasContainer = document.getElementById("bill-personas-lista");
    if (personasContainer) {
      personasContainer.innerHTML = "";
      (configPersonas || []).forEach(persona => {
        const idSeguro = String(persona.nombre || "")
          .replace(/\s+/g, "-")
          .replace(/[^\w-]/g, "");
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

  // ==========================
  // EGRESOS
  // ==========================
  if (vista === "todos" || vista === "egresos") {
    llenarSelectsEgresos(); // helper con data-id
  }

  // ==========================
  // PAGOS
  // ==========================
  if (vista === "todos" || vista === "pagos") {
  rellenarSelectsPagos();
}

}

// =============================
// LLENAR SELECT DE FUENTES (para el modal de tipografías) - FUERA de la función de arriba
// =============================
window.W = window.W || {};

// Tipografías del modal (RENOMBRADA para no chocar con Ingresos)
function llenarSelectFuentesTipografia() {
  const fuentesTitulo = document.getElementById("conf-fuente-titulo");
  const fuentesCuerpo = document.getElementById("conf-fuente-cuerpo");

  if (W.configTemporal?.fuentes) {
    if (fuentesTitulo) fuentesTitulo.value = W.configTemporal.fuentes.titulo || "Arial";
    if (fuentesCuerpo)  fuentesCuerpo.value = W.configTemporal.fuentes.secundario || "Arial";
  }
}

// Alias de compatibilidad: si en algún lado llaman a llenarSelectFuentes(),
// lo redirigimos a la función nueva sin cambiar más código.
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

  // 🧠 Guardar selecciones previas
  const prevCat   = document.getElementById('categoria-egreso')?.value || '';
  const prevMedio = document.getElementById('medio-egreso')?.value || '';
  const prevFCat  = document.getElementById('filtro-categoria-egreso')?.value || '';
  const prevFMed  = document.getElementById('filtro-medio-egreso')?.value || '';

  // Usa SIEMPRE las fuentes canónicas (elige UNA: window.config... o config...).
  const cats   = Array.isArray(window.configEgresosCategorias) ? window.configEgresosCategorias : [];
  const medios = Array.isArray(window.configMediosPago)        ? window.configMediosPago        : [];

  // ========== Categorías ==========
  categoriasContenedor.innerHTML = "";
  cats.forEach((cat, i) => {
    const subchips = (cat.subcategorias || []).map((sub, j) => `
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
  medios.forEach((medio, i) => {
    const subchips = (medio.submedios || []).map((sub, j) => `
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

  // 👇 Refresca selects (con data-id c_/m_)
  try { llenarSelectsEgresos(); } catch {}

  // 🔁 Restaura selecciones previas si siguen vigentes
  const selCat = document.getElementById('categoria-egreso');
  if (selCat && Array.from(selCat.options).some(o => o.value === prevCat)) selCat.value = prevCat;

  const selMed = document.getElementById('medio-egreso');
  if (selMed && Array.from(selMed.options).some(o => o.value === prevMedio)) selMed.value = prevMedio;

  const fCat = document.getElementById('filtro-categoria-egreso');
  if (fCat && Array.from(fCat.options).some(o => o.value === prevFCat)) fCat.value = prevFCat;

  const fMed = document.getElementById('filtro-medio-egreso');
  if (fMed && Array.from(fMed.options).some(o => o.value === prevFMed)) fMed.value = prevFMed;

  // Si Pagos depende de esto:
  try { renderizarConfigPagos(); } catch {}
}

function llenarSelectsEgresos(){
  const selCat   = document.getElementById('categoria-egreso');
  const selMedio = document.getElementById('medio-egreso');

  const fCat     = document.getElementById('filtro-categoria-egreso');
  const fMedio   = document.getElementById('filtro-medio-egreso'); // si no existe, no pasa nada

  // 1) Lee desde tu configuración actual
  const cats   = (Array.isArray(window.configEgresosCategorias) ? window.configEgresosCategorias : [])
                  .map(c => typeof c === 'string' ? c : (c.categoria || c.nombre || c.texto || ''));
  const medios = (Array.isArray(window.configMediosPago) ? window.configMediosPago : [])
                  .map(m => typeof m === 'string' ? m : (m.medio || m.nombre || m.texto || ''));

  // 2) Rellena selects del formulario (con data-id y placeholder)
  if (selCat)   rellenarSelectTextoConDataId(selCat,   cats,   'Seleccionar',       'c_');
  if (selMedio) rellenarSelectTextoConDataId(selMedio, medios, 'Seleccionar medio', 'm_');

  // 3) Rellena filtros (si existen)
  if (fCat)   rellenarSelectTextoConDataId(fCat,   cats,   'Todas', 'c_');
  if (fMedio) rellenarSelectTextoConDataId(fMedio, medios, 'Todos', 'm_');
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

// 🔹 Helper único para pintar la barra siempre igual (solo el apodo)
function pintarApodoEnBarra(apodo) {
  const barra = document.getElementById('nombre-usuario-barra');
  if (!barra) return;
  const limpio = (apodo || '').trim();
  barra.textContent = limpio;     // ← SIN "Hola, " aquí
  barra.dataset.apodo = limpio;
}

// Abrir/cerrar modal
function abrirModalPerfil() {
  ensurePerfilModal();
  const modal = document.getElementById("modal-perfil");

  // Datos cargados del endpoint /cargar_perfil y guardados en memoria
  const perfil = JSON.parse(sessionStorage.getItem("perfil") || "{}");

  document.getElementById("perfil-apodo").value    = perfil?.apodo    || "";
  document.getElementById("perfil-telefono").value = perfil?.telefono || "";

  modal.classList.add("abierto");
}

function cerrarModalPerfil() {
  const modal = document.getElementById("modal-perfil");
  if (modal) modal.classList.remove("abierto");
}

// Aplica perfil en UI (barra + popover + sesión opcional)
function aplicarPerfilEnUI({ apodo, telefono }) {
  pintarApodoEnBarra(apodo); // 👈 unificado

  const cabecera = document.getElementById("usuario-nombre"); // si lo usas en otra parte
  if (cabecera) cabecera.textContent = (apodo || "");

  // Teléfono en popover
  if (typeof updateTelefonoPopover === "function") {
    updateTelefonoPopover((telefono || "").trim());
  }
}

// ✅ 1) Guardar perfil
async function guardarPerfil() {
  const apodo    = (document.getElementById("perfil-apodo")?.value || "").trim();
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
    // (opcional) ping
    await fetch("/cargar_perfil").catch(()=>{});

    const r = await fetch("/guardar_perfil", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apodo, telefono: telForm })
    });
    if (!r.ok) throw new Error("No se pudo guardar");

    // ✅ Actualiza UI y cache
    aplicarPerfilEnUI({ apodo, telefono: telForm });
    sessionStorage.setItem("perfil", JSON.stringify({ apodo, telefono: telForm }));

    const ses = JSON.parse(sessionStorage.getItem("usuario") || "{}");
    ses.apodo = apodo;
    sessionStorage.setItem("usuario", JSON.stringify(ses));
    if (typeof enforceAuthView === "function") enforceAuthView();

    window.W = window.W || {};
    W.configTemporal = W.configTemporal || {};
    W.configTemporal.telefono_dueno = telForm;

    if (W.Swal) {
      Swal.fire({ toast:true, position:'top-end', icon:'success',
        title:'✅ Perfil actualizado', showConfirmButton:false, timer:1800 });
    }
    cerrarModalPerfil();

    // (opcional) refrescar desde BD
    await cargarPerfilEnUI();
  } catch (e) {
    console.error(e);
    if (W.Swal) {
      Swal.fire({ icon:'error', title:'❌ Error', text:'No se pudo guardar el perfil.' });
    }
  }
}

// Delegación de eventos
document.addEventListener("click", (e) => {
  if (e.target.closest("#btn-perfil")) {
    abrirModalPerfil();
  } else if (e.target.id === "perfil-guardar") {
    guardarPerfil();
  } else if (e.target.id === "perfil-cerrar") {
    cerrarModalPerfil();
  } else if (e.target.id === "modal-perfil") {
    cerrarModalPerfil();
  }
    else if (e.target.closest("#btn-mini-disponible")) {
    try { refrescarDisponibleGlobal(); } catch {}

    const panel = document.querySelector("[data-disponible-panel]");
    if (panel) {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
      panel.classList.add("flash");
      setTimeout(() => panel.classList.remove("flash"), 800);
    }
  }

});

// ✅ 2) Cargar perfil AL INICIO (usa el helper y NO muestra email)
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

      // reflejar apodo en sessionStorage.usuario
      const ses = JSON.parse(sessionStorage.getItem("usuario") || "{}");
      if (data.apodo) {
        ses.apodo = data.apodo.trim();
        sessionStorage.setItem("usuario", JSON.stringify(ses));
      }

      // pintar barra (solo apodo)
      pintarApodoEnBarra(data.apodo);

      // Teléfono en popover
      if (typeof updateTelefonoPopover === "function") {
        updateTelefonoPopover((data.telefono || "").trim());
      }

      // espejo para lógica que usa configTemporal
      window.W = window.W || {};
      W.configTemporal = W.configTemporal || {};
      W.configTemporal.telefono_dueno = data.telefono || "";

      return;
    }
  } catch {}

  // fallback: cachea algo, pero NO lo muestres en barra
  const ses = JSON.parse(sessionStorage.getItem("usuario") || "{}");
  const fallbackApodo = ses?.email || "";
  sessionStorage.setItem("perfil", JSON.stringify({ apodo: fallbackApodo, telefono: "" }));
  pintarApodoEnBarra(""); // 👈 barra vacía si no hay apodo
  aplicarPerfilEnUI({ apodo: "", telefono: "" });
}

if (sessionStorage.getItem("usuario")) {
  cargarPerfilAlInicio();
}

// ✅ 3) cargarPerfilEnUI (usa helper y cachea)
async function cargarPerfilEnUI() {
  if (window.__paywall || window.__waitingStripeVerify) return;
  if (!window.__sessionOK && !(typeof haySesion === 'function' && haySesion())) return;

  try {
    const perfil = await fetchJSON('/cargar_perfil', { method: 'GET' }, { silent401: true });
    if (!perfil) return;

    // cache
    try { sessionStorage.setItem('perfil', JSON.stringify(perfil)); } catch {}

    // barra + popover
    pintarApodoEnBarra(perfil.apodo);
    if (typeof updateTelefonoPopover === 'function') {
      updateTelefonoPopover(perfil.telefono || '');
    }

    // inputs del modal
    const inpApodo = document.getElementById('perfil-apodo');
    if (inpApodo) inpApodo.value = perfil.apodo || '';
    const inpTelef = document.getElementById('perfil-telefono');
    if (inpTelef)  inpTelef.value = perfil.telefono || '';

    // espejo config temporal
    window.W = window.W || {};
    W.configTemporal = W.configTemporal || {};
    W.configTemporal.telefono_dueno = perfil.telefono || '';
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

  // --- Limpia UI del login (idempotente) ---
function limpiarLoginUI() {
  const form = document.getElementById('form-login');
  const u = document.getElementById('login-usuario');
  const p = document.getElementById('login-password');

  // Resetea el form
  try { form?.reset(); } catch {}

  // Fuerza limpieza por si el navegador insiste con autofill
  if (u) {
    u.value = '';
    u.setAttribute('autocomplete', 'off');
  }
  if (p) {
    p.type = 'password'; // por si quedó el "ojo" en text
    p.value = '';
    p.setAttribute('autocomplete', 'new-password');
  }

  // Limpia clases de error si existen
  document.querySelectorAll('#form-login .is-invalid, #form-login .error')
    .forEach(n => n.classList.remove('is-invalid','error'));

  // Restablece icono del “ojo”, si lo usas
  document.querySelectorAll('#form-login .boton-ojo').forEach(btn => {
    const input = btn.previousElementSibling;
    if (input && input.type !== 'password') {
      input.type = 'password';
      btn.textContent = '👁️';
    }
  });

  // Foco al usuario
  setTimeout(() => { u?.focus(); }, 0);
}

 // Helper: mostrar SOLO la pantalla de login (sin parpadeos)
// 🔒 Cerrar sesión (versión anti-parpadeo)
// una sola vez arriba del archivo:
window.__netAbort = new AbortController(); // para cancelar fetches pendientes

function mostrarSoloLogin() {
  document.body.classList.add('state-logout');
  // oculta todo lo privado
  ['zona-privada','barra-superior','menu-vistas','seccion-usuario','usuario']
    .forEach(id => document.getElementById(id)?.classList.add('oculto'));
  // muestra solo login
  document.getElementById('seccion-login')?.classList.remove('oculto');
  document.getElementById('seccion-registro')?.classList.add('oculto');
}

// 🔒 Cerrar sesión (sin parpadeo)
async function cerrarSesion(e){
  e?.preventDefault?.();

  try {
    await fetch('/logout', { method:'POST', credentials:'include' });
  } catch {}

  // limpia flags locales
  try { sessionStorage.removeItem('usuario'); } catch {}
  window.__sessionOK = false;
  window.__paywall   = false;
  window.__waitingStripeVerify = false;

  // salgo de “modo app” para que QR/regalo reaparezcan afuera
 setInApp(false);

  // recarga “como primera vez”
  location.replace(location.pathname); // sin queries ni hash
}

window.cerrarSesion = cerrarSesion;


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
    setInApp(true);   // ← marca “estoy dentro”

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

// =====================================================
// ZONA PRIVADA / LOGIN  SPLASH
// =====================================================

// controla una sola inicialización post-login por sesión de app
let __privadaInit = false;

// 1) Mostrar zona privada
function mostrarZonaPrivada(usuario = null) {
  if (!window.__sessionOK) { console.debug('[guard] Ignoro mostrarZonaPrivada: no hay sesión'); return; }
  if (typeof _marcarSesion === 'function') _marcarSesion(true);
  document.body.classList.add('auth');

  setInApp(true);

  // datos de usuario (de argumento o de sessionStorage)
  let u = usuario;
  if (!u) { try { u = JSON.parse(sessionStorage.getItem('usuario') || '{}'); } catch { u = {}; } }

  // ocultar splash + login
  const byId = (id)=>document.getElementById(id);
  byId('splash')?.setAttribute('style','display:none;');
  byId('usuario')?.setAttribute('style','display:none;');

  // mostrar zona privada
  byId('zona-privada')?.setAttribute('style','display:block;');
  byId('barra-superior')?.setAttribute('style','display:flex;');
  byId('menu-vistas')?.setAttribute('style','display:flex;');

  const contenido = byId('contenido-app');
  if (contenido) {
    contenido.style.display    = 'block';
    contenido.style.visibility = 'visible';
    contenido.style.opacity    = '1';
  }

  // ocultar todas las vistas (no abrimos ninguna)
document.querySelectorAll('.vista').forEach(v => v.style.display = 'none');

const orden = (window.configActual?.vistas?.length
  ? window.configActual.vistas
  : ['ingresos','bills','egresos','pagos']);
try { window.ensureMenuVistas?.(orden); } catch {}

// ❌ antes: const primera = orden[0] ... mostrarVista(primera)
// ❌ antes: marcar botón activo
// ✅ ahora: dejamos el tablero en blanco; el usuario elige la vista

// enganchar botón cerrar (sin duplicar y evitando submit)
const btnSalir = byId('cerrar-sesion-barra');
if (btnSalir) {
  btnSalir.type = 'button';
  btnSalir.onclick = window.cerrarSesion || null;
}

// cargas post-login una sola vez
if (!__privadaInit) {
  __privadaInit = true;
  Promise.resolve(window.cargarConfigYAplicar?.())
    .finally(() => window.cargarPerfilEnUI?.()); // esto pintará el apodo
}
}

// 2) Mostrar vista de login/registro
function mostrarVistaUsuario() {
  const byId = (id)=>document.getElementById(id);

  document.body.classList.remove('auth'); // CSS ocultará lo privado
  byId('splash')?.setAttribute('style','display:none;');

  // ocultar privado
  byId('zona-privada')?.setAttribute('style','display:none;');
  byId('barra-superior')?.setAttribute('style','display:none;');
  byId('menu-vistas')?.setAttribute('style','display:none;');
  document.querySelectorAll('.vista').forEach(v => v.style.display = 'none');

  // mostrar contenedor y secciones de usuario
  const contenido = byId('contenido-app');
  if (contenido) {
    contenido.style.display    = 'block';
    contenido.style.visibility = 'visible';
    contenido.style.opacity    = '1';
  }
  byId('usuario')?.setAttribute('style','display:block;');
  byId('seccion-usuario')?.setAttribute('style','display:block;');
  byId('seccion-login')?.setAttribute('style','display:block;');
  byId('seccion-registro')?.setAttribute('style','display:block;');

  // limpiar “activo” en menú
  byId('menu-vistas')?.querySelectorAll('button[data-vista]')?.forEach(b => b.classList.remove('is-active'));
}

// 3) Exponer globales (clave)
window.mostrarZonaPrivada  = mostrarZonaPrivada;
window.mostrarVistaUsuario = window.mostrarVistaUsuario || mostrarVistaUsuario;

// 4) (Opcional) asegurar botón cerrar si el DOM ya existe
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('cerrar-sesion-barra');
  if (btn) { btn.type = 'button'; btn.onclick = window.cerrarSesion || btn.onclick; }
}, { once:true });
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

// =============================
// MANEJO DE INGRESOS (con id opaco y filtros robustos)
// =============================
document.addEventListener("DOMContentLoaded", () => {
  // UI
  const form               = document.getElementById("form-ingresos");
  const fechaEl            = document.getElementById("fecha-ingreso");
  const montoEl            = document.getElementById("monto-ingreso");
  const notaEl             = document.getElementById("nota-ingreso");
  const selectFuente       = document.getElementById("fuente-ingreso");
  const filtroMesIngreso   = document.getElementById("filtro-mes-ingreso");
  const filtroFuenteIngreso= document.getElementById("filtro-fuente-ingreso");
  const lista              = document.getElementById("lista-ingresos");

  // Estado global
  window.W = window.W || {};
  W.ingresos = Array.isArray(W.ingresos) ? W.ingresos : [];

  // =============== Helpers base ===============
  function slug(s){
    const txt = String(s||"")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .trim().replace(/\s+/g," ");
    try {
      return txt.replace(/[\p{Extended_Pictographic}\p{Emoji}\p{Emoji_Presentation}]/gu,"")
                .toLowerCase();
    } catch {
      return txt.replace(/[^A-Za-z0-9 ]/g,"").toLowerCase();
    }
  }
  function getIngresosBase(){ return Array.isArray(W.ingresos) ? W.ingresos : []; }
  function getIngresoById(id){ return getIngresosBase().find(x => String(x.id)===String(id)); }
  const byFechaDesc = (a,b)=> String(b?.fecha||"").slice(0,10).localeCompare(String(a?.fecha||"").slice(0,10));

  // =============== Rellenar selects desde config ===============
  function llenarSelectFuentesIngresosForm(){
    if (!selectFuente) return;
    // limpia
    selectFuente.innerHTML = `<option value="" disabled selected>Selecciona fuente</option>`;

    // fuentes pueden venir de configFuentesIngresos o configTemporal.ingresos_fuentes
    const fuentes =
      (Array.isArray(window.configFuentesIngresos) && window.configFuentesIngresos.length
        ? window.configFuentesIngresos
        : (Array.isArray(window.configTemporal?.ingresos_fuentes)
            ? window.configTemporal.ingresos_fuentes
            : [])
      );

    (fuentes || []).forEach(f => {
      // f puede ser objeto {nombre,id} o string
      const nombre = f?.nombre ?? f?.label ?? f?.texto ?? f ?? "";
      const opt = new Option(String(nombre), String(nombre));
      const fid = f?.id ?? f?.fuente_id;
      if (fid != null) opt.dataset.id = fid; // id opaco
      selectFuente.appendChild(opt);
    });
  }

  // =============== Filtro: construir opciones desde datos reales ===============
  function buildFiltroFuenteDesdeDatos(){
    if (!filtroFuenteIngreso) return;

    const data = getIngresosBase();

    // 1) agrupar por fuente_id si existe
    const porId = new Map(); // fuente_id -> { label, count, lastDate }
    data.forEach(i=>{
      const id = String(i.fuente_id ?? "").trim();
      if (!id) return;
      const label = String(i.fuente ?? "").trim() || id;
      const fecha = String(i.fecha ?? "");
      const prev  = porId.get(id);
      if (!prev) porId.set(id, { label, count:1, lastDate:fecha });
      else {
        prev.count += 1;
        if (fecha > prev.lastDate && label) prev.label = label;
        if (fecha > prev.lastDate)          prev.lastDate = fecha;
      }
    });

    filtroFuenteIngreso.innerHTML = `<option value="">Todas</option>`;

    if (porId.size){
      const items = Array.from(porId.entries()).sort((a,b)=> b[1].count - a[1].count);
      items.forEach(([id,meta])=>{
        const lbl = meta.label || id;
        const o = new Option(lbl, lbl);
        o.setAttribute('data-id', id);
        o.setAttribute('data-key', slug(lbl)); // backup
        filtroFuenteIngreso.appendChild(o);
      });
      return;
    }

    // 2) fallback por texto
    const porTxt = new Map(); // key -> { label, count, lastDate }
    data.forEach(i=>{
      const label = String(i.fuente ?? "").trim();
      if (!label) return;
      const key = slug(label);
      const fecha = String(i.fecha ?? "");
      const prev = porTxt.get(key);
      if (!prev) porTxt.set(key, { label, count:1, lastDate:fecha });
      else {
        prev.count += 1;
        if (fecha > prev.lastDate && label) prev.label = label;
        if (fecha > prev.lastDate)          prev.lastDate = fecha;
      }
    });

    Array.from(porTxt.entries())
      .sort((a,b)=> b[1].count - a[1].count)
      .forEach(([key,meta])=>{
        const o = new Option(meta.label || key, meta.label || key);
        o.setAttribute('data-key', key);
        filtroFuenteIngreso.appendChild(o);
      });
  }

  // =============== Cargar del servidor (fusiona) ===============
  async function cargarIngresos({ first=true } = {}){
    try{
      const data = await fetchJSON('/cargar_ingresos', { method:'GET' }, { silent401:true });
      const nuevos = Array.isArray(data) ? data : (data?.ingresos || []);

      // fusion simple por hash estable
      const clave = i => `${i.id ?? ''}|${i.fecha}|${i.monto}|${i.fuente}|${i.nota||''}`;
      const mapa = new Map(getIngresosBase().map(i => [clave(i), i]));
      (nuevos||[]).forEach(i => mapa.set(clave(i), i));
      W.ingresos = Array.from(mapa.values());

      // repoblar selects y filtros
      llenarSelectFuentesIngresosForm();
      buildFiltroFuenteDesdeDatos();

      if (first){
        filtroMesIngreso && (filtroMesIngreso.value="");
        filtroFuenteIngreso && (filtroFuenteIngreso.value="");
      }

      mostrarIngresos();
    }catch(err){
      console.info('No autenticado/err al cargar ingresos:', err?.message || err);
      // offline: al menos arma filtros desde lo que haya
      llenarSelectFuentesIngresosForm();
      buildFiltroFuenteDesdeDatos();
      mostrarIngresos();
    }
  }

  // =============== Wire filtros (una vez) ===============
  (function wireFiltros(){
    if (!lista) return;
    if (lista.dataset.wiredIngr === "1") return;
    const onChange = ()=> mostrarIngresos();
    filtroMesIngreso?.addEventListener('change',  onChange);
    filtroFuenteIngreso?.addEventListener('change', onChange);
    lista.dataset.wiredIngr = "1";
  })();

  // =============== Submit (alta/edición por ID) ===============
  if (form && !form.dataset.bound){
    form.dataset.bound = "1";
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();

      const fecha  = fechaEl?.value;
      const _m     = parseFloat(String(montoEl?.value ?? "0").replace(',','.'));
      const monto  = Number.isFinite(_m) ? _m : 0;
      const fuente = (selectFuente?.value || "").trim();
      const nota   = (notaEl?.value || "").trim();

      const opt    = selectFuente?.options?.[selectFuente.selectedIndex];
      const fuente_id = opt?.dataset?.id || opt?.getAttribute?.('data-id') || null;

      if (!fecha || !monto || !fuente){
        alert("Completa fecha, monto y fuente.");
        return;
      }

      // edición por id (si existe)
      const editId = form.dataset.editId;

      // alta/edición optimista
      let tempIndex = -1;
      if (editId){
        const idx = getIngresosBase().findIndex(x => String(x.id)===String(editId));
        if (idx >= 0){
          W.ingresos[idx] = { ...(W.ingresos[idx]||{}), fecha, monto, fuente, fuente_id, nota };
          tempIndex = idx;
        }
      }else{
        tempIndex = W.ingresos.push({ fecha, monto, fuente, fuente_id, nota }) - 1;
      }

      mostrarIngresos();

      // persistir
      try{
        const res = await fetch('/guardar_ingreso', {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ id: editId || undefined, fecha, monto, fuente, fuente_id, nota })
        });
        let data=null; try{ data = await res.json(); }catch{}
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

        const serverIngreso = data?.ingreso || data;
        if (serverIngreso && tempIndex>=0){
          W.ingresos[tempIndex] = serverIngreso;
        }

        buildFiltroFuenteDesdeDatos();
        mostrarIngresos();

        form.reset();
        delete form.dataset.editId;
        const btn = form.querySelector("button[type='submit']");
        if (btn) btn.textContent = "💾 Guardar Ingreso";
        W.toastOk?.("✅ Ingreso guardado correctamente");
      }catch(err){
        console.error("Error al guardar ingreso:", err);
        if (!editId && tempIndex>=0){
          // rollback alta
          W.ingresos.splice(tempIndex,1);
          mostrarIngresos();
        }
        W.toastErr?.("❌ No se pudo guardar el ingreso");
      }
    });
  }

  // =============== Pintar (filtro por mes + fuente_id/slug) ===============
  function mostrarIngresos(){
    if (!lista) return;
    lista.innerHTML = "";

    const base = getIngresosBase();

    const mesSel  = filtroMesIngreso?.value || "";
    const o       = filtroFuenteIngreso?.options?.[filtroFuenteIngreso.selectedIndex];
    const fIdSel  = (o?.getAttribute?.('data-id')  || "").trim();
    const fKeySel = (o?.getAttribute?.('data-key') || "").trim();
    const fTxtSel = (o?.value || "").trim();
    const fKeyTxt = slug(fTxtSel);

    const filtrados = base
      .map(i => ({ ingreso:i, id:i.id }))
      .filter(({ingreso})=>{
        const okMes = !mesSel || String(ingreso.fecha||"").slice(0,7) === mesSel;

        let okFuente = true;
        if (fIdSel || fKeySel || fTxtSel){
          const idIng  = String(ingreso.fuente_id || "").trim();
          const keyIng = slug(ingreso.fuente);
          if (fIdSel && idIng) okFuente = (idIng === fIdSel);
          else okFuente = (keyIng === (fKeySel || fKeyTxt));
        }
        return okMes && okFuente;
      });

    filtrados.sort((a,b)=> byFechaDesc(a.ingreso, b.ingreso));

    if (!filtrados.length){
      lista.innerHTML = `<p>🪙 No hay ingresos registrados aún.</p>`;
      actualizarResumenIngresos([]);
      actualizarGraficoIngresos({ labels:[], values:[] });
      return;
    }

    filtrados.forEach(({ ingreso, id })=>{
      const card = document.createElement("div");
      card.classList.add("card-datos");
      card.dataset.id = id;

      const notaHtml = (ingreso.nota && ingreso.nota.trim()) ? `<div>📝 ${ingreso.nota}</div>` : "";

      card.innerHTML = `
        <div class="card-header">
          📅 <strong>${formatoLegible(ingreso.fecha)}</strong> — 💰 <strong>$${Number(ingreso.monto||0).toFixed(2)}</strong>
        </div>
        <div class="card-body">
          <div>${ingreso.fuente || "Sin fuente"}</div>
          ${notaHtml}
        </div>
        <div class="card-actions">
          <button class="icon-btn" title="Editar"   onclick="editarIngresoId('${id}')">✏️</button>
          <button class="icon-btn danger" title="Eliminar" onclick="eliminarIngresoId('${id}')">🗑️</button>
        </div>
      `;
      lista.appendChild(card);
    });

    // resumen y gráfico simples (por fuente visible)
    const resumenPorFuente = filtrados.reduce((acc,{ingreso})=>{
      const f = ingreso.fuente || "Sin fuente";
      acc[f] = (acc[f]||0) + Number(ingreso.monto||0);
      return acc;
    },{});
    actualizarResumenIngresos(filtrados.map(x=>x.ingreso));
    actualizarGraficoIngresos({ labels:Object.keys(resumenPorFuente), values:Object.values(resumenPorFuente) });
  }
  W.mostrarIngresos = mostrarIngresos;

  // =============== Resumen (solo ingresos) ===============
  function actualizarResumenIngresos(listaFiltrada){
    const panel = document.getElementById("resumen-ingresos");
    if (!panel) return;

    const mesSel = filtroMesIngreso?.value || "";
    const nombreMes = (mesSel && mesSel.includes('-'))
      ? (()=>{ const [a,m]=mesSel.split('-'); const N=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]; return `${N[parseInt(m,10)-1]} ${a}`; })()
      : "todos los meses";

    const fuenteVis = filtroFuenteIngreso?.value || "";
    const total = listaFiltrada.reduce((acc,i)=>acc+Number(i.monto||0),0);

    panel.innerHTML = fuenteVis
      ? `🤑 Total de ingresos de "${fuenteVis}" en ${nombreMes}: $${total.toFixed(2)}`
      : `🤑 Total de ingresos en ${nombreMes}: $${total.toFixed(2)}`;
  }

  // =============== Gráfico simple ===============
  function actualizarGraficoIngresos(data){
    const canvas = document.getElementById('grafico-ingresos');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (W.graficoIngresos) W.graficoIngresos.destroy();
    W.graficoIngresos = new Chart(ctx, {
      type: 'bar',
      data: { labels: data.labels, datasets: [{ label: 'Ingresos por fuente', data: data.values }] },
      options: { responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true } } }
    });
  }

  // =============== Editar / Eliminar por ID ===============
  W.editarIngresoId = (id)=>{
    const i = getIngresoById(id);
    if (!i) return;

    // Asegura opciones actuales
    llenarSelectFuentesIngresosForm();

    // Set fuente en form: por fuente_id → slug → texto exacto
    if (selectFuente){
      let chosen=false;
      if (i.fuente_id){
        for (const opt of selectFuente.options){
          const oid = (opt.getAttribute?.('data-id') || opt.dataset?.id || "").trim();
          if (oid && oid === String(i.fuente_id).trim()){ opt.selected=true; chosen=true; break; }
        }
      }
      if (!chosen){
        const want = slug(i.fuente);
        for (const opt of selectFuente.options){
          if (slug(opt.value) === want){ opt.selected=true; chosen=true; break; }
        }
      }
      if (!chosen){
        for (const opt of selectFuente.options){
          if ((opt.value||"").trim() === String(i.fuente||"").trim()){ opt.selected=true; break; }
        }
      }
    }

    fechaEl.value = i.fecha || "";
    montoEl.value = Number(i.monto||0).toFixed(2);
    notaEl.value  = i.nota || "";

    form.dataset.editId = String(id);
    const btn = form.querySelector("button[type='submit']");
    if (btn) btn.textContent = "Actualizar Ingreso";

    form.scrollIntoView({ behavior:"smooth", block:"start" });
    setTimeout(()=> fechaEl?.focus({ preventScroll:true }), 250);
  };

  W.eliminarIngresoId = async (id)=>{
    const i = getIngresoById(id);
    if (!i) return;
    if (!confirm("¿Seguro que quieres eliminar este ingreso? 😱")) return;

    const idx = getIngresosBase().findIndex(x => String(x.id)===String(id));
    const backup = W.ingresos.splice(idx,1)[0];
    mostrarIngresos();

    try{
      const res = await fetch('/eliminar_ingreso', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ id })
      });
      let data=null; try{ data = await res.json(); }catch{}
      if (!res.ok || data?.ok===false) throw new Error(data?.error || `HTTP ${res.status}`);

      W.toastOk?.("🗑️ Ingreso eliminado");
      buildFiltroFuenteDesdeDatos();
      mostrarIngresos();
    }catch(err){
      console.error("Error al eliminar ingreso:", err);
      W.ingresos.splice(idx,0,backup); // rollback
      mostrarIngresos();
      W.toastErr?.("❌ No se pudo eliminar el ingreso");
    }
  };

  // Exponer handlers
  window.editarIngresoId = W.editarIngresoId;
  window.eliminarIngresoId = W.eliminarIngresoId;

  // =============== Bootstrap ===============
  llenarSelectFuentesIngresosForm();
  buildFiltroFuenteDesdeDatos();
  mostrarIngresos();
  // Si tienes sesión, también intenta cargar del server:
  if (window.__sessionOK || (typeof haySesion==='function' && haySesion())) {
    cargarIngresos({ first:true });
  }
});

// =============================
// MANEJO DE BILLS
// =============================
document.addEventListener("DOMContentLoaded", () => {
  const form       = document.getElementById("form-bills");

  // Refs UI
  const tipoSelect = document.getElementById("bill-tipo");
  const fechaInput = document.getElementById("bill-fecha");
  const montoInput = document.getElementById("bill-monto");
  const listaBills = document.getElementById("lista-bills");
  const resumenDiv = document.getElementById("resumen-bills");

  const filtroMes  = document.getElementById("filtro-mes-bill");
  const filtroTipo = document.getElementById("filtro-tipo-bill");

  const ctxGraficoEl = document.getElementById("grafico-bills");
  const ctxGrafico   = ctxGraficoEl ? ctxGraficoEl.getContext("2d") : null;
  let grafico;

  // =============================
  // Estado global + alias legacy
  // =============================
  window.W = window.W || {};
  W.bills = Array.isArray(W.bills) ? W.bills : [];
  window.bills = W.bills; // alias para código legacy que aún use window.bills

  // =============================
  // Helpers
  // =============================
  function slugTipo(s) {
    const txt = String(s || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .trim().replace(/\s+/g, " ");
    try {
      return txt.replace(/[\p{Extended_Pictographic}\p{Emoji}\p{Emoji_Presentation}]/gu, "")
                .toLowerCase();
    } catch {
      return txt.replace(/[^A-Za-z0-9 ]/g, "").toLowerCase();
    }
  }
  function getBillsBase() { return Array.isArray(W.bills) ? W.bills : []; }
  function getBillById(id) {
    return getBillsBase().find(b => String(b.id) === String(id));
  }

  // =============================
  // Construir FILTRO Tipo desde datos reales
  // =============================
  function buildFiltroTipoDesdeDatos() {
    if (!filtroTipo) return;

    const data = getBillsBase();

    // 1) Agrupar por tipo_id si existe
    const porId = new Map(); // tipo_id -> { label, count, lastDate }
    data.forEach(b => {
      const id    = String(b.tipo_id ?? "").trim();
      if (!id) return;
      const label = String(b.tipo ?? "").trim() || id;
      const fecha = String(b.fecha ?? "");
      const prev  = porId.get(id);
      if (!prev) porId.set(id, { label, count: 1, lastDate: fecha });
      else {
        prev.count += 1;
        if (fecha > prev.lastDate && label) prev.label = label;
        if (fecha > prev.lastDate)          prev.lastDate = fecha;
      }
    });

    filtroTipo.innerHTML = `<option value="">Todos</option>`;

    if (porId.size > 0) {
      const items = Array.from(porId.entries()).sort((a,b)=> b[1].count - a[1].count);
      items.forEach(([id, meta]) => {
        const lbl = meta.label || id;
        const opt = new Option(lbl, lbl);
        opt.setAttribute('data-id', id);              // id opaco para filtrar
        opt.setAttribute('data-key', slugTipo(lbl));  // backup por slug
        filtroTipo.appendChild(opt);
      });
      return;
    }

    // 2) Fallback: agrupar por texto (sin emojis)
    const porTexto = new Map(); // key -> { label, count, lastDate }
    data.forEach(b => {
      const label = String(b.tipo ?? "").trim();
      if (!label) return;
      const key   = slugTipo(label);
      const fecha = String(b.fecha ?? "");
      const prev  = porTexto.get(key);
      if (!prev) porTexto.set(key, { label, count: 1, lastDate: fecha });
      else {
        prev.count += 1;
        if (fecha > prev.lastDate && label) prev.label = label;
        if (fecha > prev.lastDate)          prev.lastDate = fecha;
      }
    });

    const itemsTxt = Array.from(porTexto.entries()).sort((a,b)=> b[1].count - a[1].count);
    itemsTxt.forEach(([key, meta]) => {
      const lbl = meta.label || key;
      const opt = new Option(lbl, lbl);
      opt.setAttribute('data-key', key);             // clave sintética
      filtroTipo.appendChild(opt);
    });
  }

  // =============================
  // Inicializar formulario (desde configBills)
  // =============================
  function inicializarFormulario() {
    if (tipoSelect) tipoSelect.innerHTML = `<option value="" disabled selected>Selecciona tipo</option>`;
    if (!Array.isArray(configBills) || !configBills.length) return;

    (configBills || []).forEach(bill => {
      const nombre = bill?.nombre ?? bill;
      const opt = new Option(nombre, nombre);
      if (bill?.id != null) opt.dataset.id = bill.id; // id opaco del catálogo
      tipoSelect?.appendChild(opt);
    });
  }

  // =============================
  // Wire de filtros (una sola vez)
  // =============================
  (function wireFiltrosBillsV2(){
    if (!listaBills) return;
    if (listaBills.dataset.wiredBillsV2 === "1") return;

    const onChange = () => { mostrarBills(); };

    filtroMes?.addEventListener("change",  onChange);
    filtroTipo?.addEventListener("change", onChange);

    listaBills.dataset.wiredBillsV2 = "1";
  })();

  // =============================
  // Cargar bills desde servidor
  // =============================
  async function cargarBills() {
    if (!__sessionOK && !haySesion?.()) {
      console.info('cargarBills: cancelado porque no hay sesión');
      buildFiltroTipoDesdeDatos();
      mostrarBills?.();
      return;
    }

    try {
      const data = await fetchJSON('/cargar_bills', { method: 'GET' }, { silent401: true });
      if (!data) {
        console.info('No autenticado (cargar_bills).');
        mostrarPantallaLogin?.();
        buildFiltroTipoDesdeDatos();
        mostrarBills?.();
        return;
      }

      // 1) Cargar lista
      const lista = Array.isArray(data) ? data : (data.bills || []);
      W.bills.splice(0, W.bills.length, ...lista);

      // 2) Normalizar montos → "Dueño" amigable
      const owner = (typeof ownerDisplay === 'function' ? ownerDisplay() : null) || 'Dueño';
      let emailLower = '';
      try { emailLower = (JSON.parse(sessionStorage.getItem('usuario') || '{}').email || '').toLowerCase(); } catch {}
      for (const b of W.bills) {
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

      // 3) Inicializar selects del form si hace falta
      if (tipoSelect && tipoSelect.options.length <= 1) {
        inicializarFormulario();
      }

      // 4) Poblar filtro de Tipo desde datos reales
      buildFiltroTipoDesdeDatos();

      // 5) Reset de filtros (Mes y Tipo) y render
      ['filtro-mes-bill','filtro-tipo-bill'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = '';
        el.dispatchEvent(new Event('change', { bubbles:true }));
      });

      mostrarBills?.();

    } catch (err) {
      if (String(err?.message || '').includes('401')) {
        console.info('No autenticado (cargar_bills).');
        mostrarPantallaLogin?.();
        buildFiltroTipoDesdeDatos();
        mostrarBills?.();
        return;
      }
      console.error('Error al cargar bills:', err);
      try { toastErr?.('❌ No se pudieron cargar las facturas'); } catch {}
      buildFiltroTipoDesdeDatos();
      mostrarBills?.();
    }
  }

  // =============================
  // Guardar nuevo bill (alta/edición por ID)
  // =============================
  form?.addEventListener("submit", e => {
    e.preventDefault();

    const tipo  = tipoSelect?.value;
    const fecha = fechaInput?.value;

    // soportar coma decimal
    const _m = parseFloat(String(montoInput?.value ?? "0").replace(',', '.'));
    const monto = Number.isFinite(_m) ? _m : 0;

    if (!tipo || !fecha || isNaN(monto) || monto <= 0) {
      alert("Completa todos los campos correctamente.");
      return;
    }

    // id opaco del catálogo (si existe)
    const optSel  = tipoSelect.options[tipoSelect.selectedIndex];
    const tipo_id = optSel?.dataset?.id || null;

    // Participantes
    const owner = ownerDisplay();
    const billConfig = (configBills || []).find(b => (b.nombre || b) === tipo);
    const actuales = new Set((configPersonas || []).map(p => p?.nombre?.trim().toLowerCase()).filter(Boolean));
    const base = (billConfig?.personas || [])
      .map(n => String(n).trim())
      .filter(n => actuales.has(n.toLowerCase()))
      .map(n => (n.toLowerCase() === 'dueño' || n.toLowerCase() === 'dueno') ? owner : n);

    const participantes = [...new Set([...base, owner].filter(Boolean))];
    if (!participantes.length) {
      alert("No hay personas configuradas para este bill.");
      return;
    }

    // Montos por persona
    const porPersona = monto / participantes.length;
    const montos = {};
    participantes.forEach(nombre => { montos[nombre] = porPersona; });

    // —— Modo edición por ID (no por índice)
    const editId = form.dataset.editId;
    let tempIndex = -1;

    if (editId) {
      const idx = getBillsBase().findIndex(b => String(b.id) === String(editId));
      if (idx >= 0) {
        W.bills[idx] = { ...(W.bills[idx] || {}), fecha, tipo, nombre: tipo, tipo_id, monto, montos };
        tempIndex = idx;
      }
    } else {
      // Alta optimista (sin id aún)
      tempIndex = W.bills.push({ fecha, tipo, nombre: tipo, tipo_id, monto, montos }) - 1;
    }

    mostrarBills();

    // Persistir
    fetch("/guardar_bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fecha, tipo, nombre: tipo, tipo_id, monto, montos, id: editId || undefined })
    })
    .then(async (res) => {
      let data = null;
      try { data = await res.json(); } catch {}
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      const serverBill = data?.bill || data;
      if (serverBill && tempIndex >= 0) {
        W.bills[tempIndex] = serverBill; // replace in-place con el id real del server
      }

      buildFiltroTipoDesdeDatos();
      mostrarBills();

      // Reset form/mode
      form.reset();
      delete form.dataset.editId;
      const btn = document.getElementById("btn-guardar-bill") || form.querySelector('button[type="submit"]');
      if (btn) btn.textContent = "Guardar Bill";
      W.toastOk?.("✅ Bill guardado correctamente");
    })
    .catch((err) => {
      console.error("Error al guardar bill:", err);
      // rollback si era alta
      if (!editId && tempIndex >= 0) {
        W.bills.splice(tempIndex, 1);
        mostrarBills();
      }
      W.toastErr?.("❌ No se pudo guardar el bill");
    });
  });

  // =============================
  // Mostrar bills (filtrar y pintar) — por ID
  // =============================
  function mostrarBills() {
    if (!listaBills) return;
    listaBills.innerHTML = "";

    const mes = filtroMes?.value || "";

    // leer opción seleccionada de tipo (id opaco o slug)
    const tipoOpt        = filtroTipo?.options?.[filtroTipo.selectedIndex];
    const tipoIdSel      = (tipoOpt?.getAttribute?.('data-id')  || "").trim();
    const tipoKeyAttrSel = (tipoOpt?.getAttribute?.('data-key') || "").trim();
    const tipoTxtSel     = (tipoOpt?.value || "").trim();
    const tipoKeyTxtSel  = slugTipo(tipoTxtSel);

    const filtrados = getBillsBase()
      .map(b => ({ bill: b, id: b.id }))
      .filter(({ bill }) => {
        const billMes = String(bill.fecha || "").slice(0, 7);
        const okMes   = !mes || billMes === mes;

        let okTipo = true;
        if (tipoIdSel || tipoKeyAttrSel || tipoTxtSel) {
          const idBill  = String(bill.tipo_id || "").trim();
          const keyBill = slugTipo(bill.tipo);

          if (tipoIdSel && idBill) okTipo = (idBill === tipoIdSel);
          else okTipo = (keyBill === (tipoKeyAttrSel || tipoKeyTxtSel));
        }
        return okMes && okTipo;
      });

    // ordenar por fecha desc
    filtrados.sort((a,b) =>
      String(b.bill?.fecha || "").slice(0,10)
        .localeCompare(String(a.bill?.fecha || "").slice(0,10))
    );

    if (!filtrados.length) {
      listaBills.innerHTML = `<p>🪙 No hay bills registrados aún.</p>`;
      actualizarResumenBills([]);
      actualizarGrafico([]);
      return;
    }

    filtrados.forEach(({ bill, id }) => {
      const div = document.createElement("div");
      div.classList.add("card-datos");
      div.dataset.id = id; // para inspección/debug

      const owner = ownerDisplay();
      const entradas = Object.entries(bill.montos || {});
      entradas.sort(([a],[b]) => (a === owner) - (b === owner)); // dueño al final

      let personasHTML = "";
      entradas.forEach(([nombre, monto]) => {
        const mostrarNombre = (nombre === 'DUEÑO') ? owner : nombre;
        personasHTML += `
          <div class="persona-row">
            <strong class="nombre">${mostrarNombre}:</strong>
            <span class="importe">$${Number(monto).toFixed(2)}</span>
            <button type="button" class="wa-btn" title="WhatsApp"
              onclick="enviarMensaje('${mostrarNombre}', ${monto}, '${bill.fecha}', '${bill.tipo}')">📩</button>
          </div>`;
      });

      div.innerHTML = `
        <div class="card-header">
          📅 ${formatoLegible(bill.fecha)} — ${bill.tipo} — 💰 TOTAL: $${Number(bill.monto || 0).toFixed(2)}
        </div>
        <div class="card-body bill-grid">${personasHTML}</div>
        <div class="card-actions">
          <button class="icon-btn" title="Editar"   onclick="editarBillId('${id}')">✏️</button>
          <button class="icon-btn danger" title="Eliminar" onclick="eliminarBillId('${id}')">🗑️</button>
        </div>`;
      listaBills.appendChild(div);
    });

    actualizarResumenBills(filtrados.map(x => x.bill));
    actualizarGrafico(filtrados.map(x => x.bill));
  }

  // =============================
  // Resumen (solo Bills)
  // =============================
  function actualizarResumenBills(billsMostrados) {
    const mesSel     = document.getElementById("filtro-mes-bill")?.value || "";
    const nombreMes  = nombreDelMes(mesSel);
    const tipoTxtSel = filtroTipo?.options?.[filtroTipo.selectedIndex || 0]?.value || "";

    const totalBills = billsMostrados.reduce((acc, b) => acc + Number(b.monto || 0), 0);

    const titulo = tipoTxtSel
      ? `📬 Total de facturas de "${tipoTxtSel}" en ${nombreMes}: $${totalBills.toFixed(2)}`
      : `📬 Total de facturas en ${nombreMes}: $${totalBills.toFixed(2)}`;

    if (resumenDiv) resumenDiv.innerHTML = titulo;
  }

  // =============================
  // Gráfico
  // =============================
  function actualizarGrafico(billsMostrados) {
    const resumen = {};
    billsMostrados.forEach(b => {
      const key = String(b.tipo || "").trim() || "Sin tipo";
      resumen[key] = (resumen[key] || 0) + Number(b.monto || 0);
    });

    const labels = Object.keys(resumen);
    const data   = Object.values(resumen);

    if (grafico) { try { grafico.destroy(); } catch {} grafico = null; }
    if (!ctxGrafico) return;

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
  // Editar / Eliminar — por ID
  // =============================
  W.editarBillId = (id) => {
    const bill = getBillById(id);
    if (!bill) return;

    // set tipo en el select del form por id opaco → slug → texto exacto
    if (tipoSelect) {
      let chosen = false;
      if (bill.tipo_id) {
        for (const opt of tipoSelect.options) {
          const oid = (opt.getAttribute?.("data-id") || opt.dataset?.id || "").trim();
          if (oid && oid === String(bill.tipo_id).trim()) { opt.selected = true; chosen = true; break; }
        }
      }
      if (!chosen) {
        const wantKey = slugTipo(bill.tipo);
        for (const opt of tipoSelect.options) {
          if (slugTipo(opt.value) === wantKey) { opt.selected = true; chosen = true; break; }
        }
      }
      if (!chosen) {
        for (const opt of tipoSelect.options) {
          if ((opt.value || "").trim() === String(bill.tipo || "").trim()) { opt.selected = true; break; }
        }
      }
    }

    fechaInput.value = bill.fecha || "";
    const n = Number(bill.monto || 0);
    montoInput.value = Number.isFinite(n) ? n.toFixed(2) : (bill.monto ?? "");

    form.dataset.editId = String(id); // ← modo edición por id
    const btn = document.getElementById("btn-guardar-bill") || form.querySelector('button[type="submit"]');
    if (btn) btn.textContent = "Actualizar Bill";

    form.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => fechaInput?.focus({ preventScroll: true }), 250);
  };

  W.eliminarBillId = async (id) => {
    const bill = getBillById(id);
    if (!bill) return;
    if (!confirm("¿Seguro que quieres eliminar este bill 😫?")) return;

    // Optimista + rollback
    const idx = getBillsBase().findIndex(b => String(b.id) === String(id));
    const backup = W.bills.splice(idx, 1)[0];
    mostrarBills();

    try {
      const res = await fetch("/eliminar_bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      try { await res.json(); } catch {}
      W.toastOk?.("🗑️ Bill eliminado");
    } catch (err) {
      console.error("Error al eliminar bill:", err);
      W.bills.splice(idx, 0, backup);
      mostrarBills();
      W.toastErr?.("❌ No se pudo eliminar el bill");
    }
  };

  // Exponer handlers para los botones del DOM
  window.editarBillId   = W.editarBillId;
  window.eliminarBillId = W.eliminarBillId;

  // =============================
  // Exportar y bootstrap
  // =============================
  W.mostrarBills = mostrarBills;
  W.cargarBills  = cargarBills;
  window.mostrarBills = mostrarBills;
  window.cargarBills  = cargarBills;

  if (window.__sessionOK || (typeof haySesion === 'function' && haySesion())) {
    inicializarFormulario();
    cargarBills();
  } else {
    inicializarFormulario();
    buildFiltroTipoDesdeDatos();
    mostrarBills();
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

 // Crear/editar egreso (con categoria_id y medio_id)
form?.addEventListener("submit", e => {
  e.preventDefault();

  const fecha  = document.getElementById("fecha-egreso").value;
  const monto  = parseFloat(document.getElementById("monto-egreso").value);

  const categoriaSelect    = document.getElementById("categoria-egreso");
  const subcategoriaSelect = document.getElementById("subcategoria-egreso");
  const medioSelect        = document.getElementById("medio-egreso");
  const submedioSelect     = document.getElementById("submedio-egreso");
  const notaInput          = document.getElementById("nota-egreso");

  const categoria    = categoriaSelect?.value || "";
  const subcategoria = subcategoriaSelect?.value || "";
  const medio        = medioSelect?.value || "";
  const submedio     = submedioSelect?.value || "";
  const nota         = (notaInput?.value || "").trim();
  const persona      = (document.getElementById("persona-egreso")?.value || "").trim();

  // 👇 toma los data-id opacos del option seleccionado
  const categoria_id = categoriaSelect?.options?.[categoriaSelect.selectedIndex]?.dataset?.id || null;
  const medio_id     = medioSelect?.options?.[medioSelect.selectedIndex]?.dataset?.id || null;

  if (!fecha || isNaN(monto) || monto <= 0 || !categoria || !medio) {
    alert("🤔 Por favor, completa todos los campos correctamente.");
    return;
  }

  const nuevoEgreso = {
    fecha, monto,
    categoria, categoria_id,
    subcategoria,
    medio, medio_id,
    submedio, persona, nota
  };

  // DEBUG opcional para ver qué se envía
  console.log("POST /guardar_egreso payload:", nuevoEgreso);

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
    return res.json().catch(() => null);
  })
  .then(() => {
    W.toastOk?.(mensajeToast);
    mostrarEgresos();
    form.reset();

    // ocultar dependientes
    const subcatC = document.getElementById("subcategoria-egreso-container");
    if (subcatC?.style) subcatC.style.display = "none";
    const submedioC = document.getElementById("submedio-egreso-container");
    if (submedioC?.style) submedioC.style.display = "none";
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

// Helpers cortitos (si no los tienes ya):
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));}
function stableId(prefix, text){
  const t = String(text||'').toLowerCase().trim();
  let h=0; for(let i=0;i<t.length;i++){ h=(h*31 + t.charCodeAt(i))>>>0; }
  return prefix + h.toString(16).padStart(8,'0');
}

function rellenarSelectsPagos() {
  const { bill, filtroBill, persona, medio, filtroPer, filtroPersona } = $pagosEls();
  const filtroPersonaEl = filtroPersona || filtroPer;

  // ===== Bills desde CONFIG (no desde registros) =====
  const confBills = Array.isArray(W?.configTemporal?.bills_conf) ? W.configTemporal.bills_conf
                 : Array.isArray(W?.configTemporal?.bills)      ? W.configTemporal.bills
                 : Array.isArray(W?.configBills)                ? W.configBills
                 : [];

  const billsSrc = confBills.map(b => ({
    nombre: b?.nombre || b?.label || b?.texto || String(b || ''),
    tipoId: b?.id || b?.tipo_id || ''
  })).filter(b => b.nombre);

  if (bill) {
    bill.innerHTML = '<option value="">Selecciona Bill</option>' +
      billsSrc.map(b => `<option value="${b.nombre}" data-tipo-id="${b.tipoId}">${b.nombre}</option>`).join('');
  }
  if (filtroBill) {
    filtroBill.innerHTML = '<option value="">Todos</option>' +
      billsSrc.map(b => `<option value="${b.nombre}">${b.nombre}</option>`).join('');
  }

  // ===== Personas (desde config) =====
  const personasArr = (W?.configPersonas || []).map(p => p.nombre).filter(Boolean);
  if (persona) {
    persona.innerHTML = '<option value="">Selecciona persona</option>' +
      personasArr.map(p => `<option value="${p}" data-id="${stableId('p_',p)}">${p}</option>`).join('');
  }
  if (filtroPersonaEl) {
    filtroPersonaEl.innerHTML = '<option value="">Todas</option>' +
      personasArr.map(p => `<option value="${p}">${p}</option>`).join('');
  }

  // ===== Medios (desde config) =====
  const mediosArr = (W?.configMediosPago || []).map(m => m.medio).filter(Boolean);
  if (medio) {
    medio.innerHTML = '<option value="">Selecciona medio</option>' +
      mediosArr.map(m => `<option value="${m}" data-id="${stableId('m_',m)}">${m}</option>`).join('');
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

// ✅ ÚNICA versión de cargarPagos (drop-in)
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
// Alta / edición de pagos
(function wireFormPagos(){
  const { form } = $pagosEls();
  if (!form) { document.addEventListener('DOMContentLoaded', wireFormPagos, { once:true }); return; }

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const { bill, monto, persona, medio, fecha, nota, subSelect, subCont } = $pagosEls();

    // ---- BILL: soporta value = id o value = nombre (config)
    const billOpt      = bill?.options?.[bill.selectedIndex];
    const billValue    = billOpt?.value || "";                       // puede ser "12" o "🏠 Alquiler"
    const bill_id      = /^\d+$/.test(billValue) ? Number(billValue) : null;
    const bill_nombre  = billOpt?.dataset?.nombre
                         || billOpt?.textContent?.trim()
                         || billValue;                               // último recurso: el value
    const bill_tipo_id = billOpt?.dataset?.tipoId || null;           // si existiera

    const montoVal    = parseFloat(monto?.value || "0");
    const personaOpt  = persona?.options?.[persona.selectedIndex];
    const personaTxt  = persona?.value || "";
    const persona_id  = personaOpt?.dataset?.id || null;

    const medioOpt    = medio?.options?.[medio.selectedIndex];
    let   medioTxt    = medio?.value || "";
    let   medio_id    = medioOpt?.dataset?.id || null;

    const subOpt      = subSelect?.options?.[subSelect.selectedIndex];
    let   submedioTxt = (subSelect?.value || "").trim();
    let   submedio_id = subOpt?.dataset?.id || null;

    const fechaVal    = fecha?.value || "";
    const notaVal     = (nota?.value || "").trim();

    // ✅ Validar por NOMBRE de bill (no por id)
    if (!bill_nombre || !personaTxt || !fechaVal || Number.isNaN(montoVal)) {
      alert("Completa Bill, Persona, Fecha y un monto válido (puede ser 0).");
      return;
    }

    // Si monto <= 0 => No pagó
    if (montoVal <= 0) {
      medioTxt = "No pagó";
      medio_id = null;
      submedioTxt = "";
      submedio_id = null;
    }

    // Payload: incluimos ambos por compatibilidad
    const nuevoPago = {
      bill_id, bill: bill_nombre, bill_tipo_id,
      persona: personaTxt, persona_id,
      medio: medioTxt, medio_id,
      submedio: submedioTxt, submedio_id,
      fecha: fechaVal, monto: montoVal, nota: notaVal
    };

    // ---- Optimista (igual que antes)
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

    // ---- Persistir
    fetch('/guardar_pago', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nuevoPago) // el backend usa bill (nombre); bill_id es opcional
    })
    .then(async (res) => {
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch {}
      if (!res.ok || data.ok === false) throw new Error(data?.error || `HTTP ${res.status}`);

      if (data?.pago) {
        pagos[idxAfectado] = data.pago;
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
      toggleMedioPorMonto?.();
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
// 💵 MINI-DISPONIBLE (overlay + panel opcional)
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
// 💵 Overlay dinámico para "Disponible del mes" (sin HTML fijo)
(function wireMiniDisponibleOverlay(){
  // Click delegado: funciona aunque el botón se renderice después
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#btn-mini-disponible')) return;
    abrirMiniDisponible();
  });

  function abrirMiniDisponible() {
    if (document.getElementById('mini-disp-overlay')) return; // evita duplicar

    // Inserta overlay + tarjeta (sin estilos inline)
    const html = `
      <div id="mini-disp-overlay" class="mini-disp-overlay" role="dialog" aria-modal="true" aria-label="Disponible del mes">
        <div class="mini-disp-card">
          <button type="button" class="mini-disp-close" aria-label="Cerrar">✖</button>
          <div data-disponible-panel data-mes-source="filtro-mes-ingreso" class="mini-disp-panel"></div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    const ov = document.getElementById('mini-disp-overlay');
    const panel = ov.querySelector('[data-disponible-panel]');

    // Pintar contenido usando tu función existente
    if (typeof refrescarDisponibleGlobal === 'function') {
      try { refrescarDisponibleGlobal(); } catch {}
    } else {
      panel.textContent = 'No hay datos para mostrar.';
    }

    // Cierre
    const onClose = () => {
      // Limpia listeners de filtros
      idsMes.forEach(id => {
        const el = document.getElementById(id);
        el && el.removeEventListener('change', refreshIfOpen);
        el && el.removeEventListener('input',  refreshIfOpen);
      });
      document.removeEventListener('keydown', onEsc);
      ov.remove();
    };

    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    const refreshIfOpen = () => {
      if (document.getElementById('mini-disp-overlay')) {
        try { refrescarDisponibleGlobal(); } catch {}
      }
    };

    ov.addEventListener('click', (evt) => { if (evt.target === ov) onClose(); });
    ov.querySelector('.mini-disp-close')?.addEventListener('click', onClose);
    document.addEventListener('keydown', onEsc);

    // Refresca si cambian filtros de mes mientras está abierto
    const idsMes = ['filtro-mes-ingreso','filtro-mes-egreso','filtro-mes-bill','filtro-mes-pago'];
    idsMes.forEach(id => {
      const el = document.getElementById(id);
      el && el.addEventListener('change', refreshIfOpen);
      el && el.addEventListener('input',  refreshIfOpen);
    });
  }
})();

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

// =============
// === Boot ===
// =============
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

    // 🚧 Si hay paywall, no pidamos datos (evita 403 y modales que se cierran)
  async function iniciarZonaPrivada() {
  if (window.__paywall || window.__waitingStripeVerify) {
    console.info('PAYWALL/STRIPE: no cargo datos aún');
    return;
  }

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
// === RUTAS PRIVADAS protegidas por suscripción (debe estar antes de boot) ===
window.RUTAS_PRIVADAS = new Set([
  '/cargar_configuracion',
  '/cargar_bills',
  '/cargar_ingresos',
  '/cargar_egresos',
  '/cargar_pagos',
  '/cargar_perfil'
]);

// Estados globales iniciales (por si no existían aún)
window.__sessionOK = !!window.__sessionOK;
window.__paywall   = !!window.__paywall;
// === CONTROL DE PAYWALL (anti-parpadeos) ===
window.__billingLock = false;
window.__lastBilling = null;
window.__suppressPaywall = true;   // empezamos silenciando paywall
window.__paywallShown = false;     // evita mostrarlo más de una vez

async function refreshBilling() {
  if (window.__billingLock) return window.__lastBilling;
  window.__billingLock = true;
  try {
    const r = await fetch('/billing_status', { credentials:'same-origin', cache:'no-store' });
    const j = await r.json().catch(() => ({}));
    window.__lastBilling = j;
    return j;
  } finally {
    window.__billingLock = false;
  }
}

function shouldShowPaywall(j) {
  if (window.__suppressPaywall) return false;     // no mostrar mientras suprimido
  if (!j || j.ok === false) return false;
  // Si está pago y activo → nunca paywall
  if (j.plan === 'paid' && j.is_active) return false;
  // Si está en trial con días restantes → tampoco
  if (j.plan === 'trial' && (j.days_left ?? 0) > 0) return false;
  return true;
}

// Muestra una sola vez y solo si toca
function maybeShowPaywall(j) {
  if (window.__paywallShown) return;
  if (shouldShowPaywall(j)) {
    window.__paywallShown = true;
    try { mostrarPaywallSuscripcion?.(); } catch {}
  }
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
if (!ses || ses.ok === false || !ses.user) {
  _marcarSesion(false);
  // PRIMERO ocultamos el splash y LUEGO mostramos el login
  ocultarSplash(() => {
    mostrarPantallaLogin?.();
    enforceAuthView?.();
  });
  return;
}

  // d) Autenticado:
   _marcarSesion(true);
  const user = ses.user || { id: ses.id, email: ses.email, nombre: ses.nombre || ses.email };
  try { sessionStorage.setItem('usuario', JSON.stringify(user)); } catch {}

  // ⛔ Silencia el paywall mientras pedimos el estado
  window.__suppressPaywall = true;
  const st = await refreshBilling();          // <- ESPERAMOS billing fresco
  window.__suppressPaywall = false;

  // Si NO hay paywall, carga datos; si sí, muestra el paywall (una vez)
  const habemusPaywall =
    !st || (st.plan !== 'paid' && !(st.plan === 'trial' && (st.days_left ?? 0) > 0));
  if (!habemusPaywall) {
    await iniciarZonaPrivada();
  } else {
    maybeShowPaywall(st);
  }

  // Luego muestra UI normal
  ocultarSplash(() => {
    mostrarZonaPrivada?.(user);
    enforceAuthView?.();
  });
}

// --- registrar accesos globales ---
registerGlobals(); // con la versión “segura” ya no hace falta el try/catch

// 3) ÚNICO listener de arranque (asegúrate de no tener otro en el archivo)
document.addEventListener('DOMContentLoaded', boot);

// === SUSCRIPCIÓN (Stripe) ===
// ÚNICA definición
async function suscribirme() {
  const btn = document.getElementById('btn-suscribirme');
  btn?.setAttribute('disabled', 'true');
  try {
    const resp = await fetch('/create_checkout_session', { method: 'POST' });
    const data = await resp.json();
    if (data.ok && data.url) {
      window.location.assign(data.url);   // redirige a Stripe
      return;
    }
    Swal?.fire('Ups', data.error || 'No se pudo crear la sesión de pago.', 'error');
  } catch (err) {
    Swal?.fire('Ups', 'Error de conexión creando la sesión de pago.', 'error');
  } finally {
    btn?.removeAttribute('disabled');
  }
}
window.suscribirme = suscribirme;

async function refrescarEstadoCuenta() {
  try {
    const r = await fetch('/account_status');
    const j = await r.json();
    if (!j.ok) throw 0;
    const bell = document.getElementById('btn-suscribirme');
    if (!bell) return;

    // mostrar campana si no está paid o si trial venció
    const showBell = (j.plan !== 'paid') && !(j.plan === 'trial' && j.days_left > 0);
    bell.style.display = showBell ? '' : 'none';
  } catch (e) {
    /* ignore */
  }
}
(function(){
  const q = new URLSearchParams(location.search);
  const chk = q.get('checkout');
  if (chk === 'success') {
    Swal.fire({ icon:'success', title:'¡Suscripción activada!', timer:1500, showConfirmButton:false });
    history.replaceState({}, '', location.pathname); // limpia la query
    refrescarEstadoCuenta();
  } else if (chk === 'cancel') {
    Swal.fire({ icon:'info', title:'Pago cancelado', timer:1200, showConfirmButton:false });
    history.replaceState({}, '', location.pathname);
  }
})();
// --- DEBUG / CABLEADO EXPLÍCITO DEL BOTÓN ---
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-suscribirme')
    ?.addEventListener('click', onBellClick, { passive: true });
});

// Detecta retorno de Stripe y reacciona (versión pro)
(async function onCheckoutReturn() {
  const q = new URLSearchParams(location.search);
  const flag = q.get('checkout');
  if (!flag || window.__stripeHandled) return;   // anti-doble

  window.__stripeHandled = true;
  window.__waitingStripeVerify = (flag === 'success'); // pausa cargas de datos

  const cleanURL = () => {
    const u = new URL(location.href);
    ['checkout','session_id'].forEach(k => u.searchParams.delete(k));
    history.replaceState({}, '', u.pathname + (u.search ? `?${u.search}` : '') + u.hash);
    window.__waitingStripeVerify = false;  // levantamos la pausa
  };

  try {
    if (flag === 'success') {
      const sid = q.get('session_id');

      // 1) Verifica en backend y/o fuerza sync por si Stripe tarda un pelín
      if (sid) {
        try { await fetch(`/checkout_verify?session_id=${encodeURIComponent(sid)}`, {credentials:'same-origin'}); } catch {}
      }
      try { await fetch('/billing_sync', {method:'POST', credentials:'same-origin'}); } catch {}

      // 2) Refresca UI/estado
      try { await refrescarEstadoCuenta?.(); } catch {}

      // 3) Oculta campanita si ya queda activa
      document.getElementById('btn-suscribirme')?.style.setProperty('display', 'none', 'important');

      // 4) Mensaje lindo 🎉
      await Swal.fire({
        icon: 'success',
        title: '¡Suscripción activada! 💜',
        text: 'Tu acceso completo ya está disponible.',
        customClass: { popup:'gastos', confirmButton:'btn-gastos' },
        buttonsStyling: false,
        timer: 1500,
        showConfirmButton: false
      });

      // 5) Quita paywall por si estaba activo
      window.__paywall = false;

    } else if (flag === 'cancel') {
      await Swal.fire({
        icon: 'info',
        title: 'Pago cancelado',
        timer: 1200,
        showConfirmButton: false,
        customClass: { popup:'gastos', confirmButton:'btn-gastos' },
        buttonsStyling: false
      });
    }
  } finally {
    cleanURL();
  }
})();

// ========= Billing (campanita) =========
// Formatea ISO a hora local boni
function _fmtLocal(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString([], { year:'numeric', month:'short', day:'2-digit' });
  } catch { return ""; }
}

// Abre el portal de facturación de Stripe
async function openBillingPortal() {
  const res = await fetch('/billing_portal', { method:'POST' });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok || !j.url) {
    throw new Error(j.error || `No pudimos abrir el portal de facturación.`);
  }
  window.location.assign(j.url);
}

// (Re)utilizamos tu checkout
async function suscribirme() {
  const btn = document.getElementById('btn-suscribirme');
  btn?.setAttribute('disabled','true');
  try {
    const r = await fetch('/create_checkout_session', { method:'POST' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok || !j.url) throw new Error(j.error || 'No se pudo crear la sesión de pago.');
    window.location.assign(j.url);
  } catch (err) {
    Swal.fire({ icon:'error', title:'Ups', text: err.message || 'No se pudo iniciar el pago.' });
  } finally {
    btn?.removeAttribute('disabled');
  }
}
window.suscribirme = suscribirme; // por si lo llamas desde otros lados

// [NUEVO] backfill: si falta next_charge_at lo pide a Stripe y lo guarda
async function syncNextChargeIfMissing() {
  try {
    const r = await fetch('/billing_sync', { method: 'POST', credentials: 'same-origin' });
    return await r.json();
  } catch { return {}; }
}

// [NUEVO] helper para pedir el estado de facturación
async function getBillingStatus() {
  const r = await fetch('/billing_status', { credentials:'same-origin' });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

// Helper opcional (ya lo tenías, lo dejo por si falta)
async function syncNextChargeIfMissing() {
  const r = await fetch('/billing_sync', { method:'POST', credentials:'same-origin' });
  return r.json();
}

// Click de la campana
// Helper: sincroniza la próxima fecha si falta
async function syncNextChargeIfMissing() {
  const r = await fetch('/billing_sync', { method:'POST', credentials:'same-origin' });
  return r.json();
}

// Click de la campana
let __bellBusy = false;

// Click de la campana
async function onBellClick() {
  if (window.__waitingStripeVerify) return;  // no abrir nada mientras verificamos
  if (Swal?.isVisible?.() || window.__modalGate) return; // si ya hay modal, no dupliques

  if (__bellBusy) return;
  __bellBusy = true;
  try {
    let r = await fetch('/billing_status', { credentials:'same-origin' });
    let j = await r.json();
    if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);

    // Suscripción activa (plan pago)
    if (j.plan === 'paid' && j.is_active) {
      if (!j.next_charge_at) {
        const k = await syncNextChargeIfMissing();
        if (k?.ok && k.next_charge_at) {
          const r2 = await fetch('/billing_status', { credentials:'same-origin' });
          const j2 = await r2.json().catch(()=> ({}));
          if (j2?.ok) j = j2;
        }
      }

      const whenHuman = j.next_charge_at ? _fmtLocal(j.next_charge_at) : (j.next_charge_date_human || null);
      const msgHuman  = j.next_charge_message || (() => {
        const d = Number.isFinite(j.days_to_next_charge) ? j.days_to_next_charge : null;
        if (d == null) return '';
        if (d <= 0) return 'El cobro es hoy 🎉';
        if (d === 1) return 'Mañana ✨';
        if (d <= 3) return `Faltan ${d} días ⏳`;
        if (d === 7) return 'En una semana 🗓️';
        if (d >= 28) return 'En ~1 mes 📆';
        return `Faltan ${d} días 📅`;
      })();

      const html = [
        'Tu suscripción está <b>activa</b>.',
        whenHuman ? `Próximo cobro: <b>${whenHuman}</b>.` : '',
        msgHuman ? `<span>${msgHuman}</span>` : ''
      ].filter(Boolean).join('<br>');

      const result = await Swal.fire({
        icon: 'success',
        title: 'Suscripción activa',
        html,
        showCancelButton: true,
        confirmButtonText: 'Gestionar',
        cancelButtonText: 'Cerrar',
        allowOutsideClick: false,   // 👈 no se cae por eventos externos
        allowEscapeKey: false,      // 👈 idem
        customClass: {
          popup: 'gastos',
          confirmButton: 'btn-gastos',
          cancelButton: 'btn-gastos-sec',
        },
        buttonsStyling: false
      });
      if (result.isConfirmed) await openBillingPortal();

      const bell = document.getElementById('btn-suscribirme');
      bell?.setAttribute('title', whenHuman ? `Activa · Próximo: ${whenHuman}` : 'Activa');
      return;
    }

    // Trial vigente
    if (j.plan === 'trial' && (j.days_left ?? -1) >= 0) {
      const d = j.days_left ?? 0;
      const msg = d === 0 ? 'Tu prueba termina hoy 🎉' : `Te quedan ${d} día${d===1?'':'s'} de prueba ⏳`;
      const res = await Swal.fire({
        icon: d <= 3 ? 'warning' : 'info',
        title: 'Prueba gratuita',
        text: msg,
        showCancelButton: true,
        confirmButtonText: 'Suscribirme',
        cancelButtonText: 'Seguir en prueba',
        allowOutsideClick: false,
        allowEscapeKey: false,
        customClass: { popup:'gastos', confirmButton:'btn-gastos', cancelButton:'btn-gastos-sec' },
        buttonsStyling: false
      });
      if (res.isConfirmed) await suscribirme();
      return;
    }

    // Inactiva / trial vencido
    const go = await Swal.fire({
      icon: 'error',
      title: 'Acceso restringido',
      text: 'Tu prueba terminó o tu cuenta no está activa. Suscríbete para continuar.',
      confirmButtonText: 'Suscribirme',
      allowOutsideClick: false,
      allowEscapeKey: false,
      customClass: { popup:'gastos', confirmButton:'btn-gastos' },
      buttonsStyling: false
    });
    if (go.isConfirmed) await suscribirme();

 } catch (err) {
    console.error('[bell]', err);
    Swal.fire({
      icon:'error', title:'Ups',
      text:'No pudimos consultar el estado de tu suscripción.',
      customClass: { popup: 'gastos', confirmButton: 'btn-gastos' },
      buttonsStyling:false
    });
  } finally {
    __bellBusy = false; // ✅ siempre liberamos
  }
}

// Cableado del botón (una sola vez)
document.addEventListener('DOMContentLoaded', () => {
  const bell = document.getElementById('btn-suscribirme');
  if (bell) {
    bell.removeAttribute('onclick'); // por si quedó alguno inline
    bell.addEventListener('click', onBellClick, { passive: true });
  }
}, { once:true });

// (Opcional) al entrar, pintar tooltip según estado actual
async function pintarTooltipCampana() {
  try {
    const r = await fetch('/billing_status');
    const j = await r.json();
    const bell = document.getElementById('btn-suscribirme');
    if (!bell || !j.ok) return;
    if (j.plan === 'paid' && j.is_active) {
      const when = j.next_charge_at ? _fmtLocal(j.next_charge_at) : '';
      bell.title = when ? `Activa · Próximo: ${when}` : 'Activa';
    } else if (j.plan === 'trial' && (j.days_left ?? -1) >= 0) {
      const d = j.days_left ?? 0;
      bell.title = d === 0 ? 'Tu prueba termina hoy' : `Prueba: ${d} día${d===1?'':'s'} restantes`;
    } else {
      bell.title = 'Suscribirme';
    }
  } catch {}
}
window.pintarTooltipCampana = pintarTooltipCampana;

// Probar gratis → desplaza al registro y enfoca "Nombre y Apellido"
(function wireProbarGratis(){
  const btn    = document.getElementById('btn-probar-gratis');
  const target = document.getElementById('seccion-registro');

  // Preferimos el input de Nombre y Apellido
  let nameInp  = document.getElementById('registro-nombre');
  // Fallback por si no existiera (o mientras editas)
  const userInp = document.getElementById('registro-user');

  // ⚠️ Hot-fix por si hay IDs duplicados: deja sólo el primero con el id
  const dups = document.querySelectorAll('#registro-nombre');
  if (dups.length > 1) {
    nameInp = dups[0];
    for (let i = 1; i < dups.length; i++) dups[i].removeAttribute('id');
  }

  if (!btn || !target) {
    document.addEventListener('DOMContentLoaded', wireProbarGratis, { once:true });
    return;
  }

  btn.addEventListener('click', async () => {
    target.scrollIntoView({ behavior:'smooth', block:'start' });
    target.classList.add('resalte');
    setTimeout(() => target.classList.remove('resalte'), 1400);

    // 👇 ahora enfoca Nombre y Apellido (o usuario si no existiera)
    const el = nameInp || userInp;
    el?.focus();
    // (opcional) coloca el cursor al final
    if (el) { const v = el.value; el.value = ''; el.value = v; }

    try {
      await Swal.fire({
        icon:'info',
        title:'Tu prueba empieza al registrarte',
        text:'7 días de acceso completo. Sin tarjeta.',
        timer:1700,
        showConfirmButton:false
      });
    } catch {}
  });
})();

/* gift.js — PRE (saltarina) → OPEN (caja abre) → IMAGEN (otra_tarjeta)
   - Clic en PRE: pasa a OPEN.
   - Doble-clic en OPEN: muestra IMAGEN.
   - Clic en IMAGEN: vuelve a PRE.
*/

(function(){

  // ====== RUTAS ======
  const VER       = (window.__VERSION__ || "1.0.0");
  const PRE_SRC   = `/static/animaciones/caja_de_regalo_saltarina.riv?v=${VER}`;
  const OPEN_SRC  = `/static/animaciones/caja_abierta.riv?v=${VER}`;
  const IMG_SRC   = `/static/animaciones/otra_tarjeta.png?v=${VER}`; // ← tu imagen

  // ====== DOM ======
  const wrap = document.getElementById("gift1");
  const preC = document.getElementById("gift1-pre");
  if (!wrap || !preC) { console.warn("[gift] falta #gift1 o #gift1-pre"); return; }

  // ====== Layout Rive ======
  const layoutContain = new rive.Layout({ fit: rive.Fit.Contain, alignment: rive.Alignment.Center });

  // ====== Estado ======
  let stage = "pre"; // pre | open | image
  let prePlayer  = null;
  let openPlayer = null;

  // Utilidad: limpia hijos (menos opcionalmente un id)
  function removeChildById(id){ document.getElementById(id)?.remove(); }

  // ---------- PRE (loop) ----------
  function toPre(){
    // Limpia OPEN e IMAGEN si existieran
    try { openPlayer?.stop?.(); } catch{}
    openPlayer = null;
    removeChildById("gift1-open");
    removeChildById("gift1-img");

    // Si ya existe el canvas PRE, úsalo; si no, créalo
    let pre = document.getElementById("gift1-pre");
    if (!pre){
      pre = document.createElement("canvas");
      pre.id = "gift1-pre";
      pre.width = 500; pre.height = 500;
      pre.style.display = "block";
      pre.style.background = "transparent";
      wrap.appendChild(pre);
    }

    // (Re)crear player
    try { prePlayer?.stop?.(); prePlayer?.cleanup?.(); } catch{}
    prePlayer = new rive.Rive({
      src: PRE_SRC,
      canvas: pre,
      autoplay: true,
      loop: true,
      layout: layoutContain
    });

    stage = "pre";
    // Listeners de interacción (clic para pasar a OPEN)
    ensureHandlers();
  }

  // ---------- OPEN (una sola reproducción, sin parpadeo) ----------
  function toOpen(){
    if (stage !== "pre") return;

    // Dejar el PRE visible debajo hasta que OPEN cargue
    const preCanvas = document.getElementById("gift1-pre");

    // Crear canvas OPEN por encima
    const oc = document.createElement("canvas");
    oc.id = "gift1-open";
    oc.width = 500; oc.height = 500;
    oc.style.display = "block";
    oc.style.background = "transparent";
    wrap.insertBefore(oc, preCanvas || wrap.firstChild);

    let loaded = false;
    const failSafe = setTimeout(() => {
      if (!loaded) {
        console.warn("[gift] timeout OPEN; regreso a PRE");
        oc.remove();
        toPre();
      }
    }, 4000);

    try {
      // Detén PRE, pero solo cuando OPEN ya esté listo
      openPlayer = new rive.Rive({
        src: OPEN_SRC,
        canvas: oc,
        autoplay: true,
        loop: false,
        layout: layoutContain,
        onLoad: () => {
          loaded = true;
          clearTimeout(failSafe);

          // Reproduce la animación 'Open' o la default
          try { openPlayer.play("Open"); } catch { try { openPlayer.play(); } catch{} }
          stage = "open";

          // Ahora sí, quita el PRE
          try { prePlayer?.stop?.(); } catch{}
          preCanvas?.remove();

          // Cuando termine la animación (no loopea), volvemos a PRE
          // Si prefieres quedarse en open hasta doble-click, comenta la siguiente línea:
          // openPlayer.on('stop', () => { toPre(); });
        }
      });

      // Doble-clic en el contenedor cuando está en OPEN → IMAGEN
      // (lo ponemos global al wrap para evitar problemas de pointer-events)
      // El listener se añade una sola vez en ensureHandlers()

    } catch (e) {
      console.error("[gift] error OPEN:", e);
      clearTimeout(failSafe);
      oc.remove();
      toPre();
    }
  }

  // ---------- IMAGEN (otra_tarjeta) ----------
  function toImage(){
    if (stage !== "open") return;

    // Limpia PRE y OPEN
    try { prePlayer?.stop?.(); } catch{}
    try { openPlayer?.stop?.(); } catch{}
    removeChildById("gift1-pre");
    removeChildById("gift1-open");
    openPlayer = null;

    // Crea <img>
    const img = document.createElement("img");
    img.id = "gift1-img";
    img.src = IMG_SRC;
    img.alt = "Tarjeta";
    img.style.display = "block";
    img.style.maxWidth = "720px";
    img.style.width = "100%";
    img.style.height = "auto";
    img.style.margin = "0 auto";
    img.style.userSelect = "none";
    img.draggable = false;

    wrap.appendChild(img);
    stage = "image";
    // Clic en la imagen: volver a PRE
    // (listener al wrap, ver ensureHandlers)
  }

 // ---------- Interacciones (una sola vez) ----------
let handlersReady = false;
function ensureHandlers(){
  if (handlersReady) return;

  // 1) CLIC general:
  //    - PRE  -> OPEN
  //    - IMAGE -> PRE
  wrap.addEventListener("click", (ev) => {
    if (stage === "pre") {
      ev.preventDefault();
      toOpen();
    } else if (stage === "image") {
      ev.preventDefault();
      toPre();
    }
    // En "open" no hacemos nada con click; el paso a imagen es por doble clic/tap
  }, { passive:false });

  // 2) DOBLE-CLIC de escritorio: OPEN -> IMAGEN
  wrap.addEventListener("dblclick", (ev) => {
    if (stage === "open") {
      ev.preventDefault();
      toImage();
    }
  }, { passive:false });

  // 3) DOBLE-TAP táctil: OPEN -> IMAGEN
  let lastTap = 0;
  wrap.addEventListener("touchstart", (ev) => {
    // Solo nos interesa en "open"; en "pre" el click normal ya lleva a OPEN
    if (stage !== "open") return;

    const now   = Date.now();
    const delta = now - lastTap;
    lastTap = now;

    // Dos taps rápidos (<280ms) => actuamos como "doble click"
    if (delta < 280) {
      ev.preventDefault();      // evita zoom/scroll raros
      ev.stopPropagation();
      toImage();
    }
  }, { passive:false });

  handlersReady = true;
}

  // Init
  toPre();

})();

