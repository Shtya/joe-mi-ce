import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import * as exceljs from 'exceljs';
import * as dayjs from 'dayjs';
import * as os from 'os';
import * as path from 'path';

import { User } from 'entities/user.entity';
import { Journey, JourneyStatus } from 'entities/all_plans.entity';
import { Sale } from 'entities/products/sale.entity';

import { Project } from 'entities/project.entity';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(Journey)
    private readonly journeyRepository: Repository<Journey>,
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
  ) {}

  async generateMonthlyReport(): Promise<string> {
    this.logger.log('Started generating monthly report...');

    const projectName = 'taqnia';
    const project = await this.projectRepository.findOne({ where: { name: projectName } });
    const projectId = project?.id;

    if (!projectId) {
      this.logger.warn(`Project "${projectName}" not found. Report might be empty or unfiltered.`);
    }

    const now = dayjs();
    const startOfMonth = now.startOf('month');
    
    // The report should include data only up to yesterday
    let endOfReportingPeriod = now.subtract(1, 'day').endOf('day');
    
    // If today is the 1st of the month, we have no days to report yet for *this* month.
    // In a real scenario, running on the 1st usually means reporting on the *previous* month.
    // For this exact requirement: "generate the Excel report dynamically based on the current month",
    // if today is the 1st, the period is technically empty or just reporting the 1st.
    // We'll cap it: if yesterday is before the start of the month, we just use today.
    if (endOfReportingPeriod.isBefore(startOfMonth)) {
      endOfReportingPeriod = now.endOf('day');
    }

    const daysInMonth = now.daysInMonth();
    const monthName = now.format('MMMM'); // e.g., "February"
    const currentMonthPrefix = now.format('YYYY-MM');

    const workbook = new exceljs.Workbook();
    workbook.creator = 'System Cron';
    workbook.created = new Date();

    const tab1Sheet = workbook.addWorksheet(`Daily Values and Total`);
    const tab2Sheet = workbook.addWorksheet(`SAR Entries`);
    const tab3Sheet = workbook.addWorksheet(`Check-in - Check-out`);

    // Define columns
    const baseColumns = [
      { header: 'JOE M.I. USER', key: 'joe_user_1', width: 15 },
      { header: 'No', key: 'no', width: 5 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Name EN', key: 'name_en', width: 25 },
      { header: 'JOE M.I. USER', key: 'joe_user_2', width: 15 },
      { header: 'ID', key: 'id', width: 15 },
      { header: 'City', key: 'city', width: 15 },
      { header: 'Channel', key: 'channel', width: 15 },
      { header: 'Store', key: 'store', width: 20 },
      { header: 'Brand', key: 'brand', width: 15 },
    ];

    const dateColumns = [];
    const checkinDateColumns = [];
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${currentMonthPrefix}-${String(i).padStart(2, '0')}`;
        dateColumns.push({ header: dateStr, key: `day_${i}`, width: 15 });
        checkinDateColumns.push({ header: `${dateStr} Check-in`, key: `day_in_${i}`, width: 15 });
        checkinDateColumns.push({ header: `${dateStr} Check-out`, key: `day_out_${i}`, width: 15 });
    }

    tab1Sheet.columns = [...baseColumns, ...dateColumns, { header: 'TLL DAYS', key: 'tll_days_tab1', width: 15 }];
    tab2Sheet.columns = [...baseColumns, ...dateColumns, { header: 'TLL DAYS', key: 'tll_days_tab2', width: 15 }];
    tab3Sheet.columns = [...baseColumns, ...checkinDateColumns, { header: 'TLL DAYS', key: 'tll_days_tab3', width: 15 }];

    // Fetch data
    // Fetch all active users with their relations (Role, Branch, etc.)
    const users = await this.userRepository.find({
      where: { 
        is_active: true,
        ...(projectId && { project_id: projectId })
      },
      relations: ['role', 'branch', 'branch.city', 'branch.chain'],
    });

    // Fetch Journeys (Attendance & Checkins) for the current month up to yesterday
    const journeys = await this.journeyRepository.find({
      where: {
        date: Between(startOfMonth.format('YYYY-MM-DD'), endOfReportingPeriod.format('YYYY-MM-DD')),
        ...(projectId && { projectId })
      },
      relations: ['user', 'checkin'],
    });

    // Fetch Sales for the current month up to yesterday
    const sales = await this.saleRepository.find({
      where: {
        created_at: Between(startOfMonth.toDate(), endOfReportingPeriod.toDate()),
        ...(projectId && { projectId })
      },
      relations: ['user'],
    });

    // Process data per user
    let rowNo = 1;
    for (const user of users) {
      const userJourneys = journeys.filter(j => j.user?.id === user.id);
      const userSales = sales.filter(s => s.user?.id === user.id);

      const baseRowData = {
        joe_user_1: user.username,
        no: rowNo++,
        name: user.name,
        joe_user_2: user.username,
        id: user.national_id || user.id.substring(0, 8),
        city: user.branch?.city?.name || 'N/A',
        channel: user.branch?.chain?.name || 'N/A',
        store: user.branch?.name || 'N/A',
        brand: projectName,
      };

      const tab1RowData = { ...baseRowData };
      const tab2RowData = { ...baseRowData };
      const tab3RowData = { ...baseRowData };

      let ttlDays = 0;
      let totalSales = 0;

      for (let i = 1; i <= daysInMonth; i++) {
        const currentDateStr = `${currentMonthPrefix}-${String(i).padStart(2, '0')}`;
        const dayKey = `day_${i}`;
        const dayInKey = `day_in_${i}`;
        const dayOutKey = `day_out_${i}`;
        
        // Only process data up to the reporting end date
        if (dayjs(currentDateStr).isAfter(endOfReportingPeriod, 'day')) {
           tab1RowData[dayKey] = 0;
           tab2RowData[dayKey] = 'SAR -';
           tab3RowData[dayInKey] = '';
           tab3RowData[dayOutKey] = '';
           continue;
        }

        const dayJourney = userJourneys.find(j => j.date === currentDateStr);
        const dayCheckin = dayJourney?.checkin;
        if (dayCheckin) {
            const inTime = dayCheckin.checkInTime ? dayjs(dayCheckin.checkInTime).format('HH:mm') : '--:--';
            const outTime = dayCheckin.checkOutTime ? dayjs(dayCheckin.checkOutTime).format('HH:mm') : '--:--';
            tab3RowData[dayInKey] = inTime;
            tab3RowData[dayOutKey] = outTime;
            ttlDays += 1;
        } else {
            tab3RowData[dayInKey] = '';
            tab3RowData[dayOutKey] = '';
        }

        // Sales Logic
        const daySales = userSales.filter(s => dayjs(s.created_at).format('YYYY-MM-DD') === currentDateStr);
        // Using quantity or target for "Daily Values" is common. We will use total sales amount without SAR prefix for Tab 1, and with prefix for Tab 2.
        // But his screenshot has 44, 51, 75, 90. So we will use sum of quantities. 
        const dailyQuantityTotal = daySales.reduce((sum, sale) => sum + Number(sale.quantity || 0), 0);
        const dailySalesTotal = daySales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
        
        // Tab 1: Daily values (e.g. integer amounts like quantites or values without SAR)
        tab1RowData[dayKey] = dailySalesTotal > 0 ? dailySalesTotal : 0;
        
        // Tab 2: SAR formatted
        tab2RowData[dayKey] = dailySalesTotal > 0 ? `SAR ${dailySalesTotal}` : 'SAR -';
        
        totalSales += dailySalesTotal;
      }

      tab1RowData['tll_days_tab1'] = totalSales; // Sum of the daily values
      tab2RowData['tll_days_tab2'] = totalSales > 0 ? `SAR ${totalSales}` : 'SAR -';
      tab3RowData['tll_days_tab3'] = ttlDays; // Number of days checked in

      tab1Sheet.addRow(tab1RowData);
      tab2Sheet.addRow(tab2RowData);
      tab3Sheet.addRow(tab3RowData);
    }

    // Styling
    [tab1Sheet, tab2Sheet, tab3Sheet].forEach(sheet => {
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Save to temp file
    const executionDateStr = now.format('YYYY_MM_DD');
    const filename = `monthly_report_${executionDateStr}.xlsx`;
    const tempFilePath = path.join(os.tmpdir(), filename);

    await workbook.xlsx.writeFile(tempFilePath);
    this.logger.log(`Monthly report successfully generated at ${tempFilePath}`);

    return tempFilePath;
  }
}
