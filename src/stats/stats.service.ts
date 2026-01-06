// src/projects/project-stats.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Project } from 'entities/project.entity';
import { Branch } from 'entities/branch.entity';
import { User } from 'entities/user.entity';
import { Product } from 'entities/products/product.entity';
import { Competitor } from 'entities/competitor.entity';
import { Shift } from 'entities/employee/shift.entity';
import { Journey, JourneyStatus, JourneyType } from 'entities/all_plans.entity';
import { CheckIn } from 'entities/all_plans.entity'; // same file
import { Audit } from 'entities/audit.entity';
import { Sale } from 'entities/products/sale.entity';
import { Stock } from 'entities/products/stock.entity';
import { Feedback } from 'entities/feedback.entity';
import { Survey } from 'entities/survey.entity';
import { SurveyFeedback, SurveyFeedbackAnswer } from 'entities/survey-feedback.entity';

import { ProjectStatsDto } from './stats.dto';
import { SalesTargetService } from 'src/sales-target/sales-target.service';

@Injectable()
export class ProjectStatsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,

    @InjectRepository(Branch)
    private readonly branchRepo: Repository<Branch>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,

    @InjectRepository(Competitor)
    private readonly competitorRepo: Repository<Competitor>,

    @InjectRepository(Shift)
    private readonly shiftRepo: Repository<Shift>,

    @InjectRepository(Journey)
    private readonly journeyRepo: Repository<Journey>,

    @InjectRepository(CheckIn)
    private readonly checkinRepo: Repository<CheckIn>,

    @InjectRepository(Audit)
    private readonly auditRepo: Repository<Audit>,

    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,

    @InjectRepository(Stock)
    private readonly stockRepo: Repository<Stock>,

    @InjectRepository(Feedback)
    private readonly feedbackRepo: Repository<Feedback>,

    @InjectRepository(Survey)
    private readonly surveyRepo: Repository<Survey>,

    @InjectRepository(SurveyFeedback)
    private readonly surveyFeedbackRepo: Repository<SurveyFeedback>,

    @InjectRepository(SurveyFeedbackAnswer)
    private readonly surveyFeedbackAnswerRepo: Repository<SurveyFeedbackAnswer>,

        private readonly salesTargetService: SalesTargetService, // <--- add this

  ) {}

  async getProjectStats(projectId: string): Promise<ProjectStatsDto> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD

    // --------- Simple counts ----------
    const [
      branchesCount,
      usersCount,
      productsCount,
      competitorsCount,
      shiftsCount,
      surveysCount,
    ] = await Promise.all([
      this.branchRepo.count({ where: { project: { id: projectId } } }),
      this.userRepo.count({ where: { project_id: projectId } }),
      this.productRepo.count({ where: { project: { id: projectId } } }),
      this.competitorRepo.count({ where: { project: { id: projectId } } }),
      this.shiftRepo.count({ where: { project: { id: projectId } } }),
      this.surveyRepo.count({ where: { projectId } }),
    ]);

    // --------- Journeys ----------
    const [journeyAgg, journeyTodayAgg] = await Promise.all([
      this.journeyRepo
        .createQueryBuilder('j')
        .select('COUNT(*)', 'total')
        .addSelect('j.type', 'type')
        .addSelect('j.status', 'status')
        .where('j.projectId = :projectId', { projectId })
        .groupBy('j.type')
        .addGroupBy('j.status')
        .getRawMany(),
      this.journeyRepo
        .createQueryBuilder('j')
        .select('COUNT(*)', 'total')
        .addSelect('j.status', 'status')
        .where('j.projectId = :projectId', { projectId })
        .andWhere('j.date = :today', { today: todayStr })
        .groupBy('j.status')
        .getRawMany(),
    ]);

    const journeysByType: Record<string, number> = {};
    const journeysByStatus: Record<string, number> = {};
    let journeysTotal = 0;

    journeyAgg.forEach(row => {
      const type = row.type as JourneyType;
      const status = row.status as JourneyStatus;
      const count = Number(row.total) || 0;

      journeysTotal += count;
      journeysByType[type] = (journeysByType[type] || 0) + count;
      journeysByStatus[status] = (journeysByStatus[status] || 0) + count;
    });

    let todayTotalJourneys = 0;
    let todayPresent = 0;
    let todayAbsent = 0;

    journeyTodayAgg.forEach(row => {
      const status = row.status as JourneyStatus;
      const count = Number(row.total) || 0;

      todayTotalJourneys += count;
      if (
        status === JourneyStatus.PRESENT ||
        status === JourneyStatus.UNPLANNED_PRESENT ||
        status === JourneyStatus.CLOSED ||
        status === JourneyStatus.UNPLANNED_CLOSED
      ) {
        todayPresent += count;
      } else {
        todayAbsent += count;
      }
    });

    // --------- Checkins ----------
    const [totalCheckins, todayCheckins] = await Promise.all([
      this.checkinRepo
        .createQueryBuilder('c')
        .innerJoin('c.journey', 'j')
        .where('j.projectId = :projectId', { projectId })
        .getCount(),
      this.checkinRepo
        .createQueryBuilder('c')
        .innerJoin('c.journey', 'j')
        .where('j.projectId = :projectId', { projectId })
        .andWhere('DATE(c.checkInTime) = :today', { today: todayStr })
        .getCount(),
    ]);

    // --------- Audits ----------
const [auditAgg, auditsWithImages] = await Promise.all([
  this.auditRepo
    .createQueryBuilder('a')
    .select('COUNT(a.id)', 'count')
    .where('a.projectId = :projectId', { projectId })
    .getRawOne(),

  this.auditRepo
    .createQueryBuilder('a')
    .where('a.projectId = :projectId', { projectId })
    .getCount(),
]);
const branches = await this.branchRepo.find({ where: { project: { id: projectId } } });

const salesTargetsPromises = branches.map(branch =>
  this.salesTargetService.getCurrentTarget(branch.id),
);

const currentTargets = await Promise.all(salesTargetsPromises);

const salesTargets = currentTargets
  .filter(t => !!t)
  .map(t => ({
    branchId: t.branch.id,
    branchName: t.branch.name,
    type: t.type,
    targetAmount: t.targetAmount,
    currentAmount: t.currentAmount,
    progress: t.targetAmount ? (t.currentAmount / t.targetAmount) * 100 : 0,
    status: t.status,
  }));
const salesPerPromoterRaw = await this.saleRepo
  .createQueryBuilder('s')
  .innerJoin('s.user', 'p')
  .where('s.projectId = :projectId', { projectId })
  .select(['p.id as promoterId', 'p.name as promoterName'])
  .addSelect('SUM(s.quantity)', 'totalQuantity')
  .addSelect('SUM(s.total_amount)', 'totalAmount')
  .groupBy('p.id')
  .addGroupBy('p.name')
  .getRawMany();

const salesPerPromoter = salesPerPromoterRaw.map(item => ({
  id: item.promoterId,
  name: item.promoterName,
  totalQuantity: Number(item.totalQuantity),
  totalAmount: Number(item.totalAmount),
}));

const startOfWeek = new Date(today);
const day = today.getDay(); // Sunday - Saturday : 0 - 6
const diff = today.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
startOfWeek.setDate(diff);
const startOfWeekStr = startOfWeek.toISOString().slice(0, 10);

const topSellingProductsRaw = await this.saleRepo
  .createQueryBuilder('s')
  .innerJoin('s.product', 'p') // Join with Product entity
  .select(['p.id as productId', 'p.name as productName']) // Alias to match SalesPerPromoterDto structure if possible, or mapping later
  .addSelect('SUM(s.quantity)', 'totalQuantity')
  .addSelect('SUM(s.total_amount)', 'totalAmount')
  .where('s.projectId = :projectId', { projectId })
  .andWhere('s.sale_date >= :startOfWeek', { startOfWeek: startOfWeekStr }) // Filter by current week
  .groupBy('p.id')
  .addGroupBy('p.name')
  .orderBy('SUM(s.total_amount)', 'DESC') // Order by total amount to get "Best"
  .limit(7) // Top 7
  .getRawMany();

const topSellingProducts = topSellingProductsRaw.map(item => ({
  id: item.productId,
  name: item.productName,
  totalQuantity: Number(item.totalQuantity),
  totalAmount: Number(item.totalAmount),
}));


const auditsTotal = Number(auditAgg?.count) || 0;

    // --------- Sales ----------
    const [salesAgg, salesTodayAgg] = await Promise.all([
      this.saleRepo
        .createQueryBuilder('s')
        .select('COUNT(*)', 'totalOrders')
        .addSelect('SUM(s.quantity)', 'totalQuantity')
        .addSelect('SUM(s.total_amount)', 'totalAmount')
        .where('s.projectId = :projectId', { projectId })
        .getRawOne(),
      this.saleRepo
        .createQueryBuilder('s')
        .select('SUM(s.total_amount)', 'totalAmount')
        .where('s.projectId = :projectId', { projectId })
        .andWhere('DATE(s.sale_date) = :today', { today: todayStr })
        .getRawOne(),
    ]);

    const salesTotalOrders = Number(salesAgg?.totalOrders) || 0;
    const salesTotalQuantity = Number(salesAgg?.totalQuantity) || 0;
    const salesTotalAmount = Number(salesAgg?.totalAmount) || 0;
    const salesTodayTotalAmount = Number(salesTodayAgg?.totalAmount) || 0;

    // --------- Stock ----------
    const stockAgg = await this.stockRepo
      .createQueryBuilder('st')
      .innerJoin('st.product', 'p')
      .innerJoin('st.branch', 'b')
      .innerJoin('b.project', 'proj')
      .select('COUNT(DISTINCT st.product)', 'totalSkuWithStock')
      .addSelect('SUM(st.quantity)', 'totalQuantity')
      .addSelect(
        `COUNT(DISTINCT CASE WHEN st.quantity <= 0 THEN st.product ELSE NULL END)`,
        'outOfStockSku',
      )
      .where('proj.id = :projectId', { projectId })
      .getRawOne();

    const totalSkuWithStock = Number(stockAgg?.totalSkuWithStock) || 0;
    const totalStockQuantity = Number(stockAgg?.totalQuantity) || 0;
    const outOfStockSku = Number(stockAgg?.outOfStockSku) || 0;

    // --------- Feedback ----------
    const [feedbackTotal, feedbackResolved] = await Promise.all([
      this.feedbackRepo.count({ where: { project: { id: projectId } } }),
      this.feedbackRepo.count({ where: { project: { id: projectId }, is_resolved: true } }),
    ]);

    const feedbackUnresolved = feedbackTotal - feedbackResolved;

    // --------- Survey Feedback ----------
    const [surveyFeedbackCount, surveyAnswersAgg] = await Promise.all([
      this.surveyFeedbackRepo
        .createQueryBuilder('sf')
        .innerJoin('sf.survey', 's')
        .where('s.projectId = :projectId', { projectId })
        .getCount(),
      this.surveyFeedbackAnswerRepo
        .createQueryBuilder('ans')
        .innerJoin('ans.feedback', 'sf')
        .innerJoin('sf.survey', 's')
        .where('s.projectId = :projectId', { projectId })
        .select('COUNT(*)', 'totalAnswers')
        .getRawOne(),
    ]);
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstDayStr = firstDayOfMonth.toISOString().slice(0, 10);

    const weeklySales = await this.saleRepo
      .createQueryBuilder('s')
      .select(
        `EXTRACT(WEEK FROM s.sale_date)::INTEGER - EXTRACT(WEEK FROM DATE_TRUNC('month', s.sale_date))::INTEGER + 1`,
        'week',
      )
      .addSelect('COUNT(*)', 'totalOrders')
      .addSelect('SUM(s.quantity)', 'totalQuantity')
      .addSelect('SUM(s.total_amount)', 'totalAmount')
      .where('s.projectId = :projectId', { projectId })
      .andWhere('s.sale_date >= :firstDay', { firstDay: firstDayStr })
      .andWhere('s.sale_date <= :today', { today: todayStr })
      .groupBy('week')
      .orderBy('week', 'ASC')
      .getRawMany();
    const totalAnswers = Number(surveyAnswersAgg?.totalAnswers) || 0;

    // --------- Build DTO ----------
    const stats: ProjectStatsDto = {
      project: {
        id: project.id,
        name: project.name,
        is_active: project.is_active,
      },
      counts: {
        branches: branchesCount,
        users: usersCount,
        products: productsCount,
        competitors: competitorsCount,
        shifts: shiftsCount,
        surveys: surveysCount,
      },
      journeys: {
        total: journeysTotal,
        byType: journeysByType as any,
        byStatus: journeysByStatus as any,
        todayTotal: todayTotalJourneys,
        todayPresent,
        todayAbsent,
      },
      attendance: {
        totalCheckins,
        todayCheckins,
      },
      audits: {
        total: auditsTotal,
        withImages: auditsWithImages,
      },
      sales: {
        totalOrders: salesTotalOrders,
        totalQuantity: salesTotalQuantity,
        totalAmount: salesTotalAmount,
        todayTotalAmount: salesTodayTotalAmount,
        weekly: weeklySales.map(w => ({
          week: Number(w.week),
          totalOrders: Number(w.totalOrders),
          totalQuantity: Number(w.totalQuantity),
          totalAmount: Number(w.totalAmount),

        })),
        topSellingProducts,
        perPromoter: salesPerPromoter,
  targets: salesTargets,
      },

      stock: {
        totalSkuWithStock,
        totalQuantity: totalStockQuantity,
        outOfStockSku,
      },
      feedback: {
        total: feedbackTotal,
        resolved: feedbackResolved,
        unresolved: feedbackUnresolved,
      },
      surveysFeedback: {
        totalFeedbacks: surveyFeedbackCount,
        totalAnswers,
      },
    };

    return stats;
  }
}
