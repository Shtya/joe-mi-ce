import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateProductDto, ImportProductRowDto, ImportProductsDto, StockDto, UpdateProductDto } from 'dto/product.dto';
import { Branch } from 'entities/branch.entity';
import { Brand } from 'entities/products/brand.entity';
import { Category } from 'entities/products/category.entity';
import { Product } from 'entities/products/product.entity';
import { Project } from 'entities/project.entity';
import { Stock } from 'entities/products/stock.entity';
import { Brackets, ILike, In, Repository } from 'typeorm';
import { ProductFilterQueryDto } from 'dto/product-filters.dto';
import { CRUD } from 'common/crud.service';
import { PaginationQueryDto } from 'dto/pagination.dto';
import * as ExcelJS from 'exceljs';
import { User } from 'entities/user.entity';
import { UsersService } from 'src/users/users.service';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
@Injectable()
export class ProductService {
    private readonly uploadPath = './uploads/products';

  constructor(
    @InjectRepository(Product)
    public productRepository: Repository<Product>,
    @InjectRepository(User)
    public userRepository: Repository<User>,
    @InjectRepository(Project)
    public projectRepository: Repository<Project>,
    @InjectRepository(Brand)
    public brandRepository: Repository<Brand>,
    @InjectRepository(Category)
    public categoryRepository: Repository<Category>,
    @InjectRepository(Stock)
    private stockRepository: Repository<Stock>,
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
        public readonly userService: UsersService, // inject userService

  ) {
        this.ensureUploadDirectory();

  }
  private async projectWhere(user: any, extra: any = {}) {
    const projectId = await this.userService.resolveProjectIdFromUser(user.id);
    return { project: { id: projectId }, ...extra };
  }

  async create(dto: CreateProductDto): Promise<Product> {
    // Validate stock before processing
    if (dto.stock?.length) {
      for (const stockItem of dto.stock) {
        if (!stockItem.all_branches && !stockItem.branch_id) {
          throw new BadRequestException('branch_id is required when all_branches is false');
        }
      }
    }

    const [brand, category, project] = await Promise.all([
      dto.brand_id ? this.brandRepository.findOne({
        where: { id: dto.brand_id }
      }) : Promise.resolve(undefined),
      this.categoryRepository.findOne({
        where: { id: dto.category_id }
      }),
      this.projectRepository.findOne({
        where: { id: dto.project_id },
        relations: ['branches']
      })
    ]);

    // Validations
    if (dto.brand_id && !brand) {
      throw new NotFoundException(`Brand with ID ${dto.brand_id} not found`);
    }
    if (!category) {
      throw new NotFoundException(`Category with ID ${dto.category_id} not found`);
    }
    if (!project) {
      throw new NotFoundException(`Project with ID ${dto.project_id} not found`);
    }

    // Check for existing product name in this project
    const existingProduct = await this.productRepository.findOne({
      where: {
        name: dto.name,
        project: { id: project.id },
      },
    });

    if (existingProduct) {
      throw new ConflictException(
        `Product name "${dto.name}" already exists in this project`
      );
    }

    // Create product
    const product = this.productRepository.create({
      ...dto,
      brand,
      category,
      project,
    });

    const savedProduct = await this.productRepository.save(product);

    // Handle Stock Assignment
    await this.assignStockToBranches(savedProduct, project, dto.stock || []);

    // Return product with relations if needed
    return this.productRepository.findOne({
      where: { id: savedProduct.id },
      relations: ['brand', 'category', 'project', 'stock', 'stock.branch']
    });
  }

  private async assignStockToBranches(
    product: Product,
    project: Project,
    stockItems: StockDto[]
  ): Promise<void> {
    if (!stockItems.length) return;

    const stockToInsert: Partial<Stock>[] = [];

    for (const stockItem of stockItems) {
      if (stockItem.all_branches) {
        // Assign to all branches in the project
        if (!project.branches?.length) {
          throw new BadRequestException(
            'Project has no branches to assign stock to'
          );
        }

        for (const branch of project.branches) {
          stockToInsert.push({
            branch,
            product,
            quantity: stockItem.quantity,
          });
        }
      } else {
        // Assign to specific branch
        if (!stockItem.branch_id) {
          throw new BadRequestException(
            'branch_id is required unless all_branches is true'
          );
        }

        const branch = await this.branchRepository.findOne({
          where: { id: stockItem.branch_id, project: { id: project.id } },
        });

        if (!branch) {
          throw new NotFoundException(
            `Branch with ID ${stockItem.branch_id} not found in this project`
          );
        }

        stockToInsert.push({
          branch,
          product,
          quantity: stockItem.quantity,
        });
      }
    }

    // Bulk insert all stock records
    if (stockToInsert.length > 0) {
      // Remove old stock for these branches
      const branchIds = stockToInsert.map(s => s.branch.id);
      await this.stockRepository.delete({ product: { id: product.id }, branch: { id: In(branchIds) } });
      // Insert new stock
      await this.stockRepository.save(stockToInsert);
    }
  }

  async findOne(id: string, user: any) {
    const where = await this.projectWhere(user, { id });
    const product = await this.productRepository.findOne({
      where,
      relations: ['brand', 'category', 'stock', 'project'],
    });

    if (!product) throw new NotFoundException('Product not found');
    return product;
  }
  async update(id: string, dto: UpdateProductDto, user: any): Promise<Product> {
    const product = await this.findOne(id, user);

    if (dto.brand_id) {
      const brand = await this.brandRepository.findOne({ where: { id: dto.brand_id } });
      if (!brand) throw new NotFoundException(`Brand not found in your project`);
      product.brand = brand;
    }

    if (dto.category_id) {
      const category = await this.categoryRepository.findOne({ where: { id: dto.category_id, project: product.project } });
      if (!category) throw new NotFoundException(`Category not found in your project`);
      product.category = category;
    }

    if (dto.name && dto.name !== product.name) {
      const exists = await this.productRepository.findOne({
        where: { name: dto.name, project: { id: product.project.id } },
      });
      if (exists && exists.id !== product.id)
        throw new ConflictException(`Another product with name "${dto.name}" exists in your project`);
    }

    this.productRepository.merge(product, dto);
    return this.productRepository.save(product);
  }
  async remove(id: string, user: any): Promise<void> {
    const product = await this.findOne(id, user);
    await this.productRepository.remove(product);
  }
  async findAllForMobile(query: PaginationQueryDto, categoryId: string, brandId: string, user: any) {
    const { search, sortBy = 'name', sortOrder = 'ASC' } = query;
    const where = await this.projectWhere(user, {});

    if (categoryId) where.category = { id: categoryId };
    if (brandId) where.brand = { id: brandId };
    if (search) where.name = ILike(`%${search}%`);

    const products = await this.productRepository.find({
      where,
      select: ['id', 'name', 'price', 'image_url'],
      order: { [sortBy]: sortOrder },
    });

    return { success: true, data: products };
  }

  async generateImportTemplate(projectId: string): Promise<Buffer> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: ['branches'],
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${projectId} not found`);
    }

    const availableBranches = project.branches?.map(b => b.name) || [];
    const branchExample = availableBranches.length > 0
      ? availableBranches.slice(0, 3).join(', ')
      : 'Main Branch, Branch 2, Branch 3';

    const sampleProducts = [
      {
        name: 'iPhone 15 Pro',
        description: 'Latest iPhone model',
        price: 999.99,
        discount: 0,
        model: 'IP15P-256',
        sku: 'APP-IP15P-256',
        image_url: 'https://example.com/iphone.jpg',
        is_high_priority: 'true',
        category_name: 'Smartphones',
        brand_name: 'Apple',
        quantity: 100,
        all_branches: 'true',
        branches: ''
      },
      {
        name: 'Galaxy S24',
        description: 'Samsung flagship phone',
        price: 899.99,
        discount: 10,
        model: 'GS24-256',
        sku: 'SAM-GS24-256',
        image_url: 'https://example.com/galaxy.jpg',
        is_high_priority: 'false',
        category_name: 'Smartphones',
        brand_name: 'Samsung',
        quantity: 50,
        all_branches: 'false',
        branches: branchExample
      },
      {
        name: 'Wireless Earbuds',
        description: 'Noise cancelling',
        price: 199.99,
        discount: 15,
        model: 'WB-NC',
        sku: 'SON-WB-NC',
        image_url: 'https://example.com/earbuds.jpg',
        is_high_priority: 'true',
        category_name: 'Audio',
        brand_name: 'Sony',
        quantity: 30,
        all_branches: 'false',
        branches: availableBranches[0] || 'Main Branch'
      }
    ];

    const columns = [
      { key: 'name', header: 'name' },
      { key: 'description', header: 'description' },
      { key: 'price', header: 'price' },
      { key: 'discount', header: 'discount' },
      { key: 'model', header: 'model' },
      { key: 'sku', header: 'sku' },
      { key: 'image_url', header: 'image_url' },
      { key: 'is_high_priority', header: 'is_high_priority' },
      { key: 'category_name', header: 'category_name' },
      { key: 'brand_name', header: 'brand_name' },
      { key: 'quantity', header: 'quantity' },
      { key: 'all_branches', header: 'all_branches' },
      { key: 'branches', header: 'branches' },
    ];

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Import Template');

    // ✅ Define columns BEFORE adding rows
    sheet.columns = columns;

    // Insert data rows
    sampleProducts.forEach(prod => sheet.addRow(prod));

    // Apply numeric formats (now works because columns exist)
    sheet.getColumn('price').numFmt = '#,##0.00';
    sheet.getColumn('discount').numFmt = '#,##0.00';
    sheet.getColumn('quantity').numFmt = '0';

    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Import products from CSV/Excel
   */
  async importProducts(
    dto: ImportProductsDto,
    user: any
  ): Promise<{ success: number; failed: number; errors: string[]; imagesDownloaded: number }> {
    const projectId = await this.userService.resolveProjectIdFromUser(user.id);
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: ['branches']
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${projectId} not found`);
    }

    const results = {
      success: 0,
      failed: 0,
      imagesDownloaded: 0,
      errors: [] as string[]
    };

    // Process products one by one
    for (let i = 0; i < dto.products.length; i++) {
      try {
        await this.processImportRowWithImage(dto.products[i], project);
        results.success++;

        // Count images downloaded
        if (dto.products[i].image_url && dto.products[i].image_url.trim() !== '') {
          results.imagesDownloaded++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    return results;
  }

    async cleanupUnusedImages(daysOld: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    // Find products created before cutoff date
    const oldProducts = await this.productRepository.find({
      where: {
        created_at: new Date(cutoffDate),
      },
      select: ['id', 'image_url']
    });

    // Get all image files in upload directory
    const files = await fs.promises.readdir(this.uploadPath);

    // Find unused images
    const usedImages = oldProducts
      .map(p => p.image_url)
      .filter(url => url && url.includes('/uploads/products/'))
      .map(url => path.basename(url));

    for (const file of files) {
      if (!usedImages.includes(file)) {
        const filePath = path.join(this.uploadPath, file);
        try {
          await fs.promises.unlink(filePath);
          console.log(`Cleaned up unused image: ${file}`);
        } catch (error) {
          console.error(`Failed to delete ${file}:`, error);
        }
      }
    }
  }
  /**
   * Process a single import row
   */
  // private async processImportRow(productData: ImportProductRowDto, project: Project): Promise<void> {
  //   // Find or create category
  //   let category = await this.categoryRepository.findOne({
  //     where: {
  //       name: ILike(productData.category_name),

  //     }
  //   });

  //   if (!category) {
  //     throw new NotFoundException(`Category "${productData.category_name}" not found in this project`);
  //   }

  //   // Find or create brand (if provided)
  //   let brand: Brand | undefined;
  //   if (productData.brand_name) {
  //     brand = await this.brandRepository.findOne({
  //       where: {
  //         name: ILike(productData.brand_name),

  //       }
  //     });

  //     if (!brand) {
  //       throw new NotFoundException(`Brand "${productData.brand_name}" not found in this project`);
  //     }
  //   }

  //   // Check for existing product with same name in this project
  //   const existingProduct = await this.productRepository.findOne({
  //     where: {
  //       name: productData.name,
  //       project: { id: project.id }
  //     }
  //   });

  //   if (existingProduct) {
  //     throw new ConflictException(`Product "${productData.name}" already exists in this project`);
  //   }

  //   // Create product
  //   const product = this.productRepository.create({
  //     name: productData.name,
  //     description: productData.description,
  //     price: productData.price,
  //     discount: productData.discount || 0,
  //     model: productData.model,
  //     sku: productData.sku,
  //     image_url: productData.image_url,
  //     is_high_priority: productData.is_high_priority || false,
  //     is_active: true,
  //     project,
  //     category,
  //     brand
  //   });

  //   const savedProduct = await this.productRepository.save(product);

  //   // Handle stock assignment
  //   await this.assignStock(savedProduct, project, productData);
  // }

  /**
   * Assign stock to branches
   */
private async assignStock(product: Product, project: Project, productData: any) {
  const quantity = parseInt(productData.quantity || '0');
  if (quantity <= 0) return;

  const stockToInsert: Partial<Stock>[] = [];
  const availableBranches = project.branches || [];

  if (productData.all_branches || ['true','1','yes'].includes((productData.all_branches+'').toLowerCase())) {
    // All branches
    for (const branch of availableBranches) {
      stockToInsert.push({ branch, product, quantity });
    }
  } else if (productData.branches) {
    const branchNames = productData.branches
      .split(',')
      .map((n: string) => n.trim())
      .filter((n: string) => n.length > 0);

    for (const branchName of branchNames) {
      const branch = availableBranches.find(
        b => b.name.toLowerCase() === branchName.toLowerCase()
      );
      if (!branch) throw new NotFoundException(`Branch "${branchName}" not found`);
      stockToInsert.push({ branch, product, quantity });
    }
  }

  if (stockToInsert.length > 0) {
    // Remove old stock for this product in these branches
    const branchIds = stockToInsert.map(s => s.branch.id);
    await this.stockRepository.delete({ product: { id: product.id }, branch: { id: In(branchIds) } });

    // Insert new stock
    await this.stockRepository.save(stockToInsert);
  }
}

  /**
   * Export products to Excel
   */
  async exportProducts(projectId: string, filters?: any): Promise<Buffer> {
    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.brand', 'brand')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.stock', 'stock')
      .leftJoinAndSelect('stock.branch', 'branch')
      .where('product.project_id = :projectId', { projectId });

    // Apply filters if provided
    if (filters) {
      if (filters.category_id) {
        queryBuilder.andWhere('product.category_id = :categoryId', {
          categoryId: filters.category_id
        });
      }
      if (filters.brand_id) {
        queryBuilder.andWhere('product.brand_id = :brandId', {
          brandId: filters.brand_id
        });
      }
      if (filters.search) {
        queryBuilder.andWhere(
          '(product.name ILIKE :search OR product.sku ILIKE :search OR product.model ILIKE :search)',
          { search: `%${filters.search}%` }
        );
      }
    }

    const products = await queryBuilder.getMany();

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products');

    // Define columns
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 36 },
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Price', key: 'price', width: 15 },
      { header: 'Discount %', key: 'discount', width: 12 },
      { header: 'Model', key: 'model', width: 20 },
      { header: 'SKU', key: 'sku', width: 20 },
      { header: 'Brand', key: 'brand', width: 20 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Total Stock', key: 'total_stock', width: 15 },
      { header: 'Active', key: 'is_active', width: 10 },
      { header: 'High Priority', key: 'is_high_priority', width: 15 },
      { header: 'Created At', key: 'created_at', width: 20 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data rows
    products.forEach(product => {
      const totalStock = product.stock?.reduce((sum, s) => sum + s.quantity, 0) || 0;

      worksheet.addRow({
        id: product.id,
        name: product.name,
        description: product.description || '',
        price: product.price,
        discount: product.discount,
        model: product.model || '',
        sku: product.sku || '',
        brand: product.brand?.name || '',
        category: product.category?.name,
        total_stock: totalStock,
        is_active: product.is_active ? 'Yes' : 'No',
        is_high_priority: product.is_high_priority ? 'Yes' : 'No',
        created_at: product.created_at.toISOString().split('T')[0]
      });
    });

    // Format currency cells
    worksheet.getColumn('price').numFmt = '#,##0.00';

    // Write to buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
private async findOrCreateCategory(
  name: string,
  project: Project
): Promise<Category> {
  let category = await this.categoryRepository.findOne({
    where: {
      name: ILike(name),
      project: { id: project.id }
    }
  });

  if (!category) {
    category = this.categoryRepository.create({
      name,
      project
    });
    category = await this.categoryRepository.save(category);
  }

  return category;
}
private async findOrCreateBrand(
  name: string,
  category: Category,
  project: Project
): Promise<Brand> {
  let brand = await this.brandRepository.findOne({
    where: {
      name: ILike(name),
      project: { id: project.id }
    },
    relations: ['categories']
  });

  if (!brand) {
    brand = this.brandRepository.create({
      name,
      project,
      categories: [category]
    });
  } else {
    const alreadyLinked = brand.categories?.some(
      c => c.id === category.id
    );

    if (!alreadyLinked) {
      brand.categories = [...(brand.categories || []), category];
    }
  }

  return this.brandRepository.save(brand);
}
private async processImportRow(
  productData: ImportProductRowDto,
  project: Project
): Promise<void> {

  /**
   * 1️⃣ Category (auto-create)
   */
  const category = await this.findOrCreateCategory(
    productData.category_name,
    project
  );

  /**
   * 2️⃣ Brand (auto-create + auto-assign to category)
   */
  let brand: Brand | undefined;
  if (productData.brand_name) {
    brand = await this.findOrCreateBrand(
      productData.brand_name,
      category,
      project
    );
  }

  /**
   * 3️⃣ Prevent duplicate product
   */
  const exists = await this.productRepository.findOne({
    where: {
      name: productData.name,
      project: { id: project.id }
    }
  });

  if (exists) {
    throw new ConflictException(
      `Product "${productData.name}" already exists`
    );
  }

  /**
   * 4️⃣ Create product (FULL MAPPING)
   */
  const product = this.productRepository.create({
    // Excel → Product
    name: productData.name,                  // Product Name
    model: productData.device_name,           // Device Name
    sku: productData.sku,                     // SKU/Reference
    description: productData.description,     // Device Description
    price: productData.price,                 // Device Price
    is_high_priority: productData.product_priority || false,
    image_url: productData.image_url,         // Device Image URL

    discount: 0,
    is_active: true,

    // Relations
    project,
    category,
    brand
  });

  const savedProduct = await this.productRepository.save(product);

  /**
   * 5️⃣ Stock
   */
  await this.assignStock(savedProduct, project, productData);
}
async importAndUpdateProducts(rows: any[], projectId: string) {
  const project = await this.projectRepository.findOne({
    where: { id: projectId },
    relations: ['branches'],
  });

  if (!project) throw new NotFoundException(`Project ${projectId} not found`);

  const result = {
    created: 0,
    updated: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (let i = 0; i < rows.length; i++) {
    try {
      const updated = await this.processUpsertProduct(rows[i], project);
      console.log(rows,project)
      updated ? result.updated++ : result.created++;
    } catch (err) {
      result.failed++;
      result.errors.push(`Row ${i + 1}: ${err.message}`);
    }
  }

  return result;
}

private async processUpsertRow(row: any, project: Project) {
  const map = (keys: string[], def?: any) =>
    keys.find(k => row[k] !== undefined) ? row[keys.find(k => row[k] !== undefined)!] : def;

  /** Mapping */
  const name = map(['product_name', 'name']);
const model = map(
  ['device_name', 'product_name2', 'model'],
  map(['product_name', 'name']) // fallback
);
const imageUrlRaw = map(['device_image_url', 'image_url']);

// Remove :8080 if present
const imageUrl = imageUrlRaw ? imageUrlRaw.replace(/:\d+/, '') : undefined;

  const price = parseFloat(map(['device_price', 'price'], '0'));
  const isHighPriority = ['true', '1', 'yes'].includes(
    (map(['product_priority', 'priority'], '') + '').toLowerCase()
  );

  /** Category */
  const category = await this.findOrCreateCategory(
    map(['category_name']),
    project
  );

  /** Brand */
  const brand = map(['brand_name'])
    ? await this.findOrCreateBrand(
        map(['brand_name']),
        category,
        project
      )
    : undefined;

  /** Find product */
let product = await this.productRepository.findOne({
  where: [
    { name:`${name} ${model}`, project: { id: project.id } },
  ],
});


  /** CREATE */
  if (!product) {
    product = this.productRepository.create({
      name:`${name} ${model}`,
      model,
      description: map(['device_description', 'description']),
      price,
      image_url: imageUrl,
      is_high_priority: isHighPriority,
      project,
      category,
      brand,
      is_active: true,
    });

    await this.productRepository.save(product);
    row._updated = false;
  }

  /** UPDATE */
  else {
    this.productRepository.merge(product, {
      model,
      price,
      image_url: imageUrl,
      is_high_priority: isHighPriority,
      category,
      brand,
    });

    await this.productRepository.save(product);
    row._updated = true;
  }


}
private async processUpsertProduct(row: any, project: Project): Promise<boolean> {
    const map = (keys: string[], def?: any) => {
      for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null && row[k] !== '') {
          return row[k];
        }
      }
      return def;
    };

    // Clean and map values
    const name = map(['name', 'product_name'])?.toString().trim() || map(['name', 'product_name_2',"product_name2"])?.toString().trim();
    const description = map(['description', 'device_description'])?.toString().trim();
    const price = parseFloat(map(['price', 'device_price'], '0'));
    const quantity = parseInt(map(['quantity', 'stock', 'stock_quantity'], '0'));
    const model = map(['model', 'device_model', 'device_name'], '')?.toString().trim();
    const extraSku = map(['Extra sku', 'extra_sku', 'sku'])?.toString().trim();
    const sacoSku = map(['Saco SKU', 'saco_sku'])?.toString().trim();
    const imageUrlRaw = map(['image_url', 'device_image_url'])?.toString();

    // Download and save image if URL exists
    let savedImagePath: string = null;
    if (imageUrlRaw && imageUrlRaw.trim() !== '' &&
        imageUrlRaw.toLowerCase() !== 'null' &&
        imageUrlRaw.toLowerCase() !== 'undefined') {

      console.log(`Processing image for product ${name}: ${imageUrlRaw}`);
      savedImagePath = await this.downloadAndSaveImage(imageUrlRaw);

      if (savedImagePath) {
        console.log(`✓ Image saved: ${savedImagePath}`);
      } else {
        console.log(`✗ Failed to download image for ${name}`);
      }
    }

    const isHighPriority = ['true', '1', 'yes'].includes((map(['is_high_priority', 'product_priority'], '') + '').toLowerCase());
    const categoryName = map(['category_name', 'category'])?.toString().trim();
    const brandName = map(['brand_name', 'brand'])?.toString().trim();
    const allBranches = ['true', '1', 'yes'].includes((map(['all_branches'], 'false') + '').toLowerCase());
    const branchesRaw = map(['branches'], '')?.toString();
    const branchNames = branchesRaw ?
      branchesRaw.split(',')
        .map((b: string) => b.trim())
        .filter((b: string) => b.length > 0) :
      [];

    // Validate required fields
    if (!name) {
      throw new Error('Product name is required');
    }

    if (!categoryName) {
      throw new Error('Category name is required');
    }

    const productDisplayName = model ? `${name} ${model}` : name;
    const isSacoActive = sacoSku && sacoSku.toLowerCase() !== 'not actv';
    const finalSku = isSacoActive ?
      [extraSku, sacoSku]
        .filter(s => s && s.toLowerCase() !== 'not actv')
        .join(' - ') || null :
      extraSku || null;

    const category = await this.findOrCreateCategory(categoryName, project);
    const brand = brandName ? await this.findOrCreateBrand(brandName, category, project) : undefined;

    let product = null;

    // Try to find by SKUs first
    if (finalSku) {
      product = await this.productRepository.findOne({
        where: {
          sku: finalSku,
          project: { id: project.id }
        }
      });
    }

    // If not found by SKU, try by name+model
    if (!product) {
      product = await this.productRepository.findOne({
        where: {
          name: productDisplayName,
          project: { id: project.id }
        }
      });
    }

    // If still not found, try just by name (without model)
    if (!product && model) {
      product = await this.productRepository.findOne({
        where: {
          name: name,
          project: { id: project.id }
        }
      });
    }

    const isUpdate = !!product;

    if (!product) {
      // CREATE new product
      product = this.productRepository.create({
        name: productDisplayName,
        model: model || null,
        sku: finalSku,
        description: description || null,
        price: price || 0,
        image_url: savedImagePath, // Use saved image path
        is_high_priority: isHighPriority || false,
        project,
        category,
        brand,
        is_active: true,
      });

      await this.productRepository.save(product);
      console.log(`Created product: ${productDisplayName} ${savedImagePath ? '(with image)' : '(no image)'}`);
    } else {
      // UPDATE existing product
      const updateData: any = {
        name: productDisplayName,
        model: model || null,
        sku: finalSku,
        description: description || product.description,
        price: price !== 0 ? price : product.price,
        is_high_priority: isHighPriority !== undefined ? isHighPriority : product.is_high_priority,
        category,
        brand,
      };

      // Only update image if we successfully downloaded a new one
      if (savedImagePath) {
        updateData.image_url = savedImagePath;
        console.log(`Updated product ${productDisplayName} with new image`);
      }

      this.productRepository.merge(product, updateData);
      await this.productRepository.save(product);
      console.log(`Updated product: ${productDisplayName}`);
    }

    // Assign stock if quantity is provided
    if (quantity > 0) {
      await this.assignStockWithBranches(product, project, quantity, allBranches, branchNames);
    }

    return isUpdate;
  }


private async assignStockWithBranches(
  product: Product,
  project: Project,
  quantity: number,
  allBranches: boolean,
  branchNames: string[]
) {
  if (quantity <= 0) return;

  const stockToInsert: Partial<Stock>[] = [];
  const availableBranches = project.branches || [];

  if (allBranches) {
    for (const branch of availableBranches) {
      stockToInsert.push({ branch, product, quantity });
    }
  } else if (branchNames.length > 0) {
    for (const branchName of branchNames) {
      const branch = availableBranches.find(
        b => b.name.toLowerCase() === branchName.toLowerCase()
      );
      if (!branch) throw new NotFoundException(`Branch "${branchName}" not found`);
      stockToInsert.push({ branch, product, quantity });
    }
  }

  if (stockToInsert.length > 0) {
    // Remove old stock for these branches
    const branchIds = stockToInsert.map(s => s.branch.id);
    await this.stockRepository.delete({ product: { id: product.id }, branch: { id: In(branchIds) } });
    // Insert new stock
    await this.stockRepository.save(stockToInsert);
  }
}

  async importAndUpdateProductsBatch(
    rows: any[],
    projectId: string,
    rowIndices: number[]
  ): Promise<{
    created: number;
    updated: number;
    failed: number;
    errors: string[];
    imagesDownloaded: number;
  }> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: ['branches'],
    });

    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const result = {
      created: 0,
      updated: 0,
      failed: 0,
      imagesDownloaded: 0,
      errors: [] as string[],
    };

    // Process batch sequentially
    for (let i = 0; i < rows.length; i++) {
      try {
        const isUpdate = await this.processUpsertProduct(rows[i], project);

        // Count images that were successfully downloaded
        const imageUrl = rows[i]['image_url'] || rows[i]['device_image_url'];
        if (imageUrl && imageUrl.trim() !== '') {
          result.imagesDownloaded++;
        }

        if (isUpdate) {
          result.updated++;
        } else {
          result.created++;
        }
      } catch (err) {
        result.failed++;
        result.errors.push(`Row ${rowIndices[i]}: ${err.message}`);
        console.error(`Error processing row ${rowIndices[i]}:`, err);
      }
    }

    return result;
  }

  private ensureUploadDirectory() {
    if (!fs.existsSync(this.uploadPath)) {
      fs.mkdirSync(this.uploadPath, { recursive: true });
    }
  }

  /**
   * Download image from URL and save locally
   */
  private async downloadAndSaveImage(imageUrl: string): Promise<string> {
    if (!imageUrl || imageUrl.trim() === '' || imageUrl.toLowerCase() === 'null' || imageUrl.toLowerCase() === 'undefined') {
      return null;
    }

    try {
      console.log(`Downloading image from: ${imageUrl}`);

      // Clean the URL - remove port 8080 if present
      let cleanUrl = imageUrl;
      if (imageUrl.includes(':8080')) {
        cleanUrl = imageUrl.replace(':8080', '');
      }

      // Encode spaces in URL
      cleanUrl = cleanUrl.replace(/ /g, '%20');

      // Use axios with timeout and proper headers
      const response = await axios({
        method: 'GET',
        url: cleanUrl,
        responseType: 'arraybuffer',
        timeout: 10000, // 10 second timeout
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.data || response.data.length === 0) {
        console.warn(`Empty response for image: ${cleanUrl}`);
        return null;
      }

      // Determine file extension
      let fileExtension = '.png'; // default
      const contentType = response.headers['content-type'];
      if (contentType) {
        if (contentType.includes('jpeg') || contentType.includes('jpg')) {
          fileExtension = '.jpg';
        } else if (contentType.includes('png')) {
          fileExtension = '.png';
        } else if (contentType.includes('gif')) {
          fileExtension = '.gif';
        } else if (contentType.includes('webp')) {
          fileExtension = '.webp';
        }
      } else {
        // Try to get extension from URL
        const urlObj = new URL(cleanUrl);
        const pathname = urlObj.pathname;
        const lastDotIndex = pathname.lastIndexOf('.');
        if (lastDotIndex !== -1) {
          const ext = pathname.substring(lastDotIndex).toLowerCase();
          if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) {
            fileExtension = ext;
          }
        }
      }

      // Generate unique filename
      const fileName = `${uuidv4()}${fileExtension}`;
      const filePath = path.join(this.uploadPath, fileName);

      // Save file
      await fs.promises.writeFile(filePath, response.data);

      // Return relative URL for database storage
      const savedUrl = `/uploads/products/${fileName}`;
      console.log(`Image saved: ${savedUrl}`);
      return savedUrl;

    } catch (error) {
      console.error(`Error downloading image from ${imageUrl}:`, error.message);

      // Try alternative method with http/https module
      try {
        return await this.downloadWithHttpModule(imageUrl);
      } catch (fallbackError) {
        console.error(`Fallback download also failed for ${imageUrl}:`, fallbackError.message);
        return null;
      }
    }
  }


private async downloadWithHttpModule(url: string): Promise<string> {
  try {
    const cleanedUrl = url.replace(':8080', '').replace(/ /g, '%20');

    const response = await axios({
      method: 'GET',
      url: cleanedUrl,
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('Empty image');
    }

    // Determine file extension
    let fileExtension = '.png';
    const contentType = response.headers['content-type'];
    if (contentType) {
      if (contentType.includes('jpeg') || contentType.includes('jpg')) {
        fileExtension = '.jpg';
      } else if (contentType.includes('png')) {
        fileExtension = '.png';
      } else if (contentType.includes('gif')) {
        fileExtension = '.gif';
      }
    }

    const fileName = `${uuidv4()}${fileExtension}`;
    const filePath = path.join(this.uploadPath, fileName);
    await fs.promises.writeFile(filePath, response.data);

    return `/uploads/products/${fileName}`;
  } catch (error) {
    throw error;
  }
}
  private async processImportRowWithImage(
    productData: ImportProductRowDto,
    project: Project
  ): Promise<void> {
    const category = await this.findOrCreateCategory(productData.category_name, project);

    let brand: Brand | undefined;
    if (productData.brand_name) {
      brand = await this.findOrCreateBrand(productData.brand_name, category, project);
    }

    const exists = await this.productRepository.findOne({
      where: {
        name: productData.name,
        project: { id: project.id }
      }
    });

    if (exists) {
      throw new ConflictException(`Product "${productData.name}" already exists`);
    }

    // Download and save image if URL exists
    let savedImagePath: string = null;
    if (productData.image_url && productData.image_url.trim() !== '') {
      savedImagePath = await this.downloadAndSaveImage(productData.image_url);
    }

    const product = this.productRepository.create({
      name: productData.name,
      model: productData.device_name,
      sku: productData.sku,
      description: productData.description,
      price: productData.price,
      is_high_priority: productData.product_priority || false,
      image_url: savedImagePath, // Save local path instead of external URL
      discount: 0,
      is_active: true,
      project,
      category,
      brand
    });

    const savedProduct = await this.productRepository.save(product);
    await this.assignStock(savedProduct, project, productData);
  }
}