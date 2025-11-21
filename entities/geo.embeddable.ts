// geo.embeddable.ts
import {   Column, Entity } from 'typeorm';

@Entity()
export class GeoLocation {
  @Column('decimal', { precision: 9, scale: 6 })
  lat: number;

  @Column('decimal', { precision: 9, scale: 6 })
  lng: number;
}