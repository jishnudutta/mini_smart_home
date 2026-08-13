from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class SensorReading(SQLModel, table=True):
    __tablename__ = "sensor_readings"

    id: Optional[int] = Field(default=None, primary_key=True)
    device_id: str = Field(index=True, foreign_key="devices.id")
    temperature: Optional[float] = Field(default=None)
    humidity: Optional[float] = Field(default=None)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)
