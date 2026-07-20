export type TicketStatus = 'new' | 'ai' | 'handoff' | 'human' | 'done' | 'closed';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'super_admin' | 'tenant_admin' | 'agent' | 'viewer';
  tenantId: string | null;
}

export interface UserRef {
  id: string;
  displayName: string;
}

export interface TicketListItem {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  priority: string;
  channelType: string;
  endUserName: string;
  assignee: UserRef | null;
  lockedBy: UserRef | null;
  aiConfidence: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketDetail extends Omit<TicketListItem, 'endUserName'> {
  endUser: { id: string; displayName: string; email: string | null };
  lockedAt: string | null;
  handoffReason: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  meta: Record<string, unknown>;
}

export interface Message {
  id: string;
  senderType: 'end_user' | 'eva' | 'agent' | 'system';
  senderUserId: string | null;
  body: string;
  internal: boolean;
  deliveryStatus: 'not_applicable' | 'pending' | 'sent' | 'failed';
  deliveryError: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export interface LayerAvailability {
  l1: { available: boolean; reason?: string };
  l2: { available: boolean; reason?: string };
  l3: { available: boolean; reason?: string };
}

export interface EvaConfigResponse {
  config: EvaConfig;
  availability: LayerAvailability;
  costs: { l1: number; l2: number; l3: number };
}

export interface ManagedUser {
  id: string;
  email: string;
  displayName: string;
  role: 'super_admin' | 'tenant_admin' | 'agent' | 'viewer';
  isOnline: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface EndUserProfile {
  endUser: {
    id: string;
    displayName: string;
    email: string | null;
    telegramId: string | null;
    externalKey: string;
    meta: Record<string, unknown>;
  };
  stats: Record<string, number>;
  tickets: Array<{
    id: string;
    number: number;
    subject: string;
    status: TicketStatus;
    priority: string;
    channelType: string;
    createdAt: string;
    resolvedAt: string | null;
  }>;
}

export interface EvaConfig {
  id: string;
  tenantId: string;
  l1Enabled: boolean;
  l2Enabled: boolean;
  l3Enabled: boolean;
  l3Model: string;
  handoffConfidenceThreshold: number;
  tone: 'community' | 'formal' | 'concise';
  languages: string[];
  signature: string;
  humanRequestKeywords: string[];
}

export interface LabelAnswer {
  id: string;
  triggerKeywords: string[];
  locale: string;
  answerBody: string;
  hitCount: number;
  isActive: boolean;
}

export interface KbArticle {
  id: string;
  title: string;
  bodyMd: string;
  locale: string;
  tags: string[];
  sourceRef: string | null;
  syncStatus: 'synced' | 'pending_confirmation' | 'stale';
  excludedFromEva: boolean;
  updatedAt: string;
}

export interface Channel {
  id: string;
  type: 'email' | 'telegram' | 'livechat' | 'whatsapp_stub';
  status: 'active' | 'disabled';
  configured: boolean;
  health: string;
}

export interface MetricsSummary {
  range: string;
  todayTickets: number;
  aiResolutionRate: number;
  handoffRate: number;
  resolved: { ai: number; human: number; total: number };
  firstResponseSeconds: { ai: number | null; human: number | null };
  agents: Array<{ id: string; displayName: string; isOnline: boolean; openTickets: number }>;
}

export interface MetricsRouting {
  range: string;
  total: number;
  counts: Record<string, number>;
  distribution: { l1: number; l2: number; l3: number; handoff: number };
  costUsd: number;
}

export interface MetricsTimeseries {
  days: number;
  series: Array<{ date: string; ai: number; human: number }>;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
}
