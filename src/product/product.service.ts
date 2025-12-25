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

@Injectable()
export class ProductService {
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

  ) {}
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
  async importProducts(dto: ImportProductsDto): Promise<{ success: number; failed: number; errors: string[] }> {
    const project = await this.projectRepository.findOne({
      where: { id: dto.project_id },
      relations: ['branches']
    });

    if (!project) {
      throw new NotFoundException(`Project with ID ${dto.project_id} not found`);
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };

    // Process products one by one
    for (let i = 0; i < dto.products.length; i++) {
      try {
        await this.processImportRow(dto.products[i], project);
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    return results;
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

private async processUpsertProduct(row: any, project: Project): Promise<boolean> {
  // Helper function to map fields with fallback
  const map = (keys: string[], def?: any) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null && row[k] !== '') {
        return row[k];
      }
    }
    return def;
  };

  // Extract all fields
  const name = map(['name', 'product_name'])?.toString().trim();
  const description = map(['description', 'device_description'])?.toString().trim();
  const priceStr = map(['price', 'device_price'], '0');
  const quantityStr = map(['quantity', 'stock', 'stock_quantity'], '0');
  const model = map(['model', 'device_model', 'device_name'], '')?.toString().trim();
  const extraSku = map(['Extra sku', 'extra_sku', 'sku'])?.toString().trim();
  const sacoSku = map(['Saco SKU', 'saco_sku'])?.toString().trim();
  const imageUrlRaw = map(['image_url', 'device_image_url'])?.toString();
  const priorityStr = map(['is_high_priority', 'product_priority'], '');
  const categoryName = map(['category_name', 'category'])?.toString().trim();
  const brandName = map(['brand_name', 'brand'])?.toString().trim();
  const allBranchesStr = map(['all_branches'], 'false');
  const branchesRaw = map(['branches'], '');

  // Validate required fields
  if (!name) throw new Error('Product name is required');
  if (!categoryName) throw new Error('Category name is required');

  // Parse values
  const price = parseFloat(priceStr);
  const quantity = parseInt(quantityStr);
  const isHighPriority = ['true', '1', 'yes'].includes((priorityStr + '').toLowerCase());
  const allBranches = ['true', '1', 'yes'].includes((allBranchesStr + '').toLowerCase());
  const imageUrl = imageUrlRaw ? imageUrlRaw.replace(/:\d+/, '') : undefined;
  const branchNames = branchesRaw ?
    branchesRaw.split(',').map((b: string) => b.trim()).filter((b: string) => b.length > 0) :
    [];

  // Determine product display name
  const productDisplayName = model ? `${name} ${model}` : name;

  // Determine final SKU
  const isSacoActive = sacoSku && sacoSku.toLowerCase() !== 'not actv';
  const finalSku = isSacoActive ?
    [extraSku, sacoSku]
      .filter(s => s && s.toLowerCase() !== 'not actv')
      .join(' - ') || null :
    extraSku || null;

  // Find or create category first
  const category = await this.findOrCreateCategory(categoryName, project);

  // Then find or create brand (needs category)
  const brand = brandName ? await this.findOrCreateBrand(brandName, category, project) : undefined;

  // Find existing product
  const product = await this.productRepository.findOne({
    where: {
      name: productDisplayName,
      project: { id: project.id }
    }
  });

  const isUpdate = !!product;
  let productToSave: Product;

  if (!product) {
    // CREATE new product
    productToSave = this.productRepository.create({
      name: productDisplayName,
      model: model || null,
      sku: finalSku,
      description: description || null,
      price: price || 0,
      image_url: imageUrl || null,
      is_high_priority: isHighPriority,
      project,
      category,
      brand,
      is_active: true,
    });
  } else {
    // UPDATE existing product
    productToSave = product;
    this.productRepository.merge(productToSave, {
      name: productDisplayName,
      model: model || productToSave.model,
      sku: finalSku || productToSave.sku,
      description: description || productToSave.description,
      price: price !== 0 ? price : productToSave.price,
      image_url: imageUrl || productToSave.image_url,
      is_high_priority: isHighPriority !== undefined ? isHighPriority : productToSave.is_high_priority,
      category,
      brand: brand || productToSave.brand,
    });
  }

  // Save product
  const savedProduct = await this.productRepository.save(productToSave);

  // Handle stock assignment asynchronously
  if (quantity > 0) {
    this.assignStockWithBranches(savedProduct, project, quantity, allBranches, branchNames)
      .catch(error => console.error(`Stock assignment error for ${savedProduct.name}:`, error));
  }

  return isUpdate;
}

private async assignStockWithBranches(
  product: Product,
  project: Project,
  quantity: number,
  allBranches: boolean,
  branchNames: string[]
): Promise<void> {
  if (quantity <= 0) return;

  const stockToInsert: Partial<Stock>[] = [];
  const availableBranches = project.branches || [];

  if (allBranches) {
    // Assign to all branches
    stockToInsert.push(...availableBranches.map(branch => ({
      branch,
      product,
      quantity
    })));
  } else if (branchNames.length > 0) {
    // Assign to specific branches
    for (const branchName of branchNames) {
      const branch = availableBranches.find(
        b => b.name.toLowerCase() === branchName.toLowerCase()
      );
      if (!branch) throw new NotFoundException(`Branch "${branchName}" not found`);
      stockToInsert.push({ branch, product, quantity });
    }
  }

  if (stockToInsert.length > 0) {
    const branchIds = stockToInsert.map(s => s.branch.id);
    // Use transaction for stock operations
    await this.stockRepository.manager.transaction(async (transactionalEntityManager) => {
      await transactionalEntityManager.getRepository(Stock).delete({
        product: { id: product.id },
        branch: { id: In(branchIds) }
      });
      await transactionalEntityManager.getRepository(Stock).save(stockToInsert);
    });
  }
}

private async findOrCreateCategory(name: string, project: Project): Promise<Category> {
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
    const alreadyLinked = brand.categories?.some(c => c.id === category.id);
    if (!alreadyLinked) {
      brand.categories = [...(brand.categories || []), category];
    }
  }

  return this.brandRepository.save(brand);
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

  // Process in batches for better performance
  const BATCH_SIZE = 50;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    // Process batch items in parallel
    const batchPromises = batch.map(async (row, index) => {
      try {
        const isUpdate = await this.processUpsertProduct(row, project);
        return { success: true, isUpdate };
      } catch (error) {
        return { success: false, error: `Row ${i + index + 1}: ${error.message}` };
      }
    });

    const batchResults = await Promise.all(batchPromises);

    // Count results
    batchResults.forEach(resultItem => {
      if (resultItem.success) {
        resultItem.isUpdate ? result.updated++ : result.created++;
      } else {
        result.failed++;
        result.errors.push(resultItem.error);
      }
    });

    // Small delay to prevent database overload
    if (i + BATCH_SIZE < rows.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  return result;
}

private async processImportRow(
  productData: ImportProductRowDto,
  project: Project
): Promise<void> {
  const category = await this.findOrCreateCategory(
    productData.category_name,
    project
  );

  let brand: Brand | undefined;
  if (productData.brand_name) {
    brand = await this.findOrCreateBrand(
      productData.brand_name,
      category,
      project
    );
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

  const product = this.productRepository.create({
    name: productData.name,
    model: productData.device_name,
    sku: productData.sku,
    description: productData.description,
    price: productData.price,
    is_high_priority: productData.product_priority || false,
    image_url: productData.image_url,
    discount: 0,
    is_active: true,
    project,
    category,
    brand
  });

  const savedProduct = await this.productRepository.save(product);
  await this.assignStock(savedProduct, project, productData);
}

private async assignStock(product: Product, project: Project, productData: any) {
  const quantity = parseInt(productData.quantity || '0');
  if (quantity <= 0) return;

  const stockToInsert: Partial<Stock>[] = [];
  const availableBranches = project.branches || [];

  if (productData.all_branches || ['true','1','yes'].includes((productData.all_branches+'').toLowerCase())) {
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
    const branchIds = stockToInsert.map(s => s.branch.id);
    await this.stockRepository.delete({ product: { id: product.id }, branch: { id: In(branchIds) } });
    await this.stockRepository.save(stockToInsert);
  }
}
}

