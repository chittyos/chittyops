/**
 * ChittyChat Schema Extensions for Project Awareness
 * Add these to /Volumes/thumb/Projects/chittyos/chittychat/shared/schema.ts
 */

import { pgTable, text, varchar, json, integer, timestamp, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { projects, users } from './existing-schema'; // Import existing tables

// Project Awareness tracking table
export const projectAwareness = pgTable("project_awareness", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  sessionId: text("session_id").notNull(),
  platform: text("platform").notNull(), // claude-code, claude-desktop, claude-web, openai-customgpt, chatgpt
  contextData: json("context_data").$type<{
    workingDirectory?: string;
    recentFiles?: string[];
    gitBranch?: string;
    gitRemote?: string;
    detectedPatterns?: string[];
    confidenceFactors?: string[];
  }>().default({}),
  confidenceScore: integer("confidence_score").notNull().default(0), // 0-100
  detectionMethod: text("detection_method").notNull(), // directory_match, file_pattern, user_selection, etc.
  secondaryProjects: json("secondary_projects").$type<string[]>().default([]), // Cross-project context
  crossProjectContext: boolean("cross_project_context").default(false),
  lastActivity: timestamp("last_activity").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Cross-session memory storage
export const sessionMemory = pgTable("session_memory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: text("session_id").notNull().unique(),
  projectId: varchar("project_id").references(() => projects.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  platform: text("platform").notNull(),
  
  // Session tracking data
  toolsUsed: json("tools_used").$type<{
    tool: string;
    timestamp: string;
    args_summary: Record<string, any>;
  }[]>().default([]),
  
  filesAccessed: json("files_accessed").$type<{
    path: string;
    tool: string;
    timestamp: string;
    operation: 'read' | 'write' | 'edit' | 'search';
  }[]>().default([]),
  
  decisionsTracked: json("decisions_tracked").$type<{
    decision_type: string;
    decision_data: Record<string, any>;
    timestamp: string;
  }[]>().default([]),
  
  // Session metadata
  sessionDuration: integer("session_duration").default(0), // milliseconds
  workflowType: text("workflow_type"), // research, development, deployment, analysis
  complexityIndicators: json("complexity_indicators").$type<{
    multi_project: boolean;
    high_file_count: boolean;
    long_duration: boolean;
    many_tools: boolean;
  }>(),
  
  // Memory consolidation
  consolidatedAt: timestamp("consolidated_at"),
  memoryIntegrated: boolean("memory_integrated").default(false),
  memoryClaudeSync: boolean("memory_claude_sync").default(false),
  
  // Cross-platform sync
  syncedPlatforms: json("synced_platforms").$type<string[]>().default([]),
  lastSyncAt: timestamp("last_sync_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Cross-platform session registry
export const platformSessions = pgTable("platform_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: text("session_id").notNull(),
  platform: text("platform").notNull(),
  userId: varchar("user_id").notNull().references(() => users.id),
  projectId: varchar("project_id").references(() => projects.id),
  
  // Session state
  status: text("status").notNull().default('active'), // active, ended, consolidated
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  
  // Platform-specific data
  platformData: json("platform_data").$type<{
    user_agent?: string;
    client_version?: string;
    api_version?: string;
    custom_data?: Record<string, any>;
  }>().default({}),
  
  // Cross-session alignment
  lastAlignmentAt: timestamp("last_alignment_at"),
  alignmentForced: boolean("alignment_forced").default(false),
  alignmentReason: text("alignment_reason"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Project intelligence patterns (learned over time)
export const projectPatterns = pgTable("project_patterns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  
  // Pattern data
  patternType: text("pattern_type").notNull(), // directory, file, workflow, timing
  pattern: text("pattern").notNull(), // The actual pattern (regex, path, etc.)
  confidence: integer("confidence").notNull().default(0), // 0-100
  
  // Pattern metadata
  detectionCount: integer("detection_count").default(1),
  lastDetected: timestamp("last_detected").defaultNow(),
  platforms: json("platforms").$type<string[]>().default([]),
  
  // Pattern effectiveness
  accuracyRate: integer("accuracy_rate").default(100), // Success rate 0-100
  falsePositives: integer("false_positives").default(0),
  truePositives: integer("true_positives").default(1),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Cross-platform synchronization log
export const syncLog = pgTable("sync_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  syncType: text("sync_type").notNull(), // project_switch, session_start, session_end, memory_update
  sourcePlatform: text("source_platform").notNull(),
  targetPlatforms: json("target_platforms").$type<string[]>().notNull(),
  
  // Sync data
  entityType: text("entity_type"), // project, session, memory
  entityId: varchar("entity_id"),
  syncData: json("sync_data").$type<Record<string, any>>(),
  
  // Sync status
  status: text("status").notNull().default('pending'), // pending, success, failed, partial
  errorMessage: text("error_message"),
  syncDuration: integer("sync_duration"), // milliseconds
  
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Add ChittyID and Registry integration fields to existing projects table
// (These would be ALTER TABLE statements or modifications to existing schema)

// Example of extending projects table:
export const projectsExtended = pgTable("projects", {
  // ... existing fields from projects table
  chittyId: text("chitty_id").unique(), // ChittyID integration
  registryEndpoints: json("registry_endpoints").$type<{
    project_api?: string;
    task_management?: string;
    activity_feed?: string;
    evidence_chain?: string;
    ledger?: string;
    mcp_server?: string;
  }>().default({}),
  projectCapabilities: json("project_capabilities").$type<string[]>().default([]),
  projectType: text("project_type"), // chittyos-ecosystem, legal-case, financial-operations, etc.
  crossProjectRelations: json("cross_project_relations").$type<{
    related_projects: string[];
    relationship_types: string[];
  }>().default({ related_projects: [], relationship_types: [] }),
});

// Relations for the new tables
import { relations } from 'drizzle-orm';

export const projectAwarenessRelations = relations(projectAwareness, ({ one }) => ({
  project: one(projects, {
    fields: [projectAwareness.projectId],
    references: [projects.id],
  }),
}));

export const sessionMemoryRelations = relations(sessionMemory, ({ one }) => ({
  project: one(projects, {
    fields: [sessionMemory.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [sessionMemory.userId],
    references: [users.id],
  }),
}));

export const platformSessionsRelations = relations(platformSessions, ({ one }) => ({
  project: one(projects, {
    fields: [platformSessions.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [platformSessions.userId],
    references: [users.id],
  }),
}));

export const projectPatternsRelations = relations(projectPatterns, ({ one }) => ({
  project: one(projects, {
    fields: [projectPatterns.projectId],
    references: [projects.id],
  }),
}));

// Database migration SQL (to be run via drizzle-kit)
export const migrationSQL = `
-- Create project_awareness table
CREATE TABLE IF NOT EXISTS project_awareness (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  context_data JSON DEFAULT '{}',
  confidence_score INTEGER NOT NULL DEFAULT 0,
  detection_method TEXT NOT NULL,
  secondary_projects JSON DEFAULT '[]',
  cross_project_context BOOLEAN DEFAULT false,
  last_activity TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create session_memory table
CREATE TABLE IF NOT EXISTS session_memory (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL UNIQUE,
  project_id VARCHAR REFERENCES projects(id),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  platform TEXT NOT NULL,
  tools_used JSON DEFAULT '[]',
  files_accessed JSON DEFAULT '[]',
  decisions_tracked JSON DEFAULT '[]',
  session_duration INTEGER DEFAULT 0,
  workflow_type TEXT,
  complexity_indicators JSON,
  consolidated_at TIMESTAMP,
  memory_integrated BOOLEAN DEFAULT false,
  memory_claude_sync BOOLEAN DEFAULT false,
  synced_platforms JSON DEFAULT '[]',
  last_sync_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create platform_sessions table
CREATE TABLE IF NOT EXISTS platform_sessions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  user_id VARCHAR NOT NULL REFERENCES users(id),
  project_id VARCHAR REFERENCES projects(id),
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  platform_data JSON DEFAULT '{}',
  last_alignment_at TIMESTAMP,
  alignment_forced BOOLEAN DEFAULT false,
  alignment_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create project_patterns table
CREATE TABLE IF NOT EXISTS project_patterns (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  pattern_type TEXT NOT NULL,
  pattern TEXT NOT NULL,
  confidence INTEGER NOT NULL DEFAULT 0,
  detection_count INTEGER DEFAULT 1,
  last_detected TIMESTAMP DEFAULT NOW(),
  platforms JSON DEFAULT '[]',
  accuracy_rate INTEGER DEFAULT 100,
  false_positives INTEGER DEFAULT 0,
  true_positives INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create sync_log table
CREATE TABLE IF NOT EXISTS sync_log (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL,
  source_platform TEXT NOT NULL,
  target_platforms JSON NOT NULL,
  entity_type TEXT,
  entity_id VARCHAR,
  sync_data JSON,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  sync_duration INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Add ChittyID and Registry fields to existing projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS chitty_id TEXT UNIQUE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS registry_endpoints JSON DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_capabilities JSON DEFAULT '[]';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cross_project_relations JSON DEFAULT '{"related_projects": [], "relationship_types": []}';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_awareness_session ON project_awareness(session_id);
CREATE INDEX IF NOT EXISTS idx_project_awareness_project ON project_awareness(project_id);
CREATE INDEX IF NOT EXISTS idx_project_awareness_platform ON project_awareness(platform);
CREATE INDEX IF NOT EXISTS idx_session_memory_session ON session_memory(session_id);
CREATE INDEX IF NOT EXISTS idx_session_memory_project ON session_memory(project_id);
CREATE INDEX IF NOT EXISTS idx_platform_sessions_platform ON platform_sessions(platform);
CREATE INDEX IF NOT EXISTS idx_platform_sessions_user ON platform_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_project_patterns_project ON project_patterns(project_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_type ON sync_log(sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_log_platform ON sync_log(source_platform);
`;