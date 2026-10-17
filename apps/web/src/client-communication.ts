import { api, jsonRequest, type ClientProject } from './api.js';

export type NewClientProject = Pick<ClientProject, 'title' | 'client' | 'source' | 'currency'>;
export type CommunicationInput = { projectId: string; newProject: NewClientProject; phone: string; enabled: boolean; progress: boolean; payments: boolean; reminders: boolean };

export function normalizeWhatsAppPhone(value: string): string {
  const phone = value.trim().replace(/^\+/, '').replace(/[\s()-]/g, '').replace(/^08/, '628');
  if (!/^[1-9]\d{7,14}$/.test(phone)) throw new Error('Nomor WhatsApp harus 8–15 digit. Gunakan 08… untuk Indonesia atau kode negara, misalnya +62….');
  return phone;
}

export async function saveClientCommunication(input: CommunicationInput, onCreated: (project: ClientProject) => void): Promise<string> {
  const phone = normalizeWhatsAppPhone(input.phone);
  let projectId = input.projectId;
  if (!projectId) {
    const project = await api<ClientProject>('/work/projects', jsonRequest('POST', { ...input.newProject, deadline: null, value: null }));
    projectId = project.id;
    // Retain the new project before saving its phone so a retry cannot create it twice.
    onCreated(project);
  }
  await api('/operations/clients', jsonRequest('PUT', { projectId, phone, enabled: input.enabled, progress: input.progress, payments: input.payments, reminders: input.reminders }));
  return projectId;
}
