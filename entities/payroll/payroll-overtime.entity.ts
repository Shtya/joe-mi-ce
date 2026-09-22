import { CoreEntity } from "entities/core.entity";
import { User } from "entities/user.entity";
import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { PayrollLine } from "./payroll-line.entity";
import { PayrollPeriod } from "./payroll-period.entity";

@Entity("payroll_overtimes")
@Index(["sourceJourneyId"], { unique: true })
export class PayrollOvertime extends CoreEntity {
  @Column({ type: "uuid" }) projectId: string;
  @Column({ type: "uuid" }) periodId: string;
  @Column({ type: "uuid" }) lineId: string;
  @Column({ type: "uuid" }) userId: string;
  @Column({ type: "uuid" }) sourceJourneyId: string;
  @Column({ type: "date" }) workDate: string;
  @Column({ type: "int" }) scheduledShiftMinutes: number;
  @Column({ type: "int" }) overtimeMinutes: number;
  @Column({ type: "decimal", precision: 12, scale: 2 }) salarySnapshot: string;
  @Column({ type: "decimal", precision: 12, scale: 2 })
  hourlyRateSnapshot: string;
  @Column({ type: "decimal", precision: 12, scale: 2 }) amount: string;

  @ManyToOne(() => PayrollPeriod, { onDelete: "CASCADE" })
  @JoinColumn({ name: "periodId" })
  period: PayrollPeriod;
  @ManyToOne(() => PayrollLine, (line) => line.overtime, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "lineId" })
  line: PayrollLine;
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
