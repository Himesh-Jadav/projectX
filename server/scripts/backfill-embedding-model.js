import { connect, dbClient, memories } from '../db.js';
import { config } from '../config.js';

try {
  await connect();
  let scanned = 0;
  let dimensionMismatches = 0;
  for await (const document of memories.find({}, { projection: { embedding: 1, embeddingModel: 1 } })) {
    scanned += 1;
    const actualDimensions = Array.isArray(document.embedding) ? document.embedding.length : null;
    if (actualDimensions !== config.embeddingDims) {
      dimensionMismatches += 1;
      console.error(`Dimension mismatch: ${document._id} has ${actualDimensions ?? 'no embedding array'} dimensions; expected ${config.embeddingDims}.`);
    }
  }

  const result = await memories.updateMany(
    { $or: [{ embeddingModel: { $exists: false } }, { embeddingModel: null }, { embeddingModel: '' }] },
    { $set: { embeddingModel: config.embeddingModel } }
  );
  console.log(`Scanned ${scanned} memories; backfilled ${result.modifiedCount} embeddingModel value(s) to ${config.embeddingModel}.`);
  console.log(`Found ${dimensionMismatches} vector dimension mismatch(es); these documents need investigation or re-embedding.`);
  if (dimensionMismatches) process.exitCode = 2;
} catch (error) {
  console.error(`Embedding metadata backfill failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await dbClient.close().catch(() => {});
}
