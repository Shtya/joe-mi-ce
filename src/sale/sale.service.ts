// sale.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { CreateSaleDto, UpdateSaleDto } from 'dto/sale.dto';
import { User } from 'entities/user.entity';
import { Branch } from 'entities/branch.entity';
import { Sale } from 'entities/products/sale.entity';
import { Product } from 'entities/products/product.entity';
import { Stock } from 'entities/products/stock.entity';
import { SalesTarget, SalesTargetStatus } from 'entities/sales-target.entity';
import { CRUD } from 'common/crud.service';

@Injectable()
export class SaleService {
  constructor(
    @InjectRepository(Sale) public saleRepo: Repository<Sale>,
    @InjectRepository(Product) public productRepo: Repository<Product>,
    @InjectRepository(Stock) public stockRepo: Repository<Stock>,
    @InjectRepository(User) public userRepo: Repository<User>,
    @InjectRepository(Branch) public branchRepo: Repository<Branch>,
    @InjectRepository(SalesTarget) public salesTargetRepo: Repository<SalesTarget>,
  ) {}

  async create(dto: CreateSaleDto) {
    const product = await this.productRepo.findOne({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product not found');

    const user = await this.userRepo.findOne({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('User not found');

    const branch = await this.branchRepo.findOne({ where: { id: dto.branchId }, relations: ["project"] });
    if (!branch) throw new NotFoundException('Branch not found');


    const stock = await this.stockRepo.findOne({
      where: { product: { id: product.id }, branch: { id: branch.id } }
    });
    if (!stock) throw new NotFoundException('Stock not found for this branch');

    if (stock.quantity < dto.quantity) {
      throw new BadRequestException('Not enough stock available');
    }

const discount = product.discount ?? 0;
const totalAmount = dto.price * dto.quantity * (1 - discount / 100);

    // Update stock
    stock.quantity -= dto.quantity;
    await this.stockRepo.save(stock);

    // Create sale
    const sale = this.saleRepo.create({
      projectId: branch.project.id,
      price: dto.price,
      quantity: dto.quantity,
      total_amount: totalAmount,
      status: dto.status || 'completed',
      product,
      user,
      branch,
      userId: dto.userId,
      productId: dto.productId,

      branchId: dto.branchId,
    });

    const savedSale = await this.saleRepo.save(sale);

    // Update sales target progress
    await this.updateSalesTargetProgress(branch.id, totalAmount);

    return savedSale;
  }

  async update(id: string, dto: UpdateSaleDto) {
    const sale = await this.saleRepo.findOne({
      where: { id },
      relations: ['product', 'branch', 'user', 'product.brand', 'product.category']
    });

    if (!sale) throw new NotFoundException('Sale not found');

    if (sale.status === 'returned' || sale.status === 'cancelled') {
      throw new BadRequestException('Cannot update returned or cancelled sale');
    }

    const stock = await this.stockRepo.findOne({
      where: { product: { id: sale.product.id }, branch: { id: sale.branch.id } },
    });

    if (!stock) {
      throw new NotFoundException('Stock not found for this branch');
    }

    let stockAdjustment = 0;
    let amountAdjustment = 0;

    // Handle quantity changes
    if (dto.quantity !== undefined && dto.quantity !== sale.quantity) {
      const quantityDiff = dto.quantity - sale.quantity;

      if (quantityDiff > 0 && stock.quantity < quantityDiff) {
        throw new BadRequestException('Not enough stock available for quantity increase');
      }

      stockAdjustment = -quantityDiff; // Negative because we subtract from stock
    }

    // Handle price changes
    const oldTotalAmount = sale.total_amount;
    const newTotalAmount = dto.price !== undefined ? dto.price * (dto.quantity || sale.quantity) : oldTotalAmount;

    if (dto.price !== undefined || dto.quantity !== undefined) {
      amountAdjustment = newTotalAmount - oldTotalAmount;
    }

    // Update stock if quantity changed
    if (stockAdjustment !== 0) {
      stock.quantity += stockAdjustment;
      await this.stockRepo.save(stock);
    }

    // Update sale
    if (dto.price !== undefined) sale.price = dto.price;
    if (dto.quantity !== undefined) sale.quantity = dto.quantity;
    if (dto.status !== undefined) sale.status = dto.status;

    sale.total_amount = newTotalAmount;
    await this.saleRepo.save(sale);

    // Update sales target progress if amount changed
    if (amountAdjustment !== 0) {
      await this.updateSalesTargetProgress(sale.branch.id, amountAdjustment);
    }

    // Transform the response to match the get method structure
    const updatedSale = await this.saleRepo.findOne({
      where: { id },
      relations: ['product', 'branch', 'user', 'product.brand', 'product.category']
    });

    // Calculate product amounts
    const unitPrice = updatedSale.product?.price || 0;
    const quantity = updatedSale.quantity || 0;
    const discount = updatedSale.product?.discount || 0;

    // Format response to match findSalesByUserOptimized structure exactly
    return {
      total_records: 1,
      current_page: 1,
      per_page: 1,
      branch: updatedSale.branch ? {
        id: updatedSale.branch.id,
        name: updatedSale.branch.name,
        city: updatedSale.branch.city
      } : null,
      user: updatedSale.user ? {
        id: updatedSale.user.id,
        name: updatedSale.user.name
      } : null,
      records: [{
        id: updatedSale.id,
        quantity: quantity,
        total_amount: updatedSale.total_amount,
        created_at: updatedSale.created_at,
        status: updatedSale.status,
        discount: discount,
        product: {
          id: updatedSale.product?.id || null,
          name: updatedSale.product?.name || null,
          sku: updatedSale.product?.sku || null,
          price: unitPrice,
          // All three amount types matching the optimized structure
          unit_amount: unitPrice, // Unit price (same as product price)
          total_amount: unitPrice * quantity, // Total amount per product (price × quantity)
          discounted_amount: (unitPrice - discount) * quantity, // Discounted amount
          brand_name: updatedSale.product?.brand?.name || null,
          category_name: updatedSale.product?.category?.name || null
        }
        // Note: branch and user are removed from individual records as per optimized structure
      }]
    };
  }
  async delete(id: string) {
    const sale = await this.saleRepo.findOne({
      where: { id },
      relations: ['product', 'branch', 'user', 'product.brand', 'product.category']
    });

    if (!sale) throw new NotFoundException('Sale not found');

    if (sale.status === 'returned' || sale.status === 'cancelled') {
      throw new BadRequestException('Sale is already returned or cancelled');
    }

    const stock = await this.stockRepo.findOne({
      where: { product: { id: sale.product.id }, branch: { id: sale.branch.id } },
    });

    if (!stock) {
      throw new NotFoundException('Stock not found for this branch');
    }

    // Return quantity to stock
    stock.quantity += sale.quantity;
    await this.stockRepo.save(stock);

    // Update sales target progress
    await this.updateSalesTargetProgress(sale.branch.id, -sale.total_amount);

    // Transform the response to match the optimized structure before deletion
    const response = {
      total_records: 1,
      current_page: 1,
      per_page: 1,
      branch: sale.branch ? {
        id: sale.branch.id,
        name: sale.branch.name,
        city: sale.branch.city
      } : null,
      user: sale.user ? {
        id: sale.user.id,
        name: sale.user.name
      } : null,
      records: [{
        id: sale.id,
        quantity: sale.quantity,
        total_amount: sale.total_amount,
        created_at: sale.created_at,
        status: sale.status,
        discount: sale.product?.discount || 0,
        product: {
          id: sale.product?.id || null,
          name: sale.product?.name || null,
          sku: sale.product?.sku || null,
          price: sale.product?.price || 0,
          unit_amount: sale.product?.price || 0,
          total_amount: (sale.product?.price || 0) * sale.quantity,
          discounted_amount: ((sale.product?.price || 0) - (sale.product?.discount || 0)) * sale.quantity,
          brand_name: sale.product?.brand?.name || null,
          category_name: sale.product?.category?.name || null
        }
      }]
    };

    // Soft delete the sale after preparing response
    await this.saleRepo.softDelete(id);

    return response;
  }

  async cancelOrReturn(id: string) {
    const sale = await this.saleRepo.findOne({
      where: { id },
      relations: ['product', 'branch']
    });

    if (!sale) throw new NotFoundException('Sale not found');

    if (sale.status === 'cancelled' || sale.status === 'returned') {
      throw new BadRequestException('Sale is already cancelled or returned');
    }

    const stock = await this.stockRepo.findOne({
      where: { product: { id: sale.product.id }, branch: { id: sale.branch.id } },
    });

    if (!stock) {
      throw new NotFoundException('Stock not found for this branch to return quantity');
    }

    // Return quantity to stock
    stock.quantity += sale.quantity;
    await this.stockRepo.save(stock);

    // Update sale status
    sale.status = 'returned';
    await this.saleRepo.save(sale);

    // Deduct amount from sales target progress
    await this.updateSalesTargetProgress(sale.branch.id, -sale.total_amount);

    return { message: 'Sale returned successfully', sale };
  }

  async cancelSale(id: string) {
    const sale = await this.saleRepo.findOne({
      where: { id },
      relations: ['product', 'branch']
    });

    if (!sale) throw new NotFoundException('Sale not found');

    if (sale.status === 'cancelled' || sale.status === 'returned') {
      throw new BadRequestException('Sale is already cancelled or returned');
    }

    const stock = await this.stockRepo.findOne({
      where: { product: { id: sale.product.id }, branch: { id: sale.branch.id } },
    });

    if (!stock) {
      throw new NotFoundException('Stock not found for this branch');
    }

    // Return quantity to stock
    stock.quantity += sale.quantity;
    await this.stockRepo.save(stock);

    // Update sale status
    sale.status = 'cancelled';
    await this.saleRepo.save(sale);

    // Deduct amount from sales target progress
    await this.updateSalesTargetProgress(sale.branch.id, -sale.total_amount);

    return { message: 'Sale cancelled successfully', sale };
  }

  private async updateSalesTargetProgress(branchId: string, amount: number): Promise<void> {
    try {
      const currentTarget = await this.salesTargetRepo.findOne({
        where: {
          branch: { id: branchId },
          status: SalesTargetStatus.ACTIVE,
        },
      });

      if (currentTarget) {
        currentTarget.currentAmount = Number(currentTarget.currentAmount) + Number(amount);

        if (currentTarget.currentAmount < 0) {
          currentTarget.currentAmount = 0;
        }

        currentTarget.updateStatus();
        await this.salesTargetRepo.save(currentTarget);
      }
    } catch (error) {
      console.error('Failed to update sales target progress:', error);
    }
  }

  async getSalesWithTargetProgress(branchId: string, startDate?: Date, endDate?: Date) {
    const query = this.saleRepo
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.branch', 'branch')
      .leftJoinAndSelect('sale.product', 'product')
      .leftJoinAndSelect('sale.user', 'user')
      .where('branch.id = :branchId', { branchId })
      .andWhere('sale.status != :cancelled', { cancelled: 'cancelled' });

    if (startDate && endDate) {
      query.andWhere('sale.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    const sales = await query.getMany();

    const currentTarget = await this.salesTargetRepo.findOne({
      where: {
        branch: { id: branchId },
        status: SalesTargetStatus.ACTIVE,
      },
    });

    const totalSales = sales.reduce((sum, sale) => sum + sale.total_amount, 0);

    return {
      sales,
      currentTarget: currentTarget ? {
        id: currentTarget.id,
        name: currentTarget.name,
        targetAmount: currentTarget.targetAmount,
        currentAmount: currentTarget.currentAmount,
        progressPercentage: currentTarget.progressPercentage,
        remainingAmount: currentTarget.remainingAmount,
        startDate: currentTarget.startDate,
        endDate: currentTarget.endDate,
      } : null,
      periodSales: totalSales,
      period: startDate && endDate ? { startDate, endDate } : null,
    };
  }

  async getSalesPerformanceByBranch(branchId: string, period: 'day' | 'week' | 'month' | 'quarter' = 'month') {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;
    const branch = await this.branchRepo.find({where:{id:branchId}})
    if(!branch){
      throw new NotFoundException("the branch is not found")
    }
    switch (period) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - now.getDay());
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        break;
    }

    const sales = await this.saleRepo
      .createQueryBuilder('sale')
      .where('sale.branchId = :branchId', { branchId })
      .andWhere('sale.created_at BETWEEN :startDate AND :endDate', { startDate, endDate })
      .andWhere('sale.status != :status', { status: 'cancelled' })
      .select(['SUM(sale.total_amount) as totalSales', 'COUNT(sale.id) as totalTransactions'])
      .getRawOne();

      console.log(sales)
    const currentTarget = await this.salesTargetRepo.findOne({
      where: {
        branch: { id: branchId },
        status: SalesTargetStatus.ACTIVE,
      },
    });

    let dailyAverageRequired = 0;
    let daysRemaining = 0;

    if (currentTarget) {
      const today = new Date();
      const end = new Date(currentTarget.endDate);
      daysRemaining = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (daysRemaining > 0) {
        dailyAverageRequired = (currentTarget.targetAmount - currentTarget.currentAmount) / daysRemaining;
      }
    }

    return {
      period,
      startDate,
      endDate,
      totalSales: parseFloat(sales.totalSales) || 0,
      totalTransactions: parseInt(sales.totalTransactions) || 0,
      currentTarget: currentTarget ? {
        targetAmount: currentTarget.targetAmount,
        currentAmount: currentTarget.currentAmount,
        progressPercentage: currentTarget.progressPercentage,
        daysRemaining,
        dailyAverageRequired,
      } : null,
    };
  }

  async bulkCreateSales(salesData: CreateSaleDto[]): Promise<{ success: Sale[]; failures: any[] }> {
    const success: Sale[] = [];
    const failures: any[] = [];

    for (const saleData of salesData) {
      try {
        const sale = await this.create(saleData);
        success.push(sale);
      } catch (error) {
        failures.push({
          data: saleData,
          error: error.message,
        });
      }
    }

    return { success, failures };
  }

// sale.service.ts
// sale.service.ts
async getSalesSummaryByProduct(branchId: string, startDate?: Date, endDate?: Date) {
  const query = this.saleRepo
    .createQueryBuilder('sale')
    .leftJoinAndSelect('sale.product', 'product')
    .leftJoinAndSelect('product.brand', 'brand')
    .leftJoinAndSelect('product.category', 'category')
    .where('sale.branchId = :branchId', { branchId })
    .andWhere('sale.status != :status', { status: 'cancelled' });

  if (startDate && endDate) {
    query.andWhere('sale.createdAt BETWEEN :startDate AND :endDate', {
      startDate,
      endDate,
    });
  }

  const results = await query
    .select([
      'product.id as productId',
      'product.name as productName',
      'product.sku as productSku',
      'brand.name as brandName',
      'category.name as categoryName',
      'SUM(sale.quantity) as totalQuantity',
      'SUM(sale.total_amount) as totalRevenue',
      'AVG(sale.price) as averagePrice',
      'COUNT(sale.id) as totalSales',
    ])
    .groupBy('product.id, product.name, product.sku, brand.name, category.name')
    .orderBy('totalRevenue', 'DESC')
    .getRawMany();

  // Format the response with null handling
  const formattedResults = results.map(item => ({
    product_id: item.productid,
    product_name: item.productname,
    product_sku: item.productsku,
    brand_name: item.brandname || null, // Handle null brand
    category_name: item.categoryname || null, // Handle null category
    total_quantity: Number(item.totalquantity) || 0,
    total_revenue: Number(item.totalrevenue) || 0,
    average_price: Number(item.averageprice) || 0,
    total_sales: Number(item.totalsales) || 0,
  }));

  return formattedResults;
}
  async findSalesWithBrand(
    entityName: string,
    search?: string,
    page: any = 1,
    limit: any = 10,
    sortBy?: string,
    sortOrder: 'ASC' | 'DESC' = 'DESC',
    relations: string[] = [],
    searchFields: string[] = [],
    filters?: any
  ) {
    console.log(relations)
    const result = await CRUD.findAll2(
      this.saleRepo,
      entityName,
      search,
      page,
      limit,
      sortBy,
      sortOrder,
      relations,
      searchFields,
      filters
    );
    console.log(result)
    // Extract all product IDs from the sales
    const productIds = result.records
      .map(sale => sale.product?.id)
      .filter(id => id)
      .filter((id, index, array) => array.indexOf(id) === index); // Remove duplicates

    // Fetch products with their brands
    let productsWithBrands = [];
    if (productIds.length > 0) {
      productsWithBrands = await this.productRepo.find({
        where: { id: In(productIds) },
        relations: ['brand']
      });
    }

    // Create a map for quick lookup
    const productMap = new Map();
    productsWithBrands.forEach(product => {
      productMap.set(product.id, product);
    });

    // Enhance the sales records with brand information
    const enhancedRecords = result.records.map(sale => {
      if (sale.product && sale.product.id) {
        const productWithBrand = productMap.get(sale.product.id);
        if (productWithBrand) {
          return {
            ...sale,
            product: productWithBrand
          };
        }
      }
      return sale;
    });

    return {
      ...result,
      records: enhancedRecords
    };
  }

  // Also add a method for single sale with brand
  async findOneWithBrand(id: string) {
    const sale = await CRUD.findOne(this.saleRepo, 'sale', id, ['product', 'user', 'branch']);

    if (sale.product) {
      const productWithBrand = await this.productRepo.findOne({
        where: { id: sale.product.id },
        relations: ['brand']
      });
      return {
        ...sale,
        product: productWithBrand
      };
    }

    return sale;
  }
  // sale.service.ts
// sale.service.ts
// sale.service.ts
// sale.service.ts
async findSalesByUserOptimized(
  userId: string,
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

  // Create query builder with all needed relations including category
  const qb = this.saleRepo.createQueryBuilder('sale')
    .leftJoinAndSelect('sale.product', 'product')
    .leftJoinAndSelect('product.brand', 'brand')
    .leftJoinAndSelect('product.category', 'category')
    .leftJoinAndSelect('sale.branch', 'branch')
    .leftJoinAndSelect('sale.user', 'user')
    .select([
      'sale.id',
      'sale.quantity',
      'sale.total_amount',
      'sale.created_at',
      'sale.status',
      'product.id',
      'product.name',
      'product.sku',
      'product.price', // Add product price to calculate amounts
      'product.discount', // Added discount field if available
      'brand.id',
      'brand.name',
      'category.id',
      'category.name',
      'branch.id',
      'branch.name',
      'branch.city',
      'user.id',
      'user.name'
    ])
    .where('user.id = :userId', { userId })
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
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        if (key.includes('.')) {
          // Handle nested filters like branch.id, product.name, category.name, etc.
          const [relation, field] = key.split('.');
          qb.andWhere(`${relation}.${field} = :${key.replace('.', '_')}`, {
            [key.replace('.', '_')]: value
          });
        } else {
          qb.andWhere(`sale.${key} = :${key}`, { [key]: value });
        }
      }
    });
  }

  // Apply sorting
  const sortField = sortBy || 'sale.created_at';
  qb.orderBy(sortField, sortOrder);

  const [records, total_records] = await qb.getManyAndCount();

  // Extract branch and user info (they should be the same for all records)
  const branchInfo = records.length > 0 ? {
    id: records[0].branch?.id || null,
    name: records[0].branch?.name || null,
    city: records[0].branch?.city || null
  } : null;

  const userInfo = records.length > 0 ? {
    id: records[0].user?.id || null,
    name: records[0].user?.name || null
  } : null;

  // Transform the data - branch and user only appear once at the top level
  const optimizedRecords = records.map(sale => {
    const unitPrice = sale.product?.price || 0;
    const quantity = sale.quantity || 0;
    const discount = sale.product.discount || 0;

    return {
      id: sale.id,
      quantity: quantity,
      total_amount: sale.total_amount,
      created_at: sale.created_at,
      status: sale.status,
      discount: discount,
      product: {
        id: sale.product?.id || null,
        name: sale.product?.name || null,
        sku: sale.product?.sku || null,
        price: unitPrice,
        // All three amount types
        unit_amount: unitPrice, // Unit price (same as product price)
        total_amount: unitPrice * quantity, // Total amount per product (price × quantity)
        discounted_amount: (unitPrice - discount) * quantity, // Discounted amount
        brand_name: sale.product?.brand?.name || null,
        category_name: sale.product?.category?.name || null
      }
      // Remove branch and user from individual records
    };
  });

  return {
    total_records,
    current_page: pageNumber,
    per_page: limitNumber,
    branch: branchInfo, // Branch appears only once here
    user: userInfo,     // User appears only once here
    records: optimizedRecords
  };
}
}