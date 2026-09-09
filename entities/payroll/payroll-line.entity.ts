import { CoreEntity } from "entities/core.entity";
import { User } from "entities/user.entity";
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { PayrollPeriod } from "./payroll-period.entity";
import { PayrollLineViolation } from "./payroll-line-violation.entity";

@Entity("payroll_lines")
@Index(["periodId", "userId"], { unique: true })
export class PayrollLine extends CoreEntity {
  @Column({ type: "uuid" }) periodId: string;
  @Column({ type: "uuid" }) userId: string;
  @Column({ type: "decimal", precision: 12, scale: 2 }) salarySnapshot: string;
  @Column({ type: "decimal", precision: 12, scale: 2 }) grossSalary: string;
  @Column({ type: "decimal", precision: 12, scale: 2 }) totalDeduction: string;
  @Column({ type: "decimal", precision: 12, scale: 2 }) netPay: string;

  @ManyToOne(() => PayrollPeriod, (period) => period.lines, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "periodId" })
  period: PayrollPeriod;
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
  @OneToMany(() => PayrollLineViolation, (item) => item.line)
  violations: PayrollLineViolation[];
}
