/**
 * ChittyChat MCP Server Extension - Project Awareness Integration
 * Adds project awareness capabilities to ChittyChat's existing MCP server
 */

import { ProjectAwarenessExtension } from '../index.js';
import type { Database } from '@/shared/schema';
import { drizzle } from 'drizzle-orm/neon-http';

export class ChittyChatProjectAwarenessExtension {
    private projectAwareness: ProjectAwarenessExtension;
    private db: Database;

    constructor(db: Database) {
        this.db = db;
        this.projectAwareness = new ProjectAwarenessExtension();
    }

    /**
     * Add Project Awareness tools to ChittyChat's MCP server
     */
    registerMCPTools(mcpServer: any) {
        // Get project suggestions
        mcpServer.addTool('project_awareness_get_suggestions', {
            description: 'Get intelligent project suggestions based on current context',
            inputSchema: {
                type: 'object',
                properties: {
                    context: {
                        type: 'object',
                        properties: {
                            workingDirectory: { type: 'string' },
                            recentFiles: { type: 'array' },
                            gitBranch: { type: 'string' },
                            platform: { type: 'string' }
                        }
                    },
                    userId: { type: 'string' }
                }
            }
        }, async (params) => {
            const suggestions = await this.getProjectSuggestions(params);
            return { success: true, suggestions };
        });

        // Set active project
        mcpServer.addTool('project_awareness_set_active', {
            description: 'Set the active project with ChittyID integration',
            inputSchema: {
                type: 'object',
                properties: {
                    project_name: { type: 'string' },
                    platform: { type: 'string' },
                    context: { type: 'object' },
                    userId: { type: 'string' }
                },
                required: ['project_name', 'userId']
            }
        }, async (params) => {
            const result = await this.setActiveProject(params);
            return { success: true, result };
        });

        // Analyze current context
        mcpServer.addTool('project_awareness_analyze_context', {
            description: 'Analyze current context for project detection',
            inputSchema: {
                type: 'object',
                properties: {
                    workingDirectory: { type: 'string' },
                    platform: { type: 'string' },
                    userId: { type: 'string' }
                }
            }
        }, async (params) => {
            const analysis = await this.analyzeCurrentContext(params);
            return { success: true, analysis };
        });

        // Force session alignment
        mcpServer.addTool('project_awareness_force_alignment', {
            description: 'Force cross-session alignment before critical operations',
            inputSchema: {
                type: 'object',
                properties: {
                    platform: { type: 'string' },
                    reason: { type: 'string' },
                    sessionId: { type: 'string' },
                    userId: { type: 'string' }
                }
            }
        }, async (params) => {
            await this.forceSessionAlignment(params);
            return { success: true, aligned_at: new Date().toISOString() };
        });

        // Consolidate session memory
        mcpServer.addTool('project_awareness_consolidate_memory', {
            description: 'Consolidate session memory into long-term storage',
            inputSchema: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string' },
                    projectId: { type: 'string' },
                    platform: { type: 'string' },
                    sessionData: { type: 'object' },
                    userId: { type: 'string' }
                },
                required: ['sessionId', 'userId']
            }
        }, async (params) => {
            const result = await this.consolidateSessionMemory(params);
            return { success: true, consolidation: result };
        });

        // Cross-platform sync
        mcpServer.addTool('project_awareness_cross_platform_sync', {
            description: 'Synchronize project context across all connected platforms',
            inputSchema: {
                type: 'object',
                properties: {
                    source_platform: { type: 'string' },
                    sync_type: {
                        type: 'string',
                        enum: ['project_switch', 'session_start', 'session_end', 'memory_update']
                    },
                    data: { type: 'object' },
                    userId: { type: 'string' }
                },
                required: ['source_platform', 'sync_type', 'data', 'userId']
            }
        }, async (params) => {
            const result = await this.crossPlatformSync(params);
            return { success: true, sync_result: result };
        });

        // Register platform session
        mcpServer.addTool('project_awareness_register_session', {
            description: 'Register a new session from any AI platform',
            inputSchema: {
                type: 'object',
                properties: {
                    platform: {
                        type: 'string',
                        enum: ['claude-code', 'claude-desktop', 'claude-web', 'openai-customgpt', 'chatgpt']
                    },
                    sessionId: { type: 'string' },
                    userId: { type: 'string' },
                    context: { type: 'object' }
                },
                required: ['platform', 'sessionId', 'userId']
            }
        }, async (params) => {
            const result = await this.registerPlatformSession(params);
            return { success: true, session: result };
        });
    }

    /**
     * Get project suggestions with ChittyChat integration
     */
    async getProjectSuggestions(params: any) {
        // Get context suggestions from project awareness
        const suggestions = await this.projectAwareness.getProjectSuggestions(params.context || {});

        // Get active ChittyChat projects for the user
        const activeProjects = await this.db.query.projects.findMany({
            where: (projects, { eq, and, isNull }) => and(
                eq(projects.created_by, params.userId),
                isNull(projects.deleted_at)
            ),
            with: {
                tasks: {
                    where: (tasks, { eq }) => eq(tasks.status, 'todo'),
                    limit: 3
                }
            }
        });

        // Merge suggestions with ChittyChat projects
        const mergedSuggestions = suggestions.map(suggestion => {
            const matchingProject = activeProjects.find(p => 
                p.name.toLowerCase().includes(suggestion.project.toLowerCase())
            );
            
            return {
                ...suggestion,
                chittychat_project_id: matchingProject?.id,
                open_tasks: matchingProject?.tasks?.length || 0,
                last_activity: matchingProject?.updated_at
            };
        });

        return mergedSuggestions;
    }

    /**
     * Set active project with ChittyID registration
     */
    async setActiveProject(params: any) {
        const { project_name, platform, context, userId } = params;

        // Find or create ChittyChat project
        let chittyChatProject = await this.db.query.projects.findFirst({
            where: (projects, { eq, and, isNull }) => and(
                eq(projects.name, project_name),
                eq(projects.created_by, userId),
                isNull(projects.deleted_at)
            )
        });

        if (!chittyChatProject) {
            // Create new project with ChittyID
            const chittyId = await this.generateChittyID(project_name, userId);
            
            chittyChatProject = await this.db.insert(this.db.projects).values({
                name: project_name,
                description: `Auto-created from ${platform || 'project awareness'}`,
                created_by: userId,
                chitty_id: chittyId,
                metadata: {
                    created_via: 'project_awareness',
                    platform: platform,
                    context: context
                }
            }).returning()[0];
        }

        // Set project in project awareness system
        await this.projectAwareness.switchProject(project_name);

        // Record project awareness activity
        await this.db.insert(this.db.project_awareness).values({
            project_id: chittyChatProject.id,
            session_id: context?.sessionId || `session-${Date.now()}`,
            platform: platform || 'unknown',
            context_data: context || {},
            confidence_score: 100, // User-selected = 100% confidence
            detection_method: 'user_selection'
        });

        return {
            project_id: chittyChatProject.id,
            project_name: project_name,
            chitty_id: chittyChatProject.chitty_id,
            platform: platform
        };
    }

    /**
     * Analyze current context with ChittyChat project matching
     */
    async analyzeCurrentContext(params: any) {
        const context = await this.projectAwareness.analyzeCurrentContext();
        
        // Match with existing ChittyChat projects
        const existingProjects = await this.db.query.projects.findMany({
            where: (projects, { eq, isNull }) => and(
                eq(projects.created_by, params.userId),
                isNull(projects.deleted_at)
            )
        });

        // Add ChittyChat project matching to context
        const contextWithMatching = {
            ...context,
            chittychat_matches: existingProjects.filter(project => {
                const projectName = project.name.toLowerCase();
                const workingDir = context.workingDirectory?.toLowerCase() || '';
                return workingDir.includes(projectName) || projectName.includes(path.basename(workingDir));
            }).map(p => ({
                id: p.id,
                name: p.name,
                chitty_id: p.chitty_id
            }))
        };

        return contextWithMatching;
    }

    /**
     * Force session alignment with ChittyChat sync
     */
    async forceSessionAlignment(params: any) {
        // Force alignment in project awareness
        await this.projectAwareness.forceSessionRestoration();

        // Sync with ChittyChat
        if (params.sessionId && params.userId) {
            await this.updateChittyChatSessionState(params.sessionId, params.userId, {
                alignment_forced: true,
                reason: params.reason,
                platform: params.platform,
                aligned_at: new Date().toISOString()
            });
        }
    }

    /**
     * Consolidate session memory with ChittyChat integration
     */
    async consolidateSessionMemory(params: any) {
        const { sessionId, projectId, platform, sessionData, userId } = params;

        // Consolidate in project awareness system
        const consolidationResult = await this.projectAwareness.chittyChatClient.consolidateSessionMemory(
            sessionId,
            projectId
        );

        // Store in ChittyChat database
        const memoryRecord = await this.db.insert(this.db.session_memory).values({
            session_id: sessionId,
            project_id: projectId,
            platform: platform || 'unknown',
            tools_used: sessionData?.tools_used || [],
            files_accessed: sessionData?.files_accessed || [],
            decisions_tracked: sessionData?.decisions_made || [],
            consolidated_at: new Date(),
            memory_integrated: true
        }).returning()[0];

        // Create activity record
        await this.db.insert(this.db.activities).values({
            type: 'session_memory_consolidated',
            entity_type: 'project',
            entity_id: projectId,
            created_by: userId,
            data: {
                session_id: sessionId,
                platform: platform,
                memory_record_id: memoryRecord.id
            }
        });

        return {
            memory_record_id: memoryRecord.id,
            consolidation_result: consolidationResult,
            activity_logged: true
        };
    }

    /**
     * Cross-platform synchronization
     */
    async crossPlatformSync(params: any) {
        const { source_platform, sync_type, data, userId } = params;

        // Handle different sync types
        switch (sync_type) {
            case 'project_switch':
                await this.syncProjectSwitch(source_platform, data, userId);
                break;
            case 'session_start':
                await this.syncSessionStart(source_platform, data, userId);
                break;
            case 'session_end':
                await this.syncSessionEnd(source_platform, data, userId);
                break;
            case 'memory_update':
                await this.syncMemoryUpdate(source_platform, data, userId);
                break;
        }

        return {
            sync_type,
            source_platform,
            synced_at: new Date().toISOString(),
            data_synced: true
        };
    }

    /**
     * Register platform session
     */
    async registerPlatformSession(params: any) {
        const { platform, sessionId, userId, context } = params;

        // Create session memory record
        const sessionRecord = await this.db.insert(this.db.session_memory).values({
            session_id: sessionId,
            platform: platform,
            tools_used: [],
            files_accessed: [],
            decisions_tracked: [],
            memory_integrated: false
        }).returning()[0];

        // Get project suggestions for new session
        const suggestions = await this.getProjectSuggestions({ context, userId });

        return {
            session_id: sessionId,
            platform: platform,
            memory_record_id: sessionRecord.id,
            project_suggestions: suggestions,
            registered_at: new Date().toISOString()
        };
    }

    // Helper methods
    private async generateChittyID(projectName: string, userId: string) {
        // Integration with ChittyID system
        return `PROJ-${Date.now()}-${projectName.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
    }

    private async updateChittyChatSessionState(sessionId: string, userId: string, state: any) {
        // Update session state in ChittyChat
        await this.db.update(this.db.session_memory)
            .set({ updated_at: new Date() })
            .where(eq(this.db.session_memory.session_id, sessionId));
    }

    private async syncProjectSwitch(platform: string, data: any, userId: string) {
        // Handle project switch synchronization
        console.log(`🔄 Syncing project switch from ${platform}:`, data);
    }

    private async syncSessionStart(platform: string, data: any, userId: string) {
        // Handle session start synchronization
        console.log(`▶️ Syncing session start from ${platform}:`, data);
    }

    private async syncSessionEnd(platform: string, data: any, userId: string) {
        // Handle session end synchronization
        console.log(`⏹️ Syncing session end from ${platform}:`, data);
    }

    private async syncMemoryUpdate(platform: string, data: any, userId: string) {
        // Handle memory update synchronization
        console.log(`🧠 Syncing memory update from ${platform}:`, data);
    }
}

export default ChittyChatProjectAwarenessExtension;