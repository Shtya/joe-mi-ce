import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { RecoveryReportType, RecoverySummary } from "./recovery.types";

export type RecoveryJobStatus = "pending" | "running" | "completed" | "failed";

@Entity("recovery_jobs")
export class RecoveryJob {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", nullable: false })
  type: RecoveryReportType;

  @Column({ type: "varchar", nullable: false })
  projectName: string;

  @Column({ type: "boolean", nullable: false })
  dryRun: boolean;

  @Column({ type: "varchar", nullable: true })
  saleDate: string | null;

  @Column({
    type: "enum",
    enum: ["pending", "running", "completed", "failed"],
    default: "pending",
  })
  status: RecoveryJobStatus;

  @Column({ type: "jsonb", nullable: true })
  summary: RecoverySummary | null;

  @Column({ type: "jsonb", nullable: true })
  rows: Record<string, any>[] | null;

  @Column({ type: "jsonb", nullable: true })
  project: { id: string; name: string } | null;

  @Column({ type: "text", nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}
