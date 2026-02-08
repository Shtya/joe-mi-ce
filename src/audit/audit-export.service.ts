// audit-export.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Audit, DiscountReason } from 'entities/audit.entity';
import * as ExcelJS from 'exceljs';
import * as archiver from 'archiver';
import { Response } from 'express';
import { User } from 'entities/user.entity';

@Injectable()
export class AuditExportService {
  constructor(
    @InjectRepository(Audit) private readonly auditRepo: Repository<Audit>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  // Translation maps
  private readonly countryTranslations: Record<string, { en: string; ar: string }> = {
    // A
    'Afghanistan': { en: 'Afghanistan', ar: 'أفغانستان' },
    'Albania': { en: 'Albania', ar: 'ألبانيا' },
    'Algeria': { en: 'Algeria', ar: 'الجزائر' },
    'Andorra': { en: 'Andorra', ar: 'أندورا' },
    'Angola': { en: 'Angola', ar: 'أنغولا' },
    'Antigua and Barbuda': { en: 'Antigua and Barbuda', ar: 'أنتيغوا وباربودا' },
    'Argentina': { en: 'Argentina', ar: 'الأرجنتين' },
    'Armenia': { en: 'Armenia', ar: 'أرمينيا' },
    'Australia': { en: 'Australia', ar: 'أستراليا' },
    'Austria': { en: 'Austria', ar: 'النمسا' },
    'Azerbaijan': { en: 'Azerbaijan', ar: 'أذربيجان' },

    // B
    'Bahamas': { en: 'Bahamas', ar: 'الباهاما' },
    'Bahrain': { en: 'Bahrain', ar: 'البحرين' },
    'Bangladesh': { en: 'Bangladesh', ar: 'بنغلاديش' },
    'Barbados': { en: 'Barbados', ar: 'باربادوس' },
    'Belarus': { en: 'Belarus', ar: 'بيلاروسيا' },
    'Belgium': { en: 'Belgium', ar: 'بلجيكا' },
    'Belize': { en: 'Belize', ar: 'بليز' },
    'Benin': { en: 'Benin', ar: 'بنين' },
    'Bhutan': { en: 'Bhutan', ar: 'بوتان' },
    'Bolivia': { en: 'Bolivia', ar: 'بوليفيا' },
    'Bosnia and Herzegovina': { en: 'Bosnia and Herzegovina', ar: 'البوسنة والهرسك' },
    'Botswana': { en: 'Botswana', ar: 'بوتسوانا' },
    'Brazil': { en: 'Brazil', ar: 'البرازيل' },
    'Brunei': { en: 'Brunei', ar: 'بروناي' },
    'Bulgaria': { en: 'Bulgaria', ar: 'بلغاريا' },
    'Burkina Faso': { en: 'Burkina Faso', ar: 'بوركينا فاسو' },
    'Burundi': { en: 'Burundi', ar: 'بوروندي' },

    // C
    'Cabo Verde': { en: 'Cabo Verde', ar: 'الرأس الأخضر' },
    'Cambodia': { en: 'Cambodia', ar: 'كمبوديا' },
    'Cameroon': { en: 'Cameroon', ar: 'الكاميرون' },
    'Canada': { en: 'Canada', ar: 'كندا' },
    'Central African Republic': { en: 'Central African Republic', ar: 'جمهورية أفريقيا الوسطى' },
    'Chad': { en: 'Chad', ar: 'تشاد' },
    'Chile': { en: 'Chile', ar: 'تشيلي' },
    'China': { en: 'China', ar: 'الصين' },
    'Colombia': { en: 'Colombia', ar: 'كولومبيا' },
    'Comoros': { en: 'Comoros', ar: 'جزر القمر' },
    'Congo': { en: 'Congo', ar: 'الكونغو' },
    'Costa Rica': { en: 'Costa Rica', ar: 'كوستاريكا' },
    'Croatia': { en: 'Croatia', ar: 'كرواتيا' },
    'Cuba': { en: 'Cuba', ar: 'كوبا' },
    'Cyprus': { en: 'Cyprus', ar: 'قبرص' },
    'Czech Republic': { en: 'Czech Republic', ar: 'جمهورية التشيك' },

    // D
    'Democratic Republic of the Congo': { en: 'Democratic Republic of the Congo', ar: 'جمهورية الكونغو الديمقراطية' },
    'Denmark': { en: 'Denmark', ar: 'الدنمارك' },
    'Djibouti': { en: 'Djibouti', ar: 'جيبوتي' },
    'Dominica': { en: 'Dominica', ar: 'دومينيكا' },
    'Dominican Republic': { en: 'Dominican Republic', ar: 'جمهورية الدومينيكان' },

    // E
    'Ecuador': { en: 'Ecuador', ar: 'الإكوادور' },
    'Egypt': { en: 'Egypt', ar: 'مصر' },
    'El Salvador': { en: 'El Salvador', ar: 'السلفادور' },
    'Equatorial Guinea': { en: 'Equatorial Guinea', ar: 'غينيا الاستوائية' },
    'Eritrea': { en: 'Eritrea', ar: 'إريتريا' },
    'Estonia': { en: 'Estonia', ar: 'إستونيا' },
    'Eswatini': { en: 'Eswatini', ar: 'إسواتيني' },
    'Ethiopia': { en: 'Ethiopia', ar: 'إثيوبيا' },

    // F
    'Fiji': { en: 'Fiji', ar: 'فيجي' },
    'Finland': { en: 'Finland', ar: 'فنلندا' },
    'France': { en: 'France', ar: 'فرنسا' },

    // G
    'Gabon': { en: 'Gabon', ar: 'الغابون' },
    'Gambia': { en: 'Gambia', ar: 'غامبيا' },
    'Georgia': { en: 'Georgia', ar: 'جورجيا' },
    'Germany': { en: 'Germany', ar: 'ألمانيا' },
    'Ghana': { en: 'Ghana', ar: 'غانا' },
    'Greece': { en: 'Greece', ar: 'اليونان' },
    'Grenada': { en: 'Grenada', ar: 'غرينادا' },
    'Guatemala': { en: 'Guatemala', ar: 'غواتيمالا' },
    'Guinea': { en: 'Guinea', ar: 'غينيا' },
    'Guinea-Bissau': { en: 'Guinea-Bissau', ar: 'غينيا بيساو' },
    'Guyana': { en: 'Guyana', ar: 'غيانا' },

    // H
    'Haiti': { en: 'Haiti', ar: 'هايتي' },
    'Honduras': { en: 'Honduras', ar: 'هندوراس' },
    'Hungary': { en: 'Hungary', ar: 'المجر' },

    // I
    'Iceland': { en: 'Iceland', ar: 'آيسلندا' },
    'India': { en: 'India', ar: 'الهند' },
    'Indonesia': { en: 'Indonesia', ar: 'إندونيسيا' },
    'Iran': { en: 'Iran', ar: 'إيران' },
    'Iraq': { en: 'Iraq', ar: 'العراق' },
    'Ireland': { en: 'Ireland', ar: 'أيرلندا' },
    'Israel': { en: 'Israel', ar: 'إسرائيل' },
    'Italy': { en: 'Italy', ar: 'إيطاليا' },

    // J
    'Jamaica': { en: 'Jamaica', ar: 'جامايكا' },
    'Japan': { en: 'Japan', ar: 'اليابان' },
    'Jordan': { en: 'Jordan', ar: 'الأردن' },

    // K
    'Kazakhstan': { en: 'Kazakhstan', ar: 'كازاخستان' },
    'Kenya': { en: 'Kenya', ar: 'كينيا' },
    'Kiribati': { en: 'Kiribati', ar: 'كيريباتي' },
    'Korea, North': { en: 'Korea, North', ar: 'كوريا الشمالية' },
    'Korea, South': { en: 'Korea, South', ar: 'كوريا الجنوبية' },
    'Kosovo': { en: 'Kosovo', ar: 'كوسوفو' },
    'Kuwait': { en: 'Kuwait', ar: 'الكويت' },
    'Kyrgyzstan': { en: 'Kyrgyzstan', ar: 'قيرغيزستان' },

    // L
    'Laos': { en: 'Laos', ar: 'لاوس' },
    'Latvia': { en: 'Latvia', ar: 'لاتفيا' },
    'Lebanon': { en: 'Lebanon', ar: 'لبنان' },
    'Lesotho': { en: 'Lesotho', ar: 'ليسوتو' },
    'Liberia': { en: 'Liberia', ar: 'ليبيريا' },
    'Libya': { en: 'Libya', ar: 'ليبيا' },
    'Liechtenstein': { en: 'Liechtenstein', ar: 'ليختنشتاين' },
    'Lithuania': { en: 'Lithuania', ar: 'ليتوانيا' },
    'Luxembourg': { en: 'Luxembourg', ar: 'لوكسمبورغ' },

    // M
    'Madagascar': { en: 'Madagascar', ar: 'مدغشقر' },
    'Malawi': { en: 'Malawi', ar: 'مالاوي' },
    'Malaysia': { en: 'Malaysia', ar: 'ماليزيا' },
    'Maldives': { en: 'Maldives', ar: 'جزر المالديف' },
    'Mali': { en: 'Mali', ar: 'مالي' },
    'Malta': { en: 'Malta', ar: 'مالطا' },
    'Marshall Islands': { en: 'Marshall Islands', ar: 'جزر مارشال' },
    'Mauritania': { en: 'Mauritania', ar: 'موريتانيا' },
    'Mauritius': { en: 'Mauritius', ar: 'موريشيوس' },
    'Mexico': { en: 'Mexico', ar: 'المكسيك' },
    'Micronesia': { en: 'Micronesia', ar: 'ميكرونيسيا' },
    'Moldova': { en: 'Moldova', ar: 'مولدوفا' },
    'Monaco': { en: 'Monaco', ar: 'موناكو' },
    'Mongolia': { en: 'Mongolia', ar: 'منغوليا' },
    'Montenegro': { en: 'Montenegro', ar: 'الجبل الأسود' },
    'Morocco': { en: 'Morocco', ar: 'المغرب' },
    'Mozambique': { en: 'Mozambique', ar: 'موزمبيق' },
    'Myanmar': { en: 'Myanmar', ar: 'ميانمار' },

    // N
    'Namibia': { en: 'Namibia', ar: 'ناميبيا' },
    'Nauru': { en: 'Nauru', ar: 'ناورو' },
    'Nepal': { en: 'Nepal', ar: 'نيبال' },
    'Netherlands': { en: 'Netherlands', ar: 'هولندا' },
    'New Zealand': { en: 'New Zealand', ar: 'نيوزيلندا' },
    'Nicaragua': { en: 'Nicaragua', ar: 'نيكاراغوا' },
    'Niger': { en: 'Niger', ar: 'النيجر' },
    'Nigeria': { en: 'Nigeria', ar: 'نيجيريا' },
    'North Macedonia': { en: 'North Macedonia', ar: 'مقدونيا الشمالية' },
    'Norway': { en: 'Norway', ar: 'النرويج' },

    // O
    'Oman': { en: 'Oman', ar: 'عُمان' },

    // P
    'Pakistan': { en: 'Pakistan', ar: 'باكستان' },
    'Palau': { en: 'Palau', ar: 'بالاو' },
    'Palestine': { en: 'Palestine', ar: 'فلسطين' },
    'Panama': { en: 'Panama', ar: 'بنما' },
    'Papua New Guinea': { en: 'Papua New Guinea', ar: 'بابوا غينيا الجديدة' },
    'Paraguay': { en: 'Paraguay', ar: 'باراغواي' },
    'Peru': { en: 'Peru', ar: 'بيرو' },
    'Philippines': { en: 'Philippines', ar: 'الفلبين' },
    'Poland': { en: 'Poland', ar: 'بولندا' },
    'Portugal': { en: 'Portugal', ar: 'البرتغال' },

    // Q
    'Qatar': { en: 'Qatar', ar: 'قطر' },

    // R
    'Romania': { en: 'Romania', ar: 'رومانيا' },
    'Russia': { en: 'Russia', ar: 'روسيا' },
    'Rwanda': { en: 'Rwanda', ar: 'رواندا' },

    // S
    'Saint Kitts and Nevis': { en: 'Saint Kitts and Nevis', ar: 'سانت كيتس ونيفيس' },
    'Saint Lucia': { en: 'Saint Lucia', ar: 'سانت لوسيا' },
    'Saint Vincent and the Grenadines': { en: 'Saint Vincent and the Grenadines', ar: 'سانت فينسنت والغرينادين' },
    'Samoa': { en: 'Samoa', ar: 'ساموا' },
    'San Marino': { en: 'San Marino', ar: 'سان مارينو' },
    'Sao Tome and Principe': { en: 'Sao Tome and Principe', ar: 'ساو تومي وبرينسيب' },
    'Saudi Arabia': { en: 'Saudi Arabia', ar: 'المملكة العربية السعودية' },
    'Senegal': { en: 'Senegal', ar: 'السنغال' },
    'Serbia': { en: 'Serbia', ar: 'صربيا' },
    'Seychelles': { en: 'Seychelles', ar: 'سيشل' },
    'Sierra Leone': { en: 'Sierra Leone', ar: 'سيراليون' },
    'Singapore': { en: 'Singapore', ar: 'سنغافورة' },
    'Slovakia': { en: 'Slovakia', ar: 'سلوفاكيا' },
    'Slovenia': { en: 'Slovenia', ar: 'سلوفينيا' },
    'Solomon Islands': { en: 'Solomon Islands', ar: 'جزر سليمان' },
    'Somalia': { en: 'Somalia', ar: 'الصومال' },
    'South Africa': { en: 'South Africa', ar: 'جنوب أفريقيا' },
    'South Sudan': { en: 'South Sudan', ar: 'جنوب السودان' },
    'Spain': { en: 'Spain', ar: 'إسبانيا' },
    'Sri Lanka': { en: 'Sri Lanka', ar: 'سريلانكا' },
    'Sudan': { en: 'Sudan', ar: 'السودان' },
    'Suriname': { en: 'Suriname', ar: 'سورينام' },
    'Sweden': { en: 'Sweden', ar: 'السويد' },
    'Switzerland': { en: 'Switzerland', ar: 'سويسرا' },
    'Syria': { en: 'Syria', ar: 'سوريا' },

    // T
    'Taiwan': { en: 'Taiwan', ar: 'تايوان' },
    'Tajikistan': { en: 'Tajikistan', ar: 'طاجيكستان' },
    'Tanzania': { en: 'Tanzania', ar: 'تنزانيا' },
    'Thailand': { en: 'Thailand', ar: 'تايلاند' },
    'Timor-Leste': { en: 'Timor-Leste', ar: 'تيمور الشرقية' },
    'Togo': { en: 'Togo', ar: 'توغو' },
    'Tonga': { en: 'Tonga', ar: 'تونغا' },
    'Trinidad and Tobago': { en: 'Trinidad and Tobago', ar: 'ترينيداد وتوباغو' },
    'Tunisia': { en: 'Tunisia', ar: 'تونس' },
    'Turkey': { en: 'Turkey', ar: 'تركيا' },
    'Turkmenistan': { en: 'Turkmenistan', ar: 'تركمانستان' },
    'Tuvalu': { en: 'Tuvalu', ar: 'توفالو' },

    // U
    'Uganda': { en: 'Uganda', ar: 'أوغندا' },
    'Ukraine': { en: 'Ukraine', ar: 'أوكرانيا' },
    'United Arab Emirates': { en: 'United Arab Emirates', ar: 'الإمارات العربية المتحدة' },
    'United Kingdom': { en: 'United Kingdom', ar: 'المملكة المتحدة' },
    'United States': { en: 'United States', ar: 'الولايات المتحدة الأمريكية' },
    'Uruguay': { en: 'Uruguay', ar: 'الأوروغواي' },
    'Uzbekistan': { en: 'Uzbekistan', ar: 'أوزبكستان' },

    // V
    'Vanuatu': { en: 'Vanuatu', ar: 'فانواتو' },
    'Vatican City': { en: 'Vatican City', ar: 'الفاتيكان' },
    'Venezuela': { en: 'Venezuela', ar: 'فنزويلا' },
    'Vietnam': { en: 'Vietnam', ar: 'فيتنام' },

    // Y
    'Yemen': { en: 'Yemen', ar: 'اليمن' },

    // Z
    'Zambia': { en: 'Zambia', ar: 'زامبيا' },
    'Zimbabwe': { en: 'Zimbabwe', ar: 'زيمبابوي' },

    // Special
    'local': { en: 'Local', ar: 'محلي' },
  };
  private readonly discountReasonTranslations: Record<DiscountReason, { en: string; ar: string }> = {
    [DiscountReason.NATIONAL_DAY]: { en: 'National Day', ar: 'اليوم الوطني' },
    [DiscountReason.FOUNDING_DAY]: { en: 'Founding Day', ar: 'يوم التأسيس' },
    [DiscountReason.MEGA_SALE]: { en: 'Mega Sale', ar: 'ميجا سيل' },
    [DiscountReason.BLACK_FRIDAY]: { en: 'Black Friday', ar: 'الجمعة السوداء' },
    [DiscountReason.OTHER]: { en: 'Other', ar: 'أخرى' },
  };

  // Translation helper methods
  private translateCountry(country: string | null, language: 'en' | 'ar' = 'en'): string {
    if (!country) return '';
    if (country.toLowerCase() === 'local') {
      return this.countryTranslations.local?.[language] || country;
    }
    return this.countryTranslations[country]?.[language] || country;
  }

  private translateDiscountReason(reason: DiscountReason | string | null, language: 'en' | 'ar' = 'en'): string {
    if (!reason) return '';

    // Handle string values that might match enum
    if (typeof reason === 'string') {
      const enumKey = Object.keys(DiscountReason).find(
        key => DiscountReason[key as keyof typeof DiscountReason] === reason
      );
      if (enumKey) {
        return this.discountReasonTranslations[reason as DiscountReason]?.[language] || reason;
      }
      return reason;
    }

    return this.discountReasonTranslations[reason]?.[language] || reason;
  }

  async exportToExcel(query: any, req: any): Promise<Buffer> {
    // Fetch logged-in user including project
    const user = await this.userRepo.findOne({
      where: { id: req.user.id },
      relations: ['project'],
    });

    if (!user.project?.id && !user.project_id) {
      throw new Error("User does not belong to a project");
    }

    // --- Build Query ---
    const qb = this.auditRepo.createQueryBuilder('audit')
      .leftJoinAndSelect('audit.branch', 'branch')
      .leftJoinAndSelect('branch.city', 'city')
      .leftJoinAndSelect('city.region', 'region')
      .leftJoinAndSelect('branch.project', 'project')
      .leftJoinAndSelect('audit.promoter', 'promoter')
      .leftJoinAndSelect('audit.product', 'product')
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('audit.auditCompetitors', 'auditCompetitors')
      .leftJoinAndSelect('auditCompetitors.competitor', 'competitor');

    // 🔥 ALWAYS FILTER BY USER'S PROJECT
    qb.andWhere('project.id = :pid', { pid: user.project?.id ?? user.project_id });

    // Date filtering
    if (query.from_date && query.to_date) {
      qb.andWhere('audit.audit_date BETWEEN :from AND :to', {
        from: query.from_date,
        to: query.to_date,
      });
    } else if (query.from_date) {
      qb.andWhere('audit.audit_date >= :from', { from: query.from_date });
    } else if (query.to_date) {
      qb.andWhere('audit.audit_date <= :to', { to: query.to_date });
    }

    // Extra filters
    if (query.branch_id) qb.andWhere('branch.id = :branch', { branch: query.branch_id });
    if (query.promoter_id) qb.andWhere('promoter.id = :promoter', { promoter: query.promoter_id });
    if (query.product_id) qb.andWhere('product.id = :product', { product: query.product_id });
    if (query.status) qb.andWhere('audit.status = :status', { status: query.status });
    if (query.is_national !== undefined)
      qb.andWhere('audit.is_national = :nat', { nat: query.is_national });

    if (query.origin) {
      // Handle both English and Arabic origin filtering
      const originQuery = Object.keys(this.countryTranslations).find(
        key => this.countryTranslations[key].en === query.origin ||
               this.countryTranslations[key].ar === query.origin
      ) || query.origin;
      qb.andWhere('audit.origin = :origin', { origin: originQuery });
    }

    // Brand + Category filters
    if (query.brand_id) qb.andWhere('brand.id = :brandId', { brandId: query.brand_id });
    if (query.category_id) qb.andWhere('category.id = :catId', { catId: query.category_id });
    if (query.brand_name)
      qb.andWhere('brand.name ILIKE :bname', { bname: `%${query.brand_name}%` });
    if (query.category_name)
      qb.andWhere('category.name ILIKE :cname', { cname: `%${query.category_name}%` });

    // Sorting
    qb.orderBy('audit.audit_date', 'DESC')
      .addOrderBy('audit.created_at', 'DESC');

    const audits = await qb.getMany();

    // --- Excel ---
    const workbook = new ExcelJS.Workbook();
    this.createEnglishSheet(workbook, audits);
    this.createArabicSheet(workbook, audits);

    const uint = await workbook.xlsx.writeBuffer();
    const nodeBuffer = Buffer.from(uint);
    return nodeBuffer;
  }

  private createEnglishSheet(workbook: ExcelJS.Workbook, audits: Audit[]): void {
    const worksheet = workbook.addWorksheet('Audit Report - English');

    const headers = [
      'Date',
      'Auditor',
      'City',
      'Region',
      'Branch',
      'Product Name',
      'Brand',
      'Category',
      'Available',
      'Price',
      'Discount %',
      'Discount Reason',
      'Discount Details',

      'Total Competitors',
      'Available Competitors',
      ...Array.from({ length: 10 }, (_, i) => [
        `Comp ${i + 1} Name`,
        `Comp ${i + 1} Price`,
        `Comp ${i + 1} Discount %`,
        `Comp ${i + 1} Available`,
        `Comp ${i + 1} National`,
        `Comp ${i + 1} Origin`,
        `Comp ${i + 1} Discount Reason`,
        `Comp ${i + 1} Discount Details`,
      ]).flat(),
    ];

    const headerRow = worksheet.addRow(headers);

    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '2E75B6' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    audits.forEach(audit => {
      const competitors = audit.auditCompetitors || [];
      const totalCompetitors = competitors.length;
      const availableCompetitors = competitors.filter(c => c.is_available).length;

      const compData = [];

      for (let i = 0; i < 10; i++) {
        const c = competitors[i];

        if (c) {
          compData.push(
            c.competitor?.name || '',
            c.price ?? '',
            c.discount ?? '',
            c.is_available ? 'Yes' : 'No',
            this.translateCountry(c.origin, 'en'),
            this.translateDiscountReason(c.discount_reason, 'en'),
            c.discount_details || '',
          );
        } else {
          compData.push('', '', '', '', '', '', '', '');
        }
      }

      const row = [
        audit.audit_date,
        audit.promoter?.name || '',
        audit.branch?.city?.name || '',
        audit.branch?.city?.region?.name || '',
        audit.branch?.name || '',
        audit.product_name || '',
        audit.product_brand || '',
        audit.product_category || '',
        audit.is_available ? 'Yes' : 'No',
        audit.current_price ?? 0,
        audit.current_discount ?? 0,
        this.translateDiscountReason(audit.discount_reason, 'en'),
        audit.discount_details || '',
        totalCompetitors,
        availableCompetitors,
        ...compData,
      ];

      worksheet.addRow(row);
    });

    worksheet.columns.forEach(column => {
      let maxLength = 12;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const length = cell.value ? cell.value.toString().length : 0;
        maxLength = Math.max(maxLength, length);
      });
      column.width = maxLength + 2;
    });
  }

  private createArabicSheet(workbook: ExcelJS.Workbook, audits: Audit[]): void {
    const worksheet = workbook.addWorksheet('تقرير المراجعة - عربي');

    const headers = [
      'التاريخ',
      'المدقق',
      'المدينة',
      'المنطقة',
      'الفرع',
      'اسم المنتج',
      'العلامة التجارية',
      'الفئة',
      'متوفر؟',
      'السعر',
      'نسبة الخصم',
      'سبب الخصم',
      'تفاصيل الخصم',

      'عدد المنافسين',
      'عدد المتوفرين',
      ...Array.from({ length: 10 }, (_, i) => [
        `اسم المنافس ${i + 1}`,
        `سعر المنافس ${i + 1}`,
        `خصم المنافس ${i + 1}%`,
        `متوفر ${i + 1}?`,
        `محلي ${i + 1}?`,
        `المصدر ${i + 1}`,
        `سبب الخصم ${i + 1}`,
        `تفاصيل الخصم ${i + 1}`,
      ]).flat(),
    ];

    const headerRow = worksheet.addRow(headers);

    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' }, name: 'Arial' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '2E75B6' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' };
    });

    audits.forEach(audit => {
      const competitors = audit.auditCompetitors || [];
      const totalCompetitors = competitors.length;
      const availableCompetitors = competitors.filter(c => c.is_available).length;

      const compData = [];

      for (let i = 0; i < 10; i++) {
        const c = competitors[i];

        if (c) {
          compData.push(
            c.competitor?.name || '',
            c.price ?? '',
            c.discount ?? '',
            c.is_available ? 'نعم' : 'لا',
            this.translateCountry(c.origin, 'ar'),
            this.translateDiscountReason(c.discount_reason, 'ar'),
            c.discount_details || '',
          );
        } else {
          compData.push('', '', '', '', '', '', '', '');
        }
      }

      const row = [
        audit.audit_date,
        audit.promoter?.name || '',
        audit.branch?.city?.name || '',
        audit.branch?.city?.region?.name || '',
        audit.branch?.name || '',
        audit.product_name || '',
        audit.product_brand || '',
        audit.product_category || '',
        audit.is_available ? 'نعم' : 'لا',
        audit.current_price ?? 0,
        audit.current_discount ?? 0,
        this.translateDiscountReason(audit.discount_reason, 'ar'),
        audit.discount_details || '',
        totalCompetitors,
        availableCompetitors,
        ...compData,
      ];

      const rowObj = worksheet.addRow(row);

      rowObj.eachCell(cell => {
        cell.alignment = { horizontal: 'right', readingOrder: 'rtl' };
      });
    });

    worksheet.columns.forEach(column => {
      let maxLength = 12;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const length = cell.value ? cell.value.toString().length : 0;
        maxLength = Math.max(maxLength, length);
      });
      column.width = maxLength + 2;
    });
  }

  // New methods to get translations for endpoints
  getTranslatedCountries(): Array<{ value: string; label_en: string; label_ar: string }> {
    const countries = Object.entries(this.countryTranslations).map(([key, translation]) => ({
      value: key === 'local' ? 'local' : key,
      label_en: translation.en,
      label_ar: translation.ar,
    }));

    // Sort alphabetically by English name
    return countries.sort((a, b) => a.label_en.localeCompare(b.label_en));
  }

  getTranslatedDiscountReasons(): Array<{ value: DiscountReason; label_en: string; label_ar: string }> {
    return Object.entries(this.discountReasonTranslations).map(([key, translation]) => ({
      value: key as DiscountReason,
      label_en: translation.en,
      label_ar: translation.ar,
    }));
  }
}