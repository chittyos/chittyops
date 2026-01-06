#!/usr/bin/env node

/**
 * Session Parser for Project Awareness
 * Parses Claude Code session files to understand work patterns
 */

const fs = require('fs');
const path = require('path');

class SessionParser {
    constructor() {
        this.parsedSessions = new Map();
    }

    /**
     * Parse a single session file
     */
    async parseSession(sessionPath) {
        try {
            const sessionData = {
                sessionId: path.basename(sessionPath, '.jsonl'),
                entries: [],
                summary: null,
                projectContext: null,
                toolUsage: {},
                fileOperations: [],
                workingDirectories: new Set()
            };

            const content = fs.readFileSync(sessionPath, 'utf8');
            const lines = content.trim().split('\n');
            
            // Optimize: Only process first and last 25 lines for large sessions
            const linesToProcess = lines.length > 50 ? 
                [...lines.slice(0, 25), ...lines.slice(-25)] : 
                lines;

            for (const line of linesToProcess) {
                try {
                    const entry = JSON.parse(line);
                    sessionData.entries.push(entry);

                    // Extract summary if available
                    if (entry.type === 'summary' && entry.summary) {
                        sessionData.summary = entry.summary;
                    }

                    // Track working directories
                    if (entry.cwd) {
                        sessionData.workingDirectories.add(entry.cwd);
                    }

                    // Analyze tool usage
                    if (entry.message && entry.message.content) {
                        const toolUse = this.extractToolUsage(entry.message.content);
                        if (toolUse) {
                            sessionData.toolUsage[toolUse.tool] = (sessionData.toolUsage[toolUse.tool] || 0) + 1;
                            
                            if (toolUse.filePath) {
                                sessionData.fileOperations.push({
                                    tool: toolUse.tool,
                                    filePath: toolUse.filePath,
                                    timestamp: entry.timestamp
                                });
                            }
                        }
                    }

                } catch (parseError) {
                    // Skip malformed JSON lines
                    continue;
                }
            }

            // Convert Set to Array for JSON serialization
            sessionData.workingDirectories = Array.from(sessionData.workingDirectories);

            return sessionData;

        } catch (error) {
            console.error(`Error parsing session ${sessionPath}:`, error.message);
            return null;
        }
    }

    /**
     * Extract tool usage from message content
     */
    extractToolUsage(content) {
        if (typeof content !== 'string') {
            if (Array.isArray(content)) {
                // Handle structured content
                for (const item of content) {
                    if (item.type === 'tool_use') {
                        return {
                            tool: item.name,
                            filePath: item.input?.file_path || item.input?.path,
                            args: item.input
                        };
                    }
                }
            }
            return null;
        }

        // Extract tool usage patterns from text
        const toolPatterns = [
            { pattern: /Read\(([^)]+)\)/, tool: 'Read' },
            { pattern: /Write\(([^)]+)\)/, tool: 'Write' },
            { pattern: /Edit\(([^)]+)\)/, tool: 'Edit' },
            { pattern: /Bash\(([^)]+)\)/, tool: 'Bash' },
            { pattern: /LS\(([^)]+)\)/, tool: 'LS' }
        ];

        for (const { pattern, tool } of toolPatterns) {
            const match = content.match(pattern);
            if (match) {
                return {
                    tool: tool,
                    filePath: match[1],
                    raw: match[0]
                };
            }
        }

        return null;
    }

    /**
     * Analyze session for project patterns
     */
    analyzeSessionProject(sessionData) {
        const projectScores = {};
        
        // Analyze file paths
        for (const fileOp of sessionData.fileOperations) {
            const projectMatches = this.matchProjectPatterns(fileOp.filePath);
            for (const [project, score] of Object.entries(projectMatches)) {
                projectScores[project] = (projectScores[project] || 0) + score;
            }
        }

        // Analyze working directories
        for (const dir of sessionData.workingDirectories) {
            const projectMatches = this.matchProjectPatterns(dir);
            for (const [project, score] of Object.entries(projectMatches)) {
                projectScores[project] = (projectScores[project] || 0) + score * 0.5;
            }
        }

        // Analyze summary text
        if (sessionData.summary) {
            const projectMatches = this.matchProjectPatterns(sessionData.summary);
            for (const [project, score] of Object.entries(projectMatches)) {
                projectScores[project] = (projectScores[project] || 0) + score * 0.3;
            }
        }

        // Return top project
        const sortedProjects = Object.entries(projectScores)
            .sort(([,a], [,b]) => b - a);
            
        return sortedProjects.length > 0 ? {
            project: sortedProjects[0][0],
            confidence: Math.min(sortedProjects[0][1] / 3, 1.0),
            allScores: projectScores
        } : null;
    }

    /**
     * Match text against project patterns
     */
    matchProjectPatterns(text) {
        const scores = {};
        const lowerText = text.toLowerCase();

        const patterns = {
            'Arias-v-Bianchi': ['arias', 'bianchi', 'legal', 'court', 'evidence', 'motion', 'filing'],
            'ChittyOS-Core': ['chittyos', 'mcp', 'server', 'canon', 'registry'],
            'ChittyFinance': ['chittyfinance', 'finance', 'financial', 'invoice', 'payment', 'accounting'],
            'ChittyChat': ['chittychat', 'chat', 'task', 'project', 'agent'],
            'ChittyScore': ['chittyscore', 'score', 'reputation', 'trust', 'rating'],
            'ChiCo-Properties': ['chico', 'chicago', 'property', 'rental', 'tenant', 'lease'],
            'Furnished-Condos': ['furnished', 'condo', 'airbnb', 'booking', 'guest'],
            'IT-CAN-BE-LLC': ['itcanbe', 'wyoming', 'llc', 'corporate', 'entity']
        };

        for (const [project, keywords] of Object.entries(patterns)) {
            let score = 0;
            for (const keyword of keywords) {
                if (lowerText.includes(keyword)) {
                    score += 1 / keywords.length;
                }
            }
            if (score > 0) {
                scores[project] = score;
            }
        }

        return scores;
    }

    /**
     * Parse multiple sessions in a directory
     */
    async parseSessionDirectory(directoryPath) {
        try {
            const files = fs.readdirSync(directoryPath)
                .filter(file => file.endsWith('.jsonl'))
                .slice(-20); // Parse last 20 sessions

            const results = [];
            for (const file of files) {
                const sessionPath = path.join(directoryPath, file);
                const sessionData = await this.parseSession(sessionPath);
                
                if (sessionData) {
                    const projectAnalysis = this.analyzeSessionProject(sessionData);
                    results.push({
                        ...sessionData,
                        projectAnalysis
                    });
                }
            }

            return results;

        } catch (error) {
            console.error('Error parsing session directory:', error);
            return [];
        }
    }

    /**
     * Get session statistics for project awareness
     */
    generateSessionStats(sessions) {
        const stats = {
            totalSessions: sessions.length,
            projectDistribution: {},
            toolUsage: {},
            mostActiveDirectories: {},
            timeRange: {
                earliest: null,
                latest: null
            }
        };

        for (const session of sessions) {
            // Project distribution
            if (session.projectAnalysis) {
                const project = session.projectAnalysis.project;
                stats.projectDistribution[project] = (stats.projectDistribution[project] || 0) + 1;
            }

            // Tool usage aggregation
            for (const [tool, count] of Object.entries(session.toolUsage)) {
                stats.toolUsage[tool] = (stats.toolUsage[tool] || 0) + count;
            }

            // Directory activity
            for (const dir of session.workingDirectories) {
                stats.mostActiveDirectories[dir] = (stats.mostActiveDirectories[dir] || 0) + 1;
            }
        }

        return stats;
    }
}

module.exports = { SessionParser };