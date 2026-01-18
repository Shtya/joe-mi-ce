import { Column, Entity } from "typeorm";
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
