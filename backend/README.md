# 账号同步服务

轻量 Python 标准库后端，提供：

- 注册 / 登录 / 退出
- 自动生成账号
- 学习进度云同步
- 本地进度与云端进度自动合并

本地启动：

```bash
python3 backend/server.py --host 127.0.0.1 --port 8765
```

健康检查：

```bash
curl http://127.0.0.1:8765/api/health
```
