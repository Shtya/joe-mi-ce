import { Entity, Column, ManyToOne, OneToMany, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { Country } from './country.entity';
import { CoreEntity } from 'entities/core.entity';
import { City } from './city.entity';

@Entity('regions')
export class Region {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @ManyToOne(() => Country, country => country.regions)
  country: Country;

  @OneToMany(() => City, city => city.region, { cascade: true })
  cities: City[];
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
