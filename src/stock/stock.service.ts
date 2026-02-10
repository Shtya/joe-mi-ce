// stock.service.ts
import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CRUD, CustomPaginatedResponse } from 'common/crud.service';
import { CreateStockDto, UpdateStockDto } from 'dto/stock.dto';
import { Branch } from 'entities/branch.entity';
import { Product } from 'entities/products/product.entity';
import { Stock } from 'entities/products/stock.entity';
import { Brackets, In, LessThanOrEqual, Not, Repository } from 'typeorm';
import { Sale } from 'entities/products/sale.entity';
import { User } from 'entities/user.entity';
import { UsersService } from 'src/users/users.service';

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
    @InjectRepository(User) public userRepo: Repository<User>,
    public readonly userService : UsersService
  ) {}

async getStocksByProjectPaginated(params: {
  projectId: string;
  search?: string;
  page?: any;
  limit?: any;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  query: any;
}) {
  const { projectId, search, page = 1, limit = 10, sortBy, sortOrder = 'DESC', query } = params;



  // Start with the mandatory project filter
  const filters: any = {
    branch: {
      project: {
        id: projectId,
      },
    },
  };

  if (query?.filters) {
    const { product, brand, branch, category, createdAt } = query.filters;

    if (brand?.id) filters.product = { ...(filters.product || {}), brand: { id: brand.id } };
    if (branch?.id) filters.branch = { ...(filters.branch || {}), id: branch.id };
    if (category?.id) filters.product = { ...(filters.product || {}), category: { id: category.id } };
    if (createdAt) filters.created_at = createdAt;
  }

  return CRUD.findAllRelation<Stock>(
    this.stockRepo,
    'stock',
    search,
    page,
    limit,
    sortBy,
    sortOrder,
    ['product', 'branch', 'branch.project', 'product.brand', 'product.category'],
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
      withDeleted:true,
  relations: ['product', 'branch', 'product.brand'], // Added 'product.brand'
    });
    if (stock) {
      stock.deleted_at = null;
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

  async getStocksByBranch(
    branchId: string,
    search?: string,
    page: any = 1,
    limit: any = 10,
    sortBy?: string,
    sortOrder: 'ASC' | 'DESC' = 'DESC',
    filters?: any
  ) {
    if (!branchId) {
      throw new BadRequestException('branchId is required');
    }

    const baseFilters = {
      branch: {
        id: branchId,
      },
      ...filters
    };

    return CRUD.findAllRelation<Stock>(
      this.stockRepo,
      'stock',
      search,
      page,
      limit,
      sortBy,
      sortOrder,
      ['product', 'branch', 'branch.project', 'product.brand', 'product.category'],
      ['name'],
      baseFilters,
    );
  }

async getStocksByProduct(
  productId: string,
  search?: string,
  page: any = 1,
  limit: any = 10,
  sortBy?: string,
  sortOrder: 'ASC' | 'DESC' = 'DESC',
  filters?: any
) {
  if (!productId) {
    throw new BadRequestException('productId is required');
  }

  const baseFilters = {
    product: {
      id: productId,
    },
    ...filters
  };

  return CRUD.findAllRelation<Stock>(
    this.stockRepo,
    'stock',
    search,
    page,
    limit,
    sortBy,
    sortOrder,
    ['product', 'branch', 'branch.project', 'product.brand', 'product.category'],
    ['name'],
    baseFilters,
  );
}

  // stock.service.ts
async getOutOfStockSmart(
  opts: { branchId?: string; productId?: string; threshold?: number },
  user: any
): Promise<OutOfStockResponse> {
      const projectId = await this.userService.resolveProjectIdFromUser(user.id);

     if (opts.productId) {
    return this.getOutOfStock({
      branchId: opts.branchId,
      productId: opts.productId,
      threshold: opts.threshold,
      projectId,
    });
  }
  return this.getOutOfStockAggregated({
    branchId: opts.branchId,
    threshold: opts.threshold,
    projectId,
  });  }

async getOutOfStock(opts: {
  branchId?: string;
  productId?: string;
  projectId: string;
  threshold?: number;
}): Promise<OutOfStockResponse> {

  const { branchId, productId, projectId, threshold = 0 } = opts;

  /* ===================== VALIDATION ===================== */

  if (branchId) {
    const branch = await this.branchRepo.findOne({
      where: { id: branchId, project: { id: projectId } },
    });
    if (!branch) {
      throw new NotFoundException(
        `Branch with ID ${branchId} not found in this project`
      );
    }
  }

  if (productId) {
    const product = await this.productRepo.findOne({
      where: { id: productId, project: { id: projectId } },
    });
    if (!product) {
      throw new NotFoundException(
        `Product with ID ${productId} not found in this project`
      );
    }
  }

  /* ===================== QUERY ===================== */

  const where: any = {
    quantity: LessThanOrEqual(threshold),
    product: {
      project: { id: projectId }, // 🔐 PROJECT ENFORCED HERE
    },
  };

  if (branchId) {
    where.branch = { id: branchId };
  }

  if (productId) {
    where.product.id = productId;
  }

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
    project:projectId,
    items,
    count: items.length,
  };
}

async getOutOfStockAggregated(
  opts: { branchId?: string; threshold?: number ,projectId},
): Promise<OutOfStockResponse> {

  const { branchId, threshold = 0 ,projectId} = opts;

  /* ===================== VALIDATION ===================== */

  if (branchId) {
    const branch = await this.branchRepo.findOne({
      where: { id: branchId, project: { id: projectId } },
    });

    if (!branch) {
      throw new NotFoundException(
        `Branch with ID ${branchId} not found in this project`
      );
    }
  }

  /* ===================== AGGREGATION QUERY ===================== */

  const qb = this.productRepo
    .createQueryBuilder('product')
    .leftJoin('product.stock', 'stock')
    .leftJoin('stock.branch', 'branch')
    .where('product.project_id = :projectId', { projectId }) // 🔐 PROJECT ENFORCED
    .select('product.id', 'product_id')
    .addSelect('product.name', 'product_name')
    .addSelect('COALESCE(SUM(stock.quantity), 0)', 'total_qty')
    .groupBy('product.id')
    .addGroupBy('product.name')
    .having('COALESCE(SUM(stock.quantity), 0) <= :thr', { thr: threshold })
    .orderBy('total_qty', 'ASC');

  if (branchId) {
    qb.andWhere('branch.id = :branchId', { branchId });
  }

  const rows = await qb.getRawMany(); // [{ product_id, product_name, total_qty }]

  if (rows.length === 0) {
    return {
      mode: 'aggregate',
      threshold,
      branchId,
      project:projectId,
      items: [],
      count: 0,
    };
  }

  /* ===================== LOAD FULL PRODUCTS ===================== */

  const productIds = rows.map(r => r.product_id);

  const products = await this.productRepo.find({
    where: {
      id: In(productIds),
      project: { id: projectId }, // 🔐 SAFETY NET
    },
    relations: ['stock', 'stock.branch'],
  });

  const byId = new Map(products.map(p => [p.id, p]));

  const items = rows.map(r => {
    const product = byId.get(r.product_id)!;

    const productScoped = branchId
      ? {
          ...product,
          stock: (product.stock ?? []).filter(
            (s: any) => s.branch?.id === branchId
          ),
        }
      : product;

    return {
      product: productScoped,
      branch: null,
      quantity: Number(r.total_qty),
    };
  });

  return {
    mode: 'aggregate',
    threshold,
    branchId,
    project:projectId,
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


    await this.stockRepo.delete(id);

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
// Add these methods to your StockService class

// Mobile - Get stocks by user's branch
async getStocksByUserBranchMobile(
  userId: string,
  branchId:string,
  search?: string,
  page: any = 1,
  limit: any = 10,
  sortBy?: string,
  sortOrder: 'ASC' | 'DESC' = 'DESC',
  filters?: any
) {
  const pageNumber = Number(page) || 1;
  const limitNumber = Number(limit) || 10;
  const skip = (pageNumber - 1) * limitNumber;

  // Get user with branch info
  const user = await this.userRepo.findOne({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundException('User not found');
  }
const branch = await this.branchRepo.findOne({
  where:{id:branchId}
})

if (!branch) {
  throw new NotFoundException('Branch not found');
}
  // Create query builder with all needed relations
  const qb = this.stockRepo.createQueryBuilder('stock')
    .leftJoinAndSelect('stock.product', 'product')
    .leftJoinAndSelect('product.brand', 'brand')
    .leftJoinAndSelect('product.category', 'category')
    .leftJoinAndSelect('stock.branch', 'branch')
    .select([
      'stock.id',
      'stock.quantity',
      'stock.created_at',
      'product.id',
      'product.name',
      'product.sku',
      'product.price',
      'product.discount',
      'brand.id',
      'brand.name',
      'category.id',
      'category.name',
      'branch.id',
      'branch.name',
      'branch.city'
    ])
    .where('branch.id = :branchId', { branchId })
    .skip(skip)
    .take(limitNumber);

  // Apply search if provided
  if (search) {
    qb.andWhere(
      new Brackets(subQb => {
        subQb.where('product.name ILIKE :search', { search: `%${search}%` })

      })
    );
  }

  // Apply additional filters
  if (filters) {
    const reservedKeys = ['page', 'limit', 'search', 'sortBy', 'sortOrder'];
    Object.entries(filters).forEach(([key, value]) => {
      if (reservedKeys.includes(key)) return;
      if (value !== null && value !== undefined && value !== '') {
        if (key.includes('.')) {
          const [relation, field] = key.split('.');
          qb.andWhere(`${relation}.${field} = :${key.replace('.', '_')}`, {
            [key.replace('.', '_')]: value
          });
        } else {
          qb.andWhere(`stock.${key} = :${key}`, { [key]: value });
        }
      }
    });
  }

  // Apply sorting
  const sortField = sortBy || 'stock.created_at';
  qb.orderBy(sortField, sortOrder);

  const [records, total_records] = await qb.getManyAndCount();

  // Transform the data to match optimized structure
  const optimizedRecords = records.map(stock => {
    const productPrice = stock.product?.price || 0;
    const discount = stock.product?.discount || 0;

    return {
      id: stock.id,
      quantity: stock.quantity,
      created_at: stock.created_at,
      product: {
        id: stock.product?.id || null,
        name: stock.product?.name || null,
        sku: stock.product?.sku || null,
        price: productPrice,
        discount: discount,
        unit_amount: productPrice,
        total_amount: productPrice * stock.quantity,
        discounted_amount: (productPrice - discount) * stock.quantity,
        brand_name: stock.product?.brand?.name || null,
        category_name: stock.product?.category?.name || null
      }
    };
  });

  return {
    total_records,
    current_page: pageNumber,
    per_page: limitNumber,
    branch: {
      id: branch.id,
      name: branch.name,
      city: branch.city
    },
    user: {
      id: user.id,
      name: user.name
    },
    records: optimizedRecords
  };
}

// Mobile - Create stock for user's branch
async createStockMobile(
  userId: string,
  createStockDto: CreateStockDto
) {
  const { product_id, branch_id, quantity } = createStockDto;

  // ─────────────────────────────────────────────
  // Validate User
  // ─────────────────────────────────────────────
  const user = await this.userRepo.findOne({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundException('User not found');
  }

  // ─────────────────────────────────────────────
  // Validate Branch
  // ─────────────────────────────────────────────
  const branch = await this.branchRepo.findOne({
    where: { id: branch_id },
  });

  if (!branch) {
    throw new NotFoundException('Branch not found');
  }

  // ─────────────────────────────────────────────
  // Validate Quantity
  // ─────────────────────────────────────────────
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new BadRequestException('Quantity must be an integer >= 0');
  }

  // ─────────────────────────────────────────────
  // Validate Product
  // ─────────────────────────────────────────────
  const product = await this.productRepo.findOne({
    where: { id: product_id },
    relations: ['brand', 'category'],
  });

  if (!product) {
    throw new NotFoundException(`Product with ID ${product_id} not found`);
  }

  // ─────────────────────────────────────────────
  // Check & Update Existing Stock
  // ─────────────────────────────────────────────
  const existingStock = await this.stockRepo.findOne({
    where: {
      product_id,
      branch_id
    },
    withDeleted: true,
    relations: ['product', 'branch', 'product.brand', 'product.category'],
  });

  let stock: Stock;

  if (existingStock) {
    existingStock.deleted_at = null
    existingStock.quantity += quantity;
    stock = await this.stockRepo.save(existingStock);
  } else {
    stock = this.stockRepo.create({
      quantity,
      product,
      branch,
      product_id,
      branch_id,
    });

    stock = await this.stockRepo.save(stock);

    // Reload with all relations
    stock = await this.stockRepo.findOne({
      where: { id: stock.id },
      relations: ['product', 'branch', 'product.brand', 'product.category'],
    });
  }

  // ─────────────────────────────────────────────
  // Calculate Price Fields
  // ─────────────────────────────────────────────
  const productPrice = product.price || 0;
  const discount = product.discount || 0;

  const unitAmount = productPrice;
  const totalAmount = productPrice * stock.quantity;
  const discountedAmount = (productPrice - discount) * stock.quantity;

  // ─────────────────────────────────────────────
  // Response DTO
  // ─────────────────────────────────────────────
  return {
    message: existingStock ? 'Stock updated successfully' : 'Stock created successfully',
    total_records: 1,
    current_page: 1,
    per_page: 1,

    branch: {
      id: branch.id,
      name: branch.name,
      city: branch.city,
    },

    user: {
      id: user.id,
      name: user.name,
    },

    records: [
      {
        id: stock.id,
        quantity: stock.quantity,
        created_at: stock.created_at,

        product: {
          id: product.id,
          name: product.name,
          sku: product.sku,
          price: productPrice,
          discount,
          unit_amount: unitAmount,
          total_amount: totalAmount,
          discounted_amount: discountedAmount,
          brand_name: product.brand?.name || null,
          category_name: product.category?.name || null,
        },
      },
    ],
  };
}


// Mobile - Update stock for user's branch
async updateStockMobile(
  userId: string,
  stockId: string,
  updateStockDto: UpdateStockDto
) {
  // Get user with branch info
  const user = await this.userRepo.findOne({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundException('User not found');
  }


  // Get stock with relations
  const stock = await this.stockRepo.findOne({
    where: { id: stockId },
    relations: ['product', 'branch', 'product.brand', 'product.category']
  });

  if (!stock) {
    throw new NotFoundException('Stock not found');
  }


  // Validate quantity if provided
  if (typeof updateStockDto.quantity === 'number') {
    if (!Number.isInteger(updateStockDto.quantity) || updateStockDto.quantity < 0) {
      throw new BadRequestException('Quantity must be an integer >= 0');
    }
    stock.quantity = updateStockDto.quantity;
  }

  // Update product if provided
  if (updateStockDto.product_id) {
    const product = await this.productRepo.findOne({
      where: { id: updateStockDto.product_id },
      relations: ['brand', 'category'],
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${updateStockDto.product_id} not found`);
    }

    stock.product = product;
    stock.product_id = product.id;
  }

  const updatedStock = await this.stockRepo.save(stock);

  // Transform response to match optimized structure
  const productPrice = updatedStock.product?.price || 0;
  const discount = updatedStock.product?.discount || 0;

  return {
    message: 'Stock updated successfully',
    total_records: 1,
    current_page: 1,
    per_page: 1,
    branch: {
      id:  updatedStock.branch.id,
      name: updatedStock.branch.name,
      city:updatedStock.branch.city,
    },
    user: {
      id: user.id,
      name: user.name
    },
    records: [{
      id: updatedStock.id,
      quantity: updatedStock.quantity,
      created_at: updatedStock.created_at,
      product: {
        id: updatedStock.product?.id || null,
        name: updatedStock.product?.name || null,
        sku: updatedStock.product?.sku || null,
        price: productPrice,
        discount: discount,
        unit_amount: productPrice,
        total_amount: productPrice * updatedStock.quantity,
        discounted_amount: (productPrice - discount) * updatedStock.quantity,
        brand_name: updatedStock.product?.brand?.name || null,
        category_name: updatedStock.product?.category?.name || null
      }
    }]
  };
}

// Mobile - Delete stock from user's branch
async deleteStockMobile(
  userId: string,
  stockId: string
) {
  // Get user with branch info
  const user = await this.userRepo.findOne({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundException('User not found');
  }



  // Get stock with relations
  const stock = await this.stockRepo.findOne({
    where: { id: stockId },
    relations: ['product', 'branch', 'product.brand', 'product.category']
  });

  if (!stock) {
    throw new NotFoundException('Stock not found');
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

  // Store stock data for response before deletion
  const stockData = {
    id: stock.id,
    quantity: stock.quantity,
    created_at: stock.created_at,
    product: {
      id: stock.product?.id || null,
      name: stock.product?.name || null,
      sku: stock.product?.sku || null,
      price: stock.product?.price || 0,
      discount: stock.product?.discount || 0,
      unit_amount: stock.product?.price || 0,
      total_amount: (stock.product?.price || 0) * stock.quantity,
      discounted_amount: ((stock.product?.price || 0) - (stock.product?.discount || 0)) * stock.quantity,
      brand_name: stock.product?.brand?.name || null,
      category_name: stock.product?.category?.name || null
    }
  };

  // Soft delete the stock
  await this.stockRepo.delete(stockId);

  return {
    message: 'Stock deleted successfully',
    total_records: 1,
    current_page: 1,
    per_page: 1,
    branch: {
      id: stock.branch.id,
      name: stock.branch.name,
      city: stock.branch.city
    },
    user: {
      id: user.id,
      name: user.name
    },
    records: [stockData]
  };
}

async getOutOfStockByUserBranchMobile(
  userId: string,
  branchId:string,
  threshold: number = 0,
  search?: string,
  page: any = 1,
  limit: any = 10,
  sortBy?: string,
  sortOrder: 'ASC' | 'DESC' = 'DESC',
  filters?: any
) {
  const pageNumber = Number(page) || 1;
  const limitNumber = Number(limit) || 10;
  const skip = (pageNumber - 1) * limitNumber;

  // Get user with branch info
  const user = await this.userRepo.findOne({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundException('User not found');
  }
  const branch = await this.branchRepo.findOne({
    where:{id:branchId}
  })

  if (!branch) {
    throw new NotFoundException('Branch not found');
  }


  // Create query builder for out-of-stock items
  const qb = this.stockRepo.createQueryBuilder('stock')
    .leftJoinAndSelect('stock.product', 'product')
    .leftJoinAndSelect('product.brand', 'brand')
    .leftJoinAndSelect('product.category', 'category')
    .leftJoinAndSelect('stock.branch', 'branch')
    .select([
      'stock.id',
      'stock.quantity',
      'stock.created_at',
      'product.id',
      'product.name',
      'product.sku',
      'product.price',
      'product.discount',
      'brand.id',
      'brand.name',
      'category.id',
      'category.name',
      'branch.id',
      'branch.name',
      'branch.city'
    ])
    .where('branch.id = :branchId', { branchId })
    .andWhere('stock.quantity <= :threshold', { threshold })
    .skip(skip)
    .take(limitNumber);

  // Apply search if provided
  if (search) {
    qb.andWhere(
      new Brackets(subQb => {
        subQb.where('product.name ILIKE :search', { search: `%${search}%` })

      })
    );
  }

  // Apply additional filters
  if (filters) {
    const reservedKeys = ['page', 'limit', 'search', 'sortBy', 'sortOrder', 'threshold'];
    Object.entries(filters).forEach(([key, value]) => {
      if (reservedKeys.includes(key)) return;
      if (value !== null && value !== undefined && value !== '') {
        if (key.includes('.')) {
          const [relation, field] = key.split('.');
          qb.andWhere(`${relation}.${field} = :${key.replace('.', '_')}`, {
            [key.replace('.', '_')]: value
          });
        } else {
          qb.andWhere(`stock.${key} = :${key}`, { [key]: value });
        }
      }
    });
  }

  // Apply sorting
  const sortField = sortBy || 'stock.quantity';
  qb.orderBy(sortField, sortOrder);

  const [records, total_records] = await qb.getManyAndCount();

  // Transform the data to match optimized structure
  const optimizedRecords = records.map(stock => {
    const productPrice = stock.product?.price || 0;
    const discount = stock.product?.discount || 0;

    return {
      id: stock.id,
      quantity: stock.quantity,
      created_at: stock.created_at,
      is_out_of_stock: stock.quantity <= threshold,
      threshold: threshold,
      product: {
        id: stock.product?.id || null,
        name: stock.product?.name || null,
        sku: stock.product?.sku || null,
        price: productPrice,
        discount: discount,
        unit_amount: productPrice,
        total_amount: productPrice * stock.quantity,
        discounted_amount: (productPrice - discount) * stock.quantity,
        brand_name: stock.product?.brand?.name || null,
        category_name: stock.product?.category?.name || null
      }
    };
  });

  return {
    total_records,
    current_page: pageNumber,
    per_page: limitNumber,
    threshold: threshold,
    branch: {
      id: branch.id,
      name: branch.name,
      city: branch.city
    },
    user: {
      id: user.id,
      name: user.name
    },
    records: optimizedRecords
  };
}
}