// product.entity.ts
import { Entity, Column, OneToMany, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { Stock } from './stock.entity';
import { Sale } from './sale.entity';
import { Brand } from './brand.entity';
import { Category } from './category.entity';
import { CoreEntity } from 'entities/core.entity';
import { Project } from 'entities/project.entity';
import { Audit } from 'entities/audit.entity';

@Entity('products')
@Index(['brand', 'category'])
@Unique(['name', 'project'])
export class Product extends CoreEntity {
  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  discount: number; // ✅ نسبة الخصم من 0 إلى 100

  @Column({ nullable: true })
  model: string;

  @Column({ nullable: true })
  sku: string;

  @Column({ nullable: true })
  image_url: string;

  @Column({ default: false })
  is_high_priority: boolean;

  @Column({ default: true })
  is_active: boolean;

  @ManyToOne(() => Project, project => project.products)
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @ManyToOne(() => Brand, brand => brand.products)
  @JoinColumn({ name: 'brand_id' })
  brand: Brand;

  @ManyToOne(() => Category, category => category.products)
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @OneToMany(() => Stock, stock => stock.product)
  stock: Stock[];

  @OneToMany(() => Sale, sale => sale.product)
  sales: Sale[];

  @OneToMany(() => Audit, audit => audit.branch)
  audits: Audit[];
}
