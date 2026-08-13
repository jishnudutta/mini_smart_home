from pydantic import BaseModel


class ModeRequest(BaseModel):
    mode: str
