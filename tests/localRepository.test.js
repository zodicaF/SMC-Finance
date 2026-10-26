import { IDBFactory } from 'fake-indexeddb';
import { createLocalRepository } from '../public/assets/js/data/localRepository.js';
import { runRepositoryContract } from './repositoryContract.js';

// A fresh fake IndexedDB for every test, so tests do not see each other's data.
runRepositoryContract('localRepository (IndexedDB)', () =>
  createLocalRepository({ indexedDB: new IDBFactory(), name: 'test' }),
);
