import asyncio
import logging

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config
from app.api import devices, esp32, health, history, status, websocket
from app.database import create_db_and_tables
from app.services import automation, esp32_manager, simulator
from app.services.broadcast import manager

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("smartroom")

background_tasks: list[asyncio.Task] = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    manager.bind_loop(asyncio.get_running_loop())

    # Automation and the node watchdog run regardless of any client.
    background_tasks.append(asyncio.create_task(automation.automation_loop()))
    background_tasks.append(asyncio.create_task(esp32_manager.watchdog_loop()))
    if config.SIMULATOR_ENABLED:
        background_tasks.append(asyncio.create_task(simulator.run()))
        logger.info("simulator enabled — a virtual ESP32 node will register on startup")
    else:
        logger.info("simulator disabled (SIMULATOR_ENABLED=false) — waiting for real hardware")

    yield

    for task in background_tasks:
        task.cancel()


app = FastAPI(
    title="Smart Room Backend",
    version="0.1.0",
    description="API server for the miniature smart room. The ESP32 is a "
    "hardware node that registers here; it is not the API server.",
    lifespan=lifespan,
)

# v0.1 assumes a trusted local network (see the plan's security notes).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(devices.router)
app.include_router(history.router)
app.include_router(status.router)
app.include_router(esp32.router)
app.include_router(websocket.router)


@app.get("/")
def root():
    return {"service": "smart-room-backend", "phase": 2, "docs": "/docs"}
