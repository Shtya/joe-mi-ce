import { Entity, Column, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { CoreEntity } from './core.entity';
import { User } from './user.entity';
import { SurveyFeedback, SurveyFeedbackAnswer } from './survey-feedback.entity';

export enum SurveyQuestionType {
  TEXT = 'text',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  RATING = 'rating',
  IMAGE = 'image',
  DROPDOWN = 'dropdown',
}

@Entity()
export class Survey extends CoreEntity {
  @Column()
  name: string;

  @Column({ default: 'active' })
  status: 'active' | 'inactive';
  @OneToMany(() => SurveyFeedback, feedback => feedback.survey, { cascade: true })
  feedbacks: SurveyFeedback[];
  @OneToMany(() => SurveyQuestion, q => q.survey, { cascade: true, eager: true })
  questions: SurveyQuestion[];

  @Column({nullable : true , type : 'text'})
  userId: string;

	@Column({nullable : true})
	projectId : string 
}

@Entity()
export class SurveyQuestion extends CoreEntity {
  @Column()
  text: string;

  @Column({ type: 'enum', nullable: true, enum: SurveyQuestionType })
  type: SurveyQuestionType;

  // لأسئلة الـ DROPDOWN فقط
  @Column('jsonb', { nullable: true })
  options: string[] | null;

  @ManyToOne(() => Survey, survey => survey.questions)
  survey: Survey;

  @OneToMany(
    () => SurveyFeedbackAnswer,
    answer => answer.question,
    { cascade: false }
  )
  answers: SurveyFeedbackAnswer[];

}
