from pydantic import BaseModel

from app.identity.Schema.UserResponse import UserResponse


class TokenResponse(BaseModel):
    access_token: str; refresh_token: str
    token_type: str = "bearer"; user: UserResponse
