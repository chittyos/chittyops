"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createTask,transition,lease}=require("../ralph-loop/state.js");
const initial=()=>createTask({id:"fixture",repo:"example/private",branch:"fix/test",headSha:"abc",criteria:["ci","adversarial"],attemptBudget:2});
function advance(t,to,extra={}){return transition(t,to,{expectedVersion:t.version,leaseToken:t.lease?.token,...extra});}
test("cannot complete without evidence",()=>{
 let t=initial();t=advance(t,"AUTHORIZED");t=lease(t,{owner:"worker",expectedVersion:t.version});
 t=advance(t,"RUNNING");t=advance(t,"VERIFYING");
 assert.throws(()=>advance(t,"COMPLETE"),/missing acceptance/);
 t=advance(t,"AWAITING_REVIEW",{evidence:{ci:"run:1",adversarial:"report:1"}});
 assert.throws(()=>advance(t,"COMPLETE"),/independent review/);
 assert.equal(advance(t,"COMPLETE",{reviewApproved:true}).state,"COMPLETE");
});
test("stale state and mismatched lease fail closed",()=>{
 let t=advance(initial(),"AUTHORIZED");t=lease(t,{owner:"worker",expectedVersion:t.version});
 assert.throws(()=>transition(t,"RUNNING",{expectedVersion:t.version-1,leaseToken:t.lease.token}),/stale version/);
 assert.throws(()=>transition(t,"RUNNING",{expectedVersion:t.version,leaseToken:"forged"}),/lease mismatch/);
 assert.throws(()=>advance(t,"RUNNING",{headSha:"changed"}),/stale head/);
});
test("repeated failure and bounded attempts stop",()=>{
 let t=advance(initial(),"AUTHORIZED");t=lease(t,{owner:"worker",expectedVersion:t.version});
 t=advance(t,"RUNNING");t=advance(t,"VERIFYING");t=advance(t,"REPAIRING",{failureFingerprint:"test-fail"});
 t=advance(t,"RUNNING");t=advance(t,"VERIFYING");
 assert.throws(()=>advance(t,"REPAIRING",{failureFingerprint:"test-fail"}),/identical failure/);
});
test("expired lease cannot continue and blocking revokes it",()=>{
 let t=advance(initial(),"AUTHORIZED");t=lease(t,{owner:"worker",expectedVersion:t.version,now:100,ttlMs:1000});
 assert.throws(()=>advance(t,"RUNNING",{now:1101}),/lease expired/);
 t=advance(t,"BLOCKED",{now:1101});assert.equal(t.lease,null);
});
