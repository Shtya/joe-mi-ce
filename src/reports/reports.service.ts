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
      { header: 'City', key: 'city', width: 15 },
      { header: 'Channel', key: 'channel', width: 15 },
      { header: 'Store', key: 'store', width: 20 },
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
        id:user.national_id,
        city: effectiveBranch?.city?.name || 'N/A',
        channel: effectiveBranch?.chain?.name || 'N/A',
        store: effectiveBranch?.name || 'N/A',
      };

      const attRow = { ...baseRowData };
      const t2Row = { ...baseRowData };
      const t3RowArr = [
         baseRowData.joe_user_1, baseRowData.no, baseRowData.name, 
         baseRowData.id, baseRowData.city, baseRowData.channel, baseRowData.store
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

        const dayJourneys = userJourneys.filter(j => j.date === currentDateStr);
        
        if (dayJourneys.length > 0) {
            const hasPresent = dayJourneys.some(j => [JourneyStatus.PRESENT, JourneyStatus.CLOSED, JourneyStatus.UNPLANNED_PRESENT, JourneyStatus.UNPLANNED_CLOSED].includes(j.status as any));
            const hasAbsent = dayJourneys.some(j => [JourneyStatus.ABSENT, JourneyStatus.UNPLANNED_ABSENT].includes(j.status as any));

            if (hasPresent) {
                attRow[dayKey] = 1;
                dailyAttendanceTotals[dayKey] += 1;
                ttlAttendance += 1;
                ttlDays += 1;
            } else if (hasAbsent) {
                attRow[dayKey] = 0;
            } else {
                attRow[dayKey] = ''; 
            }
        } else {
            attRow[dayKey] = '';
        }

        if (dayJourneys.length > 0) {
            const inTimes = dayJourneys.map(j => j.checkin?.checkInTime ? dayjs(j.checkin.checkInTime).format('HH:mm') : '').filter(Boolean);
            const outTimes = dayJourneys.map(j => j.checkin?.checkOutTime ? dayjs(j.checkin.checkOutTime).format('HH:mm') : '').filter(Boolean);
            
            t3RowArr.push(inTimes.length > 0 ? inTimes.join(' , ') : '--:--');
            t3RowArr.push(outTimes.length > 0 ? outTimes.join(' , ') : '--:--');
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

    const totalsRowData: Record<string, any> = { joe_user_1: 'Total', name: 'Total' }; 
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
      const isAttendance = sheet.name === 'Attendance';
      const startRow = isTab3 ? 2 : 1; 

      if (sheet.rowCount > startRow && sheet.columnCount > 0) {
        sheet.autoFilter = {
             from: { row: startRow, column: 1 },
             to: { row: sheet.rowCount, column: sheet.columnCount }
        };
      }

      // Freeze headers (and totals row for Attendance)
      sheet.views = [
        { state: 'frozen', xSplit: 0, ySplit: isAttendance ? 2 : startRow }
      ];

      sheet.eachRow((row, rowNumber) => {
        const isHeader = isTab3 ? (rowNumber <= 2) : (rowNumber === 1);
        const isTotalRow = isAttendance && rowNumber === 2;

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

  async generateGatemeaReport(): Promise<string> {
    this.logger.log('Started generating GATEMEA Daily report...');

    const projectName = 'gatemea';
    const project = await this.projectRepository.findOne({ 
      where: { name: projectName },
      relations: ['chains']
    });
    const projectId = project?.id;

    if (!projectId) {
      this.logger.warn(`Project "${projectName}" not found. Gatemea report cannot be generated.`);
      return null;
    }

    const now = dayjs();
    const yesterday = now.subtract(1, 'day');
    const dateStr = yesterday.format('YYYY-MM-DD');

    const workbook = new exceljs.Workbook();
    workbook.creator = 'System SixSeven';

    const reportSheet = workbook.addWorksheet(`SixSeven Report`);

    // Pivot Table Styling Tokens
    const headerPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } } as const;
    const borderObj = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    } as const;

    // 1. Fetch Sales & Journeys for Yesterday
    const sales = await this.saleRepository.find({
      where: {
        sale_date: Between(yesterday.startOf('day').toDate(), yesterday.endOf('day').toDate()),
        projectId: projectId
      },
      relations: ['product', 'branch', 'branch.chain'],
    });

    const journeys = await this.journeyRepository.find({
      where: {
        date: dateStr,
        projectId: projectId
      },
      relations: ['user', 'user.role', 'branch', 'branch.chain'],
    });

    const chains = project.chains || [];
    const chainNames = chains.map(c => c.name?.trim()).filter(Boolean).sort();
    if (!chainNames.includes('Roaming')) chainNames.push('Roaming');
    
    // 2. Data Processing - Sales
    const salesMatrix: Record<string, Record<string, number>> = {};
    const productNamesSet = new Set<string>();

    sales.forEach(sale => {
      const productName = sale.product?.name?.trim() || 'Unknown Product';
      const chainName = sale.branch?.chain?.name?.trim() || 'Extra';
      
      productNamesSet.add(productName);
      if (!salesMatrix[productName]) salesMatrix[productName] = {};
      if (!salesMatrix[productName][chainName]) salesMatrix[productName][chainName] = 0;
      
      salesMatrix[productName][chainName] += Number(sale.quantity || 0);
    });
    const sortedProductNames = Array.from(productNamesSet).sort();

    // 3. Data Processing - Attendance
    const promoterJourneys = journeys.filter(j => {
      const roleName = j.user?.role?.name?.toLowerCase() || '';
      return roleName.includes('promoter');
    });
    const attendanceMap: Record<string, Set<string>> = {}; 
    
    promoterJourneys.forEach(j => {
      const isPresent = [
        JourneyStatus.PRESENT, JourneyStatus.CLOSED, 
        JourneyStatus.UNPLANNED_PRESENT, JourneyStatus.UNPLANNED_CLOSED
      ].includes(j.status);
      
      if (isPresent) {
        const chainName = j.branch?.chain?.name?.trim() || 'Extra';
        const key = j.user?.id || j.id; // Unique identifier per user in chain today
        if (!attendanceMap[chainName]) attendanceMap[chainName] = new Set();
        attendanceMap[chainName].add(key);
      }
    });

    // 4. Writing Table 1 (Sales)
    reportSheet.getColumn(1).width = 30;
    chainNames.forEach((_, idx) => reportSheet.getColumn(idx + 2).width = 12);
    reportSheet.getColumn(chainNames.length + 2).width = 15;

    // Header A1 and B1
    reportSheet.getCell(1, 1).value = 'Sum of Quantity';
    reportSheet.getCell(1, 2).value = 'Column Labels';
    reportSheet.getCell(1, 1).font = { bold: true };
    reportSheet.getCell(1, 2).font = { bold: true };
    reportSheet.getCell(1, 1).fill = headerPattern;
    reportSheet.getCell(1, 2).fill = headerPattern;
    reportSheet.getCell(1, 1).border = borderObj;
    reportSheet.getCell(1, 2).border = borderObj;
    reportSheet.getCell(1, 1).alignment = { horizontal: 'center' };
    reportSheet.getCell(1, 2).alignment = { horizontal: 'center' };

    const salesHeadRow = reportSheet.getRow(2);
    salesHeadRow.getCell(1).value = 'Row Labels';
    chainNames.forEach((name, idx) => salesHeadRow.getCell(idx + 2).value = name);
    salesHeadRow.getCell(chainNames.length + 2).value = 'Grand Total';

    let currentRow = 3;
    let totalSalesByChain: Record<string, number> = {};
    chainNames.forEach(c => totalSalesByChain[c] = 0);
    let absoluteGrandTotalSales = 0;

    sortedProductNames.forEach((product) => {
      const row = reportSheet.getRow(currentRow);
      row.getCell(1).value = product;
      let rowTotal = 0;
      chainNames.forEach((chain, idx) => {
        const qty = salesMatrix[product][chain] || 0;
        if (qty > 0) {
          row.getCell(idx + 2).value = qty;
        }
        rowTotal += qty;
        totalSalesByChain[chain] += qty;
      });
      row.getCell(chainNames.length + 2).value = rowTotal;
      absoluteGrandTotalSales += rowTotal;
      currentRow++;
    });

    // Grand Total Row Sales
    const salesTotalRow = reportSheet.getRow(currentRow);
    salesTotalRow.getCell(1).value = 'Grand Total';
    chainNames.forEach((chain, idx) => salesTotalRow.getCell(idx + 2).value = totalSalesByChain[chain]);
    salesTotalRow.getCell(chainNames.length + 2).value = absoluteGrandTotalSales;

    // 5. Writing Table 2 (Attendance)
    const attStartCol = chainNames.length + 4; // leave blank column
    reportSheet.getColumn(attStartCol).width = 15;
    reportSheet.getColumn(attStartCol + 1).width = 20;

    const attHeadRow = reportSheet.getRow(2);
    attHeadRow.getCell(attStartCol).value = 'Row Labels';
    attHeadRow.getCell(attStartCol + 1).value = 'Sum of Status Code';

    let attInnerRow = 3;
    let totalAtt = 0;
    chainNames.forEach(chain => {
      const count = attendanceMap[chain]?.size || 0;
      const excelRow = reportSheet.getRow(attInnerRow);
      excelRow.getCell(attStartCol).value = chain;
      excelRow.getCell(attStartCol + 1).value = count;
      totalAtt += count;
      attInnerRow++;
    });

    const attTotalRow = reportSheet.getRow(attInnerRow);
    attTotalRow.getCell(attStartCol).value = 'Grand Total';
    attTotalRow.getCell(attStartCol + 1).value = totalAtt;

    // 6. Final Styling Application
    // Apply styling to Table 1 Data area
    for(let r = 2; r <= currentRow; r++) {
       const row = reportSheet.getRow(r);
       for(let c = 1; c <= chainNames.length + 2; c++) {
           const cell = row.getCell(c);
           if (cell.value !== null && cell.value !== undefined) {
               cell.border = borderObj;
               cell.alignment = { horizontal: 'center' };
           } else if (c > 1) { // Apply border to blank cells in table
               cell.border = borderObj; 
           }
           
           if (r === 2 || r === currentRow) {
               cell.font = { bold: true };
               cell.fill = headerPattern;
               cell.border = borderObj;
           }
       }
    }

    // Apply styling to Table 2 Data area
    for(let r = 2; r <= attInnerRow; r++) {
        const row = reportSheet.getRow(r);
        for(let c = attStartCol; c <= attStartCol + 1; c++) {
           const cell = row.getCell(c);
           cell.border = borderObj;
           cell.alignment = { horizontal: 'center' };
           if (r === 2 || r === attInnerRow) {
               cell.font = { bold: true };
               cell.fill = headerPattern;
           }
        }
    }

    const executionDateStr = yesterday.format('YYYY_MM_DD');
    const filename = `gatemea_report_6_7_${executionDateStr}.xlsx`;
    const tempFilePath = path.join(os.tmpdir(), filename);

    await workbook.xlsx.writeFile(tempFilePath);
    this.logger.log(`Gatemea SixSeven report successfully generated at ${tempFilePath}`);

    return tempFilePath;
  }
}
