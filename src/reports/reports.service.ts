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
    
    let endOfReportingPeriod = now.endOf('day');
    if (endOfReportingPeriod.isBefore(startOfMonth)) {
      endOfReportingPeriod = now.endOf('day');
    }

    const daysInMonth = (now.month() === dayjs().month() && now.year() === dayjs().year()) ? now.date() : now.daysInMonth();
    const currentMonthPrefix = now.format('YYYY-MM');

    const workbook = new exceljs.Workbook();
    workbook.creator = 'System Cron';

    const attendanceSheet = workbook.addWorksheet(`Attendance`);
    const tab2Sheet = workbook.addWorksheet(`SAR Entries`);
    const tab3Sheet = workbook.addWorksheet(`Check-in - Check-out`);

    const baseColumns = [
      { header: 'JOE M.I. USER', key: 'joe_user_1', width: 15 },
      { header: 'No', key: 'no', width: 5 },
      { header: 'Name', key: 'name', width: 25 },
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
        checkinDateColumns.push({ header: `${dateStr} Check-in`, width: 15 });
        checkinDateColumns.push({ header: `${dateStr} Check-out`, width: 15 });
    }

    attendanceSheet.columns = [...baseColumns, ...dateColumns, { header: 'TLL DAYS', key: 'ttl_attendance', width: 15 }];
    tab2Sheet.columns = [...baseColumns, ...dateColumns, { header: 'TLL DAYS', key: 'tll_days_tab2', width: 15 }];

    // Set widths for Tab 3
    const tab3TotalCols = baseColumns.length + checkinDateColumns.length + 1;
    for(let i=1; i<=tab3TotalCols; i++) {
      tab3Sheet.getColumn(i).width = 15;
    }

    let users = await this.userRepository.find({
      where: { 
        is_active: true,
        ...(projectId && { project_id: projectId })
      },
      relations: ['role', 'branch', 'branch.city', 'branch.chain'],
    });
    users = users.filter(u => u.role?.name?.toLowerCase() === 'promoter');

    const journeys = await this.journeyRepository.find({
      where: {
        date: Between(startOfMonth.format('YYYY-MM-DD'), endOfReportingPeriod.format('YYYY-MM-DD')),
        ...(projectId && { projectId })
      },
      relations: ['user', 'checkin'],
    });

    const sales = await this.saleRepository.find({
      where: {
        sale_date: Between(startOfMonth.toDate(), endOfReportingPeriod.toDate()),
        ...(projectId && { projectId })
      },
      relations: ['user'],
    });

    const dailyAttendanceTotals: Record<string, number> = {};
    for (let i = 1; i <= daysInMonth; i++) {
      dailyAttendanceTotals[`day_${i}`] = 0;
    }

    const attendanceRows: any[] = [];
    const tab2Rows: any[] = [];
    const tab3Rows: any[] = [];

    let rowNo = 1;
    for (const user of users) {
      const userJourneys = journeys.filter(j => j.user?.id === user.id);
      const userSales = sales.filter(s => s.user?.id === user.id);

      let effectiveBranch = user.branch;
      if (!effectiveBranch && userJourneys.length > 0) {
          const sorted = [...userJourneys].sort((a, b) => b.date.localeCompare(a.date));
          const lastWithBranch = sorted.find(j => j.branch);
          if (lastWithBranch) {
              effectiveBranch = lastWithBranch.branch;
          }
      }

      const baseRowData = {
        joe_user_1: user.username,
        no: rowNo++,
        name: user.name,
        joe_user_2: user.username,
        id: user.national_id || user.id.substring(0, 8),
        city: effectiveBranch?.city?.name || 'N/A',
        channel: effectiveBranch?.chain?.name || 'N/A',
        store: effectiveBranch?.name || 'N/A',
        brand: projectName,
      };

      const attRow = { ...baseRowData };
      const t2Row = { ...baseRowData };
      const t3RowArr = [
         baseRowData.joe_user_1, baseRowData.no, baseRowData.name, baseRowData.joe_user_2, 
         baseRowData.id, baseRowData.city, baseRowData.channel, baseRowData.store, baseRowData.brand
      ];

      let ttlDays = 0;
      let ttlAttendance = 0;
      let totalSales = 0;

      for (let i = 1; i <= daysInMonth; i++) {
        const currentDateStr = `${currentMonthPrefix}-${String(i).padStart(2, '0')}`;
        const dayKey = `day_${i}`;
        
        if (dayjs(currentDateStr).isAfter(endOfReportingPeriod, 'day')) {
           attRow[dayKey] = '';
           t2Row[dayKey] = 'SAR -';
           t3RowArr.push('');
           t3RowArr.push('');
           continue;
        }

        const dayJourney = userJourneys.find(j => j.date === currentDateStr);
        
        if (dayJourney) {
            if ([JourneyStatus.PRESENT, JourneyStatus.CLOSED, JourneyStatus.UNPLANNED_PRESENT, JourneyStatus.UNPLANNED_CLOSED].includes(dayJourney.status as any)) {
                attRow[dayKey] = 1;
                dailyAttendanceTotals[dayKey] += 1;
                ttlAttendance += 1;
                ttlDays += 1;
            } else if ([JourneyStatus.ABSENT, JourneyStatus.UNPLANNED_ABSENT].includes(dayJourney.status as any)) {
                attRow[dayKey] = 0;
            } else {
                attRow[dayKey] = ''; 
            }
        } else {
            attRow[dayKey] = '';
        }

        const dayCheckin = dayJourney?.checkin;
        if (dayCheckin) {
            const inTime = dayCheckin.checkInTime ? dayjs(dayCheckin.checkInTime).format('HH:mm') : '--:--';
            const outTime = dayCheckin.checkOutTime ? dayjs(dayCheckin.checkOutTime).format('HH:mm') : '--:--';
            t3RowArr.push(inTime);
            t3RowArr.push(outTime);
        } else {
            t3RowArr.push('');
            t3RowArr.push('');
        }

        const daySales = userSales.filter(s => dayjs(s.sale_date).format('YYYY-MM-DD') === currentDateStr);
        const dailySalesTotal = daySales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
        
        t2Row[dayKey] = dailySalesTotal > 0 ? `SAR ${dailySalesTotal}` : 'SAR -';
        totalSales += dailySalesTotal;
      }

      attRow['ttl_attendance'] = ttlAttendance;
      t2Row['tll_days_tab2'] = totalSales > 0 ? `SAR ${totalSales}` : 'SAR -';
      t3RowArr.push(ttlDays); 

      attendanceRows.push(attRow);
      tab2Rows.push(t2Row);
      tab3Rows.push(t3RowArr);
    }

    const totalsRowData: Record<string, any> = { brand: 'Total' }; 
    let totalOfTotals = 0;
    for (let i = 1; i <= daysInMonth; i++) {
       const key = `day_${i}`;
       totalsRowData[key] = dailyAttendanceTotals[key];
       totalOfTotals += dailyAttendanceTotals[key];
    }
    totalsRowData['ttl_attendance'] = totalOfTotals;

    attendanceSheet.addRow(totalsRowData);
    attendanceRows.forEach(r => attendanceSheet.addRow(r));

    tab2Rows.forEach(r => tab2Sheet.addRow(r));

    const headerRow1 = tab3Sheet.getRow(1);
    const headerRow2 = tab3Sheet.getRow(2);

    baseColumns.forEach((col, index) => {
        const cell = headerRow1.getCell(index + 1);
        cell.value = col.header;
        tab3Sheet.mergeCells(1, index + 1, 2, index + 1);
    });

    let currentColIndex = baseColumns.length + 1;
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${currentMonthPrefix}-${String(i).padStart(2, '0')}`;
        
        const dateCell = headerRow1.getCell(currentColIndex);
        dateCell.value = dateStr;
        tab3Sheet.mergeCells(1, currentColIndex, 1, currentColIndex + 1);
        
        headerRow2.getCell(currentColIndex).value = 'Check-in';
        headerRow2.getCell(currentColIndex + 1).value = 'Check-out';
        currentColIndex += 2;
    }

    const tllDaysCell = headerRow1.getCell(currentColIndex);
    tllDaysCell.value = 'TLL DAYS';
    tab3Sheet.mergeCells(1, currentColIndex, 2, currentColIndex);

    tab3Rows.forEach(r => {
        tab3Sheet.addRow(r);
    });

    // Formatting 
    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF1DE' } }; 
    const headerDateFont = { bold: true, color: { argb: 'FFFF0000' } }; 
    const standardHeaderFont = { bold: true, color: { argb: 'FF000000' } }; 

    const cellBorder = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
    };
    
    const thickBottomBorder = {
        ...cellBorder,
        bottom: { style: 'thick', color: { argb: 'FF000000' } }
    };

    [attendanceSheet, tab2Sheet, tab3Sheet].forEach(sheet => {
      const isTab3 = sheet.name === 'Check-in - Check-out';
      const startRow = isTab3 ? 2 : 1; 

      if (sheet.rowCount > startRow && sheet.columnCount > 0) {
        sheet.autoFilter = {
             from: { row: startRow, column: 1 },
             to: { row: sheet.rowCount, column: sheet.columnCount }
        };
      }

      sheet.eachRow((row, rowNumber) => {
        const isHeader = isTab3 ? (rowNumber <= 2) : (rowNumber === 1);
        const isTotalRow = sheet.name === 'Attendance' && rowNumber === 2;

        row.eachCell((cell, colNumber) => {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };

          if (isHeader) {
             if (colNumber > baseColumns.length && colNumber < sheet.columnCount) {
                 cell.font = headerDateFont;
             } else {
                 cell.font = standardHeaderFont;
             }
             cell.fill = headerFill as exceljs.Fill;
             cell.border = cellBorder as Partial<exceljs.Borders>;
          } else if (isTotalRow) {
             cell.font = { bold: true };
             cell.border = thickBottomBorder as Partial<exceljs.Borders>;
          } else {
             cell.border = cellBorder as Partial<exceljs.Borders>;
          }
        });
      });
    });

    const executionDateStr = now.format('YYYY_MM_DD');
    const filename = `monthly_report_${executionDateStr}.xlsx`;
    const tempFilePath = path.join(os.tmpdir(), filename);

    await workbook.xlsx.writeFile(tempFilePath);
    this.logger.log(`Monthly report successfully generated at ${tempFilePath}`);

    return tempFilePath;
  }
}
