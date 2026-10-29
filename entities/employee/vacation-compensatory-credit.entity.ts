import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { CoreEntity } from "entities/core.entity";
import { User } from "entities/user.entity";
import { VacationBalanceAccount } from "./vacation-balance-account.entity";

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

  @ManyToOne(() => VacationBalanceAccount, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  account: VacationBalanceAccount;

  @ManyToOne(() => User)
  @JoinColumn({ name: "granted_by" })
  grantedBy: User;
}
