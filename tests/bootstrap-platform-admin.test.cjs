const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('scripts/bootstrap-platform-admin.cjs','utf8');
async function run({connectionError=false,existing=false}={}){
 const events=[],errors=[],state={exitCode:0},env={SCHOOLOS_ADMIN_EMAIL:'admin@example.test',SCHOOLOS_ADMIN_FIRST_NAME:'Test',SCHOOLOS_ADMIN_LAST_NAME:'Admin',SCHOOLOS_ADMIN_PASSWORD:'PrivateTest123!'};
 const prisma={$queryRaw:async()=>{events.push('connect');if(connectionError)throw Error('private connection details');},$transaction:async(work,options)=>{events.push('transaction');assert.equal(options.maxWait,15000);assert.equal(options.timeout,30000);await work({$executeRaw:async()=>events.push('lock'),user:{count:async()=>existing?1:0,findUnique:async()=>null,create:async()=>{events.push('create');return {id:'admin-id'};}},auditLog:{create:async()=>events.push('audit')}});},$disconnect:async()=>events.push('disconnect')};
 vm.runInNewContext(source,{require:name=>name==='dotenv/config'?{}:name==='../dist/lib/prisma'?{prisma}:{hashPassword:async()=> 'test-hash'},process:{env,set exitCode(value){state.exitCode=value;}},Buffer,console:{log:()=>{},error:message=>errors.push(message)}});
 for(let n=0;n<20&&!events.includes('disconnect');n++)await new Promise(resolve=>setImmediate(resolve));
 return {events,errors,state,env};
}
test('bootstrap warms the connection and keeps creation plus audit in a bounded transaction',async()=>{const r=await run();assert.deepEqual(r.events,['connect','transaction','lock','create','audit','disconnect']);assert.equal(r.errors.length,0);assert.equal(r.env.SCHOOLOS_ADMIN_PASSWORD,undefined);});
test('bootstrap reports a connection failure without exposing database credentials or creating users',async()=>{const r=await run({connectionError:true});assert.deepEqual(r.events,['connect','disconnect']);assert.match(r.errors[0],/Could not connect/);assert.ok(!r.errors[0].includes('private connection details'));assert.equal(r.state.exitCode,1);});
test('bootstrap still refuses a second active super administrator',async()=>{const r=await run({existing:true});assert.ok(!r.events.includes('create'));assert.match(r.errors[0],/already exists/);assert.equal(r.state.exitCode,1);});
