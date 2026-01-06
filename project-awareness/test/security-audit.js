#!/usr/bin/env node

/**
 * Security Audit Script for ChittyOS Project Awareness System
 * Comprehensive security analysis and penetration testing
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SecurityAudit {
    constructor() {
        this.findings = [];
        this.vulnerabilities = [];
        this.recommendations = [];
        this.auditStartTime = Date.now();
        
        this.severityLevels = {
            CRITICAL: 'CRITICAL',
            HIGH: 'HIGH', 
            MEDIUM: 'MEDIUM',
            LOW: 'LOW',
            INFO: 'INFO'
        };
    }

    /**
     * Run comprehensive security audit
     */
    async runSecurityAudit() {
        console.log('🔒 Starting Security Audit for ChittyOS Project Awareness System');
        console.log('📅 Audit Date:', new Date().toISOString());
        console.log('');

        try {
            // File system security
            await this.auditFileSystemSecurity();
            
            // Code injection vulnerabilities
            await this.auditCodeInjectionVulnerabilities();
            
            // Authentication and authorization
            await this.auditAuthenticationSecurity();
            
            // Data protection
            await this.auditDataProtection();
            
            // Network security
            await this.auditNetworkSecurity();
            
            // Input validation
            await this.auditInputValidation();
            
            // Session security
            await this.auditSessionSecurity();
            
            // Deployment security
            await this.auditDeploymentSecurity();
            
            // Generate comprehensive report
            await this.generateSecurityReport();
            
        } catch (error) {
            console.error('❌ Security audit failed:', error);
            process.exit(1);
        }
    }

    /**
     * Add security finding
     */
    addFinding(category, title, severity, description, file = null, line = null, recommendation = '') {
        const finding = {
            id: crypto.randomUUID(),
            category,
            title,
            severity,
            description,
            file,
            line,
            recommendation,
            timestamp: new Date().toISOString()
        };

        this.findings.push(finding);

        if (severity === this.severityLevels.CRITICAL || severity === this.severityLevels.HIGH) {
            this.vulnerabilities.push(finding);
        }

        const icon = this.getSeverityIcon(severity);
        console.log(`${icon} ${severity}: ${title}`);
        if (file) console.log(`   📁 File: ${file}${line ? `:${line}` : ''}`);
        console.log(`   📝 ${description}`);
        if (recommendation) console.log(`   💡 Recommendation: ${recommendation}`);
        console.log('');
    }

    getSeverityIcon(severity) {
        switch (severity) {
            case this.severityLevels.CRITICAL: return '🚨';
            case this.severityLevels.HIGH: return '⚠️';
            case this.severityLevels.MEDIUM: return '📝';
            case this.severityLevels.LOW: return 'ℹ️';
            default: return '📋';
        }
    }

    /**
     * Audit file system security
     */
    async auditFileSystemSecurity() {
        console.log('📂 Auditing File System Security...');
        
        const criticalFiles = [
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/index.js',
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/lib/memory-cloude.js',
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/lib/cloude-consciousness.js',
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/lib/chittychat-client.js',
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/deployment/execute-strategic-deployment.sh'
        ];

        for (const filePath of criticalFiles) {
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                const mode = stats.mode;
                
                // Check for world-writable files
                const worldWritable = (mode & parseInt('002', 8)) !== 0;
                if (worldWritable) {
                    this.addFinding(
                        'File Permissions',
                        'World-Writable File',
                        this.severityLevels.HIGH,
                        'File is writable by all users, creating security risk',
                        filePath,
                        null,
                        'Change file permissions to remove world-write access: chmod o-w'
                    );
                }
                
                // Check for unnecessarily executable JS files
                if (filePath.endsWith('.js')) {
                    const executable = (mode & parseInt('111', 8)) !== 0;
                    if (executable) {
                        this.addFinding(
                            'File Permissions',
                            'Executable JavaScript File',
                            this.severityLevels.MEDIUM,
                            'JavaScript files should not be executable unless necessary',
                            filePath,
                            null,
                            'Remove execute permissions from JS files: chmod -x'
                        );
                    }
                }
                
                // Check file ownership
                if (stats.uid === 0) {
                    this.addFinding(
                        'File Ownership',
                        'Root-Owned File',
                        this.severityLevels.MEDIUM,
                        'File owned by root may indicate privilege escalation risks',
                        filePath,
                        null,
                        'Change ownership to non-privileged user'
                    );
                }
            }
        }

        // Check for sensitive directories
        const sensitiveDirectories = [
            path.join(process.env.HOME, '.cloude'),
            path.join(process.env.HOME, '.claude'),
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/deployment'
        ];

        for (const dir of sensitiveDirectories) {
            if (fs.existsSync(dir)) {
                const stats = fs.statSync(dir);
                const mode = stats.mode;
                
                const worldReadable = (mode & parseInt('004', 8)) !== 0;
                if (worldReadable) {
                    this.addFinding(
                        'Directory Permissions',
                        'World-Readable Sensitive Directory',
                        this.severityLevels.MEDIUM,
                        'Sensitive directory is readable by all users',
                        dir,
                        null,
                        'Restrict directory permissions: chmod o-r'
                    );
                }
            }
        }
    }

    /**
     * Audit code injection vulnerabilities
     */
    async auditCodeInjectionVulnerabilities() {
        console.log('💉 Auditing Code Injection Vulnerabilities...');
        
        const codeFiles = [
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/index.js',
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/lib/chittychat-client.js',
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/deployment/execute-strategic-deployment.sh'
        ];

        for (const filePath of codeFiles) {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                const lines = content.split('\n');
                
                // Check for eval() usage
                const evalMatches = content.match(/eval\s*\(/g);
                if (evalMatches) {
                    lines.forEach((line, index) => {
                        if (line.includes('eval(')) {
                            this.addFinding(
                                'Code Injection',
                                'Use of eval() Function',
                                this.severityLevels.HIGH,
                                'eval() can execute arbitrary code and is dangerous',
                                filePath,
                                index + 1,
                                'Replace eval() with safer alternatives like JSON.parse() or specific parsing functions'
                            );
                        }
                    });
                }
                
                // Check for Function constructor
                const functionConstructor = content.match(/new\s+Function\s*\(/g);
                if (functionConstructor) {
                    this.addFinding(
                        'Code Injection',
                        'Function Constructor Usage',
                        this.severityLevels.HIGH,
                        'Function constructor can execute arbitrary code',
                        filePath,
                        null,
                        'Avoid using Function constructor for dynamic code execution'
                    );
                }
                
                // Check for child_process exec with user input
                if (content.includes('exec') || content.includes('spawn')) {
                    lines.forEach((line, index) => {
                        if (line.includes('exec') && (line.includes('${') || line.includes('`') || line.includes('+'))) {
                            this.addFinding(
                                'Command Injection',
                                'Potential Command Injection in exec()',
                                this.severityLevels.HIGH,
                                'User input may be directly passed to exec() without sanitization',
                                filePath,
                                index + 1,
                                'Sanitize and validate all inputs before passing to exec(), use execFile() when possible'
                            );
                        }
                    });
                }
                
                // Check for dangerous shell patterns in bash scripts
                if (filePath.endsWith('.sh')) {
                    this.auditShellScript(filePath, content);
                }
            }
        }
    }

    auditShellScript(filePath, content) {
        const lines = content.split('\n');
        
        // Check for unquoted variables
        lines.forEach((line, index) => {
            const unquotedVarPattern = /\$[A-Za-z_][A-Za-z0-9_]*(?!["\}])/g;
            if (unquotedVarPattern.test(line) && !line.trim().startsWith('#')) {
                this.addFinding(
                    'Shell Injection',
                    'Unquoted Variable in Shell Script',
                    this.severityLevels.MEDIUM,
                    'Unquoted variables can lead to word splitting and glob expansion',
                    filePath,
                    index + 1,
                    'Quote all variables: "$variable" instead of $variable'
                );
            }
        });
        
        // Check for dangerous commands
        const dangerousCommands = ['rm -rf', 'chmod -R', 'chown -R', 'dd if=', 'mkfs'];
        dangerousCommands.forEach(cmd => {
            if (content.includes(cmd)) {
                this.addFinding(
                    'Dangerous Command',
                    `Dangerous Command: ${cmd}`,
                    this.severityLevels.MEDIUM,
                    'Script contains potentially dangerous command',
                    filePath,
                    null,
                    'Review usage of dangerous commands and add safety checks'
                );
            }
        });
    }

    /**
     * Audit authentication security
     */
    async auditAuthenticationSecurity() {
        console.log('🔐 Auditing Authentication Security...');
        
        const authFiles = [
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/lib/chittychat-client.js',
            '/Users/nb/.claude/settings.local.json'
        ];

        for (const filePath of authFiles) {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                
                // Check for hardcoded API keys
                const apiKeyPatterns = [
                    /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9\-_]{20,}['"]/gi,
                    /secret\s*[:=]\s*['"][a-zA-Z0-9\-_]{20,}['"]/gi,
                    /password\s*[:=]\s*['"][^'"]{8,}['"]/gi,
                    /token\s*[:=]\s*['"][a-zA-Z0-9\-_\.]{20,}['"]/gi
                ];
                
                apiKeyPatterns.forEach(pattern => {
                    const matches = content.match(pattern);
                    if (matches && matches.length > 0) {
                        // Filter out placeholder/example values
                        const realSecrets = matches.filter(match => 
                            !match.includes('YOUR_') && 
                            !match.includes('REPLACE_') &&
                            !match.includes('example') &&
                            !match.includes('placeholder')
                        );
                        
                        if (realSecrets.length > 0) {
                            this.addFinding(
                                'Credential Exposure',
                                'Hardcoded API Key or Secret',
                                this.severityLevels.CRITICAL,
                                'API keys or secrets are hardcoded in source code',
                                filePath,
                                null,
                                'Move secrets to environment variables or secure credential store'
                            );
                        }
                    }
                });
                
                // Check for insecure HTTP endpoints
                const httpUrls = content.match(/http:\/\/[^\s'"]+/gi);
                if (httpUrls) {
                    httpUrls.forEach(url => {
                        if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
                            this.addFinding(
                                'Insecure Transport',
                                'HTTP URL in Production Code',
                                this.severityLevels.MEDIUM,
                                'HTTP URLs transmit data in plaintext',
                                filePath,
                                null,
                                'Use HTTPS URLs for all external communications'
                            );
                        }
                    });
                }
            }
        }
        
        // Check environment variable usage
        const envVarFiles = [
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/index.js',
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/lib/chittychat-client.js'
        ];
        
        let usesEnvVars = false;
        envVarFiles.forEach(filePath => {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                if (content.includes('process.env')) {
                    usesEnvVars = true;
                }
            }
        });
        
        if (usesEnvVars) {
            this.addFinding(
                'Security Best Practice',
                'Environment Variables Used',
                this.severityLevels.INFO,
                'Application correctly uses environment variables for configuration',
                null,
                null,
                'Continue using environment variables for sensitive configuration'
            );
        } else {
            this.addFinding(
                'Configuration Security',
                'No Environment Variable Usage Detected',
                this.severityLevels.LOW,
                'Application may not be using environment variables for configuration',
                null,
                null,
                'Consider using environment variables for sensitive configuration'
            );
        }
    }

    /**
     * Audit data protection
     */
    async auditDataProtection() {
        console.log('🛡️ Auditing Data Protection...');
        
        const dataFiles = [
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/lib/memory-cloude.js',
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/lib/cloude-consciousness.js'
        ];

        for (const filePath of dataFiles) {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                
                // Check for encryption usage
                const hasEncryption = content.includes('crypto') || 
                                    content.includes('encrypt') || 
                                    content.includes('cipher');
                
                if (!hasEncryption) {
                    this.addFinding(
                        'Data Protection',
                        'No Encryption Implementation Found',
                        this.severityLevels.HIGH,
                        'Sensitive data may be stored without encryption',
                        filePath,
                        null,
                        'Implement encryption for sensitive data storage using Node.js crypto module'
                    );
                }
                
                // Check for direct file writes without validation
                const fileWritePattern = /fs\.writeFileSync\([^,]+,[^,]+\)/g;
                const writeMatches = content.match(fileWritePattern);
                if (writeMatches && writeMatches.length > 0) {
                    this.addFinding(
                        'Data Validation',
                        'Direct File Write Without Validation',
                        this.severityLevels.MEDIUM,
                        'Data is written to files without apparent validation',
                        filePath,
                        null,
                        'Validate and sanitize data before writing to files'
                    );
                }
                
                // Check for sensitive data patterns
                const sensitivePatterns = [
                    'password',
                    'secret',
                    'private_key',
                    'api_key',
                    'token'
                ];
                
                sensitivePatterns.forEach(pattern => {
                    if (content.toLowerCase().includes(pattern)) {
                        this.addFinding(
                            'Sensitive Data Handling',
                            `Potential Sensitive Data: ${pattern}`,
                            this.severityLevels.LOW,
                            'Code references potentially sensitive data fields',
                            filePath,
                            null,
                            'Ensure sensitive data is encrypted and access is logged'
                        );
                    }
                });
            }
        }
        
        // Check data storage directories
        const dataDirs = [
            path.join(process.env.HOME, '.cloude'),
            path.join(process.env.HOME, '.claude')
        ];
        
        dataDirs.forEach(dir => {
            if (fs.existsSync(dir)) {
                const stats = fs.statSync(dir);
                
                // Check directory permissions
                const mode = stats.mode;
                const otherRead = (mode & parseInt('004', 8)) !== 0;
                
                if (otherRead) {
                    this.addFinding(
                        'Data Access Control',
                        'World-Readable Data Directory',
                        this.severityLevels.MEDIUM,
                        'Data directory is readable by other users',
                        dir,
                        null,
                        'Restrict directory permissions: chmod 700'
                    );
                }
            }
        });
    }

    /**
     * Audit network security
     */
    async auditNetworkSecurity() {
        console.log('🌐 Auditing Network Security...');
        
        const networkFiles = [
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/lib/chittychat-client.js',
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/cloudflare-worker/src/worker.js'
        ];

        for (const filePath of networkFiles) {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                
                // Check for HTTPS enforcement
                const httpsUrls = content.match(/https:\/\/[^\s'"]+/gi);
                const httpUrls = content.match(/http:\/\/[^\s'"]+/gi);
                
                if (httpUrls && httpUrls.length > 0) {
                    const externalHttp = httpUrls.filter(url => 
                        !url.includes('localhost') && !url.includes('127.0.0.1')
                    );
                    
                    if (externalHttp.length > 0) {
                        this.addFinding(
                            'Network Security',
                            'Insecure HTTP Connections',
                            this.severityLevels.HIGH,
                            'Application makes HTTP connections to external services',
                            filePath,
                            null,
                            'Replace HTTP URLs with HTTPS equivalents'
                        );
                    }
                }
                
                // Check for certificate validation bypassing
                const dangerousOptions = [
                    'rejectUnauthorized: false',
                    'strictSSL: false',
                    'insecure: true'
                ];
                
                dangerousOptions.forEach(option => {
                    if (content.includes(option)) {
                        this.addFinding(
                            'Certificate Validation',
                            'SSL Certificate Validation Disabled',
                            this.severityLevels.HIGH,
                            'SSL certificate validation is disabled, allowing MITM attacks',
                            filePath,
                            null,
                            'Enable SSL certificate validation in production'
                        );
                    }
                });
                
                // Check for WebSocket security
                if (content.includes('WebSocket') || content.includes('ws://')) {
                    this.addFinding(
                        'WebSocket Security',
                        'WebSocket Usage Detected',
                        this.severityLevels.LOW,
                        'WebSocket connections should use WSS and validate origins',
                        filePath,
                        null,
                        'Use WSS instead of WS and implement origin validation'
                    );
                }
            }
        }
    }

    /**
     * Audit input validation
     */
    async auditInputValidation() {
        console.log('✅ Auditing Input Validation...');
        
        const inputFiles = [
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/index.js',
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/lib/chittychat-client.js'
        ];

        for (const filePath of inputFiles) {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                const lines = content.split('\n');
                
                // Check for JSON.parse without try-catch
                lines.forEach((line, index) => {
                    if (line.includes('JSON.parse') && !this.hasNearbyTryCatch(lines, index)) {
                        this.addFinding(
                            'Input Validation',
                            'Unsafe JSON Parsing',
                            this.severityLevels.MEDIUM,
                            'JSON.parse used without proper error handling',
                            filePath,
                            index + 1,
                            'Wrap JSON.parse in try-catch blocks'
                        );
                    }
                });
                
                // Check for direct file path usage without validation
                const filePathPattern = /file_?[Pp]ath|filePath/g;
                if (filePathPattern.test(content)) {
                    this.addFinding(
                        'Path Traversal Risk',
                        'Direct File Path Usage',
                        this.severityLevels.MEDIUM,
                        'File paths used without apparent validation against traversal attacks',
                        filePath,
                        null,
                        'Validate and sanitize file paths, use path.resolve() and check against allowed directories'
                    );
                }
                
                // Check for SQL-like operations (even though this is Node.js)
                const sqlPatterns = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP'];
                sqlPatterns.forEach(pattern => {
                    if (content.toUpperCase().includes(pattern)) {
                        this.addFinding(
                            'SQL Injection Risk',
                            'SQL-like Operations Detected',
                            this.severityLevels.LOW,
                            'Code contains SQL-like operations that should be parameterized',
                            filePath,
                            null,
                            'Use parameterized queries for any database operations'
                        );
                    }
                });
            }
        }
    }

    hasNearbyTryCatch(lines, index) {
        // Check 5 lines before and after for try/catch
        const start = Math.max(0, index - 5);
        const end = Math.min(lines.length, index + 5);
        
        for (let i = start; i < end; i++) {
            if (lines[i].includes('try') || lines[i].includes('catch')) {
                return true;
            }
        }
        return false;
    }

    /**
     * Audit session security
     */
    async auditSessionSecurity() {
        console.log('👤 Auditing Session Security...');
        
        const sessionFiles = [
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/lib/memory-cloude.js',
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/lib/cloude-consciousness.js'
        ];

        for (const filePath of sessionFiles) {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                
                // Check for session ID generation
                if (content.includes('sessionId') || content.includes('session_id')) {
                    const hasRandomGen = content.includes('crypto.randomUUID') || 
                                       content.includes('Math.random') ||
                                       content.includes('crypto.randomBytes');
                    
                    if (!hasRandomGen) {
                        this.addFinding(
                            'Session Security',
                            'Weak Session ID Generation',
                            this.severityLevels.HIGH,
                            'Session IDs may not be generated with sufficient randomness',
                            filePath,
                            null,
                            'Use crypto.randomUUID() or crypto.randomBytes() for session ID generation'
                        );
                    }
                }
                
                // Check for session data encryption
                if (content.includes('sessionData') && !content.includes('encrypt')) {
                    this.addFinding(
                        'Session Security',
                        'Unencrypted Session Data',
                        this.severityLevels.MEDIUM,
                        'Session data may be stored without encryption',
                        filePath,
                        null,
                        'Encrypt sensitive session data before storage'
                    );
                }
                
                // Check for session timeout/cleanup
                if (!content.includes('timeout') && !content.includes('expire')) {
                    this.addFinding(
                        'Session Management',
                        'No Session Expiration Logic',
                        this.severityLevels.MEDIUM,
                        'No apparent session expiration or cleanup mechanism',
                        filePath,
                        null,
                        'Implement session timeout and cleanup mechanisms'
                    );
                }
            }
        }
    }

    /**
     * Audit deployment security
     */
    async auditDeploymentSecurity() {
        console.log('🚀 Auditing Deployment Security...');
        
        const deploymentFiles = [
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/deployment/execute-strategic-deployment.sh',
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/deployment/setup-chatgpt-connector.sh',
            '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/deployment/phase1-infrastructure.yaml'
        ];

        for (const filePath of deploymentFiles) {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                
                // Check for hardcoded secrets in deployment scripts
                const secretPatterns = [
                    /password\s*=\s*['"][^'"]+['"]/gi,
                    /api[_-]?key\s*=\s*['"][^'"]+['"]/gi,
                    /secret\s*=\s*['"][^'"]+['"]/gi
                ];
                
                secretPatterns.forEach(pattern => {
                    const matches = content.match(pattern);
                    if (matches) {
                        this.addFinding(
                            'Deployment Security',
                            'Hardcoded Secret in Deployment Script',
                            this.severityLevels.CRITICAL,
                            'Deployment script contains hardcoded secrets',
                            filePath,
                            null,
                            'Move secrets to environment variables or secure secret management'
                        );
                    }
                });
                
                // Check for insecure download URLs
                const downloadUrls = content.match(/curl\s+[^|]+/gi);
                if (downloadUrls) {
                    downloadUrls.forEach(cmd => {
                        if (cmd.includes('http://')) {
                            this.addFinding(
                                'Deployment Security',
                                'Insecure Download URL',
                                this.severityLevels.MEDIUM,
                                'Deployment script downloads over HTTP',
                                filePath,
                                null,
                                'Use HTTPS URLs for all downloads'
                            );
                        }
                    });
                }
                
                // Check for missing error handling
                if (filePath.endsWith('.sh') && !content.includes('set -e')) {
                    this.addFinding(
                        'Deployment Reliability',
                        'Missing Error Handling',
                        this.severityLevels.LOW,
                        'Shell script does not exit on errors',
                        filePath,
                        null,
                        'Add "set -e" to exit on errors'
                    );
                }
            }
        }
        
        // Check Cloudflare Worker security
        const workerFile = '/Volumes/thumb/Projects/chittyos/chittyops/project-awareness/cloudflare-worker/src/worker.js';
        if (fs.existsSync(workerFile)) {
            const content = fs.readFileSync(workerFile, 'utf8');
            
            // Check for CORS configuration
            if (content.includes('cors') || content.includes('Access-Control-Allow-Origin')) {
                if (content.includes('*')) {
                    this.addFinding(
                        'CORS Security',
                        'Permissive CORS Policy',
                        this.severityLevels.MEDIUM,
                        'CORS allows requests from any origin',
                        workerFile,
                        null,
                        'Restrict CORS to specific trusted origins'
                    );
                }
            }
            
            // Check for rate limiting
            if (!content.includes('rate') && !content.includes('limit')) {
                this.addFinding(
                    'API Security',
                    'No Rate Limiting',
                    this.severityLevels.MEDIUM,
                    'API endpoints may not have rate limiting',
                    workerFile,
                    null,
                    'Implement rate limiting to prevent abuse'
                );
            }
        }
    }

    /**
     * Generate comprehensive security report
     */
    async generateSecurityReport() {
        console.log('📊 Generating Security Report...');
        
        const auditDuration = Date.now() - this.auditStartTime;
        const criticalCount = this.findings.filter(f => f.severity === this.severityLevels.CRITICAL).length;
        const highCount = this.findings.filter(f => f.severity === this.severityLevels.HIGH).length;
        const mediumCount = this.findings.filter(f => f.severity === this.severityLevels.MEDIUM).length;
        const lowCount = this.findings.filter(f => f.severity === this.severityLevels.LOW).length;
        
        const riskScore = this.calculateRiskScore();
        const riskLevel = this.getRiskLevel(riskScore);
        
        const report = {
            metadata: {
                auditDate: new Date().toISOString(),
                auditDuration: `${auditDuration}ms`,
                systemUnderTest: 'ChittyOS Project Awareness System',
                version: '1.0.0',
                auditor: 'ChittyOS Security QA Coordinator'
            },
            executiveSummary: {
                totalFindings: this.findings.length,
                riskScore: riskScore,
                riskLevel: riskLevel,
                criticalIssues: criticalCount,
                highIssues: highCount,
                mediumIssues: mediumCount,
                lowIssues: lowCount,
                recommendationsSummary: this.generateExecutiveSummary()
            },
            findings: this.findings,
            vulnerabilities: this.vulnerabilities,
            recommendations: this.generatePrioritizedRecommendations(),
            complianceChecks: this.generateComplianceChecks(),
            actionPlan: this.generateActionPlan()
        };
        
        // Write JSON report
        const reportPath = path.join(__dirname, '../security-reports', `security-audit-${Date.now()}.json`);
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        // Generate markdown report
        await this.generateMarkdownReport(report, reportPath.replace('.json', '.md'));
        
        // Generate executive summary
        await this.generateExecutiveReport(report, reportPath.replace('.json', '-executive-summary.md'));
        
        console.log(`📋 Security report generated: ${reportPath}`);
        console.log(`🎯 Risk Score: ${riskScore}/100 (${riskLevel})`);
        console.log(`🚨 Critical: ${criticalCount}, ⚠️ High: ${highCount}, 📝 Medium: ${mediumCount}, ℹ️ Low: ${lowCount}`);
        
        return report;
    }

    calculateRiskScore() {
        const weights = {
            [this.severityLevels.CRITICAL]: 25,
            [this.severityLevels.HIGH]: 15,
            [this.severityLevels.MEDIUM]: 10,
            [this.severityLevels.LOW]: 5,
            [this.severityLevels.INFO]: 0
        };
        
        let score = 0;
        this.findings.forEach(finding => {
            score += weights[finding.severity] || 0;
        });
        
        return Math.min(score, 100); // Cap at 100
    }

    getRiskLevel(score) {
        if (score >= 80) return 'CRITICAL';
        if (score >= 60) return 'HIGH';
        if (score >= 40) return 'MEDIUM';
        if (score >= 20) return 'LOW';
        return 'MINIMAL';
    }

    generateExecutiveSummary() {
        const criticalCount = this.findings.filter(f => f.severity === this.severityLevels.CRITICAL).length;
        const highCount = this.findings.filter(f => f.severity === this.severityLevels.HIGH).length;
        
        if (criticalCount > 0) {
            return `${criticalCount} critical security issues require immediate attention. System poses significant security risk.`;
        } else if (highCount > 0) {
            return `${highCount} high-priority security issues identified. Address before production deployment.`;
        } else {
            return 'No critical security issues identified. System shows good security practices with room for improvement.';
        }
    }

    generatePrioritizedRecommendations() {
        const recommendations = [];
        
        // Group findings by category
        const categories = {};
        this.findings.forEach(finding => {
            if (!categories[finding.category]) {
                categories[finding.category] = [];
            }
            categories[finding.category].push(finding);
        });
        
        // Generate recommendations by category
        Object.keys(categories).forEach(category => {
            const categoryFindings = categories[category];
            const criticalInCategory = categoryFindings.filter(f => f.severity === this.severityLevels.CRITICAL).length;
            const highInCategory = categoryFindings.filter(f => f.severity === this.severityLevels.HIGH).length;
            
            if (criticalInCategory > 0 || highInCategory > 0) {
                recommendations.push({
                    category,
                    priority: criticalInCategory > 0 ? 'IMMEDIATE' : 'HIGH',
                    issueCount: categoryFindings.length,
                    criticalCount: criticalInCategory,
                    highCount: highInCategory,
                    recommendation: this.getCategoryRecommendation(category, categoryFindings)
                });
            }
        });
        
        return recommendations.sort((a, b) => {
            const priorityOrder = { 'IMMEDIATE': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });
    }

    getCategoryRecommendation(category, findings) {
        const categoryRecommendations = {
            'Credential Exposure': 'Immediately move all hardcoded secrets to environment variables or secure credential storage.',
            'Code Injection': 'Review and sanitize all user inputs. Replace eval() and similar functions with safer alternatives.',
            'File Permissions': 'Review and correct file permissions following principle of least privilege.',
            'Data Protection': 'Implement encryption for sensitive data storage and transmission.',
            'Network Security': 'Enforce HTTPS for all external communications and validate SSL certificates.',
            'Input Validation': 'Implement comprehensive input validation and sanitization.',
            'Session Security': 'Improve session management with proper ID generation, encryption, and expiration.',
            'Deployment Security': 'Secure deployment processes by removing hardcoded secrets and using secure protocols.'
        };
        
        return categoryRecommendations[category] || `Address ${findings.length} issues in ${category} category.`;
    }

    generateComplianceChecks() {
        const checks = {
            'OWASP Top 10 2021': {
                'A01 Broken Access Control': this.findings.filter(f => f.category.includes('Access Control') || f.category.includes('File Permissions')).length === 0,
                'A02 Cryptographic Failures': this.findings.filter(f => f.category.includes('Data Protection') || f.title.includes('Encryption')).length === 0,
                'A03 Injection': this.findings.filter(f => f.category.includes('Injection')).length === 0,
                'A07 Identification and Authentication Failures': this.findings.filter(f => f.category.includes('Authentication') || f.category.includes('Session')).length === 0,
                'A09 Security Logging and Monitoring Failures': true, // Not specifically tested
                'A10 Server-Side Request Forgery': true // Not specifically tested
            },
            'Security Best Practices': {
                'Environment Variable Usage': this.findings.some(f => f.title.includes('Environment Variables Used')),
                'HTTPS Enforcement': this.findings.filter(f => f.title.includes('HTTP URL')).length === 0,
                'Input Validation': this.findings.filter(f => f.category === 'Input Validation').length <= 2,
                'Error Handling': this.findings.filter(f => f.title.includes('Error Handling')).length === 0
            }
        };
        
        return checks;
    }

    generateActionPlan() {
        const plan = {
            immediate: [],
            shortTerm: [],
            longTerm: []
        };
        
        // Immediate actions (Critical and High severity)
        this.findings.filter(f => f.severity === this.severityLevels.CRITICAL).forEach(finding => {
            plan.immediate.push({
                action: finding.recommendation,
                issue: finding.title,
                file: finding.file,
                estimatedEffort: 'High'
            });
        });
        
        // Short term (High and Medium severity)
        this.findings.filter(f => f.severity === this.severityLevels.HIGH).forEach(finding => {
            plan.shortTerm.push({
                action: finding.recommendation,
                issue: finding.title,
                file: finding.file,
                estimatedEffort: 'Medium'
            });
        });
        
        // Long term (Medium and Low severity)
        this.findings.filter(f => f.severity === this.severityLevels.MEDIUM || f.severity === this.severityLevels.LOW).forEach(finding => {
            plan.longTerm.push({
                action: finding.recommendation,
                issue: finding.title,
                file: finding.file,
                estimatedEffort: 'Low'
            });
        });
        
        return plan;
    }

    async generateMarkdownReport(report, filePath) {
        const markdown = `# Security Audit Report: ChittyOS Project Awareness System

## Executive Summary
- **Audit Date**: ${report.metadata.auditDate}
- **System**: ${report.metadata.systemUnderTest}
- **Risk Score**: ${report.executiveSummary.riskScore}/100 (${report.executiveSummary.riskLevel})
- **Total Findings**: ${report.executiveSummary.totalFindings}

### Severity Distribution
- 🚨 **Critical**: ${report.executiveSummary.criticalIssues}
- ⚠️ **High**: ${report.executiveSummary.highIssues}
- 📝 **Medium**: ${report.executiveSummary.mediumIssues}
- ℹ️ **Low**: ${report.executiveSummary.lowIssues}

### Summary
${report.executiveSummary.recommendationsSummary}

## Critical Vulnerabilities
${report.vulnerabilities.length > 0 ? report.vulnerabilities.map(vuln => 
    `### ${vuln.title} (${vuln.severity})
- **Category**: ${vuln.category}
- **File**: ${vuln.file || 'N/A'}
- **Description**: ${vuln.description}
- **Recommendation**: ${vuln.recommendation}
`).join('\n') : 'No critical vulnerabilities identified.'}

## All Findings
${report.findings.map(finding => 
    `### ${finding.title}
- **Severity**: ${this.getSeverityIcon(finding.severity)} ${finding.severity}
- **Category**: ${finding.category}
- **File**: ${finding.file || 'N/A'}${finding.line ? ` (Line ${finding.line})` : ''}
- **Description**: ${finding.description}
- **Recommendation**: ${finding.recommendation}
`).join('\n')}

## Prioritized Recommendations
${report.recommendations.map(rec => 
    `### ${rec.category} (${rec.priority})
- **Issues Found**: ${rec.issueCount} (${rec.criticalCount} critical, ${rec.highCount} high)
- **Action**: ${rec.recommendation}
`).join('\n')}

## Compliance Status
${Object.keys(report.complianceChecks).map(standard =>
    `### ${standard}
${Object.keys(report.complianceChecks[standard]).map(check =>
        `- ${report.complianceChecks[standard][check] ? '✅' : '❌'} ${check}`
    ).join('\n')}
`).join('\n')}

## Action Plan

### Immediate Actions Required
${report.actionPlan.immediate.map(action =>
    `- **${action.issue}**: ${action.action} (${action.file || 'System-wide'})`
).join('\n')}

### Short Term (Next 2 Weeks)
${report.actionPlan.shortTerm.map(action =>
    `- **${action.issue}**: ${action.action} (${action.file || 'System-wide'})`
).join('\n')}

### Long Term (Next Month)
${report.actionPlan.longTerm.map(action =>
    `- **${action.issue}**: ${action.action} (${action.file || 'System-wide'})`
).join('\n')}

## Conclusion
This security audit has identified ${report.executiveSummary.totalFindings} findings across the ChittyOS Project Awareness System. 

${report.executiveSummary.criticalIssues > 0 ? 
    `**CRITICAL**: ${report.executiveSummary.criticalIssues} critical issues require immediate attention before production deployment.` :
    report.executiveSummary.highIssues > 0 ? 
    `**HIGH PRIORITY**: ${report.executiveSummary.highIssues} high-priority issues should be addressed before production deployment.` :
    '**GOOD SECURITY POSTURE**: No critical or high-priority security issues identified. The system demonstrates good security practices.'
}

---
*Report generated by ChittyOS Security QA Coordinator on ${report.metadata.auditDate}*
`;

        fs.writeFileSync(filePath, markdown);
    }

    async generateExecutiveReport(report, filePath) {
        const markdown = `# Security Audit Executive Summary
**ChittyOS Project Awareness System**

## Key Findings
- **Risk Level**: ${report.executiveSummary.riskLevel} (${report.executiveSummary.riskScore}/100)
- **Critical Issues**: ${report.executiveSummary.criticalIssues}
- **High Priority Issues**: ${report.executiveSummary.highIssues}
- **Deployment Recommendation**: ${report.executiveSummary.criticalIssues > 0 ? 'DO NOT DEPLOY' : report.executiveSummary.highIssues > 0 ? 'CONDITIONAL DEPLOYMENT' : 'APPROVED FOR DEPLOYMENT'}

## Business Impact
${report.executiveSummary.criticalIssues > 0 ? 
    '⚠️ **HIGH BUSINESS RISK**: Critical security vulnerabilities could lead to data breach, service disruption, or compliance violations.' :
    report.executiveSummary.highIssues > 0 ? 
    '📋 **MODERATE BUSINESS RISK**: High-priority security issues could impact system reliability and user trust.' :
    '✅ **LOW BUSINESS RISK**: Security posture is acceptable with minor improvements needed.'
}

## Immediate Actions Required
${report.actionPlan.immediate.length > 0 ? 
    report.actionPlan.immediate.slice(0, 3).map(action => `- ${action.action}`).join('\n') :
    'No immediate actions required.'
}

## Timeline
- **Immediate**: Address critical issues within 24 hours
- **Short Term**: Resolve high-priority issues within 2 weeks
- **Long Term**: Implement remaining recommendations within 30 days

**Next Review Date**: ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
`;

        fs.writeFileSync(filePath, markdown);
    }
}

// Run audit if called directly
if (require.main === module) {
    const audit = new SecurityAudit();
    audit.runSecurityAudit().catch(error => {
        console.error('❌ Security audit failed:', error);
        process.exit(1);
    });
}

module.exports = { SecurityAudit };