import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const store = new URL("./session-store.ts", import.meta.url).href;
const refresh = new URL("./refresh.ts", import.meta.url).href;
const slots = new URL("./slots.ts", import.meta.url).href;
const portal = new URL("../../apps/mobile/server/portal.ts", import.meta.url).href;
const key = `portal_${"a".repeat(64)}`;
const harness = `
import assert from 'node:assert/strict';
import {request} from 'playwright';
let cookiesSeen;
request.newContext = async (options) => {
 cookiesSeen = options.storageState.cookies;
 return {
  dispose: async()=>{},
  storageState: async()=>({cookies: cookiesSeen,origins:[]}),
  get: async(path)=>({ok:()=>true,json:async()=>path.includes('unavailable')?{data:[]}:[]}),
 };
};
const {readSessionRecords,writeSessionRecords}=await import(${JSON.stringify(store)});
const {retainRefreshGrant}=await import(${JSON.stringify(refresh)});
const {retainSlotSession}=await import(${JSON.stringify(slots)});
`;
function run(file, code) {
  const child = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--input-type=module", "-e", harness + code],
    {
      env: { ...process.env, INTRA42_SESSION_FILE: file },
      encoding: "utf8",
      timeout: 15000,
    },
  );
  assert.equal(child.status, 0, child.stderr || child.stdout);
  return child.stdout;
}

test("native sessions, rotated refresh tokens, cookies and logout survive full process restarts", () => {
  const directory = mkdtempSync(join(tmpdir(), "intra42-session-test-"));
  const file = join(directory, "sessions.json");
  try {
    run(
      file,
      `
      const grant=await retainRefreshGrant({endpoint:'https://auth.42.fr/auth/realms/students-42/protocol/openid-connect/token',clientId:'fake-client',refreshToken:'initial-test-refresh',expiresIn:3600});
      await retainSlotSession(grant.key,3600,[{name:'test-cookie',value:'test-cookie-value',domain:'profile.intra.42.fr',path:'/',expires:-1,httpOnly:true,secure:true,sameSite:'Lax'}]);
      await writeSessionRecords('native', [{key:${JSON.stringify(key)},access_token:'test-access',expires_in:300,refresh_session:grant.key,userId:42,expiresAt:Date.now()+300000,deadline:Date.now()+3600000}]);
    `,
    );
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(statSync(directory).mode & 0o777, 0o700);
    const saved = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(saved.collections.native.length, 1);
    assert.ok(!readFileSync(file, "utf8").includes('"timer"'));
    run(
      file,
      `
      globalThis.fetch=async(url,options)=>{
        assert.equal(new URL(url).origin,'https://auth.42.fr');
        assert.equal(options.body.get('refresh_token'),'initial-test-refresh');
        return Response.json({access_token:'new-test-access',refresh_token:'rotated-test-refresh',expires_in:300,refresh_expires_in:3600});
      };
      const {handlePortal,portalIdentity}=await import(${JSON.stringify(portal)});
      assert.equal(portalIdentity({headers:{authorization:'Bearer ${key}'}}).id,42);
      async function call(path,method='POST'){
        let output;
        const res={setHeader(){},writeHead(status){this.statusCode=status;return this;},end(body){output={status:this.statusCode,body:JSON.parse(body)};}};
        await handlePortal({url:path,method,headers:{authorization:'Bearer ${key}'},socket:{remoteAddress:'127.0.0.1'}},res,new URL(path,'http://localhost'),()=>{throw Error('No external API reads allowed');});
        return output;
      }
      assert.equal((await call('/session/restore')).body.accessToken,${JSON.stringify(key)});
      assert.equal((await call('/session/refresh')).status,200);
      assert.equal((await call('/api/me/slots?range[begin_at]=2027-01-04T00:00:00.000Z,2027-01-11T00:00:00.000Z','GET')).status,200);
      assert.equal(cookiesSeen[0].value,'test-cookie-value');
    `,
    );
    const rotated = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(rotated.collections.refresh[0].refreshToken, "rotated-test-refresh");
    assert.equal(rotated.collections.native[0].access_token, "new-test-access");
    run(
      file,
      `
      const {handlePortal}=await import(${JSON.stringify(portal)});
      let status;
      await handlePortal({url:'/session/logout',method:'POST',headers:{authorization:'Bearer ${key}'},socket:{remoteAddress:'127.0.0.1'}},{writeHead(value){status=value;return this;},end(){}},new URL('http://localhost/session/logout'),()=>{throw Error('Unexpected API read');});
      assert.equal(status,200);
    `,
    );
    run(
      file,
      `
      const {portalIdentity}=await import(${JSON.stringify(portal)});
      assert.equal(portalIdentity({headers:{authorization:'Bearer ${key}'}}),undefined);
      assert.equal(readSessionRecords('refresh').length,0);
      assert.equal(readSessionRecords('calendar').length,0);
    `,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("expired sessions are not restored and corrupt files fail without printing their contents", () => {
  const directory = mkdtempSync(join(tmpdir(), "intra42-expired-test-"));
  const file = join(directory, "sessions.json");
  try {
    run(
      file,
      `await writeSessionRecords('native',[{key:${JSON.stringify(key)},access_token:'expired',expires_in:300,userId:42,expiresAt:1,deadline:1}]);`,
    );
    run(
      file,
      `const {portalIdentity}=await import(${JSON.stringify(portal)});assert.equal(portalIdentity({headers:{authorization:'Bearer ${key}'}}),undefined);`,
    );
    writeFileSync(file, "private-test-token-invalid-json");
    const child = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--input-type=module",
        "-e",
        `await import(${JSON.stringify(store)});`,
      ],
      { env: { ...process.env, INTRA42_SESSION_FILE: file }, encoding: "utf8" },
    );
    assert.notEqual(child.status, 0);
    assert.ok(!child.stderr.includes("private-test-token"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("concurrent renewal exchanges once, temporary failures preserve the grant, and rejection removes it", () => {
  const directory = mkdtempSync(join(tmpdir(), "intra42-renewal-test-"));
  const file = join(directory, "sessions.json");
  try {
    run(
      file,
      `
      const {refreshSession}=await import(${JSON.stringify(refresh)});
      const grant=await retainRefreshGrant({endpoint:'https://auth.42.fr/auth/realms/students-42/protocol/openid-connect/token',clientId:'fake-client',refreshToken:'initial-test-refresh',expiresIn:3600});
      let requests=0;
      globalThis.fetch=async()=>{
        requests++;
        return Response.json({access_token:'renewed-test-access',refresh_token:'rotated-test-refresh',expires_in:300});
      };
      const tokens=await Promise.all([refreshSession(grant.key),refreshSession(grant.key)]);
      assert.equal(requests,1);
      assert.equal(tokens[0].access_token,'renewed-test-access');
      assert.equal(tokens[1].access_token,tokens[0].access_token);
      assert.equal(readSessionRecords('refresh')[0].refreshToken,'rotated-test-refresh');
      globalThis.fetch=async()=>Response.json({error:'temporarily_unavailable'},{status:400});
      await assert.rejects(refreshSession(grant.key),/Invalid refresh response/);
      assert.equal(readSessionRecords('refresh').length,1);
      globalThis.fetch=async()=>Response.json({error:'invalid_grant'},{status:400});
      assert.equal(await refreshSession(grant.key),null);
      assert.equal(readSessionRecords('refresh').length,0);
    `,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
