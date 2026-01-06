#!/usr/bin/env node

/**
 * Memory-Cloude Integration Module
 * Provides memory persistence and pattern recognition across sessions
 * Works with cloude-consciousness for full awareness
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

class MemoryCloude {
    constructor() {
        this.memoryBasePath = path.join(process.env.HOME, '.cloude', 'memory-cloude');
        this.patternsPath = path.join(this.memoryBasePath, 'patterns');
        this.synthesisPath = path.join(this.memoryBasePath, 'synthesis');
        this.memoriesPath = path.join(this.memoryBasePath, 'memories');
        
        // Initialize directory structure
        this.initializeMemoryStructure();
        
        // Memory indexing
        this.memoryIndex = new Map();
        this.patternCache = new Map();
        
        // Load existing memories
        this.loadMemoryIndex();
    }
    
    /**
     * Initialize memory directory structure
     */
    initializeMemoryStructure() {
        const dirs = [
            this.memoryBasePath,
            this.patternsPath,
            this.synthesisPath,
            this.memoriesPath
        ];
        
        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }
    
    /**
     * Store a memory with pattern recognition and encryption
     */
    async storeMemory(projectName, sessionId, memoryData) {
        const memoryId = this.generateMemoryId(projectName, sessionId);
        
        // Extract patterns from memory data
        const patterns = await this.extractPatterns(memoryData);
        
        // Synthesize with existing memories
        const synthesis = await this.synthesizeMemory(projectName, memoryData, patterns);
        
        // Store the complete memory
        const completeMemory = {
            id: memoryId,
            project: projectName,
            session: sessionId,
            timestamp: new Date().toISOString(),
            data: memoryData,
            patterns: patterns,
            synthesis: synthesis,
            version: '1.0.0'
        };
        
        // Encrypt sensitive data before storage
        const encryptedMemory = this.encryptSensitiveData(completeMemory);
        
        // Save to disk with encryption
        const memoryPath = path.join(this.memoriesPath, projectName, `${memoryId}.json`);
        fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
        fs.writeFileSync(memoryPath, JSON.stringify(encryptedMemory, null, 2));
        
        // Update index (store metadata unencrypted for indexing)
        this.memoryIndex.set(memoryId, {
            project: projectName,
            session: sessionId,
            path: memoryPath,
            timestamp: completeMemory.timestamp,
            encrypted: true
        });
        
        // Store patterns separately for quick access
        await this.storePatterns(projectName, patterns);
        
        return completeMemory;
    }
    
    /**
     * Retrieve memories for a project with decryption
     */
    async retrieveMemories(projectName, options = {}) {
        const memories = [];
        const projectMemoryPath = path.join(this.memoriesPath, projectName);
        
        if (!fs.existsSync(projectMemoryPath)) {
            return memories;
        }
        
        const memoryFiles = fs.readdirSync(projectMemoryPath)
            .filter(f => f.endsWith('.json'));
        
        // Apply filters
        let filteredFiles = memoryFiles;
        
        if (options.limit) {
            filteredFiles = filteredFiles.slice(-options.limit);
        }
        
        if (options.since) {
            const sinceTime = new Date(options.since).getTime();
            filteredFiles = filteredFiles.filter(file => {
                try {
                    const encryptedMemory = JSON.parse(fs.readFileSync(path.join(projectMemoryPath, file), 'utf8'));
                    const memory = this.decryptSensitiveData(encryptedMemory);
                    return new Date(memory.timestamp).getTime() > sinceTime;
                } catch (error) {
                    console.warn(`Failed to decrypt memory file ${file}:`, error.message);
                    return false;
                }
            });
        }
        
        // Load and decrypt memories
        for (const file of filteredFiles) {
            try {
                const memoryPath = path.join(projectMemoryPath, file);
                const encryptedMemory = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
                const memory = this.decryptSensitiveData(encryptedMemory);
                memories.push(memory);
            } catch (error) {
                console.warn(`Failed to decrypt memory file ${file}:`, error.message);
            }
        }
        
        return memories;
    }
    
    /**
     * Extract patterns from memory data
     */
    async extractPatterns(memoryData) {
        const patterns = {
            tool_sequences: [],
            file_clusters: {},
            decision_patterns: [],
            workflow_type: null,
            complexity_indicators: []
        };
        
        // Analyze tool usage patterns
        if (memoryData.toolsUsed && Array.isArray(memoryData.toolsUsed)) {
            patterns.tool_sequences = this.analyzeToolSequences(memoryData.toolsUsed);
        }
        
        // Analyze file access patterns
        if (memoryData.filesAccessed && Array.isArray(memoryData.filesAccessed)) {
            patterns.file_clusters = this.analyzeFileClusters(memoryData.filesAccessed);
        }
        
        // Analyze decision patterns
        if (memoryData.decisions && Array.isArray(memoryData.decisions)) {
            patterns.decision_patterns = this.analyzeDecisionPatterns(memoryData.decisions);
        }
        
        // Detect workflow type
        patterns.workflow_type = this.detectWorkflowType(memoryData);
        
        // Identify complexity indicators
        patterns.complexity_indicators = this.identifyComplexityIndicators(memoryData);
        
        return patterns;
    }
    
    /**
     * Synthesize memory with existing context
     */
    async synthesizeMemory(projectName, newMemory, patterns) {
        // Load recent memories for context
        const recentMemories = await this.retrieveMemories(projectName, { limit: 10 });
        
        // Build synthesis
        const synthesis = {
            primary_focus: this.determinePrimaryFocus(newMemory, recentMemories),
            continuation_from_previous: this.detectContinuation(newMemory, recentMemories),
            accumulated_patterns: this.accumulatePatterns(patterns, recentMemories),
            key_insights: this.extractKeyInsights(newMemory, recentMemories),
            recommended_next_actions: this.generateRecommendations(newMemory, patterns, recentMemories)
        };
        
        return synthesis;
    }
    
    /**
     * Analyze tool sequences
     */
    analyzeToolSequences(tools) {
        const sequences = [];
        for (let i = 0; i < tools.length - 1; i++) {
            const sequence = {
                from: tools[i].tool || tools[i],
                to: tools[i + 1].tool || tools[i + 1],
                pattern: `${tools[i].tool || tools[i]} → ${tools[i + 1].tool || tools[i + 1]}`
            };
            sequences.push(sequence);
        }
        return sequences;
    }
    
    /**
     * Analyze file clusters
     */
    analyzeFileClusters(files) {
        const clusters = {};
        files.forEach(file => {
            const filePath = file.path || file;
            const dir = path.dirname(filePath);
            if (!clusters[dir]) {
                clusters[dir] = [];
            }
            clusters[dir].push(path.basename(filePath));
        });
        return clusters;
    }
    
    /**
     * Analyze decision patterns
     */
    analyzeDecisionPatterns(decisions) {
        return decisions.map(d => ({
            decision: d.decision || d,
            timestamp: d.timestamp || new Date().toISOString(),
            type: this.classifyDecision(d.decision || d)
        }));
    }
    
    /**
     * Detect workflow type
     */
    detectWorkflowType(memoryData) {
        const tools = memoryData.toolsUsed || [];
        const files = memoryData.filesAccessed || [];
        
        if (tools.some(t => (t.tool || t) === 'Bash') && tools.some(t => (t.tool || t) === 'Edit')) {
            return 'deployment';
        } else if (files.length > tools.length * 2) {
            return 'research';
        } else if (tools.filter(t => (t.tool || t) === 'Write' || (t.tool || t) === 'Edit').length > 5) {
            return 'development';
        } else {
            return 'exploration';
        }
    }
    
    /**
     * Identify complexity indicators
     */
    identifyComplexityIndicators(memoryData) {
        const indicators = [];
        
        if ((memoryData.toolsUsed || []).length > 20) {
            indicators.push('high-tool-usage');
        }
        
        if ((memoryData.filesAccessed || []).length > 30) {
            indicators.push('extensive-file-access');
        }
        
        if ((memoryData.decisions || []).length > 5) {
            indicators.push('multiple-decisions');
        }
        
        return indicators;
    }
    
    /**
     * Determine primary focus
     */
    determinePrimaryFocus(newMemory, recentMemories) {
        const toolCount = (newMemory.toolsUsed || []).length;
        const fileCount = (newMemory.filesAccessed || []).length;
        
        if (fileCount > toolCount * 2) {
            return 'File Analysis and Review';
        } else if (toolCount > 10) {
            return 'Active Development';
        } else {
            return 'Research and Discovery';
        }
    }
    
    /**
     * Detect continuation from previous session
     */
    detectContinuation(newMemory, recentMemories) {
        if (recentMemories.length === 0) {
            return false;
        }
        
        const lastMemory = recentMemories[recentMemories.length - 1];
        
        // Check for file overlap
        const newFiles = new Set((newMemory.filesAccessed || []).map(f => f.path || f));
        const lastFiles = new Set((lastMemory.data?.filesAccessed || []).map(f => f.path || f));
        
        const overlap = [...newFiles].filter(f => lastFiles.has(f));
        
        return overlap.length > 0;
    }
    
    /**
     * Accumulate patterns across sessions
     */
    accumulatePatterns(newPatterns, recentMemories) {
        const accumulated = {
            common_sequences: new Map(),
            frequent_files: new Map(),
            recurring_decisions: []
        };
        
        // Count pattern frequencies
        recentMemories.forEach(memory => {
            if (memory.patterns?.tool_sequences) {
                memory.patterns.tool_sequences.forEach(seq => {
                    const key = seq.pattern || seq;
                    accumulated.common_sequences.set(key, 
                        (accumulated.common_sequences.get(key) || 0) + 1);
                });
            }
        });
        
        // Add new patterns
        newPatterns.tool_sequences.forEach(seq => {
            const key = seq.pattern || seq;
            accumulated.common_sequences.set(key, 
                (accumulated.common_sequences.get(key) || 0) + 1);
        });
        
        return {
            common_sequences: Array.from(accumulated.common_sequences.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([pattern, count]) => ({ pattern, count })),
            frequent_files: Array.from(accumulated.frequent_files.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10),
            recurring_decisions: accumulated.recurring_decisions
        };
    }
    
    /**
     * Extract key insights
     */
    extractKeyInsights(newMemory, recentMemories) {
        const insights = [];
        
        // Insight from current session
        if ((newMemory.insights || []).length > 0) {
            insights.push(...newMemory.insights.slice(0, 3));
        }
        
        // Pattern-based insights
        if ((newMemory.toolsUsed || []).length > 20) {
            insights.push('High activity session with extensive tool usage');
        }
        
        if ((newMemory.filesAccessed || []).length > 30) {
            insights.push('Comprehensive file review and analysis performed');
        }
        
        return insights;
    }
    
    /**
     * Generate recommendations
     */
    generateRecommendations(newMemory, patterns, recentMemories) {
        const recommendations = [];
        
        // Based on workflow type
        if (patterns.workflow_type === 'development') {
            recommendations.push('Consider running tests for recent changes');
            recommendations.push('Review modified files for consistency');
        } else if (patterns.workflow_type === 'research') {
            recommendations.push('Document findings from file analysis');
            recommendations.push('Consider creating summary of discoveries');
        }
        
        // Based on patterns
        if (patterns.tool_sequences.length > 10) {
            recommendations.push('Complex workflow detected - consider breaking into smaller tasks');
        }
        
        return recommendations;
    }
    
    /**
     * Store patterns for quick retrieval
     */
    async storePatterns(projectName, patterns) {
        const patternPath = path.join(this.patternsPath, projectName, 'patterns.json');
        fs.mkdirSync(path.dirname(patternPath), { recursive: true });
        
        let existingPatterns = {};
        if (fs.existsSync(patternPath)) {
            existingPatterns = JSON.parse(fs.readFileSync(patternPath, 'utf8'));
        }
        
        // Merge patterns
        const mergedPatterns = {
            ...existingPatterns,
            lastUpdate: new Date().toISOString(),
            sequences: [...(existingPatterns.sequences || []), ...patterns.tool_sequences],
            clusters: { ...existingPatterns.clusters, ...patterns.file_clusters },
            workflows: [...(existingPatterns.workflows || []), patterns.workflow_type]
        };
        
        fs.writeFileSync(patternPath, JSON.stringify(mergedPatterns, null, 2));
    }
    
    /**
     * Generate cryptographically secure memory ID
     */
    generateMemoryId(projectName, sessionId) {
        // Generate cryptographically secure random bytes
        const randomBytes = crypto.randomBytes(32);
        const timestamp = Date.now().toString();
        
        const hash = crypto.createHash('sha256');
        hash.update(randomBytes);
        hash.update(`${projectName}-${sessionId}-${timestamp}`);
        hash.update(crypto.randomBytes(16)); // Additional entropy
        
        return hash.digest('hex').substring(0, 32); // Increased length for security
    }
    
    /**
     * Load memory index
     */
    loadMemoryIndex() {
        const indexPath = path.join(this.memoryBasePath, 'index.json');
        if (fs.existsSync(indexPath)) {
            const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
            Object.entries(index).forEach(([id, data]) => {
                this.memoryIndex.set(id, data);
            });
        }
    }
    
    /**
     * Save memory index
     */
    saveMemoryIndex() {
        const indexPath = path.join(this.memoryBasePath, 'index.json');
        const index = Object.fromEntries(this.memoryIndex);
        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    }
    
    /**
     * Classify decision type
     */
    classifyDecision(decision) {
        if (decision.includes('switch') || decision.includes('change')) {
            return 'transition';
        } else if (decision.includes('create') || decision.includes('new')) {
            return 'creation';
        } else if (decision.includes('fix') || decision.includes('debug')) {
            return 'correction';
        } else {
            return 'general';
        }
    }
    
    /**
     * Get memory statistics
     */
    getMemoryStatistics(projectName) {
        const projectMemories = Array.from(this.memoryIndex.values())
            .filter(m => m.project === projectName);
        
        return {
            total_memories: projectMemories.length,
            projects: [...new Set(Array.from(this.memoryIndex.values()).map(m => m.project))],
            oldest: projectMemories.reduce((oldest, m) => 
                !oldest || new Date(m.timestamp) < new Date(oldest) ? m.timestamp : oldest, null),
            newest: projectMemories.reduce((newest, m) => 
                !newest || new Date(m.timestamp) > new Date(newest) ? m.timestamp : newest, null)
        };
    }

    /**
     * Generate encryption key from project and session context
     */
    generateEncryptionKey(projectName, sessionId) {
        // Use project name and system info to generate consistent key
        const keyMaterial = `${projectName}-${process.env.HOME}-${process.platform}`;
        return crypto.scryptSync(keyMaterial, 'salt', 32);
    }
    
    /**
     * Encrypt sensitive data using AES-256-GCM
     */
    encryptSensitiveData(memoryData) {
        const key = this.generateEncryptionKey(memoryData.project, memoryData.session);
        const iv = crypto.randomBytes(16);
        
        // Create cipher
        const cipher = crypto.createCipherGCM('aes-256-gcm', key, iv);
        
        // Encrypt the sensitive data field
        const sensitiveData = JSON.stringify(memoryData.data);
        let encrypted = cipher.update(sensitiveData, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        // Return memory with encrypted data
        return {
            ...memoryData,
            data: {
                encrypted: encrypted,
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex'),
                algorithm: 'aes-256-gcm'
            },
            _encrypted: true
        };
    }
    
    /**
     * Decrypt sensitive data using AES-256-GCM
     */
    decryptSensitiveData(encryptedMemory) {
        if (!encryptedMemory._encrypted) {
            // Not encrypted, return as-is for backwards compatibility
            return encryptedMemory;
        }
        
        const key = this.generateEncryptionKey(encryptedMemory.project, encryptedMemory.session);
        const iv = Buffer.from(encryptedMemory.data.iv, 'hex');
        const authTag = Buffer.from(encryptedMemory.data.authTag, 'hex');
        
        // Create decipher
        const decipher = crypto.createDecipherGCM('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        
        // Decrypt the data
        let decrypted = decipher.update(encryptedMemory.data.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        // Parse and return decrypted memory
        const decryptedData = JSON.parse(decrypted);
        return {
            ...encryptedMemory,
            data: decryptedData,
            _encrypted: false
        };
    }
}

// Export singleton instance
const memoryCloude = new MemoryCloude();

module.exports = { MemoryCloude, memoryCloude };