# 安全收敛与质量门禁恢复设计

## 背景

当前项目存在两类高优先级问题：

1. 仓库和镜像内存在可直接使用的默认管理密钥，且账号管理接口会把完整 `access_token` 暴露到前端。
2. 前端发布门禁被配置绕过，`eslint` 已存在真实错误，但 `next build` 仍可通过。

本轮只处理这两类问题，避免顺手扩大范围。

## 目标

### 目标 1：鉴权与敏感信息收敛

- 仓库提交内容不再包含可直接使用的默认 `auth-key`
- Docker 最终镜像不再复制 `config.json`
- 服务启动时必须显式提供 `CHATGPT2API_AUTH_KEY` 或本地私有 `config.json`
- 账号管理接口不再向前端返回完整 `access_token`
- 前端账号管理操作全部改为基于 `account_id`

### 目标 2：前端质量门禁恢复

- 修复 `web/src/components/ui/dia-text-reveal.tsx` 当前的 lint error
- 移除 `web/next.config.ts` 中的 `ignoreBuildErrors`
- 为前端补充显式的 `lint` 与 `typecheck` 脚本
- GitHub 发布流程在推送镜像前执行 `pytest`、`eslint`、`tsc --noEmit`、`next build`

## 非目标

- 不重做登录体系
- 不修改图片生成主链路协议
- 不引入新的数据库或持久化结构
- 不重构账号服务整体架构
- 不处理本轮之外的前端 warning

## 设计

### 1. 配置与启动策略

保留当前 `services.config` 的“环境变量优先、文件回退”模型，但仓库中的 `config.json` 只保留非敏感配置示例，不再提供真实默认密钥。Docker 最终镜像不复制 `config.json`，因此容器环境默认只能依赖环境变量提供 `CHATGPT2API_AUTH_KEY`。

这样可以确保：

- 仓库克隆后不会自带可用管理口令
- 镜像分发后不会内置默认口令
- 本地开发仍可通过未提交的私有 `config.json` 启动

### 2. 账号管理接口脱敏

后端继续存储真实 `access_token`，但只在服务端内部使用。当前基于 token 哈希生成的 `id` 继续作为稳定主键，不额外引入新字段。

接口契约调整如下：

- `GET /api/accounts`
  - 返回：`id`、`token_preview`、类型、状态、额度、邮箱等展示字段
  - 不再返回：`access_token`

- `POST /api/accounts/refresh`
  - 入参：`account_ids: string[]`
  - 为空时仍表示刷新全部账号

- `POST /api/accounts/update`
  - 入参：`account_id`
  - 服务端按 `account_id` 映射真实 token 后更新

- `DELETE /api/accounts`
  - 入参：`account_ids: string[]`

服务层新增按 `id` 查找、删除、刷新、更新的适配层，内部仍复用现有按 token 工作的核心逻辑，尽量减少对图片生成主链路的影响。

### 3. 前端迁移策略

前端账号页只保留展示和管理能力，不再承担敏感凭据操作：

- 列表展示 `token_preview`
- 批量选择、刷新、删除、编辑全部改为传 `id`
- 移除复制 token 和导出全部 token 按钮

这是有意的功能收缩，用于换取浏览器侧不接触真实凭据。

### 4. 质量门禁恢复

`DiaTextReveal` 组件中当前在 render 阶段写 ref，需要调整为 effect / callback 驱动的写法，消除 `react-hooks/refs` 报错。门禁恢复分三层：

1. 源码修复 lint error
2. `next.config.ts` 不再忽略 TypeScript 构建错误
3. GitHub Actions 在构建镜像前显式执行检查命令

## 测试与完成标准

完成时必须满足：

- `uv run pytest` 通过
- `web` 下 `npx eslint src` 通过
- `web` 下 `npx tsc --noEmit` 通过
- `web` 下 `npm run build` 通过
- 账号列表接口不再返回完整 `access_token`
- 账号页仍可完成刷新、编辑、删除与批量操作

## 风险与控制

- 接口字段变更会影响前端账号页
  - 通过同步修改 `web/src/lib/api.ts`、账号页和后端测试控制

- Docker 不再复制 `config.json` 可能改变既有部署行为
  - 通过 README 和 `docker-compose.yml` 使用说明补充环境变量要求

- 移除 token 导出/复制可能影响部分使用习惯
  - 这是本轮明确接受的安全收缩，不做兼容保留
