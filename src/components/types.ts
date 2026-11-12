/* أنواع البيانات المشتركة للوحة الإدارة — مبنية على عقود API الثابتة للمشروع */

export type KeyProvider = "kie" | "cometapi";

export interface ApiKeyItem {
  id: string;
  provider: string;
  label?: string | null;
  maskedKey: string;
  status: string; // "active" | "exhausted" | "disabled"
  usageCount?: number | null;
  successCount?: number | null;
  failCount?: number | null;
  lastUsedAt?: string | null;
  lastCheckedAt?: string | null;
  lastError?: string | null;
  createdAt?: string | null;
}

export interface HealthModels {
  canonical?: string;
  type?: string;
  providers?: string[];
}

export interface HealthData {
  ok?: boolean;
  database?: string; // "turso-connected" | "disconnected"
  mcpEndpoint?: string;
  models?: HealthModels[];
  merger?: {
    base?: string;
    healthy?: boolean;
  };
  authRequired?: boolean;
}

export interface TaskItem {
  id: string;
  type: string; // "image" | "video" | "merge"
  model?: string | null;
  status: string; // "completed" | "failed" | "processing" | "pending"
  progress?: number | null;
  prompt?: string | null;
  resultUrls?: string[] | null;
  error?: string | null;
  attemptsCount?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface TasksStats {
  total?: number;
  completed?: number;
  failed?: number;
  processing?: number;
}

export interface TasksResponse {
  stats?: TasksStats;
  tasks?: TaskItem[];
}
