# 安全收敛与质量门禁恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除默认鉴权与账号凭据暴露风险，并恢复前端与发布流程的质量门禁。

**Architecture:** 后端保持 token 内部存储不变，在 API 层增加基于 `account_id` 的适配；前端账号管理改为仅操作 `id` 和 `token_preview`。前端构建门禁通过修复现有 lint error、恢复 TypeScript 校验和收紧 GitHub Actions 达成。

**Tech Stack:** FastAPI、Pydantic、Python 3.13、Next.js 16、TypeScript、ESLint、GitHub Actions

---

### Task 1: 写规格文档与基线记录

**Files:**
- Create: `docs/superpowers/specs/2026-04-22-security-quality-hardening-design.md`
- Create: `docs/superpowers/plans/2026-04-22-security-quality-hardening.md`

- [ ] 记录本轮范围、非目标、接口变更与完成标准
- [ ] 记录当前基线：`pytest` 通过、`tsc` 通过、`eslint` 因 `DiaTextReveal` 失败
- [ ] 提交文档，作为实现前锚点

### Task 2: 为后端接口脱敏写失败测试

**Files:**
- Modify: `test/test_api_image_history.py`
- Create: `test/test_account_api_security.py`

- [ ] 新增账号列表测试，断言 `GET /api/accounts` 返回 `token_preview` 且不包含 `access_token`
- [ ] 新增账号更新、删除、刷新测试，断言接口接收 `account_id` / `account_ids`
- [ ] 运行新增测试，确认在现状下失败

### Task 3: 实现后端账号接口脱敏

**Files:**
- Modify: `services/account_service.py`
- Modify: `services/api.py`

- [ ] 在 `AccountService` 中增加基于 `id` 的查找与 token 预览生成能力
- [ ] 将删除、更新、刷新 API 改为接收 `account_id` / `account_ids`
- [ ] 保持图片生成主链路仍使用内部 token
- [ ] 运行后端测试，确认新增与既有测试通过

### Task 4: 为配置安全收敛写失败测试

**Files:**
- Modify: `test/test_config.py`

- [ ] 新增测试，断言仓库默认 `config.json` 不应提供真实密钥
- [ ] 新增测试，断言环境变量优先且缺失密钥时仍抛出明确错误
- [ ] 运行测试，确认现状下至少一条失败

### Task 5: 实现配置与镜像安全收敛

**Files:**
- Modify: `config.json`
- Modify: `Dockerfile`
- Modify: `README.md`

- [ ] 将仓库 `config.json` 改为非敏感示例
- [ ] Docker 最终镜像移除 `COPY config.json ./`
- [ ] README 更新为必须显式提供 `CHATGPT2API_AUTH_KEY`
- [ ] 运行相关测试，确认配置行为符合预期

### Task 6: 为前端账号页迁移写失败验证

**Files:**
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/app/accounts/page.tsx`

- [ ] 梳理前端仍依赖 `access_token` 的位置
- [ ] 先让 TypeScript / ESLint 暴露迁移点
- [ ] 确认移除 token 字段后当前代码无法通过静态检查

### Task 7: 实现前端账号页脱敏迁移

**Files:**
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/app/accounts/page.tsx`

- [ ] 将前端请求改为使用 `account_id` / `account_ids`
- [ ] 将 `Account` 类型改为使用 `token_preview`
- [ ] 移除复制 token 与导出 token 相关 UI 和逻辑
- [ ] 运行 `npx tsc --noEmit`，确认迁移完成

### Task 8: 为质量门禁恢复写失败验证

**Files:**
- Modify: `web/src/components/ui/dia-text-reveal.tsx`
- Modify: `web/next.config.ts`
- Modify: `web/package.json`
- Modify: `.github/workflows/docker-publish.yml`

- [ ] 记录 `npx eslint src` 的当前失败输出
- [ ] 确认 `next.config.ts` 仍在忽略构建类型错误
- [ ] 确认工作流未执行 lint / typecheck / pytest

### Task 9: 实现前端质量门禁恢复

**Files:**
- Modify: `web/src/components/ui/dia-text-reveal.tsx`
- Modify: `web/next.config.ts`
- Modify: `web/package.json`
- Modify: `.github/workflows/docker-publish.yml`
- Modify: `web/.npmrc`

- [ ] 修复 `DiaTextReveal` 中 render 阶段写 ref 的问题
- [ ] 移除 `ignoreBuildErrors`
- [ ] 为前端补充 `lint` 与 `typecheck` 脚本
- [ ] 发布工作流在推镜像前执行 `pytest`、`lint`、`typecheck`、`build`
- [ ] 清理不再需要的 npm 配置噪音

### Task 10: 完整验证与交付

**Files:**
- Verify only

- [ ] 运行 `uv run pytest`
- [ ] 运行 `web` 下 `npx eslint src`
- [ ] 运行 `web` 下 `npx tsc --noEmit`
- [ ] 运行 `web` 下 `npm run build`
- [ ] 检查 `git diff`
- [ ] 提交实现并推送远端分支
