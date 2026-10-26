import { createMemoryRepository } from '../public/assets/js/data/memoryRepository.js';
import { runRepositoryContract } from './repositoryContract.js';

runRepositoryContract('memoryRepository', () => createMemoryRepository());
