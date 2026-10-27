import { MongoClient } from 'mongodb';
import { config } from './config.js';
import { ensureSchema } from './services/schema.js';

const client = new MongoClient(config.mongodbUri, { serverSelectionTimeoutMS: 15000 });
let connectionPromise;
let collections;

export async function connect() {
  if (!connectionPromise) {
    connectionPromise = client.connect().then(async () => {
      const database = client.db(config.dbName);
      await ensureSchema(database);
      collections = {
        users: database.collection('users'),
        projects: database.collection('projects'),
        memberships: database.collection('memberships'),
        invites: database.collection('invites'),
        memories: database.collection('memories'),
        messages: database.collection('messages'),
        memory_events: database.collection('memory_events')
      };
      return database;
    }).catch((error) => {
      connectionPromise = undefined;
      throw error;
    });
  }
  return connectionPromise;
}

function getCollection(name) {
  if (!collections) throw new Error('Database is not connected. Call connect() first.');
  return collections[name];
}

function collectionProxy(name) {
  return new Proxy({}, { get: (_target, key) => {
    const collection = getCollection(name);
    const value = collection[key];
    return typeof value === 'function' ? value.bind(collection) : value;
  } });
}

export const memories = collectionProxy('memories');
export const users = collectionProxy('users');
export const projects = collectionProxy('projects');
export const memberships = collectionProxy('memberships');
export const invites = collectionProxy('invites');
export const messages = collectionProxy('messages');
export const memory_events = collectionProxy('memory_events');
export const dbClient = client;
