import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { CoreEntity } from './core.entity';

@Entity('static_pages')
export class StaticPage extends CoreEntity{

  @Column()
  type: string; // privacy-policy, terms-and-conditions, about-us

  @Column()
  url: string; // PDF URL
}
