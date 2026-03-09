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
    this.logger.log('Started generating GATEMEA SIXSEVEN Daily report...');

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

    const reportSheet = workbook.addWorksheet(`SixSeven Report`, {
      views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] // Freeze first column and top 3 rows
    });

    // Premium Styling Tokens
    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } } as const; // Dark Blue
    const subHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } } as const; // Light Blue
    const zebraFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } } as const; // Light Gray
    const whiteFont = { color: { argb: 'FFFFFFFF' }, bold: true } as const;
    const border = {
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
    const chainNames = chains.map(c => c.name).sort();
    if (!chainNames.includes('Roaming')) chainNames.push('Roaming');
    
    // 2. Data Processing - Sales
    const salesMatrix: Record<string, Record<string, number>> = {};
    const productNamesSet = new Set<string>();

    sales.forEach(sale => {
      const productName = sale.product?.name || 'Unknown Product';
      const chainName = sale.branch?.chain?.name || 'Extra';
      
      productNamesSet.add(productName);
      if (!salesMatrix[productName]) salesMatrix[productName] = {};
      if (!salesMatrix[productName][chainName]) salesMatrix[productName][chainName] = 0;
      
      salesMatrix[productName][chainName] += Number(sale.quantity || 0);
    });
    const sortedProductNames = Array.from(productNamesSet).sort();

    // 3. Data Processing - Attendance
    const promoterJourneys = journeys.filter(j => j.user?.role?.name?.toLowerCase() === 'promoter');
    const attendanceData: any[] = [];
    
    promoterJourneys.forEach(j => {
      const isPresent = [
        JourneyStatus.PRESENT, JourneyStatus.CLOSED, 
        JourneyStatus.UNPLANNED_PRESENT, JourneyStatus.UNPLANNED_CLOSED
      ].includes(j.status);
      
      attendanceData.push({
        name: j.user?.name || 'N/A',
        id: j.user?.national_id || 'N/A',
        chain: j.branch?.chain?.name || 'Extra',
        status: isPresent ? 1 : 0
      });
    });

    // 4. Writing Global Header (Row 1)
    const attStartCol = chainNames.length + 5;
    reportSheet.mergeCells(1, 1, 1, attStartCol + 3);
    const mainTitle = reportSheet.getCell(1, 1);
    mainTitle.value = `GATEMEA - SIXSEVEN DAILY PERFORMANCE REPORT (Yesterday: ${dateStr})`;
    mainTitle.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    mainTitle.fill = headerFill;
    mainTitle.alignment = { vertical: 'middle', horizontal: 'center' };

    // 5. Writing Table 1 (Sales)
    reportSheet.getColumn(1).width = 35;
    chainNames.forEach((_, idx) => reportSheet.getColumn(idx + 2).width = 15);
    reportSheet.getColumn(chainNames.length + 2).width = 18;

    const salesTitleRow = reportSheet.getRow(2);
    salesTitleRow.getCell(1).value = 'SALES BY PRODUCT & CHAIN';
    salesTitleRow.getCell(1).font = { bold: true };
    reportSheet.mergeCells(2, 1, 2, chainNames.length + 2);
    salesTitleRow.getCell(1).alignment = { horizontal: 'center' };
    salesTitleRow.getCell(1).fill = subHeaderFill;

    const salesHeadRow = reportSheet.getRow(3);
    salesHeadRow.getCell(1).value = 'Product Name (Row Labels)';
    chainNames.forEach((name, idx) => salesHeadRow.getCell(idx + 2).value = name);
    salesHeadRow.getCell(chainNames.length + 2).value = 'Grand Total';

    let currentRow = 4;
    let totalSalesByChain: Record<string, number> = {};
    chainNames.forEach(c => totalSalesByChain[c] = 0);
    let absoluteGrandTotalSales = 0;

    sortedProductNames.forEach((product, pIdx) => {
      const row = reportSheet.getRow(currentRow);
      row.getCell(1).value = product;
      let rowTotal = 0;
      chainNames.forEach((chain, idx) => {
        const qty = salesMatrix[product][chain] || 0;
        if (qty > 0) row.getCell(idx + 2).value = qty;
        rowTotal += qty;
        totalSalesByChain[chain] += qty;
      });
      row.getCell(chainNames.length + 2).value = rowTotal;
      absoluteGrandTotalSales += rowTotal;

      // Zebra Striping
      if (pIdx % 2 !== 0) {
        row.eachCell((cell, colNum) => {
          if (colNum <= chainNames.length + 2) cell.fill = zebraFill;
        });
      }
      currentRow++;
    });

    // Grand Total Row Sales
    const salesTotalRow = reportSheet.getRow(currentRow);
    salesTotalRow.getCell(1).value = 'GRAND TOTAL';
    chainNames.forEach((chain, idx) => salesTotalRow.getCell(idx + 2).value = totalSalesByChain[chain]);
    salesTotalRow.getCell(chainNames.length + 2).value = absoluteGrandTotalSales;

    // 6. Writing Table 2 (Attendance) - Side-by-Side
    reportSheet.getColumn(attStartCol).width = 25; // Name
    reportSheet.getColumn(attStartCol + 1).width = 20; // National ID
    reportSheet.getColumn(attStartCol + 2).width = 18; // Chain
    reportSheet.getColumn(attStartCol + 3).width = 15; // Status

    const attTitleRow = reportSheet.getRow(2);
    attTitleRow.getCell(attStartCol).value = 'ATTENDANCE DETAILS (PROMOTERS)';
    attTitleRow.getCell(attStartCol).font = { bold: true };
    reportSheet.mergeCells(2, attStartCol, 2, attStartCol + 3);
    attTitleRow.getCell(attStartCol).alignment = { horizontal: 'center' };
    attTitleRow.getCell(attStartCol).fill = subHeaderFill;

    const attHeadRow = reportSheet.getRow(3);
    attHeadRow.getCell(attStartCol).value = 'Promoter Name';
    attHeadRow.getCell(attStartCol + 1).value = 'National ID';
    attHeadRow.getCell(attStartCol + 2).value = 'Chain';
    attHeadRow.getCell(attStartCol + 3).value = 'Status';

    let attInnerRow = 4;
    attendanceData.forEach((row, rIdx) => {
      const excelRow = reportSheet.getRow(attInnerRow);
      excelRow.getCell(attStartCol).value = row.name;
      excelRow.getCell(attStartCol + 1).value = row.id;
      excelRow.getCell(attStartCol + 2).value = row.chain;
      excelRow.getCell(attStartCol + 3).value = row.status;

      // Zebra Striping for Attendance
      if (rIdx % 2 !== 0) {
        for (let i = 0; i <= 3; i++) {
          excelRow.getCell(attStartCol + i).fill = zebraFill;
        }
      }

      // Conditional Formatting (1 = Green, 0 = Red)
      const statusCell = excelRow.getCell(attStartCol + 3);
      if (row.status === 1) {
        statusCell.font = { color: { argb: 'FF006100' }, bold: true }; // Dark Green
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } }; // Light Green
      } else {
        statusCell.font = { color: { argb: 'FF9C0006' }, bold: true }; // Dark Red
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } }; // Light Red
      }

      attInnerRow++;
    });

    // 7. Global Styling Pass
    reportSheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
      row.eachCell({ includeEmpty: false }, (cell, colNum) => {
        cell.border = border;
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        
        // Product Row Labels Alignment
        if (colNum === 1 && rowNum >= 4) {
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        }

        // Sub-Headers (Row 3)
        if (rowNum === 3) {
          cell.font = whiteFont;
          cell.fill = headerFill;
        }

        // Grand Total Row Styling
        if (cell.value === 'GRAND TOTAL') {
          row.eachCell((c, cCol) => {
            if (cCol <= chainNames.length + 2) {
              c.font = whiteFont;
              c.fill = headerFill;
            }
          });
        }
      });
    });

    const executionDateStr = yesterday.format('YYYY_MM_DD');
    const filename = `Gatemea_SixSeven_Daily_${executionDateStr}.xlsx`;
    const tempFilePath = path.join(os.tmpdir(), filename);

    await workbook.xlsx.writeFile(tempFilePath);
    this.logger.log(`Gatemea SixSeven report successfully generated at ${tempFilePath}`);

    return tempFilePath;
  }
}
