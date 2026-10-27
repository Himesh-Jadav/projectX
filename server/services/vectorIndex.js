import { config } from '../config.js';

const INDEX_NAME = 'memory_index';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const memoryVectorIndexDefinition = {
  fields: [
    { type: 'vector', path: 'embedding', numDimensions: config.embeddingDims, similarity: 'cosine' },
    { type: 'filter', path: 'userId' },
    { type: 'filter', path: 'projectId' },
    { type: 'filter', path: 'status' },
    { type: 'filter', path: 'type' }
  ]
};

function matchesDefinition(existing) {
  const fields = (existing?.latestDefinition ?? existing?.definition)?.fields;
  if (!Array.isArray(fields) || fields.length !== memoryVectorIndexDefinition.fields.length) return false;
  return memoryVectorIndexDefinition.fields.every((required) => fields.some((field) =>
    field.type === required.type && field.path === required.path &&
    (required.type !== 'vector' || (field.numDimensions === required.numDimensions && field.similarity === required.similarity))
  ));
}

export async function ensureMemoryVectorIndex(collection) {
  let indexes = await collection.listSearchIndexes().toArray();
  let index = indexes.find(({ name }) => name === INDEX_NAME);
  if (!index) {
    await collection.createSearchIndex({ name: INDEX_NAME, type: 'vectorSearch', definition: memoryVectorIndexDefinition });
    console.log(`Created Atlas Vector Search index ${INDEX_NAME}.`);
  } else if (!matchesDefinition(index)) {
    await collection.updateSearchIndex(INDEX_NAME, memoryVectorIndexDefinition);
    console.log(`Updated Atlas Vector Search index ${INDEX_NAME} to match the configured definition.`);
  } else {
    console.log(`Atlas Vector Search index ${INDEX_NAME} already has the configured definition.`);
  }

  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    indexes = await collection.listSearchIndexes().toArray();
    index = indexes.find(({ name }) => name === INDEX_NAME);
    const status = index?.status ?? 'not found';
    console.log(`Vector index ${INDEX_NAME} status: ${status}${index?.queryable === undefined ? '' : `; queryable: ${index.queryable}`}`);
    if (index?.queryable === true || status === 'READY') {
      const legacyIndex = indexes.find(({ name }) => name === 'memory_vector');
      if (legacyIndex) {
        await collection.dropSearchIndex('memory_vector');
        console.log('Dropped obsolete Atlas Vector Search index memory_vector.');
      }
      return;
    }
    await pause(5000);
  }
  throw new Error(`Timed out waiting for Atlas Vector Search index "${INDEX_NAME}" to become queryable.`);
}
