import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "entities/user.entity";
import { Project } from "entities/project.entity";

@Entity("vacation_balance_accounts")
export class VacationBalanceAccount {
  @PrimaryColumn("uuid", { name: "user_id" })
  userId: string;

  @Column("uuid", { name: "project_id" })
  projectId: string;

  @Column("date", { name: "joining_date" })
  joiningDate: string;

  @Column("date", { name: "period_start" })
  periodStart: string;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @ManyToOne(() => Project, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project: Project;
}
