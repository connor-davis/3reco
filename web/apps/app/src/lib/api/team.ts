import { useResource, useWrite, idPath } from './resource';
import type { BusinessRole, Ok } from './types';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: BusinessRole;
}

export interface TeamInvite {
  id: string;
  email: string;
  role: BusinessRole;
  expires_at: string;
  created_at: string;
}

export interface InvitePreview {
  business_name: string;
  email: string;
  role: BusinessRole;
}

export function useTeam(businessId: string) {
  return useResource<{ members: TeamMember[]; invites: TeamInvite[] }>(
    ['team', businessId],
    '/team',
    true,
    !!businessId
  );
}

export function useInviteMember() {
  return useWrite<{ email: string; role: BusinessRole }, Ok>(
    '/team/invites',
    'POST',
    [['team']]
  );
}

export function useChangeTeamRole() {
  return useWrite<{ id: string; role: BusinessRole }, Ok>(
    ({ id }) => `/team/members/${idPath(id)}`,
    'PATCH',
    [['team'], ['auth']],
    ({ role }) => ({ role })
  );
}

export function useRemoveTeamMember() {
  return useWrite<string, Ok>(
    (id) => `/team/members/${idPath(id)}`,
    'DELETE',
    [['team']],
    () => undefined
  );
}

export function useResendInvite() {
  return useWrite<string, Ok>(
    (id) => `/team/invites/${idPath(id)}/resend`,
    'POST',
    [['team']],
    () => undefined
  );
}

export function useRevokeInvite() {
  return useWrite<string, Ok>(
    (id) => `/team/invites/${idPath(id)}`,
    'DELETE',
    [['team']],
    () => undefined
  );
}

export function useInvitePreview(token?: string) {
  return useResource<InvitePreview>(
    ['invite', token],
    `/auth/invites/${idPath(token ?? '')}`,
    false,
    !!token
  );
}

export function useAcceptInvite() {
  return useWrite<
    {
      token: string;
      name?: string;
      password?: string;
      accepted_terms_version?: string;
    },
    Ok
  >('/auth/invites/accept', 'POST', [['auth'], ['team']]);
}
