from pydantic import BaseModel


class CheckRequest(BaseModel):
    sha256: str
