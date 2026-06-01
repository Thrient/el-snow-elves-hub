from pydantic import BaseModel


class CompleteRequest(BaseModel):
    sha256: str
