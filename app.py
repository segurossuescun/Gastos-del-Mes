# app.py
import os
import json
from flask import Flask, request, session, jsonify, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv
import stripe

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

# ⚠️ Leer desde .env (no lo fuerces a True en local)
SESSION_COOKIE_SECURE_ENV = os.getenv("SESSION_COOKIE_SECURE", "true").lower() == "true"
SESSION_COOKIE_SAMESITE_ENV = os.getenv("SESSION_COOKIE_SAMESITE", "Lax")

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE=SESSION_COOKIE_SAMESITE_ENV,
    SESSION_COOKIE_SECURE=SESSION_COOKIE_SECURE_ENV
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

from datetime import datetime, timezone, timedelta
from math import ceil

def _g(obj, key, default=None):
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)

def _to_dt(ts):
    try:
        if ts is None:
            return None
        return datetime.fromtimestamp(int(ts), tz=timezone.utc)  # Stripe: segundos
    except Exception:
        return None

def _to_iso(val):
    dt = val if isinstance(val, datetime) else _to_dt(val)
    return dt.isoformat() if dt else None

def add_months_utc(dt, months=1):
    """Suma meses evitando líos con 29/30/31 (clamp a día 28)."""
    if not isinstance(dt, datetime):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    y = dt.year
    m = dt.month + months
    y += (m - 1) // 12
    m = ((m - 1) % 12) + 1
    d = min(dt.day, 28)
    try:
        return dt.replace(year=y, month=m, day=d)
    except Exception:
        return dt + timedelta(days=30*months)  # fallback tosco, pero seguro

def advance_to_future(dt, interval, count=1):
    """Si dt ≤ ahora, avanza por el intervalo hasta quedar en el futuro."""
    if not isinstance(dt, datetime):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    epsilon = timedelta(minutes=5)
    if dt > now + epsilon:
        return dt

    c = max(1, int(count or 1))
    if interval == "month":
        for _ in range(24):
            dt = add_months_utc(dt, c)
            if dt > now + epsilon:
                return dt
    elif interval == "week":
        step = timedelta(weeks=c)
        while dt <= now + epsilon:
            dt += step
        return dt
    elif interval == "day":
        step = timedelta(days=c)
        while dt <= now + epsilon:
            dt += step
        return dt
    elif interval == "year":
        for _ in range(10):
            dt = add_months_utc(dt, 12*c)
            if dt > now + epsilon:
                return dt
    return dt

def _human_next_message(days):
    """Texto lindo + emoji para el contador."""
    if days is None:
        return None
    if days <= 0:
        return "El cobro es hoy 🎉"
    if days == 1:
        return "Mañana ✨"
    if days <= 3:
        return f"Faltan {days} días ⏳"
    if days == 7:
        return "En una semana 🗓️"
    if days >= 28:
        return "En ~1 mes 📆"
    return f"Faltan {days} días 📅"

def _es_fecha_corta(dt):
    """'26 sep 2025' (sin depender de locale del server)."""
    if not isinstance(dt, datetime):
        return None
    meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]
    return f"{dt.day:02d} {meses[dt.month-1]} {dt.year}"

def _auto_promo_id():
    """Devuelve el promotion_code.id a usar:
       1) el que tenga metadata.default en {'1','true','yes','si','sí'}
       2) si no hay, el más reciente activo
       3) si no hay activos, None
    """
    try:
        pcs = stripe.PromotionCode.list(active=True, limit=100)
        data = getattr(pcs, "data", []) or []

        # Prioridad por metadata.default
        def _is_default(p):
            meta = getattr(p, "metadata", None) or {}
            v = str(meta.get("default", "")).lower()
            return v in {"1", "true", "yes", "si", "sí"}

        for p in data:
            if _is_default(p):
                return p.id

        # Si no hay default, usa el más reciente activo
        data.sort(key=lambda p: getattr(p, "created", 0), reverse=True)
        return data[0].id if data else None
    except Exception as e:
        print("[_auto_promo_id] lookup failed:", repr(e))
        return None

# ===========================
# Stripe config (TEST / LIVE)
# ===========================
import stripe
from flask import jsonify, session
from datetime import datetime, timezone

STRIPE_MODE = (os.getenv("STRIPE_MODE", "test") or "test").lower()  # 'test' | 'live'
if STRIPE_MODE not in ("test", "live"):
    STRIPE_MODE = "test"

def _pick(suffix: str) -> str:
    # Lee STRIPE_<SUFFIX>_TEST o STRIPE_<SUFFIX>_LIVE, según STRIPE_MODE
    return os.getenv(f"STRIPE_{suffix}_{STRIPE_MODE.upper()}", "") or os.getenv(f"STRIPE_{suffix}", "") or ""

STRIPE_SECRET_KEY     = _pick("SECRET_KEY")       # sk_...
STRIPE_PRICE_ID       = _pick("PRICE_ID")         # price_...
STRIPE_WEBHOOK_SECRET = _pick("WEBHOOK_SECRET")   # whsec_...
PUBLIC_BASE_URL       = os.getenv("PUBLIC_BASE_URL", "http://localhost:5000")

stripe.api_key = STRIPE_SECRET_KEY

# Log útil en consola del server
print(f"[stripe] MODE={STRIPE_MODE} | PRICE={STRIPE_PRICE_ID or '—'} | webhook_secret_set={bool(STRIPE_WEBHOOK_SECRET)}")

# ============ Debug: ver modo y claves cargadas ============
@app.get("/_debug_stripe_mode")
def _debug_stripe_mode():
    # Protegido: requiere sesión
    if not session.get("user_id"):
        return jsonify({"ok": False, "error": "No autorizado"}), 401

    def mask(s: str | None):
        return (s[:10] + "…") if s else None

    return jsonify({
        "ok": True,
        "mode": STRIPE_MODE,                    # 'test' o 'live'
        "api_key_set": bool(STRIPE_SECRET_KEY),
        "price_id": mask(str(STRIPE_PRICE_ID)),
        "webhook_secret_set": bool(STRIPE_WEBHOOK_SECRET),
    })

# (opcionales) helpers que quizá usas en otros lados
def _stripe_get_customer_id_by_email(email: str) -> str | None:
    if not email:
        return None
    try:
        res = stripe.Customer.list(email=email, limit=1)
        if res and getattr(res, "data", []):
            return res.data[0].id
    except Exception:
        pass
    return None

def _dt_from_unix(ts):
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc) if ts else None
    except Exception:
        return None

def _stripe_get_active_subscription(customer_id: str):
    """Devuelve la suscripción activa (o None)."""
    if not customer_id:
        return None
    try:
        subs = stripe.Subscription.list(customer=customer_id, status="active", limit=1)
        if subs and getattr(subs, "data", []):
            return subs.data[0]
    except Exception:
        pass
    return None

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

            # ✅ NO bloqueamos por is_active/trial aquí
            plan       = row["plan"]
            is_active  = bool(row["is_active"])
            trial_end  = row["trial_ends_at"]

            # días de trial que quedan (solo informativo)
            days_left = None
            if plan == "trial" and trial_end:
                days_left = (trial_end.date() - datetime.now(timezone.utc).date()).days

            # Si necesita pagar: (trial vencido) o (plan pago inactivo)
            trial_expired = (plan == "trial" and trial_end and trial_end < datetime.now(timezone.utc))
            needs_subscription = trial_expired or (plan == "paid" and not is_active)

            # último login
            conn.execute(text("UPDATE users SET last_login_at = NOW() WHERE id = :id"),
                         {"id": row["id"]})

        # login OK → setear sesión SIEMPRE
        session.clear()
        session["user_id"] = int(row["id"])
        session["email"]   = (row["email"] or "").lower()

        return jsonify({
            "ok": True,
            "id": row["id"],
            "email": row["email"],
            "nombre": row["name"],
            "plan": plan,
            "is_active": is_active,
            "days_left": days_left,                # null si es paid o sin fecha
            "needs_subscription": needs_subscription
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

# === Verifica sesión de Stripe al volver del checkout y activa la cuenta
@app.get("/checkout_verify")
@login_required
def checkout_verify():
    sid = request.args.get("session_id", "").strip()
    if not sid:
        return jsonify({"ok": False, "error": "session_id requerido"}), 400

    uid = session["user_id"]

    try:
        # 1) Traer Checkout Session + Subscription
        cs = stripe.checkout.Session.retrieve(sid, expand=["subscription"])
        cust_id = getattr(cs, "customer", None)
        sub_id  = None

        sub_obj = getattr(cs, "subscription", None)
        if isinstance(sub_obj, str):
            sub_id = sub_obj
            sub_obj = stripe.Subscription.retrieve(
                sub_id,
                expand=["latest_invoice", "schedule.phases", "items.data.price"]
            )
        elif sub_obj:
            sub_id = getattr(sub_obj, "id", None)

        if not sub_id:
            return jsonify({"ok": True, "is_active": False, "reason": "no subscription in session"})

        # 2) Estado + próxima fecha
        status = getattr(sub_obj, "status", None)
        is_active = status in ("active", "trialing")

        def _to_dt(ts):
            from datetime import datetime, timezone
            try:
                return datetime.fromtimestamp(int(ts), tz=timezone.utc) if ts else None
            except Exception:
                return None

        next_ch = _to_dt(getattr(sub_obj, "current_period_end", None))

        # fallback: latest_invoice.period_end
        if not next_ch:
            li = getattr(sub_obj, "latest_invoice", None)
            if isinstance(li, str) and li:
                try:
                    li = stripe.Invoice.retrieve(li, expand=["lines.data"])
                except Exception:
                    li = None
            if li:
                ts = getattr(li, "period_end", None)
                if ts:
                    next_ch = _to_dt(ts)
                elif getattr(li, "lines", None) and getattr(li.lines, "data", None):
                    per = getattr(li.lines.data[0], "period", None)
                    next_ch = _to_dt(getattr(per, "end", None)) if per else None

        # 3) Persistir TODO
        with engine.begin() as conn:
            conn.execute(text("""
                UPDATE users
                   SET plan                 = 'paid',
                       is_active            = :act,
                       stripe_customer_id   = COALESCE(:cid, stripe_customer_id),
                       stripe_subscription_id = :sid,
                       next_charge_at       = :nca,
                       updated_at           = NOW()
                 WHERE id = :uid
            """), {
                "act": is_active,
                "cid": cust_id,
                "sid": sub_id,
                "nca": next_ch,
                "uid": uid
            })

        return jsonify({
            "ok": True,
            "is_active": is_active,
            "status": status,
            "subscription_id": sub_id,
            "next_charge_at": next_ch.isoformat() if next_ch else None
        })
    except Exception as e:
        print("[checkout_verify] error:", repr(e))
        return jsonify({"ok": False, "error": str(e)}), 400

@app.post("/create_checkout_session")
@login_required
def create_checkout_session():
    u = current_user()
    try:
        checkout = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": STRIPE_PRICE_ID, "quantity": 1}],
            success_url=f"{PUBLIC_BASE_URL}/?checkout=success&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{PUBLIC_BASE_URL}/?checkout=cancel",
            client_reference_id=str(u["id"]),
            customer_email=u.get("email"),
            allow_promotion_codes=True,   # 👈 Stripe muestra la cajita de “¿tienes un código?”
        )
        return jsonify({"ok": True, "url": checkout.url})
    except stripe.error.StripeError as e:
        return jsonify({"ok": False, "error": getattr(e, "user_message", None) or str(e)}), 400
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400

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

# ======================
# === Campanita ========
# ======================
# app.py — DEBUG local: ver fila del usuario logueado
@app.get("/_debug_user")
@login_required
def _debug_user():
    from datetime import datetime, timezone
    def iso(dt):
        if isinstance(dt, datetime):
            return dt.astimezone(timezone.utc).isoformat()
        return None

    with engine.begin() as conn:
        row = conn.execute(text("""
            SELECT id, email, plan, is_active,
                   trial_ends_at, next_charge_at,
                   stripe_customer_id, stripe_subscription_id,
                   updated_at
            FROM users
            WHERE id = :id
        """), {"id": session["user_id"]}).mappings().first()

    if not row:
        return jsonify({"ok": False, "error": "not found"}), 404

    out = dict(row)
    out["trial_ends_at"]  = iso(out.get("trial_ends_at"))
    out["next_charge_at"] = iso(out.get("next_charge_at"))
    out["updated_at"]     = iso(out.get("updated_at"))
    return jsonify({"ok": True, "user": out})

# ============ WEBHOOK ÚNICO ============
@app.post("/webhook")
def stripe_webhook():
    payload = request.get_data(as_text=False)
    sig = request.headers.get("Stripe-Signature", "")

    try:
        event = stripe.Webhook.construct_event(
            payload=payload, sig_header=sig, secret=STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        return "Invalid payload", 400
    except stripe.error.SignatureVerificationError:
        return "Invalid signature", 400

    etype = event.get("type", "")
    obj = event.get("data", {}).get("object", {})

    def _dt_from_unix(ts):
        try:
            return datetime.fromtimestamp(int(ts), tz=timezone.utc) if ts else None
        except Exception:
            return None

    def _next_charge_from_sub(sub_or_id):
        try:
            sub = stripe.Subscription.retrieve(sub_or_id) if isinstance(sub_or_id, str) else sub_or_id
            cpe = getattr(sub, "current_period_end", None) if sub else None
            return _dt_from_unix(cpe)
        except Exception:
            return None

    def _save_activation(uid=None, email=None, cust_id=None, sub_id=None, next_charge=None):
        if not uid and not email:
            return
        with engine.begin() as conn:
            params = {"cust_id": cust_id, "sub_id": sub_id, "next_charge": next_charge}
            if uid:
                conn.execute(text("""
                    UPDATE users SET
                      plan='paid', is_active=true, trial_ends_at=NULL,
                      stripe_customer_id = COALESCE(:cust_id, stripe_customer_id),
                      stripe_subscription_id = COALESCE(:sub_id, stripe_subscription_id),
                      next_charge_at = COALESCE(:next_charge, next_charge_at),
                      last_payment_at = NOW(), updated_at = NOW()
                    WHERE id = :uid
                """), {**params, "uid": int(uid)})
            else:
                conn.execute(text("""
                    UPDATE users SET
                      plan='paid', is_active=true, trial_ends_at=NULL,
                      stripe_customer_id = COALESCE(:cust_id, stripe_customer_id),
                      stripe_subscription_id = COALESCE(:sub_id, stripe_subscription_id),
                      next_charge_at = COALESCE(:next_charge, next_charge_at),
                      last_payment_at = NOW(), updated_at = NOW()
                    WHERE lower(email) = lower(:email)
                """), {**params, "email": email})

    def _deactivate(uid=None, email=None):
        if not uid and not email:
            return
        with engine.begin() as conn:
            if uid:
                conn.execute(text("UPDATE users SET is_active=false, updated_at=NOW() WHERE id=:uid"),
                             {"uid": int(uid)})
            else:
                conn.execute(text("UPDATE users SET is_active=false, updated_at=NOW() WHERE lower(email)=lower(:email)"),
                             {"email": email})

    # --- eventos clave ---
    if etype == "checkout.session.completed":
        cust_id = obj.get("customer")
        sub_id  = obj.get("subscription")
        next_charge_at = _next_charge_from_sub(sub_id) if sub_id else None
        _save_activation(
            uid=obj.get("client_reference_id"),
            email=(obj.get("customer_details") or {}).get("email") or obj.get("customer_email"),
            cust_id=cust_id, sub_id=sub_id, next_charge=next_charge_at
        )

    elif etype == "invoice.payment_succeeded":
        cust_id = obj.get("customer")
        sub_id  = obj.get("subscription")
        next_charge_at = _next_charge_from_sub(sub_id) if sub_id else None
        email = None
        try:
            if cust_id:
                cust = stripe.Customer.retrieve(cust_id)
                email = getattr(cust, "email", None)
        except Exception:
            pass
        _save_activation(email=email, cust_id=cust_id, sub_id=sub_id, next_charge=next_charge_at)

    elif etype in ("customer.subscription.deleted", "invoice.payment_failed"):
        email = None
        try:
            cust_id = obj.get("customer")
            if cust_id:
                cust = stripe.Customer.retrieve(cust_id)
                email = getattr(cust, "email", None)
        except Exception:
            pass
        _deactivate(email=email)

    return jsonify({"ok": True})

@app.get("/webhook")
def stripe_webhook_ping():
    return "Stripe webhook OK (POST only)", 200

@app.get("/checkout_confirm")
@login_required
def checkout_confirm():
    session_id = (request.args.get("session_id") or "").strip()
    if not session_id:
        return jsonify({"ok": False, "error": "missing session_id"}), 400

    try:
        # Trae la Session y expande customer/subscription si es posible
        cs = stripe.checkout.Session.retrieve(
            session_id,
            expand=["subscription", "customer"]
        )

        status = getattr(cs, "status", None)
        payst  = getattr(cs, "payment_status", None)
        uid    = getattr(cs, "client_reference_id", None)

        # customer puede ser id (str) o StripeObject
        cust = getattr(cs, "customer", None)
        cust_id = cust if isinstance(cust, str) else getattr(cust, "id", None)

        cdet  = getattr(cs, "customer_details", None)
        email = (getattr(cdet, "email", None) if cdet else None) or getattr(cs, "customer_email", None)

        # subscription puede ser id, objeto o None
        sub    = getattr(cs, "subscription", None)
        if isinstance(sub, str):
            sub = stripe.Subscription.retrieve(sub)
        sub_id = getattr(sub, "id", None) if sub else None

        # Fallback: si aún no tenemos sub, búscala por customer
        if not sub and cust_id:
            subs = stripe.Subscription.list(customer=cust_id, status="all", limit=10)
            best = None
            for s in subs.data or []:
                if getattr(s, "status", None) in ("active", "trialing"):
                    best = s
                    break
            if not best and (subs.data or []):
                best = subs.data[0]
            sub = best
            sub_id = getattr(sub, "id", None) if sub else None

        # Calcula próxima fecha de cobro
        next_charge_at = None
        if sub:
            cpe = getattr(sub, "current_period_end", None)
            if cpe:
                next_charge_at = datetime.fromtimestamp(int(cpe), tz=timezone.utc)

        # Si la sesión está pagada, guarda todo
        if status == "complete" and payst == "paid":
            with engine.begin() as conn:
                params = {"cust_id": cust_id, "sub_id": sub_id, "next_charge": next_charge_at}
                if uid:
                    conn.execute(text("""
                        UPDATE users SET
                          plan='paid',
                          is_active=true,
                          trial_ends_at=NULL,
                          stripe_customer_id = COALESCE(:cust_id, stripe_customer_id),
                          stripe_subscription_id = COALESCE(:sub_id, stripe_subscription_id),
                          next_charge_at = COALESCE(:next_charge, next_charge_at),
                          last_payment_at = NOW(),
                          updated_at=NOW()
                        WHERE id=:uid
                    """), {"uid": int(uid), **params})
                elif email:
                    conn.execute(text("""
                        UPDATE users SET
                          plan='paid',
                          is_active=true,
                          trial_ends_at=NULL,
                          stripe_customer_id = COALESCE(:cust_id, stripe_customer_id),
                          stripe_subscription_id = COALESCE(:sub_id, stripe_subscription_id),
                          next_charge_at = COALESCE(:next_charge, next_charge_at),
                          last_payment_at = NOW(),
                          updated_at=NOW()
                        WHERE lower(email)=lower(:email)
                    """), {"email": email, **params})

            return jsonify({
                "ok": True,
                "plan": "paid",
                "next_charge_at": next_charge_at.isoformat() if next_charge_at else None
            })

        return jsonify({"ok": False, "status": status, "payment_status": payst})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400

# === Estado de facturación (lee BD y, si falta, rellena desde Stripe)
# === Estado de facturación (lee BD y, si falta o está “vencida”, recalcula con Stripe)
@app.get("/billing_status")
@login_required
def billing_status():
    from datetime import datetime, timezone, timedelta

    def _to_dt(ts):
        try:
            return datetime.fromtimestamp(int(ts), tz=timezone.utc) if ts else None
        except Exception:
            return None

    def add_months_utc(dt, months=1):
        if not dt: return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        y = dt.year
        m = dt.month + months
        y += (m - 1) // 12
        m = ((m - 1) % 12) + 1
        d = min(dt.day, 28)
        return dt.replace(year=y, month=m, day=d)

    def advance_to_future(dt, interval, count):
        if not dt: return None
        now = datetime.now(timezone.utc)
        n = count or 1
        cur = dt
        if interval == "month":
            while cur <= now:
                cur = add_months_utc(cur, n)
        elif interval == "year":
            while cur <= now:
                cur = add_months_utc(cur, 12 * n)
        elif interval == "week":
            while cur <= now:
                cur = cur + timedelta(weeks=n)
        else:
            while cur <= now:
                cur = cur + timedelta(days=n)
        return cur

    # 1) Leer BD
    with engine.begin() as conn:
        row = conn.execute(text("""
          SELECT plan, is_active, trial_ends_at, next_charge_at,
                 stripe_customer_id, stripe_subscription_id
          FROM users WHERE id=:id
        """), {"id": session["user_id"]}).mappings().first()

    if not row:
        return jsonify({"ok": False, "error": "not found"}), 404

    plan      = (row["plan"] or "trial")
    is_active = bool(row["is_active"])
    trial_end = row["trial_ends_at"]
    next_ch   = row["next_charge_at"]
    cust_id   = row.get("stripe_customer_id")
    sub_id    = row.get("stripe_subscription_id")

    # 2) Si es pago y activo, refrescar si falta o no está en el FUTURO
    try:
        need_refresh = False
        now = datetime.now(timezone.utc)
        if plan == "paid" and is_active:
            if not isinstance(next_ch, datetime):
                need_refresh = True
            elif next_ch <= now:
                need_refresh = True

        if need_refresh and (cust_id or sub_id):
            # Traer sub (id directo o buscando la activa/más reciente)
            sub = None
            try:
                if sub_id:
                    sub = stripe.Subscription.retrieve(
                        sub_id, expand=["latest_invoice", "schedule.phases", "items.data.price"]
                    )
                if (not sub) or getattr(sub, "status", None) not in ("active", "trialing"):
                    if cust_id:
                        lst = stripe.Subscription.list(customer=cust_id, status="all", limit=20)
                        subs = list(getattr(lst, "data", []) or [])
                        subs.sort(key=lambda s: getattr(s, "created", 0), reverse=True)
                        sub = next((s for s in subs if getattr(s, "status", None) in ("active", "trialing")), None) or (subs[0] if subs else None)
                        if sub:
                            sub_id = getattr(sub, "id", None)
            except Exception:
                sub = None

            # Calcular próxima fecha
            fresh = None
            if sub:
                items = getattr(sub, "items", None)
                data  = getattr(items, "data", None) or []
                price = getattr(data[0], "price", None) if data else None
                recurring = getattr(price, "recurring", None)
                inter = getattr(recurring, "interval", None) or "month"
                inter_count = getattr(recurring, "interval_count", None) or 1

                # current_period_end
                fresh = _to_dt(getattr(sub, "current_period_end", None))

                # latest_invoice
                if not fresh:
                    li = getattr(sub, "latest_invoice", None)
                    if isinstance(li, str) and li:
                        try:
                            li = stripe.Invoice.retrieve(li, expand=["lines.data"])
                        except Exception:
                            li = None
                    if li:
                        fresh = _to_dt(getattr(li, "period_end", None))
                        if (not fresh) and getattr(li, "lines", None) and getattr(li.lines, "data", None):
                            per = getattr(li.lines.data[0], "period", None)
                            fresh = _to_dt(getattr(per, "end", None)) if per else None

                # upcoming invoice (fiable para el siguiente cobro)
                if not fresh:
                    up = None
                    try:
                        up = stripe.Invoice.upcoming(subscription=getattr(sub, "id", None))
                    except Exception:
                        up = None
                    if not up and cust_id:
                        try:
                            up = stripe.Invoice.upcoming(customer=cust_id)
                        except Exception:
                            up = None
                    if up:
                        ts = getattr(up, "next_payment_attempt", None) or getattr(up, "due_date", None) or getattr(up, "period_end", None)
                        fresh = _to_dt(ts)

                # Fallback: ancla + intervalo
                if not fresh:
                    bca = _to_dt(getattr(sub, "billing_cycle_anchor", None))
                    if bca:
                        fresh = add_months_utc(bca, 1 if inter == "month" else (12 if inter == "year" else 0))

                # Normalizar al futuro
                if fresh:
                    fresh = advance_to_future(fresh, inter, inter_count)

            # Si obtuvimos algo, persistir y usarlo
            if fresh:
                next_ch = fresh
                with engine.begin() as conn:
                    conn.execute(text("""
                        UPDATE users
                           SET stripe_subscription_id = COALESCE(:sid, stripe_subscription_id),
                               next_charge_at         = :nca,
                               updated_at             = NOW()
                         WHERE id = :id
                    """), {"sid": sub_id, "nca": next_ch, "id": session["user_id"]})

    except Exception as e:
        print("[billing_status] refresh error:", repr(e))

    # 3) Cálculos de días
    days_left = None
    if plan == "trial" and isinstance(trial_end, datetime):
        days_left = (trial_end.date() - datetime.now(timezone.utc).date()).days

    days_to_next = None
    if isinstance(next_ch, datetime):
        seconds = (next_ch - datetime.now(timezone.utc)).total_seconds()
        # ceil “amigable”: 0 si ya pasó/ocurre hoy
        days_to_next = max(0, int((seconds + 86399) // 86400))

    # Mensajes humanos
    def _human_next_message(d):
        if d is None: return ""
        if d <= 0: return "El cobro es hoy 🎉"
        if d == 1: return "Mañana ✨"
        if d <= 3: return f"Faltan {d} días ⏳"
        if d == 7: return "En una semana 🗓️"
        if d >= 28: return "En ~1 mes 📆"
        return f"Faltan {d} días 📅"

    def _es_fecha_corta(dt):
        try:
            meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]
            d = dt.astimezone(timezone.utc)
            return f"{d.day:02d} {meses[d.month-1]} {d.year}"
        except Exception:
            return None

    return jsonify({
        "ok": True,
        "plan": plan,
        "is_active": is_active,
        "trial_ends_at": trial_end.isoformat() if isinstance(trial_end, datetime) else None,
        "next_charge_at": next_ch.isoformat() if isinstance(next_ch, datetime) else None,
        "days_left": days_left,
        "days_to_next_charge": days_to_next,
        "next_charge_message": _human_next_message(days_to_next),
        "next_charge_date_human": _es_fecha_corta(next_ch) if isinstance(next_ch, datetime) else None
    })

# === Sincroniza con Stripe, corrige sub cancelada y normaliza próxima fecha al FUTURO
@app.post("/billing_sync")
@login_required
def billing_sync():
    from datetime import datetime, timezone, timedelta
    uid = session["user_id"]

    def _to_dt(ts):
        try:
            return datetime.fromtimestamp(int(ts), tz=timezone.utc) if ts else None
        except Exception:
            return None

    def add_months_utc(dt, months=1):
        if not dt: return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        y = dt.year
        m = dt.month + months
        y += (m - 1) // 12
        m = ((m - 1) % 12) + 1
        d = min(dt.day, 28)
        return dt.replace(year=y, month=m, day=d)

    def advance_to_future(dt, interval, count):
        """Empuja dt hasta que esté > now, según el intervalo del precio."""
        if not dt: return None
        now = datetime.now(timezone.utc)
        n = count or 1
        cur = dt
        if interval == "month":
            while cur <= now:
                cur = add_months_utc(cur, n)
        elif interval == "year":
            while cur <= now:
                cur = add_months_utc(cur, 12 * n)
        elif interval == "week":
            while cur <= now:
                cur = cur + timedelta(weeks=n)
        else:
            while cur <= now:
                cur = cur + timedelta(days=n)
        return cur

    # --- lee lo que hay en BD
    with engine.begin() as conn:
        row = conn.execute(text("""
            SELECT stripe_subscription_id, stripe_customer_id
            FROM users WHERE id=:id
        """), {"id": uid}).mappings().first()

    if not row:
        return jsonify({"ok": False, "error": "not found"}), 404

    sub_id  = row.get("stripe_subscription_id")
    cust_id = row.get("stripe_customer_id")

    try:
        # 1) Traer la sub guardada; si no sirve, buscar la ACTIVA del customer
        sub = None
        status = None
        if sub_id:
            try:
                sub = stripe.Subscription.retrieve(
                    sub_id,
                    expand=["latest_invoice", "schedule.phases", "items.data.price"]
                )
                status = getattr(sub, "status", None)
            except Exception:
                sub = None

        if (not sub) or (status not in ("active", "trialing")):
            if cust_id:
                lst = stripe.Subscription.list(customer=cust_id, status="all", limit=20)
                subs = list(getattr(lst, "data", []) or [])
                subs.sort(key=lambda s: getattr(s, "created", 0), reverse=True)
                sub = next((s for s in subs if getattr(s, "status", None) in ("active", "trialing")), None) or (subs[0] if subs else None)
                status = getattr(sub, "status", None) if sub else None

        if not sub:
            with engine.begin() as conn:
                conn.execute(text("""
                    UPDATE users
                       SET is_active = false, updated_at = NOW()
                     WHERE id = :id
                """), {"id": uid})
            return jsonify({"ok": True, "is_active": False, "status": "none"})

        # 2) Intervalo del precio
        items = getattr(sub, "items", None)
        data  = getattr(items, "data", None) or []
        price = getattr(data[0], "price", None) if data else None
        recurring = getattr(price, "recurring", None)
        inter = getattr(recurring, "interval", None) or "month"
        inter_count = getattr(recurring, "interval_count", None) or 1

        # 3) Calcular próxima fecha (varias fuentes)
        next_ch = _to_dt(getattr(sub, "current_period_end", None))

        # latest_invoice.period_end / lines[0].period.end
        if not next_ch:
            li = getattr(sub, "latest_invoice", None)
            if isinstance(li, str) and li:
                try:
                    li = stripe.Invoice.retrieve(li, expand=["lines.data"])
                except Exception:
                    li = None
            if li:
                next_ch = _to_dt(getattr(li, "period_end", None))
                if (not next_ch) and getattr(li, "lines", None) and getattr(li.lines, "data", None):
                    per = getattr(li.lines.data[0], "period", None)
                    next_ch = _to_dt(getattr(per, "end", None)) if per else None

        # upcoming invoice (más fiable para el "siguiente" cobro)
        if not next_ch:
            up = None
            try:
                up = stripe.Invoice.upcoming(subscription=getattr(sub, "id", None))
            except Exception:
                up = None
            if not up and cust_id:
                try:
                    up = stripe.Invoice.upcoming(customer=cust_id)
                except Exception:
                    up = None
            if up:
                ts = getattr(up, "next_payment_attempt", None) or getattr(up, "due_date", None) or getattr(up, "period_end", None)
                next_ch = _to_dt(ts)

        # Fallback total: ancla + intervalo
        if not next_ch:
            bca = _to_dt(getattr(sub, "billing_cycle_anchor", None))
            if bca:
                # “próximo” ciclo
                next_ch = add_months_utc(bca, 1 if inter == "month" else (12 if inter == "year" else 0))

        # 4) Normalizar al FUTURO según el intervalo del precio
        if next_ch:
            next_ch = advance_to_future(next_ch, inter, inter_count)

        is_active = status in ("active", "trialing")
        new_sub_id = getattr(sub, "id", None)

        # 5) Persistir
        with engine.begin() as conn:
            conn.execute(text("""
                UPDATE users
                   SET stripe_subscription_id = COALESCE(:sid, stripe_subscription_id),
                       is_active            = :act,
                       plan                 = CASE WHEN :act THEN 'paid' ELSE plan END,
                       next_charge_at       = :nca,
                       updated_at           = NOW()
                 WHERE id = :id
            """), {"sid": new_sub_id, "act": is_active, "nca": next_ch, "id": uid})

        return jsonify({
            "ok": True,
            "is_active": is_active,
            "status": status,
            "next_charge_at": next_ch.isoformat() if next_ch else None,
            "used_subscription_id": new_sub_id
        })
    except Exception as e:
        print("[billing_sync] error:", repr(e))
        return jsonify({"ok": False, "error": str(e)}), 400

@app.get("/_debug_billing_calc")
@login_required
def _debug_billing_calc():
    # Llama internamente a billing_sync pero sin UPDATE (o copia la lógica sin el UPDATE)
    # Para no alargar, puedes llamar fetch('/billing_sync') desde la consola y ver el "source".
    return jsonify({"ok": False, "msg": "Usa /billing_sync y mira el campo 'source' en la respuesta"})


# === DEBUG: ver lo que devuelve Stripe (solo en local; quítalo en prod)
@app.get("/_debug_subscription")
@login_required
def _debug_subscription():
    with engine.begin() as conn:
        row = conn.execute(text("""
            SELECT stripe_subscription_id, stripe_customer_id
            FROM users WHERE id=:id
        """), {"id": session["user_id"]}).mappings().first()

    if not row:
        return jsonify({"ok": False, "error": "not found"}), 404

    sub = None
    sub_id = row.get("stripe_subscription_id")
    cust_id = row.get("stripe_customer_id")

    try:
        if sub_id:
            sub = stripe.Subscription.retrieve(
                sub_id,
                expand=["latest_invoice", "schedule.phases", "items.data.price"]
            )
        elif cust_id:
            lst = stripe.Subscription.list(customer=cust_id, status="all", limit=10)
            subs = _g(lst, "data", []) or []
            subs.sort(key=lambda s: _g(s, "created", 0) or 0, reverse=True)
            sub = next((s for s in subs if _g(s, "status") in ("active", "trialing")), None) or (subs[0] if subs else None)

        if not sub:
            return jsonify({"ok": False, "error": "no subscription found"}), 404

        items = _g(sub, "items")
        data_list = _g(items, "data") if items is not None else None
        item = (data_list[0] if data_list else None)
        price = _g(item, "price")
        recurring = _g(price, "recurring")

        out = {
            "id": _g(sub, "id"),
            "status": _g(sub, "status"),
            "current_period_start": _to_iso(_g(sub, "current_period_start")),
            "current_period_end": _to_iso(_g(sub, "current_period_end")),
            "billing_cycle_anchor": _to_iso(_g(sub, "billing_cycle_anchor")),
            "trial_end": _to_iso(_g(sub, "trial_end")),
            "collection_method": _g(sub, "collection_method"),
            "price_id": _g(price, "id") if price else None,
            "interval": _g(recurring, "interval") if recurring else None,
            "interval_count": _g(recurring, "interval_count") if recurring else None,
            "latest_invoice_status": _g(_g(sub, "latest_invoice"), "status"),
            "schedule_has_phases": bool(_g(_g(sub, "schedule"), "phases")),
        }
        return jsonify({"ok": True, "subscription": out})
    except Exception as e:
        print("[_debug_subscription] error:", repr(e))
        return jsonify({"ok": False, "error": str(e)}), 400

# === Portal de facturación (gestionar método de pago, recibos, cancelar)
@app.post("/billing_portal")
@login_required
def billing_portal():
    try:
        u = current_user()
        with engine.begin() as conn:
            cust_id = conn.execute(text("""
              SELECT stripe_customer_id FROM users WHERE id=:id
            """), {"id": u["id"]}).scalar()

        if not cust_id:
            return jsonify({"ok": False, "error": "No hay stripe_customer_id guardado para tu usuario."}), 400

        portal = stripe.billing_portal.Session.create(
            customer=cust_id,
            return_url=PUBLIC_BASE_URL
        )
        return jsonify({"ok": True, "url": portal.url})
    except Exception as e:
        # opcional: imprime el stack en consola del servidor para depurar
        import traceback; traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 400
    
    # ========= Forgot / Reset Password =========
import secrets
from datetime import datetime, timedelta, timezone

def _send_email(to_email: str, subject: str, html: str):
    """
    PROD: Integra SendGrid/Mailgun/Brevo.
    DEV: por ahora sólo imprime el link en logs.
    """
    print(f"[mail-> {to_email}] {subject}\n{html}\n")

@app.post("/forgot_password")
def forgot_password():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        # misma respuesta para evitar enumeración
        return jsonify({"ok": True})

    # busca usuario
    with engine.begin() as conn:
        u = conn.execute(text("SELECT id, email FROM users WHERE lower(email)=:e LIMIT 1"),
                         {"e": email}).mappings().first()

    # siempre devolvemos ok (no revelar si existe)
    if not u:
        return jsonify({"ok": True})

    # genera token 1 hora
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=1)

    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO password_resets (user_id, token, expires_at)
            VALUES (:uid, :tok, :exp)
        """), {"uid": u["id"], "tok": token, "exp": expires})

    # arma link de reseteo
    link = f"{PUBLIC_BASE_URL}/?reset_token={token}"
    _send_email(
        to_email=u["email"],
        subject="Restablecer contraseña",
        html=f"""
        <p>Recibimos una solicitud para restablecer tu contraseña.</p>
        <p>Haz clic aquí (válido por 1 hora): <a href="{link}">{link}</a></p>
        <p>Si no fuiste tú, ignora este correo.</p>
        """
    )
    return jsonify({"ok": True})

@app.post("/reset_password")
def reset_password():
    data = request.get_json(force=True, silent=True) or {}
    token = (data.get("token") or "").strip()
    newp = (data.get("password") or "").strip()

    # validación simple
    if len(newp) < 8:
        return jsonify({"ok": False, "error": "La contraseña debe tener al menos 8 caracteres"}), 400

    # valida token
    with engine.begin() as conn:
        row = conn.execute(text("""
            SELECT pr.id, pr.user_id
            FROM password_resets pr
            WHERE pr.token=:t
              AND pr.used=false
              AND pr.expires_at > now()
            LIMIT 1
        """), {"t": token}).mappings().first()

        if not row:
            return jsonify({"ok": False, "error": "Token inválido o expirado"}), 400

        # actualiza contraseña y marca token como usado
        conn.execute(text("""
            UPDATE users SET password_hash=:ph, updated_at=now() WHERE id=:uid
        """), {"ph": generate_password_hash(newp), "uid": row["user_id"]})

        conn.execute(text("UPDATE password_resets SET used=true WHERE id=:id"),
                     {"id": row["id"]})

    return jsonify({"ok": True})
    
# ---------------------------
# Run
# ---------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

