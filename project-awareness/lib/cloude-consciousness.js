#!/usr/bin/env node

/**
 * Cloude-Consciousness Integration Module
 * Provides cross-session awareness and intelligent context continuity
 * Works with memory-cloude for complete session intelligence
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

// Security configuration
const SECURITY_CONFIG = {
    encryption: {
        algorithm: 'aes-256-gcm',
        keyLength: 32,
        ivLength: 16
    },
    sessionId: {
        byteLength: 32,
        encoding: 'hex'
    }
};

class CloudeConsciousness extends EventEmitter {
    constructor() {
        super();
        
        this.consciousnessBasePath = path.join(process.env.HOME, '.cloude', 'consciousness');
        this.statesPath = path.join(this.consciousnessBasePath, 'states');
        this.awarenessPath = path.join(this.consciousnessBasePath, 'awareness');
        this.continuityPath = path.join(this.consciousnessBasePath, 'continuity');
        
        // Initialize consciousness structure
        this.initializeConsciousnessStructure();
        
        // Awareness tracking
        this.currentAwareness = new Map();
        this.sessionContinuity = new Map();
        this.crossProjectLinks = new Map();
        
        // Load existing consciousness state
        this.loadConsciousnessState();
        
        // Start awareness monitoring
        this.startAwarenessMonitoring();
    }
    
    /**
     * Initialize consciousness directory structure
     */
    initializeConsciousnessStructure() {
        const dirs = [
            this.consciousnessBasePath,
            this.statesPath,
            this.awarenessPath,
            this.continuityPath
        ];
        
        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }
    
    /**
     * Update consciousness state for a project
     */
    async updateConsciousness(projectName, sessionData) {
        const statePath = path.join(this.statesPath, projectName, 'consciousness.json');
        fs.mkdirSync(path.dirname(statePath), { recursive: true });
        
        // Load existing state
        let state = this.loadProjectState(projectName);
        
        // Update with new session data
        state = this.evolveConsciousness(state, sessionData);
        
        // Detect cross-project connections
        const connections = await this.detectCrossProjectConnections(projectName, sessionData);
        if (connections.length > 0) {
            state.crossProjectConnections = connections;
        }
        
        // Update awareness
        this.updateAwareness(projectName, state);
        
        // Encrypt and save updated state
        const encryptedState = this.encryptConsciousnessState(state);
        fs.writeFileSync(statePath, JSON.stringify(encryptedState, null, 2));
        
        // Emit consciousness update event
        this.emit('consciousness-updated', {
            project: projectName,
            state: state,
            timestamp: new Date().toISOString()
        });
        
        return state;
    }
    
    /**
     * Load project consciousness state with decryption
     */
    loadProjectState(projectName) {
        const statePath = path.join(this.statesPath, projectName, 'consciousness.json');
        
        if (fs.existsSync(statePath)) {
            try {
                const encryptedState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
                return this.decryptConsciousnessState(encryptedState);
            } catch (error) {
                console.warn(`Failed to decrypt consciousness state for ${projectName}:`, error.message);
                // Fall back to creating new state
            }
        }
        
        // Initialize new consciousness state
        return {
            project: projectName,
            created: new Date().toISOString(),
            lastUpdate: new Date().toISOString(),
            sessionCount: 0,
            totalDuration: 0,
            awareness: {
                currentFocus: null,
                recentActivities: [],
                openQuestions: [],
                pendingTasks: []
            },
            patterns: {
                workflowTypes: {},
                toolSequences: {},
                fileAccess: {}
            },
            continuity: {
                lastSession: null,
                nextActions: [],
                context: {}
            },
            intelligence: {
                insights: [],
                recommendations: [],
                predictions: []
            }
        };
    }
    
    /**
     * Evolve consciousness with new session data
     */
    evolveConsciousness(state, sessionData) {
        // Update basic metrics
        state.lastUpdate = new Date().toISOString();
        state.sessionCount++;
        state.totalDuration += sessionData.duration || 0;
        
        // Update awareness
        state.awareness.currentFocus = this.determineFocus(sessionData);
        state.awareness.recentActivities = this.updateRecentActivities(
            state.awareness.recentActivities, 
            sessionData
        );
        
        // Update patterns
        this.updatePatterns(state.patterns, sessionData);
        
        // Update continuity with secure session ID
        state.continuity.lastSession = sessionData.sessionId || this.generateSecureSessionId();
        state.continuity.nextActions = this.predictNextActions(state, sessionData);
        state.continuity.context = this.buildContinuityContext(state, sessionData);
        
        // Generate intelligence
        state.intelligence = this.generateIntelligence(state, sessionData);
        
        return state;
    }
    
    /**
     * Determine current focus from session data
     */
    determineFocus(sessionData) {
        const tools = sessionData.toolsUsed || [];
        const files = sessionData.filesAccessed || [];
        
        if (tools.filter(t => t.tool === 'Edit' || t.tool === 'Write').length > 5) {
            return 'Active Development';
        } else if (files.length > 20) {
            return 'Research & Analysis';
        } else if (tools.some(t => t.tool === 'Bash')) {
            return 'System Operations';
        } else {
            return 'General Work';
        }
    }
    
    /**
     * Update recent activities list
     */
    updateRecentActivities(activities, sessionData) {
        const newActivities = [];
        
        // Add significant activities from session
        if (sessionData.decisions) {
            sessionData.decisions.forEach(d => {
                newActivities.push({
                    type: 'decision',
                    content: d.decision || d,
                    timestamp: d.timestamp || new Date().toISOString()
                });
            });
        }
        
        if (sessionData.insights) {
            sessionData.insights.forEach(i => {
                newActivities.push({
                    type: 'insight',
                    content: i.insight || i,
                    timestamp: i.timestamp || new Date().toISOString()
                });
            });
        }
        
        // Merge with existing, keep last 20
        return [...newActivities, ...activities].slice(0, 20);
    }
    
    /**
     * Update pattern recognition
     */
    updatePatterns(patterns, sessionData) {
        // Update workflow type frequencies
        const workflowType = this.detectWorkflowType(sessionData);
        patterns.workflowTypes[workflowType] = (patterns.workflowTypes[workflowType] || 0) + 1;
        
        // Update tool sequence patterns
        if (sessionData.toolsUsed) {
            for (let i = 0; i < sessionData.toolsUsed.length - 1; i++) {
                const sequence = `${sessionData.toolsUsed[i].tool} → ${sessionData.toolsUsed[i+1].tool}`;
                patterns.toolSequences[sequence] = (patterns.toolSequences[sequence] || 0) + 1;
            }
        }
        
        // Update file access patterns
        if (sessionData.filesAccessed) {
            sessionData.filesAccessed.forEach(file => {
                const dir = path.dirname(file.path || file);
                patterns.fileAccess[dir] = (patterns.fileAccess[dir] || 0) + 1;
            });
        }
    }
    
    /**
     * Predict next actions based on patterns
     */
    predictNextActions(state, sessionData) {
        const predictions = [];
        
        // Based on workflow patterns
        const dominantWorkflow = this.getDominantPattern(state.patterns.workflowTypes);
        if (dominantWorkflow === 'development') {
            predictions.push('Run tests for recent changes');
            predictions.push('Review code quality');
        } else if (dominantWorkflow === 'research') {
            predictions.push('Document findings');
            predictions.push('Create summary report');
        }
        
        // Based on tool sequences
        const lastTool = sessionData.toolsUsed?.[sessionData.toolsUsed.length - 1]?.tool;
        if (lastTool === 'Edit') {
            predictions.push('Test modified code');
        } else if (lastTool === 'Read') {
            predictions.push('Continue analysis or make changes');
        }
        
        // Based on open questions
        if (state.awareness.openQuestions.length > 0) {
            predictions.push(`Address open question: ${state.awareness.openQuestions[0]}`);
        }
        
        return predictions.slice(0, 5);
    }
    
    /**
     * Build continuity context
     */
    buildContinuityContext(state, sessionData) {
        return {
            workingDirectory: sessionData.workingDirectory || process.cwd(),
            activeFiles: (sessionData.filesAccessed || []).slice(-10),
            recentTools: (sessionData.toolsUsed || []).slice(-5),
            environmentVariables: sessionData.environmentVariables || {},
            sessionChain: this.getSessionChain(state.project)
        };
    }
    
    /**
     * Generate intelligence from consciousness state
     */
    generateIntelligence(state, sessionData) {
        const intelligence = {
            insights: [],
            recommendations: [],
            predictions: []
        };
        
        // Generate insights
        if (state.sessionCount > 10) {
            intelligence.insights.push(`Project has ${state.sessionCount} sessions of accumulated knowledge`);
        }
        
        if (state.totalDuration > 3600000) { // More than 1 hour
            const hours = Math.round(state.totalDuration / 3600000);
            intelligence.insights.push(`${hours} hours invested in this project`);
        }
        
        // Generate recommendations
        const dominantWorkflow = this.getDominantPattern(state.patterns.workflowTypes);
        if (dominantWorkflow) {
            intelligence.recommendations.push(`Continue with ${dominantWorkflow} workflow`);
        }
        
        const frequentSequence = this.getMostFrequentPattern(state.patterns.toolSequences);
        if (frequentSequence) {
            intelligence.recommendations.push(`Common pattern: ${frequentSequence}`);
        }
        
        // Generate predictions
        intelligence.predictions = this.generatePredictions(state, sessionData);
        
        return intelligence;
    }
    
    /**
     * Detect cross-project connections
     */
    async detectCrossProjectConnections(projectName, sessionData) {
        const connections = [];
        
        // Check for files that reference other projects
        if (sessionData.filesAccessed) {
            const projectPaths = this.getKnownProjectPaths();
            
            sessionData.filesAccessed.forEach(file => {
                const filePath = file.path || file;
                projectPaths.forEach(([otherProject, otherPath]) => {
                    if (otherProject !== projectName && filePath.includes(otherPath)) {
                        connections.push({
                            type: 'file-reference',
                            fromProject: projectName,
                            toProject: otherProject,
                            file: filePath,
                            timestamp: new Date().toISOString()
                        });
                    }
                });
            });
        }
        
        // Store cross-project links
        if (connections.length > 0) {
            this.crossProjectLinks.set(projectName, connections);
        }
        
        return connections;
    }
    
    /**
     * Update awareness tracking
     */
    updateAwareness(projectName, state) {
        this.currentAwareness.set(projectName, {
            lastUpdate: state.lastUpdate,
            focus: state.awareness.currentFocus,
            sessionCount: state.sessionCount,
            intelligence: state.intelligence
        });
        
        // Save awareness snapshot
        const awarenessPath = path.join(this.awarenessPath, 'current-awareness.json');
        const awareness = Object.fromEntries(this.currentAwareness);
        fs.writeFileSync(awarenessPath, JSON.stringify(awareness, null, 2));
    }
    
    /**
     * Get session continuity chain
     */
    getSessionChain(projectName) {
        if (!this.sessionContinuity.has(projectName)) {
            this.sessionContinuity.set(projectName, []);
        }
        
        return this.sessionContinuity.get(projectName).slice(-5);
    }
    
    /**
     * Get known project paths
     */
    getKnownProjectPaths() {
        // This would be populated from project registry
        return [
            ['Arias-v-Bianchi', '/Volumes/thumb/Projects/Arias_v_Bianchi'],
            ['ChittyOS-Core', '/Volumes/thumb/Projects/chittyos'],
            ['ChittyChat', '/Volumes/thumb/Projects/chittyos/chittychat'],
            ['ChittyFinance', '/Volumes/thumb/Projects/chittyos/chittyfinance']
        ];
    }
    
    /**
     * Detect workflow type
     */
    detectWorkflowType(sessionData) {
        const tools = sessionData.toolsUsed || [];
        const files = sessionData.filesAccessed || [];
        
        if (tools.some(t => t.tool === 'Bash') && tools.some(t => t.tool === 'Edit')) {
            return 'deployment';
        } else if (files.length > tools.length * 2) {
            return 'research';
        } else if (tools.filter(t => t.tool === 'Write' || t.tool === 'Edit').length > 5) {
            return 'development';
        } else {
            return 'exploration';
        }
    }
    
    /**
     * Get dominant pattern
     */
    getDominantPattern(patterns) {
        const entries = Object.entries(patterns);
        if (entries.length === 0) return null;
        
        return entries.reduce((max, [pattern, count]) => 
            count > (max[1] || 0) ? [pattern, count] : max, ['', 0])[0];
    }
    
    /**
     * Get most frequent pattern
     */
    getMostFrequentPattern(patterns) {
        const entries = Object.entries(patterns);
        if (entries.length === 0) return null;
        
        const sorted = entries.sort((a, b) => b[1] - a[1]);
        return sorted[0] ? sorted[0][0] : null;
    }
    
    /**
     * Generate predictions
     */
    generatePredictions(state, sessionData) {
        const predictions = [];
        
        // Time-based predictions
        const hour = new Date().getHours();
        if (hour < 12) {
            predictions.push('Morning session - likely focused work time');
        } else if (hour > 17) {
            predictions.push('Evening session - possible wrap-up activities');
        }
        
        // Pattern-based predictions
        if (state.sessionCount % 5 === 0) {
            predictions.push('Milestone session - consider review and consolidation');
        }
        
        return predictions;
    }
    
    /**
     * Load consciousness state on startup
     */
    loadConsciousnessState() {
        const statePath = path.join(this.consciousnessBasePath, 'global-state.json');
        
        if (fs.existsSync(statePath)) {
            try {
                const encryptedGlobalState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
                const globalState = this.decryptGlobalState(encryptedGlobalState);
                
                // Restore awareness
                if (globalState.awareness) {
                    Object.entries(globalState.awareness).forEach(([project, awareness]) => {
                        this.currentAwareness.set(project, awareness);
                    });
                }
                
                // Restore continuity
                if (globalState.continuity) {
                    Object.entries(globalState.continuity).forEach(([project, chain]) => {
                        this.sessionContinuity.set(project, chain);
                    });
                }
            } catch (error) {
                console.warn('Failed to decrypt global consciousness state:', error.message);
            }
        }
    }
    
    /**
     * Save global consciousness state
     */
    saveGlobalState() {
        const globalState = {
            timestamp: new Date().toISOString(),
            awareness: Object.fromEntries(this.currentAwareness),
            continuity: Object.fromEntries(this.sessionContinuity),
            crossProjectLinks: Object.fromEntries(this.crossProjectLinks)
        };
        
        const statePath = path.join(this.consciousnessBasePath, 'global-state.json');
        const encryptedGlobalState = this.encryptGlobalState(globalState);
        fs.writeFileSync(statePath, JSON.stringify(encryptedGlobalState, null, 2));
    }
    
    /**
     * Start awareness monitoring
     */
    startAwarenessMonitoring() {
        // Save state every 5 minutes
        setInterval(() => {
            this.saveGlobalState();
        }, 5 * 60 * 1000);
        
        // Handle process exit
        process.on('exit', () => {
            this.saveGlobalState();
        });
        
        console.log('🌟 Cloude-Consciousness awareness monitoring active');
    }
    
    /**
     * Get consciousness summary for a project
     */
    getConsciousnessSummary(projectName) {
        const state = this.loadProjectState(projectName);
        const awareness = this.currentAwareness.get(projectName);
        
        return {
            project: projectName,
            sessions: state.sessionCount,
            totalTime: Math.round(state.totalDuration / 60000), // minutes
            currentFocus: state.awareness.currentFocus,
            lastUpdate: state.lastUpdate,
            intelligence: state.intelligence,
            awareness: awareness,
            crossProjectConnections: this.crossProjectLinks.get(projectName) || []
        };
    }
    
    /**
     * Get cross-session recommendations
     */
    getCrossSessionRecommendations() {
        const recommendations = [];
        
        // Check for projects that haven't been touched recently
        this.currentAwareness.forEach((awareness, project) => {
            const lastUpdate = new Date(awareness.lastUpdate);
            const daysSince = (Date.now() - lastUpdate) / (1000 * 60 * 60 * 24);
            
            if (daysSince > 7) {
                recommendations.push({
                    project: project,
                    recommendation: `Project hasn't been touched in ${Math.round(daysSince)} days`,
                    priority: 'low'
                });
            }
        });
        
        // Check for cross-project opportunities
        this.crossProjectLinks.forEach((links, project) => {
            if (links.length > 3) {
                recommendations.push({
                    project: project,
                    recommendation: 'High cross-project activity detected - consider consolidation',
                    priority: 'medium'
                });
            }
        });
        
        return recommendations;
    }

    /**
     * Generate encryption key for consciousness data
     */
    generateConsciousnessKey(projectName) {
        const keyMaterial = `consciousness-${projectName}-${process.env.HOME}-${process.platform}`;
        return crypto.scryptSync(keyMaterial, 'consciousness-salt', SECURITY_CONFIG.encryption.keyLength);
    }
    
    /**
     * Generate secure session ID
     */
    generateSecureSessionId() {
        const randomBytes = crypto.randomBytes(SECURITY_CONFIG.sessionId.byteLength);
        const timestamp = Date.now().toString();
        const additionalEntropy = crypto.randomBytes(16);
        
        const hash = crypto.createHash('sha256');
        hash.update(randomBytes);
        hash.update(timestamp);
        hash.update(additionalEntropy);
        
        return hash.digest(SECURITY_CONFIG.sessionId.encoding);
    }
    
    /**
     * Encrypt consciousness state using AES-256-GCM
     */
    encryptConsciousnessState(state) {
        const key = this.generateConsciousnessKey(state.project);
        const iv = crypto.randomBytes(SECURITY_CONFIG.encryption.ivLength);
        
        const cipher = crypto.createCipherGCM(SECURITY_CONFIG.encryption.algorithm, key, iv);
        
        const stateData = JSON.stringify(state);
        let encrypted = cipher.update(stateData, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        return {
            project: state.project, // Keep project name unencrypted for file organization
            encrypted: {
                data: encrypted,
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex'),
                algorithm: SECURITY_CONFIG.encryption.algorithm
            },
            _encrypted: true,
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * Decrypt consciousness state using AES-256-GCM
     */
    decryptConsciousnessState(encryptedState) {
        if (!encryptedState._encrypted) {
            // Not encrypted, return as-is for backwards compatibility
            return encryptedState;
        }
        
        const key = this.generateConsciousnessKey(encryptedState.project);
        const iv = Buffer.from(encryptedState.encrypted.iv, 'hex');
        const authTag = Buffer.from(encryptedState.encrypted.authTag, 'hex');
        
        const decipher = crypto.createDecipherGCM(SECURITY_CONFIG.encryption.algorithm, key, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encryptedState.encrypted.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return JSON.parse(decrypted);
    }
    
    /**
     * Encrypt global state
     */
    encryptGlobalState(globalState) {
        const key = crypto.scryptSync('global-consciousness', 'global-salt', SECURITY_CONFIG.encryption.keyLength);
        const iv = crypto.randomBytes(SECURITY_CONFIG.encryption.ivLength);
        
        const cipher = crypto.createCipherGCM(SECURITY_CONFIG.encryption.algorithm, key, iv);
        
        const stateData = JSON.stringify(globalState);
        let encrypted = cipher.update(stateData, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        return {
            encrypted: {
                data: encrypted,
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex'),
                algorithm: SECURITY_CONFIG.encryption.algorithm
            },
            _encrypted: true,
            timestamp: globalState.timestamp
        };
    }
    
    /**
     * Decrypt global state
     */
    decryptGlobalState(encryptedGlobalState) {
        if (!encryptedGlobalState._encrypted) {
            return encryptedGlobalState;
        }
        
        const key = crypto.scryptSync('global-consciousness', 'global-salt', SECURITY_CONFIG.encryption.keyLength);
        const iv = Buffer.from(encryptedGlobalState.encrypted.iv, 'hex');
        const authTag = Buffer.from(encryptedGlobalState.encrypted.authTag, 'hex');
        
        const decipher = crypto.createDecipherGCM(SECURITY_CONFIG.encryption.algorithm, key, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encryptedGlobalState.encrypted.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return JSON.parse(decrypted);
    }
}

// Export singleton instance
const cloudeConsciousness = new CloudeConsciousness();

module.exports = { CloudeConsciousness, cloudeConsciousness };