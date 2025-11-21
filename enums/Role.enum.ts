export enum ERole {
  SUPER_ADMIN = 'super_admin', // Full system access
  PROJECT_ADMIN = 'admin', // Manages a single project
  SUPERVISOR = 'supervisor', // Oversees promoters in branches
  PROMOTER = 'promoter', // Field staff performing audits/sales
  AUDITOR = 'auditor', // Specialized audit role (optional)
}
