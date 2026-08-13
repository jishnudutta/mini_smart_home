from typing import Any

from pydantic import BaseModel


class CommandRequest(BaseModel):
    command: str
    value: Any
