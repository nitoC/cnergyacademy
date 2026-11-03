export type RoleKey = 'LEARNER' | 'CREATOR' | 'MENTOR' | 'ADMIN';

export interface Me {
  id: string;
  email: string;
  fullName: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  emailVerified: boolean;
  roles: RoleKey[];
  permissions: string[];
  createdAt: string;
  pendingCreatorApplication: { id: string; createdAt: string } | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Subject {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  accentColor: string | null;
  publishedCourses: number;
  categories: { id: string; name: string; slug: string }[];
}

export interface CourseCard {
  id: string;
  title: string;
  slug: string;
  shortDescription: string;
  thumbnailUrl: string | null;
  coverPattern: string | null;
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  estimatedMinutes: number;
  currency: string;
  price: number;
  isFree: boolean;
  publishedAt: string | null;
  moduleCount: number;
  enrollmentCount: number;
  subject: { id: string; name: string; slug: string; accentColor: string | null };
  category: { id: string; name: string; slug: string } | null;
  creator: { id: string; fullName: string; displayName: string | null };
}

export type AccessReason =
  | 'ACCESS_GRANTED'
  | 'AUTHENTICATION_REQUIRED'
  | 'PURCHASE_REQUIRED'
  | 'PREREQUISITE_NOT_COMPLETED'
  | 'PURCHASE_AND_PREREQUISITE_REQUIRED'
  | 'COURSE_NOT_PUBLISHED'
  | 'MODULE_NOT_PUBLISHED'
  | 'ACCOUNT_NOT_AUTHORIZED';

export interface AccessDecision {
  granted: boolean;
  reason: AccessReason;
  requiresPurchase: boolean;
  requiresPrerequisite: boolean;
  prerequisiteQuizId: string | null;
  preview: boolean;
}

export interface CourseProgress {
  courseId: string;
  percent: number;
  itemsTotal: number;
  itemsCompleted: number;
  lessonsTotal: number;
  lessonsCompleted: number;
  quizzesTotal: number;
  quizzesPassed: number;
  isComplete: boolean;
  nextLessonId: string | null;
  modules: { moduleId: string; lessonsTotal: number; lessonsCompleted: number; quizzesTotal: number; quizzesPassed: number; completed: boolean }[];
}

export interface CourseDetail extends CourseCard {
  description: string;
  learningOutcomes: string[];
  status: string;
  completionRule: string;
  certificateEnabled: boolean;
  updatedAt: string;
  lessonCount: number;
  roadmaps: { slug: string; title: string }[];
  creator: { id: string; fullName: string; displayName: string | null; bio: string | null; avatarUrl: string | null };
  modules: {
    id: string;
    title: string;
    summary: string | null;
    position: number;
    access: string;
    prerequisiteQuiz: { id: string; title: string } | null;
    lessons: { id: string; title: string; estimatedMinutes: number }[];
    quizCount: number;
    decision: AccessDecision;
  }[];
  viewer: { authenticated: boolean; enrolled: boolean; hasEntitlement: boolean | null; isStaff: boolean; isOwner: boolean; progress: CourseProgress | null };
}

export type CheckpointState = 'COMPLETED' | 'CURRENT' | 'AVAILABLE' | 'UPCOMING' | 'LOCKED_PREMIUM' | 'LOCKED_PREREQUISITE' | 'LOCKED';

export interface JourneyCheckpoint {
  kind: 'lesson' | 'quiz';
  id: string;
  title: string;
  state: CheckpointState;
  estimatedMinutes?: number;
  passingScore?: number;
  attemptsRemaining?: number | null;
  bestScore?: number | null;
  isPrerequisiteGate?: boolean;
}

export interface Journey {
  course: { id: string; title: string; slug: string; shortDescription: string; approvedPrice: number | null; currency: string; coverPattern: string | null; subject: { name: string; accentColor: string | null }; creator: { fullName: string } };
  enrolled: boolean;
  preview: boolean;
  hasEntitlement: boolean;
  isPaidCourse: boolean;
  progress: CourseProgress;
  courseQuizzes: JourneyCheckpoint[];
  modules: {
    id: string;
    title: string;
    summary: string | null;
    position: number;
    access: string;
    isPublished: boolean;
    state: CheckpointState;
    decision: AccessDecision;
    prerequisiteQuiz: { id: string; title: string; passed: boolean } | null;
    progress: CourseProgress['modules'][number];
    checkpoints: JourneyCheckpoint[];
  }[];
  certificate: { id: string; serial: string; status: string } | null;
}

export type LessonBlock =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; style: 'bullet' | 'number'; items: string[] }
  | { type: 'image'; url: string; alt: string; caption?: string }
  | { type: 'code'; language: string; code: string }
  | { type: 'callout'; tone: 'note' | 'tip' | 'warning'; title?: string; text: string }
  | { type: 'resource'; title: string; url: string; description?: string };

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}
