import { User } from 'entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { CoreEntity } from './core.entity';


@Entity('assets')
export class Asset extends CoreEntity {
 
  @Column()
  filename: string;

  @Column()
  url: string;

  @Column({nullable : true , default : "other"})
  type: string;

  @Column()
  category: string;

  @Column({ nullable: true })
  mimeType: string;

  @Column({ nullable: true })
  size: number; 

  @ManyToOne(() => User, user => user.assets, { eager: false, onDelete: 'SET NULL' })
  user: User;

}
