import { CoreEntity } from "entities/core.entity";
import {
  PayrollViolationEventType,
  ViolationAction,
} from "src/payroll/payroll.types";
import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { PayrollLine } from "./payroll-line.entity";

@Entity("payroll_line_violations")
@Index(["lineId", "sourceViolationId"], { unique: true })
export class PayrollLineViolation extends CoreEntity {
  @Column({ type: "uuid" }) lineId: string;
  @Column({ type: "uuid" }) sourceViolationId: string;
  @Column({ type: "date" }) eventDate: string;
  @Column({ type: "enum", enum: PayrollViolationEventType })
  eventType: PayrollViolationEventType;
  @Column({ type: "varchar" }) ruleKey: string;
  @Column({ type: "int" }) occurrence: number;
  @Column({ type: "int" }) actualMinutes: number;
  @Column({ type: "jsonb" }) actionSnapshot: ViolationAction;
  @Column({ type: "jsonb" }) policySnapshot: Record<string, unknown>;
  @Column({ type: "decimal", precision: 12, scale: 2 }) deductionAmount: string;

  @ManyToOne(() => PayrollLine, (line) => line.violations, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "lineId" })
  line: PayrollLine;
}
