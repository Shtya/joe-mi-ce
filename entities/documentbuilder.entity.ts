import { Column, Entity, ManyToOne, OneToMany } from "typeorm";
import { CoreEntity } from './core.entity';


@Entity('task_fields')
export class TaskField extends CoreEntity{
    @Column()
    name: string;
    @Column()
    label: string;
    @Column()
    type: string;
    

}

@Entity('document_builders')
export class DocumentBuilder extends CoreEntity {
    @Column({ type: 'jsonb' })
    paperSize: { width: number; height: number };

    @Column({ type: 'timestamp', nullable: true })
    timestamp: Date;

    @Column({ type: 'jsonb', nullable: true })
    taskData: any;

    @Column({ default: false })
    isMain: boolean;

    @OneToMany(() => DocumentElement, (element) => element.documentBuilder, { cascade: true })
    elements: DocumentElement[];
}

@Entity('document_elements')
export class DocumentElement extends CoreEntity {
    @Column()
    type: string;

    @Column('float')
    x: number;

    @Column('float')
    y: number;

    @Column('float')
    width: number;

    @Column('float')
    height: number;

    @Column('float')
    rotation: number;

    @Column({ nullable: true })
    content: string;

    @Column({ nullable: true })
    fieldKey: string;

    @Column({ nullable: true })
    fieldDisplayType: string;

    @Column({ type: 'jsonb', nullable: true })
    fieldLabelStyle: any;

    @Column({ type: 'jsonb', nullable: true })
    fieldValueStyle: any;

    @Column({ nullable: true })
    imageUrl: string;

    @Column({ type: 'jsonb', nullable: true })
    tableData: any;

    @Column({ nullable: true })
    lineStyle: string;

    @Column({ nullable: true })
    lineOrientation: string;

    @Column({ type: 'float', nullable: true })
    lineWidth: number;

    @ManyToOne(() => DocumentBuilder, (doc) => doc.elements, { onDelete: 'CASCADE' })
    documentBuilder: DocumentBuilder;
}
