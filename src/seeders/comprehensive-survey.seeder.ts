import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Survey, SurveyQuestion, SurveyQuestionType } from '../../entities/survey.entity';
import { User } from '../../entities/user.entity';
import { Project } from '../../entities/project.entity';

/**
 * Seed comprehensive surveys with ALL question types
 * Project ID: fbfd25af-5888-4cbb-83c2-019cebb78486
 * User ID: d0af5b34-60cb-4c5e-8914-f268414829db
 */
export const seedComprehensiveSurveys = async (dataSource: DataSource) => {
  const surveyRepository = dataSource.getRepository(Survey);
  const questionRepository = dataSource.getRepository(SurveyQuestion);
  const userRepository = dataSource.getRepository(User);
  const projectRepository = dataSource.getRepository(Project);

  console.log('🚀 Seeding comprehensive surveys with all question types...');

  // Fetch specific user and project
  const projectId = 'fbfd25af-5888-4cbb-83c2-019cebb78486';
  const userId = 'd0af5b34-60cb-4c5e-8914-f268414829db';

  const user = await userRepository.findOne({ where: { id: userId } });
  const project = await projectRepository.findOne({ where: { id: projectId } });

  if (!user) {
    console.warn(`⚠️ User with ID ${userId} not found. Skipping survey seeding.`);
    return;
  }
  if (!project) {
    console.warn(`⚠️ Project with ID ${projectId} not found. Skipping survey seeding.`);
    return;
  }

  const surveysData = [
    {
      name: 'Complete Customer Experience Survey',
      status: 'active' as const,
      userId: user.id,
      projectId: project.id,
      questions: [
        {
          text: 'How would you rate your overall experience? (1-5)',
          type: SurveyQuestionType.RATING,
          optional: false,
          options: null,
        },
        {
          text: 'What is your age?',
          type: SurveyQuestionType.NUMBER,
          optional: false,
          options: null,
        },
        {
          text: 'Please share your detailed feedback or suggestions',
          type: SurveyQuestionType.TEXT,
          optional: true,
          options: null,
        },
        {
          text: 'Would you recommend our services to friends and family?',
          type: SurveyQuestionType.BOOLEAN,
          optional: false,
          options: null,
        },
        {
          text: 'Please upload a photo of the product/service',
          type: SurveyQuestionType.IMAGE,
          optional: true,
          options: null,
        },
        {
          text: 'Which product category interests you the most?',
          type: SurveyQuestionType.DROPDOWN,
          optional: false,
          options: ['Electronics', 'Clothing & Fashion', 'Food & Beverages', 'Home & Garden', 'Sports & Outdoors', 'Health & Beauty', 'Other'],
        },
      ],
    },
    {
      name: 'Product Quality Assessment',
      status: 'active' as const,
      userId: user.id,
      projectId: project.id,
      questions: [
        {
          text: 'Rate the product quality (1-5)',
          type: SurveyQuestionType.RATING,
          optional: false,
          options: null,
        },
        {
          text: 'How many times have you purchased this product?',
          type: SurveyQuestionType.NUMBER,
          optional: false,
          options: null,
        },
        {
          text: 'What do you like most about this product?',
          type: SurveyQuestionType.TEXT,
          optional: true,
          options: null,
        },
        {
          text: 'Is the product value for money?',
          type: SurveyQuestionType.BOOLEAN,
          optional: false,
          options: null,
        },
        {
          text: 'Upload a photo showing product condition',
          type: SurveyQuestionType.IMAGE,
          optional: true,
          options: null,
        },
        {
          text: 'Where did you purchase this product?',
          type: SurveyQuestionType.DROPDOWN,
          optional: false,
          options: ['Online Store', 'Physical Store', 'Mobile App', 'Social Media', 'Other'],
        },
      ],
    },
    {
      name: 'Service Feedback Survey',
      status: 'active' as const,
      userId: user.id,
      projectId: project.id,
      questions: [
        {
          text: 'Rate the customer service quality (1-5)',
          type: SurveyQuestionType.RATING,
          optional: false,
          options: null,
        },
        {
          text: 'How many minutes did you wait for service?',
          type: SurveyQuestionType.NUMBER,
          optional: true,
          options: null,
        },
        {
          text: 'Describe your service experience',
          type: SurveyQuestionType.TEXT,
          optional: true,
          options: null,
        },
        {
          text: 'Was the staff helpful and professional?',
          type: SurveyQuestionType.BOOLEAN,
          optional: false,
          options: null,
        },
        {
          text: 'Upload a photo of the service location',
          type: SurveyQuestionType.IMAGE,
          optional: true,
          options: null,
        },
        {
          text: 'How did you contact customer service?',
          type: SurveyQuestionType.DROPDOWN,
          optional: false,
          options: ['Phone Call', 'Email', 'Live Chat', 'In-Person', 'Social Media', 'Mobile App'],
        },
      ],
    },
    {
      name: 'Brand Awareness Survey',
      status: 'active' as const,
      userId: user.id,
      projectId: project.id,
      questions: [
        {
          text: 'How likely are you to recommend our brand? (1-5)',
          type: SurveyQuestionType.RATING,
          optional: false,
          options: null,
        },
        {
          text: 'How many years have you been a customer?',
          type: SurveyQuestionType.NUMBER,
          optional: true,
          options: null,
        },
        {
          text: 'What makes our brand stand out to you?',
          type: SurveyQuestionType.TEXT,
          optional: true,
          options: null,
        },
        {
          text: 'Do you follow us on social media?',
          type: SurveyQuestionType.BOOLEAN,
          optional: false,
          options: null,
        },
        {
          text: 'Upload a photo of our product in use',
          type: SurveyQuestionType.IMAGE,
          optional: true,
          options: null,
        },
        {
          text: 'How did you first hear about us?',
          type: SurveyQuestionType.DROPDOWN,
          optional: false,
          options: ['Social Media', 'Friend/Family Recommendation', 'Online Advertisement', 'TV/Radio', 'Search Engine', 'In-Store Display', 'Other'],
        },
      ],
    },
  ];

  for (const sData of surveysData) {
    // Check if survey already exists to avoid duplicates
    const existingSurvey = await surveyRepository.findOne({ 
      where: { 
        name: sData.name,
        projectId: project.id 
      } 
    });
    
    if (existingSurvey) {
      console.log(`ℹ️ Survey "${sData.name}" already exists for this project. Skipping.`);
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
    console.log(`✅ Seeded survey: ${sData.name} with ${questions.length} questions (all types included)`);
  }

  console.log('✅ Comprehensive survey seeding completed.');
  console.log(`📊 Created surveys for Project: ${project.id}`);
  console.log(`👤 Created by User: ${user.id}`);
};
