# mcp_review_code_tool 项目说明文档

## 欢迎给个Star~~

## 项目简介
mcp_review_code_tool 是一个基于 Model Context Protocol (MCP) 的server tool项目。
本项目主要用于实现代码评审等功能的服务集成。LLM使用的是OpenRouter的api。

开发调试记录：
https://wenkil.github.io/2025/03/28/开发一个本地MCP工具进行代码review/

## 技术栈
- Node.js 18+
- TypeScript
- MCP SDK

## 快速开始

### 环境准备
1. 确保已安装 Node.js 18+ 版本
2. 推荐使用 nvm 进行 Node.js 版本管理

### 安装步骤
1. 克隆项目
```bash
git clone [项目地址]
cd mcp_review_code_tool
```

2. 安装依赖
```bash
npm install
```

3. 构建项目
```bash
npm run build
```

### 构建输出
构建后的文件将输出到 `dist` 目录：
- `dist/mcp_code_review.js` - 代码评审工具

## 配置说明

### MCP 服务器配置
在 `mcp.json` 中进行配置：

```json
{
  "mcpServers": {
    "代码评审工具": {
      "command": "node",
      "args": ["your path/dist/mcp_code_review.js"],
      "cwd": "your path",
      "env": {
        "OPENAI_API_KEY": "your api key",
        "OPENAI_API_BASE": "https://openrouter.ai/api/v1",
        "OPENAI_API_MODEL": "qwen/qwen-2.5-coder-32b-instruct:free"
      }
    }
  }
}
```


