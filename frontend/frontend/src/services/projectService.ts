/**
 * Project Service - 项目管理 API
 */

import apiClient from './api';
import type { ProjectType } from '../types';

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  beneficiary_name?: string;
  projectType?: ProjectType;
  projectNumber?: string;
}

export const projectService = {
  /**
   * 获取所有项目列表
   */
  list: () => apiClient.get<Project[]>('/projects'),

  /**
   * 创建新项目
   */
  create: (name: string, projectType: ProjectType = 'EB-1A') =>
    apiClient.post<Project>('/projects', { name, projectType }),

  /**
   * 获取项目详情
   */
  get: (projectId: string) =>
    apiClient.get<Project>(`/projects/${projectId}`),

  /**
   * 更新项目元数据
   */
  update: (projectId: string, updates: Partial<Project>) =>
    apiClient.patch<Project>(`/projects/${projectId}`, updates),

  /**
   * 删除项目
   */
  delete: (projectId: string) =>
    apiClient.delete<{ success: boolean }>(`/projects/${projectId}`),
};

export default projectService;
