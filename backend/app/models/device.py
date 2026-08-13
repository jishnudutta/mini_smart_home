from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Device(SQLModel, table=True):
    """The registry: what a device is. The id is permanent and never changes
    when a user renames the device."""

    __tablename__ = "devices"

    id: str = Field(primary_key=True)
    name: str
    type: str
    sensor_type: Optional[str] = Field(default=None)
    capabilities: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    node_id: Optional[str] = Field(default=None, index=True)
    # The GPIO pin the owning node drives. Set when a device is added from the
    # dashboard (or backfilled for pre-existing hardware); the node fetches
    # its pin map from the backend rather than hard-coding it in firmware.
    pin: Optional[int] = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class DeviceState(SQLModel, table=True):
    """The live state of a device: its control state, sensor data, and
    connectivity. Updated by node reports and queried for the dashboard."""

    __tablename__ = "device_states"

    device_id: str = Field(primary_key=True, foreign_key="devices.id")
    state: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    data: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    online: bool = Field(default=False)
    last_seen: Optional[datetime] = Field(default=None)
    updated_at: datetime = Field(default_factory=utcnow)
