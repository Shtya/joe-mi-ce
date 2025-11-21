import { Entity, Column, ManyToOne, OneToMany } from 'typeorm';
import { CoreEntity } from './core.entity';
import { Survey, SurveyQuestion } from './survey.entity';
import { User } from './user.entity';
import { Branch } from './branch.entity';

@Entity()
export class SurveyFeedback extends CoreEntity {
  @ManyToOne(() => User, { eager: true })
  user: User;

  @ManyToOne(() => Branch, { eager: true })
  branch: Branch;

  @ManyToOne(() => Survey, { eager: true })
  survey: Survey;

  @OneToMany(() => SurveyFeedbackAnswer, ans => ans.feedback, { cascade: true, eager: true })
  answers: SurveyFeedbackAnswer[];
}

@Entity()
export class SurveyFeedbackAnswer extends CoreEntity {
  @ManyToOne(() => SurveyFeedback, feedback => feedback.answers)
  feedback: SurveyFeedback;

  @ManyToOne(() => SurveyQuestion, { eager: true })
  question: SurveyQuestion;

  // للـ IMAGE خزّن URL أو data:image Base64
  @Column('text', { nullable: true })
  answer: string;
}
