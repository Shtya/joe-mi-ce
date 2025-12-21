import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaticPage } from '../../entities/static-page.entity';

@Injectable()
export class StaticPagesService {
  constructor(
    @InjectRepository(StaticPage)
    private readonly staticPageRepo: Repository<StaticPage>,
  ) {}

  /**
   * Get a static page by type
   * @param type page type: privacy-policy, terms-and-conditions, about-us
   * @param lang language code (ar | en)
   */
  async getPage(type: string, lang: 'ar' | 'en' = 'en') {
    const page = await this.staticPageRepo.findOne({ where: { type } });
    if (!page) {
      const message = lang === 'ar' ? 'الصفحة غير موجودة' : 'Page not found';
      throw new NotFoundException(message);
    }

    return {
      code: 200,
      message: lang === 'ar' ? 'نجاح' : 'success',
      data: { id: page.id, url: page.url },
    };
  }

  /**
   * Save or update PDF for a static page
   * @param type page type
   * @param filename uploaded PDF filename
   * @param lang language code (ar | en)
   */
  async savePdf(type: string, filename: string, lang: 'ar' | 'en' = 'en') {
    let page = await this.staticPageRepo.findOne({ where: { type } });

    const url = `/uploads/pdfs/${filename}`; // relative URL

    if (page) {
      page.url = url;
    } else {
      page = this.staticPageRepo.create({ type, url });
    }

    const savedPage = await this.staticPageRepo.save(page);

    return {
      code: 201,
      message: lang === 'ar' ? 'تم رفع الملف بنجاح' : 'PDF uploaded successfully',
      data: { id: savedPage.id, url: savedPage.url },
    };
  }
}
