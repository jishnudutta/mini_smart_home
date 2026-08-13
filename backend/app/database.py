from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from app import config
from app.models import Device, DeviceState, SensorReading  # noqa: F401 — register tables

engine = create_engine(
    config.DATABASE_URL,
    connect_args={"check_same_thread": False},
    pool_pre_ping=True,
)


@event.listens_for(Engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    if engine.dialect.name != "sqlite":
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def _migrate() -> None:
    """Hand-rolled migrations for SQLite (create_all won't alter existing
    tables). v0.1 keeps this tiny and explicit."""
    with engine.connect() as conn:
        tables = [r[0] for r in conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table'")]
    if "devices" not in tables:
        return

    with engine.connect() as conn:
        cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(devices)")]
        col_types = {r[1]: r[2] for r in conn.exec_driver_sql("PRAGMA table_info(devices)")}
        if "pin" in cols and col_types.get("pin", "").upper() == "INTEGER":
            conn.exec_driver_sql("ALTER TABLE devices ADD COLUMN pin_tmp TEXT")
            conn.exec_driver_sql("UPDATE devices SET pin_tmp = '[' || pin || ']' WHERE pin IS NOT NULL")
            conn.exec_driver_sql("ALTER TABLE devices DROP COLUMN pin")
            conn.exec_driver_sql("ALTER TABLE devices RENAME COLUMN pin_tmp TO pin")
            conn.commit()

    # The built-in LED (ESP32 Dev Module, GPIO2) predates dashboard
    # provisioning. Give it its pin so the data-driven firmware keeps driving
    # it after this upgrade. New devices get their pin from the dashboard.
    with Session(engine) as session:
        dev = session.get(Device, "light_01")
        if dev is not None and dev.pin is None:
            dev.pin = [2]
            session.add(dev)
            session.commit()


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
    _migrate()


def get_session():
    """FastAPI dependency: one short-lived session per request."""
    with Session(engine) as session:
        yield session
