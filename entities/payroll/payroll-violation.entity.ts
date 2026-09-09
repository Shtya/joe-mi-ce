import { CoreEntity } from "entities/core.entity";
import { Project } from "entities/project.entity";
import { User } from "entities/user.entity";
import {
  PayrollViolationEventType,
  ViolationAction,
} from "src/payroll/payroll.types";
import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";

@Entity("payroll_violations")
@Index(["projectId", "sourceJourneyId", "eventType", "ruleKey"], {
  unique: true,
})
@Index(["projectId", "userId", "ruleKey", "eventYear"])
export class PayrollViolation extends CoreEntity {
  @Column({ type: "uuid" }) projectId: string;
  @Column({ type: "uuid" }) userId: string;
  @Column({ type: "uuid" }) sourceJourneyId: string;
  @Column({ type: "date" }) eventDate: string;
  @Column({ type: "int" }) eventYear: number;
  @Column({ type: "enum", enum: PayrollViolationEventType })
  eventType: PayrollViolationEventType;
  @Column({ type: "varchar" }) ruleKey: string;
  @Column({ type: "int" }) ruleVersion: number;
  @Column({ type: "int" }) actualMinutes: number;
  @Column({ type: "int" }) annualOccurrence: number;
  @Column({ type: "jsonb" }) actionSnapshot: ViolationAction;
  @Column({ type: "jsonb" }) policySnapshot: Record<string, unknown>;
  @Column({ type: "decimal", precision: 12, scale: 2 }) deductionAmount: string;

  @ManyToOne(() => Project, { onDelete: "CASCADE" })
  @JoinColumn({ name: "projectId" })
  project: Project;
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
