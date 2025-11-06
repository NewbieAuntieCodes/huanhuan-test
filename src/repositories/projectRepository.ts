/**
 * 项目数据操作层 (Project Repository)
 *
 * 职责：
 * - 统一管理项目相关的数据库操作
 * - 提供事务管理和错误处理
 * - 封装复杂的查询逻辑
 */

import { db } from '../db';
import { Project, Chapter, ScriptLine, SilenceSettings } from '../types';
import { defaultSilenceSettings } from '../lib/defaultSilenceSettings';

/**
 * 项目数据仓库
 */
export class ProjectRepository {
  /**
   * 获取所有项目（按最后修改时间倒序）
   */
  async getAll(): Promise<Project[]> {
    try {
      const projects = await db.projects.orderBy('lastModified').reverse().toArray();
      return projects.map(p => ({
        ...p,
        cvStyles: p.cvStyles || {},
        silenceSettings: p.silenceSettings || defaultSilenceSettings,
      }));
    } catch (error) {
      console.error('❌ [ProjectRepository] 获取所有项目失败:', error);
      throw new Error('获取项目列表失败');
    }
  }

  /**
   * 根据ID获取项目
   */
  async getById(projectId: string): Promise<Project | undefined> {
    try {
      const project = await db.projects.get(projectId);
      if (!project) return undefined;

      return {
        ...project,
        cvStyles: project.cvStyles || {},
        silenceSettings: project.silenceSettings || defaultSilenceSettings,
      };
    } catch (error) {
      console.error(`❌ [ProjectRepository] 获取项目 ${projectId} 失败:`, error);
      throw new Error(`获取项目失败: ${projectId}`);
    }
  }

  /**
   * 创建新项目（包含默认配置）
   */
  async create(project: Project): Promise<Project> {
    try {
      const projectWithDefaults: Project = {
        ...project,
        cvStyles: {
          'pb': { bgColor: 'bg-slate-700', textColor: 'text-slate-300' },
          ...project.cvStyles,
        },
        customSoundTypes: project.customSoundTypes || [],
        silenceSettings: project.silenceSettings || defaultSilenceSettings,
        lastModified: Date.now(),
      };

      await db.projects.add(projectWithDefaults);
      console.log('✅ [ProjectRepository] 创建项目成功:', projectWithDefaults.id);
      return projectWithDefaults;
    } catch (error) {
      console.error('❌ [ProjectRepository] 创建项目失败:', error);
      throw new Error('创建项目失败');
    }
  }

  /**
   * 更新项目（自动更新 lastModified）
   */
  async update(project: Project): Promise<Project> {
    try {
      const updatedProject = {
        ...project,
        lastModified: Date.now(),
      };

      await db.projects.put(updatedProject);
      console.log('✅ [ProjectRepository] 更新项目成功:', updatedProject.id);
      return updatedProject;
    } catch (error) {
      console.error(`❌ [ProjectRepository] 更新项目 ${project.id} 失败:`, error);
      throw new Error(`更新项目失败: ${project.id}`);
    }
  }

  /**
   * 批量更新多个项目
   */
  async bulkUpdate(projects: Project[]): Promise<void> {
    try {
      const updatedProjects = projects.map(p => ({
        ...p,
        lastModified: Date.now(),
      }));

      await db.projects.bulkPut(updatedProjects);
      console.log(`✅ [ProjectRepository] 批量更新 ${projects.length} 个项目成功`);
    } catch (error) {
      console.error('❌ [ProjectRepository] 批量更新项目失败:', error);
      throw new Error('批量更新项目失败');
    }
  }

  /**
   * 删除项目（不处理关联数据，由调用方管理事务）
   */
  async delete(projectId: string): Promise<void> {
    try {
      await db.projects.delete(projectId);
      console.log('✅ [ProjectRepository] 删除项目成功:', projectId);
    } catch (error) {
      console.error(`❌ [ProjectRepository] 删除项目 ${projectId} 失败:`, error);
      throw new Error(`删除项目失败: ${projectId}`);
    }
  }

  /**
   * 添加章节到项目
   */
  async appendChapters(projectId: string, chapters: Chapter[]): Promise<Project> {
    try {
      const project = await this.getById(projectId);
      if (!project) {
        throw new Error(`项目不存在: ${projectId}`);
      }

      const updatedProject: Project = {
        ...project,
        chapters: [...project.chapters, ...chapters],
        lastModified: Date.now(),
      };

      await db.projects.put(updatedProject);
      console.log(`✅ [ProjectRepository] 添加 ${chapters.length} 个章节到项目:`, projectId);
      return updatedProject;
    } catch (error) {
      console.error(`❌ [ProjectRepository] 添加章节到项目 ${projectId} 失败:`, error);
      throw error;
    }
  }

  /**
   * 批量添加空章节
   */
  async batchAddEmptyChapters(projectId: string, count: number): Promise<Project> {
    try {
      const project = await this.getById(projectId);
      if (!project) {
        throw new Error(`项目不存在: ${projectId}`);
      }

      const newChapters: Chapter[] = [];
      const startIndex = project.chapters.length + 1;

      for (let i = 0; i < count; i++) {
        const chapterNumber = startIndex + i;
        newChapters.push({
          id: `${projectId}_chapter_${Date.now()}_${i}`,
          title: `第${chapterNumber}章`,
          rawContent: '',
          scriptLines: [],
        });
      }

      return await this.appendChapters(projectId, newChapters);
    } catch (error) {
      console.error(`❌ [ProjectRepository] 批量添加空章节失败:`, error);
      throw error;
    }
  }

  /**
   * 添加自定义音效类型
   */
  async addCustomSoundType(projectId: string, soundType: string): Promise<Project> {
    try {
      const project = await this.getById(projectId);
      if (!project) {
        throw new Error(`项目不存在: ${projectId}`);
      }

      const customSoundTypes = project.customSoundTypes || [];
      if (customSoundTypes.includes(soundType)) {
        return project; // 已存在，不需要添加
      }

      const updatedProject: Project = {
        ...project,
        customSoundTypes: [...customSoundTypes, soundType],
        lastModified: Date.now(),
      };

      await db.projects.put(updatedProject);
      console.log(`✅ [ProjectRepository] 添加自定义音效类型: ${soundType}`);
      return updatedProject;
    } catch (error) {
      console.error(`❌ [ProjectRepository] 添加自定义音效类型失败:`, error);
      throw error;
    }
  }

  /**
   * 删除自定义音效类型
   */
  async deleteCustomSoundType(projectId: string, soundType: string): Promise<Project> {
    try {
      const project = await this.getById(projectId);
      if (!project) {
        throw new Error(`项目不存在: ${projectId}`);
      }

      const customSoundTypes = project.customSoundTypes || [];
      const updatedProject: Project = {
        ...project,
        customSoundTypes: customSoundTypes.filter(st => st !== soundType),
        lastModified: Date.now(),
      };

      await db.projects.put(updatedProject);
      console.log(`✅ [ProjectRepository] 删除自定义音效类型: ${soundType}`);
      return updatedProject;
    } catch (error) {
      console.error(`❌ [ProjectRepository] 删除自定义音效类型失败:`, error);
      throw error;
    }
  }

  /**
   * 更新项目静音设置
   */
  async updateSilenceSettings(projectId: string, settings: SilenceSettings): Promise<Project> {
    try {
      const project = await this.getById(projectId);
      if (!project) {
        throw new Error(`项目不存在: ${projectId}`);
      }

      const updatedProject: Project = {
        ...project,
        silenceSettings: settings,
        lastModified: Date.now(),
      };

      await db.projects.put(updatedProject);
      console.log(`✅ [ProjectRepository] 更新静音设置:`, projectId);
      return updatedProject;
    } catch (error) {
      console.error(`❌ [ProjectRepository] 更新静音设置失败:`, error);
      throw error;
    }
  }

  /**
   * 切换脚本行返回标记
   */
  async toggleLineReturnMark(projectId: string, chapterId: string, lineId: string): Promise<Project> {
    try {
      const project = await this.getById(projectId);
      if (!project) {
        throw new Error(`项目不存在: ${projectId}`);
      }

      const updatedChapters = project.chapters.map(chapter => {
        if (chapter.id !== chapterId) return chapter;

        return {
          ...chapter,
          scriptLines: chapter.scriptLines.map(line => {
            if (line.id !== lineId) return line;
            return {
              ...line,
              isMarkedForReturn: !line.isMarkedForReturn,
            };
          }),
        };
      });

      const updatedProject: Project = {
        ...project,
        chapters: updatedChapters,
        lastModified: Date.now(),
      };

      await db.projects.put(updatedProject);
      return updatedProject;
    } catch (error) {
      console.error(`❌ [ProjectRepository] 切换返回标记失败:`, error);
      throw error;
    }
  }

  /**
   * 更新脚本行反馈
   */
  async updateLineFeedback(projectId: string, chapterId: string, lineId: string, feedback: string): Promise<Project> {
    try {
      const project = await this.getById(projectId);
      if (!project) {
        throw new Error(`项目不存在: ${projectId}`);
      }

      const updatedChapters = project.chapters.map(chapter => {
        if (chapter.id !== chapterId) return chapter;

        return {
          ...chapter,
          scriptLines: chapter.scriptLines.map(line => {
            if (line.id !== lineId) return line;
            return {
              ...line,
              feedback,
            };
          }),
        };
      });

      const updatedProject: Project = {
        ...project,
        chapters: updatedChapters,
        lastModified: Date.now(),
      };

      await db.projects.put(updatedProject);
      return updatedProject;
    } catch (error) {
      console.error(`❌ [ProjectRepository] 更新脚本行反馈失败:`, error);
      throw error;
    }
  }

  /**
   * 更新脚本行后静音时长
   */
  async updateLinePostSilence(projectId: string, chapterId: string, lineId: string, silence?: number): Promise<Project> {
    try {
      const project = await this.getById(projectId);
      if (!project) {
        throw new Error(`项目不存在: ${projectId}`);
      }

      const updatedChapters = project.chapters.map(chapter => {
        if (chapter.id !== chapterId) return chapter;

        return {
          ...chapter,
          scriptLines: chapter.scriptLines.map(line => {
            if (line.id !== lineId) return line;
            return {
              ...line,
              postSilence: silence,
            };
          }),
        };
      });

      const updatedProject: Project = {
        ...project,
        chapters: updatedChapters,
        lastModified: Date.now(),
      };

      await db.projects.put(updatedProject);
      return updatedProject;
    } catch (error) {
      console.error(`❌ [ProjectRepository] 更新脚本行后静音失败:`, error);
      throw error;
    }
  }
}

// 导出单例实例
export const projectRepository = new ProjectRepository();
