"""el-token Hub 集成测试 — 登录 → 保护路由 → 登出 完整流程"""

import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient


class TestElTokenHubIntegration:

    @pytest.fixture(autouse=True)
    def _setup(self, monkeypatch):
        monkeypatch.setenv("EL_JWT_SECRET", "test-secret")
        monkeypatch.setenv("EL_REDIS_URL", "redis://localhost:6379/0")
        monkeypatch.setenv("SECRET_KEY", "test-key")
        monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite://")
        import fakeredis
        from el_token.ElStore import ElStore
        ElStore._client = fakeredis.FakeRedis()

    def test_login_logout_full_flow(self):
        from el_token import ElUtil, ElMiddleware
        from el_token.deps import get_login

        ElUtil.boot()

        app = FastAPI()
        app.add_middleware(ElMiddleware)

        @app.get("/me")
        def me(uid=Depends(get_login)):
            return {"uid": uid}

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/me")
        assert resp.status_code == 401

        token = ElUtil.login("42")
        from el_token.ElSettings import ElSettings
        st = ElSettings(_env_file=None)
        client.cookies.set(st.token_name, token)
        resp = client.get("/me")
        assert resp.status_code == 200
        assert resp.json()["uid"] == "42"

        ElUtil.logout()
        resp = client.get("/me")
        assert resp.status_code == 401
