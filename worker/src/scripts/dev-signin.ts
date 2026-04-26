/**
 * Local-dev only: provision an owner User row + an active Session, and print
 * a curl command you can run to set the session cookie in your browser.
 *
 *   pnpm --filter @bdu/worker run dev-signin
 *
 * The session expires in 30 days, matching the production config. This is
 * NEVER deployed — guard with NODE_ENV !== 'production' below.
 */
import { randomBytes } from 'node:crypto';
import { prisma } from '@bdu/lib';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('refusing to run dev-signin in production');
    process.exit(2);
  }
  const email = process.env.OWNER_EMAIL;
  if (!email) {
    console.error('OWNER_EMAIL not set');
    process.exit(2);
  }
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, emailVerified: new Date() },
    update: { emailVerified: new Date() },
  });
  const sessionToken = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { userId: user.id, sessionToken, expires },
  });

  const cookieName = 'authjs.session-token';
  console.log('owner user:', user.id, user.email);
  console.log('session expires:', expires.toISOString());
  console.log();
  console.log('In Chrome DevTools (Application → Cookies → http://localhost:3000):');
  console.log(`  Name : ${cookieName}`);
  console.log(`  Value: ${sessionToken}`);
  console.log(`  Path : /`);
  console.log(`  Expires: ${expires.toUTCString()}`);
  console.log();
  console.log('Or run this curl-and-redirect helper:');
  console.log(`  curl -i 'http://localhost:3000/inbox' \\`);
  console.log(`    -H 'cookie: ${cookieName}=${sessionToken}'`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
