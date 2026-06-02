from pydantic import BaseModel


class CompleteRequest(BaseModel):
    """Complete upload request — no client fields, backend computes hash"""
    pass
