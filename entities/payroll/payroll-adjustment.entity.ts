import { CoreEntity } from "entities/core.entity";
import { User } from "entities/user.entity";
import { PayrollAdjustmentType } from "src/payroll/payroll.types";
import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { PayrollLine } from "./payroll-line.entity";

@Entity("payroll_adjustments")
@Index(["lineId", "type"])
export class PayrollAdjustment extends CoreEntity {
  @Column({ type: "uuid" }) lineId: string;
  @Column({ type: "enum", enum: PayrollAdjustmentType })
  type: PayrollAdjustmentType;
  @Column({ type: "decimal", precision: 12, scale: 2 }) amount: string;
  @Column({ type: "varchar", length: 255 }) reason: string;
  @Column({ type: "text", nullable: true }) note: string | null;
  @Column({ type: "uuid" }) createdById: string;

  @ManyToOne(() => PayrollLine, (line) => line.adjustments, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "lineId" })
  line: PayrollLine;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "createdById" })
  createdBy: User;
}
