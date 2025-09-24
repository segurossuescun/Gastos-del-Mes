# app.py
import os
import json
from flask import Flask, request, session, jsonify, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv

load_dotenv()

from datetime import datetime, timedelta, timezone  # si no lo tienes ya

SIGNUP_MODE = os.getenv("SIGNUP_MODE", "open").lower()  # open|code|closed
TRIAL_DAYS  = int(os.getenv("TRIAL_DAYS", "7"))

# ---------------------------
# Config Flask
# ---------------------------
app = Flask(__name__, static_folder=None)
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY no configurada")
app.secret_key = SECRET_KEY

# Cookies de sesión más seguras (ajusta SECURE según si usas HTTPS)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=True   # <- en Render es HTTPS, ponlo en True
)

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL no está configurada en .env")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    future=True,
)
from functools import wraps

def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        # ajusta las claves según lo que guardes en la sesión
        if not session.get("user_id"):
            return jsonify({"ok": False, "error": "No autorizado"}), 401
        return f(*args, **kwargs)
    return wrapper

def current_user():
    """Devuelve un dict simple con info del usuario logueado (o None)."""
    if not session.get("user_id"):
        return None
    return {"id": session["user_id"], "email": session.get("email")}

# --- Auth helpers y endpoints -------------------------------------
def require_auth():
    """Compat con rutas viejas: devuelve dict {id,email} o Response 401."""
    u = current_user()
    if not u:
        return jsonify({"ok": False, "error": "No autorizado"}), 401
    return u

def require_active_subscription():
    def deco(fn):
        @wraps(fn)
        def wrapper(*a, **kw):
            if not session.get("user_id"):
                return jsonify({"ok": False, "error": "No autorizado"}), 401
            with engine.begin() as conn:
                u = conn.execute(text("""
                    SELECT is_active, plan, trial_ends_at
                    FROM users
                    WHERE id = :id
                """), {"id": session["user_id"]}).mappings().first()

            if not u or not u["is_active"]:
                return jsonify({"ok": False, "error": "Cuenta desactivada"}), 403

            # Si está en trial y ya venció → bloquear
            if (u["plan"] or "trial") == "trial":
                if u["trial_ends_at"] and u["trial_ends_at"] < datetime.now(timezone.utc):
                    return jsonify({"ok": False, "error": "Prueba finalizada — requiere suscripción"}), 402

            return fn(*a, **kw)
        return wrapper
    return deco

@app.post("/registro")
def registro():
    data = request.get_json(force=True, silent=True) or {}
    nombre   = (data.get("nombre") or "").strip()
    email    = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()
    if not email or not password:
        return jsonify({"ok": False, "error": "Faltan email o password"}), 400

    try:
        with engine.begin() as conn:
            # ¿existe?
            exists = conn.execute(
                text("SELECT 1 FROM users WHERE email = :email LIMIT 1"),
                {"email": email}
            ).scalar()
            if exists:
                return jsonify({"ok": False, "error": "El correo ya está registrado"}), 409

            pwd_hash = generate_password_hash(password)

            # trial: comienza hoy y termina en TRIAL_DAYS
            now = datetime.now(timezone.utc)
            trial_end = now + timedelta(days=TRIAL_DAYS)

            row = conn.execute(
                text("""
                INSERT INTO users (name, email, password_hash, trial_started_at, trial_ends_at, plan, is_active)
                VALUES (:name, :email, :pwd, :ts, :te, 'trial', true)
                RETURNING id, email, name
                """),
                {
                "name": nombre or email,
                "email": email,
                "pwd": pwd_hash,
                "ts": now,
                "te": trial_end,
                }
            ).mappings().first()

        # auto-login
        session.clear()
        session["user_id"] = int(row["id"])
        session["email"]   = (row["email"] or "").lower()

        return jsonify({"ok": True, "id": row["id"], "email": row["email"], "nombre": row["name"]})
    except SQLAlchemyError as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.post("/login")
def login():
    data = request.get_json(force=True, silent=True) or {}
    email    = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()
    if not email or not password:
        return jsonify({"ok": False, "error": "Faltan credenciales"}), 400

    try:
        with engine.begin() as conn:
            row = conn.execute(
                text("""
                    SELECT id, email, name, password_hash,
                           COALESCE(plan, 'trial') AS plan,
                           trial_ends_at,
                           COALESCE(is_active, true) AS is_active
                    FROM users
                    WHERE email = :email
                    LIMIT 1
                """),
                {"email": email}
            ).mappings().first()

            if not row or not check_password_hash(row["password_hash"], password):
                return jsonify({"ok": False, "error": "Usuario o contraseña inválidos"}), 401

            if not row["is_active"]:
                return jsonify({"ok": False, "error": "Cuenta desactivada"}), 403

            # calcular días restantes (solo aplica a trial)
            days_left = None
            if row["plan"] == "trial" and row["trial_ends_at"]:
                days_left = (row["trial_ends_at"].date() - datetime.now(timezone.utc).date()).days

                # trial vencido → bloquear login
                if days_left < 0:
                    return jsonify({
                        "ok": False,
                        "error": "Prueba finalizada — requiere suscripción",
                        "plan": row["plan"],
                        "days_left": days_left
                    }), 402

            # último login
            conn.execute(text("UPDATE users SET last_login_at = now() WHERE id = :id"),
                         {"id": row["id"]})

        # login OK → setear sesión
        session.clear()
        session["user_id"] = int(row["id"])
        session["email"]   = (row["email"] or "").lower()

        return jsonify({
            "ok": True,
            "id": row["id"],
            "email": row["email"],
            "nombre": row["name"],
            "plan": row["plan"],
            "days_left": days_left  # null si es paid o sin fecha
        })
    except SQLAlchemyError as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.post("/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})

@app.get("/session")
def session_info():
    u = current_user()            # usa session["user_id"] y session["email"]
    if not u:
        return jsonify({"ok": False}), 401
    return jsonify({"ok": True, "user": u})

@app.get("/account_status")
@login_required
def account_status():
    with engine.begin() as conn:
        u = conn.execute(text("""
          SELECT plan, is_active, trial_ends_at
          FROM users WHERE id=:id
        """), {"id": session["user_id"]}).mappings().first()
    days_left = None
    if u and u["trial_ends_at"]:
        days_left = (u["trial_ends_at"].date() - datetime.now(timezone.utc).date()).days
    return jsonify({"ok": True, **u, "days_left": days_left})

# ===========================
# Compat: detector de columnas
# ===========================
COLUMN_CACHE = {}

def table_has(table: str, column: str) -> bool:
    key = (table, column)
    if key in COLUMN_CACHE:
        return COLUMN_CACHE[key]
    try:
        with engine.begin() as conn:
            exists = conn.execute(text("""
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name   = :t
                  AND column_name  = :c
                LIMIT 1
            """), {"t": table, "c": column}).first() is not None
        COLUMN_CACHE[key] = exists
        return exists
    except Exception:
        return False

# ---------------------------
# Helpers
# ---------------------------
def json_error(msg, code=400):
    return jsonify({"ok": False, "error": str(msg)}), code

def load_default_config():
    try:
        with open("config_default.json", "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {
            "colores": {"fondo": "#ffffff", "boton_inicio": "#9a27f7", "boton_fin": "#e762d5"},
            "tarjetaResumen": {"colorInicio": "#fa9be2", "colorFinal": "#ffffff"},
            "fuentes": {"titulo": "Arial", "secundario": "Arial", "colorTitulo": "#333333", "colorSecundario": "#555555"},
            "logo": "",
            "vistas": ["ingresos","bills","egresos","pagos"],
            "personas": [],
            "bills_conf": [],
            "egresos_conf": [],
            "medios_pago": [],
            "ingresos_fuentes": [],
            "pagos_config": {"bills":[],"personas":[],"medios":[],"submediosPorMedio":{}},
            "apodo": "",
            "telefono": ""
        }

def row_to_dict(row):
    if row is None:
        return None
    return dict(row._mapping)

@app.get("/config_default")
def config_default():
    return jsonify(load_default_config())

# ---------------------------
# Rutas de archivos (front)
# ---------------------------
@app.route("/")
def home():
    # Sirve siempre index.html; tu JS decide mostrar login/privado
    return send_from_directory(".", "index.html")

@app.route("/static/<path:filename>")
def static_files(filename):
    return send_from_directory("static", filename)

# --- Archivos públicos permitidos explícitamente ---
PUBLIC_ALLOWLIST = {
    "index.html",
    "manifest.json",
    "service-worker.js",
}

@app.route("/<path:filename>")
def other_files(filename):
    if filename in PUBLIC_ALLOWLIST:
        return send_from_directory(".", filename)
    # 404 intencional para lo demás
    return json_error("Not found", 404)

# ---------------------------
# Configuración
# Tabla: configuracion (cliente TEXT, ... jsonb, apodo, telefono)
# ---------------------------
@app.get("/cargar_configuracion")
@require_active_subscription()
def cargar_configuracion():
    auth = require_auth()
    if not isinstance(auth, dict): 
        return auth
    uid, email = auth["id"], auth["email"]

    try:
        defaults = load_default_config()
        with engine.begin() as conn:
            row = conn.execute(text("""
              SELECT logo, vistas, personas, bills_conf, egresos_conf, medios_pago,
                     ingresos_fuentes, pagos_config,
                     color_fondo, color_btn_inicio, color_btn_fin,
                     color_tarjeta_inicio, color_tarjeta_fin,
                     color_titulo, color_secundario, fuente_titulo, fuente_cuerpo
              FROM public.configuracion
              WHERE user_id = :uid OR cliente = :email
              ORDER BY (user_id IS NOT NULL) DESC
              LIMIT 1
            """), {"uid": uid, "email": email}).mappings().first()

        if not row:
            # --- alias de contrato unificado para el frontend ---
            defaults["bills"] = defaults.get("bills") or defaults.get("bills_conf") or []
            defaults["egresos_categorias"] = defaults.get("egresos_categorias") or defaults.get("egresos_conf") or []
            defaults["pagos"] = defaults.get("pagos") or defaults.get("pagos_config") or {
                "bills": [],
                "personas": [],
                "medios": [],
                "submediosPorMedio": {}
            }

            return jsonify(defaults)

        def fb_list(val, dflt):
            return dflt if not val else val

        cfg = {
          "colores": {
            "fondo":        row["color_fondo"]        or defaults["colores"]["fondo"],
            "boton_inicio": row["color_btn_inicio"]   or defaults["colores"]["boton_inicio"],
            "boton_fin":    row["color_btn_fin"]      or defaults["colores"]["boton_fin"],
          },
          "tarjetaResumen": {
            "colorInicio":  row["color_tarjeta_inicio"] or defaults["tarjetaResumen"]["colorInicio"],
            "colorFinal":   row["color_tarjeta_fin"]    or defaults["tarjetaResumen"]["colorFinal"],
          },
          "fuentes": {
            "titulo":         row["fuente_titulo"]    or defaults["fuentes"]["titulo"],
            "secundario":     row["fuente_cuerpo"]    or defaults["fuentes"]["secundario"],
            "colorTitulo":    row["color_titulo"]     or defaults["fuentes"]["colorTitulo"],
            "colorSecundario":row["color_secundario"] or defaults["fuentes"]["colorSecundario"],
          },
          "logo":             row["logo"] or defaults["logo"],
          "vistas":           fb_list(row["vistas"], defaults["vistas"]),
          "personas":         fb_list(row["personas"], defaults["personas"]),
          "bills_conf":       fb_list(row["bills_conf"], defaults.get("bills_conf") or defaults.get("bills") or []),
          "egresos_conf":     fb_list(row["egresos_conf"], defaults.get("egresos_conf") or defaults.get("egresos_categorias") or []),
          "medios_pago":      fb_list(row["medios_pago"], defaults["medios_pago"]),
          "ingresos_fuentes": fb_list(row["ingresos_fuentes"], defaults["ingresos_fuentes"]),
          "pagos_config":     row["pagos_config"] or defaults["pagos_config"],
        }

        # --- unificación de contrato (alias finales para el frontend) ---
        cfg["bills"] = cfg.get("bills_conf") or []
        cfg["egresos_categorias"] = cfg.get("egresos_conf") or []
        cfg["pagos"] = cfg.get("pagos_config") or {
            "bills": [],
            "personas": [],
            "medios": [],
            "submediosPorMedio": {}
        }

        return jsonify(cfg)
    except SQLAlchemyError as e:
        return json_error(str(e), 500)

# /guardar_configuracion
@app.post("/guardar_configuracion")
@require_active_subscription()
def guardar_configuracion():
    auth = require_auth()
    if not isinstance(auth, dict):
        return auth
    uid = auth["id"]; email = auth["email"]

    data = request.get_json(force=True, silent=True) or {}
    colores  = data.get("colores") or {}
    fuentes  = data.get("fuentes") or {}
    tarjeta  = data.get("tarjetaResumen") or data.get("tarjeta_resumen") or {}

    vistas           = data.get("vistas") or []
    personas         = data.get("personas") or []
    bills_conf       = data.get("bills_conf") or data.get("bills") or []
    egresos_conf     = data.get("egresos_conf") or data.get("egresos_categorias") or []
    medios_pago      = data.get("medios_pago") or []
    ingresos_fuentes = data.get("ingresos_fuentes") or []
    pagos_config     = data.get("pagos_config") or data.get("pagos") or {}
    logo             = (data.get("logo") or "").strip()

    color_fondo          = (colores.get("fondo") or "#f9f9f9").strip()
    color_btn_inicio     = (colores.get("boton_inicio") or "#9a27f7").strip()
    color_btn_fin        = (colores.get("boton_fin") or "#e762d5").strip()
    color_tarjeta_inicio = (tarjeta.get("colorInicio") or "#fa9be2").strip()
    color_tarjeta_fin    = (tarjeta.get("colorFinal") or "#ffffff").strip()
    fuente_titulo        = (fuentes.get("titulo") or "Gochi Hand").strip()
    fuente_cuerpo        = (fuentes.get("secundario") or "Arial").strip()
    color_titulo         = (fuentes.get("colorTitulo") or "#553071").strip()
    color_secundario     = (fuentes.get("colorSecundario") or "#8b68b0").strip()

    try:
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO public.configuracion (
                user_id, cliente, logo, vistas, personas, bills_conf, egresos_conf,
                medios_pago, ingresos_fuentes, pagos_config, tarjeta_resumen,
                colores, fuentes,
                color_fondo, color_btn_inicio, color_btn_fin,
                color_tarjeta_inicio, color_tarjeta_fin,
                color_titulo, color_secundario, fuente_titulo, fuente_cuerpo,
                updated_at
                )
                VALUES (
                :uid, :email, :logo,
                CAST(:vistas           AS jsonb),
                CAST(:personas         AS jsonb),
                CAST(:bills_conf       AS jsonb),
                CAST(:egresos_conf     AS jsonb),
                CAST(:medios_pago      AS jsonb),
                CAST(:ingresos_fuentes AS jsonb),
                CAST(:pagos_config     AS jsonb),
                jsonb_build_object('colorInicio', :color_tarjeta_inicio, 'colorFinal', :color_tarjeta_fin),
                jsonb_build_object('fondo', :color_fondo, 'boton_inicio', :color_btn_inicio, 'boton_fin', :color_btn_fin),
                jsonb_build_object('titulo', :fuente_titulo, 'secundario', :fuente_cuerpo,
                                    'colorTitulo', :color_titulo, 'colorSecundario', :color_secundario),
                :color_fondo, :color_btn_inicio, :color_btn_fin,
                :color_tarjeta_inicio, :color_tarjeta_fin,
                :color_titulo, :color_secundario, :fuente_titulo, :fuente_cuerpo,
                now()
                )
                ON CONFLICT (user_id) DO UPDATE SET
                logo             = EXCLUDED.logo,
                vistas           = EXCLUDED.vistas,
                personas         = EXCLUDED.personas,
                bills_conf       = EXCLUDED.bills_conf,
                egresos_conf     = EXCLUDED.egresos_conf,
                medios_pago      = EXCLUDED.medios_pago,
                ingresos_fuentes = EXCLUDED.ingresos_fuentes,
                pagos_config     = EXCLUDED.pagos_config,
                tarjeta_resumen  = EXCLUDED.tarjeta_resumen,
                colores          = EXCLUDED.colores,
                fuentes          = EXCLUDED.fuentes,
                color_fondo          = EXCLUDED.color_fondo,
                color_btn_inicio     = EXCLUDED.color_btn_inicio,
                color_btn_fin        = EXCLUDED.color_btn_fin,
                color_tarjeta_inicio = EXCLUDED.color_tarjeta_inicio,
                color_tarjeta_fin    = EXCLUDED.color_tarjeta_fin,
                color_titulo         = EXCLUDED.color_titulo,
                color_secundario     = EXCLUDED.color_secundario,
                fuente_titulo        = EXCLUDED.fuente_titulo,
                fuente_cuerpo        = EXCLUDED.fuente_cuerpo,
                updated_at = now()
            """), {
                "uid": uid, "email": email, "logo": logo,
                "vistas": json.dumps(vistas, ensure_ascii=False),
                "personas": json.dumps(personas, ensure_ascii=False),
                "bills_conf": json.dumps(bills_conf, ensure_ascii=False),
                "egresos_conf": json.dumps(egresos_conf, ensure_ascii=False),
                "medios_pago": json.dumps(medios_pago, ensure_ascii=False),
                "ingresos_fuentes": json.dumps(ingresos_fuentes, ensure_ascii=False),
                "pagos_config": json.dumps(pagos_config, ensure_ascii=False),
                "color_fondo": color_fondo, "color_btn_inicio": color_btn_inicio, "color_btn_fin": color_btn_fin,
                "color_tarjeta_inicio": color_tarjeta_inicio, "color_tarjeta_fin": color_tarjeta_fin,
                "color_titulo": color_titulo, "color_secundario": color_secundario,
                "fuente_titulo": fuente_titulo, "fuente_cuerpo": fuente_cuerpo,
            })
        return jsonify({"ok": True, "mensaje": "Configuración guardada"})
    except SQLAlchemyError as e:
        return json_error(str(e), 500)

@app.post("/restablecer_configuracion")
@require_active_subscription()
def restablecer_configuracion():
    auth = require_auth()
    if not isinstance(auth, dict): 
        return auth
    uid = auth["id"]; email = auth["email"]

    defaults = load_default_config()

    # --- defaults típicos ---
    colores          = defaults.get("colores", {}) or {}
    tarjeta_resumen  = defaults.get("tarjetaResumen", {}) or {}
    fuentes          = defaults.get("fuentes", {}) or {}
    logo             = defaults.get("logo", "") or ""
    vistas           = defaults.get("vistas", []) or []
    personas         = defaults.get("personas", []) or []
    bills_conf       = defaults.get("bills") or defaults.get("bills_conf") or []
    egresos_conf     = defaults.get("egresos_categorias") or defaults.get("egresos_conf") or []
    medios_pago      = defaults.get("medios_pago", []) or []
    ingresos_fuentes = defaults.get("ingresos_fuentes", []) or []
    pagos_config     = defaults.get("pagos") or defaults.get("pagos_config") or {}

    # --- columnas planas (las que usa /cargar_configuracion) ---
    color_fondo          = (colores.get("fondo") or "#f9f9f9").strip()
    color_btn_inicio     = (colores.get("boton_inicio") or "#9a27f7").strip()
    color_btn_fin        = (colores.get("boton_fin") or "#e762d5").strip()
    color_tarjeta_inicio = (tarjeta_resumen.get("colorInicio") or "#fa9be2").strip()
    color_tarjeta_fin    = (tarjeta_resumen.get("colorFinal") or "#ffffff").strip()
    fuente_titulo        = (fuentes.get("titulo") or "Gochi Hand").strip()
    fuente_cuerpo        = (fuentes.get("secundario") or "Arial").strip()
    color_titulo         = (fuentes.get("colorTitulo") or "#553071").strip()
    color_secundario     = (fuentes.get("colorSecundario") or "#8b68b0").strip()

    try:
        with engine.begin() as conn:
            # limpiar datos del usuario
            conn.execute(text("DELETE FROM public.pagos    WHERE user_id=:u"), {"u": uid})
            conn.execute(text("DELETE FROM public.bills    WHERE user_id=:u"), {"u": uid})
            conn.execute(text("DELETE FROM public.egresos  WHERE user_id=:u"), {"u": uid})
            conn.execute(text("DELETE FROM public.ingresos WHERE user_id=:u"), {"u": uid})

            # upsert de configuración: JSON + columnas planas
            conn.execute(text("""
                INSERT INTO public.configuracion (
                    user_id, cliente, logo, 
                    vistas, personas, bills_conf, egresos_conf, medios_pago, ingresos_fuentes, pagos_config,
                    tarjeta_resumen, colores, fuentes,
                    color_fondo, color_btn_inicio, color_btn_fin,
                    color_tarjeta_inicio, color_tarjeta_fin,
                    color_titulo, color_secundario, fuente_titulo, fuente_cuerpo,
                    updated_at
                )
                VALUES (
                    :uid, :email, :logo,
                    CAST(:vistas           AS jsonb),
                    CAST(:personas         AS jsonb),
                    CAST(:bills_conf       AS jsonb),
                    CAST(:egresos_conf     AS jsonb),
                    CAST(:medios_pago      AS jsonb),
                    CAST(:ingresos_fuentes AS jsonb),
                    CAST(:pagos_config     AS jsonb),
                    CAST(:tarjeta_resumen  AS jsonb),
                    CAST(:colores          AS jsonb),
                    CAST(:fuentes          AS jsonb),
                    :color_fondo, :color_btn_inicio, :color_btn_fin,
                    :color_tarjeta_inicio, :color_tarjeta_fin,
                    :color_titulo, :color_secundario, :fuente_titulo, :fuente_cuerpo,
                    now()
                )
                ON CONFLICT (user_id) DO UPDATE SET
                    cliente             = EXCLUDED.cliente,
                    logo                = EXCLUDED.logo,
                    vistas              = EXCLUDED.vistas,
                    personas            = EXCLUDED.personas,
                    bills_conf          = EXCLUDED.bills_conf,
                    egresos_conf        = EXCLUDED.egresos_conf,
                    medios_pago         = EXCLUDED.medios_pago,
                    ingresos_fuentes    = EXCLUDED.ingresos_fuentes,
                    pagos_config        = EXCLUDED.pagos_config,
                    tarjeta_resumen     = EXCLUDED.tarjeta_resumen,
                    colores             = EXCLUDED.colores,
                    fuentes             = EXCLUDED.fuentes,
                    color_fondo         = EXCLUDED.color_fondo,
                    color_btn_inicio    = EXCLUDED.color_btn_inicio,
                    color_btn_fin       = EXCLUDED.color_btn_fin,
                    color_tarjeta_inicio= EXCLUDED.color_tarjeta_inicio,
                    color_tarjeta_fin   = EXCLUDED.color_tarjeta_fin,
                    color_titulo        = EXCLUDED.color_titulo,
                    color_secundario    = EXCLUDED.color_secundario,
                    fuente_titulo       = EXCLUDED.fuente_titulo,
                    fuente_cuerpo       = EXCLUDED.fuente_cuerpo,
                    updated_at          = now()
            """), {
                "uid": uid, "email": email, "logo": logo,
                "vistas": json.dumps(vistas, ensure_ascii=False),
                "personas": json.dumps(personas, ensure_ascii=False),
                "bills_conf": json.dumps(bills_conf, ensure_ascii=False),
                "egresos_conf": json.dumps(egresos_conf, ensure_ascii=False),
                "medios_pago": json.dumps(medios_pago, ensure_ascii=False),
                "ingresos_fuentes": json.dumps(ingresos_fuentes, ensure_ascii=False),
                "pagos_config": json.dumps(pagos_config, ensure_ascii=False),
                "tarjeta_resumen": json.dumps(tarjeta_resumen, ensure_ascii=False),
                "colores": json.dumps(colores, ensure_ascii=False),
                "fuentes": json.dumps(fuentes, ensure_ascii=False),
                "color_fondo": color_fondo,
                "color_btn_inicio": color_btn_inicio,
                "color_btn_fin": color_btn_fin,
                "color_tarjeta_inicio": color_tarjeta_inicio,
                "color_tarjeta_fin": color_tarjeta_fin,
                "color_titulo": color_titulo,
                "color_secundario": color_secundario,
                "fuente_titulo": fuente_titulo,
                "fuente_cuerpo": fuente_cuerpo,
            })

            # --- alias de contrato unificado para el frontend ---
            defaults["bills"] = defaults.get("bills") or defaults.get("bills_conf") or []
            defaults["egresos_categorias"] = defaults.get("egresos_categorias") or defaults.get("egresos_conf") or []
            defaults["pagos"] = defaults.get("pagos") or defaults.get("pagos_config") or {
                "bills": [],
                "personas": [],
                "medios": [],
                "submediosPorMedio": {}
            }

        return jsonify({"ok": True, "mensaje": "Configuración y datos restablecidos", "config": defaults}), 200
    except SQLAlchemyError as e:
        return json_error(str(e), 500)

# ---------------------------
# Perfil (apodo/telefono) en public.perfiles
# ---------------------------
@app.get("/cargar_perfil")
@require_active_subscription()
def cargar_perfil():
    auth = require_auth()
    if not isinstance(auth, dict): 
        return auth
    uid = auth["id"]
    try:
        with engine.begin() as conn:
            row = conn.execute(
                text("SELECT apodo, telefono FROM public.perfiles WHERE user_id = :uid"),
                {"uid": uid}
            ).mappings().first()

        if not row:
            return jsonify({"apodo": "", "telefono": ""})

        d = dict(row)  # <-- convertir RowMapping -> dict
        return jsonify({"apodo": d.get("apodo") or "", "telefono": d.get("telefono") or ""})
    except SQLAlchemyError as e:
        return json_error(str(e), 500)

from datetime import datetime  # asegúrate de tener esto arriba

@app.post("/guardar_perfil")
@require_active_subscription()
def guardar_perfil():
    auth = require_auth()
    if not isinstance(auth, dict):
        return auth
    uid = auth["id"]

    data = request.get_json(force=True, silent=True) or {}
    apodo = (data.get("apodo") or "").strip()
    telefono = (data.get("telefono") or "").strip()

    try:
        with engine.begin() as conn:
            row = conn.execute(text("""
                INSERT INTO public.perfiles AS p (user_id, apodo, telefono, updated_at)
                VALUES (:uid, :apodo, :tel, now())
                ON CONFLICT (user_id) DO UPDATE
                  SET apodo      = EXCLUDED.apodo,
                      telefono   = EXCLUDED.telefono,
                      updated_at = now()
                RETURNING p.apodo, p.telefono, p.updated_at
            """), {"uid": uid, "apodo": apodo, "tel": telefono}).mappings().first()

        # Convertimos RowMapping a dict y serializamos datetime
        resp = dict(row)
        if isinstance(resp.get("updated_at"), datetime):
            resp["updated_at"] = resp["updated_at"].isoformat()

        return jsonify({"ok": True, **resp})

    except SQLAlchemyError as e:
        return json_error(str(e), 500)

# ---------------------------
# Ingresos
# Tabla: ingresos(id, cliente, fecha, monto, fuente, nota)
# ---------------------------
@app.get("/cargar_ingresos")
@require_active_subscription()
def cargar_ingresos():
    auth = require_auth()
    if not isinstance(auth, dict):
        return auth
    uid = auth["id"]
    try:
        with engine.begin() as conn:
            rows = conn.execute(text("""
                SELECT id, fecha, monto, fuente, nota
                FROM public.ingresos
                WHERE user_id = :u
                ORDER BY fecha DESC, id DESC
            """), {"u": uid}).all()
        out = []
        for r in rows:
            d = row_to_dict(r)
            out.append({
                "id": d["id"],
                "fecha": d["fecha"].isoformat() if d["fecha"] else None,
                "monto": float(d["monto"] or 0),
                "fuente": d["fuente"],
                "nota": d["nota"],
            })
        return jsonify(out)
    except SQLAlchemyError as e:
        return json_error(str(e), 500)

@app.post("/guardar_ingreso")
@require_active_subscription()
def guardar_ingreso():
    auth = require_auth()
    if not isinstance(auth, dict):
        return auth
    uid = auth["id"]

    data = request.get_json(force=True, silent=True) or {}
    fecha  = (data.get("fecha") or "").strip()
    monto  = data.get("monto")
    fuente = (data.get("fuente") or "").strip()
    nota   = (data.get("nota") or "").strip()
    if not fecha or monto is None or not fuente:
        return json_error("Campos requeridos: fecha, monto, fuente", 400)

    try:
        with engine.begin() as conn:
            row = conn.execute(text("""
                INSERT INTO public.ingresos (user_id, fecha, monto, fuente, nota, created_at)
                VALUES (:u, :fe, :mo, :fu, :no, now())
                RETURNING id, fecha, monto, fuente, nota
            """), {"u": uid, "fe": fecha, "mo": monto, "fu": fuente, "no": nota}).first()
        d = row_to_dict(row)
        return jsonify({
            "id": d["id"],
            "fecha": d["fecha"].isoformat() if d["fecha"] else None,
            "monto": float(d["monto"] or 0),
            "fuente": d["fuente"],
            "nota": d["nota"],
        })
    except SQLAlchemyError as e:
        return json_error(str(e), 500)

@app.post("/eliminar_ingreso")
@require_active_subscription()
def eliminar_ingreso():
    auth = require_auth()
    if not isinstance(auth, dict): return auth
    uid = auth["id"]
    data = request.get_json(force=True, silent=True) or {}
    _id = data.get("id")
    if not _id: return json_error("Falta id", 400)
    try:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM public.ingresos WHERE id=:id AND user_id=:u"),
                         {"id": _id, "u": uid})
        return jsonify({"ok": True})
    except SQLAlchemyError as e:
        return json_error(str(e), 500)

# ---------------------------
# Bills
# Tabla: bills(id, cliente, fecha, tipo, monto, montos jsonb)
# ---------------------------
@app.get("/cargar_bills")
@require_active_subscription()
def cargar_bills():
    auth = require_auth()
    if not isinstance(auth, dict):
        return auth
    uid = auth["id"]
    email = auth["email"]

    try:
        use_nombre = table_has("bills", "nombre")   # nuevo
        use_userid = table_has("bills", "user_id")  # nuevo owner

        name_col = "nombre" if use_nombre else "tipo"
        # columnas opcionales (existentes solo en el esquema nuevo)
        if table_has("bills", "personas"):
            extra_cols = ", personas, notas, total"
        else:
            extra_cols = ", NULL::text[] AS personas, NULL::text AS notas, NULL::numeric AS total"

        owner_where = "user_id = :u" if use_userid else "cliente = :cl"

        sql = f"""
            SELECT id, fecha, {name_col} AS nombre, monto, montos{extra_cols}
            FROM public.bills
            WHERE {owner_where}
            ORDER BY fecha DESC, id DESC
        """

        params = {"u": uid, "cl": email}
        with engine.begin() as conn:
            rows = conn.execute(text(sql), params).mappings().all()

        out = []
        for d in rows:
            out.append({
                "id": d["id"],
                "fecha": d["fecha"].isoformat() if d["fecha"] else None,
                "nombre": d["nombre"],
                "tipo": d["nombre"],                  # compat con front viejo
                "monto": float(d["monto"] or 0),
                "montos": d["montos"] or {},
                "personas": d.get("personas") or [],
                "notas": d.get("notas"),
                "total": float(d["total"]) if d.get("total") is not None else None,
            })
        return jsonify(out)

    except SQLAlchemyError as e:
        return json_error(str(e), 500)

@app.post("/guardar_bills")
@require_active_subscription()
def guardar_bills():
    auth = require_auth()
    if not isinstance(auth, dict):
        return auth
    uid = auth["id"]
    email = auth["email"]

    data = request.get_json(force=True, silent=True) or {}

    # normalizar fecha
    fecha = data.get("fecha")
    if isinstance(fecha, str):
        fecha = fecha.strip()
    else:
        fecha = str(fecha or "").strip()

    nombre = (data.get("nombre") or data.get("tipo") or "").strip()
    monto  = data.get("monto")
    montos = data.get("montos") or {}
    personas = data.get("personas") or None
    notas    = (data.get("notas") or "").strip() or None
    total    = data.get("total")

    if not fecha or not nombre or monto is None:
        return json_error("Campos requeridos: fecha, nombre/tipo, monto", 400)

    try:
        use_nombre = table_has("bills", "nombre")
        use_userid = table_has("bills", "user_id")
        has_personas = table_has("bills", "personas")

        name_col = "nombre" if use_nombre else "tipo"
        owner_col = "user_id" if use_userid else "cliente"

        cols = [owner_col, "fecha", name_col, "monto", "montos"]
        vals = [":owner", ":fe", ":no", ":mo", "CAST(:mt AS jsonb)"]

        if has_personas:
            cols += ["personas", "notas", "total"]
            vals += [":pe", ":nt", ":to"]

        cols_str = ", ".join(cols)
        vals_str = ", ".join(vals)

        sql = f"""
            INSERT INTO public.bills ({cols_str}, created_at)
            VALUES ({vals_str}, now())
            RETURNING id, fecha, {name_col} AS nombre, monto, montos
                     {", personas, notas, total" if has_personas else ", NULL::text[] AS personas, NULL::text AS notas, NULL::numeric AS total"}
        """

        params = {
            "owner": uid if use_userid else email,
            "fe": fecha, "no": nombre, "mo": monto,
            "mt": json.dumps(montos, ensure_ascii=False),
            "pe": personas, "nt": notas, "to": total
        }

        with engine.begin() as conn:
            row = conn.execute(text(sql), params).mappings().first()

        return jsonify({"ok": True, "bill": {
            "id": row["id"],
            "fecha": row["fecha"].isoformat() if row["fecha"] else None,
            "nombre": row["nombre"],
            "tipo": row["nombre"],  # compat
            "monto": float(row["monto"] or 0),
            "montos": row["montos"] or {},
            "personas": row.get("personas") or [],
            "notas": row.get("notas"),
            "total": float(row["total"]) if row.get("total") is not None else None,
        }})

    except SQLAlchemyError as e:
        return json_error(str(e), 500)

@app.post("/eliminar_bill")
@require_active_subscription()
def eliminar_bill():
    auth = require_auth()
    if not isinstance(auth, dict):
        return auth
    uid = auth["id"]
    email = auth["email"]

    data = request.get_json(force=True, silent=True) or {}
    bill_id = data.get("id")
    if not bill_id:
        return json_error("Falta id", 400)

    try:
        use_userid = table_has("bills", "user_id")
        owner_where = "user_id = :owner" if use_userid else "cliente = :owner"

        sql = f"DELETE FROM public.bills WHERE id = :id AND {owner_where}"
        params = {"id": bill_id, "owner": uid if use_userid else email}

        with engine.begin() as conn:
            conn.execute(text(sql), params)

        return jsonify({"ok": True})
    except SQLAlchemyError as e:
        return json_error(str(e), 500)

# ---------------------------
# Egresos
# Tabla: egresos(id, cliente, fecha, monto, categoria, subcategoria, medio, submedio, persona, nota)
# ---------------------------

@app.get("/cargar_egresos")
@require_active_subscription()
def cargar_egresos():
    auth = require_auth()
    if not isinstance(auth, dict): 
        return auth
    uid = auth["id"]
    try:
        with engine.begin() as conn:
            rows = conn.execute(text("""
                SELECT id, fecha, monto, categoria, subcategoria, medio, submedio, persona, nota
                FROM public.egresos
                WHERE user_id = :uid
                ORDER BY fecha DESC, id DESC
            """), {"uid": uid}).mappings().all()

        out = []
        for d in rows:
            out.append({
                "id": d["id"],
                "fecha": d["fecha"].isoformat() if d["fecha"] else None,
                "monto": float(d["monto"] or 0),
                "categoria": d["categoria"],
                "subcategoria": d["subcategoria"],
                "medio": d["medio"],
                "submedio": d["submedio"],
                "persona": d["persona"],
                "nota": d["nota"],
            })
        return jsonify(out)
    except SQLAlchemyError as e:
        return json_error(str(e), 500)


@app.post("/guardar_egreso")
@require_active_subscription()
def guardar_egreso():
    auth = require_auth()
    if not isinstance(auth, dict): 
        return auth
    uid = auth["id"]

    data = request.get_json(force=True, silent=True) or {}
    fecha = (data.get("fecha") or "").strip()
    monto = data.get("monto")
    categoria = data.get("categoria")
    if isinstance(categoria, str):
        categoria = categoria.strip()
    else:
        categoria = (categoria or "")
    subcategoria = (data.get("subcategoria") or "").strip()
    medio = (data.get("medio") or "").strip()
    submedio = (data.get("submedio") or "").strip()
    persona = (data.get("persona") or "").strip()
    nota = (data.get("nota") or "").strip()

    # Requisitos mínimos
    if not fecha or monto is None or not categoria or not medio:
        return json_error("Campos requeridos: fecha, monto, categoria, medio", 400)

    try:
        with engine.begin() as conn:
            row = conn.execute(text("""
                INSERT INTO public.egresos
                  (user_id, fecha, monto, categoria, subcategoria, medio, submedio, persona, nota, created_at)
                VALUES
                  (:uid, :fe, :mo, :ca, :sc, :me, :sm, :pe, :no, NOW())
                RETURNING id, fecha, monto, categoria, subcategoria, medio, submedio, persona, nota
            """), {
                "uid": uid, "fe": fecha, "mo": monto,
                "ca": categoria, "sc": subcategoria, "me": medio, "sm": submedio,
                "pe": persona, "no": nota
            }).mappings().first()

        return jsonify({
            "id": row["id"],
            "fecha": row["fecha"].isoformat() if row["fecha"] else None,
            "monto": float(row["monto"] or 0),
            "categoria": row["categoria"],
            "subcategoria": row["subcategoria"],
            "medio": row["medio"],
            "submedio": row["submedio"],
            "persona": row["persona"],
            "nota": row["nota"],
        })
    except SQLAlchemyError as e:
        return json_error(str(e), 500)


@app.post("/eliminar_egreso")
@require_active_subscription()
def eliminar_egreso():
    auth = require_auth()
    if not isinstance(auth, dict):
        return auth
    uid = auth["id"]

    data = request.get_json(force=True, silent=True) or {}
    _id = data.get("id")
    if not _id:
        return json_error("Falta id", 400)

    try:
        with engine.begin() as conn:
            conn.execute(
                text("DELETE FROM public.egresos WHERE id = :id AND user_id = :uid"),
                {"id": _id, "uid": uid}
            )
        return jsonify({"ok": True})
    except SQLAlchemyError as e:
        return json_error(str(e), 500)

# ---------------------------
# Pagos
# Tabla: pagos(id, cliente, fecha, bill, persona, medio, submedio, monto, nota)
# ---------------------------
@app.get("/cargar_pagos")
@require_active_subscription()
def cargar_pagos():
    auth = require_auth()
    if not isinstance(auth, dict): return auth
    uid = auth["id"]
    try:
        with engine.begin() as conn:
            rows = conn.execute(text("""
                SELECT id, bill, monto, persona, medio, submedio, fecha, nota
                FROM pagos
                WHERE user_id=:uid
                ORDER BY fecha DESC, id DESC
            """), {"uid": uid}).mappings().all()
        out = []
        for d in rows:
            out.append({
                "id": d["id"], "bill": d["bill"], "monto": float(d["monto"] or 0),
                "persona": d["persona"], "medio": d["medio"], "submedio": d["submedio"],
                "fecha": d["fecha"].isoformat() if d["fecha"] else None, "nota": d["nota"],
            })
        return jsonify(out)
    except SQLAlchemyError as e:
        return json_error(str(e), 500)

@app.post("/guardar_pago")
@require_active_subscription()
def guardar_pago():
    auth = require_auth()
    if not isinstance(auth, dict): return auth
    uid = auth["id"]
    data = request.get_json(force=True, silent=True) or {}
    bill = (data.get("bill") or "").strip()
    monto = data.get("monto")
    persona = (data.get("persona") or "").strip()
    medio = (data.get("medio") or "").strip()
    submedio = (data.get("submedio") or "").strip()
    fecha = (data.get("fecha") or "").strip()
    nota = (data.get("nota") or "").strip()
    if not bill or monto is None or not persona or not fecha:
        return json_error("Campos requeridos: bill, monto, persona, fecha", 400)
    try:
        with engine.begin() as conn:
            row = conn.execute(text("""
                INSERT INTO pagos (user_id, bill, monto, persona, medio, submedio, fecha, nota, created_at)
                VALUES (:uid,:bi,:mo,:pe,:me,:sm,:fe,:no, NOW())
                RETURNING id, bill, monto, persona, medio, submedio, fecha, nota
            """), {"uid": uid, "bi": bill, "mo": monto, "pe": persona, "me": medio, "sm": submedio, "fe": fecha, "no": nota}).mappings().first()
        return jsonify({"ok": True, "pago": {
            "id": row["id"], "bill": row["bill"], "monto": float(row["monto"] or 0),
            "persona": row["persona"], "medio": row["medio"], "submedio": row["submedio"],
            "fecha": row["fecha"].isoformat() if row["fecha"] else None, "nota": row["nota"],
        }})
    except SQLAlchemyError as e:
        return json_error(str(e), 500)

@app.post("/eliminar_pago")
@require_active_subscription()
def eliminar_pago():
    auth = require_auth()
    if not isinstance(auth, dict): return auth
    uid = auth["id"]
    data = request.get_json(force=True, silent=True) or {}
    _id = data.get("id")
    if not _id: return json_error("Falta id", 400)
    try:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM public.pagos WHERE id=:id AND user_id=:u"),
                         {"id": _id, "u": uid})
        return jsonify({"ok": True})
    except SQLAlchemyError as e:
        return json_error(str(e), 500)

# ---------------------------
# Run
# ---------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

