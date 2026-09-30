export type HelpTrack = 'guidance' | 'builder';
export type IdeaStatus = 'open' | 'in-progress' | 'built';
export type IdeaCategory = 'Software' | 'Hardware' | 'AI' | 'Web' | 'Other';
export type IdeaLicense = 'all-rights-kept' | 'cc-by' | 'mit';
export type ResponseType = 'guidance' | 'offer-to-build' | 'connection' | 'similar-check';
export type VolunteerStatus = 'pending' | 'accepted' | 'declined';
export type ReportCategory =
  | 'spam'
  | 'abuse'
  | 'harassment'
  | 'ip-infringement'
  | 'ip-violation'
  | 'malicious-link'
  | 'misleading'
  | 'off-topic'
  | 'other';

export const DRAFT_SCHEMA_VERSION = 2;

export interface NotificationPreferences {
  responses: boolean;
  volunteers: boolean;
  connections: boolean;
  statusChanges: boolean;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  username: string;
  photoURL?: string;
  avatarUrl?: string;
  bio?: string;
  deleted?: boolean;
  deletedAt?: string;
  suspended?: boolean;
  suspendedAt?: string;
  suspendedReason?: string;
  accountStatus?: 'active' | 'disabled' | 'deleted';
  notificationPrefs?: NotificationPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface UsernameRecord {
  username: string;
  uid: string;
  createdAt: string;
  updatedAt: string;
}

export interface Idea {
  id: string;
  title: string;
  summary: string;
  problem: string;
  solution: string;
  helpWanted: string;
  existingCheckNote?: string;
  targetUsers?: string;
  knownBlockers?: string;
  collaborationExpectations?: string;
  referenceLinks?: string;
  diagramUrl?: string;
  category: IdeaCategory;
  tags: string[];
  helpTrack: HelpTrack;
  status: IdeaStatus;
  license: IdeaLicense;
  authorId: string;
  authorName: string;
  authorUsername: string;
  isSeed: boolean;
  responseCount: number;
  volunteerCount: number;
  connectionCount: number;
  communityCheckSimilar: number;
  communityCheckNew: number;
  showcaseUrl?: string;
  showcaseCredits?: string;
  showcaseNotes?: string;
  adminVerified?: boolean;
  adminVerifiedAt?: string;
  adminVerifiedBy?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IdeaRevision {
  id: string;
  ideaId: string;
  editorId: string;
  editorName: string;
  changedFields: string[];
  previousTitle: string;
  previousSummary: string;
  previousStatus: IdeaStatus;
  createdAt: string;
}

export interface IdeaResponse {
  id: string;
  ideaId: string;
  type: ResponseType;
  content: string;
  referenceUrl?: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  createdAt: string;
  updatedAt: string;
}

export interface Volunteer {
  id: string;
  ideaId: string;
  ideaTitle: string;
  userId: string;
  userName: string;
  userUsername: string;
  role: string;
  message: string;
  status: VolunteerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IdeaConnection {
  id: string;
  pairKey?: string;
  ideaA: string;
  ideaATitle: string;
  ideaAAuthorId?: string;
  ideaAAuthorName?: string;
  ideaB: string;
  ideaBTitle: string;
  ideaBAuthorId?: string;
  ideaBAuthorName?: string;
  reason: string;
  createdBy: string;
  createdByName: string;
  status: 'active' | 'pending' | 'declined';
  createdAt: string;
  updatedAt?: string;
}

export interface AppNotification {
  id: string;
  recipientId: string;
  type: 'response' | 'volunteer' | 'connection' | 'status-change';
  title: string;
  message: string;
  link: string;
  targetId?: string;
  targetDeleted?: boolean;
  read: boolean;
  actorId: string;
  actorName: string;
  createdAt: string;
  updatedAt?: string;
}

export type UserNotification = AppNotification;

export interface ModerationReport {
  id: string;
  targetType: 'idea' | 'response' | 'user';
  targetId: string;
  targetTitle: string;
  category?: ReportCategory;
  reason: string;
  reporterId: string;
  reporterName: string;
  status: 'open' | 'resolved' | 'dismissed';
  moderatorId?: string;
  moderatorName?: string;
  moderatorAction?: string;
  resolutionNote?: string;
  resolvedAt?: string;
  createdAt: string;
}

export type AuditActionType =
  | 'report.resolve'
  | 'report.dismiss'
  | 'report.delete'
  | 'content.delete_idea'
  | 'content.delete_response'
  | 'idea.status_change'
  | 'idea.verify_change'
  | 'volunteer.status_change'
  | 'connection.create'
  | 'connection.status_change'
  | 'connection.delete'
  | 'account.delete'
  | 'account.username_change'
  | 'account.suspend_change'
  | 'admin.reauth.success'
  | 'admin.reauth.failure'
  | 'admin.webauthn.success'
  | 'admin.webauthn.failure'
  | 'admin.panel.lock'
  | 'admin.panel.timeout'
  | 'admin.panel.access_denied';

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  action: AuditActionType;
  targetType: 'idea' | 'response' | 'user' | 'report' | 'volunteer' | 'connection' | 'admin';
  targetId: string;
  summary: string;
  createdAt: string;
}

export interface IdeaBookmark {
  id: string;
  userId: string;
  ideaId: string;
  ideaTitle: string;
  ideaSummary: string;
  ideaCategory: IdeaCategory;
  ideaHelpTrack: HelpTrack;
  note?: string;
  createdAt: string;
}

export type SavedBookmark = IdeaBookmark;

export interface IdeaDraft {
  schemaVersion?: number;
  savedAt?: string;
  title: string;
  helpTrack: HelpTrack;
  category: IdeaCategory;
  tags: string[];
  summary: string;
  problem: string;
  solution: string;
  helpWanted: string;
  existingCheckNote?: string;
  targetUsers?: string;
  knownBlockers?: string;
  collaborationExpectations?: string;
  referenceLinks?: string;
  diagramUrl?: string;
  license: IdeaLicense;
  showcaseUrl?: string;
  showcaseCredits?: string;
  showcaseNotes?: string;
}

export type PostIdeaDraft = IdeaDraft;

export interface DraftEnvelope {
  version: number;
  updatedAt: string;
  authorUid?: string;
  data: IdeaDraft;
}
