import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateProductDto, StockDto, UpdateProductDto } from 'dto/product.dto';
import { Branch } from 'entities/branch.entity';
import { Brand } from 'entities/products/brand.entity';
import { Category } from 'entities/products/category.entity';
import { Product } from 'entities/products/product.entity';
import { Project } from 'entities/project.entity';
import { Stock } from 'entities/products/stock.entity';
import { Brackets, ILike, Repository } from 'typeorm';
import { ProductFilterQueryDto } from 'dto/product-filters.dto';
import { CRUD } from 'common/crud.service';
import { PaginationQueryDto } from 'dto/pagination.dto';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    public productRepository: Repository<Product>,
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
  ) {}

 
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

  async findOne(id: string) {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['brand', 'category', 'stock', 'project'],
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id);

    if (dto.brand_id) {
      const brand = await this.brandRepository.findOne({ where: { id: dto.brand_id } });
      if (!brand) throw new NotFoundException(`Brand with ID ${dto.brand_id} not found`);
      product.brand = brand;
    }

    if (dto.category_id) {
      const category = await this.categoryRepository.findOne({ where: { id: dto.category_id } });
      if (!category) throw new NotFoundException(`Category with ID ${dto.category_id} not found`);
      product.category = category;
    }

    // 🔐 Check uniqueness before updating name
    if (dto.name && dto.name !== product.name) {
      const exists = await this.productRepository.findOne({
        where: {
          name: dto.name,
          project: { id: product.project.id },
        },
      });
      if (exists && exists.id !== product.id) {
        throw new ConflictException(`Another product with name "${dto.name}" already exists in this project`);
      }
    }

    this.productRepository.merge(product, dto);
    return this.productRepository.save(product);
  }

  async remove(id: string): Promise<void> {
    const product = await this.findOne(id);
    await this.productRepository.remove(product);
  }
  async findAllForMobile(query: PaginationQueryDto, categoryId: string, brandId: string) {
    const where: any = {};
  
    const { search, sortBy = 'name', sortOrder = 'ASC' } = query;
  
    const findOptions: any = {
      where,
      select: ['id', 'name', 'price', 'image_url'],
      order: { [sortBy]: sortOrder },
    };
  
    if (search) {
      where.name = ILike(`%${search}%`);
    }
      where.category = { id: categoryId };
      where.brand = {id:brandId}
      

    try {
      const products = await this.productRepository.find(findOptions);
  
      return {
        success: true,
        data: products,
      };
    } catch (error) {
      console.error('Error in findAllForMobile:', error);
      return {
        success: false,
        message: 'Failed to fetch products',
        data: []
      };
    }
  }
}
