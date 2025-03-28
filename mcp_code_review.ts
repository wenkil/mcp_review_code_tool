import OpenAI from 'openai';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
import { countCodeLines } from "./sloc_tool.js";

/**
 * 创建MCP服务器实例
 */
const server = new McpServer({
  name: "代码评审工具",
  version: "0.1.0",
}, {
  capabilities: {
    tools: {},
    logging: {
      message: true
    }
  }
});


// Check for API key and baseURL
// 这里调试时可以手动替换掉来自env的配置
//  || "your api key"
//  || "https://openrouter.ai/api/v1"
//  || "qwen/qwen-2.5-coder-32b-instruct:free"
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const OPENAI_API_BASE = process.env.OPENAI_API_BASE!;
const OPENAI_API_MODEL = process.env.OPENAI_API_MODEL!;
if (!OPENAI_API_KEY || !OPENAI_API_BASE || !OPENAI_API_MODEL) {
  console.error("Error: OPENAI_API_KEY or OPENAI_API_BASE or OPENAI_API_MODEL environment variable is required");
  process.exit(1);
}

/**
 * 读取文件内容
 * @param {string} filePath - 文件的绝对路径
 * @returns {Promise<string>} 文件内容
 */
async function readFileContent(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content;
  } catch (error) {
    throw new Error(`无法读取文件 ${filePath}: ${error}`);
  }
}

/**
 * 路径规范化函数
 * @param {string} rawPath - 原始路径
 * @returns {string} 规范化后的路径
 */
function normalizeCrossPlatformPath(rawPath: string) {
  if (rawPath.startsWith('/') && /^\/[a-zA-Z]:\//.test(rawPath)) {
    rawPath = rawPath.substring(1);
  }
  return path.normalize(rawPath.replace(/[\\/]+/g, path.sep));
}

/**
 * 检查文件是否存在
 * @param {string} filePath - 文件的绝对路径 
 * @returns {Promise<boolean>} 文件是否存在
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 使用大语言模型分析代码
 * @param {string} filePath - 文件路径
 * @param {string} content - 文件内容
 */
async function analyzeLLM(filePath: string, content: string) {
  // 提取文件类型
  const extension = path.extname(filePath).toLowerCase();
  // 统计代码行数和注释率
  const { sloc, comments, blank, loc, commentsToTotalRatio, commentsToCodeRatio } = await countCodeLines(filePath);
  // 构建提示词
  const prompt = `
    ## 根据要求对以下${extension}代码进行代码评审，识别潜在的问题。
    以下是代码行数和注释率：
    文件名：${path.basename(filePath)}
    总行数：${loc}
    注释行数：${comments}
    代码行数：${sloc}
    总注释率（注释行数/总行数）：${commentsToTotalRatio}
    代码行数注释率（注释行数/代码行数）：${commentsToCodeRatio}
    要求：
    1.**评价代码质量**：
      在以下六个方面进行评分（0到10分），并给出平均分：
      - **可读性（Readability）**：代码易于理解程度。
      - **一致性（Consistency）**：编码风格和命名的一致性。
      - **模块化（Modularity）**：代码分块和功能单元划分。
      - **可维护性（Maintainability）**：代码易于修改和扩展的能力。
      - **性能（Performance）**：代码执行效率。
      - **文档化（Documentation）**：代码附带的说明和文档质量。
    2. **生成总体报告**：
      - 将所有分步信息整理成一个markdown结构。
      - 内容应包括：第一部分：文件列表汇总（每个文件的总行数、注释行数、代码行数、总注释率、代码行数注释率评分， 6维评分，得分比较低或者行数比较多；第二部分每一个文件的功能描述，以及在六个质量因素上的评分以及说明；第三部分，总结

      以下是要评审的代码：
      \`\`\`
      ${extension}
      ${content}
      \`\`\`
    `;
  const client = new OpenAI({
    apiKey: OPENAI_API_KEY,
    baseURL: OPENAI_API_BASE,
  });
  const llmResponse = await client.chat.completions.create({
    model: OPENAI_API_MODEL,
    temperature: 0.1,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });
  server.server.sendLoggingMessage({
    level: "info",
    data: `llm结束: ${llmResponse.choices[0].message.content}`
  });
  let llmMessage = llmResponse.choices && llmResponse.choices.length > 0 ? llmResponse.choices[0].message.content : "";
  if (!llmMessage) {
    console.error(`LLM响应内容为空`);
    throw new Error("LLM响应为空");
  }
  return {
    filePath,
    llmResponse: llmMessage,
    message: `对 ${path.basename(filePath)} 的代码评审完成`,
  };
}

// 分离结果和错误
// 定义结果类型
type ProcessResult = {
  filePath: string;
  llmResponse: string;
  message: string;
  error?: string;
};

// 将文件处理逻辑封装成独立函数
async function processFile(fp: string): Promise<ProcessResult> {
  try {
    let rawPath = String.raw`${fp}`;// 使用原始字符串标记
    let filePath = normalizeCrossPlatformPath(rawPath);// 将所有反斜杠替换为正斜杠，Node.js可以在所有平台上理解

    // 检查文件是否存在
    const exists = await fileExists(filePath);
    server.server.sendLoggingMessage({
      level: "info",
      data: `需要review的文件是否存在: ${exists}`,
    });

    if (!exists) {
      const errorMsg = `文件不存在: ${filePath}`;
      console.error(errorMsg);
      return {
        filePath: fp,
        llmResponse: "",
        message: `LLM分析失败: ${errorMsg}`,
        error: errorMsg
      };
    }

    // 读取文件内容
    const content = await readFileContent(filePath);
    // 使用LLM分析文件
    const result = await analyzeLLM(filePath, content);
    return result;
  } catch (error) {
    const errorMsg = `LLM分析失败： ${fp}: ${error}`;
    console.error(errorMsg);
    return {
      filePath: fp,
      llmResponse: "",
      message: `LLM分析失败: ${error}`,
      error: errorMsg
    };
  }
}

/**
 * 代码评审工具
 * @param {string[]} filePaths - 文件的绝对路径数组
 * @returns {Promise<{ content: { type: string, text: string }[] }>} 代码评审结果
 */
server.tool(
  "reviewCode_tool",
  "工具描述：根据要求进行代码评审，总结代码质量，传参为filePaths数组，数组元素是每个文件的完整地址",
  { filePaths: z.array(z.string()) },
  async ({ filePaths }) => {
    // 使用 Promise.all 并行处理所有文件
    const processResults = await Promise.all(
      filePaths.map(fp => processFile(fp))
    );

    const results = processResults as ProcessResult[];
    const errors = processResults
      .filter((r: ProcessResult): r is ProcessResult & { error: string } => Boolean(r.error))
      .map(r => r.error);

    server.server.sendLoggingMessage({
      level: "info",
      data: `当前的results：${JSON.stringify(results)}`
    });

    // 构建响应
    const failedCount = results.filter(r => r.llmResponse === "").length;
    const response = {
      results,
      errors,
      message: `已分析 ${results.length} 个文件，失败 ${failedCount} 个文件`,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport)
