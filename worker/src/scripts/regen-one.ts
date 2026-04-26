/**
 * Regenerate one draft by id, using the latest prompts. Useful after a
 * style-guide tweak.
 *
 *   pnpm --filter @bdu/worker run regen-one <draftId>
 */
import { makeAnthropicProvider, prisma } from '@bdu/lib';
import { regenerateDraft } from '../pipeline/regenerate-draft.js';

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error('usage: regen-one <draftId>');
    process.exit(2);
  }
  const model = makeAnthropicProvider();
  await regenerateDraft(id, model);
  console.error(`regenerated ${id}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
