const sloc = require('node-sloc');

/**
 * 扩展的统计结果接口，包含注释率计算
 * @typedef {Object} ExtendedSlocResult
 * @property {string[]} paths - 统计的文件路径列表
 * @property {number} files - 统计的文件数量
 * @property {number} sloc - 代码行数（不包含注释和空行）
 * @property {number} comments - 注释行数
 * @property {number} blank - 空行数
 * @property {number} loc - 总行数（代码+注释+空行）
 * @property {number} commentsToTotalRatio - 注释行数占总行数的比率
 * @property {number} commentsToCodeRatio - 注释行数占代码行数的比率
 */

/**
 * 统计指定文件的代码行数和注释比率
 * @param {string} filePath - 需要统计的文件路径
 * @returns {Promise<ExtendedSlocResult>} 返回统计结果，包含代码行数、注释行数、空行数及注释比率
 */
async function countCodeLines(filePath) {
  const options = {
    path: filePath,
    // 添加对Vue文件的支持
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.vue', '.html', '.css', '.php', '.py', '.c', '.cpp', '.java'],
    ignorePaths: ['node_modules', 'dist', 'build']
  };

  try {
    const result = await sloc(options);
    
    if(!result) {
      throw new Error('统计结果为空');
    }
    // 计算注释比率
    const commentsToTotalRatio = Number((result.comments / result.loc).toFixed(2)) || 0;
    const commentsToCodeRatio = Number((result.comments / result.sloc).toFixed(2)) || 0;

    return {
      ...result,
      commentsToTotalRatio,
      commentsToCodeRatio
    };
  } catch (error) {
    console.error(`统计代码行数失败: ${error}`);
    // 返回默认值，避免因统计失败导致整个流程中断
    return {
      paths: [filePath],
      files: 1,
      sloc: 0,
      comments: 0,
      blank: 0,
      loc: 0,
      commentsToTotalRatio: 0,
      commentsToCodeRatio: 0
    };
  }
}

module.exports = { countCodeLines }; 