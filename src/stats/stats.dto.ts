import { JourneyStatus, JourneyType } from "entities/all_plans.entity";

export interface SalesTargetDto {
  branchId: string;
  branchName: string;
  type: string; // or SalesTargetType if imported
  targetAmount: number;
  currentAmount: number;
  progress: number;
  status: string; // or SalesTargetStatus if imported
}

export interface SalesPerPromoterDto {
  id: string;
  name: string;
  totalQuantity: number;
  totalAmount: number;
}

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
    withImages: number;
  };

  sales: {
    totalOrders: number;
    totalQuantity: number;
    totalAmount: number;
    todayTotalAmount: number;
    weekly: {
      week: number;
      promoterName: string;
      totalOrders: number;
      totalQuantity: number;
      totalAmount: number;
    }[];
    topSellingProducts?: SalesPerPromoterDto[];
    perPromoter?: SalesPerPromoterDto[];
    targets?: SalesTargetDto[];
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
