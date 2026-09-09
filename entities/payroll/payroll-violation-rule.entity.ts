import { CoreEntity } from "entities/core.entity";
import { Project } from "entities/project.entity";
import {
  DefaultViolationRule,
  PayrollViolationEventType,
  ViolationAction,
} from "src/payroll/payroll.types";
import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";

@Entity("payroll_violation_rules")
@Index(["projectId", "ruleKey", "version"], { unique: true })
export class PayrollViolationRule extends CoreEntity {
  @Column({ type: "uuid" }) projectId: string;
  @Column({ type: "varchar", length: 100 }) ruleKey: string;
  @Column({ type: "int", default: 1 }) version: number;
  @Column({ type: "boolean", default: true }) enabled: boolean;
  @Column({ type: "int" }) sortOrder: number;
  @Column({ type: "enum", enum: PayrollViolationEventType })
  eventType: PayrollViolationEventType;
  @Column({ type: "int" }) minimumMinutes: number;
  @Column({ type: "int", nullable: true }) maximumMinutes: number | null;
  @Column({ type: "boolean", nullable: true }) blocksOtherWorkers:
    | boolean
    | null;
  @Column({ type: "jsonb" }) actions: ViolationAction[];
  @Column({ type: "uuid", nullable: true }) updatedById: string | null;

  @ManyToOne(() => Project, { onDelete: "CASCADE" })
  @JoinColumn({ name: "projectId" })
  project: Project;

  toDomain(): DefaultViolationRule {
    return {
      ruleKey: this.ruleKey,
      eventType: this.eventType,
      minimumMinutes: this.minimumMinutes,
      maximumMinutes: this.maximumMinutes,
      blocksOtherWorkers: this.blocksOtherWorkers,
      actions: this.actions as unknown as DefaultViolationRule["actions"],
    };
  }
}
