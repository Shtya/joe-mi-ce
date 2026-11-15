import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { CoreEntity } from "entities/core.entity";
import { User } from "entities/user.entity";

@Entity("vacation_compensatory_credits")
export class VacationCompensatoryCredit extends CoreEntity {
  @Column("uuid", { name: "user_id" })
  userId: string;

  @Column("numeric", { precision: 10, scale: 4 })
  days: string;

  @Column("uuid", { name: "granted_by" })
  grantedById: string;

  @Column("text")
  reason: string;

  // Compensatory grants can exist before an annual balance account is opened.
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: "granted_by" })
  grantedBy: User;
}
