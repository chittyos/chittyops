"use strict";
const crypto = require("node:crypto");

const STATES = Object.freeze(["QUEUED","AUTHORIZED","LEASED","RUNNING","VERIFYING","REPAIRING","AWAITING_REVIEW","BLOCKED","COMPLETE"]);
const NEXT = {
  QUEUED:["AUTHORIZED","BLOCKED"], AUTHORIZED:["LEASED","BLOCKED"],
  LEASED:["RUNNING","BLOCKED"], RUNNING:["VERIFYING","BLOCKED"],
  VERIFYING:["REPAIRING","AWAITING_REVIEW","COMPLETE","BLOCKED"],
  REPAIRING:["RUNNING","BLOCKED"], AWAITING_REVIEW:["COMPLETE","BLOCKED"],
  BLOCKED:["AUTHORIZED"], COMPLETE:[]
};
function createTask({id,repo,branch,headSha,criteria,attemptBudget=5}) {
  if (![id,repo,branch,headSha].every(x=>typeof x==="string"&&x.length>0)) throw Error("missing task identity");
  if (!Array.isArray(criteria)||!criteria.length||criteria.some(x=>typeof x!=="string"||!x)) throw Error("acceptance criteria required");
  if (!Number.isInteger(attemptBudget)||attemptBudget<1||attemptBudget>20) throw Error("invalid attempt budget");
  return {id,repo,branch,headSha,criteria:[...criteria],attemptBudget,attempt:0,state:"QUEUED",version:0,lease:null,evidence:{},lastFailure:null,repeatFailures:0,history:[]};
}
function transition(task,to,{expectedVersion,leaseToken,headSha,evidence={},failureFingerprint,reviewApproved=false,now=Date.now()}={}) {
  if (!STATES.includes(to)||!NEXT[task.state]?.includes(to)) throw Error("invalid transition");
  if (expectedVersion!==task.version) throw Error("stale version");
  if (headSha && headSha!==task.headSha) throw Error("stale head");
  if (task.lease && task.lease.expiresAt<=now && !["BLOCKED"].includes(to)) throw Error("lease expired");
  if (task.lease && leaseToken!==task.lease.token) throw Error("lease mismatch");
  if (to==="COMPLETE") {
    if (task.state==="AWAITING_REVIEW"&&!reviewApproved) throw Error("independent review required");
    if (!task.criteria.every(c=>task.evidence[c]||evidence[c])) throw Error("missing acceptance evidence");
  }
  if (to==="REPAIRING" && task.attempt>=task.attemptBudget) throw Error("attempt budget exhausted");
  const next={...task,version:task.version+1,evidence:{...task.evidence,...evidence},history:[...task.history,{from:task.state,to,at:now}] ,state:to};
  if (to==="REPAIRING") {
    if (!failureFingerprint) throw Error("failure fingerprint required");
    next.repeatFailures=failureFingerprint===task.lastFailure?task.repeatFailures+1:1;
    if (next.repeatFailures>=2) throw Error("identical failure repeated; block task");
    next.lastFailure=failureFingerprint;
    next.attempt=task.attempt+1;
  }
  if (to==="BLOCKED"||to==="COMPLETE") next.lease=null;
  return next;
}
function lease(task,{owner,ttlMs=300000,now=Date.now(),expectedVersion}={}) {
  if(task.state!=="AUTHORIZED"||task.version!==expectedVersion) throw Error("not leaseable");
  if(typeof owner!=="string"||!owner||!Number.isInteger(ttlMs)||ttlMs<1000||ttlMs>3600000) throw Error("invalid lease");
  const token=crypto.randomUUID();
  return {...task,state:"LEASED",version:task.version+1,lease:{owner,token,expiresAt:now+ttlMs},history:[...task.history,{from:"AUTHORIZED",to:"LEASED",at:now}]};
}
module.exports={createTask,transition,lease,STATES};
