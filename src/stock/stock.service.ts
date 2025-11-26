// stock.service.ts
import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CRUD, CustomPaginatedResponse } from 'common/crud.service';
import { CreateStockDto, UpdateStockDto } from 'dto/stock.dto';
import { Branch } from 'entities/branch.entity';
import { Product } from 'entities/products/product.entity';
import { Stock } from 'entities/products/stock.entity';
import { In, LessThanOrEqual, Not, Repository } from 'typeorm';
import { Sale } from 'entities/products/sale.entity';

type OutOfStockItem = {
  product: any;
  branch?: any | null;
  quantity: number;
};

type OutOfStockResponse = {
  mode: 'per-branch' | 'aggregate';
  threshold: number;
  branchId?: string;
  productId?: string;
  project:any;
  items: OutOfStockItem[];
  count: number;
};


@Injectable()
export class StockService {
  constructor(
    @InjectRepository(Stock) public stockRepo: Repository<Stock>,
    @InjectRepository(Product) public productRepo: Repository<Product>,
    @InjectRepository(Branch) public branchRepo: Repository<Branch>,
    @InjectRepository(Sale) public saleRepo: Repository<Sale>,
  ) {}

  async getStocksByProjectPaginated(params: { projectId: string; search?: string; page?: any; limit?: any; sortBy?: string; sortOrder?: 'ASC' | 'DESC', query: any }) {
    const { projectId, search, page = 1, limit = 10, sortBy, sortOrder = 'DESC', query } = params;

    if (!projectId) {
      throw new BadRequestException('projectId is required');
    }

    const filters = {
      branch: {
        project: {
          id: projectId,
        },
      },
      ...query?.filters
    };

    return CRUD.findAllRelation<Stock>(
      this.stockRepo,
      'stock',  
      search,
      page,
      limit,
      sortBy,
      sortOrder,
      ['product', 'branch', "branch.project",'product.brand'], 
      ['name'], 
      filters,
    );
  }

  async createOrUpdate(createStockDto: CreateStockDto): Promise<Stock> {
    const { product_id, branch_id, quantity } = createStockDto;

    // Validate quantity
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new BadRequestException('Quantity must be an integer >= 0');
    }

    const product = await this.productRepo.findOne({
      where: { id: product_id },
      relations: ['project', 'brand'], // Added 'brand'
    });
    if (!product) {
      throw new NotFoundException(`Product with ID ${product_id} not found`);
    }

    const branch = await this.branchRepo.findOne({
      where: { id: branch_id },
      relations: ['project'],
    });
    if (!branch) {
      throw new NotFoundException(`Branch with ID ${branch_id} not found`);
    }

    let stock = await this.stockRepo.findOne({
      where: {
        product: { id: product_id },
        branch: { id: branch_id },
      },
  relations: ['product', 'branch', 'product.brand'], // Added 'product.brand'
    });
    if (stock) {
      stock.quantity = quantity;
    } else {
      stock = this.stockRepo.create({
        quantity,
        product,
        branch,
        product_id,
        branch_id,
      });
    }

    return this.stockRepo.save(stock);
  }

// stock.service.ts
async getStocksByBranch(branchId: string) {
  const stocks = await this.stockRepo.find({
    where: { branch: { id: branchId } },
    relations: ['product', 'branch', 'product.brand', 'product.category'],
  });

  // Extract branch info (same for all records)
  const branchInfo = stocks.length > 0 ? {
    id: stocks[0].branch?.id || null,
    name: stocks[0].branch?.name || null,
    city: stocks[0].branch?.city || null
  } : null;

  // Transform the data
  const optimizedRecords = stocks.map(stock => ({
    id: stock.id,
    quantity: stock.quantity,
    created_at: stock.created_at,
    updated_at: stock.updated_at,
    product: {
      id: stock.product?.id || null,
      name: stock.product?.name || null,
      sku: stock.product?.sku || null,
      brand_name: stock.product?.brand?.name || null,
      category_name: stock.product?.category?.name || null
    }
  }));

  return {
    total_records: stocks.length,
    branch: branchInfo,
    records: optimizedRecords
  };
}

  async getStocksByProduct(productId: string): Promise<Stock[]> {
    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    return this.stockRepo.find({
      where: { product: { id: productId } },
      relations: ['product', 'branch', 'product.brand'], // Added 'product.brand'
    });
  }
  // stock.service.ts
  async getOutOfStockSmart(opts: { branchId?: string; productId?: string; project?: string; threshold?: number }): Promise<OutOfStockResponse> {
    const { branchId, productId, project, threshold = 0 } = opts;
    if (productId) {
      return this.getOutOfStock({ branchId, productId, project, threshold });
    }
    return this.getOutOfStockAggregated({ branchId, project, threshold });
  }
  
  async getOutOfStock(opts: { branchId?: string; productId?: string; project?: string; threshold?: number }): Promise<OutOfStockResponse> {
    const { branchId, productId, project, threshold = 0 } = opts;
  
    if (branchId) {
      const branch = await this.branchRepo.findOne({ where: { id: branchId } });
      if (!branch) throw new NotFoundException(`Branch with ID ${branchId} not found`);
    }
    if (productId) {
      const product = await this.productRepo.findOne({ where: { id: productId } });
      if (!product) throw new NotFoundException(`Product with ID ${productId} not found`);
    }
  
    const where: any = { quantity: LessThanOrEqual(threshold) };
    if (branchId) where.branch = { id: branchId };
    if (productId) where.product = { id: productId };
    if (project) where.product = { ...where.product, project }; // ✅ Added project filter
  
    const stocks = await this.stockRepo.find({
      where,
      relations: ['product', 'branch'],
      order: { quantity: 'ASC' },
    });
  
    const items = stocks.map(s => ({
      product: s.product,
      branch: s.branch,
      quantity: s.quantity,
    }));
  
    return {
      mode: 'per-branch',
      threshold,
      branchId,
      productId,
      project, // ✅ Return project in response
      items,
      count: items.length,
    };
  }
  
  async getOutOfStockAggregated(opts: { branchId?: string; project?: string; threshold?: number }): Promise<OutOfStockResponse> {
    const { branchId, project, threshold = 0 } = opts;
  
    // تجميعة آمنة بلا سحب stock.id
    const qb = this.productRepo.createQueryBuilder('product')
      .leftJoin('product.stock', 'stock')
      .leftJoin('stock.branch', 'branch')
      .select('product.id', 'product_id')
      .addSelect('product.name', 'product_name')
      .addSelect('product.project', 'project') // ✅ Added project to select
      .addSelect('COALESCE(SUM(stock.quantity), 0)', 'total_qty')
      .groupBy('product.id')
      .addGroupBy('product.name')
      .addGroupBy('product.project') // ✅ Added project to group by
      .having('COALESCE(SUM(stock.quantity), 0) <= :thr', { thr: threshold })
      .orderBy('total_qty', 'ASC');
  
    if (branchId) {
      qb.andWhere('branch.id = :branchId', { branchId });
    }
    if (project) {
      qb.andWhere('product.project = :project', { project }); // ✅ Added project filter
    }
  
    const rows = await qb.getRawMany(); // [{ product_id, product_name, project, total_qty }]
    if (rows.length === 0) {
      return {
        mode: 'aggregate',
        threshold,
        branchId,
        project, // ✅ Return project in response
        items: [],
        count: 0,
      };
    }
  
    // حمّل المنتجات مع stocks + branches (لنفس شكل الإخراج)
    const productIds = rows.map(r => r.product_id);
    const products = await this.productRepo.find({
      where: { id: In(productIds) },
      relations: ['stock', 'stock.branch'],
    });
    const byId = new Map(products.map(p => [p.id, p]));
  
    const items = rows.map(r => {
      const product = byId.get(r.product_id)!;
  
      // لو عايز تقتصر stocks داخل المنتج على فرع معين (للمعاينة فقط)، ممكن تفعّل السطر ده:
      const productScoped = branchId ? { ...product, stock: (product.stock ?? []).filter((s: any) => s.branch?.id === branchId) } : product;
  
      return {
        product: productScoped,
        branch: null, // موحّد مع per-branch (لكن هنا aggregate)
        quantity: Number(r.total_qty), // نفس المفتاح "quantity" في الحالتين
      };
    });
  
    return {
      mode: 'aggregate',
      threshold,
      branchId,
      project, // ✅ Return project in response
      items,
      count: items.length,
    };
  }

  async getById(id: string): Promise<Stock> {
    const stock = await this.stockRepo.findOne({
      where: { id },
      relations: ['product', 'branch', 'product.project', 'branch.project', 'product.brand'], 
    });
    console.log(stock.product.brand)

    if (!stock) {
      throw new NotFoundException(`Stock with ID ${id} not found`);
    }

    return stock;
  }

  async updateOne(id: string, dto: UpdateStockDto): Promise<Stock> {
    const stock = await this.stockRepo.findOne({
      where: { id },
      relations: ['product', 'product.project', 'branch', 'branch.project'],
    });
    if (!stock) throw new NotFoundException('Stock not found');

    // Validate quantity if provided
    if (typeof dto.quantity === 'number') {
      if (!Number.isInteger(dto.quantity) || dto.quantity < 0) {
        throw new BadRequestException('Quantity must be an integer >= 0');
      }
    }

    const product = dto.product_id ? await this.productRepo.findOne({ 
      where: { id: dto.product_id }, 
      relations: ['project'] 
    }) : stock.product;
    
    if (dto.product_id && !product) {
      throw new NotFoundException(`Product with ID ${dto.product_id} not found`);
    }

    const branch = dto.branch_id ? await this.branchRepo.findOne({ 
      where: { id: dto.branch_id }, 
      relations: ['project'] 
    }) : stock.branch;
    
    if (dto.branch_id && !branch) {
      throw new NotFoundException(`Branch with ID ${dto.branch_id} not found`);
    }

    // Check for duplicate stock entry
    if (dto.product_id || dto.branch_id) {
      const existing = await this.stockRepo.findOne({
        where: {
          id: Not(id),
          product: { id: product.id },
          branch: { id: branch.id },
        },
      });
      if (existing) {
        throw new ConflictException(`Stock for this product and branch combination already exists`);
      }
    }

    // Update fields
    if (typeof dto.quantity === 'number') {
      stock.quantity = dto.quantity;
    }
    if (dto.product_id) {
      stock.product = product;
      stock.product_id = product.id;
    }
    if (dto.branch_id) {
      stock.branch = branch;
      stock.branch_id = branch.id;
    }

    return this.stockRepo.save(stock);
  }

  async outOfStock(id: string, dto: UpdateStockDto): Promise<Stock> {
    const stock = await this.stockRepo.findOne({
      where: { id },
      relations: ['product', 'product.project', 'branch', 'branch.project'],
    });
    if (!stock) throw new NotFoundException('Stock not found');

    const product = dto.product_id ? await this.productRepo.findOne({ 
      where: { id: dto.product_id }, 
      relations: ['project'] 
    }) : stock.product;
    
    if (dto.product_id && !product) {
      throw new NotFoundException(`Product with ID ${dto.product_id} not found`);
    }

    const branch = dto.branch_id ? await this.branchRepo.findOne({ 
      where: { id: dto.branch_id }, 
      relations: ['project'] 
    }) : stock.branch;
    
    if (dto.branch_id && !branch) {
      throw new NotFoundException(`Branch with ID ${dto.branch_id} not found`);
    }

    // Check for duplicate
    const existing = await this.stockRepo.findOne({
      where: {
        id: Not(id),
        product: { id: product.id },
        branch: { id: branch.id },
      },
    });
    if (existing) {
      throw new ConflictException(`Stock for this product and branch combination already exists`);
    }

    // Set quantity to 0 (out of stock)
    stock.quantity = 0;
    stock.product = product;
    stock.branch = branch;
    stock.product_id = product.id;
    stock.branch_id = branch.id;

    return this.stockRepo.save(stock);
  }

  async deleteStock(id: string): Promise<{ message: string }> {
    const stock = await this.stockRepo.findOne({
      where: { id },
      relations: ['product', 'branch'],
    });

    if (!stock) {
      throw new NotFoundException(`Stock with ID ${id} not found`);
    }

    // Check if there are any sales associated with this stock
    const salesCount = await this.saleRepo.count({
      where: {
        product: { id: stock.product.id },
        branch: { id: stock.branch.id },
      },
    });

    if (salesCount > 0) {
      throw new ForbiddenException(
        `Cannot delete stock. There are ${salesCount} sales associated with this product and branch.`
      );
    }

    // Soft delete the stock
    await this.stockRepo.softDelete(id);

    return { message: 'Stock deleted successfully' };
  }



// stock.service.ts
async getLowStockAlerts(threshold: number = 10, projectId?: string) {
  const query = this.stockRepo
    .createQueryBuilder('stock')
    .leftJoinAndSelect('stock.product', 'product')
    .leftJoinAndSelect('stock.branch', 'branch')
    .leftJoinAndSelect('product.brand', 'brand')
    .leftJoinAndSelect('product.category', 'category')
    .where('stock.quantity <= :threshold', { threshold })
    .andWhere('stock.quantity > 0')
    .orderBy('stock.quantity', 'ASC');

  if (projectId) {
    query.andWhere('branch.projectId = :projectId', { projectId });
  }

  const stocks = await query.getMany();

  const optimizedRecords = stocks.map(stock => ({
    id: stock.id,
    quantity: stock.quantity,
    created_at: stock.created_at,
    product: {
      id: stock.product?.id || null,
      name: stock.product?.name || null,
      sku: stock.product?.sku || null,
      brand_name: stock.product?.brand?.name || null,
      category_name: stock.product?.category?.name || null
    },
    branch: {
      id: stock.branch?.id || null,
      name: stock.branch?.name || null,
      city: stock.branch?.city || null
    }
  }));

  return {
    total_records: stocks.length,
    threshold,
    records: optimizedRecords
  };
}

  async getStockHistory(productId: string, branchId: string, days: number = 30): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const sales = await this.saleRepo
      .createQueryBuilder('sale')
      .where('sale.productId = :productId', { productId })
      .andWhere('sale.branchId = :branchId', { branchId })
      .andWhere('sale.createdAt >= :startDate', { startDate })
      .andWhere('sale.status != :status', { status: 'cancelled' })
      .select([
        'DATE(sale.createdAt) as date',
        'SUM(sale.quantity) as sold_quantity',
        'SUM(sale.total_amount) as total_revenue'
      ])
      .groupBy('DATE(sale.createdAt)')
      .orderBy('date', 'DESC')
      .getRawMany();

    return {
      productId,
      branchId,
      period: `${days} days`,
      salesHistory: sales,
    };
  }
}