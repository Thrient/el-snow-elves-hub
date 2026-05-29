from datetime import datetime

from pydantic import BaseModel


class DownloadItem(BaseModel):
    task_id: int; task_title: str = ""; downloaded_at: datetime
    model_config = {"from_attributes": True}
