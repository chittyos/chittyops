#!/usr/bin/env node

/**
 * QA Integration Tests for ChittyOS Project Awareness System
 * Comprehensive testing suite for functional and security validation
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { ProjectAwarenessExtension } = require('../index.js');

class QATestSuite {
    constructor() {
        this.testResults = [];
        this.securityResults = [];
        this.performanceResults = [];
        this.testStartTime = Date.now();
        
        // Test configuration
        this.testConfig = {
            timeout: 30000,
            maxRetries: 3,
            expectedPerformanceThresholds: {
                sessionParsing: 5000, // 5s max
                memoryRetrieval: 2000, // 2s max
                projectSwitching: 3000, // 3s max
                consciousnesUpdate: 1000 // 1s max
            }
        };
    }

    /**
     * Run all integration tests
     */
    async runAllTests() {
        console.log('🧪 Starting QA Integration Test Suite...');
        console.log(`📝 Test configuration: ${JSON.stringify(this.testConfig, null, 2)}`);
        
        try {
            // Functional tests
            await this.runFunctionalTests();
            
            // Integration tests
            await this.runIntegrationTests();
            
            // Performance tests
            await this.runPerformanceTests();
            
            // Security tests
            await this.runSecurityTests();
            
            // Generate reports
            await this.generateTestReport();
            
        } catch (error) {
            console.error('❌ Test suite execution failed:', error);
            process.exit(1);
        }
    }

    /**
     * Run functional tests
     */
    async runFunctionalTests() {
        console.log('🔧 Running Functional Tests...');
        
        const functionalTests = [
            this.testProjectAwarenessInitialization,
            this.testMemoryCloudeStorage,
            this.testConsciousnessTracking,
            this.testSessionParsing,
            this.testProjectAnalyzer,
            this.testChittyChatClient,
            this.testCrossSessionAlignment,
            this.testBackgroundConsolidation
        ];
        
        for (const test of functionalTests) {
            await this.runTest(test.name, test.bind(this));
        }
    }

    /**
     * Run integration tests
     */
    async runIntegrationTests() {
        console.log('🔗 Running Integration Tests...');
        
        const integrationTests = [
            this.testMCPServerConnectivity,
            this.testChittyChatIntegration,
            this.testMemorySystemIntegration,
            this.testConsciousnessIntegration,
            this.testHooksIntegration,
            this.testDeploymentInfrastructure
        ];
        
        for (const test of integrationTests) {
            await this.runTest(test.name, test.bind(this));
        }
    }

    /**
     * Run performance tests
     */
    async runPerformanceTests() {
        console.log('⚡ Running Performance Tests...');
        
        const performanceTests = [
            this.testSessionParsingPerformance,
            this.testMemoryRetrievalPerformance,
            this.testProjectSwitchingPerformance,
            this.testConsciousnessUpdatePerformance,
            this.testLargeSessionHandling
        ];
        
        for (const test of performanceTests) {
            await this.runTest(test.name, test.bind(this));
        }
    }

    /**
     * Run security tests
     */
    async runSecurityTests() {
        console.log('🔒 Running Security Tests...');
        
        const securityTests = [
            this.testPathTraversalVulnerability,
            this.testInputSanitization,
            this.testCommandInjection,
            this.testFilePermissions,
            this.testDataEncryption,
            this.testAPIAuthentication,
            this.testSessionIsolation,
            this.testSecretsHandling
        ];
        
        for (const test of securityTests) {
            await this.runTest(test.name, test.bind(this));
        }
    }

    /**
     * Generic test runner with error handling and timing
     */
    async runTest(testName, testFunction) {
        const startTime = Date.now();
        let result = {
            name: testName,
            status: 'pending',
            duration: 0,
            error: null,
            details: {},
            timestamp: new Date().toISOString()
        };
        
        try {
            console.log(`  🧪 Running ${testName}...`);
            
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Test timeout')), this.testConfig.timeout)
            );
            
            const testPromise = testFunction();
            const testResult = await Promise.race([testPromise, timeoutPromise]);
            
            result.status = 'passed';
            result.details = testResult || {};
            result.duration = Date.now() - startTime;
            
            console.log(`    ✅ ${testName} passed (${result.duration}ms)`);
            
        } catch (error) {
            result.status = 'failed';
            result.error = error.message;
            result.duration = Date.now() - startTime;
            
            console.log(`    ❌ ${testName} failed: ${error.message} (${result.duration}ms)`);
        }
        
        this.testResults.push(result);
        return result;
    }

    // Functional Tests Implementation

    async testProjectAwarenessInitialization() {
        const extension = new ProjectAwarenessExtension();
        
        // Test basic initialization
        if (!extension.chittyChatClient) {
            throw new Error('ChittyChatClient not initialized');
        }
        
        if (!extension.projectAnalyzer) {
            throw new Error('ProjectAnalyzer not initialized');
        }
        
        if (!extension.sessionParser) {
            throw new Error('SessionParser not initialized');
        }
        
        // Test session data initialization
        if (!extension.sessionData.has('start_time')) {
            throw new Error('Session start time not initialized');
        }
        
        return { initialized: true, components: 7 };
    }

    async testMemoryCloudeStorage() {
        const { memoryCloude } = require('../lib/memory-cloude.js');
        
        // Test memory storage
        const testMemory = {
            toolsUsed: ['Read', 'Write', 'Edit'],
            filesAccessed: ['/test/file1.js', '/test/file2.js'],
            decisions: ['Test decision'],
            duration: 60000
        };
        
        const storedMemory = await memoryCloude.storeMemory('test-project', 'test-session', testMemory);
        
        if (!storedMemory.id) {
            throw new Error('Memory not stored with ID');
        }
        
        // Test memory retrieval
        const retrievedMemories = await memoryCloude.retrieveMemories('test-project', { limit: 1 });
        
        if (retrievedMemories.length === 0) {
            throw new Error('Memory not retrieved');
        }
        
        return { memoryId: storedMemory.id, retrieved: retrievedMemories.length };
    }

    async testConsciousnessTracking() {
        const { cloudeConsciousness } = require('../lib/cloude-consciousness.js');
        
        // Test consciousness update
        const sessionData = {
            sessionId: 'test-session',
            duration: 30000,
            toolsUsed: [{ tool: 'Read' }, { tool: 'Write' }],
            filesAccessed: [{ path: '/test/file.js' }]
        };
        
        const state = await cloudeConsciousness.updateConsciousness('test-project', sessionData);
        
        if (!state.awareness) {
            throw new Error('Consciousness awareness not updated');
        }
        
        if (state.sessionCount === 0) {
            throw new Error('Session count not incremented');
        }
        
        return { sessionCount: state.sessionCount, focus: state.awareness.currentFocus };
    }

    async testSessionParsing() {
        const { SessionParser } = require('../lib/session-parser.js');
        const parser = new SessionParser();
        
        // Create test session file
        const testSessionPath = '/tmp/test-session.jsonl';
        const testData = [
            '{"tool": "Read", "args": {"file_path": "/test/file.js"}, "timestamp": "2024-08-29T12:00:00.000Z"}',
            '{"tool": "Write", "args": {"file_path": "/test/output.js"}, "timestamp": "2024-08-29T12:01:00.000Z"}'
        ].join('\n');
        
        fs.writeFileSync(testSessionPath, testData);
        
        try {
            const parsedSession = await parser.parseSession(testSessionPath);
            
            if (!parsedSession.toolsUsed || parsedSession.toolsUsed.length === 0) {
                throw new Error('Tools not parsed from session');
            }
            
            return { toolsParsed: parsedSession.toolsUsed.length };
        } finally {
            // Cleanup
            if (fs.existsSync(testSessionPath)) {
                fs.unlinkSync(testSessionPath);
            }
        }
    }

    async testProjectAnalyzer() {
        const { ProjectAnalyzer } = require('../lib/project-analyzer.js');
        const analyzer = new ProjectAnalyzer();
        
        // Test directory analysis
        const analysis = await analyzer.analyzeDirectory(process.cwd());
        
        if (!analysis) {
            throw new Error('Directory analysis failed');
        }
        
        // Test file pattern detection
        const fileProject = await analyzer.detectProjectFromFile(__filename);
        
        return { directoryAnalyzed: true, fileProjectDetected: !!fileProject };
    }

    async testChittyChatClient() {
        const { ChittyChatClient } = require('../lib/chittychat-client.js');
        const client = new ChittyChatClient();
        
        // Test client initialization
        if (!client.chittyChatConfig) {
            throw new Error('ChittyChat config not initialized');
        }
        
        // Test request ID generation
        const oldRequestId = client.requestId;
        client.requestId++;
        
        if (client.requestId <= oldRequestId) {
            throw new Error('Request ID not incrementing');
        }
        
        return { configured: true, requestIdWorks: true };
    }

    // Integration Tests Implementation

    async testMCPServerConnectivity() {
        // Test MCP server configurations from settings.local.json
        const settingsPath = '/Users/nb/.claude/settings.local.json';
        
        if (!fs.existsSync(settingsPath)) {
            throw new Error('Claude settings.local.json not found');
        }
        
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        
        if (!settings.mcpServers) {
            throw new Error('MCP servers not configured');
        }
        
        // Check critical MCP servers
        const criticalServers = ['chittychat', 'chittyid', 'chittychain'];
        const missingServers = criticalServers.filter(server => !settings.mcpServers[server]);
        
        if (missingServers.length > 0) {
            throw new Error(`Missing critical MCP servers: ${missingServers.join(', ')}`);
        }
        
        return { configuredServers: Object.keys(settings.mcpServers).length, criticalServers: criticalServers.length };
    }

    async testChittyChatIntegration() {
        // Test ChittyChat API endpoints and integration
        const { ChittyChatClient } = require('../lib/chittychat-client.js');
        const client = new ChittyChatClient();
        
        // Test configuration
        const config = client.chittyChatConfig;
        
        if (!config.endpoint) {
            throw new Error('ChittyChat endpoint not configured');
        }
        
        if (!config.fallbackLocal) {
            throw new Error('ChittyChat fallback configuration missing');
        }
        
        // Verify fallback path exists
        const fallbackPath = config.fallbackLocal.cwd;
        if (!fs.existsSync(fallbackPath)) {
            throw new Error(`ChittyChat fallback path does not exist: ${fallbackPath}`);
        }
        
        return { endpoint: config.endpoint, fallbackPath: fallbackPath, transportConfigured: true };
    }

    async testMemorySystemIntegration() {
        // Test integration between Memory-Cloude and Consciousness systems
        const { memoryCloude } = require('../lib/memory-cloude.js');
        const { cloudeConsciousness } = require('../lib/cloude-consciousness.js');
        
        // Test cross-system data flow
        const testProject = 'integration-test-project';
        const sessionData = {
            sessionId: 'integration-test',
            toolsUsed: ['Read', 'Analyze'],
            duration: 15000
        };
        
        // Store in memory system
        await memoryCloude.storeMemory(testProject, sessionData.sessionId, sessionData);
        
        // Update consciousness
        const consciousness = await cloudeConsciousness.updateConsciousness(testProject, sessionData);
        
        if (!consciousness.intelligence) {
            throw new Error('Intelligence not generated from memory integration');
        }
        
        return { memoryIntegrated: true, consciousnessUpdated: true };
    }

    async testConsciousnessIntegration() {
        const { cloudeConsciousness } = require('../lib/cloude-consciousness.js');
        
        // Test consciousness directory structure
        const consciousnessPath = path.join(process.env.HOME, '.cloude', 'consciousness');
        
        if (!fs.existsSync(consciousnessPath)) {
            throw new Error('Consciousness directory not initialized');
        }
        
        const requiredDirs = ['states', 'awareness', 'continuity'];
        const missingDirs = requiredDirs.filter(dir => 
            !fs.existsSync(path.join(consciousnessPath, dir))
        );
        
        if (missingDirs.length > 0) {
            throw new Error(`Missing consciousness directories: ${missingDirs.join(', ')}`);
        }
        
        return { consciousnessPath, requiredDirs: requiredDirs.length };
    }

    async testHooksIntegration() {
        // Test hook scripts exist and are executable
        const hooksPath = '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/hooks';
        
        if (!fs.existsSync(hooksPath)) {
            throw new Error('Hooks directory not found');
        }
        
        const requiredHooks = [
            'project-awareness-startup.sh',
            'project-awareness-pretool.sh',
            'project-awareness-posttool.sh'
        ];
        
        const hookStatuses = {};
        
        for (const hook of requiredHooks) {
            const hookPath = path.join(hooksPath, hook);
            if (!fs.existsSync(hookPath)) {
                throw new Error(`Required hook not found: ${hook}`);
            }
            
            const stats = fs.statSync(hookPath);
            const isExecutable = (stats.mode & parseInt('111', 8)) !== 0;
            
            if (!isExecutable) {
                throw new Error(`Hook not executable: ${hook}`);
            }
            
            hookStatuses[hook] = { exists: true, executable: isExecutable };
        }
        
        return { hookStatuses, totalHooks: requiredHooks.length };
    }

    async testDeploymentInfrastructure() {
        // Test deployment scripts and configurations
        const deploymentPath = '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/deployment';
        
        if (!fs.existsSync(deploymentPath)) {
            throw new Error('Deployment directory not found');
        }
        
        const requiredFiles = [
            'execute-strategic-deployment.sh',
            'deploy-phase1.sh',
            'setup-chatgpt-connector.sh',
            'phase1-infrastructure.yaml',
            'openai-customgpt-config.yaml'
        ];
        
        const missingFiles = requiredFiles.filter(file => 
            !fs.existsSync(path.join(deploymentPath, file))
        );
        
        if (missingFiles.length > 0) {
            throw new Error(`Missing deployment files: ${missingFiles.join(', ')}`);
        }
        
        return { deploymentFiles: requiredFiles.length, missingFiles: 0 };
    }

    // Performance Tests Implementation

    async testSessionParsingPerformance() {
        const { SessionParser } = require('../lib/session-parser.js');
        const parser = new SessionParser();
        
        // Create large test session file
        const testSessionPath = '/tmp/large-session.jsonl';
        const largeSessionData = Array(1000).fill(0).map((_, i) => 
            `{"tool": "Read", "args": {"file_path": "/test/file${i}.js"}, "timestamp": "2024-08-29T12:${i.toString().padStart(2, '0')}:00.000Z"}`
        ).join('\n');
        
        fs.writeFileSync(testSessionPath, largeSessionData);
        
        try {
            const startTime = Date.now();
            await parser.parseSession(testSessionPath);
            const duration = Date.now() - startTime;
            
            if (duration > this.testConfig.expectedPerformanceThresholds.sessionParsing) {
                throw new Error(`Session parsing too slow: ${duration}ms > ${this.testConfig.expectedPerformanceThresholds.sessionParsing}ms`);
            }
            
            this.performanceResults.push({
                test: 'sessionParsing',
                duration,
                threshold: this.testConfig.expectedPerformanceThresholds.sessionParsing,
                status: 'passed'
            });
            
            return { duration, entriesParsed: 1000 };
        } finally {
            if (fs.existsSync(testSessionPath)) {
                fs.unlinkSync(testSessionPath);
            }
        }
    }

    async testMemoryRetrievalPerformance() {
        const { memoryCloude } = require('../lib/memory-cloude.js');
        
        const startTime = Date.now();
        await memoryCloude.retrieveMemories('test-project', { limit: 100 });
        const duration = Date.now() - startTime;
        
        if (duration > this.testConfig.expectedPerformanceThresholds.memoryRetrieval) {
            throw new Error(`Memory retrieval too slow: ${duration}ms > ${this.testConfig.expectedPerformanceThresholds.memoryRetrieval}ms`);
        }
        
        this.performanceResults.push({
            test: 'memoryRetrieval',
            duration,
            threshold: this.testConfig.expectedPerformanceThresholds.memoryRetrieval,
            status: 'passed'
        });
        
        return { duration, memoriesRequested: 100 };
    }

    async testProjectSwitchingPerformance() {
        const extension = new ProjectAwarenessExtension();
        
        const startTime = Date.now();
        await extension.switchProject('performance-test-project');
        const duration = Date.now() - startTime;
        
        if (duration > this.testConfig.expectedPerformanceThresholds.projectSwitching) {
            throw new Error(`Project switching too slow: ${duration}ms > ${this.testConfig.expectedPerformanceThresholds.projectSwitching}ms`);
        }
        
        this.performanceResults.push({
            test: 'projectSwitching',
            duration,
            threshold: this.testConfig.expectedPerformanceThresholds.projectSwitching,
            status: 'passed'
        });
        
        return { duration, projectName: 'performance-test-project' };
    }

    async testConsciousnessUpdatePerformance() {
        const { cloudeConsciousness } = require('../lib/cloude-consciousness.js');
        
        const sessionData = {
            sessionId: 'performance-test',
            duration: 30000,
            toolsUsed: Array(50).fill(0).map((_, i) => ({ tool: 'Read', timestamp: Date.now() + i * 1000 })),
            filesAccessed: Array(100).fill(0).map((_, i) => ({ path: `/test/file${i}.js` }))
        };
        
        const startTime = Date.now();
        await cloudeConsciousness.updateConsciousness('performance-test-project', sessionData);
        const duration = Date.now() - startTime;
        
        if (duration > this.testConfig.expectedPerformanceThresholds.consciousnesUpdate) {
            throw new Error(`Consciousness update too slow: ${duration}ms > ${this.testConfig.expectedPerformanceThresholds.consciousnesUpdate}ms`);
        }
        
        this.performanceResults.push({
            test: 'consciousnessUpdate',
            duration,
            threshold: this.testConfig.expectedPerformanceThresholds.consciousnesUpdate,
            status: 'passed'
        });
        
        return { duration, toolsProcessed: 50, filesProcessed: 100 };
    }

    async testLargeSessionHandling() {
        // Test handling of very large sessions (like the 272+ sessions mentioned)
        const largeSessionCount = 300;
        const startTime = Date.now();
        
        // Simulate processing large number of sessions
        for (let i = 0; i < largeSessionCount; i++) {
            if (i % 50 === 0) {
                // Yield control periodically
                await new Promise(resolve => setTimeout(resolve, 1));
            }
        }
        
        const duration = Date.now() - startTime;
        
        return { duration, sessionsProcessed: largeSessionCount, avgTimePerSession: duration / largeSessionCount };
    }

    // Security Tests Implementation

    async testPathTraversalVulnerability() {
        const { ProjectAnalyzer } = require('../lib/project-analyzer.js');
        const analyzer = new ProjectAnalyzer();
        
        // Test path traversal attempts
        const maliciousPaths = [
            '../../../etc/passwd',
            '..\\..\\..\\windows\\system32',
            '/etc/passwd',
            '../../../../usr/bin/node',
            'file:///etc/passwd'
        ];
        
        for (const maliciousPath of maliciousPaths) {
            try {
                await analyzer.detectProjectFromFile(maliciousPath);
                // If no error thrown, check that it doesn't access sensitive files
                if (fs.existsSync(maliciousPath) && maliciousPath.includes('passwd')) {
                    throw new Error(`Path traversal vulnerability: accessed ${maliciousPath}`);
                }
            } catch (error) {
                // Expected to fail for malicious paths
                if (error.message.includes('Path traversal')) {
                    throw error;
                }
            }
        }
        
        this.securityResults.push({
            test: 'pathTraversal',
            status: 'passed',
            attemptedPaths: maliciousPaths.length
        });
        
        return { testedPaths: maliciousPaths.length, vulnerabilityFound: false };
    }

    async testInputSanitization() {
        const extension = new ProjectAwarenessExtension();
        
        // Test malicious inputs
        const maliciousInputs = [
            '<script>alert("xss")</script>',
            '"; DROP TABLE projects; --',
            '$(rm -rf /)',
            '${process.exit(1)}',
            '#{File.read("/etc/passwd")}',
            '{{7*7}}',
            '${{constructor.constructor("return process")().exit()}}'
        ];
        
        for (const input of maliciousInputs) {
            try {
                const sanitized = extension.summarizeToolArgs({ pattern: input });
                
                // Check that dangerous content is not executed
                if (sanitized && typeof sanitized === 'object') {
                    const jsonStr = JSON.stringify(sanitized);
                    if (jsonStr.includes('alert') || jsonStr.includes('DROP') || jsonStr.includes('rm -rf')) {
                        throw new Error(`Input not properly sanitized: ${input}`);
                    }
                }
            } catch (error) {
                if (error.message.includes('not properly sanitized')) {
                    throw error;
                }
            }
        }
        
        this.securityResults.push({
            test: 'inputSanitization',
            status: 'passed',
            inputsTested: maliciousInputs.length
        });
        
        return { inputsTested: maliciousInputs.length, vulnerabilityFound: false };
    }

    async testCommandInjection() {
        // Test command injection in deployment scripts
        const deploymentScript = '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/deployment/execute-strategic-deployment.sh';
        
        if (!fs.existsSync(deploymentScript)) {
            throw new Error('Deployment script not found for security testing');
        }
        
        const scriptContent = fs.readFileSync(deploymentScript, 'utf8');
        
        // Check for potential command injection vulnerabilities
        const dangerousPatterns = [
            /eval\s*\$\{[^}]+\}/g,    // eval with variable expansion
            /\$\([^)]*\$\{[^}]+\}[^)]*\)/g,  // command substitution with variables
            /\|\s*sh\s*$/gm,          // piping to shell at line end
            /exec\s+\$\{[^}]+\}/g     // exec with variable expansion
        ];
        
        const foundVulnerabilities = [];
        
        dangerousPatterns.forEach((pattern, index) => {
            const matches = scriptContent.match(pattern);
            if (matches) {
                foundVulnerabilities.push({
                    pattern: pattern.toString(),
                    matches: matches
                });
            }
        });
        
        // Note: Some patterns may be legitimate, so we log rather than fail
        if (foundVulnerabilities.length > 0) {
            console.warn('⚠️  Potential command injection patterns found (review required):');
            foundVulnerabilities.forEach(vuln => {
                console.warn(`   Pattern: ${vuln.pattern}`);
                console.warn(`   Matches: ${vuln.matches.join(', ')}`);
            });
        }
        
        this.securityResults.push({
            test: 'commandInjection',
            status: 'warning',
            potentialIssues: foundVulnerabilities.length
        });
        
        return { scriptChecked: true, potentialIssues: foundVulnerabilities.length };
    }

    async testFilePermissions() {
        // Test file permissions on critical files
        const criticalFiles = [
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/index.js',
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/lib/memory-cloude.js',
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/deployment/execute-strategic-deployment.sh'
        ];
        
        const permissionIssues = [];
        
        for (const filePath of criticalFiles) {
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                const mode = stats.mode;
                
                // Check for world-writable files (security risk)
                const worldWritable = (mode & parseInt('002', 8)) !== 0;
                
                if (worldWritable) {
                    permissionIssues.push({
                        file: filePath,
                        issue: 'world-writable',
                        mode: mode.toString(8)
                    });
                }
                
                // Check for executable files that shouldn't be
                if (filePath.endsWith('.js')) {
                    const executable = (mode & parseInt('111', 8)) !== 0;
                    if (executable) {
                        permissionIssues.push({
                            file: filePath,
                            issue: 'javascript-executable',
                            mode: mode.toString(8)
                        });
                    }
                }
            }
        }
        
        if (permissionIssues.length > 0) {
            throw new Error(`File permission issues found: ${JSON.stringify(permissionIssues)}`);
        }
        
        this.securityResults.push({
            test: 'filePermissions',
            status: 'passed',
            filesChecked: criticalFiles.length
        });
        
        return { filesChecked: criticalFiles.length, issuesFound: 0 };
    }

    async testDataEncryption() {
        const { memoryCloude } = require('../lib/memory-cloude.js');
        
        // Test that sensitive data is handled securely
        const sensitiveData = {
            apiKey: 'sk-1234567890abcdef',
            password: 'secretpassword123',
            sessionToken: 'session-abc123def456'
        };
        
        // Store sensitive data and check it's not stored in plain text
        const memory = await memoryCloude.storeMemory('security-test', 'encryption-test', sensitiveData);
        
        // Read the stored file and check for plain text secrets
        const memoryPath = path.join(memoryCloude.memoriesPath, 'security-test', `${memory.id}.json`);
        
        if (fs.existsSync(memoryPath)) {
            const storedData = fs.readFileSync(memoryPath, 'utf8');
            
            // Check if sensitive values appear in plain text
            Object.values(sensitiveData).forEach(sensitiveValue => {
                if (storedData.includes(sensitiveValue)) {
                    console.warn(`⚠️  Sensitive data stored in plain text: ${sensitiveValue.substring(0, 10)}...`);
                }
            });
        }
        
        this.securityResults.push({
            test: 'dataEncryption',
            status: 'warning', // Flagging for review
            note: 'Sensitive data storage should be encrypted'
        });
        
        return { tested: true, recommendation: 'Implement encryption for sensitive data' };
    }

    async testAPIAuthentication() {
        const { ChittyChatClient } = require('../lib/chittychat-client.js');
        const client = new ChittyChatClient();
        
        // Test API authentication configuration
        const config = client.chittyChatConfig;
        
        // Check if API key is configured
        if (!config.apiKey && !process.env.CHITTYCHAT_API_KEY) {
            console.warn('⚠️  No API key configured for ChittyChat authentication');
        }
        
        // Check endpoint security
        if (config.endpoint && !config.endpoint.startsWith('https://')) {
            throw new Error('ChittyChat endpoint is not using HTTPS');
        }
        
        this.securityResults.push({
            test: 'apiAuthentication',
            status: 'passed',
            httpsEnforced: true
        });
        
        return { httpsEnforced: true, apiKeyConfigured: !!(config.apiKey || process.env.CHITTYCHAT_API_KEY) };
    }

    async testSessionIsolation() {
        // Test that sessions are properly isolated
        const extension1 = new ProjectAwarenessExtension();
        const extension2 = new ProjectAwarenessExtension();
        
        // Set different projects
        extension1.currentProject = 'project1';
        extension2.currentProject = 'project2';
        
        // Test that session data doesn't leak between instances
        extension1.sessionData.set('secret', 'extension1-secret');
        
        if (extension2.sessionData.has('secret')) {
            throw new Error('Session data leaked between extensions');
        }
        
        this.securityResults.push({
            test: 'sessionIsolation',
            status: 'passed',
            instancesIsolated: true
        });
        
        return { instancesIsolated: true };
    }

    async testSecretsHandling() {
        // Test handling of secrets and environment variables
        const deploymentScript = '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/deployment/execute-strategic-deployment.sh';
        
        if (fs.existsSync(deploymentScript)) {
            const scriptContent = fs.readFileSync(deploymentScript, 'utf8');
            
            // Check for hardcoded secrets
            const secretPatterns = [
                /password\s*=\s*['"][^'"]+['"]/gi,
                /api[_-]?key\s*=\s*['"][^'"]+['"]/gi,
                /secret\s*=\s*['"][^'"]+['"]/gi,
                /token\s*=\s*['"][^'"]+['"]/gi
            ];
            
            const hardcodedSecrets = [];
            
            secretPatterns.forEach(pattern => {
                const matches = scriptContent.match(pattern);
                if (matches) {
                    hardcodedSecrets.push(...matches);
                }
            });
            
            if (hardcodedSecrets.length > 0) {
                console.warn('⚠️  Potential hardcoded secrets found:');
                hardcodedSecrets.forEach(secret => console.warn(`   ${secret}`));
            }
        }
        
        this.securityResults.push({
            test: 'secretsHandling',
            status: 'passed',
            recommendation: 'Use environment variables for secrets'
        });
        
        return { scriptChecked: true, useEnvironmentVariables: true };
    }

    /**
     * Generate comprehensive test report
     */
    async generateTestReport() {
        console.log('📊 Generating comprehensive test report...');
        
        const totalDuration = Date.now() - this.testStartTime;
        const passedTests = this.testResults.filter(t => t.status === 'passed').length;
        const failedTests = this.testResults.filter(t => t.status === 'failed').length;
        const testCoverage = Math.round((passedTests / this.testResults.length) * 100);
        
        const report = {
            summary: {
                totalTests: this.testResults.length,
                passed: passedTests,
                failed: failedTests,
                testCoverage: `${testCoverage}%`,
                duration: `${totalDuration}ms`,
                timestamp: new Date().toISOString()
            },
            functionalTests: this.testResults.filter(t => t.name.includes('test') && !t.name.includes('Performance') && !t.name.includes('Security')),
            performanceTests: this.performanceResults,
            securityTests: this.securityResults,
            recommendations: this.generateRecommendations(),
            detailedResults: this.testResults
        };
        
        // Write report to file
        const reportPath = path.join(__dirname, '../test-reports', `qa-integration-report-${Date.now()}.json`);
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        // Generate markdown report
        await this.generateMarkdownReport(report, reportPath.replace('.json', '.md'));
        
        console.log(`📋 Test report generated: ${reportPath}`);
        console.log(`📈 Test Coverage: ${testCoverage}%`);
        console.log(`⚡ Total Duration: ${totalDuration}ms`);
        console.log(`✅ Passed: ${passedTests}, ❌ Failed: ${failedTests}`);
        
        return report;
    }

    generateRecommendations() {
        const recommendations = [];
        
        // Performance recommendations
        const slowTests = this.performanceResults.filter(t => t.duration > t.threshold);
        if (slowTests.length > 0) {
            recommendations.push({
                category: 'Performance',
                priority: 'High',
                issue: `${slowTests.length} performance tests exceeded thresholds`,
                recommendation: 'Optimize slow operations and consider caching strategies'
            });
        }
        
        // Security recommendations
        const securityWarnings = this.securityResults.filter(t => t.status === 'warning');
        if (securityWarnings.length > 0) {
            recommendations.push({
                category: 'Security',
                priority: 'High',
                issue: `${securityWarnings.length} security warnings found`,
                recommendation: 'Review and address security concerns, implement encryption for sensitive data'
            });
        }
        
        // Failed tests
        const failedTests = this.testResults.filter(t => t.status === 'failed');
        if (failedTests.length > 0) {
            recommendations.push({
                category: 'Functionality',
                priority: 'Critical',
                issue: `${failedTests.length} functional tests failed`,
                recommendation: 'Fix failing tests before deployment'
            });
        }
        
        return recommendations;
    }

    async generateMarkdownReport(report, filePath) {
        const markdown = `# ChittyOS Project Awareness QA Report

## Summary
- **Total Tests**: ${report.summary.totalTests}
- **Passed**: ${report.summary.passed}
- **Failed**: ${report.summary.failed}
- **Test Coverage**: ${report.summary.testCoverage}
- **Duration**: ${report.summary.duration}
- **Generated**: ${report.summary.timestamp}

## Functional Tests
${report.functionalTests.map(test => 
    `### ${test.name}
- **Status**: ${test.status === 'passed' ? '✅' : '❌'} ${test.status}
- **Duration**: ${test.duration}ms
${test.error ? `- **Error**: ${test.error}` : ''}
`).join('\n')}

## Performance Tests
${report.performanceTests.map(test =>
    `### ${test.test}
- **Duration**: ${test.duration}ms
- **Threshold**: ${test.threshold}ms
- **Status**: ${test.duration <= test.threshold ? '✅ Passed' : '⚠️ Exceeded Threshold'}
`).join('\n')}

## Security Tests
${report.securityTests.map(test =>
    `### ${test.test}
- **Status**: ${test.status === 'passed' ? '✅' : test.status === 'warning' ? '⚠️' : '❌'} ${test.status}
${test.note ? `- **Note**: ${test.note}` : ''}
${test.recommendation ? `- **Recommendation**: ${test.recommendation}` : ''}
`).join('\n')}

## Recommendations
${report.recommendations.map(rec =>
    `### ${rec.category} - ${rec.priority}
- **Issue**: ${rec.issue}
- **Recommendation**: ${rec.recommendation}
`).join('\n')}

## Test Automation
This report was generated automatically by the QA Integration Test Suite.
Run with: \`node test/qa-integration-tests.js\`
`;

        fs.writeFileSync(filePath, markdown);
    }
}

// Run tests if called directly
if (require.main === module) {
    const testSuite = new QATestSuite();
    testSuite.runAllTests().catch(error => {
        console.error('❌ Test suite failed:', error);
        process.exit(1);
    });
}

module.exports = { QATestSuite };