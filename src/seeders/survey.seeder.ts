import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Survey, SurveyQuestion, SurveyQuestionType } from '../../entities/survey.entity';
import { SurveyFeedback, SurveyFeedbackAnswer } from '../../entities/survey-feedback.entity';
import { User } from '../../entities/user.entity';
import { Project } from '../../entities/project.entity';
import { Branch } from '../../entities/branch.entity';

export const seedSurveys = async (dataSource: DataSource) => {
  const surveyRepository = dataSource.getRepository(Survey);
  const questionRepository = dataSource.getRepository(SurveyQuestion);
  const userRepository = dataSource.getRepository(User);
  const projectRepository = dataSource.getRepository(Project);

  console.log('🚀 Seeding surveys...');

  // Fetch a user and project to associate with the survey
  // Ideally, these should be specific admins or owners, but for seeding, we'll take the first available.
  const user = await userRepository.findOne({ where: {} });
  const project = await projectRepository.findOne({ where: {} });

  if (!user) {
    console.warn('⚠️ Skipping survey seeding: No users found. Please seed users first.');
    return;
  }
  if (!project) {
    console.warn('⚠️ Skipping survey seeding: No projects found. Please seed projects first.');
    return;
  }

  const surveysData = [
    {
      name: 'Customer Satisfaction Survey',
      status: 'active' as const,
      userId: user.id,
      projectId: project.id,
      questions: [
        {
          text: 'How satisfied are you with our service?',
          type: SurveyQuestionType.RATING,
          optional: false,
          options: null,
        },
        {
          text: 'What did you like the most?',
          type: SurveyQuestionType.TEXT,
          optional: true,
          options: null,
        },
        {
          text: 'Would you recommend us to a friend?',
          type: SurveyQuestionType.BOOLEAN,
          optional: false,
          options: null,
        },
      ],
    },
    {
      name: 'Product Preference Survey',
      status: 'active' as const,
      userId: user.id,
      projectId: project.id,
      questions: [
        {
          text: 'Which product category do you prefer?',
          type: SurveyQuestionType.DROPDOWN,
          optional: false,
          options: ['Electronics', 'Fashion', 'Home & Garden', 'Sports'],
        },
        {
          text: 'Upload a photo of your recent purchase',
          type: SurveyQuestionType.IMAGE,
          optional: true,
          options: null,
        },
      ],
    },
  ];

  for (const sData of surveysData) {
    // Check if survey already exists to avoid duplicates
    const existingSurvey = await surveyRepository.findOne({ where: { name: sData.name } });
    if (existingSurvey) {
      console.log(`ℹ️ Survey "${sData.name}" already exists. Skipping.`);
      continue;
    }

    const survey = surveyRepository.create({
      name: sData.name,
      status: sData.status,
      userId: sData.userId,
      projectId: sData.projectId,
    });

    const savedSurvey = await surveyRepository.save(survey);

    const questions = sData.questions.map(q =>
      questionRepository.create({
        text: q.text,
        type: q.type,
        optional: q.optional,
        options: q.options,
        survey: savedSurvey,
      })
    );

    await questionRepository.save(questions);
    console.log(`✅ Seeded survey: ${sData.name}`);
  }

  console.log('✅ Survey seeding completed.');
};

export const seedSurveyFeedbacks = async (dataSource: DataSource) => {
  const feedbackRepository = dataSource.getRepository(SurveyFeedback);
  const answerRepository = dataSource.getRepository(SurveyFeedbackAnswer);
  const surveyRepository = dataSource.getRepository(Survey);
  const userRepository = dataSource.getRepository(User);
  const branchRepository = dataSource.getRepository(Branch);

  console.log('🚀 Seeding survey feedbacks...');

  const survey = await surveyRepository.findOne({
    where: { name: 'Customer Satisfaction Survey' },
    relations: ['questions'],
  });

  const user = await userRepository.findOne({ where: {} });
  const branch = await branchRepository.findOne({ where: {} });

  if (!survey) {
    console.warn('⚠️ Skipping feedback seeding: "Customer Satisfaction Survey" not found.');
    return;
  }
  if (!user || !branch) {
    console.warn('⚠️ Skipping feedback seeding: User or Branch not found.');
    return;
  }

  // Create a feedback entry
  const existingFeedback = await feedbackRepository.findOne({
    where: {
      survey: { id: survey.id },
      user: { id: user.id },
      branch: { id: branch.id },
    },
  });

  if (existingFeedback) {
    console.log('ℹ️ Feedback for this user/survey/branch already exists. Skipping.');
    return;
  }

  const feedback = feedbackRepository.create({
    user,
    branch,
    survey,
  });

  const savedFeedback = await feedbackRepository.save(feedback);

  const answers = [];

  // Answer for Rating
  const ratingQuestion = survey.questions.find(q => q.type === SurveyQuestionType.RATING);
  if (ratingQuestion) {
    answers.push(
      answerRepository.create({
        feedback: savedFeedback,
        question: ratingQuestion,
        answer: '5',
      })
    );
  }

  // Answer for Text
  const textQuestion = survey.questions.find(q => q.type === SurveyQuestionType.TEXT);
  if (textQuestion) {
    answers.push(
      answerRepository.create({
        feedback: savedFeedback,
        question: textQuestion,
        answer: 'Excellent service and friendly staff!',
      })
    );
  }

  // Answer for Boolean
  const boolQuestion = survey.questions.find(q => q.type === SurveyQuestionType.BOOLEAN);
  if (boolQuestion) {
    answers.push(
      answerRepository.create({
        feedback: savedFeedback,
        question: boolQuestion,
        answer: 'true',
      })
    );
  }

  if (answers.length > 0) {
    await answerRepository.save(answers);
    console.log(`✅ Seeded feedback with ${answers.length} answers.`);
  } else {
    console.log('⚠️ Seeded feedback but matched no questions for answers.');
  }

  console.log('✅ Survey Feedback seeding completed.');
};
