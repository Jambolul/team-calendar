import { getStore, getDeployStore } from '@netlify/blobs';
import { createBlobStorage } from '../../server/blob-storage.js';
import { createHandler } from '../../server/api.js';

export default async function availability(request, context) {
  // Preview deployments never write to the team's production calendar.
  const store = context.deploy.context === 'production'
    ? getStore({ name: 'team-calendar', consistency: 'strong' })
    : getDeployStore({ name: 'team-calendar', consistency: 'strong' });
  return createHandler(createBlobStorage(store))(request);
}

export const config = { path: '/api/availability' };
