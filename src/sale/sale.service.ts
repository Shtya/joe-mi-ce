import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateSaleDto } from 'dto/sale.dto';
import { User } from 'entities/user.entity';
import { Branch } from 'entities/branch.entity';
import { Sale } from 'entities/products/sale.entity';
import { Product } from 'entities/products/product.entity';
import { Stock } from 'entities/products/stock.entity';

@Injectable()
export class SaleService {
  constructor(
    @InjectRepository(Sale) public saleRepo: Repository<Sale>,
    @InjectRepository(Product) public productRepo: Repository<Product>,
    @InjectRepository(Stock) public stockRepo: Repository<Stock>,
    @InjectRepository(User) public userRepo: Repository<User>,
    @InjectRepository(Branch) public branchRepo: Repository<Branch>,
  ) {}

  async create(dto: CreateSaleDto) {
    const product = await this.productRepo.findOne({ where: { id: dto.productId }, relations: ['stock'] });
    if (!product) throw new NotFoundException('Product not found');

    const user = await this.userRepo.findOne({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('User not found');

    const branch = await this.branchRepo.findOne({ where: { id: dto.branchId }  , relations : ["project"]});
    if (!branch) throw new NotFoundException('Branch not found');

    const stock = await this.stockRepo.findOne({ where: { product: { id: product.id }, branch: { id: branch.id } } });
    if (!stock) throw new NotFoundException('Stock not found for this branch');

    if (stock.quantity < dto.quantity) {
      throw new BadRequestException('Not enough stock available');
    }

    stock.quantity -= dto.quantity;
    await this.stockRepo.save(stock);

    const sale = this.saleRepo.create({
			projectId : branch.project.id ,
      price: dto.price,
      quantity: dto.quantity,
      total_amount: dto.price * dto.quantity,
      status: dto.status,
      product,
      user,
      branch,
    });

    return this.saleRepo.save(sale);
  }

  async cancelOrReturn(id: string) {
    const sale = await this.saleRepo.findOne({ where: { id }, relations: ['product', 'branch'] });
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

    stock.quantity += sale.quantity;
    await this.stockRepo.save(stock);

    sale.status = 'returned';
    await this.saleRepo.save(sale);

    return { message: 'Sale returned successfully', sale };
  }

}
