/**
 * Node-side MSW server used by the jsdom Vitest project.
 *
 * Component tests run in jsdom but fetch goes through Node's runtime,
 * so we use the Node MSW server (not the browser worker).
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
