import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const checks = [];
const check = (name, ok, detail='') => checks.push({ name, ok, detail });

const app = read('src/App.tsx');
const authApi = read('src/api/authApi.ts');
const http = read('src/api/httpClient.ts');
const server = read('server.ts');
const db = read('src/server/database.ts');
const types = read('src/types.ts');
const appData = read('src/data/appData.ts');
const migration = read('db/migrations/010_architecture25_membership_license.sql');
const securityModal = read('src/components/modals/SecurityVerificationModal.tsx');

check('dashboard is not gated by paid-user OTP', !app.includes('isUser1Paid') && !app.includes('<LoginVerificationModal'), 'Google/Firebase login opens the dashboard without a paid-user OTP gate.');
check('on-demand security modal exists', app.includes('SecurityVerificationModal') && securityModal.includes('Verifikasi Keamanan'), 'Protected actions can request a 24h elevated security session.');
check('security elevation 403 opens global modal', http.includes('SESSION_ELEVATION_REQUIRED') && http.includes('gain:security-elevation-required'), 'The common HTTP client translates SESSION_ELEVATION_REQUIRED into a UI event.');
check('explicit license entitlement exists', types.includes('licenseStatus') && appData.includes("licenseStatus: 'none'"), 'License status is a first-class client state.');
check('new member starts unlicensed', appData.includes('maxActiveBots: 0') && !appData.includes("licenseTier: 'starter_6'"), 'Initial client state does not invent a paid license before the server read model loads.');
check('explicit member lifecycle exists', types.includes('memberStatus') && db.includes('member_status'), 'Member lifecycle is distinct from license state.');
check('server license gate exists', server.includes('requireActiveLicense') && server.includes("LICENSE_REQUIRED"), 'Paid/live routes require an active license server-side.');
check('server member lifecycle gate exists', server.includes('requireActiveMember') && server.includes('MEMBER_SUSPENDED') && server.includes('MEMBER_CLOSED'), 'Suspended/closed members are rejected server-side.');
check('durable security session exists', server.includes('auth_session_elevations') && server.includes('gain_session_elevation'), '24h security sessions survive Redis restart via PostgreSQL.');
check('legacy OTP aliases remain available', server.includes("app.post('/api/auth/send-login-code', handleSecuritySendCode)") && server.includes("app.post('/api/auth/verify-login-code', handleSecurityVerifyCode)") && server.includes("app.get('/api/auth/session-status', handleSecuritySessionStatus)"), 'Old clients remain compatible during rollout.');
check('architecture DB migration exists', migration.includes('users_status_architecture25_chk') && migration.includes('licenses_status_architecture25_chk'), 'Member/license status domains are hardened at the DB layer.');
check('TOTP remains separate', server.includes('TRADE_2FA_REQUIRED') && server.includes('WITHDRAW_2FA_REQUIRED'), 'TOTP remains the high-risk transaction factor.');
check('live order checks security and license', server.includes('await requireSecuritySession(req, identity.uid);') && server.includes('if (!effectiveSandbox) await requireActiveLicense(identity.uid);'), 'Live order path has independent security-session and license checks.');

const failed = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ architecture25Gate: failed.length === 0, failedCount: failed.length, checks, externalValidationRequired: true }, null, 2));
process.exit(failed.length ? 1 : 0);
