# SSA 本地网关部署

SSA 的本地自部署模式把浏览器当成操作界面，把文件系统权限收在本地后端网关里。浏览器不会直接读写用户磁盘；上传文件、归纳产物、配置、索引和运行状态都由容器内的 SSA 写入挂载的数据目录。

## 启动

```bash
docker compose up --build
```

默认访问地址：

```text
http://127.0.0.1:3001
```

默认数据目录：

```text
~/.ssa/data
```

compose 文件默认只把端口绑定到 `127.0.0.1`。如果要给局域网其他设备访问，显式开启 LAN 模式：

```bash
SSA_BIND_HOST=0.0.0.0 \
SSA_GATEWAY_ACCESS_MODE=lan \
docker compose up --build
```

LAN 模式下，同一局域网设备可访问：

```text
http://<本机局域网 IP>:3001
```

SSA 会自动检测本机局域网 IPv4 地址。若检测结果不符合你的网络环境，可以手动指定：

```bash
SSA_PUBLIC_HOST=<本机局域网 IP> docker compose up --build
```

不要把这个端口暴露到公网。SSA 不会自动修改系统防火墙；如果同一局域网设备无法访问，请检查主机防火墙是否允许该端口的私有网络入站连接。

## 认证 token

容器启动时会检查：

```text
~/.ssa/data/security/beta-auth.json
```

如果没有 token，入口脚本会生成一个本地 token 文件，并在容器日志里打印本地访问地址和 access token。已有 token 文件时，入口脚本会把 token 投射到 `SSA_BETA_AUTH_TOKENS`，让页面中间件和 API 使用同一套认证来源。LAN 模式也必须使用 token。

## 模型配置

compose 不再默认指定 mock。没有任何模型配置时，SSA 才会启用 mock fallback。

本地模型示例：

```bash
SSA_LLM_PROVIDER=ollama \
SSA_LLM_MODEL=<你的本地模型名> \
docker compose up --build
```

选择已内置的 provider 时，SSA 会自动填充 API Base URL。只有公司代理网关、私有模型服务或特殊部署需要手动改 `SSA_LLM_BASE_URL`。

国内云模型示例：

```bash
SSA_LLM_PROVIDER=dashscope \
SSA_LLM_MODEL=qwen-plus \
SSA_LLM_API_KEY=<your-key> \
docker compose up --build
```

设置页也可以配置 Ollama、LM Studio、vLLM、llama.cpp server、DeepSeek、通义千问 / DashScope、智谱、Kimi / Moonshot、豆包 / 火山方舟、百度千帆、腾讯混元、OpenAI 和 OpenRouter。

注意：标准 API 和 Coding Plan 是不同 provider，Base URL 不一样。不要把控制台、套餐、计费页地址填进 API Base URL。

| Provider | 默认 API Base URL |
|---|---|
| 通义千问 / DashScope 标准 API | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| 通义千问 Coding Plan | `https://coding.dashscope.aliyuncs.com/v1` |
| Kimi / Moonshot 标准 API | `https://api.moonshot.cn/v1` |
| Kimi Code API | `https://api.kimi.com/coding/v1` |
| 智谱 GLM 标准 API | `https://open.bigmodel.cn/api/paas/v4` |
| 智谱 Coding Plan | `https://open.bigmodel.cn/api/coding/paas/v4` |
| 豆包 / 火山方舟标准 API | `https://ark.cn-beijing.volces.com/api/v3` |
| 豆包 / 火山方舟 Coding Plan | `https://ark.cn-beijing.volces.com/api/coding/v3` |

## 文件模型

- 用户上传文件保存到 `~/.ssa/data/companies/<workspace>/intake/uploads/`。
- 多文件归纳结果保存到 `~/.ssa/data/companies/<workspace>/documents/syntheses/`。
- 网页端下载文件必须使用后端登记的 opaque file token。
- 本地网关模式默认拒绝浏览器传入绝对路径下载文件。
- 本地网关模式禁用服务端 `open` / `xdg-open` 行为，改用浏览器预览或下载。

## 文档归纳依赖

镜像内包含：

```text
sqlite3
pdftotext / poppler-utils
LibreOffice / soffice
```

这些工具用于本地索引、PDF 提取和 Office 文档转换。缺失或转换失败时，synthesize 会返回明确 warning，并保留原始上传文件。

## intake 保留策略

默认永久保留 intake session 和上传文件，不再按固定数量删除旧数据。

如需把旧记录从活跃列表移到归档区，可以设置：

```text
SSA_INTAKE_RETENTION_MODE=archive
SSA_INTAKE_MAX_ACTIVE_SESSIONS=100
```

也可以在设置页的“本地存储”里修改该策略。归档只移动旧 session 和上传目录，不删除原始文件。

归档会移动到：

```text
~/.ssa/data/companies/<workspace>/intake/archive/
```
