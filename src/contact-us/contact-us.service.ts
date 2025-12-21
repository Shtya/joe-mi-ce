import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactUs } from '../../entities/contact-us.entity';
import { ContactUsDto } from '../../dto/contact-us.dto';

@Injectable()
export class ContactUsService {
  constructor(
    @InjectRepository(ContactUs)
    private readonly contactRepo: Repository<ContactUs>,
  ) {}

  async create(dto: ContactUsDto, lang: 'ar' | 'en' = 'en') {
    const contact = this.contactRepo.create(dto);
    await this.contactRepo.save(contact);

    return {
      success: true,
      code: 201,
      message: lang === 'ar' ? 'تم إرسال الرسالة بنجاح' : 'Message sent successfully',
    };
  }

  async findAll(lang: 'ar' | 'en' = 'en') {
    const messages = await this.contactRepo.find({
      order: { createdAt: 'DESC' },
    });

    return {
      success: true,
      code: 200,
      message: lang === 'ar' ? 'تم جلب الرسائل بنجاح' : 'Messages fetched successfully',
      data: messages,
    };
  }
}
