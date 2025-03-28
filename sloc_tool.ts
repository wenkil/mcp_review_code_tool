import { sloc } from 'node-sloc';

/**
 * 代码行数统计结果接口
 */
interface SlocResult {
  /** 统计的文件路径列表 */
  paths: string[];
  /** 统计的文件数量 */
  files: number;
  /** 代码行数（不包含注释和空行） */
  sloc: number;
  /** 注释行数 */
  comments: number;
  /** 空行数 */
  blank: number;
  /** 总行数（代码+注释+空行） */
  loc: number;
}

/**
 * 扩展的统计结果接口，包含注释率计算
 */
interface ExtendedSlocResult extends SlocResult {
  /** 注释行数占总行数的比率 */
  commentsToTotalRatio: number;
  /** 注释行数占代码行数的比率 */
  commentsToCodeRatio: number;
}

/**
 * 统计指定文件的代码行数和注释比率
 * @param filePath - 需要统计的文件路径
 * @returns Promise<ExtendedSlocResult> 返回统计结果，包含代码行数、注释行数、空行数及注释比率
 */
async function countCodeLines(filePath: string): Promise<ExtendedSlocResult> {
  const options = {
    path: filePath,
    // 添加对Vue文件的支持
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.vue', '.html', '.css'],
    ignorePaths: ['node_modules', 'dist', 'build']
  };

  try {
    const result = await sloc(options);
    
    if(!result) {
      throw new Error('统计结果为空');
    }
    // 计算注释比率
    const commentsToTotalRatio = Number((result.comments / result.loc).toFixed(2));
    const commentsToCodeRatio = Number((result.comments / result.sloc).toFixed(2));

    return {
      ...result,
      commentsToTotalRatio,
      commentsToCodeRatio
    };
  } catch (error) {
    throw new Error(`统计代码行数失败: ${error}`);
  }
}

export { countCodeLines };

// 使用示例 控制台运行tsx src/utils/sloc_tool.ts
// const filePath = 'your path/src/xxx.ts';
// countCodeLines(filePath)
//   .then((result) => {
//     console.log('文件统计结果:');
//     console.log('文件路径:', result.paths);
//     console.log('文件数量:', result.files);
//     console.log('代码行数:', result.sloc);
//     console.log('注释行数:', result.comments);
//     console.log('空行数:', result.blank);
//     console.log('总行数:', result.loc);
//     console.log('注释行数/总行数:', `${result.commentsToTotalRatio * 100}%`);
//     console.log('注释行数/代码行数:', `${result.commentsToCodeRatio * 100}%`);
//   })
//   .catch((error) => {
//     console.error('错误:', error);
//   }); 
