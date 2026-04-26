import { PrismaClient } from '../lib/src/generated/prisma/client.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding…');

  // A synthetic client used for development. Broad enough to match many real
  // CMA cases so the relevance engine has work to do without a full roster.
  const existing = await prisma.client.findFirst({
    where: { name: 'Acme Industries' },
  });
  const client =
    existing ??
    (await prisma.client.create({
      data: {
        name: 'Acme Industries',
        displayName: 'Acme Industries plc',
        sectorTags: [
          'consumer goods',
          'retail',
          'e-commerce',
          'logistics',
          'food',
          'media',
          'technology',
        ],
        geographies: ['UK', 'EU'],
        confidenceThreshold: 60,
        tonePreference: 'practical, plain, no flattery',
        notes: 'Synthetic seed client — broad to exercise the pipeline.',
      },
    }));

  await prisma.clientProfile.upsert({
    where: { clientId: client.id },
    create: {
      clientId: client.id,
      narrativeMarkdown: `Acme Industries plc is a diversified UK-headquartered consumer-facing
group with operations across retail, e-commerce, logistics, and food. Active
M&A appetite both as bidder and as a target. Past CMA engagement on a Phase 1
merger; experience with consumer-protection enforcement in the digital
marketplace adjacent. Sensitive to Phase 2 references and remedies that
shape downstream-supplier markets.`,
    },
    update: {},
  });

  await prisma.clientContact.deleteMany({ where: { clientId: client.id } });
  await prisma.clientContact.createMany({
    data: [
      {
        clientId: client.id,
        name: 'Sam Carter',
        email: 'sam.carter@example.com',
        role: 'General Counsel',
        isPrimary: true,
        isCc: false,
      },
      {
        clientId: client.id,
        name: 'Alex Reed',
        email: 'alex.reed@example.com',
        role: 'Head of Strategy',
        isPrimary: false,
        isCc: true,
      },
    ],
  });

  await prisma.clientEntity.deleteMany({ where: { clientId: client.id } });
  await prisma.clientEntity.createMany({
    data: [
      { clientId: client.id, kind: 'competitor', value: 'eBay', notes: 'Direct e-com competitor' },
      { clientId: client.id, kind: 'competitor', value: 'Depop' },
      { clientId: client.id, kind: 'watched_theme', value: 'online marketplace' },
      { clientId: client.id, kind: 'watched_theme', value: 'two-sided platform' },
      { clientId: client.id, kind: 'supplier', value: 'GXO' },
      { clientId: client.id, kind: 'supplier', value: 'Wincanton' },
    ],
  });

  await prisma.clientAuthorityInteraction.deleteMany({ where: { clientId: client.id } });
  await prisma.clientAuthorityInteraction.create({
    data: {
      clientId: client.id,
      authority: 'CMA',
      caseRef: 'ME/0000/00',
      year: 2024,
      summary: 'Phase 1 clearance for an Acme bolt-on, no remedies.',
      surfaceInPrompt: true,
    },
  });

  await prisma.clientRelevanceRule.deleteMany({ where: { clientId: client.id } });
  await prisma.clientRelevanceRule.create({
    data: {
      clientId: null,
      scope: 'global',
      rule: 'Pure invitations to comment on cases unrelated to a client product overlap should not be high tier on sector overlap alone.',
      active: true,
    },
  });

  console.log('Seeded client (mine):', client.id);

  // Second client to exercise the relationship-partner-led drafting path.
  const partner = await prisma.client.upsert({
    where: { id: 'seed-partner-led' },
    create: {
      id: 'seed-partner-led',
      name: 'Beacon Capital',
      displayName: 'Beacon Capital LLP',
      sectorTags: ['private equity', 'infrastructure', 'energy', 'logistics'],
      geographies: ['UK', 'EU'],
      confidenceThreshold: 60,
      tonePreference: 'practical, plain, no flattery',
      notes: 'Seed client to exercise relationship-partner-led drafting.',
      ownershipMode: 'relationship_partner',
      relationshipPartnerName: 'Jordan Fielding',
      relationshipPartnerEmail: 'jordan.fielding@cleary-example.com',
      relationshipPartnerFirm: 'Cleary',
      profile: {
        create: {
          narrativeMarkdown: `Beacon Capital LLP is a UK-based private equity sponsor with active
deals in infrastructure, energy transition, and logistics. Active acquirer
of carve-outs and platform investments. Sensitive to Phase 2 references and
state aid clearance timelines.`,
        },
      },
      contacts: {
        create: [
          {
            name: 'Riley Hart',
            email: 'riley.hart@beacon-example.com',
            role: 'Partner',
            isPrimary: true,
            isCc: false,
          },
        ],
      },
      entities: {
        create: [
          { kind: 'watched_theme', value: 'private equity' },
          { kind: 'watched_theme', value: 'infrastructure' },
          { kind: 'watched_theme', value: 'state aid' },
          { kind: 'competitor', value: 'KKR' },
          { kind: 'competitor', value: 'Brookfield' },
        ],
      },
    },
    update: {},
  });
  console.log('Seeded client (partner-led):', partner.id);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
