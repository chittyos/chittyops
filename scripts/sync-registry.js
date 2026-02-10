#!/usr/bin/env node
'use strict';

/**
 * Sync service-registry.yml to registry.chitty.cc
 *
 * Reads the local service registry and pushes active services
 * to the ChittyRegistry API endpoint.
 *
 * Environment:
 *   REGISTRY_URL        - Base URL of the registry (default: https://registry.chitty.cc)
 *   CHITTYCONNECT_TOKEN - Auth token from ChittyConnect
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const https = require('https');
const http = require('http');

const REGISTRY_FILE = path.join(__dirname, '..', 'compliance', 'service-registry.yml');
const REGISTRY_URL = process.env.REGISTRY_URL || 'https://registry.chitty.cc';
const TOKEN = process.env.CHITTYCONNECT_TOKEN;

function loadRegistry() {
  const raw = fs.readFileSync(REGISTRY_FILE, 'utf8');
  return yaml.load(raw);
}

function extractActiveServices(registry) {
  const services = [];

  for (const [orgName, orgData] of Object.entries(registry.organizations || {})) {
    const svcList = orgData.services || orgData.repos || {};
    for (const [name, svc] of Object.entries(svcList)) {
      if (svc.active === false) continue;
      services.push({
        name,
        repo: svc.repo,
        org: orgName,
        tier: svc.tier,
        type: svc.type,
        domain: svc.domain || null,
        territory: svc.territory || 'operations',
        description: svc.description || '',
      });
    }
  }

  return services;
}

function postJSON(url, data, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;

    const body = JSON.stringify(data);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      timeout: 30000,
    };

    const req = transport.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(responseBody) });
        } catch {
          resolve({ status: res.statusCode, body: responseBody });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('Loading service registry...');
  const registry = loadRegistry();

  const services = extractActiveServices(registry);
  console.log(`Found ${services.length} active services`);

  const payload = {
    source: 'chittyops-compliance',
    version: registry.version || '1.0.0',
    timestamp: new Date().toISOString(),
    services,
    metadata: {
      profiles: Object.keys(registry.compliance_profiles || {}),
      organizations: Object.keys(registry.organizations || {}),
    },
  };

  const syncUrl = `${REGISTRY_URL}/api/v1/sync`;
  console.log(`Syncing to ${syncUrl}...`);

  try {
    const result = await postJSON(syncUrl, payload, TOKEN);
    console.log(`Response: ${result.status}`);

    if (result.status >= 200 && result.status < 300) {
      console.log('Sync successful:', JSON.stringify(result.body, null, 2));
    } else if (result.status === 401 || result.status === 403) {
      console.error('Auth failed — check CHITTYCONNECT_TOKEN');
      console.error('Response:', JSON.stringify(result.body));
      process.exit(1);
    } else {
      console.warn(`Unexpected status ${result.status}:`, JSON.stringify(result.body));
      // Don't fail on non-auth errors — registry may be updating
    }
  } catch (err) {
    console.error(`Sync failed: ${err.message}`);
    // Don't fail the workflow on network errors
    console.log('Will retry on next scheduled run');
  }

  console.log('Done');
}

main();
