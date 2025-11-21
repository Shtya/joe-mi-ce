// src/projects/dto/project-stats.dto.ts
import { JourneyStatus, JourneyType } from 'entities/all_plans.entity';
import { AuditStatus } from 'entities/audit.entity';

export interface ProjectStatsDto {
  project: {
    id: string;
    name: string;
    is_active: boolean;
  };

  counts: {
    branches: number;
    users: number;
    products: number;
    competitors: number;
    shifts: number;
    surveys: number;
  };

  journeys: {
    total: number;
    byType: { [key in JourneyType]?: number };
    byStatus: { [key in JourneyStatus]?: number };
    todayTotal: number;
    todayPresent: number;
    todayAbsent: number;
  };

  attendance: {
    totalCheckins: number;
    todayCheckins: number;
  };

  audits: {
    total: number;
    byStatus: { [key in AuditStatus]?: number };
    withImages: number;
  };

  sales: {
    totalOrders: number;
    totalQuantity: number;
    totalAmount: number;
    todayTotalAmount: number;
  };

  stock: {
    totalSkuWithStock: number;
    totalQuantity: number;
    outOfStockSku: number;
  };

  feedback: {
    total: number;
    resolved: number;
    unresolved: number;
  };

  surveysFeedback: {
    totalFeedbacks: number;
    totalAnswers: number;
  };
}
