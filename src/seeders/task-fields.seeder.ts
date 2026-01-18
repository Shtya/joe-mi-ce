import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import { TaskField } from '../../entities/documentbuilder.entity';

export const seedTaskFields = async (dataSource: DataSource) => {
  const fieldRepository = dataSource.getRepository(TaskField);

  console.log('🚀 Seeding task fields...');

  await fieldRepository.delete({}); // safe: config table only

  const fields: Partial<TaskField>[] = [
    // Company
    { name: 'company_name_ar', label: 'اسم الشركة (عربي)', type: 'text' },
    { name: 'company_name_en', label: 'اسم الشركة (إنجليزي)', type: 'text' },
    { name: 'company_logo', label: 'شعار الشركة', type: 'file' },
    { name: 'vat_number', label: 'الرقم الضريبي', type: 'text' },
    { name: 'commercial_registration', label: 'السجل التجاري', type: 'text' },

    // Recipient
    { name: 'recipient_name', label: 'الجهة المرسل إليها', type: 'text' },

    // Letter text
    { name: 'greeting_text', label: 'نص التحية', type: 'textarea' },
    { name: 'body_text', label: 'نص الخطاب', type: 'textarea' },
    { name: 'closing_text', label: 'نص الخاتمة', type: 'textarea' },

    // Employee
    { name: 'employee_full_name', label: 'اسم الموظف', type: 'text' },
    { name: 'employee_identity_number', label: 'رقم الهوية / الإقامة', type: 'text' },
    { name: 'employee_nationality', label: 'الجنسية', type: 'select' },
    { name: 'job_title', label: 'المسمى الوظيفي', type: 'text' },
    { name: 'work_location', label: 'اسم المعرض / موقع العمل', type: 'text' },

    // Contract
    { name: 'client_company', label: 'الشركة المستفيدة', type: 'text' },
    { name: 'contract_type', label: 'نوع / مرجع العقد', type: 'text' },

    // Meta
    { name: 'letter_date', label: 'تاريخ الخطاب', type: 'date' },
    { name: 'letter_reference', label: 'رقم الخطاب', type: 'text' },

    // Footer
    { name: 'company_address', label: 'عنوان الشركة', type: 'textarea' },
    { name: 'company_phone', label: 'رقم الهاتف', type: 'text' },
    { name: 'company_website', label: 'الموقع الإلكتروني', type: 'text' },
    { name: 'company_location', label: 'موقع الشركة', type: 'text' },
    { name: 'company_stamp', label: 'ختم الشركة', type: 'file' },
  ];

  await fieldRepository.save(fields);

  console.log(`✅ Seeded ${fields.length} task fields`);
};

/**
 * 🟢 Allow running this file directly
 */
if (require.main === module) {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
    synchronize: true, // only for dev
  });

  dataSource
    .initialize()
    .then(async () => {
      await seedTaskFields(dataSource);
      await dataSource.destroy();
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Task fields seeding failed:', err);
      process.exit(1);
    });
}
