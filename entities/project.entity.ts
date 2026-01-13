// project.entity.ts
import { Entity, Column, OneToMany, ManyToMany, JoinTable, ManyToOne, JoinColumn, OneToOne, BeforeInsert, BeforeUpdate } from 'typeorm';
import { CoreEntity } from './core.entity';
import { Branch } from './branch.entity';
import { User } from './user.entity';
import { Shift } from './employee/shift.entity';
import { Product } from './products/product.entity';
import { Competitor } from './competitor.entity';
import { Feedback } from './feedback.entity';
import { Brand } from './products/brand.entity';
import { Category } from './products/category.entity';

@Entity()
export class Project extends CoreEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  image_url: string;

  @Column({ default: true })
  is_active: boolean;

  @OneToMany(() => Product, product => product.project)
  products: Product[];
  @OneToMany(() => Brand, bra => bra.project)
  brands: Brand[];
  @OneToMany(() => Category, cat => cat.products)
  categories: Brand[];
  @OneToMany(() => Branch, branch => branch.project)
  branches: Branch[];

  @OneToMany(() => Shift, shift => shift.project)
  shifts: Shift[];

  @OneToOne(() => User, { eager: true })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @OneToMany(() => Competitor, competitor => competitor.project)
  competitors: Competitor[];

  @OneToMany(() => Feedback, fb => fb.project)
  feedbacks: Feedback[];
}
