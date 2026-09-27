import { CoreEntity } from "entities/core.entity";
import { Project } from "entities/project.entity";
import { User } from "entities/user.entity";
import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { PayrollPeriod } from "./payroll-period.entity";
import type {
  TimeSheetAttendanceKind,
  TimeSheetSymbol,
} from "src/payroll/payroll-timesheet";

@Entity("payroll_timesheet_overrides")
@Index(["periodId", "userId", "workDate"], { unique: true })
export class PayrollTimeSheetOverride extends CoreEntity {
  @Column({ type: "uuid" }) projectId: string;
  @Column({ type: "uuid" }) periodId: string;
  @Column({ type: "uuid" }) userId: string;
  @Column({ type: "date" }) workDate: string;
  @Column({ type: "varchar", length: 1 }) symbol: TimeSheetSymbol;
  @Column({ type: "numeric", precision: 5, scale: 2, default: 0 })
  paidShiftUnits: string;
  @Column({ type: "varchar", length: 20, default: "present" })
  attendanceKind: TimeSheetAttendanceKind;
  @Column({ type: "uuid" }) updatedById: string;

  @ManyToOne(() => Project, { onDelete: "CASCADE" })
  @JoinColumn({ name: "projectId" })
  project: Project;
  @ManyToOne(() => PayrollPeriod, { onDelete: "CASCADE" })
  @JoinColumn({ name: "periodId" })
  period: PayrollPeriod;
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
  @ManyToOne(() => User)
  @JoinColumn({ name: "updatedById" })
  updatedBy: User;
}
