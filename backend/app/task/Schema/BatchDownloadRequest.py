"""批量下载请求"""
from pydantic import BaseModel, field_validator


class BatchDownloadRequest(BaseModel):
    task_ids: list[int]

    @field_validator("task_ids")
    @classmethod
    def check_limits(cls, v: list[int]) -> list[int]:
        if not v:
            raise ValueError("至少选择一个任务")
        # 去重，保持顺序
        seen = set()
        deduped = []
        for tid in v:
            if tid not in seen:
                seen.add(tid)
                deduped.append(tid)
        return deduped
