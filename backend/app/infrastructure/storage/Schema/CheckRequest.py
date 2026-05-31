from pydantic import BaseModel


class CheckRequest(BaseModel):
    sha256: str | list[str]

    def get_list(self) -> list[str]:
        if isinstance(self.sha256, str):
            return [self.sha256]
        return self.sha256
