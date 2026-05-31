from pydantic import BaseModel, EmailStr


class SendVerification(BaseModel):
    email: EmailStr
