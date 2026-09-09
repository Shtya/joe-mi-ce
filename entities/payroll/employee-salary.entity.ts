import { CoreEntity } from "entities/core.entity";
import { Project } from "entities/project.entity";
import { User } from "entities/user.entity";
import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";

@Entity("employee_salaries")
@Index(["projectId", "userId", "effectiveFrom"], { unique: true })
export class EmployeeSalary extends CoreEntity {
  @Column({ type: "uuid" }) projectId: string;
  @Column({ type: "uuid" }) userId: string;
  @Column({ type: "decimal", precision: 12, scale: 2 }) monthlySalary: string;
  @Column({ type: "date" }) effectiveFrom: string;
  @Column({ type: "date", nullable: true }) effectiveTo: string | null;
  @Column({ type: "varchar", nullable: true }) importFileName: string | null;
  @Column({ type: "varchar", nullable: true }) importSheetName: string | null;
  @Column({ type: "int", nullable: true }) importRowNumber: number | null;
  @Column({ type: "uuid", nullable: true }) updatedById: string | null;

  @ManyToOne(() => Project, { onDelete: "CASCADE" })
  @JoinColumn({ name: "projectId" })
  project: Project;
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
