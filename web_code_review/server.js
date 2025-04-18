const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const OpenAI = require('openai');
const { countCodeLines } = require('./sloc_tool.js');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// 检查环境变量
if (!process.env.OPENAI_API_KEY) {
  console.error("错误: 需要设置环境变量 OPENAI_API_KEY");
  console.error("请在.env文件中设置这些变量");
}

// 配置文件上传
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// 确保上传目录存在
fs.mkdir('uploads', { recursive: true }).catch(console.error);

// 静态文件服务
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// 路由处理
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * 使用大语言模型分析代码
 * @param {string} filePath - 文件路径
 * @param {string} content - 文件内容
 * @returns {Promise<Object>} 分析结果
 */
async function analyzeLLM(filePath, content) {
  try {
    const extension = path.extname(filePath).toLowerCase();
    
    // 统计代码行数
    let stats;
    try {
      stats = await countCodeLines(filePath);
      console.log("代码统计结果:", stats);
    } catch (statError) {
      console.error(`统计代码行数失败: ${statError}`);
      stats = {
        sloc: 0,
        comments: 0,
        blank: 0,
        loc: content.split('\n').length,
        commentsToTotalRatio: 0,
        commentsToCodeRatio: 0
      };
    }
    
    const { sloc, comments, blank, loc, commentsToTotalRatio, commentsToCodeRatio } = stats;
    
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
        - 内容应包括：第一部分：文件列表汇总（每个文件的总行数、注释行数、代码行数、总注释率、代码行数注释率评分， 6维评分平均分；第二部分每一个文件的功能描述，以及在六个质量因素上的评分以及说明；第三部分，总结

        以下是要评审的代码：
        \`\`\`${extension}
        ${content}
        \`\`\`
      `;

    // 检查API密钥
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API密钥未设置");
    }

    // 创建OpenAI客户端
    const clientOptions = {
      apiKey: process.env.OPENAI_API_KEY,
    };
    
    // 如果设置了baseURL，添加到选项中
    if (process.env.OPENAI_API_BASE) {
      clientOptions.baseURL = process.env.OPENAI_API_BASE;
    }
    
    const client = new OpenAI(clientOptions);

    console.log(`开始分析文件: ${path.basename(filePath)}`);
    
    // 设置API调用参数
    const requestOptions = {
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };
    
    // 如果设置了模型，使用指定模型
    if (process.env.OPENAI_API_MODEL) {
      requestOptions.model = process.env.OPENAI_API_MODEL;
    } else {
      // 默认模型
      requestOptions.model = "gpt-3.5-turbo";
    }
    
    const llmResponse = await client.chat.completions.create(requestOptions);
    
    console.log(`分析完成: ${path.basename(filePath)}`);

    if (!llmResponse.choices || llmResponse.choices.length === 0 || !llmResponse.choices[0].message.content) {
      throw new Error("LLM响应为空");
    }

    return {
      filePath: path.basename(filePath),
      originalPath: filePath,
      llmResponse: llmResponse.choices[0].message.content,
      stats: { sloc, comments, blank, loc, commentsToTotalRatio, commentsToCodeRatio },
      message: `对 ${path.basename(filePath)} 的代码评审完成`,
    };
  } catch (error) {
    console.error(`分析文件时出错: ${error.message}`);
    if (error.status === 401) {
      console.error("API认证失败，请检查API密钥是否正确设置");
    }
    throw error;
  }
}

// 文件上传和代码审查处理
app.post('/upload', upload.array('files'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    console.log(`收到${req.files.length}个文件的上传请求`);
    
    const results = await Promise.all(
      req.files.map(async (file) => {
        try {
          console.log(`处理文件: ${file.originalname}`);
          const content = await fs.readFile(file.path, 'utf-8');
          const result = await analyzeLLM(file.path, content);
          return result;
        } catch (error) {
          console.error(`处理文件 ${file.originalname} 时出错:`, error);
          return {
            filePath: file.originalname,
            error: error.message || "未知错误"
          };
        } finally {
          // 清理上传的文件
          try {
            await fs.unlink(file.path);
          } catch (unlinkError) {
            console.error(`删除文件 ${file.path} 时出错:`, unlinkError);
          }
        }
      })
    );

    res.json({ results });
  } catch (error) {
    console.error('处理上传文件时出错:', error);
    res.status(500).json({ error: '服务器处理文件时出错: ' + (error.message || "未知错误") });
  }
});

app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
  console.log(`API密钥${process.env.OPENAI_API_KEY ? '已' : '未'}配置`);
  console.log(`API基础URL${process.env.OPENAI_API_BASE ? '已' : '未'}配置`);
  console.log(`模型${process.env.OPENAI_API_MODEL ? '已' : '未'}配置，${process.env.OPENAI_API_MODEL || '将使用默认模型'}`);
}); 