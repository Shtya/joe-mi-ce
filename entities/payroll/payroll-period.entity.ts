import { CoreEntity } from "entities/core.entity";
import { Project } from "entities/project.entity";
import { PayrollPeriodStatus } from "src/payroll/payroll.types";
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { PayrollLine } from "./payroll-line.entity";

@Entity("payroll_periods")
@Index(["projectId", "month"], { unique: true })
export class PayrollPeriod extends CoreEntity {
  @Column({ type: "uuid" }) projectId: string;
  @Column({ type: "char", length: 7 }) month: string;
  @Column({ type: "date" }) startDate: string;
  @Column({ type: "date" }) endDate: string;
  @Column({
    type: "enum",
    enum: PayrollPeriodStatus,
    default: PayrollPeriodStatus.PENDING,
  })
  status: PayrollPeriodStatus;
  @Column({ type: "timestamptz" }) generatedAt: Date;
  @Column({ type: "uuid", nullable: true }) generatedById: string | null;
  @Column({ type: "timestamptz", nullable: true }) paidAt: Date | null;
  @Column({ type: "uuid", nullable: true }) paidById: string | null;

  @ManyToOne(() => Project, { onDelete: "CASCADE" })
  @JoinColumn({ name: "projectId" })
  project: Project;
  @OneToMany(() => PayrollLine, (line) => line.period) lines: PayrollLine[];
}
