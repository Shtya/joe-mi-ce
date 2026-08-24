import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { UsersService } from './src/users/users.service';
import * as XLSX from 'xlsx';

async function bootstrap() {
  console.log('Creating application context...');
  const app = await NestFactory.createApplicationContext(AppModule);
  console.log('App context created');
  
  const usersService = app.get(UsersService);
  
  console.log('Reading Excel file...');
  const filePath = 'Book1 (003) (1).xlsx';
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: "",
  });
  
  console.log(`Found ${rows.length} rows`);
  
  console.log('Importing...');
  const result = await usersService.importUsersData(rows);
  console.log('Import result:', result);
  
  await app.close();
  process.exit(0);
}

bootstrap().catch(err => {
  console.error(err);
  process.exit(1);
});
